import type { ColorGamutId } from './constants'
import type { TransferFunctionId } from './log-encoding'
import type { LUTColorProfile, SignalRange } from './registry'
import type { LumaColorToneParams } from './tone'

export type BuiltinStylePreset =
  | 'neutral'
  | 'warm'
  | 'cool'
  | 'film-soft'
  | 'film-contrast'
  | 'cinematic'
  | 'fade'
  | 'mono'

export interface LumaColorProcessingParams extends LumaColorToneParams {
  intensity: number
  viewMode: 'processed' | 'original' | 'compare'
  compareSplit: number
  styleKind: 'none' | 'builtin' | 'custom'
  builtinPreset: BuiltinStylePreset | null
}

export type ProcessingParams = LumaColorProcessingParams

export type LUTInputProfile = 'display-srgb' | 'v-log'

export type LUTContractResolution =
  | {
      kind: 'resolved'
      profile: LUTColorProfile
      confidence: 'metadata' | 'user' | 'persisted-user'
    }
  | {
      kind: 'needs-user-selection'
      recommendations: LUTColorProfile[]
      reason?: 'unsupported-output'
    }

export interface LumaColorLUTData {
  size: number
  data: Float32Array
  domainMin: [number, number, number]
  domainMax: [number, number, number]
  title?: string
  inputProfile: LUTInputProfile
  profileResolution: LUTContractResolution
}

export type LUTData = LumaColorLUTData

export interface LUTContractSelection {
  inputProfile?: string
  role: LUTColorProfile['role']
  inputGamut?: ColorGamutId
  inputTransfer?: TransferFunctionId
  inputRange?: SignalRange
  outputGamut?: ColorGamutId
  outputTransfer?: TransferFunctionId
  outputRange?: SignalRange
}

export interface StoredLUTContractSelection {
  inputProfile?: string
  role: LUTColorProfile['role']
  inputGamut: ColorGamutId
  inputTransfer: TransferFunctionId
  inputRange: SignalRange
  outputGamut?: ColorGamutId
  outputTransfer?: TransferFunctionId
  outputRange?: SignalRange
}
