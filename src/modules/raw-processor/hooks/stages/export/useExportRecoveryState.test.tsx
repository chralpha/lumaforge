import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { ExportRecoveryState } from '../../../model/session'
import { useExportRecoveryState } from './useExportRecoveryState'

describe('useExportRecoveryState', () => {
  it('keeps discovered recovery state mirrored into the imperative ref', () => {
    const { result } = renderHook(() => useExportRecoveryState())
    const nextRecovery: ExportRecoveryState = {
      status: 'ready-to-retry',
      exportId: 'export-1',
      message: 'Resume interrupted export.',
    }

    expect(result.current.discoveredRecovery).toEqual({ status: 'none' })
    expect(result.current.discoveredRecoveryRef.current).toEqual({
      status: 'none',
    })
    expect(result.current.pendingRecoveryRetry).toBeNull()

    act(() => {
      result.current.setDiscoveredRecoveryState(nextRecovery)
    })

    expect(result.current.discoveredRecovery).toBe(nextRecovery)
    expect(result.current.discoveredRecoveryRef.current).toBe(nextRecovery)
  })
})
