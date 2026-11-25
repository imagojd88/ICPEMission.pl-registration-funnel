# 20 — Plan wdrożenia Tpay

> Status: etapy 0–3 WYKONANE w kodzie 25.11.2026; etap 4 (zwroty z panelu admina) WYKONANY w kodzie 25.11.2026 — do pushu i Manual Deploy `icpe-api`, NIE sprawdzony na działającym Tpay (szczegóły, założenia i scenariusze testu: `session_notes.md`, sekcja „Zwroty z panelu (etap 4)” niżej). Pozostaje etap 5 (testy w trybie testowym, produkcja). Plan zatwierdzony przez Jacka 25.11.2026, przygotowany przez agenta po lekturze dokumentacji Tpay i kodu.
> Oznaczenia: **[DOK]** fakt z dokumentacji Tpay, **[KOD]** fakt z kodu, **[ZAŁ]** założenie lub rekomendacja.
> Etap 0 częściowo wykonany 25.11.2026: `POST payments/dev/confirm/:regId` wymaga logowania admina (commit `58080fd`). `POST payments/:regId/checkout` i logowanie ładunku webhooka pozostają do zamknięcia.

## 0. Decyzje Jacka (25.11.2026)

1. Kanały płatności: przelew na konto, Tpay (tylko dla Polaków), później Stripe (karty). Tpay działa obok przelewu, włączany per event (`paymentMethods: ONLINE`).
2. Prowizję Tpay pokrywa organizator. Nic nie doliczamy gościowi.
3. Tpay daje BLIK i szybki przelew; metodę gość wybiera na stronie Tpay (bez `pay.groupId`). W tekstach: „BLIK · szybki przelew (Tpay)”, bez kart.
4. Kwota dowolna, ale nie mniejsza niż wymagana (i nie większa niż reszta).
5. Darowizna jest częścią kwoty zgłoszenia, bez osobnej obsługi.
6. „Polak” = najpierw kraj zamieszkania zgłaszającego (Polska → Tpay), dopiero gdy kraju brak, język interfejsu (polski → Tpay). Reguła egzekwowana także w API i w mailach.

## 1. Jak działa Tpay (wariant z przekierowaniem)

### Środowiska [DOK]
| | Produkcja | Sandbox |
|---|---|---|
| API | `https://api.tpay.com` | `https://openapi.sandbox.tpay.com` |
| Panel | `https://panel.tpay.com/` | `panel.sandbox.tpay.com` (rejestracja: `register.sandbox.tpay.com`) |
| Certyfikat podpisu | `https://secure.tpay.com/x509/notifications-jws.pem` | `https://secure.sandbox.tpay.com/x509/notifications-jws.pem` |
| Root CA | `https://secure.tpay.com/x509/tpay-jws-root.pem` | `https://secure.sandbox.tpay.com/x509/tpay-jws-root.pem` |

Źródła: docs-api.tpay.com (authorization, first-transaction, webhooks, refunds, multicurrency, payment-methods), support.tpay.com (sandbox), github.com/tpay-com/tpay-openapi-php (przykład RedirectPayment).

### Autoryzacja [DOK]
`POST /oauth/auth` (`application/x-www-form-urlencoded`: `client_id`, `client_secret`) → `access_token` (Bearer), `expires_in` (przykład 7200 s). Token używać ponownie do wygaśnięcia. Klucze: Panel ▸ Integracja ▸ API ▸ „Klucze Open API”; sekret widać tylko raz.

### Utworzenie transakcji [DOK]
`POST /transactions` (JSON, Bearer). Wymagane: `amount`, `description`. Używane: `hiddenDescription` (nasz identyfikator, wraca jako `tr_crc`), `payer.email`, `payer.name`, `callbacks.notification.url`, `callbacks.payerUrls.success`, `callbacks.payerUrls.error`. Bez `currency` = PLN. Odpowiedź: `transactionId`, `title` (`TR-…`), `status: pending`, `transactionPaymentUrl` (tam przekierowujemy gościa). Nadpisanie adresu powiadomień z żądania wymaga opcji „Zezwól na nadpisanie” w panelu Tpay. Powrót na adres `success` nie dowodzi zapłaty.

