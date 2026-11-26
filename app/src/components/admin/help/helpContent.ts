/**
 * Treść zakładki „Pomoc” w panelu administratora.
 *
 * JAK DOPISAĆ INSTRUKCJĘ
 *  1. Znajdź właściwą sekcję w HELP_SECTIONS (albo dodaj nową: { id, title, articles }).
 *  2. Dodaj artykuł: { id, title, blocks }. `id` trafia do adresu (#pomoc/<id>), więc ma być
 *     unikalne w całym pliku, małymi literami, bez polskich znaków i spacji.
 *  3. Bloki artykułu:
 *       { type: 'p', text }                 — akapit
 *       { type: 'steps', items: [...] }     — kroki numerowane
 *       { type: 'list', items: [...] }      — lista punktowana
 *       { type: 'note', tone, text }        — ramka: 'info' | 'warn' | 'err'
 *       { type: 'table', head?, rows }      — tabela dwukolumnowa (np. „objaw → co zrobić”)
 *  4. Fragment w `odwróconych apostrofach` wyświetla się czcionką maszynową (nazwy zmiennych, adresy).
 *  5. Zmień HELP_UPDATED na datę zmiany.
 *
 * Zasada: opisujemy tylko to, co faktycznie działa w systemie. Nazwy przycisków i pól
 * przepisujemy dosłownie z interfejsu, w cudzysłowach „…”.
 */

export const HELP_UPDATED = '2026-11-26'

export type HelpBlock =
  | { type: 'p'; text: string }
  | { type: 'steps'; items: string[] }
  | { type: 'list'; items: string[] }
  | { type: 'note'; tone: 'info' | 'warn' | 'err'; text: string }
  | { type: 'table'; head?: [string, string]; rows: Array<[string, string]> }

export interface HelpArticle {
  id: string
  title: string
  blocks: HelpBlock[]
}

export interface HelpSection {
  id: string
  title: string
  intro?: string
  articles: HelpArticle[]
}

