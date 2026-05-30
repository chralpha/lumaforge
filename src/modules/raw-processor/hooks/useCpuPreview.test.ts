import type {RawRenderExposure} from '@lumaforge/luma-color-runtime';
import {
  exposureMultiplierFromEv
} from '@lumaforge/luma-color-runtime'
import { describe, expect, it } from 'vitest'

import type {CpuPreviewParams} from './useCpuPreview';
import {
  buildCpuPreviewGraph,
  neutralFrameCacheKey
} from './useCpuPreview'

const exposure: RawRenderExposure = {
  ev: 0.5,
  multiplier: exposureMultiplierFromEv(0.5),
  source: 'user',
}

// Non-trivial look + tone so the neutral path must zero ALL of it.
const baseParams: CpuPreviewParams = {
  styleKind: 'custom',
  intensity: 0.8,
  builtinPreset: null,
  lut: null,
  rawRenderExposure: exposure,
  userExposureEv: 0.7,
  userContrast: 20,
  userHighlights: -15,
  userShadows: 10,
  userWhites: 5,
  userBlacks: -5,
}

describe('useCpuPreview helpers', () => {
  it('neutral cache key changes only with source + render exposure', () => {
    expect(neutralFrameCacheKey('s1', 0.5)).toBe(
      neutralFrameCacheKey('s1', 0.5),
    )
    expect(neutralFrameCacheKey('s1', 0.5)).not.toBe(
      neutralFrameCacheKey('s1', 1.0),
    )
    expect(neutralFrameCacheKey('s1', 0.5)).not.toBe(
      neutralFrameCacheKey('s2', 0.5),
    )
  })

  it('neutral zeros ALL look + tone but keeps render exposure', () => {
    const neutral = buildCpuPreviewGraph(baseParams, 'neutral')
    expect('unsupportedReason' in neutral).toBe(false)
    // Equivalent to a fully-zeroed-edits processed graph with the same exposure.
    const zeroed = buildCpuPreviewGraph(
      {
        styleKind: 'none',
        intensity: 0,
        builtinPreset: null,
        lut: null,
        rawRenderExposure: exposure,
        userExposureEv: 0,
        userContrast: 0,
        userHighlights: 0,
        userShadows: 0,
        userWhites: 0,
        userBlacks: 0,
      },
      'processed',
    )
    expect(neutral).toEqual(zeroed)
  })

  it('processed honors the look + tone params', () => {
    const processed = buildCpuPreviewGraph(baseParams, 'processed')
    expect('unsupportedReason' in processed).toBe(false)
    // Differs from neutral because edits are applied.
    expect(processed).not.toEqual(buildCpuPreviewGraph(baseParams, 'neutral'))
  })
})
