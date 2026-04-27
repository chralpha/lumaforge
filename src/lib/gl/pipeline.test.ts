import { describe, expect, it, vi } from 'vitest'

import { getLUTColorProfile } from '~/lib/color/registry'

import type { LUTData } from './pipeline'
import { RawProcessingPipeline } from './pipeline'

const contextMock = vi.hoisted(() => {
  const capabilities = {
    webgl2: true,
    maxTextureSize: 4096,
    max3DTextureSize: 256,
    floatTextures: true,
    floatTexturesLinear: true,
    halfFloatTextures: true,
    halfFloatTexturesLinear: true,
    colorBufferFloat: true,
    colorBufferHalfFloat: true,
    maxVertexUniformVectors: 1024,
    maxFragmentUniformVectors: 1024,
    maxVaryingVectors: 64,
    rendererInfo: 'Mock Renderer',
    vendorInfo: 'Mock Vendor',
  }

  const gl = {
    deleteTexture: vi.fn(),
  }

  return {
    capabilities,
    create3DTexture: vi.fn(() => ({}) as WebGLTexture),
    gl,
    reset() {
      gl.deleteTexture.mockClear()
      this.create3DTexture.mockReset()
      this.create3DTexture.mockReturnValue({} as WebGLTexture)
    },
  }
})

vi.mock('./context', () => ({
  createWebGL2Context: vi.fn(() => contextMock.gl),
  detectCapabilities: vi.fn(() => contextMock.capabilities),
  selectProcessingTextureFormat: vi.fn(() => ({
    precision: 'rgba16f',
    warnings: [],
  })),
  getProcessingTextureFormatWarnings: vi.fn(() => []),
  getRecommendedTextureFormat: vi.fn(() => ({
    internalFormat: 0,
    format: 0,
    type: 0,
  })),
  createProgram: vi.fn(() => ({})),
  createFullscreenQuad: vi.fn(() => ({ vao: {}, vbo: {} })),
  createTextureFromData: vi.fn(() => ({})),
  createRgb16UiTextureFromData: vi.fn(() => ({})),
  create3DTexture: contextMock.create3DTexture,
  createFramebuffer: vi.fn(() => ({
    framebuffer: {},
    texture: {},
    textureFormat: { precision: 'rgba16f' },
  })),
}))

function createLUTData(profileId = 'sony-sgamut3cine-slog3'): LUTData {
  const profile = getLUTColorProfile(profileId)
  if (!profile) throw new Error(`Missing profile ${profileId}`)

  return {
    size: 2,
    data: new Float32Array(24),
    domainMin: [0, 0, 0],
    domainMax: [1, 1, 1],
    inputProfile: 'display-srgb',
    profileResolution: {
      kind: 'resolved',
      profile,
      confidence: 'metadata',
    },
  }
}

describe('rawProcessingPipeline export telemetry', () => {
  it('disables unresolved LUTs while clearing export LUT metadata', () => {
    contextMock.reset()
    const pipeline = new RawProcessingPipeline(document.createElement('canvas'))

    pipeline.uploadLUT({
      size: 2,
      data: new Float32Array(24),
      domainMin: [0, 0, 0],
      domainMax: [1, 1, 1],
      inputProfile: 'display-srgb',
      profileResolution: {
        kind: 'needs-user-selection',
        suggestions: [],
      },
    })
    pipeline.setParams({
      intensity: 0.7,
      viewMode: 'processed',
      styleKind: 'custom',
      builtinPreset: null,
    })

    const stats = pipeline.render()

    expect(stats.transformPath).toBe('disabled-lut')
    expect(stats.lutRole).toBeNull()
    expect(stats.lutInputTransfer).toBeNull()
    expect(stats.lutOutputTransfer).toBeNull()
  })

  it('clears export LUT metadata when the selected LUT output transfer is unsupported', () => {
    contextMock.reset()
    const pipeline = new RawProcessingPipeline(document.createElement('canvas'))
    const profile = getLUTColorProfile('sony-sgamut3cine-slog3')
    if (!profile) {
      throw new Error('Missing profile sony-sgamut3cine-slog3')
    }

    pipeline.uploadLUT({
      ...createLUTData(),
      profileResolution: {
        kind: 'resolved',
        confidence: 'metadata',
        profile: {
          ...profile,
          outputGamut: profile.inputGamut,
          outputTransfer: 'linear',
          outputRange: 'full',
        },
      },
    })
    pipeline.setParams({
      intensity: 0.7,
      viewMode: 'processed',
      styleKind: 'custom',
      builtinPreset: null,
    })

    const stats = pipeline.render()

    expect(stats.transformPath).toBe('scene-creative-lut')
    expect(stats.lutRole).toBeNull()
    expect(stats.lutInputTransfer).toBeNull()
    expect(stats.lutOutputTransfer).toBeNull()
  })
})
