import { getLUTColorProfile } from '@lumaforge/luma-color-runtime'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { afterEach, beforeEach, vi } from 'vitest'

import { ComparePreviewStage } from '../components/ComparePreviewStage'
import { LutDropzone } from '../components/Dropzone'
import { PreviewCanvas } from '../components/PreviewCanvas'
import { RawToolSurface } from '../components/RawToolSurface'

function rawToolSurfaceProps(
  overrides: Partial<ComponentProps<typeof RawToolSurface>> = {},
): ComponentProps<typeof RawToolSurface> {
  return {
    presetOptions: [
      { id: 'neutral', name: 'Neutral' },
      { id: 'warm', name: 'Warm' },
    ],
    activePresetId: 'neutral',
    activeIntensity: 'standard',
    onPresetSelect: () => {},
    onIntensitySelect: () => {},
    onCompareReset: () => {},
    onLutLoad: () => {},
    onLutClear: () => {},
    onLutProfileSelect: () => {},
    onExport: () => {},
    canExport: false,
    disabledReason: 'Full-resolution export source is still loading.',
    isProcessing: false,
    exportResult: null,
    exportShareCapability: {
      available: false,
      reason: 'Export a JPEG before sharing.',
    },
    onShareExport: () => {},
    onDownloadExport: () => {},
    onCopyExport: () => {},
    hasImage: true,
    currentLutName: null,
    lutProfileSelection: null,
    lutProfileResolution: null,
    supportLevel: 'experimental',
    metadata: null,
    stats: null,
    ...overrides,
  }
}

