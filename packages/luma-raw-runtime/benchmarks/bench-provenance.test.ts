import { describe, expect, it, vi } from 'vitest'

import {
  createBenchmarkProvenanceUrl,
  loadBenchmarkProvenance,
} from './bench-provenance'

describe('benchmark provenance', () => {
  it('loads provenance from the selected RAW runtime profile directory', async () => {
    expect(
      createBenchmarkProvenanceUrl(
        'https://example.com/benchmarks/bench-runtime.ts',
        'desktop',
      ).href,
    ).toBe('https://example.com/dist/native/desktop/provenance.json')

    expect(
      createBenchmarkProvenanceUrl(
        'https://example.com/benchmarks/bench-runtime.ts',
        'low-memory',
      ).href,
    ).toBe('https://example.com/dist/native/low-memory/provenance.json')
  })

  it('preserves source lock provenance for benchmark records', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ sourceLockSha256: 'abc123' }),
    ) as unknown as typeof fetch

    await expect(
      loadBenchmarkProvenance({
        baseUrl: 'https://example.com/benchmarks/bench-runtime.ts',
        fetchImpl,
        memoryProfile: 'desktop',
      }),
    ).resolves.toEqual({ sourceLockSha256: 'abc123' })
    expect(fetchImpl).toHaveBeenCalledWith(
      new URL('https://example.com/dist/native/desktop/provenance.json'),
      { cache: 'no-store' },
    )
  })
})
