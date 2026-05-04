import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
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
import {
  assertNativeRuntimeAssets,
  copyNativeRuntimeAssets,
  resolveNativeRuntimeAssets,
} from './scripts/native-runtime/assets.mjs'
import {
  createRobotsTxt,
  createSitemapXml,
  DEFAULT_DEPLOY_ENV,
  DEFAULT_SITE_URL,
  HOME_ROUTE_SEO,
  normalizeSiteUrl,
  RAW_ROUTE_SEO,
  replaceSeoBlock,
  resolveDeployEnvironment,
} from './src/lib/seo'

const ROOT = fileURLToPath(new URL('./', import.meta.url))
const LUMA_COLOR_RUNTIME_GLSL_SOURCE = resolve(
  ROOT,
  './packages/luma-color-runtime/src/glsl.ts',
)
const LUMA_COLOR_RUNTIME_TESTING_SOURCE = resolve(
  ROOT,
  './packages/luma-color-runtime/src/testing.ts',
)
const LUMA_COLOR_RUNTIME_SOURCE = resolve(
  ROOT,
  './packages/luma-color-runtime/src/index.ts',
)
const LUMA_RAW_RUNTIME_SOURCE = resolve(
  ROOT,
  './packages/luma-raw-runtime/src/index.ts',
)
const CROSS_ORIGIN_ISOLATION_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

function resolveSeoRuntimeOptions(env = process.env) {
  return {
    siteUrl: normalizeSiteUrl(
      env.VITE_SITE_URL?.trim() || env.SITE_URL?.trim() || DEFAULT_SITE_URL,
    ),
    deployEnv: resolveDeployEnvironment(
      env.DEPLOY_ENV?.trim() || DEFAULT_DEPLOY_ENV,
    ),
  }
}

function nativeRuntimeAssetsPlugin(env: NodeJS.ProcessEnv): Plugin {
  function resolveAssetSets() {
    return resolveNativeRuntimeAssets({ rootDir: ROOT, env })
  }

  return {
    name: 'lumaforge-native-runtime-assets',
    configResolved() {
      assertNativeRuntimeAssets(resolveAssetSets())
    },
    writeBundle(options) {
      const outputDir = options.dir
        ? resolve(ROOT, options.dir)
        : resolve(ROOT, 'dist')
      copyNativeRuntimeAssets(resolveAssetSets(), outputDir)
    },
  }
}

function staticSeoArtifactsPlugin(): Plugin {
  return {
    name: 'lumaforge-static-seo-artifacts',
    writeBundle(options) {
      const outputDir = options.dir
        ? resolve(ROOT, options.dir)
        : resolve(ROOT, 'dist')
      const indexHtmlPath = resolve(outputDir, 'index.html')
      const sourceHtml = readFileSync(indexHtmlPath, 'utf8')
      const seoOptions = resolveSeoRuntimeOptions()

      writeFileSync(
        indexHtmlPath,
        replaceSeoBlock(sourceHtml, HOME_ROUTE_SEO, seoOptions),
      )

      const rawRouteDir = resolve(outputDir, 'raw')
      mkdirSync(rawRouteDir, { recursive: true })
      writeFileSync(
        resolve(rawRouteDir, 'index.html'),
        replaceSeoBlock(sourceHtml, RAW_ROUTE_SEO, seoOptions),
      )

      writeFileSync(
        resolve(outputDir, 'robots.txt'),
        createRobotsTxt(seoOptions),
      )
      writeFileSync(
        resolve(outputDir, 'sitemap.xml'),
        createSitemapXml([HOME_ROUTE_SEO, RAW_ROUTE_SEO], seoOptions),
      )
    },
  }
}

export default defineConfig(({ command }) => {
  const seoOptions = resolveSeoRuntimeOptions()
  const nativeRuntimeEnv = { ...process.env }
  if (!nativeRuntimeEnv.LUMAFORGE_NATIVE_RUNTIME_MODE && command === 'serve') {
    nativeRuntimeEnv.LUMAFORGE_NATIVE_RUNTIME_MODE = 'source'
  }

  return {
    server: {
      headers: CROSS_ORIGIN_ISOLATION_HEADERS,
    },
    preview: {
      headers: CROSS_ORIGIN_ISOLATION_HEADERS,
    },
    plugins: [
      nativeRuntimeAssetsPlugin(nativeRuntimeEnv),
      staticSeoArtifactsPlugin(),
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
        '@lumaforge/luma-color-runtime/glsl': LUMA_COLOR_RUNTIME_GLSL_SOURCE,
        '@lumaforge/luma-color-runtime/testing':
          LUMA_COLOR_RUNTIME_TESTING_SOURCE,
        '@lumaforge/luma-color-runtime': LUMA_COLOR_RUNTIME_SOURCE,
        '@lumaforge/luma-raw-runtime': LUMA_RAW_RUNTIME_SOURCE,
      },
      tsconfigPaths: true,
    },
    define: {
      APP_DEV_CWD: JSON.stringify(process.cwd()),
      APP_NAME: JSON.stringify(
        PKG.name === 'lumaforge' ? 'LumaForge' : PKG.name,
      ),
      APP_SITE_URL: JSON.stringify(seoOptions.siteUrl),
      APP_DEPLOY_ENV: JSON.stringify(seoOptions.deployEnv),
    },
  }
})
