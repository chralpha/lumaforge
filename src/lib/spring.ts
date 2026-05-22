import type { Transition } from 'motion/react'

/**
 * A smooth spring with a predefined duration and no bounce.
 */
const smoothPreset: Transition = {
  type: 'spring',
  duration: 0.4,
  bounce: 0,
}

/**
 * A spring with a predefined duration and small amount of bounce that feels more snappy.
 */
const snappyPreset: Transition = {
  type: 'spring',
  duration: 0.4,
  bounce: 0.15,
}

/**
 * A spring with a predefined duration and higher amount of bounce.
 */
const bouncyPreset: Transition = {
  type: 'spring',
  duration: 0.4,
  bounce: 0.3,
}
class SpringPresets {
  smooth = smoothPreset
  snappy = snappyPreset
  bouncy = bouncyPreset
}
class SpringStatic {
  presets = new SpringPresets()

  /**
   * A smooth spring with a predefined duration and no bounce that can be tuned.
   *
   * @param duration The perceptual duration, which defines the pace of the spring.
   * @param extraBounce How much additional bounce should be added to the base bounce of 0.
   */
  smooth(duration = 0.4, extraBounce = 0): Transition {
    return {
      type: 'spring',
      duration,
      bounce: extraBounce,
    }
  }

  /**
   * A spring with a predefined duration and small amount of bounce that feels more snappy.
   */
  snappy(duration = 0.4, extraBounce = 0): Transition {
    return {
      type: 'spring',
      duration,
      bounce: 0.15 + extraBounce,
    }
  }

  /**
   * A spring with a predefined duration and higher amount of bounce that can be tuned.
   */
  bouncy(duration = 0.4, extraBounce = 0): Transition {
    return {
      type: 'spring',
      duration,
      bounce: 0.3 + extraBounce,
    }
  }
}

const SpringClass = new SpringStatic()
export { SpringClass as Spring }

/**
 * Drag/release spring tuned for the mobile LUT sheet.
 *
 * Stiffness/damping/mass land around the 180ms perceptual settle that matches
 * the design system's `--duration-lf-standard` token without overshoot.
 */
export const sheetSpring: Transition = {
  type: 'spring',
  stiffness: 320,
  damping: 34,
  mass: 0.85,
}

/**
 * Short fade for small surfaces (chips, tooltips, overlay panels).
 *
 * Pairs `--duration-lf-fast` (160ms) with the standard `cubic-bezier(0.22, 1,
 * 0.36, 1)` easing used across LumaForge UI surfaces.
 */
export const surfaceFade: Transition = {
  duration: 0.16,
  ease: [0.22, 1, 0.36, 1],
}
