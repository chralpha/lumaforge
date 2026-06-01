import { getLUTColorProfile } from '@lumaforge/luma-color-runtime'
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { ParsedLUT } from '~/lib/lut/cube-parser'

import { useLutDataState } from './useLutDataState'

function createParsedLut(title: string): ParsedLUT {
  const profile = getLUTColorProfile('display-srgb')
  if (!profile) throw new Error('Missing display-srgb profile')

  return {
    title,
    comments: [],
    size: 2,
    domainMin: [0, 0, 0],
    domainMax: [1, 1, 1],
    data: new Float32Array(24),
    fingerprint: `${title}-fingerprint`,
    inputProfile: 'display-srgb',
    profileResolution: {
      kind: 'confirmed',
      confidence: 'metadata',
      profile,
    },
  }
}

describe('useLutDataState', () => {
  it('keeps LUT pipeline data and version in sync with the parsed LUT', async () => {
    const { result, rerender } = renderHook(
      ({ lut }: { lut: ParsedLUT | null }) => useLutDataState(lut),
      {
        initialProps: {
          lut: createParsedLut('Kodak 2383'),
        } as { lut: ParsedLUT | null },
      },
    )

    await waitFor(() => expect(result.current.lutDataVersion).toBe(1))
    expect(result.current.lutDataRef.current?.title).toBe('Kodak 2383')

    rerender({ lut: null })

    await waitFor(() => expect(result.current.lutDataVersion).toBe(2))
    expect(result.current.lutDataRef.current).toBeNull()
  })

  it('allows LUT services to replace data through the shared setter', () => {
    const parsedLut = createParsedLut('Manual')
    const { result } = renderHook(() => useLutDataState(null))
    const versionBeforeManualUpdate = result.current.lutDataVersion

    act(() => {
      result.current.setLutDataRef({
        size: parsedLut.size,
        data: parsedLut.data,
        domainMin: parsedLut.domainMin,
        domainMax: parsedLut.domainMax,
        title: parsedLut.title,
        inputProfile: parsedLut.inputProfile,
        profileResolution: parsedLut.profileResolution,
      })
    })

    expect(result.current.lutDataRef.current?.title).toBe('Manual')
    expect(result.current.lutDataVersion).toBe(versionBeforeManualUpdate + 1)
  })
})
