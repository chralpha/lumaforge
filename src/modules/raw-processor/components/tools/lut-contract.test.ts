import { getLUTColorProfile } from '@lumaforge/luma-color-runtime'
import { describe, expect, it } from 'vitest'

import type { LUTProfileSelectionState } from '../../model/session'
import { getContractAttentionState } from './lut-contract'

describe('getContractAttentionState', () => {
  it('flags needs-user-selection when resolution is unresolved', () => {
    const state = getContractAttentionState(null, {
      kind: 'needs-user-selection',
      suggestions: [],
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
      kind: 'needs-user-selection',
      reason: 'unsupported-output',
      suggestions: [],
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

    const selection: LUTProfileSelectionState = {
      status: 'resolved',
      profileId: profile.id,
      fingerprint: 'x',
      confidence: 'metadata',
    }

    const state = getContractAttentionState(selection, {
      kind: 'resolved',
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

    const selection: LUTProfileSelectionState = {
      status: 'resolved',
      profileId: profile.id,
      fingerprint: 'x',
      confidence: 'metadata',
    }

    const state = getContractAttentionState(selection, {
      kind: 'resolved',
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
