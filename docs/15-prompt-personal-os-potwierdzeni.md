# Handoff dla Personal OS — goście potwierdzeni przez organizatora, rodziny, odmowy (event INVITE)

Kontekst: rozszerzenie zarządzania zaproszonymi z `docs/11-prompt-personal-os-zaproszenia.md`.
Spec funkcji: `docs/14-plan-potwierdzeni-przez-admina.md`. Panel `app/` ma to zaimplementowane
(`app/src/components/admin/events/InvitedGuestsSection.tsx` + `HouseholdEditor.tsx`,
parser listy `app/src/lib/households.ts`) — traktuj jako wzorzec.

Autoryzacja: jak reszta `/admin/*` — `Authorization: Bearer <SERVICE_TOKEN>`.
**Kontrakt istniejących endpointów się nie zmienia** — do wiersza zaproszenia doszły tylko pola.
Personal OS, który dziś pokazuje „Potwierdził / Czeka”, działa dalej poprawnie.

---

## 1. Pojęcia

- **Rekord zaproszenia = gospodarstwo domowe**: osoba główna (kontakt, e-mail, osobisty link) + opcjonalny
  małżonek + 0–12 dzieci (wiek 0–25, imię i dieta opcjonalne). Jedna pozycja na liście, jeden link,
  jeden mail, jeden check-in.
- **Potwierdzony przez organizatora** (`confirmedBy = "ADMIN"`): dodany w panelu bez zaproszenia albo
  „Potwierdź ręcznie”. Dostaje mail „udział potwierdzony, podaj dietę (opcjonalnie)” zamiast zaproszenia.
- **Odmowa** (`status = "DECLINED"`): gość kliknął „Nie damy rady przyjść” albo admin oznaczył „Nie przyjdzie”.
  Powiązane zgłoszenie dostaje `CANCELLED`, osoba znika z licznika posiłków.
- **Status diety** (tylko potwierdzeni): `PROVIDED` (jest wpisana dieta), `NONE` (gość odpowiedział
  „nikt nie ma wymagań”), `UNKNOWN` (potwierdził admin, gość jeszcze nie odpowiedział — catering „nie wie”).
- Od momentu `startsAt` eventu gość nie może zmienić odpowiedzi (API zwraca 403). Admin może.

---

## 2. Nowe pola w `GET /admin/instances/:id/invitations` (wiersz `InvitationRow`)

| pole | typ | opis |
|---|---|---|
| `status` | `"PENDING" \| "CONFIRMED" \| "DECLINED"` | wyliczone z `confirmedAt` / `declinedAt` |
| `confirmedBy` | `"GUEST" \| "ADMIN" \| null` | kto potwierdził (null = niepotwierdzone) |
| `guestRespondedAt` | datetime \| null | kiedy gość ostatnio sam zapisał odpowiedź |
| `declinedAt` | datetime \| null | odmowa |
| `dietStatus` | `"PROVIDED" \| "NONE" \| "UNKNOWN" \| null` | null dla niepotwierdzonych |
| `adminNote` | string \| null | notatka wewnętrzna (gość jej nie widzi) |
| `children[].dietary` | string? | dieta dziecka |

Istniejące: `spouseAttending`, `spouseFirstName`, `spouseLastName` (null = to samo nazwisko co osoba główna),
`spouseDietaryNotes`, `children[{firstName?, age}]`, `dietaryNotes`, `registrationId`, `sentAt`…

Licznik posiłków jak dotąd: dorośli = potwierdzeni + potwierdzeni z `spouseAttending === true`, dzieci = suma
`children.length` potwierdzonych. Odmowy (`DECLINED`) się nie liczą.

---

## 3. Nowe endpointy

### `POST /admin/instances/:id/invitations/confirmed` — dodaj od razu potwierdzonych

Tylko event typu INVITE (inaczej 400). Body:
```json
{
  "households": [{
    "firstName": "Jan", "lastName": "Kowalski", "email": "jan@example.com", "phone": "+48600100200",
    "dietaryNotes": null,
    "spouse": { "firstName": "Anna", "lastName": "Kowalska", "dietaryNotes": "wegetariańska" },
    "children": [{ "firstName": "Ola", "age": 7 }, { "age": 4, "dietary": "bez laktozy" }],
    "adminNote": "potwierdzili telefonicznie",
    "mailSalutation": null, "mailNote": null, "mailSubject": null, "mailFormal": false
  }],
  "sendEmails": true,
  "confirmExisting": false,
  "ignoreWarnings": false
}
```
`spouse: null` (albo brak) = osoba sama. `sendEmails: false` = ciche dodanie (bez maila).

Odpowiedź:
```json
{
  "items": [ /* pełna lista InvitationRow, jak GET */ ],
  "conflicts": [
    { "index": 0, "kind": "SAME_PERSON_PENDING", "existingId": "clx…", "label": "Jan Kowalski (czeka)", "blocking": true }
  ],
  "added": 0, "confirmedExisting": 0,
  "mail": { "sent": 0, "failed": 0, "logged": 0, "noEmail": 0 }
}
```
Rodziny z konfliktem **nie są dodawane** — pokaż konflikt adminowi i ponów tylko te rodziny z flagą:

