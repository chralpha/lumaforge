import type { PreviewHistogramState } from '@lumaforge/luma-color-runtime'
import { ImageUp, LockKeyhole, RotateCcw, ShieldCheck } from 'lucide-react'
import { AnimatePresence } from 'motion/react'
import type { ReactNode } from 'react'
import { useRef, useState } from 'react'

import { useI18n } from '~/lib/i18n'

import type { ToneValue } from '../tools/ToneTool'
import { FloatingHistogramCard } from './FloatingHistogramCard'
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
  strengthControl: ReactNode
  lutBrowser: Omit<MobileLutBrowserProps, 'open' | 'onClose'>
  comparePanel: ReactNode
  exportPanel: ReactNode
  moreSheet: { pipelineSteps: Step[]; lutRows: Row[]; fileRows: Row[] }
}) {
  const { t } = useI18n()
  const [mode, setMode] = useState<MobileMode>('tone')
  const [focusKey, setFocusKey] = useState<keyof ToneValue | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const [lutBrowserOpen, setLutBrowserOpen] = useState(false)
  const [peeking, setPeeking] = useState(false)
  const [histVisible, setHistVisible] = useState(true)
  const [immersive, setImmersive] = useState(false)
  const [dockExpanded, setDockExpanded] = useState(true)
  const [scrubbing, setScrubbing] = useState(false)
  const snapshot = useRef<ToneValue | null>(null)
  const viewModeBeforePeek = useRef<ViewMode>('processed')

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
      viewModeBeforePeek.current = props.viewMode
      props.onViewModeChange('original')
    } else {
      props.onViewModeChange(viewModeBeforePeek.current)
    }
    setPeeking(p)
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
      <div className="grid gap-3">
        {props.strengthControl}
        <button
          type="button"
          onClick={() => setLutBrowserOpen(true)}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-white/20 bg-black/40 px-3 text-sm font-semibold text-white transition-colors hover:border-amber-400/50 hover:text-amber-400"
        >
          {t('raw.mobile.lut.title')}
        </button>
      </div>
    ) : mode === 'compare' ? (
      props.comparePanel
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
      {/* Peek and the Compare split are the SAME affordance (RAW vs finished)
          expressed two ways — never both at once. In Compare mode the split
          handle is the comparison tool, so long-press peek is disabled
          there; in every other mode peek is the comparison tool. Tap to
          toggle immersive still works in both. */}
      {props.hasImage && (
        <MobilePeekSurface
          enabled={!focusKey}
          allowPeek={mode !== 'compare'}
          onPeekChange={onPeekChange}
          onTap={() => setImmersive((v) => !v)}
        />
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

      {peeking && (
        <div className="pointer-events-none absolute left-1/2 top-safe-offset-14 z-[12] -translate-x-1/2 rounded-full border border-white/30 bg-black/80 px-2.5 py-1.5 text-[0.7rem] font-semibold uppercase tracking-wide text-white">
          {t('raw.mobile.peek.hint')}
        </div>
      )}

      {!focusKey && !immersive && props.hasImage && (
        <FloatingHistogramCard
          histogram={props.histogram}
          hidden={!histVisible || peeking}
        />
      )}

      {!focusKey && !immersive && (
        <>
          <MobileTopbar
            hasImage={props.hasImage}
            fileName={props.fileName}
            fileMeta={props.fileMeta}
            supportLevel={props.supportLevel}
            histogramVisible={histVisible}
            onToggleHistogram={() => setHistVisible((v) => !v)}
            moreMenuItems={
              props.hasImage
                ? [
                    {
                      kind: 'item',
                      icon: ImageUp,
                      label: t('raw.mobile.more.replace'),
                      onSelect: props.onReplaceFile,
                    },
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
                  ]
                : [
                    {
                      kind: 'item',
                      icon: ImageUp,
                      label: t('raw.header.chooseRaw'),
                      onSelect: props.onReplaceFile,
                    },
                  ]
            }
          />
          <MobileModeDock
            mode={mode}
            expanded={dockExpanded && props.hasImage}
            disabled={!props.hasImage}
            onModeChange={(m) => {
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
        onClose={() => setLutBrowserOpen(false)}
        {...props.lutBrowser}
      />

      <MobileMoreSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        pipelineSteps={props.moreSheet.pipelineSteps}
        lutRows={props.moreSheet.lutRows}
        fileRows={props.moreSheet.fileRows}
      />
    </div>
  )
}
