import type { ProcessingParams } from '@lumaforge/luma-color-runtime'
import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useRawAdjustmentActions } from './useRawAdjustmentActions'

const baseParams: ProcessingParams = {
  intensity: 0.7,
  viewMode: 'processed',
  compareSplit: 0.5,
  styleKind: 'none',
  builtinPreset: null,
  userExposureEv: 0,
  userContrast: 0,
  userHighlights: 0,
  userShadows: 0,
  userWhites: 0,
  userBlacks: 0,
  userTemperature: 0,
  userTint: 0,
}

describe('useRawAdjustmentActions', () => {
  it('routes view-only params separately from render params', () => {
    const setParams = vi.fn()
    const setViewMode = vi.fn()
    const setCompareSplit = vi.fn()
    const invalidateExportGraph = vi.fn()
    const { result } = renderHook(() =>
      useRawAdjustmentActions({
        params: baseParams,
        setParams,
        invalidateExportGraph,
        setViewMode,
        setCompareSplit,
      }),
    )

    result.current.setParams({
      viewMode: 'compare',
      compareSplit: 0.25,
      userExposureEv: 1,
    })

    expect(setViewMode).toHaveBeenCalledWith('compare')
    expect(setCompareSplit).toHaveBeenCalledWith(0.25)
    expect(setParams).toHaveBeenCalledTimes(1)
    expect(invalidateExportGraph).toHaveBeenCalledTimes(1)
  })
})
