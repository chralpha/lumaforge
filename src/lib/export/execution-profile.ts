import '~/lib/i18n'

import i18n from 'i18next'

import type { ExportFidelity } from '~/lib/gl/export'
import type { CapabilityVector } from '~/lib/runtime/capability-vector'
import { getCapabilityVectorSnapshot } from '~/lib/runtime/capability-vector'
import type {
  ExportOrchestrationCopy,
  ExportPolicy,
  PerformancePreference,
} from '~/lib/runtime/export-policy'
import { deriveExportPolicy } from '~/lib/runtime/export-policy'
import type { ExportRuntimeResources } from '~/lib/runtime/export-runtime-resources'
import { deriveInteractivePolicy } from '~/lib/runtime/interactive-policy'

import type {
  LargeResourceOwner,
  ResourceRegistryCheck,
} from './resource-registry'

export type ExportExecutionProfileName =
  | 'ios-safe'
  | 'mobile-balanced'
  | 'desktop-fast'

export type ExportCheckpointMode = 'safe-retry' | 'row-resume'
export type ExportOutputSink = 'opfs-file' | 'streaming' | 'blob-handoff'
export type ExportRuntimeMemoryProfile = 'low-memory' | 'desktop'

export type ExportPlanSelectedDebugPayload = {
  profile: ExportExecutionProfileName
  derivedLabel: string
  policyVector: ExportPolicy
  preferredRows: number
  concurrency: number
  runtimeMemoryProfile: ExportRuntimeMemoryProfile
  outputSink: ExportOutputSink
  checkpointMode: ExportCheckpointMode
  checkpointDurableExpected: boolean
}

export type ExportResourceEvacuatedDebugPayload = {
  profile: ExportExecutionProfileName
  requiredOwners: LargeResourceOwner[]
  disposedOwners: LargeResourceOwner[]
  registryCheck: ResourceRegistryCheck
  remainingLive: Array<{
    id: string
    owner: LargeResourceOwner
    kind: string
    estimatedBytes?: number
  }>
  estimatedBytesByOwner: Partial<Record<LargeResourceOwner, number>>
  totalEstimatedBytes: number
  evacuatedAt: string
}

export type ExportCheckpointWrittenDebugPayload = {
  exportId: string
  completedRowsForDiagnostics: number
  totalRows: number
  updatedAt: string
}

export type ExportWorkerAttemptDebugPayload = {
  attempt: number
  profile?: ExportExecutionProfileName
  preferredRows?: number
  concurrency?: number
  phase: 'started' | 'retry-scheduled' | 'disposed'
  retryReason?: string
  previousRows?: number
  nextRows?: number
  previousConcurrency?: number
  nextConcurrency?: number
  freshWorker: boolean
  priorClientDisposed?: boolean
}

export type ExportProgressDebugPayload = {
  completedStrips: number
  totalStrips: number
  progress: number
  recordedAt: string
}

export type ExportOutputMaterializedDebugPayload = {
  action: 'download' | 'share' | 'copy'
  outputKind: ExportOutputSink | 'blob' | 'file-backed'
  filename: string
  byteLength: number
  materializedAt: string
  cleanup: 'scheduled' | 'not-needed' | 'completed'
}

export type ExportDebugEvent =
  | {
      type: 'export-plan-selected'
      payload: ExportPlanSelectedDebugPayload
    }
  | {
      type: 'resource-evacuated'
      payload: ExportResourceEvacuatedDebugPayload
    }
  | {
      type: 'checkpoint-written'
      payload: ExportCheckpointWrittenDebugPayload
    }
  | {
      type: 'export-worker-attempt'
      payload: ExportWorkerAttemptDebugPayload
    }
  | {
      type: 'export-progress'
      payload: ExportProgressDebugPayload
    }
  | {
      type: 'output-materialized'
      payload: ExportOutputMaterializedDebugPayload
    }

type RecordedExportDebugEvent = {
  recordedAt: string
  event: ExportDebugEvent
}

type ExportDebugWindow = Window & {
  __LUMAFORGE_EXPORT_DEBUG_HISTORY__?: RecordedExportDebugEvent[]
}

const exportDebugEventStorageKey = 'lumaforge.exportDebugEvents.v1'
const exportDebugEventHistoryLimit = 256
const exportDebugCheckpointPersistRows = 1024

