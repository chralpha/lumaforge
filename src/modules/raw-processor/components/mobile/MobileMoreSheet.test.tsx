import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { MobileMoreSheet } from './MobileMoreSheet'

describe('mobileMoreSheet', () => {
  it('renders headings and never names libraw-wasm', () => {
    render(
      <MobileMoreSheet
        open
        onClose={vi.fn()}
        pipelineSteps={[{ index: 1, label: 'RAW decode', timing: '56 ms' }]}
        lutRows={[{ label: 'File', value: '—' }]}
        fileRows={[{ label: 'Camera', value: 'Sony α7 IV' }]}
      />,
    )
    expect(
      screen.getByRole('heading', { name: /pipeline & file/i }),
    ).toBeInTheDocument()
    const dialog = screen.getByRole('dialog', { name: /pipeline & file/i })
    expect(dialog).toHaveAttribute('data-mobile-substrate', 'ink-sheet')
    expect(dialog.className).not.toMatch(
      /bg-material|bg-background|bg-fill|text-text|border-border/,
    )
    expect(screen.queryByText(/libraw-wasm/i)).not.toBeInTheDocument()
    expect(screen.getByText('Sony α7 IV')).toBeInTheDocument()
  })

  it('closes via the close button', async () => {
    const onClose = vi.fn()
    render(
      <MobileMoreSheet
        open
        onClose={onClose}
        pipelineSteps={[]}
        lutRows={[]}
        fileRows={[]}
      />,
    )
    await userEvent.click(
      screen.getByRole('button', { name: /close pipeline sheet/i }),
    )
    expect(onClose).toHaveBeenCalled()
  })
})
