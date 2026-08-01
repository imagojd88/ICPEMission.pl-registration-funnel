# Handoff dla Personal OS — zarządzanie zaproszonymi gośćmi (event typu INVITE)

Kontekst: `icpe-api` obsługuje eventy „na zaproszenie" (`EventSeries.type = 'INVITE'`).
Na takim evencie **nie ma zwykłej rejestracji** — udział potwierdza się osobistym linkiem
`/i/:token` albo dopasowaniem danych do listy gości. Ten dokument opisuje endpointy i UI
do odwzorowania w Personal OS. Panel `app/` ma to już zaimplementowane
(`app/src/components/admin/events/InvitedGuestsSection.tsx`) — można go traktować jako wzorzec.

Autoryzacja: jak reszta `/admin/*` — `Authorization: Bearer <SERVICE_TOKEN>`.

---

## 1. Model danych

`Invitation`:

| pole | typ | opis |
|---|---|---|
| `id` | string | |
| `instanceId` | string | event (instancja), do którego należy zaproszenie |
| `firstName`, `lastName` | string | wymagane |
| `email` | string | może być puste (wtedy tylko link/WhatsApp) |
| `phone` | string \| null | **nowe** — opcjonalny telefon, do przycisku WhatsApp |
| `token` | string | unikalny, w linku `/i/:token` |
| `confirmedAt` | datetime \| null | kiedy gość potwierdził udział |
| `sentAt` | datetime \| null | **nowe** — kiedy ostatnio wyszedł mail z zaproszeniem |
| `dietaryNotes` | string \| null | alergie/wymagania podane przy potwierdzeniu |

Nowe kolumny (`phone`, `sentAt`) wchodzą przez `prisma db push` przy starcie Rendera.

---

## 2. Endpointy

### `GET /admin/instances/:id/invitations`

Lista zaproszonych. Odpowiedź: tablica obiektów

```json
{
  "id": "clx…",
  "firstName": "Jan",
  "lastName": "Kowalski",
  "email": "jan@example.com",
  "phone": "+48600100200",
  "token": "clx…",
  "link": "https://rejestracja.icpemission.pl/i/clx…",
  "confirmedAt": null,
  "sentAt": "2026-08-01T09:12:00.000Z"
}
```

`link` jest już złożony po stronie API (baza: ENV `PUBLIC_APP_URL`, fallback `CORS_ORIGIN`) —
nie sklejaj go samodzielnie.

### `POST /admin/instances/:id/invitations`

```json
{ "invitees": [{ "firstName": "Jan", "lastName": "Kowalski", "email": "jan@example.com", "phone": "+48600100200" }],
  "sendEmails": true }
```

`sendEmails` domyślnie `true` → każdy dodany gość z e-mailem od razu dostaje mail
z osobistym linkiem. Zwraca **pełną, aktualną listę** zaproszonych (jak GET).

### `PATCH /admin/invitations/:invId`

Częściowa edycja: `firstName`, `lastName`, `email`, `phone`. Zwraca zaktualizowany wiersz.
Typowe użycie: dopisanie telefonu, żeby odblokować wysyłkę przez WhatsApp.

### `POST /admin/invitations/:invId/send`

Wysyła (lub ponawia) mail z zaproszeniem. Odpowiedź: `{ "ok": true, "status": "SENT" }`.
Statusy:

- `SENT` — mail poszedł, `sentAt` zaktualizowane;
- `FAILED` — błąd SMTP;
- `LOGGED` — **mail NIE wyszedł**: API ma `MAIL_MODE≠smtp`, więc trafił tylko do logów. Pokaż to
  adminowi jako ostrzeżenie, nie jako sukces. `sentAt` zostaje puste;
- `NO_EMAIL` — gość bez adresu.

### `POST /admin/instances/:id/invitations/send`

Wysyłka zbiorcza. Body: `{ "onlyUnsent": true }` (domyślnie `true` — pomija tych,
którzy już dostali mail). Odpowiedź: `{ "sent": 3, "failed": 0, "skipped": 5, "logged": 0 }`.
`logged > 0 && sent === 0` → wysyłka jest wyłączona na serwerze (patrz `MAIL_MODE`).

### `DELETE /admin/invitations/:invId`

Usuwa zaproszenie (link przestaje działać).

### Publiczne (informacyjnie)

- `GET /invite/:token` — dane zaproszenia + eventu do strony potwierdzenia.
- `POST /invite/:token/confirm` — potwierdzenie udziału (`{ dietaryNotes? }`).
- `POST /r/:slug/invite-match` — potwierdzenie bez linku, po imieniu + nazwisku + e-mailu.
  Zwraca `{ ok, firstName }` (celowo bez `token`).
- `POST /registrations` na evencie INVITE → **403**. Zwykła rejestracja jest zablokowana
  także po stronie API, nie tylko ukryta w UI.

---

## 3. UI do odwzorowania

Sekcja **„Zaproszeni goście"** widoczna tylko dla eventów o `type === 'INVITE'`
(typ przychodzi w `GET /r/:slug/config` jako pole `type`).

Nagłówek sekcji:

- licznik „Potwierdziło **N** z M", a gdy są osoby bez wysłanego maila — „bez wysłanego maila: K";
- przycisk **Odśwież**;
- przycisk **Wyślij niewysłane (K)** → `POST /admin/instances/:id/invitations/send`.

Wiersz gościa:

- imię i nazwisko, pod spodem e-mail (albo „bez e-maila") i telefon;
- badge statusu: **Potwierdził** (zielony, gdy `confirmedAt`) / **Czeka** (neutralny);
- link `/i/:token` w małym monospace;
- akcje:
  - **Kopiuj link** → `navigator.clipboard.writeText(link)` + krótkie „Skopiowano!";
  - **WhatsApp** → `https://wa.me/<same cyfry z phone>?text=<encodeURIComponent(tekst)>`.
    Gdy `phone` puste, zostaw numer pusty — WhatsApp otworzy się z gotową treścią
    i poprosi o wybór kontaktu. Tekst wiadomości:
    ```
    {Imię}, zapraszamy Cię na: {tytuł eventu}.

    To wydarzenie tylko dla zaproszonych gości — udział potwierdzisz swoim osobistym linkiem:
    {link}
    ```
  - **Wyślij mail** / **Wyślij ponownie** (zależnie od `sentAt`; w tooltipie data ostatniej wysyłki);
  - **Usuń** (z potwierdzeniem).

Formularz dodawania: imię, nazwisko, e-mail (opcjonalny), telefon (opcjonalny) +
przycisk „Dodaj i wyślij zaproszenie".

---

## 4. Wymagania środowiskowe

- `MAIL_MODE=smtp` na Render — inaczej maile trafiają tylko do logów (status i tak wraca `SENT`).
- `PUBLIC_APP_URL` — baza linków w mailach (domyślnie `https://rejestracja.icpemission.pl`).
