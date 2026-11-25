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
- **Poczta:** dostawca wybierany ENV na Render: `MAIL_MODE=resend | smtp | log` (puste + `RESEND_API_KEY` → **Resend**, zalecany od 2025-09 — HTTP API, `MAIL_FROM` z domeny zweryfikowanej w Resend). Który działa naprawdę: panel ▸ Ustawienia ▸ E-mail (aktywny dostawca + końcówka klucza). Tryb `smtp` (stary, Brevo): nodemailer przez dynamiczny import + shim (`api/src/nodemailer-shim.d.ts`), `SMTP_HOST/PORT/USER/PASS/SECURE` — przy Brevo NIE włączać blokowania nieautoryzowanych IP (Render ma dynamiczne IP). Brevo zostaje też w DNS domeny (MX/SPF/DKIM poczty) — to niezależne od wysyłki z aplikacji.

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
- `Invitation` (model): `token @unique`, `confirmedAt`, `dietaryNotes`; gospodarstwo: `spouse*`, `childrenJson [{firstName?, age, dietary?}]`; `confirmedBy` ('GUEST'|'ADMIN'), `guestRespondedAt`, `declinedAt`, `adminNote`.
- `Place` (model): zapisywane lokalizacje `{ id, label, createdAt }`.

---

## Pliki publiczne na stronie icpemission.pl

### Broszurka mszalna pod /r/ (2026-10-15)
- PDF od Jacka (Uroczysta Eucharystia z okazji Celebracji Przymierza, 17.10.2026, 18 stron, 1,9 MB) → `site/public/r/broszurka-mszalna.pdf` → adres `https://icpemission.pl/r/broszurka-mszalna.pdf`. Commit `4c79290` wypchnięty z sesji w chmurze (auto-deploy `icpe-site`).
- Wzorzec na przyszłość: publiczne pliki do pobrania = `site/public/<katalog>/<plik>` + push; panel nie ma uploadu plików publicznych. `/r/` na icpemission.pl nie koliduje z lejkiem (`/r/:slug` działa na rejestracja.icpemission.pl).
- Lokalna kopia repo jest 1 commit za origin → przed kolejną pracą `git pull`.

## Dziennik prac — panel admina (kreator eventów)

### Poziomy cen z datami, zniżka kwotowa dziecka, lista oczekujących pod licznikiem (2026-11-25)
- **Prośby (Jacek):** kolejne poziomy cenowe (Pre-Summer, Regular) dla United In Mission; pod licznikiem „Zapisz się na listę oczekującą”.
- **Poziomy cen (shared `pricing.ts` + lustro, bez zmian w bazie):** `PricingConfig.priceTiers[{ id, name, from: 'YYYY-MM-DD', mealsFee?, formationFee?, overnightMealsFee?, rooms?: { idTypu: cena } }]` + `baseTierName` (ceny w cenniku = pierwszy poziom). `pricingAt(config, data)` zwraca cennik z nadpisaniami aktywnego poziomu, `activeTier`, `priceLevels` (lista dla gości z ceną „od”). **Cena wg dnia zapisu:** `PricingService.quote(input, instanceId, at)` — nowe zgłoszenie = dziś, edycja admina i zmiana noclegu przez gościa = `reg.createdAt`; strona gościa dostaje cennik z poziomem z dnia zapisu; lejek stosuje `pricingAt` przy wczytaniu; „Edytuj zgłoszenie” liczy po poziomie z dnia zapisu.
- **Zniżka kwotowa:** `AgeBracket.mealsDiscountAmount` (np. 150 zł na wyżywienie, stała przy każdym poziomie) + kolumna „albo − zł” w progach wiekowych. Rozwiązuje 1 051 zł zamiast 1 050 zł.
- **Panel:** `admin/events/PriceTiersEditor.tsx` w „Edytuj event” (nad harmonogramem wpłat): nazwa pierwszego poziomu, kolejne poziomy (nazwa, od dnia, wyżywienie, opłata formacyjna, cena każdego typu zakwaterowania z podglądem ceny za pobyt). Kreator przenosi poziomy bez zmian; przy okazji naprawione: kreator w trybie edycji zmieniał id typów pokoi na `edit-room-N`.
- **Strona eventu:** blok „Ceny” z poziomami (okres, cena od, aktualny wyróżniony).
- **Lista oczekujących:** nowa tabela `WaitlistEntry` (dojdzie przez `prisma db push`), `registrations/waitlist.service.ts`: `POST /registrations/waitlist` (tylko gdy event OPEN i zapisy jeszcze nie ruszyły), `GET /admin/instances/:id/waitlist`, `GET /cron/waitlist`; co 2 min sprawdza eventy, których start zapisów właśnie minął (okno 3 dni), i wysyła JEDEN mail `WAITLIST_OPEN` (PL/EN/KO/ZH) z przyciskiem „Zapisz się”. Formularz pod licznikiem (`RegistrationCountdown`), tłumaczenia 5 języków; w „Edytuj event” licznik adresów + „kopiuj adresy”.
- **Poprawka:** karta przelewu w podsumowaniu przy harmonogramie pokazuje „Do wpłaty teraz” (zadatek) zamiast pełnej kwoty i terminu = start wydarzenia.
- **Nadal brak:** ceny w EUR (druga waluta), import wyciągów PDF, wpłaty na stronie gościa.
- **Weryfikacja:** testy shared 25/25 (w tym pełny cennik United In Mission dla trzech poziomów), tsc app ✓, api ✓ (poza `src/courses`), build ✓; `prisma validate` nie do uruchomienia w sandboxie (brak silnika); nieprzeklikane, nieuruchomione na bazie.
- Stan: do pushu + **Manual Deploy `icpe-api`**. Potem w United In Mission: próg „do 10 lat” wyżywienie 0% i −150 zł; poziomy Pre-Summer (od 2027-05-01: wyżywienie 625; 135 / 250 / 375 / 1110) i Regular (od 2027-07-01: wyżywienie 650; 150 / 290 / 420 / 1300).

### Dane przelewu dla gości z zagranicy + podmiot obsługujący wydarzenie (2026-11-25)
- **Prośba (Jacek):** w wersjach IT / EN / KO przy numerze rachunku dodatkowo Swift, Bank, Bank address (tylko wypełnione); opcjonalne zdanie „Podmiot obsługujący wydarzenie za zgodą Executive Council: IMAGO Jacek Dudzic”.
- **Model:** `RegistrationPage.paymentInfo` (JSON, bez zmian w bazie) + `swift`, `bankName`, `bankAddress`, `operator` (`BankInfo` w `app/src/lib/api.ts`).
- **Panel:** „Edytuj event” ▸ dane przelewu: pola SWIFT / BIC, Bank, Adres banku, Podmiot obsługujący wydarzenie.
- **Lejek (`SummaryScreen`, karta przelewu):** SWIFT / bank / adres banku we wszystkich wersjach poza polską (EN, IT, KO, ZH), tylko wypełnione, SWIFT z przyciskiem kopiowania; zdanie o podmiocie pod danymi przelewu we wszystkich językach, gdy pole wypełnione (`summary.operator_note`, 5 języków).
- **Maile:** przypomnienia o ratach dostają te same dane (zagraniczne poza PL) i zdanie o podmiocie. Mail potwierdzający nie zawiera danych przelewu (jak dotąd).
- **Weryfikacja:** tsc app ✓, api ✓ (poza `src/courses`), build ✓; nieprzeklikane.
- Stan: do pushu + **Manual Deploy `icpe-api`**.

### Pole „Kraj”: nazwy krajów w języku zakładki (2026-11-25)
- **Prośba (Jacek):** kraje mają się wyświetlać w wersjach językowych (w EN „Poland”, nie „Polska”).
- **Zmiana:** `app/src/lib/countries.ts`: `countryName(code, lang)` i `countryOptions(lang)` (Intl.DisplayNames per język, `zh` = `zh-Hans`, sortowanie w danym języku, cache). `EventEditForm.tsx`: lista „Kraj” bierze nazwy z aktywnej zakładki języka (`editLang`): PL Polska, EN Poland, IT Polonia, KO 폴란드, ZH 波兰. Etykieta pola pokazuje język nazw. Kod (`countryCode`) jest jeden dla wszystkich języków, zapis bez zmian.
- **Weryfikacja:** `tsc` app czysto. Backend bez zmian.
- **Stan:** niewypchnięte; po pushu front wdroży się sam (bez Manual Deploy API).

### Event „United In Mission” utworzony na produkcji (2026-11-25)
- **Adres:** https://rejestracja.icpemission.pl/r/united-in-mission · utworzony przez agenta w panelu (kreator + poprawki w „Edytuj event”). Zapisy zablokowane licznikiem do 16.01.2027 10:00 (status „Otwarty”).
- **Ustawienia:** 22–27.08.2027, 5 nocy, Ośrodek h2o Kiczyce, limit 170, PLN, tylko przelew, języki PL/EN/IT, nadtytuł „Międzynarodowe Rekolekcje ICPE Mission”. Cennik early bird: formacja 0, wyżywienie 575; pokoje: miejsce w pokoju 125 zł/os/noc (cap 8), pokój dla dwóch osób 250 zł/pokój/noc (limit 18), jednoosobowy 365 zł/os/noc (limit 4), domek na wyłączność 1000 zł/pokój/noc (cap 11, limit 4). Progi: do 3 lat gratis; do 10 lat wyżywienie −26%. Diety: bez mięsa, wegańska, bez glutenu, bez laktozy. Darowizna włączona. Bez kodów rabatowych, transport i pościel 0.
- **Do zrobienia:** zdjęcie hero (plik `docs/united-in-mission-hero.jpg`, wgrać ręcznie w „Edytuj event”), numer konta i odbiorca przelewu, harmonogram wpłat (po wdrożeniu: 20% / 30% do 20.04.2027 / reszta do 31.07.2027, 50% dla pokoi i domku — propozycja, niepotwierdzona), progi Pre-Summer / Regular i EUR (funkcje niezbudowane).
- **Błędy panelu wykryte przy okazji:** kreator zamienia 0 na domyślne (formacja 50, transport 40, pościel 15) i dodaje kod `ICPE10`; pole zniżki wiekowej nie przyjmuje ułamków (dziecko 3–9 wychodzi 1 051 zł zamiast 1 050 zł); podgląd w edycji ignoruje datę otwarcia zapisów; etykieta „Wyżywienie / doba” przy kwocie za cały pobyt; pole kodu rabatowego widoczne mimo braku kodów; nieistniejący slug pokazuje przykładowy event z `MOCK_INSTANCE` zamiast błędu; brak pola tagu pokoju w edycji.

### API ICPE Go: kraj eventu `countryCode` (2026-11-25)
- **Prośba:** ICPE Go pokazuje adres eventu i potrzebuje kraju; `location` to jeden tekst bez kraju.
- **Baza:** `EventInstance.countryCode String?` (ISO 3166-1 alpha-2, null = nie ustawiono; obok `location`, które też siedzi na instancji). Wchodzi przez `prisma db push`. `cloneInstance` kopiuje kraj.
- **Panel:** edycja eventu ▸ pole „Kraj” pod „Miejsce”: lista z polskimi nazwami (`Intl.DisplayNames`), najpierw częste (PL, IT, MT, DE, FR, ES, GB, IE, US, KR, CN, PH), potem wszystkie. Zapisuje kod. Lista kodów: `app/src/lib/countries.ts`.
- **API:** `PATCH /admin/instances/:id` przyjmuje `countryCode` (wielkie litery; inny format niż 2 litery = 400; pusty = null); `GET /r/:slug/config` zwraca `countryCode`. ICPE Go: `countryCode` w obiekcie eventu (`/icpe-go/events`, `/icpe-go/events/:idOrSlug`), dodatkowo normalizowany do `^[A-Z]{2}$` albo null. `location` bez zmian.
- **Swagger:** `api/src/icpe-go/icpe-go.dto.ts` + `@ApiOkResponse` na obu endpointach — tag `icpe-go` ma teraz pełny schemat odpowiedzi, w tym `countryCode`.
- **Dokumentacja:** `docs/18-api-icpe-go.md` (wiersz `countryCode`, przykład, sekcja „Zmiany”), też w Projekcie Claude `plany/18-api-icpe-go.md`.
- **Weryfikacja:** `tsc` app czysto; api tylko 3 stare błędy w `courses/*`. Na żywej bazie nietestowane.
- **Stan:** niewypchnięte. W repo leżą też niezacommitowane zmiany z innej pracy (plan płatności, licznik miejsc w `events.service.ts`) — commit obejmie oba tematy, jeśli użyć `git add -A`. Po pushu **Manual Deploy `icpe-api`**, potem ustawić kraj przy udostępnionych eventach.

### Harmonogram wpłat: dowolne % i terminy, wpłaty częściowe, przypomnienia (2026-11-25)
- **Prośba (Jacek):** dowolny % i dowolne daty wymagalności w ustawieniach eventu, mail przypominający 3 dni przed terminem i 7 dni po terminie; import wyciągu PDF (mBank, Erste) do automatycznego księgowania wpłat.
- **Model (shared `paymentPlan.ts` + lustro, bez zmian w bazie):** `PricingConfig.paymentPlan { enabled, installments[{ id, label?, pct, due: 'registration' | 'YYYY-MM-DD' }], remindBeforeDays (3), remindAfterDays (7) }`, `RoomTypeDef.depositPct?` (wyższy zadatek typu zakwaterowania, np. 50). Funkcje: `buildSchedule(total, plan, dataZapisu, minDepositPct)`, `paymentState(total, paid, schedule, today)`, `normalizePaymentPlan`, `minDepositPctFor`, `warsawDate`, `addDays`. Zasady: ostatnia rata domyka do 100%; rata z terminem sprzed daty zapisu jest wymagalna od razu (skleja się z zadatkiem); terminy wg Europe/Warsaw. Testy `paymentPlan.test.ts` (7) + silnik cen: razem 24/24.
- **API:** `registrations/payment-plan.service.ts` (`PaymentPlanService`): `decorate` (lista zgłoszeń dostaje `paidAmount` + `payment { paid, dueNow, overdue, nextDue, depositPaid, schedule… }`; `paymentStatus` liczony z sumy wpłat tylko przy evencie z planem albo wpłatach z panelu/importu), `finance`, `paymentsOf`, `addPayment` (Payment `provider: 'panel' | 'bank-import'`, `raw { paidAt, by, note, sender, title }`, ochrona przed duplikatem po `externalId`), `voidPayment` (status FAILED, zostaje w historii), `syncStatus` (zadatek wpłacony → CONFIRMED; bez planu dopiero pełna kwota; nigdy nie cofa statusu), `runReminders`. Endpointy: `GET /admin/instances/:id/finance`, `GET|POST /admin/registrations/:id/payments`, `DELETE /admin/payments/:id`, `GET /cron/payment-reminders` (CRON_SECRET jak przy leadach). `markPaid` (oba miejsca) księguje brakującą RESZTĘ, nie drugi raz całość.
- **Przypomnienia:** co godzinę (timer w API) dla eventów OPEN z planem; do zgłoszeń PENDING_PAYMENT / AWAITING_TRANSFER / CONFIRMED z niedopłatą najwcześniejszego progu: `PAYMENT_DUE_SOON` w oknie [termin − N dni, termin) i `PAYMENT_OVERDUE` od termin + M dni; każdy raz na ratę (deduplikacja po `Notification.type` + `payload.installmentId`); nie wysyła po rozpoczęciu wydarzenia. Treści PL/EN/KO/ZH z kwotą, sumą wpłat, danymi do przelewu z `paymentInfo` i numerem zgłoszenia. Mail potwierdzający ma blok „Harmonogram wpłat”.
- **Panel:** `admin/events/PaymentPlanEditor.tsx` w „Edytuj event” (pod darowizną): włącznik, raty (nazwa, %, „przy rejestracji” / „do dnia”), dni przypomnień, wyższy zadatek per typ zakwaterowania; kreator tylko przenosi plan i `depositPct`. „Płatności”: kolumny Wpłacono / Najbliższy termin, statusy (Zadatek wpłacony, Częściowo, Zaległe X), filtr „Zaległe”, przycisk „Wpłaty” (harmonogram, historia, „Zaksięguj wpłatę” z kwotą/datą/metodą/notatką, „cofnij”), kafle Zadatki wpłacone / Wymagalne teraz / Po terminie + lista „Prognozowane wpłaty wg terminów”.
- **Lejek:** podsumowanie pokazuje „Harmonogram wpłat”, ekran sukcesu „Do wpłaty teraz” (zadatek). Tłumaczenia PL/EN/IT/KO/ZH.
- **Nie zrobione:** (1) import wyciągu PDF — brak przykładowych plików mBank / Erste, bez nich parser byłby zgadywaniem; potrzebna też biblioteka do PDF (npm install po stronie Jacka). (2) Strona gościa `/z/:token` nie pokazuje jeszcze wpłat i harmonogramu. (3) Progi cenowe z datami (early bird itd.) i druga waluta — nadal do zrobienia (dokument 19, sekcja 6).
- **Weryfikacja:** tsc app ✓, api ✓ (poza `src/courses`), testy 24/24, `vite build` ✓ (obejście sandboxa: binarka esbuild w `node_modules/@esbuild/linux-arm64` ma 0 bajtów → `npm pack @esbuild/linux-arm64@0.21.5` do /tmp i `ESBUILD_BINARY_PATH=/tmp/esb/package/bin/esbuild npx vite build --outDir /tmp/icpe-build`). NIE przeklikane w przeglądarce (brak przeglądarki w sandboxie) i NIE uruchomione na bazie — filtr JSON deduplikacji przypomnień i księgowanie sprawdzić na evencie testowym.
- Stan: do pushu + **Manual Deploy `icpe-api`**. Plan jest domyślnie wyłączony, więc istniejące eventy działają bez zmian.

### Start zapisów z datą i godziną + licznik na stronie eventu (2026-11-25)
- **Prośba (Jacek):** utworzyć event ze wskazaną datą i godziną otwarcia rejestracji — strona już widoczna, a na niej licznik (countdown) do otwarcia.
- **Stan zastany:** `EventInstance.registrationOpensAt` istniało w bazie, ale nic go nie używało (kreator wpisywał „teraz”). Bez zmian w schemacie.
- **API:** `registrations.create` → 403 „Zapisy na to wydarzenie jeszcze się nie rozpoczęły.”, gdy `registrationOpensAt` w przyszłości; `/r/:slug/config` zwraca `registrationOpensAt` (publiczne `/r/:slug` zwracało je już w instancji). Typ `EventInstanceDto.registrationOpensAt?` (+ lustro).
- **Lejek:** `funnel/RegistrationCountdown.tsx` (dni / godz. / min / sek + „Start zapisów: data, godzina”, odlicza co sekundę, po dojściu do zera sam podmienia się na przycisk „Zapisz się”), `LandingScreen` pokazuje go zamiast przycisku; badge w hero „Rejestracja wkrótce”; `PublicFunnel` blokuje wejście do formularza przed terminem (także z wersji roboczej), podgląd w panelu (`?preview=1`) bez blokady. Helpery `lib/registrationOpens.ts`. Tłumaczenia PL/EN/IT/KO/ZH (`landing.badge_soon`, `landing.opens_title`, `landing.opens_at`, `countdown.*`).
- **Panel:** `admin/events/RegistrationOpensFields.tsx` — „Otwarcie zapisów” (data + godzina, czas lokalny komputera) w kreatorze (krok z datami) i w „Edytuj event”; puste / przeszła data = otwarte od razu; wyczyszczenie przyszłej daty zapisuje „teraz”.
- **Ograniczenia:** blokada dotyczy zwykłej rejestracji (nie RSVP ani zaproszeń `/i/:token`); licznik liczy wg zegara urządzenia gościa (serwer i tak pilnuje terminu).
- **Weryfikacja:** tsc app ✓, api ✓ (poza `src/courses`); `vite build` w sandboxie nie działa (esbuild EPIPE) — NIE przeklikane w przeglądarce.
- Stan: do pushu + **Manual Deploy `icpe-api`**.

