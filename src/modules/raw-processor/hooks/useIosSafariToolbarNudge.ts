import { useEffect } from 'react'

const TOOLBAR_NUDGE_ATTRIBUTE = 'data-raw-ios-toolbar-nudge'
const MOBILE_QUERY = '(max-width: 640px)'
const TOOLBAR_NUDGE_SCROLL_Y = 96
const TOOLBAR_RESTORE_THRESHOLD_Y = 32
const IOS_DEVICE_PATTERN = /\b(?:iPad|iPhone|iPod)\b/
const NON_SAFARI_IOS_BROWSER_PATTERN = /\b(?:CriOS|EdgiOS|FxiOS|OPiOS)\b/

function isIosSafariToolbarNudgeEligible() {
  const userAgent = navigator.userAgent
  const platform = navigator.platform
  const isModernIpad = platform === 'MacIntel' && navigator.maxTouchPoints > 1
  const isIos = IOS_DEVICE_PATTERN.test(userAgent) || isModernIpad
  const isSafari =
    /\bSafari\//.test(userAgent) &&
    !NON_SAFARI_IOS_BROWSER_PATTERN.test(userAgent)
  const isStandalone =
    'standalone' in navigator &&
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  const isMobileLayout =
    typeof window.matchMedia === 'function'
      ? window.matchMedia(MOBILE_QUERY).matches
      : window.innerWidth <= 640

  return isIos && isSafari && !isStandalone && isMobileLayout
}

export function useIosSafariToolbarNudge() {
  useEffect(() => {
    if (!isIosSafariToolbarNudgeEligible()) return

    const root = document.documentElement
    let nudged = false
    let cancelScheduledScroll: (() => void) | null = null

    root.setAttribute(TOOLBAR_NUDGE_ATTRIBUTE, 'armed')

    const scheduleToolbarScroll = (state: 'primed' | 'nudged') => {
      cancelScheduledScroll?.()
      cancelScheduledScroll = null

      const scroll = () => {
        cancelScheduledScroll = null
        window.scrollTo(0, TOOLBAR_NUDGE_SCROLL_Y)
        root.setAttribute(TOOLBAR_NUDGE_ATTRIBUTE, state)
      }

      if (typeof window.requestAnimationFrame === 'function') {
        const frame = window.requestAnimationFrame(scroll)
        cancelScheduledScroll = () => window.cancelAnimationFrame(frame)
        return
      }

      const timeout = window.setTimeout(scroll, 0)
      cancelScheduledScroll = () => window.clearTimeout(timeout)
    }

    const nudge = () => {
      if (nudged) return
      nudged = true
      window.removeEventListener('touchstart', nudge, true)
      window.removeEventListener('pointerdown', nudge, true)

      scheduleToolbarScroll('nudged')
    }

    const restoreNudgePosition = () => {
      if (window.scrollY >= TOOLBAR_RESTORE_THRESHOLD_Y) return

      scheduleToolbarScroll(nudged ? 'nudged' : 'primed')
    }

    window.addEventListener('touchstart', nudge, {
      capture: true,
      once: true,
      passive: true,
    })
    window.addEventListener('pointerdown', nudge, {
      capture: true,
      once: true,
      passive: true,
    })
    window.addEventListener('touchmove', restoreNudgePosition, {
      capture: true,
      passive: true,
    })
    window.addEventListener('scroll', restoreNudgePosition, { passive: true })

    scheduleToolbarScroll('primed')

    return () => {
      cancelScheduledScroll?.()
      window.removeEventListener('touchstart', nudge, true)
      window.removeEventListener('pointerdown', nudge, true)
      window.removeEventListener('touchmove', restoreNudgePosition, true)
      window.removeEventListener('scroll', restoreNudgePosition)

      if (root.getAttribute(TOOLBAR_NUDGE_ATTRIBUTE)) {
        root.removeAttribute(TOOLBAR_NUDGE_ATTRIBUTE)
      }
    }
  }, [])
}
