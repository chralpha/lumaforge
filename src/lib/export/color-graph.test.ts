import { describe, expect, it } from 'vitest'

import { getLUTColorProfile } from '~/lib/color/registry'

import { resolveExportColorGraph } from './color-graph'

describe('resolveExportColorGraph', () => {
  it('resolves no-lut export to linear ProPhoto then sRGB output', () => {
    const graph = resolveExportColorGraph({
      styleKind: 'none',
      intensity: 0.7,
      builtinPreset: null,
      lut: null,
    })

    expect(graph.supported).toBe(true)
    if (!graph.supported) {
      throw new Error('Expected supported graph')
    }
    expect(graph.outputGamut).toBe('srgb-rec709')
    expect(graph.outputTransfer).toBe('srgb')
    expect(graph.steps.map((step) => step.kind)).toEqual([
      'input-linear-prophoto',
      'output-srgb',
    ])
  })

  it('resolves scene creative LUTs with explicit input gamut and transfer', () => {
    const profile = getLUTColorProfile('sony-sgamut3cine-slog3')
    expect(profile).toBeDefined()

    const graph = resolveExportColorGraph({
      styleKind: 'custom',
      intensity: 0.7,
      builtinPreset: null,
      lut: {
        size: 2,
        data: new Float32Array(24),
        domainMin: [0, 0, 0],
        domainMax: [1, 1, 1],
        inputProfile: 'v-log',
        profileResolution: {
          kind: 'resolved',
          confidence: 'user',
          profile: profile!,
        },
      },
    })

    expect(graph.supported).toBe(true)
    if (!graph.supported) {
      throw new Error('Expected supported graph')
    }
    expect(graph.outputGamut).toBe('srgb-rec709')
    expect(graph.outputTransfer).toBe('srgb')
    expect(graph.steps.map((step) => step.kind)).toEqual([
      'input-linear-prophoto',
      'gamut-to-lut-input',
      'encode-lut-transfer',
      'lut3d',
      'lut-output-to-srgb',
      'output-srgb',
    ])
  })

  it('fails closed for unresolved LUT profiles', () => {
    const graph = resolveExportColorGraph({
      styleKind: 'custom',
      intensity: 0.7,
      builtinPreset: null,
      lut: {
        size: 2,
        data: new Float32Array(24),
        domainMin: [0, 0, 0],
        domainMax: [1, 1, 1],
        inputProfile: 'display-srgb',
        profileResolution: {
          kind: 'needs-user-selection',
          suggestions: [],
        },
      },
    })

    expect(graph.supported).toBe(false)
    if (graph.supported) {
      throw new Error('Expected unsupported graph')
    }
    expect(graph.reason).toBe('unsupported-pipeline')
    expect(graph.message).toBe(
      'Choose a LUT input profile before full-resolution export.',
    )
    expect(graph.steps).toEqual([])
  })
})
