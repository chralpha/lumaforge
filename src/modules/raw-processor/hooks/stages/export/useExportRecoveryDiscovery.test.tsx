import { renderHook, waitFor } from '@testing-library/react'
import type { Dispatch, SetStateAction } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { ExportCheckpointManifest } from '~/lib/export/checkpoint-store'

import type { ExportRecoveryState, ImageSession } from '../../../model/session'
import { useExportRecoveryDiscovery } from './useExportRecoveryDiscovery'

function createManifest(): ExportCheckpointManifest {
  return {
    version: 1,
    exportId: 'export-1',
    sourceFingerprint: {
      name: 'frame.dng',
      size: 3,
      lastModified: 123,
      hashPrefixHex: 'hash',
    },
    fileName: 'frame.dng',
    sourceSize: 3,
    sourceLastModified: 123,
    outputWidth: 800,
    outputHeight: 600,
    graphFingerprint: 'graph',
    profile: 'desktop-fast',
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

function createSession(): ImageSession {
  return {
    id: 'session-1',
    createdAt: 1,
    sourceFile: {
      name: 'frame.dng',
      extension: 'dng',
      sizeBytes: 3,
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

describe('useExportRecoveryDiscovery', () => {
  it('discovers a safe-retry checkpoint and stores source-required recovery on the active session', async () => {
    const manifest = createManifest()
    let session: ImageSession | null = createSession()
    let discovered: ExportRecoveryState = { status: 'none' }
    const setSession: Dispatch<SetStateAction<ImageSession | null>> = vi.fn(
      (updater) => {
        session = typeof updater === 'function' ? updater(session) : updater
      },
    )
    const setDiscoveredRecoveryState = vi.fn((next: ExportRecoveryState) => {
      discovered = next
    })

    renderHook(() =>
      useExportRecoveryDiscovery({
        setDiscoveredRecoveryState,
        setSession,
        createRecoveryStore: () => ({
          listSafeRetryCandidates: async () => [manifest],
        }),
      }),
    )

    await waitFor(() => {
      expect(setDiscoveredRecoveryState).toHaveBeenCalledTimes(1)
    })

    expect(discovered).toMatchObject({
      status: 'source-required',
      exportId: manifest.exportId,
      expectedFileName: manifest.fileName,
      manifest,
    })
    expect(session?.exportState.recovery).toEqual(discovered)
  })
})
