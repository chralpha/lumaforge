import { useCallback, useLayoutEffect, useRef } from 'react'

import { clsxm } from '~/lib/cn'
import { useI18n } from '~/lib/i18n'

import {
  clampCompareSplit,
  COMPARE_SPLIT_MAX as MAX_SPLIT,
  COMPARE_SPLIT_MIN as MIN_SPLIT,
  getCompareSplitFromClientX,
} from '../services/compare-split'
import { getCanvasCompareSplit } from '../services/preview-viewport'

export {
  clampCompareSplit,
  getCompareSplitFromClientX,
} from '../services/compare-split'

const KEYBOARD_STEP = 0.01
const IMAGE_TRACK_SELECTOR = '[data-raw-compare-track="image"]'

function isUsableRect(rect: Pick<DOMRect, 'width'>) {
  return Number.isFinite(rect.width) && rect.width > 0
}

function parseCssNumber(value: string, fallback: number) {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function readPreviewTransform(element: HTMLElement | null) {
  if (!element) {
    return { zoom: 1, panX: 0 }
  }

  const style = getComputedStyle(element)
  const zoom = parseCssNumber(style.getPropertyValue('--raw-preview-zoom'), 1)
  const panX = parseCssNumber(style.getPropertyValue('--raw-preview-pan-x'), 0)

  return {
    zoom: Number.isFinite(zoom) && zoom > 0 ? zoom : 1,
    panX,
  }
}

function hasRenderedTransform(element: HTMLElement) {
  const transform = getComputedStyle(element).transform
  return Boolean(transform && transform !== 'none')
}

function getUntransformedTrackRect(
  imageTrack: HTMLElement,
  imageRect: DOMRect,
  zoom: number,
  panX: number,
) {
  const layoutWidth =
    imageTrack.offsetWidth > 0
      ? imageTrack.offsetWidth
      : zoom > 0
        ? imageRect.width / zoom
        : imageRect.width

  if (!hasRenderedTransform(imageTrack)) {
    return {
      left: imageRect.left,
      width: layoutWidth,
    }
  }

  return {
    left: imageRect.left - panX - (layoutWidth * (1 - zoom)) / 2,
    width: layoutWidth,
  }
}

function getCompareTrackGeometry(target: HTMLElement) {
  const frame = target.parentElement ?? target
  const frameRect = frame.getBoundingClientRect()
  const imageTrack = frame.querySelector<HTMLElement>(IMAGE_TRACK_SELECTOR)
  const imageRect = imageTrack?.getBoundingClientRect()
  const { zoom, panX } = readPreviewTransform(imageTrack ?? null)
  const trackRect =
    imageTrack && imageRect && isUsableRect(imageRect)
      ? getUntransformedTrackRect(imageTrack, imageRect, zoom, panX)
      : frameRect

  return {
    frameRect,
    trackRect,
    zoom,
    panX,
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
  const { frameRect, trackRect, zoom, panX } = getCompareTrackGeometry(target)
  const split = getCompareSplitFromClientX(trackRect, clientX)
  const clipSplit = getCanvasCompareSplit(split, zoom, panX, trackRect.width)

  return {
    split,
    clipSplit,
    handleX: getHandlePositionX(frameRect, trackRect, split),
  }
}

export function getCompareSplitPositionGeometry(
  target: HTMLElement,
  value: number,
) {
  const { frameRect, trackRect, zoom, panX } = getCompareTrackGeometry(target)
  const split = clampCompareSplit(value)
  const clipSplit = getCanvasCompareSplit(split, zoom, panX, trackRect.width)

  return {
    split,
    clipSplit,
    handleX: getHandlePositionX(frameRect, trackRect, split),
  }
}

function applyHandlePosition(target: HTMLElement, value: number) {
  const { split, clipSplit, handleX } = getCompareSplitPositionGeometry(
    target,
    value,
  )
  applyCompareSplitVariables(target, split, clipSplit, handleX)
}

function applyPointerPosition(target: HTMLElement, clientX: number) {
  const { split, clipSplit, handleX } = getCompareSplitInteractionGeometry(
    target,
    clientX,
  )
  applyCompareSplitVariables(target, split, clipSplit, handleX)
  return split
}

function applyCompareSplitVariables(
  target: HTMLElement,
  split: number,
  clipSplit: number,
  handleX: number,
) {
  const clipSplitPercent = `${clipSplit * 100}%`
  const handlePosition = `${handleX}px`

  target.style.setProperty('--raw-compare-split', clipSplitPercent)
  target.style.setProperty('--raw-compare-split-x', handlePosition)

  const frame = target.parentElement
  frame?.style.setProperty('--raw-compare-split', clipSplitPercent)
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

  const setFrameDragging = useCallback(
    (target: HTMLElement, active: boolean) => {
      const frame = target.parentElement
      if (!frame) return
      if (active) {
        frame.setAttribute('data-raw-compare-dragging', '')
      } else {
        frame.removeAttribute('data-raw-compare-dragging')
      }
    },
    [],
  )

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      if (disabled) return

      trySetPointerCapture(event.currentTarget, event.pointerId)
      activePointerIdRef.current = event.pointerId
      setFrameDragging(event.currentTarget, true)
      schedulePointerPreview(event.currentTarget, event.clientX)
    },
    [disabled, schedulePointerPreview, setFrameDragging],
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
      setFrameDragging(event.currentTarget, false)
      tryReleasePointerCapture(event.currentTarget, event.pointerId)
      onChange(nextSplit)
    },
    [disabled, flushPointerPreview, onChange, setFrameDragging],
  )

  const handlePointerCancel = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      if (activePointerIdRef.current !== event.pointerId) return

      activePointerIdRef.current = null
      pendingClientXRef.current = null
      cancelPendingPreview()
      setFrameDragging(event.currentTarget, false)
      tryReleasePointerCapture(event.currentTarget, event.pointerId)
      applyHandlePosition(event.currentTarget, value)
    },
    [cancelPendingPreview, value, setFrameDragging],
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
      aria-valuemin={0}
      aria-valuemax={100}
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
