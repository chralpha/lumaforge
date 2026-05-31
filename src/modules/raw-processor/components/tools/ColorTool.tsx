import { RotateCcw } from 'lucide-react'
import { useId } from 'react'
import { z } from 'zod'

import { Button } from '~/components/ui/button'
import { Slider } from '~/components/ui/slider'
import type { Translate } from '~/lib/i18n'
import { useI18n } from '~/lib/i18n'

export const ColorValueSchema = z.object({
  userTemperature: z.number().min(-100).max(100),
  userTint: z.number().min(-100).max(100),
})

export type ColorValue = z.infer<typeof ColorValueSchema>

const COLOR_DEFAULTS: ColorValue = {
  userTemperature: 0,
  userTint: 0,
}

const FIELDS: {
  key: keyof ColorValue
  labelKey: Parameters<Translate>[0]
  min: number
  max: number
  step: number
}[] = [
  {
    key: 'userTemperature',
    labelKey: 'raw.color.temperature',
    min: -100,
    max: 100,
    step: 1,
  },
  {
    key: 'userTint',
    labelKey: 'raw.color.tint',
    min: -100,
    max: 100,
    step: 1,
  },
]

function formatSignedInteger(value: number) {
  const rounded = Math.round(value)
  return rounded > 0 ? `+${rounded}` : `${rounded}`
}

function ColorSlider({
  labelId,
  value,
  min,
  max,
  step,
  disabled,
  onChange,
}: {
  labelId: string
  value: number
  min: number
  max: number
  step: number
  disabled: boolean
  onChange: (value: number) => void
}) {
  return (
    <Slider
      thumbAriaLabelledBy={labelId}
      value={[value]}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      onValueChange={([v]) => onChange(v)}
    />
  )
}

function ColorField({
  field,
  label,
  value,
  disabled,
  onChange,
}: {
  field: (typeof FIELDS)[number]
  label: string
  value: ColorValue
  disabled: boolean
  onChange: (value: Partial<ColorValue>) => void
}) {
  const labelId = useId()

  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between text-[0.8rem]">
        <label id={labelId} className="font-medium text-lf-on-surface/80">
          {label}
        </label>
        <output
          aria-hidden="true"
          className="tabular-nums font-medium text-lf-on-surface/80"
        >
          {formatSignedInteger(value[field.key])}
        </output>
      </div>
      <ColorSlider
        labelId={labelId}
        value={value[field.key]}
        min={field.min}
        max={field.max}
        step={field.step}
        disabled={disabled}
        onChange={(v) => onChange({ [field.key]: v })}
      />
    </div>
  )
}

export function ColorTool({
  value,
  disabled,
  onChange,
  onReset,
}: {
  value: ColorValue
  disabled: boolean
  onChange: (value: Partial<ColorValue>) => void
  onReset: () => void
}) {
  const { t } = useI18n()
  const isNeutral = Object.entries(value).every(
    ([key, val]) => val === COLOR_DEFAULTS[key as keyof ColorValue],
  )

  return (
    <div className="grid gap-3">
      <div className="grid gap-3.5">
        {FIELDS.map((field) => (
          <ColorField
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
        {t('raw.color.note')}
      </p>
      {!isNeutral && (
        <p className="text-[0.78rem] leading-relaxed text-lf-on-surface/72">
          {t('raw.color.preserved')}
        </p>
      )}
      <Button
        variant="light"
        size="sm"
        disabled={disabled}
        onClick={onReset}
        className="self-start [&_svg]:size-3.5"
      >
        <RotateCcw aria-hidden="true" />
        {t('raw.color.reset')}
      </Button>
    </div>
  )
}
