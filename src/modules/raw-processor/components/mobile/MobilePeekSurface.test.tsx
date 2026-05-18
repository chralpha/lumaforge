import { fireEvent, render, screen } from '@testing-library/react'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MobilePeekSurface } from './MobilePeekSurface'

describe('mobilePeekSurface', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('peeks RAW after long-press and restores on release', () => {
    const onPeekChange = vi.fn()
    render(<MobilePeekSurface enabled onPeekChange={onPeekChange} />)
    const surface = screen.getByTestId('mobile-peek-surface')
    fireEvent.pointerDown(surface)
    act(() => {
      vi.advanceTimersByTime(260)
    })
    expect(onPeekChange).toHaveBeenLastCalledWith(true)
    fireEvent.pointerUp(surface)
    expect(onPeekChange).toHaveBeenLastCalledWith(false)
  })

  it('fires onTap for a short tap and not a peek', () => {
    const onTap = vi.fn()
    const onPeekChange = vi.fn()
    render(
      <MobilePeekSurface enabled onPeekChange={onPeekChange} onTap={onTap} />,
    )
    const s = screen.getByTestId('mobile-peek-surface')
    fireEvent.pointerDown(s)
    act(() => {
      vi.advanceTimersByTime(120)
    })
    fireEvent.pointerUp(s)
    expect(onTap).toHaveBeenCalledTimes(1)
    expect(onPeekChange).not.toHaveBeenCalled()
  })

  it('does not fire onTap after a long-press peek', () => {
    const onTap = vi.fn()
    const onPeekChange = vi.fn()
    render(
      <MobilePeekSurface enabled onPeekChange={onPeekChange} onTap={onTap} />,
    )
    const s = screen.getByTestId('mobile-peek-surface')
    fireEvent.pointerDown(s)
    act(() => {
      vi.advanceTimersByTime(300)
    })
    fireEvent.pointerUp(s)
    expect(onPeekChange).toHaveBeenLastCalledWith(false)
    expect(onTap).not.toHaveBeenCalled()
  })

  it('allowPeek=false keeps short taps but consumes held presses', () => {
    const onTap = vi.fn()
    const onPeekChange = vi.fn()
    render(
      <MobilePeekSurface
        enabled
        allowPeek={false}
        onPeekChange={onPeekChange}
        onTap={onTap}
      />,
    )
    const s = screen.getByTestId('mobile-peek-surface')
    fireEvent.pointerDown(s)
    act(() => {
      vi.advanceTimersByTime(120)
    })
    fireEvent.pointerUp(s)
    expect(onPeekChange).not.toHaveBeenCalled()
    expect(onTap).toHaveBeenCalledTimes(1)

    onTap.mockClear()
    fireEvent.pointerDown(s)
    act(() => {
      vi.advanceTimersByTime(400)
    })
    fireEvent.pointerUp(s)
    expect(onPeekChange).not.toHaveBeenCalled()
    expect(onTap).not.toHaveBeenCalled()
  })

  it('does not peek when disabled', () => {
    const onPeekChange = vi.fn()
    render(<MobilePeekSurface enabled={false} onPeekChange={onPeekChange} />)
    fireEvent.pointerDown(screen.getByTestId('mobile-peek-surface'))
    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(onPeekChange).not.toHaveBeenCalled()
  })
})
