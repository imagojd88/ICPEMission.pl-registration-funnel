# Kontrakt API — ICPE Registration (app ↔ api)

Bazowy URL: `VITE_API_URL` (dev: `http://localhost:3000`). Format: JSON. Typy DTO: `@icpe/shared` (`shared/src/types.ts`). Wycena: `@icpe/shared` (`computePrice`).

## Publiczne (lejek rejestracji)
| Metoda | Ścieżka | Wejście | Wyjście |
|---|---|---|---|
| GET | `/r/:slug` | — | `EventInstanceDto` (aktualna otwarta edycja) |
| GET | `/r/:slug/config?locale=` | — | konfiguracja formularza (pola, pokoje `RoomTypeDto[]`, cennik `PricingConfig`, języki) |
| POST | `/pricing/quote` | `PriceInput` | `PriceResult` |
| POST | `/registrations` | `CreateRegistrationDto` | `{ registration: RegistrationDto, summary: PriceResult, payment: {...} }` |
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
| GET | `/admin/instances?status=` | `EventInstanceDto[]` — od 2026-11-25 z opcjonalnym polem `unlisted: boolean` (ukryty event; lista admina i Personal OS nadal go zwraca) |
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
