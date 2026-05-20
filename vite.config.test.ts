import { loadConfigFromFile } from 'vite'
import { describe, expect, it } from 'vitest'

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
})
