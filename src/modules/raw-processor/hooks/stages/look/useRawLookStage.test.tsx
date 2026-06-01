import type { ProcessingParams } from '@lumaforge/luma-color-runtime'
import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { ImageSession } from '../../../model/session'
import { useRawLookStage } from './useRawLookStage'

const baseParams: ProcessingParams = {
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

function createSession(): ImageSession {
  return {
    id: 'look-stage-session',
    createdAt: 1,
    sourceFile: {
      name: 'frame.ARW',
      extension: 'arw',
      sizeBytes: 12,
      supportLevel: 'experimental',
    },
    previewBundle: {
      embeddedPreview: { status: 'idle' },
      quickDecodePreview: { status: 'ready', width: 800, height: 600 },
      boundedHqPreview: { status: 'ready', width: 800, height: 600 },
      displaySource: 'bounded-hq',
      boundedHqRequiredForExport: false,
    },
    activeStyle: {
      kind: 'custom',
      name: 'Client Look',
      defaultIntensityLevel: 'standard',
      currentIntensityLevel: 'strong',
    },
    viewState: {
      mode: 'processed',
      compareSplit: 0.5,
      zoom: 1,
      panX: 0,
      panY: 0,
      fitMode: 'screen',
    },
    renderState: { status: 'ready' },
    exportState: {
      status: 'idle',
      qualityPreset: 'high',
      fidelityLevel: 'balanced',
      fullResCapability: {
        status: 'supported',
        width: 4000,
        height: 3000,
      },
      recovery: { status: 'none' },
      checkpointDurable: false,
      retryRecommended: false,
    },
  }
}

describe('useRawLookStage', () => {
  it('projects session style intensity into processing params', () => {
    const session = createSession()
    const { result } = renderHook(() =>
      useRawLookStage({
        baseParams,
        session,
        sessionRef: { current: session },
        setSession: vi.fn(),
        lut: null,
        setLut: vi.fn(),
        setParams: vi.fn(),
        getProcessingParams: () => baseParams,
        lutDataRef: { current: null },
        setLutDataRef: vi.fn(),
        scheduleToast: vi.fn(),
        invalidateExportGraph: vi.fn(),
      }),
    )

    expect(result.current.params.intensity).toBe(1)
    expect(result.current.activeIntensity).toBe('strong')
    expect(result.current.currentLutName).toBe('Client Look')
  })
})
