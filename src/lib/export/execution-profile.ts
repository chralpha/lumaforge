import type { ExportFidelity } from '~/lib/gl/export'

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
const iosSafeBlobHandoffMaxMegapixels = 50

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
  productCopy:
    | 'high-performance'
    | 'safe-export'
    | 'resource-retry'
    | 'interrupted-retry'
    | 'interrupted-source-needed'
    | 'non-durable-checkpoint'
    | 'cannot-safely-complete'
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
    releasePreviewPipelineBeforeExport: false,
    releaseBoundedHqBufferBeforeExport: false,
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

function chooseProfile(input: {
  fidelity: ExportFidelity
  previousInterrupted?: boolean
  previousResourceFailure?: boolean
  runtime: { lowMemoryAvailable: boolean; pthreadAvailable: boolean }
  platform: { userAgent?: string; touch?: boolean }
}): ExportExecutionProfileName {
  if (input.previousInterrupted) return 'ios-safe'
  if (isKnownRiskWebKitMobile(input.platform)) return 'ios-safe'
  if (isKnownRiskWebKitDesktop(input.platform)) return 'ios-safe'
  if (!input.runtime.pthreadAvailable) return 'mobile-balanced'
  if (input.previousResourceFailure) {
    return input.fidelity === 'max' ? 'mobile-balanced' : 'ios-safe'
  }
  if (input.fidelity === 'max') return 'desktop-fast'
  if (input.fidelity === 'balanced') {
    return input.platform.touch ? 'mobile-balanced' : 'desktop-fast'
  }
  return input.platform.touch ? 'ios-safe' : 'mobile-balanced'
}

function chooseOutputSink(input: {
  profile: ExportExecutionProfileName
  output: { opfsAvailable: boolean; streamingAvailable: boolean }
}): ExportOutputSink {
  if (input.profile === 'ios-safe' && input.output.opfsAvailable) {
    return 'opfs-file'
  }
  if (input.output.streamingAvailable) return 'streaming'
  return 'blob-handoff'
}

function getDefaultConcurrencyForFidelity(fidelity: ExportFidelity) {
  return fidelity === 'safe' ? 1 : fidelity === 'balanced' ? 2 : 3
}

export function selectExportExecutionPlan(input: {
  fidelity: ExportFidelity
  sourceWidth?: number
  sourceHeight?: number
  previousInterrupted?: boolean
  previousResourceFailure?: boolean
  runtime: { lowMemoryAvailable: boolean; pthreadAvailable: boolean }
  output: { opfsAvailable: boolean; streamingAvailable: boolean }
  platform: {
    userAgent?: string
    touch?: boolean
    hardwareConcurrency?: number
  }
}): ExportExecutionPlan {
  const profileName = chooseProfile(input)
  const profile = EXPORT_EXECUTION_PROFILES[profileName]
  const megapixels = getImageMegapixels(input.sourceWidth, input.sourceHeight)
  const preferredRows =
    megapixels >= 100
      ? profile.preferredRowsFor100Mp
      : profile.preferredRowsBelow100Mp
  const outputSink = chooseOutputSink({
    profile: profileName,
    output: input.output,
  })
  const cannotSafelyComplete =
    profileName === 'ios-safe' &&
    megapixels > iosSafeBlobHandoffMaxMegapixels &&
    outputSink === 'blob-handoff'
  const runtimeMemoryProfile: ExportRuntimeMemoryProfile =
    profileName === 'desktop-fast' && input.runtime.pthreadAvailable
      ? 'desktop'
      : 'low-memory'

  return {
    profile,
    preferredRows,
    concurrency: Math.min(
      profile.maxConcurrency,
      getDefaultConcurrencyForFidelity(input.fidelity),
    ),
    maxConcurrency: profile.maxConcurrency,
    runtimeMemoryProfile,
    outputSink,
    checkpointMode: profile.checkpointMode,
    productCopy: cannotSafelyComplete
      ? 'cannot-safely-complete'
      : profileName === 'desktop-fast'
        ? 'high-performance'
        : 'safe-export',
  }
}

export function getExportModeCopy(key: ExportExecutionPlan['productCopy']) {
  const copy: Record<ExportExecutionPlan['productCopy'], string> = {
    'high-performance': 'Using high-performance full-resolution export.',
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
