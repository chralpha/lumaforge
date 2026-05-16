import type {
  LUTColorProfile,
  LUTProfileResolution,
  PreviewHistogramState,
} from '@lumaforge/luma-color-runtime'
import { Download, SlidersHorizontal, X } from 'lucide-react'
import { AnimatePresence, m, useDragControls } from 'motion/react'
import type { ComponentProps, Ref } from 'react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'

import { clsxm } from '~/lib/cn'
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
import type { ToolCardId } from '../state/tool-card.atoms'
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
  const [mobileOpenCards, setMobileOpenCards] = useState<ToolCardId[]>(['look'])
  const [mobileScrollHint, setMobileScrollHint] = useState(false)
  const mobileToolSheetId = useId()
  const disabled = !props.hasImage || props.isProcessing
  const { canExport, isProcessing, exportResult, onExport } = props
  const canStartMobileExport = canExport && !isProcessing && !exportResult
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressTriggeredRef = useRef(false)
  const sheetRef = useRef<HTMLDivElement | null>(null)
  const mobileScrollRef = useRef<HTMLDivElement | null>(null)
  const dragControls = useDragControls()
  const { prefersReduced } = useToolMotion()
  const mobileContentTransition = prefersReduced
    ? undefined
    : { type: 'spring' as const, duration: 0.22, bounce: 0 }
  const mobilePanelTitle =
    mobilePanel === 'style'
      ? t('raw.mobileTools.style')
      : mobilePanel === 'export'
        ? t('raw.mobileTools.export')
        : ''

  const handleMobilePanelToggle = useCallback((panel: MobileToolPanel) => {
    setMobilePanel((currentPanel) => (currentPanel === panel ? null : panel))
  }, [])

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }, [])

  const handleMobileExportClick = useCallback(() => {
    clearLongPress()
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false
      return
    }
    handleMobilePanelToggle('export')
  }, [clearLongPress, handleMobilePanelToggle])

  const handleMobileStyleClick = useCallback(() => {
    handleMobilePanelToggle('style')
  }, [handleMobilePanelToggle])

  const closeMobilePanel = useCallback(() => {
    setMobilePanel(null)
  }, [])

  const updateMobileScrollHint = useCallback(() => {
    const scroller = mobileScrollRef.current
    if (!scroller) {
      setMobileScrollHint(false)
      return
    }

    setMobileScrollHint(
      scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight > 2,
    )
  }, [])

  const handleExportLongPressStart = useCallback(() => {
    clearLongPress()
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null
      if (canStartMobileExport) {
        longPressTriggeredRef.current = true
        onExport({ quality: 'high', fidelity: 'balanced' })
      }
    }, 500)
  }, [canStartMobileExport, clearLongPress, onExport])

  const histogramMeta =
    props.histogram.state === 'ready'
      ? `Shadows ${props.histogram.clipping.shadowAnyChannel} · Highlights ${props.histogram.clipping.highlightAnyChannel}`
      : undefined

  useEffect(() => {
    if (!mobilePanel) {
      setMobileScrollHint(false)
      return
    }

    const firstFrame = window.requestAnimationFrame(() => {
      updateMobileScrollHint()
      window.requestAnimationFrame(updateMobileScrollHint)
    })
    const scroller = mobileScrollRef.current
    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(updateMobileScrollHint)

    if (scroller && resizeObserver) {
      resizeObserver.observe(scroller)
      if (scroller.firstElementChild) {
        resizeObserver.observe(scroller.firstElementChild)
      }
    }

    return () => {
      window.cancelAnimationFrame(firstFrame)
      resizeObserver?.disconnect()
    }
  }, [mobileOpenCards, mobilePanel, updateMobileScrollHint])

  const renderCards = ({ mobile = false }: { mobile?: boolean } = {}) => (
    <ToolCardStack
      ariaLabel={t('raw.tools.aria')}
      className={mobile ? 'raw-mobile-tool-card-stack' : undefined}
      value={mobile ? mobileOpenCards : undefined}
      onValueChange={mobile ? setMobileOpenCards : undefined}
    >
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
      data-raw-tool-sheet={mobilePanel ? 'open' : 'closed'}
      data-raw-mobile-panel={mobilePanel ?? 'closed'}
      aria-label={t('raw.tools.aria')}
    >
      <div className="min-h-0 overflow-y-auto px-3.5 py-3.5 max-[640px]:hidden">
        {renderCards()}
      </div>
      <div className="max-[640px]:hidden">{renderExportBlock()}</div>

      <AnimatePresence>
        {mobilePanel && (
          <m.div
            key="backdrop"
            data-raw-mobile-backdrop
            className="raw-mobile-tool-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={BACKDROP_SPRING}
            onClick={closeMobilePanel}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {mobilePanel && (
          <m.div
            key="sheet"
            id={mobileToolSheetId}
            ref={sheetRef}
            data-raw-mobile-sheet
            className="raw-mobile-tool-sheet"
            layout="size"
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
                closeMobilePanel()
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
                <h2>{mobilePanelTitle}</h2>
                <m.button
                  type="button"
                  className="raw-mobile-tool-sheet-close"
                  aria-label={t('raw.mobileTools.close')}
                  onClick={closeMobilePanel}
                  whileTap={{ scale: 0.92 }}
                  transition={TAP_SPRING}
                >
                  <X aria-hidden="true" />
                </m.button>
              </div>
            </div>
            <div
              className="raw-mobile-tool-sheet-scroll-shell"
              data-scroll-more={mobileScrollHint}
            >
              <div
                ref={mobileScrollRef}
                className="raw-mobile-tool-sheet-scroll"
                onScroll={updateMobileScrollHint}
              >
                <AnimatePresence mode="popLayout" initial={false}>
                  {mobilePanel === 'style' && (
                    <m.div
                      key="style"
                      layout
                      initial={prefersReduced ? false : { opacity: 0, y: 6 }}
                      animate={
                        prefersReduced ? undefined : { opacity: 1, y: 0 }
                      }
                      exit={prefersReduced ? undefined : { opacity: 0, y: -4 }}
                      transition={mobileContentTransition}
                    >
                      {renderCards({ mobile: true })}
                    </m.div>
                  )}
                  {mobilePanel === 'export' && (
                    <m.div
                      key="export"
                      layout
                      initial={prefersReduced ? false : { opacity: 0, y: 6 }}
                      animate={
                        prefersReduced ? undefined : { opacity: 1, y: 0 }
                      }
                      exit={prefersReduced ? undefined : { opacity: 0, y: -4 }}
                      transition={mobileContentTransition}
                    >
                      {renderExportBlock()}
                    </m.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </m.div>
        )}
      </AnimatePresence>

      <nav
        className="raw-mobile-tool-rail hidden gap-2 border-t border-border bg-material-opaque p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] max-[640px]:grid max-[640px]:grid-cols-2"
        aria-label={t('raw.mobileTools.aria')}
      >
        <m.button
          type="button"
          className={clsxm(
            'inline-flex min-h-[46px] min-w-0 items-center justify-center gap-1.5 rounded-md border text-xs font-medium leading-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
            mobilePanel === 'style'
              ? 'border-accent-strong bg-fill-secondary text-text'
              : 'border-border bg-background text-text',
          )}
          data-mobile-tool-tab="style"
          data-active={mobilePanel === 'style'}
          aria-expanded={mobilePanel === 'style'}
          aria-controls={mobileToolSheetId}
          onClick={handleMobileStyleClick}
          whileTap={{ scale: 0.96 }}
          transition={TAP_SPRING}
        >
          <SlidersHorizontal aria-hidden="true" className="size-4" />
          {t('raw.mobileTools.style')}
        </m.button>
        <m.button
          type="button"
          className={clsxm(
            'inline-flex min-h-[46px] min-w-0 items-center justify-center gap-1.5 rounded-md border text-xs font-medium leading-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
            !props.canExport || props.isProcessing
              ? 'border-border bg-fill text-text-secondary'
              : 'border-transparent bg-accent text-background',
          )}
          data-mobile-tool-tab="export"
          data-active={mobilePanel === 'export'}
          aria-disabled={!props.canExport || props.isProcessing}
          aria-expanded={mobilePanel === 'export'}
          aria-controls={mobileToolSheetId}
          onPointerDown={handleExportLongPressStart}
          onPointerUp={clearLongPress}
          onPointerLeave={clearLongPress}
          onPointerCancel={clearLongPress}
          onClick={handleMobileExportClick}
          whileTap={{ scale: 0.96 }}
          transition={TAP_SPRING}
        >
          <Download aria-hidden="true" className="size-4" />
          {t('raw.mobileTools.export')}
        </m.button>
      </nav>
    </aside>
  )
}
