import { describe, expect, it } from 'vitest'

import {
  createSourceFingerprint,
  sourceFingerprintMatches,
} from './source-fingerprint'

describe('source fingerprint', () => {
  it('matches the same selected RAW facts', async () => {
    const file = new File(['abcdef'], 'frame.RAF', { lastModified: 123 })
    const fingerprint = await createSourceFingerprint(file, {
      width: 11662,
      height: 8746,
    })

    await expect(
      sourceFingerprintMatches(file, fingerprint, {
        width: 11662,
        height: 8746,
      }),
    ).resolves.toBe(true)
  })

  it('rejects same name and size with a different hash prefix', async () => {
    const first = new File(['abcdef'], 'frame.RAF', { lastModified: 123 })
    const second = new File(['abcdeg'], 'frame.RAF', { lastModified: 123 })
    const fingerprint = await createSourceFingerprint(first, {
      width: 1,
      height: 1,
    })

    await expect(
      sourceFingerprintMatches(second, fingerprint, { width: 1, height: 1 }),
    ).resolves.toBe(false)
  })

  it('hashes only the first MiB of source bytes', async () => {
    const prefix = new Uint8Array(1024 * 1024)
    prefix.fill(7)
    const first = new File([prefix, new Uint8Array([1])], 'frame.RAF', {
      lastModified: 123,
    })
    const second = new File([prefix, new Uint8Array([2])], 'frame.RAF', {
      lastModified: 123,
    })
    const fingerprint = await createSourceFingerprint(first, {
      width: 1,
      height: 1,
    })

    await expect(
      sourceFingerprintMatches(second, fingerprint, { width: 1, height: 1 }),
    ).resolves.toBe(true)
  })
})
