import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getLUTColorProfile } from '~/lib/color/registry'

import type { LUTData, ProcessingParams, RawUploadInput } from './pipeline'
import {
  LUT_ROLE_UNIFORMS,
  LUT_TRANSFER_UNIFORMS,
  RawProcessingPipeline,
} from './pipeline'

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
    TEXTURE_2D: 0x0DE1,
    TEXTURE_3D: 0x806F,
    TEXTURE0: 0x84C0,
    TEXTURE1: 0x84C1,
    TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_MAG_FILTER: 0x2800,
    TEXTURE_WRAP_S: 0x2802,
    TEXTURE_WRAP_T: 0x2803,
    TEXTURE_WRAP_R: 0x8072,
    NEAREST: 0x2600,
    LINEAR: 0x2601,
    CLAMP_TO_EDGE: 0x812F,
    RGB8: 0x8051,
    RGB: 0x1907,
    RGBA: 0x1908,
    RGBA32F: 0x8814,
    RGB16UI: 0x8D77,
    RGB_INTEGER: 0x8D98,
    UNSIGNED_BYTE: 0x1401,
    UNSIGNED_SHORT: 0x1403,
    FLOAT: 0x1406,
    FRAMEBUFFER: 0x8D40,
    TRIANGLE_STRIP: 0x0005,
    createTexture: vi.fn(() => ({})),
    bindTexture: vi.fn(),
    texParameteri: vi.fn(),
    texImage2D: vi.fn(),
    texImage3D: vi.fn(),
    pixelStorei: vi.fn(),
    deleteTexture: vi.fn(),
    deleteFramebuffer: vi.fn(),
    deleteProgram: vi.fn(),
    deleteVertexArray: vi.fn(),
    deleteBuffer: vi.fn(),
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
    finish: vi.fn(),
    readPixels: vi.fn(),
  }

  return {
    capabilities,
    gl,
    reset() {
      for (const value of Object.values(gl)) {
        if (vi.isMockFunction(value)) value.mockClear()
      }
      capabilities.maxTextureSize = 4096
    },
  }
})

vi.mock('./context', () => ({
  createWebGL2Context: vi.fn(() => contextMock.gl),
  detectCapabilities: vi.fn(() => contextMock.capabilities),
  getRecommendedTextureFormat: vi.fn((gl) => ({
    internalFormat: gl.RGBA32F,
    format: gl.RGBA,
    type: gl.FLOAT,
  })),
  createProgram: vi.fn(() => ({})),
  createFullscreenQuad: vi.fn(() => ({ vao: {}, vbo: {} })),
  createTextureFromData: vi.fn(() => ({})),
  createRgb16UiTextureFromData: vi.fn(() => ({})),
  create3DTexture: vi.fn(() => ({})),
  createFramebuffer: vi.fn(() => ({ framebuffer: {}, texture: {} })),
}))

function createRawInput(width: number, height: number): RawUploadInput {
  return {
    data: new Uint16Array(width * height * 3),
    width,
    height,
    layout: 'rgb-u16',
    colorSpace: 'linear-prophoto-rgb',
  }
}

function createLUTData(profileId = 'sony-sgamut3cine-slog3'): LUTData {
  const profile = getLUTColorProfile(profileId)
  if (!profile) throw new Error(`Missing profile ${profileId}`)

  return {
    size: 2,
    data: new Float32Array(2 * 2 * 2 * 3),
    domainMin: [0, 0, 0],
    domainMax: [1, 1, 1],
    inputProfile: 'display-srgb',
    profileResolution: {
      kind: 'resolved',
      profile,
      confidence: 'user',
    },
  }
}

async function createSourcePipeline(input: RawUploadInput) {
  const pipeline = new RawProcessingPipeline(document.createElement('canvas'))
  await pipeline.initialize()
  pipeline.uploadImage(input)
  return pipeline
}

