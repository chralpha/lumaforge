import { useCallback, useRef, useState } from 'react'

import type { ExportRecoveryState } from '../../../model/session'
import type { PendingRecoveryRetry } from './useExportRecoveryAction'

export function useExportRecoveryState() {
  const discoveredRecoveryRef = useRef<ExportRecoveryState>({ status: 'none' })
  const [discoveredRecovery, setDiscoveredRecovery] =
    useState<ExportRecoveryState>({ status: 'none' })
  const [pendingRecoveryRetry, setPendingRecoveryRetry] =
    useState<PendingRecoveryRetry | null>(null)

  const setDiscoveredRecoveryState = useCallback(
    (next: ExportRecoveryState) => {
      discoveredRecoveryRef.current = next
      setDiscoveredRecovery(next)
    },
    [],
  )

  return {
    discoveredRecovery,
    discoveredRecoveryRef,
    setDiscoveredRecoveryState,
    pendingRecoveryRetry,
    setPendingRecoveryRetry,
  }
}
