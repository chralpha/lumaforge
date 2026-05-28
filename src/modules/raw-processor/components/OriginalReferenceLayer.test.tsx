import { render } from '@testing-library/react'

import { OriginalReferenceLayer } from './OriginalReferenceLayer'

describe('originalReferenceLayer', () => {
  it('renders a non-interactive original reference image', () => {
    render(
      <OriginalReferenceLayer
        snapshot={{
          key: 'snapshot-a',
          objectUrl: 'blob:original-a',
          width: 100,
          height: 50,
          source: 'quick',
          mimeType: 'image/jpeg',
          estimatedBytes: 10,
        }}
      />,
    )

    const image = document.querySelector('.raw-preview-original-image')

    expect(image).toBeInstanceOf(HTMLImageElement)
    expect(image.parentElement).toHaveAttribute(
      'data-original-reference-source',
      'quick',
    )
    expect(image).toHaveAttribute('src', 'blob:original-a')
    expect(image).toHaveAttribute('aria-hidden', 'true')
    expect(image).not.toHaveAttribute('role')
    expect(image).toHaveClass('raw-preview-original-image')
  })
})
