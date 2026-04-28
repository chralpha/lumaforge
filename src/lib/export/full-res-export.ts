import type {
  LumaRawExportCapability,
  LumaRawProcessedWindow,
  LumaRawProcessedWindowRequest,
} from '@lumaforge/luma-raw-runtime'

import type { ExportColorGraphDescriptor } from './color-graph'
import type { JpegRowSink, JpegRowWriter } from './jpeg/row-writer'
import { createJpegRowWriter } from './jpeg/row-writer'
import { createWasmJpegRowSink } from './jpeg/wasm-row-sink'
import type { ExportPerfMetric } from './perf/export-metrics'
import { createExportMetricCollector, nowMs } from './perf/export-metrics'
import { processedWindowToRgb16Rows } from './processed-window-transform'
import { createRowBandProcessor } from './row-band-processor'
import {
  normalizePreferredStripRows,
  planExportStrips,
  reduceStripRows,
} from './strip-scheduler'

export type FullResolutionExportProgress = {
  completedStrips: number
  totalStrips: number
  progress: number
}

export type RunFullResolutionJpegExportInput = {
  capability: LumaRawExportCapability
  graph: ExportColorGraphDescriptor
  readProcessedWindow: (
    request: LumaRawProcessedWindowRequest,
    signal?: AbortSignal,
  ) => Promise<LumaRawProcessedWindow>
  signal?: AbortSignal
  onProgress?: (progress: FullResolutionExportProgress) => void
  metricContext?: {
    requestId: string
    fileName?: string
    browser?: string
  }
  onMetric?: (metric: ExportPerfMetric) => void
  preferredRows?: number
  quality?: number
  jpegSink?: JpegRowSink
  writerFactory?: () => JpegRowWriter
}

const MIN_EXPORT_STRIP_ROWS = 64
const DEFAULT_EXPORT_STRIP_ROWS = 512

function createWriter(input: RunFullResolutionJpegExportInput) {
  if (input.writerFactory) {
    return input.writerFactory()
  }

  return createJpegRowWriter({
    width: input.capability.width,
    height: input.capability.height,
    quality: input.quality ?? 0.92,
    sink: input.jpegSink ?? createWasmJpegRowSink(),
  })
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new Error('FULL_RES_EXPORT_CANCELLED')
  }
}

function isLibRawProcessedExportCapability(
  capability: LumaRawExportCapability,
) {
  const color = capability.color
  return (
    capability.supported === true &&
    capability.strategy === 'libraw-processed-window' &&
    capability.windows.librawProcessed === true &&
    color !== undefined &&
    'cameraWhiteBalanceAppliedByRuntime' in color &&
    'cameraMatrixAppliedByRuntime' in color &&
    color?.workingSpace === 'linear-prophoto-rgb' &&
    color.cameraWhiteBalanceAppliedByRuntime === true &&
    color.cameraMatrixAppliedByRuntime === true
  )
}

function currentErrorLooksLikeResourceExhaustion(error: unknown) {
  const tokens: string[] = []

  if (error instanceof Error) {
    tokens.push(error.name, error.message)
  }

  if (typeof error === 'object' && error && 'code' in error) {
    const code = (error as { code?: unknown }).code
    if (typeof code === 'string') {
      tokens.push(code)
    }
  }

  if (typeof error === 'string') {
    tokens.push(error)
  }

  const haystack = tokens.join(' ').toUpperCase()

  return (
    haystack.includes('RESOURCE_ALLOCATION_FAILED') ||
    haystack.includes('FULL_RES_EXPORT_RESOURCE_FAILURE') ||
    haystack.includes('OUT_OF_MEMORY') ||
    haystack.includes('MEMORY') ||
    haystack.includes('ALLOCATION')
  )
}

function getErrorCause(error: unknown) {
  if (typeof error === 'object' && error && 'cause' in error) {
    return (error as { cause?: unknown }).cause
  }

  return undefined
}

function looksLikeResourceExhaustion(error: unknown) {
  let current: unknown = error
  const seen = new Set<unknown>()

  while (current !== undefined && !seen.has(current)) {
    seen.add(current)
    if (currentErrorLooksLikeResourceExhaustion(current)) {
      return true
    }
    current = getErrorCause(current)
  }

  return false
}

