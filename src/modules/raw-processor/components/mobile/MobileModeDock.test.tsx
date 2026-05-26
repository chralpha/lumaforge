import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { MobileModeDock } from './MobileModeDock'

describe('mobileModeDock', () => {
  it('renders the handoff mode tabs and switches mode when expanded', async () => {
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
    expect(tabs).toHaveLength(4)
    expect(screen.queryByRole('tab', { name: /more/i })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('tab', { name: /strength/i }),
    ).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: /look/i }))
    expect(onModeChange).toHaveBeenCalledWith('look')
    await userEvent.click(screen.getByRole('tab', { name: /compare/i }))
    expect(onModeChange).toHaveBeenCalledWith('compare')
    expect(onOpenMore).not.toHaveBeenCalled()
  })

  it('keeps the bottom dock close to the visible mobile viewport edge', () => {
    render(
      <MobileModeDock
        mode="export"
        expanded
        onModeChange={vi.fn()}
        onCollapse={vi.fn()}
        onOpenMore={vi.fn()}
        canExport
        panel={<div>export-panel</div>}
      />,
    )

    const tablist = screen.getByRole('tablist', { name: /lab modes/i })
    const dock = tablist.parentElement

    expect(dock).toHaveClass(
      'pb-[max(8px,calc(env(safe-area-inset-bottom)-24px))]',
    )
    expect(dock).not.toHaveClass('pb-safe-offset-3')
    expect(tablist).toHaveClass('pb-2')
    expect(tablist).not.toHaveClass('pb-3')
  })

  it('keeps export in the same compact panel frame as the other tools', () => {
    const { rerender } = render(
      <MobileModeDock
        mode="export"
        expanded
        onModeChange={vi.fn()}
        onCollapse={vi.fn()}
        onOpenMore={vi.fn()}
        canExport
        panel={<div data-testid="panel">export-panel</div>}
      />,
    )

    expect(screen.getByTestId('panel').parentElement).toHaveClass(
      'max-h-[24vh]',
    )
    expect(screen.getByTestId('panel').parentElement).toHaveClass(
      'overflow-y-auto',
    )

    rerender(
      <MobileModeDock
        mode="tone"
        expanded
        onModeChange={vi.fn()}
        onCollapse={vi.fn()}
        onOpenMore={vi.fn()}
        canExport
        panel={<div data-testid="panel">tone-panel</div>}
      />,
    )

    expect(screen.getByTestId('panel').parentElement).toHaveClass(
      'max-h-[24vh]',
    )
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

  it('reads no tab as active while collapsed, only when expanded', () => {
    const common = {
      mode: 'tone' as const,
      onModeChange: vi.fn(),
      onCollapse: vi.fn(),
      onOpenMore: vi.fn(),
      canExport: true,
      panel: <div>x</div>,
    }
    const { rerender } = render(<MobileModeDock {...common} expanded={false} />)
    expect(
      screen.queryByRole('tab', { selected: true }),
    ).not.toBeInTheDocument()

    rerender(<MobileModeDock {...common} expanded />)
    expect(screen.getByRole('tab', { selected: true })).toHaveAccessibleName(
      /tone/i,
    )
  })
})
