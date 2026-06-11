import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { OnlineLutSourceResourceList } from './OnlineLutSourceResourceList'

const resource = {
  id: 'res-1',
  label: 'Fixture Source',
  url: 'https://example.com/catalog.json',
} as never

const entry = {
  id: 'entry-1',
  title: 'Slate Film 33',
  sourceUrl: 'https://example.com/entry-1.json',
  sourceType: 'catalog-entry',
  cube: {
    url: 'https://example.com/entry-1.cube',
    sha256: 'a'.repeat(64),
    bytes: 970_382,
  },
  tags: [],
  resourceId: 'res-1',
} as never

function renderList(
  overrides: {
    failedEntryId?: string | null
    loadingEntryId?: string | null
    entryLoadProgress?: {
      entryId: string
      receivedBytes: number
      totalBytes?: number
    } | null
    onCancelEntryLoad?: () => void
  } = {},
) {
  return render(
    <OnlineLutSourceResourceList
      resources={[resource]}
      isLoading={false}
      activeResourceId={null}
      loadingEntryId={overrides.loadingEntryId ?? null}
      failedEntryId={overrides.failedEntryId ?? null}
      entryLoadProgress={overrides.entryLoadProgress ?? null}
      entriesByResourceId={new Map([['res-1', [entry]]])}
      issuesByResourceId={new Map()}
      openResourceId={null}
      browserId="browser-1"
      onOpenResource={vi.fn()}
      onCloseResource={vi.fn()}
      onRefreshResource={vi.fn()}
      onRemoveResource={vi.fn()}
      onEntryLoad={vi.fn()}
      onCancelEntryLoad={overrides.onCancelEntryLoad ?? vi.fn()}
      setOpenButtonRef={vi.fn()}
    />,
  )
}

describe('onlineLutSourceResourceList failure state', () => {
  it('marks the failed entry and keeps it clickable for retry', () => {
    const { container } = renderList({ failedEntryId: 'entry-1' })

    const failed = container.querySelector('[data-raw-lut-entry-failed="true"]')
    expect(failed).not.toBeNull()
    expect(failed).not.toBeDisabled()
    expect(failed?.getAttribute('aria-label')).toContain('Slate Film 33')
  })

  it('renders no failure marker by default', () => {
    const { container } = renderList()

    expect(container.querySelector('[data-raw-lut-entry-failed]')).toBeNull()
  })
})

describe('onlineLutSourceResourceList download feedback', () => {
  it('shows the catalog-declared size on entries at rest', () => {
    const { container } = renderList()

    expect(container.textContent).toContain('947.6 KB')
  })

  it('shows determinate progress and cancels on click while loading', () => {
    const onCancelEntryLoad = vi.fn()
    const { container } = renderList({
      loadingEntryId: 'entry-1',
      entryLoadProgress: {
        entryId: 'entry-1',
        receivedBytes: 485_191,
        totalBytes: 970_382,
      },
      onCancelEntryLoad,
    })

    const bar = container.querySelector('[role="progressbar"]')
    expect(bar).toHaveAttribute('aria-valuenow', '50')

    const loadingButton = container.querySelector(
      '[data-raw-lut-entry-loading="true"]',
    )
    expect(loadingButton).not.toBeDisabled()
    expect(loadingButton?.getAttribute('aria-label')).toContain('Cancel')

    fireEvent.click(loadingButton!)
    expect(onCancelEntryLoad).toHaveBeenCalledTimes(1)
  })
})
