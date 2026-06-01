import type { MutableRefObject } from 'react'
import { useCallback } from 'react'

import type { RawRuntimeSession } from '~/lib/raw/runtime-adapter'

type UseRawRuntimeControlsInput = {
  runtimeSessionRef: MutableRefObject<RawRuntimeSession | null>
  runtimeAbortControllerRef: MutableRefObject<AbortController | null>
  runtimeWorkSessionIdRef: MutableRefObject<string | null>
  exportAbortControllerRef: MutableRefObject<AbortController | null>
  disposedRuntimeSessionsRef: MutableRefObject<WeakSet<RawRuntimeSession>>
}

export function useRawRuntimeControls({
  runtimeSessionRef,
  runtimeAbortControllerRef,
  runtimeWorkSessionIdRef,
  exportAbortControllerRef,
  disposedRuntimeSessionsRef,
}: UseRawRuntimeControlsInput) {
  const disposeRuntimeSession = useCallback(
    (runtimeSession = runtimeSessionRef.current) => {
      if (
        !runtimeSession ||
        disposedRuntimeSessionsRef.current.has(runtimeSession)
      ) {
        return
      }

      disposedRuntimeSessionsRef.current.add(runtimeSession)
      runtimeSession.dispose()
      if (runtimeSessionRef.current === runtimeSession) {
        runtimeSessionRef.current = null
      }
    },
    [disposedRuntimeSessionsRef, runtimeSessionRef],
  )

  const abortRuntimeWork = useCallback(() => {
    runtimeWorkSessionIdRef.current = null
    const controller = runtimeAbortControllerRef.current
    if (controller && !controller.signal.aborted) {
      controller.abort()
    }
    runtimeAbortControllerRef.current = null
    disposeRuntimeSession()
  }, [
    disposeRuntimeSession,
    runtimeAbortControllerRef,
    runtimeWorkSessionIdRef,
  ])

  const abortExportWork = useCallback(() => {
    const controller = exportAbortControllerRef.current
    if (controller && !controller.signal.aborted) {
      controller.abort()
    }
    exportAbortControllerRef.current = null
  }, [exportAbortControllerRef])

  return {
    disposeRuntimeSession,
    abortRuntimeWork,
    abortExportWork,
  }
}
