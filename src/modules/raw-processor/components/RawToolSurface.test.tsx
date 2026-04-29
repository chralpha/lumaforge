import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { RawToolSurface } from './RawToolSurface'

const baseProps = {
  presetOptions: [
    { id: 'neutral', name: 'Neutral' },
    { id: 'warm', name: 'Warm' },
  ],
  activePresetId: 'neutral',
  activeIntensity: 'standard' as const,
  onPresetSelect: vi.fn(),
  onIntensitySelect: vi.fn(),
  onCompareReset: vi.fn(),
  onLutLoad: vi.fn(),
  onLutClear: vi.fn(),
  onLutProfileSelect: vi.fn(),
  onExport: vi.fn(),
  canExport: false,
  disabledReason: 'Full-resolution export source is still loading.',
  isProcessing: false,
  hasImage: false,
  currentLutName: null,
  lutProfileSelection: null,
  lutProfileResolution: null,
  supportLevel: 'experimental' as const,
  metadata: null,
  stats: null,
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
})
