import type {
  LumaRawProcessedWindow,
  LumaRawWindowRect,
} from '@lumaforge/luma-raw-runtime'

const UINT16_MAX = 65535
const CHANNELS_PER_PIXEL = 3
const INVALID_PROCESSED_WINDOW = 'FULL_RES_EXPORT_INVALID_PROCESSED_WINDOW'

export type LinearProPhotoTile = {
  width: number
  height: number
  data: Float32Array
}

function assertSafePositiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0
}

function rectsMatch(left: LumaRawWindowRect, right: LumaRawWindowRect) {
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  )
}

export function processedWindowToLinearProPhotoTile(
  window: LumaRawProcessedWindow,
  expectedRect: LumaRawWindowRect,
): LinearProPhotoTile {
  if (
    window.workingSpace !== 'linear-prophoto-rgb' ||
    window.normalized !== false ||
    window.orientationApplied !== true ||
    window.colorApplied !== true ||
    !assertSafePositiveInteger(window.width) ||
    !assertSafePositiveInteger(window.height) ||
    window.stride !== window.width * CHANNELS_PER_PIXEL ||
    !rectsMatch(window.rect, expectedRect)
  ) {
    throw new Error(INVALID_PROCESSED_WINDOW)
  }

  const expectedLength = window.width * window.height * CHANNELS_PER_PIXEL
  if (
    !Number.isSafeInteger(expectedLength) ||
    expectedLength <= 0 ||
    window.data.length !== expectedLength
  ) {
    throw new Error(INVALID_PROCESSED_WINDOW)
  }

  const data = new Float32Array(expectedLength)
  for (let index = 0; index < expectedLength; index += 1) {
    data[index] = (window.data[index] ?? 0) / UINT16_MAX
  }

  return { width: window.width, height: window.height, data }
}
