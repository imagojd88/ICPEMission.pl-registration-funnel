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

export const HELP_UPDATED = '2026-11-25'

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
            ['Event cykliczny (evergreen)', 'Typ jest na liście, ale harmonogram powtórzeń nie jest jeszcze obsługiwany: pola „Konfiguracja cykliczności” w kreatorze są wyłączone i nic nie zapisują. Przed użyciem ustal z osobą rozwijającą system, jak ma działać.'],
          ] },
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
          { type: 'p', text: 'Kolumny pliku: numer zgłoszenia, data, status, płatność, imię, nazwisko, e-mail, telefon, kraj, język, adres, parafia, wspólnota, liczba osób, uczestnicy (imię i nazwisko, wiek, typ), diety uczestników, pokoje, numer pokoju, uwagi do pokoju, kwota, wpłacono, pozostało, waluta, metoda, operator lub źródło wpłat, darowizna, kod rabatowy, uwagi / dieta, przyjazd.' },
          { type: 'list', items: [
            'Plik powstaje w przeglądarce z danych widocznych w panelu — nic nie jest wysyłane na zewnątrz.',
            'Zaznaczenie obejmuje też zgłoszenia ukryte przez filtr; pasek pokazuje, ile ich jest. Po zmianie eventu zaznaczenie się czyści.',
            'Plik zawiera dane osobowe. Przechowuj go i przekazuj tak ostrożnie jak listę uczestników.',
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
