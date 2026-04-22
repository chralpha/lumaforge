import { render, screen } from '@testing-library/react'

import { ControlsPanel } from '../components/ControlsPanel'

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
})
