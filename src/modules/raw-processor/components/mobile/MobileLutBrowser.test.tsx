import { getLUTColorProfile } from '@lumaforge/luma-color-runtime'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { UseOnlineLutSourcesResult } from '../../hooks/useOnlineLutSources'
import { MobileLutBrowser } from './MobileLutBrowser'

const baseProps = {
  open: true,
  onClose: vi.fn(),
  currentLutName: 'Kodak 2383.cube',
  disabled: false,
  onLutLoad: vi.fn(),
  onLutClear: vi.fn(),
  lutProfileSelection: null,
  lutProfileResolution: null,
  onLutProfileSelect: vi.fn(),
  activeIntensity: 'standard' as const,
  onIntensitySelect: vi.fn(),
  strengthDisabled: false,
}

function onlineLutSourcesFixture(
  loadEntry = vi.fn(),
): UseOnlineLutSourcesResult {
  return {
    state: {
      resources: [
        {
          id: 'source-1',
          url: 'https://profiles.example.com/catalog.json',
          type: 'catalog',
          label: 'Profiles catalog',
          fromQuery: true,
        },
      ],
      entries: [
        {
          id: 'kodak-2383-rec709',
          resourceId: 'source-1',
          title: 'Kodak 2383 Rec.709',
          sourceUrl: 'https://profiles.example.com/kodak-2383-rec709.json',
          sourceType: 'catalog-entry',
          cube: {
            url: 'https://profiles.example.com/kodak-2383-rec709.cube',
            sha256:
              '9c56cc51b374c3ba189210d5b6d4bf57790d351c96c47c02190ecf1e430635ab',
            title: 'Kodak 2383 Rec.709',
          },
          tags: [],
        },
      ],
      issues: [],
      activeResourceId: 'source-1',
      isLoading: false,
    },
    sourceUrlInput: '',
    setSourceUrlInput: vi.fn(),
    addSourceFromInput: vi.fn(),
    refreshSource: vi.fn(),
    removeSource: vi.fn(),
    loadEntry,
    share: {
      enabled: false,
      url: '',
      copy: vi.fn().mockResolvedValue(undefined),
    },
  }
}

