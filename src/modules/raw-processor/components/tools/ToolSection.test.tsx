import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ToolSection } from './ToolSection'

describe('toolSection', () => {
  it('renders the eyebrow before the title with the eyebrow class', () => {
    render(
      <ToolSection title="Tone" eyebrow="Basic">
        <p>body</p>
      </ToolSection>,
    )

    const eyebrow = screen.getByText('Basic')
    const title = screen.getByRole('heading', { name: 'Tone' })

    expect(eyebrow).toHaveClass('raw-tool-eyebrow')
    // eyebrow appears before the title in DOM order
    expect(
      eyebrow.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('omits the eyebrow when not provided', () => {
    render(
      <ToolSection title="Histogram">
        <p>body</p>
      </ToolSection>,
    )
    expect(document.querySelector('.raw-tool-eyebrow')).toBeNull()
  })
})
