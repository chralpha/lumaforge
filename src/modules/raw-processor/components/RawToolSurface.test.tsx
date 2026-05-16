import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

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
      copy: vi.fn(),
    },
    ...overrides,
  }
}

function multipleOnlineLutSourcesFixture(): UseOnlineLutSourcesResult {
  return onlineLutSourcesFixture({
    state: {
      resources: [
        {
          id: 'source-1',
          url: 'https://profiles.example.com/releases/v2026.05.01/catalog.json',
          type: 'catalog',
          label: 'Catalog from profiles.example.com',
          fromQuery: true,
        },
        {
          id: 'source-2',
          url: 'https://looks.example.net/catalog.json',
          type: 'catalog',
          label: 'Catalog from looks.example.net',
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
        {
          id: 'vision3-rec709',
          resourceId: 'source-2',
          title: 'Vision3 Rec.709',
          sourceUrl: 'https://looks.example.net/entries/vision3-rec709.json',
          sourceType: 'catalog-entry',
          cube: {
            url: 'https://looks.example.net/blobs/vision3-rec709.cube',
            sha256:
              'cc56cc51b374c3ba189210d5b6d4bf57790d351c96c47c02190ecf1e430635ab',
            bytes: 12,
            title: 'Vision3 Rec.709',
          },
          tags: [],
          trustedContract: {
            role: 'combined-look-output',
            inputGamut: 's-gamut3-cine',
            inputTransfer: 's-log3',
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
  })
}

function mockTriggerRect(element: HTMLElement, rect: Partial<DOMRect>) {
  return vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
    bottom: rect.bottom ?? 64,
    height: rect.height ?? 32,
    left: rect.left ?? 24,
    right: rect.right ?? 56,
    top: rect.top ?? 32,
    width: rect.width ?? 32,
    x: rect.x ?? rect.left ?? 24,
    y: rect.y ?? rect.top ?? 32,
    toJSON: () => ({}),
  } satisfies DOMRect)
}

async function clickOverlayAt(
  x: number,
  y: number,
  elementsAtPoint: Element[] = [],
) {
  const overlay = document.querySelector('[data-raw-lut-browser-overlay]')
  expect(overlay).toBeInTheDocument()
  const previousElementsFromPoint = document.elementsFromPoint
  const elementsFromPoint = vi.fn(() => [
    overlay as Element,
    ...elementsAtPoint,
  ])
  Object.defineProperty(document, 'elementsFromPoint', {
    configurable: true,
    value: elementsFromPoint,
  })

  try {
    await act(async () => {
      fireEvent.pointerDown(overlay as HTMLElement, {
        button: 0,
        buttons: 1,
        clientX: x,
        clientY: y,
        pointerId: 1,
        pointerType: 'mouse',
      })
      fireEvent.pointerUp(overlay as HTMLElement, {
        button: 0,
        clientX: x,
        clientY: y,
        pointerId: 1,
        pointerType: 'mouse',
      })
      fireEvent.click(overlay as HTMLElement, {
        button: 0,
        clientX: x,
        clientY: y,
      })
      await Promise.resolve()
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })
  } finally {
    if (previousElementsFromPoint) {
      Object.defineProperty(document, 'elementsFromPoint', {
        configurable: true,
        value: previousElementsFromPoint,
      })
    } else {
      Reflect.deleteProperty(document, 'elementsFromPoint')
    }
  }
}

function setWindowSize(width: number, height: number) {
  const previousWidth = window.innerWidth
  const previousHeight = window.innerHeight

  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: width,
  })
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    value: height,
  })

  return () => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: previousWidth,
    })
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: previousHeight,
    })
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

    const desktopCards = container.querySelector(
      '[data-raw-tool-surface] > div:first-child',
    )
    expect(desktopCards).toHaveClass('max-[640px]:hidden')
    expect(desktopCards).not.toHaveClass('lg:block')
  })

  it('shares cards and export between desktop stack and mobile sheet', async () => {
    const user = userEvent.setup()
    const { container } = render(<RawToolSurface {...baseProps} />)
    const surface = container.querySelector('[data-raw-tool-surface]')
    expect(surface).toHaveAttribute('data-raw-tool-sheet', 'closed')
    await user.click(screen.getByRole('button', { name: 'Tools' }))
    expect(surface).toHaveAttribute('data-raw-tool-sheet', 'open')
    const sheet = container.querySelector(
      '[data-raw-mobile-sheet]',
    ) as HTMLElement
    expect(
      within(sheet).getByRole('group', { name: 'RAW finishing controls' }),
    ).toBeInTheDocument()
    expect(
      within(sheet).getByRole('region', { name: 'Export' }),
    ).toHaveAttribute('data-raw-export-block', 'persistent')
  })

  it('opens the mobile sheet from a normal Export rail tap', async () => {
    const user = userEvent.setup()
    const { container } = render(<RawToolSurface {...baseProps} />)
    const surface = container.querySelector('[data-raw-tool-surface]')

    await user.click(screen.getByRole('button', { name: 'Export' }))

    expect(surface).toHaveAttribute('data-raw-tool-sheet', 'open')
    const sheet = container.querySelector(
      '[data-raw-mobile-sheet]',
    ) as HTMLElement
    expect(
      within(sheet).getByRole('region', { name: 'Export' }),
    ).toHaveAttribute('data-raw-export-block', 'persistent')
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
      <RawToolSurface {...baseProps} hasImage onIntensitySelect={onChange} />,
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
      <RawToolSurface {...baseProps} hasImage onIntensitySelect={onChange} />,
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
    const { rerender } = render(<RawToolSurface {...baseProps} hasImage />)

    const strength = screen.getByRole('tablist', { name: 'Strength' })
    expect(
      within(strength).getByRole('tab', { name: 'Standard' }),
    ).toHaveAttribute('aria-selected', 'true')

    rerender(
      <RawToolSurface {...baseProps} hasImage activeIntensity="strong" />,
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
      <RawToolSurface {...baseProps} hasImage onIntensitySelect={onChange} />,
    )

    const strength = screen.getByRole('tablist', { name: 'Strength' })

    await user.click(within(strength).getByRole('tab', { name: 'Strong' }))

    expect(onChange).toHaveBeenCalledWith('strong')

    rerender(
      <RawToolSurface
        {...baseProps}
        hasImage
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

  it('triggers quick export on long press of the Export rail tab', async () => {
    const user = userEvent.setup()
    const onExport = vi.fn()
    render(
      <RawToolSurface {...baseProps} hasImage canExport onExport={onExport} />,
    )

    const exportTab = screen.getByRole('button', { name: 'Export' })
    await user.pointer({ keys: '[MouseLeft>]', target: exportTab })
    await new Promise((resolve) => setTimeout(resolve, 600))
    await user.pointer({ keys: '[/MouseLeft]' })

    expect(onExport).toHaveBeenCalledWith({
      quality: 'high',
      fidelity: 'balanced',
    })
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

  it('opens online LUT entries in a floating browser with compact rows', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <RawToolSurface
        {...baseProps}
        onlineLutSources={onlineLutSourcesFixture()}
      />,
    )

    const open = screen.getByRole('button', {
      name: 'Open Catalog from profiles.example.com',
    })

    expect(open).toHaveAttribute('aria-haspopup', 'dialog')
    expect(open).toHaveAttribute('aria-expanded', 'false')
    expect(open).toHaveAttribute('aria-controls')

    await user.click(open)

    const browser = screen.getByRole('dialog', {
      name: 'Catalog from profiles.example.com LUTs',
    })
    const browserList = browser.querySelector(
      '[data-raw-lut="source-browser-list"]',
    )

    expect(open).toHaveAttribute('aria-expanded', 'true')
    expect(open).toHaveAttribute('aria-controls', browser.id)
    expect(
      within(browser).getByRole('button', {
        name: 'Close LUT source browser',
      }),
    ).toHaveFocus()
    expect(browser).toHaveAttribute('data-raw-lut-browser-dialog', 'source')
    expect(browser).toHaveAttribute('data-lut-source-placement', 'anchored')
    expect(
      browser.style.getPropertyValue('--raw-lut-source-browser-top'),
    ).not.toBe('')
    expect(browserList).toHaveAttribute('data-lut-source-scroll', 'internal')
    expect(browser.closest('[data-raw-lut="source-controls"]')).toBeNull()
    expect(
      container.querySelector(
        '[data-raw-lut="source-controls"] [data-raw-lut="source-resource"] [data-raw-lut="source-entry"]',
      ),
    ).toBeNull()

    expect(within(browser).getByText('Kodak 2383 Rec.709')).toBeInTheDocument()
    expect(
      within(browser).getAllByText('Catalog from profiles.example.com'),
    ).toHaveLength(1)
    expect(
      within(browser).getByRole('button', {
        name: 'Load Kodak 2383 Rec.709',
      }),
    ).toBeInTheDocument()

    const entryRow = within(browser)
      .getByText('Kodak 2383 Rec.709')
      .closest('[data-raw-lut="source-entry"]')
    expect(entryRow).not.toBeNull()
    const entry = within(entryRow as HTMLElement)

    expect(entry.queryByText(/input contract/i)).not.toBeInTheDocument()
    expect(entry.queryByText(/output contract/i)).not.toBeInTheDocument()
    expect(entry.queryByText(/license/i)).not.toBeInTheDocument()
    expect(entry.queryByText(/cache/i)).not.toBeInTheDocument()
    expect(entry.queryByText(/sha256/i)).not.toBeInTheDocument()
    expect(entry.queryByText(/hash/i)).not.toBeInTheDocument()
    expect(entry.queryByText(/12\s*bytes/i)).not.toBeInTheDocument()
  })

  it('docks the online LUT browser inside a short desktop viewport', async () => {
    const restoreWindowSize = setWindowSize(980, 420)
    const user = userEvent.setup()

    try {
      render(
        <RawToolSurface
          {...baseProps}
          onlineLutSources={onlineLutSourcesFixture()}
        />,
      )

      const open = screen.getByRole('button', {
        name: 'Open Catalog from profiles.example.com',
      })
      const rect = {
        bottom: 362,
        height: 32,
        left: 900,
        right: 932,
        top: 330,
        width: 32,
        x: 900,
        y: 330,
        toJSON: () => ({}),
      } satisfies DOMRect
      const getRect = vi
        .spyOn(open, 'getBoundingClientRect')
        .mockReturnValue(rect)

      await user.click(open)

      const browser = screen.getByRole('dialog', {
        name: 'Catalog from profiles.example.com LUTs',
      })

      expect(browser).toHaveAttribute('data-lut-source-placement', 'docked')
      expect(
        browser.style.getPropertyValue('--raw-lut-source-browser-top'),
      ).toBe('12px')
      expect(
        browser.style.getPropertyValue('--raw-lut-source-browser-max-height'),
      ).toBe('396px')

      getRect.mockRestore()
    } finally {
      restoreWindowSize()
    }
  })

  it('opens above the trigger when the upper viewport has more room', async () => {
    const restoreWindowSize = setWindowSize(980, 700)
    const user = userEvent.setup()

    try {
      render(
        <RawToolSurface
          {...baseProps}
          onlineLutSources={onlineLutSourcesFixture()}
        />,
      )

      const open = screen.getByRole('button', {
        name: 'Open Catalog from profiles.example.com',
      })
      const rect = {
        bottom: 462,
        height: 32,
        left: 900,
        right: 932,
        top: 430,
        width: 32,
        x: 900,
        y: 430,
        toJSON: () => ({}),
      } satisfies DOMRect
      const getRect = vi
        .spyOn(open, 'getBoundingClientRect')
        .mockReturnValue(rect)

      await user.click(open)

      const browser = screen.getByRole('dialog', {
        name: 'Catalog from profiles.example.com LUTs',
      })

      expect(browser).toHaveAttribute('data-lut-source-placement', 'anchored')
      expect(
        browser.style.getPropertyValue('--raw-lut-source-browser-top'),
      ).toBe('12px')
      expect(
        browser.style.getPropertyValue('--raw-lut-source-browser-max-height'),
      ).toBe('410px')

      getRect.mockRestore()
    } finally {
      restoreWindowSize()
    }
  })

  it('uses a bottom sheet placement for online LUT browsing on mobile widths', async () => {
    const restoreWindowSize = setWindowSize(390, 640)
    const user = userEvent.setup()

    try {
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

      const browser = screen.getByRole('dialog', {
        name: 'Catalog from profiles.example.com LUTs',
      })

      expect(browser).toHaveAttribute('data-lut-source-placement', 'sheet')
      expect(
        browser.style.getPropertyValue('--raw-lut-source-browser-top'),
      ).toBe('')
    } finally {
      restoreWindowSize()
    }
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

  it('keeps outside focus targets reachable while the online LUT browser is open', async () => {
    const user = userEvent.setup()
    const outsideButton = document.createElement('button')
    outsideButton.textContent = 'Outside focus target'
    document.body.append(outsideButton)

    try {
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

      const browser = screen.getByRole('dialog', {
        name: 'Catalog from profiles.example.com LUTs',
      })
      const close = within(browser).getByRole('button', {
        name: 'Close LUT source browser',
      })

      expect(close).toHaveFocus()

      await act(async () => {
        outsideButton.focus()
      })
      expect(outsideButton).toHaveFocus()
      expect(browser).toBeInTheDocument()
    } finally {
      outsideButton.remove()
    }
  })

  it('closes the online LUT browser when the modal outside layer is clicked', async () => {
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
    expect(
      screen.getByRole('dialog', {
        name: 'Catalog from profiles.example.com LUTs',
      }),
    ).toBeInTheDocument()

    const overlay = document.querySelector('[data-raw-lut-browser-overlay]')
    expect(overlay).toBeInTheDocument()
    await user.click(overlay as HTMLElement)

    expect(
      screen.queryByRole('dialog', {
        name: 'Catalog from profiles.example.com LUTs',
      }),
    ).not.toBeInTheDocument()
    expect(open).toHaveAttribute('aria-expanded', 'false')
    expect(open).toHaveFocus()
  })

  it('lets the already-open online LUT source trigger toggle through the modal layer', async () => {
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
    const getRect = mockTriggerRect(open, {
      left: 40,
      right: 72,
      top: 80,
      bottom: 112,
    })

    await user.click(open)
    expect(
      screen.getByRole('dialog', {
        name: 'Catalog from profiles.example.com LUTs',
      }),
    ).toBeInTheDocument()

    await clickOverlayAt(56, 96, [open])

    expect(
      screen.queryByRole('dialog', {
        name: 'Catalog from profiles.example.com LUTs',
      }),
    ).not.toBeInTheDocument()
    expect(open).toHaveAttribute('aria-expanded', 'false')
    expect(open).toHaveFocus()

    getRect.mockRestore()
  })

  it('does not synthesize a LUT source trigger click on non-primary pointer input', async () => {
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
    const getRect = mockTriggerRect(open, {
      left: 40,
      right: 72,
      top: 80,
      bottom: 112,
    })
    const clickSpy = vi.spyOn(open, 'click')

    await user.click(open)
    expect(
      screen.getByRole('dialog', {
        name: 'Catalog from profiles.example.com LUTs',
      }),
    ).toBeInTheDocument()
    clickSpy.mockClear()

    const overlay = document.querySelector('[data-raw-lut-browser-overlay]')
    expect(overlay).toBeInTheDocument()
    const previousElementsFromPoint = document.elementsFromPoint
    Object.defineProperty(document, 'elementsFromPoint', {
      configurable: true,
      value: vi.fn(() => [overlay as Element, open]),
    })

    try {
      await act(async () => {
        const pointerDown = new Event('pointerdown', {
          bubbles: true,
          cancelable: true,
        })
        Object.defineProperties(pointerDown, {
          button: { value: 2 },
          buttons: { value: 2 },
          clientX: { value: 56 },
          clientY: { value: 96 },
          pointerId: { value: 1 },
          pointerType: { value: 'mouse' },
        })
        fireEvent(overlay as HTMLElement, pointerDown)
        await Promise.resolve()
        await new Promise((resolve) => window.setTimeout(resolve, 0))
      })
      expect(clickSpy).not.toHaveBeenCalled()
    } finally {
      if (previousElementsFromPoint) {
        Object.defineProperty(document, 'elementsFromPoint', {
          configurable: true,
          value: previousElementsFromPoint,
        })
      } else {
        Reflect.deleteProperty(document, 'elementsFromPoint')
      }
      clickSpy.mockRestore()
      getRect.mockRestore()
    }
  })

  it('lets a second online LUT source trigger switch browsers while the browser is open', async () => {
    const user = userEvent.setup()
    render(
      <RawToolSurface
        {...baseProps}
        onlineLutSources={multipleOnlineLutSourcesFixture()}
      />,
    )

    const firstOpen = screen.getByRole('button', {
      name: 'Open Catalog from profiles.example.com',
    })
    const secondOpen = screen.getByRole('button', {
      name: 'Open Catalog from looks.example.net',
    })
    const firstRect = mockTriggerRect(firstOpen, {
      left: 40,
      right: 72,
      top: 80,
      bottom: 112,
    })
    const secondRect = mockTriggerRect(secondOpen, {
      left: 40,
      right: 72,
      top: 136,
      bottom: 168,
    })

    await user.click(firstOpen)
    expect(
      screen.getByRole('dialog', {
        name: 'Catalog from profiles.example.com LUTs',
      }),
    ).toBeInTheDocument()

    await user.click(secondOpen)

    expect(
      screen.queryByRole('dialog', {
        name: 'Catalog from profiles.example.com LUTs',
      }),
    ).not.toBeInTheDocument()
    expect(
      await screen.findByRole('dialog', {
        name: 'Catalog from looks.example.net LUTs',
      }),
    ).toBeInTheDocument()
    expect(secondOpen).toHaveAttribute('aria-expanded', 'true')

    firstRect.mockRestore()
    secondRect.mockRestore()
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
          share: { enabled: false, url: '/raw', copy: vi.fn() },
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

    const status = screen.getByRole('status')

    expect(status).toHaveAttribute('aria-live', 'polite')
    expect(status).toHaveTextContent('Failed to fetch online profile resource.')
    expect(screen.getByText('Issue')).toBeInTheDocument()
  })
})
