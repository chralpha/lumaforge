import { clsxm } from '~/lib/cn'
import type { OnlineLUTPreviewAsset } from '~/lib/profiles/catalog'

type OnlineLutPreviewThumbSize = 'inline' | 'row' | 'mobile'
type OnlineLutPreviewThumbSurface = 'desktop' | 'mobile'

const sizeClasses: Record<OnlineLutPreviewThumbSize, string> = {
  inline: 'h-7 w-10',
  row: 'h-9 w-12',
  mobile: 'h-9 w-12',
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

  return (
    <span
      className={clsxm(
        'relative block shrink-0 overflow-hidden rounded-[6px] border',
        sizeClasses[size],
        isMobile
          ? 'border-lf-on-photo-bord-soft bg-lf-on-photo-bg'
          : 'border-lf-hairline/35 bg-[oklch(from_var(--color-lf-on-surface)_l_c_h_/_0.045)]',
      )}
      data-raw-lut-preview-frame={preview ? 'image' : 'placeholder'}
      aria-hidden="true"
    >
      {preview ? (
        <img
          src={preview.url}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          data-raw-lut-preview="image"
          className="size-full object-cover"
        />
      ) : (
        <span
          data-raw-lut-preview="placeholder"
          className="grid size-full grid-cols-3 overflow-hidden"
        >
          <span className="bg-lf-green/45" />
          <span className="bg-lf-amber/45" />
          <span className="bg-lf-on-surface/16" />
        </span>
      )}
      <span className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/10" />
    </span>
  )
}
