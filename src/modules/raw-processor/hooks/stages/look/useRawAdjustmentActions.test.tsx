import type {
  HSLBandId,
  HSLBandShift,
  ProcessingParams,
} from '@lumaforge/luma-color-runtime'
import { makeNeutralBand } from '@lumaforge/luma-color-runtime'
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useRawAdjustmentActions } from './useRawAdjustmentActions'

const BAND_IDS: readonly HSLBandId[] = [
  'red',
  'orange',
  'yellow',
  'green',
  'aqua',
  'blue',
  'purple',
  'magenta',
]

function makeNeutralSelectiveColorFixture(): Record<HSLBandId, HSLBandShift> {
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

const baseParams: ProcessingParams = {
  intensity: 0.7,
  viewMode: 'processed',
  compareSplit: 0.5,
  styleKind: 'none',
  builtinPreset: null,
  userExposureEv: 0,
  userContrast: 0,
  userHighlights: 0,
  userShadows: 0,
  userWhites: 0,
  userBlacks: 0,
  userTemperature: 0,
  userTint: 0,
}

type MutableParamsRef = {
  current: ProcessingParams
}

function createParamsHarness(initial: ProcessingParams) {
  const ref: MutableParamsRef = { current: initial }
  const setParams = vi.fn(
    (
      value: ProcessingParams | ((prev: ProcessingParams) => ProcessingParams),
    ) => {
      ref.current =
        typeof value === 'function'
          ? (value as (prev: ProcessingParams) => ProcessingParams)(ref.current)
          : value
    },
  )
  return { ref, setParams }
}

describe('useRawAdjustmentActions', () => {
  it('routes view-only params separately from render params', () => {
    const setParams = vi.fn()
    const setViewMode = vi.fn()
    const setCompareSplit = vi.fn()
    const invalidateExportGraph = vi.fn()
    const { result } = renderHook(() =>
      useRawAdjustmentActions({
        params: baseParams,
        setParams,
        invalidateExportGraph,
        setViewMode,
        setCompareSplit,
      }),
    )

    result.current.setParams({
      viewMode: 'compare',
      compareSplit: 0.25,
      userExposureEv: 1,
    })

    expect(setViewMode).toHaveBeenCalledWith('compare')
    expect(setCompareSplit).toHaveBeenCalledWith(0.25)
    expect(setParams).toHaveBeenCalledTimes(1)
    expect(invalidateExportGraph).toHaveBeenCalledTimes(1)
  })

  describe('setSelectiveColorBand', () => {
    it('state safety at action layer leaves other bands untouched', () => {
      // Pre-populate non-target bands with sentinel values that must be preserved.
      const initial: ProcessingParams = {
        ...baseParams,
        selectiveColor: {
          red: { hue: 0, saturation: 0, lightness: 0 },
          orange: { hue: 1, saturation: 2, lightness: 3 },
          yellow: { hue: 4, saturation: 5, lightness: 6 },
          green: { hue: 7, saturation: 8, lightness: 9 },
          aqua: { hue: 10, saturation: 11, lightness: 12 },
          blue: { hue: 13, saturation: 14, lightness: 15 },
          purple: { hue: 16, saturation: 17, lightness: 18 },
          magenta: { hue: 19, saturation: 20, lightness: 21 },
        },
      }

      const { ref, setParams } = createParamsHarness(initial)
      const invalidateExportGraph = vi.fn()
      const { result } = renderHook(() =>
        useRawAdjustmentActions({
          params: ref.current,
          setParams,
          invalidateExportGraph,
        }),
      )

      act(() => {
        result.current.setSelectiveColorBand('red', { hue: 50 })
      })

      expect(ref.current.selectiveColor?.red).toEqual({
        hue: 50,
        saturation: 0,
        lightness: 0,
      })
      // Other bands must be byte-identical to the pre-call sentinel values.
      expect(ref.current.selectiveColor?.orange).toEqual({
        hue: 1,
        saturation: 2,
        lightness: 3,
      })
      expect(ref.current.selectiveColor?.yellow).toEqual({
        hue: 4,
        saturation: 5,
        lightness: 6,
      })
      expect(ref.current.selectiveColor?.green).toEqual({
        hue: 7,
        saturation: 8,
        lightness: 9,
      })
      expect(ref.current.selectiveColor?.aqua).toEqual({
        hue: 10,
        saturation: 11,
        lightness: 12,
      })
      expect(ref.current.selectiveColor?.blue).toEqual({
        hue: 13,
        saturation: 14,
        lightness: 15,
      })
      expect(ref.current.selectiveColor?.purple).toEqual({
        hue: 16,
        saturation: 17,
        lightness: 18,
      })
      expect(ref.current.selectiveColor?.magenta).toEqual({
        hue: 19,
        saturation: 20,
        lightness: 21,
      })
      expect(invalidateExportGraph).toHaveBeenCalled()
    })

    it('partial band update preserves other fields in the same band', () => {
      const initial: ProcessingParams = {
        ...baseParams,
        selectiveColor: {
          ...makeNeutralSelectiveColorFixture(),
          red: { hue: 10, saturation: 25, lightness: -12 },
        },
      }
      const { ref, setParams } = createParamsHarness(initial)
      const invalidateExportGraph = vi.fn()
      const { result } = renderHook(() =>
        useRawAdjustmentActions({
          params: ref.current,
          setParams,
          invalidateExportGraph,
        }),
      )

      act(() => {
        result.current.setSelectiveColorBand('red', { hue: 50 })
      })

      expect(ref.current.selectiveColor?.red).toEqual({
        hue: 50,
        saturation: 25,
        lightness: -12,
      })
    })

    it('initializes selectiveColor to all-neutral when previously undefined', () => {
      const initial: ProcessingParams = { ...baseParams }
      const { ref, setParams } = createParamsHarness(initial)
      const invalidateExportGraph = vi.fn()
      const { result } = renderHook(() =>
        useRawAdjustmentActions({
          params: ref.current,
          setParams,
          invalidateExportGraph,
        }),
      )

      act(() => {
        result.current.setSelectiveColorBand('blue', { saturation: 30 })
      })

      expect(ref.current.selectiveColor).toBeDefined()
      for (const id of BAND_IDS) {
        if (id === 'blue') {
          expect(ref.current.selectiveColor![id]).toEqual({
            hue: 0,
            saturation: 30,
            lightness: 0,
          })
        } else {
          expect(ref.current.selectiveColor![id]).toEqual({
            hue: 0,
            saturation: 0,
            lightness: 0,
          })
        }
      }
      expect(invalidateExportGraph).toHaveBeenCalled()
    })
  })

  describe('resetSelectiveColor', () => {
    it('reset scope isolation clears all 24 selective-color scalars but preserves tone and color balance', () => {
      const initial: ProcessingParams = {
        ...baseParams,
        userExposureEv: 1.5,
        userContrast: -20,
        userTemperature: 12,
        userTint: -8,
        selectiveColor: {
          red: { hue: 50, saturation: 30, lightness: -10 },
          orange: { hue: 5, saturation: 5, lightness: 5 },
          yellow: { hue: 5, saturation: 5, lightness: 5 },
          green: { hue: 5, saturation: 5, lightness: 5 },
          aqua: { hue: 5, saturation: 5, lightness: 5 },
          blue: { hue: 5, saturation: 5, lightness: 5 },
          purple: { hue: 5, saturation: 5, lightness: 5 },
          magenta: { hue: 5, saturation: 5, lightness: 5 },
        },
      }
      const { ref, setParams } = createParamsHarness(initial)
      const invalidateExportGraph = vi.fn()
      const { result } = renderHook(() =>
        useRawAdjustmentActions({
          params: ref.current,
          setParams,
          invalidateExportGraph,
        }),
      )

      act(() => {
        result.current.resetSelectiveColor()
      })

      // All 24 scalars across all 8 bands must be zero.
      for (const id of BAND_IDS) {
        expect(ref.current.selectiveColor![id]).toEqual({
          hue: 0,
          saturation: 0,
          lightness: 0,
        })
      }
      // Tone scalars preserved.
      expect(ref.current.userExposureEv).toBe(1.5)
      expect(ref.current.userContrast).toBe(-20)
      // Color balance scalars preserved.
      expect(ref.current.userTemperature).toBe(12)
      expect(ref.current.userTint).toBe(-8)
      expect(invalidateExportGraph).toHaveBeenCalled()
    })

    it('resetTone does not touch selective color', () => {
      const initial: ProcessingParams = {
        ...baseParams,
        userExposureEv: 1.0,
        selectiveColor: {
          ...makeNeutralSelectiveColorFixture(),
          red: { hue: 50, saturation: 0, lightness: 0 },
        },
      }
      const { ref, setParams } = createParamsHarness(initial)
      const invalidateExportGraph = vi.fn()
      const { result } = renderHook(() =>
        useRawAdjustmentActions({
          params: ref.current,
          setParams,
          invalidateExportGraph,
        }),
      )

      act(() => {
        result.current.resetTone()
      })

      expect(ref.current.userExposureEv).toBe(0)
      expect(ref.current.selectiveColor?.red).toEqual({
        hue: 50,
        saturation: 0,
        lightness: 0,
      })
    })

    it('resetColor does not touch selective color', () => {
      const initial: ProcessingParams = {
        ...baseParams,
        userTemperature: 18,
        userTint: -5,
        selectiveColor: {
          ...makeNeutralSelectiveColorFixture(),
          red: { hue: 50, saturation: 0, lightness: 0 },
        },
      }
      const { ref, setParams } = createParamsHarness(initial)
      const invalidateExportGraph = vi.fn()
      const { result } = renderHook(() =>
        useRawAdjustmentActions({
          params: ref.current,
          setParams,
          invalidateExportGraph,
        }),
      )

      act(() => {
        result.current.resetColor()
      })

      expect(ref.current.userTemperature).toBe(0)
      expect(ref.current.userTint).toBe(0)
      expect(ref.current.selectiveColor?.red).toEqual({
        hue: 50,
        saturation: 0,
        lightness: 0,
      })
    })

    it('does not invalidate the export graph when already neutral', () => {
      const initial: ProcessingParams = {
        ...baseParams,
        selectiveColor: makeNeutralSelectiveColorFixture(),
      }
      const { ref, setParams } = createParamsHarness(initial)
      const invalidateExportGraph = vi.fn()
      const { result } = renderHook(() =>
        useRawAdjustmentActions({
          params: ref.current,
          setParams,
          invalidateExportGraph,
        }),
      )

      act(() => {
        result.current.resetSelectiveColor()
      })

      expect(invalidateExportGraph).not.toHaveBeenCalled()
    })
  })
})
