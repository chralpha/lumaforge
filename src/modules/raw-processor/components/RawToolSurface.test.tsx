import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'jotai'
import { describe, expect, it, vi } from 'vitest'

import { viewportAtom } from '~/atoms/viewport'
import { jotaiStore } from '~/lib/jotai'

import type { UseOnlineLutSourcesResult } from '../hooks/useOnlineLutSources'
import {
  DEFAULT_OPEN_TOOL_CARDS,
  toolCardOpenAtom,
} from '../state/tool-card.atoms'
import { LutDropzone } from './Dropzone'
import { RawToolSurface } from './RawToolSurface'

const baseProps = {
  activeIntensity: 'standard' as const,
  tone: {
    userExposureEv: 0,
    userContrast: 0,
    userHighlights: 0,
    userShadows: 0,
    userWhites: 0,
    userBlacks: 0,
  },
  onIntensitySelect: vi.fn(),
  onToneChange: vi.fn(),
  onToneReset: vi.fn(),
  onCompareReset: vi.fn(),
  viewMode: 'processed' as const,
  onViewModeChange: vi.fn(),
  compareSplit: 0.5,
  onCompareSplitChange: vi.fn(),
  fileName: 'DSC09142.ARW',
  onReplaceFile: vi.fn(),
  onResetSession: vi.fn(),
  onLutLoad: vi.fn(),
  onLutClear: vi.fn(),
  onLutProfileSelect: vi.fn(),
  onExport: vi.fn(),
  canExport: false,
  disabledReason: 'Full-resolution export source is still loading.',
  isProcessing: false,
  exportResult: null,
  exportShareCapability: {
    available: false as const,
    reason: 'Export a JPEG before sharing.',
  },
  histogram: { state: 'unavailable' as const, reason: 'no-image' as const },
  onShareExport: vi.fn(),
  onDownloadExport: vi.fn(),
  onCopyExport: vi.fn(),
  hasImage: false,
  currentLutName: null,
  lutProfileSelection: null,
  lutProfileResolution: null,
  supportLevel: 'experimental' as const,
  metadata: null,
  stats: null,
}

