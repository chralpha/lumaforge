import { RotateCcw } from 'lucide-react'
import { useId } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { useI18n } from '~/lib/i18n'

import { ToolSection } from './ToolSection'

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
  const { register, watch, reset } = useForm<ToneValue>({
    values: value,
    defaultValues: TONE_DEFAULTS,
  })

  const exposureId = useId()
  const contrastId = useId()
  const highlightsId = useId()
  const shadowsId = useId()
  const whitesId = useId()
  const blacksId = useId()

  const currentValues = watch()
  const isNeutral = Object.entries(currentValues).every(
    ([key, val]) => val === TONE_DEFAULTS[key as keyof ToneValue],
  )

  const handleReset = () => {
    reset(TONE_DEFAULTS)
    onReset()
  }

  const registerRange = (field: keyof ToneValue) =>
    register(field, {
      valueAsNumber: true,
      onChange: (event) =>
        onChange({ [field]: Number(event.currentTarget.value) }),
    })

  return (
    <ToolSection title={t('raw.tone.title')} eyebrow={t('raw.tone.eyebrow')}>
      <div className="raw-tone-control">
        <div className="raw-tone-control-field">
          <label htmlFor={exposureId}>{t('raw.tone.exposure')}</label>
          <output aria-hidden="true">
            {value.userExposureEv.toFixed(2)} EV
          </output>
          <input
            id={exposureId}
            type="range"
            min={-5}
            max={5}
            step={0.01}
            disabled={disabled}
            {...registerRange('userExposureEv')}
          />
        </div>
        <div className="raw-tone-control-field">
          <label htmlFor={contrastId}>{t('raw.tone.contrast')}</label>
          <output aria-hidden="true">{Math.round(value.userContrast)}</output>
          <input
            id={contrastId}
            type="range"
            min={-100}
            max={100}
            step={1}
            disabled={disabled}
            {...registerRange('userContrast')}
          />
        </div>
        <div className="raw-tone-control-field">
          <label htmlFor={highlightsId}>{t('raw.tone.highlights')}</label>
          <output aria-hidden="true">{Math.round(value.userHighlights)}</output>
          <input
            id={highlightsId}
            type="range"
            min={-100}
            max={100}
            step={1}
            disabled={disabled}
            {...registerRange('userHighlights')}
          />
        </div>
        <div className="raw-tone-control-field">
          <label htmlFor={shadowsId}>{t('raw.tone.shadows')}</label>
          <output aria-hidden="true">{Math.round(value.userShadows)}</output>
          <input
            id={shadowsId}
            type="range"
            min={-100}
            max={100}
            step={1}
            disabled={disabled}
            {...registerRange('userShadows')}
          />
        </div>
        <div className="raw-tone-control-field">
          <label htmlFor={whitesId}>{t('raw.tone.whites')}</label>
          <output aria-hidden="true">{Math.round(value.userWhites)}</output>
          <input
            id={whitesId}
            type="range"
            min={-100}
            max={100}
            step={1}
            disabled={disabled}
            {...registerRange('userWhites')}
          />
        </div>
        <div className="raw-tone-control-field">
          <label htmlFor={blacksId}>{t('raw.tone.blacks')}</label>
          <output aria-hidden="true">{Math.round(value.userBlacks)}</output>
          <input
            id={blacksId}
            type="range"
            min={-100}
            max={100}
            step={1}
            disabled={disabled}
            {...registerRange('userBlacks')}
          />
        </div>
      </div>
      <p className="raw-tool-note">{t('raw.tone.note')}</p>
      {!isNeutral && <p className="raw-tool-note">{t('raw.tone.preserved')}</p>}
      <button
        type="button"
        className="raw-tool-reset-button"
        disabled={disabled}
        onClick={handleReset}
      >
        <RotateCcw aria-hidden="true" />
        {t('raw.tone.reset')}
      </button>
    </ToolSection>
  )
}
