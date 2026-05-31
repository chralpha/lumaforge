import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AdjustSliderRow } from './AdjustSliderRow'

describe('adjustSliderRow', () => {
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

  function renderRow(
    overrides: Partial<React.ComponentProps<typeof AdjustSliderRow>> = {},
  ) {
    const props = {
      label: 'Contrast',
      value: 0,
      min: -100,
      max: 100,
      step: 1,
      formatValue: (v: number) => `${v > 0 ? '+' : ''}${v}`,
      resetAriaLabel: 'Reset Contrast',
      onChange: vi.fn(),
      onScrubChange: vi.fn(),
      ...overrides,
    }
    render(<AdjustSliderRow {...props} />)
    return props
  }

  it('renders the label, slider wired with field metadata, and value', () => {
    renderRow({ value: 12 })
    const thumb = screen.getByRole('slider', { name: 'Contrast' })
    expect(thumb).toHaveAttribute('aria-valuemin', '-100')
    expect(thumb).toHaveAttribute('aria-valuemax', '100')
    expect(thumb).toHaveAttribute('aria-valuenow', '12')
    expect(screen.getByText('+12')).toBeInTheDocument()
    expect(screen.getByText('Contrast')).toBeInTheDocument()
  })

  it('renders the value as plain text when neutral', () => {
    renderRow({ value: 0 })
    expect(screen.queryByRole('button', { name: /reset contrast/i })).toBeNull()
    expect(screen.getByText('0')).toBeInTheDocument()
  })

  it('exposes a reset button when dirty and emits onChange(0)', async () => {
    const props = renderRow({ value: -42 })
    const resetButton = screen.getByRole('button', { name: /reset contrast/i })
    expect(resetButton).toHaveTextContent('-42')
    await userEvent.click(resetButton)
    expect(props.onChange).toHaveBeenCalledWith(0)
  })

  it('emits onScrubChange on pointerdown and pointerup over the slider track', () => {
    const props = renderRow({ value: 12 })
    const scrubTarget = screen.getByTestId('adjust-slider-row-scrub')
    fireEvent.pointerDown(scrubTarget)
    expect(props.onScrubChange).toHaveBeenLastCalledWith(true)
    fireEvent.pointerUp(scrubTarget)
    expect(props.onScrubChange).toHaveBeenLastCalledWith(false)
  })

  it('also clears scrub state on pointercancel', () => {
    const props = renderRow({ value: 12 })
    const scrubTarget = screen.getByTestId('adjust-slider-row-scrub')
    fireEvent.pointerDown(scrubTarget)
    fireEvent.pointerCancel(scrubTarget)
    expect(props.onScrubChange).toHaveBeenLastCalledWith(false)
  })

  it('exposes active-scrub and sibling-scrubbing data attributes', () => {
    const { container, rerender } = render(
      <AdjustSliderRow
        label="Contrast"
        value={0}
        min={-100}
        max={100}
        step={1}
        formatValue={(v) => `${v}`}
        resetAriaLabel="Reset Contrast"
        onChange={vi.fn()}
        onScrubChange={vi.fn()}
      />,
    )
    const root = container.querySelector('[data-adjust-slider-row]')!
    expect(root).not.toHaveAttribute('data-active-scrub')
    expect(root).not.toHaveAttribute('data-sibling-scrubbing')

    rerender(
      <AdjustSliderRow
        label="Contrast"
        value={0}
        min={-100}
        max={100}
        step={1}
        formatValue={(v) => `${v}`}
        resetAriaLabel="Reset Contrast"
        activeScrub
        onChange={vi.fn()}
        onScrubChange={vi.fn()}
      />,
    )
    expect(root).toHaveAttribute('data-active-scrub', 'true')
    expect(root).not.toHaveAttribute('data-sibling-scrubbing')

    rerender(
      <AdjustSliderRow
        label="Contrast"
        value={0}
        min={-100}
        max={100}
        step={1}
        formatValue={(v) => `${v}`}
        resetAriaLabel="Reset Contrast"
        siblingScrubbing
        onChange={vi.fn()}
        onScrubChange={vi.fn()}
      />,
    )
    expect(root).not.toHaveAttribute('data-active-scrub')
    expect(root).toHaveAttribute('data-sibling-scrubbing', 'true')
  })
})
