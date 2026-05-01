import { render, screen } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { describe, expect, it } from 'vitest'

import type { ImageSession } from '../model/session'
import { currentSessionAtom } from '../state/session.atoms'
import { ProgressOverlay } from './ProgressOverlay'

function renderOverlayWithActivePlan(
  activePlan: ImageSession['exportState']['activePlan'],
) {
  const store = createStore()
  store.set(currentSessionAtom, {
    id: 's1',
    exportState: {
      activePlan,
      lastProgress: undefined,
    },
  } as ImageSession)

  render(
    <Provider store={store}>
      <ProgressOverlay visible phase="exporting" />
    </Provider>,
  )
}

describe('progressOverlay', () => {
  it('labels low-memory mobile-balanced exports as safe exports', () => {
    renderOverlayWithActivePlan({
      profileName: 'mobile-balanced',
      preferredRows: 256,
      concurrency: 2,
      runtimeMemoryProfile: 'low-memory',
      outputSink: 'streaming',
      checkpointMode: 'safe-retry',
    })

    expect(
      screen.getByText('Safe export · 256 rows · 2 workers'),
    ).toBeInTheDocument()
  })

  it('labels desktop exports as high-performance exports', () => {
    renderOverlayWithActivePlan({
      profileName: 'desktop-fast',
      preferredRows: 1024,
      concurrency: 3,
      runtimeMemoryProfile: 'desktop',
      outputSink: 'streaming',
      checkpointMode: 'safe-retry',
    })

    expect(
      screen.getByText('High-performance export · 1024 rows · 3 workers'),
    ).toBeInTheDocument()
  })
})
