import { describe, expect, it } from 'vitest'

import type {
  OriginalWebglFrameStatus,
  PreviewFrameStatus,
} from './preview-compare-readiness'
import {
  derivePreviewCompareReadiness,
  derivePreviewTrackReadinessTransition,
  EMPTY_PREVIEW_FRAME_STATUS,
} from './preview-compare-readiness'

const quickProcessedFrame: PreviewFrameStatus = {
  generationKey: '1:quick:quick:800:600:data',
  displaySource: 'quick',
  source: 'quick',
  state: 'ready',
}

const quickOriginalFrame: OriginalWebglFrameStatus = {
  generationKey: '1:quick:dual:compare:active',
  displaySource: 'quick',
  state: 'ready',
}

function derive(
  overrides: Partial<Parameters<typeof derivePreviewCompareReadiness>[0]> = {},
) {
  return derivePreviewCompareReadiness({
    imageVersion: 2,
    displaySource: 'bounded-hq',
    imageSource: 'bounded-hq',
    imageWidth: 1600,
    imageHeight: 1200,
    hasImageData: true,
    trackReady: true,
    embeddedPreviewUrl: 'blob:embedded',
    viewMode: 'compare',
    dualWebglAllowed: true,
    suspended: false,
    supportsCssClip: true,
    originalWebglStatus: quickOriginalFrame,
    processedFrameStatus: quickProcessedFrame,
    ...overrides,
  })
}

describe('derivePreviewCompareReadiness', () => {
  it('keeps a synchronized quick compare pair active during bounded-HQ handoff', () => {
    expect(derive()).toMatchObject({
      currentProcessedFrameReady: false,
      originalWebglReady: false,
      retainedOriginalWebglFrameReady: true,
      retainedProcessedFrameReady: true,
      retainedCompareFrameReady: true,
      embeddedPreviewFallbackReady: false,
      shouldDelayProcessedCompareRender: true,
      shouldMountOriginalWebglLayer: true,
    })
  })

  it('does not retain compare when only one side still has a quick frame', () => {
    expect(
      derive({
        processedFrameStatus: EMPTY_PREVIEW_FRAME_STATUS,
      }),
    ).toMatchObject({
      retainedOriginalWebglFrameReady: true,
      retainedProcessedFrameReady: false,
      retainedCompareFrameReady: false,
      embeddedPreviewFallbackReady: true,
      shouldDelayProcessedCompareRender: false,
    })
  })

  it('treats same-generation bounded-HQ processed and original frames as current', () => {
    const currentProcessedFrame: PreviewFrameStatus = {
      generationKey: '2:bounded-hq:bounded-hq:1600:1200:data',
      displaySource: 'bounded-hq',
      source: 'bounded-hq',
      state: 'ready',
    }
    const currentOriginalFrame: OriginalWebglFrameStatus = {
      generationKey: '2:bounded-hq:dual:compare:active',
      displaySource: 'bounded-hq',
      state: 'ready',
    }

    expect(
      derive({
        processedFrameStatus: currentProcessedFrame,
        originalWebglStatus: currentOriginalFrame,
      }),
    ).toMatchObject({
      currentProcessedFrameReady: true,
      processedPreviewVisible: true,
      originalWebglReady: true,
      retainedCompareFrameReady: false,
      embeddedPreviewFallbackReady: false,
      shouldDelayProcessedCompareRender: false,
    })
  })

  it('uses embedded URL presence rather than display source alone for original layer eligibility', () => {
    expect(
      derive({
        displaySource: 'embedded',
        imageSource: 'quick',
        embeddedPreviewUrl: null,
      }),
    ).toMatchObject({
      originalWebglLayerEligible: true,
      embeddedPreviewFallbackReady: false,
    })
  })
})

describe('derivePreviewTrackReadinessTransition', () => {
  it('retains track readiness while a processed quick frame covers bounded-HQ handoff', () => {
    expect(
      derivePreviewTrackReadinessTransition({
        retainedTrackIdentity: '',
        processedTrackIdentity: '2:1600:1200',
        retainedProcessedFrameReady: true,
      }),
    ).toEqual({
      nextRetainedTrackIdentity: '2:1600:1200',
      resetTrackReady: false,
    })
  })

  it('does not reset track readiness while the retained handoff identity is still current', () => {
    expect(
      derivePreviewTrackReadinessTransition({
        retainedTrackIdentity: '2:1600:1200',
        processedTrackIdentity: '2:1600:1200',
        retainedProcessedFrameReady: false,
      }),
    ).toEqual({
      nextRetainedTrackIdentity: '2:1600:1200',
      resetTrackReady: false,
    })
  })

  it('clears retained identity and resets track readiness for a new preview identity', () => {
    expect(
      derivePreviewTrackReadinessTransition({
        retainedTrackIdentity: '2:1600:1200',
        processedTrackIdentity: '3:1600:1200',
        retainedProcessedFrameReady: false,
      }),
    ).toEqual({
      nextRetainedTrackIdentity: '',
      resetTrackReady: true,
    })
  })
})
