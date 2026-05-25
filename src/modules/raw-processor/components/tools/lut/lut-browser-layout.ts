import { useLayoutEffect, useState } from 'react'

export function useRawLabPortalContainer(open: boolean) {
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(
    null,
  )

  useLayoutEffect(() => {
    if (!open || typeof document === 'undefined') return

    setPortalContainer(document.querySelector('.raw-lab') ?? document.body)
  }, [open])

  return portalContainer
}