### Powiadomienie [DOK]
`POST`, `application/x-www-form-urlencoded`, wysyłane po rozliczeniu. Pola: `id` (ID sprzedawcy), `tr_id`, `tr_date`, `tr_crc`, `tr_amount`, `tr_paid` (kwota faktycznie zapłacona), `tr_currency`, `tr_desc`, `tr_status` (`true` = zapłacone, `chargeback` = pełny zwrot), `tr_email`, `md5sum`, `test_mode`.
- `md5sum = md5(id + tr_id + tr_amount + tr_crc + kod_bezpieczeństwa)`.
- Wymagana odpowiedź: HTTP 200 z treścią `TRUE`. Inaczej ponowienia (10 × co 1 min, 10 × co 3 min, 10 × co 10 min, 5 × co 1 h, potem po 12 h i 24 h). Odpowiedź 404 zatrzymuje ponowienia.
- Brak listy adresów IP nadawców: zamiast filtrowania IP weryfikować podpis JWS.
- Brak powiadomień o porzuceniu, anulowaniu i wygaśnięciu płatności.

### Podpis JWS [DOK]
Nagłówek `X-JWS-Signature` (trzy części rozdzielone kropką; pierwsza ma pole `x5u`). Certyfikat z `x5u` weryfikowany względem root CA Tpay. Dane do podpisu: `nagłówek + "." + base64url(surowe ciało)`, RSA z SHA-256.

### Zwroty [DOK]
`POST /transactions/{id}/refunds` (`{}` = pełny, `{"amount": …}` = częściowy). Zwrot pełny daje powiadomienie `tr_status=chargeback`. Powiadomienie o zwrocie częściowym i o chargebacku bankowym nie jest opisane.

### Zwroty z panelu (etap 4, wykonany 25.11.2026)
- **[DOK]** Ścieżka przyjmuje identyfikator transakcji z API (`transactionId`, u nas `OnlinePayment.externalId`), nie tytuł `TR-…`. Zwrot pełny zmienia status transakcji (`refund` / `chargeback`); zwrot częściowy statusu NIE zmienia, nawet gdy częściowe sumują się do 100%. PayPal nie obsługuje zwrotów. Kody błędów: `already_refunded`, `cannot_create_refund`, `no_sufficient_funds_or_refund_limit_reached`, `refund_failed`, `refund_period_expired`, `cannot_refund_collect_transaction`, `cannot_refund_marketplace_transaction`. Statusy zwrotu po stronie Tpay: New, Pending, Cancel, Hold, Done, Processed (+ BLIK_*).
- **[ZAŁ]** Kształt odpowiedzi `POST …/refunds` (czytamy tylko `result`, `status`, `errors[].errorCode`; HTTP 2xx bez błędów = przyjęty), format błędów, zachowanie w trybie testowym konta, brak powiadomienia o zwrocie częściowym, zwrot anulowany / wstrzymany przez Tpay PO przyjęciu (statusy Cancel / Hold) — system tego nie śledzi.
- **[KOD]** Tabela `PaymentRefund` (wiersz na zwrot; `lockKey @unique` = jedno zlecenie naraz na wpłatę), `RefundsService`, `POST /admin/payments/:paymentId/refund`, `POST /admin/payments/refunds/:refundId/resolve`. „Wpłacono” = wpłaty PAID − zwroty DONE. Odpowiedź niejednoznaczna (czas, 5xx) → stan „do wyjaśnienia”, bez ponowienia, mail do organizatora, ręczne rozstrzygnięcie w panelu.

### Sandbox [DOK]
BLIK: kody zaczynające się od `777`. Osobna baza i osobne klucze.

