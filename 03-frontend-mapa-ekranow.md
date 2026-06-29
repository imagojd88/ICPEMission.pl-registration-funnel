# ICPE Mission — Frontend: mapa ekranów i przepływów

Frontend: **React + TypeScript** (Vite lub Next.js), state przez React Query (dane serwerowe) + Zustand/Context (UI), formularze przez React Hook Form + Zod, i18n przez `react-i18next` (PL/EN/IT), Tailwind + biblioteka komponentów (shadcn/ui). Dwie aplikacje w jednym repo: **publiczny lejek** i **panel admina**.

---

## A. Publiczny lejek rejestracji (`/r/:slug`)

Prosty, mobilny w pierwszej kolejności, max. konwersja. Selektor języka widoczny od początku (PL/EN/IT).

1. **Landing eventu** — hero (logo/branding eventu), tytuł, termin, miejsce, krótki opis, cena „od", licznik wolnych miejsc, CTA „Zapisz się". Stan zamknięty → komunikat + (evergreen) data następnej edycji.
2. **Formularz rejestracji** — kreator wieloetapowy (stepper):
   - Krok 1: Dane zgłaszającego — imię, nazwisko, email, telefon, adres.
   - Krok 2: Uczestnicy/dzieci — dynamiczna lista (dodaj osobę): typ, wiek/data ur., płeć, dieta/alergie.
   - Krok 3: Preferencje żywieniowe/alergie (zbiorcze) + uwagi.
   - Krok 4: Preferowany typ pokoju (karty z ceną i opisem; pokazuje różnicę 1-os vs miejsce w 2-os).
   - Krok 5: Opcje dodatkowe + kod rabatowy.
   - **Pasek ceny na żywo** (sticky) aktualizowany z `POST /pricing/quote`.
   - Zgody RODO + regulamin (wersjonowane).
3. **Wybór metody płatności** — jeśli edycja ma obie: karty „Płatność online" / „Przelew tradycyjny".
4. **Strona podsumowania zgłoszenia** — komplet danych, **cena**, **wybrana metoda płatności**:
   - online → przycisk „Zapłać teraz" (redirect do operatora);
   - przelew → dane do przelewu + indywidualny tytuł `REG-xxxx`, kwota, termin.
   - Przyciski **„Dodaj do Google Calendar"** i **„Pobierz .ics"**.
   - Link do edycji zgłoszenia (magic-link) / „Załóż konto, by zarządzać".
5. **Powrót z płatności** — status (sukces / oczekuje / błąd).
6. **Edycja zgłoszenia** (magic-link / konto) — podgląd i zmiana danych do terminu.

### Konto gościa
- Logowanie / rejestracja / magic-link.
- Pulpit: moje zgłoszenia (status, płatność, przydzielony pokój), edycja profilu i zapisanych danych dzieci.

### Self-check-in obecności
- Ekran z linku/QR: wybór spotkania → „Jestem / Nieobecny / Usprawiedliwiony".

---

## B. Panel admina

Layout: lewy sidebar (nawigacja), górny pasek (organizacja, język panelu, profil), główny obszar treści. Nowoczesny, gęsty informacyjnie ale czytelny.

1. **Dashboard** — kafelki KPI (otwarte edycje, zgłoszenia dziś, przychód, obłożenie pokoi), najbliższe terminy, ostatnie zgłoszenia.
2. **Eventy / Generator stron**
   - Lista serii (jednorazowe / evergreen, status, slug, liczba zgłoszeń).
   - **Kreator nowego eventu** (wizard):
     - Typ: jednorazowy / evergreen (+ kalendarz RRULE i okno rejestracji dla evergreen).
     - Szczegóły edycji: termin, miejsce, noce, pojemność, metody płatności.
     - Pokoje: dodaj typ (nazwa PL/EN/IT, pojemność, model cenowy, cena, ilość) → podgląd puli.
     - Cennik: progi wiekowe + ceny, opcje, rabaty.
     - Strona: slug, branding (logo/kolor/hero), wybór pól, pola niestandardowe (z tłumaczeniami), języki.
     - Podgląd na żywo + Publikuj.
   - **Edytor strony** z podglądem i przełącznikiem PL/EN/IT.
3. **Zgłoszenia** (per edycja) — tabela z filtrami (status, płatność, szukaj), wiersz → szczegóły; akcje: zmień status, oznacz opłacone, przydziel pokój, wyślij maila, eksport XLSX.
4. **Pokoje / Zakwaterowanie** — widok puli pokoi i przydziału (lista lub plan tablicowy „kto w którym pokoju"), drag-and-drop przydziału, sygnalizacja kolizji (płeć/rodzina/pojemność).
5. **Płatności** — lista transakcji, ręczne potwierdzanie przelewów, zwroty, rozliczenie edycji.
6. **Obecność** — serie spotkań, terminy, lista obecności (odhaczanie + zliczanie), link/QR do self-check-in.
7. **Ustawienia** — dane organizacji, dane do przelewu, operatorzy płatności (klucze), branding domyślny, szablony maili (PL/EN/IT), użytkownicy i role.

---

## C. Wspólne zasady UI/UX
- **Wielojęzyczność**: selektor PL/EN/IT wszędzie; treści dynamiczne z backendu w wybranym języku.
- **Mobile-first** dla lejka, **desktop-first** dla panelu.
- **Dostępność** (WCAG AA): kontrast, focus, etykiety, obsługa klawiatury.
- **Walidacja inline** + komunikaty per-locale.
- **Stany**: ładowanie (skeleton), pusty, błąd, sukces.
- **Spójny system projektowy**: tokeny kolorów/typografii oparte o branding ICPE (spokojna, „misyjna"/wspólnotowa estetyka — ciepłe, zaufane, nieagresywne).
