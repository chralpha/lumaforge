/**
 * Compact metadata display.
 */

import { m } from 'motion/react'

import { clsxm } from '~/lib/cn'
import { Spring } from '~/lib/spring'

export function MetadataPanel({
  metadata,
  className,
}: {
  metadata: {
    make?: string
    model?: string
    lens?: string
    iso?: number
    aperture?: number
    focalLength?: number
    shutterSpeed?: string
    width: number
    height: number
  }
  className?: string
}) {
  const items = [
    {
      label: 'Camera',
      value: `${metadata.make || ''} ${metadata.model || ''}`.trim(),
    },
    { label: 'Lens', value: metadata.lens },
    { label: 'ISO', value: metadata.iso },
    {
      label: 'Aperture',
      value: metadata.aperture ? `f/${metadata.aperture}` : undefined,
    },
    {
      label: 'Focal',
      value: metadata.focalLength ? `${metadata.focalLength}mm` : undefined,
    },
    { label: 'Shutter', value: metadata.shutterSpeed },
    { label: 'Size', value: `${metadata.width} × ${metadata.height}` },
  ].filter((item) => item.value)

  return (
    <m.div
      className={clsxm(
        'grid grid-cols-2 gap-x-4 gap-y-2 p-4 bg-fill/50 rounded-lg text-xs',
        className,
      )}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={Spring.presets.smooth}
    >
      {items.map((item) => (
        <div key={item.label} className="flex justify-between">
          <span className="text-text-tertiary">{item.label}</span>
          <span className="text-text-secondary font-medium">{item.value}</span>
        </div>
      ))}
    </m.div>
  )
}
