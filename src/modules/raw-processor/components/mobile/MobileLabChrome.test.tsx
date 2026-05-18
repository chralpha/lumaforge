import { getLUTColorProfile } from '@lumaforge/luma-color-runtime'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MobileLabChrome } from './MobileLabChrome'
import { TONE_NEUTRAL } from './tone-fields'

const base = {
  hasImage: true,
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
  strengthControl: <div>strength</div>,
  lutBrowser: {
    currentLutName: null,
    disabled: false,
    onLutLoad: vi.fn(),
    onLutClear: vi.fn(),
    lutProfileSelection: null,
    lutProfileResolution: null,
    onLutProfileSelect: vi.fn(),
    onlineLutSources: undefined,
  },
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

  it('empty state uses the darkroom onboarding surface and can pre-stage a LUT', async () => {
    render(<MobileLabChrome {...base} hasImage={false} />)
    expect(
      screen.getByRole('heading', { name: /drop a raw to start/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /browse raw files/i }),
    ).toBeInTheDocument()
    expect(screen.getByText(/pre-stage a lut/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /add lut/i }))
    expect(
      screen.getByRole('dialog', { name: /lut browser/i }),
    ).toBeInTheDocument()

    expect(
      screen.queryByRole('tablist', { name: /lab modes/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('tablist', { name: /tone parameters/i }),
    ).toBeNull()
    expect(screen.queryByTestId('mobile-peek-surface')).not.toBeInTheDocument()
  })

  it('tears down focus/sheets when the RAW is cleared (hasImage→false)', async () => {
    const { rerender } = render(<MobileLabChrome {...base} />)
    const dock = screen.getByRole('tablist', { name: /lab modes/i })
    await userEvent.click(within(dock).getByRole('tab', { name: /tone/i }))
    const strip = screen.getByRole('tablist', { name: /tone parameters/i })
    await userEvent.click(within(strip).getAllByRole('tab')[0])
    expect(screen.getByRole('button', { name: /done/i })).toBeInTheDocument()
    rerender(<MobileLabChrome {...base} hasImage={false} />)
    expect(
      screen.queryByRole('button', { name: /done/i }),
    ).not.toBeInTheDocument()
    expect(screen.queryByTestId('mobile-peek-surface')).not.toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /drop a raw to start/i }),
    ).toBeInTheDocument()
  })

  it('look mode opens the LUT browser and strength is its own mode', async () => {
    render(<MobileLabChrome {...base} />)
    const dock = screen.getByRole('tablist', { name: /lab modes/i })
    expect(screen.queryByText('strength')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /lut browser/i }))
    expect(
      screen.getByRole('dialog', { name: /lut browser/i }),
    ).toBeInTheDocument()
    await userEvent.click(
      screen.getByRole('button', { name: /close lut browser/i }),
    )
    await userEvent.click(within(dock).getByRole('tab', { name: /strength/i }))
    expect(screen.getByText('strength')).toBeInTheDocument()
  })

  it('surfaces the current mobile LUT contract directly in Look mode', async () => {
    const detectedProfile = {
      ...getLUTColorProfile('sony-sgamut3cine-slog3')!,
      role: 'combined-look-output' as const,
      outputGamut: 'srgb-rec709' as const,
      outputTransfer: 'srgb' as const,
      outputRange: 'full' as const,
    }

    render(
      <MobileLabChrome
        {...base}
        lutBrowser={{
          ...base.lutBrowser,
          currentLutName: 'client-look.cube',
          lutProfileSelection: {
            status: 'resolved',
            fingerprint: 'lut-fingerprint',
            profileId: detectedProfile.id,
            confidence: 'metadata',
          },
          lutProfileResolution: {
            kind: 'resolved',
            profile: detectedProfile,
            confidence: 'metadata',
          },
        }}
      />,
    )

    expect(screen.getByText('client-look.cube')).toBeInTheDocument()
    expect(screen.getByText('Sony S-Gamut3.Cine / S-Log3')).toBeInTheDocument()
    expect(screen.getByText('Rec.709 display')).toBeInTheDocument()

    await userEvent.click(
      screen.getByRole('button', { name: /change lut contract/i }),
    )

    expect(
      screen.getByRole('dialog', { name: /lut browser/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('tablist', { name: 'LUT contract panels' }),
    ).toBeInTheDocument()
  })

  it('keeps the mobile LUT contract entry visible when auto-detection fails', async () => {
    render(
      <MobileLabChrome
        {...base}
        lutBrowser={{
          ...base.lutBrowser,
          currentLutName: 'unknown-look.cube',
          lutProfileSelection: {
            status: 'pending',
            fingerprint: 'lut-fingerprint',
            title: 'Unknown look',
            sourceName: 'unknown-look.cube',
            suggestions: [],
          },
          lutProfileResolution: {
            kind: 'needs-user-selection',
            suggestions: [],
          },
        }}
      />,
    )

    expect(
      screen.getByText(
        'Choose the LUT input and output contract before preview or export.',
      ),
    ).toBeInTheDocument()

    await userEvent.click(
      screen.getByRole('button', { name: /choose lut contract/i }),
    )

    expect(
      screen.getByRole('dialog', { name: /lut browser/i }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Search LUT contract')).toBeInTheDocument()
  })

  it('starts with controls visible on the Look workflow, not bare', async () => {
    render(<MobileLabChrome {...base} />)
    // Controls are present on load — dock expanded by default, not immersive.
    expect(
      screen.getByRole('button', { name: /lut browser/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'DSC09142.ARW' }),
    ).toBeInTheDocument()
    // Tapping the active Look tab collapses the panel.
    const dock = screen.getByRole('tablist', { name: /lab modes/i })
    await userEvent.click(within(dock).getByRole('tab', { name: /look/i }))
    expect(screen.queryByRole('button', { name: /lut browser/i })).toBeNull()
  })

  it('enters focus mode from a tone pill and hides the topbar', async () => {
    render(<MobileLabChrome {...base} />)
    expect(
      screen.getByRole('heading', { name: 'DSC09142.ARW' }),
    ).toBeInTheDocument()

    const dock = screen.getByRole('tablist', { name: /lab modes/i })
    await userEvent.click(within(dock).getByRole('tab', { name: /tone/i }))
    const strip = screen.getByRole('tablist', { name: /tone parameters/i })
    await userEvent.click(within(strip).getAllByRole('tab')[0])

    expect(screen.getByRole('button', { name: /done/i })).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'DSC09142.ARW' }),
    ).not.toBeInTheDocument()
  })

  it('recedes focus chrome while the slider is scrubbed', async () => {
    render(<MobileLabChrome {...base} />)
    const dock = screen.getByRole('tablist', { name: /lab modes/i })
    await userEvent.click(within(dock).getByRole('tab', { name: /tone/i }))
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

  it('uses long-press peek as the default Compare interaction', () => {
    vi.useFakeTimers()
    const onViewModeChange = vi.fn()
    render(<MobileLabChrome {...base} onViewModeChange={onViewModeChange} />)
    const dock = screen.getByRole('tablist', { name: /lab modes/i })
    fireEvent.click(within(dock).getByRole('tab', { name: /compare/i }))
    expect(screen.getByText(/touch and hold the photo/i)).toBeInTheDocument()
    expect(screen.queryByText('compare')).not.toBeInTheDocument()

    const surface = screen.getByTestId('mobile-peek-surface')
    surface.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    vi.advanceTimersByTime(400)
    expect(onViewModeChange).toHaveBeenLastCalledWith('original')
    surface.dispatchEvent(new Event('pointerup', { bubbles: true }))
    expect(onViewModeChange).toHaveBeenLastCalledWith('processed')
    vi.useRealTimers()
  })

  it('enables split compare only through the explicit Compare panel action', () => {
    vi.useFakeTimers()
    const onViewModeChange = vi.fn()
    render(<MobileLabChrome {...base} onViewModeChange={onViewModeChange} />)
    const dock = screen.getByRole('tablist', { name: /lab modes/i })
    fireEvent.click(within(dock).getByRole('tab', { name: /compare/i }))
    expect(screen.queryByText('compare')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /split compare/i }))
    expect(onViewModeChange).toHaveBeenLastCalledWith('compare')
    expect(screen.getByText('compare')).toBeInTheDocument()

    onViewModeChange.mockClear()
    const surface = screen.getByTestId('mobile-peek-surface')
    surface.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    vi.advanceTimersByTime(400)
    surface.dispatchEvent(new Event('pointerup', { bubbles: true }))
    expect(onViewModeChange).not.toHaveBeenCalledWith('original')

    fireEvent.click(
      screen.getByRole('button', { name: /touch and hold instead/i }),
    )
    expect(onViewModeChange).toHaveBeenLastCalledWith('processed')
    expect(screen.getByText(/touch and hold the photo/i)).toBeInTheDocument()
    vi.useRealTimers()
  })
})
