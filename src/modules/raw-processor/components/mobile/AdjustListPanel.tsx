import { RotateCcw } from 'lucide-react'
import { AnimatePresence, m } from 'motion/react'
import { useState } from 'react'

import { SegmentGroup, SegmentItem } from '~/components/ui/segment'
import { clsxm } from '~/lib/cn'
import { useI18n } from '~/lib/i18n'
import { surfaceFade } from '~/lib/spring'

import type { ColorValue } from '../tools/ColorTool'
import type { ToneValue } from '../tools/ToneTool'
import { isColorNeutral } from './color-fields'
import { ColorListPanel } from './ColorListPanel'
import { isToneNeutral } from './tone-fields'
import { ToneListPanel } from './ToneListPanel'

type Section = 'tone' | 'color'

export type ScrubFieldId =
  | { kind: 'tone'; key: keyof ToneValue }
  | { kind: 'color'; key: keyof ColorValue }

type AdjustListPanelProps = {
  tone: ToneValue
  color: ColorValue
  onToneChange: (patch: Partial<ToneValue>) => void
  onColorChange: (patch: Partial<ColorValue>) => void
  onToneReset: () => void
  onColorReset: () => void
  onScrubChange: (field: ScrubFieldId | null) => void
  scrubbing?: boolean
}

export function AdjustListPanel(props: AdjustListPanelProps) {
  const { t } = useI18n()
  const [section, setSection] = useState<Section>('tone')

  const isNeutral =
    section === 'tone' ? isToneNeutral(props.tone) : isColorNeutral(props.color)
  const resetLabel =
    section === 'tone' ? t('raw.tone.reset') : t('raw.color.reset')
  const onSectionReset =
    section === 'tone' ? props.onToneReset : props.onColorReset

  const scrubbing = props.scrubbing === true

  return (
    <div
      role="region"
      aria-label={t('raw.mobile.adjustList.aria')}
      data-scrubbing={scrubbing || undefined}
      className="grid gap-2"
    >
      <div
        data-adjust-section-chrome
        className={clsxm(
          'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 transition-opacity duration-150',
          scrubbing && 'opacity-25',
        )}
      >
        <SegmentGroup
          aria-label={t('raw.adjust.title')}
          value={section}
          onValueChanged={(value) => {
            const next = value as Section
            if (next === section) return
            props.onScrubChange(null)
            setSection(next)
          }}
          className="h-11 w-full rounded-md border border-lf-on-photo-bord-soft bg-lf-on-photo-bg-strong p-1 backdrop-blur-background"
        >
          <SegmentItem
            value="tone"
            label={t('raw.adjust.tone')}
            className="flex-1 text-[0.8rem] font-semibold text-lf-on-photo-ink/86 transition-colors duration-150 hover:text-lf-on-photo-ink data-[state=active]:text-lf-on-photo-ink data-[state=active]:[&_span[data-segment-thumb]]:bg-[oklch(0.96_0.006_255/0.22)] data-[state=active]:[&_span[data-segment-thumb]]:shadow-[inset_0_1px_0_oklch(0.96_0.006_255/0.26)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-lf-green/80"
          />
          <SegmentItem
            value="color"
            label={t('raw.adjust.color')}
            className="flex-1 text-[0.8rem] font-semibold text-lf-on-photo-ink/86 transition-colors duration-150 hover:text-lf-on-photo-ink data-[state=active]:text-lf-on-photo-ink data-[state=active]:[&_span[data-segment-thumb]]:bg-[oklch(0.96_0.006_255/0.22)] data-[state=active]:[&_span[data-segment-thumb]]:shadow-[inset_0_1px_0_oklch(0.96_0.006_255/0.26)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-lf-green/80"
          />
        </SegmentGroup>
        <button
          type="button"
          onClick={onSectionReset}
          disabled={isNeutral}
          aria-label={resetLabel}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lf-pill border border-lf-on-photo-bord-soft bg-lf-on-photo-bg-strong px-3 py-1 text-[0.72rem] font-semibold text-lf-on-photo-ink backdrop-blur-background transition-colors hover:border-lf-amber/55 hover:text-lf-amber-soft disabled:cursor-not-allowed disabled:opacity-40"
        >
          <RotateCcw aria-hidden="true" className="size-3" />
          {resetLabel}
        </button>
      </div>
      <AnimatePresence mode="wait" initial={false}>
        {section === 'tone' ? (
          <m.div
            key="tone"
            data-adjust-list-section="tone"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={surfaceFade}
          >
            <ToneListPanel
              tone={props.tone}
              onChange={props.onToneChange}
              onScrubChange={(field) =>
                props.onScrubChange(
                  field ? { kind: 'tone', key: field.key } : null,
                )
              }
            />
          </m.div>
        ) : (
          <m.div
            key="color"
            data-adjust-list-section="color"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={surfaceFade}
          >
            <ColorListPanel
              color={props.color}
              onChange={props.onColorChange}
              onScrubChange={(field) =>
                props.onScrubChange(
                  field ? { kind: 'color', key: field.key } : null,
                )
              }
            />
          </m.div>
        )}
      </AnimatePresence>
    </div>
  )
}
