import type { PreviewHistogramState } from '@lumaforge/luma-color-runtime'
import { m, useReducedMotion } from 'motion/react'

import { clsxm } from '~/lib/cn'
import { surfaceFade } from '~/lib/spring'

import { HistogramTool } from '../tools/HistogramTool'

// RGB channel legend. The letters are channel symbols, not localized copy, so
// the panel gains a real-histogram affordance without new i18n keys.
const channels = [
  { key: 'R', dot: 'bg-lf-hist-red' },
  { key: 'G', dot: 'bg-lf-hist-green' },
  { key: 'B', dot: 'bg-lf-hist-blue' },
] as const

export function FloatingHistogramCard(props: {
  histogram: PreviewHistogramState
  hidden: boolean
}) {
  const prefersReduced = useReducedMotion() ?? false
  const lift = prefersReduced ? 0 : -6
  return (
    <m.div
      aria-hidden={props.hidden || undefined}
      // Motion owns opacity for both the enter/exit (AnimatePresence at the call
      // site) and the peek-hide, so the card never hard-cuts onto the photo.
      initial={{ opacity: 0, y: lift, scale: prefersReduced ? 1 : 0.98 }}
      animate={{ opacity: props.hidden ? 0 : 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: lift, scale: prefersReduced ? 1 : 0.98 }}
      transition={surfaceFade}
      className={clsxm(
        // Cool-slate glass panel (DESIGN.md §6): the photo tints it through the
        // backdrop blur, an inset top highlight reads as a chrome surface, and
        // a soft ambient drop replaces the old heavy shadow-lg.
        'pointer-events-none absolute right-3 top-safe-offset-20 z-[15] w-[180px] rounded-lf-panel border border-lf-on-photo-bord-soft bg-[oklch(0.105_0.006_255/0.86)] p-2.5 text-lf-hero-ink backdrop-blur-background',
        'shadow-[0_10px_30px_oklch(0.02_0.006_255/0.5),inset_0_1px_0_oklch(0.96_0.006_255/0.08)]',
      )}
    >
      <div className="mb-2 flex items-center gap-2.5 text-[0.6rem] font-semibold tabular-nums text-lf-hero-ink/55">
        {channels.map((channel) => (
          <span key={channel.key} className="inline-flex items-center gap-1">
            <span
              aria-hidden="true"
              className={clsxm('size-1.5 rounded-full', channel.dot)}
            />
            {channel.key}
          </span>
        ))}
      </div>
      <HistogramTool histogram={props.histogram} />
    </m.div>
  )
}
