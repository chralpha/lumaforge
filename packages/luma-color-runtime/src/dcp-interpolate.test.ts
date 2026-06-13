import { describe, expect, it } from 'vitest'

import {
  invert3x3,
  matLerp9,
  matVec3,
  mccamyXyToCct,
  solveDcpInterpolation,
  xyFromXyz,
} from './dcp-interpolate'

// CIE illuminants A (~2856K) and D65 (~6504K) chromaticities.
const ILLUMINANT_A_XY: readonly [number, number] = [0.44757, 0.40745]
const ILLUMINANT_D65_XY: readonly [number, number] = [0.31272, 0.32903]
const ILLUMINANT_A_CCT = 2856
const ILLUMINANT_D65_CCT = 6504

// Synthetic ColorMatrix1 (XYZ→Camera at illuminant A, e.g. tungsten-leaning).
const COLOR_MATRIX_1: readonly number[] = [
  0.7, -0.1, 0.05, -0.2, 1.05, 0.1, 0.05, 0.15, 0.9,
]

// Synthetic ColorMatrix2 (XYZ→Camera at illuminant D65, daylight-leaning).
const COLOR_MATRIX_2: readonly number[] = [
  0.6, -0.05, 0.02, -0.18, 1.0, 0.07, 0.02, 0.1, 0.95,
]

function xyToXyz(
  xy: readonly [number, number],
): readonly [number, number, number] {
  const [x, y] = xy
  return [x / y, 1, (1 - x - y) / y]
}

function applyMatrix(
  m: readonly number[],
  v: readonly [number, number, number],
): readonly [number, number, number] {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ]
}

describe('helpers', () => {
  it('mccamyXyToCct returns plausible CCTs for canonical illuminants', () => {
    // McCamy is an approximation; D65 should land near 6500K.
    expect(mccamyXyToCct(ILLUMINANT_D65_XY)).toBeGreaterThan(6300)
    expect(mccamyXyToCct(ILLUMINANT_D65_XY)).toBeLessThan(6700)
    // Illuminant A is ~2856K but McCamy is only valid for ~3000–50000K;
    // it still produces a low number we can sanity-check.
    expect(mccamyXyToCct(ILLUMINANT_A_XY)).toBeLessThan(3500)
    expect(mccamyXyToCct(ILLUMINANT_A_XY)).toBeGreaterThan(2000)
  })

  it('xyFromXyz round-trips with xyToXyz', () => {
    const xyz = xyToXyz(ILLUMINANT_D65_XY)
    const xy = xyFromXyz(xyz)
    expect(xy[0]).toBeCloseTo(ILLUMINANT_D65_XY[0], 10)
    expect(xy[1]).toBeCloseTo(ILLUMINANT_D65_XY[1], 10)
  })

  it('xyFromXyz falls back to D50 when XYZ sum is zero', () => {
    const xy = xyFromXyz([0, 0, 0])
    expect(xy[0]).toBeCloseTo(0.3457, 6)
    expect(xy[1]).toBeCloseTo(0.3585, 6)
  })

  it('invert3x3 produces a true inverse', () => {
    const inv = invert3x3(COLOR_MATRIX_1)
    // Multiply m · inv and check identity.
    const product = new Float64Array(9)
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        let sum = 0
        for (let k = 0; k < 3; k++) {
          sum += COLOR_MATRIX_1[row * 3 + k] * inv[k * 3 + col]
        }
        product[row * 3 + col] = sum
      }
    }
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        expect(product[row * 3 + col]).toBeCloseTo(row === col ? 1 : 0, 10)
      }
    }
  })

  it('matVec3 multiplies row-major', () => {
    const v = matVec3([1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 1, 1])
    expect(v[0]).toBe(6)
    expect(v[1]).toBe(15)
    expect(v[2]).toBe(24)
  })

  it('matLerp9 linearly blends element-wise', () => {
    const a = new Float64Array([0, 0, 0, 0, 0, 0, 0, 0, 0])
    const b = new Float64Array([1, 1, 1, 1, 1, 1, 1, 1, 1])
    const out = matLerp9(a, b, 0.25)
    for (let k = 0; k < 9; k++) {
      expect(out[k]).toBeCloseTo(0.25, 12)
    }
  })
})

