/// <reference types="node" />
// @vitest-environment node

// Covers the pure-JS streaming-SHA-256 fallback path in
// `sourceContentIdFromBytes`. Node 20+ always provides
// `globalThis.crypto.subtle`, so the fallback is otherwise unreachable
// under the default test environment.

import { createHash, randomBytes } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { sourceContentIdFromBytes } from './source-content-id'

const originalSubtle = globalThis.crypto?.subtle

beforeAll(() => {
  // Deliberately remove SubtleCrypto so the implementation must hit the
  // pure-JS streaming-sha256 fallback path.
  Object.defineProperty(globalThis.crypto, 'subtle', {
    configurable: true,
    value: undefined,
  })
})

afterAll(() => {
  Object.defineProperty(globalThis.crypto, 'subtle', {
    configurable: true,
    value: originalSubtle,
  })
})

describe('sourceContentIdFromBytes (JS streaming-sha256 fallback)', () => {
  it('matches node:crypto when subtle is unavailable', async () => {
    for (const size of [0, 1, 55, 56, 64, 4096, 100_003]) {
      const bytes = randomBytes(size)
      const expected = createHash('sha256').update(bytes).digest('hex')
      const result = await sourceContentIdFromBytes(bytes)
      expect(result.sha256).toBe(expected)
      expect(result.byteSize).toBe(size)
    }
  })

  it('exercises the fallback path (sanity: subtle really is undefined)', () => {
    expect(globalThis.crypto.subtle).toBeUndefined()
  })
})
