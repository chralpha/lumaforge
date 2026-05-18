import type { LucideIcon } from 'lucide-react'
import {
  Download,
  Info,
  SlidersHorizontal,
  SplitSquareHorizontal,
  Wand2,
} from 'lucide-react'
import { m } from 'motion/react'
import type { ReactNode } from 'react'

import { clsxm } from '~/lib/cn'
import type { Translate } from '~/lib/i18n'
import { useI18n } from '~/lib/i18n'

import { TAP_SPRING } from '../../motion'

export type MobileMode = 'look' | 'tone' | 'compare' | 'export'

const TABS: {
  id: MobileMode | 'more'
  icon: LucideIcon
  labelKey: Parameters<Translate>[0]
  primary?: boolean
}[] = [
  { id: 'look', icon: Wand2, labelKey: 'raw.mobile.mode.look' },
  { id: 'tone', icon: SlidersHorizontal, labelKey: 'raw.mobile.mode.tone' },
  {
    id: 'compare',
    icon: SplitSquareHorizontal,
    labelKey: 'raw.mobile.mode.compare',
  },
  { id: 'more', icon: Info, labelKey: 'raw.mobile.mode.more' },
  {
    id: 'export',
    icon: Download,
    labelKey: 'raw.mobile.mode.export',
    primary: true,
  },
]

export function MobileModeDock(props: {
  mode: MobileMode
  onModeChange: (mode: MobileMode) => void
  onOpenMore: () => void
  canExport: boolean
  panel: ReactNode
}) {
  const { t } = useI18n()
  return (
    <div className="absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/95 via-black/70 to-transparent pb-safe-offset-3 text-white">
      <div className="relative max-h-[24vh] overflow-y-auto px-3.5 pb-2.5 pt-3.5">
        {props.panel}
      </div>
      <nav
        aria-label={t('raw.mobile.modes.aria')}
        role="tablist"
        className="grid grid-cols-5 gap-1 border-t border-white/15 px-2.5 pb-3 pt-2"
      >
        {TABS.map((tab) => {
          const active = tab.id !== 'more' && props.mode === tab.id
          return (
            <m.button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              whileTap={{ scale: 0.96 }}
              transition={TAP_SPRING}
              onClick={() =>
                tab.id === 'more'
                  ? props.onOpenMore()
                  : props.onModeChange(tab.id)
              }
              className={clsxm(
                'relative grid min-h-[50px] grid-rows-[auto_auto] place-items-center gap-1 rounded-lg px-1 py-1.5 text-[0.64rem] font-semibold uppercase tracking-wide transition-colors',
                active ? 'text-white' : 'text-white/70',
              )}
            >
              <tab.icon aria-hidden="true" className="size-[18px]" />
              {t(tab.labelKey)}
              {active && (
                <span
                  className={clsxm(
                    'absolute -bottom-0.5 left-1/2 h-0.5 w-[22px] -translate-x-1/2 rounded-full',
                    tab.primary ? 'bg-accent' : 'bg-amber-400',
                  )}
                />
              )}
            </m.button>
          )
        })}
      </nav>
    </div>
  )
}
