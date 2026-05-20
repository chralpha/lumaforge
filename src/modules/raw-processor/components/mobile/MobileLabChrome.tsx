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
import { AnimatePresence, m } from 'motion/react'
import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'

import { useI18n } from '~/lib/i18n'

import {
  getProfileOutputLabel,
  getResolvedProfile,
} from '../tools/lut-contract'
import type { ToneValue } from '../tools/ToneTool'
import { FloatingHistogramCard } from './FloatingHistogramCard'
import { MobileComparePanel } from './MobileComparePanel'
import type { MobileLutBrowserProps } from './MobileLutBrowser'
import { MobileLutBrowser } from './MobileLutBrowser'
import type { MobileMode } from './MobileModeDock'
import { MobileModeDock } from './MobileModeDock'
import { MobileMoreSheet } from './MobileMoreSheet'
import { MobilePeekSurface } from './MobilePeekSurface'
import { MobileTopbar } from './MobileTopbar'
import { ToneFocusEditor } from './ToneFocusEditor'
import { ToneStripPanel } from './ToneStripPanel'

type ViewMode = 'processed' | 'original' | 'compare'
type Row = { label: string; value: string }
type Step = { index: number; label: string; timing: string }

const OUTPUT_REQUIRED_LABEL = 'Output profile required'

