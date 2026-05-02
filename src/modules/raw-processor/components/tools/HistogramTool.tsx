import type {
  PreviewHistogramState,
  ReadyPreviewHistogram,
} from '@lumaforge/luma-color-runtime'

import { ToolSection } from './ToolSection'

const VIEWBOX_WIDTH = 128
const VIEWBOX_HEIGHT = 40

function makePath(bins: Uint32Array) {
  const max = Math.max(1, ...bins)

  return Array.from(bins, (value, index) => {
    const x = (index / 255) * VIEWBOX_WIDTH
    const y = VIEWBOX_HEIGHT - (value / max) * (VIEWBOX_HEIGHT - 2) - 1

    return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
  }).join(' ')
}

function sourceLabel(source: ReadyPreviewHistogram['source']) {
  return source === 'bounded-hq' ? 'HQ preview' : 'Quick preview'
}

function readyHistogram(
  histogram: PreviewHistogramState,
): ReadyPreviewHistogram | null {
  if (histogram.state === 'ready') {
    return histogram
  }

  if (histogram.state === 'stale' || histogram.state === 'computing') {
    return histogram.previous
  }

  return null
}

function statusLabel(histogram: PreviewHistogramState) {
  if (histogram.state === 'ready') {
    return sourceLabel(histogram.source)
  }

  if (histogram.state === 'computing') {
    return 'Computing'
  }

  if (histogram.state === 'stale') {
    return 'Stale'
  }

  if (histogram.state === 'unsupported') {
    return 'Unsupported'
  }

  return histogram.reason === 'embedded-only' ? 'Embedded only' : 'Not loaded'
}

function statusReason(histogram: PreviewHistogramState) {
  if (histogram.state === 'unsupported') {
    return histogram.reason
  }

  if (histogram.state === 'unavailable') {
    return histogram.reason === 'embedded-only'
      ? 'Histogram requires a rendered RAW preview.'
      : 'Choose a RAW to show preview distribution.'
  }

  return null
}

export function HistogramTool({
  histogram,
}: {
  histogram: PreviewHistogramState
}) {
  const ready = readyHistogram(histogram)
  const label = statusLabel(histogram)
  const reason = statusReason(histogram)

  return (
    <ToolSection title="Histogram">
      <div className="raw-histogram">
        <p className="raw-tool-note">
          <span>{label}</span>
          {reason && <span>{reason}</span>}
        </p>
        {ready ? (
          <>
            <svg
              role="img"
              aria-label="Preview luminance and RGB histogram"
              className="raw-histogram-plot"
              viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
              preserveAspectRatio="none"
            >
              <path
                className="raw-histogram-channel raw-histogram-channel-red"
                d={makePath(ready.bins.red)}
              />
              <path
                className="raw-histogram-channel raw-histogram-channel-green"
                d={makePath(ready.bins.green)}
              />
              <path
                className="raw-histogram-channel raw-histogram-channel-blue"
                d={makePath(ready.bins.blue)}
              />
              <path
                className="raw-histogram-luma"
                d={makePath(ready.bins.luma)}
              />
            </svg>
            <div className="raw-histogram-clipping">
              <span>Shadows {ready.clipping.shadowAnyChannel}</span>
              <span>Highlights {ready.clipping.highlightAnyChannel}</span>
            </div>
          </>
        ) : null}
      </div>
    </ToolSection>
  )
}
