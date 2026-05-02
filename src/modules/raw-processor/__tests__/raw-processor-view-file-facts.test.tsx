import { act, render, screen } from '@testing-library/react'
import { vi } from 'vitest'

import type { UseRawProcessorReturn } from '../hooks/useRawProcessor'
import { RawProcessorView } from '../RawProcessorView'
import { BUILTIN_PRESETS } from '../services/builtin-presets'

const mockUseRawProcessor = vi.hoisted(() => vi.fn())
const mockUseCapabilityGate = vi.hoisted(() => vi.fn())

vi.mock('../hooks', () => ({
  useRawProcessor: mockUseRawProcessor,
}))

vi.mock('../hooks/useCapabilityGate', () => ({
  useCapabilityGate: mockUseCapabilityGate,
}))

vi.mock('~/lib/gl/pipeline', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/lib/gl/pipeline')>()

  return {
    ...actual,
    RawProcessingPipeline: class {
      async initialize() {}
      resize() {}
      uploadImage() {}
      clearImage() {}
      uploadLUT() {}
      clearLUT() {}
      setParams() {}
      render() {
        return {
          uploadTime: 0,
          lutUploadTime: 0,
          processTime: 0,
          totalTime: 0,
          inputSize: { width: 0, height: 0 },
          previewSize: { width: 0, height: 0 },
          inputFormat: 'uint16-rgb',
          transformPath: 'no-lut',
          lutRole: null,
          lutInputTransfer: null,
          lutOutputTransfer: null,
          lutSize: null,
          processTargetPrecision: 'rgba16f',
          capabilityWarnings: [],
        }
      }
      dispose() {}
    },
  }
})

function createLoadedProcessorState(
  overrides: Partial<UseRawProcessorReturn> = {},
): UseRawProcessorReturn {
  return {
    params: {
      userExposureEv: 0,
      userContrast: 0,
      intensity: 0.7,
      viewMode: 'compare',
      compareSplit: 0.5,
      styleKind: 'none',
      builtinPreset: null,
    },
    loadedImage: {
      file: new File(['raw'], 'frame.ARW'),
      metadata: {
        make: 'Sony',
        model: 'A7R',
        width: 6048,
        height: 4024,
      },
    },
    decodedImageRef: {
      current: {
        width: 4000,
        height: 2666,
        channels: 3,
        bitsPerChannel: 16,
        data: new Uint16Array([0, 1024, 65535]),
        layout: 'rgb-u16',
        colorSpace: 'linear-prophoto-rgb',
        source: 'bounded-hq',
        metadata: {
          make: 'Sony',
          model: 'A7R',
          width: 6048,
          height: 4024,
        },
        renderExposure: { ev: 0, multiplier: 1, source: 'identity' },
      },
    },
    decodedImageVersion: 1,
    status: 'ready',
    error: null,
    progress: 100,
    lut: null,
    lutData: null,
    lutDataRef: { current: null },
    lutDataVersion: 0,
    stats: {
      uploadTime: 4,
      lutUploadTime: 0,
      processTime: 18,
      totalTime: 22,
      inputSize: { width: 4000, height: 2666 },
      previewSize: { width: 1200, height: 800 },
      inputFormat: 'uint16-rgb',
      transformPath: 'no-lut',
      lutRole: null,
      lutInputTransfer: null,
      lutOutputTransfer: null,
      lutSize: null,
      processTargetPrecision: 'rgba16f',
      capabilityWarnings: [],
    },
    hasImage: true,
    canExport: true,
    exportDisabledReason: undefined,
    exportResult: null,
    exportShareCapability: {
      available: false,
      reason: 'Export a JPEG before sharing.',
    },
    exportRecovery: { status: 'none' },
    activeStyle: null,
    lutProfileSelection: null,
    activePresetId: null,
    activeIntensity: 'standard',
    viewMode: 'compare',
    compareSplit: 0.5,
    currentLutName: null,
    sourceFileName: 'frame.ARW',
    supportLevel: 'experimental',
    progressRecoveryHint: undefined,
    presetOptions: BUILTIN_PRESETS,
    embeddedPreviewUrl: null,
    displaySource: 'bounded-hq',
    histogram: { state: 'unavailable', reason: 'no-image' },
    previewSuspended: false,
    loadFile: vi.fn(),
    loadLUT: vi.fn(),
    loadOnlineLUT: vi.fn(),
    selectLUTProfile: vi.fn(),
    selectBuiltinStyle: vi.fn(),
    selectIntensityLevel: vi.fn(),
    setViewMode: vi.fn(),
    setCompareSplit: vi.fn(),
    clearLUT: vi.fn(),
    setParams: vi.fn(),
    setToneParams: vi.fn(),
    resetTone: vi.fn(),
    exportImage: vi.fn(),
    recoverInterruptedExport: vi.fn(),
    downloadExportResult: vi.fn(),
    shareExportResult: vi.fn(),
    copyExportResult: vi.fn(),
    reset: vi.fn(),
    dismissError: vi.fn(),
    updateStats: vi.fn(),
    pipelineRef: { current: null },
    ...overrides,
  }
}

describe('rawProcessorView file facts', () => {
  beforeEach(() => {
    mockUseCapabilityGate.mockReturnValue({
      ready: true,
      supportStatus: 'supported',
      reason: null,
    })

    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('keeps source Size separate from bounded preview dimensions', async () => {
    mockUseRawProcessor.mockReturnValue(createLoadedProcessorState())

    await act(async () => {
      render(<RawProcessorView />)
      await Promise.resolve()
    })

    const sizeRow = screen.getByText('Size').closest('div')
    const previewRow = screen.getByText('Preview').closest('div')

    expect(sizeRow).toHaveTextContent('6048 x 4024')
    expect(sizeRow).not.toHaveTextContent('4000 x 2666')
    expect(previewRow).toHaveTextContent('4000 x 2666')
  })
})
