import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
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
  headingClassName,
  dialogLabel,
  title,
  description,
  closeLabel,
  restoreFocus,
  triggerElement,
  passthroughElements,
  onOpenChange,
  children,
}: {
  open: boolean
  layout: OnlineLutBrowserLayout | null
  id: string
  kind: 'source' | 'contract'
  className: string
  headingClassName: string
  dialogLabel: string
  title: ReactNode
  description: ReactNode
  closeLabel: string
  restoreFocus: () => void
  triggerElement?: HTMLElement | null
  passthroughElements?: () => Iterable<HTMLElement | null | undefined>
  onOpenChange: (open: boolean) => void
  children: ReactNode
}) {
  const portalContainer = useRawLabPortalContainer(open)
  const contentRef = useRef<HTMLDivElement | null>(null)

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
        <div
          data-raw-lut-browser-overlay=""
          className="pointer-events-none fixed inset-0 z-[59] bg-transparent"
        />
        <DialogPrimitive.Content
          ref={contentRef}
          id={id}
          forceMount
          aria-label={dialogLabel}
          className={clsxm(
            'fixed left-[var(--raw-lut-source-browser-left,12px)] top-[var(--raw-lut-source-browser-top,12px)] z-[60] grid w-[min(var(--raw-lut-source-browser-width,360px),calc(100svw-24px))] max-h-[min(var(--raw-lut-source-browser-max-height,calc(100svh-24px)),calc(100svh-24px))] min-h-[min(184px,calc(100svh-24px))] gap-2 overflow-hidden rounded-md border border-border bg-background/95 p-2.5 shadow-lg backdrop-blur-background',
            'max-[720px]:inset-x-2.5 max-[720px]:bottom-[calc(62px+max(8px,env(safe-area-inset-bottom))+min(56svh,430px)+8px)] max-[720px]:left-auto max-[720px]:top-auto max-[720px]:h-auto max-[720px]:w-auto max-[720px]:max-h-[min(50svh,420px,calc(100svh-(62px+max(8px,env(safe-area-inset-bottom))+min(56svh,430px)+8px)-10px))] max-[720px]:min-h-[min(220px,calc(100svh-(62px+max(8px,env(safe-area-inset-bottom))+min(56svh,430px)+8px)-10px))]',
            className,
          )}
          data-lut-source-placement={layout.placement}
          data-raw-lut-browser-dialog={kind}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            queueMicrotask(restoreFocus)
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
          style={toBrowserStyle(layout)}
        >
          <div
            className={clsxm(
              'flex min-w-0 items-center justify-between gap-2.5',
              headingClassName,
            )}
          >
            <div className="min-w-0">
              <DialogTitle className="sr-only">{dialogLabel}</DialogTitle>
              <span
                aria-hidden="true"
                className="block min-w-0 truncate text-callout font-semibold text-text"
              >
                {title}
              </span>
              <DialogDescription asChild>
                <p className="mt-0.5 min-w-0 truncate text-footnote text-text-secondary">
                  {description}
                </p>
              </DialogDescription>
            </div>
            <DialogPrimitive.Close
              type="button"
              aria-label={closeLabel}
              title={closeLabel}
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-background text-text-secondary transition hover:-translate-y-px hover:border-accent/50 hover:bg-fill-secondary hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:size-[15px] [&_svg]:stroke-2"
            >
              <X aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </Dialog>
  )
}
