import type { FC } from 'react'
import { Outlet, useLocation } from 'react-router'

import { Footer } from './components/common/Footer'
import { SeoMetadata } from './components/common/SeoMetadata'
import { RootProviders } from './providers/root-providers'

export function shouldShowAppFooter(pathname: string) {
  return pathname !== '/' && pathname !== '/raw' && pathname !== '/raw/'
}

export const App: FC = () => {
  const location = useLocation()
  const showFooter = shouldShowAppFooter(location.pathname)

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
