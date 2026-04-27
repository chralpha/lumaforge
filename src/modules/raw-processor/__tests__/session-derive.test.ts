import { getLUTColorProfile } from '~/lib/color/registry'

import {
  deriveCanEdit,
  deriveCanExport,
  deriveExportDisabledReason,
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

  it('disables export for builtin styles before the export button becomes available', () => {
    const session: ImageSession = {
      ...baseSession,
      renderState: { status: 'ready' as const },
      exportState: {
        ...baseSession.exportState,
        fullResCapability: { status: 'supported', width: 4000, height: 3000 },
      },
      activeStyle: {
        kind: 'builtin',
        name: 'Neutral',
        defaultIntensityLevel: 'standard',
        currentIntensityLevel: 'standard',
      },
    }

    expect(deriveCanExport(session)).toBe(false)
    expect(deriveExportDisabledReason(session)).toBe(
      'Built-in styles are not supported by full-resolution JPEG export.',
    )
  })

  it('surfaces unsupported LUT output before export is triggered', () => {
    const session: ImageSession = {
      ...baseSession,
      renderState: { status: 'ready' as const },
      exportState: {
        ...baseSession.exportState,
        fullResCapability: { status: 'supported', width: 4000, height: 3000 },
      },
      activeStyle: {
        kind: 'custom',
        name: 'Display LUT',
        defaultIntensityLevel: 'standard',
        currentIntensityLevel: 'standard',
        lutAsset: {
          format: 'cube',
          dimension: 33,
          profileResolution: {
            kind: 'needs-user-selection',
            suggestions: [],
            reason: 'unsupported-output',
          },
        },
      },
    }

    expect(deriveCanExport(session)).toBe(false)
    expect(deriveExportDisabledReason(session)).toBe(
      'This LUT output transfer is not supported by full-resolution JPEG export.',
    )
  })

  it('disables export for resolved technical-output LUTs with linear output transfer', () => {
    const profile = getLUTColorProfile('panasonic-vgamut-vlog')
    expect(profile).toBeDefined()

    const session: ImageSession = {
      ...baseSession,
      renderState: { status: 'ready' as const },
      exportState: {
        ...baseSession.exportState,
        fullResCapability: { status: 'supported', width: 4000, height: 3000 },
      },
      activeStyle: {
        kind: 'custom',
        name: 'Technical LUT',
        defaultIntensityLevel: 'standard',
        currentIntensityLevel: 'standard',
        lutAsset: {
          format: 'cube',
          dimension: 33,
          profileResolution: {
            kind: 'resolved',
            confidence: 'metadata',
            profile: {
              ...profile!,
              role: 'technical-output',
              outputGamut: 'v-gamut',
              outputTransfer: 'linear',
              outputRange: 'full',
            },
          },
        },
      },
    }

    expect(deriveCanExport(session)).toBe(false)
    expect(deriveExportDisabledReason(session)).toBe(
      'This LUT output transfer is not supported by full-resolution JPEG export.',
    )
  })

  it('disables export for resolved technical-output LUTs with unknown output range', () => {
    const profile = getLUTColorProfile('panasonic-vgamut-vlog')
    expect(profile).toBeDefined()

    const session: ImageSession = {
      ...baseSession,
      renderState: { status: 'ready' as const },
      exportState: {
        ...baseSession.exportState,
        fullResCapability: { status: 'supported', width: 4000, height: 3000 },
      },
      activeStyle: {
        kind: 'custom',
        name: 'Technical LUT',
        defaultIntensityLevel: 'standard',
        currentIntensityLevel: 'standard',
        lutAsset: {
          format: 'cube',
          dimension: 33,
          profileResolution: {
            kind: 'resolved',
            confidence: 'metadata',
            profile: {
              ...profile!,
              role: 'technical-output',
              outputGamut: 'v-gamut',
              outputTransfer: 'v-log',
              outputRange: 'unknown',
            },
          },
        },
      },
    }

    expect(deriveCanExport(session)).toBe(false)
    expect(deriveExportDisabledReason(session)).toBe(
      'This LUT output range must be explicit before full-resolution JPEG export.',
    )
  })
})
