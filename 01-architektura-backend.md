# ICPE Mission — System rejestracji na eventy
## Architektura backendu (NestJS + PostgreSQL)

Wersja 1.0 — dokument projektowy. Zakres: rejestracja na wyjazdy formacyjne, generator stron (jednorazowych i evergreen), wielojęzyczne formularze, cennik i przydział pokoi, płatności (online + przelew), konta gości, automatyczne maile, moduł obecności na spotkaniach, integracja z kalendarzem (Google / iCal).

---

## 1. Stos technologiczny

| Warstwa | Wybór | Uzasadnienie |
|---|---|---|
| Język | TypeScript | Wspólny typ DTO między backendem a frontendem (React) |
| Framework API | **NestJS** | Modułowość, DI, dekoratory, wbudowane wsparcie dla guardów/validacji/kolejek |
| Baza danych | **PostgreSQL 16** | Relacyjny model (rejestracje ↔ pokoje ↔ płatności), transakcje, JSONB na pola dynamiczne |
| ORM | **Prisma** | Migracje, typowane query, czytelny schema |
| Kolejki / zadania | **BullMQ + Redis** | Maile, generowanie kolejnych edycji evergreen, przypomnienia (scheduler) |
| Cache / sesje | Redis | Rate-limiting, blokady miejsc (hold), cache cennika |
| Auth | JWT (access + refresh) + Argon2 | Osobne realmy: `admin` (panel) i `guest` (konta gości) |
| Walidacja | class-validator / class-transformer | DTO z dekoratorami, walidacja per-locale |
| i18n | nestjs-i18n + tłumaczenia w bazie | Statyczne UI z plików, dynamiczne pola formularza z bazy |
| Pliki | S3-compatible (np. Backblaze/MinIO) | Załączniki, logo eventów, eksporty |
| Płatności | Adapter: **Przelewy24 / PayU** (PL) + **Stripe** (międzynarodowo) | Wzorzec strategii — łatwe dodanie kolejnego operatora |
| Mail | Provider-agnostic (SMTP / Resend / SendGrid) + MJML | Szablony wielojęzyczne |
| Kalendarz | Generator ICS (RFC 5545) + link "Add to Google Calendar" | Bez integracji OAuth — czysty plik .ics i URL |
| Obserwowalność | pino (logi), Sentry, OpenTelemetry | Diagnostyka |
| Deploy | Docker Compose / Kubernetes; API + worker + Postgres + Redis | Rozdzielony proces workera od API |

Architektura modułowa typu **modular monolith** — jeden deployowalny backend podzielony na moduły domenowe. Łatwy do późniejszego rozbicia na mikroserwisy, ale prosty na start.

---

## 2. Moduły domenowe (NestJS)

```
src/
├── auth/                  # logowanie admin + guest, JWT, refresh, role
├── users/                 # konta administracyjne (staff)
├── guests/                # konta gości (rejestrujących się)
├── events/                # EventSeries (szablon/cykl) + EventInstance (edycja)
├── pages/                 # generator stron rejestracji (slug, motyw, pola)
├── rooms/                 # typy pokoi, pokoje, przydział
├── pricing/               # silnik wyceny (uczestnicy + zakwaterowanie)
├── registrations/         # zgłoszenia, uczestnicy, dzieci, status
├── payments/              # adaptery operatorów, webhooki, rozliczenia
├── attendance/            # spotkania cykliczne + obecność
├── notifications/         # maile/SMS, szablony, kolejka
├── calendar/              # generowanie ICS + linki Google
├── i18n/                  # tłumaczenia UI i etykiet pól
├── scheduler/             # cron: reset evergreen, przypomnienia
├── admin-settings/        # ustawienia organizacji, branding, waluty
└── common/                # guards, interceptors, DTO bazowe, audyt
```

---

## 3. Kluczowe koncepcje domenowe

### 3.1 Event jednorazowy vs. evergreen

Rozdzielamy **szablon/cykl** od **konkretnej edycji**:

