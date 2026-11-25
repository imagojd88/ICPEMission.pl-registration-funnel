# 17 — Tablica zakwaterowania (drag and drop) w panelu admina

> Status: **PLAN, bez zmian w kodzie** (25.11.2026). Przygotowany przez osobnego agenta po przeczytaniu repozytorium.
> Powiązane: `16-kalkulacja-oplat-rekolekcje-h2o-2027.md` (cennik, inwentarz miejsc, terminy umowy).
> Oznaczenia: **[kod]** = sprawdzone w repozytorium, **[założenie]** = do potwierdzenia.

---

## 1. Stan zastany

**Stack [kod]:** monorepo npm workspaces.
- `app/`: React 18.3 + Vite 5 + TypeScript + Tailwind 3, `lucide-react`, `react-router-dom` 6. Brak biblioteki DnD i biblioteki stanu (sam `useState`).
- `api/`: NestJS 10 + Prisma 5 + PostgreSQL (Render, `icpe-db`). Brak bibliotek XLSX/PDF.
- `shared/`: `@icpe/shared` (typy DTO, silnik wyceny), lustrzana kopia w `api/src/_shared/` (synchronizowana ręcznie).
- Schemat wchodzi na produkcję przez `prisma db push` przy starcie, bez plików migracji. Seed (`api/prisma/seed.ts`) nie jest uruchamiany na Render.
- Brak WebSocket/SSE; panel odświeża dane pollingiem (`app/src/hooks/useAutoRefresh.ts`).

**Panel admina [kod]:** `app/src/pages/AdminPanel.tsx` przełącza ekrany stanem `view`. Zakładka „Zakwaterowanie” już istnieje: `app/src/components/admin/accommodation/AccommodationScreen.tsx`. To lista zgłoszeń z polem tekstowym „Nr pokoju” i komentarzem, zapisywana przez `PATCH /admin/registrations/:id/accommodation` do `Registration.roomLabel` / `roomNote`. Teksty po polsku na sztywno, style przez zmienne CSS (`--surface`, `--brand`, `--ok`, `--warn`, `--err`), tryb jasny i ciemny.

**Model rejestracji [kod]** (`api/prisma/schema.prisma`):
- `Registration`: `instanceId`, `status` (DRAFT / PENDING_PAYMENT / AWAITING_TRANSFER / CONFIRMED / WAITLIST / CANCELLED), `contact` (JSON, w tym `community`, `parish`), `roomsJson` (`[{roomId, participantIndexes}]`, gdzie `roomId` to typ pokoju z `pricingConfig.rooms`), `dietaryNotes`, `roomLabel`, `roomNote`, `roomsReserved`, `editToken`.
- `Participant`: `type` (ADULT / CHILD), `firstName`, `lastName`, `age Int?`, `birthDate?`, `gender`, `dietary String?` (tekst po polsku).
- `RoomType`, `Room`, `RoomAssignment` istnieją, ale są praktycznie martwe: jedyny zapis to `POST /admin/registrations/:id/assign-room` (bez UI), pokoje mają etykiety „1”, „2”…, bez budynku, łóżek i części.
- Limity i rezerwa pokoi (`stock`, `reserved`, `api/src/registrations/room-stock.ts`) działają na poziomie typu pokoju z cennika, nie fizycznych pokoi.

**Braki, które ta funkcja ujawnia [kod]:**
1. `RegistrationsService.adminUpdate()` (`api/src/registrations/registrations.service.ts`, ok. linii 313–317) przy każdej edycji zgłoszenia **kasuje i tworzy od nowa wszystkich uczestników**. Identyfikatory osób są niestabilne, więc przydział łóżka by znikał. Warunek wstępny (etap 0).
2. Nie ma pól: pokój dla wózka, „chcę mieszkać z…”, „nie górne łóżko”. Uwagi gościa trafiają jako tekst do `Registration.dietaryNotes`.
3. Wiek dorosłych najpewniej nie jest zbierany (w `PublicFunnel.tsx` domyślny dorosły ma `age: 0`).
4. Diety w `app/src/lib/diets.ts`: `no_meat`, `vegan`, `gluten_free`, `lactose_free`, `nut_free`, `kosher`; w bazie zostaje tylko tekst. Nie ma klucza „bezmleczna”.
5. `JwtAuthGuard` nie egzekwuje ról z `AdminRole` (SUPER_ADMIN / ADMIN / COORDINATOR).
6. `CONTRACT.md` wymienia `GET /admin/instances/:id/export.xlsx`, ale w `api/src` go nie ma.

---

## 2. Model danych

### D1. Nowe tabele zamiast rozbudowy `Room` / `RoomAssignment`
Stare tabele zostają nietknięte (korzysta z nich kontrakt Personal OS). Nowe: `Venue*` (obiekt wielokrotnego użytku) i `Lodging*` (stan konkretnego eventu). Wszystko addytywne, więc `prisma db push` doda je bez ryzyka.

### D2. Obiekt jako szablon, stan per event osobno
Struktura ośrodka jest wspólna i przypinana do eventu; blokady, notatki i przydziały żyją w tabelach eventu. Inny ośrodek = nowy `Venue` albo „Duplikuj obiekt”. Łóżka z przydziałami nie są kasowane, tylko wyłączane (`active = false`).

