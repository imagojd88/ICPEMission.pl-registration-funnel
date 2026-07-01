# Prompt (Personal OS) — dodaj zakładkę „Wspólnoty" do panelu CMS

> Wklej do wątku, który zbudował panel „STRONA ICPE — CMS". To dołożenie jednej zakładki obok istniejących **Strony / Aktualności / Menu / Ustawienia**.

## Kontekst
Zbudowałeś już panel CMS pod `/admin/content` (zakładki Strony, Aktualności, Menu, Ustawienia — działają, LIVE). Publiczna strona ICPE (statyczny landing) ma interaktywną **mapę świata** z 19 wspólnotami; pod mapą wyświetla się opis najechanej/klikniętej wspólnoty. **Te opisy są edytowalne przez API i chcemy je edytować z tego panelu.** Dodaj zakładkę **„Wspólnoty"**.

Struktura mapy (współrzędne, piny, grupa) jest bazowa w kodzie strony — z panelu edytujemy **tylko teksty** (nazwa, kraj, tag, opis) w dwóch językach PL/EN.

## Połączenie z API
- Base URL: ten sam host co reszta `/admin/content/*` (prod `https://icpe-api.onrender.com`).
- Autoryzacja: `Authorization: Bearer <SERVICE_TOKEN>` — **ten sam token**, którego już używasz w panelu. Bez nowej autoryzacji.
- `Content-Type: application/json`.

## Endpointy
```
GET   /admin/content/communities         → Community[]   (zawsze 19; seeduje się samo przy pierwszym wywołaniu)
PATCH /admin/content/communities/:id      → Community     (zapis; backend sam wyzwala rebuild strony)
```
> Nie ma create/delete — lista jest stała (19 wspólnot). Tylko odczyt + edycja.

## Model `Community`
```
id      string    // do PATCH w URL
key     string    // stabilny klucz (np. "warszawa") — TYLKO ODCZYT
name    string    // nazwa wyświetlana (edytowalna)
ccPl    string?   // kraj PL      (edytowalne)
ccEn    string?   // kraj EN      (edytowalne)
tagPl   string?   // tag PL, np. "Oddział · Polska" (edytowalne)
tagEn   string?   // tag EN, np. "Branch · Poland"  (edytowalne)
notePl  string?   // OPIS PL — kilka zdań (edytowalne, textarea)
notEn / noteEn string?  // OPIS EN — kilka zdań (edytowalne, textarea)
lat, lng, grp, order   // strukturalne — TYLKO ODCZYT, nie wysyłaj w PATCH
```
Pola edytowalne (wysyłane w PATCH): `name, ccPl, ccEn, tagPl, tagEn, notePl, noteEn`. Reszta jest read-only.

## UI (zakładka „Wspólnoty")
1. Nowa zakładka **„Wspólnoty"** w tym samym pasku co Strony/Aktualności/Menu/Ustawienia.
2. Po wejściu: `GET /admin/content/communities` → lista **posortowana po `order`** (Warszawa pierwsza, potem Kraków, Lublin, Malta, Fraternia, dalej świat).
3. Każdy wiersz listy: `name` + `key` (mały, szary) jako etykieta; rozwijany/otwierany edytor.
4. Edytor pojedynczej wspólnoty — pola:
   - **Nazwa** (`name`) — input
   - **Kraj PL / Kraj EN** (`ccPl` / `ccEn`) — dwa inputy
   - **Tag PL / Tag EN** (`tagPl` / `tagEn`) — dwa inputy
   - **Opis PL** (`notePl`) — **textarea** (kilka zdań)
   - **Opis EN** (`noteEn`) — **textarea**
   - przycisk **Zapisz** → `PATCH /admin/content/communities/:id` z tylko zmienionymi polami.
5. `key`, współrzędne i grupa — pokaż ewentualnie jako read-only (szare), **nie wysyłaj** ich w PATCH.
6. Po zapisie: komunikat typu „Zapisano — strona zaktualizuje się w ciągu ~1–2 min" (rebuild jest automatyczny po stronie backendu, **nie wołaj żadnego Deploy Hooka**).

## Pułapki
- `PATCH` jest częściowy — wyślij tylko zmienione pola.
- Nie twórz ani nie usuwaj wspólnot (stałe 19). Brak przycisków „Nowa/Usuń".
- Nie edytuj `key/lat/lng/grp/order` — mapa łączy dane po `key`, zmiana rozjedzie opis z pinem.
- Jeśli `GET /admin/content/communities` zwraca błąd → backend `icpe-api` wymaga Manual Deploy (nowa tabela `Community`). Publiczny odczyt do sprawdzenia: `GET /site/communities`.

## Test akceptacyjny
1. Zakładka „Wspólnoty" pokazuje 19 pozycji (Warszawa pierwsza).
2. Zmiana **Opisu PL** dla „Warszawa" → Zapisz → `PATCH` zwraca zaktualizowany rekord.
3. `GET /site/communities` (publicznie) pokazuje nowy `notePl`.
4. Po ~1–2 min (rebuild) opis pod mapą na stronie zmienia się na nowy.
