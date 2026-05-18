import { Eye, RotateCcw, SplitSquareHorizontal } from 'lucide-react'
import { m } from 'motion/react'

import { useI18n } from '~/lib/i18n'

import { TAP_SPRING } from '../../motion'

export function MobileComparePanel({
  splitOpen,
  onCompareReset,
  onSplitOpenChange,
}: {
  splitOpen: boolean
  onCompareReset: () => void
  onSplitOpenChange: (open: boolean) => void
}) {
  const { t } = useI18n()

  if (splitOpen) {
    return (
      <section
        aria-label={t('raw.compare.title')}
        className="grid gap-3 rounded-xl border border-white/15 bg-black/38 p-3.5 text-white"
        data-mobile-compare-panel="split"
      >
        <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3">
          <span className="grid size-9 place-items-center rounded-xl border border-amber-400/30 bg-amber-400/12 text-amber-300">
            <SplitSquareHorizontal aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0">
            <h2 className="m-0 text-sm font-semibold text-white">
              {t('raw.mobile.compare.split')}
            </h2>
            <p className="m-0 mt-1 text-xs leading-relaxed text-white/65">
              {t('raw.mobile.compare.splitHint')}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <m.button
            type="button"
            whileTap={{ scale: 0.97 }}
            transition={TAP_SPRING}
            onClick={() => onSplitOpenChange(false)}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-white/20 bg-black/35 px-3 text-sm font-semibold text-white transition-colors hover:border-amber-400/50 hover:text-amber-300"
          >
            <Eye aria-hidden="true" className="size-4" />
            {t('raw.mobile.compare.holdMode')}
          </m.button>
          <m.button
            type="button"
            whileTap={{ scale: 0.97 }}
            transition={TAP_SPRING}
            onClick={onCompareReset}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-white/20 bg-black/35 px-3 text-sm font-semibold text-white transition-colors hover:border-amber-400/50 hover:text-amber-300"
          >
            <RotateCcw aria-hidden="true" className="size-4" />
            {t('raw.compare.reset')}
          </m.button>
        </div>
      </section>
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
      <m.button
        type="button"
        whileTap={{ scale: 0.97 }}
        transition={TAP_SPRING}
        onClick={() => onSplitOpenChange(true)}
        className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-white/20 bg-black/35 px-3 text-sm font-semibold text-white transition-colors hover:border-amber-400/50 hover:text-amber-300"
      >
        <SplitSquareHorizontal aria-hidden="true" className="size-4" />
        {t('raw.mobile.compare.split')}
      </m.button>
    </section>
  )
}
