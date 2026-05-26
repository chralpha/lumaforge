import { m } from 'motion/react'

import { clsxm } from '~/lib/cn'
import { useI18n } from '~/lib/i18n'

import { TAP_SPRING } from '../../motion'
import type { StrengthLevel } from '../tools/StrengthControl'

const LEVELS: StrengthLevel[] = ['off', 'light', 'standard', 'strong']

export function MobileStrengthPanel(props: {
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
    <div className="grid gap-3" data-mobile-strength-panel>
      <div
        role="radiogroup"
        aria-label={t('raw.strength.title')}
        aria-disabled={props.disabled || undefined}
        className={clsxm(
          'grid grid-cols-4 gap-1.5',
          props.disabled && 'pointer-events-none opacity-45',
        )}
      >
        {LEVELS.map((level) => {
          const active = props.value === level
          return (
            <m.button
              key={level}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={props.disabled}
              whileTap={props.disabled ? undefined : { scale: 0.97 }}
              transition={TAP_SPRING}
              onClick={() => props.onChange(level)}
              className={clsxm(
                'min-h-lf-tap rounded-md border text-lf-control font-semibold transition-colors',
                active
                  ? 'border-lf-amber bg-lf-amber/15 text-lf-amber-soft'
                  : 'border-lf-on-photo-bord-soft bg-lf-on-photo-bg text-lf-hero-ink/82 backdrop-blur-background hover:border-lf-amber/55 hover:text-lf-hero-ink',
              )}
            >
              {labels[level]}
            </m.button>
          )
        })}
      </div>
      <p className="m-0 text-xs leading-relaxed text-lf-hero-ink/68">
        {t('raw.mobile.strength.note')}
      </p>
    </div>
  )
}
