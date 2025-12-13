/**
 * RAW Processor page.
 * Route: /raw
 */

import { RawProcessorView } from '~/modules/raw-processor'

export const Component = () => {
  return (
    <div className="h-screen w-full bg-background">
      <RawProcessorView className="h-full" />
    </div>
  )
}

export default Component
