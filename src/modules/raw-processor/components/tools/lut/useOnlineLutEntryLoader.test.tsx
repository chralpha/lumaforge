import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { LutLoadOutcome } from '../../../services/look/orchestrate-lut-load'
import { useOnlineLutEntryLoader } from './useOnlineLutEntryLoader'

function buildSource(overrides: {
  loadEntry?: (entryId: string) => Promise<LutLoadOutcome>
  loadingEntryId?: string | null
  failedEntryId?: string | null
}) {
  return {
    loadEntry:
      overrides.loadEntry ??
      vi.fn(async (): Promise<LutLoadOutcome> => 'loaded'),
    loadingEntryId: overrides.loadingEntryId ?? null,
    failedEntryId: overrides.failedEntryId ?? null,
  }
}

describe('useOnlineLutEntryLoader', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 0
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('acks the click locally and runs the success callback after load', async () => {
    let resolveLoad: ((outcome: 'loaded') => void) | undefined
    const loadEntry = vi.fn(
      () =>
        new Promise<LutLoadOutcome>((resolve) => {
          resolveLoad = resolve as (outcome: 'loaded') => void
        }),
    )
    const onLoaded = vi.fn()

    const { result } = renderHook(() =>
      useOnlineLutEntryLoader(buildSource({ loadEntry })),
    )
    let loading!: Promise<void>

    act(() => {
      loading = result.current.loadOnlineLutEntry('entry-1', onLoaded)
    })
    // The clicked surface acks immediately, before the shared lock engages.
    expect(result.current.loadingEntryId).toBe('entry-1')
    await waitFor(() => expect(loadEntry).toHaveBeenCalledWith('entry-1'))

    await act(async () => {
      resolveLoad?.('loaded')
      await loading
    })

    expect(onLoaded).toHaveBeenCalledTimes(1)
    expect(result.current.loadingEntryId).toBeNull()
  })

  it('does not run the success callback when loading rejects', async () => {
    const loadEntry = vi.fn(() => Promise.reject(new Error('network')))
    const onLoaded = vi.fn()

    const { result } = renderHook(() =>
      useOnlineLutEntryLoader(buildSource({ loadEntry })),
    )

    await act(async () => {
      await result.current.loadOnlineLutEntry('entry-1', onLoaded)
    })

    expect(onLoaded).not.toHaveBeenCalled()
    expect(result.current.loadingEntryId).toBeNull()
  })

  it("does not run the success callback when the load resolves 'failed'", async () => {
    const loadEntry = vi.fn(async (): Promise<LutLoadOutcome> => 'failed')
    const onLoaded = vi.fn()

    const { result } = renderHook(() =>
      useOnlineLutEntryLoader(buildSource({ loadEntry })),
    )

    await act(async () => {
      await result.current.loadOnlineLutEntry('entry-1', onLoaded)
    })

    expect(onLoaded).not.toHaveBeenCalled()
  })

  it("does not run the success callback when the load resolves 'aborted'", async () => {
    const loadEntry = vi.fn(async (): Promise<LutLoadOutcome> => 'aborted')
    const onLoaded = vi.fn()

    const { result } = renderHook(() =>
      useOnlineLutEntryLoader(buildSource({ loadEntry })),
    )

    await act(async () => {
      await result.current.loadOnlineLutEntry('entry-1', onLoaded)
    })

    expect(onLoaded).not.toHaveBeenCalled()
  })

  it('mirrors the shared loading and failed state from the source', () => {
    const { result } = renderHook(() =>
      useOnlineLutEntryLoader(
        buildSource({ loadingEntryId: 'entry-2', failedEntryId: 'entry-9' }),
      ),
    )

    expect(result.current.loadingEntryId).toBe('entry-2')
    expect(result.current.failedEntryId).toBe('entry-9')
  })

  it('ignores clicks while another surface holds the shared lock', async () => {
    const loadEntry = vi.fn(async (): Promise<LutLoadOutcome> => 'loaded')

    const { result } = renderHook(() =>
      useOnlineLutEntryLoader(
        buildSource({ loadEntry, loadingEntryId: 'entry-other' }),
      ),
    )

    await act(async () => {
      await result.current.loadOnlineLutEntry('entry-1')
    })

    expect(loadEntry).not.toHaveBeenCalled()
  })
})
