import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { MobileTopbar } from './MobileTopbar'

describe('mobileTopbar', () => {
  it('shows the file title and opens the file details action', async () => {
    const onOpenInfo = vi.fn()
    render(
      <MobileTopbar
        hasImage
        fileName="DSC09142.ARW"
        fileMeta="Sony α7 IV · 47.8 MB"
        supportLevel="official"
        onOpenInfo={onOpenInfo}
        moreMenuItems={[]}
      />,
    )
    expect(
      screen.getByRole('heading', { name: 'DSC09142.ARW' }),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /file details/i }))
    expect(onOpenInfo).toHaveBeenCalledTimes(1)
  })

  it('opens the more menu and invokes an item', async () => {
    const onSelect = vi.fn()
    render(
      <MobileTopbar
        hasImage
        fileName="DSC09142.ARW"
        fileMeta="Sony α7 IV"
        supportLevel="experimental"
        onOpenInfo={vi.fn()}
        moreMenuItems={[
          {
            kind: 'item',
            icon: () => null,
            label: 'Replace RAW',
            onSelect,
          },
        ]}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /more actions/i }))
    await userEvent.click(
      await screen.findByRole('menuitem', { name: /replace raw/i }),
    )
    expect(onSelect).toHaveBeenCalledTimes(1)
  })
})
