import type {
  LumaRawExportCapability,
  LumaRawWindow,
  LumaRawWindowRect,
} from '../src/types'

export type LumaRawNativeMetadata = {
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
}

export type LumaRawNativeThumbnail = {
  data: Uint8Array
  width: number
  height: number
  format: 'jpeg' | 'bitmap' | 'unknown'
}

export type LumaRawNativeImage = {
  data: Uint16Array
  width: number
  height: number
  bits: 16
}

export type LumaRawNativeOpenSettings = {
  halfSize: boolean
  useCameraWb: true
  outputColor: 4
  outputBps: 16
  noAutoBright: true
  userQual: number
  gamm: [1, 1, 1, 1, 0, 0]
}

export type LumaRawNativeOpenTimings = {
  copyToWasm: number
  librawOpen: number
}

export type LumaRawNativeDecodeOptions = {
  maxOutputPixels?: number
}

export type LumaRawNativeExportCapability = LumaRawExportCapability

export type LumaRawNativeProcessor = {
  loadBuffer: (data: Uint8Array) => Pick<LumaRawNativeOpenTimings, 'copyToWasm'>
  openWithSettings: (
    settings: LumaRawNativeOpenSettings,
  ) => LumaRawNativeOpenTimings
  openBuffer: (
    data: Uint8Array,
    settings: LumaRawNativeOpenSettings,
  ) => LumaRawNativeOpenTimings | undefined
  readMetadata: () => LumaRawNativeMetadata
  extractThumbnail: () => LumaRawNativeThumbnail | undefined
  probeExportCapability?: () => LumaRawNativeExportCapability
  readRawWindow?: (rect: LumaRawWindowRect) => LumaRawWindow
  decodePreview: (options?: LumaRawNativeDecodeOptions) => LumaRawNativeImage
  decodeHq: (options?: LumaRawNativeDecodeOptions) => LumaRawNativeImage
  dispose: () => void
}

export type LumaRawNativeFactory = {
  createProcessor: () => LumaRawNativeProcessor
  heapBytes?: () => number | undefined
}
