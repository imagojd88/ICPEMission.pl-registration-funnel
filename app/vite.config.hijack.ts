import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// Build "hijack": wymusza nazwy plików wyjściowych tak, by pasowały do STAREJ
// powłoki index.html, którą serwer (LiteSpeed cache) uparcie serwuje z pamięci.
// Stara powłoka woła /assets/index-Dtv4g6Fi.js + /assets/index-7c9xmjwl.css.
// Podstawiamy pod te nazwy AKTUALNY, naprawiony kod → cache ładuje nową aplikację.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@icpe/shared': resolve(__dirname, '../shared/src/index.ts'),
      '@': resolve(__dirname, './src'),
    },
  },
  build: {
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/index-Dtv4g6Fi.js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: (info) => {
          const n = (info as any).name || ''
          if (n.endsWith('.css')) return 'assets/index-7c9xmjwl.css'
          return 'assets/[name]-[hash][extname]'
        },
      },
    },
  },
})
