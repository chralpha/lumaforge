import { describe, expect, it } from 'vitest'

import {
  normalizeSaturationParams,
  resolveSaturationParams,
  USER_SATURATION_MAX,
  USER_SATURATION_MIN,
  USER_VIBRANCE_MAX,
  USER_VIBRANCE_MIN,
} from './saturation'

describe('saturation', () => {
  describe('normalizeSaturationParams', () => {
    it('defaults missing input to identity', () => {
      expect(normalizeSaturationParams()).toEqual({
        userSaturation: 0,
        userVibrance: 0,
      })
      expect(normalizeSaturationParams(null)).toEqual({
        userSaturation: 0,
        userVibrance: 0,
      })
      expect(normalizeSaturationParams({})).toEqual({
        userSaturation: 0,
        userVibrance: 0,
      })
    })

    it('clamps out-of-range values', () => {
      expect(
        normalizeSaturationParams({ userSaturation: 200, userVibrance: -300 }),
      ).toEqual({ userSaturation: 100, userVibrance: -100 })
    })

    it('replaces non-finite with zero', () => {
      expect(
        normalizeSaturationParams({
          userSaturation: Number.NaN,
          userVibrance: Number.POSITIVE_INFINITY,
        }),
      ).toEqual({ userSaturation: 0, userVibrance: 0 })
    })

    it('passes through valid values', () => {
      expect(
        normalizeSaturationParams({ userSaturation: -50, userVibrance: 75 }),
      ).toEqual({ userSaturation: -50, userVibrance: 75 })
    })
  })

  describe('resolveSaturationParams', () => {
    it('marks identity when both are zero', () => {
      const resolved = resolveSaturationParams({
        userSaturation: 0,
        userVibrance: 0,
      })
      expect(resolved.isIdentity).toBe(true)
      expect(resolved.saturation).toBe(0)
      expect(resolved.vibrance).toBe(0)
    })

    it('marks non-identity when saturation is non-zero', () => {
      const resolved = resolveSaturationParams({
        userSaturation: 50,
        userVibrance: 0,
      })
      expect(resolved.isIdentity).toBe(false)
    })

    it('marks non-identity when vibrance is non-zero', () => {
      const resolved = resolveSaturationParams({
        userSaturation: 0,
        userVibrance: -30,
      })
      expect(resolved.isIdentity).toBe(false)
    })
  })

  it('exports range constants', () => {
    expect(USER_SATURATION_MIN).toBe(-100)
    expect(USER_SATURATION_MAX).toBe(100)
    expect(USER_VIBRANCE_MIN).toBe(-100)
    expect(USER_VIBRANCE_MAX).toBe(100)
  })
})
