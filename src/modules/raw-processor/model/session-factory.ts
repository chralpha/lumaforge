import type {
  ImageSession,
  LUTContractSelectionState,
  StyleAsset,
} from './session'

export type RetainedSessionState = {
  activeStyle?: StyleAsset | null
  lutProfileSelection?: LUTContractSelectionState
}

export function createImageSession(
  file: File,
  retained?: RetainedSessionState,
): ImageSession {
  return {
    id: globalThis.crypto.randomUUID(),
    createdAt: Date.now(),
    sourceFile: {
      file,
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
      recovery: { status: 'none' },
      checkpointDurable: false,
      retryRecommended: false,
    },
  }
}
