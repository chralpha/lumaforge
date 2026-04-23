import { act, renderHook, waitFor } from '@testing-library/react'
import { Provider } from 'jotai'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { DecodedImage } from '~/lib/raw/decoder'

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
  return <Provider>{children}</Provider>
}

describe('useRawProcessor embedded preview state', () => {
  beforeEach(() => {
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
})
