import { RotateCcw } from 'lucide-react'
import { useLayoutEffect, useRef } from 'react'
import { z } from 'zod'

import { Button } from '~/components/ui/button'
import { Slider } from '~/components/ui/slider'
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
  labelKey: string
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

function ToneSlider({
  label,
  value,
  min,
  max,
  step,
  disabled,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  disabled: boolean
  onChange: (value: number) => void
}) {
  const rootRef = useRef<HTMLSpanElement | null>(null)

  useLayoutEffect(() => {
    rootRef.current
      ?.querySelector<HTMLElement>('[role="slider"]')
      ?.setAttribute('aria-label', label)
  }, [label])

  return (
    <Slider
      ref={rootRef}
      aria-label={label}
      value={[value]}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      onValueChange={([v]) => onChange(v)}
    />
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

  const handleReset = () => {
    onReset()
  }

  const formatValue = (key: keyof ToneValue, val: number) =>
    key === 'userExposureEv' ? `${val.toFixed(2)} EV` : `${Math.round(val)}`

  return (
    <div className="grid gap-3">
      {FIELDS.map((field) => {
        const label = t(field.labelKey)

        return (
          <div
            key={field.key}
            className={
              field.group === 'fine' ? 'grid gap-2 pt-1' : 'grid gap-2'
            }
          >
            <div className="flex items-center justify-between text-callout">
              <label className="font-medium text-text">{label}</label>
              <output
                aria-hidden="true"
                className="tabular-nums text-text-secondary"
              >
                {formatValue(field.key, value[field.key])}
              </output>
            </div>
            <ToneSlider
              label={label}
              value={value[field.key]}
              min={field.min}
              max={field.max}
              step={field.step}
              disabled={disabled}
              onChange={(v) => onChange({ [field.key]: v })}
            />
          </div>
        )
      })}
      <p className="text-callout text-text-secondary">{t('raw.tone.note')}</p>
      {!isNeutral && (
        <p className="text-callout text-text-secondary">
          {t('raw.tone.preserved')}
        </p>
      )}
      <Button
        variant="light"
        size="sm"
        disabled={disabled}
        onClick={handleReset}
      >
        <RotateCcw aria-hidden="true" />
        {t('raw.tone.reset')}
      </Button>
    </div>
  )
}
