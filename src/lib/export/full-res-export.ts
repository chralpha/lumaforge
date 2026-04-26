import type {
  LumaRawExportCapability,
  LumaRawWindow,
  LumaRawWindowRect,
} from '@lumaforge/luma-raw-runtime'

import { getProPhotoToTargetMatrix } from '~/lib/color/matrix'
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

function clampMin0(value: number) {
  return value < 0 ? 0 : value
}

function linearToSrgb(linear: number) {
  const clamped = clampMin0(linear)
  return clamped <= 0.0031308
    ? clamped * 12.92
    : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055
}

function toSrgbByte(linear: number) {
  return Math.round(clamp01(linearToSrgb(linear)) * 255)
}

function toEncodedByte(encoded: number) {
  return Math.round(clamp01(encoded) * 255)
}

const LEGAL_RANGE_SCALE = (940 - 64) / 1023
const LEGAL_RANGE_OFFSET = 64 / 1023
const LEGAL_RANGE_INV_SCALE = 1023 / (940 - 64)
const PROPHOTO_TO_SRGB_MATRIX = getProPhotoToTargetMatrix('srgb-rec709')

function applySignalRangeForLutInput(value: number, isLegalRange: boolean) {
  if (!isLegalRange) return value
  return value * LEGAL_RANGE_SCALE + LEGAL_RANGE_OFFSET
}

function removeSignalRangeFromLutOutput(value: number, isLegalRange: boolean) {
  if (!isLegalRange) return value
  return (value - LEGAL_RANGE_OFFSET) * LEGAL_RANGE_INV_SCALE
}

function normalizeLutSample(
  value: number,
  domainMin: number,
  inverseDomainSpan: number,
) {
  if (inverseDomainSpan === 0) return 0
  return clamp01((value - domainMin) * inverseDomainSpan)
}

function isSimpleNoLutGraph(
  graph: SupportedExportColorGraphDescriptor,
): graph is SupportedExportColorGraphDescriptor & {
  steps: [{ kind: 'input-linear-prophoto' }, { kind: 'output-srgb' }]
} {
  return (
    graph.lutProfile === null &&
    graph.steps.length === 2 &&
    graph.steps[0]?.kind === 'input-linear-prophoto' &&
    graph.steps[1]?.kind === 'output-srgb'
  )
}

function isSupportedLutGraph(
  graph: SupportedExportColorGraphDescriptor,
): graph is SupportedExportColorGraphDescriptor & {
  steps: [
    { kind: 'input-linear-prophoto' },
    Extract<
      SupportedExportColorGraphDescriptor['steps'][number],
      { kind: 'gamut-to-lut-input' }
    >,
    Extract<
      SupportedExportColorGraphDescriptor['steps'][number],
      { kind: 'encode-lut-transfer' }
    >,
    Extract<
      SupportedExportColorGraphDescriptor['steps'][number],
      { kind: 'lut3d' }
    >,
    Extract<
      SupportedExportColorGraphDescriptor['steps'][number],
      { kind: 'lut-output-to-srgb' }
    >,
    { kind: 'output-srgb' },
  ]
} {
  return (
    graph.steps.length === 6 &&
    graph.steps[0]?.kind === 'input-linear-prophoto' &&
    graph.steps[1]?.kind === 'gamut-to-lut-input' &&
    graph.steps[2]?.kind === 'encode-lut-transfer' &&
    graph.steps[3]?.kind === 'lut3d' &&
    graph.steps[4]?.kind === 'lut-output-to-srgb' &&
    graph.steps[5]?.kind === 'output-srgb'
  )
}

