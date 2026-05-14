import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'

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
  onOpenChange: (open: boolean) => void
  children: ReactNode
}) {
  const portalContainer = useRawLabPortalContainer(open)

  if (!open || !layout) return null

  return (
    <DialogPrimitive.Root open={open} modal={false} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal
        container={portalContainer ?? undefined}
        forceMount
      >
        <DialogPrimitive.Content
          id={id}
          forceMount
          aria-label={dialogLabel}
          className={`raw-lut-browser-dialog ${className}`}
          data-lut-source-placement={layout.placement}
          data-raw-lut-browser-dialog={kind}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            queueMicrotask(restoreFocus)
          }}
          onPointerDownOutside={(event) => {
            if (isInsideElement(event.target, triggerElement)) {
              event.preventDefault()
            }
          }}
          onInteractOutside={(event) => {
            if (isInsideElement(event.target, triggerElement)) {
              event.preventDefault()
            }
          }}
          style={toBrowserStyle(layout)}
        >
          <div className={`raw-lut-browser-heading ${headingClassName}`}>
            <div>
              <DialogPrimitive.Title className="sr-only">
                {dialogLabel}
              </DialogPrimitive.Title>
              <span aria-hidden="true">{title}</span>
              <DialogPrimitive.Description asChild>
                <p>{description}</p>
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close
              type="button"
              aria-label={closeLabel}
              title={closeLabel}
              className="raw-lut-source-icon-button"
            >
              <X aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
