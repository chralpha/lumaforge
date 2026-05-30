import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import * as glContext from '~/lib/gl/context'

import { useCapabilityGate } from './useCapabilityGate'

describe('useCapabilityGate', () => {
  afterEach(() => vi.restoreAllMocks())

  it('reports gpu preview when capable + COI', () => {
    vi.spyOn(glContext, 'detectCapabilities').mockReturnValue({
      webgl2: true,
      toneHighPrecision: true,
    } as glContext.WebGLCapabilities)
    vi.stubGlobal('crossOriginIsolated', true)
    const { result } = renderHook(() => useCapabilityGate())
    expect(result.current).toMatchObject({
      supportStatus: 'supported',
      previewMode: 'gpu',
    })
    vi.unstubAllGlobals()
  })

  it('degrades to cpu preview when precision is low but COI present', () => {
    vi.spyOn(glContext, 'detectCapabilities').mockReturnValue({
      webgl2: true,
      toneHighPrecision: false,
    } as glContext.WebGLCapabilities)
    vi.stubGlobal('crossOriginIsolated', true)
    const { result } = renderHook(() => useCapabilityGate())
    expect(result.current).toMatchObject({
      supportStatus: 'degraded',
      previewMode: 'cpu',
      reason: 'tone-float-precision-low',
    })
    vi.unstubAllGlobals()
  })

  it('stays unsupported when COI missing', () => {
    vi.spyOn(glContext, 'detectCapabilities').mockReturnValue({
      webgl2: false,
      toneHighPrecision: false,
    } as glContext.WebGLCapabilities)
    vi.stubGlobal('crossOriginIsolated', false)
    const { result } = renderHook(() => useCapabilityGate())
    expect(result.current).toMatchObject({
      supportStatus: 'unsupported',
      previewMode: null,
    })
    vi.unstubAllGlobals()
  })
})
