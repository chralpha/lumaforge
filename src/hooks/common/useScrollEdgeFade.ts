import { useEffect } from 'react'

type Edge = 'top' | 'bottom' | 'both' | 'none'

/**
 * Sets `data-raw-scroll="fade"` and `data-raw-scroll-edge` on the target
 * element so raw-lab.surface.css can render an edge gradient mask matching
 * the current scroll position. The companion CSS lives under the
 * `[data-raw-scroll="fade"]` selectors.
 */
export function useScrollEdgeFade(
  target: HTMLElement | null | undefined,
  options?: { threshold?: number; enabled?: boolean },
) {
  const enabled = options?.enabled ?? true
  const threshold = options?.threshold ?? 2

  useEffect(() => {
    if (!target || !enabled) return

    target.dataset.rawScroll = 'fade'

    const update = () => {
      const { scrollTop, scrollHeight, clientHeight } = target
      const atTop = scrollTop <= threshold
      const atBottom = scrollTop + clientHeight >= scrollHeight - threshold
      const overflows = scrollHeight - clientHeight > threshold

      let edge: Edge
      if (!overflows) edge = 'none'
      else if (atTop && atBottom) edge = 'none'
      else if (atTop) edge = 'bottom'
      else if (atBottom) edge = 'top'
      else edge = 'both'

      if (edge === 'none') {
        delete target.dataset.rawScrollEdge
      } else {
        target.dataset.rawScrollEdge = edge
      }
    }

    // Run after layout settles; on first mount the target's scrollHeight
    // may equal clientHeight before children finish painting.
    const initial = requestAnimationFrame(() => {
      update()
      requestAnimationFrame(update)
    })

    target.addEventListener('scroll', update, { passive: true })

    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    resizeObserver?.observe(target)
    for (const child of Array.from(target.children)) {
      resizeObserver?.observe(child)
    }
    const childObserver = new MutationObserver(update)
    childObserver.observe(target, {
      attributes: true,
      attributeFilter: ['data-state', 'data-open', 'aria-expanded'],
      childList: true,
      subtree: true,
      characterData: true,
    })
    const win = target.ownerDocument?.defaultView
    win?.addEventListener('resize', update)

    return () => {
      cancelAnimationFrame(initial)
      target.removeEventListener('scroll', update)
      win?.removeEventListener('resize', update)
      resizeObserver?.disconnect()
      childObserver.disconnect()
      delete target.dataset.rawScroll
      delete target.dataset.rawScrollEdge
    }
  }, [enabled, target, threshold])
}
