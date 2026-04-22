import { render, screen } from '@testing-library/react'

import { RawProcessorView } from '../RawProcessorView'

describe('rawProcessorView', () => {
  it('renders the initial upload CTA', () => {
    render(<RawProcessorView />)

    expect(screen.getByText('Drop your RAW file here')).toBeInTheDocument()
  })
})
