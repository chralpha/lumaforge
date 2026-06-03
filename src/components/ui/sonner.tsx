import { Toaster as Sonner } from 'sonner'

import { useThemeAtomValue, useViewport } from '~/hooks/common'

type ToasterProps = React.ComponentProps<typeof Sonner>

const selectMobileToastPosition = (value: { w: number }) =>
  value.w < 1024 && value.w !== 0

const rawRouteToastClass =
  '[.luma-route-raw_&]:!rounded-md [.luma-route-raw_&]:!border-lf-on-photo-bord-soft [.luma-route-raw_&]:!bg-lf-on-photo-bg-strong [.luma-route-raw_&]:!text-lf-on-photo-ink [.luma-route-raw_&]:!shadow-lf-popover [.luma-route-raw_&]:!ring-lf-on-photo-bord-soft [.luma-route-raw_&]:!backdrop-blur-background'

const rawRouteTitleClass =
  '[.luma-route-raw_&]:!text-[0.78rem] [.luma-route-raw_&]:!font-semibold [.luma-route-raw_&]:!text-lf-on-photo-ink'

const rawRouteDescriptionClass =
  '[.luma-route-raw_&]:!text-[0.72rem] [.luma-route-raw_&]:!leading-relaxed [.luma-route-raw_&]:!text-lf-on-photo-ink/68'

const rawRouteIconClass = '[.luma-route-raw_&]:!text-lf-green'

const rawRouteCloseButtonClass =
  '[.luma-route-raw_&]:!size-7 [.luma-route-raw_&]:!min-h-7 [.luma-route-raw_&]:!min-w-7 [.luma-route-raw_&]:!rounded-md [.luma-route-raw_&]:!border-lf-on-photo-bord-soft [.luma-route-raw_&]:!bg-lf-on-photo-bg [.luma-route-raw_&]:!text-lf-on-photo-ink/64 [.luma-route-raw_&]:hover:!text-lf-on-photo-ink'

const rawRouteActionButtonClass =
  '[.luma-route-raw_&]:!rounded-md [.luma-route-raw_&]:!bg-lf-green [.luma-route-raw_&]:!text-lf-on-photo-ink [.luma-route-raw_&]:hover:!bg-lf-green-hover'

const rawRouteCancelButtonClass =
  '[.luma-route-raw_&]:!rounded-md [.luma-route-raw_&]:!border-lf-on-photo-bord-soft [.luma-route-raw_&]:!bg-lf-on-photo-bg [.luma-route-raw_&]:!text-lf-on-photo-ink/78 [.luma-route-raw_&]:hover:!bg-lf-on-photo-bg-strong'

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
          toast: `group pointer-events-auto flex gap-3 rounded-xl border border-border bg-background/80 backdrop-blur supports-backdrop-filter:bg-background/70 shadow-lg shadow-black/5 ring-1 ring-border max-sm:!border-white/15 max-sm:!bg-black/80 max-sm:!text-white max-sm:shadow-black/40 max-sm:!ring-white/10 ${rawRouteToastClass}`,
          // Title & description
          title: `text-text font-medium max-sm:!text-white ${rawRouteTitleClass}`,
          description: `text-text-tertiary text-sm leading-relaxed max-sm:!text-white/70 ${rawRouteDescriptionClass}`,
          // Icon & close button
          icon: `text-accent size-4 max-sm:text-accent ${rawRouteIconClass}`,
          closeButton: `min-h-11 min-w-11 text-text-quaternary transition-opacity duration-200 hover:text-text max-sm:!border-white/15 max-sm:!bg-black/80 max-sm:!text-white/70 max-sm:hover:!text-white ${rawRouteCloseButtonClass}`,
          // Action buttons
          actionButton: `rounded-md bg-accent text-background px-2.5 py-1 text-xs font-medium hover:bg-accent/90 ${rawRouteActionButtonClass}`,
          cancelButton: `rounded-md border border-border bg-fill px-2.5 py-1 text-xs font-medium text-text hover:bg-fill-secondary ${rawRouteCancelButtonClass}`,
        },
      }}
      {...props}
    />
  )
}
