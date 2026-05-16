import type { CSSProperties } from 'react'
import { useLayoutEffect, useState } from 'react'

export type OnlineLutBrowserPlacement = 'anchored' | 'docked' | 'sheet'

export type OnlineLutBrowserLayout = {
  placement: OnlineLutBrowserPlacement
  top?: number
  left?: number
  width?: number
  maxHeight?: number
}

export type OnlineLutBrowserStyle = CSSProperties & {
  '--raw-lut-source-browser-top'?: string
  '--raw-lut-source-browser-left'?: string
  '--raw-lut-source-browser-width'?: string
  '--raw-lut-source-browser-max-height'?: string
}

export const LUT_BROWSER_VIEWPORT_MARGIN = 12
export const LUT_BROWSER_TRIGGER_GAP = 8
export const LUT_BROWSER_MIN_WIDTH = 320
export const LUT_BROWSER_MAX_WIDTH = 420
export const LUT_BROWSER_MIN_HEIGHT = 184
export const LUT_BROWSER_MAX_HEIGHT = 420

export function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

export function getViewportBoundedBrowserLayout(
  trigger: HTMLButtonElement | undefined,
): OnlineLutBrowserLayout {
  if (typeof window === 'undefined' || !trigger) {
    return { placement: 'anchored' }
  }

  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const margin = LUT_BROWSER_VIEWPORT_MARGIN

  if (viewportWidth <= 720) {
    return { placement: 'sheet' }
  }

  const triggerRect = trigger.getBoundingClientRect()
  const rowRect =
    trigger
      .closest('[data-raw-lut="source-resource-row"]')
      ?.getBoundingClientRect() ?? triggerRect
  const availableWidth = Math.max(0, viewportWidth - margin * 2)
  const width = Math.min(
    LUT_BROWSER_MAX_WIDTH,
    Math.max(LUT_BROWSER_MIN_WIDTH, Math.min(rowRect.width, availableWidth)),
    availableWidth,
  )
  const left = clampNumber(
    triggerRect.left,
    margin,
    viewportWidth - margin - width,
  )
  const viewportBoundedHeight = Math.max(
    LUT_BROWSER_MIN_HEIGHT,
    viewportHeight - margin * 2,
  )

  if (viewportHeight <= 520) {
    return {
      placement: 'docked',
      top: margin,
      left,
      width,
      maxHeight: viewportBoundedHeight,
    }
  }

  const availableBelow =
    viewportHeight - triggerRect.bottom - margin - LUT_BROWSER_TRIGGER_GAP
  const availableAbove = triggerRect.top - margin - LUT_BROWSER_TRIGGER_GAP
  const placeBelow = availableBelow >= availableAbove
  const maxHeight = clampNumber(
    placeBelow ? availableBelow : availableAbove,
    LUT_BROWSER_MIN_HEIGHT,
    Math.min(LUT_BROWSER_MAX_HEIGHT, viewportBoundedHeight),
  )
  const preferredTop = placeBelow
    ? triggerRect.bottom + LUT_BROWSER_TRIGGER_GAP
    : triggerRect.top - LUT_BROWSER_TRIGGER_GAP - maxHeight

  return {
    placement: 'anchored',
    top: clampNumber(preferredTop, margin, viewportHeight - margin - maxHeight),
    left,
    width,
    maxHeight,
  }
}

export function toBrowserStyle(
  layout: OnlineLutBrowserLayout | null,
): OnlineLutBrowserStyle | undefined {
  if (!layout || layout.placement === 'sheet') return undefined

  return {
    '--raw-lut-source-browser-top': `${layout.top}px`,
    '--raw-lut-source-browser-left': `${layout.left}px`,
    '--raw-lut-source-browser-width': `${layout.width}px`,
    '--raw-lut-source-browser-max-height': `${layout.maxHeight}px`,
    height: `${layout.maxHeight}px`,
  }
}

export function useRawLabPortalContainer(open: boolean) {
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(
    null,
  )

  useLayoutEffect(() => {
    if (!open || typeof document === 'undefined') return

    setPortalContainer(document.querySelector('.raw-lab') ?? document.body)
  }, [open])

  return portalContainer
}

export function isInsideElement(
  target: EventTarget | null,
  element: HTMLElement | null | undefined,
) {
  return Boolean(element && target instanceof Node && element.contains(target))
}
