/**
 * Weryfikacja powiadomienia Tpay (podpis JWS + md5sum) — CZYSTA funkcja: tylko `node:crypto`,
 * bez importów Nest i bez dostępu do sieci (certyfikat podaje wołający przez `getSigningCertPem`).
 * Dzięki temu test (`api/test/tpay-verify.test.ts`) uruchamia się samym Node.
 *
 * Kolejność kroków jak w docs/20-plan-wdrozenie-tpay.md, sekcja 3:
 *  1. surowe ciało i nagłówek `X-JWS-Signature` obecne,
 *  2. nagłówek JWS: `alg === 'RS256'`,
 *  3. `x5u`: `https:`, host DOKŁADNIE `secure.tpay.com` (produkcja) / `secure.sandbox.tpay.com`, ścieżka `/x509/…`,
 *  4. certyfikat podpisujący (pobiera wołający, z pamięcią podręczną); root CA = kotwica zaufania,
 *  5. łańcuch do root CA: `checkIssued`, `verify(publicKey)`, daty ważności,
 *  6. podpis RSA-SHA256 nad `nagłówek + "." + base64url(surowe ciało)`,
 *  7. dopiero potem parsowanie pól,
 *  8. `id === merchantId`,
 *  9. `md5sum` porównany przez `timingSafeEqual`,
 * 10. `test_mode` zgodne ze środowiskiem: w sandboxie akceptowany; na produkcji odrzucany,
 *     chyba że wołający jawnie na to pozwolił (`allowTestMode`, zmienna `TPAY_ALLOW_TEST_MODE`
 *     — „tryb testowy” włączony na koncie produkcyjnym Tpay).
 *
 * Funkcja NIC nie loguje. Powód odmowy (`reason`) to stały kod bez danych z powiadomienia.
 */
import { X509Certificate, createHash, timingSafeEqual, verify as cryptoVerify } from 'node:crypto';

export type TpayEnv = 'sandbox' | 'production';

export type TpayVerifyFailure =
  | 'NO_BODY'
  | 'NO_SIGNATURE'
  | 'BAD_JWS'
  | 'BAD_ALG'
  | 'BAD_X5U'
  | 'CERT_UNAVAILABLE'
  | 'BAD_CERT'
  | 'CERT_NOT_TRUSTED'
  | 'CERT_EXPIRED'
  | 'BAD_SIGNATURE'
  | 'BAD_MERCHANT'
  | 'BAD_MD5'
  | 'TEST_MODE_ON_PRODUCTION'
  | 'NOT_CONFIGURED';

export type TpayVerifyResult =
  | { ok: true; fields: Record<string, string>; testMode: boolean }
  | { ok: false; reason: TpayVerifyFailure };

export interface TpayVerifyInput {
  /** surowe ciało żądania — dokładnie te bajty, które przyszły (nie sparsowany obiekt) */
  rawBody: Buffer | string | null | undefined;
  /** wartość nagłówka `X-JWS-Signature` */
  jws: string | null | undefined;
  env: TpayEnv;
  /** ID sprzedawcy (porównywane z polem `id`) */
  merchantId: string;
  /** kod bezpieczeństwa do `md5sum` */
  securityCode: string;
  /** root CA Tpay (PEM) — kotwica zaufania */
  rootCaPem: string;
  /** zwraca PEM certyfikatu spod sprawdzonego już adresu `x5u` (może zawierać certyfikaty pośrednie) */
  getSigningCertPem: (x5u: string) => Promise<string> | string;
  /**
   * Produkcja: czy przyjmować powiadomienia z `test_mode=1` (tryb testowy konta produkcyjnego).
   * Domyślnie NIE — testowa wpłata potwierdzałaby zgłoszenie bez pieniędzy. W sandboxie bez znaczenia.
   */
  allowTestMode?: boolean;
  now?: Date;
}

export const TPAY_CERT_HOSTS: Record<TpayEnv, string> = {
  production: 'secure.tpay.com',
  sandbox: 'secure.sandbox.tpay.com',
};

/**
 * Ścisła walidacja adresu certyfikatu. Sam `startsWith('https://secure.tpay.com')` przepuściłby
 * `https://secure.tpay.com.evil.pl/…` oraz `https://secure.tpay.com@evil.pl/…` — dlatego porównujemy
 * sparsowany host, a nie początek napisu.
 */
