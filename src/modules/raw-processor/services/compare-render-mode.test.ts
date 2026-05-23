import { describe, expect, it } from 'vitest'

import { selectCompareRenderMode } from './compare-render-mode'

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
