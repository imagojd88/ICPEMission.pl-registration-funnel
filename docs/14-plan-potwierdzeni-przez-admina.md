# 14 — Goście dodani przez admina jako od razu potwierdzeni (event „Na zaproszenie”)

> Status: **WDROŻONE w kodzie (2026-10-02)**, czeka na push + Manual Deploy `icpe-api`. Decyzje Jacka — sekcja 12. Handoff dla Personal OS: `docs/15-prompt-personal-os-potwierdzeni.md`.
> Dotyczy eventów `EventSeries.type = 'INVITE'`. Zwykłych eventów (z rejestracją i płatnością) to nie zmienia.

---

## 1. Cel

Admin chce wpisać na listę gości osoby, które **już wiadomo, że przyjdą**: organizatorów, prowadzących,
gości specjalnych, rodziny, które potwierdziły telefonicznie. Dziś każda taka osoba musi dostać zaproszenie
i sama kliknąć „Potwierdzam udział”, a do tego czasu nie widać jej w liczbie posiłków ani w Obecności.

Wymagania (od Jacka):
1. Admin dodaje uczestnika eventu INVITE **bez wysyłania zaproszenia**; osoba jest **od razu potwierdzona**.
2. Osoba dostaje maila: „Twój udział jest potwierdzony; jeśli masz wymagania żywieniowe, podaj je” (podanie diety jest opcjonalne).
3. Po wejściu w swój link osoba **od razu widzi, że jest potwierdzona** (bez formularza „Potwierdzam udział”).
4. **Małżeństwo albo rodzina = jeden rekord** (jedna pozycja na liście, jeden link, jeden mail).

---

## 2. Na czym budujemy (stan obecny)

Większość potrzebnych elementów już istnieje, więc ta funkcja to głównie **nowa ścieżka wejścia do istniejącego modelu**:

| Element | Gdzie | Co daje |
|---|---|---|
| `Invitation` = jedno gospodarstwo domowe | `schema.prisma` | `spouseAttending`, `spouseFirstName/LastName/DietaryNotes`, `childrenJson` (wiek + imię). **Rodzina jednym rekordem już jest w modelu**, dziś wypełnia ją tylko gość. |
| `syncRegistration(invitationId)` | `invitations.service.ts` | Z potwierdzonego zaproszenia robi `Registration` (CONFIRMED, 0 zł) z uczestnikami: gość, małżonek, dzieci. Dzięki temu rodzina pojawia się w Zgłoszeniach, Obecności, Zakwaterowaniu, w Dashboardzie i w dostępie do kursów. Jedna rodzina = jeden check-in (decyzja z 2026-08-19). |
| Strona `/i/:token` | `InviteConfirm.tsx` | Gdy `confirmedAt` jest ustawione, pokazuje zieloną kartę „Udział potwierdzony” z podsumowaniem i przyciskiem „Zmień odpowiedź”. Wymaganie nr 3 działa „za darmo”, trzeba tylko dopracować treść. |
| Personalizacja maila | `Invitation.mail*` + `inviteEmail()` | Własny zwrot, notatka, temat, forma grzecznościowa. Wykorzystamy to w nowym mailu. |
| Licznik posiłków | `InvitedGuestsSection.tsx` | „Potwierdzeni: X dorosłych + Y dzieci = Z posiłków” liczy się z `confirmedAt` + `spouseAttending` + `children`, więc rodziny dodane przez admina wejdą do niego bez zmian. |
| „Dodaj bez wysyłania” | panel | Dziś dodaje osobę **niepotwierdzoną**. Ten przycisk zostaje, a nowa ścieżka jest osobna. |

---

## 3. Decyzje projektowe

**D1. Ten sam rekord `Invitation`, inne źródło potwierdzenia.** Nie tworzymy nowej tabeli ani nowego typu gościa.
Potwierdzenie przez admina ustawia `confirmedAt` jak potwierdzenie gościa i dodatkowo zapisuje, **kto** potwierdził
(`confirmedBy = 'ADMIN'`). Dzięki temu cała reszta systemu (sync, liczniki, Obecność, link, „Zaproś gościa”) działa bez rozgałęzień.

**D2. Rekord = gospodarstwo domowe.** Osoba główna (z e-mailem i linkiem) + opcjonalny małżonek + 0–12 dzieci.
Admin wybiera skład gotowym wzorcem: **Osoba / Małżeństwo / Rodzina**. To tylko skrót w interfejsie, a w danych zawsze siedzi ten sam model.
Jeden link i jeden mail na rodzinę.

