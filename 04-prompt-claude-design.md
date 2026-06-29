# Prompt do Claude Design — frontend systemu rejestracji ICPE

> Skopiuj cały blok poniżej i wklej do Claude Design. Możesz go uruchamiać sekcjami (najpierw lejek publiczny, potem panel admina), jeśli wolisz mniejsze iteracje. Prompt jest po polsku, bo UI jest polskojęzyczne (z przełącznikiem PL/EN/IT).

---

## PROMPT (do wklejenia)

Zaprojektuj nowoczesny, dopracowany frontend webowej aplikacji do rejestracji na eventy dla wspólnoty **ICPE Mission** (katolicka organizacja ewangelizacyjna). Aplikacja obsługuje rejestrację na wyjazdy formacyjne, zgłaszanie obecności na spotkaniach oraz panel administracyjny z generatorem stron rejestracji. Stack docelowy: **React + TypeScript + Tailwind CSS**, komponenty w stylu shadcn/ui. Projekt ma być **mobile-first dla części publicznej** i **desktop-first dla panelu admina**, w pełni wielojęzyczny (**PL / EN / IT** — przełącznik języka w nagłówku).

### Język wizualny / branding
- Estetyka: ciepła, spokojna, wspólnotowa, godna zaufania — nie korporacyjna, nie agresywna. Dużo światła (whitespace), miękkie zaokrąglenia (rounded-2xl), subtelne cienie, delikatne gradienty.
- Paleta: bazowa neutralna (ciepła biel / piaskowy off-white), kolor akcentu w tonacji głębokiego błękitu lub indygo z ciepłym akcentem (bursztyn/terakota) dla CTA. Zaproponuj spójne tokeny kolorów (light + dark mode).
- Typografia: czytelny, humanistyczny font (np. Inter/General Sans dla UI, opcjonalny serif dla nagłówków hero). Wyraźna hierarchia.
- Ikony: spójny zestaw liniowy (lucide).
- Dostępność: kontrast WCAG AA, widoczny focus, etykiety pól, pełna obsługa klawiatury.

### Powierzchnia 1 — Publiczny lejek rejestracji (mobile-first)
Zaprojektuj następujące ekrany jako spójny, konwersyjny przepływ:

1. **Landing eventu** (`/r/:slug`): sekcja hero z logo/brandingiem eventu, tytuł, termin, miejsce, krótki opis, cena „od", pasek wolnych miejsc, duże CTA „Zapisz się". Selektor języka PL/EN/IT w prawym górnym rogu. Wariant „rejestracja zamknięta" z informacją o następnym terminie (dla eventów cyklicznych/evergreen).

2. **Wieloetapowy formularz rejestracji** (stepper z paskiem postępu), kroki:
   - Dane zgłaszającego: imię, nazwisko, email, telefon, adres.
   - Uczestnicy i dzieci: dynamiczna lista „dodaj osobę" — typ (dorosły/dziecko), wiek lub data urodzenia, płeć, dieta/alergie.
   - Preferencje żywieniowe i alergie (zbiorczo) + uwagi.
   - Wybór typu pokoju: **karty pokoi** pokazujące nazwę, opis, pojemność i cenę — wyraźnie różnicujące np. „pokój 1-osobowy" (wyższa cena) vs „miejsce w pokoju 2-osobowym" (niższa cena za osobę). Zaznaczona karta = wybór.
   - Opcje dodatkowe + pole na kod rabatowy.
   - **Sticky pasek z ceną na żywo** na dole ekranu (mobile) / z boku (desktop), aktualizowany przy każdej zmianie.
   - Sekcja zgód RODO + akceptacja regulaminu.

3. **Wybór metody płatności**: dwie duże karty do wyboru — „Płatność online" (karta/BLIK/szybki przelew) oraz „Przelew tradycyjny". Pokaż oba warianty (event może udostępniać jeden lub oba).

4. **Strona podsumowania zgłoszenia** (kluczowy ekran): czytelne podsumowanie wszystkich danych i uczestników, **wyróżniona cena całkowita z rozbiciem** (opłaty uczestników + zakwaterowanie + opcje − rabaty), wybrana metoda płatności:
   - dla online: przycisk „Zapłać teraz";
   - dla przelewu: zwięzła karta z danymi do przelewu, indywidualnym tytułem `REG-xxxx`, kwotą i terminem, z przyciskiem „Kopiuj".
   - Para przycisków: **„Dodaj do Google Calendar"** i **„Pobierz .ics"**.
   - Sekcja „Zarządzaj zgłoszeniem" (link edycyjny / zachęta do założenia konta).
   - Stan sukcesu/potwierdzenia z miłym, ciepłym komunikatem.

5. **Ekran powrotu z płatności**: warianty sukces / oczekiwanie / błąd.

6. **Pulpit konta gościa**: lista moich zgłoszeń (status, płatność, przydzielony pokój), edycja profilu i zapisanych danych dzieci. Logowanie / rejestracja / magic-link.

