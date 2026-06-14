import { describe, expect, it } from 'vitest'

import {
  linearProPhotoToOklab,
  oklabToLinearProPhoto,
  oklabToOklch,
  oklchToOklab,
  signedCbrt,
} from './oklab'

type Vec3 = readonly [number, number, number]
type Mat3F64 = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
]

const M_PROPHOTO_TO_XYZ_D50_F64: Mat3F64 = [
  0.7976749, 0.1351917, 0.0313534, 0.2880402, 0.7118741, 0.0000857, 0.0, 0.0,
  0.82521,
]

const M_BRADFORD_D50_TO_D65_F64: Mat3F64 = [
  0.9555766, -0.0230393, 0.0631636, -0.0282895, 1.0099416, 0.0210077, 0.0122982,
  -0.020483, 1.3299098,
]

const M_XYZ_D65_TO_LMS_F64: Mat3F64 = [
  0.818933, 0.3618667, -0.1288598, 0.0329845, 0.9293119, 0.0361457, 0.0482003,
  0.2643662, 0.6338517,
]

const M_LMS_TO_OKLAB_F64: Mat3F64 = [
  0.2104542553, 0.793617785, -0.0040720468, 1.9779984951, -2.428592205,
  0.4505937099, 0.0259040371, 0.7827717662, -0.808675766,
]

function mat3MultiplyF64(a: Mat3F64, b: Mat3F64): Mat3F64 {
  const result = Array.from({length: 9})
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      result[row * 3 + col] =
        a[row * 3 + 0] * b[0 * 3 + col] +
        a[row * 3 + 1] * b[1 * 3 + col] +
        a[row * 3 + 2] * b[2 * 3 + col]
    }
  }
  return result as unknown as Mat3F64
}

function mat3InvertF64(m: Mat3F64): Mat3F64 {
  const [a, b, c, d, e, f, g, h, i] = m
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)
  if (Math.abs(det) < 1e-12) {
    throw new Error('singular F64 reference matrix')
  }
  const invDet = 1 / det
  return [
    (e * i - f * h) * invDet,
    (c * h - b * i) * invDet,
    (b * f - c * e) * invDet,
    (f * g - d * i) * invDet,
    (a * i - c * g) * invDet,
    (c * d - a * f) * invDet,
    (d * h - e * g) * invDet,
    (b * g - a * h) * invDet,
    (a * e - b * d) * invDet,
  ]
}

function mat3MulVecF64(m: Mat3F64, v: Vec3): [number, number, number] {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ]
}

function signedCbrtF64(x: number): number {
  return Math.sign(x) * Math.pow(Math.abs(x), 1 / 3)
}

const M_PROPHOTO_TO_LMS_F64: Mat3F64 = mat3MultiplyF64(
  mat3MultiplyF64(M_XYZ_D65_TO_LMS_F64, M_BRADFORD_D50_TO_D65_F64),
  M_PROPHOTO_TO_XYZ_D50_F64,
)
const M_LMS_TO_PROPHOTO_F64: Mat3F64 = mat3InvertF64(M_PROPHOTO_TO_LMS_F64)
const M_OKLAB_TO_LMS_F64: Mat3F64 = mat3InvertF64(M_LMS_TO_OKLAB_F64)

function linearProPhotoToOklabF64(rgb: Vec3): [number, number, number] {
  const lms = mat3MulVecF64(M_PROPHOTO_TO_LMS_F64, rgb)
  const lmsPrime: Vec3 = [
    signedCbrtF64(lms[0]),
    signedCbrtF64(lms[1]),
    signedCbrtF64(lms[2]),
  ]
  return mat3MulVecF64(M_LMS_TO_OKLAB_F64, lmsPrime)
}

function oklabToLinearProPhotoF64(lab: Vec3): [number, number, number] {
  const lmsPrime = mat3MulVecF64(M_OKLAB_TO_LMS_F64, lab)
  const lms: Vec3 = [
    lmsPrime[0] * lmsPrime[0] * lmsPrime[0],
    lmsPrime[1] * lmsPrime[1] * lmsPrime[1],
    lmsPrime[2] * lmsPrime[2] * lmsPrime[2],
  ]
  return mat3MulVecF64(M_LMS_TO_PROPHOTO_F64, lms)
}

const SRGB_TO_XYZ_D65_F64: Mat3F64 = [
  0.4123907992659595, 0.357584339383878, 0.1804807884018343,
  0.21263900587151036, 0.715168678767756, 0.07219231536073371,
  0.01933081871559185, 0.11919477979462598, 0.9505321522496606,
]
const XYZ_D65_TO_PROPHOTO_D50_F64: Mat3F64 = mat3InvertF64(
  mat3MultiplyF64(M_BRADFORD_D50_TO_D65_F64, M_PROPHOTO_TO_XYZ_D50_F64),
)

