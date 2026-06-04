import type { DecodeProgress } from '~/lib/raw/decoder'

import type { ProcessingStatus } from '../../model/workflow'

export function toUserFacingErrorCode(code: unknown) {
  if (typeof code === 'string' && code.startsWith('LUT_')) return code
  if (typeof code === 'string' && code.startsWith('EXPORT_')) return code
  if (typeof code === 'string' && code.startsWith('FULL_RES_EXPORT_')) {
    return code
  }
  if (typeof code === 'string' && code.startsWith('RAW_')) return code
  return 'RAW_UNKNOWN'
}

export function getStableErrorCode(error: unknown) {
  if (typeof error !== 'object' || !error || !('code' in error)) {
    return undefined
  }

  return (error as { code?: unknown }).code
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

export function mapRawDecodePhaseToProcessingStatus(
  phase: DecodeProgress['phase'],
): ProcessingStatus {
  if (phase === 'loading') return 'loading'
  if (phase === 'decoding') return 'decoding'
  if (phase === 'processing') return 'processing'
  return 'ready'
}

export function getProgressRecoveryHint(status: ProcessingStatus) {
  if (status === 'loading' || status === 'decoding') {
    return 'If HQ preview cannot finish, the first visible preview stays available while full-resolution export depends on processed-window support instead.'
  }

  if (status === 'processing') {
    return 'If the current render step fails, keep the session and retry the look without reloading the browser.'
  }

  if (status === 'exporting') {
    return 'Full-resolution export runs in strips. Keep this tab open until the JPEG finishes, then retry from the current session if needed.'
  }

  return undefined
}

export function isRetryableFullResExportFailure(code: string) {
  return (
    code === 'FULL_RES_EXPORT_RESOURCE_FAILURE' ||
    code === 'FULL_RES_EXPORT_WORKER_FAILED'
  )
}
