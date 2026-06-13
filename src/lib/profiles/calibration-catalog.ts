import type { OnlineProfileIssue, OnlineProfileIssueCode } from './catalog'
import type { DcpParams, DcpParamsToneCurve } from './dcp-params'
import { validateDcpParams } from './dcp-params'
import { fetchJsonWithLimit, OnlineProfileFetchError } from './fetch'

// Calibration entries are the camera/lens calibration counterpart to
// `OnlineLUTEntry` from ./catalog. They share the issue-code vocabulary
// because the user-facing chip language is uniform across both stages, but the
// entry shape is intentionally distinct — never widen `OnlineLUTEntry` to
// carry calibration assets, otherwise the LUT browser would silently
// "accept" calibration catalogs and the `calibration-catalog` mix-up hint in
// `lut-issue-copy.ts` would stop firing for the very case it exists for.

export type CalibrationEntryKind = 'camera-profile'

const SUPPORTED_KINDS: readonly CalibrationEntryKind[] = ['camera-profile']

export interface CalibrationEntryTargets {
  cameraMakers?: readonly string[]
  cameraModels?: readonly string[]
}

export interface CalibrationEntry {
  id: string
  kind: CalibrationEntryKind
  title: string
  version: string
  /**
   * URL of the `dcp-params` JSON sidecar asset. `null` means the producer did
   * not ship sidecar params for this profile, so the entry is "unsupported on
   * this client" silently — clients fall back to whatever neutral path they
   * already had.
   */
  dcpParamsAssetUrl: string | null
  /**
   * URL of the binary `.dcp` asset. Kept for provenance and future re-parse
   * paths (e.g. a worker that derives `dcp-params` locally when the producer
   * has not pre-baked the sidecar yet).
   */
  dcpAssetUrl: string | null
  targets?: CalibrationEntryTargets
}

export interface ParseCalibrationCatalogResult {
  entries: CalibrationEntry[]
  issues: OnlineProfileIssue[]
}

interface Asset {
  role: string
  url: string
  mediaType?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function readString(
  value: Record<string, unknown>,
  key: string,
): string | undefined {
  const field = value[key]

  return typeof field === 'string' ? field : undefined
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined

  const out = value.filter(
    (entry): entry is string => typeof entry === 'string',
  )

  return out.length > 0 ? out : undefined
}

function issue(
  code: OnlineProfileIssueCode,
  message: string,
  entryId?: string,
): OnlineProfileIssue {
  return { code, message, entryId }
}

function isRuntimeUrl(value: string | undefined): boolean {
  if (!value) return false

  try {
    const url = new URL(value)

    if (url.protocol === 'https:') return true

    if (url.protocol !== 'http:') return false

    const host = url.hostname.toLowerCase()

    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]'
  } catch {
    return false
  }
}

function readAsset(value: unknown): Asset | undefined {
  if (!isRecord(value)) return undefined

  const role = readString(value, 'role')
  const url = readString(value, 'url')
  if (!role || !url) return undefined

  return { role, url, mediaType: readString(value, 'mediaType') }
}

function collectAssets(entry: Record<string, unknown>): Asset[] {
  const assets: Asset[] = []

  const primary = readAsset(entry.primaryAsset)
  if (primary) assets.push(primary)

  if (Array.isArray(entry.assets)) {
    for (const candidate of entry.assets) {
      const asset = readAsset(candidate)
      if (asset) assets.push(asset)
    }
  }

  return assets
}

function findFirstAssetUrl(assets: Asset[], role: string): string | null {
  for (const asset of assets) {
    if (asset.role !== role) continue
    if (!isRuntimeUrl(asset.url)) continue

    return asset.url
  }

  return null
}

function readTargets(value: unknown): CalibrationEntryTargets | undefined {
  if (!isRecord(value)) return undefined

  const cameraMakers = readStringArray(value.cameraMakers)
  const cameraModels = readStringArray(value.cameraModels)

  if (!cameraMakers && !cameraModels) return undefined

  const targets: CalibrationEntryTargets = {}
  if (cameraMakers) targets.cameraMakers = cameraMakers
  if (cameraModels) targets.cameraModels = cameraModels

  return targets
}

function parseCalibrationEntry(
  entry: Record<string, unknown>,
):
  | { ok: true; value: CalibrationEntry }
  | { ok: false; issues: OnlineProfileIssue[] } {
  const id = readString(entry, 'id')
  const title = readString(entry, 'title')
  const version = readString(entry, 'version')

  if (!id || !title || !version) {
    return {
      ok: false,
      issues: [
        issue(
          'invalid-entry',
          'Calibration entry is missing required fields.',
          id,
        ),
      ],
    }
  }

  const kind = readString(entry, 'kind') as CalibrationEntryKind | undefined
  if (!kind || !SUPPORTED_KINDS.includes(kind)) {
    return {
      ok: false,
      issues: [
        issue(
          'unsupported-entry',
          'Only camera-profile calibration entries are supported.',
          id,
        ),
      ],
    }
  }

  const assets = collectAssets(entry)

  // Asset presence is the only gate. A missing dcp-params asset means the
  // producer has not shipped sidecar params for this profile yet — surface
  // the entry with null instead of dropping it so the catalog stays
  // discoverable; the client renders it as "unsupported on this client" with
  // no error chip.
  const dcpParamsAssetUrl = findFirstAssetUrl(assets, 'dcp-params')
  const dcpAssetUrl = findFirstAssetUrl(assets, 'dcp')

  const targets = readTargets(entry.targets)

  const value: CalibrationEntry = {
    id,
    kind,
    title,
    version,
    dcpParamsAssetUrl,
    dcpAssetUrl,
  }
  if (targets) value.targets = targets

  return { ok: true, value }
}

