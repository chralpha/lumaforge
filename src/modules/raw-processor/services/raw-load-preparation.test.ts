import type { ProcessingParams } from '@lumaforge/luma-color-runtime'
import { describe, expect, it } from 'vitest'

import { parseCubeLUT } from '~/lib/lut/cube-parser'

import type { StyleAsset } from '../model/session'
import { prepareRawLoadState } from './raw-load-preparation'

function createParams(
  overrides: Partial<ProcessingParams> = {},
): ProcessingParams {
  return {
    intensity: 0.7,
    viewMode: 'processed',
    compareSplit: 0.5,
    styleKind: 'builtin',
    builtinPreset: 'warm',
    userExposureEv: 1,
    userContrast: 50,
    userHighlights: -40,
    userShadows: 40,
    userWhites: -20,
    userBlacks: 20,
    ...overrides,
  }
}

function makeCube(title: string) {
  return [
    `TITLE "${title}"`,
    'LUT_3D_SIZE 2',
    '0 0 0',
    '1 0 0',
    '0 1 0',
    '1 1 0',
    '0 0 1',
    '1 0 1',
    '0 1 1',
    '1 1 1',
  ].join('\n')
}

function createActiveStyle(overrides: Partial<StyleAsset> = {}): StyleAsset {
  return {
    kind: 'custom',
    name: 'Previous LUT',
    defaultIntensityLevel: 'standard',
    currentIntensityLevel: 'strong',
    lutAsset: {
      format: 'cube',
      dimension: 17,
      title: 'Previous LUT',
    },
    ...overrides,
  }
}

describe('raw load preparation', () => {
  it('prepares neutral load state while preserving tone params outside the returned patch', () => {
    const prepared = prepareRawLoadState({
      params: createParams({ compareSplit: 2 }),
      lut: null,
      activeStyle: createActiveStyle(),
    })

    expect(prepared.compareSplit).toBe(1)
    expect(prepared.retainedSessionState).toEqual({
      activeStyle: null,
      lutProfileSelection: undefined,
    })
    expect(prepared.processingParamsPatch).toEqual({
      intensity: 0.7,
      viewMode: 'compare',
      compareSplit: 1,
      styleKind: 'none',
      builtinPreset: null,
    })
    expect(prepared.processingParamsPatch).not.toHaveProperty('userExposureEv')
    expect(prepared.processingParamsPatch).not.toHaveProperty('userContrast')
    expect(prepared.processingParamsPatch).not.toHaveProperty('userHighlights')
    expect(prepared.processingParamsPatch).not.toHaveProperty('userShadows')
    expect(prepared.processingParamsPatch).not.toHaveProperty('userWhites')
    expect(prepared.processingParamsPatch).not.toHaveProperty('userBlacks')
  })

  it('carries detached LUT state into a new RAW session with default custom intensity', () => {
    const lut = parseCubeLUT(makeCube('Client LUT'), {
      sourceName: 'client.cube',
    })

    const prepared = prepareRawLoadState({
      params: createParams({ compareSplit: 0.8 }),
      lut,
      activeStyle: null,
    })

    expect(prepared.compareSplit).toBe(0.8)
    expect(prepared.retainedSessionState.activeStyle).toMatchObject({
      kind: 'custom',
      name: 'Client LUT',
      currentIntensityLevel: 'standard',
    })
    expect(prepared.retainedSessionState.lutProfileSelection).toEqual({
      status: 'pending',
      fingerprint: lut.fingerprint,
      title: 'Client LUT',
      sourceName: 'client.cube',
      recommendations: [],
    })
    expect(prepared.processingParamsPatch).toMatchObject({
      intensity: 0.7,
      viewMode: 'compare',
      compareSplit: 0.8,
      styleKind: 'custom',
      builtinPreset: null,
    })
  })

  it('preserves active custom intensity when replacing a RAW with a custom LUT loaded', () => {
    const lut = parseCubeLUT(makeCube('Client LUT'))

    const prepared = prepareRawLoadState({
      params: createParams(),
      lut,
      activeStyle: createActiveStyle({ currentIntensityLevel: 'strong' }),
    })

    expect(prepared.retainedSessionState.activeStyle).toMatchObject({
      kind: 'custom',
      currentIntensityLevel: 'strong',
    })
    expect(prepared.processingParamsPatch.intensity).toBe(1)
  })

  it('does not preserve builtin intensity as custom LUT intensity', () => {
    const lut = parseCubeLUT(makeCube('Client LUT'))

    const prepared = prepareRawLoadState({
      params: createParams(),
      lut,
      activeStyle: createActiveStyle({
        kind: 'builtin',
        currentIntensityLevel: 'light',
        lutAsset: undefined,
      }),
    })

    expect(prepared.retainedSessionState.activeStyle).toMatchObject({
      kind: 'custom',
      currentIntensityLevel: 'standard',
    })
    expect(prepared.processingParamsPatch.intensity).toBe(0.7)
  })
})
