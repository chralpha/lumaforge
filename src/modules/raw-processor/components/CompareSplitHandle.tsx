import { useCallback, useLayoutEffect, useRef } from 'react'

import { clsxm } from '~/lib/cn'
import { useI18n } from '~/lib/i18n'

import {
  clampCompareSplit,
  COMPARE_SPLIT_MAX as MAX_SPLIT,
  COMPARE_SPLIT_MIN as MIN_SPLIT,
  getCompareSplitFromClientX,
} from '../services/compare-split'

export {
  clampCompareSplit,
  getCompareSplitFromClientX,
} from '../services/compare-split'

const KEYBOARD_STEP = 0.01
const IMAGE_TRACK_SELECTOR = '[data-raw-compare-track="image"]'

function isUsableRect(rect: Pick<DOMRect, 'width'>) {
  return Number.isFinite(rect.width) && rect.width > 0
}

function getCompareTrackGeometry(target: HTMLElement) {
  const frame = target.parentElement ?? target
  const frameRect = frame.getBoundingClientRect()
  const imageTrack = frame.querySelector<HTMLElement>(IMAGE_TRACK_SELECTOR)
  const imageRect = imageTrack?.getBoundingClientRect()

  return {
    frameRect,
    trackRect: imageRect && isUsableRect(imageRect) ? imageRect : frameRect,
  }
}

function getHandlePositionX(
  frameRect: Pick<DOMRect, 'left'>,
  trackRect: Pick<DOMRect, 'left' | 'width'>,
  split: number,
) {
  return trackRect.left - frameRect.left + trackRect.width * split
}

export function getCompareSplitInteractionGeometry(
  target: HTMLElement,
  clientX: number,
) {
  const { frameRect, trackRect } = getCompareTrackGeometry(target)
  const split = getCompareSplitFromClientX(trackRect, clientX)

  return {
    split,
    handleX: getHandlePositionX(frameRect, trackRect, split),
  }
}

export function getCompareSplitPositionGeometry(
  target: HTMLElement,
  value: number,
) {
  const { frameRect, trackRect } = getCompareTrackGeometry(target)
  const split = clampCompareSplit(value)

  return {
    split,
    handleX: getHandlePositionX(frameRect, trackRect, split),
  }
}

function applyHandlePosition(target: HTMLElement, value: number) {
  const { split, handleX } = getCompareSplitPositionGeometry(target, value)
  applyCompareSplitVariables(target, split, handleX)
}

function applyPointerPosition(target: HTMLElement, clientX: number) {
  const { split, handleX } = getCompareSplitInteractionGeometry(target, clientX)
  applyCompareSplitVariables(target, split, handleX)
  return split
}

function applyCompareSplitVariables(
  target: HTMLElement,
  split: number,
  handleX: number,
) {
  const splitPercent = `${split * 100}%`
  const handlePosition = `${handleX}px`

  target.style.setProperty('--raw-compare-split', splitPercent)
  target.style.setProperty('--raw-compare-split-x', handlePosition)

  const frame = target.parentElement
  frame?.style.setProperty('--raw-compare-split', splitPercent)
  frame?.style.setProperty('--raw-compare-split-x', handlePosition)
}

function trySetPointerCapture(target: HTMLElement, pointerId: number) {
  try {
    target.setPointerCapture?.(pointerId)
  } catch {
    // Synthetic pointer events and a few edge paths can lack an active pointer.
  }
}

function tryReleasePointerCapture(target: HTMLElement, pointerId: number) {
  try {
    target.releasePointerCapture?.(pointerId)
  } catch {
    // Release is best-effort; internal active pointer state is authoritative.
  }
}

