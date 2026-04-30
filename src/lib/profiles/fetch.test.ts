import { afterEach, describe, expect, it, vi } from 'vitest'

import type { OnlineLUTAsset } from './catalog'
import {
  createMemoryOnlineProfileCache,
  fetchBytesWithLimit,
  fetchJsonWithLimit,
  fetchVerifiedCubeAsset,
  OnlineProfileFetchError,
  sha256Hex,
} from './fetch'

const cubeBytes = new TextEncoder().encode('LUT_3D_SIZE 2\n')
const cubeHash =
  '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f'
const otherHash =
  '202122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e3f'

function response(body: BodyInit, init?: ResponseInit): Response {
  return new Response(body, init)
}

function digestBuffer(hex: string): ArrayBuffer {
  return Uint8Array.from(hex.match(/../g) ?? [], (byte) =>
    Number.parseInt(byte, 16),
  ).buffer
}

function stubDigestForCubeBytes(): void {
  vi.stubGlobal('crypto', {
    subtle: {
      digest: vi.fn(async (_algorithm: string, bytes: ArrayBuffer) => {
        const text = new TextDecoder().decode(bytes)

        return digestBuffer(text === 'LUT_3D_SIZE 2\n' ? cubeHash : otherHash)
      }),
    },
  })
}

function cubeAsset(sha256 = cubeHash): OnlineLUTAsset {
  return {
    url: 'https://profiles.example.com/blobs/cube.cube',
    sha256,
    bytes: cubeBytes.byteLength,
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchJsonWithLimit', () => {
  it('passes the abort signal through to fetch', async () => {
    const controller = new AbortController()
    const fetch = vi.fn(async () => response('{"ok":true}'))
    vi.stubGlobal('fetch', fetch)

    await expect(
      fetchJsonWithLimit('https://profiles.example.com/catalog.json', {
        signal: controller.signal,
        maxBytes: 32,
      }),
    ).resolves.toEqual({ ok: true })

    expect(fetch).toHaveBeenCalledWith(
      'https://profiles.example.com/catalog.json',
      { signal: controller.signal },
    )
  })

  it('rejects non-2xx responses with a typed network issue', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response('nope', { status: 503 })),
    )

    await expect(
      fetchJsonWithLimit('https://profiles.example.com/catalog.json', {
        maxBytes: 32,
      }),
    ).rejects.toMatchObject({
      code: 'network',
      name: 'OnlineProfileFetchError',
    })
  })

  it('rejects Content-Length over max before reading the body', async () => {
    const arrayBuffer = vi.fn()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'Content-Length': '33' }),
        arrayBuffer,
      })),
    )

    await expect(
      fetchJsonWithLimit('https://profiles.example.com/catalog.json', {
        maxBytes: 32,
      }),
    ).rejects.toMatchObject({ code: 'size-limit' })
    expect(arrayBuffer).not.toHaveBeenCalled()
  })

  it('rejects bodies over max after reading', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response('{"too":"large"}')),
    )

    await expect(
      fetchJsonWithLimit('https://profiles.example.com/catalog.json', {
        maxBytes: 4,
      }),
    ).rejects.toMatchObject({ code: 'size-limit' })
  })

  it('rejects invalid JSON with a typed invalid-json issue', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response('not json')),
    )

    await expect(
      fetchJsonWithLimit('https://profiles.example.com/catalog.json', {
        maxBytes: 32,
      }),
    ).rejects.toMatchObject({ code: 'invalid-json' })
  })
})

describe('fetchBytesWithLimit', () => {
  it('rejects oversized CUBE responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response(cubeBytes)),
    )

    await expect(
      fetchBytesWithLimit('https://profiles.example.com/blobs/cube.cube', {
        maxBytes: 4,
      }),
    ).rejects.toMatchObject({ code: 'size-limit' })
  })
})

describe('sha256Hex', () => {
  it('returns lowercase hex', async () => {
    vi.stubGlobal('crypto', {
      subtle: {
        digest: vi.fn(async () => digestBuffer('ABCDef')),
      },
    })

    await expect(sha256Hex(new Uint8Array([1, 2, 3]))).resolves.toBe('abcdef')
  })
})

describe('fetchVerifiedCubeAsset', () => {
  it('compares response bytes against manifest sha256', async () => {
    stubDigestForCubeBytes()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response(cubeBytes)),
    )

    const bytes = await fetchVerifiedCubeAsset(cubeAsset(), { maxBytes: 1024 })

    expect([...bytes]).toEqual([...cubeBytes])
  })

  it('rejects hash mismatches and does not cache bytes', async () => {
    stubDigestForCubeBytes()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response(cubeBytes)),
    )
    const cache = createMemoryOnlineProfileCache()
    const set = vi.spyOn(cache, 'set')

    await expect(
      fetchVerifiedCubeAsset(cubeAsset(otherHash), { maxBytes: 1024, cache }),
    ).rejects.toBeInstanceOf(OnlineProfileFetchError)
    await expect(
      fetchVerifiedCubeAsset(cubeAsset(otherHash), { maxBytes: 1024, cache }),
    ).rejects.toMatchObject({ code: 'hash-mismatch' })
    expect(set).not.toHaveBeenCalled()
  })

  it('uses verified cache hits without a second network call', async () => {
    stubDigestForCubeBytes()
    const fetch = vi.fn(async () => response(cubeBytes))
    vi.stubGlobal('fetch', fetch)
    const cache = createMemoryOnlineProfileCache()

    const fetchedBytes = await fetchVerifiedCubeAsset(cubeAsset(), {
      maxBytes: 1024,
      cache,
    })
    const cachedBytes = await fetchVerifiedCubeAsset(cubeAsset(), {
      maxBytes: 1024,
      cache,
    })

    expect([...fetchedBytes]).toEqual([...cubeBytes])
    expect([...cachedBytes]).toEqual([...cubeBytes])
    expect(fetch).toHaveBeenCalledTimes(1)
    expect([...(await cache.get(`sha256:${cubeHash}`))!]).toEqual([
      ...cubeBytes,
    ])
  })
})
