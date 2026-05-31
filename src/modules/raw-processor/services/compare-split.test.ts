import { describe, expect, it } from 'vitest'

import { clampCompareSplit, getCompareSplitFromClientX } from './compare-split'

describe('compare split math', () => {
  it('clamps finite values to the preview frame range', () => {
    expect(clampCompareSplit(-1)).toBe(0)
    expect(clampCompareSplit(0.5)).toBe(0.5)
    expect(clampCompareSplit(2)).toBe(1)
  })

  it('falls back to the centered split for non-finite values', () => {
    expect(clampCompareSplit(Number.NaN)).toBe(0.5)
    expect(clampCompareSplit(Number.POSITIVE_INFINITY)).toBe(0.5)
    expect(clampCompareSplit(Number.NEGATIVE_INFINITY)).toBe(0.5)
  })

  it('maps pointer x position to a clamped frame fraction', () => {
    expect(getCompareSplitFromClientX({ left: 100, width: 400 }, 300)).toBe(0.5)
    expect(getCompareSplitFromClientX({ left: 100, width: 400 }, 60)).toBe(0)
    expect(getCompareSplitFromClientX({ left: 100, width: 400 }, 520)).toBe(1)
  })

  it('falls back to the centered split for unusable geometry', () => {
    expect(getCompareSplitFromClientX({ left: 100, width: 0 }, 300)).toBe(0.5)
    expect(getCompareSplitFromClientX({ left: 100, width: -1 }, 300)).toBe(0.5)
  })
})
