import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { MobileModeDock } from './MobileModeDock'

describe('mobileModeDock', () => {
  it('renders five mode tabs and switches mode', async () => {
    const onModeChange = vi.fn()
    const onOpenMore = vi.fn()
    render(
      <MobileModeDock
        mode="tone"
        onModeChange={onModeChange}
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
})
