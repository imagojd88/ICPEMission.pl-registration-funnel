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
| POST | `/payments/:regId/checkout` | `{ method }` | `{ redirectUrl }` (online) / dane przelewu |
| POST | `/payments/webhook/:provider` | payload operatora | 200 |
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
| GET | `/admin/instances?status=` | `EventInstanceDto[]` |
| GET | `/admin/instances/:id` | edycja + `roomTypes[]` + obłożenie |
| POST | `/admin/instances/:id/clone` | klon edycji |
| POST | `/admin/instances/:id/room-types` | dodanie typu pokoju |
| POST | `/admin/instances/:id/rooms` | generowanie puli pokoi |
| PUT | `/admin/instances/:id/pricing` | progi wiekowe, opcje, rabaty (`PricingConfig`) |
| GET | `/admin/instances/:id/registrations?status=&q=` | `RegistrationDto[]` |
| PATCH | `/admin/registrations/:id/status` | `{ status }` |
| POST | `/admin/registrations/:id/mark-paid` | ręczne potwierdzenie przelewu |
| POST | `/admin/registrations/:id/assign-room` | `{ roomId }` |
| GET | `/admin/instances/:id/export.xlsx` | eksport listy |
| POST | `/admin/meetings` + `/admin/attendance/:recordId` | moduł obecności |

## Auth
- Admin: `POST /auth/admin/login` → `{ accessToken, refreshToken }` (JWT). Guard `JwtAuthGuard` + role.
- Token serwisowy (Personal OS): nagłówek `Authorization: Bearer <SERVICE_TOKEN>`, scope `admin:read`/`admin:write`, akceptowany przez ten sam guard co JWT na `/admin/*`.

## Tryby dev
- `PAYMENTS_MODE=mock` → checkout zwraca fałszywy `redirectUrl`, webhook symulowany endpointem `/payments/dev/confirm/:regId`.
- `MAIL_MODE=log` → maile logowane do konsoli.
