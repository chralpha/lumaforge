import { getLUTColorProfile } from '@lumaforge/luma-color-runtime'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
      copy: vi.fn(),
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

  it('loads an online LUT entry row', async () => {
    const loadEntry = vi.fn()
    render(
      <MobileLutBrowser
        {...baseProps}
        onlineLutSources={onlineLutSourcesFixture(loadEntry)}
      />,
    )

    await userEvent.click(
      screen.getByRole('button', { name: /load kodak 2383 rec.709/i }),
    )

    expect(loadEntry).toHaveBeenCalledWith('kodak-2383-rec709')
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

  it('lets an unresolved LUT choose input and output contracts from the mobile sheet', async () => {
    const onLutProfileSelect = vi.fn()
    render(
      <MobileLutBrowser
        {...baseProps}
        currentLutName="unknown-client-look.cube"
        lutProfileSelection={{
          status: 'pending',
          fingerprint: 'lut-fingerprint',
          title: 'Unknown client look',
          sourceName: 'unknown-client-look.cube',
          suggestions: [getLUTColorProfile('panasonic-vgamut-vlog')!],
        }}
        lutProfileResolution={{
          kind: 'needs-user-selection',
          suggestions: [getLUTColorProfile('panasonic-vgamut-vlog')!],
        }}
        onLutProfileSelect={onLutProfileSelect}
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
          status: 'pending',
          fingerprint: 'lut-fingerprint',
          title: 'Unknown client look',
          sourceName: 'unknown-client-look.cube',
          suggestions: [panasonic],
        }}
        lutProfileResolution={{
          kind: 'needs-user-selection',
          suggestions: [panasonic],
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
          status: 'resolved',
          fingerprint: 'lut-fingerprint',
          profileId: selectedProfile.id,
          confidence: 'user',
        }}
        lutProfileResolution={{
          kind: 'resolved',
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
          status: 'pending',
          fingerprint: 'lut-fingerprint',
          title: 'Unknown client look',
          sourceName: 'unknown-client-look.cube',
          suggestions: [panasonic],
        }}
        lutProfileResolution={{
          kind: 'needs-user-selection',
          suggestions: [panasonic],
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
          status: 'resolved',
          fingerprint: 'lut-fingerprint',
          profileId: detectedProfile.id,
          confidence: 'metadata',
        }}
        lutProfileResolution={{
          kind: 'resolved',
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
})
