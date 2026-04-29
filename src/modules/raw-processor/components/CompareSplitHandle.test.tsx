import { fireEvent, render, screen } from '@testing-library/react'
import { createElement } from 'react'
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
  HTMLElement.prototype.releasePointerCapture = function (pointerId: number) {
    if (this.dataset.capturedPointerId === String(pointerId)) {
      delete this.dataset.capturedPointerId
    }
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

  it('previews pointer movement on animation frames and commits on release', () => {
    const onChange = vi.fn()
    const onPreviewChange = vi.fn()
    const animationFrames: FrameRequestCallback[] = []
    const requestAnimationFrame = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        animationFrames.push(callback)
        return animationFrames.length
      })
    const cancelAnimationFrame = vi
      .spyOn(window, 'cancelAnimationFrame')
      .mockImplementation(() => {})

    render(
      <div data-testid="track">
        {createElement(CompareSplitHandle, {
          value: 0.5,
          onChange,
          onPreviewChange,
        })}
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
    fireEvent.pointerMove(slider, { clientX: 380, pointerId: 1 })

    expect(onChange).not.toHaveBeenCalled()
    expect(onPreviewChange).not.toHaveBeenCalled()
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1)

    animationFrames[0]?.(performance.now())
    expect(onPreviewChange).toHaveBeenLastCalledWith(0.7)
    expect(onChange).not.toHaveBeenCalled()

    fireEvent.pointerUp(slider, { clientX: 380, pointerId: 1 })
    expect(onChange).toHaveBeenLastCalledWith(0.7)

    requestAnimationFrame.mockRestore()
    cancelAnimationFrame.mockRestore()
  })

  it('maps pointer movement through the rendered image bounds when letterboxed', () => {
    const onChange = vi.fn()

    render(
      <div data-testid="track">
        <canvas data-raw-compare-track="image" data-testid="image-track" />
        <CompareSplitHandle value={0.5} onChange={onChange} />
      </div>,
    )

    const track = screen.getByTestId('track')
    const imageTrack = screen.getByTestId('image-track')
    const slider = screen.getByRole('slider')
    Object.defineProperty(track, 'getBoundingClientRect', {
      value: () => ({ left: 0, width: 1000 }),
    })
    Object.defineProperty(imageTrack, 'getBoundingClientRect', {
      value: () => ({ left: 250, width: 500 }),
    })
    Object.defineProperty(slider, 'getBoundingClientRect', {
      value: () => ({ left: 500, width: 44 }),
    })

    fireEvent.pointerDown(slider, { clientX: 650, pointerId: 1 })
    fireEvent.pointerUp(slider, { clientX: 650, pointerId: 1 })

    expect(onChange).toHaveBeenLastCalledWith(0.8)
  })

  it('keeps the transient preview position when the parent rerenders during drag', () => {
    const onChange = vi.fn()
    const animationFrames: FrameRequestCallback[] = []
    const requestAnimationFrame = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        animationFrames.push(callback)
        return animationFrames.length
      })
    const cancelAnimationFrame = vi
      .spyOn(window, 'cancelAnimationFrame')
      .mockImplementation(() => {})

    const { rerender } = render(
      <div data-testid="track">
        <CompareSplitHandle value={0.5} onChange={onChange} />
      </div>,
    )

    const track = screen.getByTestId('track')
    const slider = screen.getByRole('slider')
    Object.defineProperty(track, 'getBoundingClientRect', {
      value: () => ({ left: 0, width: 100 }),
    })
    Object.defineProperty(slider, 'getBoundingClientRect', {
      value: () => ({ left: 50, width: 44 }),
    })

    fireEvent.pointerDown(slider, { clientX: 50, pointerId: 1 })
    fireEvent.pointerMove(slider, { clientX: 80, pointerId: 1 })
    animationFrames[0]?.(performance.now())

    expect(slider.style.getPropertyValue('--raw-compare-split')).toBe('80%')

    rerender(
      <div data-testid="track">
        <CompareSplitHandle value={0.5} onChange={onChange} />
      </div>,
    )

    expect(slider.style.getPropertyValue('--raw-compare-split')).toBe('80%')

    requestAnimationFrame.mockRestore()
    cancelAnimationFrame.mockRestore()
  })

  it('publishes transient pointer split to the parent frame for sibling preview layers', () => {
    const onChange = vi.fn()
    const animationFrames: FrameRequestCallback[] = []
    const requestAnimationFrame = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        animationFrames.push(callback)
        return animationFrames.length
      })
    const cancelAnimationFrame = vi
      .spyOn(window, 'cancelAnimationFrame')
      .mockImplementation(() => {})

    render(
      <div data-testid="track">
        <div data-testid="sample-layer" />
        <CompareSplitHandle value={0.5} onChange={onChange} />
      </div>,
    )

    const track = screen.getByTestId('track')
    const slider = screen.getByRole('slider')
    Object.defineProperty(track, 'getBoundingClientRect', {
      value: () => ({ left: 0, width: 100 }),
    })
    Object.defineProperty(slider, 'getBoundingClientRect', {
      value: () => ({ left: 50, width: 44 }),
    })

    fireEvent.pointerDown(slider, { clientX: 50, pointerId: 1 })
    fireEvent.pointerMove(slider, { clientX: 80, pointerId: 1 })
    animationFrames[0]?.(performance.now())

    expect(track.style.getPropertyValue('--raw-compare-split')).toBe('80%')
    expect(onChange).not.toHaveBeenCalled()

    requestAnimationFrame.mockRestore()
    cancelAnimationFrame.mockRestore()
  })

  it('keeps pointer dragging usable when pointer capture is unavailable', () => {
    const onChange = vi.fn()
    const originalSetPointerCapture = HTMLElement.prototype.setPointerCapture
    const originalReleasePointerCapture =
      HTMLElement.prototype.releasePointerCapture
    HTMLElement.prototype.setPointerCapture = vi.fn(() => {
      throw new DOMException('No active pointer', 'NotFoundError')
    })
    HTMLElement.prototype.releasePointerCapture = vi.fn(() => {
      throw new DOMException('No active pointer', 'NotFoundError')
    })

    try {
      render(
        <div data-testid="track">
          <CompareSplitHandle value={0.5} onChange={onChange} />
        </div>,
      )

      const track = screen.getByTestId('track')
      const slider = screen.getByRole('slider')
      Object.defineProperty(track, 'getBoundingClientRect', {
        value: () => ({ left: 0, width: 100 }),
      })
      Object.defineProperty(slider, 'getBoundingClientRect', {
        value: () => ({ left: 50, width: 44 }),
      })

      expect(() => {
        fireEvent.pointerDown(slider, { clientX: 50, pointerId: 1 })
        fireEvent.pointerMove(slider, { clientX: 80, pointerId: 1 })
        fireEvent.pointerUp(slider, { clientX: 80, pointerId: 1 })
      }).not.toThrow()
      expect(onChange).toHaveBeenLastCalledWith(0.8)
    } finally {
      HTMLElement.prototype.setPointerCapture = originalSetPointerCapture
      HTMLElement.prototype.releasePointerCapture =
        originalReleasePointerCapture
    }
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
