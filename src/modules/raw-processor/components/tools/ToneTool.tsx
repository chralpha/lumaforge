import { RotateCcw } from 'lucide-react'
import { useId } from 'react'
import { z } from 'zod'

import { Button } from '~/components/ui/button'
import { Slider } from '~/components/ui/slider'
import { clsxm } from '~/lib/cn'
import type { Translate } from '~/lib/i18n'
import { useI18n } from '~/lib/i18n'

export const ToneValueSchema = z.object({
  userExposureEv: z.number().min(-5).max(5),
  userContrast: z.number().min(-100).max(100),
  userHighlights: z.number().min(-100).max(100),
  userShadows: z.number().min(-100).max(100),
  userWhites: z.number().min(-100).max(100),
  userBlacks: z.number().min(-100).max(100),
})

export type ToneValue = z.infer<typeof ToneValueSchema>

const TONE_DEFAULTS: ToneValue = {
  userExposureEv: 0,
  userContrast: 0,
  userHighlights: 0,
  userShadows: 0,
  userWhites: 0,
  userBlacks: 0,
}

const FIELDS: {
  key: keyof ToneValue
  labelKey: Parameters<Translate>[0]
  min: number
  max: number
  step: number
  group: 'basic' | 'fine'
}[] = [
  {
    key: 'userExposureEv',
    labelKey: 'raw.tone.exposure',
    min: -5,
    max: 5,
    step: 0.01,
    group: 'basic',
  },
  {
    key: 'userContrast',
    labelKey: 'raw.tone.contrast',
    min: -100,
    max: 100,
    step: 1,
    group: 'basic',
  },
  {
    key: 'userHighlights',
    labelKey: 'raw.tone.highlights',
    min: -100,
    max: 100,
    step: 1,
    group: 'fine',
  },
  {
    key: 'userShadows',
    labelKey: 'raw.tone.shadows',
    min: -100,
    max: 100,
    step: 1,
    group: 'fine',
  },
  {
    key: 'userWhites',
    labelKey: 'raw.tone.whites',
    min: -100,
    max: 100,
    step: 1,
    group: 'fine',
  },
  {
    key: 'userBlacks',
    labelKey: 'raw.tone.blacks',
    min: -100,
    max: 100,
    step: 1,
    group: 'fine',
  },
]

const BASIC_FIELDS = FIELDS.filter((field) => field.group === 'basic')
const FINE_FIELDS = FIELDS.filter((field) => field.group === 'fine')

function ToneFieldRow({
  field,
  label,
  value,
  disabled,
  onChange,
  formatValue,
}: {
  field: (typeof FIELDS)[number]
  label: string
  value: ToneValue
  disabled: boolean
  onChange: (value: Partial<ToneValue>) => void
  formatValue: (key: keyof ToneValue, val: number) => string
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
          {formatValue(field.key, current)}
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

  const isNeutral = Object.entries(value).every(
    ([key, val]) => val === TONE_DEFAULTS[key as keyof ToneValue],
  )

  const formatValue = (key: keyof ToneValue, val: number) =>
    key === 'userExposureEv' ? `${val.toFixed(2)} EV` : `${Math.round(val)}`

  const renderField = (field: (typeof FIELDS)[number]) => (
    <ToneFieldRow
      key={field.key}
      field={field}
      label={t(field.labelKey)}
      value={value}
      disabled={disabled}
      onChange={onChange}
      formatValue={formatValue}
    />
  )

  return (
    <div className="grid gap-3">
      <div className="grid gap-2.5">{BASIC_FIELDS.map(renderField)}</div>
      <div className="grid gap-2.5">{FINE_FIELDS.map(renderField)}</div>
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
