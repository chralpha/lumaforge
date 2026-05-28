import { SegmentGroup, SegmentItem } from '~/components/ui/segment'
import { cn } from '~/lib/cn'
import { useI18n } from '~/lib/i18n'

const LEVELS = ['off', 'light', 'standard', 'strong'] as const

export type StrengthLevel = (typeof LEVELS)[number]
export type StrengthControlSize = 'sm' | 'md'

function isStrengthLevel(value: string): value is StrengthLevel {
  return (LEVELS as readonly string[]).includes(value)
}

const TRACK_BASE =
  'w-full rounded-md border border-lf-on-photo-bord-soft bg-lf-on-photo-bg p-1'

const ITEM_BASE = cn(
  'flex-1 font-medium text-lf-hero-ink/72 transition-colors duration-150',
  'hover:text-lf-hero-ink/92',
  'data-[state=active]:font-semibold data-[state=active]:text-lf-hero-ink',
  // Lifted-plate thumb: keep the lf-on-photo-bg-strong fill (so the depressed
  // iOS metaphor still reads), but stack an inset hairline + top highlight so
  // it doesn't collide with the track's effective lightness on dark chrome.
  'data-[state=active]:[&_span[data-segment-thumb]]:bg-lf-on-photo-bg-strong',
  'data-[state=active]:[&_span[data-segment-thumb]]:shadow-[inset_0_0_0_1px_oklch(0.96_0.006_255/0.14),inset_0_1px_0_oklch(0.96_0.006_255/0.22),0_1px_2px_oklch(0.04_0.006_255/0.45)]',
)

const SIZE_TRACK = {
  sm: 'h-9',
  md: 'h-11',
} as const

const SIZE_ITEM = {
  sm: 'text-[0.76rem]',
  md: 'text-lf-control',
} as const

export function StrengthControl({
  value,
  onChange,
  disabled,
  size = 'sm',
  className,
  itemClassName,
}: {
  value: StrengthLevel
  onChange: (value: StrengthLevel) => void
  disabled: boolean
  size?: StrengthControlSize
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
        className={cn(TRACK_BASE, SIZE_TRACK[size], className)}
      >
        {LEVELS.map((level) => (
          <SegmentItem
            key={level}
            value={level}
            label={labels[level]}
            className={cn(ITEM_BASE, SIZE_ITEM[size], itemClassName)}
          />
        ))}
      </SegmentGroup>
    </div>
  )
}
