import { Eye, SplitSquareHorizontal } from 'lucide-react'
import type { ReactNode } from 'react'

import { useI18n } from '~/lib/i18n'

export function MobileComparePanel({
  splitOpen,
  splitPanel,
  onSplitOpenChange,
}: {
  splitOpen: boolean
  splitPanel: ReactNode
  onSplitOpenChange: (open: boolean) => void
}) {
  const { t } = useI18n()

  if (splitOpen) {
    return (
      <div className="grid gap-3" data-mobile-compare-panel="split">
        <div className="flex items-center justify-between gap-3">
          <p className="m-0 text-xs font-medium leading-relaxed text-white/62">
            {t('raw.mobile.compare.splitHint')}
          </p>
          <button
            type="button"
            onClick={() => onSplitOpenChange(false)}
            className="inline-flex min-h-[40px] shrink-0 items-center justify-center rounded-lg border border-white/20 bg-black/35 px-3 text-xs font-semibold text-white transition-colors hover:border-amber-400/50 hover:text-amber-300"
          >
            {t('raw.mobile.compare.holdMode')}
          </button>
        </div>
        {splitPanel}
      </div>
    )
  }

  return (
    <section
      aria-label={t('raw.compare.title')}
      className="grid gap-3 rounded-xl border border-white/15 bg-black/38 p-3.5 text-white"
      data-mobile-compare-panel="peek"
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3">
        <span className="grid size-9 place-items-center rounded-xl border border-amber-400/30 bg-amber-400/12 text-amber-300">
          <Eye aria-hidden="true" className="size-4" />
        </span>
        <div className="min-w-0">
          <h2 className="m-0 text-sm font-semibold text-white">
            {t('raw.mobile.compare.touchHold')}
          </h2>
          <p className="m-0 mt-1 text-xs leading-relaxed text-white/65">
            {t('raw.mobile.compare.copy')}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => onSplitOpenChange(true)}
        className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-white/20 bg-black/35 px-3 text-sm font-semibold text-white transition-colors hover:border-amber-400/50 hover:text-amber-300"
      >
        <SplitSquareHorizontal aria-hidden="true" className="size-4" />
        {t('raw.mobile.compare.split')}
      </button>
    </section>
  )
}
