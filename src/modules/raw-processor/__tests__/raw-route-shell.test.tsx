import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'

import { RawProcessorView } from '../RawProcessorView'

describe('rawProcessorView', () => {
  it('renders the initial upload CTA', () => {
    mockedUseCapabilityGate.mockReturnValue({
      ready: true,
      supportStatus: 'supported',
      reason: null,
    })

    render(<RawProcessorView />)

    expect(screen.getByText('Drop your RAW file here')).toBeInTheDocument()
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
      screen.getByText('This browser is not supported'),
    ).toBeInTheDocument()
  })
})
