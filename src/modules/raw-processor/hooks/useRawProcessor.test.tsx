import { act, renderHook, waitFor } from '@testing-library/react'
import { Provider } from 'jotai'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { resetToDefaults } from '~/atoms/raw-processor'
import { jotaiStore } from '~/lib/jotai'
import type { DecodedImage } from '~/lib/raw/decoder'

import { currentSessionAtom } from '../state/session.atoms'
import { useRawProcessor } from './useRawProcessor'

const rawRuntimeAdapterMock = vi.hoisted(() => ({
  extractEmbeddedPreview: vi.fn(),
  decodeQuickRaw: vi.fn(),
  decodeHqRaw: vi.fn(),
}))

const toastMock = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
}))

vi.mock('~/lib/raw/runtime-adapter', () => ({
  rawRuntimeAdapter: rawRuntimeAdapterMock,
}))

vi.mock('sonner', () => ({
  toast: toastMock,
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve
    reject = innerReject
  })

  return { promise, resolve, reject }
}

function createDecodedImage(source: 'quick' | 'hq'): DecodedImage {
  const isQuick = source === 'quick'

  return {
    width: isQuick ? 800 : 4000,
    height: isQuick ? 600 : 3000,
    channels: 3,
    bitsPerChannel: 16,
    data: new Uint16Array([0, 1024, 65535]),
    layout: 'rgb-u16',
    colorSpace: 'linear-prophoto-rgb',
    source,
    timings: { total: isQuick ? 20 : 120 },
    metadata: {
      make: 'Sony',
      model: 'A7',
      width: isQuick ? 800 : 4000,
      height: isQuick ? 600 : 3000,
    },
  }
}

function wrapper({ children }: { children: ReactNode }) {
  return <Provider store={jotaiStore}>{children}</Provider>
}

