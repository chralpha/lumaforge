export const USER_EXPOSURE_EV_MIN = -5
export const USER_EXPOSURE_EV_MAX = 5
export const USER_CONTRAST_MIN = -100
export const USER_CONTRAST_MAX = 100
export const USER_REGIONAL_TONE_MIN = -100
export const USER_REGIONAL_TONE_MAX = 100
export const USER_CONTRAST_PIVOT = 0.18
export const USER_REGIONAL_TONE_PIVOT = 0.18
export const LINEAR_PROPHOTO_LUMINANCE = [
  0.2880402, 0.7118741, 0.0000857,
] as const

export interface LumaColorToneParams {
  userExposureEv: number
  userContrast: number
  userHighlights: number
  userShadows: number
  userWhites: number
  userBlacks: number
}

export interface ResolvedToneParams extends LumaColorToneParams {
  userExposureMultiplier: number
  userContrastFactor: number
  contrastPivot: number
  regionalTonePivot: number
  luminanceCoefficients: readonly [number, number, number]
}

export type Rgb = readonly [number, number, number]
export type MutableRgb = [number, number, number]

export interface RegionalToneScaleInput {
  highlights: number
  shadows: number
  whites: number
  blacks: number
  pivot?: number
}

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

function regionalAmountToEv(amount: number, maxAbsEv: number) {
  return (amount / 100) * maxAbsEv
}

function smoothstep(edge0: number, edge1: number, value: number) {
  if (value <= edge0) return 0
  if (value >= edge1) return 1
  const t = (value - edge0) / (edge1 - edge0)
  return t * t * (3 - 2 * t)
}

export function linearProPhotoLuminanceFromRgb(
  r: number,
  g: number,
  b: number,
  coefficients: readonly [number, number, number] = LINEAR_PROPHOTO_LUMINANCE,
) {
  return coefficients[0] * r + coefficients[1] * g + coefficients[2] * b
}

export function userContrastScaleFromLuminance(
  luminance: number,
  tone: ResolvedToneParams,
) {
  if (tone.userContrast === 0) return 1
  if (luminance <= 0) return 0

  const targetY =
    tone.contrastPivot *
    Math.pow(luminance / tone.contrastPivot, tone.userContrastFactor)
  return targetY / luminance
}

export function hasUserRegionalTone(tone: LumaColorToneParams) {
  return (
    tone.userHighlights !== 0 ||
    tone.userShadows !== 0 ||
    tone.userWhites !== 0 ||
    tone.userBlacks !== 0
  )
}

export function userRegionalToneEvFromLuminance(
  luminance: number,
  tone: ResolvedToneParams,
) {
  return regionalToneEvFromLuminance(luminance, {
    highlights: tone.userHighlights,
    shadows: tone.userShadows,
    whites: tone.userWhites,
    blacks: tone.userBlacks,
    pivot: tone.regionalTonePivot,
  })
}

export function regionalToneEvFromLuminance(
  luminance: number,
  input: RegionalToneScaleInput,
) {
  if (
    input.highlights === 0 &&
    input.shadows === 0 &&
    input.whites === 0 &&
    input.blacks === 0
  ) {
    return 0
  }
  if (luminance <= 0) return 0

  const logLuminance = Math.log2(
    luminance / (input.pivot ?? USER_REGIONAL_TONE_PIVOT),
  )
  const highlightsMask = smoothstep(-1, 3, logLuminance)
  const shadowsMask = 1 - smoothstep(-4, 1, logLuminance)
  const whitesMask = smoothstep(2, 5.5, logLuminance)
  const blacksMask = 1 - smoothstep(-8, -3, logLuminance)

  return (
    highlightsMask * regionalAmountToEv(input.highlights, 1.25) +
    shadowsMask * regionalAmountToEv(input.shadows, 1.25) +
    whitesMask * regionalAmountToEv(input.whites, 1) +
    blacksMask * regionalAmountToEv(input.blacks, 1)
  )
}

export function regionalToneScaleFromLuminance(
  luminance: number,
  input: RegionalToneScaleInput,
) {
  if (
    input.highlights === 0 &&
    input.shadows === 0 &&
    input.whites === 0 &&
    input.blacks === 0
  ) {
    return 1
  }
  if (luminance <= 0) return 0
  return Math.pow(2, regionalToneEvFromLuminance(luminance, input))
}

