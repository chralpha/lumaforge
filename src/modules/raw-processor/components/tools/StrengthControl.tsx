import { useI18n } from '~/lib/i18n'

const LEVELS = ['off', 'light', 'standard', 'strong'] as const

export type StrengthLevel = (typeof LEVELS)[number]

export function StrengthControl({
  value,
  onChange,
  disabled,
}: {
  value: StrengthLevel
  onChange: (value: StrengthLevel) => void
  disabled: boolean
}) {
  const { t } = useI18n()
  const labels: Record<StrengthLevel, string> = {
    off: t('raw.strength.off'),
    light: t('raw.strength.light'),
    standard: t('raw.strength.standard'),
    strong: t('raw.strength.strong'),
  }

  return (
    <div
      className="raw-strength-control"
      role="group"
      aria-label={t('raw.strength.title')}
    >
      {LEVELS.map((level) => (
        <button
          key={level}
          type="button"
          aria-pressed={value === level}
          disabled={disabled}
          onClick={() => onChange(level)}
        >
          {labels[level]}
        </button>
      ))}
    </div>
  )
}
