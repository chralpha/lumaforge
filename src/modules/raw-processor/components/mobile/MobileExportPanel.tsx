import { AlertTriangle, Copy, Download, FolderOpen, Share2 } from 'lucide-react'
import { AnimatePresence, m, useReducedMotion } from 'motion/react'

import { localizeCopyLabel, localizeRawReason, useI18n } from '~/lib/i18n'

import type {
  ExportResult,
  ExportShareCapability,
} from '../../model/export-result'
import type { ExportRecoveryState } from '../../model/session'

// Mirrors the handoff spec tokens: --mrl-ease + base 220ms duration so the
// idle/busy/done transitions feel like the design rather than a hard snap.
const MRL_EASE = [0.22, 1, 0.36, 1] as const
const PANEL_TRANSITION = { duration: 0.22, ease: MRL_EASE }

function BusySpinner() {
  const reduced = useReducedMotion() ?? false
  return (
    <m.span
      aria-hidden="true"
      className="size-4 rounded-full border-2 border-lf-ink/30 border-t-lf-ink"
      animate={reduced ? undefined : { rotate: 360 }}
      transition={
        reduced
          ? undefined
          : { duration: 0.8, ease: 'linear', repeat: Infinity }
      }
    />
  )
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function MobileExportAction(props: {
  icon: typeof Share2
  label: string
  onClick?: () => void | Promise<void>
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={props.onClick}
      className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-md border border-lf-on-photo-bord-soft bg-lf-on-photo-bg px-2.5 text-[0.74rem] font-semibold text-lf-hero-ink transition-colors hover:border-lf-amber/55 hover:text-lf-amber-soft disabled:cursor-not-allowed disabled:opacity-45"
    >
      <props.icon aria-hidden="true" className="size-3.5" />
      {props.label}
    </button>
  )
}

export function MobileExportPanel(props: {
  canExport: boolean
  disabledReason?: string
  canPreviewExport?: boolean
  previewExportDisabledReason?: string
  isProcessing: boolean
  onExport: (options: {
    quality: 'standard' | 'high'
    fidelity: 'safe' | 'balanced' | 'max'
  }) => void
  onPreviewExport?: () => void | Promise<void>
  exportResult: ExportResult | null
  exportShareCapability: ExportShareCapability
  recovery?: ExportRecoveryState
  onShareExport: () => void | Promise<void>
  onDownloadExport: () => void
  onCopyExport: () => void | Promise<void>
  onRecoverExportSource?: () => void
}) {
  const { t } = useI18n()
  const unavailableReason =
    localizeRawReason(props.disabledReason, t) || t('raw.exportSourceLoading')
  const previewUnavailableReason =
    localizeRawReason(props.previewExportDisabledReason, t) ||
    t('raw.export.previewSourceLoading')
  const shareUnavailableReason =
    props.exportShareCapability.available === false
      ? localizeRawReason(props.exportShareCapability.reason, t)
      : undefined
  const copyCapability = props.exportResult?.copyCapability
  const copyUnavailableReason =
    copyCapability &&
    copyCapability.mode !== 'full-resolution' &&
    copyCapability.mode !== 'hq-preview'
      ? localizeRawReason(copyCapability.reason, t)
      : undefined
  const copyButtonLabel = copyCapability
    ? copyCapability.mode === 'unavailable'
      ? t('raw.export.copy')
      : localizeCopyLabel(copyCapability.label, t)
    : t('raw.export.copy')
  const showUnavailableReason = !props.isProcessing && !props.canExport
  const showRecovery =
    !props.isProcessing && props.recovery?.status === 'source-required'
  const resultKind = props.exportResult?.kind ?? 'full-resolution'
  const resultReadyLabel =
    resultKind === 'hq-preview'
      ? t('raw.export.previewReady')
      : t('raw.export.ready')

  const body = props.exportResult ? (
    <m.div
      key="result"
      data-mobile-substrate="glass-panel"
      className="grid gap-3 rounded-md border border-lf-on-photo-bord-soft bg-lf-on-photo-bg p-3.5 text-lf-hero-ink"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={PANEL_TRANSITION}
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-2.5">
        <span className="grid size-5 place-items-center text-lf-green-soft">
          <Download aria-hidden="true" className="size-5" />
        </span>
        <div className="grid min-w-0 gap-1">
          <h3
            className="m-0 truncate text-[0.88rem] font-semibold"
            title={props.exportResult.filename}
          >
            {resultKind === 'hq-preview'
              ? resultReadyLabel
              : `${props.exportResult.filename} ready`}
          </h3>
          <p className="m-0 text-[0.7rem] text-lf-hero-ink/68 tabular-nums">
            {props.exportResult.width} x {props.exportResult.height} ·{' '}
            {formatBytes(props.exportResult.size)}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        <MobileExportAction
          icon={Share2}
          label={t('raw.export.share')}
          disabled={!props.exportShareCapability.available}
          onClick={props.onShareExport}
        />
        <MobileExportAction
          icon={Download}
          label={t('raw.export.download')}
          onClick={props.onDownloadExport}
        />
        <MobileExportAction
          icon={Copy}
          label={copyButtonLabel}
          disabled={props.exportResult.copyCapability.mode === 'unavailable'}
          onClick={props.onCopyExport}
        />
      </div>
      {!props.exportShareCapability.available && shareUnavailableReason && (
        <p className="m-0 text-[0.7rem] leading-relaxed text-lf-hero-ink/68">
          {shareUnavailableReason}
        </p>
      )}
      {copyUnavailableReason && (
        <p className="m-0 text-[0.7rem] leading-relaxed text-lf-hero-ink/68">
          {copyUnavailableReason}
        </p>
      )}
      {resultKind === 'hq-preview' && (
        <p className="m-0 text-[0.7rem] leading-relaxed text-lf-hero-ink/68">
          {t('raw.export.previewResultNote')}
        </p>
      )}
    </m.div>
  ) : (
    <m.div
      key="idle"
      className="grid gap-3 px-0.5 py-0.5"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={PANEL_TRANSITION}
    >
      {showUnavailableReason && (
        <div className="grid grid-cols-[22px_1fr] gap-2.5 rounded-md border border-lf-rose/45 bg-lf-rose/10 p-3 text-lf-hero-ink">
          <AlertTriangle
            aria-hidden="true"
            className="size-[18px] text-lf-rose"
          />
          <div>
            <strong className="block text-[0.82rem] font-semibold">
              {t('raw.export.blocked')}
            </strong>
            <span className="mt-0.5 block text-[0.7rem] leading-relaxed text-lf-hero-ink/68">
              {unavailableReason}
            </span>
          </div>
        </div>
      )}
      {showRecovery && (
        <button
          type="button"
          disabled={!props.onRecoverExportSource}
          onClick={props.onRecoverExportSource}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md border border-lf-on-photo-bord-soft bg-lf-on-photo-bg px-3 text-sm font-semibold text-lf-hero-ink transition-colors hover:border-lf-amber/55 hover:text-lf-amber-soft disabled:cursor-not-allowed disabled:opacity-45"
        >
          <FolderOpen aria-hidden="true" className="size-4" />
          {t('raw.export.reselect')}
        </button>
      )}
      <m.button
        type="button"
        disabled={!props.canExport || props.isProcessing}
        whileTap={
          !props.canExport || props.isProcessing ? undefined : { scale: 0.99 }
        }
        transition={PANEL_TRANSITION}
        onClick={() =>
          props.onExport({ quality: 'high', fidelity: 'balanced' })
        }
        className="inline-flex min-h-[50px] w-full items-center justify-center gap-2 rounded-md border border-lf-green-deep/40 bg-lf-green px-3 text-[0.92rem] font-semibold text-lf-ink transition-colors hover:bg-lf-green-hover disabled:cursor-not-allowed disabled:border-lf-on-photo-bord-soft disabled:bg-lf-on-photo-bg disabled:text-lf-hero-ink/35"
      >
        {props.isProcessing ? (
          <BusySpinner />
        ) : (
          <Download aria-hidden="true" className="size-4" />
        )}
        {props.isProcessing ? t('raw.export.preparing') : t('raw.export.run')}
      </m.button>
      <m.button
        type="button"
        disabled={
          !props.canPreviewExport ||
          props.isProcessing ||
          !props.onPreviewExport
        }
        whileTap={
          !props.canPreviewExport || props.isProcessing
            ? undefined
            : { scale: 0.99 }
        }
        transition={PANEL_TRANSITION}
        onClick={() => props.onPreviewExport?.()}
        className="inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-md border border-lf-on-photo-bord-soft bg-lf-on-photo-bg px-3 text-[0.82rem] font-semibold text-lf-hero-ink transition-colors hover:border-lf-amber/55 hover:text-lf-amber-soft disabled:cursor-not-allowed disabled:bg-lf-on-photo-bg/60 disabled:text-lf-hero-ink/35"
      >
        <Download aria-hidden="true" className="size-4" />
        {t('raw.export.runPreview')}
      </m.button>
      <div className="flex items-baseline justify-between gap-3 px-1 text-[0.7rem] text-lf-hero-ink/68">
        {!props.isProcessing && (
          <span>
            {props.canExport
              ? t('raw.export.sourcePath')
              : t('raw.export.noFallback')}
          </span>
        )}
        {props.isProcessing
          ? null
          : props.canExport && (
              <em className="not-italic text-lf-hero-ink">JPEG</em>
            )}
      </div>
      {!props.isProcessing && (
        <p className="m-0 px-1 text-[0.7rem] leading-relaxed text-lf-hero-ink/68">
          {props.canPreviewExport
            ? t('raw.export.previewSourcePath')
            : previewUnavailableReason}
        </p>
      )}
    </m.div>
  )

  return (
    <AnimatePresence mode="wait" initial={false}>
      {body}
    </AnimatePresence>
  )
}
