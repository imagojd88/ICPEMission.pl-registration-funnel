# Plan: panel kursanta (kurs online) — ICPEMission.pl

> ⚠️ **Aktualizacja 2026-09-28:** adres zmieniony na `icpemission.pl/formacja/<slug>` (bez subdomen/wildcard DNS), wiele kursów równolegle. Obowiązująca specyfikacja: `docs/13-handoff-formacja-online.md`. Poniższy research hostingu i koszty pozostają aktualne.
>
> Status: **PLAN do wdrożenia** · 2026-09-28 · autor: Claude (sesja Cowork) dla Jacka
> Zakres v1: kursant loguje się pod adresem kursu, w dashboardzie widzi **2 filmy** i **2 PDF-y** do przeglądania. Admin wgrywa wszystko z panelu admina.

---

## 0. Decyzje (ustalone z Jackiem)

| Temat | Decyzja |
|---|---|
| Kto ma dostęp | **Auto + ręcznie** — kurs jest powiązany z eventem/eventami w obecnym lejku; zgłoszenie w statusie `CONFIRMED` automatycznie daje dostęp. Admin może też dodać / odebrać dostęp ręcznie. |
| Logowanie | **E-mail + hasło.** Mail powitalny z linkiem „Ustaw hasło", potem normalne logowanie + „Nie pamiętam hasła". |
| Adres | **Zmienny, z nazwy kursu ustalanej przez admina** → subdomena per kurs: `https://<slug>.icpemission.pl` (np. `rekolekcje-online.icpemission.pl`). Slug generowany z nazwy, edytowalny przez admina. Technicznie: wildcard `*.icpemission.pl` → istniejąca aplikacja React (`icpe-frontend`). Awaryjnie/dev: `rejestracja.icpemission.pl/k/<slug>`. |
| Hosting wideo | **Rekomendacja: Bunny Stream** (UE/Frankfurt, upload bezpośrednio z panelu admina, podpisane linki). AWS jako alternatywa — porównanie w §2. |
| PDF-y | Prywatnie w naszym API (Postgres), serwowane tylko zalogowanym przez krótko żyjący podpisany link. |
| Forma planu | Ten plik + wpis w `session_notes.md`. |

Konsekwencja decyzji o zmiennym adresie: od początku modelujemy **wiele kursów** (encja `Course` ze `slug`), choć na start będzie jeden. Koszt tej ogólności jest mały, a unika przeróbek przy drugim kursie.

---

## 1. Architektura (widok z lotu ptaka)

```
 Kursant                              Admin (rejestracja.icpemission.pl/admin)
    │ https://<slug>.icpemission.pl      │
    ▼                                    ▼
┌──────────────────────── icpe-frontend (Render Static, React) ────────────────────────┐
│  App.tsx: host = <slug>.icpemission.pl → MemberApp(slug)   │  AdminPanel → „Kursy online" │
└──────────────┬───────────────────────────────────────────────┬──────────────────────┘
               │ REST (Bearer JWT realm=member)                  │ REST (Bearer JWT realm=admin)
               ▼                                                 ▼
┌──────────────────────────── icpe-api (NestJS + Prisma) ────────────────────────────┐
│ CoursesModule: kursy, pozycje, dostęp, member-auth, podpisy linków, webhook Bunny     │
│ Postgres: Course, CourseItem, CourseEnrollment, PrivateFile, MemberToken, GuestAccount│
└──────┬──────────────────────────────┬───────────────────────────────┬───────────────┘
       │ API: utwórz wideo, podpisz    │ webhook (HMAC): „zakodowane"   │ Resend: maile
       ▼                              │                               ▼
┌──────────── Bunny Stream (Frankfurt) ┴───┐                    powitanie / reset hasła
│ biblioteka wideo, transkodowanie HLS,     │
│ CDN, player (iframe), token auth          │◄── upload TUS bezpośrednio z przeglądarki admina
└───────────────────────────────────────────┘    (plik NIE przechodzi przez icpe-api)
```

