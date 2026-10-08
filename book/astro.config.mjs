import { defineConfig } from 'astro/config';

// icpebook.org — statyczna strona książki. Stare adresy z Wixa przekierowane na sekcje.
export default defineConfig({
  site: process.env.SITE_URL || 'https://www.icpebook.org',
  output: 'static',
  build: { format: 'directory' },
  redirects: {
    '/endorsements': '/#endorsements',
    '/gallery': '/#gallery',
    '/copy-of-outreach': '/#gallery',
    '/copy-of-special-events': '/#gallery',
    '/copy-of-outreach-1': '/#gallery',
    '/pl/endorsements': '/pl/#endorsements',
    '/it/endorsements': '/it/#endorsements',
    '/es/endorsements': '/es/#endorsements',
    '/ko/endorsements': '/ko/#endorsements',
    '/pl/gallery': '/pl/#gallery',
    '/it/gallery': '/it/#gallery',
    '/es/gallery': '/es/#gallery',
    '/ko/gallery': '/ko/#gallery',
  },
});
