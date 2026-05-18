import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TONE_NEUTRAL } from './tone-fields'
import { ToneFocusEditor } from './ToneFocusEditor'

describe('toneFocusEditor', () => {
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
  it('shows the readout, switches sibling, cancels and commits', async () => {
    const onChange = vi.fn()
    const onPick = vi.fn()
    const onCancel = vi.fn()
    const onDone = vi.fn()
    render(
      <ToneFocusEditor
        tone={{ ...TONE_NEUTRAL, userExposureEv: 2 }}
        focusKey="userExposureEv"
        onChange={onChange}
        onPickField={onPick}
        onCancel={onCancel}
        onDone={onDone}
        onDragChange={vi.fn()}
      />,
    )
    expect(screen.getByText('+2.00')).toBeInTheDocument()
    expect(screen.getByText('EV')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: /contrast/i }))
    expect(onPick).toHaveBeenCalledWith('userContrast')
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: /done/i }))
    expect(onDone).toHaveBeenCalled()
  })

  it('resets the focused param to neutral', async () => {
    const onChange = vi.fn()
    render(
      <ToneFocusEditor
        tone={{ ...TONE_NEUTRAL, userContrast: 30 }}
        focusKey="userContrast"
        onChange={onChange}
        onPickField={vi.fn()}
        onCancel={vi.fn()}
        onDone={vi.fn()}
        onDragChange={vi.fn()}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /neutral/i }))
    expect(onChange).toHaveBeenCalledWith({ userContrast: 0 })
  })
})
