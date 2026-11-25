# API dla ICPE Go — dane eventów z systemu rejestracji

> Odczyt danych eventów z rejestracji ICPEMission.pl przez aplikację webową **ICPE Go**.
> Tylko dane eventu i liczby. Żadnych imion, e-maili, telefonów ani płatności.

## Jak event trafia do ICPE Go

Panel admina ▸ Eventy ▸ edycja eventu ▸ sekcja **ICPE Go** ▸ zaznacz **„Udostępniaj dane ICPE Go"** ▸ **Zapisz**.

- Domyślnie wyłączone. Nowy event nie pojawia się w ICPE Go, dopóki ktoś go nie udostępni.
- Po odznaczeniu event znika z listy, a pod swoim adresem zwraca `404`.
- **Ukryty event** (edycja eventu ▸ sekcja „Widoczność” ▸ „Ukryty event”, pole `EventInstance.unlisted`) nie trafia na listę `GET /icpe-go/events`, nawet gdy ma zaznaczone „Udostępniaj dane ICPE Go”. Pod własnym adresem `GET /icpe-go/events/<id albo slug>` nadal odpowiada, o ile jest udostępniony — kto zna adres, ten go pobierze.
- Po zaznaczeniu panel pokazuje adres tego eventu dla ICPE Go z przyciskiem „Kopiuj".
- W bazie jest to pole `EventInstance.shareWithIcpeGo` (domyślnie `false`). Kolumnę dodaje `prisma db push` przy starcie API.
- Kraj eventu wybiera się w tej samej edycji, w polu **„Kraj”** pod „Miejsce”. W bazie: `EventInstance.countryCode` (kod ISO, domyślnie `null`).

## Adres bazowy

`https://icpe-api.onrender.com` (produkcja, Render `icpe-api`)

## Klucz dostępu (opcjonalny)

- Jeśli zmienna **`ICPE_GO_API_KEY`** na Renderze jest pusta, endpointy są publiczne. Zwracają tylko to, co i tak widać na stronie rejestracji, plus liczby.
- Jeśli jest ustawiona, każde żądanie musi podać klucz:
  - nagłówek `Authorization: Bearer <klucz>` (zalecane przy wywołaniach z serwera ICPE Go)
  - albo parametr `?key=<klucz>`
- Zły lub brakujący klucz zwraca `401`.
- Uwaga: gdy ICPE Go woła API wprost z przeglądarki, klucz będzie widoczny w kodzie strony. Wtedy chroni głównie przed przypadkowym użyciem, nie przed kimś zdeterminowanym.

CORS jest otwarty dla każdej domeny, więc wywołanie z przeglądarki działa.
Odpowiedzi mają `Cache-Control: public, max-age=60`, czyli dane mogą być opóźnione do minuty.

---

## `GET /icpe-go/events`

Lista udostępnionych eventów, posortowana po dacie rozpoczęcia (najbliższe pierwsze).

| Parametr | Wartości | Domyślnie | Znaczenie |
|---|---|---|---|
| `scope` | `upcoming` · `open` · `all` | `upcoming` | `upcoming`: eventy, które się jeszcze nie skończyły (otwarte i zamknięte). `open`: tylko z otwartymi zapisami. `all`: także przeszłe i zarchiwizowane. Szkice (DRAFT) nigdy nie są zwracane. |
| `lang` | `pl` · `en` · `it` · `ko` · `zh` | brak | Dodaje pole `titleText` z tytułem w tym języku. Brak tłumaczenia: angielski, potem polski. |
| `key` | klucz | brak | Gdy ustawiono `ICPE_GO_API_KEY` (alternatywa dla nagłówka). |

Odpowiedź:

```json
{
  "generatedAt": "2026-11-25T12:40:00.000Z",
  "count": 1,
  "events": [ { …obiekt eventu… } ]
}
```

## `GET /icpe-go/events/:idOrSlug`

Jeden event po **id instancji** albo **slugu** strony rejestracji (to, co stoi po `/r/` w linku).
Przy slugu, gdy seria ma kilka terminów, zwracany jest termin z otwartymi zapisami, a jeśli takiego nie ma, najnowszy.

```json
{ "generatedAt": "…", "event": { …obiekt eventu… } }
```

Event nieudostępniony albo nieistniejący: `404`. API nie zdradza, czy taki event w ogóle jest w systemie.

---

## Obiekt eventu

```json
{
  "id": "cmabc123…",
  "slug": "rekolekcje-wspolnot-2027",
  "type": "ONE_TIME",
  "title": { "pl": "Rekolekcje wspólnot", "en": "Communities' Retreat", "it": "…" },
  "titleText": "Rekolekcje wspólnot",
  "location": "Ośrodek h2o, Kiczyce",
  "countryCode": "PL",
  "startsAt": "2027-08-22T12:00:00.000Z",
  "endsAt": "2027-08-27T20:00:00.000Z",
  "status": "OPEN",
  "registration": {
    "open": true,
    "opensAt": "2026-12-01T00:00:00.000Z",
    "closesAt": "2027-08-15T00:00:00.000Z",
    "inviteOnly": false,
    "url": "https://rejestracja.icpemission.pl/r/rekolekcje-wspolnot-2027"
  },
  "participants": {
    "registrations": 41,
    "adults": 96,
    "children": 38,
    "total": 134,
    "childrenTracked": true
  },
  "capacity": {
    "limit": 170,
    "taken": 134,
    "free": 36,
    "occupancyPct": 79,
    "full": false
  }
}
```

