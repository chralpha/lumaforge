import { describe, expect, it } from 'vitest'

import { parseCubeLUT, toLUTData } from './cube-parser'

function makeCube({
  comment,
  size = 2,
  title,
}: {
  comment?: string
  size?: number
  title?: string
}) {
  const lines = [
    title ? `TITLE "${title}"` : '',
    comment ? `#${comment}` : '',
    `LUT_3D_SIZE ${size}`,
    '',
  ].filter(Boolean)
  const step = 1 / (size - 1)

  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        lines.push(`${r * step} ${g * step} ${b * step}`)
      }
    }
  }

  return lines.join('\n')
}

describe('cube-parser input profiles', () => {
  it('defaults custom LUTs to display sRGB input', () => {
    const lut = parseCubeLUT(makeCube({ title: 'Display LUT' }))

    expect(lut.inputProfile).toBe('display-srgb')
    expect(toLUTData(lut).inputProfile).toBe('display-srgb')
  })

  it('detects V-Log LUT markers from comments and file names', () => {
    const lut = parseCubeLUT(
      makeCube({ comment: 'LUMIXPHOTOSTYLE VLOG', title: 'Generated' }),
      { sourceName: 'FLog2C_to_CLASSIC-Neg_VLog.cube' },
    )

    expect(lut.inputProfile).toBe('v-log')
    expect(toLUTData(lut).inputProfile).toBe('v-log')
  })

  it('accepts scientific notation in LUT data values', () => {
    const lut = parseCubeLUT(`LUT_3D_SIZE 2
0 0 0
1.0e-5 0 0
0 1E-5 0
0 0 1e-5
0.5 0.5 0.5
1 0 0
0 1 0
0 0 1`)

    expect(lut.data.length).toBe(2 * 2 * 2 * 3)
    expect(lut.data[3]).toBeCloseTo(0.00001)
  })
})
