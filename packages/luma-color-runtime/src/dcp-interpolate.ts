/**
 * Iterative DCP dual-illuminant interpolation per DNG spec.
 *
 * Pure TypeScript color math; no React, no I/O, no atoms. Float64
 * accumulators are used internally for stability; only the final
 * `xyzToCamera` output is narrowed to Float32 at the boundary.
 *
 * Given a DCP profile's `ColorMatrix1`/`ColorMatrix2` plus their
 * calibration illuminants and the current white-balance camera neutral,
 * solve for the interpolated XYZ-to-Camera transform that the DNG
 * renderer would use:
 *
 *   1. Initial guess: xy of `whiteNeutral` assuming the m1 transform.
 *   2. Loop up to `maxIterations`:
 *      a. CCT(xy) via McCamy.
 *      b. alpha = ( (1/cct − 1/cct1) / (1/cct2 − 1/cct1) ), clamp [0,1].
 *      c. xyzToCamera = lerp(m1, m2, alpha).
 *      d. xyz = invert3x3(xyzToCamera) · whiteNeutral.
 *      e. xy' from xyz; converged when |xy' − xy|_inf < tolerance.
 *
 * Single-illuminant profiles (m2/i2 null) short-circuit to m1.
 */

import { D50_WHITE } from './constants'

export interface DcpIlluminant {
  readonly cct: number
  readonly xy?: readonly [number, number]
}

export interface DcpInterpolationInput {
  readonly matrices: {
    readonly m1: readonly number[]
    readonly m2?: readonly number[] | null
  }
  readonly illuminants: {
    readonly i1: DcpIlluminant
    readonly i2?: DcpIlluminant | null
  }
  readonly whiteNeutral: readonly [number, number, number]
  readonly maxIterations?: number
  readonly convergenceTolerance?: number
}

export interface DcpInterpolationResult {
  readonly xyzToCamera: Float32Array
  readonly alpha: number
  readonly iterationsUsed: number
  readonly converged: boolean
}

const DEFAULT_MAX_ITERATIONS = 8
const DEFAULT_TOLERANCE = 1e-7

const D50_FALLBACK_XY: readonly [number, number] = [D50_WHITE[0], D50_WHITE[1]]

/**
 * Solve the DNG-style iterative DCP interpolation.
 *
 * Single-illuminant inputs (m2 or i2 missing) return m1 directly with
 * alpha = 0 and iterationsUsed = 0.
 *
 * Dual-illuminant inputs iterate to convergence within `maxIterations`.
 * Equal-CCT illuminants degenerate to m1.
 */
export function solveDcpInterpolation(
  input: DcpInterpolationInput,
): DcpInterpolationResult {
  const {
    matrices: { m1, m2 },
    illuminants: { i1, i2 },
    whiteNeutral,
    maxIterations = DEFAULT_MAX_ITERATIONS,
    convergenceTolerance = DEFAULT_TOLERANCE,
  } = input

  if (m1.length !== 9) {
    throw new Error(
      `solveDcpInterpolation: m1 must have length 9, got ${m1.length}`,
    )
  }

  // Single-illuminant fast path.
  if (!m2 || !i2) {
    return {
      xyzToCamera: toFloat32Matrix(m1),
      alpha: 0,
      iterationsUsed: 0,
      converged: true,
    }
  }

  if (m2.length !== 9) {
    throw new Error(
      `solveDcpInterpolation: m2 must have length 9, got ${m2.length}`,
    )
  }

  // Degenerate equal-CCT illuminants: avoid divide-by-zero, fall back to m1.
  const invCct1 = 1 / i1.cct
  const invCct2 = 1 / i2.cct
  const invDelta = invCct2 - invCct1
  if (!Number.isFinite(invDelta) || Math.abs(invDelta) < 1e-12) {
    return {
      xyzToCamera: toFloat32Matrix(m1),
      alpha: 0,
      iterationsUsed: 0,
      converged: true,
    }
  }

  const m1f = float64Matrix(m1)
  const m2f = float64Matrix(m2)
  const wn: readonly [number, number, number] = [
    whiteNeutral[0],
    whiteNeutral[1],
    whiteNeutral[2],
  ]

  // Initial guess: xy at illuminant1 if known, otherwise from m1 alone.
  let xy: readonly [number, number]
  if (i1.xy) {
    xy = [i1.xy[0], i1.xy[1]]
  } else {
    const camToXyz0 = invert3x3(m1f)
    const xyz0 = matVec3(camToXyz0, wn)
    xy = xyFromXyz(xyz0)
  }

  let alpha = 0
  let interpolated = m1f
  let iterationsUsed = 0
  let converged = false

  for (let iter = 1; iter <= maxIterations; iter++) {
    iterationsUsed = iter

    const cct = mccamyXyToCct(xy)
    alpha = clamp01((1 / cct - invCct1) / invDelta)
    interpolated = matLerp9(m1f, m2f, alpha)

    const camToXyz = invert3x3(interpolated)
    const xyz = matVec3(camToXyz, wn)
    const xyNext = xyFromXyz(xyz)

    const dx = Math.abs(xyNext[0] - xy[0])
    const dy = Math.abs(xyNext[1] - xy[1])
    xy = xyNext

    if (Math.max(dx, dy) < convergenceTolerance) {
      converged = true
      break
    }
  }

  return {
    xyzToCamera: toFloat32From64(interpolated),
    alpha,
    iterationsUsed,
    converged,
  }
}

