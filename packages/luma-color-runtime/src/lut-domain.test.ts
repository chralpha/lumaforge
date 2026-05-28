import { describe, expect, it } from 'vitest'

import { compressLutInputToDomain } from './lut-domain'

describe('compressLutInputToDomain', () => {
  it('leaves values inside the LUT domain unchanged', () => {
    expect(
      compressLutInputToDomain([0.2, 0.5, 0.8], [0, 0, 0], [1, 1, 1]),
    ).toEqual([0.2, 0.5, 0.8])
  })

  it('preserves channel ratios when highlights exceed the LUT domain', () => {
    const compressed = compressLutInputToDomain(
      [1.6, 1.2, 0.8],
      [0, 0, 0],
      [1, 1, 1],
    )

    expect(compressed[0]).toBeCloseTo(1)
    expect(compressed[1]).toBeCloseTo(0.75)
    expect(compressed[2]).toBeCloseTo(0.5)
  })

  it('uses the declared domain before ratio-preserving compression', () => {
    const compressed = compressLutInputToDomain(
      [1.25, 0.875, 0.5],
      [0.25, 0.25, 0.25],
      [0.75, 0.75, 0.75],
    )

    expect(compressed[0]).toBeCloseTo(0.75)
    expect(compressed[1]).toBeCloseTo(0.5625)
    expect(compressed[2]).toBeCloseTo(0.375)
  })
})
