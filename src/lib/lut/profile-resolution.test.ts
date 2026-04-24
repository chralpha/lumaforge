import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  getStoredLUTProfileSelection,
  resolveLUTProfile,
  storeLUTProfileSelection,
} from './cube-parser'

describe('lUT profile selection persistence', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('stores valid user profile selections by fingerprint', () => {
    const stored = storeLUTProfileSelection(
      'lut-fingerprint-1',
      'sony-sgamut3cine-slog3',
    )

    expect(stored?.id).toBe('sony-sgamut3cine-slog3')
    expect(getStoredLUTProfileSelection('lut-fingerprint-1')?.id).toBe(
      'sony-sgamut3cine-slog3',
    )
  })

  it('uses a stored fingerprint selection before filename inference', () => {
    storeLUTProfileSelection('lut-fingerprint-2', 'sony-sgamut3cine-slog3')

    expect(
      resolveLUTProfile({
        title: 'LUMIXPHOTOSTYLE VLOG',
        sourceName: 'Panasonic_VLog.cube',
        comments: [],
        fingerprint: 'lut-fingerprint-2',
      }),
    ).toMatchObject({
      kind: 'resolved',
      confidence: 'user',
      profile: { id: 'sony-sgamut3cine-slog3' },
    })
  })
})
