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

function bandRows() {
  return screen
    .getAllByRole('group')
    .filter((el) => el.getAttribute('data-hsl-band'))
}

function axisTab(name: string) {
  return screen.getByRole('tab', { name })
}

describe('hslTool axis-first layout', () => {
  it('renders three axis tabs and defaults to hue', () => {
    setup()
    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(3)
    expect(tabs.map((t) => t.textContent)).toEqual([
      enMessages['raw.hsl.fields.hue'],
      enMessages['raw.hsl.fields.saturation'],
      enMessages['raw.hsl.fields.lightness'],
    ])
    expect(axisTab(enMessages['raw.hsl.fields.hue'])).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(
      screen.getByRole('tabpanel', {
        name: enMessages['raw.hsl.fields.hue'],
      }),
    ).toBeInTheDocument()
  })

  it('renders 8 band rows in documented order with a single slider each', () => {
    setup()
    const rows = bandRows()
    expect(rows).toHaveLength(8)
    BAND_ORDER.forEach((band, i) => {
      expect(rows[i]).toHaveAttribute('data-hsl-band', band)
      const sliders = within(rows[i]).getAllByRole('slider')
      expect(sliders).toHaveLength(1)
    })
    expect(screen.getAllByRole('slider')).toHaveLength(8)
  })

  it('labels every slider with the active axis name', () => {
    setup()
    const sliders = screen.getAllByRole('slider')
    for (const s of sliders) {
      expect(s).toHaveAttribute('aria-label', enMessages['raw.hsl.fields.hue'])
    }
  })

  it('clamps each slider to [-100, 100]', () => {
    setup()
    for (const slider of screen.getAllByRole('slider')) {
      expect(slider).toHaveAttribute('aria-valuemin', '-100')
      expect(slider).toHaveAttribute('aria-valuemax', '100')
    }
  })

  it('switches the active axis when a tab is clicked, swapping all 8 sliders', async () => {
    const user = userEvent.setup()
    setup()

    await user.click(axisTab(enMessages['raw.hsl.fields.saturation']))
    expect(axisTab(enMessages['raw.hsl.fields.saturation'])).toHaveAttribute(
      'aria-selected',
      'true',
    )
    const sliders = screen.getAllByRole('slider')
    expect(sliders).toHaveLength(8)
    for (const s of sliders) {
      expect(s).toHaveAttribute(
        'aria-label',
        enMessages['raw.hsl.fields.saturation'],
      )
    }
    expect(
      screen.getByRole('tabpanel', {
        name: enMessages['raw.hsl.fields.saturation'],
      }),
    ).toBeInTheDocument()
  })

  it('dispatches onChange(band, {hue: n}) on the default Hue tab', async () => {
    const user = userEvent.setup()
    const { onChange } = setup({ value: neutralBands() })

    const redSlider = within(
      bandRows().find((el) => el.getAttribute('data-hsl-band') === 'red')!,
    ).getByRole('slider')
    redSlider.focus()
    await user.keyboard('{ArrowRight}')

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0]).toEqual(['red', { hue: 1 }])
  })

  it('dispatches onChange(band, {saturation: n}) on the Saturation tab', async () => {
    const user = userEvent.setup()
    const { onChange } = setup({ value: neutralBands() })

    await user.click(axisTab(enMessages['raw.hsl.fields.saturation']))
    const orangeSlider = within(
      bandRows().find((el) => el.getAttribute('data-hsl-band') === 'orange')!,
    ).getByRole('slider')
    orangeSlider.focus()
    await user.keyboard('{ArrowRight}')

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0]).toEqual(['orange', { saturation: 1 }])
  })

  it('reflects the active axis value (Lightness tab shows the lightness scalars)', async () => {
    const user = userEvent.setup()
    const value = neutralBands()
    value.aqua = { hue: 7, saturation: 0, lightness: 42 }
    setup({ value })

    await user.click(axisTab(enMessages['raw.hsl.fields.lightness']))
    const aquaSlider = within(
      bandRows().find((el) => el.getAttribute('data-hsl-band') === 'aqua')!,
    ).getByRole('slider')
    expect(aquaSlider).toHaveAttribute('aria-valuenow', '42')

    // Switching back to Hue should reflect aqua.hue = 7, not 42
    await user.click(axisTab(enMessages['raw.hsl.fields.hue']))
    const aquaSliderHue = within(
      bandRows().find((el) => el.getAttribute('data-hsl-band') === 'aqua')!,
    ).getByRole('slider')
    expect(aquaSliderHue).toHaveAttribute('aria-valuenow', '7')
  })
})

