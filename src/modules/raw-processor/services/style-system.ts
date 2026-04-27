import type { LUTColorProfile } from '~/lib/color/registry'
import { getColorGamut, getTransferFunction } from '~/lib/color/registry'
import type { LUTProfileResolution } from '~/lib/gl/pipeline'
import type { ParsedLUT } from '~/lib/lut/cube-parser'

import type { LUTProfileSelectionState } from '../model/session'
import { BUILTIN_PRESETS } from './builtin-presets'

const DISPLAY_LIKE_INPUT_TRANSFERS = new Set(['srgb', 'bt709', 'gamma24'])

export function mapIntensityLevel(
  level: 'off' | 'light' | 'standard' | 'strong',
) {
  if (level === 'off') return 0
  if (level === 'light') return 0.4
  if (level === 'standard') return 0.7
  return 1
}

export function buildBuiltinStyle(id: (typeof BUILTIN_PRESETS)[number]['id']) {
  const preset = BUILTIN_PRESETS.find((item) => item.id === id)
  if (!preset) {
    throw new Error(`Unknown builtin preset: ${id}`)
  }

  return {
    kind: 'builtin' as const,
    name: preset.name,
    defaultIntensityLevel: preset.defaultIntensityLevel,
    currentIntensityLevel: preset.defaultIntensityLevel,
    inputPrepProfile: preset.inputPrepProfile,
  }
}

function describeLUTOutput(profile: LUTColorProfile): string {
  if (!profile.outputGamut || !profile.outputTransfer || !profile.outputRange) {
    if (
      profile.role === 'display-look' &&
      profile.inputGamut === 'srgb-rec709' &&
      DISPLAY_LIKE_INPUT_TRANSFERS.has(profile.inputTransfer)
    ) {
      return 'Rec.709 display'
    }
    return 'output profile required'
  }

  if (
    profile.outputGamut === 'srgb-rec709' &&
    ['srgb', 'bt709', 'gamma24'].includes(profile.outputTransfer)
  ) {
    return 'Rec.709 display'
  }

  const gamut = getColorGamut(profile.outputGamut)?.label ?? profile.outputGamut
  const transfer =
    getTransferFunction(profile.outputTransfer)?.label ?? profile.outputTransfer

  return `${gamut} / ${transfer}`
}

function describeLUTContract(profileResolution: LUTProfileResolution): string {
  if (profileResolution.kind === 'resolved') {
    return `${profileResolution.profile.label} -> ${describeLUTOutput(
      profileResolution.profile,
    )}`
  }

  return 'an unresolved LUT contract'
}

export function buildLUTProfileSelectionState(
  lut: ParsedLUT,
): LUTProfileSelectionState {
  if (lut.profileResolution.kind === 'needs-user-selection') {
    return {
      status: 'pending',
      fingerprint: lut.fingerprint,
      title: lut.title,
      sourceName: lut.sourceName,
      suggestions: lut.profileResolution.suggestions,
    }
  }

  return {
    status: 'resolved',
    fingerprint: lut.fingerprint,
    profileId: lut.profileResolution.profile.id,
    confidence: lut.profileResolution.confidence,
  }
}

export function toCustomStyle(lut: ParsedLUT) {
  const warning =
    lut.profileResolution.kind === 'resolved'
      ? `This LUT uses ${describeLUTContract(lut.profileResolution)}.`
      : 'Choose the LUT input and output contract before preview or export.'

  return {
    kind: 'custom' as const,
    name: lut.title || 'Custom LUT',
    defaultIntensityLevel: 'standard' as const,
    currentIntensityLevel: 'standard' as const,
    warning,
    lutAsset: {
      format: 'cube' as const,
      dimension: lut.size as 17 | 33 | 65,
      title: lut.title,
      inputProfile: lut.inputProfile,
      profileResolution: lut.profileResolution,
      fingerprint: lut.fingerprint,
      sourceName: lut.sourceName,
    },
  }
}
