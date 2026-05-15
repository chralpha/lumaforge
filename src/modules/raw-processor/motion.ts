import type { Variants } from 'motion/react'
import { useReducedMotion } from 'motion/react'
import { useMemo } from 'react'

import { Spring } from '~/lib/spring'

export const SHEET_SPRING = Spring.presets.snappy
export const BACKDROP_SPRING = Spring.smooth(0.3)
export const TAP_SPRING = Spring.snappy(0.25)

export function useToolMotion() {
  const prefersReduced = useReducedMotion() ?? false

  const variants = useMemo(
    () => ({
      container: {
        hidden: {},
        visible: {
          transition: { staggerChildren: prefersReduced ? 0 : 0.045 },
        },
      } satisfies Variants,
      item: {
        hidden: { opacity: 0, ...(prefersReduced ? {} : { y: 12 }) },
        visible: {
          opacity: 1,
          y: 0,
          transition: Spring.presets.snappy,
        },
      } satisfies Variants,
    }),
    [prefersReduced],
  )

  return { prefersReduced, ...variants }
}
