import type { FC } from 'react'
import { useLayoutEffect } from 'react'
import { Outlet, useLocation } from 'react-router'

import { Footer } from './components/common/Footer'
import { SeoMetadata } from './components/common/SeoMetadata'
import { RootProviders } from './providers/root-providers'

export function shouldShowAppFooter(pathname: string) {
  return pathname !== '/' && pathname !== '/raw' && pathname !== '/raw/'
}

function isRawRoutePath(pathname: string) {
  return pathname.replace(/\/+$/, '') === '/raw'
}

export function syncRouteSubstrate(pathname: string) {
  const rawPath = isRawRoutePath(pathname)
  const root = document.documentElement
  root.dataset.lumaRoute = rawPath ? 'raw' : 'app'
  root.classList.toggle('luma-route-raw', rawPath)

  const themeColor = document.querySelector("meta[name='theme-color']")
  if (themeColor) {
    themeColor.setAttribute('content', rawPath ? '#1d1914' : '#ece6dd')
  }
}

export const App: FC = () => {
  const location = useLocation()
  const showFooter = shouldShowAppFooter(location.pathname)

  useLayoutEffect(() => {
    syncRouteSubstrate(location.pathname)
  }, [location.pathname])

  return (
    <RootProviders>
      <SeoMetadata />
      <AppLayer />
      {showFooter && <Footer />}
    </RootProviders>
  )
}

const AppLayer = () => {
  const appIsReady = true
  return appIsReady ? <Outlet /> : <AppSkeleton />
}

const AppSkeleton = () => {
  return null
}
export default App
