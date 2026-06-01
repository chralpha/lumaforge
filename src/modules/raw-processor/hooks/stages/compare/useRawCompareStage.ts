import type { ProcessingParams } from '@lumaforge/luma-color-runtime'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { useCallback, useMemo } from 'react'

import type { ImageSession } from '../../../model/session'
import {
  computeCompareSplitChange,
  computeViewModeChange,
  computeViewportChange,
} from '../../../services/look/orchestrate-params-update'
import type { PreviewViewport } from '../../../services/preview/preview-viewport'
import {
  DEFAULT_PREVIEW_VIEWPORT,
  normalizePreviewViewport,
} from '../../../services/preview/preview-viewport'

type SetProcessingParams = (
  value: ProcessingParams | ((prev: ProcessingParams) => ProcessingParams),
) => void

type UseRawCompareStageInput = {
  baseParams: ProcessingParams
  session: ImageSession | null
  sessionRef: MutableRefObject<ImageSession | null>
  setParams: SetProcessingParams
  setSession: Dispatch<SetStateAction<ImageSession | null>>
}

export function useRawCompareStage({
  baseParams,
  session,
  sessionRef,
  setParams,
  setSession,
}: UseRawCompareStageInput) {
  const sessionViewMode = session?.viewState.mode
  const sessionCompareSplit = session?.viewState.compareSplit
  const sessionZoom = session?.viewState.zoom
  const sessionPanX = session?.viewState.panX
  const sessionPanY = session?.viewState.panY
  const sessionFitMode = session?.viewState.fitMode

  const params = useMemo<ProcessingParams>(() => {
    if (!sessionViewMode || sessionCompareSplit === undefined) {
      return baseParams
    }

    return {
      ...baseParams,
      viewMode: sessionViewMode,
      compareSplit: sessionCompareSplit,
    }
  }, [baseParams, sessionCompareSplit, sessionViewMode])

  const previewViewport = useMemo(
    () =>
      sessionZoom === undefined ||
      sessionPanX === undefined ||
      sessionPanY === undefined ||
      !sessionFitMode
        ? DEFAULT_PREVIEW_VIEWPORT
        : normalizePreviewViewport({
            zoom: sessionZoom,
            panX: sessionPanX,
            panY: sessionPanY,
            fitMode: sessionFitMode,
          }),
    [sessionFitMode, sessionPanX, sessionPanY, sessionZoom],
  )

  const setViewMode = useCallback(
    (mode: ProcessingParams['viewMode']) => {
      if (sessionRef.current) {
        setSession((prev) => computeViewModeChange(prev, mode))
        return
      }

      setParams((prev) =>
        prev.viewMode === mode ? prev : { ...prev, viewMode: mode },
      )
    },
    [sessionRef, setParams, setSession],
  )

  const setCompareSplit = useCallback(
    (split: number) => {
      const { nextSplit } = computeCompareSplitChange(null, split)

      if (sessionRef.current) {
        setSession((prev) => computeCompareSplitChange(prev, nextSplit).session)
        return
      }

      setParams((prev) =>
        prev.compareSplit === nextSplit
          ? prev
          : { ...prev, compareSplit: nextSplit },
      )
    },
    [sessionRef, setParams, setSession],
  )

  const setPreviewViewport = useCallback(
    (viewport: PreviewViewport) => {
      setSession((prev) => computeViewportChange(prev, viewport))
    },
    [setSession],
  )

  const resetPreviewViewport = useCallback(() => {
    setPreviewViewport(DEFAULT_PREVIEW_VIEWPORT)
  }, [setPreviewViewport])

  return {
    params,
    viewMode: params.viewMode,
    compareSplit: params.compareSplit,
    previewViewport,
    setViewMode,
    setCompareSplit,
    setPreviewViewport,
    resetPreviewViewport,
  }
}
