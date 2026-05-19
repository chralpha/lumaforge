import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const indexHtml = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')

describe('raw route bootstrap paint', () => {
  it('paints /raw with a darkroom substrate before the app bundle mounts', () => {
    expect(indexHtml).toContain('dataset.lumaRoute')
    expect(indexHtml).toContain('luma-route-raw')
    expect(indexHtml).toContain("meta[name='theme-color']")
    expect(indexHtml).toContain('#1d1914')
    expect(indexHtml).toContain('oklch(0.16 0.02 76)')
  })
})
