import { RotateCcw } from 'lucide-react'
import { useId } from 'react'
import { z } from 'zod'

import { Button } from '~/components/ui/button'
import { Slider } from '~/components/ui/slider'
import { clsxm } from '~/lib/cn'
import type { Translate } from '~/lib/i18n'
import { useI18n } from '~/lib/i18n'

import {
  saturationTrack,
  temperatureTrack,
  tintTrack,
  vibranceTrack,
} from './slider-tracks'

export const ColorValueSchema = z.object({
  userTemperature: z.number().min(-100).max(100),
  userTint: z.number().min(-100).max(100),
  userSaturation: z.number().min(-100).max(100),
  userVibrance: z.number().min(-100).max(100),
})

export type ColorValue = z.infer<typeof ColorValueSchema>

const COLOR_DEFAULTS: ColorValue = {
  userTemperature: 0,
  userTint: 0,
  userSaturation: 0,
  userVibrance: 0,
}

type ColorField = {
  key: keyof ColorValue
  labelKey: Parameters<Translate>[0]
  min: number
  max: number
  step: number
  /** CSS background gradient hinting the direction of the effect. */
  track: string
}

const FIELDS: ColorField[] = [
  {
    key: 'userTemperature',
    labelKey: 'raw.color.temperature',
    min: -100,
    max: 100,
    step: 1,
    track: temperatureTrack(),
  },
  {
    key: 'userTint',
    labelKey: 'raw.color.tint',
    min: -100,
    max: 100,
    step: 1,
    track: tintTrack(),
  },
  {
    key: 'userSaturation',
    labelKey: 'raw.color.saturation',
    min: -100,
    max: 100,
    step: 1,
    track: saturationTrack(),
  },
  {
    key: 'userVibrance',
    labelKey: 'raw.color.vibrance',
    min: -100,
    max: 100,
    step: 1,
    track: vibranceTrack(),
  },
]

function formatSignedInteger(value: number) {
  const rounded = Math.round(value)
  return rounded > 0 ? `+${rounded}` : `${rounded}`
}

function ColorFieldRow({
  field,
  label,
  value,
  disabled,
  onChange,
}: {
  field: ColorField
  label: string
  value: ColorValue
  disabled: boolean
  onChange: (value: Partial<ColorValue>) => void
}) {
  const labelId = useId()
  const current = value[field.key]
  const dirty = current !== 0

  return (
    <div
      data-color-field={field.key}
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
          {formatSignedInteger(current)}
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
        track={field.track}
        onValueChange={([v]) => onChange({ [field.key]: v })}
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
      <div className="grid gap-2.5">
        {FIELDS.map((field) => (
          <ColorFieldRow
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
        disabled={disabled || isNeutral}
        onClick={onReset}
        className="self-start [&_svg]:size-3.5"
      >
        <RotateCcw aria-hidden="true" />
        {t('raw.color.reset')}
      </Button>
    </div>
  )
}