export type ExportExecutionProfile = {
  name: ExportExecutionProfileName
  minRows: number
  maxRows: number
  preferredRowsFor100Mp: number
  preferredRowsBelow100Mp: number
  rowBandRows: number
  initialConcurrency: number
  maxConcurrency: number
  boundedHqMaxPixels: number
  releasePreviewPipelineBeforeExport: boolean
  releaseBoundedHqBufferBeforeExport: boolean
  releasePreviousExportResultBeforeExport: boolean
  restartWorkerOnResourceRetry: boolean
  checkpointOutput: boolean
  checkpointMode: ExportCheckpointMode
}

export type ExportExecutionPlan = {
  profile: ExportExecutionProfile
  preferredRows: number
  concurrency: number
  maxConcurrency: number
  runtimeMemoryProfile: ExportRuntimeMemoryProfile
  outputSink: ExportOutputSink
  checkpointMode: ExportCheckpointMode
  productCopy: ExportOrchestrationCopy
  derivedLabel: string
  policyVector: ExportPolicy
}

export const EXPORT_EXECUTION_PROFILES: Record<
  ExportExecutionProfileName,
  ExportExecutionProfile
> = {
  'ios-safe': {
    name: 'ios-safe',
    minRows: 64,
    maxRows: 256,
    preferredRowsFor100Mp: 64,
    preferredRowsBelow100Mp: 128,
    rowBandRows: 64,
    initialConcurrency: 1,
    maxConcurrency: 1,
    boundedHqMaxPixels: 8_000_000,
    releasePreviewPipelineBeforeExport: true,
    releaseBoundedHqBufferBeforeExport: true,
    releasePreviousExportResultBeforeExport: true,
    restartWorkerOnResourceRetry: true,
    checkpointOutput: true,
    checkpointMode: 'safe-retry',
  },
  'mobile-balanced': {
    name: 'mobile-balanced',
    minRows: 64,
    maxRows: 512,
    preferredRowsFor100Mp: 128,
    preferredRowsBelow100Mp: 256,
    rowBandRows: 64,
    initialConcurrency: 1,
    maxConcurrency: 2,
    boundedHqMaxPixels: 8_000_000,
    releasePreviewPipelineBeforeExport: true,
    releaseBoundedHqBufferBeforeExport: true,
    releasePreviousExportResultBeforeExport: true,
    restartWorkerOnResourceRetry: true,
    checkpointOutput: true,
    checkpointMode: 'safe-retry',
  },
  'desktop-fast': {
    name: 'desktop-fast',
    minRows: 256,
    maxRows: 2048,
    preferredRowsFor100Mp: 512,
    preferredRowsBelow100Mp: 1024,
    rowBandRows: 64,
    initialConcurrency: 2,
    maxConcurrency: 3,
    boundedHqMaxPixels: 12_000_000,
    releasePreviewPipelineBeforeExport: true,
    releaseBoundedHqBufferBeforeExport: true,
    releasePreviousExportResultBeforeExport: true,
    restartWorkerOnResourceRetry: false,
    checkpointOutput: false,
    checkpointMode: 'safe-retry',
  },
}

function getExportDebugWindow() {
  return window as unknown as ExportDebugWindow
}

function readStoredExportDebugEvents() {
  const debugWindow = getExportDebugWindow()
  if (Array.isArray(debugWindow.__LUMAFORGE_EXPORT_DEBUG_HISTORY__)) {
    return debugWindow.__LUMAFORGE_EXPORT_DEBUG_HISTORY__
  }

  try {
    const raw = window.localStorage.getItem(exportDebugEventStorageKey)
    if (!raw) {
      debugWindow.__LUMAFORGE_EXPORT_DEBUG_HISTORY__ = []
      return []
    }
    const parsed = JSON.parse(raw)
    const history = Array.isArray(parsed)
      ? (parsed as RecordedExportDebugEvent[])
      : []
    debugWindow.__LUMAFORGE_EXPORT_DEBUG_HISTORY__ = history
    return history
  } catch {
    debugWindow.__LUMAFORGE_EXPORT_DEBUG_HISTORY__ = []
    return []
  }
}

function persistExportDebugEvent(event: ExportDebugEvent) {
  try {
    const debugWindow = getExportDebugWindow()
    const history = readStoredExportDebugEvents()
    const next = [
      ...history,
      {
        recordedAt: new Date().toISOString(),
        event,
      },
    ].slice(-exportDebugEventHistoryLimit)
    debugWindow.__LUMAFORGE_EXPORT_DEBUG_HISTORY__ = next
    if (!shouldPersistExportDebugEvent(event)) return

    window.localStorage.setItem(
      exportDebugEventStorageKey,
      JSON.stringify(next),
    )
  } catch {
    // Diagnostics must not affect export control flow.
  }
}

