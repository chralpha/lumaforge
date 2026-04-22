/**
 * RAW image processing pipeline using WebGL2.
 * Handles the complete flow from decoded RAW data to display/export.
 */

import { LOG_TO_WORKING_SPACE } from '~/lib/color/constants'
import { getProPhotoToTargetMatrix, mat3ToGLSL } from '~/lib/color/matrix'

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
  LOG_SPACE_ENUM,
  PREVIEW_OUTPUT_SHADER,
  PROCESS_FRAGMENT_SHADER,
  VERTEX_SHADER,
} from './shaders'

export interface ProcessingParams {
  intensity: number
  viewMode: 'processed' | 'original'
}

export interface LUTData {
  size: number
  data: Float32Array
  domainMin: [number, number, number]
  domainMax: [number, number, number]
  title?: string
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
  private processedTexture: WebGLTexture | null = null

  // Framebuffers
  private processFBO: WebGLFramebuffer | null = null

  // State
  private inputWidth = 0
  private inputHeight = 0
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

    this.isInitialized = true
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
      u_exposure: gl.getUniformLocation(program, 'u_exposure'),
      u_saturation: gl.getUniformLocation(program, 'u_saturation'),
      u_contrast: gl.getUniformLocation(program, 'u_contrast'),
      u_gamutMatrix: gl.getUniformLocation(program, 'u_gamutMatrix'),
      u_logSpace: gl.getUniformLocation(program, 'u_logSpace'),
    }
  }

  private cacheOutputUniforms(): void {
    const { gl } = this
    const program = this.outputProgram!

    this.outputUniforms = {
      u_inputTexture: gl.getUniformLocation(program, 'u_inputTexture'),
      u_displayGamma: gl.getUniformLocation(program, 'u_displayGamma'),
      u_srgbOutput: gl.getUniformLocation(program, 'u_srgbOutput'),
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
    if (lutTexture && lutData) {
      gl.bindTexture(gl.TEXTURE_3D, lutTexture)
      gl.uniform1i(processUniforms.u_lutTexture, 1)
      gl.uniform1i(processUniforms.u_useLut, 1)
      gl.uniform3fv(processUniforms.u_lutDomainMin, lutData.domainMin)
      gl.uniform3fv(processUniforms.u_lutDomainMax, lutData.domainMax)
    } else {
      gl.uniform1i(processUniforms.u_useLut, 0)
    }

    // Set processing parameters
    gl.uniform1f(processUniforms.u_intensity, params.intensity)
    gl.uniform1f(processUniforms.u_exposure, 0)
    gl.uniform1f(processUniforms.u_saturation, 1)
    gl.uniform1f(processUniforms.u_contrast, 1)

    // Set gamut matrix
    const targetGamut = LOG_TO_WORKING_SPACE['S-Log3'] || 'S-Gamut3'
    const matrix = getProPhotoToTargetMatrix(targetGamut)
    const glMatrix = mat3ToGLSL(matrix)
    gl.uniformMatrix3fv(processUniforms.u_gamutMatrix, false, glMatrix)

    // Set log space
    const logSpaceIndex = LOG_SPACE_ENUM['S-Log3'] || 0
    gl.uniform1i(processUniforms.u_logSpace, logSpaceIndex)

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

    // Output settings
    gl.uniform1f(outputUniforms.u_displayGamma, 2.2)
    gl.uniform1i(outputUniforms.u_srgbOutput, 1)

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
      processedTexture,
      processFBO,
      processProgram,
      outputProgram,
      fullscreenQuad,
    } = this

    // Delete textures
    if (inputTexture) gl.deleteTexture(inputTexture)
    if (lutTexture) gl.deleteTexture(lutTexture)
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

    // Lose context
    const loseContext = gl.getExtension('WEBGL_lose_context')
    if (loseContext) {
      loseContext.loseContext()
    }

    this.isInitialized = false
  }
}