describe('rawProcessingPipeline export rendering', () => {
  let drawImage: ReturnType<typeof vi.fn>

  beforeEach(() => {
    contextMock.reset()
    drawImage = vi.fn()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(((
      type: string,
    ) => {
      if (type === '2d') {
        return { drawImage } as unknown as CanvasRenderingContext2D
      }

      return null
    }) as HTMLCanvasElement['getContext'])
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('preserves selected LUT profile resolution and processing params in hidden export renders', async () => {
    const pipeline = await createSourcePipeline(createRawInput(2, 2))
    const lutData = createLUTData()
    const params: ProcessingParams = {
      intensity: 0.42,
      viewMode: 'processed',
      styleKind: 'custom',
      builtinPreset: null,
    }

    pipeline.uploadLUT(lutData)
    pipeline.setParams(params)

    const uploadLUTSpy = vi.spyOn(RawProcessingPipeline.prototype, 'uploadLUT')
    const setParamsSpy = vi.spyOn(RawProcessingPipeline.prototype, 'setParams')

    await pipeline.renderToHiddenCanvas({ width: 2, height: 2 })

    expect(uploadLUTSpy).toHaveBeenCalledWith(lutData)
    expect(setParamsSpy).toHaveBeenCalledWith(params)
    expect(contextMock.gl.uniform1i).toHaveBeenCalledWith(
      'u_lutInputTransfer',
      LUT_TRANSFER_UNIFORMS['s-log3'],
    )
    expect(contextMock.gl.uniform1i).toHaveBeenCalledWith(
      'u_lutRole',
      LUT_ROLE_UNIFORMS['scene-creative'],
    )
    expect(contextMock.gl.uniform1i).not.toHaveBeenCalledWith(
      'u_lutRole',
      LUT_ROLE_UNIFORMS['display-look'],
    )
  })

  it('renders oversized exports in cropped tiles and stitches them into one output canvas', async () => {
    contextMock.capabilities.maxTextureSize = 1024
    const pipeline = await createSourcePipeline(createRawInput(1500, 900))
    pipeline.setParams({
      intensity: 1,
      viewMode: 'processed',
      styleKind: 'none',
      builtinPreset: null,
    })

    const uploadImageSpy = vi.spyOn(
      RawProcessingPipeline.prototype,
      'uploadImage',
    )

    const canvas = await pipeline.renderToHiddenCanvas({
      width: 1500,
      height: 900,
    })

    expect(canvas.width).toBe(1500)
    expect(canvas.height).toBe(900)
    expect(drawImage).toHaveBeenCalledTimes(2)
    expect(uploadImageSpy).toHaveBeenCalledWith(
      expect.objectContaining({ width: 1024, height: 900 }),
    )
    expect(uploadImageSpy).toHaveBeenCalledWith(
      expect.objectContaining({ width: 476, height: 900 }),
    )
  })

  it('preserves retryable export fit errors from planning failures', async () => {
    const pipeline = await createSourcePipeline(createRawInput(1500, 900))

    await expect(
      pipeline.renderToHiddenCanvas({
        width: 1500,
        height: 900,
        exportOptions: {
          maxCanvasSize: 1024,
          maxCanvasPixels: 1024 * 1024,
          memoryBudgetBytes: 768 * 1024 * 1024,
        },
      }),
    ).rejects.toMatchObject({
      code: 'EXPORT_CANVAS_LIMIT_EXCEEDED',
      retryable: true,
      width: 1500,
      height: 900,
    })
  })

  it('uses caller-provided planning options instead of static defaults', async () => {
    contextMock.capabilities.maxTextureSize = 4096
    const pipeline = await createSourcePipeline(createRawInput(1500, 900))

    const canvas = await pipeline.renderToHiddenCanvas({
      width: 1500,
      height: 900,
      exportOptions: {
        maxCanvasSize: 4096,
        maxCanvasPixels: 2_000_000,
        memoryBudgetBytes: 16 * 1024 * 1024,
      },
    })

    expect(canvas.width).toBe(1500)
    expect(canvas.height).toBe(900)
    expect(drawImage).toHaveBeenCalledTimes(6)
  })
})
