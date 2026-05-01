import { describe, expect, it } from 'vitest'

import type { ExportCheckpointManifest } from './checkpoint-store'
import {
  createCheckpointStore,
  createMemoryCheckpointBackend,
  createOpfsCheckpointBackend,
} from './checkpoint-store'

function manifest(overrides: Partial<ExportCheckpointManifest> = {}) {
  return {
    version: 1,
    exportId: 'export-1',
    sourceFingerprint: {
      name: 'frame.RAF',
      size: 3,
      lastModified: 123,
      width: 11662,
      height: 8746,
      hashPrefixHex: 'abc',
    },
    fileName: 'frame.RAF',
    sourceSize: 3,
    sourceLastModified: 123,
    outputWidth: 11662,
    outputHeight: 8746,
    graphFingerprint: 'graph-1',
    profile: 'ios-safe',
    attempt: 1,
    preferredRows: 64,
    totalRows: 8746,
    recoveryMode: 'safe-retry',
    outputSink: 'opfs-file',
    sourceReacquisition: 'user-reselect-required',
    completedRowsForDiagnostics: 64,
    jpegState: 'restart-required',
    updatedAt: '2026-05-01T00:00:00.000Z',
    ...overrides,
  } satisfies ExportCheckpointManifest
}

class MockFileHandle {
  readonly kind = 'file' as const

  constructor(
    readonly name: string,
    private body = '',
    private readable = true,
  ) {}

  get textContent() {
    return this.body
  }

  setTextContent(text: string) {
    this.body = text
  }

  async getFile() {
    if (!this.readable) throw new Error(`unreadable:${this.name}`)

    return new File([this.body], this.name, { type: 'application/json' })
  }

  async createWritable() {
    const chunks: string[] = []

    return {
      write: async (chunk: BlobPart) => {
        chunks.push(String(chunk))
      },
      close: async () => {
        this.body = chunks.join('')
      },
    } as FileSystemWritableFileStream
  }
}

class MockDirectoryHandle {
  readonly kind = 'directory' as const
  readonly entriesByName = new Map<
    string,
    MockDirectoryHandle | MockFileHandle
  >()
  readonly removeCalls: Array<{
    name: string
    options?: FileSystemRemoveOptions
  }> = []

  constructor(readonly name: string) {}

  directory(name: string) {
    const entry = this.entriesByName.get(name)
    if (entry instanceof MockDirectoryHandle) return entry

    const directory = new MockDirectoryHandle(name)
    this.entriesByName.set(name, directory)
    return directory
  }

  file(name: string, body = '', readable = true) {
    const file = new MockFileHandle(name, body, readable)
    this.entriesByName.set(name, file)
    return file
  }

  async getDirectoryHandle(
    name: string,
    options?: FileSystemGetDirectoryOptions,
  ) {
    const entry = this.entriesByName.get(name)
    if (entry instanceof MockDirectoryHandle) return entry
    if (entry) throw new Error(`not-directory:${name}`)
    if (!options?.create) throw new Error(`missing-directory:${name}`)

    return this.directory(name)
  }

  async getFileHandle(name: string, options?: FileSystemGetFileOptions) {
    const entry = this.entriesByName.get(name)
    if (entry instanceof MockFileHandle) return entry
    if (entry) throw new Error(`not-file:${name}`)
    if (!options?.create) throw new Error(`missing-file:${name}`)

    return this.file(name)
  }

  async removeEntry(name: string, options?: FileSystemRemoveOptions) {
    this.removeCalls.push({ name, options })
    this.entriesByName.delete(name)
  }

  async *entries() {
    yield* this.entriesByName.entries()
  }
}

function storageFor(root: MockDirectoryHandle) {
  return {
    getDirectory: async () => root as unknown as FileSystemDirectoryHandle,
  } as StorageManager
}

describe('checkpoint store', () => {
  it('writes and scans active safe-retry manifests', async () => {
    const backend = createMemoryCheckpointBackend()
    const store = createCheckpointStore(backend)

    await store.writeActive(manifest())

    await expect(store.listActive()).resolves.toEqual([manifest()])
  })

  it('normalizes active manifests to MVP safe-retry semantics', async () => {
    const backend = createMemoryCheckpointBackend()
    const store = createCheckpointStore(backend)

    await store.writeActive(
      manifest({
        recoveryMode: 'row-resume',
        jpegState: 'resumable',
        nextRowForResume: 128,
        chunks: [{ index: 0, startRow: 0, rowCount: 128, byteLength: 4096 }],
      }),
    )

    await expect(store.listActive()).resolves.toEqual([
      manifest({
        recoveryMode: 'safe-retry',
        jpegState: 'restart-required',
      }),
    ])
  })

  it('rejects row-resume and resumable manifests in MVP recovery decisions', async () => {
    const backend = createMemoryCheckpointBackend()
    const store = createCheckpointStore(backend)
    const safe = manifest({ exportId: 'safe' })

    await backend.write(safe.exportId, safe)
    await backend.write(
      'row-resume',
      manifest({
        exportId: 'row-resume',
        recoveryMode: 'row-resume',
        jpegState: 'restart-required',
      }),
    )
    await backend.write(
      'resumable',
      manifest({
        exportId: 'resumable',
        recoveryMode: 'safe-retry',
        jpegState: 'resumable',
      }),
    )

    await expect(store.listSafeRetryCandidates()).resolves.toEqual([safe])
  })

  it('stores OPFS manifests under active export directories and removes recursively', async () => {
    const root = new MockDirectoryHandle('root')
    const backend = createOpfsCheckpointBackend(storageFor(root))
    const active = root.directory('.lumaforge-exports').directory('active')
    const current = manifest({ exportId: 'export-opfs' })

    active.directory('malformed-json').file('manifest.json', '{')
    active.directory('malformed-shape').file('manifest.json', '{"version":1}')
    active.directory('unreadable').file('manifest.json', '{}', false)

    await backend.write(current.exportId, current)

    const manifestFile = active
      .directory(current.exportId)
      .entriesByName.get('manifest.json')
    expect(manifestFile).toBeInstanceOf(MockFileHandle)
    expect((manifestFile as MockFileHandle).textContent).toBe(
      JSON.stringify(current),
    )
    await expect(backend.list()).resolves.toEqual([current])

    await backend.remove(current.exportId)

    expect(active.removeCalls).toEqual([
      { name: current.exportId, options: { recursive: true } },
    ])
    expect(active.entriesByName.has(current.exportId)).toBe(false)
  })

  it('removes only OPFS manifest files when preserving file-backed output', async () => {
    const root = new MockDirectoryHandle('root')
    const backend = createOpfsCheckpointBackend(storageFor(root))
    const store = createCheckpointStore(backend)
    const active = root.directory('.lumaforge-exports').directory('active')
    const current = manifest({ exportId: 'export-opfs' })

    await store.writeActive(current)
    active.directory('export-opfs').file('output.jpg', 'jpeg')

    await store.removeActiveManifest('export-opfs')

    await expect(store.listActive()).resolves.toEqual([])
    expect(
      active.directory('export-opfs').entriesByName.get('output.jpg'),
    ).toBeDefined()
  })
})
