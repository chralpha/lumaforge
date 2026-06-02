import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AdjustListPanel } from './AdjustListPanel'
import { COLOR_NEUTRAL } from './color-fields'
import { TONE_NEUTRAL } from './tone-fields'

describe('adjustListPanel', () => {
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

  function renderPanel(
    overrides: Partial<React.ComponentProps<typeof AdjustListPanel>> = {},
  ) {
    const props = {
      tone: { ...TONE_NEUTRAL, userContrast: 10 },
      color: { ...COLOR_NEUTRAL, userTemperature: 24 },
      onToneChange: vi.fn(),
      onColorChange: vi.fn(),
      onToneReset: vi.fn(),
      onColorReset: vi.fn(),
      onScrubChange: vi.fn(),
      ...overrides,
    }
    render(<AdjustListPanel {...props} />)
    return props
  }

  it('starts on Tone and shows the six tone sliders + segment reset button', () => {
    renderPanel()
    expect(
      screen.getByRole('group', { name: /tone sliders/i }),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('slider')).toHaveLength(6)
    // Tabs row + ghost reset are the new low-chrome chrome — both must keep
    // the 44px mobile touch target without leaning on a dark scrim chip.
    expect(screen.getByRole('tablist', { name: /adjust/i })).toHaveClass(
      'min-h-11',
    )
    expect(screen.getByRole('button', { name: /reset tone/i })).toHaveClass(
      'min-h-11',
      'min-w-11',
    )
    expect(screen.getByRole('button', { name: /reset tone/i })).toBeEnabled()
    // The active tab carries the amber underline indicator; the chrome row
    // wears a single hairline divider instead of a free-floating dark chip.
    const toneTab = screen.getByRole('tab', { name: /^tone$/i })
    expect(toneTab).toHaveAttribute('aria-selected', 'true')
    expect(toneTab.querySelector('span[aria-hidden="true"]')).toHaveClass(
      'bg-lf-amber',
    )
    expect(document.querySelector('[data-adjust-section-chrome]')).toHaveClass(
      'border-b',
      'border-lf-on-photo-bord-soft',
    )
  })

  it('switches to Color and shows the two color sliders', async () => {
    renderPanel()
    await userEvent.click(screen.getByRole('tab', { name: /color/i }))
    expect(
      screen.getByRole('group', { name: /color sliders/i }),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('slider')).toHaveLength(2)
    expect(screen.getByRole('button', { name: /reset color/i })).toBeEnabled()
  })

  it('disables the section reset when the active section is neutral', async () => {
    renderPanel({ tone: TONE_NEUTRAL, color: COLOR_NEUTRAL })
    expect(screen.getByRole('button', { name: /reset tone/i })).toBeDisabled()
    await userEvent.click(screen.getByRole('tab', { name: /color/i }))
    expect(screen.getByRole('button', { name: /reset color/i })).toBeDisabled()
  })

  it('section reset calls the section-scoped handler only', async () => {
    const props = renderPanel()
    await userEvent.click(screen.getByRole('button', { name: /reset tone/i }))
    expect(props.onToneReset).toHaveBeenCalledTimes(1)
    expect(props.onColorReset).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('tab', { name: /color/i }))
    await userEvent.click(screen.getByRole('button', { name: /reset color/i }))
    expect(props.onColorReset).toHaveBeenCalledTimes(1)
  })

  it('child scrub events bubble out with the section kind', () => {
    const props = renderPanel()
    const exposureRow = screen
      .getByRole('slider', { name: 'Exposure' })
      .closest('[data-testid="adjust-slider-row-scrub"]')!
    fireEvent.pointerDown(exposureRow)
    expect(props.onScrubChange).toHaveBeenLastCalledWith({
      kind: 'tone',
      key: 'userExposureEv',
    })
    fireEvent.pointerUp(exposureRow)
    expect(props.onScrubChange).toHaveBeenLastCalledWith(null)
  })

  it('clears any in-flight scrub when the segment is switched', async () => {
    const onScrubChange = vi.fn()
    renderPanel({ onScrubChange })
    const exposureRow = screen
      .getByRole('slider', { name: 'Exposure' })
      .closest('[data-testid="adjust-slider-row-scrub"]')!
    fireEvent.pointerDown(exposureRow)
    onScrubChange.mockClear()
    await userEvent.click(screen.getByRole('tab', { name: /color/i }))
    expect(onScrubChange).toHaveBeenCalledWith(null)
  })

  it('recedes the segment+reset row when scrubbing is true', () => {
    const { container, rerender } = render(
      <AdjustListPanel
        tone={TONE_NEUTRAL}
        color={COLOR_NEUTRAL}
        onToneChange={vi.fn()}
        onColorChange={vi.fn()}
        onToneReset={vi.fn()}
        onColorReset={vi.fn()}
        onScrubChange={vi.fn()}
      />,
    )
    const chrome = container.querySelector('[data-adjust-section-chrome]')!
    expect(chrome).not.toHaveClass('opacity-25')

    rerender(
      <AdjustListPanel
        tone={TONE_NEUTRAL}
        color={COLOR_NEUTRAL}
        onToneChange={vi.fn()}
        onColorChange={vi.fn()}
        onToneReset={vi.fn()}
        onColorReset={vi.fn()}
        onScrubChange={vi.fn()}
        scrubbing
      />,
    )
    expect(chrome).toHaveClass('opacity-25')
    expect(
      container.querySelector('[role="region"][data-scrubbing="true"]'),
    ).toBeInTheDocument()
  })
})
