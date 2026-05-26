import { SegmentGroup, SegmentItem } from '~/components/ui/segment'
import { cn } from '~/lib/cn'
import { useI18n } from '~/lib/i18n'

const LEVELS = ['off', 'light', 'standard', 'strong'] as const

export type StrengthLevel = (typeof LEVELS)[number]

function isStrengthLevel(value: string): value is StrengthLevel {
  return (LEVELS as readonly string[]).includes(value)
}

export function StrengthControl({
  value,
  onChange,
  disabled,
  className,
  itemClassName,
}: {
  value: StrengthLevel
  onChange: (value: StrengthLevel) => void
  disabled: boolean
  className?: string
  itemClassName?: string
}) {
  const { t } = useI18n()
  const labels: Record<StrengthLevel, string> = {
    off: t('raw.strength.off'),
    light: t('raw.strength.light'),
    standard: t('raw.strength.standard'),
    strong: t('raw.strength.strong'),
  }

  return (
    <div aria-disabled={disabled} className={disabled ? 'opacity-50' : ''}>
      <SegmentGroup
        value={value}
        onValueChanged={(value) => {
          if (isStrengthLevel(value)) {
            onChange(value)
          }
        }}
        aria-label={t('raw.strength.title')}
        disabled={disabled}
        className={cn('w-full', className)}
      >
        {LEVELS.map((level) => (
          <SegmentItem
            key={level}
            value={level}
            label={labels[level]}
            className={cn('flex-1', itemClassName)}
          />
        ))}
      </SegmentGroup>
    </div>
  )
}