| Pole | Opis |
|---|---|
| `id` | Id terminu (instancji) eventu. |
| `slug` | Adres strony rejestracji (`/r/<slug>`). `null`, gdy event nie ma strony. |
| `type` | `ONE_TIME` (zwykły z rejestracją), `STANDALONE` (bez rejestracji, potwierdzenie TAK/NIE), `INVITE` (na zaproszenie), `EVERGREEN`. |
| `title` | Tytuł we wszystkich wpisanych językach (tylko niepuste). |
| `titleText` | Tylko z `?lang=`. |
| `location` | Miejsce jako jeden tekst, tak jak wpisano w panelu (bez kraju). |
| `countryCode` | Kraj eventu: kod ISO 3166-1 alpha-2, wielkie litery, dokładnie 2 znaki (np. `"PL"`, `"IT"`, `"MT"`). `null`, gdy w panelu nie wybrano kraju. Bez nazwy kraju: ICPE Go tłumaczy ją sam. Ustawia się w edycji eventu, pole „Kraj” pod „Miejsce”. |
| `startsAt`, `endsAt` | Początek i koniec, ISO 8601 w UTC. Do wyświetlania przelicz na `Europe/Warsaw`. |
| `status` | `OPEN` (zapisy otwarte) albo `CLOSED` (zamknięte, zakończone lub zarchiwizowane). |
| `registration.open` | Czy formularz przyjmuje zgłoszenia. Tak samo jak w publicznym formularzu: decyduje status eventu. |
| `registration.opensAt` / `closesAt` | Daty otwarcia i zamknięcia zapisów z ustawień eventu (informacyjnie). |
| `registration.inviteOnly` | `true` dla eventu na zaproszenie. Wtedy `url` = `null`, bo nie ma publicznego formularza. |
| `registration.url` | Link do rejestracji, który można pokazać w ICPE Go. |
| `participants.registrations` | Liczba zgłoszeń (formularzy). Jedno zgłoszenie może obejmować całą rodzinę. |
| `participants.adults` / `children` | Liczba osób, według tego, jak zgłaszający oznaczył uczestnika w formularzu (dorosły / dziecko). |
| `participants.total` | `adults + children`. |
| `participants.childrenTracked` | `false` dla `STANDALONE`. Taki event zbiera tylko „będę / nie będę" bez podziału na dzieci, więc wszystkie potwierdzenia TAK są w `adults`, a `children` = 0. |
| `capacity.limit` | „Limit miejsc" z ustawień eventu (osoby). `null`, gdy go nie ustawiono. |
| `capacity.taken` | Zajęte miejsca = `participants.total`. |
| `capacity.free` | Wolne miejsca (nie mniej niż 0). `null` bez limitu. |
| `capacity.occupancyPct` | % zajętych miejsc, zaokrąglony. Może przekroczyć 100, jeśli zapisano więcej osób niż limit. `null` bez limitu. |
| `capacity.full` | `true`, gdy zajęte ≥ limit. |

### Kogo liczymy

Zgłoszenia w każdym statusie **poza anulowanymi i listą rezerwową**, czyli potwierdzone oraz czekające na wpłatę lub przelew. Osoby z listy rezerwowej nie zajmują miejsca, więc ich tu nie ma. Potwierdzeni goście z eventów na zaproszenie są liczeni, bo po potwierdzeniu dostają zwykłe zgłoszenie z uczestnikami.

## Przykłady

```bash
# Nadchodzące udostępnione eventy, tytuły po polsku
curl "https://icpe-api.onrender.com/icpe-go/events?lang=pl"

# Jeden event po slugu, z kluczem
curl -H "Authorization: Bearer $ICPE_GO_API_KEY" \
  "https://icpe-api.onrender.com/icpe-go/events/rekolekcje-wspolnot-2027"
```

```js
// W przeglądarce (ICPE Go)
const res = await fetch('https://icpe-api.onrender.com/icpe-go/events?scope=open&lang=pl')
const { events } = await res.json()
```

## Uwagi dla ICPE Go

- **Pierwsze żądanie bywa wolne.** API na Renderze potrafi się uśpić, więc pierwsze wywołanie po przerwie może trwać kilkanaście sekund. Warto pokazać stan ładowania i ustawić timeout na ok. 30 s.
- Swagger z pełną listą i schematem odpowiedzi: `https://icpe-api.onrender.com/docs`, tag **icpe-go**.

## Zmiany

- **2026-11-25:** nowe pole `countryCode` (ISO 3166-1 alpha-2 albo `null`). `location` bez zmian.

## Pliki w repo

- `api/src/icpe-go/` — moduł (`icpe-go.controller.ts`, `icpe-go.service.ts`, `icpe-go.module.ts`, `icpe-go.dto.ts` = opis odpowiedzi w Swaggerze)
- `api/prisma/schema.prisma` — `EventInstance.shareWithIcpeGo`, `EventInstance.countryCode`
- `api/src/events/events.service.ts` — zapis przełącznika (`PATCH /admin/instances/:id`, pole `shareWithIcpeGo`) i odczyt w `GET /r/:slug/config`
- `app/src/components/admin/events/EventEditForm.tsx` — sekcja „ICPE Go" i pole „Kraj” w edycji eventu
- `app/src/lib/countries.ts` — lista kodów ISO i polskie nazwy krajów (Intl.DisplayNames)
- `render.yaml`, `.env.example` — `ICPE_GO_API_KEY`
