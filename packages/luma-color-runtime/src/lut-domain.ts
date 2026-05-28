export type RgbTuple = readonly [number, number, number]
export type MutableRgbTuple = [number, number, number]

function normalizeToDomain(
  value: number,
  domainMin: number,
  domainMax: number,
) {
  const span = domainMax - domainMin
  if (!Number.isFinite(value) || !Number.isFinite(span) || span <= 0) return 0
  return Math.max(0, (value - domainMin) / span)
}

function denormalizeFromDomain(
  normalized: number,
  domainMin: number,
  domainMax: number,
) {
  return domainMin + normalized * (domainMax - domainMin)
}

export function compressLutInputToDomain(
  input: RgbTuple,
  domainMin: RgbTuple,
  domainMax: RgbTuple,
  output: MutableRgbTuple = [0, 0, 0],
): MutableRgbTuple {
  const normalizedR = normalizeToDomain(input[0], domainMin[0], domainMax[0])
  const normalizedG = normalizeToDomain(input[1], domainMin[1], domainMax[1])
  const normalizedB = normalizeToDomain(input[2], domainMin[2], domainMax[2])
  const peak = Math.max(normalizedR, normalizedG, normalizedB)
  const scale = peak > 1 ? 1 / peak : 1

  output[0] = denormalizeFromDomain(
    normalizedR * scale,
    domainMin[0],
    domainMax[0],
  )
  output[1] = denormalizeFromDomain(
    normalizedG * scale,
    domainMin[1],
    domainMax[1],
  )
  output[2] = denormalizeFromDomain(
    normalizedB * scale,
    domainMin[2],
    domainMax[2],
  )

  return output
}
