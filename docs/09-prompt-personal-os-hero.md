# Prompt (Personal OS) — zarządzanie zdjęciami hero w Ustawieniach

> Wklej do wątku, który buduje panel „STRONA ICPE — CMS". To dołożenie sekcji **Hero** w zakładce **Ustawienia** (obok istniejących pól: nazwa, logo, kontakt, social, stopka).

## Kontekst
Na stronie głównej (landing) pod nagłówkiem jest **duże zdjęcie hero**, które **rotuje** z powolnym crossfade między kilkoma zdjęciami. Chcemy sterować tym z panelu:
- **włączać / wyłączać rotację**,
- **dodawać i usuwać zdjęcia**,
- **oznaczać zdjęcie domyślne** (pokazywane, gdy rotacja jest wyłączona).

Konfiguracja hero jest częścią **ustawień strony** (`SiteSettings.hero`). Backend jest gotowy; Ty budujesz UI.

## Połączenie z API
- Base URL: ten sam host `/admin/content/*` (prod `https://icpe-api.onrender.com`).
- Autoryzacja: `Authorization: Bearer <SERVICE_TOKEN>` — ten sam token co reszta panelu.
- `Content-Type: application/json` (poza uploadem — multipart).

## Endpointy
```
GET /admin/content/settings          → SiteSettings (zawiera pole `hero`)
PUT /admin/content/settings          → zapis (wyślij { hero: {...} }) + rebuild strony (automatyczny)
POST /admin/uploads  (multipart, pole "file")  → { path: "/uploads/:id" }   // wgranie zdjęcia
```
> Rebuild strony po zapisie jest automatyczny (backend woła Deploy Hook). Nie wołaj niczego dodatkowo.

## Kształt danych `hero`
```ts
hero = {
  rotate: boolean,           // true = rotacja włączona, false = jedno (domyślne) zdjęcie
  defaultUrl: string | null, // URL zdjęcia domyślnego (musi pasować do jednego z images[].url); gdy null → pierwsze
  images: [
    { url: string, position?: string, alt?: string }
  ]
}
```
- `url` — **pełny URL** obrazka (patrz „Upload" niżej). Zdjęcia zasiane domyślnie mają URL-e względne (`/uploads/…`) i są OK.
- `position` — opcjonalne CSS `object-position` (np. `"center 40%"`) do kadrowania w pasie 420 px. Domyślnie `center`. To pole może być „zaawansowane" (schowane) — jeśli puste, zostaje `center`.
- `alt` — opcjonalny tekst alternatywny.

Backend zasiewa przy pierwszym wczytaniu **5 obecnych zdjęć** — dostaniesz je od razu do zarządzania w liście.

## Upload nowych zdjęć (WAŻNE — pełny URL)
```
POST /admin/uploads (multipart/form-data, pole "file")  → { path: "/uploads/:id" }
```
Strona hero jest serwowana z **innej domeny** niż API, więc dla nowo wgranych zdjęć zapisz w `images[].url` **pełny, absolutny URL**:
```
url = `${API_BASE}${path}`      // np. https://icpe-api.onrender.com/uploads/abc123
```
(Nie zapisuj samego `/uploads/:id` — na domenie strony to się nie znajdzie. Zdjęcia zasiane domyślnie są wyjątkiem — leżą jako pliki statyczne strony.)

## UI (sekcja „Hero" w Ustawieniach)
1. **Przełącznik „Rotacja zdjęć"** → ustawia `hero.rotate`.
2. **Lista zdjęć** (miniatury z `images`): każda pozycja:
   - podgląd (miniatura z `url`),
   - **radio „Domyślne"** → ustawia `hero.defaultUrl = url` (aktywne/istotne zwłaszcza gdy rotacja wyłączona),
   - przycisk **Usuń** (X) → usuwa z `images` (jeśli usuwasz to, co było `defaultUrl`, wyczyść/ustaw nowy default),
   - (opcjonalnie) pole `position` i `alt` w trybie zaawansowanym,
   - (opcjonalnie) zmiana kolejności drag-and-drop → kolejność w `images` = kolejność rotacji.
3. **„Dodaj zdjęcie"** → upload (`POST /admin/uploads`) → dodaj `{ url: PEŁNY_URL }` do `images`.
4. **Zapisz** → `PUT /admin/content/settings` z całym obiektem `{ hero }` (wyślij pełny, aktualny `hero`).

Podpowiedź UX:
- Gdy `rotate = false`, wyróżnij, że pokazywane będzie tylko zdjęcie **domyślne** (podświetl radio default).
- Gdy `rotate = true`, kolejność na liście = kolejność przewijania.

## Pułapki
- `PUT /settings` jest częściowy, ale `hero` wysyłaj **w całości** (cały obiekt), bo nadpisujesz całą konfigurację hero.
- `images` to tablica (może być pusta → strona użyje wtedy wbudowanego fallbacku).
- `defaultUrl` musi być jednym z `images[].url` (albo `null`).
- Nowe zdjęcia: **pełny URL** (`${API_BASE}/uploads/:id`).
- Jeśli `GET /admin/content/settings` nie zwraca pola `hero` → backend wymaga Manual Deploy `icpe-api` (nowa kolumna). Sprawdzenie publiczne: `GET /site/settings`.

## Test akceptacyjny
1. Zakładka Ustawienia pokazuje sekcję Hero z 5 zasianymi zdjęciami.
2. Wyłączenie rotacji + oznaczenie zdjęcia domyślnego → zapis → `GET /site/settings` zwraca `hero.rotate=false` i `defaultUrl`.
3. Po rebuildzie (~1–2 min) strona pokazuje tylko zdjęcie domyślne (bez rotacji).
4. Dodanie nowego zdjęcia (upload) → pojawia się w `images` z pełnym URL → po rebuildzie rotuje na stronie.
5. Usunięcie zdjęcia → znika z rotacji po rebuildzie.
