import { useCallback } from 'react'

import { clsxm } from '~/lib/cn'

const MIN_SPLIT = 0.05
const MAX_SPLIT = 0.95
const KEYBOARD_STEP = 0.01

export function clampCompareSplit(value: number) {
  if (!Number.isFinite(value)) return 0.5
  return Math.min(MAX_SPLIT, Math.max(MIN_SPLIT, value))
}

export function getCompareSplitFromClientX(
  rect: Pick<DOMRect, 'left' | 'width'>,
  clientX: number,
) {
  if (!rect.width || rect.width <= 0) return 0.5
  return clampCompareSplit((clientX - rect.left) / rect.width)
}

function getTrackRect(target: HTMLElement) {
  return (
    target.parentElement?.getBoundingClientRect() ??
    target.getBoundingClientRect()
  )
}

export function CompareSplitHandle({
  value,
  onChange,
  disabled = false,
  className,
}: {
  value: number
  onChange: (value: number) => void
  disabled?: boolean
  className?: string
}) {
  const updateFromPointer = useCallback(
    (target: HTMLElement, clientX: number) => {
      onChange(getCompareSplitFromClientX(getTrackRect(target), clientX))
    },
    [onChange],
  )

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      if (disabled) return

      event.currentTarget.setPointerCapture?.(event.pointerId)
      updateFromPointer(event.currentTarget, event.clientX)
    },
    [disabled, updateFromPointer],
  )

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      if (
        disabled ||
        !event.currentTarget.hasPointerCapture?.(event.pointerId)
      ) {
        return
      }

      updateFromPointer(event.currentTarget, event.clientX)
    },
    [disabled, updateFromPointer],
  )

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      if (disabled) return

      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        onChange(clampCompareSplit(value - KEYBOARD_STEP))
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        onChange(clampCompareSplit(value + KEYBOARD_STEP))
      } else if (event.key === 'Home') {
        event.preventDefault()
        onChange(MIN_SPLIT)
      } else if (event.key === 'End') {
        event.preventDefault()
        onChange(MAX_SPLIT)
      }
    },
    [disabled, onChange, value],
  )

  const stopInteractionPropagation = useCallback(
    (event: React.SyntheticEvent<HTMLButtonElement>) => {
      event.stopPropagation()
    },
    [],
  )

  return (
    <button
      type="button"
      role="slider"
      aria-label="Compare unprocessed RAW and final JPEG"
      aria-valuemin={5}
      aria-valuemax={95}
      aria-valuenow={Math.round(clampCompareSplit(value) * 100)}
      disabled={disabled}
      className={clsxm('raw-lab-compare-handle', className)}
      style={
        {
          '--raw-compare-split': `${clampCompareSplit(value) * 100}%`,
        } as React.CSSProperties
      }
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onClick={stopInteractionPropagation}
      onKeyDown={handleKeyDown}
    >
      <span aria-hidden="true">↔</span>
    </button>
  )
}
