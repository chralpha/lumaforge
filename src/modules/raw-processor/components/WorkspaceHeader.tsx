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
      className="flex min-w-0 items-center justify-between gap-4 border-b border-border-secondary bg-lf-paper-high pb-3 pt-safe-offset-3 px-safe-offset-3 sm:px-safe-offset-4 [@media(max-height:480px)]:pt-[calc(6px+env(safe-area-inset-top))] [@media(max-height:480px)]:pb-1.5"
      role="banner"
    >
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-3">
          <img
            className="size-7 shrink-0 rounded-[5px] object-cover"
            src={appIcon}
            alt=""
            aria-hidden="true"
          />
          <h1 className="truncate text-[0.95rem] font-semibold text-lf-ink">
            {hasImage ? fileName : t('raw.header.title')}
          </h1>
          {hasImage && (
            <span className="inline-flex max-[640px]:hidden">
              <SupportBadge level={supportLevel} />
            </span>
          )}
        </div>
        <div className="ps-10">
          <p className="mt-1 truncate text-[0.72rem] tracking-tight text-lf-ink/55 [@media(max-height:480px)]:hidden">
            {hasImage
              ? t('raw.header.subtitleLoaded')
              : t('raw.header.subtitleEmpty')}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <LocaleToggle className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-transparent px-2.5 text-[0.78rem] font-medium text-lf-ink/75 transition-colors hover:bg-[oklch(from_var(--color-lf-ink)_l_c_h_/_0.05)] hover:text-lf-ink max-[640px]:hidden" />
        <Button
          variant="secondary"
          size="sm"
          type="button"
          onClick={onReplaceFile}
          disabled={isExporting}
          className="max-[640px]:hidden"
        >
          {hasImage ? t('raw.header.replace') : t('raw.header.chooseRaw')}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          type="button"
          onClick={onResetSession}
          disabled={!hasImage || isExporting}
          className="max-[640px]:hidden"
        >
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