**D3. „Bez wysyłania wiadomości” = bez zaproszenia, ale z mailem potwierdzającym.** Zamiast maila „Zaproszenie… Potwierdzam udział”
idzie nowy mail `INVITE_PRECONFIRMED`: „udział potwierdzony, podaj dietę, jeśli trzeba”. Checkbox „Wyślij mail z potwierdzeniem”
jest **domyślnie zaznaczony**, gdy jest adres e-mail. Odznaczenie daje ciche dodanie, np. dla członków zespołu (patrz pytanie Q2).

**D4. Musimy odróżnić „brak wymagań” od „nie odpowiedział”.** Dla cateringu to różnica zasadnicza: rodzina potwierdzona przez admina
nie przeszła przez formularz, więc o jej diecie **nic nie wiemy**. Nowe pole `guestRespondedAt` i wyliczany status diety:
- `PROVIDED` — jest wpisana dieta (przez gościa albo admina),
- `NONE` — gość odpowiedział „nikt z nas nie ma wymagań”,
- `UNKNOWN` — potwierdzony przez admina, gość jeszcze nie odpowiedział i nie ma wpisanej diety.

Panel pokazuje „diety nieznane: N rodzin” i umożliwia przypomnienie.

**D5. Dieta per osoba, także dla dzieci.** Dziś jest jedno pole dla gościa i jedno dla małżonka, a dzieci nie mają żadnego.
Do wpisu dziecka w `childrenJson` dochodzi `dietary?` (JSON, bez migracji). `syncRegistration` przenosi to do `Participant.dietary`
dziecka i dokleja do `Registration.dietaryNotes` („Jan: bez glutenu | Ola: alergia na orzechy”). Formularz dostaje to
w obu ścieżkach (potwierdzonej przez admina i zwykłej).

**D6. W mailu nie ma linków, które coś zmieniają po kliknięciu.** Kuszący przycisk „Nie mamy wymagań” prosto w mailu
odpada: skanery poczty (Outlook Safe Links, Gmail, antywirusy) **otwierają linki z maili automatycznie**. Taki link
„odpowiadałby” za gościa, zanim ten przeczyta wiadomość. Mail prowadzi więc tylko do `/i/:token`, a tam jest przycisk „Nikt z nas nie ma wymagań” (POST).

**D7. Admin może też ręcznie potwierdzić kogoś, kto już czeka na liście.** Zaproszony odpowiedział telefonicznie? Na wierszu „Czeka”
pojawia się akcja **„Potwierdź ręcznie”** z tym samym edytorem składu. Ten sam endpoint obsługuje oba przypadki, czyli nowy rekord i istniejący.

**D8. Usunięcie lub cofnięcie potwierdzenia zamyka zgłoszenie.** Dziś `remove()` usuwa zaproszenie, ale **zostawia `Registration`**:
rodzina dalej wisi w Zgłoszeniach i Obecności. Przy ręcznym dodawaniu pomyłki będą częstsze, więc naprawiamy to przy okazji.
Powiązane zgłoszenie dostaje `status = CANCELLED` (nie kasujemy go, żeby nie stracić historii i check-inu).

**D9. Ścieżka „bez linku” nie nadpisuje danych wpisanych przez admina.** Jeśli osoba potwierdzona przez admina wypełni na `/r/:slug`
formularz dopasowania, dostaje komunikat „Twój udział jest już potwierdzony, wysłaliśmy Ci link na e-mail”, a my ponawiamy mail
`INVITE_PRECONFIRMED`. Skład ustalony przez admina zostaje bez zmian.

---

## 4. Przepływy

### 4.1 Admin dodaje potwierdzoną rodzinę
```
Panel ▸ Event ▸ Zaproszeni goście ▸ „Dodaj gościa”
  tryb: [ Zaproś (gość potwierdza) | ● Dodaj jako potwierdzonego ]
  skład: [ Osoba | ● Małżeństwo | Rodzina ]
  Jan Kowalski · jan@… · +48…   + Anna Kowalska   + Ola 7, Staś 4   (diety: opcjonalnie)
  [x] Wyślij mail z potwierdzeniem i prośbą o dietę
  ( Dodaj jako potwierdzonego )
        │
        ▼
POST /admin/instances/:id/invitations/confirmed
  → kontrola duplikatów (osoba główna i małżonek), patrz 10.1
  → Invitation: confirmedAt=now, confirmedBy=ADMIN, skład + diety
  → syncRegistration → Registration CONFIRMED + 4× Participant
  → (checkbox) mail INVITE_PRECONFIRMED → sentAt
  ← { items, conflicts }
```
Wynik: rodzina od razu jest w liczniku posiłków, w Zgłoszeniach i w Obecności, ze statusem diety `UNKNOWN`
(chyba że admin wpisał dietę).

