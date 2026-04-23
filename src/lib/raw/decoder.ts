/**
 * RAW decoder service using libraw-wasm.
 * libraw-wasm handles its own Web Worker internally.
 */

import type LibRawClass from 'libraw-wasm'
import type { LibRawOpenOptions } from 'libraw-wasm'

type LibRawInstance = InstanceType<typeof LibRawClass>

/**
 * Create a fresh libraw-wasm worker.
 */
async function createLibRaw(): Promise<LibRawInstance> {
  const LibRaw = (await import('libraw-wasm')).default
  return new LibRaw()
}

function disposeLibRaw(instance: LibRawInstance): void {
  const worker = (instance as LibRawInstance & { worker?: Worker }).worker
  worker?.terminate()
}

export interface DecodeOptions {
  useCameraWB?: boolean
  outputColorSpace?: 'raw' | 'sRGB' | 'AdobeRGB' | 'ProPhotoRGB'
  halfSize?: boolean
  maxOutputPixels?: number
}

export interface DecodedImage {
  width: number
  height: number
  channels: number
  bitsPerChannel: number
  data: Float32Array // Normalized RGB data in RGBA format
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

export type ProgressCallback = (progress: DecodeProgress) => void

export const QUICK_PREVIEW_MAX_PIXELS = 2_500_000
export const HQ_PREVIEW_MAX_PIXELS = 8_000_000

export function toLibRawOptions(options?: DecodeOptions): LibRawOpenOptions {
  return {
    halfSize: options?.halfSize ?? false,
    useCameraWb: options?.useCameraWB ?? true,
    outputColor: 1,
    outputBps: 16,
    noAutoBright: false,
  }
}

/**
 * Decode a RAW file.
 * @param file - File or ArrayBuffer containing RAW data
 * @param options - Decode options
 * @param onProgress - Progress callback
 */
export async function decodeRaw(
  file: File | ArrayBuffer,
  options?: DecodeOptions,
  onProgress?: ProgressCallback,
): Promise<DecodedImage> {
  const libraw = await createLibRaw()

  try {
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
    await libraw.open(uint8Array, toLibRawOptions(options))

    onProgress?.({ phase: 'decoding', progress: 0 })

    // Get metadata
    const metadata = await libraw.metadata(true)

    onProgress?.({ phase: 'decoding', progress: 50 })

    // Get image data
    const imageData = await libraw.imageData()

    onProgress?.({ phase: 'processing', progress: 0 })

    // Convert to Float32Array RGBA format
    const output = convertToFloat32RGBA(
      imageData.data,
      imageData.width,
      imageData.height,
      imageData.bits,
      options?.maxOutputPixels,
    )

    onProgress?.({ phase: 'processing', progress: 100 })

    return {
      width: output.width,
      height: output.height,
      channels: 3,
      bitsPerChannel: 32,
      data: output.data,
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
  } finally {
    disposeLibRaw(libraw)
  }
}

export async function decodeQuickRaw(
  file: File,
  onProgress?: ProgressCallback,
) {
  return decodeRaw(
    file,
    {
      useCameraWB: true,
      halfSize: true,
      maxOutputPixels: QUICK_PREVIEW_MAX_PIXELS,
    },
    onProgress,
  )
}

export async function decodeHqRaw(file: File, onProgress?: ProgressCallback) {
  return decodeRaw(
    file,
    {
      useCameraWB: true,
      halfSize: true,
      maxOutputPixels: HQ_PREVIEW_MAX_PIXELS,
    },
    onProgress,
  )
}

export function planDecodedOutputSize(
  width: number,
  height: number,
  maxOutputPixels?: number,
): { width: number; height: number } {
  const pixelCount = width * height
  if (!maxOutputPixels || pixelCount <= maxOutputPixels) {
    return { width, height }
  }

  const scale = Math.sqrt(maxOutputPixels / pixelCount)
  let outputWidth = Math.max(1, Math.floor(width * scale))
  let outputHeight = Math.max(1, Math.floor(height * scale))

  while (outputWidth * outputHeight > maxOutputPixels) {
    if (outputWidth >= outputHeight) {
      outputWidth -= 1
    } else {
      outputHeight -= 1
    }
  }

  return {
    width: outputWidth,
    height: outputHeight,
  }
}

/**
 * Convert raw image data to normalized Float32 RGBA.
 */
export function convertToFloat32RGBA(
  data: Uint8Array | Uint16Array,
  width: number,
  height: number,
  bits: number,
  maxOutputPixels?: number,
): { data: Float32Array; width: number; height: number } {
  const outputSize = planDecodedOutputSize(width, height, maxOutputPixels)
  const pixelCount = outputSize.width * outputSize.height
  const result = new Float32Array(pixelCount * 4)

  const maxValue = bits > 8 ? 2 ** bits - 1 : 255
  const scale = 1 / maxValue

  if (outputSize.width === width && outputSize.height === height) {
    for (let i = 0; i < pixelCount; i++) {
      const srcIdx = i * 3
      const dstIdx = i * 4

      result[dstIdx + 0] = data[srcIdx + 0] * scale
      result[dstIdx + 1] = data[srcIdx + 1] * scale
      result[dstIdx + 2] = data[srcIdx + 2] * scale
      result[dstIdx + 3] = 1
    }

    return { data: result, ...outputSize }
  }

  for (let y = 0; y < outputSize.height; y++) {
    const sourceY = Math.min(
      height - 1,
      Math.floor(((y + 0.5) * height) / outputSize.height),
    )

    for (let x = 0; x < outputSize.width; x++) {
      const sourceX = Math.min(
        width - 1,
        Math.floor(((x + 0.5) * width) / outputSize.width),
      )
      const srcIdx = (sourceY * width + sourceX) * 3
      const dstIdx = (y * outputSize.width + x) * 4

      result[dstIdx + 0] = data[srcIdx + 0] * scale
      result[dstIdx + 1] = data[srcIdx + 1] * scale
      result[dstIdx + 2] = data[srcIdx + 2] * scale
      result[dstIdx + 3] = 1
    }
  }

  return { data: result, ...outputSize }
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
