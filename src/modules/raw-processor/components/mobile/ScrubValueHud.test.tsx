import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { COLOR_NEUTRAL } from './color-fields'
import { ScrubValueHud } from './ScrubValueHud'
import { TONE_NEUTRAL } from './tone-fields'

describe('scrubValueHud', () => {
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

  it('renders nothing when no field is scrubbing', () => {
    const { container } = render(
      <ScrubValueHud field={null} tone={TONE_NEUTRAL} color={COLOR_NEUTRAL} />,
    )
    expect(container.querySelector('[data-scrub-value-hud]')).toBeNull()
  })

  it('renders the live tone value with the localized label when scrubbing a tone field', () => {
    render(
      <ScrubValueHud
        field={{ kind: 'tone', key: 'userExposureEv' }}
        tone={{ ...TONE_NEUTRAL, userExposureEv: 1.25 }}
        color={COLOR_NEUTRAL}
      />,
    )
    const hud = screen.getByLabelText(/adjustment readout/i)
    expect(hud).toBeInTheDocument()
    expect(hud).toHaveTextContent(/exposure/i)
    expect(hud).toHaveTextContent('+1.25')
    expect(hud).toHaveAttribute('data-scrub-value-hud')
  })

  it('renders the live color value when scrubbing a color field', () => {
    render(
      <ScrubValueHud
        field={{ kind: 'color', key: 'userTint' }}
        tone={TONE_NEUTRAL}
        color={{ ...COLOR_NEUTRAL, userTint: -18 }}
      />,
    )
    const hud = screen.getByLabelText(/adjustment readout/i)
    expect(hud).toHaveTextContent(/tint/i)
    expect(hud).toHaveTextContent('-18')
  })

  it('is non-interactive (does not capture pointer events over the preview)', () => {
    render(
      <ScrubValueHud
        field={{ kind: 'tone', key: 'userContrast' }}
        tone={{ ...TONE_NEUTRAL, userContrast: 12 }}
        color={COLOR_NEUTRAL}
      />,
    )
    expect(screen.getByLabelText(/adjustment readout/i)).toHaveClass(
      'pointer-events-none',
    )
  })
})
