import { describe, expect, it } from 'vitest'

import { parseCubeLUT } from '~/lib/lut/cube-parser'

import {
  buildBuiltinStyle,
  buildLUTProfileSelectionState,
  mapIntensityLevel,
  toCustomStyle,
} from '../services/style-system'

function makeCube(title: string, comments: string[] = []) {
  const lines = [
    `TITLE "${title}"`,
    ...comments.map((comment) => `# ${comment}`),
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

  it('asks for input and output contracts on unresolved custom LUT styles', () => {
    const style = toCustomStyle(
      parseCubeLUT(makeCube('Client display sRGB LUT')),
    )

    expect(style.kind).toBe('custom')
    expect(style.warning).toBe(
      'Choose the LUT input and output contract before preview or export.',
    )
    expect(style.lutAsset).toMatchObject({
      inputProfile: 'display-srgb',
      profileResolution: {
        kind: 'needs-user-selection',
      },
    })
  })

  it('labels V-Log custom LUT styles with their resolved contract', () => {
    const style = toCustomStyle(
      parseCubeLUT(
        makeCube('Camera LUT', [
          'LUMAFORGE_INPUT_PROFILE=panasonic-vgamut-vlog',
          'LUMAFORGE_ROLE=combined-look-output',
          'LUMAFORGE_OUTPUT_GAMUT=srgb-rec709',
          'LUMAFORGE_OUTPUT_TRANSFER=bt709',
          'LUMAFORGE_OUTPUT_RANGE=full',
        ]),
        {
          sourceName: 'Panasonic_VLog_to_Rec709.cube',
        },
      ),
    )

    expect(style.lutAsset?.inputProfile).toBe('v-log')
    expect(style.warning).toBe(
      'This LUT uses Panasonic V-Gamut / V-Log -> Rec.709 display.',
    )
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
