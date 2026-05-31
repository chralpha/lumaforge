import type { PreviewHistogramState } from '@lumaforge/luma-color-runtime'
import {
  AlertTriangle,
  Check,
  ChevronRight,
  FolderOpen,
  ImageUp,
  Info,
  LockKeyhole,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Wand2,
} from 'lucide-react'
import { AnimatePresence, m, useReducedMotion } from 'motion/react'
import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'

import { useI18n } from '~/lib/i18n'
import { surfaceFade } from '~/lib/spring'

import { DOCK_SPRING, IMMERSIVE_STAGGER_MS } from '../../motion'
import type { RawRuntimeReadinessState } from '../raw-runtime-readiness'
import { getRawRuntimeReadinessCopy } from '../raw-runtime-readiness'
import type { ColorValue } from '../tools/ColorTool'
import {
  deriveLUTContractView,
  getProfileOutputLabel,
  getResolvedProfile,
} from '../tools/lut-contract'
import type { ToneValue } from '../tools/ToneTool'
import type { ScrubFieldId } from './AdjustListPanel'
import { AdjustListPanel } from './AdjustListPanel'
import { FloatingHistogramCard } from './FloatingHistogramCard'
import { MobileComparePanel } from './MobileComparePanel'
import type { MobileLutBrowserProps } from './MobileLutBrowser'
import { MobileLutBrowser } from './MobileLutBrowser'
import type { MobileMode } from './MobileModeDock'
import { MobileModeDock } from './MobileModeDock'
import { MobileMoreSheet } from './MobileMoreSheet'
import { MobileTopbar } from './MobileTopbar'
import { ScrubValueHud } from './ScrubValueHud'
import { useMobilePreviewGestures } from './useMobilePreviewGestures'

type ViewMode = 'processed' | 'original' | 'compare'
type Row = { label: string; value: string }
type Step = { index: number; label: string; timing: string }

