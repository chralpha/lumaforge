import { getLinearProPhotoToGamutMatrix, mat3Invert } from './matrix'
import { linearProPhotoToOklab, oklabToOklch } from './oklab'

export type HSLBandId =
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'aqua'
  | 'blue'
  | 'purple'
  | 'magenta'

export interface HSLBandShift {
  readonly hue: number
  readonly saturation: number
  readonly lightness: number
}

export interface LumaColorSelectiveColorParams {
  readonly selectiveColor: Readonly<Record<HSLBandId, Readonly<HSLBandShift>>>
}

export type NormalizedSelectiveColorBands = Readonly<
  Record<HSLBandId, Readonly<HSLBandShift>>
>

export const HUE_MAX_DELTA_RAD = Math.PI / 6
export const SAT_MAX_FACTOR = 1.0
export const LIGHT_MAX_DELTA = 0.2
export const CHROMA_CLAMP_LOW = 0.005
export const CHROMA_CLAMP_HIGH = 0.02
export const LUT_SIZE = 256
export const LUT_CONSTANTS_VERSION = 1

const TWO_PI = Math.PI * 2

export function makeNeutralBand(): HSLBandShift {
  return { hue: 0, saturation: 0, lightness: 0 }
}

function wrapToTwoPi(value: number): number {
  const wrapped = value % TWO_PI
  return wrapped < 0 ? wrapped + TWO_PI : wrapped
}

function srgbPrimaryHueRad(
  rLinear: number,
  gLinear: number,
  bLinear: number,
  srgbToProPhoto: Float32Array,
  labOut: Float32Array,
  lchOut: Float32Array,
  proPhotoOut: Float32Array,
): number {
  proPhotoOut[0] =
    srgbToProPhoto[0] * rLinear +
    srgbToProPhoto[1] * gLinear +
    srgbToProPhoto[2] * bLinear
  proPhotoOut[1] =
    srgbToProPhoto[3] * rLinear +
    srgbToProPhoto[4] * gLinear +
    srgbToProPhoto[5] * bLinear
  proPhotoOut[2] =
    srgbToProPhoto[6] * rLinear +
    srgbToProPhoto[7] * gLinear +
    srgbToProPhoto[8] * bLinear
  linearProPhotoToOklab(proPhotoOut, labOut)
  oklabToOklch(labOut, lchOut)
  // The shared `oklabToOklch` returns h as a normalized fraction in [0, 1);
  // the bake-table contract wants radians in [0, 2π).
  return lchOut[2] * TWO_PI
}

function shortArcMidpoint(left: number, right: number): number {
  const a = wrapToTwoPi(left)
  const b = wrapToTwoPi(right)
  // Forward arc from a to b.
  const forward = wrapToTwoPi(b - a)
  // Short arc is the one with length <= π. If forward is shorter, midpoint is
  // a + forward/2; otherwise the short arc goes the other way and the midpoint
  // is a - (TWO_PI - forward)/2 = a + forward/2 - π.
  const halfForward = forward / 2
  const mid = forward <= Math.PI ? a + halfForward : a + halfForward - Math.PI
  return wrapToTwoPi(mid)
}

function computeBandCentersRad(): readonly number[] {
  const proPhotoToSrgb = getLinearProPhotoToGamutMatrix('srgb-rec709')
  const srgbToProPhoto = mat3Invert(proPhotoToSrgb)
  const labScratch = new Float32Array(3)
  const lchScratch = new Float32Array(3)
  const proPhotoScratch = new Float32Array(3)

  const hue = (r: number, g: number, b: number) =>
    srgbPrimaryHueRad(
      r,
      g,
      b,
      srgbToProPhoto,
      labScratch,
      lchScratch,
      proPhotoScratch,
    )

  const red = hue(1, 0, 0)
  const yellow = hue(1, 1, 0)
  const green = hue(0, 1, 0)
  const aqua = hue(0, 1, 1)
  const blue = hue(0, 0, 1)
  const magenta = hue(1, 0, 1)

  const orange = shortArcMidpoint(red, yellow)
  const purple = shortArcMidpoint(blue, magenta)

  return Object.freeze([
    wrapToTwoPi(red),
    orange,
    wrapToTwoPi(yellow),
    wrapToTwoPi(green),
    wrapToTwoPi(aqua),
    wrapToTwoPi(blue),
    purple,
    wrapToTwoPi(magenta),
  ])
}

export const BAND_CENTERS_RAD: readonly number[] = computeBandCentersRad()

export function adjacentBandCenters(h_i: number): {
  leftIdx: number
  rightIdx: number
} {
  const h = wrapToTwoPi(h_i)
  // Walk the bracket of consecutive centres until h lies in [left, right).
  // Left-inclusive: when h equals a centre exactly, that centre is the left
  // endpoint and the next centre is the right endpoint.
  for (let i = 0; i < BAND_CENTERS_RAD.length; i++) {
    const leftIdx = i
    const rightIdx = (i + 1) % BAND_CENTERS_RAD.length
    const left = BAND_CENTERS_RAD[leftIdx]
    const right = BAND_CENTERS_RAD[rightIdx]
    if (rightIdx === 0) {
      // Wrap-around bracket: h is in [magenta, 2π) or [0, red).
      if (h >= left || h < right) {
        return { leftIdx, rightIdx }
      }
    } else if (h >= left && h < right) {
      return { leftIdx, rightIdx }
    }
  }
  // Unreachable when BAND_CENTERS_RAD covers [0, 2π); fall back to the
  // wrap-around bracket to keep the signature total.
  return { leftIdx: BAND_CENTERS_RAD.length - 1, rightIdx: 0 }
}

