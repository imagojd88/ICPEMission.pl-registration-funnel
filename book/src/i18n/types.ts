export interface Endorsement {
  name: string;
  role: string;
  text: string;
}

export interface Dict {
  htmlLang: string;
  nativeName: string;
  title: string;
  subtitle: string;
  coauthor: string;
  meta: { title: string; description: string };
  nav: { book: string; editions: string; author: string; endorsements: string; gallery: string; resources: string; order: string; language: string; menu: string };
  launchBar: { label: string; cta: string };
  hero: { kicker: string; lede: string; primary: string; primaryHref: 'amazon' | 'polish'; secondary: string; note: string };
  promise: { lead: string; text: string };
  book: { h2: string; p1: string; p2: string; insideH: string; inside: string[]; photoCaption: string; photoAlt: string; coverAlt: string };
  editions: { h2: string; lead: string; available: string; launch: string; soon: string; order: string; polish: string; notify: string };
  journey: { h2: string; steps: { year: string; place: string; text: string }[] };
  author: { lead: string; p1: string; p2: string; caption: string; alt: string };
  endorsements: { h2: string; count: string; items: Endorsement[] };
  gallery: { h2: string; tabs: { community: string; outreach: string; events: string }; photo: string; close: string; prev: string; next: string };
  resources: {
    h2: string; lead: string;
    items: { extracts: { title: string; text: string }; quotes: { title: string; text: string }; prayers: { title: string; text: string } };
    download: string; soon: string;
    newsletter: { h: string; firstName: string; email: string; submit: string; gdpr: string; fallback: string };
  };
  events: { h2: string; lead: string; title: string; cta: string; timeWord: string };
  footer: { about: string; contact: string; follow: string };
}
