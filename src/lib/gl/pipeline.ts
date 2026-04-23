/**
 * RAW image processing pipeline using WebGL2.
 * Handles the complete flow from decoded RAW data to display/export.
 */

import type { WebGLCapabilities } from './context'
import {
  create3DTexture,
  createFramebuffer,
  createFullscreenQuad,
  createProgram,
  createTextureFromData,
  createWebGL2Context,
  detectCapabilities,
  getRecommendedTextureFormat,
} from './context'
import {
  PREVIEW_OUTPUT_SHADER,
  PROCESS_FRAGMENT_SHADER,
  VERTEX_SHADER,
} from './shaders'

export interface ProcessingParams {
  intensity: number
  viewMode: 'processed' | 'original'
  styleKind: 'none' | 'builtin' | 'custom'
  builtinPreset: BuiltinStylePreset | null
}

export type BuiltinStylePreset =
  | 'neutral'
  | 'warm'
  | 'cool'
  | 'film-soft'
  | 'film-contrast'
  | 'cinematic'
  | 'fade'
  | 'mono'

export type LUTInputProfile = 'display-srgb' | 'v-log'

export interface LUTData {
  size: number
  data: Float32Array
  domainMin: [number, number, number]
  domainMax: [number, number, number]
  title?: string
  inputProfile: LUTInputProfile
}

export interface PipelineStats {
  uploadTime: number
  processTime: number
  totalTime: number
  inputSize: { width: number; height: number }
  previewSize: { width: number; height: number }
}

const DEFAULT_PARAMS: ProcessingParams = {
  intensity: 0.7,
  viewMode: 'processed',
  styleKind: 'none',
  builtinPreset: null,
}

const STYLE_KIND_UNIFORMS: Record<ProcessingParams['styleKind'], number> = {
  none: 0,
  builtin: 1,
  custom: 2,
}

const BUILTIN_PRESET_UNIFORMS: Record<BuiltinStylePreset, number> = {
  neutral: 0,
  warm: 1,
  cool: 2,
  'film-soft': 3,
  'film-contrast': 4,
  cinematic: 5,
  fade: 6,
  mono: 7,
}

const LUT_INPUT_PROFILE_UNIFORMS: Record<LUTInputProfile, number> = {
  'display-srgb': 0,
  'v-log': 1,
}

/**
 * WebGL2-based RAW processing pipeline.
 */
export class RawProcessingPipeline {
  private gl: WebGL2RenderingContext
  private canvas: HTMLCanvasElement
  private capabilities: WebGLCapabilities

  // Shader programs
  private processProgram: WebGLProgram | null = null
  private outputProgram: WebGLProgram | null = null

  // Geometry
  private fullscreenQuad: {
    vao: WebGLVertexArrayObject
    vbo: WebGLBuffer
  } | null = null

  // Textures
  private inputTexture: WebGLTexture | null = null
  private lutTexture: WebGLTexture | null = null
  private fallbackLutTexture: WebGLTexture | null = null
  private processedTexture: WebGLTexture | null = null

  // Framebuffers
  private processFBO: WebGLFramebuffer | null = null

  // State
  private inputWidth = 0
  private inputHeight = 0
  private inputPixels: Float32Array | null = null
  private params: ProcessingParams = { ...DEFAULT_PARAMS }
  private lutData: LUTData | null = null
  private isInitialized = false

