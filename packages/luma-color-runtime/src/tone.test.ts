import { describe, expect, it } from 'vitest'

import {
  applyUserContrastRgb,
  applyUserContrastRgbInto,
  applyUserExposureRgb,
  applyUserExposureRgbInto,
  applyUserToneRgb,
  applyUserToneRgbInto,
  contrastFactorFromAmount,
  normalizeToneParams,
  resolveToneParams,
  userExposureMultiplierFromEv,
} from './tone'

const EPS = 1e-12

function expectRgbClose(
  actual: readonly [number, number, number],
  expected: readonly [number, number, number],
) {
  expect(actual[0]).toBeCloseTo(expected[0], 12)
  expect(actual[1]).toBeCloseTo(expected[1], 12)
  expect(actual[2]).toBeCloseTo(expected[2], 12)
}

describe('tone math', () => {
  it('normalizes missing and invalid tone params to neutral', () => {
    expect(normalizeToneParams(undefined)).toEqual({
      userExposureEv: 0,
      userContrast: 0,
    })
    expect(
      normalizeToneParams({
        userExposureEv: Number.NaN,
        userContrast: Infinity,
      }),
    ).toEqual({
      userExposureEv: 0,
      userContrast: 0,
    })
  })

  it('clamps tone params to the public editing range', () => {
    expect(
      normalizeToneParams({ userExposureEv: 12, userContrast: -180 }),
    ).toEqual({
      userExposureEv: 5,
      userContrast: -100,
    })
  })

  it('maps exposure stops and contrast amount to bounded factors', () => {
    expect(userExposureMultiplierFromEv(1)).toBe(2)
    expect(userExposureMultiplierFromEv(-1)).toBe(0.5)
    expect(contrastFactorFromAmount(-100)).toBeCloseTo(Math.SQRT1_2, 12)
    expect(contrastFactorFromAmount(0)).toBe(1)
    expect(contrastFactorFromAmount(100)).toBeCloseTo(Math.SQRT2, 12)
  })

  it('keeps exposure as pure gain without clipping negative channels', () => {
    expectRgbClose(applyUserExposureRgb([-0.25, 0.5, 2], 2), [-0.5, 1, 4])
  })

  it('writes exposure into a caller-owned RGB tuple', () => {
    const out: [number, number, number] = [Number.NaN, Number.NaN, Number.NaN]

    expect(applyUserExposureRgbInto([-0.25, 0.5, 2], 2, out)).toBe(out)
    expectRgbClose(out, [-0.5, 1, 4])
  })

  it('keeps neutral contrast as exact passthrough including negative channels', () => {
    const tone = resolveToneParams({ userExposureEv: 0, userContrast: 0 })
    expectRgbClose(applyUserContrastRgb([-0.25, 0.5, 2], tone), [-0.25, 0.5, 2])
  })

  it('clips negative channels only at non-neutral contrast entry', () => {
    const tone = resolveToneParams({ userExposureEv: 0, userContrast: 50 })
    expectRgbClose(applyUserContrastRgb([-0.1, -0.2, -0.3], tone), [0, 0, 0])
  })

  it('writes contrast into a caller-owned RGB tuple', () => {
    const tone = resolveToneParams({ userExposureEv: 0, userContrast: 50 })
    const out: [number, number, number] = [Number.NaN, Number.NaN, Number.NaN]

    expect(applyUserContrastRgbInto([0.32, 0.16, 0.08], tone, out)).toBe(out)
    expectRgbClose(out, applyUserContrastRgb([0.32, 0.16, 0.08], tone))
  })

  it('leaves black and 18 percent luminance stable under contrast', () => {
    const tone = resolveToneParams({ userExposureEv: 0, userContrast: 100 })
    expectRgbClose(applyUserContrastRgb([0, 0, 0], tone), [0, 0, 0])
    expectRgbClose(
      applyUserContrastRgb([0.18, 0.18, 0.18], tone),
      [0.18, 0.18, 0.18],
    )
  })

  it.each([1e-8, 1e-6, 1e-4])(
    'keeps near-black positive luminance continuous for Y=%s',
    (y) => {
      const lift = resolveToneParams({ userExposureEv: 0, userContrast: -100 })
      const crush = resolveToneParams({ userExposureEv: 0, userContrast: 100 })
      const lifted = applyUserContrastRgb([y, y, y], lift)
      const crushed = applyUserContrastRgb([y, y, y], crush)

      expect(lifted[0]).toBeGreaterThan(y)
      expect(crushed[0]).toBeLessThan(y)
      expect(lifted[0]).toBeGreaterThan(EPS)
      expect(crushed[0]).toBeGreaterThanOrEqual(0)
    },
  )

  it('preserves positive RGB ratios before downstream gamut and output clipping', () => {
    const tone = resolveToneParams({ userExposureEv: 0, userContrast: 60 })
    const actual = applyUserContrastRgb([0.32, 0.16, 0.08], tone)

    expect(actual[0] / actual[1]).toBeCloseTo(2, 12)
    expect(actual[1] / actual[2]).toBeCloseTo(2, 12)
  })

  it('applies user tone as exposure then contrast', () => {
    const tone = resolveToneParams({ userExposureEv: 1, userContrast: 60 })
    const rgb = [0.12, 0.24, 0.48] as const
    const exposed = applyUserExposureRgb(rgb, tone.userExposureMultiplier)

    expectRgbClose(
      applyUserToneRgb(rgb, tone),
      applyUserContrastRgb(exposed, tone),
    )
  })

  it('writes full user tone into a caller-owned RGB tuple', () => {
    const tone = resolveToneParams({ userExposureEv: 1, userContrast: 60 })
    const rgb = [0.12, 0.24, 0.48] as const
    const out: [number, number, number] = [Number.NaN, Number.NaN, Number.NaN]

    expect(applyUserToneRgbInto(rgb, tone, out)).toBe(out)
    expectRgbClose(out, applyUserToneRgb(rgb, tone))
  })

  it.each([
    ['saturated red', [1, 0, 0] as const],
    ['saturated green', [0, 1, 0] as const],
    ['saturated blue', [0, 0, 1] as const],
    ['sky blue', [0.22, 0.48, 0.95] as const],
    ['skin tone', [0.78, 0.46, 0.32] as const],
    ['foliage', [0.18, 0.42, 0.12] as const],
    ['cyan', [0, 1, 1] as const],
    ['magenta', [1, 0, 1] as const],
    ['neon', [0.1, 1.2, 0.75] as const],
  ])('keeps %s finite and ratio-stable', (_label, sample) => {
    const tone = resolveToneParams({ userExposureEv: 0, userContrast: 50 })
    const actual = applyUserContrastRgb(sample, tone)
    expect(actual.every(Number.isFinite)).toBe(true)
    for (let channel = 0; channel < 3; channel += 1) {
      if (sample[channel] > 0) {
        expect(actual[channel]).toBeGreaterThan(0)
      }
    }
  })
})