describe('hslTool reset buttons', () => {
  it('disables both reset buttons when value is undefined', () => {
    setup({ value: undefined })
    expect(
      screen.getByRole('button', {
        name: enMessages['raw.hsl.resetHue'],
      }),
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: enMessages['raw.hsl.reset'] }),
    ).toBeDisabled()
  })

  it('shows the axis-scoped reset label that matches the active tab', async () => {
    const user = userEvent.setup()
    setup()
    expect(
      screen.getByRole('button', {
        name: enMessages['raw.hsl.resetHue'],
      }),
    ).toBeInTheDocument()

    await user.click(axisTab(enMessages['raw.hsl.fields.saturation']))
    expect(
      screen.getByRole('button', {
        name: enMessages['raw.hsl.resetSaturation'],
      }),
    ).toBeInTheDocument()

    await user.click(axisTab(enMessages['raw.hsl.fields.lightness']))
    expect(
      screen.getByRole('button', {
        name: enMessages['raw.hsl.resetLightness'],
      }),
    ).toBeInTheDocument()
  })

  it('enables axis reset only when the active axis is non-neutral', async () => {
    const user = userEvent.setup()
    const value = neutralBands()
    value.green = { hue: 0, saturation: 30, lightness: 0 }
    setup({ value })

    // On Hue tab the axis is neutral (green.hue = 0, others 0) -> disabled
    expect(
      screen.getByRole('button', {
        name: enMessages['raw.hsl.resetHue'],
      }),
    ).toBeDisabled()
    // Reset all is enabled because saturation is non-neutral.
    expect(
      screen.getByRole('button', { name: enMessages['raw.hsl.reset'] }),
    ).toBeEnabled()

    // Switch to Saturation tab -> axis reset enables.
    await user.click(axisTab(enMessages['raw.hsl.fields.saturation']))
    expect(
      screen.getByRole('button', {
        name: enMessages['raw.hsl.resetSaturation'],
      }),
    ).toBeEnabled()
  })

  it('axis reset emits onChange for all 8 bands clearing only the active axis', async () => {
    const user = userEvent.setup()
    const value = neutralBands()
    value.red = { hue: 30, saturation: 30, lightness: 30 }
    value.blue = { hue: -20, saturation: 0, lightness: 0 }
    const { onChange, onReset } = setup({ value })

    await user.click(
      screen.getByRole('button', {
        name: enMessages['raw.hsl.resetHue'],
      }),
    )

    expect(onReset).not.toHaveBeenCalled()
    expect(onChange).toHaveBeenCalledTimes(8)
    const bandsInOrder = onChange.mock.calls.map(([band]) => band)
    expect(bandsInOrder).toEqual(BAND_ORDER)
    for (const [, shift] of onChange.mock.calls) {
      expect(shift).toEqual({ hue: 0 })
    }
  })

  it('reset all dispatches onReset once', async () => {
    const user = userEvent.setup()
    const value = neutralBands()
    value.purple = { hue: 11, saturation: 0, lightness: 0 }
    const { onReset, onChange } = setup({ value })

    await user.click(
      screen.getByRole('button', { name: enMessages['raw.hsl.reset'] }),
    )
    expect(onReset).toHaveBeenCalledTimes(1)
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('hslTool surface', () => {
  it('renders the product copy explaining adjacent-band coordination', () => {
    setup()
    expect(screen.getByText(enMessages['raw.hsl.note'])).toBeInTheDocument()
  })

  it('disables sliders, tabs, and both reset buttons when disabled is true', () => {
    setup({ value: undefined, disabled: true })
    for (const slider of screen.getAllByRole('slider')) {
      expect(slider).toHaveAttribute('data-disabled')
    }
    for (const tab of screen.getAllByRole('tab')) {
      expect(tab).toBeDisabled()
    }
    expect(
      screen.getByRole('button', {
        name: enMessages['raw.hsl.resetHue'],
      }),
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: enMessages['raw.hsl.reset'] }),
    ).toBeDisabled()
  })
})
