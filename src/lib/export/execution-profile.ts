import type { ExportFidelity } from '~/lib/gl/export'

export type ExportExecutionProfileName =
  | 'ios-safe'
  | 'mobile-balanced'
  | 'desktop-fast'

export type ExportCheckpointMode = 'safe-retry' | 'row-resume'
export type ExportOutputSink = 'opfs-file' | 'streaming' | 'blob-handoff'
export type ExportRuntimeMemoryProfile = 'low-memory' | 'desktop'

export type ExportDebugEvent = {
  type: 'export-plan-selected' | 'resource-evacuated' | 'checkpoint-written'
  payload: unknown
}

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

export function emitExportDebugEvent(event: ExportDebugEvent) {
  if (typeof window === 'undefined') return

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
  const webKit = /\bAppleWebKit\b/i.test(ua)
  const mobile = input.touch === true || /\bMobile\b/i.test(ua)
  return isiOS && webKit && mobile
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
    productCopy:
      profileName === 'desktop-fast' ? 'high-performance' : 'safe-export',
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
      'This browser cannot safely complete a 100MP local full-resolution export. Try a desktop browser or export a smaller version.',
  }

  return copy[key]
}
