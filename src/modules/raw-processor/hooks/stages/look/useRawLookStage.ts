import type {
  LUTColorProfile,
  LUTData,
  ProcessingParams,
} from '@lumaforge/luma-color-runtime'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { useCallback, useMemo } from 'react'
import { toast } from 'sonner'

import type { ParsedLUT } from '~/lib/lut/cube-parser'
import type { OnlineLUTEntry } from '~/lib/profiles/catalog'

import type {
  ImageSession,
  LUTContractSelectionState,
  StyleAsset,
} from '../../../model/session'
import { changesRenderGraphParams } from '../../../services/export/export-state'
import type { LutLoadContext } from '../../../services/look/orchestrate-lut-load'
import {
  orchestrateLutLoadFromFile,
  orchestrateOnlineLutLoad,
  orchestrateProfileSelection,
} from '../../../services/look/orchestrate-lut-load'
import {
  computeClearLUT,
  computeColorParams,
  computeIntensityChange,
  computeToneParams,
} from '../../../services/look/orchestrate-params-update'
import {
  buildLUTContractSelectionState,
  mapIntensityLevel,
  toCustomStyle,
} from '../../../services/look/style-system'

type SetProcessingParams = (
  value: ProcessingParams | ((prev: ProcessingParams) => ProcessingParams),
) => void

type UseRawLookStageInput = {
  baseParams: ProcessingParams
  session: ImageSession | null
  sessionRef: MutableRefObject<ImageSession | null>
  setSession: Dispatch<SetStateAction<ImageSession | null>>
  lut: ParsedLUT | null
  setLut: (lut: ParsedLUT | null) => void
  setParams: SetProcessingParams
  getProcessingParams: () => ProcessingParams
  lutDataRef: MutableRefObject<LUTData | null>
  setLutDataRef: (nextLutData: LUTData | null) => void
  scheduleToast: (notify: () => void) => void
  invalidateExportGraph: () => void
  setViewMode?: (mode: ProcessingParams['viewMode']) => void
  setCompareSplit?: (split: number) => void
}

export function useRawLookStage({
  baseParams,
  session,
  sessionRef,
  setSession,
  lut,
  setLut,
  setParams,
  getProcessingParams,
  lutDataRef,
  setLutDataRef,
  scheduleToast,
  invalidateExportGraph,
  setViewMode,
  setCompareSplit,
}: UseRawLookStageInput) {
  const detachedStyle =
    !session && lut
      ? {
          ...toCustomStyle(lut),
          currentIntensityLevel: 'standard' as const,
        }
      : null
  const activeStyle = session?.activeStyle || detachedStyle
  const lutProfileSelection =
    session?.lutProfileSelection ||
    (lut ? buildLUTContractSelectionState(lut) : null)
  const activeIntensity = activeStyle?.currentIntensityLevel || 'standard'
  const currentLutName =
    activeStyle?.kind === 'custom' ? activeStyle.name : null

  const params = useMemo<ProcessingParams>(() => {
    if (!session?.activeStyle) return baseParams

    const intensity = mapIntensityLevel(
      session.activeStyle.currentIntensityLevel,
    )
    return baseParams.intensity === intensity
      ? baseParams
      : { ...baseParams, intensity }
  }, [baseParams, session?.activeStyle])

  const lutCtx = useMemo<LutLoadContext>(
    () => ({
      atoms: {
        setLut,
        setSession,
        setParams,
        getProcessingParams,
        lut,
        activeStyle,
      },
      refs: {
        lutDataRef,
        sessionRef,
      },
      services: {
        scheduleToast,
        invalidateExportGraph,
        setLutDataRef,
      },
    }),
    [
      activeStyle,
      getProcessingParams,
      invalidateExportGraph,
      lut,
      lutDataRef,
      scheduleToast,
      sessionRef,
      setLut,
      setLutDataRef,
      setParams,
      setSession,
    ],
  )

  const loadLUT = useCallback(
    (file: File) => orchestrateLutLoadFromFile(file, lutCtx),
    [lutCtx],
  )

  const loadOnlineLUT = useCallback(
    (entry: OnlineLUTEntry, options?: { signal?: AbortSignal }) =>
      orchestrateOnlineLutLoad(entry, options, lutCtx),
    [lutCtx],
  )

  const selectLUTProfile = useCallback(
    (profile: LUTColorProfile | string) =>
      orchestrateProfileSelection(profile, lutCtx),
    [lutCtx],
  )

  const selectIntensityLevel = useCallback(
    (level: 'off' | 'light' | 'standard' | 'strong') => {
      const {
        params: nextParams,
        session: nextSession,
        shouldInvalidateExportGraph,
      } = computeIntensityChange(params, session, activeStyle, level)

      if (shouldInvalidateExportGraph) {
        invalidateExportGraph()
      }
      if (!session?.activeStyle) {
        setParams(nextParams)
      }
      setSession(nextSession)
    },
    [
      activeStyle,
      invalidateExportGraph,
      params,
      session,
      setParams,
      setSession,
    ],
  )

  const clearLUT = useCallback(() => {
    const {
      params: nextParams,
      session: nextSession,
      shouldInvalidateExportGraph,
    } = computeClearLUT(
      params,
      session,
      activeStyle,
      Boolean(lut),
      Boolean(lutDataRef.current),
      Boolean(lutProfileSelection),
    )

    if (shouldInvalidateExportGraph) {
      invalidateExportGraph()
    }
    setLut(null)
    setLutDataRef(null)
    setSession(nextSession)
    setParams(nextParams)
    scheduleToast(() => toast.info('LUT cleared'))
  }, [
    activeStyle,
    invalidateExportGraph,
    lut,
    lutDataRef,
    lutProfileSelection,
    params,
    scheduleToast,
    session,
    setLut,
    setLutDataRef,
    setParams,
    setSession,
  ])

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
    params,
    activeStyle: activeStyle as StyleAsset | null,
    lutProfileSelection:
      lutProfileSelection as LUTContractSelectionState | null,
    activeIntensity,
    currentLutName,
    loadLUT,
    loadOnlineLUT,
    selectLUTProfile,
    selectIntensityLevel,
    clearLUT,
    setParams: setProcessingParams,
    setToneParams,
    resetTone,
    setColorParams,
    resetColor,
  }
}
