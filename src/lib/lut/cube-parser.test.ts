import { describe, expect, it } from 'vitest'

import { parseCubeLUT, toLUTData } from './cube-parser'

function makeCube({
  comments = [],
  mutateEntry,
  size = 2,
  title,
}: {
  comments?: string[]
  mutateEntry?: (input: {
    b: number
    g: number
    index: number
    r: number
    values: [number, number, number]
  }) => [number, number, number]
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
        const index = lines.length
        const values = mutateEntry
          ? mutateEntry({
              b,
              g,
              index,
              r,
              values: [r * step, g * step, b * step],
            })
          : [r * step, g * step, b * step]
        lines.push(`${values[0]} ${values[1]} ${values[2]}`)
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

  it('does not treat output-side V-Log as Panasonic V-Log input', () => {
    const lut = parseCubeLUT(makeCube({ title: 'Sony technical LUT' }), {
      sourceName: 'SLog3_SGamut3Cine_to_VLog.cube',
    })

    expect(lut.profileResolution).toMatchObject({
      kind: 'resolved',
      confidence: 'filename',
      profile: {
        id: 'sony-sgamut3cine-slog3',
        outputRange: 'unknown',
      },
    })
    expect(lut.profileResolution).not.toMatchObject({
      kind: 'resolved',
      profile: { id: 'panasonic-vgamut-vlog' },
    })
    expect(lut.inputProfile).toBe('display-srgb')
  })

  it('keeps ambiguous output-side V-Log filenames out of high-confidence V-Log input', () => {
    const lut = parseCubeLUT(makeCube({ title: 'Conversion LUT' }), {
      sourceName: 'UnknownCamera_to_VLog.cube',
    })

    expect(lut.profileResolution).not.toMatchObject({
      kind: 'resolved',
      profile: { id: 'panasonic-vgamut-vlog' },
    })
    expect(lut.inputProfile).toBe('display-srgb')
  })

  it('annotates bare BT.709 and BT.1886 output phrases', () => {
    const bt709 = parseCubeLUT(makeCube({ title: 'Sony technical LUT' }), {
      sourceName: 'SLog3_SGamut3Cine_BT709.cube',
    })
    const bt1886 = parseCubeLUT(makeCube({ title: 'Sony technical LUT' }), {
      sourceName: 'SLog3_SGamut3Cine_BT.1886.cube',
    })

    for (const lut of [bt709, bt1886]) {
      expect(lut.profileResolution).toMatchObject({
        kind: 'resolved',
        profile: {
          id: 'sony-sgamut3cine-slog3',
          role: 'combined-look-output',
          outputGamut: 'srgb-rec709',
          outputTransfer: 'gamma24',
          outputRange: 'full',
        },
      })
    }
  })

  it('annotates to Linear and to Cineon output phrases conservatively', () => {
    const linear = parseCubeLUT(makeCube({ title: 'Sony technical LUT' }), {
      sourceName: 'SLog3_SGamut3Cine_to_Linear.cube',
    })
    const cineon = parseCubeLUT(makeCube({ title: 'Sony technical LUT' }), {
      sourceName: 'SLog3_SGamut3Cine_to_Cineon.cube',
    })

    expect(linear.profileResolution).toMatchObject({
      kind: 'resolved',
      profile: {
        id: 'sony-sgamut3cine-slog3',
        role: 'technical-output',
        outputRange: 'unknown',
      },
    })
    expect(cineon.profileResolution).toMatchObject({
      kind: 'resolved',
      profile: {
        id: 'sony-sgamut3cine-slog3',
        role: 'combined-look-output',
        outputRange: 'unknown',
      },
    })
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

  it('fingerprints interior LUT content instead of only endpoints', () => {
    const baseCube = makeCube({ size: 3, title: 'Same LUT' })
    const changedInteriorCube = makeCube({
      size: 3,
      title: 'Same LUT',
      mutateEntry: ({ r, g, b, values }) =>
        r === 1 && g === 1 && b === 1
          ? [0.12345, values[1], values[2]]
          : values,
    })
    const options = { sourceName: 'same-name.cube' }

    expect(parseCubeLUT(baseCube, options).fingerprint).not.toBe(
      parseCubeLUT(changedInteriorCube, options).fingerprint,
    )
  })
})
