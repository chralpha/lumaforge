import { describe, expect, it } from 'vitest'

import {
  COLOR_NEUTRAL,
  formatColorValue,
  formatColorValueShort,
  isColorNeutral,
  MOBILE_COLOR_FIELDS,
} from './color-fields'

describe('mobile color fields', () => {
  it('exposes temperature and tint fields matching ColorTool bounds', () => {
    expect(MOBILE_COLOR_FIELDS.map((f) => f.key)).toEqual([
      'userTemperature',
      'userTint',
    ])

    for (const field of MOBILE_COLOR_FIELDS) {
      expect([field.min, field.max, field.step]).toEqual([-100, 100, 1])
    }
  })

  it('formats color values as signed integers', () => {
    expect(formatColorValue('userTemperature', 24.4)).toBe('+24')
    expect(formatColorValue('userTint', -12.6)).toBe('-13')
    expect(formatColorValueShort('userTemperature', 0)).toBe('0')
  })

  it('detects neutral temperature and tint', () => {
    expect(COLOR_NEUTRAL).toEqual({ userTemperature: 0, userTint: 0 })
    expect(isColorNeutral(COLOR_NEUTRAL)).toBe(true)
    expect(isColorNeutral({ ...COLOR_NEUTRAL, userTemperature: 1 })).toBe(false)
    expect(isColorNeutral({ ...COLOR_NEUTRAL, userTint: -1 })).toBe(false)
  })
})
