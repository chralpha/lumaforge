import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { MobileModeDock } from './MobileModeDock'

describe('mobileModeDock', () => {
  it('renders five mode tabs and switches mode when expanded', async () => {
    const onModeChange = vi.fn()
    const onOpenMore = vi.fn()
    render(
      <MobileModeDock
        mode="tone"
        expanded
        onModeChange={onModeChange}
        onCollapse={vi.fn()}
        onOpenMore={onOpenMore}
        canExport={false}
        panel={<div data-testid="panel">tone-panel</div>}
      />,
    )
    expect(screen.getByTestId('panel')).toHaveTextContent('tone-panel')
    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(5)
    await userEvent.click(screen.getByRole('tab', { name: /look/i }))
    expect(onModeChange).toHaveBeenCalledWith('look')
    await userEvent.click(screen.getByRole('tab', { name: /more/i }))
    expect(onOpenMore).toHaveBeenCalled()
  })

  it('hides the panel when collapsed and toggles on tab tap', async () => {
    const onModeChange = vi.fn()
    const onCollapse = vi.fn()
    const { rerender } = render(
      <MobileModeDock
        mode="tone"
        expanded={false}
        onModeChange={onModeChange}
        onCollapse={onCollapse}
        onOpenMore={vi.fn()}
        canExport
        panel={<div data-testid="p">x</div>}
      />,
    )
    expect(screen.queryByTestId('p')).toBeNull()
    await userEvent.click(screen.getByRole('tab', { name: /tone/i }))
    expect(onModeChange).toHaveBeenCalledWith('tone')

    rerender(
      <MobileModeDock
        mode="tone"
        expanded
        onModeChange={onModeChange}
        onCollapse={onCollapse}
        onOpenMore={vi.fn()}
        canExport
        panel={<div data-testid="p">x</div>}
      />,
    )
    expect(screen.getByTestId('p')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: /tone/i }))
    expect(onCollapse).toHaveBeenCalled()
  })
})
