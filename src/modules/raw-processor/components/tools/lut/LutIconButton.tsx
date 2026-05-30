import type { ReactNode, Ref } from 'react'

import { clsxm } from '~/lib/cn'

export function LutIconButton({
  label,
  busy,
  disabled,
  ariaControls,
  ariaExpanded,
  ariaHasPopup,
  buttonRef,
  onClick,
  children,
}: {
  label: string
  busy?: boolean
  disabled?: boolean
  ariaControls?: string
  ariaExpanded?: boolean
  ariaHasPopup?: 'dialog'
  buttonRef?: Ref<HTMLButtonElement>
  onClick?: () => void
  children: ReactNode
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label={label}
      aria-busy={busy || undefined}
      aria-controls={ariaControls}
      aria-expanded={ariaExpanded}
      aria-haspopup={ariaHasPopup}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={clsxm(
        "relative inline-flex size-8 items-center justify-center rounded-md bg-[oklch(from_var(--color-lf-on-surface)_l_c_h_/_0.04)] text-lf-on-surface/60 transition-colors duration-150 before:absolute before:inset-x-0 before:-inset-y-[7px] before:content-[''] hover:bg-[oklch(from_var(--color-lf-on-surface)_l_c_h_/_0.08)] hover:text-lf-on-surface focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-lf-green disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:size-[15px] [&_svg]:stroke-[1.75]",
        busy && '[&_svg]:animate-spin motion-reduce:[&_svg]:animate-none',
      )}
      data-raw-lut="source-icon-button"
      data-raw-lut-busy={busy ? 'true' : undefined}
    >
      {children}
    </button>
  )
}
