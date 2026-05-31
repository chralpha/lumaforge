import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { m } from 'motion/react'
import type { CSSProperties, ReactNode } from 'react'
import { useEffect, useRef } from 'react'

import { Dialog, DialogDescription, DialogTitle } from '~/components/ui/dialog'
import { clsxm } from '~/lib/cn'

import type { OnlineLutBrowserLayout } from './lut-browser-layout'
import {
  isInsideElement,
  toBrowserStyle,
  useRawLabPortalContainer,
} from './lut-browser-layout'

export function LutBrowserDialog({
  open,
  layout,
  id,
  kind,
  className,
  dialogLabel,
  title,
  description,
  closeLabel,
  restoreFocus,
  triggerElement,
  passthroughElements,
  fillHeight = true,
  onOpenChange,
  children,
}: {
  open: boolean
  layout: OnlineLutBrowserLayout | null
  id: string
  kind: 'source' | 'contract'
  className?: string
  dialogLabel: string
  title: ReactNode
  description: ReactNode
  closeLabel: string
  restoreFocus: () => void
  triggerElement?: HTMLElement | null
  passthroughElements?: () => Iterable<HTMLElement | null | undefined>
  fillHeight?: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
}) {
  const portalContainer = useRawLabPortalContainer(open)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const overlayStyle =
    layout?.placement === 'sidecar' && layout.overlayRight != null
      ? ({
          '--raw-lut-browser-overlay-right': `${layout.overlayRight}px`,
        } as CSSProperties)
      : undefined

  const isPassthroughElement = (target: EventTarget | null) => {
    if (target instanceof Element) {
      const controlledDialogTrigger = target.closest('[aria-haspopup="dialog"]')
      if (controlledDialogTrigger?.getAttribute('aria-controls') === id) {
        return true
      }
    }

    for (const element of passthroughElements?.() ?? [triggerElement]) {
      if (
        !element ||
        (element instanceof HTMLButtonElement && element.disabled) ||
        element.ariaDisabled === 'true'
      ) {
        continue
      }

      if (isInsideElement(target, element)) return true
    }

    return false
  }

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: globalThis.PointerEvent) => {
      if (event.button !== 0) return
      if (isInsideElement(event.target, contentRef.current)) return

      const isScrimTarget =
        event.target instanceof Element &&
        event.target.hasAttribute('data-raw-lut-browser-overlay')

      if (isScrimTarget) {
        const beneath =
          typeof document.elementsFromPoint === 'function'
            ? document.elementsFromPoint(event.clientX, event.clientY)
            : []
        for (const element of beneath) {
          if (element === event.target) continue
          if (isPassthroughElement(element)) {
            if (element instanceof HTMLElement) element.click()
            event.preventDefault()
            return
          }
        }
        event.preventDefault()
        onOpenChange(false)
        return
      }

      if (isPassthroughElement(event.target)) return

      onOpenChange(false)
    }

    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true)
    }
  })

  if (!open || !layout) return null

  return (
    <Dialog modal={false} open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal
        container={portalContainer ?? undefined}
        forceMount
      >
        <m.div
          key={`${id}-overlay`}
          data-raw-lut-browser-overlay=""
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12, ease: [0.22, 1, 0.36, 1] }}
          style={overlayStyle}
          className="fixed inset-y-0 left-0 right-[var(--raw-lut-browser-overlay-right,0px)] z-[59] bg-[oklch(0.18_0.018_76/0.32)] backdrop-blur-[2px]"
        />
        <DialogPrimitive.Content
          id={id}
          ref={contentRef}
          forceMount
          asChild
          data-raw-lut-browser-dialog={kind}
          data-lut-source-placement={layout.placement}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            queueMicrotask(restoreFocus)
          }}
          onOpenAutoFocus={(event) => {
            event.preventDefault()
          }}
          onPointerDownOutside={(event) => {
            if (isPassthroughElement(event.target)) {
              event.preventDefault()
            }
          }}
          onInteractOutside={(event) => {
            if (isPassthroughElement(event.target)) {
              event.preventDefault()
            }
          }}
          onFocusOutside={(event) => {
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
              'fixed left-[var(--raw-lut-source-browser-left,12px)] top-[var(--raw-lut-source-browser-top,12px)] z-[60] grid w-[min(var(--raw-lut-source-browser-width,360px),calc(100svw-24px))] max-h-[min(var(--raw-lut-source-browser-max-height,calc(100svh-24px)),calc(100svh-24px))] min-h-[min(184px,calc(100svh-24px))] gap-2.5 overflow-hidden rounded-lg border border-border-secondary bg-lf-surface-raised p-3 shadow-lf-lift',
              'max-[720px]:inset-x-2.5 max-[720px]:bottom-[calc(62px+max(8px,env(safe-area-inset-bottom))+min(56svh,430px)+8px)] max-[720px]:left-auto max-[720px]:top-auto max-[720px]:h-auto max-[720px]:w-auto max-[720px]:max-h-[min(50svh,420px,calc(100svh-(62px+max(8px,env(safe-area-inset-bottom))+min(56svh,430px)+8px)-10px))] max-[720px]:min-h-[min(220px,calc(100svh-(62px+max(8px,env(safe-area-inset-bottom))+min(56svh,430px)+8px)-10px))]',
              className,
            )}
            style={toBrowserStyle(layout, { fillHeight })}
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
      </DialogPrimitive.Portal>
    </Dialog>
  )
}
