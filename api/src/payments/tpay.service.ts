import { Injectable, Logger } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { tpayConfig } from './tpay-config';
import { TPAY_CERT_HOSTS, isTrustedX5u, verifyTpayNotification, TpayVerifyResult } from './tpay-verify';

/** Błąd komunikacji z Tpay — komunikat bez sekretów i bez treści odpowiedzi. */
export class TpayError extends Error {}

export interface TpayTransaction {
  /** identyfikator transakcji w API Tpay */
  transactionId: string;
  /** tytuł transakcji `TR-…` (wraca w powiadomieniu jako `tr_id`) */
  title: string;
  /** adres, na który przekierowujemy gościa */
  paymentUrl: string;
}

/**
 * Wynik zlecenia zwrotu:
 *  - `ok`        — Tpay przyjął zwrot;
 *  - `rejected`  — Tpay na pewno NIE wykonał zwrotu (odmowa z kodem błędu albo żądanie w ogóle nie wyszło);
 *  - `uncertain` — nie wiadomo (przekroczony czas, zerwane połączenie, błąd 5xx): zwrot MÓGŁ zostać wykonany.
 * Żadnych danych płatnika ani pełnej odpowiedzi — tylko status i kody błędów.
 */
export type TpayRefundResult =
  | { outcome: 'ok'; status: string | null; refundId: string | null; httpStatus: number }
  | { outcome: 'rejected'; codes: string[]; httpStatus: number | null }
  | { outcome: 'uncertain'; why: string; httpStatus: number | null };

const HTTP_TIMEOUT_MS = 15_000;
const CERT_TTL_MS = 6 * 60 * 60_000;

/**
 * Klient Tpay (wariant z przekierowaniem): token OAuth trzymany w pamięci do wygaśnięcia,
 * utworzenie transakcji, certyfikaty do weryfikacji powiadomień. Wbudowany `fetch`, bez bibliotek.
 * NIE loguje: sekretów, tokenu, ciała żądań i odpowiedzi, danych płatnika.
 */
@Injectable()
export class TpayService {
  private readonly logger = new Logger('Tpay');
  private token: { value: string; expiresAt: number; key: string } | null = null;
  private tokenInFlight: Promise<string> | null = null;
  private certCache = new Map<string, { pem: string; at: number }>();
  private rootCa: { pem: string; at: number; key: string } | null = null;