```prisma
enum VenueBuildingKind { HOSTEL HOTEL CABIN }
enum BedKind { SINGLE BUNK_LOWER BUNK_UPPER EXTRA }

model Venue {            // „Ośrodek h2o Kiczyce”
  id String @id @default(cuid())
  name String
  note String?
  buildings VenueBuilding[]
  plans LodgingPlan[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model VenueBuilding {    // Hostel / Hotel / Domki
  id String @id @default(cuid())
  venueId String
  venue Venue @relation(fields: [venueId], references: [id], onDelete: Cascade)
  kind VenueBuildingKind
  name String
  order Int @default(0)
  units VenueUnit[]
  @@index([venueId])
}

model VenueUnit {        // pokój albo domek
  id String @id @default(cuid())
  buildingId String
  building VenueBuilding @relation(fields: [buildingId], references: [id], onDelete: Cascade)
  label String           // "101", "106A", "4"
  accessible Boolean @default(false)   // łazienka dla wózków
  sharedBathKey String?  // "hotel-106" dla 106A i 106B
  order Int @default(0)
  sections VenueSection[]
  @@unique([buildingId, label])        // budynek jest częścią identyfikatora
}

model VenueSection {     // pomieszczenie z drzwiami: cel upuszczenia
  id String @id @default(cuid())
  unitId String
  unit VenueUnit @relation(fields: [unitId], references: [id], onDelete: Cascade)
  label String           // "" dla zwykłego pokoju, "A", "B", "C", "A parter", "A piętro"
  groupLabel String?     // "A" dla "A parter" + "A piętro" (wspólna łazienka)
  order Int @default(0)
  beds VenueBed[]
  @@unique([unitId, label])
}

model VenueBed {
  id String @id @default(cuid())
  sectionId String
  section VenueSection @relation(fields: [sectionId], references: [id], onDelete: Cascade)
  number Int             // nr miejsca (do „Wykazu osób”)
  kind BedKind
  active Boolean @default(true)
  @@unique([sectionId, number])
}

model LodgingPlan {      // obiekt przypięty do eventu
  id String @id @default(cuid())
  instanceId String @unique
  venueId String
  venue Venue @relation(fields: [venueId], references: [id])
  version Int @default(0)          // rośnie przy każdej zmianie (polling)
  settings Json?                   // progi wieku, patrz D5
  publishedAt DateTime?
  publishedBy String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model LodgingSectionState {        // blokada, notatka, dostawki per event
  id String @id @default(cuid())
  planId String
  sectionId String
  locked Boolean @default(false)
  lockReason String?               // "prelegenci", "kapłani", "organizatorzy"
  note String?
  extraBedsOpen Boolean @default(false)
  updatedBy String?
  updatedAt DateTime @updatedAt
  @@unique([planId, sectionId])
}

model LodgingAssignment {
  id String @id @default(cuid())
  planId String
  participantId String @unique     // jedna osoba = jedno miejsce
  participant Participant @relation(fields: [participantId], references: [id], onDelete: Cascade)
  registrationId String
  sectionId String
  bedId String?                    // null = bez łóżka (dziecko 0–2) albo łóżko nieustalone
  assignedBy String
  assignedAt DateTime @default(now())
  @@unique([planId, bedId])        // jedno łóżko = jedna osoba
  @@index([planId, sectionId])
  @@index([registrationId])
}

model LodgingChange {              // historia: kto, kiedy, co
  id String @id @default(cuid())
  planId String
  batchId String                   // jedna akcja admina = jeden batch
  actor String
  action String                    // ASSIGN | MOVE | UNASSIGN | LOCK | UNLOCK | NOTE | AUTO | PUBLISH | UNDO
  participantId String?
  personName String?               // migawka
  fromSectionId String?
  fromBedId String?
  toSectionId String?
  toBedId String?
  meta Json?
  createdAt DateTime @default(now())
  @@index([planId, createdAt])
}
```

Do istniejących modeli (pola nullable lub z wartością domyślną):
- `Participant`: `needsAccessible Boolean @default(false)`, `noUpperBunk Boolean @default(false)`, `dietKeys String[] @default([])`, relacja `lodging LodgingAssignment?`.
- `Registration`: `lodgingPrefs Json?` (`{ roommates?: string, notes?: string }`).
- `RoomTypeDef` w `shared/src/pricing.ts` (JSON): `lodgingKind?: 'HOSTEL' | 'HOTEL' | 'CABIN'`, żeby wiedzieć, jaki typ gość opłacił. Zmiana także w `api/src/_shared/pricing.ts`.

### D3. Dziecko 0–2 i poziom „pokój bez łóżka”
Przydział jest zawsze do sekcji, łóżko opcjonalne. Dziecko 0–2 ma `bedId = null` i nie liczy się do pojemności. MVP może działać na poziomie pokoju (serwer sam dobiera łóżka), a przestawianie konkretnych łóżek to rozszerzenie.

### D4. Seed inwentarza
Plik `api/prisma/venues/h2o-kiczyce.json` + idempotentny import `POST /admin/venues/import` (przycisk „Wczytaj inwentarz”), bo seed nie działa na Render.

| Budynek | Jednostki | Sekcje i łóżka |
|---|---|---|
| Hostel | 001 (dla wózków) | 2 pojedyncze |
| | 101, 102, 103, 105, 201, 202, 203, 205 | 2 pojedyncze + piętrowe dół/góra = 4 |
| | 104, 204 | 2 pojedyncze |
| | 106, 206 | 2 pojedyncze + 2 piętrowe = 6 |
| Hotel | 101, 102, 103 | 2 + 1 dostawka |
| | 104 | 3 + 2 dostawki |
| | 105 (dla wózków) | 2 + 2 dostawki |
| | 106A | 2 + 1 dostawka, `sharedBathKey: hotel-106` |
| | 106B | 2, `sharedBathKey: hotel-106` |
| Domki nieparzyste 1–13 | A, B | piętrowe + pojedyncze = 3 |
| | C | 4 pojedyncze |
| Domki parzyste 2–14 | „A parter” (`groupLabel A`) | 2 pojedyncze |
| | „A piętro” (`groupLabel A`) | piętrowe + 3 pojedyncze = 5 |
| | B | 2 piętrowe = 4 |

