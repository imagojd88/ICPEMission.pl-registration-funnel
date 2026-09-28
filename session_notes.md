# Session Notes — ICPEMission.pl

> Dziennik prac projektu. **Zasada: każda sesja dopisuje tu swoje zmiany** (co zrobione, gdzie, dlaczego, stan wdrożenia). Najnowsze wpisy na górze sekcji.

---

## Stack i wdrożenie (skrót)

- **Monorepo** npm workspaces: `app/` (React 18 + Vite + TS + Tailwind), `api/` (NestJS 10 + Prisma + PostgreSQL), `shared/` (kontrakt + silnik wyceny).
- **Vendored shared:** `api/` importuje z `'../shared'` = `api/src/_shared/` — musi być lustrem `shared/src/` (silnik pricingu).
- **Baza:** Render Postgres `icpe-db` na planie **basic-256mb** (podniesiona z free w sierpniu 2026). W `render.yaml` musi być `plan: basic-256mb` — wpisanie `free` psuje CAŁY sync Blueprintu (`cannot downgrade database from Basic-256mb to Free`) przy każdym pushu.
- **Backend:** Render Web Service `icpe-api` (Blueprint/`render.yaml`). **Auto-Deploy domyślnie WYŁĄCZONY** → po zmianach w backendzie trzeba **Manual Deploy** (zalecane włączyć Auto-Deploy). API URL: `https://icpe-api.onrender.com`.
- **Frontend:** Render Static Site `icpe-frontend` — auto-deploy po pushu.
- **Strona icpemission.pl:** Render Static Site `icpe-site` — `srv-d92mumvaqgkc73fda3sg` · panel: https://dashboard.render.com/static/srv-d92mumvaqgkc73fda3sg · reguły: https://dashboard.render.com/static/srv-d92mumvaqgkc73fda3sg/redirects (Formacja online: Rewrite `/formacja/*` → `/formacja/index.html`).
- **Prisma:** zmiany schematu wchodzą przez `prisma db push` przy starcie Render (nowe nullable pola/tabele dodają się same).
- **CORS:** `origin: true` w `main.ts`.
- **SMTP:** nodemailer przez dynamiczny import + ambient shim (`api/src/nodemailer-shim.d.ts`). Konfiguracja przez ENV na Render (`MAIL_MODE=smtp`, `SMTP_HOST/PORT/USER/PASS/SECURE`, `MAIL_FROM`) jako `sync:false` w `render.yaml`. Dostawca: **Brevo** — UWAGA: NIE włączać blokowania nieautoryzowanych IP (Render ma dynamiczne IP).

### Ograniczenia sandboxa (dla przyszłych sesji)
- `npm install` w sandboxie zawodzi (FUSE ENOTDIR); `git` z sandboxa zawodzi (FUSE lock) → **user robi push**.
- `prisma generate` zwraca 403 na silniku (checksum) — nieszkodliwe, typy się generują.
- `vite build` na zamontowanym katalogu potrafi paść na `rimraf` (FUSE) → budować z `--outDir /tmp/...`.
- Weryfikacja: `npx tsc --noEmit` per workspace + `npx vite build`.

### Komenda push (user)
```bash
cd "/Users/jacekdudzic/Documents/Claude/Projects/ICPEMission.pl registration funnel" && git add -A && git commit -m "<opis>" && git push
```

---

## Wzorce przechowywania danych

- `EventSeries.type` — typ eventu: `ONE_TIME` | `STANDALONE` | `INVITE`.
- `RegistrationPage.theme` (JSON): `primaryColor, heroImageUrl, titleColor, badge, supertitle`.
- `RegistrationPage.paymentInfo` (JSON): `{ recipient, account }` — dane przelewu per event.
- `RegistrationPage.customFields` (JSON): `{ program: [{time,item}], specialGuest: {name, photoUrl, plural?, bio?} }` — `plural` przełącza etykietę „Gość specjalny"/„Goście specjalni", `bio` to mapa językowa (1–2 zdania o gościach).
- `pricingConfig` (JSON): dodane `free?: boolean` (event bezpłatny).
- `Registration`: `checkedInAt`, `roomLabel`, `roomNote`, `roomsJson`.
- `Invitation` (model): `token @unique`, `confirmedAt`, `dietaryNotes`.
- `Place` (model): zapisywane lokalizacje `{ id, label, createdAt }`.

---

## Dziennik prac — panel kursanta (kurs online)

### Reset hasła kursanta z panelu (2026-09-28)
- Panel ▸ kurs ▸ **Kursanci**: przy każdej aktywnej osobie ikona klucza → panel z dwiema opcjami:
  - **Wyślij link mailem** — `POST /admin/courses/:id/enrollments/:eid/reset-link`: konto z hasłem → mail `MEMBER_PASSWORD_RESET` z linkiem ważnym **48 h** (samoobsługowy „Nie pamiętam hasła" nadal 1 h; treść maila liczy godziny: „ważny 1 godzinę / 48 godzin"); konto bez hasła → mail powitalny „Ustaw hasło". Wymaga opublikowanego kursu. Zdarzenie RESET_REQUEST (meta.by=admin).
  - **Ustaw hasło ręcznie** — `POST …/enrollments/:eid/password {password}` (min. 8; przycisk „Generuj" daje czytelne 10 znaków bez 0/O/1/l/I). Hasło dotyczy konta (wszystkie kursy tej osoby); unieważnia niewykorzystane linki „ustaw hasło"; zdarzenie PASSWORD_SET (meta.by=admin). Po zapisie panel pokazuje hasło raz + „Kopiuj dane logowania" (e-mail + hasło) — nigdzie nie jest przechowywane jawnie.
- **Bezpieczeństwo:** zmiana hasła (przez admina albo przez kursanta) wylogowuje wcześniejsze sesje — `MemberAuthGuard` przekazuje `iat`, `requireAccess` odrzuca token wydany przed `GuestAccount.passwordSetAt` (tolerancja 2 s).
- Pliki: `course-access.service.ts` (sendPasswordReset z TTL, zwraca status), `courses.service.ts` (sendResetLink, setPasswordManually), `courses.admin.controller.ts`, `member-auth.guard.ts`, `member.service.ts`, `notifications.service.ts`, `app/src/lib/courses.ts`, `CourseMembersTab.tsx` (PasswordPanel).
- Testy: logika (fake Prisma) — walidacja, logowanie nowym hasłem, stare linki unieważnione, mail 48 h / 1 h, wylogowanie starych sesji ✓; poprzednie zestawy ✓; Chromium (mock) — wyślij link, generuj + ustaw, kopiowanie danych ✓; tsc api/app ✓. Wymaga Manual Deploy `icpe-api` (nowe endpointy; bez zmian schematu).

### Admin wchodzi do kursu bez logowania (2026-09-28)
- Zgłoszenie usera: klik w adres kursu w panelu kazał się logować; przycisku „Podgląd jako kursant" nie widział (zrzut z wersji sprzed deployu frontu — zakładki bez „Aktywność").
- **Adres kursu w nagłówku edytora i „Otwórz" na liście kursów** otwierają teraz stronę kursu od razu zalogowaną (token podglądu admina), także dla szkicu; obok „Kopiuj link dla kursantów" (zwykły adres z ekranem logowania).
- Token podglądu admina: **30 dni** (było 12 h) — zapisany w przeglądarce, więc także zwykły adres kursu (np. z maila) otwiera się bez logowania. Strona: przy 404 publicznego kursu (szkic), gdy jest zapisany token → próbuje `loadCourse` (admin zobaczy szkic).
- Pliki: `CourseEditor.tsx` (link + `CopyLink`), `CoursesScreen.tsx`, `member.service.ts` (30d), `course-app.ts`. Testy Chromium (mock): lista „Otwórz" i klik w adres → od razu dashboard z banerem; ponowne wejście na zwykły adres bez logowania; wcześniejsze scenariusze strony ✓. tsc api/app ✓, astro build ✓.

