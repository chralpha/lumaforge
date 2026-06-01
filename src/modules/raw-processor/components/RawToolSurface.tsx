import type {
  LUTColorProfile,
  LUTContractResolution,
  PreviewHistogramState,
} from '@lumaforge/luma-color-runtime'
import type { ComponentProps, ReactNode } from 'react'
import { useState } from 'react'

import { useScrollEdgeFade, useViewport } from '~/hooks/common'
import { useI18n } from '~/lib/i18n'

import type { UseOnlineLutSourcesResult } from '../hooks/useOnlineLutSources'
import type {
  ExportResult,
  ExportShareCapability,
} from '../model/export-result'
import type {
  ExportRecoveryState,
  LUTContractSelectionState,
} from '../model/session'
import { MobileRawToolSurface } from './mobile/MobileRawToolSurface'
import type { RawRuntimeReadinessState } from './raw-runtime-readiness'
import { AdjustTool } from './tools/AdjustTool'
import type { ColorValue } from './tools/ColorTool'
import { CompareTool } from './tools/CompareTool'
import { ExportTool } from './tools/ExportTool'
import { FileFactsTool } from './tools/FileFactsTool'
import { HistogramTool } from './tools/HistogramTool'
import { LutContractTool } from './tools/lut/LutContractTool'
import type { StrengthLevel } from './tools/StrengthControl'
import { StrengthControl } from './tools/StrengthControl'
import type { ToneValue } from './tools/ToneTool'
import { ToolCard, ToolCardStack } from './tools/ToolCard'

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
  const { t } = useI18n()
  const isMobileViewport = useViewport(selectIsNarrowViewport)
  const previewSuspended = props.previewSuspended === true
  const editorDisabled =
    !props.hasImage || props.isExporting === true || previewSuspended
  const lutDropDisabled = props.isExporting === true || previewSuspended
  const hasAppliedLut = Boolean(props.currentLutName)
  const strengthDisabled = editorDisabled || !hasAppliedLut

  const histogramMeta =
    props.histogram.state === 'ready'
      ? `Shadows ${props.histogram.clipping.shadowAnyChannel} · Highlights ${props.histogram.clipping.highlightAnyChannel}`
      : undefined

  const strengthControl = (
    <StrengthControl
      value={props.activeIntensity}
      onChange={props.onIntensitySelect}
      disabled={strengthDisabled}
    />
  )

  // Desktop Look card — full LutContractTool + a labelled Strength row.
  // Mobile renders the same StrengthControl under its own heading inside
  // MobileLutBrowser; both ends share the component's default styling so
  // the segmented control reads identically on dark photo-first chrome.
  const lutBlock = (
    <>
      <LutContractTool
        currentLutName={props.currentLutName}
        disabled={lutDropDisabled}
        onLutLoad={props.onLutLoad}
        onLutClear={props.onLutClear}
        lutProfileSelection={props.lutProfileSelection}
        lutProfileResolution={props.lutProfileResolution}
        onLutProfileSelect={props.onLutProfileSelect}
        onlineLutSources={props.onlineLutSources}
      />
      <div className="mt-3 grid gap-1.5" data-raw-desktop-strength="row">
        <span className="text-[0.7rem] font-semibold uppercase tracking-[0.04em] text-lf-on-photo-ink/56">
          {t('raw.strength.title')}
        </span>
        {strengthControl}
      </div>
    </>
  )

  const compareBlock = (
    <CompareTool
      disabled={editorDisabled}
      onCompareReset={props.onCompareReset}
    />
  )

  const exportBlock = (
    <ExportTool
      canExport={props.canExport}
      disabledReason={props.disabledReason}
      canPreviewExport={props.canPreviewExport}
      previewExportDisabledReason={props.previewExportDisabledReason}
      isProcessing={props.isProcessing}
      onExport={props.onExport}
      onPreviewExport={props.onPreviewExport}
      exportResult={props.exportResult}
      exportShareCapability={props.exportShareCapability}
      recovery={props.recovery}
      onShareExport={props.onShareExport}
      onDownloadExport={props.onDownloadExport}
      onCopyExport={props.onCopyExport}
      onRecoverExportSource={props.onRecoverExportSource}
      embedded
    />
  )

  const renderCards = () => (
    <ToolCardStack ariaLabel={t('raw.tools.aria')}>
      <ToolCard
        id="histogram"
        title={t('raw.histogram.title')}
        meta={histogramMeta}
      >
        <HistogramTool histogram={props.histogram} />
      </ToolCard>
      <ToolCard id="look" title={t('raw.lutContract.title')}>
        {lutBlock}
      </ToolCard>
      <ToolCard id="adjust" title={t('raw.adjust.title')}>
        <AdjustTool
          tone={props.tone}
          color={props.color}
          disabled={editorDisabled}
          onToneChange={props.onToneChange}
          onToneReset={props.onToneReset}
          onColorChange={props.onColorChange}
          onColorReset={props.onColorReset}
        />
      </ToolCard>
      <ToolCard id="compare" title={t('raw.compare.title')}>
        {compareBlock}
      </ToolCard>
      <ToolCard id="fileFacts" title={t('raw.fileFacts.title')}>
        <FileFactsTool
          supportLevel={props.supportLevel}
          metadata={props.metadata}
          stats={props.stats}
        />
      </ToolCard>
    </ToolCardStack>
  )

  const renderExportBlock = () => (
    <section
      aria-label={t('raw.export.title')}
      data-raw-export-block="persistent"
      data-raw-export-ready={props.canExport ? 'true' : 'false'}
      className="grid min-h-[104px] content-center bg-lf-on-photo-bg px-3 py-3"
    >
      {exportBlock}
    </section>
  )

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

  return (
    <DesktopToolAside
      ariaLabel={t('raw.tools.aria')}
      exportBlock={renderExportBlock()}
    >
      {renderCards()}
    </DesktopToolAside>
  )
}

function DesktopToolAside({
  ariaLabel,
  children,
  exportBlock,
}: {
  ariaLabel: string
  children: ReactNode
  exportBlock: ReactNode
}) {
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null)
  useScrollEdgeFade(scrollEl)

  return (
    <aside
      className="raw-tool-surface relative grid min-h-0 min-w-0 grid-rows-[minmax(0,1fr)_auto] gap-0 overflow-hidden bg-lf-on-photo-bg-strong p-0 text-lf-on-photo-ink backdrop-blur-background max-[980px]:max-h-[min(42svh,390px)]"
      data-raw-tool-surface="raw-finishing"
      data-raw-desktop-chrome="on-photo-tools"
      data-raw-desktop-density="linear-compact"
      data-raw-desktop-input="mouse-keyboard"
      aria-label={ariaLabel}
    >
      <div
        ref={setScrollEl}
        className="min-h-0 overflow-y-auto [scrollbar-gutter:stable] px-2.5 py-2"
        data-raw-tool-scroll
      >
        {children}
      </div>
      <div>{exportBlock}</div>
    </aside>
  )
}
