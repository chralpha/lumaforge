import { createContext } from 'react'

export interface SegmentGroupContextValue {
  value: string
  setValue: (value: string) => void
  componentId: string
  disabled: boolean
}
export const SegmentGroupContext = createContext<SegmentGroupContextValue>(
  null!,
)