function srgbCompanding(value: number): number {
  if (value <= 0.04045) return value / 12.92
  return Math.pow((value + 0.055) / 1.055, 2.4)
}

function srgb8ToLinearProPhotoF64(
  r: number,
  g: number,
  b: number,
): [number, number, number] {
  const linearSrgb: Vec3 = [
    srgbCompanding(r / 255),
    srgbCompanding(g / 255),
    srgbCompanding(b / 255),
  ]
  const xyz = mat3MulVecF64(SRGB_TO_XYZ_D65_F64, linearSrgb)
  return mat3MulVecF64(XYZ_D65_TO_PROPHOTO_D50_F64, xyz)
}

// Canonical X-Rite ColorChecker 24 sRGB (8-bit) values. The OKLab round-trip
// only needs in-gamut linear ProPhoto triplets; we lift these to linear
// ProPhoto with F64 math inside the test fixture.
const COLORCHECKER_SRGB_8BIT: ReadonlyArray<[number, number, number]> = [
  [115, 82, 68], // dark skin
  [194, 150, 130], // light skin
  [98, 122, 157], // blue sky
  [87, 108, 67], // foliage
  [133, 128, 177], // blue flower
  [103, 189, 170], // bluish green
  [214, 126, 44], // orange
  [80, 91, 166], // purplish blue
  [193, 90, 99], // moderate red
  [94, 60, 108], // purple
  [157, 188, 64], // yellow green
  [224, 163, 46], // orange yellow
  [56, 61, 150], // blue
  [70, 148, 73], // green
  [175, 54, 60], // red
  [231, 199, 31], // yellow
  [187, 86, 149], // magenta
  [8, 133, 161], // cyan
  [243, 243, 242], // white
  [200, 200, 200], // neutral 8
  [160, 160, 160], // neutral 6.5
  [122, 122, 121], // neutral 5
  [85, 85, 85], // neutral 3.5
  [52, 52, 52], // black
]

const COLORCHECKER_LINEAR_PROPHOTO: ReadonlyArray<[number, number, number]> =
  COLORCHECKER_SRGB_8BIT.map((p) => srgb8ToLinearProPhotoF64(p[0], p[1], p[2]))

function expectCloseTriplet(
  actual: Float32Array | readonly [number, number, number],
  expected: readonly [number, number, number],
  tolerance: number,
  label: string,
) {
  expect(
    Math.abs(actual[0] - expected[0]),
    `${label} channel 0 (got ${actual[0]} expected ${expected[0]})`,
  ).toBeLessThanOrEqual(tolerance)
  expect(
    Math.abs(actual[1] - expected[1]),
    `${label} channel 1 (got ${actual[1]} expected ${expected[1]})`,
  ).toBeLessThanOrEqual(tolerance)
  expect(
    Math.abs(actual[2] - expected[2]),
    `${label} channel 2 (got ${actual[2]} expected ${expected[2]})`,
  ).toBeLessThanOrEqual(tolerance)
}

describe('signedCbrt', () => {
  it('matches sign(x) * pow(abs(x), 1/3) per channel including negatives', () => {
    const samples = [-2.5, -1, -0.5, -1e-6, 0, 1e-6, 0.5, 1, 2.5, 8]
    for (const x of samples) {
      const got = signedCbrt(x)
      const expected = Math.sign(x) * Math.pow(Math.abs(x), 1 / 3)
      expect(Math.abs(got - expected)).toBeLessThanOrEqual(1e-12)
    }
  })

  it('keeps the element-wise cube as a clean inverse', () => {
    const samples = [-2, -0.4, -0.001, 0.001, 0.4, 2]
    for (const x of samples) {
      const y = signedCbrt(x)
      const round = y * y * y
      expect(Math.abs(round - x)).toBeLessThanOrEqual(1e-12)
    }
  })
})

