# Kontrakt API — ICPE Registration (app ↔ api)

Bazowy URL: `VITE_API_URL` (dev: `http://localhost:3000`). Format: JSON. Typy DTO: `@icpe/shared` (`shared/src/types.ts`). Wycena: `@icpe/shared` (`computePrice`).

## Publiczne (lejek rejestracji)
| Metoda | Ścieżka | Wejście | Wyjście |
|---|---|---|---|
| GET | `/r/:slug` | — | `EventInstanceDto` (aktualna otwarta edycja) |
| GET | `/r/:slug/config?locale=` | — | konfiguracja formularza (pola, pokoje `RoomTypeDto[]`, cennik `PricingConfig`, języki) |
| POST | `/pricing/quote` | `PriceInput` | `PriceResult` |
| POST | `/registrations` | `CreateRegistrationDto` (od 2026-11-25 z opcjonalnym `leadKey`) | `{ registration: RegistrationDto, summary: PriceResult, payment: {...} }` |
| POST | `/registrations/leads` | `{ instanceId, email, firstName, lastName?, locale?, step?, leadKey? }` | `{ ok: true }` — „rozpoczęte zgłoszenie” (jedno przypomnienie po 3 h); nic nie ujawnia |
| GET | `/registrations/:id?token=` | — | `RegistrationDto` (magic-link) |
| PUT | `/registrations/:id?token=` | `CreateRegistrationDto` (partial) | `RegistrationDto` |
| GET | `/registrations/:id/calendar.ics` | — | `text/calendar` |
| GET | `/registrations/:id/calendar/google` | — | 302 → Google Calendar |
| POST | `/payments/:regId/checkout` (auth, od 25.11.2026) | `{ method }` | `{ redirectUrl }` (mock) / dane przelewu — tylko admin / token serwisowy; lejek jej nie używa |
| POST | `/payments/webhook/:provider` | payload operatora | 200 (nic nie księguje) |
| GET | `/payments/config` | — | `{ providers: string[] }` — dostawcy płatności online; w trybie `mock` `[]` |
| GET | `/registrations/manage/:token/payments` | — | rozliczenie, harmonogram, granice kwot `{ due, min, max }`, wpłaty, ostatnia próba, `online: { available, provider, reason }` |
| POST | `/registrations/manage/:token/pay` | `{ mode: 'due' \| 'remaining' \| 'custom', amount? }` | `{ redirectUrl, amount, currency }` — kwotę liczy serwer |
| POST | `/payments/webhook/tpay` | powiadomienie Tpay (`x-www-form-urlencoded` + `X-JWS-Signature`) | tekst `TRUE` (200) / `FALSE` (400 zła weryfikacja, 500 błąd po naszej stronie) |
| POST | `/attendance/check-in` | `{ token, occurrenceId, status }` | 200 |

## Standalone event (bez noclegu, bezpłatny — RSVP)
Event typu `STANDALONE`. `GET /r/:slug/config` zwraca `type: "STANDALONE"` i `isStandalone: true` → frontend pokazuje prosty ekran RSVP zamiast lejka.

| Metoda | Ścieżka | Wejście | Wyjście |
|---|---|---|---|
| POST | `/rsvp` | `{ instanceId, name, email?, response: "YES"\|"NO", locale? }` | `{ id, response, editToken, calendar:{ google } }` |
| GET | `/rsvp/:id?token=` | — | `{ id, instanceId, name, email?, response, locale }` |
| PUT | `/rsvp/:id?token=` | `{ name?, response? }` | `{ id, response }` |
| GET | `/rsvp/:id/calendar.ics` | — | `text/calendar` |
| GET | `/rsvp/:id/calendar/google` | — | 302 → Google Calendar |
| GET | `/admin/instances/:id/rsvps` (auth) | — | `{ total, yes, no, items:[{ id,name,email?,response,locale,createdAt }] }` |

Jeden RSVP na (event, e-mail) — ponowny zapis z tym samym e-mailem aktualizuje odpowiedź. Bez e-maila tworzy nowy wpis. RSVP dozwolone tylko dla edycji serii typu `STANDALONE`.

