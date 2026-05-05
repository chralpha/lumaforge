import type {
  ProcessingParams,
  RawRenderExposure,
} from '@lumaforge/luma-color-runtime'
import type { LumaRawExportCapability } from '@lumaforge/luma-raw-runtime'

import type { ExportCheckpointManifest } from '~/lib/export/checkpoint-store'
import type { FullResWorkerCheckpointMetric } from '~/lib/export/full-res-export-client'

import type { ImageSession } from '../model/session'

export function toFullResCapabilityState(capability: LumaRawExportCapability) {
  if (
    capability.supported &&
    capability.strategy === 'libraw-processed-window' &&
    capability.windows.librawProcessed
  ) {
    return {
      status: 'supported' as const,
      width: capability.width,
      height: capability.height,
    }
  }

  return {
    status: 'unsupported' as const,
    reason: capability.supported
      ? 'processed-window-unavailable'
      : capability.reasons.join(', ') ||
        'This RAW source does not support full-resolution export in the current browser build.',
  }
}

export function buildExportFailureDescription(
  message: string,
  retryLevel: 'safe' | 'balanced' | null,
) {
  if (!retryLevel) {
    return message
  }

  return `${message}. Retry with ${retryLevel} fidelity.`
}

export function createSafeRetryManifest(input: {
  exportId: string
  file: File
  sourceFingerprint: ExportCheckpointManifest['sourceFingerprint']
  outputWidth: number
  outputHeight: number
  graphFingerprint: string
  profile: ExportCheckpointManifest['profile']
  preferredRows: number
  outputSink: ExportCheckpointManifest['outputSink']
  completedRowsForDiagnostics?: number
  updatedAt?: string
}): ExportCheckpointManifest {
  return {
    version: 1,
    exportId: input.exportId,
    sourceFingerprint: input.sourceFingerprint,
    fileName: input.file.name,
    sourceSize: input.file.size,
    sourceLastModified: input.file.lastModified,
    outputWidth: input.outputWidth,
    outputHeight: input.outputHeight,
    graphFingerprint: input.graphFingerprint,
    profile: input.profile,
    attempt: 1,
    preferredRows: input.preferredRows,
    totalRows: input.outputHeight,
    recoveryMode: 'safe-retry',
    outputSink: input.outputSink,
    sourceReacquisition: 'user-reselect-required',
    completedRowsForDiagnostics: input.completedRowsForDiagnostics ?? 0,
    jpegState: 'restart-required',
    updatedAt: input.updatedAt ?? new Date().toISOString(),
  }
}

export function isCheckpointMetric(
  metric: unknown,
): metric is FullResWorkerCheckpointMetric {
  return (
    typeof metric === 'object' &&
    metric !== null &&
    'kind' in metric &&
    metric.kind === 'checkpoint'
  )
}

export function clearExportResultState<T extends ImageSession | null>(
  session: T,
): T {
  if (
    !session?.exportState.result &&
    session?.exportState.status !== 'ready' &&
    session?.exportState.status !== 'exporting'
  ) {
    return session
  }

  return {
    ...session,
    exportState: {
      ...session.exportState,
      status:
        session.exportState.status === 'ready' ||
        session.exportState.status === 'exporting'
          ? 'idle'
          : session.exportState.status,
      result: undefined,
      lastProgress:
        session.exportState.status === 'exporting'
          ? undefined
          : session.exportState.lastProgress,
    },
  }
}

export function clearExportResultForActiveExport(
  session: ImageSession,
): ImageSession {
  return {
    ...session,
    exportState: {
      ...session.exportState,
      result: undefined,
      lastProgress: undefined,
      retryRecommended: false,
      recommendedRetryLevel: undefined,
    },
  }
}

export function hasSameRawRenderExposure(
  current: RawRenderExposure | null | undefined,
  next: RawRenderExposure | null | undefined,
) {
  if (!current || !next) {
    return current === next
  }

  return (
    current.ev === next.ev &&
    current.multiplier === next.multiplier &&
    current.source === next.source
  )
}

export function changesRenderGraphParams(
  current: ProcessingParams,
  next: Partial<ProcessingParams>,
) {
  return (
    (Object.hasOwn(next, 'styleKind') &&
      next.styleKind !== current.styleKind) ||
    (Object.hasOwn(next, 'builtinPreset') &&
      next.builtinPreset !== current.builtinPreset) ||
    (Object.hasOwn(next, 'intensity') &&
      next.intensity !== current.intensity) ||
    (Object.hasOwn(next, 'userExposureEv') &&
      next.userExposureEv !== current.userExposureEv) ||
    (Object.hasOwn(next, 'userContrast') &&
      next.userContrast !== current.userContrast) ||
    (Object.hasOwn(next, 'userHighlights') &&
      next.userHighlights !== current.userHighlights) ||
    (Object.hasOwn(next, 'userShadows') &&
      next.userShadows !== current.userShadows) ||
    (Object.hasOwn(next, 'userWhites') &&
      next.userWhites !== current.userWhites) ||
    (Object.hasOwn(next, 'userBlacks') &&
      next.userBlacks !== current.userBlacks)
  )
}
