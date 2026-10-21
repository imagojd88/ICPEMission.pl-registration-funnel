// Kolekcje treści zapisanej w repo (nie w CMS).
//
// NOWOŚCI — jeden katalog na wpis: src/content/nowosci/<adres-wpisu>/
//   pl.md  — wersja polska (WYMAGANA): metadane wpisu + treść w Markdown,
//   en.md  — wersja angielska (opcjonalna): tylko title / excerpt / coverAlt + treść.
// Zdjęcia wpisu: public/nowosci/<adres-wpisu>/ (np. cover.jpg, 01.jpg …).
// Nazwa katalogu = adres strony: icpemission.pl/nowosci/<adres-wpisu>/
// Szablon nowego wpisu: src/content/nowosci/_SZABLON.md
import { defineCollection, z } from 'astro:content';

const galleryItem = z.object({
  /** Ścieżka zdjęcia od public/, np. /nowosci/<adres>/01.jpg */
  src: z.string(),
  /** Opis alternatywny (PL). */
  alt: z.string().optional(),
  /** Podpis pod zdjęciem (PL) — opcjonalny. */
  caption: z.string().optional(),
  /** Podpis pod zdjęciem (EN) — opcjonalny. */
  captionEn: z.string().optional(),
});

const nowosci = defineCollection({
  type: 'content',
  schema: z.object({
    /** Tytuł wpisu. */
    title: z.string(),
    /** Skrót (2–3 zdania) — pokazywany na kartach i jako lead na stronie wpisu. */
    excerpt: z.string(),
    /** Data publikacji RRRR-MM-DD — decyduje o kolejności (najnowsze pierwsze). Wymagana w pl.md. */
    date: z.coerce.date().optional(),
    /** Zdjęcie główne (miniatura + nagłówek wpisu), np. /nowosci/<adres>/cover.jpg. Wymagane w pl.md (bez niego karta ma grafikę zastępczą). */
    cover: z.string().optional(),
    /** Opis alternatywny zdjęcia głównego. */
    coverAlt: z.string().optional(),
    /** Kadrowanie miniatury (CSS object-position), np. "center 30%" — gdy twarze uciekają z kadru. */
    coverPosition: z.string().optional(),
    /** Miejsce wydarzenia, np. „Kraków” (pokazywane przy dacie). */
    place: z.string().optional(),
    /** Galeria pod treścią — kolejność jak na liście, zdjęcia bez kadrowania. */
    gallery: z.array(galleryItem).optional(),
    /** true = wpis nie jest publikowany (szkic). */
    draft: z.boolean().optional(),
  }),
});

export const collections = { nowosci };
