import type { RawRenderExposure } from '@lumaforge/luma-color-runtime'
import { getLUTColorProfile } from '@lumaforge/luma-color-runtime'
import { act, renderHook, waitFor } from '@testing-library/react'
import { Provider } from 'jotai'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { resetToDefaults } from '~/atoms/raw-processor'
import type { ExportCheckpointManifest } from '~/lib/export/checkpoint-store'
import type { FileBackedOutputResult } from '~/lib/export/output-sink'
import {
  createBlobOutputResult,
  createMemoryFileBackedOutputResult,
  materializeOutputBlob,
} from '~/lib/export/output-sink'
import { jotaiStore } from '~/lib/jotai'
import {
  getStoredLUTContractSelection,
  getStoredLUTProfileSelection,
} from '~/lib/lut/profile-resolution'
import type { OnlineLUTEntry } from '~/lib/profiles/catalog'
import {
  fetchCachedBytesWithLimit,
  fetchVerifiedCubeAsset,
} from '~/lib/profiles/fetch'
import type { DecodedImage } from '~/lib/raw/decoder'

import { currentSessionAtom } from '../state/session.atoms'
import { useRawProcessor } from './useRawProcessor'

const rawRuntimeAdapterMock = vi.hoisted(() => ({
  openSession: vi.fn(),
  extractEmbeddedPreview: vi.fn(),
  decodeQuickRaw: vi.fn(),
  decodeBoundedHqRaw: vi.fn(),
  probeExportCapability: vi.fn(),
}))

const toastMock = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
}))

const exportSystemMock = vi.hoisted(() => ({
  runFullResolutionExportJob: vi.fn(),
}))

const checkpointStoreMock = vi.hoisted(() => ({
  backend: {},
  createCheckpointStore: vi.fn(),
  createOpfsCheckpointBackend: vi.fn(),
  listSafeRetryCandidates: vi.fn(),
  writeActive: vi.fn(),
  removeActiveManifest: vi.fn(),
}))

const sourceFingerprintMock = vi.hoisted(() => ({
  createSourceFingerprint: vi.fn(),
  sourceFingerprintMatches: vi.fn(),
}))

const onlineProfileFetchMock = vi.hoisted(() => ({
  fetchCachedBytesWithLimit: vi.fn(),
  fetchVerifiedCubeAsset: vi.fn(),
}))

vi.mock('~/lib/raw/runtime-adapter', () => ({
  rawRuntimeAdapter: rawRuntimeAdapterMock,
}))

vi.mock('sonner', () => ({
  toast: toastMock,
}))

vi.mock('../services/export-system', async () => {
  const actual = await vi.importActual('../services/export-system')
  return {
    ...actual,
    runFullResolutionExportJob: exportSystemMock.runFullResolutionExportJob,
  }
})

vi.mock('~/lib/export/checkpoint-store', async () => {
  const actual = await vi.importActual('~/lib/export/checkpoint-store')
  return {
    ...actual,
    createCheckpointStore: checkpointStoreMock.createCheckpointStore,
    createOpfsCheckpointBackend:
      checkpointStoreMock.createOpfsCheckpointBackend,
  }
})

vi.mock('~/lib/export/source-fingerprint', async () => {
  const actual = await vi.importActual('~/lib/export/source-fingerprint')
  return {
    ...actual,
    createSourceFingerprint: sourceFingerprintMock.createSourceFingerprint,
    sourceFingerprintMatches: sourceFingerprintMock.sourceFingerprintMatches,
  }
})

vi.mock('~/lib/profiles/fetch', async () => {
  const actual = await vi.importActual('~/lib/profiles/fetch')
  return {
    ...actual,
    fetchCachedBytesWithLimit: onlineProfileFetchMock.fetchCachedBytesWithLimit,
    fetchVerifiedCubeAsset: onlineProfileFetchMock.fetchVerifiedCubeAsset,
  }
})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve
    reject = innerReject
  })

  return { promise, resolve, reject }
}

const defaultSourceDimensions = { width: 6048, height: 4024 }

function createDecodedImage(
  source: 'quick' | 'bounded-hq',
  overrides: Partial<DecodedImage> = {},
): DecodedImage {
  const isQuick = source === 'quick'

  return {
    width: isQuick ? 800 : 4000,
    height: isQuick ? 600 : 3000,
    channels: 3,
    bitsPerChannel: 16,
    data: new Uint16Array([0, 1024, 65535]),
    layout: 'rgb-u16',
    colorSpace: 'linear-prophoto-rgb',
    source,
    timings: { total: isQuick ? 20 : 120 },
    metadata: {
      make: 'Sony',
      model: 'A7',
      width: isQuick ? 800 : 4000,
      height: isQuick ? 600 : 3000,
    },
    renderExposure: { ev: 0, multiplier: 1, source: 'identity' },
    ...overrides,
  }
}

function createCube(title: string, size = 17) {
  const lines = [`TITLE "${title}"`, `LUT_3D_SIZE ${size}`, '']
  const step = 1 / (size - 1)

  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        lines.push(`${r * step} ${g * step} ${b * step}`)
      }
    }
  }

  return lines.join('\n')
}

function createCubeFile(title: string, name: string) {
  const content = createCube(title)
  return Object.assign(new File([content], name), {
    text: () => Promise.resolve(content),
  })
}

function makeJfifOnlyJpegBytes() {
  return new Uint8Array([
    255, 216, 255, 224, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0,
    255, 217,
  ])
}

async function readBlobBytes(blob: Blob) {
  if (typeof blob.arrayBuffer === 'function') {
    return new Uint8Array(await blob.arrayBuffer())
  }

  const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.readAsArrayBuffer(blob)
  })

  return new Uint8Array(buffer)
}

function bytesIncludeAscii(bytes: Uint8Array, value: string) {
  const needle = Array.from(value, (character) => character.charCodeAt(0))

  return bytes.some((_byte, index) =>
    needle.every((byte, offset) => bytes[index + offset] === byte),
  )
}

function encodeCube(title: string) {
  return new TextEncoder().encode(createCube(title))
}

function createOnlineLUTEntry(
  overrides: Partial<OnlineLUTEntry> = {},
): OnlineLUTEntry {
  return {
    id: 'online-lut',
    title: 'Online Client LUT',
    sourceUrl: 'https://example.com/catalog.json',
    sourceType: 'catalog-entry',
    cube: {
      url: 'https://example.com/luts/client.cube',
      sha256: 'a'.repeat(64),
      bytes: 1024,
      title: 'client.cube',
    },
    tags: [],
    ...overrides,
  }
}

function createTestSession() {
  return {
    id: 'session-lut-test',
    createdAt: 1,
    sourceFile: {
      name: 'frame.ARW',
      extension: 'arw',
      sizeBytes: 12,
      supportLevel: 'experimental' as const,
    },
    previewBundle: {
      embeddedPreview: { status: 'idle' as const },
      quickDecodePreview: { status: 'ready' as const, width: 800, height: 600 },
      boundedHqPreview: { status: 'ready' as const, width: 800, height: 600 },
      displaySource: 'bounded-hq' as const,
      boundedHqRequiredForExport: false as const,
    },
    activeStyle: null,
    viewState: {
      mode: 'processed' as const,
      compareSplit: 0.5,
      zoom: 1,
      panX: 0,
      panY: 0,
      fitMode: 'screen' as const,
    },
    renderState: { status: 'ready' as const },
    exportState: {
      status: 'idle' as const,
      qualityPreset: 'high' as const,
      fidelityLevel: 'balanced' as const,
      fullResCapability: {
        status: 'supported' as const,
        width: 4000,
        height: 3000,
      },
      recovery: { status: 'none' as const },
      checkpointDurable: false,
      retryRecommended: false,
    },
  }
}

function createCheckpointManifest(
  overrides: Partial<ExportCheckpointManifest> = {},
): ExportCheckpointManifest {
  return {
    version: 1,
    exportId: 'export-1',
    sourceFingerprint: {
      name: 'frame.ARW',
      size: 3,
      lastModified: 123,
      hashPrefixHex: 'abc',
    },
    fileName: 'frame.ARW',
    sourceSize: 3,
    sourceLastModified: 123,
    outputWidth: 6048,
    outputHeight: 4024,
    graphFingerprint: 'graph-1',
    profile: 'ios-safe',
    attempt: 1,
    preferredRows: 64,
    totalRows: 4024,
    recoveryMode: 'safe-retry',
    outputSink: 'opfs-file',
    sourceReacquisition: 'user-reselect-required',
    completedRowsForDiagnostics: 64,
    jpegState: 'restart-required',
    updatedAt: '2026-05-01T00:00:00.000Z',
    ...overrides,
  }
}

function createSupportedCapability() {
  return {
    supported: true,
    strategy: 'libraw-processed-window',
    width: 6048,
    height: 4024,
    rawWidth: 6048,
    rawHeight: 4024,
    cfa: { pattern: 'rggb', xPhase: 0, yPhase: 0 },
    blackLevel: 0,
    whiteLevel: 65535,
    orientation: 1,
    sensor: {
      layout: 'bayer',
      colorCount: 3,
      cfa: { pattern: 'rggb', xPhase: 0, yPhase: 0 },
      phaseIsWindowLocal: false,
    },
    levels: { black: 0, white: 65535 },
    color: {
      workingSpace: 'linear-prophoto-rgb',
      librawOutputColor: 'prophoto',
      gamma: 'linear',
      cameraWhiteBalanceAppliedByRuntime: true,
      cameraMatrixAppliedByRuntime: true,
    },
    windows: { librawProcessed: true, rawMosaic: false },
    diagnostics: {
      hasRawImage: true,
      hasColor3Image: false,
      hasColor4Image: false,
      hasXTransTable: false,
    },
    reasons: [],
  }
}

function createRawMosaicCapability() {
  return {
    ...createSupportedCapability(),
    strategy: 'raw-mosaic-window',
    windows: { librawProcessed: false, rawMosaic: true },
  }
}

function createUnsupportedCapability(reason: string) {
  return {
    ...createSupportedCapability(),
    supported: false,
    reasons: [reason],
  }
}

function createFileWithSize(name: string, size: number) {
  const file = new File(['raw'], name)
  Object.defineProperty(file, 'size', { value: size })
  return file
}

function wrapper({ children }: { children: ReactNode }) {
  return <Provider store={jotaiStore}>{children}</Provider>
}

async function flushPromises() {
  await Promise.resolve()
  await Promise.resolve()
}

async function flushScheduledToasts() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

function stubDownloadLink() {
  const click = vi.fn()
  const remove = vi.fn()
  const originalCreateElement = document.createElement.bind(document)

  vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
    if (tagName === 'a') {
      return {
        href: '',
        download: '',
        click,
        remove,
      }
    }
    return originalCreateElement(tagName)
  }) as typeof document.createElement)

  return { click, remove }
}

