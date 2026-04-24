import type { LUTColorProfile } from '~/lib/color/registry'
import {
  getLUTColorProfile,
  inferLUTColorProfileHints,
  searchLUTColorProfiles,
} from '~/lib/color/registry'
import type { LUTInputProfile, LUTProfileResolution } from '~/lib/gl/pipeline'

import type { ParsedLUT } from './cube-parser'

const LUT_PROFILE_SELECTIONS_STORAGE_KEY = 'lumaforge.lutProfileSelections.v1'

function stripCubeExtension(name: string): string {
  return name.replace(/\.cube$/i, '')
}

function normalizeProfileText(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
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
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    )
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

export function applyLUTProfileSelection(
  lut: ParsedLUT,
  profileId: string,
): ParsedLUT | undefined {
  const profile = storeLUTProfileSelection(lut.fingerprint, profileId)
  if (!profile) return undefined

  const profileResolution: LUTProfileResolution = {
    kind: 'resolved',
    confidence: 'user',
    profile: annotateProfileOutput(profile, buildProfileSignature(lut)),
  }

  return {
    ...lut,
    profileResolution,
    inputProfile: toCompatInputProfile(profileResolution),
  }
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

function stripOutputSide(value: string): string {
  if (
    /\b(?:output|target|destination)\s+profile\s*[:=]/i.test(value) ||
    /\bprofile\s*[:=]/i.test(value)
  ) {
    return ''
  }

  const directionalMarker = value.match(
    /(?:^|[^a-z0-9])(?:to|for)(?:[^a-z0-9]|$)|(?:^|[^a-z0-9])(?:to|for)(?=[A-Z0-9])/,
  )
  if (!directionalMarker || directionalMarker.index === undefined) return value
  return value.slice(0, directionalMarker.index)
}

function buildInputSignature(input: {
  title: string
  sourceName?: string
  comments: string[]
}): string {
  return [input.sourceName, input.title, ...input.comments]
    .filter((value): value is string => Boolean(value))
    .map(stripOutputSide)
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

  if (hasVLogInputMarker(signature)) {
    return getRequiredLUTColorProfile('panasonic-vgamut-vlog')
  }

  return undefined
}

function findExplicitProfile(signature: string): LUTColorProfile | undefined {
  const matches = signature.matchAll(
    /\b(?:(?:lut\s+)?input|source|camera)\s+profile\s*[:=]\s*([^\n#;]+)/gi,
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
    /\b(?:bt\s*709|bt\s*1886)\b/.test(normalized) ||
    /\b(?:lc\s*709|709\s+type\s+a|wide\s*dr)\b/.test(normalized) ||
    [
      'torec709',
      'tobt709',
      'tobt1886',
      'bt709',
      'bt1886',
      'lc709',
      '709typea',
      'widedr',
    ].some((marker) => compact.includes(marker))
  ) {
    return {
      role: 'combined-look-output',
      outputGamut: 'srgb-rec709',
      outputTransfer: 'gamma24',
      outputRange: 'full',
    }
  }

  if (/\bto\s+v\s*log\b/.test(normalized) || compact.includes('tovlog')) {
    return {
      role: 'technical-output',
      outputGamut: 'v-gamut',
      outputTransfer: 'v-log',
      outputRange: 'unknown',
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

  const strongProfile = inferStrongProfile(buildInputSignature(input))
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

export function toCompatInputProfile(
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
