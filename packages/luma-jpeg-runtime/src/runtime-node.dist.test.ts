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
    it('encodes a tiny JPEG end-to-end from the published bundle', async () => {
      const mod = (await import(DIST_NODE)) as {
        createLumaJpegRuntimeForNode: () => Promise<{
          createEncoder: (opts: {
            width: number
            height: number
            quality: number
          }) => {
            writeRows: (rows: Uint8Array, rowCount: number) => Promise<void>
            finish: () => Promise<Uint8Array>
          }
          dispose: () => void
        }>
      }
      const runtime = await mod.createLumaJpegRuntimeForNode()
      try {
        const encoder = runtime.createEncoder({
          width: 8,
          height: 4,
          quality: 0.8,
        })
        const rows = new Uint8Array(8 * 4 * 3).fill(128)
        await encoder.writeRows(rows, 4)
        const bytes = await encoder.finish()
        expect(bytes).toBeInstanceOf(Uint8Array)
        expect(bytes.length).toBeGreaterThan(0)
        // JPEG SOI marker
        expect(bytes[0]).toBe(0xFF)
        expect(bytes[1]).toBe(0xD8)
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
