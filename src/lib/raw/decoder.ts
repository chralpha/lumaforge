type DecodedImageLayout = 'rgba-float32' | 'rgb-u16'

type DecodedImageColorSpace = 'display-srgb-preview' | 'linear-prophoto-rgb'

export interface DecodedImage {
  width: number
  height: number
  channels: 3 | 4
  bitsPerChannel: 16 | 32
  data: Float32Array | Uint16Array
  layout: DecodedImageLayout
  colorSpace: DecodedImageColorSpace
  source?: 'quick' | 'hq'
  timings?: Record<string, number | undefined>
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
  progress: number
}

export type ProgressCallback = (progress: DecodeProgress) => void

export const QUICK_PREVIEW_MAX_PIXELS = 2_500_000

export const SUPPORTED_RAW_EXTENSIONS = new Set([
  'cr2',
  'cr3',
  'crw',
  'nef',
  'nrw',
  'arw',
  'srf',
  'sr2',
  'raf',
  'rw2',
  'rwl',
  'orf',
  'pef',
  'ptx',
  'srw',
  'dng',
  'iiq',
  '3fr',
  'fff',
  'x3f',
  'dcr',
  'dcs',
  'kdc',
  'mos',
  'raw',
  'rwz',
  'erf',
  'mef',
  'mrw',
])

export function isSupportedRaw(file: File | string): boolean {
  const name = typeof file === 'string' ? file : file.name
  const ext = getFileExtension(name)
  return ext ? SUPPORTED_RAW_EXTENSIONS.has(ext) : false
}

export function getFileExtension(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : ''
}
