import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import type { ProcessingStatus } from '~/atoms/raw-processor'
import {
  useErrorMessageValue,
  useLoadedImageValue,
  useLutValue,
  usePipelineStatsValue,
  useProcessingParamsValue,
  useProcessingStatusValue,
  useProgressValue,
  useSetErrorMessage,
  useSetLoadedImage,
  useSetLut,
  useSetPipelineStats,
  useSetProcessingParams,
  useSetProcessingStatus,
  useSetProgress,
} from '~/atoms/raw-processor'
import { exportJPEG, exportTIFF } from '~/lib/export/tiff-encoder'
import type {
  LUTData,
  PipelineStats,
  ProcessingParams,
  RawProcessingPipeline,
} from '~/lib/gl/pipeline'
import type { ParsedLUT } from '~/lib/lut/cube-parser'
import { isSupportedLUT, parseCubeFile, toLUTData } from '~/lib/lut/cube-parser'
import type { DecodedImage } from '~/lib/raw/decoder'
import { decodeRaw, isSupportedRaw } from '~/lib/raw/decoder'

import {
  deriveCanEdit,
  deriveCanExport,
  selectDisplaySource,
} from '../model/derive-session'
import { useImageSession } from './useImageSession'

export interface UseRawProcessorReturn {
  // State
  params: ProcessingParams
  loadedImage: { file: File | null; decoded: DecodedImage | null }
  status: ProcessingStatus
  error: string | null
  progress: number
  lut: ParsedLUT | null
  lutData: LUTData | null
  stats: PipelineStats | null
  hasImage: boolean
  canExport: boolean

  // Actions
  loadFile: (file: File) => Promise<void>
  loadLUT: (file: File) => Promise<void>
  clearLUT: () => void
  setParams: (params: Partial<ProcessingParams>) => void
  exportImage: (format: 'tiff' | 'jpeg') => Promise<void>
  reset: () => void
  dismissError: () => void
  updateStats: (stats: PipelineStats) => void

  // Pipeline ref for export
  pipelineRef: React.RefObject<RawProcessingPipeline | null>
}

