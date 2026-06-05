/**
 * WebGL2 context and capabilities detection.
 * Provides utilities for checking GPU features required for RAW processing.
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

function clonePipelineCapabilityWarning(
  warning: PipelineCapabilityWarning,
): PipelineCapabilityWarning {
  return { ...warning }
}

let cachedCapabilities: WebGLCapabilities | null = null

function requestWebGL2Context(
  canvas: HTMLCanvasElement,
  options: WebGLContextAttributes,
): WebGL2RenderingContext | null {
  try {
    const strictContext = canvas.getContext('webgl2', options)
    if (strictContext) return strictContext
  } catch {
    // Some engines can reject non-default attributes even when plain WebGL2 works.
  }

  try {
    return canvas.getContext('webgl2')
  } catch {
    return null
  }
}

/**
 * Creates a WebGL2 context with appropriate settings for RAW processing.
 */
export function createWebGL2Context(
  canvas: HTMLCanvasElement,
  options?: WebGLContextAttributes,
): WebGL2RenderingContext | null {
  const defaultOptions: WebGLContextAttributes = {
    alpha: false,
    depth: false,
    stencil: false,
    antialias: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: true,
    powerPreference: 'high-performance',
    ...options,
  }

  const gl = requestWebGL2Context(canvas, defaultOptions)
  if (!gl) {
    console.error('WebGL2 is not supported')
    return null
  }

  return gl
}

/**
 * Detects WebGL2 capabilities for the current device.
 */
export function detectCapabilities(
  gl?: WebGL2RenderingContext,
): WebGLCapabilities {
  if (cachedCapabilities && !gl) {
    return cachedCapabilities
  }

  // Create temporary context if not provided
  let tempCanvas: HTMLCanvasElement | null = null
  let tempGl = gl

  if (!tempGl) {
    tempCanvas = document.createElement('canvas')
    tempCanvas.width = 1
    tempCanvas.height = 1
    tempGl = createWebGL2Context(tempCanvas) as WebGL2RenderingContext
  }

  if (!tempGl) {
    return {
      webgl2: false,
      maxTextureSize: 0,
      max3DTextureSize: 0,
      floatTextures: false,
      floatTexturesLinear: false,
      halfFloatTextures: false,
      halfFloatTexturesLinear: false,
      colorBufferFloat: false,
      colorBufferHalfFloat: false,
      maxVertexUniformVectors: 0,
      maxFragmentUniformVectors: 0,
      maxVaryingVectors: 0,
      fragmentHighFloatPrecision: 0,
      fragmentHighFloatRangeMin: 0,
      fragmentHighFloatRangeMax: 0,
      toneHighPrecision: false,
      rendererInfo: 'Unknown',
      vendorInfo: 'Unknown',
    }
  }

  // Check extensions
  const extColorBufferFloat = tempGl.getExtension('EXT_color_buffer_float')
  const extColorBufferHalfFloat = tempGl.getExtension(
    'EXT_color_buffer_half_float',
  )
  // Enable float blend if available (improves rendering quality)
  tempGl.getExtension('EXT_float_blend')

  // Check texture filtering for float textures
  const floatTexturesLinear =
    tempGl.getExtension('OES_texture_float_linear') !== null
  const halfFloatTexturesLinear =
    tempGl.getExtension('OES_texture_half_float_linear') !== null

  const highFloat = tempGl.getShaderPrecisionFormat(
    tempGl.FRAGMENT_SHADER,
    tempGl.HIGH_FLOAT,
  )
  const fragmentHighFloatPrecision = highFloat?.precision ?? 0
  const fragmentHighFloatRangeMin = highFloat?.rangeMin ?? 0
  const fragmentHighFloatRangeMax = highFloat?.rangeMax ?? 0
  const toneHighPrecision =
    fragmentHighFloatPrecision >= 16 && fragmentHighFloatRangeMax >= 62

  // Get renderer info
  const debugInfo = tempGl.getExtension('WEBGL_debug_renderer_info')
  let rendererInfo = 'Unknown'
  let vendorInfo = 'Unknown'

  if (debugInfo) {
    rendererInfo =
      tempGl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || 'Unknown'
    vendorInfo =
      tempGl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || 'Unknown'
  }

  const capabilities: WebGLCapabilities = {
    webgl2: true,
    maxTextureSize: tempGl.getParameter(tempGl.MAX_TEXTURE_SIZE),
    max3DTextureSize: tempGl.getParameter(tempGl.MAX_3D_TEXTURE_SIZE),
    floatTextures: true, // Always available in WebGL2
    floatTexturesLinear,
    halfFloatTextures: true, // Always available in WebGL2
    halfFloatTexturesLinear,
    colorBufferFloat: extColorBufferFloat !== null,
    colorBufferHalfFloat:
      extColorBufferHalfFloat !== null || extColorBufferFloat !== null,
    maxVertexUniformVectors: tempGl.getParameter(
      tempGl.MAX_VERTEX_UNIFORM_VECTORS,
    ),
    maxFragmentUniformVectors: tempGl.getParameter(
      tempGl.MAX_FRAGMENT_UNIFORM_VECTORS,
    ),
    maxVaryingVectors: tempGl.getParameter(tempGl.MAX_VARYING_VECTORS),
    fragmentHighFloatPrecision,
    fragmentHighFloatRangeMin,
    fragmentHighFloatRangeMax,
    toneHighPrecision,
    rendererInfo,
    vendorInfo,
  }

  // Cleanup temporary resources
  if (tempCanvas && !gl) {
    const loseContext = tempGl.getExtension('WEBGL_lose_context')
    if (loseContext) {
      loseContext.loseContext()
    }
  }

  if (!gl) {
    cachedCapabilities = capabilities
  }

  return capabilities
}

