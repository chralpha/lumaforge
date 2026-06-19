import { RotateCcw } from 'lucide-react'
import { useId } from 'react'

import { Button } from '~/components/ui/button'
import { Slider } from '~/components/ui/slider'
import { clsxm } from '~/lib/cn'
import { useI18n } from '~/lib/i18n'

import type { ToneValue } from '../tone-fields'
import { formatToneValue, isToneNeutral, TONE_FIELDS } from '../tone-fields'

const BASIC_FIELDS = TONE_FIELDS.filter((field) => field.group === 'basic')
const FINE_FIELDS = TONE_FIELDS.filter((field) => field.group === 'fine')

function ToneFieldRow({
  field,
  label,
  value,
  disabled,
  onChange,
}: {
  field: (typeof TONE_FIELDS)[number]
  label: string
  value: ToneValue
  disabled: boolean
  onChange: (value: Partial<ToneValue>) => void
}) {
  const labelId = useId()
  const current = value[field.key]
  const dirty = current !== 0

  return (
    <div
      data-tone-field={field.key}
      data-dirty={dirty ? '' : undefined}
      className="grid gap-1.5 rounded-md px-1.5 py-0.5 transition-colors duration-150 hover:bg-[oklch(0.96_0.006_255/0.04)]"
    >
      <div className="flex items-center justify-between text-[0.8rem]">
        <label
          id={labelId}
          className={clsxm(
            'font-medium transition-colors duration-150',
            dirty ? 'text-lf-amber-soft' : 'text-lf-on-surface/80',
          )}
        >
          {label}
        </label>
        <output
          aria-hidden="true"
          className={clsxm(
            'tabular-nums font-medium transition-colors duration-150',
            dirty ? 'text-lf-amber-soft' : 'text-lf-on-surface/80',
          )}
        >
          {formatToneValue(field.key, current)}
        </output>
      </div>
      <Slider
        thumbAriaLabelledBy={labelId}
        value={[current]}
        min={field.min}
        max={field.max}
        step={field.step}
        disabled={disabled}
        bipolar
        onValueChange={([v]) => onChange({ [field.key]: v })}
      />
    </div>
  )
}

export function ToneTool({
  value,
  disabled,
  onChange,
  onReset,
}: {
  value: ToneValue
  disabled: boolean
  onChange: (value: Partial<ToneValue>) => void
  onReset: () => void
}) {
  const { t } = useI18n()
  const isNeutral = isToneNeutral(value)

  return (
    <div className="grid gap-3">
      <div className="grid gap-2.5">
        {BASIC_FIELDS.map((field) => (
          <ToneFieldRow
            key={field.key}
            field={field}
            label={t(field.labelKey)}
            value={value}
            disabled={disabled}
            onChange={onChange}
          />
        ))}
      </div>
      <div className="grid gap-2.5">
        {FINE_FIELDS.map((field) => (
          <ToneFieldRow
            key={field.key}
            field={field}
            label={t(field.labelKey)}
            value={value}
            disabled={disabled}
            onChange={onChange}
          />
        ))}
      </div>
      <p className="text-[0.78rem] leading-relaxed text-lf-on-surface/72">
        {t('raw.tone.note')}
      </p>
      {!isNeutral && (
        <p className="text-[0.78rem] leading-relaxed text-lf-on-surface/72">
          {t('raw.tone.preserved')}
        </p>
      )}
      <Button
        variant="light"
        size="sm"
        disabled={disabled || isNeutral}
        onClick={onReset}
        className="self-start [&_svg]:size-3.5"
      >
        <RotateCcw aria-hidden="true" />
        {t('raw.tone.reset')}
      </Button>
    </div>
  )
}
