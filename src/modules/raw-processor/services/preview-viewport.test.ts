import { describe, expect, it } from 'vitest'

import type { ImageSession } from '../model/session'
import {
  DEFAULT_PREVIEW_VIEWPORT,
  getCanvasCompareSplit,
  panPreviewViewport,
  resetPreviewViewport,
  zoomPreviewViewportAtPoint,
} from './preview-viewport'
import { applyPreviewViewportToSession } from './view-session-state'

const geometry = {
  viewportWidth: 400,
  viewportHeight: 300,
  contentWidth: 400,
  contentHeight: 300,
}

function createSession(overrides: Partial<ImageSession> = {}): ImageSession {
  return {
    id: 'session-preview-viewport',
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
      boundedHqPreview: { status: 'ready', width: 1600, height: 1200 },
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
      status: 'ready',
      qualityPreset: 'high',
      fidelityLevel: 'balanced',
      fullResCapability: { status: 'supported', width: 1600, height: 1200 },
      recovery: { status: 'none' },
      checkpointDurable: false,
      retryRecommended: false,
    },
    ...overrides,
  }
}

describe('preview viewport interaction math', () => {
  it('zooms around the pointer origin instead of changing processing params', () => {
    const next = zoomPreviewViewportAtPoint(DEFAULT_PREVIEW_VIEWPORT, {
      geometry,
      originX: 100,
      originY: 0,
      nextZoom: 2,
    })

    expect(next).toEqual({
      zoom: 2,
      panX: -100,
      panY: 0,
      fitMode: 'custom',
    })
  })

  it('clamps panning to the scaled preview content bounds', () => {
    const next = panPreviewViewport(
      { zoom: 2, panX: 0, panY: 0, fitMode: 'custom' },
      {
        geometry,
        deltaX: 300,
        deltaY: -240,
      },
    )

    expect(next).toEqual({
      zoom: 2,
      panX: 200,
      panY: -150,
      fitMode: 'custom',
    })
  })

  it('returns to screen-fit when reset', () => {
    expect(resetPreviewViewport()).toEqual(DEFAULT_PREVIEW_VIEWPORT)
  })
})

describe('compare split viewport compensation', () => {
  it('passes through unchanged when zoom is 1', () => {
    expect(getCanvasCompareSplit(0.5, 1, 0, 400)).toBe(0.5)
    expect(getCanvasCompareSplit(0.25, 1, 0, 400)).toBe(0.25)
    expect(getCanvasCompareSplit(0.75, 1, 100, 400)).toBe(0.75)
  })

  it('keeps centre split at centre regardless of zoom', () => {
    expect(getCanvasCompareSplit(0.5, 2, 0, 400)).toBe(0.5)
    expect(getCanvasCompareSplit(0.5, 4, 0, 800)).toBe(0.5)
  })

  it('compensates non-centre splits for zoom', () => {
    // At zoom=2, centre=400, panX=0, contentWidth=400:
    // canvasSplit = 0.5 + (0.75 - 0.5)/2 - 0/(400*2) = 0.5 + 0.125 = 0.625
    expect(getCanvasCompareSplit(0.75, 2, 0, 400)).toBe(0.625)

    // At zoom=2, centre=400, panX=0, contentWidth=400:
    // canvasSplit = 0.5 + (0.25 - 0.5)/2 - 0 = 0.5 - 0.125 = 0.375
    expect(getCanvasCompareSplit(0.25, 2, 0, 400)).toBe(0.375)
  })

  it('compensates for pan offset', () => {
    // At zoom=2, panX=200, contentWidth=400:
    // canvasSplit = 0.5 + (0.5 - 0.5)/2 - 200/(400*2) = 0.5 - 0.25 = 0.25
    expect(getCanvasCompareSplit(0.5, 2, 200, 400)).toBe(0.25)

    // At zoom=2, panX=-200, contentWidth=400:
    // canvasSplit = 0.5 + (0.5 - 0.5)/2 - (-200)/(400*2) = 0.5 + 0.25 = 0.75
    expect(getCanvasCompareSplit(0.5, 2, -200, 400)).toBe(0.75)
  })

  it('clamps output to [0, 1] range', () => {
    expect(getCanvasCompareSplit(0, 1, 0, 400)).toBe(0)
    expect(getCanvasCompareSplit(1, 1, 0, 400)).toBe(1)
    // zoom=8, compareSplit=1, panX=0, contentWidth=400:
    // canvasSplit = 0.5 + (1 - 0.5)/8 - 0 = 0.5 + 0.0625 = 0.5625 (within range)
    // zoom=8, compareSplit=0, panX=0:
    // canvasSplit = 0.5 + (0 - 0.5)/8 - 0 = 0.5 - 0.0625 = 0.4375 (within range)
    expect(getCanvasCompareSplit(1, 8, 0, 400)).toBeCloseTo(0.5625, 5)
    expect(getCanvasCompareSplit(0, 8, 0, 400)).toBeCloseTo(0.4375, 5)
  })

  it('handles edge cases gracefully', () => {
    expect(getCanvasCompareSplit(Number.NaN, 2, 0, 400)).toBe(0.5)
    expect(getCanvasCompareSplit(0.5, Number.NaN, 0, 400)).toBe(0.5)
    expect(getCanvasCompareSplit(0.5, 2, 0, 0)).toBe(0.5)
    expect(getCanvasCompareSplit(0.5, 2, 0, -100)).toBe(0.5)
  })
})

describe('preview viewport session state', () => {
  it('updates only preview viewState and preserves export readiness/result state', () => {
    const session = createSession()

    const next = applyPreviewViewportToSession(session, {
      zoom: 2,
      panX: 40,
      panY: -20,
      fitMode: 'custom',
    })

    expect(next).not.toBe(session)
    expect(next.viewState).toEqual({
      ...session.viewState,
      zoom: 2,
      panX: 40,
      panY: -20,
      fitMode: 'custom',
    })
    expect(next.previewBundle).toBe(session.previewBundle)
    expect(next.renderState).toBe(session.renderState)
    expect(next.exportState).toBe(session.exportState)
  })
})
