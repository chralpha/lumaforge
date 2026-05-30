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
        'relative h-[5px] w-full grow overflow-hidden rounded-full bg-[oklch(from_var(--color-lf-on-surface)_l_c_h_/_0.10)]',
        'group-data-[disabled]:bg-[oklch(from_var(--color-lf-on-surface)_l_c_h_/_0.06)]',
      )}
    >
      <SliderPrimitive.Range
        data-slot="slider-range"
        className={clsxm(
          'absolute h-full',
          variant === 'primary'
            ? 'bg-lf-green-deep/55 group-data-[disabled]:bg-[oklch(from_var(--color-lf-on-surface)_l_c_h_/_0.15)]'
            : 'bg-[oklch(from_var(--color-lf-on-surface)_l_c_h_/_0.25)]',
        )}
      />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb
      aria-label={thumbAriaLabel}
      aria-labelledby={thumbAriaLabelledBy}
      className={clsxm(
        'block size-[15px] rounded-full bg-lf-surface transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lf-green/30 disabled:pointer-events-none disabled:opacity-50',
        'shadow-[0_1px_2px_oklch(0.18_0.018_76/0.22),0_0_0_1px_oklch(from_var(--color-lf-on-surface)_l_c_h_/_0.18)]',
        'hover:shadow-[0_1px_3px_oklch(0.18_0.018_76/0.28),0_0_0_1px_oklch(from_var(--color-lf-on-surface)_l_c_h_/_0.28)]',
        'data-[disabled]:bg-lf-surface-sunk data-[disabled]:shadow-[0_0_0_1px_oklch(from_var(--color-lf-on-surface)_l_c_h_/_0.10)]',
      )}
    />
  </SliderPrimitive.Root>
)
Slider.displayName = SliderPrimitive.Root.displayName
