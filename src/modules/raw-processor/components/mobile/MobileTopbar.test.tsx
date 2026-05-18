import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { MobileTopbar } from './MobileTopbar'

describe('mobileTopbar', () => {
  it('shows the file title and toggles the histogram (no file-details dupe)', async () => {
    const onToggleHistogram = vi.fn()
    render(
      <MobileTopbar
        hasImage
        fileName="DSC09142.ARW"
        fileMeta="Sony α7 IV · 47.8 MB"
        supportLevel="official"
        histogramShown={false}
        onToggleHistogram={onToggleHistogram}
        moreMenuItems={[]}
      />,
    )
    expect(
      screen.getByRole('heading', { name: 'DSC09142.ARW' }),
    ).toBeInTheDocument()
    // The standalone topbar control is the histogram toggle, not a second
    // "File details" entry point (that lives only in the More menu).
    expect(
      screen.queryByRole('button', { name: /file details/i }),
    ).not.toBeInTheDocument()
    const toggle = screen.getByRole('button', { name: /show histogram/i })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(toggle)
    expect(onToggleHistogram).toHaveBeenCalledTimes(1)
  })

  it('reflects the histogram-shown state on the toggle', () => {
    render(
      <MobileTopbar
        hasImage
        fileName="DSC09142.ARW"
        fileMeta="Sony α7 IV"
        supportLevel="official"
        histogramShown
        onToggleHistogram={vi.fn()}
        moreMenuItems={[]}
      />,
    )
    const toggle = screen.getByRole('button', { name: /hide histogram/i })
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
  })

  it('opens the more menu and invokes an item', async () => {
    const onSelect = vi.fn()
    render(
      <MobileTopbar
        hasImage
        fileName="DSC09142.ARW"
        fileMeta="Sony α7 IV"
        supportLevel="experimental"
        histogramShown={false}
        onToggleHistogram={vi.fn()}
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
