import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  selectCompareRenderMode,
  supportsLayeredCompareCss,
} from './compare-render-mode'

describe('selectCompareRenderMode', () => {
  it('prefers dual WebGL when capability allows two live preview pipelines', () => {
    expect(
      selectCompareRenderMode({
        requestedViewMode: 'compare',
        supportsCssClip: true,
        dualWebglAllowed: true,
        originalWebglReady: true,
        jpegSnapshotReady: false,
      }),
    ).toEqual({ kind: 'dual-webgl' })
  })

  it('does not select dual WebGL while the current original layer generation is pending', () => {
    expect(
      selectCompareRenderMode({
        requestedViewMode: 'compare',
        supportsCssClip: true,
        dualWebglAllowed: true,
        originalWebglReady: false,
        jpegSnapshotReady: false,
      }),
    ).toEqual({
      kind: 'processed-only',
      reason: 'jpeg-fallback-unavailable',
    })
  })

  it('keeps dual WebGL while a retained compare frame covers a preview upgrade', () => {
    expect(
      selectCompareRenderMode({
        requestedViewMode: 'compare',
        supportsCssClip: true,
        dualWebglAllowed: true,
        originalWebglReady: false,
        retainedCompareFrameReady: true,
        jpegSnapshotReady: false,
      }),
    ).toEqual({ kind: 'dual-webgl' })
  })

  it('uses embedded fallback while original WebGL is pending', () => {
    expect(
      selectCompareRenderMode({
        requestedViewMode: 'compare',
        supportsCssClip: true,
        dualWebglAllowed: true,
        originalWebglReady: false,
        originalWebglFailed: false,
        embeddedPreviewReady: true,
        jpegSnapshotReady: false,
      }),
    ).toEqual({
      kind: 'embedded-fallback',
      reason: 'original-webgl-pending',
    })
  })

  it('uses JPEG fallback when dual WebGL is not allowed and a snapshot is ready', () => {
    expect(
      selectCompareRenderMode({
        requestedViewMode: 'compare',
        supportsCssClip: true,
        dualWebglAllowed: false,
        originalWebglReady: false,
        jpegSnapshotReady: true,
      }),
    ).toEqual({ kind: 'jpeg-fallback', reason: 'dual-webgl-unavailable' })
  })

  it('uses JPEG fallback when left WebGL fails after dual WebGL was allowed', () => {
    expect(
      selectCompareRenderMode({
        requestedViewMode: 'compare',
        supportsCssClip: true,
        dualWebglAllowed: true,
        originalWebglReady: false,
        originalWebglFailed: true,
        jpegSnapshotReady: true,
      }),
    ).toEqual({ kind: 'jpeg-fallback', reason: 'original-webgl-failed' })
  })

  it('does not select the legacy single-canvas shader compare path', () => {
    expect(
      selectCompareRenderMode({
        requestedViewMode: 'compare',
        supportsCssClip: false,
        dualWebglAllowed: true,
        originalWebglReady: false,
        jpegSnapshotReady: true,
      }),
    ).toEqual({ kind: 'processed-only', reason: 'css-clip-unavailable' })
  })
})

describe('supportsLayeredCompareCss', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('accepts prefixed WebKit clip-path support', () => {
    vi.stubGlobal('CSS', {
      supports: vi.fn((property: string) => property === '-webkit-clip-path'),
    })

    expect(supportsLayeredCompareCss()).toBe(true)
  })

  it('does not disable layered compare in non-DOM environments', () => {
    vi.stubGlobal('CSS', undefined)

    expect(supportsLayeredCompareCss()).toBe(true)
  })
})
