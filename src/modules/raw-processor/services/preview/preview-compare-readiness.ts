import type { ProcessingParams } from '@lumaforge/luma-color-runtime'

import type { DecodedImageSource } from '~/lib/raw/decoder'

import type { DisplaySource } from '../../model/session'

export type PreviewFrameStatus = {
  generationKey: string
  displaySource: DisplaySource
  source: DecodedImageSource | 'preview'
  state: 'idle' | 'ready'
}

export type OriginalWebglFrameStatus = {
  generationKey: string
  displaySource: DisplaySource
  state: 'idle' | 'ready' | 'failed'
}

export const EMPTY_PREVIEW_FRAME_STATUS: PreviewFrameStatus = {
  generationKey: '',
  displaySource: 'none',
  source: 'preview',
  state: 'idle',
}

export const EMPTY_ORIGINAL_WEBGL_FRAME_STATUS: OriginalWebglFrameStatus = {
  generationKey: '',
  displaySource: 'none',
  state: 'idle',
}

type DerivePreviewCompareReadinessInput = {
  imageVersion: number
  displaySource: DisplaySource
  imageSource?: DecodedImageSource
  imageWidth: number
  imageHeight: number
  hasImageData: boolean
  trackReady: boolean
  embeddedPreviewUrl?: string | null
  viewMode: ProcessingParams['viewMode']
  dualWebglAllowed: boolean
  suspended: boolean
  supportsCssClip: boolean
  originalWebglStatus: OriginalWebglFrameStatus
  processedFrameStatus: PreviewFrameStatus
}

export function getProcessedImageGenerationKey({
  imageVersion,
  displaySource,
  imageSource,
  imageWidth,
  imageHeight,
  hasImageData,
}: Pick<
  DerivePreviewCompareReadinessInput,
  | 'imageVersion'
  | 'displaySource'
  | 'imageSource'
  | 'imageWidth'
  | 'imageHeight'
  | 'hasImageData'
>) {
  return [
    imageVersion,
    displaySource,
    imageSource ?? 'preview',
    imageWidth,
    imageHeight,
    hasImageData ? 'data' : 'empty',
  ].join(':')
}

export function getOriginalWebglGenerationKey({
  imageVersion,
  displaySource,
  dualWebglAllowed,
  viewMode,
  suspended,
}: Pick<
  DerivePreviewCompareReadinessInput,
  | 'imageVersion'
  | 'displaySource'
  | 'dualWebglAllowed'
  | 'viewMode'
  | 'suspended'
>) {
  return [
    imageVersion,
    displaySource,
    dualWebglAllowed ? 'dual' : 'fallback',
    viewMode,
    suspended ? 'suspended' : 'active',
  ].join(':')
}

export function derivePreviewCompareReadiness({
  imageVersion,
  displaySource,
  imageSource,
  imageWidth,
  imageHeight,
  hasImageData,
  trackReady,
  embeddedPreviewUrl,
  viewMode,
  dualWebglAllowed,
  suspended,
  supportsCssClip,
  originalWebglStatus,
  processedFrameStatus,
}: DerivePreviewCompareReadinessInput) {
  const showEmbeddedPreview =
    displaySource === 'embedded' && Boolean(embeddedPreviewUrl)
  const processedImageGenerationKey = getProcessedImageGenerationKey({
    imageVersion,
    displaySource,
    imageSource,
    imageWidth,
    imageHeight,
    hasImageData,
  })
  const currentProcessedFrameReady =
    processedFrameStatus.generationKey === processedImageGenerationKey &&
    processedFrameStatus.state === 'ready'
  const processedPreviewVisible = trackReady && currentProcessedFrameReady
  const originalWebglGenerationKey = getOriginalWebglGenerationKey({
    imageVersion,
    displaySource,
    dualWebglAllowed,
    viewMode,
    suspended,
  })
  const originalWebglReady =
    originalWebglStatus.generationKey === originalWebglGenerationKey &&
    originalWebglStatus.state === 'ready'
  const originalWebglFailed =
    originalWebglStatus.generationKey === originalWebglGenerationKey &&
    originalWebglStatus.state === 'failed'
  const originalWebglLayerEligible =
    !showEmbeddedPreview &&
    !suspended &&
    hasImageData &&
    viewMode === 'compare' &&
    supportsCssClip &&
    dualWebglAllowed
  const retainedOriginalWebglFrameReady =
    originalWebglLayerEligible &&
    !originalWebglReady &&
    !originalWebglFailed &&
    originalWebglStatus.state === 'ready' &&
    originalWebglStatus.displaySource === 'quick' &&
    displaySource === 'bounded-hq' &&
    imageSource === 'bounded-hq'
  const retainedProcessedFrameReady =
    processedFrameStatus.state === 'ready' &&
    processedFrameStatus.displaySource === 'quick' &&
    processedFrameStatus.source === 'quick' &&
    displaySource === 'bounded-hq' &&
    imageSource === 'bounded-hq'
  const retainedCompareFrameReady =
    retainedOriginalWebglFrameReady && retainedProcessedFrameReady
  const embeddedPreviewFallbackReady =
    Boolean(embeddedPreviewUrl) &&
    originalWebglLayerEligible &&
    !originalWebglReady &&
    !retainedCompareFrameReady

  return {
    processedImageGenerationKey,
    currentProcessedFrameReady,
    processedPreviewVisible,
    originalWebglGenerationKey,
    originalWebglReady,
    originalWebglFailed,
    originalWebglLayerEligible,
    retainedOriginalWebglFrameReady,
    retainedProcessedFrameReady,
    retainedCompareFrameReady,
    embeddedPreviewFallbackReady,
    shouldMountOriginalWebglLayer:
      originalWebglLayerEligible && !originalWebglFailed,
    shouldDelayProcessedCompareRender: retainedCompareFrameReady,
  }
}

export function derivePreviewTrackReadinessTransition({
  retainedTrackIdentity,
  processedTrackIdentity,
  retainedProcessedFrameReady,
}: {
  retainedTrackIdentity: string
  processedTrackIdentity: string
  retainedProcessedFrameReady: boolean
}) {
  if (retainedProcessedFrameReady) {
    return {
      nextRetainedTrackIdentity: processedTrackIdentity,
      resetTrackReady: false,
    }
  }

  if (retainedTrackIdentity === processedTrackIdentity) {
    return {
      nextRetainedTrackIdentity: retainedTrackIdentity,
      resetTrackReady: false,
    }
  }

  return {
    nextRetainedTrackIdentity: '',
    resetTrackReady: true,
  }
}
