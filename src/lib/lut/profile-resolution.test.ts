import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  applyLUTContractSelection,
  applyLUTProfileSelection,
  getStoredLUTContractSelection,
  getStoredLUTProfileSelection,
  resolveLUTProfile,
  storeLUTProfileSelection,
} from './profile-resolution'

function makeParsedLUTForProfileSelection(sourceName: string) {
  const profileResolution = resolveLUTProfile({
    title: 'Sony technical LUT',
    sourceName,
    comments: [],
  })

  return {
    title: 'Sony technical LUT',
    sourceName,
    comments: [],
    size: 2,
    domainMin: [0, 0, 0] as [number, number, number],
    domainMax: [1, 1, 1] as [number, number, number],
    data: new Float32Array(2 * 2 * 2 * 3),
    fingerprint: sourceName,
    profileResolution,
    inputProfile: 'display-srgb' as const,
  }
}

describe('lUT profile selection persistence', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('stores valid display-look profile selections by fingerprint', () => {
    const stored = storeLUTProfileSelection('lut-fingerprint-1', 'display-srgb')

    expect(stored?.id).toBe('display-srgb')
    expect(getStoredLUTProfileSelection('lut-fingerprint-1')?.id).toBe(
      'display-srgb',
    )
  })

  it('uses a stored fingerprint selection before filename inference', () => {
    applyLUTContractSelection(
      makeParsedLUTForProfileSelection('lut-fingerprint-2'),
      {
        role: 'combined-look-output',
        inputProfile: 'sony-sgamut3cine-slog3',
        outputGamut: 'srgb-rec709',
        outputTransfer: 'bt709',
        outputRange: 'full',
      },
    )

    expect(
      resolveLUTProfile({
        title: 'LUMIXPHOTOSTYLE VLOG',
        sourceName: 'Panasonic_VLog.cube',
        comments: [],
        fingerprint: 'lut-fingerprint-2',
      }),
    ).toMatchObject({
      kind: 'resolved',
      confidence: 'persisted-user',
      profile: { id: 'sony-sgamut3cine-slog3' },
    })
  })

  it('rejects scene-creative selections without a complete output contract', () => {
    const selected = applyLUTContractSelection(
      makeParsedLUTForProfileSelection('scene-creative-incomplete.cube'),
      {
        role: 'scene-creative',
        inputProfile: 'sony-sgamut3cine-slog3',
      },
    )

    expect(selected).toBeUndefined()
    expect(
      getStoredLUTContractSelection('scene-creative-incomplete.cube'),
    ).toBeUndefined()
  })

  it('ignores legacy string selections for non-display input-only profiles', () => {
    localStorage.setItem(
      'lumaforge.lutProfileSelections.v1',
      JSON.stringify({
        legacy: 'sony-sgamut3cine-slog3',
      }),
    )

    expect(getStoredLUTProfileSelection('legacy')).toBeUndefined()
    expect(
      resolveLUTProfile({
        title: 'Sony technical LUT',
        sourceName: 'SLog3_SGamut3Cine_to_Rec709.cube',
        comments: [],
        fingerprint: 'legacy',
      }),
    ).toMatchObject({
      kind: 'needs-user-selection',
    })
  })

  it('stores full user-selected contracts by fingerprint', () => {
    const selected = applyLUTContractSelection(
      makeParsedLUTForProfileSelection('manual-contract.cube'),
      {
        role: 'combined-look-output',
        inputProfile: 'panasonic-vgamut-vlog',
        outputGamut: 'srgb-rec709',
        outputTransfer: 'bt709',
        outputRange: 'full',
      },
    )

    expect(selected?.profileResolution).toMatchObject({
      kind: 'resolved',
      confidence: 'user',
      profile: {
        inputGamut: 'v-gamut',
        inputTransfer: 'v-log',
        role: 'combined-look-output',
        outputGamut: 'srgb-rec709',
        outputTransfer: 'bt709',
        outputRange: 'full',
      },
    })
    expect(getStoredLUTContractSelection('manual-contract.cube')).toEqual({
      inputProfile: 'panasonic-vgamut-vlog',
      role: 'combined-look-output',
      inputGamut: 'v-gamut',
      inputTransfer: 'v-log',
      inputRange: 'full',
      outputGamut: 'srgb-rec709',
      outputTransfer: 'bt709',
      outputRange: 'full',
    })
  })

  it('rejects output roles without a complete output contract', () => {
    const selected = applyLUTContractSelection(
      makeParsedLUTForProfileSelection('incomplete-output.cube'),
      {
        role: 'combined-look-output',
        inputProfile: 'panasonic-vgamut-vlog',
      },
    )

    expect(selected).toBeUndefined()
    expect(
      getStoredLUTContractSelection('incomplete-output.cube'),
    ).toBeUndefined()
  })

  it('rejects display-look selections for non-display inputs even with output fields', () => {
    const selected = applyLUTContractSelection(
      makeParsedLUTForProfileSelection('display-look-camera-input.cube'),
      {
        role: 'display-look',
        inputProfile: 'panasonic-vgamut-vlog',
        outputGamut: 'srgb-rec709',
        outputTransfer: 'bt709',
        outputRange: 'full',
      },
    )

    expect(selected).toBeUndefined()
    expect(
      getStoredLUTContractSelection('display-look-camera-input.cube'),
    ).toBeUndefined()
  })

  it('ignores malformed non-string stored profile IDs without throwing', () => {
    localStorage.setItem(
      'lumaforge.lutProfileSelections.v1',
      JSON.stringify({
        broken: 42,
        valid: 'display-srgb',
      }),
    )

    expect(getStoredLUTProfileSelection('broken')).toBeUndefined()
    expect(getStoredLUTProfileSelection('valid')?.id).toBe('display-srgb')
    expect(() =>
      resolveLUTProfile({
        title: 'Panasonic technical LUT',
        sourceName: 'Panasonic_VLog.cube',
        comments: [],
        fingerprint: 'broken',
      }),
    ).not.toThrow()
  })
})