7. **Self-check-in obecności** (z linku/QR): prosty ekran wyboru spotkania i przycisków „Jestem / Nieobecny / Usprawiedliwiony".

### Powierzchnia 2 — Panel administracyjny (desktop-first)
Layout aplikacyjny: lewy sidebar z nawigacją (ikony + etykiety), górny pasek (nazwa organizacji, przełącznik języka panelu, profil/wyloguj), główny obszar treści z nagłówkiem strony i akcjami.

1. **Dashboard**: rząd kafelków KPI (otwarte edycje, zgłoszenia dziś, przychód, obłożenie pokoi %), wykres trendu zgłoszeń, lista najbliższych terminów, tabela ostatnich zgłoszeń.

2. **Eventy / Generator stron**:
   - Lista serii eventów (typ: jednorazowy / evergreen, status, slug, liczba zgłoszeń, akcje).
   - **Kreator nowego eventu (wizard, wieloetapowy)**:
     - Krok „Typ": karty „Event jednorazowy" vs „Event cykliczny (evergreen)"; dla evergreen — ustawienie kalendarza powtarzania (częstotliwość, dzień) oraz okna rejestracji (otwarcie/zamknięcie X dni przed terminem).
     - Krok „Szczegóły": termin, miejsce, liczba nocy, pojemność, metody płatności.
     - Krok „Pokoje": formularz dodawania typu pokoju (nazwa PL/EN/IT, pojemność, model cenowy: za osobę / za pokój / za osobonoc / dopłata do jedynki, cena, ilość) + tabela podglądu wygenerowanej puli pokoi.
     - Krok „Cennik": edytor progów wiekowych (etykieta, zakres wieku, cena), opcje dodatkowe, rabaty.
     - Krok „Strona": slug/URL, branding (logo, kolor, hero), checklista zbieranych pól, edytor pól niestandardowych z wariantami językowymi, wybór języków.
     - Podgląd na żywo (panel obok) + przycisk „Publikuj".

3. **Zgłoszenia** (widok per edycja): rozbudowana tabela z filtrami (status, płatność, szukaj), paginacją, zaznaczaniem wielu, akcjami masowymi; panel boczny/szczegóły zgłoszenia po kliknięciu (dane, uczestnicy, płatność, przydzielony pokój, historia); akcje: zmień status, oznacz opłacone, przydziel pokój, wyślij maila, eksport XLSX.

4. **Zakwaterowanie / Przydział pokoi**: wizualny widok puli pokoi (karty/siatka pokoi z obłożeniem) + **przydział drag-and-drop** gości do pokoi; sygnalizacja kolizji (niezgodność płci, przekroczona pojemność, pokój rodzinny). Lista nieprzydzielonych z boku.

5. **Płatności**: tabela transakcji (status, metoda, kwota, operator), ręczne potwierdzanie przelewów, zwroty, podsumowanie rozliczenia edycji.

6. **Obecność**: lista serii spotkań, kalendarz/lista terminów, arkusz obecności z odhaczaniem (present/absent/excused) i licznikiem frekwencji; generowanie linku/QR do self-check-in.

7. **Ustawienia**: dane organizacji, dane do przelewu, konfiguracja operatorów płatności, branding domyślny, edytor szablonów maili (PL/EN/IT), zarządzanie użytkownikami i rolami.

### Wymagania przekrojowe
- Zaprojektuj spójny **design system**: tokeny kolorów (light/dark), skala typografii, odstępy, komponenty bazowe (Button, Input, Select, Card, Badge/Chip, Tabs, Stepper, Table, Modal, Toast, Tooltip, EmptyState, Skeleton).
- Pokaż **stany**: ładowanie (skeleton), pusty, błąd walidacji inline, sukces.
- **Przełącznik języka** obecny na obu powierzchniach; pokaż ten sam ekran w PL i np. EN, by zademonstrować i18n.
- Komponenty responsywne; część publiczna idealna na telefonie.
- Dostarcz czysty, modułowy kod React + Tailwind, komponenty rozdzielone na pliki, z przykładowymi danymi (mock) i typami TypeScript.

Priorytet: **strona podsumowania zgłoszenia** (cena + metoda płatności + dodanie do kalendarza), **karty wyboru pokoju** oraz **kreator eventu z generatorem strony** — to serce produktu.

---

## Wskazówki do iteracji w Claude Design
- Jeśli wynik jest zbyt obszerny na raz: poproś najpierw o **design system + lejek publiczny**, potem osobno o **panel admina**.
- Po pierwszej wersji proś o konkretne poprawki: „pokaż wariant dark mode", „zaprojektuj stan »rejestracja zamknięta«", „dodaj widok drag-and-drop przydziału pokoi".
- Poproś o eksport tokenów (kolory/typografia) — przydadzą się do spójności z resztą Waszych narzędzi.
