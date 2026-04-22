export type SupportKey = {
  cameraBrand?: string
  cameraModel?: string
  rawFormat?: string
}

export const OFFICIAL_MATRIX: Array<SupportKey> = []

function normalizeValue(value?: string) {
  return value?.trim().toLowerCase() || ''
}

export function classifySupportLevel(input: SupportKey) {
  const isOfficial = OFFICIAL_MATRIX.some(
    (entry) =>
      normalizeValue(entry.cameraBrand) === normalizeValue(input.cameraBrand) &&
      normalizeValue(entry.cameraModel) === normalizeValue(input.cameraModel) &&
      normalizeValue(entry.rawFormat) === normalizeValue(input.rawFormat),
  )

  return isOfficial ? 'official' : 'experimental'
}