### 4.2 Rodzina dostaje maila i wchodzi w link
```
mail „Wasz udział jest potwierdzony — Celebracja Przymierza” → [Podaj wymagania żywieniowe] → /i/:token
  karta: ✓ Jesteście na liście gości (potwierdził organizator)
         Jan Kowalski · Anna Kowalska · Ola (7 lat) · Staś (4 lata)
  sekcja „Wymagania żywieniowe” — otwarta od razu, pole przy każdej osobie
         ( Zapisz )   ( Nikt z nas nie ma wymagań )
         „Coś się zmieniło w składzie?” → pełny formularz (patrz Q1)
        │
        ▼
POST /invite/:token/confirm  { dietaryNotes, spouseDietaryNotes, children:[{age, firstName, dietary}] }
  → zapis diet + guestRespondedAt=now (confirmedAt i confirmedBy bez zmian)
  → syncRegistration (uczestnicy z dietami)
  ← karta „Dziękujemy, zapisaliśmy” + podsumowanie diet + „Zmień”
```

### 4.3 Admin potwierdza osobę, która już czeka na liście
Wiersz „Czeka” ▸ **Potwierdź ręcznie** ▸ ten sam edytor składu, wypełniony tym, co już wiadomo ▸
`POST /admin/invitations/:invId/confirm`. Jeśli osoba dostała wcześniej zaproszenie, mail potwierdzający
tłumaczy, że nie musi już nic klikać.

### 4.4 Korekty
- **Edytuj skład i diety**: dostępne na każdym potwierdzonym wierszu, także potwierdzonym przez samego gościa. To ten sam endpoint `confirm`, który jest idempotentny.
- **Cofnij potwierdzenie**: `POST /admin/invitations/:invId/unconfirm` ustawia `confirmedAt=null`, `confirmedBy=null`, a zgłoszenie przechodzi na CANCELLED.
- **Usuń**: zgłoszenie przechodzi na CANCELLED, potem rekord zaproszenia jest usuwany (D8).

---

## 5. Model danych (`api/prisma/schema.prisma`, model `Invitation`)

Wszystko jest nullable albo ma wartość domyślną, więc wchodzi przez `prisma db push` na starcie, bez migracji danych.

```prisma
  // Kto potwierdził udział: 'GUEST' (link / dopasowanie) | 'ADMIN' (panel). null = niepotwierdzone
  // albo potwierdzone przed wprowadzeniem pola (traktujemy jak GUEST).
  confirmedBy      String?
  // Ostatni zapis odpowiedzi przez samego gościa (link /i/:token albo dopasowanie).
  // Przy confirmedBy=ADMIN: null = gość jeszcze nie odpowiedział → status diety UNKNOWN.
  guestRespondedAt DateTime?
  // Notatka wewnętrzna admina (np. „potwierdził telefonicznie 3.10”) — nie trafia do gościa.
  adminNote        String?
```

`childrenJson`: wpis rozszerzony do `{ firstName?: string, age: number, dietary?: string }` (dieta maks. 300 znaków, sanityzacja w `sanitizeChildren`).

**Nie dodajemy** osobnego `spouseEmail` w v1 (patrz Q3). Nie dodajemy nowego enuma (string jak `Notification.provider`),
żeby nie ryzykować `db push` przy dodawaniu wartości enuma.

---

## 6. API

### 6.1 Nowe endpointy (admin, `JwtAuthGuard`)