function shouldPersistExportDebugEvent(event: ExportDebugEvent) {
  if (event.type === 'export-progress') return false
  if (event.type !== 'checkpoint-written') return true

  const { completedRowsForDiagnostics, totalRows } = event.payload
  if (completedRowsForDiagnostics <= 0) return true
  if (completedRowsForDiagnostics >= totalRows) return true
  return completedRowsForDiagnostics % exportDebugCheckpointPersistRows === 0
}

export function emitExportDebugEvent(event: ExportDebugEvent) {
  if (typeof window === 'undefined') return

  persistExportDebugEvent(event)
  window.dispatchEvent(
    new CustomEvent('lumaforge-export-debug', { detail: event }),
  )
}

export function toExportPlanSelectedDebugPayload(
  plan: ExportExecutionPlan,
  checkpointDurableExpected: boolean,
): ExportPlanSelectedDebugPayload {
  return {
    profile: plan.profile.name,
    derivedLabel: plan.derivedLabel,
    policyVector: plan.policyVector,
    preferredRows: plan.preferredRows,
    concurrency: plan.concurrency,
    runtimeMemoryProfile: plan.runtimeMemoryProfile,
    outputSink: plan.outputSink,
    checkpointMode: plan.checkpointMode,
    checkpointDurableExpected,
  }
}

export function getImageMegapixels(width?: number, height?: number) {
  if (!width || !height) return 0
  return (width * height) / 1_000_000
}

export function isKnownRiskWebKitMobile(input: {
  userAgent?: string
  touch?: boolean
}) {
  const ua = input.userAgent ?? ''
  const isiOS = /\b(?:iPhone|iPad|iPod)\b/i.test(ua)
  const isIPadOsDesktopMode = /\bMacintosh\b/i.test(ua) && input.touch === true
  const webKit = /\bAppleWebKit\b/i.test(ua)
  const mobile = input.touch === true || /\bMobile\b/i.test(ua)
  return (isiOS || isIPadOsDesktopMode) && webKit && mobile
}

export function isKnownRiskWebKitDesktop(input: {
  userAgent?: string
  touch?: boolean
}) {
  const ua = input.userAgent ?? ''
  const desktopMac = /\bMacintosh\b/i.test(ua)
  const webKit = /\bAppleWebKit\b/i.test(ua)
  const safari = /\bSafari\b/i.test(ua)
  const chromiumFamily = /\b(?:Chrome|Chromium|CriOS|Edg|OPR|FxiOS)\b/i.test(ua)

  return (
    desktopMac && webKit && safari && !chromiumFamily && input.touch !== true
  )
}

function chooseProfile(
  derivedPolicy: ExportPolicy,
  capability: CapabilityVector,
): ExportExecutionProfileName {
  if (
    derivedPolicy.workerMemoryProfile === 'desktop' &&
    derivedPolicy.concurrency >= 2 &&
    derivedPolicy.rowSlice >= 512
  ) {
    return 'desktop-fast'
  }
  if (capability.webKitClass === 'webkit-mobile') return 'ios-safe'
  return 'mobile-balanced'
}

function classifyLegacyPlatform(input: {
  userAgent?: string
  touch?: boolean
}): CapabilityVector['webKitClass'] {
  if (isKnownRiskWebKitMobile(input)) return 'webkit-mobile'
  if (isKnownRiskWebKitDesktop(input)) return 'webkit-desktop-safari'
  if (
    /\b(?:Chrome|Chromium|CriOS|Edg|OPR|FxiOS)\b/i.test(input.userAgent ?? '')
  ) {
    return 'chromium'
  }
  return 'unknown'
}

type LegacyRuntimeInput = {
  lowMemoryAvailable: boolean
  pthreadAvailable: boolean
}

type LegacyOutputInput = {
  opfsAvailable: boolean
  streamingAvailable: boolean
}

type SelectExportExecutionPlanInput = {
  performancePreference?: PerformancePreference
  fidelity?: ExportFidelity
  sourceWidth?: number
  sourceHeight?: number
  previousInterrupted?: boolean
  previousCrashLikeInterruption?: boolean
  previousUserInterrupted?: boolean
  previousResourceFailure?: boolean
  capability?: CapabilityVector
  runtime: ExportRuntimeResources | LegacyRuntimeInput
  output?: LegacyOutputInput
  platform?: {
    userAgent?: string
    touch?: boolean
    hardwareConcurrency?: number
  }
}

function isExportRuntimeResources(
  runtime: ExportRuntimeResources | LegacyRuntimeInput,
): runtime is ExportRuntimeResources {
  return 'opfsSinkAvailable' in runtime
}