export const HELP_SECTIONS: HelpSection[] = [
  // ────────────────────────────────────────────────────────────────────────────
  {
    id: 'recepcja',
    title: 'Recepcja',
    intro: 'Stanowisko przyjęć gości w dniu wydarzenia — na telefon lub tablet.',
    articles: [
      {
        id: 'recepcja-do-czego',
        title: 'Do czego służy Recepcja',
        blocks: [
          { type: 'p', text: 'Recepcja to osobna, prosta strona do obsługi gości na miejscu. Działa pod adresem `https://rejestracja.icpemission.pl/recepcja` i jest ułożona pod telefon i tablet (jedna kolumna, duże przyciski, motyw jasny i ciemny).' },
          { type: 'list', items: [
            'oznaczanie przyjazdu gości,',
            'przyjmowanie wpłat gotówką lub odnotowanie przelewu,',
            'wydanie i zwrot klucza,',
            'zapisywanie próśb dodatkowych (dieta, dostawka, inne),',
            'szybkie wyszukiwanie zgłoszenia.',
          ] },
          { type: 'p', text: 'Z Recepcji korzystają pomocnicy eventu (osoby z dostępem wyłącznie do wskazanego wydarzenia) oraz administratorzy. Administrator zalogowany w panelu wchodzi do Recepcji bez ponownego logowania i ma w niej wszystkie uprawnienia.' },
          { type: 'note', tone: 'info', text: 'Recepcja pokazuje tylko zgłoszenia aktywne. Nie ma w niej zgłoszeń anulowanych, niedokończonych ani z listy rezerwowej.' },
        ],
      },
      {
        id: 'recepcja-nadanie-dostepu',
        title: 'Jak nadać komuś dostęp do Recepcji',
        blocks: [
          { type: 'steps', items: [
            'Wejdź w „Eventy” i przy właściwym wydarzeniu kliknij „Edytuj”.',
            'Przewiń do sekcji „Pomocnicy (Recepcja)”.',
            'W części „Dodaj pomocnika” wpisz adres e-mail tej osoby.',
            'Zaznacz zakresy dostępu (opis zakresów w następnej instrukcji). Domyślnie zaznaczone są „Obecność”, „Klucze” i „Prośby”.',
            'Opcjonalnie ustaw „Dostęp do dnia” — po tym dniu dostęp wygaśnie sam. Puste pole oznacza dostęp bezterminowy.',
            'Kliknij „Dodaj pomocnika”.',
            'Na ekranie pojawi się ramka „Hasło tymczasowe — widoczne tylko teraz” z loginem i hasłem. Kliknij „Kopiuj hasło” i przekaż je pomocnikowi osobiście lub telefonicznie, potem kliknij „Przekazane, zamknij”.',
          ] },
          { type: 'note', tone: 'warn', text: 'System nie wysyła pomocnikowi żadnego maila. Hasło widać tylko raz — po zamknięciu ramki nie da się go odczytać. Jeśli przepadnie, użyj przycisku „Nowe hasło”.' },
          { type: 'list', items: [
            'Zmiany w sekcji pomocników zapisują się od razu, niezależnie od przycisku „Zapisz zmiany” na dole formularza eventu.',
            'Jeśli ta osoba ma już konto pomocnika z innego wydarzenia, hasło się nie zmienia — system pokaże informację, że loguje się dotychczasowym.',
            'Adresu, który ma konto administratora, nie da się dodać jako pomocnika — administrator ma już pełny dostęp do Recepcji.',
            'Pomocnik nie ustawia hasła samodzielnie i nie może go zmienić. Nowe hasło nadaje wyłącznie administrator.',
          ] },
        ],
      },
      {
        id: 'recepcja-zakresy',
        title: 'Zakresy uprawnień pomocnika',
        blocks: [
          { type: 'table', head: ['Zakres', 'Co daje'], rows: [
            ['Obecność', 'Przyciski „Oznacz przyjazd” i „Cofnij przyjazd”.'],
            ['Wpłaty', 'Pomocnik widzi kwoty (kwota, wpłacono, pozostało, zaległość) i może przyjąć wpłatę przyciskiem „Przyjmij wpłatę”. Bez tego zakresu nie widzi żadnych kwot.'],
            ['Klucze', 'Przyciski „Klucz wydany”, „Klucz zwrócony” oraz cofnięcie wydania lub zwrotu.'],
            ['Prośby', 'Dodawanie próśb dodatkowych i oznaczanie ich jako załatwione.'],
            ['Podgląd listy', 'Tylko odczyt: lista zgłoszeń, osoby, pokój i kontakt do zgłaszającego, bez żadnych akcji.'],
          ] },
          { type: 'p', text: 'Każdy zakres daje podgląd listy zgłoszeń. Pomocnik musi mieć co najmniej jeden zakres. Zakresy zmieniasz jednym kliknięciem w pigułkę przy jego adresie — zmiana działa od razu.' },
          { type: 'p', text: 'Pomocnik widzi tylko: imię, nazwisko, e-mail i telefon zgłaszającego, listę osób (wiek tylko u dzieci, dieta), pokój, stan klucza i prośby. Nie widzi adresu, parafii ani wspólnoty, darowizn, rozbicia ceny ani ustawień eventu.' },
        ],
      },
      {
        id: 'recepcja-odebranie-dostepu',
        title: 'Jak odebrać dostęp lub nadać nowe hasło',
        blocks: [
          { type: 'steps', items: [
            '„Eventy” ▸ „Edytuj” ▸ sekcja „Pomocnicy (Recepcja)”.',
            'Aby zabrać dostęp: kliknij „Odbierz dostęp” przy adresie pomocnika i potwierdź. Dane gości znikają z jego ekranu przy najbliższym odświeżeniu.',
            'Aby nadać nowe hasło: kliknij „Nowe hasło” i potwierdź. Stare hasło przestaje działać, a nowe pojawia się raz na ekranie.',
            'Aby ograniczyć dostęp w czasie: ustaw datę w polu „Dostęp do dnia (opcjonalnie)”. Po jej upływie przy adresie pojawi się napis „dostęp wygasł”.',
          ] },
          { type: 'note', tone: 'info', text: 'Odebranie dostępu dotyczy tylko tego wydarzenia. Jeśli osoba pomaga przy kilku wydarzeniach, odbierz dostęp w każdym z nich osobno.' },
        ],
      },
      {
        id: 'recepcja-logowanie',
        title: 'Logowanie, języki i długość sesji',
        blocks: [
          { type: 'steps', items: [
            'Pomocnik otwiera `https://rejestracja.icpemission.pl/recepcja`.',
            'Wpisuje e-mail i hasło otrzymane od administratora i klika „Zaloguj się”.',
            'Jeśli ma dostęp do jednego wydarzenia, od razu widzi jego listę. Przy kilku wydarzeniach wybiera je z listy „Twoje wydarzenia”.',
          ] },
          { type: 'list', items: [
            'Języki Recepcji: PL, EN, IT — przełącznik w górnym pasku. Wybór jest zapamiętywany na urządzeniu.',
            'Sesja pomocnika trwa 12 godzin. Potem trzeba zalogować się ponownie. Nie ma opcji „Zapamiętaj mnie”.',
            'Wylogowanie: ikona wyjścia w górnym pasku.',
            'Administrator może otworzyć Recepcję wprost z panelu: „Edytuj” ▸ „Pomocnicy (Recepcja)” ▸ „Otwórz recepcję”.',
          ] },
        ],
      },
      {
        id: 'recepcja-ekran',
        title: 'Co widać na ekranie Recepcji',
        blocks: [
          { type: 'p', text: 'U góry są cztery liczniki, pod nimi wyszukiwarka, filtry i lista zgłoszeń. Lista odświeża się sama co 30 sekund; można też kliknąć „Odśwież”.' },
          { type: 'table', head: ['Element', 'Znaczenie'], rows: [
            ['„Przyjechało”', 'Ile zgłoszeń i ile osób jest już oznaczonych jako obecne.'],
            ['„Do zapłaty łącznie”', 'Suma niedopłat i liczba zgłoszeń z niedopłatą. Widoczne tylko z zakresem „Wpłaty”; bez niego w tym miejscu jest licznik „Osoby na miejscu”.'],
            ['„Klucze wydane”', 'Liczba wydanych kluczy i ile z nich jest jeszcze do zwrotu.'],
            ['„Prośby otwarte”', 'Liczba niezałatwionych próśb dodatkowych.'],
          ] },
          { type: 'p', text: 'Wyszukiwarka („Nazwisko, imię, e-mail lub nr zgłoszenia”) szuka też po imionach uczestników i po numerze pokoju. Polskie znaki nie mają znaczenia.' },
          { type: 'p', text: 'Filtry: „Wszyscy”, „Nieobecni”, „Z niedopłatą” (tylko z zakresem „Wpłaty”) i „Z prośbą”. Kliknięcie zgłoszenia rozwija jego kartę z osobami, pokojem, kontaktem i przyciskami akcji.' },
        ],
      },
      {
        id: 'recepcja-obecnosc',
        title: 'Oznaczanie przyjazdu',
        blocks: [
          { type: 'steps', items: [
            'Znajdź zgłoszenie (wyszukiwarka lub filtr „Nieobecni”) i kliknij je.',
            'Kliknij zielony przycisk „Oznacz przyjazd”.',
            'Na karcie pojawi się godzina przyjazdu i adres osoby, która go oznaczyła, a przy nazwisku zielony znaczek.',
          ] },
          { type: 'p', text: 'Pomyłkę poprawia przycisk „Cofnij przyjazd” (z pytaniem o potwierdzenie). Przyjazd dotyczy całego zgłoszenia, czyli wszystkich osób z nim związanych.' },
          { type: 'p', text: 'To samo oznaczenie widać w panelu w zakładce „Obecność”, gdzie administrator także może je przełączać.' },
        ],
      },
      {
        id: 'recepcja-wplaty',
        title: 'Przyjmowanie wpłat w Recepcji',
        blocks: [
          { type: 'steps', items: [
            'Rozwiń kartę zgłoszenia. W części „Rozliczenie” widać: „Kwota”, „Wpłacono”, „Pozostało”, „Do zapłaty teraz” i ewentualną „Zaległość”.',
            'Kliknij „Przyjmij wpłatę”.',
            'Sprawdź kwotę — system podpowiada kwotę wymaganą teraz, a gdy jej nie ma, całą pozostałą.',
            'Wybierz „Gotówka” albo „Przelew”. Możesz dopisać notatkę.',
            'Kliknij zielony przycisk „Przyjmij … (gotówka)” i poczekaj na komunikat „Zapisano wpłatę”.',
          ] },
          { type: 'list', items: [
            'Pomocnik nie może wpisać kwoty większej niż pozostało do zapłaty. Nadpłatę księguje administrator.',
            'Pomocnik nie może cofnąć wpłaty. Błędną wpłatę cofa administrator: w Recepcji przyciskiem „Cofnij” przy wpłacie albo w panelu w „Płatnościach” linkiem „cofnij”.',
            'Ponowne kliknięcie przy słabym internecie nie zdubluje wpłaty.',
            'Wpłata z Recepcji od razu pojawia się w panelu w „Płatnościach”, z adresem osoby, która ją przyjęła.',
          ] },
        ],
      },
      {
        id: 'recepcja-klucze',
        title: 'Wydanie i zwrot klucza',
        blocks: [
          { type: 'steps', items: [
            'Rozwiń kartę zgłoszenia i znajdź część „Klucz”.',
            'Przy wydaniu klucza kliknij „Klucz wydany”. Zapisuje się godzina i osoba wydająca, a na liście pojawia się znaczek „Klucz wydany”.',
            'Przy wyjeździe kliknij „Klucz zwrócony”.',
          ] },
          { type: 'p', text: 'Pomyłki poprawiają przyciski „Cofnij wydanie klucza” i „Cofnij zwrot klucza”. Po zwrocie klucz można wydać jeszcze raz przyciskiem „Klucz wydany ponownie”.' },
          { type: 'note', tone: 'info', text: 'Numer pokoju widoczny w Recepcji pochodzi z zakładki „Zakwaterowanie” w panelu. Przed przyjazdem gości wpisz tam numery lub nazwy pokoi, inaczej Recepcja pokaże „bez przydziału”.' },
        ],
      },
      {
        id: 'recepcja-prosby',
        title: 'Prośby dodatkowe (dieta, dostawka, inne)',
        blocks: [
          { type: 'steps', items: [
            'Rozwiń kartę zgłoszenia i kliknij „Prośba dodatkowa”.',
            'Wybierz rodzaj: „Dieta”, „Dostawka” albo „Inne”.',
            'Opcjonalnie wskaż osobę, której prośba dotyczy (domyślnie „Całe zgłoszenie”).',
            'Opisz prośbę w notatce. Notatka jest wymagana przy „Dieta” i „Inne”.',
            'Kliknij „Zapisz prośbę”.',
          ] },
          { type: 'p', text: 'Prośba ma stan „Otwarta”. Gdy jest załatwiona, kliknij „Oznacz jako załatwioną”; w razie potrzeby „Otwórz ponownie”. Przy każdej prośbie widać, kto i kiedy ją zapisał i załatwił. Filtr „Z prośbą” pokazuje zgłoszenia z otwartymi prośbami.' },
          { type: 'note', tone: 'info', text: 'Wszystkie prośby eventu administrator widzi też w panelu: „Recepcja” ▸ „Prośby dodatkowe” — patrz instrukcja „Prośby i dziennik działań w panelu”.' },
        ],
      },
      {
        id: 'recepcja-czego-nie-moze',
        title: 'Czego pomocnik nie może',
        blocks: [
          { type: 'list', items: [
            'Nie zaloguje się do panelu administratora — jego konto działa wyłącznie w Recepcji.',
            'Nie widzi innych wydarzeń niż te, do których dostał dostęp.',
            'Nie edytuje zgłoszeń, cen, pokoi ani ustawień eventu.',
            'Nie cofa wpłat, nie księguje nadpłat i nie robi zwrotów (zwroty zleca tylko administrator w panelu).',
            'Bez zakresu „Wpłaty” nie widzi żadnych kwot.',
            'Nie dodaje innych pomocników i nie zmienia haseł.',
          ] },
        ],
      },
      {
        id: 'recepcja-dziennik',
        title: 'Prośby i dziennik działań w panelu',
        blocks: [
          { type: 'p', text: 'W panelu administratora jest zakładka „Recepcja” (menu po lewej). Pokazuje, co działo się na stanowisku przyjęć wybranego eventu. Pomocnicy jej nie widzą — to część panelu.' },
          { type: 'p', text: 'Prośby dodatkowe:' },
          { type: 'steps', items: [
            'Wejdź w „Recepcja” i wybierz wydarzenie z listy „Event”.',
            'W zakładce „Prośby dodatkowe” wybierz filtr: „Otwarte”, „Załatwione” albo „Wszystkie” (w nawiasach liczba próśb).',
            'Przy prośbie widać rodzaj (dieta, dostawka, inne), osobę, treść, zgłoszenie z numerem pokoju oraz kto i kiedy ją dodał i załatwił.',
            'Kliknij „Oznacz jako załatwioną”; pomyłkę cofniesz przyciskiem „Otwórz ponownie”. Zmiana jest od razu widoczna w Recepcji.',
          ] },
          { type: 'p', text: 'Dziennik działań:' },
          { type: 'steps', items: [
            'W zakładce „Dziennik działań” widać wpisy od najnowszych: kiedy, kto, co zrobił i przy którym zgłoszeniu.',
            'Zawęź listę polami „Osoba” (adres e-mail pomocnika lub administratora) i „Akcja” (np. „Przyjazd”, „Wydanie klucza”, „Przyjęcie wpłaty”).',
            'Gdy wpisów jest więcej niż 50, przechodź strzałkami na dole („Strona 1 z …”).',
          ] },
          { type: 'list', items: [
            'Dziennik zapisuje: przyjazd i jego cofnięcie, wydanie i zwrot klucza (oraz cofnięcia), przyjęcie i cofnięcie wpłaty w Recepcji (z kwotą i metodą), dodanie prośby, załatwienie i ponowne otwarcie prośby.',
            'Dziennika nie da się edytować. Wpłat wpisanych w „Płatnościach” w nim nie ma — tam autora widać przy każdej wpłacie.',
            'Link „Otwórz Recepcję tego eventu” prowadzi do stanowiska przyjęć (`/recepcja`).',
            'W sekcji „Pomocnicy (Recepcja)” w edycji eventu widać, kto i kiedy dodał pomocnika.',
          ] },
        ],
      },
      {
        id: 'recepcja-dzien-przyjazdu',
        title: 'Dzień przyjazdu — krok po kroku',
        blocks: [
          { type: 'p', text: 'Kilka dni wcześniej:' },
          { type: 'steps', items: [
            'W „Zakwaterowanie” wpisz numery lub nazwy pokoi przy zgłoszeniach i kliknij „Zapisz” przy każdym gościu.',
            'W „Płatności” sprawdź kafle „Wymagalne teraz” i „Po terminie”, żeby wiedzieć, kto dopłaca na miejscu.',
            'W „Edytuj” ▸ „Pomocnicy (Recepcja)” dodaj pomocników, ustaw im zakresy i „Dostęp do dnia” na ostatni dzień wydarzenia. Przekaż hasła.',
            'Poproś każdego pomocnika o próbne logowanie na jego telefonie.',
          ] },
          { type: 'p', text: 'W dniu przyjazdu, przy każdym gościu:' },
          { type: 'steps', items: [
            'Wyszukaj zgłoszenie po nazwisku.',
            'Kliknij „Oznacz przyjazd”.',
            'Jeśli jest niedopłata (znaczek „Do zapłaty” przy nazwisku): „Przyjmij wpłatę”, wybierz gotówkę lub przelew, zatwierdź.',
            'Podaj numer pokoju i kliknij „Klucz wydany”.',
            'Zapytaj o dodatkowe potrzeby i w razie czego dodaj „Prośbę dodatkową”.',
          ] },
          { type: 'p', text: 'Na koniec dnia i przy wyjeździe:' },
          { type: 'steps', items: [
            'Filtr „Nieobecni” pokaże, kto nie dojechał.',
            'Filtr „Z prośbą” pokaże, co zostało do załatwienia. To samo zobaczysz w panelu: „Recepcja” ▸ „Prośby dodatkowe” ▸ „Otwarte”.',
            'Przy wyjeździe klikaj „Klucz zwrócony”. Licznik „Klucze wydane” pokazuje, ile kluczy jest jeszcze do zwrotu.',
            'Po wydarzeniu odbierz dostęp pomocnikom, którzy nie mieli ustawionej daty wygaśnięcia.',
          ] },
          { type: 'note', tone: 'warn', text: 'Recepcja wymaga internetu. Bez połączenia pokaże żółty baner i dane z ostatniego odświeżenia, a zmiany nie zapiszą się, dopóki połączenie nie wróci. Sprawdź wcześniej zasięg w miejscu przyjęć.' },
        ],
      },
    ],
  },

  // ────────────────────────────────────────────────────────────────────────────
  {
    id: 'eventy',
    title: 'Eventy',
    intro: 'Tworzenie wydarzenia i wszystkie jego ustawienia.',
    articles: [
      {
        id: 'eventy-nowy',
        title: 'Nowy event — kreator',
        blocks: [
          { type: 'steps', items: [
            '„Eventy” ▸ „+ Nowy event”.',
            'Krok „Typ”: wybierz rodzaj wydarzenia (opis typów w następnej instrukcji).',
            'Krok „Szczegóły”: nazwa, opis, daty, „Otwarcie zapisów”, liczba nocy, miejsce, „Pojemność (max osób)”, program, goście specjalni i metody płatności. Tu jest też przełącznik „Ukryty event”.',
            'Krok „Pokoje”: typy zakwaterowania z ceną, pojemnością i liczbą pokoi. Zaznaczenie „Bez noclegu” w poprzednim kroku pomija ten krok.',
            'Krok „Cennik”: waluta, opłata formacyjna, wyżywienie, zniżki wiekowe, transport, pościel, kody rabatowe, harmonogram wpłat.',
            'Krok „Strona”: adres strony (tworzy się z nazwy, można wpisać własny), nadtytuł, zdjęcie, kolory, „Języki strony”.',
            'Kliknij „Publikuj stronę”. System pokaże adres strony zapisów.',
          ] },
          { type: 'list', items: [
            'Puste pole kwoty oznacza 0 zł — zapisuje się dokładnie to, co wpiszesz.',
            'Lista kodów rabatowych w nowym evencie jest pusta. Progi wiekowe są wstępnie wypełnione — sprawdź je i popraw lub usuń.',
            'Pasek kroków u góry jest klikalny: można wrócić do dowolnego kroku.',
            'Treści wpisujesz po polsku, a potem przełączasz „Język treści” i dodajesz tłumaczenia.',
          ] },
        ],
      },
      {
        id: 'eventy-typy',
        title: 'Typy eventów',
        blocks: [
          { type: 'table', head: ['Typ', 'Kiedy wybrać'], rows: [
            ['Event jednorazowy', 'Konkretna data, jedna edycja. Zwykły formularz zapisu z ceną, pokojami i płatnością.'],
            ['Standalone (bez noclegu)', 'Bezpłatne spotkanie z prostym potwierdzeniem „Będę / Nie będę”.'],
            ['Na zaproszenie', 'Imienne zaproszenia z osobistym linkiem. Gości wpisujesz w kreatorze (jedna osoba na wiersz) albo później w „Edytuj” ▸ „Zaproszeni goście”.'],
            ['Event cykliczny (evergreen)', 'Na razie działa jak „Event jednorazowy”: jeden termin, nic się samo nie powtarza. Różni się tylko etykietą i filtrem „Cykliczne” na liście. Patrz „Event cykliczny (evergreen) — stan obecny”.'],
          ] },
        ],
      },
      {
        id: 'eventy-cykliczny',
        title: 'Event cykliczny (evergreen) — stan obecny',
        blocks: [
          { type: 'note', tone: 'warn', text: 'Cykliczność nie jest jeszcze wdrożona. Event utworzony jako „Event cykliczny (evergreen)” działa dokładnie tak samo jak „Event jednorazowy”: ma jeden termin i nic się samo nie powtarza.' },
          { type: 'list', items: [
            'Jedyna różnica to etykieta: na liście eventów trafia pod filtr „Cykliczne”.',
            'System nie tworzy kolejnych terminów, nie zamyka zapisów na miniony termin i nie otwiera następnego.',
            'W kreatorze nie ma ustawień harmonogramu (dni tygodnia, częstotliwość) — niczego takiego system nie zapisuje.',
            'Panel nie ma przycisku do skopiowania eventu na kolejny termin.',
          ] },
          { type: 'p', text: 'Jeżeli wydarzenie się powtarza, na razie utwórz dla każdego terminu osobny „Event jednorazowy” z własnym adresem strony (np. z miesiącem w adresie). Gości specjalnych i miejsce wstawisz szybko z „Biblioteki”.' },
          { type: 'p', text: 'Wdrożenie cykliczności wymaga kilku decyzji organizatora (m.in. czy zapisy są na jeden najbliższy termin, czy na kilka naraz, i co robić z terminami rat oraz poziomami cen). Do tego czasu nie wybieraj tego typu dla prawdziwych zapisów.' },
        ],
      },
      {
        id: 'eventy-edycja',
        title: 'Edycja eventu',
        blocks: [
          { type: 'steps', items: [
            '„Eventy” ▸ przy wydarzeniu kliknij „Edytuj”.',
            'Zmień potrzebne pola. Formularz ma sekcje: „Szczegóły”, „Metody płatności”, „Cennik”, „Strona”, „Widoczność”, „ICPE Go”, „Goście z zaproszeniem”, „Pomocnicy (Recepcja)”, „Formularz zapisu”, „Program i goście specjalni”, „Dane do przelewu”.',
            'Kliknij „Zapisz zmiany” na dole. Po zapisie pojawi się potwierdzenie z linkiem „Otwórz stronę”.',
          ] },
          { type: 'list', items: [
            'Obok formularza jest podgląd ekranów gościa na żywo.',
            'Sekcja „Pomocnicy (Recepcja)” zapisuje się sama, od razu. Pozostałe sekcje dopiero po „Zapisz zmiany”.',
            'Na liście eventów: „Zamknij” wyłącza zapisy (z pytaniem o potwierdzenie), „Otwórz ponownie” przywraca je, „Otwórz” pokazuje stronę zapisów. Zamknięty event można schować przyciskiem „Archiwizuj” — patrz „Archiwizacja eventu”.',
          ] },
        ],
      },
      {
        id: 'eventy-archiwizacja',
        title: 'Archiwizacja eventu',
        blocks: [
          { type: 'p', text: 'Archiwum służy do sprzątania listy eventów: stare i testowe wydarzenia znikają z widoku, ale nic nie jest usuwane.' },
          { type: 'steps', items: [
            '„Eventy” ▸ jeśli event jest otwarty, najpierw kliknij „Zamknij”.',
            'Przy zamkniętym evencie kliknij „Archiwizuj” i potwierdź w oknie.',
            'Event znika z listy. Żeby go zobaczyć, zaznacz „Pokaż zarchiwizowane” nad listą — ma wtedy status „Zarchiwizowany”.',
            'Cofnięcie: „Pokaż zarchiwizowane” ▸ „Przywróć z archiwum”. Event wraca jako zamknięty; zapisy włączysz przyciskiem „Otwórz ponownie”.',
          ] },
          { type: 'list', items: [
            'Zgłoszenia, wpłaty i ustawienia zostają. „Zgłoszenia”, „Płatności” i „Recepcja” w panelu nadal mają event na liście wyboru, z dopiskiem ARCHIWUM.',
            'Zarchiwizowany event znika z listy eventów w Recepcji (`/recepcja`) — u administratora i u pomocników.',
            'Strona eventu pod linkiem `/r/…` pokazuje „zapisy zamknięte”, tak jak przy zamkniętym evencie. Strony zgłoszeń gości (`/z/…`) działają dalej.',
            'Przypomnienia o ratach i o niedokończonych zgłoszeniach dotyczą tylko eventów otwartych — zamknięcie i archiwizacja je wyłączają.',
            'Otwartego eventu nie da się zarchiwizować: system poprosi, żeby najpierw go zamknąć.',
          ] },
          { type: 'note', tone: 'info', text: 'Personal OS i ICPE Go widzą zarchiwizowany event tak samo jak zamknięty — archiwizacja niczego tam nie zmienia.' },
        ],
      },
      {
        id: 'eventy-naglowki-gosci',
        title: 'Nagłówki nad gośćmi specjalnymi (np. Wykładowcy, Paneliści)',
        blocks: [
          { type: 'p', text: 'Każdy gość specjalny może mieć własny nagłówek, pod którym pokaże się na stronie wydarzenia. Goście z tym samym nagłówkiem tworzą jedną grupę.' },
          { type: 'table', head: ['Wybór w polu „Nagłówek na stronie:”', 'Co zobaczy gość'], rows: [
            ['„Goście specjalni (domyślny)”', '„Gość specjalny” albo „Goście specjalni” — jak dotychczas.'],
            ['„Wykładowcy (Guest Speakers)”', 'Po polsku „Wykładowca” / „Wykładowcy”, po angielsku „Guest Speaker” / „Guest Speakers”.'],
            ['„Paneliści (Panelists)”', 'Po polsku „Panelista” / „Paneliści”, po angielsku „Panelist” / „Panelists”.'],
            ['„Własny nagłówek…”', 'Tekst, który wpiszesz w polu obok.'],
          ] },
          { type: 'steps', items: [
            '„Eventy” ▸ „Edytuj” ▸ sekcja „Program i goście specjalni” (w kreatorze: krok „Szczegóły”).',
            'Przy gościu wybierz wariant w polu „Nagłówek na stronie:”.',
            'Dla „Własny nagłówek…” wpisz tekst w polu obok. Potem przełącz „Język treści” i wpisz tłumaczenie dla każdego języka strony.',
            'Kliknij „Zapisz zmiany” na dole formularza.',
          ] },
          { type: 'p', text: 'Dwie grupy, np. „Guest Speakers” i niżej „Panelists”: ustaw wykładowcom „Wykładowcy (Guest Speakers)”, a panelistom „Paneliści (Panelists)”. Grupy pojawią się na stronie w takiej kolejności, w jakiej ich pierwszy gość stoi na liście — kolejność zmienisz strzałkami „W górę” / „W dół”.' },
          { type: 'list', items: [
            'Nowo dodany gość dostaje taki sam nagłówek jak ostatni gość na liście.',
            '„Zastosuj do gości poniżej” ustawia ten sam nagłówek wszystkim gościom poniżej.',
            'Liczba pojedyncza albo mnoga gotowych nagłówków dobiera się sama: mnoga, gdy w grupie jest kilka wpisów albo wpis ma zaznaczone „Para / kilka osób w jednym wpisie”.',
            'Własny nagłówek pokazuje się dokładnie tak, jak go wpiszesz. Bez tłumaczenia na język strony pokaże się wersja angielska, a gdy jej brak — polska.',
            'Poprawka tekstu własnego nagłówka u jednego gościa zmienia go u wszystkich gości z tym samym nagłówkiem.',
            'Własny nagłówek bez wpisanego tekstu działa jak domyślny „Goście specjalni”.',
            'Nagłówek jest ustawieniem eventu. Biblioteka gości go nie przechowuje — po wstawieniu gościa z Biblioteki ustaw go w evencie.',
            'Efekt widać od razu w podglądzie obok formularza („Strona”).',
          ] },
        ],
      },
      {
        id: 'eventy-jezyki',
        title: 'Języki strony i tłumaczenia',
        blocks: [
          { type: 'p', text: 'Polski i angielski są zawsze dostępne dla gości. Włoski (IT), koreański (KO) i chiński uproszczony (ZH) włączasz w „Strona” ▸ „Języki strony”.' },
          { type: 'steps', items: [
            'Wpisz wszystkie treści po polsku.',
            'U góry formularza, w pasku „Język treści”, kliknij EN (potem kolejne języki).',
            'Przetłumacz nazwę, opis, nadtytuł, miejsce, program i opisy gości. Polski oryginał widać w podpowiedzi pola.',
            'Zapisz zmiany.',
          ] },
          { type: 'p', text: 'Pod paskiem języków system wypisuje, czego jeszcze brakuje w danym języku. Nieprzetłumaczone pola goście zobaczą po angielsku, a gdy brak wersji angielskiej — po polsku. Godziny programu są wspólne dla wszystkich języków.' },
        ],
      },
      {
        id: 'eventy-otwarcie-zapisow',
        title: 'Data otwarcia zapisów i licznik',
        blocks: [
          { type: 'steps', items: [
            'W kreatorze (krok „Szczegóły”) albo w „Edytuj” ▸ „Szczegóły” znajdź „Otwarcie zapisów”.',
            'Ustaw datę i godzinę. Godzina jest liczona według czasu na Twoim komputerze.',
            'Zapisz.',
          ] },
          { type: 'p', text: 'Do tej chwili strona wydarzenia jest widoczna, ale zamiast przycisku zapisu pokazuje licznik do startu, a zapisy są zablokowane. Gdy licznik dojdzie do zera, sam zamieni się w przycisk „Zapisz się”.' },
          { type: 'list', items: [
            'Puste pole albo data, która już minęła, oznacza zapisy otwarte od razu. Przycisk „otwórz od razu” czyści datę.',
            'Blokada dotyczy zwykłej rejestracji, nie zaproszeń imiennych.',
            'Podgląd w panelu nie jest blokowany przez datę otwarcia.',
          ] },
        ],
      },
      {
        id: 'eventy-lista-oczekujacych',
        title: 'Lista oczekujących na otwarcie zapisów',
        blocks: [
          { type: 'p', text: 'Gdy zapisy jeszcze nie ruszyły, pod licznikiem jest formularz, w którym gość zostawia e-mail. W chwili otwarcia zapisów każdy z listy dostaje jeden mail z przyciskiem „Zapisz się”.' },
          { type: 'steps', items: [
            'Otwórz „Edytuj” ▸ „Szczegóły”.',
            'Pod datą otwarcia zapisów zobaczysz „Lista oczekujących: … adresów” oraz liczbę już powiadomionych.',
            'Link „kopiuj adresy” kopiuje adresy do schowka.',
          ] },
          { type: 'note', tone: 'info', text: 'To inna rzecz niż znaczek „Lista oczekujących” przy zgłoszeniu w zakładce „Zgłoszenia” — tamten oznacza zgłoszenie na liście rezerwowej.' },
        ],
      },
      {
        id: 'eventy-ukryty',
        title: 'Ukryty event',
        blocks: [
          { type: 'steps', items: [
            '„Edytuj” ▸ sekcja „Widoczność”.',
            'Zaznacz „Ukryty event (dostępny tylko przez link, niewidoczny na stronie głównej)”.',
            'Kliknij „Zapisz zmiany”. Na liście eventów pojawi się znaczek „UKRYTY”.',
          ] },
          { type: 'p', text: 'Ukryty event działa normalnie pod swoim adresem `/r/…`: zapisy, płatności, maile, strona zgłoszenia i Recepcja. Nie ma go na stronie głównej rejestracji, na icpemission.pl ani na liście ICPE Go, a jego strona prosi wyszukiwarki, żeby jej nie pokazywały. Ten sam przełącznik jest w kreatorze, w kroku „Szczegóły”.' },
          { type: 'note', tone: 'warn', text: 'Ukryty event nie jest chroniony hasłem. Każdy, kto zna link, wejdzie i może się zapisać.' },
        ],
      },
      {
        id: 'eventy-limity',
        title: 'Limit miejsc i limity pokoi',
        blocks: [
          { type: 'list', items: [
            'Limit osób na całe wydarzenie: „Edytuj” ▸ „Szczegóły” ▸ „Limit miejsc (puste = bez limitu)”. W kreatorze to pole „Pojemność (max osób)”.',
            'Limit pokoi danego typu: w „Cennik” ▸ „Pokoje” wpisz liczbę pokoi. Puste pole oznacza brak limitu.',
            'Rezerwa dla gości specjalnych: pole „w tym dla gości specjalnych”. Te pokoje nie są dostępne w zapisie publicznym.',
            'Pod każdym typem pokoju widać, ile jest zajętych i ile wolnych w zapisach.',
          ] },
          { type: 'p', text: 'Pokój z rezerwy przydziela administrator: „Zgłoszenia” ▸ zgłoszenie ▸ „Edytuj zgłoszenie” ▸ zaznacz „Pokoje z rezerwy dla gości specjalnych”. Limit nie blokuje zapisu wykonywanego przez administratora.' },
          { type: 'p', text: 'Każdy typ pokoju ma: nazwę, pojemność, cenę i sposób liczenia — za osobę za noc (każdy płaci tyle za noc) albo za pokój za noc (stała kwota niezależnie od liczby osób).' },
          { type: 'p', text: 'Gdy dwie osoby wysyłają zgłoszenie na ostatni pokój danego typu w tej samej chwili, pokój dostaje pierwsza. Druga widzi komunikat z nazwą pokoju, wybiera inny typ i wysyła zgłoszenie ponownie — jej dane zostają w formularzu. Tak samo działa zmiana noclegu przez gościa na stronie zgłoszenia.' },
          { type: 'p', text: 'Uwaga: „Limit miejsc” na całe wydarzenie jest tylko informacją. Strona eventu pokazuje licznik wolnych miejsc, ale po jego wyczerpaniu zapisy NIE zamykają się same i nie ma automatycznej listy rezerwowej. Aby wstrzymać zapisy, kliknij „Zamknij” przy evencie na liście „Eventy”. Zapis blokują tylko limity pokoi i dodatków.' },
        ],
      },
      {
        id: 'eventy-poziomy-cen',
        title: 'Poziomy cen z datami',
        blocks: [
          { type: 'p', text: 'Ceny wpisane w cenniku to pierwszy poziom (np. Early bird). Kolejne poziomy zaczynają obowiązywać od wskazanego dnia według czasu polskiego.' },
          { type: 'steps', items: [
            '„Edytuj” ▸ „Cennik” ▸ blok „Poziomy cen z datami”.',
            'Wpisz „Nazwa pierwszego poziomu” (np. Early bird).',
            'Dodaj kolejny poziom: nazwa, data „od dnia” i tylko te ceny, które się zmieniają — wyżywienie, opłata formacyjna, cena każdego typu zakwaterowania. Puste pole oznacza cenę bez zmiany.',
            'Kliknij „Zapisz zmiany”.',
          ] },
          { type: 'list', items: [
            'Cena zależy od dnia zgłoszenia. Kto zapisał się wcześniej, zachowuje swoją cenę — także gdy później administrator edytuje zgłoszenie albo gość zmieni nocleg.',
            'Na stronie wydarzenia pojawia się blok „Ceny” z poziomami i wyróżnionym aktualnym.',
            'Dwa poziomy nie mogą zaczynać się tego samego dnia, a każdy musi mieć datę.',
          ] },
        ],
      },
      {
        id: 'eventy-znizki-wiekowe',
        title: 'Zniżki wiekowe (dzieci)',
        blocks: [
          { type: 'steps', items: [
            '„Edytuj” ▸ „Cennik” ▸ „Zniżki wiekowe (dzieci)”.',
            'Kliknij „Dodaj próg” i wpisz wiek „do” — wyłącznie, czyli 4 oznacza dzieci w wieku 0–3 lata.',
            'Wpisz zniżkę w procentach osobno na nocleg, opłatę formacyjną i wyżywienie. Zamiast procentu na wyżywienie można podać stałą kwotę w złotych.',
            'Zapisz zmiany.',
          ] },
          { type: 'list', items: [
            'Pokój liczony „za pokój” kosztuje tyle samo bez względu na wiek.',
            'Zniżka kwotowa na wyżywienie jest stała przy każdym poziomie cen.',
            'Puste pola „formacja” i „wyżywienie” oznaczają: opłata formacyjna pełna, wyżywienie ze zniżką taką jak nocleg.',
          ] },
        ],
      },
      {
        id: 'eventy-kody-rabatowe',
        title: 'Kody rabatowe',
        blocks: [
          { type: 'steps', items: [
            '„Edytuj” ▸ „Cennik” ▸ „Kody rabatowe” ▸ „Dodaj kod”.',
            'Wpisz kod i procent zniżki.',
            'Zapisz zmiany.',
          ] },
          { type: 'p', text: 'Pole „Kod rabatowy” pojawia się w formularzu gościa tylko wtedy, gdy wydarzenie ma co najmniej jeden kod. Kod usuwasz ikoną kosza.' },
          { type: 'note', tone: 'warn', text: 'Kody rabatowe nie są dziś tajne technicznie: formularz sprawdza kod w przeglądarce gościa, więc osoba znająca się na rzeczy może je odczytać. Nie traktuj kodu jako zabezpieczenia; dużą, indywidualną zniżkę nadaj raczej ręcznie w „Edytuj zgłoszenie”.' },
        ],
      },
      {
        id: 'eventy-darowizna',
        title: 'Darowizna na dofinansowanie pobytu innych',
        blocks: [
          { type: 'p', text: 'Włącznik darowizny jest w „Edytuj” ▸ „Cennik” (oraz w kreatorze). Po włączeniu gość w kroku „Opcje” może dodać 50, 100 lub 200 zł (w EUR i USD: 10, 25, 50) albo dowolną kwotę.' },
          { type: 'list', items: [
            'Darowizna dolicza się do kwoty zgłoszenia i nie podlega rabatom ani kodom.',
            'Kwotę darowizny przy konkretnym zgłoszeniu można zmienić w „Edytuj zgłoszenie” (puste pole usuwa darowiznę).',
            'Sumę darowizn pokazuje kafel „Pula darowizn” w „Płatnościach”.',
            'Opcja jest widoczna tylko przy wydarzeniu płatnym.',
          ] },
        ],
      },
      {
        id: 'eventy-diety',
        title: 'Diety do wyboru w formularzu',
        blocks: [
          { type: 'p', text: 'Diety włączasz w „Edytuj” ▸ „Formularz zapisu” ▸ „Diety do wyboru (krok „Preferencje”)”. Domyślnie żadna nie jest włączona — gość widzi wtedy tylko pole na alergie.' },
          { type: 'table', head: ['Nazwa w panelu i formularzu', 'Nazwa w ośrodku'], rows: [
            ['„Bez mięsa”', 'wegetariańska'],
            ['„Wegańska”', 'wegańska'],
            ['„Bez glutenu”', 'bezglutenowa'],
            ['„Bez mleka”', 'bezmleczna'],
            ['„Bez orzechów”', 'bez orzechów'],
            ['„Koszerna”', 'koszerna'],
          ] },
          { type: 'list', items: [
            'Gość zaznacza diety osobno dla każdego uczestnika; alergie opisuje w polu tekstowym.',
            'Dieta bezmleczna nazywa się „Bez mleka” (od 26.11.2026; wcześniej „Bez laktozy”). To nie to samo: osoba z alergią na białko mleka nie może jeść produktów bez laktozy.',
            'Starsze zgłoszenia z zapisem „Bez laktozy” liczą się do diety „Bez mleka” i tak są pokazywane w panelu, na Recepcji i w eksporcie. Niczego nie trzeba poprawiać ręcznie.',
            'Włącz tylko te diety, które ośrodek faktycznie przygotowuje.',
          ] },
        ],
      },
      {
        id: 'eventy-dodatki',
        title: 'Dodatki z limitem (dostawka, łóżeczko turystyczne)',
        blocks: [
          { type: 'p', text: 'Dodatek z limitem to coś, czego w ośrodku jest ograniczona liczba sztuk. Gość zaznacza go w kroku „Opcje”, widzi „Zostało: X”, a po wyczerpaniu limitu opcja jest nieaktywna z napisem „Brak dostępnych”. Realizowane są tylko pierwsze zamówienia — nie ma listy rezerwowej dodatków.' },
          { type: 'steps', items: [
            '„Eventy” ▸ „Edytuj” przy wydarzeniu ▸ sekcja „Cennik” ▸ „Dodatki z limitem”.',
            'Kliknij szablon: „Dostawka (dodatkowe łóżko)” albo „Łóżeczko turystyczne dla niemowlęcia”. Nazwa i opis wstawiają się od razu w PL, EN, IT, KO i ZH. Własny dodatek: „Własny dodatek”.',
            'Sprawdź pola: „Limit sztuk w evencie”, „Maks. na zgłoszenie”, „Cena za sztukę” (puste = bezpłatnie), „Tylko gdy jest dziecko poniżej (lat)” (puste = zawsze widoczny).',
            'Kliknij „Zapisz zmiany” na dole formularza.',
          ] },
          { type: 'table', head: ['Szablon', 'Ustawienia'], rows: [
            ['„Dostawka (dodatkowe łóżko)”', 'Limit 8, 1 na zgłoszenie, bezpłatnie. Opis mówi, że dostawki są tylko w pokojach hotelowych, więc zamówienie jest prośbą — organizator potwierdza po przydziale pokoi.'],
            ['„Łóżeczko turystyczne dla niemowlęcia”', 'Limit 5, do 2 na zgłoszenie, bezpłatnie, widoczne tylko gdy w zgłoszeniu jest dziecko poniżej 3 lat.'],
          ] },
          { type: 'list', items: [
            'Sztuki zajmują zgłoszenia aktywne. Anulowanie zgłoszenia zwalnia je od razu; lista rezerwowa ich nie zajmuje.',
            'Gdy dwie osoby wysyłają zgłoszenie w tej samej chwili, ostatnią sztukę dostaje pierwsza. Druga widzi komunikat z nazwą dodatku, odznacza go i wysyła zgłoszenie ponownie — jej dane zostają w formularzu.',
            'Zamówienia i kolejność: „Zgłoszenia” ▸ „Diety i dodatki” ▸ tabela „Dodatki z limitem”.',
            'Dodatek przy zgłoszeniu zmienisz w „Edytuj zgłoszenie” ▸ „Dodatki z limitem”. Przy wyczerpanym limicie panel pyta, czy zapisać „mimo limitu”.',
            'Gość widzi zamówione dodatki w mailu z potwierdzeniem i na swojej stronie zgłoszenia, ale sam ich tam nie zmienia. Pomocnik widzi je na karcie zgłoszenia w Recepcji (tylko odczyt).',
            'Cena dodatku (jeśli ją wpiszesz) dolicza się do „Opcji dodatkowych” i podlega kodom rabatowym tak jak transport.',
            'Zmniejszenie limitu poniżej liczby zamówień niczego nie anuluje — po prostu nikt więcej nie zamówi.',
          ] },
          { type: 'note', tone: 'warn', text: 'Zmiana statusu z listy rezerwowej na aktywny nie sprawdza limitu dodatków. Po takiej zmianie zajrzyj do tabeli „Dodatki z limitem” — przekroczenie jest oznaczone na czerwono.' },
        ],
      },
      {
        id: 'eventy-historia-cennika',
        title: 'Historia zmian cennika i przywracanie',
        blocks: [
          { type: 'p', text: 'Przy każdym zapisie, który zmienia ustawienia wydarzenia, system zachowuje stan sprzed zapisu: cennik, kluczowe pola wydarzenia i ustawienia strony. Trzymane jest 20 ostatnich wersji na wydarzenie.' },
          { type: 'steps', items: [
            '„Eventy” ▸ „Edytuj” ▸ na dole formularza rozwiń „Historia zmian cennika”.',
            'Przy każdej wersji widać: kiedy, kto zapisał, z jakiej wersji panelu i krótki opis cennika (liczba pokoi, poziomów cen, dodatków). „szczegóły” pokazuje pełny zapis.',
            'Kliknij „Przywróć” i potwierdź. Formularz wczyta się od nowa.',
          ] },
          { type: 'list', items: [
            '„Przywróć” podmienia cały cennik: ceny, pokoje, poziomy cen, zniżki wiekowe, harmonogram wpłat, dodatki i kody rabatowe. Nazwa, daty, strona i dane przelewu zostają bez zmian.',
            'Stan sprzed przywrócenia też trafia do historii, więc przywrócenie można cofnąć.',
            'Ceny już złożonych zgłoszeń się nie zmieniają.',
            'Historia zbiera się od 26.11.2026 — wcześniejszych zmian w niej nie ma.',
          ] },
        ],
      },
      {
        id: 'eventy-dane-przelewu',
        title: 'Dane do przelewu',
        blocks: [
          { type: 'steps', items: [
            '„Edytuj” ▸ sekcja „Dane do przelewu”.',
            'Wypełnij „Odbiorca” i „Numer konta (IBAN)”.',
            'Dla gości z zagranicy wypełnij „SWIFT / BIC (przelewy z zagranicy)”, „Bank” i „Adres banku”.',
            'Opcjonalnie wypełnij „Podmiot obsługujący wydarzenie”.',
            'Kliknij „Zapisz zmiany”.',
          ] },
          { type: 'list', items: [
            'SWIFT, bank i adres banku widać tylko w wersjach obcojęzycznych strony (EN, IT, KO, ZH) i tylko te pola, które wypełnisz.',
            'Wypełnione pole o podmiocie dodaje pod danymi przelewu zdanie „Podmiot obsługujący wydarzenie za zgodą Executive Council: …” we wszystkich językach. Puste pole oznacza brak zdania.',
            'Tytuł przelewu (numer zgłoszenia) tworzy się automatycznie.',
            'Te same dane trafiają do maili przypominających o ratach.',
          ] },
        ],
      },
      {
        id: 'eventy-icpe-go',
        title: 'ICPE Go',
        blocks: [
          { type: 'p', text: 'W „Edytuj” ▸ sekcja „ICPE Go” jest przełącznik „Udostępniaj dane ICPE Go”. Po włączeniu aplikacja ICPE Go pobiera: nazwę i daty wydarzenia, miejsce, kraj, liczbę zgłoszeń (dorośli i dzieci), procent zajętych miejsc (gdy ustawiono „Limit miejsc”) i link do rejestracji. Bez imion, e-maili i płatności.' },
          { type: 'list', items: [
            'Zmiana działa po kliknięciu „Zapisz zmiany”.',
            'W tej samej sekcji jest „Adres dla ICPE Go”.',
            'Kraj wydarzenia ustawiasz w „Szczegóły” ▸ „Kraj” — jeden dla wszystkich wersji językowych.',
            'Ukryty event nie pojawia się na liście ICPE Go.',
          ] },
        ],
      },
    ],
  },

  // ────────────────────────────────────────────────────────────────────────────
  {
    id: 'zgloszenia',
    title: 'Zgłoszenia',
    articles: [
      {
        id: 'zgloszenia-lista',
        title: 'Lista zgłoszeń i szczegóły',
        blocks: [
          { type: 'steps', items: [
            'Wejdź w „Zgłoszenia” i wybierz wydarzenie z listy u góry.',
            'Szukaj w polu „Szukaj zgłoszeń...” albo zawęź zakładkami: „Wszystkie”, „Opłacone”, „Oczekujące”, „W toku”, „Anulowane”.',
            'Kliknij wiersz, żeby otworzyć szczegóły: kontakt, osoby, pokój, kwota i suma wpłat, link do strony gościa i historia zgłoszenia.',
          ] },
          { type: 'p', text: 'Lista ma kolumny „Zgłaszający”, „Osoby”, „Pokój”, „Kwota” i „Płatność”. Przycisk „Odśwież” wczytuje ją ponownie. Anulowane zgłoszenia są wyszarzone, mają znacznik „Anulowane” i własną zakładkę; w zakładkach „Opłacone”, „Oczekujące” i „W toku” ich nie ma.' },
          { type: 'p', text: 'Przyciski w szczegółach zgłoszenia:' },
          { type: 'table', head: ['Przycisk', 'Co robi'], rows: [
            ['„Edytuj zgłoszenie”', 'Otwiera formularz edycji (dane, uczestnicy, pokoje, opcje, cena).'],
            ['„Oznacz opłacone”', 'Księguje brakującą resztę i potwierdza zgłoszenie.'],
            ['„Zmień pokoje”', 'Otwiera edycję zgłoszenia od razu na sekcji „Pokoje” (typ pokoju i kto w którym). Przycisk jest tylko przy eventach z pokojami. Numer pokoju wpisujesz w zakładce „Zakwaterowanie”.'],
            ['„Napisz e-mail”', 'Otwiera Twój program pocztowy z adresem gościa. Panel sam niczego nie wysyła.'],
            ['„Anuluj zgłoszenie”', 'Otwiera okno potwierdzenia — patrz „Anulowanie i przywracanie zgłoszenia”.'],
          ] },
          { type: 'p', text: 'Blok „Rozpoczęte, niedokończone” pokazuje osoby, które podały imię i e-mail, ale nie wysłały zgłoszenia. Każda dostaje jedno przypomnienie z linkiem do formularza 3 godziny po ostatniej aktywności (tylko gdy zapisy są otwarte i są miejsca). Gdy gość poprawi e-mail w trakcie wypełniania, wpis zmienia adres zamiast się dublować, a wysłanie zgłoszenia zamyka wszystkie wpisy z tej samej przeglądarki.' },
        ],
      },
      {
        id: 'zgloszenia-eksport',
        title: 'Eksport zgłoszeń do pliku (CSV)',
        blocks: [
          { type: 'steps', items: [
            '„Zgłoszenia” ▸ wybierz wydarzenie.',
            'Wszystkie z bieżącego widoku: ustaw zakładkę i wyszukiwanie, potem kliknij „Eksport CSV (liczba)” po prawej stronie paska filtrów.',
            'Tylko wybrane: zaznacz zgłoszenia polami wyboru i kliknij „Eksport CSV” w pasku zaznaczenia.',
            'Plik `zgloszenia-<event>-<data>.csv` zapisuje się w folderze pobranych. Otwórz go w Excelu — polskie znaki i kolumny układają się same.',
          ] },
          { type: 'p', text: 'Kolumny pliku: numer zgłoszenia, data, status, płatność, imię, nazwisko, e-mail, telefon, kraj, język, adres, parafia, wspólnota, liczba osób, uczestnicy (imię i nazwisko, wiek, typ), diety uczestników, pokoje, numer pokoju, uwagi do pokoju, kwota, wpłacono, pozostało, waluta, metoda, operator lub źródło wpłat, darowizna, kod rabatowy, uwagi / dieta, przyjazd, dodatki.' },
          { type: 'list', items: [
            'Plik powstaje w przeglądarce z danych widocznych w panelu — nic nie jest wysyłane na zewnątrz.',
            'Zaznaczenie obejmuje też zgłoszenia ukryte przez filtr; pasek pokazuje, ile ich jest. Po zmianie eventu zaznaczenie się czyści.',
            'Plik zawiera dane osobowe. Przechowuj go i przekazuj tak ostrożnie jak listę uczestników.',
          ] },
        ],
      },
      {
        id: 'zgloszenia-diety-dla-osrodka',
        title: 'Diety i dodatki — zestawienie dla ośrodka',
        blocks: [
          { type: 'note', tone: 'warn', text: 'Ośrodek musi dostać liczbę osób na poszczególnych dietach na 1–2 tygodnie przed pobytem. Wyślij zestawienie w tym terminie i ponownie, jeśli lista uczestników się zmieni.' },
          { type: 'steps', items: [
            '„Zgłoszenia” ▸ wybierz wydarzenie ▸ kliknij „Diety i dodatki” obok listy wyboru wydarzenia.',
            'Sprawdź tabelę: wiersz na każdą dietę i „Standard (bez diety)”, kolumny z grupami wiekowymi, na dole „Suma kontrolna”.',
            'Przeczytaj „Lista imienna” i „Uwagi wpisane do całego zgłoszenia” — alergii wpisanych własnymi słowami nie da się policzyć.',
            'Kliknij „Kopiuj podsumowanie” i wklej tekst do e-maila do ośrodka. Plik z listą imienną: „Eksport CSV”.',
          ] },
          { type: 'list', items: [
            'Liczone są osoby, nie zgłoszenia — z aktywnych zgłoszeń, czyli bez anulowanych i bez listy rezerwowej. Suma kontrolna równa się liczbie zajętych miejsc.',
            'Grupy wiekowe biorą się z progów w „Zniżki wiekowe (dzieci)” danego wydarzenia, np. „Dzieci do 3 lat”, „Dzieci 3–9 lat”, „Dorośli (i dzieci od 10 lat)”. Bez progów: „Dorośli” i „Dzieci”.',
            'Osoba z kilkoma dietami jest w jednym wierszu łączonym, np. „Bez glutenu + Bez mleka”.',
            'Skopiowane podsumowanie zawiera: nazwę wydarzenia, termin, stan na dzień, liczby (z nazwami diet używanymi przez ośrodek) i treść alergii bez imion i nazwisk. Lista imienna jest tylko w panelu i w pliku CSV.',
            'Sekcja „Dodatki z limitem” pokazuje: zamówiono / limit oraz zgłoszenia w kolejności zamówienia; pozycje ponad limit są oznaczone.',
            'Plik CSV zawiera dane osobowe, także dzieci. Przekazuj go tylko osobom, które muszą go mieć.',
          ] },
        ],
      },
      {
        id: 'zgloszenia-zbiorcze',
        title: 'Operacje na kilku zgłoszeniach naraz',
        blocks: [
          { type: 'p', text: 'Zaznacz zgłoszenia polami wyboru po lewej (pole w nagłówku zaznacza wszystkie z bieżącego widoku). Nad listą pojawi się pasek z liczbą zaznaczonych i przyciskami.' },
          { type: 'p', text: '„Oznacz opłacone…”:' },
          { type: 'steps', items: [
            'Kliknij „Oznacz opłacone…”. Otworzy się okno z liczbą zgłoszeń, łączną kwotą i listą „kto — ile”.',
            'Sprawdź listę. System pomija zgłoszenia już opłacone, anulowane, bezpłatne i z listy rezerwowej — okno podaje, ile i dlaczego.',
            'Kliknij „Zaksięguj … zł (liczba)”. Każde zgłoszenie dostaje wpłatę na swoją pozostałą kwotę i status „Potwierdzone”.',
            'Po zakończeniu zielony komunikat podaje, ile zaksięgowano, ile pominięto i ewentualne błędy.',
          ] },
          { type: 'note', tone: 'warn', text: 'Wpłaty „oznaczone jako opłacone” nie mają linku „cofnij”. Zanim potwierdzisz, sprawdź listę w oknie. Gość nie dostaje maila.' },
          { type: 'p', text: '„Napisz e-mail…”:' },
          { type: 'steps', items: [
            'Kliknij „Napisz e-mail…”. Okno pokaże adresy zaznaczonych (bez anulowanych, bez powtórzeń).',
            '„Otwórz program pocztowy (adresy w UDW)” otwiera nową wiadomość z adresami w ukrytej kopii.',
            'Przy długiej liście użyj „Kopiuj adresy” i wklej je w pole UDW nowej wiadomości — okno ostrzega, gdy lista jest za długa dla programu pocztowego.',
          ] },
          { type: 'note', tone: 'info', text: 'Panel nie wysyła tych wiadomości — pisze je i wysyła Twój program pocztowy. Adresy wstawiaj w UDW, żeby goście nie widzieli adresów pozostałych.' },
        ],
      },
      {
        id: 'zgloszenia-edycja',
        title: 'Edycja zgłoszenia',
        blocks: [
          { type: 'steps', items: [
            'Otwórz zgłoszenie i kliknij „Edytuj zgłoszenie”.',
            'Popraw dane zgłaszającego (imię, nazwisko, e-mail, telefon, „Kraj zamieszkania”), uczestników, pokoje, opcje, darowiznę lub uwagi.',
            'Sprawdź blok „Cena” — przelicza się na bieżąco.',
            'Kliknij „Zapisz zmiany”.',
          ] },
          { type: 'list', items: [
            'Uczestników trzeba przypisać do pokoi; wyjątkiem jest wydarzenie z noclegiem opcjonalnym.',
            'Cena liczy się według poziomu cen z dnia zgłoszenia, nie z dnia edycji.',
            'Darowizna gościa zostaje, jeśli jej nie zmienisz.',
            'Dodatki z limitem (np. dostawka): wpisz liczbę sztuk w sekcji „Dodatki z limitem”. Gdy limit jest wyczerpany, panel pokaże pytanie i przycisk „Zapisz mimo limitu”.',
          ] },
        ],
      },
      {
        id: 'zgloszenia-korekta-ceny',
        title: 'Indywidualna zniżka lub kwota końcowa',
        blocks: [
          { type: 'steps', items: [
            '„Zgłoszenia” ▸ zgłoszenie ▸ „Edytuj zgłoszenie” ▸ blok „Cena”.',
            'Wpisz „Rabat” w procentach albo kwotą. Zamiast tego możesz wpisać „kwota końcowa” — zastępuje całe wyliczenie.',
            'Wpisz powód korekty (np. rabat rodzinny).',
            'Kliknij „Zapisz zmiany”.',
          ] },
          { type: 'list', items: [
            'Korekta zostaje przy zgłoszeniu także wtedy, gdy gość później zmieni nocleg.',
            'Darowizna jest doliczana po rabatach i po kwocie końcowej.',
            'Pod wyliczeniem widać kwotę zapisaną obecnie w zgłoszeniu — porównaj ją przed zapisem.',
          ] },
        ],
      },
      {
        id: 'zgloszenia-kraj',
        title: 'Kraj zamieszkania',
        blocks: [
          { type: 'p', text: 'Gość wybiera kraj zamieszkania w kroku „Dane” formularza (pole obowiązkowe). Od kraju zależy, czy zobaczy płatność online: Polska — tak, inny kraj — nie, niezależnie od języka strony.' },
          { type: 'list', items: [
            'Kraj widać w szczegółach zgłoszenia, w części „Kontakt”.',
            'Zmienia go tylko administrator: „Edytuj zgłoszenie” ▸ „Kraj zamieszkania”. Gość nie zmieni go sam.',
            '„— nie podano —” oznacza, że o płatności online decyduje język zgłoszenia (polski — tak).',
            'Zgłoszenia z zaproszeń imiennych i dodane przez administratora nie mają kraju — tam działa reguła języka.',
          ] },
        ],
      },
      {
        id: 'zgloszenia-anulowanie',
        title: 'Anulowanie i przywracanie zgłoszenia',
        blocks: [
          { type: 'p', text: 'Anulowanie:' },
          { type: 'steps', items: [
            'Otwórz zgłoszenie w zakładce „Zgłoszenia”.',
            'Kliknij czerwony przycisk „Anuluj zgłoszenie”.',
            'Przeczytaj okno: kogo dotyczy, co się stanie i ile wpłat jest zaksięgowanych. Potwierdź przyciskiem „Anuluj zgłoszenie” albo wyjdź przez „Nie anuluj”.',
          ] },
          { type: 'list', items: [
            'Zgłoszenie dostaje status „Anulowane”. Zwalnia miejsce w limicie osób i pokoje w limicie pokoi.',
            'Znika z „Płatności” (kafle go nie liczą), „Zakwaterowania”, „Obecności” i Recepcji; nie dostaje przypomnień o ratach.',
            'Gość nie dostaje żadnego maila — jeśli trzeba, napisz do niego sam („Napisz e-mail”).',
            'Dostęp do kursu „Formacji online” nadany z tego zgłoszenia jest odbierany.',
          ] },
          { type: 'note', tone: 'err', text: 'Anulowanie nie zwraca pieniędzy. Zwrot wpłaty Tpay zleca się w „Płatnościach”, gdzie anulowanych zgłoszeń nie widać — zwróć wpłatę PRZED anulowaniem (albo przywróć zgłoszenie, zwróć i anuluj ponownie).' },
          { type: 'p', text: 'Przywracanie:' },
          { type: 'steps', items: [
            '„Zgłoszenia” ▸ zakładka „Anulowane” ▸ kliknij zgłoszenie.',
            'Kliknij „Przywróć zgłoszenie” i potwierdź.',
            'Jeśli brakuje miejsc albo pokoi, pojawi się ostrzeżenie z liczbami. Nic nie jest jeszcze zmienione: „Przywróć mimo to” przywraca ponad limit, „Anuluj” zamyka okno.',
          ] },
          { type: 'list', items: [
            'Status po przywróceniu wynika z wpłat: opłacony zadatek (albo całość, gdy event nie ma harmonogramu) daje „Potwierdzone”, inaczej „Oczekuje na wpłatę”.',
            'Zgłoszenie anulowane z listy rezerwowej wraca na listę rezerwową; potwierdzone bez wpłat (np. bezpłatne) wraca jako potwierdzone.',
            'Gość nie dostaje maila o przywróceniu. Jedyny wyjątek: pierwszy mail powitalny kursu „Formacji online”, jeśli event daje dostęp do kursu, a gość go jeszcze nie dostał.',
            'Zgłoszenia z zaproszenia imiennego, które cofnięto na liście gości, przywraca się tam: potwierdź gościa ponownie w „Edytuj” ▸ „Zaproszeni goście”.',
          ] },
        ],
      },
      {
        id: 'zgloszenia-usuwanie-testowych',
        title: 'Trwałe usuwanie zgłoszeń testowych',
        blocks: [
          { type: 'p', text: 'Zgłoszeń prawdziwych gości nie usuwamy — anulujemy je. Trwałe usuwanie służy tylko do sprzątania po testach.' },
          { type: 'steps', items: [
            'Anuluj zgłoszenie testowe („Anuluj zgłoszenie”).',
            '„Zgłoszenia” ▸ zakładka „Anulowane” ▸ kliknij zgłoszenie.',
            'Kliknij „Usuń trwale”. Przycisk jest widoczny tylko wtedy, gdy zgłoszenie nie ma żadnej prawdziwej wpłaty (nie ma wpłat albo ma wyłącznie wpłaty Tpay ze znacznikiem TEST).',
            'Wpisz słowo USUŃ i potwierdź przyciskiem „Usuń trwale”.',
          ] },
          { type: 'note', tone: 'err', text: 'Operacja jest nieodwracalna. Znikają: zgłoszenie, uczestnicy, wpłaty testowe z próbami płatności i zwrotami, prośby i wpisy Recepcji oraz wpisy dziennika maili tego zgłoszenia.' },
          { type: 'list', items: [
            'Warunki sprawdza serwer: zgłoszenie musi być anulowane i nie może mieć żadnej nietestowej wpłaty — także cofniętej lub zwróconej.',
            'Usuwać może tylko zalogowany administrator. Serwer zapisuje w swoim logu, kto i które zgłoszenie usunął.',
            'Samą wpłatę testową (bez usuwania zgłoszenia) usuwasz w „Płatnościach” — patrz „Usuwanie wpłat testowych”.',
          ] },
        ],
      },
      {
        id: 'zgloszenia-strona-goscia',
        title: 'Strona zgłoszenia gościa (/z/…)',
        blocks: [
          { type: 'p', text: 'Każde zgłoszenie ma własną stronę pod adresem `https://rejestracja.icpemission.pl/z/<token>`. Link do niej gość dostaje w mailu z potwierdzeniem zgłoszenia oraz w przypomnieniach o ratach.' },
          { type: 'p', text: 'Na tej stronie gość:' },
          { type: 'list', items: [
            'widzi numer zgłoszenia, uczestników i nocleg,',
            'może zmienić lub domówić nocleg (cena przelicza się według poziomu z dnia zgłoszenia),',
            'w części „Płatności” widzi kwotę, sumę wpłat, pozostałą kwotę, harmonogram i historię wpłat,',
            'jeśli ma dostęp do płatności online — płaci przyciskami „Zapłać teraz”, „Zapłać całość” albo „Inna kwota”.',
          ] },
          { type: 'p', text: 'Gdzie znaleźć link w panelu:' },
          { type: 'steps', items: [
            '„Zgłoszenia” ▸ kliknij zgłoszenie.',
            'W części „Strona gościa” jest pełny adres. „Kopiuj link” kopiuje go do schowka, „Otwórz” pokazuje stronę w nowej karcie.',
            'Wyślij link gościowi, który zgubił maila — np. przyciskiem „Napisz e-mail”.',
          ] },
          { type: 'note', tone: 'warn', text: 'Link z tokenem działa jak klucz do zgłoszenia — kto go ma, widzi dane, może zmienić nocleg i zapłacić. Wysyłaj go tylko zgłaszającemu, nie publikuj. Link widzi wyłącznie zalogowany administrator; Recepcja go nie pokazuje.' },
        ],
      },
    ],
  },

  // ────────────────────────────────────────────────────────────────────────────
  {
    id: 'platnosci',
    title: 'Płatności',
    articles: [
      {
        id: 'platnosci-kafle',
        title: 'Kafle w zakładce „Płatności”',
        blocks: [
          { type: 'p', text: 'Wybierz wydarzenie z listy „Event:”. Kwoty zawierają darowizny, a zgłoszenia anulowane są pominięte. Ekran odświeża się sam co 30 sekund.' },
          { type: 'table', head: ['Kafel', 'Co oznacza'], rows: [
            ['Zgłoszenia', 'Liczba zgłoszeń i łączna liczba osób.'],
            ['Prognoza wpływów', 'Suma kwot wszystkich zgłoszeń.'],
            ['Wpłacone', 'Suma zaksięgowanych wpłat (także częściowych) i jej udział w prognozie.'],
            ['Do wpłaty', 'Ile jeszcze brakuje do pełnej prognozy i ile zgłoszeń czeka.'],
            ['Opłacone', 'Ile zgłoszeń jest opłaconych w całości.'],
            ['Pula darowizn', 'Suma zadeklarowanych darowizn, ile z nich wpłacono i liczba darczyńców.'],
            ['Zadatki wpłacone', 'Suma wpłaconych zadatków na tle wymaganych. Tylko przy wydarzeniu z harmonogramem wpłat.'],
            ['Wymagalne teraz', 'Kwoty, których termin już nadszedł.'],
            ['Po terminie', 'Zaległości i liczba zgłoszeń z zaległością.'],
          ] },
          { type: 'p', text: 'Pod kaflami jest lista „Prognozowane wpłaty wg terminów” — ile i od ilu zgłoszeń powinno wpłynąć do każdego terminu.' },
        ],
      },
      {
        id: 'platnosci-harmonogram',
        title: 'Harmonogram wpłat (zadatek i raty)',
        blocks: [
          { type: 'steps', items: [
            '„Eventy” ▸ „Edytuj” ▸ „Cennik” ▸ włącz „Harmonogram wpłat (zadatek i raty z terminami)”.',
            'Ustaw raty: nazwa, procent kwoty i termin — „przy rejestracji” albo „do dnia”.',
            'W wierszu „Mail przypominający” ustaw liczbę dni przed terminem i po terminie (domyślnie 3 i 7; 0 wyłącza przypomnienie).',
            'Opcjonalnie w „Wyższy zadatek dla typu zakwaterowania” wpisz np. 50 dla pokoju lub domku na wyłączność.',
            'Kliknij „Zapisz zmiany”.',
          ] },
          { type: 'list', items: [
            'Ostatnia rata zawsze domyka do 100%.',
            'Kto zapisze się po terminie raty, płaci ją od razu razem z zadatkiem.',
            'Terminy są liczone według czasu polskiego, do końca dnia.',
            'Z harmonogramem zgłoszenie jest potwierdzane po wpłacie zadatku; bez harmonogramu dopiero po pełnej kwocie.',
            'Harmonogram wyłączony oznacza całą kwotę do zapłaty od razu.',
            'Gość dostaje harmonogram w mailu potwierdzającym i widzi go na swojej stronie zgłoszenia.',
          ] },
          { type: 'p', text: 'Przypomnienia wysyła system sam, raz na każdą ratę: 3 dni przed terminem i 7 dni po terminie (albo tyle, ile ustawisz), tylko do osób z niedopłatą i tylko do rozpoczęcia wydarzenia.' },
        ],
      },
      {
        id: 'platnosci-ksiegowanie',
        title: 'Zaksięgowanie wpłaty i jej cofnięcie',
        blocks: [
          { type: 'steps', items: [
            'W „Płatności” znajdź zgłoszenie i kliknij „Wpłaty”. Rozwinie się harmonogram i historia wpłat.',
            'Wpisz kwotę, datę wpłaty, metodę („Przelew”, „Gotówka” lub „Online”) i opcjonalnie notatkę.',
            'Kliknij „Zaksięguj wpłatę”.',
          ] },
          { type: 'list', items: [
            '„cofnij” przy wpłacie: unieważnia wpłatę wpisaną ręcznie. Zostaje w historii jako przekreślona.',
            '„cofnij” nie jest dostępne przy wpłatach online (Tpay) — te zwraca się przyciskiem „Zwróć” — ani przy wpłatach powstałych z „Oznacz opłacone”.',
            '„Oznacz opłacone”: księguje brakującą resztę do pełnej kwoty — nie drugi raz całość. Przycisk jest w wierszu zgłoszenia oraz w szczegółach zgłoszenia.',
            'Cofnięcie wpłaty nie cofa statusu zgłoszenia: raz potwierdzone zostaje potwierdzone.',
          ] },
        ],
      },
      {
        id: 'platnosci-statusy',
        title: 'Statusy płatności',
        blocks: [
          { type: 'table', head: ['Status', 'Znaczenie'], rows: [
            ['Opłacone', 'Wpłacono pełną kwotę.'],
            ['Zadatek wpłacony', 'Wydarzenie z harmonogramem: wymagany zadatek jest wpłacony, kolejne raty przed terminem.'],
            ['Częściowo', 'Jest jakaś wpłata, ale mniejsza niż wymagana.'],
            ['Zaległe … zł', 'Minął termin raty i brakuje podanej kwoty.'],
            ['Zwrócono', 'Wpłaty zgłoszenia zostały zwrócone.'],
            ['Oczekuje', 'Brak wpłat.'],
            ['Bezpłatne', 'Zgłoszenie na kwotę 0 zł (znaczek w zakładce „Zgłoszenia”; w „Płatnościach” w kolumnie kwoty).'],
          ] },
          { type: 'p', text: 'Zakładki nad tabelą zawężają listę, m.in. „Opłacone”, „Oczekujące”, „Zaległe”. Kolumna „Najbliższy termin” pokazuje, do kiedy i ile gość ma jeszcze wpłacić.' },
        ],
      },
      {
        id: 'platnosci-online',
        title: 'Płatność online (Tpay) — kto ją widzi',
        blocks: [
          { type: 'p', text: 'Płatność online to BLIK i szybki przelew przez Tpay. Gość widzi ją tylko wtedy, gdy spełnione są wszystkie warunki:' },
          { type: 'list', items: [
            'w wydarzeniu zaznaczono „Płatność online” („Edytuj” ▸ „Metody płatności”),',
            'waluta wydarzenia to PLN,',
            'Tpay jest włączony i skonfigurowany (sprawdzisz to w „Ustawienia” ▸ „Płatności online”),',
            'kraj zamieszkania gościa to Polska; gdy kraju nie podano — język zgłoszenia jest polski.',
          ] },
          { type: 'p', text: 'Pozostali goście płacą przelewem. Jeśli coś jest nie tak z konfiguracją, pod polem „Płatność online” w edycji eventu pojawia się ostrzeżenie z przyczyną.' },
          { type: 'p', text: 'Gość płaci od razu po wysłaniu zgłoszenia (kwotę wymaganą teraz, np. zadatek) albo później ze swojej strony zgłoszenia. Wpłata księguje się sama, bez udziału administratora, a zgłoszenie zmienia status.' },
        ],
      },
      {
        id: 'platnosci-znaczniki',
        title: 'Znaczniki przy wpłatach online: TEST, INNA KWOTA, ZWRÓCONO',
        blocks: [
          { type: 'p', text: 'Wpłaty online mają w historii („Płatności” ▸ „Wpłaty”) opis „online (Tpay)” z tytułem transakcji. Mogą mieć znaczniki:' },
          { type: 'table', head: ['Znacznik', 'Znaczenie i co zrobić'], rows: [
            ['TEST', 'Transakcja testowa — pieniądze nie wpłynęły, ale wpłata potwierdziła zgłoszenie. Nie powinna wystąpić przy prawdziwych zapisach; patrz lista kontrolna przed startem. Taką wpłatę można trwale usunąć przyciskiem „Usuń wpłatę testową”.'],
            ['INNA KWOTA', 'Wpłacona kwota różni się od tej, na którą utworzono płatność. System księguje faktyczny wpływ i wysyła mail do organizatora. Sprawdź zgłoszenie.'],
            ['ZWRÓCONO', 'Wpłata została zwrócona w całości. Jest przekreślona w historii.'],
            ['ZWRÓCONO CZĘŚCIOWO', 'Zwrócono część wpłaty; obok widać zwróconą kwotę.'],
            ['ZWROT DO WYJAŚNIENIA', 'Nie wiadomo, czy zwrot się wykonał. Nie zlecaj go ponownie — patrz instrukcja „Zwroty wpłat online (Tpay)”.'],
          ] },
        ],
      },
      {
        id: 'platnosci-zwroty',
        title: 'Zwroty wpłat online (Tpay)',
        blocks: [
          { type: 'p', text: 'Wpłatę online zwracasz z panelu: w całości albo w części. Zwrot zleca prawdziwy przelew zwrotny przez Tpay i nie da się go cofnąć.' },
          { type: 'steps', items: [
            'W „Płatności” znajdź zgłoszenie i kliknij „Wpłaty”.',
            'Przy wpłacie z opisem „online (Tpay)” kliknij „Zwróć”.',
            'W oknie „Zwrot wpłaty Tpay” sprawdź gościa i wpłatę, potem wpisz kwotę zwrotu. System podpowiada całą kwotę, jaką można jeszcze zwrócić; mniejsza kwota oznacza zwrot częściowy.',
            'Opcjonalnie wpisz powód (widoczny tylko w panelu).',
            'Zostaw albo odznacz „Powiadom gościa mailem („Zwróciliśmy wpłatę”)”.',
            'Kliknij czerwony przycisk „Zwróć …” i poczekaj na komunikat.',
          ] },
          { type: 'list', items: [
            'Pod wpłatą pojawia się wiersz zwrotu: data, kwota, stan („wykonany”, „w toku”, „odrzucony — nic nie zwrócono”), kto zlecił i powód.',
            'Wpłata zwrócona w całości ma znacznik „ZWRÓCONO”, zwrócona w części — „ZWRÓCONO CZĘŚCIOWO” z kwotą.',
            '„Wpłacone” to suma wpłat pomniejszona o zwroty.',
            'Zwrot wykonany bezpośrednio w panelu Tpay też pojawia się pod wpłatą, z opisem „zgłoszony przez Tpay (panel Tpay)”.',
            'Wpłaty testowej (znacznik TEST) dotyczy zwrot testowy — pieniądze nie wpłynęły, więc nic nie wraca.',
          ] },
          { type: 'note', tone: 'err', text: 'Jeśli pojawi się komunikat, że Tpay nie potwierdził zwrotu, albo przy wpłacie jest „ZWROT DO WYJAŚNIENIA” — NIE zlecaj zwrotu ponownie. Sprawdź transakcję w panelu Tpay, a potem pod wpłatą kliknij „w Tpay jest — oznacz wykonany” albo „w Tpay nie ma — oznacz niewykonany”.' },
          { type: 'list', items: [
            'Wpłatę wpisaną ręcznie (gotówka, przelew) koryguje się linkiem „cofnij”, a pieniądze oddaje poza systemem.',
            'Anulowanie zgłoszenia samo nie zwraca pieniędzy.',
            'Pomocnik w Recepcji nie robi zwrotów.',
          ] },
          { type: 'note', tone: 'info', text: 'Przycisk „Zwróć” wymaga wdrożonej nowej wersji API („Manual Deploy” usługi `icpe-api`). Jeśli przycisku nie ma albo zwrot kończy się błędem, zwrot można zlecić bezpośrednio w panelu Tpay.' },
        ],
      },
      {
        id: 'platnosci-usuwanie-testowych',
        title: 'Usuwanie wpłat testowych',
        blocks: [
          { type: 'p', text: 'Wpłaty ze znacznikiem TEST powstają w trybie testowym Tpay. Pieniądze nie wpłynęły, więc takich wpłat się nie zwraca — usuwa się je.' },
          { type: 'steps', items: [
            '„Płatności” ▸ wybierz event ▸ przy zgłoszeniu kliknij „Wpłaty”.',
            'Przy wpłacie ze znacznikiem TEST kliknij „Usuń wpłatę testową”.',
            'Przeczytaj okno i potwierdź przyciskiem „Usuń wpłatę testową”.',
          ] },
          { type: 'list', items: [
            'Wpłata znika z historii razem z próbą płatności online i jej zwrotami. Do Tpay nic nie jest wysyłane.',
            '„Wpłacono” i status zgłoszenia są przeliczane: jeśli bez tej wpłaty brakuje zadatku (albo całości, gdy event nie ma harmonogramu), zgłoszenie wraca z „Potwierdzone” do „Oczekuje na wpłatę”.',
            'Przycisku nie ma przy wpłacie ze zwrotem „do wyjaśnienia” — najpierw rozstrzygnij zwrot.',
            'Serwer usuwa wyłącznie wpłatę Tpay oznaczoną jako testowa; prawdziwej wpłaty tak usunąć się nie da. W logu serwera zostaje ślad, kto usunął.',
          ] },
          { type: 'note', tone: 'err', text: 'Usunięcie jest trwałe i nieodwracalne. Nie myl go ze zwrotem („Zwróć”) ani z cofnięciem wpłaty ręcznej („cofnij”) — tamte zostawiają ślad w historii.' },
          { type: 'p', text: 'Całe zgłoszenie testowe usuwasz w „Zgłoszeniach” — patrz „Trwałe usuwanie zgłoszeń testowych”. Anulowanych zgłoszeń nie widać w „Płatnościach”, więc pojedyncze wpłaty testowe usuwaj przed anulowaniem albo usuń od razu całe zgłoszenie.' },
        ],
      },
      {
        id: 'platnosci-maile',
        title: 'Maile wysyłane automatycznie',
        blocks: [
          { type: 'table', head: ['Mail', 'Kiedy wychodzi'], rows: [
            ['Potwierdzenie zgłoszenia', 'Po wysłaniu zgłoszenia. Zawiera link do strony zgłoszenia, harmonogram wpłat (gdy jest) i podziękowanie za darowiznę.'],
            ['Przypomnienie przed terminem raty', 'Domyślnie 3 dni przed terminem, do osób z niedopłatą. Z danymi do przelewu i — gdy gość ma do niej dostęp — przyciskiem „Zapłać online”.'],
            ['Przypomnienie po terminie raty', 'Domyślnie 7 dni po terminie, do osób z zaległością.'],
            ['Otrzymaliśmy wpłatę', 'Po zaksięgowaniu wpłaty online.'],
            ['Zwróciliśmy wpłatę', 'Po zwrocie wpłaty online, jeśli w oknie zwrotu zaznaczono powiadomienie gościa.'],
            ['Płatność online wymaga uwagi', 'Do organizatora, gdy wpłata online jest nietypowa, np. inna kwota, nadpłata albo wpłata do anulowanego zgłoszenia.'],
            ['Otwarcie zapisów', 'Jeden mail do osób z listy oczekujących w chwili startu zapisów.'],
            ['Przypomnienie o niedokończonym zgłoszeniu', '3 godziny po przerwaniu wypełniania formularza.'],
            ['Zmiana noclegu', 'Do gościa, gdy zmieni nocleg na swojej stronie zgłoszenia.'],
          ] },
          { type: 'p', text: 'Historię wysyłek i stan poczty sprawdzisz w „Ustawienia”, w części o poczcie: lista „Ostatnie maile” ze statusem „Wysłany”, „Błąd” lub „Nie wysłany” oraz przycisk „Wyślij test”.' },
          { type: 'note', tone: 'info', text: 'Maile do organizatora idą na adres odpowiedzi ustawiony na serwerze („Odpowiedzi na:” w ustawieniach poczty). Gdy jest pusty, alert trafia tylko do logów serwera.' },
        ],
      },
    ],
  },

  // ────────────────────────────────────────────────────────────────────────────
  {
    id: 'panel',
    title: 'Dashboard i podstawy panelu',
    intro: 'Logowanie, menu boczne, ekran startowy i sama zakładka „Pomoc”.',
    articles: [
      {
        id: 'panel-logowanie',
        title: 'Logowanie i wylogowanie',
        blocks: [
          { type: 'steps', items: [
            'Otwórz `https://rejestracja.icpemission.pl/admin`.',
            'Wpisz adres e-mail i hasło administratora.',
            'Na własnym komputerze możesz zaznaczyć „Zapamiętaj mnie na tym urządzeniu”. Na cudzym komputerze zostaw to pole puste.',
            'Kliknij „Zaloguj się”.',
          ] },
          { type: 'list', items: [
            'Bez zaznaczenia sesja trwa 12 godzin, z zaznaczeniem 30 dni i przedłuża się sama, gdy korzystasz z panelu.',
            'Po wygaśnięciu sesji panel sam wraca do ekranu logowania.',
            'Wylogujesz się ikoną „Wyloguj” obok swojego adresu na dole menu bocznego albo przyciskiem „Wyloguj” w „Ustawienia” ▸ „Konto”.',
            'Błędne dane dają komunikat „Nieprawidłowy e-mail lub hasło. Spróbuj ponownie.”',
          ] },
          { type: 'note', tone: 'warn', text: 'Ekran logowania nie ma przypomnienia hasła, a panel nie ma zmiany hasła administratora ani dodawania kolejnych administratorów. Takie zmiany robi osoba rozwijająca system.' },
        ],
      },
      {
        id: 'panel-menu',
        title: 'Menu boczne — co gdzie jest',
        blocks: [
          { type: 'table', head: ['Pozycja', 'Do czego służy'], rows: [
            ['Dashboard', 'Ekran startowy: jeden wybrany event — tempo zapisów, lejek, źródła wejść, pieniądze, pokoje i lista spraw do załatwienia. Opis w następnej instrukcji.'],
            ['Eventy', 'Lista wydarzeń, kreator nowego eventu, „Edytuj”, zamykanie i archiwum. Sekcja „Eventy”.'],
            ['Biblioteka', 'Zapisani goście specjalni i miejsca do ponownego użycia w eventach. Sekcja „Biblioteka”.'],
            ['Zgłoszenia', 'Lista zgłoszeń wybranego eventu, szczegóły, edycja, anulowanie, eksport. Sekcja „Zgłoszenia”.'],
            ['Zakwaterowanie', 'Wpisywanie numeru pokoju przy zgłoszeniu. Sekcja „Zakwaterowanie”.'],
            ['Płatności', 'Wpłaty, raty, zwroty. Sekcja „Płatności”.'],
            ['Obecność', 'Lista obecności wybranego eventu. Sekcja „Obecność”.'],
            ['Recepcja', 'Prośby dodatkowe gości i dziennik działań stanowiska przyjęć. Sekcja „Recepcja”.'],
            ['Formacja online', 'Kursy z filmami i plikami PDF oraz ich kursanci. Sekcja „Formacja online”.'],
            ['Ustawienia', 'Motyw, konto, poczta, stan płatności online. Sekcja „Ustawienia”.'],
            ['Pomoc', 'Te instrukcje.'],
          ] },
          { type: 'list', items: [
            'Pod menu jest przełącznik motywu („Jasny” / „Ciemny”). Napis „PL” obok niego to tylko informacja — panel administratora działa wyłącznie po polsku.',
            'Ekrany „Zgłoszenia”, „Zakwaterowanie”, „Płatności”, „Obecność” i „Recepcja” zaczynają się od wyboru eventu z listy „Event:”.',
            'Panel nie ma osobnych adresów dla ekranów. Po odświeżeniu strony wracasz na „Dashboard” (wyjątek: adres z `#pomoc` otwiera „Pomoc”).',
          ] },
        ],
      },
      {
        id: 'dashboard-kafle',
        title: 'Dashboard — jak czytać dashboard eventu',
        blocks: [
          { type: 'p', text: 'Dashboard pokazuje JEDEN event, wybrany z listy u góry (panel zapamiętuje wybór w tej przeglądarce; na start bierze najbliższy nadchodzący event, który nie jest ukryty). Obok: stan zapisów, liczba dni do eventu i link „Strona zapisów”. Liczby z bazy odświeżają się same co minutę, „Odśwież” pobiera od razu także dane z PostHoga.' },
          { type: 'p', text: 'Wszystkie liczby osób liczą zgłoszenia, które trzymają miejsce: bez anulowanych i bez listy rezerwowej (tak samo jak licznik wolnych miejsc na stronie eventu). Zgłoszenie bez listy uczestników liczy się jako 1 dorosły.' },
          { type: 'table', head: ['Sekcja', 'Co pokazuje i skąd'], rows: [
            ['„Co wymaga uwagi”', 'Pojawia się tylko, gdy coś jest nie tak: przekroczony limit miejsc, zaległe wpłaty (termin raty minął), wyczerpane typy pokoi lub dodatki, za wolne tempo zapisów, zgłoszenia czekające na przelew ponad 7 dni bez żadnej wpłaty, zgłoszenia z noclegiem bez pokoju (dopiero 30 dni przed eventem), na wyczerpaniu (≤ 2 wolne), lista rezerwowa, porzucone formularze (ponad 24 h). Przycisk po prawej przenosi do ekranu, na którym to załatwisz.'],
            ['Kafle u góry', 'Zapisane osoby względem celu (albo limitu miejsc), wpłacone względem należnych, zaległe wpłaty i odsetek odwiedzających strony eventu, którzy wysłali zgłoszenie (PostHog, wybrany okres).'],
            ['„Czy zdążymy? — tempo zapisów”', 'Wykres osób narastająco dzień po dniu (najedź myszą, żeby zobaczyć dzień), linia celu, limit miejsc, kreskowana linia tempa potrzebnego do celu w dniu zamknięcia zapisów oraz kropki: progi cenowe, terminy rat, start i koniec zapisów. Po prawej: ile brakuje, potrzebne tempo, obecne tempo (średnia z ostatnich 14 dni zapisów) i prognoza na koniec zapisów.'],
            ['„Ustaw cel frekwencji”', 'Jedyna rzecz, którą zmieniasz na dashboardzie: liczba osób, do której chcesz dojść (np. minimum z umowy z ośrodkiem). Tylko informacja — niczego nie blokuje. Bez celu dashboard porównuje z limitem miejsc eventu. Puste pole i „Zapisz” usuwa cel.'],
            ['„Gdzie ludzie odpadają? — lejek”', 'Z PostHoga, za wybrany okres (7 / 30 / 90 dni / rok): ile osób weszło na stronę eventu, zaczęło formularz, przeszło każdy krok, wybrało płatność i wysłało zgłoszenie. Czerwony pasek = krok, na którym odpada najwięcej osób. Obok: telefon / komputer i język strony. Niżej: komunikaty, które zatrzymały gości na kroku, nieudane wysyłki z powodem, porzucone formularze z bazy (osoby, które podały e-mail) i wejścia dzień po dniu.'],
            ['„Skąd przychodzą?”', 'Źródło każdej wizyty (pierwsze wejście) i ile z tych wizyt skończyło się zgłoszeniem. Obok: kraj zamieszkania i język formularza zapisanych osób (baza). Na dole generator linku z oznaczeniem źródła.'],
            ['„Ile mamy pieniędzy?”', 'Wpłacone (netto po zwrotach), należne łącznie, wymagane do dziś, zadatki, pula darowizn, prognoza wpływów na każdy termin raty (zaległe na czerwono), skąd wpłynęły pieniądze (Tpay, wyciąg, wpis ręczny; testowe osobno) i jaki sposób płatności wybrali goście.'],
            ['„Co jest wyprzedane?”', 'Każdy typ pokoju: zajęte / limit, wolne w zapisie publicznym, wykorzystanie rezerwy dla gości specjalnych, liczba osób. Pod spodem: przydział pokoi, dodatki z limitem (dostawki, łóżeczka) i liczba osób na każdej diecie.'],
            ['„Ostatnie zgłoszenia”', 'Osiem najnowszych zgłoszeń tego eventu z kwotą i wpłatą, nad tabelą liczba zgłoszeń w każdym statusie. Pod tabelą: zapisani na powiadomienie o starcie zapisów i anulowane.'],
          ] },
          { type: 'note', tone: 'info', text: 'Liczby z PostHoga to osoby liczone bez cookies: ta sama osoba, która wróci następnego dnia, liczy się drugi raz, a PostHog nie wie nic o imionach ani adresach. Przy małych liczbach traktuj procenty jako sygnał, nie wyrok. Pieniądze, osoby i pokoje pochodzą wyłącznie z bazy i są dokładne.' },
          { type: 'note', tone: 'warn', text: 'Sekcje z PostHoga działają dopiero, gdy na Renderze (usługa `icpe-api` ▸ Environment) jest zmienna `POSTHOG_PERSONAL_API_KEY` — osobisty klucz PostHog z zakresem „Endpoint: Read”. Bez niej dashboard pokazuje w tym miejscu instrukcję, a reszta działa normalnie.' },
          { type: 'p', text: 'Twoje własne testy: przeglądarka, w której zalogujesz się do panelu, przestaje być liczona w PostHogu (dotyczy tej przeglądarki na tym urządzeniu — na telefonie zaloguj się raz do panelu). Stan widać na dole dashboardu, tam też „Licz mnie jednak” / „Nie licz tej przeglądarki”.' },
        ],
      },
      {
        id: 'dashboard-linki-zrodla',
        title: 'Link z oznaczeniem źródła (Facebook, WhatsApp, newsletter)',
        blocks: [
          { type: 'p', text: 'WhatsApp, Messenger, SMS i część aplikacji pocztowych nie mówią stronie, skąd przyszedł gość — w „Skąd przychodzą?” wszystko to wpada do „Bezpośrednio”. Żeby wiedzieć, które ogłoszenie działa, wklejaj w posty i wiadomości link z oznaczeniem.' },
          { type: 'steps', items: [
            'Dashboard ▸ wybierz event ▸ sekcja „Skąd przychodzą?” ▸ „Link z oznaczeniem źródła”.',
            'Wybierz, gdzie wkleisz link (np. „WhatsApp”), i opcjonalnie wpisz nazwę akcji (np. „ogloszenie-styczen”).',
            '„Kopiuj link” i wklej go zamiast zwykłego adresu `rejestracja.icpemission.pl/r/…`.',
            'Po kilku dniach w tabeli źródeł pojawi się wiersz „Kampania: whatsapp” z liczbą wizyt i zgłoszeń.',
          ] },
          { type: 'note', tone: 'info', text: 'Link prowadzi na tę samą stronę zapisów; oznaczenie nie zawiera żadnych danych osobowych. Dla plakatu zrób z linku kod QR (źródło „Plakat / kod QR”).' },
        ],
      },
      {
        id: 'pomoc-jak-korzystac',
        title: 'Jak korzystać z „Pomocy”',
        blocks: [
          { type: 'list', items: [
            'Pole „Szukaj” przeszukuje tytuły i treść instrukcji. Polskie znaki i wielkość liter nie mają znaczenia.',
            '„Rozwiń wszystkie” otwiera wszystkie instrukcje naraz, „Zwiń wszystkie” je zamyka.',
            '„Drukuj” otwiera okno drukowania przeglądarki z rozwiniętymi instrukcjami (można też zapisać jako PDF).',
            'Każda instrukcja ma własny adres w postaci `/admin#pomoc/<nazwa>` — można go skopiować i wysłać innemu administratorowi.',
            '„Spis treści” prowadzi do sekcji i pojedynczych instrukcji.',
          ] },
          { type: 'p', text: 'Instrukcje opisują stan systemu z dnia podanego u góry zakładki. Jeżeli ekran wygląda inaczej niż w opisie, zgłoś to osobie rozwijającej system — instrukcja wymaga poprawki.' },
        ],
      },
    ],
  },

  // ────────────────────────────────────────────────────────────────────────────
  {
    id: 'zaproszenia',
    title: 'Zaproszenia i goście',
    intro: 'Event „Na zaproszenie”, lista gości, potwierdzeni przez organizatora, zapraszanie przez uczestników, spotkania „Będę / Nie będę”.',
    articles: [
      {
        id: 'zaproszenia-rodzaje',
        title: 'Trzy sposoby zapraszania',
        blocks: [
          { type: 'table', head: ['Sytuacja', 'Jak to działa'], rows: [
            ['Event typu „Na zaproszenie”', 'Nie ma publicznego formularza zapisu. Każdy gość ma osobisty link i sam potwierdza udział albo zostaje potwierdzony przez organizatora. Eventu nie ma na stronie głównej. Lista gości: „Eventy” ▸ „Edytuj” ▸ „Zaproszeni goście”.'],
            ['Zwykły event z gośćmi z listy', 'W „Edytuj” ▸ „Goście z zaproszeniem” wpisujesz osoby, które dostają osobisty link do rejestracji z wpisanymi danymi. Przechodzą zwykły formularz z ceną i płatnością, a potem są w „Zgłoszenia” jak każdy uczestnik.'],
            ['Event „Standalone (bez noclegu)”', 'Bez listy gości. Każdy, kto otworzy stronę, klika „Będę” albo „Nie będę”. Patrz ostatnia instrukcja tej sekcji.'],
          ] },
          { type: 'p', text: 'Wszystkie osobiste linki są imienne. Kto ma link, ten działa w imieniu gościa — nie publikuj ich i nie wysyłaj do grup.' },
        ],
      },
      {
        id: 'zaproszenia-dodawanie',
        title: 'Dodanie gościa i wysłanie zaproszenia',
        blocks: [
          { type: 'p', text: 'Pierwszych gości eventu „Na zaproszenie” można wpisać już w kreatorze (pole „Zaproszeni goście”, jedna osoba na wiersz: imię i nazwisko, e-mail, telefon). Kolejnych dodajesz w edycji eventu:' },
          { type: 'steps', items: [
            '„Eventy” ▸ przy wydarzeniu „Edytuj” ▸ sekcja „Zaproszeni goście” (w zwykłym evencie: „Goście z zaproszeniem”).',
            'W ramce „Dodaj gościa” w evencie „Na zaproszenie” zostaw tryb „Zaproś (gość potwierdza)” (zwykły event nie ma wyboru trybu).',
            'Wpisz „Imię”, „Nazwisko”, „E-mail (opcjonalnie)” i „Telefon” (z numerem kierunkowym, np. +48…).',
            'Opcjonalnie rozwiń „Personalizuj treść maila (opcjonalnie)” — opis w instrukcji „Własna treść maila”.',
            'Kliknij „Dodaj i wyślij zaproszenie”. Mail z osobistym linkiem wychodzi od razu. „Dodaj bez wysyłania” tylko dopisuje osobę do listy.',
          ] },
          { type: 'list', items: [
            'Gość bez adresu e-mail nie dostanie maila. Przekaż mu link przyciskiem „Kopiuj link”, „WhatsApp” albo „iMessage” przy jego wierszu.',
            '„WhatsApp” i „iMessage” tylko otwierają aplikację z gotową treścią — wiadomość wysyłasz ręcznie.',
            '„Wyślij niewysłane (liczba)” nad listą wysyła zaproszenia wszystkim, którzy jeszcze nie dostali maila (pomija odmowy i osoby, które już same potwierdziły).',
            'Sekcja zapisuje się sama, od razu — nie trzeba klikać „Zapisz zmiany” na dole formularza eventu.',
          ] },
          { type: 'note', tone: 'warn', text: 'Komunikat „Mail NIE został wysłany — serwer nie ma skonfigurowanej poczty” oznacza, że poczta systemu jest wyłączona. Sprawdź „Ustawienia” ▸ „E-mail”, a link przekaż ręcznie.' },
        ],
      },
      {
        id: 'zaproszenia-lista',
        title: 'Lista gości: statusy i przyciski',
        blocks: [
          { type: 'table', head: ['Status przy nazwisku', 'Znaczenie'], rows: [
            ['„Czeka”', 'Zaproszony, bez odpowiedzi.'],
            ['„Potwierdził”', 'Gość sam potwierdził udział swoim linkiem.'],
            ['„Potwierdzony · organizator”', 'Dodany lub potwierdzony przez administratora — gość nie musiał nic klikać.'],
            ['„Nie przyjdzie”', 'Odmowa. Osoba nie liczy się do posiłków.'],
            ['„Zarejestrowany”', 'Tylko w zwykłym evencie: gość przeszedł formularz rejestracji.'],
          ] },
          { type: 'table', head: ['Przycisk przy gościu', 'Co robi'], rows: [
            ['„Kopiuj link”', 'Kopiuje osobisty link gościa.'],
            ['„WhatsApp”, „iMessage”', 'Otwiera aplikację z gotową treścią zaproszenia.'],
            ['„Wyślij mail” / „Wyślij ponownie”', 'Wysyła zaproszenie na adres gościa. U osoby potwierdzonej przez organizatora przycisk nazywa się „Wyślij mail z potwierdzeniem” / „Wyślij potwierdzenie ponownie”.'],
            ['„Treść maila”', 'Własny zwrot, dodatkowe zdania, temat, forma grzecznościowa.'],
            ['„Potwierdź ręcznie”', 'Gość potwierdził poza linkiem, np. telefonicznie: wpisujesz skład (małżonek, dzieci, diety) i klikasz „Potwierdź udział”.'],
            ['„Edytuj skład i diety”', 'Zmiana małżonka, dzieci, diet i notatki u osoby już potwierdzonej.'],
            ['„Cofnij potwierdzenie” / „Cofnij odmowę”', 'Osoba wraca do „Czeka”. Przy cofnięciu potwierdzenia jej zgłoszenie zostaje anulowane.'],
            ['„Nie przyjdzie”', 'Oznacza odmowę zgłoszoną poza systemem.'],
            ['„Usuń”', 'Usuwa osobę z listy. Potwierdzone zgłoszenie zostaje anulowane.'],
          ] },
          { type: 'list', items: [
            'Lista odświeża się sama; przycisk „Odśwież” robi to od razu.',
            'Ostrzeżenie o potwierdzeniach, których „jeszcze nie widać w module Zgłoszenia/Obecność”, usuwa przycisk „Synchronizuj z listą zgłoszeń”.',
            'Potwierdzeni goście eventu „Na zaproszenie” są też w „Zgłoszenia”, „Obecność” i w Recepcji.',
          ] },
        ],
      },
      {
        id: 'zaproszenia-potwierdzeni',
        title: 'Dodanie osób od razu potwierdzonych',
        blocks: [
          { type: 'p', text: 'Tylko w evencie „Na zaproszenie”. Służy do wpisania osób, które nie muszą niczego klikać: organizatorów, prowadzących, rodzin, które potwierdziły ustnie.' },
          { type: 'steps', items: [
            'W ramce „Dodaj gościa” przełącz tryb na „Dodaj jako potwierdzonego”.',
            'Wpisz osobę główną — tę, do której należy e-mail i link.',
            'Wybierz skład: osoba, „Małżeństwo” albo „Rodzina”. Uzupełnij małżonka, dzieci z wiekiem, diety i ewentualną notatkę wewnętrzną (gość jej nie widzi).',
            'Zdecyduj o polu „Wyślij mail z potwierdzeniem i prośbą o dietę”. Odznaczone = ciche dodanie, bez maila.',
            'Kliknij „Dodaj jako potwierdzonego”.',
          ] },
          { type: 'list', items: [
            'Cała rodzina to jeden wpis na liście — tak liczą się posiłki.',
            '„Wklej listę” przyjmuje wiele rodzin naraz, jedna w wierszu: `Imię Nazwisko, e-mail, telefon, małżonek, dzieci`. Puste kolumny można pominąć, dzieci rozdziela się średnikiem (imię opcjonalne, liczba = wiek). Wiersze z błędem są pomijane.',
            'Jeśli osoba albo jej małżonek już jest na liście, system niczego nie dodaje i pokazuje „możliwy duplikat” z wyborem: „Potwierdź istniejące zaproszenie” albo „Usuń osobny rekord i dodaj rodzinę”. Chodzi o to, żeby posiłki nie policzyły się podwójnie.',
            '„Zamień osobę główną z małżonkiem” zmienia, do kogo należy e-mail i link.',
            'To samo można zrobić już w kreatorze, w polu „Uczestnicy od razu potwierdzeni (bez zaproszenia)”.',
          ] },
        ],
      },
      {
        id: 'zaproszenia-posilki',
        title: 'Licznik posiłków i diety',
        blocks: [
          { type: 'p', text: 'Nad listą gości eventu „Na zaproszenie” jest podsumowanie „Potwierdzeni: X dorosłych + Y dzieci = Z posiłków”, a pod nim liczby „Jeszcze niepotwierdzeni” i „Nie przyjdzie”. To liczba do zamówienia u cateringu.' },
          { type: 'list', items: [
            'Przy każdej osobie widać dietę: wpisane wymagania, „bez wymagań żywieniowych ✓” albo „dieta: czeka na odpowiedź”.',
            'Pasek „Diety nieznane” pokazuje rodziny potwierdzone przez Ciebie, które jeszcze nie odpowiedziały w sprawie diety.',
            '„Przypomnij o diecie (liczba)” wysyła im mail z prośbą o podanie wymagań żywieniowych (z pytaniem o potwierdzenie przed wysyłką).',
            'Dietę możesz też wpisać sam: „Edytuj skład i diety”.',
          ] },
        ],
      },
      {
        id: 'zaproszenia-tresc-maila',
        title: 'Własna treść maila dla jednej osoby',
        blocks: [
          { type: 'steps', items: [
            'Przy gościu kliknij „Treść maila” (przy dodawaniu: „Personalizuj treść maila (opcjonalnie)”).',
            'Ustaw, czego potrzebujesz: „Forma grzecznościowa (bez „Ty”, np. dla biskupa, gościa honorowego)”, własny zwrot na początku, dodatkowe zdania od organizatora, temat.',
            'Kliknij „Podgląd maila” — zobaczysz dokładnie ten mail, który wyjdzie. Przycisk w podglądzie jest nieaktywny.',
            'Kliknij „Zapisz i wyślij” (albo „Zapisz i wyślij ponownie”) lub „Zapisz bez wysyłania”.',
          ] },
          { type: 'p', text: 'Gość z własną treścią ma na liście znacznik „własna treść maila”.' },
        ],
      },
      {
        id: 'zaproszenia-gosc',
        title: 'Co widzi zaproszony gość',
        blocks: [
          { type: 'list', items: [
            'Event „Na zaproszenie”: link z maila otwiera stronę zaproszenia. Gość wybiera, czy przyjeżdża sam, czy z małżonkiem, może dopisać dzieci i wymagania żywieniowe, i klika „Potwierdzam udział”. Odpowiedź może potem zmienić.',
            'Osoba potwierdzona przez organizatora widzi „Jesteś na liście gości” i może tylko podać wymagania żywieniowe.',
            'Kto wejdzie na stronę eventu „Na zaproszenie” bez osobistego linku, zobaczy informację, że wydarzenie jest tylko dla zaproszonych, i formularz „Potwierdź udział”: imię, nazwisko i e-mail muszą się zgadzać z listą gości.',
            'Zwykły event: osobisty link otwiera formularz rejestracji z wpisanymi danymi gościa.',
          ] },
        ],
      },
      {
        id: 'zaproszenia-zapros-goscia',
        title: 'Uczestnicy zapraszają swoich gości',
        blocks: [
          { type: 'steps', items: [
            '„Eventy” ▸ „Edytuj” ▸ sekcja „Zaproszeni goście” albo „Goście z zaproszeniem”.',
            'Zaznacz „Uczestnicy mogą sami zapraszać gości” i ustaw „Maks. gości na uczestnika”.',
            'Kliknij „Zapisz zmiany” na dole formularza — to ustawienie zapisuje się razem z eventem.',
          ] },
          { type: 'list', items: [
            'Event „Na zaproszenie”: po potwierdzeniu udziału gość dostaje link „Zaproś gościa”. Zaproszona osoba dostaje imienne zaproszenie mailem i sama potwierdza udział.',
            'Zwykły event: po rejestracji uczestnik widzi przycisk „Zaproś gościa” (także w mailu z potwierdzeniem). Jego gość dostaje link do rejestracji z wpisanymi danymi i przechodzi zwykły formularz z ceną.',
            'Goście uczestników nie mogą zapraszać dalej.',
            '„Wyślij linki „Zaproś gościa”” wysyła link osobom, które zapisały się lub potwierdziły przed włączeniem tej opcji.',
            'Przy osobie na liście jest przycisk „Link „Zaproś gościa”” — kopiuje jej link do ręcznego przekazania.',
            'Licznik „od uczestników” nad listą pokazuje, ile osób zaprosili uczestnicy.',
          ] },
        ],
      },
      {
        id: 'zaproszenia-standalone',
        title: 'Spotkanie „Będę / Nie będę” (Standalone)',
        blocks: [
          { type: 'p', text: 'Event typu „Standalone (bez noclegu)” jest bezpłatny i nie ma formularza zapisu. Na stronie eventu gość wpisuje imię i nazwisko, opcjonalnie e-mail, i klika „Będę” albo „Nie będę”. Po odpowiedzi „Będę” może dodać termin do kalendarza.' },
          { type: 'list', items: [
            'Jedna odpowiedź na adres e-mail: ponowna odpowiedź z tym samym adresem zastępuje poprzednią. Bez e-maila każda odpowiedź to nowy wpis.',
            'Taki event nie ma sekcji gości, pokoi, cennika ani płatności.',
          ] },
          { type: 'note', tone: 'warn', text: 'Panel administratora nie pokazuje listy odpowiedzi „Będę / Nie będę” ani ich liczby — te osoby nie są zgłoszeniami, więc nie ma ich w „Zgłoszenia” ani w „Obecność”. Serwer je zapisuje i udostępnia aplikacji Personal OS; w panelu takiego ekranu jeszcze nie ma.' },
        ],
      },
    ],
  },

  // ────────────────────────────────────────────────────────────────────────────
  {
    id: 'biblioteka',
    title: 'Biblioteka',
    intro: 'Goście specjalni i miejsca zapisane do ponownego użycia w eventach.',
    articles: [
      {
        id: 'biblioteka-do-czego',
        title: 'Do czego służy Biblioteka',
        blocks: [
          { type: 'p', text: 'Biblioteka to dwie listy do wielokrotnego użytku, w zakładkach „Goście specjalni” i „Miejsca” (obok nazwy zakładki jest liczba wpisów). Z tych samych list korzysta kreator eventu i formularz „Edytuj”.' },
          { type: 'note', tone: 'info', text: 'Event zawsze dostaje kopię wpisu. Zmiana albo usunięcie w Bibliotece nie zmienia eventów, które już z niego skorzystały — tam poprawiasz dane osobno, w „Edytuj”.' },
        ],
      },
      {
        id: 'biblioteka-goscie',
        title: 'Goście specjalni',
        blocks: [
          { type: 'steps', items: [
            '„Biblioteka” ▸ zakładka „Goście specjalni” ▸ „Dodaj gościa”.',
            'Wpisz imię i nazwisko po polsku — to jedyne pole wymagane.',
            'Kliknij „Wgraj portret” i wybierz zdjęcie (tylko obrazki, najwyżej 5 MB). „Zmień portret” podmienia je, krzyżyk obok usuwa.',
            'Dla małżeństwa lub kilku osób w jednym wpisie zaznacz „Para / kilka osób w jednym wpisie (np. małżeństwo — wspólne zdjęcie i opis)”.',
            'W polu opisu napisz 1–2 zdania o gościu.',
            'Przełącz język przyciskami „PL”, „EN”, „IT” i dopisz tłumaczenia imion oraz opisu. Puste pole w danym języku oznacza, że strona pokaże wersję polską. Portret i oznaczenie pary są wspólne dla wszystkich języków.',
            'Kliknij „Zapisz w bibliotece”.',
          ] },
          { type: 'list', items: [
            'Na liście przy każdym gościu widać znaczniki języków, w których ma wpisane dane.',
            'Ołówek („Edytuj”) otwiera wpis do zmiany, kosz („Usuń z biblioteki”) usuwa go po potwierdzeniu „Tak”.',
            'W evencie gościa wstawiasz przyciskiem „Wybierz z biblioteki” w części o gościach specjalnych (kreator: krok „Szczegóły”; edycja: „Program i goście specjalni”).',
            'Gościa wpisanego ręcznie w evencie można stamtąd dodać do Biblioteki przyciskiem „Zapisz w bibliotece”.',
            'Biblioteka nie przechowuje nagłówka, pod którym gość występuje na stronie (np. „Wykładowcy”) — to ustawia się w evencie; patrz „Nagłówki nad gośćmi specjalnymi”.',
          ] },
        ],
      },
      {
        id: 'biblioteka-miejsca',
        title: 'Miejsca',
        blocks: [
          { type: 'steps', items: [
            '„Biblioteka” ▸ zakładka „Miejsca”.',
            'W polu u góry wpisz nazwę z adresem, np. nazwę ośrodka, ulicę i miejscowość.',
            'Kliknij „Dodaj miejsce”.',
          ] },
          { type: 'list', items: [
            'Ołówek („Zmień nazwę”) pozwala poprawić wpis — potwierdź przyciskiem „Zapisz”. Kosz („Usuń miejsce”) usuwa go po potwierdzeniu „Tak”.',
            'W evencie miejsce wybierasz z listy „— wybierz zapisane miejsce —” przy polu miejsca (kreator i „Edytuj”).',
            'Biblioteka przechowuje tylko polski tekst miejsca. Tłumaczenia adresu (EN / IT) wpisuje się w samym evencie.',
          ] },
        ],
      },
    ],
  },

  // ────────────────────────────────────────────────────────────────────────────
  {
    id: 'zakwaterowanie',
    title: 'Zakwaterowanie',
    intro: 'Numery pokoi przy zgłoszeniach.',
    articles: [
      {
        id: 'zakwaterowanie-numery',
        title: 'Wpisywanie numerów pokoi',
        blocks: [
          { type: 'steps', items: [
            'Wejdź w „Zakwaterowanie” i wybierz wydarzenie z listy „Event:”.',
            'Znajdź gościa. Pole „Szukaj gościa lub pokoju...” szuka po imieniu, nazwisku i wpisanym numerze pokoju.',
            'W polu „Nr pokoju” wpisz numer albo nazwę pokoju (dowolny tekst, np. 12, Domek 3, Hotel 204).',
            'W polu „Komentarz (opcjonalnie)” możesz dopisać uwagę, np. o dostawce.',
            'Kliknij „Zapisz” przy tym gościu. Przycisk jest aktywny tylko wtedy, gdy coś zmieniłeś; po zapisie pokazuje „Zapisano”.',
          ] },
          { type: 'list', items: [
            'Każdy wiersz zapisuje się osobno. Zmiany w wierszu bez kliknięcia „Zapisz” przepadają po zmianie eventu lub ekranu.',
            'Pod nazwiskiem widać liczbę osób w zgłoszeniu oraz „wybrany: …” — typ pokoju, który gość wybrał w formularzu.',
            'Licznik „Przydzielono: X / Y” pokazuje, ile zgłoszeń ma wpisany pokój.',
            'Lista pomija zgłoszenia anulowane. Aby zdjąć przydział, wyczyść pole „Nr pokoju” i kliknij „Zapisz”.',
            'Jedno zgłoszenie ma jedno pole numeru. Gdy rodzina zajmuje dwa pokoje, wpisz oba, np. 12 i 13.',
          ] },
        ],
      },
      {
        id: 'zakwaterowanie-zasady',
        title: 'Co ten ekran robi, a czego nie',
        blocks: [
          { type: 'table', head: ['Pytanie', 'Odpowiedź'], rows: [
            ['Gdzie widać wpisany numer?', 'W Recepcji: na liście i na karcie zgłoszenia, razem z komentarzem. Gdy pole jest puste, Recepcja pokazuje „bez przydziału”.'],
            ['Czy gość dostaje wiadomość?', 'Nie. System nie wysyła maila po wpisaniu numeru i nie pokazuje numeru pokoju na stronie zgłoszenia gościa.'],
            ['Czy system pilnuje, żeby numer się nie powtórzył?', 'Nie. To zwykłe pole tekstowe: ten sam numer można wpisać przy kilku zgłoszeniach i nikt nie sprawdza liczby miejsc w pokoju.'],
            ['Czym to się różni od typu pokoju?', 'Typ pokoju (np. pokój dla małżeństwa) gość wybiera w formularzu, a jego cenę i limit ustawiasz w evencie. Typ zmienisz w „Zgłoszenia” przyciskiem „Zmień pokoje”. Numer konkretnego pokoju wpisuje się tylko tutaj.'],
          ] },
          { type: 'note', tone: 'info', text: 'Panel nie ma listy pokoi ośrodka ani tablicy do przeciągania gości między pokojami. Przydział to wyłącznie numer wpisany przy zgłoszeniu.' },
        ],
      },
    ],
  },

  // ────────────────────────────────────────────────────────────────────────────
  {
    id: 'obecnosc',
    title: 'Obecność',
    intro: 'Lista obecności wybranego eventu w panelu.',
    articles: [
      {
        id: 'obecnosc-lista',
        title: 'Odprawianie gości w panelu',
        blocks: [
          { type: 'steps', items: [
            'Wejdź w „Obecność” i wybierz wydarzenie z listy „Event:”.',
            'Znajdź osobę. Pole „Szukaj uczestnika...” szuka po imieniu, nazwisku i adresie e-mail zgłaszającego.',
            'Kliknij „Odpraw”. Przy zgłoszeniu pojawi się znacznik „Obecny”.',
            'Pomyłkę poprawia przycisk „Cofnij” — znacznik wraca na „Nieobecny”. Panel nie pyta tu o potwierdzenie.',
          ] },
          { type: 'list', items: [
            'Obecność dotyczy całego zgłoszenia, czyli wszystkich osób, które ono obejmuje. Nie da się odprawić pojedynczej osoby z rodziny.',
            'Kafel u góry pokazuje: „zgłoszeń obecnych” (odprawione / wszystkie), „osób na miejscu” (osoby z odprawionych zgłoszeń / wszystkie osoby) i pasek „% odprawionych”.',
            'Lista pomija tylko zgłoszenia anulowane. Zgłoszenia z listy rezerwowej i nieopłacone są na liście.',
            'Ekran nie odświeża się sam. Gdy równolegle pracuje Recepcja, przełącz event albo wejdź na ekran ponownie, żeby zobaczyć aktualny stan.',
          ] },
        ],
      },
      {
        id: 'obecnosc-a-recepcja',
        title: 'Obecność w panelu a Recepcja',
        blocks: [
          { type: 'p', text: 'To jedno i to samo oznaczenie: „Odpraw” w panelu i „Oznacz przyjazd” w Recepcji zapisują przyjazd tego samego zgłoszenia. Wystarczy zrobić to w jednym miejscu.' },
          { type: 'list', items: [
            'W dniu przyjazdu wygodniejsza jest Recepcja: działa na telefonie, pokazuje dopłatę, pokój, klucz i prośby.',
            'Działania w Recepcji trafiają do dziennika („Recepcja” ▸ „Dziennik działań”). Kliknięcia „Odpraw” i „Cofnij” w tej zakładce nie są w dzienniku zapisywane.',
            'Zakładka „Obecność” przydaje się do szybkiej korekty i do sprawdzenia frekwencji po wydarzeniu.',
          ] },
          { type: 'note', tone: 'info', text: 'Panel nie ma osobnych list obecności dla spotkań cyklicznych (np. cotygodniowych spotkań wspólnoty) ani samodzielnego zgłaszania obecności przez gości kodem QR. Obecność działa tylko dla zgłoszeń na eventy.' },
        ],
      },
    ],
  },

  // ────────────────────────────────────────────────────────────────────────────
  {
    id: 'formacja',
    title: 'Formacja online',
    intro: 'Kursy z filmami i plikami PDF, dostęp kursantów, postępy i strona kursanta.',
    articles: [
      {
        id: 'formacja-przeglad',
        title: 'Jak to działa w skrócie',
        blocks: [
          { type: 'list', items: [
            'Każdy kurs ma własną stronę pod adresem `https://icpemission.pl/formacja/<adres-kursu>`. Kursant loguje się tam adresem e-mail i hasłem.',
            'Kurs składa się z materiałów: filmów i plików PDF. Materiały można pogrupować w moduły.',
            'Dostęp dostają uczestnicy wskazanych eventów (automatycznie) oraz osoby dodane ręcznie.',
            'Może działać wiele kursów jednocześnie. Jedna osoba ma jedno konto i jedno hasło do wszystkich swoich kursów.',
          ] },
          { type: 'table', head: ['Status kursu', 'Znaczenie'], rows: [
            ['„Szkic”', 'Strona kursu jeszcze nie działa, maile do kursantów nie wychodzą. Można spokojnie wgrywać materiały i dodawać osoby.'],
            ['„Opublikowany”', 'Kursanci mogą się logować i oglądać materiały.'],
            ['„Zarchiwizowany”', 'Strona kursu pokazuje informację o zakończeniu, logowanie jest zablokowane.'],
          ] },
          { type: 'p', text: 'Na liście kursów przy każdym kursie widać liczbę materiałów, liczbę kursantów i zajęte miejsce. „Otwórz” otwiera stronę kursu od razu zalogowaną jako Ty — działa także dla szkicu.' },
        ],
      },
      {
        id: 'formacja-nowy-kurs',
        title: 'Nowy kurs',
        blocks: [
          { type: 'steps', items: [
            '„Formacja online” ▸ „Nowy kurs”.',
            'Wpisz „Nazwa kursu (PL)” i, jeśli chcesz, „Nazwa (EN, opcjonalnie)”.',
            'Sprawdź pole „Adres kursu”. Tworzy się z nazwy i można go zmienić; pod polem widać pełny adres albo powód, dla którego adres jest niedozwolony.',
            'Kliknij „Utwórz kurs”. Kurs powstaje jako szkic i od razu otwiera się jego edycja.',
          ] },
          { type: 'p', text: 'Edycja kursu ma cztery zakładki: „Zawartość”, „Kursanci”, „Aktywność” i „Ustawienia”. Do listy wraca się linkiem „Wszystkie kursy”. Przycisk „Podgląd jako kursant” pokazuje stronę kursu tak, jak widzi ją kursant (także szkic); Twoje wejścia nie liczą się w „Aktywność”.' },
        ],
      },
      {
        id: 'formacja-filmy',
        title: 'Dodawanie filmów',
        blocks: [
          { type: 'steps', items: [
            'Edycja kursu ▸ zakładka „Zawartość” ▸ ramka „Dodaj film”.',
            'Wpisz „Tytuł filmu (PL)” i opcjonalnie „Tytuł filmu (EN, opcjonalnie)”.',
            'Jeśli kurs ma moduły, wybierz właściwy w polu „Moduł” (domyślnie ostatni).',
            'Pole „Publikacja” zostaw puste, żeby film był widoczny od razu, albo ustaw datę i godzinę — patrz „Publikacja materiału z datą”.',
            'Wybierz plik. Panel sprawdzi, czy przeglądarka potrafi go odtworzyć, i pokaże długość.',
            'Kliknij „Wyślij film” i poczekaj na znacznik „Gotowy”.',
          ] },
          { type: 'list', items: [
            'Najlepszy format to MP4 (H.264), 720p lub 1080p. Filmy z iPhone’a w formacie HEVC / H.265 zwykle się nie odtwarzają — wyeksportuj je najpierw do MP4.',
            'Podczas wysyłki możesz przechodzić między ekranami panelu, ale nie zamykaj i nie odświeżaj karty przeglądarki.',
            'Przerwaną wysyłkę wznowisz: kliknij ikonę wysyłania przy filmie i wybierz ten sam plik — wyślą się tylko brakujące części.',
            'Plik filmu podmienisz tą samą ikoną („Podmień plik filmu”). Do końca wysyłki kursanci oglądają starą wersję.',
            'Ikona „Sprawdź odtwarzanie” przy filmie testuje, czy plik da się odtworzyć.',
            'Jeśli wysyłka kończy się błędem ustawień, użyj „Napraw ustawienia wysyłki (CORS)” na liście kursów albo „Napraw ustawienia wysyłki” przy filmie i spróbuj ponownie.',
          ] },
          { type: 'note', tone: 'warn', text: 'Gdy na liście kursów widać ostrzeżenie „Hosting wideo (Cloudflare R2) nie jest jeszcze skonfigurowany”, filmów nie da się wysyłać. Pliki PDF, moduły i kursantów można dodawać normalnie. Konfigurację hostingu ustawia się na Renderze.' },
        ],
      },
      {
        id: 'formacja-pdf',
        title: 'Dodawanie plików PDF',
        blocks: [
          { type: 'steps', items: [
            'Zakładka „Zawartość” ▸ ramka „Dodaj PDF”.',
            'Wpisz „Tytuł materiału (PL)” i opcjonalnie tytuł angielski.',
            'Wybierz moduł i ewentualną datę w polu „Publikacja”.',
            'Wskaż „Plik PDF — wersja polska” i, jeśli jest, „Plik PDF — wersja angielska (opcjonalnie)”.',
            'Kliknij „Wyślij PDF”.',
          ] },
          { type: 'list', items: [
            'Limit to 25 MB na plik.',
            'Kursant dostaje wersję w języku swojej strony (PL / EN), a gdy jej brak — tę drugą.',
            'Przy materiale na liście są wiersze obu wersji językowych z przyciskami „Zamień”, „Dodaj …” i „Usuń” — wersję angielską można dołożyć później.',
          ] },
        ],
      },
      {
        id: 'formacja-lista-materialow',
        title: 'Kolejność, ukrywanie i usuwanie materiałów',
        blocks: [
          { type: 'list', items: [
            'Kursanci widzą materiały w tej kolejności, co Ty. Kolejność zmieniasz strzałkami „W górę” / „W dół” albo przeciągając wiersz myszką — także między modułami.',
            'Ołówek („Edytuj tytuł”) otwiera tytuły i krótkie opisy w PL i EN oraz pole „Publikacja”. Moduł materiału zmieniasz listą „Moduł” w jego wierszu.',
            'Oko ukrywa materiał przed kursantami („Ukryj przed kursantami”) albo pokazuje go z powrotem („Pokaż kursantom”). Ukryty materiał nie jest wymagany do ukończenia modułu.',
            'Kosz („Usuń”) usuwa materiał po potwierdzeniu. Plik filmu jest wtedy usuwany także z hostingu — tego nie da się cofnąć.',
            'Dopisek „brak tytułu EN” przypomina o brakującym tłumaczeniu.',
          ] },
        ],
      },
      {
        id: 'formacja-moduly',
        title: 'Moduły i tryb sekwencyjny',
        blocks: [
          { type: 'p', text: 'Moduł grupuje materiały, np. „Konferencja 1” = film i notatki PDF.' },
          { type: 'steps', items: [
            'Zakładka „Zawartość” ▸ „Dodaj moduł”.',
            'Wpisz „Nazwa modułu (PL)” (opcjonalnie EN) i kliknij „Dodaj moduł”. Moduł pojawi się na końcu listy.',
            'Przypisz materiały: polem „Moduł” przy dodawaniu, listą „Moduł” w wierszu materiału albo przeciągając wiersz do modułu.',
          ] },
          { type: 'list', items: [
            'Strzałki „Moduł wyżej” / „Moduł niżej” zmieniają kolejność modułów, ołówek zmienia nazwę i krótki opis.',
            'Usunięcie modułu nie usuwa jego materiałów — trafiają do grupy „Materiały bez modułu”.',
            '„Materiały bez modułu” są zawsze dostępne dla kursanta, niezależnie od kolejności modułów.',
            'Gdy tytuły filmów zawierają numery (np. „Konferencja 2 …”), panel proponuje automatyczny podział: „Pokaż podział” ▸ sprawdź podgląd ▸ przycisk „Utwórz …” z liczbą modułów. Pliki zostają, zmienia się tylko grupowanie.',
          ] },
          { type: 'p', text: 'Tryb sekwencyjny włączasz w zakładce „Ustawienia” ▸ „Kolejność przechodzenia”: zaznacz „Tryb sekwencyjny” i kliknij „Zapisz ustawienia”. Kursant widzi wtedy kolejny moduł dopiero po ukończeniu poprzedniego.' },
          { type: 'list', items: [
            'Materiał jest ukończony, gdy kursant obejrzy film w 90%, otworzy PDF albo kliknie „Oznaczam jako ukończone”.',
            'Moduł jest ukończony, gdy ukończono wszystkie jego widoczne materiały.',
            'Pierwszy moduł i materiały bez modułu są dostępne od razu. Z zablokowanych kursant widzi tylko nazwę najbliższego.',
            'Moduł bez żadnego widocznego materiału (np. wszystko zaplanowane na później) blokuje kolejne, dopóki coś się w nim nie pojawi.',
            'W kursie bez modułów tryb sekwencyjny niczego nie zmienia.',
          ] },
        ],
      },
      {
        id: 'formacja-publikacja-z-data',
        title: 'Publikacja materiału z datą',
        blocks: [
          { type: 'p', text: 'Pole „Publikacja” przy filmie i pliku PDF pozwala wgrać materiał wcześniej i pokazać go kursantom w wybranym dniu i o wybranej godzinie.' },
          { type: 'list', items: [
            'Puste pole = materiał widoczny od razu.',
            'Data w przyszłości = materiał pojawi się sam, a kursanci dostaną wtedy mail „Nowe materiały czekają na Ciebie”.',
            'Na liście taki materiał ma znacznik „Zaplanowany: …”. Po publikacji znacznik zmienia się w „opublikowany …” z liczbą wysłanych maili.',
            'Link „publikuj od razu” czyści datę.',
            'Dopóki kurs jest szkicem, maile o nowych materiałach nie wychodzą — są wysyłane tylko dla kursu opublikowanego.',
          ] },
        ],
      },
      {
        id: 'formacja-publikacja-kursu',
        title: 'Publikacja, zakończenie i usunięcie kursu',
        blocks: [
          { type: 'steps', items: [
            'Sprawdź kurs przyciskiem „Podgląd jako kursant”.',
            'Kliknij „Opublikuj kurs” u góry edycji kursu.',
            'Potwierdź. Okno pokazuje, ile osób dostanie mail powitalny.',
            'Poczekaj 1–3 minuty — tyle trwa przebudowa strony, zanim adres kursu zacznie działać w pełnej wersji.',
          ] },
          { type: 'list', items: [
            'Mail powitalny zawiera link do ustawienia hasła. Osoby dodane do szkicu dostają go dopiero w chwili publikacji („… powitań czeka na publikację”).',
            '„Kopiuj link dla kursantów” kopiuje adres kursu z ekranem logowania.',
            'W „Ustawienia” ▸ „Publikacja” są przyciski stanu kursu. „Zakończ (archiwizuj)” zamyka kurs: strona pokazuje informację o zakończeniu, logowanie jest zablokowane. „Opublikuj ponownie” go przywraca.',
            '„Cofnij do szkicu” wyłącza stronę kursu bez usuwania czegokolwiek.',
            'Przyciski w „Ustawienia” ▸ „Publikacja” działają od razu, bez pytania o potwierdzenie.',
            'Nazwę, opis i adres kursu zmieniasz w „Ustawienia” ▸ „Nazwa, opis i adres” i zatwierdzasz przyciskiem „Zapisz ustawienia”. Po zmianie adresu opublikowanego kursu stary adres przekierowuje na nowy.',
          ] },
          { type: 'note', tone: 'err', text: '„Usuń kurs” jest nieodwracalne: znikają materiały (także filmy z hostingu) i dostęp wszystkich kursantów. Panel prosi o wpisanie adresu kursu dla potwierdzenia.' },
        ],
      },
      {
        id: 'formacja-dostep-z-eventu',
        title: 'Dostęp automatyczny z eventu',
        blocks: [
          { type: 'steps', items: [
            'Edycja kursu ▸ „Ustawienia” ▸ „Kto ma dostęp automatycznie”.',
            'Zaznacz eventy, których uczestnicy mają dostać kurs.',
            'Wybierz „Dostęp od:” — od „potwierdzenia zgłoszenia” (opłacone lub zatwierdzone przez administratora) albo od „samego zapisu” (także zgłoszenia czekające na płatność; dobre dla kursu bezpłatnego).',
            'Opcjonalnie ustaw „Dostęp wygasa (opcjonalnie)” — po tym dniu dostęp kończy się wszystkim kursantom.',
            'Kliknij „Zapisz ustawienia”.',
          ] },
          { type: 'list', items: [
            'Dostęp nadaje się sam, gdy zgłoszenie spełni warunek. Konto zakłada się na adres e-mail zgłaszającego.',
            'Anulowanie zgłoszenia odbiera dostęp nadany z eventu (na liście kursantów: „Zgłoszenie anulowane”).',
            'Dostęp osób dodanych ręcznie nigdy nie jest odbierany automatycznie.',
            'Przycisk „Synchronizuj z eventami” w zakładce „Kursanci” sprawdza od nowa wszystkie zgłoszenia powiązanych eventów — użyj go po zaznaczeniu eventu, który ma już zgłoszenia.',
          ] },
        ],
      },
      {
        id: 'formacja-kursanci',
        title: 'Kursanci: dodawanie, hasła, odbieranie dostępu',
        blocks: [
          { type: 'steps', items: [
            'Edycja kursu ▸ zakładka „Kursanci” ▸ „Dodaj osobę”.',
            'Wpisz „E-mail”, „Imię”, „Nazwisko” i wybierz „Język maili”.',
            'Zostaw zaznaczone „Wyślij mail powitalny” albo je odznacz, a potem zatwierdź formularz.',
          ] },
          { type: 'list', items: [
            '„Importuj listę” przyjmuje do 500 osób naraz, jedna w linii: `e-mail; imię; nazwisko` (średnik, przecinek albo tabulator — można wkleić kolumny z Excela). Po imporcie panel podaje, ile osób dodano, ile już miało dostęp i które wiersze pominięto.',
            'Kolumna „Źródło”: „Z eventu” albo „Ręcznie”. Kolumna „Konto”: „Hasło ustawione”, „Zaproszony …” albo „Powitanie niewysłane”.',
            'Ikona klucza otwiera hasło: „Wyślij link” (mail z linkiem ważnym 48 godzin) albo „Ustaw hasło ręcznie” (co najmniej 8 znaków) — gdy kursant nie odbiera maili. Ustawione hasło widać tylko raz i działa we wszystkich kursach tej osoby.',
            'Ikona koperty wysyła ponownie mail powitalny osobie, która nie ustawiła jeszcze hasła.',
            'Ikona „Odbierz dostęp” blokuje kursanta (z pytaniem o potwierdzenie), „Przywróć dostęp” go oddaje.',
            'Komunikat „NIE wysłany — poczta wyłączona” albo „błąd wysyłki” oznacza problem z pocztą systemu: sprawdź „Ustawienia” ▸ „E-mail”.',
            'W kursie będącym szkicem dodane osoby dostaną mail powitalny dopiero po publikacji kursu.',
          ] },
        ],
      },
      {
        id: 'formacja-absolwenci',
        title: 'Absolwenci',
        blocks: [
          { type: 'p', text: 'Zakładka „Kursanci” ma dwie listy: „Bieżący” i „Absolwenci”. Przeniesienie do absolwentów porządkuje listę — dostęp do materiałów zostaje.' },
          { type: 'list', items: [
            'Ikona czapki absolwenta przy osobie przenosi ją do absolwentów. Jeśli nie ukończyła kursu, panel zapyta o potwierdzenie.',
            '„Przenieś do absolwentów wszystkich, którzy ukończyli kurs (liczba)” robi to zbiorczo.',
            '„Przywróć do bieżących kursantów” cofa przeniesienie.',
            'Jeśli absolwenci mają stracić dostęp, odbierz go pojedynczo albo ustaw datę „Dostęp wygasa” w ustawieniach kursu.',
          ] },
        ],
      },
      {
        id: 'formacja-aktywnosc',
        title: 'Postępy kursantów',
        blocks: [
          { type: 'p', text: 'Zakładka „Aktywność” pokazuje tabelę „Postępy kursantów”: kursant w wierszu, materiały w kolumnach.' },
          { type: 'list', items: [
            'Przy filmie widać procent obejrzenia. Liczą się tylko fragmenty obejrzane po raz pierwszy — przewijanie i powtórki nie zawyżają wyniku. Film „obejrzany” to co najmniej 90%.',
            'Znak ✓ oznacza materiał ukończony; dopisek „ręcznie” — że kursant sam kliknął „Oznaczam jako ukończone”.',
            'Przy pliku PDF widać, czy został otwarty lub pobrany.',
            'Kolumna „Moduły” (gdy kurs ma moduły) pokazuje ukończone moduły.',
            'Kliknięcie kursanta rozwija jego historię. Pod adresem widać liczbę logowań albo „nie ustawił(a) hasła”.',
            '„tylko z dostępem” ukrywa osoby z odebranym dostępem. „CSV” pobiera tabelę do arkusza.',
          ] },
        ],
      },
      {
        id: 'formacja-kursant',
        title: 'Co widzi kursant',
        blocks: [
          { type: 'steps', items: [
            'Dostaje mail powitalny z linkiem „Ustaw hasło” i ustawia własne hasło.',
            'Wchodzi na adres kursu i loguje się adresem e-mail oraz hasłem („Zaloguj się”).',
            'Ogląda filmy i otwiera lub pobiera pliki PDF.',
            'W trybie sekwencyjnym kolejny moduł odblokowuje się po ukończeniu poprzedniego; materiał może też zamknąć przyciskiem „Oznaczam jako ukończone”.',
          ] },
          { type: 'list', items: [
            'Zapomniane hasło kursant odzyskuje sam linkiem „Nie pamiętam hasła” na stronie kursu.',
            'Osoba, która ma już konto z innego kursu, używa tego samego hasła.',
            'Gdy film nie ma jeszcze pliku, kursant widzi „Film będzie wkrótce dostępny”.',
            'Strona kursu działa po polsku i po angielsku.',
            'Osoba z odebranym albo wygasłym dostępem nie otworzy materiałów kursu.',
          ] },
        ],
      },
      {
        id: 'formacja-miejsce',
        title: 'Zajęte miejsce na pliki',
        blocks: [
          { type: 'list', items: [
            'Pasek „Filmy w Cloudflare R2: … z 10 GB darmowych” na liście kursów sumuje filmy wszystkich kursów. Zmienia kolor na ostrzegawczy od 70% i na czerwony od 90%.',
            'Pliki PDF są liczone osobno („PDF-y (w bazie danych)”).',
            'W zakładce „Zawartość” jest podsumowanie plików jednego kursu.',
            'Miejsce zwalnia usunięcie filmu albo podmiana na mniejszy plik. Do kursu zwykle wystarcza 720p–1080p.',
          ] },
        ],
      },
    ],
  },

  // ────────────────────────────────────────────────────────────────────────────
  {
    id: 'ustawienia',
    title: 'Ustawienia',
    intro: 'Motyw, konto, poczta systemu i podgląd płatności online.',
    articles: [
      {
        id: 'ustawienia-przeglad',
        title: 'Co jest w „Ustawieniach”',
        blocks: [
          { type: 'table', head: ['Część', 'Co zawiera'], rows: [
            ['„Wygląd”', 'Przełącznik „Motyw”: „Jasny” albo „Ciemny”. Dotyczy tylko Twojej przeglądarki.'],
            ['„Konto”', 'Adres zalogowanego administratora i przycisk „Wyloguj”.'],
            ['„E-mail”', 'Stan poczty systemu, mail testowy i lista ostatnich wysyłek. Patrz następna instrukcja.'],
            ['„Płatności online”', 'Podgląd konfiguracji Tpay. Patrz „Gdzie sprawdzić stan płatności online” w sekcji o Tpay.'],
            ['„System”', '„Adres API” — adres serwera, z którym łączy się panel. Tylko do odczytu.'],
          ] },
          { type: 'note', tone: 'info', text: 'W „Ustawieniach” niczego nie konfiguruje się na stałe poza motywem. Klucze poczty i płatności oraz adres nadawcy ustawia się na Renderze, w usłudze `icpe-api` ▸ Environment. Panel pokazuje tylko, czy są ustawione.' },
        ],
      },
      {
        id: 'ustawienia-poczta',
        title: 'Poczta: stan, mail testowy, ostatnie wysyłki',
        blocks: [
          { type: 'p', text: 'Część „E-mail” odpowiada na pytanie, czy system naprawdę wysyła maile.' },
          { type: 'table', head: ['Wiersz', 'Znaczenie'], rows: [
            ['„Dostawca:”', 'Usługa, która wysyła maile, z końcówką klucza albo nazwą serwera. „Wyłączona (tylko log)” oznacza, że maile NIE wychodzą.'],
            ['„Nadawca:”', 'Adres, z którego goście dostają wiadomości.'],
            ['„Odpowiedzi na:”', 'Adres, na który trafiają odpowiedzi gości oraz alerty do organizatora. Wiersz jest widoczny tylko wtedy, gdy taki adres ustawiono.'],
          ] },
          { type: 'steps', items: [
            'W polu pod „Mail testowy” wpisz swój adres.',
            'Kliknij „Wyślij test”.',
            'Przeczytaj wynik: „Wysłano na … przez …” — sprawdź skrzynkę, także SPAM; „Wysyłka jest wyłączona” — brak klucza poczty na serwerze; „Dostawca odrzucił wysyłkę: …” — treść błędu od dostawcy.',
          ] },
          { type: 'list', items: [
            'Lista „Ostatnie maile” pokazuje rodzaj wiadomości, adresata, datę i status: „Wysłany”, „Błąd” (z treścią błędu) albo „Nie wysłany” (poczta wyłączona).',
            'Przycisk „Odśwież” wczytuje stan i listę ponownie.',
            'Rozwijana instrukcja „Jak podłączyć Resend” na dole opisuje podłączenie dostawcy poczty krok po kroku.',
            'Gdy poczta jest wyłączona, nie wychodzą potwierdzenia zgłoszeń, zaproszenia, przypomnienia o ratach ani maile kursowe — zgłoszenia i wpłaty zapisują się normalnie.',
          ] },
          { type: 'note', tone: 'warn', text: 'Po każdej zmianie ustawień poczty na Renderze wyślij mail testowy. To jedyny pewny sposób sprawdzenia, czy goście dostaną wiadomości.' },
        ],
      },
    ],
  },

  // ────────────────────────────────────────────────────────────────────────────
  {
    id: 'tpay',
    title: 'Tpay — konfiguracja i tryb testowy',
    articles: [
      {
        id: 'tpay-stan',
        title: 'Gdzie sprawdzić stan płatności online',
        blocks: [
          { type: 'steps', items: [
            'Wejdź w „Ustawienia” i znajdź kafel „Płatności online”.',
            'Sprawdź „Tryb” (Tpay albo wyłączone) i „Środowisko” (produkcja albo sandbox).',
            'Opis „gotowe — goście z Polski widzą płatność online” oznacza poprawną konfigurację.',
            'Lista poniżej pokazuje, czy każdy klucz jest ustawiony (tylko tak lub nie — panel nigdy nie pokazuje wartości).',
            'Na dole jest „Adres powiadomień” z przyciskiem „Kopiuj”.',
          ] },
          { type: 'note', tone: 'err', text: 'Ostrzeżenie „TPAY_ALLOW_TEST_MODE jest włączone na produkcji” oznacza, że system przyjmuje testowe wpłaty: potwierdzają zgłoszenia, choć pieniądze nie wpływają. Przed prawdziwymi zapisami trzeba to wyłączyć.' },
        ],
      },
      {
        id: 'tpay-zmienne',
        title: 'Zmienne środowiskowe na Renderze',
        blocks: [
          { type: 'p', text: 'Ustawiasz je w Render ▸ usługa `icpe-api` ▸ Environment. Wartości wpisuje się wyłącznie tam.' },
          { type: 'table', head: ['Nazwa', 'Znaczenie'], rows: [
            ['`PAYMENTS_MODE`', '`tpay` włącza płatności online, `mock` je wyłącza.'],
            ['`TPAY_ENV`', '`production` — prawdziwe płatności, `sandbox` — środowisko testowe Tpay.'],
            ['`TPAY_CLIENT_ID`', 'Identyfikator klucza Open API z panelu Tpay (tajny).'],
            ['`TPAY_CLIENT_SECRET`', 'Sekret klucza Open API (tajny).'],
            ['`TPAY_MERCHANT_ID`', 'Numer sprzedawcy; system porównuje go z powiadomieniami.'],
            ['`TPAY_SECURITY_CODE`', 'Kod bezpieczeństwa z panelu Tpay, do sprawdzania powiadomień (tajny).'],
            ['`API_PUBLIC_URL`', 'Publiczny adres API (https, bez ukośnika na końcu). Z niego powstaje adres powiadomień.'],
            ['`TPAY_ALLOW_TEST_MODE`', '`true` pozwala przyjmować testowe wpłaty na koncie produkcyjnym. Na czas prawdziwych zapisów: `false`.'],
            ['`TPAY_ROOT_CA_PEM` / `TPAY_ROOT_CA_FILE`', 'Opcjonalne. Bez nich certyfikat Tpay pobiera się sam z oficjalnego adresu.'],
          ] },
          { type: 'p', text: 'Adres powiadomień ma postać `<adres API>/payments/webhook/tpay`. Skopiuj go z kafla „Płatności online” i wklej w panelu Tpay ▸ Ustawienia ▸ Powiadomienia.' },
          { type: 'note', tone: 'warn', text: 'Po każdym wdrożeniu sprawdź w Renderze, że `PAYMENTS_MODE` nadal istnieje i ma właściwą wartość.' },
        ],
      },
      {
        id: 'tpay-lista-kontrolna',
        title: 'Lista kontrolna przed startem prawdziwych zapisów',
        blocks: [
          { type: 'steps', items: [
            'W panelu Tpay wyłącz tryb testowy konta.',
            'W Render ▸ `icpe-api` ▸ Environment ustaw `TPAY_ALLOW_TEST_MODE=false` i zapisz.',
            'W „Ustawienia” ▸ „Płatności online” kliknij „Odśwież” i sprawdź: środowisko „produkcja”, brak ostrzeżenia o trybie testowym, `TPAY_ALLOW_TEST_MODE` = false, opis „gotowe”.',
            'Usuń dane testowe z eventu testowego `test-platnosci-tpay`: w „Zgłoszenia” anuluj każde testowe zgłoszenie („Anuluj zgłoszenie”), potem w zakładce „Anulowane” otwórz je i kliknij „Usuń trwale” (wpisz USUŃ). Wpłaty testowe znikają razem ze zgłoszeniem.',
            'Jeśli wpłata ze znacznikiem TEST trafiła do prawdziwego zgłoszenia, usuń samą wpłatę: „Płatności” ▸ „Wpłaty” ▸ „Usuń wpłatę testową”. Sprawdź potem status zgłoszenia.',
            'Zamknij event testowy („Eventy” ▸ „Zamknij”) i schowaj go przyciskiem „Archiwizuj”.',
            'W prawdziwym evencie sprawdź: zaznaczone „Płatność online”, waluta PLN, brak ostrzeżenia pod tym polem, wypełnione „Dane do przelewu”, poprawny harmonogram wpłat.',
            'Zrób jedną próbną, prawdziwą wpłatę na małą kwotę i sprawdź, czy pojawiła się w „Płatności” bez znacznika TEST.',
          ] },
          { type: 'note', tone: 'info', text: 'Wpłaty testowej nie trzeba zwracać — pieniądze nie wpłynęły; usuwa się ją („Usuń wpłatę testową”) albo razem z całym zgłoszeniem testowym („Usuń trwale”). Prawdziwych wpłat i zgłoszeń z prawdziwymi wpłatami usunąć się nie da.' },
        ],
      },
      {
        id: 'tpay-awaryjne-wylaczenie',
        title: 'Awaryjne wyłączenie płatności online',
        blocks: [
          { type: 'steps', items: [
            'Render ▸ `icpe-api` ▸ Environment.',
            'Ustaw `PAYMENTS_MODE=mock` i zapisz.',
            'Gdy API uruchomi się ponownie, w „Ustawienia” ▸ „Płatności online” sprawdź, że tryb to „wyłączone (mock)”.',
          ] },
          { type: 'p', text: 'Po wyłączeniu karta „Płatność online” znika z formularza, a goście płacą przelewem. Wydarzenie, które miało tylko płatność online, awaryjnie pokaże przelew — upewnij się, że ma wypełnione „Dane do przelewu”.' },
          { type: 'p', text: 'Łagodniejszy sposób dla jednego wydarzenia: odznacz „Płatność online” w „Edytuj” ▸ „Metody płatności” i zapisz.' },
        ],
      },
    ],
  },

  // ────────────────────────────────────────────────────────────────────────────
  {
    id: 'wdrazanie',
    title: 'Wdrażanie zmian',
    articles: [
      {
        id: 'wdrazanie-po-pushu',
        title: 'Co się dzieje po wysłaniu zmian (git push)',
        blocks: [
          { type: 'list', items: [
            'Panel i strony zapisów (usługa `icpe-frontend` na Renderze) wdrażają się same.',
            'API (usługa `icpe-api`) NIE wdraża się samo. Po zmianach w API trzeba wejść w Render ▸ `icpe-api` i kliknąć „Manual Deploy”.',
            'Jeśli zmiana dotyczy i panelu, i API — najpierw wdróż API, potem sprawdzaj panel. Dopóki API jest w starej wersji, nowe funkcje w panelu mogą pokazywać błąd albo niczego nie zapisywać.',
            'Nowe pola w bazie danych dodają się same przy starcie API.',
          ] },
        ],
      },
      {
        id: 'wdrazanie-nowa-wersja-panelu',
        title: 'Baner „Dostępna jest nowa wersja panelu”',
        blocks: [
          { type: 'p', text: 'Panel co kilka minut i przy powrocie do karty sprawdza, czy na serwerze nie ma nowszej wersji. Jeśli jest, u góry pojawia się baner „Dostępna jest nowa wersja panelu — odśwież stronę przed zapisaniem zmian”. Baneru nie da się zamknąć.' },
          { type: 'steps', items: [
            'Jeśli masz otwarty formularz z niezapisanymi zmianami — zanotuj je.',
            'Kliknij „Odśwież” w banerze (albo Ctrl+R / Cmd+R).',
            'Wprowadź zmiany ponownie i zapisz.',
          ] },
          { type: 'list', items: [
            'Dopóki nie odświeżysz, przyciski zapisu w „Edytuj event”, kreatorze i „Edytuj zgłoszenie” są zablokowane.',
            'Powód: formularz wydarzenia zapisuje cały cennik. Karta otwarta przed wdrożeniem nie zna nowych pól i zapisem mogłaby je skasować — tak 25–26.11.2026 zniknęły poziomy cen jednego wydarzenia.',
            'Drugie zabezpieczenie jest w API: zapis cennika z karty w starej wersji jest odrzucany z komunikatem o odświeżeniu, a nic nie zostaje zapisane.',
            'Komunikat „Ustawienia tego eventu zostały w międzyczasie zmienione” oznacza, że ktoś inny (albo Ty w innej karcie) zapisał wydarzenie po tym, jak otworzyłeś formularz. Odśwież stronę i wprowadź zmiany ponownie.',
            'Jeśli mimo wszystko coś zniknęło z cennika: „Edytuj” ▸ „Historia zmian cennika” ▸ „Przywróć”.',
          ] },
          { type: 'note', tone: 'info', text: 'Dobra praktyka: nie zostawiaj formularza „Edytuj event” otwartego na wiele godzin. Otwórz, zmień, zapisz.' },
        ],
      },
      {
        id: 'wdrazanie-wolne-api',
        title: 'Pierwsze wejście po przerwie bywa wolne',
        blocks: [
          { type: 'p', text: 'Po dłuższej przerwie w ruchu pierwsze żądanie do API może trwać dłużej niż zwykle — panel przez chwilę pokazuje „Ładowanie...”. Poczekaj i w razie potrzeby odśwież stronę; kolejne wejścia są już szybkie.' },
        ],
      },
    ],
  },

  // ────────────────────────────────────────────────────────────────────────────
  {
    id: 'bezpieczenstwo',
    title: 'Bezpieczeństwo i dobre praktyki',
    articles: [
      {
        id: 'bezpieczenstwo-dostepy',
        title: 'Kto ma jaki dostęp',
        blocks: [
          { type: 'table', head: ['Rola', 'Dostęp'], rows: [
            ['Administrator', 'Cały panel: eventy, zgłoszenia, płatności, zakwaterowanie, obecność, formacja online, ustawienia. W Recepcji wszystkie uprawnienia do każdego wydarzenia, w tym cofanie wpłat.'],
            ['Pomocnik eventu', 'Tylko Recepcja, tylko wskazane wydarzenie, tylko nadane zakresy. Bez wstępu do panelu.'],
            ['Gość', 'Własne zgłoszenie przez osobisty link z maila.'],
          ] },
          { type: 'p', text: 'Sesja administratora trwa 12 godzin, a z zaznaczonym „Zapamiętaj mnie na tym urządzeniu” 30 dni i przedłuża się przy korzystaniu. Sesja pomocnika zawsze 12 godzin.' },
        ],
      },
      {
        id: 'bezpieczenstwo-zasady',
        title: 'Zasady, których warto się trzymać',
        blocks: [
          { type: 'list', items: [
            'Nie udostępniaj swojego hasła administratora. Komuś, kto ma tylko pomagać na miejscu, nadaj dostęp pomocnika.',
            'Każdy pomocnik dostaje własne konto na własny adres e-mail — nie twórz jednego wspólnego.',
            'Nadawaj tylko potrzebne zakresy. Zakres „Wpłaty” daj wyłącznie osobom, które faktycznie przyjmują pieniądze.',
            'Ustawiaj „Dostęp do dnia” na ostatni dzień wydarzenia albo odbieraj dostęp po jego zakończeniu.',
            'Hasło tymczasowe przekazuj osobiście lub telefonicznie, nie mailem ani w grupowej rozmowie.',
            'Nie zaznaczaj „Zapamiętaj mnie” na cudzym komputerze. Po pracy na wspólnym urządzeniu wyloguj się.',
            'Kluczy i sekretów (Tpay, poczta, baza) nie wklejaj do rozmów, maili ani do repozytorium. Wpisuje się je tylko w Renderze, w ustawieniach usługi.',
            'Ukryty event nie jest chroniony hasłem — kto zna link, ten wejdzie.',
            'Link do strony zgłoszenia (`/z/…`) i link zaproszenia są osobiste. Nie przesyłaj ich dalej.',
            'Kody rabatowe traktuj jak udogodnienie, nie zabezpieczenie.',
          ] },
        ],
      },
    ],
  },

  // ────────────────────────────────────────────────────────────────────────────
  {
    id: 'problemy',
    title: 'Najczęstsze problemy',
    articles: [
      {
        id: 'problemy-recepcja',
        title: 'Recepcja',
        blocks: [
          { type: 'table', head: ['Objaw', 'Co zrobić'], rows: [
            ['Pomocnik widzi „Nieprawidłowy e-mail lub hasło”.', 'Sprawdź adres w sekcji „Pomocnicy (Recepcja)”. Kliknij „Nowe hasło” i przekaż nowe hasło.'],
            ['Pomocnik próbuje wejść do panelu i nie może.', 'To prawidłowe. Pomocnik loguje się tylko na `/recepcja`.'],
            ['„Nie masz dostępu do żadnego wydarzenia” albo „Nie masz dostępu do tego wydarzenia”.', 'Dostęp został odebrany albo wygasł („dostęp wygasł” przy adresie). Zmień datę w „Dostęp do dnia” albo dodaj pomocnika ponownie.'],
            ['Pomocnik nie widzi kwot ani przycisku „Przyjmij wpłatę”.', 'Nie ma zakresu „Wpłaty”. Włącz go w sekcji pomocników.'],
            ['„Kwota jest większa niż pozostało do zapłaty”.', 'Pomocnik nie przyjmie nadpłaty. Nadpłatę księguje administrator.'],
            ['Przy zgłoszeniu jest „bez przydziału” zamiast pokoju.', 'Wpisz pokój w panelu, w zakładce „Zakwaterowanie”.'],
            ['Brak zgłoszenia na liście Recepcji.', 'Recepcja pokazuje tylko zgłoszenia aktywne. Sprawdź w „Zgłoszenia”, czy nie jest anulowane (zakładka „Anulowane”), niedokończone albo na liście rezerwowej.'],
            ['Brak eventu na liście w Recepcji.', 'Event mógł zostać zarchiwizowany. Przywróć go w „Eventy” ▸ „Pokaż zarchiwizowane” ▸ „Przywróć z archiwum”.'],
            ['Żółty baner „Brak połączenia z internetem”.', 'Zmiany się nie zapisują. Poczekaj na powrót sieci — lista odświeży się sama.'],
            ['Recepcja wraca do ekranu logowania.', 'Minęło 12 godzin albo nadano nowe hasło. Zaloguj się jeszcze raz.'],
          ] },
        ],
      },
      {
        id: 'problemy-platnosci',
        title: 'Płatności i Tpay',
        blocks: [
          { type: 'table', head: ['Objaw', 'Co zrobić'], rows: [
            ['Gość nie widzi płatności online.', 'Sprawdź po kolei: „Płatność online” zaznaczona w evencie, waluta PLN, stan w „Ustawienia” ▸ „Płatności online”, kraj zamieszkania gościa (Polska) w szczegółach zgłoszenia.'],
            ['Gość z Polski ma w zgłoszeniu inny kraj i nie widzi płatności online.', 'W „Edytuj zgłoszenie” ustaw „Kraj zamieszkania” na Polskę. Gość zapłaci ze swojej strony zgłoszenia.'],
            ['Pod „Płatność online” w edycji eventu jest ostrzeżenie.', 'Przeczytaj przyczynę: Tpay wyłączony, brak klucza albo waluta inna niż PLN. Popraw na Renderze lub zmień walutę.'],
            ['Wpłata ma znacznik TEST.', 'Włączony jest tryb testowy. Przejdź listę kontrolną przed startem zapisów; wpłatę testową usuń przyciskiem „Usuń wpłatę testową”.'],
            ['Po usunięciu wpłaty testowej zgłoszenie znów „Oczekuje”.', 'To prawidłowe: bez tej wpłaty brakuje zadatku albo całości. Zaksięguj prawdziwą wpłatę albo poproś gościa o płatność.'],
            ['Wpłata ma znacznik INNA KWOTA.', 'Zaksięgowano faktyczny wpływ. Porównaj z kwotą oczekiwaną i skontaktuj się z gościem.'],
            ['Gość zapłacił online, a wpłaty nie widać.', 'Poczekaj kilka minut i kliknij „Odśwież”. Jeśli nadal jej nie ma, sprawdź transakcję w panelu Tpay i adres powiadomień w „Ustawienia” ▸ „Płatności online”.'],
            ['Kafel „Płatności online” pokazuje „Nie udało się wczytać stanu”.', 'API jest w starej wersji albo nie działa. Zrób „Manual Deploy” usługi `icpe-api`.'],
            ['Brak linku „cofnij” przy wpłacie.', 'Cofnąć można tylko wpłatę wpisaną ręcznie. Wpłatę online zwraca się przyciskiem „Zwróć”.'],
            ['Zgłoszenie z wpłaconym zadatkiem jest potwierdzone, choć brakuje reszty.', 'To prawidłowe przy harmonogramie wpłat. Resztę pilnują terminy rat i przypomnienia.'],
            ['Goście nie dostają maili.', 'W „Ustawienia”, w części o poczcie, sprawdź dostawcę i listę „Ostatnie maile”, potem kliknij „Wyślij test”.'],
          ] },
        ],
      },
      {
        id: 'problemy-eventy',
        title: 'Eventy i zgłoszenia',
        blocks: [
          { type: 'table', head: ['Objaw', 'Co zrobić'], rows: [
            ['Przy zapisie eventu: „Ta karta panelu działa w starej wersji…”.', 'Odśwież stronę (Ctrl+R / Cmd+R) i wprowadź zmiany ponownie. Nic nie zostało zapisane. Patrz „Baner »Dostępna jest nowa wersja panelu«”.'],
            ['Przy zapisie eventu: „Ustawienia tego eventu zostały w międzyczasie zmienione…”.', 'Ktoś zapisał wydarzenie po otwarciu Twojego formularza. Odśwież stronę, sprawdź ustawienia i wprowadź zmiany ponownie.'],
            ['Z cennika zniknęły poziomy cen, zniżki albo dodatki.', '„Edytuj” ▸ „Historia zmian cennika” ▸ wybierz wersję sprzed zmiany ▸ „Przywróć”.'],
            ['Gość pisze, że dodatek (np. dostawka) jest nieaktywny.', 'Limit jest wyczerpany. Zajętość: „Zgłoszenia” ▸ „Diety i dodatki”. Możesz dopisać dodatek ręcznie w „Edytuj zgłoszenie” („Zapisz mimo limitu”) albo zwiększyć limit w „Edytuj event”.'],
            ['Zmiana w evencie nie jest widoczna na stronie.', 'Sprawdź, czy kliknięto „Zapisz zmiany” na dole formularza. Odśwież stronę zapisów.'],
            ['Nowa funkcja w panelu pokazuje błąd albo niczego nie zapisuje.', 'API nie zostało wdrożone. Zrób „Manual Deploy” usługi `icpe-api`.'],
            ['Na stronie jest licznik zamiast przycisku zapisu.', 'Ustawiono przyszłą datę w „Otwarcie zapisów”. Kliknij „otwórz od razu” i zapisz.'],
            ['Ukryty event nadal widać na icpemission.pl.', 'Strona icpemission.pl jest statyczna — event może zniknąć dopiero po jej ponownym zbudowaniu.'],
            ['W formularzu gościa nie ma kroku wyboru pokoju.', 'Krok pojawia się tylko, gdy wydarzenie ma pokoje i co najmniej 1 noc (albo nocleg opcjonalny). Sprawdź „Liczba nocy” i listę pokoi.'],
            ['W formularzu gościa nie ma pola „Kod rabatowy”.', 'Wydarzenie nie ma żadnego kodu. Dodaj go w „Cennik” ▸ „Kody rabatowe”.'],
            ['Komunikat o nieprzypisanych uczestnikach przy edycji zgłoszenia.', 'Przypisz każdą osobę do pokoju albo dodaj pokój przyciskiem „Dodaj pokój”.'],
            ['Panel nagle pokazuje ekran logowania.', 'Sesja wygasła. Zaloguj się ponownie; na własnym komputerze zaznacz „Zapamiętaj mnie na tym urządzeniu”.'],
            ['Przypadkowo anulowano zgłoszenie.', '„Zgłoszenia” ▸ zakładka „Anulowane” ▸ otwórz zgłoszenie ▸ „Przywróć zgłoszenie”. Status wróci zgodnie ze stanem wpłat.'],
            ['Przy przywracaniu pojawia się ostrzeżenie o braku miejsc lub pokoi.', 'W międzyczasie miejsce zajął ktoś inny. Zwolnij miejsce albo świadomie kliknij „Przywróć mimo to”.'],
            ['Nie ma przycisku „Usuń trwale” przy anulowanym zgłoszeniu.', 'Zgłoszenie ma wpłatę, która nie jest testowa (także cofniętą lub zwróconą). Takiego zgłoszenia nie usuwa się — zostaje anulowane.'],
            ['Gość dostał „Nie zapomnij dokończyć zgłoszenia”, choć już się zapisał.', 'Zwykle zaczął formularz w innej przeglądarce lub na innym urządzeniu z innym adresem e-mail. Zgłoszenie jest ważne — mail można zignorować.'],
            ['Event zniknął z listy eventów.', 'Mógł zostać zarchiwizowany. Zaznacz „Pokaż zarchiwizowane” nad listą; „Przywróć z archiwum” przywraca go jako zamknięty.'],
            ['W szczegółach zgłoszenia zamiast linku jest „Nie udało się pobrać linku”.', 'API jest w starszej wersji. Zrób „Manual Deploy” usługi `icpe-api`.'],
          ] },
        ],
      },
    ],
  },
]
