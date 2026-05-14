/**
 * Processing stats display.
 */

import { clsxm } from '~/lib/cn'

export function StatsPanel({
  stats,
  className,
}: {
  stats: {
    processTime: number
    inputSize: { width: number; height: number }
    previewSize: { width: number; height: number }
    capabilityWarnings?: { code: string }[]
  }
  className?: string
}) {
  const hasLowPrecisionWarning = stats.capabilityWarnings?.some(
    (warning) => warning.code === 'LOW_PRECISION_RENDER_TARGET',
  )

  return (
    <div
      className={clsxm(
        'flex items-center gap-4 text-xs text-text-tertiary',
        className,
      )}
    >
      <span>Process: {stats.processTime.toFixed(1)}ms</span>
      <span>
        Preview: {stats.previewSize.width}×{stats.previewSize.height}
      </span>
      <span>
        Full: {stats.inputSize.width}×{stats.inputSize.height}
      </span>
      {hasLowPrecisionWarning && <span>Limited GPU precision</span>}
    </div>
  )
}