/**
 * McCamy's approximation: xy chromaticity → CCT in Kelvin.
 * n = (x − 0.3320) / (0.1858 − y); CCT = 449 n^3 + 3525 n^2 + 6823.3 n + 5520.33.
 *
 * Reference epicenter `(xe, ye) = (0.3320, 0.1858)`. The denominator is
 * `0.1858 − y` (not `y − 0.1858`) per the original McCamy 1992 derivation;
 * this is what makes D65 ≈ 6504K and Illuminant A ≈ 2856K.
 */
export function mccamyXyToCct(xy: readonly [number, number]): number {
  const denom = 0.1858 - xy[1]
  // Avoid div-by-zero at the McCamy singularity; clamp denom away from 0.
  const safeDenom =
    Math.abs(denom) < 1e-12 ? (denom < 0 ? -1e-12 : 1e-12) : denom
  const n = (xy[0] - 0.332) / safeDenom
  return 449 * n * n * n + 3525 * n * n + 6823.3 * n + 5520.33
}

/**
 * XYZ → xy chromaticity. Falls back to D50 xy when the tristimulus sum is
 * non-positive (degenerate / numerically empty XYZ).
 */
export function xyFromXyz(
  xyz: readonly [number, number, number],
): readonly [number, number] {
  const sum = xyz[0] + xyz[1] + xyz[2]
  if (!(sum > 0) || !Number.isFinite(sum)) {
    return D50_FALLBACK_XY
  }
  return [xyz[0] / sum, xyz[1] / sum]
}

/**
 * Float64 3x3 matrix inverse.
 * Returns the inverse; throws on near-singular matrices.
 */
export function invert3x3(m: Float64Array | readonly number[]): Float64Array {
  const a = m[0]
  const b = m[1]
  const c = m[2]
  const d = m[3]
  const e = m[4]
  const f = m[5]
  const g = m[6]
  const h = m[7]
  const i = m[8]

  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)

  if (!Number.isFinite(det) || Math.abs(det) < 1e-15) {
    throw new Error('invert3x3: matrix is singular')
  }

  const invDet = 1 / det
  const out = new Float64Array(9)
  out[0] = (e * i - f * h) * invDet
  out[1] = (c * h - b * i) * invDet
  out[2] = (b * f - c * e) * invDet
  out[3] = (f * g - d * i) * invDet
  out[4] = (a * i - c * g) * invDet
  out[5] = (c * d - a * f) * invDet
  out[6] = (d * h - e * g) * invDet
  out[7] = (b * g - a * h) * invDet
  out[8] = (a * e - b * d) * invDet
  return out
}

/**
 * Float64 3x3 · 3-vector multiply (row-major).
 */
export function matVec3(
  m: Float64Array | readonly number[],
  v: readonly [number, number, number],
): readonly [number, number, number] {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ]
}

/**
 * Float64 lerp(a, b, t) on two 9-element matrices.
 */
export function matLerp9(
  a: Float64Array | readonly number[],
  b: Float64Array | readonly number[],
  t: number,
): Float64Array {
  const out = new Float64Array(9)
  const ti = 1 - t
  for (let k = 0; k < 9; k++) {
    out[k] = a[k] * ti + b[k] * t
  }
  return out
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

function float64Matrix(source: readonly number[]): Float64Array {
  const out = new Float64Array(9)
  for (let k = 0; k < 9; k++) out[k] = source[k]
  return out
}

function toFloat32Matrix(source: readonly number[]): Float32Array {
  const out = new Float32Array(9)
  for (let k = 0; k < 9; k++) out[k] = source[k]
  return out
}

function toFloat32From64(source: Float64Array): Float32Array {
  const out = new Float32Array(9)
  for (let k = 0; k < 9; k++) out[k] = source[k]
  return out
}
