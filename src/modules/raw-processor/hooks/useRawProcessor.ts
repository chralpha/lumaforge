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
import {
  isSupportedLUT,
  parseCubeFile,
  toLUTData,
  validateLUT,
} from '~/lib/lut/cube-parser'
import type { DecodedImage } from '~/lib/raw/decoder'
import { decodeHqRaw, decodeQuickRaw, isSupportedRaw } from '~/lib/raw/decoder'

import {
  deriveCanEdit,
  deriveCanExport,
  selectDisplaySource,
} from '../model/derive-session'
import type { StyleAsset } from '../model/session'
import { BUILTIN_PRESETS } from '../services/builtin-presets'
import {
  extractEmbeddedPreviewBestEffort,
  runPreviewPipeline,
} from '../services/preview-pipeline'
import { buildBuiltinStyle, toCustomStyle } from '../services/style-system'
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
  activeStyle: StyleAsset | null
  presetOptions: typeof BUILTIN_PRESETS

  // Actions
  loadFile: (file: File) => Promise<void>
  loadLUT: (file: File) => Promise<void>
  selectBuiltinStyle: (id: (typeof BUILTIN_PRESETS)[number]['id']) => void
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
  const sessionRef = useRef(session)
  const [lutData, setLutData] = useState<LUTData | null>(null)
  const hasImage = session ? deriveCanEdit(session) : false
  const canExport = session ? deriveCanExport(session) : false
  const activeStyle = session?.activeStyle || null

  useEffect(() => {
    sessionRef.current = session
  }, [session])

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
        const nextSession = replaceFile(file)
        let quickPreview: DecodedImage | null = null
        let hqPreview: DecodedImage | null = null

        sessionRef.current = nextSession
        setLoadedImage({ file: null, decoded: null, metadata: null })
        setStatus('loading')
        setProgress(0)
        setError(null)

        setSession((prev) => {
          if (!prev || prev.id !== nextSession.id) {
            return prev
          }

          return {
            ...prev,
            previewBundle: {
              ...prev.previewBundle,
              quickDecodePreview: { status: 'loading' },
              hqImage: { status: 'loading' },
            },
            renderState: {
              status: 'preparing',
            },
          }
        })

        const matchesActiveSession = () =>
          sessionRef.current?.id === nextSession.id

        const mapPhaseToStatus = (
          phase: 'loading' | 'decoding' | 'processing' | 'complete',
        ): ProcessingStatus => {
          if (phase === 'loading') return 'loading'
          if (phase === 'decoding') return 'decoding'
          if (phase === 'processing') return 'processing'
          return 'ready'
        }

        const updatePreviewState = (
          source: 'embedded' | 'quick' | 'hq',
          payload: { width: number; height: number },
          decoded?: DecodedImage | null,
        ) => {
          if (!matchesActiveSession()) {
            return
          }

          setSession((prev) => {
            if (!prev || prev.id !== nextSession.id) {
              return prev
            }

            const previewBundle = {
              ...prev.previewBundle,
              embeddedPreview:
                source === 'embedded'
                  ? {
                      status: 'ready' as const,
                      width: payload.width,
                      height: payload.height,
                    }
                  : prev.previewBundle.embeddedPreview,
              quickDecodePreview:
                source === 'quick'
                  ? {
                      status: 'ready' as const,
                      width: payload.width,
                      height: payload.height,
                    }
                  : prev.previewBundle.quickDecodePreview,
              hqImage:
                source === 'hq'
                  ? {
                      status: 'ready' as const,
                      width: payload.width,
                      height: payload.height,
                    }
                  : prev.previewBundle.hqImage,
            }

            return {
              ...prev,
              sourceFile: decoded
                ? {
                    ...prev.sourceFile,
                    cameraBrand: decoded.metadata.make,
                    cameraModel: decoded.metadata.model,
                    width: decoded.width,
                    height: decoded.height,
                  }
                : prev.sourceFile,
              previewBundle: {
                ...previewBundle,
                displaySource: selectDisplaySource(previewBundle),
              },
              renderState: {
                status: 'ready',
                lastRenderSource: source,
              },
            }
          })

          if (decoded) {
            setLoadedImage({
              file,
              decoded,
              metadata: decoded.metadata,
            })
            setStatus('ready')
          }
        }

        await runPreviewPipeline({
          file,
          extractEmbeddedPreview: extractEmbeddedPreviewBestEffort,
          decodeQuickPreview: async (targetFile) => {
            quickPreview = await decodeQuickRaw(
              targetFile,
              ({ phase, progress }) => {
                if (!matchesActiveSession()) {
                  return
                }

                setStatus(mapPhaseToStatus(phase))
                setProgress(progress * 0.5)
              },
            )

            return { width: quickPreview.width, height: quickPreview.height }
          },
          decodeHqPreview: async (targetFile) => {
            hqPreview = await decodeHqRaw(targetFile, ({ phase, progress }) => {
              if (!matchesActiveSession()) {
                return
              }

              setStatus(mapPhaseToStatus(phase))
              setProgress(50 + progress * 0.5)
            })

            return { width: hqPreview.width, height: hqPreview.height }
          },
          onEvent: (event) => {
            if (!matchesActiveSession()) {
              return
            }

            switch (event.type) {
              case 'embedded-ready': {
                updatePreviewState('embedded', event)
                break
              }
              case 'quick-ready': {
                updatePreviewState('quick', event, quickPreview)
                break
              }
              case 'hq-ready': {
                updatePreviewState('hq', event, hqPreview)
                setProgress(100)
                if (hqPreview) {
                  toast.success(`Loaded ${file.name}`, {
                    description: `${hqPreview.width}×${hqPreview.height} • ${hqPreview.metadata.make || 'Unknown'} ${hqPreview.metadata.model || ''}`,
                  })
                }
                break
              }
              case 'hq-failed': {
                setSession((prev) => {
                  if (!prev || prev.id !== nextSession.id) {
                    return prev
                  }

                  const previewBundle = {
                    ...prev.previewBundle,
                    hqImage: {
                      status: 'failed' as const,
                      errorCode: event.errorCode,
                    },
                  }

                  return {
                    ...prev,
                    previewBundle: {
                      ...previewBundle,
                      displaySource: selectDisplaySource(previewBundle),
                    },
                    renderState: {
                      ...prev.renderState,
                      lastErrorCode: event.errorCode,
                    },
                  }
                })
                setStatus('ready')
                setProgress(100)
                break
              }
            }
          },
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
        const validation = validateLUT(parsed)
        if (!validation.valid) {
          toast.error('Failed to load LUT', {
            description: validation.errors[0] || 'Invalid LUT',
          })
          return
        }

        setLut(parsed)
        setActiveStyle(toCustomStyle(parsed))
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

  const selectBuiltinStyle = useCallback(
    (id: (typeof BUILTIN_PRESETS)[number]['id']) => {
      setLut(null)
      setLutData(null)
      setActiveStyle(buildBuiltinStyle(id))
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
    activeStyle,
    presetOptions: BUILTIN_PRESETS,
    loadFile,
    loadLUT,
    selectBuiltinStyle,
    clearLUT,
    setParams: handleSetParams,
    exportImage,
    reset,
    dismissError,
    updateStats,
    pipelineRef,
  }
}
