// Warstwa danych — pobiera opublikowaną treść z /site/* (icpe-api) przy buildzie.
// Defensywnie: przy błędzie API zwraca pustą wartość, żeby build nie padał.

const API_BASE = (import.meta.env.PUBLIC_API_URL || 'https://icpe-api.onrender.com').replace(/\/+$/, '');

// Link do funnela rejestracji (przycisk „Zapisz się" z bloku eventCta).
export const REGISTRATION_BASE = (import.meta.env.PUBLIC_REGISTRATION_URL || 'https://rejestracja.icpemission.pl').replace(/\/+$/, '');

export type LangText = string | Record<string, string>;

export interface Block {
  type: string;
  [key: string]: unknown;
}

export interface PageFull {
  id: string;
  slug: string;
  title: string;
  locale: string;
  blocks: Block[];
  seoTitle?: string | null;
  seoDesc?: string | null;
  ogImageUrl?: string | null;
  showInNav: boolean;
  navOrder?: number | null;
}

export interface PageLite {
  slug: string;
  title: string;
  locale: string;
  navOrder?: number | null;
  showInNav: boolean;
}

export interface ArticleLite {
  slug: string;
  title: string;
  locale: string;
  excerpt?: string | null;
  coverUrl?: string | null;
  category?: string | null;
  author?: string | null;
  publishedAt?: string | null;
}

export interface ArticleFull extends ArticleLite {
  blocks: Block[];
  seoTitle?: string | null;
  seoDesc?: string | null;
}

export interface MenuItem {
  id: string;
  label: string;
  href: string;
  location: string;
  order: number;
}

export interface SiteSettings {
  siteName: string;
  logoUrl?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  socials?: Record<string, string> | null;
  footerText?: string | null;
  defaultOgImageUrl?: string | null;
}

export interface UpcomingEvent {
  slug: string;
  title: LangText;
  startsAt: string;
  endsAt: string;
  location: string;
  heroImageUrl?: string | null;
  primaryColor?: string | null;
}

async function get<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${API_BASE}${path}`, { headers: { Accept: 'application/json' } });
    if (!res.ok) {
      console.warn(`[site/api] ${path} → HTTP ${res.status}`);
      return fallback;
    }
    return (await res.json()) as T;
  } catch (e) {
    console.warn(`[site/api] ${path} → ${(e as Error).message}`);
    return fallback;
  }
}

export const getPages = () => get<PageLite[]>('/site/pages', []);
export const getPage = (slug: string) => get<PageFull | null>(`/site/pages/${encodeURIComponent(slug)}`, null);
export const getArticles = (limit?: number) =>
  get<ArticleLite[]>(`/site/articles${limit ? `?limit=${limit}` : ''}`, []);
export const getArticle = (slug: string) =>
  get<ArticleFull | null>(`/site/articles/${encodeURIComponent(slug)}`, null);
export const getMenu = () => get<MenuItem[]>('/site/menu', []);
export const getSettings = () =>
  get<SiteSettings>('/site/settings', { siteName: 'ICPE Mission Polska' });
export const getUpcoming = () => get<UpcomingEvent[]>('/site/events/upcoming', []);

/** Odczyt wielojęzycznego pola (fallback pl→en→it→pierwszy). */
export function pickLang(v: LangText | undefined | null, lng = 'pl'): string {
  if (!v) return '';
  if (typeof v === 'string') return v;
  return v[lng] ?? v.pl ?? v.en ?? v.it ?? Object.values(v)[0] ?? '';
}

/** Zakres dat po polsku, np. „4 – 5 września 2026". */
export function formatDateRange(startIso?: string, endIso?: string): string {
  if (!startIso) return '';
  const s = new Date(startIso);
  const e = endIso ? new Date(endIso) : s;
  const full = (d: Date) => d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });
  if (s.toDateString() === e.toDateString()) return full(s);
  return `${s.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long' })} – ${full(e)}`;
}