**`POST /admin/instances/:id/invitations/confirmed`**: dodanie od razu potwierdzonych (jedna lub wiele rodzin).
Osobny endpoint, a nie flaga w istniejącym `POST …/invitations`, bo zwracamy też konflikty (`{items, conflicts}`).
Istniejący endpoint zwraca samą tablicę i używa go Personal OS, więc jego kontraktu nie ruszamy.
```json
{
  "households": [{
    "firstName": "Jan", "lastName": "Kowalski", "email": "jan@example.com", "phone": "+48600100200",
    "dietaryNotes": null,
    "spouse": { "firstName": "Anna", "lastName": "Kowalska", "dietaryNotes": "wegetariańska" },
    "children": [{ "firstName": "Ola", "age": 7 }, { "firstName": "Staś", "age": 4, "dietary": "bez laktozy" }],
    "adminNote": "potwierdzili telefonicznie",
    "mailSalutation": null, "mailNote": null, "mailSubject": null, "mailFormal": false
  }],
  "sendEmails": true,
  "onConflict": "report"
}
```
Odpowiedź:
```json
{
  "items": [ /* InvitationRow[] — cała lista, jak w GET */ ],
  "conflicts": [
    { "index": 0, "kind": "SAME_PERSON_PENDING", "existingId": "clx…", "label": "Jan Kowalski (czeka)" },
    { "index": 0, "kind": "SPOUSE_ON_LIST",       "existingId": "clx…", "label": "Anna Kowalska (osobny rekord)" }
  ],
  "mail": { "sent": 1, "failed": 0, "logged": 0, "noEmail": 0 }
}
```
`onConflict`: `report` (domyślnie; rodziny z konfliktem nie są dodawane), `confirmExisting` (dla `SAME_PERSON_PENDING` potwierdza
istniejący rekord zamiast tworzyć nowy), `force` (dodaj mimo ostrzeżenia `SPOUSE_ON_LIST`). Szczegóły w 10.1.

**`POST /admin/invitations/:invId/confirm`**: ręczne potwierdzenie istniejącego zaproszenia **albo** edycja składu i diet już potwierdzonego.
Body: te same pola gospodarstwa co wyżej + `sendEmail?: boolean` (domyślnie `true` przy pierwszym potwierdzeniu, `false` przy edycji).
Ustawia `confirmedAt ??= now`. Pole `confirmedBy` ustawia na `ADMIN` tylko wtedy, gdy rekord nie był potwierdzony (korekta admina
nie zmienia „potwierdził gość” na „potwierdził admin”). Woła `syncRegistration`. Zwraca `InvitationRow`.

**`POST /admin/invitations/:invId/unconfirm`**: cofa potwierdzenie i ustawia CANCELLED na powiązanym `Registration`. Zwraca `InvitationRow`.

**`POST /admin/instances/:id/invitations/diet-reminders`**: ponawia mail `INVITE_PRECONFIRMED` (wariant przypomnienia) do rodzin
ze statusem `UNKNOWN` i adresem e-mail. Zwraca `{sent, failed, logged, skipped}`.

### 6.2 Zmiany w istniejących

| Miejsce | Zmiana |
|---|---|
| `InvitationRow` / `toRow` | + `confirmedBy`, `guestRespondedAt`, `dietStatus` (`PROVIDED`/`NONE`/`UNKNOWN`/`null` dla niepotwierdzonych), `adminNote`, `children[].dietary`. Same dodane pola, nic nie znika, więc Personal OS się nie wysypie. |
| `confirmByToken` | Ustawia `guestRespondedAt=now`. Pole `confirmedBy` ustawia na `GUEST` **tylko** gdy było puste. `sendConfirmedMail` jak dziś (tylko przy pierwszym potwierdzeniu, więc u potwierdzonych przez admina nie idzie). |
| `declarationData` | `spouseDietaryNotes` może przyjść **bez** `spouseAttending` (zapis samej diety nie może kasować danych małżonka). Zapis wtedy tylko gdy w bazie `spouseAttending === true`. |
| `sanitizeChildren` | + `dietary` (trim, maks. 300). |
| `matchBySlug` | Gdy znaleziony rekord ma `confirmedBy='ADMIN'`: **nie** zapisuje deklaracji z formularza, ponawia `INVITE_PRECONFIRMED` i zwraca `{ok:true, firstName, alreadyConfirmed:true}` (D9). |
| `getByToken` | + `confirmedBy`, `guestRespondedAt`, `children[].dietary`, `eventStarted` (do blokady edycji, Q5). |
| `inviteMailPayload` / `sendInviteMail` | Szablon wybierany z rekordu: `confirmedBy==='ADMIN'` daje `INVITE_PRECONFIRMED`. Dzięki temu „Wyślij ponownie”, „Wyślij niewysłane (N)” i podgląd maila **same wysyłają właściwy mail** potwierdzonym przez admina (bez tego „Wyślij niewysłane” wysłałoby im zaproszenie z „Potwierdzam udział”). `sentAt` oznacza dalej „ostatni mail do tej osoby”. |
| `syncRegistration` / `composeDietaryNotes` | Diety dzieci trafiają do `Participant.dietary` i do sklejki w `Registration.dietaryNotes`. |
| `remove` | Przed usunięciem: `Registration.status = CANCELLED`, jeśli jest `registrationId` (D8). |
| `createMany` (zwykłe dodanie) | Bez zmian. |

---

