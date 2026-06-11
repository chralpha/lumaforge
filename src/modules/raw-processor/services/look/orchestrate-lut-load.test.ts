import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { OnlineLUTEntry } from '~/lib/profiles/catalog'
import {
  fetchCachedBytesWithLimit,
  fetchVerifiedCubeAsset,
} from '~/lib/profiles/fetch'

import type { LutLoadContext } from './orchestrate-lut-load'
import {
  orchestrateLutLoadFromFile,
  orchestrateOnlineLutLoad,
} from './orchestrate-lut-load'

vi.mock('~/lib/profiles/fetch', () => ({
  createBrowserOnlineProfileCache: vi.fn(() => ({})),
  fetchVerifiedCubeAsset: vi.fn(),
  fetchCachedBytesWithLimit: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
  },
}))

function cubeText(size: number): string {
  const lines = [`TITLE "Outcome Fixture"`, `LUT_3D_SIZE ${size}`]
  const step = 1 / (size - 1)
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        lines.push(
          `${(r * step).toFixed(6)} ${(g * step).toFixed(6)} ${(b * step).toFixed(6)}`,
        )
      }
    }
  }
  return lines.join('\n')
}

function buildCtx() {
  const scheduledToasts: Array<() => void> = []
  const ctx: LutLoadContext = {
    atoms: {
      setLut: vi.fn(),
      setSession: vi.fn(),
      setParams: vi.fn(),
      getProcessingParams: vi.fn(() => ({}) as never),
      lut: null,
      activeStyle: null,
    },
    refs: {
      lutDataRef: { current: null },
      sessionRef: { current: null },
    },
    services: {
      scheduleToast: (notify) => {
        scheduledToasts.push(notify)
      },
      invalidateExportGraph: vi.fn(),
      setLutDataRef: vi.fn(),
    },
  }
  return { ctx, scheduledToasts }
}

/** jsdom's File lacks Blob.text(); patch the instance to match browsers. */
function asTextFile(text: string, name: string): File {
  const file = new File([text], name, { type: 'text/plain' })
  if (typeof file.text !== 'function') {
    Object.defineProperty(file, 'text', {
      value: () => Promise.resolve(text),
    })
  }
  return file
}

const entry: OnlineLUTEntry = {
  id: 'entry-1',
  title: 'Entry One',
  sourceUrl: 'https://example.com/entry-1.json',
  sourceType: 'catalog-entry',
  cube: {
    url: 'https://example.com/entry-1.cube',
    sha256: 'a'.repeat(64),
    bytes: 64,
  },
  tags: [],
}

describe('orchestrateOnlineLutLoad outcome', () => {
  beforeEach(() => {
    vi.mocked(fetchVerifiedCubeAsset).mockReset()
    vi.mocked(fetchCachedBytesWithLimit).mockReset()
  })

  it("returns 'loaded' and applies the LUT when download and parse succeed", async () => {
    vi.mocked(fetchVerifiedCubeAsset).mockResolvedValue(
      new TextEncoder().encode(cubeText(17)),
    )
    const { ctx, scheduledToasts } = buildCtx()

    const outcome = await orchestrateOnlineLutLoad(entry, undefined, ctx)

    expect(outcome).toBe('loaded')
    expect(ctx.atoms.setLut).toHaveBeenCalledTimes(1)
    expect(scheduledToasts).toHaveLength(1)
  })

  it("returns 'failed' and schedules a failure toast when the download fails", async () => {
    vi.mocked(fetchVerifiedCubeAsset).mockRejectedValue(
      new Error('HTTP 404 Not Found'),
    )
    const { ctx, scheduledToasts } = buildCtx()

    const outcome = await orchestrateOnlineLutLoad(entry, undefined, ctx)

    expect(outcome).toBe('failed')
    expect(ctx.atoms.setLut).not.toHaveBeenCalled()
    expect(scheduledToasts).toHaveLength(1)
  })

  it('forwards download progress events from the verified fetch', async () => {
    vi.mocked(fetchVerifiedCubeAsset).mockImplementation(
      async (_asset, options) => {
        options.onProgress?.(8, 64)
        options.onProgress?.(64, 64)
        return new TextEncoder().encode(cubeText(17))
      },
    )
    const { ctx } = buildCtx()
    const events: Array<[number, number | undefined]> = []

    const outcome = await orchestrateOnlineLutLoad(
      entry,
      { onProgress: (received, total) => events.push([received, total]) },
      ctx,
    )

    expect(outcome).toBe('loaded')
    expect(events).toEqual([
      [8, 64],
      [64, 64],
    ])
  })

  it("returns 'aborted' without fetching when the signal is already aborted", async () => {
    const controller = new AbortController()
    controller.abort()
    const { ctx, scheduledToasts } = buildCtx()

    const outcome = await orchestrateOnlineLutLoad(
      entry,
      { signal: controller.signal },
      ctx,
    )

    expect(outcome).toBe('aborted')
    expect(fetchVerifiedCubeAsset).not.toHaveBeenCalled()
    expect(scheduledToasts).toHaveLength(0)
  })

  it("returns 'aborted' without toasting when the fetch aborts mid-flight", async () => {
    vi.mocked(fetchVerifiedCubeAsset).mockRejectedValue(
      new DOMException('Aborted', 'AbortError'),
    )
    const { ctx, scheduledToasts } = buildCtx()

    const outcome = await orchestrateOnlineLutLoad(entry, undefined, ctx)

    expect(outcome).toBe('aborted')
    expect(scheduledToasts).toHaveLength(0)
  })
})

describe('orchestrateLutLoadFromFile outcome', () => {
  it("returns 'loaded' for a valid .cube file", async () => {
    const file = asTextFile(cubeText(17), 'fixture.cube')
    const { ctx } = buildCtx()

    const outcome = await orchestrateLutLoadFromFile(file, ctx)

    expect(outcome).toBe('loaded')
    expect(ctx.atoms.setLut).toHaveBeenCalledTimes(1)
  })

  it("returns 'failed' for an unsupported format", async () => {
    const file = asTextFile('not a lut', 'fixture.txt')
    const { ctx, scheduledToasts } = buildCtx()

    const outcome = await orchestrateLutLoadFromFile(file, ctx)

    expect(outcome).toBe('failed')
    expect(scheduledToasts).toHaveLength(1)
  })
})
