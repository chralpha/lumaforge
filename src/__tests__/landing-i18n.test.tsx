import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

describe('landing page i18n', () => {
  beforeEach(() => {
    localStorage.setItem('lumaforge.locale', 'zh-CN')
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('renders Chinese landing copy when the persisted locale is Chinese', () => {
    renderLanding()

    expect(screen.getByText('浏览器里的 RAW 成片工作台')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: '进入 RAW Lab' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /开始处理/ })).toBeInTheDocument()
  })

  it('lets the landing page switch back to English', async () => {
    const user = userEvent.setup()

    renderLanding()

    await user.click(screen.getByRole('button', { name: 'Switch to English' }))

    expect(screen.getByText('Browser RAW finishing lab')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Open RAW lab' }),
    ).toBeInTheDocument()
  })
})
