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
        "relative inline-flex size-8 items-center justify-center rounded-lf-control border border-lf-hairline bg-lf-paper text-lf-ink-soft transition before:absolute before:inset-x-0 before:-inset-y-[7px] before:content-[''] hover:-translate-y-px hover:border-lf-green/50 hover:bg-lf-paper-low hover:text-lf-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lf-green disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:size-[15px] [&_svg]:stroke-2",
        busy && '[&_svg]:animate-spin motion-reduce:[&_svg]:animate-none',
      )}
      data-raw-lut="source-icon-button"
      data-raw-lut-busy={busy ? 'true' : undefined}
    >
      {children}
    </button>
  )
}