## 7. Mail `INVITE_PRECONFIRMED` (`notifications.service.ts`)

Renderer obok `inviteEmail()`, z tym samym `buttonMail()`, `SIGNATURE` i personalizacją (`salutation`, `note`, `subject`, `formal`).
Potrzebne są **trzy warianty gramatyczne**, bo polszczyzna odmienia czasowniki zależnie od adresata:

| Wariant | Kiedy | Formy |
|---|---|---|
| **Ty** | sama osoba | „potwierdzamy Twój udział”, „daj nam znać”, „Twoje zgłoszenie” |
| **Wy** | małżeństwo lub rodzina | „potwierdzamy Wasz udział”, „dajcie nam znać”, „ktoś z Was” |
| **Państwo** | `mailFormal = true` | „mamy przyjemność potwierdzić udział”, „uprzejmie prosimy o informację” |

**Zwrot:** osoba: „Jan,”; para: „Jan i Anna,” (mianownik, jak w obecnych mailach, bez automatycznego wołacza, który łatwo zepsuć);
formalnie: „Szanowni Państwo,”. Własny zwrot z panelu (`mailSalutation`) zawsze wygrywa, np. „Drodzy Anno i Janie,”.

**Temat:** „Twój/Wasz udział jest potwierdzony — {tytuł}”, formalnie „Potwierdzenie udziału — {tytuł}”. Przypomnienie: „Przypomnienie: wymagania żywieniowe — {tytuł}”.

**Treść (wariant „Wy”):**
> Jan i Anna,
>
> z radością potwierdzamy Wasz udział w: Celebracja Przymierza.
> Termin: 17 października 2026.
> Miejsce: …
>
> Na liście gości zapisaliśmy: Jan Kowalski, Anna Kowalska, Ola (7 lat), Staś (4 lata).
>
> *[notatka organizatora, jeśli jest]*
>
> Nie musicie niczego potwierdzać. Jeśli ktoś z Was ma wymagania żywieniowe lub alergie, dajcie nam znać, zajmie to chwilę:
>
> **[ Podaj wymagania żywieniowe ]**
>
> Pod tym samym linkiem zawsze sprawdzicie swoje zgłoszenie. Link jest przypisany do Was, prosimy go nie przekazywać.
>
> *[gdy włączone „Zaproś gościa”:]* Możecie też zaprosić do 2 osób: *link /g/:token*
>
> Wasze dane wpisał organizator na potrzeby przygotowania wydarzenia. Więcej w polityce prywatności: *link*.
>
> Szczęść Boże,
> ICPE Mission Polska

Uwagi:
- **Odmiana wieku:** helper `lat(n)`: 1 → „1 rok”; końcówka 2–4 (ale nie 12–14) → „lata” (2, 3, 4, 22, 23, 24); reszta → „lat” (0, 5–21, 25).
- **Zdanie o danych (RODO art. 14):** dane wpisał admin, a nie sama osoba, więc mail powinien poinformować, skąd je mamy. Wymagania żywieniowe i alergie mogą być danymi o zdrowiu. Link do polityki prywatności z `PUBLIC_SITE_URL`; **treść polityki Jacek uzupełnia sam** (podobnie jak przy kursach).
- Etykieta w Ustawieniach ▸ E-mail ▸ log: „Potwierdzenie udziału (dodany przez organizatora)”.
- Język maila: PL, jak wszystkie maile zaproszeń. Strona `/i/:token` ma przełącznik PL/EN.

---

## 8. Strona gościa `/i/:token` (`InviteConfirm.tsx`)

| Stan | Co widzi gość |
|---|---|
| `confirmedBy=ADMIN`, `guestRespondedAt=null` | Zielona karta **„Jesteś na liście gości / Jesteście na liście gości”** + dopisek „Udział potwierdził organizator, nie musisz nic klikać”. Lista osób (imiona, wiek dzieci). Poniżej **od razu otwarta** sekcja „Wymagania żywieniowe”: pole przy każdej osobie (Jan / Anna / Ola 7 lat / Staś 4 lata), przyciski **Zapisz** i **Nikt z nas nie ma wymagań**. Link „Coś się zmieniło w składzie?” (Q1). |
| po zapisie (`guestRespondedAt` ustawione) | Karta „Dziękujemy, zapisaliśmy” + podsumowanie diet („Anna: wegetariańska · pozostali: bez wymagań”) + „Zmień”. |
| `confirmedBy=GUEST` | Bez zmian względem dziś, plus pola diety przy dzieciach w formularzu „Zmień odpowiedź”. |
| po starcie eventu (Q5) | Karta tylko do odczytu, bez przycisków edycji. |

