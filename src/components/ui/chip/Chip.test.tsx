import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Chip } from './Chip'

describe('<Chip />', () => {
  it('renders label', () => {
    render(<Chip>Daylight</Chip>)
    expect(screen.getByText('Daylight')).toBeInTheDocument()
  })

  it('applies tone variant tokens', () => {
    render(
      <Chip tone="amber" data-testid="chip">
        Calibration
      </Chip>,
    )
    const chip = screen.getByTestId('chip')
    expect(chip.className).toMatch(/lf-amber/)
  })

  it('applies on-photo surface tokens', () => {
    render(
      <Chip surface="on-photo" data-testid="chip">
        Open
      </Chip>,
    )
    const chip = screen.getByTestId('chip')
    expect(chip.className).toMatch(/lf-on-photo/)
  })

  it('forwards aria attributes', () => {
    render(<Chip aria-label="LUT contract">Linear</Chip>)
    expect(screen.getByLabelText('LUT contract')).toBeInTheDocument()
  })
})
