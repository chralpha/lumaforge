import {
  deriveCanEdit,
  deriveCanExport,
  selectDisplaySource,
} from '../model/derive-session'
import type { ImageSession } from '../model/session'

const baseSession: ImageSession = {
  id: 's1',
  createdAt: 1,
  sourceFile: {
    name: 'frame.ARW',
    extension: 'arw',
    sizeBytes: 1,
    supportLevel: 'experimental',
  },
  previewBundle: {
    embeddedPreview: { status: 'idle' },
    quickDecodePreview: { status: 'idle' },
    hqImage: { status: 'idle' },
    displaySource: 'none',
    hqRequiredForExport: false,
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
    fullResCapability: { status: 'unknown' },
    retryRecommended: false,
  },
}

describe('session derivation', () => {
  it('enables editing when any preview source is ready', () => {
    const session: ImageSession = {
      ...baseSession,
      previewBundle: {
        ...baseSession.previewBundle,
        quickDecodePreview: { status: 'ready', width: 200, height: 100 },
      },
    }

    expect(deriveCanEdit(session)).toBe(true)
    expect(selectDisplaySource(session.previewBundle)).toBe('quick')
  })

  it('enables export when full-resolution capability is supported even if hq preview failed', () => {
    expect(deriveCanExport(baseSession)).toBe(false)

    const session: ImageSession = {
      ...baseSession,
      previewBundle: {
        ...baseSession.previewBundle,
        quickDecodePreview: { status: 'ready', width: 2000, height: 1500 },
        hqImage: { status: 'failed', errorCode: 'RAW_HQ_DECODE_FAILED' },
      },
      renderState: { status: 'idle' as const },
      exportState: {
        ...baseSession.exportState,
        status: 'idle',
        fullResCapability: { status: 'supported', width: 4000, height: 3000 },
      },
    }

    expect(deriveCanExport(session)).toBe(true)
  })
})
