import type { ReactNode, Ref } from 'react'

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
      className={
        busy
          ? 'raw-lut-source-icon-button raw-lut-source-icon-button-busy'
          : 'raw-lut-source-icon-button'
      }
    >
      {children}
    </button>
  )
}
