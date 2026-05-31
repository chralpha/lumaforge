import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { COLOR_NEUTRAL } from './color-fields'
import { ColorFocusEditor } from './ColorFocusEditor'

describe('colorFocusEditor', () => {
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
      <ColorFocusEditor
        color={{ ...COLOR_NEUTRAL, userTemperature: 24 }}
        focusKey="userTemperature"
        onChange={onChange}
        onPickField={onPick}
        onCancel={onCancel}
        onDone={onDone}
        onDragChange={vi.fn()}
      />,
    )
    expect(screen.getAllByText('+24')).toHaveLength(2)
    await userEvent.click(screen.getByRole('tab', { name: /tint/i }))
    expect(onPick).toHaveBeenCalledWith('userTint')
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: /done/i }))
    expect(onDone).toHaveBeenCalled()
  })

  it('resets the focused color param to neutral', async () => {
    const onChange = vi.fn()
    render(
      <ColorFocusEditor
        color={{ ...COLOR_NEUTRAL, userTint: -30 }}
        focusKey="userTint"
        onChange={onChange}
        onPickField={vi.fn()}
        onCancel={vi.fn()}
        onDone={vi.fn()}
        onDragChange={vi.fn()}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /neutral/i }))
    expect(onChange).toHaveBeenCalledWith({ userTint: 0 })
  })

  it('uses color-specific focus data attributes and sibling aria', () => {
    const { container } = render(
      <ColorFocusEditor
        color={{ ...COLOR_NEUTRAL, userTemperature: 24 }}
        focusKey="userTemperature"
        onChange={vi.fn()}
        onPickField={vi.fn()}
        onCancel={vi.fn()}
        onDone={vi.fn()}
        onDragChange={vi.fn()}
      />,
    )
    expect(container.querySelector('[data-color-focus]')).toBeInTheDocument()
    expect(
      container.querySelector('[data-color-focus-panel]'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('tablist', { name: /other color parameters/i }),
    ).toBeInTheDocument()
  })
})