## Konta gości
`POST /auth/guest/register` · `POST /auth/guest/login` · `POST /auth/guest/magic-link` · `GET /guest/me/registrations` · `PUT /guest/me/profile`

## Admin (JWT admina LUB token serwisowy Bearer)
| Metoda | Ścieżka | Opis |
|---|---|---|
| GET | `/admin/summary` | `AdminSummaryDto` (KPI dashboardu / Personal OS) |
| POST/PUT | `/admin/series[/:id]` | tworzenie/edycja serii (one-time/evergreen) |
| POST | `/admin/series/:id/page` | konfiguracja generatora strony |
| POST | `/admin/series/:id/publish` | publikacja |
| GET | `/admin/instances?status=` | `EventInstanceDto[]` — od 2026-11-25 z opcjonalnymi polami `unlisted: boolean` (ukryty event; lista admina i Personal OS nadal go zwraca) i `archived: boolean` (event zarchiwizowany; `status` zostaje `CLOSED`) |
| GET | `/admin/instances/:id` | edycja + `roomTypes[]` + obłożenie (+ opcjonalne `unlisted`) |
| PATCH | `/admin/instances/:id` | edycja pól instancji; przyjmuje m.in. opcjonalne `unlisted: boolean` |
| POST | `/admin/instances/:id/clone` | klon edycji |
| POST | `/admin/instances/:id/room-types` | dodanie typu pokoju |
| POST | `/admin/instances/:id/rooms` | generowanie puli pokoi |
| PUT | `/admin/instances/:id/pricing` | progi wiekowe, opcje, rabaty (`PricingConfig`) |
| GET | `/admin/instances/:id/registrations?status=&q=` | `RegistrationDto[]` — od 2026-11-25 z opcjonalnym `paidProviders: string[]` (dostawcy zaksięgowanych wpłat, np. `["tpay","panel"]`); `paidAmount` jest pomniejszone o zwroty |
| PATCH | `/admin/registrations/:id/status` | `{ status }` |
| POST | `/admin/registrations/:id/mark-paid` | ręczne potwierdzenie przelewu |
| POST | `/admin/registrations/:id/assign-room` | `{ roomId }` |
| POST | `/admin/payments/:paymentId/refund` | zwrot wpłaty Tpay — TYLKO JWT pełnego admina (token serwisowy → 403); szczegóły niżej |
| POST | `/admin/payments/refunds/:refundId/resolve` | `{ outcome: 'done' \| 'failed' }` — rozstrzygnięcie zwrotu „do wyjaśnienia”; nic nie wysyła do Tpay; TYLKO JWT pełnego admina |
| GET | `/admin/instances/:id/export.xlsx` | eksport listy |
| POST | `/admin/meetings` + `/admin/attendance/:recordId` | moduł obecności |

## Auth
- Admin: `POST /auth/admin/login` → `{ accessToken, refreshToken }` (JWT). Guard `JwtAuthGuard` + role.
- Token serwisowy (Personal OS): nagłówek `Authorization: Bearer <SERVICE_TOKEN>`, scope `admin:read`/`admin:write`, akceptowany przez ten sam guard co JWT na `/admin/*`.

## Tryby dev
- `PAYMENTS_MODE=mock` (domyślnie) → płatności online wyłączone (`GET /payments/config` zwraca `[]`); `checkout` zwraca fałszywy `redirectUrl`, webhook symulowany endpointem `/payments/dev/confirm/:regId` (oba tylko dla admina).
- `PAYMENTS_MODE=tpay` → płatności online przez Tpay (BLIK · szybki przelew), tylko dla zgłoszeń z Polski; zmienne `TPAY_*` i `API_PUBLIC_URL` — patrz `docs/20-plan-wdrozenie-tpay.md`. Admin: `GET /admin/payments/online-status` (auth) — stan konfiguracji bez wartości kluczy.
- `MAIL_MODE=log` → maile logowane do konsoli.