/**
 * Parse a release catalog document and extract calibration entries
 * (camera-profile / future lens-correction-profile kinds). LUT entries in the
 * same document are ignored — they belong to {@link parseReleaseCatalog} in
 * ./catalog.ts. This mirrors the sibling pattern so the LUT-side
 * "calibration-catalog" mix-up issue keeps firing for the user who points the
 * LUT browser at this catalog.
 *
 * Per the contract, asset presence is the only gate. There is no
 * catalog-version check here; producers ratchet via per-entry asset shipping.
 */
export function parseCalibrationCatalog(
  doc: unknown,
): ParseCalibrationCatalogResult {
  if (
    !isRecord(doc) ||
    doc.schemaVersion !== 1 ||
    !Array.isArray(doc.entries)
  ) {
    return {
      entries: [],
      issues: [
        issue('invalid-catalog', 'Calibration catalog shape is invalid.'),
      ],
    }
  }

  const entries: CalibrationEntry[] = []
  const issues: OnlineProfileIssue[] = []

  for (const raw of doc.entries) {
    if (!isRecord(raw)) {
      issues.push(issue('invalid-entry', 'Calibration entry is invalid.'))
      continue
    }

    const kind = readString(raw, 'kind')

    // LUT entries belong to the LUT catalog parser; silently skip them here
    // so a mixed catalog reads as "n calibration entries" without spurious
    // unsupported-entry chips.
    if (kind === 'lut') continue

    const parsed = parseCalibrationEntry(raw)
    if (parsed.ok) {
      entries.push(parsed.value)
    } else {
      issues.push(...parsed.issues)
    }
  }

  return { entries, issues }
}

const DEFAULT_DCP_PARAMS_MAX_BYTES = 1 * 1024 * 1024

export interface FetchDcpParamsOptions {
  signal?: AbortSignal
  /** Default 1 MiB — sidecars are tiny, oversize is almost always a wrong URL. */
  maxBytes?: number
}

/**
 * Fetch and validate a `dcp-params` sidecar from a calibration catalog URL.
 * Uses the existing fetch layer for size + JSON safety, then runs the
 * hand-rolled v1 validator from ./dcp-params.
 */
export async function fetchDcpParams(
  url: string,
  options: FetchDcpParamsOptions = {},
): Promise<DcpParams> {
  const json = await fetchJsonWithLimit<unknown>(url, {
    signal: options.signal,
    maxBytes: options.maxBytes ?? DEFAULT_DCP_PARAMS_MAX_BYTES,
  })

  const result = validateDcpParams(json)
  if (!result.ok) {
    const first = result.issues[0]
    const detail = first ? `${first.path}: ${first.message}` : 'invalid shape'

    throw new OnlineProfileFetchError(
      'invalid-json',
      `DCP parameters sidecar failed validation (${detail}).`,
    )
  }

  return result.value
}

/**
 * Decode a v1 tone-curve sidecar payload into a Float32Array. The payload is
 * little-endian Float32 base64; we trust the producer's byte order (DNG's
 * canonical curve is little-endian on every target platform LumaForge ships
 * to) but validate length so a truncated transfer fails closed instead of
 * silently producing a short curve.
 */
export function decodeToneCurveLut(curve: DcpParamsToneCurve): Float32Array {
  if (curve.encoding !== 'cubic-spline-baked-1d-lut') {
    throw new Error(
      `Unsupported tone curve encoding: ${String(curve.encoding)}`,
    )
  }
  if (!Number.isInteger(curve.size) || curve.size <= 0) {
    throw new Error(
      `Tone curve size must be a positive integer (got ${curve.size}).`,
    )
  }

  const bytes = decodeBase64(curve.values)
  const expectedBytes = curve.size * Float32Array.BYTES_PER_ELEMENT

  if (bytes.byteLength < expectedBytes) {
    throw new Error(
      `Tone curve payload is truncated: expected ${expectedBytes} bytes, got ${bytes.byteLength}.`,
    )
  }

  // Copy into a freshly aligned buffer because the base64 decode can land at
  // a non-Float32-aligned offset on some runtimes; constructing the typed
  // array on the underlying buffer would throw `RangeError: byte offset of
  // Float32Array should be a multiple of 4`.
  const aligned = new ArrayBuffer(expectedBytes)
  new Uint8Array(aligned).set(bytes.subarray(0, expectedBytes))

  return new Float32Array(aligned, 0, curve.size)
}

function decodeBase64(value: string): Uint8Array {
  // Browser + Node (16+) both expose atob, which keeps the helper
  // dependency-free and matches the rest of the lib/profiles layer (no Buffer
  // global leak into the bundle).
  if (typeof atob !== 'function') {
    throw new TypeError('No base64 decoder available in this runtime.')
  }

  const binary = atob(value)
  const out = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    out[index] = binary.charCodeAt(index)
  }

  return out
}
