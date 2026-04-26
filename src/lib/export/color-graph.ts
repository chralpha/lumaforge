import type { ColorGamutId } from '~/lib/color/constants'
import type { TransferFunctionId } from '~/lib/color/log-encoding'
import {
  getLinearProPhotoToGamutMatrix,
  getLUTOutputToTargetMatrix,
  mat3Identity,
  type Mat3,
} from '~/lib/color/matrix'
import type {
  LUTColorProfile,
  LUTRole,
  SignalRange,
} from '~/lib/color/registry'
import type { LUTData, ProcessingParams } from '~/lib/gl/pipeline'

export type ExportColorGraphStep =
  | { kind: 'input-linear-prophoto' }
  | { kind: 'gamut-to-lut-input'; matrix: Mat3; gamut: ColorGamutId }
  | {
      kind: 'encode-lut-transfer'
      transfer: TransferFunctionId
      range: SignalRange
    }
  | {
      kind: 'lut3d'
      size: number
      data: Float32Array
      domainMin: [number, number, number]
      domainMax: [number, number, number]
      role: LUTRole
      intensity: number
    }
  | {
      kind: 'builtin-style'
      preset: NonNullable<ProcessingParams['builtinPreset']>
      intensity: number
    }
  | { kind: 'lut-output-to-srgb'; matrix: Mat3 }
  | { kind: 'output-srgb' }

export type ExportColorGraphDescriptor =
  | {
      supported: true
      outputGamut: 'srgb-rec709'
      outputTransfer: 'srgb'
      lutProfile: LUTColorProfile | null
      steps: ExportColorGraphStep[]
    }
  | {
      supported: false
      reason: 'unsupported-pipeline'
      message: string
      steps: []
    }

export type SupportedExportColorGraphDescriptor = Extract<
  ExportColorGraphDescriptor,
  { supported: true }
>

const OUTPUT_GAMUT = 'srgb-rec709'
const OUTPUT_TRANSFER = 'srgb'

function resolveEffectiveLUTOutputTransfer(
  profile: LUTColorProfile,
): TransferFunctionId {
  if (profile.outputTransfer) return profile.outputTransfer

  if (profile.role === 'display-look') return 'srgb'

  if (profile.role === 'scene-creative') return profile.inputTransfer

  if (
    profile.role === 'combined-look-output' &&
    profile.outputGamut === OUTPUT_GAMUT
  ) {
    return 'gamma24'
  }

  return 'linear'
}

export function resolveExportColorGraph(input: {
  styleKind: ProcessingParams['styleKind']
  intensity: number
  builtinPreset: ProcessingParams['builtinPreset']
  lut: LUTData | null
}): ExportColorGraphDescriptor {
  const base: ExportColorGraphStep[] = [{ kind: 'input-linear-prophoto' }]

  if (input.styleKind === 'builtin' && input.builtinPreset) {
    return {
      supported: false,
      reason: 'unsupported-pipeline',
      message:
        'Built-in styles are not supported by full-resolution JPEG export.',
      steps: [],
    }
  }

  if (input.styleKind !== 'custom' || !input.lut) {
    return {
      supported: true,
      outputGamut: OUTPUT_GAMUT,
      outputTransfer: OUTPUT_TRANSFER,
      lutProfile: null,
      steps: [...base, { kind: 'output-srgb' }],
    }
  }

  if (input.lut.profileResolution.kind !== 'resolved') {
    return {
      supported: false,
      reason: 'unsupported-pipeline',
      message: 'Choose a LUT input profile before full-resolution export.',
      steps: [],
    }
  }

  const profile = input.lut.profileResolution.profile
  const effectiveOutputTransfer = resolveEffectiveLUTOutputTransfer(profile)
  if (
    effectiveOutputTransfer !== 'srgb' &&
    effectiveOutputTransfer !== 'gamma24'
  ) {
    return {
      supported: false,
      reason: 'unsupported-pipeline',
      message:
        'This LUT output transfer is not supported by full-resolution JPEG export.',
      steps: [],
    }
  }

  const inputMatrix =
    profile.inputGamut === 'prophoto-rgb'
      ? mat3Identity()
      : getLinearProPhotoToGamutMatrix(profile.inputGamut)
  const outputMatrix = profile.outputGamut
    ? getLUTOutputToTargetMatrix(profile.outputGamut, OUTPUT_GAMUT)
    : mat3Identity()

  return {
    supported: true,
    outputGamut: OUTPUT_GAMUT,
    outputTransfer: OUTPUT_TRANSFER,
    lutProfile: profile,
    steps: [
      ...base,
      {
        kind: 'gamut-to-lut-input',
        matrix: inputMatrix,
        gamut: profile.inputGamut,
      },
      {
        kind: 'encode-lut-transfer',
        transfer: profile.inputTransfer,
        range: profile.inputRange,
      },
      {
        kind: 'lut3d',
        size: input.lut.size,
        data: input.lut.data,
        domainMin: input.lut.domainMin,
        domainMax: input.lut.domainMax,
        role: profile.role,
        intensity: input.intensity,
      },
      {
        kind: 'lut-output-to-srgb',
        matrix: outputMatrix,
      },
      { kind: 'output-srgb' },
    ],
  }
}
