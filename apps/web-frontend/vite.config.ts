import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const buildId = process.env.CF_PAGES_COMMIT_SHA ?? new Date().toISOString();

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD_ID__: JSON.stringify(buildId),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