| `kind` | znaczenie | rozwiązanie |
|---|---|---|
| `SAME_PERSON_PENDING` | ta osoba (e-mail albo imię+nazwisko) już jest na liście i czeka / odmówiła | ponów z `confirmExisting: true` → istniejący rekord zostaje potwierdzony z tym składem (stary link dalej działa) |
| `SAME_PERSON_CONFIRMED` | już potwierdzona | nie dodawaj — edytuj skład (`/confirm`) |
| `SPOUSE_ON_LIST` | małżonek ma osobny rekord albo jest w innej rodzinie | posiłki liczone podwójnie: usuń tamten rekord (`DELETE`) i ponów z `ignoreWarnings: true`, albo ponów z `ignoreWarnings: true` bez usuwania |
| `PERSON_IS_SPOUSE` | osoba główna jest małżonkiem w innej rodzinie | jak wyżej |

`mail.logged > 0 && mail.sent === 0` → poczta wyłączona na serwerze — pokaż ostrzeżenie.

### `POST /admin/invitations/:invId/confirm` — „Potwierdź ręcznie” / „Edytuj skład i diety”

Body: pola gospodarstwa jak wyżej (wszystkie opcjonalne — pominięte = bez zmian; `spouse: null` usuwa małżonka;
`children` zastępuje listę) + `sendEmail?: boolean`. Domyślnie mail idzie przy pierwszym potwierdzeniu,
przy edycji już potwierdzonego — nie. Osobie, która potwierdziła sama (`confirmedBy: "GUEST"`), mail nie idzie nigdy.
Odpowiedź: `{ "item": InvitationRow, "mail": "SENT" | "FAILED" | "LOGGED" | "NO_EMAIL" | "SKIPPED" }`.

### `POST /admin/invitations/:invId/decline` — „Nie przyjdzie”
Odpowiedź: `InvitationRow` (`status: "DECLINED"`). Zgłoszenie → `CANCELLED`.

### `POST /admin/invitations/:invId/unconfirm` — „Cofnij potwierdzenie” / „Cofnij odmowę”
Z powrotem `PENDING`. Zgłoszenie → `CANCELLED`. Odpowiedź: `InvitationRow`.

### `POST /admin/instances/:id/invitations/diet-reminders` — „Przypomnij o diecie”
Mail-przypomnienie do potwierdzonych z `dietStatus: "UNKNOWN"` i e-mailem.
Odpowiedź: `{ "sent", "failed", "logged", "skipped" }`.

### Zmiany w istniejących
- `DELETE /admin/invitations/:invId` — powiązane zgłoszenie dostaje `CANCELLED` (wcześniej zostawało w Zgłoszeniach i Obecności).
- `POST /admin/invitations/:invId/send` i `POST /admin/instances/:id/invitations/send` — szablon wybiera serwer:
  potwierdzeni przez admina dostają mail „udział potwierdzony”, czekający — zaproszenie. Wysyłka zbiorcza pomija
  odmowy i osoby, które potwierdziły same.
- `POST /admin/invitations/:invId/preview`, `POST /admin/instances/:id/invitations/preview` — body może zawierać
  `preconfirmed: true` i `household: {…}` → podgląd maila „udział potwierdzony” dla dodawanej rodziny.

### Publiczne (informacyjnie)
- `GET /invite/:token` — dodatkowo `confirmedBy`, `guestRespondedAt`, `declinedAt`, `eventStarted`.
- `POST /invite/:token/confirm` — można wysłać same diety (bez `spouseAttending`) — skład zostaje.
- `POST /invite/:token/decline` — odmowa gościa.
- `POST /r/:slug/invite-match` — dla potwierdzonego przez organizatora zwraca `{ ok, firstName, alreadyConfirmed: true }`
  i nie zmienia danych (link idzie mailem).

---

## 4. UI do odwzorowania (minimum)

1. Badge statusu: **Potwierdził** / **Potwierdzony · organizator** (`confirmedBy === "ADMIN"`) / **Nie przyjdzie** / **Czeka**.
2. Pasek: „Potwierdzeni: X dorosłych + Y dzieci = Z posiłków” + „Nie przyjdzie: K” + baner
   **„Diety nieznane: N rodzin”** z przyciskiem **Przypomnij o diecie (M)**.
3. Formularz dodawania z przełącznikiem **Zaproś (gość potwierdza) | Dodaj jako potwierdzonego**; w trybie
   potwierdzonym skład Osoba / Małżeństwo / Rodzina, diety per osoba, notatka, checkbox
   „Wyślij mail z potwierdzeniem i prośbą o dietę” (domyślnie zaznaczony), obsługa konfliktów jak w tabeli.
4. Akcje w wierszu: Potwierdź ręcznie (czeka/odmowa), Edytuj skład i diety (potwierdzeni),
   Cofnij potwierdzenie / Cofnij odmowę, Nie przyjdzie.
5. Treść WhatsApp dla potwierdzonego przez organizatora:
   ```
   {Imię}, Twój udział w: {tytuł eventu} jest potwierdzony.

   Jeśli masz wymagania żywieniowe lub alergie, podaj je tutaj:
   {link}
   ```
   (dla rodziny: „{Imię} i {Imię małżonka}, Wasz udział… Jeśli ktoś z Was ma wymagania…, podajcie je tutaj:”).

## 5. Środowisko
- Opcjonalnie `PRIVACY_POLICY_URL` w `icpe-api` — link do polityki prywatności w mailu „udział potwierdzony”.
