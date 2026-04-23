import { resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import reactRefresh from '@vitejs/plugin-react'
import { codeInspectorPlugin } from 'code-inspector-plugin'
import { defineConfig } from 'vite'
import { checker } from 'vite-plugin-checker'
import { routeBuilderPlugin } from 'vite-plugin-route-builder'

import PKG from './package.json'

const ROOT = fileURLToPath(new URL('./', import.meta.url))
const LUMA_RAW_RUNTIME_SOURCE = resolve(
  ROOT,
  './packages/luma-raw-runtime/src/index.ts',
)

export default defineConfig({
  plugins: [
    codeInspectorPlugin({
      bundler: 'vite',
      hotKeys: ['altKey'],
    }),
    reactRefresh(),
    checker({
      typescript: true,
      enableBuild: true,
    }),

    tailwindcss(),
    routeBuilderPlugin({
      pagePattern: `${resolve(ROOT, './src/pages')}/**/*.tsx`,
      outputPath: `${resolve(ROOT, './src/generated-routes.ts')}`,
      enableInDev: true,
    }),
  ],
  resolve: {
    alias: {
      '@lumaforge/luma-raw-runtime': LUMA_RAW_RUNTIME_SOURCE,
    },
    tsconfigPaths: true,
  },
  define: {
    APP_DEV_CWD: JSON.stringify(process.cwd()),
    APP_NAME: JSON.stringify(PKG.name),
  },
})
