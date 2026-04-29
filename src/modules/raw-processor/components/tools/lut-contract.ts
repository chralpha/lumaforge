import type { LUTColorProfile } from '~/lib/color/registry'
import {
  getColorGamut,
  getLUTColorProfile,
  getTransferFunction,
} from '~/lib/color/registry'
import type { LUTProfileResolution } from '~/lib/gl/pipeline'

import type { LUTProfileSelectionState } from '../../model/session'

const DISPLAY_LIKE_INPUT_TRANSFERS = new Set(['srgb', 'bt709', 'gamma24'])

export function getResolvedProfile(
  selection?: LUTProfileSelectionState | null,
  resolution?: LUTProfileResolution | null,
) {
  if (resolution?.kind === 'resolved') return resolution.profile
  if (selection?.status === 'resolved') {
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

function hasAnyOutputContractField(profile: LUTColorProfile) {
  return Boolean(
    profile.outputGamut || profile.outputTransfer || profile.outputRange,
  )
}

function hasSelectableOutputContract(profile: LUTColorProfile) {
  if (profile.role === 'display-look' && hasDisplayLikeInput(profile)) {
    return true
  }

  return Boolean(
    profile.outputGamut && profile.outputTransfer && profile.outputRange,
  )
}

function getDefaultRec709Contract(profile: LUTColorProfile): LUTColorProfile {
  return {
    ...profile,
    role: 'combined-look-output',
    outputGamut: 'srgb-rec709',
    outputTransfer: 'bt709',
    outputRange: 'full',
  }
}

export function toSelectableContract(profile: LUTColorProfile) {
  if (hasSelectableOutputContract(profile)) return profile
  if (!hasAnyOutputContractField(profile) && !hasDisplayLikeInput(profile)) {
    return getDefaultRec709Contract(profile)
  }
  return undefined
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
