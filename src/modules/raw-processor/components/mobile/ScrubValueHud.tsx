import { AnimatePresence, m } from 'motion/react'

import { useI18n } from '~/lib/i18n'
import { surfaceFade } from '~/lib/spring'

import type { ColorValue } from '../tools/ColorTool'
import type { ToneValue } from '../tools/ToneTool'
import type { ScrubFieldId } from './AdjustListPanel'
import { formatColorValueShort, MOBILE_COLOR_FIELDS } from './color-fields'
import { formatToneValueShort, MOBILE_TONE_FIELDS } from './tone-fields'

type ScrubValueHudProps = {
  field: ScrubFieldId | null
  tone: ToneValue
  color: ColorValue
}

export function ScrubValueHud(props: ScrubValueHudProps) {
  const { t } = useI18n()
  const readout = resolveReadout(props, t)

  return (
    <AnimatePresence initial={false}>
      {readout && (
        <m.div
          key={`${readout.kind}-${readout.key}`}
          data-scrub-value-hud
          aria-label={t('raw.mobile.adjustList.scrubHudAria')}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={surfaceFade}
          className="pointer-events-none absolute left-1/2 top-safe-offset-3 z-30 grid -translate-x-1/2 gap-0.5 px-4 text-center text-lf-on-photo-ink [text-shadow:0_1px_2px_oklch(0_0_0/0.55)]"
        >
          <span className="text-[0.62rem] font-bold uppercase tracking-[0.18em] text-lf-amber-soft">
            {readout.label}
          </span>
          <strong className="text-[1.85rem] font-semibold leading-none tabular-nums">
            {readout.formatted}
          </strong>
        </m.div>
      )}
    </AnimatePresence>
  )
}

type Readout = {
  kind: 'tone' | 'color'
  key: string
  label: string
  formatted: string
}

function resolveReadout(
  props: ScrubValueHudProps,
  t: ReturnType<typeof useI18n>['t'],
): Readout | null {
  const { field } = props
  if (!field) return null

  if (field.kind === 'tone') {
    const toneField = MOBILE_TONE_FIELDS.find((f) => f.key === field.key)
    if (!toneField) return null
    const value = props.tone[toneField.key]
    return {
      kind: 'tone',
      key: toneField.key,
      label: t(toneField.labelKey),
      formatted: formatToneValueShort(toneField.key, value),
    }
  }

  const colorField = MOBILE_COLOR_FIELDS.find((f) => f.key === field.key)
  if (!colorField) return null
  const value = props.color[colorField.key]
  return {
    kind: 'color',
    key: colorField.key,
    label: t(colorField.labelKey),
    formatted: formatColorValueShort(colorField.key, value),
  }
}
