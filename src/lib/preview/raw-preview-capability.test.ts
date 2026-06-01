import { describe, expect, it } from 'vitest'

import { resolveRawPreviewCapability } from './raw-preview-capability'

const caps = (
  over: Partial<{ webgl2: boolean; toneHighPrecision: boolean }>,
) => ({
  webgl2: true,
  toneHighPrecision: true,
  ...over,
})

describe('resolveRawPreviewCapability', () => {
  it('is supported/gpu when webgl2 + highp + COI present', () => {
    expect(resolveRawPreviewCapability(caps({}), true)).toEqual({
      supportStatus: 'supported',
      previewMode: 'gpu',
      reason: null,
    })
  })

  it('allows GPU preview without COI because low-memory RAW decode does not require SAB', () => {
    expect(resolveRawPreviewCapability(caps({}), false)).toEqual({
      supportStatus: 'supported',
      previewMode: 'gpu',
      reason: null,
    })
  })

  it('degrades to cpu when webgl2 missing but COI present', () => {
    expect(resolveRawPreviewCapability(caps({ webgl2: false }), true)).toEqual({
      supportStatus: 'degraded',
      previewMode: 'cpu',
      reason: 'webgl2-missing',
    })
  })

  it('degrades to cpu when float precision is low but COI present', () => {
    expect(
      resolveRawPreviewCapability(caps({ toneHighPrecision: false }), true),
    ).toEqual({
      supportStatus: 'degraded',
      previewMode: 'cpu',
      reason: 'tone-float-precision-low',
    })
  })

  it('degrades to CPU preview without COI when GPU is insufficient', () => {
    expect(
      resolveRawPreviewCapability(caps({ webgl2: false }), false),
    ).toMatchObject({ supportStatus: 'degraded', reason: 'webgl2-missing' })
  })
})
