import { SegmentGroup, SegmentItem } from '~/components/ui/segment'
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
      aria-disabled={disabled}
      className={disabled ? 'pointer-events-none opacity-50' : ''}
    >
      <SegmentGroup
        // SegmentGroup is internally uncontrolled; the key re-seeds it after external resets.
        key={value}
        value={value}
        onValueChanged={(value) => onChange(value as StrengthLevel)}
        className="w-full"
      >
        {LEVELS.map((level) => (
          <SegmentItem
            key={level}
            value={level}
            label={labels[level]}
            className="flex-1"
          />
        ))}
      </SegmentGroup>
    </div>
  )
}
