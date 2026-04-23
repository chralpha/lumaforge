/**
 * WebGL canvas component for rendering processed RAW images.
 */

import { m } from 'motion/react'
import { useEffect, useRef, useState } from 'react'

import { clsxm } from '~/lib/cn'
import type {
  LUTData,
  PipelineStats,
  ProcessingParams,
} from '~/lib/gl/pipeline'
import { RawProcessingPipeline } from '~/lib/gl/pipeline'
import { Spring } from '~/lib/spring'

export interface PreviewCanvasProps {
  imageData: Float32Array | null
  imageWidth: number
  imageHeight: number
  params: ProcessingParams
  lutData: LUTData | null
  onStatsUpdate?: (stats: PipelineStats) => void
  onPipelineChange?: (pipeline: RawProcessingPipeline | null) => void
  className?: string
}

export function PreviewCanvas({
  imageData,
  imageWidth,
  imageHeight,
  params,
  lutData,
  onStatsUpdate,
  onPipelineChange,
  className,
}: PreviewCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const pipelineRef = useRef<RawProcessingPipeline | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Initialize pipeline
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let pipeline: RawProcessingPipeline | null = null

    const init = async () => {
      try {
        pipeline = new RawProcessingPipeline(canvas)
        await pipeline.initialize()
        pipelineRef.current = pipeline
        onPipelineChange?.(pipeline)
        setIsInitialized(true)
        setError(null)
      } catch (err) {
        console.error('Failed to initialize WebGL pipeline:', err)
        setError(
          err instanceof Error ? err.message : 'WebGL initialization failed',
        )
      }
    }

    init()

    return () => {
      if (pipeline) {
        pipeline.dispose()
        pipelineRef.current = null
        onPipelineChange?.(null)
      }
    }
  }, [onPipelineChange])

  // Handle canvas resize
  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    const pipeline = pipelineRef.current

    if (!container || !canvas) return

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        const dpr = Math.min(window.devicePixelRatio, 2)

        // Calculate aspect-fit dimensions
        if (imageWidth > 0 && imageHeight > 0) {
          const aspectRatio = imageWidth / imageHeight
          const containerAspect = width / height

          let canvasWidth: number
          let canvasHeight: number

          if (aspectRatio > containerAspect) {
            canvasWidth = width
            canvasHeight = width / aspectRatio
          } else {
            canvasHeight = height
            canvasWidth = height * aspectRatio
          }

          canvas.style.width = `${canvasWidth}px`
          canvas.style.height = `${canvasHeight}px`
          canvas.width = Math.round(canvasWidth * dpr)
          canvas.height = Math.round(canvasHeight * dpr)
        } else {
          canvas.style.width = `${width}px`
          canvas.style.height = `${height}px`
          canvas.width = Math.round(width * dpr)
          canvas.height = Math.round(height * dpr)
        }

        if (pipeline) {
          pipeline.resize(canvas.width, canvas.height)
        }
      }
    })

    resizeObserver.observe(container)

    return () => {
      resizeObserver.disconnect()
    }
  }, [imageWidth, imageHeight])

  // Upload image data when it changes
  useEffect(() => {
    const pipeline = pipelineRef.current
    if (!pipeline || !isInitialized || !imageData) return

    pipeline.uploadImage(imageData, imageWidth, imageHeight)
  }, [imageData, imageWidth, imageHeight, isInitialized])

  // Upload LUT when it changes
  useEffect(() => {
    const pipeline = pipelineRef.current
    if (!pipeline || !isInitialized) return

    if (lutData) {
      pipeline.uploadLUT(lutData)
    } else {
      pipeline.clearLUT()
    }
  }, [lutData, isInitialized])

  // Update params and render
  useEffect(() => {
    const pipeline = pipelineRef.current
    if (!pipeline || !isInitialized || !imageData) return

    pipeline.setParams({
      ...params,
      intensity: params.viewMode === 'original' ? 0 : params.intensity,
    })
    const stats = pipeline.render()
    onStatsUpdate?.(stats)
  }, [params, isInitialized, imageData, onStatsUpdate])

  // Re-render when LUT changes
  useEffect(() => {
    const pipeline = pipelineRef.current
    if (!pipeline || !isInitialized || !imageData) return

    const stats = pipeline.render()
    onStatsUpdate?.(stats)
  }, [lutData, isInitialized, imageData, onStatsUpdate])

  return (
    <div
      ref={containerRef}
      className={clsxm(
        'relative w-full h-full flex items-center justify-center bg-black/20',
        className,
      )}
    >
      <canvas
        ref={canvasRef}
        className="max-w-full max-h-full object-contain"
      />

      {error && (
        <m.div
          className="absolute inset-0 flex items-center justify-center bg-background/80"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={Spring.presets.smooth}
        >
          <div className="flex flex-col items-center gap-4 text-center p-8">
            <div className="size-16 rounded-full bg-red/10 flex items-center justify-center">
              <i className="i-mingcute-warning-line text-3xl text-red" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-text">WebGL Error</h3>
              <p className="text-sm text-text-secondary mt-1">{error}</p>
            </div>
          </div>
        </m.div>
      )}

      {!imageData && !error && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-text-tertiary text-sm">No image loaded</span>
        </div>
      )}
    </div>
  )
}

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
