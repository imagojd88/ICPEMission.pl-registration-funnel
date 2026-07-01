# Prompt integracyjny (Personal OS) — moduł treści strony ICPE Mission PL (Faza 3)

> Skopiuj całość do wątku, który rozwija **Personal OS**. To specyfikacja funkcjonalna + kontrakt API. Warstwa wizualna (design) dojdzie osobno — trzymaj się stylu istniejącego panelu Personal OS.

---

## 1. Rola i cel

Rozwijasz **Personal OS** — desktopowy panel, który już zarządza **rejestracjami** ICPE (przez `/admin/*` w `icpe-api`). Dodajesz **drugi obszar: zarządzanie treścią publicznej strony ICPE Mission Polska** (CMS). Ta sama baza, ta sama autoryzacja, ten sam token — nowy zestaw endpointów `/admin/content/*`.

Cel: redaktor z Personal OS tworzy i publikuje strony oraz aktualności, zarządza nawigacją i ustawieniami globalnymi. Publikacja automatycznie przebudowuje publiczną stronę (statyczny Astro). **Personal OS jest jedynym panelem — nie ma osobnego CMS-a.**

## 2. Co już istnieje (nie buduj tego)

- **Backend (`icpe-api`, Faza 1 — gotowe):** moduł `content` z modelami `Page`, `Article`, `MenuItem`, `SiteSettings` i endpointami `/admin/content/*` (token) oraz `/site/*` (publiczne). Publikacja treści po stronie backendu **sama** wywołuje Render Deploy Hook (rebuild strony, debounce ~15 s).
- **Publiczna strona (Astro, Faza 2 — gotowe):** renderuje opublikowaną treść z `/site/*`. Ty jej nie dotykasz.

Twoje zadanie = **UI w Personal OS** na endpointach z §5.

## 3. Połączenie z API

- **Base URL:** ten sam host co reszta `/admin/*` (produkcyjnie `https://icpe-api.onrender.com`). Użyj istniejącej w Personal OS konfiguracji adresu API.
- **Autoryzacja:** `Authorization: Bearer <SERVICE_TOKEN>` — **ten sam token**, którego używasz już do `/admin/instances`, `/admin/registrations` itd. Bez nowej autoryzacji.
- **Content-Type:** `application/json` (poza uploadem plików — multipart, patrz §7).
- Błędy: standardowe HTTP (401 brak/zły token, 404 nie znaleziono, 400 walidacja).

## 4. Model danych

### Page (strona statyczna: „o-nas", „kontakt", a także strona główna)
```
id          string
slug        string   // unikalny; "home" = treść strony głównej; inne → /{slug}
title       string
locale      string   // "pl" | "en" | "it" (domyślnie "pl")
blocks      Block[]  // treść jako tablica bloków (patrz §6)
seoTitle    string?  
seoDesc     string?
ogImageUrl  string?
showInNav   boolean  // czy pokazać w menu (informacyjnie; realne menu = model MenuItem)
navOrder    number?  // kolejność
status      "DRAFT" | "PUBLISHED"
publishedAt string?  // ISO, ustawiane przy publikacji
createdAt / updatedAt string (ISO)
```

### Article (aktualność / wpis — publikowane pod /aktualnosci)
```
id          string
slug        string   // unikalny
title       string
locale      string   // domyślnie "pl"
excerpt     string?  // zajawka na listę i OG
coverUrl    string?  // obrazek nagłówkowy
blocks      Block[]
category    string?  // np. "aktualnosci", "swiadectwa"
author      string?
seoTitle    string?
seoDesc     string?
status      "DRAFT" | "PUBLISHED"
publishedAt string?
createdAt / updatedAt string (ISO)
```

### MenuItem (nawigacja header/footer)
```
id        string
label     string
href      string   // "/o-nas" albo pełny URL
location  "header" | "footer"
order     number
parentId  string?  // podmenu (opcjonalnie)
```

### SiteSettings (jeden rekord globalny)
```
siteName          string   // np. "ICPE Mission Polska"
logoUrl           string?
contactEmail      string?
contactPhone      string?
socials           object?  // { facebook, instagram, youtube, ... } (klucz→URL)
footerText        string?
defaultOgImageUrl string?
```

## 5. Kontrakt endpointów `/admin/content/*` (wszystkie z Bearer token)

### Strony
```
GET    /admin/content/pages                 → Page[]   (wszystkie statusy)
GET    /admin/content/pages/:id             → Page
POST   /admin/content/pages                 → Page     (tworzy DRAFT; body opcjonalne)
PATCH  /admin/content/pages/:id             → Page     (aktualizacja częściowa — wysyłaj tylko zmienione pola)
PATCH  /admin/content/pages/:id/publish     → Page     (status=PUBLISHED, publishedAt=now) + rebuild
PATCH  /admin/content/pages/:id/unpublish   → Page     (status=DRAFT) + rebuild
DELETE /admin/content/pages/:id             → { ok: true }  (+ rebuild jeśli była opublikowana)
```
Pola akceptowane w POST/PATCH strony: `slug, title, locale, blocks, seoTitle, seoDesc, ogImageUrl, showInNav, navOrder`. Nieznane pola są ignorowane. `blocks` wyślij jako tablicę (patrz §6).