### Niepotwierdzone w dokumentacji
Pełny schemat `POST /transactions` i `GET /transactions/{id}` (strona referencyjna nie zwraca treści): wartości `lang`, czas życia transakcji, pełna lista statusów, parametry doklejane do adresów powrotu, format `tr_id`, prefiks `x5u` w sandboxie. Do sprawdzenia w sandboxie.

## 2. Projekt API

### Stan obecny [KOD]
- `api/src/payments/payments.service.ts`: tryb `mock`; `handleWebhook` tylko loguje ładunek.
- `api/src/main.ts`: `rawBody: true` (surowe ciało dostępne).
- `api/src/registrations/payment-plan.service.ts`: `paidMap` sumuje `Payment.status = 'PAID'`; `PARTIAL_PROVIDERS = ['panel', 'bank-import']`; `syncStatus` potwierdza zgłoszenie po zadatku.
- `registrations.service.ts`: edycja zgłoszenia nadpisuje kwotę płatności `PENDING`; `PublicFunnel.tsx` po wyborze „online” pokazuje od razu ekran sukcesu (`startCheckout` nie jest wywoływany).

### Zmienne środowiskowe (wartości tylko w panelu Render)
| Nazwa | Tajna | Opis |
|---|---|---|
| `PAYMENTS_MODE` | nie | `mock` \| `tpay` |
| `TPAY_ENV` | nie | `sandbox` \| `production` |
| `TPAY_CLIENT_ID` | tak | klucz Open API |
| `TPAY_CLIENT_SECRET` | tak | sekret Open API |
| `TPAY_MERCHANT_ID` | nie | porównywany z polem `id` powiadomienia |
| `TPAY_SECURITY_CODE` | tak | kod do `md5sum` |
| `API_PUBLIC_URL` | nie | adres API do zbudowania adresu powiadomień |
| `TPAY_ROOT_CA_PEM` lub `TPAY_ROOT_CA_FILE` | nie | opcjonalnie; bez nich root CA pobierany z oficjalnego adresu przy pierwszym użyciu |

### Schemat bazy (addytywnie)
Nowa tabela prób płatności `OnlinePayment`: `id`, `registrationId`, `provider` (`tpay`, później `stripe`), `crc @unique`, `externalId @unique?`, `title`, `amount`, `currency`, `purpose`, `status` (CREATED / PENDING / PAID / REFUNDED / FAILED / EXPIRED), `paidAmount`, `paymentUrl`, `paymentId @unique?`, `testMode`, `raw`, `paidAt`, znaczniki czasu. Bez zmian w `Payment`: wiersze `PENDING` w `Payment` są nadpisywane przy edycji zgłoszenia, a dodanie unikalności do istniejącej tabeli przez `prisma db push` jest ryzykowne.

### Pliki
- nowe: `api/src/payments/tpay.service.ts` (token, transakcja), `api/src/payments/tpay-verify.ts` (czysta funkcja weryfikacji, bez importów Nest), `api/src/payments/online-payments.service.ts` (kwoty, próby, księgowanie), `shared/src/onlinePayments.ts` (+ lustro): `onlineProviderFor(kraj, język, skonfigurowani)`, `onlinePayBounds(stan)`, `onlinePayAmount(tryb, kwota, granice)`;
- zmiany: `payments.controller.ts`, `payments.module.ts`, `payment-plan.service.ts` (`SUM_PROVIDERS = [...PARTIAL_PROVIDERS, 'tpay']` w `paidMap`), `schema.prisma`, `render.yaml`.

