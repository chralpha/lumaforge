export interface LumaColorSaturationParams {
  readonly userSaturation: number
  readonly userVibrance: number
}

export const USER_SATURATION_MIN = -100
export const USER_SATURATION_MAX = 100
export const USER_VIBRANCE_MIN = -100
export const USER_VIBRANCE_MAX = 100

export const USER_SATURATION_MAX_FACTOR = 1.0
export const USER_VIBRANCE_MAX_FACTOR = 0.5
export const VIBRANCE_CHROMA_REF = 0.25
export const SKIN_HUE_CENTER_DEG = 50
export const SKIN_HUE_SIGMA_DEG = 20
export const SKIN_PROTECT_STRENGTH = 0.5

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function finiteOrDefault(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export function normalizeSaturationParams(
  input?: Partial<LumaColorSaturationParams> | null,
): LumaColorSaturationParams {
  return {
    userSaturation: clamp(
      finiteOrDefault(input?.userSaturation, 0),
      USER_SATURATION_MIN,
      USER_SATURATION_MAX,
    ),
    userVibrance: clamp(
      finiteOrDefault(input?.userVibrance, 0),
      USER_VIBRANCE_MIN,
      USER_VIBRANCE_MAX,
    ),
  }
}

export function resolveSaturationParams(params: LumaColorSaturationParams): {
  readonly saturation: number
  readonly vibrance: number
  readonly isIdentity: boolean
} {
  return {
    saturation: params.userSaturation,
    vibrance: params.userVibrance,
    isIdentity: params.userSaturation === 0 && params.userVibrance === 0,
  }
}
