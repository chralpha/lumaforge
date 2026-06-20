/**
 * WebGPU device and capabilities detection.
 * Replaces the WebGL2 context module with WebGPU equivalents.
 * Maintains the same public API shape so consumers don't need changes.
 */

export interface WebGLCapabilities {
  webgl2: boolean
  maxTextureSize: number
  max3DTextureSize: number
  floatTextures: boolean
  floatTexturesLinear: boolean
  halfFloatTextures: boolean
  halfFloatTexturesLinear: boolean
  colorBufferFloat: boolean
  colorBufferHalfFloat: boolean
  maxVertexUniformVectors: number
  maxFragmentUniformVectors: number
  maxVaryingVectors: number
  fragmentHighFloatPrecision: number
  fragmentHighFloatRangeMin: number
  fragmentHighFloatRangeMax: number
  toneHighPrecision: boolean
  rendererInfo: string
  vendorInfo: string
}

export type ProcessTargetPrecision = 'rgba16f' | 'rgba8'

export type PipelineCapabilityWarningCode = 'LOW_PRECISION_RENDER_TARGET'

export interface PipelineCapabilityWarning {
  code: PipelineCapabilityWarningCode
  message: string
}

export interface ProcessingTextureFormatSelection {
  precision: ProcessTargetPrecision
  warnings: PipelineCapabilityWarning[]
}

export const LOW_PRECISION_RENDER_TARGET_WARNING: PipelineCapabilityWarning = {
  code: 'LOW_PRECISION_RENDER_TARGET',
  message:
    'High-quality GPU rendering is unavailable on this device; preview and export may show smoother tonal steps less accurately.',
}

let cachedCapabilities: WebGLCapabilities | null = null

export async function requestWebGPUDevice(): Promise<{
  adapter: GPUAdapter
  device: GPUDevice
} | null> {
  if (!navigator.gpu) return null
  const adapter = await navigator.gpu.requestAdapter({
    powerPreference: 'high-performance',
  })
  if (!adapter) return null
  if (!adapter.features.has('float32-filterable')) {
    throw new Error('WebGPU adapter does not support float32-filterable')
  }
  const requiredFeatures: GPUFeatureName[] = ['float32-filterable']
  const device = await adapter.requestDevice({
    requiredFeatures,
    requiredLimits: {
      maxTextureDimension2D: adapter.limits.maxTextureDimension2D,
      maxTextureDimension3D: adapter.limits.maxTextureDimension3D,
      maxBufferSize: adapter.limits.maxBufferSize,
      maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
    },
  })
  return { adapter, device }
}

export function configureCanvasContext(
  canvas: HTMLCanvasElement,
  device: GPUDevice,
): GPUCanvasContext {
  const ctx = canvas.getContext('webgpu') as GPUCanvasContext | null
  if (!ctx) throw new Error('WebGPU canvas context unavailable')
  ctx.configure({
    device,
    format: navigator.gpu.getPreferredCanvasFormat(),
    alphaMode: 'opaque',
  })
  return ctx
}

export function detectCapabilities(
  device?: GPUDevice,
  adapter?: GPUAdapter,
): WebGLCapabilities {
  if (cachedCapabilities && !device) {
    return cachedCapabilities
  }

  const maxTexture = device ? device.limits.maxTextureDimension2D : 16384
  const max3D = device ? device.limits.maxTextureDimension3D : 2048

  let rendererInfo = 'WebGPU'
  let vendorInfo = 'Unknown'
  if (adapter) {
    const info = adapter.info
    rendererInfo = info.description || info.device || 'WebGPU'
    vendorInfo = info.vendor || 'Unknown'
  }

  const capabilities: WebGLCapabilities = {
    webgl2: true,
    maxTextureSize: maxTexture,
    max3DTextureSize: max3D,
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
    rendererInfo,
    vendorInfo,
  }

  if (!device) {
    cachedCapabilities = capabilities
  }

  return capabilities
}

export function canUseFloatRendering(): boolean {
  return true
}

export function canUseHalfFloatRendering(): boolean {
  return true
}

export function getProcessingTextureFormatWarnings(
  precision: ProcessTargetPrecision,
): PipelineCapabilityWarning[] {
  return precision === 'rgba8'
    ? [{ ...LOW_PRECISION_RENDER_TARGET_WARNING }]
    : []
}

export function selectProcessingTextureFormat(
  _capabilities: WebGLCapabilities,
): ProcessingTextureFormatSelection {
  return { precision: 'rgba16f', warnings: [] }
}

// ─── Uniform buffer layout ─────────────────────────────────────────────────
// Must match the ProcessUniforms struct in shaders.ts exactly.
// mat3x3f in uniform buffers: 3 columns × (vec3f + 4-byte pad) = 48 bytes each

export const UNIFORM_BUFFER_SIZE = 240

export interface UniformFieldMap {
  offset: number
  type: 'f32' | 'i32' | 'vec2f' | 'vec3f' | 'mat3x3f'
}

