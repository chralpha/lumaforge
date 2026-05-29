import type { ProcessingParams } from '@lumaforge/luma-color-runtime'

import type { ParsedLUT } from '~/lib/lut/cube-parser'

import type { StyleAsset } from '../model/session'
import type { RetainedSessionState } from '../model/session-factory'
import { clampCompareSplit } from './compare-split'
import { preserveCustomLookIntensity } from './look-session-state'
import {
  buildLUTContractSelectionState,
  mapIntensityLevel,
  toCustomStyle,
} from './style-system'

export function prepareRawLoadState(input: {
  params: ProcessingParams
  lut: ParsedLUT | null
  activeStyle: StyleAsset | null | undefined
}): {
  compareSplit: number
  retainedSessionState: RetainedSessionState
  processingParamsPatch: Partial<ProcessingParams>
} {
  const compareSplit = clampCompareSplit(input.params.compareSplit ?? 0.5)
  const preservedCustomStyle = input.lut
    ? preserveCustomLookIntensity(toCustomStyle(input.lut), input.activeStyle)
    : null
  const retainedSessionState = {
    activeStyle: preservedCustomStyle,
    lutProfileSelection: input.lut
      ? buildLUTContractSelectionState(input.lut)
      : undefined,
  }

  return {
    compareSplit,
    retainedSessionState,
    processingParamsPatch: {
      intensity: preservedCustomStyle
        ? mapIntensityLevel(preservedCustomStyle.currentIntensityLevel)
        : 0.7,
      viewMode: 'compare',
      compareSplit,
      styleKind: preservedCustomStyle ? 'custom' : 'none',
      builtinPreset: null,
    },
  }
}
