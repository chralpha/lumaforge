/**
 * RAW image processing pipeline using WebGPU.
 * Drop-in replacement for the WebGL2 pipeline with identical public API.
 */

import type {
  BuiltinStylePreset,
  LumaColorSelectiveColorParams,
  LUTColorProfile,
  LUTContractResolution,
  LUTData,
  LUTRole,
  ProcessingParams,
  TransferFunctionId,
} from '@lumaforge/luma-color-runtime'
import {
  CHROMA_CLAMP_HIGH,
  CHROMA_CLAMP_LOW,
  getLinearProPhotoToGamutMatrix,
  getLUTOutputToTargetMatrix,
  LUT_SIZE as SELECTIVE_COLOR_LUT_SIZE,
  mat3Identity,
  mat3ToGLSL,
  normalizeSelectiveColorParams,
  resolveColorBalanceParams,
  resolveExportColorGraph,
  resolveSelectiveColorParams,
  resolveToneParams,
} from '@lumaforge/luma-color-runtime'
import {
  LUT_RANGE_UNIFORMS,
  LUT_ROLE_UNIFORMS,
  LUT_TRANSFER_UNIFORMS,
} from '@lumaforge/luma-color-runtime/wgsl'

import type {
  PipelineCapabilityWarning,
  ProcessTargetPrecision,
  WebGLCapabilities,
} from './context'
import {
  configureCanvasContext,
  createVertexBuffer,
  detectCapabilities,
  padRgbToRgba16,
  padRgbToRgba32f,
  requestWebGPUDevice,
  UNIFORM_BUFFER_SIZE,
  VERTEX_BUFFER_LAYOUT,
  writeUniformF32,
  writeUniformI32,
  writeUniformMat3x3f,
  writeUniformVec2f,
  writeUniformVec3f,
} from './context'
import type { ExportRenderOptions } from './export'
import {
  createExportTiles,
  cropRawUploadInput,
  ExportRenderError,
  planExportRenderTarget,
} from './export'
import {
  PREVIEW_OUTPUT_SHADER,
  PROCESS_FRAGMENT_SHADER_FLOAT,
  PROCESS_FRAGMENT_SHADER_U16,
  VERTEX_SHADER,
} from './shaders'

export type {
  BuiltinStylePreset,
  LUTContractResolution,
  LUTData,
  LUTInputProfile,
  ProcessingParams,
} from '@lumaforge/luma-color-runtime'
export {
  LUT_RANGE_UNIFORMS,
  LUT_ROLE_UNIFORMS,
  LUT_TRANSFER_UNIFORMS,
} from '@lumaforge/luma-color-runtime/wgsl'

export interface PipelineStats {
  uploadTime: number
  lutUploadTime: number
  processTime: number
  totalTime: number
  inputSize: { width: number; height: number }
  previewSize: { width: number; height: number }
  inputFormat: RawUploadInputFormat
  transformPath: PipelineTransformPath
  lutRole: LUTRole | null
  lutInputTransfer: TransferFunctionId | null
  lutOutputTransfer: TransferFunctionId | null
  lutSize: number | null
  processTargetPrecision: ProcessTargetPrecision
  capabilityWarnings: PipelineCapabilityWarning[]
}

export interface RenderOptions {
  waitForGpu?: boolean
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
      renderExposureEv: number
      renderExposureMultiplier: number
    }

export type RawUploadInputFormat = 'float-rgba' | 'uint16-rgb'

export type PipelineTransformPath =
  | 'no-lut'
  | 'builtin-style'
  | 'display-lut'
  | 'scene-creative-lut'
  | 'combined-output-lut'
  | 'technical-output-lut'
  | 'disabled-lut'

export interface PipelineTelemetrySnapshot {
  inputFormat: RawUploadInputFormat
  transformPath: PipelineTransformPath
  lutRole: LUTRole | null
  lutInputTransfer: TransferFunctionId | null
  lutOutputTransfer: TransferFunctionId | null
  lutSize: number | null
  processTargetPrecision: ProcessTargetPrecision
  capabilityWarnings: PipelineCapabilityWarning[]
}

export interface ExportRenderStats extends PipelineTelemetrySnapshot {
  strategy: 'full-frame' | 'tiled' | 'fail'
  width: number
  height: number
  tileCount: number
  planningTime: number
  renderTime: number
  totalTime: number
  reason?:
    | 'texture-limit'
    | 'memory-budget'
    | 'canvas-limit'
    | 'gpu-limit'
    | 'render-failure'
  failureCode?: string
  failureMessage?: string
  retryable?: boolean
}

