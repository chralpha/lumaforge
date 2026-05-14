import type { LUTColorProfile } from '@lumaforge/luma-color-runtime'

import { getProfileContractLabel } from '../lut-contract'

export function LUTProfileButton({
  profile,
  activeProfileId,
  onSelect,
  label,
  ariaLabel,
  highlighted = false,
}: {
  profile: LUTColorProfile
  activeProfileId?: string
  onSelect: (profile: LUTColorProfile) => void
  label?: string
  ariaLabel?: string
  highlighted?: boolean
}) {
  const isActive = activeProfileId === profile.id
  const buttonLabel = label ?? getProfileContractLabel(profile)

  return (
    <button
      type="button"
      aria-label={ariaLabel ?? buttonLabel}
      aria-pressed={isActive}
      onClick={() => onSelect(profile)}
      className={
        isActive
          ? 'raw-lut-contract-option raw-lut-contract-option-active'
          : highlighted
            ? 'raw-lut-contract-option raw-lut-contract-option-suggested'
            : 'raw-lut-contract-option'
      }
    >
      <span className="block min-w-0 break-words">{buttonLabel}</span>
    </button>
  )
}
