import type { PreviewHistogramState } from '@lumaforge/luma-color-runtime'
import { ImageUp, LockKeyhole, RotateCcw, ShieldCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import { useRef, useState } from 'react'

import { useI18n } from '~/lib/i18n'

import type { ToneValue } from '../tools/ToneTool'
import { FloatingHistogramCard } from './FloatingHistogramCard'
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
  lutPanel: ReactNode
  comparePanel: ReactNode
  exportPanel: ReactNode
  moreSheet: { pipelineSteps: Step[]; lutRows: Row[]; fileRows: Row[] }
}) {
  const { t } = useI18n()
  const [mode, setMode] = useState<MobileMode>('tone')
  const [focusKey, setFocusKey] = useState<keyof ToneValue | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const [peeking, setPeeking] = useState(false)
  const [histVisible, setHistVisible] = useState(true)
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
  }
  const commitFocus = () => {
    snapshot.current = null
    setFocusKey(null)
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
      props.lutPanel
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
      <MobilePeekSurface enabled={!focusKey} onPeekChange={onPeekChange} />

      {peeking && (
        <div className="pointer-events-none absolute left-1/2 top-safe-offset-14 z-[12] -translate-x-1/2 rounded-full border border-white/30 bg-black/80 px-2.5 py-1.5 text-[0.7rem] font-semibold uppercase tracking-wide text-white">
          {t('raw.mobile.peek.hint')}
        </div>
      )}

      {!focusKey && (
        <FloatingHistogramCard
          histogram={props.histogram}
          hidden={!histVisible || peeking}
        />
      )}

      {!focusKey && (
        <>
          <MobileTopbar
            fileName={props.fileName}
            fileMeta={props.fileMeta}
            supportLevel={props.supportLevel}
            histogramVisible={histVisible}
            onToggleHistogram={() => setHistVisible((v) => !v)}
            moreMenuItems={[
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
            ]}
          />
          <MobileModeDock
            mode={mode}
            onModeChange={setMode}
            onOpenMore={() => setMoreOpen(true)}
            canExport
            panel={panel}
          />
        </>
      )}

      {focusKey && (
        <ToneFocusEditor
          tone={props.tone}
          focusKey={focusKey}
          onChange={props.onToneChange}
          onPickField={switchFocus}
          onCancel={cancelFocus}
          onDone={commitFocus}
          onDragChange={() => {}}
        />
      )}

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
