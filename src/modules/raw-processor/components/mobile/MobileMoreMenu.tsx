import type { LucideIcon } from 'lucide-react'
import { MoreHorizontal } from 'lucide-react'

import { IconButton } from '~/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu/DropdownMenu'

export type MobileMoreMenuItem =
  | {
      kind: 'item'
      icon: LucideIcon | (() => null)
      label: string
      onSelect: () => void
      disabled?: boolean
    }
  | { kind: 'separator' }

export function MobileMoreMenu(props: {
  ariaLabel: string
  items: MobileMoreMenuItem[]
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton
          icon={MoreHorizontal}
          size="md"
          aria-label={props.ariaLabel}
          className="rounded-md border border-white/30 bg-black/40 text-white"
        />
      </DropdownMenuTrigger>
      <DropdownMenuPortal>
        <DropdownMenuContent
          align="end"
          sideOffset={6}
          className="min-w-[12rem]"
        >
          {props.items.map((it, i) =>
            it.kind === 'separator' ? (
              <DropdownMenuSeparator key={`sep-${i}`} />
            ) : (
              <DropdownMenuItem
                key={it.label}
                disabled={it.disabled}
                onSelect={() => it.onSelect()}
                className="gap-2.5"
              >
                <it.icon aria-hidden="true" className="size-[15px]" />
                {it.label}
              </DropdownMenuItem>
            ),
          )}
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenu>
  )
}
