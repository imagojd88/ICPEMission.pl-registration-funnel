# Handoff: Strona ICPE Mission PL — headless CMS na własnym API + Astro

**Status:** **Faza 1 (backend `content`) ZREALIZOWANA** — API dla Personal OS działa. Kolejne: Faza 2 (Astro), 3 (UI w Personal OS), 4 (Umami), 5 (SEO+domena).
**Kontekst:** rozszerzamy istniejący backend rejestracji (`icpe-api`, NestJS + Prisma + Postgres na Render). Personal OS pozostaje jedynym panelem zarządzania — steruje rejestracjami *i* treścią strony przez ten sam wzorzec `/admin/*` + token.

---

## 0. Stan wdrożenia (Faza 1 — gotowe)

Dobudowany moduł `api/src/content/` w `icpe-api`. Po deployu na Render (`prisma db push` doda tabele; `prisma generate` jest w buildzie) Personal OS ma działające API.

**Nowe pliki:**
- `api/prisma/schema.prisma` — enum `ContentStatus` + modele `Page`, `Article`, `MenuItem`, `SiteSettings`.
- `api/src/content/content.service.ts` — logika CRUD + publikacja + podgląd + zapytania publiczne.
- `api/src/content/content.admin.controller.ts` — `/admin/content/*` (token-auth `JwtAuthGuard`).
- `api/src/content/content.public.controller.ts` — `/site/*` (publiczne, tylko `PUBLISHED`).
- `api/src/content/deploy-hook.service.ts` — Render Deploy Hook z debounce (15 s).
- `api/src/content/content.module.ts` — rejestracja (importuje `AuthModule` + `EventsModule`); wpięty w `app.module.ts`.
- `render.yaml` — `SITE_DEPLOY_HOOK_URL` (`sync:false`).

**Po deployu:** URL API bez zmian (`https://icpe-api.onrender.com`). Uwaga: backend nie ma auto-deploy → **Manual Deploy** `icpe-api` (nowe tabele, nowy moduł). Test szybki: `GET /site/pages` → `[]`, `GET /admin/content/pages` z tokenem → `[]`.

**Autoryzacja Personal OS:** ten sam Bearer token (`SERVICE_TOKEN`) co dla `/admin/*` rejestracji.

**Uwaga dot. sandboxa (dev):** nie dało się zregenerować klienta Prisma lokalnie (silnik 403) — typy Prismy weryfikuje dopiero build na Render (`prisma generate && nest build`); dynamiczne wejścia do `data` są rzutowane defensywnie.

---

## 1. Zasada naczelna

Strona to **drugi konsument tego samego backendu**, nie osobny świat. Jedno API, jedna autoryzacja, jeden system mediów (uploady), jedne tłumaczenia (pl/en/it), jeden brand (zmienne `--brand`). Personal OS = jedyny „mózg". Publiczna strona = statyczny Astro, generowany z opublikowanej treści.

Trzy warstwy:

1. **Treść** — nowy moduł `content` w `icpe-api` (Prisma models + endpointy).
2. **Prezentacja** — Astro (SSG) na Render Static Site, build z API, rebuild po publikacji (Deploy Hook).
3. **Sterowanie + pomiar** — Personal OS (edycja/publikacja) + Umami (statystyki, self-host).

---

## 2. Model danych (Prisma)

Nowe modele w `api/prisma/schema.prisma`. Wszystkie treściowe mają status `DRAFT`/`PUBLISHED` i `publishedAt`.

```prisma
enum ContentStatus {
  DRAFT
  PUBLISHED
}

model Page {
  id          String        @id @default(cuid())
  slug        String        @unique          // np. "o-nas", "kontakt", "/" dla home
  title       String
  locale      String        @default("pl")   // pl | en | it
  blocks      Json                            // tablica bloków (patrz §4)
  seoTitle    String?
  seoDesc     String?
  ogImageUrl  String?
  status      ContentStatus @default(DRAFT)
  publishedAt DateTime?
  navOrder    Int?                            // pozycja w menu (opcjonalnie)
  showInNav   Boolean       @default(false)
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt
}

model Article {
  id          String        @id @default(cuid())
  slug        String        @unique
  title       String
  locale      String        @default("pl")
  excerpt     String?                         // zajawka na listę/OG
  coverUrl    String?
  blocks      Json                            // treść jako bloki
  category    String?                         // "aktualnosci" | "swiadectwa" | ...
  author      String?
  seoTitle    String?
  seoDesc     String?
  status      ContentStatus @default(DRAFT)
  publishedAt DateTime?
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt
}

model MenuItem {
  id        String  @id @default(cuid())
  label     String
  href      String                             // "/o-nas" lub URL zewn.
  location  String  @default("header")         // header | footer
  order     Int     @default(0)
  parentId  String?                            // podmenu (opcjonalnie)
  createdAt DateTime @default(now())
}

model SiteSettings {
  id          String  @id @default("singleton") // zawsze jeden rekord
  siteName    String  @default("ICPE Mission Polska")
  logoUrl     String?
  contactEmail String?
  contactPhone String?
  socials     Json?                            // { facebook, instagram, youtube, ... }
  footerText  String?
  defaultOgImageUrl String?
  updatedAt   DateTime @updatedAt
}
```

