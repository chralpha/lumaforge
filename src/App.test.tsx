import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { shouldShowAppFooter, syncRouteSubstrate } from './App'

vi.mock('./components/common/Footer', () => ({
  Footer: () => null,
}))

afterEach(() => {
  document.documentElement.classList.remove('luma-route-raw')
  document.documentElement.removeAttribute('data-luma-route')
  document.head.innerHTML = ''
})

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

describe('syncRouteSubstrate', () => {
  it('sets the dark RAW route substrate before the route paints', () => {
    document.head.innerHTML = '<meta name="theme-color" content="#ece6dd" />'

    syncRouteSubstrate('/raw/')

    expect(document.documentElement).toHaveClass('luma-route-raw')
    expect(document.documentElement.dataset.lumaRoute).toBe('raw')
    expect(
      document.head
        .querySelector('meta[name="theme-color"]')
        ?.getAttribute('content'),
    ).toBe('#1d1914')
  })

  it('restores the app substrate outside the RAW route', () => {
    document.head.innerHTML = '<meta name="theme-color" content="#1d1914" />'
    document.documentElement.classList.add('luma-route-raw')
    document.documentElement.dataset.lumaRoute = 'raw'

    syncRouteSubstrate('/')

    expect(document.documentElement).not.toHaveClass('luma-route-raw')
    expect(document.documentElement.dataset.lumaRoute).toBe('app')
    expect(
      document.head
        .querySelector('meta[name="theme-color"]')
        ?.getAttribute('content'),
    ).toBe('#ece6dd')
  })
})
