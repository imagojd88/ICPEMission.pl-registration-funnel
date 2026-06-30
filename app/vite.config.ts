import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// Standardowy build wielo-plikowy (z hashowanymi assetami) — pod poprawny hosting
// statyczny (Render Static / Cloudflare Pages), który obsługuje SPA-fallback i
// natychmiast unieważnia cache po deployu. Bez sztuczek single-file/hijack.
export default defineConfig({
  base: '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@icpe/shared': resolve(__dirname, '../shared/src/index.ts'),
      '@': resolve(__dirname, './src'),
    },
  },
})
