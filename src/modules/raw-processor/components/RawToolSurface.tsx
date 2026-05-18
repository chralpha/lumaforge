import type {
  LUTColorProfile,
  LUTProfileResolution,
  PreviewHistogramState,
} from '@lumaforge/luma-color-runtime'
import type { ComponentProps } from 'react'

import { useViewport } from '~/hooks/common'
import { useI18n } from '~/lib/i18n'

import type { UseOnlineLutSourcesResult } from '../hooks/useOnlineLutSources'
import type {
  ExportResult,
  ExportShareCapability,
} from '../model/export-result'
import type {
  ExportRecoveryState,
  LUTProfileSelectionState,
} from '../model/session'
import { MobileLabChrome } from './mobile/MobileLabChrome'
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
  canExport: boolean
  disabledReason?: string
  isProcessing: boolean
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
  lutProfileSelection?: LUTProfileSelectionState | null
  lutProfileResolution?: LUTProfileResolution | null
  onlineLutSources?: UseOnlineLutSourcesResult
  supportLevel: 'official' | 'experimental'
  metadata: ComponentProps<typeof FileFactsTool>['metadata']
  stats: ComponentProps<typeof FileFactsTool>['stats']
}) {
  const { t } = useI18n()
  const isMobileViewport = useViewport(selectIsNarrowViewport)
  const disabled = !props.hasImage || props.isProcessing

  const histogramMeta =
    props.histogram.state === 'ready'
      ? `Shadows ${props.histogram.clipping.shadowAnyChannel} · Highlights ${props.histogram.clipping.highlightAnyChannel}`
      : undefined

  const strengthControl = (
    <StrengthControl
      value={props.activeIntensity}
      onChange={props.onIntensitySelect}
      disabled={disabled}
    />
  )

  // Desktop Look card — full LutContractTool + Strength (unchanged).
  const lutBlock = (
    <>
      <LutContractTool
        currentLutName={props.currentLutName}
        disabled={props.isProcessing}
        onLutLoad={props.onLutLoad}
        onLutClear={props.onLutClear}
        lutProfileSelection={props.lutProfileSelection}
        lutProfileResolution={props.lutProfileResolution}
        onLutProfileSelect={props.onLutProfileSelect}
        onlineLutSources={props.onlineLutSources}
      />
      <div className="mt-3">{strengthControl}</div>
    </>
  )

  // Mobile Look mode uses a compact Strength + a full-height LUT browser
  // sheet instead of the desktop popovers.
  const mobileLutBrowser = {
    currentLutName: props.currentLutName,
    disabled: props.isProcessing,
    onLutLoad: props.onLutLoad,
    onLutClear: props.onLutClear,
    lutProfileSelection: props.lutProfileSelection,
    lutProfileResolution: props.lutProfileResolution,
    onLutProfileSelect: props.onLutProfileSelect,
    onlineLutSources: props.onlineLutSources,
  }

  const compareBlock = (
    <CompareTool disabled={disabled} onCompareReset={props.onCompareReset} />
  )

  const exportBlock = (
    <ExportTool
      canExport={props.canExport}
      disabledReason={props.disabledReason}
      isProcessing={props.isProcessing}
      onExport={props.onExport}
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
      <ToolCard id="look" title={t('raw.lutContract.title')}>
        {lutBlock}
      </ToolCard>
      <ToolCard id="tone" title={t('raw.tone.title')}>
        <ToneTool
          value={props.tone}
          disabled={disabled}
          onChange={props.onToneChange}
          onReset={props.onToneReset}
        />
      </ToolCard>
      <ToolCard
        id="histogram"
        title={t('raw.histogram.title')}
        meta={histogramMeta}
      >
        <HistogramTool histogram={props.histogram} />
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
      className="border-t border-border bg-material-medium px-3.5 py-3"
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
      { index: 1, label: t('raw.fileFacts.title'), timing: '—' },
      { index: 2, label: t('raw.tone.title'), timing: '—' },
      {
        index: 3,
        label: props.currentLutName ?? t('raw.mobile.more.lutHeading'),
        timing: '—',
      },
      { index: 4, label: 'Rec.709', timing: renderTime },
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
      <div className="fixed inset-0 z-30" data-raw-mobile-lab>
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
          strengthControl={strengthControl}
          lutBrowser={mobileLutBrowser}
          comparePanel={compareBlock}
          exportPanel={exportBlock}
          moreSheet={moreSheet}
        />
      </div>
    )
  }

  return (
    <aside
      className="raw-tool-surface grid min-h-0 grid-rows-[minmax(0,1fr)_auto] overflow-hidden border-l border-border bg-material-medium"
      data-raw-tool-surface="raw-finishing"
      aria-label={t('raw.tools.aria')}
    >
      <div className="min-h-0 overflow-y-auto px-3.5 py-3.5">
        {renderCards()}
      </div>
      <div>{renderExportBlock()}</div>
    </aside>
  )
}