### Formacja online — śledzenie aktywności kursantów + podgląd admina (2026-09-28)
**Decyzje usera:** filmy = % obejrzenia (nie tylko „kliknął Play"); informacja o śledzeniu **tylko w polityce prywatności** (bez notki na stronie kursu — do dopisania przez Jacka); raport: tabela postępów + historia per osoba + CSV. Dodatkowo: admin ma mieć dostęp do każdego kursu.
- **Model:** `CourseEvent` (courseId, guestId, itemId?, type, meta, createdAt) — typy: LOGIN, COURSE_VIEW (max 1×/30 min), VIDEO_PLAY, PDF_OPEN, PDF_DOWNLOAD (meta.lang), EMAIL_LINK (otwarcie linku ?haslo z maila, meta.purpose), PASSWORD_SET, RESET_REQUEST. `VideoProgress` (@@unique itemId+guestId): `buckets` = ciąg '0/1' 10-sekundowych odcinków (scalany OR → przewijanie/powtórki nie zawyżają), `percent`, `positionSec`, `completedAt` (≥90%).
- **Backend:** `api/src/courses/course-tracking.service.ts` (log fire-and-forget, recordProgress, activity, history, csv, purge). Endpointy: `POST /member/courses/:slug/items/:id/progress`, `POST /member/auth/link-open` (loguje kliknięcie + zwraca czy link ważny), `GET …/file?action=open|download`; admin: `GET /admin/courses/:id/activity`, `/activity/:enrollmentId`, `/activity.csv` (średniki, UTF-8 BOM, polski Excel), `POST /admin/courses/:id/preview`. Usunięcie kursu/materiału sprząta zdarzenia i postęp.
- **Podgląd admina:** `POST /admin/courses/:id/preview` → token kursanta z `adm: true` (12 h) w `#podglad=` (fragment — nie trafia do serwera/logów, strona usuwa go z adresu). `MemberAuthGuard` → `req.member.admin`; `MemberService.requireAccess` dla admina: każdy kurs, także SZKIC i archiwum, bez enrollmentu; **zero zapisów aktywności** (play zwraca `track:false`, progress pomijany). Strona pokazuje żółty baner „Podgląd administratora…" (+ „kurs jest szkicem"). Szkic nie ma statycznej strony → działa przez regułę Rewrite `/formacja/*` (ustawiona w `icpe-site`).
- **Strona (course-app.ts):** tracker Bunny **Player.js** (skrypt `assets.mediadelivery.net/playerjs/playerjs-latest.min.js` ładowany przy pierwszym filmie): timeupdate → odcinki; wysyłka co 15 s + pause/ended/zamknięcie playera/ukrycie karty/pagehide (`fetch keepalive`). Brak skryptu → film działa, tylko bez statystyk. Wygasły/zużyty link z maila → od razu widok „Nie pamiętam hasła" z komunikatem.
- **Panel:** zakładka **Aktywność** (`CourseActivityTab.tsx`): kafelki per film (ile osób obejrzało ≥90% / rozpoczęło), tabela kursant × materiały (pasek % + ✓, PDF „otw. N · pobr. N"), klik → historia (filmy z pozycją + lista zdarzeń), filtr „tylko z dostępem", CSV. Przycisk **„Podgląd jako kursant"** w nagłówku kursu.
- Weryfikacja: tsc api/app ✓, astro check 0 błędów ✓, schema valid ✓; testy logiki (fake Prisma): podgląd admina bez śladów, komplet zdarzeń, COURSE_VIEW 1× mimo 2 wizyt, postęp 50%→90% z przewijaniem, walidacja śmieciowych indeksów, raport/historia/CSV, sprzątanie ✓; poprzednie testy (kursy, PDF PL/EN) ✓; Chromium (mock API): zakładka Aktywność + historia + pobranie CSV, podgląd szkicu z banerem i usunięciem tokenu z adresu, wygasły link ✓. **Nie testowane:** realne zdarzenia Player.js z Bunny (CDN niedostępny z sandboxa) — sprawdzić po wdrożeniu: obejrzeć 1 min filmu jako kursant → Aktywność pokaże ~% .
- **Po pushu:** Manual Deploy `icpe-api` (tabele CourseEvent, VideoProgress). Jacek: dopisać do polityki prywatności zapis aktywności w kursie (logowania, otwarcia materiałów, postęp oglądania; cel: prowadzenie formacji; odbiorca: Bunny.net jako hosting wideo).

### Formacja online — poprawki po pierwszym użyciu + „Zapamiętaj mnie" w panelu (2026-09-28)
- **Zapamiętaj mnie (panel admina):** checkbox na ekranie logowania (domyślnie zaznaczony, wybór pamiętany w `icpe_admin_remember`). Backend: `POST /auth/admin/login {remember}` → token 30 dni (`ADMIN_REMEMBER_TTL`, domyślnie `30d`) albo 12 h (`ADMIN_SESSION_TTL`, domyślnie `12h`; wcześniej 15 min z `JWT_EXPIRES_IN`). Claim `rmb` w JWT. Nowy `POST /auth/admin/refresh` (JwtAuthGuard, tylko realm admin, sprawdza czy konto istnieje) — **sesja przesuwna**: `maybeRenewAdminToken()` w `app/src/lib/api.ts` odnawia token po minięciu połowy ważności (przy wejściu, co 1 h, po powrocie do karty). `AdminPanel`: wygasły token → od razu ekran logowania; 401 z dowolnego zapytania → zdarzenie `icpe-admin-auth-changed` → ekran logowania (wcześniej panel „wisiał" z błędami). Unieważnienie wszystkich sesji: zmiana `JWT_SECRET`.
- **Tytuły EN:** formularz „Dodaj film" i „Dodaj PDF" mają pole tytułu EN; edycja pozycji: tytuł + opis PL/EN; lista pokazuje „EN: …" albo „brak tytułu EN".
- **PDF osobno PL i EN:** `CourseItem.fileIdEn` (nowa kolumna, nullable). `POST /admin/courses/:id/items/:itemId/file?lang=pl|en` (wgranie/podmiana wersji), `DELETE …/file?lang=` (nie pozwala usunąć ostatniej wersji). `createPdf` przyjmuje `lang`. Kursant: `GET …/items/:id/file?lang=` → wersja w języku strony, fallback do drugiej; strona pokazuje „dostępny tylko po angielsku / available in Polish only". Panel: przy materiale wiersze PL/EN z Dodaj/Zamień/Usuń; „Dodaj PDF" ma dwa pola plików.
- **UX po zgłoszeniu usera (kurs „Przygotowanie do Przymierza" został w szkicu, strona 404):** przycisk **„Opublikuj kurs" w nagłówku edytora** (nie tylko w Ustawieniach) + wyraźniejszy komunikat szkicu; status „Wysyłanie…" zamiast mylącego „Czeka na plik" w trakcie uploadu; miniatura przed zakodowaniem nie pokazuje zepsutego obrazka.
- **Upload filmu nie przerywa się po wyjściu z edytora:** nowy `app/src/lib/uploadStore.ts` (magazyn poza Reactem, `useSyncExternalStore`) — upload trwa przy przełączaniu kursów/modułów; przerywa go tylko zamknięcie/odświeżenie karty (ostrzeżenie `beforeunload`). Lista kursów pokazuje „Wysyłanie filmu: X%".
- Weryfikacja: tsc api/app ✓, vite build ✓, astro check 0 błędów ✓; testy: auth (30d/12h, refresh zachowuje długość, konto usunięte/serwisowy odrzucone), fake-Prisma kursy (10 scenariuszy) + PDF PL/EN (wybór, fallback, ochrona ostatniej wersji, sprzątanie plików) ✓; Chromium: logowanie z/bez „Zapamiętaj", przedłużanie, wygasły token, 401→logowanie; upload przetrwał wyjście z edytora i zmianę modułu, publikacja z nagłówka ✓.
- **Po pushu:** Manual Deploy `icpe-api` (kolumna `fileIdEn`, endpoint refresh). Stare tokeny admina (15 min) wygasną — jedno logowanie z zaznaczonym „Zapamiętaj mnie".

### WDROŻENIE v1 „Formacja online" — kod gotowy, czeka na push + konfigurację (2026-09-28)
**Zmiana decyzji usera:** adres **`icpemission.pl/formacja/<slug>`** (bez subdomen/wildcard DNS), **wiele kursów równolegle**. Spec: `docs/13-handoff-formacja-online.md` (zastępuje część o subdomenach w `docs/12`).

**Backend (`api/`):**
- **E0 bezpieczeństwo:** `auth/jwt-auth.guard.ts` — JWT przechodzi tylko z `realm === 'admin'` (wcześniej każdy JWT podpisany `JWT_SECRET`). Tokeny serwisowe bez zmian.
- Prisma: `Course`, `CourseItem`, `PrivateFile`, `CourseEnrollment` (z `revokedReason` ADMIN/AUTO), `MemberToken`, enumy; `GuestAccount` + `enrollments`, `passwordSetAt`, `lastLoginAt`. Wszystko nowe/nullable → `prisma db push` na starcie.
- Nowy katalog `api/src/courses/`: `course-utils.ts` (slugify PL, podpisy HMAC PDF, sekret member JWT, limiter prób w pamięci), `bunny-stream.service.ts` (create video, podpis TUS, stan z API — źródło prawdy, podpisany embed, weryfikacja webhooka), `course-access.service.ts` + `course-access.module.ts` (**@Global**: grant/revoke AUTO/MANUAL, maile powitalne, tokeny, `reconcileCourse`, leniwe `syncByEmail`), `courses.service.ts` + `courses.admin.controller.ts` (`/admin/courses/*`), `member.service.ts` + `member-auth.guard.ts` + `courses.public.controller.ts` (`/site/courses`, `/courses/public/:slug`, `/member/auth/*`, `/member/courses/*`, `/member/files/:id`, `/webhooks/bunny-stream`), `courses.module.ts`.
- Hooki dostępu `courseAccess.syncRegistrationSafe(id)` w: `registrations.service` (create, adminUpdate, update, updateStatus, markPaid), `payments.service` (devConfirm), `admin.service` (updateRegistrationStatus, markPaid), `invitations.service` (upsert zgłoszenia przy potwierdzeniu).
- `main.ts`: `NestFactory.create(AppModule, { rawBody: true })` (HMAC webhooka). `ContentModule` eksportuje `DeployHookService` (rebuild strony po publikacji/zmianie kursu).
- Maile (`notifications.service.ts`): `COURSE_WELCOME` (ustaw hasło, 14 dni), `COURSE_ACCESS` (konto z hasłem), `MEMBER_PASSWORD_RESET` (1 h) — PL/EN.
- `render.yaml`: `MEMBER_JWT_SECRET`, `FILE_SIGNING_SECRET` (generateValue), `PUBLIC_SITE_URL`, `BUNNY_STREAM_*` (sync:false). `.env.example` uzupełniony.

**Panel admina (`app/`):** sidebar ▸ **Formacja online** (`components/admin/courses/*`): lista kursów, tworzenie (slug na żywo + walidacja), edytor z zakładkami Zawartość (film: upload TUS z paskiem postępu i wznawianiem, stan kodowania odpytywany co 10 s; PDF ≤25 MB; kolejność, ukrywanie, edycja tytułów, usuwanie), Kursanci (dodaj, import listy, synchronizuj z eventami, odbierz/przywróć, wyślij ponownie powitanie), Ustawienia (publikacja/archiwum/szkic, nazwa PL/EN, opis, adres z przekierowaniem starego, eventy źródłowe, „dostęp od: potwierdzenia | zapisu”, data wygaśnięcia, usuwanie z potwierdzeniem slugiem). `lib/courses.ts`, `lib/tusUpload.ts` (własny klient TUS, bez zależności). `lib/api.ts`: eksport `API_URL`, `apiFetch`. MailSettings: etykiety nowych maili.

**Strona (`site/`):** `pages/formacja/[slug].astro` (strony z `/site/courses` + strony-przekierowania starych slugów), `pages/formacja/index.astro` (lista kursów + fallback reguły Rewrite), `components/CourseApp.astro` (style `is:global` z prefiksem `ca-` — lekcja z WorldMap), `scripts/course-app.ts` (logowanie, `?haslo=` ustaw/reset hasła, „nie pamiętam hasła”, dashboard: filmy w iframe Bunny, PDF przez podpisany link; PL/EN; komunikat o wybudzaniu serwera). `LandingLayout` + prop `noindex`.

**Weryfikacja (w kontenerze na kopii repo):** `tsc --noEmit` api ✓ i app ✓ (prisma generate `--no-engine`, schema valid), `vite build` ✓, `astro check` 0 błędów ✓, `astro build` ✓. **Test logiki backendu** (fake Prisma, 10 scenariuszy): slugi, dostęp AUTO/grantOn, publikacja→powitania+deploy hook, ustaw hasło (jednorazowy token), guard admina odrzuca tokeny kursanta, guard kursanta odrzuca admina, treść tylko READY/published, podpisy PDF/embed/TUS, logowanie, anulowanie/odebranie przez admina (auto nie przywraca), leniwa synchronizacja w „nie pamiętam hasła”, import, zmiana slugu→przekierowanie, archiwum — **OK**. **Test E2E strony w Chromium** (mock API): login, błędne hasło, dashboard, player, PDF w nowej karcie, PL/EN, sesja po reloadzie, wylogowanie, `?haslo=`, forgot, przekierowanie, fallback Rewrite, 404, lista, mobile bez poziomego scrolla — **OK**. Nie testowane na żywo: realne API Bunny (egress sandboxa blokuje), baza Render.

**Po stronie Jacka (kolejność):**
1. Push (przed nim `rm -f .git/index.lock` — sandbox zostawia pusty lock).
2. Render ▸ `icpe-api` ▸ **Manual Deploy** (nowe tabele). Blueprint sync doda `MEMBER_JWT_SECRET`, `FILE_SIGNING_SECRET`, `PUBLIC_SITE_URL`.
3. Bunny.net: Stream ▸ biblioteka (Frankfurt) ▸ Security: *Embed view token authentication* ON, *Allowed domains* `icpemission.pl`; webhook `https://icpe-api.onrender.com/webhooks/bunny-stream`. Klucze do Render: `BUNNY_STREAM_LIBRARY_ID`, `BUNNY_STREAM_API_KEY`, `BUNNY_STREAM_TOKEN_KEY`, `BUNNY_STREAM_CDN_HOSTNAME`, opcjonalnie `BUNNY_STREAM_WEBHOOK_KEY`.
4. Render ▸ static site strony ▸ Redirects/Rewrites: `/formacja/*` → `/formacja/index.html` (Rewrite) — zalecane.
5. Test: kurs „Test” → film + PDF → Opublikuj → dodaj siebie → mail → ustaw hasło.
- Plik roboczy: `.verify-bundle.tgz` w katalogu projektu (paczka do weryfikacji, gitignored — można usunąć).
- Otwarte / v2: znak wodny w PDF, postęp oglądania, handoff Personal OS (API gotowe na token serwisowy), polityka prywatności (Bunny).

### Plan panelu kursanta + research hostingu wideo (2026-09-28) — TYLKO PLAN, bez zmian w kodzie
- Plan: `docs/12-plan-panel-kursanta.md` (architektura, porównanie hostingu, model danych, API, UI, DNS, etapy E0–E6, checklista dla Jacka).
- **Decyzje usera:** dostęp AUTO (zgłoszenie z powiązanego eventu) + RĘCZNY; logowanie e-mail + hasło (mail „Ustaw hasło"); **adres zmienny z nazwy kursu nadawanej przez admina → subdomena `<slug>.icpemission.pl`** (wildcard `*` CNAME → `icpe-frontend`, fallback `/k/:slug`); plan jako markdown w repo.
- **Wideo — rekomendacja Bunny Stream** (Frankfurt, TUS upload z przeglądarki admina bez przechodzenia przez icpe-api, podpisany embed `SHA256(tokenKey+videoId+expires)`, webhook HMAC, ~$1/mies. przy tej skali). Alternatywy opisane: AWS S3+CloudFront(+MediaConvert), Cloudflare Stream (~$11/mies.), Mux (free: 10 filmów + badge).
- PDF: nowy model `PrivateFile` (Postgres, ≤25 MB) + podpisane linki 10 min — NIE przez publiczne `Upload` (to ma cache immutable i brak auth).
- **Znalezisko bezpieczeństwa (E0, blokujące):** `JwtAuthGuard` nie sprawdza `realm` — każdy JWT podpisany `JWT_SECRET` wchodzi na `/admin/*`. Przed wydaniem tokenów kursantom: wymusić `realm==='admin'` + osobny `MEMBER_JWT_SECRET`.
- **Znalezisko:** zgłoszenia zawsze startują jako PENDING_PAYMENT/AWAITING_TRANSFER (także przy `free: true`), CONFIRMED ustawiają: payments.service, registrations.service (updateStatus/markPaid), admin.service, invitations.service → tam wpiąć `syncRegistration`; dla kursów darmowych ustawienie `grantOn=ANY_ACTIVE`.
- Następny krok: po akceptacji planu start od E0 (guard) → E1. Po stronie Jacka: konto Bunny + ENV, DNS wildcard + custom domain `*.icpemission.pl` w Render (sprawdzić limit domen planu), rozważyć płatny plan `icpe-api` na czas kursu.

---

## Dziennik prac — strona ICPE Mission PL (CMS)

### Nowy cytat: ks. Jerome Barnabas (2026-09-05)
- Piąty slajd rotatora „Kim jesteśmy" (dodany przed `div.quote-dots`, po slajdzie Jacka): PL „Zawsze zadawałem sobie pytanie: «Jaki jest mój prawdziwy cel w życiu?»…", EN „I always questioned myself: ‘What is my true purpose in life?’…". Redakcja: uporządkowane cudzysłowy zagnieżdżone («…»/‘…’), „ICPE MISSION" → „ICPE Mission", usunięta podwójna spacja. Podpis: ks./fr. Jerome Barnabas, podtytuł „ICPE Mission" (brak roli od usera — do ew. uzupełnienia). Zdjęcie od usera → `site/public/uploads/jerome-barnabas.jpg`. Build OK.

### Nowy cytat założycieli (Cappello) w „Kim jesteśmy" (2026-09-05)
- Slajd 1 (Anna & Mario Cappello): nowy cytat PL „Bóg otworzył drzwi przekraczające wszelkie wyobrażenia…", EN „God opened doors beyond imagination…". Poprawki redakcyjne względem tekstu usera: EN „will you to say" → „will you say", usunięta podwójna spacja; cudzysłowy zagnieżdżone «tak» / ‘yes’.
- Ostatni slajd (Jacek Dudzic) zachowuje STARY tekst („Wspólnota ICPE urodziła się z ziarenka…") — ten sam cytat pod dwoma podpisami to stan zamierzony. Build OK: nowy 1×, stary 1× w dist.

### Rotacja cytatów „Kim jesteśmy" zwolniona (2026-08-01)
- Interwał rotatora cytatów w `index.astro`: 8000 → 16000 ms (user: trudno nadążyć z czytaniem). Hover nadal pauzuje. Build OK.

### Poprawki treści landingu — 7 zmian PL/EN (2026-08-01)
- **Bogotá → Medellín** wszędzie: ticker (`index.astro`), pinezka mapy (`WorldMap.astro`: nazwa + współrzędne 6.24/-75.58), seed (`community-seed.ts`). **Klucz `bogota` celowo bez zmian** (łączy z istniejącym rekordem opisu w CMS; seed i tak działa tylko na pustej bazie). Nazwa w panelu CMS w bazie nadal „Bogotá" — mapa bierze nazwę z kodu, więc bez wpływu na stronę; ewentualnie poprawić ręcznie w Personal OS.
- **Ticker dwujęzyczny**: rozbity na `data-pl`/`data-en`; EN: „Seoul · Singapore". Pinezki mapy: `name` → „Seoul", „Singapore" (jedno pole dla obu języków — decyzja usera; `ccPl` „Singapur" jako kraj zostaje).
- **Kim jesteśmy**: EN dodane „founded in Malta by Mario and Anna Cappello with a small group of courageous companions in 1985"; PL analogicznie („przez Mario i Annę Cappello wraz z niewielką grupą odważnych towarzyszy").
- **Nad mapą**: „One community · one world" → „Our locations around the globe" (poprawiona literówka usera „our the globe" — potwierdzone); PL → „Nasze wspólnoty na całym świecie". H2 „From Malta to Wellington." → „Institute For World Evangelisation"; PL → „Instytut Ewangelizacji Świata".
- **Stopka**: „Part of the Institute…" → „Institute for World Evangelisation – ICPE Mission."; PL bez „Część".
- **CTA**: „Write to the Warsaw community…" → „Drop us a line or visit us at one of our events."; PL → „Napisz do nas lub odwiedź nas…".
- Weryfikacja: astro build + check = 0 błędów (build z kopii w /tmp — `npm install` na FUSE zawodzi), grep w dist/index.html potwierdza wszystkie nowe teksty i brak starych; api `tsc --noEmit` OK.
- Wdrożenie: push → auto-deploy static-site strony; zmiana w `community-seed.ts` czysto kosmetyczna dla istniejącej bazy (Manual Deploy `icpe-api` niekonieczny).

### Poprawki treści landingu (tagi mapy, zdania)
- Tagi wspólnot na mapie: usunięte „Oddział · …", „Ten dom · hub", „Serce wspólnoty", „Fraternia", „Oddział · od 1996" → zostaje sam kontynent (Europa/Azja/Afryka/Oceania/Ameryka Płn./Ameryka Płd. + EN). Zmienione w DWÓCH miejscach: `WorldMap.astro` (dane bazowe/fallback) i `api/src/content/community-seed.ts` (seed CMS) — żeby po wdrożeniu Community CMS nie nadpisał nowych wartości starymi.
- Zdanie nad mapą → „ICPE Warszawa to jedna z 23 wspólnot Instytutu Ewangelizacji Świata – ICPE Mission na świecie. Zobacz, gdzie jeszcze jesteśmy obecni." (+ EN).
- Zdanie w CTA → „Napisz do wspólnoty warszawskiej lub odwiedź nas na jednym z naszych wydarzeń." (+ EN).
- Weryfikacja: astro build + check = 0 błędów, api tsc OK.
- „Napisz do nas" → **mailto** `warszawa@icpemission.pl` (wybór usera). Antyspam: adres jako base64 w `data-mail`, `mailto:` (z tematem „Kontakt — ICPE Mission Warszawa") składany w JS przy załadowaniu → w źródle HTML brak wzorca „x@y" (zweryfikowane: 0 wystąpień plaintextu). Podpięte: przycisk w nawigacji, przycisk w banerze CTA, oraz zakodowany link w stopce (JS pokazuje adres jako tekst). Fallback bez JS: `href="#kontakt"` (scroll do stopki). Klasa `.js-mail` + skrypt w index.astro.

### Hero: 3 dodatkowe zdjęcia + sterowanie z CMS (SiteSettings.hero)
- Dodane hero_3/4/5.jpg do rotacji (razem 5 slajdów; object-position dobrane pod kadr 420px).
- Hero przeniesione z hardcode na CMS: `SiteSettings.hero` Json `{ rotate, defaultUrl, images:[{url,position?,alt?}] }`. Backend: schema + `getSettings` zasiewa DEFAULT_HERO (5 obecnych zdjęć) przy pierwszym odczycie; `putSettings` przyjmuje `hero`. `content.service.ts`.
- Astro `index.astro`: `getSettings()` przy buildzie → render hero z `hero.images`; `rotate=false` → tylko domyślne (defaultUrl lub pierwsze). Fallback do 5 wbudowanych, gdy API puste/down. Crossfade CSS/JS bez zmian.
- URL zdjęć: zasiane = względne `/uploads/*` (statyki strony); nowe z Personal OS = PEŁNY URL `${API_BASE}/uploads/:id` (strona i API to różne domeny!).
- Handoff dla Personal OS: `docs/09-prompt-personal-os-hero.md` (sekcja Hero w Ustawieniach: toggle rotacji, dodaj/usuń zdjęcie, oznacz domyślne).
- Po pushu: Manual Deploy `icpe-api` (nowa kolumna `hero` + seed). Do tego czasu strona i tak pokazuje 5 zdjęć (fallback).

### „Kim jesteśmy" — rotator cytatów
- Blok cytatu (dot. założycieli) zamieniony na rotator: `.quotes[data-quotes]` z `<figure class="quote">` (każdy = cytat PL/EN + podpis: zdjęcie opcjonalne + nazwa + rola PL/EN). Pierwszy = założyciele (`is-active`), zawsze na starcie.
- CSS: `.quote{display:none}`, `.quote.is-active{display:block; @keyframes quoteFade}`, `.quote-dots button(.is-on)`.
- JS (is:inline w index.astro): auto-rotacja co 8s tylko gdy >1 cytat, pauza na hover, kropki budowane dynamicznie; przy 1 cytacie kropki ukryte i brak rotacji. Język przez CSS (data-pl/data-en).
- DO DODANIA: kolejne cytaty od usera — wstawiać `<figure class="quote">…</figure>` przed `<div class="quote-dots">`. Format cytatu: tekst PL + EN, nazwa autora, rola PL + EN, opcjonalnie zdjęcie (URL w /uploads).
- Cytat #2: ks. Sławomir Pawłowski SAC (PL/EN, bez roli). Zdjęcie: `site/public/uploads/ks-pawlowski.jpg` (user zapisuje sam — plik niedostępny z sesji).
- Cytat #3: John Paul, ICPE Mission Warszawa/Warsaw (name + rola). Zdjęcie: `site/public/uploads/john-paul.jpg` (user zapisuje; to szeroka fotka ze sceny → mocny zoom w okrągłym kadrze, object-position 48% 27%). Drobne poprawki gramatyczne w EN (helped me grow / to make him known / przecinki) — do rewertu jeśli user chce verbatim. Rotacja: 3 slajdy, założyciele zawsze pierwsi.

### Stopka — linki zewnętrzne + social
- Przebudowa stopki na 4 kolumny (marka+e-mail, Nawigacja, „ICPE w sieci", „Social"); na mobile 1 kolumna.
- ICPE w sieci: ICPE International (icpe.org), ICPE Book (icpebook.org), HopeXchange (hopexchangemedicalcenter.org).
- Social: Instagram (icpemission360), FB ICPE Warszawa (id=61583565058942), FB Seminary (ICPEMissionSeminary), FB ICPE 360 (id=100068380218392). Wszystkie `target="_blank" rel="noopener noreferrer"`.
- E-mail (mailto base64) przeniesiony do kolumny marki.

### Domena icpemission.pl podpięta (ZROBIONE przez usera)
- DNS (nameservery aderlo.cloud): apex `icpemission.pl` A → 216.24.57.1 (Render), `www` CNAME → icpe-site.onrender.com. Uwaga: na apexie NIE dawać CNAME (kolizja z MX/NS/TXT) — użyto rekordu A wg alternatywy Rendera. Rekordy Brevo/poczty (MX, SPF, DKIM brevo1._domainkey + x._domainkey, _dmarc, @ TXT brevo-code, mail/smtp/pop) nietknięte. `rejestracja` CNAME → icpe-frontend.onrender.com bez zmian.
- Zweryfikowane z zewnątrz: `https://icpemission.pl` serwuje landing po HTTPS, canonical/OG = https://icpemission.pl/, SSL OK. Strona produkcyjna.
- Do domknięcia (opcjonalnie): redirect www↔apex w Render (wybór głównej), `SITE_URL` env (canonical i tak już poprawny z astro.config).

### Fix: piny mapy stłoczone u góry (Astro scoped styles vs elementy z JS)
- Objaw na produkcji: canvas mapy (lądy, siatka, łuki) OK, ale piny/etykiety/chipy stłoczone u góry mapy.
- Przyczyna: Astro scopuje style komponentu (atrybut `data-astro-cid-*` na elementach z szablonu), a piny/kropki/pierścienie/etykiety/chipy tworzę dynamicznie w JS — te elementy nie mają atrybutu scope, więc reguły `.wm-pin{position:absolute}` itd. do nich nie trafiały → bez `position:absolute` `left/top%` ignorowane → flow u góry.
- Fix: w `WorldMap.astro` `<style>` selektory elementów tworzonych w JS zmienione na `:global(.wm-pin/.wm-ring/.wm-dot/.wm-label/.wm-chip)`. Zweryfikowane w zbudowanym HTML: reguły globalne (0 wystąpień ze scope).

### Mapa: overlay CMS tylko dla opisu + poprawki etykiet
- Zmiana architektury: `applyOverlay` w WorldMap nakłada z CMS TYLKO `note` (n_pl/n_en). Nazwa/kraj/tag/współrzędne = stałe w kodzie strony. Powód: tagi zasiane w CMS starymi wartościami nadpisywały baked → wcześniejsze zmiany tagów nie były widoczne. Teraz tagi/kraje są kod-kontrolowane, opisy nadal z CMS.
- Warszawa tag: „Europa" → „To my · Polska" / „This is us · Polska".
- Malta kraj: „Malta · dom macierzysty" → „Malta · kolebka Instytutu Ewangelizacji Świata - ICPE Mission" (+ EN „cradle of…").
- Etykieta listy chipów: „Wszystkie oddziały" → „Tam jest ICPE" / „Where ICPE is".
- Handoff 07 zaktualizowany: z CMS edytowalny jest tylko OPIS wspólnoty (name/cc/tag read-only na stronie).

### Opisy wspólnot: obsługa linków <a href> (sanityzacja)
- `WorldMap.astro`: opis (`.wm-note`) renderowany przez `sanitizeNote()` zamiast `textContent`. Dozwolone tagi: `a[href]`, `b/strong/i/em/br`; reszta rozpakowywana do tekstu. Linki tylko `http(s)`, wymuszone `target="_blank" rel="noopener noreferrer nofollow"` + styl terakota/underline. Bezpieczne (brak script/js: URL). Treść z CMS (trusted admin), więc innerHTML akceptowalny po sanityzacji.

### Edytowalne opisy wspólnot mapy (z Personal OS)
- Wymóg usera: opisy pod mapą (hover/klik) edytowalne z CRM. Struktura mapy (współrzędne/piny) zostaje w kodzie; teksty z CMS.
- Backend: Prisma model `Community` (key unikalny, name, ccPl/En, tagPl/En, notePl/En @Text, lat, lng, grp, order). Seed 19 (`api/src/content/community-seed.ts`) auto-upsert przy pierwszym GET (gdy tabela pusta). ContentService: `listCommunities`, `updateCommunity` (PATCH pól tekstowych + trigger rebuild), `publicCommunities`. Endpointy: `/admin/content/communities` (GET, PATCH :id) + `/site/communities`. Rejestracja: bez zmian (w ContentModule).
- Astro: `getCommunities()` w api.ts; `WorldMap.astro` pobiera przy buildzie i wstawia jako `data-communities` (JSON) na kontenerze; klient `applyOverlay` nakłada po `key` na dane bazowe (name/cc/tag/note), fallback do wbudowanych gdy API puste. Klucze KEYS w kolejności DATA.
- Edycja opisu w Personal OS → PATCH → rebuild strony (Deploy Hook) → mapa pokazuje nowy tekst.
- Prompt `docs/07` rozszerzony o sekcję „Wspólnoty mapy". Weryfikacja: api tsc OK (Prisma stub), astro build + check = 0 błędów.
- Po pushu: Manual Deploy `icpe-api` (nowa tabela Community) + rebuild strony (albo poczekać na Deploy Hook).

### Landing „ICPE Mission Warszawa" wg design handoffu (statyczny one-pager)
- Źródło: `/Users/jacekdudzic/Downloads/design_handoff_icpe_polska` (README + `ICPE Polska - Wieczernik.dc.html` + `WorldMap.dc.html` + screenshots + assets/uploads). Ustalenie usera: na razie statyczny one-pager; CMS zostaje na przyszłe treści.
- Styl: ciepły editorialowy — tło `#F4EEE3`, akcent terakota `#C0603C`, ink `#241E1A`; fonty Bricolage Grotesque + Instrument Serif (italic akcent) + Space Mono. Dwujęzyczny PL/EN (przełącznik CSS `data-lang`, treść w `data-pl`/`data-en`).
- `site/src/pages/index.astro` → pełny landing (nav sticky + PL/EN + CTA, hero + cytat biblijny, hero image + ticker miast, „Kim jesteśmy" + założyciele + statystyki 2×2, 4 filary, ciemna sekcja mapy, triptych 3 zdjęć, 4 karty „Czego możesz doświadczyć", baner CTA, stopka). Inline style verbatim z handoffu = pixel-fidelity. Responsywność: gridy → 1 kol. na mobile.
- `site/src/layouts/LandingLayout.astro` — head (fonty, SEO/OG), bez CMS-owego Nav/Footer (landing ma własne).
- `site/src/components/WorldMap.astro` — port `WorldMap.dc.html` do czystego JS (`is:inline`): projekcja equirectangular, kropki lądów (LAND), łuki hub→oddziały na canvasie, piny jako buttony (Warszawa=hub pulsujący, PL=akcent, Malta/Fraternia=złoto, reszta=neutral), panel opisu (hover/klik, `hoverId ?? activeId`), chipy (kolejność: Warszawa/Kraków/Lublin/Malta/Fraternia, reszta alfabet.), dane 19 wspólnot PL/EN, reakcja na zmianę języka (MutationObserver).
- `site/src/styles/global.css` — przemapowane na ciepłą paletę + fonty + CSS przełącznika `data-lang` + `@keyframes wm-pulse`.
- Grafiki skopiowane do `site/public/assets` i `site/public/uploads` (globusy + 5 zdjęć). UWAGA licencje: część zdjęć to Unsplash/stock — potwierdzić prawa przed produkcją (flagowane w handoffie).
- Weryfikacja: `astro build` OK + `astro check` = 0 błędów (w /tmp; skrypty mapy/toggle jako `is:inline` → nie są typowane strict). Do eyeballa po deployu: interaktywność mapy i pixel-fidelity sekcji.
- CMS (index-owy „home" z `/site/*`) zastąpiony landingiem; `/aktualnosci` i `/{slug}` dalej z CMS. Uwaga: strony CMS używają BaseLayout ze starymi fontami (Newsreader/Plus Jakarta) — do ujednolicenia z brandem przy okazji.

### Wdrożenie strony (Render Static Site) — ZROBIONE przez usera
- Static Site założony na Render: Root puste, Build `cd site && npm install && npm run build`, Publish `site/dist`, ENV PUBLIC_API_URL/PUBLIC_REGISTRATION_URL/SITE_URL. Deploy Hook wpięty do `icpe-api` jako `SITE_DEPLOY_HOOK_URL`.
- Do weryfikacji przy okazji: pierwszy build zielony + strona się serwuje; realny test Deploy Hooka nastąpi przy pierwszej publikacji treści z Personal OS (Faza 3).

### Faza 2: szkielet publicznej strony (Astro, SSG)
- Nowy projekt `site/` (Astro 4, output static). Buduje się z `/site/*` i weryfikuje czysto: `astro build` OK + `astro check` = 0 błędów (walidacja w /tmp, bo w mount npm install pada na FUSE).
- `site/src/lib/api.ts` — fetch `/site/*` (defensywny: pusta treść zamiast wywalonego builda, gdy API down), helpery `pickLang`, `formatDateRange`. ENV: `PUBLIC_API_URL`, `PUBLIC_REGISTRATION_URL`, `SITE_URL`.
- `BaseLayout.astro` (head/SEO/OG, fonty Newsreader+Plus Jakarta Sans, Nav+Footer, placeholder Umami), `Nav`, `Footer`, `Blocks` (dispatcher: heading/paragraph/image/gallery/quote/button/eventCta/video/divider), `EventCard`.
- Strony: `index.astro` (home = Page slug „home" + najbliższe wydarzenia z `/site/events/upcoming` + 3 aktualności), `[slug].astro` (getStaticPaths z `/site/pages`, bez „home"), `aktualnosci/index.astro` + `[slug].astro`.
- `global.css` — tokeny brandu ICPE (light) spójne z aplikacją.
- Deploy (do zrobienia przez usera): Render Static Site, Root `site`, Build `npm install && npm run build`, Publish `site/dist`, ENV jw. Po utworzeniu skopiować Deploy Hook do `icpe-api` jako `SITE_DEPLOY_HOOK_URL`. Instrukcja: `site/README.md`.
- Handoff zaktualizowany: §0 + Faza 2 ✅. Następne: Faza 3 (UI treści w Personal OS), 4 (Umami).

### Faza 1: moduł `content` w icpe-api (backend CMS)
- Cel: API dla Personal OS do zarządzania treścią publicznej strony (patrz `docs/HANDOFF-strona-ICPE-Mission-PL.md`).
- Prisma (`api/prisma/schema.prisma`): enum `ContentStatus {DRAFT,PUBLISHED}` + modele `Page`, `Article`, `MenuItem`, `SiteSettings` (singleton id="singleton"). Nowe tabele → wejdą przez `prisma db push` na starcie Render.
- Nowy moduł `api/src/content/`: `content.service.ts` (CRUD Page/Article, publish/unpublish z triggerem rebuildu, preview, zapytania publiczne tylko PUBLISHED, menu putMenu = replace-all, settings upsert singleton), `content.admin.controller.ts` (`/admin/content/*`, `JwtAuthGuard`), `content.public.controller.ts` (`/site/*`, publiczne; `/site/events/upcoming` reużywa `EventsService.listPublicActive()`), `deploy-hook.service.ts` (Render Deploy Hook z debounce 15 s, ENV `SITE_DEPLOY_HOOK_URL`), `content.module.ts` (importuje AuthModule + EventsModule). Wpięty w `app.module.ts`.
- `render.yaml`: dodany `SITE_DEPLOY_HOOK_URL` (`sync:false`) — do skopiowania z panelu Static Site Astro (Faza 2); gdy pusty, publikacja tylko loguje.
- Sandbox: nie dało się zregenerować klienta Prisma (silnik 403), więc lokalny tsc leci na stubie `PrismaClient: any` — Prisma waliduje dopiero build Render (`prisma generate && nest build`). Dynamiczne wejścia do `data` rzutowane `as any` defensywnie (jak w events.service dla JSON). Reszta TS czysta.
- **Po pushu: Manual Deploy `icpe-api`** (nowe tabele + moduł). Test: `GET /site/pages`→`[]`, `GET /admin/content/pages` z tokenem→`[]`. Autoryzacja: ten sam `SERVICE_TOKEN`.
- Handoff zaktualizowany: sekcja §0 „Stan wdrożenia" + Faza 1 oznaczona ✅.
- Następne: Faza 2 (Astro static-site + Deploy Hook), Faza 3 (UI treści w Personal OS).

## Dziennik prac — moduł rejestracji

### Personalizacja maila z zaproszeniem (ważni goście) (2026-09-25)
- Prośba usera: móc dopisać kilka zdań do maila dla ważnych osobistości.
- Prisma `Invitation`: `mailSalutation`, `mailNote` (@db.Text), `mailSubject`, `mailFormal` (Boolean, default false). Wszystkie per osoba; puste = standardowy szablon.
- Szablon: `INVITATION` i `GUEST_INVITATION` zunifikowane w `inviteEmail()` (`notifications.service.ts`): własny zwrot zamiast „Imię,”; dodatkowe akapity po terminie/miejscu (Enter = nowy akapit, HTML escapowany); własny temat; forma grzecznościowa zamienia „zapraszamy Cię / potwierdzisz / przypisany do Ciebie” na formy bez „Ty” („mamy zaszczyt zaprosić…”, „Udział prosimy potwierdzić…”, „Link jest imienny…”). Sprawdzone renderem (tsx) na 3 wariantach.
- API: `POST /admin/invitations/:id/preview` i `POST /admin/instances/:id/invitations/preview` (body = szkic pól, bez zapisu) → `{to, subject, html}` z tego samego renderera co wysyłka. `createMany`/`PATCH` przyjmują pola `mail*` (limity: zwrot 120, temat 200, treść 3000 znaków).
- Panel (`InvitedGuestsSection` + nowy `InviteMailEditor.tsx`): w „Dodaj gościa” zwijane „Personalizuj treść maila” + przycisk **„Dodaj bez wysyłania”**; przy każdym gościu **„Treść maila”** → edytor, „Podgląd maila” (modal z iframe), „Zapisz i wyślij (ponownie)” / „Zapisz bez wysyłania”; znacznik „własna treść maila” na liście. Auto-odświeżanie pauzuje podczas edycji.
- Po pushu: Manual Deploy `icpe-api` (nowe kolumny).

### Przełącznik języka na stronie zaproszenia + zawsze PL/EN (2026-09-25)
- Zgłoszenie usera: anglojęzyczny gość z linku zobaczył stronę po polsku, bez przełącznika.
- Przyczyny: (1) strona `/i/:token` (`InviteConfirm`) i `/g/:token` nie miały `LanguageSwitch` i miały zakodowane polskie teksty; (2) `LanguageSwitch` chował się, gdy event miał zaznaczony tylko PL.
- `LanguageSwitch`: PL i EN oferowane ZAWSZE (interfejs jest w nich przetłumaczony) + dodatkowe języki eventu (IT); auto-wykrycie języka przeglądarki czeka na załadowanie języków eventu. Treść eventu bez tłumaczenia spada do PL — pełne EN wymaga zaznaczenia EN w „Języki strony” i wypełnienia zakładki EN w edycji.
- `InviteConfirm`, `GuestInvitePage`, baner zaproszenia w lejku: wszystkie teksty przez `t()` — nowe klucze `invite.*` (m.in. liczba mnoga `invite.adults_*`/`invite.kids_*`) i sekcja `guest.*` w pl/en/it. API zwraca `event.locales` w `GET /invite/:token` i `GET /guest-invites/:token`.
- Nadal tylko PL: maile oraz komunikaty błędów z serwera (np. „Ta osoba jest już na liście”).
- tsc api+app czyste, `vite build` OK.

### Link „Zaproś gościa” dla osób potwierdzonych wcześniej (2026-09-25)
- Problem (user): kto potwierdził/zapisał się PRZED włączeniem ścieżki gości, nie dostał linku `/g/…` (mail `INVITE_CONFIRMED` szedł tylko przy pierwszym potwierdzeniu, a potwierdzający bez linku nie znają swojego tokenu).
- Panel, lista gości: przy każdej potwierdzonej osobie (event INVITE) przycisk **„Link »Zaproś gościa«”** — kopiuje jej `/g/:token` (np. do WhatsAppa). Pole `guestInviteLink` w `InvitationRow`.
- Panel: przycisk **„Wyślij linki »Zaproś gościa«”** (widoczny przy zaznaczonym checkboxie) → `POST /admin/instances/:id/guest-invite-links/send`: INVITE → mail `INVITE_CONFIRMED` do potwierdzonych nie-gości; zwykły event → nowy mail `GUEST_INVITE_LINK` do aktywnych zgłoszeń (bez gości uczestników). Wymaga ZAPISANEGO włączenia ścieżki (inaczej 400 z komunikatem).
- `matchBySlug` (potwierdzenie bez linku) wysyła `INVITE_CONFIRMED` przy KAŻDYM potwierdzeniu (gdy ścieżka włączona) — samoobsługowy sposób odzyskania linku.
- Przypomnienie: osoba z osobistym linkiem `/i/:token` widzi przycisk „Zaproś gościa” po ponownym otwarciu linku (gdy ścieżka włączona i zapisana).
- tsc api+app czyste. Po pushu: Manual Deploy `icpe-api`.

### Resend + sekcja „E-mail” w panelu; ścieżka „uczestnik zaprasza gościa” (2026-09-25)
**Decyzje usera:** konfiguracja poczty w ENV na Render (nie w bazie) + podgląd/test w panelu; zapraszanie gości dla eventów INVITE **i** zwykłych (z rejestracją); limit per event (domyślnie 2, twardy sufit 10); gość od razu na liście, bez akceptacji admina, **bez łańcucha** (gość uczestnika nie zaprasza dalej).

**Poczta (Resend):**
- `notifications.service.ts`: dostawca `resend | smtp | log` — `MAIL_MODE` jawnie, a przy pustym `MAIL_MODE` sam `RESEND_API_KEY` włącza Resend; nieznana wartość MAIL_MODE jest ignorowana (nie wyłącza po cichu wysyłki). Resend przez HTTP API (`fetch`, bez SDK, timeout 15 s), `MAIL_FROM`, opcjonalny `MAIL_REPLY_TO`. `sendMailDetailed` zwraca treść błędu dostawcy.
- Prisma `Notification`: nowe `provider`, `providerId`, `error` (nullable) — dziennik wysyłek.
- Nowy `mail.controller.ts` (JWT): `GET /admin/mail/status`, `POST /admin/mail/test {to}`, `GET /admin/mail/log`.
- Panel ▸ Ustawienia ▸ **E-mail** (`MailSettings.tsx`): aktywny dostawca + końcówka klucza, nadawca, „Wyślij test”, 20 ostatnich maili ze statusem i błędem, instrukcja podłączenia Resend.
- Nowe szablony: `GUEST_INVITATION` („X zaprasza Cię…”, tryb CONFIRM/REGISTER), `INVITE_CONFIRMED` (potwierdzenie udziału + link „Zaproś gościa”), `TEST`; `CONFIRMATION` dostaje przycisk „Zaproś gościa”, gdy ścieżka włączona; `INVITATION` ma tryb REGISTER (zwykły event).
- `render.yaml`/`.env.example`: `RESEND_API_KEY`, `MAIL_REPLY_TO` (sync:false).

**Goście od uczestników:**
- Konfiguracja: `RegistrationPage.customFields.guestInvites = { enabled, maxPerInviter }` (bez migracji) — checkbox + limit w edycji eventu (sekcja „Zaproszeni goście” / „Goście z zaproszeniem”, teraz widoczna dla wszystkich typów poza STANDALONE).
- Prisma `Invitation`: `invitedByInvitationId`, `invitedByRegistrationId`, `invitedByName` (nullable). Gość = zwykły wiersz `Invitation` — ta sama lista co dodani przez admina, z etykietą „zaproszony przez X”.
- Tożsamość zapraszającego = sekretny token: token zaproszenia (INVITE, musi być potwierdzony) albo `Registration.editToken` (zwykły event, status PENDING_PAYMENT/AWAITING_TRANSFER/CONFIRMED). Public API: `GET/POST /guest-invites/:token`, `DELETE /guest-invites/:token/guests/:id` (`guest-invites.service.ts`). Walidacja: imię, nazwisko, e-mail, telefon wymagane; dedup po e-mailu (lista zaproszeń + zgłoszenia + własny e-mail); limit; blokada po zamknięciu zapisów; wycofać można tylko niepotwierdzonego gościa.
- Strona `/g/:token` (`GuestInvitePage.tsx`): formularz gościa, licznik limitu, lista „Twoi goście”. Wejścia: INVITE → przycisk na `/i/:token` po potwierdzeniu + mail `INVITE_CONFIRMED` (też dla ścieżki bez linku); zwykły event → przycisk na ekranie sukcesu lejka + link w mailu potwierdzenia.
- Gość zwykłego eventu: link `/r/:slug?inv=token` → lejek z wpisanymi danymi (applicant + pierwszy uczestnik), `invitationToken` idzie w `POST /registrations` → zaproszenie dostaje `registrationId` + `confirmedAt` (panel: „Zarejestrowany”). `/i/:token` dla zwykłego eventu przekierowuje do lejka; `POST /invite/:token/confirm` dla zwykłego eventu = 403 (inaczej darmowe zgłoszenie z pominięciem płatności).
- Weryfikacja: `tsc --noEmit` api+app czyste; `vite build` OK (zbudowany w kontenerze na świeżym `npm install`). `prisma generate` niemożliwy w sandboxie (403 na binarkach) — schemat zweryfikuje build Render.
- **Po pushu:** Manual Deploy `icpe-api` (nowe kolumny). Render ▸ icpe-api ▸ Environment: `RESEND_API_KEY`, `MAIL_MODE=resend` (lub puste — UWAGA: jeśli stoi `smtp`, trzeba zmienić), `MAIL_FROM` z domeny zweryfikowanej w Resend. Potem Ustawienia ▸ E-mail ▸ „Wyślij test”. Ścieżkę gości włącza się per event checkboxem w edycji.
- Nieprzetestowane end-to-end (brak dostępu do bazy/Resenda z sandboxa). Strona `/g/:token` i banery zaproszeń tylko po polsku.


### Zaproszeni goście: przycisk iMessage (2026-08-19)
- W sekcji „Zaproszeni goście" (edycja eventu) między „WhatsApp" a „Wyślij mail" doszedł przycisk **iMessage** — otwiera macOS-owe Wiadomości z gotową treścią do ręcznego wysłania.
- Treść wiadomości wyciągnięta do wspólnej funkcji `inviteMessage(inv, eventTitle)` — używają jej WhatsApp i iMessage, więc oba kanały mówią to samo.
- Link: `sms:<adresat>?&body=<treść>` — zapis `?&` działa i na macOS, i na iOS (różnie traktują separator parametru). Adresat: numer telefonu, a gdy go brak — e-mail (iMessage adresuje też po Apple ID); bez obu otwiera się puste okno z samą treścią.
- Numer: „+" doklejane TYLKO gdy admin sam je wpisał — automatyczne dodanie plusa do numeru krajowego („512 345 678") zrobiłoby z niego nieistniejący numer międzynarodowy.
- Zabezpieczenie: część wersji macOS ignoruje `body` i otwiera pustą rozmowę, więc klik kopiuje treść także do schowka i pokazuje podpowiedź „wklej ⌘V". Bez tego admin zostawałby z pustym oknem i bez treści.
- Commit `b354853`. `tsc --noEmit` czysty. NIEPRZETESTOWANE na żywym macOS — zachowanie `body` w Wiadomościach zależy od wersji systemu; do sprawdzenia przy pierwszym użyciu.

### Zaproszenia: deklaracja małżonka i dzieci + auto-odświeżanie panelu (2026-08-19)
- **Powód:** przy evencie jednorazowym „na zaproszenie" (Celebracja Przymierza, 17.10.2026) organizator musi wiedzieć, ile zamówić posiłków — potrzebna deklaracja „sam / z małżonkiem" oraz opcjonalna lista dzieci z wiekiem.
- **Decyzje usera (WIĄŻĄCE):** małżonek = wybór + imię/nazwisko + osobne pole na jego alergie; dzieci = lista wierszy „wiek + imię (opcjonalnie)"; oba pytania w OBU ścieżkach potwierdzenia (link imienny i formularz dopasowania bez linku); auto-odświeżanie w Dashboardzie, Zgłoszeniach i liście zaproszonych.
- `api/prisma/schema.prisma`, model `Invitation`: `spouseAttending Boolean?`, `spouseFirstName/spouseLastName/spouseDietaryNotes String?`, `childrenJson Json?` (konwencja sufiksu `Json` jak `roomsJson`). Wszystko nullable → stare zaproszenia działają bez migracji danych.
- `api/src/invitations/`: `ConfirmPayload` + `ChildEntry`, `confirmByToken(token, payload)` zamiast `(token, dietaryNotes?)`, te same pola w `matchBySlug`. Sanityzacja po stronie serwera: wiek → liczba całkowita 0–25, max 12 dzieci, imię przycięte do 60 znaków, a przy `spouseAttending !== true` dane małżonka są zerowane (żeby po zmianie deklaracji nie wisiały w panelu). `getByToken` zwraca zapisane odpowiedzi → gość wracający na link widzi swoją deklarację.
- Front: `InviteConfirm.tsx` (segmentowany wybór sam/z małżonkiem, sekcja „Dzieci" z „+ Dodaj dziecko", podsumowanie po potwierdzeniu + przycisk „Zmień odpowiedź" wypełniający formularz poprzednimi wartościami) i `InviteMatchScreen.tsx` (te same pola). Nowe teksty przez `t()`, klucze `invite.*` w `pl/en/it`.
- Panel, `InvitedGuestsSection.tsx`: pasek **„Potwierdzeni: X dorosłych + Y dzieci = Z posiłków"** (najważniejsza liczba dla cateringu) + dane małżonka/dzieci/diet w wierszu gościa.
- **Auto-odświeżanie:** nowy hook `app/src/hooks/useAutoRefresh.ts` — `fn` trzymane w ref (nowa instancja funkcji NIE restartuje interwału), blokada nakładania wywołań, pauza gdy `document.hidden` + natychmiastowe odświeżenie po powrocie do karty, błąd `fn` wyciszony (nie zabija interwału), pełny cleanup. Wpięty w `DashboardScreen` (30 s), `RegistrationsScreen` (20 s, **pauza gdy otwarty drawer/edycja** — żeby nie podmienić danych pod ręką admina) i `InvitedGuestsSection` (20 s, pauza przy akcji na wierszu). Wszędzie cichy `load(silent)` bez spinnera + wskaźnik „Zaktualizowano HH:MM" i przycisk „Odśwież".
- `RegistrationsScreen.payBadge`: zgłoszenie `CONFIRMED` z `totalPrice === 0` (czyli potwierdzenie z zaproszenia) pokazuje zielone **„Bezpłatne"** zamiast czerwonego „Oczekuje" — inaczej cała lista gości zaproszonych świeciłaby fałszywym alarmem o braku płatności.
- Commity: `4bcd434` (małżonek/dzieci), `ef6aa25` (auto-odświeżanie). `tsc --noEmit` czysty dla `app` i `api`; `vite build` NIE uruchamiany (w sandboxie pada na binarce esbuild) — weryfikacja dopiero na deployu.

### Fix: potwierdzeni zaproszeni (INVITE) niewidoczni w Zgłoszeniach/Obecności + backfill (2026-08-19)
- **Bug produkcyjny (zgłoszony przez usera):** dla eventów typu `INVITE` potwierdzenie udziału zapisywało WYŁĄCZNIE `Invitation.confirmedAt`. Wszystkie moduły panelu (Zgłoszenia, Obecność, Płatności, Zakwaterowanie, Dashboard) czytają z tabeli `Registration` — więc zaproszeni nigdy się tam nie pojawiali, mimo że potwierdzili udział.
- **Decyzje usera:** (1) potwierdzenie ma tworzyć `Registration`, żeby wszystkie moduły działały; (2) na liście Obecności jedna pozycja = jedna rodzina (jeden check-in dla gościa razem z małżonkiem/dziećmi) — model check-inu per-uczestnik NIE został ruszony.
- `api/prisma/schema.prisma`: `Invitation.registrationId String?` (bez relacji Prisma — samo pole do idempotencji, żeby nie wymuszać zmian w `Registration`).
- `api/src/invitations/invitations.service.ts`: nowa prywatna `syncRegistration(invitationId)` — wołana na końcu `confirmByToken` i `matchBySlug` (owinięta w try/catch + `Logger`, błąd synchronizacji NIE blokuje potwierdzenia gościa). Idempotentnie: jeśli `invitation.registrationId` już ustawione → aktualizuje to zgłoszenie; inaczej szuka istniejącego `Registration` w tej instancji po e-mailu (`trim().toLowerCase()`) i się podpina; inaczej tworzy nowe. Uczestnicy (`Participant`) odtwarzani od zera przy każdej synchronizacji (gość + małżonek gdy `spouseAttending===true` + dzieci z `childrenJson`); `gender: 'OTHER'` (nie zbieramy płci w zaproszeniach). Przed kasowaniem `Participant` odczepia ewentualne `RoomAssignment.participantId` (ustawia `null`), żeby nie wywalić się na FK — samo przypisanie pokoju do rodziny (`registrationId`) zostaje. `dietaryNotes` sklejane czytelnie gdy diety ma i gość, i małżonek („Jan: bez glutenu | Anna: wegetariańska”). `contact` w kształcie `{firstName,lastName,email,phone}` 1:1 z tym, czego oczekuje `toContractRegistration` w `registrations.service.ts` (sprawdzone jednorazowym skryptem porównującym pola źródłowo — bez dostępu do bazy).
- Nowa `syncAllRegistrations(instanceId)` — backfill dla zaproszeń już potwierdzonych PRZED tym fixem (są tacy na produkcji); zwraca `{created, updated, failed}`.
- Endpoint: `POST admin/instances/:id/invitations/sync-registrations` (JWT, jak reszta tras admina).
- Front: `syncInvitationRegistrations()` w `app/src/lib/api.ts`; w `InvitedGuestsSection.tsx` przycisk „Synchronizuj z listą zgłoszeń” (ikona `Users`) + baner nad listą, gdy część potwierdzeń ma puste `registrationId`.
- **Do zrobienia po mojej stronie po wdrożeniu:** wejść w panel na event(y) typu INVITE (np. `5september`, jeśli ma zaproszonych) i kliknąć „Synchronizuj z listą zgłoszeń” raz — to podciągnie WSZYSTKICH już potwierdzonych do modułów Zgłoszenia/Obecność. Bez tego kliknięcia starzy potwierdzeni zostaną niewidoczni (nowi automatycznie się zsynchronizują przy potwierdzeniu).
- **Nieprzetestowane (brak dostępu do bazy w sandboxie):** rzeczywisty zapis do Postgresa (`prisma db push` przy starcie zrobi to za nas — pole `registrationId` jest nullable więc bezpieczne dla istniejących wierszy), zachowanie przy realnych `RoomAssignment` na uczestnikach zaproszonych (teoretycznie możliwe przez „Zakwaterowanie”, nieprzetestowane end-to-end), poprawność `pricingConfig.currency` gdy event INVITE ma nietypowy cennik. `tsc --noEmit` czysty dla `api` i `app`; commit `27bd4e4`.

### Lejek: zapamiętywanie niedokończonego zgłoszenia
- Powód: zgłoszenie leci na serwer dopiero po kliknięciu „Wyślij zgłoszenie" na podsumowaniu — odświeżenie strony albo zamknięcie karty kasowało cały postęp bez śladu w bazie. Zgłoszenie usera: osoba wypełniała formularz dwukrotnie i nie ma jej na liście (potwierdzone: najnowsza rejestracja na `5september` z 3 lipca, czyli nic nie doszło do API).
- `app/src/lib/funnelDraft.ts` — draft w `localStorage`, klucz `icpe:funnel:<slug>`, `VERSION` + TTL 3 dni + `pruneExpiredDrafts()` (sprząta drafty wszystkich slugów, żeby dane osobowe nie leżały bezterminowo). `loadDraft` zwraca `stepper` jako `unknown` i whitelistuje ekran powrotu (`stepper|payment_method|summary`).
- `PublicFunnel`: autozapis z debounce 400 ms (pomija pusty formularz), `normalizeStepper()` scala draft z `buildInitialStepper()` i sprawdza typy pól (draft ze starszej wersji kodu nie wywala renderu — nie ma ErrorBoundary w projekcie), baner `DraftBanner` na ekranie startowym z „Dokończ zgłoszenie" / „Zacznij od nowa" (i18n `draft.*` w pl/en/it).
- **Pułapka złapana w review własnego kodu:** stan `draft` czytany tylko przy montowaniu powodował, że po wysłaniu zgłoszenia i powrocie na landing baner nadal się pokazywał (storage już pusty) i pozwalał **wysłać to samo zgłoszenie drugi raz** — API nie ma dedupu `createRegistration`. Fix: draft przeładowywany przy każdym wejściu na ekran startowy (`useEffect` z zależnością od `screen`).
- Do rozważenia: wzmianka w klauzuli RODO, że dane wpisane w formularzu zapisują się lokalnie w przeglądarce na 3 dni.

### Nadtytuł eventu: lista wyboru + koniec z fallbackiem
- Przyczyna „randomowego" nadtytułu: kreator eventu **w ogóle nie zapisywał** `theme.supertitle`, a `LandingHero` przy pustej wartości podstawiał `t('landing.supertitle')` = „Wyjazd formacyjny". Każdy nowy event dostawał więc tę etykietę niezależnie od charakteru.
- `LandingHero`: brak nadtytułu → nic się nie renderuje (fallback usunięty).
- `app/src/lib/supertitles.ts` — wspólna lista 10 presetów (Spotkanie wspólnoty, Rekolekcje, Obóz wakacyjny, Weekend formacyjny, Wyjazd formacyjny, Kids Ministry, Youth Ministry, Spotkanie otwarte, Fellowship, Świętowanie daru wspólnoty) + `isPresetSupertitle`.
- Select z presetami + opcja „Inny — wpisz własny…" w `EventEditForm` (per język, `editLang`) i w kreatorze `Step4Page` (jednojęzycznie, PL; `mapEditConfigToState` spłaszcza mapę do PL).

### Goście specjalni: liczba mnoga + krótki opis
- `customFields.specialGuest` rozszerzone o `plural` (bool) i `bio` (mapa językowa). Checkbox „To więcej niż jedna osoba (np. małżeństwo)" + pole „Kim są — 1–2 zdania" w `EventEditForm` (bio podpięte pod `editLang`, więc tłumaczalne) oraz w `EventWizard` (jednojęzycznie, PL — jak reszta kreatora).
- `EventContentBlocks`: etykieta z `plural`, bio pod nazwiskiem, layout przełącza się na `items-start` gdy jest opis. Przy okazji etykiety „Gość specjalny"/„Program" przeszły z hardcode'u PL na i18n (nowa sekcja `content.*` w pl/en/it) — wcześniej po przełączeniu na EN zostawały polskie.
- Backend bez zmian (customFields to wolny JSON), więc wystarczy auto-deploy frontu.

### Eventy „na zaproszenie": fix typu, blokada rejestracji, maile, panel gości
- **Bug krytyczny (potwierdzony na produkcji):** `GET /r/:slug` zwracał `{page, instance}`, gdzie `instance` to surowy rekord Prismy **bez pola `type`** (typ siedzi na `EventSeries`). Front czyta `event.type`, więc gałęzie `STANDALONE` i `INVITE` w `PublicFunnel` **nigdy się nie uruchamiały** — event na zaproszenie (`/r/covenant-day-2026`, `series.type: "INVITE"`) pokazywał zwykły lejek rejestracji. Fix: `findBySlug` dokleja `type` (z serii) i `slug` do zwracanej instancji. Dodatkowo front ma fallback `event.type ?? eventConfig?.type` (endpoint `/r/:slug/config` zwracał `type` od zawsze). **UWAGA:** po wdrożeniu eventy STANDALONE też zaczną wreszcie pokazywać ekran RSVP zamiast lejka — to zamierzone, ale warto sprawdzić istniejące standalone'y.
- **Blokada rejestracji na INVITE:** `registrations.service.create` rzuca 403 gdy `series.type === 'INVITE'` (samo ukrycie UI to nie zabezpieczenie — dało się POST-ować wprost). Na publicznej stronie baner z kłódką „To jest wydarzenie tylko dla zaproszonych gości" + wyjaśnienie (i18n: nowa sekcja `invite.*` w `pl/en/it.json`, `InviteMatchScreen` przepisany z hardcode'u PL na `t()`).
- **Eventy INVITE zniknęły z listy na stronie głównej** (`listPublicActive` pomija `type === 'INVITE'`) — prywatnego wydarzenia nie reklamujemy kafelkiem. Do rewertu jednym `if`, gdyby user chciał inaczej.
- **Maile z zaproszeniem (wcześniej ich w ogóle nie było — `createMany` tylko zapisywał do bazy):** nowy typ `INVITATION` w `notifications.service` (temat „Zaproszenie — {tytuł}", treść + przycisk „Potwierdzam udział" z linkiem `/i/:token`). `sendMail` zwraca teraz `'SENT' | 'FAILED'` zamiast `void`, żeby panel mógł pokazać, czy mail faktycznie wyszedł. Auto-wysyłka przy dodaniu gościa (`sendEmails` w body, domyślnie `true`), ręczne `POST /admin/invitations/:id/send` i zbiorcze `POST /admin/instances/:id/invitations/send` (`onlyUnsent`).
- **Prisma `Invitation`:** nowe kolumny `phone` (do WhatsAppa) i `sentAt` (kiedy poszedł mail). Wejdą przez `prisma db push` przy starcie Rendera.
- **ENV:** nowy `PUBLIC_APP_URL` (baza linków `/i/:token` w mailach; fallback `CORS_ORIGIN`, potem `https://rejestracja.icpemission.pl`) — dopisany w `render.yaml`.
- **Panel „Zaproszeni goście"** — `app/src/components/admin/events/InvitedGuestsSection.tsx`, wpięty w `EventEditForm` (sekcja widoczna tylko gdy `cfg.type === 'INVITE'`). Lista ze statusem potwierdzenia, licznik „potwierdziło N z M", kopiuj link, przycisk WhatsApp (`wa.me/<phone>?text=…`; bez numeru otwiera wybór kontaktu), wyślij/ponów mail (tooltip z datą ostatniej wysyłki), usuń, formularz dodawania (imię, nazwisko, e-mail, telefon).
- Kreator: `parseInvitees` przyjmuje teraz 3. kolumnę = telefon (`Imię Nazwisko, email, telefon`); ekran sukcesu pokazuje link z API (`inv.link`) + przycisk WhatsApp.
- **Uczciwy status wysyłki:** `sendMail` zwraca `'SENT' | 'FAILED' | 'LOGGED'`; przy `MAIL_MODE≠smtp` status to `LOGGED` (Notification.status = `LOGGED`), `sentAt` NIE jest stemplowane, a panel pokazuje wprost „Mail NIE został wysłany — serwer ma wyłączoną wysyłkę". Bez tego panel kłamałby, że zaproszenie poszło (najbardziej prawdopodobna przyczyna pierwotnego zgłoszenia „wpisałem siebie i nie dostałem zaproszenia").
- Poprawki z code review: deduplikacja w `createMany` (e-mail, a przy braku imię+nazwisko — ponowne wklejenie listy nie tworzy drugiego tokenu i drugiego maila); `baseUrl()` używa `||` zamiast `??` (pusty ENV dawał link względny); escapowanie HTML w mailu; usunięty martwy `sendInvitation` z notifications; `listPublicActive` bez N+1 (`include: { series: { select: { type: true } } }`); `matchBySlug` wymaga serii typu INVITE i **nie zwraca już `token`** (publiczny endpoint nie powinien wydawać osobistego linku komuś, kto zgadł dane); `parseInvitees` w kreatorze przyjmuje gościa bez maila (spójnie z backendem i panelem); clipboard w try/catch, `type="button"` na przyciskach.
- Handoff: `docs/11-prompt-personal-os-zaproszenia.md`.
- Weryfikacja: `tsc --noEmit` czysty w `app` i `api`. `vite build` w sandboxie nie przechodzi (esbuild ma binarkę darwin, sandbox to Linux) — build zweryfikuje Render.
- **Po pushu: Manual Deploy `icpe-api`** (nowe kolumny `Invitation.phone/sentAt`, fix `findBySlug`, blokada rejestracji). Front auto-deploy. Sprawdzić też `MAIL_MODE=smtp` na Render — przy `log` maile tylko lecą do logów.


### Edycja zgłoszeń przez admina (oba: app + Personal OS, pełna edycja z przeliczeniem)
- Backend: `PATCH /admin/registrations/:id` (registrations.controller + `adminUpdate` w service). Przyjmuje pełny skład (kontakt, uczestnicy, pokoje, opcje), PONOWNIE przelicza cenę (silnik), podmienia uczestników (transakcja: kasuje roomAssignment+participant, tworzy nowych), aktualizuje roomsJson/optionsJson/totalPrice/currency + kwotę płatności PENDING. Nie rusza statusu/metody płatności.
- Prisma: `Registration.optionsJson` + `discountCode` (nowe kolumny) — zapisywane przy create i edycji. DTO admina (`toContractRegistration`) wystawia teraz `rooms/options/discountCode/dietaryNotes` do wczytania w formularzu. `RegistrationDto` (shared) rozszerzone.
- App UI: `RegistrationEditForm.tsx` (modal) — kontakt, uczestnicy (dodaj/usuń, przypisania po ID uczestnika→indeksy przy zapisie), pokoje (typ + przypisanie osób), opcje, uwagi, żywa kwota (computePrice), walidacja (wszyscy przypisani, pojemność). Wpięte w RegistrationsScreen (przycisk „Edytuj zgłoszenie" w drawerze; pobiera pricingConfig instancji przez getEventEditConfig). api: `adminUpdateRegistration`.
- Handoff dla Personal OS: `docs/10-prompt-personal-os-edycja-zgloszen.md`.
- Weryfikacja: app+api tsc + vite build OK. Po pushu: **Manual Deploy icpe-api** (nowe kolumny optionsJson/discountCode).

### Fix funnela: blokada bez wyboru pokoju + czytelne błędy
- Bug: „API 400: ." przy submit, bo krok pokoju (step 3) przepuszczał dalej bez przypisania osób do pokoi (DTO `rooms` @ArrayNotEmpty).
- `api.ts apiFetch`: przy !res.ok czyta treść z body (NestJS `{message}`) i rzuca czytelny komunikat zamiast „API 400: {statusText pusty}".
- `PublicFunnel`: `validateRoomStep()` + `stepError` — na kroku 3 „Dalej" blokuje, gdy: brak pokoju / nieprzypisane osoby (podaje ile brakuje) / przekroczona pojemność (komunikat z `validateRoomCapacity`). Banner błędu nad paskiem ceny. Submit error z przyjaznym prefiksem „Nie udało się zapisać zgłoszenia…".
- `Step3Room`: auto-dodanie pierwszego pokoju (czytelny start) + instrukcja „Zaznacz, kto śpi w którym pokoju…".
- Weryfikacja: app tsc + vite build OK. Tylko frontend (app) → auto-deploy icpe-frontend.


### Wielojęzyczne nazwy pokoi
- Problem: nazwy pokoi to był pojedynczy string w `pricingConfig.rooms[].name`, więc zakładka języka w edytorze ich nie rozdzielała — zmiana na EN zmieniała też PL.
- `RoomTypeDef.name` → `string | Record<string,string>` w `shared/src/pricing.ts` i `api/src/_shared/pricing.ts` (lustro). Nowy helper `roomLabel(name, lng)` (fallback pl→en→it) eksportowany z shared. `validateRoomCapacity` używa `roomLabel(name)` w komunikatach.
- Backend `registrations.service.ts`: mapa `roomNames` resolvuje nazwę do PL (Personal OS), gdy name jest mapą.
- Edytor `EventEditForm`: `RoomRow.name` → mapa, input nazwy pokoju związany z `editLang` (placeholder pokazuje aktywny język), load: string→{pl}, zapis: `cleanMap(r.name)`, „Dodaj pokój" startuje `name: {}`.
- Publiczne wyświetlanie: `Step3Room` (opcje wyboru pokoju) i `SummaryScreen` przez `roomLabel(name, i18n.language)`. Dopasowanie błędów pojemności też przez `roomLabel(name)` (bo `validateRoomCapacity` buduje komunikaty z nazwą PL).
- Kreator `EventWizard`: nazwy pokoi pozostają jednojęzyczne (PL) — `mapEditConfigToState` resolvuje mapę→PL przy wczytaniu, create zapisuje `{ pl: name }`. Uwaga: edycja wielojęzycznego eventu przez kreator spłaszczyłaby nazwy pokoi do PL — właściwa ścieżka edycji to EventEditForm.
- Stan: typecheck app+api + build OK. Zmiana w `shared` + `_shared` (typ name rozszerzony, opcjonalny) → dla frontu wystarczy auto-deploy; backend Manual Deploy nie jest wymagany (zmiana tylko czyta name defensywnie).

### Fix: wyścig przy przełączaniu języka (część stringów zostawała po PL do 2. kliknięcia)
- Objaw: pierwsze kliknięcie EN zmieniało datę i opis (używają wprost `i18n.language`), ale stringi z `t()` („1 noc", „Zapisz się", „Rejestracja otwarta") zostawały po PL; drugie kliknięcie je poprawiało.
- Przyczyna: `i18n.ts` ładował `en.json`/`it.json` leniwie (async) dopiero po `languageChanged`; komponenty renderowały się zanim bundle dojechał → fallback pl, a react-i18next domyślnie nie przerysowuje na zdarzenie „dodano zasób" (bindI18nStore).
- Fix: `app/src/i18n.ts` importuje wszystkie 3 locale statycznie i rejestruje w `resources` przy init (pliki małe) — brak async, każdy `t()` zmienia się natychmiast. Usunięty backend/loadPath i `loadLocale`. Bundle frontu +~6 kB gzip (akceptowalne).
- Stan: typecheck + build OK.

### i18n dat/„noc" + waluta eventu (PLN/EUR/USD)
- Problem 1: na publicznych ekranach nazwy miesięcy i słowo „noc" były zakodowane po polsku (`toLocaleDateString('pl-PL')`, `noc/nocy`).
- `app/src/lib/utils.ts`: dodane `bcp47(lng)` (pl→pl-PL, en→en-GB, it→it-IT) oraz `formatDateRange(start,end,lng)`. Podpięte w: `LandingScreen`, `InviteMatchScreen`, `RsvpScreen`, `SummaryScreen`, `PublicHome`, `InviteConfirm` (wszystkie usunęły własne pl-PL formatery, tytuł/opis też przez `pickLang(..., i18n.language)`).
- „noc": klucze i18next z liczbą mnogą `landing.nights_one/few/many/other` w pl/en/it; użycie `t('landing.nights', { count: nights })` w LandingScreen (poprawne polskie: noc/noce/nocy).
- Problem 2 (decyzja): waluta „zł" vs „PLN" po EN → wybrano: PLN to kod ISO czytelny globalnie, „zł" polski symbol. Rozwiązane automatycznie przez `Intl.NumberFormat` currency: PLN w pl-PL = „180 zł", w en-GB = „PLN 180".
- Waluta eventu (PLN/EUR/USD): pole `currency?` w `PricingConfig` (shared + `api/src/_shared` — lustro; domyślnie PLN). Nowa funkcja `formatMoney(n, currency, lng)` w `shared/src/pricing.ts` (Intl currency, bez groszy). Założenie: organizator wpisuje kwoty w wybranej walucie — BEZ przeliczania kursów (auto-FX to osobny temat).
- Selektor waluty dodany w edytorze (`EventEditForm`, sekcja Cennik) i kreatorze (`EventWizard`, krok Cennik); zapisywany w `pricingConfig.currency`.
- Publiczne wyceny przełączone z `formatZl` na `formatMoney(..., currency, lng)`: `SummaryScreen`, `StickyPriceBar`, `SuccessScreen` (nowy prop `currency`), `Step3Room`, `Step4Options`. Admin (panel) zostaje na `formatZl`/„zł" (PL-only).
- Auto-detekcja języka przeglądarki (z poprzedniej partii) sprawia, że EN/IT gość od razu widzi daty, „noc" i walutę w swoim języku.
- Stan: typecheck app+api + build OK. Zmiana frontend + shared (bundlowane do frontu) → auto-deploy `icpe-frontend`. `_shared` w API zmienione tylko o typ `currency` (opcjonalny) — Manual Deploy niekonieczny dla tej zmiany, ale nie zaszkodzi.

### Wielojęzyczne treści eventu (tytuł/opis/nadtytuł/program) + auto-detekcja języka
- Problem: przełącznik języka tłumaczył tylko statyczne UI; treść eventu miała pola tylko po polsku (edytor zapisywał `{pl: ...}`), więc po zmianie języka zostawała po polsku.
- Bez zmian w backendzie/Prismie — `title`/`description` to już mapy JSON, a nadtytuł i program siedzą w istniejących kolumnach JSON (`theme`, `customFields`).
- `app/src/lib/api.ts`: dodany typ `LangText = string | Record<string,string>` + helper `pickLang(value, lng)` (fallback pl→en→it→pierwsza). `EventTheme.supertitle` i `EventContent.program[].item` → `LangText`. Zaktualizowany typ `EventEditConfig.theme.supertitle`.
- Rozwiązywanie języka przy renderze (wg `i18n.language`): `PublicFunnel` (`getEventTitle(title, lng)` + `useTranslation`), `LandingHero` (supertitle), `LandingScreen` (opis + program), `EventContentBlocks` (program), `InviteMatchScreen` (opis).
- Edytor `EventEditForm.tsx`: pojedyncze pola zamienione na mapy (`nameMap`/`descMap`/`superMap`, program `item` jako mapa). Dodany pasek zakładek języka („Język treści" PL/EN/IT, sticky), pokazywany tylko gdy event ma >1 język; `editLang` steruje aktywnie edytowaną wersją wszystkich tłumaczalnych pól. Godzina programu wspólna dla języków. Zapis czyści puste wersje (`cleanMap`). `title` zawsze z `pl` (wymagane przez typ `UpdateInstancePayload`).
- Auto-detekcja języka: `LanguageSwitch.tsx` przy pierwszym wczytaniu (po dociągnięciu `locales` eventu) wykrywa język przeglądarki (`navigator.languages`), i jeśli event go obsługuje — ustawia go; inaczej PL (gdy dostępny), inaczej pierwszy z listy. Ręczny wybór nie jest nadpisywany (`initialized` ref). Detekcja po IP NIE zaimplementowana (wymaga geo-API/serwera) — do rozważenia osobno.
- Zakres pól tłumaczalnych (ustalone z userem): tytuł, opis, nadtytuł, program. Gość specjalny NIE (pozostał pojedynczy string).
- Stan: typecheck + build OK. Zmiana czysto frontendowa → auto-deploy `icpe-frontend`. Uwaga: kreator nowego eventu (`EventWizard`) na razie zapisuje treść tylko po PL — zakładki językowe dodane tylko w edytorze.

### Przełącznik języka na publicznej stronie
- Problem: w ustawieniach eventu można wybrać kilka języków (`RegistrationPage.locales` zapisywane poprawnie, zwracane w `eventConfig.locales`), ale front pokazywał tylko jeden — bo brakowało przełącznika, a `i18n.ts` był zahardkodowany na `lng: 'pl'`.
- Dodany komponent `app/src/components/ui/LanguageSwitch.tsx`: kody tekstowe PL/EN/IT, pływający w rogu na lewo od ThemeToggle (`right: 58`), pokazuje tylko języki wybrane dla eventu, chowa się przy ≤1 języku, ustawia startowy język na pierwszy z listy (preferując `pl`).
- Wpięty w `PublicFunnel.tsx` obok `<ThemeToggle />` we wszystkich 3 gałęziach (STANDALONE, INVITE, główny lejek): `<LanguageSwitch locales={eventConfig?.locales} />`.
- Uwaga na przyszłość: przełącznik tłumaczy statyczne teksty UI (`locales/*.json`). Treść eventu jest wielojęzyczna tylko częściowo (opis obsługuje `{pl,en,it}`; tytuł/program to pojedyncze stringi) — pełne wielojęzyczne treści eventu to osobny, większy temat.
- Stan: typecheck + build OK. Zmiana tylko frontendowa → auto-deploy `icpe-frontend` po pushu.

### Landing: usunięcie ceny + „Zobacz program" (popup)
- Ze strony wejściowej funnela usunięta cena („cena od …"). W jej miejsce przycisk **„Zobacz program"** (ikona zegara), widoczny tylko gdy program jest wypełniony w edycji eventu. Klik → mały popup z programem godzinowym (godzina + punkt).
- Liczba wolnych miejsc pozostała po prawej.
- Pliki: `app/src/components/funnel/LandingScreen.tsx` (usunięty `computePrice`, dodane `useState showProgram`, `content.program`, modal), `app/src/pages/PublicFunnel.tsx` (przekazuje `content={eventConfig?.customFields}`).
- Program edytowany w edytorze eventu (sekcja „Program i gość specjalny").
- Stan: typecheck + build OK. **Do zrobienia po pushu:** frontend auto-deploy; backend Manual Deploy jeśli jeszcze nie po partii INVITE/customFields.

### Typ eventu „Na zaproszenie" (INVITE)
- W tworzeniu eventu: wpisywanie zapraszanych (imię, nazwisko, email). Po zapisie każdy dostaje unikalny link `/i/:token`.
- Klik w link → strona info + potwierdzenie udziału **bez podawania danych** (`app/src/pages/InviteConfirm.tsx`, route `/i/:token`).
- Wejście bez linku → formularz + match po danych (`InviteMatchScreen.tsx`, endpoint `POST /r/:slug/invite-match`), match po znormalizowanym imię+nazwisko+email.
- Zmiany w tworzeniu INVITE: liczba nocy opcjonalna („bez noclegu" → pomija Pokoje+Cennik, ale zostaje zgłaszanie alergii/wymagań żywieniowych); program (godzina + punkt); gość specjalny z portretem.
- Program + gość specjalny dodane też do **edytora eventu** (`EventEditForm.tsx`).
- Na liście eventów doszła kategoria/filtr „Na zaproszenie" (fix: `toContractInstance` nie zwracał `type` — teraz pobiera z serii).
- Backend: moduł `api/src/invitations/` (`createMany`, `list`, `remove`, `getByToken`, `confirmByToken`, `matchBySlug`).
- Komponenty: `EventContentBlocks.tsx` (render gościa + programu).

### Moduł Zakwaterowania
- Przydział numeru pokoju + opcjonalny komentarz do konkretnych gości.
- Backend: `admin.service.setAccommodation(id, {roomLabel, roomNote})`, `PATCH /admin/registrations/:id/accommodation`.
- Frontend: `AccommodationScreen.tsx`.

### Moduł Płatności
- Widok finansowy (przychód / oczekujące) + ręczne oznaczanie „opłacone".
- Frontend: `PaymentsScreen.tsx`, API `markRegistrationPaid`.

### Opcja płatności „bezpłatne" (free)
- `pricingConfig.free` → ukrywa ceny/koszty, pomija płatność. Dla eventów standalone.
- `computePrice` short-circuituje przy `free` (zwraca zera). Zsynchronizowane w `shared/src/pricing.ts` i `api/src/_shared/pricing.ts`.

### Publiczny Light/Dark toggle
- `app/src/components/ui/ThemeToggle.tsx` (pływający sun/moon), `app/src/lib/theme.ts`. Wpięty w `PublicFunnel`, `PublicHome`, ekrany invite.

### Edytowalne treści eventu
- **Opis** eventu edytowalny (był hardcode „Zapraszamy na wyjazd formacyjny…").
- **Tag/badge hero** jako dropdown: „ICPE Mission Warszawa" | „ICPE Mission Polska" | „ICPE Mission".
- **Dane przelewu** (`paymentInfo`) edytowalne per event (był hardcode IBAN).
- Stopka: dopisek zmieniony na „Rejestracja zajmuje ok. 3 minuty · prosimy o terminowe zgłoszenia".

### Lista miejsc (Places)
- Zapisywane lokalizacje: wybór z listy lub dodanie nowej.
- Backend: `api/src/places/` (`GET/POST/DELETE /admin/places`). Frontend: picker w kreatorze i edytorze eventu.

### SMTP (nodemailer)
- `notifications.service.ts`: `buildEmail` (CONFIRMATION / PAYMENT_REMINDER, polskie tematy/treści), `getTransporter()` z ENV; `MAIL_MODE=smtp` wysyła, inaczej loguje.

### Personal OS — surfacing pokoju
- Fix: API nie pokazywało zarezerwowanego pokoju. Dodane `roomSummary` (z `roomsJson` + nazwy pokoi z `pricingConfig`) mapowane w `toContractRegistration` (+ fallback `assignedRoom`), oraz `roomLabel`/`roomNote`. `listForInstance` dociąga pricingConfig do mapy nazw.
- Potwierdzone: wybór pokoju **był** zapisywany (`roomsJson`) — brakowało tylko wyświetlania.

### Panel — dodatkowe moduły
- `AttendanceScreen.tsx` (obecność/check-in, `toggleRegistrationCheckIn`), `SettingsScreen.tsx` (Light/Dark, konto, API URL). Wpięte w `AdminPanel`.
- `PublicHome.tsx` (route `/`) — strona główna z aktywnymi eventami; backend `listPublicActive()`.

---

## Powiązane dokumenty
- `docs/13-handoff-formacja-online.md` — **obowiązująca spec** Formacji online (`/formacja/<slug>`, wiele kursów).
- `docs/12-plan-panel-kursanta.md` — pierwotny plan + research hostingu wideo i koszty (część o subdomenach nieaktualna).
- `docs/HANDOFF-strona-ICPE-Mission-PL.md` — architektura publicznej strony ICPE Mission PL (headless CMS na API + Astro, statystyki Umami). Nowy kierunek prac (osobny od modułu rejestracji).

---

## Do zrobienia / otwarte
- Formacja online: kod v1 gotowy (dziennik 2026-09-28) — push, Manual Deploy `icpe-api`, konfiguracja Bunny + reguła Rewrite, test na kursie testowym.
- Po pushu zmian backendowych: **Manual Deploy** `icpe-api` (INVITE enum, `Invitation.dietaryNotes`, `customFields`, tabela `Place`).
- Opcjonalnie (zaproponowane, nieprzyjęte): panel zarządzania zaproszonymi w `EventEditForm` (podgląd linków + kto potwierdził).
- Faza 1 strony ICPE Mission PL: moduł `content` w `icpe-api` (patrz handoff).
