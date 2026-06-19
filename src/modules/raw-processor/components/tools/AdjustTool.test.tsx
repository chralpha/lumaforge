import type { HSLBandId, HSLBandShift } from '@lumaforge/luma-color-runtime'
import { makeNeutralBand } from '@lumaforge/luma-color-runtime'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import enMessages from '~/locales/en.json'

import { AdjustTool } from './AdjustTool'
import type { ColorValue } from './ColorTool'
import type { ToneValue } from './ToneTool'

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

const neutralTone: ToneValue = {
  userExposureEv: 0,
  userContrast: 0,
  userHighlights: 0,
  userShadows: 0,
  userWhites: 0,
  userBlacks: 0,
}
const neutralColor: ColorValue = {
  userTemperature: 0,
  userTint: 0,
  userSaturation: 0,
  userVibrance: 0,
}

function neutralSelectiveColor(): Record<HSLBandId, HSLBandShift> {
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

function setup() {
  const onToneChange = vi.fn<(value: Partial<ToneValue>) => void>()
  const onToneReset = vi.fn<() => void>()
  const onColorChange = vi.fn<(value: Partial<ColorValue>) => void>()
  const onColorReset = vi.fn<() => void>()
  const onSelectiveColorChange =
    vi.fn<(band: HSLBandId, shift: Partial<HSLBandShift>) => void>()
  const onSelectiveColorReset = vi.fn<() => void>()

  render(
    <AdjustTool
      tone={neutralTone}
      color={neutralColor}
      selectiveColor={neutralSelectiveColor()}
      disabled={false}
      onToneChange={onToneChange}
      onToneReset={onToneReset}
      onColorChange={onColorChange}
      onColorReset={onColorReset}
      onSelectiveColorChange={onSelectiveColorChange}
      onSelectiveColorReset={onSelectiveColorReset}
    />,
  )

  return {
    onToneChange,
    onToneReset,
    onColorChange,
    onColorReset,
    onSelectiveColorChange,
    onSelectiveColorReset,
  }
}

describe('adjustTool with selective color', () => {
  it('renders a Tone, Color, and HSL section', () => {
    setup()
    expect(
      screen.getByRole('region', { name: enMessages['raw.adjust.tone'] }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('region', { name: enMessages['raw.adjust.color'] }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('region', { name: enMessages['raw.adjust.hsl'] }),
    ).toBeInTheDocument()
  })

  it('routes a tone slider change only to onToneChange', async () => {
    const user = userEvent.setup()
    const { onToneChange, onColorChange, onSelectiveColorChange } = setup()
    const toneSection = screen.getByRole('region', {
      name: enMessages['raw.adjust.tone'],
    })
    const sliders = within(toneSection).getAllByRole('slider')
    sliders[0].focus()
    await user.keyboard('{ArrowRight}')

    expect(onToneChange).toHaveBeenCalledTimes(1)
    expect(onColorChange).not.toHaveBeenCalled()
    expect(onSelectiveColorChange).not.toHaveBeenCalled()
  })

  it('routes an HSL slider change only to onSelectiveColorChange', async () => {
    const user = userEvent.setup()
    const { onToneChange, onColorChange, onSelectiveColorChange } = setup()
    const hslSection = screen.getByRole('region', {
      name: enMessages['raw.adjust.hsl'],
    })
    const sliders = within(hslSection).getAllByRole('slider')
    // Use a band that won't be the first tone slider — middle band, hue slider.
    sliders[0].focus()
    await user.keyboard('{ArrowRight}')

    expect(onSelectiveColorChange).toHaveBeenCalledTimes(1)
    expect(onToneChange).not.toHaveBeenCalled()
    expect(onColorChange).not.toHaveBeenCalled()
  })
})
