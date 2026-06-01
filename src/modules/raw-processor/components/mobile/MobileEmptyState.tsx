import { FolderOpen, ImageUp } from 'lucide-react'
import { m } from 'motion/react'

import { useI18n } from '~/lib/i18n'

import type { RawRuntimeReadinessState } from '../raw-runtime-readiness'
import { getRawRuntimeReadinessCopy } from '../raw-runtime-readiness'

export interface MobileEmptyStateProps {
  prefersReduced: boolean
  runtimeReadinessState?: RawRuntimeReadinessState
  onPrepareRuntime?: () => void
  onReplaceFile: () => void
}

export function MobileEmptyState({
  prefersReduced,
  runtimeReadinessState,
  onPrepareRuntime,
  onReplaceFile,
}: MobileEmptyStateProps) {
  const { t } = useI18n()
  const runtimeReadiness = runtimeReadinessState
    ? getRawRuntimeReadinessCopy(t, runtimeReadinessState)
    : null

  return (
    <m.div
      key="mobile-empty"
      data-mobile-empty-state
      data-mobile-empty-variant="toolbar"
      className="raw-mobile-empty pointer-events-auto"
      initial={{ opacity: 0, y: prefersReduced ? 0 : 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: prefersReduced ? 0 : 12 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="raw-mobile-empty-hero" data-mobile-empty-hero>
        <span className="raw-mobile-empty-mark" aria-hidden="true">
          <ImageUp className="size-[30px]" strokeWidth={1.6} />
        </span>
        <div className="raw-mobile-empty-copy-block">
          <h1>{t('raw.onboarding.slogan')}</h1>
          <p className="raw-mobile-empty-copy">{t('raw.mobile.empty.copy')}</p>
        </div>
        <button
          type="button"
          disabled={
            runtimeReadinessState !== 'ready' &&
            runtimeReadinessState !== undefined
          }
          onClick={() => {
            onPrepareRuntime?.()
            onReplaceFile()
          }}
          onPointerEnter={onPrepareRuntime}
          onFocus={onPrepareRuntime}
          className="raw-mobile-empty-cta"
        >
          <FolderOpen aria-hidden="true" className="size-4" />
          {t('raw.mobile.empty.browse')}
        </button>
        {runtimeReadiness && (
          <div
            aria-live="polite"
            data-raw-runtime-readiness
            data-state={runtimeReadinessState}
            className="raw-mobile-empty-readiness"
          >
            <span
              className="raw-mobile-empty-readiness-dot"
              aria-hidden="true"
            />
            <strong>{runtimeReadiness.label}</strong>
            <span>{runtimeReadiness.detail}</span>
          </div>
        )}
        <div
          className="raw-mobile-empty-formats"
          aria-label="Supported RAW formats"
        >
          {t('raw.mobile.empty.formats')
            .split(' ')
            .map((format) => (
              <span key={format}>{format}</span>
            ))}
        </div>
      </div>
    </m.div>
  )
}
