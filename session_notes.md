# Session Notes — ICPEMission.pl

> Dziennik prac projektu. **Zasada: każda sesja dopisuje tu swoje zmiany** (co zrobione, gdzie, dlaczego, stan wdrożenia). Najnowsze wpisy na górze sekcji.

---

## Stack i wdrożenie (skrót)

- **Monorepo** npm workspaces: `app/` (React 18 + Vite + TS + Tailwind), `api/` (NestJS 10 + Prisma + PostgreSQL), `shared/` (kontrakt + silnik wyceny).
- **Vendored shared:** `api/` importuje z `'../shared'` = `api/src/_shared/` — musi być lustrem `shared/src/` (silnik pricingu).
- **Backend:** Render Web Service `icpe-api` (Blueprint/`render.yaml`). **Auto-Deploy domyślnie WYŁĄCZONY** → po zmianach w backendzie trzeba **Manual Deploy** (zalecane włączyć Auto-Deploy). API URL: `https://icpe-api.onrender.com`.
- **Frontend:** Render Static Site `icpe-frontend` — auto-deploy po pushu.
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
- `RegistrationPage.customFields` (JSON): `{ program: [{time,item}], specialGuest: {name, photoUrl} }`.
- `pricingConfig` (JSON): dodane `free?: boolean` (event bezpłatny).
- `Registration`: `checkedInAt`, `roomLabel`, `roomNote`, `roomsJson`.
- `Invitation` (model): `token @unique`, `confirmedAt`, `dietaryNotes`.
- `Place` (model): zapisywane lokalizacje `{ id, label, createdAt }`.

---

## Dziennik prac — moduł rejestracji

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
- `docs/HANDOFF-strona-ICPE-Mission-PL.md` — architektura publicznej strony ICPE Mission PL (headless CMS na API + Astro, statystyki Umami). Nowy kierunek prac (osobny od modułu rejestracji).

---

## Do zrobienia / otwarte
- Po pushu zmian backendowych: **Manual Deploy** `icpe-api` (INVITE enum, `Invitation.dietaryNotes`, `customFields`, tabela `Place`).
- Opcjonalnie (zaproponowane, nieprzyjęte): panel zarządzania zaproszonymi w `EventEditForm` (podgląd linków + kto potwierdził).
- Faza 1 strony ICPE Mission PL: moduł `content` w `icpe-api` (patrz handoff).
