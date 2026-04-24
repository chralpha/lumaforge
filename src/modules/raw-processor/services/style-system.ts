import type { LUTProfileResolution } from '~/lib/gl/pipeline'
import type { ParsedLUT } from '~/lib/lut/cube-parser'

import type { LUTProfileSelectionState } from '../model/session'
import { BUILTIN_PRESETS } from './builtin-presets'

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

function describeLUTInput(profileResolution: LUTProfileResolution): string {
  if (profileResolution.kind === 'resolved') {
    return profileResolution.profile.label
  }

  return 'an unresolved LUT profile'
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
    lut.inputProfile === 'v-log'
      ? `This LUT is resolved as ${describeLUTInput(lut.profileResolution)} input and uses internal input preparation. Exact camera matching still depends on the source RAW transform.`
      : 'Custom LUTs are applied in a best effort path and may not match pro video software exactly.'

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
