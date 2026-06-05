import { describe, expect, it, vi } from 'vitest'

import type { WebGLCapabilities } from './context'
import {
  createWebGL2Context,
  detectCapabilities,
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
  fragmentHighFloatPrecision: 23,
  fragmentHighFloatRangeMin: 127,
  fragmentHighFloatRangeMax: 127,
  toneHighPrecision: true,
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

describe('capability detection', () => {
  function createCapabilityGl({
    precision,
    rangeMin,
    rangeMax,
  }: {
    precision: number
    rangeMin: number
    rangeMax: number
  }): WebGL2RenderingContext {
    const gl = {
      FRAGMENT_SHADER: 35632,
      HIGH_FLOAT: 36338,
      MAX_TEXTURE_SIZE: 3379,
      MAX_3D_TEXTURE_SIZE: 32883,
      MAX_VERTEX_UNIFORM_VECTORS: 36347,
      MAX_FRAGMENT_UNIFORM_VECTORS: 36349,
      MAX_VARYING_VECTORS: 36348,
      getExtension: () => null,
      getShaderPrecisionFormat: () => ({
        precision,
        rangeMin,
        rangeMax,
      }),
      getParameter: (parameter: number) => {
        switch (parameter) {
          case 3379:
            return 4096
          case 32883:
            return 256
          case 36347:
          case 36349:
            return 1024
          case 36348:
            return 64
          default:
            return null
        }
      },
    }

    return gl as unknown as WebGL2RenderingContext
  }

  it('falls back to a plain WebGL2 request when strict attributes are rejected', () => {
    const gl = createCapabilityGl({
      precision: 23,
      rangeMin: 127,
      rangeMax: 127,
    })
    const getContext = vi.fn(
      (_name: string, attributes?: WebGLContextAttributes) =>
        attributes ? null : gl,
    )
    const canvas = { getContext } as unknown as HTMLCanvasElement

    expect(createWebGL2Context(canvas)).toBe(gl)
    expect(getContext).toHaveBeenCalledWith('webgl2')
  })

  it('falls back to a plain WebGL2 request when strict attributes throw', () => {
    const gl = createCapabilityGl({
      precision: 23,
      rangeMin: 127,
      rangeMax: 127,
    })
    const getContext = vi.fn(
      (_name: string, attributes?: WebGLContextAttributes) => {
        if (attributes) throw new Error('strict attributes rejected')
        return gl
      },
    )
    const canvas = { getContext } as unknown as HTMLCanvasElement

    expect(createWebGL2Context(canvas)).toBe(gl)
    expect(getContext).toHaveBeenCalledWith('webgl2')
  })

  it('marks tone precision as supported when fragment highp has enough precision and range', () => {
    expect(
      detectCapabilities(
        createCapabilityGl({ precision: 23, rangeMin: 127, rangeMax: 127 }),
      ),
    ).toMatchObject({
      fragmentHighFloatPrecision: 23,
      fragmentHighFloatRangeMin: 127,
      fragmentHighFloatRangeMax: 127,
      toneHighPrecision: true,
    })
  })

  it('marks tone precision as unsupported when fragment highp range is too small', () => {
    expect(
      detectCapabilities(
        createCapabilityGl({ precision: 16, rangeMin: 31, rangeMax: 31 }),
      ),
    ).toMatchObject({
      fragmentHighFloatPrecision: 16,
      fragmentHighFloatRangeMin: 31,
      fragmentHighFloatRangeMax: 31,
      toneHighPrecision: false,
    })
  })
})
