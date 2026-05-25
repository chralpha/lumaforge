import type { LUTColorProfile } from '@lumaforge/luma-color-runtime'
import { Aperture } from 'lucide-react'

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
        'group/lut-row relative grid w-full min-w-0 grid-cols-[22px_minmax(0,1fr)] items-center gap-2 rounded-md px-1.5 py-1.5 text-left transition-colors duration-150 ease-out',
        'text-lf-ink/75',
        'hover:bg-[oklch(from_var(--color-lf-ink)_l_c_h_/_0.045)] hover:text-lf-ink/90',
        'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-lf-green',
        highlighted &&
          !isActive &&
          'bg-[oklch(from_var(--color-lf-amber)_l_c_h_/_0.10)] text-lf-ink/90',
        isActive &&
          'bg-[oklch(from_var(--color-lf-green)_l_c_h_/_0.12)] text-lf-green-deep',
      )}
      data-raw-lut="contract-option"
    >
      <span
        aria-hidden="true"
        className={clsxm(
          'inline-grid size-[22px] place-items-center rounded-md transition-colors duration-150',
          isActive
            ? 'bg-[oklch(from_var(--color-lf-green)_l_c_h_/_0.18)] text-lf-green-deep'
            : highlighted
              ? 'bg-[oklch(from_var(--color-lf-amber)_l_c_h_/_0.16)] text-lf-ink/70'
              : 'bg-[oklch(from_var(--color-lf-ink)_l_c_h_/_0.05)] text-lf-ink/45 group-hover/lut-row:bg-[oklch(from_var(--color-lf-ink)_l_c_h_/_0.08)] group-hover/lut-row:text-lf-ink/65',
        )}
      >
        <Aperture className="size-[12px] stroke-[1.75]" />
      </span>
      <span
        className={clsxm(
          'block min-w-0 break-words text-[0.74rem] leading-[1.35]',
          isActive ? 'font-semibold' : 'font-normal',
        )}
      >
        {buttonLabel}
      </span>
    </button>
  )
}