Media: reużywamy istniejący mechanizm uploadów (`listUploads` / galeria). Nowego modelu `MediaAsset` na razie nie potrzeba — bloki trzymają URL-e obrazków.

---

## 3. Kontrakt API

Ten sam styl co `/admin/*` w rejestracji: token w nagłówku, `/admin/content/*` widzi szkice, `/site/*` zwraca **tylko** `PUBLISHED`.

### 3.1 Admin (Personal OS, token-auth)

```
# Strony
GET    /admin/content/pages                 -> Page[]  (wszystkie statusy)
GET    /admin/content/pages/:id             -> Page
POST   /admin/content/pages                 -> Page    (tworzy DRAFT)
PATCH  /admin/content/pages/:id             -> Page    (edycja treści/meta)
PATCH  /admin/content/pages/:id/publish     -> Page    (status=PUBLISHED, publishedAt=now) + trigger rebuild
PATCH  /admin/content/pages/:id/unpublish   -> Page    (status=DRAFT) + trigger rebuild
DELETE /admin/content/pages/:id             -> 204

# Artykuły / aktualności (analogicznie)
GET    /admin/content/articles
GET    /admin/content/articles/:id
POST   /admin/content/articles
PATCH  /admin/content/articles/:id
PATCH  /admin/content/articles/:id/publish
PATCH  /admin/content/articles/:id/unpublish
DELETE /admin/content/articles/:id

# Nawigacja i ustawienia globalne
GET    /admin/content/menu                  -> MenuItem[]
PUT    /admin/content/menu                  -> MenuItem[]  (zapis całej listy)
GET    /admin/content/settings              -> SiteSettings
PUT    /admin/content/settings              -> SiteSettings

# Podgląd szkicu (bez publikacji)
GET    /admin/content/preview/page/:slug    -> Page   (dowolny status; do preview-URL)
GET    /admin/content/preview/article/:slug -> Article
```

### 3.2 Publiczne (Astro build + wyspy runtime)

```
GET /site/pages                 -> Page[]     (tylko PUBLISHED, lekka lista: slug,title,navOrder)
GET /site/pages/:slug           -> Page
GET /site/articles              -> Article[]  (PUBLISHED, sort publishedAt desc; ?category=, ?limit=)
GET /site/articles/:slug        -> Article
GET /site/menu                  -> MenuItem[]
GET /site/settings              -> SiteSettings (bezpieczne pola)
GET /site/events/upcoming       -> reużywa listPublicActive() z modułu events (link do /r/:slug)
```

**Reużycie z rejestracji:** `/site/events/upcoming` to ta sama lista aktywnych eventów co strona główna funnela. Aktualność może mieć blok CTA linkujący do `/r/:slug`.

---

## 4. Schemat bloków treści

Treść to tablica bloków w JSON — przenośna, wersjonowalna, renderer-agnostyczna. Personal OS edytuje bloki, Astro je renderuje. Minimalny zestaw na start:

```ts
type Block =
  | { type: 'heading'; level: 2 | 3; text: string }
  | { type: 'paragraph'; html: string }              // rich text (pogrubienie, linki)
  | { type: 'image'; url: string; alt?: string; caption?: string }
  | { type: 'gallery'; images: { url: string; alt?: string }[] }
  | { type: 'quote'; text: string; author?: string } // np. świadectwo / cytat z Pisma
  | { type: 'button'; label: string; href: string }  // CTA, np. do /r/:slug
  | { type: 'eventCta'; eventSlug: string }           // auto-karta eventu z danymi z API
  | { type: 'video'; provider: 'youtube'; id: string }
  | { type: 'divider' }
```

Zasada: nowy typ bloku = jeden komponent w Astro + jedna opcja w edytorze Personal OS. Zaczynamy od `heading/paragraph/image/quote/button/eventCta`, resztę dokładamy wg potrzeb.

---

## 5. Przepływ publikacji

1. W Personal OS edytujesz stronę/artykuł → **Zapisz** = `PATCH` (pozostaje `DRAFT`).
2. **Podgląd** = otwierasz preview-URL renderujący szkic na żądanie (Astro SSR route lub tryb dev), zanim wypuścisz.
3. **Publikuj** = `PATCH .../publish` → status `PUBLISHED` + `publishedAt`, backend woła **Render Deploy Hook** strony Astro.
4. Astro przebudowuje się (~1–2 min), zaciąga świeżą treść z `/site/*`, wypuszcza statyczny HTML.