export function MobileLabChrome(props: {
  hasImage: boolean
  tone: ToneValue
  onToneChange: (patch: Partial<ToneValue>) => void
  onToneReset: () => void
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  histogram: PreviewHistogramState
  fileName: string
  fileMeta: string
  supportLevel: 'official' | 'experimental'
  onReplaceFile: () => void
  onResetSession: () => void
  isProcessing: boolean
  strengthControl: ReactNode
  lutBrowser: Omit<MobileLutBrowserProps, 'open' | 'onClose'>
  onCompareReset: () => void
  exportPanel: ReactNode
  moreSheet: { pipelineSteps: Step[]; lutRows: Row[]; fileRows: Row[] }
}) {
  const { t } = useI18n()
  const [mode, setMode] = useState<MobileMode>('look')
  const [focusKey, setFocusKey] = useState<keyof ToneValue | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const [lutBrowserOpen, setLutBrowserOpen] = useState(false)
  const [lutBrowserStartsInContract, setLutBrowserStartsInContract] =
    useState(false)
  const [peeking, setPeeking] = useState(false)
  const [immersive, setImmersive] = useState(false)
  const [histogramOpen, setHistogramOpen] = useState(false)
  const [dockExpanded, setDockExpanded] = useState(true)
  const [scrubbing, setScrubbing] = useState(false)
  const [compareSplitOpen, setCompareSplitOpen] = useState(false)
  const snapshot = useRef<ToneValue | null>(null)
  const viewModeBeforePeek = useRef<ViewMode>('processed')

  // When the RAW is cleared/replaced, tear down every transient layer so the
  // empty-state scaffold can never be left behind focus / immersive / a
  // dangling LUT or More sheet.
  const hasImage = props.hasImage
  const viewMode = props.viewMode
  const onViewModeChange = props.onViewModeChange
  useEffect(() => {
    if (hasImage) return
    setFocusKey(null)
    setImmersive(false)
    setLutBrowserOpen(false)
    setLutBrowserStartsInContract(false)
    setMoreOpen(false)
    setScrubbing(false)
    setDockExpanded(true)
    setCompareSplitOpen(false)
    setHistogramOpen(false)
    setMode('look')
    snapshot.current = null
  }, [hasImage])

  useEffect(() => {
    if (!hasImage || compareSplitOpen || viewMode !== 'compare') return
    onViewModeChange('processed')
  }, [compareSplitOpen, hasImage, onViewModeChange, viewMode])

  const startFocus = (k: keyof ToneValue) => {
    snapshot.current = props.tone
    setFocusKey(k)
  }
  const cancelFocus = () => {
    if (snapshot.current) {
      const s = snapshot.current
      props.onToneChange({
        userExposureEv: s.userExposureEv,
        userContrast: s.userContrast,
        userHighlights: s.userHighlights,
        userShadows: s.userShadows,
        userWhites: s.userWhites,
        userBlacks: s.userBlacks,
      })
    }
    snapshot.current = null
    setFocusKey(null)
    setDockExpanded(false)
    setScrubbing(false)
  }
  const commitFocus = () => {
    snapshot.current = null
    setFocusKey(null)
    setDockExpanded(false)
    setScrubbing(false)
  }
  const switchFocus = (k: keyof ToneValue) => {
    snapshot.current = snapshot.current ?? props.tone
    setFocusKey(k)
  }

  const onPeekChange = (p: boolean) => {
    if (p) {
      viewModeBeforePeek.current = compareSplitOpen ? viewMode : 'processed'
      onViewModeChange('original')
    } else {
      onViewModeChange(
        compareSplitOpen ? viewModeBeforePeek.current : 'processed',
      )
    }
    setPeeking(p)
  }

  const setCompareSplitMode = (open: boolean) => {
    setCompareSplitOpen(open)
    onViewModeChange(open ? 'compare' : 'processed')
  }
  const resolvedLutProfile = getResolvedProfile(
    props.lutBrowser.lutProfileSelection,
    props.lutBrowser.lutProfileResolution,
  )
  const lutOutputLabel = getProfileOutputLabel(resolvedLutProfile)
  const lutNeedsOutput = lutOutputLabel === OUTPUT_REQUIRED_LABEL
  const displayLutOutputLabel =
    lutOutputLabel && !lutNeedsOutput ? lutOutputLabel : undefined
  const lutNeedsUserSelection =
    props.lutBrowser.lutProfileResolution?.kind === 'needs-user-selection'
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

  const panel =
    mode === 'tone' ? (
      <ToneStripPanel
        tone={props.tone}
        focusKey={focusKey}
        onPickField={startFocus}
        onReset={props.onToneReset}
      />
    ) : mode === 'look' ? (
      <div className="grid gap-2.5">
        {props.lutBrowser.currentLutName ? (
          <div className="grid gap-2 rounded-xl border border-white/15 bg-black/42 p-3">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
              <span className="min-w-0 truncate text-sm font-semibold text-white">
                {props.lutBrowser.currentLutName}
              </span>
              <button
                type="button"
                aria-label={t('raw.mobile.lut.changeAria')}
                onClick={openLutBrowser}
                className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border border-amber-400/35 bg-amber-400/12 px-3 text-[0.7rem] font-semibold text-amber-100 transition-colors hover:border-amber-300/60 hover:text-white"
              >
                {t('raw.mobile.lut.change')}
                <ChevronRight aria-hidden="true" className="size-3" />
              </button>
            </div>

            {lutNeedsUserSelection ? (
              <button
                type="button"
                onClick={openLutContractBrowser}
                aria-label={lutContractWarningLabel ?? undefined}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md border border-amber-400/35 bg-amber-400/10 px-2.5 py-2 text-left text-xs leading-relaxed text-amber-100 transition-colors hover:border-amber-300/60 hover:text-white"
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
                <span className="inline-flex shrink-0 items-center gap-1 text-[0.68rem] font-semibold uppercase tracking-wide text-amber-200">
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
                className="grid gap-1.5 rounded-md border border-white/15 bg-black/35 px-2.5 py-2 text-left transition-colors hover:border-amber-400/40"
              >
                <span className="flex items-center justify-between gap-2 text-[0.62rem] font-semibold uppercase tracking-wide text-white/45">
                  {t('raw.mobile.lut.contractHeading')}
                  <span className="inline-flex items-center gap-1 text-amber-300/80">
                    <SlidersHorizontal aria-hidden="true" className="size-3" />
                    {t('raw.mobile.lut.editContract')}
                  </span>
                </span>
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-white/18 bg-black/35 px-2.5 py-1 text-[0.68rem] font-semibold text-white/86">
                    <Check aria-hidden="true" className="size-3 shrink-0" />
                    <span className="min-w-0 truncate">
                      {resolvedLutProfile.label}
                    </span>
                  </span>
                  <ChevronRight
                    aria-hidden="true"
                    className="size-3 shrink-0 text-white/35"
                  />
                  <span
                    className={[
                      'inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold',
                      lutNeedsOutput
                        ? 'border-amber-400/45 bg-amber-400/12 text-amber-200'
                        : 'border-white/18 bg-black/35 text-white/86',
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
                  <span className="inline-flex items-center gap-1 text-[0.68rem] font-semibold text-amber-200">
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
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md border border-white/15 bg-black/35 px-2.5 py-2 text-left text-xs leading-relaxed text-white/68 transition-colors hover:border-amber-400/40 hover:text-white"
              >
                <span className="min-w-0">
                  {t('raw.mobile.lut.noContract')}
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 text-[0.68rem] font-semibold uppercase tracking-wide text-amber-200">
                  {t('raw.mobile.lut.chooseContract')}
                  <ChevronRight aria-hidden="true" className="size-3" />
                </span>
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-white/15 bg-black/42 p-3">
            <span className="text-sm font-semibold text-white/76">
              {t('raw.mobile.lut.noCurrent')}
            </span>
            <button
              type="button"
              aria-label={t('raw.mobile.lut.title')}
              onClick={openLutBrowser}
              className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border border-amber-400/35 bg-amber-400/12 px-3 text-[0.7rem] font-semibold text-amber-100 transition-colors hover:border-amber-300/60 hover:text-white"
            >
              {t('raw.mobile.lut.add')}
              <ChevronRight aria-hidden="true" className="size-3" />
            </button>
          </div>
        )}
      </div>
    ) : mode === 'strength' ? (
      props.strengthControl
    ) : mode === 'compare' ? (
      <MobileComparePanel
        splitOpen={compareSplitOpen}
        onCompareReset={props.onCompareReset}
        onSplitOpenChange={setCompareSplitMode}
      />
    ) : (
      props.exportPanel
    )

  return (
    <div
      className="absolute inset-0 z-20"
      data-mobile-lab-chrome
      data-focus={focusKey ? 'true' : 'false'}
      data-peek={peeking || undefined}
    >
      {/* Peek and the Compare split are alternate RAW-vs-finished affordances.
          Mobile Compare defaults to hold-to-peek; the split handle is only
          enabled after the explicit split action. */}
      {props.hasImage && (
        <MobilePeekSurface
          enabled={!focusKey}
          allowPeek={!compareSplitOpen}
          onPeekChange={onPeekChange}
          onTap={() => setImmersive((v) => !v)}
        />
      )}

      {!props.hasImage && (
        <m.div
          data-mobile-empty-state
          data-mobile-empty-variant="handoff"
          className="raw-mobile-empty"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="raw-mobile-empty-hero" data-mobile-empty-hero>
            <span className="raw-mobile-empty-mark" aria-hidden="true">
              <ImageUp className="size-[30px]" strokeWidth={1.6} />
            </span>
            <div className="grid gap-2">
              <h1>{t('raw.mobile.empty.title')}</h1>
              <p className="raw-mobile-empty-copy">
                {t('raw.mobile.empty.copy')}
              </p>
            </div>
            <button
              type="button"
              onClick={props.onReplaceFile}
              className="raw-mobile-empty-cta"
            >
              <FolderOpen aria-hidden="true" className="size-4" />
              {t('raw.mobile.empty.browse')}
            </button>
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

          <div className="raw-mobile-empty-prestage" data-mobile-empty-prestage>
            <div className="raw-mobile-empty-prestage-row">
              <span
                className="raw-mobile-empty-prestage-icon"
                aria-hidden="true"
              >
                <Wand2 className="size-[18px]" strokeWidth={1.9} />
              </span>
              <div className="min-w-0">
                <strong>{t('raw.mobile.empty.prestageTitle')}</strong>
                <span>{t('raw.mobile.empty.prestageCopy')}</span>
              </div>
              <button
                type="button"
                onClick={openLutBrowser}
                className="raw-mobile-empty-prestage-button"
              >
                {t('raw.mobile.empty.addLut')}
                <ChevronRight aria-hidden="true" className="size-3" />
              </button>
            </div>
          </div>
        </m.div>
      )}

      {immersive && !focusKey && props.hasImage && (
        <button
          type="button"
          aria-label={t('raw.mobile.immersive.show')}
          onClick={() => setImmersive(false)}
          className="absolute bottom-safe-offset-4 left-1/2 z-[12] -translate-x-1/2 rounded-full border border-white/25 bg-black/55 px-3 py-1.5 text-[0.7rem] font-semibold text-white/80 backdrop-blur-background transition-colors hover:text-white"
        >
          {t('raw.mobile.immersive.show')}
        </button>
      )}

      {peeking && props.hasImage && (
        <div className="pointer-events-none absolute left-1/2 top-safe-offset-14 z-[12] -translate-x-1/2 rounded-full border border-white/30 bg-black/80 px-2.5 py-1.5 text-[0.7rem] font-semibold uppercase tracking-wide text-white">
          {t('raw.mobile.peek.hint')}
        </div>
      )}

      {histogramOpen && !focusKey && !immersive && props.hasImage && (
        <FloatingHistogramCard histogram={props.histogram} hidden={peeking} />
      )}

      {!focusKey && !immersive && props.hasImage && (
        <>
          <MobileTopbar
            hasImage
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
        </>
      )}

      <AnimatePresence>
        {focusKey && props.hasImage && (
          <ToneFocusEditor
            key="tone-focus"
            tone={props.tone}
            focusKey={focusKey}
            onChange={props.onToneChange}
            onPickField={switchFocus}
            onCancel={cancelFocus}
            onDone={commitFocus}
            onDragChange={setScrubbing}
            scrubbing={scrubbing}
          />
        )}
      </AnimatePresence>

      <MobileLutBrowser
        open={lutBrowserOpen}
        initialContractEditorOpen={lutBrowserStartsInContract}
        onClose={() => {
          setLutBrowserOpen(false)
          setLutBrowserStartsInContract(false)
        }}
        {...props.lutBrowser}
      />

      <MobileMoreSheet
        open={props.hasImage && moreOpen}
        onClose={() => setMoreOpen(false)}
        pipelineSteps={props.moreSheet.pipelineSteps}
        lutRows={props.moreSheet.lutRows}
        fileRows={props.moreSheet.fileRows}
      />
    </div>
  )
}