## Ukryty event (`EventInstance.unlisted`, 2026-11-25)
- Pole opcjonalne, domyślnie `false`. Zmiana wyłącznie addytywna — klient, który pola nie zna, działa jak dotąd.
- `unlisted: true` = event działa normalnie pod bezpośrednim linkiem (`GET /r/:slug`, `GET /r/:slug/config`, rejestracja, płatności, maile, strona zgłoszenia, recepcja), ale jest pomijany na listach publicznych: `GET /events` (strona główna rejestracji), `GET /site/events/upcoming` (icpemission.pl) i `GET /icpe-go/events`.
- Listy z autoryzacją (`GET /admin/instances`, `GET /admin/instances/:id`, `GET /admin/summary`, recepcja) zwracają event jak zwykle; `/admin/instances*` dokłada pole `unlisted`.
- Zapis: `PATCH /admin/instances/:id` z `{ unlisted: boolean }`; opcjonalnie `unlisted: true` w `POST /admin/series`. Klon (`POST /admin/instances/:id/clone`) dziedziczy flagę.
- `GET /r/:slug` (pole instancji) i `GET /r/:slug/config` zwracają `unlisted` — publiczny lejek dokłada na tej podstawie `<meta name="robots" content="noindex">`.

## Zwroty wpłat Tpay z panelu (2026-11-25)
- `POST /admin/payments/:paymentId/refund`, body `{ amount?: number, reason?: string, notifyGuest?: boolean }`. Bez `amount` = cała pozostała (niezwrócona) kwota wpłaty; `notifyGuest` domyślnie `true` (mail „Zwróciliśmy wpłatę”). Kwotę sprawdza serwer: > 0, ≤ (kwota wpłaty − zwroty wykonane), co do grosza.
- Warunki: wpłata `provider = 'tpay'`, status `PAID`, PLN, tryb `tpay` skonfigurowany, brak zwrotu w toku. Błędy: 400 (kwota, wpłata nie do zwrotu, odmowa Tpay — z komunikatem), 403 (token serwisowy), 404, 409 (zwrot tej wpłaty w toku / do wyjaśnienia albo stan zmienił się w trakcie), 503 (Tpay nieskonfigurowany).
- Odpowiedź 200: `{ ok, uncertain, refundId, amount, guestMail?: 'sent' | 'skipped' | 'failed', registrationId, payments[], summary }` (jak `GET /admin/registrations/:id/payments`). `uncertain: true` = Tpay nie potwierdził zwrotu (przekroczony czas); nic nie zaksięgowano, zwrot czeka na rozstrzygnięcie (`…/resolve`), kolejne zwroty tej wpłaty są zablokowane.
- Model: tabela `PaymentRefund` (osobny wiersz na zwrot; statusy `PENDING` / `DONE` / `UNCERTAIN` / `FAILED`; źródło `panel` / `tpay-notification`). „Wpłacono” = wpłaty `PAID` − zwroty `DONE`; wpłata zwrócona w całości ma `Payment.status = REFUNDED` (tak samo po powiadomieniu `chargeback`).
- Pola dodane (wszystkie opcjonalne, addytywne): w `GET /admin/registrations/:id/payments` wiersz wpłaty ma `refunds[] { id, amount, reason, status, source, by, createdAt }`, `refundedAmount`, `netAmount`, `refundState` (`NONE` / `PARTIAL` / `FULL`), `refundable`, `refundInFlight`; w `GET /registrations/manage/:token/payments` wiersz wpłaty ma `refunded` i `refunds[] { amount, date }`; recepcja (`/desk/…/payments`) — `refundedAmount`.

## Kraj zamieszkania zgłaszającego i flaga kodów rabatowych (2026-11-25)
- `contact.countryCode` (opcjonalne) — kod ISO 3166-1 alpha-2, wielkie litery (np. `PL`). `POST /registrations` przyjmuje też małe litery (zamienia na wielkie), puste traktuje jak brak; inna wartość (nazwa kraju, 3 litery) → 400. Zmiana wyłącznie addytywna — bez pola wszystko działa jak dotąd.
- Płatność online (Tpay): NAJPIERW kraj (`PL` → dostępna; inny kraj → niedostępna niezależnie od języka), dopiero gdy kraju brak — język zgłoszenia (`locale`). Jedna reguła (`onlineProviderFor`) dla lejka, `GET /registrations/manage/:token/payments`, tworzenia płatności i przycisków „Zapłać online” w mailach.
- `PATCH /admin/registrations/:id`: `contact.countryCode` z kodem zapisuje kraj, pusty tekst usuwa zapisany kraj. Odpowiedzi ze zgłoszeniem (`contact`) zwracają `countryCode`, gdy jest zapisany.
- `GET /r/:slug/config` zwraca `hasDiscountCodes: boolean` — czy event ma aktywny kod rabatowy (lejek ukrywa pole „Kod rabatowy”, gdy nie ma).

