import type {
  LUTColorProfile,
  LUTProfileResolution,
  PreviewHistogramState,
} from '@lumaforge/luma-color-runtime'
import { Download, SlidersHorizontal, X } from 'lucide-react'
import { AnimatePresence, m, useDragControls } from 'motion/react'
import type { ComponentProps, Ref } from 'react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'

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
import {
  BACKDROP_SPRING,
  SHEET_SPRING,
  TAP_SPRING,
  useToolMotion,
} from '../motion'
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
  const [mobileOpen, setMobileOpen] = useState(false)
  const [mobileSheetTarget, setMobileSheetTarget] = useState<
    'tools' | 'export'
  >('tools')
  const mobileToolSheetId = useId()
  const disabled = !props.hasImage || props.isProcessing
  const { canExport, isProcessing, exportResult, onExport } = props
  const canStartMobileExport = canExport && !isProcessing && !exportResult
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sheetRef = useRef<HTMLDivElement | null>(null)
  const mobileExportBlockRef = useRef<HTMLElement | null>(null)
  const dragControls = useDragControls()
  const { prefersReduced } = useToolMotion()

  const handleMobileToolsToggle = useCallback(() => {
    setMobileSheetTarget('tools')
    setMobileOpen((open) => !open)
  }, [])

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }, [])

  const handleMobileExportClick = useCallback(() => {
    clearLongPress()
    setMobileSheetTarget('export')
    setMobileOpen(true)
  }, [clearLongPress])

  const handleExportLongPressStart = useCallback(() => {
    clearLongPress()
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null
      if (canStartMobileExport) {
        onExport({ quality: 'high', fidelity: 'balanced' })
      }
    }, 500)
  }, [canStartMobileExport, clearLongPress, onExport])

  useEffect(() => {
    if (!mobileOpen || mobileSheetTarget !== 'export') return

    window.requestAnimationFrame(() => {
      if (typeof mobileExportBlockRef.current?.scrollIntoView !== 'function') {
        return
      }

      mobileExportBlockRef.current.scrollIntoView({
        block: 'nearest',
        behavior: prefersReduced ? 'auto' : 'smooth',
      })
    })
  }, [mobileOpen, mobileSheetTarget, prefersReduced])

  const histogramMeta =
    props.histogram.state === 'ready'
      ? `Shadows ${props.histogram.clipping.shadowAnyChannel} · Highlights ${props.histogram.clipping.highlightAnyChannel}`
      : undefined

  const renderCards = () => (
    <ToolCardStack ariaLabel={t('raw.tools.aria')}>
      <ToolCard id="look" title={t('raw.lutContract.title')}>
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
        <div className="mt-4">
          <StrengthControl
            value={props.activeIntensity}
            onChange={props.onIntensitySelect}
            disabled={disabled}
          />
        </div>
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
        <CompareTool
          disabled={disabled}
          onCompareReset={props.onCompareReset}
        />
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

  const renderExportBlock = (ref?: Ref<HTMLElement>) => (
    <section
      ref={ref}
      aria-label={t('raw.export.title')}
      data-raw-export-block="persistent"
      className="border-t border-border bg-material-medium px-4 py-3"
    >
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
    </section>
  )

  return (
    <aside
      className="raw-tool-surface grid min-h-0 grid-rows-[minmax(0,1fr)_auto] overflow-hidden border-l border-border bg-material-medium"
      data-raw-tool-surface="raw-finishing"
      data-raw-tool-sheet={mobileOpen ? 'open' : 'closed'}
      aria-label={t('raw.tools.aria')}
    >
      <div className="min-h-0 overflow-y-auto px-3.5 py-3.5 max-[640px]:hidden">
        {renderCards()}
      </div>
      <div className="max-[640px]:hidden">{renderExportBlock()}</div>

      <AnimatePresence>
        {mobileOpen && (
          <m.div
            key="backdrop"
            className="raw-mobile-tool-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={BACKDROP_SPRING}
            onClick={() => setMobileOpen(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {mobileOpen && (
          <m.div
            key="sheet"
            id={mobileToolSheetId}
            ref={sheetRef}
            data-raw-mobile-sheet
            className="raw-mobile-tool-sheet"
            initial={prefersReduced ? { opacity: 0 } : { y: '100%' }}
            animate={prefersReduced ? { opacity: 1 } : { y: '0%' }}
            exit={prefersReduced ? { opacity: 0 } : { y: '100%' }}
            transition={SHEET_SPRING}
            drag={prefersReduced ? false : 'y'}
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={(_, info) => {
              const sheet = sheetRef.current
              const threshold = sheet
                ? Math.max(80, sheet.offsetHeight * 0.28)
                : 80
              if (info.offset.y > threshold || info.velocity.y > 500) {
                setMobileOpen(false)
              }
            }}
          >
            <div
              className="raw-mobile-tool-sheet-top"
              onPointerDown={(e) => dragControls.start(e)}
            >
              <div
                className="raw-mobile-tool-sheet-drag-handle"
                aria-hidden="true"
              />
              <div className="raw-mobile-tool-sheet-header">
                <h2>{t('raw.mobileTools.tools')}</h2>
                <m.button
                  type="button"
                  className="raw-mobile-tool-sheet-close"
                  aria-label={t('raw.mobileTools.close')}
                  onClick={() => setMobileOpen(false)}
                  whileTap={{ scale: 0.92 }}
                  transition={TAP_SPRING}
                >
                  <X aria-hidden="true" />
                </m.button>
              </div>
            </div>
            <div className="raw-mobile-tool-sheet-scroll">
              {renderCards()}
              {renderExportBlock(mobileExportBlockRef)}
            </div>
          </m.div>
        )}
      </AnimatePresence>

      <nav
        className="raw-mobile-tool-rail"
        aria-label={t('raw.mobileTools.aria')}
      >
        <m.button
          type="button"
          className="raw-mobile-tool-tab"
          data-mobile-tool-tab="tools"
          data-active={mobileOpen}
          aria-expanded={mobileOpen}
          aria-controls={mobileToolSheetId}
          onClick={handleMobileToolsToggle}
          whileTap={{ scale: 0.96 }}
          transition={TAP_SPRING}
        >
          <SlidersHorizontal aria-hidden="true" />
          {t('raw.mobileTools.tools')}
        </m.button>
        <m.button
          type="button"
          className="raw-mobile-tool-tab raw-mobile-tool-tab-export"
          data-mobile-tool-tab="export"
          aria-disabled={!props.canExport || props.isProcessing}
          onPointerDown={handleExportLongPressStart}
          onPointerUp={clearLongPress}
          onPointerLeave={clearLongPress}
          onPointerCancel={clearLongPress}
          onClick={handleMobileExportClick}
          whileTap={{ scale: 0.96 }}
          transition={TAP_SPRING}
        >
          <Download aria-hidden="true" />
          {t('raw.mobileTools.export')}
        </m.button>
      </nav>
    </aside>
  )
}
