import { useCallback, useEffect, useRef, useState } from 'react'

import type { RawProcessingPipeline } from '~/lib/gl/pipeline'
import { RawProcessingPipeline as DefaultRawProcessingPipeline } from '~/lib/gl/pipeline'
import type { DecodedImage } from '~/lib/raw/decoder'

import { createRawUploadInput } from './preview-canvas-helpers'

type OriginalPipeline = Pick<
  RawProcessingPipeline,
  'initialize' | 'uploadImage' | 'setParams' | 'render' | 'resize' | 'dispose'
>

export type OriginalWebglPipelineHandle = Pick<OriginalPipeline, 'dispose'>

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
  generationKey = String(imageVersion),
  createPipeline = createDefaultOriginalPipeline,
  onReady,
  onError,
  onPipelineChange,
}: {
  imageRef: React.RefObject<DecodedImage | null>
  imageVersion: number
  generationKey?: string
  createPipeline?: (canvas: HTMLCanvasElement) => OriginalPipeline
  onReady?: (generationKey: string) => void
  onError?: (error: unknown, generationKey: string) => void
  onPipelineChange?: (pipeline: OriginalWebglPipelineHandle | null) => void
}) {
  const layerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pipelineRef = useRef<OriginalPipeline | null>(null)
  const pipelineHandleRef = useRef<OriginalWebglPipelineHandle | null>(null)
  const generationKeyRef = useRef(generationKey)
  const onReadyRef = useRef(onReady)
  const onErrorRef = useRef(onError)
  const onPipelineChangeRef = useRef(onPipelineChange)
  const [isInitialized, setIsInitialized] = useState(false)

  useEffect(() => {
    generationKeyRef.current = generationKey
    onReadyRef.current = onReady
    onErrorRef.current = onError
    onPipelineChangeRef.current = onPipelineChange
  }, [generationKey, onReady, onError, onPipelineChange])

  const disposeCurrentPipeline = useRef<
    (options?: Parameters<OriginalPipeline['dispose']>[0]) => void
  >(() => {})

  const reportPipelineError = useCallback(
    (error: unknown) => {
      disposeCurrentPipeline.current({ releaseContext: true })
      onErrorRef.current?.(error, generationKey)
    },
    [generationKey],
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const activeCanvas = canvas

    let pipeline: OriginalPipeline | null = null
    let handle: OriginalWebglPipelineHandle | null = null
    let cancelled = false
    let disposed = false

    const disposePipeline = () => {
      if (!pipeline || disposed) return
      disposed = true
      const disposedPipeline = pipeline
      pipeline = null
      if (pipelineHandleRef.current === handle) {
        pipelineHandleRef.current = null
      }
      if (pipelineRef.current === disposedPipeline) {
        pipelineRef.current = null
      }
      onPipelineChangeRef.current?.(null)
      disposedPipeline.dispose({ releaseContext: true })
      setIsInitialized(false)
    }
    handle = { dispose: disposePipeline }
    disposeCurrentPipeline.current = disposePipeline

    async function initializePipeline() {
      setIsInitialized(false)
      try {
        pipeline = createPipeline(activeCanvas)
        await pipeline.initialize()
        if (cancelled) {
          disposePipeline()
          return
        }
        pipelineRef.current = pipeline
        pipelineHandleRef.current = handle
        setIsInitialized(true)
        onPipelineChangeRef.current?.(handle)
      } catch (error) {
        disposePipeline()
        if (!cancelled) {
          pipelineRef.current = null
          setIsInitialized(false)
          onErrorRef.current?.(error, generationKeyRef.current)
        }
      }
    }

    void initializePipeline()

    return () => {
      cancelled = true
      disposePipeline()
      if (disposeCurrentPipeline.current === disposePipeline) {
        disposeCurrentPipeline.current = () => {}
      }
    }
  }, [createPipeline])

  useEffect(() => {
    const layer = layerRef.current
    const canvas = canvasRef.current
    if (!layer || !canvas || typeof ResizeObserver === 'undefined') return

    const resizeObserver = new ResizeObserver((entries) => {
      try {
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
      } catch (error) {
        reportPipelineError(error)
      }
    })

    resizeObserver.observe(layer)

    return () => {
      resizeObserver.disconnect()
    }
  }, [imageRef, isInitialized, reportPipelineError])

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

    try {
      pipeline.uploadImage(uploadInput)
      pipeline.setParams(ORIGINAL_LAYER_PARAMS)
      pipeline.render({ waitForGpu: true })
      onReadyRef.current?.(generationKey)
    } catch (error) {
      reportPipelineError(error)
    }
  }, [
    generationKey,
    imageRef,
    imageVersion,
    isInitialized,
    reportPipelineError,
  ])

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
