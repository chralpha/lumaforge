import { render, screen } from '@testing-library/react'

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

    const image = screen.getByRole('img', { hidden: true })
    expect(image).toHaveAttribute('src', 'blob:original-a')
    expect(image).toHaveAttribute('aria-hidden', 'true')
    expect(image).toHaveClass('raw-preview-original-image')
  })
})