Razem 50 + 15 + 147 = **212 łóżek stałych + 8 dostawek**, w tym **47** górnych piętrowych (hostel 12, domki nieparzyste 14, parzyste 21). Numeracja miejsc wg formularza ośrodka (Załącznik 2, niebieska kolumna): w pokojach hostelu i hotelu 1…n (dostawki mają kolejne numery); w domkach nieparzystych osobno w każdej części (A 1–3, B 1–3, C 1–4); w domkach parzystych „A parter” 1–2 i „A piętro” 3–7 (ciągle w części A), B 1–4. Seed ma odwzorować dokładnie tę numerację.

### D5. Ustawienia planu (`LodgingPlan.settings`)
`{ infantMaxAge: 2, smallPortionMinAge: 3, smallPortionMaxAge: 9, upperBunkMinAge: 6, adultAge: 18, seniorAge: 60, ageAsOf: "2027-08-22" }`. Kategorie wieku liczy jedna funkcja `ageCategory()` w nowym `shared/src/lodging.ts` (lustro w `api/src/_shared/`).

### D6. Zgodność wstecz
Przy każdej zmianie przydziału serwer przelicza `Registration.roomLabel` (np. „Domek 4 · A”). Zgłoszenia, Obecność i Personal OS pokazują pokój bez zmian po swojej stronie.

---

## 3. UI/UX tablicy

**Wejście:** zakładka „Zakwaterowanie” dostaje przełącznik „Tablica | Lista”. Lista = obecny `AccommodationScreen` (zostaje dla eventów bez przypiętego obiektu). Tablica ma tryb pełnoekranowy.

**Nowe pliki** w `app/src/components/admin/accommodation/board/`: `LodgingBoard.tsx`, `BoardToolbar.tsx`, `UnassignedPanel.tsx`, `RegistrationCard.tsx`, `PersonChip.tsx`, `BuildingColumn.tsx`, `UnitCard.tsx`, `SectionDropZone.tsx`, `BedSlot.tsx`, `WarningsDrawer.tsx`, `HistoryDrawer.tsx`, `SuggestDialog.tsx`, `VenueAttachEmptyState.tsx`, `useLodgingBoard.ts`, `print/`. Klient API: `app/src/lib/lodging.ts`.

```
┌ Zakwaterowanie · Rekolekcje 22–27.08.2027 ──────────────────────────────────────────────────┐
│ Zajęte 96/212 (+0/8 dost.) │ Hostel 22/50 │ Hotel 9/15 │ Domki 65/147 │ Nieprzydzieleni: 74 │
│ Dorośli 61 · Młodzież 14 · Dzieci 3–9: 18 · 0–2: 3 │ Posiłki 96 (małe porcje 18)            │
│ Diety: std 80 · wege 9 · wegan 2 · bezgl. 4 · bezml. 1 │ ⚠ 7 │ ↶ ↷ │ Auto │ Eksport │ Publikuj │
├──────────────────────────┬──────────────────────────────────────────────────────────────────┤
│ NIEPRZYDZIELENI (74)     │ [Wszystko] [Hostel] [Hotel] [Domki]   □ tylko wolne  □ zwiń pełne│
│ 🔍 szukaj…               │                                                                  │
│ Wspólnota ▾  Typ ▾       │ ▌HOSTEL                                                          │
│ Płatność ▾  □ z prośbą   │ ┌ 001 ♿ ──┐ ┌ 101 ───────────┐ ┌ 104 ────┐ ┌ 106 ─────────────┐  │
│ ┌──────────────────────┐ │ │ ▭ ▭      │ │ ▭Anna K. ▭Jan K.│ │ ▭ ▭     │ │ ▭ ▭ ▥ ▥ ▥ ▥     │  │
│ │ Kowalscy · rodzina 5 │ │ │ 0/2      │ │ ▥d Ola  ▥g —    │ │ 0/2     │ │ 0/6 🔒 prelegenci│  │
│ │ ♂♀ + 14♀ 9♂ 1♀       │ │ └──────────┘ │ 3/4  ⚠ płeć     │ └─────────┘ └──────────────────┘  │
│ │ Warszawa · opłacone  │ │              └─────────────────┘                                 │
│ │ domek · „z Nowakami” │ │ ▌HOTEL                                                           │
│ └──────────────────────┘ │ ┌ 105 ♿ ───────┐ ┌ 106A ─────┐┄┌ 106B ──┐  (┄ = wspólna łazienka) │
│ ┌──────────────────────┐ │ │ ▭ ▭  +▫ +▫    │ │ ▭ ▭  +▫   │ │ ▭ ▭    │                         │
│ │ Nowak Piotr · 1 os.  │ │ └───────────────┘ └───────────┘ └────────┘                         │
│ │ ♂ 34 · Kraków · ⚠ nieopł.│ ▌DOMKI                                                         │
│ └──────────────────────┘ │ ┌ Domek 4 (11) ──────────────────────────────┐ ┌ Domek 5 (10) ─┐ │
│ …                        │ │ A parter ▭▭ ┄ A piętro ▥▥▭▭▭ │ B ▥▥▥▥       │ │ A ▥▥▭ │ B ▥▥▭ │ │
│                          │ │ ★ pasuje: Kowalscy (5)        │ 0/4          │ │ C ▭▭▭▭       │ │
└──────────────────────────┴─┴─────────────────────────────────────────────┴─┴───────────────┴─┘
  ▭ pojedyncze  ▥d/▥g piętrowe dół/góra  +▫ dostawka  ♿ dla wózków  🔒 zablokowany
```

