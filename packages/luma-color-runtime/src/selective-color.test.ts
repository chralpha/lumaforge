import { describe, expect, it } from 'vitest'

import { getLinearProPhotoToGamutMatrix, mat3Invert } from './matrix'
import { linearProPhotoToOklab, oklabToOklch } from './oklab'
import type {
  HSLBandId,
  HSLBandShift,
  LumaColorSelectiveColorParams,
} from './selective-color'
import {
  adjacentBandCenters,
  BAND_CENTERS_RAD,
  CHROMA_CLAMP_HIGH,
  CHROMA_CLAMP_LOW,
  HUE_MAX_DELTA_RAD,
  LIGHT_MAX_DELTA,
  LUT_CONSTANTS_VERSION,
  LUT_SIZE,
  makeNeutralBand,
  mixBandShift,
  resolveSelectiveColorParams,
  SAT_MAX_FACTOR,
  wrapFraction,
} from './selective-color'

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

const TWO_PI = Math.PI * 2

const DOCUMENTED_BAND_DEGREES: Readonly<Record<HSLBandId, number>> = {
  red: 29.2,
  orange: 69.5,
  yellow: 109.8,
  green: 142.5,
  aqua: 194.8,
  blue: 264.2,
  purple: 296.4,
  magenta: 328.5,
}

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180
}

function wrapToTwoPi(value: number): number {
  const wrapped = value % TWO_PI
  return wrapped < 0 ? wrapped + TWO_PI : wrapped
}

function angularDistance(a: number, b: number): number {
  const diff = Math.abs(a - b) % TWO_PI
  return Math.min(diff, TWO_PI - diff)
}

describe('selective-color constants', () => {
  it('exports the documented numeric constants', () => {
    expect(HUE_MAX_DELTA_RAD).toBeCloseTo(Math.PI / 6, 12)
    expect(SAT_MAX_FACTOR).toBe(1.0)
    expect(LIGHT_MAX_DELTA).toBe(0.2)
    expect(CHROMA_CLAMP_LOW).toBe(0.005)
    expect(CHROMA_CLAMP_HIGH).toBe(0.02)
    expect(LUT_SIZE).toBe(256)
    expect(LUT_CONSTANTS_VERSION).toBe(1)
  })

  it('bAND_CENTERS_RAD has length 8', () => {
    expect(BAND_CENTERS_RAD.length).toBe(8)
  })
})

describe('makeNeutralBand (state_safety)', () => {
  it('returns fresh objects so mutating one band does not leak into others', () => {
    const bands: HSLBandShift[] = BAND_IDS_ORDERED.map(() => makeNeutralBand())
    expect(bands.length).toBe(8)
    for (let i = 0; i < bands.length; i++) {
      for (let j = i + 1; j < bands.length; j++) {
        expect(bands[i]).not.toBe(bands[j])
      }
    }

    // Mutate one band's *resolved* shift via a fresh assignable copy.
    // The HSLBandShift type is deep-readonly at the type level, so we mutate
    // through a structurally-compatible mutable alias to prove that the
    // remaining seven bands are unaffected by reference and by value.
    type MutableShift = { hue: number; saturation: number; lightness: number }
    const mutable = bands[2] as unknown as MutableShift
    mutable.hue = 42
    mutable.saturation = -17
    mutable.lightness = 9

    for (let i = 0; i < bands.length; i++) {
      if (i === 2) continue
      expect(bands[i].hue).toBe(0)
      expect(bands[i].saturation).toBe(0)
      expect(bands[i].lightness).toBe(0)
    }
  })

  it('returns a fresh object each call', () => {
    const a = makeNeutralBand()
    const b = makeNeutralBand()
    expect(a).not.toBe(b)
    expect(a).toEqual({ hue: 0, saturation: 0, lightness: 0 })
    expect(b).toEqual({ hue: 0, saturation: 0, lightness: 0 })
  })
})

describe('oKLCh hue axis origin (hue_axis_origin)', () => {
  it('maps synthetic OKLab (a = 0.25, b = 0) to h_norm = 0 and LUT index 0', () => {
    const lab = new Float32Array([0.7, 0.25, 0])
    const lch = new Float32Array(3)
    oklabToOklch(lab, lch)
    expect(lch[2]).toBe(0)

    const lutIndex = Math.floor(lch[2] * LUT_SIZE)
    expect(lutIndex).toBe(0)
  })
})

