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
        'block w-full min-w-0 rounded-md border border-border bg-background px-2.5 py-2 text-left text-callout leading-snug text-text-secondary transition hover:-translate-y-px hover:border-accent/50 hover:bg-fill-secondary hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        highlighted && 'border-yellow-600/30 bg-yellow-500/10 text-text',
        isActive && 'border-accent bg-accent/10 text-text',
      )}
      data-raw-lut="contract-option"
    >
      <span className="block min-w-0 break-words">{option.label}</span>
    </button>
  )
}