describe('useRawProcessor embedded preview state', () => {
  beforeEach(() => {
    resetToDefaults()
    jotaiStore.set(currentSessionAtom, null)
    rawRuntimeAdapterMock.extractEmbeddedPreview.mockReset()
    rawRuntimeAdapterMock.decodeQuickRaw.mockReset()
    rawRuntimeAdapterMock.decodeHqRaw.mockReset()
    toastMock.success.mockReset()
    toastMock.error.mockReset()
    toastMock.info.mockReset()

    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:embedded-preview'),
      revokeObjectURL: vi.fn(),
    })
  })

  afterEach(() => {
    resetToDefaults()
    jotaiStore.set(currentSessionAtom, null)
    vi.unstubAllGlobals()
  })

  it('stores embedded object URLs, upgrades display source, and revokes on reset', async () => {
    const quickDecode = deferred<DecodedImage>()
    const hqDecode = deferred<DecodedImage>()

    rawRuntimeAdapterMock.extractEmbeddedPreview.mockResolvedValue({
      width: 1600,
      height: 1067,
      data: new Uint8Array([1, 2, 3]),
      mimeType: 'image/jpeg',
      timings: { total: 8 },
    })
    rawRuntimeAdapterMock.decodeQuickRaw.mockReturnValue(quickDecode.promise)
    rawRuntimeAdapterMock.decodeHqRaw.mockReturnValue(hqDecode.promise)

    const { result } = renderHook(() => useRawProcessor(), { wrapper })
    let loadPromise!: Promise<void>

    await act(async () => {
      loadPromise = result.current.loadFile(new File(['raw'], 'frame.ARW'))
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(result.current.displaySource).toBe('embedded')
    })
    expect(result.current.embeddedPreviewUrl).toBe('blob:embedded-preview')
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)

    await act(async () => {
      quickDecode.resolve(createDecodedImage('quick'))
      await Promise.resolve()
    })
    await waitFor(() => {
      expect(result.current.displaySource).toBe('quick')
    })
    expect(result.current.embeddedPreviewUrl).toBe('blob:embedded-preview')

    await act(async () => {
      hqDecode.resolve(createDecodedImage('hq'))
      await loadPromise
    })
    await waitFor(() => {
      expect(result.current.displaySource).toBe('hq')
    })

    act(() => {
      result.current.reset()
    })

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:embedded-preview')
    expect(result.current.embeddedPreviewUrl).toBeNull()
    expect(result.current.displaySource).toBe('none')
  })

  it('does not create embedded object URLs after unmount', async () => {
    const embeddedPreview = deferred<{
      width: number
      height: number
      data: Uint8Array
      mimeType: string
      timings: Record<string, number | undefined>
    } | null>()

    rawRuntimeAdapterMock.extractEmbeddedPreview.mockReturnValue(
      embeddedPreview.promise,
    )
    rawRuntimeAdapterMock.decodeQuickRaw.mockResolvedValue(
      createDecodedImage('quick'),
    )
    rawRuntimeAdapterMock.decodeHqRaw.mockResolvedValue(
      createDecodedImage('hq'),
    )

    const { result, unmount } = renderHook(() => useRawProcessor(), { wrapper })
    let loadPromise!: Promise<void>

    await act(async () => {
      loadPromise = result.current.loadFile(new File(['raw'], 'frame.ARW'))
      await Promise.resolve()
    })

    unmount()

    await act(async () => {
      embeddedPreview.resolve({
        width: 1600,
        height: 1067,
        data: new Uint8Array([1, 2, 3]),
        mimeType: 'image/jpeg',
        timings: { total: 8 },
      })
      await loadPromise
    })

    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })

  it('ignores stale load failures after a replacement session starts', async () => {
    const staleQuickDecode = deferred<DecodedImage>()

    rawRuntimeAdapterMock.extractEmbeddedPreview.mockResolvedValue(null)
    rawRuntimeAdapterMock.decodeQuickRaw
      .mockReturnValueOnce(staleQuickDecode.promise)
      .mockResolvedValue(createDecodedImage('quick'))
    rawRuntimeAdapterMock.decodeHqRaw.mockResolvedValue(
      createDecodedImage('hq'),
    )

    const { result } = renderHook(() => useRawProcessor(), { wrapper })
    let staleLoadPromise!: Promise<void>
    let currentLoadPromise!: Promise<void>

    await act(async () => {
      staleLoadPromise = result.current.loadFile(
        new File(['stale'], 'stale.ARW'),
      )
      await Promise.resolve()
    })

    await act(async () => {
      currentLoadPromise = result.current.loadFile(
        new File(['current'], 'current.ARW'),
      )
      await Promise.resolve()
    })

    await act(async () => {
      staleQuickDecode.reject(new Error('stale decode failed'))
      await staleLoadPromise
      await currentLoadPromise
    })

    await waitFor(() => {
      expect(result.current.status).toBe('ready')
    })
    expect(result.current.error).toBeNull()
    expect(result.current.sourceFileName).toBe('current.ARW')
    expect(toastMock.error).not.toHaveBeenCalledWith(
      'Failed to load RAW file',
      expect.anything(),
    )
  })

  it('clears in-flight loading state on unmount so remount starts idle', async () => {
    const quickDecode = deferred<DecodedImage>()

    rawRuntimeAdapterMock.extractEmbeddedPreview.mockResolvedValue(null)
    rawRuntimeAdapterMock.decodeQuickRaw.mockReturnValue(quickDecode.promise)
    rawRuntimeAdapterMock.decodeHqRaw.mockResolvedValue(
      createDecodedImage('hq'),
    )

    const mounted = renderHook(() => useRawProcessor(), { wrapper })
    let loadPromise!: Promise<void>

    await act(async () => {
      loadPromise = mounted.result.current.loadFile(
        new File(['raw'], 'frame.ARW'),
      )
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(mounted.result.current.status).toBe('loading')
    })

    mounted.unmount()

    const remounted = renderHook(() => useRawProcessor(), { wrapper })
    expect(remounted.result.current.status).toBe('idle')
    expect(remounted.result.current.displaySource).toBe('none')

    await act(async () => {
      quickDecode.reject(new Error('late decode failed'))
      await loadPromise
    })

    expect(remounted.result.current.status).toBe('idle')
    expect(remounted.result.current.error).toBeNull()
    expect(toastMock.error).not.toHaveBeenCalledWith(
      'Failed to load RAW file',
      expect.anything(),
    )

    remounted.unmount()
  })
})
