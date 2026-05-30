import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { CpuPreviewCanvas } from './CpuPreviewCanvas'

const frame = {
  requestId: 1,
  sourceId: 's1',
  rgba: new Uint8ClampedArray(2 * 2 * 4).fill(128),
  width: 2,
  height: 2,
}

describe('cpuPreviewCanvas', () => {
  it('draws via backing canvas (putImageData) then drawImage to visible', () => {
    const drawImage = vi.fn()
    const putImageData = vi.fn()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage,
      putImageData,
      clearRect: vi.fn(),
      scale: vi.fn(),
      setTransform: vi.fn(),
    } as unknown as CanvasRenderingContext2D)

    render(<CpuPreviewCanvas frame={frame} inFlight={false} />)
    expect(putImageData).toHaveBeenCalled()
    expect(drawImage).toHaveBeenCalled()
    vi.restoreAllMocks()
  })

  it('shows a spinner while a render is in flight', () => {
    render(<CpuPreviewCanvas frame={frame} inFlight />)
    expect(screen.getByTestId('cpu-preview-spinner')).toBeInTheDocument()
  })

  it('shows an explicit placeholder when no frame and no thumbnail on failure', () => {
    render(
      <CpuPreviewCanvas
        frame={null}
        inFlight={false}
        failureReason="render-failed"
      />,
    )
    expect(screen.getByTestId('cpu-preview-unavailable')).toBeInTheDocument()
  })
})
