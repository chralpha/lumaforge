import { fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import {
  clampCompareSplit,
  CompareSplitHandle,
  getCompareSplitFromClientX,
} from './CompareSplitHandle'

beforeAll(() => {
  window.PointerEvent = MouseEvent as typeof PointerEvent
  HTMLElement.prototype.setPointerCapture = function (pointerId: number) {
    this.dataset.capturedPointerId = String(pointerId)
  }
  HTMLElement.prototype.hasPointerCapture = function (pointerId: number) {
    return this.dataset.capturedPointerId === String(pointerId)
  }
})

describe('compare split helpers', () => {
  it('clamps split to the visible handle range', () => {
    expect(clampCompareSplit(-1)).toBe(0.05)
    expect(clampCompareSplit(0.5)).toBe(0.5)
    expect(clampCompareSplit(2)).toBe(0.95)
  })

  it('maps pointer x position to split fraction', () => {
    expect(getCompareSplitFromClientX({ left: 100, width: 400 }, 300)).toBe(0.5)
    expect(getCompareSplitFromClientX({ left: 100, width: 400 }, 60)).toBe(0.05)
    expect(getCompareSplitFromClientX({ left: 100, width: 400 }, 520)).toBe(
      0.95,
    )
  })
})

describe('compareSplitHandle', () => {
  it('updates split with keyboard arrows', () => {
    const onChange = vi.fn()

    render(<CompareSplitHandle value={0.5} onChange={onChange} />)

    const slider = screen.getByRole('slider', {
      name: 'Compare unprocessed RAW and final JPEG',
    })

    fireEvent.keyDown(slider, { key: 'ArrowRight' })
    expect(onChange).toHaveBeenLastCalledWith(0.51)

    fireEvent.keyDown(slider, { key: 'ArrowLeft' })
    expect(onChange).toHaveBeenLastCalledWith(0.49)
  })

  it('updates split with pointer movement using the parent track geometry', () => {
    const onChange = vi.fn()

    render(
      <div data-testid="track">
        <CompareSplitHandle value={0.5} onChange={onChange} />
      </div>,
    )

    const track = screen.getByTestId('track')
    const slider = screen.getByRole('slider')
    Object.defineProperty(track, 'getBoundingClientRect', {
      value: () => ({ left: 100, width: 400 }),
    })
    Object.defineProperty(slider, 'getBoundingClientRect', {
      value: () => ({ left: 320, width: 44 }),
    })

    fireEvent.pointerDown(slider, { clientX: 340, pointerId: 1 })
    expect(onChange).toHaveBeenLastCalledWith(0.6)

    fireEvent.pointerMove(slider, { clientX: 380, pointerId: 1 })
    expect(onChange).toHaveBeenLastCalledWith(0.7)
  })

  it('keeps pointer and click interactions from reaching the parent dropzone', () => {
    const onChange = vi.fn()
    const onParentClick = vi.fn()
    const onParentPointerDown = vi.fn()

    render(
      <div onClick={onParentClick} onPointerDown={onParentPointerDown}>
        <CompareSplitHandle value={0.5} onChange={onChange} />
      </div>,
    )

    const slider = screen.getByRole('slider')

    fireEvent.pointerDown(slider, { clientX: 340, pointerId: 1 })
    fireEvent.click(slider)

    expect(onParentPointerDown).not.toHaveBeenCalled()
    expect(onParentClick).not.toHaveBeenCalled()
  })

  it('exposes the clamped range and supports Home and End keys', () => {
    const onChange = vi.fn()

    render(<CompareSplitHandle value={0.5} onChange={onChange} />)

    const slider = screen.getByRole('slider')

    expect(slider).toHaveAttribute('aria-valuemin', '5')
    expect(slider).toHaveAttribute('aria-valuemax', '95')

    fireEvent.keyDown(slider, { key: 'Home' })
    expect(onChange).toHaveBeenLastCalledWith(0.05)

    fireEvent.keyDown(slider, { key: 'End' })
    expect(onChange).toHaveBeenLastCalledWith(0.95)
  })
})
