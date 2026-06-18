import { Slider } from '~/components/ui/slider/Slider'
import { clsxm } from '~/lib/cn'

type AdjustSliderRowProps = {
  label: string
  value: number
  min: number
  max: number
  step: number
  formatValue: (v: number) => string
  resetAriaLabel: string
  activeScrub?: boolean
  siblingScrubbing?: boolean
  /**
   * Optional directional gradient for the Slider track (temperature, tint,
   * HSL hue/sat/light). When omitted the Slider falls back to its dim wash.
   */
  track?: string
  /**
   * When true (default) the Slider renders a bipolar Range anchored at 0,
   * so the dirty fill reads as "offset from neutral". Set false for
   * unipolar domains (e.g. 0..1 strength meters).
   */
  bipolar?: boolean
  onChange: (value: number) => void
  onScrubChange: (scrubbing: boolean) => void
}

export function AdjustSliderRow(props: AdjustSliderRowProps) {
  const dirty = props.value !== 0
  const formatted = props.formatValue(props.value)
  const activeScrub = props.activeScrub === true
  const siblingScrubbing = props.siblingScrubbing === true
  const bipolar = props.bipolar !== false

  return (
    <div
      data-adjust-slider-row
      data-active-scrub={activeScrub || undefined}
      data-sibling-scrubbing={siblingScrubbing || undefined}
      className={clsxm(
        'grid min-h-11 grid-cols-[88px_minmax(0,1fr)_56px] items-center gap-3 rounded-md border border-transparent px-3 transition-[opacity,background-color,border-color] duration-150',
        activeScrub && 'border-lf-amber/55 bg-lf-on-photo-bg-strong',
        siblingScrubbing && 'opacity-25',
      )}
    >
      <span
        className={clsxm(
          'truncate text-[0.86rem] font-semibold leading-tight [text-shadow:0_1px_2px_oklch(0_0_0/0.45)]',
          dirty ? 'text-lf-amber-soft' : 'text-lf-on-photo-ink',
        )}
      >
        {props.label}
      </span>
      <div
        data-testid="adjust-slider-row-scrub"
        onPointerDown={() => props.onScrubChange(true)}
        onPointerUp={() => props.onScrubChange(false)}
        onPointerCancel={() => props.onScrubChange(false)}
      >
        <Slider
          thumbAriaLabel={props.label}
          value={[props.value]}
          min={props.min}
          max={props.max}
          step={props.step}
          bipolar={bipolar}
          track={props.track}
          onValueChange={([next]) => {
            if (next !== undefined) {
              props.onChange(next)
            }
          }}
        />
      </div>
      {dirty ? (
        <button
          type="button"
          aria-label={props.resetAriaLabel}
          onClick={() => props.onChange(0)}
          className="inline-flex h-11 items-center justify-end rounded-md px-1 text-right text-[0.86rem] font-semibold tabular-nums text-lf-amber-soft transition-colors [text-shadow:0_1px_2px_oklch(0_0_0/0.45)] hover:text-lf-on-photo-ink"
        >
          {formatted}
        </button>
      ) : (
        <span className="inline-flex h-11 items-center justify-end px-1 text-right text-[0.86rem] font-semibold tabular-nums text-lf-on-photo-ink/92 [text-shadow:0_1px_2px_oklch(0_0_0/0.45)]">
          {formatted}
        </span>
      )}
    </div>
  )
}
