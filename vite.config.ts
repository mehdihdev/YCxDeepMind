import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  root: 'src/bench',
  base: '/bench/',
  publicDir: 'public',
  build: {
    outDir: '../../dist/bench',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/bench'),
    },
  },
  server: {
    port: 5174,
  },
})