  private async http(url: string, init: RequestInit): Promise<Response> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), HTTP_TIMEOUT_MS);
    try {
      return await fetch(url, { ...init, signal: ctrl.signal, redirect: 'error' });
    } catch (e) {
      throw new TpayError((e as Error).name === 'AbortError' ? 'przekroczony czas odpowiedzi' : 'błąd połączenia');
    } finally {
      clearTimeout(timer);
    }
  }

  /** Token dostępu (Bearer). Używany ponownie do wygaśnięcia (z minutą zapasu). */
  private async accessToken(): Promise<string> {
    const cfg = tpayConfig();
    if (!cfg.ready) throw new TpayError('Tpay nieskonfigurowany');
    const key = `${cfg.env}:${cfg.clientId}`;
    if (this.token && this.token.key === key && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    if (!this.tokenInFlight) {
      this.tokenInFlight = (async () => {
        const res = await this.http(`${cfg.apiBase}/oauth/auth`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
          body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret }).toString(),
        });
        if (!res.ok) throw new TpayError(`autoryzacja odrzucona (HTTP ${res.status})`);
        const json = (await res.json().catch(() => null)) as { access_token?: unknown; expires_in?: unknown } | null;
        const value = typeof json?.access_token === 'string' ? json.access_token : '';
        if (!value) throw new TpayError('autoryzacja: brak tokenu w odpowiedzi');
        const ttl = Number(json?.expires_in);
        this.token = { value, key, expiresAt: Date.now() + (Number.isFinite(ttl) && ttl > 0 ? ttl : 600) * 1000 };
        return value;
      })().finally(() => {
        this.tokenInFlight = null;
      });
    }
    return this.tokenInFlight;
  }

  /**
   * Tworzy transakcję (PLN, bez `currency`). Metodę (BLIK / szybki przelew) gość wybiera na stronie
   * Tpay — celowo bez `pay.groupId` i bez `lang`.
   */
  async createTransaction(input: {
    amount: number;
    description: string;
    /** nasz identyfikator próby — wraca w powiadomieniu jako `tr_crc` */
    crc: string;
    payerEmail: string;
    payerName: string;
    successUrl: string;
    errorUrl: string;
  }): Promise<TpayTransaction> {
    const cfg = tpayConfig();
    const body = JSON.stringify({
      amount: Math.round(input.amount * 100) / 100,
      description: input.description.slice(0, 120),
      hiddenDescription: input.crc,
      payer: { email: input.payerEmail, name: input.payerName.slice(0, 100) || input.payerEmail },
      callbacks: {
        notification: { url: cfg.notificationUrl },
        payerUrls: { success: input.successUrl, error: input.errorUrl },
      },
    });
    const send = async () =>
      this.http(`${cfg.apiBase}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${await this.accessToken()}` },
        body,
      });
    let res = await send();
    if (res.status === 401) {
      // Token unieważniony przed czasem — jedna próba z nowym.
      this.token = null;
      res = await send();
    }
    if (!res.ok) throw new TpayError(`utworzenie transakcji odrzucone (HTTP ${res.status})`);
    const json = (await res.json().catch(() => null)) as { transactionId?: unknown; title?: unknown; transactionPaymentUrl?: unknown; result?: unknown } | null;
    const transactionId = typeof json?.transactionId === 'string' ? json.transactionId : '';
    const title = typeof json?.title === 'string' ? json.title : '';
    const paymentUrl = typeof json?.transactionPaymentUrl === 'string' ? json.transactionPaymentUrl : '';
    if (!transactionId || !this.isTpayUrl(paymentUrl)) throw new TpayError('utworzenie transakcji: niepełna odpowiedź');
    return { transactionId, title, paymentUrl };
  }

  /**
   * Zleca zwrot transakcji: `POST /transactions/{transactionId}/refunds`.
   * `transactionId` to identyfikator z API Tpay (zwrócony przy utworzeniu transakcji), NIE tytuł `TR-…`.
   * Bez `amount` → zwrot pełny (puste ciało `{}`); z `amount` → zwrot częściowy.
   * Wysyłane DOKŁADNIE RAZ: nie ponawiamy po błędzie sieci ani po 5xx (zwrot mógł się wykonać).
   * Jedyny wyjątek to 401 (token unieważniony) — wtedy żądanie na pewno nie zostało wykonane.
   */
  async refund(transactionId: string, amount?: number): Promise<TpayRefundResult> {
    const cfg = tpayConfig();
    if (!cfg.ready) return { outcome: 'rejected', codes: ['not_configured'], httpStatus: null };
    if (!/^[A-Za-z0-9_-]{6,64}$/.test(transactionId)) return { outcome: 'rejected', codes: ['bad_transaction_id'], httpStatus: null };
    const body = JSON.stringify(amount === undefined ? {} : { amount: Math.round(amount * 100) / 100 });
    const url = `${cfg.apiBase}/transactions/${encodeURIComponent(transactionId)}/refunds`;
    let res: Response | null = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let token: string;
      try {
        // Błąd przy pobieraniu tokenu = zlecenie zwrotu nie wyszło.
        token = await this.accessToken();
      } catch {
        return { outcome: 'rejected', codes: ['auth_failed'], httpStatus: null };
      }
      try {
        res = await this.http(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${token}` },
          body,
        });
      } catch (e) {
        return { outcome: 'uncertain', why: e instanceof TpayError ? e.message : 'błąd połączenia', httpStatus: null };
      }
      if (res.status !== 401) break;
      this.token = null;
    }
    if (!res) return { outcome: 'uncertain', why: 'brak odpowiedzi', httpStatus: null };
    const status = res.status;
    type RefundBody = { result?: unknown; status?: unknown; refundId?: unknown; id?: unknown; errors?: unknown };
    const json = (await res.json().catch(() => null)) as RefundBody | null;
    const codes = (Array.isArray(json?.errors) ? (json?.errors as unknown[]) : [])
      .map((e) => String((e as { errorCode?: unknown })?.errorCode ?? '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 60))
      .filter(Boolean)
      .slice(0, 5);
    const result = typeof json?.result === 'string' ? json.result.toLowerCase() : '';
    if (status >= 200 && status < 300) {
      if (result === 'failed' || codes.length > 0) return { outcome: 'rejected', codes: codes.length ? codes : ['refund_failed'], httpStatus: status };
      const clean = (v: unknown) => (typeof v === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v) ? v : null);
      return { outcome: 'ok', status: clean(json?.status), refundId: clean(json?.refundId) ?? clean(json?.id), httpStatus: status };
    }
    if (status === 401 || status === 403) return { outcome: 'rejected', codes: ['auth_failed'], httpStatus: status };
    // 4xx = Tpay odrzucił zlecenie (walidacja, brak środków, transakcja nie do zwrotu). 408 traktujemy jak przekroczenie czasu.
    if (status >= 400 && status < 500 && status !== 408) return { outcome: 'rejected', codes: codes.length ? codes : [`http_${status}`], httpStatus: status };
    return { outcome: 'uncertain', why: `odpowiedź HTTP ${status}`, httpStatus: status };
  }

  /** Przekierowujemy wyłącznie na `https://…tpay.com` — odpowiedź API nie może stać się otwartym przekierowaniem. */
  private isTpayUrl(url: string): boolean {
    try {
      const u = new URL(url);
      return u.protocol === 'https:' && !u.username && !u.password && (u.hostname === 'tpay.com' || u.hostname.endsWith('.tpay.com'));
    } catch {
      return false;
    }
  }

  private async fetchPem(url: string): Promise<string> {
    const res = await this.http(url, { method: 'GET', headers: { Accept: 'application/x-pem-file, text/plain, */*' } });
    if (!res.ok) throw new TpayError(`certyfikat niedostępny (HTTP ${res.status})`);
    const pem = await res.text();
    if (pem.length > 100_000 || !pem.includes('-----BEGIN CERTIFICATE-----')) throw new TpayError('certyfikat: nieoczekiwana treść');
    return pem;
  }

  /** Certyfikat podpisujący powiadomienia — tylko spod zaufanego adresu, z pamięcią podręczną. */
  private async signingCert(x5u: string): Promise<string> {
    const cfg = tpayConfig();
    if (!isTrustedX5u(x5u, cfg.env)) throw new TpayError('niezaufany adres certyfikatu');
    const hit = this.certCache.get(x5u);
    if (hit && Date.now() - hit.at < CERT_TTL_MS) return hit.pem;
    const pem = await this.fetchPem(x5u);
    if (this.certCache.size > 20) this.certCache.clear();
    this.certCache.set(x5u, { pem, at: Date.now() });
    return pem;
  }

  /** Skąd pochodzi root CA (do kafla w Ustawieniach). */
  rootCaSource(): 'env' | 'file' | 'download' {
    if ((process.env.TPAY_ROOT_CA_PEM ?? '').includes('BEGIN CERTIFICATE')) return 'env';
    if ((process.env.TPAY_ROOT_CA_FILE ?? '').trim()) return 'file';
    return 'download';
  }

  /**
   * Root CA Tpay: `TPAY_ROOT_CA_PEM` (treść; `\n` jako dwa znaki też działa) → `TPAY_ROOT_CA_FILE` (ścieżka)
   * → pobranie z oficjalnego adresu środowiska przy pierwszym użyciu (potem z pamięci).
   */
  private async rootCaPem(): Promise<string> {
    const cfg = tpayConfig();
    const source = this.rootCaSource();
    const key = `${source}:${cfg.env}`;
    if (this.rootCa && this.rootCa.key === key && (source !== 'download' || Date.now() - this.rootCa.at < 24 * 60 * 60_000)) return this.rootCa.pem;
    let pem: string;
    if (source === 'env') pem = String(process.env.TPAY_ROOT_CA_PEM).replace(/\\n/g, '\n');
    else if (source === 'file') pem = await readFile(String(process.env.TPAY_ROOT_CA_FILE).trim(), 'utf8');
    else pem = await this.fetchPem(`https://${TPAY_CERT_HOSTS[cfg.env]}/x509/tpay-jws-root.pem`);
    this.rootCa = { pem, at: Date.now(), key };
    return pem;
  }

  /** Pełna weryfikacja powiadomienia (JWS, łańcuch certyfikatów, sprzedawca, md5sum, tryb testowy). */
  async verifyNotification(rawBody: Buffer | undefined, jws: string | undefined): Promise<TpayVerifyResult> {
    const cfg = tpayConfig();
    if (!cfg.ready) return { ok: false, reason: 'NOT_CONFIGURED' };
    let rootCaPem: string;
    try {
      rootCaPem = await this.rootCaPem();
    } catch (e) {
      this.logger.error(`Root CA Tpay niedostępny: ${(e as Error).message}`);
      return { ok: false, reason: 'CERT_UNAVAILABLE' };
    }
    return verifyTpayNotification({
      rawBody,
      jws,
      env: cfg.env,
      merchantId: cfg.merchantId,
      securityCode: cfg.securityCode,
      rootCaPem,
      allowTestMode: cfg.allowTestMode,
      getSigningCertPem: (x5u) => this.signingCert(x5u),
    });
  }
}
