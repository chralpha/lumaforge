import { useAtom } from 'jotai'
import { useCallback } from 'react'

import type {
  ImageSession,
  LUTProfileSelectionState,
  StyleAsset,
} from '../model/session'
import { currentSessionAtom } from '../state/session.atoms'

function createEmptySession(
  file: File,
  retained?: {
    activeStyle?: StyleAsset | null
    lutProfileSelection?: LUTProfileSelectionState
  },
): ImageSession {
  return {
    id: globalThis.crypto.randomUUID(),
    createdAt: Date.now(),
    sourceFile: {
      name: file.name,
      extension: file.name.split('.').pop()?.toLowerCase() || '',
      sizeBytes: file.size,
      supportLevel: 'experimental',
    },
    previewBundle: {
      embeddedPreview: { status: 'idle' },
      quickDecodePreview: { status: 'idle' },
      boundedHqPreview: { status: 'idle' },
      displaySource: 'none',
      boundedHqRequiredForExport: false,
    },
    activeStyle: retained?.activeStyle ?? null,
    lutProfileSelection: retained?.lutProfileSelection,
    viewState: {
      mode: 'compare',
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
      retryRecommended: false,
    },
  }
}

export function useImageSession() {
  const [session, setSession] = useAtom(currentSessionAtom)

  const replaceFile = useCallback(
    (
      file: File,
      retained?: {
        activeStyle?: StyleAsset | null
        lutProfileSelection?: LUTProfileSelectionState
      },
    ) => {
      const nextSession = createEmptySession(file, retained)
      setSession(nextSession)
      return nextSession
    },
    [setSession],
  )

  const resetSession = useCallback(() => {
    setSession(null)
  }, [setSession])

  const setActiveStyle = useCallback(
    (style: StyleAsset | null) => {
      setSession((prev) => (prev ? { ...prev, activeStyle: style } : prev))
    },
    [setSession],
  )

  return { session, replaceFile, resetSession, setActiveStyle, setSession }
}
