import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { createBlobOutputResult } from '~/lib/export/output-sink'

import type { ExportResult } from '../../model/export-result'
import { MobileExportPanel } from './MobileExportPanel'

type MobileExportPanelProps = Parameters<typeof MobileExportPanel>[0] & {
  canPreviewExport?: boolean
  previewExportDisabledReason?: string
  onPreviewExport?: () => void | Promise<void>
}

function renderPanel(overrides: Partial<MobileExportPanelProps> = {}) {
  render(
    <MobileExportPanel
      canExport
      isProcessing={false}
      onExport={vi.fn()}
      exportResult={null}
      exportShareCapability={{
        available: false,
        reason: 'Export a JPEG before sharing.',
      }}
      recovery={{ status: 'none' }}
      onShareExport={vi.fn()}
      onDownloadExport={vi.fn()}
      onCopyExport={vi.fn()}
      {...overrides}
    />,
  )
}

function createResult(overrides: Partial<ExportResult> = {}): ExportResult {
  const blob = new Blob(['jpeg'], { type: 'image/jpeg' })

  return {
    kind: 'hq-preview',
    output: createBlobOutputResult({
      blob,
      filename: 'frame_neutral_hq-preview.jpg',
    }),
    filename: 'frame_neutral_hq-preview.jpg',
    width: 4000,
    height: 3000,
    size: blob.size,
    createdAt: 123,
    copyCapability: {
      mode: 'preview-size',
      label: 'Copy preview-size image',
      reason: 'This browser cannot copy full-resolution JPEG files.',
    },
    ...overrides,
  }
}

describe('mobileExportPanel', () => {
  it('keeps full-resolution export primary and shows HQ preview export as secondary', async () => {
    const user = userEvent.setup()
    const onExport = vi.fn()
    const onPreviewExport = vi.fn()

    renderPanel({
      canExport: true,
      canPreviewExport: true,
      onExport,
      onPreviewExport,
    })

    const fullResolutionButton = screen.getByRole('button', {
      name: /export full-resolution jpeg/i,
    })
    const previewButton = screen.getByRole('button', {
      name: /export hq preview jpeg/i,
    })

    expect(fullResolutionButton.parentElement).toHaveClass('grid-cols-2')

    await user.click(fullResolutionButton)
    await user.click(previewButton)

    expect(onExport).toHaveBeenCalledWith({
      quality: 'high',
      fidelity: 'balanced',
    })
    expect(onPreviewExport).toHaveBeenCalledTimes(1)
    expect(
      screen.queryByText(/smaller 8-12mp preview-rendered jpeg/i),
    ).not.toBeInTheDocument()
  })

  it('omits secondary HQ preview helper copy while the preview export is not ready', () => {
    renderPanel({
      canPreviewExport: false,
      previewExportDisabledReason:
        'HQ preview export is available after the bounded HQ preview finishes.',
    })

    expect(
      screen.getByRole('button', { name: /export hq preview jpeg/i }),
    ).toBeDisabled()
    expect(
      screen.queryByText(/hq preview export is available after/i),
    ).not.toBeInTheDocument()
  })

  it('does not show a blocked export error while export progress is already visible', () => {
    renderPanel({
      canExport: false,
      disabledReason: 'Full-resolution export is already running.',
      isProcessing: true,
    })

    expect(
      screen.getByRole('button', { name: /preparing jpeg/i }),
    ).toBeDisabled()
    expect(screen.queryByText(/color contract failed/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/already running/i)).not.toBeInTheDocument()
  })

  it('keeps the ready result compact without secondary helper copy', () => {
    renderPanel({
      exportResult: createResult(),
      exportShareCapability: {
        available: false,
        reason: 'Export a JPEG before sharing.',
      },
    })

    expect(screen.getByText('HQ preview JPEG ready')).toBeInTheDocument()
    expect(screen.getByText('4000 x 3000 · 4 B')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /copy preview-size image/i }),
    ).toBeEnabled()
    expect(
      screen.queryByText(/use full-resolution export for archival output/i),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText(/export a jpeg before sharing/i),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText(/cannot copy full-resolution jpeg files/i),
    ).not.toBeInTheDocument()
  })
})
