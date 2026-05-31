import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { AdjustStripPanel } from './AdjustStripPanel'
import { COLOR_NEUTRAL } from './color-fields'
import { TONE_NEUTRAL } from './tone-fields'

describe('adjustStripPanel', () => {
  it('starts on Tone and switches to Color', async () => {
    render(
      <AdjustStripPanel
        tone={{ ...TONE_NEUTRAL, userContrast: 10 }}
        color={{ ...COLOR_NEUTRAL, userTemperature: 24 }}
        toneFocusKey={null}
        colorFocusKey={null}
        onPickToneField={vi.fn()}
        onPickColorField={vi.fn()}
        onToneReset={vi.fn()}
        onColorReset={vi.fn()}
      />,
    )

    expect(
      screen.getByRole('tablist', { name: /tone parameters/i }),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: /color/i }))
    expect(
      screen.getByRole('tablist', { name: /color parameters/i }),
    ).toBeInTheDocument()
    expect(screen.getByText('TEMP')).toBeInTheDocument()
    expect(screen.getByText('TINT')).toBeInTheDocument()
  })

  it('keeps pick and reset behavior scoped to the active panel', async () => {
    const onPickTone = vi.fn()
    const onPickColor = vi.fn()
    const onToneReset = vi.fn()
    const onColorReset = vi.fn()
    render(
      <AdjustStripPanel
        tone={{ ...TONE_NEUTRAL, userContrast: 10 }}
        color={{ ...COLOR_NEUTRAL, userTint: -12 }}
        toneFocusKey={null}
        colorFocusKey={null}
        onPickToneField={onPickTone}
        onPickColorField={onPickColor}
        onToneReset={onToneReset}
        onColorReset={onColorReset}
      />,
    )

    const toneStrip = screen.getByRole('tablist', { name: /tone parameters/i })
    await userEvent.click(within(toneStrip).getByRole('tab', { name: /con/i }))
    await userEvent.click(screen.getByRole('button', { name: /reset tone/i }))
    expect(onPickTone).toHaveBeenCalledWith('userContrast')
    expect(onToneReset).toHaveBeenCalledTimes(1)
    expect(onPickColor).not.toHaveBeenCalled()
    expect(onColorReset).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('tab', { name: /color/i }))
    const colorStrip = screen.getByRole('tablist', {
      name: /color parameters/i,
    })
    await userEvent.click(
      within(colorStrip).getByRole('tab', { name: /tint/i }),
    )
    await userEvent.click(screen.getByRole('button', { name: /reset color/i }))
    expect(onPickColor).toHaveBeenCalledWith('userTint')
    expect(onColorReset).toHaveBeenCalledTimes(1)
  })
})
