import { render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { App } from './App'
import { ErrorElement } from './components/common/ErrorElement'
import { NotFound } from './components/common/NotFound'
import { applyDocumentSeo, HOME_ROUTE_SEO } from './lib/seo'

vi.mock('./components/common/Footer', () => ({
  Footer: () => null,
}))

vi.mock('./providers/root-providers', () => ({
  RootProviders: ({ children }: { children: ReactNode }) => children,
}))

function renderRoute(initialEntry: string) {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <App />,
        children: [
          {
            path: '',
            Component: () => <div>Home</div>,
            handle: {
              seo: {
                title: 'LumaForge | Browser-Local RAW Photo Lab',
                description:
                  'Drop in a camera RAW file, preview it locally, apply a built-in look or declared LUT contract, and export a full-resolution JPEG in the browser.',
                canonicalPath: '/',
                robots: 'index, follow',
              },
            },
          },
          {
            path: 'raw',
            Component: () => <div>RAW lab</div>,
            handle: {
              seo: {
                title: 'RAW Lab | LumaForge',
                description:
                  'Open the browser-local RAW lab to preview camera files, compare looks, and export a color-safe full-resolution JPEG.',
                canonicalPath: '/raw',
                robots: 'index, follow',
              },
            },
          },
        ],
        errorElement: <ErrorElement />,
      },
      {
        path: '*',
        element: <NotFound />,
      },
    ],
    {
      initialEntries: [initialEntry],
    },
  )

  return render(<RouterProvider router={router} />)
}

function getMetaContent(selector: string) {
  return document.head.querySelector(selector)?.getAttribute('content')
}

function getCanonicalHref() {
  return document.head
    .querySelector('link[rel="canonical"]')
    ?.getAttribute('href')
}

function getTitleNodes() {
  return [...document.head.querySelectorAll('title')]
}

describe('route SEO metadata', () => {
  beforeEach(() => {
    document.title = 'Vite App'
    document.head.innerHTML = ''
  })

  it('sets the home route title, description, and canonical URL', async () => {
    renderRoute('/')

    await waitFor(() => {
      expect(document.title).toBe('LumaForge | Browser-Local RAW Photo Lab')
    })

    expect(getMetaContent('meta[name="description"]')).toBe(
      'Drop in a camera RAW file, preview it locally, apply a built-in look or declared LUT contract, and export a full-resolution JPEG in the browser.',
    )
    expect(getMetaContent('meta[property="og:title"]')).toBe(
      'LumaForge | Browser-Local RAW Photo Lab',
    )
    expect(getCanonicalHref()).toBe('https://luma.ichr.me/')
    expect(getTitleNodes()).toHaveLength(1)
    expect(getTitleNodes()[0]?.textContent).toBe(
      'LumaForge | Browser-Local RAW Photo Lab',
    )
  })

  it('sets RAW lab metadata on the direct tool route', async () => {
    renderRoute('/raw')

    await screen.findByText('RAW lab')
    await waitFor(() => {
      expect(document.title).toBe('RAW Lab | LumaForge')
    })

    expect(getMetaContent('meta[name="description"]')).toBe(
      'Open the browser-local RAW lab to preview camera files, compare looks, and export a color-safe full-resolution JPEG.',
    )
    expect(getMetaContent('meta[property="og:url"]')).toBe(
      'https://luma.ichr.me/raw',
    )
    expect(getCanonicalHref()).toBe('https://luma.ichr.me/raw')
    expect(getTitleNodes()).toHaveLength(1)
    expect(getTitleNodes()[0]?.textContent).toBe('RAW Lab | LumaForge')
  })

  it('marks unknown routes as non-indexable', async () => {
    renderRoute('/missing-route')

    await waitFor(() => {
      expect(document.title).toBe('Page Not Found | LumaForge')
    })

    expect(getMetaContent('meta[name="robots"]')).toBe('noindex, nofollow')
    expect(getCanonicalHref()).toBe('https://luma.ichr.me/missing-route')
    expect(getTitleNodes()).toHaveLength(1)
    expect(getTitleNodes()[0]?.textContent).toBe('Page Not Found | LumaForge')
  })

  it('preserves the title node when replacing managed SEO tags on hydration', () => {
    document.head.innerHTML = `
      <title data-lf-seo="true">LumaForge | Browser-Local RAW Photo Lab</title>
      <meta
        name="description"
        content="Drop in a camera RAW file, preview it locally, apply a built-in look or declared LUT contract, and export a full-resolution JPEG in the browser."
        data-lf-seo="true"
      />
    `

    applyDocumentSeo(HOME_ROUTE_SEO, {
      siteUrl: 'https://luma.ichr.me',
      deployEnv: 'production',
    })

    expect(document.title).toBe('LumaForge | Browser-Local RAW Photo Lab')
    expect(getTitleNodes()).toHaveLength(1)
    expect(getTitleNodes()[0]?.textContent).toBe(
      'LumaForge | Browser-Local RAW Photo Lab',
    )
  })
})