export function wrapFraction(h: number, left: number, right: number): number {
  const rightEffective = right >= left ? right : right + TWO_PI
  const hEffective = h >= left ? h : h + TWO_PI
  return Math.min(1, Math.max(0, (hEffective - left) / (rightEffective - left)))
}

export function mixBandShift(
  left: HSLBandShift,
  right: HSLBandShift,
  t: number,
): HSLBandShift {
  const oneMinusT = 1 - t
  return {
    hue: oneMinusT * left.hue + t * right.hue,
    saturation: oneMinusT * left.saturation + t * right.saturation,
    lightness: oneMinusT * left.lightness + t * right.lightness,
  }
}

export interface UserSelectiveColorGraphStep {
  readonly kind: 'user-selective-color'
  readonly bands: NormalizedSelectiveColorBands
  readonly chromaClampLow: number
  readonly chromaClampHigh: number
  readonly workingSpace: 'oklab-via-prophoto-d65'
  readonly operator: 'oklch-per-band-shift'
  readonly constantsVersion: number
}

export interface PreparedSelectiveColorLut {
  readonly bands: NormalizedSelectiveColorBands
  readonly buffer: Float32Array
  readonly constantsVersion: number
}

const BAND_IDS_ORDERED: readonly HSLBandId[] = [
  'red',
  'orange',
  'yellow',
  'green',
  'aqua',
  'blue',
  'purple',
  'magenta',
]

function clamp(value: number, lo: number, hi: number): number {
  return value < lo ? lo : value > hi ? hi : value
}

function normalizeScalar(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  return clamp(value, -100, 100)
}

function normalizeBand(raw: unknown): HSLBandShift {
  if (raw === null || typeof raw !== 'object') return makeNeutralBand()
  const candidate = raw as Partial<HSLBandShift>
  return {
    hue: normalizeScalar(candidate.hue),
    saturation: normalizeScalar(candidate.saturation),
    lightness: normalizeScalar(candidate.lightness),
  }
}

function normalizeBands(source: unknown): NormalizedSelectiveColorBands {
  const sourceRecord =
    source !== null && typeof source === 'object'
      ? (source as Partial<Record<HSLBandId, unknown>>)
      : {}
  const out = {} as Record<HSLBandId, HSLBandShift>
  for (const id of BAND_IDS_ORDERED) {
    out[id] = normalizeBand(sourceRecord[id])
  }
  return out
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const denom = edge1 - edge0
  if (denom === 0) return x < edge0 ? 0 : 1
  const t = clamp((x - edge0) / denom, 0, 1)
  return t * t * (3 - 2 * t)
}

export function resolveSelectiveColorParams(
  params:
    | Partial<LumaColorSelectiveColorParams>
    | LumaColorSelectiveColorParams,
  outBuffer?: Float32Array,
): { step: UserSelectiveColorGraphStep; prepared: PreparedSelectiveColorLut } {
  const bands = normalizeBands(
    (params as Partial<LumaColorSelectiveColorParams>)?.selectiveColor,
  )
  if (outBuffer !== undefined && outBuffer.length !== 4 * LUT_SIZE) {
    throw new Error(
      `outBuffer length must be ${4 * LUT_SIZE}, got ${outBuffer.length}`,
    )
  }
  const buffer = outBuffer ?? new Float32Array(4 * LUT_SIZE)

  for (let i = 0; i < LUT_SIZE; i++) {
    const h_i = (i / LUT_SIZE) * TWO_PI
    const { leftIdx, rightIdx } = adjacentBandCenters(h_i)
    const t = wrapFraction(
      h_i,
      BAND_CENTERS_RAD[leftIdx],
      BAND_CENTERS_RAD[rightIdx],
    )
    const tPrime = smoothstep(0, 1, t)
    const mixed = mixBandShift(
      bands[BAND_IDS_ORDERED[leftIdx]],
      bands[BAND_IDS_ORDERED[rightIdx]],
      tPrime,
    )

    const base = 4 * i
    buffer[base + 0] = (mixed.hue / 100) * HUE_MAX_DELTA_RAD
    buffer[base + 1] = clamp(
      1 + (mixed.saturation / 100) * SAT_MAX_FACTOR,
      0,
      2,
    )
    buffer[base + 2] = (mixed.lightness / 100) * LIGHT_MAX_DELTA
    buffer[base + 3] = 0
  }

  const step: UserSelectiveColorGraphStep = {
    kind: 'user-selective-color',
    bands,
    chromaClampLow: CHROMA_CLAMP_LOW,
    chromaClampHigh: CHROMA_CLAMP_HIGH,
    workingSpace: 'oklab-via-prophoto-d65',
    operator: 'oklch-per-band-shift',
    constantsVersion: LUT_CONSTANTS_VERSION,
  }
  const prepared: PreparedSelectiveColorLut = {
    bands,
    buffer,
    constantsVersion: LUT_CONSTANTS_VERSION,
  }
  return { step, prepared }
}
