import { X } from 'lucide-react'
import { AnimatePresence, m, useDragControls } from 'motion/react'

import { IconButton } from '~/components/ui/button'
import { useI18n } from '~/lib/i18n'

import { SHEET_SPRING, useToolMotion } from '../../motion'

type Row = { label: string; value: string }
type Step = { index: number; label: string; timing: string }

function FactRows({ rows }: { rows: Row[] }) {
  return (
    <dl className="m-0 grid grid-cols-[5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5">
      {rows.map((r) => (
        <div key={r.label} className="contents">
          <dt className="m-0 truncate text-[0.72rem] tracking-tight text-lf-ink/55">
            {r.label}
          </dt>
          <dd className="m-0 truncate text-[0.78rem] font-medium tabular-nums text-lf-ink">
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
          className="pointer-events-auto absolute inset-x-0 bottom-0 z-[46] grid max-h-[78%] grid-rows-[auto_minmax(0,1fr)] rounded-t-xl border-t border-lf-hairline/40 bg-lf-paper-high pb-safe-offset-3 text-lf-ink shadow-[0_-14px_36px_-6px_oklch(0.18_0.018_76/0.22)]"
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
              className="mx-auto h-1 w-9 rounded-lf-pill bg-lf-ink/25"
            />
            <div className="flex items-center justify-between gap-2.5">
              <h2 className="m-0 text-[0.95rem] font-semibold text-lf-ink">
                {t('raw.mobile.more.title')}
              </h2>
              <IconButton
                icon={X}
                size="md"
                aria-label={t('raw.mobile.more.close')}
                onClick={props.onClose}
                className="size-[44px] rounded-md bg-transparent text-lf-ink/55 transition-colors hover:bg-lf-ink/5 hover:text-lf-ink [&_svg]:size-5 [&_svg]:stroke-current"
              />
            </div>
          </div>
          <div className="grid min-h-0 gap-3 overflow-y-auto px-4 pb-5 pt-1">
            <section className="grid gap-2">
              <h3 className="m-0 text-lf-body font-semibold text-lf-ink">
                {t('raw.mobile.more.pipelineHeading')}
              </h3>
              <div className="grid gap-1.5 rounded-md bg-lf-paper-warm/55 px-3 py-2.5">
                {props.pipelineSteps.map((s) => (
                  <div
                    key={s.index}
                    className="flex items-center gap-2.5 text-[0.82rem] text-lf-ink"
                  >
                    <span className="grid size-[18px] place-items-center rounded-full bg-lf-amber/15 text-[0.62rem] font-semibold tabular-nums text-lf-amber">
                      {s.index}
                    </span>
                    {s.label}
                    <em className="ml-auto not-italic tabular-nums text-lf-ink-soft">
                      {s.timing}
                    </em>
                  </div>
                ))}
              </div>
            </section>
            <section className="grid gap-2">
              <h3 className="m-0 text-lf-body font-semibold text-lf-ink">
                {t('raw.mobile.more.lutHeading')}
              </h3>
              <FactRows rows={props.lutRows} />
            </section>
            <section className="grid gap-2">
              <h3 className="m-0 text-lf-body font-semibold text-lf-ink">
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
