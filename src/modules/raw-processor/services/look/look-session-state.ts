import type {
  ImageSession,
  IntensityLevel,
  LUTContractSelectionState,
  StyleAsset,
} from '../../model/session'
import { clearExportResultState } from '../export/export-state'

export function preserveCustomLookIntensity(
  style: StyleAsset,
  activeStyle: StyleAsset | null | undefined,
): StyleAsset {
  if (activeStyle?.kind !== 'custom') {
    return style
  }

  return {
    ...style,
    currentIntensityLevel: activeStyle.currentIntensityLevel,
  }
}

export function applyActiveLookToSession(
  session: ImageSession,
  input: {
    style: StyleAsset | null
    lutProfileSelection?: LUTContractSelectionState
    clearExportResult: boolean
  },
): ImageSession {
  const nextSession = {
    ...session,
    activeStyle: input.style,
    lutProfileSelection: input.lutProfileSelection,
  }

  return input.clearExportResult
    ? clearExportResultState(nextSession)
    : nextSession
}

export function applyLookIntensityToSession(
  session: ImageSession,
  input: {
    level: IntensityLevel
    clearExportResult: boolean
  },
): ImageSession {
  if (!session.activeStyle) {
    return input.clearExportResult ? clearExportResultState(session) : session
  }

  const nextSession = {
    ...session,
    activeStyle: {
      ...session.activeStyle,
      currentIntensityLevel: input.level,
    },
  }

  return input.clearExportResult
    ? clearExportResultState(nextSession)
    : nextSession
}

export function clearActiveLookFromSession(
  session: ImageSession,
  input: {
    clearExportResult: boolean
  },
): ImageSession {
  return applyActiveLookToSession(session, {
    style: null,
    lutProfileSelection: undefined,
    clearExportResult: input.clearExportResult,
  })
}
