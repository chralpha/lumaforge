import type {
  HSLBandId,
  HSLBandShift,
  ProcessingParams,
} from '@lumaforge/luma-color-runtime'
import { makeNeutralBand } from '@lumaforge/luma-color-runtime'
import { useCallback } from 'react'

import { changesRenderGraphParams } from '../../../services/export/export-state'
import {
  computeColorParams,
  computeToneParams,
} from '../../../services/look/orchestrate-params-update'

function makeNeutralSelectiveColor(): Record<HSLBandId, HSLBandShift> {
  return {
    red: makeNeutralBand(),
    orange: makeNeutralBand(),
    yellow: makeNeutralBand(),
    green: makeNeutralBand(),
    aqua: makeNeutralBand(),
    blue: makeNeutralBand(),
    purple: makeNeutralBand(),
    magenta: makeNeutralBand(),
  }
}

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
        Pick<
          ProcessingParams,
          'userTemperature' | 'userTint' | 'userSaturation' | 'userVibrance'
        >
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
      userSaturation: 0,
      userVibrance: 0,
    })
  }, [setProcessingParams])

  const setSelectiveColorBand = useCallback(
    (band: HSLBandId, shift: Partial<HSLBandShift>) => {
      let shouldClearExportResult = false
      setParams((prev) => {
        const baseRecord = prev.selectiveColor ?? makeNeutralSelectiveColor()
        const previousBand = baseRecord[band] ?? makeNeutralBand()
        const nextBand: HSLBandShift = {
          hue: shift.hue ?? previousBand.hue,
          saturation: shift.saturation ?? previousBand.saturation,
          lightness: shift.lightness ?? previousBand.lightness,
        }
        const nextSelectiveColor: Record<HSLBandId, HSLBandShift> = {
          red: baseRecord.red ?? makeNeutralBand(),
          orange: baseRecord.orange ?? makeNeutralBand(),
          yellow: baseRecord.yellow ?? makeNeutralBand(),
          green: baseRecord.green ?? makeNeutralBand(),
          aqua: baseRecord.aqua ?? makeNeutralBand(),
          blue: baseRecord.blue ?? makeNeutralBand(),
          purple: baseRecord.purple ?? makeNeutralBand(),
          magenta: baseRecord.magenta ?? makeNeutralBand(),
        }
        nextSelectiveColor[band] = nextBand
        shouldClearExportResult = changesRenderGraphParams(prev, {
          selectiveColor: nextSelectiveColor,
        })
        return { ...prev, selectiveColor: nextSelectiveColor }
      })

      if (shouldClearExportResult) {
        invalidateExportGraph()
      }
    },
    [invalidateExportGraph, setParams],
  )

  const resetSelectiveColor = useCallback(() => {
    let shouldClearExportResult = false
    setParams((prev) => {
      const nextSelectiveColor = makeNeutralSelectiveColor()
      shouldClearExportResult = changesRenderGraphParams(prev, {
        selectiveColor: nextSelectiveColor,
      })
      return { ...prev, selectiveColor: nextSelectiveColor }
    })

    if (shouldClearExportResult) {
      invalidateExportGraph()
    }
  }, [invalidateExportGraph, setParams])

  return {
    setParams: setProcessingParams,
    setToneParams,
    resetTone,
    setColorParams,
    resetColor,
    setSelectiveColorBand,
    resetSelectiveColor,
  }
}
