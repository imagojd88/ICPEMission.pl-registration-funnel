# HANDOFF — „Formacja online": panel kursanta pod `icpemission.pl/formacja/<kurs>`

> Wersja 1 · 2026-09-28 · zastępuje decyzję o subdomenach z `docs/12-plan-panel-kursanta.md` (tam: research hostingu, uzasadnienia, koszty — nadal aktualne).
> **Stan: v1 zaimplementowana 2026-09-28** (kod w repo, testy logiki + E2E strony OK) — czeka na push, Manual Deploy i konfigurację z §6.
> Ten dokument jest **specyfikacją wdrożenia** i punktem startu dla kolejnych sesji. Stan realizacji: patrz `session_notes.md` ▸ „Dziennik prac — panel kursanta".

---

## 1. Cel i zakres v1

- **Wiele kursów jednocześnie.** Każdy kurs ma własny adres `https://icpemission.pl/formacja/<slug>` — slug generuje się z nazwy nadanej przez admina (transliteracja PL, edytowalny).
- Kursant loguje się (e-mail + hasło) i widzi dashboard kursu: **filmy** (Bunny Stream) i **materiały PDF**. Na start: 2 filmy + 2 PDF-y, ale liczba pozycji jest dowolna.
- Admin w panelu rejestracji (`rejestracja.icpemission.pl/admin` ▸ **Formacja online**): tworzy kursy, wgrywa filmy i PDF-y, zarządza kursantami.
- Dostęp: **automatycznie** z powiązanych eventów (zgłoszenie `CONFIRMED`, opcjonalnie już od zapisu) **+ ręcznie** (dodaj / import / odbierz).
- Poza zakresem v1: postęp oglądania, quizy, certyfikaty, moduły/lekcje, DRM, płatność bezpośrednio za kurs.

## 2. Decyzje architektoniczne

| # | Decyzja | Dlaczego |
|---|---|---|
| D1 | Panel kursanta żyje **w stronie Astro** (`site/`), strona `site/src/pages/formacja/[slug].astro` + skrypt kliencki (TypeScript, bez frameworka). | Adres ma być na `icpemission.pl` (statyczna strona Astro na Render). Brak nowych zależności (npm install na FUSE bywa zawodny), styl spójny z landingiem. |
| D2 | Strony kursów **generowane przy buildzie** z `GET /site/courses`; zmiana listy kursów (utworzenie/publikacja/zmiana slugu) wywołuje istniejący **Deploy Hook** strony. Dodatkowo `site/src/pages/formacja/index.astro` = ta sama aplikacja czytająca slug z adresu (fallback dla reguły Rewrite w Render). | Zero zmian w DNS. Nowy kurs działa ~1–2 min po zapisie. Reguła `/formacja/*` → `/formacja/index.html` (Rewrite) w Render czyni to odpornym na nieudany build. |
| D3 | Widoki w jednej stronie, sterowane stanem + parametrem `?haslo=<token>` (ustawienie/reset hasła). | Statyczny hosting — bez podtras. |
| D4 | Wideo: **Bunny Stream** — upload **TUS bezpośrednio z przeglądarki admina** (nasze API tylko podpisuje), odtwarzanie przez **podpisany embed** (4 h). Własny minimalny klient TUS (XHR, porcje 16 MB, wznawianie przez HEAD) zamiast `tus-js-client`. | Gigabajty nie idą przez `icpe-api` (Render free). Brak nowej zależności. |
| D5 | Stan kodowania wideo: **źródłem prawdy jest API Bunny** (GET video). Webhook to tylko „szturchnięcie" (weryfikowany HMAC, gdy ustawiony klucz), panel admina i tak odpytuje. | Uśpiony Render może zgubić webhook; sfałszowany webhook nic nie zmienia. |
| D6 | PDF: model `PrivateFile` (Postgres, ≤ 25 MB), serwowany przez `GET /member/files/:id?exp&sig` (HMAC, 10 min, `no-store`). | Podgląd PDF w przeglądarce nie wyśle nagłówka Authorization. Publiczny `Upload` ma `immutable` cache i brak auth — nie do tego. |
| D7 | Konto kursanta = `GuestAccount` (hasło argon2). JWT realm `member`, **osobny sekret** `MEMBER_JWT_SECRET` (fallback: pochodna `JWT_SECRET`), ważny 7 dni; dostęp do kursu sprawdzany w bazie przy każdym żądaniu. | Odebranie dostępu działa natychmiast. |
| D8 | **E0: `JwtAuthGuard` wymaga `realm === 'admin'`** (tokeny serwisowe bez zmian). | Dziś każdy JWT podpisany `JWT_SECRET` wchodzi na `/admin/*`. |
| D9 | Hook dostępu: globalny `CourseAccessService.syncRegistration(id)` wołany (fire-and-forget) wszędzie, gdzie zmienia się status zgłoszenia + **leniwa synchronizacja przy logowaniu / „nie pamiętam hasła"** (szuka zgłoszenia po e-mailu) + przycisk „Synchronizuj". | Status `CONFIRMED` ustawia 6 miejsc w kodzie — trzy siatki bezpieczeństwa zamiast jednej. |
| D10 | Maile kursowe przez istniejący `NotificationsService` (Resend): `COURSE_WELCOME`, `COURSE_ACCESS`, `MEMBER_PASSWORD_RESET` (PL/EN wg `locale`). Powitania dla kursu w stanie **Szkic** czekają i wychodzą przy publikacji. | Admin może przygotować kurs i listę osób przed startem. |

