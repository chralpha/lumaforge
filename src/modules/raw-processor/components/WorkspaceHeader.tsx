import { useAtomValue } from 'jotai'
import { FolderOpen, MoreHorizontal, RotateCcw } from 'lucide-react'

import { LocaleToggle } from '~/components/common/LocaleToggle'
import { Button } from '~/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu/DropdownMenu'
import { useI18n } from '~/lib/i18n'

import { currentSessionAtom } from '../state/session.atoms'
import { SupportBadge } from './SupportBadge'

const appIcon = '/favicon.png'

export function WorkspaceHeader({
  fileName,
  hasImage,
  supportLevel,
  onReplaceFile,
  onResetSession,
}: {
  fileName?: string
  hasImage: boolean
  supportLevel: 'official' | 'experimental'
  onReplaceFile: () => void
  onResetSession: () => void
}) {
  const { t } = useI18n()
  const session = useAtomValue(currentSessionAtom)
  const isExporting = session?.exportState.status === 'exporting'

  return (
    <header
      data-raw-desktop-chrome="on-photo-topbar"
      data-raw-desktop-density="compact-command"
      className="flex min-h-[54px] min-w-0 items-center justify-between gap-3 border-b border-lf-on-photo-bord-soft bg-gradient-to-b from-black/88 via-black/62 to-lf-dark/80 pb-2.5 pt-safe-offset-2 px-safe-offset-3 text-lf-hero-ink shadow-[0_12px_34px_oklch(0.04_0.012_76/0.26)] backdrop-blur-background sm:px-safe-offset-3 [@media(max-height:480px)]:pb-1.5 [@media(max-height:480px)]:pt-[calc(6px+env(safe-area-inset-top))]"
    >
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2.5">
          <img
            className="size-6 shrink-0 rounded-[5px] object-cover"
            src={appIcon}
            alt=""
            aria-hidden="true"
          />
          <h1 className="truncate text-[0.88rem] font-semibold text-lf-hero-ink">
            {hasImage ? fileName : t('raw.header.title')}
          </h1>
          {hasImage && (
            <span className="inline-flex max-[640px]:hidden">
              <SupportBadge level={supportLevel} />
            </span>
          )}
        </div>
        <div className="ps-[34px]">
          <p className="mt-0.5 truncate text-[0.68rem] font-medium text-lf-hero-ink/52 [@media(max-height:480px)]:hidden">
            {hasImage
              ? t('raw.header.subtitleLoaded')
              : t('raw.header.subtitleEmpty')}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <LocaleToggle className="inline-flex h-7 items-center justify-center gap-1.5 rounded-md border border-lf-on-photo-bord-soft bg-lf-on-photo-bg px-2 text-[0.72rem] font-medium text-lf-hero-ink/72 shadow-none transition-colors hover:bg-lf-on-photo-bg-strong hover:text-lf-hero-ink max-[640px]:hidden" />
        <Button
          variant="secondary"
          size="sm"
          type="button"
          onClick={onReplaceFile}
          disabled={isExporting}
          className="h-7 gap-1.5 rounded-md border-lf-on-photo-bord-soft bg-lf-on-photo-bg px-2 text-[0.72rem] font-medium text-lf-hero-ink/82 shadow-none hover:bg-lf-on-photo-bg-strong hover:text-lf-hero-ink max-[640px]:hidden [&_svg]:size-[13px] [&_svg]:stroke-[1.9]"
        >
          <FolderOpen aria-hidden="true" />
          {hasImage ? t('raw.header.replace') : t('raw.header.chooseRaw')}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          type="button"
          onClick={onResetSession}
          disabled={!hasImage || isExporting}
          className="h-7 gap-1.5 rounded-md border-lf-on-photo-bord-soft bg-lf-on-photo-bg px-2 text-[0.72rem] font-medium text-lf-hero-ink/82 shadow-none hover:bg-lf-on-photo-bg-strong hover:text-lf-hero-ink max-[640px]:hidden [&_svg]:size-[13px] [&_svg]:stroke-[1.9]"
        >
          <RotateCcw aria-hidden="true" />
          {t('raw.header.reset')}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="secondary"
              size="sm"
              type="button"
              className="hidden gap-1.5 max-[640px]:inline-flex"
            >
              <MoreHorizontal aria-hidden="true" className="size-4" />
              {t('raw.header.more')}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              className="gap-2"
              disabled={isExporting}
              onSelect={onReplaceFile}
            >
              <FolderOpen aria-hidden="true" className="size-[15px]" />
              {hasImage ? t('raw.header.replace') : t('raw.header.chooseRaw')}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="gap-2"
              disabled={!hasImage || isExporting}
              onSelect={onResetSession}
            >
              <RotateCcw aria-hidden="true" className="size-[15px]" />
              {t('raw.header.reset')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
