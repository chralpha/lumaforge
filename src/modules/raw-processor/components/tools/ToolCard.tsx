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
      className={clsxm('flex flex-col gap-0.5', className)}
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
        'rounded-md border-0 transition-colors duration-200',
        'data-[state=open]:bg-[oklch(from_var(--color-lf-paper-warm)_l_c_h_/_0.55)]',
        className,
      )}
    >
      <AccordionTrigger
        data-tool-card-trigger={id}
        className={clsxm(
          'group/tool-trigger px-2.5 py-2.5 text-lf-body font-semibold text-lf-ink',
          'hover:text-lf-ink',
          'data-[state=closed]:text-lf-ink/80',
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate">{title}</span>
          {meta != null && (
            <span
              aria-hidden="true"
              className="truncate text-[0.7rem] tracking-tight font-medium text-lf-ink/50"
            >
              {meta}
            </span>
          )}
        </span>
      </AccordionTrigger>
      <AccordionContent className="px-2.5 pt-0 pb-3 text-lf-body">
        {children}
      </AccordionContent>
    </AccordionItem>
  )
}
