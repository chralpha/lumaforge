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
        'block w-full min-w-0 rounded-lf-control border border-lf-hairline bg-lf-paper px-2.5 py-2 text-left text-lf-body leading-snug text-lf-ink-soft transition hover:-translate-y-px hover:border-lf-green/50 hover:bg-lf-paper-low hover:text-lf-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lf-green',
        highlighted && 'border-lf-amber/45 bg-lf-amber/12 text-lf-ink',
        isActive && 'border-lf-green bg-lf-green/10 text-lf-ink',
      )}
      data-raw-lut="contract-option"
    >
      <span className="block min-w-0 break-words">{buttonLabel}</span>
    </button>
  )
}
