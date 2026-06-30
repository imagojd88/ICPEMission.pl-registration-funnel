# Prompt do wątku Personal OS — wyświetlanie linku do strony eventu

Skopiuj poniższe do nowego wątku pracującego nad aplikacją **Personal OS (Jacek OS, Electron)**.

---

## Kontekst

W aplikacji **Personal OS** (Electron, ścieżka projektu: `~/Local Sites/Jacek OS/Jacek OS`) jest zakładka **ICPE**, która synchronizuje i wyświetla eventy z zewnętrznego backendu rejestracji ICPE (REST API, NestJS). Karta eventu pokazuje już dane (tytuł, daty, lokalizacja, liczba zgłoszeń), ale **brakuje publicznego linku do strony rejestracji** — a przydaje się mieć go pod ręką (do wysłania uczestnikom, skopiowania, otwarcia).

Integracja jest opisana w `05-prompt-personal-os-integracja.md` (warstwa IPC/preload, sekrety przez keytar, sync do SQLite). To zadanie jest **rozszerzeniem** tamtej integracji — trzymaj się tych samych wzorców.

## Co się zmieniło po stronie backendu (już wdrożone)

Backend ICPE zwraca teraz pole **`slug`** dla każdej instancji eventu:

- `GET /admin/instances` — każdy element listy ma `slug` (string lub `null`).
- `GET /admin/instances/:id` — w odpowiedzi jest `slug`.

Z `slug` buduje się publiczny link do strony rejestracji:

```
{ICPE_PUBLIC_BASE_URL}/r/{slug}
```

gdzie `ICPE_PUBLIC_BASE_URL` to nowy parametr konfiguracji (domyślnie `https://rejestracja.icpemission.pl`). Przykład: dla `slug = "5september"` link to `https://rejestracja.icpemission.pl/r/5september`.

## Zadanie

Dodaj w zakładce ICPE wyświetlanie i obsługę publicznego linku eventu.

### 1. Konfiguracja
- Dodaj nowy parametr **`ICPE_PUBLIC_BASE_URL`** obok istniejących `ICPE_API_BASE_URL`, `ICPE_API_TOKEN`, `ICPE_API_MODE` (w `src/main/secrets.ts` / warstwie sekretów przez keytar).
- Wartość domyślna: `https://rejestracja.icpemission.pl`. Bez ukośnika na końcu (przy budowie linku zadbaj o brak podwójnego `/`).

### 2. Cache / model danych (SQLite)
- Dodaj kolumnę **`slug TEXT`** do tabeli instancji ICPE.
- W funkcji synchronizującej (`syncIcpeRegistrations()` / upsert instancji) zapisuj `slug` z odpowiedzi API (idempotentnie po `id`).

### 3. UI — karta / szczegóły eventu
- Jeśli `slug` jest niepuste, pokaż wiersz **„Link do rejestracji"** z pełnym adresem `{ICPE_PUBLIC_BASE_URL}/r/{slug}`.
- Dwie akcje:
  - **Kopiuj** — kopiuje link do schowka (`clipboard.writeText`), z krótkim potwierdzeniem („Skopiowano").
  - **Otwórz** — otwiera link w domyślnej przeglądarce (`shell.openExternal`), **nie** w oknie aplikacji.
- Jeśli `slug` jest `null` (event bez skonfigurowanej strony), pokaż dyskretną informację „Brak strony rejestracji" zamiast linku — bez błędu.

### 4. IPC / preload
- Jeśli otwieranie linku idzie przez `main` (zalecane, bo `shell.openExternal` jest w procesie main), dodaj kanał IPC typu `icpeOpenExternal(url)` zgodnie z istniejącym wzorcem `window.<api>` i typami w `src/renderer/types.d.ts`. Kopiowanie do schowka może być w rendererze (`navigator.clipboard`) lub przez `clipboard` w main — wybierz zgodnie z resztą kodu.

### Kryteria akceptacji
- Karta eventu z ustawioną stroną pokazuje pełny link `https://rejestracja.icpemission.pl/r/<slug>`.
- „Kopiuj" wrzuca link do schowka; „Otwórz" otwiera go w przeglądarce systemowej.
- Event bez `slug` nie wywala UI — pokazuje „Brak strony rejestracji".
- `ICPE_PUBLIC_BASE_URL` da się zmienić w konfiguracji (np. gdyby domena była inna).

### Uwaga
Dopóki domena `rejestracja.icpemission.pl` nie jest jeszcze podpięta przez DNS, tymczasowy adres frontu to `https://icpe-frontend.onrender.com`. Jeśli testujesz przed podpięciem DNS, ustaw `ICPE_PUBLIC_BASE_URL=https://icpe-frontend.onrender.com`. Docelowo zostaw domyślne `https://rejestracja.icpemission.pl`.