Zasady:
- Zapis samej diety wysyła `children` z **pełnym** stanem (wiek, imię, dieta), żeby nie zgubić dzieci, oraz **nie** wysyła `spouseAttending`, co oznacza „skład bez zmian” (D5 + zmiana `declarationData`).
- „Nikt z nas nie ma wymagań” to ten sam POST z pustymi dietami. Status `NONE` wynika z `guestRespondedAt` przy braku tekstu.
- Teksty przez `t()`, nowe klucze `invite.pre_*` w `pl/en/it.json` (formy dla Ty i Wy, liczba mnoga przez i18next jak `invite.kids_*`).
- `InviteMatchScreen`: obsługa `alreadyConfirmed` z komunikatem „Twój udział jest już potwierdzony, link wysłaliśmy na Twój e-mail” (D9).

---

## 9. Panel admina

### 9.1 Formularz „Dodaj gościa” (`InvitedGuestsSection.tsx`)
- Na górze przełącznik trybu: **Zaproś (gość potwierdza)** | **Dodaj jako potwierdzonego**. Wybór jest pamiętany w `localStorage` na czas sesji (wygoda przy wpisywaniu serii).
- W trybie „potwierdzony” pojawia się nowy komponent **`HouseholdEditor.tsx`**, wspólny dla dodawania, „Potwierdź ręcznie” i „Edytuj skład”:
  - wzorce **Osoba / Małżeństwo / Rodzina** (Rodzina = dzieci + przełącznik „z małżonkiem”, domyślnie włączony, bo zdarza się samotny rodzic),
  - małżonek: imię, nazwisko (domyślnie wpisane nazwisko osoby głównej, do zmiany), dieta,
  - dzieci: wiersze „wiek · imię (opcjonalnie) · dieta (opcjonalnie)”, „+ Dodaj dziecko”,
  - dieta osoby głównej, notatka wewnętrzna,
  - zwijana „Personalizuj treść maila” (istniejący `InviteMailEditor`; podgląd pokazuje już mail `INVITE_PRECONFIRMED`),
  - checkbox **Wyślij mail z potwierdzeniem i prośbą o dietę** (domyślnie zaznaczony, gdy jest e-mail; wyszarzony z podpowiedzią, gdy go brak),
  - przycisk **Dodaj jako potwierdzonego**.
- Konflikty z odpowiedzi API pokazują się jako żółte okno przy formularzu:
  - „Jan Kowalski jest już na liście (czeka na potwierdzenie)”: **[Potwierdź istniejące zaproszenie]** / [Anuluj],
  - „Anna Kowalska ma osobny rekord na liście, posiłki policzyłyby się podwójnie”: **[Usuń jej osobny rekord i dodaj rodzinę]** / [Dodaj mimo to] / [Anuluj].

### 9.2 Wiersz gościa
- Status: „Potwierdził” (gość, jak dziś) albo **„Potwierdzony · organizator”** (zielony, ikona `UserCheck`).
- Skład jak dziś + diety dzieci; chip diety: **„dieta: czeka na odpowiedź”** (bursztynowy, `UNKNOWN`) / „bez wymagań ✓” (`NONE`) / tekst diet.
- Notatka wewnętrzna (szara, kursywa).
- Akcje: „Czeka” daje **Potwierdź ręcznie**; potwierdzony daje **Edytuj skład i diety** oraz **Cofnij potwierdzenie** (z potwierdzeniem w oknie, bez `window.confirm`). Przycisk maila zmienia etykietę na „Wyślij mail z potwierdzeniem”.
- WhatsApp i iMessage: `inviteMessage()` dostaje trzeci wariant treści: „{Imię}, Twój udział w {tytuł} jest potwierdzony. Jeśli masz wymagania żywieniowe, podaj je tutaj: {link}”.

### 9.3 Pasek podsumowania
„Potwierdzeni: 14 dorosłych + 6 dzieci = 20 posiłków” (bez zmian) **+ „· diety nieznane: 3 rodziny”** + przycisk
**„Przypomnij o diecie (3)”** (widoczny, gdy N>0 i część z nich ma e-mail).

### 9.4 Moduły z `Registration`
Bez zmian w kodzie. Rodziny dodane przez admina są w Zgłoszeniach (badge „Bezpłatne”), Obecności (jeden check-in na rodzinę),
Zakwaterowaniu i Dashboardzie dzięki `syncRegistration`.

---

## 10. Rodzina jednym rekordem — reguły szczegółowe

