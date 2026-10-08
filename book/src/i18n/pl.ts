import type { Dict } from './types';

// Rekomendacje: tylko dwie (decyzja Jacka dla polskiej edycji) — teksty oficjalne, verbatim.
const pl: Dict = {
  htmlLang: 'pl',
  nativeName: 'Polski',
  title: 'Promyk Światła',
  subtitle: 'Historia ICPE Mission',
  coauthor: 'we współpracy z A.G. Harmonem',
  meta: {
    title: 'Promyk Światła. Historia ICPE Mission — Anna Cappello Fava',
    description: 'Jak katolickie małżeństwo z małej śródziemnomorskiej wyspy postanowiło żyć jak pierwsi chrześcijanie i podzielić się tym z całym światem. Historia ICPE Mission opowiedziana przez współzałożycielkę, Annę Cappello Fava.',
  },
  nav: { book: 'O książce', editions: 'Wydania', author: 'Autorka', endorsements: 'Rekomendacje', gallery: 'Galeria', resources: 'Materiały', order: 'Polskie wydanie', language: 'Język', menu: 'Menu' },
  launchBar: { label: 'Premiera polskiej edycji', cta: 'Zapisz się' },
  hero: {
    kicker: 'Historia ICPE Mission',
    lede: 'Na początku lat 80. katolickie małżeństwo z małej śródziemnomorskiej wyspy zgromadziło ludzi, którzy chcieli żyć jak pierwsi chrześcijanie. Ich obietnica: zacząć tam, gdzie są, i nie zatrzymać się, dopóki nie obejdą całego świata.',
    primary: 'Polskie wydanie i premiera',
    primaryHref: 'polish',
    secondary: 'Poznaj książkę',
    note: 'Polska edycja: premiera 16 października 2026 w Krakowie. Wydanie angielskie jest już dostępne.',
  },
  promise: { lead: 'Na początku była jedna śmiała obietnica', text: 'Zaczną tam, gdzie są, i nie zatrzymają się, dopóki nie obejdą całego świata.' },
  book: {
    h2: 'Z małej wyspy aż po krańce ziemi',
    p1: 'Na początku lat 80. na małej śródziemnomorskiej wyspie katolickie małżeństwo zgromadziło wokół siebie ludzi, którzy chcieli żyć tak jak pierwsi chrześcijanie: we wspólnocie otwartej dla każdego i prowadzonej przez Ducha Świętego. Kiedy ich życie zmieniło się nie do poznania, postanowili podzielić się tym, czego doświadczyli.',
    p2: 'To ich niezwykła historia, historia ICPE Mission, opowiedziana przez kobietę, która jest w niej od pierwszego dnia.',
    insideH: 'Co znajdziesz w książce',
    inside: [
      'Jak z modlitwy kilku osób na Malcie wyrosła międzynarodowa wspólnota misyjna.',
      'Świadectwa z miejsc, w których światło Chrystusa bywa jedynym promykiem nadziei.',
      'Praktyczną mądrość o tym, jak być uczniem-misjonarzem i jak formować do ewangelizacji.',
      'Czterdzieści lat prowadzenia wspólnoty, która żyje misją.',
    ],
    photoCaption: 'Anna i Mario Cappello ze świętym Janem Pawłem II',
    photoAlt: 'Anna i Mario Cappello ze świętym Janem Pawłem II',
    coverAlt: 'Okładka książki',
  },
  editions: {
    h2: 'Jedna historia, wiele języków',
    lead: 'Książka wędruje tak, jak wędrowała misja. Wybierz swoje wydanie.',
    available: 'Dostępne',
    launch: 'Premiera',
    soon: 'Wkrótce',
    order: 'Zamów na Amazonie',
    polish: 'Polskie wydanie',
    notify: 'Powiadom mnie',
  },
  journey: {
    h2: 'Droga, o której opowiada książka',
    steps: [
      { year: 'Początek lat 80.', place: 'Malta', text: 'Anna i Mario gromadzą ludzi, którzy chcą żyć jak pierwsi chrześcijanie: we wspólnocie otwartej dla każdego i prowadzonej przez Ducha Świętego.' },
      { year: '1985', place: 'Malta', text: 'Powstaje Instytut Ewangelizacji Świata – ICPE Mission. Wspólnota zaczyna formować świeckich i posyłać ich w świat.' },
      { year: 'Kolejne dekady', place: 'Wszystkie kontynenty', text: 'Misjonarze docierają do najtrudniejszych miejsc świata. Rodzi się HopeXchange, humanitarne ramię misji.' },
      { year: '2025', place: 'Cały Kościół', text: 'Czterdziesta rocznica założenia ICPE Mission. Książka ukazuje się po angielsku.' },
      { year: '2026', place: 'Nowe języki', text: 'Premiera polskiej edycji w Krakowie; w przygotowaniu wydania włoskie i koreańskie.' },
    ],
  },
  author: {
    lead: 'Współzałożycielka ICPE Mission. Od ponad czterdziestu lat razem z mężem Mario prowadzi rozwój wspólnoty na całym świecie, także jej humanitarnego ramienia HopeXchange.',
    p1: 'Ukończyła teologię w Rzymie (licencjat kanoniczny). Prowadzi rekolekcje, formację i opiekę duszpasterską w ICPE Mission, a z Mario seminaria o małżeństwie, przywództwie i rozeznawaniu.',
    p2: 'Bliska jest jej edukacja i godność kobiet: założyła program edukacyjny dla dzieci w Ghanie oraz Woman-to-Woman, posługę wspierającą kobiety na całym świecie. Gdy nie jest w podróży misyjnej, mieszka z mężem na Malcie.',
    caption: 'Anna Cappello Fava',
    alt: 'Portret Anny Cappello Fava',
  },
  endorsements: {
    h2: 'Rekomendacje',
    count: 'Rekomendacje',
    items: [
      { name: 'ks. Sławomir Pawłowski SAC', role: 'Katolicki Uniwersytet Lubelski Jana Pawła II, sekretarz Rady KEP ds. Ekumenizmu, doradca duchowy wspólnot ICPE Mission w Polsce', text: '„Promyk światła” Anny Cappello to historia owocowania podstawowych cnót misjonarzy: odwagi, cierpliwości, zaufania i… odrobiny improwizacji. Jest to przekonujące świadectwo, jak dzisiaj światłość Chrystusa staje się dla wielu jedynym promykiem nadziei. To także teologicznie głębokie nauczanie o tym, jak być uczniem-misjonarzem, jak formować do ewangelizacji, jak być liderem wspólnoty z misją. Z ujmującym pięknem wznieca iskierkę radości i dodaje siły!' },
      { name: 'Mary Healy', role: 'profesor biblistyki, członkini Dykasterii ds. Popierania Jedności Chrześcijan, Papieskiej Komisji Biblijnej oraz Dykasterii ds. Kultu Bożego i Dyscypliny Sakramentów', text: 'Misjonarze ICPE są pionierami! W czasach, gdy niewielu katolików nawet mówiło o ewangelizacji, a tym bardziej ją prowadziło, ICPE Mission zaczęła formować i wysyłać świeckich, aby nieśli światło Chrystusa do niektórych z najciemniejszych miejsc na świecie. Kościół powinien wiele nauczyć się z tej inspirującej historii.' },
    ],
  },
  gallery: { h2: 'Czterdzieści lat na zdjęciach', tabs: { community: 'Wspólnota', outreach: 'Misje', events: 'Wydarzenia' }, photo: 'Zdjęcie z archiwum ICPE Mission', close: 'Zamknij', prev: 'Poprzednie zdjęcie', next: 'Następne zdjęcie' },
  resources: {
    h2: 'Materiały do pobrania',
    lead: 'Przeczytaj kilka stron, módl się razem ze wspólnotą, podziel się cytatem. Zapisz się do listy mailowej, a nowe materiały dostaniesz jako pierwszy.',
    items: {
      extracts: { title: 'Fragmenty', text: 'Kilka stron z książki do przeczytania przed zakupem.' },
      quotes: { title: 'Cytaty', text: 'Fragmenty książki gotowe do udostępnienia (po angielsku).' },
      prayers: { title: 'Modlitwy', text: 'Modlitwy do osobistej refleksji i dla grup.' },
    },
    download: 'Pobierz PDF',
    soon: 'Wkrótce',
    newsletter: {
      h: 'Dołącz do listy mailowej',
      firstName: 'Imię',
      email: 'E-mail',
      submit: 'Zapisz się',
      gdpr: 'Dane osobowe przetwarzamy zgodnie z RODO. Możesz się wypisać w każdej chwili.',
      fallback: 'Napisz do nas, aby dołączyć',
    },
  },
  events: { h2: 'Spotkania z książką', lead: 'Poznaj wspólnotę, o której opowiada książka, na spotkaniu w Twojej okolicy.', title: 'Premiera polskiej edycji', cta: 'Zapisz się w Lumie', timeWord: 'godz.' },
  footer: {
    about: 'Instytut Ewangelizacji Świata – ICPE Mission to międzynarodowa wspólnota katolicka, która formuje uczniów-misjonarzy i przemienia życie radością Ewangelii.',
    contact: 'Kontakt',
    follow: 'Obserwuj',
  },
};

export default pl;