function compileGraphApplier(graph: SupportedExportColorGraphDescriptor) {
  if (isSimpleNoLutGraph(graph)) {
    return (linear: Float32Array) => {
      const bytes = new Uint8Array(linear.length)
      for (let index = 0; index < linear.length; index += 3) {
        const sceneR = clampMin0(linear[index] ?? 0)
        const sceneG = clampMin0(linear[index + 1] ?? 0)
        const sceneB = clampMin0(linear[index + 2] ?? 0)
        const displayLinearR = clampMin0(
          PROPHOTO_TO_SRGB_MATRIX[0] * sceneR +
            PROPHOTO_TO_SRGB_MATRIX[1] * sceneG +
            PROPHOTO_TO_SRGB_MATRIX[2] * sceneB,
        )
        const displayLinearG = clampMin0(
          PROPHOTO_TO_SRGB_MATRIX[3] * sceneR +
            PROPHOTO_TO_SRGB_MATRIX[4] * sceneG +
            PROPHOTO_TO_SRGB_MATRIX[5] * sceneB,
        )
        const displayLinearB = clampMin0(
          PROPHOTO_TO_SRGB_MATRIX[6] * sceneR +
            PROPHOTO_TO_SRGB_MATRIX[7] * sceneG +
            PROPHOTO_TO_SRGB_MATRIX[8] * sceneB,
        )
        bytes[index] = toSrgbByte(displayLinearR)
        bytes[index + 1] = toSrgbByte(displayLinearG)
        bytes[index + 2] = toSrgbByte(displayLinearB)
      }
      return bytes
    }
  }

  if (!isSupportedLutGraph(graph)) {
    throw new Error('FULL_RES_EXPORT_UNSUPPORTED_PIPELINE')
  }

  const inputMatrix = graph.steps[1].matrix
  const encodeStep = graph.steps[2]
  const lutStep = graph.steps[3]
  const outputStep = graph.steps[4]
  const outputMatrix = outputStep.matrix
  const encodeTransfer = getTransferFunction(encodeStep.transfer)
  const decodeTransfer = getTransferFunction(outputStep.transfer)
  if (!encodeTransfer || !decodeTransfer) {
    throw new Error('FULL_RES_EXPORT_UNSUPPORTED_PIPELINE')
  }

  const inputIsLegalRange = encodeStep.range === 'legal'
  const outputIsLegalRange = outputStep.range === 'legal'
  const role = outputStep.role
  const intensity = outputStep.intensity
  const domainMin = lutStep.domainMin
  const inverseDomainSpanR =
    lutStep.domainMax[0] === domainMin[0]
      ? 0
      : 1 / (lutStep.domainMax[0] - domainMin[0])
  const inverseDomainSpanG =
    lutStep.domainMax[1] === domainMin[1]
      ? 0
      : 1 / (lutStep.domainMax[1] - domainMin[1])
  const inverseDomainSpanB =
    lutStep.domainMax[2] === domainMin[2]
      ? 0
      : 1 / (lutStep.domainMax[2] - domainMin[2])
  const lutSample: [number, number, number] = [0, 0, 0]

  return (linear: Float32Array) => {
    const bytes = new Uint8Array(linear.length)

    for (let index = 0; index < linear.length; index += 3) {
      const sceneR = clampMin0(linear[index] ?? 0)
      const sceneG = clampMin0(linear[index + 1] ?? 0)
      const sceneB = clampMin0(linear[index + 2] ?? 0)

      const baseDisplayLinearR = clampMin0(
        PROPHOTO_TO_SRGB_MATRIX[0] * sceneR +
          PROPHOTO_TO_SRGB_MATRIX[1] * sceneG +
          PROPHOTO_TO_SRGB_MATRIX[2] * sceneB,
      )
      const baseDisplayLinearG = clampMin0(
        PROPHOTO_TO_SRGB_MATRIX[3] * sceneR +
          PROPHOTO_TO_SRGB_MATRIX[4] * sceneG +
          PROPHOTO_TO_SRGB_MATRIX[5] * sceneB,
      )
      const baseDisplayLinearB = clampMin0(
        PROPHOTO_TO_SRGB_MATRIX[6] * sceneR +
          PROPHOTO_TO_SRGB_MATRIX[7] * sceneG +
          PROPHOTO_TO_SRGB_MATRIX[8] * sceneB,
      )

      let lutInputLinearR = baseDisplayLinearR
      let lutInputLinearG = baseDisplayLinearG
      let lutInputLinearB = baseDisplayLinearB

      if (role !== 'display-look' && inputMatrix) {
        lutInputLinearR = clampMin0(
          inputMatrix[0] * sceneR +
            inputMatrix[1] * sceneG +
            inputMatrix[2] * sceneB,
        )
        lutInputLinearG = clampMin0(
          inputMatrix[3] * sceneR +
            inputMatrix[4] * sceneG +
            inputMatrix[5] * sceneB,
        )
        lutInputLinearB = clampMin0(
          inputMatrix[6] * sceneR +
            inputMatrix[7] * sceneG +
            inputMatrix[8] * sceneB,
        )
      }

      const lutInputEncodedR = applySignalRangeForLutInput(
        clamp01(encodeTransfer.encode(lutInputLinearR)),
        inputIsLegalRange,
      )
      const lutInputEncodedG = applySignalRangeForLutInput(
        clamp01(encodeTransfer.encode(lutInputLinearG)),
        inputIsLegalRange,
      )
      const lutInputEncodedB = applySignalRangeForLutInput(
        clamp01(encodeTransfer.encode(lutInputLinearB)),
        inputIsLegalRange,
      )

      sampleLutTrilinear(
        lutStep.data,
        lutStep.size,
        normalizeLutSample(
          lutInputEncodedR,
          domainMin[0],
          inverseDomainSpanR,
        ),
        normalizeLutSample(
          lutInputEncodedG,
          domainMin[1],
          inverseDomainSpanG,
        ),
        normalizeLutSample(
          lutInputEncodedB,
          domainMin[2],
          inverseDomainSpanB,
        ),
        lutSample,
      )

      const lutOutputLinearR = clampMin0(
        decodeTransfer.decode(
          removeSignalRangeFromLutOutput(lutSample[0], outputIsLegalRange),
        ),
      )
      const lutOutputLinearG = clampMin0(
        decodeTransfer.decode(
          removeSignalRangeFromLutOutput(lutSample[1], outputIsLegalRange),
        ),
      )
      const lutOutputLinearB = clampMin0(
        decodeTransfer.decode(
          removeSignalRangeFromLutOutput(lutSample[2], outputIsLegalRange),
        ),
      )

      const styledDisplayLinearR = clampMin0(
        outputMatrix[0] * lutOutputLinearR +
          outputMatrix[1] * lutOutputLinearG +
          outputMatrix[2] * lutOutputLinearB,
      )
      const styledDisplayLinearG = clampMin0(
        outputMatrix[3] * lutOutputLinearR +
          outputMatrix[4] * lutOutputLinearG +
          outputMatrix[5] * lutOutputLinearB,
      )
      const styledDisplayLinearB = clampMin0(
        outputMatrix[6] * lutOutputLinearR +
          outputMatrix[7] * lutOutputLinearG +
          outputMatrix[8] * lutOutputLinearB,
      )

      if (role === 'scene-creative') {
        bytes[index] = toSrgbByte(
          mix(baseDisplayLinearR, styledDisplayLinearR, intensity),
        )
        bytes[index + 1] = toSrgbByte(
          mix(baseDisplayLinearG, styledDisplayLinearG, intensity),
        )
        bytes[index + 2] = toSrgbByte(
          mix(baseDisplayLinearB, styledDisplayLinearB, intensity),
        )
        continue
      }

      const baseDisplayColorR = linearToSrgb(baseDisplayLinearR)
      const baseDisplayColorG = linearToSrgb(baseDisplayLinearG)
      const baseDisplayColorB = linearToSrgb(baseDisplayLinearB)
      const styledDisplayColorR = linearToSrgb(styledDisplayLinearR)
      const styledDisplayColorG = linearToSrgb(styledDisplayLinearG)
      const styledDisplayColorB = linearToSrgb(styledDisplayLinearB)

      bytes[index] = toEncodedByte(
        mix(baseDisplayColorR, styledDisplayColorR, intensity),
      )
      bytes[index + 1] = toEncodedByte(
        mix(baseDisplayColorG, styledDisplayColorG, intensity),
      )
      bytes[index + 2] = toEncodedByte(
        mix(baseDisplayColorB, styledDisplayColorB, intensity),
      )
    }

    return bytes
  }
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

  const applyGraphToRgbRows = compileGraphApplier(input.graph)

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
      const rows = applyGraphToRgbRows(tile.data)
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