function compareStageProps(
  overrides: Partial<ComponentProps<typeof ComparePreviewStage>> = {},
): ComponentProps<typeof ComparePreviewStage> {
  return {
    hasImage: false,
    imageRef: { current: null },
    imageVersion: 0,
    params: {
      intensity: 0.7,
      viewMode: 'compare',
      compareSplit: 0.5,
      styleKind: 'none',
      builtinPreset: null,
    },
    lutDataRef: { current: null },
    lutDataVersion: 0,
    embeddedPreviewUrl: null,
    displaySource: 'none',
    split: 0.5,
    onSplitChange: () => {},
    isProcessing: false,
    phase: 'loading',
    progress: 0,
    onRawDrop: () => {},
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
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('rawToolSurface', () => {
  it('presents task-grouped RAW finishing tools', () => {
    render(<RawToolSurface {...rawToolSurfaceProps()} />)

    expect(screen.getByRole('region', { name: 'Finish' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Strength' })).toBeInTheDocument()
    expect(screen.getByText('Neutral')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Standard' })).toBeInTheDocument()
    expect(screen.queryByText('Exposure')).not.toBeInTheDocument()
    expect(screen.queryByText('Log Space')).not.toBeInTheDocument()
  })

  it('disables preset and LUT loading controls before upload', () => {
    render(<RawToolSurface {...rawToolSurfaceProps({ hasImage: false })} />)

    expect(screen.getByRole('button', { name: 'Neutral' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Warm' })).toBeDisabled()
    expect(screen.getByLabelText(/drop \.cube lut file/i)).toBeDisabled()
  })

  it('keeps LUT upload backed by a native file input for mobile tap upload', () => {
    const onFileDrop = vi.fn()
    const file = new File(['lut'], 'look.cube', {
      type: 'application/octet-stream',
    })

    render(<LutDropzone onFileDrop={onFileDrop} />)

    const input = screen.getByLabelText(/drop \.cube lut file/i)
    expect(input).toHaveAttribute('type', 'file')
    expect(input).toHaveAttribute('accept', '.cube')
    expect(input).not.toBeDisabled()

    fireEvent.change(input, {
      target: {
        files: [file],
      },
    })

    expect(onFileDrop).toHaveBeenCalledWith([file])
  })

  it('shows hook-provided export disabled reason in the export controls', () => {
    render(
      <RawToolSurface
        {...rawToolSurfaceProps({
          disabledReason: 'RAW preview exposure is still being prepared.',
        })}
      />,
    )

    expect(
      screen.getByText('RAW preview exposure is still being prepared.'),
    ).toBeInTheDocument()
  })

  it('keeps compare copy tied to the new split interaction', () => {
    render(<RawToolSurface {...rawToolSurfaceProps()} />)

    expect(screen.getByText('Compare')).toBeInTheDocument()
    expect(
      screen.getByText('Drag the split directly on the image.'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Processed' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Original' }),
    ).not.toBeInTheDocument()
  })

  it('lets users reset the compare split while already comparing', async () => {
    const user = userEvent.setup()
    const onCompareReset = vi.fn()

    render(
      <RawToolSurface
        {...rawToolSurfaceProps({
          onCompareReset,
        })}
      />,
    )

    const resetButton = screen.getByRole('button', {
      name: 'Reset compare view',
    })
    expect(resetButton).toBeEnabled()

    await user.click(resetButton)

    expect(onCompareReset).toHaveBeenCalledTimes(1)
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
      <RawToolSurface
        {...rawToolSurfaceProps({
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
      <RawToolSurface
        {...rawToolSurfaceProps({
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
      <RawToolSurface
        {...rawToolSurfaceProps({
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

    const firstLutProps = rawToolSurfaceProps({
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
    const { rerender } = render(<RawToolSurface {...firstLutProps} />)

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
      <RawToolSurface
        {...rawToolSurfaceProps({
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

  it('lets users choose LUT input and output independently for unannotated LUTs', async () => {
    const user = userEvent.setup()
    const onLutProfileSelect = vi.fn()

    render(
      <RawToolSurface
        {...rawToolSurfaceProps({
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

    const vLogInputButton = screen.getByRole('button', {
      name: 'Use Panasonic V-Gamut / V-Log as LUT input',
    })
    expect(vLogInputButton).toBeInTheDocument()
    expect(
      screen.queryByRole('button', {
        name: 'Panasonic V-Gamut / V-Log -> Rec.709 display',
      }),
    ).not.toBeInTheDocument()

    await user.click(vLogInputButton)
    await user.click(
      screen.getByRole('button', {
        name: 'Use Panasonic V-Gamut / V-Log as LUT output',
      }),
    )

    expect(onLutProfileSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'panasonic-vgamut-vlog',
        role: 'scene-creative',
        inputGamut: 'v-gamut',
        inputTransfer: 'v-log',
        outputGamut: 'v-gamut',
        outputTransfer: 'v-log',
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
      <RawToolSurface
        {...rawToolSurfaceProps({
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
      <RawToolSurface
        {...rawToolSurfaceProps({
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

  it('keeps loaded preview stage drop-only instead of a button target', async () => {
    const user = userEvent.setup()
    const onRawDrop = vi.fn()
    const file = new File(['raw'], 'photo.dng', {
      type: 'image/x-adobe-dng',
    })

    const { container } = render(
      <ComparePreviewStage
        hasImage
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
        split={0.5}
        isProcessing={false}
        phase="processing"
        progress={0}
        onRawDrop={onRawDrop}
        onSplitChange={() => {}}
      />,
    )

    const stageFrame = container.querySelector('.raw-lab-stage-frame')
    expect(
      screen.queryByRole('button', { name: 'Replace RAW file' }),
    ).not.toBeInTheDocument()
    expect(stageFrame).not.toHaveAttribute('tabindex')
    expect(stageFrame).toHaveClass('cursor-default')

    const input = document.createElement('input')
    const inputClick = vi.spyOn(input, 'click').mockImplementation(() => {})
    const createElement = vi
      .spyOn(document, 'createElement')
      .mockReturnValue(input)

    await user.click(stageFrame!)

    expect(createElement).not.toHaveBeenCalled()
    expect(inputClick).not.toHaveBeenCalled()

    fireEvent.drop(stageFrame!, {
      dataTransfer: {
        files: [file],
      },
    })

    expect(onRawDrop).toHaveBeenCalledWith([file])
  })

  it('keeps empty preview stage upload button separate from the compare slider', async () => {
    const user = userEvent.setup()

    const { container } = render(
      <ComparePreviewStage
        hasImage={false}
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
        split={0.5}
        isProcessing={false}
        phase="processing"
        progress={0}
        onRawDrop={() => {}}
        onSplitChange={() => {}}
      />,
    )

    const stageFrame = container.querySelector('.raw-lab-stage-frame')
    const uploadButton = screen.getByRole('button', {
      name: /drop one raw here/i,
    })
    const compareSlider = screen.getByRole('slider', {
      name: 'Compare unprocessed RAW and final JPEG',
    })

    expect(stageFrame).not.toHaveAttribute('tabindex')
    expect(
      screen.queryByRole('button', { name: 'Load RAW file' }),
    ).not.toBeInTheDocument()
    expect(uploadButton).toHaveClass('raw-lab-upload-dock')
    expect(uploadButton).not.toContainElement(compareSlider)
    expect(stageFrame).toContainElement(uploadButton)
    expect(stageFrame).toContainElement(compareSlider)

    const input = document.createElement('input')
    const inputClick = vi.spyOn(input, 'click').mockImplementation(() => {})
    const createElement = vi
      .spyOn(document, 'createElement')
      .mockReturnValue(input)

    await user.click(uploadButton)

    expect(createElement).toHaveBeenCalledWith('input')
    expect(inputClick).toHaveBeenCalledTimes(1)
  })

  describe('comparePreviewStage', () => {
    it('places upload inside the empty compare stage', () => {
      const { container } = render(
        <ComparePreviewStage {...compareStageProps()} />,
      )

      const stage = screen.getByLabelText('RAW preview comparison')
      const uploadButton = screen.getByRole('button', {
        name: /drop one raw here/i,
      })
      const sample = container.querySelector<HTMLElement>('.raw-lab-sample')

      expect(stage).toBeInTheDocument()
      expect(stage).toContainElement(uploadButton)
      expect(sample?.style.getPropertyValue('--raw-compare-split')).toBe('')
      expect(
        sample?.style.getPropertyValue('--raw-compare-split-committed'),
      ).toBe('50%')
      expect(screen.getByText('Unprocessed RAW')).toBeInTheDocument()
      expect(screen.getByText('Final JPEG')).toBeInTheDocument()
      expect(
        screen.getByRole('slider', {
          name: 'Compare unprocessed RAW and final JPEG',
        }),
      ).toBeInTheDocument()
    })

    it('renders a legible progress indicator without relying on spin motion', () => {
      const { container } = render(
        <ComparePreviewStage
          {...compareStageProps({
            isProcessing: true,
            phase: 'decoding',
            progress: 50,
          })}
        />,
      )

      const indicator = container.querySelector('[data-progress-indicator]')
      const arc = container.querySelector('[data-progress-arc]')

      expect(indicator).toBeInTheDocument()
      expect(indicator).toHaveClass('size-full')
      expect(indicator).not.toHaveClass('animate-spin')
      expect(arc).toHaveAttribute('stroke-dasharray', '100')
      expect(arc).toHaveAttribute('stroke-dashoffset', '50')
      expect(arc).toHaveAttribute('stroke', 'oklch(0.78 0.16 63)')
      expect(screen.getByText('50%')).toHaveClass('text-[oklch(0.97_0.014_86)]')
    })

    it('keeps compare labels when an image is loaded', async () => {
      await act(async () => {
        render(
          <ComparePreviewStage
            {...compareStageProps({
              hasImage: true,
              imageRef: {
                current: {
                  data: new Float32Array(4),
                  width: 1,
                  height: 1,
                  channels: 4,
                  bitsPerChannel: 32,
                  layout: 'rgba-float32',
                  colorSpace: 'display-srgb-preview',
                  metadata: { width: 1, height: 1 },
                  renderExposure: {
                    ev: 0,
                    multiplier: 1,
                    source: 'identity',
                  },
                },
              },
            })}
          />,
        )
      })

      expect(
        screen.queryByRole('button', { name: /drop one raw here/i }),
      ).not.toBeInTheDocument()
      expect(screen.queryByText('Drop one RAW here')).not.toBeInTheDocument()
      expect(screen.getByText('Unprocessed RAW')).toBeInTheDocument()
      expect(screen.getByText('Final JPEG')).toBeInTheDocument()
      expect(
        screen.getByRole('slider', {
          name: 'Compare unprocessed RAW and final JPEG',
        }),
      ).toBeInTheDocument()
    })
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
