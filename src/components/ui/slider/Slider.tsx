import * as SliderPrimitive from '@radix-ui/react-slider'
import * as React from 'react'

import { clsxm } from '~/lib/cn'

export const Slider = ({
  ref,
  className,
  thumbAriaLabel,
  thumbAriaLabelledBy,
  variant = 'primary',
  ...props
}: React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> & {
  variant?: 'primary' | 'secondary'
  thumbAriaLabel?: string
  thumbAriaLabelledBy?: string
} & {
  ref?: React.Ref<
    | (React.ElementRef<typeof SliderPrimitive.Root> & {
        variant?: 'primary' | 'secondary'
      })
    | null
  >
}) => (
  <SliderPrimitive.Root
    ref={ref}
    data-slot="slider-root"
    className={clsxm(
      'group relative flex w-full touch-none select-none items-center data-[disabled]:cursor-not-allowed data-[disabled]:opacity-70',
      "before:absolute before:inset-x-0 before:-inset-y-[19px] before:content-['']",
      className,
    )}
    {...props}
  >
    <SliderPrimitive.Track
      data-slot="slider-track"
      className={clsxm(
        'relative h-1.5 w-full grow overflow-hidden rounded-full',
        variant === 'primary'
          ? 'bg-accent/20 group-data-[disabled]:bg-fill-secondary'
          : 'bg-fill-secondary',
      )}
    >
      <SliderPrimitive.Range
        data-slot="slider-range"
        className={clsxm(
          'absolute h-full',
          variant === 'primary'
            ? 'bg-accent/80 group-data-[disabled]:bg-text-secondary/35'
            : 'bg-fill',
        )}
      />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb
      aria-label={thumbAriaLabel}
      aria-labelledby={thumbAriaLabelledBy}
      className={clsxm(
        'block size-4 rounded-full border shadow transition-colors focus-visible:outline-none focus-visible:ring-1 disabled:pointer-events-none disabled:opacity-50 data-[disabled]:border-border data-[disabled]:bg-material-opaque data-[disabled]:shadow-none',
        variant === 'primary'
          ? 'border-accent/50 focus-visible:ring-accent bg-accent'
          : 'border-border focus-visible:ring-border bg-material-opaque',
      )}
    />
  </SliderPrimitive.Root>
)
Slider.displayName = SliderPrimitive.Root.displayName
