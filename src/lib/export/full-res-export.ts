import type {
  ExportColorGraphDescriptor,
  SupportedExportColorGraphDescriptor,
} from '@lumaforge/luma-color-runtime'
import { createRowBandProcessor } from '@lumaforge/luma-color-runtime'
import type {
  LumaRawExportCapability,
  LumaRawProcessedWindow,
  LumaRawProcessedWindowRequest,
} from '@lumaforge/luma-raw-runtime'

import type { JpegRowSink, JpegRowWriter } from './jpeg/row-writer'
import { createJpegRowWriter } from './jpeg/row-writer'
import { createWasmJpegRowSink } from './jpeg/wasm-row-sink'
import type { ExportPerfMetric } from './perf/export-metrics'
import { createExportMetricCollector, nowMs } from './perf/export-metrics'
import {
  normalizeExportConcurrency,
  runOrderedConcurrent,
} from './pipeline-concurrency'
import { processedWindowToRgb16Rows } from './processed-window-transform'
import type { ExportStrip } from './strip-scheduler'
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
  concurrency?: number
  quality?: number
  jpegSink?: JpegRowSink
  writerFactory?: () => JpegRowWriter
  retryPolicy?: 'in-process' | 'surface-resource-failure'
  onCheckpoint?: (entry: {
    completedRowsForDiagnostics: number
    totalRows: number
    stripRows: number
  }) => void | Promise<void>
}

export class FullResExportResourceFailure extends Error {
  readonly nextRows: number

  constructor(nextRows: number) {
    super('FULL_RES_EXPORT_RESOURCE_FAILURE')
    this.name = 'FullResExportResourceFailure'
    this.nextRows = nextRows
  }
}

type PreparedStrip = {
  index: number
  rows: Array<{ bytes: Uint8Array; rowCount: number }>
  metrics: {
    rows: number
    rawReadMs: number
    colorMs: number
    totalMs: number
  }
}

type AttemptAbortScope = {
  signal: AbortSignal
  abort: () => void
  dispose: () => void
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

function createAttemptAbortScope(
  parentSignal?: AbortSignal,
): AttemptAbortScope {
  const controller = new AbortController()
  const abort = () => {
    controller.abort()
  }

  if (parentSignal?.aborted) {
    abort()
  } else {
    parentSignal?.addEventListener('abort', abort, { once: true })
  }

  return {
    signal: controller.signal,
    abort,
    dispose() {
      parentSignal?.removeEventListener('abort', abort)
    },
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

function createStripPreparer(
  input: RunFullResolutionJpegExportInput,
  stripRows: number,
  graph: SupportedExportColorGraphDescriptor,
  signal: AbortSignal,
) {
  const rowBandProcessor = createRowBandProcessor({
    width: input.capability.width,
    rowBandRows: Math.min(64, stripRows),
    graph,
  })
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

  return async function prepareStrip(
    strip: ExportStrip,
    index: number,
  ): Promise<PreparedStrip> {
    throwIfAborted(signal)

    const stripStart = nowMs()
    const rawStart = nowMs()
    const processedWindow = await input.readProcessedWindow(
      {
        outputRect: strip.output,
        halo: { left: 2, top: 2, right: 2, bottom: 2 },
      },
      signal,
    )
    const rawReadMs = nowMs() - rawStart

    throwIfAborted(signal)

    const colorStart = nowMs()
    const tile = processedWindowToRgb16Rows(processedWindow, strip.output)
    let colorMs = nowMs() - colorStart
    const rows: PreparedStrip['rows'] = []

    for (let row = 0; row < tile.height; row += rowBandProcessor.rowBandRows) {
      throwIfAborted(signal)
      const rowCount = Math.min(rowBandProcessor.rowBandRows, tile.height - row)
      const sampleCount = tile.width * rowCount * 3
      const source = getRgb16BandSource(sampleCount)
      const rowColorStart = nowMs()
      for (let bandRow = 0; bandRow < rowCount; bandRow += 1) {
        source.set(tile.row(row + bandRow), bandRow * tile.width * 3)
      }
      const outputRows = rowBandProcessor.processUint16Rows(source, rowCount)
      rows.push({
        bytes: new Uint8Array(outputRows),
        rowCount,
      })
      colorMs += nowMs() - rowColorStart
    }

    return {
      index,
      rows,
      metrics: {
        rows: tile.height,
        rawReadMs,
        colorMs,
        totalMs: nowMs() - stripStart,
      },
    }
  }
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
  const graph = input.graph

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
  let concurrency = normalizeExportConcurrency(input.concurrency, 'balanced')
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
    const attemptAbortScope = createAttemptAbortScope(input.signal)

    try {
      const availablePreparers: Array<ReturnType<typeof createStripPreparer>> =
        [createStripPreparer(input, stripRows, graph, attemptAbortScope.signal)]
      writer = createWriter(input)
      let completedStrips = 0

      await runOrderedConcurrent(
        strips,
        concurrency,
        async (strip, index) => {
          const preparer =
            availablePreparers.pop() ??
            createStripPreparer(
              input,
              stripRows,
              graph,
              attemptAbortScope.signal,
            )

          try {
            return await preparer(strip, index)
          } finally {
            availablePreparers.push(preparer)
          }
        },
        async (prepared) => {
          throwIfAborted(attemptAbortScope.signal)

          let jpegWriteMs = 0
          for (const rowChunk of prepared.rows) {
            const jpegStart = nowMs()
            await writer!.writeRows(rowChunk.bytes, rowChunk.rowCount)
            jpegWriteMs += nowMs() - jpegStart
          }

          throwIfAborted(attemptAbortScope.signal)

          if (metricCollector) {
            attemptStripMetrics.push(
              metricCollector.record({
                kind: 'strip',
                stripIndex: prepared.index,
                totalStrips: strips.length,
                rows: prepared.metrics.rows,
                rawReadMs: prepared.metrics.rawReadMs,
                colorMs: prepared.metrics.colorMs,
                jpegWriteMs,
                totalMs: prepared.metrics.totalMs + jpegWriteMs,
              }),
            )
          }

          completedStrips += 1
          await input.onCheckpoint?.({
            completedRowsForDiagnostics: Math.min(
              input.capability.height,
              completedStrips * stripRows,
            ),
            totalRows: input.capability.height,
            stripRows,
          })
          input.onProgress?.({
            completedStrips,
            totalStrips: strips.length,
            progress:
              completedStrips === strips.length
                ? 99
                : Math.round((completedStrips / strips.length) * 100),
          })
        },
        {
          onError() {
            attemptAbortScope.abort()
          },
        },
      )

      const output = await writer.close()
      closed = true
      input.onProgress?.({
        completedStrips: strips.length,
        totalStrips: strips.length,
        progress: 100,
      })
      if (metricCollector) {
        for (const metric of attemptStripMetrics) {
          input.onMetric?.(metric)
        }

        input.onMetric?.(
          metricCollector.record({
            kind: 'summary',
            stripRows,
            retries,
            concurrency,
            totalMs: nowMs() - exportStart,
            outputBytes: output.byteLength,
          }),
        )
      }
      return output
    } catch (error) {
      attemptAbortScope.abort()

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

      if (input.retryPolicy === 'surface-resource-failure') {
        throw new FullResExportResourceFailure(nextStripRows)
      }

      if (nextStripRows >= stripRows && concurrency <= 1) {
        throw new Error('FULL_RES_EXPORT_RESOURCE_FAILURE')
      }

      concurrency = 1
      stripRows = nextStripRows
      retries += 1
    } finally {
      attemptAbortScope.dispose()
    }
  }
}
