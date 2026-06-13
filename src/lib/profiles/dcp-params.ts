// DCP parameters sidecar — a hand-written TypeScript mirror of
// `schemas/dcp-params.schema.json` in the lumaforge-profiles repo. Producers
// extract these fields at profile-build time and ship them next to the binary
// `.dcp` asset as a JSON sidecar so the runtime can apply colour calibration
// without re-parsing the binary DCP container.
//
// Sibling of `dcp-params.schema.json`: the field names, casing, and
// nullability must stay in lock-step with that schema. v1 is intentionally
// strict — additive fields go through a schemaVersion bump. The validator
// here is hand-rolled (no zod) so we don't pay a runtime dependency for what
// is read once per profile load.

export type DcpParamsValidationCode =
  | 'invalid-shape'
  | 'invalid-schema-version'
  | 'missing-field'
  | 'invalid-field'

export interface DcpParamsValidationIssue {
  code: DcpParamsValidationCode
  path: string
  message: string
}

export type DcpParamsValidationResult =
  | { ok: true; value: DcpParams }
  | { ok: false; issues: DcpParamsValidationIssue[] }

export interface DcpParamsIlluminant {
  /** DNG IFD CalibrationIlluminant tag value. */
  code: number
  /** Correlated colour temperature, Kelvin. */
  cct: number
  /** Optional CIE xy whitepoint when known. */
  xy?: readonly [number, number]
}

export interface DcpParamsToneCurve {
  encoding: 'cubic-spline-baked-1d-lut'
  /** Sample count (== Float32 element count of `values`). v1 requires >= 4096. */
  size: number
  /** Base64-encoded little-endian Float32 array, length == size. */
  values: string
}

