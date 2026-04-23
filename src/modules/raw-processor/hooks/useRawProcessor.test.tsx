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
  openSession: vi.fn(),
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

async function flushPromises() {
  await Promise.resolve()
  await Promise.resolve()
}

describe('useRawProcessor embedded preview state', () => {
  beforeEach(() => {
    resetToDefaults()
    jotaiStore.set(currentSessionAtom, null)
    rawRuntimeAdapterMock.openSession.mockReset()
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
    rawRuntimeAdapterMock.openSession.mockImplementation(() =>
      Promise.resolve({
        extractEmbeddedPreview: rawRuntimeAdapterMock.extractEmbeddedPreview,
        decodeQuickRaw: rawRuntimeAdapterMock.decodeQuickRaw,
        decodeHqRaw: rawRuntimeAdapterMock.decodeHqRaw,
        dispose: vi.fn(),
      }),
    )
  })

  afterEach(() => {
    act(() => {
      resetToDefaults()
      jotaiStore.set(currentSessionAtom, null)
    })
    vi.unstubAllGlobals()
  })

  it('stores embedded object URLs, upgrades display source, and revokes on reset', async () => {
    const embeddedPreview = deferred<{
      width: number
      height: number
      data: Uint8Array
      mimeType: string
      timings: Record<string, number | undefined>
    } | null>()
    const quickDecode = deferred<DecodedImage>()
    const hqDecode = deferred<DecodedImage>()

    rawRuntimeAdapterMock.extractEmbeddedPreview.mockReturnValue(
      embeddedPreview.promise,
    )
    rawRuntimeAdapterMock.decodeQuickRaw.mockReturnValue(quickDecode.promise)
    rawRuntimeAdapterMock.decodeHqRaw.mockReturnValue(hqDecode.promise)

    const { result } = renderHook(() => useRawProcessor(), { wrapper })
    let loadPromise!: Promise<void>

    await act(async () => {
      loadPromise = result.current.loadFile(new File(['raw'], 'frame.ARW'))
      await Promise.resolve()
    })

    await act(async () => {
      embeddedPreview.resolve({
        width: 1600,
        height: 1067,
        data: new Uint8Array([1, 2, 3]),
        mimeType: 'image/jpeg',
        timings: { total: 8 },
      })
      await flushPromises()
    })
    await waitFor(() => {
      expect(result.current.displaySource).toBe('embedded')
    })
    expect(result.current.embeddedPreviewUrl).toBe('blob:embedded-preview')
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)

    await act(async () => {
      quickDecode.resolve(createDecodedImage('quick'))
      await flushPromises()
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

  it('opens one runtime session for a load and disposes it after preview completion', async () => {
    const file = new File(['raw'], 'frame.ARW')
    const extractEmbeddedPreview = vi.fn().mockResolvedValue(null)
    const decodeQuickRaw = vi
      .fn()
      .mockResolvedValue(createDecodedImage('quick'))
    const decodeHqRaw = vi.fn().mockResolvedValue(createDecodedImage('hq'))
    const dispose = vi.fn()

    rawRuntimeAdapterMock.openSession.mockResolvedValue({
      extractEmbeddedPreview,
      decodeQuickRaw,
      decodeHqRaw,
      dispose,
    })

    const { result } = renderHook(() => useRawProcessor(), { wrapper })

    await act(async () => {
      await result.current.loadFile(file)
    })

    const openSignal = rawRuntimeAdapterMock.openSession.mock.calls[0]?.[1]
    expect(rawRuntimeAdapterMock.openSession).toHaveBeenCalledTimes(1)
    expect(rawRuntimeAdapterMock.openSession).toHaveBeenCalledWith(
      file,
      openSignal,
    )
    expect(openSignal).toBeInstanceOf(AbortSignal)
    expect(openSignal.aborted).toBe(false)
    expect(extractEmbeddedPreview).toHaveBeenCalledWith(openSignal)
    expect(decodeQuickRaw).toHaveBeenCalledWith(
      expect.any(Function),
      openSignal,
    )
    expect(decodeHqRaw).toHaveBeenCalledWith(expect.any(Function), openSignal)
    expect(dispose).toHaveBeenCalledTimes(1)
    expect(rawRuntimeAdapterMock.extractEmbeddedPreview).not.toHaveBeenCalled()
    expect(rawRuntimeAdapterMock.decodeQuickRaw).not.toHaveBeenCalled()
    expect(rawRuntimeAdapterMock.decodeHqRaw).not.toHaveBeenCalled()
  })

  it('aborts and disposes stale runtime session when replacing files', async () => {
    const staleQuickDecode = deferred<DecodedImage>()
    const staleSession = {
      extractEmbeddedPreview: vi.fn().mockResolvedValue(null),
      decodeQuickRaw: vi.fn().mockReturnValue(staleQuickDecode.promise),
      decodeHqRaw: vi.fn(),
      dispose: vi.fn(),
    }
    const currentSession = {
      extractEmbeddedPreview: vi.fn().mockResolvedValue(null),
      decodeQuickRaw: vi.fn().mockResolvedValue(createDecodedImage('quick')),
      decodeHqRaw: vi.fn().mockResolvedValue(createDecodedImage('hq')),
      dispose: vi.fn(),
    }
    let staleSignal: AbortSignal | undefined
    let currentSignal: AbortSignal | undefined

    rawRuntimeAdapterMock.openSession
      .mockImplementationOnce((_file: File, signal?: AbortSignal) => {
        staleSignal = signal
        return Promise.resolve(staleSession)
      })
      .mockImplementationOnce((_file: File, signal?: AbortSignal) => {
        currentSignal = signal
        return Promise.resolve(currentSession)
      })

    const { result } = renderHook(() => useRawProcessor(), { wrapper })
    let staleLoadPromise!: Promise<void>
    let currentLoadPromise!: Promise<void>

    await act(async () => {
      staleLoadPromise = result.current.loadFile(
        new File(['stale'], 'stale.ARW'),
      )
      await Promise.resolve()
    })
    await waitFor(() => {
      expect(staleSession.decodeQuickRaw).toHaveBeenCalled()
    })

    await act(async () => {
      currentLoadPromise = result.current.loadFile(
        new File(['current'], 'current.ARW'),
      )
      await currentLoadPromise
    })

    expect(staleSignal).toBeInstanceOf(AbortSignal)
    expect(staleSignal?.aborted).toBe(true)
    expect(staleSession.dispose).toHaveBeenCalledTimes(1)
    expect(currentSignal).toBeInstanceOf(AbortSignal)
    expect(currentSignal?.aborted).toBe(false)
    expect(currentSession.dispose).toHaveBeenCalledTimes(1)

    await act(async () => {
      staleQuickDecode.reject(new Error('stale decode aborted'))
      await staleLoadPromise
    })

    expect(staleSession.dispose).toHaveBeenCalledTimes(1)
  })

  it('aborts and disposes runtime session on reset', async () => {
    const quickDecode = deferred<DecodedImage>()
    const runtimeSession = {
      extractEmbeddedPreview: vi.fn().mockResolvedValue(null),
      decodeQuickRaw: vi.fn().mockReturnValue(quickDecode.promise),
      decodeHqRaw: vi.fn(),
      dispose: vi.fn(),
    }
    let signal: AbortSignal | undefined

    rawRuntimeAdapterMock.openSession.mockImplementation(
      (_file: File, nextSignal?: AbortSignal) => {
        signal = nextSignal
        return Promise.resolve(runtimeSession)
      },
    )

    const { result } = renderHook(() => useRawProcessor(), { wrapper })
    let loadPromise!: Promise<void>

    await act(async () => {
      loadPromise = result.current.loadFile(new File(['raw'], 'frame.ARW'))
      await Promise.resolve()
    })
    await waitFor(() => {
      expect(runtimeSession.decodeQuickRaw).toHaveBeenCalled()
    })

    act(() => {
      result.current.reset()
    })

    expect(signal).toBeInstanceOf(AbortSignal)
    expect(signal?.aborted).toBe(true)
    expect(runtimeSession.dispose).toHaveBeenCalledTimes(1)
    expect(result.current.status).toBe('idle')

    await act(async () => {
      quickDecode.reject(new Error('reset aborted decode'))
      await loadPromise
    })

    expect(runtimeSession.dispose).toHaveBeenCalledTimes(1)
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

    act(() => {
      unmount()
    })

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
    const currentQuickDecode = deferred<DecodedImage>()
    const currentHqDecode = deferred<DecodedImage>()

    rawRuntimeAdapterMock.extractEmbeddedPreview.mockResolvedValue(null)
    rawRuntimeAdapterMock.decodeQuickRaw
      .mockReturnValueOnce(staleQuickDecode.promise)
      .mockReturnValue(currentQuickDecode.promise)
    rawRuntimeAdapterMock.decodeHqRaw.mockReturnValue(currentHqDecode.promise)

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
      currentQuickDecode.resolve(createDecodedImage('quick'))
      currentHqDecode.resolve(createDecodedImage('hq'))
      await currentLoadPromise
    })
    await waitFor(() => {
      expect(result.current.status).toBe('ready')
    })

    await act(async () => {
      staleQuickDecode.reject(new Error('stale decode failed'))
      await staleLoadPromise
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

    act(() => {
      mounted.unmount()
    })

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

  it('preserves completed failure state across unmount after active load failure', async () => {
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
        new File(['raw'], 'failed.ARW'),
      )
      await Promise.resolve()
    })

    await act(async () => {
      quickDecode.reject(new Error('quick decode failed'))
      await loadPromise
    })

    expect(mounted.result.current.status).toBe('error')
    expect(mounted.result.current.error).toBe('quick decode failed')

    act(() => {
      mounted.unmount()
    })

    const remounted = renderHook(() => useRawProcessor(), { wrapper })
    expect(remounted.result.current.status).toBe('error')
    expect(remounted.result.current.error).toBe('quick decode failed')
    expect(remounted.result.current.sourceFileName).toBe('failed.ARW')

    remounted.unmount()
  })
})
