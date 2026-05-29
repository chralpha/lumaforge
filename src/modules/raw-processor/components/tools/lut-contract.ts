import type {
  LUTColorProfile,
  LUTContractResolution,
} from '@lumaforge/luma-color-runtime'
import {
  getColorGamut,
  getLUTColorProfile,
  getTransferFunction,
} from '@lumaforge/luma-color-runtime'

import type { LUTContractSelectionState } from '../../model/session'

const DISPLAY_LIKE_INPUT_TRANSFERS = new Set(['srgb', 'bt709', 'gamma24'])

export function getResolvedProfile(
  selection?: LUTContractSelectionState | null,
  resolution?: LUTContractResolution | null,
) {
  if (resolution?.kind === 'confirmed') return resolution.profile
  if (selection?.status === 'confirmed') {
    return getLUTColorProfile(selection.profileId)
  }
  return undefined
}

export function hasDisplayLikeInput(profile: LUTColorProfile) {
  return (
    profile.inputGamut === 'srgb-rec709' &&
    DISPLAY_LIKE_INPUT_TRANSFERS.has(profile.inputTransfer)
  )
}

export function getProfileOutputLabel(profile?: LUTColorProfile) {
  if (!profile) return undefined

  if (!profile.outputGamut || !profile.outputTransfer || !profile.outputRange) {
    if (profile.role === 'display-look' && hasDisplayLikeInput(profile)) {
      return 'Rec.709 display'
    }
    return 'Output profile required'
  }

  if (
    profile.outputGamut === 'srgb-rec709' &&
    ['srgb', 'bt709', 'gamma24'].includes(profile.outputTransfer)
  ) {
    return 'Rec.709 display'
  }

  const gamut = profile.outputGamut
    ? (getColorGamut(profile.outputGamut)?.label ?? profile.outputGamut)
    : undefined
  const transfer = profile.outputTransfer
    ? (getTransferFunction(profile.outputTransfer)?.label ??
      profile.outputTransfer)
    : undefined

  return [gamut, transfer].filter(Boolean).join(' / ')
}

function hasSelectableOutputContract(profile: LUTColorProfile) {
  if (profile.role === 'display-look' && hasDisplayLikeInput(profile)) {
    return true
  }

  return Boolean(
    profile.outputGamut && profile.outputTransfer && profile.outputRange,
  )
}

export function toSelectableContract(profile: LUTColorProfile) {
  if (hasSelectableOutputContract(profile)) return profile
  return undefined
}

export function getProfileAsOutputLabel(profile: LUTColorProfile) {
  if (hasDisplayLikeInput(profile)) return 'Rec.709 display'

  const gamut = getColorGamut(profile.inputGamut)?.label ?? profile.inputGamut
  const transfer =
    getTransferFunction(profile.inputTransfer)?.label ?? profile.inputTransfer

  return `${gamut} / ${transfer}`
}

function getComposedContractRole(
  inputProfile: LUTColorProfile,
  outputProfile: LUTColorProfile,
): LUTColorProfile['role'] {
  const outputIsDisplayLike = hasDisplayLikeInput(outputProfile)
  const outputMatchesInput =
    inputProfile.inputGamut === outputProfile.inputGamut &&
    inputProfile.inputTransfer === outputProfile.inputTransfer

  if (
    inputProfile.role === 'display-look' &&
    hasDisplayLikeInput(inputProfile) &&
    outputIsDisplayLike
  ) {
    return 'display-look'
  }
  if (outputIsDisplayLike) return 'combined-look-output'
  if (outputMatchesInput) return 'scene-creative'
  return 'technical-output'
}

export function composeLUTContractProfile(
  inputProfile: LUTColorProfile,
  outputProfile: LUTColorProfile,
): LUTColorProfile {
  return {
    ...inputProfile,
    role: getComposedContractRole(inputProfile, outputProfile),
    outputGamut: outputProfile.inputGamut,
    outputTransfer: outputProfile.inputTransfer,
    outputRange: outputProfile.inputRange,
  }
}

export function getProfileContractLabel(profile: LUTColorProfile) {
  const outputLabel = getProfileOutputLabel(profile)
  if (
    outputLabel &&
    outputLabel !== 'Output profile required' &&
    !hasDisplayLikeInput(profile)
  ) {
    return `${profile.label} -> ${outputLabel}`
  }

  return profile.label
}

export function getProfileGroupLabel(profile: LUTColorProfile) {
  if (profile.role === 'display-look') return 'Output'
  if (profile.label.startsWith('ARRI')) return 'ARRI'
  if (profile.label.startsWith('RED')) return 'RED'
  if (profile.label.startsWith('Nikon')) return 'Nikon'
  if (profile.label.startsWith('Sony')) return 'Sony'
  if (profile.label.startsWith('Canon')) return 'Canon'
  if (profile.label.startsWith('Fujifilm')) return 'Fujifilm'
  if (profile.label.startsWith('Panasonic')) return 'Panasonic'
  if (profile.label.startsWith('ACES')) return 'ACES'
  return 'Other'
}

export function groupProfiles(profiles: LUTColorProfile[]) {
  const groups = new Map<string, LUTColorProfile[]>()

  for (const profile of profiles) {
    const group = getProfileGroupLabel(profile)
    groups.set(group, [...(groups.get(group) ?? []), profile])
  }

  return Array.from(groups.entries()).map(([label, items]) => ({
    label,
    items,
  }))
}

export interface ContractAttentionState {
  needsUserSelection: boolean
  needsOutputContract: boolean
  unsupportedOutput: boolean
  needsAttention: boolean
}

export function getContractAttentionState(
  selection?: LUTContractSelectionState | null,
  resolution?: LUTContractResolution | null,
): ContractAttentionState {
  const resolvedProfile = getResolvedProfile(selection, resolution)
  const outputLabel = getProfileOutputLabel(resolvedProfile)
  const needsOutputContract = outputLabel === 'Output profile required'
  const needsUserSelection = resolution?.kind === 'needs-user-selection'
  const unsupportedOutput =
    resolution?.kind === 'needs-user-selection' &&
    resolution.reason === 'unsupported-output'

  return {
    needsUserSelection,
    needsOutputContract,
    unsupportedOutput,
    needsAttention:
      needsUserSelection || needsOutputContract || unsupportedOutput,
  }
}
