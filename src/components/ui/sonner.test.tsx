import { render } from '@testing-library/react'
import { Toaster as Sonner } from 'sonner'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Toaster } from './sonner'

vi.mock('~/hooks/common', () => ({
  useThemeAtomValue: () => 'dark',
  useViewport: () => false,
}))

vi.mock('sonner', () => ({
  Toaster: vi.fn(() => null),
}))

describe('toaster', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('keeps app toast defaults while adding raw-route darkroom chrome overrides', () => {
    render(<Toaster />)

    const props = vi.mocked(Sonner).mock.calls[0]?.[0]
    const classNames = props?.toastOptions?.classNames

    expect(classNames?.toast).toContain('bg-background/80')
    expect(classNames?.toast).toContain(
      '[.luma-route-raw_&]:!bg-lf-on-photo-bg-strong',
    )
    expect(classNames?.toast).toContain(
      '[.luma-route-raw_&]:!border-lf-on-photo-bord-soft',
    )
    expect(classNames?.title).toContain(
      '[.luma-route-raw_&]:!text-lf-on-photo-ink',
    )
    expect(classNames?.description).toContain(
      '[.luma-route-raw_&]:!text-lf-on-photo-ink/68',
    )
    expect(classNames?.actionButton).toContain(
      '[.luma-route-raw_&]:!bg-lf-green',
    )
    expect(classNames?.closeButton).toContain(
      '[.luma-route-raw_&]:!text-lf-on-photo-ink/64',
    )
    expect(classNames?.closeButton).toContain('[.luma-route-raw_&]:!size-7')
    expect(classNames?.closeButton).toContain('[.luma-route-raw_&]:!rounded-md')
  })
})
