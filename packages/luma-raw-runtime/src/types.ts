export type LumaRawMemoryTier = 'low' | 'normal' | 'high'

export type LumaRawSupportLevel = 'official' | 'experimental' | 'unsupported'

export type LumaRawTimings = {
  readFile?: number
  transferToWorker?: number
  copyToWasm?: number
  librawOpen?: number
  openBuffer?: number
  metadata?: number
  thumbnail?: number
  unpack?: number
  process?: number
  makeMemImage?: number
  outputCopy?: number
  transfer?: number
  total: number
}

export type LumaRawMetadata = {
  width?: number
  height?: number
  rawWidth?: number
  rawHeight?: number
  make?: string
  model?: string
  lens?: string
  iso?: number
  aperture?: number
  focalLength?: number
  shutter?: number
  timestamp?: number
  orientation?: number
  blackLevel?: number
  whiteLevel?: number
  thumbnail?: {
    width: number
    height: number
    format: 'jpeg' | 'bitmap' | 'unknown'
  }
  supportLevel: LumaRawSupportLevel
}

export type LumaRawRuntimeInfo = {
  runtime: 'luma'
  version: string
  simd: boolean
  pthreads: boolean
  crossOriginIsolated: boolean
  memoryTier: LumaRawMemoryTier
  workerPoolSize: number
}

export type LumaRawProbe = LumaRawMetadata & {
  jobId: string
  timings: LumaRawTimings
}

export type LumaRawFrame = {
  jobId: string
  sessionId?: string
  source: 'quick' | 'hq'
  width: number
  height: number
  data: Uint16Array
  layout: 'rgb'
  bitDepth: 16
  colorSpace: 'linear-prophoto-rgb'
  orientation: number
  blackLevel?: number
  whiteLevel?: number
  metadata: LumaRawMetadata
  timings: LumaRawTimings
}

export type LumaEmbeddedPreview = {
  jobId: string
  sessionId?: string
  source: 'embedded'
  width: number
  height: number
  data: Uint8Array
  mimeType: 'image/jpeg' | 'image/png' | 'application/octet-stream'
  colorSpace: 'display-srgb-preview'
  orientation: number
  timings: LumaRawTimings
}

export type LumaRawRuntime = {
  init: () => Promise<LumaRawRuntimeInfo>
  probe: (file: File, signal?: AbortSignal) => Promise<LumaRawProbe>
  extractEmbeddedPreview: (
    file: File,
    signal?: AbortSignal,
  ) => Promise<LumaEmbeddedPreview | null>
  decodeQuick: (file: File, signal?: AbortSignal) => Promise<LumaRawFrame>
  decodeHq: (file: File, signal?: AbortSignal) => Promise<LumaRawFrame>
  dispose: () => void
}