describe('canonical red LUT position (canonical_red_lut_position)', () => {
  it('linear sRGB red maps to h_norm ≈ 0.0811 and LUT index between 20 and 21', () => {
    // Step 1: linear sRGB red.
    const linearSrgbRed: readonly [number, number, number] = [1, 0, 0]

    // Step 2: convert linear sRGB -> linear ProPhoto via the inverse of the
    // pro-photo -> sRGB gamut matrix.
    const proPhotoToSrgb = getLinearProPhotoToGamutMatrix('srgb-rec709')
    const srgbToProPhoto = mat3Invert(proPhotoToSrgb)
    const linearProPhotoRed = new Float32Array(3)
    linearProPhotoRed[0] =
      srgbToProPhoto[0] * linearSrgbRed[0] +
      srgbToProPhoto[1] * linearSrgbRed[1] +
      srgbToProPhoto[2] * linearSrgbRed[2]
    linearProPhotoRed[1] =
      srgbToProPhoto[3] * linearSrgbRed[0] +
      srgbToProPhoto[4] * linearSrgbRed[1] +
      srgbToProPhoto[5] * linearSrgbRed[2]
    linearProPhotoRed[2] =
      srgbToProPhoto[6] * linearSrgbRed[0] +
      srgbToProPhoto[7] * linearSrgbRed[1] +
      srgbToProPhoto[8] * linearSrgbRed[2]

    // Step 3: linear ProPhoto -> OKLab -> OKLCh.
    const lab = new Float32Array(3)
    const lch = new Float32Array(3)
    linearProPhotoToOklab(linearProPhotoRed, lab)
    oklabToOklch(lab, lch)

    const hNorm = lch[2]
    const expectedHNorm = 29.2 / 360
    // ±0.5° / 360° tolerance = ±0.00139
    expect(Math.abs(hNorm - expectedHNorm)).toBeLessThanOrEqual(0.5 / 360)

    const lutIndexFloat = hNorm * LUT_SIZE
    expect(lutIndexFloat).toBeGreaterThan(20)
    expect(lutIndexFloat).toBeLessThan(21)
  })
})

describe('bAND_CENTERS_RAD (band_centers_match_table)', () => {
  it('each computed band centre matches the documented degree within ±0.5°', () => {
    expect(BAND_CENTERS_RAD.length).toBe(BAND_IDS_ORDERED.length)
    const halfDegRad = degToRad(0.5)
    for (let i = 0; i < BAND_IDS_ORDERED.length; i++) {
      const bandId = BAND_IDS_ORDERED[i]
      const docDeg = DOCUMENTED_BAND_DEGREES[bandId]
      const docRad = wrapToTwoPi(degToRad(docDeg))
      const computed = BAND_CENTERS_RAD[i]
      expect(computed).toBeGreaterThanOrEqual(0)
      expect(computed).toBeLessThan(TWO_PI)
      const dist = angularDistance(computed, docRad)
      expect(
        dist,
        `band ${bandId} computed ${(computed * 180) / Math.PI} deg vs documented ${docDeg} deg`,
      ).toBeLessThanOrEqual(halfDegRad)
    }
  })

  it('band centres are strictly increasing in [0, 2π)', () => {
    for (let i = 1; i < BAND_CENTERS_RAD.length; i++) {
      expect(BAND_CENTERS_RAD[i]).toBeGreaterThan(BAND_CENTERS_RAD[i - 1])
    }
  })
})

