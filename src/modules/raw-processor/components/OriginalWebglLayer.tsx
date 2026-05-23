import { useEffect, useRef, useState } from 'react'

import type { RawProcessingPipeline } from '~/lib/gl/pipeline'
import { RawProcessingPipeline as DefaultRawProcessingPipeline } from '~/lib/gl/pipeline'
import type { DecodedImage } from '~/lib/raw/decoder'

import { createRawUploadInput } from './preview-canvas-helpers'

type OriginalPipeline = Pick<
  RawProcessingPipeline,
  'initialize' | 'uploadImage' | 'setParams' | 'render' | 'resize' | 'dispose'
>

const ORIGINAL_LAYER_PARAMS = {
  viewMode: 'original',
  styleKind: 'none',
  intensity: 0,
  compareSplit: 0.5,
  builtinPreset: null,
  userExposureEv: 0,
  userContrast: 0,
  userHighlights: 0,
  userShadows: 0,
  userWhites: 0,
  userBlacks: 0,
} as const

function createDefaultOriginalPipeline(canvas: HTMLCanvasElement) {
  return new DefaultRawProcessingPipeline(canvas)
}

export function OriginalWebglLayer({
  imageRef,
  imageVersion,
  createPipeline = createDefaultOriginalPipeline,
  onReady,
  onError,
}: {
  imageRef: React.RefObject<DecodedImage | null>
  imageVersion: number
  createPipeline?: (canvas: HTMLCanvasElement) => OriginalPipeline
  onReady?: () => void
  onError?: (error: unknown) => void
}) {
  const layerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pipelineRef = useRef<OriginalPipeline | null>(null)
  const onReadyRef = useRef(onReady)
  const onErrorRef = useRef(onError)
  const [isInitialized, setIsInitialized] = useState(false)

  useEffect(() => {
    onReadyRef.current = onReady
    onErrorRef.current = onError
  }, [onReady, onError])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let pipeline: OriginalPipeline | null = null
    let cancelled = false
    let disposed = false

    const disposePipeline = () => {
      if (!pipeline || disposed) return
      disposed = true
      const disposedPipeline = pipeline
      pipeline = null
      if (pipelineRef.current === disposedPipeline) {
        pipelineRef.current = null
      }
      disposedPipeline.dispose({ releaseContext: true })
    }

    async function initializePipeline() {
      setIsInitialized(false)
      try {
        pipeline = createPipeline(canvas)
        await pipeline.initialize()
        if (cancelled) {
          disposePipeline()
          return
        }
        pipelineRef.current = pipeline
        setIsInitialized(true)
        onReadyRef.current?.()
      } catch (error) {
        disposePipeline()
        if (!cancelled) {
          pipelineRef.current = null
          setIsInitialized(false)
          onErrorRef.current?.(error)
        }
      }
    }

    void initializePipeline()

    return () => {
      cancelled = true
      disposePipeline()
    }
  }, [createPipeline])

  useEffect(() => {
    const layer = layerRef.current
    const canvas = canvasRef.current
    if (!layer || !canvas || typeof ResizeObserver === 'undefined') return

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        canvas.width = Math.max(1, Math.round(width * dpr))
        canvas.height = Math.max(1, Math.round(height * dpr))
        pipelineRef.current?.resize(canvas.width, canvas.height)
        if (isInitialized && imageRef.current) {
          pipelineRef.current?.render({ waitForGpu: false })
        }
      }
    })

    resizeObserver.observe(layer)

    return () => {
      resizeObserver.disconnect()
    }
  }, [imageRef, isInitialized])

  useEffect(() => {
    const canvas = canvasRef.current
    const pipeline = pipelineRef.current
    const image = imageRef.current
    if (!canvas || !pipeline || !isInitialized || !image) return

    if (canvas.width <= 0 || canvas.height <= 0) {
      canvas.width = image.width
      canvas.height = image.height
      pipeline.resize(canvas.width, canvas.height)
    }

    const uploadInput = createRawUploadInput({
      data: image.data,
      layout: image.layout,
      colorSpace: image.colorSpace,
      width: image.width,
      height: image.height,
      renderExposureEv: image.renderExposure.ev,
    })
    if (!uploadInput) return

    pipeline.uploadImage(uploadInput)
    pipeline.setParams(ORIGINAL_LAYER_PARAMS)
    pipeline.render({ waitForGpu: true })
  }, [imageRef, imageVersion, isInitialized])

  return (
    <div
      ref={layerRef}
      className="raw-preview-original-webgl-layer"
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="raw-preview-original-webgl-canvas" />
    </div>
  )
}
