/**
 * RAW image processing pipeline using WebGL2.
 * Handles the complete flow from decoded RAW data to display/export.
 */

import type { TransferFunctionId } from '~/lib/color/log-encoding'
import {
  getLinearProPhotoToGamutMatrix,
  getLUTOutputToTargetMatrix,
  mat3Identity,
  mat3ToGLSL,
} from '~/lib/color/matrix'
import type {
  LUTColorProfile,
  LUTRole,
  SignalRange,
} from '~/lib/color/registry'

import type { WebGLCapabilities } from './context'
import {
  create3DTexture,
  createFramebuffer,
  createFullscreenQuad,
  createProgram,
  createRgb16UiTextureFromData,
  createTextureFromData,
  createWebGL2Context,
  detectCapabilities,
  getRecommendedTextureFormat,
} from './context'
import type {ExportRenderOptions} from './export';
import {
  createExportTiles,
  cropRawUploadInput,
  ExportRenderError,
  planExportRenderTarget
} from './export'
import {
  PREVIEW_OUTPUT_SHADER,
  PROCESS_FRAGMENT_SHADER_FLOAT,
  PROCESS_FRAGMENT_SHADER_U16,
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

export type LUTProfileResolution =
  | {
      kind: 'resolved'
      profile: LUTColorProfile
      confidence: 'explicit' | 'filename' | 'user'
    }
  | {
      kind: 'needs-user-selection'
      suggestions: LUTColorProfile[]
      reason?: 'unsupported-output'
    }

export interface LUTData {
  size: number
  data: Float32Array
  domainMin: [number, number, number]
  domainMax: [number, number, number]
  title?: string
  inputProfile: LUTInputProfile
  profileResolution: LUTProfileResolution
}

export interface PipelineStats {
  uploadTime: number
  processTime: number
  totalTime: number
  inputSize: { width: number; height: number }
  previewSize: { width: number; height: number }
}

export type RawUploadInput =
  | {
      data: Float32Array
      width: number
      height: number
      layout: 'rgba-float32'
      colorSpace: 'display-srgb-preview'
    }
  | {
      data: Uint16Array
      width: number
      height: number
      layout: 'rgb-u16'
      colorSpace: 'linear-prophoto-rgb'
    }

export type RawUploadInputFormat = 'float-rgba' | 'uint16-rgb'

export function describeRawUploadInput(input: RawUploadInput): {
  inputFormat: RawUploadInputFormat
  channelCount: 3 | 4
  bytesPerPixel: 6 | 16
} {
  if (input.layout === 'rgb-u16') {
    return {
      inputFormat: 'uint16-rgb',
      channelCount: 3,
      bytesPerPixel: 6,
    }
  }

  return {
    inputFormat: 'float-rgba',
    channelCount: 4,
    bytesPerPixel: 16,
  }
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

export const LUT_ROLE_UNIFORMS: Record<LUTRole, number> = {
  'display-look': 0,
  'scene-creative': 1,
  'combined-look-output': 2,
  'technical-output': 3,
}

export const LUT_RANGE_UNIFORMS: Record<SignalRange, number> = {
  full: 0,
  legal: 1,
  unknown: 2,
}

export const LUT_TRANSFER_UNIFORMS: Record<TransferFunctionId, number> = {
  srgb: 0,
  gamma24: 1,
  's-log2': 2,
  's-log3': 3,
  'canon-log': 4,
  'canon-log2': 5,
  'canon-log3': 6,
  'n-log': 7,
  'f-log': 8,
  'f-log2': 9,
  'f-log2c': 10,
  'v-log': 11,
  logc3: 12,
  logc4: 13,
  log3g10: 14,
  acescc: 15,
  acescct: 16,
  'l-log': 17,
  linear: 18,
}

export interface LUTPipelineProfileUniforms {
  inputToLutGamut: Float32Array
  lutOutputToDisplayGamut: Float32Array
  lutInputTransfer: number
  lutOutputTransfer: number
  lutRole: number
  lutInputRange: number
  lutOutputRange: number
}

const DISPLAY_TARGET_GAMUT = 'srgb-rec709'

const DISPLAY_PROFILE_UNIFORMS: LUTPipelineProfileUniforms = {
  inputToLutGamut: mat3ToGLSL(mat3Identity()),
  lutOutputToDisplayGamut: mat3ToGLSL(mat3Identity()),
  lutInputTransfer: LUT_TRANSFER_UNIFORMS.srgb,
  lutOutputTransfer: LUT_TRANSFER_UNIFORMS.srgb,
  lutRole: LUT_ROLE_UNIFORMS['display-look'],
  lutInputRange: LUT_RANGE_UNIFORMS.full,
  lutOutputRange: LUT_RANGE_UNIFORMS.full,
}

export function isLUTProfileRenderable(
  profileResolution?: LUTProfileResolution | null,
): boolean {
  return (
    profileResolution?.kind !== 'needs-user-selection' ||
    profileResolution.reason !== 'unsupported-output'
  )
}

function resolveLUTOutputTransfer(
  profile: LUTColorProfile,
): TransferFunctionId {
  if (profile.outputTransfer) return profile.outputTransfer

  if (profile.role === 'display-look') return 'srgb'

  if (profile.role === 'scene-creative') return profile.inputTransfer

  if (
    profile.role === 'combined-look-output' &&
    profile.outputGamut === DISPLAY_TARGET_GAMUT
  ) {
    return 'gamma24'
  }

  return 'linear'
}

export function resolveLUTPipelineProfileUniforms(
  profileResolution?: LUTProfileResolution | null,
): LUTPipelineProfileUniforms {
  if (!profileResolution || profileResolution.kind !== 'resolved') {
    return DISPLAY_PROFILE_UNIFORMS
  }

  const { profile } = profileResolution
  if (profile.role === 'display-look') {
    return {
      ...DISPLAY_PROFILE_UNIFORMS,
      lutInputTransfer:
        LUT_TRANSFER_UNIFORMS[profile.inputTransfer] ??
        DISPLAY_PROFILE_UNIFORMS.lutInputTransfer,
      lutOutputTransfer:
        LUT_TRANSFER_UNIFORMS[
          profile.outputTransfer ?? profile.inputTransfer
        ] ?? DISPLAY_PROFILE_UNIFORMS.lutOutputTransfer,
      lutInputRange: LUT_RANGE_UNIFORMS[profile.inputRange],
      lutOutputRange: LUT_RANGE_UNIFORMS[profile.outputRange ?? 'full'],
    }
  }

  const outputGamut = profile.outputGamut ?? profile.inputGamut
  const outputTransfer = resolveLUTOutputTransfer(profile)
  const lutOutputToDisplayGamut =
    outputGamut === DISPLAY_TARGET_GAMUT
      ? mat3Identity()
      : getLUTOutputToTargetMatrix(outputGamut, DISPLAY_TARGET_GAMUT)

  return {
    inputToLutGamut: mat3ToGLSL(
      getLinearProPhotoToGamutMatrix(profile.inputGamut),
    ),
    lutOutputToDisplayGamut: mat3ToGLSL(lutOutputToDisplayGamut),
    lutInputTransfer: LUT_TRANSFER_UNIFORMS[profile.inputTransfer],
    lutOutputTransfer: LUT_TRANSFER_UNIFORMS[outputTransfer],
    lutRole: LUT_ROLE_UNIFORMS[profile.role],
    lutInputRange: LUT_RANGE_UNIFORMS[profile.inputRange],
    lutOutputRange: LUT_RANGE_UNIFORMS[profile.outputRange ?? 'full'],
  }
}

/**
 * WebGL2-based RAW processing pipeline.
 */
export class RawProcessingPipeline {
  private gl: WebGL2RenderingContext
  private canvas: HTMLCanvasElement
  private capabilities: WebGLCapabilities

  // Shader programs
  private processProgramFloat: WebGLProgram | null = null
  private processProgramU16: WebGLProgram | null = null
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
  private inputUpload: RawUploadInput | null = null
  private inputFormat: RawUploadInputFormat = 'float-rgba'
  private params: ProcessingParams = { ...DEFAULT_PARAMS }
  private lutData: LUTData | null = null
  private isInitialized = false

  // Uniforms locations cache
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
    this.processProgramFloat = createProgram(
      gl,
      VERTEX_SHADER,
      PROCESS_FRAGMENT_SHADER_FLOAT,
    )
    this.processProgramU16 = createProgram(
      gl,
      VERTEX_SHADER,
      PROCESS_FRAGMENT_SHADER_U16,
    )
    this.outputProgram = createProgram(gl, VERTEX_SHADER, PREVIEW_OUTPUT_SHADER)

    if (
      !this.processProgramFloat ||
      !this.processProgramU16 ||
      !this.outputProgram
    ) {
      throw new Error('Failed to create shader programs')
    }

    // Cache uniform locations
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

  private getProcessUniforms(
    program: WebGLProgram,
  ): Record<string, WebGLUniformLocation | null> {
    const { gl } = this

    return {
      u_inputTexture: gl.getUniformLocation(program, 'u_inputTexture'),
      u_lutTexture: gl.getUniformLocation(program, 'u_lutTexture'),
      u_useLut: gl.getUniformLocation(program, 'u_useLut'),
      u_lutDomainMin: gl.getUniformLocation(program, 'u_lutDomainMin'),
      u_lutDomainMax: gl.getUniformLocation(program, 'u_lutDomainMax'),
      u_intensity: gl.getUniformLocation(program, 'u_intensity'),
      u_styleKind: gl.getUniformLocation(program, 'u_styleKind'),
      u_builtinPreset: gl.getUniformLocation(program, 'u_builtinPreset'),
      u_inputToLutGamut: gl.getUniformLocation(program, 'u_inputToLutGamut'),
      u_lutOutputToDisplayGamut: gl.getUniformLocation(
        program,
        'u_lutOutputToDisplayGamut',
      ),
      u_lutInputTransfer: gl.getUniformLocation(program, 'u_lutInputTransfer'),
      u_lutOutputTransfer: gl.getUniformLocation(
        program,
        'u_lutOutputTransfer',
      ),
      u_lutRole: gl.getUniformLocation(program, 'u_lutRole'),
      u_lutInputRange: gl.getUniformLocation(program, 'u_lutInputRange'),
      u_lutOutputRange: gl.getUniformLocation(program, 'u_lutOutputRange'),
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
   * @param input - Decoded RAW data and its GPU upload layout.
   */
  uploadImage(input: RawUploadInput): void {
    const { gl } = this

    this.inputUpload = input
    this.inputFormat = describeRawUploadInput(input).inputFormat

    // Delete old texture
    if (this.inputTexture) {
      gl.deleteTexture(this.inputTexture)
    }

    if (input.layout === 'rgb-u16') {
      this.inputTexture = createRgb16UiTextureFromData(
        gl,
        input.width,
        input.height,
        input.data,
      )
    } else {
      const { internalFormat, format, type } = getRecommendedTextureFormat(gl)
      this.inputTexture = createTextureFromData(
        gl,
        input.width,
        input.height,
        input.data,
        {
          internalFormat,
          format,
          type,
        },
      )
    }

    if (!this.inputTexture) {
      throw new Error('Failed to create input texture')
    }

    this.inputWidth = input.width
    this.inputHeight = input.height

    // Recreate processing framebuffer at new size
    this.recreateProcessFBO(input.width, input.height)
  }

  /**
   * Clear uploaded image state so render/export cannot reuse stale pixels.
   */
  clearImage(): void {
    const { gl } = this

    if (this.inputTexture) {
      gl.deleteTexture(this.inputTexture)
      this.inputTexture = null
    }
    if (this.processFBO) {
      gl.deleteFramebuffer(this.processFBO)
      this.processFBO = null
    }
    if (this.processedTexture) {
      gl.deleteTexture(this.processedTexture)
      this.processedTexture = null
    }

    this.inputUpload = null
    this.inputFormat = 'float-rgba'
    this.inputWidth = 0
    this.inputHeight = 0
  }

  private recreateProcessFBO(width: number, height: number): void {
    const { gl } = this

    // Delete old FBO
    if (this.processFBO) {
      gl.deleteFramebuffer(this.processFBO)
      this.processFBO = null
    }
    if (this.processedTexture) {
      gl.deleteTexture(this.processedTexture)
      this.processedTexture = null
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
      processProgramFloat,
      processProgramU16,
      processFBO,
      inputWidth,
      inputHeight,
      inputTexture,
      lutTexture,
      fallbackLutTexture,
      lutData,
      fullscreenQuad,
      params,
      inputFormat,
    } = this
    const processProgram =
      inputFormat === 'uint16-rgb' ? processProgramU16 : processProgramFloat

    if (!processProgram) {
      throw new Error('PROCESS_PROGRAM_MISSING')
    }
    const processUniforms = this.getProcessUniforms(processProgram)

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
    const useRenderableLut = Boolean(
      lutTexture &&
      lutData &&
      isLUTProfileRenderable(lutData.profileResolution),
    )

    gl.bindTexture(
      gl.TEXTURE_3D,
      useRenderableLut ? lutTexture : fallbackLutTexture,
    )
    gl.uniform1i(processUniforms.u_lutTexture, 1)
    if (useRenderableLut && lutData) {
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
    const lutProfileUniforms = resolveLUTPipelineProfileUniforms(
      lutData?.profileResolution,
    )
    gl.uniformMatrix3fv(
      processUniforms.u_inputToLutGamut,
      false,
      lutProfileUniforms.inputToLutGamut,
    )
    gl.uniformMatrix3fv(
      processUniforms.u_lutOutputToDisplayGamut,
      false,
      lutProfileUniforms.lutOutputToDisplayGamut,
    )
    gl.uniform1i(
      processUniforms.u_lutInputTransfer,
      lutProfileUniforms.lutInputTransfer,
    )
    gl.uniform1i(
      processUniforms.u_lutOutputTransfer,
      lutProfileUniforms.lutOutputTransfer,
    )
    gl.uniform1i(processUniforms.u_lutRole, lutProfileUniforms.lutRole)
    gl.uniform1i(
      processUniforms.u_lutInputRange,
      lutProfileUniforms.lutInputRange,
    )
    gl.uniform1i(
      processUniforms.u_lutOutputRange,
      lutProfileUniforms.lutOutputRange,
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
    exportOptions,
  }: {
    width: number
    height: number
    exportOptions?: ExportRenderOptions
  }) {
    if (!this.inputUpload) {
      throw new Error('EXPORT_SOURCE_MISSING')
    }

    const plan = planExportRenderTarget({
      width,
      height,
      maxTextureSize: this.capabilities.maxTextureSize,
      ...exportOptions,
    })

    if (plan.strategy === 'fail') {
      throw ExportRenderError.fromFailedPlan(plan)
    }

    if (plan.strategy === 'tiled') {
      return await this.renderTiledHiddenCanvas(plan)
    }

    return await this.renderFullFrameHiddenCanvas(width, height)
  }

  private async renderFullFrameHiddenCanvas(
    width: number,
    height: number,
  ): Promise<HTMLCanvasElement> {
    const inputUpload = this.inputUpload
    if (!inputUpload) {
      throw new Error('EXPORT_SOURCE_MISSING')
    }

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const pipeline = new RawProcessingPipeline(canvas)
    await pipeline.initialize()
    pipeline.uploadImage(inputUpload)
    if (this.lutData) {
      pipeline.uploadLUT(this.lutData)
    }
    pipeline.setParams(this.params)
    pipeline.render()

    return canvas
  }

  private async renderTiledHiddenCanvas(
    plan: Extract<
      ReturnType<typeof planExportRenderTarget>,
      { strategy: 'tiled' }
    >,
  ): Promise<HTMLCanvasElement> {
    if (
      !this.inputUpload ||
      this.inputUpload.width !== plan.width ||
      this.inputUpload.height !== plan.height
    ) {
      throw new Error('EXPORT_TILED_REQUIRES_SOURCE_SIZE')
    }

    const canvas = document.createElement('canvas')
    canvas.width = plan.width
    canvas.height = plan.height

    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('EXPORT_CANVAS_CONTEXT_MISSING')
    }

    for (const tile of createExportTiles(plan)) {
      const tileCanvas = document.createElement('canvas')
      tileCanvas.width = tile.width
      tileCanvas.height = tile.height

      const pipeline = new RawProcessingPipeline(tileCanvas)
      await pipeline.initialize()

      try {
        pipeline.uploadImage(cropRawUploadInput(this.inputUpload, tile))
        if (this.lutData) {
          pipeline.uploadLUT(this.lutData)
        }
        pipeline.setParams(this.params)
        pipeline.render()

        context.drawImage(
          tileCanvas,
          0,
          0,
          tile.width,
          tile.height,
          tile.x,
          tile.y,
          tile.width,
          tile.height,
        )
      } finally {
        pipeline.dispose()
      }
    }

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
      processProgramFloat,
      processProgramU16,
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
    if (processProgramFloat) gl.deleteProgram(processProgramFloat)
    if (processProgramU16) gl.deleteProgram(processProgramU16)
    if (outputProgram) gl.deleteProgram(outputProgram)

    // Delete geometry
    if (fullscreenQuad) {
      gl.deleteVertexArray(fullscreenQuad.vao)
      gl.deleteBuffer(fullscreenQuad.vbo)
    }

    this.isInitialized = false
  }
}
