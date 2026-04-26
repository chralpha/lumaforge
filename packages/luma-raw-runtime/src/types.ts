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

export type LumaRawHeapStats = {
  before?: number
  after?: number
  peak?: number
}

export type LumaRawQuickOptions = {
  maxOutputPixels?: number
}

export type LumaRawCfaPattern =
  | 'rggb'
  | 'bggr'
  | 'grbg'
  | 'gbrg'
  | 'x-trans'
  | 'unsupported'

export type LumaRawCfaInfo = {
  pattern: LumaRawCfaPattern
  xPhase: 0 | 1 | 2 | 3 | 4 | 5
  yPhase: 0 | 1 | 2 | 3 | 4 | 5
}

export type LumaRawWindowRect = {
  x: number
  y: number
  width: number
  height: number
}

export type LumaRawExportUnsupportedReason =
  | 'unsupported-source'
  | 'unsupported-cfa'
  | 'compressed-raw-window-unavailable'
  | 'raw-window-unavailable'
  | 'missing-dimensions'
  | 'missing-levels'
  | 'missing-visible-crop'
  | 'unsupported-orientation'
  | 'missing-color-transform'
  | 'missing-export-facts'

export type LumaRawVisibleCrop = {
  x: number
  y: number
  width: number
  height: number
}

export type LumaRawExportOrientation = {
  code: number
  supported: boolean
}

export type LumaRawExportColorFacts = {
  whiteBalance: [number, number, number, number]
  cameraToWorkingRgb: [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ]
  workingSpace: 'linear-prophoto-rgb'
}

export type LumaRawExportCapability = {
  supported: boolean
  width: number
  height: number
  rawWidth: number
  rawHeight: number
  visibleCrop?: LumaRawVisibleCrop
  cfa: LumaRawCfaInfo
  blackLevel: number
  whiteLevel: number
  orientation?: LumaRawExportOrientation
  color?: LumaRawExportColorFacts
  reasons: LumaRawExportUnsupportedReason[]
}

export type LumaRawWindow = {
  rect: LumaRawWindowRect
  cfa: LumaRawCfaInfo
  data: Uint16Array
  blackLevel: number
  whiteLevel: number
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

export type LumaRawSessionInfo = {
  sessionId: string
  probe: LumaRawProbe
  timings: LumaRawTimings
  heap?: LumaRawHeapStats
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
  heap?: LumaRawHeapStats
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
  heap?: LumaRawHeapStats
}

export type LumaRawDecodeSession = LumaRawSessionInfo & {
  extractEmbeddedPreview: (
    signal?: AbortSignal,
  ) => Promise<LumaEmbeddedPreview | null>
  decodeQuick: (
    options?: LumaRawQuickOptions,
    signal?: AbortSignal,
  ) => Promise<LumaRawFrame>
  decodeHq: (signal?: AbortSignal) => Promise<LumaRawFrame>
  probeExportCapability: (
    signal?: AbortSignal,
  ) => Promise<LumaRawExportCapability>
  readRawWindow: (
    rect: LumaRawWindowRect,
    signal?: AbortSignal,
  ) => Promise<LumaRawWindow>
  dispose: () => void
}

export type LumaRawRuntime = {
  init: () => Promise<LumaRawRuntimeInfo>
  openSession: (
    file: File,
    options?: LumaRawQuickOptions,
    signal?: AbortSignal,
  ) => Promise<LumaRawDecodeSession>
  probe: (file: File, signal?: AbortSignal) => Promise<LumaRawProbe>
  extractEmbeddedPreview: (
    file: File,
    signal?: AbortSignal,
  ) => Promise<LumaEmbeddedPreview | null>
  decodeQuick: (file: File, signal?: AbortSignal) => Promise<LumaRawFrame>
  decodeHq: (file: File, signal?: AbortSignal) => Promise<LumaRawFrame>
  dispose: () => void
}
