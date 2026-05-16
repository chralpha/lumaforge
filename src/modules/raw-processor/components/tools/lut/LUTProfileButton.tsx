import type { LUTColorProfile } from '@lumaforge/luma-color-runtime'

import { clsxm } from '~/lib/cn'

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
      className={clsxm(
        'block w-full min-w-0 rounded-md border border-border bg-background px-2.5 py-2 text-left text-callout leading-snug text-text-secondary transition hover:-translate-y-px hover:border-accent/50 hover:bg-fill-secondary hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        highlighted && 'border-yellow-600/30 bg-yellow-500/10 text-text',
        isActive && 'border-accent bg-accent/10 text-text',
      )}
      data-raw-lut="contract-option"
    >
      <span className="block min-w-0 break-words">{buttonLabel}</span>
    </button>
  )
}