export const UNIFORM_FIELDS: Record<string, UniformFieldMap> = {
  inputToLutGamut: { offset: 0, type: 'mat3x3f' },
  lutOutputToDisplayGamut: { offset: 48, type: 'mat3x3f' },
  lutDomainMin: { offset: 96, type: 'vec3f' },
  intensity: { offset: 108, type: 'f32' },
  lutDomainMax: { offset: 112, type: 'vec3f' },
  rawRenderExposureMultiplier: { offset: 124, type: 'f32' },
  userColorBalanceGain: { offset: 128, type: 'vec3f' },
  userExposureMultiplier: { offset: 140, type: 'f32' },
  userContrastAmount: { offset: 144, type: 'f32' },
  userContrastFactor: { offset: 148, type: 'f32' },
  userHighlights: { offset: 152, type: 'f32' },
  userShadows: { offset: 156, type: 'f32' },
  userWhites: { offset: 160, type: 'f32' },
  userBlacks: { offset: 164, type: 'f32' },
  userSaturation: { offset: 168, type: 'f32' },
  userVibrance: { offset: 172, type: 'f32' },
  compareSplit: { offset: 176, type: 'f32' },
  lutSize: { offset: 180, type: 'f32' },
  selectiveColorChromaClamp: { offset: 184, type: 'vec2f' },
  viewMode: { offset: 192, type: 'i32' },
  styleKind: { offset: 196, type: 'i32' },
  builtinPreset: { offset: 200, type: 'i32' },
  useLut: { offset: 204, type: 'i32' },
  lutInputTransfer: { offset: 208, type: 'i32' },
  lutOutputTransfer: { offset: 212, type: 'i32' },
  lutRole: { offset: 216, type: 'i32' },
  lutInputRange: { offset: 220, type: 'i32' },
  lutOutputRange: { offset: 224, type: 'i32' },
  selectiveColorActive: { offset: 228, type: 'i32' },
}

export function writeUniformF32(
  view: DataView,
  field: string,
  value: number,
): void {
  const f = UNIFORM_FIELDS[field]
  if (f) view.setFloat32(f.offset, value, true)
}

export function writeUniformI32(
  view: DataView,
  field: string,
  value: number,
): void {
  const f = UNIFORM_FIELDS[field]
  if (f) view.setInt32(f.offset, value, true)
}

export function writeUniformVec3f(
  view: DataView,
  field: string,
  x: number,
  y: number,
  z: number,
): void {
  const f = UNIFORM_FIELDS[field]
  if (!f) return
  view.setFloat32(f.offset, x, true)
  view.setFloat32(f.offset + 4, y, true)
  view.setFloat32(f.offset + 8, z, true)
}

export function writeUniformVec2f(
  view: DataView,
  field: string,
  x: number,
  y: number,
): void {
  const f = UNIFORM_FIELDS[field]
  if (!f) return
  view.setFloat32(f.offset, x, true)
  view.setFloat32(f.offset + 4, y, true)
}

export function writeUniformMat3x3f(
  view: DataView,
  field: string,
  colMajorData: Float32Array,
): void {
  const f = UNIFORM_FIELDS[field]
  if (!f) return
  for (let col = 0; col < 3; col++) {
    const colOffset = f.offset + col * 16
    for (let row = 0; row < 3; row++) {
      view.setFloat32(colOffset + row * 4, colMajorData[col * 3 + row], true)
    }
  }
}

// ─── Vertex buffer ──────────────────────────────────────────────────────────

export const FULLSCREEN_QUAD_VERTICES = new Float32Array([
  -1, -1, 0, 0, 1, -1, 1, 0, -1, 1, 0, 1, 1, 1, 1, 1,
])

export function createVertexBuffer(device: GPUDevice): GPUBuffer {
  const buffer = device.createBuffer({
    size: FULLSCREEN_QUAD_VERTICES.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true,
  })
  new Float32Array(buffer.getMappedRange()).set(FULLSCREEN_QUAD_VERTICES)
  buffer.unmap()
  return buffer
}

export const VERTEX_BUFFER_LAYOUT: GPUVertexBufferLayout = {
  arrayStride: 16,
  attributes: [
    { format: 'float32x2', offset: 0, shaderLocation: 0 },
    { format: 'float32x2', offset: 8, shaderLocation: 1 },
  ],
}

// ─── Texture helpers ────────────────────────────────────────────────────────

export function padRgbToRgba16(
  data: Uint16Array,
  width: number,
  height: number,
): Uint16Array {
  const pixelCount = width * height
  const out = new Uint16Array(pixelCount * 4)
  for (let i = 0; i < pixelCount; i++) {
    out[i * 4 + 0] = data[i * 3 + 0]
    out[i * 4 + 1] = data[i * 3 + 1]
    out[i * 4 + 2] = data[i * 3 + 2]
    out[i * 4 + 3] = 65535
  }
  return out
}

export function padRgbToRgba32f(
  data: Float32Array,
  size: number,
): Float32Array {
  const pixelCount = size * size * size
  const out = new Float32Array(pixelCount * 4)
  for (let i = 0; i < pixelCount; i++) {
    out[i * 4 + 0] = data[i * 3 + 0]
    out[i * 4 + 1] = data[i * 3 + 1]
    out[i * 4 + 2] = data[i * 3 + 2]
    out[i * 4 + 3] = 1.0
  }
  return out
}

// Kept for backwards compatibility with consumers referencing WebGL utilities.
// These are no-ops in WebGPU but keep the type exports working.
export function createWebGL2Context(): null {
  return null
}
export function createShader(): null {
  return null
}
export function createProgram(): null {
  return null
}
export function createTextureFromData(): null {
  return null
}
export function createRgb16UiTextureFromData(): null {
  return null
}
export function create3DTexture(): null {
  return null
}
export function createFramebuffer(): null {
  return null
}
export function createFullscreenQuad(): null {
  return null
}
export function getRecommendedTextureFormat(): {
  internalFormat: number
  format: number
  type: number
} {
  return { internalFormat: 0, format: 0, type: 0 }
}
