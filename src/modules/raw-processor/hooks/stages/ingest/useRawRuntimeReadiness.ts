import { useCallback, useEffect, useRef, useState } from 'react'

import type { PrewarmState } from '~/lib/raw/runtime-adapter'
import { rawRuntimeAdapter } from '~/lib/raw/runtime-adapter'

export function useRawRuntimeReadiness() {
  const [runtimeReadinessState, setRuntimeReadinessState] =
    useState<PrewarmState>(() => rawRuntimeAdapter.getPrewarmState())
  const runtimeReadinessMountedRef = useRef(false)

  useEffect(() => {
    runtimeReadinessMountedRef.current = true
    return () => {
      runtimeReadinessMountedRef.current = false
    }
  }, [])

  const syncRuntimeReadinessState = useCallback(() => {
    if (!runtimeReadinessMountedRef.current) return
    setRuntimeReadinessState(rawRuntimeAdapter.getPrewarmState())
  }, [])

  const triggerRawRuntimePrewarm = useCallback(() => {
    if (typeof window === 'undefined') return

    if (import.meta.env.MODE === 'test') {
      syncRuntimeReadinessState()
      return
    }

    const prewarm = rawRuntimeAdapter.prewarm()
    syncRuntimeReadinessState()
    void prewarm.then(syncRuntimeReadinessState, syncRuntimeReadinessState)
  }, [syncRuntimeReadinessState])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (import.meta.env.MODE === 'test') return
    let cancelled = false
    const trigger = () => {
      if (cancelled) return
      triggerRawRuntimePrewarm()
    }
    const win = window as Window & {
      requestIdleCallback?: (
        cb: () => void,
        opts?: { timeout?: number },
      ) => number
      cancelIdleCallback?: (handle: number) => void
    }
    if (typeof win.requestIdleCallback === 'function') {
      const handle = win.requestIdleCallback(trigger, { timeout: 1500 })
      return () => {
        cancelled = true
        win.cancelIdleCallback?.(handle)
      }
    }
    const handle = window.setTimeout(trigger, 200)
    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [triggerRawRuntimePrewarm])

  return { runtimeReadinessState, triggerRawRuntimePrewarm }
}
