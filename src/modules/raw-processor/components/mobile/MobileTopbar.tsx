import { BarChart3 } from 'lucide-react'

import { LocaleToggle } from '~/components/common/LocaleToggle'
import { IconButton } from '~/components/ui/button'
import { clsxm } from '~/lib/cn'
import { useI18n } from '~/lib/i18n'

import type { MobileMoreMenuItem } from './MobileMoreMenu'
import { MobileMoreMenu } from './MobileMoreMenu'

const appIcon = '/favicon.png'

export function MobileTopbar(props: {
  hasImage: boolean
  fileName: string
  fileMeta: string
  supportLevel: 'official' | 'experimental'
  histogramShown: boolean
  onToggleHistogram: () => void
  moreMenuItems: MobileMoreMenuItem[]
}) {
  const { t } = useI18n()
  const title = props.hasImage ? props.fileName : t('raw.header.title')
  const meta = props.hasImage ? props.fileMeta : t('raw.header.subtitleEmpty')
  return (
    <header
      data-mobile-topbar
      className="pointer-events-none absolute inset-x-0 top-0 z-20 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 bg-gradient-to-b from-black/80 via-black/45 to-transparent px-3 pb-4 pt-safe-offset-3 text-lf-hero-ink"
    >
      <img
        src={appIcon}
        alt=""
        className="pointer-events-auto size-[26px] shrink-0 rounded-[5px] object-cover shadow-md"
      />
      <div className="pointer-events-auto min-w-0">
        <h1 className="m-0 truncate text-sm font-semibold leading-tight">
          {title}
        </h1>
        <p className="m-0 truncate text-[0.68rem] leading-tight text-lf-hero-ink/72 tabular-nums">
          {props.hasImage && (
            <span
              aria-hidden="true"
              className={clsxm(
                'mr-1.5 inline-block size-[7px] translate-y-px rounded-full',
                props.supportLevel === 'official'
                  ? 'bg-lf-green shadow-[0_0_0_2px_oklch(0.59_0.15_153/0.28)]'
                  : 'bg-lf-amber',
              )}
            />
          )}
          {meta}
        </p>
      </div>
      <div className="pointer-events-auto inline-flex items-center gap-1.5">
        <LocaleToggle className="inline-flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-md border border-lf-on-photo-bord bg-lf-on-photo-bg px-2.5 text-[0.72rem] font-semibold text-lf-hero-ink transition-colors hover:bg-lf-on-photo-bg-strong [&_span]:leading-none [&_svg]:size-4 [&_svg]:stroke-current" />
        {props.hasImage && (
          <IconButton
            icon={BarChart3}
            size="md"
            aria-label={
              props.histogramShown
                ? t('raw.mobile.histogram.hide')
                : t('raw.mobile.histogram.show')
            }
            aria-pressed={props.histogramShown}
            onClick={props.onToggleHistogram}
            className={clsxm(
              'size-11 rounded-md border transition-colors',
              props.histogramShown
                ? 'border-lf-amber/55 bg-lf-amber/15 text-lf-amber-soft [&_svg]:size-5 [&_svg]:stroke-current'
                : 'border-lf-on-photo-bord bg-lf-on-photo-bg text-lf-hero-ink [&_svg]:size-5 [&_svg]:stroke-current',
            )}
          />
        )}
        <MobileMoreMenu
          ariaLabel={t('raw.mobile.more.menuAria')}
          items={props.moreMenuItems}
        />
      </div>
    </header>
  )
}
