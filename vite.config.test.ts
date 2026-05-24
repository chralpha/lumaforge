import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'

import { loadConfigFromFile } from 'vite'
import { describe, expect, it, vi } from 'vitest'

import { fetchImageDataUrl } from './scripts/build/image-data-url'

async function resolveViteConfig() {
  const result = await loadConfigFromFile(
    {
      command: 'serve',
      mode: 'development',
    },
    'vite.config.ts',
  )

  return result?.config
}

describe('vite config', () => {
  it('ignores repo-local agent worktrees in the dev watcher', async () => {
    const config = await resolveViteConfig()

    expect(config.server?.watch?.ignored).toEqual(
      expect.arrayContaining(['**/.worktrees/**', '**/.claude/worktrees/**']),
    )
  })

  it('falls back to a local OG image source when the remote hero cannot be fetched', async () => {
    const fallbackImage = await readFile('public/favicon.png')
    const onFallback = vi.fn()

    await expect(
      fetchImageDataUrl('https://images.example.invalid/photo.jpg', {
        fallbackPath: 'public/favicon.png',
        fetchImpl: vi.fn(async () => {
          throw new Error('network unavailable')
        }),
        onFallback,
      }),
    ).resolves.toBe(
      `data:image/png;base64,${Buffer.from(fallbackImage).toString('base64')}`,
    )
    expect(onFallback).toHaveBeenCalledWith(
      expect.stringContaining('network unavailable'),
    )
  })
})
