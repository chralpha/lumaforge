import type {
  LumaRawExportCapability,
  LumaRawWindowRect,
} from '@lumaforge/luma-raw-runtime'

type LumaRawVisibleCrop = NonNullable<LumaRawExportCapability['visibleCrop']>
type LumaRawExportColorFacts = NonNullable<LumaRawExportCapability['color']>

function assertFiniteInteger(value: number, name: string) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Invalid raw window ${name}.`)
  }
}

function assertRect(rect: LumaRawWindowRect, name: string) {
  assertFiniteInteger(rect.x, `${name}.x`)
  assertFiniteInteger(rect.y, `${name}.y`)
  assertFiniteInteger(rect.width, `${name}.width`)
  assertFiniteInteger(rect.height, `${name}.height`)
}

export function mapOutputRectToRawWindow(input: {
  output: LumaRawWindowRect
  visibleCrop: LumaRawVisibleCrop
  rawWidth: number
  rawHeight: number
  halo: number
}): {
  rawInput: LumaRawWindowRect
  outputWithinWindow: LumaRawWindowRect
} {
  assertRect(input.output, 'output')
  assertRect(input.visibleCrop, 'visibleCrop')
  assertFiniteInteger(input.rawWidth, 'rawWidth')
  assertFiniteInteger(input.rawHeight, 'rawHeight')
  assertFiniteInteger(input.halo, 'halo')

  const rawOutput = {
    x: input.visibleCrop.x + input.output.x,
    y: input.visibleCrop.y + input.output.y,
    width: input.output.width,
    height: input.output.height,
  }

  if (
    rawOutput.x < input.visibleCrop.x ||
    rawOutput.y < input.visibleCrop.y ||
    rawOutput.x + rawOutput.width >
      input.visibleCrop.x + input.visibleCrop.width ||
    rawOutput.y + rawOutput.height >
      input.visibleCrop.y + input.visibleCrop.height ||
    rawOutput.x + rawOutput.width > input.rawWidth ||
    rawOutput.y + rawOutput.height > input.rawHeight
  ) {
    throw new Error(
      'Output rect must be fully contained within the visible raw crop.',
    )
  }

  const visibleCropRight = input.visibleCrop.x + input.visibleCrop.width
  const visibleCropBottom = input.visibleCrop.y + input.visibleCrop.height
  const rawInputX = Math.max(input.visibleCrop.x, rawOutput.x - input.halo)
  const rawInputY = Math.max(input.visibleCrop.y, rawOutput.y - input.halo)
  const rawInputRight = Math.min(
    visibleCropRight,
    rawOutput.x + rawOutput.width + input.halo,
  )
  const rawInputBottom = Math.min(
    visibleCropBottom,
    rawOutput.y + rawOutput.height + input.halo,
  )
  const rawInput = {
    x: rawInputX,
    y: rawInputY,
    width: rawInputRight - rawInputX,
    height: rawInputBottom - rawInputY,
  }

  return {
    rawInput,
    outputWithinWindow: {
      x: rawOutput.x - rawInput.x,
      y: rawOutput.y - rawInput.y,
      width: rawOutput.width,
      height: rawOutput.height,
    },
  }
}

export function applyCameraToWorkingRgbInPlace(
  rgb: Float32Array,
  color: LumaRawExportColorFacts,
): void {
  const matrix = color.cameraToWorkingRgb
  const whiteBalance = color.whiteBalance
  if (!matrix || !whiteBalance) {
    throw new Error('FULL_RES_EXPORT_UNSUPPORTED_SOURCE')
  }

  for (let index = 0; index < rgb.length; index += 3) {
    const cameraR = (rgb[index] ?? 0) * whiteBalance[0]
    const cameraG = (rgb[index + 1] ?? 0) * whiteBalance[1]
    const cameraB = (rgb[index + 2] ?? 0) * whiteBalance[2]

    rgb[index] = matrix[0] * cameraR + matrix[1] * cameraG + matrix[2] * cameraB
    rgb[index + 1] =
      matrix[3] * cameraR + matrix[4] * cameraG + matrix[5] * cameraB
    rgb[index + 2] =
      matrix[6] * cameraR + matrix[7] * cameraG + matrix[8] * cameraB
  }
}
