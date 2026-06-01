import type { LUTContractResolution } from '@lumaforge/luma-color-runtime'
import { useMemo } from 'react'

import type { LUTContractSelectionState } from '../../../model/session'
import {
  deriveLUTContractView,
  getProfileOutputLabel,
  getResolvedProfile,
} from '../lut-contract'

export const OUTPUT_REQUIRED_LABEL = 'Output profile required'

type UseLutContractSummaryInput = {
  lutProfileSelection?: LUTContractSelectionState | null
  lutProfileResolution?: LUTContractResolution | null
}

export function useLutContractSummary({
  lutProfileSelection,
  lutProfileResolution,
}: UseLutContractSummaryInput) {
  const profileSuggestions = useMemo(() => {
    const resolution = lutProfileResolution
    return resolution &&
      (resolution.kind === 'recommended' ||
        resolution.kind === 'unsupported-output')
      ? resolution.recommendations
      : []
  }, [lutProfileResolution])
  const resolvedProfile = getResolvedProfile(
    lutProfileSelection,
    lutProfileResolution,
  )
  const outputLabel = getProfileOutputLabel(resolvedProfile)
  const outputRequired = outputLabel === OUTPUT_REQUIRED_LABEL
  const displayOutputLabel =
    outputLabel && !outputRequired ? outputLabel : undefined
  const contractView = deriveLUTContractView(
    lutProfileSelection,
    lutProfileResolution,
  )
  const needsUserSelection =
    lutProfileResolution != null && lutProfileResolution.kind !== 'confirmed'

  return {
    profileSuggestions,
    resolvedProfile,
    outputLabel,
    outputRequired,
    displayOutputLabel,
    contractView,
    needsUserSelection,
  }
}
