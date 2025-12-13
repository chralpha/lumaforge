/**
 * Progress overlay component for loading/processing states.
 */

import { AnimatePresence, m } from 'motion/react'

import { clsxm } from '~/lib/cn'
import { Spring } from '~/lib/spring'

export interface ProgressOverlayProps {
  visible: boolean
  phase: 'loading' | 'decoding' | 'processing' | 'exporting'
  progress?: number // 0-100
  message?: string
  className?: string
}

const phaseLabels: Record<ProgressOverlayProps['phase'], string> = {
  loading: 'Loading file...',
  decoding: 'Decoding RAW...',
  processing: 'Processing image...',
  exporting: 'Exporting...',
}

export function ProgressOverlay({
  visible,
  phase,
  progress,
  message,
  className,
}: ProgressOverlayProps) {
  return (
    <AnimatePresence>
      {visible && (
        <m.div
          className={clsxm(
            'absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-50',
            className,
          )}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={Spring.presets.smooth}
        >
          <m.div
            className="flex flex-col items-center gap-4 p-8"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={Spring.presets.snappy}
          >
            {/* Spinner */}
            <div className="relative size-16">
              <svg
                className="animate-spin"
                viewBox="0 0 64 64"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <circle
                  cx="32"
                  cy="32"
                  r="28"
                  className="stroke-fill"
                  strokeWidth="4"
                />
                <circle
                  cx="32"
                  cy="32"
                  r="28"
                  className="stroke-accent"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray="176"
                  strokeDashoffset="132"
                />
              </svg>

              {/* Progress percentage */}
              {progress !== undefined && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-xs font-medium text-text tabular-nums">
                    {Math.round(progress)}%
                  </span>
                </div>
              )}
            </div>

            {/* Phase label */}
            <div className="text-center">
              <p className="text-sm font-medium text-text">
                {message || phaseLabels[phase]}
              </p>

              {/* Progress bar */}
              {progress !== undefined && (
                <div className="mt-3 w-48 h-1.5 bg-fill rounded-full overflow-hidden">
                  <m.div
                    className="h-full bg-accent rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
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
  return (
    <AnimatePresence>
      {visible && (
        <m.div
          className={clsxm(
            'absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-50',
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
              <h3 className="text-lg font-medium text-text">Error</h3>
              <p className="text-sm text-text-secondary mt-1">{message}</p>
            </div>

            <button
              type="button"
              onClick={onDismiss}
              className="px-4 py-2 rounded-lg bg-fill hover:bg-fill-secondary text-sm font-medium text-text transition-colors"
            >
              Dismiss
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