## 3. Model danych (Prisma)

```prisma
enum CourseStatus { DRAFT PUBLISHED ARCHIVED }
enum CourseItemKind { VIDEO PDF }
enum MemberTokenPurpose { SET_PASSWORD RESET_PASSWORD }

model Course            { id, slug @unique, slugHistory String[], title Json, description Json?, status, sourceInstanceIds String[], grantOn String @default("CONFIRMED") /* | ANY_ACTIVE */, accessUntil DateTime?, items, enrollments, timestamps }
model CourseItem        { id, courseId, kind, title Json, description Json?, order Int, published Boolean @default(true), videoId String?, videoState String? /* UPLOADING|PROCESSING|READY|FAILED */, durationSec Int?, thumbnailUrl String?, fileId String?, timestamps }
model PrivateFile       { id, mimeType, size, originalName?, data Bytes, createdAt }
model CourseEnrollment  { id, courseId, guestId, source String /* AUTO|MANUAL */, registrationId?, revokedAt?, welcomeSentAt?, lastSeenAt?, createdAt, @@unique([courseId, guestId]) }
model MemberToken       { id, guestId, purpose, tokenHash @unique, courseId?, expiresAt, usedAt?, createdAt }
GuestAccount            + enrollments CourseEnrollment[], passwordSetAt DateTime?, lastLoginAt DateTime?
```
Wchodzi przez `prisma db push` przy starcie Render → po pushu **Manual Deploy `icpe-api`**.

## 4. API (`api/src/courses/`)

**Admin** (`JwtAuthGuard`): `GET/POST /admin/courses` · `GET /admin/courses/config` (czy Bunny skonfigurowany) · `GET /admin/courses/slug-check?slug=&excludeId=` · `GET/PATCH/DELETE /admin/courses/:id` · `POST /admin/courses/:id/items/video {title}` → `{ item, upload: { endpoint, headers } }` · `POST /admin/courses/:id/items/pdf` (multipart `file`, `title`) · `PATCH/DELETE /admin/courses/:id/items/:itemId` · `POST /admin/courses/:id/items/:itemId/refresh` · `PUT /admin/courses/:id/items-order {ids}` · `GET/POST /admin/courses/:id/enrollments` · `POST /admin/courses/:id/enrollments/import {text}` · `PATCH /admin/courses/:id/enrollments/:eid {revoked}` · `POST /admin/courses/:id/enrollments/:eid/resend` · `POST /admin/courses/:id/sync`.

**Publiczne:** `GET /site/courses` (build Astro: opublikowane + mapa starych slugów) · `GET /courses/public/:slug` (tytuł/opis; `{ redirectTo }` dla starego slugu) · `POST /webhooks/bunny-stream`.

**Kursant** (`MemberAuthGuard`): `POST /member/auth/login {email,password,slug}` · `POST /member/auth/set-password {token,password}` (zwraca token logowania) · `POST /member/auth/forgot {email,slug}` (zawsze 200) · `GET /member/courses/:slug` · `GET /member/courses/:slug/items/:id/play` → `{ embedUrl, expiresAt }` · `GET /member/courses/:slug/items/:id/file` → `{ url, downloadUrl }` · `GET /member/files/:id?exp&sig[&dl=1]` (bez guardu — podpis).

