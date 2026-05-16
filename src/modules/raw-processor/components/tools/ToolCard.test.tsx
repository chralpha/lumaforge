import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'

import { jotaiStore } from '~/lib/jotai'

import {
  DEFAULT_OPEN_TOOL_CARDS,
  toolCardOpenAtom,
} from '../../state/tool-card.atoms'
import { ToolCard, ToolCardStack } from './ToolCard'

afterEach(() => {
  jotaiStore.set(toolCardOpenAtom, DEFAULT_OPEN_TOOL_CARDS)
})

function setup() {
  return render(
    <ToolCardStack ariaLabel="RAW finishing controls">
      <ToolCard id="tone" title="Tone">
        <p>tone body</p>
      </ToolCard>
      <ToolCard id="histogram" title="Histogram" meta={<span>Clip 3</span>}>
        <p>hist body</p>
      </ToolCard>
    </ToolCardStack>,
  )
}

describe('toolCard', () => {
  it('renders an open card as a region named only by its title', () => {
    setup()
    const tone = screen.getByRole('region', { name: 'Tone' })
    expect(tone).toBeInTheDocument()
    expect(screen.getByText('tone body')).toBeInTheDocument()
  })

  it('keeps a collapsed card body out of the document', () => {
    setup()
    expect(screen.queryByText('hist body')).not.toBeInTheDocument()
  })

  it('toggles open state and aria-expanded on trigger click', async () => {
    const user = userEvent.setup()
    setup()
    const trigger = screen.getByRole('button', { name: 'Histogram' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(await screen.findByText('hist body')).toBeInTheDocument()
  })

  it('persists open state to the shared atom', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByRole('button', { name: 'Histogram' }))
    expect(jotaiStore.get(toolCardOpenAtom)).toEqual(
      expect.arrayContaining(['tone', 'histogram']),
    )
  })

  it('exposes the stack container with the finishing aria label', () => {
    setup()
    expect(
      screen.getByRole('group', { name: 'RAW finishing controls' }),
    ).toBeInTheDocument()
  })
})
