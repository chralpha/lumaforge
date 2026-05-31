import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { COLOR_NEUTRAL } from './color-fields'
import { ColorStripPanel } from './ColorStripPanel'

describe('colorStripPanel', () => {
  it('renders color pills and picks a field on tap', async () => {
    const onPick = vi.fn()
    render(
      <ColorStripPanel
        color={{ ...COLOR_NEUTRAL, userTemperature: 24 }}
        focusKey={null}
        onPickField={onPick}
        onReset={vi.fn()}
      />,
    )
    const pills = screen.getAllByRole('tab')
    expect(pills).toHaveLength(2)
    expect(screen.getByText('TEMP')).toBeInTheDocument()
    expect(screen.getByText('TINT')).toBeInTheDocument()
    expect(screen.getByText('+24')).toBeInTheDocument()
    await userEvent.click(pills[0])
    expect(onPick).toHaveBeenCalledWith('userTemperature')
  })

  it('disables reset when neutral and scopes reset to color', async () => {
    const onReset = vi.fn()
    const { rerender } = render(
      <ColorStripPanel
        color={COLOR_NEUTRAL}
        focusKey={null}
        onPickField={vi.fn()}
        onReset={onReset}
      />,
    )
    expect(screen.getByRole('button', { name: /reset color/i })).toBeDisabled()

    rerender(
      <ColorStripPanel
        color={{ ...COLOR_NEUTRAL, userTint: -18 }}
        focusKey={null}
        onPickField={vi.fn()}
        onReset={onReset}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /reset color/i }))
    expect(onReset).toHaveBeenCalledTimes(1)
  })

  it('keeps color pills wide enough for TEMP and TINT', () => {
    render(
      <ColorStripPanel
        color={{ ...COLOR_NEUTRAL, userTemperature: 1 }}
        focusKey="userTemperature"
        onPickField={vi.fn()}
        onReset={vi.fn()}
      />,
    )
    expect(screen.getByRole('tab', { name: /temp/i })).toHaveClass(
      'min-w-[84px]',
    )
  })
})
