import { act, renderHook, waitFor } from '@testing-library/react'
import { Provider } from 'jotai'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { resetToDefaults } from '~/atoms/raw-processor'
import type { RawRenderExposure } from '~/lib/color/raw-render-exposure'
import { getLUTColorProfile } from '~/lib/color/registry'
import { jotaiStore } from '~/lib/jotai'
import {
  getStoredLUTContractSelection,
  getStoredLUTProfileSelection,
} from '~/lib/lut/profile-resolution'
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
      retryRecommended: false,
    },
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
  })

  afterEach(() => {
    act(() => {
      resetToDefaults()
      jotaiStore.set(currentSessionAtom, null)
    })
    vi.unstubAllGlobals()
    localStorage.clear()
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

    act(() => {
      result.current.selectBuiltinStyle('neutral')
    })

    expect(result.current.activePresetId).toBe('neutral')
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

  it('disables full-resolution export for unsupported builtin styles after the source file is loaded', async () => {
    jotaiStore.set(currentSessionAtom, createTestSession())

    const { result } = renderHook(() => useRawProcessor(), { wrapper })

    rawRuntimeAdapterMock.extractEmbeddedPreview.mockResolvedValue(null)
    rawRuntimeAdapterMock.decodeQuickRaw.mockResolvedValue(
      createDecodedImage('quick'),
    )
    rawRuntimeAdapterMock.decodeBoundedHqRaw.mockResolvedValue(
      createDecodedImage('bounded-hq'),
    )

    await act(async () => {
      await result.current.loadFile(new File(['raw'], 'frame.ARW'))
    })

    expect(result.current.canExport).toBe(true)

    act(() => {
      result.current.selectBuiltinStyle(result.current.presetOptions[0]!.id)
    })

    expect(result.current.canExport).toBe(false)

    await act(async () => {
      await result.current.exportImage({ quality: 'high', fidelity: 'max' })
    })

    expect(exportSystemMock.runFullResolutionExportJob).not.toHaveBeenCalled()
    expect(result.current.error).toBeNull()
    expect(jotaiStore.get(currentSessionAtom)?.exportState).toMatchObject({
      status: 'idle',
    })
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
      { kind: 'output-srgb' },
    ]

    expect(exportRequest.graph.steps).toEqual(expectedExportGraphSteps)
    expect(exportSystemMock.runFullResolutionExportJob).toHaveBeenCalledWith(
      expect.objectContaining({
        file: expect.any(File),
        filename: 'frame_neutral_fullres.jpg',
        preferredRows: 1024,
        concurrency: 3,
        quality: 0.92,
        graph: expect.objectContaining({
          steps: expectedExportGraphSteps,
        }),
      }),
    )
    expect(jotaiStore.get(currentSessionAtom)?.exportState).toMatchObject({
      status: 'done',
      lastProgress: {
        completedStrips: 4,
        totalStrips: 4,
      },
      lastSuccessfulSize: {
        width: 6048,
        height: 4024,
      },
    })
    expect(click).toHaveBeenCalledTimes(1)
    expect(remove).toHaveBeenCalledTimes(1)
    expect(append).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fullres-export')
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
