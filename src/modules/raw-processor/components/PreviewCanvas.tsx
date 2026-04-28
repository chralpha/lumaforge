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
  RawUploadInput,
} from '~/lib/gl/pipeline'
import { RawProcessingPipeline } from '~/lib/gl/pipeline'
import type { DecodedImage } from '~/lib/raw/decoder'
import { Spring } from '~/lib/spring'

export interface PreviewCanvasProps {
  imageRef: React.RefObject<DecodedImage | null>
  imageVersion: number
  params: ProcessingParams
  lutDataRef: React.RefObject<LUTData | null>
  lutDataVersion: number
  embeddedPreviewUrl?: string | null
  displaySource?: 'embedded' | 'quick' | 'hq' | 'none'
  onStatsUpdate?: (stats: PipelineStats) => void
  onPipelineChange?: (pipeline: RawProcessingPipeline | null) => void
  className?: string
}

export function createRawUploadInput({
  data,
  layout,
  colorSpace,
  width,
  height,
  renderExposureEv,
}: {
  data: Float32Array | Uint16Array | null
  layout: RawUploadInput['layout'] | null
  colorSpace: RawUploadInput['colorSpace'] | null
  width: number
  height: number
  renderExposureEv?: number | null
}): RawUploadInput | null {
  if (!data || !layout || !colorSpace) {
    return null
  }

  if (layout === 'rgb-u16') {
    if (data instanceof Uint16Array && colorSpace === 'linear-prophoto-rgb') {
      const ev =
        typeof renderExposureEv === 'number' &&
        Number.isFinite(renderExposureEv)
          ? renderExposureEv
          : 0

      return {
        data,
        width,
        height,
        layout,
        colorSpace,
        renderExposureEv: ev,
        renderExposureMultiplier: Math.pow(2, ev),
      }
    }

    return null
  }

  if (data instanceof Float32Array && colorSpace === 'display-srgb-preview') {
    return {
      data,
      width,
      height,
      layout,
      colorSpace,
    }
  }

  return null
}

type RawUploadPipeline = Pick<
  RawProcessingPipeline,
  'clearImage' | 'uploadImage'
>

export function syncRawUploadInput({
  pipeline,
  imageData,
  uploadInput,
  setError,
}: {
  pipeline: RawUploadPipeline
  imageData: Float32Array | Uint16Array | null
  uploadInput: RawUploadInput | null
  setError: (error: string | null) => void
}): boolean {
  if (!imageData) {
    pipeline.clearImage()
    setError(null)
    return false
  }

  if (!uploadInput) {
    pipeline.clearImage()
    setError('Decoded image data does not match the WebGL upload layout')
    return false
  }

  pipeline.uploadImage(uploadInput)
  setError(null)
  return true
}

