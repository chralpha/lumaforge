/**
 * Progress overlay component for loading/processing states.
 */

import { useAtomValue } from 'jotai'
import { AnimatePresence, m } from 'motion/react'

import { clsxm } from '~/lib/cn'
import { useI18n } from '~/lib/i18n'
import { Spring } from '~/lib/spring'

import { currentSessionAtom } from '../state/session.atoms'

export interface ProgressOverlayProps {
  visible: boolean
  phase: 'loading' | 'decoding' | 'processing' | 'exporting'
  progress?: number // 0-100
  message?: string
  recoveryHint?: string
  className?: string
}

export function ProgressOverlay({
  visible,
  phase,
  progress,
  message,
  recoveryHint,
  className,
}: ProgressOverlayProps) {
  const { t } = useI18n()
  const session = useAtomValue(currentSessionAtom)
  const phaseLabels: Record<ProgressOverlayProps['phase'], string> = {
    loading: t('raw.progress.loading'),
    decoding: t('raw.progress.decoding'),
    processing: t('raw.progress.processing'),
    exporting: t('raw.progress.exporting'),
  }
  const formatWorkerCount = (count: number) =>
    count === 1
      ? t('raw.progress.workerOne')
      : t('raw.progress.workerMany', { count })
  const stripProgress =
    phase === 'exporting' ? session?.exportState.lastProgress : undefined
  const activePlan =
    phase === 'exporting' ? session?.exportState.activePlan : undefined
  const exportProfileCopy =
    activePlan?.runtimeMemoryProfile === 'low-memory'
      ? t('raw.progress.safeExport', {
          rows: activePlan.preferredRows,
          workers: formatWorkerCount(activePlan.concurrency),
        })
      : activePlan
        ? t('raw.progress.fastExport', {
            rows: activePlan.preferredRows,
            workers: formatWorkerCount(activePlan.concurrency),
          })
        : undefined
  const normalizedProgress =
    typeof progress === 'number' && Number.isFinite(progress)
      ? Math.min(100, Math.max(0, progress))
      : null
  const ringProgress =
    normalizedProgress === null ? 32 : Math.max(8, normalizedProgress)

  return (
    <AnimatePresence>
      {visible && (
        <m.div
          className={clsxm(
            'absolute inset-0 z-50 flex items-center justify-center bg-[oklch(0.14_0.018_76_/_0.82)]',
            className,
          )}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={Spring.presets.smooth}
        >
          <m.div
            className="flex flex-col items-center gap-4 rounded-lg border border-[oklch(0.97_0.014_86_/_0.16)] bg-[oklch(0.16_0.018_76_/_0.78)] px-7 py-6 shadow-[0_24px_80px_oklch(0.1_0.02_76_/_0.32)]"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={Spring.presets.snappy}
          >
            <div className="relative size-[4.5rem]">
              <svg
                data-progress-indicator
                className="size-full -rotate-90"
                viewBox="0 0 64 64"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <circle
                  cx="32"
                  cy="32"
                  r="28"
                  stroke="oklch(0.97 0.014 86 / 0.2)"
                  strokeWidth="5"
                />
                <circle
                  data-progress-arc
                  cx="32"
                  cy="32"
                  r="28"
                  stroke="oklch(0.78 0.16 63)"
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeDasharray="100"
                  strokeDashoffset={100 - ringProgress}
                  pathLength="100"
                />
              </svg>

              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xs font-semibold tabular-nums text-[oklch(0.97_0.014_86)]">
                  {normalizedProgress === null
                    ? '...'
                    : `${Math.round(normalizedProgress)}%`}
                </span>
              </div>
            </div>

            <div className="text-center">
              <p className="text-sm font-medium text-[oklch(0.97_0.014_86)]">
                {message || phaseLabels[phase]}
              </p>

              {recoveryHint && (
                <p className="mt-2 max-w-xs text-center text-xs text-[oklch(0.91_0.02_86_/_0.82)]">
                  {recoveryHint}
                </p>
              )}

              {stripProgress && (
                <p className="mt-2 text-xs tabular-nums text-[oklch(0.91_0.02_86_/_0.82)]">
                  {t('raw.progress.strip', {
                    completed: stripProgress.completedStrips,
                    total: stripProgress.totalStrips,
                  })}
                </p>
              )}

              {exportProfileCopy && (
                <p className="mt-2 text-xs tabular-nums text-[oklch(0.91_0.02_86_/_0.82)]">
                  {exportProfileCopy}
                </p>
              )}

              {normalizedProgress !== null && (
                <div className="mt-3 h-1.5 w-48 overflow-hidden rounded-full bg-[oklch(0.97_0.014_86_/_0.18)]">
                  <m.div
                    className="h-full rounded-full bg-[oklch(0.78_0.16_63)]"
                    initial={{ width: 0 }}
                    animate={{ width: `${normalizedProgress}%` }}
                    transition={{ duration: 0.3, ease: 'easeOut' }}
                  />
                </div>
              )}
            </div>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  )
}

/**
 * Error overlay component.
 */
export function ErrorOverlay({
  visible,
  message,
  onDismiss,
  className,
}: {
  visible: boolean
  message: string
  onDismiss: () => void
  className?: string
}) {
  const { t } = useI18n()

  return (
    <AnimatePresence>
      {visible && (
        <m.div
          className={clsxm(
            'absolute inset-0 z-50 flex items-center justify-center bg-[oklch(0.18_0.02_76_/_0.78)]',
            className,
          )}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={Spring.presets.smooth}
        >
          <m.div
            className="flex flex-col items-center gap-4 p-8 max-w-md text-center"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={Spring.presets.snappy}
          >
            <div className="size-16 rounded-full bg-red/10 flex items-center justify-center">
              <i className="i-mingcute-warning-line text-3xl text-red" />
            </div>

            <div>
              <h3 className="text-lg font-medium text-text">
                {t('raw.error.title')}
              </h3>
              <p className="text-sm text-text-secondary mt-1">{message}</p>
            </div>

            <button
              type="button"
              onClick={onDismiss}
              className="px-4 py-2 rounded-lg bg-fill hover:bg-fill-secondary text-sm font-medium text-text transition-colors"
            >
              {t('raw.error.dismiss')}
            </button>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  )
}

/**
 * Success toast notification.
 */
export function SuccessToast({
  visible,
  message,
  className,
}: {
  visible: boolean
  message: string
  className?: string
}) {
  return (
    <AnimatePresence>
      {visible && (
        <m.div
          className={clsxm(
            'fixed bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-3 rounded-lg bg-green/10 border border-green/20 shadow-lg z-50',
            className,
          )}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={Spring.presets.snappy}
        >
          <i className="i-mingcute-check-circle-fill text-lg text-green" />
          <span className="text-sm font-medium text-text">{message}</span>
        </m.div>
      )}
    </AnimatePresence>
  )
}
