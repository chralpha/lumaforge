/**
 * WebGL canvas component for rendering processed RAW images.
 */

import type { LUTData, ProcessingParams } from '@lumaforge/luma-color-runtime'
import { m } from 'motion/react'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'

import { clsxm } from '~/lib/cn'
import type { PipelineStats, RawUploadInput } from '~/lib/gl/pipeline'
import { RawProcessingPipeline } from '~/lib/gl/pipeline'
import { useI18n } from '~/lib/i18n'
import type { DecodedImage } from '~/lib/raw/decoder'
import { Spring } from '~/lib/spring'

import type { DisplaySource } from '../model/session'
import type {
  PreviewViewport,
  PreviewViewportGeometry,
} from '../services/preview-viewport'
import {
  DEFAULT_PREVIEW_VIEWPORT,
  getCanvasCompareSplit,
  getWheelPreviewZoomTarget,
  normalizePreviewViewport,
  panPreviewViewport,
  resetPreviewViewport,
  zoomPreviewViewportAtPoint,
} from '../services/preview-viewport'

export interface PreviewCanvasProps {
  imageRef: React.RefObject<DecodedImage | null>
  imageVersion: number
  params: ProcessingParams
  lutDataRef: React.RefObject<LUTData | null>
  lutDataVersion: number
  embeddedPreviewUrl?: string | null
  displaySource?: DisplaySource
  suspended?: boolean
  interactionDisabled?: boolean
  previewViewport?: PreviewViewport
  onPreviewViewportChange?: (viewport: PreviewViewport) => void
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

type TrackedPointer = {
  clientX: number
  clientY: number
}

function getPointerDistance(a: TrackedPointer, b: TrackedPointer) {
  return Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY)
}

function getPointerMidpoint(a: TrackedPointer, b: TrackedPointer) {
  return {
    clientX: (a.clientX + b.clientX) / 2,
    clientY: (a.clientY + b.clientY) / 2,
  }
}

function tryCapturePointer(target: HTMLElement, pointerId: number) {
  try {
    target.setPointerCapture?.(pointerId)
  } catch {
    // Pointer capture is best-effort for synthetic events and WebKit edge paths.
  }
}

