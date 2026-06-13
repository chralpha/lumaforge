/// <reference types="node" />
// @vitest-environment node

import { Buffer } from 'node:buffer'

import { describe, expect, it } from 'vitest'

import { createLumaJpegRuntimeForNode } from './runtime-node'

function makeRgbGradient(width: number, height: number): Uint8Array {
  const rows = new Uint8Array(width * height * 3)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 3
      rows[i] = (x * 255) / (width - 1)
      rows[i + 1] = (y * 255) / (height - 1)
      rows[i + 2] = ((x + y) * 255) / (width + height - 2)
    }
  }
  return rows
}

describe('createLumaJpegRuntimeForNode', () => {
  it('encodes a small RGB image to a JPEG byte stream', async () => {
    const runtime = await createLumaJpegRuntimeForNode()
    try {
      const encoder = runtime.createEncoder({
        width: 64,
        height: 32,
        quality: 0.85,
      })
      const rows = makeRgbGradient(64, 32)
      await encoder.writeRows(rows, 32)
      const bytes = await encoder.finish()

      expect(bytes).toBeInstanceOf(Uint8Array)
      expect(bytes.length).toBeGreaterThan(0)
      // JPEG magic bytes (SOI marker)
      expect(bytes[0]).toBe(0xFF)
      expect(bytes[1]).toBe(0xD8)
      // JPEG end-of-image (EOI marker)
      expect(bytes[bytes.length - 2]).toBe(0xFF)
      expect(bytes.at(-1)).toBe(0xD9)
    } finally {
      runtime.dispose()
    }
  }, 30_000)

  it('produces identical output for the same input bytes', async () => {
    const runtime = await createLumaJpegRuntimeForNode()
    try {
      const rows = makeRgbGradient(32, 16)

      const first = runtime.createEncoder({
        width: 32,
        height: 16,
        quality: 0.9,
      })
      await first.writeRows(rows, 16)
      const a = await first.finish()

      const second = runtime.createEncoder({
        width: 32,
        height: 16,
        quality: 0.9,
      })
      await second.writeRows(rows, 16)
      const b = await second.finish()

      expect(a.length).toBe(b.length)
      expect(Buffer.compare(Buffer.from(a), Buffer.from(b))).toBe(0)
    } finally {
      runtime.dispose()
    }
  }, 30_000)

  it('streams chunks when finishMode is chunks', async () => {
    const collected: Uint8Array[] = []
    const runtime = await createLumaJpegRuntimeForNode({
      onChunk: ({ bytes }) => {
        collected.push(bytes)
      },
    })
    try {
      const rows = makeRgbGradient(48, 24)
      const encoder = runtime.createEncoder({
        width: 48,
        height: 24,
        quality: 0.8,
        finishMode: 'chunks',
      })
      await encoder.writeRows(rows, 24)
      const tail = await encoder.finish()

      const totalChunkBytes = collected.reduce((sum, c) => sum + c.length, 0)
      expect(totalChunkBytes).toBeGreaterThan(0)
      // tail bytes are empty in chunks mode (chunks already emitted)
      expect(tail.length).toBe(0)
    } finally {
      runtime.dispose()
    }
  }, 30_000)

  it('rejects writeRows with a length mismatch', async () => {
    const runtime = await createLumaJpegRuntimeForNode()
    try {
      const encoder = runtime.createEncoder({
        width: 16,
        height: 8,
        quality: 0.8,
      })
      const wrongLength = new Uint8Array(16 * 7 * 3) // 7 rows declared as 8
      await expect(encoder.writeRows(wrongLength, 8)).rejects.toThrow()
    } finally {
      runtime.dispose()
    }
  }, 30_000)

  it('disposes safely and prevents further use', async () => {
    const runtime = await createLumaJpegRuntimeForNode()
    runtime.dispose()
    expect(() =>
      runtime.createEncoder({ width: 4, height: 4, quality: 0.5 }),
    ).toThrow(/DISPOSED/i)
  })
})
