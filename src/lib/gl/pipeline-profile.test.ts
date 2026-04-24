import { describe, expect, it } from 'vitest'

import type { LUTColorProfile } from '~/lib/color/registry'
import { getLUTColorProfile } from '~/lib/color/registry'

import {
  LUT_RANGE_UNIFORMS,
  LUT_ROLE_UNIFORMS,
  LUT_TRANSFER_UNIFORMS,
  resolveLUTPipelineProfileUniforms,
} from './pipeline'

function resolved(profile: LUTColorProfile) {
  return {
    kind: 'resolved' as const,
    profile,
    confidence: 'explicit' as const,
  }
}

describe('lUT pipeline profile uniforms', () => {
  it('maps resolved scene creative profiles to transfer, role, range, and non-display matrices', () => {
    const profile = getLUTColorProfile('panasonic-vgamut-vlog')
    expect(profile).toBeDefined()

    const uniforms = resolveLUTPipelineProfileUniforms(resolved(profile!))

    expect(uniforms.lutRole).toBe(LUT_ROLE_UNIFORMS['scene-creative'])
    expect(uniforms.lutInputTransfer).toBe(LUT_TRANSFER_UNIFORMS['v-log'])
    expect(uniforms.lutOutputTransfer).toBe(LUT_TRANSFER_UNIFORMS['v-log'])
    expect(uniforms.lutInputRange).toBe(LUT_RANGE_UNIFORMS.full)
    expect(uniforms.lutOutputRange).toBe(LUT_RANGE_UNIFORMS.full)
    expect(Array.from(uniforms.inputToLutGamut)).not.toEqual([
      1, 0, 0, 0, 1, 0, 0, 0, 1,
    ])
    expect(Array.from(uniforms.lutOutputToDisplayGamut)).not.toEqual([
      1, 0, 0, 0, 1, 0, 0, 0, 1,
    ])
  })

  it('maps unresolved profile choices to the display compatibility path', () => {
    const uniforms = resolveLUTPipelineProfileUniforms({
      kind: 'needs-user-selection',
      suggestions: [],
    })

    expect(uniforms.lutRole).toBe(LUT_ROLE_UNIFORMS['display-look'])
    expect(uniforms.lutInputTransfer).toBe(LUT_TRANSFER_UNIFORMS.srgb)
    expect(uniforms.lutOutputTransfer).toBe(LUT_TRANSFER_UNIFORMS.srgb)
    expect(Array.from(uniforms.inputToLutGamut)).toEqual([
      1, 0, 0, 0, 1, 0, 0, 0, 1,
    ])
    expect(Array.from(uniforms.lutOutputToDisplayGamut)).toEqual([
      1, 0, 0, 0, 1, 0, 0, 0, 1,
    ])
  })

  it('preserves non-sRGB display-look transfer and range uniforms', () => {
    const profile = getLUTColorProfile('rec709-gamma24')
    expect(profile).toBeDefined()

    const uniforms = resolveLUTPipelineProfileUniforms(resolved(profile!))

    expect(uniforms.lutRole).toBe(LUT_ROLE_UNIFORMS['display-look'])
    expect(uniforms.lutInputTransfer).toBe(LUT_TRANSFER_UNIFORMS.gamma24)
    expect(uniforms.lutInputRange).toBe(LUT_RANGE_UNIFORMS.full)
    expect(uniforms.lutOutputRange).toBe(LUT_RANGE_UNIFORMS.full)
    expect(Array.from(uniforms.inputToLutGamut)).toEqual([
      1, 0, 0, 0, 1, 0, 0, 0, 1,
    ])
  })

  it('defaults combined Rec.709 output LUTs to gamma24 output when omitted', () => {
    const profile: LUTColorProfile = {
      id: 'test-combined-rec709',
      label: 'Test Combined Rec.709 Output',
      role: 'combined-look-output',
      inputGamut: 'v-gamut',
      inputTransfer: 'v-log',
      inputRange: 'legal',
      outputGamut: 'srgb-rec709',
      aliases: [],
    }

    const uniforms = resolveLUTPipelineProfileUniforms(resolved(profile))

    expect(uniforms.lutRole).toBe(LUT_ROLE_UNIFORMS['combined-look-output'])
    expect(uniforms.lutInputTransfer).toBe(LUT_TRANSFER_UNIFORMS['v-log'])
    expect(uniforms.lutOutputTransfer).toBe(LUT_TRANSFER_UNIFORMS.gamma24)
    expect(uniforms.lutInputRange).toBe(LUT_RANGE_UNIFORMS.legal)
    expect(uniforms.lutOutputRange).toBe(LUT_RANGE_UNIFORMS.full)
    expect(Array.from(uniforms.lutOutputToDisplayGamut)).toEqual([
      1, 0, 0, 0, 1, 0, 0, 0, 1,
    ])
  })
})
