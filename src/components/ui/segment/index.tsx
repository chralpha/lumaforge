import { m } from 'motion/react'
import type { HTMLAttributes, ReactNode } from 'react'
import { use, useId, useMemo, useState } from 'react'

import { cn } from '~/lib/cn'
import { Spring } from '~/lib/spring'

import type { SegmentGroupContextValue } from './ctx'
import { SegmentGroupContext } from './ctx'

type SegmentGroupContextValueWithDisabled = SegmentGroupContextValue & {
  disabled: boolean
}

interface SegmentGroupProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  'onChange'
> {
  value?: string
  onValueChanged?: (value: string) => void
  disabled?: boolean
}
export const SegmentGroup = (props: ComponentType<SegmentGroupProps>) => {
  const {
    children,
    className,
    disabled = false,
    onValueChanged,
    tabIndex,
    value,
    ...divProps
  } = props

  const [currentValue, setCurrentValue] = useState(value || '')
  const componentId = useId()

  return (
    <SegmentGroupContext.Provider
      value={
        useMemo(
          () => ({
            value: currentValue,
            setValue: (value) => {
              setCurrentValue(value)
              onValueChanged?.(value)
            },
            componentId,
            disabled,
          }),
          [componentId, currentValue, disabled, onValueChanged],
        ) satisfies SegmentGroupContextValueWithDisabled
      }
    >
      <div
        {...divProps}
        role="tablist"
        className={cn(
          'bg-fill-tertiary text-text-secondary inline-flex h-9 items-center justify-center rounded-lg p-1 outline-none',
          className,
        )}
        tabIndex={tabIndex ?? 0}
        data-orientation="horizontal"
      >
        {children}
      </div>
    </SegmentGroupContext.Provider>
  )
}

export const SegmentItem: Component<{
  value: string
  label: ReactNode
  disabled?: boolean
}> = ({ label, value, className, disabled = false }) => {
  const ctx = use(SegmentGroupContext)

  const {
    value: ctxValue,
    setValue,
    componentId: layoutId,
    disabled: groupDisabled = false,
  } = ctx as SegmentGroupContextValueWithDisabled

  const isActive = ctxValue === value
  const isDisabled = disabled || groupDisabled

  return (
    <button
      type="button"
      role="tab"
      className={cn(
        'ring-offset-background data-[state=active]:text-text relative inline-flex items-center justify-center whitespace-nowrap px-3 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
        'focus-visible:ring-accent/30 h-full rounded-md',
        className,
      )}
      tabIndex={-1}
      data-orientation="horizontal"
      aria-disabled={isDisabled || undefined}
      aria-selected={isActive}
      disabled={isDisabled}
      onClick={() => {
        if (isDisabled) {
          return
        }
        setValue(value)
      }}
      data-state={isActive ? 'active' : 'inactive'}
    >
      <span className="z-1">{label}</span>

      {isActive && (
        <m.span
          layout
          transition={Spring.presets.smooth}
          layoutId={layoutId}
          className="bg-background absolute inset-0 z-0 rounded-md shadow"
        />
      )}
    </button>
  )
}
