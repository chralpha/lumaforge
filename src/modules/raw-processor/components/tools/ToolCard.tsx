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
        'rounded-md border border-transparent transition-colors duration-150',
        'hover:bg-lf-on-photo-bg',
        'data-[state=open]:border-lf-on-photo-bord-soft data-[state=open]:bg-lf-on-photo-bg',
        className,
      )}
    >
      <AccordionTrigger
        data-tool-card-trigger={id}
        className={clsxm(
          'group/tool-trigger px-2.5 py-2 text-[0.78rem] font-medium leading-none text-lf-hero-ink/88',
          'hover:text-lf-hero-ink',
          'data-[state=closed]:text-lf-hero-ink/66',
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate">{title}</span>
          {meta != null && (
            <span
              aria-hidden="true"
              className="truncate text-[0.68rem] font-medium text-lf-hero-ink/42"
            >
              {meta}
            </span>
          )}
        </span>
      </AccordionTrigger>
      <AccordionContent className="px-2.5 pt-0 pb-2.5 text-lf-body">
        {children}
      </AccordionContent>
    </AccordionItem>
  )
}
