import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import reactRefresh from '@vitejs/plugin-react'
import { codeInspectorPlugin } from 'code-inspector-plugin'
import type { Plugin } from 'vite'
import { defineConfig, loadEnv } from 'vite'
import { checker } from 'vite-plugin-checker'
import { routeBuilderPlugin } from 'vite-plugin-route-builder'

import PKG from './package.json'

const ROOT = fileURLToPath(new URL('./', import.meta.url))
const LUMA_RAW_RUNTIME_SOURCE = resolve(
  ROOT,
  './packages/luma-raw-runtime/src/index.ts',
)
const LUMA_RAW_NATIVE_SOURCE_DIR = resolve(
  ROOT,
  './packages/luma-raw-runtime/dist/native',
)
const LUMA_RAW_NATIVE_ASSETS = ['luma_raw.js', 'luma_raw.wasm'] as const
const CROSS_ORIGIN_ISOLATION_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

function assertLumaRawNativeAssets() {
  const missingAssets = LUMA_RAW_NATIVE_ASSETS.filter(
    (fileName) => !existsSync(resolve(LUMA_RAW_NATIVE_SOURCE_DIR, fileName)),
  )

  if (missingAssets.length > 0) {
    throw new Error(
      `VITE_RAW_RUNTIME=luma requires native assets (${missingAssets.join(
        ', ',
      )}). Run \`pnpm --filter @lumaforge/luma-raw-runtime build:native\` before building or serving the Luma runtime.`,
    )
  }
}

function lumaRawNativeAssetsPlugin(enabled: boolean): Plugin {
  return {
    name: 'lumaforge-luma-raw-native-assets',
    configResolved() {
      if (enabled) {
        assertLumaRawNativeAssets()
      }
    },
    writeBundle(options) {
      if (!enabled) return

      assertLumaRawNativeAssets()

      const outputDir = options.dir
        ? resolve(ROOT, options.dir)
        : resolve(ROOT, 'dist')
      const nativeOutputDir = resolve(outputDir, 'native')
      mkdirSync(nativeOutputDir, { recursive: true })

      for (const fileName of LUMA_RAW_NATIVE_ASSETS) {
        copyFileSync(
          resolve(LUMA_RAW_NATIVE_SOURCE_DIR, fileName),
          resolve(nativeOutputDir, fileName),
        )
      }
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ROOT, '')
  const rawRuntime = env.VITE_RAW_RUNTIME ?? process.env.VITE_RAW_RUNTIME
  const enableLumaRuntime = rawRuntime === 'luma'

  return {
    server: {
      headers: CROSS_ORIGIN_ISOLATION_HEADERS,
    },
    preview: {
      headers: CROSS_ORIGIN_ISOLATION_HEADERS,
    },
    plugins: [
      lumaRawNativeAssetsPlugin(enableLumaRuntime),
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
  }
})