### Artykuły / aktualności (analogicznie)
```
GET    /admin/content/articles              → Article[]
GET    /admin/content/articles/:id          → Article
POST   /admin/content/articles              → Article   (DRAFT)
PATCH  /admin/content/articles/:id          → Article
PATCH  /admin/content/articles/:id/publish  → Article + rebuild
PATCH  /admin/content/articles/:id/unpublish→ Article + rebuild
DELETE /admin/content/articles/:id          → { ok: true }
```
Pola akceptowane: `slug, title, locale, excerpt, coverUrl, blocks, category, author, seoTitle, seoDesc`.

### Nawigacja (menu)
```
GET    /admin/content/menu                  → MenuItem[]
PUT    /admin/content/menu                  → MenuItem[]   (ZAPIS CAŁEJ LISTY — replace-all)
```
`PUT /menu` przyjmuje **tablicę** pozycji **albo** `{ items: [...] }`. Backend kasuje dotychczasowe i zapisuje przysłane. Każda pozycja: `{ label, href, location?, order?, parentId? }` (label i href wymagane; location domyślnie "header"; order domyślnie = indeks). Wywołuje rebuild.

### Ustawienia globalne
```
GET    /admin/content/settings              → SiteSettings   (tworzy rekord, jeśli brak)
PUT    /admin/content/settings              → SiteSettings   (aktualizacja częściowa) + rebuild
```

### Podgląd szkicu (dowolny status — do budowy podglądu w Personal OS)
```
GET    /admin/content/preview/page/:slug     → Page     (także DRAFT)
GET    /admin/content/preview/article/:slug  → Article  (także DRAFT)
```

### Wspólnoty mapy świata (opisy pod interaktywną mapą na landingu)
Strona główna ma interaktywną mapę z 19 wspólnotami; pod mapą wyświetla się opis
najechanej/klikniętej wspólnoty. **Te opisy są edytowalne.** Struktura (współrzędne,
grupa, pin) jest bazowa w kodzie strony — edytujesz tylko teksty PL/EN.
```
GET   /admin/content/communities        → Community[]   (seeduje 19 przy pierwszym wywołaniu)
PATCH /admin/content/communities/:id     → Community     (edycja) + rebuild
```
Model `Community`: `{ id, key, name, ccPl, ccEn, tagPl, tagEn, notePl, noteEn, lat, lng, grp, order }`.
Pola **edytowalne** (PATCH): `name, ccPl, ccEn, tagPl, tagEn, notePl, noteEn`
(nazwa, kraj PL/EN, tag PL/EN, opis PL/EN). `key/lat/lng/grp/order` są strukturalne — **nie edytuj** (mapa łączy dane po `key`).
UI: lista 19 wspólnot (po `order`), formularz edycji z polami PL/EN (opis = textarea).
Zmiana zapisuje się od razu i wyzwala rebuild strony. Publiczny odczyt: `GET /site/communities`.

## 6. Schemat bloków treści (pole `blocks`)

`blocks` to **tablica** obiektów. Renderer strony (Astro) obsługuje poniższe typy — edytor w Personal OS ma pozwalać dodawać/usuwać/porządkować te bloki i edytować ich pola:

```ts
type Block =
  | { type: 'heading'; level: 2 | 3; text: string }
  | { type: 'paragraph'; html: string }               // rich text: pogrubienie, linki, listy (HTML)
  | { type: 'image'; url: string; alt?: string; caption?: string }
  | { type: 'gallery'; images: { url: string; alt?: string }[] }
  | { type: 'quote'; text: string; author?: string }
  | { type: 'button'; label: string; href: string }   // dowolny link
  | { type: 'eventCta'; eventSlug: string }            // przycisk „Zapisz się" → funnel /r/{eventSlug}
  | { type: 'video'; provider: 'youtube'; id: string } // id filmu YouTube
  | { type: 'divider' }
```

Wskazówki dla edytora:
- Minimalny zestaw na start: `heading`, `paragraph`, `image`, `quote`, `button`, `eventCta`. Resztę dołóż potem.
- `paragraph.html` — pole rich-text (dozwolone proste tagi: `<b> <i> <a> <ul>/<ol>/<li> <br>`). Zadbaj o sanityzację po stronie edytora.
- `eventCta.eventSlug` — slug istniejącego eventu (masz listę z `GET /admin/instances`; slug jest w polu instancji). Podpowiadaj listę zamiast wolnego wpisu.
- Nowy typ bloku = zawsze zgłoś do wątku backendu/strony (musi go umieć renderować Astro).

