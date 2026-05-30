import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { m } from 'motion/react'
import type { ReactNode } from 'react'

import { Dialog, DialogDescription, DialogTitle } from '~/components/ui/dialog'
import { clsxm } from '~/lib/cn'

import { useRawLabPortalContainer } from './lut-browser-layout'

export function LutBrowserDialog({
  open,
  id,
  kind,
  className,
  dialogLabel,
  title,
  description,
  closeLabel,
  onOpenChange,
  children,
}: {
  open: boolean
  id: string
  kind: 'source' | 'contract'
  className?: string
  dialogLabel: string
  title: ReactNode
  description: ReactNode
  closeLabel: string
  onOpenChange: (open: boolean) => void
  children: ReactNode
}) {
  const portalContainer = useRawLabPortalContainer(open)

  return (
    <Dialog modal open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal
        container={portalContainer ?? undefined}
        forceMount
      >
        {open && (
          <>
            <DialogPrimitive.Overlay asChild forceMount>
              <m.div
                key={`${id}-overlay`}
                data-raw-lut-browser-overlay=""
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12, ease: [0.22, 1, 0.36, 1] }}
                className="fixed inset-0 z-[59] bg-[oklch(0.18_0.018_76/0.32)] backdrop-blur-[2px]"
              />
            </DialogPrimitive.Overlay>
            <div className="pointer-events-none fixed inset-0 z-[60] grid place-items-center p-4 max-[640px]:items-end max-[640px]:p-0">
              <DialogPrimitive.Content
                id={id}
                forceMount
                asChild
                data-raw-lut-browser-dialog={kind}
                onOpenAutoFocus={(event) => {
                  event.preventDefault()
                }}
              >
                <m.div
                  key={`${id}-card`}
                  initial={{ opacity: 0, y: 8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.985 }}
                  transition={{
                    type: 'spring',
                    stiffness: 420,
                    damping: 34,
                    mass: 0.7,
                  }}
                  className={clsxm(
                    'pointer-events-auto grid w-full max-w-[560px] gap-2.5 overflow-hidden rounded-xl border border-border-secondary bg-lf-surface-raised p-3 shadow-lf-lift',
                    'max-h-[min(720px,85svh)] min-h-[min(360px,70svh)]',
                    'max-[640px]:w-[calc(100%-1rem)] max-[640px]:max-w-none max-[640px]:rounded-t-xl max-[640px]:rounded-b-none max-[640px]:mb-0',
                    className,
                  )}
                >
                  <DialogTitle className="sr-only">{dialogLabel}</DialogTitle>
                  <DialogDescription className="sr-only">
                    {description}
                  </DialogDescription>
                  <div className="flex min-w-0 items-start justify-between gap-2.5 px-1 pt-0.5">
                    <div aria-hidden="true" className="min-w-0">
                      <p className="m-0 min-w-0 truncate text-[0.82rem] font-semibold text-lf-on-surface/90">
                        {title}
                      </p>
                      <p className="mt-0.5 min-w-0 truncate text-[0.7rem] tracking-tight text-lf-on-surface/50">
                        {description}
                      </p>
                    </div>
                    <DialogPrimitive.Close
                      type="button"
                      aria-label={closeLabel}
                      title={closeLabel}
                      className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-transparent text-lf-on-surface/55 transition-colors duration-150 hover:bg-[oklch(from_var(--color-lf-on-surface)_l_c_h_/_0.06)] hover:text-lf-on-surface focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-lf-green [&_svg]:size-[15px] [&_svg]:stroke-[1.75]"
                    >
                      <X aria-hidden="true" />
                    </DialogPrimitive.Close>
                  </div>
                  {children}
                </m.div>
              </DialogPrimitive.Content>
            </div>
          </>
        )}
      </DialogPrimitive.Portal>
    </Dialog>
  )
}
