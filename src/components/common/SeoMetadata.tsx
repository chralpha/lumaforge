import { useEffect } from 'react'
import { useLocation, useMatches } from 'react-router'

import type {RouteSeoMetadata, SeoRouteHandle} from '~/lib/seo';
import {
  applyDocumentSeo
} from '~/lib/seo'

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

function applyRuntimeSeo(routeSeo: RouteSeoMetadata) {
  applyDocumentSeo(routeSeo, {
    siteUrl: APP_SITE_URL,
    deployEnv: APP_DEPLOY_ENV,
  })
}

export function useRouteSeo(routeSeo: RouteSeoMetadata) {
  useEffect(() => {
    applyRuntimeSeo(routeSeo)
  }, [routeSeo])
}

export function SeoMetadata() {
  const matches = useMatches()
  const location = useLocation()

  useEffect(() => {
    const routeSeo = getActiveRouteSeo(matches)
    if (!routeSeo) return
    applyRuntimeSeo(routeSeo)
  }, [location.pathname, matches])

  return null
}
