import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  assertNativeRuntimeAssets,
  resolveNativeRuntimeAssets,
} from './assets.mjs'

const tempDirs = []

async function makeTempProject() {
  const root = await mkdtemp(join(tmpdir(), 'lumaforge-native-assets-'))
  tempDirs.push(root)
  return root
}

async function writeFiles(root, files) {
  await Promise.all(
    files.map(async (file) => {
      const path = join(root, file)
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, file)
    }),
  )
}

const requiredPrebuiltFiles = [
  'packages/luma-native-artifacts/native/desktop/luma_raw.js',
  'packages/luma-native-artifacts/native/desktop/luma_raw.wasm',
  'packages/luma-native-artifacts/native/low-memory/luma_raw.js',
  'packages/luma-native-artifacts/native/low-memory/luma_raw.wasm',
  'packages/luma-native-artifacts/native/luma_jpeg.js',
  'packages/luma-native-artifacts/native/luma_jpeg.wasm',
]

const requiredSourceFiles = [
  'packages/luma-raw-runtime/dist/native/desktop/luma_raw.js',
  'packages/luma-raw-runtime/dist/native/desktop/luma_raw.wasm',
  'packages/luma-raw-runtime/dist/native/low-memory/luma_raw.js',
  'packages/luma-raw-runtime/dist/native/low-memory/luma_raw.wasm',
  'packages/luma-jpeg-runtime/dist/native/luma_jpeg.js',
  'packages/luma-jpeg-runtime/dist/native/luma_jpeg.wasm',
]

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true })),
  )
})

describe('native runtime asset resolution', () => {
  it('prefers prebuilt package assets when they are available', async () => {
    const root = await makeTempProject()
    await writeFiles(root, [...requiredPrebuiltFiles, ...requiredSourceFiles])

    const assetSets = resolveNativeRuntimeAssets({ rootDir: root })

    expect(assetSets.map((assetSet) => assetSet.source)).toEqual([
      'prebuilt',
      'prebuilt',
      'prebuilt',
    ])
    expect(assetSets.map((assetSet) => assetSet.sourceDir)).toEqual([
      join(root, 'packages/luma-native-artifacts/native/desktop'),
      join(root, 'packages/luma-native-artifacts/native/low-memory'),
      join(root, 'packages/luma-native-artifacts/native'),
    ])
  })

  it('uses workspace source native assets when source mode is explicit', async () => {
    const root = await makeTempProject()
    await writeFiles(root, [...requiredPrebuiltFiles, ...requiredSourceFiles])

    const assetSets = resolveNativeRuntimeAssets({
      rootDir: root,
      mode: 'source',
    })

    expect(assetSets.map((assetSet) => assetSet.source)).toEqual([
      'source',
      'source',
      'source',
    ])
    expect(assetSets.map((assetSet) => assetSet.sourceDir)).toEqual([
      join(root, 'packages/luma-raw-runtime/dist/native/desktop'),
      join(root, 'packages/luma-raw-runtime/dist/native/low-memory'),
      join(root, 'packages/luma-jpeg-runtime/dist/native'),
    ])
  })

  it('explains how to recover when prebuilt and source assets are missing', async () => {
    const root = await makeTempProject()

    expect(() =>
      assertNativeRuntimeAssets(resolveNativeRuntimeAssets({ rootDir: root })),
    ).toThrow(
      /Install @lumaforge\/luma-native-artifacts or run `pnpm native:build`/,
    )
  })
})
