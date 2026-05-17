import { m } from 'motion/react'
import type { HTMLAttributes, KeyboardEvent, ReactNode } from 'react'
import { use, useId, useMemo, useState } from 'react'

import { cn } from '~/lib/cn'
import { Spring } from '~/lib/spring'

import type { SegmentGroupContextValue } from './ctx'
import { SegmentGroupContext } from './ctx'

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

  const isControlled = value !== undefined
  const [internalValue, setInternalValue] = useState(value ?? '')
  const currentValue = isControlled ? value : internalValue
  const componentId = useId()

  return (
    <SegmentGroupContext.Provider
      value={
        useMemo(
          () => ({
            value: currentValue,
            setValue: (nextValue) => {
              if (!isControlled) {
                setInternalValue(nextValue)
              }
              onValueChanged?.(nextValue)
            },
            componentId,
            disabled,
          }),
          [componentId, currentValue, disabled, isControlled, onValueChanged],
        ) satisfies SegmentGroupContextValue
      }
    >
      <div
        {...divProps}
        role="tablist"
        className={cn(
          'bg-fill-tertiary text-text-secondary inline-flex h-9 items-center justify-center rounded-lg p-1 outline-none',
          className,
        )}
        tabIndex={tabIndex}
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
  const {
    value: ctxValue,
    setValue,
    componentId: layoutId,
    disabled: groupDisabled,
  } = use(SegmentGroupContext)

  const isActive = ctxValue === value
  const isDisabled = disabled || groupDisabled

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (isDisabled || groupDisabled) {
      return
    }

    const navigationKeys = [
      'ArrowRight',
      'ArrowDown',
      'ArrowLeft',
      'ArrowUp',
      'Home',
      'End',
    ]
    if (!navigationKeys.includes(event.key)) {
      return
    }

    const tablist = event.currentTarget.closest('[role="tablist"]')
    if (!tablist) {
      return
    }

    const tabs = Array.from(
      tablist.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
    ).filter(
      (tab) => !tab.disabled && tab.getAttribute('aria-disabled') !== 'true',
    )
    const currentIndex = tabs.indexOf(event.currentTarget)
    if (currentIndex === -1 || tabs.length === 0) {
      return
    }

    event.preventDefault()

    let nextIndex = currentIndex
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = (currentIndex + 1) % tabs.length
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length
    } else if (event.key === 'Home') {
      nextIndex = 0
    } else if (event.key === 'End') {
      nextIndex = tabs.length - 1
    }

    const nextTab = tabs[nextIndex]
    const nextValue = nextTab?.dataset.value
    if (!nextTab || !nextValue) {
      return
    }

    nextTab.focus()
    setValue(nextValue)
  }

  return (
    <button
      type="button"
      role="tab"
      className={cn(
        'ring-offset-background data-[state=active]:text-text relative inline-flex items-center justify-center whitespace-nowrap px-3 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
        'focus-visible:ring-accent/30 h-full rounded-md',
        className,
      )}
      tabIndex={isActive && !isDisabled ? 0 : -1}
      data-orientation="horizontal"
      data-value={value}
      aria-disabled={isDisabled || undefined}
      aria-selected={isActive}
      disabled={isDisabled}
      onKeyDown={handleKeyDown}
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
