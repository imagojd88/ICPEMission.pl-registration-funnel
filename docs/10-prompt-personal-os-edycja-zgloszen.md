# Prompt (Personal OS) — edycja zgłoszenia rejestracyjnego

> Wklej do wątku Personal OS. Dodanie możliwości edycji istniejącego zgłoszenia (korekta pomyłek) z ponownym przeliczeniem ceny.

## Kontekst
Zgłoszenia rejestracyjne (`/admin/instances/:id/registrations`) można teraz **edytować**: dane zgłaszającego, uczestnicy, skład pokoi i opcje. Backend **przelicza cenę na nowo** na podstawie przysłanego składu. Endpoint gotowy; Ty budujesz UI edycji.

## Endpoint
```
PATCH /admin/registrations/:id     (Bearer <SERVICE_TOKEN>)
```
Body — **pełny nowy skład** zgłoszenia (nie różnicowy):
```ts
{
  contact?: { firstName: string; lastName: string; email: string; phone?: string },
  participants: Array<{
    type: 'adult' | 'child',
    firstName: string,
    lastName?: string,
    age?: number,
    gender?: 'M' | 'F',
    dietary?: string
  }>,
  rooms: Array<{ roomId: string; participantIndexes: number[] }>,   // indeksy = pozycje w `participants`
  options?: { transport?: boolean; bedding?: boolean },
  discountCode?: string,
  dietaryNotes?: string | null,
  locale?: string
}
```
Zwraca: `{ registration, summary }` (summary = przeliczona wycena z `total`, `currency`).

**Zachowanie backendu:** przelicza cenę (silnik wyceny eventu), podmienia uczestników, zapisuje `roomsJson`/`optionsJson`/`totalPrice`/`currency`, aktualizuje kwotę płatności o statusie `PENDING`. **Nie** zmienia statusu zgłoszenia ani metody płatności (do tego są osobne akcje: mark-paid, status).

## Wczytanie danych do formularza
`GET /admin/instances/:id/registrations` zwraca każde zgłoszenie już z polami do edycji:
- `contact { firstName, lastName, email, phone }`
- `participants [{ type, firstName, lastName, age, gender, dietary }]`
- `rooms [{ roomId, participantIndexes }]` — aktualny skład pokoi
- `options { transport, bedding }`
- `dietaryNotes`, `discountCode`

Typy pokoi i ceny (do wyboru `roomId` i podglądu kwoty) — z konfiguracji eventu (`pricingConfig.rooms`: `{ id, name, cap, perPerson }`; opcje: `pricingConfig.options.transport/bedding`). Możesz też pokazywać kwotę na żywo, licząc lokalnie tym samym silnikiem, lub polegać na `summary` po zapisie.

## UI (proponowane)
Przy zgłoszeniu przycisk **Edytuj** → modal/panel z sekcjami:
1. **Zgłaszający** — imię, nazwisko, e-mail, telefon.
2. **Uczestnicy** — lista wierszy (imię, nazwisko, dorosły/dziecko, wiek, płeć, dieta) + dodaj/usuń.
3. **Pokoje** — dla każdego pokoju wybór typu (`roomId`) + zaznaczenie, którzy uczestnicy w nim śpią; dodaj/usuń pokój. Każdy uczestnik musi trafić do jakiegoś pokoju.
4. **Opcje** — transport / pościel (jeśli event je ma).
5. **Uwagi / dieta** — textarea.
6. **Nowa kwota** (podgląd) + **Zapisz**.

## Pułapki
- `participantIndexes` odnoszą się do **pozycji** w tablicy `participants`, którą wysyłasz. Gdy usuwasz/dodajesz osobę, przelicz indeksy (najlepiej wewnętrznie trzymaj przypisania po ID uczestnika, a na zapis mapuj na indeksy).
- Wysyłaj **cały** obiekt (pełny skład) — nie różnicowo.
- Walidacja przed zapisem: każdy uczestnik przypisany do pokoju; pojemność pokoju nieprzekroczona.
- Edycja **zmienia kwotę** — pokaż nową kwotę i (jeśli trzeba) ostrzeż, gdy zgłoszenie było już opłacone.

## Uwaga wdrożeniowa
Doszły kolumny `Registration.optionsJson` i `Registration.discountCode` → po pushu wymagany **Manual Deploy `icpe-api`** (przy starcie `prisma db push` je doda).
