import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'

import { Component as RawRoute } from '../../../pages/(main)/raw'
import { RawProcessorView } from '../RawProcessorView'
import { classifySupportLevel } from '../services/support-matrix'

describe('rawProcessorView', () => {
  it('renders the image-first empty RAW Lab workspace', () => {
    mockedUseCapabilityGate.mockReturnValue({
      ready: true,
      supportStatus: 'supported',
      reason: null,
    })

    render(<RawProcessorView />)

    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByText('RAW Lab')).toBeInTheDocument()
    expect(screen.getByText('Drop one RAW here')).toBeInTheDocument()
    expect(screen.getByText('Unprocessed RAW')).toBeInTheDocument()
    expect(screen.getByText('Final JPEG')).toBeInTheDocument()
    expect(
      screen.queryByText('Browser-local RAW styling'),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText('Drop your RAW file here'),
    ).not.toBeInTheDocument()
  })

  it('exposes the viewport app shell contract for the empty workspace', () => {
    mockedUseCapabilityGate.mockReturnValue({
      ready: true,
      supportStatus: 'supported',
      reason: null,
    })

    const { container } = render(<RawProcessorView />)
    const viewportShell = container.querySelector(
      '[data-raw-lab-shell="viewport"]',
    )
    const stageToolsLayout = container.querySelector(
      '[data-raw-lab-layout="stage-tools"]',
    )

    expect(viewportShell).not.toBeNull()
    expect(viewportShell).toHaveClass('raw-lab')
    expect(viewportShell).toHaveAttribute('data-raw-lab-state', 'empty')
    expect(stageToolsLayout).not.toBeNull()
    expect(stageToolsLayout).toHaveClass('raw-lab-shell')
  })

  it('lets the raw route hand viewport ownership directly to the shell', () => {
    mockedUseCapabilityGate.mockReturnValue({
      ready: true,
      supportStatus: 'supported',
      reason: null,
    })

    const { container } = render(<RawRoute />)
    const routeRoot = container.firstElementChild

    expect(routeRoot).not.toBeNull()
    expect(routeRoot).toHaveAttribute('data-raw-lab-shell', 'viewport')
    expect(routeRoot).toHaveClass('raw-lab')
    expect(routeRoot).not.toHaveClass('h-screen')
    expect(
      container.querySelector('[data-raw-lab-shell="viewport"]')?.parentElement,
    ).toBe(container)
  })

  it('keeps export disabled copy visible before a RAW is loaded', () => {
    mockedUseCapabilityGate.mockReturnValue({
      ready: true,
      supportStatus: 'supported',
      reason: null,
    })

    render(<RawProcessorView />)

    expect(
      screen.getByText('Full-resolution export source is still loading.'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /export full-resolution jpeg/i }),
    ).toBeDisabled()
  })
})

vi.mock('../hooks/useCapabilityGate', () => ({
  useCapabilityGate: vi.fn(),
}))

const mockedUseCapabilityGate = vi.mocked(
  (await import('../hooks/useCapabilityGate')).useCapabilityGate,
)

describe('rawProcessorView shell states', () => {
  it('shows the unsupported state when WebGL2 is unavailable', () => {
    mockedUseCapabilityGate.mockReturnValue({
      ready: true,
      supportStatus: 'unsupported',
      reason: 'WebGL2 is required',
    })

    render(<RawProcessorView />)

    expect(
      screen.getByText('This browser cannot run the RAW Lab'),
    ).toBeInTheDocument()
  })

  it('shows the unsupported state when RAW decode needs cross-origin isolation', () => {
    mockedUseCapabilityGate.mockReturnValue({
      ready: true,
      supportStatus: 'unsupported',
      reason: 'Cross-origin isolation is required for pthread RAW decode',
    })

    render(<RawProcessorView />)

    expect(
      screen.getByText('This browser cannot run the RAW Lab'),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Cross-origin isolation is required for pthread RAW decode',
      ),
    ).toBeInTheDocument()
  })
})

describe('support classification', () => {
  it('marks unknown but decodable files as experimental', () => {
    expect(
      classifySupportLevel({
        cameraBrand: 'Sony',
        cameraModel: 'Unknown Model',
        rawFormat: 'arw',
      }),
    ).toBe('experimental')
  })
})