## 7. Media (obrazki)

Reużyj **istniejącego mechanizmu uploadów** (ten sam, którego używasz przy tle hero eventu):
```
POST /admin/uploads   (multipart/form-data, pole "file")  → { path: "/uploads/:id" }
GET  /admin/uploads                                        → lista wgranych (galeria)
```
Pełny URL obrazka do zapisania w bloku/`coverUrl`/`logoUrl`/`ogImageUrl` = `${API_BASE}${path}` (np. `https://icpe-api.onrender.com/uploads/abc`). Endpoint `GET /uploads/:id` jest publiczny (bez tokenu) — nadaje się do treści na stronie.

## 8. Publikacja i rebuild (ważne)

- Redaktor: **Zapisz** = `PATCH` (zostaje `DRAFT`), **Publikuj** = `PATCH .../publish`, **Cofnij publikację** = `.../unpublish`.
- **Rebuild strony jest automatyczny po stronie backendu** — Personal OS **nie** woła żadnego Deploy Hooka. Po `publish/unpublish/delete` oraz zmianie `menu`/`settings` backend sam uruchamia przebudowę Astro (z debounce ~15 s). W UI wystarczy komunikat typu „Opublikowano — strona zaktualizuje się w ciągu ~1–2 min".

## 9. Podgląd

- Podgląd szkicu w Personal OS: pobierz przez `GET /admin/content/preview/page|article/:slug` i **wyrenderuj bloki lokalnie** w panelu (ten sam schemat §6). Publiczna strona renderuje tylko `PUBLISHED`, więc podgląd draftu robimy w aplikacji, nie na żywej stronie.

## 10. Zakres UI do zbudowania w Personal OS

1. **Sekcja „Strona/CMS”** w nawigacji Personal OS z zakładkami: Strony, Aktualności, Menu, Ustawienia.
2. **Lista Stron / Aktualności:** tabela (tytuł, slug, status DRAFT/PUBLISHED, data publikacji), akcje: Edytuj, Publikuj/Cofnij, Usuń, „Nowa”.
3. **Edytor Strony/Artykułu:**
   - pola nagłówkowe: tytuł, slug (auto z tytułu, edytowalny), (Artykuł: zajawka, kategoria, autor, cover),
   - **edytor blokowy** (dodaj/usuń/przenieś blok, edycja pól per typ §6),
   - sekcja SEO (seoTitle, seoDesc, ogImageUrl),
   - akcje: Zapisz (draft), Publikuj, Podgląd.
4. **Edytor Menu:** lista pozycji header/footer z drag-sort, pola label+href+location; zapis = `PUT /menu` (cała lista).
5. **Ustawienia:** formularz SiteSettings (nazwa, logo upload, kontakt, social jako pary klucz→URL, tekst stopki, domyślny OG).
6. **Upload obrazków:** przez `POST /admin/uploads`, z możliwością wyboru z galerii (`GET /admin/uploads`).

## 11. Walidacja i pułapki

- **Slug unikalny** w obrębie typu (Page/Article). Waliduj po stronie UI (litery/cyfry/myślniki), a przy konflikcie pokaż błąd z backendu (400/500 na duplikacie).
- **`slug = "home"`** dla strony ⇒ to treść strony głównej (specjalny przypadek — oznacz to w UI).
- `PATCH` jest **częściowy** — wysyłaj tylko zmienione pola (szczególnie `blocks` wyślij w całości, gdy edytowane).
- `PUT /menu` **nadpisuje całość** — zawsze wyślij pełną, aktualną listę.
- `blocks` musi być tablicą (nawet pustą `[]`). Nie wysyłaj `null`.
- URL-e obrazków zapisuj jako pełne (`${API_BASE}/uploads/...`), nie względne.

## 12. Poza zakresem (Fazy późniejsze)

- Statystyki (Umami) — Faza 4.
- Wielojęzyczność treści strony (pl/en/it dla Page/Article) — model ma pole `locale`, ale UI wielojęzyczny to osobny temat; na start prowadź treść po polsku.
- Wizualny podgląd draftu na żywej stronie (na razie podgląd renderujemy w Personal OS).

## 13. Test akceptacyjny (definicja gotowości)

1. Utworzenie strony „o-nas” z kilkoma blokami → Zapisz → Publikuj.
2. `GET /site/pages/o-nas` (publicznie, bez tokenu) zwraca opublikowaną treść.
3. Dodanie pozycji menu „O nas → /o-nas” przez `PUT /menu`, widoczna w `GET /site/menu`.
4. Utworzenie aktualności z cover + zajawką, publikacja, widoczna w `GET /site/articles`.
5. Ustawienia (nazwa, kontakt, social) zapisane i zwracane przez `GET /site/settings`.
6. Po publikacji w logach `icpe-api` widać wpis `[deploy-hook] …` (rebuild) — jeśli `SITE_DEPLOY_HOOK_URL` jest ustawiony.
```