Podpisy:
- TUS: `AuthorizationSignature = sha256(libraryId + apiKey + expire + videoId)`, nagłówki `AuthorizationExpire`, `VideoId`, `LibraryId`; endpoint `https://video.bunnycdn.com/tusupload`.
- Embed: `https://iframe.mediadelivery.net/embed/<lib>/<videoId>?token=sha256hex(tokenKey + videoId + expires)&expires=<unix>`.
- Webhook: `X-BunnyStream-Signature = hmac-sha256(rawBody, BUNNY_STREAM_WEBHOOK_KEY)`; wymaga `rawBody: true` w `NestFactory.create`.
- PDF: `sig = hmac-sha256(FILE_SIGNING_SECRET, fileId + '.' + exp)` (base64url).

## 5. Dostęp

`syncRegistration(regId)`: dla każdego kursu, którego `sourceInstanceIds` zawiera event zgłoszenia:
- kwalifikuje się: `CONFIRMED`, a przy `grantOn = ANY_ACTIVE` także `PENDING_PAYMENT` / `AWAITING_TRANSFER` → upsert konta po e-mailu z `contact`, upsert enrollmentu `AUTO`, powitanie (jeśli kurs opublikowany i jeszcze nie wysłane);
- nie kwalifikuje się (np. `CANCELLED`) → `revokedAt` tylko dla enrollmentów `AUTO` powiązanych z tym zgłoszeniem.
Miejsca wywołania: `registrations.service` (create, updateStatus, markPaid), `payments.service` (devConfirm), `admin.service` (updateRegistrationStatus, markPaid), `invitations.service` (potwierdzenie → zgłoszenie).
Ręcznie: panel ▸ Kursanci (dodaj, import „e-mail; imię; nazwisko" per linia, odbierz/przywróć, wyślij ponownie). Enrollment `MANUAL` nigdy nie jest odbierany automatycznie.
`accessUntil` (opcjonalne) — po tej dacie dostęp wygasa dla wszystkich.

## 6. Konfiguracja (Jacek)

1. **Bunny.net** → Stream ▸ Add Video Library (region Frankfurt). W bibliotece: Security ▸ *Embed view token authentication* = ON, *Allowed domains* = `icpemission.pl`; Webhook URL = `https://icpe-api.onrender.com/webhooks/bunny-stream`.
2. **Render ▸ icpe-api ▸ Environment:** `BUNNY_STREAM_LIBRARY_ID`, `BUNNY_STREAM_API_KEY` (API key biblioteki), `BUNNY_STREAM_TOKEN_KEY` (Token authentication key), `BUNNY_STREAM_CDN_HOSTNAME` (np. `vz-xxxx.b-cdn.net` — miniatury), opcjonalnie `BUNNY_STREAM_WEBHOOK_KEY` (Read-only API key). `MEMBER_JWT_SECRET` i `FILE_SIGNING_SECRET` generuje Blueprint. `PUBLIC_SITE_URL=https://icpemission.pl` (linki w mailach).
3. **Render ▸ static site strony ▸ Redirects/Rewrites:** `Source /formacja/*` → `Destination /formacja/index.html`, Action **Rewrite** (zalecane, fallback).
4. Push → **Manual Deploy `icpe-api`** → strona przebuduje się sama po pierwszym zapisie kursu (Deploy Hook).
5. Test: kurs „Test" → wgraj krótki film + PDF → opublikuj → dodaj siebie ręcznie → mail → ustaw hasło → `icpemission.pl/formacja/test`.
6. Polityka prywatności: dopisać Bunny (odtwarzanie wideo, UE) i cel „dostęp do kursu online".

## 7. Ryzyka / uwagi
- `icpe-api` na planie free usypia: pierwsze logowanie po przerwie ~30–60 s (UI pokazuje „Łączę się z serwerem…"). Na czas kursu rozważyć plan Starter.
- Zmiana slugu opublikowanego kursu: stary adres przekierowuje (slugHistory), ale maile już wysłane mają stary link — działa dzięki przekierowaniu.
- Nagrywanie ekranu nie jest blokowane (brak DRM) — świadoma decyzja.
- Maile z linkiem ustawienia hasła są zapisywane w dzienniku `Notification.payload` (widoczne tylko w bazie; tokeny jednorazowe i wygasają).
