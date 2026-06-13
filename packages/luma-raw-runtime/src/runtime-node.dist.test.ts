/// <reference types="node" />
// @vitest-environment node

import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DIST_NODE = join(packageDir, 'dist', 'node.js')
const DIST_AVAILABLE = existsSync(DIST_NODE)

const describeWithDist = DIST_AVAILABLE ? describe : describe.skip

describeWithDist(
  'dist/node.js bundle smoke (Node) — guards against externalization regressions',
  () => {
    it('imports and instantiates a runtime from the published bundle', async () => {
      // Import the actual built bundle. If Vite externalization regresses
      // (e.g. node:fs/promises gets inlined as a browser stub), the import
      // chain will throw with `readFile is not a function` and this test
      // will be the first to catch it.
      const mod = (await import(DIST_NODE)) as {
        createLumaRawRuntimeForNode: () => Promise<{
          init: () => Promise<{ runtime: string; memoryProfile: string }>
          dispose: () => void
        }>
      }
      const runtime = await mod.createLumaRawRuntimeForNode()
      try {
        const info = await runtime.init()
        expect(info.runtime).toBe('luma')
        expect(info.memoryProfile).toBe('desktop')
      } finally {
        runtime.dispose()
      }
    }, 30_000)
  },
)

if (!DIST_AVAILABLE) {
  describe('dist/node.js bundle smoke — SKIPPED', () => {
    it('dist/node.js missing; run `pnpm build` first', () => {
      expect(DIST_AVAILABLE).toBe(false)
    })
  })
}