export async function runFullResolutionJpegExport(
  input: RunFullResolutionJpegExportInput,
) {
  if (!isLibRawProcessedExportCapability(input.capability)) {
    throw new Error('FULL_RES_EXPORT_UNSUPPORTED_SOURCE')
  }

  if (!input.graph.supported) {
    throw new Error('FULL_RES_EXPORT_UNSUPPORTED_PIPELINE')
  }

  const metricCollector = input.onMetric
    ? createExportMetricCollector({
        requestId: input.metricContext?.requestId ?? 'full-res-export',
        fileName: input.metricContext?.fileName,
        browser: input.metricContext?.browser,
        width: input.capability.width,
        height: input.capability.height,
      })
    : null
  const exportStart = nowMs()

  let stripRows = normalizePreferredStripRows(
    input.preferredRows ?? DEFAULT_EXPORT_STRIP_ROWS,
  )
  const rowBandProcessor = createRowBandProcessor({
    width: input.capability.width,
    rowBandRows: Math.min(64, stripRows),
    graph: input.graph,
  })
  const shouldCopyRowsForWriter =
    input.writerFactory !== undefined && rowBandProcessor.reusesOutputBuffer
  const rgb16Band = new Uint16Array(
    input.capability.width * rowBandProcessor.rowBandRows * 3,
  )
  const rgb16BandViews = new Map<number, Uint16Array>()
  function getRgb16BandSource(sampleCount: number) {
    let source = rgb16BandViews.get(sampleCount)
    if (!source) {
      source = rgb16Band.subarray(0, sampleCount)
      rgb16BandViews.set(sampleCount, source)
    }

    return source
  }
  let retries = 0

  while (true) {
    const strips = planExportStrips({
      width: input.capability.width,
      height: input.capability.height,
      preferredRows: stripRows,
      minRows: MIN_EXPORT_STRIP_ROWS,
      halo: 2,
    })
    let writer: JpegRowWriter | null = null
    let closed = false
    const attemptStripMetrics: ExportPerfMetric[] = []

    try {
      writer = createWriter(input)

      for (let index = 0; index < strips.length; index += 1) {
        throwIfAborted(input.signal)

        const strip = strips[index]
        const stripStart = nowMs()
        const rawStart = nowMs()
        const processedWindow = await input.readProcessedWindow(
          {
            outputRect: strip.output,
            halo: { left: 2, top: 2, right: 2, bottom: 2 },
          },
          input.signal,
        )
        const rawReadMs = nowMs() - rawStart

        const colorStart = nowMs()
        const tile = processedWindowToRgb16Rows(processedWindow, strip.output)
        let colorMs = nowMs() - colorStart
        let jpegWriteMs = 0

        for (
          let row = 0;
          row < tile.height;
          row += rowBandProcessor.rowBandRows
        ) {
          const rowCount = Math.min(
            rowBandProcessor.rowBandRows,
            tile.height - row,
          )
          const sampleCount = tile.width * rowCount * 3
          const source = getRgb16BandSource(sampleCount)
          const rowColorStart = nowMs()
          for (let bandRow = 0; bandRow < rowCount; bandRow += 1) {
            source.set(tile.row(row + bandRow), bandRow * tile.width * 3)
          }
          const rows = rowBandProcessor.processUint16Rows(source, rowCount)
          colorMs += nowMs() - rowColorStart

          const writerRows = shouldCopyRowsForWriter
            ? new Uint8Array(rows)
            : rows
          const jpegStart = nowMs()
          await writer.writeRows(writerRows, rowCount)
          jpegWriteMs += nowMs() - jpegStart
        }

        if (metricCollector) {
          attemptStripMetrics.push(
            metricCollector.record({
              kind: 'strip',
              stripIndex: index,
              totalStrips: strips.length,
              rows: tile.height,
              rawReadMs,
              colorMs,
              jpegWriteMs,
              totalMs: nowMs() - stripStart,
            }),
          )
        }

        input.onProgress?.({
          completedStrips: index + 1,
          totalStrips: strips.length,
          progress: Math.round(((index + 1) / strips.length) * 100),
        })
      }

      const blob = await writer.close()
      closed = true
      if (metricCollector) {
        for (const metric of attemptStripMetrics) {
          input.onMetric?.(metric)
        }

        input.onMetric?.(
          metricCollector.record({
            kind: 'summary',
            stripRows,
            retries,
            concurrency: 1,
            totalMs: nowMs() - exportStart,
            outputBytes: blob.size,
          }),
        )
      }
      return blob
    } catch (error) {
      if (writer && !closed) {
        try {
          await writer.abort()
        } catch {
          // Preserve the original orchestration failure.
        }
      }

      throwIfAborted(input.signal)

      if (!looksLikeResourceExhaustion(error)) {
        throw error
      }

      const nextStripRows = reduceStripRows(stripRows, MIN_EXPORT_STRIP_ROWS)

      if (nextStripRows >= stripRows) {
        throw new Error('FULL_RES_EXPORT_RESOURCE_FAILURE')
      }

      stripRows = nextStripRows
      retries += 1
    }
  }
}