function onlineLutSourcesFixture(
  overrides: Partial<UseOnlineLutSourcesResult> = {},
): UseOnlineLutSourcesResult {
  return {
    state: {
      resources: [
        {
          id: 'source-1',
          url: 'https://profiles.example.com/releases/v2026.05.01/catalog.json',
          type: 'catalog',
          label: 'Catalog from profiles.example.com',
          fromQuery: true,
        },
      ],
      entries: [
        {
          id: 'kodak-2383-rec709',
          resourceId: 'source-1',
          title: 'Kodak 2383 Rec.709',
          sourceUrl:
            'https://profiles.example.com/releases/v2026.05.01/entries/kodak-2383-rec709.json',
          sourceType: 'catalog-entry',
          cube: {
            url: 'https://profiles.example.com/blobs/kodak-2383-rec709.cube',
            sha256:
              '9c56cc51b374c3ba189210d5b6d4bf57790d351c96c47c02190ecf1e430635ab',
            bytes: 12,
            title: 'Kodak 2383 Rec.709',
          },
          tags: [],
          trustedContract: {
            role: 'combined-look-output',
            inputGamut: 'arri-wide-gamut-3',
            inputTransfer: 'logc3',
            outputGamut: 'srgb-rec709',
            outputTransfer: 'gamma24',
            outputRange: 'legal',
          },
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
    loadEntry: vi.fn(),
    share: {
      enabled: true,
      url: '/raw?luts=https%3A%2F%2Fprofiles.example.com%2Freleases%2Fv2026.05.01%2Fcatalog.json',
      copy: vi.fn().mockResolvedValue(undefined),
    },
    ...overrides,
  }
}

function getToneRegion() {
  return screen.getByRole('region', { name: 'Tone' })
}

function resetToolCards() {
  act(() => {
    jotaiStore.set(toolCardOpenAtom, DEFAULT_OPEN_TOOL_CARDS)
  })
}

describe('rawToolSurface', () => {
  beforeEach(() => {
    localStorage.clear()
    resetToolCards()
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
    resetToolCards()
    localStorage.clear()
  })

  it('renders the finishing surface with a card stack and a persistent export block', () => {
    const { container } = render(<RawToolSurface {...baseProps} />)
    expect(
      container.querySelector('[data-raw-tool-surface="raw-finishing"]'),
    ).toBeInTheDocument()
    // card stack present
    expect(
      screen.getByRole('group', { name: 'RAW finishing controls' }),
    ).toBeInTheDocument()
    // Look (LUT contract + strength) open by default → region present
    expect(
      screen.getAllByRole('region', { name: 'LUT contract' }).length,
    ).toBeGreaterThanOrEqual(1)
    expect(
      screen.getAllByRole('region', { name: 'Tone' }).length,
    ).toBeGreaterThanOrEqual(1)
    // Export is a persistent, non-collapsible region
    const exportRegion = screen.getByRole('region', { name: 'Export' })
    expect(exportRegion).toHaveAttribute('data-raw-export-block', 'persistent')
    // collapsed-by-default reference cards are not expanded
    expect(screen.queryByRole('region', { name: 'Histogram' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Compare' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'File facts' })).toBeNull()
    // but their triggers exist
    expect(
      screen.getByRole('button', { name: 'Histogram' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Compare' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'File facts' }),
    ).toBeInTheDocument()

    // Desktop branch renders the aside surface; the photo-first mobile
    // chrome is JS-gated and not mounted at the jsdom default width.
    expect(
      container.querySelector('[data-raw-mobile-lab]'),
    ).not.toBeInTheDocument()
    expect(
      container.querySelector('[data-raw-tool-surface="raw-finishing"]'),
    ).toBeInTheDocument()
  })
  it('reveals the histogram plot when its card is expanded', async () => {
    const user = userEvent.setup()
    const luma = new Uint32Array(256)
    const red = new Uint32Array(256)
    luma[0] = 1
    luma[255] = 1
    red[0] = 1
    red[255] = 1

    render(
      <RawToolSurface
        {...baseProps}
        hasImage
        histogram={{
          state: 'ready',
          source: 'quick',
          width: 2,
          height: 1,
          sampledPixels: 2,
          totalPixels: 2,
          bins: {
            luma,
            red,
            green: new Uint32Array(256),
            blue: new Uint32Array(256),
          },
          clipping: {
            shadowAnyChannel: 1,
            highlightAnyChannel: 1,
            shadowLuma: 1,
            highlightLuma: 1,
          },
          diagnostics: {
            ownership: 'main-thread-chunked-no-copy',
            copiedInputBytes: 0,
            transferredInput: false,
            inputByteLength: 12,
            rowBandRows: 32,
          },
        }}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Histogram' }))
    const regions = await screen.findAllByRole('region', { name: 'Histogram' })
    expect(regions.length).toBeGreaterThanOrEqual(1)
    expect(
      within(regions[0]).getByLabelText('Preview luminance and RGB histogram'),
    ).toBeInTheDocument()
  })

  it('shows unsupported histogram state without stale bins', async () => {
    render(
      <RawToolSurface
        {...baseProps}
        hasImage
        histogram={{
          state: 'unsupported',
          reason:
            'Built-in styles are not supported by full-resolution JPEG export.',
        }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Histogram' }))
    const regions = await screen.findAllByRole('region', { name: 'Histogram' })
    expect(regions.length).toBeGreaterThanOrEqual(1)
    const histogram = regions[0]

    expect(within(histogram).getByText('Unsupported')).toBeInTheDocument()
    expect(
      within(histogram).queryByLabelText('Preview luminance and RGB histogram'),
    ).not.toBeInTheDocument()
  })

  it('sends normalized tone changes and calls tone reset', async () => {
    const user = userEvent.setup()
    const onToneChange = vi.fn()
    const onToneReset = vi.fn()
    render(
      <RawToolSurface
        {...baseProps}
        hasImage
        tone={{
          userExposureEv: 0,
          userContrast: 0,
          userHighlights: 0,
          userShadows: 0,
          userWhites: 0,
          userBlacks: 0,
        }}
        onToneChange={onToneChange}
        onToneReset={onToneReset}
      />,
    )

    const tone = getToneRegion()

    expect(within(tone).getByText('Exposure')).toBeInTheDocument()
    expect(within(tone).getByText('Contrast')).toBeInTheDocument()
    expect(within(tone).getByText('Highlights')).toBeInTheDocument()
    expect(within(tone).getByText('Shadows')).toBeInTheDocument()
    expect(within(tone).getByText('Whites')).toBeInTheDocument()
    expect(within(tone).getByText('Blacks')).toBeInTheDocument()

    const exposure = within(tone).getByRole('slider', { name: 'Exposure' })
    const exposureLabelledBy = exposure.getAttribute('aria-labelledby')
    expect(exposureLabelledBy).toBeTruthy()
    expect(
      exposure.ownerDocument.getElementById(exposureLabelledBy!),
    ).toHaveTextContent('Exposure')
    exposure.focus()
    await user.keyboard('{ArrowRight}')
    expect(onToneChange).toHaveBeenLastCalledWith({ userExposureEv: 0.01 })

    const highlights = within(tone).getByRole('slider', { name: 'Highlights' })
    highlights.focus()
    await user.keyboard('{ArrowLeft}')
    expect(onToneChange).toHaveBeenLastCalledWith({ userHighlights: -1 })

    await user.click(screen.getByRole('button', { name: 'Reset tone' }))
    expect(onToneReset).toHaveBeenCalledTimes(1)
    expect(
      screen.getByRole('button', { name: 'Reset tone' }),
    ).toBeInTheDocument()
  })

  it('disables tone controls before upload', async () => {
    render(<RawToolSurface {...baseProps} />)

    const tone = getToneRegion()
    expect(
      within(tone).getByRole('slider', { name: 'Exposure' }),
    ).toHaveAttribute('data-disabled')
    expect(
      within(tone).getByRole('slider', { name: 'Contrast' }),
    ).toHaveAttribute('data-disabled')
    expect(
      within(tone).getByRole('slider', { name: 'Highlights' }),
    ).toHaveAttribute('data-disabled')
    expect(
      within(tone).getByRole('slider', { name: 'Shadows' }),
    ).toHaveAttribute('data-disabled')
    expect(
      within(tone).getByRole('slider', { name: 'Whites' }),
    ).toHaveAttribute('data-disabled')
    expect(
      within(tone).getByRole('slider', { name: 'Blacks' }),
    ).toHaveAttribute('data-disabled')
    expect(screen.getByRole('button', { name: 'Reset tone' })).toBeDisabled()
  })

  it('disables preview-dependent editing while the preview is released after export', () => {
    render(<RawToolSurface {...baseProps} hasImage previewSuspended />)

    const tone = getToneRegion()
    expect(
      within(tone).getByRole('slider', { name: 'Exposure' }),
    ).toHaveAttribute('data-disabled')
    expect(screen.getByRole('button', { name: 'Reset tone' })).toBeDisabled()
    expect(screen.getByLabelText(/add \.cube lut/i)).toBeDisabled()
  })

  it('uses Raw Lab-specific reset controls for tone and compare', async () => {
    const user = userEvent.setup()
    const onCompareReset = vi.fn()
    render(
      <RawToolSurface
        {...baseProps}
        hasImage
        onCompareReset={onCompareReset}
      />,
    )

    expect(
      screen.getByRole('button', { name: 'Reset tone' }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Compare' }))
    await user.click(screen.getByRole('button', { name: 'Reset compare view' }))

    expect(onCompareReset).toHaveBeenCalledTimes(1)
  })

  it('selects a strength level', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <RawToolSurface
        {...baseProps}
        hasImage
        currentLutName="Sony Look.cube"
        onIntensitySelect={onChange}
      />,
    )

    expect(screen.getByRole('tab', { name: 'Off' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Light' })).toBeInTheDocument()
    expect(
      screen.getByRole('tablist', { name: 'Strength' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Standard' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByRole('tab', { name: 'Strong' })).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Strong' }))

    expect(onChange).toHaveBeenCalledWith('strong')
  })

  it('selects the next strength level with keyboard arrows', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <RawToolSurface
        {...baseProps}
        hasImage
        currentLutName="Sony Look.cube"
        onIntensitySelect={onChange}
      />,
    )

    const strength = screen.getByRole('tablist', { name: 'Strength' })
    const standard = within(strength).getByRole('tab', { name: 'Standard' })

    expect(standard).toHaveAttribute('tabIndex', '0')

    standard.focus()
    await user.keyboard('{ArrowRight}')

    expect(onChange).toHaveBeenCalledWith('strong')
    expect(within(strength).getByRole('tab', { name: 'Strong' })).toHaveFocus()
  })

  it('updates selected strength from props without remounting the tablist', () => {
    const { rerender } = render(
      <RawToolSurface
        {...baseProps}
        hasImage
        currentLutName="Sony Look.cube"
      />,
    )

    const strength = screen.getByRole('tablist', { name: 'Strength' })
    expect(
      within(strength).getByRole('tab', { name: 'Standard' }),
    ).toHaveAttribute('aria-selected', 'true')

    rerender(
      <RawToolSurface
        {...baseProps}
        hasImage
        currentLutName="Sony Look.cube"
        activeIntensity="strong"
      />,
    )

    const updatedStrength = screen.getByRole('tablist', { name: 'Strength' })
    expect(updatedStrength).toBe(strength)
    expect(
      within(updatedStrength).getByRole('tab', { name: 'Strong' }),
    ).toHaveAttribute('aria-selected', 'true')
  })

  it('keeps controlled strength selection when the parent rejects a change', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const { rerender } = render(
      <RawToolSurface
        {...baseProps}
        hasImage
        currentLutName="Sony Look.cube"
        onIntensitySelect={onChange}
      />,
    )

    const strength = screen.getByRole('tablist', { name: 'Strength' })

    await user.click(within(strength).getByRole('tab', { name: 'Strong' }))

    expect(onChange).toHaveBeenCalledWith('strong')

    rerender(
      <RawToolSurface
        {...baseProps}
        hasImage
        currentLutName="Sony Look.cube"
        activeIntensity="standard"
        onIntensitySelect={onChange}
      />,
    )

    expect(
      within(strength).getByRole('tab', { name: 'Standard' }),
    ).toHaveAttribute('aria-selected', 'true')
    expect(
      within(strength).getByRole('tab', { name: 'Strong' }),
    ).toHaveAttribute('aria-selected', 'false')
  })

  it('keeps strength disabled for catalog-only online LUT sources', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <RawToolSurface
        {...baseProps}
        hasImage
        onlineLutSources={onlineLutSourcesFixture()}
        onIntensitySelect={onChange}
      />,
    )

    const strength = screen.getByRole('tablist', { name: 'Strength' })
    const strong = within(strength).getByRole('tab', { name: 'Strong' })

    expect(strong).toBeDisabled()
    expect(strong).toHaveAttribute('aria-disabled', 'true')

    await user.click(strong)

    expect(onChange).not.toHaveBeenCalled()
  })

  it('disables strength tabs before upload', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<RawToolSurface {...baseProps} onIntensitySelect={onChange} />)

    const strength = screen.getByRole('tablist', { name: 'Strength' })
    const strong = within(strength).getByRole('tab', { name: 'Strong' })

    expect(strong).toBeDisabled()
    expect(strong).toHaveAttribute('aria-disabled', 'true')

    await user.click(strong)

    expect(onChange).not.toHaveBeenCalled()
  })

  it('does not select disabled strength tabs from keyboard input', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<RawToolSurface {...baseProps} onIntensitySelect={onChange} />)

    const strength = screen.getByRole('tablist', { name: 'Strength' })
    const standard = within(strength).getByRole('tab', { name: 'Standard' })

    standard.focus()
    await user.keyboard('{ArrowRight}')

    expect(onChange).not.toHaveBeenCalled()
  })

  it('shows preserved tone state for non-neutral tone', () => {
    render(
      <RawToolSurface
        {...baseProps}
        hasImage
        tone={{
          userExposureEv: 0,
          userContrast: 0,
          userHighlights: -40,
          userShadows: 40,
          userWhites: -20,
          userBlacks: 20,
        }}
      />,
    )

    expect(screen.getByText('Tone settings preserved')).toBeInTheDocument()
  })

  it('keeps long LUT names inside the tool column while preserving the full name', () => {
    const currentLut =
      'Fujifilm-GFX100RF-F-Log2C-to-Classic-Negative-Rec709-Display-Extremely-Long-Client-Delivery-Name.cube'

    render(<LutDropzone currentLut={currentLut} onFileDrop={vi.fn()} />)

    const label = screen.getByLabelText(/add \.cube lut/i)
    const frame = label.closest('label')
    const fileName = screen.getByText(currentLut)

    expect(frame).toHaveAttribute('data-raw-lut', 'dropzone')
    expect(fileName).toHaveAttribute('title', currentLut)
  })

  it('renders online LUT sources as collapsed summary rows by default', () => {
    const { container } = render(
      <RawToolSurface
        {...baseProps}
        onlineLutSources={onlineLutSourcesFixture()}
      />,
    )

    expect(
      screen.getByText('Catalog from profiles.example.com'),
    ).toBeInTheDocument()
    expect(screen.getByText('1 LUT')).toBeInTheDocument()
    expect(
      screen.getByRole('button', {
        name: 'Open Catalog from profiles.example.com',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', {
        name: 'Refresh Catalog from profiles.example.com',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', {
        name: 'Remove Catalog from profiles.example.com',
      }),
    ).toBeInTheDocument()

    expect(screen.queryByText('Kodak 2383 Rec.709')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Load Kodak 2383 Rec.709' }),
    ).not.toBeInTheDocument()
    expect(container.querySelector('[data-raw-lut="source-entry"]')).toBeNull()
  })

  it('closes the online LUT browser with Escape or outside click and restores focus', async () => {
    const user = userEvent.setup()
    render(
      <RawToolSurface
        {...baseProps}
        onlineLutSources={onlineLutSourcesFixture()}
      />,
    )

    const open = screen.getByRole('button', {
      name: 'Open Catalog from profiles.example.com',
    })

    await user.click(open)
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(open).toHaveFocus()

    await user.click(open)
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    const overlay = document.querySelector('[data-raw-lut-browser-overlay]')
    expect(overlay).toBeInTheDocument()
    await user.click(overlay as HTMLElement)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(open).toHaveFocus()
  })

  it('acks an online LUT entry load click before the load resolves', async () => {
    const user = userEvent.setup()
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
        <RawToolSurface
          {...baseProps}
          onlineLutSources={onlineLutSourcesFixture({ loadEntry })}
        />,
      )

      await user.click(
        screen.getByRole('button', {
          name: 'Open Catalog from profiles.example.com',
        }),
      )

      const loadButton = screen.getByRole('button', {
        name: /load kodak 2383 rec.709/i,
      })
      expect(loadButton).not.toHaveAttribute('aria-busy', 'true')

      await user.click(loadButton)

      await screen.findByRole('button', {
        name: /load kodak 2383 rec.709/i,
        busy: true,
      })
      expect(loadEntry).not.toHaveBeenCalled()

      await act(async () => {
        const queued = rafQueue.splice(0)
        for (const callback of queued) callback(performance.now())
        await Promise.resolve()
      })
      expect(loadEntry).toHaveBeenCalledWith('kodak-2383-rec709')

      await act(async () => {
        loadHandle.resolve?.()
        await new Promise((resolve) => setTimeout(resolve, 0))
      })

      expect(
        screen.queryByRole('dialog', {
          name: 'Catalog from profiles.example.com LUTs',
        }),
      ).not.toBeInTheDocument()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('does not add search, filtering, sorting, favorites, or catalog-management controls to source UI', async () => {
    const user = userEvent.setup()
    render(
      <RawToolSurface
        {...baseProps}
        onlineLutSources={onlineLutSourcesFixture()}
      />,
    )

    await user.click(
      screen.getByRole('button', {
        name: 'Open Catalog from profiles.example.com',
      }),
    )

    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', {
        name: /search|filter|sort|favorite|manage|catalog management/i,
      }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByPlaceholderText(/search|filter/i),
    ).not.toBeInTheDocument()
  })

  it('keeps manual upload visible beside online source controls', () => {
    render(
      <RawToolSurface
        {...baseProps}
        onlineLutSources={onlineLutSourcesFixture()}
      />,
    )

    expect(screen.getByLabelText(/add \.cube lut/i)).toBeInTheDocument()
  })

  it('reflects online LUT share availability on the share button', () => {
    const { rerender } = render(
      <RawToolSurface
        {...baseProps}
        onlineLutSources={onlineLutSourcesFixture({
          share: {
            enabled: false,
            url: '/raw',
            copy: vi.fn().mockResolvedValue(undefined),
          },
        })}
      />,
    )

    expect(
      screen.getByRole('button', { name: 'Copy LUT source link' }),
    ).toBeDisabled()

    rerender(
      <RawToolSurface
        {...baseProps}
        onlineLutSources={onlineLutSourcesFixture()}
      />,
    )

    expect(
      screen.getByRole('button', { name: 'Copy LUT source link' }),
    ).toBeEnabled()
  })

  it('uses Raw Lab-specific materials for LUT contract controls', () => {
    render(
      <RawToolSurface
        {...baseProps}
        currentLutName="Unknown Look.cube"
        lutProfileSelection={{
          status: 'pending',
          fingerprint: 'lut-contract-materials',
          title: 'Unknown Look',
          suggestions: [],
        }}
        lutProfileResolution={{
          kind: 'needs-user-selection',
          suggestions: [],
        }}
      />,
    )

    expect(
      screen.getByText(
        'Choose the LUT input and output contract before preview or export.',
      ),
    ).toHaveAttribute('data-raw-lut', 'contract-status')
    expect(
      screen.getByRole('button', { name: 'Change LUT contract' }),
    ).toHaveAttribute('data-raw-lut', 'contract-change-button')
  })

  it('shows a busy refresh affordance while an online LUT source is loading', () => {
    render(
      <RawToolSurface
        {...baseProps}
        onlineLutSources={onlineLutSourcesFixture({
          state: {
            ...onlineLutSourcesFixture().state,
            entries: [],
            activeResourceId: 'source-1',
            isLoading: true,
          },
        })}
      />,
    )

    const refresh = screen.getByRole('button', {
      name: 'Refresh Catalog from profiles.example.com',
    })

    expect(refresh).toHaveAttribute('aria-busy', 'true')
    expect(refresh).toHaveAttribute('data-raw-lut-busy', 'true')
    expect(screen.getByText('Loading')).toBeInTheDocument()
  })

  it('announces online LUT source issues as status updates', () => {
    render(
      <RawToolSurface
        {...baseProps}
        onlineLutSources={onlineLutSourcesFixture({
          state: {
            ...onlineLutSourcesFixture().state,
            issues: [
              {
                code: 'network',
                message: 'Failed to fetch online profile resource.',
                resourceId: 'source-1',
              },
            ],
          },
        })}
      />,
    )

    const resource = screen
      .getByRole('button', {
        name: /open catalog/i,
      })
      .closest('[data-raw-lut="source-resource"]') as HTMLElement
    expect(resource).not.toBeNull()
    const status = within(resource).getByRole('status')

    expect(status).toHaveAttribute('aria-live', 'polite')
    expect(status).toHaveTextContent('Failed to fetch online profile resource.')
    expect(within(resource).getByText('Issue')).toBeInTheDocument()
  })

  it('mobile + no image shows the darkroom onboarding lifecycle state', () => {
    const prev = jotaiStore.get(viewportAtom)
    jotaiStore.set(viewportAtom, { ...prev, w: 390, sm: false })
    try {
      const { container } = render(
        <Provider store={jotaiStore}>
          <RawToolSurface {...baseProps} hasImage={false} />
        </Provider>,
      )
      expect(container.querySelector('[data-raw-mobile-lab]')).toHaveClass(
        'pointer-events-none',
      )
      expect(container.querySelector('[data-mobile-empty-state]')).toHaveClass(
        'pointer-events-auto',
      )
      expect(
        screen.getByRole('heading', { name: /drop a raw to start/i }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /browse raw files/i }),
      ).toBeInTheDocument()
      expect(screen.getByText(/pre-stage a lut/i)).toBeInTheDocument()
      expect(container.querySelector('[data-mobile-topbar]')).toBeNull()
      expect(screen.queryByRole('tablist', { name: /lab modes/i })).toBeNull()
      expect(
        container.querySelector('[data-testid="mobile-peek-surface"]'),
      ).toBeNull()
      expect(
        screen.queryByRole('tablist', { name: /tone parameters/i }),
      ).toBeNull()
      // desktop aside not mounted on mobile
      expect(
        container.querySelector('[data-raw-tool-surface="raw-finishing"]'),
      ).toBeNull()
    } finally {
      jotaiStore.set(viewportAtom, prev)
    }
  })

  it('mobile + image mounts the photo-first chrome', () => {
    const prev = jotaiStore.get(viewportAtom)
    jotaiStore.set(viewportAtom, { ...prev, w: 390, sm: false })
    try {
      const { container } = render(
        <Provider store={jotaiStore}>
          <RawToolSurface {...baseProps} hasImage />
        </Provider>,
      )
      expect(container.querySelector('[data-raw-mobile-lab]')).toHaveClass(
        'pointer-events-none',
      )
      expect(
        screen.getByRole('tablist', { name: /lab modes/i }).parentElement,
      ).toHaveClass('pointer-events-auto')
    } finally {
      jotaiStore.set(viewportAtom, prev)
    }
  })

  it('mobile keeps strength disabled for catalog-only online LUT sources', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const prev = jotaiStore.get(viewportAtom)
    jotaiStore.set(viewportAtom, { ...prev, w: 390, sm: false })
    try {
      render(
        <Provider store={jotaiStore}>
          <RawToolSurface
            {...baseProps}
            hasImage
            onlineLutSources={onlineLutSourcesFixture()}
            onIntensitySelect={onChange}
          />
        </Provider>,
      )

      const dock = screen.getByRole('tablist', { name: /lab modes/i })
      await user.click(within(dock).getByRole('tab', { name: /strength/i }))

      const strength = screen.getByRole('radiogroup', { name: 'Strength' })
      const strong = within(strength).getByRole('radio', { name: 'Strong' })

      expect(strong).toBeDisabled()
      expect(strength).toHaveAttribute('aria-disabled', 'true')

      await user.click(strong)

      expect(onChange).not.toHaveBeenCalled()
    } finally {
      jotaiStore.set(viewportAtom, prev)
    }
  })

  it('mobile lets the stage handoff receive touch while processing', () => {
    const prev = jotaiStore.get(viewportAtom)
    jotaiStore.set(viewportAtom, { ...prev, w: 390, sm: false })
    try {
      const { container } = render(
        <Provider store={jotaiStore}>
          <RawToolSurface {...baseProps} hasImage isProcessing />
        </Provider>,
      )

      expect(container.querySelector('[data-raw-mobile-lab]')).toHaveClass(
        'pointer-events-none',
      )
      expect(
        container.querySelector('[data-mobile-topbar]'),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('tablist', { name: /lab modes/i }),
      ).toBeInTheDocument()
    } finally {
      jotaiStore.set(viewportAtom, prev)
    }
  })

  it('mobile keeps export result actions reachable while the preview is released', () => {
    const prev = jotaiStore.get(viewportAtom)
    jotaiStore.set(viewportAtom, { ...prev, w: 390, sm: false })
    try {
      const { container } = render(
        <Provider store={jotaiStore}>
          <RawToolSurface
            {...baseProps}
            hasImage
            previewSuspended
            exportResult={{
              output: {
                kind: 'blob',
                filename: 'DSC09142_fullres.jpg',
                blob: new Blob(['jpeg'], { type: 'image/jpeg' }),
                byteLength: 4,
                mimeType: 'image/jpeg',
              },
              filename: 'DSC09142_fullres.jpg',
              width: 6000,
              height: 4000,
              size: 4,
              createdAt: 0,
              copyCapability: {
                mode: 'preview-size',
                label: 'Copy preview-size image',
                reason: 'Full-resolution copy is not available.',
              },
            }}
            exportShareCapability={{ available: true }}
          />
        </Provider>,
      )

      expect(container.querySelector('[data-raw-mobile-lab]')).toHaveClass(
        'pointer-events-none',
      )
      expect(
        container.querySelector('[data-mobile-released-export-actions]'),
      ).toHaveClass('pointer-events-auto')
      expect(
        screen.getByRole('button', { name: /download/i }),
      ).toBeInTheDocument()
      expect(screen.queryByRole('tablist', { name: /lab modes/i })).toBeNull()
    } finally {
      jotaiStore.set(viewportAtom, prev)
    }
  })

  it('mobile Compare defaults to hold-to-peek before exposing split reset', async () => {
    const user = userEvent.setup()
    const prev = jotaiStore.get(viewportAtom)
    jotaiStore.set(viewportAtom, { ...prev, w: 390, sm: false })
    try {
      render(
        <Provider store={jotaiStore}>
          <RawToolSurface {...baseProps} hasImage />
        </Provider>,
      )

      const dock = screen.getByRole('tablist', { name: /lab modes/i })
      await user.click(within(dock).getByRole('tab', { name: /compare/i }))

      expect(screen.getByText(/touch and hold the photo/i)).toBeInTheDocument()
      expect(
        screen.queryByText(/pins raw and final jpeg/i),
      ).not.toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: /reset compare view/i }),
      ).not.toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: /split compare/i }))
      expect(screen.getByText(/pins raw and final jpeg/i)).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /reset compare view/i }),
      ).toBeInTheDocument()
    } finally {
      jotaiStore.set(viewportAtom, prev)
    }
  })
})