function tryReleasePointer(target: HTMLElement, pointerId: number) {
  try {
    target.releasePointerCapture?.(pointerId)
  } catch {
    // Internal pointer tracking is authoritative if release is unavailable.
  }
}

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
  suspended = false,
  interactionDisabled = false,
  previewViewport = DEFAULT_PREVIEW_VIEWPORT,
  onPreviewViewportChange,
  onStatsUpdate,
  onPipelineChange,
  className,
}: PreviewCanvasProps) {
  const { t } = useI18n()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const pipelineRef = useRef<RawProcessingPipeline | null>(null)
  const previewViewportRef = useRef(previewViewport)
  const activePointersRef = useRef(new Map<number, TrackedPointer>())
  const pinchStartRef = useRef<{
    distance: number
    midpoint: TrackedPointer
    viewport: PreviewViewport
  } | null>(null)
  const pendingViewportRef = useRef<PreviewViewport | null>(null)
  const pendingViewportRafRef = useRef<number | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)
  const [isPointerPanning, setIsPointerPanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const showEmbeddedPreview =
    displaySource === 'embedded' && Boolean(embeddedPreviewUrl)
  const image = imageRef.current
  const imageWidth = image?.width ?? 0
  const imageHeight = image?.height ?? 0
  const hasImageData = Boolean(image?.data)
  const canInteractWithPreview =
    !suspended &&
    !interactionDisabled &&
    (hasImageData || showEmbeddedPreview) &&
    Boolean(onPreviewViewportChange)
  const normalizedPreviewViewport = normalizePreviewViewport(previewViewport)

  useEffect(() => {
    previewViewportRef.current = normalizedPreviewViewport
  }, [normalizedPreviewViewport])

  const getViewportGeometry = useCallback(() => {
    const container = containerRef.current
    const track = trackRef.current

    if (!container || !track) return null

    const containerRect = container.getBoundingClientRect()
    const trackRect = track.getBoundingClientRect()
    const contentWidth =
      track.offsetWidth || track.clientWidth || trackRect.width
    const contentHeight =
      track.offsetHeight || track.clientHeight || trackRect.height

    if (
      containerRect.width <= 0 ||
      containerRect.height <= 0 ||
      contentWidth <= 0 ||
      contentHeight <= 0
    ) {
      return null
    }

    return {
      containerRect,
      geometry: {
        viewportWidth: containerRect.width,
        viewportHeight: containerRect.height,
        contentWidth,
        contentHeight,
      } satisfies PreviewViewportGeometry,
    }
  }, [])

  const commitPreviewViewport = useCallback(
    (viewport: PreviewViewport) => {
      previewViewportRef.current = viewport
      onPreviewViewportChange?.(viewport)
    },
    [onPreviewViewportChange],
  )

  const scheduleViewportCommit = useCallback(
    (viewport: PreviewViewport) => {
      previewViewportRef.current = viewport
      pendingViewportRef.current = viewport

      if (pendingViewportRafRef.current !== null) return

      pendingViewportRafRef.current = requestAnimationFrame(() => {
        pendingViewportRafRef.current = null
        const pending = pendingViewportRef.current
        if (pending) {
          pendingViewportRef.current = null
          onPreviewViewportChange?.(pending)
        }
      })
    },
    [onPreviewViewportChange],
  )

  const flushViewportCommit = useCallback(() => {
    if (pendingViewportRafRef.current !== null) {
      cancelAnimationFrame(pendingViewportRafRef.current)
      pendingViewportRafRef.current = null
    }
    const pending = pendingViewportRef.current
    if (pending) {
      pendingViewportRef.current = null
      onPreviewViewportChange?.(pending)
    }
  }, [onPreviewViewportChange])

  const getRelativeOrigin = useCallback(
    (clientX: number, clientY: number) => {
      const viewportGeometry = getViewportGeometry()
      if (!viewportGeometry) return null

      const { containerRect, geometry } = viewportGeometry

      return {
        geometry,
        originX: clientX - containerRect.left - containerRect.width / 2,
        originY: clientY - containerRect.top - containerRect.height / 2,
      }
    },
    [getViewportGeometry],
  )

  // Initialize pipeline
  useEffect(() => {
    if (suspended) {
      pipelineRef.current = null
      onPipelineChange?.(null)
      setIsInitialized(false)
      return
    }

    const canvas = canvasRef.current
    if (!canvas) return

    let pipeline: RawProcessingPipeline | null = null
    let originalDispose: RawProcessingPipeline['dispose'] | null = null
    let cancelled = false
    let disposed = false

    const disposePipeline = (
      options?: Parameters<RawProcessingPipeline['dispose']>[0],
    ) => {
      if (!pipeline || disposed) {
        return
      }

      const disposedPipeline = pipeline
      pipeline = null
      disposed = true
      if (pipelineRef.current === disposedPipeline) {
        pipelineRef.current = null
        onPipelineChange?.(null)
      }
      setIsInitialized(false)
      ;(originalDispose ?? disposedPipeline.dispose)(options)
    }

    const init = async () => {
      try {
        pipeline = new RawProcessingPipeline(canvas)
        originalDispose = pipeline.dispose.bind(pipeline)
        pipeline.dispose = (options) => {
          disposePipeline(options)
        }
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

        setError(
          err instanceof Error ? err.message : 'WebGL initialization failed',
        )
      }
    }

    init()

    return () => {
      cancelled = true
      disposePipeline({ releaseContext: false })
      pipelineRef.current = null
      onPipelineChange?.(null)
    }
  }, [onPipelineChange, suspended])

  // Handle canvas resize
  useEffect(() => {
    const container = containerRef.current
    const track = trackRef.current
    const canvas = canvasRef.current
    const surface = surfaceRef.current

    if (!container || !track || !canvas || !surface) return
    if (typeof ResizeObserver === 'undefined') return

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

          track.style.width = `${canvasWidth}px`
          track.style.height = `${canvasHeight}px`
          canvas.style.width = '100%'
          canvas.style.height = '100%'
          canvas.width = Math.round(canvasWidth * dpr)
          canvas.height = Math.round(canvasHeight * dpr)
        } else {
          track.style.width = `${width}px`
          track.style.height = `${height}px`
          canvas.style.width = '100%'
          canvas.style.height = '100%'
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

  const resetActivePreviewPointers = useCallback(() => {
    activePointersRef.current.clear()
    pinchStartRef.current = null
    setIsPointerPanning(false)
  }, [])

  const handleWheel = useCallback(
    (event: WheelEvent) => {
      if (!canInteractWithPreview) return

      const origin = getRelativeOrigin(event.clientX, event.clientY)
      if (!origin) return

      event.preventDefault()
      event.stopPropagation()

      const current = previewViewportRef.current
      const nextZoom = getWheelPreviewZoomTarget(current.zoom, {
        deltaY: event.deltaY,
        deltaMode: event.deltaMode,
        ctrlKey: event.ctrlKey,
      })

      scheduleViewportCommit(
        zoomPreviewViewportAtPoint(current, {
          ...origin,
          nextZoom,
        }),
      )
    },
    [canInteractWithPreview, scheduleViewportCommit, getRelativeOrigin],
  )

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    container.addEventListener('wheel', handleWheel, { passive: false })

    return () => {
      container.removeEventListener('wheel', handleWheel)
    }
  }, [handleWheel])

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!canInteractWithPreview || event.button !== 0) return

      event.preventDefault()
      event.stopPropagation()
      tryCapturePointer(event.currentTarget, event.pointerId)

      activePointersRef.current.set(event.pointerId, {
        clientX: event.clientX,
        clientY: event.clientY,
      })

      const pointers = Array.from(activePointersRef.current.values())
      if (pointers.length >= 2) {
        const [first, second] = pointers
        pinchStartRef.current = {
          distance: getPointerDistance(first!, second!),
          midpoint: getPointerMidpoint(first!, second!),
          viewport: previewViewportRef.current,
        }
      }

      setIsPointerPanning(true)
    },
    [canInteractWithPreview],
  )

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!canInteractWithPreview) return

      const previous = activePointersRef.current.get(event.pointerId)
      if (!previous) return

      event.preventDefault()
      event.stopPropagation()

      activePointersRef.current.set(event.pointerId, {
        clientX: event.clientX,
        clientY: event.clientY,
      })

      const pointers = Array.from(activePointersRef.current.values())
      const viewportGeometry = getViewportGeometry()
      if (!viewportGeometry) return

      if (pointers.length >= 2 && pinchStartRef.current) {
        const [first, second] = pointers
        const distance = getPointerDistance(first!, second!)
        if (pinchStartRef.current.distance <= 0) return

        const midpoint = pinchStartRef.current.midpoint
        const origin = getRelativeOrigin(midpoint.clientX, midpoint.clientY)
        if (!origin) return

        scheduleViewportCommit(
          zoomPreviewViewportAtPoint(pinchStartRef.current.viewport, {
            ...origin,
            nextZoom:
              pinchStartRef.current.viewport.zoom *
              (distance / pinchStartRef.current.distance),
          }),
        )
        return
      }

      if (previewViewportRef.current.zoom <= 1) {
        return
      }

      scheduleViewportCommit(
        panPreviewViewport(previewViewportRef.current, {
          geometry: viewportGeometry.geometry,
          deltaX: event.clientX - previous.clientX,
          deltaY: event.clientY - previous.clientY,
        }),
      )
    },
    [
      canInteractWithPreview,
      scheduleViewportCommit,
      getRelativeOrigin,
      getViewportGeometry,
    ],
  )

  const handlePointerRelease = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!activePointersRef.current.has(event.pointerId)) return

      event.preventDefault()
      event.stopPropagation()
      activePointersRef.current.delete(event.pointerId)
      tryReleasePointer(event.currentTarget, event.pointerId)

      if (activePointersRef.current.size < 2) {
        pinchStartRef.current = null
      }
      if (activePointersRef.current.size === 0) {
        flushViewportCommit()
        setIsPointerPanning(false)
      }
    },
    [flushViewportCommit],
  )

  const handleDoubleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!canInteractWithPreview) return

      event.preventDefault()
      event.stopPropagation()
      resetActivePreviewPointers()
      commitPreviewViewport(resetPreviewViewport())
    },
    [canInteractWithPreview, commitPreviewViewport, resetActivePreviewPointers],
  )

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

  // Update params and render (full pipeline update when params/image changes).
  // Viewport compensation is applied here too: params updates during zoomed compare
  // mode must carry the compensated split into the shader.
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

    const currentViewport = previewViewportRef.current
    const vpGeo = getViewportGeometry()
    let compareSplit = params.compareSplit

    if (
      params.viewMode === 'compare' &&
      currentViewport.zoom > 1 &&
      vpGeo &&
      vpGeo.geometry.contentWidth > 0
    ) {
      compareSplit = getCanvasCompareSplit(
        params.compareSplit,
        currentViewport.zoom,
        currentViewport.panX,
        vpGeo.geometry.contentWidth,
      )
    }

    pipeline.setParams({ ...params, compareSplit })
    const stats = pipeline.render()
    onStatsUpdate?.(stats)
  }, [
    params,
    imageRef,
    imageVersion,
    isInitialized,
    onStatsUpdate,
    getViewportGeometry,
  ])

  // Refresh the comparison split when zoom/pan changes during compare mode.
  // Kept separate from the params effect above so that zoom/pan does not
  // re-create uploadInput, re-upload image data, or fire onStatsUpdate.
  // Uses useLayoutEffect so the canvas update lands in the same frame as the
  // CSS transform, keeping the split bar and shader split line synchronised.
  useLayoutEffect(() => {
    const pipeline = pipelineRef.current
    if (!pipeline || !isInitialized) return
    if (params.viewMode !== 'compare') return

    const { zoom } = normalizedPreviewViewport

    let compareSplit: number
    if (zoom <= 1) {
      compareSplit = params.compareSplit
    } else {
      const vpGeo = getViewportGeometry()
      if (!vpGeo || vpGeo.geometry.contentWidth <= 0) return

      compareSplit = getCanvasCompareSplit(
        params.compareSplit,
        zoom,
        normalizedPreviewViewport.panX,
        vpGeo.geometry.contentWidth,
      )
    }

    pipeline.setParams({ compareSplit })
    pipeline.render({ waitForGpu: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- normalizedPreviewViewport is a fresh object each render; zoom/panX are stable primitives
  }, [
    normalizedPreviewViewport.zoom,
    normalizedPreviewViewport.panX,
    params.viewMode,
    params.compareSplit,
    isInitialized,
    getViewportGeometry,
  ])

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
      data-raw-preview-frame
      className={clsxm(
        'relative w-full h-full flex items-center justify-center bg-black/20',
        canInteractWithPreview &&
          (isPointerPanning
            ? 'raw-preview-frame-panning'
            : 'raw-preview-frame-interactive'),
        className,
      )}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerRelease}
      onPointerCancel={handlePointerRelease}
      onDoubleClick={handleDoubleClick}
    >
      <div
        ref={trackRef}
        data-raw-compare-track="image"
        className="raw-preview-track"
      >
        <div
          ref={surfaceRef}
          data-raw-preview-surface
          className="raw-preview-surface"
          style={
            {
              '--raw-preview-zoom': normalizedPreviewViewport.zoom,
              '--raw-preview-pan-x': `${normalizedPreviewViewport.panX}px`,
              '--raw-preview-pan-y': `${normalizedPreviewViewport.panY}px`,
            } as React.CSSProperties
          }
        >
          <canvas
            ref={canvasRef}
            className={clsxm(
              'raw-preview-canvas',
              showEmbeddedPreview && 'opacity-0',
            )}
          />

          {showEmbeddedPreview && (
            <img
              src={embeddedPreviewUrl ?? undefined}
              alt={t('raw.preview.embeddedAlt')}
              className="raw-preview-embedded"
            />
          )}
        </div>
      </div>

      {error && (
        <m.div
          className="absolute inset-0 flex items-center justify-center bg-background/80"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={Spring.presets.smooth}
        >
          <div className="flex flex-col items-center gap-4 text-center p-8">
            <div className="size-16 rounded-full bg-[oklch(0.78_0.16_63_/_0.14)] flex items-center justify-center">
              <i className="i-mingcute-warning-line text-3xl text-[oklch(0.78_0.16_63)]" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-text">
                {t('raw.preview.unavailable')}
              </h3>
              <p className="text-sm text-text-secondary mt-1">{error}</p>
            </div>
          </div>
        </m.div>
      )}

      {!hasImageData && !error && !showEmbeddedPreview && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-text-tertiary text-sm">
            {t('raw.preview.noImage')}
          </span>
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