/**
 * Checks if the device can handle full-precision float rendering.
 */
export function canUseFloatRendering(): boolean {
  const caps = detectCapabilities()
  return caps.colorBufferFloat && caps.floatTexturesLinear
}

/**
 * Checks if the device can handle half-float rendering (fallback).
 */
export function canUseHalfFloatRendering(): boolean {
  const caps = detectCapabilities()
  return caps.colorBufferHalfFloat && caps.halfFloatTexturesLinear
}

export function getProcessingTextureFormatWarnings(
  precision: ProcessTargetPrecision,
): PipelineCapabilityWarning[] {
  return precision === 'rgba8'
    ? [clonePipelineCapabilityWarning(LOW_PRECISION_RENDER_TARGET_WARNING)]
    : []
}

export function selectProcessingTextureFormat(
  capabilities: WebGLCapabilities,
): ProcessingTextureFormatSelection {
  if (
    capabilities.colorBufferHalfFloat &&
    capabilities.halfFloatTexturesLinear
  ) {
    return {
      precision: 'rgba16f',
      warnings: [],
    }
  }

  return {
    precision: 'rgba8',
    warnings: getProcessingTextureFormatWarnings('rgba8'),
  }
}

/**
 * Gets the recommended texture format for the current device.
 */
export function getRecommendedTextureFormat(gl: WebGL2RenderingContext): {
  internalFormat: number
  format: number
  type: number
} {
  if (canUseFloatRendering()) {
    return {
      internalFormat: gl.RGBA32F,
      format: gl.RGBA,
      type: gl.FLOAT,
    }
  }

  if (canUseHalfFloatRendering()) {
    return {
      internalFormat: gl.RGBA16F,
      format: gl.RGBA,
      type: gl.HALF_FLOAT,
    }
  }

  // Fallback to 8-bit (will have banding issues)
  console.warn('Float textures not supported, falling back to 8-bit')
  return {
    internalFormat: gl.RGBA8,
    format: gl.RGBA,
    type: gl.UNSIGNED_BYTE,
  }
}

/**
 * Creates and compiles a shader.
 */
export function createShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader | null {
  const shader = gl.createShader(type)
  if (!shader) return null

  gl.shaderSource(shader, source)
  gl.compileShader(shader)

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader)
    console.error('Shader compilation error:', info)
    gl.deleteShader(shader)
    return null
  }

  return shader
}

/**
 * Creates and links a shader program.
 */
export function createProgram(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string,
): WebGLProgram | null {
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexSource)
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource)

  if (!vertexShader || !fragmentShader) return null

  const program = gl.createProgram()
  if (!program) return null

  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)

  // Clean up shaders after linking
  gl.deleteShader(vertexShader)
  gl.deleteShader(fragmentShader)

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program)
    console.error('Program linking error:', info)
    gl.deleteProgram(program)
    return null
  }

  return program
}

/**
 * Creates a texture from image data.
 */
