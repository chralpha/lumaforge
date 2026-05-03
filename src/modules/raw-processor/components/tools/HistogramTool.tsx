import type {
  PreviewHistogramState,
  ReadyPreviewHistogram,
} from '@lumaforge/luma-color-runtime'

import { ToolSection } from './ToolSection'

const VIEWBOX_WIDTH = 128
const VIEWBOX_HEIGHT = 88
const PLOT_PADDING = 3
const BASELINE_Y = VIEWBOX_HEIGHT - PLOT_PADDING
const GRID_X = [32, 64, 96] as const
const GRID_Y = [24, 44, 64] as const

function normalizedPoints(bins: Uint32Array) {
  let max = 1
  for (const value of bins) {
    max = Math.max(max, value)
  }

  const lastBinIndex = Math.max(1, bins.length - 1)

  return Array.from(bins, (value, index) => {
    const x = (index / lastBinIndex) * VIEWBOX_WIDTH
    const y = BASELINE_Y - (value / max) * (VIEWBOX_HEIGHT - PLOT_PADDING * 2)

    return { x, y }
  })
}

function makeLinePath(bins: Uint32Array) {
  return normalizedPoints(bins)
    .map(
      ({ x, y }, index) =>
        `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`,
    )
    .join(' ')
}

function makeAreaPath(bins: Uint32Array) {
  const points = normalizedPoints(bins)
    .map(({ x, y }) => `L ${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(' ')

  return `M 0 ${BASELINE_Y} ${points} L ${VIEWBOX_WIDTH} ${BASELINE_Y} Z`
}

function hasNonZeroBins(bins: Uint32Array) {
  return bins.some((value) => value > 0)
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
              <g className="raw-histogram-grid" aria-hidden="true">
                {GRID_X.map((x) => (
                  <line
                    key={`x-${x}`}
                    x1={x}
                    x2={x}
                    y1={PLOT_PADDING}
                    y2={BASELINE_Y}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
                {GRID_Y.map((y) => (
                  <line
                    key={`y-${y}`}
                    x1="0"
                    x2={VIEWBOX_WIDTH}
                    y1={y}
                    y2={y}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
                <line
                  className="raw-histogram-baseline"
                  x1="0"
                  x2={VIEWBOX_WIDTH}
                  y1={BASELINE_Y}
                  y2={BASELINE_Y}
                  vectorEffect="non-scaling-stroke"
                />
              </g>
              <path
                className="raw-histogram-channel-fill raw-histogram-channel-fill-red"
                d={makeAreaPath(ready.bins.red)}
                vectorEffect="non-scaling-stroke"
              />
              <path
                className="raw-histogram-channel-fill raw-histogram-channel-fill-green"
                d={makeAreaPath(ready.bins.green)}
                vectorEffect="non-scaling-stroke"
              />
              <path
                className="raw-histogram-channel-fill raw-histogram-channel-fill-blue"
                d={makeAreaPath(ready.bins.blue)}
                vectorEffect="non-scaling-stroke"
              />
              {hasNonZeroBins(ready.bins.red) && (
                <path
                  className="raw-histogram-channel-line raw-histogram-channel-line-red"
                  d={makeLinePath(ready.bins.red)}
                  vectorEffect="non-scaling-stroke"
                />
              )}
              {hasNonZeroBins(ready.bins.green) && (
                <path
                  className="raw-histogram-channel-line raw-histogram-channel-line-green"
                  d={makeLinePath(ready.bins.green)}
                  vectorEffect="non-scaling-stroke"
                />
              )}
              {hasNonZeroBins(ready.bins.blue) && (
                <path
                  className="raw-histogram-channel-line raw-histogram-channel-line-blue"
                  d={makeLinePath(ready.bins.blue)}
                  vectorEffect="non-scaling-stroke"
                />
              )}
              <path
                className="raw-histogram-luma"
                d={makeLinePath(ready.bins.luma)}
                vectorEffect="non-scaling-stroke"
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
