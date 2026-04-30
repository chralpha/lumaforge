import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { OnlineLUTEntry } from '~/lib/profiles/catalog'
import { fetchJsonWithLimit } from '~/lib/profiles/fetch'

import { useOnlineLutSources } from './useOnlineLutSources'

vi.mock('~/lib/profiles/fetch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/lib/profiles/fetch')>()),
  fetchJsonWithLimit: vi.fn(),
}))

const mockedFetchJson = vi.mocked(fetchJsonWithLimit)

const sha256 =
  '9c56cc51b374c3ba189210d5b6d4bf57790d351c96c47c02190ecf1e430635ab'
const catalogUrl =
  'https://profiles.example.com/releases/v2026.05.01/catalog.json'
const entryUrl =
  'https://profiles.example.com/releases/v2026.05.01/entries/kodak-2383-rec709.json'
const cubeUrl = `https://profiles.example.com/blobs/sha256/9c/56/${sha256}.cube`

const primaryAsset = {
  role: 'cube-lut',
  mediaType: 'application/x-cube-lut',
  size: 12,
  sha256,
  url: cubeUrl,
}

function entryManifest(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    id: 'kodak-2383-rec709',
    kind: 'lut',
    format: 'cube',
    version: '1.0.0',
    title: 'Kodak 2383 Rec.709',
    description: null,
    license: 'NOASSERTION',
    author: 'Unknown',
    source: 'Unknown',
    sourceUrl: null,
    redistributionAllowed: true,
    targets: {},
    manifestPath: 'profiles/kodak-2383-rec709/manifest.json',
    entryUrl,
    primaryAsset,
    assets: [],
    createdAt: '2026-04-30T00:00:00.000Z',
    updatedAt: '2026-04-30T00:00:00.000Z',
    lut: {
      intent: 'combined-look-output',
      input: { gamut: 'arri-wide-gamut-3', transfer: 'logc3', range: 'full' },
      output: { gamut: 'rec709', transfer: 'gamma24', range: 'legal' },
    },
    tags: ['film-print'],
    ...overrides,
  }
}

function catalogDocument() {
  return {
    schemaVersion: 1,
    entries: [
      {
        id: 'kodak-2383-rec709',
        kind: 'lut',
        version: '1.0.0',
        title: 'Kodak 2383 Rec.709',
        license: 'NOASSERTION',
        redistributionAllowed: true,
        primaryAsset,
        entryUrl,
      },
    ],
  }
}

function createLoadOnlineLUT() {
  return vi.fn(
    async (_entry: OnlineLUTEntry, _options?: { signal?: AbortSignal }) => {},
  )
}

function setupFetchJson(fixtures: Record<string, unknown>) {
  mockedFetchJson.mockImplementation(async (url) => {
    if (url.endsWith('.cube')) {
      throw new Error(`CUBE bytes must not be fetched: ${url}`)
    }

    if (!(url in fixtures)) {
      throw new Error(`Missing fixture for ${url}`)
    }

    return fixtures[url]
  })
}