describe('lUT explicit profile labels', () => {
  it('does not resolve LUT contracts from filename or free-form comments', () => {
    const resolution = resolveLUTProfile({
      title: 'Generated',
      sourceName: 'technical-vlog-to-rec709.cube',
      comments: ['LUMIXPHOTOSTYLE VLOG'],
    })

    expect(resolution).toMatchObject({
      kind: 'needs-user-selection',
    })
    expect(resolution).not.toMatchObject({
      kind: 'resolved',
    })
  })

  it('resolves structured metadata as a full input and output contract', () => {
    const resolution = resolveLUTProfile({
      title: 'Trusted LUT',
      sourceName: 'renamed-file.cube',
      comments: [
        'LUMAFORGE_INPUT_PROFILE=panasonic-vgamut-vlog',
        'LUMAFORGE_ROLE=combined-look-output',
        'LUMAFORGE_OUTPUT_GAMUT=srgb-rec709',
        'LUMAFORGE_OUTPUT_TRANSFER=bt709',
        'LUMAFORGE_OUTPUT_RANGE=full',
      ],
    })

    expect(resolution).toMatchObject({
      kind: 'resolved',
      confidence: 'metadata',
      profile: {
        inputGamut: 'v-gamut',
        inputTransfer: 'v-log',
        role: 'combined-look-output',
        outputGamut: 'srgb-rec709',
        outputTransfer: 'bt709',
        outputRange: 'full',
      },
    })
  })

  it('does not resolve structured metadata when input profile conflicts with explicit input fields', () => {
    const resolution = resolveLUTProfile({
      title: 'Contradictory LUT',
      sourceName: 'contradictory.cube',
      comments: [
        'LUMAFORGE_INPUT_PROFILE=display-srgb',
        'LUMAFORGE_ROLE=display-look',
        'LUMAFORGE_INPUT_GAMUT=v-gamut',
        'LUMAFORGE_INPUT_TRANSFER=v-log',
        'LUMAFORGE_INPUT_RANGE=full',
        'LUMAFORGE_OUTPUT_GAMUT=srgb-rec709',
        'LUMAFORGE_OUTPUT_TRANSFER=bt709',
        'LUMAFORGE_OUTPUT_RANGE=full',
      ],
    })

    expect(resolution).toMatchObject({
      kind: 'needs-user-selection',
    })
    expect(resolution).not.toMatchObject({
      kind: 'resolved',
    })
  })

  it('does not resolve display-look metadata for non-display input without output fields', () => {
    const resolution = resolveLUTProfile({
      title: 'Incomplete Camera LUT',
      sourceName: 'Panasonic_VLog.cube',
      comments: [
        'LUMAFORGE_INPUT_PROFILE=panasonic-vgamut-vlog',
        'LUMAFORGE_ROLE=display-look',
      ],
    })

    expect(resolution).toMatchObject({
      kind: 'needs-user-selection',
    })
    expect(resolution).not.toMatchObject({
      kind: 'resolved',
    })
  })

  it('does not resolve display-look metadata for non-display input with output fields', () => {
    const resolution = resolveLUTProfile({
      title: 'Malformed Camera LUT',
      sourceName: 'Panasonic_VLog_to_Rec709.cube',
      comments: [
        'LUMAFORGE_INPUT_PROFILE=panasonic-vgamut-vlog',
        'LUMAFORGE_ROLE=display-look',
        'LUMAFORGE_OUTPUT_GAMUT=srgb-rec709',
        'LUMAFORGE_OUTPUT_TRANSFER=bt709',
        'LUMAFORGE_OUTPUT_RANGE=full',
      ],
    })

    expect(resolution).toMatchObject({
      kind: 'needs-user-selection',
    })
    expect(resolution).not.toMatchObject({
      kind: 'resolved',
    })
  })

  it('does not resolve input profile labels as explicit input profiles', () => {
    expect(
      resolveLUTProfile({
        title: 'Client LUT',
        comments: ['Input profile: V-Log'],
      }),
    ).toMatchObject({
      kind: 'needs-user-selection',
      recommendations: expect.arrayContaining([
        expect.objectContaining({ id: 'panasonic-vgamut-vlog' }),
      ]),
    })
  })

  it('does not resolve output profile labels as input profiles', () => {
    const resolution = resolveLUTProfile({
      title: 'Client LUT',
      comments: ['Output profile: V-Log'],
    })

    expect(resolution).not.toMatchObject({
      kind: 'resolved',
      profile: { id: 'panasonic-vgamut-vlog' },
    })
    expect(resolution).toMatchObject({
      kind: 'needs-user-selection',
      recommendations: [],
    })
  })

  it('does not resolve target profile labels as input profiles', () => {
    const resolution = resolveLUTProfile({
      title: 'Client LUT',
      comments: ['Target profile = VLog'],
    })

    expect(resolution).toMatchObject({
      kind: 'needs-user-selection',
      recommendations: [],
    })
  })

  it('does not resolve destination profile labels as input profiles', () => {
    const resolution = resolveLUTProfile({
      title: 'Client LUT',
      comments: ['Destination profile: V-Log'],
    })

    expect(resolution).toMatchObject({
      kind: 'needs-user-selection',
      recommendations: [],
    })
  })

  it('does not resolve bare profile labels as input profiles', () => {
    const resolution = resolveLUTProfile({
      title: 'Client LUT',
      comments: ['Profile: V-Log'],
    })

    expect(resolution).toMatchObject({
      kind: 'needs-user-selection',
      recommendations: [],
    })
  })

  it('ignores mixed-case output-side to markers for input inference', () => {
    const resolution = resolveLUTProfile({
      title: 'UnknownCamera_To_VLog',
      sourceName: 'UnknownCamera_To_VLog.cube',
      comments: [],
    })

    expect(resolution).toMatchObject({
      kind: 'needs-user-selection',
      recommendations: [],
    })
  })

  it('ignores mixed-case output-side for markers for input inference', () => {
    const resolution = resolveLUTProfile({
      title: 'UnknownCamera_FOR_VLog',
      sourceName: 'UnknownCamera_FOR_VLog.cube',
      comments: [],
    })

    expect(resolution).toMatchObject({
      kind: 'needs-user-selection',
      recommendations: [],
    })
  })

  it('does not resolve unsupported Cineon output annotations as renderable profiles', () => {
    const resolution = resolveLUTProfile({
      title: 'Sony technical LUT',
      sourceName: 'SLog3_SGamut3Cine_to_Cineon.cube',
      comments: [],
    })

    expect(resolution.kind).toBe('needs-user-selection')
    if (resolution.kind !== 'needs-user-selection') {
      throw new Error('Expected Cineon LUT to require profile selection')
    }
    expect(resolution.recommendations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'sony-sgamut3cine-slog3' }),
      ]),
    )
    expect(resolution).not.toMatchObject({
      kind: 'resolved',
      profile: {
        role: 'combined-look-output',
      },
    })
  })

  it('detects unsupported for Cineon and unknown LogC directional outputs', () => {
    for (const sourceName of [
      'SLog3_SGamut3Cine_for_Cineon.cube',
      'SLog3_SGamut3Cine_toCineon.cube',
      'SLog3_SGamut3Cine_to_LogC.cube',
      'SLog3_SGamut3Cine_for_LogC.cube',
    ]) {
      const resolution = resolveLUTProfile({
        title: 'Sony technical LUT',
        sourceName,
        comments: [],
      })

      expect(resolution).toMatchObject({
        kind: 'needs-user-selection',
        reason: 'unsupported-output',
      })
    }
  })

  it('rejects legacy input-profile-only selection for unsupported filename annotations', () => {
    const selected = applyLUTProfileSelection(
      makeParsedLUTForProfileSelection('SLog3_SGamut3Cine_to_Cineon.cube'),
      'sony-sgamut3cine-slog3',
    )

    expect(selected).toBeUndefined()
  })
})
