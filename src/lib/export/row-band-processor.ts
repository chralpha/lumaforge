import { getProPhotoToTargetMatrix } from '~/lib/color/matrix'
import { getTransferFunction } from '~/lib/color/registry'

import type { SupportedExportColorGraphDescriptor } from './color-graph'
import { mix, sampleLutTrilinear } from './lut3d'

const CHANNELS_PER_PIXEL = 3
const UINT16_MAX = 65535

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
  steps: [
    { kind: 'input-linear-prophoto' },
    Extract<
      SupportedExportColorGraphDescriptor['steps'][number],
      { kind: 'raw-render-exposure' }
    >,
    { kind: 'output-srgb' },
  ]
} {
  return (
    graph.lutProfile === null &&
    graph.steps.length === 3 &&
    graph.steps[0]?.kind === 'input-linear-prophoto' &&
    graph.steps[1]?.kind === 'raw-render-exposure' &&
    graph.steps[2]?.kind === 'output-srgb'
  )
}

function isSupportedLutGraph(
  graph: SupportedExportColorGraphDescriptor,
): graph is SupportedExportColorGraphDescriptor & {
  steps: [
    { kind: 'input-linear-prophoto' },
    Extract<
      SupportedExportColorGraphDescriptor['steps'][number],
      { kind: 'raw-render-exposure' }
    >,
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
    graph.steps.length === 7 &&
    graph.steps[0]?.kind === 'input-linear-prophoto' &&
    graph.steps[1]?.kind === 'raw-render-exposure' &&
    graph.steps[2]?.kind === 'gamut-to-lut-input' &&
    graph.steps[3]?.kind === 'encode-lut-transfer' &&
    graph.steps[4]?.kind === 'lut3d' &&
    graph.steps[5]?.kind === 'lut-output-to-srgb' &&
    graph.steps[6]?.kind === 'output-srgb'
  )
}

function getRawRenderExposureMultiplier(
  step: Extract<
    SupportedExportColorGraphDescriptor['steps'][number],
    { kind: 'raw-render-exposure' }
  >,
) {
  return Number.isFinite(step.multiplier) ? step.multiplier : 1
}

type GraphApplier = (linear: Float32Array, bytes: Uint8Array) => void

function compileGraphApplier(
  graph: SupportedExportColorGraphDescriptor,
): GraphApplier {
  if (isSimpleNoLutGraph(graph)) {
    const rawRenderExposureMultiplier = getRawRenderExposureMultiplier(
      graph.steps[1],
    )

    return (linear, bytes) => {
      for (let index = 0; index < linear.length; index += 3) {
        const sceneR = clampMin0(
          (linear[index] ?? 0) * rawRenderExposureMultiplier,
        )
        const sceneG = clampMin0(
          (linear[index + 1] ?? 0) * rawRenderExposureMultiplier,
        )
        const sceneB = clampMin0(
          (linear[index + 2] ?? 0) * rawRenderExposureMultiplier,
        )
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
    }
  }

  if (!isSupportedLutGraph(graph)) {
    throw new Error('FULL_RES_EXPORT_UNSUPPORTED_PIPELINE')
  }

  const rawRenderExposureMultiplier = getRawRenderExposureMultiplier(
    graph.steps[1],
  )
  const inputMatrix = graph.steps[2].matrix
  const encodeStep = graph.steps[3]
  const lutStep = graph.steps[4]
  const outputStep = graph.steps[5]
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

  return (linear, bytes) => {
    for (let index = 0; index < linear.length; index += 3) {
      const sceneR = clampMin0(
        (linear[index] ?? 0) * rawRenderExposureMultiplier,
      )
      const sceneG = clampMin0(
        (linear[index + 1] ?? 0) * rawRenderExposureMultiplier,
      )
      const sceneB = clampMin0(
        (linear[index + 2] ?? 0) * rawRenderExposureMultiplier,
      )

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
        normalizeLutSample(lutInputEncodedR, domainMin[0], inverseDomainSpanR),
        normalizeLutSample(lutInputEncodedG, domainMin[1], inverseDomainSpanG),
        normalizeLutSample(lutInputEncodedB, domainMin[2], inverseDomainSpanB),
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
  }
}

export type RowBandProcessor = {
  rowBandRows: number
  reusesOutputBuffer: boolean
  processFloatRows: (source: Float32Array, rowCount: number) => Uint8Array
  processUint16Rows: (source: Uint16Array, rowCount: number) => Uint8Array
}

export type CreateRowBandProcessorInput = {
  width: number
  rowBandRows: number
  graph: SupportedExportColorGraphDescriptor
}

function assertPositiveSafeInteger(value: number, errorCode: string) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(errorCode)
  }
}

function expectedRowLength(width: number, rowCount: number) {
  return width * rowCount * CHANNELS_PER_PIXEL
}

function validateRows(
  sourceLength: number,
  width: number,
  rowBandRows: number,
  rowCount: number,
) {
  assertPositiveSafeInteger(rowCount, 'ROW_BAND_PROCESSOR_INVALID_ROW_COUNT')
  if (rowCount > rowBandRows) {
    throw new Error('ROW_BAND_PROCESSOR_INVALID_ROW_COUNT')
  }

  const expectedLength = expectedRowLength(width, rowCount)
  if (
    !Number.isSafeInteger(expectedLength) ||
    sourceLength !== expectedLength
  ) {
    throw new Error('ROW_BAND_PROCESSOR_INVALID_SOURCE_LENGTH')
  }

  return expectedLength
}

export function createRowBandProcessor({
  width,
  rowBandRows,
  graph,
}: CreateRowBandProcessorInput): RowBandProcessor {
  assertPositiveSafeInteger(width, 'ROW_BAND_PROCESSOR_INVALID_WIDTH')
  assertPositiveSafeInteger(
    rowBandRows,
    'ROW_BAND_PROCESSOR_INVALID_ROW_BAND_ROWS',
  )

  const maxLength = expectedRowLength(width, rowBandRows)
  if (!Number.isSafeInteger(maxLength)) {
    throw new TypeError('ROW_BAND_PROCESSOR_INVALID_ROW_BAND_ROWS')
  }

  const applyGraph = compileGraphApplier(graph)
  const floatScratch = new Float32Array(maxLength)
  const rgb8Scratch = new Uint8Array(maxLength)

  function processFloatRows(source: Float32Array, rowCount: number) {
    const length = validateRows(source.length, width, rowBandRows, rowCount)
    const rows = rgb8Scratch.subarray(0, length)
    applyGraph(source, rows)
    return rows
  }

  function processUint16Rows(source: Uint16Array, rowCount: number) {
    const length = validateRows(source.length, width, rowBandRows, rowCount)
    for (let index = 0; index < length; index += 1) {
      floatScratch[index] = (source[index] ?? 0) / UINT16_MAX
    }

    return processFloatRows(floatScratch.subarray(0, length), rowCount)
  }

  return {
    rowBandRows,
    reusesOutputBuffer: true,
    processFloatRows,
    processUint16Rows,
  }
}
