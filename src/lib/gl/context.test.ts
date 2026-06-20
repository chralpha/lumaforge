import { describe, expect, it } from 'vitest'

import type { WebGLCapabilities } from './context'
import {
  detectCapabilities,
  getProcessingTextureFormatWarnings,
  selectProcessingTextureFormat,
} from './context'

const BASE_CAPABILITIES: WebGLCapabilities = {
  webgl2: true,
  maxTextureSize: 16384,
  max3DTextureSize: 2048,
  floatTextures: true,
  floatTexturesLinear: true,
  halfFloatTextures: true,
  halfFloatTexturesLinear: true,
  colorBufferFloat: true,
  colorBufferHalfFloat: true,
  maxVertexUniformVectors: 4096,
  maxFragmentUniformVectors: 4096,
  maxVaryingVectors: 32,
  fragmentHighFloatPrecision: 23,
  fragmentHighFloatRangeMin: 127,
  fragmentHighFloatRangeMax: 127,
  toneHighPrecision: true,
  rendererInfo: 'WebGPU',
  vendorInfo: 'Unknown',
}

describe('processing texture format selection', () => {
  it('always selects rgba16f for WebGPU', () => {
    expect(selectProcessingTextureFormat(BASE_CAPABILITIES)).toMatchObject({
      precision: 'rgba16f',
      warnings: [],
    })
  })

  it('returns fresh low-precision warning objects for every request', () => {
    const firstWarnings = getProcessingTextureFormatWarnings('rgba8')
    firstWarnings[0]!.message = 'mutated warning'

    expect(getProcessingTextureFormatWarnings('rgba8')).toEqual([
      {
        code: 'LOW_PRECISION_RENDER_TARGET',
        message:
          'High-quality GPU rendering is unavailable on this device; preview and export may show smoother tonal steps less accurately.',
      },
    ])
  })
})

describe('capability detection', () => {
  it('reports full capability without a device', () => {
    const caps = detectCapabilities()
    expect(caps).toMatchObject({
      webgl2: true,
      floatTextures: true,
      colorBufferFloat: true,
      toneHighPrecision: true,
    })
  })
})