export function userRegionalToneScaleFromLuminance(
  luminance: number,
  tone: ResolvedToneParams,
) {
  if (!hasUserRegionalTone(tone)) return 1
  if (luminance <= 0) return 0
  return regionalToneScaleFromLuminance(luminance, {
    highlights: tone.userHighlights,
    shadows: tone.userShadows,
    whites: tone.userWhites,
    blacks: tone.userBlacks,
    pivot: tone.regionalTonePivot,
  })
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
    userHighlights: clamp(
      finiteOrDefault(input?.userHighlights, 0),
      USER_REGIONAL_TONE_MIN,
      USER_REGIONAL_TONE_MAX,
    ),
    userShadows: clamp(
      finiteOrDefault(input?.userShadows, 0),
      USER_REGIONAL_TONE_MIN,
      USER_REGIONAL_TONE_MAX,
    ),
    userWhites: clamp(
      finiteOrDefault(input?.userWhites, 0),
      USER_REGIONAL_TONE_MIN,
      USER_REGIONAL_TONE_MAX,
    ),
    userBlacks: clamp(
      finiteOrDefault(input?.userBlacks, 0),
      USER_REGIONAL_TONE_MIN,
      USER_REGIONAL_TONE_MAX,
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
    regionalTonePivot: USER_REGIONAL_TONE_PIVOT,
    luminanceCoefficients: LINEAR_PROPHOTO_LUMINANCE,
  }
}

export function applyUserExposureRgb(
  rgb: Rgb,
  multiplier: number,
): [number, number, number] {
  return applyUserExposureRgbInto(rgb, multiplier, [0, 0, 0])
}

export function applyUserExposureRgbInto(
  rgb: Rgb,
  multiplier: number,
  out: MutableRgb,
): MutableRgb {
  out[0] = rgb[0] * multiplier
  out[1] = rgb[1] * multiplier
  out[2] = rgb[2] * multiplier
  return out
}

export function applyUserContrastRgb(
  rgb: Rgb,
  tone: ResolvedToneParams,
): [number, number, number] {
  return applyUserContrastRgbInto(rgb, tone, [0, 0, 0])
}

export function applyUserContrastRgbInto(
  rgb: Rgb,
  tone: ResolvedToneParams,
  out: MutableRgb,
): MutableRgb {
  if (tone.userContrast === 0) {
    out[0] = rgb[0]
    out[1] = rgb[1]
    out[2] = rgb[2]
    return out
  }

  const r = Math.max(rgb[0], 0)
  const g = Math.max(rgb[1], 0)
  const b = Math.max(rgb[2], 0)
  const y = linearProPhotoLuminanceFromRgb(r, g, b, tone.luminanceCoefficients)
  const scale = userContrastScaleFromLuminance(y, tone)

  out[0] = r * scale
  out[1] = g * scale
  out[2] = b * scale
  return out
}

export function applyUserRegionalToneRgb(
  rgb: Rgb,
  tone: ResolvedToneParams,
): [number, number, number] {
  return applyUserRegionalToneRgbInto(rgb, tone, [0, 0, 0])
}

export function applyUserRegionalToneRgbInto(
  rgb: Rgb,
  tone: ResolvedToneParams,
  out: MutableRgb,
): MutableRgb {
  if (!hasUserRegionalTone(tone)) {
    out[0] = rgb[0]
    out[1] = rgb[1]
    out[2] = rgb[2]
    return out
  }

  const r = Math.max(rgb[0], 0)
  const g = Math.max(rgb[1], 0)
  const b = Math.max(rgb[2], 0)
  const y = linearProPhotoLuminanceFromRgb(r, g, b, tone.luminanceCoefficients)
  const scale = userRegionalToneScaleFromLuminance(y, tone)

  out[0] = r * scale
  out[1] = g * scale
  out[2] = b * scale
  return out
}

export function applyUserToneRgb(
  rgb: Rgb,
  tone: ResolvedToneParams,
): [number, number, number] {
  return applyUserToneRgbInto(rgb, tone, [0, 0, 0])
}

export function applyUserToneRgbInto(
  rgb: Rgb,
  tone: ResolvedToneParams,
  out: MutableRgb,
): MutableRgb {
  applyUserExposureRgbInto(rgb, tone.userExposureMultiplier, out)
  applyUserContrastRgbInto(out, tone, out)
  return applyUserRegionalToneRgbInto(out, tone, out)
}