describe('wrapFraction', () => {
  it('returns the fraction of the arc from left to right', () => {
    const left = degToRad(29.2)
    const right = degToRad(69.5)
    const mid = (left + right) / 2
    expect(wrapFraction(left, left, right)).toBeCloseTo(0, 10)
    expect(wrapFraction(right, left, right)).toBeCloseTo(1, 10)
    expect(wrapFraction(mid, left, right)).toBeCloseTo(0.5, 10)
  })

  it('clamps to [0, 1] outside the arc', () => {
    const left = degToRad(29.2)
    const right = degToRad(69.5)
    expect(wrapFraction(degToRad(20), left, right)).toBeGreaterThanOrEqual(0)
    expect(wrapFraction(degToRad(20), left, right)).toBeLessThanOrEqual(1)
  })

  it('handles wrap-around across the magenta -> red seam', () => {
    const left = degToRad(328.5)
    const right = degToRad(29.2)
    // h_i = 0 deg (just past magenta -> red seam at 360 deg)
    const t0 = wrapFraction(0, left, right)
    expect(t0).toBeGreaterThan(0)
    expect(t0).toBeLessThan(1)
    // h_i at left endpoint -> 0
    expect(wrapFraction(left, left, right)).toBeCloseTo(0, 10)
    // h_i at right endpoint -> 1
    expect(wrapFraction(right, left, right)).toBeCloseTo(1, 10)
  })
})

describe('adjacentBandCenters', () => {
  it('returns documented-order indices for an interior hue', () => {
    // Between orange (≈69.5°) and yellow (≈109.8°).
    const h = degToRad(90)
    const { leftIdx, rightIdx } = adjacentBandCenters(h)
    expect(leftIdx).toBe(1)
    expect(rightIdx).toBe(2)
  })

  it('wraps around for hues between magenta and red+2π', () => {
    // h_i = 0 deg lies between magenta (≈328.5°) and red+360 (≈389.2°).
    const { leftIdx, rightIdx } = adjacentBandCenters(0)
    expect(leftIdx).toBe(7)
    expect(rightIdx).toBe(0)
  })

  it('handles h_i exactly at a band centre (left-inclusive)', () => {
    // At exactly red centre, left-inclusive convention picks the bracket
    // starting at red.
    const h = BAND_CENTERS_RAD[0]
    const { leftIdx, rightIdx } = adjacentBandCenters(h)
    expect(leftIdx).toBe(0)
    expect(rightIdx).toBe(1)
  })
})

describe('mixBandShift', () => {
  it('returns left at t = 0 and right at t = 1', () => {
    const left: HSLBandShift = { hue: 10, saturation: 20, lightness: 30 }
    const right: HSLBandShift = { hue: -5, saturation: 50, lightness: 0 }
    const atZero = mixBandShift(left, right, 0)
    expect(atZero.hue).toBeCloseTo(10, 12)
    expect(atZero.saturation).toBeCloseTo(20, 12)
    expect(atZero.lightness).toBeCloseTo(30, 12)
    const atOne = mixBandShift(left, right, 1)
    expect(atOne.hue).toBeCloseTo(-5, 12)
    expect(atOne.saturation).toBeCloseTo(50, 12)
    expect(atOne.lightness).toBeCloseTo(0, 12)
  })

  it('linearly interpolates the three scalars at t = 0.5', () => {
    const left: HSLBandShift = { hue: 10, saturation: 20, lightness: 30 }
    const right: HSLBandShift = { hue: -10, saturation: 40, lightness: 0 }
    const mid = mixBandShift(left, right, 0.5)
    expect(mid.hue).toBeCloseTo(0, 12)
    expect(mid.saturation).toBeCloseTo(30, 12)
    expect(mid.lightness).toBeCloseTo(15, 12)
  })
})

function makeNeutralParams(): LumaColorSelectiveColorParams {
  const bands = {} as Record<HSLBandId, HSLBandShift>
  for (const id of BAND_IDS_ORDERED) {
    bands[id] = makeNeutralBand()
  }
  return { selectiveColor: bands }
}

function paramsWithBand(
  bandId: HSLBandId,
  shift: HSLBandShift,
): LumaColorSelectiveColorParams {
  const params = makeNeutralParams()
  const next = { ...params.selectiveColor, [bandId]: shift }
  return { selectiveColor: next }
}