Kluczowe: **plik wideo idzie z przeglądarki admina prosto do Bunny** (resumable upload TUS z podpisem wygenerowanym przez nasze API). Nasze API na Render (plan free, 512 MB RAM, usypianie) nie dotyka gigabajtów wideo — dostaje tylko webhook, że film jest gotowy.

---

## 2. Hosting wideo — porównanie i rekomendacja

### Scenariusz kosztowy
2 filmy × ~60 min (1080p), ~50 kursantów, każdy obejrzy oba filmy raz → ~6 000 min odtworzeń / ~90–100 GB transferu miesięcznie (przy średniej jakości 720p ≈ 0,9 GB/h).

| Opcja | Jak działa upload z panelu | Ochrona dostępu | Koszt w scenariuszu | Nakład wdrożenia | Uwagi |
|---|---|---|---|---|---|
| **Bunny Stream** ✅ | Create Video API → TUS upload z przeglądarki (podpis SHA256 z serwera) | Podpisany embed (`token`+`expires`), lista dozwolonych domen, webhook HMAC | Storage $0,01/GB + CDN EU $0,01/GB, kodowanie standard gratis, **minimum $1/mies.** → realnie **~$1/mies. (~4 zł)** | Najmniejszy | Serwery w UE (Frankfurt), gotowy player, miniatury, napisy opcjonalnie |
| AWS S3 + CloudFront (+ MediaConvert) | Presigned PUT do S3 → trigger (EventBridge/Lambda) → MediaConvert → HLS w S3 | CloudFront signed cookies/URL (key group) | S3 ~$0,02/GB; CloudFront ma darmowe **1 TB/mies.**; MediaConvert jednorazowo ~$1–3 za 2 h → **~$0–1/mies.** | Największy: IAM, bucket, CORS, Lambda, MediaConvert job template, CloudFront + klucze, własny player (hls.js) | Najtańszy przy dużej skali, ale dużo elementów do utrzymania |
| AWS „na prosto" (S3 + MP4) | Presigned PUT do S3 | Presigned GET MP4 (np. 4 h) | Groszowe | Mały | Bez adaptacyjnej jakości (ciężko na słabym mobile), plik łatwo pobrać w oknie ważności linku, trzeba samemu przygotować MP4 (H.264, faststart) |
| Cloudflare Stream | Direct Creator Upload (TUS) | Signed URLs | $5 / 1000 min przechowywania (prepaid) + $1 / 1000 min odtworzeń → **~$11/mies.** | Mały | Bardzo wygodne, ale drożej przy tej skali (płacisz za blok 1000 min) |
| Mux | Direct upload | Signed playback | Plan darmowy: 10 filmów, 100 000 min/mies., **logo „Mux" w playerze** (znika po podpięciu karty); PAYG ~$0,30/mies. | Mały | Świetne API, ale więcej funkcji niż potrzeba |

Ceny wg cenników z września 2026 — przed założeniem konta zweryfikować.

### Rekomendacja: Bunny Stream
1. **Pełna automatyzacja z panelu admina** dokładnie tak jak chcesz: admin wybiera plik → pasek postępu → status „koduje się…" → „gotowe" (webhook). Bez logowania się do Bunny.
2. **Koszt praktycznie stały ~4 zł/mies.** przy tej liczbie użytkowników.
3. **Dane w UE** (Frankfurt) — prościej z RODO niż z USA.
4. **Mało kodu i zero infrastruktury** po naszej stronie (w AWS trzeba by postawić 5–6 usług).
5. Integrujemy przez interfejs `VideoProvider`, więc gdyby kiedyś trzeba było przejść na AWS, podmieniamy adapter, a nie cały moduł.

