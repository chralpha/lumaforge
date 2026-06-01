import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { ExportCheckpointManifest } from '~/lib/export/checkpoint-store'

import type { ExportRecoveryState, ImageSession } from '../../../model/session'
import type { PendingRecoveryRetry } from './useExportRecoveryAction'
import { useExportRecoveryAction } from './useExportRecoveryAction'

function createFile(name = 'frame.dng') {
  return new File(['raw'], name, { lastModified: 123 })
}

function createManifest(file = createFile()): ExportCheckpointManifest {
  return {
    version: 1,
    exportId: 'export-1',
    sourceFingerprint: {
      name: file.name,
      size: file.size,
      lastModified: file.lastModified,
      hashPrefixHex: 'unused-for-name-mismatch',
    },
    fileName: file.name,
    sourceSize: file.size,
    sourceLastModified: file.lastModified,
    outputWidth: 800,
    outputHeight: 600,
    graphFingerprint: 'graph',
    profile: 'desktop-fast',
    derivedLabel: 'cinema',
    attempt: 1,
    preferredRows: 256,
    totalRows: 600,
    recoveryMode: 'safe-retry',
    outputSink: 'blob-handoff',
    sourceReacquisition: 'user-reselect-required',
    completedRowsForDiagnostics: 0,
    jpegState: 'restart-required',
    updatedAt: '2026-06-01T00:00:00.000Z',
  }
}

function createSession(file = createFile()): ImageSession {
  return {
    id: 'session-1',
    createdAt: 1,
    sourceFile: {
      file,
      name: file.name,
      extension: 'dng',
      sizeBytes: file.size,
      supportLevel: 'official',
    },
    previewBundle: {
      embeddedPreview: { status: 'idle' },
      quickDecodePreview: { status: 'idle' },
      boundedHqPreview: { status: 'idle' },
      displaySource: 'none',
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
      qualityPreset: 'standard',
      fidelityLevel: 'balanced',
      fullResCapability: { status: 'unknown' },
      recovery: { status: 'none' },
      checkpointDurable: false,
      retryRecommended: false,
    },
  }
}

describe('useExportRecoveryAction', () => {
  it('starts a safe retry once the matching recovery source is ready to export', async () => {
    const file = createFile()
    const manifest = createManifest(file)
    const pendingRecoveryRetry: PendingRecoveryRetry = {
      sourceExportId: manifest.exportId,
      manifest,
      sessionId: 'session-1',
      fileName: file.name,
      size: file.size,
      lastModified: file.lastModified,
    }
    const setPendingRecoveryRetry = vi.fn()
    const exportImage = vi.fn().mockResolvedValue(undefined)

    renderHook(() =>
      useExportRecoveryAction({
        pendingRecoveryRetry,
        setPendingRecoveryRetry,
        sessionRef: { current: createSession(file) },
        discoveredRecoveryRef: { current: { status: 'none' } },
        loadedFile: file,
        canExport: true,
        status: 'ready',
        loadFile: vi.fn(),
        exportImage,
        scheduleToast: (notify) => notify(),
        toast: { error: vi.fn() },
      }),
    )

    expect(setPendingRecoveryRetry).toHaveBeenCalledWith(null)
    expect(exportImage).toHaveBeenCalledWith({
      quality: 'high',
      fidelity: 'safe',
      previousInterrupted: true,
      recoveredExportId: manifest.exportId,
      recoveredManifest: manifest,
    })
  })

  it('rejects a reselected RAW file that does not match the interrupted export source', async () => {
    const expectedFile = createFile('expected.dng')
    const manifest = createManifest(expectedFile)
    const discoveredRecovery: ExportRecoveryState = {
      status: 'source-required',
      exportId: manifest.exportId,
      expectedFileName: expectedFile.name,
      manifest,
      message: 'Reselect the RAW file.',
    }
    const toastErrors: string[] = []
    const loadFile = vi.fn()

    const { result } = renderHook(() =>
      useExportRecoveryAction({
        pendingRecoveryRetry: null,
        setPendingRecoveryRetry: vi.fn(),
        sessionRef: { current: null },
        discoveredRecoveryRef: { current: discoveredRecovery },
        loadedFile: null,
        canExport: false,
        status: 'idle',
        loadFile,
        exportImage: vi.fn(),
        scheduleToast: (notify) => notify(),
        toast: {
          error: (message) => {
            toastErrors.push(message)
          },
        },
      }),
    )

    await act(async () => {
      await result.current.recoverInterruptedExport(createFile('wrong.dng'))
    })

    expect(loadFile).not.toHaveBeenCalled()
    expect(toastErrors).toEqual(['RAW file does not match'])
  })
})
