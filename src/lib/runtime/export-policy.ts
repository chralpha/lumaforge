import type { CapabilityVector } from './capability-vector'
import type { ExportRuntimeResources } from './export-runtime-resources'

export type PolicyProductCopy =
  | 'high-performance'
  | 'safe-export'
  | 'resource-retry'
  | 'interrupted-retry'
  | 'non-durable-checkpoint'
  | 'cannot-safely-complete'

export type ExportOrchestrationCopy =
  | PolicyProductCopy
  | 'interrupted-source-needed'

export type PerformancePreference = 'safe' | 'balanced' | 'max'

export interface ExportIntent {
  readonly performancePreference: PerformancePreference
  readonly previousResourceFailure: boolean
  readonly previousCrashLikeInterruption: boolean
  readonly previousUserInterrupted: boolean
}

export interface ExportPolicy {
  readonly rowSlice: number
  readonly concurrency: number
  readonly maxConcurrency: number
  readonly workerMemoryProfile: 'low-memory' | 'desktop'
  readonly persistEveryNRows: number
  readonly outputSink: 'opfs-file' | 'streaming' | 'blob-handoff'
  readonly productCopy: PolicyProductCopy
  readonly derivedLabel: string
}

export const LARGE_EXPORT_MEGAPIXEL_THRESHOLD = 50

const OPFS_SAFETY_MARGIN_MB = 64
const OPFS_MB_PER_MEGAPIXEL = 4

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function preferenceWeight(preference: PerformancePreference): number {
  return preference === 'safe' ? 1 : preference === 'balanced' ? 2 : 3
}

export function deriveExportPolicy(
  cap: CapabilityVector,
  image: { width: number; height: number },
  intent: ExportIntent,
  runtime: ExportRuntimeResources,
): ExportPolicy {
  const megapixels = (image.width * image.height) / 1_000_000

  let rowSlice = 512
  if (megapixels >= 100) rowSlice /= 2
  if (!cap.pthread) rowSlice = Math.min(rowSlice, 256)
  if (cap.webKitClass === 'webkit-mobile') rowSlice = Math.min(rowSlice, 128)
  if (cap.webKitClass === 'webkit-desktop-safari') {
    rowSlice = Math.min(rowSlice, 256)
  }
  if (cap.deviceMemoryGB != null && cap.deviceMemoryGB <= 4) {
    rowSlice = Math.min(rowSlice, 128)
  }
  if (intent.previousResourceFailure) rowSlice /= 2
  if (intent.previousCrashLikeInterruption) rowSlice /= 4
  rowSlice = clamp(Math.floor(rowSlice), 64, 2048)

  const threadBudget = Math.max(1, cap.hwConcurrency - 1)
  let maxConcurrency = cap.pthread ? Math.min(threadBudget, 3) : 1
  if (
    cap.webKitClass === 'webkit-mobile' ||
    cap.webKitClass === 'webkit-desktop-safari'
  ) {
    maxConcurrency = 1
  }
  if (intent.previousResourceFailure || intent.previousCrashLikeInterruption) {
    maxConcurrency = 1
  }
  maxConcurrency = Math.max(1, maxConcurrency)
  const concurrency = clamp(
    preferenceWeight(intent.performancePreference),
    1,
    maxConcurrency,
  )

  const workerMemoryProfile: ExportPolicy['workerMemoryProfile'] =
    cap.coi && cap.pthread && cap.webKitClass === 'chromium'
      ? 'desktop'
      : 'low-memory'

  const targetRows = rowSlice <= 128 ? 2048 : 4096
  const persistEveryNRows = clamp(
    Math.ceil(targetRows / rowSlice) * rowSlice,
    rowSlice,
    4096,
  )

  const opfsFits =
    runtime.opfsSinkAvailable &&
    runtime.opfsAvailableMB != null &&
    runtime.opfsAvailableMB >
      megapixels * OPFS_MB_PER_MEGAPIXEL + OPFS_SAFETY_MARGIN_MB
  const outputSink: ExportPolicy['outputSink'] = opfsFits
    ? 'opfs-file'
    : runtime.streamingSinkAvailable
      ? 'streaming'
      : 'blob-handoff'

  let productCopy: PolicyProductCopy
  if (
    megapixels > LARGE_EXPORT_MEGAPIXEL_THRESHOLD &&
    outputSink === 'blob-handoff' &&
    cap.webKitClass === 'webkit-mobile'
  ) {
    productCopy = 'cannot-safely-complete'
  } else if (intent.previousCrashLikeInterruption) {
    productCopy = 'interrupted-retry'
  } else if (intent.previousResourceFailure) {
    productCopy = 'resource-retry'
  } else if (
    outputSink === 'blob-handoff' &&
    megapixels > LARGE_EXPORT_MEGAPIXEL_THRESHOLD
  ) {
    productCopy = 'non-durable-checkpoint'
  } else if (
    workerMemoryProfile === 'desktop' &&
    concurrency >= 2 &&
    rowSlice >= 512
  ) {
    productCopy = 'high-performance'
  } else {
    productCopy = 'safe-export'
  }

  const derivedLabel = `${workerMemoryProfile}-thr${concurrency}-rs${rowSlice}-${outputSink}-wk${cap.webKitClass}`

  return Object.freeze({
    rowSlice,
    concurrency,
    maxConcurrency,
    workerMemoryProfile,
    persistEveryNRows,
    outputSink,
    productCopy,
    derivedLabel,
  })
}