describe('useRawProcessor embedded preview state', () => {
  beforeEach(() => {
    resetToDefaults()
    jotaiStore.set(currentSessionAtom, null)
    rawRuntimeAdapterMock.openSession.mockReset()
    rawRuntimeAdapterMock.extractEmbeddedPreview.mockReset()
    rawRuntimeAdapterMock.decodeQuickRaw.mockReset()
    rawRuntimeAdapterMock.decodeBoundedHqRaw.mockReset()
    rawRuntimeAdapterMock.probeExportCapability.mockReset()
    exportSystemMock.runFullResolutionExportJob.mockReset()
    checkpointStoreMock.createCheckpointStore.mockReset()
    checkpointStoreMock.createOpfsCheckpointBackend.mockReset()
    checkpointStoreMock.listSafeRetryCandidates.mockReset()
    checkpointStoreMock.writeActive.mockReset()
    checkpointStoreMock.removeActiveManifest.mockReset()
    sourceFingerprintMock.createSourceFingerprint.mockReset()
    sourceFingerprintMock.sourceFingerprintMatches.mockReset()
    onlineProfileFetchMock.fetchCachedBytesWithLimit.mockReset()
    onlineProfileFetchMock.fetchVerifiedCubeAsset.mockReset()
    toastMock.success.mockReset()
    toastMock.error.mockReset()
    toastMock.info.mockReset()
    localStorage.clear()

    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:embedded-preview'),
      revokeObjectURL: vi.fn(),
    })
    rawRuntimeAdapterMock.openSession.mockImplementation(() =>
      Promise.resolve({
        sourceDimensions: defaultSourceDimensions,
        extractEmbeddedPreview: rawRuntimeAdapterMock.extractEmbeddedPreview,
        decodeQuickRaw: rawRuntimeAdapterMock.decodeQuickRaw,
        decodeBoundedHqRaw: rawRuntimeAdapterMock.decodeBoundedHqRaw,
        probeExportCapability: rawRuntimeAdapterMock.probeExportCapability,
        dispose: vi.fn(),
      }),
    )
    rawRuntimeAdapterMock.extractEmbeddedPreview.mockResolvedValue(null)
    rawRuntimeAdapterMock.decodeQuickRaw.mockResolvedValue(
      createDecodedImage('quick'),
    )
    rawRuntimeAdapterMock.decodeBoundedHqRaw.mockResolvedValue(
      createDecodedImage('bounded-hq'),
    )
    rawRuntimeAdapterMock.probeExportCapability.mockResolvedValue(
      createSupportedCapability(),
    )
    checkpointStoreMock.createOpfsCheckpointBackend.mockReturnValue(
      checkpointStoreMock.backend,
    )
    checkpointStoreMock.createCheckpointStore.mockReturnValue({
      listSafeRetryCandidates: checkpointStoreMock.listSafeRetryCandidates,
      writeActive: checkpointStoreMock.writeActive,
      removeActiveManifest: checkpointStoreMock.removeActiveManifest,
    })
    checkpointStoreMock.listSafeRetryCandidates.mockResolvedValue([])
    checkpointStoreMock.writeActive.mockResolvedValue(undefined)
    checkpointStoreMock.removeActiveManifest.mockResolvedValue(undefined)
    sourceFingerprintMock.createSourceFingerprint.mockResolvedValue({
      name: 'frame.ARW',
      size: 3,
      lastModified: 123,
      width: 6048,
      height: 4024,
      hashPrefixHex: 'abc',
    })
    sourceFingerprintMock.sourceFingerprintMatches.mockResolvedValue(true)
  })

  afterEach(() => {
    act(() => {
      resetToDefaults()
      jotaiStore.set(currentSessionAtom, null)
    })
    vi.unstubAllGlobals()
    vi.useRealTimers()
    localStorage.clear()
  })

  it('rejects unsupported files without replacing the active session or opening the runtime', async () => {
    const existingSession = createTestSession()
    jotaiStore.set(currentSessionAtom, existingSession)

    const { result } = renderHook(() => useRawProcessor(), { wrapper })

    act(() => {
      result.current.setParams({
        viewMode: 'processed',
        compareSplit: 0.8,
        userExposureEv: 1,
        userContrast: 50,
      })
    })
    const previousParams = result.current.params

    await act(async () => {
      await result.current.loadFile(new File(['not raw'], 'notes.txt'))
    })

    expect(result.current.error).toBe('Unsupported file format: notes.txt')
    expect(result.current.status).toBe('idle')
    expect(result.current.loadedImage.file).toBeNull()
    expect(result.current.params).toEqual(previousParams)
    expect(jotaiStore.get(currentSessionAtom)).toBe(existingSession)
    expect(rawRuntimeAdapterMock.openSession).not.toHaveBeenCalled()
  })

  it('discovers interrupted safe-retry checkpoints on mount', async () => {
    const checkpointManifest = createCheckpointManifest()
    jotaiStore.set(currentSessionAtom, createTestSession())
    checkpointStoreMock.listSafeRetryCandidates.mockResolvedValue([
      checkpointManifest,
    ])

    renderHook(() => useRawProcessor(), { wrapper })

    await waitFor(() => {
      expect(jotaiStore.get(currentSessionAtom)?.exportState.recovery).toEqual(
        expect.objectContaining({
          status: 'source-required',
          exportId: 'export-1',
          expectedFileName: 'frame.ARW',
          manifest: checkpointManifest,
          message:
            'The browser interrupted the previous export. Please reselect the same RAW file so LumaForge can retry with a safer setting.',
        }),
      )
    })
  })

  it('preserves discovered interrupted checkpoints before a session exists', async () => {
    const checkpointManifest = createCheckpointManifest()
    checkpointStoreMock.listSafeRetryCandidates.mockResolvedValue([
      checkpointManifest,
    ])

    const { result } = renderHook(() => useRawProcessor(), { wrapper })

    await waitFor(() => {
      expect(result.current.exportRecovery).toEqual(
        expect.objectContaining({
          status: 'source-required',
          exportId: 'export-1',
          expectedFileName: 'frame.ARW',
          manifest: checkpointManifest,
        }),
      )
    })
    expect(jotaiStore.get(currentSessionAtom)).toBeNull()
  })

  it('rejects recovery RAW reselection when the source fingerprint mismatches', async () => {
    jotaiStore.set(currentSessionAtom, createTestSession())
    checkpointStoreMock.listSafeRetryCandidates.mockResolvedValue([
      createCheckpointManifest(),
    ])
    sourceFingerprintMock.sourceFingerprintMatches.mockResolvedValue(false)

    const { result } = renderHook(() => useRawProcessor(), { wrapper })

    await waitFor(() => {
      expect(
        jotaiStore.get(currentSessionAtom)?.exportState.recovery.status,
      ).toBe('source-required')
    })

    await act(async () => {
      await result.current.recoverInterruptedExport(
        new File(['other'], 'other.ARW'),
      )
    })
    await flushScheduledToasts()

    expect(toastMock.error).toHaveBeenCalledWith('RAW file does not match', {
      description:
        'The selected RAW does not match the interrupted export source.',
    })
    expect(rawRuntimeAdapterMock.openSession).not.toHaveBeenCalled()
    expect(exportSystemMock.runFullResolutionExportJob).not.toHaveBeenCalled()
  })

  it('loads a matching recovery RAW and retries export with safe fidelity', async () => {
    vi.stubGlobal('crossOriginIsolated', true)
    const checkpointManifest = createCheckpointManifest()
    checkpointStoreMock.listSafeRetryCandidates.mockResolvedValue([
      checkpointManifest,
    ])
    exportSystemMock.runFullResolutionExportJob.mockResolvedValue({
      filename: 'frame_neutral_fullres.jpg',
      blob: new Blob(['jpeg'], { type: 'image/jpeg' }),
    })

    const { result } = renderHook(() => useRawProcessor(), { wrapper })

    await waitFor(() => {
      expect(result.current.exportRecovery.status).toBe('source-required')
    })

    await act(async () => {
      await result.current.recoverInterruptedExport(
        new File(['raw'], 'frame.ARW', { lastModified: 123 }),
      )
    })

    expect(sourceFingerprintMock.sourceFingerprintMatches).toHaveBeenCalledWith(
      expect.any(File),
      checkpointManifest.sourceFingerprint,
      {
        width: 6048,
        height: 4024,
      },
    )
    await waitFor(() => {
      expect(exportSystemMock.runFullResolutionExportJob).toHaveBeenCalledWith(
        expect.objectContaining({
          quality: 0.92,
          executionPlan: expect.objectContaining({
            profile: expect.objectContaining({ name: 'ios-safe' }),
          }),
        }),
      )
    })
  })

  it('does not auto-export a superseded recovery load', async () => {
    const recoverySession =
      deferred<Awaited<ReturnType<typeof rawRuntimeAdapterMock.openSession>>>()
    const checkpointManifest = createCheckpointManifest()
    checkpointStoreMock.listSafeRetryCandidates.mockResolvedValue([
      checkpointManifest,
    ])
    rawRuntimeAdapterMock.openSession
      .mockReturnValueOnce(recoverySession.promise)
      .mockResolvedValueOnce({
        sourceDimensions: defaultSourceDimensions,
        extractEmbeddedPreview: rawRuntimeAdapterMock.extractEmbeddedPreview,
        decodeQuickRaw: rawRuntimeAdapterMock.decodeQuickRaw,
        decodeBoundedHqRaw: rawRuntimeAdapterMock.decodeBoundedHqRaw,
        probeExportCapability: rawRuntimeAdapterMock.probeExportCapability,
        dispose: vi.fn(),
      })

    const { result } = renderHook(() => useRawProcessor(), { wrapper })

    await waitFor(() => {
      expect(result.current.exportRecovery.status).toBe('source-required')
    })

    let recoverPromise!: Promise<void>
    await act(async () => {
      recoverPromise = result.current.recoverInterruptedExport(
        new File(['raw'], 'frame.ARW', { lastModified: 123 }),
      )
      await Promise.resolve()
    })

    await act(async () => {
      await result.current.loadFile(new File(['other'], 'other.ARW'))
    })

    await act(async () => {
      recoverySession.resolve({
        sourceDimensions: defaultSourceDimensions,
        extractEmbeddedPreview: rawRuntimeAdapterMock.extractEmbeddedPreview,
        decodeQuickRaw: rawRuntimeAdapterMock.decodeQuickRaw,
        decodeBoundedHqRaw: rawRuntimeAdapterMock.decodeBoundedHqRaw,
        probeExportCapability: rawRuntimeAdapterMock.probeExportCapability,
        dispose: vi.fn(),
      })
      await recoverPromise
    })

    expect(exportSystemMock.runFullResolutionExportJob).not.toHaveBeenCalled()
  })

  it('exposes pending LUT profile selection and applies a user-selected profile', async () => {
    jotaiStore.set(currentSessionAtom, createTestSession())

    const { result } = renderHook(() => useRawProcessor(), { wrapper })

    await act(async () => {
      await result.current.loadLUT(
        createCubeFile('Client Secret Sauce', 'unknown-look.cube'),
      )
    })

    await waitFor(() => {
      expect(result.current.lut?.profileResolution).toEqual({
        kind: 'needs-user-selection',
        suggestions: [],
      })
    })
    const pendingSelection = {
      status: 'pending',
      fingerprint: result.current.lut?.fingerprint,
      title: 'Client Secret Sauce',
      sourceName: 'unknown-look.cube',
      suggestions: [],
    }
    expect(result.current.lutProfileSelection).toEqual(pendingSelection)
    expect(jotaiStore.get(currentSessionAtom)?.lutProfileSelection).toEqual(
      pendingSelection,
    )

    const selectedContract = {
      ...getLUTColorProfile('sony-sgamut3cine-slog3')!,
      role: 'combined-look-output' as const,
      outputGamut: 'srgb-rec709' as const,
      outputTransfer: 'bt709' as const,
      outputRange: 'full' as const,
    }

    act(() => {
      result.current.selectLUTProfile(selectedContract)
    })

    await waitFor(() => {
      expect(result.current.lut?.profileResolution).toMatchObject({
        kind: 'resolved',
        confidence: 'user',
        profile: {
          id: 'sony-sgamut3cine-slog3',
          role: 'combined-look-output',
          outputGamut: 'srgb-rec709',
          outputTransfer: 'bt709',
          outputRange: 'full',
        },
      })
    })
    await waitFor(() => {
      expect(result.current.lutData?.profileResolution).toMatchObject({
        kind: 'resolved',
        profile: { id: 'sony-sgamut3cine-slog3' },
      })
    })
    expect(
      getStoredLUTContractSelection(result.current.lut!.fingerprint),
    ).toEqual(
      expect.objectContaining({
        inputProfile: 'sony-sgamut3cine-slog3',
        role: 'combined-look-output',
        outputGamut: 'srgb-rec709',
        outputTransfer: 'bt709',
        outputRange: 'full',
      }),
    )
    expect(
      getStoredLUTProfileSelection(result.current.lut!.fingerprint),
    ).toMatchObject({
      id: 'sony-sgamut3cine-slog3',
      role: 'combined-look-output',
      outputTransfer: 'bt709',
    })
    expect(result.current.lutProfileSelection).toMatchObject({
      status: 'resolved',
      fingerprint: result.current.lut?.fingerprint,
      profileId: 'sony-sgamut3cine-slog3',
      confidence: 'user',
    })
    expect(jotaiStore.get(currentSessionAtom)).toMatchObject({
      activeStyle: {
        kind: 'custom',
        lutAsset: {
          profileResolution: {
            kind: 'resolved',
            profile: { id: 'sony-sgamut3cine-slog3' },
          },
        },
      },
      lutProfileSelection: {
        status: 'resolved',
        fingerprint: result.current.lut?.fingerprint,
        profileId: 'sony-sgamut3cine-slog3',
        confidence: 'user',
      },
    })
  })

  it('keeps a detached LUT loaded before RAW upload and preserves it across RAW replacement', async () => {
    const { result } = renderHook(() => useRawProcessor(), { wrapper })

    await act(async () => {
      await result.current.loadLUT(
        createCubeFile('Client Secret Sauce', 'unknown-look.cube'),
      )
    })

    const detachedFingerprint = result.current.lut?.fingerprint

    expect(result.current.currentLutName).toBe('Client Secret Sauce')
    expect(result.current.lutProfileSelection).toMatchObject({
      status: 'pending',
      fingerprint: detachedFingerprint,
      title: 'Client Secret Sauce',
    })
    expect(result.current.params.styleKind).toBe('custom')
    expect(jotaiStore.get(currentSessionAtom)).toBeNull()

    await act(async () => {
      await result.current.loadFile(new File(['raw-one'], 'frame-1.ARW'))
    })

    await waitFor(() => {
      expect(result.current.currentLutName).toBe('Client Secret Sauce')
    })
    expect(result.current.lut?.fingerprint).toBe(detachedFingerprint)
    expect(jotaiStore.get(currentSessionAtom)).toMatchObject({
      activeStyle: {
        kind: 'custom',
        name: 'Client Secret Sauce',
      },
      lutProfileSelection: {
        status: 'pending',
        fingerprint: detachedFingerprint,
        title: 'Client Secret Sauce',
      },
    })

    await act(async () => {
      await result.current.loadFile(new File(['raw-two'], 'frame-2.ARW'))
    })

    await waitFor(() => {
      expect(result.current.currentLutName).toBe('Client Secret Sauce')
    })
    expect(result.current.lut?.fingerprint).toBe(detachedFingerprint)
    expect(jotaiStore.get(currentSessionAtom)).toMatchObject({
      sourceFile: {
        name: 'frame-2.ARW',
      },
      activeStyle: {
        kind: 'custom',
        name: 'Client Secret Sauce',
      },
      lutProfileSelection: {
        status: 'pending',
        fingerprint: detachedFingerprint,
        title: 'Client Secret Sauce',
      },
    })
  })

  it('rejects raw registry scene-creative LUT profile selections without output metadata', async () => {
    jotaiStore.set(currentSessionAtom, createTestSession())

    const { result } = renderHook(() => useRawProcessor(), { wrapper })

    await act(async () => {
      await result.current.loadLUT(
        createCubeFile('Client Secret Sauce', 'unknown-look.cube'),
      )
    })

    await waitFor(() => {
      expect(result.current.lutProfileSelection?.status).toBe('pending')
    })

    const fingerprint = result.current.lut!.fingerprint

    act(() => {
      result.current.selectLUTProfile(
        getLUTColorProfile('sony-sgamut3cine-slog3')!,
      )
    })

    expect(result.current.lut?.profileResolution).toEqual({
      kind: 'needs-user-selection',
      suggestions: [],
    })
    expect(result.current.lutProfileSelection?.status).toBe('pending')
    expect(getStoredLUTContractSelection(fingerprint)).toBeUndefined()

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(toastMock.error).toHaveBeenCalledWith('Incomplete LUT contract', {
      description: 'sony-sgamut3cine-slog3',
    })
  })

  it('accepts explicit same-space output contract selections', async () => {
    jotaiStore.set(currentSessionAtom, createTestSession())

    const { result } = renderHook(() => useRawProcessor(), { wrapper })

    await act(async () => {
      await result.current.loadLUT(
        createCubeFile('Client Secret Sauce', 'unknown-look.cube'),
      )
    })

    await waitFor(() => {
      expect(result.current.lutProfileSelection?.status).toBe('pending')
    })

    const selectedContract = {
      ...getLUTColorProfile('panasonic-vgamut-vlog')!,
      role: 'combined-look-output' as const,
      outputGamut: 'v-gamut' as const,
      outputTransfer: 'v-log' as const,
      outputRange: 'full' as const,
    }

    act(() => {
      result.current.selectLUTProfile(selectedContract)
    })

    await waitFor(() => {
      expect(result.current.lut?.profileResolution).toMatchObject({
        kind: 'resolved',
        confidence: 'user',
        profile: {
          id: 'panasonic-vgamut-vlog',
          role: 'combined-look-output',
          outputGamut: 'v-gamut',
          outputTransfer: 'v-log',
          outputRange: 'full',
        },
      })
    })
    expect(
      getStoredLUTContractSelection(result.current.lut!.fingerprint),
    ).toEqual(
      expect.objectContaining({
        inputProfile: 'panasonic-vgamut-vlog',
        role: 'combined-look-output',
        outputGamut: 'v-gamut',
        outputTransfer: 'v-log',
        outputRange: 'full',
      }),
    )
  })

  it('persists a searchable V-Log to Rec.709 display contract', async () => {
    jotaiStore.set(currentSessionAtom, createTestSession())

    const { result } = renderHook(() => useRawProcessor(), { wrapper })

    await act(async () => {
      await result.current.loadLUT(
        createCubeFile('Client Secret Sauce', 'unknown-look.cube'),
      )
    })

    await waitFor(() => {
      expect(result.current.lutProfileSelection?.status).toBe('pending')
    })

    const selectedContract = {
      ...getLUTColorProfile('panasonic-vgamut-vlog')!,
      label: 'Panasonic V-Gamut / V-Log -> Rec.709 display',
      role: 'combined-look-output' as const,
      outputGamut: 'srgb-rec709' as const,
      outputTransfer: 'bt709' as const,
      outputRange: 'full' as const,
    }

    act(() => {
      result.current.selectLUTProfile(selectedContract)
    })

    await waitFor(() => {
      expect(result.current.lut?.profileResolution).toMatchObject({
        kind: 'resolved',
        profile: {
          id: 'panasonic-vgamut-vlog',
          role: 'combined-look-output',
          outputGamut: 'srgb-rec709',
          outputTransfer: 'bt709',
          outputRange: 'full',
        },
      })
    })
    expect(jotaiStore.get(currentSessionAtom)?.activeStyle).toMatchObject({
      kind: 'custom',
      warning: 'This LUT uses Panasonic V-Gamut / V-Log -> Rec.709 display.',
    })
    expect(
      getStoredLUTContractSelection(result.current.lut!.fingerprint),
    ).toEqual(
      expect.objectContaining({
        inputProfile: 'panasonic-vgamut-vlog',
        role: 'combined-look-output',
        outputGamut: 'srgb-rec709',
        outputTransfer: 'bt709',
        outputRange: 'full',
      }),
    )
  })

  it('defers LUT success toasts until after the state commit finishes', async () => {
    jotaiStore.set(currentSessionAtom, createTestSession())

    const { result } = renderHook(() => useRawProcessor(), { wrapper })

    await act(async () => {
      await result.current.loadLUT(
        createCubeFile('Client Secret Sauce', 'unknown-look.cube'),
      )
    })

    expect(toastMock.success).not.toHaveBeenCalled()

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(toastMock.success).toHaveBeenCalledWith(
      'Loaded LUT: Client Secret Sauce',
      {
        description: '17³ grid',
      },
    )
  })

  it('loads direct online CUBE entries through the manual-style unresolved profile path', async () => {
    jotaiStore.set(currentSessionAtom, createTestSession())
    onlineProfileFetchMock.fetchCachedBytesWithLimit.mockResolvedValue(
      encodeCube('Direct Online LUT'),
    )
    const signal = new AbortController().signal
    const entry = createOnlineLUTEntry({
      title: 'Direct Online LUT',
      sourceType: 'direct-cube',
      cube: {
        url: 'https://example.com/direct/online-look.cube',
        sha256: '',
      },
      trustedContract: {
        role: 'display-look',
        inputGamut: 'srgb-rec709',
        inputTransfer: 'srgb',
        inputRange: 'full',
      },
    })

    const { result } = renderHook(() => useRawProcessor(), { wrapper })

    await act(async () => {
      await result.current.loadOnlineLUT(entry, { signal })
    })

    expect(fetchCachedBytesWithLimit).toHaveBeenCalledWith(
      'https://example.com/direct/online-look.cube',
      expect.objectContaining({
        signal,
        maxBytes: 64 * 1024 * 1024,
      }),
    )
    expect(fetchVerifiedCubeAsset).not.toHaveBeenCalled()
    expect(result.current.lut).toMatchObject({
      title: 'Direct Online LUT',
      sourceName: 'Direct Online LUT',
      profileResolution: {
        kind: 'needs-user-selection',
        suggestions: [],
      },
    })
    expect(result.current.lutProfileSelection).toMatchObject({
      status: 'pending',
      title: 'Direct Online LUT',
      sourceName: 'Direct Online LUT',
    })
  })

  it('loads verified registry CUBE entries and applies trusted contracts', async () => {
    jotaiStore.set(currentSessionAtom, createTestSession())
    onlineProfileFetchMock.fetchVerifiedCubeAsset.mockResolvedValue(
      encodeCube('Registry Online LUT'),
    )
    const entry = createOnlineLUTEntry({
      title: 'Registry Online LUT',
      trustedContract: {
        role: 'display-look',
        inputGamut: 'srgb-rec709',
        inputTransfer: 'srgb',
        inputRange: 'full',
      },
    })

    const { result } = renderHook(() => useRawProcessor(), { wrapper })

    await act(async () => {
      await result.current.loadOnlineLUT(entry)
    })

    expect(fetchVerifiedCubeAsset).toHaveBeenCalledWith(
      entry.cube,
      expect.objectContaining({
        maxBytes: 64 * 1024 * 1024,
      }),
    )
    expect(fetchCachedBytesWithLimit).not.toHaveBeenCalled()
    expect(result.current.lut?.profileResolution).toMatchObject({
      kind: 'resolved',
      confidence: 'user',
      profile: {
        id: 'srgb-rec709-srgb',
        role: 'display-look',
        inputGamut: 'srgb-rec709',
        inputTransfer: 'srgb',
        inputRange: 'full',
      },
    })
    expect(result.current.lutData?.profileResolution).toMatchObject({
      kind: 'resolved',
      profile: { id: 'srgb-rec709-srgb' },
    })
    expect(result.current.lutProfileSelection).toMatchObject({
      status: 'resolved',
      profileId: 'srgb-rec709-srgb',
      confidence: 'user',
    })
  })

  it('rejects unsupported trusted contracts and leaves the active LUT unchanged', async () => {
    jotaiStore.set(currentSessionAtom, createTestSession())
    const { result } = renderHook(() => useRawProcessor(), { wrapper })

    await act(async () => {
      await result.current.loadLUT(
        createCubeFile('Previous LUT', 'previous.cube'),
      )
    })

    const previousLut = result.current.lut
    const previousStyle = jotaiStore.get(currentSessionAtom)?.activeStyle
    onlineProfileFetchMock.fetchVerifiedCubeAsset.mockResolvedValue(
      encodeCube('Rejected Online LUT'),
    )

    await act(async () => {
      await result.current.loadOnlineLUT(
        createOnlineLUTEntry({
          title: 'Rejected Online LUT',
          trustedContract: {
            role: 'display-look',
            inputGamut: 'arri-wide-gamut-3',
            inputTransfer: 'logc3',
            inputRange: 'full',
          },
        }),
      )
    })
    await flushScheduledToasts()

    expect(result.current.lut).toBe(previousLut)
    expect(jotaiStore.get(currentSessionAtom)?.activeStyle).toBe(previousStyle)
    expect(jotaiStore.get(currentSessionAtom)?.renderState).toMatchObject({
      lastErrorCode: 'LUT_PARSE_FAILED',
    })
    expect(toastMock.error).toHaveBeenCalledWith('Failed to load LUT', {
      description: 'Unsupported LUT color contract.',
    })
  })

  it('rejects online fetch errors and leaves the current RAW session and LUT intact', async () => {
    jotaiStore.set(currentSessionAtom, createTestSession())
    const { result } = renderHook(() => useRawProcessor(), { wrapper })

    await act(async () => {
      await result.current.loadLUT(
        createCubeFile('Previous LUT', 'previous.cube'),
      )
    })

    const previousLut = result.current.lut
    const previousSession = jotaiStore.get(currentSessionAtom)
    onlineProfileFetchMock.fetchVerifiedCubeAsset.mockRejectedValue(
      new Error('Hash mismatch'),
    )

    await act(async () => {
      await result.current.loadOnlineLUT(createOnlineLUTEntry())
    })
    await flushScheduledToasts()

    const nextSession = jotaiStore.get(currentSessionAtom)
    expect(result.current.lut).toBe(previousLut)
    expect(nextSession).toMatchObject({
      id: previousSession?.id,
      sourceFile: previousSession?.sourceFile,
      activeStyle: previousSession?.activeStyle,
      lutProfileSelection: previousSession?.lutProfileSelection,
      renderState: expect.objectContaining({
        lastErrorCode: 'LUT_PARSE_FAILED',
      }),
    })
    expect(toastMock.error).toHaveBeenCalledWith('Failed to load LUT', {
      description: 'Hash mismatch',
    })
  })

  it('ignores aborted verified online LUT fetches without changing error state or active LUT', async () => {
    jotaiStore.set(currentSessionAtom, createTestSession())
    const { result } = renderHook(() => useRawProcessor(), { wrapper })

    await act(async () => {
      await result.current.loadLUT(
        createCubeFile('Previous LUT', 'previous.cube'),
      )
    })

    const previousLut = result.current.lut
    const previousLastErrorCode =
      jotaiStore.get(currentSessionAtom)?.renderState.lastErrorCode
    const controller = new AbortController()
    onlineProfileFetchMock.fetchVerifiedCubeAsset.mockRejectedValue(
      new DOMException('The operation was aborted.', 'AbortError'),
    )

    await act(async () => {
      await result.current.loadOnlineLUT(createOnlineLUTEntry(), {
        signal: controller.signal,
      })
    })
    await flushScheduledToasts()

    expect(result.current.lut).toBe(previousLut)
    expect(jotaiStore.get(currentSessionAtom)?.renderState.lastErrorCode).toBe(
      previousLastErrorCode,
    )
    expect(toastMock.error).not.toHaveBeenCalledWith(
      'Failed to load LUT',
      expect.anything(),
    )
  })

  it('does not apply an online LUT when the signal is aborted after fetch resolves', async () => {
    jotaiStore.set(currentSessionAtom, createTestSession())
    const { result } = renderHook(() => useRawProcessor(), { wrapper })

    await act(async () => {
      await result.current.loadLUT(
        createCubeFile('Previous LUT', 'previous.cube'),
      )
    })

    const previousLut = result.current.lut
    const previousLastErrorCode =
      jotaiStore.get(currentSessionAtom)?.renderState.lastErrorCode
    const controller = new AbortController()
    onlineProfileFetchMock.fetchVerifiedCubeAsset.mockImplementation(
      async () => {
        controller.abort()
        return encodeCube('Late Aborted Online LUT')
      },
    )

    await act(async () => {
      await result.current.loadOnlineLUT(createOnlineLUTEntry(), {
        signal: controller.signal,
      })
    })
    await flushScheduledToasts()

    expect(result.current.lut).toBe(previousLut)
    expect(jotaiStore.get(currentSessionAtom)?.renderState.lastErrorCode).toBe(
      previousLastErrorCode,
    )
    expect(toastMock.error).not.toHaveBeenCalledWith(
      'Failed to load LUT',
      expect.anything(),
    )
  })

  it('stores embedded object URLs, upgrades display source, and revokes on reset', async () => {
    const embeddedPreview = deferred<{
      width: number
      height: number
      data: Uint8Array
      mimeType: string
      timings: Record<string, number | undefined>
    } | null>()
    const quickDecode = deferred<DecodedImage>()
    const boundedHqDecode = deferred<DecodedImage>()

    rawRuntimeAdapterMock.extractEmbeddedPreview.mockReturnValue(
      embeddedPreview.promise,
    )
    rawRuntimeAdapterMock.decodeQuickRaw.mockReturnValue(quickDecode.promise)
    rawRuntimeAdapterMock.decodeBoundedHqRaw.mockReturnValue(
      boundedHqDecode.promise,
    )

    const { result } = renderHook(() => useRawProcessor(), { wrapper })
    let loadPromise!: Promise<void>

    await act(async () => {
      loadPromise = result.current.loadFile(new File(['raw'], 'frame.ARW'))
      await Promise.resolve()
    })

    await act(async () => {
      embeddedPreview.resolve({
        width: 1600,
        height: 1067,
        data: new Uint8Array([1, 2, 3]),
        mimeType: 'image/jpeg',
        timings: { total: 8 },
      })
      await flushPromises()
    })
    await waitFor(() => {
      expect(result.current.displaySource).toBe('embedded')
    })
    expect(result.current.embeddedPreviewUrl).toBe('blob:embedded-preview')
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)

    await act(async () => {
      quickDecode.resolve(createDecodedImage('quick'))
      await flushPromises()
    })
    await waitFor(() => {
      expect(result.current.displaySource).toBe('quick')
    })
    expect(result.current.embeddedPreviewUrl).toBe('blob:embedded-preview')

    await act(async () => {
      boundedHqDecode.resolve(createDecodedImage('bounded-hq'))
      await loadPromise
    })
    await waitFor(() => {
      expect(result.current.displaySource).toBe('bounded-hq')
    })

    act(() => {
      result.current.reset()
    })

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:embedded-preview')
    expect(result.current.embeddedPreviewUrl).toBeNull()
    expect(result.current.displaySource).toBe('none')
  })

  it('publishes the active decoded preview histogram after load', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(performance.now()), 0),
    )
    rawRuntimeAdapterMock.extractEmbeddedPreview.mockResolvedValue(null)
    rawRuntimeAdapterMock.decodeQuickRaw.mockResolvedValue(
      createDecodedImage('quick', {
        width: 2,
        height: 1,
        data: new Uint16Array([0, 0, 0, 65535, 65535, 65535]),
      }),
    )
    rawRuntimeAdapterMock.decodeBoundedHqRaw.mockResolvedValue(
      createDecodedImage('bounded-hq', {
        width: 2,
        height: 1,
        data: new Uint16Array([65535, 0, 0, 0, 0, 65535]),
      }),
    )

    const { result } = renderHook(() => useRawProcessor(), { wrapper })

    await act(async () => {
      const loadPromise = result.current.loadFile(
        new File(['raw'], 'frame.ARW'),
      )
      await Promise.resolve()
      await vi.runAllTimersAsync()
      await loadPromise
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
      await vi.runOnlyPendingTimersAsync()
    })

    expect(result.current.histogram.state).toBe('ready')
    if (result.current.histogram.state !== 'ready') {
      throw new Error('Expected histogram')
    }
    expect(result.current.histogram.source).toBe('bounded-hq')
    expect(result.current.histogram.diagnostics.ownership).toBe(
      'main-thread-chunked-no-copy',
    )
  })

  it('keeps histogram independent from compare split changes', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(performance.now()), 0),
    )
    rawRuntimeAdapterMock.extractEmbeddedPreview.mockResolvedValue(null)
    rawRuntimeAdapterMock.decodeQuickRaw.mockResolvedValue(
      createDecodedImage('quick', {
        width: 2,
        height: 1,
        data: new Uint16Array([0, 0, 0, 65535, 65535, 65535]),
      }),
    )
    rawRuntimeAdapterMock.decodeBoundedHqRaw.mockResolvedValue(
      createDecodedImage('bounded-hq', {
        width: 2,
        height: 1,
        data: new Uint16Array([0, 0, 0, 65535, 65535, 65535]),
      }),
    )

    const { result } = renderHook(() => useRawProcessor(), { wrapper })
    await act(async () => {
      const loadPromise = result.current.loadFile(
        new File(['raw'], 'frame.ARW'),
      )
      await Promise.resolve()
      await vi.runAllTimersAsync()
      await loadPromise
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
      await vi.runOnlyPendingTimersAsync()
    })
    expect(result.current.histogram.state).toBe('ready')
    const histogram = result.current.histogram

    act(() => {
      result.current.setCompareSplit(0.8)
    })

    expect(result.current.histogram).toBe(histogram)
  })

  it('opens one runtime session for a load and disposes it after preview completion', async () => {
    const file = new File(['raw'], 'frame.ARW')
    const extractEmbeddedPreview = vi.fn().mockResolvedValue(null)
    const decodeQuickRaw = vi
      .fn()
      .mockResolvedValue(createDecodedImage('quick'))
    const decodeBoundedHqRaw = vi
      .fn()
      .mockResolvedValue(createDecodedImage('bounded-hq'))
    const dispose = vi.fn()

    rawRuntimeAdapterMock.openSession.mockResolvedValue({
      sourceDimensions: defaultSourceDimensions,
      extractEmbeddedPreview,
      decodeQuickRaw,
      decodeBoundedHqRaw,
      dispose,
    })

    const { result } = renderHook(() => useRawProcessor(), { wrapper })

    await act(async () => {
      await result.current.loadFile(file)
    })

    const openSignal = rawRuntimeAdapterMock.openSession.mock.calls[0]?.[1]
    expect(rawRuntimeAdapterMock.openSession).toHaveBeenCalledTimes(1)
    expect(rawRuntimeAdapterMock.openSession).toHaveBeenCalledWith(
      file,
      openSignal,
    )
    expect(openSignal).toBeInstanceOf(AbortSignal)
    expect(openSignal.aborted).toBe(false)
    expect(extractEmbeddedPreview).toHaveBeenCalledWith(openSignal)
    expect(decodeQuickRaw).toHaveBeenCalledWith(
      expect.any(Function),
      openSignal,
    )
    expect(decodeBoundedHqRaw).toHaveBeenCalledWith(
      { maxOutputPixels: 12_000_000 },
      undefined,
      openSignal,
    )
    expect(dispose).toHaveBeenCalledTimes(1)
    expect(rawRuntimeAdapterMock.extractEmbeddedPreview).not.toHaveBeenCalled()
    expect(rawRuntimeAdapterMock.decodeQuickRaw).not.toHaveBeenCalled()
    expect(rawRuntimeAdapterMock.decodeBoundedHqRaw).not.toHaveBeenCalled()
  })

  it('preserves compare split in the new session when loading a file', async () => {
    const file = new File(['raw'], 'frame.ARW')

    const { result } = renderHook(() => useRawProcessor(), { wrapper })

    act(() => {
      result.current.setCompareSplit(0.8)
    })

    await act(async () => {
      await result.current.loadFile(file)
    })

    expect(result.current.viewMode).toBe('compare')
    expect(result.current.compareSplit).toBe(0.8)
    expect(jotaiStore.get(currentSessionAtom)?.viewState).toMatchObject({
      mode: 'compare',
      compareSplit: 0.8,
    })
  })

  it('keeps view mode params and session view state in sync', () => {
    jotaiStore.set(currentSessionAtom, createTestSession())

    const { result } = renderHook(() => useRawProcessor(), { wrapper })

    act(() => {
      result.current.setViewMode('original')
    })

    expect(result.current.viewMode).toBe('original')
    expect(jotaiStore.get(currentSessionAtom)?.viewState).toMatchObject({
      mode: 'original',
      compareSplit: 0.5,
    })
  })

  it('keeps committed compare split params and session view state in sync', () => {
    jotaiStore.set(currentSessionAtom, createTestSession())

    const { result } = renderHook(() => useRawProcessor(), { wrapper })

    act(() => {
      result.current.setCompareSplit(2)
    })

    expect(result.current.compareSplit).toBe(0.95)
    expect(jotaiStore.get(currentSessionAtom)?.viewState).toMatchObject({
      mode: 'processed',
      compareSplit: 0.95,
    })
  })

  it('enters ready state after quick preview before bounded HQ resolves', async () => {
    const boundedHq = deferred<DecodedImage>()
    rawRuntimeAdapterMock.decodeQuickRaw.mockResolvedValue(
      createDecodedImage('quick'),
    )
    rawRuntimeAdapterMock.decodeBoundedHqRaw.mockReturnValue(boundedHq.promise)

    const { result } = renderHook(() => useRawProcessor(), { wrapper })

    await act(async () => {
      await result.current.loadFile(new File(['raw'], 'sample.RAF'))
    })

    expect(result.current.status).toBe('ready')
    expect(result.current.displaySource).toBe('quick')
  })

  it('keeps quick preview and no global error when bounded HQ fails', async () => {
    rawRuntimeAdapterMock.decodeQuickRaw.mockResolvedValue(
      createDecodedImage('quick'),
    )
    rawRuntimeAdapterMock.decodeBoundedHqRaw.mockRejectedValue(
      Object.assign(new Error('bounded failed'), {
        code: 'RAW_BOUNDED_HQ_DECODE_FAILED',
      }),
    )

    const { result } = renderHook(() => useRawProcessor(), { wrapper })

    await act(async () => {
      await result.current.loadFile(new File(['raw'], 'sample.RAF'))
    })
    await waitFor(() => {
      expect(result.current.displaySource).toBe('quick')
    })

    const session = jotaiStore.get(currentSessionAtom)
    expect(result.current.error).toBeNull()
    expect(result.current.status).toBe('ready')
    expect(session?.renderState).toMatchObject({ status: 'ready' })
    expect(session?.renderState.lastErrorCode).toBeUndefined()
  })

  it('keeps full-resolution export enabled when processed-window capability is supported but bounded HQ preview fails', async () => {
    const file = createFileWithSize('large.ARW', 33 * 1024 * 1024)
    const decodeQuickRaw = vi
      .fn()
      .mockResolvedValue(createDecodedImage('quick'))
    const decodeBoundedHqRaw = vi.fn().mockRejectedValue(
      Object.assign(new Error('bounded unavailable'), {
        code: 'RAW_BOUNDED_HQ_DECODE_FAILED',
      }),
    )

    rawRuntimeAdapterMock.openSession.mockResolvedValue({
      sourceDimensions: defaultSourceDimensions,
      extractEmbeddedPreview: vi.fn().mockResolvedValue(null),
      decodeQuickRaw,
      decodeBoundedHqRaw,
      probeExportCapability: vi
        .fn()
        .mockResolvedValue(createSupportedCapability()),
      dispose: vi.fn(),
    })
    exportSystemMock.runFullResolutionExportJob.mockResolvedValue({
      filename: 'large_neutral_fullres.jpg',
      blob: new Blob(['jpeg'], { type: 'image/jpeg' }),
    })
    stubDownloadLink()

    const { result } = renderHook(() => useRawProcessor(), { wrapper })

    await act(async () => {
      await result.current.loadFile(file)
    })

    const session = jotaiStore.get(currentSessionAtom)
    expect(decodeQuickRaw).toHaveBeenCalled()
    expect(decodeBoundedHqRaw).toHaveBeenCalled()
    expect(result.current.displaySource).toBe('quick')
    expect(result.current.canExport).toBe(true)
    expect(session?.previewBundle.boundedHqPreview).toEqual({
      status: 'failed',
      errorCode: 'RAW_BOUNDED_HQ_DECODE_FAILED',
    })
    expect(session?.exportState.fullResCapability).toEqual({
      status: 'supported',
      width: 6048,
      height: 4024,
    })

    await act(async () => {
      await result.current.exportImage({ quality: 'high', fidelity: 'max' })
    })

    expect(exportSystemMock.runFullResolutionExportJob).toHaveBeenCalledWith(
      expect.objectContaining({ file }),
    )
  })

  it('keeps full-resolution export disabled until decoded render exposure is available', async () => {
    const file = createFileWithSize('large.ARW', 33 * 1024 * 1024)
    const quickDecode = deferred<DecodedImage>()
    const boundedHqDecode = deferred<DecodedImage>()
    const runtimeCallOrder: string[] = []

    rawRuntimeAdapterMock.extractEmbeddedPreview.mockResolvedValue(null)
    rawRuntimeAdapterMock.decodeQuickRaw.mockImplementation(() => {
      runtimeCallOrder.push('quick')
      return quickDecode.promise
    })
    rawRuntimeAdapterMock.decodeBoundedHqRaw.mockImplementation(() => {
      runtimeCallOrder.push('bounded-hq')
      return boundedHqDecode.promise
    })
    rawRuntimeAdapterMock.probeExportCapability.mockImplementation(() => {
      runtimeCallOrder.push('probe-export')
      return Promise.resolve(createSupportedCapability())
    })
    exportSystemMock.runFullResolutionExportJob.mockResolvedValue({
      filename: 'large_neutral_fullres.jpg',
      blob: new Blob(['jpeg'], { type: 'image/jpeg' }),
    })

    const { result } = renderHook(() => useRawProcessor(), { wrapper })
    let loadPromise!: Promise<void>

    await act(async () => {
      loadPromise = result.current.loadFile(file)
      await flushPromises()
    })

    await waitFor(() => {
      expect(rawRuntimeAdapterMock.decodeQuickRaw).toHaveBeenCalled()
    })
    expect(rawRuntimeAdapterMock.probeExportCapability).not.toHaveBeenCalled()
    expect(
      jotaiStore.get(currentSessionAtom)?.exportState.fullResCapability,
    ).toEqual({ status: 'probing' })
    expect(result.current.canExport).toBe(false)
    expect(result.current.exportDisabledReason).toBe(
      'Quick preview is still being prepared.',
    )

    await act(async () => {
      await result.current.exportImage({ quality: 'high', fidelity: 'max' })
    })
    await flushScheduledToasts()

    expect(exportSystemMock.runFullResolutionExportJob).not.toHaveBeenCalled()
    expect(toastMock.error).toHaveBeenCalledWith(
      'Full-resolution export is not ready',
      { description: 'Quick preview is still being prepared.' },
    )

    await act(async () => {
      quickDecode.resolve(createDecodedImage('quick'))
      await flushPromises()
    })
    await waitFor(() => {
      expect(rawRuntimeAdapterMock.probeExportCapability).toHaveBeenCalled()
    })
    await waitFor(() => {
      expect(rawRuntimeAdapterMock.decodeBoundedHqRaw).toHaveBeenCalled()
    })
    expect(runtimeCallOrder.indexOf('probe-export')).toBeGreaterThan(
      runtimeCallOrder.indexOf('quick'),
    )
    expect(runtimeCallOrder.indexOf('probe-export')).toBeLessThan(
      runtimeCallOrder.indexOf('bounded-hq'),
    )
    await waitFor(() => {
      expect(
        jotaiStore.get(currentSessionAtom)?.exportState.fullResCapability,
      ).toMatchObject({
        status: 'supported',
      })
    })

    await act(async () => {
      boundedHqDecode.resolve(createDecodedImage('bounded-hq'))
      await loadPromise
    })
  })

  it('keeps full-resolution export disabled when processed-window capability is supported but quick preview fails', async () => {
    const file = createFileWithSize('large.ARW', 33 * 1024 * 1024)
    const decodeQuickRaw = vi.fn().mockRejectedValue(
      Object.assign(new Error('quick unavailable'), {
        code: 'RAW_QUICK_DECODE_FAILED',
      }),
    )
    const decodeBoundedHqRaw = vi.fn()
    const probeExportCapability = vi
      .fn()
      .mockResolvedValue(createSupportedCapability())

    rawRuntimeAdapterMock.openSession.mockResolvedValue({
      sourceDimensions: defaultSourceDimensions,
      extractEmbeddedPreview: vi.fn().mockResolvedValue({
        width: 1600,
        height: 1067,
        data: new Uint8Array([1, 2, 3]),
        mimeType: 'image/jpeg',
      }),
      decodeQuickRaw,
      decodeBoundedHqRaw,
      probeExportCapability,
      dispose: vi.fn(),
    })
    exportSystemMock.runFullResolutionExportJob.mockResolvedValue({
      filename: 'large_neutral_fullres.jpg',
      blob: new Blob(['jpeg'], { type: 'image/jpeg' }),
    })
    stubDownloadLink()

    const { result } = renderHook(() => useRawProcessor(), { wrapper })

    await act(async () => {
      await result.current.loadFile(file)
    })

    const session = jotaiStore.get(currentSessionAtom)
    expect(decodeQuickRaw).toHaveBeenCalled()
    expect(decodeBoundedHqRaw).not.toHaveBeenCalled()
    expect(result.current.displaySource).toBe('embedded')
    expect(result.current.status).toBe('error')
    expect(result.current.canExport).toBe(false)
    expect(result.current.exportDisabledReason).toBe(
      'Quick preview is still being prepared.',
    )
    expect(session?.previewBundle.quickDecodePreview).toEqual({
      status: 'failed',
      errorCode: 'RAW_QUICK_DECODE_FAILED',
    })
    expect(session?.previewBundle.boundedHqPreview).toEqual({
      status: 'failed',
      errorCode: 'RAW_QUICK_DECODE_FAILED',
    })
    expect(session?.exportState.fullResCapability).toEqual({
      status: 'unsupported',
      reason: 'Quick preview did not complete.',
    })
    expect(probeExportCapability).not.toHaveBeenCalled()

    await act(async () => {
      await result.current.exportImage({ quality: 'high', fidelity: 'max' })
    })
    await flushScheduledToasts()

    expect(exportSystemMock.runFullResolutionExportJob).not.toHaveBeenCalled()
    expect(toastMock.error).toHaveBeenCalledWith(
      'Full-resolution export is not ready',
      { description: 'Quick preview is still being prepared.' },
    )
    expect(toastMock.error).toHaveBeenCalledWith('Preview unavailable', {
      description:
        'Full-resolution export needs a decoded RAW preview exposure before it can run.',
    })
  })

  it('keeps full-resolution export disabled until the source file is actually loaded', () => {
    jotaiStore.set(currentSessionAtom, createTestSession())

    const { result } = renderHook(() => useRawProcessor(), { wrapper })

    expect(result.current.canExport).toBe(false)
  })

  it.each(['missing-color-transform', 'unsupported-orientation'])(
    'keeps full-resolution export disabled when capability reports %s',
    async (reason) => {
      rawRuntimeAdapterMock.extractEmbeddedPreview.mockResolvedValue(null)
      rawRuntimeAdapterMock.decodeQuickRaw.mockResolvedValue(
        createDecodedImage('quick'),
      )
      rawRuntimeAdapterMock.decodeBoundedHqRaw.mockResolvedValue(
        createDecodedImage('bounded-hq'),
      )
      rawRuntimeAdapterMock.probeExportCapability.mockResolvedValue(
        createUnsupportedCapability(reason),
      )

      const { result } = renderHook(() => useRawProcessor(), { wrapper })

      await act(async () => {
        await result.current.loadFile(new File(['raw'], 'frame.ARW'))
      })

      expect(result.current.canExport).toBe(false)
      expect(jotaiStore.get(currentSessionAtom)?.exportState).toMatchObject({
        fullResCapability: {
          status: 'unsupported',
          reason,
        },
      })

      await act(async () => {
        await result.current.exportImage({ quality: 'high', fidelity: 'max' })
      })
      await flushScheduledToasts()

      expect(exportSystemMock.runFullResolutionExportJob).not.toHaveBeenCalled()
      expect(toastMock.error).toHaveBeenCalledWith(
        'Full-resolution export is not ready',
        { description: reason },
      )
    },
  )

  it('keeps full-resolution export disabled for raw-mosaic window capability', async () => {
    rawRuntimeAdapterMock.extractEmbeddedPreview.mockResolvedValue(null)
    rawRuntimeAdapterMock.decodeQuickRaw.mockResolvedValue(
      createDecodedImage('quick'),
    )
    rawRuntimeAdapterMock.decodeBoundedHqRaw.mockResolvedValue(
      createDecodedImage('bounded-hq'),
    )
    rawRuntimeAdapterMock.probeExportCapability.mockResolvedValue(
      createRawMosaicCapability(),
    )

    const { result } = renderHook(() => useRawProcessor(), { wrapper })

    await act(async () => {
      await result.current.loadFile(new File(['raw'], 'frame.ARW'))
    })

    expect(result.current.canExport).toBe(false)
    expect(jotaiStore.get(currentSessionAtom)?.exportState).toMatchObject({
      fullResCapability: {
        status: 'unsupported',
        reason: 'processed-window-unavailable',
      },
    })

    await act(async () => {
      await result.current.exportImage({ quality: 'high', fidelity: 'max' })
    })
    await flushScheduledToasts()

    expect(exportSystemMock.runFullResolutionExportJob).not.toHaveBeenCalled()
    expect(toastMock.error).toHaveBeenCalledWith(
      'Full-resolution export is not ready',
      { description: 'processed-window-unavailable' },
    )
  })

  it('keeps full-resolution export disabled with product copy when JPEG readiness fails', async () => {
    const reason =
      'Full-resolution JPEG export is not available in this browser build.'

    rawRuntimeAdapterMock.extractEmbeddedPreview.mockResolvedValue(null)
    rawRuntimeAdapterMock.decodeQuickRaw.mockResolvedValue(
      createDecodedImage('quick'),
    )
    rawRuntimeAdapterMock.decodeBoundedHqRaw.mockResolvedValue(
      createDecodedImage('bounded-hq'),
    )
    rawRuntimeAdapterMock.probeExportCapability.mockRejectedValue(
      new Error(reason),
    )

    const { result } = renderHook(() => useRawProcessor(), { wrapper })

    await act(async () => {
      await result.current.loadFile(new File(['raw'], 'frame.ARW'))
    })

    expect(result.current.canExport).toBe(false)
    expect(jotaiStore.get(currentSessionAtom)?.exportState).toMatchObject({
      fullResCapability: {
        status: 'unsupported',
        reason,
      },
    })

    await act(async () => {
      await result.current.exportImage({ quality: 'high', fidelity: 'max' })
    })
    await flushScheduledToasts()

    expect(exportSystemMock.runFullResolutionExportJob).not.toHaveBeenCalled()
    expect(toastMock.error).toHaveBeenCalledWith(
      'Full-resolution export is not ready',
      { description: reason },
    )
  })

  it('runs the full-resolution export job with decoded render exposure and records strip progress', async () => {
    const renderExposure: RawRenderExposure = {
      ev: 1.25,
      multiplier: Math.pow(2, 1.25),
      source: 'image-statistics',
    }

    rawRuntimeAdapterMock.extractEmbeddedPreview.mockResolvedValue(null)
    rawRuntimeAdapterMock.decodeQuickRaw.mockResolvedValue(
      createDecodedImage('quick'),
    )
    rawRuntimeAdapterMock.decodeBoundedHqRaw.mockResolvedValue(
      createDecodedImage('bounded-hq', { renderExposure }),
    )
    rawRuntimeAdapterMock.probeExportCapability.mockResolvedValue(
      createSupportedCapability(),
    )
    exportSystemMock.runFullResolutionExportJob.mockImplementation(
      async ({
        onProgress,
        filename,
      }: {
        onProgress?: (progress: {
          completedStrips: number
          totalStrips: number
          progress: number
        }) => void
        filename: string
      }) => {
        onProgress?.({ completedStrips: 1, totalStrips: 4, progress: 25 })
        onProgress?.({ completedStrips: 4, totalStrips: 4, progress: 100 })
        return {
          filename,
          blob: new Blob(['jpeg'], { type: 'image/jpeg' }),
        }
      },
    )

    const click = vi.fn()
    const remove = vi.fn()
    const append = vi.fn()
    const revokeObjectURL = vi.fn()
    const originalCreateElement = document.createElement.bind(document)

    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:fullres-export'),
      revokeObjectURL,
    })
    vi.spyOn(document.body, 'append').mockImplementation(append)
    vi.spyOn(document, 'createElement').mockImplementation(((
      tagName: string,
    ) => {
      if (tagName === 'a') {
        return {
          href: '',
          download: '',
          click,
          remove,
        }
      }
      return originalCreateElement(tagName)
    }) as typeof document.createElement)

    const { result } = renderHook(() => useRawProcessor(), { wrapper })

    await act(async () => {
      await result.current.loadFile(new File(['raw'], 'frame.ARW'))
    })

    await act(async () => {
      await result.current.exportImage({ quality: 'high', fidelity: 'max' })
    })

    expect(exportSystemMock.runFullResolutionExportJob).toHaveBeenCalledTimes(1)
    const exportRequest =
      exportSystemMock.runFullResolutionExportJob.mock.calls[0]![0]
    const expectedExportGraphSteps = [
      { kind: 'input-linear-prophoto' },
      {
        kind: 'raw-render-exposure',
        ev: renderExposure.ev,
        multiplier: renderExposure.multiplier,
      },
      { kind: 'user-exposure', ev: 0, multiplier: 1 },
      {
        kind: 'user-contrast',
        amount: 0,
        factor: 1,
        pivot: 0.18,
        operator: 'linear-prophoto-luminance-scale',
        luminanceCoefficients: [0.2880402, 0.7118741, 0.0000857],
        zeroLuminanceMode: 'return-black',
      },
      { kind: 'output-srgb' },
    ]

    expect(exportRequest.graph.steps).toEqual(expectedExportGraphSteps)
    expect(exportSystemMock.runFullResolutionExportJob).toHaveBeenCalledWith(
      expect.objectContaining({
        file: expect.any(File),
        filename: 'frame_neutral_fullres.jpg',
        executionPlan: expect.objectContaining({
          preferredRows: expect.any(Number),
          concurrency: expect.any(Number),
        }),
        quality: 0.92,
        graph: expect.objectContaining({
          steps: expectedExportGraphSteps,
        }),
      }),
    )
    expect(jotaiStore.get(currentSessionAtom)?.exportState).toMatchObject({
      status: 'ready',
      lastProgress: {
        completedStrips: 4,
        totalStrips: 4,
      },
      lastSuccessfulSize: {
        width: 6048,
        height: 4024,
      },
      result: {
        filename: 'frame_neutral_fullres.jpg',
        width: 6048,
        height: 4024,
        size: 4,
      },
    })
    expect(click).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
    expect(append).not.toHaveBeenCalled()
    expect(revokeObjectURL).not.toHaveBeenCalled()
  })

  it('records ios-safe active plan and checkpoint durability while full-resolution export is running', async () => {
    const pendingExport = deferred<{ filename: string; blob: Blob }>()

    vi.stubGlobal('navigator', {
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
      maxTouchPoints: 1,
      storage: {},
      hardwareConcurrency: 4,
    })
    vi.stubGlobal('crossOriginIsolated', false)

    rawRuntimeAdapterMock.extractEmbeddedPreview.mockResolvedValue(null)
    rawRuntimeAdapterMock.decodeQuickRaw.mockResolvedValue(
      createDecodedImage('quick'),
    )
    rawRuntimeAdapterMock.decodeBoundedHqRaw.mockResolvedValue(
      createDecodedImage('bounded-hq'),
    )
    rawRuntimeAdapterMock.probeExportCapability.mockResolvedValue(
      createSupportedCapability(),
    )
    exportSystemMock.runFullResolutionExportJob.mockReturnValue(
      pendingExport.promise,
    )

    const { result } = renderHook(() => useRawProcessor(), { wrapper })
    let exportPromise!: Promise<void>

    await act(async () => {
      await result.current.loadFile(new File(['raw'], 'frame.ARW'))
    })
    await act(async () => {
      exportPromise = result.current.exportImage({
        quality: 'high',
        fidelity: 'balanced',
      })
      await Promise.resolve()
    })

    const exportState = jotaiStore.get(currentSessionAtom)?.exportState
    expect(exportState).toMatchObject({
      status: 'exporting',
      activePlan: {
        profileName: 'ios-safe',
        preferredRows: 128,
        concurrency: 1,
        runtimeMemoryProfile: 'low-memory',
        outputSink: 'blob-handoff',
        checkpointMode: 'safe-retry',
      },
      checkpointDurable: false,
      retryRecommended: false,
    })
    expect(exportState?.result).toBeUndefined()
    expect(exportState?.lastProgress).toBeUndefined()
    expect(result.current.previewSuspended).toBe(true)

    expect(exportSystemMock.runFullResolutionExportJob).toHaveBeenCalledWith(
      expect.objectContaining({
        executionPlan: expect.objectContaining({
          profile: expect.objectContaining({ name: 'ios-safe' }),
          preferredRows: 128,
          concurrency: 1,
          runtimeMemoryProfile: 'low-memory',
          outputSink: 'blob-handoff',
          checkpointMode: 'safe-retry',
        }),
      }),
    )

    await act(async () => {
      pendingExport.resolve({
        filename: 'frame_neutral_fullres.jpg',
        blob: new Blob(['jpeg'], { type: 'image/jpeg' }),
      })
      await exportPromise
    })
  })

  it('keeps the desktop-fast preview pipeline mounted during export', async () => {
    vi.stubGlobal('navigator', {
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
      maxTouchPoints: 0,
      storage: {},
      hardwareConcurrency: 8,
    })
    vi.stubGlobal('crossOriginIsolated', true)

    const pipelineDispose = vi.fn()
    const pipeline = {
      dispose: pipelineDispose,
    } as never

    const pendingExport = deferred<{ filename: string; blob: Blob }>()
    exportSystemMock.runFullResolutionExportJob.mockReturnValue(
      pendingExport.promise,
    )

    const { result } = renderHook(() => useRawProcessor(), { wrapper })

    await act(async () => {
      await result.current.loadFile(new File(['raw'], 'frame.ARW'))
    })

    act(() => {
      result.current.pipelineRef.current = pipeline
    })

    let exportPromise!: Promise<void>
    await act(async () => {
      exportPromise = result.current.exportImage({
        quality: 'high',
        fidelity: 'balanced',
      })
      await Promise.resolve()
    })

    expect(exportSystemMock.runFullResolutionExportJob).toHaveBeenCalledWith(
      expect.objectContaining({
        executionPlan: expect.objectContaining({
          profile: expect.objectContaining({ name: 'desktop-fast' }),
        }),
      }),
    )
    expect(result.current.previewSuspended).toBe(false)
    expect(pipelineDispose).not.toHaveBeenCalled()
    expect(result.current.pipelineRef.current).toBe(pipeline)

    await act(async () => {
      pendingExport.resolve({
        filename: 'frame_neutral_fullres.jpg',
        blob: new Blob(['jpeg'], { type: 'image/jpeg' }),
      })
      await exportPromise
    })
  })

  it('does not start unsafe 100MP iOS WebKit blob-handoff export without a durable sink', async () => {
    vi.stubGlobal('navigator', {
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
      maxTouchPoints: 1,
      storage: {},
      hardwareConcurrency: 4,
    })
    vi.stubGlobal('crossOriginIsolated', false)

    rawRuntimeAdapterMock.probeExportCapability.mockResolvedValue({
      ...createSupportedCapability(),
      width: 11662,
      height: 8746,
      rawWidth: 11662,
      rawHeight: 8746,
    })
    exportSystemMock.runFullResolutionExportJob.mockResolvedValue({
      filename: 'frame_neutral_fullres.jpg',
      blob: new Blob(['jpeg'], { type: 'image/jpeg' }),
    })

    const { result } = renderHook(() => useRawProcessor(), { wrapper })

    await act(async () => {
      await result.current.loadFile(new File(['raw'], 'frame.RAF'))
    })

    expect(result.current.canExport).toBe(false)
    expect(result.current.exportDisabledReason).toMatch(
      /cannot safely complete a 100MP local full-resolution export/i,
    )

    await act(async () => {
      await result.current.exportImage({
        quality: 'high',
        fidelity: 'balanced',
      })
    })
    await flushScheduledToasts()

    expect(exportSystemMock.runFullResolutionExportJob).not.toHaveBeenCalled()
    expect(toastMock.error).toHaveBeenCalledWith(
      'Full-resolution export is not ready',
      expect.objectContaining({
        description: expect.stringMatching(
          /cannot safely complete a 100MP local full-resolution export/i,
        ),
      }),
    )
  })

  it('writes OPFS safe-retry checkpoint manifests for durable ios-safe exports', async () => {
    vi.stubGlobal('navigator', {
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
      maxTouchPoints: 1,
      storage: { getDirectory: vi.fn() },
      hardwareConcurrency: 4,
    })
    vi.stubGlobal('crossOriginIsolated', false)

    rawRuntimeAdapterMock.extractEmbeddedPreview.mockResolvedValue(null)
    rawRuntimeAdapterMock.decodeQuickRaw.mockResolvedValue(
      createDecodedImage('quick'),
    )
    rawRuntimeAdapterMock.decodeBoundedHqRaw.mockResolvedValue(
      createDecodedImage('bounded-hq'),
    )
    rawRuntimeAdapterMock.probeExportCapability.mockResolvedValue(
      createSupportedCapability(),
    )
    exportSystemMock.runFullResolutionExportJob.mockResolvedValue({
      filename: 'frame_neutral_fullres.jpg',
      blob: new Blob(['jpeg'], { type: 'image/jpeg' }),
    })

    const { result } = renderHook(() => useRawProcessor(), { wrapper })
    const file = new File(['raw'], 'frame.ARW', { lastModified: 123 })

    await act(async () => {
      await result.current.loadFile(file)
    })
    await act(async () => {
      await result.current.exportImage({
        quality: 'high',
        fidelity: 'balanced',
      })
    })

    expect(sourceFingerprintMock.createSourceFingerprint).toHaveBeenCalledWith(
      file,
      { width: 6048, height: 4024 },
    )
    expect(checkpointStoreMock.writeActive).toHaveBeenCalledWith(
      expect.objectContaining({
        version: 1,
        fileName: 'frame.ARW',
        profile: 'ios-safe',
        preferredRows: 128,
        recoveryMode: 'safe-retry',
        outputSink: 'opfs-file',
        sourceReacquisition: 'user-reselect-required',
        completedRowsForDiagnostics: 0,
        jpegState: 'restart-required',
      }),
    )
    expect(exportSystemMock.runFullResolutionExportJob).toHaveBeenCalledWith(
      expect.objectContaining({
        executionPlan: expect.objectContaining({
          profile: expect.objectContaining({ name: 'ios-safe' }),
          outputSink: 'opfs-file',
        }),
        checkpoint: expect.objectContaining({
          graphFingerprint: expect.any(String),
          sourceFingerprint: expect.objectContaining({
            hashPrefixHex: 'abc',
          }),
        }),
      }),
    )
    expect(checkpointStoreMock.removeActiveManifest).toHaveBeenCalledWith(
      expect.any(String),
    )
  })

  it('drains checkpoint metric writes before removing a successful manifest', async () => {
    vi.stubGlobal('navigator', {
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
      maxTouchPoints: 1,
      storage: { getDirectory: vi.fn() },
      hardwareConcurrency: 4,
    })
    vi.stubGlobal('crossOriginIsolated', false)
    const metricWrite = deferred<void>()

    checkpointStoreMock.writeActive
      .mockResolvedValueOnce(undefined)
      .mockReturnValueOnce(metricWrite.promise)
    rawRuntimeAdapterMock.extractEmbeddedPreview.mockResolvedValue(null)
    rawRuntimeAdapterMock.decodeQuickRaw.mockResolvedValue(
      createDecodedImage('quick'),
    )
    rawRuntimeAdapterMock.decodeBoundedHqRaw.mockResolvedValue(
      createDecodedImage('bounded-hq'),
    )
    rawRuntimeAdapterMock.probeExportCapability.mockResolvedValue(
      createSupportedCapability(),
    )
    exportSystemMock.runFullResolutionExportJob.mockImplementation(
      async (request) => {
        request.onMetric?.({
          kind: 'checkpoint',
          requestId: 'request-1',
          completedRowsForDiagnostics: 128,
          totalRows: 4024,
          stripRows: 128,
          timestamp: '2026-05-01T00:00:01.000Z',
        })
        return {
          filename: 'frame_neutral_fullres.jpg',
          blob: new Blob(['jpeg'], { type: 'image/jpeg' }),
        }
      },
    )

    const { result } = renderHook(() => useRawProcessor(), { wrapper })
    await act(async () => {
      await result.current.loadFile(
        new File(['raw'], 'frame.ARW', { lastModified: 123 }),
      )
    })

    let exportPromise!: Promise<void>
    await act(async () => {
      exportPromise = result.current.exportImage({
        quality: 'high',
        fidelity: 'balanced',
      })
      await Promise.resolve()
    })
    await waitFor(() => {
      expect(checkpointStoreMock.writeActive).toHaveBeenCalledTimes(2)
    })

    expect(checkpointStoreMock.removeActiveManifest).not.toHaveBeenCalled()

    await act(async () => {
      metricWrite.resolve()
      await exportPromise
    })

    expect(checkpointStoreMock.removeActiveManifest).toHaveBeenCalledTimes(1)
  })

  it('removes the original interrupted manifest after a successful recovery retry', async () => {
    vi.stubGlobal('navigator', {
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
      maxTouchPoints: 1,
      storage: { getDirectory: vi.fn() },
      hardwareConcurrency: 4,
    })
    vi.stubGlobal('crossOriginIsolated', false)
    const checkpointManifest = createCheckpointManifest({
      exportId: 'interrupted-export',
    })
    checkpointStoreMock.listSafeRetryCandidates.mockResolvedValue([
      checkpointManifest,
    ])
    exportSystemMock.runFullResolutionExportJob.mockResolvedValue({
      filename: 'frame_neutral_fullres.jpg',
      blob: new Blob(['jpeg'], { type: 'image/jpeg' }),
    })

    const { result } = renderHook(() => useRawProcessor(), { wrapper })

    await waitFor(() => {
      expect(result.current.exportRecovery.status).toBe('source-required')
    })

    await act(async () => {
      await result.current.recoverInterruptedExport(
        new File(['raw'], 'frame.ARW', { lastModified: 123 }),
      )
    })

    expect(checkpointStoreMock.removeActiveManifest).toHaveBeenCalledWith(
      'interrupted-export',
    )
  })

  it('evacuates preview resources and clears stale export result before full-resolution export', async () => {
    const boundedHqDecode = deferred<DecodedImage>()
    const runtimeDispose = vi.fn()
    const pipelineDispose = vi.fn()
    let boundedHqSignal: AbortSignal | undefined

    rawRuntimeAdapterMock.openSession.mockResolvedValue({
      sourceDimensions: defaultSourceDimensions,
      extractEmbeddedPreview: vi.fn().mockResolvedValue(null),
      decodeQuickRaw: vi.fn().mockResolvedValue(createDecodedImage('quick')),
      decodeBoundedHqRaw: vi.fn((_options, _progress, signal) => {
        boundedHqSignal = signal
        return boundedHqDecode.promise
      }),
      probeExportCapability: vi
        .fn()
        .mockResolvedValue(createSupportedCapability()),
      dispose: runtimeDispose,
    })
    exportSystemMock.runFullResolutionExportJob.mockImplementation(async () => {
      expect(boundedHqSignal?.aborted).toBe(true)
      expect(runtimeDispose).toHaveBeenCalledTimes(1)
      expect(pipelineDispose).toHaveBeenCalledWith({
        releaseContext: false,
      })
      expect(
        jotaiStore.get(currentSessionAtom)?.exportState.result,
      ).toBeUndefined()

      return {
        filename: 'frame_neutral_fullres.jpg',
        blob: new Blob(['new'], { type: 'image/jpeg' }),
      }
    })

    const { result } = renderHook(() => useRawProcessor(), { wrapper })

    await act(async () => {
      await result.current.loadFile(new File(['raw'], 'frame.ARW'))
    })

    act(() => {
      result.current.pipelineRef.current = {
        dispose: pipelineDispose,
      } as never
      const activeSession = jotaiStore.get(currentSessionAtom)!
      jotaiStore.set(currentSessionAtom, {
        ...activeSession,
        exportState: {
          ...activeSession.exportState,
          status: 'ready',
          result: {
            output: createBlobOutputResult({
              blob: new Blob(['old'], { type: 'image/jpeg' }),
              filename: 'stale_fullres.jpg',
            }),
            filename: 'stale_fullres.jpg',
            width: 6048,
            height: 4024,
            size: 3,
            createdAt: 1,
            copyCapability: {
              mode: 'unavailable',
              reason: 'test stale result',
            },
          },
        },
      })
    })

    await waitFor(() => {
      expect(result.current.exportResult?.filename).toBe('stale_fullres.jpg')
    })

    await act(async () => {
      await result.current.exportImage({
        quality: 'high',
        fidelity: 'balanced',
      })
    })

    expect(exportSystemMock.runFullResolutionExportJob).toHaveBeenCalledTimes(1)
    expect(result.current.pipelineRef.current).toBeNull()
    expect(result.current.exportResult?.filename).toBe(
      'frame_neutral_fullres.jpg',
    )

    await act(async () => {
      boundedHqDecode.resolve(createDecodedImage('bounded-hq'))
      await flushPromises()
    })
  })

  it('emits enriched low-memory evacuation diagnostics before full-resolution export', async () => {
    const events: unknown[] = []
    const debugListener = (event: Event) => {
      events.push((event as CustomEvent).detail)
    }
    window.addEventListener('lumaforge-export-debug', debugListener)
    const boundedHqDecode = deferred<DecodedImage>()
    let boundedHqSettled = false
    let boundedHqSignal: AbortSignal | undefined
    const runtimeDispose = vi.fn()
    const pipelineDispose = vi.fn()

    try {
      rawRuntimeAdapterMock.openSession.mockResolvedValue({
        sourceDimensions: defaultSourceDimensions,
        extractEmbeddedPreview: vi.fn().mockResolvedValue(null),
        decodeQuickRaw: vi.fn().mockResolvedValue(createDecodedImage('quick')),
        decodeBoundedHqRaw: vi.fn((_options, _progress, signal) => {
          boundedHqSignal = signal
          return boundedHqDecode.promise
        }),
        probeExportCapability: vi
          .fn()
          .mockResolvedValue(createSupportedCapability()),
        dispose: runtimeDispose,
      })
      exportSystemMock.runFullResolutionExportJob.mockResolvedValue({
        filename: 'frame_neutral_fullres.jpg',
        blob: new Blob(['jpeg'], { type: 'image/jpeg' }),
      })

      const { result } = renderHook(() => useRawProcessor(), { wrapper })

      await act(async () => {
        await result.current.loadFile(new File(['raw'], 'frame.ARW'))
      })
      act(() => {
        result.current.pipelineRef.current = {
          dispose: pipelineDispose,
        } as never
      })
      await act(async () => {
        await result.current.exportImage({
          quality: 'high',
          fidelity: 'balanced',
        })
      })

      const evacuation = events.find(
        (event) =>
          typeof event === 'object' &&
          event !== null &&
          (event as { type?: string }).type === 'resource-evacuated',
      ) as { payload?: Record<string, unknown> } | undefined

      expect(evacuation?.payload).toMatchObject({
        profile: 'mobile-balanced',
        requiredOwners: [
          'preview',
          'bounded-hq',
          'webgl',
          'export-result',
          'lut-fetch',
        ],
        disposedOwners: [
          'preview',
          'bounded-hq',
          'webgl',
          'export-result',
          'lut-fetch',
        ],
        registryCheck: { ok: true },
        remainingLive: [],
      })
      expect(boundedHqSignal?.aborted).toBe(true)
      expect(runtimeDispose).toHaveBeenCalledTimes(1)
      expect(pipelineDispose).toHaveBeenCalledWith({ releaseContext: false })

      await act(async () => {
        boundedHqSettled = true
        boundedHqDecode.resolve(createDecodedImage('bounded-hq'))
        await flushPromises()
      })
    } finally {
      window.removeEventListener('lumaforge-export-debug', debugListener)

      if (!boundedHqSettled) {
        boundedHqSettled = true
        boundedHqDecode.resolve(createDecodedImage('bounded-hq'))
        await flushPromises()
      }
    }
  })

  it('fails before starting the export worker when required evacuation throws', async () => {
    const pipelineDispose = vi.fn(() => {
      throw new Error('dispose failed')
    })

    exportSystemMock.runFullResolutionExportJob.mockResolvedValue({
      filename: 'frame_neutral_fullres.jpg',
      blob: new Blob(['jpeg'], { type: 'image/jpeg' }),
    })

    const { result } = renderHook(() => useRawProcessor(), { wrapper })

    await act(async () => {
      await result.current.loadFile(new File(['raw'], 'frame.ARW'))
    })
    act(() => {
      result.current.pipelineRef.current = {
        dispose: pipelineDispose,
      } as never
    })
    await act(async () => {
      await result.current.exportImage({
        quality: 'high',
        fidelity: 'balanced',
      })
    })

    expect(exportSystemMock.runFullResolutionExportJob).not.toHaveBeenCalled()
    expect(jotaiStore.get(currentSessionAtom)?.exportState).toMatchObject({
      status: 'failed',
      lastErrorCode: 'EXPORT_RESOURCE_EVICTION_INCOMPLETE',
      retryRecommended: false,
    })
  })

  it('does not mark a reset session as exporting when reset aborts during evacuation', async () => {
    const pipelineDispose = deferred<void>()
    const runExport = deferred<{ filename: string; blob: Blob }>()
    const disposePreviewPipeline = vi.fn(() => pipelineDispose.promise)

    rawRuntimeAdapterMock.extractEmbeddedPreview.mockResolvedValue(null)
    rawRuntimeAdapterMock.decodeQuickRaw.mockResolvedValue(
      createDecodedImage('quick'),
    )
    rawRuntimeAdapterMock.decodeBoundedHqRaw.mockResolvedValue(
      createDecodedImage('bounded-hq'),
    )
    exportSystemMock.runFullResolutionExportJob.mockReturnValue(
      runExport.promise,
    )

    const { result } = renderHook(() => useRawProcessor(), { wrapper })

    await act(async () => {
      await result.current.loadFile(new File(['raw'], 'frame.ARW'))
    })

    act(() => {
      result.current.pipelineRef.current = {
        dispose: disposePreviewPipeline,
      } as never
    })

    let exportPromise!: Promise<void>
    await act(async () => {
      exportPromise = result.current.exportImage({
        quality: 'high',
        fidelity: 'balanced',
      })
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(disposePreviewPipeline).toHaveBeenCalledWith({
        releaseContext: false,
      })
    })

    await act(async () => {
      result.current.reset()
    })

    await act(async () => {
      pipelineDispose.resolve()
      runExport.resolve({
        filename: 'late_fullres.jpg',
        blob: new Blob(['late'], { type: 'image/jpeg' }),
      })
      await exportPromise
    })

    expect(exportSystemMock.runFullResolutionExportJob).not.toHaveBeenCalled()
    expect(jotaiStore.get(currentSessionAtom)).toBeNull()
    expect(result.current.status).toBe('idle')
  })

  it('downloads a ready export only when downloadExportResult is called', async () => {
    rawRuntimeAdapterMock.extractEmbeddedPreview.mockResolvedValue(null)
    rawRuntimeAdapterMock.decodeQuickRaw.mockResolvedValue(
      createDecodedImage('quick'),
    )
    rawRuntimeAdapterMock.decodeBoundedHqRaw.mockResolvedValue(
      createDecodedImage('bounded-hq'),
    )
    exportSystemMock.runFullResolutionExportJob.mockResolvedValue({
      filename: 'frame_neutral_fullres.jpg',
      blob: new Blob(['jpeg'], { type: 'image/jpeg' }),
    })
    const { click } = stubDownloadLink()

    const { result } = renderHook(() => useRawProcessor(), { wrapper })
    await act(async () => {
      await result.current.loadFile(new File(['raw'], 'frame.ARW'))
    })
    await act(async () => {
      await result.current.exportImage({
        quality: 'high',
        fidelity: 'balanced',
      })
    })

    expect(click).not.toHaveBeenCalled()

    await act(async () => {
      result.current.downloadExportResult()
      await Promise.resolve()
    })

    expect(click).toHaveBeenCalledTimes(1)
  })

  it('does not open file-backed export output until a result action runs', async () => {
    const events: unknown[] = []
    const debugListener = (event: Event) => {
      events.push((event as CustomEvent).detail)
    }
    window.addEventListener('lumaforge-export-debug', debugListener)
    const openBlob = vi.fn(
      async () => new Blob(['jpeg'], { type: 'image/jpeg' }),
    )
    const output: FileBackedOutputResult = {
      kind: 'file-backed',
      exportId: 'export-1',
      filename: 'frame_neutral_fullres.jpg',
      byteLength: 4,
      mimeType: 'image/jpeg',
      openBlob,
    }

    try {
      exportSystemMock.runFullResolutionExportJob.mockResolvedValue({
        filename: 'frame_neutral_fullres.jpg',
        output,
      })
      const { click } = stubDownloadLink()

      const { result } = renderHook(() => useRawProcessor(), { wrapper })
      await act(async () => {
        await result.current.loadFile(new File(['raw'], 'frame.ARW'))
      })
      await act(async () => {
        await result.current.exportImage({
          quality: 'high',
          fidelity: 'balanced',
        })
      })

      expect(openBlob).not.toHaveBeenCalled()
      expect(result.current.exportResult?.output.kind).toBe('file-backed')

      await act(async () => {
        await result.current.downloadExportResult()
      })

      expect(openBlob).toHaveBeenCalledTimes(1)
      expect(click).toHaveBeenCalledTimes(1)
      expect(events).toContainEqual(
        expect.objectContaining({
          type: 'output-materialized',
          payload: expect.objectContaining({
            action: 'download',
            outputKind: 'file-backed',
            filename: 'frame_neutral_fullres.jpg',
            byteLength: 4,
          }),
        }),
      )
    } finally {
      window.removeEventListener('lumaforge-export-debug', debugListener)
    }
  })

  it('cleans up file-backed export output when resetting the session', async () => {
    const cleanup = vi.fn(async () => undefined)
    const output: FileBackedOutputResult = {
      kind: 'file-backed',
      exportId: 'export-1',
      filename: 'frame_neutral_fullres.jpg',
      byteLength: 4,
      mimeType: 'image/jpeg',
      openBlob: vi.fn(async () => new Blob(['jpeg'], { type: 'image/jpeg' })),
      cleanup,
    }

    rawRuntimeAdapterMock.extractEmbeddedPreview.mockResolvedValue(null)
    rawRuntimeAdapterMock.decodeQuickRaw.mockResolvedValue(
      createDecodedImage('quick'),
    )
    rawRuntimeAdapterMock.decodeBoundedHqRaw.mockResolvedValue(
      createDecodedImage('bounded-hq'),
    )
    exportSystemMock.runFullResolutionExportJob.mockResolvedValue({
      filename: 'frame_neutral_fullres.jpg',
      output,
    })

    const { result } = renderHook(() => useRawProcessor(), { wrapper })
    await act(async () => {
      await result.current.loadFile(new File(['raw'], 'frame.ARW'))
    })
    await act(async () => {
      await result.current.exportImage({
        quality: 'high',
        fidelity: 'balanced',
      })
    })

    expect(result.current.exportResult?.output).toMatchObject({
      kind: 'file-backed',
      exportId: 'export-1',
      filename: 'frame_neutral_fullres.jpg',
    })

    act(() => {
      result.current.reset()
    })
    await waitFor(() => {
      expect(cleanup).toHaveBeenCalledTimes(1)
    })

    act(() => {
      result.current.reset()
    })
    await Promise.resolve()
    expect(cleanup).toHaveBeenCalledTimes(1)
  })

  it('preserves metadata lazily for file-backed export output', async () => {
    const output = createMemoryFileBackedOutputResult({
      exportId: 'export-1',
      filename: 'frame_neutral_fullres.jpg',
      mimeType: 'image/jpeg',
      bytes: makeJfifOnlyJpegBytes(),
    })

    rawRuntimeAdapterMock.extractEmbeddedPreview.mockResolvedValue(null)
    rawRuntimeAdapterMock.decodeQuickRaw.mockResolvedValue(
      createDecodedImage('quick'),
    )
    rawRuntimeAdapterMock.decodeBoundedHqRaw.mockResolvedValue(
      createDecodedImage('bounded-hq'),
    )
    exportSystemMock.runFullResolutionExportJob.mockResolvedValue({
      filename: 'frame_neutral_fullres.jpg',
      output,
    })

    const { result } = renderHook(() => useRawProcessor(), { wrapper })
    await act(async () => {
      await result.current.loadFile(new File(['raw'], 'frame.ARW'))
    })
    await act(async () => {
      await result.current.exportImage({
        quality: 'high',
        fidelity: 'balanced',
      })
    })

    const exportResult = result.current.exportResult
    if (!exportResult) throw new Error('missing export result')

    const bytes = await readBlobBytes(
      await materializeOutputBlob(exportResult.output),
    )
    expect(bytesIncludeAscii(bytes, 'Exif\0\0')).toBe(true)
    expect(bytesIncludeAscii(bytes, 'Sony')).toBe(true)
    expect(bytesIncludeAscii(bytes, 'A7')).toBe(true)
  })

  it('keeps a ready export after share cancellation', async () => {
    rawRuntimeAdapterMock.extractEmbeddedPreview.mockResolvedValue(null)
    rawRuntimeAdapterMock.decodeQuickRaw.mockResolvedValue(
      createDecodedImage('quick'),
    )
    rawRuntimeAdapterMock.decodeBoundedHqRaw.mockResolvedValue(
      createDecodedImage('bounded-hq'),
    )
    exportSystemMock.runFullResolutionExportJob.mockResolvedValue({
      filename: 'frame_neutral_fullres.jpg',
      blob: new Blob(['jpeg'], { type: 'image/jpeg' }),
    })
    vi.stubGlobal('navigator', {
      canShare: vi.fn(() => true),
      share: vi.fn().mockRejectedValue(new DOMException('Abort', 'AbortError')),
    })

    const { result } = renderHook(() => useRawProcessor(), { wrapper })
    await act(async () => {
      await result.current.loadFile(new File(['raw'], 'frame.ARW'))
    })
    await act(async () => {
      await result.current.exportImage({
        quality: 'high',
        fidelity: 'balanced',
      })
    })
    await act(async () => {
      await result.current.shareExportResult()
    })

    expect(toastMock.error).not.toHaveBeenCalledWith(
      'Share failed',
      expect.anything(),
    )
    expect(jotaiStore.get(currentSessionAtom)?.exportState.status).toBe('ready')
    expect(jotaiStore.get(currentSessionAtom)?.exportState.result).toBeDefined()
  })

  it('clears a ready export when render graph inputs change but not when compare split changes', async () => {
    const cleanup = vi.fn(async () => undefined)
    const output: FileBackedOutputResult = {
      kind: 'file-backed',
      exportId: 'export-graph-invalidation',
      filename: 'frame_neutral_fullres.jpg',
      byteLength: 4,
      mimeType: 'image/jpeg',
      openBlob: vi.fn(async () => new Blob(['jpeg'], { type: 'image/jpeg' })),
      cleanup,
    }

    rawRuntimeAdapterMock.extractEmbeddedPreview.mockResolvedValue(null)
    rawRuntimeAdapterMock.decodeQuickRaw.mockResolvedValue(
      createDecodedImage('quick'),
    )
    rawRuntimeAdapterMock.decodeBoundedHqRaw.mockResolvedValue(
      createDecodedImage('bounded-hq'),
    )
    exportSystemMock.runFullResolutionExportJob.mockResolvedValue({
      filename: 'frame_neutral_fullres.jpg',
      output,
    })

    const { result } = renderHook(() => useRawProcessor(), { wrapper })
    await act(async () => {
      await result.current.loadFile(new File(['raw'], 'frame.ARW'))
    })
    await act(async () => {
      await result.current.exportImage({
        quality: 'high',
        fidelity: 'balanced',
      })
    })

    expect(jotaiStore.get(currentSessionAtom)?.exportState.result).toBeDefined()

    act(() => {
      result.current.setCompareSplit(0.25)
    })
    expect(jotaiStore.get(currentSessionAtom)?.exportState.result).toBeDefined()
    expect(cleanup).not.toHaveBeenCalled()

    act(() => {
      result.current.selectIntensityLevel('strong')
    })
    expect(jotaiStore.get(currentSessionAtom)?.exportState.status).toBe('idle')
    expect(
      jotaiStore.get(currentSessionAtom)?.exportState.result,
    ).toBeUndefined()
    await waitFor(() => {
      expect(cleanup).toHaveBeenCalledTimes(1)
    })
  })

  it('clears a ready export when generic params change render graph inputs but not view-only inputs', async () => {
    rawRuntimeAdapterMock.extractEmbeddedPreview.mockResolvedValue(null)
    rawRuntimeAdapterMock.decodeQuickRaw.mockResolvedValue(
      createDecodedImage('quick'),
    )
    rawRuntimeAdapterMock.decodeBoundedHqRaw.mockResolvedValue(
      createDecodedImage('bounded-hq'),
    )
    exportSystemMock.runFullResolutionExportJob.mockResolvedValue({
      filename: 'frame_neutral_fullres.jpg',
      blob: new Blob(['jpeg'], { type: 'image/jpeg' }),
    })

    const { result } = renderHook(() => useRawProcessor(), { wrapper })
    await act(async () => {
      await result.current.loadFile(new File(['raw'], 'frame.ARW'))
    })
    await act(async () => {
      await result.current.exportImage({
        quality: 'high',
        fidelity: 'balanced',
      })
    })

    expect(jotaiStore.get(currentSessionAtom)?.exportState.result).toBeDefined()

    act(() => {
      result.current.setParams({ viewMode: 'processed', compareSplit: 0.25 })
    })
    expect(jotaiStore.get(currentSessionAtom)?.exportState.status).toBe('ready')
    expect(jotaiStore.get(currentSessionAtom)?.exportState.result).toBeDefined()

    act(() => {
      result.current.setParams({ styleKind: 'builtin', builtinPreset: 'warm' })
    })
    expect(jotaiStore.get(currentSessionAtom)?.exportState.status).toBe('idle')
    expect(
      jotaiStore.get(currentSessionAtom)?.exportState.result,
    ).toBeUndefined()
  })

  it('clears a ready export when generic params change intensity', async () => {
    rawRuntimeAdapterMock.extractEmbeddedPreview.mockResolvedValue(null)
    rawRuntimeAdapterMock.decodeQuickRaw.mockResolvedValue(
      createDecodedImage('quick'),
    )
    rawRuntimeAdapterMock.decodeBoundedHqRaw.mockResolvedValue(
      createDecodedImage('bounded-hq'),
    )
    exportSystemMock.runFullResolutionExportJob.mockResolvedValue({
      filename: 'frame_neutral_fullres.jpg',
      blob: new Blob(['jpeg'], { type: 'image/jpeg' }),
    })

    const { result } = renderHook(() => useRawProcessor(), { wrapper })
    await act(async () => {
      await result.current.loadFile(new File(['raw'], 'frame.ARW'))
    })
    await act(async () => {
      await result.current.exportImage({
        quality: 'high',
        fidelity: 'balanced',
      })
    })

    expect(jotaiStore.get(currentSessionAtom)?.exportState.result).toBeDefined()

    act(() => {
      result.current.setParams({ intensity: 0.2 })
    })
    expect(jotaiStore.get(currentSessionAtom)?.exportState.status).toBe('idle')
    expect(
      jotaiStore.get(currentSessionAtom)?.exportState.result,
    ).toBeUndefined()
  })

  it('clears a ready export when user tone changes', async () => {
    rawRuntimeAdapterMock.extractEmbeddedPreview.mockResolvedValue(null)
    rawRuntimeAdapterMock.decodeQuickRaw.mockResolvedValue(
      createDecodedImage('quick'),
    )
    rawRuntimeAdapterMock.decodeBoundedHqRaw.mockResolvedValue(
      createDecodedImage('bounded-hq'),
    )
    exportSystemMock.runFullResolutionExportJob.mockResolvedValue({
      filename: 'frame_neutral_fullres.jpg',
      blob: new Blob(['jpeg'], { type: 'image/jpeg' }),
    })

    const { result } = renderHook(() => useRawProcessor(), { wrapper })
    await act(async () => {
      await result.current.loadFile(new File(['raw'], 'frame.ARW'))
    })
    await act(async () => {
      await result.current.exportImage({
        quality: 'high',
        fidelity: 'balanced',
      })
    })

    expect(jotaiStore.get(currentSessionAtom)?.exportState.result).toBeDefined()

    act(() => {
      result.current.setToneParams({ userExposureEv: 1 })
    })

    expect(jotaiStore.get(currentSessionAtom)?.exportState.status).toBe('idle')
    expect(
      jotaiStore.get(currentSessionAtom)?.exportState.result,
    ).toBeUndefined()
  })

  it('resets only tone params from the tone reset action', () => {
    const { result } = renderHook(() => useRawProcessor(), { wrapper })

    act(() => {
      result.current.setParams({
        userExposureEv: 1,
        userContrast: 50,
        styleKind: 'custom',
        intensity: 0.2,
      })
    })
    act(() => {
      result.current.resetTone()
    })

    expect(result.current.params).toMatchObject({
      userExposureEv: 0,
      userContrast: 0,
      styleKind: 'custom',
      intensity: 0.2,
    })
  })

  it('merges back-to-back partial tone updates before React re-renders', () => {
    const { result } = renderHook(() => useRawProcessor(), { wrapper })

    act(() => {
      result.current.setToneParams({ userExposureEv: 1 })
      result.current.setToneParams({ userContrast: 50 })
    })

    expect(result.current.params).toMatchObject({
      userExposureEv: 1,
      userContrast: 50,
    })
  })

  it('passes user tone into full-resolution export graph', async () => {
    rawRuntimeAdapterMock.extractEmbeddedPreview.mockResolvedValue(null)
    rawRuntimeAdapterMock.decodeQuickRaw.mockResolvedValue(
      createDecodedImage('quick'),
    )
    rawRuntimeAdapterMock.decodeBoundedHqRaw.mockResolvedValue(
      createDecodedImage('bounded-hq'),
    )
    exportSystemMock.runFullResolutionExportJob.mockResolvedValue({
      filename: 'frame_tone_fullres.jpg',
      blob: new Blob(['jpeg'], { type: 'image/jpeg' }),
    })

    const { result } = renderHook(() => useRawProcessor(), { wrapper })
    await act(async () => {
      await result.current.loadFile(new File(['raw'], 'frame.ARW'))
    })
    act(() => {
      result.current.setToneParams({ userExposureEv: 1, userContrast: 50 })
    })
    await act(async () => {
      await result.current.exportImage({
        quality: 'high',
        fidelity: 'balanced',
      })
    })

    const [{ graph }] =
      exportSystemMock.runFullResolutionExportJob.mock.calls[0]!
    const userExposureStep = graph.steps.find(
      (step) => step.kind === 'user-exposure',
    )
    const userContrastStep = graph.steps.find(
      (step) => step.kind === 'user-contrast',
    )
    expect(userExposureStep).toMatchObject({
      kind: 'user-exposure',
      ev: 1,
      multiplier: 2,
    })
    expect(userContrastStep).toMatchObject({
      kind: 'user-contrast',
      amount: 50,
      factor: Math.pow(2, 50 / 200),
    })
  })

  it('preserves non-neutral tone when a new image loads', async () => {
    rawRuntimeAdapterMock.extractEmbeddedPreview.mockResolvedValue(null)
    rawRuntimeAdapterMock.decodeQuickRaw.mockResolvedValue(
      createDecodedImage('quick'),
    )
    rawRuntimeAdapterMock.decodeBoundedHqRaw.mockResolvedValue(
      createDecodedImage('bounded-hq'),
    )
    const { result } = renderHook(() => useRawProcessor(), { wrapper })

    act(() => {
      result.current.setToneParams({ userExposureEv: 1, userContrast: 50 })
    })
    await act(async () => {
      await result.current.loadFile(new File(['raw'], 'first.ARW'))
    })
    await act(async () => {
      await result.current.loadFile(new File(['raw'], 'second.ARW'))
    })

    expect(result.current.params).toMatchObject({
      userExposureEv: 1,
      userContrast: 50,
    })
  })

  it('preserves a ready export when controls repeat the active render graph', async () => {
    rawRuntimeAdapterMock.extractEmbeddedPreview.mockResolvedValue(null)
    rawRuntimeAdapterMock.decodeQuickRaw.mockResolvedValue(
      createDecodedImage('quick'),
    )
    rawRuntimeAdapterMock.decodeBoundedHqRaw.mockResolvedValue(
      createDecodedImage('bounded-hq'),
    )
    exportSystemMock.runFullResolutionExportJob.mockResolvedValue({
      filename: 'frame_neutral_fullres.jpg',
      blob: new Blob(['jpeg'], { type: 'image/jpeg' }),
    })

    const { result } = renderHook(() => useRawProcessor(), { wrapper })
    await act(async () => {
      await result.current.loadFile(new File(['raw'], 'frame.ARW'))
    })
    await act(async () => {
      await result.current.exportImage({
        quality: 'high',
        fidelity: 'balanced',
      })
    })

    expect(jotaiStore.get(currentSessionAtom)?.exportState.result).toBeDefined()

    act(() => {
      result.current.clearLUT()
    })
    expect(jotaiStore.get(currentSessionAtom)?.exportState.status).toBe('ready')
    expect(jotaiStore.get(currentSessionAtom)?.exportState.result).toBeDefined()

    act(() => {
      result.current.selectIntensityLevel(result.current.activeIntensity)
    })
    expect(jotaiStore.get(currentSessionAtom)?.exportState.status).toBe('ready')
    expect(jotaiStore.get(currentSessionAtom)?.exportState.result).toBeDefined()
  })

  it('ignores an in-flight export after render graph inputs change', async () => {
    const pendingExport = deferred<{
      filename: string
      blob: Blob
    }>()
    let exportSignal: AbortSignal | undefined

    rawRuntimeAdapterMock.extractEmbeddedPreview.mockResolvedValue(null)
    rawRuntimeAdapterMock.decodeQuickRaw.mockResolvedValue(
      createDecodedImage('quick'),
    )
    rawRuntimeAdapterMock.decodeBoundedHqRaw.mockResolvedValue(
      createDecodedImage('bounded-hq'),
    )
    exportSystemMock.runFullResolutionExportJob.mockImplementation(
      ({ signal }: { signal?: AbortSignal }) => {
        exportSignal = signal
        return pendingExport.promise
      },
    )

    const { result } = renderHook(() => useRawProcessor(), { wrapper })
    let exportPromise!: Promise<void>

    await act(async () => {
      await result.current.loadFile(new File(['raw'], 'frame.ARW'))
    })
    await act(async () => {
      exportPromise = result.current.exportImage({
        quality: 'high',
        fidelity: 'balanced',
      })
      await Promise.resolve()
    })

    expect(exportSignal).toBeInstanceOf(AbortSignal)
    expect(jotaiStore.get(currentSessionAtom)?.exportState.status).toBe(
      'exporting',
    )

    act(() => {
      result.current.selectIntensityLevel('strong')
    })

    expect(exportSignal?.aborted).toBe(true)
    expect(jotaiStore.get(currentSessionAtom)?.exportState.status).toBe('idle')
    expect(
      jotaiStore.get(currentSessionAtom)?.exportState.result,
    ).toBeUndefined()

    await act(async () => {
      pendingExport.resolve({
        filename: 'frame_neutral_fullres.jpg',
        blob: new Blob(['jpeg'], { type: 'image/jpeg' }),
      })
      await exportPromise
    })
    await flushScheduledToasts()

    expect(jotaiStore.get(currentSessionAtom)?.exportState.status).toBe('idle')
    expect(
      jotaiStore.get(currentSessionAtom)?.exportState.result,
    ).toBeUndefined()
    expect(toastMock.success).not.toHaveBeenCalledWith(
      'JPEG ready',
      expect.anything(),
    )
  })

  it('clears a ready export when active render exposure is refreshed', async () => {
    const boundedHqDecode = deferred<DecodedImage>()

    rawRuntimeAdapterMock.extractEmbeddedPreview.mockResolvedValue(null)
    rawRuntimeAdapterMock.decodeQuickRaw.mockResolvedValue(
      createDecodedImage('quick', {
        renderExposure: { ev: 0, multiplier: 1, source: 'identity' },
      }),
    )
    rawRuntimeAdapterMock.decodeBoundedHqRaw.mockReturnValue(
      boundedHqDecode.promise,
    )
    exportSystemMock.runFullResolutionExportJob.mockResolvedValue({
      filename: 'frame_neutral_fullres.jpg',
      blob: new Blob(['jpeg'], { type: 'image/jpeg' }),
    })

    const { result } = renderHook(() => useRawProcessor(), { wrapper })

    await act(async () => {
      await result.current.loadFile(new File(['raw'], 'frame.ARW'))
    })
    await act(async () => {
      await result.current.exportImage({
        quality: 'high',
        fidelity: 'balanced',
      })
    })

    expect(result.current.displaySource).toBe('quick')
    expect(jotaiStore.get(currentSessionAtom)?.exportState.status).toBe('ready')
    expect(jotaiStore.get(currentSessionAtom)?.exportState.result).toBeDefined()

    await act(async () => {
      boundedHqDecode.resolve(
        createDecodedImage('bounded-hq', {
          renderExposure: {
            ev: 1,
            multiplier: 2,
            source: 'image-statistics',
          },
        }),
      )
      await flushPromises()
    })

    expect(result.current.displaySource).toBe('bounded-hq')
    expect(jotaiStore.get(currentSessionAtom)?.exportState.status).toBe('idle')
    expect(
      jotaiStore.get(currentSessionAtom)?.exportState.result,
    ).toBeUndefined()
  })

  it('copies a preview-size export through a hidden processed preview canvas', async () => {
    const clipboardWrite = vi.fn().mockResolvedValue(undefined)
    const renderToHiddenCanvas = vi.fn()
    const dispose = vi.fn()
    const fakeCanvas = {
      toBlob: vi.fn((callback: BlobCallback, type?: string) => {
        callback(new Blob(['png'], { type: type ?? 'image/png' }))
      }),
    }

    class FakeClipboardItem {
      static supports(type: string) {
        return type === 'image/png'
      }

      constructor(public readonly items: Record<string, Blob>) {}
    }

    vi.stubGlobal('navigator', {
      clipboard: { write: clipboardWrite },
    })
    vi.stubGlobal('ClipboardItem', FakeClipboardItem)
    rawRuntimeAdapterMock.extractEmbeddedPreview.mockResolvedValue(null)
    rawRuntimeAdapterMock.decodeQuickRaw.mockResolvedValue(
      createDecodedImage('quick'),
    )
    rawRuntimeAdapterMock.decodeBoundedHqRaw.mockResolvedValue(
      createDecodedImage('bounded-hq'),
    )
    exportSystemMock.runFullResolutionExportJob.mockResolvedValue({
      filename: 'frame_neutral_fullres.jpg',
      blob: new Blob(['jpeg'], { type: 'image/jpeg' }),
    })
    renderToHiddenCanvas.mockResolvedValue(fakeCanvas)

    const { result } = renderHook(() => useRawProcessor(), { wrapper })
    await act(async () => {
      await result.current.loadFile(new File(['raw'], 'frame.ARW'))
    })
    act(() => {
      result.current.updateStats({
        uploadTime: 1,
        lutUploadTime: 0,
        processTime: 2,
        totalTime: 3,
        inputSize: { width: 800, height: 600 },
        previewSize: { width: 640, height: 480 },
        inputFormat: 'uint16-rgb',
        transformPath: 'no-lut',
        lutRole: null,
        lutInputTransfer: null,
        lutOutputTransfer: null,
        lutSize: null,
        processTargetPrecision: 'rgba16f',
        capabilityWarnings: [],
      })
      result.current.pipelineRef.current = {
        renderToHiddenCanvas,
        dispose,
      } as never
    })
    await act(async () => {
      await result.current.exportImage({
        quality: 'high',
        fidelity: 'balanced',
      })
    })
    expect(result.current.pipelineRef.current).toBeNull()
    expect(dispose).toHaveBeenCalledWith({ releaseContext: false })

    await act(async () => {
      await result.current.copyExportResult()
    })
    await flushScheduledToasts()

    expect(result.current.exportResult?.copyCapability).toMatchObject({
      mode: 'preview-size',
    })
    expect(renderToHiddenCanvas).toHaveBeenCalledTimes(1)
    expect(renderToHiddenCanvas).toHaveBeenCalledWith({
      width: 640,
      height: 480,
    })
    expect(fakeCanvas.toBlob).toHaveBeenCalledWith(
      expect.any(Function),
      'image/png',
    )
    expect(clipboardWrite).toHaveBeenCalledTimes(1)
    expect(toastMock.success).toHaveBeenCalledWith('Preview-size image copied')
  })

  it('aborts and disposes stale runtime session when replacing files', async () => {
    const staleQuickDecode = deferred<DecodedImage>()
    const staleSession = {
      sourceDimensions: defaultSourceDimensions,
      extractEmbeddedPreview: vi.fn().mockResolvedValue(null),
      decodeQuickRaw: vi.fn().mockReturnValue(staleQuickDecode.promise),
      decodeBoundedHqRaw: vi.fn(),
      dispose: vi.fn(),
    }
    const currentSession = {
      sourceDimensions: defaultSourceDimensions,
      extractEmbeddedPreview: vi.fn().mockResolvedValue(null),
      decodeQuickRaw: vi.fn().mockResolvedValue(createDecodedImage('quick')),
      decodeBoundedHqRaw: vi
        .fn()
        .mockResolvedValue(createDecodedImage('bounded-hq')),
      dispose: vi.fn(),
    }
    let staleSignal: AbortSignal | undefined
    let currentSignal: AbortSignal | undefined

    rawRuntimeAdapterMock.openSession
      .mockImplementationOnce((_file: File, signal?: AbortSignal) => {
        staleSignal = signal
        return Promise.resolve(staleSession)
      })
      .mockImplementationOnce((_file: File, signal?: AbortSignal) => {
        currentSignal = signal
        return Promise.resolve(currentSession)
      })

    const { result } = renderHook(() => useRawProcessor(), { wrapper })
    let staleLoadPromise!: Promise<void>
    let currentLoadPromise!: Promise<void>

    await act(async () => {
      staleLoadPromise = result.current.loadFile(
        new File(['stale'], 'stale.ARW'),
      )
      await Promise.resolve()
    })
    await waitFor(() => {
      expect(staleSession.decodeQuickRaw).toHaveBeenCalled()
    })

    await act(async () => {
      currentLoadPromise = result.current.loadFile(
        new File(['current'], 'current.ARW'),
      )
      await currentLoadPromise
    })

    expect(staleSignal).toBeInstanceOf(AbortSignal)
    expect(staleSignal?.aborted).toBe(true)
    expect(staleSession.dispose).toHaveBeenCalledTimes(1)
    expect(currentSignal).toBeInstanceOf(AbortSignal)
    expect(currentSignal?.aborted).toBe(false)
    expect(currentSession.dispose).toHaveBeenCalledTimes(1)

    await act(async () => {
      staleQuickDecode.reject(new Error('stale decode aborted'))
      await staleLoadPromise
    })

    expect(staleSession.dispose).toHaveBeenCalledTimes(1)
  })

  it('aborts in-flight export when a replacement file starts and ignores stale completion', async () => {
    const staleExport = deferred<{
      filename: string
      blob: Blob
    }>()
    let staleExportSignal: AbortSignal | undefined
    const click = vi.fn()
    const remove = vi.fn()
    const append = vi.fn()
    const originalCreateElement = document.createElement.bind(document)

    exportSystemMock.runFullResolutionExportJob.mockImplementation(
      ({ signal }: { signal?: AbortSignal }) => {
        staleExportSignal = signal
        return staleExport.promise
      },
    )
    rawRuntimeAdapterMock.extractEmbeddedPreview.mockResolvedValue(null)
    rawRuntimeAdapterMock.decodeQuickRaw.mockResolvedValue(
      createDecodedImage('quick'),
    )
    rawRuntimeAdapterMock.decodeBoundedHqRaw.mockResolvedValue(
      createDecodedImage('bounded-hq'),
    )

    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:stale-export'),
      revokeObjectURL: vi.fn(),
    })
    vi.spyOn(document.body, 'append').mockImplementation(append)
    vi.spyOn(document, 'createElement').mockImplementation(((
      tagName: string,
    ) => {
      if (tagName === 'a') {
        return {
          href: '',
          download: '',
          click,
          remove,
        }
      }
      return originalCreateElement(tagName)
    }) as typeof document.createElement)

    const { result } = renderHook(() => useRawProcessor(), { wrapper })
    let staleExportPromise!: Promise<void>

    await act(async () => {
      await result.current.loadFile(new File(['stale'], 'stale.ARW'))
    })

    await act(async () => {
      staleExportPromise = result.current.exportImage({
        quality: 'high',
        fidelity: 'balanced',
      })
      await Promise.resolve()
    })

    expect(staleExportSignal).toBeInstanceOf(AbortSignal)

    await act(async () => {
      await result.current.loadFile(new File(['current'], 'current.ARW'))
    })

    expect(staleExportSignal?.aborted).toBe(true)

    await act(async () => {
      staleExport.resolve({
        filename: 'stale_neutral_fullres.jpg',
        blob: new Blob(['jpeg'], { type: 'image/jpeg' }),
      })
      await staleExportPromise
    })

    expect(click).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
    expect(append).not.toHaveBeenCalled()
    expect(result.current.sourceFileName).toBe('current.ARW')
    expect(jotaiStore.get(currentSessionAtom)?.exportState.status).toBe('idle')
  })

  it('preserves ready session across unmount while bounded HQ is still pending', async () => {
    const boundedHqDecode = deferred<DecodedImage>()

    rawRuntimeAdapterMock.extractEmbeddedPreview.mockResolvedValue(null)
    rawRuntimeAdapterMock.decodeQuickRaw.mockResolvedValue(
      createDecodedImage('quick'),
    )
    rawRuntimeAdapterMock.decodeBoundedHqRaw.mockReturnValue(
      boundedHqDecode.promise,
    )

    const mounted = renderHook(() => useRawProcessor(), { wrapper })

    await act(async () => {
      await mounted.result.current.loadFile(new File(['raw'], 'frame.ARW'))
    })

    expect(mounted.result.current.status).toBe('ready')
    expect(mounted.result.current.displaySource).toBe('quick')
    expect(mounted.result.current.sourceFileName).toBe('frame.ARW')

    act(() => {
      mounted.unmount()
    })

    const remounted = renderHook(() => useRawProcessor(), { wrapper })
    expect(remounted.result.current.status).toBe('ready')
    expect(remounted.result.current.displaySource).toBe('quick')
    expect(remounted.result.current.sourceFileName).toBe('frame.ARW')
    expect(remounted.result.current.loadedImage.file?.name).toBe('frame.ARW')
    expect(jotaiStore.get(currentSessionAtom)?.sourceFile.name).toBe(
      'frame.ARW',
    )

    remounted.unmount()
  })

  it('aborts and disposes pending bounded HQ runtime session on reset', async () => {
    const boundedHqDecode = deferred<DecodedImage>()
    const runtimeSession = {
      sourceDimensions: defaultSourceDimensions,
      extractEmbeddedPreview: vi.fn().mockResolvedValue(null),
      decodeQuickRaw: vi.fn().mockResolvedValue(createDecodedImage('quick')),
      decodeBoundedHqRaw: vi.fn().mockReturnValue(boundedHqDecode.promise),
      probeExportCapability: vi
        .fn()
        .mockResolvedValue(createSupportedCapability()),
      dispose: vi.fn(),
    }
    let signal: AbortSignal | undefined

    rawRuntimeAdapterMock.openSession.mockImplementation(
      (_file: File, nextSignal?: AbortSignal) => {
        signal = nextSignal
        return Promise.resolve(runtimeSession)
      },
    )

    const { result } = renderHook(() => useRawProcessor(), { wrapper })

    await act(async () => {
      await result.current.loadFile(new File(['raw'], 'frame.ARW'))
    })

    expect(result.current.status).toBe('ready')

    act(() => {
      result.current.reset()
    })

    expect(signal).toBeInstanceOf(AbortSignal)
    expect(signal?.aborted).toBe(true)
    expect(runtimeSession.dispose).toHaveBeenCalledTimes(1)
    expect(result.current.status).toBe('idle')
    expect(jotaiStore.get(currentSessionAtom)).toBeNull()

    await act(async () => {
      boundedHqDecode.resolve(createDecodedImage('bounded-hq'))
      await flushPromises()
    })

    expect(runtimeSession.dispose).toHaveBeenCalledTimes(1)
    expect(jotaiStore.get(currentSessionAtom)).toBeNull()
  })

  it('aborts and disposes stale pending bounded HQ runtime session when replacing files', async () => {
    const staleBoundedHqDecode = deferred<DecodedImage>()
    const staleSession = {
      sourceDimensions: defaultSourceDimensions,
      extractEmbeddedPreview: vi.fn().mockResolvedValue(null),
      decodeQuickRaw: vi.fn().mockResolvedValue(createDecodedImage('quick')),
      decodeBoundedHqRaw: vi.fn().mockReturnValue(staleBoundedHqDecode.promise),
      probeExportCapability: vi
        .fn()
        .mockResolvedValue(createSupportedCapability()),
      dispose: vi.fn(),
    }
    const currentSession = {
      sourceDimensions: defaultSourceDimensions,
      extractEmbeddedPreview: vi.fn().mockResolvedValue(null),
      decodeQuickRaw: vi.fn().mockResolvedValue(createDecodedImage('quick')),
      decodeBoundedHqRaw: vi
        .fn()
        .mockResolvedValue(createDecodedImage('bounded-hq')),
      probeExportCapability: vi
        .fn()
        .mockResolvedValue(createSupportedCapability()),
      dispose: vi.fn(),
    }
    let staleSignal: AbortSignal | undefined
    let currentSignal: AbortSignal | undefined

    rawRuntimeAdapterMock.openSession
      .mockImplementationOnce((_file: File, signal?: AbortSignal) => {
        staleSignal = signal
        return Promise.resolve(staleSession)
      })
      .mockImplementationOnce((_file: File, signal?: AbortSignal) => {
        currentSignal = signal
        return Promise.resolve(currentSession)
      })

    const { result } = renderHook(() => useRawProcessor(), { wrapper })

    await act(async () => {
      await result.current.loadFile(new File(['stale'], 'stale.ARW'))
    })

    expect(result.current.status).toBe('ready')
    expect(result.current.sourceFileName).toBe('stale.ARW')

    await act(async () => {
      await result.current.loadFile(new File(['current'], 'current.ARW'))
    })

    expect(staleSignal).toBeInstanceOf(AbortSignal)
    expect(staleSignal?.aborted).toBe(true)
    expect(staleSession.dispose).toHaveBeenCalledTimes(1)
    expect(currentSignal).toBeInstanceOf(AbortSignal)
    expect(currentSignal?.aborted).toBe(false)
    expect(result.current.status).toBe('ready')
    expect(result.current.sourceFileName).toBe('current.ARW')

    await act(async () => {
      staleBoundedHqDecode.resolve(createDecodedImage('bounded-hq'))
      await flushPromises()
    })

    expect(staleSession.dispose).toHaveBeenCalledTimes(1)
    expect(result.current.sourceFileName).toBe('current.ARW')
    expect(jotaiStore.get(currentSessionAtom)?.sourceFile.name).toBe(
      'current.ARW',
    )
  })

  it('aborts and disposes runtime session on reset', async () => {
    const quickDecode = deferred<DecodedImage>()
    const runtimeSession = {
      sourceDimensions: defaultSourceDimensions,
      extractEmbeddedPreview: vi.fn().mockResolvedValue(null),
      decodeQuickRaw: vi.fn().mockReturnValue(quickDecode.promise),
      decodeBoundedHqRaw: vi.fn(),
      dispose: vi.fn(),
    }
    let signal: AbortSignal | undefined

    rawRuntimeAdapterMock.openSession.mockImplementation(
      (_file: File, nextSignal?: AbortSignal) => {
        signal = nextSignal
        return Promise.resolve(runtimeSession)
      },
    )

    const { result } = renderHook(() => useRawProcessor(), { wrapper })
    let loadPromise!: Promise<void>

    await act(async () => {
      loadPromise = result.current.loadFile(new File(['raw'], 'frame.ARW'))
      await Promise.resolve()
    })
    await waitFor(() => {
      expect(runtimeSession.decodeQuickRaw).toHaveBeenCalled()
    })

    act(() => {
      result.current.reset()
    })

    expect(signal).toBeInstanceOf(AbortSignal)
    expect(signal?.aborted).toBe(true)
    expect(runtimeSession.dispose).toHaveBeenCalledTimes(1)
    expect(result.current.status).toBe('idle')

    await act(async () => {
      quickDecode.reject(new Error('reset aborted decode'))
      await loadPromise
    })

    expect(runtimeSession.dispose).toHaveBeenCalledTimes(1)
  })

  it('does not create embedded object URLs after unmount', async () => {
    const embeddedPreview = deferred<{
      width: number
      height: number
      data: Uint8Array
      mimeType: string
      timings: Record<string, number | undefined>
    } | null>()

    rawRuntimeAdapterMock.extractEmbeddedPreview.mockReturnValue(
      embeddedPreview.promise,
    )
    rawRuntimeAdapterMock.decodeQuickRaw.mockResolvedValue(
      createDecodedImage('quick'),
    )
    rawRuntimeAdapterMock.decodeBoundedHqRaw.mockResolvedValue(
      createDecodedImage('bounded-hq'),
    )

    const { result, unmount } = renderHook(() => useRawProcessor(), { wrapper })
    let loadPromise!: Promise<void>

    await act(async () => {
      loadPromise = result.current.loadFile(new File(['raw'], 'frame.ARW'))
      await Promise.resolve()
    })

    act(() => {
      unmount()
    })

    await act(async () => {
      embeddedPreview.resolve({
        width: 1600,
        height: 1067,
        data: new Uint8Array([1, 2, 3]),
        mimeType: 'image/jpeg',
        timings: { total: 8 },
      })
      await loadPromise
    })

    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })

  it('ignores stale load failures after a replacement session starts', async () => {
    const staleQuickDecode = deferred<DecodedImage>()
    const currentQuickDecode = deferred<DecodedImage>()
    const currentBoundedHqDecode = deferred<DecodedImage>()

    rawRuntimeAdapterMock.extractEmbeddedPreview.mockResolvedValue(null)
    rawRuntimeAdapterMock.decodeQuickRaw
      .mockReturnValueOnce(staleQuickDecode.promise)
      .mockReturnValue(currentQuickDecode.promise)
    rawRuntimeAdapterMock.decodeBoundedHqRaw.mockReturnValue(
      currentBoundedHqDecode.promise,
    )

    const { result } = renderHook(() => useRawProcessor(), { wrapper })
    let staleLoadPromise!: Promise<void>
    let currentLoadPromise!: Promise<void>

    await act(async () => {
      staleLoadPromise = result.current.loadFile(
        new File(['stale'], 'stale.ARW'),
      )
      await Promise.resolve()
    })

    await act(async () => {
      currentLoadPromise = result.current.loadFile(
        new File(['current'], 'current.ARW'),
      )
      await Promise.resolve()
    })

    await act(async () => {
      currentQuickDecode.resolve(createDecodedImage('quick'))
      currentBoundedHqDecode.resolve(createDecodedImage('bounded-hq'))
      await currentLoadPromise
    })
    await waitFor(() => {
      expect(result.current.status).toBe('ready')
    })

    await act(async () => {
      staleQuickDecode.reject(new Error('stale decode failed'))
      await staleLoadPromise
    })

    expect(result.current.error).toBeNull()
    expect(result.current.sourceFileName).toBe('current.ARW')
    expect(toastMock.error).not.toHaveBeenCalledWith(
      'Failed to load RAW file',
      expect.anything(),
    )
  })

  it('clears in-flight loading state on unmount so remount starts idle', async () => {
    const quickDecode = deferred<DecodedImage>()

    rawRuntimeAdapterMock.extractEmbeddedPreview.mockResolvedValue(null)
    rawRuntimeAdapterMock.decodeQuickRaw.mockReturnValue(quickDecode.promise)
    rawRuntimeAdapterMock.decodeBoundedHqRaw.mockResolvedValue(
      createDecodedImage('bounded-hq'),
    )

    const mounted = renderHook(() => useRawProcessor(), { wrapper })
    let loadPromise!: Promise<void>

    await act(async () => {
      loadPromise = mounted.result.current.loadFile(
        new File(['raw'], 'frame.ARW'),
      )
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(mounted.result.current.status).toBe('loading')
    })

    act(() => {
      mounted.unmount()
    })

    const remounted = renderHook(() => useRawProcessor(), { wrapper })
    expect(remounted.result.current.status).toBe('idle')
    expect(remounted.result.current.displaySource).toBe('none')

    await act(async () => {
      quickDecode.reject(new Error('late decode failed'))
      await loadPromise
    })

    expect(remounted.result.current.status).toBe('idle')
    expect(remounted.result.current.error).toBeNull()
    expect(toastMock.error).not.toHaveBeenCalledWith(
      'Failed to load RAW file',
      expect.anything(),
    )

    remounted.unmount()
  })

  it('preserves completed failure state across unmount after active load failure', async () => {
    const quickDecode = deferred<DecodedImage>()

    rawRuntimeAdapterMock.extractEmbeddedPreview.mockResolvedValue(null)
    rawRuntimeAdapterMock.decodeQuickRaw.mockReturnValue(quickDecode.promise)
    rawRuntimeAdapterMock.decodeBoundedHqRaw.mockResolvedValue(
      createDecodedImage('bounded-hq'),
    )

    const mounted = renderHook(() => useRawProcessor(), { wrapper })
    let loadPromise!: Promise<void>

    await act(async () => {
      loadPromise = mounted.result.current.loadFile(
        new File(['raw'], 'failed.ARW'),
      )
      await Promise.resolve()
    })

    await act(async () => {
      quickDecode.reject(new Error('quick decode failed'))
      await loadPromise
    })

    expect(mounted.result.current.status).toBe('error')
    expect(mounted.result.current.error).toBe('quick decode failed')

    act(() => {
      mounted.unmount()
    })

    const remounted = renderHook(() => useRawProcessor(), { wrapper })
    expect(remounted.result.current.status).toBe('error')
    expect(remounted.result.current.error).toBe('quick decode failed')
    expect(remounted.result.current.sourceFileName).toBe('failed.ARW')

    remounted.unmount()
  })
})
