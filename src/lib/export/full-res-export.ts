import type {
  LumaRawExportCapability,
  LumaRawWindow,
  LumaRawWindowRect,
} from '@lumaforge/luma-raw-runtime'

import type { ExportColorGraphDescriptor } from './color-graph'
import { demosaicBilinearRgb } from './demosaic'
import {
  createJpegRowWriter,
  type JpegRowSink,
  type JpegRowWriter,
} from './jpeg/row-writer'
import { createWasmJpegRowSink } from './jpeg/wasm-row-sink'
import { planExportStrips } from './strip-scheduler'

export type FullResolutionExportProgress = {
  completedStrips: number
  totalStrips: number
  progress: number
}

export type RunFullResolutionJpegExportInput = {
  capability: LumaRawExportCapability
  graph: ExportColorGraphDescriptor
  readRawWindow: (
    rect: LumaRawWindowRect,
    signal?: AbortSignal,
  ) => Promise<LumaRawWindow>
  signal?: AbortSignal
  onProgress?: (progress: FullResolutionExportProgress) => void
  preferredRows?: number
  quality?: number
  jpegSink?: JpegRowSink
  writer?: JpegRowWriter
}

function clampByte(value: number) {
  if (value <= 0) return 0
  if (value >= 1) return 255
  return Math.round(value * 255)
}

function quantizeLinearRgbTile(tile: { data: Float32Array }) {
  const bytes = new Uint8Array(tile.data.length)
  for (let index = 0; index < tile.data.length; index += 1) {
    bytes[index] = clampByte(tile.data[index] ?? 0)
  }
  return bytes
}

function createWriter(input: RunFullResolutionJpegExportInput) {
  if (input.writer) {
    return input.writer
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

export async function runFullResolutionJpegExport(
  input: RunFullResolutionJpegExportInput,
) {
  if (!input.capability.supported) {
    throw new Error('FULL_RES_EXPORT_UNSUPPORTED_SOURCE')
  }

  if (!input.graph.supported) {
    throw new Error('FULL_RES_EXPORT_UNSUPPORTED_PIPELINE')
  }

  const strips = planExportStrips({
    width: input.capability.width,
    height: input.capability.height,
    preferredRows: input.preferredRows ?? 512,
    minRows: 64,
    halo: 2,
  })
  const writer = createWriter(input)
  let closed = false

  try {
    for (let index = 0; index < strips.length; index += 1) {
      throwIfAborted(input.signal)

      const strip = strips[index]
      const rawWindow = await input.readRawWindow(strip.input, input.signal)
      const tile = demosaicBilinearRgb({
        ...rawWindow,
        output: strip.output,
      })
      const rows = quantizeLinearRgbTile(tile)
      await writer.writeRows(rows, tile.height)

      input.onProgress?.({
        completedStrips: index + 1,
        totalStrips: strips.length,
        progress: Math.round(((index + 1) / strips.length) * 100),
      })
    }

    const blob = await writer.close()
    closed = true
    return blob
  } catch (error) {
    if (!closed) {
      try {
        await writer.abort()
      } catch {
        // Preserve the original orchestration failure.
      }
    }
    throw error
  }
}
