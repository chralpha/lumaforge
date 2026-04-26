import type {
  LumaRawExportCapability,
  LumaRawWindow,
  LumaRawWindowRect,
} from '@lumaforge/luma-raw-runtime'

import { getTransferFunction } from '~/lib/color/registry'

import type {
  ExportColorGraphDescriptor,
  SupportedExportColorGraphDescriptor,
} from './color-graph'
import { demosaicBilinearRgb } from './demosaic'
import {
  createJpegRowWriter,
  type JpegRowSink,
  type JpegRowWriter,
} from './jpeg/row-writer'
import { createWasmJpegRowSink } from './jpeg/wasm-row-sink'
import { mix, sampleLutTrilinear } from './lut3d'
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

function clamp01(value: number) {
  if (value <= 0) return 0
  if (value >= 1) return 1
  return value
}

function applyMatrix(matrix: Float32Array, r: number, g: number, b: number) {
  return [
    matrix[0] * r + matrix[1] * g + matrix[2] * b,
    matrix[3] * r + matrix[4] * g + matrix[5] * b,
    matrix[6] * r + matrix[7] * g + matrix[8] * b,
  ] as const
}

function normalizeLutInput(
  value: number,
  domainMin: number,
  domainMax: number,
) {
  const domain = domainMax - domainMin
  if (domain <= 0) return 0
  return (value - domainMin) / domain
}

function toSrgbByte(linear: number) {
  const clamped = clamp01(linear)
  const encoded =
    clamped <= 0.0031308
      ? clamped * 12.92
      : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055
  return Math.round(clamp01(encoded) * 255)
}

function applyGraphToRgbRows(
  linear: Float32Array,
  graph: SupportedExportColorGraphDescriptor,
) {
  const bytes = new Uint8Array(linear.length)

  for (let index = 0; index < linear.length; index += 3) {
    let r = linear[index] ?? 0
    let g = linear[index + 1] ?? 0
    let b = linear[index + 2] ?? 0

    for (const step of graph.steps) {
      switch (step.kind) {
        case 'input-linear-prophoto':
        case 'output-srgb':
          break
        case 'gamut-to-lut-input':
        case 'lut-output-to-srgb':
          ;[r, g, b] = applyMatrix(step.matrix, r, g, b)
          break
        case 'encode-lut-transfer': {
          const transfer = getTransferFunction(step.transfer)
          if (!transfer) {
            throw new Error('FULL_RES_EXPORT_UNSUPPORTED_PIPELINE')
          }
          r = transfer.encode(r)
          g = transfer.encode(g)
          b = transfer.encode(b)
          break
        }
        case 'lut3d': {
          const sample = sampleLutTrilinear(
            step.data,
            step.size,
            normalizeLutInput(r, step.domainMin[0], step.domainMax[0]),
            normalizeLutInput(g, step.domainMin[1], step.domainMax[1]),
            normalizeLutInput(b, step.domainMin[2], step.domainMax[2]),
          )
          r = mix(r, sample[0], step.intensity)
          g = mix(g, sample[1], step.intensity)
          b = mix(b, sample[2], step.intensity)
          break
        }
        case 'builtin-style':
          throw new Error('FULL_RES_EXPORT_UNSUPPORTED_PIPELINE')
        default:
          step satisfies never
      }
    }

    bytes[index] = toSrgbByte(r)
    bytes[index + 1] = toSrgbByte(g)
    bytes[index + 2] = toSrgbByte(b)
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
      const rows = applyGraphToRgbRows(tile.data, input.graph)
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
