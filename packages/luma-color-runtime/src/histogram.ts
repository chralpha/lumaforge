import type { SupportedExportColorGraphDescriptor } from './color-graph'
import { createRowBandProcessor } from './row-band-processor'

export type PreviewHistogramSource = 'quick' | 'bounded-hq'

export type HistogramInputOwnership =
  | 'main-thread-chunked-no-copy'
  | 'worker-transfer-detaches-source'
  | 'worker-copy-accepted-under-budget'
  | 'worker-shared-buffer-requires-coi'

export type ReadyPreviewHistogram = {
  state: 'ready'
  source: PreviewHistogramSource
  width: number
  height: number
  sampledPixels: number
  totalPixels: number
  bins: {
    luma: Uint32Array
    red: Uint32Array
    green: Uint32Array
    blue: Uint32Array
  }
  clipping: {
    shadowAnyChannel: number
    highlightAnyChannel: number
    shadowLuma: number
    highlightLuma: number
  }
  diagnostics: {
    ownership: HistogramInputOwnership
    copiedInputBytes: number
    transferredInput: boolean
    inputByteLength: number
    rowBandRows: number
  }
}

export type PreviewHistogramState =
  | ReadyPreviewHistogram
  | { state: 'computing'; previous: ReadyPreviewHistogram | null }
  | { state: 'stale'; previous: ReadyPreviewHistogram }
  | { state: 'unsupported'; reason: string }
  | { state: 'unavailable'; reason: 'embedded-only' | 'no-image' }

export type CreatePreviewHistogramProcessorInput = {
  width: number
  rowBandRows: number
  graph: SupportedExportColorGraphDescriptor
}

export type FinishPreviewHistogramInput = {
  source: PreviewHistogramSource
  width: number
  height: number
  totalRows: number
  ownership: HistogramInputOwnership
  inputByteLength: number
}

const CHANNELS_PER_PIXEL = 3
const BIN_COUNT = 256

function assertPositiveSafeInteger(value: number, errorCode: string) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(errorCode)
  }
}

function expectedRowLength(width: number, rowCount: number) {
  return width * rowCount * CHANNELS_PER_PIXEL
}

function lumaByte(red: number, green: number, blue: number) {
  return Math.round(0.2126 * red + 0.7152 * green + 0.0722 * blue)
}

export function createPreviewHistogramProcessor({
  width,
  rowBandRows,
  graph,
}: CreatePreviewHistogramProcessorInput) {
  assertPositiveSafeInteger(width, 'PREVIEW_HISTOGRAM_INVALID_WIDTH')
  assertPositiveSafeInteger(
    rowBandRows,
    'PREVIEW_HISTOGRAM_INVALID_ROW_BAND_ROWS',
  )

  const rowBandProcessor = createRowBandProcessor({ width, rowBandRows, graph })
  const bins = {
    luma: new Uint32Array(BIN_COUNT),
    red: new Uint32Array(BIN_COUNT),
    green: new Uint32Array(BIN_COUNT),
    blue: new Uint32Array(BIN_COUNT),
  }
  const clipping = {
    shadowAnyChannel: 0,
    highlightAnyChannel: 0,
    shadowLuma: 0,
    highlightLuma: 0,
  }
  let sampledPixels = 0

  function accumulateRgb8Rows(rows: Uint8Array) {
    for (let index = 0; index < rows.length; index += 3) {
      const red = rows[index] ?? 0
      const green = rows[index + 1] ?? 0
      const blue = rows[index + 2] ?? 0
      const luma = lumaByte(red, green, blue)

      bins.red[red] += 1
      bins.green[green] += 1
      bins.blue[blue] += 1
      bins.luma[luma] += 1

      if (red === 0 || green === 0 || blue === 0) {
        clipping.shadowAnyChannel += 1
      }
      if (red === 255 || green === 255 || blue === 255) {
        clipping.highlightAnyChannel += 1
      }
      if (luma === 0) clipping.shadowLuma += 1
      if (luma === 255) clipping.highlightLuma += 1

      sampledPixels += 1
    }
  }

  function validateRows(source: Uint16Array, rowCount: number) {
    assertPositiveSafeInteger(rowCount, 'PREVIEW_HISTOGRAM_INVALID_ROW_COUNT')
    if (rowCount > rowBandRows) {
      throw new Error('PREVIEW_HISTOGRAM_INVALID_ROW_COUNT')
    }
    if (source.length !== expectedRowLength(width, rowCount)) {
      throw new Error('PREVIEW_HISTOGRAM_INVALID_SOURCE_LENGTH')
    }
  }

  return {
    rowBandRows,
    processUint16Rows(source: Uint16Array, rowCount: number) {
      validateRows(source, rowCount)
      const rgb8Rows = rowBandProcessor.processUint16Rows(source, rowCount)
      accumulateRgb8Rows(rgb8Rows)
    },
    finish(input: FinishPreviewHistogramInput): ReadyPreviewHistogram {
      assertPositiveSafeInteger(input.width, 'PREVIEW_HISTOGRAM_INVALID_WIDTH')
      assertPositiveSafeInteger(
        input.height,
        'PREVIEW_HISTOGRAM_INVALID_HEIGHT',
      )
      assertPositiveSafeInteger(
        input.totalRows,
        'PREVIEW_HISTOGRAM_INVALID_ROW_COUNT',
      )

      const totalPixels = input.width * input.height
      return {
        state: 'ready',
        source: input.source,
        width: input.width,
        height: input.height,
        sampledPixels,
        totalPixels,
        bins,
        clipping,
        diagnostics: {
          ownership: input.ownership,
          copiedInputBytes:
            input.ownership === 'worker-copy-accepted-under-budget'
              ? input.inputByteLength
              : 0,
          transferredInput:
            input.ownership === 'worker-transfer-detaches-source',
          inputByteLength: input.inputByteLength,
          rowBandRows,
        },
      }
    },
  }
}
