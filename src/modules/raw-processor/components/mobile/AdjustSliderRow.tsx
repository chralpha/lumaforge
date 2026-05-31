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
  onChange: (value: number) => void
  onScrubChange: (scrubbing: boolean) => void
}

export function AdjustSliderRow(props: AdjustSliderRowProps) {
  const dirty = props.value !== 0
  const formatted = props.formatValue(props.value)
  const activeScrub = props.activeScrub === true
  const siblingScrubbing = props.siblingScrubbing === true

  return (
    <div
      data-adjust-slider-row
      data-active-scrub={activeScrub || undefined}
      data-sibling-scrubbing={siblingScrubbing || undefined}
      className={clsxm(
        'grid min-h-[44px] grid-cols-[88px_minmax(0,1fr)_56px] items-center gap-3 rounded-md border border-transparent px-3 py-2 transition-[opacity,background-color,border-color] duration-150',
        activeScrub && 'border-lf-amber/55 bg-lf-on-photo-bg-strong',
        siblingScrubbing && 'opacity-40',
      )}
    >
      <span
        className={clsxm(
          'truncate text-[0.82rem] font-semibold leading-tight',
          dirty ? 'text-lf-amber-soft' : 'text-lf-on-photo-ink/82',
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
          className="inline-flex h-9 items-center justify-end rounded-md px-1 text-right text-[0.82rem] font-semibold tabular-nums text-lf-amber-soft transition-colors hover:text-lf-on-photo-ink"
        >
          {formatted}
        </button>
      ) : (
        <span className="inline-flex h-9 items-center justify-end px-1 text-right text-[0.82rem] font-semibold tabular-nums text-lf-on-photo-ink/72">
          {formatted}
        </span>
      )}
    </div>
  )
}