describe('solveDcpInterpolation', () => {
  it('returns m1 unchanged when m2/i2 are absent (single-illuminant)', () => {
    const result = solveDcpInterpolation({
      matrices: { m1: COLOR_MATRIX_1 },
      illuminants: { i1: { cct: ILLUMINANT_D65_CCT, xy: ILLUMINANT_D65_XY } },
      whiteNeutral: [0.6, 1.0, 0.7],
    })

    expect(result.iterationsUsed).toBe(0)
    expect(result.alpha).toBe(0)
    expect(result.converged).toBe(true)
    expect(result.xyzToCamera).toBeInstanceOf(Float32Array)
    expect(result.xyzToCamera).toHaveLength(9)
    for (let k = 0; k < 9; k++) {
      expect(result.xyzToCamera[k]).toBeCloseTo(COLOR_MATRIX_1[k], 6)
    }
  })

  it('returns m1 when m2 is explicitly null', () => {
    const result = solveDcpInterpolation({
      matrices: { m1: COLOR_MATRIX_1, m2: null },
      illuminants: {
        i1: { cct: ILLUMINANT_D65_CCT, xy: ILLUMINANT_D65_XY },
        i2: null,
      },
      whiteNeutral: [0.6, 1.0, 0.7],
    })
    expect(result.alpha).toBe(0)
    expect(result.iterationsUsed).toBe(0)
  })

  it('dual A↔D65: whiteNeutral at i1 (A) yields alpha ≈ 0', () => {
    const xyzAtA = xyToXyz(ILLUMINANT_A_XY)
    const whiteNeutral = applyMatrix(COLOR_MATRIX_1, xyzAtA) as [
      number,
      number,
      number,
    ]

    const result = solveDcpInterpolation({
      matrices: { m1: COLOR_MATRIX_1, m2: COLOR_MATRIX_2 },
      illuminants: {
        i1: { cct: ILLUMINANT_A_CCT, xy: ILLUMINANT_A_XY },
        i2: { cct: ILLUMINANT_D65_CCT, xy: ILLUMINANT_D65_XY },
      },
      whiteNeutral,
    })

    expect(result.converged).toBe(true)
    // McCamy is approximate at low CCT, but alpha must be very near 0.
    expect(result.alpha).toBeLessThan(0.05)
    expect(result.alpha).toBeGreaterThanOrEqual(0)
  })

  it('dual A↔D65: whiteNeutral at i2 (D65) yields alpha ≈ 1', () => {
    const xyzAtD65 = xyToXyz(ILLUMINANT_D65_XY)
    const whiteNeutral = applyMatrix(COLOR_MATRIX_2, xyzAtD65) as [
      number,
      number,
      number,
    ]

    const result = solveDcpInterpolation({
      matrices: { m1: COLOR_MATRIX_1, m2: COLOR_MATRIX_2 },
      illuminants: {
        i1: { cct: ILLUMINANT_A_CCT, xy: ILLUMINANT_A_XY },
        i2: { cct: ILLUMINANT_D65_CCT, xy: ILLUMINANT_D65_XY },
      },
      whiteNeutral,
    })

    expect(result.converged).toBe(true)
    expect(result.alpha).toBeGreaterThan(0.95)
    expect(result.alpha).toBeLessThanOrEqual(1)
  })

  it('mid-mix neutral converges within 8 iters with alpha in (0, 1)', () => {
    // A neutral whose camera response is roughly halfway between m1·A and m2·D65.
    const xyzAtA = xyToXyz(ILLUMINANT_A_XY)
    const xyzAtD65 = xyToXyz(ILLUMINANT_D65_XY)
    const camA = applyMatrix(COLOR_MATRIX_1, xyzAtA)
    const camD65 = applyMatrix(COLOR_MATRIX_2, xyzAtD65)
    const whiteNeutral: [number, number, number] = [
      (camA[0] + camD65[0]) / 2,
      (camA[1] + camD65[1]) / 2,
      (camA[2] + camD65[2]) / 2,
    ]

    const result = solveDcpInterpolation({
      matrices: { m1: COLOR_MATRIX_1, m2: COLOR_MATRIX_2 },
      illuminants: {
        i1: { cct: ILLUMINANT_A_CCT, xy: ILLUMINANT_A_XY },
        i2: { cct: ILLUMINANT_D65_CCT, xy: ILLUMINANT_D65_XY },
      },
      whiteNeutral,
    })

    expect(result.converged).toBe(true)
    expect(result.iterationsUsed).toBeLessThanOrEqual(8)
    expect(result.alpha).toBeGreaterThan(0)
    expect(result.alpha).toBeLessThan(1)
  })

  it('equal illuminant CCTs degenerate to m1 (no div by zero)', () => {
    const result = solveDcpInterpolation({
      matrices: { m1: COLOR_MATRIX_1, m2: COLOR_MATRIX_2 },
      illuminants: {
        i1: { cct: 5000, xy: [0.3457, 0.3585] },
        i2: { cct: 5000, xy: [0.3457, 0.3585] },
      },
      whiteNeutral: [0.6, 1.0, 0.7],
    })

    expect(result.alpha).toBe(0)
    expect(result.iterationsUsed).toBe(0)
    expect(result.converged).toBe(true)
    for (let k = 0; k < 9; k++) {
      expect(result.xyzToCamera[k]).toBeCloseTo(COLOR_MATRIX_1[k], 6)
    }
  })

  it('whiteNeutral outside both illuminants: alpha clamps without diverging', () => {
    // A strongly tinted neutral that does not correspond to any sensible CCT
    // inside the [A, D65] span.
    const result = solveDcpInterpolation({
      matrices: { m1: COLOR_MATRIX_1, m2: COLOR_MATRIX_2 },
      illuminants: {
        i1: { cct: ILLUMINANT_A_CCT, xy: ILLUMINANT_A_XY },
        i2: { cct: ILLUMINANT_D65_CCT, xy: ILLUMINANT_D65_XY },
      },
      whiteNeutral: [10, 1, 0.01],
    })

    expect(Number.isFinite(result.alpha)).toBe(true)
    expect(result.alpha).toBeGreaterThanOrEqual(0)
    expect(result.alpha).toBeLessThanOrEqual(1)
    for (let k = 0; k < 9; k++) {
      expect(Number.isFinite(result.xyzToCamera[k])).toBe(true)
    }
  })

  it('output is a length-9 row-major Float32Array', () => {
    const result = solveDcpInterpolation({
      matrices: { m1: COLOR_MATRIX_1, m2: COLOR_MATRIX_2 },
      illuminants: {
        i1: { cct: ILLUMINANT_A_CCT, xy: ILLUMINANT_A_XY },
        i2: { cct: ILLUMINANT_D65_CCT, xy: ILLUMINANT_D65_XY },
      },
      whiteNeutral: [0.6, 1.0, 0.7],
    })

    expect(result.xyzToCamera).toBeInstanceOf(Float32Array)
    expect(result.xyzToCamera).toHaveLength(9)
    // Row-major sanity: alpha=lerp coefficient should make every element a
    // convex combination of the corresponding m1/m2 element.
    for (let k = 0; k < 9; k++) {
      const lo = Math.min(COLOR_MATRIX_1[k], COLOR_MATRIX_2[k])
      const hi = Math.max(COLOR_MATRIX_1[k], COLOR_MATRIX_2[k])
      // Allow a tiny Float32 rounding slack.
      expect(result.xyzToCamera[k]).toBeGreaterThanOrEqual(lo - 1e-6)
      expect(result.xyzToCamera[k]).toBeLessThanOrEqual(hi + 1e-6)
    }
  })

  it('uses computed initial guess when illuminant1.xy is missing', () => {
    const xyzAtA = xyToXyz(ILLUMINANT_A_XY)
    const whiteNeutral = applyMatrix(COLOR_MATRIX_1, xyzAtA) as [
      number,
      number,
      number,
    ]

    const result = solveDcpInterpolation({
      matrices: { m1: COLOR_MATRIX_1, m2: COLOR_MATRIX_2 },
      illuminants: {
        i1: { cct: ILLUMINANT_A_CCT },
        i2: { cct: ILLUMINANT_D65_CCT, xy: ILLUMINANT_D65_XY },
      },
      whiteNeutral,
    })

    expect(result.converged).toBe(true)
    expect(result.alpha).toBeLessThan(0.1)
  })

  it('throws on malformed m1', () => {
    expect(() =>
      solveDcpInterpolation({
        matrices: { m1: [1, 2, 3] },
        illuminants: { i1: { cct: 5000 } },
        whiteNeutral: [1, 1, 1],
      }),
    ).toThrow(/m1 must have length 9/)
  })

  it('throws on malformed m2 when dual-illuminant', () => {
    expect(() =>
      solveDcpInterpolation({
        matrices: { m1: COLOR_MATRIX_1, m2: [1, 2, 3] },
        illuminants: {
          i1: { cct: ILLUMINANT_A_CCT, xy: ILLUMINANT_A_XY },
          i2: { cct: ILLUMINANT_D65_CCT, xy: ILLUMINANT_D65_XY },
        },
        whiteNeutral: [0.6, 1.0, 0.7],
      }),
    ).toThrow(/m2 must have length 9/)
  })
})
