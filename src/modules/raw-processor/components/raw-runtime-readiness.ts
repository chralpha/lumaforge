import type { Translate } from '~/lib/i18n'
import type { PrewarmState } from '~/lib/raw/runtime-adapter'

export type RawRuntimeReadinessState = PrewarmState

export function getRawRuntimeReadinessCopy(
  t: Translate,
  state: RawRuntimeReadinessState,
) {
  if (state === 'ready') {
    return {
      label: t('raw.runtime.ready'),
      detail: t('raw.runtime.readyDetail'),
    }
  }

  if (state === 'failed') {
    return {
      label: t('raw.runtime.retry'),
      detail: t('raw.runtime.retryDetail'),
    }
  }

  if (state === 'pending') {
    return {
      label: t('raw.runtime.pending'),
      detail: t('raw.runtime.pendingDetail'),
    }
  }

  return {
    label: t('raw.runtime.idle'),
    detail: t('raw.runtime.idleDetail'),
  }
}
