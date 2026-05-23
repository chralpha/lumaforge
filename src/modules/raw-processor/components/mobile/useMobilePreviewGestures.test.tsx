import { render } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useMobilePreviewGestures } from './useMobilePreviewGestures'

function Harness(props: {
  enabled?: boolean
  allowPeek?: boolean
  onPeekChange: (peeking: boolean) => void
  onTap?: () => void
  targetEl: HTMLElement | null
}) {
  // Hook is exercised against an externally-owned element so the test can
  // dispatch raw pointer events on it the same way `PreviewCanvas` would.
  const stableTargetRef = useRef(props.targetEl)
  useMobilePreviewGestures(stableTargetRef.current, {
    enabled: props.enabled ?? true,
    allowPeek: props.allowPeek,
    onPeekChange: props.onPeekChange,
    onTap: props.onTap,
  })
  return null
}

function dispatch(
  el: HTMLElement,
  type: string,
  pointerId = 1,
  init: Partial<{
    clientX: number
    clientY: number
  }> = {},
) {
  const event = new Event(type, { bubbles: true })
  Object.defineProperty(event, 'pointerId', { value: pointerId })
  Object.defineProperty(event, 'clientX', { value: init.clientX ?? 0 })
  Object.defineProperty(event, 'clientY', { value: init.clientY ?? 0 })
  el.dispatchEvent(event)
}

describe('useMobilePreviewGestures', () => {
  let target: HTMLDivElement

  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
  })
  afterEach(() => {
    target.remove()
  })

  it('fires onTap for a quick single-finger press and release', () => {
    const onTap = vi.fn()
    const onPeekChange = vi.fn()
    render(
      <Harness onPeekChange={onPeekChange} onTap={onTap} targetEl={target} />,
    )
    dispatch(target, 'pointerdown')
    dispatch(target, 'pointerup')
    expect(onTap).toHaveBeenCalledTimes(1)
    expect(onPeekChange).not.toHaveBeenCalled()
  })

  it('peeks after the long-press threshold and unpeeks on release', () => {
    vi.useFakeTimers()
    const onTap = vi.fn()
    const onPeekChange = vi.fn()
    render(
      <Harness onPeekChange={onPeekChange} onTap={onTap} targetEl={target} />,
    )
    dispatch(target, 'pointerdown')
    vi.advanceTimersByTime(260)
    expect(onPeekChange).toHaveBeenLastCalledWith(true)
    dispatch(target, 'pointerup')
    expect(onPeekChange).toHaveBeenLastCalledWith(false)
    expect(onTap).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('cancels the long-press timer when a second finger arrives so pinch can take over', () => {
    vi.useFakeTimers()
    const onTap = vi.fn()
    const onPeekChange = vi.fn()
    render(
      <Harness onPeekChange={onPeekChange} onTap={onTap} targetEl={target} />,
    )
    dispatch(target, 'pointerdown', 1)
    dispatch(target, 'pointerdown', 2)
    vi.advanceTimersByTime(500)
    expect(onPeekChange).not.toHaveBeenCalled()
    expect(onTap).not.toHaveBeenCalled()
    dispatch(target, 'pointerup', 2)
    dispatch(target, 'pointerup', 1)
    // Releasing after a multi-touch must not retroactively fire a tap.
    expect(onTap).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('drops an active peek the moment a second finger touches', () => {
    vi.useFakeTimers()
    const onPeekChange = vi.fn()
    render(<Harness onPeekChange={onPeekChange} targetEl={target} />)
    dispatch(target, 'pointerdown', 1)
    vi.advanceTimersByTime(260)
    expect(onPeekChange).toHaveBeenLastCalledWith(true)
    dispatch(target, 'pointerdown', 2)
    expect(onPeekChange).toHaveBeenLastCalledWith(false)
    vi.useRealTimers()
  })

  it('cancels tap intent once the pointer drags past the slop threshold', () => {
    const onTap = vi.fn()
    const onPeekChange = vi.fn()
    render(
      <Harness onPeekChange={onPeekChange} onTap={onTap} targetEl={target} />,
    )
    dispatch(target, 'pointerdown', 1, { clientX: 100, clientY: 100 })
    dispatch(target, 'pointermove', 1, { clientX: 120, clientY: 100 })
    dispatch(target, 'pointerup', 1, { clientX: 120, clientY: 100 })
    expect(onTap).not.toHaveBeenCalled()
    expect(onPeekChange).not.toHaveBeenCalled()
  })

  it('with allowPeek=false a held press is consumed (no peek, no tap)', () => {
    vi.useFakeTimers()
    const onTap = vi.fn()
    const onPeekChange = vi.fn()
    render(
      <Harness
        allowPeek={false}
        onPeekChange={onPeekChange}
        onTap={onTap}
        targetEl={target}
      />,
    )
    dispatch(target, 'pointerdown')
    vi.advanceTimersByTime(400)
    dispatch(target, 'pointerup')
    expect(onPeekChange).not.toHaveBeenCalled()
    expect(onTap).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('with allowPeek=false a short tap still fires onTap', () => {
    vi.useFakeTimers()
    const onTap = vi.fn()
    const onPeekChange = vi.fn()
    render(
      <Harness
        allowPeek={false}
        onPeekChange={onPeekChange}
        onTap={onTap}
        targetEl={target}
      />,
    )
    dispatch(target, 'pointerdown')
    vi.advanceTimersByTime(120)
    dispatch(target, 'pointerup')
    expect(onTap).toHaveBeenCalledTimes(1)
    expect(onPeekChange).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('does not bind listeners when disabled', () => {
    vi.useFakeTimers()
    const onTap = vi.fn()
    const onPeekChange = vi.fn()
    render(
      <Harness
        enabled={false}
        onPeekChange={onPeekChange}
        onTap={onTap}
        targetEl={target}
      />,
    )
    dispatch(target, 'pointerdown')
    vi.advanceTimersByTime(400)
    dispatch(target, 'pointerup')
    expect(onTap).not.toHaveBeenCalled()
    expect(onPeekChange).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('suppresses the browser contextmenu so long-press never opens the image callout', () => {
    const onPeekChange = vi.fn()
    render(<Harness onPeekChange={onPeekChange} targetEl={target} />)
    const event = new Event('contextmenu', { bubbles: true, cancelable: true })
    target.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  })
})
