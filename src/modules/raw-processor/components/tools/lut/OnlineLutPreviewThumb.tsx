import { Aperture } from 'lucide-react'
import { useEffect, useState } from 'react'

import { clsxm } from '~/lib/cn'
import type { OnlineLUTPreviewAsset } from '~/lib/profiles/catalog'

type OnlineLutPreviewThumbSize = 'inline' | 'row' | 'mobile'
type OnlineLutPreviewThumbSurface = 'desktop' | 'mobile'

const sizeClasses: Record<OnlineLutPreviewThumbSize, string> = {
  inline: 'h-7 w-10',
  row: 'h-9 w-12',
  mobile: 'h-12 w-16',
}

export function OnlineLutPreviewThumb({
  preview,
  size,
  surface = 'desktop',
}: {
  preview?: OnlineLUTPreviewAsset
  size: OnlineLutPreviewThumbSize
  surface?: OnlineLutPreviewThumbSurface
}) {
  const isMobile = surface === 'mobile'
  const [failed, setFailed] = useState(false)

  // Remote previews come from third-party catalogs and can 404, fail CORS, or
  // be hotlink-blocked. Reset the failed flag whenever the source changes so a
  // working URL is never permanently masked by a previous failure.
  useEffect(() => {
    setFailed(false)
  }, [preview?.url])

  const showImage = Boolean(preview) && !failed

  return (
    <span
      className={clsxm(
        'relative block shrink-0 overflow-hidden rounded-[6px] border',
        sizeClasses[size],
        isMobile
          ? 'border-lf-on-photo-bord-soft bg-lf-on-photo-bg'
          : 'border-lf-hairline/35 bg-[oklch(from_var(--color-lf-on-surface)_l_c_h_/_0.045)]',
      )}
      data-raw-lut-preview-frame={showImage ? 'image' : 'placeholder'}
      aria-hidden="true"
    >
      {showImage ? (
        <img
          src={preview!.url}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          data-raw-lut-preview="image"
          className="size-full object-cover"
        />
      ) : (
        <span
          data-raw-lut-preview="placeholder"
          className="grid size-full place-items-center"
        >
          <Aperture
            className={clsxm(
              'size-[52%] stroke-[1.5]',
              isMobile ? 'text-lf-on-photo-ink/30' : 'text-lf-on-surface/28',
            )}
          />
        </span>
      )}
      <span
        className={clsxm(
          'pointer-events-none absolute inset-0 ring-1 ring-inset',
          isMobile ? 'ring-lf-on-photo-ink/10' : 'ring-lf-on-surface/10',
        )}
      />
    </span>
  )
}