### Endpointy
1. `GET /payments/config` (publiczny): lista skonfigurowanych dostawców, bez sekretów. W trybie `mock` pusta.
2. `GET /registrations/manage/:token/payments`: rozliczenie, granice kwot, wpłaty, stan ostatniej próby, czy online dostępny dla tego zgłoszenia.
3. `POST /registrations/manage/:token/pay` `{ mode: 'due' | 'remaining' | 'custom', amount? }`: kwotę liczy serwer; warunki: tryb `tpay`, event ma `ONLINE`, zgłoszenie nieanulowane, PLN, reszta > 0, reguła kraj / język. Zwraca `{ redirectUrl, amount }`. Świeża próba na tę samą kwotę jest używana ponownie. Limit prób na zgłoszenie.
4. `POST /payments/webhook/tpay`: surowe ciało, odpowiedź tekstowa `TRUE` / `FALSE`.
5. Zamknąć `POST payments/:regId/checkout` (`JwtAuthGuard`; nazwa pada w `CONTRACT.md`, więc nie usuwać bez sprawdzenia Personal OS).

### Księgowanie i idempotencja
W jednej transakcji bazy: `updateMany` próby z warunkiem „status ≠ PAID” (wynik 0 = już zaksięgowane, odpowiadamy `TRUE`), `Payment.create` (`provider: 'tpay'`, `method: 'ONLINE'`, `status: 'PAID'`, `amount = tr_paid`, `externalId = tr_id`, `raw` bez e-maila), zapis `paymentId`. Potem `PaymentPlanService.syncStatus` i mail „Otrzymaliśmy wpłatę”.

### Przypadki brzegowe
| Sytuacja | Zachowanie |
|---|---|
| `tr_paid` ≠ oczekiwana kwota | księgujemy faktyczny wpływ, znacznik rozbieżności, mail do organizatora |
| waluta ≠ PLN, nieznane `tr_crc` | nie księgujemy automatycznie, mail do organizatora, odpowiedź `TRUE` |
| płatność porzucona | próby starsze niż 24 h → `EXPIRED`; gość płaci ponownie |
| dwie próby opłacone | obie zaksięgowane, nadpłata widoczna w panelu |
| zgłoszenie anulowane, a wpłata przyszła | księgujemy i powiadamiamy organizatora |
| zwrot pełny (`chargeback`) | `Payment.status = 'REFUNDED'`, mail do organizatora, statusu zgłoszenia nie cofamy |
| zwrot częściowy z panelu admina | wiersz `PaymentRefund`, „Wpłacono” pomniejszone o kwotę; wpłata zostaje PAID do zwrotu całości |
| zwrot częściowy zlecony w panelu Tpay, chargeback bankowy | korekta ręczna (brak opisu w dokumentacji; system się o nim nie dowie) |
| `test_mode=1` na produkcji | odrzucamy |

## 3. Bezpieczeństwo

Weryfikacja powiadomienia:
1. surowe ciało i nagłówek `X-JWS-Signature` obecne;
2. nagłówek JWS: `alg === 'RS256'`;
3. `x5u`: `https:`, host dokładnie `secure.tpay.com` (produkcja) lub `secure.sandbox.tpay.com`, ścieżka `/x509/…` (samo `startsWith` przepuściłoby `secure.tpay.com.evil.pl`);
4. certyfikat podpisujący z pamięcią podręczną; root CA jako kotwica zaufania;
5. `checkIssued`, `verify(root.publicKey)`, daty ważności;
6. `crypto.verify('RSA-SHA256', nagłówek + '.' + base64url(ciało), cert.publicKey, podpis)`;
7. dopiero potem parsowanie pól;
8. `id === TPAY_MERCHANT_ID`;
9. `md5sum` przez `timingSafeEqual`;
10. `test_mode` zgodne ze środowiskiem.

Błąd weryfikacji: HTTP 400 `FALSE`, bez zmian w bazie (nie 404, bo zatrzymałoby ponowienia). Nie logować sekretów, tokenu, `md5sum`, pełnego JWS, e-maila płatnika ani całego ciała.

Tworzenie płatności: tylko posiadacz tokenu zgłoszenia; kwota liczona na serwerze; limit prób. Parametry powrotu z przeglądarki służą tylko do banera; stan pochodzi z API, a zaksięgowanie wyłącznie z podpisanego powiadomienia.

## 4. Frontend

