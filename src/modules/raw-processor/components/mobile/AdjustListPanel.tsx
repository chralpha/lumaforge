import { RotateCcw } from 'lucide-react'
import { useState } from 'react'

import { SegmentGroup, SegmentItem } from '~/components/ui/segment'
import { useI18n } from '~/lib/i18n'

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

  return (
    <div
      role="region"
      aria-label={t('raw.mobile.adjustList.aria')}
      className="grid gap-2"
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <SegmentGroup
          aria-label={t('raw.adjust.title')}
          value={section}
          onValueChanged={(value) => {
            const next = value as Section
            if (next === section) return
            props.onScrubChange(null)
            setSection(next)
          }}
          className="h-9 w-full rounded-md bg-[oklch(0.96_0.006_255/0.05)] p-1"
        >
          <SegmentItem
            value="tone"
            label={t('raw.adjust.tone')}
            className="flex-1 text-[0.76rem] font-medium text-lf-on-photo-ink/72 transition-colors duration-150 hover:text-lf-on-photo-ink/92 data-[state=active]:font-semibold data-[state=active]:text-lf-on-photo-ink data-[state=active]:[&_span[data-segment-thumb]]:bg-[oklch(0.96_0.006_255/0.10)] data-[state=active]:[&_span[data-segment-thumb]]:shadow-[inset_0_1px_0_oklch(0.96_0.006_255/0.14)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-lf-green/80"
          />
          <SegmentItem
            value="color"
            label={t('raw.adjust.color')}
            className="flex-1 text-[0.76rem] font-medium text-lf-on-photo-ink/72 transition-colors duration-150 hover:text-lf-on-photo-ink/92 data-[state=active]:font-semibold data-[state=active]:text-lf-on-photo-ink data-[state=active]:[&_span[data-segment-thumb]]:bg-[oklch(0.96_0.006_255/0.10)] data-[state=active]:[&_span[data-segment-thumb]]:shadow-[inset_0_1px_0_oklch(0.96_0.006_255/0.14)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-lf-green/80"
          />
        </SegmentGroup>
        <button
          type="button"
          onClick={onSectionReset}
          disabled={isNeutral}
          aria-label={resetLabel}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lf-pill border border-lf-on-photo-bord-soft px-2.5 py-1 text-[0.7rem] font-semibold text-lf-on-photo-ink/82 transition-colors hover:border-lf-amber/55 hover:text-lf-amber-soft disabled:cursor-not-allowed disabled:opacity-40"
        >
          <RotateCcw aria-hidden="true" className="size-3" />
          {resetLabel}
        </button>
      </div>
      {section === 'tone' ? (
        <ToneListPanel
          tone={props.tone}
          onChange={props.onToneChange}
          onScrubChange={(field) =>
            props.onScrubChange(field ? { kind: 'tone', key: field.key } : null)
          }
        />
      ) : (
        <ColorListPanel
          color={props.color}
          onChange={props.onColorChange}
          onScrubChange={(field) =>
            props.onScrubChange(
              field ? { kind: 'color', key: field.key } : null,
            )
          }
        />
      )}
    </div>
  )
}
