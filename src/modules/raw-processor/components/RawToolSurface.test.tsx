import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { UseOnlineLutSourcesResult } from '../hooks/useOnlineLutSources'
import { LutDropzone } from './Dropzone'
import { RawToolSurface } from './RawToolSurface'

const baseProps = {
  presetOptions: [
    { id: 'neutral', name: 'Neutral' },
    { id: 'warm', name: 'Warm' },
  ],
  activePresetId: 'neutral',
  activeIntensity: 'standard' as const,
  tone: {
    userExposureEv: 0,
    userContrast: 0,
  },
  onPresetSelect: vi.fn(),
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

describe('rawToolSurface', () => {
  it('groups controls as a RAW finishing surface instead of a legacy panel', () => {
    const { container } = render(<RawToolSurface {...baseProps} />)

    expect(
      container.querySelector('[data-raw-panel="controls"]'),
    ).not.toBeInTheDocument()
    expect(
      container.querySelector('[data-raw-tool-surface="raw-finishing"]'),
    ).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Finish' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Strength' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Compare' })).toBeInTheDocument()
    expect(
      screen.getByRole('region', { name: 'LUT contract' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Export' })).toBeInTheDocument()
    expect(
      screen.getByRole('region', { name: 'File facts' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Choose a RAW to activate looks.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Full-resolution export source is still loading.'),
    ).toBeInTheDocument()
  })

  it('renders tone controls before strength', async () => {
    render(<RawToolSurface {...baseProps} hasImage />)

    const tone = screen.getByRole('region', { name: 'Tone' })
    const strength = screen.getByRole('region', { name: 'Strength' })

    expect(within(tone).getByLabelText('Exposure')).toBeInTheDocument()
    expect(within(tone).getByLabelText('Contrast')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Tone' })).toBeInTheDocument()
    expect(
      tone.compareDocumentPosition(strength) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('sends normalized tone changes and calls tone reset', async () => {
    const user = userEvent.setup()
    const onToneChange = vi.fn()
    const onToneReset = vi.fn()
    render(
      <RawToolSurface
        {...baseProps}
        hasImage
        tone={{ userExposureEv: 0, userContrast: 0 }}
        onToneChange={onToneChange}
        onToneReset={onToneReset}
      />,
    )

    fireEvent.change(screen.getByLabelText('Exposure'), {
      target: { value: '1.25' },
    })
    expect(onToneChange).toHaveBeenLastCalledWith({ userExposureEv: 1.25 })

    await user.click(screen.getByRole('button', { name: 'Reset tone' }))
    expect(onToneReset).toHaveBeenCalledTimes(1)
  })

  it('disables tone controls before upload', () => {
    render(<RawToolSurface {...baseProps} />)

    expect(screen.getByLabelText('Exposure')).toBeDisabled()
    expect(screen.getByLabelText('Contrast')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Reset tone' })).toBeDisabled()
  })

  it('shows preserved tone state for non-neutral tone', () => {
    render(
      <RawToolSurface
        {...baseProps}
        hasImage
        tone={{ userExposureEv: 1, userContrast: 50 }}
      />,
    )

    expect(screen.getByText('Tone settings preserved')).toBeInTheDocument()
  })

  it('opens and closes the mobile tool sheet without relying on page scroll', async () => {
    const user = userEvent.setup()
    render(<RawToolSurface {...baseProps} />)

    const toggle = screen.getByRole('button', { name: 'RAW tools' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })

  it('keeps long LUT names inside the tool column while preserving the full name', () => {
    const currentLut =
      'Fujifilm-GFX100RF-F-Log2C-to-Classic-Negative-Rec709-Display-Extremely-Long-Client-Delivery-Name.cube'

    render(<LutDropzone currentLut={currentLut} onFileDrop={vi.fn()} />)

    const label = screen.getByLabelText(/drop \.cube lut file/i)
    const frame = label.closest('label')
    const fileName = screen.getByText(currentLut)
    const row = fileName.parentElement?.parentElement

    expect(row).toHaveClass('min-w-0')
    expect(frame).toHaveClass('min-w-0')
    expect(fileName).toHaveClass('min-w-0', 'truncate')
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
    expect(container.querySelector('.raw-lut-source-entry')).toBeNull()
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
    const browserList = browser.querySelector('.raw-lut-source-browser-list')

    expect(open).toHaveAttribute('aria-expanded', 'true')
    expect(open).toHaveAttribute('aria-controls', browser.id)
    expect(
      within(browser).getByRole('button', {
        name: 'Close LUT source browser',
      }),
    ).toHaveFocus()
    expect(browser).toHaveClass('raw-lut-source-browser')
    expect(browser).toHaveAttribute('data-lut-source-placement', 'anchored')
    expect(
      browser.style.getPropertyValue('--raw-lut-source-browser-top'),
    ).not.toBe('')
    expect(browserList).toHaveAttribute('data-lut-source-scroll', 'internal')
    expect(browser.closest('.raw-lut-source-controls')).toBeNull()
    expect(
      container.querySelector(
        '.raw-lut-source-controls .raw-lut-source-resource .raw-lut-source-entry',
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
      .closest('.raw-lut-source-entry')
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

    await user.click(document.body)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(open).toHaveFocus()
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

    expect(screen.getByLabelText(/drop \.cube lut file/i)).toBeInTheDocument()
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
    expect(refresh).toHaveClass('raw-lut-source-icon-button-busy')
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
