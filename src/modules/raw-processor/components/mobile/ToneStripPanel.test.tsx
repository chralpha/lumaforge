import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { TONE_NEUTRAL } from './tone-fields'
import { ToneStripPanel } from './ToneStripPanel'

describe('toneStripPanel', () => {
  it('renders six pills and picks a field on tap', async () => {
    const onPick = vi.fn()
    render(
      <ToneStripPanel
        tone={{ ...TONE_NEUTRAL, userExposureEv: 1.25 }}
        focusKey={null}
        onPickField={onPick}
        onReset={vi.fn()}
      />,
    )
    const pills = screen.getAllByRole('tab')
    expect(pills).toHaveLength(6)
    expect(screen.getByText('+1.25')).toBeInTheDocument()
    await userEvent.click(pills[0])
    expect(onPick).toHaveBeenCalledWith('userExposureEv')
  })

  it('disables reset when neutral', () => {
    render(
      <ToneStripPanel
        tone={TONE_NEUTRAL}
        focusKey={null}
        onPickField={vi.fn()}
        onReset={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: /reset tone/i })).toBeDisabled()
  })

  it('keeps reset at the mobile touch target size', () => {
    render(
      <ToneStripPanel
        tone={{ ...TONE_NEUTRAL, userExposureEv: 1.25 }}
        focusKey={null}
        onPickField={vi.fn()}
        onReset={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: /reset tone/i })).toHaveClass(
      'min-h-[44px]',
    )
  })
})
