// Dane wspólne dla wszystkich języków: linki, wydania, galeria, premiera.
// Teksty są w src/i18n/<lang>.ts.

export const LANGS = ['en', 'pl', 'it', 'es', 'ko'] as const;
export type Lang = (typeof LANGS)[number];
export const DEFAULT_LANG: Lang = 'en';

export const LINKS = {
  amazon: 'https://www.amazon.com/Cast-Light-Story-ICPE-Mission/dp/1505135958/',
  polishEdition: 'https://icpemission.pl/promyk-swiatla',
  icpe: 'https://icpe.org/',
  instagram: 'https://www.instagram.com/icpemission360/',
  facebook: 'https://www.facebook.com/profile.php?id=100068380218392',
  email: 'book@icpe.org',
  phone: '+39 06 6651 2891',
  mobile: '+39 351 893 2270',
  address: 'Via Licio Giorgieri 64, 00165 Roma, Italia',
};

/**
 * Formularz newslettera: adres `action` formularza z Brevo (Formularze ▸ Udostępnij ▸ HTML,
 * atrybut action). Puste → zamiast formularza przycisk „napisz do nas” (mailto).
 * Pola formularza: EMAIL i FIRSTNAME (domyślne nazwy w Brevo).
 */
export const NEWSLETTER_ACTION = '';

/** Darmowe materiały. Puste `file` → karta pokazuje „wkrótce”. Pliki w public/files/. */
export const RESOURCES: { key: 'extracts' | 'quotes' | 'prayers'; file: string }[] = [
  { key: 'extracts', file: '' },
  { key: 'quotes', file: '/files/a-cast-of-light-quotes.pdf' },
  { key: 'prayers', file: '' },
];

/** Wydania. `status`: available | launch | soon. Język strony nie musi mieć wydania. */
export const EDITIONS: { lang: Lang; native: string; title: string; status: 'available' | 'launch' | 'soon'; href?: string }[] = [
  { lang: 'en', native: 'English', title: 'A Cast of Light. The Story of the ICPE Mission', status: 'available', href: LINKS.amazon },
  { lang: 'pl', native: 'Polski', title: 'Promyk Światła. Historia ICPE Mission', status: 'launch', href: LINKS.polishEdition },
  { lang: 'it', native: 'Italiano', title: 'Un raggio di luce. La storia dell’ICPE Mission', status: 'soon' },
  { lang: 'ko', native: '한국어', title: '한줄기 빛. ICPE 미션 이야기', status: 'soon' },
];

/** Premiera / wydarzenia. Po dniu `date` sekcja i pasek znikają (sprawdzane też w przeglądarce). */
export const EVENTS = [
  { id: 'krakow-2026', date: '2026-10-16', time: '18:30', city: 'Kraków', venue: 'ul. Dwernickiego 5', href: 'https://luma.com/u9vluazp' },
];

/** Galeria: pliki w public/img/gallery/ (pełne + thumb-…). Wymiary pełnych plików. */
export const GALLERY: Record<'community' | 'outreach' | 'events', { file: string; w: number; h: number }[]> = {
  community: [
    ['community-01.jpg', 1400, 788], ['community-02.jpg', 1400, 938], ['community-03.jpg', 1400, 792],
    ['community-04.jpg', 1116, 768], ['community-05.jpg', 1400, 962], ['community-06.jpg', 1400, 940],
    ['community-07.jpg', 1400, 931],
  ].map(([file, w, h]) => ({ file: file as string, w: w as number, h: h as number })),
  outreach: [
    ['outreach-01.jpg', 1024, 768], ['outreach-02.jpg', 1400, 1050], ['outreach-03.jpg', 882, 550],
    ['outreach-04.jpg', 882, 593], ['outreach-05.jpg', 1113, 768], ['outreach-06.jpg', 750, 500],
    ['outreach-07.jpg', 912, 1400], ['outreach-08.jpg', 1400, 991], ['outreach-09.jpg', 1400, 933],
    ['outreach-10.jpg', 1400, 786], ['outreach-11.jpg', 1400, 935], ['outreach-12.jpg', 1050, 1400],
    ['outreach-13.jpg', 1400, 935], ['outreach-14.jpg', 1400, 924], ['outreach-15.jpg', 1400, 958],
    ['outreach-16.jpg', 1400, 980], ['outreach-17.jpg', 1400, 942], ['outreach-18.jpg', 1400, 1024],
    ['outreach-19.jpg', 1400, 897], ['outreach-20.jpg', 1400, 787], ['outreach-21.jpg', 1400, 1050],
    ['outreach-22.jpg', 1198, 768], ['outreach-23.jpg', 1185, 756], ['outreach-24.jpg', 876, 593],
  ].map(([file, w, h]) => ({ file: file as string, w: w as number, h: h as number })),
  events: [
    ['events-01.jpg', 1400, 1050], ['events-02.jpg', 1400, 905], ['events-03.jpg', 1400, 966],
    ['events-04.jpg', 1133, 768], ['events-05.jpg', 1090, 1400], ['events-06.jpg', 1130, 768],
    ['events-07.jpg', 951, 1400],
  ].map(([file, w, h]) => ({ file: file as string, w: w as number, h: h as number })),
};

export function langPath(lang: Lang): string {
  return lang === DEFAULT_LANG ? '/' : `/${lang}/`;
}
