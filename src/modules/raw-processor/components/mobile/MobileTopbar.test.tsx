import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { I18nProvider } from '~/lib/i18n'

import { MobileTopbar } from './MobileTopbar'

type MobileTopbarProps = React.ComponentProps<typeof MobileTopbar>

function renderMobileTopbar(props: MobileTopbarProps) {
  return render(
    <I18nProvider>
      <MobileTopbar {...props} />
    </I18nProvider>,
  )
}

describe('mobileTopbar', () => {
  afterEach(() => {
    localStorage.clear()
  })

  it('shows the file title and toggles the histogram (no file-details dupe)', async () => {
    const onToggleHistogram = vi.fn()
    renderMobileTopbar({
      hasImage: true,
      fileName: 'DSC09142.ARW',
      fileMeta: 'Sony α7 IV · 47.8 MB',
      supportLevel: 'official',
      histogramShown: false,
      onToggleHistogram,
      moreMenuItems: [],
    })
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
    renderMobileTopbar({
      hasImage: true,
      fileName: 'DSC09142.ARW',
      fileMeta: 'Sony α7 IV',
      supportLevel: 'official',
      histogramShown: true,
      onToggleHistogram: vi.fn(),
      moreMenuItems: [],
    })
    const toggle = screen.getByRole('button', { name: /hide histogram/i })
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
  })

  it('opens the more menu and invokes an item', async () => {
    const onSelect = vi.fn()
    renderMobileTopbar({
      hasImage: true,
      fileName: 'DSC09142.ARW',
      fileMeta: 'Sony α7 IV',
      supportLevel: 'experimental',
      histogramShown: false,
      onToggleHistogram: vi.fn(),
      moreMenuItems: [
        {
          kind: 'item',
          icon: () => null,
          label: 'Replace RAW',
          onSelect,
        },
      ],
    })
    await userEvent.click(screen.getByRole('button', { name: /more actions/i }))
    await userEvent.click(
      await screen.findByRole('menuitem', { name: /replace raw/i }),
    )
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('exposes the locale switch in the mobile raw topbar', async () => {
    localStorage.setItem('lumaforge.locale', 'zh-CN')
    renderMobileTopbar({
      hasImage: false,
      fileName: '',
      fileMeta: '',
      supportLevel: 'experimental',
      histogramShown: false,
      onToggleHistogram: vi.fn(),
      moreMenuItems: [],
    })

    const switchToEnglish = screen.getByRole('button', {
      name: 'Switch to English',
    })
    expect(switchToEnglish).toHaveTextContent('EN')

    await userEvent.click(switchToEnglish)

    expect(
      screen.getByRole('button', { name: 'Switch to Chinese' }),
    ).toHaveTextContent('中文')
    expect(
      screen.getByText(
        'Drop one RAW to preview, compare, finish, and export locally.',
      ),
    ).toBeInTheDocument()
  })

  it('reserves the histogram action slot before a RAW is loaded', () => {
    const { container } = renderMobileTopbar({
      hasImage: false,
      fileName: '',
      fileMeta: '',
      supportLevel: 'experimental',
      histogramShown: false,
      onToggleHistogram: vi.fn(),
      moreMenuItems: [],
    })

    expect(container.querySelector('[data-mobile-histogram-slot]')).toHaveClass(
      'size-11',
    )
    expect(
      screen.queryByRole('button', { name: /show histogram/i }),
    ).not.toBeInTheDocument()
  })
})
