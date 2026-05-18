import { render, screen, within } from '@testing-library/react'
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
})
