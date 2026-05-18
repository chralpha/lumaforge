import { useCallback, useRef } from 'react'

export function MobilePeekSurface(props: {
  enabled: boolean
  onPeekChange: (peeking: boolean) => void
  onTap?: () => void
}) {
  const { enabled, onPeekChange, onTap } = props
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const peeking = useRef(false)
  const pressed = useRef(false)

  const clear = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
  }, [])

  const end = useCallback(() => {
    const wasPressed = pressed.current
    pressed.current = false
    clear()
    if (peeking.current) {
      peeking.current = false
      onPeekChange(false)
      return
    }
    // Released before the long-press threshold → it was a short tap.
    if (wasPressed) onTap?.()
  }, [clear, onPeekChange, onTap])

  const start = useCallback(() => {
    if (!enabled) return
    pressed.current = true
    clear()
    timer.current = setTimeout(() => {
      timer.current = null
      peeking.current = true
      onPeekChange(true)
    }, 250)
  }, [clear, enabled, onPeekChange])

  return (
    <div
      data-testid="mobile-peek-surface"
      aria-hidden="true"
      className="absolute inset-x-0 z-[5] [touch-action:none] [-webkit-tap-highlight-color:transparent]"
      style={{ top: 110, bottom: 180 }}
      onPointerDown={start}
      onPointerUp={end}
      onPointerCancel={end}
      onPointerLeave={end}
    />
  )
}
