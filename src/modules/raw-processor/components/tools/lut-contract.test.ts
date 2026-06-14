import { getLUTColorProfile } from '@lumaforge/luma-color-runtime'
import { describe, expect, it } from 'vitest'

import { deriveLUTContractView, getProfileContractLabel } from './lut-contract'

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
    expect(view.status).toBe('incomplete-output')
  })
})

describe('getProfileContractLabel', () => {
  it('returns the profile label without the output suffix when the profile has a full output contract', () => {
    const complete = {
      ...vlog709,
      role: 'combined-look-output' as const,
      outputGamut: 'srgb-rec709' as const,
      outputTransfer: 'gamma24' as const,
      outputRange: 'full' as const,
    }
    expect(getProfileContractLabel(complete)).toBe(vlog709.label)
    expect(getProfileContractLabel(complete)).not.toContain('->')
  })

  it('returns the profile label when the profile lacks an output contract', () => {
    expect(getProfileContractLabel(vlog709)).toBe(vlog709.label)
  })
})
