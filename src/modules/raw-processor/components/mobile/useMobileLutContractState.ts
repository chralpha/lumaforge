import type { LUTContractResolution } from '@lumaforge/luma-color-runtime'
import { useMemo } from 'react'

import type { LUTContractSelectionState } from '../../model/session'
import { useLutContractBrowserState } from '../tools/lut/useLutContractBrowserState'
import {
  deriveLUTContractView,
  getProfileOutputLabel,
  getResolvedProfile,
} from '../tools/lut-contract'

export const OUTPUT_REQUIRED_LABEL = 'Output profile required'

type UseMobileLutContractStateInput = {
  contractQuery: string
  lutProfileSelection?: LUTContractSelectionState | null
  lutProfileResolution?: LUTContractResolution | null
}

export function useMobileLutContractState({
  contractQuery,
  lutProfileSelection,
  lutProfileResolution,
}: UseMobileLutContractStateInput) {
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
  const displayOutputLabel =
    outputLabel && outputLabel !== OUTPUT_REQUIRED_LABEL
      ? outputLabel
      : undefined
  const contractView = deriveLUTContractView(
    lutProfileSelection,
    lutProfileResolution,
  )
  const browserState = useLutContractBrowserState({
    query: contractQuery,
    suggestions: profileSuggestions,
    currentProfile: resolvedProfile,
  })

  return {
    profileSuggestions,
    resolvedProfile,
    outputLabel,
    displayOutputLabel,
    contractView,
    contractSearchResults: browserState.searchResults,
    hasContractQuery: browserState.hasQuery,
    visibleSuggestions: browserState.visibleSuggestions,
    groupedInputProfiles: browserState.groupedInputProfiles,
    suggestedOutputOptions: browserState.suggestedOutputOptions,
    groupedOutputOptions: browserState.groupedOutputOptions,
    activeOutputOptionId: browserState.activeOutputOptionId,
    hasInputMatches: browserState.hasInputMatches,
    hasOutputMatches: browserState.hasOutputMatches,
  }
}
