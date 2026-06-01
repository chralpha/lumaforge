import type { LumaRawExportCapability } from '@lumaforge/luma-raw-runtime'
import { describe, expect, it } from 'vitest'

import type { ExportCheckpointManifest } from '~/lib/export/checkpoint-store'
import { createBlobOutputResult } from '~/lib/export/output-sink'

import { createExportResult } from '../../model/export-result'
import type { ImageSession } from '../../model/session'
import {
  buildExportFailureDescription,
  changesRenderGraphParams,
  clearExportResultForActiveExport,
  clearExportResultState,
  createSafeRetryManifest,
  hasSameRawRenderExposure,
  isCheckpointMetric,
  toFullResCapabilityState,
} from './export-state'

function createSession(
  exportState: Partial<ImageSession['exportState']> = {},
): ImageSession {
  return {
    id: 'session-export-state',
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
    activeStyle: null,
    viewState: {
      mode: 'compare',
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
      fullResCapability: { status: 'supported', width: 4000, height: 3000 },
      recovery: { status: 'none' },
      checkpointDurable: false,
      retryRecommended: false,
      ...exportState,
    },
  }
}

function createReadyExportResult() {
  return createExportResult({
    output: createBlobOutputResult({
      filename: 'frame-neutral.jpg',
      blob: new Blob(['jpeg'], { type: 'image/jpeg' }),
    }),
    width: 4000,
    height: 3000,
    now: () => 123,
    copyCapability: {
      mode: 'full-resolution',
      label: 'Copy full-resolution image',
    },
  })
}

function createCapability(
  overrides: Partial<LumaRawExportCapability> = {},
): LumaRawExportCapability {
  return {
    supported: true,
    strategy: 'libraw-processed-window',
    width: 4000,
    height: 3000,
    rawWidth: 6048,
    rawHeight: 4024,
    cfa: { pattern: 'rggb', xPhase: 0, yPhase: 0 },
    blackLevel: 512,
    whiteLevel: 16383,
    sensor: {
      layout: 'bayer',
      colorCount: 3,
      phaseIsWindowLocal: false,
    },
    windows: {
      librawProcessed: true,
      rawMosaic: true,
    },
    diagnostics: {
      hasRawImage: true,
      hasColor3Image: true,
      hasColor4Image: false,
      hasXTransTable: false,
    },
    reasons: [],
    ...overrides,
  }
}

