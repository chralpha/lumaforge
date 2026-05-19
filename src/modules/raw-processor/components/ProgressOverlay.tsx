/**
 * Progress overlay component for loading/processing states.
 */

import { useAtomValue } from 'jotai'
import { AnimatePresence, m, useReducedMotion } from 'motion/react'

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
  const reduced = useReducedMotion() ?? false
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
            'absolute inset-0 z-50 flex items-center justify-center bg-[var(--color-stage-scrim)]',
            className,
          )}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={Spring.presets.smooth}
        >
          <m.div
            className="flex flex-col items-center gap-4 rounded-md border border-[var(--color-stage-hairline)] bg-[var(--color-stage-panel)] px-7 py-6 shadow-lg"
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={Spring.smooth(0.32)}
          >
            <div className="relative size-[4.5rem]">
              <m.svg
                data-progress-indicator
                data-indeterminate={normalizedProgress === null || undefined}
                className="size-full -rotate-90"
                viewBox="0 0 64 64"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
                animate={
                  normalizedProgress === null && !reduced
                    ? { rotate: 360 }
                    : { rotate: 0 }
                }
                transition={
                  normalizedProgress === null && !reduced
                    ? { duration: 0.9, ease: 'linear', repeat: Infinity }
                    : { duration: 0 }
                }
                style={{ transformOrigin: '50% 50%' }}
              >
                <circle
                  cx="32"
                  cy="32"
                  r="28"
                  stroke="var(--color-progress-track)"
                  strokeWidth="5"
                />
                <circle
                  data-progress-arc
                  cx="32"
                  cy="32"
                  r="28"
                  stroke="var(--color-progress)"
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeDasharray="100"
                  strokeDashoffset={
                    normalizedProgress === null ? 72 : 100 - ringProgress
                  }
                  pathLength="100"
                />
              </m.svg>

              {normalizedProgress !== null && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-xs font-semibold tabular-nums text-[var(--color-on-stage)]">
                    {`${Math.round(normalizedProgress)}%`}
                  </span>
                </div>
              )}
            </div>

            <div className="text-center">
              <p className="text-sm font-medium text-[var(--color-on-stage)]">
                {message || phaseLabels[phase]}
              </p>

              {recoveryHint && (
                <p className="mt-2 max-w-xs text-center text-xs text-[var(--color-on-stage-soft)]">
                  {recoveryHint}
                </p>
              )}

              {stripProgress && (
                <p className="mt-2 text-xs tabular-nums text-[var(--color-on-stage-soft)]">
                  {t('raw.progress.strip', {
                    completed: stripProgress.completedStrips,
                    total: stripProgress.totalStrips,
                  })}
                </p>
              )}

              {exportProfileCopy && (
                <p className="mt-2 text-xs tabular-nums text-[var(--color-on-stage-soft)]">
                  {exportProfileCopy}
                </p>
              )}

              {normalizedProgress !== null && (
                <div className="mt-3 h-1.5 w-48 overflow-hidden rounded-full bg-[var(--color-progress-track)]">
                  <m.div
                    className="h-full rounded-full bg-[var(--color-progress)]"
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
            'absolute inset-0 z-50 flex items-center justify-center bg-[var(--color-stage-scrim)]',
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
