import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
  },
  define: {
    APP_NAME: JSON.stringify('LumaForge'),
    APP_SITE_URL: JSON.stringify('https://luma.ichr.me'),
    APP_DEPLOY_ENV: JSON.stringify('production'),
  },
  plugins: [react()],
  resolve: {
    alias: {
      '~': fileURLToPath(new URL('./src', import.meta.url)),
      '@pkg': fileURLToPath(new URL('./package.json', import.meta.url)),
      '@lumaforge/luma-raw-runtime': fileURLToPath(
        new URL('./packages/luma-raw-runtime/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: true,
  },
})
