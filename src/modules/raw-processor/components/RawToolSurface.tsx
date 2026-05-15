import type {
  LUTColorProfile,
  LUTProfileResolution,
  PreviewHistogramState,
} from '@lumaforge/luma-color-runtime'
import { Download, SlidersHorizontal, X } from 'lucide-react'
import type { ComponentProps } from 'react'
import { useCallback, useId, useRef, useState } from 'react'

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
import { LutContractTool } from './tools/lut/LutContractTool'
import type { StrengthLevel } from './tools/StrengthControl'
import { StrengthControl } from './tools/StrengthControl'
import type { ToneValue } from './tools/ToneTool'
import { ToneTool } from './tools/ToneTool'
import { ToolSection } from './tools/ToolSection'

type MobileToolPanel = 'style' | 'export'

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
      : mobilePanel === 'export'
        ? t('raw.mobileTools.export')
        : ''
  const { canExport, isProcessing, exportResult, onExport } = props
  const canStartMobileExport = canExport && !isProcessing && !exportResult
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [sheetDragY, setSheetDragY] = useState(0)
  const sheetDragStartRef = useRef<number | null>(null)
  const sheetRef = useRef<HTMLDivElement | null>(null)

  const handleMobilePanelToggle = useCallback((panel: MobileToolPanel) => {
    setMobilePanel((currentPanel) => (currentPanel === panel ? null : panel))
  }, [])

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }, [])

  const handleExportLongPressStart = useCallback(() => {
    clearLongPress()
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null
      if (canStartMobileExport) {
        onExport({ quality: 'high', fidelity: 'balanced' })
      }
    }, 500)
  }, [canStartMobileExport, clearLongPress, onExport])

  const handleSheetPointerDown = useCallback((event: React.PointerEvent) => {
    const el = event.currentTarget as HTMLElement
    el.setPointerCapture?.(event.pointerId)
    sheetDragStartRef.current = event.clientY
  }, [])

  const handleSheetPointerMove = useCallback((event: React.PointerEvent) => {
    if (sheetDragStartRef.current === null) return
    const delta = event.clientY - sheetDragStartRef.current
    setSheetDragY(Math.max(0, delta))
  }, [])

  const handleSheetPointerUp = useCallback((event: React.PointerEvent) => {
    const el = event.currentTarget as HTMLElement
    el.releasePointerCapture?.(event.pointerId)
    sheetDragStartRef.current = null

    const sheet = sheetRef.current
    const threshold = sheet ? Math.max(80, sheet.offsetHeight * 0.28) : 80

    if (sheetDragYRef.current > threshold) {
      setMobilePanel(null)
    }
    setSheetDragY(0)
  }, [])

  const handleSheetPointerCancel = useCallback((event: React.PointerEvent) => {
    const el = event.currentTarget as HTMLElement
    el.releasePointerCapture?.(event.pointerId)
    sheetDragStartRef.current = null
    setSheetDragY(0)
  }, [])

  const sheetDragYRef = useRef(sheetDragY)
  sheetDragYRef.current = sheetDragY

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
      <ToolSection
        title={t('raw.strength.title')}
        eyebrow={t('raw.strength.eyebrow')}
      >
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
        ref={sheetRef}
        className="raw-mobile-tool-sheet"
        style={
          sheetDragY > 0
            ? { transform: `translateY(${sheetDragY}px)`, transition: 'none' }
            : undefined
        }
      >
        <div
          className="raw-mobile-tool-sheet-top"
          onPointerDown={handleSheetPointerDown}
          onPointerMove={handleSheetPointerMove}
          onPointerUp={handleSheetPointerUp}
          onPointerCancel={handleSheetPointerCancel}
        >
          <div
            className="raw-mobile-tool-sheet-drag-handle"
            aria-hidden="true"
          />
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
        </div>
        <div className="raw-mobile-tool-sheet-scroll">
          {mobilePanel === 'style' &&
            renderStyleTools({ includeFileFacts: false })}
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
          className="raw-mobile-tool-tab raw-mobile-tool-tab-export"
          data-mobile-tool-tab="export"
          data-active={mobilePanel === 'export'}
          aria-disabled={!props.canExport || props.isProcessing}
          aria-expanded={mobilePanel === 'export'}
          aria-controls={mobileToolSheetId}
          onClick={() => handleMobilePanelToggle('export')}
          onPointerDown={handleExportLongPressStart}
          onPointerUp={clearLongPress}
          onPointerLeave={clearLongPress}
          onPointerCancel={clearLongPress}
        >
          <Download aria-hidden="true" />
          {t('raw.mobileTools.export')}
        </button>
      </nav>
    </aside>
  )
}
