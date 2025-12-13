/**
 * RAW decoder service using libraw-wasm.
 * libraw-wasm handles its own Web Worker internally.
 */

import type LibRawClass from 'libraw-wasm'

type LibRawInstance = InstanceType<typeof LibRawClass>

let libraw: LibRawInstance | null = null
let initPromise: Promise<void> | null = null

/**
 * Initialize libraw-wasm.
 */
async function initializeLibRaw(): Promise<void> {
  if (libraw) return
  if (initPromise) return initPromise

  initPromise = (async () => {
    // Dynamic import to get the default export (the class)
    const LibRaw = (await import('libraw-wasm')).default
    libraw = new LibRaw()
  })()

  return initPromise
}

export interface DecodeOptions {
  useCameraWB?: boolean
  outputColorSpace?: 'raw' | 'sRGB' | 'AdobeRGB' | 'ProPhotoRGB'
  halfSize?: boolean
}

export interface DecodedImage {
  width: number
  height: number
  channels: number
  bitsPerChannel: number
  data: Float32Array // Linear RGB float data in RGBA format
  metadata: ImageMetadata
}

export interface ImageMetadata {
  make?: string
  model?: string
  lens?: string
  iso?: number
  aperture?: number
  focalLength?: number
  shutterSpeed?: string
  timestamp?: Date
  width: number
  height: number
  orientation?: number
}

export interface DecodeProgress {
  phase: 'loading' | 'decoding' | 'processing' | 'complete'
  progress: number // 0-100
}

type ProgressCallback = (progress: DecodeProgress) => void

/**
 * Decode a RAW file.
 * @param file - File or ArrayBuffer containing RAW data
 * @param options - Decode options (currently unused, libraw-wasm has limited config)
 * @param onProgress - Progress callback
 */
export async function decodeRaw(
  file: File | ArrayBuffer,
  _options?: DecodeOptions,
  onProgress?: ProgressCallback,
): Promise<DecodedImage> {
  // Ensure initialized
  await initializeLibRaw()

  if (!libraw) {
    throw new Error('libraw-wasm failed to initialize')
  }

  onProgress?.({ phase: 'loading', progress: 0 })

  // Get ArrayBuffer
  let buffer: ArrayBuffer
  if (file instanceof File) {
    buffer = await file.arrayBuffer()
  } else {
    buffer = file
  }

  onProgress?.({ phase: 'loading', progress: 50 })

  // Open the RAW file
  const uint8Array = new Uint8Array(buffer)
  await libraw.open(uint8Array)

  onProgress?.({ phase: 'decoding', progress: 0 })

  // Get metadata
  const metadata = await libraw.metadata(true)

  onProgress?.({ phase: 'decoding', progress: 50 })

  // Get image data
  const imageData = await libraw.imageData()

  onProgress?.({ phase: 'processing', progress: 0 })

  // Convert to Float32Array RGBA format
  const floatData = convertToFloat32RGBA(
    imageData.data,
    imageData.width,
    imageData.height,
    imageData.bits,
  )

  onProgress?.({ phase: 'processing', progress: 100 })

  return {
    width: imageData.width,
    height: imageData.height,
    channels: 3,
    bitsPerChannel: 32,
    data: floatData,
    metadata: {
      make: metadata.make,
      model: metadata.model,
      lens: metadata.lens || undefined,
      iso: metadata.iso_speed || undefined,
      aperture: metadata.aperture || undefined,
      focalLength: metadata.focal_len || undefined,
      shutterSpeed: metadata.shutter
        ? formatShutter(metadata.shutter)
        : undefined,
      timestamp: metadata.timestamp || undefined,
      width: imageData.width,
      height: imageData.height,
      orientation: imageData.flip || 0,
    },
  }
}

/**
 * Convert raw image data to Float32 linear RGBA.
 */
function convertToFloat32RGBA(
  data: Uint8Array | Uint16Array,
  width: number,
  height: number,
  bits: number,
): Float32Array {
  const pixelCount = width * height
  const result = new Float32Array(pixelCount * 4) // RGBA

  const maxValue = bits === 16 ? 65535 : 255
  const scale = 1 / maxValue

  // Data is RGB interleaved
  for (let i = 0; i < pixelCount; i++) {
    const srcIdx = i * 3
    const dstIdx = i * 4

    result[dstIdx + 0] = data[srcIdx + 0] * scale // R
    result[dstIdx + 1] = data[srcIdx + 1] * scale // G
    result[dstIdx + 2] = data[srcIdx + 2] * scale // B
    result[dstIdx + 3] = 1 // A
  }

  return result
}

/**
 * Format shutter speed as fraction string.
 */
function formatShutter(shutter: number): string {
  if (shutter >= 1) {
    return `${shutter.toFixed(1)}s`
  }
  const denominator = Math.round(1 / shutter)
  return `1/${denominator}s`
}

/**
 * Supported RAW file extensions.
 */
export const SUPPORTED_RAW_EXTENSIONS = new Set([
  // Canon
  'cr2',
  'cr3',
  'crw',
  // Nikon
  'nef',
  'nrw',
  // Sony
  'arw',
  'srf',
  'sr2',
  // Fujifilm
  'raf',
  // Panasonic/Leica
  'rw2',
  'rwl',
  // Olympus/OM System
  'orf',
  // Pentax
  'pef',
  'ptx',
  // Samsung
  'srw',
  // Adobe
  'dng',
  // Phase One
  'iiq',
  // Hasselblad
  '3fr',
  'fff',
  // Sigma
  'x3f',
  // Kodak
  'dcr',
  'dcs',
  'kdc',
  // Mamiya/Leaf
  'mos',
  // Generic
  'raw',
  'rwz',
  'erf',
  'mef',
  'mrw',
])

/**
 * Check if a file is a supported RAW format.
 */
export function isSupportedRaw(file: File | string): boolean {
  const name = typeof file === 'string' ? file : file.name
  const ext = name.split('.').pop()?.toLowerCase()
  return ext ? SUPPORTED_RAW_EXTENSIONS.has(ext) : false
}

/**
 * Get file extension.
 */
export function getFileExtension(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() || ''
}
