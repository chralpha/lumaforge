import { BarChart3 } from 'lucide-react'

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
  histogramVisible: boolean
  onToggleHistogram: () => void
  moreMenuItems: MobileMoreMenuItem[]
}) {
  const { t } = useI18n()
  const title = props.hasImage ? props.fileName : t('raw.header.title')
  const meta = props.hasImage ? props.fileMeta : t('raw.header.subtitleEmpty')
  return (
    <header
      data-mobile-topbar
      className="pointer-events-none absolute inset-x-0 top-0 z-20 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 bg-gradient-to-b from-black/85 via-black/55 to-transparent px-3 pb-4 pt-safe-offset-3 text-white"
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
        <p className="m-0 truncate text-[0.68rem] leading-tight text-white/80 tabular-nums">
          {props.hasImage && (
            <span
              aria-hidden="true"
              className={clsxm(
                'mr-1.5 inline-block size-[7px] translate-y-px rounded-full',
                props.supportLevel === 'official'
                  ? 'bg-accent shadow-[0_0_0_2px_rgba(74,222,128,0.28)]'
                  : 'bg-amber-400',
              )}
            />
          )}
          {meta}
        </p>
      </div>
      <div className="pointer-events-auto inline-flex items-center gap-1.5">
        {props.hasImage && (
          <IconButton
            icon={BarChart3}
            size="md"
            aria-pressed={props.histogramVisible}
            aria-label={
              props.histogramVisible
                ? t('raw.mobile.histogram.toggleHide')
                : t('raw.mobile.histogram.toggleShow')
            }
            onClick={props.onToggleHistogram}
            className="rounded-md border border-white/30 bg-black/40 text-white"
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
