import { describe, expect, it } from 'vitest'

import {
  acesccDecode,
  acesccEncode,
  acescctDecode,
  acescctEncode,
  gamma24Decode,
  gamma24Encode,
  LOG_FUNCTIONS,
  log3G10Encode,
  logC4Decode,
  logC4Encode,
  srgbDecode,
  srgbEncode,
  TRANSFER_FUNCTIONS,
} from './log-encoding'

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

describe('transfer function registry', () => {
  const requiredTransferIds = [
    's-log2',
    's-log3',
    'canon-log',
    'canon-log2',
    'canon-log3',
    'n-log',
    'f-log',
    'f-log2',
    'f-log2c',
    'v-log',
    'logc3',
    'logc4',
    'log3g10',
    'acescc',
    'acescct',
    'srgb',
    'gamma24',
  ] as const

  it('exposes metadata, source URLs, and reference points for Tier 1 transfer functions', () => {
    for (const id of requiredTransferIds) {
      const transfer = TRANSFER_FUNCTIONS[id]

      expect(transfer, id).toBeDefined()
      expect(transfer.label.length, id).toBeGreaterThan(0)
      expect(transfer.source, id).toMatch(/^https:\/\//)
      expect(transfer.referencePoints.length, id).toBeGreaterThan(0)
    }
  })

  it('keeps F-Log2C as a metadata alias over the F-Log2 curve', () => {
    expect(TRANSFER_FUNCTIONS['f-log2c'].encode).toBe(
      TRANSFER_FUNCTIONS['f-log2'].encode,
    )
    expect(TRANSFER_FUNCTIONS['f-log2c'].decode).toBe(
      TRANSFER_FUNCTIONS['f-log2'].decode,
    )
    expect(LOG_FUNCTIONS['F-Log2C'].encode(0.18)).toBeCloseTo(
      LOG_FUNCTIONS['F-Log2'].encode(0.18),
      8,
    )
  })

  it('round trips practical scene-linear reference values for every Tier 1 transfer', () => {
    for (const id of requiredTransferIds) {
      const transfer = TRANSFER_FUNCTIONS[id]

      for (const linear of [0, 0.18, 1]) {
        const encoded = transfer.encode(linear)
        const decoded = transfer.decode(encoded)

        expect(Number.isFinite(encoded), `${id} encoded ${linear}`).toBe(true)
        expect(Number.isFinite(decoded), `${id} decoded ${linear}`).toBe(true)
        expect(decoded, `${id} round trip ${linear}`).toBeCloseTo(linear, 5)
      }
    }
  })
})

describe('display and ACES transfer functions', () => {
  it('matches RED Log3G10 middle gray placement', () => {
    expect(log3G10Encode(0.18)).toBeCloseTo(1 / 3, 5)
  })

  it('matches ACEScc and ACEScct reference gray encoding', () => {
    expect(acesccEncode(0.18)).toBeCloseTo(0.4135884, 6)
    expect(acesccDecode(0.4135884)).toBeCloseTo(0.18, 6)

    expect(acescctEncode(0)).toBeCloseTo(0.0729055, 6)
    expect(acescctEncode(0.18)).toBeCloseTo(0.4135884, 6)
    expect(acescctDecode(0.4135884)).toBeCloseTo(0.18, 6)
  })

  it('matches sRGB and gamma 2.4 transfer reference points', () => {
    expect(srgbEncode(0)).toBe(0)
    expect(srgbDecode(0)).toBe(0)
    expect(srgbEncode(0.0031308)).toBeCloseTo(0.04045, 5)
    expect(srgbDecode(0.04045)).toBeCloseTo(0.0031308, 5)

    expect(gamma24Encode(0.18)).toBeCloseTo(Math.pow(0.18, 1 / 2.4), 8)
    expect(gamma24Decode(gamma24Encode(0.18))).toBeCloseTo(0.18, 8)
  })
})