**Karta rejestracji (lewa kolumna):** nazwisko, typ wyliczony ze składu (osoba / małżeństwo / rodzina N), ikony osób z wiekiem i płcią, wspólnota, plakietka płatności, opłacony typ zakwaterowania, prośba „z kim”, ♿. Chwyt za kartę przenosi wszystkich; po rozwinięciu każdą osobę da się przeciągnąć osobno. Rejestracja częściowo przydzielona zostaje na liście z licznikiem „3/5”.

**Prawa strona:** kolumny budynków, karta jednostki z sekcjami. Kolory typów z istniejących tokenów (hostel `--ok`, hotel `--brand`, domki `--accent`), zawsze z podpisem tekstowym. Zajęte łóżko pokazuje imię, inicjał nazwiska i kolorową kreskę rejestracji (ta sama rodzina = ten sam kolor), więc rozbicie rodziny widać od razu.

**Stany drag and drop:**
- podniesienie: nakładka z kartą i licznikiem osób, źródło przygaszone;
- nad sekcją: zielona ramka gdy się mieści, żółta z krótkim powodem gdy mieści się z ostrzeżeniem, czerwona gdy brak miejsc lub blokada;
- podczas przeciągania pasujące sekcje dostają „★ pasuje”;
- upuszczenie: zmiana optymistyczna, zapis w tle; błąd 409 cofa ruch z komunikatem „ktoś inny zmienił ten pokój”.

**Bez przeciągania (dotyk i klawiatura):** klik w kartę lub osobę ją zaznacza („Wybrano: Kowalscy (5). Wskaż pokój”), klik w sekcję lub łóżko przydziela. Poniżej ok. 900 px układ zmienia się w dwie zakładki („Osoby”, „Pokoje”) i działa tylko ten tryb. Klawiatura: Tab, Spacja podnosi, strzałki wybierają cel, Enter upuszcza, Esc anuluje. `Ctrl/Cmd+Z` cofa.

**Ostrzeżenia:** plakietka na sekcji i na osobie, pełna lista w panelu bocznym (klik przewija do pokoju). Trzy poziomy: błąd, ostrzeżenie, informacja.

**Menu sekcji (⋯):** zablokuj z powodem, notatka, otwórz dostawki (hotel), wyczyść pokój, historia pokoju, „zaproponuj mieszkańców”.

**Puste stany:** event bez obiektu → „Przypnij obiekt” (+ „Wczytaj inwentarz h2o”); brak zgłoszeń; wszyscy przydzieleni („Wszyscy mają miejsce. Możesz wygenerować Wykaz osób.”); filtr bez wyników.

---

## 4. Biblioteka drag and drop

**Rekomendacja: `@dnd-kit/core`** (+ `@dnd-kit/utilities`):
- działa z React 18 i nie narzuca struktury list, a tu celem jest siatka pokoi i łóżek;
- ma sensory myszy, dotyku i klawiatury oraz komunikaty dla czytników ekranu;
- `DragOverlay` pozwala przeciągać całą rodzinę jako jedną kartę, a własne funkcje kolizji celować w sekcję lub łóżko;
- nie wymaga zmian w Tailwind ani w buildzie Vite.

**Alternatywa: `@atlaskit/pragmatic-drag-and-drop`** (lżejsza, natywne HTML5 DnD; słabszy dotyk, klawiaturę trzeba zbudować samemu). `react-beautiful-dnd` odpada (porzucony), `@hello-pangea/dnd` jest nastawione na listy.

Uwagi: aktualną wersję sprawdzić przy instalacji. `npm install` nie działa w sandboxie na zamontowanym folderze, więc dodanie zależności musi pójść z maszyny Jacka. Tryb „kliknij → kliknij” nie wymaga biblioteki, dlatego wchodzi w MVP jako pierwszy.

---

## 5. API, walidacje, uprawnienia

Nowy moduł `api/src/lodging/`: `lodging.module.ts`, `venues.controller.ts`, `lodging.admin.controller.ts`, `lodging.service.ts`, `lodging-export.service.ts`, `lodging-suggest.ts`, `dto/`. Wszystko pod `JwtAuthGuard`.

| Metoda i ścieżka | Opis |
|---|---|
| `GET /admin/venues`, `GET /admin/venues/:id` | lista i struktura obiektu |
| `POST /admin/venues/import` | idempotentny import JSON (seed h2o) |
| `POST /admin/venues/:id/duplicate` | kopia obiektu do edycji |
| `PUT /admin/instances/:id/lodging` `{ venueId, settings? }` | przypięcie obiektu do eventu |
| `GET /admin/instances/:id/lodging/board?since=<version>` | cała tablica; przy niezmienionej wersji tylko `{ version }` |
| `POST /admin/instances/:id/lodging/moves` | `{ batchId, moves: [{ participantId, expectSectionId, toSectionId \| null, toBedId? }], force? }` |
| `PATCH /admin/instances/:id/lodging/sections/:sectionId` | blokada, powód, notatka, dostawki |
| `POST /admin/instances/:id/lodging/suggest` | propozycja auto-przydziału (bez zapisu) |
| `GET /admin/instances/:id/lodging/history` | historia, filtr po osobie lub sekcji |
| `POST /admin/instances/:id/lodging/publish` / `unpublish` | publikacja widoku uczestnika |
| `GET /admin/instances/:id/lodging/export/wykaz.xlsx` / `recepcja.xlsx` | eksporty |
| `GET /registrations/manage/:token` (rozszerzenie) | pole `lodging` tylko po publikacji |

