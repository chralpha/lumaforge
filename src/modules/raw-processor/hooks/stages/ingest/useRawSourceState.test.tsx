import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { ImageSession } from '../../../model/session'
import { useRawSourceState } from './useRawSourceState'

function createSession(overrides: Partial<ImageSession> = {}): ImageSession {
  const sourceFile = new File(['raw'], 'fallback-name.dng')

  return {
    id: 'session-source',
    createdAt: 1,
    sourceFile: {
      file: sourceFile,
      name: 'frame.dng',
      extension: 'dng',
      sizeBytes: sourceFile.size,
      supportLevel: 'official',
    },
    previewBundle: {
      embeddedPreview: { status: 'ready', objectUrl: 'blob:embedded' },
      quickDecodePreview: { status: 'idle' },
      boundedHqPreview: { status: 'idle' },
      displaySource: 'embedded',
      boundedHqRequiredForExport: false,
    },
    activeStyle: null,
    viewState: {
      mode: 'processed',
      compareSplit: 0.5,
      zoom: 1,
      panX: 0,
      panY: 0,
      fitMode: 'screen',
    },
    renderState: { status: 'idle' },
    exportState: {
      status: 'idle',
      qualityPreset: 'high',
      fidelityLevel: 'balanced',
      fullResCapability: { status: 'unknown' },
      recovery: { status: 'none' },
      checkpointDurable: false,
      retryRecommended: false,
    },
    ...overrides,
  }
}

describe('useRawSourceState', () => {
  it('derives source facts from the current image session', () => {
    const session = createSession()

    const { result } = renderHook(() =>
      useRawSourceState({ session, status: 'ready' }),
    )

    expect(result.current.hasImage).toBe(true)
    expect(result.current.loadedImage.file).toBe(session.sourceFile.file)
    expect(result.current.loadedImage.metadata).toBeNull()
    expect(result.current.sourceFileName).toBe('frame.dng')
    expect(result.current.supportLevel).toBe('official')
    expect(result.current.embeddedPreviewUrl).toBe('blob:embedded')
    expect(result.current.displaySource).toBe('embedded')
    expect(result.current.progressRecoveryHint).toBeUndefined()
  })

  it('falls back to file name and empty source defaults without a displayable session', () => {
    const sourceFile = new File(['raw'], 'file-fallback.dng')
    const session = createSession({
      sourceFile: {
        file: sourceFile,
        name: '',
        extension: 'dng',
        sizeBytes: sourceFile.size,
        supportLevel: 'experimental',
      },
      previewBundle: {
        embeddedPreview: { status: 'idle' },
        quickDecodePreview: { status: 'idle' },
        boundedHqPreview: { status: 'idle' },
        displaySource: 'none',
        boundedHqRequiredForExport: false,
      },
    })

    const { result } = renderHook(() =>
      useRawSourceState({ session, status: 'loading' }),
    )

    expect(result.current.hasImage).toBe(false)
    expect(result.current.sourceFileName).toBe('file-fallback.dng')
    expect(result.current.supportLevel).toBe('experimental')
    expect(result.current.embeddedPreviewUrl).toBeNull()
    expect(result.current.displaySource).toBe('none')
    expect(result.current.progressRecoveryHint).toBeDefined()
  })

  it('uses neutral source defaults before a session exists', () => {
    const { result } = renderHook(() =>
      useRawSourceState({ session: null, status: 'idle' }),
    )

    expect(result.current.loadedImage).toEqual({ file: null, metadata: null })
    expect(result.current.hasImage).toBe(false)
    expect(result.current.sourceFileName).toBe('RAW photo')
    expect(result.current.supportLevel).toBe('experimental')
    expect(result.current.embeddedPreviewUrl).toBeNull()
    expect(result.current.displaySource).toBe('none')
  })
})
