import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { syncNativeArtifactPackage } from './sync-artifact-package.mjs'
import { verifyNativeArtifactPackage } from './verify-artifact-package.mjs'

const tempDirs = []

async function makeTempProject() {
  const root = await mkdtemp(join(tmpdir(), 'lumaforge-native-package-'))
  tempDirs.push(root)
  return root
}

async function writeFixture(root, file, contents = file) {
  const path = join(root, file)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, contents)
}

async function writeSourceRuntimeFixtures(root) {
  const files = [
    'packages/luma-raw-runtime/dist/native/desktop/luma_raw.js',
    'packages/luma-raw-runtime/dist/native/desktop/luma_raw.wasm',
    'packages/luma-raw-runtime/dist/native/low-memory/luma_raw.js',
    'packages/luma-raw-runtime/dist/native/low-memory/luma_raw.wasm',
    'packages/luma-jpeg-runtime/dist/native/luma_jpeg.js',
    'packages/luma-jpeg-runtime/dist/native/luma_jpeg.wasm',
  ]
  await Promise.all(files.map((file) => writeFixture(root, file)))
  await writeFixture(
    root,
    'packages/luma-raw-runtime/dist/native/desktop/provenance.json',
    '{"runtime":"raw","profile":"desktop"}',
  )
  await writeFixture(
    root,
    'packages/luma-raw-runtime/dist/native/low-memory/provenance.json',
    '{"runtime":"raw","profile":"low-memory"}',
  )
  await writeFixture(
    root,
    'packages/luma-jpeg-runtime/dist/native/provenance.json',
    '{"runtime":"jpeg"}',
  )
  await writeFixture(root, 'LICENSE', 'GPL license')
  await writeFixture(
    root,
    'packages/luma-raw-runtime/THIRD_PARTY_NOTICES.md',
    'raw notices',
  )
  await writeFixture(
    root,
    'packages/luma-jpeg-runtime/THIRD_PARTY_NOTICES.md',
    'jpeg notices',
  )
  await writeFixture(
    root,
    'packages/luma-raw-runtime/THIRD_PARTY_LICENSES/LibRaw-LICENSE.LGPL.txt',
    'libraw license',
  )
  await writeFixture(
    root,
    'packages/luma-jpeg-runtime/THIRD_PARTY_LICENSES/libjpeg-turbo-LICENSE.md',
    'jpeg license',
  )
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true })),
  )
})

describe('native artifact package', () => {
  it('syncs publishable prebuilt native files and compliance notices', async () => {
    const root = await makeTempProject()
    await writeSourceRuntimeFixtures(root)

    await syncNativeArtifactPackage({ rootDir: root })

    await expect(
      readFile(
        join(
          root,
          'packages/luma-native-artifacts/native/desktop/luma_raw.wasm',
        ),
        'utf8',
      ),
    ).resolves.toBe(
      'packages/luma-raw-runtime/dist/native/desktop/luma_raw.wasm',
    )
    await expect(
      readFile(
        join(root, 'packages/luma-native-artifacts/native/provenance/raw.json'),
        'utf8',
      ),
    ).rejects.toThrow()
    await expect(
      readFile(
        join(
          root,
          'packages/luma-native-artifacts/native/provenance/raw-desktop.json',
        ),
        'utf8',
      ),
    ).resolves.toBe('{"runtime":"raw","profile":"desktop"}')
    await expect(
      readFile(
        join(
          root,
          'packages/luma-native-artifacts/native/provenance/raw-low-memory.json',
        ),
        'utf8',
      ),
    ).resolves.toBe('{"runtime":"raw","profile":"low-memory"}')
    await expect(
      readFile(
        join(
          root,
          'packages/luma-native-artifacts/THIRD_PARTY_LICENSES/libjpeg-turbo-LICENSE.md',
        ),
        'utf8',
      ),
    ).resolves.toBe('jpeg license')

    await expect(
      verifyNativeArtifactPackage({ rootDir: root }),
    ).resolves.toBeUndefined()
  })

  it('fails verification when a native artifact is missing', async () => {
    const root = await makeTempProject()
    await writeSourceRuntimeFixtures(root)
    await syncNativeArtifactPackage({ rootDir: root })
    await rm(
      join(
        root,
        'packages/luma-native-artifacts/native/low-memory/luma_raw.js',
      ),
    )

    await expect(
      verifyNativeArtifactPackage({ rootDir: root }),
    ).rejects.toThrow('Luma RAW runtime low-memory: luma_raw.js')
  })

  it('resolves the workspace root when package scripts run from the artifact package directory', async () => {
    const root = await makeTempProject()
    await writeFixture(
      root,
      'pnpm-workspace.yaml',
      'packages:\n  - packages/*\n',
    )
    await writeSourceRuntimeFixtures(root)
    await syncNativeArtifactPackage({ rootDir: root })

    await expect(
      verifyNativeArtifactPackage({
        rootDir: join(root, 'packages/luma-native-artifacts'),
      }),
    ).resolves.toBeUndefined()
  })
})
