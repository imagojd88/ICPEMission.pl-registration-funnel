import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';

/** Statusy zgłoszenia, które przy `grantOn = ANY_ACTIVE` dają dostęp jeszcze przed opłaceniem. */
export const ACTIVE_REG_STATUSES = ['PENDING_PAYMENT', 'AWAITING_TRANSFER', 'CONFIRMED'];

export type GrantOn = 'CONFIRMED' | 'ANY_ACTIVE';

/** Tekst wielojęzyczny `{ pl, en }` albo zwykły string → tekst w danym języku (z fallbackiem). */
export function pickText(v: unknown, lng = 'pl'): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const val = o[lng] ?? o.pl ?? o.en ?? Object.values(o).find((x) => typeof x === 'string' && x);
    return typeof val === 'string' ? val : '';
  }
  return String(v);
}

/** Normalizuje tekst wielojęzyczny z body żądania do `{ pl, en? }` (puste języki pomijane). */
export function normLangText(v: unknown): Record<string, string> | null {
  if (v == null) return null;
  if (typeof v === 'string') return v.trim() ? { pl: v.trim() } : null;
  if (typeof v !== 'object') return null;
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === 'string' && val.trim()) out[k] = val.trim();
  }
  return Object.keys(out).length ? out : null;
}

export const normEmail = (e: unknown) => String(e ?? '').trim().toLowerCase();
export const isEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

export function siteBase(): string {
  return (process.env.PUBLIC_SITE_URL || 'https://icpemission.pl').replace(/\/+$/, '');
}

/** Publiczny adres kursu na stronie (Astro buduje katalogi → końcowy ukośnik). */
export function courseUrl(slug: string): string {
  return `${siteBase()}/formacja/${slug}/`;
}

// ── Slug ─────────────────────────────────────────────────────────────────────

const PL_MAP: Record<string, string> = {
  ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z',
  Ą: 'a', Ć: 'c', Ę: 'e', Ł: 'l', Ń: 'n', Ó: 'o', Ś: 's', Ź: 'z', Ż: 'z',
};

/** „Kurs Łaski i Wiary 2026" → „kurs-laski-i-wiary-2026". */
export function slugify(input: string): string {
  return String(input ?? '')
    .replace(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, (c) => PL_MAP[c] ?? c)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 60)
    .replace(/-+$/g, '');
}

/** Slugi zajęte przez techniczne pliki/ścieżki strony. */
export const RESERVED_SLUGS = new Set(['index', 'admin', 'api', 'login', 'logowanie', 'panel', 'assets', 'uploads', '_astro']);

export function slugProblem(slug: string): string | null {
  if (!slug) return 'Adres nie może być pusty.';
  if (slug.length < 3) return 'Adres musi mieć co najmniej 3 znaki.';
  if (slug.length > 60) return 'Adres może mieć najwyżej 60 znaków.';
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return 'Dozwolone: małe litery bez polskich znaków, cyfry i myślniki.';
  if (RESERVED_SLUGS.has(slug)) return 'Ten adres jest zarezerwowany.';
  return null;
}

// ── Kryptografia ─────────────────────────────────────────────────────────────

export const sha256hex = (s: string) => createHash('sha256').update(s).digest('hex');
export const newRawToken = () => randomBytes(32).toString('base64url');

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** Sekret JWT kursantów — osobny od admina. Fallback: pochodna JWT_SECRET (i tak inny ciąg). */
export function memberJwtSecret(): string {
  return process.env.MEMBER_JWT_SECRET || sha256hex(`${process.env.JWT_SECRET || 'changeme'}:member-realm`);
}

function fileSecret(): string {
  return process.env.FILE_SIGNING_SECRET || sha256hex(`${process.env.JWT_SECRET || 'changeme'}:private-files`);
}

/** Krótko żyjący podpisany link do prywatnego pliku (PDF) — ścieżka względna względem API. */
export function signedFilePath(fileId: string, ttlSec = 600, download = false): { path: string; expiresAt: string } {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const sig = createHmac('sha256', fileSecret()).update(`${fileId}.${exp}`).digest('base64url');
  return {
    path: `/member/files/${encodeURIComponent(fileId)}?exp=${exp}&sig=${sig}${download ? '&dl=1' : ''}`,
    expiresAt: new Date(exp * 1000).toISOString(),
  };
}

export function verifyFileSignature(fileId: string, exp: string, sig: string): boolean {
  const e = Number(exp);
  if (!Number.isFinite(e) || e < Math.floor(Date.now() / 1000)) return false;
  const expected = createHmac('sha256', fileSecret()).update(`${fileId}.${e}`).digest('base64url');
  return safeEqual(expected, String(sig ?? ''));
}

// ── Prosty limiter prób (w pamięci procesu — wystarczy na jedną instancję Render) ──

const hits = new Map<string, number[]>();

/** true = dozwolone. `max` prób w oknie `windowMs` na klucz. */
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= max) {
    hits.set(key, arr);
    return false;
  }
  arr.push(now);
  hits.set(key, arr);
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  }
  return true;
}