**Współbieżność (D7):** każde polecenie niesie `expectSectionId` (gdzie klient widział osobę). Serwer w jednej transakcji sprawdza stan, zapisuje, podbija `LodgingPlan.version`, dopisuje `LodgingChange`. Konflikt daje **409** ze świeżym fragmentem tablicy. Klient odpytuje `board?since=` co ok. 5 s (wstrzymane przy ukrytej karcie i w trakcie przeciągania). SSE/WebSocket pominięte: polling jest już wzorcem w repo.

**Cofnij/ponów:** stos odwrotnych poleceń po stronie klienta (do końca sesji); cofnięcie to zwykłe `moves` z akcją `UNDO`. Trwała historia w `LodgingChange`.

**Twarde odmowy serwera (400/409):** osoba spoza eventu, zgłoszenie anulowane, łóżko zajęte, przekroczona liczba łóżek stałych przy zamkniętych dostawkach, sekcja zablokowana (chyba że `force: true`, odnotowane w historii), łóżko spoza wskazanej sekcji.

**Ostrzeżenia miękkie** (nie blokują; jedna funkcja `lodgingWarnings()` w `shared/src/lodging.ts` dla frontu i API):

| Kod | Warunek |
|---|---|
| `MIXED_GENDER` | w sekcji osoby ≥ 10 lat różnej płci z różnych rejestracji |
| `UPPER_BUNK_ADULT` | osoba 18+ albo z `noUpperBunk` na górnym łóżku |
| `UPPER_BUNK_SMALL_CHILD` | dziecko poniżej `upperBunkMinAge` na górnym łóżku |
| `NEEDS_ACCESSIBLE` | osoba z `needsAccessible` poza Hostel 001 / Hotel 105 |
| `FAMILY_SPLIT` | rejestracja rozbita na więcej niż jedną sekcję; ostrzeżenie gdy dziecko < 10 lat jest bez dorosłego ze swojej rejestracji |
| `TYPE_MISMATCH` | budynek inny niż opłacony typ („hotel: możliwa dopłata”) |
| `UNPAID` | status inny niż CONFIRMED |
| `EXTRA_BED_USED` | zajęta dostawka |
| `LOCKED_OCCUPIED` | ktoś mieszka w zablokowanej sekcji |
| `ROOMMATE_REQUEST` | rejestracja ma prośbę „z kim” (informacja) |
| `NO_LODGING` | osoba bez noclegu w `roomsJson`, a ma łóżko |

**Uprawnienia [założenie]:** edycja przydziałów dla wszystkich ról admina; import obiektu, „zastosuj auto-przydział dla wszystkich”, „wyczyść plan” i publikacja tylko SUPER_ADMIN / ADMIN. Wymaga małego `RolesGuard`.

**Zmiany w istniejącym kodzie:**
- `RegistrationsService.adminUpdate()`: aktualizować uczestników zamiast kasować (update istniejących, create nowych, delete nadmiarowych). To samo sprawdzić w `invitations.service.ts` (`syncRegistration`).
- Anulowanie zgłoszenia zwalnia łóżka i dopisuje wpis do historii.
- DTO: opcjonalne `needsAccessible`, `noUpperBunk`, `dietKeys`; `lodgingPrefs` na zgłoszeniu. Pola w lejku włączane per event (jak diety), z tłumaczeniami PL/EN/IT/KO/ZH.
- `CONTRACT.md` i `shared/src/types.ts` (+ lustro) uzupełnić o nowe DTO.

---

## 6. Auto-sugestia przydziału

Czysta funkcja `suggestLodging(board, options)` w `shared/src/lodging.ts`, deterministyczna, testowana przez `node --test`. Nigdy nie zapisuje sama: zwraca proponowane ruchy z uzasadnieniem, admin akceptuje całość albo wybrane pozycje; zastosowanie to jeden batch (jedno „cofnij”).

**Zasady stałe:** nie rusza istniejących przydziałów ani zablokowanych sekcji; dzieci 0–2 nie zajmują łóżek; domyślnie trzyma się opłaconego typu; dostawek używa tylko po jawnym włączeniu.

**Kolejność:**
1. **Wózki.** Rejestracje z `needsAccessible` → Hostel 001 lub Hotel 105. Brak wolnego → „wymaga decyzji”.
2. **Rodziny wielodzietne.** 8+ osób z łóżkiem → cały domek. 5–7 osób → część A domku parzystego (rodzice na parterze, dzieci na piętrze). Gdy zabraknie części A (jest ich 7) → dwie sąsiednie części domku nieparzystego.
3. **Mniejsze rodziny.** 4 osoby → sekcja 4-osobowa (domek nieparzysty C, hostel 4-os., domek parzysty B gdy są dzieci na górne łóżka); 3 osoby → A lub B domku nieparzystego, hotel 104.
4. **Małżeństwa.** Pokoje 2-osobowe: hotel (gdy opłacony), Hostel 104 i 204, „A parter” domków parzystych, w których piętro nie jest zajęte przez rodzinę.
5. **Osoby pojedyncze.** Grupowanie po płci, potem po wspólnocie, potem po wieku; dopełnianie sekcji już zaczętych, zanim otworzy się nową.

