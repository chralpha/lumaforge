import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { afterEach, beforeEach, vi } from 'vitest'

import { getLUTColorProfile } from '~/lib/color/registry'

import { ControlsPanel } from '../components/ControlsPanel'
import { PreviewCanvas } from '../components/PreviewCanvas'

function controlsPanelProps(
  overrides: Partial<ComponentProps<typeof ControlsPanel>> = {},
): ComponentProps<typeof ControlsPanel> {
  return {
    presetOptions: [
      { id: 'neutral', name: 'Neutral' },
      { id: 'warm', name: 'Warm' },
    ],
    activePresetId: 'neutral',
    activeIntensity: 'standard',
    viewMode: 'processed',
    onPresetSelect: () => {},
    onIntensitySelect: () => {},
    onViewModeChange: () => {},
    onLutLoad: () => {},
    onLutClear: () => {},
    onLutProfileSelect: () => {},
    onExport: () => {},
    canExport: false,
    isProcessing: false,
    ...overrides,
  }
}

vi.mock('~/lib/gl/pipeline', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/lib/gl/pipeline')>()

  return {
    ...actual,
    RawProcessingPipeline: class {
      async initialize() {}
      resize() {}
      uploadImage() {}
      clearImage() {}
      uploadLUT() {}
      clearLUT() {}
      setParams() {}
      render() {
        return {
          renderTime: 0,
          memoryUsage: 0,
          textureSize: { width: 0, height: 0 },
        }
      }
      dispose() {}
    },
  }
})

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('controlsPanel', () => {
  it('shows finite intensity choices and no pro controls', () => {
    render(<ControlsPanel {...controlsPanelProps()} />)

    expect(screen.getByText('Neutral')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Standard' })).toBeInTheDocument()
    expect(screen.queryByText('Exposure')).not.toBeInTheDocument()
    expect(screen.queryByText('Log Space')).not.toBeInTheDocument()
  })

  it('shows hook-provided export disabled reason in the export controls', () => {
    render(
      <ControlsPanel
        {...controlsPanelProps({
          disabledReason: 'RAW preview exposure is still being prepared.',
        })}
      />,
    )

    expect(
      screen.getByText('RAW preview exposure is still being prepared.'),
    ).toBeInTheDocument()
  })

  it('opens the selector by default for pending LUT profile suggestions', async () => {
    const user = userEvent.setup()
    const onLutProfileSelect = vi.fn()
    const profile = {
      ...getLUTColorProfile('sony-sgamut3cine-slog3')!,
      role: 'combined-look-output' as const,
      outputGamut: 'srgb-rec709' as const,
      outputTransfer: 'gamma24' as const,
      outputRange: 'full' as const,
    }

    render(
      <ControlsPanel
        {...controlsPanelProps({
          currentLutName: 'Sony Look.cube',
          lutProfileSelection: {
            status: 'pending',
            fingerprint: 'abc123',
            title: 'Sony Look',
            suggestions: [profile],
          },
          lutProfileResolution: {
            kind: 'needs-user-selection',
            suggestions: [profile],
          },
          onLutProfileSelect,
        })}
      />,
    )

    expect(
      screen.getByText(
        'Choose the LUT input and output contract before preview or export.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getAllByText('Sony S-Gamut3.Cine / S-Log3 -> Rec.709 display')
        .length,
    ).toBeGreaterThanOrEqual(1)
    expect(screen.getByLabelText('Search LUT contract')).toBeInTheDocument()
    expect(
      screen.getByPlaceholderText('Search camera/log or output'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', {
        name: 'Sony S-Gamut3.Cine / S-Log3 -> Rec.709 display',
      }),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('ARRI Wide Gamut 4 / LogC4'),
    ).not.toBeInTheDocument()

    await user.click(
      screen.getByRole('button', {
        name: 'Sony S-Gamut3.Cine / S-Log3 -> Rec.709 display',
      }),
    )

    expect(onLutProfileSelect).toHaveBeenCalledWith(profile)
  })

  it('shows resolved LUT input and output contracts', () => {
    const profile = {
      ...getLUTColorProfile('panasonic-vgamut-vlog')!,
      role: 'combined-look-output' as const,
      outputGamut: 'srgb-rec709' as const,
      outputTransfer: 'gamma24' as const,
      outputRange: 'full' as const,
    }

    render(
      <ControlsPanel
        {...controlsPanelProps({
          currentLutName: 'Panasonic Look.cube',
          lutProfileSelection: {
            status: 'resolved',
            fingerprint: 'abc123',
            profileId: profile.id,
            confidence: 'metadata',
          },
          lutProfileResolution: {
            kind: 'resolved',
            profile,
            confidence: 'metadata',
          },
        })}
      />,
    )

    expect(screen.getByText('LUT input:')).toBeInTheDocument()
    expect(screen.getByText('Panasonic V-Gamut / V-Log')).toBeInTheDocument()
    expect(screen.getByText('LUT output:')).toBeInTheDocument()
    expect(screen.getByText('Rec.709 display')).toBeInTheDocument()
    expect(
      screen.queryByLabelText('Search LUT contract'),
    ).not.toBeInTheDocument()
  })

  it('makes missing LUT output contracts explicit', () => {
    const profile = getLUTColorProfile('panasonic-vgamut-vlog')!

    render(
      <ControlsPanel
        {...controlsPanelProps({
          currentLutName: 'Panasonic Look.cube',
          lutProfileSelection: {
            status: 'resolved',
            fingerprint: 'abc123',
            profileId: profile.id,
            confidence: 'metadata',
          },
          lutProfileResolution: {
            kind: 'resolved',
            profile,
            confidence: 'metadata',
          },
        })}
      />,
    )

    expect(screen.getByText(/choose the LUT output/i)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Change LUT contract' }),
    ).toBeInTheDocument()
  })

  it('resets selector state and search when switching LUT fingerprints', async () => {
    const user = userEvent.setup()
    const sonyProfile = getLUTColorProfile('sony-sgamut3cine-slog3')!
    const canonProfile = getLUTColorProfile('canon-cinema-gamut-clog3')!

    const firstLutProps = controlsPanelProps({
      currentLutName: 'Sony Look.cube',
      lutProfileSelection: {
        status: 'resolved',
        fingerprint: 'first-lut',
        profileId: sonyProfile.id,
        confidence: 'metadata',
      },
      lutProfileResolution: {
        kind: 'resolved',
        profile: sonyProfile,
        confidence: 'metadata',
      },
    })
    const { rerender } = render(<ControlsPanel {...firstLutProps} />)

    await user.click(
      screen.getByRole('button', { name: 'Change LUT contract' }),
    )
    await user.type(screen.getByLabelText('Search LUT contract'), 'panasonic')

    expect(screen.getByLabelText('Search LUT contract')).toHaveValue(
      'panasonic',
    )
    expect(
      screen.queryByText('ARRI Wide Gamut 4 / LogC4'),
    ).not.toBeInTheDocument()

    rerender(
      <ControlsPanel
        {...controlsPanelProps({
          currentLutName: 'Canon Look.cube',
          lutProfileSelection: {
            status: 'resolved',
            fingerprint: 'second-lut',
            profileId: canonProfile.id,
            confidence: 'metadata',
          },
          lutProfileResolution: {
            kind: 'resolved',
            profile: canonProfile,
            confidence: 'metadata',
          },
        })}
      />,
    )

    expect(
      screen.queryByLabelText('Search LUT contract'),
    ).not.toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: 'Change LUT contract' }),
    )

    expect(screen.getByLabelText('Search LUT contract')).toHaveValue('')
    expect(
      screen.queryByText('ARRI Wide Gamut 4 / LogC4'),
    ).not.toBeInTheDocument()
  })

  it('offers searchable full Rec.709 contracts for unannotated LUTs', async () => {
    const user = userEvent.setup()
    const onLutProfileSelect = vi.fn()

    render(
      <ControlsPanel
        {...controlsPanelProps({
          currentLutName: 'Unknown Look.cube',
          lutProfileSelection: {
            status: 'pending',
            fingerprint: 'def456',
            title: 'Unknown Look',
            sourceName: 'Unknown Look.cube',
            suggestions: [],
          },
          lutProfileResolution: {
            kind: 'needs-user-selection',
            suggestions: [],
          },
          onLutProfileSelect,
        })}
      />,
    )

    expect(
      screen.getByText(
        'Choose the LUT input and output contract before preview or export.',
      ),
    ).toBeInTheDocument()

    await user.type(screen.getByLabelText('Search LUT contract'), 'v-log')

    const vLogContractButton = screen.getByRole('button', {
      name: 'Panasonic V-Gamut / V-Log -> Rec.709 display',
    })
    expect(vLogContractButton).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Panasonic V-Gamut / V-Log' }),
    ).not.toBeInTheDocument()

    await user.click(vLogContractButton)

    expect(onLutProfileSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'panasonic-vgamut-vlog',
        role: 'combined-look-output',
        inputGamut: 'v-gamut',
        inputTransfer: 'v-log',
        outputGamut: 'srgb-rec709',
        outputTransfer: 'bt709',
        outputRange: 'full',
      }),
    )
  })

  it('passes the full suggested LUT contract when a LUT input is chosen', async () => {
    const user = userEvent.setup()
    const onLutProfileSelect = vi.fn()
    const suggestion = {
      ...getLUTColorProfile('sony-sgamut3cine-slog3')!,
      role: 'combined-look-output' as const,
      outputGamut: 'srgb-rec709' as const,
      outputTransfer: 'bt709' as const,
      outputRange: 'full' as const,
    }

    render(
      <ControlsPanel
        {...controlsPanelProps({
          currentLutName: 'Unknown Look.cube',
          lutProfileSelection: {
            status: 'pending',
            fingerprint: 'ghi789',
            title: 'Unknown Look',
            suggestions: [suggestion],
          },
          lutProfileResolution: {
            kind: 'needs-user-selection',
            suggestions: [suggestion],
          },
          onLutProfileSelect,
        })}
      />,
    )

    await user.click(
      screen.getByRole('button', {
        name: 'Sony S-Gamut3.Cine / S-Log3 -> Rec.709 display',
      }),
    )

    expect(onLutProfileSelect).toHaveBeenCalledWith(suggestion)
  })

  it('warns unsupported output LUTs without showing the input selector', () => {
    const suggestion = getLUTColorProfile('sony-sgamut3cine-slog3')!

    render(
      <ControlsPanel
        {...controlsPanelProps({
          currentLutName: 'Cineon Output.cube',
          lutProfileSelection: {
            status: 'pending',
            fingerprint: 'jkl012',
            title: 'Cineon Output',
            suggestions: [suggestion],
          },
          lutProfileResolution: {
            kind: 'needs-user-selection',
            suggestions: [suggestion],
            reason: 'unsupported-output',
          },
        })}
      />,
    )

    expect(
      screen.getByText(/This LUT output is not supported yet/),
    ).toBeInTheDocument()
    expect(
      screen.queryByLabelText('Search LUT contract'),
    ).not.toBeInTheDocument()
  })

  it('shows an embedded RAW preview image before decoded pixels are ready', async () => {
    await act(async () => {
      render(
        <PreviewCanvas
          imageRef={{ current: null }}
          imageVersion={0}
          params={{
            intensity: 0.7,
            viewMode: 'processed',
            compareSplit: 0.5,
            styleKind: 'none',
            builtinPreset: null,
          }}
          lutDataRef={{ current: null }}
          lutDataVersion={0}
          embeddedPreviewUrl="blob:embedded-preview"
          displaySource="embedded"
        />,
      )
      await Promise.resolve()
    })

    const image = screen.getByAltText('Embedded RAW preview')
    expect(image).toHaveAttribute('src', 'blob:embedded-preview')
    expect(screen.queryByText('No image loaded')).not.toBeInTheDocument()
  })
})
