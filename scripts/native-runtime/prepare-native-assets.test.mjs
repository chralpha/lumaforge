import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { prepareNativeRuntimeAssets } from './prepare-native-assets.mjs'

const tempDirs = []

async function makeTempProject() {
  const root = await mkdtemp(join(tmpdir(), 'lumaforge-native-prepare-'))
  tempDirs.push(root)
  await writeFixture(root, 'pnpm-workspace.yaml', 'packages:\n  - packages/*\n')
  await writeFixture(
    root,
    'packages/luma-native-artifacts/package.json',
    JSON.stringify({
      name: '@lumaforge/luma-native-artifacts',
      version: '0.0.1',
    }),
  )
  return root
}

async function writeFixture(root, file, contents = file) {
  const path = join(root, file)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, contents)
}

async function writePrebuiltArtifacts(root) {
  await Promise.all(
    [
      'packages/luma-native-artifacts/native/desktop/luma_raw.js',
      'packages/luma-native-artifacts/native/desktop/luma_raw.wasm',
      'packages/luma-native-artifacts/native/low-memory/luma_raw.js',
      'packages/luma-native-artifacts/native/low-memory/luma_raw.wasm',
      'packages/luma-native-artifacts/native/luma_jpeg.js',
      'packages/luma-native-artifacts/native/luma_jpeg.wasm',
    ].map((file) => writeFixture(root, file)),
  )
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true })),
  )
})

describe('prepare native runtime assets', () => {
  it('fetches the versioned prebuilt package when prebuilt assets are missing', async () => {
    const root = await makeTempProject()
    const fetchedPackages = []

    const assetSets = await prepareNativeRuntimeAssets({
      rootDir: root,
      mode: 'prebuilt',
      fetchPrebuiltAssets: async ({ packageSpec }) => {
        fetchedPackages.push(packageSpec)
        await writePrebuiltArtifacts(root)
      },
    })

    expect(fetchedPackages).toEqual(['@lumaforge/luma-native-artifacts@0.0.1'])
    expect(assetSets.map((assetSet) => assetSet.source)).toEqual([
      'prebuilt',
      'prebuilt',
      'prebuilt',
    ])
  })

  it('fetches prebuilt assets in auto mode when source artifacts are missing too', async () => {
    const root = await makeTempProject()
    const fetchedPackages = []

    const assetSets = await prepareNativeRuntimeAssets({
      rootDir: root,
      fetchPrebuiltAssets: async ({ packageSpec }) => {
        fetchedPackages.push(packageSpec)
        await writePrebuiltArtifacts(root)
      },
    })

    expect(fetchedPackages).toEqual(['@lumaforge/luma-native-artifacts@0.0.1'])
    expect(assetSets.map((assetSet) => assetSet.source)).toEqual([
      'prebuilt',
      'prebuilt',
      'prebuilt',
    ])
  })
})