- Lejek: karta „Płatność online” tylko gdy API zgłasza dostępność i reguła kraj / język daje Tpay; po wysłaniu zgłoszenia utworzenie płatności na kwotę wymaganą i przekierowanie. Gdy utworzenie płatności się nie uda: ekran sukcesu z przyciskiem „Zapłać online” (zgłoszenie nie może pójść drugi raz).
- Strona gościa `/z/:token`: sekcja „Płatności” (harmonogram, wpłacono, pozostało, lista wpłat), przyciski „Zapłać teraz”, „Zapłać całość”, „Inna kwota” (od wymaganej do reszty). Powrót: `?pay=return` → „Sprawdzamy płatność…” z odpytywaniem; `?pay=error` → komunikat i ponowienie. Sekcja widoczna także po potwierdzeniu zgłoszenia (kolejne raty).
- Maile: przycisk „Zapłać online” w przypomnieniach o ratach (gdy reguła daje Tpay), nowy mail „Otrzymaliśmy wpłatę”, link do strony zgłoszenia w potwierdzeniu.
- Teksty w PL / EN / IT / KO / ZH.

## 5. Panel admina

- Ostrzeżenie w edycji eventu, gdy `ONLINE` zaznaczone, a Tpay nieskonfigurowany lub waluta ≠ PLN.
- „Płatności”: źródło „online (Tpay)”, tytuł transakcji, znacznik testu i rozbieżności kwoty; bez przycisku „cofnij”.
- Ustawienia: kafel „Płatności online” (tryb, środowisko, czy klucze ustawione, adres powiadomień do skopiowania).
- Zwroty: od etapu 4 przycisk „Zwróć” przy wpłacie Tpay (pełny / częściowy, powód, powiadomienie gościa); zwrot pełny zlecony w panelu Tpay nadal jest obsługiwany powiadomieniem.

## 6. Co robi właściciel

1. Konto na `register.sandbox.tpay.com`; klucze Open API w panelu sandbox.
2. Ustawienia ▸ Powiadomienia: adres `<adres API>/payments/webhook/tpay`, „Zezwól na nadpisanie”, kod bezpieczeństwa.
3. Render ▸ `icpe-api` ▸ Environment: zmienne z sekcji 2 (`TPAY_ENV=sandbox`, `PAYMENTS_MODE=tpay`). Kluczy nie wklejać do rozmowy ani do repozytorium.
4. Push i Manual Deploy `icpe-api`.
5. Testy w sandboxie: płatność BLIK `777…`, ponowione powiadomienie (nadal jedna wpłata), porzucona płatność, druga rata z maila, „Inna kwota” poniżej wymaganej (odmowa), event bez planu, zwrot pełny z panelu.
6. Potem konto produkcyjne, nowe klucze, `TPAY_ENV=production`, próba na małej kwocie.

## 7. Etapy

| Etap | Zakres | Szacunek |
|---|---|---|
| 0 | zamknięcie `checkout`, usunięcie logowania ładunku | do 1 h |
| 1 | backend: tabela, serwisy, webhook z JWS, księgowanie, testy weryfikacji | 10–14 h |
| 2 | frontend gościa i tłumaczenia | 8–10 h |
| 3 | maile i panel | 5–7 h |
| 4 (później) | zwroty z panelu admina | 4–6 h |
| 5 | sandbox, poprawki, produkcja | 4–6 h + czas właściciela |

## 8. Otwarte

- Co ze zgłoszeniem online bez wpłaty: jak długo czeka i czy blokuje pokój.
- Czy przenieść `icpe-api` z planu, który usypia (opóźnia powiadomienia; ponowienia Tpay to ratują).
- Adres powrotu zawiera token zgłoszenia (trafia do Tpay; token i tak jest w mailach).
- Wymagania Tpay wobec strony sprzedawcy (regulamin, polityka zwrotów): wynikają z umowy, nie z dokumentacji API.
- Stripe dla gości spoza Polski: osobne wdrożenie.
