import type { LUTColorProfile } from '~/lib/color/registry'
import type { LUTInputProfile, LUTProfileResolution } from '~/lib/gl/pipeline'

export type SupportLevel = 'official' | 'experimental' | 'unsupported'
export type PreviewStatus = 'idle' | 'loading' | 'ready' | 'failed'
export type DisplaySource = 'embedded' | 'quick' | 'hq' | 'none'
export type IntensityLevel = 'off' | 'light' | 'standard' | 'strong'
export type ExportFidelity = 'safe' | 'balanced' | 'max'
export type FullResExportCapabilityState =
  | { status: 'unknown' }
  | { status: 'probing' }
  | { status: 'supported'; width: number; height: number }
  | { status: 'unsupported'; reason: string }

export type LUTProfileSelectionState =
  | {
      status: 'pending'
      fingerprint: string
      title: string
      sourceName?: string
      suggestions: LUTColorProfile[]
    }
  | {
      status: 'resolved'
      fingerprint: string
      profileId: string
      confidence: Extract<
        LUTProfileResolution,
        { kind: 'resolved' }
      >['confidence']
    }

export type PreviewAsset = {
  status: PreviewStatus
  width?: number
  height?: number
  bitmap?: ImageBitmap | null
  objectUrl?: string
  mimeType?: string
  timings?: Record<string, number | undefined>
  errorCode?: string
}

export type PreviewBundle = {
  embeddedPreview: PreviewAsset
  quickDecodePreview: PreviewAsset
  hqImage: PreviewAsset
  displaySource: DisplaySource
  hqRequiredForExport: false
}

export type StyleAsset = {
  kind: 'builtin' | 'custom'
  name: string
  defaultIntensityLevel: Exclude<IntensityLevel, 'off'>
  currentIntensityLevel: IntensityLevel
  warning?: string
  lutAsset?: {
    format: 'cube'
    dimension: 17 | 33 | 65
    title?: string
    sourceName?: string
    fingerprint?: string
    inputProfile?: LUTInputProfile
    profileResolution?: LUTProfileResolution
  }
  inputPrepProfile?: {
    profileId: string
    description: string
  }
}

export type ImageSession = {
  id: string
  createdAt: number
  sourceFile: {
    name: string
    extension: string
    sizeBytes: number
    rawFormat?: string
    cameraBrand?: string
    cameraModel?: string
    width?: number
    height?: number
    supportLevel: SupportLevel
  }
  previewBundle: PreviewBundle
  activeStyle: StyleAsset | null
  lutProfileSelection?: LUTProfileSelectionState
  viewState: {
    mode: 'processed' | 'original' | 'compare'
    compareSplit: number
    zoom: number
    panX: number
    panY: number
    fitMode: 'screen' | 'custom'
  }
  renderState: {
    status: 'idle' | 'preparing' | 'rendering' | 'ready' | 'failed'
    lastRenderSource?: Exclude<DisplaySource, 'none'>
    lastErrorCode?: string
  }
  exportState: {
    status: 'idle' | 'preparing' | 'exporting' | 'done' | 'failed'
    qualityPreset: 'standard' | 'high'
    fidelityLevel: ExportFidelity
    fullResCapability: FullResExportCapabilityState
    lastProgress?: {
      completedStrips: number
      totalStrips: number
    }
    recommendedRetryLevel?: Extract<ExportFidelity, 'safe' | 'balanced'>
    lastSuccessfulSize?: { width: number; height: number }
    lastErrorCode?: string
    retryRecommended: boolean
  }
}