## Panel admina — dodatki z 2026-11-25 (wyłącznie addytywne)
Istniejące trasy i kształty odpowiedzi kontraktu Personal OS bez zmian. Nowe pola są opcjonalne, nowe trasy niczego nie zastępują.

### Niedokończone zgłoszenia: klucz sesji formularza (`leadKey`)
- `POST /registrations/leads` i `POST /registrations` przyjmują opcjonalne `leadKey` — losowy tekst 16–64 znaków `[A-Za-z0-9_-]`, tworzony w przeglądarce gościa (jeden na event i sesję formularza). Wartość w innym formacie jest ignorowana.
- Z kluczem: lead tej sesji **zmienia adres**, gdy gość poprawi e-mail (nie powstaje drugi), a wysłane zgłoszenie zamyka lead pod adresem zgłoszenia **oraz** wszystkie leady z tym kluczem. Bez klucza (starszy front) działa jak dotąd — po samym adresie.
- Klucz nie jest tokenem z linku przypomnienia (`GET /registrations/leads/:token`) i nie daje dostępu do żadnych danych; odpowiedź `POST /registrations/leads` to zawsze `{ ok: true }`.
- Cron przypomnień pomija lead, gdy w evencie jest aktywne (nieanulowane) zgłoszenie na ten sam adres po normalizacji (małe litery, bez białych znaków). Bez dopasowań po nazwisku ani „podobnych” adresach.
- Baza: `RegistrationLead.sessionKey String?` (+ indeks `instanceId, sessionKey`).

### Archiwizacja eventu
- `PATCH /admin/instances/:id` z `{ status: 'ARCHIVED' }` — tylko dla eventu, który nie jest `OPEN` (otwarty → 400 „Najpierw zamknij event”). Powrót: `{ status: 'CLOSED' }`.
- `GET /admin/instances` i `GET /admin/instances/:id` zwracają `archived: boolean`; pole `status` nadal `OPEN | CLOSED` (zarchiwizowany = `CLOSED`), więc klient, który pola nie zna, widzi event jak zamknięty.

### Zgłoszenie: szczegóły dla admina, przywracanie, trwałe usuwanie danych testowych
| Metoda | Ścieżka | Kto | Opis |
|---|---|---|---|
| GET | `/admin/registrations/:id/detail` | tylko JWT admina (token serwisowy → 403) | `{ id, internalStatus, status, manageToken, manageUrl, currency, totalPrice, paidAmount, payments: { count, testCount, realCount }, canRestore, canDeletePermanently, deleteBlocker }` — jedyna odpowiedź admina z tokenem strony gościa (`/z/<token>`) |
| POST | `/admin/registrations/:id/restore` | JWT admina lub token serwisowy | body `{ force?: boolean }`. Tylko zgłoszenie `CANCELLED` (inaczej 400). Brak miejsc / pokoi i brak `force` → 200 `{ ok: false, needsConfirm: true, warnings[], nextInternalStatus }`, nic nie zmienia. Sukces → `{ ok: true, internalStatus, status, warnings[] }`. Bez maila do gościa |
| POST | `/admin/registrations/:id/delete-permanently` | tylko JWT admina | body `{ confirm: 'USUŃ' }`. Serwer odmawia (400), gdy zgłoszenie nie jest anulowane albo ma jakąkolwiek nietestową wpłatę; 409 przy zwrocie w toku. Usuwa trwale zgłoszenie z uczestnikami, wpłatami testowymi, próbami płatności, zwrotami, prośbami i wpisami dzienników |
| DELETE | `/admin/payments/:paymentId/test` | tylko JWT admina | trwale usuwa wpłatę **testową Tpay** (`provider = 'tpay'` i znacznik testu na wpłacie oraz na próbie `OnlinePayment`) z jej próbą i zwrotami; 400 dla każdej innej wpłaty; 409 przy zwrocie w toku. Przelicza status zgłoszenia (może cofnąć `CONFIRMED` → oczekuje na wpłatę). Odpowiedź jak `GET /admin/registrations/:id/payments` + `{ ok, deleted, internalStatus }`. Nic nie wysyła do Tpay |

