import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { MobileExportPanel } from './MobileExportPanel'

function renderPanel(
  overrides: Partial<Parameters<typeof MobileExportPanel>[0]> = {},
) {
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

describe('mobileExportPanel', () => {
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
})
