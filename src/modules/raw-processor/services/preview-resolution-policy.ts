import {
  BOUNDED_HQ_PREVIEW_MAX_PIXELS,
  QUICK_PREVIEW_MAX_PIXELS,
} from '~/lib/raw/decoder'

export type BoundedHqPreviewDecision =
  | { kind: 'decode'; maxOutputPixels: number }
  | { kind: 'skip'; reason: string }

export function decideBoundedHqPreview({
  sourceWidth,
  sourceHeight,
  boundedHqMaxPixels = BOUNDED_HQ_PREVIEW_MAX_PIXELS,
}: {
  sourceWidth: number
  sourceHeight: number
  boundedHqMaxPixels?: number
}): BoundedHqPreviewDecision {
  const sourcePixels = sourceWidth * sourceHeight
  if (sourcePixels <= QUICK_PREVIEW_MAX_PIXELS) {
    return {
      kind: 'skip',
      reason: `Source fits within quick preview cap ${QUICK_PREVIEW_MAX_PIXELS}.`,
    }
  }

  return {
    kind: 'decode',
    maxOutputPixels: boundedHqMaxPixels,
  }
}
