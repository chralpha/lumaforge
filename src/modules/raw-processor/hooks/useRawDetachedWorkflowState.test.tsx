import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { parseCubeLUT } from '~/lib/lut/cube-parser'

import { resetToDefaults } from '../state/workflow.atoms'
import { useRawDetachedWorkflowState } from './useRawDetachedWorkflowState'

describe('useRawDetachedWorkflowState', () => {
  it('exposes pre-session params and LUT state through one hook', () => {
    resetToDefaults()
    const lut = parseCubeLUT(
      [
        'TITLE "Client Look"',
        'LUT_3D_SIZE 2',
        '0 0 0',
        '1 0 0',
        '0 1 0',
        '1 1 0',
        '0 0 1',
        '1 0 1',
        '0 1 1',
        '1 1 1',
      ].join('\n'),
      { sourceName: 'look.cube' },
    )

    const { result } = renderHook(() => useRawDetachedWorkflowState())

    expect(result.current.baseParams.styleKind).toBe('none')
    expect(result.current.lut).toBeNull()

    act(() => {
      result.current.setParams((prev) => ({
        ...prev,
        styleKind: 'custom',
      }))
      result.current.setLut(lut)
    })

    expect(result.current.baseParams.styleKind).toBe('custom')
    expect(result.current.lut).toBe(lut)
  })
})
