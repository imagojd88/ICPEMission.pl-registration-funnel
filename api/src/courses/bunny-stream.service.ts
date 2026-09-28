import { Injectable, Logger, ServiceUnavailableException, BadGatewayException } from '@nestjs/common';
import { createHmac } from 'crypto';
import { safeEqual, sha256hex } from './course-utils';

/** Stan wideo w naszej bazie (CourseItem.videoState). */
export type VideoState = 'UPLOADING' | 'PROCESSING' | 'READY' | 'FAILED';

export interface BunnyVideoInfo {
  state: VideoState;
  rawStatus: number;
  encodeProgress: number | null;
  durationSec: number | null;
  thumbnailUrl: string | null;
}

const API = 'https://video.bunnycdn.com';

/**
 * Adapter Bunny Stream (bez SDK — fetch, jak Resend w NotificationsService).
 * Konfiguracja w ENV (Render ▸ icpe-api ▸ Environment):
 *  BUNNY_STREAM_LIBRARY_ID, BUNNY_STREAM_API_KEY (klucz biblioteki),
 *  BUNNY_STREAM_TOKEN_KEY (Embed view token authentication), BUNNY_STREAM_CDN_HOSTNAME (miniatury),
 *  BUNNY_STREAM_WEBHOOK_KEY (opcjonalnie; Read-only API key — weryfikacja podpisu webhooka).
 */
@Injectable()
export class BunnyStreamService {
  private readonly logger = new Logger('BunnyStream');