const OUTPUT_REQUIRED_LABEL = 'Output profile required'

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
  const resolvedLutProfile = getResolvedProfile(
    props.lutBrowser.lutProfileSelection,
    props.lutBrowser.lutProfileResolution,
  )
  const lutContractView = deriveLUTContractView(
    props.lutBrowser.lutProfileSelection,
    props.lutBrowser.lutProfileResolution,
  )
  const runtimeReadiness =
    !props.hasImage && props.runtimeReadinessState
      ? getRawRuntimeReadinessCopy(t, props.runtimeReadinessState)
      : null
  const lutOutputLabel = getProfileOutputLabel(resolvedLutProfile)
  const lutNeedsOutput = lutOutputLabel === OUTPUT_REQUIRED_LABEL
  const displayLutOutputLabel =
    lutOutputLabel && !lutNeedsOutput ? lutOutputLabel : undefined
  const lutNeedsUserSelection =
    props.lutBrowser.lutProfileResolution != null &&
    props.lutBrowser.lutProfileResolution.kind !== 'confirmed'
  const lutContractWarningLabel = lutNeedsUserSelection
    ? t('raw.mobile.lut.chooseContract')
    : lutNeedsOutput
      ? t('raw.mobile.lut.chooseOutput')
      : null
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
      />
    ) : mode === 'look' ? (
      <div className="grid gap-2.5">
        {props.lutBrowser.currentLutName ? (
          <div className="grid gap-2 rounded-lf-panel border border-lf-on-photo-bord-soft bg-lf-on-photo-bg p-3">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
              <span className="min-w-0 truncate text-lf-control font-semibold text-lf-on-photo-ink">
                {props.lutBrowser.currentLutName}
              </span>
              <button
                type="button"
                aria-label={t('raw.mobile.lut.changeAria')}
                onClick={openLutBrowser}
                className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lf-pill border border-lf-amber/35 bg-lf-amber/12 px-3 text-lf-label font-semibold text-lf-amber-soft transition-colors hover:border-lf-amber/60 hover:text-lf-on-photo-ink"
              >
                {t('raw.mobile.lut.change')}
                <ChevronRight aria-hidden="true" className="size-3" />
              </button>
            </div>

            {lutContractView.status === 'recommended' ? (
              <button
                type="button"
                onClick={openLutContractBrowser}
                aria-label={t('raw.mobile.lut.chooseContract')}
                className="grid gap-1.5 rounded-lf-control border border-lf-amber/35 bg-lf-amber/10 px-2.5 py-2 text-left transition-colors hover:border-lf-amber/60"
              >
                <span className="flex items-center justify-between gap-2 text-lf-eyebrow font-semibold uppercase tracking-wide text-lf-amber-soft">
                  {t('raw.lutContract.recommendedBadge')}
                  <span className="inline-flex items-center gap-1">
                    {t('raw.mobile.lut.chooseContract')}
                    <ChevronRight aria-hidden="true" className="size-3" />
                  </span>
                </span>
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <span className="inline-flex max-w-full items-center gap-1.5 rounded-lf-pill border border-lf-on-photo-bord-soft bg-lf-on-photo-bg px-2.5 py-1 text-lf-eyebrow font-semibold text-lf-on-photo-ink/86">
                    <span className="min-w-0 truncate">
                      {lutContractView.recommendation.label}
                    </span>
                  </span>
                  <ChevronRight
                    aria-hidden="true"
                    className="size-3 shrink-0 text-lf-on-photo-ink/35"
                  />
                  <span className="inline-flex max-w-full items-center gap-1.5 rounded-lf-pill border border-lf-on-photo-bord-soft bg-lf-on-photo-bg px-2.5 py-1 text-lf-eyebrow font-semibold text-lf-on-photo-ink/86">
                    <span className="min-w-0 truncate">
                      {lutContractView.completesContract
                        ? getProfileOutputLabel(lutContractView.recommendation)
                        : t('raw.lutContract.chooseOutput')}
                    </span>
                  </span>
                </div>
                <span className="text-xs leading-relaxed text-lf-amber-soft">
                  {lutContractView.completesContract
                    ? t('raw.lutContract.recommendedNote')
                    : t('raw.lutContract.recommendedInputOnlyNote')}
                </span>
              </button>
            ) : lutNeedsUserSelection ? (
              <button
                type="button"
                onClick={openLutContractBrowser}
                aria-label={lutContractWarningLabel ?? undefined}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lf-control border border-lf-amber/35 bg-lf-amber/10 px-2.5 py-2 text-left text-xs leading-relaxed text-lf-amber-soft transition-colors hover:border-lf-amber/60 hover:text-lf-on-photo-ink"
              >
                <span className="inline-flex min-w-0 items-start gap-1.5">
                  <AlertTriangle
                    aria-hidden="true"
                    className="mt-0.5 size-3 shrink-0"
                  />
                  <span className="min-w-0">
                    {t('raw.lutContract.unknown')}
                  </span>
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 text-lf-eyebrow font-semibold uppercase tracking-wide text-lf-amber-soft">
                  {lutContractWarningLabel}
                  <ChevronRight aria-hidden="true" className="size-3" />
                </span>
              </button>
            ) : resolvedLutProfile ? (
              <button
                type="button"
                onClick={openLutContractBrowser}
                aria-label={t('raw.mobile.lut.editContractAria', {
                  label: resolvedLutProfile.label,
                })}
                className="grid gap-1.5 rounded-lf-control border border-lf-on-photo-bord-soft bg-lf-on-photo-bg px-2.5 py-2 text-left transition-colors hover:border-lf-amber/40"
              >
                <span className="flex items-center justify-between gap-2 text-lf-eyebrow font-semibold uppercase tracking-wide text-lf-on-photo-ink/45">
                  {t('raw.mobile.lut.contractHeading')}
                  <span className="inline-flex items-center gap-1 text-lf-amber/80">
                    <SlidersHorizontal aria-hidden="true" className="size-3" />
                    {t('raw.mobile.lut.editContract')}
                  </span>
                </span>
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <span className="inline-flex max-w-full items-center gap-1.5 rounded-lf-pill border border-lf-on-photo-bord-soft bg-lf-on-photo-bg px-2.5 py-1 text-lf-eyebrow font-semibold text-lf-on-photo-ink/86">
                    <Check aria-hidden="true" className="size-3 shrink-0" />
                    <span className="min-w-0 truncate">
                      {resolvedLutProfile.label}
                    </span>
                  </span>
                  <ChevronRight
                    aria-hidden="true"
                    className="size-3 shrink-0 text-lf-on-photo-ink/35"
                  />
                  <span
                    className={[
                      'inline-flex max-w-full items-center gap-1.5 rounded-lf-pill border px-2.5 py-1 text-lf-eyebrow font-semibold',
                      lutNeedsOutput
                        ? 'border-lf-amber/45 bg-lf-amber/12 text-lf-amber-soft'
                        : 'border-lf-on-photo-bord-soft bg-lf-on-photo-bg text-lf-on-photo-ink/86',
                    ].join(' ')}
                  >
                    {lutNeedsOutput ? (
                      <AlertTriangle
                        aria-hidden="true"
                        className="size-3 shrink-0"
                      />
                    ) : (
                      <Check aria-hidden="true" className="size-3 shrink-0" />
                    )}
                    <span className="min-w-0 truncate">
                      {displayLutOutputLabel ??
                        t('raw.mobile.lut.outputRequired')}
                    </span>
                  </span>
                </div>
                {lutNeedsOutput && lutContractWarningLabel && (
                  <span className="inline-flex items-center gap-1 text-lf-eyebrow font-semibold text-lf-amber-soft">
                    {lutContractWarningLabel}
                    <ChevronRight aria-hidden="true" className="size-3" />
                  </span>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={openLutContractBrowser}
                aria-label={t('raw.mobile.lut.chooseContract')}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lf-control border border-lf-on-photo-bord-soft bg-lf-on-photo-bg px-2.5 py-2 text-left text-xs leading-relaxed text-lf-on-photo-ink/68 transition-colors hover:border-lf-amber/40 hover:text-lf-on-photo-ink"
              >
                <span className="min-w-0">
                  {t('raw.mobile.lut.noContract')}
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 text-lf-eyebrow font-semibold uppercase tracking-wide text-lf-amber-soft">
                  {t('raw.mobile.lut.chooseContract')}
                  <ChevronRight aria-hidden="true" className="size-3" />
                </span>
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2 rounded-lf-panel border border-lf-on-photo-bord-soft bg-lf-on-photo-bg p-3">
            <span className="text-lf-control font-semibold text-lf-on-photo-ink/76">
              {t('raw.mobile.lut.noCurrent')}
            </span>
            <button
              type="button"
              aria-label={t('raw.mobile.lut.title')}
              onClick={openLutBrowser}
              className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lf-pill border border-lf-amber/35 bg-lf-amber/12 px-3 text-lf-label font-semibold text-lf-amber-soft transition-colors hover:border-lf-amber/60 hover:text-lf-on-photo-ink"
            >
              {t('raw.mobile.lut.add')}
              <ChevronRight aria-hidden="true" className="size-3" />
            </button>
          </div>
        )}
      </div>
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
          <m.div
            key="mobile-empty"
            data-mobile-empty-state
            data-mobile-empty-variant="toolbar"
            className="raw-mobile-empty pointer-events-auto"
            initial={{ opacity: 0, y: prefersReduced ? 0 : 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: prefersReduced ? 0 : 12 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="raw-mobile-empty-hero" data-mobile-empty-hero>
              <span className="raw-mobile-empty-mark" aria-hidden="true">
                <ImageUp className="size-[30px]" strokeWidth={1.6} />
              </span>
              <div className="grid gap-2">
                <h1>{t('raw.onboarding.slogan')}</h1>
                <p className="raw-mobile-empty-copy">
                  {t('raw.mobile.empty.copy')}
                </p>
              </div>
              <button
                type="button"
                disabled={
                  props.runtimeReadinessState !== 'ready' &&
                  props.runtimeReadinessState !== undefined
                }
                onClick={() => {
                  props.onPrepareRuntime?.()
                  props.onReplaceFile()
                }}
                onPointerEnter={props.onPrepareRuntime}
                onFocus={props.onPrepareRuntime}
                className="raw-mobile-empty-cta"
              >
                <FolderOpen aria-hidden="true" className="size-4" />
                {t('raw.mobile.empty.browse')}
              </button>
              {runtimeReadiness && (
                <div
                  aria-live="polite"
                  data-raw-runtime-readiness
                  data-state={props.runtimeReadinessState}
                  className="raw-mobile-empty-readiness"
                >
                  <span
                    className="raw-mobile-empty-readiness-dot"
                    aria-hidden="true"
                  />
                  <strong>{runtimeReadiness.label}</strong>
                  <span>{runtimeReadiness.detail}</span>
                </div>
              )}
              <div
                className="raw-mobile-empty-formats"
                aria-label="Supported RAW formats"
              >
                {t('raw.mobile.empty.formats')
                  .split(' ')
                  .map((format) => (
                    <span key={format}>{format}</span>
                  ))}
              </div>
            </div>
          </m.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {immersive && !focusActive && props.hasImage && !handoffActive && (
          <m.button
            key="immersive-show"
            type="button"
            aria-label={t('raw.mobile.immersive.show')}
            onClick={exitImmersive}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={surfaceFade}
            className="pointer-events-auto absolute bottom-safe-offset-4 left-1/2 z-[12] inline-flex min-h-[44px] -translate-x-1/2 items-center justify-center rounded-lf-pill border border-lf-on-photo-bord-soft bg-lf-on-photo-bg-strong px-3 text-[0.7rem] font-semibold text-lf-on-photo-ink/82 backdrop-blur-background transition-colors hover:text-lf-on-photo-ink"
          >
            {t('raw.mobile.immersive.show')}
          </m.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {peeking && props.hasImage && !handoffActive && (
          <m.div
            key="peek-hint"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={surfaceFade}
            className="pointer-events-none absolute left-1/2 top-safe-offset-14 z-[12] -translate-x-1/2 rounded-lf-pill border border-lf-on-photo-bord bg-lf-on-photo-bg-strong px-2.5 py-1.5 text-[0.7rem] font-semibold uppercase tracking-wide text-lf-on-photo-ink"
          >
            {t('raw.mobile.peek.hint')}
          </m.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {histogramOpen &&
          !focusActive &&
          !immersive &&
          props.hasImage &&
          !handoffActive && (
            <FloatingHistogramCard
              key="histogram"
              histogram={props.histogram}
              hidden={peeking}
            />
          )}
      </AnimatePresence>

      <ScrubValueHud
        key={
          scrubField
            ? `${scrubField.kind}-${String(scrubField.key)}`
            : 'scrub-idle'
        }
        field={scrubField}
        tone={props.tone}
        color={props.color}
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
