import type {
  LumaRawCfaInfo,
  LumaRawWindow,
  LumaRawWindowRect,
} from '@lumaforge/luma-raw-runtime'

export type LinearRgbTile = {
  width: number
  height: number
  data: Float32Array
}

type BayerColor = 'r' | 'g' | 'b'

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}

function getPatternColor(
  pattern: Extract<LumaRawCfaInfo['pattern'], 'rggb' | 'bggr' | 'grbg' | 'gbrg'>,
  xParity: number,
  yParity: number,
): BayerColor {
  if (pattern === 'rggb') {
    return yParity === 0
      ? xParity === 0 ? 'r' : 'g'
      : xParity === 0 ? 'g' : 'b'
  }

  if (pattern === 'bggr') {
    return yParity === 0
      ? xParity === 0 ? 'b' : 'g'
      : xParity === 0 ? 'g' : 'r'
  }

  if (pattern === 'grbg') {
    return yParity === 0
      ? xParity === 0 ? 'g' : 'r'
      : xParity === 0 ? 'b' : 'g'
  }

  return yParity === 0
    ? xParity === 0 ? 'g' : 'b'
    : xParity === 0 ? 'r' : 'g'
}

function getColorAt(x: number, y: number, cfa: LumaRawCfaInfo): BayerColor {
  if (
    cfa.pattern !== 'rggb' &&
    cfa.pattern !== 'bggr' &&
    cfa.pattern !== 'grbg' &&
    cfa.pattern !== 'gbrg'
  ) {
    throw new Error(`Unsupported CFA pattern: ${cfa.pattern}`)
  }

  const xParity = (x + cfa.xPhase) & 1
  const yParity = (y + cfa.yPhase) & 1

  return getPatternColor(cfa.pattern, xParity, yParity)
}

function getSample(window: LumaRawWindow, x: number, y: number) {
  const localX = x - window.rect.x
  const localY = y - window.rect.y
  const index = localY * window.rect.width + localX
  const sample = window.data[index] ?? 0
  const normalized =
    (sample - window.blackLevel) /
    Math.max(1, window.whiteLevel - window.blackLevel)

  return clamp01(normalized)
}

function isInside(rect: LumaRawWindowRect, x: number, y: number) {
  return (
    x >= rect.x &&
    x < rect.x + rect.width &&
    y >= rect.y &&
    y < rect.y + rect.height
  )
}

function resolveChannel(
  window: LumaRawWindow,
  x: number,
  y: number,
  target: BayerColor,
) {
  const current = getSample(window, x, y)

  if (getColorAt(x, y, window.cfa) === target) {
    return current
  }

  let total = 0
  let count = 0

  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      if (offsetX === 0 && offsetY === 0) {
        continue
      }

      const nx = x + offsetX
      const ny = y + offsetY

      if (!isInside(window.rect, nx, ny)) {
        continue
      }

      if (getColorAt(nx, ny, window.cfa) !== target) {
        continue
      }

      total += getSample(window, nx, ny)
      count += 1
    }
  }

  if (count === 0) {
    return current
  }

  return total / count
}

export function demosaicBilinearRgb(
  input: LumaRawWindow & { output: LumaRawWindowRect },
): LinearRgbTile {
  const data = new Float32Array(input.output.width * input.output.height * 3)
  let index = 0

  for (let y = input.output.y; y < input.output.y + input.output.height; y += 1) {
    for (
      let x = input.output.x;
      x < input.output.x + input.output.width;
      x += 1
    ) {
      data[index] = resolveChannel(input, x, y, 'r')
      data[index + 1] = resolveChannel(input, x, y, 'g')
      data[index + 2] = resolveChannel(input, x, y, 'b')
      index += 3
    }
  }

  return {
    width: input.output.width,
    height: input.output.height,
    data,
  }
}
