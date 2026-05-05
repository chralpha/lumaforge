import { useAtomValue } from 'jotai'
import { Languages, MoreHorizontal, RotateCcw } from 'lucide-react'

import { LocaleToggle } from '~/components/common/LocaleToggle'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu/DropdownMenu'
import { localizeRawReason, useI18n } from '~/lib/i18n'

import {
  currentSessionAtom,
  exportDisabledReasonAtom,
} from '../state/session.atoms'
import { SupportBadge } from './SupportBadge'

const appIcon = '/favicon.png'

export function WorkspaceHeader({
  fileName,
  hasImage,
  supportLevel,
  canExport,
  disabledReason,
  onReplaceFile,
  onResetSession,
  onOpenExport,
}: {
  fileName?: string
  hasImage: boolean
  supportLevel: 'official' | 'experimental'
  canExport: boolean
  disabledReason?: string
  onReplaceFile: () => void
  onResetSession: () => void
  onOpenExport: () => void
}) {
  const { locale, t, toggleLocale } = useI18n()
  const session = useAtomValue(currentSessionAtom)
  const sessionDisabledReason = useAtomValue(exportDisabledReasonAtom)
  const isExporting = session?.exportState.status === 'exporting'
  const localeLabel =
    locale === 'zh-CN' ? t('common.localeEnglish') : t('common.localeChinese')
  const rawExportDisabledReason = !canExport
    ? (disabledReason ?? sessionDisabledReason ?? t('raw.exportSourceLoading'))
    : undefined
  const exportDisabledReason = localizeRawReason(rawExportDisabledReason, t)

  return (
    <header className="raw-lab-topbar" role="banner">
      <div className="min-w-0">
        <div className="raw-lab-title-row flex min-w-0 items-center gap-3">
          <img
            className="raw-lab-mark"
            src={appIcon}
            alt=""
            aria-hidden="true"
          />
          <h1 className="raw-lab-title truncate text-base font-semibold text-[oklch(0.18_0.018_76)]">
            {hasImage ? fileName : t('raw.header.title')}
          </h1>
          {hasImage && (
            <span className="raw-lab-support-badge">
              <SupportBadge level={supportLevel} />
            </span>
          )}
        </div>
        <p className="raw-lab-status mt-1 truncate text-xs text-[oklch(0.38_0.032_75)]">
          {hasImage
            ? t('raw.header.subtitleLoaded')
            : t('raw.header.subtitleEmpty')}
        </p>
        {exportDisabledReason && (
          <p className="raw-lab-unavailable mt-1 truncate text-xs text-[oklch(0.38_0.032_75)]">
            {t('raw.header.unavailablePrefix', {
              reason: exportDisabledReason,
            })}
          </p>
        )}
      </div>

      <div className="raw-lab-topbar-actions">
        <LocaleToggle className="raw-lab-topbar-button raw-lab-locale-toggle" />
        <button
          type="button"
          onClick={onReplaceFile}
          disabled={isExporting}
          className="raw-lab-topbar-button raw-lab-topbar-button-replace"
        >
          {hasImage ? t('raw.header.replace') : t('raw.header.chooseRaw')}
        </button>
        <button
          type="button"
          onClick={onResetSession}
          disabled={!hasImage || isExporting}
          className="raw-lab-topbar-button raw-lab-topbar-button-reset"
        >
          {t('raw.header.reset')}
        </button>
        <button
          type="button"
          onClick={onOpenExport}
          disabled={!canExport}
          className="raw-lab-topbar-button raw-lab-topbar-button-primary"
        >
          {t('raw.header.fullRes')}
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="raw-lab-topbar-button raw-lab-topbar-more"
            >
              <MoreHorizontal aria-hidden="true" />
              {t('raw.header.more')}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="raw-lab-more-menu">
            <DropdownMenuItem
              className="raw-lab-more-menu-item"
              disabled={!hasImage || isExporting}
              onSelect={onResetSession}
            >
              <RotateCcw aria-hidden="true" />
              {t('raw.header.reset')}
            </DropdownMenuItem>
            <DropdownMenuSeparator className="raw-lab-more-menu-separator" />
            <DropdownMenuItem
              className="raw-lab-more-menu-item"
              onSelect={(event) => {
                event.preventDefault()
                toggleLocale()
              }}
            >
              <Languages aria-hidden="true" />
              {localeLabel}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
