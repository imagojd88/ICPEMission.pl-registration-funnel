# ICPE Mission — System rejestracji na eventy (monorepo)

Webowa aplikacja do rejestracji na wyjazdy formacyjne i zgłaszania obecności na spotkaniach, z panelem admina i generatorem stron (jednorazowych i evergreen). Wielojęzyczna (PL/EN/IT), płatności online + przelew, integracja kalendarza (Google/iCal).

## Struktura

```
.
├── app/            Frontend — React + TS + Vite + Tailwind (wg handoffu Claude Design)
├── api/            Backend — NestJS + Prisma + PostgreSQL
├── shared/         @icpe/shared — wspólny silnik wyceny, typy DTO, kalendarz
├── CONTRACT.md     Kontrakt API (app ↔ api)
├── docker-compose.yml   Postgres + Redis (dev)
├── .env.example    Wzór konfiguracji (skopiuj do .env)
│
├── 01-architektura-backend.md      Dokumentacja architektury
├── 02-erd-model-danych.mermaid     Diagram ERD
├── 03-frontend-mapa-ekranow.md     Mapa ekranów
├── 04-prompt-claude-design.md      Prompt użyty do designu
└── 05-prompt-personal-os-integracja.md   Integracja z Personal OS
```

`shared/` to źródło prawdy dla **logiki cennika** — `computePrice()` jest importowany i przez frontend (podgląd na żywo), i przez backend (cena wiążąca), więc obie strony liczą identycznie. Wartości odtworzone 1:1 z handoffu (formacja 50 zł, wyżywienie 80 zł, nocleg per typ pokoju × noce, mnożniki wiekowe 0/0,7/0,9/1,0, transport +40, pościel +15×os, ICPE10 −10%).

## Szybki start (dev)

```bash
# 0. Zależności (workspaces)
npm install

# 1. Baza i Redis
docker compose up -d db redis
cp .env.example .env          # uzupełnij sekrety jeśli trzeba

# 2. Backend
cd api
npx prisma generate
npx prisma migrate dev --name init
npx prisma db seed            # tworzy event "Dzień Formacji 2026" + przykładowe zgłoszenia
npm run start:dev             # API: http://localhost:3000 · Swagger: /docs

# 3. Frontend (nowy terminal)
cd app
npm run dev                   # http://localhost:5173 (działa też bez backendu — fallback do mocków)
```

Domyślne konto admina (z seed): `admin@icpemission.pl` / `admin123`.

## Tryby dev (bez zewnętrznych usług)
- `PAYMENTS_MODE=mock` — checkout zwraca atrapę; potwierdzenie płatności: `POST /payments/dev/confirm/:regId`.
- `MAIL_MODE=log` — maile trafiają do konsoli.
- Frontend ma fallback do danych mock (z prototypu), więc UI działa zanim wstanie backend.

## Stan i weryfikacja
- `shared`: testy silnika wyceny przechodzą (`node --test`), m.in. dorosły w pokoju 2-os. = 210 zł.
- `app`: `tsc --noEmit` ✓, `vite build` ✓ (1619 modułów, lazy-loaded lejek/panel/i18n).
- `api`: `tsc --noEmit` ✓; wszystkie endpointy z `CONTRACT.md` zaimplementowane. `prisma generate`/`migrate` wymagają lokalnego środowiska (sandbox nie ma binariów Prisma).

## Co jest gotowe, a co do dokończenia
**Frontend** — kompletny lejek publiczny (landing Hero A, stepper 5 kroków, wybór płatności, podsumowanie z rozliczeniem + kalendarz + kopiowanie danych przelewu, sukces) oraz panel admina (dashboard, lista eventów, kreator z live-preview, zgłoszenia z drawerem). Moduły Zakwaterowanie/Płatności/Obecność/Ustawienia jako EmptyState „w przygotowaniu".

**Backend** — wszystkie moduły i endpointy, cena wiążąca z `@icpe/shared`, auth admina + token serwisowy dla Personal OS, płatności mock + przelew, mailer log, seed. Do dokończenia post-MVP: realne adaptery płatności (Przelewy24/Stripe), pełny realm kont gości, kolejki maili/scheduler evergreen.

## Integracja z Personal OS
Patrz `05-prompt-personal-os-integracja.md`. Personal OS łączy się wyłącznie przez REST `/admin/*` z tokenem serwisowym (`SERVICE_TOKEN`) — np. `GET /admin/summary`, `GET /admin/instances/:id/registrations`.