export function isTrustedX5u(x5u: unknown, env: TpayEnv): boolean {
  if (typeof x5u !== 'string' || x5u.length > 300 || /[\s\\]/.test(x5u)) return false;
  let u: URL;
  try {
    u = new URL(x5u);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:') return false;
  if (u.username || u.password) return false;
  if (u.port && u.port !== '443') return false;
  if (u.hostname !== TPAY_CERT_HOSTS[env]) return false;
  // Ścieżkę sprawdzamy w oryginalnym napisie: `new URL` po cichu zwija „/x509/../inne”.
  if (!u.pathname.startsWith('/x509/') || x5u.includes('..')) return false;
  return true;
}

function b64urlToBuffer(s: string): Buffer | null {
  if (!/^[A-Za-z0-9_-]+$/.test(s)) return null;
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function toB64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Wszystkie certyfikaty z tekstu PEM (pierwszy = podpisujący, dalsze = pośrednie). */
function parseCerts(pem: string): X509Certificate[] {
  const blocks = String(pem ?? '').match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ?? [];
  return blocks.map((b) => new X509Certificate(b));
}

function validAt(cert: X509Certificate, now: Date): boolean {
  const from = Date.parse(cert.validFrom);
  const to = Date.parse(cert.validTo);
  return Number.isFinite(from) && Number.isFinite(to) && from <= now.getTime() && now.getTime() <= to;
}

/** `child` wystawiony i podpisany przez `issuer`. */
function issuedBy(child: X509Certificate, issuer: X509Certificate): boolean {
  try {
    return child.checkIssued(issuer) && child.verify(issuer.publicKey);
  } catch {
    return false;
  }
}

/**
 * Czy certyfikat podpisujący prowadzi do root CA (bezpośrednio albo przez certyfikaty pośrednie
 * dołączone w tym samym pliku PEM). Każde ogniwo musi być ważne w chwili `now`.
 */
function chainStatus(certs: X509Certificate[], roots: X509Certificate[], now: Date): 'OK' | 'CERT_NOT_TRUSTED' | 'CERT_EXPIRED' {
  let current = certs[0];
  const pool = certs.slice(1);
  for (let depth = 0; depth < 5; depth++) {
    if (!validAt(current, now)) return 'CERT_EXPIRED';
    const root = roots.find((r) => issuedBy(current, r));
    if (root) return validAt(root, now) ? 'OK' : 'CERT_EXPIRED';
    const idx = pool.findIndex((c) => issuedBy(current, c));
    if (idx < 0) return 'CERT_NOT_TRUSTED';
    current = pool.splice(idx, 1)[0];
  }
  return 'CERT_NOT_TRUSTED';
}

/** `md5(id + tr_id + tr_amount + tr_crc + kod_bezpieczeństwa)` — szesnastkowo. */
export function tpayMd5(fields: Record<string, string>, securityCode: string): string {
  return createHash('md5')
    .update(`${fields.id ?? ''}${fields.tr_id ?? ''}${fields.tr_amount ?? ''}${fields.tr_crc ?? ''}${securityCode}`, 'utf8')
    .digest('hex');
}

export async function verifyTpayNotification(input: TpayVerifyInput): Promise<TpayVerifyResult> {
  const fail = (reason: TpayVerifyFailure): TpayVerifyResult => ({ ok: false, reason });
  const now = input.now ?? new Date();

  if (!input.merchantId || !input.securityCode || !input.rootCaPem) return fail('NOT_CONFIGURED');

  // 1. surowe ciało i nagłówek podpisu
  const body = typeof input.rawBody === 'string' ? Buffer.from(input.rawBody, 'utf8') : input.rawBody;
  if (!body || !Buffer.isBuffer(body) || body.length === 0) return fail('NO_BODY');
  const jws = typeof input.jws === 'string' ? input.jws.trim() : '';
  if (!jws) return fail('NO_SIGNATURE');

  // 2. nagłówek JWS (podpis odłączony: `nagłówek..podpis`; środkową część ignorujemy — liczy się ciało)
  const parts = jws.split('.');
  if (parts.length !== 3 || !parts[0] || !parts[2]) return fail('BAD_JWS');
  const headerBuf = b64urlToBuffer(parts[0]);
  const signature = b64urlToBuffer(parts[2]);
  if (!headerBuf || !signature || signature.length === 0) return fail('BAD_JWS');
  let header: { alg?: unknown; x5u?: unknown };
  try {
    const parsed: unknown = JSON.parse(headerBuf.toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fail('BAD_JWS');
    header = parsed as { alg?: unknown; x5u?: unknown };
  } catch {
    return fail('BAD_JWS');
  }
  // Tylko RS256: żadnego `none`, żadnego HS256 (podpis kluczem publicznym jako sekretem).
  if (header.alg !== 'RS256') return fail('BAD_ALG');

  // 3. adres certyfikatu
  if (!isTrustedX5u(header.x5u, input.env)) return fail('BAD_X5U');

  // 4. certyfikat podpisujący + root CA
  let certPem: string;
  try {
    certPem = await input.getSigningCertPem(header.x5u as string);
  } catch {
    return fail('CERT_UNAVAILABLE');
  }
  let certs: X509Certificate[];
  let roots: X509Certificate[];
  try {
    certs = parseCerts(certPem);
    roots = parseCerts(input.rootCaPem);
  } catch {
    return fail('BAD_CERT');
  }
  if (certs.length === 0 || roots.length === 0) return fail('BAD_CERT');

  // 5. łańcuch zaufania i daty ważności
  const chain = chainStatus(certs, roots, now);
  if (chain !== 'OK') return fail(chain);

  // 6. podpis nad `nagłówek.base64url(surowe ciało)`
  const signingKey = certs[0].publicKey;
  if (signingKey.asymmetricKeyType !== 'rsa') return fail('BAD_CERT');
  let signatureOk = false;
  try {
    signatureOk = cryptoVerify('RSA-SHA256', Buffer.from(`${parts[0]}.${toB64url(body)}`, 'ascii'), signingKey, signature);
  } catch {
    signatureOk = false;
  }
  if (!signatureOk) return fail('BAD_SIGNATURE');

  // 7. dopiero teraz czytamy pola (application/x-www-form-urlencoded)
  const fields: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(body.toString('utf8'))) {
    if (!(k in fields)) fields[k] = v;
  }

  // 8. ID sprzedawcy
  if ((fields.id ?? '') !== String(input.merchantId)) return fail('BAD_MERCHANT');

  // 9. md5sum (porównanie w stałym czasie)
  const expected = Buffer.from(tpayMd5(fields, input.securityCode), 'utf8');
  const given = Buffer.from(String(fields.md5sum ?? '').trim().toLowerCase(), 'utf8');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return fail('BAD_MD5');

  // 10. tryb testowy: sandbox zawsze; produkcja tylko przy jawnej zgodzie (allowTestMode === true)
  const testMode = fields.test_mode === '1' || String(fields.test_mode ?? '').toLowerCase() === 'true';
  if (testMode && input.env === 'production' && input.allowTestMode !== true) return fail('TEST_MODE_ON_PRODUCTION');

  return { ok: true, fields, testMode };
}
