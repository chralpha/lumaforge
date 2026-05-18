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
                'min-h-[46px] rounded-lg border text-[0.82rem] font-semibold transition-colors',
                active
                  ? 'border-amber-400 bg-amber-400/15 text-amber-300'
                  : 'border-white/15 bg-black/38 text-white backdrop-blur-background hover:border-white/30',
              )}
            >
              {labels[level]}
            </m.button>
          )
        })}
      </div>
      <p className="m-0 text-xs leading-relaxed text-white/65">
        {t('raw.mobile.strength.note')}
      </p>
    </div>
  )
}
