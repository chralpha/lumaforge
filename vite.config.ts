import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import reactRefresh from '@vitejs/plugin-react'
import { codeInspectorPlugin } from 'code-inspector-plugin'
import type { Plugin } from 'vite'
import { defineConfig } from 'vite'
import { checker } from 'vite-plugin-checker'
import { routeBuilderPlugin } from 'vite-plugin-route-builder'

import PKG from './package.json'

const ROOT = fileURLToPath(new URL('./', import.meta.url))
const LUMA_RAW_RUNTIME_SOURCE = resolve(
  ROOT,
  './packages/luma-raw-runtime/src/index.ts',
)
const NATIVE_RUNTIME_ASSETS = [
  {
    label: 'Luma RAW runtime',
    packageName: '@lumaforge/luma-raw-runtime',
    sourceDir: resolve(ROOT, './packages/luma-raw-runtime/dist/native'),
    files: ['luma_raw.js', 'luma_raw.wasm'],
  },
  {
    label: 'Luma JPEG runtime',
    packageName: '@lumaforge/luma-jpeg-runtime',
    sourceDir: resolve(ROOT, './packages/luma-jpeg-runtime/dist/native'),
    files: ['luma_jpeg.js', 'luma_jpeg.wasm'],
  },
] as const
const CROSS_ORIGIN_ISOLATION_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

function assertNativeRuntimeAssets() {
  const missingAssets = NATIVE_RUNTIME_ASSETS.flatMap((assetSet) =>
    assetSet.files
      .filter((fileName) => !existsSync(resolve(assetSet.sourceDir, fileName)))
      .map((fileName) => ({
        assetSet,
        fileName,
      })),
  )

  if (missingAssets.length > 0) {
    const missingSummary = missingAssets
      .map(({ assetSet, fileName }) => `${assetSet.label}: ${fileName}`)
      .join(', ')
    const buildCommands = [
      ...new Set(
        missingAssets.map(
          ({ assetSet }) =>
            `pnpm --filter ${assetSet.packageName} build:native`,
        ),
      ),
    ].join(' && ')

    throw new Error(
      `The app requires native runtime assets (${missingSummary}). Run \`${buildCommands}\` before building or serving the app.`,
    )
  }
}

function nativeRuntimeAssetsPlugin(): Plugin {
  return {
    name: 'lumaforge-native-runtime-assets',
    configResolved() {
      assertNativeRuntimeAssets()
    },
    writeBundle(options) {
      assertNativeRuntimeAssets()

      const outputDir = options.dir
        ? resolve(ROOT, options.dir)
        : resolve(ROOT, 'dist')
      const nativeOutputDir = resolve(outputDir, 'native')
      mkdirSync(nativeOutputDir, { recursive: true })

      for (const assetSet of NATIVE_RUNTIME_ASSETS) {
        for (const fileName of assetSet.files) {
          copyFileSync(
            resolve(assetSet.sourceDir, fileName),
            resolve(nativeOutputDir, fileName),
          )
        }
      }
    },
  }
}

export default defineConfig(() => {
  return {
    server: {
      headers: CROSS_ORIGIN_ISOLATION_HEADERS,
    },
    preview: {
      headers: CROSS_ORIGIN_ISOLATION_HEADERS,
    },
    plugins: [
      nativeRuntimeAssetsPlugin(),
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