export interface DcpParams {
  schemaVersion: 1
  profileName: string
  uniqueCameraModelRestriction: string | null
  /** Reserved. Non-null pairs the DCP with an LCP/Look sharing the same signature. */
  profileCalibrationSignature: string | null
  /** 0 allow copying / 1 embed-if-used / 2 never embed / 3 no-restrictions. */
  profileEmbedPolicy: number
  illuminant1: DcpParamsIlluminant
  illuminant2: DcpParamsIlluminant | null
  /** 3x3 row-major XYZ -> CameraRGB matrix (DNG convention), length 9. */
  colorMatrix1: readonly number[]
  colorMatrix2: readonly number[] | null
  /** Reserved for phase 2. Phase 1 producers MAY emit; phase 1 clients ignore. */
  forwardMatrix1: readonly number[] | null
  forwardMatrix2: readonly number[] | null
  toneCurve: DcpParamsToneCurve | null
  /** Reserved for phase 2. Final shape not locked in v1. */
  hueSatMap: unknown | null
  /** Reserved for phase 2. Final shape not locked in v1. */
  lookTable: unknown | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function issue(
  code: DcpParamsValidationCode,
  path: string,
  message: string,
): DcpParamsValidationIssue {
  return { code, path, message }
}

function validateMatrix(
  value: unknown,
  path: string,
  required: boolean,
  issues: DcpParamsValidationIssue[],
): readonly number[] | null | undefined {
  if (value === null) return null

  if (value === undefined) {
    if (required) {
      issues.push(issue('missing-field', path, `${path} is required.`))
    }
    return undefined
  }

  if (!Array.isArray(value) || value.length !== 9) {
    issues.push(
      issue(
        'invalid-field',
        path,
        `${path} must be a 9-element row-major 3x3 matrix.`,
      ),
    )

    return undefined
  }

  for (let index = 0; index < value.length; index += 1) {
    const entry = value[index]
    if (typeof entry !== 'number' || !Number.isFinite(entry)) {
      issues.push(
        issue(
          'invalid-field',
          `${path}[${index}]`,
          'Matrix entries must be finite numbers.',
        ),
      )

      return undefined
    }
  }

  return value as readonly number[]
}

function validateIlluminant(
  value: unknown,
  path: string,
  issues: DcpParamsValidationIssue[],
): DcpParamsIlluminant | undefined {
  if (!isRecord(value)) {
    issues.push(issue('invalid-field', path, `${path} must be an object.`))

    return undefined
  }

  const { code, cct, xy } = value

  if (
    typeof code !== 'number' ||
    !Number.isFinite(code) ||
    !Number.isInteger(code)
  ) {
    issues.push(
      issue(
        'invalid-field',
        `${path}.code`,
        `${path}.code must be an integer.`,
      ),
    )

    return undefined
  }

  if (typeof cct !== 'number' || !Number.isFinite(cct) || cct <= 0) {
    issues.push(
      issue(
        'invalid-field',
        `${path}.cct`,
        `${path}.cct must be a positive number.`,
      ),
    )

    return undefined
  }

  let xyPair: readonly [number, number] | undefined

  if (xy !== undefined) {
    if (
      !Array.isArray(xy) ||
      xy.length !== 2 ||
      typeof xy[0] !== 'number' ||
      typeof xy[1] !== 'number' ||
      !Number.isFinite(xy[0]) ||
      !Number.isFinite(xy[1])
    ) {
      issues.push(
        issue(
          'invalid-field',
          `${path}.xy`,
          `${path}.xy must be a finite [x, y] pair.`,
        ),
      )

      return undefined
    }

    xyPair = [xy[0], xy[1]] as const
  }

  return xyPair ? { code, cct, xy: xyPair } : { code, cct }
}

function validateOptionalIlluminant(
  value: unknown,
  path: string,
  issues: DcpParamsValidationIssue[],
): DcpParamsIlluminant | null | undefined {
  if (value === null) return null

  return validateIlluminant(value, path, issues)
}

function validateToneCurve(
  value: unknown,
  path: string,
  issues: DcpParamsValidationIssue[],
): DcpParamsToneCurve | null | undefined {
  if (value === null) return null

  if (!isRecord(value)) {
    issues.push(
      issue('invalid-field', path, `${path} must be an object or null.`),
    )

    return undefined
  }

  const { encoding, size, values } = value

  if (encoding !== 'cubic-spline-baked-1d-lut') {
    issues.push(
      issue(
        'invalid-field',
        `${path}.encoding`,
        `${path}.encoding must be 'cubic-spline-baked-1d-lut'.`,
      ),
    )

    return undefined
  }

  if (typeof size !== 'number' || !Number.isInteger(size) || size <= 0) {
    issues.push(
      issue(
        'invalid-field',
        `${path}.size`,
        `${path}.size must be a positive integer.`,
      ),
    )

    return undefined
  }

  if (typeof values !== 'string' || values.length === 0) {
    issues.push(
      issue(
        'invalid-field',
        `${path}.values`,
        `${path}.values must be a non-empty base64 string.`,
      ),
    )

    return undefined
  }

  return { encoding, size, values }
}

function validateEmbedPolicy(
  value: unknown,
  issues: DcpParamsValidationIssue[],
): number | undefined {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > 3
  ) {
    issues.push(
      issue(
        'invalid-field',
        'profileEmbedPolicy',
        'profileEmbedPolicy must be an integer in [0, 3].',
      ),
    )

    return undefined
  }

  return value
}

function validateNullableString(
  value: unknown,
  path: string,
  issues: DcpParamsValidationIssue[],
): string | null | undefined {
  if (value === null) return null
  if (typeof value === 'string') return value

  issues.push(issue('invalid-field', path, `${path} must be a string or null.`))

  return undefined
}

/**
 * Validate a parsed JSON document against the v1 DCP parameters schema.
 *
 * Required fields are all required; reserved fields (forward matrices,
 * hueSatMap, lookTable, illuminant2) MAY be null. Returns a result envelope so
 * callers can surface targeted issues without throwing.
 */
