import { useEffect } from 'react'
import { useLocation, useMatches } from 'react-router'

import { useI18n } from '~/lib/i18n'
import type { RouteSeoMetadata, SeoRouteHandle } from '~/lib/seo'
import { applyDocumentSeo } from '~/lib/seo'

function isSeoRouteHandle(handle: unknown): handle is SeoRouteHandle {
  return Boolean(
    handle && typeof handle === 'object' && 'seo' in handle && handle.seo,
  )
}

function getActiveRouteSeo(matches: ReturnType<typeof useMatches>) {
  for (const entry of [...matches].reverse()) {
    if (isSeoRouteHandle(entry.handle)) {
      return entry.handle.seo
    }
  }

  return null
}

function localizeRouteSeo(
  routeSeo: RouteSeoMetadata,
  t: ReturnType<typeof useI18n>['t'],
): RouteSeoMetadata {
  if (routeSeo.canonicalPath === '/') {
    return {
      ...routeSeo,
      title: t('seo.home.title'),
      description: t('seo.home.description'),
    }
  }

  if (routeSeo.canonicalPath === '/raw') {
    return {
      ...routeSeo,
      title: t('seo.raw.title'),
      description: t('seo.raw.description'),
    }
  }

  return routeSeo
}

function applyRuntimeSeo(routeSeo: RouteSeoMetadata) {
  applyDocumentSeo(routeSeo, {
    siteUrl: APP_SITE_URL,
    deployEnv: APP_DEPLOY_ENV,
  })
}

export function useRouteSeo(routeSeo: RouteSeoMetadata) {
  const { t, locale } = useI18n()

  useEffect(() => {
    applyRuntimeSeo(localizeRouteSeo(routeSeo, t))
  }, [locale, routeSeo, t])
}

export function SeoMetadata() {
  const matches = useMatches()
  const location = useLocation()
  const { t, locale } = useI18n()

  useEffect(() => {
    const routeSeo = getActiveRouteSeo(matches)
    if (!routeSeo) return
    applyRuntimeSeo(localizeRouteSeo(routeSeo, t))
  }, [locale, location.pathname, matches, t])

  return null
}
