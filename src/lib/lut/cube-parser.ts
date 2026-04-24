/**
 * .cube LUT file parser.
 * Parses Adobe/Resolve-style .cube 3D LUT files.
 */

import type { LUTColorProfile } from '~/lib/color/registry'
import {
  getLUTColorProfile,
  inferLUTColorProfileHints,
  searchLUTColorProfiles,
} from '~/lib/color/registry'
import type {
  LUTData,
  LUTInputProfile,
  LUTProfileResolution,
} from '~/lib/gl/pipeline'

export interface ParsedLUT {
  title: string
  sourceName?: string
  comments: string[]
  size: number
  domainMin: [number, number, number]
  domainMax: [number, number, number]
  data: Float32Array
  fingerprint: string
  profileResolution: LUTProfileResolution
  inputProfile: LUTInputProfile
}

interface ParseCubeOptions {
  sourceName?: string
}

const CUBE_FLOAT_PATTERN = '[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:e[+-]?\\d+)?'
const CUBE_DATA_LINE_RE = new RegExp(
  `^${CUBE_FLOAT_PATTERN}\\s+${CUBE_FLOAT_PATTERN}\\s+${CUBE_FLOAT_PATTERN}(?:\\s|$)`,
  'i',
)
const DOMAIN_MIN_RE = new RegExp(
  `DOMAIN_MIN\\s+(${CUBE_FLOAT_PATTERN})\\s+(${CUBE_FLOAT_PATTERN})\\s+(${CUBE_FLOAT_PATTERN})`,
  'i',
)
const DOMAIN_MAX_RE = new RegExp(
  `DOMAIN_MAX\\s+(${CUBE_FLOAT_PATTERN})\\s+(${CUBE_FLOAT_PATTERN})\\s+(${CUBE_FLOAT_PATTERN})`,
  'i',
)
const LUT_PROFILE_SELECTIONS_STORAGE_KEY = 'lumaforge.lutProfileSelections.v1'

function stripCubeExtension(name: string): string {
  return name.replace(/\.cube$/i, '')
}

function normalizeProfileText(value: string): string {
  return value
    .toLowerCase()
    .replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/(\d)([a-z])/g, '$1 $2')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function compactProfileText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function resolveCompatProfileId(profileId: string): string {
  const compact = compactProfileText(profileId)
  if (compact === 'vlog' || compact === 'vloginput') {
    return 'panasonic-vgamut-vlog'
  }
  if (compact === 'displaysrgb' || compact === 'srgbdisplay') {
    return 'display-srgb'
  }
  return profileId
}

function getCompatibleLUTColorProfile(
  profileId: string,
): LUTColorProfile | undefined {
  return getLUTColorProfile(resolveCompatProfileId(profileId))
}

function getRequiredLUTColorProfile(profileId: string): LUTColorProfile {
  const profile = getCompatibleLUTColorProfile(profileId)
  if (!profile) {
    throw new Error(`Missing LUT color profile: ${profileId}`)
  }
  return profile
}

function getLUTProfileStorage(): Storage | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

function readStoredLUTProfileSelections(): Record<string, string> {
  const storage = getLUTProfileStorage()
  if (!storage) return {}

  try {
    const raw = storage.getItem(LUT_PROFILE_SELECTIONS_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {}
    }
    return parsed as Record<string, string>
  } catch {
    return {}
  }
}

function writeStoredLUTProfileSelections(selections: Record<string, string>) {
  const storage = getLUTProfileStorage()
  if (!storage) return

  try {
    storage.setItem(
      LUT_PROFILE_SELECTIONS_STORAGE_KEY,
      JSON.stringify(selections),
    )
  } catch {
    // Storage can be unavailable or quota-limited; profile resolution should still work.
  }
}

export function getStoredLUTProfileSelection(
  fingerprint: string,
): LUTColorProfile | undefined {
  const profileId = readStoredLUTProfileSelections()[fingerprint]
  return profileId ? getCompatibleLUTColorProfile(profileId) : undefined
}

export function storeLUTProfileSelection(
  fingerprint: string,
  profileId: string,
): LUTColorProfile | undefined {
  const profile = getCompatibleLUTColorProfile(profileId)
  if (!profile) return undefined

  writeStoredLUTProfileSelections({
    ...readStoredLUTProfileSelections(),
    [fingerprint]: profile.id,
  })

  return profile
}