describe('resolveSelectiveColorParams bake', () => {
  it('bake_size_invariant: writes exactly 1024 entries', () => {
    const { prepared } = resolveSelectiveColorParams(makeNeutralParams())
    expect(prepared.buffer.length).toBe(4 * LUT_SIZE)
    expect(prepared.buffer.length).toBe(1024)
  })

  it('reuses the caller-supplied out buffer when provided', () => {
    const out = new Float32Array(4 * LUT_SIZE)
    const { prepared } = resolveSelectiveColorParams(makeNeutralParams(), out)
    expect(prepared.buffer).toBe(out)
  })

  it('bake_field_naming: bake reads band.saturation, not band.sat', () => {
    const params = paramsWithBand('red', {
      hue: 0,
      saturation: 50,
      lightness: 0,
    })
    const { prepared } = resolveSelectiveColorParams(params)
    // The G channel at the red anchor index encodes 1 + (saturation/100) * SAT_MAX_FACTOR.
    // With saturation = 50 and SAT_MAX_FACTOR = 1.0, the value is bracketed
    // between 1 (no saturation contribution) and 2 (full clamp). If the bake
    // mistakenly reads `band.sat` (undefined), the resolved field is 0 and the
    // G channel collapses back to 1.0.
    const redCenter = BAND_CENTERS_RAD[0]
    const anchorIdx =
      Math.round((redCenter / (Math.PI * 2)) * LUT_SIZE) % LUT_SIZE
    const gAtAnchor = prepared.buffer[4 * anchorIdx + 1]
    expect(gAtAnchor).not.toBeCloseTo(1.0, 6)
    expect(gAtAnchor).toBeGreaterThan(1.0)
    expect(gAtAnchor).toBeLessThanOrEqual(2.0)
  })

  it('partition_of_unity_exactly_two_bands: only the two bracket bands contribute and weights sum to 1', () => {
    const markerHue = 100
    const tolerance = 1e-6
    const out = new Float32Array(4 * LUT_SIZE)

    for (let i = 0; i < LUT_SIZE; i++) {
      const h_i = (i / LUT_SIZE) * Math.PI * 2
      const { leftIdx, rightIdx } = adjacentBandCenters(h_i)

      const weights: number[] = Array.from<number>({
        length: BAND_IDS_ORDERED.length,
      }).fill(0)
      for (let b = 0; b < BAND_IDS_ORDERED.length; b++) {
        const bandId = BAND_IDS_ORDERED[b]
        const params = paramsWithBand(bandId, {
          hue: markerHue,
          saturation: 0,
          lightness: 0,
        })
        const { prepared } = resolveSelectiveColorParams(params, out)
        const rAtI = prepared.buffer[4 * i + 0]
        const weight = rAtI / HUE_MAX_DELTA_RAD / (markerHue / 100)

        if (b === leftIdx || b === rightIdx) {
          weights[b] = weight
        } else {
          expect(
            Math.abs(rAtI),
            `non-bracket band ${bandId} contributed to LUT index ${i}`,
          ).toBeLessThanOrEqual(tolerance)
        }
      }

      const sum = weights[leftIdx] + weights[rightIdx]
      expect(
        Math.abs(sum - 1),
        `bracket weights at LUT index ${i} sum to ${sum}, expected 1`,
      ).toBeLessThanOrEqual(tolerance)
    }
  })
})

describe('band_center_boundary_consistency', () => {
  it('both bracket choices at an exact band centre yield the same band shift', () => {
    // At h_i = red centre, evaluating from "red is the right endpoint" gives
    // t = 1 and the band equals red; evaluating from "red is the left
    // endpoint" gives t = 0 and the band also equals red. Both branches must
    // produce the same scalar triple regardless of the bracket choice.
    const redBand: HSLBandShift = { hue: 25, saturation: -10, lightness: 5 }
    const magentaBand: HSLBandShift = {
      hue: -40,
      saturation: 60,
      lightness: -20,
    }
    const orangeBand: HSLBandShift = { hue: 80, saturation: 30, lightness: 10 }

    // Branch A: red is the *right* endpoint (left = magenta, right = red), t = 1.
    const branchA = mixBandShift(magentaBand, redBand, 1)
    // Branch B: red is the *left* endpoint (left = red, right = orange), t = 0.
    const branchB = mixBandShift(redBand, orangeBand, 0)

    expect(branchA.hue).toBeCloseTo(branchB.hue, 12)
    expect(branchA.saturation).toBeCloseTo(branchB.saturation, 12)
    expect(branchA.lightness).toBeCloseTo(branchB.lightness, 12)
    // Sanity: both branches reproduce the red band exactly.
    expect(branchA).toEqual(redBand)
    expect(branchB).toEqual(redBand)
  })
})
