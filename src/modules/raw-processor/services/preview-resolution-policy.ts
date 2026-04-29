import {
  BOUNDED_HQ_PREVIEW_LOW_MEMORY_MAX_PIXELS,
  BOUNDED_HQ_PREVIEW_MAX_PIXELS,
  QUICK_PREVIEW_MAX_PIXELS,
} from '~/lib/raw/decoder'

export type BoundedHqPreviewDecision =
  | { kind: 'decode'; maxOutputPixels: number }
  | { kind: 'skip'; reason: string }

export function decideBoundedHqPreview({
  sourceWidth,
  sourceHeight,
  userAgent,
}: {
  sourceWidth: number
  sourceHeight: number
  userAgent: string
}): BoundedHqPreviewDecision {
  const sourcePixels = sourceWidth * sourceHeight
  if (sourcePixels <= QUICK_PREVIEW_MAX_PIXELS) {
    return {
      kind: 'skip',
      reason: `Source fits within quick preview cap ${QUICK_PREVIEW_MAX_PIXELS}.`,
    }
  }

  const isMobileWebKit =
    /AppleWebKit/i.test(userAgent) && /Mobile|iPhone|iPad|iPod/i.test(userAgent)

  return {
    kind: 'decode',
    maxOutputPixels: isMobileWebKit
      ? BOUNDED_HQ_PREVIEW_LOW_MEMORY_MAX_PIXELS
      : BOUNDED_HQ_PREVIEW_MAX_PIXELS,
  }
}
