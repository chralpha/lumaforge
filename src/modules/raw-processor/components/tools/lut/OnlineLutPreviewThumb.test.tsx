import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { OnlineLUTPreviewAsset } from '~/lib/profiles/catalog'

import { OnlineLutPreviewThumb } from './OnlineLutPreviewThumb'

const preview: OnlineLUTPreviewAsset = {
  url: 'https://profiles.example.com/previews/kodak-2383-rec709.webp',
  mediaType: 'image/webp',
}

describe('onlineLutPreviewThumb', () => {
  it('renders the remote preview image when an asset is provided', () => {
    const { container } = render(
      <OnlineLutPreviewThumb preview={preview} size="row" />,
    )

    const image = container.querySelector('[data-raw-lut-preview="image"]')
    expect(image).toHaveAttribute('src', preview.url)
    expect(image).toHaveAttribute('loading', 'lazy')
    expect(
      container.querySelector('[data-raw-lut-preview="placeholder"]'),
    ).toBeNull()
  })

  it('renders a neutral placeholder when no preview asset exists', () => {
    const { container } = render(<OnlineLutPreviewThumb size="row" />)

    expect(
      container.querySelector('[data-raw-lut-preview="placeholder"]'),
    ).not.toBeNull()
    // The placeholder must not reuse the green/amber status hues.
    expect(container.innerHTML).not.toMatch(/bg-lf-(green|amber)/)
  })

  it('falls back to the placeholder when the remote image fails to load', () => {
    const { container } = render(
      <OnlineLutPreviewThumb preview={preview} size="row" />,
    )

    const image = container.querySelector('[data-raw-lut-preview="image"]')!
    fireEvent.error(image)

    expect(container.querySelector('[data-raw-lut-preview="image"]')).toBeNull()
    expect(
      container.querySelector('[data-raw-lut-preview="placeholder"]'),
    ).not.toBeNull()
  })

  it('uses the on-photo surface family on mobile', () => {
    const { container } = render(
      <OnlineLutPreviewThumb size="mobile" surface="mobile" />,
    )

    const frame = container.querySelector('[data-raw-lut-preview-frame]')
    expect(frame?.className).toMatch(/border-lf-on-photo-bord-soft/)
    expect(frame?.className).not.toMatch(/border-lf-hairline/)
  })
})
