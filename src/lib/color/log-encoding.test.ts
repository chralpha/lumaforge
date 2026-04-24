import { describe, expect, it } from 'vitest'

import { logC4Decode, logC4Encode } from './log-encoding'

describe('arri LogC4 transfer functions', () => {
  it('matches ARRI LogC4 reference conversion points', () => {
    expect(logC4Encode(0)).toBeCloseTo(95 / 1023, 6)
    expect(logC4Encode(0.18)).toBeCloseTo(0.2783958365482653, 6)
    expect(logC4Encode(469.8)).toBeCloseTo(1, 6)

    expect(logC4Decode(0)).toBeCloseTo(-0.01805699611991131, 6)
    expect(logC4Decode(95 / 1023)).toBeCloseTo(0, 6)
    expect(logC4Decode(1)).toBeCloseTo(469.8, 6)
  })
})