1. **Duplikaty** (najważniejsze, bo zawyżają catering):
   - osoba główna: klucz jak w `createMany` (e-mail, a bez e-maila imię + nazwisko) dla wszystkich rekordów instancji;
   - **małżonek**: porównanie jego imienia + nazwiska z osobami głównymi **i** małżonkami innych rekordów, a także z e-mailem, jeśli rekord innej osoby ma e-mail pasujący do małżonka (gdy kiedyś dojdzie `spouseEmail`);
   - dzieci nie są sprawdzane (imiona opcjonalne, za dużo fałszywych alarmów).
2. **Osoba główna** to ta z e-mailem (kontakt, link). Jeśli e-mail ma żona, to ona jest osobą główną, a mąż jest małżonkiem. W edytorze przycisk ⇅ „zamień osobę główną z małżonkiem”.
3. **Nazwisko**: małżonek i dzieci domyślnie dziedziczą nazwisko osoby głównej (już tak robi `syncRegistration`); małżonek może mieć inne.
4. **Dorosłe dzieci**: wiek 0–25 (obecna sanityzacja). Starsze osoby dorosłe (dziadkowie, dorosłe rodzeństwo) dostają osobny rekord w v1. „Dodatkowa osoba dorosła” to kandydat na v2.
5. **Liczba posiłków**: dorośli = osoba główna + małżonek; dzieci liczone osobno (bez progu wieku, jak dziś).
6. **Check-in**: jedna pozycja na rodzinę (decyzja z 2026-08-19, bez zmian).
7. **Pokoje**: zmiana składu przez sync odczepia przypisania pokoi per osoba, a przypisanie rodziny zostaje (zachowanie istniejące; dla eventów INVITE bez noclegu bez znaczenia).
8. **Kursy**: `syncRegistration` woła `courseAccess.syncRegistrationSafe`, więc rodzina dodana przez admina dostanie dostęp do kursu powiązanego z eventem. Zgodne z „dostęp AUTO z eventu”, ale warto o tym pamiętać.

### 10.1 Tabela przypadków brzegowych

| Sytuacja | Zachowanie |
|---|---|
| Brak e-maila | Rekord potwierdzony, bez maila. Link do skopiowania lub wysłania przez WhatsApp z treścią „potwierdzony”. |
| Zwykłe zaproszenie, a potem „Potwierdź ręcznie” | `confirmedBy=ADMIN`, mail potwierdzający („nie musisz już klikać”). Stary link działa i pokazuje stan potwierdzony. |
| Gość sam potwierdził, potem admin poprawia skład | `confirmedBy` zostaje `GUEST`, zmiana przez `confirm` (edycja), domyślnie bez maila. |
| Admin poprawia skład po odpowiedzi gościa | Wygrywa ostatni zapis. Diety wpisane przez gościa są widoczne w edytorze, więc admin ich nie skasuje nieświadomie. |
| Osoba potwierdzona przez admina wypełnia formularz bez linku | D9: bez nadpisania danych, mail z linkiem ponownie. |
| Usunięcie rekordu lub cofnięcie potwierdzenia | Registration przechodzi na CANCELLED (D8). Check-in i historia zostają. |
| Mail wyłączony na serwerze (`LOGGED`) | Jak dziś: `sentAt` nie jest stemplowane, panel mówi wprost, że mail nie poszedł. |
| Skaner poczty otwiera link | Tylko GET strony bez skutków (D6). |
| „Zaproś gościa” włączone | Potwierdzeni przez admina mogą zapraszać (mają `confirmedAt`, nie są gośćmi uczestnika). Sekcja w mailu i przycisk na stronie. |
| Event już się zaczął | Q5: strona tylko do odczytu. |

---

## 11. Wpływ na Personal OS

- Istniejące endpointy zachowują kontrakt; do `InvitationRow` dochodzą tylko pola.
- Nowe endpointy (6.1) do opisania w handoffie **`docs/15-prompt-personal-os-potwierdzeni.md`** (osobny prompt, jak 10 i 11) po wdrożeniu backendu.
- Personal OS, który dziś pokazuje „potwierdził”, nadal działa poprawnie. Rozróżnienie „organizator / gość” i status diety to opcjonalne ulepszenie po jego stronie.

---

## 12. Decyzje (Jacek, 2026-10-02)