**Dobór sekcji:** najniższa kara. Kara rośnie za: zmarnowane łóżka, niezgodność typu z opłaconym, dorosłego na górnym łóżku, mieszanie płci, rozbicie grupy, rozdzielenie wspólnoty.

**Dobór łóżek w sekcji:** osoby z `noUpperBunk` i najstarsze → pojedyncze, potem dolne piętrowe; górne dostają najmłodsi, ale nie młodsi niż `upperBunkMinAge`.

Ten sam mechanizm obsługuje podpowiedzi na żywo („★ pasuje” przy podniesieniu karty) i „zaproponuj mieszkańców” w menu sekcji.

---

## 7. Eksporty

**Technika:** XLSX w API biblioteką `exceljs` (nowa zależność); PDF jako widoki do druku w przeglądarce (`@media print`), bez nowej zależności.

1. **„Wykaz osób” dla ośrodka** (`wykaz.xlsx` + druk), dokładnie kolumny: `Domek/pokój` | `Nr miejsca` | `Imię i nazwisko` | `Dieta` | `Mniejsza porcja`. Sortowanie: Hostel → Hotel → Domki, potem numer, część, nr miejsca. Etykiety jednoznaczne: „Hostel 101”, „Hotel 101”, „Domek 4 – A piętro”. Dieta pusta = standard. „X” wg wieku z ustawień planu (Q1). Dzieci 0–2 pod rodzicem z dopiskiem „bez łóżka” (Q7). Wolne łóżka jako puste wiersze (opcja). Pod tabelą podsumowanie osób, małych porcji i diet.
2. **Lista dla recepcji** (`recepcja.xlsx` + druk): alfabetycznie → imię, pokój, miejsce, wspólnota, status płatności, kwota do zapłaty na miejscu, telefon zgłaszającego, rubryka na podpis lub klucz.
3. **Karteczki na drzwi** (druk, A5 poziomo): „Domek 4 · część A”, lista imion i nazwisk, wspólnota małym drukiem; bez wieku, diet i płatności.
4. **Dla kuchni** (dodatek): zestawienie posiłków i diet per kategoria wieku.

Przy eksporcie z nieprzydzielonymi osobami pojawia się ostrzeżenie z liczbą braków; eksport i tak jest możliwy.

---

## 8. Etapy wdrożenia

Szacunki w dniach roboczych. Weryfikacja wg konwencji repo: `npx tsc --noEmit` w `api` i `app`, `vite build --outDir /tmp/…`, `node --test`, test przeglądarkowy na atrapie API.

| Etap | Zakres | Praca | Kryteria akceptacji |
|---|---|---|---|
| **0. Fundamenty** | Stabilne id uczestników w `adminUpdate` i sync zaproszeń; `shared/src/lodging.ts` + lustro | 1 d | Edycja zgłoszenia nie zmienia `Participant.id`; istniejące testy przechodzą |
| **1. Model i inwentarz** | Tabele `Venue*` / `Lodging*`, import JSON h2o, przypięcie obiektu do eventu, `GET board` | 2 d | Po imporcie: 14 + 7 + 14 jednostek, 212 łóżek + 8 dostawek, 47 górnych; ponowny import nic nie dubluje; Hostel 101 i Hotel 101 rozróżnialne |
| **2. MVP tablicy** | Układ, lista nieprzydzielonych z wyszukiwarką i filtrami, przydział „kliknij → kliknij” rejestracji i pojedynczych osób z automatycznym doborem łóżek, liczniki, twarde walidacje, `roomLabel` w tle | 3 d | Da się rozmieścić 170 osób testowych, także na telefonie; przepełnienia serwer nie przyjmuje; dziecko 0–2 nie zmniejsza liczby wolnych łóżek |
| **3. Drag and drop i łóżka** | `@dnd-kit`, stany upuszczania, przenoszenie między łóżkami, klawiatura, cofnij/ponów, blokady i notatki, dostawki | 2,5 d | Przeciąganie myszą i dotykiem; obsługa z klawiatury; cofnięcie przywraca poprzedni stan; zablokowany pokój odrzuca upuszczenie |
| **4. Ostrzeżenia, historia, współbieżność** | Komplet ostrzeżeń, historia zmian, polling wersji, obsługa 409, liczniki posiłków i diet | 2 d | Zmiana z jednego okna widoczna w drugim w ≤ 10 s; jednoczesne zajęcie łóżka kończy się komunikatem; każda zmiana ma autora i czas |
| **5. Eksporty** | `exceljs`, Wykaz osób, recepcja, karteczki, widoki druku | 2 d | Wykaz ma dokładnie 5 kolumn w zadanej kolejności; plik otwiera się w polskim Excelu z poprawnymi znakami |
| **6. Dane z lejka** | Pola: wózek, „nie górne łóżko”, „z kim”, `dietKeys`, `lodgingKind` w cenniku; edycja w `RegistrationEditForm.tsx`; tłumaczenia 5 języków | 1,5 d | Zgłoszenie z zaznaczonym wózkiem daje ostrzeżenie poza 001/105; liczniki diet liczone z kluczy |
| **7. Auto-sugestia** | `suggestLodging`, okno propozycji, podpowiedzi „★ pasuje” | 2 d | Wózki w 001/105, rodziny 5–7 w części A domków parzystych, 8+ w całym domku; wynik powtarzalny; jedno „cofnij” wycofuje całość |
| **8. Widok uczestnika** (opcja) | Publikacja planu, blok „Twój pokój” na `/z/:token` (`ManageRegistration.tsx`), opcjonalny mail przez Resend | 1 d | Przed publikacją gość nie widzi nic; po publikacji widzi „Domek 4, część A” w swoim języku |

