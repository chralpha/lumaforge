import type { PreviewHistogramState } from '@lumaforge/luma-color-runtime'
import {
  ImageUp,
  Info,
  LockKeyhole,
  RotateCcw,
  ShieldCheck,
  Wand2,
} from 'lucide-react'
import { AnimatePresence, m, useReducedMotion } from 'motion/react'
import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'

import { useI18n } from '~/lib/i18n'
import { surfaceFade } from '~/lib/spring'

import { DOCK_SPRING, IMMERSIVE_STAGGER_MS } from '../../motion'
import type { RawRuntimeReadinessState } from '../raw-runtime-readiness'
import type { ColorValue } from '../tools/ColorTool'
import type { ToneValue } from '../tools/ToneTool'
import type { ScrubFieldId } from './AdjustListPanel'
import { AdjustListPanel } from './AdjustListPanel'
import { MobileComparePanel } from './MobileComparePanel'
import { MobileEmptyState } from './MobileEmptyState'
import { MobileFloatingOverlays } from './MobileFloatingOverlays'
import { MobileLookPanel } from './MobileLookPanel'
import type { MobileLutBrowserProps } from './MobileLutBrowser'
import { MobileLutBrowser } from './MobileLutBrowser'
import type { MobileMode } from './MobileModeDock'
import { MobileModeDock } from './MobileModeDock'
import { MobileMoreSheet } from './MobileMoreSheet'
import { MobileTopbar } from './MobileTopbar'
import { useMobilePreviewGestures } from './useMobilePreviewGestures'

type ViewMode = 'processed' | 'original' | 'compare'
type Row = { label: string; value: string }
type Step = { index: number; label: string; timing: string }

