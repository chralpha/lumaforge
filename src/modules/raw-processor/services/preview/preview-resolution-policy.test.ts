import { describe, expect, it } from 'vitest'

import {
  BOUNDED_HQ_PREVIEW_LOW_MEMORY_MAX_PIXELS,
  BOUNDED_HQ_PREVIEW_MAX_PIXELS,
  QUICK_PREVIEW_MAX_PIXELS,
} from '~/lib/raw/decoder'
import { deriveInteractivePolicy } from '~/lib/runtime/interactive-policy'

import { decideBoundedHqPreview } from './preview-resolution-policy'

describe('decideBoundedHqPreview', () => {
  it('uses the default bounded HQ cap on normal desktop-class input', () => {
    expect(
      decideBoundedHqPreview({
        sourceWidth: 6000,
        sourceHeight: 4000,
      }),
    ).toEqual({
      kind: 'decode',
      maxOutputPixels: BOUNDED_HQ_PREVIEW_MAX_PIXELS,
    })
  })

  it('uses the capability-derived bounded HQ cap on mobile-class input', () => {
    const policy = deriveInteractivePolicy({
      coi: false,
      pthread: false,
      deviceMemoryGB: null,
      hwConcurrency: 2,
      webKitClass: 'webkit-mobile',
      deviceFormFactor: 'mobile',
      maybeOpfsSupported: false,
    })

    expect(
      decideBoundedHqPreview({
        sourceWidth: 11662,
        sourceHeight: 8746,
        boundedHqMaxPixels: policy.boundedHqMaxPixels,
      }),
    ).toEqual({
      kind: 'decode',
      maxOutputPixels: BOUNDED_HQ_PREVIEW_LOW_MEMORY_MAX_PIXELS,
    })
  })

  it('skips bounded HQ when quick preview already covers the source', () => {
    expect(
      decideBoundedHqPreview({
        sourceWidth: 1200,
        sourceHeight: 900,
      }),
    ).toEqual({
      kind: 'skip',
      reason: `Source fits within quick preview cap ${QUICK_PREVIEW_MAX_PIXELS}.`,
    })
  })
})
