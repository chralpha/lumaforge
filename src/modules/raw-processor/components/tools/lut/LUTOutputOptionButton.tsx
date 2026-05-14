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
      className={
        isActive
          ? 'raw-lut-contract-option raw-lut-contract-option-active'
          : highlighted
            ? 'raw-lut-contract-option raw-lut-contract-option-suggested'
            : 'raw-lut-contract-option'
      }
    >
      <span className="block min-w-0 break-words">{option.label}</span>
    </button>
  )
}