export function MobileLabChrome(props: {
  hasImage: boolean
  tone: ToneValue
  color: ColorValue
  onToneChange: (patch: Partial<ToneValue>) => void
  onToneReset: () => void
  onColorChange: (patch: Partial<ColorValue>) => void
  onColorReset: () => void
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  histogram: PreviewHistogramState
  fileName: string
  fileMeta: string
  supportLevel: 'official' | 'experimental'
  onReplaceFile: () => void
  onResetSession: () => void
  isProcessing: boolean
  runtimeReadinessState?: RawRuntimeReadinessState
  onPrepareRuntime?: () => void
  lutBrowser: Omit<MobileLutBrowserProps, 'open' | 'onClose'>
  onCompareReset: () => void
  exportPanel: ReactNode
  moreSheet: { pipelineSteps: Step[]; lutRows: Row[]; fileRows: Row[] }
  previewSuspended?: boolean
  preferExportMode?: boolean
  previewFrameEl?: HTMLDivElement | null
}) {
  const { t } = useI18n()
  const prefersReduced = useReducedMotion() ?? false
  const [mode, setMode] = useState<MobileMode>('look')
  const [scrubField, setScrubField] = useState<ScrubFieldId | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const [lutBrowserOpen, setLutBrowserOpen] = useState(false)
  const [lutBrowserStartsInContract, setLutBrowserStartsInContract] =
    useState(false)
  const [peeking, setPeeking] = useState(false)
  const [immersive, setImmersive] = useState(false)
  const [histogramOpen, setHistogramOpen] = useState(false)
  const [dockExpanded, setDockExpanded] = useState(true)
  const [compareSplitOpen, setCompareSplitOpen] = useState(false)
  const previewReleasedReady =
    props.hasImage && props.previewSuspended === true && !props.isProcessing
  const handoffActive =
    props.hasImage && (props.isProcessing || previewReleasedReady)
  const viewModeBeforePeek = useRef<ViewMode>('processed')
  const compareSplitOpenRef = useRef(false)
  const suppressNextPeekRestore = useRef(false)
  const preferExportModeWasActive = useRef(false)
  const immersiveStaggerTimer = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )
  const expandedBeforeImmersive = useRef(false)

  // When the RAW is cleared/replaced, tear down every transient layer so the
  // empty-state scaffold can never be left behind focus / immersive / a
  // dangling LUT or More sheet.
  const hasImage = props.hasImage
  const viewMode = props.viewMode
  const onViewModeChange = props.onViewModeChange
  useEffect(() => {
    if (hasImage) return
    if (immersiveStaggerTimer.current !== null) {
      clearTimeout(immersiveStaggerTimer.current)
      immersiveStaggerTimer.current = null
    }
    expandedBeforeImmersive.current = false
    setScrubField(null)
    setImmersive(false)
    setLutBrowserOpen(false)
    setLutBrowserStartsInContract(false)
    setMoreOpen(false)
    setDockExpanded(true)
    compareSplitOpenRef.current = false
    suppressNextPeekRestore.current = false
    setCompareSplitOpen(false)
    setHistogramOpen(false)
    setMode('look')
  }, [hasImage])

  useEffect(() => {
    if (!handoffActive) return
    if (immersiveStaggerTimer.current !== null) {
      clearTimeout(immersiveStaggerTimer.current)
      immersiveStaggerTimer.current = null
    }
    expandedBeforeImmersive.current = false
    setScrubField(null)
    setImmersive(false)
    setLutBrowserOpen(false)
    setLutBrowserStartsInContract(false)
    setMoreOpen(false)
    compareSplitOpenRef.current = false
    suppressNextPeekRestore.current = false
    setCompareSplitOpen(false)
    setHistogramOpen(false)
    setPeeking(false)
  }, [handoffActive])

  useEffect(() => {
    if (!hasImage || compareSplitOpen || viewMode !== 'compare') return
    onViewModeChange('processed')
  }, [compareSplitOpen, hasImage, onViewModeChange, viewMode])

  useEffect(() => {
    const preferExportMode = props.preferExportMode === true
    const shouldActivate =
      preferExportMode && !preferExportModeWasActive.current && hasImage
    preferExportModeWasActive.current = preferExportMode

    if (!shouldActivate) return
    if (immersiveStaggerTimer.current !== null) {
      clearTimeout(immersiveStaggerTimer.current)
      immersiveStaggerTimer.current = null
    }
    expandedBeforeImmersive.current = false

    setMode('export')
    setDockExpanded(true)
    setScrubField(null)
    setImmersive(false)
    setLutBrowserOpen(false)
    setLutBrowserStartsInContract(false)
    setMoreOpen(false)
    compareSplitOpenRef.current = false
    suppressNextPeekRestore.current = false
    setCompareSplitOpen(false)
    setHistogramOpen(false)
  }, [hasImage, props.preferExportMode])

  useEffect(
    () => () => {
      if (immersiveStaggerTimer.current !== null) {
        clearTimeout(immersiveStaggerTimer.current)
      }
    },
    [],
  )

  const onPeekChange = (p: boolean) => {
    if (p) {
      if (compareSplitOpenRef.current) return
      viewModeBeforePeek.current = 'processed'
      onViewModeChange('original')
    } else {
      setPeeking(false)
      if (suppressNextPeekRestore.current) {
        suppressNextPeekRestore.current = false
        return
      }
      onViewModeChange(
        compareSplitOpenRef.current ? viewModeBeforePeek.current : 'processed',
      )
      return
    }
    setPeeking(p)
  }

  const setCompareSplitMode = (open: boolean) => {
    compareSplitOpenRef.current = open
    suppressNextPeekRestore.current = open
    viewModeBeforePeek.current = open ? 'compare' : 'processed'
    setPeeking(false)
    setCompareSplitOpen(open)
    onViewModeChange(open ? 'compare' : 'processed')
  }

  // Mobile peek (long-press) + tap-to-immersive bind directly to the same
  // preview frame element that owns pinch / pan. Sharing the gesture target
  // is what keeps multi-touch alive — a sibling overlay would swallow every
  // touch before `PreviewCanvas` ever saw the second finger.
  const focusActive = scrubField !== null
  const previewGesturesEnabled =
    props.hasImage && !handoffActive && !focusActive
  const closeSheets = () => {
    setLutBrowserOpen(false)
    setLutBrowserStartsInContract(false) // re-open always starts on the browse tab
    setMoreOpen(false)
  }
  const clearImmersiveStagger = () => {
    if (immersiveStaggerTimer.current !== null) {
      clearTimeout(immersiveStaggerTimer.current)
      immersiveStaggerTimer.current = null
    }
  }
  // Entering immersive while the dock panel is expanded tidies the panel away
  // first, then recedes the chrome a beat later — one "collapse, then recede"
  // sequence instead of a wall vanishing at once. Exit reverses it. Reduced
  // motion collapses both halves to an instant flip.
  const enterImmersive = () => {
    // A stagger already in flight means dockExpanded is mid-transition; reading
    // it on a rapid second tap would mis-record the user's panel state. Keep the
    // value captured when this immersive sequence first began.
    const wasStaggering = immersiveStaggerTimer.current !== null
    clearImmersiveStagger()
    if (!wasStaggering) {
      expandedBeforeImmersive.current = dockExpanded
    }
    if (dockExpanded && !prefersReduced) {
      setDockExpanded(false)
      immersiveStaggerTimer.current = setTimeout(() => {
        immersiveStaggerTimer.current = null
        setImmersive(true)
      }, IMMERSIVE_STAGGER_MS)
      return
    }
    setImmersive(true)
  }
  const exitImmersive = () => {
    clearImmersiveStagger()
    setImmersive(false)
    if (expandedBeforeImmersive.current) {
      if (prefersReduced) {
        setDockExpanded(true)
      } else {
        immersiveStaggerTimer.current = setTimeout(() => {
          immersiveStaggerTimer.current = null
          setDockExpanded(true)
        }, IMMERSIVE_STAGGER_MS)
      }
    }
    // No eager reset: the next stable enterImmersive recaptures the panel state.
    // Zeroing here would destroy the restore intent if a re-tap interrupts the
    // re-expand stagger.
  }
  useMobilePreviewGestures(props.previewFrameEl ?? null, {
    enabled: previewGesturesEnabled,
    allowPeek: !compareSplitOpen && !lutBrowserOpen && !moreOpen,
    onPeekChange,
    onTap: () => {
      if (lutBrowserOpen || moreOpen) {
        closeSheets()
        return
      }
      if (immersive) exitImmersive()
      else enterImmersive()
    },
  })
  const openLutBrowser = () => {
    setLutBrowserStartsInContract(false)
    setLutBrowserOpen(true)
  }
  const openLutContractBrowser = () => {
    setLutBrowserStartsInContract(true)
    setLutBrowserOpen(true)
  }

  const panelContent =
    mode === 'tone' ? (
      <AdjustListPanel
        tone={props.tone}
        color={props.color}
        onToneChange={props.onToneChange}
        onColorChange={props.onColorChange}
        onToneReset={props.onToneReset}
        onColorReset={props.onColorReset}
        onScrubChange={setScrubField}
        scrubbing={focusActive}
      />
    ) : mode === 'look' ? (
      <MobileLookPanel
        lutBrowser={props.lutBrowser}
        onOpenLutBrowser={openLutBrowser}
        onOpenLutContractBrowser={openLutContractBrowser}
      />
    ) : mode === 'compare' ? (
      <MobileComparePanel
        splitOpen={compareSplitOpen}
        onCompareReset={props.onCompareReset}
        onSplitOpenChange={setCompareSplitMode}
      />
    ) : (
      props.exportPanel
    )

  // Remount on mode change so the incoming panel fades/slides in rather than
  // swapping instantly. Keyed (not AnimatePresence) keeps the swap robust and
  // the panel a direct child of the dock frame.
  const panel = (
    <m.div
      key={mode}
      initial={{ opacity: 0, y: prefersReduced ? 0 : 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={surfaceFade}
    >
      {panelContent}
    </m.div>
  )

  return (
    <div
      className="pointer-events-none absolute inset-0 z-20"
      data-mobile-lab-chrome
      data-focus={focusActive ? 'true' : 'false'}
      data-peek={peeking || undefined}
    >
      {/* Peek (long-press) and the Compare split are alternate RAW-vs-finished
          affordances. Both are wired via `useMobilePreviewGestures` above so
          they share the same DOM target as pinch / pan and never block it. */}

      <AnimatePresence>
        {!props.hasImage && (
          <MobileEmptyState
            prefersReduced={prefersReduced}
            runtimeReadinessState={props.runtimeReadinessState}
            onPrepareRuntime={props.onPrepareRuntime}
            onReplaceFile={props.onReplaceFile}
          />
        )}
      </AnimatePresence>

      <MobileFloatingOverlays
        immersive={immersive}
        focusActive={focusActive}
        hasImage={props.hasImage}
        handoffActive={handoffActive}
        peeking={peeking}
        histogramOpen={histogramOpen}
        histogram={props.histogram}
        scrubField={scrubField}
        tone={props.tone}
        color={props.color}
        onExitImmersive={exitImmersive}
      />

      {/* Topbar + dock recede together as one surface when immersive takes over,
          instead of hard-unmounting behind the overlay.
          `initial={false}`: present on first load (no page-load choreography),
          fades only on the immersive toggle. */}
      <AnimatePresence initial={false}>
        {!immersive && (
          <m.div
            key="mobile-chrome"
            className="pointer-events-none absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={DOCK_SPRING}
          >
            <MobileTopbar
              hasImage={props.hasImage}
              fileName={props.fileName}
              fileMeta={props.fileMeta}
              supportLevel={props.supportLevel}
              histogramShown={histogramOpen}
              onToggleHistogram={() => setHistogramOpen((v) => !v)}
              moreMenuItems={[
                {
                  kind: 'item',
                  icon: ImageUp,
                  label: t('raw.mobile.more.replace'),
                  onSelect: props.onReplaceFile,
                },
                {
                  kind: 'item',
                  icon: Wand2,
                  label: t('raw.mobile.more.addLut'),
                  onSelect: openLutBrowser,
                },
                {
                  kind: 'item',
                  icon: Info,
                  label: t('raw.mobile.more.fileDetails'),
                  onSelect: () => setMoreOpen(true),
                },
                { kind: 'separator' },
                {
                  kind: 'item',
                  icon: RotateCcw,
                  label: t('raw.mobile.more.reset'),
                  onSelect: props.onResetSession,
                },
                { kind: 'separator' },
                {
                  kind: 'item',
                  icon: LockKeyhole,
                  label: t('raw.mobile.more.browserLocal'),
                  onSelect: () => {},
                  disabled: true,
                },
                {
                  kind: 'item',
                  icon: ShieldCheck,
                  label: t('raw.mobile.more.officialSupport'),
                  onSelect: () => {},
                  disabled: true,
                },
              ]}
            />
            <MobileModeDock
              mode={mode}
              expanded={dockExpanded && props.hasImage}
              disabled={!props.hasImage || props.isProcessing}
              onModeChange={(m) => {
                if (m !== 'compare' && compareSplitOpen) {
                  setCompareSplitMode(false)
                }
                setMode(m)
                setDockExpanded(true)
              }}
              onCollapse={() => setDockExpanded(false)}
              onOpenMore={() => setMoreOpen(true)}
              canExport
              scrubbing={focusActive}
              panel={panel}
            />
          </m.div>
        )}
      </AnimatePresence>

      <MobileLutBrowser
        open={!handoffActive && lutBrowserOpen}
        initialContractEditorOpen={lutBrowserStartsInContract}
        onClose={() => {
          setLutBrowserOpen(false)
          setLutBrowserStartsInContract(false)
        }}
        {...props.lutBrowser}
      />

      <MobileMoreSheet
        open={props.hasImage && !handoffActive && moreOpen}
        onClose={() => setMoreOpen(false)}
        pipelineSteps={props.moreSheet.pipelineSteps}
        lutRows={props.moreSheet.lutRows}
        fileRows={props.moreSheet.fileRows}
      />
    </div>
  )
}
