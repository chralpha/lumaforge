import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useOnlineLutEntryLoader } from './useOnlineLutEntryLoader'

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

  it('tracks the loading entry and runs the success callback after load', async () => {
    let resolveLoad: (() => void) | undefined
    const loadEntry = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveLoad = resolve
        }),
    )
    const onLoaded = vi.fn()

    const { result } = renderHook(() => useOnlineLutEntryLoader(loadEntry))
    let loading!: Promise<void>

    act(() => {
      loading = result.current.loadOnlineLutEntry('entry-1', onLoaded)
    })
    expect(result.current.loadingEntryId).toBe('entry-1')
    await waitFor(() => expect(loadEntry).toHaveBeenCalledWith('entry-1'))

    await act(async () => {
      resolveLoad?.()
      await loading
    })

    expect(loadEntry).toHaveBeenCalledWith('entry-1')
    expect(onLoaded).toHaveBeenCalledTimes(1)
    expect(result.current.loadingEntryId).toBeNull()
  })

  it('does not run the success callback when loading fails', async () => {
    const loadEntry = vi.fn(() => Promise.reject(new Error('network')))
    const onLoaded = vi.fn()

    const { result } = renderHook(() => useOnlineLutEntryLoader(loadEntry))

    await act(async () => {
      await result.current.loadOnlineLutEntry('entry-1', onLoaded)
    })

    expect(onLoaded).not.toHaveBeenCalled()
    expect(result.current.loadingEntryId).toBeNull()
  })
})
