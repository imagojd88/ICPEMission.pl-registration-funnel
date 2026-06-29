# Prompt do osobnego wątku — integracja rejestracji ICPE w Personal OS

> Wklej cały blok „PROMPT" poniżej w nowym wątku **uruchomionym w katalogu projektu Personal OS**:
> `/Users/jacekdudzic/Local Sites/Jacek OS/Jacek OS`
> Wątek musi mieć dostęp do tego folderu (to repo aplikacji). Prompt zakłada, że agent przeczyta istniejące pliki i dopasuje się do konwencji — nie zgaduje na ślepo.

---

## PROMPT (do wklejenia)

Pracujesz w repozytorium **Personal OS** (aplikacja desktopowa „Jacek OS"), ścieżka: `/Users/jacekdudzic/Local Sites/Jacek OS/Jacek OS`. To aplikacja **Electron + TypeScript + Vite**, z **Drizzle ORM na better-sqlite3**, procesem `main` i `renderer` (React). Twoje zadanie: dodać integrację z systemem rejestracji na eventy **ICPE Mission** i wyświetlić ją jako **osobną kartę w istniejącej zakładce ICPE**.

### Krok 0 — najpierw poznaj konwencje (przeczytaj te pliki, zanim zaczniesz pisać)
- `src/main/db/schema.ts` — styl definicji tabel Drizzle (nazewnictwo, typy, timestampy).
- `src/main/db/client.ts` oraz `src/main/db/migrate.ts` i `drizzle.config.ts` — jak działa baza i migracje.
- Co najmniej dwie istniejące integracje jako wzorzec polling→cache→IPC, np. `src/main/integrations/wordpress.ts`, `src/main/integrations/google-calendar.ts`, `src/main/integrations/icpe-photos.ts`, `src/main/integrations/tasks.ts`.
- `src/main/scheduler/` (np. `networth-snapshot.ts`) — jak rejestrowane są zadania cykliczne/odświeżanie.
- `src/main/secrets.ts` — jak przechowywane są sekrety (keytar) i jak je odczytywać.
- `src/shared/types.ts` (+ `types.d.ts`) — gdzie żyją współdzielone typy main↔renderer.
- Warstwa IPC i preload — znajdź, jak `renderer` woła `main` (wzorzec `window.<api>` i typy w `src/renderer/types.d.ts`).
- `src/renderer/screens/Icpe.tsx` oraz `src/renderer/screens/IcpeContactsPanel.tsx` — to istniejąca zakładka ICPE i jej karty; nową kartę dodaj tutaj.
- Atomy UI: `src/renderer/atoms/Panel.tsx`, `Chip.tsx`, `Eyebrow.tsx` — używaj ich, by zachować spójny wygląd (karta = `Panel`).

**Zasada: mirroruj istniejące wzorce 1:1.** Nie wprowadzaj nowych bibliotek ani stylu, jeśli repo już ma własny sposób na dany problem.

### Co budujemy
Personal OS pełni rolę **klienta administracyjnego (read-mostly)** dla zewnętrznego backendu rejestracji ICPE (REST API, NestJS). Pobiera dane o eventach i zgłoszeniach, cache'uje je lokalnie w SQLite i pokazuje w nowej karcie zakładki ICPE. Opcjonalnie wykonuje kilka akcji zapisujących.

### Kontrakt API backendu ICPE (konsumowany przez integrację)
Backend wystawia REST API z uwierzytelnianiem **Bearer token (token serwisowy admina)**. Bazowy URL i token konfigurowalne (patrz „Konfiguracja"). Endpointy do odczytu:

```
GET /admin/instances?status=OPEN|CLOSED|ALL
    -> [{ id, seriesId, title{pl,en,it}, startsAt, endsAt, location, status,
          capacity, registeredCount, confirmedCount, revenue, currency }]

GET /admin/instances/:id
    -> { ...instance, roomTypes[], roomsOccupancy{ total, assigned, free } }

GET /admin/instances/:id/registrations?status=&q=
    -> [{ id, status, locale, contact{firstName,lastName,email,phone},
          participants[{type,firstName,lastName,age,gender,dietary}],
          preferredRoomType, assignedRoom, totalPrice, currency,
          paymentMethod, paymentStatus, createdAt }]

GET /admin/meetings/:id/occurrences/:occId/attendance   (opcjonalnie, moduł obecności)
```

Endpointy do zapisu (opcjonalne, oznacz w UI jako akcje admina):
```
POST  /admin/registrations/:id/mark-paid
PATCH /admin/registrations/:id/status        { status }
POST  /admin/registrations/:id/assign-room   { roomId }
```

> Backend może jeszcze nie istnieć. Zaimplementuj integrację za interfejsem `IcpeApiClient` i dodaj **tryb fixture/mock** (przełączany configiem `ICPE_API_MODE=mock|live`), który zwraca realistyczne dane przykładowe, aby UI dało się rozwinąć i przetestować bez backendu. Pełny opis modelu danych backendu znajdziesz w dokumentach projektu rejestracji (architektura backendu + ERD) — trzymaj się tych nazw pól.

### Krok 1 — warstwa danych (main)
1. **Drizzle: dodaj tabele cache** w `src/main/db/schema.ts` (zgodnie z istniejącym stylem), np.:
   - `icpeEventInstances` (id, seriesId, titleJson, startsAt, endsAt, location, status, capacity, registeredCount, confirmedCount, revenue, currency, syncedAt)
   - `icpeRegistrations` (id, instanceId, status, locale, contactJson, participantsJson, preferredRoomType, assignedRoom, totalPrice, currency, paymentMethod, paymentStatus, createdAt, syncedAt)
   - opcjonalnie `icpeRoomOccupancy` (instanceId, total, assigned, free, syncedAt)
   Użyj JSON-text kolumn tam, gdzie repo już tak robi dla danych zagnieżdżonych.
2. Wygeneruj migrację zgodnie z procesem repo (drizzle-kit / istniejący skrypt `db:generate` — sprawdź `package.json`).
3. **Integracja**: utwórz `src/main/integrations/icpe-registrations.ts`:
   - `IcpeApiClient` (live: fetch z Bearer; mock: fixtures).
   - `syncIcpeRegistrations()` — pobiera instancje + zgłoszenia, upsertuje do SQLite (idempotentnie po `id`), zapisuje `syncedAt`.
   - funkcje odczytu dla IPC: `getIcpeInstances()`, `getIcpeRegistrations(instanceId, filters)`, `getIcpeSummary()` (KPI: liczba otwartych eventów, zgłoszenia, przychód, obłożenie).
   - akcje zapisu (jeśli włączone): `icpeMarkPaid(id)`, `icpeSetStatus(id,status)`, `icpeAssignRoom(id,roomId)` — po sukcesie odświeżają cache.
4. **Sekrety/konfiguracja** przez `src/main/secrets.ts` (keytar): `ICPE_API_BASE_URL`, `ICPE_API_TOKEN`, `ICPE_API_MODE`. Brak konfiguracji → karta pokazuje stan „skonfiguruj połączenie".
5. **Scheduler**: zarejestruj cykliczny `syncIcpeRegistrations()` w istniejącym mechanizmie (np. co 10–15 min) + ręczne „Odśwież".

### Krok 2 — IPC + typy
1. Dodaj handlery IPC w `main` zgodnie z istniejącym wzorcem (np. `icpe:getSummary`, `icpe:getInstances`, `icpe:getRegistrations`, `icpe:markPaid`, `icpe:sync`).
2. Wystaw je w preload i otypuj w `src/renderer/types.d.ts` (mirror istniejących definicji).
3. Współdzielone typy DTO umieść w `src/shared/types.ts`.

### Krok 3 — UI (renderer): osobna karta w zakładce ICPE
1. Utwórz `src/renderer/screens/IcpeRegistrationsPanel.tsx` (lub `IcpeEventsPanel.tsx`) jako kartę opartą o atom `Panel`, w stylu `IcpeContactsPanel.tsx`.
2. **Osadź ją jako osobną kartę** w `src/renderer/screens/Icpe.tsx` — obok istniejących paneli (zachowaj układ/siatkę zakładki).
3. Zawartość karty:
   - Nagłówek z `Eyebrow` „REJESTRACJE ICPE" + przycisk „Odśwież" i znacznik „ostatnia synchronizacja".
   - Pasek KPI (otwarte eventy, zgłoszenia, potwierdzone, przychód, obłożenie %) — `Chip`/kafelki.
   - Selektor aktywnego eventu (dropdown po instancjach) i lista/tabela zgłoszeń: imię i nazwisko, liczba uczestników (w tym dzieci), preferowany/przydzielony pokój, kwota, status płatności (kolorowy `Chip`).
   - Akcje na wierszu (jeśli włączone zapisy): „Oznacz opłacone", zmiana statusu.
   - Stany: ładowanie (skeleton w stylu repo), pusty, błąd, „brak konfiguracji".
4. Trzymaj się istniejącej typografii/kolorów/atomów — bez nowego design systemu.

### Konfiguracja (do udokumentowania w README integracji)
- `ICPE_API_BASE_URL` — adres backendu rejestracji.
- `ICPE_API_TOKEN` — token serwisowy admina (read + opcjonalnie write).
- `ICPE_API_MODE` — `mock` (fixtures) lub `live`.

### Kryteria akceptacji
- [ ] Nowa karta widoczna jako **osobny panel w zakładce ICPE**, spójna wizualnie z resztą.
- [ ] W trybie `mock` karta renderuje realistyczne dane bez backendu.
- [ ] W trybie `live` dane pobierają się z API, cache w SQLite, działa „Odśwież" i auto-sync.
- [ ] KPI + lista zgłoszeń z filtrami; statusy płatności czytelnie oznaczone.
- [ ] (Jeśli włączone) akcja „Oznacz opłacone" wywołuje API i odświeża widok.
- [ ] Brak konfiguracji → przyjazny stan „skonfiguruj połączenie", bez crashy.
- [ ] Migracja Drizzle wygenerowana i aplikowalna; typy spójne main↔renderer.
- [ ] Zero nowych zależności, jeśli repo ma już rozwiązanie; kod zgodny z istniejącym lintem/formatowaniem.

Zacznij od przeczytania plików z Kroku 0 i krótkiego planu (jakie pliki utworzysz/zmienisz), potem implementuj.

---

## Uwaga o spójności obu systemów
Backend ICPE (osobny projekt — patrz `01-architektura-backend.md`) musi wystawić **token serwisowy admina** dla Personal OS oraz endpointy `/admin/*` opisane wyżej. To jedyny punkt styku — Personal OS nie łączy się bezpośrednio z bazą rejestracji, tylko przez REST API (czysta granica, bezpieczne, łatwe do utrzymania).
