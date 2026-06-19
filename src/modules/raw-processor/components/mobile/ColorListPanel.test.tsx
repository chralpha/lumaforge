import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { COLOR_NEUTRAL } from '../color-fields'
import { ColorListPanel } from './ColorListPanel'

describe('colorListPanel', () => {
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

  it('renders Temperature, Tint, Saturation, Vibrance with current values', () => {
    render(
      <ColorListPanel
        color={{ ...COLOR_NEUTRAL, userTemperature: 24, userTint: -12 }}
        onChange={vi.fn()}
        onScrubChange={vi.fn()}
      />,
    )
    const sliders = screen.getAllByRole('slider')
    expect(sliders).toHaveLength(4)
    expect(sliders.map((s) => s.getAttribute('aria-label'))).toEqual([
      'Temperature',
      'Tint',
      'Saturation',
      'Vibrance',
    ])
    expect(screen.getByText('+24')).toBeInTheDocument()
    expect(screen.getByText('-12')).toBeInTheDocument()
  })

  it('per-field reset emits a single-key patch', async () => {
    const onChange = vi.fn()
    render(
      <ColorListPanel
        color={{ ...COLOR_NEUTRAL, userTint: -18 }}
        onChange={onChange}
        onScrubChange={vi.fn()}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /reset tint/i }))
    expect(onChange).toHaveBeenCalledWith({ userTint: 0 })
  })

  it('forwards scrub state with the originating field key', () => {
    const onScrubChange = vi.fn()
    render(
      <ColorListPanel
        color={{ ...COLOR_NEUTRAL, userTemperature: 10 }}
        onChange={vi.fn()}
        onScrubChange={onScrubChange}
      />,
    )
    const tempRow = screen
      .getByRole('slider', { name: 'Temperature' })
      .closest('[data-testid="adjust-slider-row-scrub"]')!
    fireEvent.pointerDown(tempRow)
    expect(onScrubChange).toHaveBeenLastCalledWith({ key: 'userTemperature' })
    fireEvent.pointerUp(tempRow)
    expect(onScrubChange).toHaveBeenLastCalledWith(null)
  })

  it('flags the active row and recedes the sibling while scrubbing', () => {
    const { container } = render(
      <ColorListPanel
        color={COLOR_NEUTRAL}
        onChange={vi.fn()}
        onScrubChange={vi.fn()}
      />,
    )
    const tintScrub = container
      .querySelectorAll('[data-adjust-slider-row]')[1]
      .querySelector('[data-testid="adjust-slider-row-scrub"]')!
    fireEvent.pointerDown(tintScrub)
    const rows = container.querySelectorAll('[data-adjust-slider-row]')
    expect(rows[1]).toHaveAttribute('data-active-scrub', 'true')
    expect(rows[0]).toHaveAttribute('data-sibling-scrubbing', 'true')
    fireEvent.pointerUp(tintScrub)
    for (const row of rows) {
      expect(row).not.toHaveAttribute('data-active-scrub')
      expect(row).not.toHaveAttribute('data-sibling-scrubbing')
    }
  })
})
