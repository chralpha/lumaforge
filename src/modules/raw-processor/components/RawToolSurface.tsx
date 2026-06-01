import { useViewport } from '~/hooks/common'

import { DesktopRawToolSurface } from './DesktopRawToolSurface'
import { MobileRawToolSurface } from './mobile/MobileRawToolSurface'
import type { RawToolSurfaceProps } from './RawWorkflowContext'
import {
  RawWorkflowProvider,
  useRawWorkflowContext,
} from './RawWorkflowContext'

const selectIsNarrowViewport = (v: { w: number }) => v.w <= 640 && v.w !== 0

export function RawToolSurface(props?: RawToolSurfaceProps) {
  const workflow = useRawWorkflowContext(props)
  const isMobileViewport = useViewport(selectIsNarrowViewport)

  const content = isMobileViewport ? (
    // Photo-first scaffold is ALWAYS present on mobile, even before a RAW
    // is loaded, so the topbar + toolbar are consistent from the first screen.
    <div className="pointer-events-none fixed inset-0 z-30" data-raw-mobile-lab>
      <MobileRawToolSurface />
    </div>
  ) : (
    <DesktopRawToolSurface />
  )

  return <RawWorkflowProvider value={workflow}>{content}</RawWorkflowProvider>
}

export type { RawToolSurfaceProps } from './RawWorkflowContext'