export function validateDcpParams(doc: unknown): DcpParamsValidationResult {
  if (!isRecord(doc)) {
    return {
      ok: false,
      issues: [issue('invalid-shape', '$', 'Document must be a JSON object.')],
    }
  }

  if (doc.schemaVersion !== 1) {
    return {
      ok: false,
      issues: [
        issue(
          'invalid-schema-version',
          'schemaVersion',
          'schemaVersion must be 1.',
        ),
      ],
    }
  }

  const issues: DcpParamsValidationIssue[] = []

  if (typeof doc.profileName !== 'string' || doc.profileName.length === 0) {
    issues.push(
      issue(
        'invalid-field',
        'profileName',
        'profileName must be a non-empty string.',
      ),
    )
  }

  const uniqueCameraModelRestriction = validateNullableString(
    doc.uniqueCameraModelRestriction,
    'uniqueCameraModelRestriction',
    issues,
  )
  const profileCalibrationSignature = validateNullableString(
    doc.profileCalibrationSignature,
    'profileCalibrationSignature',
    issues,
  )

  const profileEmbedPolicy = validateEmbedPolicy(doc.profileEmbedPolicy, issues)

  const illuminant1 = validateIlluminant(doc.illuminant1, 'illuminant1', issues)
  if (doc.illuminant2 === undefined) {
    issues.push(
      issue(
        'missing-field',
        'illuminant2',
        'illuminant2 is required (use null when absent).',
      ),
    )
  }
  const illuminant2 = validateOptionalIlluminant(
    doc.illuminant2,
    'illuminant2',
    issues,
  )

  // colorMatrix1 is required; colorMatrix2 is nullable but the key must be
  // present (mirrors the JSON schema's `required` list).
  const colorMatrix1 = validateMatrix(
    doc.colorMatrix1,
    'colorMatrix1',
    true,
    issues,
  )
  if (doc.colorMatrix2 === undefined) {
    issues.push(
      issue(
        'missing-field',
        'colorMatrix2',
        'colorMatrix2 is required (use null when absent).',
      ),
    )
  }
  const colorMatrix2 = validateMatrix(
    doc.colorMatrix2,
    'colorMatrix2',
    false,
    issues,
  )

  if (doc.forwardMatrix1 === undefined) {
    issues.push(
      issue(
        'missing-field',
        'forwardMatrix1',
        'forwardMatrix1 is required (use null when absent).',
      ),
    )
  }
  const forwardMatrix1 = validateMatrix(
    doc.forwardMatrix1,
    'forwardMatrix1',
    false,
    issues,
  )

  if (doc.forwardMatrix2 === undefined) {
    issues.push(
      issue(
        'missing-field',
        'forwardMatrix2',
        'forwardMatrix2 is required (use null when absent).',
      ),
    )
  }
  const forwardMatrix2 = validateMatrix(
    doc.forwardMatrix2,
    'forwardMatrix2',
    false,
    issues,
  )

  if (doc.toneCurve === undefined) {
    issues.push(
      issue(
        'missing-field',
        'toneCurve',
        'toneCurve is required (use null when absent).',
      ),
    )
  }
  const toneCurve = validateToneCurve(doc.toneCurve, 'toneCurve', issues)

  // hueSatMap / lookTable are reserved: required to be present, may be null.
  if (doc.hueSatMap === undefined) {
    issues.push(
      issue(
        'missing-field',
        'hueSatMap',
        'hueSatMap is required (use null when absent).',
      ),
    )
  } else if (doc.hueSatMap !== null && !isRecord(doc.hueSatMap)) {
    issues.push(
      issue(
        'invalid-field',
        'hueSatMap',
        'hueSatMap must be an object or null.',
      ),
    )
  }
  if (doc.lookTable === undefined) {
    issues.push(
      issue(
        'missing-field',
        'lookTable',
        'lookTable is required (use null when absent).',
      ),
    )
  } else if (doc.lookTable !== null && !isRecord(doc.lookTable)) {
    issues.push(
      issue(
        'invalid-field',
        'lookTable',
        'lookTable must be an object or null.',
      ),
    )
  }

  if (
    issues.length > 0 ||
    !illuminant1 ||
    illuminant2 === undefined ||
    !colorMatrix1 ||
    colorMatrix2 === undefined ||
    forwardMatrix1 === undefined ||
    forwardMatrix2 === undefined ||
    toneCurve === undefined ||
    uniqueCameraModelRestriction === undefined ||
    profileCalibrationSignature === undefined ||
    profileEmbedPolicy === undefined ||
    typeof doc.profileName !== 'string' ||
    doc.profileName.length === 0
  ) {
    return {
      ok: false,
      issues:
        issues.length > 0
          ? issues
          : [issue('invalid-shape', '$', 'Document failed validation.')],
    }
  }

  return {
    ok: true,
    value: {
      schemaVersion: 1,
      profileName: doc.profileName,
      uniqueCameraModelRestriction,
      profileCalibrationSignature,
      profileEmbedPolicy,
      illuminant1,
      illuminant2,
      colorMatrix1,
      colorMatrix2,
      forwardMatrix1,
      forwardMatrix2,
      toneCurve,
      hueSatMap: (doc.hueSatMap as Record<string, unknown> | null) ?? null,
      lookTable: (doc.lookTable as Record<string, unknown> | null) ?? null,
    },
  }
}
