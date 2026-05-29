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
import { MobileExportPanel } from './mobile/MobileExportPanel'
import { MobileLabChrome } from './mobile/MobileLabChrome'
import type { RawRuntimeReadinessState } from './raw-runtime-readiness'
import { CompareTool } from './tools/CompareTool'
import { ExportTool } from './tools/ExportTool'
import { FileFactsTool } from './tools/FileFactsTool'
import { HistogramTool } from './tools/HistogramTool'
import { LutContractTool } from './tools/lut/LutContractTool'
import type { StrengthLevel } from './tools/StrengthControl'
import { StrengthControl } from './tools/StrengthControl'
import type { ToneValue } from './tools/ToneTool'
import { ToneTool } from './tools/ToneTool'
import { ToolCard, ToolCardStack } from './tools/ToolCard'

const selectIsNarrowViewport = (v: { w: number }) => v.w <= 640 && v.w !== 0

export function RawToolSurface(props: {
  activeIntensity: StrengthLevel
  tone: ToneValue
  onIntensitySelect: (level: StrengthLevel) => void
  onToneChange: (value: Partial<ToneValue>) => void
  onToneReset: () => void
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
}) {
  const { t } = useI18n()
  const isMobileViewport = useViewport(selectIsNarrowViewport)
  const previewSuspended = props.previewSuspended === true
  const editorDisabled =
    !props.hasImage || props.isExporting === true || previewSuspended
  const lutDropDisabled = props.isExporting === true || previewSuspended
  const mobileEditorDisabled =
    !props.hasImage || props.isProcessing || previewSuspended
  const hasAppliedLut = Boolean(props.currentLutName)
  const strengthDisabled = editorDisabled || !hasAppliedLut
  const mobileStrengthDisabled = mobileEditorDisabled || !hasAppliedLut

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
        <span className="text-[0.7rem] font-semibold uppercase tracking-[0.04em] text-lf-hero-ink/56">
          {t('raw.strength.title')}
        </span>
        {strengthControl}
      </div>
    </>
  )

  // Mobile Look mode uses a compact Strength + a full-height LUT browser
  // sheet instead of the desktop popovers.
  const mobileLutBrowser = {
    currentLutName: props.currentLutName,
    disabled: props.isProcessing || lutDropDisabled,
    onLutLoad: props.onLutLoad,
    onLutClear: props.onLutClear,
    lutProfileSelection: props.lutProfileSelection,
    lutProfileResolution: props.lutProfileResolution,
    onLutProfileSelect: props.onLutProfileSelect,
    onlineLutSources: props.onlineLutSources,
    activeIntensity: props.activeIntensity,
    onIntensitySelect: props.onIntensitySelect,
    strengthDisabled: mobileStrengthDisabled,
  }

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

  const mobileExportBlock = (
    <MobileExportPanel
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
      <ToolCard id="tone" title={t('raw.tone.title')}>
        <ToneTool
          value={props.tone}
          disabled={editorDisabled}
          onChange={props.onToneChange}
          onReset={props.onToneReset}
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

  const cameraName =
    props.metadata &&
    `${props.metadata.make ?? ''} ${props.metadata.model ?? ''}`.trim()
  const fileMeta = [
    cameraName || undefined,
    props.supportLevel === 'official'
      ? t('raw.mobile.more.officialSupport')
      : undefined,
  ]
    .filter(Boolean)
    .join(' · ')

  const renderTime = props.stats
    ? `${Math.round(props.stats.processTime)} ms`
    : '—'
  const lutResolved =
    props.lutProfileResolution?.kind === 'resolved'
      ? props.lutProfileResolution.profile.role
      : props.lutProfileResolution?.kind === 'needs-user-selection'
        ? t('raw.histogram.notLoaded')
        : '—'
  const moreSheet = {
    pipelineSteps: [
      { index: 1, label: 'RAW decode', timing: '—' },
      { index: 2, label: t('raw.tone.title'), timing: '—' },
      {
        index: 3,
        label: props.currentLutName ?? t('raw.mobile.more.lutHeading'),
        timing: '—',
      },
      { index: 4, label: 'JPEG output', timing: renderTime },
    ],
    lutRows: [
      {
        label: t('raw.mobile.more.lutHeading'),
        value: props.currentLutName ?? '—',
      },
      { label: t('raw.fileFacts.support'), value: lutResolved },
    ],
    fileRows: [
      { label: t('raw.fileFacts.camera'), value: cameraName || '—' },
      {
        label: t('raw.fileFacts.size'),
        value: props.metadata
          ? `${props.metadata.width} x ${props.metadata.height}`
          : '—',
      },
      {
        label: t('raw.fileFacts.preview'),
        value: props.stats
          ? `${props.stats.previewSize.width} x ${props.stats.previewSize.height}`
          : '—',
      },
      { label: t('raw.fileFacts.render'), value: renderTime },
    ],
  }

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
        <MobileLabChrome
          hasImage={props.hasImage}
          tone={props.tone}
          onToneChange={props.onToneChange}
          onToneReset={props.onToneReset}
          viewMode={props.viewMode}
          onViewModeChange={props.onViewModeChange}
          histogram={props.histogram}
          fileName={props.fileName}
          fileMeta={fileMeta || props.fileName}
          supportLevel={props.supportLevel}
          onReplaceFile={props.onReplaceFile}
          onResetSession={props.onResetSession}
          isProcessing={props.isProcessing}
          runtimeReadinessState={props.runtimeReadinessState}
          onPrepareRuntime={props.onPrepareRuntime}
          lutBrowser={mobileLutBrowser}
          onCompareReset={props.onCompareReset}
          exportPanel={mobileExportBlock}
          moreSheet={moreSheet}
          previewSuspended={previewSuspended}
          preferExportMode={previewSuspended && props.exportResult != null}
          previewFrameEl={props.previewFrameEl ?? null}
        />
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
      className="raw-tool-surface relative grid min-h-0 min-w-0 grid-rows-[minmax(0,1fr)_auto] gap-0 overflow-hidden bg-lf-on-photo-bg-strong p-0 text-lf-hero-ink backdrop-blur-background max-[980px]:max-h-[min(42svh,390px)]"
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
