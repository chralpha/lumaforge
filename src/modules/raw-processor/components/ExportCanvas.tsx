import { clsxm } from '~/lib/cn'

/**
 * Standalone canvas that manages its own pipeline for export.
 */
export function ExportCanvas({
  canvasRef,
  className,
}: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  className?: string
}) {
  return <canvas ref={canvasRef} className={clsxm('hidden', className)} />
}
