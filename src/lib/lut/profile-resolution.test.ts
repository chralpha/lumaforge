import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  getStoredLUTProfileSelection,
  resolveLUTProfile,
  storeLUTProfileSelection,
} from './profile-resolution'

describe('lUT profile selection persistence', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('stores valid user profile selections by fingerprint', () => {
    const stored = storeLUTProfileSelection(
      'lut-fingerprint-1',
      'sony-sgamut3cine-slog3',
    )

    expect(stored?.id).toBe('sony-sgamut3cine-slog3')
    expect(getStoredLUTProfileSelection('lut-fingerprint-1')?.id).toBe(
      'sony-sgamut3cine-slog3',
    )
  })

  it('uses a stored fingerprint selection before filename inference', () => {
    storeLUTProfileSelection('lut-fingerprint-2', 'sony-sgamut3cine-slog3')

    expect(
      resolveLUTProfile({
        title: 'LUMIXPHOTOSTYLE VLOG',
        sourceName: 'Panasonic_VLog.cube',
        comments: [],
        fingerprint: 'lut-fingerprint-2',
      }),
    ).toMatchObject({
      kind: 'resolved',
      confidence: 'user',
      profile: { id: 'sony-sgamut3cine-slog3' },
    })
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
  it('resolves input profile labels as explicit input profiles', () => {
    expect(
      resolveLUTProfile({
        title: 'Client LUT',
        comments: ['Input profile: V-Log'],
      }),
    ).toMatchObject({
      kind: 'resolved',
      confidence: 'explicit',
      profile: { id: 'panasonic-vgamut-vlog' },
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
      suggestions: [],
    })
  })

  it('does not resolve target profile labels as input profiles', () => {
    const resolution = resolveLUTProfile({
      title: 'Client LUT',
      comments: ['Target profile = VLog'],
    })

    expect(resolution).toMatchObject({
      kind: 'needs-user-selection',
      suggestions: [],
    })
  })

  it('does not resolve destination profile labels as input profiles', () => {
    const resolution = resolveLUTProfile({
      title: 'Client LUT',
      comments: ['Destination profile: V-Log'],
    })

    expect(resolution).toMatchObject({
      kind: 'needs-user-selection',
      suggestions: [],
    })
  })

  it('does not resolve bare profile labels as input profiles', () => {
    const resolution = resolveLUTProfile({
      title: 'Client LUT',
      comments: ['Profile: V-Log'],
    })

    expect(resolution).toMatchObject({
      kind: 'needs-user-selection',
      suggestions: [],
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
      suggestions: [],
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
      suggestions: [],
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
    expect(resolution.suggestions).toEqual(
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
})
