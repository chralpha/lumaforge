import { useAtomValue } from 'jotai'

import { LocaleToggle } from '~/components/common/LocaleToggle'
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
  const { t } = useI18n()
  const session = useAtomValue(currentSessionAtom)
  const sessionDisabledReason = useAtomValue(exportDisabledReasonAtom)
  const isExporting = session?.exportState.status === 'exporting'
  const rawExportDisabledReason = !canExport
    ? (disabledReason ?? sessionDisabledReason ?? t('raw.exportSourceLoading'))
    : undefined
  const exportDisabledReason = localizeRawReason(rawExportDisabledReason, t)

  return (
    <header className="raw-lab-topbar" role="banner">
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-3">
          <img
            className="raw-lab-mark"
            src={appIcon}
            alt=""
            aria-hidden="true"
          />
          <h1 className="truncate text-base font-semibold text-[oklch(0.18_0.018_76)]">
            {hasImage ? fileName : t('raw.header.title')}
          </h1>
          {hasImage && <SupportBadge level={supportLevel} />}
        </div>
        <p className="mt-1 truncate text-xs text-[oklch(0.38_0.032_75)]">
          {hasImage
            ? t('raw.header.subtitleLoaded')
            : t('raw.header.subtitleEmpty')}
        </p>
        {exportDisabledReason && (
          <p className="mt-1 truncate text-xs text-[oklch(0.38_0.032_75)]">
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
          className="raw-lab-topbar-button"
        >
          {hasImage ? t('raw.header.replace') : t('raw.header.chooseRaw')}
        </button>
        <button
          type="button"
          onClick={onResetSession}
          disabled={!hasImage || isExporting}
          className="raw-lab-topbar-button"
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
      </div>
    </header>
  )
}