export function describeRawUploadInput(input: RawUploadInput): {
  inputFormat: RawUploadInputFormat
  channelCount: 3 | 4
  bytesPerPixel: 6 | 16
} {
  if (input.layout === 'rgb-u16') {
    return { inputFormat: 'uint16-rgb', channelCount: 3, bytesPerPixel: 6 }
  }
  return { inputFormat: 'float-rgba', channelCount: 4, bytesPerPixel: 16 }
}

function isSelectiveColorActive(
  bands: LumaColorSelectiveColorParams['selectiveColor'] | null | undefined,
): boolean {
  if (!bands) return false
  const normalized = normalizeSelectiveColorParams({ selectiveColor: bands })
  for (const band of Object.values(normalized)) {
    if (band.hue !== 0 || band.saturation !== 0 || band.lightness !== 0) {
      return true
    }
  }
  return false
}

function getExportFailureCode(error: unknown): string {
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    typeof error.code === 'string'
  )
    return error.code
  if (error instanceof Error) return error.message || error.name
  return String(error)
}

function getExportFailureMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

const DEFAULT_PARAMS: ProcessingParams = {
  intensity: 0.7,
  viewMode: 'compare',
  compareSplit: 0.5,
  styleKind: 'none',
  builtinPreset: null,
  userExposureEv: 0,
  userContrast: 0,
  userHighlights: 0,
  userShadows: 0,
  userWhites: 0,
  userBlacks: 0,
  userTemperature: 0,
  userTint: 0,
  userSaturation: 0,
  userVibrance: 0,
}