### Lejek: opcjonalna darowizna na dofinansowanie pobytu innych (2026-11-25)
- **Prośba (Jacek):** w procesie rejestracji opcja „Opcjonalna darowizna na rzecz dofinansowania pobytu kogoś, kogo nie stać na udział” — 50 zł / 100 zł / 200 zł / Dowolna kwota (otwiera pole do wpisania).
- **Model (shared + lustro `api/src/_shared`):** `PricingConfig.donationEnabled?` (włącznik per event, domyślnie wyłączone → stare eventy bez zmian), `PriceOptions.donation?` (kwota), `PriceResult.donation?`, `DONATION_PRESETS` (PLN 50/100/200; EUR i USD 10/25/50), `DONATION_MAX` 100 000, `cleanDonation()`. `computePrice`: darowizna doliczana NA KOŃCU — po kodzie rabatowym, ręcznej korekcie i także po „kwocie końcowej” admina; nie wchodzi do `subtotal`. Test w `pricing.test.ts` (17/17).
- **API:** `OptionsDto.donation` (0–100 000) i `PriceOptionsDto.donation`; `create` zapisuje darowiznę w `optionsJson` tylko gdy event ma `donationEnabled`; `storedOptions` ją zwraca (strona gościa `/z/:token` i przeliczenia po zmianie noclegu zachowują darowiznę); `adminUpdate` zachowuje darowiznę gościa, gdy panel jej nie przyśle, a przyjmuje nową kwotę (0 = usuń). Bez zmian w bazie.
- **Lejek:** krok „Opcje” (`Step4Options.tsx`) — przyciski kwot + „Dowolna kwota” z polem; ponowne kliknięcie wybranej kwoty = rezygnacja; widoczne tylko przy `donationEnabled` i evencie płatnym. Kwota w pasku ceny, w podsumowaniu (wiersz „Darowizna”) i w zgłoszeniu. Tłumaczenia PL/EN/IT/KO/ZH (`options.donation_*`, `summary.donation`).
- **Panel:** `admin/events/DonationToggle.tsx` — włącznik w „Edytuj event” (pod polami noclegu opcjonalnego) i w kreatorze; „Edytuj zgłoszenie”: pole „Darowizna” + wiersz w rozbiciu ceny.
- **Weryfikacja:** `tsc --noEmit` app ✓, api ✓ (poza starymi `src/courses`), testy silnika 17/17. `vite build` w sandboxie nie wystartował (esbuild: „The service was stopped: write EPIPE” już przy wczytaniu `vite.config.ts`) — NIE zbudowane i NIE przeklikane w przeglądarce.
- **Otwarte:** brak zestawienia sumy darowizn w panelu; darowizna nie ma osobnej linii w mailach (jest w kwocie łącznej); kwoty EUR/USD 10/25/50 przyjęte przeze mnie; nazwa „darowizna” przy wpłacie na firmę — do sprawdzenia z księgową.
- **Dopisane (14:50):** mail potwierdzający dziękuje za darowiznę (akapit PL/EN/KO/ZH z kwotą; `sendConfirmation({ donation })`, `notifications.service.ts`). Zakładka „Płatności”: kafle per event — Zgłoszenia (+ osoby), Prognoza wpływów (suma kwot zgłoszeń), Wpłacone (+ % prognozy), Do wpłaty, Opłacone X / Y, Pula darowizn (+ wpłacone, liczba darczyńców); odświeżanie w tle co 30 s (`useAutoRefresh`) + przycisk „Odśwież”. Liczone w przeglądarce z listy zgłoszeń (bez nowego endpointu). tsc app ✓, api ✓ (poza `src/courses`); nieprzeklikane.
- **Nie zrobione — zaliczki:** system zapisuje tylko wpłatę całej kwoty („Oznacz jako opłacone”), nie ma wpłat częściowych ani harmonogramu (20% / 50% / dopłata). Kafle „zaliczki wpłacone / oczekiwane” wymagają tej funkcji; do zrobienia razem z progami cenowymi (dokument 19, sekcja 6).
- Stan: do pushu + **Manual Deploy `icpe-api`**. Potem włączyć w „Edytuj event” dla rekolekcji h2o.

### API dla ICPE Go: dane eventów do pobrania (2026-11-25)
- **Prośba (Jacek):** endpointy, z których aplikacja webowa ICPE Go pobierze dane eventu po zaznaczeniu po naszej stronie „udostępniaj dane ICPE Go": event, daty, liczba rejestracji (dorośli / dzieci), % zajętych miejsc, link do rejestracji.
- **Baza:** `EventInstance.shareWithIcpeGo Boolean @default(false)` (wchodzi przez `prisma db push` przy starcie).
- **API (nowy moduł `api/src/icpe-go/`):** `GET /icpe-go/events?scope=upcoming|open|all&lang=` i `GET /icpe-go/events/:idOrSlug`. Zwraca tylko udostępnione eventy (bez DRAFT); nieudostępniony = 404. Liczone zgłoszenia poza CANCELLED i WAITLIST; dorośli/dzieci z `Participant.type`; STANDALONE = potwierdzenia TAK z `EventRsvp` (bez podziału, `childrenTracked: false`). `capacity.occupancyPct` liczone od „Limitu miejsc" (null bez limitu). Link: `${PUBLIC_APP_URL}/r/<slug>`, dla INVITE `null`. `Cache-Control: public, max-age=60`.
- **Klucz:** opcjonalny ENV `ICPE_GO_API_KEY` (Render, sync:false). Ustawiony = wymagany `Authorization: Bearer …` albo `?key=`. Pusty = publiczne (tylko agregaty).
- **Panel:** edycja eventu ▸ sekcja „ICPE Go" ▸ checkbox „Udostępniaj dane ICPE Go" + adres eventu dla ICPE Go z przyciskiem „Kopiuj". Zapis przez `PATCH /admin/instances/:id` (`shareWithIcpeGo`), odczyt w `GET /r/:slug/config`.
- **Pliki:** `api/prisma/schema.prisma`, `api/src/icpe-go/*`, `api/src/app.module.ts`, `api/src/events/events.service.ts`, `app/src/lib/api.ts`, `app/src/components/admin/events/EventEditForm.tsx`, `render.yaml`, `.env.example`, kontrakt `docs/18-api-icpe-go.md` (też w Projekcie Claude `plany/18-api-icpe-go.md`).
- **Weryfikacja:** `tsc --noEmit` app czysto; api bez błędów w nowych plikach (3 stare błędy typów w `courses/*` z nieodświeżonego klienta Prisma w sandboxie, Render generuje klienta przy buildzie). Na żywej bazie nietestowane.
- **Stan:** niewypchnięte. Po pushu **Manual Deploy `icpe-api`** (front wdroży się sam). Potem zaznaczyć checkbox przy wybranych eventach i dać twórcom ICPE Go `docs/18-api-icpe-go.md`.

### Rekolekcje wspólnot h2o Kiczyce 22–27.08.2027: analiza umowy i kalkulacja opłat (2026-11-25)
- **Prośba (Jacek):** policzyć stawki do formularza (dorosły 18+, małżeństwo, dziecko) z marżą na koszty organizatorów; ocenić, czy rodzina 3–4+ może dostać cały domek; zaprojektować tablicę przydziału pokoi (drag and drop) w panelu admina.
- **Umowa (Stowarzyszenie Fala, 25.11.2026):** 170 osób (128 domki / 12 hotel / 30 hostel), 5 dób, 169 350 zł brutto, ośrodek na wyłączność → cena stała, nie maleje przy mniejszej frekwencji. Rezygnacja z wyłączności bez kosztów do 30.05.2027. Zadatek 1 700 zł do 15.12.2026 (w kalkulacji: 14 dni od umowy). Wykaz osób z pokojami do 15.08.2027.
- **Koszt:** dorosły i dziecko 10+ 205 zł/doba w domku, 215 zł w hotelu/hostelu (1 025 / 1 075 zł za pobyt); dziecko 3–10 lat 175 / 185 zł (875 / 925 zł); do 3 lat bez świadczeń i bez opłat.
- **Miejsca:** 212 łóżek + 8 dostawek (hostel 50, hotel 15, domki 147), 47 górnych miejsc na piętrowych.
- **Propozycja cennika (do decyzji Jacka):** dorosły 1 200 zł, młodzież 10–17 −10% = 1 080 zł, dziecko 3–9 −20% = 960 zł, 0–2 gratis; nadwyżka ok. 27 450 zł przy 170 płacących, próg rentowności ok. 147 osób. Rodzinom obiecywać część domku z własną łazienką (część A domku parzystego = 7 miejsc), cały domek od 8 osób.
- **Dokumenty:** w Projekcie Claude `plany/16-kalkulacja-oplat-rekolekcje-h2o-2027.md` (pełna kalkulacja, pytania do ośrodka, harmonogram wpłat). Plan tablicy zakwaterowania: `plany/17-plan-tablica-zakwaterowania.md` w Projekcie i lokalnie `docs/17-plan-tablica-zakwaterowania.md` (model `Venue*`/`Lodging*`, `@dnd-kit`, 9 etapów ok. 17 dni; etap 0 = stabilne `Participant.id`, bo `adminUpdate` dziś kasuje i odtwarza uczestników).
- **Decyzje Jacka (25.11, po południu):** pokoje przydziela organizator; gość wybiera tylko rodzaj: miejsce w pokoju z innymi / pokój dla małżeństwa / pokój jednoosobowy (płaci jak za 2 os.) / domek na wyłączność (+ propozycja „pokój rodzinny”, do decyzji). Wiek = lata skończone na dzień rozpoczęcia. Bez osób dojeżdżających. Nie mieszamy płci poza rodzinami; małżeństwa nie dzielą pokoju, rodziny mają autonomię. Dostawki dla dzieci. Diety: bez laktozy = bezmleczna, bez mięsa = wegetariańska. VIP: ok. 5 pokoi dla małżeństw + 2–3 jedynki dla księży (blokada). „Chcę mieszkać z…” = wybór konkretnego zgłoszenia. Widok pokoju: `/z/:token` + mail.
- **Nowy zakres (w planie 17, sekcja 11):** rola pomocnika jednego eventu z zakresami (`EVENT_STAFF` + `EventStaffGrant`), frontend „Rejestracja” (obecność, wpłaty, klucze, prośby), konta zgłaszających z zapisanymi domownikami i materiałami z wydarzenia (osobny plan 18).
- **Cennik w obecnym silniku (bez zmian w kodzie):** `mealsFee` 575, `formationFee` 0, 5 nocy; progi: do 3 lat ×0, do 10 lat ×0,8, do 18 lat ×0,9; pokoje 125 zł/os/noc, jednoosobowy 365 zł/os/noc, domek na wyłączność 1 000 zł „za pokój / noc” (= 5 000 zł + wyżywienie osób). Limity: jedynki 4–5, domki 4–5 (zapas to 42 łóżka).
- **Lokalne kopie:** `docs/16-kalkulacja-oplat-rekolekcje-h2o-2027.md`, `docs/17-plan-tablica-zakwaterowania.md`.
- **Progi cenowe (decyzja Jacka, 25.11 ok. 14:00):** Early bird 16.01–30.04.2027: 1 200 zł os. / 2 400 zł pokój 1–2 os. / 5 000 zł domek + 575 zł wyżywienia od osoby; Pre-Summer 1.05–30.06: 1 300 / 2 500 / 5 550 + 625; Regular 1.07–21.08: 1 400 / 2 750 / 6 500 + 650. Cena z dnia rejestracji zapisana przy zgłoszeniu; zaliczka 10%, dla pokoju 1–2 os. i domku 50%. Ceny także w EUR (osobny cennik, kurs 4,30 z zaokrągleniem do 5 EUR). Licznik dostępności opcji na żywo w formularzu.
- **Decyzje (25.11 ok. 14:10):** żadnych zniżek poza tymi, które daje ośrodek: młodzież 10+ jak dorośli, dziecko 3–9 lat −150 zł (1 050 / 1 150 / 1 250 zł), do 3 lat gratis. Wpłaty przy rejestracji bezzwrotne (zadatek). Rozważane, niepotwierdzone: 20% przy rejestracji + 30% do końca kwietnia.
- **Dokument:** `plany/19-cennik-progi-scenariusze-h2o-2027.md` w Projekcie (cennik PLN/EUR, scenariusze, przepływy, limity, lista zmian w systemie: progi z datami, zaliczka % per typ, druga waluta, licznik zawsze widoczny + limit osób). Zastępuje sekcje 4–5 dokumentu 16. Uwaga: numer 18 w Projekcie zajął inny dokument (`18-api-icpe-go`), więc plan kont z domownikami wspomniany w planie 17 dostanie inny numer.
- Stan: analiza i propozycje, bez zmian w kodzie. Event w systemie jeszcze nieutworzony. Otwarte: odpowiedź ośrodka o progu wieku 3–9 / 3–10, akceptacja cen przez Jacka.

### Lejek: okienko w kroku „Nocleg” przy niepełnym wyborze (2026-11-24)
- **Zgłoszenie Jacka:** goście w pośpiechu nie zauważają, że nie wybrali pokoju / nie przypisali osób — komunikat błędu był na dole formularza.
- **`components/funnel/RoomCheckDialog.tsx`** (okienko po „Dalej”, Escape / klik w tło zamyka):
  - `missing` — brak pokoju i brak „Nie potrzebuję noclegu” albo pokój bez nikogo: „Nie wybrałeś/aś pokoju lub nie przypisałeś/aś nikogo do wybranego pokoju.” + podpowiedź; przycisk „Popraw wybór”. (Blokada była już wcześniej — doszło okienko.)
  - `error` — inne błędy pokoi (pojemność, brak wolnych, nocleg obowiązkowy a ktoś bez pokoju) — treść błędu w okienku.
  - `partial` — **nowe:** nocleg opcjonalny, pokój wybrany, ale część osób nieprzypisana → wcześniej przechodziło bez słowa; teraz lista imion „będą bez noclegu” i wybór „Przypiszę je do pokoju” / „Tak, bez noclegu dla nich” (`handleStepperNext({ partialConfirmed: true })`).
- Teksty `room.dialog_*`, `room.partial_*` w PL/EN/IT/KO/ZH. Komunikat pod formularzem (`stepError`) zostaje.
- Test (Playwright): nic nie wybrane → okienko; pusty pokój → okienko; 1 z 2 osób → okienko z „Anna Kowalska”, „Przypiszę” zostaje w kroku, „Tak, bez noclegu” przechodzi; wszyscy przypisani / „Nie potrzebujemy noclegu” → bez okienka.

