import type { FC } from 'react'
import { Outlet, useLocation } from 'react-router'

import { Footer } from './components/common/Footer'
import { RootProviders } from './providers/root-providers'

export const App: FC = () => {
  const location = useLocation()
  const showFooter = location.pathname !== '/'

  return (
    <RootProviders>
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
