import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { I18nProvider } from '~/lib/i18n'
import { Component } from '~/pages/(main)/index.sync'

function renderLanding() {
  return render(
    <I18nProvider>
      <MemoryRouter>
        <Component />
      </MemoryRouter>
    </I18nProvider>,
  )
}

describe('landing hero structure (editorial darkroom redesign)', () => {
  beforeEach(() => {
    localStorage.setItem('lumaforge.locale', 'en')
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('renders a single compare strip as a figure (no duplicate panel)', () => {
    const { container } = renderLanding()

    const figure = screen.getByRole('figure', {
      name: 'LumaForge color workflow preview',
    })
    expect(figure).toBeInTheDocument()

    expect(within(figure).getByText('RAW preview')).toBeInTheDocument()
    expect(within(figure).getByText('Finished JPEG')).toBeInTheDocument()

    expect(container.querySelector('.lf-hero-panel')).toBeNull()
    expect(container.querySelector('.lf-compare-stage')).toBeNull()
    expect(container.querySelector('.lf-compare-finish')).toBeNull()
    expect(container.querySelector('.lf-contract-strip')).toBeNull()
  })

  it('renders the contract rail as an ordered list with six steps', () => {
    renderLanding()

    const rail = screen.getByRole('list', { name: 'Color contract checks' })
    expect(rail.tagName).toBe('OL')

    const items = within(rail).getAllByRole('listitem')
    expect(items).toHaveLength(6)
    expect(items[0]).toHaveTextContent('01')
    expect(items[0]).toHaveTextContent('RAW technical development')
    expect(items[5]).toHaveTextContent('06')
    expect(items[5]).toHaveTextContent('Rec.709 JPEG')
  })
})

describe('landing hero css contract', () => {
  it('does not reference any remote image host', () => {
    const cssPath = resolve(__dirname, '..', 'pages', '(main)', 'index.css')
    const css = readFileSync(cssPath, 'utf8')

    expect(css).not.toMatch(/images\.unsplash\.com/)
    expect(css).not.toMatch(/https?:\/\//)
  })

  it('does not retain the removed legacy hero selectors', () => {
    const cssPath = resolve(__dirname, '..', 'pages', '(main)', 'index.css')
    const css = readFileSync(cssPath, 'utf8')

    expect(css).not.toMatch(/\.lf-compare-finish\b/)
    expect(css).not.toMatch(/\.lf-hero-panel\b/)
    expect(css).not.toMatch(/\.lf-compare-stage\b/)
    expect(css).not.toMatch(/\.lf-contract-strip\b/)
  })
})
