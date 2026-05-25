import { Check } from 'lucide-react'

import { clsxm } from '~/lib/cn'
import { useI18n } from '~/lib/i18n'

import type { LUTOutputOption } from './lut-output-options'

export function LUTOutputOptionButton({
  option,
  activeOptionId,
  onSelect,
  highlighted = false,
}: {
  option: LUTOutputOption
  activeOptionId?: string
  onSelect: (option: LUTOutputOption) => void
  highlighted?: boolean
}) {
  const { t } = useI18n()
  const isActive = activeOptionId === option.id

  return (
    <button
      type="button"
      aria-label={t('raw.lutContract.useOutput', { label: option.label })}
      aria-pressed={isActive}
      onClick={() => onSelect(option)}
      className={clsxm(
        'group/lut-row relative grid w-full min-w-0 grid-cols-[18px_minmax(0,1fr)] items-center gap-1.5 rounded-md px-2 py-2 text-left transition-colors duration-150 ease-out',
        'text-lf-ink/80',
        'hover:bg-[oklch(from_var(--color-lf-ink)_l_c_h_/_0.045)] hover:text-lf-ink',
        'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-lf-green',
        highlighted &&
          !isActive &&
          'bg-[oklch(from_var(--color-lf-amber)_l_c_h_/_0.10)] text-lf-ink',
        isActive &&
          'bg-[oklch(from_var(--color-lf-green)_l_c_h_/_0.12)] text-lf-green-deep',
      )}
      data-raw-lut="contract-option"
    >
      <span
        aria-hidden="true"
        className="inline-flex size-[18px] items-center justify-center"
      >
        {isActive ? (
          <Check className="size-[14px] stroke-[2.4] text-lf-green-deep" />
        ) : null}
      </span>
      <span
        className={clsxm(
          'block min-w-0 break-words text-lf-body leading-snug',
          isActive ? 'font-semibold' : 'font-medium',
        )}
      >
        {option.label}
      </span>
    </button>
  )
}
