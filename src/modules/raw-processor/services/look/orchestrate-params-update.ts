import type { ProcessingParams } from '@lumaforge/luma-color-runtime'
import {
  normalizeColorBalanceParams,
  normalizeToneParams,
} from '@lumaforge/luma-color-runtime'

import type { ImageSession, StyleAsset } from '../../model/session'
import { clampCompareSplit } from '../compare/compare-split'
import {
  applyCompareSplitToSession,
  applyPreviewViewportToSession,
  applyViewModeToSession,
} from '../compare/view-session-state'
import { changesRenderGraphParams } from '../export/export-state'
import type { PreviewViewport } from '../preview/preview-viewport'
import {
  applyLookIntensityToSession,
  clearActiveLookFromSession,
} from './look-session-state'
import { mapIntensityLevel } from './style-system'

export function computeViewModeChange(
  session: ImageSession | null,
  mode: ProcessingParams['viewMode'],
): ImageSession | null {
  if (!session) {
    return null
  }

  return applyViewModeToSession(session, mode)
}

export function computeCompareSplitChange(
  session: ImageSession | null,
  split: number,
): { session: ImageSession | null; nextSplit: number } {
  const nextSplit = clampCompareSplit(split)
  const nextSession = session
    ? applyCompareSplitToSession(session, nextSplit)
    : null

  return { session: nextSession, nextSplit }
}

export function computeViewportChange(
  session: ImageSession | null,
  viewport: PreviewViewport,
): ImageSession | null {
  if (!session) {
    return null
  }

  return applyPreviewViewportToSession(session, viewport)
}

export function computeIntensityChange(
  prevParams: ProcessingParams,
  prevSession: ImageSession | null,
  activeStyle: StyleAsset | null,
  level: 'off' | 'light' | 'standard' | 'strong',
): {
  params: ProcessingParams
  session: ImageSession | null
  shouldInvalidateExportGraph: boolean
} {
  const shouldInvalidateExportGraph =
    prevParams.intensity !== mapIntensityLevel(level) ||
    (activeStyle ? activeStyle.currentIntensityLevel !== level : false)

  const nextParams: ProcessingParams = {
    ...prevParams,
    intensity: mapIntensityLevel(level),
  }

  const nextSession = prevSession
    ? applyLookIntensityToSession(prevSession, {
        level,
        clearExportResult: shouldInvalidateExportGraph,
      })
    : null

  return {
    params: nextParams,
    session: nextSession,
    shouldInvalidateExportGraph,
  }
}

export function computeClearLUT(
  prevParams: ProcessingParams,
  prevSession: ImageSession | null,
  activeStyle: StyleAsset | null,
  hasLut: boolean,
  hasLutDataRef: boolean,
  hasLutProfileSelection: boolean,
): {
  params: ProcessingParams
  session: ImageSession | null
  shouldInvalidateExportGraph: boolean
} {
  const shouldInvalidateExportGraph =
    prevParams.styleKind !== 'none' ||
    prevParams.builtinPreset !== null ||
    Boolean(activeStyle) ||
    hasLut ||
    hasLutDataRef ||
    hasLutProfileSelection

  const nextParams: ProcessingParams = {
    ...prevParams,
    styleKind: 'none',
    builtinPreset: null,
  }

  const nextSession = prevSession
    ? clearActiveLookFromSession(prevSession, {
        clearExportResult: shouldInvalidateExportGraph,
      })
    : null

  return {
    params: nextParams,
    session: nextSession,
    shouldInvalidateExportGraph,
  }
}

export function computeToneParams(
  prevParams: ProcessingParams,
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
): { params: ProcessingParams; shouldClearExportResult: boolean } {
  const normalized = normalizeToneParams({
    userExposureEv: toneParams.userExposureEv ?? prevParams.userExposureEv,
    userContrast: toneParams.userContrast ?? prevParams.userContrast,
    userHighlights: toneParams.userHighlights ?? prevParams.userHighlights,
    userShadows: toneParams.userShadows ?? prevParams.userShadows,
    userWhites: toneParams.userWhites ?? prevParams.userWhites,
    userBlacks: toneParams.userBlacks ?? prevParams.userBlacks,
  })

  const shouldClearExportResult = changesRenderGraphParams(
    prevParams,
    normalized,
  )

  return {
    params: { ...prevParams, ...normalized },
    shouldClearExportResult,
  }
}

export function computeColorParams(
  prevParams: ProcessingParams,
  colorParams: Partial<Pick<ProcessingParams, 'userTemperature' | 'userTint'>>,
): { params: ProcessingParams; shouldClearExportResult: boolean } {
  const normalized = normalizeColorBalanceParams({
    userTemperature: colorParams.userTemperature ?? prevParams.userTemperature,
    userTint: colorParams.userTint ?? prevParams.userTint,
  })

  const shouldClearExportResult = changesRenderGraphParams(
    prevParams,
    normalized,
  )

  return {
    params: { ...prevParams, ...normalized },
    shouldClearExportResult,
  }
}
