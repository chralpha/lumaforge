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

export type LumaRawSensorLayout =
  | 'bayer'
  | 'x-trans'
  | 'foveon'
  | 'monochrome'
  | 'rgb-like'
  | 'unknown'

export type LumaRawFullResInputStrategy =
  | 'libraw-processed-window'
  | 'raw-mosaic-window'

export type LumaRawWindowRect = {
  x: number
  y: number
  width: number
  height: number
}

export type LumaRawExportUnsupportedReason =
  | 'libraw-open-failed'
  | 'libraw-unpack-failed'
  | 'libraw-cropbox-window-unavailable'
  | 'libraw-cropbox-not-repeatable'
  | 'orientation-transform-unimplemented'
  | 'unsupported-sensor-layout'
  | 'unsupported-cfa-pattern'
  | 'missing-visible-crop'
  | 'missing-levels'
  | 'missing-camera-white-balance'
  | 'missing-camera-to-output-color'
  | 'degenerate-camera-to-output-color'
  | 'processed-window-unavailable'
  | 'raw-window-unavailable-after-unpack'
  | 'jpeg-runtime-unavailable'
  | 'unsupported-source'
  | 'unsupported-cfa'
  | 'compressed-raw-window-unavailable'
  | 'raw-window-unavailable'
  | 'missing-dimensions'
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
  outputWidth?: number
  outputHeight?: number
}

export type LumaRawExportColorFacts = {
  workingSpace: 'linear-prophoto-rgb'
  librawOutputColor: 'prophoto'
  gamma: 'linear'
  cameraWhiteBalanceAppliedByRuntime: boolean
  cameraMatrixAppliedByRuntime: boolean
  whiteBalance?: [number, number, number, number]
  cameraToWorkingRgb?: [
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
}

export type LumaRawExportSensorFacts = {
  layout: LumaRawSensorLayout
  colorCount: number
  cfa?: LumaRawCfaInfo
  phaseIsWindowLocal: boolean
}

export type LumaRawExportLevelFacts = {
  black: number
  white: number
  perChannelBlack?: [number, number, number, number]
}

export type LumaRawExportWindowFacts = {
  librawProcessed: boolean
  rawMosaic: boolean
}

export type LumaRawExportDiagnostics = {
  make?: string
  model?: string
  normalizedMake?: string
  normalizedModel?: string
  librawFilterCode?: number
  hasRawImage: boolean
  hasColor3Image: boolean
  hasColor4Image: boolean
  hasXTransTable: boolean
  canRepeatCropProcess?: boolean
  lastLibRawWarningMask?: number
}

type LumaRawLegacyExportColorFacts = {
  whiteBalance: number[]
  cameraToWorkingRgb: number[]
  workingSpace: 'linear-prophoto-rgb'
}

export type LumaRawExportCapability = {
  supported: boolean
  strategy?: LumaRawFullResInputStrategy
  width: number
  height: number
  rawWidth: number
  rawHeight: number
  visibleCrop?: LumaRawVisibleCrop
  cfa: LumaRawCfaInfo
  blackLevel: number
  whiteLevel: number
  orientation?: number | LumaRawExportOrientation
  color?: LumaRawLegacyExportColorFacts | LumaRawExportColorFacts
  sensor: LumaRawExportSensorFacts
  levels?: LumaRawExportLevelFacts
  windows: LumaRawExportWindowFacts
  diagnostics: LumaRawExportDiagnostics
  reasons: LumaRawExportUnsupportedReason[]
}

export type LumaRawWindow = {
  rect: LumaRawWindowRect
  cfa: LumaRawCfaInfo
  data: Uint16Array
  blackLevel: number
  whiteLevel: number
}

export type LumaRawProcessedWindowRequest = {
  outputRect: LumaRawWindowRect
  halo: { left: number; top: number; right: number; bottom: number }
}

export type LumaRawProcessedWindow = {
  rect: LumaRawWindowRect
  workingSpace: 'linear-prophoto-rgb'
  data: Uint16Array
  width: number
  height: number
  stride: number
  normalized: false
  orientationApplied: true
  colorApplied: true
  warnings: string[]
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
  readProcessedWindow: (
    request: LumaRawProcessedWindowRequest,
    signal?: AbortSignal,
  ) => Promise<LumaRawProcessedWindow>
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
