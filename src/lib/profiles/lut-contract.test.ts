import { describe, expect, it } from 'vitest'

import { mapProfileLUTContract } from './lut-contract'

describe('online LUT trusted contract mapping', () => {
  it('maps combined-look-output intent to a complete output contract', () => {
    const result = mapProfileLUTContract({
      intent: 'combined-look-output',
      input: { gamut: 'arri-wide-gamut-3', transfer: 'logc3' },
      output: { gamut: 'rec709', transfer: 'gamma24' },
    })

    expect(result).toEqual({
      ok: true,
      value: {
        role: 'combined-look-output',
        inputGamut: 'arri-wide-gamut-3',
        inputTransfer: 'logc3',
        inputRange: 'full',
        outputGamut: 'srgb-rec709',
        outputTransfer: 'gamma24',
        outputRange: 'full',
      },
    })
  })

  it.each([
    ['display-look', 'display-look'],
    ['technical-output', 'technical-output'],
    ['scene-creative', 'scene-creative'],
  ] as const)('maps %s intent to the same role', (intent, role) => {
    const result = mapProfileLUTContract({
      intent,
      input: { gamut: 'rec709', transfer: 'srgb' },
      output: { gamut: 'rec709', transfer: 'gamma24' },
    })

    expect(result).toMatchObject({ ok: true, value: { role } })
  })

  it('accepts flat R2 display-look metadata without output for display-like input', () => {
    const result = mapProfileLUTContract({
      intent: 'display-look',
      inputGamut: 'rec709',
      inputTransfer: 'srgb',
    })

    expect(result).toEqual({
      ok: true,
      value: {
        role: 'display-look',
        inputGamut: 'srgb-rec709',
        inputTransfer: 'srgb',
        inputRange: 'full',
        outputGamut: undefined,
        outputTransfer: undefined,
        outputRange: undefined,
      },
    })
  })

  it('rejects flat R2 display-look metadata without output for camera log input', () => {
    const result = mapProfileLUTContract({
      intent: 'display-look',
      inputGamut: 'arri-wide-gamut-3',
      inputTransfer: 'arri-logc3',
    })

    expect(result).toMatchObject({
      ok: false,
      issues: [{ code: 'unsupported-contract' }],
    })
  })

  it('maps legacy look intent to combined-look-output with output metadata', () => {
    const result = mapProfileLUTContract({
      intent: 'look',
      input: { gamut: 'arri-wide-gamut-3', transfer: 'logc3' },
      output: { gamut: 'rec709', transfer: 'gamma24', range: 'legal' },
    })

    expect(result).toMatchObject({
      ok: true,
      value: {
        role: 'combined-look-output',
        outputGamut: 'srgb-rec709',
        outputTransfer: 'gamma24',
        outputRange: 'legal',
      },
    })
  })

  it('maps flat R2 look metadata to combined-look-output when output fields are present', () => {
    const result = mapProfileLUTContract({
      inputTransfer: 'arri-logc3',
      inputGamut: 'arri-wide-gamut-3',
      outputTransfer: 'srgb',
      outputGamut: 'rec709',
      intent: 'look',
    })

    expect(result).toEqual({
      ok: true,
      value: {
        role: 'combined-look-output',
        inputGamut: 'arri-wide-gamut-3',
        inputTransfer: 'logc3',
        inputRange: 'full',
        outputGamut: 'srgb-rec709',
        outputTransfer: 'srgb',
        outputRange: 'full',
      },
    })
  })

  it('maps legacy look intent to scene-creative without output metadata and fails closed', () => {
    const result = mapProfileLUTContract({
      intent: 'look',
      input: { gamut: 'arri-wide-gamut-3', transfer: 'logc3' },
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.map((issue) => issue.code)).toContain(
        'unsupported-contract',
      )
    }
  })

  it.each(['monitoring', 'calibration', 'unknown', undefined] as const)(
    'rejects unsupported intent %s with a typed issue',
    (intent) => {
      const result = mapProfileLUTContract({
        intent,
        input: { gamut: 'rec709', transfer: 'srgb' },
        output: { gamut: 'rec709', transfer: 'gamma24' },
      })

      expect(result).toMatchObject({
        ok: false,
        issues: [{ code: 'unsupported-contract' }],
      })
    },
  )

  it('rejects unknown gamut or transfer values', () => {
    const result = mapProfileLUTContract({
      intent: 'combined-look-output',
      input: { gamut: 'not-a-gamut', transfer: 'logc3' },
      output: { gamut: 'rec709', transfer: 'not-a-transfer' },
    })

    expect(result).toMatchObject({
      ok: false,
      issues: [
        { code: 'unsupported-contract' },
        { code: 'unsupported-contract' },
      ],
    })
  })
})