Uczciwie o ochronie: podpisane, wygasające linki + ograniczenie domen skutecznie blokują udostępnianie linku i hotlinking. **Żadna opcja bez DRM nie zapobiegnie nagraniu ekranu** przez zalogowanego kursanta; DRM (Bunny MediaCage Enterprise ~$99/mies.) przy tej skali jest nieopłacalny.

---

## 3. Model danych (Prisma — nowe/zmienione modele)

```prisma
enum CourseStatus   { DRAFT PUBLISHED ARCHIVED }
enum CourseItemKind { VIDEO PDF }
enum VideoState     { UPLOADING PROCESSING READY FAILED }
enum EnrollmentSource { AUTO MANUAL }
enum MemberTokenPurpose { SET_PASSWORD RESET_PASSWORD }

model Course {
  id                String        @id @default(cuid())
  slug              String        @unique          // subdomena: <slug>.icpemission.pl
  slugHistory       String[]      @default([])     // stare slugi → przekierowanie po zmianie nazwy
  title             Json                            // { pl, en? }
  description       Json?
  status            CourseStatus  @default(DRAFT)
  sourceInstanceIds String[]      @default([])     // eventy, których CONFIRMED zgłoszenia dają dostęp
  accessUntil       DateTime?                       // opcjonalne wygaszenie dostępu
  grantOn           String        @default("CONFIRMED") // 'CONFIRMED' | 'ANY_ACTIVE' (patrz §5)
  theme             Json?                           // { primaryColor, heroImageUrl } — opcjonalnie
  items             CourseItem[]
  enrollments       CourseEnrollment[]
  createdAt         DateTime      @default(now())
  updatedAt         DateTime      @updatedAt
}

model CourseItem {
  id           String         @id @default(cuid())
  courseId     String
  course       Course         @relation(fields: [courseId], references: [id], onDelete: Cascade)
  kind         CourseItemKind
  title        Json
  description  Json?
  order        Int            @default(0)
  published    Boolean        @default(false)
  // VIDEO
  videoProvider String?       // 'bunny'
  videoId       String?       // GUID w Bunny
  videoState    VideoState?
  durationSec   Int?
  thumbnailUrl  String?
  // PDF
  fileId        String?       // → PrivateFile
  createdAt    DateTime       @default(now())
  updatedAt    DateTime       @updatedAt
}

model PrivateFile {                 // NIE mylić z Upload (publiczne obrazki z cache immutable)
  id           String   @id @default(cuid())
  mimeType     String
  size         Int
  originalName String?
  data         Bytes
  createdAt    DateTime @default(now())
}

model CourseEnrollment {
  id             String           @id @default(cuid())
  courseId       String
  course         Course           @relation(fields: [courseId], references: [id], onDelete: Cascade)
  guestId        String
  guest          GuestAccount     @relation(fields: [guestId], references: [id])
  source         EnrollmentSource
  registrationId String?          // gdy AUTO
  revokedAt      DateTime?
  welcomeSentAt  DateTime?
  lastSeenAt     DateTime?
  createdAt      DateTime         @default(now())
  @@unique([courseId, guestId])
}

model MemberToken {
  id        String             @id @default(cuid())
  guestId   String
  purpose   MemberTokenPurpose
  tokenHash String             @unique       // sha256 tokenu; surowy token tylko w mailu
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime           @default(now())
}

// GuestAccount (istniejący): + enrollments CourseEnrollment[], + passwordSetAt DateTime?, + lastLoginAt DateTime?
```

Wszystko to nowe tabele/nullable kolumny → wchodzi przez istniejące `prisma db push` przy starcie Render (jak dotąd: po pushu **Manual Deploy `icpe-api`**).

PDF w Postgresie: przy 2–kilku plikach po kilka–kilkanaście MB to w porządku (limit 25 MB/plik). Gdyby materiałów przybywało (setki MB), adapter `FileStorage` przełączamy na Bunny Storage (ten sam dostawca, ~$0,01/GB).

---

## 4. Logowanie kursantów (realm `member`)