- Status po przywróceniu: sprzed anulowania, jeśli był `WAITLIST` albo `CONFIRMED` (`Registration.statusBeforeCancel`, zapisywane przez `PATCH /admin/registrations/:id/status` przy anulowaniu); w pozostałych przypadkach z wpłat — reguła `syncStatus` (zadatek przy harmonogramie, całość bez niego) → `CONFIRMED`, inaczej `PENDING_PAYMENT` / `AWAITING_TRANSFER` wg metody.
- `PATCH /admin/registrations/:id/status` — kształt bez zmian; nieistniejące zgłoszenie zwraca teraz 404 (wcześniej błąd 500 z bazy).
- Usunięcia są zapisywane w logu serwera (kto, id zgłoszenia / wpłaty, liczby usuniętych wierszy) — bez danych osobowych gościa.

### Recepcja w panelu: dziennik działań i prośby dodatkowe
| Metoda | Ścieżka | Opis |
|---|---|---|
| GET | `/admin/instances/:id/desk-log?actor=&action=&page=&pageSize=` | dziennik `DeskActionLog` eventu, od najnowszych; `pageSize` 10–200 (domyślnie 50). `{ total, page, pageSize, pages, actors[], actions[], items[] { id, createdAt, actor, action, registrationId, registrant, amount, method, kind, via } }` |
| GET | `/admin/instances/:id/desk-requests?status=OPEN\|DONE` | prośby `RegistrationRequest` eventu: `{ counts: { open, done, total }, items[] { id, registrationId, registrant, registrationStatus, roomLabel, participant, kind, note, status, createdBy, createdAt, resolvedBy, resolvedAt } }` |
| PATCH | `/admin/instances/:id/desk-requests/:requestId` | `{ status: 'OPEN' \| 'DONE' }` — tylko JWT admina; dopisuje wpis do dziennika (`REQUEST_DONE` / `REQUEST_REOPEN`, `via: 'panel'`) |

Wszystkie za `JwtAuthGuard` (pomocnik recepcji nie przechodzi). Trasy `/desk/*` bez zmian.

## Diety, dodatki z limitem i bezpieczny zapis konfiguracji (2026-11-26, wyłącznie addytywne)

### Diety
- `Participant.dietary` to nadal tekst: polskie etykiety zaznaczonych diet + wpis ręczny, rozdzielone przecinkami. W bazie nie ma kluczy diet; klucze (`no_meat`, `vegan`, `gluten_free`, `lactose_free`, `nut_free`, `kosher`) są tylko w ustawieniach eventu (`customFields.diets`).
- Dieta `lactose_free` od 26.11.2026 ma etykietę „Bez mleka” (EN “Dairy-free”). Nowe zgłoszenia zapisują „Bez mleka”; starsze mają „Bez laktozy”. Oba zapisy oznaczają tę samą dietę — rozpoznaje je `parseDietary` w `shared/src/diets.ts`. Klient, który liczy diety sam, powinien traktować „Bez laktozy” i „Bez mleka” jako jedno. Danych w bazie nie zmieniano.
- Zestawienie diet dla ośrodka liczy panel z `GET /admin/instances/:id/registrations` (bez nowej trasy).

