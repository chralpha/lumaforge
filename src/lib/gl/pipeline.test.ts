import type { LUTData } from '@lumaforge/luma-color-runtime'
import { getLUTColorProfile } from '@lumaforge/luma-color-runtime'
import { describe, expect, it, vi } from 'vitest'

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
    fragmentHighFloatPrecision: 23,
    fragmentHighFloatRangeMin: 127,
    fragmentHighFloatRangeMax: 127,
    toneHighPrecision: true,
    rendererInfo: 'Mock Renderer',
    vendorInfo: 'Mock Vendor',
  }

  const gl = {
    TEXTURE_2D: 3553,
    TEXTURE_3D: 32879,
    TEXTURE0: 33984,
    TEXTURE1: 33985,
    TEXTURE_MIN_FILTER: 10241,
    TEXTURE_MAG_FILTER: 10240,
    TEXTURE_WRAP_S: 10242,
    TEXTURE_WRAP_T: 10243,
    TEXTURE_WRAP_R: 32882,
    NEAREST: 9728,
    CLAMP_TO_EDGE: 33071,
    RGB8: 32849,
    RGB: 6407,
    UNSIGNED_BYTE: 5121,
    FRAMEBUFFER: 36160,
    TRIANGLE_STRIP: 5,
    createTexture: vi.fn(() => ({})),
    bindTexture: vi.fn(),
    texParameteri: vi.fn(),
    texImage3D: vi.fn(),
    deleteTexture: vi.fn(),
    deleteFramebuffer: vi.fn(),
    getUniformLocation: vi.fn((_program, name: string) => name),
    bindFramebuffer: vi.fn(),
    viewport: vi.fn(),
    useProgram: vi.fn(),
    activeTexture: vi.fn(),
    uniform1i: vi.fn(),
    uniform1f: vi.fn(),
    uniform3fv: vi.fn(),
    uniformMatrix3fv: vi.fn(),
    bindVertexArray: vi.fn(),
    drawArrays: vi.fn(),
    flush: vi.fn(),
    finish: vi.fn(),
  }

  return {
    capabilities,
    create3DTexture: vi.fn(() => ({}) as WebGLTexture),
    gl,
    reset() {
      for (const value of Object.values(gl)) {
        if (vi.isMockFunction(value)) value.mockClear()
      }
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
      kind: 'confirmed',
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
        recommendations: [],
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
        kind: 'confirmed',
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

describe('rawProcessingPipeline render uniforms', () => {
  it('sends decoded raw render exposure multiplier to the process shader', async () => {
    contextMock.reset()
    const pipeline = new RawProcessingPipeline(document.createElement('canvas'))
    await pipeline.initialize()

    pipeline.uploadImage({
      data: new Uint16Array([1024, 1024, 1024]),
      width: 1,
      height: 1,
      layout: 'rgb-u16',
      colorSpace: 'linear-prophoto-rgb',
      renderExposureEv: 1.5,
      renderExposureMultiplier: Math.pow(2, 1.5),
    })
    pipeline.render()

    expect(contextMock.gl.getUniformLocation).toHaveBeenCalledWith(
      expect.anything(),
      'u_rawRenderExposureMultiplier',
    )
    expect(contextMock.gl.uniform1f).toHaveBeenCalledWith(
      'u_rawRenderExposureMultiplier',
      Math.pow(2, 1.5),
    )
  })

  it('uses identity raw render exposure for legacy display preview input', async () => {
    contextMock.reset()
    const pipeline = new RawProcessingPipeline(document.createElement('canvas'))
    await pipeline.initialize()

    pipeline.uploadImage({
      data: new Float32Array(4),
      width: 1,
      height: 1,
      layout: 'rgba-float32',
      colorSpace: 'display-srgb-preview',
    })
    pipeline.render()

    expect(contextMock.gl.uniform1f).toHaveBeenCalledWith(
      'u_rawRenderExposureMultiplier',
      1,
    )
  })

  it('sends normalized user tone uniforms to the process shader', async () => {
    contextMock.reset()
    const pipeline = new RawProcessingPipeline(document.createElement('canvas'))
    await pipeline.initialize()

    pipeline.uploadImage({
      data: new Uint16Array([1024, 1024, 1024]),
      width: 1,
      height: 1,
      layout: 'rgb-u16',
      colorSpace: 'linear-prophoto-rgb',
      renderExposureEv: 0,
      renderExposureMultiplier: 1,
    })
    pipeline.setParams({
      userExposureEv: 1,
      userContrast: 50,
      userHighlights: -40,
      userShadows: 35,
      userWhites: -25,
      userBlacks: 20,
    })
    pipeline.render()

    expect(contextMock.gl.uniform1f).toHaveBeenCalledWith(
      'u_userExposureMultiplier',
      2,
    )
    expect(contextMock.gl.uniform1f).toHaveBeenCalledWith(
      'u_userContrastAmount',
      50,
    )
    expect(contextMock.gl.uniform1f).toHaveBeenCalledWith(
      'u_userContrastFactor',
      Math.pow(2, 50 / 200),
    )
    expect(contextMock.gl.uniform1f).toHaveBeenCalledWith(
      'u_userHighlights',
      -40,
    )
    expect(contextMock.gl.uniform1f).toHaveBeenCalledWith('u_userShadows', 35)
    expect(contextMock.gl.uniform1f).toHaveBeenCalledWith('u_userWhites', -25)
    expect(contextMock.gl.uniform1f).toHaveBeenCalledWith('u_userBlacks', 20)
  })

  it('sends compare mode and split uniforms to the process shader', async () => {
    contextMock.reset()
    const pipeline = new RawProcessingPipeline(document.createElement('canvas'))
    await pipeline.initialize()

    pipeline.uploadImage({
      data: new Float32Array(4),
      width: 1,
      height: 1,
      layout: 'rgba-float32',
      colorSpace: 'display-srgb-preview',
    })
    pipeline.setParams({
      viewMode: 'compare',
      compareSplit: 0.42,
    })
    pipeline.render()

    expect(contextMock.gl.getUniformLocation).toHaveBeenCalledWith(
      expect.anything(),
      'u_viewMode',
    )
    expect(contextMock.gl.getUniformLocation).toHaveBeenCalledWith(
      expect.anything(),
      'u_compareSplit',
    )
    expect(contextMock.gl.uniform1i).toHaveBeenCalledWith('u_viewMode', 2)
    expect(contextMock.gl.uniform1f).toHaveBeenCalledWith(
      'u_compareSplit',
      0.42,
    )
  })

  it('sends LUT size so shader sampling matches CPU lattice coordinates', async () => {
    contextMock.reset()
    const pipeline = new RawProcessingPipeline(document.createElement('canvas'))
    await pipeline.initialize()

    pipeline.uploadImage({
      data: new Uint16Array([1024, 1024, 1024]),
      width: 1,
      height: 1,
      layout: 'rgb-u16',
      colorSpace: 'linear-prophoto-rgb',
      renderExposureEv: 0,
      renderExposureMultiplier: 1,
    })
    pipeline.uploadLUT(createLUTData('display-srgb'))
    pipeline.setParams({
      styleKind: 'custom',
      intensity: 1,
    })
    pipeline.render()

    expect(contextMock.gl.getUniformLocation).toHaveBeenCalledWith(
      expect.anything(),
      'u_lutSize',
    )
    expect(contextMock.gl.uniform1f).toHaveBeenCalledWith('u_lutSize', 2)
  })

  it('flushes transient interactive preview renders without blocking for GPU completion', async () => {
    contextMock.reset()
    const pipeline = new RawProcessingPipeline(document.createElement('canvas'))
    await pipeline.initialize()

    pipeline.uploadImage({
      data: new Float32Array(4),
      width: 1,
      height: 1,
      layout: 'rgba-float32',
      colorSpace: 'display-srgb-preview',
    })
    ;(pipeline.render as (options?: { waitForGpu?: boolean }) => unknown)({
      waitForGpu: false,
    })

    expect(contextMock.gl.flush).toHaveBeenCalled()
    expect(contextMock.gl.finish).not.toHaveBeenCalled()
  })
})
