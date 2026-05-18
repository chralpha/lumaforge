import type { PreviewHistogramState } from '@lumaforge/luma-color-runtime'

import { clsxm } from '~/lib/cn'

import { HistogramTool } from '../tools/HistogramTool'

export function FloatingHistogramCard(props: {
  histogram: PreviewHistogramState
  hidden: boolean
}) {
  return (
    <div
      aria-hidden={props.hidden || undefined}
      className={clsxm(
        'pointer-events-none absolute right-3 top-safe-offset-14 z-[15] w-[148px] rounded-lg border border-white/25 bg-black/75 p-2 text-white shadow-lg backdrop-blur-background transition-opacity duration-200',
        props.hidden ? 'opacity-0' : 'opacity-100',
      )}
    >
      <HistogramTool histogram={props.histogram} />
    </div>
  )
}