describe('mobileLutBrowser', () => {
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
    vi.clearAllMocks()
  })

  it('renders the dialog with the current LUT and closes via the close button', async () => {
    const onClose = vi.fn()
    render(<MobileLutBrowser {...baseProps} onClose={onClose} />)

    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveAttribute('data-mobile-substrate', 'ink-sheet')
    expect(dialog).toHaveClass('bg-gradient-to-t')
    expect(dialog).toHaveClass('from-black/92')
    expect(dialog).toHaveClass('text-lf-hero-ink')
    expect(dialog).toHaveClass('border-lf-on-photo-bord-soft')
    expect(dialog).not.toHaveClass('bg-lf-paper-high')
    expect(dialog).not.toHaveClass('text-lf-ink')
    expect(dialog.className).not.toMatch(
      /bg-material|bg-background|bg-fill|text-text|border-border/,
    )
    expect(screen.getByText('Kodak 2383.cube')).toBeInTheDocument()

    await userEvent.click(
      screen.getByRole('button', { name: /close lut browser/i }),
    )

    expect(onClose).toHaveBeenCalled()
  })

  it('clears the current LUT', async () => {
    const onLutClear = vi.fn()
    render(<MobileLutBrowser {...baseProps} onLutClear={onLutClear} />)

    await userEvent.click(screen.getByRole('button', { name: /clear lut/i }))

    expect(onLutClear).toHaveBeenCalled()
  })

  it('uses Add .cube LUT as the empty Current LUT card state', () => {
    render(<MobileLutBrowser {...baseProps} currentLutName={null} />)

    const currentSection = screen
      .getByRole('heading', { name: 'Current LUT' })
      .closest('section')
    expect(currentSection).toHaveAttribute('data-raw-mobile-lut', 'current')
    const currentCard = within(currentSection!).getByTestId(
      'raw-mobile-current-lut-card',
    )
    expect(
      within(currentCard).getByLabelText('Upload .cube LUT'),
    ).toBeInTheDocument()
    expect(within(currentCard).getByText('Add .cube LUT')).toBeVisible()
    expect(within(currentCard).queryByText('-')).not.toBeInTheDocument()
    expect(
      within(currentCard).queryByText('Choose .cube LUT'),
    ).not.toBeInTheDocument()
    expect(
      within(currentCard).queryByText('Tap to browse or drop a file'),
    ).not.toBeInTheDocument()
    expect(
      within(currentCard).queryByRole('button', { name: 'Clear LUT' }),
    ).not.toBeInTheDocument()
    expect(
      within(currentCard).getByLabelText('Upload .cube LUT').closest('label'),
    ).not.toHaveClass('border-2')
    expect(
      within(currentCard).getByLabelText('Upload .cube LUT').closest('label'),
    ).not.toHaveClass('border-dashed')
    expect(
      within(currentCard).getByLabelText('Upload .cube LUT').closest('label'),
    ).not.toHaveClass('border-t')
    expect(
      screen.queryByRole('heading', { name: 'Upload .cube' }),
    ).not.toBeInTheDocument()
  })

  it('uses the selected LUT name and Clear action as the loaded Current LUT card state', () => {
    render(<MobileLutBrowser {...baseProps} />)

    const currentSection = screen
      .getByRole('heading', { name: 'Current LUT' })
      .closest('section')
    const currentCard = within(currentSection!).getByTestId(
      'raw-mobile-current-lut-card',
    )

    expect(within(currentCard).getByText('Kodak 2383.cube')).toBeVisible()
    expect(
      within(currentCard).getByRole('button', { name: 'Clear LUT' }),
    ).toBeEnabled()
    expect(
      within(currentCard).queryByText('Add .cube LUT'),
    ).not.toBeInTheDocument()
  })

  it('renders strength in overview and disables it when requested', () => {
    render(
      <MobileLutBrowser
        {...baseProps}
        currentLutName={null}
        strengthDisabled
      />,
    )

    const strengthSection = screen
      .getByRole('heading', { name: 'Strength' })
      .closest('section')

    expect(strengthSection).toHaveAttribute('data-raw-mobile-lut', 'strength')
    // Section itself is a clean wrapper; the track carries the local mobile
    // substrate. Keep the LUT sheet in the dark on-photo family instead of
    // importing the desktop paper surface.
    expect(strengthSection?.className ?? '').not.toMatch(/bg-\[oklch/)
    expect(strengthSection?.className ?? '').not.toMatch(/bg-lf-paper-warm/)

    const tablist = screen.getByRole('tablist', { name: 'Strength' })
    expect(tablist).toBeInTheDocument()
    // Borderless track per §6 Inset Hairline Rule — the track defines its
    // edge by a 5% cool-white fill against the chrome surface, not a drawn
    // hairline. This keeps the segmented control from reading heavier on
    // the flatter mobile sheet than on the structured desktop tool card.
    expect(tablist.className).toMatch(/bg-\[oklch\(0\.96_0\.006_255\/0\.05\)\]/)
    expect(tablist).not.toHaveClass('border-lf-on-photo-bord-soft')
    expect(tablist).not.toHaveClass('bg-lf-on-photo-bg')
    expect(tablist).not.toHaveClass('bg-lf-paper-warm/55')
    expect(tablist).not.toHaveClass('border-lf-hairline/45')
    expect(tablist.className).not.toMatch(
      /bg-\[oklch\(from_var\(--color-lf-ink\)/,
    )
    // The active segment renders a motion-animated thumb (layoutId-driven
    // spring) and earns the cool-white wash + top highlight that matches
    // the rest of the chrome's seam idiom (oklch(0.96 0.006 255 / *)).
    const standardTab = screen.getByRole('tab', { name: 'Standard' })
    expect(standardTab.querySelector('[data-segment-thumb]')).not.toBeNull()
    // Active-thumb wash: 10% cool-white, brighter than the 5% track wash so
    // the segment lifts visibly without depending on a drawn outline.
    expect(standardTab.className).toMatch(
      /data-\[state=active\]:\[&_span\[data-segment-thumb\]\]:bg-\[oklch\(0\.96_0\.006_255\/0\.10\)\]/,
    )
    // Weight contrast carries the readability when the bg delta is subtle.
    expect(standardTab.className).toMatch(/data-\[state=active\]:font-semibold/)
    expect(standardTab.className).toMatch(
      /data-\[state=active\]:text-lf-hero-ink/,
    )
    expect(standardTab.className).not.toMatch(/bg-lf-paper-high/)
    expect(standardTab.className).not.toMatch(/bg-lf-on-photo-bg-strong/)
    expect(standardTab).toBeDisabled()
  })

  it('opens a source catalog, loads an online LUT entry, and returns to overview', async () => {
    const loadEntry = vi.fn().mockResolvedValue(undefined)
    render(
      <MobileLutBrowser
        {...baseProps}
        onlineLutSources={onlineLutSourcesFixture(loadEntry)}
      />,
    )

    expect(screen.getByRole('dialog')).toHaveAttribute(
      'data-mobile-lut-view',
      'overview',
    )

    await userEvent.click(
      screen.getByRole('button', { name: /browse 1 luts/i }),
    )

    expect(screen.getByRole('dialog')).toHaveAttribute(
      'data-mobile-lut-view',
      'catalog',
    )
    expect(screen.queryByRole('button', { name: /browse 1 luts/i })).toBeNull()

    await userEvent.click(
      screen.getByRole('button', { name: /load kodak 2383 rec.709/i }),
    )
    await new Promise((resolve) => requestAnimationFrame(resolve))

    expect(loadEntry).toHaveBeenCalledWith('kodak-2383-rec709')
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toHaveAttribute(
        'data-mobile-lut-view',
        'overview',
      )
    })
  })

  it('acks the mobile LUT entry load click before the load resolves', async () => {
    const rafQueue: FrameRequestCallback[] = []
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        rafQueue.push(callback)
        return rafQueue.length
      }),
    )
    const loadHandle: { resolve: (() => void) | null } = { resolve: null }
    const loadEntry = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          loadHandle.resolve = resolve
        }),
    )

    try {
      render(
        <MobileLutBrowser
          {...baseProps}
          onlineLutSources={onlineLutSourcesFixture(loadEntry)}
        />,
      )

      await userEvent.click(
        screen.getByRole('button', { name: /browse 1 luts/i }),
      )

      const loadButton = screen.getByRole('button', {
        name: /load kodak 2383 rec.709/i,
      })
      expect(loadButton).not.toHaveAttribute('aria-busy', 'true')

      await userEvent.click(loadButton)

      expect(
        await screen.findByRole('button', {
          name: /load kodak 2383 rec.709/i,
          busy: true,
        }),
      ).toBeInTheDocument()
      expect(loadEntry).not.toHaveBeenCalled()

      const queued = rafQueue.splice(0)
      await act(async () => {
        for (const callback of queued) callback(performance.now())
        await Promise.resolve()
      })

      expect(loadEntry).toHaveBeenCalledWith('kodak-2383-rec709')

      await act(async () => {
        loadHandle.resolve?.()
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('lets the user add an online LUT source URL from the mobile sheet', async () => {
    const fixture = onlineLutSourcesFixture()
    fixture.sourceUrlInput = 'https://profiles.example.com/extra.json'
    render(<MobileLutBrowser {...baseProps} onlineLutSources={fixture} />)

    const input = screen.getByLabelText(/online lut source url/i)
    await userEvent.click(input)
    await userEvent.keyboard('{Enter}')

    expect(fixture.addSourceFromInput).toHaveBeenCalledTimes(1)

    await userEvent.click(
      screen.getByRole('button', { name: /add lut source/i }),
    )

    expect(fixture.addSourceFromInput).toHaveBeenCalledTimes(2)
  })

  it('disables the add button when the online LUT source URL is empty', () => {
    const fixture = onlineLutSourcesFixture()
    fixture.sourceUrlInput = ''
    render(<MobileLutBrowser {...baseProps} onlineLutSources={fixture} />)

    expect(
      screen.getByRole('button', { name: /add lut source/i }),
    ).toBeDisabled()
  })

  it('refreshes an online LUT source from the mobile sheet', async () => {
    const fixture = onlineLutSourcesFixture()
    render(<MobileLutBrowser {...baseProps} onlineLutSources={fixture} />)

    await userEvent.click(
      screen.getByRole('button', { name: /refresh profiles catalog/i }),
    )

    expect(fixture.refreshSource).toHaveBeenCalledWith('source-1')
  })

  it('removes an online LUT source from the mobile sheet', async () => {
    const fixture = onlineLutSourcesFixture()
    render(<MobileLutBrowser {...baseProps} onlineLutSources={fixture} />)

    await userEvent.click(
      screen.getByRole('button', { name: /remove profiles catalog/i }),
    )

    expect(fixture.removeSource).toHaveBeenCalledWith('source-1')
  })

  it('marks the active resource as loading and disables its refresh button', () => {
    const fixture = onlineLutSourcesFixture()
    fixture.state = {
      ...fixture.state,
      isLoading: true,
      activeResourceId: 'source-1',
    }
    render(<MobileLutBrowser {...baseProps} onlineLutSources={fixture} />)

    const refreshButton = screen.getByRole('button', {
      name: /refresh profiles catalog/i,
    })
    expect(refreshButton).toBeDisabled()
    expect(refreshButton).toHaveAttribute('aria-busy', 'true')
  })

  it('copies the share URL when the mobile share button is tapped', async () => {
    const copy = vi.fn().mockResolvedValue(undefined)
    const fixture = onlineLutSourcesFixture()
    fixture.share = {
      enabled: true,
      url: '/raw?luts=https%3A%2F%2Fprofiles.example.com%2Fcatalog.json',
      copy,
    }
    render(<MobileLutBrowser {...baseProps} onlineLutSources={fixture} />)

    await userEvent.click(
      screen.getByRole('button', { name: /copy lut source link/i }),
    )

    expect(copy).toHaveBeenCalledTimes(1)
  })

  it('disables the mobile share button when there is nothing to share', () => {
    const fixture = onlineLutSourcesFixture()
    fixture.share = {
      enabled: false,
      url: '',
      copy: vi.fn().mockResolvedValue(undefined),
    }
    render(<MobileLutBrowser {...baseProps} onlineLutSources={fixture} />)

    expect(
      screen.getByRole('button', { name: /copy lut source link/i }),
    ).toBeDisabled()
  })

  it('keeps current LUT and online source controls at mobile touch-target size', () => {
    const fixture = onlineLutSourcesFixture()
    fixture.sourceUrlInput = 'https://profiles.example.com/extra.json'
    render(<MobileLutBrowser {...baseProps} onlineLutSources={fixture} />)

    expect(
      screen.getByRole('button', { name: /close lut browser/i }),
    ).toHaveClass('size-[44px]')
    expect(screen.getByRole('button', { name: /clear lut/i })).toHaveClass(
      'min-h-[44px]',
    )
    expect(
      screen.getByRole('button', { name: /copy lut source link/i }),
    ).toHaveClass('size-[44px]')
    expect(screen.getByLabelText(/online lut source url/i)).toHaveClass(
      'h-[44px]',
    )
    expect(screen.getByRole('button', { name: /add lut source/i })).toHaveClass(
      'size-[44px]',
    )
    expect(
      screen.getByRole('button', { name: /refresh profiles catalog/i }),
    ).toHaveClass('size-[44px]')
    expect(
      screen.getByRole('button', { name: /remove profiles catalog/i }),
    ).toHaveClass('size-[44px]')
  })

  it('keeps catalog entry rows at mobile touch-target size', async () => {
    const fixture = onlineLutSourcesFixture()
    render(<MobileLutBrowser {...baseProps} onlineLutSources={fixture} />)

    await userEvent.click(
      screen.getByRole('button', { name: /browse 1 luts/i }),
    )

    expect(
      screen.getByRole('button', { name: /load kodak 2383 rec.709/i }),
    ).toHaveClass('min-h-[44px]')
  })

  it('keeps mobile catalog browsing in the dark on-photo surface family', async () => {
    const fixture = onlineLutSourcesFixture()
    render(<MobileLutBrowser {...baseProps} onlineLutSources={fixture} />)

    const sourceCard = document.querySelector(
      '[data-raw-mobile-lut="source-card"]',
    )
    expect(sourceCard).toHaveClass('bg-transparent')
    expect(sourceCard).not.toHaveClass('bg-lf-paper-warm/55')

    const sourceInput = screen.getByLabelText(/online lut source url/i)
    expect(sourceInput).toHaveClass('focus:ring-lf-green/25')
    expect(sourceInput).not.toHaveClass('focus:border-lf-amber')

    await userEvent.click(
      screen.getByRole('button', { name: /browse 1 luts/i }),
    )

    const entry = screen.getByRole('button', {
      name: /load kodak 2383 rec.709/i,
    })
    expect(entry).toHaveClass('hover:bg-lf-on-photo-bg-strong')
    expect(entry).not.toHaveClass(
      'hover:bg-[oklch(from_var(--color-lf-ink)_l_c_h_/_0.045)]',
    )
    expect(entry).not.toHaveClass('border-lf-hairline/40')
  })

  it('hints at the expected manifest URL shape when no online sources exist', () => {
    const fixture = onlineLutSourcesFixture()
    fixture.state = {
      resources: [],
      entries: [],
      issues: [],
      activeResourceId: null,
      isLoading: false,
    }
    render(<MobileLutBrowser {...baseProps} onlineLutSources={fixture} />)

    expect(
      screen.getByText(/paste a catalog\.json or lumaforge-profiles\.json/i),
    ).toBeInTheDocument()
  })

  it('surfaces per-resource issue messages inside the resource card', () => {
    const fixture = onlineLutSourcesFixture()
    fixture.state = {
      ...fixture.state,
      issues: [
        {
          code: 'fetch-failed',
          message: 'Could not reach catalog',
          resourceId: 'source-1',
        },
      ],
    }
    render(<MobileLutBrowser {...baseProps} onlineLutSources={fixture} />)

    expect(screen.getByText('Could not reach catalog')).toBeInTheDocument()
  })

  it('keeps the mobile LUT contract editor touch-first', async () => {
    const panasonic = getLUTColorProfile('panasonic-vgamut-vlog')!
    render(
      <MobileLutBrowser
        {...baseProps}
        initialContractEditorOpen
        currentLutName="unknown-client-look.cube"
        lutProfileSelection={{
          status: 'recommended',
          fingerprint: 'lut-fingerprint',
          title: 'Unknown client look',
          sourceName: 'unknown-client-look.cube',
          recommendations: [panasonic],
        }}
        lutProfileResolution={{
          kind: 'recommended',
          recommendations: [panasonic],
        }}
      />,
    )

    expect(
      screen.getByRole('heading', { name: /edit contract/i }),
    ).toBeInTheDocument()
    for (const tab of within(
      screen.getByRole('tablist', { name: 'LUT contract panels' }),
    ).getAllByRole('tab')) {
      expect(tab).toHaveClass('min-h-[44px]')
    }
    expect(screen.getByLabelText('Search LUT contract')).toHaveClass(
      'min-h-[44px]',
    )
    expect(screen.getByLabelText('Search LUT contract')).toHaveClass(
      'focus:ring-lf-green/25',
    )
    expect(screen.getByLabelText('Search LUT contract')).not.toHaveClass(
      'focus:border-lf-amber',
    )
    const activeInputTab = within(
      screen.getByRole('tablist', { name: 'LUT contract panels' }),
    ).getByRole('tab', { name: 'Input', selected: true })
    // Active state is driven by a motion `layoutId` thumb (spring-animated)
    // sitting under the label — the motion cue matches Strength without
    // importing the desktop paper thumb.
    const contractThumb = activeInputTab.querySelector(
      '[data-mobile-lut-contract-thumb]',
    )
    expect(contractThumb).not.toBeNull()
    // Shares the segmented-chrome contract with StrengthControl + the
    // desktop LUT contract tabs — 10% cool-white wash matching the rest
    // of the chrome's seam idiom, not the prior depressed plate or warm
    // hero-ink wash.
    expect(contractThumb?.className ?? '').toMatch(
      /bg-\[oklch\(0\.96_0\.006_255\/0\.10\)\]/,
    )
    expect(contractThumb).not.toHaveClass('bg-lf-paper-high')
    expect(contractThumb).not.toHaveClass('bg-lf-on-photo-bg-strong')
    expect(activeInputTab.className).not.toMatch(/aria-selected:bg-lf-amber/)
    expect(
      screen.getByRole('button', {
        name: 'Use Panasonic V-Gamut / V-Log as LUT input',
      }),
    ).toHaveClass('min-h-[44px]')
    expect(
      screen.getByRole('button', {
        name: 'Use Panasonic V-Gamut / V-Log as LUT input',
      }),
    ).not.toHaveClass('bg-[oklch(from_var(--color-lf-amber)_l_c_h_/_0.10)]')
  })

  it('opens the contract view from overview and returns with the back button', async () => {
    render(
      <MobileLutBrowser
        {...baseProps}
        currentLutName="unknown-client-look.cube"
        lutProfileSelection={{
          status: 'recommended',
          fingerprint: 'lut-fingerprint',
          title: 'Unknown client look',
          sourceName: 'unknown-client-look.cube',
          recommendations: [getLUTColorProfile('panasonic-vgamut-vlog')!],
        }}
        lutProfileResolution={{
          kind: 'recommended',
          recommendations: [getLUTColorProfile('panasonic-vgamut-vlog')!],
        }}
      />,
    )

    expect(
      screen.getByRole('button', { name: /choose lut contract/i }),
    ).toHaveClass('border-lf-on-photo-bord-soft')
    expect(
      screen.getByRole('button', { name: /choose lut contract/i }),
    ).not.toHaveClass('border-lf-amber/55')

    await userEvent.click(
      screen.getByRole('button', { name: /choose lut contract/i }),
    )

    expect(screen.getByRole('dialog')).toHaveAttribute(
      'data-mobile-lut-view',
      'contract',
    )

    await userEvent.click(
      screen.getByRole('button', { name: /back to lut browser/i }),
    )

    expect(screen.getByRole('dialog')).toHaveAttribute(
      'data-mobile-lut-view',
      'overview',
    )
  })

  it('opens directly into the contract view when requested', () => {
    render(
      <MobileLutBrowser
        {...baseProps}
        initialContractEditorOpen
        currentLutName="unknown-client-look.cube"
        lutProfileSelection={{
          status: 'recommended',
          fingerprint: 'lut-fingerprint',
          title: 'Unknown client look',
          sourceName: 'unknown-client-look.cube',
          recommendations: [getLUTColorProfile('panasonic-vgamut-vlog')!],
        }}
        lutProfileResolution={{
          kind: 'recommended',
          recommendations: [getLUTColorProfile('panasonic-vgamut-vlog')!],
        }}
      />,
    )

    expect(screen.getByRole('dialog')).toHaveAttribute(
      'data-mobile-lut-view',
      'contract',
    )
    expect(
      screen.getByRole('heading', { name: /edit contract/i }),
    ).toBeInTheDocument()
  })

  it('lets an unresolved LUT choose input and output contracts from the mobile sheet', async () => {
    const onLutProfileSelect = vi.fn()
    render(
      <MobileLutBrowser
        {...baseProps}
        currentLutName="unknown-client-look.cube"
        lutProfileSelection={{
          status: 'recommended',
          fingerprint: 'lut-fingerprint',
          title: 'Unknown client look',
          sourceName: 'unknown-client-look.cube',
          recommendations: [getLUTColorProfile('panasonic-vgamut-vlog')!],
        }}
        lutProfileResolution={{
          kind: 'recommended',
          recommendations: [getLUTColorProfile('panasonic-vgamut-vlog')!],
        }}
        onLutProfileSelect={onLutProfileSelect}
      />,
    )

    // With a recommendation the overview now shows the recognized input chip
    // and the "Input recognized — choose an output to confirm." note instead
    // of the generic "unknown" prompt.
    expect(
      screen.getByText('Input recognized — choose an output to confirm.'),
    ).toBeInTheDocument()

    await userEvent.click(
      screen.getByRole('button', { name: /choose lut contract/i }),
    )

    const panels = screen.getByRole('tablist', {
      name: 'LUT contract panels',
    })
    expect(
      within(panels).getByRole('tab', { name: 'Input', selected: true }),
    ).toBeInTheDocument()

    await userEvent.click(
      screen.getByRole('button', {
        name: 'Use Panasonic V-Gamut / V-Log as LUT input',
      }),
    )

    expect(
      within(panels).getByRole('tab', { name: 'Output', selected: true }),
    ).toBeInTheDocument()

    await userEvent.type(
      screen.getByLabelText('Search LUT contract'),
      'display srgb',
    )
    await userEvent.click(
      screen.getByRole('button', {
        name: 'Use Display sRGB as LUT output',
      }),
    )

    expect(onLutProfileSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        inputGamut: 'v-gamut',
        inputTransfer: 'v-log',
        outputGamut: 'srgb-rec709',
        outputTransfer: 'srgb',
        outputRange: 'full',
      }),
    )
  })

  it('does not reopen the initial contract editor after selecting output', async () => {
    const onLutProfileSelect = vi.fn()
    const panasonic = getLUTColorProfile('panasonic-vgamut-vlog')!
    const { rerender } = render(
      <MobileLutBrowser
        {...baseProps}
        initialContractEditorOpen
        currentLutName="unknown-client-look.cube"
        lutProfileSelection={{
          status: 'recommended',
          fingerprint: 'lut-fingerprint',
          title: 'Unknown client look',
          sourceName: 'unknown-client-look.cube',
          recommendations: [panasonic],
        }}
        lutProfileResolution={{
          kind: 'recommended',
          recommendations: [panasonic],
        }}
        onLutProfileSelect={onLutProfileSelect}
      />,
    )

    expect(screen.getByLabelText('Search LUT contract')).toBeInTheDocument()

    await userEvent.click(
      screen.getByRole('button', {
        name: 'Use Panasonic V-Gamut / V-Log as LUT input',
      }),
    )
    await userEvent.type(
      screen.getByLabelText('Search LUT contract'),
      'display srgb',
    )
    await userEvent.click(
      screen.getByRole('button', {
        name: 'Use Display sRGB as LUT output',
      }),
    )

    const selectedProfile = onLutProfileSelect.mock.calls[0]?.[0]
    expect(selectedProfile).toEqual(
      expect.objectContaining({
        inputGamut: 'v-gamut',
        inputTransfer: 'v-log',
        outputGamut: 'srgb-rec709',
        outputTransfer: 'srgb',
      }),
    )

    rerender(
      <MobileLutBrowser
        {...baseProps}
        initialContractEditorOpen
        currentLutName="unknown-client-look.cube"
        lutProfileSelection={{
          status: 'confirmed',
          fingerprint: 'lut-fingerprint',
          profileId: selectedProfile.id,
          confidence: 'user',
        }}
        lutProfileResolution={{
          kind: 'confirmed',
          profile: selectedProfile,
          confidence: 'user',
        }}
        onLutProfileSelect={onLutProfileSelect}
      />,
    )

    expect(screen.getByText('Resolved')).toBeInTheDocument()
    expect(
      screen.queryByLabelText('Search LUT contract'),
    ).not.toBeInTheDocument()
  })

  it('resets the sheet scroll position after resolving a contract', async () => {
    const panasonic = getLUTColorProfile('panasonic-vgamut-vlog')!
    render(
      <MobileLutBrowser
        {...baseProps}
        initialContractEditorOpen
        currentLutName="unknown-client-look.cube"
        lutProfileSelection={{
          status: 'recommended',
          fingerprint: 'lut-fingerprint',
          title: 'Unknown client look',
          sourceName: 'unknown-client-look.cube',
          recommendations: [panasonic],
        }}
        lutProfileResolution={{
          kind: 'recommended',
          recommendations: [panasonic],
        }}
      />,
    )

    const dialog = screen.getByRole('dialog')
    const sheetBody = Array.from(dialog.children).find((child) =>
      child.className.includes('overflow-y-auto'),
    ) as HTMLElement | undefined
    expect(sheetBody).toBeDefined()
    sheetBody!.scrollTop = 96

    await userEvent.click(
      screen.getByRole('button', {
        name: 'Use Panasonic V-Gamut / V-Log as LUT input',
      }),
    )
    await userEvent.type(
      screen.getByLabelText('Search LUT contract'),
      'display srgb',
    )
    await userEvent.click(
      screen.getByRole('button', {
        name: 'Use Display sRGB as LUT output',
      }),
    )

    expect(sheetBody!.scrollTop).toBe(0)
  })

  it('lets a resolved mobile LUT contract be changed when auto-detection was wrong', async () => {
    const onLutProfileSelect = vi.fn()
    const detectedProfile = {
      ...getLUTColorProfile('panasonic-vgamut-vlog')!,
      role: 'combined-look-output' as const,
      outputGamut: 'srgb-rec709' as const,
      outputTransfer: 'bt709' as const,
      outputRange: 'full' as const,
    }
    render(
      <MobileLutBrowser
        {...baseProps}
        currentLutName="wrong-detected-look.cube"
        lutProfileSelection={{
          status: 'confirmed',
          fingerprint: 'lut-fingerprint',
          profileId: detectedProfile.id,
          confidence: 'metadata',
        }}
        lutProfileResolution={{
          kind: 'confirmed',
          profile: detectedProfile,
          confidence: 'metadata',
        }}
        onLutProfileSelect={onLutProfileSelect}
      />,
    )

    expect(screen.getByText('Panasonic V-Gamut / V-Log')).toBeInTheDocument()
    expect(screen.getByText('Rec.709 display')).toBeInTheDocument()

    await userEvent.click(
      screen.getByRole('button', { name: /change lut contract/i }),
    )
    await userEvent.type(
      screen.getByLabelText('Search LUT contract'),
      'sony slog3',
    )
    await userEvent.click(
      screen.getByRole('button', {
        name: 'Use Sony S-Gamut3.Cine / S-Log3 as LUT input',
      }),
    )
    await userEvent.clear(screen.getByLabelText('Search LUT contract'))
    await userEvent.type(
      screen.getByLabelText('Search LUT contract'),
      'display srgb',
    )
    await userEvent.click(
      screen.getByRole('button', {
        name: 'Use Display sRGB as LUT output',
      }),
    )

    expect(onLutProfileSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        inputGamut: 's-gamut3-cine',
        inputTransfer: 's-log3',
        outputGamut: 'srgb-rec709',
        outputTransfer: 'srgb',
        outputRange: 'full',
      }),
    )
  })

  it('marks the resolved mobile LUT output contract as active', async () => {
    const sonyProfile = getLUTColorProfile('sony-sgamut3cine-slog3')!
    const resolvedProfile = {
      ...sonyProfile,
      role: 'combined-look-output' as const,
      outputGamut: 'srgb-rec709' as const,
      outputTransfer: 'srgb' as const,
      outputRange: 'full' as const,
    }

    render(
      <MobileLutBrowser
        {...baseProps}
        currentLutName="SLog3SGamut3.CineToLC_709.cube"
        lutProfileSelection={{
          status: 'confirmed',
          fingerprint: 'stable-catalog-lut',
          profileId: resolvedProfile.id,
          confidence: 'metadata',
        }}
        lutProfileResolution={{
          kind: 'confirmed',
          profile: resolvedProfile,
          confidence: 'metadata',
        }}
      />,
    )

    await userEvent.click(
      screen.getByRole('button', { name: /change lut contract/i }),
    )
    await userEvent.click(screen.getByRole('tab', { name: 'Output' }))

    expect(
      screen.getByRole('button', {
        name: 'Use Rec.709 display as LUT output',
      }),
    ).toHaveAttribute('aria-pressed', 'true')
  })

  describe('recommended state in the overview contract section', () => {
    // A complete recommendation has input + output fields — completesContract=true
    const completeRecommendation = {
      ...getLUTColorProfile('panasonic-vgamut-vlog')!,
      role: 'combined-look-output' as const,
      outputGamut: 'srgb-rec709' as const,
      outputTransfer: 'gamma24' as const,
      outputRange: 'full' as const,
    }

    // An input-only recommendation has no output fields — completesContract=false
    const inputOnlyRecommendation = getLUTColorProfile('panasonic-vgamut-vlog')!

    function renderRecommendedOverview(
      recommendation:
        | typeof completeRecommendation
        | typeof inputOnlyRecommendation,
      onLutProfileSelect = vi.fn(),
    ) {
      return render(
        <MobileLutBrowser
          {...baseProps}
          currentLutName="film-look.cube"
          lutProfileSelection={{
            status: 'recommended',
            fingerprint: 'lut-fp',
            title: 'Film look',
            sourceName: 'film-look.cube',
            recommendations: [recommendation],
          }}
          lutProfileResolution={{
            kind: 'recommended',
            recommendations: [recommendation],
          }}
          onLutProfileSelect={onLutProfileSelect}
        />,
      )
    }

    it('shows the recommended input chip with a recommended marker in the overview', () => {
      renderRecommendedOverview(completeRecommendation)

      const contractSection = screen
        .getByRole('heading', { name: /contract profile/i })
        .closest('section')!

      // Input chip should include the profile label and "recommended" badge
      expect(
        within(contractSection).getByText(/panasonic v-gamut \/ v-log/i),
      ).toBeInTheDocument()
      expect(
        within(contractSection).getByText(/recommended/i),
      ).toBeInTheDocument()
    })

    it('shows the output chip with the resolved output label for a complete recommendation', () => {
      renderRecommendedOverview(completeRecommendation)

      const contractSection = screen
        .getByRole('heading', { name: /contract profile/i })
        .closest('section')!

      // Output chip for gamma24/srgb-rec709 maps to "Rec.709 display"
      expect(
        within(contractSection).getByText('Rec.709 display'),
      ).toBeInTheDocument()
    })

    it('shows "Choose output" chip for an input-only recommendation', () => {
      renderRecommendedOverview(inputOnlyRecommendation)

      const contractSection = screen
        .getByRole('heading', { name: /contract profile/i })
        .closest('section')!

      // "Choose output" appears both in the output chip and in the inline
      // choose-output button — confirm at least one instance is present.
      const matches = within(contractSection).getAllByText('Choose output')
      expect(matches.length).toBeGreaterThanOrEqual(1)
    })

    it('calls onLutProfileSelect with the recommendation when the apply-contract button is clicked (complete)', async () => {
      const onLutProfileSelect = vi.fn()
      renderRecommendedOverview(completeRecommendation, onLutProfileSelect)

      const button = document.querySelector(
        '[data-raw-mobile-lut="apply-contract"]',
      ) as HTMLButtonElement | null

      expect(button).not.toBeNull()
      await userEvent.click(button!)

      expect(onLutProfileSelect).toHaveBeenCalledWith(
        expect.objectContaining({
          inputGamut: completeRecommendation.inputGamut,
          outputGamut: 'srgb-rec709',
          outputTransfer: 'gamma24',
        }),
      )
    })

    it('opens the contract view at the output step with the recommendation as draft when choose-output is clicked (input-only)', async () => {
      renderRecommendedOverview(inputOnlyRecommendation)

      const button = document.querySelector(
        '[data-raw-mobile-lut="choose-output"]',
      ) as HTMLButtonElement | null

      expect(button).not.toBeNull()
      await userEvent.click(button!)

      // Should transition to the contract view
      expect(screen.getByRole('dialog')).toHaveAttribute(
        'data-mobile-lut-view',
        'contract',
      )
      // Should be on the output step (Output tab selected)
      const panels = screen.getByRole('tablist', {
        name: 'LUT contract panels',
      })
      expect(
        within(panels).getByRole('tab', { name: 'Output', selected: true }),
      ).toBeInTheDocument()
    })
  })
})