Razem ok. **17 dni**; MVP używalne po etapach 0–2 (ok. 6 dni), komplet potrzebny ośrodkowi po etapie 5. Etap 6 warto zamknąć przed otwarciem zapisów, bo pola w lejku muszą być dostępne od pierwszego zgłoszenia. Termin zewnętrzny: Wykaz osób do 15.08.2027.

---

## 9. Ryzyka i pytania do Jacka

**Ryzyka**
- **R1. Górne łóżka.** 165 łóżek pojedynczych lub dolnych i 47 górnych. Przy 170 osobach dorośli unikną górnych tylko, jeśli dzieci i młodzież zajmą ich wystarczająco dużo.
- **R2. Pokoje dla par.** Dwuosobowych jest ok. 16, z czego 7 („A parter”) konkuruje z rodzinami wielodzietnymi.
- **R3. Niestabilne id uczestników.** Bez etapu 0 przydziały będą znikać po każdej edycji zgłoszenia.
- **R4. Wiek zapisany jako liczba w dniu rejestracji.** Dziecko może przekroczyć próg (2→3, 9→10) przed sierpniem 2027.
- **R5. Brak wieku dorosłych**, więc „osoba starsza” tylko flagą „nie górne łóżko”.
- **R6. `prisma db push` na produkcji:** tylko zmiany addytywne; po wdrożeniu Manual Deploy `icpe-api`.
- **R7. Synchronizacja `shared/src` ↔ `api/src/_shared`.**
- **R8. Personal OS** korzysta z `PATCH /admin/registrations/:id` i `assign-room`; potrzebny krótki handoff, żeby nie nadpisywał `roomLabel`.
- **R9. Dane dzieci** na karteczkach i wydrukach: minimalizować zakres.

**Pytania** (odpowiedzi Jacka z 25.11.2026 w sekcji 10)
- **Q1.** Mniejsza porcja: 3–9 czy 3–10 lat (do potwierdzenia z ośrodkiem)?
- **Q2.** Wiek liczony na 22.08.2027? Czy zbierać datę urodzenia dzieci zamiast wieku?
- **Q3.** Czy będą osoby dojeżdżające (posiłki bez łóżka)?
- **Q4.** Czy gość wybiera typ (hostel / hotel / domek), czy jest jedna cena i przydział po stronie organizatora?
- **Q5.** Dostawki w hotelu: używamy, a jeśli tak, to dla kogo?
- **Q6.** Czy ośrodek ma własną numerację miejsc, czy przyjmuje naszą?
- **Q7.** Dzieci 0–2 w Wykazie: wpisywać z dopiskiem „bez łóżka”, czy pomijać?
- **Q8.** Mieszanie płci: od jakiego wieku ostrzegać (propozycja: od 10 lat)?
- **Q9.** „Bezmleczna” = obecna „Bez laktozy”? „Bez mięsa” = „wegetariańska”?
- **Q10.** Czy dwa małżeństwa mogą dzielić pokój 4-osobowy, a pojedyncze osoby dołączać do części domku zajętej przez rodzinę?
- **Q11.** Kto poza Tobą będzie układał pokoje i czy koordynator ma mieć ograniczone uprawnienia?
- **Q12.** Widok uczestnika: strona zgłoszenia `/z/:token` plus mail, czy także panel kursanta `/formacja`?
- **Q13.** Które pokoje z góry zablokować (prelegenci, kapłani, organizatorzy)?
- **Q14.** „Chcę mieszkać z…”: wolny tekst czy wybór konkretnego zgłoszenia?

---

## 10. Decyzje Jacka (25.11.2026)