- **EventSeries** — definicja powtarzalnego eventu (np. „Weekend formacyjny — comiesięczny"). Zawiera regułę powtarzania (RRULE / cron), domyślne ustawienia, slug strony evergreen.
- **EventInstance (edycja)** — konkretny, datowany event z własnym oknem rejestracji, pojemnością, pulą pokoi, cennikiem i zgłoszeniami.

| Typ strony | Zachowanie |
|---|---|
| **Jednorazowa** | `EventSeries.recurrence = null`. Jedna `EventInstance`. Po zamknięciu rejestracji strona pokazuje status „zamknięte" / podsumowanie. |
| **Evergreen** | `EventSeries.recurrence = RRULE`. Publiczny slug zawsze wskazuje **aktualnie otwartą** edycję. Po `registrationClosesAt` scheduler archiwizuje bieżącą edycję i tworzy kolejną wg kalendarza — „zgłoszenia resetują się" i zbierają na następny termin. |

**Logika resetu evergreen (scheduler):**
1. Cron co godzinę sprawdza `EventInstance` z `status = OPEN` i minionym `registrationClosesAt`.
2. Zamyka edycję (`status = CLOSED`), zgłoszenia pozostają jako archiwum/raport.
3. Z `EventSeries.recurrence` wylicza następną datę i tworzy nową `EventInstance` (kopiuje pule pokoi, cennik, definicję formularza), ustawia `registrationOpensAt/ClosesAt` z offsetów.
4. Publiczny resolver strony (`/r/:slug`) zawsze zwraca edycję z `status = OPEN` dla danej serii.

Pola sterujące oknem:
```
EventSeries.registrationOpenOffsetDays   # ile dni przed eventem otwiera się rejestracja
EventSeries.registrationCloseOffsetDays  # ile dni przed eventem zamyka
EventSeries.recurrence                   # RRULE, np. FREQ=MONTHLY;BYDAY=1FR
```

### 3.2 Uczestnicy i dzieci

`Registration` (zgłoszenie) → wielu `Participant`. Każdy uczestnik ma `type = ADULT | CHILD`, `birthDate`/`age`, `gender`, preferencje żywieniowe/alergie. Osoba zgłaszająca jest uczestnikiem typu ADULT i nosicielem danych kontaktowych. Dzieci to uczestnicy typu CHILD z wiekiem i płcią — co napędza wycenę wg progów wiekowych i przydział pokoi rodzinnych.

### 3.3 Pokoje — typy, pule, przydział

- **RoomType** — np. „Pokój 1-osobowy", „Miejsce w pokoju 2-osobowym", „Pokój rodzinny 4-os.". Pola: `capacity`, `pricingModel`, `price`, `genderPolicy` (dowolny / tylko M / tylko K / rodzinny).
- **Room** — fizyczny pokój: `label/number`, `roomTypeId`, `capacity`, `floor/building`.
- Admin w panelu definiuje **typy pokoi i ich ilość**, a następnie **przypisuje konkretne pokoje** do zgłoszeń/uczestników (`RoomAssignment`).
- Gość na formularzu wybiera **preferencję typu pokoju** (`preferredRoomTypeId`), co wpływa na wyliczaną cenę. Faktyczny przydział pokoju robi admin.

### 3.4 Silnik wyceny (pricing)

Cena całkowita zgłoszenia liczona deterministycznie z ustawień edycji:

```
total =  Σ (opłata bazowa uczestnika wg progu wiekowego)
       + koszt zakwaterowania (f. typu pokoju, liczby nocy, liczby osób)
       + opcje dodatkowe (transport, materiały…)
       − rabaty (rodzinny, wczesna rejestracja, kod promo)
```

**Modele cenowe zakwaterowania (`RoomType.pricingModel`):**

| Model | Wyliczenie | Przykład |
|---|---|---|
| `PER_PERSON` | cena × liczba osób | Miejsce w pokoju 2-os.: 150 zł/os |
| `PER_ROOM` | cena za cały pokój | Pokój rodzinny: 600 zł niezależnie od obłożenia |
| `PER_PERSON_PER_NIGHT` | cena × osoby × noce | 80 zł/os/noc × 2 noce |
| `SINGLE_SUPPLEMENT` | cena bazowa + dopłata do jedynki | dopłata 100 zł za pokój 1-os. |

Dzięki temu **pokój 1-osobowy może mieć inną cenę niż miejsce w 2-osobowym** — to dwa różne `RoomType` z różnym `price`/`pricingModel`, a koszt wynika z wyboru gościa + ustawień edycji.

Progi wiekowe (`AgeBracket`) konfigurowalne per edycja:
```
{ label: "Dziecko 0–3", minAge: 0, maxAge: 3, price: 0 }
{ label: "Dziecko 4–12", minAge: 4, maxAge: 12, price: 120 }
{ label: "Dorosły 13+", minAge: 13, maxAge: 200, price: 250 }
```

Wycena jest **idempotentna i serwerowa** — frontend pokazuje podgląd (`POST /pricing/quote`), ale wartość wiążąca liczy backend przy zapisie, by uniknąć manipulacji.

### 3.5 Płatności (online + przelew)

Per edycja admin ustawia dozwolone metody: `ONLINE`, `BANK_TRANSFER` lub obie.

- **ONLINE** — adapter `PaymentProvider` (Przelewy24 / PayU / Stripe). Tworzymy `Payment` (PENDING) → redirect do operatora → webhook potwierdza → `Payment = PAID`, `Registration = CONFIRMED`.
- **BANK_TRANSFER** — po zgłoszeniu pokazujemy dane do przelewu (z `AdminSettings`) + indywidualny tytuł (`REG-{id}`). Status `AWAITING_TRANSFER`; admin ręcznie oznacza „opłacone" (lub import wyciągu w przyszłości).

Wzorzec strategii:
```ts
interface PaymentProvider {
  createCheckout(reg: Registration, amount: Money): Promise<{ redirectUrl: string; externalId: string }>;
  verifyWebhook(payload, signature): Promise<PaymentStatus>;
  refund(payment: Payment, amount: Money): Promise<void>;
}
```

### 3.6 Konta gości

Gość może (opcjonalnie) założyć konto: historia zgłoszeń, samodzielna edycja danych przed terminem, szybsze wypełnianie kolejnych formularzy (autouzupełnianie profilu i danych dzieci). Wypełnianie **bez konta** też możliwe — wtedy w mailu trafia podpisany **link edycyjny** (magic link) do podglądu/edycji zgłoszenia.

### 3.7 Moduł obecności

Niezależny od wyjazdów: `MeetingSeries` (np. cotygodniowe spotkanie wspólnoty) → `MeetingOccurrence` (konkretny termin) → `AttendanceRecord` (gość/uczestnik, status `PRESENT | ABSENT | EXCUSED`, kanał zgłoszenia). Gość zgłasza obecność sam (self-check-in przez link/QR) lub koordynator odhacza w panelu.

### 3.8 i18n (PL / EN / IT)

Dwa poziomy tłumaczeń:
- **Statyczne UI** (przyciski, komunikaty) — pliki `pl.json / en.json / it.json` po stronie frontu + `nestjs-i18n` dla maili/błędów API.
- **Treści dynamiczne** (nazwa eventu, opis, etykiety pól niestandardowych, regulamin) — tabela `Translation` z kluczem encji i `locale`. Każdy `EventInstance` / `FormField` ma warianty PL/EN/IT.
- Locale wybierane na stronie (selektor) i zapisywane przy zgłoszeniu (`Registration.locale`) — maile i podsumowanie idą w języku gościa.

---

## 4. Model danych (skrót, Prisma-like)

> Pełny diagram w pliku `02-erd-model-danych.mermaid`.

```prisma
model Organization {                 // pojedyncza organizacja ICPE
  id            String  @id @default(cuid())
  name          String
  currency      String  @default("PLN")
  bankDetails   Json?                 // dane do przelewu
  branding      Json?                 // logo, kolory
  settings      Json?
}

model AdminUser {
  id        String  @id @default(cuid())
  email     String  @unique
  passwordHash String
  role      AdminRole               // SUPER_ADMIN | ADMIN | COORDINATOR
  locale    String  @default("pl")
}

model GuestAccount {
  id        String  @id @default(cuid())
  email     String  @unique
  passwordHash String?              // null => tylko magic-link
  firstName String
  lastName  String
  phone     String?
  address   Json?
  locale    String  @default("pl")
  profile   Json?                   // zapisane dane dzieci do autouzupełniania
  registrations Registration[]
}

model EventSeries {
  id          String   @id @default(cuid())
  type        EventType            // ONE_TIME | EVERGREEN
  recurrence  String?              // RRULE (evergreen)
  registrationOpenOffsetDays  Int?
  registrationCloseOffsetDays Int?
  defaultSettings Json?
  page        RegistrationPage?
  instances   EventInstance[]
  translations Translation[]
}

model EventInstance {
  id          String   @id @default(cuid())
  seriesId    String
  series      EventSeries @relation(fields: [seriesId], references: [id])
  title       Json                 // {pl, en, it}
  description Json?
  startsAt    DateTime
  endsAt      DateTime
  location    String?
  nights      Int      @default(0)
  capacity    Int?
  status      InstanceStatus       // DRAFT | OPEN | CLOSED | ARCHIVED
  registrationOpensAt  DateTime
  registrationClosesAt DateTime
  paymentMethods PaymentMethod[]   // ONLINE | BANK_TRANSFER
  ageBrackets Json                 // progi wiekowe + ceny
  options     Json?                // opcje dodatkowe + ceny
  roomTypes   RoomType[]
  rooms       Room[]
  registrations Registration[]
}

model RegistrationPage {           // wynik generatora stron
  id         String  @id @default(cuid())
  seriesId   String  @unique
  slug       String  @unique       // /r/:slug
  isEvergreen Boolean
  theme      Json?                 // kolory, logo, hero
  enabledFields Json               // które pola zbieramy
  customFields  Json?              // pola niestandardowe + tłumaczenia
  locales    String[]             // ["pl","en","it"]
  published  Boolean @default(false)
}

model RoomType {
  id          String  @id @default(cuid())
  instanceId  String
  name        Json                 // {pl,en,it}
  capacity    Int
  pricingModel PricingModel        // PER_PERSON | PER_ROOM | PER_PERSON_PER_NIGHT | SINGLE_SUPPLEMENT
  price       Decimal
  genderPolicy GenderPolicy        // ANY | MALE | FEMALE | FAMILY
  quantity    Int                  // ile pokoi tego typu
  rooms       Room[]
}

model Room {
  id          String  @id @default(cuid())
  instanceId  String
  roomTypeId  String
  label       String               // numer/nazwa
  capacity    Int
  assignments RoomAssignment[]
}

model Registration {
  id          String  @id @default(cuid())
  instanceId  String
  guestId     String?              // null => zgłoszenie bez konta
  status      RegistrationStatus   // DRAFT | PENDING_PAYMENT | AWAITING_TRANSFER | CONFIRMED | WAITLIST | CANCELLED
  locale      String
  contact     Json                 // imię, nazwisko, email, telefon, adres
  preferredRoomTypeId String?
  dietaryNotes String?
  totalPrice  Decimal
  currency    String
  paymentMethod PaymentMethod?
  editToken   String  @unique      // magic-link do edycji
  createdAt   DateTime @default(now())
  participants Participant[]
  payments    Payment[]
  assignments RoomAssignment[]
}

model Participant {
  id          String  @id @default(cuid())
  registrationId String
  type        ParticipantType      // ADULT | CHILD
  firstName   String
  lastName    String
  birthDate   DateTime?
  age         Int?
  gender      Gender               // MALE | FEMALE | OTHER
  dietary     String?              // preferencje/alergie
  assignment  RoomAssignment?
}

model RoomAssignment {
  id          String  @id @default(cuid())
  roomId      String
  registrationId String
  participantId  String?           // przydział na poziomie osoby (opcjonalnie)
  assignedBy  String               // adminId
  assignedAt  DateTime @default(now())
}

model Payment {
  id          String  @id @default(cuid())
  registrationId String
  provider    String               // p24 | payu | stripe | manual
  method      PaymentMethod
  amount      Decimal
  currency    String
  status      PaymentStatus        // PENDING | PAID | AWAITING_TRANSFER | FAILED | REFUNDED
  externalId  String?
  raw         Json?                // payload operatora
}

model MeetingSeries {
  id          String  @id @default(cuid())
  title       Json
  recurrence  String               // RRULE
  occurrences MeetingOccurrence[]
}

model MeetingOccurrence {
  id          String  @id @default(cuid())
  seriesId    String
  date        DateTime
  attendance  AttendanceRecord[]
}

model AttendanceRecord {
  id          String  @id @default(cuid())
  occurrenceId String
  guestId     String?
  participantName String?
  status      AttendanceStatus     // PRESENT | ABSENT | EXCUSED
  channel     String               // self | coordinator | qr
}

model Translation {
  id        String @id @default(cuid())
  entity    String   // "EventInstance.title" itp.
  entityId  String
  locale    String
  value     String
}

model Notification {
  id        String @id @default(cuid())
  type      String   // CONFIRMATION | PAYMENT_REMINDER | EVENT_REMINDER
  channel   String   // email | sms
  to        String
  locale    String
  status    String   // QUEUED | SENT | FAILED
  payload   Json
}
```

---

## 5. API — najważniejsze endpointy (REST)

### Publiczne (lejek rejestracji)
```
GET   /r/:slug                         # rozwiązuje stronę → aktualna otwarta edycja (evergreen) lub edycja jednorazowa
GET   /r/:slug/config?locale=pl        # konfiguracja formularza w danym języku
POST  /pricing/quote                   # podgląd ceny na podstawie wprowadzonych danych
POST  /registrations                   # utworzenie zgłoszenia (zwraca podsumowanie + sposób płatności)
GET   /registrations/:id?token=...     # podsumowanie / edycja przez magic-link
PUT   /registrations/:id?token=...     # edycja przed terminem
GET   /registrations/:id/calendar.ics  # plik iCal
GET   /registrations/:id/calendar/google # redirect do "Add to Google Calendar"
POST  /payments/:regId/checkout        # start płatności online
POST  /payments/webhook/:provider      # webhook operatora
POST  /attendance/check-in             # self-check-in obecności (link/QR)
```

### Konta gości
```
POST  /auth/guest/register | /auth/guest/login | /auth/guest/magic-link
GET   /guest/me/registrations
PUT   /guest/me/profile
```

### Panel admina (JWT + role)
```
# Generator stron i eventy
POST  /admin/series                    # nowy event (one-time / evergreen)
PUT   /admin/series/:id
POST  /admin/series/:id/page           # konfiguracja generatora strony (slug, motyw, pola, języki)
POST  /admin/series/:id/publish
GET   /admin/instances/:id             # podgląd edycji + statystyki
POST  /admin/instances/:id/clone

# Pokoje
POST  /admin/instances/:id/room-types  # dodanie typu pokoju + ilości
POST  /admin/instances/:id/rooms       # generowanie pokoi z typów
POST  /admin/registrations/:id/assign-room

# Cennik
PUT   /admin/instances/:id/pricing     # progi wiekowe, modele cenowe, opcje, rabaty

# Zgłoszenia i płatności
GET   /admin/instances/:id/registrations?status=&q=
PATCH /admin/registrations/:id/status
POST  /admin/registrations/:id/mark-paid     # ręczne potwierdzenie przelewu
GET   /admin/instances/:id/export.xlsx       # eksport listy

# Obecność
POST  /admin/meetings                  # seria spotkań
GET   /admin/meetings/:id/occurrences/:occId/attendance
PATCH /admin/attendance/:recordId

# Ustawienia
PUT   /admin/settings                  # dane organizacji, dane do przelewu, branding, operatorzy płatności
```

---

## 6. Kluczowe przepływy

### 6.1 Rejestracja gościa (happy path)
1. Gość otwiera `/r/:slug`, wybiera język (PL/EN/IT).
2. Wypełnia: dane kontaktowe + adres + telefon + email, dane dzieci (wiek, płeć, dieta), preferencje żywieniowe/alergie, preferowany typ pokoju.
3. Frontend woła `POST /pricing/quote` → pokazuje cenę na żywo.
4. `POST /registrations` → backend liczy cenę wiążącą, zapisuje, generuje `editToken`.
5. **Strona podsumowania**: dane zgłoszenia, cena, wybrana metoda płatności (online → przycisk „Zapłać"; przelew → dane + tytuł), przyciski **„Dodaj do Google Calendar"** i **„Pobierz .ics"**.
6. Mail potwierdzający w języku gościa + (jeśli przelew) przypomnienie o płatności.
7. Admin przydziela pokój; gość dostaje update.

### 6.2 Generowanie strony w panelu (generator)
1. Admin: „Nowy event" → wybiera **jednorazowy** lub **evergreen** (jeśli evergreen → ustawia kalendarz/RRULE i offsety okna rejestracji).
2. Definiuje edycję: termin, miejsce, liczba nocy, pojemność, metody płatności.
3. Dodaje **typy pokoi** (nazwa, pojemność, model cenowy, cena, ilość) → system generuje pulę pokoi.
4. Ustawia **cennik** (progi wiekowe, opcje, rabaty).
5. Konfiguruje **stronę** (slug, motyw/branding, które pola zbieramy, pola niestandardowe, języki).
6. Publikuje → strona dostępna pod `/r/:slug`. Dla evergreen scheduler dba o kolejne edycje i reset zgłoszeń.

### 6.3 Reset evergreen
Cron → zamknięcie minionej edycji → archiwizacja zgłoszeń → utworzenie kolejnej edycji wg RRULE z przeniesieniem konfiguracji → publiczny slug wskazuje nową otwartą edycję.

---

## 7. Bezpieczeństwo i niezawodność
- **Wycena tylko serwerowa** — klient nie ustala kwoty.
- **Blokady miejsc/pokoi (hold)** w Redis na czas płatności online (np. 15 min), by uniknąć nadrezerwacji.
- **Idempotencja webhooków** płatności (klucz `externalId`), weryfikacja podpisu operatora.
- **Magic-link** podpisany (HMAC) z TTL na edycję zgłoszenia bez konta.
- **RODO/GDPR**: minimalizacja danych, zgody (checkbox + wersja regulaminu), retencja i anonimizacja po X miesiącach, eksport/usunięcie danych gościa, szyfrowanie danych wrażliwych (alergie = dane zdrowotne → szczególna kategoria, dostęp ograniczony rolą).
- **Rate-limiting** na publicznych endpointach i logowaniu.
- **Audyt** akcji admina (kto przydzielił pokój, zmienił status, oznaczył opłacone).

---

## 8. Co dostarcza ten projekt (mapowanie na wymagania)

| Wymaganie | Pokrycie |
|---|---|
| Rejestracja na wyjazdy formacyjne | `EventSeries/Instance` + lejek `/r/:slug` |
| Zgłaszanie obecności na spotkaniach | Moduł `attendance` (MeetingSeries/Occurrence/Record) |
| Generator stron jednorazowych i evergreen | `RegistrationPage` + scheduler resetu |
| Reset i zbieranie na kolejny termin wg kalendarza | RRULE w `EventSeries` + cron |
| Formularze wielojęzyczne (PL/EN/IT) | i18n statyczne + `Translation` dynamiczne, `locale` na zgłoszeniu |
| Imię, nazwisko, adres, telefon, email | `Registration.contact` |
| Dane dzieci (wiek, płeć) | `Participant(type=CHILD)` |
| Preferencje żywieniowe / alergie | `Participant.dietary` + `Registration.dietaryNotes` |
| Pokój 1-os. inna cena niż miejsce w 2-os. | różne `RoomType` + `pricingModel` w silniku wyceny |
| Dodawanie typów pokoi i ilości | `POST /admin/.../room-types` |
| Przydział pokoi do gości | `RoomAssignment` + `assign-room` |
| Strona podsumowania z ceną i metodą płatności | przepływ 6.1 krok 5 |
| Płatność online + przelew | moduł `payments` (oba do wyboru per edycja) |
| Dodanie do Google Calendar / iCal | moduł `calendar` (.ics + link Google) |
| Konta gości | moduł `guests` + magic-link dla bez-kontowych |
| Automatyczne maile | moduł `notifications` + kolejka |
| Zarządzanie z Personal OS | token serwisowy + endpointy `/admin/*` (sekcja 9) |

---

## 9. Integracja z Personal OS (Jacek OS)

Backend ma być **źródłem prawdy**, a aplikacja **Personal OS** (Electron, lokalna) — klientem administracyjnym, który pobiera dane o eventach i zgłoszeniach i pokazuje je w osobnej karcie zakładki ICPE.

Granica integracji jest czysta: **Personal OS nie łączy się z bazą rejestracji bezpośrednio**, tylko przez REST API `/admin/*`, uwierzytelniając się **tokenem serwisowym** (machine token, długożyjący, scope `admin:read` + opcjonalnie `admin:write`). Token generowany w panelu (Ustawienia → Integracje / API) i przechowywany po stronie Personal OS w keytar.

Wymagane po stronie backendu:
- **Token serwisowy** (`ServiceToken`: id, name, scopes, hash, lastUsedAt) + guard akceptujący Bearer token obok JWT admina.
- Stabilne, wersjonowane endpointy `/admin/instances`, `/admin/instances/:id`, `/admin/instances/:id/registrations`, oraz akcje `mark-paid` / `status` / `assign-room` (już w sekcji 5).
- (Opcjonalnie) lekki **webhook out** do Personal OS przy nowym/zmienionym zgłoszeniu, by uniknąć ciągłego pollingu — na start wystarczy polling co 10–15 min.

Szczegółowy prompt wdrożeniowy dla Personal OS: `05-prompt-personal-os-integracja.md`.