describe('linearProPhotoToOklab / oklabToLinearProPhoto round-trip', () => {
  it('round-trips the 24 ColorChecker patches within 1e-5 per channel', () => {
    const labOut = new Float32Array(3)
    const rgbOut = new Float32Array(3)
    COLORCHECKER_LINEAR_PROPHOTO.forEach((rgb, index) => {
      const refLab = linearProPhotoToOklabF64(rgb)
      const refRgb = oklabToLinearProPhotoF64(refLab)

      linearProPhotoToOklab(rgb, labOut)
      oklabToLinearProPhoto(labOut, rgbOut)

      expectCloseTriplet(labOut, refLab, 1e-5, `patch ${index} forward OKLab`)
      expectCloseTriplet(rgbOut, refRgb, 1e-5, `patch ${index} round-trip rgb`)
      // Round-trip closes to input within the same tolerance.
      expectCloseTriplet(rgbOut, rgb, 1e-5, `patch ${index} vs input rgb`)
    })
  })

  it('preserves sign on synthetic samples that hit a negative LMS channel', () => {
    // Wide-gamut/out-of-sRGB samples chosen to drive at least one LMS channel
    // negative (verified by the F64 reference). The forward `signedCbrt` plus
    // inverse element-wise cube must restore the original linear ProPhoto.
    // The L row of M_PROPHOTO_TO_LMS has a negative B coefficient
    // (≈ −0.068), so a ProPhoto colour with very little red/green and a lot
    // of blue drives the L channel negative.
    const negativeLmsInputs: ReadonlyArray<[number, number, number]> = [
      [0.0, 0.0, 1.0],
      [0.01, 0.02, 1.5],
      [0.0, 0.05, 0.6],
      [0.05, 0.0, 0.8],
    ]

    const labOut = new Float32Array(3)
    const rgbOut = new Float32Array(3)
    negativeLmsInputs.forEach((rgb, index) => {
      const lmsRef = mat3MulVecF64(M_PROPHOTO_TO_LMS_F64, rgb)
      expect(
        Math.min(lmsRef[0], lmsRef[1], lmsRef[2]),
        `sample ${index} should produce a negative LMS channel`,
      ).toBeLessThan(0)

      const refLab = linearProPhotoToOklabF64(rgb)
      linearProPhotoToOklab(rgb, labOut)
      oklabToLinearProPhoto(labOut, rgbOut)

      expectCloseTriplet(
        labOut,
        refLab,
        1e-5,
        `negative-LMS sample ${index} OKLab`,
      )
      expectCloseTriplet(
        rgbOut,
        rgb,
        1e-5,
        `negative-LMS sample ${index} round-trip`,
      )
    })
  })
})

describe('oklabToOklch / oklchToOklab', () => {
  it('round-trips a 24-step hue ramp at L=0.7, C=0.10 within F32 tolerance', () => {
    const L = 0.7
    const C = 0.1
    const labOut = new Float32Array(3)
    const lchOut = new Float32Array(3)
    const labRoundtrip = new Float32Array(3)
    for (let i = 0; i < 24; i++) {
      const hNorm = i / 24
      const angle = hNorm * 2 * Math.PI
      const a = C * Math.cos(angle)
      const b = C * Math.sin(angle)
      labOut[0] = L
      labOut[1] = a
      labOut[2] = b
      oklabToOklch(labOut, lchOut)
      expect(Math.abs(lchOut[0] - L)).toBeLessThanOrEqual(1e-6)
      expect(Math.abs(lchOut[1] - C)).toBeLessThanOrEqual(1e-6)
      // h_norm in [0, 1) and approximately matches i/24
      expect(lchOut[2]).toBeGreaterThanOrEqual(0)
      expect(lchOut[2]).toBeLessThan(1)
      const expectedHNorm = hNorm
      // Wrap-tolerant comparison across the 0/1 seam.
      const delta = Math.min(
        Math.abs(lchOut[2] - expectedHNorm),
        Math.abs(lchOut[2] - expectedHNorm - 1),
        Math.abs(lchOut[2] - expectedHNorm + 1),
      )
      expect(delta, `hue ${i} h_norm`).toBeLessThanOrEqual(1e-6)

      oklchToOklab(lchOut, labRoundtrip)
      expect(Math.abs(labRoundtrip[0] - L)).toBeLessThanOrEqual(1e-6)
      expect(Math.abs(labRoundtrip[1] - a)).toBeLessThanOrEqual(1e-6)
      expect(Math.abs(labRoundtrip[2] - b)).toBeLessThanOrEqual(1e-6)
    }
  })

  it('maps the +a half-axis to h_norm = 0 (hue_axis_origin)', () => {
    const lab = new Float32Array([0.7, 0.25, 0])
    const lch = new Float32Array(3)
    oklabToOklch(lab, lch)
    expect(Math.abs(lch[0] - 0.7)).toBeLessThanOrEqual(1e-6)
    expect(Math.abs(lch[1] - 0.25)).toBeLessThanOrEqual(1e-6)
    expect(lch[2]).toBe(0)
  })

  it('keeps h_norm in [0, 1) across all four cartesian quadrants', () => {
    const samples: ReadonlyArray<[number, number]> = [
      [0.1, 0.1],
      [-0.1, 0.1],
      [-0.1, -0.1],
      [0.1, -0.1],
      [0.0, -1e-8],
    ]
    const lab = new Float32Array(3)
    const lch = new Float32Array(3)
    for (const [a, b] of samples) {
      lab[0] = 0.5
      lab[1] = a
      lab[2] = b
      oklabToOklch(lab, lch)
      expect(lch[2]).toBeGreaterThanOrEqual(0)
      expect(lch[2]).toBeLessThan(1)
    }
  })
})