  private cfg() {
    return {
      libraryId: (process.env.BUNNY_STREAM_LIBRARY_ID ?? '').trim(),
      apiKey: (process.env.BUNNY_STREAM_API_KEY ?? '').trim(),
      tokenKey: (process.env.BUNNY_STREAM_TOKEN_KEY ?? '').trim(),
      cdnHost: (process.env.BUNNY_STREAM_CDN_HOSTNAME ?? '').trim().replace(/^https?:\/\//, '').replace(/\/+$/, ''),
      webhookKey: (process.env.BUNNY_STREAM_WEBHOOK_KEY ?? '').trim(),
    };
  }

  isConfigured(): boolean {
    const c = this.cfg();
    return !!(c.libraryId && c.apiKey);
  }

  status() {
    const c = this.cfg();
    return {
      configured: !!(c.libraryId && c.apiKey),
      libraryId: c.libraryId || null,
      tokenAuth: !!c.tokenKey,
      thumbnails: !!c.cdnHost,
      webhookSignature: !!c.webhookKey,
    };
  }

  private requireCfg() {
    const c = this.cfg();
    if (!c.libraryId || !c.apiKey) {
      throw new ServiceUnavailableException(
        'Hosting wideo nie jest skonfigurowany — ustaw BUNNY_STREAM_LIBRARY_ID i BUNNY_STREAM_API_KEY na Renderze.',
      );
    }
    return c;
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const c = this.requireCfg();
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20000);
    try {
      const res = await fetch(`${API}/library/${c.libraryId}${path}`, {
        method,
        headers: { AccessKey: c.apiKey, accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });
      const text = await res.text();
      if (!res.ok) {
        this.logger.error(`${method} ${path} → ${res.status} ${text.slice(0, 300)}`);
        throw new BadGatewayException(`Bunny Stream odrzucił żądanie (${res.status}).`);
      }
      return (text ? JSON.parse(text) : {}) as T;
    } finally {
      clearTimeout(t);
    }
  }

  /** Tworzy pusty obiekt wideo — przeglądarka admina wgra do niego plik przez TUS. */
  async createVideo(title: string): Promise<string> {
    const v = await this.call<{ guid: string }>('POST', '/videos', { title: title.slice(0, 200) || 'Film' });
    if (!v.guid) throw new BadGatewayException('Bunny Stream nie zwrócił identyfikatora wideo.');
    return v.guid;
  }

  /**
   * Dane do uploadu TUS z przeglądarki (presigned). Klucz API nie opuszcza serwera:
   * AuthorizationSignature = sha256(libraryId + apiKey + expire + videoId).
   */
  tusUpload(videoId: string, ttlSec = 24 * 3600) {
    const c = this.requireCfg();
    const expire = Math.floor(Date.now() / 1000) + ttlSec;
    return {
      endpoint: `${API}/tusupload`,
      headers: {
        AuthorizationSignature: sha256hex(`${c.libraryId}${c.apiKey}${expire}${videoId}`),
        AuthorizationExpire: String(expire),
        VideoId: videoId,
        LibraryId: c.libraryId,
      },
      expiresAt: new Date(expire * 1000).toISOString(),
    };
  }

  /**
   * Stan wideo z API Bunny (źródło prawdy). Status obiektu wideo:
   * 0 Created, 1 Uploaded, 2 Processing, 3 Transcoding, 4 Finished, 5 Error, 6 UploadFailed,
   * 7/8 JIT (odtwarzalne). Od pierwszej gotowej rozdzielczości film da się odtworzyć,
   * więc „Transcoding" z niepustym `availableResolutions` traktujemy jako READY.
   */
  async getVideo(videoId: string): Promise<BunnyVideoInfo> {
    const v = await this.call<{
      status: number;
      length?: number;
      encodeProgress?: number;
      availableResolutions?: string | null;
      thumbnailFileName?: string | null;
    }>('GET', `/videos/${encodeURIComponent(videoId)}`);
    const s = Number(v.status);
    let state: VideoState;
    if (s === 4 || s === 7 || s === 8) state = 'READY';
    else if (s === 3 && v.availableResolutions) state = 'READY';
    else if (s === 5 || s === 6) state = 'FAILED';
    else if (s === 0) state = 'UPLOADING';
    else state = 'PROCESSING';
    return {
      state,
      rawStatus: s,
      encodeProgress: typeof v.encodeProgress === 'number' ? v.encodeProgress : null,
      durationSec: v.length ? Math.round(v.length) : null,
      thumbnailUrl: this.thumbnailUrl(videoId, v.thumbnailFileName ?? undefined),
    };
  }

  async deleteVideo(videoId: string): Promise<void> {
    if (!this.isConfigured()) return;
    try {
      await this.call('DELETE', `/videos/${encodeURIComponent(videoId)}`);
    } catch (e) {
      // Nie blokujemy usunięcia pozycji kursu — najwyżej zostanie sierota w bibliotece.
      this.logger.warn(`Nie usunięto wideo ${videoId} w Bunny: ${(e as Error).message}`);
    }
  }

  thumbnailUrl(videoId: string, fileName?: string): string | null {
    const c = this.cfg();
    return c.cdnHost ? `https://${c.cdnHost}/${videoId}/${fileName || 'thumbnail.jpg'}` : null;
  }

  /** Podpisany URL odtwarzacza (iframe). token = sha256hex(tokenKey + videoId + expires). */
  embedUrl(videoId: string, ttlSec = 4 * 3600): { url: string; expiresAt: string } {
    const c = this.requireCfg();
    const expires = Math.floor(Date.now() / 1000) + ttlSec;
    const params = new URLSearchParams({ autoplay: 'false', preload: 'true', responsive: 'true' });
    if (c.tokenKey) {
      params.set('token', sha256hex(`${c.tokenKey}${videoId}${expires}`));
      params.set('expires', String(expires));
    } else {
      this.logger.warn('BUNNY_STREAM_TOKEN_KEY nie ustawiony — embed bez podpisu (włącz token auth w bibliotece).');
    }
    return {
      url: `https://iframe.mediadelivery.net/embed/${c.libraryId}/${encodeURIComponent(videoId)}?${params.toString()}`,
      expiresAt: new Date(expires * 1000).toISOString(),
    };
  }

  /**
   * Diagnoza odtwarzania (panel ▸ „Sprawdź odtwarzanie"): serwer sam otwiera odtwarzacz Bunny
   * w kilku wariantach i na tej podstawie wskazuje przyczynę błędu 403.
   */
  async diagnosePlayback(videoId: string, siteOrigin: string) {
    const c = this.requireCfg();
    const signed = this.embedUrl(videoId, 600).url;
    const unsigned = `https://iframe.mediadelivery.net/embed/${c.libraryId}/${encodeURIComponent(videoId)}`;
    const probe = async (url: string, referer?: string): Promise<number> => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15000);
      try {
        const res = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
            Accept: 'text/html',
            ...(referer ? { Referer: referer } : {}),
          },
          redirect: 'follow',
          signal: ctrl.signal,
        });
        return res.status;
      } catch {
        return 0;
      } finally {
        clearTimeout(t);
      }
    };
    const referer = `${siteOrigin.replace(/\/+$/, '')}/`;
    const [signedRef, signedNoRef, unsignedRef] = await Promise.all([
      probe(signed, referer),
      probe(signed),
      probe(unsigned, referer),
    ]);
    let verdict: string;
    let ok = false;
    if (signedRef === 200) {
      ok = true;
      verdict =
        'Odtwarzanie działa (serwer otworzył film jak przeglądarka z Twojej strony). Jeśli kursant widzi 403: odśwież stronę kursu — link do filmu jest ważny 4 h — i sprawdź, czy strona jest otwarta pod ' +
        referer.replace(/\/$/, '') + '.';
    } else if (!c.tokenKey && unsignedRef !== 200) {
      verdict =
        'W bibliotece Bunny włączone jest zabezpieczenie linków (Embed view token authentication), a na Renderze brakuje BUNNY_STREAM_TOKEN_KEY. Wklej „Token authentication key" z Bunny ▸ Stream ▸ biblioteka ▸ Security do zmiennej BUNNY_STREAM_TOKEN_KEY i zrób Manual Deploy icpe-api.';
    } else if (signedNoRef === 200 && signedRef !== 200) {
      verdict =
        `Bunny blokuje odtwarzanie ze strony ${referer} — lista „Allowed domains" w bibliotece (Security) nie obejmuje tej domeny. Wpisz tam samą nazwę bez https:// i ukośnika: icpemission.pl (ew. też www.icpemission.pl).`;
    } else if (unsignedRef === 200 && signedRef !== 200) {
      verdict =
        'Film bez podpisu się otwiera, a z podpisem nie — sprawdź BUNNY_STREAM_TOKEN_KEY (musi być identyczny z „Token authentication key" w Security biblioteki).';
    } else if (signedRef === 0) {
      verdict = 'Serwer nie mógł połączyć się z Bunny (timeout). Spróbuj ponownie za chwilę.';
    } else {
      verdict = c.tokenKey
        ? 'Podpis linku jest odrzucany. Najczęstsza przyczyna: BUNNY_STREAM_TOKEN_KEY na Renderze to nie ten klucz (np. wklejony „API Key" zamiast „Token authentication key" z zakładki Security). Druga możliwość: domena icpemission.pl nie jest na liście „Allowed domains".'
        : 'Bunny odrzuca odtwarzanie. Sprawdź w bibliotece Security: „Allowed domains" (icpemission.pl) i czy token authentication jest włączony — jeśli tak, ustaw BUNNY_STREAM_TOKEN_KEY na Renderze.';
    }
    return {
      ok,
      verdict,
      details: { tokenKeySet: !!c.tokenKey, signedWithReferer: signedRef, signedNoReferer: signedNoRef, unsignedWithReferer: unsignedRef, referer },
    };
  }

  /** Weryfikacja podpisu webhooka. null = brak klucza (nie da się sprawdzić). */
  verifyWebhook(rawBody: Buffer | undefined, signature: string | undefined): boolean | null {
    const c = this.cfg();
    if (!c.webhookKey) return null;
    if (!rawBody || !signature) return false;
    const expected = createHmac('sha256', c.webhookKey).update(rawBody).digest('hex');
    return safeEqual(expected, signature.trim().toLowerCase());
  }
}
