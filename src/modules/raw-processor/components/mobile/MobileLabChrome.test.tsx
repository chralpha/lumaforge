import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MobileLabChrome } from './MobileLabChrome'
import { TONE_NEUTRAL } from './tone-fields'

const base = {
  tone: TONE_NEUTRAL,
  onToneChange: vi.fn(),
  onToneReset: vi.fn(),
  viewMode: 'processed' as const,
  onViewModeChange: vi.fn(),
  histogram: { state: 'unavailable', reason: 'no-image' } as never,
  fileName: 'DSC09142.ARW',
  fileMeta: 'Sony α7 IV · Official RAW support',
  supportLevel: 'official' as const,
  onReplaceFile: vi.fn(),
  onResetSession: vi.fn(),
  lutPanel: <div>lut</div>,
  comparePanel: <div>compare</div>,
  exportPanel: <div>export</div>,
  moreSheet: { pipelineSteps: [], lutRows: [], fileRows: [] },
}

describe('mobileLabChrome', () => {
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

  it('starts with controls visible (tone strip shown, not bare)', async () => {
    render(<MobileLabChrome {...base} />)
    // Controls are present on load — dock expanded by default, not immersive.
    expect(
      screen.getByRole('tablist', { name: /tone parameters/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'DSC09142.ARW' }),
    ).toBeInTheDocument()
    // Tapping the active Tone tab collapses the panel.
    const dock = screen.getByRole('tablist', { name: /lab modes/i })
    await userEvent.click(within(dock).getByRole('tab', { name: /tone/i }))
    expect(
      screen.queryByRole('tablist', { name: /tone parameters/i }),
    ).toBeNull()
  })

  it('enters focus mode from a tone pill and hides the topbar', async () => {
    render(<MobileLabChrome {...base} />)
    expect(
      screen.getByRole('heading', { name: 'DSC09142.ARW' }),
    ).toBeInTheDocument()

    const strip = screen.getByRole('tablist', { name: /tone parameters/i })
    await userEvent.click(within(strip).getAllByRole('tab')[0])

    expect(screen.getByRole('button', { name: /done/i })).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'DSC09142.ARW' }),
    ).not.toBeInTheDocument()
  })

  it('recedes focus chrome while the slider is scrubbed', async () => {
    render(<MobileLabChrome {...base} />)
    const strip = screen.getByRole('tablist', { name: /tone parameters/i })
    await userEvent.click(within(strip).getAllByRole('tab')[0])
    const focus = document.querySelector('[data-tone-focus]')
    expect(focus).toBeInTheDocument()
    expect(focus).not.toHaveAttribute('data-scrubbing')
    const scrub = screen.getByTestId('tone-focus-scrub')
    fireEvent.pointerDown(scrub)
    expect(
      document.querySelector('[data-tone-focus][data-scrubbing="true"]'),
    ).toBeInTheDocument()
    fireEvent.pointerUp(scrub)
    expect(
      document.querySelector('[data-tone-focus][data-scrubbing="true"]'),
    ).toBeNull()
  })

  it('short tap toggles immersive (chrome hidden) and back', () => {
    render(<MobileLabChrome {...base} />)
    const s = screen.getByTestId('mobile-peek-surface')
    expect(screen.getByRole('heading', { name: 'DSC09142.ARW' })).toBeVisible()
    fireEvent.pointerDown(s)
    fireEvent.pointerUp(s)
    expect(
      screen.queryByRole('heading', { name: 'DSC09142.ARW' }),
    ).not.toBeInTheDocument()
    // restore affordance brings the chrome back
    fireEvent.click(screen.getByRole('button', { name: /show controls/i }))
    expect(
      screen.getByRole('heading', { name: 'DSC09142.ARW' }),
    ).toBeInTheDocument()
  })

  it('peeks the unprocessed RAW via viewMode while held', () => {
    vi.useFakeTimers()
    const onViewModeChange = vi.fn()
    render(<MobileLabChrome {...base} onViewModeChange={onViewModeChange} />)
    const surface = screen.getByTestId('mobile-peek-surface')
    surface.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    vi.advanceTimersByTime(260)
    expect(onViewModeChange).toHaveBeenLastCalledWith('original')
    surface.dispatchEvent(new Event('pointerup', { bubbles: true }))
    expect(onViewModeChange).toHaveBeenLastCalledWith('processed')
    vi.useRealTimers()
  })

  it('disables long-press peek in Compare mode (split is the tool there)', () => {
    vi.useFakeTimers()
    const onViewModeChange = vi.fn()
    render(<MobileLabChrome {...base} onViewModeChange={onViewModeChange} />)
    const dock = screen.getByRole('tablist', { name: /lab modes/i })
    fireEvent.click(within(dock).getByRole('tab', { name: /compare/i }))
    const surface = screen.getByTestId('mobile-peek-surface')
    surface.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    vi.advanceTimersByTime(400)
    surface.dispatchEvent(new Event('pointerup', { bubbles: true }))
    expect(onViewModeChange).not.toHaveBeenCalledWith('original')
    vi.useRealTimers()
  })
})