export function PreviewCanvas({
  imageRef,
  imageVersion,
  params,
  lutDataRef,
  lutDataVersion,
  embeddedPreviewUrl,
  displaySource = 'none',
  onStatsUpdate,
  onPipelineChange,
  className,
}: PreviewCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const pipelineRef = useRef<RawProcessingPipeline | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const showEmbeddedPreview =
    displaySource === 'embedded' && Boolean(embeddedPreviewUrl)
  const image = imageRef.current
  const imageWidth = image?.width ?? 0
  const imageHeight = image?.height ?? 0
  const hasImageData = Boolean(image?.data)

  // Initialize pipeline
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let pipeline: RawProcessingPipeline | null = null
    let cancelled = false
    let disposed = false

    const disposePipeline = () => {
      if (!pipeline || disposed) {
        return
      }

      pipeline.dispose()
      pipeline = null
      disposed = true
    }

    const init = async () => {
      try {
        pipeline = new RawProcessingPipeline(canvas)
        await pipeline.initialize()
        if (cancelled) {
          disposePipeline()
          return
        }

        pipelineRef.current = pipeline
        onPipelineChange?.(pipeline)
        setIsInitialized(true)
        setError(null)
      } catch (err) {
        if (cancelled) {
          return
        }

        console.error('Failed to initialize WebGL pipeline:', err)
        setError(
          err instanceof Error ? err.message : 'WebGL initialization failed',
        )
      }
    }

    init()

    return () => {
      cancelled = true
      disposePipeline()
      pipelineRef.current = null
      onPipelineChange?.(null)
    }
  }, [onPipelineChange])

  // Handle canvas resize
  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current

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

        const pipeline = pipelineRef.current
        if (pipeline) {
          pipeline.resize(canvas.width, canvas.height)
          if (isInitialized && imageRef.current) {
            const stats = pipeline.render()
            onStatsUpdate?.(stats)
          }
        }
      }
    })

    resizeObserver.observe(container)

    return () => {
      resizeObserver.disconnect()
    }
  }, [
    imageRef,
    imageVersion,
    imageWidth,
    imageHeight,
    isInitialized,
    onStatsUpdate,
  ])

  // Upload image data when it changes
  useEffect(() => {
    const pipeline = pipelineRef.current
    if (!pipeline || !isInitialized) return
    const image = imageRef.current
    const uploadInput = createRawUploadInput({
      data: image?.data ?? null,
      layout: image?.layout ?? null,
      colorSpace: image?.colorSpace ?? null,
      width: image?.width ?? 0,
      height: image?.height ?? 0,
      renderExposureEv: image?.renderExposure.ev ?? 0,
    })

    syncRawUploadInput({
      pipeline,
      imageData: image?.data ?? null,
      uploadInput,
      setError,
    })
  }, [imageRef, imageVersion, isInitialized])

  // Upload LUT when it changes
  useEffect(() => {
    const pipeline = pipelineRef.current
    if (!pipeline || !isInitialized) return
    const lutData = lutDataRef.current

    if (lutData) {
      pipeline.uploadLUT(lutData)
    } else {
      pipeline.clearLUT()
    }
  }, [lutDataRef, lutDataVersion, isInitialized])

  // Update params and render
  useEffect(() => {
    const pipeline = pipelineRef.current
    if (!pipeline || !isInitialized) return
    const image = imageRef.current
    const uploadInput = createRawUploadInput({
      data: image?.data ?? null,
      layout: image?.layout ?? null,
      colorSpace: image?.colorSpace ?? null,
      width: image?.width ?? 0,
      height: image?.height ?? 0,
      renderExposureEv: image?.renderExposure.ev ?? 0,
    })
    if (!uploadInput) return

    pipeline.setParams(params)
    const stats = pipeline.render()
    onStatsUpdate?.(stats)
  }, [params, imageRef, imageVersion, isInitialized, onStatsUpdate])

  // Re-render when LUT changes
  useEffect(() => {
    const pipeline = pipelineRef.current
    if (!pipeline || !isInitialized) return
    const image = imageRef.current
    const uploadInput = createRawUploadInput({
      data: image?.data ?? null,
      layout: image?.layout ?? null,
      colorSpace: image?.colorSpace ?? null,
      width: image?.width ?? 0,
      height: image?.height ?? 0,
      renderExposureEv: image?.renderExposure.ev ?? 0,
    })
    if (!uploadInput) return

    const stats = pipeline.render()
    onStatsUpdate?.(stats)
  }, [
    imageRef,
    imageVersion,
    lutDataRef,
    lutDataVersion,
    isInitialized,
    onStatsUpdate,
  ])

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
        className={clsxm(
          'max-w-full max-h-full object-contain',
          showEmbeddedPreview && 'opacity-0',
        )}
      />

      {showEmbeddedPreview && (
        <img
          src={embeddedPreviewUrl ?? undefined}
          alt="Embedded RAW preview"
          className="absolute max-w-full max-h-full object-contain"
        />
      )}

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

      {!hasImageData && !error && !showEmbeddedPreview && (
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
