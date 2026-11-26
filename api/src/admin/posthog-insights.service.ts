import { Injectable, Logger } from '@nestjs/common';

/**
 * Zachowanie gości na stronie eventu z PostHoga (projekt „ICPE Rejestracja”): lejek, urządzenia,
 * języki, dni, źródła wejść, blokady i błędy wysyłki.
 *
 * Dane przychodzą z zapisanego w PostHogu endpointu `registration_event_dashboard` (zapytanie HogQL
 * ze zmiennymi `event_slug`, `lookback_days`), NIE z ogólnego API zapytań — endpoint ma własny cache
 * (15 min) i wersje. Wołamy go z serwera, bo klucz osobisty PostHoga nie może trafić do przeglądarki.
 *
 * ENV (Render ▸ icpe-api ▸ Environment):
 *  - POSTHOG_PERSONAL_API_KEY  (wymagany) klucz osobisty z zakresem „Endpoint: Read”
 *  - POSTHOG_PROJECT_ID        (opcjonalny, domyślnie 357985)
 *  - POSTHOG_APP_HOST          (opcjonalny, domyślnie https://eu.posthog.com)
 *  - POSTHOG_DASHBOARD_VERSION (opcjonalny, domyślnie 2) — przypięta wersja endpointu
 * Bez klucza dashboard działa dalej, tylko bez sekcji z PostHoga (`configured: false`).
 */

export const FUNNEL_STEPS = [
  'visit', 'start', 's1_applicant', 's2_participants', 's3_preferences', 's4_accommodation', 's5_options', 'payment', 'submit',
] as const;

type Row = [string, string | null, string | null, number | null];

export interface PosthogInsights {
  configured: boolean;
  error?: string;
  days: number;
  fetchedAt: string;
  totals: { sessions: number; pageviews: number };
  funnel: Array<{ step: string; people: number }>;
  devices: Array<{ device: string; visit: number; start: number; submit: number }>;
  langs: Array<{ lang: string; visit: number; start: number; submit: number }>;
  daily: Array<{ date: string; visit: number; start: number; submit: number }>;
  sources: Array<{ source: string; sessions: number; submits: number }>;
  blocked: Array<{ step: string; count: number }>;
  failed: Array<{ reason: string; count: number }>;
  events: Record<string, number>;
  pageStates: Record<string, number>;
}

const empty = (days: number, configured: boolean, error?: string): PosthogInsights => ({
  configured,
  ...(error ? { error } : {}),
  days,
  fetchedAt: new Date().toISOString(),
  totals: { sessions: 0, pageviews: 0 },
  funnel: FUNNEL_STEPS.map((step) => ({ step, people: 0 })),
  devices: [],
  langs: [],
  daily: [],
  sources: [],
  blocked: [],
  failed: [],
  events: {},
  pageStates: {},
});

