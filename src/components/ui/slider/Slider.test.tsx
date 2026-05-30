import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Slider } from './Slider'

describe('slider', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      vi.fn().mockImplementation(() => ({
        observe: vi.fn(),
        unobserve: vi.fn(),
        disconnect: vi.fn(),
      })),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses muted styling hooks when disabled', () => {
    render(
      <Slider
        value={[0]}
        min={-100}
        max={100}
        disabled
        thumbAriaLabel="Exposure"
      />,
    )

    const thumb = screen.getByRole('slider', { name: 'Exposure' })
    const root = thumb.closest('[data-slot="slider-root"]')
    expect(root).toHaveClass('data-[disabled]:opacity-70')
    expect(root?.querySelector('[data-slot="slider-track"]')).toHaveClass(
      'group-data-[disabled]:bg-[oklch(from_var(--color-lf-on-surface)_l_c_h_/_0.06)]',
    )
    expect(root?.querySelector('[data-slot="slider-range"]')).toHaveClass(
      'group-data-[disabled]:bg-[oklch(from_var(--color-lf-on-surface)_l_c_h_/_0.15)]',
    )
    expect(thumb).toHaveClass('data-[disabled]:bg-lf-surface-sunk')
  })
})