export function useRawProcessor(): UseRawProcessorReturn {
  const params = useProcessingParamsValue()
  const setParams = useSetProcessingParams()
  const loadedImage = useLoadedImageValue()
  const setLoadedImage = useSetLoadedImage()
  const status = useProcessingStatusValue()
  const setStatus = useSetProcessingStatus()
  const error = useErrorMessageValue()
  const setError = useSetErrorMessage()
  const progress = useProgressValue()
  const setProgress = useSetProgress()
  const lut = useLutValue()
  const setLut = useSetLut()
  const stats = usePipelineStatsValue()
  const setStats = useSetPipelineStats()
  const { session, replaceFile, resetSession, setActiveStyle, setSession } =
    useImageSession()

  const pipelineRef = useRef<RawProcessingPipeline | null>(null)
  const [lutData, setLutData] = useState<LUTData | null>(null)
  const hasImage = session ? deriveCanEdit(session) : false
  const canExport = session ? deriveCanExport(session) : false

  // Convert LUT to pipeline format when it changes
  useEffect(() => {
    if (lut) {
      setLutData(toLUTData(lut))
    } else {
      setLutData(null)
    }
  }, [lut])

  // Load RAW file
  const loadFile = useCallback(
    async (file: File) => {
      if (!isSupportedRaw(file)) {
        setError(`Unsupported file format: ${file.name}`)
        return
      }

      try {
        replaceFile(file)
        setStatus('loading')
        setProgress(0)
        setError(null)

        const decoded = await decodeRaw(
          file,
          {
            useCameraWB: true,
          },
          ({ phase, progress }) => {
            if (phase === 'loading') {
              setProgress(progress * 0.3) // 0-30%
            } else if (phase === 'decoding') {
              setProgress(30 + progress * 0.7) // 30-100%
            }
          },
        )

        setLoadedImage({
          file,
          decoded,
          metadata: decoded.metadata,
        })
        setSession((prev) => {
          if (!prev) {
            return prev
          }

          const previewBundle = {
            ...prev.previewBundle,
            quickDecodePreview: {
              status: 'ready' as const,
              width: decoded.width,
              height: decoded.height,
            },
            hqImage: {
              status: 'ready' as const,
              width: decoded.width,
              height: decoded.height,
            },
          }

          return {
            ...prev,
            sourceFile: {
              ...prev.sourceFile,
              cameraBrand: decoded.metadata.make,
              cameraModel: decoded.metadata.model,
              width: decoded.width,
              height: decoded.height,
            },
            previewBundle: {
              ...previewBundle,
              displaySource: selectDisplaySource(previewBundle),
            },
            renderState: {
              status: 'ready',
              lastRenderSource: 'hq',
            },
          }
        })
        setStatus('ready')
        setProgress(100)

        toast.success(`Loaded ${file.name}`, {
          description: `${decoded.width}×${decoded.height} • ${decoded.metadata.make || 'Unknown'} ${decoded.metadata.model || ''}`,
        })
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to load file'
        setError(message)
        setStatus('error')
        toast.error('Failed to load RAW file', { description: message })
      }
    },
    [replaceFile, setError, setLoadedImage, setProgress, setSession, setStatus],
  )

  // Load LUT file
  const loadLUT = useCallback(
    async (file: File) => {
      if (!isSupportedLUT(file)) {
        toast.error('Unsupported LUT format', {
          description: 'Only .cube files are supported',
        })
        return
      }

      try {
        const parsed = await parseCubeFile(file)
        setLut(parsed)
        setActiveStyle({
          kind: 'custom',
          name: parsed.title,
          defaultIntensityLevel: 'standard',
          currentIntensityLevel: 'standard',
          lutAsset: {
            format: 'cube',
            dimension: parsed.size as 17 | 33 | 65,
            title: parsed.title,
          },
        })
        toast.success(`Loaded LUT: ${parsed.title}`, {
          description: `${parsed.size}³ grid`,
        })
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to parse LUT'
        toast.error('Failed to load LUT', { description: message })
      }
    },
    [setActiveStyle, setLut],
  )

  // Clear LUT
  const clearLUT = useCallback(() => {
    setLut(null)
    setLutData(null)
    setActiveStyle(null)
    toast.info('LUT cleared')
  }, [setActiveStyle, setLut])

  // Update params
  const handleSetParams = useCallback(
    (newParams: Partial<ProcessingParams>) => {
      setParams((prev) => ({ ...prev, ...newParams }))
    },
    [setParams],
  )

  // Export image
  const exportImage = useCallback(
    async (format: 'tiff' | 'jpeg') => {
      if (!loadedImage.decoded || !pipelineRef.current) {
        toast.error('No image to export')
        return
      }

      try {
        setStatus('processing')

        const pipeline = pipelineRef.current
        const { width, height } = pipeline.getInputDimensions()
        const filename =
          loadedImage.file?.name?.replace(/\.[^.]+$/, '') || 'export'

        if (format === 'tiff') {
          // Read full-res pixels from pipeline
          const pixels = pipeline.readProcessedPixels()
          if (!pixels) {
            throw new Error('Failed to read processed pixels')
          }
          exportTIFF(pixels, width, height, `${filename}_processed.tiff`)
          toast.success('TIFF exported', {
            description: `${width}×${height} 16-bit`,
          })
        } else {
          // Export from canvas
          const canvas = document.querySelector('canvas')
          if (canvas) {
            exportJPEG(canvas, `${filename}_preview.jpg`, 0.95)
            toast.success('JPEG exported', {
              description: `Preview quality`,
            })
          }
        }

        setStatus('ready')
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Export failed'
        toast.error('Export failed', { description: message })
        setStatus('ready')
      }
    },
    [loadedImage, setStatus],
  )

  // Reset state
  const reset = useCallback(() => {
    setLoadedImage({ file: null, decoded: null, metadata: null })
    setStatus('idle')
    setError(null)
    setProgress(0)
    setStats(null)
    resetSession()
  }, [resetSession, setError, setLoadedImage, setProgress, setStats, setStatus])

  // Dismiss error
  const dismissError = useCallback(() => {
    setError(null)
    if (status === 'error') {
      setStatus('idle')
    }
  }, [setError, status, setStatus])

  // Update stats
  const updateStats = useCallback(
    (newStats: PipelineStats) => {
      setStats(newStats)
    },
    [setStats],
  )

  return {
    params,
    loadedImage: {
      file: loadedImage.file,
      decoded: loadedImage.decoded,
    },
    status,
    error,
    progress,
    lut,
    lutData,
    stats,
    hasImage,
    canExport,
    loadFile,
    loadLUT,
    clearLUT,
    setParams: handleSetParams,
    exportImage,
    reset,
    dismissError,
    updateStats,
    pipelineRef,
  }
}