function extractCubeComments(content: string): string[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('#'))
    .map((line) => line.replace(/^#+\s?/, '').trim())
    .filter(Boolean)
}

function buildProfileSignature(input: {
  title: string
  sourceName?: string
  comments: string[]
}): string {
  return [input.sourceName, input.title, ...input.comments]
    .filter(Boolean)
    .join('\n')
}

function hasDisplaySRGBInputMarker(signature: string): boolean {
  const normalized = normalizeProfileText(signature)
  return (
    /\bdisplay\s+(?:referred\s+)?s\s*rgb\b/.test(normalized) ||
    /\bs\s*rgb\s+display\b/.test(normalized) ||
    /\b(?:web|photo|image)\s+s\s*rgb\b/.test(normalized) ||
    /\binput\s+s\s*rgb\b/.test(normalized) ||
    /\bs\s*rgb\s+input\b/.test(normalized)
  )
}

function hasVLogInputMarker(signature: string): boolean {
  const normalized = normalizeProfileText(signature)
  const compact = compactProfileText(signature)
  return (
    compact.includes('lumixphotostylevlog') ||
    compact.includes('panasonicvlog') ||
    compact.includes('vgamutvlog') ||
    /\bv\s*log\b/.test(normalized) ||
    /\bvlog\b/.test(normalized)
  )
}

function hasAllCompactMarkers(signature: string, markers: string[]): boolean {
  const compact = compactProfileText(signature)
  return markers.every((marker) => compact.includes(marker))
}

function inferStrongProfile(signature: string): LUTColorProfile | undefined {
  const compact = compactProfileText(signature)

  if (hasDisplaySRGBInputMarker(signature)) {
    return getRequiredLUTColorProfile('display-srgb')
  }

  if (hasVLogInputMarker(signature)) {
    return getRequiredLUTColorProfile('panasonic-vgamut-vlog')
  }

  if (hasAllCompactMarkers(signature, ['sgamut3cine', 'slog3'])) {
    return getRequiredLUTColorProfile('sony-sgamut3cine-slog3')
  }

  if (
    hasAllCompactMarkers(signature, ['sgamut3', 'slog3']) &&
    !compact.includes('sgamut3cine')
  ) {
    return getRequiredLUTColorProfile('sony-sgamut3-slog3')
  }

  if (
    hasAllCompactMarkers(signature, ['sgamut', 'slog2']) &&
    !compact.includes('sgamut3')
  ) {
    return getRequiredLUTColorProfile('sony-sgamut-slog2')
  }

  return undefined
}

function findExplicitProfile(signature: string): LUTColorProfile | undefined {
  const matches = signature.matchAll(
    /\b(?:input\s+)?(?:lut\s+)?profile\s*[:=]\s*([^\n#;]+)/gi,
  )

  for (const match of matches) {
    const value = match[1].trim()
    const directProfile = getCompatibleLUTColorProfile(value)
    if (directProfile) return directProfile

    const [searchResult] = searchLUTColorProfiles(value)
    if (searchResult) return searchResult
  }

  return undefined
}

function inferOutputAnnotation(
  signature: string,
): Partial<
  Pick<
    LUTColorProfile,
    'outputGamut' | 'outputTransfer' | 'outputRange' | 'role'
  >
> {
  const normalized = normalizeProfileText(signature)
  const compact = compactProfileText(signature)

  if (
    /\b(?:to|for)\s+(?:rec\s*709|bt\s*709|bt\s*1886)\b/.test(normalized) ||
    /\b(?:lc\s*709|709\s+type\s+a|wide\s*dr)\b/.test(normalized) ||
    ['torec709', 'tobt709', 'tobt1886', 'lc709', '709typea', 'widedr'].some(
      (marker) => compact.includes(marker),
    )
  ) {
    return {
      role: 'combined-look-output',
      outputGamut: 'srgb-rec709',
      outputTransfer: 'gamma24',
      outputRange: 'full',
    }
  }

  if (/\bto\s+linear\b/.test(normalized) || compact.includes('tolinear')) {
    return {
      role: 'technical-output',
      outputRange: 'unknown',
    }
  }

  if (/\bto\s+cineon\b/.test(normalized) || compact.includes('tocineon')) {
    return {
      role: 'combined-look-output',
      outputRange: 'unknown',
    }
  }

  return {}
}

function annotateProfileOutput(
  profile: LUTColorProfile,
  signature: string,
): LUTColorProfile {
  const outputAnnotation = inferOutputAnnotation(signature)
  if (Object.keys(outputAnnotation).length === 0) return profile

  return {
    ...profile,
    ...outputAnnotation,
  }
}

function uniqueProfiles(profiles: LUTColorProfile[]): LUTColorProfile[] {
  const seen = new Set<string>()
  const unique: LUTColorProfile[] = []

  for (const profile of profiles) {
    if (seen.has(profile.id)) continue
    seen.add(profile.id)
    unique.push(profile)
  }

  return unique
}

export function resolveLUTProfile(input: {
  title: string
  sourceName?: string
  comments: string[]
  fingerprint?: string
}): LUTProfileResolution {
  const signature = buildProfileSignature(input)

  if (input.fingerprint) {
    const storedProfile = getStoredLUTProfileSelection(input.fingerprint)
    if (storedProfile) {
      return {
        kind: 'resolved',
        confidence: 'user',
        profile: annotateProfileOutput(storedProfile, signature),
      }
    }
  }

  const explicitProfile = findExplicitProfile(signature)
  if (explicitProfile) {
    return {
      kind: 'resolved',
      confidence: 'explicit',
      profile: annotateProfileOutput(explicitProfile, signature),
    }
  }

  const strongProfile = inferStrongProfile(signature)
  if (strongProfile) {
    return {
      kind: 'resolved',
      confidence: 'filename',
      profile: annotateProfileOutput(strongProfile, signature),
    }
  }

  const suggestions = uniqueProfiles(
    inferLUTColorProfileHints(input).map((profile) =>
      annotateProfileOutput(profile, signature),
    ),
  )

  return {
    kind: 'needs-user-selection',
    suggestions,
  }
}

function toCompatInputProfile(
  profileResolution: LUTProfileResolution,
): LUTInputProfile {
  if (profileResolution.kind !== 'resolved') return 'display-srgb'

  const { profile } = profileResolution
  if (
    profile.id === 'panasonic-vgamut-vlog' ||
    profile.inputTransfer === 'v-log'
  ) {
    return 'v-log'
  }

  return 'display-srgb'
}

function createLUTFingerprint(input: {
  sourceName?: string
  title: string
  size: number
  domainMin: [number, number, number]
  domainMax: [number, number, number]
  comments: string[]
  data: Float32Array
}): string {
  const sampleIndexes = Array.from(
    new Set(
      [
        0,
        1,
        2,
        Math.floor(input.data.length / 2),
        input.data.length - 3,
        input.data.length - 2,
        input.data.length - 1,
      ].filter((index) => index >= 0 && index < input.data.length),
    ),
  )
  const dataSamples = sampleIndexes
    .map((index) => `${index}:${input.data[index].toPrecision(8)}`)
    .join('|')
  const fingerprintSource = [
    input.sourceName ?? '',
    input.title,
    input.size,
    input.domainMin.join(','),
    input.domainMax.join(','),
    input.comments.join('\n'),
    input.data.length,
    dataSamples,
  ].join('\u001F')

  let hash = 0x811C9DC5
  for (let i = 0; i < fingerprintSource.length; i++) {
    hash ^= fingerprintSource.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }

  return `lut-${(hash >>> 0).toString(36)}`
}

export function inferLUTInputProfile({
  content,
  sourceName,
  title,
}: {
  content: string
  sourceName?: string
  title?: string
}): LUTInputProfile {
  return toCompatInputProfile(
    resolveLUTProfile({
      title: title || (sourceName ? stripCubeExtension(sourceName) : ''),
      sourceName,
      comments: extractCubeComments(content),
    }),
  )
}

/**
 * Parse a .cube file content into LUT data.
 * @param content - String content of the .cube file
 * @returns Parsed LUT data
 */
export function parseCubeLUT(
  content: string,
  options: ParseCubeOptions = {},
): ParsedLUT {
  const lines = content.split(/\r?\n/)

  let title = ''
  let size = 0
  let domainMin: [number, number, number] = [0, 0, 0]
  let domainMax: [number, number, number] = [1, 1, 1]
  const comments: string[] = []
  const dataLines: string[] = []
  let inData = false

  for (const rawLine of lines) {
    const line = rawLine.trim()

    // Skip empty lines and preserve comments for profile hinting.
    if (!line) continue
    if (line.startsWith('#')) {
      const comment = line.replace(/^#+\s?/, '').trim()
      if (comment) comments.push(comment)
      continue
    }

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
      const match = line.match(DOMAIN_MIN_RE)
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
      const match = line.match(DOMAIN_MAX_RE)
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
    if (inData && CUBE_DATA_LINE_RE.test(line)) {
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

  const resolvedTitle =
    title ||
    (options.sourceName
      ? stripCubeExtension(options.sourceName)
      : 'Untitled LUT')
  const fingerprint = createLUTFingerprint({
    sourceName: options.sourceName,
    title: resolvedTitle,
    size,
    domainMin,
    domainMax,
    comments,
    data,
  })
  const profileResolution = resolveLUTProfile({
    title: resolvedTitle,
    sourceName: options.sourceName,
    comments,
    fingerprint,
  })

  return {
    title: resolvedTitle,
    sourceName: options.sourceName,
    comments,
    size,
    domainMin,
    domainMax,
    data,
    fingerprint,
    profileResolution,
    inputProfile: toCompatInputProfile(profileResolution),
  }
}

/**
 * Parse a .cube file from a File object.
 */
export async function parseCubeFile(file: File): Promise<ParsedLUT> {
  const content = await file.text()
  return parseCubeLUT(content, { sourceName: file.name })
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
    inputProfile: parsed.inputProfile,
    profileResolution: parsed.profileResolution,
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

  const fingerprint = createLUTFingerprint({
    title: 'Identity',
    size,
    domainMin: [0, 0, 0],
    domainMax: [1, 1, 1],
    comments: [],
    data,
  })
  const profileResolution: LUTProfileResolution = {
    kind: 'resolved',
    confidence: 'explicit',
    profile: getRequiredLUTColorProfile('display-srgb'),
  }

  return {
    title: 'Identity',
    comments: [],
    size,
    domainMin: [0, 0, 0],
    domainMax: [1, 1, 1],
    data,
    fingerprint,
    profileResolution,
    inputProfile: 'display-srgb',
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
