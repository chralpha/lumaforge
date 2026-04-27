import { describe, expect, it } from 'vitest'

import {
  acesccDecode,
  acesccEncode,
  acescctDecode,
  acescctEncode,
  bt709Decode,
  bt709Encode,
  canonLog2Decode,
  canonLog2Encode,
  canonLog3Decode,
  canonLog3Encode,
  gamma24Decode,
  gamma24Encode,
  getLogDecoder,
  getLogEncoder,
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
    'bt709',
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

  it('returns no-op encode and decode helpers for linear aliases', () => {
    for (const alias of ['Linear', 'linear']) {
      expect(getLogEncoder(alias)(0.42)).toBe(0.42)
      expect(getLogDecoder(alias)(0.42)).toBe(0.42)
      expect(LOG_FUNCTIONS[alias].encode(0.18)).toBe(0.18)
      expect(LOG_FUNCTIONS[alias].decode(0.18)).toBe(0.18)
    }
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

  it('matches every registered transfer reference point through encode and decode', () => {
    for (const transfer of Object.values(TRANSFER_FUNCTIONS)) {
      for (const reference of transfer.referencePoints) {
        expect(
          transfer.encode(reference.linear),
          `${transfer.id} encode ${reference.label}`,
        ).toBeCloseTo(reference.encoded, 2)
        expect(
          transfer.decode(reference.encoded),
          `${transfer.id} decode ${reference.label}`,
        ).toBeCloseTo(reference.linear, 2)
      }
    }
  })
})

describe('canon log transfer functions', () => {
  it('matches Canon Log 2 reference points', () => {
    expect(canonLog2Encode(0)).toBeCloseTo(0.092864125, 8)
    expect(canonLog2Decode(0.092864125)).toBeCloseTo(0, 8)

    expect(canonLog2Encode(0.18)).toBeCloseTo(0.39825469203794917, 8)
    expect(canonLog2Decode(0.39825469203794917)).toBeCloseTo(0.18, 8)

    expect(canonLog2Encode(1)).toBeCloseTo(0.5732292786822207, 8)
    expect(canonLog2Decode(0.5732292786822207)).toBeCloseTo(1, 8)
  })

  it('keeps Canon Log 2 continuous around black', () => {
    const black = 0.092864125

    expect(canonLog2Encode(-1e-8)).toBeCloseTo(black, 6)
    expect(canonLog2Encode(0)).toBeCloseTo(black, 8)
    expect(canonLog2Encode(1e-8)).toBeCloseTo(black, 6)

    expect(canonLog2Decode(black - 1e-8)).toBeCloseTo(0, 6)
    expect(canonLog2Decode(black)).toBeCloseTo(0, 8)
    expect(canonLog2Decode(black + 1e-8)).toBeCloseTo(0, 6)
  })

  it('matches Canon Log 3 reference points and branch cuts', () => {
    expect(canonLog3Encode(0)).toBeCloseTo(0.12512219, 8)
    expect(canonLog3Decode(0.12512219)).toBeCloseTo(0, 8)

    expect(canonLog3Encode(0.18)).toBeCloseTo(0.3433893703739356, 8)
    expect(canonLog3Decode(0.3433893703739356)).toBeCloseTo(0.18, 8)

    expect(canonLog3Encode(1)).toBeCloseTo(0.5802777942163708, 8)
    expect(canonLog3Decode(0.5802777942163708)).toBeCloseTo(1, 8)

    expect(canonLog3Encode(-0.0126)).toBeCloseTo(0.0974654728, 8)
    expect(canonLog3Decode(0.0974654728)).toBeCloseTo(-0.0126, 8)
    expect(canonLog3Encode(0.0126)).toBeCloseTo(0.1527789072, 8)
    expect(canonLog3Decode(0.1527789072)).toBeCloseTo(0.0126, 8)
  })

  it('keeps Canon Log 3 continuous around both branch cuts', () => {
    const lowLinearCut = -0.0126
    const lowEncodedCut = 0.0974654728
    const highLinearCut = 0.0126
    const highEncodedCut = 0.1527789072

    for (const offset of [-1e-8, 0, 1e-8]) {
      expect(canonLog3Encode(lowLinearCut + offset)).toBeCloseTo(
        lowEncodedCut,
        6,
      )
      expect(canonLog3Encode(highLinearCut + offset)).toBeCloseTo(
        highEncodedCut,
        6,
      )
      expect(canonLog3Decode(lowEncodedCut + offset)).toBeCloseTo(
        lowLinearCut,
        6,
      )
      expect(canonLog3Decode(highEncodedCut + offset)).toBeCloseTo(
        highLinearCut,
        6,
      )
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

  it('encodes and decodes BT.709 display transfer separately from sRGB and gamma 2.4', () => {
    expect(bt709Encode(0)).toBe(0)
    expect(bt709Encode(0.018)).toBeCloseTo(0.081, 6)
    expect(bt709Decode(0.081)).toBeCloseTo(0.018, 6)
    expect(bt709Decode(bt709Encode(0.18))).toBeCloseTo(0.18, 6)
    expect(bt709Encode(0.18)).not.toBeCloseTo(srgbEncode(0.18), 4)
    expect(bt709Encode(0.18)).not.toBeCloseTo(gamma24Encode(0.18), 4)
  })
})
