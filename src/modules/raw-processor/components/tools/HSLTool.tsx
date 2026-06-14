import type { HSLBandId, HSLBandShift } from '@lumaforge/luma-color-runtime'
import { makeNeutralBand } from '@lumaforge/luma-color-runtime'
import { RotateCcw } from 'lucide-react'
import { useId } from 'react'

import { Button } from '~/components/ui/button'
import { Slider } from '~/components/ui/slider'
import type { Translate } from '~/lib/i18n'
import { useI18n } from '~/lib/i18n'

export type HSLToolValue = Readonly<Record<HSLBandId, Readonly<HSLBandShift>>>

const HSL_BAND_ORDER: readonly HSLBandId[] = [
  'red',
  'orange',
  'yellow',
  'green',
  'aqua',
  'blue',
  'purple',
  'magenta',
] as const

const HSL_FIELDS: readonly {
  key: keyof HSLBandShift
  labelKey: Parameters<Translate>[0]
}[] = [
  { key: 'hue', labelKey: 'raw.hsl.fields.hue' },
  { key: 'saturation', labelKey: 'raw.hsl.fields.saturation' },
  { key: 'lightness', labelKey: 'raw.hsl.fields.lightness' },
] as const

const HSL_BAND_LABEL_KEY: Record<HSLBandId, Parameters<Translate>[0]> = {
  red: 'raw.hsl.bands.red',
  orange: 'raw.hsl.bands.orange',
  yellow: 'raw.hsl.bands.yellow',
  green: 'raw.hsl.bands.green',
  aqua: 'raw.hsl.bands.aqua',
  blue: 'raw.hsl.bands.blue',
  purple: 'raw.hsl.bands.purple',
  magenta: 'raw.hsl.bands.magenta',
}

/**
 * On-photo swatch chips that hint at each band's anchor hue on the dark `/raw`
 * surface. Chosen to read as recognisable hue cues, not as the actual band
 * centers (which live in OKLch space inside the runtime).
 */
const HSL_BAND_SWATCH: Record<HSLBandId, string> = {
  red: 'oklch(0.62 0.21 27)',
  orange: 'oklch(0.74 0.17 55)',
  yellow: 'oklch(0.86 0.17 95)',
  green: 'oklch(0.74 0.18 145)',
  aqua: 'oklch(0.78 0.13 200)',
  blue: 'oklch(0.62 0.18 260)',
  purple: 'oklch(0.58 0.20 305)',
  magenta: 'oklch(0.66 0.22 340)',
}

function formatSignedInteger(value: number) {
  const rounded = Math.round(value)
  return rounded > 0 ? `+${rounded}` : `${rounded}`
}

function isNeutralBand(band: HSLBandShift): boolean {
  return band.hue === 0 && band.saturation === 0 && band.lightness === 0
}

function HSLFieldRow({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string
  value: number
  disabled: boolean
  onChange: (next: number) => void
}) {
  const labelId = useId()

  return (
    <div className="grid gap-1">
      <div className="flex items-center justify-between text-[0.78rem]">
        <label id={labelId} className="text-lf-on-surface/70">
          {label}
        </label>
        <output
          aria-hidden="true"
          className="tabular-nums text-lf-on-surface/72"
        >
          {formatSignedInteger(value)}
        </output>
      </div>
      <Slider
        thumbAriaLabelledBy={labelId}
        value={[value]}
        min={-100}
        max={100}
        step={1}
        disabled={disabled}
        onValueChange={([next]) => onChange(next)}
      />
    </div>
  )
}

function HSLBandSection({
  band,
  label,
  value,
  disabled,
  fieldLabels,
  onChange,
}: {
  band: HSLBandId
  label: string
  value: HSLBandShift
  disabled: boolean
  fieldLabels: Record<keyof HSLBandShift, string>
  onChange: (shift: Partial<HSLBandShift>) => void
}) {
  const titleId = useId()

  return (
    <section
      role="group"
      data-hsl-band={band}
      aria-labelledby={titleId}
      className="grid gap-2.5"
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          data-hsl-band-swatch={band}
          className="size-2.5 shrink-0 rounded-full ring-1 ring-[oklch(from_var(--color-lf-on-surface)_l_c_h_/_0.18)]"
          style={{ backgroundColor: HSL_BAND_SWATCH[band] }}
        />
        <h4
          id={titleId}
          className="text-[0.78rem] font-medium text-lf-on-surface/82"
        >
          {label}
        </h4>
      </div>
      <div className="grid gap-2">
        {HSL_FIELDS.map((field) => (
          <HSLFieldRow
            key={field.key}
            label={fieldLabels[field.key]}
            value={value[field.key]}
            disabled={disabled}
            onChange={(next) => onChange({ [field.key]: next })}
          />
        ))}
      </div>
    </section>
  )
}

export function HSLTool({
  value,
  disabled,
  onChange,
  onReset,
}: {
  value: HSLToolValue | undefined
  disabled: boolean
  onChange: (band: HSLBandId, shift: Partial<HSLBandShift>) => void
  onReset: () => void
}) {
  const { t } = useI18n()

  const isNeutral =
    !value || HSL_BAND_ORDER.every((band) => isNeutralBand(value[band]))

  const fieldLabels: Record<keyof HSLBandShift, string> = {
    hue: t('raw.hsl.fields.hue'),
    saturation: t('raw.hsl.fields.saturation'),
    lightness: t('raw.hsl.fields.lightness'),
  }

  return (
    <div className="grid gap-3">
      <div className="grid gap-4">
        {HSL_BAND_ORDER.map((band) => {
          const bandValue = value?.[band] ?? makeNeutralBand()
          return (
            <HSLBandSection
              key={band}
              band={band}
              label={t(HSL_BAND_LABEL_KEY[band])}
              value={bandValue}
              disabled={disabled}
              fieldLabels={fieldLabels}
              onChange={(shift) => onChange(band, shift)}
            />
          )
        })}
      </div>
      <p className="text-[0.78rem] leading-relaxed text-lf-on-surface/72">
        {t('raw.hsl.note')}
      </p>
      <Button
        variant="light"
        size="sm"
        disabled={disabled || isNeutral}
        onClick={onReset}
        className="self-start [&_svg]:size-3.5"
      >
        <RotateCcw aria-hidden="true" />
        {t('raw.hsl.reset')}
      </Button>
    </div>
  )
}
