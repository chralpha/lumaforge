import type {
  LUTColorProfile,
  LUTContractResolution,
  PreviewHistogramState,
} from '@lumaforge/luma-color-runtime'
import type { ComponentProps } from 'react'

import { useViewport } from '~/hooks/common'

import type { UseOnlineLutSourcesResult } from '../hooks/useOnlineLutSources'
import type {
  ExportResult,
  ExportShareCapability,
} from '../model/export-result'
import type {
  ExportRecoveryState,
  LUTContractSelectionState,
} from '../model/session'
import { DesktopRawToolSurface } from './DesktopRawToolSurface'
import { MobileRawToolSurface } from './mobile/MobileRawToolSurface'
import type { RawRuntimeReadinessState } from './raw-runtime-readiness'
import type { ColorValue } from './tools/ColorTool'
import type { FileFactsTool } from './tools/FileFactsTool'
import type { StrengthLevel } from './tools/StrengthControl'
import type { ToneValue } from './tools/ToneTool'

const selectIsNarrowViewport = (v: { w: number }) => v.w <= 640 && v.w !== 0

export interface RawToolSurfaceProps {
  activeIntensity: StrengthLevel
  tone: ToneValue
  color: ColorValue
  onIntensitySelect: (level: StrengthLevel) => void
  onToneChange: (value: Partial<ToneValue>) => void
  onToneReset: () => void
  onColorChange: (value: Partial<ColorValue>) => void
  onColorReset: () => void
  onCompareReset: () => void
  viewMode: 'processed' | 'original' | 'compare'
  onViewModeChange: (mode: 'processed' | 'original' | 'compare') => void
  compareSplit: number
  onCompareSplitChange: (split: number) => void
  onLutLoad: (files: File[]) => void
  onLutClear: () => void
  onLutProfileSelect: (profile: LUTColorProfile) => void
  onExport: (options: {
    quality: 'standard' | 'high'
    fidelity: 'safe' | 'balanced' | 'max'
  }) => void
  canPreviewExport?: boolean
  previewExportDisabledReason?: string
  onPreviewExport?: () => void | Promise<void>
  canExport: boolean
  disabledReason?: string
  isProcessing: boolean
  isExporting?: boolean
  runtimeReadinessState?: RawRuntimeReadinessState
  onPrepareRuntime?: () => void
  previewSuspended?: boolean
  exportResult: ExportResult | null
  exportShareCapability: ExportShareCapability
  histogram: PreviewHistogramState
  recovery?: ExportRecoveryState
  onShareExport: () => void
  onDownloadExport: () => void
  onCopyExport: () => void
  onRecoverExportSource?: () => void
  hasImage: boolean
  fileName: string
  onReplaceFile: () => void
  onResetSession: () => void
  currentLutName?: string | null
  lutProfileSelection?: LUTContractSelectionState | null
  lutProfileResolution?: LUTContractResolution | null
  onlineLutSources?: UseOnlineLutSourcesResult
  supportLevel: 'official' | 'experimental'
  metadata: ComponentProps<typeof FileFactsTool>['metadata']
  stats: ComponentProps<typeof FileFactsTool>['stats']
  /**
   * The interactive preview frame element. Mobile chrome attaches gesture
   * listeners (long-press peek, tap toggles immersive) directly to this
   * element so multi-touch pinch/pan keeps working on the same target.
   */
  previewFrameEl?: HTMLDivElement | null
}

export function RawToolSurface(props: RawToolSurfaceProps) {
  const isMobileViewport = useViewport(selectIsNarrowViewport)

  if (isMobileViewport) {
    // Photo-first scaffold is ALWAYS present on mobile — even before a RAW
    // is loaded — so the topbar + toolbar are consistent from the first
    // screen (the layout never "appears" after upload). When there is no
    // image MobileLabChrome renders an empty, inert configuration over the
    // full-bleed dark guided stage dropzone.
    return (
      <div
        className="pointer-events-none fixed inset-0 z-30"
        data-raw-mobile-lab
      >
        <MobileRawToolSurface {...props} />
      </div>
    )
  }

  return <DesktopRawToolSurface {...props} />
}
