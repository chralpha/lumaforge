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

  it('opens the selector by default for filename-inferred LUT profiles', async () => {
    const user = userEvent.setup()
    const onLutProfileSelect = vi.fn()
    const profile = getLUTColorProfile('sony-sgamut3cine-slog3')!

    render(
      <ControlsPanel
        {...controlsPanelProps({
          currentLutName: 'Sony Look.cube',
          lutProfileSelection: {
            status: 'resolved',
            fingerprint: 'abc123',
            profileId: profile.id,
            confidence: 'filename',
          },
          lutProfileResolution: {
            kind: 'resolved',
            profile: {
              ...profile,
              role: 'combined-look-output',
              outputGamut: 'srgb-rec709',
              outputTransfer: 'gamma24',
              outputRange: 'full',
            },
            confidence: 'filename',
          },
          onLutProfileSelect,
        })}
      />,
    )

    expect(screen.getByText('LUT input:')).toBeInTheDocument()
    expect(
      screen.getAllByText('Sony S-Gamut3.Cine / S-Log3').length,
    ).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('LUT output:')).toBeInTheDocument()
    expect(screen.getByText('Rec.709 display')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Change LUT input' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Search LUT input')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Sony S-Gamut3.Cine / S-Log3' }),
    ).toBeInTheDocument()
    expect(screen.getByText('ARRI Wide Gamut 4 / LogC4')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Change LUT input' }))

    expect(screen.queryByLabelText('Search LUT input')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Change LUT input' }))

    expect(screen.getByLabelText('Search LUT input')).toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: 'Panasonic V-Gamut / V-Log' }),
    )

    expect(onLutProfileSelect).toHaveBeenCalledWith('panasonic-vgamut-vlog')
  })

  it('keeps explicit LUT profile matches collapsed', () => {
    const profile = getLUTColorProfile('sony-sgamut3cine-slog3')!

    render(
      <ControlsPanel
        {...controlsPanelProps({
          currentLutName: 'Sony Look.cube',
          lutProfileSelection: {
            status: 'resolved',
            fingerprint: 'abc123',
            profileId: profile.id,
            confidence: 'explicit',
          },
          lutProfileResolution: {
            kind: 'resolved',
            profile: {
              ...profile,
              role: 'combined-look-output',
              outputGamut: 'srgb-rec709',
              outputTransfer: 'gamma24',
              outputRange: 'full',
            },
            confidence: 'explicit',
          },
        })}
      />,
    )

    expect(screen.getByText('LUT input:')).toBeInTheDocument()
    expect(screen.getByText('Sony S-Gamut3.Cine / S-Log3')).toBeInTheDocument()
    expect(screen.queryByLabelText('Search LUT input')).not.toBeInTheDocument()
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
        confidence: 'explicit',
      },
      lutProfileResolution: {
        kind: 'resolved',
        profile: sonyProfile,
        confidence: 'explicit',
      },
    })
    const { rerender } = render(<ControlsPanel {...firstLutProps} />)

    await user.click(screen.getByRole('button', { name: 'Change LUT input' }))
    await user.type(screen.getByLabelText('Search LUT input'), 'panasonic')

    expect(screen.getByLabelText('Search LUT input')).toHaveValue('panasonic')
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
            confidence: 'explicit',
          },
          lutProfileResolution: {
            kind: 'resolved',
            profile: canonProfile,
            confidence: 'explicit',
          },
        })}
      />,
    )

    expect(screen.queryByLabelText('Search LUT input')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Change LUT input' }))

    expect(screen.getByLabelText('Search LUT input')).toHaveValue('')
    expect(screen.getByText('ARRI Wide Gamut 4 / LogC4')).toBeInTheDocument()
  })

  it('shows unknown LUT guidance and searchable profile options', async () => {
    const user = userEvent.setup()
    const suggestion = getLUTColorProfile('sony-sgamut3cine-slog3')!

    render(
      <ControlsPanel
        {...controlsPanelProps({
          currentLutName: 'Unknown Look.cube',
          lutProfileSelection: {
            status: 'pending',
            fingerprint: 'def456',
            title: 'Unknown Look',
            sourceName: 'Unknown Look.cube',
            suggestions: [suggestion],
          },
          lutProfileResolution: {
            kind: 'needs-user-selection',
            suggestions: [suggestion],
          },
        })}
      />,
    )

    expect(
      screen.getByText(
        'This LUT does not declare its color input. Choose the camera/log space it was made for.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('Sony S-Gamut3.Cine / S-Log3')).toBeInTheDocument()
    expect(screen.getByText('ARRI Wide Gamut 4 / LogC4')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Search LUT input'), 'v-log')

    expect(screen.getByText('Panasonic V-Gamut / V-Log')).toBeInTheDocument()
  })

  it('calls the profile selection callback when a LUT input is chosen', async () => {
    const user = userEvent.setup()
    const onLutProfileSelect = vi.fn()
    const suggestion = getLUTColorProfile('sony-sgamut3cine-slog3')!

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
      screen.getByRole('button', { name: 'Panasonic V-Gamut / V-Log' }),
    )

    expect(onLutProfileSelect).toHaveBeenCalledWith('panasonic-vgamut-vlog')
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
    expect(screen.queryByLabelText('Search LUT input')).not.toBeInTheDocument()
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
