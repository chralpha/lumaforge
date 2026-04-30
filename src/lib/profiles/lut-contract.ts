import type { SignalRange } from '~/lib/color/registry'
import { getColorGamut, getTransferFunction } from '~/lib/color/registry'
import type { LUTContractSelection } from '~/lib/lut/profile-resolution'

import type { OnlineProfileIssue, OnlineProfileResult } from './catalog'

type LUTContractRole = LUTContractSelection['role']

const SUPPORTED_INTENT_ROLES = new Set([
  'technical-output',
  'display-look',
  'scene-creative',
  'combined-look-output',
])

function issue(message: string): OnlineProfileIssue {
  return { code: 'unsupported-contract', message }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function readRecordField(
  value: Record<string, unknown>,
  key: string,
): Record<string, unknown> | undefined {
  const field = value[key]

  return isRecord(field) ? field : undefined
}

function readString(
  value: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const field = value?.[key]

  return typeof field === 'string' ? field : undefined
}

function isSignalRange(value: unknown): value is SignalRange {
  return value === 'full' || value === 'legal' || value === 'unknown'
}

function resolveRole(
  intent: unknown,
  output: Record<string, unknown> | undefined,
): OnlineProfileResult<LUTContractRole> {
  if (
    intent === 'monitoring' ||
    intent === 'calibration' ||
    intent === 'unknown' ||
    typeof intent !== 'string'
  ) {
    return { ok: false, issues: [issue('LUT intent is unsupported.')] }
  }

  if (intent === 'look') {
    return {
      ok: true,
      value:
        readString(output, 'gamut') && readString(output, 'transfer')
          ? 'combined-look-output'
          : 'scene-creative',
    }
  }

  if (SUPPORTED_INTENT_ROLES.has(intent)) {
    return { ok: true, value: intent as LUTContractRole }
  }

  return { ok: false, issues: [issue('LUT intent is unsupported.')] }
}

function resolveGamut(
  value: string | undefined,
  label: string,
): OnlineProfileResult<NonNullable<LUTContractSelection['inputGamut']>> {
  const gamut = value ? getColorGamut(value) : undefined

  if (!gamut) {
    return {
      ok: false,
      issues: [issue(`${label} gamut is missing or unsupported.`)],
    }
  }

  return { ok: true, value: gamut.id }
}

function resolveTransfer(
  value: string | undefined,
  label: string,
): OnlineProfileResult<NonNullable<LUTContractSelection['inputTransfer']>> {
  const transfer = value ? getTransferFunction(value) : undefined

  if (!transfer) {
    return {
      ok: false,
      issues: [issue(`${label} transfer is missing or unsupported.`)],
    }
  }

  return { ok: true, value: transfer.id }
}

function resolveRange(
  value: unknown,
  label: string,
): OnlineProfileResult<SignalRange> {
  if (value === undefined || value === null) {
    return { ok: true, value: 'full' }
  }

  if (isSignalRange(value)) {
    return { ok: true, value }
  }

  return {
    ok: false,
    issues: [issue(`${label} range is unsupported.`)],
  }
}

export function mapProfileLUTContract(
  lut: unknown,
): OnlineProfileResult<LUTContractSelection> {
  if (!isRecord(lut)) {
    return { ok: false, issues: [issue('LUT contract is missing.')] }
  }

  const input = readRecordField(lut, 'input')
  const output = readRecordField(lut, 'output')
  const issues: OnlineProfileIssue[] = []
  const role = resolveRole(lut.intent, output)

  if (!role.ok) issues.push(...role.issues)

  const inputGamut = resolveGamut(readString(input, 'gamut'), 'Input')
  if (!inputGamut.ok) issues.push(...inputGamut.issues)

  const inputTransfer = resolveTransfer(readString(input, 'transfer'), 'Input')
  if (!inputTransfer.ok) issues.push(...inputTransfer.issues)

  const inputRange = resolveRange(input?.range, 'Input')
  if (!inputRange.ok) issues.push(...inputRange.issues)

  const outputGamut = resolveGamut(readString(output, 'gamut'), 'Output')
  const outputTransfer = resolveTransfer(
    readString(output, 'transfer'),
    'Output',
  )
  const outputRange = resolveRange(output?.range, 'Output')
  const resolvedRole = role.ok ? role.value : undefined
  const requiresOutput = resolvedRole !== 'display-look'
  const hasOutput =
    readString(output, 'gamut') ||
    readString(output, 'transfer') ||
    output?.range !== undefined

  if (requiresOutput || hasOutput) {
    if (!outputGamut.ok) issues.push(...outputGamut.issues)
    if (!outputTransfer.ok) issues.push(...outputTransfer.issues)
    if (!outputRange.ok) issues.push(...outputRange.issues)
  }

  if (issues.length > 0) {
    return { ok: false, issues }
  }

  if (!role.ok || !inputGamut.ok || !inputTransfer.ok || !inputRange.ok) {
    return {
      ok: false,
      issues: [issue('LUT contract is incomplete.')],
    }
  }

  return {
    ok: true,
    value: {
      role: role.value,
      inputGamut: inputGamut.value,
      inputTransfer: inputTransfer.value,
      inputRange: inputRange.value,
      outputGamut: outputGamut.ok ? outputGamut.value : undefined,
      outputTransfer: outputTransfer.ok ? outputTransfer.value : undefined,
      outputRange: outputRange.ok ? outputRange.value : undefined,
    },
  }
}
