import type { ProcessingParams } from '@lumaforge/luma-color-runtime'
import { RotateCcw } from 'lucide-react'
import { useId } from 'react'

import { useI18n } from '~/lib/i18n'

import { ToolSection } from './ToolSection'

export type ToneValue = Pick<
  ProcessingParams,
  | 'userExposureEv'
  | 'userContrast'
  | 'userHighlights'
  | 'userShadows'
  | 'userWhites'
  | 'userBlacks'
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
  const highlightsId = useId()
  const shadowsId = useId()
  const whitesId = useId()
  const blacksId = useId()
  const isNeutral =
    value.userExposureEv === 0 &&
    value.userContrast === 0 &&
    value.userHighlights === 0 &&
    value.userShadows === 0 &&
    value.userWhites === 0 &&
    value.userBlacks === 0

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
        <div className="raw-tone-control-field">
          <label htmlFor={highlightsId}>{t('raw.tone.highlights')}</label>
          <output aria-hidden="true">{Math.round(value.userHighlights)}</output>
          <input
            id={highlightsId}
            type="range"
            min={-100}
            max={100}
            step={1}
            value={value.userHighlights}
            disabled={disabled}
            onChange={(event) =>
              onChange({ userHighlights: Number(event.currentTarget.value) })
            }
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
            value={value.userShadows}
            disabled={disabled}
            onChange={(event) =>
              onChange({ userShadows: Number(event.currentTarget.value) })
            }
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
            value={value.userWhites}
            disabled={disabled}
            onChange={(event) =>
              onChange({ userWhites: Number(event.currentTarget.value) })
            }
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
            value={value.userBlacks}
            disabled={disabled}
            onChange={(event) =>
              onChange({ userBlacks: Number(event.currentTarget.value) })
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