export function CompareSplitHandle({
  value,
  onChange,
  onPreviewChange,
  disabled = false,
  className,
}: {
  value: number
  onChange: (value: number) => void
  onPreviewChange?: (value: number) => void
  disabled?: boolean
  className?: string
}) {
  const { t } = useI18n()
  const handleRef = useRef<HTMLButtonElement>(null)
  const activePointerIdRef = useRef<number | null>(null)
  const pendingClientXRef = useRef<number | null>(null)
  const pendingAnimationFrameRef = useRef<number | null>(null)
  const latestPreviewSplitRef = useRef(clampCompareSplit(value))

  useLayoutEffect(() => {
    const handle = handleRef.current
    if (!handle) return

    if (activePointerIdRef.current === null) {
      latestPreviewSplitRef.current = clampCompareSplit(value)
      applyHandlePosition(handle, value)
    }

    if (typeof ResizeObserver === 'undefined') return

    const frame = handle.parentElement
    const imageTrack = frame?.querySelector<HTMLElement>(IMAGE_TRACK_SELECTOR)
    const observer = new ResizeObserver(() => {
      applyHandlePosition(handle, latestPreviewSplitRef.current)
    })

    if (frame) observer.observe(frame)
    if (imageTrack) observer.observe(imageTrack)

    return () => {
      observer.disconnect()
    }
  })

  const cancelPendingPreview = useCallback(() => {
    const frame = pendingAnimationFrameRef.current
    if (frame !== null) {
      window.cancelAnimationFrame(frame)
      pendingAnimationFrameRef.current = null
    }
  }, [])

  const previewFromPointer = useCallback(
    (target: HTMLElement, clientX: number) => {
      const split = applyPointerPosition(target, clientX)
      latestPreviewSplitRef.current = split
      onPreviewChange?.(split)
      return split
    },
    [onPreviewChange],
  )

  const schedulePointerPreview = useCallback(
    (target: HTMLElement, clientX: number) => {
      pendingClientXRef.current = clientX

      if (pendingAnimationFrameRef.current !== null) return

      pendingAnimationFrameRef.current = window.requestAnimationFrame(() => {
        pendingAnimationFrameRef.current = null
        const nextClientX = pendingClientXRef.current
        if (nextClientX === null) return
        previewFromPointer(target, nextClientX)
      })
    },
    [previewFromPointer],
  )

  const flushPointerPreview = useCallback(
    (target: HTMLElement, clientX: number) => {
      pendingClientXRef.current = null
      cancelPendingPreview()
      return previewFromPointer(target, clientX)
    },
    [cancelPendingPreview, previewFromPointer],
  )

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      if (disabled) return

      trySetPointerCapture(event.currentTarget, event.pointerId)
      activePointerIdRef.current = event.pointerId
      schedulePointerPreview(event.currentTarget, event.clientX)
    },
    [disabled, schedulePointerPreview],
  )

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      if (disabled || activePointerIdRef.current !== event.pointerId) {
        return
      }

      schedulePointerPreview(event.currentTarget, event.clientX)
    },
    [disabled, schedulePointerPreview],
  )

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      if (disabled || activePointerIdRef.current !== event.pointerId) return

      const nextSplit = flushPointerPreview(event.currentTarget, event.clientX)
      activePointerIdRef.current = null
      tryReleasePointerCapture(event.currentTarget, event.pointerId)
      onChange(nextSplit)
    },
    [disabled, flushPointerPreview, onChange],
  )

  const handlePointerCancel = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      if (activePointerIdRef.current !== event.pointerId) return

      activePointerIdRef.current = null
      pendingClientXRef.current = null
      cancelPendingPreview()
      tryReleasePointerCapture(event.currentTarget, event.pointerId)
      applyHandlePosition(event.currentTarget, value)
    },
    [cancelPendingPreview, value],
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
      ref={handleRef}
      type="button"
      role="slider"
      aria-label={t('raw.stage.sliderAria')}
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
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onClick={stopInteractionPropagation}
      onKeyDown={handleKeyDown}
    >
      <span aria-hidden="true">↔</span>
    </button>
  )
}
