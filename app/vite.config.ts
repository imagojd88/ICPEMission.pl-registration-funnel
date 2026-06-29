import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@icpe/shared': resolve(__dirname, '../shared/src/index.ts'),
      '@': resolve(__dirname, './src'),
    },
  },
})
