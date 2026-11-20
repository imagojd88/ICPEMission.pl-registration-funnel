import { BadGatewayException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { createHash, createHmac } from 'crypto';

/** Stan wideo w naszej bazie (CourseItem.videoState). */
export type VideoState = 'UPLOADING' | 'PROCESSING' | 'READY' | 'FAILED';

/** Rozmiar części uploadu wieloczęściowego (R2: wszystkie części poza ostatnią muszą być równe, min. 5 MiB). */
export const PART_SIZE = 16 * 1024 * 1024;
/** Najwięcej części w jednym uploadzie (limit S3/R2) → maks. plik ≈ 156 GB przy 16 MiB. */
const MAX_PARTS = 10000;

/** Kodowanie ścieżek i parametrów wg SigV4 (RFC 3986 — także ! ' ( ) *). */
export function uriEncode(s: string, keepSlash = false): string {
  const enc = encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return keepSlash ? enc.replace(/%2F/g, '/') : enc;
}

const sha256 = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
const hmac = (key: Buffer | string, s: string) => createHmac('sha256', key).update(s).digest();

export interface PresignInput {
  method: string;
  host: string;
  /** Ścieżka już w postaci „surowej" (bez kodowania), zaczyna się od „/". */
  path: string;
  query?: Record<string, string>;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  service?: string;
  expiresSec: number;
  now?: Date;
}

/**
 * Podpisany URL AWS Signature V4 (query auth, UNSIGNED-PAYLOAD). Jedyny podpisany nagłówek: host.
 * Zgodny z S3 i Cloudflare R2 (region „auto"). Funkcja czysta — testowana na przykładzie z dokumentacji AWS.
 */
export function presignUrl(p: PresignInput): string {
  const now = p.now ?? new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); // 20130524T000000Z
  const day = amzDate.slice(0, 8);
  const service = p.service ?? 's3';
  const scope = `${day}/${p.region}/${service}/aws4_request`;
  const q: Record<string, string> = {
    ...(p.query ?? {}),
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${p.accessKeyId}/${scope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(Math.max(1, Math.min(604800, Math.floor(p.expiresSec)))),
    'X-Amz-SignedHeaders': 'host',
  };
  const canonicalQuery = Object.keys(q)
    .sort()
    .map((k) => `${uriEncode(k)}=${uriEncode(q[k])}`)
    .join('&');
  const canonicalPath = uriEncode(p.path, true);
  const canonicalRequest = [p.method.toUpperCase(), canonicalPath, canonicalQuery, `host:${p.host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonicalRequest)].join('\n');
  const kDate = hmac(`AWS4${p.secretAccessKey}`, day);
  const kRegion = hmac(kDate, p.region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, 'aws4_request');
  const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');
  return `https://${p.host}${canonicalPath}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

const xmlTag = (xml: string, tag: string) => xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1] ?? null;
const xmlUnescape = (s: string) =>
  s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/** Reguła CORS bucketu: upload z panelu (PUT) i odtwarzanie/pobieranie (GET/HEAD) — dostęp i tak tylko z podpisem. */
export const R2_CORS_RULES = [
  { AllowedOrigins: ['*'], AllowedMethods: ['GET', 'HEAD', 'PUT'], AllowedHeaders: ['*'], ExposeHeaders: ['ETag', 'Content-Length', 'Content-Range'], MaxAgeSeconds: 3600 },
];

/**
 * Hosting filmów kursów w Cloudflare R2 (S3-kompatybilny magazyn, bez opłat za transfer).
 * Bez SDK: podpisy SigV4 liczymy sami (presignUrl), zapytania przez fetch.
 * ENV (Render ▸ icpe-api ▸ Environment): R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET,
 * opcjonalnie R2_ENDPOINT (np. https://<konto>.eu.r2.cloudflarestorage.com dla bucketu z jurysdykcją UE).
 *
 * Przepływ: panel admina wgrywa plik MP4 prosto do R2 (multipart, części przez podpisane linki PUT — plik nie
 * przechodzi przez icpe-api), kursant dostaje podpisany link GET ważny kilka godzin i ogląda w zwykłym <video>.
 */
@Injectable()
export class R2StorageService {
  private readonly logger = new Logger('R2');

  private cfg() {
    const accountId = (process.env.R2_ACCOUNT_ID ?? '').trim();
    const endpoint = (process.env.R2_ENDPOINT ?? '').trim().replace(/\/+$/, '');
    const host = endpoint ? endpoint.replace(/^https?:\/\//, '') : accountId ? `${accountId}.r2.cloudflarestorage.com` : '';
    return {
      host,
      accountId,
      bucket: (process.env.R2_BUCKET ?? '').trim(),
      accessKeyId: (process.env.R2_ACCESS_KEY_ID ?? '').trim(),
      secretAccessKey: (process.env.R2_SECRET_ACCESS_KEY ?? '').trim(),
    };
  }

  isConfigured(): boolean {
    const c = this.cfg();
    return !!(c.host && c.bucket && c.accessKeyId && c.secretAccessKey);
  }

  status() {
    const c = this.cfg();
    return {
      provider: 'r2' as const,
      configured: this.isConfigured(),
      bucket: c.bucket || null,
      missing: [
        !c.host && 'R2_ACCOUNT_ID',
        !c.bucket && 'R2_BUCKET',
        !c.accessKeyId && 'R2_ACCESS_KEY_ID',
        !c.secretAccessKey && 'R2_SECRET_ACCESS_KEY',
      ].filter(Boolean) as string[],
    };
  }

  assertConfigured(): void {
    this.requireCfg();
  }

  private requireCfg() {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        `Hosting wideo (Cloudflare R2) nie jest skonfigurowany — brakuje na Renderze: ${this.status().missing.join(', ')}.`,
      );
    }
    return this.cfg();
  }

  /** Podpisany URL do obiektu (key) albo do samego bucketu (key = null). */
  presign(method: string, key: string | null, expiresSec: number, query?: Record<string, string>): string {
    const c = this.requireCfg();
    return presignUrl({
      method,
      host: c.host,
      path: key ? `/${c.bucket}/${key}` : `/${c.bucket}`,
      query,
      accessKeyId: c.accessKeyId,
      secretAccessKey: c.secretAccessKey,
      region: 'auto',
      expiresSec,
    });
  }

  private async call(method: string, key: string | null, query: Record<string, string>, init?: { body?: string; headers?: Record<string, string> }) {
    const url = this.presign(method, key, 300, query);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20000);
    try {
      const res = await fetch(url, { method, body: init?.body, headers: init?.headers, signal: ctrl.signal });
      const text = await res.text();
      return { status: res.status, ok: res.ok, text, headers: res.headers };
    } catch (e) {
      throw new BadGatewayException(`Nie udało się połączyć z Cloudflare R2 (${(e as Error).message}).`);
    } finally {
      clearTimeout(t);
    }
  }

  private fail(op: string, r: { status: number; text: string }): never {
    const code = xmlTag(r.text, 'Code');
    const message = xmlTag(r.text, 'Message');
    this.logger.error(`${op} → ${r.status} ${r.text.slice(0, 300)}`);
    const hint =
      r.status === 403 || code === 'AccessDenied' || code === 'SignatureDoesNotMatch' || code === 'InvalidAccessKeyId'
        ? ' Sprawdź R2_ACCESS_KEY_ID i R2_SECRET_ACCESS_KEY (token musi mieć uprawnienie „Object Read & Write" do tego bucketu).'
        : code === 'NoSuchBucket'
          ? ' Sprawdź R2_BUCKET (nazwa bucketu) i R2_ACCOUNT_ID.'
          : '';
    throw new BadGatewayException(`Cloudflare R2 odrzucił żądanie (${op}: ${code ?? r.status}${message ? ` — ${message}` : ''}).${hint}`);
  }

  /** Liczba części dla pliku danej wielkości (walidacja limitu). */
  partCount(size: number): number {
    const n = Math.max(1, Math.ceil(size / PART_SIZE));
    if (n > MAX_PARTS) throw new BadGatewayException('Plik jest za duży.');
    return n;
  }

  async createMultipart(key: string, contentType: string): Promise<string> {
    const r = await this.call('POST', key, { uploads: '' }, { headers: { 'Content-Type': contentType || 'video/mp4' } });
    if (!r.ok) this.fail('CreateMultipartUpload', r);
    const id = xmlTag(r.text, 'UploadId');
    if (!id) throw new BadGatewayException('Cloudflare R2 nie zwrócił identyfikatora uploadu.');
    return xmlUnescape(id);
  }

  /** Podpisane linki PUT do wskazanych części (ważne 6 h — wystarczy na wolne łącze). */
  partUrls(key: string, uploadId: string, partNumbers: number[]): Record<number, string> {
    const out: Record<number, string> = {};
    for (const n of partNumbers) out[n] = this.presign('PUT', key, 6 * 3600, { partNumber: String(n), uploadId });
    return out;
  }

  /** Części już wgrane (wznowienie po przerwie / źródło ETagów przy zakończeniu). */
  async listParts(key: string, uploadId: string): Promise<{ partNumber: number; etag: string; size: number }[]> {
    const parts: { partNumber: number; etag: string; size: number }[] = [];
    let marker = '0';
    for (let page = 0; page < 20; page++) {
      const r = await this.call('GET', key, { uploadId, 'max-parts': '1000', 'part-number-marker': marker });
      if (r.status === 404) return [];
      if (!r.ok) this.fail('ListParts', r);
      for (const m of r.text.matchAll(/<Part>([\s\S]*?)<\/Part>/g)) {
        const block = m[1];
        parts.push({
          partNumber: Number(xmlTag(block, 'PartNumber')),
          etag: xmlUnescape(xmlTag(block, 'ETag') ?? ''),
          size: Number(xmlTag(block, 'Size') ?? 0),
        });
      }
      if (xmlTag(r.text, 'IsTruncated') !== 'true') break;
      marker = xmlTag(r.text, 'NextPartNumberMarker') ?? marker;
    }
    return parts.sort((a, b) => a.partNumber - b.partNumber);
  }

  async completeMultipart(key: string, uploadId: string, parts: { partNumber: number; etag: string }[]) {
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const body =
      '<CompleteMultipartUpload>' +
      parts.map((p) => `<Part><PartNumber>${p.partNumber}</PartNumber><ETag>${esc(p.etag)}</ETag></Part>`).join('') +
      '</CompleteMultipartUpload>';
    const r = await this.call('POST', key, { uploadId }, { body, headers: { 'Content-Type': 'application/xml' } });
    // S3 potrafi zwrócić 200 z <Error> w treści — sprawdzamy oba.
    if (!r.ok || /<Error>/.test(r.text)) this.fail('CompleteMultipartUpload', r);
  }

  async abortMultipart(key: string, uploadId: string) {
    if (!this.isConfigured()) return;
    try {
      await this.call('DELETE', key, { uploadId });
    } catch (e) {
      this.logger.warn(`AbortMultipartUpload ${key}: ${(e as Error).message}`);
    }
  }

  /** Metadane obiektu albo null, gdy nie istnieje. */
  async head(key: string): Promise<{ size: number; contentType: string | null } | null> {
    const r = await this.call('HEAD', key, {});
    if (r.status === 404) return null;
    if (!r.ok) this.fail('HeadObject', r);
    return { size: Number(r.headers.get('content-length') ?? 0), contentType: r.headers.get('content-type') };
  }

  async deleteObject(key: string | null | undefined) {
    if (!key || !this.isConfigured()) return;
    try {
      const r = await this.call('DELETE', key, {});
      if (!r.ok && r.status !== 404) this.logger.warn(`DeleteObject ${key} → ${r.status}`);
    } catch (e) {
      // Nie blokujemy usunięcia pozycji kursu — najwyżej zostanie sierota w buckecie.
      this.logger.warn(`DeleteObject ${key}: ${(e as Error).message}`);
    }
  }

  /** Link do odtwarzania (GET, obsługuje Range — przewijanie). */
  playUrl(key: string, ttlSec = 6 * 3600): { url: string; expiresAt: string } {
    return { url: this.presign('GET', key, ttlSec), expiresAt: new Date(Date.now() + ttlSec * 1000).toISOString() };
  }

  /** Link PUT do pojedynczego małego pliku (miniatura). */
  putUrl(key: string, ttlSec = 3600): string {
    return this.presign('PUT', key, ttlSec);
  }

  /** Miniatura (podpisany GET, 12 h). */
  thumbUrl(key: string | null | undefined): string | null {
    if (!key || !this.isConfigured()) return null;
    return this.presign('GET', key, 12 * 3600);
  }

  /** Ustawia regułę CORS bucketu (wymaga tokenu z uprawnieniem do ustawień bucketu — inaczej instrukcja ręczna). */
  async ensureCors(): Promise<{ ok: boolean; message: string }> {
    const xml =
      '<CORSConfiguration>' +
      R2_CORS_RULES.map(
        (r) =>
          '<CORSRule>' +
          r.AllowedOrigins.map((o) => `<AllowedOrigin>${o}</AllowedOrigin>`).join('') +
          r.AllowedMethods.map((m) => `<AllowedMethod>${m}</AllowedMethod>`).join('') +
          r.AllowedHeaders.map((h) => `<AllowedHeader>${h}</AllowedHeader>`).join('') +
          r.ExposeHeaders.map((h) => `<ExposeHeader>${h}</ExposeHeader>`).join('') +
          `<MaxAgeSeconds>${r.MaxAgeSeconds}</MaxAgeSeconds>` +
          '</CORSRule>',
      ).join('') +
      '</CORSConfiguration>';
    const md5 = createHash('md5').update(xml).digest('base64');
    const r = await this.call('PUT', null, { cors: '' }, { body: xml, headers: { 'Content-Type': 'application/xml', 'Content-MD5': md5 } });
    if (r.ok) return { ok: true, message: 'Reguła CORS bucketu ustawiona — wysyłanie z panelu działa.' };
    this.logger.warn(`PutBucketCors → ${r.status} ${r.text.slice(0, 200)}`);
    return {
      ok: false,
      message:
        'Nie udało się ustawić CORS automatycznie (token nie ma uprawnień do ustawień bucketu). Ustaw ręcznie: Cloudflare ▸ R2 ▸ bucket ▸ Settings ▸ CORS Policy ▸ wklej regułę z instrukcji.',
    };
  }

  /**
   * Diagnoza (panel ▸ „Sprawdź odtwarzanie"): czy obiekt istnieje i czy podpisany link GET z Range działa.
   */
  async diagnose(key: string) {
    const problems: string[] = [];
    let head: { size: number; contentType: string | null } | null = null;
    try {
      head = await this.head(key);
    } catch (e) {
      return { ok: false, verdict: (e as Error).message, details: { key } };
    }
    if (!head) return { ok: false, verdict: 'Pliku filmu nie ma w R2 — wgraj go ponownie (ikona wysyłania przy materiale).', details: { key } };
    let rangeStatus = 0;
    try {
      const res = await fetch(this.playUrl(key, 300).url, { headers: { Range: 'bytes=0-1' } });
      rangeStatus = res.status;
      await res.arrayBuffer().catch(() => undefined);
    } catch {
      rangeStatus = 0;
    }
    if (rangeStatus !== 206 && rangeStatus !== 200) problems.push(`Link do odtwarzania nie działa (HTTP ${rangeStatus || 'brak połączenia'}).`);
    if (head.contentType && !/^video\//.test(head.contentType)) problems.push(`Plik ma typ „${head.contentType}" zamiast video/… — przeglądarki mogą go nie odtworzyć.`);
    const ok = problems.length === 0;
    return {
      ok,
      verdict: ok
        ? `Plik jest w R2 (${(head.size / 1024 / 1024).toFixed(0)} MB) i podpisany link do odtwarzania działa (z przewijaniem). Jeśli kursant nadal nie widzi obrazu, plik ma kodek nieobsługiwany przez przeglądarki — wyeksportuj go jako MP4 (H.264 + AAC).`
        : problems.join(' '),
      details: { key, size: head.size, contentType: head.contentType, rangeStatus },
    };
  }
}