describe('useOnlineLutSources', () => {
  beforeEach(() => {
    mockedFetchJson.mockReset()
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: vi.fn(async () => {}),
      },
    })
  })

  it('parses and resolves query resources once on first RAW Lab load', async () => {
    setupFetchJson({
      [catalogUrl]: catalogDocument(),
      [entryUrl]: entryManifest(),
    })

    const loadOnlineLUT = createLoadOnlineLUT()
    const { result } = renderHook(
      ({ search }) =>
        useOnlineLutSources({
          search,
          pathname: '/raw',
          loadOnlineLUT,
        }),
      {
        initialProps: {
          search: `?luts=${encodeURIComponent(catalogUrl)}`,
        },
      },
    )

    await waitFor(() => expect(result.current.state.entries).toHaveLength(1))

    expect(result.current.state.resources).toHaveLength(1)
    expect(result.current.state.resources[0]).toMatchObject({
      url: catalogUrl,
      type: 'catalog',
    })
    expect(result.current.state.entries[0]).toMatchObject({
      title: 'Kodak 2383 Rec.709',
      resourceId: 'lut-source-1',
    })
    expect(mockedFetchJson).toHaveBeenCalledTimes(2)
  })

  it('does not duplicate resources when re-rendering with the same search string', async () => {
    setupFetchJson({
      [catalogUrl]: catalogDocument(),
      [entryUrl]: entryManifest(),
    })

    const loadOnlineLUT = createLoadOnlineLUT()
    const { result, rerender } = renderHook(
      ({ search }) =>
        useOnlineLutSources({
          search,
          pathname: '/raw',
          loadOnlineLUT,
        }),
      {
        initialProps: {
          search: `?luts=${encodeURIComponent(catalogUrl)}`,
        },
      },
    )

    await waitFor(() => expect(result.current.state.entries).toHaveLength(1))
    rerender({ search: `?luts=${encodeURIComponent(catalogUrl)}` })

    expect(result.current.state.resources).toHaveLength(1)
    expect(result.current.state.entries).toHaveLength(1)
    expect(mockedFetchJson).toHaveBeenCalledTimes(2)
  })

  it('keeps share disabled when no valid source has entries', () => {
    const { result } = renderHook(() =>
      useOnlineLutSources({
        search: '',
        pathname: '/raw',
        loadOnlineLUT: createLoadOnlineLUT(),
      }),
    )

    expect(result.current.share.enabled).toBe(false)
    expect(result.current.share.url).toBe('/raw')
  })

  it('enables share when a valid source has entries', async () => {
    setupFetchJson({
      [catalogUrl]: catalogDocument(),
      [entryUrl]: entryManifest(),
    })

    const { result } = renderHook(() =>
      useOnlineLutSources({
        search: `?luts=${encodeURIComponent(catalogUrl)}`,
        pathname: '/raw',
        loadOnlineLUT: createLoadOnlineLUT(),
      }),
    )

    await waitFor(() => expect(result.current.share.enabled).toBe(true))
    expect(result.current.share.url).toBe(
      `/raw?luts=${encodeURIComponent(catalogUrl)}`,
    )
  })

  it('copies the canonical source share URL', async () => {
    setupFetchJson({
      [catalogUrl]: catalogDocument(),
      [entryUrl]: entryManifest(),
    })

    const { result } = renderHook(() =>
      useOnlineLutSources({
        search: `?luts=${encodeURIComponent(catalogUrl)}`,
        pathname: '/raw',
        loadOnlineLUT: createLoadOnlineLUT(),
      }),
    )

    await waitFor(() => expect(result.current.share.enabled).toBe(true))
    await act(async () => {
      await result.current.share.copy()
    })

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      `/raw?luts=${encodeURIComponent(catalogUrl)}`,
    )
  })

  it('preserves invalid query issues while resolving valid query resources', async () => {
    setupFetchJson({
      [catalogUrl]: catalogDocument(),
      [entryUrl]: entryManifest(),
    })

    const { result } = renderHook(() =>
      useOnlineLutSources({
        search: `?luts=${encodeURIComponent('ftp://example.com/look.cube')}&luts=${encodeURIComponent(catalogUrl)}`,
        pathname: '/raw',
        loadOnlineLUT: createLoadOnlineLUT(),
      }),
    )

    await waitFor(() => expect(result.current.state.entries).toHaveLength(1))

    expect(result.current.state.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'unsupported-scheme',
          raw: 'ftp://example.com/look.cube',
        }),
      ]),
    )
  })

  it('creates a direct CUBE entry without fetching CUBE bytes', async () => {
    const { result } = renderHook(() =>
      useOnlineLutSources({
        search: `?luts=${encodeURIComponent(cubeUrl)}`,
        pathname: '/raw',
        loadOnlineLUT: createLoadOnlineLUT(),
      }),
    )

    await waitFor(() => expect(result.current.state.entries).toHaveLength(1))

    expect(mockedFetchJson).not.toHaveBeenCalled()
    expect(result.current.state.entries[0]).toMatchObject({
      id: 'lut-source-1',
      title: `${sha256}.cube`,
      sourceType: 'direct-cube',
      cube: { url: cubeUrl },
    })
  })
})