/** Wiersze long-format (metric, k1, k2, value) → struktura dla panelu. Czysta funkcja (testowalna). */
export function parseInsightRows(rows: Row[], days: number): PosthogInsights {
  const out = empty(days, true);
  const funnel = new Map<string, number>();
  const pivot = (map: Map<string, { visit: number; start: number; submit: number }>, key: string, step: string, v: number) => {
    const cur = map.get(key) ?? { visit: 0, start: 0, submit: 0 };
    if (step === 'visit' || step === 'start' || step === 'submit') cur[step] = v;
    map.set(key, cur);
  };
  const devices = new Map<string, { visit: number; start: number; submit: number }>();
  const langs = new Map<string, { visit: number; start: number; submit: number }>();
  const daily = new Map<string, { visit: number; start: number; submit: number }>();
  const sources = new Map<string, { sessions: number; submits: number }>();
  for (const [metric, k1raw, k2raw, vraw] of rows) {
    const k1 = k1raw ?? '';
    const k2 = k2raw ?? '';
    const v = Number(vraw) || 0;
    switch (metric) {
      case 'funnel': funnel.set(k1, v); break;
      case 'funnel_device': pivot(devices, k2 || 'desktop', k1, v); break;
      case 'funnel_lang': pivot(langs, k2, k1, v); break;
      case 'daily': pivot(daily, k2, k1, v); break;
      case 'source_sessions': { const c = sources.get(k1) ?? { sessions: 0, submits: 0 }; c.sessions = v; sources.set(k1, c); break; }
      case 'source_submits': { const c = sources.get(k1) ?? { sessions: 0, submits: 0 }; c.submits = v; sources.set(k1, c); break; }
      case 'blocked': out.blocked.push({ step: k1 || '?', count: v }); break;
      case 'failed': out.failed.push({ reason: k1 || 'error', count: v }); break;
      case 'events':
        out.events[k1] = (out.events[k1] ?? 0) + v;
        if (k1 === 'event_page_viewed') out.pageStates[k2 || '?'] = (out.pageStates[k2 || '?'] ?? 0) + v;
        break;
      case 'totals': if (k1 === 'sessions' || k1 === 'pageviews') out.totals[k1] = v; break;
      default: break;
    }
  }
  out.funnel = FUNNEL_STEPS.map((step) => ({ step, people: funnel.get(step) ?? 0 }));
  out.devices = [...devices.entries()].map(([device, x]) => ({ device, ...x })).sort((a, b) => b.visit - a.visit);
  out.langs = [...langs.entries()].map(([lang, x]) => ({ lang, ...x })).sort((a, b) => b.visit - a.visit);
  out.daily = [...daily.entries()].map(([date, x]) => ({ date, ...x })).sort((a, b) => a.date.localeCompare(b.date));
  out.sources = [...sources.entries()].map(([source, x]) => ({ source, ...x })).sort((a, b) => b.sessions - a.sessions);
  out.blocked.sort((a, b) => b.count - a.count);
  out.failed.sort((a, b) => b.count - a.count);
  return out;
}

@Injectable()
export class PosthogInsightsService {
  private readonly logger = new Logger('PosthogInsights');
  private readonly cache = new Map<string, { at: number; data: PosthogInsights }>();
  private static readonly TTL_MS = 5 * 60_000;

  get configured(): boolean {
    return !!(process.env.POSTHOG_PERSONAL_API_KEY ?? '').trim();
  }

  async forSlug(slug: string, days: number, force = false): Promise<PosthogInsights> {
    const d = Math.min(365, Math.max(1, Math.trunc(Number(days) || 30)));
    if (!this.configured) return empty(d, false);
    const key = `${slug}|${d}`;
    const hit = this.cache.get(key);
    if (!force && hit && Date.now() - hit.at < PosthogInsightsService.TTL_MS) return hit.data;

    const host = (process.env.POSTHOG_APP_HOST || 'https://eu.posthog.com').replace(/\/+$/, '');
    const project = (process.env.POSTHOG_PROJECT_ID || '357985').trim();
    const version = (process.env.POSTHOG_DASHBOARD_VERSION || '2').trim();
    const url = `${host}/api/projects/${encodeURIComponent(project)}/endpoints/registration_event_dashboard/run?version=${encodeURIComponent(version)}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25_000);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${(process.env.POSTHOG_PERSONAL_API_KEY ?? '').trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ variables: { event_slug: slug, lookback_days: d }, refresh: force ? 'force' : 'cache' }),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        const msg = res.status === 401 || res.status === 403
          ? 'PostHog odrzucił klucz (sprawdź POSTHOG_PERSONAL_API_KEY i zakres „Endpoint: Read”).'
          : res.status === 429 ? 'PostHog: chwilowy limit zapytań — spróbuj za minutę.' : `PostHog: błąd ${res.status}.`;
        this.logger.warn(`${msg} ${body.slice(0, 300)}`);
        return hit?.data ? { ...hit.data, error: msg } : empty(d, true, msg);
      }
      const json = (await res.json()) as { results?: Row[] };
      const data = parseInsightRows(Array.isArray(json.results) ? json.results : [], d);
      this.cache.set(key, { at: Date.now(), data });
      return data;
    } catch (e) {
      const msg = (e as Error)?.name === 'AbortError' ? 'PostHog nie odpowiedział w 25 s.' : 'Brak połączenia z PostHogiem.';
      this.logger.warn(`${msg} ${(e as Error)?.message ?? ''}`);
      return hit?.data ? { ...hit.data, error: msg } : empty(d, true, msg);
    } finally {
      clearTimeout(timer);
    }
  }
}
