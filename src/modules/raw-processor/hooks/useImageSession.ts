import { useAtom } from 'jotai'
import { useCallback } from 'react'

import type { ImageSession, StyleAsset } from '../model/session'
import { currentSessionAtom } from '../state/session.atoms'

function createEmptySession(file: File): ImageSession {
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
      hqImage: { status: 'idle' },
      displaySource: 'none',
      hqRequiredForExport: true,
    },
    activeStyle: null,
    viewState: {
      mode: 'processed',
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
      retryRecommended: false,
    },
  }
}

export function useImageSession() {
  const [session, setSession] = useAtom(currentSessionAtom)

  const replaceFile = useCallback(
    (file: File) => {
      setSession(createEmptySession(file))
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
