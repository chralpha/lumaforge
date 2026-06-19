import { RotateCcw } from 'lucide-react'
import { useId } from 'react'

import { Button } from '~/components/ui/button'
import { Slider } from '~/components/ui/slider'
import { clsxm } from '~/lib/cn'
import { useI18n } from '~/lib/i18n'

import type { ColorValue } from '../color-fields'
import {
  COLOR_FIELDS,
  formatColorValueShort,
  isColorNeutral,
} from '../color-fields'
import {
  saturationTrack,
  temperatureTrack,
  tintTrack,
  vibranceTrack,
} from './slider-tracks'

const COLOR_TRACK: Record<keyof ColorValue, string> = {
  userTemperature: temperatureTrack(),
  userTint: tintTrack(),
  userSaturation: saturationTrack(),
  userVibrance: vibranceTrack(),
}

function ColorFieldRow({
  field,
  label,
  value,
  disabled,
  onChange,
}: {
  field: (typeof COLOR_FIELDS)[number]
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
          {formatColorValueShort(field.key, current)}
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
        track={COLOR_TRACK[field.key]}
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
  const isNeutral = isColorNeutral(value)

  return (
    <div className="grid gap-3">
      <div className="grid gap-2.5">
        {COLOR_FIELDS.map((field) => (
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
