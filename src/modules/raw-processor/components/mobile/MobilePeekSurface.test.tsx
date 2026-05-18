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
