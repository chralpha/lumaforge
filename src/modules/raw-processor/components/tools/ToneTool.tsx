import type { ProcessingParams } from '@lumaforge/luma-color-runtime'
import { RotateCcw } from 'lucide-react'
import { useId } from 'react'

import { useI18n } from '~/lib/i18n'

import { ToolSection } from './ToolSection'

export type ToneValue = Pick<
  ProcessingParams,
  'userExposureEv' | 'userContrast'
>

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
  const exposureId = useId()
  const contrastId = useId()
  const isNeutral = value.userExposureEv === 0 && value.userContrast === 0

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
            value={value.userExposureEv}
            disabled={disabled}
            onChange={(event) =>
              onChange({ userExposureEv: Number(event.currentTarget.value) })
            }
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
            value={value.userContrast}
            disabled={disabled}
            onChange={(event) =>
              onChange({ userContrast: Number(event.currentTarget.value) })
            }
          />
        </div>
      </div>
      <p className="raw-tool-note">{t('raw.tone.note')}</p>
      {!isNeutral && <p className="raw-tool-note">{t('raw.tone.preserved')}</p>}
      <button
        type="button"
        className="raw-tool-reset-button"
        disabled={disabled}
        onClick={onReset}
      >
        <RotateCcw aria-hidden="true" />
        {t('raw.tone.reset')}
      </button>
    </ToolSection>
  )
}
