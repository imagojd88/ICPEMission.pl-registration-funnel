import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// Standardowy build wielo-plikowy (z hashowanymi assetami) — pod poprawny hosting
// statyczny (Render Static / Cloudflare Pages), który obsługuje SPA-fallback i
// natychmiast unieważnia cache po deployu. Bez sztuczek single-file/hijack.
// Znacznik buildu: hash commita z Render (RENDER_GIT_COMMIT) + czas buildu; lokalnie sam czas.
// Trafia do kodu (stała __APP_BUILD__) i do pliku /version.json — panel porównuje oba i po wdrożeniu
// nowej wersji prosi o odświeżenie strony (patrz src/lib/panelVersion.ts).
const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 13)
const commit = (process.env.RENDER_GIT_COMMIT || process.env.COMMIT_REF || '').slice(0, 10)
const APP_BUILD = commit ? `${commit}-${stamp}` : `local-${stamp}`

export default defineConfig(({ command }) => ({
  base: '/',
  define: {
    // `vite dev` → „dev” (sprawdzanie wersji wyłączone); build → znacznik.
    __APP_BUILD__: JSON.stringify(command === 'build' ? APP_BUILD : 'dev'),
  },
  plugins: [
    react(),
    {
      name: 'icpe-version-json',
      apply: 'build',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: `${JSON.stringify({ build: APP_BUILD, builtAt: new Date().toISOString() })}\n` })
      },
    },
  ],
  resolve: {
    alias: {
      '@icpe/shared': resolve(__dirname, '../shared/src/index.ts'),
      '@': resolve(__dirname, './src'),
    },
  },
}))