describe('export state helpers', () => {
  it('leaves an idle session without a ready result unchanged by reference', () => {
    const session = createSession()

    expect(clearExportResultState(session)).toBe(session)
  })

  it('clears ready export results while returning the session to idle', () => {
    const result = createReadyExportResult()
    const session = createSession({
      status: 'ready',
      result,
      lastProgress: { completedStrips: 3, totalStrips: 3 },
      retryRecommended: true,
      recommendedRetryLevel: 'safe',
    })

    const next = clearExportResultState(session)

    expect(next).not.toBe(session)
    expect(next.exportState.status).toBe('idle')
    expect(next.exportState.result).toBeUndefined()
    expect(next.exportState.lastProgress).toEqual({
      completedStrips: 3,
      totalStrips: 3,
    })
    expect(next.exportState.retryRecommended).toBe(true)
    expect(next.exportState.recommendedRetryLevel).toBe('safe')
  })

  it('clears exporting export results and progress while returning the session to idle', () => {
    const result = createReadyExportResult()
    const session = createSession({
      status: 'exporting',
      result,
      lastProgress: { completedStrips: 1, totalStrips: 4 },
    })

    const next = clearExportResultState(session)

    expect(next).not.toBe(session)
    expect(next.exportState.status).toBe('idle')
    expect(next.exportState.result).toBeUndefined()
    expect(next.exportState.lastProgress).toBeUndefined()
  })

  it('clears active exporting state progress and result without changing status', () => {
    const result = createReadyExportResult()
    const session = createSession({
      status: 'exporting',
      result,
      lastProgress: { completedStrips: 1, totalStrips: 4 },
      retryRecommended: true,
      recommendedRetryLevel: 'balanced',
    })

    const next = clearExportResultForActiveExport(session)

    expect(next.exportState.status).toBe('exporting')
    expect(next.exportState.result).toBeUndefined()
    expect(next.exportState.lastProgress).toBeUndefined()
    expect(next.exportState.retryRecommended).toBe(false)
    expect(next.exportState.recommendedRetryLevel).toBeUndefined()
  })

  it('detects only render graph parameter changes', () => {
    const current = {
      styleKind: 'builtin',
      builtinPreset: 'warm',
      intensity: 0.7,
      viewMode: 'compare',
      compareSplit: 0.5,
      userExposureEv: 0,
      userContrast: 0,
      userHighlights: 0,
      userShadows: 0,
      userWhites: 0,
      userBlacks: 0,
      userTemperature: 0,
      userTint: 0,
    } as const

    expect(
      changesRenderGraphParams(current, {
        viewMode: 'original',
        compareSplit: 0.8,
      }),
    ).toBe(false)
    expect(changesRenderGraphParams(current, { intensity: 0.8 })).toBe(true)
    expect(changesRenderGraphParams(current, { userExposureEv: 0.25 })).toBe(
      true,
    )
    expect(changesRenderGraphParams(current, { userContrast: -0.2 })).toBe(true)
    expect(changesRenderGraphParams(current, { userHighlights: -5 })).toBe(true)
    expect(changesRenderGraphParams(current, { userShadows: 5 })).toBe(true)
    expect(changesRenderGraphParams(current, { userWhites: -5 })).toBe(true)
    expect(changesRenderGraphParams(current, { userBlacks: 5 })).toBe(true)
    expect(changesRenderGraphParams(current, { builtinPreset: 'cool' })).toBe(
      true,
    )
  })

  it('treats temperature and tint changes as render graph changes', () => {
    const current = {
      styleKind: 'none',
      builtinPreset: null,
      intensity: 0.7,
      viewMode: 'compare',
      compareSplit: 0.5,
      userExposureEv: 0,
      userContrast: 0,
      userHighlights: 0,
      userShadows: 0,
      userWhites: 0,
      userBlacks: 0,
      userTemperature: 0,
      userTint: 0,
    } as const

    expect(changesRenderGraphParams(current, { userTemperature: 12 })).toBe(
      true,
    )
    expect(changesRenderGraphParams(current, { userTint: -8 })).toBe(true)
  })

  it('compares raw render exposure by value while preserving null semantics', () => {
    expect(hasSameRawRenderExposure(null, null)).toBe(true)
    expect(hasSameRawRenderExposure(undefined, null)).toBe(false)
    expect(
      hasSameRawRenderExposure(
        { ev: 0, multiplier: 1, source: 'identity' },
        { ev: 0, multiplier: 1, source: 'identity' },
      ),
    ).toBe(true)
    expect(
      hasSameRawRenderExposure(
        { ev: 0, multiplier: 1, source: 'identity' },
        { ev: 1, multiplier: 2, source: 'user' },
      ),
    ).toBe(false)
  })

  it('maps runtime export capability facts to app session capability state', () => {
    expect(toFullResCapabilityState(createCapability())).toEqual({
      status: 'supported',
      width: 4000,
      height: 3000,
    })

    expect(
      toFullResCapabilityState(
        createCapability({
          supported: true,
          windows: { librawProcessed: false, rawMosaic: true },
        }),
      ),
    ).toEqual({
      status: 'unsupported',
      reason: 'processed-window-unavailable',
    })

    expect(
      toFullResCapabilityState(
        createCapability({
          supported: false,
          reasons: ['missing-export-facts', 'processed-window-unavailable'],
        }),
      ),
    ).toEqual({
      status: 'unsupported',
      reason: 'missing-export-facts, processed-window-unavailable',
    })
  })

  it('creates safe-retry checkpoint manifests with restart-only jpeg state', () => {
    const file = new File(['raw'], 'frame.ARW', { lastModified: 456 })
    const sourceFingerprint: ExportCheckpointManifest['sourceFingerprint'] = {
      name: 'frame.ARW',
      size: file.size,
      lastModified: file.lastModified,
      width: 4000,
      height: 3000,
      hashPrefixHex: 'abc123',
    }

    expect(
      createSafeRetryManifest({
        exportId: 'export-1',
        file,
        sourceFingerprint,
        outputWidth: 4000,
        outputHeight: 3000,
        graphFingerprint: '[graph]',
        profile: 'ios-safe',
        derivedLabel: 'low-memory-thr1-rs64-opfs-file-wkwebkit-mobile',
        preferredRows: 64,
        outputSink: 'opfs-file',
        completedRowsForDiagnostics: 128,
        updatedAt: '2026-05-04T00:00:00.000Z',
      }),
    ).toEqual({
      version: 1,
      exportId: 'export-1',
      sourceFingerprint,
      fileName: 'frame.ARW',
      sourceSize: file.size,
      sourceLastModified: file.lastModified,
      outputWidth: 4000,
      outputHeight: 3000,
      graphFingerprint: '[graph]',
      profile: 'ios-safe',
      derivedLabel: 'low-memory-thr1-rs64-opfs-file-wkwebkit-mobile',
      attempt: 1,
      preferredRows: 64,
      totalRows: 3000,
      recoveryMode: 'safe-retry',
      outputSink: 'opfs-file',
      sourceReacquisition: 'user-reselect-required',
      completedRowsForDiagnostics: 128,
      jpegState: 'restart-required',
      updatedAt: '2026-05-04T00:00:00.000Z',
    })
  })

  it('recognizes checkpoint metrics by kind only', () => {
    expect(
      isCheckpointMetric({
        kind: 'checkpoint',
        requestId: 'request-1',
        completedRowsForDiagnostics: 64,
        totalRows: 3000,
        stripRows: 64,
        timestamp: '2026-05-04T00:00:00.000Z',
      }),
    ).toBe(true)
    expect(isCheckpointMetric({ kind: 'metric' })).toBe(false)
    expect(isCheckpointMetric(null)).toBe(false)
  })

  it('adds retry guidance only when a retry level exists', () => {
    expect(buildExportFailureDescription('Worker failed', null)).toBe(
      'Worker failed',
    )
    expect(buildExportFailureDescription('Worker failed', 'safe')).toBe(
      'Worker failed. Retry with safe fidelity.',
    )
  })
})
