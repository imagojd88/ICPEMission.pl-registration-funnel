# ICPE Mission PL — strona (Astro)

Statyczna strona publiczna ICPE Mission Polska. Treść pobierana przy buildzie z
`/site/*` w `icpe-api`. Zarządzanie treścią: Personal OS (przez `/admin/content/*`).

## Uruchomienie lokalne

```bash
cd site
npm install
PUBLIC_API_URL=https://icpe-api.onrender.com npm run dev
```

Otwórz http://localhost:4321.

## Zmienne środowiskowe

| Zmienna | Domyślnie | Opis |
|---|---|---|
| `PUBLIC_API_URL` | `https://icpe-api.onrender.com` | Baza API — endpointy `/site/*`. |
| `PUBLIC_REGISTRATION_URL` | `https://rejestracja.icpemission.pl` | Baza funnela rejestracji (przyciski „Zapisz się", blok `eventCta`). |
| `SITE_URL` | `https://icpemission.pl` | Publiczny adres strony (OG/canonical). |

Fetch jest defensywny: gdy API jest niedostępne, strona zbuduje się z pustą treścią
(nie wywala builda).

## Deploy — Render Static Site

1. Render ▸ **New ▸ Static Site** ▸ wskaż to repo (`ICPEMission.pl registration funnel`).
2. **Root Directory:** zostaw **puste**.
3. **Build Command:** `cd site && npm install && npm run build`
4. **Publish Directory:** `site/dist`
5. **Environment:** ustaw `PUBLIC_API_URL`, `PUBLIC_REGISTRATION_URL`, `SITE_URL`.
6. Po utworzeniu: **Settings ▸ Deploy Hook** → skopiuj URL i wklej w `icpe-api` jako
   `SITE_DEPLOY_HOOK_URL`. Od tego momentu publikacja treści w Personal OS
   automatycznie przebudowuje stronę (debounce ~15 s).

> Wariant jednoznaczny (Build wchodzi do `site/`, publikujemy `site/dist`) — działa
> niezależnie od tego, jak Render interpretuje „Root Directory".

## Model treści

- **Strona** (`Page`): slug, tytuł, bloki (JSON), SEO. `slug = "home"` → treść strony
  głównej; pozostałe slugi → `/{slug}`.
- **Artykuł** (`Article`): aktualności pod `/aktualnosci` i `/aktualnosci/{slug}`.
- **Menu** (`MenuItem`): nawigacja `header`/`footer`.
- **Ustawienia** (`SiteSettings`): nazwa, logo, kontakt, social, stopka.

### Bloki (typy renderowane w `src/components/Blocks.astro`)

`heading` (level 2/3), `paragraph` (html), `image`, `gallery`, `quote`, `button`,
`eventCta` (link do `/{registration}/r/{eventSlug}`), `video` (youtube), `divider`.

## Struktura

```
site/
  src/
    layouts/BaseLayout.astro     # head, SEO/OG, fonty, Nav + Footer
    components/{Nav,Footer,Blocks,EventCard}.astro
    lib/api.ts                   # fetch /site/*, helpery (pickLang, daty)
    pages/
      index.astro                # home (Page „home") + wydarzenia + aktualności
      [slug].astro               # strony statyczne (getStaticPaths z /site/pages)
      aktualnosci/index.astro    # lista artykułów
      aktualnosci/[slug].astro   # artykuł
    styles/global.css            # tokeny brandu ICPE
```
