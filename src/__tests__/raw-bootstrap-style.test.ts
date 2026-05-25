import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const indexHtml = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')
const inputSource = readFileSync(
  resolve(process.cwd(), 'src/components/ui/input/Input.tsx'),
  'utf8',
)

describe('raw route bootstrap paint', () => {
  it('paints /raw with a darkroom substrate before the app bundle mounts', () => {
    expect(indexHtml).toContain('dataset.lumaRoute')
    expect(indexHtml).toContain('luma-route-raw')
    expect(indexHtml).toContain("meta[name='theme-color']")
    expect(indexHtml).toContain('#1d1914')
    expect(indexHtml).toContain('oklch(0.16 0.02 76)')
  })

  it('renders a visible /raw boot shell inside the root before React mounts', () => {
    expect(indexHtml).toContain('data-lf-raw-boot')
    expect(indexHtml).toContain('data-lf-raw-boot-title')
    expect(indexHtml).toContain('Open a single RAW file')
    expect(indexHtml).toContain(
      'html:not(.luma-route-raw) #root > [data-lf-raw-boot]',
    )
    expect(indexHtml).toContain(
      'html.luma-route-raw #root > [data-lf-raw-boot]',
    )
  })

  it('keeps the /raw boot shell paint path simple and stable', () => {
    expect(indexHtml).not.toContain('radial-gradient')
    expect(indexHtml).not.toContain('clamp(')
  })

  it('keeps the first-paint input icon path off the full Remix icon barrel', () => {
    expect(inputSource).not.toContain('@remixicon/react')
  })
})