  // Uniforms locations cache
  private processUniforms: Record<string, WebGLUniformLocation | null> = {}
  private outputUniforms: Record<string, WebGLUniformLocation | null> = {}

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const gl = createWebGL2Context(canvas)
    if (!gl) {
      throw new Error('WebGL2 is not supported on this device')
    }
    this.gl = gl
    this.capabilities = detectCapabilities(gl)
  }

  /**
   * Initialize the pipeline (compile shaders, create buffers).
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return

    const { gl } = this

    // Create shader programs
    this.processProgram = createProgram(
      gl,
      VERTEX_SHADER,
      PROCESS_FRAGMENT_SHADER,
    )
    this.outputProgram = createProgram(gl, VERTEX_SHADER, PREVIEW_OUTPUT_SHADER)

    if (!this.processProgram || !this.outputProgram) {
      throw new Error('Failed to create shader programs')
    }

    // Cache uniform locations
    this.cacheProcessUniforms()
    this.cacheOutputUniforms()

    // Create fullscreen quad
    this.fullscreenQuad = createFullscreenQuad(gl)
    if (!this.fullscreenQuad) {
      throw new Error('Failed to create fullscreen quad')
    }

    this.fallbackLutTexture = this.createFallbackLutTexture()
    if (!this.fallbackLutTexture) {
      throw new Error('Failed to create fallback LUT texture')
    }

    this.isInitialized = true
  }

  private createFallbackLutTexture(): WebGLTexture | null {
    const { gl } = this
    const texture = gl.createTexture()
    if (!texture) return null

    gl.bindTexture(gl.TEXTURE_3D, texture)
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE)
    gl.texImage3D(
      gl.TEXTURE_3D,
      0,
      gl.RGB8,
      1,
      1,
      1,
      0,
      gl.RGB,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0]),
    )
    gl.bindTexture(gl.TEXTURE_3D, null)

    return texture
  }

  private cacheProcessUniforms(): void {
    const { gl } = this
    const program = this.processProgram!

    this.processUniforms = {
      u_inputTexture: gl.getUniformLocation(program, 'u_inputTexture'),
      u_lutTexture: gl.getUniformLocation(program, 'u_lutTexture'),
      u_useLut: gl.getUniformLocation(program, 'u_useLut'),
      u_lutDomainMin: gl.getUniformLocation(program, 'u_lutDomainMin'),
      u_lutDomainMax: gl.getUniformLocation(program, 'u_lutDomainMax'),
      u_intensity: gl.getUniformLocation(program, 'u_intensity'),
      u_styleKind: gl.getUniformLocation(program, 'u_styleKind'),
      u_builtinPreset: gl.getUniformLocation(program, 'u_builtinPreset'),
      u_lutInputProfile: gl.getUniformLocation(program, 'u_lutInputProfile'),
    }
  }

  private cacheOutputUniforms(): void {
    const { gl } = this
    const program = this.outputProgram!

    this.outputUniforms = {
      u_inputTexture: gl.getUniformLocation(program, 'u_inputTexture'),
    }
  }

  /**
   * Upload decoded RAW image data to GPU.
   * @param data - Linear RGB float data (RGBA format)
   * @param width - Image width
   * @param height - Image height
   */
  uploadImage(data: Float32Array, width: number, height: number): void {
    const { gl } = this

    this.inputPixels = data

    // Delete old texture
    if (this.inputTexture) {
      gl.deleteTexture(this.inputTexture)
    }

    // Get recommended format
    const { internalFormat, format, type } = getRecommendedTextureFormat(gl)

    // Create input texture
    this.inputTexture = createTextureFromData(gl, width, height, data, {
      internalFormat,
      format,
      type,
    })

    this.inputWidth = width
    this.inputHeight = height

    // Recreate processing framebuffer at new size
    this.recreateProcessFBO(width, height)
  }

  private recreateProcessFBO(width: number, height: number): void {
    const { gl } = this

    // Delete old FBO
    if (this.processFBO) {
      gl.deleteFramebuffer(this.processFBO)
    }
    if (this.processedTexture) {
      gl.deleteTexture(this.processedTexture)
    }

    const result = createFramebuffer(gl, width, height)
    if (result) {
      this.processFBO = result.framebuffer
      this.processedTexture = result.texture
    }
  }

  /**
   * Upload a 3D LUT.
   */
  uploadLUT(lut: LUTData): void {
    const { gl } = this

    // Delete old LUT texture
    if (this.lutTexture) {
      gl.deleteTexture(this.lutTexture)
    }

    this.lutTexture = create3DTexture(gl, lut.size, lut.data)
    this.lutData = lut
  }

  /**
   * Clear LUT.
   */
  clearLUT(): void {
    const { gl } = this
    if (this.lutTexture) {
      gl.deleteTexture(this.lutTexture)
      this.lutTexture = null
    }
    this.lutData = null
  }

  /**
   * Set processing parameters.
   */
  setParams(params: Partial<ProcessingParams>): void {
    this.params = { ...this.params, ...params }
  }

  /**
   * Get current processing parameters.
   */
  getParams(): ProcessingParams {
    return { ...this.params }
  }

  /**
   * Process the image and render to canvas.
   */
  render(): PipelineStats {
    const startTime = performance.now()
    const { gl, canvas } = this

    if (!this.isInitialized || !this.inputTexture) {
      return {
        uploadTime: 0,
        processTime: 0,
        totalTime: 0,
        inputSize: { width: 0, height: 0 },
        previewSize: { width: canvas.width, height: canvas.height },
      }
    }

    const processStart = performance.now()

    // Pass 1: Process image to FBO
    this.renderProcessPass()

    // Pass 2: Output to canvas with tone mapping
    this.renderOutputPass()

    gl.finish()
    const processTime = performance.now() - processStart

    return {
      uploadTime: 0,
      processTime,
      totalTime: performance.now() - startTime,
      inputSize: { width: this.inputWidth, height: this.inputHeight },
      previewSize: { width: canvas.width, height: canvas.height },
    }
  }

  private renderProcessPass(): void {
    const {
      gl,
      processProgram,
      processFBO,
      inputWidth,
      inputHeight,
      inputTexture,
      lutTexture,
      fallbackLutTexture,
      lutData,
      processUniforms,
      fullscreenQuad,
      params,
    } = this

    // Bind FBO
    gl.bindFramebuffer(gl.FRAMEBUFFER, processFBO)
    gl.viewport(0, 0, inputWidth, inputHeight)

    gl.useProgram(processProgram)

    // Bind input texture
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, inputTexture)
    gl.uniform1i(processUniforms.u_inputTexture, 0)

    // Bind LUT texture
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(
      gl.TEXTURE_3D,
      lutTexture && lutData ? lutTexture : fallbackLutTexture,
    )
    gl.uniform1i(processUniforms.u_lutTexture, 1)
    if (lutTexture && lutData) {
      gl.uniform1i(processUniforms.u_useLut, 1)
      gl.uniform3fv(processUniforms.u_lutDomainMin, lutData.domainMin)
      gl.uniform3fv(processUniforms.u_lutDomainMax, lutData.domainMax)
    } else {
      gl.uniform1i(processUniforms.u_useLut, 0)
      gl.uniform3fv(processUniforms.u_lutDomainMin, [0, 0, 0])
      gl.uniform3fv(processUniforms.u_lutDomainMax, [1, 1, 1])
    }

    gl.uniform1f(processUniforms.u_intensity, params.intensity)
    gl.uniform1i(
      processUniforms.u_styleKind,
      STYLE_KIND_UNIFORMS[params.styleKind],
    )
    gl.uniform1i(
      processUniforms.u_builtinPreset,
      params.builtinPreset ? BUILTIN_PRESET_UNIFORMS[params.builtinPreset] : 0,
    )
    gl.uniform1i(
      processUniforms.u_lutInputProfile,
      lutData
        ? LUT_INPUT_PROFILE_UNIFORMS[lutData.inputProfile]
        : LUT_INPUT_PROFILE_UNIFORMS['display-srgb'],
    )

    // Draw
    gl.bindVertexArray(fullscreenQuad!.vao)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    gl.bindVertexArray(null)
  }

  private renderOutputPass(): void {
    const {
      gl,
      outputProgram,
      canvas,
      processedTexture,
      outputUniforms,
      fullscreenQuad,
    } = this

    // Bind default framebuffer (canvas)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, canvas.width, canvas.height)

    gl.useProgram(outputProgram)

    // Bind processed texture
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, processedTexture)
    gl.uniform1i(outputUniforms.u_inputTexture, 0)

    // Draw
    gl.bindVertexArray(fullscreenQuad!.vao)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    gl.bindVertexArray(null)
  }

  /**
   * Read pixels from the processed image for export.
   */
  readProcessedPixels(): Float32Array | null {
    const { gl, processFBO, inputWidth, inputHeight } = this

    if (!processFBO || !inputWidth || !inputHeight) {
      return null
    }

    // Bind FBO
    gl.bindFramebuffer(gl.FRAMEBUFFER, processFBO)

    // Read pixels
    const pixels = new Float32Array(inputWidth * inputHeight * 4)
    gl.readPixels(0, 0, inputWidth, inputHeight, gl.RGBA, gl.FLOAT, pixels)

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)

    return pixels
  }

  async renderToHiddenCanvas({
    width,
    height,
  }: {
    width: number
    height: number
  }) {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const pipeline = new RawProcessingPipeline(canvas)
    await pipeline.initialize()
    if (!this.inputPixels) {
      throw new Error('EXPORT_SOURCE_MISSING')
    }

    pipeline.uploadImage(this.inputPixels, this.inputWidth, this.inputHeight)
    if (this.lutData) {
      pipeline.uploadLUT(this.lutData)
    }
    pipeline.setParams(this.params)
    pipeline.render()

    return canvas
  }

  /**
   * Resize the canvas.
   */
  resize(width: number, height: number): void {
    this.canvas.width = width
    this.canvas.height = height
  }

  /**
   * Get WebGL capabilities.
   */
  getCapabilities(): WebGLCapabilities {
    return this.capabilities
  }

  /**
   * Get input image dimensions.
   */
  getInputDimensions(): { width: number; height: number } {
    return { width: this.inputWidth, height: this.inputHeight }
  }

  /**
   * Dispose all resources.
   */
  dispose(): void {
    const {
      gl,
      inputTexture,
      lutTexture,
      fallbackLutTexture,
      processedTexture,
      processFBO,
      processProgram,
      outputProgram,
      fullscreenQuad,
    } = this

    // Delete textures
    if (inputTexture) gl.deleteTexture(inputTexture)
    if (lutTexture) gl.deleteTexture(lutTexture)
    if (fallbackLutTexture) gl.deleteTexture(fallbackLutTexture)
    if (processedTexture) gl.deleteTexture(processedTexture)

    // Delete framebuffers
    if (processFBO) gl.deleteFramebuffer(processFBO)

    // Delete programs
    if (processProgram) gl.deleteProgram(processProgram)
    if (outputProgram) gl.deleteProgram(outputProgram)

    // Delete geometry
    if (fullscreenQuad) {
      gl.deleteVertexArray(fullscreenQuad.vao)
      gl.deleteBuffer(fullscreenQuad.vbo)
    }

    this.isInitialized = false
  }
}
