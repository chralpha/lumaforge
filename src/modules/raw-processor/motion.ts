import type { Variants } from 'motion/react'
import { useReducedMotion } from 'motion/react'
import { useMemo } from 'react'

import { Spring } from '~/lib/spring'

// The handoff spec slides sheets in over --mrl-dur-sheet (320ms) with the
// smooth --mrl-ease and no overshoot. A bouncy spring read as off-substrate,
// so this is a no-bounce ~320ms spring instead of the snappy preset.
export const SHEET_SPRING = Spring.smooth(0.32)
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
