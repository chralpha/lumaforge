import type { CSSProperties } from 'react'
import { useLayoutEffect, useState } from 'react'

export type OnlineLutBrowserPlacement =
  | 'anchored'
  | 'docked'
  | 'sheet'
  | 'sidecar'

export type OnlineLutBrowserLayout = {
  placement: OnlineLutBrowserPlacement
  top?: number
  left?: number
  width?: number
  maxHeight?: number
  overlayRight?: number
}

export type OnlineLutBrowserStyle = CSSProperties & {
  '--raw-lut-source-browser-top'?: string
  '--raw-lut-source-browser-left'?: string
  '--raw-lut-source-browser-width'?: string
  '--raw-lut-source-browser-max-height'?: string
}

const LUT_BROWSER_VIEWPORT_MARGIN = 12
const LUT_BROWSER_TRIGGER_GAP = 8
const LUT_BROWSER_MIN_WIDTH = 320
const LUT_BROWSER_MAX_WIDTH = 420
const LUT_BROWSER_MIN_HEIGHT = 184
const LUT_BROWSER_MAX_HEIGHT = 420
const LUT_BROWSER_SIDECAR_MIN_WIDTH = 500
const LUT_BROWSER_SIDECAR_MAX_WIDTH = 560
const LUT_BROWSER_SIDECAR_MAX_HEIGHT = 560

function clampNumber(value: number, min: number, max: number) {
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
  const toolSurfaceRect = trigger
    .closest('.raw-tool-surface')
    ?.getBoundingClientRect()
  const sidecarAvailableWidth = toolSurfaceRect
    ? toolSurfaceRect.left - margin - LUT_BROWSER_TRIGGER_GAP
    : 0
  const viewportBoundedHeight = Math.max(
    LUT_BROWSER_MIN_HEIGHT,
    viewportHeight - margin * 2,
  )

  if (
    toolSurfaceRect &&
    Number.isFinite(toolSurfaceRect.left) &&
    toolSurfaceRect.left > 0 &&
    sidecarAvailableWidth >= LUT_BROWSER_SIDECAR_MIN_WIDTH
  ) {
    const sidecarWidth = clampNumber(
      sidecarAvailableWidth,
      LUT_BROWSER_SIDECAR_MIN_WIDTH,
      LUT_BROWSER_SIDECAR_MAX_WIDTH,
    )
    const maxHeight = clampNumber(
      viewportBoundedHeight,
      LUT_BROWSER_MIN_HEIGHT,
      Math.min(LUT_BROWSER_SIDECAR_MAX_HEIGHT, viewportBoundedHeight),
    )
    const top = clampNumber(
      triggerRect.top,
      margin,
      viewportHeight - margin - maxHeight,
    )

    return {
      placement: 'sidecar',
      top,
      left: toolSurfaceRect.left - LUT_BROWSER_TRIGGER_GAP - sidecarWidth,
      width: sidecarWidth,
      maxHeight,
      overlayRight: Math.max(0, viewportWidth - toolSurfaceRect.left),
    }
  }

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
  options: { fillHeight?: boolean } = {},
): OnlineLutBrowserStyle | undefined {
  if (!layout || layout.placement === 'sheet') return undefined

  const style: OnlineLutBrowserStyle = {
    '--raw-lut-source-browser-top': `${layout.top}px`,
    '--raw-lut-source-browser-left': `${layout.left}px`,
    '--raw-lut-source-browser-width': `${layout.width}px`,
    '--raw-lut-source-browser-max-height': `${layout.maxHeight}px`,
  }

  if (options.fillHeight !== false) {
    style.height = `${layout.maxHeight}px`
  }

  return style
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