function resolveCapability(
  input: SelectExportExecutionPlanInput,
): CapabilityVector {
  if (input.capability) return input.capability

  const snapshot = getCapabilityVectorSnapshot()
  if (snapshot) return snapshot

  const runtime = input.runtime
  const legacyRuntime = isExportRuntimeResources(runtime) ? null : runtime
  const platform = input.platform ?? {}
  return Object.freeze({
    coi: legacyRuntime?.pthreadAvailable ?? false,
    pthread: legacyRuntime?.pthreadAvailable ?? false,
    deviceMemoryGB: null,
    hwConcurrency: Math.max(1, Math.floor(platform.hardwareConcurrency ?? 1)),
    webKitClass: classifyLegacyPlatform(platform),
    maybeOpfsSupported: input.output?.opfsAvailable ?? false,
  })
}

function resolveRuntimeResources(
  input: SelectExportExecutionPlanInput,
): ExportRuntimeResources {
  if (isExportRuntimeResources(input.runtime)) return input.runtime

  return Object.freeze({
    opfsSinkAvailable: input.output?.opfsAvailable ?? false,
    opfsAvailableMB: input.output?.opfsAvailable
      ? Number.POSITIVE_INFINITY
      : null,
    streamingSinkAvailable: input.output?.streamingAvailable ?? false,
  })
}

function synthesizeProfile(
  profileName: ExportExecutionProfileName,
  policy: ExportPolicy,
  capability: CapabilityVector,
): ExportExecutionProfile {
  const interactivePolicy = deriveInteractivePolicy(capability)

  return {
    name: profileName,
    minRows: 64,
    maxRows: Math.max(64, policy.rowSlice),
    preferredRowsFor100Mp: policy.rowSlice,
    preferredRowsBelow100Mp: policy.rowSlice,
    rowBandRows: 64,
    initialConcurrency: policy.concurrency,
    maxConcurrency: policy.maxConcurrency,
    boundedHqMaxPixels: interactivePolicy.boundedHqMaxPixels,
    releasePreviewPipelineBeforeExport: true,
    releaseBoundedHqBufferBeforeExport: true,
    releasePreviousExportResultBeforeExport: true,
    restartWorkerOnResourceRetry: true,
    checkpointOutput: true,
    checkpointMode: 'safe-retry',
  }
}

export function selectExportExecutionPlan(
  input: SelectExportExecutionPlanInput,
): ExportExecutionPlan {
  const performancePreference =
    input.performancePreference ?? input.fidelity ?? 'balanced'
  const capability = resolveCapability(input)
  const runtime = resolveRuntimeResources(input)
  const policy = deriveExportPolicy(
    capability,
    {
      width: input.sourceWidth ?? 0,
      height: input.sourceHeight ?? 0,
    },
    {
      performancePreference,
      previousResourceFailure: input.previousResourceFailure ?? false,
      previousCrashLikeInterruption:
        input.previousCrashLikeInterruption ??
        input.previousInterrupted ??
        false,
      previousUserInterrupted: input.previousUserInterrupted ?? false,
    },
    runtime,
  )
  const profileName = chooseProfile(policy, capability)
  const profile = synthesizeProfile(profileName, policy, capability)

  return {
    profile,
    preferredRows: policy.rowSlice,
    concurrency: policy.concurrency,
    maxConcurrency: policy.maxConcurrency,
    runtimeMemoryProfile: policy.workerMemoryProfile,
    outputSink: policy.outputSink,
    checkpointMode: profile.checkpointMode,
    productCopy: policy.productCopy,
    derivedLabel: policy.derivedLabel,
    policyVector: policy,
  }
}

export function getExportModeCopy(key: ExportExecutionPlan['productCopy']) {
  const copy: Record<ExportExecutionPlan['productCopy'], string> = {
    'high-performance': i18n.t('raw.export.highPerformance'),
    'safe-export':
      'This device is using low-memory export mode. Export may take longer.',
    'resource-retry':
      'Export hit a browser memory limit. Retrying with a safer setting.',
    'interrupted-retry':
      'The browser interrupted the previous export. LumaForge will retry with a safer low-memory setting.',
    'interrupted-source-needed':
      'The browser interrupted the previous export. Please reselect the same RAW file so LumaForge can retry with a safer setting.',
    'non-durable-checkpoint':
      'This browser cannot store export progress. Keep the tab open while the JPEG is being written.',
    'cannot-safely-complete':
      'This browser cannot safely complete this large local full-resolution export without durable file storage. Use a secure browser URL with OPFS enabled, try a desktop browser, or export a smaller version.',
  }

  return copy[key]
}
