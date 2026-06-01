import type { ProcessingParams } from '@lumaforge/luma-color-runtime'
import { useCallback } from 'react'

import { changesRenderGraphParams } from '../../../services/export/export-state'
import {
  computeColorParams,
  computeToneParams,
} from '../../../services/look/orchestrate-params-update'

type SetProcessingParams = (
  value: ProcessingParams | ((prev: ProcessingParams) => ProcessingParams),
) => void

type UseRawAdjustmentActionsInput = {
  params: ProcessingParams
  setParams: SetProcessingParams
  invalidateExportGraph: () => void
  setViewMode?: (mode: ProcessingParams['viewMode']) => void
  setCompareSplit?: (split: number) => void
}

export function useRawAdjustmentActions({
  params,
  setParams,
  invalidateExportGraph,
  setViewMode,
  setCompareSplit,
}: UseRawAdjustmentActionsInput) {
  const setProcessingParams = useCallback(
    (newParams: Partial<ProcessingParams>) => {
      const { viewMode, compareSplit, ...renderParamPatch } = newParams
      const shouldClearExportResult = changesRenderGraphParams(
        params,
        renderParamPatch,
      )
      if (Object.keys(renderParamPatch).length > 0) {
        setParams((prev) => ({ ...prev, ...renderParamPatch }))
      }
      if (viewMode) {
        setViewMode?.(viewMode)
      }
      if (compareSplit !== undefined) {
        setCompareSplit?.(compareSplit)
      }
      if (shouldClearExportResult) {
        invalidateExportGraph()
      }
    },
    [invalidateExportGraph, params, setCompareSplit, setParams, setViewMode],
  )

  const setToneParams = useCallback(
    (
      toneParams: Partial<
        Pick<
          ProcessingParams,
          | 'userExposureEv'
          | 'userContrast'
          | 'userHighlights'
          | 'userShadows'
          | 'userWhites'
          | 'userBlacks'
        >
      >,
    ) => {
      let shouldClearExportResult = false
      setParams((prev) => {
        const { params: nextParams, shouldClearExportResult: shouldClear } =
          computeToneParams(prev, toneParams)
        shouldClearExportResult = shouldClear
        return nextParams
      })

      if (shouldClearExportResult) {
        invalidateExportGraph()
      }
    },
    [invalidateExportGraph, setParams],
  )

  const resetTone = useCallback(() => {
    setProcessingParams({
      userExposureEv: 0,
      userContrast: 0,
      userHighlights: 0,
      userShadows: 0,
      userWhites: 0,
      userBlacks: 0,
    })
  }, [setProcessingParams])

  const setColorParams = useCallback(
    (
      colorParams: Partial<
        Pick<ProcessingParams, 'userTemperature' | 'userTint'>
      >,
    ) => {
      let shouldClearExportResult = false
      setParams((prev) => {
        const { params: nextParams, shouldClearExportResult: shouldClear } =
          computeColorParams(prev, colorParams)
        shouldClearExportResult = shouldClear
        return nextParams
      })

      if (shouldClearExportResult) {
        invalidateExportGraph()
      }
    },
    [invalidateExportGraph, setParams],
  )

  const resetColor = useCallback(() => {
    setProcessingParams({
      userTemperature: 0,
      userTint: 0,
    })
  }, [setProcessingParams])

  return {
    setParams: setProcessingParams,
    setToneParams,
    resetTone,
    setColorParams,
    resetColor,
  }
}
