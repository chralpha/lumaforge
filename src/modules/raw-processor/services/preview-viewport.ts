import type { ImageSession } from '../model/session'

export type PreviewViewport = Pick<
  ImageSession['viewState'],
  'zoom' | 'panX' | 'panY' | 'fitMode'
>

export interface PreviewViewportGeometry {
  viewportWidth: number
  viewportHeight: number
  contentWidth: number
  contentHeight: number
}

export const PREVIEW_VIEWPORT_MIN_ZOOM = 1
export const PREVIEW_VIEWPORT_MAX_ZOOM = 8

export const DEFAULT_PREVIEW_VIEWPORT: PreviewViewport = {
  zoom: 1,
  panX: 0,
  panY: 0,
  fitMode: 'screen',
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function clampPreviewZoom(value: number) {
  if (!Number.isFinite(value)) return PREVIEW_VIEWPORT_MIN_ZOOM
  return clamp(value, PREVIEW_VIEWPORT_MIN_ZOOM, PREVIEW_VIEWPORT_MAX_ZOOM)
}

function getPanLimit(viewportSize: number, contentSize: number, zoom: number) {
  if (
    !Number.isFinite(viewportSize) ||
    !Number.isFinite(contentSize) ||
    viewportSize <= 0 ||
    contentSize <= 0
  ) {
    return 0
  }

  return Math.max(0, (contentSize * zoom - viewportSize) / 2)
}

export function normalizePreviewViewport(
  viewport: PreviewViewport,
  geometry?: PreviewViewportGeometry,
): PreviewViewport {
  const zoom = clampPreviewZoom(viewport.zoom)

  if (zoom <= PREVIEW_VIEWPORT_MIN_ZOOM) {
    return DEFAULT_PREVIEW_VIEWPORT
  }

  const panLimitX = geometry
    ? getPanLimit(geometry.viewportWidth, geometry.contentWidth, zoom)
    : Number.POSITIVE_INFINITY
  const panLimitY = geometry
    ? getPanLimit(geometry.viewportHeight, geometry.contentHeight, zoom)
    : Number.POSITIVE_INFINITY

  const panX = Number.isFinite(viewport.panX)
    ? clamp(viewport.panX, -panLimitX, panLimitX)
    : 0
  const panY = Number.isFinite(viewport.panY)
    ? clamp(viewport.panY, -panLimitY, panLimitY)
    : 0

  return {
    zoom,
    panX,
    panY,
    fitMode: 'custom',
  }
}

export function panPreviewViewport(
  viewport: PreviewViewport,
  {
    geometry,
    deltaX,
    deltaY,
  }: {
    geometry: PreviewViewportGeometry
    deltaX: number
    deltaY: number
  },
) {
  return normalizePreviewViewport(
    {
      ...viewport,
      panX: viewport.panX + deltaX,
      panY: viewport.panY + deltaY,
    },
    geometry,
  )
}

export function zoomPreviewViewportAtPoint(
  viewport: PreviewViewport,
  {
    geometry,
    originX,
    originY,
    nextZoom,
  }: {
    geometry: PreviewViewportGeometry
    originX: number
    originY: number
    nextZoom: number
  },
) {
  const current = normalizePreviewViewport(viewport, geometry)
  const zoom = clampPreviewZoom(nextZoom)

  if (zoom <= PREVIEW_VIEWPORT_MIN_ZOOM) {
    return DEFAULT_PREVIEW_VIEWPORT
  }

  const scaleRatio = zoom / current.zoom

  return normalizePreviewViewport(
    {
      zoom,
      panX: originX - (originX - current.panX) * scaleRatio,
      panY: originY - (originY - current.panY) * scaleRatio,
      fitMode: 'custom',
    },
    geometry,
  )
}

export function getWheelPreviewZoomTarget(
  currentZoom: number,
  {
    deltaY,
    deltaMode,
    ctrlKey,
  }: {
    deltaY: number
    deltaMode: number
    ctrlKey: boolean
  },
) {
  let normalizedDeltaY = Number.isFinite(deltaY) ? deltaY : 0
  if (deltaMode === 1) {
    normalizedDeltaY *= 15
  }

  const zoomingOut = normalizedDeltaY > 0
  const divisor = ctrlKey ? 100 : 300
  const ratio =
    1 - (zoomingOut ? -normalizedDeltaY : normalizedDeltaY) / divisor
  const scaleDiff = zoomingOut ? 1 / ratio : ratio

  return clampPreviewZoom(currentZoom * scaleDiff)
}

export function resetPreviewViewport() {
  return DEFAULT_PREVIEW_VIEWPORT
}
