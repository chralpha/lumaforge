import { RotateCcw } from 'lucide-react'
import { AnimatePresence, m, useReducedMotion } from 'motion/react'
import { useId, useState } from 'react'

import { clsxm } from '~/lib/cn'
import { useI18n } from '~/lib/i18n'
import { surfaceFade } from '~/lib/spring'

import { DOCK_SPRING } from '../../motion'
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

const SECTIONS: {
  id: Section
  labelKey: 'raw.adjust.tone' | 'raw.adjust.color'
}[] = [
  { id: 'tone', labelKey: 'raw.adjust.tone' },
  { id: 'color', labelKey: 'raw.adjust.color' },
]

export function AdjustListPanel(props: AdjustListPanelProps) {
  const { t } = useI18n()
  const [section, setSection] = useState<Section>('tone')
  const prefersReduced = useReducedMotion() ?? false
  // Per-instance id so multiple AdjustListPanels (e.g. a future side-by-side)
  // animate their own indicators rather than fighting over a shared layoutId.
  const indicatorLayoutId = useId()

  const isNeutral =
    section === 'tone' ? isToneNeutral(props.tone) : isColorNeutral(props.color)
  const resetLabel =
    section === 'tone' ? t('raw.tone.reset') : t('raw.color.reset')
  const onSectionReset =
    section === 'tone' ? props.onToneReset : props.onColorReset

  const scrubbing = props.scrubbing === true

  const selectSection = (next: Section) => {
    if (next === section) return
    props.onScrubChange(null)
    setSection(next)
  }

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
          'grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2 border-b border-lf-on-photo-bord-soft transition-opacity duration-150',
          scrubbing && 'opacity-25',
        )}
      >
        <div
          role="tablist"
          aria-label={t('raw.adjust.title')}
          className="inline-flex min-h-11 items-stretch gap-5 px-0.5"
        >
          {SECTIONS.map((s) => {
            const isActive = s.id === section
            return (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => selectSection(s.id)}
                className={clsxm(
                  'relative inline-flex min-h-11 items-center px-1 text-[0.95rem] font-semibold leading-none tracking-tight transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lf-green/80',
                  isActive
                    ? 'text-lf-on-photo-ink'
                    : 'text-lf-on-photo-ink/55 hover:text-lf-on-photo-ink/86',
                )}
              >
                {t(s.labelKey)}
                {isActive && (
                  <m.span
                    aria-hidden="true"
                    layoutId={prefersReduced ? undefined : indicatorLayoutId}
                    transition={DOCK_SPRING}
                    className="absolute inset-x-1 -bottom-px h-0.5 rounded-lf-pill bg-lf-amber"
                  />
                )}
              </button>
            )
          })}
        </div>
        <button
          type="button"
          onClick={onSectionReset}
          disabled={isNeutral}
          aria-label={resetLabel}
          className="-mr-1 inline-flex min-h-11 min-w-11 items-center justify-center rounded-md bg-transparent text-lf-on-photo-ink/82 transition-colors hover:bg-[oklch(0.96_0.006_255/0.08)] hover:text-lf-amber-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lf-green/80 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-lf-on-photo-ink/82"
        >
          <RotateCcw
            aria-hidden="true"
            className="size-[18px] stroke-current"
          />
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
