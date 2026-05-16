import { useAtom } from 'jotai'
import type { ReactNode } from 'react'

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '~/components/ui/accordion'
import { clsxm } from '~/lib/cn'
import { jotaiStore } from '~/lib/jotai'

import type { ToolCardId } from '../../state/tool-card.atoms'
import { toolCardOpenAtom } from '../../state/tool-card.atoms'

export function ToolCardStack({
  ariaLabel,
  className,
  value,
  onValueChange,
  children,
}: {
  ariaLabel: string
  className?: string
  value?: ToolCardId[]
  onValueChange?: (value: ToolCardId[]) => void
  children: ReactNode
}) {
  const [storedOpen, setStoredOpen] = useAtom(toolCardOpenAtom, {
    store: jotaiStore,
  })
  const open = value ?? storedOpen
  const handleValueChange = onValueChange ?? setStoredOpen

  return (
    <Accordion
      type="multiple"
      value={open}
      onValueChange={(next) => handleValueChange(next as ToolCardId[])}
      role="group"
      aria-label={ariaLabel}
      className={clsxm('flex flex-col gap-1', className)}
    >
      {children}
    </Accordion>
  )
}

export function ToolCard({
  id,
  title,
  meta,
  className,
  children,
}: {
  id: ToolCardId
  title: string
  meta?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <AccordionItem
      value={id}
      data-tool-card={id}
      className={clsxm(
        'border-0 border-b-0 data-[state=open]:border-t data-[state=open]:border-border first:data-[state=open]:border-t-0',
        className,
      )}
    >
      <AccordionTrigger
        data-tool-card-trigger={id}
        className="py-3 text-headline font-medium text-text no-underline hover:no-underline"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate">{title}</span>
          {meta != null && (
            <span
              aria-hidden="true"
              className="text-footnote text-text-secondary truncate"
            >
              {meta}
            </span>
          )}
        </span>
      </AccordionTrigger>
      <AccordionContent className="pt-0 pb-3 text-body">
        {children}
      </AccordionContent>
    </AccordionItem>
  )
}
