import type { ProcessingParams } from '@lumaforge/luma-color-runtime'
import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { DecodedImage } from '~/lib/raw/decoder'
import type { RawRuntimeSession } from '~/lib/raw/runtime-adapter'

import type { ImageSession } from '../../../model/session'
import { useRawIngestStage } from './useRawIngestStage'

const params: ProcessingParams = {
  intensity: 0.7,
  viewMode: 'processed',
  compareSplit: 0.5,
  styleKind: 'none',
  builtinPreset: null,
  userExposureEv: 0,
  userContrast: 0,
  userHighlights: 0,
  userShadows: 0,
  userWhites: 0,
  userBlacks: 0,
  userTemperature: 0,
  userTint: 0,
}

describe('useRawIngestStage', () => {
  it('composes load and reset actions for an empty workflow', () => {
    const { result } = renderHook(() =>
      useRawIngestStage({
        setStatus: vi.fn(),
        setError: vi.fn(),
        setProgress: vi.fn(),
        getProcessingParams: () => params,
        getLut: () => null,
        setParams: vi.fn(),
        setSession: vi.fn(),
        setDecodedImageVersion: vi.fn(),
        setStats: vi.fn(),
        setPendingRecoveryRetry: vi.fn(),
        scheduleToast: vi.fn(),
        replaceFile: vi.fn(),
        abortRuntimeWork: vi.fn(),
        abortExportWork: vi.fn(),
        queueExportResultResourceDisposal: vi.fn(),
        revokeCurrentEmbeddedPreviewUrl: vi.fn(),
        clearSessionEmbeddedPreviewUrl: vi.fn(),
        setDecodedImageRef: vi.fn(),
        invalidateExportGraph: vi.fn(),
        registerCurrentPreviewPipelineForEvacuation: vi.fn(),
        disposeRuntimeSession: vi.fn(),
        yieldToPaint: () => Promise.resolve(),
        getPrewarmState: vi.fn(),
        prewarm: vi.fn(),
        runtimeAbortControllerRef: { current: null },
        runtimeSessionRef: { current: null as RawRuntimeSession | null },
        disposedRuntimeSessionsRef: {
          current: new WeakSet<RawRuntimeSession>(),
        },
        decodedImageRef: { current: null as DecodedImage | null },
        sessionRef: { current: null as ImageSession | null },
        embeddedPreviewUrlRef: { current: null },
        isMountedRef: { current: false },
        runtimeWorkSessionIdRef: { current: null },
        pendingLoadSessionIdRef: { current: null },
        previewCopyCanvasRef: { current: null },
        resetSession: vi.fn(),
      }),
    )

    expect(typeof result.current.loadFile).toBe('function')
    expect(typeof result.current.reset).toBe('function')
  })
})