| Nr | Decyzja | Skutek dla projektu |
|---|---|---|
| R4, Q2 | Pytamy o wiek w latach skończonych na dzień rozpoczęcia wydarzenia. | Etykieta pola w lejku: „Wiek w dniu rozpoczęcia (22.08.2027)”. `ageAsOf` zostaje w ustawieniach planu. Daty urodzenia tylko w kontach gości (sekcja 11.3). |
| Q1 | Próg mniejszej porcji (3–9 czy 3–10): czeka na odpowiedź ośrodka. | Próg w `LodgingPlan.settings`, zmiana bez wdrożenia. |
| Q3 | Nie będzie osób dojeżdżających. | Nocleg obowiązkowy (`accommodationOptional` wyłączone). |
| Q4 | Przydziela organizator. Gość wybiera tylko: „Domek na wyłączność”, „Pokój dla małżeństwa”, „Miejsce w pokoju z innymi gośćmi” oraz „Pokój jednoosobowy” (płaci jak za dwie osoby). | Typy w cenniku to kategorie, nie budynki. `lodgingKind` z D2 zastępuje `lodgingClass: 'CABIN_EXCLUSIVE' \| 'COUPLE' \| 'SHARED' \| 'SINGLE' \| 'FAMILY'`. Ostrzeżenie `TYPE_MISMATCH` porównuje klasę z faktycznym przydziałem (np. „jedynka” z kimś w pokoju, obca osoba w domku na wyłączność). Do decyzji: piąta opcja „Pokój rodzinny” dla rodzin, które nie biorą całego domku. |
| Q5, Q7 | Dostawki dla dzieci; najmłodszym (0–2) proponujemy dostawkę. | Dziecko 0–2 domyślnie bez łóżka, admin może je położyć na dostawce. Dostawki są tylko w hotelu (8 szt.); łóżeczka w domkach do ustalenia z ośrodkiem. |
| Q6 | Numeracja miejsc jest w formularzu ośrodka. | Patrz D4 (poprawione). |
| Q8 | Nie mieszamy płci poza rodzinami. | `MIXED_GENDER` to błąd: upuszczenie wymaga świadomego potwierdzenia („mimo to”), auto-sugestia nigdy tak nie proponuje. Wyjątek: osoby z jednej rejestracji. |
| Q9 | „Bezmleczna” = „Bez laktozy”, „Bez mięsa” = „wegetariańska”. | Eksport mapuje klucze na nazwy ośrodka: `no_meat` → wegetariańska, `vegan` → wegańska, `gluten_free` → bezglutenowa, `lactose_free` → bezmleczna. |
| Q10 | Małżeństwa nie dzielą pokoju z nikim; rodziny mają autonomię. | Sekcja zajęta przez małżeństwo lub rodzinę jest zamknięta dla innych rejestracji (błąd z potwierdzeniem). W domku parzystym „A parter” i „A piętro” traktowane jako jedna jednostka (wspólna łazienka). Auto-sugestia nie dopełnia takich sekcji. |
| Q11 | Nowy poziom dostępu: pomocnik jednego wskazanego eventu w wybranym zakresie + osobny frontend „Rejestracja”. | Sekcja 11.1 i 11.2. |
| Q12 | Widok uczestnika: strona `/z/:token` plus mail. | Etap 8 bez zmian; sekcja materiałów po założeniu konta: 11.3. |
| Q13 | Blokada pokoi dla VIP-ów: około 5 pokoi dla małżeństw (hostel) i 2–3 jedynki dla księży. | Blokada sekcji z powodem (jest w planie). Uwaga: hostel ma tylko 3 pokoje 2-osobowe (001, 104, 204); pozostałe pary VIP w pokojach 4-osobowych hostelu albo w hotelu. |
| Q14 | „Chcę mieszkać z…”: wybór konkretnego zgłoszenia. | Pole w lejku: kod zgłoszenia lub e-mail zgłaszającego; `lodgingPrefs.roommateRegistrationIds`. Tablica pokazuje powiązane zgłoszenia obok siebie, auto-sugestia nagradza sąsiedztwo. |

## 11. Zakres dodany po odpowiedziach

### 11.1 Uprawnienia per event
- Nowa rola `EVENT_STAFF` w `AdminRole` oraz tabela `EventStaffGrant { adminUserId, instanceId, scopes String[], createdBy, expiresAt? }`.
- Zakresy: `checkin` (obecność), `payments` (wpisywanie wpłat), `keys` (wydanie i zwrot klucza), `requests` (prośby dodatkowe), `lodging.view`, `lodging.edit`, `participants.view`.
- `RolesGuard` + `EventScopeGuard`: konto `EVENT_STAFF` widzi tylko wskazany event i tylko końcówki z przyznanych zakresów. Zarządzanie w panelu: „Edytuj event ▸ Pomocnicy” (zaproszenie e-mailem, wybór zakresów, odebranie dostępu).
- [kod] Dziś `AdminUser` ma tylko pole `role`, a guard ról nie sprawdza, więc to wspólny fundament z uprawnieniami tablicy.

### 11.2 Frontend „Rejestracja” (stanowisko przyjęć)
- Osobna trasa w `app/` (np. `/rejestracja/:instanceId`), układ pod telefon i tablet, logowanie kontem pomocnika.
- Ekran: wyszukiwarka po nazwisku, karta zgłoszenia z osobami, pokojem, kwotą do zapłaty.
- Akcje: oznacz obecność (istniejące `Registration.checkedInAt`), wpisz wpłatę (istniejący model `Payment`, metoda gotówka lub przelew, z autorem), potwierdź wydanie i zwrot klucza, dopisz prośbę dodatkową (dieta, dostawka, inne).
- Nowe pola: `Registration.keyIssuedAt`, `keyIssuedBy`, `keyReturnedAt`; tabela `RegistrationRequest { registrationId, participantId?, kind, note, status, createdBy }`.
- Liczniki na górze: przyjechało X z Y, do zapłaty łącznie, klucze wydane, prośby otwarte. Prośby o dostawkę widać też na tablicy zakwaterowania.

### 11.3 Konta zgłaszających (osobny plan)
- [kod] Model `GuestAccount` już istnieje (logowanie panelu kursanta, powiązanie z `Registration`).
- Pomysł Jacka: po założeniu konta zgłaszający zapisuje domowników z datą urodzenia i przy kolejnych zapisach wybiera ich z listy; wiek na dzień wydarzenia liczy się sam. Zachęta w lejku: „Załóż konto, następnym razem nie wypełniasz danych od nowa”.
- Opcjonalna sekcja materiałów z wydarzenia w koncie (moduł formacji udostępniany uczestnikom eventu).
- Wymaga osobnego planu (`18-…`): model `HouseholdMember`, zgody RODO na dane dzieci, powiązanie eventu z kursem.

### 11.4 Etapy dodatkowe (szacunek wstępny)

| Etap | Zakres | Praca |
|---|---|---|
| **9. Uprawnienia per event** | `EVENT_STAFF`, `EventStaffGrant`, guardy, ekran „Pomocnicy” | 2 d |
| **10. Frontend „Rejestracja”** | obecność, wpłaty, klucze, prośby, liczniki | 3–4 d |
| **11. Konta z domownikami i materiały** | wg osobnego planu | do oszacowania |
