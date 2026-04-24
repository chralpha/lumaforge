import { describe, expect, it } from 'vitest'

import { parseCubeLUT, toLUTData } from './cube-parser'

function makeCube({
  comments = [],
  size = 2,
  title,
}: {
  comments?: string[]
  size?: number
  title?: string
}) {
  const lines = [
    title ? `TITLE "${title}"` : '',
    ...comments.map((comment) => `# ${comment}`),
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
  it('preserves comments and falls back to the source file name for the title', () => {
    const lut = parseCubeLUT(
      makeCube({
        comments: ['Input: display referred sRGB', 'Created for web preview'],
      }),
      { sourceName: 'Client Display Look.cube' },
    )

    expect(lut.title).toBe('Client Display Look')
    expect(lut.sourceName).toBe('Client Display Look.cube')
    expect(lut.comments).toEqual([
      'Input: display referred sRGB',
      'Created for web preview',
    ])
    expect(lut.fingerprint).toEqual(expect.any(String))
    expect(lut.inputProfile).toBe('display-srgb')
    expect(toLUTData(lut).inputProfile).toBe('display-srgb')
  })

  it('does not force unknown LUTs to a display-sRGB profile resolution', () => {
    const lut = parseCubeLUT(makeCube({ title: 'Client Secret Sauce' }), {
      sourceName: 'unknown-look.cube',
    })

    expect(lut.profileResolution).toEqual({
      kind: 'needs-user-selection',
      suggestions: [],
    })
    expect(lut.inputProfile).toBe('display-srgb')
  })

  it('detects V-Log LUT markers from comments and file names', () => {
    const lut = parseCubeLUT(
      makeCube({ comments: ['LUMIXPHOTOSTYLE VLOG'], title: 'Generated' }),
      { sourceName: 'FLog2C_to_CLASSIC-Neg_VLog.cube' },
    )

    expect(lut.profileResolution).toMatchObject({
      kind: 'resolved',
      confidence: 'filename',
      profile: { id: 'panasonic-vgamut-vlog' },
    })
    expect(lut.inputProfile).toBe('v-log')
    expect(toLUTData(lut)).toMatchObject({
      inputProfile: 'v-log',
      profileResolution: {
        kind: 'resolved',
        profile: { id: 'panasonic-vgamut-vlog' },
      },
    })
  })

  it('annotates S-Log3 S-Gamut3.Cine LUTs with Rec.709 output metadata', () => {
    const lut = parseCubeLUT(makeCube({ title: 'Sony technical LUT' }), {
      sourceName: 'SLog3_SGamut3Cine_to_Rec709.cube',
    })

    expect(lut.profileResolution).toMatchObject({
      kind: 'resolved',
      confidence: 'filename',
      profile: {
        id: 'sony-sgamut3cine-slog3',
        role: 'combined-look-output',
        outputGamut: 'srgb-rec709',
        outputTransfer: 'gamma24',
        outputRange: 'full',
      },
    })
    expect(lut.inputProfile).toBe('display-srgb')
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
