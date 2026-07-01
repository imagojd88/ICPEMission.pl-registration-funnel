import { defineConfig } from 'astro/config';

// Statyczna strona (SSG). Treść pobierana z /site/* przy buildzie.
// SITE_URL — publiczny adres strony (do OG/sitemap); PUBLIC_API_URL — baza API.
export default defineConfig({
  site: process.env.SITE_URL || 'https://icpemission.pl',
  output: 'static',
  build: {
    format: 'directory',
  },
});
