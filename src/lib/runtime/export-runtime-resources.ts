import { getCapabilityVectorSnapshot } from './capability-vector'

export interface ExportRuntimeResources {
  readonly opfsSinkAvailable: boolean
  readonly opfsAvailableMB: number | null
  readonly streamingSinkAvailable: boolean
}

export interface ExportRuntimeResourcesInput {
  streamingSinkAvailable: boolean
}

type StorageEstimate = {
  quota?: number
  usage?: number
}

type StorageManagerLike = {
  estimate?: () => Promise<StorageEstimate>
}

type NavigatorWithStorage = Navigator & {
  storage?: StorageManagerLike
}

export async function snapshotExportRuntimeResources(
  input: ExportRuntimeResourcesInput,
): Promise<ExportRuntimeResources> {
  const cap = getCapabilityVectorSnapshot()
  if (!cap?.maybeOpfsSupported) {
    return Object.freeze({
      opfsSinkAvailable: false,
      opfsAvailableMB: null,
      streamingSinkAvailable: input.streamingSinkAvailable,
    })
  }

  try {
    const nav = globalThis.navigator as NavigatorWithStorage | undefined
    const estimate = await nav?.storage?.estimate?.()
    const quota = estimate?.quota ?? 0
    const usage = estimate?.usage ?? 0
    const availableBytes = Math.max(0, quota - usage)
    const opfsAvailableMB =
      quota > 0 ? Math.floor(availableBytes / 1_000_000) : null

    return Object.freeze({
      opfsSinkAvailable: quota > 0,
      opfsAvailableMB,
      streamingSinkAvailable: input.streamingSinkAvailable,
    })
  } catch {
    return Object.freeze({
      opfsSinkAvailable: false,
      opfsAvailableMB: null,
      streamingSinkAvailable: input.streamingSinkAvailable,
    })
  }
}
