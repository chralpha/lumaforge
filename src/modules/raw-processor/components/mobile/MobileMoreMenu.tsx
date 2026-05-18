import type { LucideIcon } from 'lucide-react'
import { MoreHorizontal } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { IconButton } from '~/components/ui/button'

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
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      <IconButton
        icon={MoreHorizontal}
        size="md"
        aria-label={props.ariaLabel}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
        className="size-11 rounded-md border border-white/30 bg-black/40 text-white [&_svg]:size-5 [&_svg]:stroke-white"
      />
      {open && (
        <div
          role="menu"
          data-mobile-substrate="ink-popover"
          className="absolute right-0 top-[calc(100%+6px)] z-50 grid min-w-[12.25rem] gap-1 rounded-xl border border-white/25 bg-[oklch(0.21_0.024_78)] p-1.5 text-white shadow-[0_18px_42px_oklch(0.04_0.012_76/0.55)]"
        >
          {props.items.map((it, i) =>
            it.kind === 'separator' ? (
              <hr key={`sep-${i}`} className="my-1 h-px border-0 bg-white/15" />
            ) : (
              <button
                key={it.label}
                disabled={it.disabled}
                role="menuitem"
                type="button"
                onClick={() => {
                  setOpen(false)
                  it.onSelect()
                }}
                className="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[0.82rem] font-semibold text-white transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <it.icon
                  aria-hidden="true"
                  className="size-[15px] text-white/70"
                />
                {it.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  )
}
