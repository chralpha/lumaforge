import { useEffect } from 'react'

const TOOLBAR_NUDGE_ATTRIBUTE = 'data-raw-ios-toolbar-nudge'
const MOBILE_QUERY = '(max-width: 640px)'
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

    root.setAttribute(TOOLBAR_NUDGE_ATTRIBUTE, 'armed')

    const nudge = () => {
      if (nudged) return
      nudged = true
      window.removeEventListener('touchstart', nudge, true)
      window.removeEventListener('pointerdown', nudge, true)

      if (window.scrollY < 1) {
        window.scrollTo(0, 1)
      }
      root.setAttribute(TOOLBAR_NUDGE_ATTRIBUTE, 'nudged')
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

    return () => {
      window.removeEventListener('touchstart', nudge, true)
      window.removeEventListener('pointerdown', nudge, true)

      if (root.getAttribute(TOOLBAR_NUDGE_ATTRIBUTE)) {
        root.removeAttribute(TOOLBAR_NUDGE_ATTRIBUTE)
      }
    }
  }, [])
}
