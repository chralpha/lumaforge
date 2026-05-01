export const USER_EXPOSURE_EV_MIN = -5
export const USER_EXPOSURE_EV_MAX = 5
export const USER_CONTRAST_MIN = -100
export const USER_CONTRAST_MAX = 100
export const USER_CONTRAST_PIVOT = 0.18
export const LINEAR_PROPHOTO_LUMINANCE = [
  0.2880402, 0.7118741, 0.0000857,
] as const

export interface LumaColorToneParams {
  userExposureEv: number
  userContrast: number
}

export interface ResolvedToneParams extends LumaColorToneParams {
  userExposureMultiplier: number
  userContrastFactor: number
  contrastPivot: number
  luminanceCoefficients: readonly [number, number, number]
}

export type Rgb = readonly [number, number, number]

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function finiteOrDefault(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export function userExposureMultiplierFromEv(ev: number) {
  return Math.pow(2, ev)
}

export function contrastFactorFromAmount(amount: number) {
  return Math.pow(2, amount / 200)
}

export function normalizeToneParams(
  input?: Partial<LumaColorToneParams> | null,
): LumaColorToneParams {
  return {
    userExposureEv: clamp(
      finiteOrDefault(input?.userExposureEv, 0),
      USER_EXPOSURE_EV_MIN,
      USER_EXPOSURE_EV_MAX,
    ),
    userContrast: clamp(
      finiteOrDefault(input?.userContrast, 0),
      USER_CONTRAST_MIN,
      USER_CONTRAST_MAX,
    ),
  }
}

export function resolveToneParams(
  input?: Partial<LumaColorToneParams> | null,
): ResolvedToneParams {
  const normalized = normalizeToneParams(input)
  return {
    ...normalized,
    userExposureMultiplier: userExposureMultiplierFromEv(
      normalized.userExposureEv,
    ),
    userContrastFactor: contrastFactorFromAmount(normalized.userContrast),
    contrastPivot: USER_CONTRAST_PIVOT,
    luminanceCoefficients: LINEAR_PROPHOTO_LUMINANCE,
  }
}

export function applyUserExposureRgb(
  rgb: Rgb,
  multiplier: number,
): [number, number, number] {
  return [rgb[0] * multiplier, rgb[1] * multiplier, rgb[2] * multiplier]
}

export function applyUserContrastRgb(
  rgb: Rgb,
  tone: ResolvedToneParams,
): [number, number, number] {
  if (tone.userContrast === 0) {
    return [rgb[0], rgb[1], rgb[2]]
  }

  const r = Math.max(rgb[0], 0)
  const g = Math.max(rgb[1], 0)
  const b = Math.max(rgb[2], 0)
  const [yr, yg, yb] = tone.luminanceCoefficients
  const y = yr * r + yg * g + yb * b
  if (y <= 0) return [0, 0, 0]

  const targetY =
    tone.contrastPivot *
    Math.pow(y / tone.contrastPivot, tone.userContrastFactor)
  const scale = targetY / y
  return [r * scale, g * scale, b * scale]
}

export function applyUserToneRgb(
  rgb: Rgb,
  tone: ResolvedToneParams,
): [number, number, number] {
  return applyUserContrastRgb(
    applyUserExposureRgb(rgb, tone.userExposureMultiplier),
    tone,
  )
}
