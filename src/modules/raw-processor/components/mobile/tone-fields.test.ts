import { describe, expect, it } from 'vitest'

import {
  formatToneValue,
  formatToneValueShort,
  MOBILE_TONE_FIELDS,
} from './tone-fields'

describe('mobile tone fields', () => {
  it('exposes six fields matching ToneTool bounds', () => {
    expect(MOBILE_TONE_FIELDS.map((f) => f.key)).toEqual([
      'userExposureEv',
      'userContrast',
      'userHighlights',
      'userShadows',
      'userWhites',
      'userBlacks',
    ])
    const exp = MOBILE_TONE_FIELDS[0]
    expect([exp.min, exp.max, exp.step]).toEqual([-5, 5, 0.01])
    const con = MOBILE_TONE_FIELDS[1]
    expect([con.min, con.max, con.step]).toEqual([-100, 100, 1])
  })

  it('formats exposure with EV and sign', () => {
    expect(formatToneValue('userExposureEv', 1.5)).toBe('+1.50 EV')
    expect(formatToneValue('userExposureEv', -1.5)).toBe('-1.50 EV')
    expect(formatToneValueShort('userExposureEv', 0)).toBe('0.00')
  })

  it('formats integer fields with sign', () => {
    expect(formatToneValue('userContrast', 40)).toBe('+40')
    expect(formatToneValue('userContrast', 0)).toBe('0')
    expect(formatToneValueShort('userShadows', -12)).toBe('-12')
  })
})