### Dodatki z limitem
- Konfiguracja: `pricingConfig.addons?: [{ id, name, desc?, limit?, maxPerRegistration?, price?, childUnderAge? }]` (`name` / `desc`: tekst albo mapa językowa). Brak pola = event bez dodatków, wszystko działa jak dotąd.
- `POST /registrations`: opcjonalne `options.addons: { [id]: liczbaSztuk }`. Serwer przyjmuje tylko dodatki skonfigurowane w evencie. Błędy: 400 (ponad maksimum na zgłoszenie, niespełniony warunek wieku), **409** z `{ message, code: "ADDON_SOLD_OUT", addonId, available }`, gdy limit jest wyczerpany — zgłoszenie nie powstaje; `message` jest w języku zgłoszenia i zawiera nazwę dodatku.
- Zapis: `Registration.optionsJson.addons` (id → sztuki) i `optionsJson.addonsAt` (id → chwila zamówienia, ISO). Sztuki zajmują zgłoszenia o statusie innym niż `CANCELLED` i `WAITLIST`.
- `GET /r/:slug/config` — nowe opcjonalne pola: `addonAvailability: { [id]: wolne }` (tylko dodatki z limitem), `addonUsage: { [id]: zajęte }`, `configRev: number`.
- Odpowiedzi ze zgłoszeniem (`options`) zawierają `addons` i `addonsAt`, gdy zgłoszenie ma dodatki. `GET /registrations/manage/:token` dodatkowo `addons: [{ id, name, qty }]` (nazwy w języku zgłoszenia). Recepcja (`/desk/…`): `addons: [{ id, qty, name }]` na karcie zgłoszenia.
- `PATCH /admin/registrations/:id`: opcjonalne `options.addons` (obiekt = nowy wybór, `{}` = usuń) i `options.addonsOverLimit: true` (świadome przekroczenie limitu). **Bez pola `options.addons` zamówione dodatki zostają bez zmian** — klient, który ich nie zna (Personal OS), niczego nie gubi. Dołożenie sztuk ponad limit bez `addonsOverLimit` → 409 `ADDON_SOLD_OUT`.
- Cena dodatku (`price` × sztuki) wchodzi do `PriceResult.options`; przy cenie 0 kwoty się nie zmieniają.

### Zapis konfiguracji eventu: znacznik panelu, numer wersji, historia
- `EventInstance.configRev` (Int, domyślnie 0) rośnie o 1 przy każdym zapisie z `pricingConfig`.
- `PATCH /admin/instances/:id` z polem `pricingConfig` oraz `PUT /admin/instances/:id/pricing` przyjmują opcjonalne `_client: { version: string, configLevel: number, configRev?: number }` (w `PUT …/pricing` pole `_client` jest w ciele obok kluczy cennika i nie jest zapisywane).
- Reguła (`evaluateConfigWrite`, `shared/src/configMerge.ts`):
  - żądanie tokenem **zalogowanego admina panelu** (JWT, realm `admin`), które zmienia cennik, MUSI mieć `_client.configLevel` ≥ `MIN_PANEL_CONFIG_LEVEL` (obecnie 2); inaczej **409** z komunikatem „Ta karta panelu działa w starej wersji… Odśwież stronę…” i nic nie jest zapisywane;
  - gdy podano `_client.configRev` różne od aktualnego → **409** „Ustawienia tego eventu zostały w międzyczasie zmienione…”;
  - żądanie **tokenem serwisowym** (Personal OS, integracje; realm `service`) nie jest sprawdzane i działa jak dotąd, bez `_client`;
  - `PATCH /admin/instances/:id` bez `pricingConfig` (np. sam `status`, `unlisted`) — bez zmian, bez wymogu.
- Historia: tabela `EventConfigHistory` — stan sprzed każdego zapisu cennika, który coś zmienił (instancja, `pricingConfig`, strona), ostatnie 20 na event.
  | Metoda | Ścieżka | Opis |
  |---|---|---|
  | GET | `/admin/instances/:id/config-history` | `{ configRev, currentSummary, keep, items[] { id, createdAt, actor, source, clientVersion, configRev, summary, pricingConfig, instance, page } }` |
  | POST | `/admin/instances/:id/config-history/:historyId/restore` | body `{ _client }`; tylko JWT admina (token serwisowy → 403). Przywraca `pricingConfig` z wybranej wersji (pozostałe pola bez zmian); obecny stan trafia do historii. `{ ok, configRev }` |
- CORS: do dozwolonych nagłówków dopisano `X-Panel-Version` (na przyszłość; panel przesyła dziś wersję w ciele żądania, bo nowy nagłówek wysłany przed wdrożeniem API blokowałby wszystkie żądania panelu).
- Front: build zapisuje `/version.json` `{ build, builtAt }`; panel porównuje go ze swoim znacznikiem co 3 minuty i przy powrocie do karty.
