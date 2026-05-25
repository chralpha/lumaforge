import { m } from 'motion/react'

import { clsxm } from '~/lib/cn'

const LEVELS = ['off', 'light', 'standard', 'strong'] as const

export function IntensityChips({
  value,
  onChange,
}: {
  value: (typeof LEVELS)[number]
  onChange: (value: (typeof LEVELS)[number]) => void
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Intensity"
      className="relative inline-flex w-full max-w-full items-stretch gap-0 rounded-md bg-[oklch(from_var(--color-lf-ink)_l_c_h_/_0.05)] p-0.5"
    >
      {LEVELS.map((level) => {
        const isActive = value === level
        const label = level[0].toUpperCase() + level.slice(1)
        return (
          <button
            key={level}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onChange(level)}
            className={clsxm(
              'relative z-10 inline-flex flex-1 items-center justify-center rounded-[5px] px-2 py-1 text-[0.78rem] font-semibold transition-colors duration-150',
              'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-lf-green',
              isActive ? 'text-lf-ink' : 'text-lf-ink/55 hover:text-lf-ink/80',
            )}
          >
            {isActive && (
              <m.span
                layoutId="intensity-chip-indicator"
                aria-hidden="true"
                className="absolute inset-0 -z-10 rounded-[5px] bg-lf-paper-high shadow-lf-soft"
                transition={{
                  type: 'spring',
                  stiffness: 460,
                  damping: 38,
                  mass: 0.6,
                }}
              />
            )}
            <span className="relative">{label}</span>
          </button>
        )
      })}
    </div>
  )
}
