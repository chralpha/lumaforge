import { describe, expect, it } from 'vitest'

import {
  BOUNDED_HQ_PREVIEW_MAX_PIXELS,
  QUICK_PREVIEW_MAX_PIXELS,
} from '~/lib/raw/decoder'

import { decideBoundedHqPreview } from './preview-resolution-policy'

describe('decideBoundedHqPreview', () => {
  it('uses the default bounded HQ cap on normal desktop-class input', () => {
    expect(
      decideBoundedHqPreview({
        sourceWidth: 6000,
        sourceHeight: 4000,
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/605.1 Safari/605.1',
      }),
    ).toEqual({
      kind: 'decode',
      maxOutputPixels: BOUNDED_HQ_PREVIEW_MAX_PIXELS,
    })
  })

  it('uses the default bounded HQ cap on mobile-class input', () => {
    expect(
      decideBoundedHqPreview({
        sourceWidth: 11662,
        sourceHeight: 8746,
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
      }),
    ).toEqual({
      kind: 'decode',
      maxOutputPixels: BOUNDED_HQ_PREVIEW_MAX_PIXELS,
    })
  })

  it('skips bounded HQ when quick preview already covers the source', () => {
    expect(
      decideBoundedHqPreview({
        sourceWidth: 1200,
        sourceHeight: 900,
        userAgent: 'unit-test',
      }),
    ).toEqual({
      kind: 'skip',
      reason: `Source fits within quick preview cap ${QUICK_PREVIEW_MAX_PIXELS}.`,
    })
  })
})
