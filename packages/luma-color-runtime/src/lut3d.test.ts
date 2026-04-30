import { describe, expect, it } from 'vitest'

import { sampleLutTrilinear } from './lut3d'

function createIdentityLut(size: number) {
  const data = new Float32Array(size * size * size * 3)
  let index = 0

  for (let blue = 0; blue < size; blue += 1) {
    for (let green = 0; green < size; green += 1) {
      for (let red = 0; red < size; red += 1) {
        data[index] = red / Math.max(1, size - 1)
        data[index + 1] = green / Math.max(1, size - 1)
        data[index + 2] = blue / Math.max(1, size - 1)
        index += 3
      }
    }
  }

  return data
}

describe('sampleLutTrilinear', () => {
  it('samples an identity 2x2x2 LUT', () => {
    const lut = createIdentityLut(2)

    expect(sampleLutTrilinear(lut, 2, 0.5, 0.5, 0.5)).toEqual([0.5, 0.5, 0.5])
  })

  it('preserves axis order for asymmetric samples', () => {
    const lut = createIdentityLut(2)

    expect(sampleLutTrilinear(lut, 2, 0.25, 0.5, 0.75)).toEqual([
      0.25, 0.5, 0.75,
    ])
  })
})