Konto kursanta = istniejący `GuestAccount` (jest już `passwordHash`, argon2 w projekcie). Jedno konto może mieć dostęp do wielu kursów; sesja jest per subdomena (token w `localStorage` danej subdomeny — to akceptowalne).

**⚠️ Krok 0 — poprawka bezpieczeństwa (przed czymkolwiek innym):** obecny `JwtAuthGuard` przepuszcza **każdy** poprawny JWT podpisany `JWT_SECRET` — nie sprawdza `realm`. Gdybyśmy wydali kursantom tokeny tym samym sekretem, kursant miałby dostęp do `/admin/*`. Dlatego:
- `JwtAuthGuard` wymaga `realm === 'admin'` (tokeny serwisowe bez zmian),
- tokeny kursantów podpisujemy **osobnym sekretem** `MEMBER_JWT_SECRET` i sprawdzamy osobnym `MemberAuthGuard` (realm `member` + aktywny, nieodwołany `CourseEnrollment` dla kursu z żądania).

Przepływy:
1. **Powitanie:** powstaje enrollment → mail `COURSE_WELCOME` (Resend, PL/EN wg `locale`) z linkiem `https://<slug>.icpemission.pl/ustaw-haslo?t=<token>` (ważny 14 dni, jednorazowy). Jeśli konto ma już hasło (inny kurs) — mail „Masz dostęp do nowego kursu, zaloguj się".
2. **Logowanie:** `email + hasło` → JWT member (ważny 7 dni). Przy każdym żądaniu sprawdzamy enrollment w bazie, więc odebranie dostępu działa natychmiast mimo długiego tokenu.
3. **Nie pamiętam hasła:** zawsze ta sama odpowiedź („jeśli konto istnieje, wysłaliśmy link") — brak ujawniania, czy e-mail jest w bazie. Token ważny 1 h.
4. **Ochrona przed zgadywaniem:** limit prób (np. 10 / 15 min per IP+e-mail, `@nestjs/throttler`), minimalna długość hasła 8.

---

## 5. Nadawanie dostępu: automatycznie + ręcznie

**Automatycznie.** Kurs ma listę `sourceInstanceIds` (wybór eventów w edycji kursu). Funkcja idempotentna `CourseAccessService.syncRegistration(registrationId)`:
- status `CONFIRMED` → upsert `GuestAccount` po e-mailu z `contact` zgłoszenia (+ imię/nazwisko), upsert `CourseEnrollment(source=AUTO)`, wysyłka powitania, jeśli jeszcze nie wysłane;
- status `CANCELLED` → `revokedAt` dla enrollmentu **AUTO** z tego zgłoszenia (ręczne zostają nietknięte);
- `PENDING_PAYMENT` / `AWAITING_TRANSFER` → brak dostępu do potwierdzenia wpłaty (chyba że kurs ma `grantOn = ANY_ACTIVE` — patrz niżej).

Status `CONFIRMED` jest dziś ustawiany w kilku miejscach — wszystkie muszą wołać `syncRegistration`:
`payments.service.ts` (potwierdzenie płatności), `registrations.service.ts` (`updateStatus`, `markPaid`), `admin.service.ts` (zmiana statusu / potwierdzenie z panelu i Personal OS), `invitations.service.ts` (zgłoszenie tworzone przy potwierdzeniu zaproszenia INVITE).

**Uwaga — kurs bezpłatny:** dziś nowe zgłoszenie dostaje zawsze `PENDING_PAYMENT` albo `AWAITING_TRANSFER` (także przy evencie z `free: true`), a `CONFIRMED` ustawia dopiero płatność lub admin. Dlatego kurs dostaje ustawienie `grantOn`: `CONFIRMED` (domyślnie — dostęp po opłaceniu/zatwierdzeniu) albo `ANY_ACTIVE` (dostęp od razu po zapisie: `PENDING_PAYMENT`/`AWAITING_TRANSFER`/`CONFIRMED` — sensowne dla kursu darmowego). Przy `ANY_ACTIVE` `syncRegistration` wołamy też w `registrations.service.ts` przy tworzeniu zgłoszenia.
Siatka bezpieczeństwa: `CourseAccessService.reconcileCourse(courseId)` — przegląd wszystkich zgłoszeń z powiązanych eventów; wołany przy zapisie kursu, przy przycisku **„Synchronizuj z eventami"** w panelu i leniwie przy wejściu admina na listę kursantów.

**Ręcznie** (panel ▸ Kursy online ▸ Kursanci): dodaj osobę (imię, nazwisko, e-mail, język) → `source=MANUAL` + powitanie; wklejenie listy CSV; odbierz/przywróć dostęp; „Wyślij ponownie link do ustawienia hasła".

---

## 6. API — nowy `CoursesModule` (`api/src/courses/`)

**Admin** (`JwtAuthGuard`, realm admin lub token serwisowy — Personal OS może z tego korzystać później):
| Metoda | Ścieżka | Opis |
|---|---|---|
| GET/POST | `/admin/courses` | lista / utworzenie (slug z nazwy, transliteracja PL: „Łódź" → `lodz`) |
| GET/PATCH/DELETE | `/admin/courses/:id` | edycja (tytuł, slug z walidacją, eventy źródłowe, status, `accessUntil`) |
| POST | `/admin/courses/:id/items/video` | tworzy wideo w Bunny → zwraca `{ itemId, tusEndpoint, libraryId, videoId, signature, expire }` |
| POST | `/admin/courses/:id/items/pdf` | multipart, `application/pdf`, ≤ 25 MB → `PrivateFile` + `CourseItem` |
| PATCH/DELETE | `/admin/courses/:id/items/:itemId` | tytuł, opis, publikacja; DELETE usuwa też wideo w Bunny |
| PUT | `/admin/courses/:id/items/order` | kolejność |
| GET/POST | `/admin/courses/:id/enrollments` | lista (źródło, status, ostatnie logowanie) / dodanie ręczne |
| POST | `/admin/courses/:id/enrollments/import` | CSV / lista |
| PATCH | `/admin/courses/:id/enrollments/:eid` | odbierz / przywróć |
| POST | `/admin/courses/:id/enrollments/:eid/resend` | ponowny mail |
| POST | `/admin/courses/:id/sync` | `reconcileCourse` |

**Webhook:** `POST /webhooks/bunny-stream` — weryfikacja `X-BunnyStream-Signature` (HMAC-SHA256 surowego body kluczem biblioteki, porównanie constant-time). Wymaga `NestFactory.create(AppModule, { rawBody: true })` w `main.ts`. Status `3` → `READY` (+ pobranie długości i miniatury z API Bunny), `5` → `FAILED`. Fallback: panel odpytuje status wideo, gdy webhook nie dotrze (Render free może spać).

**Publiczne / kursant:**
| Metoda | Ścieżka | Opis |
|---|---|---|
| GET | `/courses/public/:slug` | tytuł + motyw do ekranu logowania; obsługuje `slugHistory` (zwraca nowy slug → front przekierowuje); DRAFT = 404 |
| POST | `/member/auth/login` · `/member/auth/set-password` · `/member/auth/forgot` | patrz §4 |
| GET | `/member/courses/:slug` | pozycje kursu (tylko `published`, wideo tylko `READY`) — bez sekretów |
| GET | `/member/courses/:slug/items/:id/play` | `{ embedUrl }` = `https://iframe.mediadelivery.net/embed/<lib>/<videoId>?token=SHA256_HEX(tokenKey+videoId+expires)&expires=<teraz+4h>` |
| GET | `/member/courses/:slug/items/:id/file-link` | `{ url }` = `/member/files/:fileId?exp=..&sig=HMAC(FILE_SIGNING_SECRET)` ważny 10 min |
| GET | `/member/files/:fileId` | weryfikuje podpis → PDF z `Content-Disposition: inline`, `Cache-Control: private, no-store` |

Podpisany link do PDF (zamiast nagłówka `Authorization`) jest potrzebny, bo przeglądarkowy podgląd PDF w `<iframe>`/nowej karcie nie wyśle Bearer tokenu.

---

## 7. Frontend (`app/`)

### 7a. Rozpoznanie kursu po adresie
W `App.tsx` przed routerem: `resolveCourseSlug()`:
- `hostname` pasuje do `^([a-z0-9-]+)\.icpemission\.pl$` i nie jest zarezerwowany → `MemberApp` ze slugiem;
- w przeciwnym razie obecne trasy + nowa trasa awaryjna `/k/:slug/*` (dev, localhost, zanim zadziała DNS).

**Lista zarezerwowanych slugów** (walidacja w API i UI): `www, rejestracja, api, admin, panel, mail, smtp, pop, imap, ftp, kurs, kursy, static, cdn, app, docs` + każdy subdomenowy rekord istniejący w DNS.

### 7b. Panel kursanta (`app/src/member/`)
- **Logowanie** — nazwa kursu (z `/courses/public/:slug`), e-mail, hasło, „Nie pamiętam hasła", przełącznik PL/EN (istniejące i18n), light/dark jak w reszcie aplikacji.
- **Ustaw hasło / Reset** — `/ustaw-haslo?t=…`, `/reset-hasla?t=…`.
- **Dashboard** — nagłówek z tytułem i opisem kursu, „Wyloguj";
  - sekcja **Filmy**: karty z miniaturą, tytułem, czasem trwania → odtwarzacz Bunny w responsywnym iframe 16:9 (URL pobierany przy kliknięciu, odświeżany gdy wygaśnie);
  - sekcja **Materiały**: karty PDF → „Otwórz" (podgląd w nowej karcie / iframe) i „Pobierz".
- Mobile-first (kursanci często z telefonu), brak indeksowania: `<meta name="robots" content="noindex">` na subdomenach kursów.

### 7c. Panel admina — nowy moduł „Kursy online"
Pozycja w `AdminSidebar` (ikona `GraduationCap`), ekrany:
1. **Lista kursów** — nazwa, adres (klikany), status, liczba kursantów.
2. **Edycja kursu** — nazwa PL/EN → slug generowany automatycznie (edytowalny, podgląd `https://<slug>.icpemission.pl`, walidacja unikalności/rezerwacji na żywo; ostrzeżenie przy zmianie slugu opublikowanego kursu — stary adres przekieruje dzięki `slugHistory`, ale warto poinformować kursantów), opis, eventy źródłowe (multi-select), „Dostęp od: opłacenia/zatwierdzenia | samego zapisu", status (Szkic/Opublikowany/Archiwum), opcjonalna data wygaśnięcia dostępu.
3. **Zawartość** — „Dodaj film" (wybór pliku → `tus-js-client` z paskiem postępu i wznawianiem → stan „Kodowanie…" → „Gotowe"), „Dodaj PDF", edycja tytułu/opisu, przeciąganie kolejności, przełącznik „Widoczne dla kursantów", podgląd „jak widzi kursant".
4. **Kursanci** — tabela (imię, e-mail, źródło AUTO/RĘCZNIE, hasło ustawione?, ostatnie logowanie, status), „Dodaj", „Importuj", „Synchronizuj z eventami", akcje per osoba.

Nowa zależność frontu: `tus-js-client`. Nowe zależności API: `@nestjs/throttler` (opcjonalnie). Integracja z Bunny przez `fetch` (bez SDK), analogicznie do Resend.

---

## 8. Infrastruktura i konfiguracja (do zrobienia przez Jacka)

### Bunny.net
1. Załóż konto na bunny.net → **Stream ▸ Add Video Library** (region główny Frankfurt, bez dodatkowej replikacji).
2. W bibliotece: **Security ▸ Embed view token authentication: ON**; **Allowed domains:** `icpemission.pl` (+ subdomeny); wyłącz „Allow direct play"/pobieranie MP4.
3. **Webhook URL:** `https://icpe-api.onrender.com/webhooks/bunny-stream`.
4. Skopiuj do Render ▸ `icpe-api` ▸ Environment (w `render.yaml` jako `sync:false`):
   - `BUNNY_STREAM_LIBRARY_ID`, `BUNNY_STREAM_API_KEY` (klucz biblioteki), `BUNNY_STREAM_TOKEN_KEY` (token authentication key), opcjonalnie `BUNNY_STREAM_READONLY_KEY` (do weryfikacji webhooka, jeśli różny)
   - `MEMBER_JWT_SECRET`, `FILE_SIGNING_SECRET` (w `render.yaml` jako `generateValue: true`)
   - `MEMBER_BASE_DOMAIN=icpemission.pl`

### DNS (aderlo.cloud) — wildcard dla subdomen kursów
| Rekord | Typ | Wartość |
|---|---|---|
| `*` | CNAME | `icpe-frontend.onrender.com` |
| `_acme-challenge` | CNAME | `<id-usługi>.verify.renderdns.com` (Render poda dokładną wartość) |
| `_cf-custom-hostname` | CNAME | `<id-usługi>.hostname.renderdns.com` (j.w.) |

- Istniejące konkretne rekordy (`www`, `rejestracja`, `mail`, `smtp`, `pop`, MX, TXT/DKIM Brevo/Resend) **mają pierwszeństwo przed wildcardem** — nic się nie zepsuje. Apex zostaje przy rekordzie A na Render (Render wymaga, by domena główna też wskazywała na Render — już spełnione).
- Render ▸ `icpe-frontend` ▸ Settings ▸ Custom Domains ▸ dodaj `*.icpemission.pl`. Sprawdź limit domen w planie workspace (Hobby: 2 w cenie, każda kolejna ~$0,25/mies.).
- Skutek uboczny wildcardu: literówka typu `wwww.icpemission.pl` pokaże aplikację → ekran „Nie znaleziono kursu" z linkiem na stronę główną.

### Render — API
- `icpe-api` jest na planie **free (usypia)**. Pierwsze logowanie kursanta po przerwie może trwać 30–60 s, a webhook Bunny może trafić na uśpioną usługę (stąd fallback odpytywania). **Na czas trwania kursu zalecam plan Starter** (~$7/mies.) albo potwierdzenie, że istniejący `uptime-keepalive` realnie trzyma usługę.

---

## 9. Bezpieczeństwo i RODO — checklista
- [ ] Poprawka `JwtAuthGuard` (realm) + osobny `MEMBER_JWT_SECRET` — **blokujące**.
- [ ] Hasła argon2, limit prób logowania, brak enumeracji kont, tokeny jednorazowe przechowywane jako hash.
- [ ] Wideo: podpisane embedy (4 h), ograniczenie domen; PDF: podpis 10 min, `no-store`.
- [ ] Odebranie dostępu działa natychmiast (sprawdzenie enrollmentu przy każdym żądaniu).
- [ ] Polityka prywatności: nowy podmiot przetwarzający (Bunny — IP oglądających, UE) + cel „dostęp do kursu online"; umowa powierzenia (DPA) z Bunny.
- [ ] `noindex` na subdomenach kursów.
- [ ] Opcjonalnie v2: znak wodny w PDF (imię + e-mail kursanta) — zniechęca do udostępniania.

---

## 10. Etapy wdrożenia

| Etap | Zakres | Szac. nakład | Kto |
|---|---|---|---|
| **E0** | Poprawka `JwtAuthGuard` (realm) + test, że panel admina i Personal OS działają dalej | 0,5 dnia | Claude |
| **E1** | Prisma (modele §3), `CoursesModule` admin CRUD, slug + rezerwacje, member-auth (login/ustaw/reset), maile `COURSE_WELCOME` / `PASSWORD_RESET` (PL/EN) | 1,5 dnia | Claude |
| **E2** | Adapter Bunny (create video, podpis TUS, podpis embedu, webhook z `rawBody`, polling), `PrivateFile` + podpisane linki PDF | 1 dzień | Claude |
| **E3** | Dostęp AUTO (`syncRegistration` w 6 miejscach + `reconcileCourse`) i RĘCZNY (dodaj/import/odbierz/wyślij ponownie) | 1 dzień | Claude |
| **E4** | Admin UI „Kursy online" (lista, edycja, zawartość z uploadem TUS, kursanci) | 1,5 dnia | Claude |
| **E5** | Member UI (routing po hoście, logowanie, ustaw hasło, dashboard, player, PDF), i18n PL/EN | 1 dzień | Claude |
| **E6** | Konto Bunny + ENV, DNS wildcard + Render custom domain, Manual Deploy `icpe-api`, test end-to-end na kursie testowym (`test-kurs.icpemission.pl`) | 0,5 dnia | **Jacek** (z instrukcją) |

Razem ~7 dni roboczych pracy programistycznej (w praktyce kilka sesji Claude). Kolejność E0→E6; E4/E5 mogą iść równolegle po E1–E2. Weryfikacja jak zawsze: `tsc --noEmit` api+app, `vite build` (w `/tmp`), push przez Jacka.

**Test akceptacyjny v1:** admin tworzy kurs „Test kurs" → adres `test-kurs.icpemission.pl`; wgrywa 2 filmy i 2 PDF-y, publikuje; zgłoszenie testowe w powiązanym evencie zmienia status na CONFIRMED → przychodzi mail → ustawienie hasła → logowanie → oba filmy grają (także na telefonie), oba PDF-y się otwierają; skopiowany link do filmu/PDF przestaje działać po czasie; odebranie dostępu w panelu wylogowuje przy następnym żądaniu; osoba bez dostępu nie wejdzie.

---

## 11. Otwarte pytania (nie blokują startu E0–E2)
1. Czy dostęp ma wygasać (np. 6 miesięcy po kursie)? — model ma `accessUntil`, domyślnie bez limitu.
2. PDF: tylko podgląd, czy też „Pobierz"? — domyślnie oba.
3. Język kursu: PL, czy PL+EN (jak reszta systemu)? — domyślnie PL+EN dla interfejsu, treści wg tego, co admin wpisze.
4. Czy potrzebny handoff dla Personal OS (zarządzanie kursami z CRM)? — API jest gotowe na token serwisowy; prompt `docs/13-…` można dopisać później.
5. Motyw per kurs (kolor, zdjęcie w tle ekranu logowania) — v1 czy później?

## 12. Poza zakresem v1 (świadomie)
Postęp oglądania i „ukończone", moduły/lekcje, quizy, certyfikaty, komentarze, płatny dostęp bezpośrednio do kursu (bez eventu), DRM, aplikacja mobilna.

---

### Źródła (cenniki/dokumentacja, stan 2026-09)
- Bunny Stream — cennik: https://bunny.net/docs/stream/pricing · TUS upload: https://bunny.net/docs/stream/tus-resumable-uploads · token embedu: https://docs.bunny.net/stream/token-authentication · webhooki: https://bunny.net/docs/stream/webhooks
- Cloudflare Stream — cennik: https://developers.cloudflare.com/stream/pricing/
- Mux — cennik: https://www.mux.com/docs/pricing · plan darmowy: https://www.mux.com/blog/free-plan
- AWS CloudFront — ceny/free tier: https://akalcloud.ai/blog/cloudfront-pricing/ · MediaConvert: https://c3x.dev/blog/aws-elemental-mediaconvert-cost/
- Render — custom/wildcard domains: https://render.com/docs/custom-domains
