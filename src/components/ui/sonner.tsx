import { Toaster as Sonner } from 'sonner'

import { useThemeAtomValue, useViewport } from '~/hooks/common'

type ToasterProps = React.ComponentProps<typeof Sonner>

const selectMobileToastPosition = (value: { w: number }) =>
  value.w < 1024 && value.w !== 0

export const Toaster = ({ position, ...props }: ToasterProps) => {
  const theme = useThemeAtomValue()
  const isMobile = useViewport(selectMobileToastPosition)

  return (
    <Sonner
      theme={theme}
      position={position ?? (isMobile ? 'top-center' : 'bottom-left')}
      richColors={!isMobile}
      expand
      closeButton
      duration={isMobile ? 2200 : 3500}
      offset="16px"
      className="toaster group"
      toastOptions={{
        classNames: {
          // Card shell
          toast:
            'group pointer-events-auto flex gap-3 rounded-xl border border-border bg-background/80 backdrop-blur supports-backdrop-filter:bg-background/70 shadow-lg shadow-black/5 ring-1 ring-border max-sm:!border-white/15 max-sm:!bg-black/80 max-sm:!text-white max-sm:shadow-black/40 max-sm:!ring-white/10',
          // Title & description
          title: 'text-text font-medium max-sm:!text-white',
          description:
            'text-text-tertiary text-sm leading-relaxed max-sm:!text-white/70',
          // Icon & close button
          icon: 'text-accent size-4 max-sm:text-accent',
          closeButton:
            'min-h-11 min-w-11 text-text-quaternary transition-opacity duration-200 hover:text-text max-sm:!border-white/15 max-sm:!bg-black/80 max-sm:!text-white/70 max-sm:hover:!text-white',
          // Action buttons
          actionButton:
            'rounded-md bg-accent text-background px-2.5 py-1 text-xs font-medium hover:bg-accent/90',
          cancelButton:
            'rounded-md border border-border bg-fill px-2.5 py-1 text-xs font-medium text-text hover:bg-fill-secondary',
        },
      }}
      {...props}
    />
  )
}
