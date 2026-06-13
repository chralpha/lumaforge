import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { RawRuntimeSession } from '~/lib/raw/runtime-adapter'

import { useRawRuntimeControls } from './useRawRuntimeControls'

function createRuntimeSession(): RawRuntimeSession {
  return {
    sourceDimensions: {},
    extractEmbeddedPreview: vi.fn(),
    decodeQuickRaw: vi.fn(),
    decodeBoundedHqRaw: vi.fn(),
    applyCalibration: vi.fn().mockResolvedValue({ applied: true } as const),
    dispose: vi.fn(),
  }
}

describe('useRawRuntimeControls', () => {
  it('disposes each runtime session once and clears the active session ref', () => {
    const runtimeSession = createRuntimeSession()
    const runtimeSessionRef = { current: runtimeSession }
    const disposedRuntimeSessionsRef = {
      current: new WeakSet<RawRuntimeSession>(),
    }

    const { result } = renderHook(() =>
      useRawRuntimeControls({
        runtimeSessionRef,
        runtimeAbortControllerRef: { current: null },
        runtimeWorkSessionIdRef: { current: null },
        exportAbortControllerRef: { current: null },
        disposedRuntimeSessionsRef,
      }),
    )

    result.current.disposeRuntimeSession(runtimeSession)
    result.current.disposeRuntimeSession(runtimeSession)

    expect(runtimeSession.dispose).toHaveBeenCalledTimes(1)
    expect(runtimeSessionRef.current).toBeNull()
  })

  it('aborts active runtime and export work', () => {
    const runtimeAbortController = new AbortController()
    const exportAbortController = new AbortController()
    const runtimeSession = createRuntimeSession()
    const runtimeAbortControllerRef = { current: runtimeAbortController }
    const exportAbortControllerRef = { current: exportAbortController }
    const runtimeWorkSessionIdRef = { current: 'runtime-work' }
    const runtimeSessionRef = { current: runtimeSession }

    const { result } = renderHook(() =>
      useRawRuntimeControls({
        runtimeSessionRef,
        runtimeAbortControllerRef,
        runtimeWorkSessionIdRef,
        exportAbortControllerRef,
        disposedRuntimeSessionsRef: {
          current: new WeakSet<RawRuntimeSession>(),
        },
      }),
    )

    result.current.abortRuntimeWork()
    result.current.abortExportWork()

    expect(runtimeAbortController.signal.aborted).toBe(true)
    expect(exportAbortController.signal.aborted).toBe(true)
    expect(runtimeAbortControllerRef.current).toBeNull()
    expect(exportAbortControllerRef.current).toBeNull()
    expect(runtimeWorkSessionIdRef.current).toBeNull()
    expect(runtimeSession.dispose).toHaveBeenCalledTimes(1)
    expect(runtimeSessionRef.current).toBeNull()
  })
})
