import type {
  LUTColorProfile,
  LUTProfileResolution,
  PreviewHistogramState,
} from '@lumaforge/luma-color-runtime'
import { Download, GitCompare, SlidersHorizontal, X } from 'lucide-react'
import type { ComponentProps } from 'react'
import { useId, useState } from 'react'

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
import { CompareTool } from './tools/CompareTool'
import { ExportTool } from './tools/ExportTool'
import { FileFactsTool } from './tools/FileFactsTool'
import { HistogramTool } from './tools/HistogramTool'
import { LutContractTool } from './tools/LutContractTool'
import type { StrengthLevel } from './tools/StrengthControl'
import { StrengthControl } from './tools/StrengthControl'
import type { ToneValue } from './tools/ToneTool'
import { ToneTool } from './tools/ToneTool'
import { ToolSection } from './tools/ToolSection'

type MobileToolPanel = 'style' | 'compare' | 'export'

export function RawToolSurface(props: {
  activeIntensity: StrengthLevel
  tone: ToneValue
  onIntensitySelect: (level: StrengthLevel) => void
  onToneChange: (value: Partial<ToneValue>) => void
  onToneReset: () => void
  onCompareReset: () => void
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
  currentLutName?: string | null
  lutProfileSelection?: LUTProfileSelectionState | null
  lutProfileResolution?: LUTProfileResolution | null
  onlineLutSources?: UseOnlineLutSourcesResult
  supportLevel: 'official' | 'experimental'
  metadata: ComponentProps<typeof FileFactsTool>['metadata']
  stats: ComponentProps<typeof FileFactsTool>['stats']
}) {
  const { t } = useI18n()
  const [mobilePanel, setMobilePanel] = useState<MobileToolPanel | null>(null)
  const mobileToolSheetId = useId()
  const disabled = !props.hasImage || props.isProcessing
  const mobilePanelTitle =
    mobilePanel === 'style'
      ? t('raw.mobileTools.style')
      : mobilePanel === 'compare'
        ? t('raw.mobileTools.compare')
        : mobilePanel === 'export'
          ? t('raw.mobileTools.export')
          : ''
  const canStartMobileExport =
    props.canExport && !props.isProcessing && !props.exportResult

  const handleMobilePanelToggle = (panel: MobileToolPanel) => {
    setMobilePanel((currentPanel) => (currentPanel === panel ? null : panel))
  }

  const handleMobileExport = () => {
    setMobilePanel('export')

    if (!canStartMobileExport) return

    props.onExport({ quality: 'high', fidelity: 'balanced' })
  }

  const renderStyleTools = ({
    includeFileFacts = true,
  }: { includeFileFacts?: boolean } = {}) => (
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
      <ToneTool
        value={props.tone}
        disabled={disabled}
        onChange={props.onToneChange}
        onReset={props.onToneReset}
      />
      <HistogramTool histogram={props.histogram} />
      <ToolSection title={t('raw.strength.title')}>
        <StrengthControl
          value={props.activeIntensity}
          onChange={props.onIntensitySelect}
          disabled={disabled}
        />
      </ToolSection>
      {includeFileFacts && (
        <FileFactsTool
          supportLevel={props.supportLevel}
          metadata={props.metadata}
          stats={props.stats}
        />
      )}
    </>
  )

  const renderCompareTools = () => (
    <CompareTool disabled={disabled} onCompareReset={props.onCompareReset} />
  )

  const renderExportTools = () => (
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
    />
  )

  return (
    <aside
      className="raw-tool-surface"
      data-raw-tool-surface="raw-finishing"
      data-raw-tool-sheet={mobilePanel ? 'open' : 'closed'}
      data-raw-mobile-panel={mobilePanel ?? 'closed'}
      aria-label={t('raw.tools.aria')}
    >
      <div className="raw-tool-stack raw-tool-stack-desktop">
        {renderStyleTools({ includeFileFacts: false })}
        {renderCompareTools()}
        {renderExportTools()}
        <FileFactsTool
          supportLevel={props.supportLevel}
          metadata={props.metadata}
          stats={props.stats}
        />
      </div>

      <div
        id={mobileToolSheetId}
        className="raw-mobile-tool-sheet"
        hidden={!mobilePanel}
      >
        <div className="raw-mobile-tool-sheet-header">
          <h2>{mobilePanelTitle}</h2>
          <button
            type="button"
            className="raw-mobile-tool-sheet-close"
            aria-label={t('raw.mobileTools.close')}
            onClick={() => setMobilePanel(null)}
          >
            <X aria-hidden="true" />
          </button>
        </div>
        <div className="raw-mobile-tool-sheet-scroll">
          {mobilePanel === 'style' && renderStyleTools()}
          {mobilePanel === 'compare' && renderCompareTools()}
          {mobilePanel === 'export' && renderExportTools()}
        </div>
      </div>

      <nav
        className="raw-mobile-tool-rail"
        aria-label={t('raw.mobileTools.aria')}
      >
        <button
          type="button"
          className="raw-mobile-tool-tab"
          data-mobile-tool-tab="style"
          data-active={mobilePanel === 'style'}
          aria-expanded={mobilePanel === 'style'}
          aria-controls={mobileToolSheetId}
          onClick={() => handleMobilePanelToggle('style')}
        >
          <SlidersHorizontal aria-hidden="true" />
          {t('raw.mobileTools.style')}
        </button>
        <button
          type="button"
          className="raw-mobile-tool-tab"
          data-mobile-tool-tab="compare"
          data-active={mobilePanel === 'compare'}
          aria-expanded={mobilePanel === 'compare'}
          aria-controls={mobileToolSheetId}
          onClick={() => handleMobilePanelToggle('compare')}
        >
          <GitCompare aria-hidden="true" />
          {t('raw.mobileTools.compare')}
        </button>
        <button
          type="button"
          className="raw-mobile-tool-tab raw-mobile-tool-tab-export"
          data-mobile-tool-tab="export"
          data-active={mobilePanel === 'export'}
          aria-disabled={!props.canExport || props.isProcessing}
          aria-expanded={mobilePanel === 'export'}
          aria-controls={mobileToolSheetId}
          onClick={handleMobileExport}
        >
          <Download aria-hidden="true" />
          {t('raw.mobileTools.export')}
        </button>
      </nav>
    </aside>
  )
}
