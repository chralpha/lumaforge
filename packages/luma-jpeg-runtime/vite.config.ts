import { readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vite'

const root = fileURLToPath(new URL('.', import.meta.url))

function cleanDistExceptNative() {
  const distDir = join(root, 'dist')

  try {
    for (const entry of readdirSync(distDir)) {
      if (entry === 'native') continue

      rmSync(join(distDir, entry), { force: true, recursive: true })
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
  }
}

export default defineConfig({
  root,
  base: './',
  plugins: [
    {
      name: 'luma-jpeg-preserve-native-assets',
      buildStart() {
        cleanDistExceptNative()
      },
    },
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: {
        index: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
        node: fileURLToPath(new URL('./src/runtime-node.ts', import.meta.url)),
      },
      formats: ['es'],
    },
    rollupOptions: {
      output: {
        chunkFileNames: '[name].js',
        entryFileNames: '[name].js',
      },
    },
    sourcemap: true,
    target: 'es2022',
  },
  worker: {
    format: 'es',
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
})
