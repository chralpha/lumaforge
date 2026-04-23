import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'

import { ControlsPanel } from '../components/ControlsPanel'
import { PreviewCanvas } from '../components/PreviewCanvas'

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
    render(
      <ControlsPanel
        presetOptions={[
          { id: 'neutral', name: 'Neutral' },
          { id: 'warm', name: 'Warm' },
        ]}
        activePresetId="neutral"
        activeIntensity="standard"
        viewMode="processed"
        onPresetSelect={() => {}}
        onIntensitySelect={() => {}}
        onViewModeChange={() => {}}
        onLutLoad={() => {}}
        onLutClear={() => {}}
        onExport={() => {}}
        canExport={false}
        isProcessing={false}
      />,
    )

    expect(screen.getByText('Neutral')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Standard' })).toBeInTheDocument()
    expect(screen.queryByText('Exposure')).not.toBeInTheDocument()
    expect(screen.queryByText('Log Space')).not.toBeInTheDocument()
  })

  it('shows an embedded RAW preview image before decoded pixels are ready', async () => {
    await act(async () => {
      render(
        <PreviewCanvas
          imageData={null}
          imageLayout={null}
          imageColorSpace={null}
          imageWidth={0}
          imageHeight={0}
          params={{
            intensity: 0.7,
            viewMode: 'processed',
            styleKind: 'none',
            builtinPreset: null,
          }}
          lutData={null}
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
