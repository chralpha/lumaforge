import { describe, expect, it } from 'vitest'

import {
  getProgressRecoveryHint,
  getStableErrorCode,
  isAbortError,
  isRetryableFullResExportFailure,
  mapRawDecodePhaseToProcessingStatus,
  toUserFacingErrorCode,
} from './workflow-status'

describe('workflow status helpers', () => {
  it('preserves known user-facing error code prefixes and normalizes unknown values', () => {
    expect(toUserFacingErrorCode('LUT_PARSE_FAILED')).toBe('LUT_PARSE_FAILED')
    expect(toUserFacingErrorCode('EXPORT_RENDER_FAILED')).toBe(
      'EXPORT_RENDER_FAILED',
    )
    expect(toUserFacingErrorCode('FULL_RES_EXPORT_WORKER_FAILED')).toBe(
      'FULL_RES_EXPORT_WORKER_FAILED',
    )
    expect(toUserFacingErrorCode('RAW_DECODE_FAILED')).toBe('RAW_DECODE_FAILED')
    expect(toUserFacingErrorCode('NETWORK_FAILED')).toBe('RAW_UNKNOWN')
    expect(toUserFacingErrorCode(undefined)).toBe('RAW_UNKNOWN')
  })

  it('extracts a stable code property without coercion', () => {
    expect(getStableErrorCode({ code: 'LUT_INVALID' })).toBe('LUT_INVALID')
    expect(getStableErrorCode({ code: 42 })).toBe(42)
    expect(getStableErrorCode(new Error('failed'))).toBeUndefined()
    expect(getStableErrorCode('RAW_DECODE_FAILED')).toBeUndefined()
    expect(getStableErrorCode(null)).toBeUndefined()
  })

  it('recognizes only DOM abort exceptions as abort errors', () => {
    expect(
      isAbortError(
        new DOMException('The operation was aborted.', 'AbortError'),
      ),
    ).toBe(true)

    const error = new Error('The operation was aborted.')
    error.name = 'AbortError'

    expect(isAbortError(error)).toBe(false)
  })

  it('returns the exact progress recovery hints for active processing phases', () => {
    expect(getProgressRecoveryHint('loading')).toBe(
      'If HQ preview cannot finish, the first visible preview stays available while full-resolution export depends on processed-window support instead.',
    )
    expect(getProgressRecoveryHint('decoding')).toBe(
      'If HQ preview cannot finish, the first visible preview stays available while full-resolution export depends on processed-window support instead.',
    )
    expect(getProgressRecoveryHint('processing')).toBe(
      'If the current render step fails, keep the session and retry the look without reloading the browser.',
    )
    expect(getProgressRecoveryHint('exporting')).toBe(
      'Full-resolution export runs in strips. Keep this tab open until the JPEG finishes, then retry from the current session if needed.',
    )
    expect(getProgressRecoveryHint('ready')).toBeUndefined()
    expect(getProgressRecoveryHint('error')).toBeUndefined()
  })

  it('maps RAW decode phases to user-visible workflow status', () => {
    expect(mapRawDecodePhaseToProcessingStatus('loading')).toBe('loading')
    expect(mapRawDecodePhaseToProcessingStatus('decoding')).toBe('decoding')
    expect(mapRawDecodePhaseToProcessingStatus('processing')).toBe('processing')
    expect(mapRawDecodePhaseToProcessingStatus('complete')).toBe('ready')
  })

  it('keeps retryable full-resolution export failure codes narrowly scoped', () => {
    expect(
      isRetryableFullResExportFailure('FULL_RES_EXPORT_RESOURCE_FAILURE'),
    ).toBe(true)
    expect(
      isRetryableFullResExportFailure('FULL_RES_EXPORT_WORKER_FAILED'),
    ).toBe(true)
    expect(isRetryableFullResExportFailure('EXPORT_RENDER_FAILED')).toBe(false)
    expect(isRetryableFullResExportFailure('RAW_UNKNOWN')).toBe(false)
  })
})