export function createTextureFromData(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  data: Float32Array | Uint8Array | Uint16Array | null,
  options?: {
    internalFormat?: number
    format?: number
    type?: number
    minFilter?: number
    magFilter?: number
    wrapS?: number
    wrapT?: number
  },
): WebGLTexture | null {
  const texture = gl.createTexture()
  if (!texture) return null

  const {
    internalFormat = gl.RGBA32F,
    format = gl.RGBA,
    type = gl.FLOAT,
    minFilter = gl.LINEAR,
    magFilter = gl.LINEAR,
    wrapS = gl.CLAMP_TO_EDGE,
    wrapT = gl.CLAMP_TO_EDGE,
  } = options || {}

  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, minFilter)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, magFilter)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapS)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapT)

  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    internalFormat,
    width,
    height,
    0,
    format,
    type,
    data,
  )

  return texture
}

interface TextureFormatOptions {
  internalFormat: number
  format: number
  type: number
  precision?: ProcessTargetPrecision
}

/**
 * Creates an integer RGB16 texture from Luma runtime RGB data.
 */
export function createRgb16UiTextureFromData(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  data: Uint16Array,
): WebGLTexture | null {
  const texture = gl.createTexture()
  if (!texture) return null

  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
  try {
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGB16UI,
      width,
      height,
      0,
      gl.RGB_INTEGER,
      gl.UNSIGNED_SHORT,
      data,
    )
  } finally {
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4)
  }

  return texture
}

/**
 * Creates a 3D texture for LUT.
 */
export function create3DTexture(
  gl: WebGL2RenderingContext,
  size: number,
  data: Float32Array,
): WebGLTexture | null {
  const texture = gl.createTexture()
  if (!texture) return null

  gl.bindTexture(gl.TEXTURE_3D, texture)
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE)

  gl.texImage3D(
    gl.TEXTURE_3D,
    0,
    gl.RGB32F,
    size,
    size,
    size,
    0,
    gl.RGB,
    gl.FLOAT,
    data,
  )

  return texture
}

/**
 * Creates a framebuffer with attached texture.
 */
export function createFramebuffer(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  options?: TextureFormatOptions,
): {
  framebuffer: WebGLFramebuffer
  texture: WebGLTexture
  textureFormat: { precision: ProcessTargetPrecision }
} | null {
  const candidates = options
    ? [options]
    : [
        {
          internalFormat: gl.RGBA16F,
          format: gl.RGBA,
          type: gl.HALF_FLOAT,
          precision: 'rgba16f' as const,
        },
        {
          internalFormat: gl.RGBA8,
          format: gl.RGBA,
          type: gl.UNSIGNED_BYTE,
          precision: 'rgba8' as const,
        },
      ]

  for (const candidate of candidates) {
    const framebuffer = gl.createFramebuffer()
    if (!framebuffer) {
      return null
    }

    const texture = createTextureFromData(gl, width, height, null, candidate)
    if (!texture) {
      gl.deleteFramebuffer(framebuffer)
      continue
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      texture,
      0,
    )

    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER)
    if (status === gl.FRAMEBUFFER_COMPLETE) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      return {
        framebuffer,
        texture,
        textureFormat: {
          precision:
            candidate.precision ??
            (candidate.internalFormat === gl.RGBA16F ? 'rgba16f' : 'rgba8'),
        },
      }
    }

    console.warn('Framebuffer format fallback:', {
      status,
      internalFormat: candidate.internalFormat,
      type: candidate.type,
    })
    gl.deleteFramebuffer(framebuffer)
    gl.deleteTexture(texture)
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  console.error('Framebuffer is not complete for any fallback format')
  return null
}

/**
 * Full-screen quad vertex data
 */
export const FULLSCREEN_QUAD_VERTICES = new Float32Array([
  -1,
  -1,
  0,
  0, // bottom-left
  1,
  -1,
  1,
  0, // bottom-right
  -1,
  1,
  0,
  1, // top-left
  1,
  1,
  1,
  1, // top-right
])

/**
 * Creates a vertex buffer for full-screen quad rendering.
 */
export function createFullscreenQuad(
  gl: WebGL2RenderingContext,
): { vao: WebGLVertexArrayObject; vbo: WebGLBuffer } | null {
  const vao = gl.createVertexArray()
  const vbo = gl.createBuffer()

  if (!vao || !vbo) return null

  gl.bindVertexArray(vao)
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo)
  gl.bufferData(gl.ARRAY_BUFFER, FULLSCREEN_QUAD_VERTICES, gl.STATIC_DRAW)

  // Position attribute (location 0)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0)

  // TexCoord attribute (location 1)
  gl.enableVertexAttribArray(1)
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8)

  gl.bindVertexArray(null)

  return { vao, vbo }
}