### Lejek: krok „Dane głównego zgłaszającego” z podpowiedzią (2026-11-24)
- Nagłówek kroku 1 (`stepper.step0`): „Dane zgłaszającego” → **„Dane głównego zgłaszającego”**; pod nim (`applicant.step_hint`): „W kolejnym kroku możesz dodać dane małżonka i dzieci.” PL/EN/IT/KO/ZH (EN „Main applicant's details”, KO „대표 신청자 정보”, ZH „主要报名人信息”).

### Lejek: przyciski na końcu bez mylącego „Przejdź do płatności” (2026-11-23)
- **Zgłoszenie Jacka:** w ostatnim kroku (Opcje) przycisk „Proceed to payment / Przejdź do płatności” nawet przy płatności gotówką na miejscu.
- **Zmiany (PublicFunnel, StickyPriceBar, locale ×5):**
  - Jeden dostępny sposób płatności dla gościa (np. foundation-day-2027: sama gotówka; LEADER_DEPOSIT liczy się tylko przy wspólnocie z listy) → ekran wyboru płatności **pomijany**, metoda ustawiana automatycznie (`payment_method_selected` wysyłane jak dotąd), przycisk w ostatnim kroku: **„Przejdź do podsumowania →”** (`stepper.to_summary`). „Wstecz” z podsumowania wraca wtedy do kroku Opcje (także dla eventu bezpłatnego — wcześniej szło na ekran płatności).
  - Kilka sposobów → przycisk **„Wybierz sposób płatności →”** (`stepper.to_payment`, wcześniej „Przejdź do płatności”).
  - Podsumowanie: przycisk wysyłki przy gotówce / zaliczce u lidera / przelewie / evencie bezpłatnym → **„Potwierdź rejestrację →”** (online bez zmian: „Zapłać teraz”). Celowo nie na kroku Opcje — tam kliknięcie jeszcze nic nie wysyła, a „Potwierdź” sugerowałoby, że zapis jest gotowy.
- Test (Playwright): tylko CASH → Opcje „Przejdź do podsumowania” → podsumowanie „Potwierdź rejestrację”, Wstecz → Opcje; CASH+LEADER ze wspólnotą → „Wybierz sposób płatności” → ekran wyboru → „Potwierdź rejestrację”.

### Lejek: czytelny komunikat przy braku internetu (2026-11-21)
- **Zgłoszenie:** gość (Android/Chrome, foundation-day-2027) na podsumowaniu dostał „Your registration could not be saved: Nie udało się zapisać zgłoszenia. Failed to fetch Sprawdź dane…”. Na zrzucie „No internet connection”; PostHog: ostatnie zdarzenie sesji 13:29 (kroki 0–4 przejdone), potem cisza → telefon stracił sieć, zgłoszenie nie doszło do API (nie błąd systemu).
- **Poprawka (PublicFunnel / SummaryScreen):** błąd sieci (`navigator.onLine === false`, `TypeError`, „Failed to fetch / Load failed / NetworkError”) → `summary.network_error` („Brak połączenia z internetem (albo z naszym serwerem). Twoje dane są zapisane — sprawdź połączenie i naciśnij przycisk jeszcze raz.”), po zdarzeniu `online` → `summary.network_back`. Inne błędy: tylko `summary.submit_error` w języku gościa (bez doklejanego polskiego zdania). PL/EN/IT/KO/ZH. Bez automatycznego ponawiania (ryzyko podwójnego zgłoszenia).
- PostHog: `registration_submit_failed.reason` ma nową wartość **`network`** (nazwa zdarzenia/właściwości bez zmian) — do przekazania Jacek OS. Uwaga: przy braku sieci samo zdarzenie też może nie dojść.
- Test (Playwright, offline/online): komunikat offline → po powrocie sieci podpowiedź → ponowne kliknięcie wysyła 1 zgłoszenie, ekran sukcesu.

### Maile do gości po koreańsku i chińsku (2026-11-20)
- **Zasada Jacka:** zawsze terminologia **katolicka**, nie protestancka. KO: 하느님/주님 (nie 하나님), 미사, 피정, 성체 조배, 본당; powitanie „찬미 예수님!”, podpis „주님의 축복을 빕니다.”. ZH: 天主 (nie 上帝/神), 弥撒, 避静, 朝拜圣体, 堂区; podpis „愿天主祝福您！”. Sprawdzone grepem: brak 하나님/예배/목사/교회/上帝/礼拜/牧师/教会 w locale i mailach.
- **notifications.service.ts:** `MailLang = pl | en | ko | zh`, `mailLangOf(locale)` (IT i inne → EN), helpery `signature(lang)`, `greetingLine(lang, name)`, `L(lang, {pl,en,ko,zh})`. Przetłumaczone: CONFIRMATION, ACCOMMODATION_CHANGED, REGISTRATION_REMINDER (+ linie noclegu i płatności, w ZH pełnoszerokie nawiasy/interpunkcja). `buttonMail(..., lang)` — dopisek „Gdyby przycisk nie działał…” w języku maila (wcześniej zawsze PL, także w EN).
- Formacja online (COURSE_*) i zaproszenia (INVITATION/GUEST_INVITATION) bez zmian (PL/EN wg dotychczasowych zasad).
- `registrations.service.mailLang` i `leads.service` zwracają ko/zh; tytuł i nazwy pokoi w języku maila (brak → EN → PL); data w przypomnieniu ko-KR / zh-CN.
- Test: render maili (tsc → node) dla ko/zh/pl/en — PL i EN identyczne jak wcześniej.

### Języki KO (koreański) i ZH (chiński uproszczony) w rejestracji (2026-11-20)
- **Interfejs:** `app/src/locales/ko.json`, `zh.json` (pełne, 415 kluczy jak EN; tłumaczenie Claude — warto dać do przejrzenia native speakerowi). i18n: `supportedLngs` + `fallbackLng: { ko: ['en','pl'], zh: ['en','pl'], default: ['pl'] }`; `<html lang>` synchronizowany z językiem (`zh-Hans`), dla KO `word-break: keep-all`.
- **Przełącznik:** etykiety „한국어” / „中文”; pokazywane tylko, gdy event ma ten język w `locales` (jak IT). Wykrywanie z przeglądarki (`langPref`): ko → KO, zh-CN/zh-TW → ZH (gdy event je ma), inaczej EN. Licznik kroków w nagłówku lejka przeniesiony na lewo (wcześniej chował się pod przełącznikiem).
- **Treść eventu bez tłumaczenia:** `pickLang` / `roomLabel` / `titleFor` — dla PL: pl→en; dla innych języków (IT/KO/ZH): język → **EN** → PL (zmiana także dla IT, wcześniej spadało do PL).
- **Panel:** „Edytuj event” → Języki strony: checkboxy IT / KO / ZH (`OPTIONAL_LANGS`), zakładki KO/ZH w „Język treści”; kreator: przyciski KO/ZH i „+ KO / + ZH”. Diety mają etykiety ko/zh.
- **Maile:** dalej PL albo EN — każdy język gościa poza PL dostaje **angielski** (`mailEn` w notifications, `mailLang` w registrations.service). Przy okazji naprawione: goście IT dostawali potwierdzenie po polsku. Tytuł eventu i nazwy pokoi w mailu w języku maila.
- **API:** `CreateRegistrationDto.locale` przyjmuje ko/zh; `Locale` w shared + `Localized` (ko/zh opcjonalne); leady przyjmują ko/zh; `formatMoney` ko-KR / zh-CN.
- Test (kontener, Playwright): przejście całego lejka po KO i ZH (POST `locale: ko/zh`), fallback tytułu ZH → EN, panel: zaznaczenie ZH → zapis `locales: [pl,en,ko,zh]`, podpowiedź „puste pola po angielsku”. tsc app/api czyste, pricing 16/16.
- **Po pushu:** Manual Deploy `icpe-api` (walidacja locale, maile).

### Przypomnienie o niedokończonym zgłoszeniu (2026-11-20)
- **Decyzje Jacka:** jedno przypomnienie **3 h** po ostatniej aktywności; **zawsze włączone** (bez przełącznika w evencie); lista „Rozpoczęte, niedokończone” w panelu — tak.
- **Model:** `RegistrationLead` (instanceId+email unikalne; imię, nazwisko, e-mail małymi literami, język, krok, `token`, `lastActivityAt`, `reminderSentAt`, `reminderStatus` SENT/FAILED/SKIPPED_CLOSED/SKIPPED_FULL, `convertedAt`, `registrationId`). Tylko te dane — bez uczestników i diet.
- **API (`registrations/leads.service.ts`):** `POST /registrations/leads` (lejek, po każdym kroku od „Dane”), `GET /registrations/leads/:token` (prefill z linku), `GET /admin/instances/:id/leads`, `GET /cron/registration-reminders` (`?key=` gdy `CRON_SECRET`). Job co 5 min w procesie API: przypomina, gdy brak zgłoszenia na ten e-mail, event OPEN, jeszcze się nie zaczął, są miejsca; leady starsze niż 7 dni pomijane; 600 ms między mailami; leady kasowane dzień po `endsAt`. `RegistrationsService.create` oznacza lead jako dokończony.
- **Mail `REGISTRATION_REMINDER`** (PL; EN dla en/it): „Nie zapomnij dokończyć zgłoszenia — {tytuł}”, przycisk „Dokończ zgłoszenie” → `/r/<slug>?lead=<token>` (imię, nazwisko i e-mail wpisane), dopisek „nie będziemy już o tym pisać”. Etykieta w Ustawieniach → Maile.
- **Lejek:** pod e-mailem „Jeśli nie dokończysz zapisu, wyślemy Ci jedno przypomnienie na ten adres.” (PL/EN/IT); w podglądzie admina nic nie zapisuje.
- **PostHog:** `?lead=` wycinany z adresów; **nowe zdarzenie `reminder_link_opened`** (bez właściwości) — do przekazania wątkowi Jacek OS.
- **Panel:** Zgłoszenia → pod tabelą zwijana sekcja „Rozpoczęte, niedokończone” (osoba, krok, ostatnia aktywność, status przypomnienia, „Pokaż też dokończone”).
- Test (kontener, Playwright): prefill z `?lead=`, POST leadu po krokach 0 i 1 (step 1, 2), lista w panelu. tsc app/api czyste.
- **Po pushu:** Manual Deploy `icpe-api` (nowa tabela przez `prisma db push`). Opcjonalnie UptimeRobot: `https://icpe-api.onrender.com/cron/registration-reminders` co 5–15 min (bez tego przypomnienia wychodzą, gdy API nie śpi).

### Zniżki dzieci: trzy osobne pola — nocleg / opłata formacyjna / wyżywienie (2026-11-19)
- **Zasada Jacka (foundation-day-2027):** dzieci do 3 lat włącznie: nocleg gratis, obiady bez zniżki, opłata formacyjna −50% → próg „do 4 lat · nocleg −100% · formacja −50% · wyżywienie −0%”.
- **Model:** `AgeBracket.mealsMultiplier?` (wyżywienie dzienne); `eventMultiplier` = teraz opłata formacyjna (dla wyżywienia tylko, gdy brak `mealsMultiplier` — progi zapisane w poprzedniej wersji liczą się bez zmian). Posiłki dla nocujących dalej wg zniżki na nocleg. Test 16/16.
- **Panel (`AgeDiscountsEditor`):** kolumny „nocleg −%”, „formacja −%”, „wyżywienie −%”. Oba ostatnie puste = dotychczasowe zasady; wypełnione jedno → puste drugie = 0%. Test panelu: stary próg (tylko eventMultiplier 0.5) wczytuje się jako formacja 50 / wyżywienie 50; zapis „do 4 / 100 / 50 / puste” → `{ltAge 4, multiplier 0, eventMultiplier 0.5, mealsMultiplier 1}`.
- Stan: do pushu + **Manual Deploy `icpe-api`**.

### Edytuj zgłoszenie: rozbicie ceny + ręczny rabat / kwota końcowa (2026-11-19)
- **Prośba (Jacek):** zgłoszenie Ani Załęskiej (mąż + 3 dzieci) sprzed zmian w cenniku — w edycji brak możliwości nadania właściwej zniżki; „zmień sam albo dodaj edycję stawek i rabatów”. Panel w przeglądarce Claude nie był zalogowany (hasła nie wpisujemy) → zrobione narzędzie, poprawkę Jacek robi sam.
- **Model:** `PriceOptions.adjustment` (`PriceAdjustment`: `discountPct`, `discountAmount`, `overrideTotal`, `note`) — po kodzie rabatowym: rabat % → rabat kwotowy → (opcjonalnie) kwota końcowa zastępuje wynik; nie poniżej 0. `PriceResult.manualAdjustment`, `overridden`. Zapis w `Registration.optionsJson.adjustment` (bez zmian w bazie). Testy 15/15.
- **API:** `adminUpdate` czyści i zapisuje korektę (`cleanAdjustment`), gość przy zapisie NIE może jej ustawić (create bierze tylko transport/pościel). Zmiana noclegu przez gościa (`/z/`) zachowuje korektę (`storedOptions`). Kontrakt zgłoszeń i strona `/z/` zwracają `options.adjustment`.
- **Panel („Edytuj zgłoszenie”):** sekcja „Cena” — rozbicie na osoby (formacja / nocleg albo „bez noclegu” / wyżywienie, kwota osoby wg aktualnego cennika), opcje, kod rabatowy, „Wg cennika”; pola: Rabat %, rabat zł, „albo kwota końcowa”, powód; „Do zapłaty” na żywo + „Zapisana teraz w zgłoszeniu”. Zapis = przeliczenie z aktualnego cennika (to samo przeliczenie naprawia stare zgłoszenia — nawet bez korekty).
- **Weryfikacja:** tsc ✓, build ✓; Playwright (zamockowane API): rodzina 2 + 3 dzieci (8, 5, 2 lata), progi {do 4: nocleg −100%, wydarzenie 0%}, {do 13: −50%/−50%}, pokój 2-os. „za pokój” → rozbicie poprawne, „Wg cennika” 600 zł; rabat 10% → 540 zł; PATCH `options.adjustment = {discountPct: 10, note: 'rabat rodzinny'}`. 0 błędów JS.
- Stan: do pushu + **Manual Deploy `icpe-api`** (korektę liczy serwer — bez deployu zapis zignoruje rabat).

### Płatność: zaliczka u lidera wspólnoty (2026-11-19)
- **Prośba (Jacek):** opcja płatności „przekaż zaliczkę liderowi (50%)”, włączana w ustawieniach eventu, widoczna TYLKO gdy gość wybierze wspólnotę z sieci ICPE. **Ustalenia:** kwalifikuje się cała lista wspólnot (Polska + ICPE Worldwide), bez „Inna”; reszta (50%) gotówką na miejscu.
- **Model:** nowa wartość enumu `PaymentMethod.LEADER_DEPOSIT` (Prisma + shared + DTO) — w `paymentMethods` eventu; `pricingConfig.leaderDepositPct` (domyślnie 50); `leaderDepositSplit(total, cfg)` → zaliczka (zaokr.) + reszta. Test 14/14.
- **API:** `create` odrzuca LEADER_DEPOSIT (400), gdy event jej nie ma albo kontakt nie ma wspólnoty z listy (`community` puste lub `communityOther`). Status jak gotówka (`AWAITING_TRANSFER`). Odpowiedź `payment: {method, pct, deposit, rest}`. Maile (potwierdzenie, zmiana noclegu): „zaliczkę X (50%) przekaż liderowi… Pozostałe Y gotówką przy rejestracji”, PL/EN.
- **Formularz:** `PaymentMethodScreen` — karta „Zaliczka u lidera wspólnoty” z kwotami, tylko gdy `affiliationField = community` i wybrana wspólnota z listy; wybór kasowany, gdy gość zmieni wspólnotę na „Inna”. Podsumowanie (karta + „Zgłoszenie z zaliczką u lidera →”), ekran sukcesu i strona zgłoszenia `/z/`: `LeaderDepositBox` (zaliczka + reszta gotówką). PostHog: `payment_method: 'leader'`.
- **Panel:** `admin/events/LeaderDepositFields.tsx` w „Metody płatności” (edycja i kreator): checkbox + % zaliczki; ostrzeżenie, gdy formularz nie pyta o wspólnotę. Płatności: etykieta „Zaliczka u lidera”.
- **Weryfikacja:** tsc app/api ✓, build ✓; mail wyrenderowany (230 zł → 115 + 115); Playwright: wspólnota „ICPE Mission Warszawa” → opcja widoczna, POST `LEADER_DEPOSIT`, ekran sukcesu 45 + 45 zł; „Inna” → opcji brak. Panelu nie klikałem (tsc).
- Stan: do pushu + **Manual Deploy `icpe-api` PRZED włączeniem opcji** (nowa wartość enumu w bazie — bez deployu zapis eventu z tą metodą się nie powiedzie). Do sprawdzenia przez Jacka: jak lider rozlicza zaliczkę (panel nie ma osobnego statusu „zaliczka wpłacona”).

### Podgląd na żywo ekranów gościa w „Edytuj event” (2026-11-19)
- **Prośba (Jacek):** w pustym miejscu po prawej stronie edycji eventu — podgląd, jak wyglądają poszczególne ekrany dla użytkownika.
- **Panel:** `admin/events/EventPreviewPane.tsx` — ramka telefonu (sticky, widoczna od szerokości `xl` = 1280 px) z prawdziwym lejkiem `/r/<zapisany slug>?preview=1` w iframe; zakładki: Strona, Dane, Uczestnicy, Preferencje, Nocleg (gdy są pokoje), Opcje, Płatność (gdy płatny), Podsumowanie, Po wysłaniu; STANDALONE/INVITE — tylko Strona. Odśwież / otwórz zapisaną stronę. Język podglądu = zakładka „Język treści”.
- **Szkic na żywo:** `EventEditForm` buduje te same dane co przy zapisie (wydzielone `buildPaymentMethods/buildDates/buildTheme/buildCustomFields/buildLocationI18n` — zapis korzysta z nich też) i wysyła przez `postMessage` (ta sama domena, debounce 300 ms) — zmiany widać przed zapisaniem.
- **Lejek w trybie `?preview=1`:** `PublicFunnel` nasłuchuje `icpe-preview` (szkic eventu + ekran + język), po starcie wysyła `icpe-preview-ready`; szkic nie jest nadpisywany odpowiedzią API (`previewApplied`). Przykładowe zgłoszenie: Jan Kowalski + Ola 2 lata (pierwszy pokój, pierwsza dieta). Bez wysyłki (podsumowanie → ekran sukcesu lokalnie), bez szkiców w localStorage, bez PostHoga (`analytics.ts` pomija `?preview=1`), znaczek „Podgląd · nic nie jest wysyłane”. `LanguageSwitch`: w podglądzie bez auto-wykrycia języka przeglądarki + podświetlenie zsynchronizowane z `languageChanged`.
- **Weryfikacja:** tsc ✓, build ✓; Playwright (zamockowane API, admin 1600 px): zmiana nazwy → tytuł w podglądzie bez zapisu; zakładki Nocleg/Preferencje (3 diety)/Podsumowanie (pokój „za pokój” 200 zł dzielony 100/100, dziecko 2 lata: nocleg 0 z progu? — tu pokój za pokój, więc dzielony), wysłanie w podglądzie → ekran sukcesu, 0 POST /registrations, localStorage tylko token admina; przełączenie EN → podgląd po angielsku. 0 błędów JS.
- Kreator nowego eventu nie ma jeszcze tego podglądu (ma swój uproszczony).
- Stan: do pushu (tylko frontend).

### Zniżki dla dzieci osobno: nocleg / wydarzenie (2026-11-19)
- **Prośba (Jacek):** odróżnić zniżkę dziecka na samo wydarzenie od zniżki na nocleg; w foundation-day-2027: dzieci do 3 lat −100% tylko na nocleg.
- **Model:** `AgeBracket.eventMultiplier?` (wydarzenie = opłata formacyjna + wyżywienie dzienne); `multiplier` = nocleg (pokój liczony za osobę + `overnightMealsFee`). Brak `eventMultiplier` = dotychczasowe zasady (opłata formacyjna pełna, 0 tylko przy multiplier 0; wyżywienie × multiplier) → stare eventy bez zmian. Pokój „za pokój” nie podlega zniżce wieku. Helper `ageBracketFor`, wewn. `personFactors`. Testy 13/13.
- **Panel:** `admin/events/AgeDiscountsEditor.tsx` (edycja eventu i kreator): „do [X] lat (zakres np. 0–3 lat) · nocleg −[%] · wydarzenie −[%]”; puste „wydarzenie” = „jak dotąd”. W formularzu %; w cenniku mnożnik (1 − %/100). Opis nad progami.
- **Poprawka UX (12:20):** Jacek nie mógł zapisać po „poprawieniu 0 na 1” — najpewniej zmienił pole „Posiłki tylko dla nocujących” (domyślnie 0, tuż pod „Nocleg opcjonalny”), a nie „Liczba nocy” (sekcja Szczegóły). `OptionalStayFields` przy 0 nocach pokazuje teraz pole „Liczba nocy (teraz 0 — wpisz co najmniej 1)” w Cenniku (`onNights`, ten sam stan), a komunikat błędu mówi, gdzie jest pole. Test: zapis zablokowany → wpis 1 w nowym polu → zapis `nights: 1`.
- **Uwaga do konfiguracji:** „do X lat” jest WYŁĄCZNIE — dzieci 0–3 lata = „do 4”. Jacek miał „do 3, mnożnik 0” (= 0–2 lata, całość gratis).
- **Formularz:** stała etykieta przy dziecku „−30% · dziecko 3–12 lat” (niezależna od eventu) → „Cena dziecka zależy od wieku — zobaczysz ją w podsumowaniu.”
- **Weryfikacja:** tsc app/api ✓, build ✓; Playwright panel: wczytanie starego progu (do 3, nocleg 100%, wydarzenie puste), zmiana na do 4 / 100% / 0% → zapis `{ltAge: 4, multiplier: 0, eventMultiplier: 1}`, drugi próg bez `eventMultiplier`. Kreatora nie klikałem (tsc).
- Stan: do pushu + **Manual Deploy `icpe-api`** (cena liczona w API).

### Diety włączane per event (2026-11-19)
- **Prośba (Jacek):** admin włącza/wyłącza diety w ustawieniach eventu (domyślnie wszystkie wyłączone); w foundation-day-2027 tylko: bez mięsa, bez laktozy, bez glutenu.
- **Stan zastany (błędy):** chipy diet w kroku „Preferencje” (stała lista 6 diet, na całe zgłoszenie) szły jako `dietaryTags`, których API NIE zapisywało — wybory gości ginęły. „Dodatkowe uwagi” (krok Preferencje) też nie były wysyłane.
- **Model:** katalog `app/src/lib/diets.ts` (klucze: `no_meat` Bez mięsa, `vegan`, `gluten_free` Bez glutenu, `lactose_free` Bez laktozy, `nut_free`, `kosher`; etykiety PL/EN/IT). Event: `customFields.diets: string[]` (brak = żadna). Bez zmian w API/bazie.
- **Formularz:** krok „Preferencje” — gdy event ma włączone diety: podpowiedź „Kuchnia przygotuje tylko poniższe diety…” i chipy osobno dla każdego uczestnika (`Participant.dietKeys`); bez włączonych diet — brak chipów (zostają pola alergii i uwag). Zapis: `Participant.dietary` = etykiety PL wybranych diet (tylko włączonych w evencie) + wpis ręczny osoby z kroku Uczestnicy („Bez mięsa, Bez laktozy, alergia na orzechy”). `dietaryNotes` = alergie + „Uwagi: …” (naprawa ginących uwag). Podsumowanie: linia „Dieta: …” przy osobie.
- **Panel:** „Edytuj event” ▸ Formularz zapisu ▸ „Diety do wyboru” (`admin/events/DietOptionsSelect.tsx`); kreator — krok Strona, pod przynależnością (też wczytywane w trybie edycji kreatora).
- **Weryfikacja:** tsc ✓, build ✓; Playwright: diety [bez mięsa, bez laktozy, bez glutenu] → chipy per osoba, POST `dietary` ['Bez glutenu', 'Bez mięsa, Bez laktozy, alergia na orzechy'], notatki z „Uwagi:”; event bez diet → brak chipów; panel: włączenie 3 diet → zapis `customFields.diets`. 0 błędów JS.
- **Otwarte:** pole „Dieta / alergie” (wolny tekst) przy uczestniku w kroku 2 nadal pozwala wpisać dowolną dietę — do decyzji, czy zmienić na „Alergie”. Brak zestawienia „ile porcji której diety” w panelu.
- Stan: do pushu (tylko frontend). Potem w foundation-day-2027 włączyć 3 diety w „Edytuj event”.

### Cena pokoju: za osobę albo za pokój (2026-11-19)
- **Problem (Jacek):** raz opłata jest za pokój, raz za osobę — nie wiadomo, jak wypełniać. Silnik liczył ZAWSZE za osobę (`perPerson × noce × mnożnik`); pole „Model wyceny” w kreatorze („za pokój”, „dopłata 1-os” itd.) było tylko etykietą bez wpływu na cenę.
- **Model:** `RoomTypeDef.priceUnit?: 'person' | 'room'` (brak = `person` → istniejące eventy bez zmian). Przy `room`: `perPerson` = cena pokoju za noc; koszt = cena × noce za pokój, niezależnie od liczby i wieku osób (bez mnożnika wieku); w rozbiciu na osoby dzielony po równo. Test w `pricing.test.ts` (12/12).
- **Panel:** „Edytuj event” — przy każdym pokoju wybór „za osobę / noc” / „za pokój / noc” + podpowiedź („= 160 zł za pokój przy komplecie (2 os.)” / „= 100 zł/os przy komplecie; jedna osoba płaci 200 zł”), opis nad listą pokoi; zapis `priceUnit` + zgodna etykieta `model`. Kreator: „Model wyceny” → „Cena za” (2 opcje), etykieta pola ceny i podpowiedź; `buildPricingConfig` zapisuje `priceUnit`. Komponent `admin/events/RoomPriceFields.tsx`.
- **Lejek / panel zgłoszeń:** etykiety „/ pokój / noc” vs „/ os / noc” (`room.per_room_night` PL/EN/IT) w wyborze pokoju, podsumowaniu i „Edytuj zgłoszenie”.
- **Weryfikacja:** tsc app/api ✓, build ✓; Playwright: pokój „za pokój” 200 zł → 1 os. w pokoju i 2 os. w pokoju = ten sam nocleg 200 zł; panel: podpowiedzi, przełączenie jednostki, zapis `priceUnit: 'room'`, `model: 'za pokój'`. Kreatora nie klikałem (tsc).
- Stan: do pushu + **Manual Deploy `icpe-api`** (cena wiążąca liczona w API — bez deployu API zgłoszenie z pokojem „za pokój” zostałoby wycenione po staremu, za osobę). **foundation-day-2027:** ustawić noce = 1 i przy „Pokój dla dwóch osób” wybrać „za pokój / noc”, jeśli 200 zł ma być za pokój.

### Poprawka: brak „Nie potrzebuję noclegu” przy 0 nocach (2026-11-19)
- **Zgłoszenie (gość przez Jacka):** w `foundation-day-2027` nie da się przejść dalej bez wyboru pokoju, choć „Nocleg opcjonalny” zaznaczony.
- **Przyczyna:** event miał `nights: 0` (rooms: 1 = „Miejsce w pokoju 3-os. ze śniadaniem (pt/sb)” 100 zł/os, stock 30; 2 = „Pokój dla dwóch osób (pt/sb)” 200 zł/os, stock 7). `isAccommodationOptional` zależał od `hasAccommodation` (pokoje + noce ≥ 1) → przy 0 nocach lejek traktował nocleg jako obowiązkowy. Przy 0 nocach pokoje kosztowały też 0 zł (`perPerson × nights`). Rezerwacji pokoi jeszcze nie było (`roomUsage: {}`).
- **Kod:** `app/src/lib/funnelPrice.ts` — `isAccommodationOptional` = `accommodationOptional && rooms > 0` (bez warunku nocy). „Edytuj event” i kreator: blokada zapisu „Nocleg opcjonalny wymaga liczby nocy ≥ 1”. Test Playwright z konfiguracją 1:1 jak produkcja → checkbox widoczny, przejście dalej bez pokoju.
- **Dane (Jacek):** w „Edytuj event” ustawić Liczba nocy = 1 (to samo naprawia produkcję od razu, bez deployu, i daje poprawne ceny pokoi). Do potwierdzenia: pokój 2-os. ma 200 zł **za osobę** (= 400 zł za pokój).

### Analityka: PostHog w rejestracji, tryb bez cookies (2026-11-19)
- **Decyzja (Jacek):** na razie tylko PostHog, tylko rejestracja (`rejestracja.icpemission.pl`), bez cookies. GA4 nie (icpemission.pl bez analityki).
- **PostHog:** organizacja **ICPE PL**, projekt **„ICPE Rejestracja”** (id 357985, chmura EU, `https://eu.posthog.com/project/357985`). Ustawione przez API: strefa Europe/Warsaw, tydzień od poniedziałku, `cookieless_server_hash_mode = 2` (Settings ▸ Web analytics ▸ cookieless tracking — WYMAGANE dla `cookieless_mode: 'always'`), app URL, waluta PLN, anonimizacja IP, autocapture/heatmapy/console log wyłączone, nagrania sesji wyłączone.
- **Kod:** `app/src/lib/analytics.ts` — oficjalny loader (bez nowej zależności npm; skrypt z `eu-assets.i.posthog.com`), `initAnalytics()` w `main.tsx`. Config: `cookieless_mode: 'always'` (zero cookies/localStorage — sprawdzone), `person_profiles: 'identified_only'` (nikogo nie identyfikujemy), `autocapture: false`, `capture_pageview: 'history_change'`, bez nagrań i ankiet. `before_send`: odrzuca `/admin*` i `/panel*`, wycina tokeny z URL-i (`/z|g|i/<token>` → `/[token]`, `?inv=`/`?token=`). Klucz publiczny w stałej `POSTHOG_KEY` (nadpisywalny `VITE_POSTHOG_KEY`, host `VITE_POSTHOG_HOST`).
- **Zdarzenia (bez danych osobowych):** kontekst wizyty `event_slug`, `event_type`, `event_free`, `accommodation_optional`; `registration_started` {invited, had_draft}, `registration_resumed` {step}, `registration_step_completed` {step 0–4, step_name applicant/participants/preferences/accommodation/options}, `registration_step_blocked` (krok noclegu), `accommodation_chosen` {choice none/partial/all, rooms, people, people_with_room}, `payment_method_selected`, `registration_submitted` {payment_method, total, currency, people, adults, children, rooms, people_without_room, invited, discount_used}, `registration_submit_failed` {reason rooms_sold_out/closed/error}, `manage_registration_viewed` {lock}, `accommodation_changed` {change added/removed/changed, rooms_before/after, total_before/after}. Plus `$pageview` z UTM-ami.
- **Weryfikacja:** tsc ✓, build ✓; Playwright z przechwyceniem wysyłki do PostHog (skrypt SDK z npm, bo CDN niedostępny z sandboxa): pełny lejek → wszystkie zdarzenia z poprawnymi właściwościami, `$cookieless_mode: true`, brak imion/maili/tokenów w danych, 0 cookies / localStorage / sessionStorage, panel admina bez zdarzeń. Uwaga do testów: SDK odrzuca headless przeglądarki jako boty (`opt_out_useragent_filter`).
- **Handoff z Jacek OS (19.11):** Jacek OS chciał innych nazw (`event_instance_id`, `locale`, `registration_form_viewed`, kroki od 1, `participants_count`/`total_amount`, `registration_failed`). **Decyzja Jacka: nie zmieniamy kodu — Jacek OS dopasowuje się do nas.** Odpowiedź z mapowaniem: `Jacek OS/HANDOFF-ICPE-POSTHOG-ODPOWIEDZ.md` (łączenie po `slug` z `/admin/instances`; pierwszy `$pageview` bez `event_slug` → liczyć po `$pathname`). Pierwsze produkcyjne zdarzenia: 19.11 ~11:37 z `/r/foundation-day-2027`. **Nie zmieniać nazw zdarzeń/właściwości bez uzgodnienia z Jacek OS.**
- **Do zrobienia po pierwszych danych:** dashboard „Lejek rejestracji” (funnel: $pageview /r/ → registration_started → kroki → registration_submitted, rozbicie po `event_slug`).
- Stan: do pushu (tylko frontend, auto-deploy `icpe-frontend`).

### Limit pokoi + rezerwa dla gości specjalnych (2026-11-19)
- **Prośba (Jacek):** limit pokoi per typ; admin może zablokować w systemie określoną liczbę pokoi dla gości specjalnych.
- **Model:** `pricingConfig.rooms[].stock` (liczba pokoi; brak/0 = bez limitu) i `reserved` (ile z nich zablokowanych dla gości specjalnych). Nowa kolumna `Registration.roomsReserved Boolean @default(false)` (wchodzi przez `prisma db push`) — zgłoszenie, którego pokoje idą z rezerwy (ustawia admin).
- **Liczenie (shared):** `countRoomsByType`, `roomAvailability(cfg, usedPublic, usedReserved)` = `stock − max(rezerwa, zajęte z rezerwy) − zajęte publicznie` (goście specjalni najpierw zużywają rezerwę, ponad nią pulę publiczną), `roomStockShortages`. Testy 11/11.
- **API:** `api/src/registrations/room-stock.ts` — zajętość z `roomsJson` wszystkich zgłoszeń instancji poza CANCELLED (czekające na wpłatę też trzymają pokój). `create` i zmiana noclegu przez gościa → 409 „Brak wolnych pokoi typu …”, gdy brak (gość z `roomsReserved` nie jest ograniczany). Admin (`PATCH /admin/registrations/:id`) bez blokady, przyjmuje `roomsReserved`. `/r/:slug/config` zwraca `roomAvailability`, `roomUsage`, `roomUsageReserved` (tylko gdy jakiś typ ma limit). `GET /registrations/manage/:token` zwraca `roomAvailability` z własnymi pokojami w puli. Lista zgłoszeń: dopisek „(rezerwa gości specjalnych)”, pole `roomsReserved`.
- **Lejek / strona gościa:** w wyborze typu „został 1 pokój / zostały 3 pokoje” (gdy ≤ 5), wyczerpany typ „brak wolnych” i nieaktywny; kolejny pokój ponad limit → błąd na karcie pokoju i blokada „Dalej” (`room.err_sold_out`). Nowy pokój domyślnie pierwszego typu z wolnymi.
- **Panel:** `admin/events/RoomStockFields.tsx` w „Edytuj event” (Cennik → Pokoje): „Liczba pokoi” + „w tym dla gości specjalnych” + podgląd „Zajęte: X z zapisów + Y gości specjalnych · wolne w zapisach · wolne w rezerwie”. Kreator: pole „Liczba pokoi” (wcześniej trafiało tylko do RoomType) teraz = limit (puste = bez limitu; placeholder zmieniony), nowe pole rezerwy, tabela „Szt. (rez.)”. „Edytuj zgłoszenie”: checkbox „Pokoje z rezerwy dla gości specjalnych” (widoczny, gdy event ma rezerwę).
- **Poprawka przy okazji:** „Edytuj event” numerował id typów pokoi od nowa przy każdym zapisie (`String(i + 1)`) — usunięcie pokoju przesuwało id pozostałych i psuło powiązanie z istniejącymi zgłoszeniami. Teraz id zachowane (`origId`), nowe dostają wolny numer.
- **Weryfikacja:** tsc app ✓, api ✓ (poza starymi src/courses); build ✓; Playwright: lejek z wolnymi {2-os.: 1, 1-os.: 0} → opcje „został 1 pokój” / „brak wolnych” (disabled), drugi pokój 2-os. → błąd + blokada; panel „Edytuj event” (zamockowane API, fałszywy JWT): podgląd zajętości, zmiana rezerwy → zapis `rooms: [{id:'1', stock:10, reserved:3}, {id:'2'}]`, `accommodationOptional` zachowane. 0 błędów JS. Kreatora i checkboxa w „Edytuj zgłoszenie” nie klikałem (tsc).
- **Ograniczenia:** dwa równoczesne zapisy na ostatni pokój mogą przejść oba (sprawdzenie bez blokady transakcyjnej — przy tym ruchu mało prawdopodobne). Limit działa per typ pokoju z cennika; moduł „Zakwaterowanie” (fizyczne pokoje `RoomType/Room`) bez zmian.
- Stan: do pushu + **Manual Deploy `icpe-api`** (nowa kolumna `roomsReserved` dojdzie sama przy starcie).

### Nocleg opcjonalny + strona zgłoszenia gościa + kwota gotówki (2026-11-19)
- **Prośba (Jacek):** event 9:00–17:00 z noclegiem dla przyjezdnych — wybór noclegu opcjonalny (checkbox „Nie potrzebuję noclegu”), możliwość późniejszej zmiany / domówienia noclegu, a przy gotówce pokazanie (i wysłanie) kwoty, którą gość ma mieć przy sobie.
- **Silnik (`shared/src/pricing.ts` → `deploy/sync-shared.sh` → `api/src/_shared`):** `PricingConfig.accommodationOptional?`, `overnightMealsFee?` (posiłki tylko dla nocujących, os/noc, z mnożnikiem wieku); `PriceInput.withoutRoom?` — osoba bez pokoju = opłata formacyjna + `mealsFee` (bez noclegu); `PriceResult.withoutRoom?`; helpery `buildPriceInput(participants, rooms, …)` (dedup indeksów, reszta → withoutRoom) i `hasAccommodation(cfg)` (pokoje + noce ≥ 1). **Poprawka przy okazji:** `computePrice` zwracał zawsze `currency: 'PLN'` — teraz waluta eventu. Testy: `node --experimental-strip-types --test src/pricing.test.ts` (9/9).
- **Front:** `app/src/lib/funnelPrice.ts` (`funnelPriceInput` — wspólna wycena lejka/strony gościa/panelu; przy noclegu OBOWIĄZKOWYM nieprzypisani nie są liczeni, jak wcześniej). `StepperState.noAccommodation`. Krok 3 (`Step3Room`) przy noclegu opcjonalnym: tytuł „Nocleg (opcjonalnie)”, checkbox „Nie potrzebuję / Nie potrzebujemy noclegu” (czyści pokoje), brak auto-dodawania pokoju, nieprzypisani = szara lista „Bez noclegu:”. Walidacja: wymagany wybór (checkbox ALBO ≥1 pokój); częściowe przypisanie dozwolone. Zmiana w formularzu chowa komunikat błędu kroku (`patchStepper`). Podsumowanie: sekcja noclegu z „Bez noclegu” + nazwiska, wiersz „Zakwaterowanie” ukryty przy 0. Pasek ceny: bez „+0 zł nocl.” przy noclegu opcjonalnym. Landing: „· nocleg opcjonalny” zamiast „· 1 noc”.
- **Gotówka:** `components/funnel/CashAmountBox.tsx` — duża kwota „Gotówka do przygotowania” na ekranie sukcesu i na stronie gościa; ta sama kwota w mailu.
- **Strona zgłoszenia gościa `/z/:editToken`** (`pages/ManageRegistration.tsx`): wydarzenie, uczestnicy, edycja noclegu (ten sam `Step3Room`), obecna → nowa kwota na żywo, zapis. Blokady (`lock`): PAID (status CONFIRMED), CANCELLED, CLOSED (instancja ≠ OPEN), STARTED (po starcie), NO_ACCOMMODATION — komunikat „ustal z organizatorem”. Link na ekranie sukcesu („Zmień nocleg”) i w mailu.
- **API:** `rooms` w `CreateRegistrationDto` opcjonalne (bez `ArrayNotEmpty`); serwis sam waliduje: `normalizeRooms` (znane typy, indeksy, bez duplikatów i pustych pokoi) + `assertRooms` (pojemność; przy noclegu obowiązkowym każdy w pokoju → 400). Nowe publiczne trasy: `GET /registrations/manage/:token`, `PUT /registrations/manage/:token/accommodation` (przelicza cenę, aktualizuje `roomsJson`/`totalPrice`/płatność PENDING). Kolejność uczestników po `createdAt, id`. `adminUpdate` — osoby bez pokoju dozwolone. Lista zgłoszeń: `roomSummary`/`assignedRoom` dopisuje „bez noclegu”, nowe pole `withoutRoom`. `/pricing/quote` przyjmuje `withoutRoom`.
- **Maile:** CONFIRMATION (PL/EN wg locale): linia noclegu („Nocleg (1 noc): … / Bez noclegu”), przy gotówce „Prosimy mieć przy sobie X gotówką”, link „Zmień nocleg” (przycisk albo tekst, gdy przycisk zajęty przez „Zaproś gościa”). Nowe typy: `ACCOMMODATION_CHANGED` (do gościa, nowa kwota) i `ACCOMMODATION_CHANGED_ADMIN` (kopia na `MAIL_REPLY_TO`, jeśli ustawiony: było → jest, kwota stara → nowa). Etykiety w Ustawienia → Poczta.
- **Panel:** `admin/events/OptionalStayFields.tsx` — „Nocleg opcjonalny” + „Posiłki tylko dla nocujących” w kreatorze (krok Szczegóły, pod liczbą nocy) i w „Edytuj event” (Cennik → Pokoje); ostrzeżenie, gdy noce < 1 lub brak pokoi. `RegistrationEditForm`: przy noclegu opcjonalnym brak wymogu przypisania, info „Bez noclegu: …”, cena przez `funnelPriceInput`.
- **Weryfikacja:** tsc app ✓, api ✓ (poza starymi błędami src/courses); `vite build` ✓ (w chmurze — esbuild na VM nie działa); Playwright z mockiem API: brak wyboru → błąd; „Nie potrzebujemy noclegu” → 2 os. × (50+40) = 180 zł, POST `rooms: []`; częściowo (Jan w 2-os., Anna bez) → 290 zł, POST `rooms:[{1,[0]}]`; podsumowanie i sukces z kwotą gotówki; strona `/z/tok1`: domówienie dla obu → nowa kwota 400 zł, PUT poprawny, komunikat zapisu; EN + blokada PAID; zły token → komunikat. Maile wyrenderowane (PL/EN, gotówka, przelew, kopia admina). 0 błędów JS. Panelu admina nie klikałem w przeglądarce (tylko tsc).
- **Nie zrobione / do decyzji:** limit liczby pokoi (dostępność) — pokoje nadal bez limitu sztuk; zmiana noclegu nie rusza fizycznych przydziałów z „Zakwaterowania” (admin dostaje mail-kopię); IT maile → PL (jak dotąd).
- Stan: do pushu + **Manual Deploy `icpe-api`** (bez zmian schematu bazy). Śmieci po sesji w `_to_delete/` (w .gitignore) — można usunąć.

### Zakładka „Biblioteka” w panelu (2026-10-21)
- **Prośba (Jacek):** osobna zakładka do wgrywania gości specjalnych i miejsc poza tworzeniem eventów.
- **Panel:** nowy ekran `admin/library/LibraryScreen.tsx`, pozycja „Biblioteka” w pasku bocznym (pod „Eventy”; `AdminPanel.tsx` + `AdminSidebar.tsx`, typ `AdminScreen` + `library`). Dwie zakładki z licznikami:
  - **Goście specjalni:** lista (portret, imiona, opis PL, plakietki PL/EN/IT = które języki wypełnione), „Dodaj gościa” / ołówek → formularz w miejscu: przełącznik języka PL/EN/IT (imiona + opis), wgranie/zmiana/usunięcie portretu, „para”; zapis = `POST /admin/special-guests` (z id przy edycji). Usuwanie z potwierdzeniem w wierszu. PL imiona wymagane.
  - **Miejsca:** dodawanie (Enter), zmiana nazwy w miejscu (Enter/Esc), usuwanie z potwierdzeniem; sortowanie alfabetyczne.
- **API:** `PATCH /admin/places/:id` (zmiana nazwy; pusta → 400) — `places.controller/service`. Front: `renamePlace`, `deletePlace` w `lib/api.ts`.
- Eventy trzymają kopie (gość, adres) — zmiany w bibliotece nie zmieniają istniejących eventów (opis na ekranie).
- **Weryfikacja:** tsc app ✓, api ✓ (poza starymi błędami src/courses); Playwright z mockiem (stateful): dodanie gościa PL+EN z portretem, edycja opisu, walidacja pustych imion, usunięcie; miejsca: dodanie, zmiana nazwy, usunięcie; liczniki zakładek; 0 błędów JS.
- **Deploy (Jacek):** Manual Deploy `icpe-api` pokazał „45 vulnerabilities (4 low, 17 moderate, 23 high, 1 critical)” — to raport `npm audit` przy instalacji, nie błąd; bez nowych zależności. Do osobnego przeglądu (bez `npm audit fix --force`, które podbija główne wersje Nest/Prisma).
- Stan: do pushu + **Manual Deploy `icpe-api`** (nowy endpoint PATCH miejsc).

### Biblioteka gości specjalnych (2026-10-21)
- **Prośba (Jacek, pierwsza wiadomość dnia):** zapisane zdjęcia i opisy gości do ponownego wyboru, zamiast wgrywać je za każdym razem.
- **API:** model `SavedGuest` (`name` Json, `bio` Json?, `photoUrl`?, `plural`, timestamps) — wchodzi przez `prisma db push` przy starcie. Moduł `api/src/special-guests/` (wzór: `places`), endpointy JWT `GET/POST /admin/special-guests`, `DELETE /admin/special-guests/:id`. POST: z `id` → aktualizacja; bez `id` → po imieniu PL (bez duplikatów). Nazwa celowo ≠ istniejący moduł `guests` (konta uczestników). Serwis używa `(prisma as any).savedGuest` — typy klienta dojdą po `prisma generate` na Render.
- **Panel (`SpecialGuestsEditor`, kreator i „Edytuj event”):** przycisk „Wybierz z biblioteki (N)” → lista (portret, imiona, opis PL, „· para”) z „Dodaj” / „✓ Dodany” i usuwaniem z potwierdzeniem w wierszu. Na karcie gościa: „Zapisz w bibliotece” / „✓ W bibliotece” / „Zaktualizuj w bibliotece” (gdy treść różni się od zapisanej). Goście wczytani z eventu są automatycznie łączeni z biblioteką po imieniu PL. Usunięcie z biblioteki nie usuwa gościa z eventu (tylko zrywa powiązanie). Powiązanie z biblioteką nie zapisuje się w evencie (event trzyma pełną kopię gościa — zmiana w bibliotece nie zmienia starych eventów).
- **Weryfikacja:** tsc app ✓, api ✓ (poza starymi błędami src/courses); Playwright z mockiem API (stateful): stary gość → „W bibliotece”; dodanie z biblioteki (z EN) → karta wypełniona; zmiana opisu → „Zaktualizuj” → POST z id; nowy gość → POST bez id, licznik 3; usunięcie z biblioteki → karta zostaje z „Zapisz w bibliotece”; zapis eventu bez pól biblioteki; kreator: dodanie z biblioteki → publikacja z en. 0 błędów JS.
- Stan: do pushu + **Manual Deploy `icpe-api`** (nowa tabela + endpointy). Do tego czasu panel po prostu nie pokaże przycisku biblioteki (lista pusta / błąd → ukryty), a „Zapisz w bibliotece” zgłosi błąd.

### Wielu gości specjalnych na event (2026-10-21)
- **Prośba (Jacek):** dało się dodać tylko jednego gościa (lub małżeństwo) — potrzeba kilku.
- **Model:** nowe `customFields.specialGuests: SpecialGuest[]` (`{name, bio, photoUrl, plural}`; name/bio = mapy językowe). Stary pojedynczy `specialGuest` nadal czytany — `eventGuests()` w `lib/api.ts` (lista albo [stary gość]). Zapis z panelu: `specialGuests` + `specialGuest: null` (bez dublowania). Istniejące eventy działają bez zmian; po pierwszym zapisie w „Edytuj event” przechodzą na nowy format.
- **Panel:** wspólny edytor `admin/events/SpecialGuestsEditor.tsx` (kreator i „Edytuj event”): karta na gościa — portret (upload), imiona i opis w bieżącym języku treści (placeholder „PL: …”), „Para / kilka osób w jednym wpisie”, strzałki kolejności, usuń; „Dodaj kolejnego gościa”. Puste wpisy pomijane przy zapisie. Licznik braków tłumaczeń liczy opisy gości.
- **Strona:** `SpecialGuestsBlock` (w `EventContentBlocks.tsx`) — nagłówek „Gość specjalny” / „Goście specjalni” (liczba mnoga przy >1 gościu lub parze) i karta na każdego.
- **Poprawka przy okazji:** zwykła strona eventu (`LandingScreen`) w ogóle nie pokazywała gościa specjalnego — tylko strony zaproszeń. Teraz goście są pod opisem, nad programem.
- **Weryfikacja:** tsc ✓; Playwright z mockiem: kreator 3 karty (1 pusta) + przesunięcie + EN opis → zapis 2 gości w nowej kolejności, z `en`; „Edytuj event” na starym evencie z `specialGuest` → 1 karta, dodanie drugiego → zapis `specialGuests` (2) + `specialGuest: null`; strona EN: „Special guests” + 2 karty (EN imiona/opisy), stary event: „Special guest”. 0 błędów JS.
- Stan: do pushu (tylko frontend, auto-deploy `icpe-frontend`). Następny krok, o który Jacek prosił wcześniej: biblioteka zapisanych gości (wybór z listy zamiast ponownego wgrywania zdjęcia/opisu).

### Pole „Wspólnota” (lista) / „Parafia” w formularzu zapisu (2026-10-21)
- **Prośba (Jacek):** alternatywa dla pola „parafia” — rozwijana lista wspólnot z sekcjami Polska / ICPE Worldwide; „Inna” → pole do wpisania ręcznego.
- **Stan zastany:** pola „Parafia” w formularzu nie było — w kreatorze był tylko martwy checkbox „Parafia” w „Pola formularza” (pozostałe checkboxy tej listy też do niczego nie są podłączone; nie ruszane).
- **Ustawienie per event:** `customFields.affiliationField` = `parish` | `community` | null. Wybór „Nie pytaj / Parafia / Wspólnota” — komponent `admin/events/AffiliationSelect.tsx`, w kreatorze (krok Strona, zamiast checkboxa „Parafia”) i w „Edytuj event” (nowa sekcja „Formularz zapisu”). Domyślnie: nie pytaj.
- **Formularz (krok „Dane zgłaszającego”, `Step0Applicant`):** Parafia = pole tekstowe, nieobowiązkowe. Wspólnota = `<select>` z `<optgroup>` Polska (4 + „Inna” na końcu sekcji, jak na liście Jacka) i ICPE Worldwide (16); obowiązkowe — walidacja w `PublicFunnel.handleStepperNext` (brak wyboru / „Inna” bez nazwy). Lista w `app/src/lib/communities.ts` (nazwy własne bez tłumaczenia; tłumaczone: nagłówki sekcji, „Inna”, komunikaty — sekcja `community` w locales).
- **Zapis:** `Registration.contact` (JSON, bez zmian schematu): `parish` albo `community` (+ `communityOther: true`, gdy wpisana ręcznie). Typ `Contact` rozszerzony w `shared/src/types.ts` i `api/src/_shared/types.ts`.
- **Admin:** API (`admin.service` i `registrations.service.toContractRegistration`) zwraca w `contact` także `address`, `parish`, `community`, `communityOther` (wcześniej obcinało do imienia/nazwiska/e-maila/telefonu). Szczegóły zgłoszenia: wiersze Adres / Parafia / Wspólnota („Inna: …” dla wpisanej ręcznie); lista zgłoszeń: wspólnota/parafia pod e-mailem; wyszukiwarka szuka też po wspólnocie/parafii.
- **Poprawka przy okazji:** edycja zgłoszenia przez admina (i przez gościa linkiem) nadpisywała cały `contact` — gubiła adres; teraz scala z istniejącym.
- **Poprawka przy okazji:** formularz wysyłał zawsze `locale: 'pl'` (zgłoszenie i zakładanie konta) → gość z wersji EN dostawał polski mail; teraz język gościa (API ma maile PL/EN; IT → na razie PL).
- **Weryfikacja:** tsc app ✓, api ✓ (poza 2 starymi błędami w src/courses — niezwiązane); Playwright z mockiem API: lista w EN (sekcje Poland / ICPE Worldwide, „Other”), walidacja brak wyboru / „Inna” bez nazwy, wysłany contact `{community: "…", communityOther: true}` + `locale: en`; tryb parafii (PL) → `{parish}`; tryb „nie pytaj” (IT) → bez pól; kreator wysyła `customFields.affiliationField`.
- Stan: do pushu + **Manual Deploy `icpe-api`** (zmiany w API: zwracanie pól kontaktu, scalanie przy edycji). Bez zmian w bazie.

### Strona zapisów: tytuł karty, „Zobacz program” i pozostałe polskie napisy w EN/IT (2026-10-21)
- **Zgłoszenie (Jacek):** po zmianie języka tytuł karty przeglądarki zostawał polski („Dzień ICPE — Rejestracja”), przycisk „Zobacz program” też.
- **Przyczyna:** `document.title` ustawiany raz przy wczytaniu, z wersji PL i z dopiskiem na sztywno; w publicznych ekranach ~80 napisów wpisanych po polsku zamiast przez `t()`.
- **Tytuł karty:** `PublicFunnel` (efekt na `[event, lng]`, dopisek `common.tab_registration`), `InviteConfirm`, `GuestInvitePage`, `PublicHome` — odświeża się przy przełączeniu języka.
- **Przetłumaczone ekrany (klucze PL/EN/IT w `app/src/locales/*.json`):** LandingScreen (`content.see_program`), RsvpScreen (cały ekran — sekcja `rsvp`; do tego miejsce z `locationI18n` i opis z mapy językowej — wcześniej zawsze PL; RSVP zapisuje teraz `locale` gościa), SummaryScreen (też poprawka: przy tytule-mapie pokazywał „Dzień Formacji 2026” z mocka — teraz `pickLang`), SuccessScreen, PaymentMethodScreen („Wybrano”, brakujące klucze gotówki `payment_method.cash/cash_tags`), StickyPriceBar, Step0–4 (placeholdery, „Wstaw moje dane”, linki RODO/regulamin), Step3Room, PublicFunnel (błąd ładowania, walidacja pokoi — z liczbą mnogą `room.err_unassigned_*`), PublicHome (sekcja `home`), InviteMatchScreen/InviteConfirm (placeholdery), ThemeToggle, Spinner, LanguageSwitch (aria).
- **Diety (Step2Prefs):** wartości zapisywane w zgłoszeniu zostają po polsku (czyta organizator), gość widzi etykiety z `prefs.diets` w swoim języku.
- **Walidacja pokoi:** komunikaty silnika `validateRoomCapacity` (@icpe/shared, wspólny z API) są po polsku — nie ruszane; front buduje własne, przetłumaczone (`room.err_empty/err_over/err_check`). Przy okazji błąd pojemności przypisywany jest do konkretnego pokoju (po `uid`), a nie do wszystkich pokoi tego samego typu.
- **Ekran sukcesu przy gotówce:** zamiast „prosimy o dokonanie przelewu” — `success.cash_msg` / status „Płatność na miejscu”.
- **Weryfikacja:** `tsc` ✓ (komputer Jacka + chmura); skan AST publicznych plików — zostały tylko celowe polskie stałe (wartości diet, klucz modelu „noc”); Playwright z zamockowanym API, EN i IT: landing → przełączenie PL↔EN/IT (tytuł karty i przycisk programu się zmieniają) → kroki 0–4 → płatność gotówką → podsumowanie → sukces, plus RSVP i strona główna — 0 polskich napisów, 0 błędów JS.
- Stan: do pushu przez Jacka (auto-deploy `icpe-frontend`). Backend bez zmian.

### Przełącznik języków PL / EN / IT w kreatorze nowego eventu (2026-10-21)
- **Problem (Jacek):** przy tworzeniu eventu jednorazowego nie było pól na wersje językowe — tytuł i opis zawsze po polsku; tłumaczenia dało się wpisać dopiero w „Edytuj event” po utworzeniu (niewygodne).
- **Zmiana:** `app/src/components/admin/events/EventWizard.tsx` — pasek „Język treści” (PL / EN zawsze, „+ IT” dokłada włoski i zaznacza IT w językach strony), przyklejony u góry przy przewijaniu, z licznikiem braków tłumaczeń na każdej zakładce (jak w edycji). Widoczny w krokach Szczegóły, Pokoje (gdy są pokoje) i Strona (tam pokazuje też braki z wcześniejszych kroków).
- **Tłumaczone pola:** nazwa, opis, miejsce (`customFields.locationI18n`), punkty programu (godzina wspólna), imiona gości, „kim są”, nazwy pokoi (w tabeli pokoi, gdy zakładka EN/IT), nadtytuł (w EN/IT wpisywany ręcznie, gotowe presety są po polsku). W zakładce obcej placeholder pokazuje polski oryginał („PL: …”); puste = gość widzi wersję PL.
- **Zapis:** ten sam format co „Edytuj event” — mapy `{pl, en, it}` (title, description, program.item, specialGuest.name/bio, pricingConfig.rooms[].name, RoomType.name, theme.supertitle; nadtytuł bez tłumaczeń zostaje zwykłym tekstem). Języki strony: zaznaczone w kroku Strona + automatycznie każdy język, w którym coś wpisano. Podgląd po prawej pokazuje tytuł w edytowanym języku i plakietki EN/IT.
- Drobna zmiana układu: kontener treści kroku nie ma już `overflow-y-auto` (był bez limitu wysokości, a blokował przyklejanie paska).
- **Weryfikacja:** `tsc --noEmit` (app) ✓ na komputerze Jacka; w chmurze harness z zamockowanym API + Playwright: przejście PL → EN → IT → pokoje → strona → Publikuj — payloady `POST /admin/series`, `room-types`, `/page` zawierają poprawne mapy językowe i locales `[pl,en,it]` ✓, brak błędów JS ✓, zrzuty ✓. Backend bez zmian.
- **Nie zrobione (do decyzji Jacka):** tłumaczenie AI przyciskiem „Przetłumacz z PL” (wymaga klucza API na Render) i biblioteka zapisanych gości specjalnych (portret + opis do wyboru).
- Stan: do pushu przez Jacka (auto-deploy `icpe-frontend`).

## Dziennik prac — strona icpemission.pl (site/)

### Google Tag Manager GTM-P2JDGP49 na stronie (2026-11-20)
- Snippet od Jacka (gtm.js `GTM-P2JDGP49` + `dataLayer`/`gtag('js')`) w nowym `site/src/components/GtmHead.astro` (`is:inline`, bez zmian w treści), wstawiony w `LandingLayout.astro` zaraz po `<meta charset>` — prop `tracking` (domyślnie `true`).
- Obejmuje: stronę główną, `/nowosci` (lista + wpisy — jedyne podstrony linkowane z home), `/promyk-swiatla`, `/aktualnosci` (przekierowanie).
- **Wyłączone** w `/formacja` (`index.astro` i `[slug].astro`: `tracking={false}`) — w adresach panelu kursanta są tokeny (`?haslo=`, `#podglad=`). Stare strony CMS (`BaseLayout`, `/[slug]`) bez GTM — nielinkowane z home.
- Brak banera zgody: zgody (Consent Mode / CMP) trzeba obsłużyć w samym kontenerze GTM. Rejestracja (app/) bez zmian — tam dalej tylko PostHog cookieless.
- Weryfikacja: `astro build` w /tmp OK; GTM obecny w 5 stronach, brak w `/formacja/`. **Stan: czeka na push** (auto-deploy `icpe-site`).

### Sekcja Nowości + /nowosci/ (2026-10-20)
- **Model treści: pliki w repo, nie CMS.** Wpis = katalog `site/src/content/nowosci/<adres>/` z `pl.md` (wymagany: title, date, excerpt, cover, coverAlt, coverPosition?, place?, gallery[{src, alt, caption?, captionEn?}], draft?) i opcjonalnym `en.md` (title, excerpt, coverAlt + treść). Zdjęcia: `site/public/nowosci/<adres>/` (cover.jpg, 01.jpg…; ~1600 px, EXIF obrócony). Kolekcja w `src/content/config.ts`, logika w `src/lib/news.ts` (sortowanie po dacie, wymiary zdjęć czytane z plików przy buildzie). Szablon: `src/content/nowosci/_SZABLON.md`. Tytuły z dwukropkiem brać w cudzysłów (YAML).
- **Strona główna:** sekcja `#nowosci` (`components/NewsSection.astro`) zaraz pod paskiem miast: najnowszy wpis wyróżniony + do 3 skrótów (zdjęcie, data · miejsce, tytuł, skrót, „Czytaj dalej”). 1 wpis → układ zdjęcie obok tekstu. 0 wpisów → sekcja i link „Nowości” w menu ukryte.
- **`HOME_LIMIT = 4`** (`lib/news.ts`). Gdy wpisów > 4: przycisk „Wszystkie nowości (N)” na głównej + strona `/nowosci/` (karty 3 kolumny, grupowanie po latach). Do tego czasu `/nowosci/` przekierowuje na `/#nowosci` (noindex).
- **Strona wpisu** `/nowosci/<adres>/`: data, tytuł, lead (kursywa), zdjęcie główne bez kadrowania, treść Markdown, galeria „wierszami” bez kadrowania (szerokie w osobnym rzędzie, reszta parami, wysokość rzędu maks. ~620 px), lightbox (strzałki/Esc/swipe), Udostępnij/Kopiuj link, „Więcej nowości”, JSON-LD NewsArticle, og:image = okładka. Bez `en.md` gość EN widzi PL + dopisek „available in Polish only”.
- **Refaktoryzacja:** nawigacja, stopka, wybór języka i antyspamowe maile wydzielone 1:1 z `pages/index.astro` do `components/SiteShell.astro` (wspólne dla głównej i podstron; na podstronach kotwice `/#…`). Logo w nawigacji jest teraz linkiem do `/`. Sprawdzone: HTML głównej bez wpisów identyczny poza tym.
- **Stare `/aktualnosci`** (szablon CMS, API `/site/articles` było puste): `[slug].astro` usunięty, `index.astro` przekierowuje na nowości. Model `Article` w API/Personal OS nieużywany przez stronę.
- Pierwszy wpis: `lodz-dar-spotkania` — „Dar spotkania” / „Gift of Encounter”, Łódź 19.10.2026 (EN od Jacka, PL moje tłumaczenie; skrót/excerpt mój), 3 zdjęcia (cover = wspólne zdjęcie, galeria 2 pionowe).
- Weryfikacja: build ✓ (na komputerze Jacka, kopia w ~/sb), zrzuty desktop/mobile z 1 i 6 wpisami (demo) ✓, lightbox ✓, brak błędów JS. `astro check`: 3 błędy typów tylko z braku @types/node w news.ts (build OK).
- Stan: do pushu przez Jacka.

## Dziennik prac — nowa strona icpebook.org („A Cast of Light")

### Book events zamiast promocji polskiej premiery (2026-10-17)
- Premiera PL odbyła się 16.10.2026 → z icpebook.org usunięte: pasek „Polish edition launch”, sekcja rejestracji Luma, status „Launch” w Wydaniach, `EVENTS` i skrypt `data-until`, klucze `launchBar` i `editions.launch`.
- PL edycja w `EDITIONS` ma status `available` (przycisk „Polish edition” → icpemission.pl/promyk-swiatla). Teksty hero/journey we wszystkich 4 językach zaktualizowane (PL dostępne). PL CTA: „Zamów polskie wydanie”.
- Nowa sekcja `#events` („Book events”, między Rekomendacjami a Galerią, link w nawigacji): relacja z premiery w Krakowie — tekst EN verbatim od Jacka (kursywa: „live out its unwritten thirteenth chapter”), tłumaczenia PL/IT/ES moje. Dane: `NEWS` w config.ts (data + zdjęcia), teksty `events.*` w i18n (`paras` mogą mieć `<em>`; akapit nr 4 to wyróżniony cytat).
- Zdjęcia: `book/public/img/events/krakow-01..04.jpg` (+ thumb-), otwierają się w lightboksie galerii. Podpisy/alt bez nazwisk.
- Poprawka: na górze zdjęcie ze spotkania z kardynałem (`krakow-05.jpg`), poziome zdjęcie prelegenta przy krzyżu (`krakow-01.jpg`) przeniesione na dół. Poziome zdjęcia (w > h) automatycznie zajmują całą szerokość.
- 2026-10-18: nowy komplet 6 zdjęć (`krakow-01..06.jpg`, kolejność od Jacka). Układ „justified rows”: zdjęcie poziome w osobnym rzędzie, reszta parami, wspólna wysokość w rzędzie, bez kadrowania (`newsRows` w BookPage). Lightbox przechodzi przez wszystkie 6. Podpis EN przy zdjęciu z JPII: „St. John Paul II” (zamiast „Saint”).
- icpemission.pl (site/) nieruszone: PremiereBanner sam się ukrywa po dacie, promyk-swiatla pokazuje „Premiera odbyła się”.

### Tytuł włoski bez kropki (2026-10-14)
- „Un raggio di luce La storia dell’ICPE Mission” (lista wydań, tytuł karty IT, dane strukturalne, CTA na /it/extracts/). Nowe opcjonalne pole słownika `titleSep` (IT = spacja, reszta domyślnie „. ”). Build ✓.

### GA4: tag w <head> + Consent Mode v2 (2026-10-14)
- Jacek: tag GA4 musi być w `<head>` (GA nie wykrywał tagu, bo ładował się dopiero po zgodzie). Nowy `components/GAHead.astro` w `<head>` obu stron: gtag.js `G-GXFTQF41HN` + `gtag('consent','default', …denied)`; `analytics_storage` = granted od razu, jeśli zgoda zapisana w localStorage. Baner (`Analytics.astro`) wysyła `gtag('consent','update')`. Bez zgody GA nie zapisuje cookies (pingi bez cookies — tryb zaawansowany Consent Mode).
- Test: tag i config w head na / i /extracts/, consent default denied → update granted po kliknięciu, po odświeżeniu granted od startu i bez banera ✓.

### Wycofana wersja koreańska strony (2026-10-14)
- Jacek: tłumaczenia koreańskiego nie robimy. `LANGS` = en/pl/it/es, usunięty `book/src/i18n/ko.ts` i style/fonty KO; `/ko`, `/ko/endorsements`, `/ko/gallery`, `/ko/extracts` przekierowują na EN. Wydanie hiszpańskie oznaczone jako eBook (`EDITIONS.format`), status „wkrótce” — tytuł ES do potwierdzenia przez Jacka (teraz „Un destello de luz” z okładki).

### Podstrona Extracts + GA włączone (2026-10-14)
- Podstrona `/extracts/` (+ `/pl|it|es|ko/extracts/`): 7 fragmentów z Quotes.docx od Jacka (`book/src/extracts.ts`, oryginał EN z podziałem na wersy; w innych językach interfejs przetłumaczony + dopisek, że fragmenty są z wydania angielskiego). Komponent `ExtractsPage.astro`: hero ze światłem, wersy „zapalają się” przy przewijaniu, przyciski Kopiuj (schowek, z podpisem źródła) i Udostępnij (Web Share, tylko gdy przeglądarka wspiera), CTA z okładką. Karta „Extracts” w sekcji materiałów prowadzi teraz na podstronę (`RESOURCES` → `page`).
- GA wydzielone do `components/Analytics.astro` (wspólne dla obu stron). `GA_ID = 'G-GXFTQF41HN'` (od Jacka). Nowe zdarzenia: `resource_open`, `extract_copy`, `extract_share`.
- Build ✓ (25 stron), zrzuty desktop/mobile ✓.

### Google Analytics 4 + baner zgody (2026-10-14)
- `book/src/config.ts` → `GA_ID` (G-XXXXXXXXXX). Puste = brak GA i banera. Tryb „basic”: gtag.js ładuje się dopiero po „Akceptuję” (zgoda w localStorage `acol-consent`); „Odrzucam” = nic nie jest ładowane. Baner w 5 językach (`consent` w słownikach), w stopce link „Ustawienia cookie” otwiera go ponownie.
- Zdarzenia (atrybuty `data-ga`): `order_click` (nav/menu/hero/edition_en), `edition_click` (pl), `luma_click` (pasek/sekcja wydarzeń), `resource_download` (quotes…), `newsletter_click`, `language_switch`; parametry `label`, `link_url`, `page_language`. Do tego Enhanced Measurement GA (odsłony, przewijanie, kliknięcia wychodzące, pobrania).
- Test Playwright z G-TEST: baner widoczny, przed zgodą 0 żądań do googletagmanager, po zgodzie gtag ładowany, zdarzenie order_click trafia do dataLayer, po odświeżeniu bez banera. Czeka na prawdziwy ID od Jacka + push.

### Wydanie hiszpańskie zamiast koreańskiego (2026-10-11)
- Jacek: wydania koreańskiego nie będzie, będzie hiszpańskie. `EDITIONS`: KO usunięte, dodane ES „Un destello de luz. La historia de la misión ICPE” (status „wkrótce”). Wzmianki „Italian and Korean” → „Italian and Spanish” we wszystkich językach (hero note + oś czasu 2026).
- Tytuł ES z okładki: „Un destello de luz” / „La historia de la misión ICPE” (było „Un rayo de luz” — podmienione też w rekomendacjach ES). Okładka ES wycięta z rozkładówki obwoluty → `book/public/img/cover-es.jpg` (624×946); nowa mapa `COVERS` w config.ts (okładka per język, reszta = EN), grzbiet książki 3D pokazuje tytuł w języku strony, og:image per język.
- Wersja językowa KO strony zostaje (nie wiąże się z wydaniem) — do decyzji Jacka. Build ✓.

### Poprawka „Inside the book” (2026-10-11)
- Jacek podał nowe 4 punkty EN (`book/src/i18n/en.ts` → `book.inside`); PL/IT/ES/KO przetłumaczone tak, by znaczyły to samo. Build ✓. Czeka na push (auto-deploy `icpe-book`).

### WDROŻENIE v1: nowy projekt `book/` (Astro, 5 języków) — kod gotowy, czeka na push + Render (2026-10-08)
- **Decyzje (Jacek):** statyczna strona jak icpemission.pl; wszystkie 5 języków na start; KO i IT z istniejących tekstów.
- **Struktura:** `book/` = osobny projekt Astro (nie workspace npm), bez API. Teksty: `book/src/i18n/{en,pl,it,es,ko}.ts`; dane (linki, wydania, wydarzenia, galeria, PDF, newsletter): `book/src/config.ts`; szablon + JS: `book/src/components/BookPage.astro`. Adresy `/`, `/pl/`, `/it/`, `/es/`, `/ko/` + hreflang; przekierowania starych adresów Wix (`/endorsements`, `/gallery`, `/copy-of-…`) na sekcje.
- **Treści:** EN z oryginału (9 rekomendacji, Grech skrócony z „[…]”); PL z naszych tekstów, rekomendacje tylko 2 (jak na /promyk-swiatla); IT z icpebook.org/it (ludzkie tłumaczenie); ES z icpebook.org/es (poprawki); KO z icpebook.org/ko z ujednoliconym tytułem 『한줄기 빛』 i poprawką błędów maszynowych — **KO i części interfejsu IT/ES do sprawdzenia przez native speakerów**. Wydania: EN dostępne, PL premiera (link /promyk-swiatla), IT i KO „wkrótce”; ES bez wydania (tylko język strony).
- **Materiały z Wixa** (pobrane przez przeglądarkę za zgodą Jacka): 38 zdjęć galerii (community 7, outreach 24, events 7), portret Anny, PDF z cytatami → `book/public/img/gallery/` (pełne 1400 px + thumb 640 px), `book/public/img/anna.jpg`, `book/public/files/a-cast-of-light-quotes.pdf`. Oryginały: `book-src-assets/` (gitignored). „Extracts” i „Prayers” — brak plików, karty pokazują „wkrótce”.
- **Newsletter:** `NEWSLETTER_ACTION` puste → przycisk mailto book@icpe.org; po założeniu formularza w Brevo wkleić action.
- **Weryfikacja:** astro check 0 błędów, build 18 stron (5 języków + przekierowania); Playwright: desktop 1440 (EN/PL/KO), mobile 390 (EN/IT) — brak poziomego scrolla, zakładki galerii i lightbox działają. Naprawione w trakcie: `.gal[hidden]` (wszystkie panele galerii były widoczne). Podgląd: artifact „A Cast of Light” (5 języków).
- **Po stronie Jacka:** push → Render ▸ New Static Site `icpe-book` (build `cd book && npm install && npm run build`, publish `book/dist`, env SITE_URL) → domena icpebook.org (instrukcja w `book/README.md`), eksport subskrybentów z Wixa przed rezygnacją.
- Uwaga: w Pobranych zostały ukryte pliki tymczasowe `.Q6L2SF6YDW.com.anthropic.claudefordesktop.*` (pobrania z panelu przeglądarki) — można usunąć.

### Koncepcja + wizualizacja (2026-10-08) — TYLKO PROJEKT, bez kodu w repo
- **Prośba (Jacek):** odświeżona wersja https://www.icpebook.org/ w stylistyce strony /promyk-swiatla; najpierw koncepcja i wizualizacja, potem wdrożenie.
- **Audyt obecnej strony (Wix):** języki EN/ES/IT/KO/PL (maszynowe tłumaczenia), menu: Home/Downloads/About/Contact prowadzą w to samo miejsce; „Extracts" linkuje do Amazona zamiast PDF, „Prayers" bez linku, „Quotes" = PDF; galerie Community/Outreach/Special events (~9 zdjęć archiwalnych każda, adresy copy-of-…); newsletter Wix; w stopce `info@mysite.com`; 9 rekomendacji (pełne teksty EN pobrane).
- **Wizualizacja:** artifact Design „A Cast of Light — nowa strona" (desktop 1440, mobile 390, plansza systemu). Jedna długa strona: pasek premiery PL → hero z okładką 3D → obietnica → o książce (zdjęcie z JPII) → wydania językowe (EN/PL/IT/KO/ES) → droga 1980–2026 → autorka → 9 rekomendacji (przełączane) → galeria z zakładkami → darmowe materiały + newsletter → wydarzenia (Kraków, Luma) → stopka.
- **Otwarte:** gdzie hostować (zostaje Wix vs własny static/Astro), status wydań IT/KO/ES i tytuły, pliki PDF (Extracts/Prayers), zdjęcia galerii w pełnej rozdzielczości, dostawca newslettera, kto tłumaczy wersje językowe.

---

## Dziennik prac — strona książki „Promyk światła"

### Strona /promyk-swiatla + baner premiery (2026-10-05)
- **Cel (Jacek):** jedna dynamiczna strona premium o książce Anny Cappello Favy „Promyk światła. Historia Misji ICPE" (wersja międzynarodowa icpebook.org/pl jest słaba: tłumaczenie maszynowe — np. „Obsada światła", „Sosna szparagowa" zamiast Pino Scafuro) + baner „Premiera polskiej edycji — 16.10.2026 Kraków" z linkiem do Lumy (link później).
- **Pliki:** `site/src/pages/promyk-swiatla.astro` (strona statyczna, wygrywa z `[slug].astro`), `site/src/components/PremiereBanner.astro` (samodzielny baner, sam znika po 16.10; można wstawić też na stronę główną: `<PremiereBanner href="…luma…" />`), `site/src/layouts/LandingLayout.astro` (nowy `<slot name="head" />` i prop `ogImage` — zmiany wstecznie zgodne).
- **Dane do uzupełnienia** — na górze `promyk-swiatla.astro` w obiektach `BOOK` (okładka PL `coverImage`, wydawca, przekład, strony, format, ISBN, `buyUrl`) i `PREMIERE` (`time`, `venue`, `lumaUrl`). Puste pole = „podamy wkrótce" / element ukryty; po wpisaniu `lumaUrl` wszystkie przyciski „Zapisz się na premierę" (baner, nav, hero, sekcja premiery) prowadzą do Lumy.
- **Treść:** opis i bio przepisane na poprawną polszczyznę na podstawie icpebook.org; rekomendacje — **tylko dwie, verbatim od Jacka** (ks. Sławomir Pawłowski SAC, Mary Healy). Oś czasu: lata 80. Malta → 1985 ICPE → kolejne dekady/HopeXchange → 2025 40-lecie → 2026 Kraków. Zdjęcie: `/uploads/462623…_n.jpg` (Anna i Mario) — do podmiany na portret Anny, jeśli będzie.
- **Design:** paleta z okładki (nocna zieleń #0c1a14, światło #f2d48a, jasny papier #f5f1e2), Cormorant Garamond (display, ładowany przez slot head) + Bricolage Grotesque. Dynamika: snop światła + drobinki kurzu (canvas) w hero, książka 3D reagująca na kursor, zdanie-obietnica „zapalające się" przy przewijaniu, wypełniająca się oś czasu, odliczanie do premiery (po dniu premiery → podziękowanie), „Dodaj do kalendarza" (.ics generowany w przeglądarce; całodniowe, dopóki brak godziny). Okładka rysowana w CSS do czasu wgrania prawdziwej. `prefers-reduced-motion` respektowane.
- **Weryfikacja:** `astro check` 0 błędów, `astro build` ✓; Playwright (Chromium) desktop 1440 i mobile 390 — brak poziomego scrolla, zrzuty sekcji OK. Podgląd: artifact „Promyk światła" (claude.ai).
- **Poprawka (Jacek):** oficjalny tytuł wszędzie = „Promyk Światła. Historia ICPE Mission" (hero, okładka CSS, grzbiet, `<title>`/opis, baner, .ics, sekcja „Polskie wydanie" — `BOOK.title/subtitle/fullTitle`). Wyjątek: cytat ks. Pawłowskiego zostaje verbatim („Promyk światła”).
- **Poprawka (Jacek):** przejście ciemna sekcja „obietnica" → jasna „O książce": zamiast 220-px gradientu ostre cięcie z cienką złotą linią i delikatną poświatą (`.dawn`); mniejsze odstępy wokół.
- **Poprawka (Jacek):** mniejsze odstępy wokół przejścia (promise dół 72 px, „O książce" góra 64 px). Zdjęcie od Jacka (Anna i Mario z Janem Pawłem II) w lewej kolumnie „O książce" pod nagłówkiem: `site/public/uploads/promyk-jan-pawel-ii.jpg` (1416×1111, JPEG q84, ~200 KB), pola `BOOK.aboutImage/aboutImageAlt/aboutImageCaption`; desktop: kolumna przyklejona (sticky) przy przewijaniu, mobile: pod nagłówkiem.
- **Poprawka (Jacek):** zdjęcie założycieli w sekcji „Autorka" bez łuku („za katedralnie") — kwadrat 1:1 (całe zdjęcie, bez kadrowania), ta sama ramka co zdjęcie w „O książce", podpis do lewej.
- **Okładka (Jacek):** okładka rysowana w CSS odrzucona — tymczasowo oryginał „A Cast of Light" (skan z Amazona, 986×1500) w `site/public/uploads/promyk-okladka.jpg` (`BOOK.coverImage`); polska okładka będzie 1:1 z polskimi napisami → podmienić plik. Na okładce jest współautor „with A.G. Harmon".
- **Luma:** grafika wydarzenia 1600×1600 `docs/luma-promyk-swiatla-1600.jpg` (styl strony + okładka). Rekomendacje ustawień: motyw Minimalny/ciemny lub Ambient „Bokeh", własny kolor #3E6B4A (alt. #17301F); font tytułu — Ivy Presto źle rysuje polskie znaki (zgłosił Jacek) → testować Ivy Mode, potem Domyślna.
- **Premiera — dane (Jacek):** Luma `https://luma.com/u9vluazp` (wszystkie przyciski „Zapisz się na premierę" + baner), miejsce ul. Dwernickiego 5, Kraków, godz. 18:30–20:30 (z Lumy), nowe pole `PREMIERE.host` = „Lokalna wspólnota ICPE Mission – Eden" (pokazywane w sekcji premiery i w opisie .ics). Odliczanie liczy do 18:30. Oś czasu 2025: dopisane angielskie wydanie książki (wg opisu w Lumie).
- **Stan:** kod w repo, czeka na push (auto-deploy `icpe-site`). Adres: `https://icpemission.pl/promyk-swiatla`. W folderze został `.site-bundle.tgz` (paczka robocza, dodana do .gitignore — można usunąć).

---

## Dziennik prac — panel kursanta (kurs online)

### Automatyczny podział na moduły + przeciąganie materiałów (2026-11-20, 13:30)
- **Prośba Jacka:** kurs „Przygotowanie do Przymierza” ma być sekwencyjny (4 moduły; każdy zaczyna się filmem z numerem w tytule), bez ponownego wgrywania materiałów. Alternatywnie przeciąganie materiałów między modułami. Zrobione oba.
- **„Podziel na moduły automatycznie”** (Zawartość, `AutoSplit`): pojawia się, gdy wśród materiałów bez modułu są ≥2 filmy z liczbą w tytule. Każdy taki film zaczyna moduł (nazwa modułu = tytuł filmu PL/EN), materiały pod nim należą do tego modułu, materiały przed pierwszym filmem zostają bez modułu. Najpierw podgląd, zapis po kliknięciu „Utwórz N modułów”. Ostrzeżenie, gdy numery nie idą po kolei. API: `POST /admin/courses/:id/modules/bulk` `{modules:[{title,itemIds}]}`, z walidacją przed zapisem (materiał spoza kursu albo w dwóch modułach → błąd, bez zmian w bazie). Pliki bez zmian.
- **Przeciąganie (HTML5 drag and drop):** wiersz materiału jest przeciągalny (uchwyt ⋮⋮; wyłączone w trybie edycji i nad polami/listami). Górna połowa wiersza = przed nim, dolna = po nim; puste miejsce modułu = na koniec (także pusty moduł i „Materiały bez modułu”). Linia wstawienia i przerywana ramka modułu. Zapis: `PATCH item {moduleId}` (gdy moduł się zmienił) + `PUT items-order`.
- Weryfikacja: tsc api/app ✓, vite build ✓, testy logiki 48/48 ✓, E2E Chrome na kursie podobnym do „Przymierza” (11 materiałów, 4 filmy „Spotkanie N”) ✓: podgląd → 4 moduły, przeciąganie między modułami / w module / do „bez modułu” ✓.
- **Uwaga przy pushu:** w kopii lokalnej były w tym czasie niezatwierdzone zmiany z innej pracy (rejestracja, locales ko/zh), więc commit tylko na plikach kursów.

### Rozmiar plików kursu + absolwenci (2026-11-20, popołudnie)
- **Rozmiar plików (prośba Jacka):** `CoursesService.storageByCourse()` liczy filmy z plikiem w R2 (`videoSizeMb`) oraz PDF-y (rozmiary `PrivateFile`, obie wersje językowe; bez pobierania treści). Wynik jest w `list()` (każdy kurs: `storage`) i w `get()`. Panel: na liście kursów pasek „Filmy w Cloudflare R2: X z 10 GB darmowych (N%)” (pomarańczowy od 70%, czerwony od 90%, z informacją o kosztach powyżej limitu) i rozmiar przy każdym kursie (ikona dysku, w podpowiedzi podział na filmy i PDF). W kursie, nad Zawartością: „Pliki kursu razem / Filmy: n · GB (% z 10 GB) / PDF: n plików · MB”.
- **Absolwenci (prośba Jacka):** `CourseEnrollment.graduatedAt` (nullable, db push). **Założenie (do potwierdzenia):** absolwent zachowuje dostęp do materiałów; to tylko kategoria porządkowa. Dostęp odbiera się osobno (⊘) albo datą „Dostęp wygasa”. Synchronizacja z eventami nie zmienia `graduatedAt`. „Ukończył kurs” = wszystkie moduły ukończone (bez modułów: wszystkie widoczne materiały); `CourseTrackingService.courseCompletion()`. API: `GET …/enrollments` zwraca `graduatedAt` i `progress {done,total,complete}`; `POST /admin/courses/:id/enrollments/graduate` z `{ids, graduated}` albo `{completed:true}` (wszyscy bieżący, którzy ukończyli). Zakładka Kursanci: przełącznik „Bieżący (n) / Absolwenci (m)”, kolumna Postęp („✓ Ukończył(a)” albo n/m), ikona 🎓 przy wierszu (przy nieukończonym kursie z potwierdzeniem), ↶ „Przywróć do bieżących”, przycisk „Przenieś do absolwentów wszystkich, którzy ukończyli kurs (N)”. Aktywność: dopisek „🎓 absolwent”.
- Weryfikacja: tsc api/app ✓, vite build ✓, testy logiki 47/47 ✓ (nowe: rozmiary, postęp, masowe i ręczne przeniesienie, przywrócenie, absolwent zachowuje dostęp), E2E w Chrome (pasek R2, podsumowanie w kursie, przełącznik, masowe przeniesienie, przywrócenie, ręczne przeniesienie) ✓.
- **Wdrożenie:** push → Manual Deploy `icpe-api` (nowa kolumna `graduatedAt`).

### Hosting wideo: Cloudflare R2 zamiast Bunny + moduły i tryb sekwencyjny (2026-11-20)
- **Powód:** Bunny Stream wyłączył konto po 14-dniowym trialu (brak doładowania salda) i skasował filmy. Bunny nie ma abonamentu, tylko przedpłatę i minimum 1 USD/mies., ale przy zerowym saldzie usuwa dane. **Decyzja Jacka:** Cloudflare R2 (0 zł do 10 GB, bez opłat za transfer i bez salda). Oryginały filmów Jacek ma u siebie; filmy wgrywa ponownie.
- **R2 (`api/src/courses/r2-storage.service.ts`, bez SDK):** podpisy AWS SigV4 liczone ręcznie (`presignUrl`), sprawdzone na przykładzie z dokumentacji AWS i porównane z botocore (PUT części, GET, ListParts, `?uploads`). Wysyłka wieloczęściowa prosto z przeglądarki admina (części po 16 MB, 3 równolegle, podpisane linki PUT z API, plik nie przechodzi przez icpe-api); ETagi przy zakończeniu bierzemy z ListParts. Sprawdzany jest rozmiar pliku po złożeniu. Wznowienie: ten sam plik → API zwraca wgrane części. Podmiana pliku: stary film działa do końca wysyłki nowego, potem jest kasowany. Brak kodowania: film jest gotowy od razu. Czas trwania i miniatura (klatka ~10%, JPEG) liczone w przeglądarce admina, która też ostrzega, gdy plik się nie odtworzy (np. HEVC z iPhone’a). Kursant: zwykły `<video>` z podpisanym linkiem GET (6 h), przy wygaśnięciu strona pobiera nowy link i wraca do tego samego miejsca. Postęp oglądania z `timeupdate` (zamiast Bunny Player.js). Przycisk „Napraw ustawienia wysyłki (CORS)” ustawia regułę CORS bucketu przez API, a gdy token nie ma uprawnień, pokazuje instrukcję.
- **Model:** `CourseItem.videoKey`, `videoSizeMb`, `uploadId`, `uploadKey`, `thumbKey`, `moduleId`; `Course.sequential`; nowe tabele `CourseModule` (title PL/EN, opis, order) i `CourseItemCompletion` (itemId+guestId unikalne, source MANUAL|VIDEO|PDF). Stare `videoId` (Bunny) zostaje tylko po to, by oznaczyć film do ponownego wgrania (`legacyVideo`). Usunięte: `bunny-stream.service.ts`, webhook `/webhooks/bunny-stream`, `app/src/lib/tusUpload.ts`.
- **Moduły i tryb sekwencyjny (decyzje Jacka):** moduł = grupa materiałów; ukończenie materiału automatycznie (film ≥90%, PDF otwarty lub pobrany) albo przyciskiem „Oznaczam jako ukończone”. Logika w `course-progress.ts`: moduł jest ukończony, gdy ma ≥1 widoczny materiał i wszystkie widoczne są ukończone. W trybie sekwencyjnym moduł N+1 otwiera się po ukończeniu N. Materiały bez modułu są zawsze dostępne. Moduł bez żadnego widocznego materiału blokuje kolejne (bo „oko” służy też do ukrywania materiałów w przygotowaniu). Film „wkrótce dostępny” blokuje do czasu wgrania i nie da się go oznaczyć ręcznie. Kursant widzi tylko najbliższy zablokowany moduł (nazwa + kłódka) i licznik „Jeszcze N kolejne moduły”. API zwraca **409** dla materiału z zablokowanego modułu (play/PDF/complete), nie 403, bo strona traktuje 403 jako wylogowanie. Podgląd admina: wszystko otwarte, nic się nie zapisuje.
- **Panel:** Zawartość = sekcja „Materiały bez modułu” + panel każdego modułu (zmiana nazwy PL/EN, opis, kolejność, usunięcie; materiały wtedy przechodzą do „bez modułu”), wybór modułu przy materiale i w formularzach dodawania. Ustawienia ▸ „Kolejność przechodzenia” ▸ przełącznik trybu sekwencyjnego. Aktywność: kolumna „Moduły N/M”, ✓ przy ręcznym ukończeniu, CSV z nowymi kolumnami. Endpointy: `POST /admin/courses/:id/items/video` (+size, contentType, moduleId), `POST …/items/:itemId/upload` (wznowienie/podmiana), `…/upload/parts`, `…/upload/complete`, `DELETE …/upload`, `POST …/thumbnail`, `POST /admin/courses/video-cors`, moduły `POST/PATCH/DELETE /admin/courses/:id/modules[/:mid]`, `PUT …/modules-order`; kursant `POST /member/courses/:slug/items/:itemId/complete` (zwraca odświeżony kurs).
- **Weryfikacja (kopia repo w chmurze):** tsc api ✓, tsc app ✓, vite build ✓, astro check 0 błędów ✓, astro build ✓; smoke test DI (cały AppModule) ✓; **42 testy logiki** (fake Prisma + fake R2): sekwencja, 409, ukończenia z 3 źródeł, podgląd admina, kursy bez modułów, raport/CSV, upload (części, brakująca część, wznowienie, zły rozmiar, podmiana, przerwanie), moduły, błędy R2/CORS ✓. **E2E w Chrome** (atrapa API + atrapa R2 na innym originie): panel (blokada CORS → naprawa → wznowienie → 2 części → miniatura → „Gotowy”, przełącznik w Ustawieniach) ✓; strona kursanta (kłódka, `<video>` z Range/przewijaniem, postęp, odblokowanie po PDF z komunikatem, 409, „Oznaczam jako ukończone”, EN, telefon bez poziomego scrolla, podgląd admina) ✓. **Nie testowane na żywo:** prawdziwe R2 (sandbox nie ma dostępu do Cloudflare).
- **Wdrożenie:** push → **Manual Deploy `icpe-api`** (db push: nowe tabele i kolumny), frontend i strona zbudują się same. **Konfiguracja Cloudflare R2 (Jacek):**
  1. dash.cloudflare.com ▸ R2 Object Storage ▸ włączyć R2 (może poprosić o kartę, ale w darmowym limicie nic nie pobiera) ▸ **Create bucket**, np. `icpe-kursy`, lokalizacja *Automatic* (albo „EU jurisdiction” → wtedy też `R2_ENDPOINT`). Bucket zostaje **prywatny** (bez Public access).
  2. R2 ▸ **Manage API tokens** ▸ Create API token ▸ uprawnienie **Admin Read & Write** (wtedy przycisk w panelu sam ustawi CORS) albo „Object Read & Write” tylko dla tego bucketu (wtedy CORS ręcznie, pkt 4) ▸ skopiować **Access Key ID** i **Secret Access Key** (sekret pokazuje się tylko raz).
  3. Render ▸ `icpe-api` ▸ Environment: `R2_ACCOUNT_ID` (R2 ▸ Overview ▸ Account ID), `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` → Save → Manual Deploy. Zmienne `BUNNY_STREAM_*` można usunąć.
  4. Panel ▸ Formacja online ▸ „Napraw ustawienia wysyłki (CORS)”. Gdy się nie uda: bucket ▸ Settings ▸ CORS Policy ▸ `[{"AllowedOrigins":["*"],"AllowedMethods":["GET","HEAD","PUT"],"AllowedHeaders":["*"],"ExposeHeaders":["ETag","Content-Length","Content-Range"],"MaxAgeSeconds":3600}]` (dostęp i tak tylko przez podpisane linki).
  5. Ponowne wgranie filmów: przy filmach oznaczonych „Film był na starym hostingu (Bunny)” → ikona wysyłania → plik MP4 (H.264, 720p/1080p). Potem ▶ „Sprawdź odtwarzanie” i Podgląd jako kursant.
- **Poprawka (2026-11-20, po wdrożeniu):** podpowiedź w panelu pokazywała „icpemission.pl/formacja//nazwa-kursu” (podwójny ukośnik): `config().siteCourseBase` obcinało tylko jeden końcowy „/”. Teraz `.replace(/\/+$/, '')`.
- **Stan wdrożenia (2026-11-20, 12:08):** wdrożone; R2 skonfigurowane (4 zmienne na Renderze). CORS ustawiony **ręcznie** w Cloudflare (token nie ma uprawnień do ustawień bucketu, więc przycisk w panelu go nie ustawi — to normalne przy tym tokenie). Wysyłka filmów działa; Jacek wgrywa ponownie filmy z Bunny.
- **Do rozważenia:** maile „Nowe materiały” w trybie sekwencyjnym idą do wszystkich kursantów, także tych, którzy dany moduł mają jeszcze zablokowany (zobaczą go po odblokowaniu). Polityka prywatności: odbiorca danych wideo to teraz Cloudflare (R2), nie Bunny.net.

### Publikacja stopniowa: jeden mail na paczkę materiałów (2026-10-03)
- Pytanie usera: film + PDF ustawione na 12:00 — czy pójdzie jeden mail, czy dwa? **Stan sprawdzony testem:** przy TEJ SAMEJ godzinie już było dobrze — `releaseDue` grupuje wszystkie zaległe materiały kursu w jednym przebiegu → 1 mail na osobę z obiema pozycjami (także przy 3 równoległych wyzwalaczach i drugiej instancji API podczas deployu — chroni „zajęcie" `updateMany … releaseNotifiedAt: null`).
- **Luka znaleziona i naprawiona:** materiały kilka minut od siebie (np. 12:00 i 12:05) dawały 2 maile. Teraz `course-release.service.ts`: jeśli w kursie kolejny materiał publikuje się w ciągu ≤ 10 min (`GROUP_WINDOW_MS`), mail czeka i wychodzi raz, z ostatnim materiałem paczki; limit opóźnienia 30 min (`MAX_HOLD_MS`) dla łańcuchów publikacji. Materiały i tak pojawiają się punktualnie (filtr przy odczycie) — opóźnia się tylko mail. Odległe godziny (12:00 i 18:00) → osobne maile bez opóźnień.
- Testy (`batch`): ta sama godzina + 3 wyzwalacze + druga instancja → 1 mail/osobę ✓; 12:00 i 12:05 → 1 wspólny mail o 12:05 ✓; 12:00 i 18:00 → 2 maile ✓; łańcuch co 8 min → mail najpóźniej po 30 min ✓; poprzednie zestawy + smoke test DI ✓. Wymaga push + Manual Deploy `icpe-api` (bez zmian schematu).

### FIX deployu: brak NotificationsModule w CoursesModule (2026-09-29)
- Render: `Nest can't resolve dependencies of the CourseReleaseService (PrismaService, ?)` — nowa usługa publikacji wstrzykuje `NotificationsService`, a `CoursesModule` nie importował `NotificationsModule` (CourseAccessModule ma go u siebie, ale nie re-eksportuje). Fix: `imports: [AuthModule, ContentModule, NotificationsModule]` w `api/src/courses/courses.module.ts`. Baza zdążyła się zsynchronizować (db push OK) — nic więcej do naprawy.
- **Lekcja / nowa weryfikacja:** testy logiki tworzyły serwisy ręcznie, więc nie łapały błędów DI. Od teraz przed oddaniem backendu: **smoke test DI** — złożenie całego `AppModule` przez `NestFactory.create` z zaślepionym `PrismaService.onModuleInit` (bez bazy). Sprawdzone: z fixem przechodzi, bez fixa wywala dokładnie ten błąd.

### Publikacja stopniowa („incremental publishing") + mail „Nowe materiały" (2026-09-29)
- **Wymóg usera:** wgrywa materiały wcześniej, ustawia datę i godzinę — materiał sam pojawia się w panelu kursanta, a uczestnicy dostają wtedy maila „Nowe materiały czekają na Ciebie w panelu formacyjnym".
- **Model:** `CourseItem.publishAt` (DateTime?), `releaseNotifiedAt` (DateTime?), `releaseMails` (Int? — ilu osobom wysłano). Nowe nullable kolumny → `db push`.
- **Widoczność** liczona przy odczycie: kursant widzi `published && (publishAt null || publishAt <= teraz)` — materiał pojawia się punktualnie nawet gdy serwer spał; `play`/`file` też to egzekwują. Podgląd admina widzi zaplanowane z dopiskiem „Zaplanowane na … — kursanci jeszcze tego nie widzą" (`scheduledAt`).
- **Maile:** `api/src/courses/course-release.service.ts` — `releaseDue()`: materiały z `publishAt <= teraz` i `releaseNotifiedAt null`, grupowane per kurs, najpierw „zajęcie" (updateMany → brak duplikatów), potem mail `COURSE_NEW_MATERIALS` (PL/EN wg konta, lista tytułów, przycisk „Przejdź do panelu formacyjnego", dla kont bez hasła podpowiedź „Nie pamiętam hasła") do aktywnych kursantów; 600 ms odstępu (limit Resend). Kurs-szkic / po `accessUntil` → materiał oznaczony, bez maili. Data ustawiona w przeszłości = „od razu", bez maila; zmiana daty = nowe powiadomienie; ta sama data przy edycji tytułu = bez zmian.
- **Wyzwalacze:** co 60 s w procesie API; przy wejściu do kursu (`kick`, max raz/30 s); **`GET /cron/course-releases`** (opcjonalnie `?key=` gdy ustawiony `CRON_SECRET`) — do podpięcia w UptimeRobot co 5 min (budzi uśpiony Render, więc mail wyjdzie o czasie). Zaplanowanie materiału w przyszłość woła `resumeUptimeMonitor()`.
- **Panel:** pole „Publikacja" (datetime-local, czas lokalny przeglądarki = Warszawa) w „Dodaj film", „Dodaj PDF" i edycji materiału (+ „publikuj od razu"); znacznik „⏱ Zaplanowany: …" (z uwagą, gdy kurs jest szkicem) albo „opublikowany … · mail wysłany do N osób". MailSettings: etykieta „Kurs: nowe materiały".
- Testy: logika (fake Prisma z lte/gte) — ukrycie przed czasem, podgląd admina, brak zdarzeń przed czasem, 1 materiał → 2 maile PL/EN, brak duplikatów, data wsteczna bez maila, edycja daty, zła data, kurs-szkic bez maili, treść maila ✓; poprzednie zestawy ✓; tsc api/app ✓; astro check 0 błędów ✓; zrzut panelu (mock) ✓.
- **Po pushu:** Manual Deploy `icpe-api`. Zalecane: UptimeRobot — monitor HTTP(s) na `https://icpe-api.onrender.com/cron/course-releases` co 5 min (jeśli ustawisz CRON_SECRET, dopisz `?key=…`).

### Diagnoza odtwarzania — poprawka fałszywego „OK" (2026-09-28)
- Objaw u usera: „Sprawdź odtwarzanie" pokazało zielone OK, a kursant nadal widzi 403; jednocześnie przy Konferencji 1 panel pokazuje „Bunny Stream odrzucił żądanie (401)" → klucz API przestał działać (wcześniej działał — Konferencja 2 zdążyła przejść w READY). Hipoteza: przy poprawianiu ustawień zamienione `BUNNY_STREAM_API_KEY` ↔ `BUNNY_STREAM_TOKEN_KEY` (tłumaczy 401 + 403). Przekazano userowi tabelę: API_KEY = zakładka API ▸ API Key; TOKEN_KEY = Security ▸ Token authentication key; LIBRARY_ID = zakładka API.
- Przyczyna fałszywego OK: strona błędu Bunny („403"/„404") bywa zwracana z HTTP 200. `diagnosePlayback` ocenia teraz `<title>` (sama liczba = błąd), dodatkowo otwiera celowo źle podpisany link (kontrola, czy zabezpieczenie działa) i sprawdza klucz API (GET video → 401 = zły klucz). Komunikaty dla: działa / token auth wyłączony / brak TOKEN_KEY / zła domena / zły klucz podpisu / zły klucz API. Panel: „Szczegóły techniczne" (JSON) pod wynikiem. Test 6 scenariuszy ✓.
- Ograniczenie: jeśli Bunny sprawdza domenę po stronie przeglądarki (JS w odtwarzaczu), test serwerowy tego nie wykryje — wtedy test ręczny: tymczasowo wyczyścić „Allowed domains".

### Film: błąd 403 z Bunny + przycisk „Sprawdź odtwarzanie" (2026-09-28)
- Zgłoszenie usera: zakodowany film w odtwarzaczu na stronie kursu pokazuje ekran Bunny „403" (Bunny odrzuca embed). Kod podpisu zgodny z dokumentacją (`sha256hex(tokenKey + videoId + expires)`, parametry `token`/`expires`) — przyczyna po stronie konfiguracji: (1) `BUNNY_STREAM_TOKEN_KEY` pusty lub inny niż „Token authentication key" z Security biblioteki (częsta pomyłka: wklejony „API Key"), albo (2) „Allowed domains" bez `icpemission.pl` / wpisane z https:// i ukośnikiem.
- Nowe: przy gotowym filmie w panelu ikona ▶ „Sprawdź odtwarzanie" → `POST /admin/courses/:id/items/:itemId/diagnose` → `BunnyStreamService.diagnosePlayback()`: serwer otwiera embed Bunny w 3 wariantach (podpisany z Referer `PUBLIC_SITE_URL`, podpisany bez Referer, niepodpisany z Referer) i wskazuje przyczynę po polsku (brak klucza / zła domena / zły klucz / OK). Test logiki 4 scenariuszy ✓, poprzednie zestawy ✓, tsc api/app ✓, vite build ✓.
- Status: czeka na sprawdzenie ustawień przez Jacka (Security biblioteki Bunny + zmienna na Renderze) i na push + Manual Deploy `icpe-api`.

### Panel: postęp kodowania filmu na żywo (2026-09-28)
- Pytanie usera: czy „Kodowanie…" samo się zmieni — TAK: edytor co 10 s pobiera kurs, a API przy tym odpytuje Bunny (GET video) i zapisuje stan (READY → zielone „Gotowy", miniatura, czas trwania). Działa tylko przy otwartym edytorze; bez niego stan aktualizuje webhook Bunny albo najbliższe otwarcie kursu w panelu.
- Mapowanie statusów Bunny zweryfikowane z dokumentacją Get Video: 0 Created, 1 Uploaded, 2 Processing, 3 Transcoding, 4 Finished, 5 Error, 6 UploadFailed, 7 JitSegmenting, 8 JitPlaylistsCreated (+ `encodeProgress` 0–100, `availableResolutions`).
- Nowe: `courses.service.get()` zwraca per film `live` = `{ encodeProgress, rawStatus }` albo `{ error }` (gdy zapytanie do Bunny się nie uda — np. zły klucz API); panel pokazuje „kodowanie N% · odświeża się samo co 10 s" albo czerwony komunikat błędu. Pliki: `courses.service.ts` (refreshVideoWithInfo), `app/src/lib/courses.ts`, `CourseContentTab.tsx`. tsc api/app ✓, vite build ✓, testy logiki ✓.

### Zaślepka „Film będzie wkrótce dostępny" (2026-09-28)
- `member.service.ts`: kursant widzi też opublikowane filmy w trakcie wysyłki/kodowania (`videoId` jest, stan ≠ READY) z flagą `pending: true`; `play` dla nich nadal zwraca 404.
- Strona (`course-app.ts`, `CourseApp.astro`): nieklikalna karta z paskowanym tłem i napisem „Film będzie wkrótce dostępny" / „Video will soon be available" (PL/EN); gdy jest jakakolwiek zaślepka — ciche odświeżenie listy co 60 s (tylko przy widocznej karcie), więc film pojawia się sam po zakodowaniu. Chcąc ukryć film do czasu publikacji — przełącznik „oko" przy materiale w panelu.
- Testy: logika (kodowany film jako zaślepka, play odrzucony) + wszystkie poprzednie zestawy ✓; Chromium: zaślepka PL/EN, nieklikalna ✓; tsc api ✓, astro check/build ✓. Wymaga Manual Deploy `icpe-api` + auto-deploy strony.

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

### Zamykanie eventów: automat 7 dni po końcu + przycisk „Zamknij / Otwórz ponownie" (2026-10-06)
- **Problem (Jacek):** event sprzed miesiąca wisiał jako otwarty i nie dało się go przenieść do „Poprzednich" w Personal OS. Przyczyna: status instancji zmieniał się tylko przy tworzeniu (OPEN/DRAFT) — nic go nie zamykało, a panel nie miał przycisku. `endsAt` / `registrationClosesAt` nie zmieniają statusu.
- **Decyzja (Jacek):** automatyczne zamykanie z buforem **7 dni** po `endsAt`.
- **Backend (`api/src/events/events.service.ts`):** `closeExpired()` — OPEN z `endsAt` < teraz − 7 dni → `CLOSED`. Uruchamiane 20 s po starcie, co godzinę oraz „szturchnięciem" przy `GET /admin/instances` i `GET /events` (max raz na 5 min — działa też po uśpieniu Rendera). Stała `AUTO_CLOSE_DAYS`.
- **Ręczne otwarcie:** `PATCH /admin/instances/:id` z `status: 'OPEN'` dla zamkniętego eventu ustawia nowe pole `EventInstance.reopenedAt` (Prisma, nullable → `db push`) i wznawia UptimeRobota; automat nie zamyka eventu ponownie, jeśli otwarto go po upływie terminu. Walidacja statusu (DRAFT/OPEN/CLOSED/ARCHIVED).
- **`findBySlug` fallback:** brak instancji OPEN → zwraca ostatnią instancję serii z prawdziwym statusem (wcześniej 404 → front pokazywał MOCK_INSTANCE, a edytor eventu nie mógł wczytać zamkniętego eventu). Publiczny lejek pokazuje ekran „zapisy zamknięte" (`LandingScreen` już to obsługiwał). `/r/:slug/config` zwraca też `status`.
- **Blokady API:** `POST /registrations` i `POST /rsvp` odrzucają instancję ≠ OPEN (403 „Zapisy na to wydarzenie są już zamknięte.").
- **Panel (`EventsScreen.tsx`):** w wierszu eventu przycisk „Zamknij" (OPEN) / „Otwórz ponownie" (pozostałe) z potwierdzeniem; `UpdateInstancePayload.status`.
- **Weryfikacja:** `app` tsc + vite build OK; `api` nest build OK poza znanym błędem wynikającym z braku wygenerowanego klienta Prisma (sandbox blokuje pobranie silnika Prismy — 403). Zapytania z `reopenedAt` sprawdzi dopiero build na Renderze.
- **Po pushu: Manual Deploy `icpe-api`** (nowa kolumna `reopenedAt`) + auto-deploy frontu. Stary otwarty event zamknie się sam ~20 s po starcie API.

### Wspólne rozpoznawanie języka gościa: PL → PL, IT → IT, każdy inny → EN (2026-10-06)
- **Decyzja (Jacek):** przy każdym języku przeglądarki innym niż polski i włoski domyślny ma być angielski (wcześniej fallback był PL); automatyczny język także na stronie głównej i w formacji online.
- **Reguła** (`app/src/lib/langPref.ts`, kopia `site/src/scripts/lang-pref.ts`, wersja inline w `site/src/pages/index.astro` — zmieniać wszystkie trzy): `?lang=xx` (zapisywane) → zapamiętany ręczny wybór → pierwszy obsługiwany język z `navigator.languages` → EN. Przykłady: `de` → EN, `it` → IT tylko gdzie jest wersja włoska (event z IT), inaczej EN; `de, pl` → PL; `en-US, pl` → EN.
- **Pamięć wyboru:** cookie `icpe_lang` na `.icpemission.pl` (wspólne dla icpemission.pl i rejestracja.icpemission.pl, 1 rok) + localStorage. Ręczne kliknięcie PL/EN/IT gdziekolwiek obowiązuje też na pozostałych stronach. Wybór niedostępny na danej stronie (np. IT na stronie głównej) → reguła przeglądarki.
- **Rejestracja (app):** `i18n.ts` startuje od razu z `resolveLang(['pl','en'])` (bez mignięcia PL; dotyczy też `/` — PublicHome); `LanguageSwitch` po wczytaniu języków eventu → `resolveLang(langs)`, klik → `saveLang`. Panel admina nie używa i18n — bez zmian.
- **Strona główna:** skrypt inline zaraz po `#site-root` ustawia `data-lang` przed renderem treści (bez mignięcia), `window.__icpeSaveLang` zapisuje klik PL/EN.
- **Formacja (`course-app.ts`):** start z `resolveLang(['pl','en'])`; stary klucz `icpe_course_lang` przeniesiony do wspólnej pamięci i usunięty; `setLang(l, persist)` — zapis tylko przy kliknięciu.
- **Strona główna i formacja nie mają wersji IT** → Włoch widzi EN. Wersja IT wymagałaby przetłumaczenia całej treści strony (+ pola CMS).
- Testy: tsc app ✓, vite build ✓, astro check 0 błędów ✓, astro build ✓; Chromium z podmienionym `navigator.languages`: strona główna i formacja (pl/de/it/es/„de,pl"/„en-US,pl") ✓, zaproszenie (event PL-only i z IT; pl/de/it/ko) ✓, ręczny wybór PL na stronie głównej → zaproszenie po PL → przełączenie na EN w zaproszeniu → strona główna i formacja EN ✓, `?lang=en` ✓.
- Wdrożenie: push → auto-deploy `icpe-frontend` i `icpe-site`; backend bez zmian.

### Wersje językowe treści eventu w edytorze: zawsze PL+EN, miejsce i imiona gości tłumaczalne (2026-10-05)
- **Zgłoszenie (Jacek, zrzut zaproszenia EN):** interfejs strony był po angielsku, ale program, opis gości i miejsce zostawały po polsku. **Przyczyna:** strony publiczne zawsze oferują PL i EN (`LanguageSwitch.ALWAYS`), a edytor pokazywał zakładki „Język treści” tylko gdy w „Języki strony” zaznaczono >1 język — przy evencie z samym PL nie było gdzie wpisać EN. Miejsce i imiona gości były w ogóle jednojęzyczne.
- **Edytor (`EventEditForm.tsx`):** zakładki PL / EN zawsze (+ IT, gdy zaznaczony); PL i EN w „Języki strony” na stałe zaznaczone (zapisywane w `locales`). Pasek języka: licznik brakujących tłumaczeń na zakładce + lista „Do przetłumaczenia: …” (nazwa, opis, nadtytuł, program, opis gości, pokoje). W zakładce EN/IT puste pole pokazuje polski oryginał jako podpowiedź (`PL: …`). Nadtytuł w EN/IT = zwykłe pole tekstowe (gotowe nadtytuły są po polsku).
- **Miejsce:** `customFields.locationI18n = { pl: <wersja PL, z której tłumaczono>, en?, it? }`; kanoniczne `EventInstance.location` (PL) bez zmian — z niego korzystają .ics i maile. `eventLocation(location, customFields, lng)` w `lib/api.ts` zwraca tłumaczenie tylko gdy `locationI18n.pl === location` → po zmianie adresu PL nieaktualne tłumaczenie samo przestaje się wyświetlać (strona pokazuje PL); w edytorze ostrzeżenie „Miejsce po polsku zmieniło się…” + „Tłumaczenie jest aktualne”. Podpięte w `LandingScreen`, `InviteMatchScreen`, `InviteConfirm` (RsvpScreen/GuestInvitePage/PublicHome nie dostają customFields → PL).
- **Goście specjalni:** `specialGuest.name` może być mapą językową (stare stringi nadal działają; backend/site tego pola nie czytają). `EventContentBlocks` → `pickLang`.
- `pickLang`: pusta wersja językowa traktowana jak brak (fallback do PL). `LandingScreen`: nagłówek popupu „Program” przez `t('content.program')`.
- **Bez zmian backendu** (customFields to wolny JSON, `whitelist:false`) → wystarczy push (auto-deploy `icpe-frontend`).
- Testy: `tsc` app ✓, `vite build` ✓; Chromium z mockiem API: zakładka EN widoczna przy evencie z samym PL, licznik „4”, podpowiedzi PL, zapis → `customFields` z mapami EN + `locationI18n` + `locales: [pl,en]`; strona `/i/:token` po EN: program, miejsce, imiona i opis gości po angielsku, po PL bez zmian; `eventLocation` — aktualne/nieaktualne tłumaczenie/brak ✓.
- **Nadal po polsku:** treść maili z zaproszeniem (`notifications.service.ts` — szablony tylko PL) i kreator nowego eventu (`EventWizard` — jednojęzyczny; tłumaczenia dodaje się w edycji).

### WDROŻENIE: goście potwierdzeni przez organizatora + rodzina jednym rekordem + odmowy (2026-10-02) — kod gotowy, czeka na push
**Decyzje usera (Q1–Q7, wiążące):** gość może zmienić skład; mail domyślnie z checkboxem rezygnacji; bez e-maila małżonka; przypomnienie o diecie ręcznym przyciskiem; po starcie eventu gość nie zmienia odpowiedzi; **odmowa „Nie damy rady przyjść” dla wszystkich zaproszonych**; masowe dodawanie w panelu i w kreatorze. Spec: `docs/14-plan-potwierdzeni-przez-admina.md` (sekcja 12 = decyzje).
- **Prisma `Invitation`:** `confirmedBy` ('GUEST'|'ADMIN', null przy potwierdzonym = GUEST), `guestRespondedAt`, `declinedAt`, `adminNote` (wszystko nullable → db push). `childrenJson[].dietary` (bez migracji).
- **Backend (`invitations.service.ts`):** helpery `invitationStatus`, `confirmedByOf`, `dietStatusOf` (PROVIDED/NONE/UNKNOWN), `eventStarted`, `householdData`/`householdError`, `composeDietaryNotes` (diety per osoba: „Jan: … | Anna: … | Ola: …”; sama dieta gościa = sam tekst jak dotąd). Nowe: `createConfirmed` (konflikty SAME_PERSON_PENDING/CONFIRMED, SPOUSE_ON_LIST, PERSON_IS_SPOUSE — także w obrębie jednej partii; flagi `confirmExisting`, `ignoreWarnings`), `confirmByAdmin` (Potwierdź ręcznie / Edytuj skład; mail tylko dla ADMIN), `unconfirm`, `declineByAdmin`, `declineByToken`, `sendDietReminders`. Zmiany: `confirmByToken` (blokada po starcie, `guestRespondedAt`, czyści odmowę, zachowuje ADMIN), `declarationData` (dieta małżonka bez zmiany składu), `matchBySlug` (ADMIN → bez nadpisania, ponowny mail z linkiem, `alreadyConfirmed`), `remove`/odmowa/cofnięcie → zgłoszenie **CANCELLED** (wcześniej usunięte zaproszenie zostawiało zgłoszenie w Zgłoszeniach/Obecności), `resendAll` pomija odmowy i potwierdzonych przez gościa, szablon maila wybierany z rekordu (`INVITE_PRECONFIRMED` dla ADMIN), podgląd z `preconfirmed`+`household`. `syncRegistration` publiczne + dieta dziecka do `Participant.dietary`. Guest-invites: status `DECLINED` na liście gości uczestnika.
- **Endpointy:** `POST /admin/instances/:id/invitations/confirmed`, `POST /admin/invitations/:id/confirm|unconfirm|decline`, `POST /admin/instances/:id/invitations/diet-reminders`, `POST /invite/:token/decline`.
- **Mail `INVITE_PRECONFIRMED`** (`notifications.service.ts`, `preconfirmedEmail` + `lat(n)`): warianty Ty/Wy/Państwo, „Jan i Anna,”, lista osób z wiekiem, notatka, przycisk „Podaj wymagania żywieniowe” (w mailu brak linków zmieniających dane — skanery poczty), sekcja „Zaproś gościa”, zdanie o danych + opcjonalny `PRIVACY_POLICY_URL` (nowy ENV, `sync:false` w `render.yaml`), wariant przypomnienia. MailSettings: etykieta.
- **Strona `/i/:token` (`InviteConfirm.tsx`, przepisana):** stany: potwierdzony przez organizatora (karta „Jesteś/Jesteście na liście gości” + od razu otwarte pola diety przy każdej osobie, „Zapisz” / „Nikt z nas nie ma wymagań”), po odpowiedzi (podsumowanie diet, „Zmień wymagania”, „Coś się zmieniło w składzie?”), odmowa (karta + „Jednak przyjdę”), czeka (formularz + „Nie dam rady przyjść”), wydarzenie trwa (tylko odczyt). Dieta dziecka w formularzu (też w `InviteMatchScreen`, który obsługuje `alreadyConfirmed`). i18n pl/en/it: klucze `invite.pre_*`, `diet_*`, `decline_*`, `declined_*`, `started_*`, `guest.status_declined`.
- **Panel (`InvitedGuestsSection.tsx` + nowe `HouseholdEditor.tsx`, `lib/households.ts`):** przełącznik „Zaproś (gość potwierdza) | Dodaj jako potwierdzonego” (pamiętany w sessionStorage), skład Osoba/Małżeństwo/Rodzina z podpowiedzią „= N posiłków”, „Zamień osobę główną z małżonkiem”, okno konfliktów (Potwierdź istniejące / Usuń osobny rekord i dodaj rodzinę / Dodaj mimo to), „Wklej listę” z podglądem i błędami wierszy; wiersz: badge Potwierdzony · organizator / Nie przyjdzie, diety per osoba, chip „dieta: czeka na odpowiedź” / „bez wymagań ✓”, notatka, akcje Potwierdź ręcznie / Edytuj skład i diety / Cofnij potwierdzenie|odmowę / Nie przyjdzie; baner „Diety nieznane: N” + „Przypomnij o diecie”; licznik „Nie przyjdzie: N”; treść WhatsApp/iMessage dla potwierdzonych. Kreator (`EventWizard.tsx`): pole „Uczestnicy od razu potwierdzeni” + checkbox maila; ekran sukcesu oznacza potwierdzonych i pominięte duplikaty.
- **Handoff Personal OS:** `docs/15-prompt-personal-os-potwierdzeni.md`.
- **Weryfikacja (kontener, kopia repo):** tsc api ✓ / app ✓, `prisma validate` ✓, `vite build` ✓; testy logiki na atrapie Prisma **24/24** (rodzina → zgłoszenie z 4 uczestnikami i dietami, konflikty, dieta bez zmiany składu, NONE/UNKNOWN, zmiana składu, odmowa↔potwierdzenie, blokada po starcie, dopasowanie bez nadpisania, Potwierdź ręcznie, CANCELLED przy usunięciu/cofnięciu/odmowie, wybór szablonu w „Wyślij niewysłane”, przypomnienia, podgląd, 6 wariantów maila + escapowanie); **smoke test DI** (cały AppModule) ✓; Chromium E2E na atrapie API z prawdziwą logiką serwisu: panel (11 scenariuszy) + strona gościa (telefon 390 px, bez poziomego scrolla, PL/EN, 7 scenariuszy) + stan „wydarzenie trwa” ✓.
- **Po pushu:** **Manual Deploy `icpe-api`** (4 nowe kolumny). Opcjonalnie ustaw `PRIVACY_POLICY_URL` w Render ▸ icpe-api ▸ Environment. Polityka prywatności: dopisać, że organizator może wpisać dane uczestnika i rodziny (w tym wymagania żywieniowe). Test: dodaj siebie z rodziną jako potwierdzonego → mail → link → dieta → licznik i Zgłoszenia.
- Nieprzetestowane na żywo: realna baza Render i wysyłka przez Resend.

### PROJEKT: goście dodani przez admina jako od razu potwierdzeni (2026-10-02) — TYLKO PLAN, bez zmian w kodzie
- Prośba usera: admin dodaje uczestników eventu INVITE bez zaproszenia, od razu potwierdzonych; dostają mail „udział potwierdzony, opcjonalnie podaj dietę”; po wejściu w link widzą, że są potwierdzeni; małżeństwo/rodzina jednym rekordem.
- Spec: `docs/14-plan-potwierdzeni-przez-admina.md` (też w Projekcie: `plany/14-plan-potwierdzeni-przez-admina.md`).
- Rdzeń: ten sam `Invitation` (już jest modelem gospodarstwa: małżonek + dzieci) + `confirmedBy` ('GUEST'|'ADMIN'), `guestRespondedAt` (status diety PROVIDED/NONE/UNKNOWN — odróżnia „brak wymagań” od „nie odpowiedział”), `adminNote`; dieta per dziecko w `childrenJson`. Nowe: `POST /admin/instances/:id/invitations/confirmed` (z raportem konfliktów, m.in. małżonek już na liście), `POST /admin/invitations/:id/confirm|unconfirm`, `POST …/diet-reminders`; mail `INVITE_PRECONFIRMED` (Ty/Wy/Państwo). Szablon wybierany z rekordu, więc „Wyślij niewysłane” nie wyśle potwierdzonym zaproszenia.
- Znalezisko przy okazji: `remove()` zaproszenia zostawia `Registration` (rodzina wisi w Zgłoszeniach/Obecności) — w planie: CANCELLED przy usunięciu/cofnięciu.
- Otwarte decyzje Q1–Q7 w sekcji 12 specu (m.in. czy gość może zmienić skład, czy mail domyślnie, drugi e-mail małżonka). Następny krok: akceptacja → E1 backend.

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


### 2026-11-25 — licznik wolnych miejsc na landingu
- Bug: landing pokazywał „100 wolnych miejsc z 100" mimo zapisów. Przyczyna: `GET /r/:slug` (`EventsService.findBySlug`) zwracał surową instancję bez `registeredCount`, a `LandingScreen` liczy `capacity − (registeredCount ?? 0)`.
- Fix (tylko API): `findBySlug` dokłada `registeredCount` = zajęte miejsca z nowej metody `takenSpots()` — suma **uczestników** (osób, min. 1 na zgłoszenie) zgłoszeń o statusie innym niż `CANCELLED`/`WAITLIST`. Front bez zmian.
- Wdrożenie: push + Manual Deploy `icpe-api`.

---

## Powiązane dokumenty
- `docs/14-plan-potwierdzeni-przez-admina.md` — spec: goście potwierdzeni przez admina, rodzina jednym rekordem, odmowy (wdrożone 2026-10-02).
- `docs/15-prompt-personal-os-potwierdzeni.md` — handoff Personal OS do powyższego.
- `docs/13-handoff-formacja-online.md` — **obowiązująca spec** Formacji online (`/formacja/<slug>`, wiele kursów).
- `docs/12-plan-panel-kursanta.md` — pierwotny plan + research hostingu wideo i koszty (część o subdomenach nieaktualna).
- `docs/HANDOFF-strona-ICPE-Mission-PL.md` — architektura publicznej strony ICPE Mission PL (headless CMS na API + Astro, statystyki Umami). Nowy kierunek prac (osobny od modułu rejestracji).

---

## Do zrobienia / otwarte
- Formacja online: hosting wideo przeniesiony na Cloudflare R2 + moduły i tryb sekwencyjny (dziennik 2026-11-20). Do zrobienia: push, Manual Deploy `icpe-api`, konfiguracja R2 (5 kroków w dzienniku), ponowne wgranie filmów.
- Po pushu zmian backendowych: **Manual Deploy** `icpe-api` (INVITE enum, `Invitation.dietaryNotes`, `customFields`, tabela `Place`).
- Opcjonalnie (zaproponowane, nieprzyjęte): panel zarządzania zaproszonymi w `EventEditForm` (podgląd linków + kto potwierdził).
- Faza 1 strony ICPE Mission PL: moduł `content` w `icpe-api` (patrz handoff).