- **Q1 — gość może zmienić skład:** TAK (pod „Coś się zmieniło w składzie?”; `confirmedBy` zostaje `ADMIN`, w panelu widać „gość odpowiedział …”).
- **Q2 — mail domyślnie:** TAK, z checkboxem do rezygnacji (ciche dodanie).
- **Q3 — e-mail małżonka:** NIE.
- **Q4 — przypomnienie o diecie:** ręczny przycisk „Przypomnij o diecie (N)”.
- **Q5 — blokada po starcie eventu:** TAK (od `startsAt` API odrzuca zmiany gościa, strona tylko do odczytu; admin może dalej edytować).
- **Q6 — rezygnacja gościa:** TAK, wdrożona dla wszystkich zaproszonych (nie tylko potwierdzonych przez admina):
  „Nie dam(y) rady przyjść” na `/i/:token` (z potwierdzeniem) → `declinedAt`, zgłoszenie `CANCELLED`, status „Nie przyjdzie”
  w panelu i licznik „Nie przyjdzie: N”. „Jednak przyjdę” przywraca. Admin: „Nie przyjdzie” / „Cofnij odmowę”.
  Model: `Invitation.declinedAt`; endpointy `POST /invite/:token/decline`, `POST /admin/invitations/:id/decline`.
- **Q7 — masowe dodawanie + kreator:** TAK — „Wklej listę” w panelu i pole „Uczestnicy od razu potwierdzeni” w kreatorze eventu
  (format: `Imię Nazwisko, e-mail, telefon, małżonek, dzieci` — dzieci „Ola 7; Staś 4; 2”). W kreatorze osoba z listy zaproszonych
  zostaje potwierdzona (`confirmExisting`), możliwe duplikaty małżonków są pomijane i zgłaszane na ekranie sukcesu.

Drobne zmiany względem projektu: małżonek bez nazwiska jest pokazywany samym imieniem (dziedziczenie dałoby „Anna Kowalski”);
w zdaniu o danych w mailu zamiast „odpowiedz na tę wiadomość” jest „możesz się z nami skontaktować” (nie wiadomo, czy adres
nadawcy odbiera pocztę); link do polityki prywatności tylko gdy ustawiony `PRIVACY_POLICY_URL`.

---

## 13. Etapy wdrożenia

| Etap | Zakres | Weryfikacja |
|---|---|---|
| **E1 Backend** | pola Prisma; `confirmed` (dodawanie), `confirm`, `unconfirm`, `diet-reminders`; zmiany z 6.2 (`declarationData`, dzieci z dietą, `matchBySlug`, `remove`→CANCELLED, wybór szablonu, `toRow.dietStatus`) | testy logiki na fake Prisma: dodanie rodziny → Registration z 4 uczestnikami i dietami; konflikty (ta sama osoba, małżonek na liście); `confirmExisting`; zapis samej diety nie kasuje małżonka ani dzieci; `NONE` / `UNKNOWN` / `PROVIDED`; `matchBySlug` nie nadpisuje; usuń / cofnij → CANCELLED; „Wyślij niewysłane” wybiera właściwy szablon. **Smoke test DI** (`NestFactory.create(AppModule)`, lekcja z 2026-09-29). `tsc` api. |
| **E2 Mail** | `INVITE_PRECONFIRMED` (Ty/Wy/Państwo, przypomnienie, sekcja gości, zdanie o danych), `lat(n)`, etykieta w MailSettings | render tsx: 6 wariantów (osoba, para, rodzina, formalny, własny zwrot, przypomnienie) — sprawdzenie treści i odmian |
| **E3 Strona gościa** | stany z sekcji 8, diety dzieci w obu formularzach, `alreadyConfirmed` w dopasowaniu, i18n pl/en/it | Chromium (mock API): oba stany, zapis diety, „nikt nie ma wymagań”, zmiana składu, PL/EN, mobile bez poziomego scrolla |
| **E4 Panel** | przełącznik trybu, `HouseholdEditor`, konflikty, wiersz (status, chip diety, akcje), pasek + przypomnienie, treść WhatsApp/iMessage | Chromium (mock): dodaj rodzinę, konflikt → potwierdź istniejące, edytuj skład, cofnij, przypomnij; `tsc` app, `vite build` |
| **E5 (opcja)** | masowe dodawanie, kreator, handoff Personal OS (`docs/15`) | — |

**Po stronie Jacka:** push → **Manual Deploy `icpe-api`** (nowe kolumny) → front sam się zbuduje → test: dodaj siebie z rodziną jako potwierdzonego → mail → link → podaj dietę → sprawdź licznik i Zgłoszenia.
Polityka prywatności: dopisać, że organizator może wpisać dane uczestnika i członków rodziny (w tym wymagania żywieniowe) na potrzeby wydarzenia.
