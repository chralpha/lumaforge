/**
 * .cube LUT file parser.
 * Parses Adobe/Resolve-style .cube 3D LUT files.
 */

import type { LUTData } from '~/lib/gl/pipeline'

export interface ParsedLUT {
  title: string
  size: number
  domainMin: [number, number, number]
  domainMax: [number, number, number]
  data: Float32Array
}

/**
 * Parse a .cube file content into LUT data.
 * @param content - String content of the .cube file
 * @returns Parsed LUT data
 */
export function parseCubeLUT(content: string): ParsedLUT {
  const lines = content.split(/\r?\n/)

  let title = ''
  let size = 0
  let domainMin: [number, number, number] = [0, 0, 0]
  let domainMax: [number, number, number] = [1, 1, 1]
  const dataLines: string[] = []
  let inData = false

  for (const rawLine of lines) {
    const line = rawLine.trim()

    // Skip empty lines and comments
    if (!line || line.startsWith('#')) continue

    // Parse header
    if (line.startsWith('TITLE')) {
      // TITLE "Name" or TITLE Name
      const match = line.match(/TITLE\s+"?([^"]*)"?/)
      if (match) title = match[1]
      continue
    }

    if (line.startsWith('LUT_3D_SIZE')) {
      const match = line.match(/LUT_3D_SIZE\s+(\d+)/)
      if (match) size = Number.parseInt(match[1], 10)
      inData = true
      continue
    }

    if (line.startsWith('DOMAIN_MIN')) {
      const match = line.match(/DOMAIN_MIN\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)/)
      if (match) {
        domainMin = [
          Number.parseFloat(match[1]),
          Number.parseFloat(match[2]),
          Number.parseFloat(match[3]),
        ]
      }
      continue
    }

    if (line.startsWith('DOMAIN_MAX')) {
      const match = line.match(/DOMAIN_MAX\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)/)
      if (match) {
        domainMax = [
          Number.parseFloat(match[1]),
          Number.parseFloat(match[2]),
          Number.parseFloat(match[3]),
        ]
      }
      continue
    }

    // Skip other keywords
    if (
      line.startsWith('LUT_1D_SIZE') ||
      line.startsWith('LUT_1D_INPUT_RANGE') ||
      line.startsWith('LUT_3D_INPUT_RANGE')
    ) {
      continue
    }

    // Data lines
    if (inData && /^[\d.-]+\s+[\d.-]+\s+[\d.-]+/.test(line)) {
      dataLines.push(line)
    }
  }

  if (size === 0) {
    throw new Error('Invalid .cube file: LUT_3D_SIZE not found')
  }

  const expectedEntries = size * size * size
  if (dataLines.length < expectedEntries) {
    throw new Error(
      `Invalid .cube file: expected ${expectedEntries} entries, got ${dataLines.length}`,
    )
  }

  // Parse data into Float32Array
  // LUT is stored in RGB order (R varies fastest, then G, then B)
  // Need to rearrange for WebGL 3D texture (which expects texels in x, y, z order)
  const data = new Float32Array(size * size * size * 3)

  for (let i = 0; i < expectedEntries; i++) {
    const values = dataLines[i]
      .trim()
      .split(/\s+/)
      .map((v) => Number.parseFloat(v))

    if (values.length < 3) {
      throw new Error(`Invalid data at line ${i}: ${dataLines[i]}`)
    }

    // .cube format: R varies fastest, then G, then B
    // This maps to x, y, z in 3D texture
    data[i * 3 + 0] = values[0]
    data[i * 3 + 1] = values[1]
    data[i * 3 + 2] = values[2]
  }

  return {
    title: title || 'Untitled LUT',
    size,
    domainMin,
    domainMax,
    data,
  }
}

/**
 * Parse a .cube file from a File object.
 */
export async function parseCubeFile(file: File): Promise<ParsedLUT> {
  const content = await file.text()
  const lut = parseCubeLUT(content)
  lut.title = lut.title || file.name.replace(/\.cube$/i, '')
  return lut
}

/**
 * Convert parsed LUT to pipeline-compatible format.
 */
export function toLUTData(parsed: ParsedLUT): LUTData {
  return {
    size: parsed.size,
    data: parsed.data,
    domainMin: parsed.domainMin,
    domainMax: parsed.domainMax,
    title: parsed.title,
  }
}

/**
 * Validate LUT data.
 */
export function validateLUT(lut: ParsedLUT): {
  valid: boolean
  errors: string[]
} {
  const errors: string[] = []

  if (![17, 33, 65].includes(lut.size)) {
    errors.push(
      `Unsupported LUT size: ${lut.size}. Only 17, 33, and 65 are allowed in phase 1.`,
    )
  }

  const expectedLength = lut.size * lut.size * lut.size * 3
  if (lut.data.length !== expectedLength) {
    errors.push(
      `Data length mismatch: expected ${expectedLength}, got ${lut.data.length}`,
    )
  }

  for (let i = 0; i < lut.data.length; i++) {
    if (!Number.isFinite(lut.data[i])) {
      errors.push(`Invalid value at index ${i}: ${lut.data[i]}`)
      break
    }
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Generate an identity LUT (no transformation).
 */
export function generateIdentityLUT(size = 33): ParsedLUT {
  const data = new Float32Array(size * size * size * 3)
  const step = 1 / (size - 1)

  let idx = 0
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        data[idx++] = r * step
        data[idx++] = g * step
        data[idx++] = b * step
      }
    }
  }

  return {
    title: 'Identity',
    size,
    domainMin: [0, 0, 0],
    domainMax: [1, 1, 1],
    data,
  }
}

/**
 * Supported LUT file extensions.
 */
export const SUPPORTED_LUT_EXTENSIONS = new Set(['cube'])

/**
 * Check if a file is a supported LUT format.
 */
export function isSupportedLUT(file: File | string): boolean {
  const name = typeof file === 'string' ? file : file.name
  const ext = name.split('.').pop()?.toLowerCase()
  return ext ? SUPPORTED_LUT_EXTENSIONS.has(ext) : false
}
