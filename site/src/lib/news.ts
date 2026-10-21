// Nowości — wpisy z src/content/nowosci/<adres>/{pl,en}.md (patrz src/content/config.ts).
// Wszystko liczone przy buildzie (strona statyczna).
import { getCollection, type CollectionEntry } from 'astro:content';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Ile wpisów mieści się w sekcji „Nowości” na stronie głównej (1 wyróżniony + 3 skróty).
 * Gdy wpisów jest WIĘCEJ, włącza się strona /nowosci/ („Wszystkie nowości”) i link do niej.
 */
export const HOME_LIMIT = 4;

export const NEWS_BASE = '/nowosci';

type Entry = CollectionEntry<'nowosci'>;

export interface NewsImage {
  src: string;
  /** Wymiary pliku (0 = nieznane) — do układu bez kadrowania. */
  w: number;
  h: number;
  alt: string;
  altEn?: string;
  caption?: string;
  captionEn?: string;
  position?: string;
}

export interface NewsItem {
  slug: string;
  href: string;
  date: Date;
  dateIso: string;
  place?: string;
  cover: NewsImage | null;
  gallery: NewsImage[];
  pl: Entry;
  en: Entry | null;
}

// ── wymiary zdjęć (JPEG / PNG / WebP) — czytane z public/ przy buildzie ──────────
const dimCache = new Map<string, { w: number; h: number }>();

function readDims(file: string): { w: number; h: number } {
  const b = fs.readFileSync(file);
  // PNG
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  // WebP
  if (b.length > 30 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const kind = b.toString('ascii', 12, 16);
    if (kind === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
    if (kind === 'VP8L') {
      const bits = b.readUInt32LE(21);
      return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (kind === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
  }
  // JPEG — szukamy znacznika SOFn
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m === 0xff) { i++; continue; }
      const len = b.readUInt16BE(i + 2);
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) };
      }
      i += 2 + len;
    }
  }
  return { w: 0, h: 0 };
}

function dims(src: string): { w: number; h: number } {
  if (!src.startsWith('/')) return { w: 0, h: 0 }; // zewnętrzny URL — bez wymiarów
  const hit = dimCache.get(src);
  if (hit) return hit;
  let d = { w: 0, h: 0 };
  try {
    d = readDims(path.join(process.cwd(), 'public', decodeURIComponent(src)));
  } catch {
    console.warn(`[nowosci] brak pliku zdjęcia: public${src}`);
  }
  dimCache.set(src, d);
  return d;
}

// ── wpisy ────────────────────────────────────────────────────────────────
let cache: NewsItem[] | null = null;

/** Wszystkie opublikowane wpisy, od najnowszego. */
export async function getNews(): Promise<NewsItem[]> {
  if (cache) return cache;
  const all = await getCollection('nowosci');
  const byDir = new Map<string, { pl?: Entry; en?: Entry }>();
  for (const e of all) {
    const [dir, file] = e.id.split('/');
    if (!dir || !file) continue;
    const lang = file.replace(/\.mdx?$/, '');
    if (lang !== 'pl' && lang !== 'en') continue;
    const rec = byDir.get(dir) || {};
    rec[lang] = e;
    byDir.set(dir, rec);
  }

  const items: NewsItem[] = [];
  for (const [slug, { pl, en }] of byDir) {
    if (!pl) {
      console.warn(`[nowosci] ${slug}: brak pl.md — wpis pominięty`);
      continue;
    }
    if (pl.data.draft) continue;
    if (!pl.data.date) {
      console.warn(`[nowosci] ${slug}: brak daty (date:) w pl.md — wpis pominięty`);
      continue;
    }
    const date = pl.data.date;
    const cover: NewsImage | null = pl.data.cover
      ? {
          src: pl.data.cover,
          ...dims(pl.data.cover),
          alt: pl.data.coverAlt || pl.data.title,
          altEn: en?.data.coverAlt || en?.data.title,
          position: pl.data.coverPosition,
        }
      : null;
    const gallery: NewsImage[] = (pl.data.gallery || []).map((g) => ({
      src: g.src,
      ...dims(g.src),
      alt: g.alt || g.caption || pl.data.title,
      caption: g.caption,
      captionEn: g.captionEn,
    }));
    items.push({
      slug,
      href: `${NEWS_BASE}/${slug}/`,
      date,
      dateIso: date.toISOString().slice(0, 10),
      place: pl.data.place,
      cover,
      gallery,
      pl,
      en: en || null,
    });
  }
  items.sort((a, b) => b.date.getTime() - a.date.getTime() || a.slug.localeCompare(b.slug));
  cache = items;
  return items;
}

/** Czy strona „Wszystkie nowości” jest już potrzebna (starsze wpisy nie mieszczą się na głównej). */
export const archiveActive = (count: number) => count > HOME_LIMIT;

/** Dokąd prowadzi „wszystkie nowości / wróć do nowości”. */
export const newsIndexHref = (count: number) => (archiveActive(count) ? `${NEWS_BASE}/` : '/#nowosci');

const MONTHS_PL = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** „16 października 2026” / „16 October 2026” (data bez strefy czasowej). */
export function formatNewsDate(d: Date, lang: 'pl' | 'en'): string {
  const day = d.getUTCDate();
  const m = d.getUTCMonth();
  const y = d.getUTCFullYear();
  return lang === 'pl' ? `${day} ${MONTHS_PL[m]} ${y}` : `${day} ${MONTHS_EN[m]} ${y}`;
}

/** Tytuł / skrót w danym języku (EN → fallback do PL). */
export const tTitle = (n: NewsItem, lang: 'pl' | 'en') => (lang === 'en' && n.en ? n.en.data.title : n.pl.data.title);
export const tExcerpt = (n: NewsItem, lang: 'pl' | 'en') => (lang === 'en' && n.en ? n.en.data.excerpt : n.pl.data.excerpt);