Deploy Hook: URL z panelu Render Static Site, trzymany w ENV backendu (`SITE_DEPLOY_HOOK_URL`), wołany po każdej zmianie statusu publikacji. Debounce po stronie backendu (np. jeden trigger na 30–60 s), żeby seria publikacji nie robiła serii buildów.

Fragmenty zawsze-świeże (najbliższe wydarzenia, formularz kontaktowy) renderujemy jako **wyspy Astro** z fetchem po stronie klienta do `/site/events/upcoming` — nie wymagają rebuildu.

---

## 6. Statystyki — Umami (self-host)

- Osobny mały web service na Render + własna baza Postgres (Umami ma własny schemat).
- Prywatnościowo-przyjazne, bez ciasteczek śledzących → **bez cookie bannera**, zgodne z RODO i charakterem organizacji.
- Wpięcie: jeden `<script>` w layout Astro (tracker). Dane w Personal OS przez API Umami lub iframe z dashboardem.
- Alternatywy odrzucone: własny licznik w Postgresie (więcej pracy), Plausible Cloud (płatny, zewnętrzny).

Metryki na start: odsłony stron, top treści, źródła ruchu, kraje/urządzenia. Dla eventów: konwersja „wejście na aktualność → klik Zapisz się → rejestracja" (event tracking z linka CTA).

---

## 7. Frontend Astro — struktura

```
site/
  src/
    layouts/BaseLayout.astro        # <head>, SEO/OG, brand tokens, Umami, i18n
    components/blocks/*.astro        # render bloków (Heading, Paragraph, Image, Quote, Button, EventCta...)
    components/Nav.astro, Footer.astro
    lib/api.ts                       # fetch do /site/*
    pages/
      index.astro                    # home (Page slug="/")
      [slug].astro                   # strony statyczne (getStaticPaths z /site/pages)
      aktualnosci/index.astro        # lista artykułów
      aktualnosci/[slug].astro       # pojedynczy artykuł
  astro.config.mjs                   # output: 'static' (+ ewent. wyspy)
```

- `getStaticPaths()` ciągnie listę opublikowanych slugów z API przy buildzie.
- Brand: te same zmienne CSS co w aplikacji rejestracji (spójność wizualna).
- i18n: pl domyślnie; en/it wg `locale` treści (osobne ścieżki lub prefiks języka — do decyzji w Fazie 2).
- SEO: `sitemap.xml`, `robots.txt`, OG-tagi per strona (`seoTitle`/`seoDesc`/`ogImageUrl`).

---

## 8. Fazy wdrożenia

| Faza | Zakres | Rezultat |
|---|---|---|
| **1. Backend treści** ✅ **ZROBIONE** | Modele Prisma, moduł `content`, endpointy `/admin/content/*` i `/site/*`, Deploy Hook + debounce | API gotowe; Personal OS ma kontrakt (patrz §0) |
| **2. Szkielet Astro** | Layout, brand, i18n, render bloków, `getStaticPaths`, home + strona + lista/artykuł, SEO | Publiczna strona buduje się z treści z API |
| **3. Personal OS — moduł treści** | Lista stron/artykułów, edytor blokowy, publikacja/cofnięcie, podgląd, menu, ustawienia | Pełne zarządzanie z Personal OS |
| **4. Statystyki** | Umami (service + baza) na Render, tracker w Astro, widok w Personal OS | Pomiar ruchu i konwersji |
| **5. SEO + domena** | sitemap, robots, OG, podpięcie domeny (np. `icpemission.pl` lub subdomena), przekierowania | Strona produkcyjna, indeksowalna |

---

## 9. Koszty i utrzymanie

- **Strona (Astro Static Site na Render):** zwykle darmowa / groszowa — statyczne pliki.
- **Backend:** bez zmian — dokładamy moduł do już działającego `icpe-api`.
- **Umami:** mały web service + baza (najtańszy tier Render).
- Brak nowego stacku do utrzymania: ten sam język (TS), ta sama platforma (Render), ten sam panel (Personal OS).

---

## 10. Zmienne środowiskowe (nowe)

Backend (`icpe-api`):
```
SITE_DEPLOY_HOOK_URL   # Render Deploy Hook strony Astro (sync:false)
```
Astro (build):
```
PUBLIC_API_URL=https://icpe-api.onrender.com   # baza dla /site/*
PUBLIC_UMAMI_SRC, PUBLIC_UMAMI_WEBSITE_ID       # tracker (Faza 4)
```

---

## 11. Otwarte decyzje (do domknięcia przy Fazie 2)

- **Domena:** `icpemission.pl` główny czy subdomena (np. `www.` / `strona.`)? Wpływ na SEO i przekierowania.
- **i18n na start:** tylko `pl`, czy od razu en/it? (można dołożyć później bez migracji danych — `locale` już jest w modelu).
- **Edytor w Personal OS:** blokowy (rekomendowany, zgodny z §4) czy prosty rich-text na start, bloki później.
- **Migracja obecnej treści:** czy jest istniejąca strona ICPE Mission do przeniesienia (import treści)?
```