const VIEW_MODE_UNIFORMS: Record<ProcessingParams['viewMode'], number> = {
  processed: 0,
  original: 1,
  compare: 2,
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

function toExportProcessingParams(params: ProcessingParams): ProcessingParams {
  return { ...params, viewMode: 'processed', compareSplit: 0.5 }
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
  profileResolution?: LUTContractResolution | null,
): boolean {
  if (!profileResolution || profileResolution.kind !== 'confirmed') return false
  const { profile } = profileResolution
  if (profile.role === 'display-look') return true
  return Boolean(
    profile.outputGamut &&
    profile.outputTransfer &&
    profile.outputRange &&
    profile.outputRange !== 'unknown',
  )
}

function resolveLUTOutputTransfer(
  profile: LUTColorProfile,
): TransferFunctionId | undefined {
  if (profile.outputTransfer) return profile.outputTransfer
  if (profile.role === 'display-look') return profile.inputTransfer
  return undefined
}

export function resolveLUTPipelineProfileUniforms(
  profileResolution?: LUTContractResolution | null,
): LUTPipelineProfileUniforms {
  if (
    !isLUTProfileRenderable(profileResolution) ||
    profileResolution?.kind !== 'confirmed'
  ) {
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
  const outputGamut = profile.outputGamut!
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
    lutOutputTransfer: LUT_TRANSFER_UNIFORMS[outputTransfer!],
    lutRole: LUT_ROLE_UNIFORMS[profile.role],
    lutInputRange: LUT_RANGE_UNIFORMS[profile.inputRange],
    lutOutputRange: LUT_RANGE_UNIFORMS[profile.outputRange!],
  }
}

/**
 * WebGPU-based RAW processing pipeline.
 */
export class RawProcessingPipeline {
  private device!: GPUDevice
  private adapter!: GPUAdapter
  private canvas: HTMLCanvasElement
  private canvasContext!: GPUCanvasContext
  private capabilities!: WebGLCapabilities

  private processPipelineFloat: GPURenderPipeline | null = null
  private processPipelineU16: GPURenderPipeline | null = null
  private outputPipeline: GPURenderPipeline | null = null

  private uniformBGL!: GPUBindGroupLayout
  private inputFloatBGL!: GPUBindGroupLayout
  private inputU16BGL!: GPUBindGroupLayout
  private lutBGL!: GPUBindGroupLayout
  private selectiveColorBGL!: GPUBindGroupLayout
  private outputBGL!: GPUBindGroupLayout

  private vertexBuffer: GPUBuffer | null = null
  private uniformBuffer: GPUBuffer | null = null
  private uniformData: ArrayBuffer = new ArrayBuffer(UNIFORM_BUFFER_SIZE)
  private uniformView: DataView = new DataView(this.uniformData)

  private inputTexture: GPUTexture | null = null
  private lutTexture: GPUTexture | null = null
  private fallbackLutTexture: GPUTexture | null = null
  private processedTexture: GPUTexture | null = null
  private selectiveColorTexture: GPUTexture | null = null

  private linearSampler: GPUSampler | null = null
  private nearestSampler: GPUSampler | null = null

  private inputBindGroup: GPUBindGroup | null = null
  private lutBindGroup: GPUBindGroup | null = null
  private selectiveColorBindGroup: GPUBindGroup | null = null
  private uniformBindGroup: GPUBindGroup | null = null
  private outputBindGroup: GPUBindGroup | null = null

  private selectiveColorBuffer: Float32Array | null = null
  private lastBakedSelectiveBands:
    | LumaColorSelectiveColorParams['selectiveColor']
    | null
    | undefined = undefined
  private lastSelectiveColorActive = false

  private inputWidth = 0
  private inputHeight = 0
  private inputUpload: RawUploadInput | null = null
  private inputFormat: RawUploadInputFormat = 'float-rgba'
  private rawRenderExposureMultiplier = 1
  private params: ProcessingParams = { ...DEFAULT_PARAMS }
  private lutData: LUTData | null = null
  private lastImageUploadTime = 0
  private lastLutUploadTime = 0
  private processTargetPrecision: ProcessTargetPrecision = 'rgba16f'
  private capabilityWarnings: PipelineCapabilityWarning[] = []
  private lastExportStats: ExportRenderStats | null = null
  private isInitialized = false

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return

    const result = await requestWebGPUDevice()
    if (!result) throw new Error('WebGPU is not supported on this device')
    this.device = result.device
    this.adapter = result.adapter
    this.capabilities = detectCapabilities(this.device, this.adapter)
    this.canvasContext = configureCanvasContext(this.canvas, this.device)

    this.linearSampler = this.device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    })
    this.nearestSampler = this.device.createSampler({
      magFilter: 'nearest',
      minFilter: 'nearest',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    })

    this.createBindGroupLayouts()
    this.createPipelines()

    this.vertexBuffer = createVertexBuffer(this.device)
    this.uniformBuffer = this.device.createBuffer({
      size: UNIFORM_BUFFER_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })
    this.uniformBindGroup = this.device.createBindGroup({
      layout: this.uniformBGL,
      entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }],
    })

    this.createFallbackLutTexture()
    this.createSelectiveColorLutTexture()

    this.isInitialized = true
  }

  private createBindGroupLayouts(): void {
    const d = this.device
    this.uniformBGL = d.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' },
        },
      ],
    })
    this.inputFloatBGL = d.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: 'filtering' },
        },
      ],
    })
    this.inputU16BGL = d.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'uint' },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: 'filtering' },
        },
      ],
    })
    this.lutBGL = d.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float', viewDimension: '3d' },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: 'filtering' },
        },
      ],
    })
    this.selectiveColorBGL = d.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' },
        },
      ],
    })
    this.outputBGL = d.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: 'filtering' },
        },
      ],
    })
  }

  private createPipelines(): void {
    const d = this.device
    const vertexModule = d.createShaderModule({ code: VERTEX_SHADER })
    const canvasFormat = navigator.gpu.getPreferredCanvasFormat()

    const processFloatModule = d.createShaderModule({
      code: PROCESS_FRAGMENT_SHADER_FLOAT,
    })
    const processU16Module = d.createShaderModule({
      code: PROCESS_FRAGMENT_SHADER_U16,
    })
    const outputModule = d.createShaderModule({ code: PREVIEW_OUTPUT_SHADER })

    const processLayoutFloat = d.createPipelineLayout({
      bindGroupLayouts: [
        this.uniformBGL,
        this.inputFloatBGL,
        this.lutBGL,
        this.selectiveColorBGL,
      ],
    })
    const processLayoutU16 = d.createPipelineLayout({
      bindGroupLayouts: [
        this.uniformBGL,
        this.inputU16BGL,
        this.lutBGL,
        this.selectiveColorBGL,
      ],
    })
    const vertexState: GPUVertexState = {
      module: vertexModule,
      entryPoint: 'main',
      buffers: [VERTEX_BUFFER_LAYOUT],
    }

    this.processPipelineFloat = d.createRenderPipeline({
      layout: processLayoutFloat,
      vertex: vertexState,
      fragment: {
        module: processFloatModule,
        entryPoint: 'main',
        targets: [{ format: 'rgba16float' }],
      },
    })
    this.processPipelineU16 = d.createRenderPipeline({
      layout: processLayoutU16,
      vertex: vertexState,
      fragment: {
        module: processU16Module,
        entryPoint: 'main',
        targets: [{ format: 'rgba16float' }],
      },
    })

    const outputLayout = d.createPipelineLayout({
      bindGroupLayouts: [this.outputBGL],
    })
    this.outputPipeline = d.createRenderPipeline({
      layout: outputLayout,
      vertex: vertexState,
      fragment: {
        module: outputModule,
        entryPoint: 'main',
        targets: [{ format: canvasFormat }],
      },
    })
  }

  private createFallbackLutTexture(): void {
    this.fallbackLutTexture = this.device.createTexture({
      size: [1, 1, 1],
      format: 'rgba32float',
      dimension: '3d',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    })
    this.device.queue.writeTexture(
      { texture: this.fallbackLutTexture },
      new Float32Array([0, 0, 0, 1]),
      { bytesPerRow: 16 },
      [1, 1, 1],
    )
    this.rebuildLutBindGroup()
  }

  private createSelectiveColorLutTexture(): void {
    this.selectiveColorTexture = this.device.createTexture({
      size: [SELECTIVE_COLOR_LUT_SIZE, 1],
      format: 'rgba16float',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    })
    const neutral = new Float32Array(4 * SELECTIVE_COLOR_LUT_SIZE)
    for (let i = 0; i < SELECTIVE_COLOR_LUT_SIZE; i++) {
      neutral[4 * i + 1] = 1
    }
    this.device.queue.writeTexture(
      { texture: this.selectiveColorTexture },
      neutral,
      { bytesPerRow: SELECTIVE_COLOR_LUT_SIZE * 8 },
      [SELECTIVE_COLOR_LUT_SIZE, 1],
    )
    this.selectiveColorBuffer = new Float32Array(4 * SELECTIVE_COLOR_LUT_SIZE)
    this.rebuildSelectiveColorBindGroup()
  }

  private rebuildLutBindGroup(): void {
    const tex = this.lutTexture ?? this.fallbackLutTexture
    if (!tex) return
    this.lutBindGroup = this.device.createBindGroup({
      layout: this.lutBGL,
      entries: [
        { binding: 0, resource: tex.createView({ dimension: '3d' }) },
        { binding: 1, resource: this.linearSampler! },
      ],
    })
  }

  private rebuildSelectiveColorBindGroup(): void {
    if (!this.selectiveColorTexture) return
    this.selectiveColorBindGroup = this.device.createBindGroup({
      layout: this.selectiveColorBGL,
      entries: [
        { binding: 0, resource: this.selectiveColorTexture.createView() },
      ],
    })
  }

  private rebuildInputBindGroup(): void {
    if (!this.inputTexture) return
    const isU16 = this.inputFormat === 'uint16-rgb'
    this.inputBindGroup = this.device.createBindGroup({
      layout: isU16 ? this.inputU16BGL : this.inputFloatBGL,
      entries: [
        { binding: 0, resource: this.inputTexture.createView() },
        {
          binding: 1,
          resource: isU16 ? this.nearestSampler! : this.linearSampler!,
        },
      ],
    })
  }

  private rebuildOutputBindGroup(): void {
    if (!this.processedTexture) return
    this.outputBindGroup = this.device.createBindGroup({
      layout: this.outputBGL,
      entries: [
        { binding: 0, resource: this.processedTexture.createView() },
        { binding: 1, resource: this.linearSampler! },
      ],
    })
  }

  uploadImage(input: RawUploadInput): void {
    const startTime = performance.now()
    this.inputUpload = input
    this.inputFormat = describeRawUploadInput(input).inputFormat
    this.rawRenderExposureMultiplier =
      input.colorSpace === 'linear-prophoto-rgb'
        ? Number.isFinite(input.renderExposureMultiplier)
          ? input.renderExposureMultiplier
          : 1
        : 1

    if (this.inputTexture) this.inputTexture.destroy()

    if (input.layout === 'rgb-u16') {
      this.inputTexture = this.device.createTexture({
        size: [input.width, input.height],
        format: 'rgba16uint',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      })
      const padded = padRgbToRgba16(input.data, input.width, input.height)
      this.device.queue.writeTexture(
        { texture: this.inputTexture },
        padded,
        { bytesPerRow: input.width * 8 },
        [input.width, input.height],
      )
    } else {
      this.inputTexture = this.device.createTexture({
        size: [input.width, input.height],
        format: 'rgba32float',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      })
      this.device.queue.writeTexture(
        { texture: this.inputTexture },
        input.data,
        { bytesPerRow: input.width * 16 },
        [input.width, input.height],
      )
    }

    this.inputWidth = input.width
    this.inputHeight = input.height
    this.rebuildInputBindGroup()
    this.recreateProcessedTexture(input.width, input.height)
    this.lastImageUploadTime = performance.now() - startTime
  }

  clearImage(): void {
    if (this.inputTexture) {
      this.inputTexture.destroy()
      this.inputTexture = null
    }
    if (this.processedTexture) {
      this.processedTexture.destroy()
      this.processedTexture = null
    }
    this.inputUpload = null
    this.inputFormat = 'float-rgba'
    this.rawRenderExposureMultiplier = 1
    this.inputWidth = 0
    this.inputHeight = 0
    this.lastImageUploadTime = 0
    this.inputBindGroup = null
    this.outputBindGroup = null
  }

  private recreateProcessedTexture(width: number, height: number): void {
    if (this.processedTexture) this.processedTexture.destroy()
    this.processedTexture = this.device.createTexture({
      size: [width, height],
      format: 'rgba16float',
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.COPY_SRC,
    })
    this.processTargetPrecision = 'rgba16f'
    this.capabilityWarnings = []
    this.rebuildOutputBindGroup()
  }

  uploadLUT(lut: LUTData): void {
    const startTime = performance.now()
    if (this.lutTexture) this.lutTexture.destroy()
    this.lutTexture = this.device.createTexture({
      size: [lut.size, lut.size, lut.size],
      format: 'rgba32float',
      dimension: '3d',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    })
    const padded = padRgbToRgba32f(lut.data, lut.size)
    this.device.queue.writeTexture(
      { texture: this.lutTexture },
      padded,
      { bytesPerRow: lut.size * 16, rowsPerImage: lut.size },
      [lut.size, lut.size, lut.size],
    )
    this.lutData = lut
    this.rebuildLutBindGroup()
    this.lastLutUploadTime = performance.now() - startTime
  }

  clearLUT(): void {
    if (this.lutTexture) {
      this.lutTexture.destroy()
      this.lutTexture = null
    }
    this.lutData = null
    this.lastLutUploadTime = 0
    this.rebuildLutBindGroup()
  }

  setParams(params: Partial<ProcessingParams>): void {
    this.params = { ...this.params, ...params }
  }

  getParams(): ProcessingParams {
    return { ...this.params }
  }

  render(_options: RenderOptions = {}): PipelineStats {
    const startTime = performance.now()
    const { canvas } = this

    if (!this.isInitialized || !this.inputTexture || !this.processedTexture) {
      return {
        uploadTime: this.lastImageUploadTime,
        lutUploadTime: this.lastLutUploadTime,
        processTime: 0,
        totalTime: 0,
        inputSize: { width: 0, height: 0 },
        previewSize: { width: canvas.width, height: canvas.height },
        ...this.getTelemetrySnapshot(),
      }
    }

    const processStart = performance.now()
    this.writeUniforms()
    this.device.queue.writeBuffer(this.uniformBuffer!, 0, this.uniformData)
    this.updateSelectiveColor()

    const encoder = this.device.createCommandEncoder()

    // Pass 1: Process to offscreen texture
    const processPass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.processedTexture.createView(),
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
    })
    const isU16 = this.inputFormat === 'uint16-rgb'
    processPass.setPipeline(
      isU16 ? this.processPipelineU16! : this.processPipelineFloat!,
    )
    processPass.setVertexBuffer(0, this.vertexBuffer!)
    processPass.setBindGroup(0, this.uniformBindGroup!)
    processPass.setBindGroup(1, this.inputBindGroup!)
    processPass.setBindGroup(2, this.lutBindGroup!)
    processPass.setBindGroup(3, this.selectiveColorBindGroup!)
    processPass.draw(4)
    processPass.end()

    // Pass 2: Output to canvas
    const canvasView = this.canvasContext.getCurrentTexture().createView()
    const outputPass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: canvasView,
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
    })
    outputPass.setPipeline(this.outputPipeline!)
    outputPass.setVertexBuffer(0, this.vertexBuffer!)
    outputPass.setBindGroup(0, this.outputBindGroup!)
    outputPass.draw(4)
    outputPass.end()

    this.device.queue.submit([encoder.finish()])
    const processTime = performance.now() - processStart

    return {
      uploadTime: this.lastImageUploadTime,
      lutUploadTime: this.lastLutUploadTime,
      processTime,
      totalTime: performance.now() - startTime,
      inputSize: { width: this.inputWidth, height: this.inputHeight },
      previewSize: { width: canvas.width, height: canvas.height },
      ...this.getTelemetrySnapshot(),
    }
  }

  private writeUniforms(): void {
    const v = this.uniformView
    const p = this.params
    const tone = resolveToneParams({
      userExposureEv: p.userExposureEv,
      userContrast: p.userContrast,
      userHighlights: p.userHighlights,
      userShadows: p.userShadows,
      userWhites: p.userWhites,
      userBlacks: p.userBlacks,
    })
    const colorBalance = resolveColorBalanceParams({
      userTemperature: p.userTemperature,
      userTint: p.userTint,
    })
    const lutProfileUniforms = resolveLUTPipelineProfileUniforms(
      this.lutData?.profileResolution,
    )
    const useRenderableLut = Boolean(
      this.lutTexture &&
      this.lutData &&
      isLUTProfileRenderable(this.lutData.profileResolution),
    )

    writeUniformMat3x3f(
      v,
      'inputToLutGamut',
      lutProfileUniforms.inputToLutGamut,
    )
    writeUniformMat3x3f(
      v,
      'lutOutputToDisplayGamut',
      lutProfileUniforms.lutOutputToDisplayGamut,
    )
    writeUniformVec3f(
      v,
      'lutDomainMin',
      useRenderableLut && this.lutData ? this.lutData.domainMin[0] : 0,
      useRenderableLut && this.lutData ? this.lutData.domainMin[1] : 0,
      useRenderableLut && this.lutData ? this.lutData.domainMin[2] : 0,
    )
    writeUniformF32(v, 'intensity', p.intensity)
    writeUniformVec3f(
      v,
      'lutDomainMax',
      useRenderableLut && this.lutData ? this.lutData.domainMax[0] : 1,
      useRenderableLut && this.lutData ? this.lutData.domainMax[1] : 1,
      useRenderableLut && this.lutData ? this.lutData.domainMax[2] : 1,
    )
    writeUniformF32(
      v,
      'rawRenderExposureMultiplier',
      this.rawRenderExposureMultiplier,
    )
    writeUniformVec3f(
      v,
      'userColorBalanceGain',
      colorBalance.gain[0],
      colorBalance.gain[1],
      colorBalance.gain[2],
    )
    writeUniformF32(v, 'userExposureMultiplier', tone.userExposureMultiplier)
    writeUniformF32(v, 'userContrastAmount', tone.userContrast)
    writeUniformF32(v, 'userContrastFactor', tone.userContrastFactor)
    writeUniformF32(v, 'userHighlights', tone.userHighlights)
    writeUniformF32(v, 'userShadows', tone.userShadows)
    writeUniformF32(v, 'userWhites', tone.userWhites)
    writeUniformF32(v, 'userBlacks', tone.userBlacks)
    writeUniformF32(v, 'userSaturation', p.userSaturation)
    writeUniformF32(v, 'userVibrance', p.userVibrance)
    writeUniformF32(v, 'compareSplit', Math.min(1, Math.max(0, p.compareSplit)))
    writeUniformF32(
      v,
      'lutSize',
      useRenderableLut && this.lutData ? Math.max(1, this.lutData.size) : 1,
    )
    writeUniformVec2f(
      v,
      'selectiveColorChromaClamp',
      CHROMA_CLAMP_LOW,
      CHROMA_CLAMP_HIGH,
    )
    writeUniformI32(v, 'viewMode', VIEW_MODE_UNIFORMS[p.viewMode])
    writeUniformI32(v, 'styleKind', STYLE_KIND_UNIFORMS[p.styleKind])
    writeUniformI32(
      v,
      'builtinPreset',
      p.builtinPreset ? BUILTIN_PRESET_UNIFORMS[p.builtinPreset] : 0,
    )
    writeUniformI32(v, 'useLut', useRenderableLut ? 1 : 0)
    writeUniformI32(v, 'lutInputTransfer', lutProfileUniforms.lutInputTransfer)
    writeUniformI32(
      v,
      'lutOutputTransfer',
      lutProfileUniforms.lutOutputTransfer,
    )
    writeUniformI32(v, 'lutRole', lutProfileUniforms.lutRole)
    writeUniformI32(v, 'lutInputRange', lutProfileUniforms.lutInputRange)
    writeUniformI32(v, 'lutOutputRange', lutProfileUniforms.lutOutputRange)
    writeUniformI32(
      v,
      'selectiveColorActive',
      this.lastSelectiveColorActive ? 1 : 0,
    )
  }

  private updateSelectiveColor(): void {
    const bands = this.params.selectiveColor
    if (bands !== this.lastBakedSelectiveBands) {
      const buffer = this.selectiveColorBuffer!
      const partial: Partial<LumaColorSelectiveColorParams> = bands
        ? { selectiveColor: bands }
        : {}
      resolveSelectiveColorParams(partial, buffer)
      this.device.queue.writeTexture(
        { texture: this.selectiveColorTexture! },
        buffer,
        { bytesPerRow: SELECTIVE_COLOR_LUT_SIZE * 8 },
        [SELECTIVE_COLOR_LUT_SIZE, 1],
      )
      this.lastBakedSelectiveBands = bands
      this.lastSelectiveColorActive = isSelectiveColorActive(bands)
      writeUniformI32(
        this.uniformView,
        'selectiveColorActive',
        this.lastSelectiveColorActive ? 1 : 0,
      )
      this.device.queue.writeBuffer(this.uniformBuffer!, 0, this.uniformData)
    }
  }

  private getTelemetrySnapshot(): PipelineTelemetrySnapshot {
    const exportGraph = resolveExportColorGraph({
      styleKind: this.params.styleKind,
      intensity: this.params.intensity,
      builtinPreset: this.params.builtinPreset,
      lut: this.lutData,
      userExposureEv: this.params.userExposureEv,
      userContrast: this.params.userContrast,
      userHighlights: this.params.userHighlights,
      userShadows: this.params.userShadows,
      userWhites: this.params.userWhites,
      userBlacks: this.params.userBlacks,
      userTemperature: this.params.userTemperature,
      userTint: this.params.userTint,
      userSaturation: this.params.userSaturation,
      userVibrance: this.params.userVibrance,
      selectiveColor: this.params.selectiveColor,
    })
    const resolvedProfile = exportGraph.supported
      ? exportGraph.lutProfile
      : null
    const outputTransfer = resolvedProfile
      ? resolveLUTOutputTransfer(resolvedProfile)
      : null
    return {
      inputFormat: this.inputFormat,
      transformPath: this.getTransformPath(),
      lutRole: resolvedProfile?.role ?? null,
      lutInputTransfer: resolvedProfile?.inputTransfer ?? null,
      lutOutputTransfer: outputTransfer ?? null,
      lutSize: this.lutData?.size ?? null,
      processTargetPrecision: this.processTargetPrecision,
      capabilityWarnings: this.capabilityWarnings.map((w) => ({ ...w })),
    }
  }

  private getTransformPath(): PipelineTransformPath {
    if (this.params.styleKind === 'builtin') return 'builtin-style'
    if (this.params.styleKind !== 'custom' || !this.lutData || !this.lutTexture)
      return 'no-lut'
    if (!isLUTProfileRenderable(this.lutData.profileResolution))
      return 'disabled-lut'
    const profileResolution = this.lutData.profileResolution
    if (profileResolution.kind !== 'confirmed') return 'display-lut'
    switch (profileResolution.profile.role) {
      case 'display-look':
        return 'display-lut'
      case 'scene-creative':
        return 'scene-creative-lut'
      case 'combined-look-output':
        return 'combined-output-lut'
      case 'technical-output':
        return 'technical-output-lut'
    }
  }

  readProcessedPixels(): Float32Array | null {
    return null
  }

  async readProcessedPixelsAsync(): Promise<Float32Array | null> {
    if (!this.processedTexture || !this.inputWidth || !this.inputHeight)
      return null
    const bytesPerRow = Math.ceil((this.inputWidth * 16) / 256) * 256
    const readBuffer = this.device.createBuffer({
      size: bytesPerRow * this.inputHeight,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    })
    const encoder = this.device.createCommandEncoder()
    encoder.copyTextureToBuffer(
      { texture: this.processedTexture },
      { buffer: readBuffer, bytesPerRow },
      [this.inputWidth, this.inputHeight],
    )
    this.device.queue.submit([encoder.finish()])
    await readBuffer.mapAsync(GPUMapMode.READ)
    const mapped = new Float32Array(readBuffer.getMappedRange())
    const result = new Float32Array(this.inputWidth * this.inputHeight * 4)
    const rowFloats = this.inputWidth * 4
    const bytesPerRowFloats = bytesPerRow / 4
    for (let y = 0; y < this.inputHeight; y++) {
      result.set(
        mapped.subarray(
          y * bytesPerRowFloats,
          y * bytesPerRowFloats + rowFloats,
        ),
        y * rowFloats,
      )
    }
    readBuffer.unmap()
    readBuffer.destroy()
    return result
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
    if (!this.inputUpload) throw new Error('EXPORT_SOURCE_MISSING')
    const totalStart = performance.now()
    const plan = planExportRenderTarget({
      width,
      height,
      maxTextureSize: this.capabilities.maxTextureSize,
      ...exportOptions,
    })
    const planningTime = performance.now() - totalStart

    if (plan.strategy === 'fail') {
      this.lastExportStats = {
        ...this.getTelemetrySnapshot(),
        strategy: 'fail',
        width: plan.width,
        height: plan.height,
        tileCount: 0,
        planningTime,
        renderTime: 0,
        totalTime: performance.now() - totalStart,
        reason: plan.reason,
        retryable: plan.retryable,
      }
      throw ExportRenderError.fromFailedPlan(plan)
    }

    const renderStart = performance.now()
    let outputCanvas: HTMLCanvasElement
    try {
      outputCanvas =
        plan.strategy === 'tiled'
          ? await this.renderTiledHiddenCanvas(plan)
          : await this.renderFullFrameHiddenCanvas(width, height)
    } catch (error) {
      this.lastExportStats = {
        ...this.getTelemetrySnapshot(),
        strategy: 'fail',
        width: plan.width,
        height: plan.height,
        tileCount:
          plan.strategy === 'tiled' ? createExportTiles(plan).length : 1,
        planningTime,
        renderTime: performance.now() - renderStart,
        totalTime: performance.now() - totalStart,
        reason: 'render-failure',
        failureCode: getExportFailureCode(error),
        failureMessage: getExportFailureMessage(error),
        retryable: false,
      }
      throw error
    }

    this.lastExportStats = {
      ...this.getTelemetrySnapshot(),
      strategy: plan.strategy,
      width: plan.width,
      height: plan.height,
      tileCount: plan.strategy === 'tiled' ? createExportTiles(plan).length : 1,
      planningTime,
      renderTime: performance.now() - renderStart,
      totalTime: performance.now() - totalStart,
      reason: plan.strategy === 'tiled' ? plan.reason : undefined,
    }
    return outputCanvas
  }

  getLastExportStats(): ExportRenderStats | null {
    return this.lastExportStats
  }

  private async renderFullFrameHiddenCanvas(
    width: number,
    height: number,
  ): Promise<HTMLCanvasElement> {
    if (!this.inputUpload) throw new Error('EXPORT_SOURCE_MISSING')
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const outputCanvas = document.createElement('canvas')
    outputCanvas.width = width
    outputCanvas.height = height
    const outputContext = outputCanvas.getContext('2d')
    if (!outputContext) throw new Error('EXPORT_CANVAS_CONTEXT_MISSING')

    const pipeline = new RawProcessingPipeline(canvas)
    try {
      await pipeline.initialize()
      pipeline.uploadImage(this.inputUpload)
      if (this.lutData) pipeline.uploadLUT(this.lutData)
      pipeline.setParams(toExportProcessingParams(this.params))
      pipeline.render()
      outputContext.drawImage(canvas, 0, 0, width, height)
    } finally {
      pipeline.dispose({ releaseContext: true })
    }
    return outputCanvas
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
    if (!context) throw new Error('EXPORT_CANVAS_CONTEXT_MISSING')

    const tileCanvas = document.createElement('canvas')
    tileCanvas.width = plan.tileWidth
    tileCanvas.height = plan.tileHeight
    const pipeline = new RawProcessingPipeline(tileCanvas)
    try {
      await pipeline.initialize()
      if (this.lutData) pipeline.uploadLUT(this.lutData)
      pipeline.setParams(toExportProcessingParams(this.params))
      for (const tile of createExportTiles(plan)) {
        pipeline.resize(tile.width, tile.height)
        pipeline.uploadImage(cropRawUploadInput(this.inputUpload, tile))
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
      }
    } finally {
      pipeline.dispose({ releaseContext: true })
    }
    return canvas
  }

  resize(width: number, height: number): void {
    this.canvas.width = width
    this.canvas.height = height
    if (this.canvasContext && this.device) {
      this.canvasContext.configure({
        device: this.device,
        format: navigator.gpu.getPreferredCanvasFormat(),
        alphaMode: 'opaque',
      })
    }
  }

  getCapabilities(): WebGLCapabilities {
    return this.capabilities
  }
  getInputDimensions(): { width: number; height: number } {
    return { width: this.inputWidth, height: this.inputHeight }
  }

  dispose({ releaseContext = false }: { releaseContext?: boolean } = {}): void {
    if (this.inputTexture) this.inputTexture.destroy()
    if (this.lutTexture) this.lutTexture.destroy()
    if (this.fallbackLutTexture) this.fallbackLutTexture.destroy()
    if (this.processedTexture) this.processedTexture.destroy()
    if (this.selectiveColorTexture) this.selectiveColorTexture.destroy()
    if (this.vertexBuffer) this.vertexBuffer.destroy()
    if (this.uniformBuffer) this.uniformBuffer.destroy()

    this.inputTexture = null
    this.lutTexture = null
    this.fallbackLutTexture = null
    this.processedTexture = null
    this.selectiveColorTexture = null
    this.vertexBuffer = null
    this.uniformBuffer = null
    this.selectiveColorBuffer = null
    this.lastBakedSelectiveBands = undefined
    this.lastSelectiveColorActive = false
    this.processPipelineFloat = null
    this.processPipelineU16 = null
    this.outputPipeline = null
    this.inputBindGroup = null
    this.lutBindGroup = null
    this.selectiveColorBindGroup = null
    this.uniformBindGroup = null
    this.outputBindGroup = null

    if (releaseContext && this.device) this.device.destroy()
    this.isInitialized = false
  }
}
