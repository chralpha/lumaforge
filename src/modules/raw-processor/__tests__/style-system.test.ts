import { describe, expect, it } from 'vitest'

import { parseCubeLUT } from '~/lib/lut/cube-parser'

import {
  buildBuiltinStyle,
  buildLUTProfileSelectionState,
  mapIntensityLevel,
  toCustomStyle,
} from '../services/style-system'

function makeCube(title: string, comment?: string) {
  const lines = [
    `TITLE "${title}"`,
    comment ? `# ${comment}` : '',
    'LUT_3D_SIZE 2',
    '0 0 0',
    '1 0 0',
    '0 1 0',
    '1 1 0',
    '0 0 1',
    '1 0 1',
    '0 1 1',
    '1 1 1',
  ].filter(Boolean)

  return lines.join('\n')
}

describe('style-system', () => {
  it('builds builtin styles with an input prep profile', () => {
    const style = buildBuiltinStyle('film-soft')

    expect(style.kind).toBe('builtin')
    expect(style.inputPrepProfile?.profileId).toBe('normalized-film-soft')
  })

  it('maps finite intensity levels to blend values', () => {
    expect(mapIntensityLevel('off')).toBe(0)
    expect(mapIntensityLevel('standard')).toBe(0.7)
    expect(mapIntensityLevel('strong')).toBe(1)
  })

  it('adds a best-effort warning to custom LUT styles', () => {
    const style = toCustomStyle(
      parseCubeLUT(makeCube('Client display sRGB LUT')),
    )

    expect(style.kind).toBe('custom')
    expect(style.warning).toMatch(/best effort/i)
    expect(style.lutAsset).toMatchObject({
      inputProfile: 'display-srgb',
      profileResolution: {
        kind: 'resolved',
        profile: { id: 'display-srgb' },
      },
    })
  })

  it('labels V-Log custom LUT styles with their input profile', () => {
    const style = toCustomStyle(
      parseCubeLUT(makeCube('Camera LUT', 'LUMIXPHOTOSTYLE VLOG'), {
        sourceName: 'Panasonic_VLog_to_Rec709.cube',
      }),
    )

    expect(style.lutAsset?.inputProfile).toBe('v-log')
    expect(style.warning).toMatch(/Panasonic V-Gamut \/ V-Log input/i)
    expect(style.lutAsset).toMatchObject({
      profileResolution: {
        kind: 'resolved',
        profile: { id: 'panasonic-vgamut-vlog' },
      },
    })
  })

  it('builds a pending LUT profile selection state for unresolved LUTs', () => {
    const lut = parseCubeLUT(makeCube('Client Secret Sauce'), {
      sourceName: 'unknown-look.cube',
    })

    expect(buildLUTProfileSelectionState(lut)).toEqual({
      status: 'pending',
      fingerprint: lut.fingerprint,
      title: 'Client Secret Sauce',
      sourceName: 'unknown-look.cube',
      suggestions: [],
    })
  })
})
