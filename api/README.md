# ICPE Registration — API

NestJS 10 + TypeScript + Prisma + PostgreSQL backend for the ICPE Mission event registration system.

## Uruchomienie (dev)

### 1. Baza danych (Docker)

```bash
# Z katalogu root monorepo:
docker-compose up -d db
```

### 2. Konfiguracja środowiska

```bash
cp api/.env.example .env
# Edytuj .env — DATABASE_URL, JWT_SECRET, CORS_ORIGIN
```

### 3. Instalacja zależności

```bash
cd api
npm install
```

### 4. Migracja i seed

```bash
npx prisma migrate dev --name init
npx ts-node -r tsconfig-paths/register prisma/seed.ts
```

### 5. Uruchomienie

```bash
npm run start:dev
# API: http://localhost:3000
# Swagger: http://localhost:3000/docs
```

## Domyślne konto admina

| Pole   | Wartość                  |
|--------|--------------------------|
| Email  | `admin@icpemission.pl`   |
| Hasło  | `admin123`               |
| Rola   | `SUPER_ADMIN`            |

Zmień hasło po pierwszym logowaniu!

## Tryby dev

| Zmienna         | Domyślnie | Efekt                                                      |
|-----------------|-----------|------------------------------------------------------------|
| `PAYMENTS_MODE` | `mock`    | `/payments/:regId/checkout` zwraca fałszywy `redirectUrl`. Potwierdzenie: `POST /payments/dev/confirm/:regId` |
| `MAIL_MODE`     | `log`     | Maile logowane do konsoli, nie wysyłane                    |

## Kluczowe endpointy

```
POST /auth/admin/login          # { email, password } → { accessToken }
GET  /r/:slug                   # aktualna otwarta edycja
GET  /r/:slug/config?locale=pl  # konfiguracja formularza
POST /pricing/quote             # podgląd ceny
POST /registrations             # tworzenie zgłoszenia
GET  /admin/summary             # KPI (Personal OS)
GET  /docs                      # Swagger UI
```

## Struktura

```
api/
├── prisma/
│   ├── schema.prisma           # model danych (PostgreSQL)
│   └── seed.ts                 # dane startowe (org, admin, event, pokoje, 7 rejestracji)
└── src/
    ├── main.ts
    ├── app.module.ts
    ├── shared.ts               # re-export @icpe/shared (pricing, types, calendar)
    ├── prisma/                 # PrismaModule (global)
    ├── auth/                   # JWT + service token guard
    ├── events/                 # EventSeries / EventInstance / RegistrationPage
    ├── pricing/                # POST /pricing/quote → computePrice(@icpe/shared)
    ├── registrations/          # pełny lejek + magic-link + iCal + Google Calendar
    ├── rooms/                  # typy pokoi, pula, przydział
    ├── payments/               # mock checkout + bank transfer + webhook
    ├── notifications/          # mailer (MAIL_MODE=log)
    ├── attendance/             # spotkania + obecność
    ├── guests/                 # konta gości (stub)
    └── admin/                  # GET /admin/summary, status, mark-paid, assign-room
```

## Typecheck

```bash
npx tsc --noEmit
```

## Prisma

```bash
npx prisma validate             # walidacja schematu
npx prisma generate             # generowanie klienta
npx prisma studio               # GUI bazy
```
