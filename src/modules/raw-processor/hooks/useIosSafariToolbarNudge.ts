import { useEffect } from 'react'

const TOOLBAR_NUDGE_ATTRIBUTE = 'data-raw-ios-toolbar-nudge'
const MOBILE_QUERY = '(max-width: 640px)'
const TOOLBAR_NUDGE_SCROLL_STEPS = [1, 128, 320, 512] as const
const TOOLBAR_NUDGE_STEP_DELAY_MS = 64
const TOOLBAR_NUDGE_RESIZE_RETRY_DELAY_MS = 120
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
    let resizeRetryTimeout: number | null = null
    const scheduledScrollTimeouts = new Set<number>()
    const visualViewport = window.visualViewport

    root.setAttribute(TOOLBAR_NUDGE_ATTRIBUTE, 'armed')

    const clearScheduledScrolls = () => {
      for (const timeout of scheduledScrollTimeouts) {
        window.clearTimeout(timeout)
      }
      scheduledScrollTimeouts.clear()
    }

    const clearResizeRetry = () => {
      if (resizeRetryTimeout === null) return

      window.clearTimeout(resizeRetryTimeout)
      resizeRetryTimeout = null
    }

    const scheduleToolbarProbe = (state: 'primed' | 'nudged') => {
      clearScheduledScrolls()
      root.setAttribute(TOOLBAR_NUDGE_ATTRIBUTE, 'probing')

      for (const [index, scrollY] of TOOLBAR_NUDGE_SCROLL_STEPS.entries()) {
        const timeout = window.setTimeout(() => {
          scheduledScrollTimeouts.delete(timeout)
          window.scrollTo(0, scrollY)

          if (index === TOOLBAR_NUDGE_SCROLL_STEPS.length - 1) {
            root.setAttribute(TOOLBAR_NUDGE_ATTRIBUTE, state)
          }
        }, index * TOOLBAR_NUDGE_STEP_DELAY_MS)

        scheduledScrollTimeouts.add(timeout)
      }
    }

    const scheduleToolbarRetry = () => {
      clearResizeRetry()

      resizeRetryTimeout = window.setTimeout(() => {
        resizeRetryTimeout = null
        scheduleToolbarProbe(nudged ? 'nudged' : 'primed')
      }, TOOLBAR_NUDGE_RESIZE_RETRY_DELAY_MS)
    }

    const nudge = () => {
      if (nudged) return
      nudged = true
      window.removeEventListener('touchstart', nudge, true)
      window.removeEventListener('pointerdown', nudge, true)

      scheduleToolbarProbe('nudged')
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
    window.addEventListener('resize', scheduleToolbarRetry, { passive: true })
    visualViewport?.addEventListener('resize', scheduleToolbarRetry, {
      passive: true,
    })

    scheduleToolbarProbe('primed')

    return () => {
      clearResizeRetry()
      clearScheduledScrolls()
      window.removeEventListener('touchstart', nudge, true)
      window.removeEventListener('pointerdown', nudge, true)
      window.removeEventListener('resize', scheduleToolbarRetry)
      visualViewport?.removeEventListener('resize', scheduleToolbarRetry)

      if (root.getAttribute(TOOLBAR_NUDGE_ATTRIBUTE)) {
        root.removeAttribute(TOOLBAR_NUDGE_ATTRIBUTE)
      }
    }
  }, [])
}
