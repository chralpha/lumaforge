import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { shouldShowAppFooter } from './App'

vi.mock('./components/common/Footer', () => ({
  Footer: () => null,
}))

vi.mock('./providers/root-providers', () => ({
  RootProviders: ({ children }: { children: ReactNode }) => children,
}))

describe('shouldShowAppFooter', () => {
  it('hides the footer on the root route', () => {
    expect(shouldShowAppFooter('/')).toBe(false)
  })

  it('hides the footer on the RAW route', () => {
    expect(shouldShowAppFooter('/raw')).toBe(false)
  })

  it('hides the footer on the trailing-slash RAW route', () => {
    expect(shouldShowAppFooter('/raw/')).toBe(false)
  })

  it('shows the footer on the profiles route', () => {
    expect(shouldShowAppFooter('/profiles')).toBe(true)
  })

  it('shows the footer on the about route', () => {
    expect(shouldShowAppFooter('/about')).toBe(true)
  })
})
