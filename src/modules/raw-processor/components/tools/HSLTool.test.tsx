import type { HSLBandId, HSLBandShift } from '@lumaforge/luma-color-runtime'
import { makeNeutralBand } from '@lumaforge/luma-color-runtime'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import enMessages from '~/locales/en.json'

import { HSLTool } from './HSLTool'

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    vi.fn().mockImplementation(() => ({
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
    })),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const BAND_ORDER: HSLBandId[] = [
  'red',
  'orange',
  'yellow',
  'green',
  'aqua',
  'blue',
  'purple',
  'magenta',
]

function neutralBands(): Record<HSLBandId, HSLBandShift> {
  return {
    red: makeNeutralBand(),
    orange: makeNeutralBand(),
    yellow: makeNeutralBand(),
    green: makeNeutralBand(),
    aqua: makeNeutralBand(),
    blue: makeNeutralBand(),
    purple: makeNeutralBand(),
    magenta: makeNeutralBand(),
  }
}

function setup(
  overrides: Partial<{
    value: Record<HSLBandId, HSLBandShift> | undefined
    disabled: boolean
  }> = {},
) {
  const onChange =
    vi.fn<(band: HSLBandId, shift: Partial<HSLBandShift>) => void>()
  const onReset = vi.fn<() => void>()
  const utils = render(
    <HSLTool
      value={overrides.value}
      disabled={overrides.disabled ?? false}
      onChange={onChange}
      onReset={onReset}
    />,
  )
  return { onChange, onReset, ...utils }
}

describe('hslTool', () => {
  it('renders 8 band sections in the documented red-to-magenta order', () => {
    setup()
    const sections = screen.getAllByRole('group', { name: /.+/ })
    // 8 band groups
    const bandSections = sections.filter((el) =>
      el.getAttribute('data-hsl-band'),
    )
    expect(bandSections).toHaveLength(8)
    BAND_ORDER.forEach((band, index) => {
      expect(bandSections[index]).toHaveAttribute('data-hsl-band', band)
      expect(bandSections[index]).toHaveAccessibleName(
        enMessages[`raw.hsl.bands.${band}` as keyof typeof enMessages],
      )
    })
  })

  it('exposes hue, saturation, and lightness sliders inside every band', () => {
    setup()
    const bandSections = screen
      .getAllByRole('group')
      .filter((el) => el.getAttribute('data-hsl-band'))
    for (const section of bandSections) {
      const sliders = within(section).getAllByRole('slider')
      expect(sliders).toHaveLength(3)
      const labels = sliders.map((s) => s.getAttribute('aria-labelledby'))
      const labelTexts = labels.map((labelledBy) => {
        if (!labelledBy) return null
        return document.getElementById(labelledBy)?.textContent ?? null
      })
      expect(labelTexts).toEqual([
        enMessages['raw.hsl.fields.hue'],
        enMessages['raw.hsl.fields.saturation'],
        enMessages['raw.hsl.fields.lightness'],
      ])
    }
  })

  it('clamps each slider to the [-100, 100] range with step 1', () => {
    setup()
    const sliders = screen.getAllByRole('slider')
    expect(sliders).toHaveLength(24)
    for (const slider of sliders) {
      expect(slider).toHaveAttribute('aria-valuemin', '-100')
      expect(slider).toHaveAttribute('aria-valuemax', '100')
    }
  })

  it('disables the reset button when value is undefined (no HSL touched yet)', () => {
    setup({ value: undefined })
    const reset = screen.getByRole('button', {
      name: enMessages['raw.hsl.reset'],
    })
    expect(reset).toBeDisabled()
  })

  it('disables the reset button when all 24 scalars are neutral', () => {
    setup({ value: neutralBands() })
    const reset = screen.getByRole('button', {
      name: enMessages['raw.hsl.reset'],
    })
    expect(reset).toBeDisabled()
  })

  it('enables the reset button when any scalar is non-zero', () => {
    const value = neutralBands()
    value.orange = { hue: 12, saturation: 0, lightness: 0 }
    setup({ value })
    const reset = screen.getByRole('button', {
      name: enMessages['raw.hsl.reset'],
    })
    expect(reset).toBeEnabled()
  })

  it('calls onChange with the band id and just the touched scalar', async () => {
    const user = userEvent.setup()
    const { onChange } = setup({ value: neutralBands() })
    const redSection = screen
      .getAllByRole('group')
      .find((el) => el.getAttribute('data-hsl-band') === 'red')!
    const sliders = within(redSection).getAllByRole('slider')
    sliders[0].focus()
    await user.keyboard('{ArrowRight}')

    expect(onChange).toHaveBeenCalledTimes(1)
    const [band, shift] = onChange.mock.calls[0]
    expect(band).toBe('red')
    expect(shift).toEqual({ hue: 1 })
  })

  it('calls onReset exactly once when the reset button is clicked', async () => {
    const user = userEvent.setup()
    const value = neutralBands()
    value.green = { hue: 4, saturation: 0, lightness: 0 }
    const { onReset } = setup({ value })

    await user.click(
      screen.getByRole('button', { name: enMessages['raw.hsl.reset'] }),
    )
    expect(onReset).toHaveBeenCalledTimes(1)
  })

  it('renders the product copy explaining adjacent-band coordination', () => {
    setup()
    expect(screen.getByText(enMessages['raw.hsl.note'])).toBeInTheDocument()
  })

  it('disables all sliders and the reset button when disabled is true', () => {
    setup({ value: undefined, disabled: true })
    for (const slider of screen.getAllByRole('slider')) {
      expect(slider).toHaveAttribute('data-disabled')
    }
    expect(
      screen.getByRole('button', { name: enMessages['raw.hsl.reset'] }),
    ).toBeDisabled()
  })
})
