import { describe, expect, it } from 'vitest'

import { validateDcpParams } from './dcp-params'

// 9-element row-major matrix used as a generic valid matrix in the fixtures.
const identityMatrix = [1, 0, 0, 0, 1, 0, 0, 0, 1] as const

function makeValidDcpParams(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    profileName: 'Sample Camera Profile',
    uniqueCameraModelRestriction: 'Sony ILCE-7RM5',
    profileCalibrationSignature: null,
    profileEmbedPolicy: 3,
    illuminant1: { code: 17, cct: 2855 },
    illuminant2: { code: 21, cct: 6500, xy: [0.3127, 0.329] },
    colorMatrix1: [...identityMatrix],
    colorMatrix2: [...identityMatrix],
    forwardMatrix1: null,
    forwardMatrix2: null,
    toneCurve: null,
    hueSatMap: null,
    lookTable: null,
    ...overrides,
  }
}

describe('validateDcpParams', () => {
  it('accepts a minimal v1 document with all required fields present', () => {
    const result = validateDcpParams(makeValidDcpParams())

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.schemaVersion).toBe(1)
      expect(result.value.profileName).toBe('Sample Camera Profile')
      expect(result.value.toneCurve).toBeNull()
      expect(result.value.colorMatrix1).toHaveLength(9)
    }
  })

  it('accepts an optional CIE xy whitepoint on illuminants', () => {
    const result = validateDcpParams(
      makeValidDcpParams({
        illuminant1: { code: 17, cct: 2855, xy: [0.4476, 0.4074] },
      }),
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.illuminant1.xy).toEqual([0.4476, 0.4074])
    }
  })

  it('rejects schemaVersion !== 1 with a typed issue', () => {
    const result = validateDcpParams(makeValidDcpParams({ schemaVersion: 2 }))

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues).toEqual([
        expect.objectContaining({
          code: 'invalid-schema-version',
          path: 'schemaVersion',
        }),
      ])
    }
  })

  it('rejects non-object documents as invalid-shape', () => {
    expect(validateDcpParams(null)).toMatchObject({
      ok: false,
      issues: [{ code: 'invalid-shape' }],
    })
    expect(validateDcpParams('not-an-object')).toMatchObject({
      ok: false,
      issues: [{ code: 'invalid-shape' }],
    })
  })

  it('reports missing required keys instead of silently defaulting', () => {
    const doc = makeValidDcpParams()
    delete (doc as Record<string, unknown>).illuminant2

    const result = validateDcpParams(doc)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'missing-field',
            path: 'illuminant2',
          }),
        ]),
      )
    }
  })

  it('rejects color matrices that are not exactly 9 elements', () => {
    const result = validateDcpParams(
      makeValidDcpParams({ colorMatrix1: [1, 0, 0, 0, 1, 0] }),
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'invalid-field',
            path: 'colorMatrix1',
          }),
        ]),
      )
    }
  })

  it('rejects non-finite matrix entries', () => {
    const result = validateDcpParams(
      makeValidDcpParams({
        colorMatrix1: [1, 0, 0, 0, Number.NaN, 0, 0, 0, 1],
      }),
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'invalid-field',
            path: 'colorMatrix1[4]',
          }),
        ]),
      )
    }
  })

  it('rejects illuminant entries with non-positive cct', () => {
    const result = validateDcpParams(
      makeValidDcpParams({ illuminant1: { code: 17, cct: 0 } }),
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'invalid-field',
            path: 'illuminant1.cct',
          }),
        ]),
      )
    }
  })

  it('rejects profileEmbedPolicy outside [0, 3]', () => {
    const result = validateDcpParams(
      makeValidDcpParams({ profileEmbedPolicy: 7 }),
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'invalid-field',
            path: 'profileEmbedPolicy',
          }),
        ]),
      )
    }
  })

  it('accepts a baked tone curve descriptor', () => {
    const result = validateDcpParams(
      makeValidDcpParams({
        toneCurve: {
          encoding: 'cubic-spline-baked-1d-lut',
          size: 4096,
          values: 'AAAA',
        },
      }),
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.toneCurve).toEqual({
        encoding: 'cubic-spline-baked-1d-lut',
        size: 4096,
        values: 'AAAA',
      })
    }
  })

  it('rejects tone curves with unsupported encoding', () => {
    const result = validateDcpParams(
      makeValidDcpParams({
        toneCurve: {
          encoding: 'piecewise-linear',
          size: 4096,
          values: 'AAAA',
        },
      }),
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'invalid-field',
            path: 'toneCurve.encoding',
          }),
        ]),
      )
    }
  })

  it('rejects empty profileName', () => {
    const result = validateDcpParams(makeValidDcpParams({ profileName: '' }))

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'invalid-field',
            path: 'profileName',
          }),
        ]),
      )
    }
  })
})
