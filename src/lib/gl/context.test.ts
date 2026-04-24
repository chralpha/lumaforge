import { describe, expect, it } from 'vitest'

import type { WebGLCapabilities } from './context'
import {
  getProcessingTextureFormatWarnings,
  selectProcessingTextureFormat,
} from './context'

const BASE_CAPABILITIES: WebGLCapabilities = {
  webgl2: true,
  maxTextureSize: 4096,
  max3DTextureSize: 256,
  floatTextures: true,
  floatTexturesLinear: true,
  halfFloatTextures: true,
  halfFloatTexturesLinear: true,
  colorBufferFloat: false,
  colorBufferHalfFloat: true,
  maxVertexUniformVectors: 1024,
  maxFragmentUniformVectors: 1024,
  maxVaryingVectors: 64,
  rendererInfo: 'Test Renderer',
  vendorInfo: 'Test Vendor',
}

describe('processing texture format selection', () => {
  it('selects the high-quality half-float render target when supported', () => {
    expect(selectProcessingTextureFormat(BASE_CAPABILITIES)).toMatchObject({
      precision: 'rgba16f',
      warnings: [],
    })
  })

  it('reports a visible low-precision warning when only RGBA8 rendering is viable', () => {
    expect(
      selectProcessingTextureFormat({
        ...BASE_CAPABILITIES,
        halfFloatTexturesLinear: false,
        colorBufferHalfFloat: false,
      }),
    ).toEqual({
      precision: 'rgba8',
      warnings: [
        {
          code: 'LOW_PRECISION_RENDER_TARGET',
          message:
            'High-quality GPU rendering is unavailable on this device; preview and export may show smoother tonal steps less accurately.',
        },
      ],
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
