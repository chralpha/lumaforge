import { describe, expect, it } from 'vitest'

import type {ProfileSourceResource} from './source-url';
import {
  classifyProfileSourceUrl,
  createLUTResourceShareUrl,
  normalizeProfileSourceUrl,
  parseLUTResourceQuery
} from './source-url'

describe('profile source URLs', () => {
  it('classifies online profile source resources', () => {
    expect(
      classifyProfileSourceUrl(
        'https://profiles.example.com/channels/stable/catalog.json',
      ),
    ).toBe('catalog')
    expect(
      classifyProfileSourceUrl(
        'https://profiles.example.com/releases/v2026.05.01/catalog.json',
      ),
    ).toBe('catalog')
    expect(
      classifyProfileSourceUrl('https://example.com/lumaforge-profiles.json'),
    ).toBe('catalog')
    expect(
      classifyProfileSourceUrl(
        'https://profiles.example.com/releases/v2026.05.01/entries/org.example.lut.look.json',
      ),
    ).toBe('entry')
    expect(
      classifyProfileSourceUrl(
        'https://example.com/profiles/kodak-2383/manifest.json',
      ),
    ).toBe('entry')
    expect(
      classifyProfileSourceUrl('https://example.com/kodak-2383.cube'),
    ).toBe('cube')
  })

  it('accepts localhost HTTP URLs for local development', () => {
    expect(normalizeProfileSourceUrl('http://localhost:4173/test.cube')).toBe(
      'http://localhost:4173/test.cube',
    )
    expect(classifyProfileSourceUrl('http://localhost:4173/test.cube')).toBe(
      'cube',
    )
  })

  it('rejects unsupported schemes', () => {
    expect(
      parseLUTResourceQuery('?luts=ftp%3A%2F%2Fexample.com%2Ftest.cube')
        .issues[0]?.code,
    ).toBe('unsupported-scheme')
    expect(
      parseLUTResourceQuery('?luts=javascript%3Aalert(1)').issues[0]?.code,
    ).toBe('unsupported-scheme')
    expect(
      parseLUTResourceQuery('?luts=file%3A%2F%2F%2Ftmp%2Ftest.cube').issues[0]
        ?.code,
    ).toBe('unsupported-scheme')
  })

  it('rejects credentialed URLs', () => {
    expect(
      parseLUTResourceQuery(
        '?luts=https%3A%2F%2Fuser%3Apass%40example.com%2Ftest.cube',
      ).issues[0]?.code,
    ).toBe('credentialed-url')
  })

  it('parses repeated luts query params in order and dedupes by normalized URL', () => {
    const result = parseLUTResourceQuery(
      '?luts=https%3A%2F%2Fexample.com%2Flumaforge-profiles.json&luts=https%3A%2F%2Fexample.com%2Fk.cube&luts=https%3A%2F%2Fexample.com%2Fk.cube',
    )

    expect(result.issues).toHaveLength(0)
    expect(result.resources).toHaveLength(2)
    expect(result.resources.map((resource) => resource.type)).toEqual([
      'catalog',
      'cube',
    ])
    expect(result.resources.map((resource) => resource.url)).toEqual([
      'https://example.com/lumaforge-profiles.json',
      'https://example.com/k.cube',
    ])
  })

  it('preserves source URL inner query params', () => {
    const result = parseLUTResourceQuery(
      '?luts=https%3A%2F%2Fcdn.example.com%2Fmanifest.json%3Fv%3D2',
    )

    expect(result.resources[0]?.url).toBe(
      'https://cdn.example.com/manifest.json?v=2',
    )
  })

  it('preserves source URL hash fragments', () => {
    const result = parseLUTResourceQuery(
      '?luts=https%3A%2F%2Fcdn.example.com%2Flook.cube%3Fv%3D2%23film',
    )

    expect(result.resources[0]?.url).toBe(
      'https://cdn.example.com/look.cube?v=2#film',
    )
  })

  it('creates share URLs with only stable luts params', () => {
    const resources: ProfileSourceResource[] = [
      {
        id: 'second',
        url: 'https://example.com/lumaforge-profiles.json',
        type: 'catalog',
        label: 'LumaForge profiles',
        fromQuery: true,
      },
    ]

    expect(createLUTResourceShareUrl('/raw?image=local', resources)).toBe(
      '/raw?luts=https%3A%2F%2Fexample.com%2Flumaforge-profiles.json',
    )
  })
})
