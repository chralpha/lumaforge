import { X } from 'lucide-react'
import { AnimatePresence, m, useDragControls } from 'motion/react'

import { IconButton } from '~/components/ui/button'
import { useI18n } from '~/lib/i18n'

import { SHEET_SPRING, useToolMotion } from '../../motion'

type Row = { label: string; value: string }
type Step = { index: number; label: string; timing: string }

function FactRows({ rows }: { rows: Row[] }) {
  return (
    <dl className="m-0">
      {rows.map((r) => (
        <div
          key={r.label}
          className="grid grid-cols-[1fr_auto] gap-x-2.5 border-b border-white/15 py-2 text-sm last:border-0"
        >
          <dt className="m-0 font-medium text-white/70">{r.label}</dt>
          <dd className="m-0 text-right font-semibold tabular-nums">
            {r.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

export function MobileMoreSheet(props: {
  open: boolean
  onClose: () => void
  pipelineSteps: Step[]
  lutRows: Row[]
  fileRows: Row[]
}) {
  const { t } = useI18n()
  const { prefersReduced } = useToolMotion()
  const dragControls = useDragControls()

  return (
    <AnimatePresence>
      {props.open && (
        <m.aside
          key="more-sheet"
          role="dialog"
          aria-modal="false"
          aria-label={t('raw.mobile.more.title')}
          data-mobile-substrate="ink-sheet"
          className="absolute inset-x-0 bottom-0 z-[46] grid max-h-[78%] grid-rows-[auto_minmax(0,1fr)] rounded-t-2xl border-t border-white/20 bg-[linear-gradient(180deg,oklch(0.21_0.024_78),oklch(0.13_0.02_76))] pb-safe-offset-3 text-white shadow-[0_-22px_50px_oklch(0.04_0.012_76/0.55)]"
          initial={prefersReduced ? { opacity: 0 } : { y: '100%' }}
          animate={prefersReduced ? { opacity: 1 } : { y: '0%' }}
          exit={prefersReduced ? { opacity: 0 } : { y: '100%' }}
          transition={SHEET_SPRING}
          drag={prefersReduced ? false : 'y'}
          dragControls={dragControls}
          dragListener={false}
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0, bottom: 0.4 }}
          onDragEnd={(_, info) => {
            if (info.offset.y > 80 || info.velocity.y > 500) props.onClose()
          }}
        >
          <div
            className="grid gap-2 px-3.5 pb-3 pt-2.5"
            onPointerDown={(e) => dragControls.start(e)}
          >
            <div
              aria-hidden="true"
              className="mx-auto h-1 w-9 rounded-full bg-text/30"
            />
            <div className="flex items-center justify-between gap-2.5">
              <h2 className="m-0 text-base font-semibold">
                {t('raw.mobile.more.title')}
              </h2>
              <IconButton
                icon={X}
                size="md"
                aria-label={t('raw.mobile.more.close')}
                onClick={props.onClose}
                className="size-11 rounded-md border border-white/25 bg-black/35 text-white [&_svg]:size-5 [&_svg]:stroke-white"
              />
            </div>
          </div>
          <div className="grid min-h-0 gap-[18px] overflow-y-auto px-4 pb-5 pt-1">
            <section className="grid gap-2.5">
              <h3 className="m-0 text-sm font-semibold">
                {t('raw.mobile.more.pipelineHeading')}
              </h3>
              <div className="grid gap-2 rounded-xl border border-white/15 bg-black/35 p-3">
                {props.pipelineSteps.map((s) => (
                  <div
                    key={s.index}
                    className="flex items-center gap-2.5 text-sm"
                  >
                    <span className="grid size-[18px] place-items-center rounded-full bg-accent/30 text-[0.62rem] font-semibold tabular-nums text-accent">
                      {s.index}
                    </span>
                    {s.label}
                    <em className="ml-auto not-italic tabular-nums text-white/70">
                      {s.timing}
                    </em>
                  </div>
                ))}
              </div>
            </section>
            <section className="grid gap-2.5">
              <h3 className="m-0 text-sm font-semibold">
                {t('raw.mobile.more.lutHeading')}
              </h3>
              <FactRows rows={props.lutRows} />
            </section>
            <section className="grid gap-2.5">
              <h3 className="m-0 text-sm font-semibold">
                {t('raw.mobile.more.fileHeading')}
              </h3>
              <FactRows rows={props.fileRows} />
            </section>
          </div>
        </m.aside>
      )}
    </AnimatePresence>
  )
}
