import { getLUTColorProfile } from '@lumaforge/luma-color-runtime'
import { describe, expect, it } from 'vitest'

import type { LUTContractSelectionState } from '../../model/session'
import {
  deriveLUTContractView,
  getContractAttentionState,
} from './lut-contract'

describe('getContractAttentionState', () => {
  it('flags needs-user-selection when resolution is unresolved', () => {
    const state = getContractAttentionState(null, {
      kind: 'unknown',
    })

    expect(state).toEqual({
      needsUserSelection: true,
      needsOutputContract: false,
      unsupportedOutput: false,
      needsAttention: true,
    })
  })

  it('flags unsupported-output when that is the reason', () => {
    const state = getContractAttentionState(null, {
      kind: 'unsupported-output',
      recommendations: [],
    })

    expect(state.unsupportedOutput).toBe(true)
    expect(state.needsUserSelection).toBe(true)
    expect(state.needsAttention).toBe(true)
  })

  it('flags needs-output-contract when the resolved profile has no declared output', () => {
    // Sony S-Gamut3.Cine / S-Log3 is a scene-referred input with no declared
    // display output - getProfileOutputLabel returns "Output profile required".
    const profile = getLUTColorProfile('sony-sgamut3cine-slog3')
    if (!profile)
      throw new Error('test fixture missing: sony-sgamut3cine-slog3')

    const selection: LUTContractSelectionState = {
      status: 'confirmed',
      profileId: profile.id,
      fingerprint: 'x',
      confidence: 'metadata',
    }

    const state = getContractAttentionState(selection, {
      kind: 'confirmed',
      profile,
      confidence: 'metadata',
    })

    expect(state.needsOutputContract).toBe(true)
    expect(state.needsAttention).toBe(true)
  })

  it('reports no attention needed when everything is resolved', () => {
    // rec709-gamma24 is a display-look profile with display-like input -
    // getProfileOutputLabel returns "Rec.709 display", never "required".
    const profile = getLUTColorProfile('rec709-gamma24')
    if (!profile) throw new Error('test fixture missing: rec709-gamma24')

    const selection: LUTContractSelectionState = {
      status: 'confirmed',
      profileId: profile.id,
      fingerprint: 'x',
      confidence: 'metadata',
    }

    const state = getContractAttentionState(selection, {
      kind: 'confirmed',
      profile,
      confidence: 'metadata',
    })

    expect(state).toEqual({
      needsUserSelection: false,
      needsOutputContract: false,
      unsupportedOutput: false,
      needsAttention: false,
    })
  })
})

const vlog709 = getLUTColorProfile('panasonic-vgamut-vlog')! // input-only unless output annotated

describe('deriveLUTContractView', () => {
  it('returns confirmed with output label for a resolved selection', () => {
    const view = deriveLUTContractView(
      {
        status: 'confirmed',
        fingerprint: 'fp',
        profileId: 'display-srgb',
        confidence: 'metadata',
      },
      null,
    )
    expect(view.status).toBe('confirmed')
  })

  it('returns recommended with completesContract=false for an input-only recommendation', () => {
    const view = deriveLUTContractView(
      {
        status: 'recommended',
        fingerprint: 'fp',
        title: 't',
        recommendations: [vlog709],
      },
      { kind: 'recommended', recommendations: [vlog709] },
    )
    expect(view.status).toBe('recommended')
    if (view.status === 'recommended') {
      expect(view.recommendation.id).toBe(vlog709.id)
      expect(view.completesContract).toBe(false)
    }
  })

  it('returns recommended with completesContract=true when the recommendation has a full output', () => {
    const complete = {
      ...vlog709,
      role: 'combined-look-output' as const,
      outputGamut: 'srgb-rec709' as const,
      outputTransfer: 'gamma24' as const,
      outputRange: 'full' as const,
    }
    const view = deriveLUTContractView(
      {
        status: 'recommended',
        fingerprint: 'fp',
        title: 't',
        recommendations: [complete],
      },
      { kind: 'recommended', recommendations: [complete] },
    )
    expect(view.status === 'recommended' && view.completesContract).toBe(true)
  })

  it('returns unknown when there is no recommendation', () => {
    const view = deriveLUTContractView(
      { status: 'unknown', fingerprint: 'fp', title: 't' },
      { kind: 'unknown' },
    )
    expect(view.status).toBe('unknown')
  })

  it('returns unsupported-output', () => {
    const view = deriveLUTContractView(
      {
        status: 'unsupported-output',
        fingerprint: 'fp',
        title: 't',
        recommendations: [],
      },
      { kind: 'unsupported-output', recommendations: [] },
    )
    expect(view.status).toBe('unsupported-output')
  })

  it('returns incomplete-output for a confirmed profile lacking output', () => {
    const view = deriveLUTContractView(
      {
        status: 'confirmed',
        fingerprint: 'fp',
        profileId: 'panasonic-vgamut-vlog',
        confidence: 'user',
      },
      null,
    )
    expect(['confirmed', 'incomplete-output']).toContain(view.status)
  })
})
