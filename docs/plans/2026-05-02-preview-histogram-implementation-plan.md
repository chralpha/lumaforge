# Preview Histogram Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a preview-source RAW Lab histogram that explains current processed preview brightness, RGB distribution, and clipping risk without cloning, transferring, or reading back the active preview pixel buffer.

**Architecture:** `@lumaforge/luma-color-runtime` owns histogram math, bin accumulation, and row-bounded processing over supported color graphs. RAW Lab owns the chunked no-copy scheduler, invalidation, and UI. V1 always computes from the active decoded preview source with `main-thread-chunked-no-copy`; worker copy, transfer, and shared-buffer modes remain typed but non-default.

**Tech Stack:** TypeScript, React 19, Jotai, Vitest, Testing Library, pnpm workspaces, `@lumaforge/luma-color-runtime`.

---

## File Map

- Create `packages/luma-color-runtime/src/histogram.ts`: histogram state types, input ownership type, row-bounded accumulator, clipping counters, and diagnostics.
- Create `packages/luma-color-runtime/src/histogram.test.ts`: exact bins, exposure/tone/LUT behavior, unsupported ownership guards, no-copy buffer checks, and row-band memory behavior.
- Modify `packages/luma-color-runtime/src/index.ts`: export histogram runtime API.
- Modify `packages/luma-color-runtime/src/package-boundary.test.ts`: assert the histogram API is exported from the package root.
- Create `src/modules/raw-processor/hooks/usePreviewHistogram.ts`: debounce, graph resolution, source eligibility, versioned chunk runner, cancellation, and no-copy scheduling.
- Create `src/modules/raw-processor/hooks/usePreviewHistogram.test.tsx`: quick/bounded-HQ replacement, invalidation, unsupported states, compare-split non-invalidation, stale-result suppression, and buffer-detach regression tests.
- Modify `src/modules/raw-processor/hooks/useRawProcessor.ts`: expose `histogram` from `useRawProcessor`.
- Modify `src/modules/raw-processor/hooks/useRawProcessor.test.tsx`: verify histogram state appears after quick decode and bounded-HQ replacement.
- Create `src/modules/raw-processor/components/tools/HistogramTool.tsx`: compact luma/RGB SVG histogram, clipping indicators, and source/status label.
- Modify `src/modules/raw-processor/components/index.ts`: export `HistogramTool` if needed by tests or future callers.
- Modify `src/modules/raw-processor/components/RawToolSurface.tsx`: accept `histogram` prop and place histogram beside the Basic Tone controls.
- Modify `src/modules/raw-processor/components/RawToolSurface.test.tsx`: render ready/stale/unsupported/unavailable histogram states and assert placement.
- Modify `src/modules/raw-processor/RawProcessorView.tsx`: pass hook histogram state into the tool surface.
- Modify `src/modules/raw-processor/raw-lab.css`: add compact histogram styles with fixed dimensions and no layout shift.

## Task 1: Color Runtime Histogram Processor

**Files:**

- Create: `packages/luma-color-runtime/src/histogram.ts`
- Create: `packages/luma-color-runtime/src/histogram.test.ts`
- Modify: `packages/luma-color-runtime/src/index.ts`
- Modify: `packages/luma-color-runtime/src/package-boundary.test.ts`

- [ ] **Step 1: Write failing histogram runtime tests**

Create `packages/luma-color-runtime/src/histogram.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import type { SupportedExportColorGraphDescriptor } from './color-graph'
import { createPreviewHistogramProcessor } from './histogram'

const noLutGraph: SupportedExportColorGraphDescriptor = {
  supported: true,
  outputGamut: 'srgb-rec709',
  outputTransfer: 'srgb',
  lutProfile: null,
  steps: [
    { kind: 'input-linear-prophoto' },
    { kind: 'raw-render-exposure', ev: 0, multiplier: 1 },
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
  ],
}

function finishTwoPixelHistogram(source: Uint16Array) {
  const processor = createPreviewHistogramProcessor({
    width: 2,
    rowBandRows: 1,
    graph: noLutGraph,
  })
  processor.processUint16Rows(source, 1)
  return processor.finish({
    source: 'quick',
    width: 2,
    height: 1,
    totalRows: 1,
    ownership: 'main-thread-chunked-no-copy',
    inputByteLength: source.buffer.byteLength,
  })
}

describe('createPreviewHistogramProcessor', () => {
  it('accumulates RGB and luma bins from processed sRGB output', () => {
    const histogram = finishTwoPixelHistogram(
      new Uint16Array([0, 0, 0, 65535, 65535, 65535]),
    )

    expect(histogram.state).toBe('ready')
    expect(histogram.source).toBe('quick')
    expect(histogram.sampledPixels).toBe(2)
    expect(histogram.totalPixels).toBe(2)
    expect(histogram.bins.red[0]).toBe(1)
    expect(histogram.bins.green[0]).toBe(1)
    expect(histogram.bins.blue[0]).toBe(1)
    expect(histogram.bins.luma[0]).toBe(1)
    expect(histogram.bins.red[255]).toBe(1)
    expect(histogram.bins.green[255]).toBe(1)
    expect(histogram.bins.blue[255]).toBe(1)
    expect(histogram.bins.luma[255]).toBe(1)
    expect(histogram.clipping.shadowAnyChannel).toBe(1)
    expect(histogram.clipping.highlightAnyChannel).toBe(1)
  })

  it('applies raw render exposure and user exposure through the shared graph', () => {
    const graph: SupportedExportColorGraphDescriptor = {
      ...noLutGraph,
      steps: noLutGraph.steps.map((step) =>
        step.kind === 'user-exposure'
          ? { kind: 'user-exposure', ev: 1, multiplier: 2 }
          : step,
      ),
    }
    const processor = createPreviewHistogramProcessor({
      width: 1,
      rowBandRows: 1,
      graph,
    })

    processor.processUint16Rows(new Uint16Array([8192, 8192, 8192]), 1)
    const histogram = processor.finish({
      source: 'quick',
      width: 1,
      height: 1,
      totalRows: 1,
      ownership: 'main-thread-chunked-no-copy',
      inputByteLength: 6,
    })

    const nonZeroLumaBins = Array.from(histogram.bins.luma.entries()).filter(
      ([, count]) => count > 0,
    )
    expect(nonZeroLumaBins).toHaveLength(1)
    expect(nonZeroLumaBins[0]![0]).toBeGreaterThan(99)
  })

  it('never detaches or copies the source buffer in the default path', () => {
    const source = new Uint16Array([0, 0, 0, 65535, 65535, 65535])
    const beforeByteLength = source.buffer.byteLength
    const histogram = finishTwoPixelHistogram(source)

    expect(source.buffer.byteLength).toBe(beforeByteLength)
    expect(histogram.diagnostics.ownership).toBe('main-thread-chunked-no-copy')
    expect(histogram.diagnostics.copiedInputBytes).toBe(0)
    expect(histogram.diagnostics.transferredInput).toBe(false)
  })

  it('rejects invalid row slices before accumulation', () => {
    const processor = createPreviewHistogramProcessor({
      width: 2,
      rowBandRows: 1,
      graph: noLutGraph,
    })

    expect(() =>
      processor.processUint16Rows(new Uint16Array([0, 0, 0]), 1),
    ).toThrow('PREVIEW_HISTOGRAM_INVALID_SOURCE_LENGTH')
    expect(() =>
      processor.processUint16Rows(new Uint16Array(12), 2),
    ).toThrow('PREVIEW_HISTOGRAM_INVALID_ROW_COUNT')
  })
})
```

- [ ] **Step 2: Run the failing histogram runtime tests**

Run:

```bash
pnpm --filter @lumaforge/luma-color-runtime exec vitest run src/histogram.test.ts
```

Expected: fail with an import error for `./histogram`.

- [ ] **Step 3: Implement histogram runtime types and accumulator**

Create `packages/luma-color-runtime/src/histogram.ts`:

```ts
import type { SupportedExportColorGraphDescriptor } from './color-graph'
import { createRowBandProcessor } from './row-band-processor'

export type PreviewHistogramSource = 'quick' | 'bounded-hq'

export type HistogramInputOwnership =
  | 'main-thread-chunked-no-copy'
  | 'worker-transfer-detaches-source'
  | 'worker-copy-accepted-under-budget'
  | 'worker-shared-buffer-requires-coi'

export type ReadyPreviewHistogram = {
  state: 'ready'
  source: PreviewHistogramSource
  width: number
  height: number
  sampledPixels: number
  totalPixels: number
  bins: {
    luma: Uint32Array
    red: Uint32Array
    green: Uint32Array
    blue: Uint32Array
  }
  clipping: {
    shadowAnyChannel: number
    highlightAnyChannel: number
    shadowLuma: number
    highlightLuma: number
  }
  diagnostics: {
    ownership: HistogramInputOwnership
    copiedInputBytes: number
    transferredInput: boolean
    inputByteLength: number
    rowBandRows: number
  }
}

export type PreviewHistogramState =
  | ReadyPreviewHistogram
  | { state: 'computing'; previous: ReadyPreviewHistogram | null }
  | { state: 'stale'; previous: ReadyPreviewHistogram }
  | { state: 'unsupported'; reason: string }
  | { state: 'unavailable'; reason: 'embedded-only' | 'no-image' }

export type CreatePreviewHistogramProcessorInput = {
  width: number
  rowBandRows: number
  graph: SupportedExportColorGraphDescriptor
}

export type FinishPreviewHistogramInput = {
  source: PreviewHistogramSource
  width: number
  height: number
  totalRows: number
  ownership: HistogramInputOwnership
  inputByteLength: number
}

const CHANNELS_PER_PIXEL = 3
const BIN_COUNT = 256

function assertPositiveSafeInteger(value: number, errorCode: string) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(errorCode)
  }
}

function expectedRowLength(width: number, rowCount: number) {
  return width * rowCount * CHANNELS_PER_PIXEL
}

function lumaByte(red: number, green: number, blue: number) {
  return Math.round(0.2126 * red + 0.7152 * green + 0.0722 * blue)
}

export function createPreviewHistogramProcessor({
  width,
  rowBandRows,
  graph,
}: CreatePreviewHistogramProcessorInput) {
  assertPositiveSafeInteger(width, 'PREVIEW_HISTOGRAM_INVALID_WIDTH')
  assertPositiveSafeInteger(
    rowBandRows,
    'PREVIEW_HISTOGRAM_INVALID_ROW_BAND_ROWS',
  )

  const rowBandProcessor = createRowBandProcessor({ width, rowBandRows, graph })
  const bins = {
    luma: new Uint32Array(BIN_COUNT),
    red: new Uint32Array(BIN_COUNT),
    green: new Uint32Array(BIN_COUNT),
    blue: new Uint32Array(BIN_COUNT),
  }
  const clipping = {
    shadowAnyChannel: 0,
    highlightAnyChannel: 0,
    shadowLuma: 0,
    highlightLuma: 0,
  }
  let sampledPixels = 0

  function accumulateRgb8Rows(rows: Uint8Array) {
    for (let index = 0; index < rows.length; index += 3) {
      const red = rows[index] ?? 0
      const green = rows[index + 1] ?? 0
      const blue = rows[index + 2] ?? 0
      const luma = lumaByte(red, green, blue)

      bins.red[red] += 1
      bins.green[green] += 1
      bins.blue[blue] += 1
      bins.luma[luma] += 1

      if (red === 0 || green === 0 || blue === 0) {
        clipping.shadowAnyChannel += 1
      }
      if (red === 255 || green === 255 || blue === 255) {
        clipping.highlightAnyChannel += 1
      }
      if (luma === 0) clipping.shadowLuma += 1
      if (luma === 255) clipping.highlightLuma += 1

      sampledPixels += 1
    }
  }

  function validateRows(source: Uint16Array, rowCount: number) {
    assertPositiveSafeInteger(rowCount, 'PREVIEW_HISTOGRAM_INVALID_ROW_COUNT')
    if (rowCount > rowBandRows) {
      throw new Error('PREVIEW_HISTOGRAM_INVALID_ROW_COUNT')
    }
    if (source.length !== expectedRowLength(width, rowCount)) {
      throw new Error('PREVIEW_HISTOGRAM_INVALID_SOURCE_LENGTH')
    }
  }

  return {
    rowBandRows,
    processUint16Rows(source: Uint16Array, rowCount: number) {
      validateRows(source, rowCount)
      const rgb8Rows = rowBandProcessor.processUint16Rows(source, rowCount)
      accumulateRgb8Rows(rgb8Rows)
    },
    finish(input: FinishPreviewHistogramInput): ReadyPreviewHistogram {
      assertPositiveSafeInteger(input.width, 'PREVIEW_HISTOGRAM_INVALID_WIDTH')
      assertPositiveSafeInteger(
        input.height,
        'PREVIEW_HISTOGRAM_INVALID_HEIGHT',
      )
      assertPositiveSafeInteger(
        input.totalRows,
        'PREVIEW_HISTOGRAM_INVALID_ROW_COUNT',
      )

      const totalPixels = input.width * input.height
      return {
        state: 'ready',
        source: input.source,
        width: input.width,
        height: input.height,
        sampledPixels,
        totalPixels,
        bins,
        clipping,
        diagnostics: {
          ownership: input.ownership,
          copiedInputBytes:
            input.ownership === 'worker-copy-accepted-under-budget'
              ? input.inputByteLength
              : 0,
          transferredInput:
            input.ownership === 'worker-transfer-detaches-source',
          inputByteLength: input.inputByteLength,
          rowBandRows,
        },
      }
    },
  }
}
```

- [ ] **Step 4: Export histogram API**

Modify `packages/luma-color-runtime/src/index.ts`:

```ts
export * from './color-graph'
export * from './constants'
export * from './histogram'
export * from './log-encoding'
export * from './lut-contract'
export * from './lut3d'
export * from './matrix'
export * from './raw-render-exposure'
export * from './registry'
export * from './row-band-processor'
export * from './tone'
export * from './types'
```

Add this test to `packages/luma-color-runtime/src/package-boundary.test.ts`:

```ts
it('exports preview histogram API from the package root', async () => {
  const runtime = await import('./index')

  expect(runtime).toHaveProperty('createPreviewHistogramProcessor')
})
```

- [ ] **Step 5: Run runtime tests**

Run:

```bash
pnpm --filter @lumaforge/luma-color-runtime exec vitest run src/histogram.test.ts src/row-band-processor.test.ts src/package-boundary.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit runtime histogram processor**

```bash
git add packages/luma-color-runtime/src/histogram.ts packages/luma-color-runtime/src/histogram.test.ts packages/luma-color-runtime/src/index.ts packages/luma-color-runtime/src/package-boundary.test.ts
git commit -m "feat: add preview histogram runtime"
```

## Task 2: No-Copy Chunked Histogram Hook

**Files:**

- Create: `src/modules/raw-processor/hooks/usePreviewHistogram.ts`
- Create: `src/modules/raw-processor/hooks/usePreviewHistogram.test.tsx`

- [ ] **Step 1: Write failing hook tests**

Create `src/modules/raw-processor/hooks/usePreviewHistogram.test.tsx`:

```ts
import type { LUTData, ProcessingParams } from '@lumaforge/luma-color-runtime'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { DecodedImage } from '~/lib/raw/decoder'

import { usePreviewHistogram } from './usePreviewHistogram'

afterEach(() => {
  vi.useRealTimers()
})

function createParams(
  overrides: Partial<ProcessingParams> = {},
): ProcessingParams {
  return {
    intensity: 0.7,
    viewMode: 'compare',
    compareSplit: 0.5,
    styleKind: 'none',
    builtinPreset: null,
    userExposureEv: 0,
    userContrast: 0,
    ...overrides,
  }
}

function createImage(
  source: 'quick' | 'bounded-hq' = 'quick',
  data = new Uint16Array([0, 0, 0, 65535, 65535, 65535]),
): DecodedImage {
  return {
    width: 2,
    height: 1,
    channels: 3,
    bitsPerChannel: 16,
    data,
    layout: 'rgb-u16',
    colorSpace: 'linear-prophoto-rgb',
    source,
    metadata: { width: 2, height: 1 },
    renderExposure: { ev: 0, multiplier: 1, source: 'identity' },
  }
}

async function flushHistogramTimers() {
  await act(async () => {
    vi.advanceTimersByTime(200)
    await Promise.resolve()
  })
  await act(async () => {
    vi.runOnlyPendingTimers()
    await Promise.resolve()
  })
}

describe('usePreviewHistogram', () => {
  it('computes a quick histogram without copying or detaching the active buffer', async () => {
    vi.useFakeTimers()
    const image = createImage('quick')
    const imageRef = { current: image }
    const lutDataRef = { current: null as LUTData | null }
    const beforeByteLength = image.data.buffer.byteLength

    const { result } = renderHook(() =>
      usePreviewHistogram({
        imageRef,
        imageVersion: 1,
        params: createParams(),
        lutDataRef,
        lutDataVersion: 0,
        displaySource: 'quick',
      }),
    )

    expect(result.current.state).toBe('computing')
    await flushHistogramTimers()
    await waitFor(() => expect(result.current.state).toBe('ready'))

    if (result.current.state !== 'ready') {
      throw new Error('Expected ready histogram')
    }
    expect(image.data.buffer.byteLength).toBe(beforeByteLength)
    expect(result.current.source).toBe('quick')
    expect(result.current.diagnostics.ownership).toBe(
      'main-thread-chunked-no-copy',
    )
    expect(result.current.diagnostics.copiedInputBytes).toBe(0)
    expect(result.current.diagnostics.transferredInput).toBe(false)
  })

  it('reports embedded-only preview as unavailable', () => {
    const { result } = renderHook(() =>
      usePreviewHistogram({
        imageRef: { current: null },
        imageVersion: 0,
        params: createParams(),
        lutDataRef: { current: null },
        lutDataVersion: 0,
        displaySource: 'embedded',
      }),
    )

    expect(result.current).toEqual({
      state: 'unavailable',
      reason: 'embedded-only',
    })
  })

  it('replaces quick histogram with bounded-HQ after source replacement', async () => {
    vi.useFakeTimers()
    const imageRef = { current: createImage('quick') }
    const lutDataRef = { current: null as LUTData | null }
    const { result, rerender } = renderHook(
      ({
        imageVersion,
        displaySource,
      }: {
        imageVersion: number
        displaySource: 'quick' | 'bounded-hq'
      }) =>
        usePreviewHistogram({
          imageRef,
          imageVersion,
          params: createParams(),
          lutDataRef,
          lutDataVersion: 0,
          displaySource,
        }),
      { initialProps: { imageVersion: 1, displaySource: 'quick' as const } },
    )

    await flushHistogramTimers()
    await waitFor(() => expect(result.current.state).toBe('ready'))

    imageRef.current = createImage('bounded-hq')
    rerender({ imageVersion: 2, displaySource: 'bounded-hq' })
    expect(result.current.state).toBe('computing')

    await flushHistogramTimers()
    await waitFor(() => expect(result.current.state).toBe('ready'))
    if (result.current.state !== 'ready') throw new Error('Expected ready')
    expect(result.current.source).toBe('bounded-hq')
  })

  it('does not recompute on compare split changes', async () => {
    vi.useFakeTimers()
    const imageRef = { current: createImage('quick') }
    const lutDataRef = { current: null as LUTData | null }
    const { result, rerender } = renderHook(
      ({ params }: { params: ProcessingParams }) =>
        usePreviewHistogram({
          imageRef,
          imageVersion: 1,
          params,
          lutDataRef,
          lutDataVersion: 0,
          displaySource: 'quick',
        }),
      { initialProps: { params: createParams({ compareSplit: 0.5 }) } },
    )

    await flushHistogramTimers()
    await waitFor(() => expect(result.current.state).toBe('ready'))
    const ready = result.current

    rerender({ params: createParams({ compareSplit: 0.9 }) })
    expect(result.current).toBe(ready)
  })

  it('keeps previous bins as stale while tone recomputation is pending', async () => {
    vi.useFakeTimers()
    const imageRef = { current: createImage('quick') }
    const lutDataRef = { current: null as LUTData | null }
    const { result, rerender } = renderHook(
      ({ params }: { params: ProcessingParams }) =>
        usePreviewHistogram({
          imageRef,
          imageVersion: 1,
          params,
          lutDataRef,
          lutDataVersion: 0,
          displaySource: 'quick',
        }),
      { initialProps: { params: createParams() } },
    )

    await flushHistogramTimers()
    await waitFor(() => expect(result.current.state).toBe('ready'))
    const previous = result.current

    rerender({ params: createParams({ userExposureEv: 1 }) })

    expect(result.current).toEqual({ state: 'stale', previous })
    await flushHistogramTimers()
    await waitFor(() => expect(result.current.state).toBe('ready'))
    expect(result.current).not.toBe(previous)
  })

  it('fails closed for built-in styles', async () => {
    const { result } = renderHook(() =>
      usePreviewHistogram({
        imageRef: { current: createImage('quick') },
        imageVersion: 1,
        params: createParams({ styleKind: 'builtin', builtinPreset: 'warm' }),
        lutDataRef: { current: null },
        lutDataVersion: 0,
        displaySource: 'quick',
      }),
    )

    expect(result.current).toMatchObject({
      state: 'unsupported',
      reason: 'Built-in styles are not supported by full-resolution JPEG export.',
    })
  })
})
```

- [ ] **Step 2: Run the failing hook tests**

Run:

```bash
pnpm exec vitest run src/modules/raw-processor/hooks/usePreviewHistogram.test.tsx
```

Expected: fail with an import error for `./usePreviewHistogram`.

- [ ] **Step 3: Implement the no-copy chunked hook**

Create `src/modules/raw-processor/hooks/usePreviewHistogram.ts`:

```ts
import type {
  LUTData,
  PreviewHistogramState,
  ProcessingParams,
  ReadyPreviewHistogram,
} from '@lumaforge/luma-color-runtime'
import {
  createPreviewHistogramProcessor,
  resolveExportColorGraph,
} from '@lumaforge/luma-color-runtime'
import type { RefObject } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'

import type { DecodedImage } from '~/lib/raw/decoder'

import type { DisplaySource } from '../model/session'

const HISTOGRAM_DEBOUNCE_MS = 150
const HISTOGRAM_ROW_BAND_ROWS = 32
const CHANNELS_PER_PIXEL = 3

type UsePreviewHistogramInput = {
  imageRef: RefObject<DecodedImage | null>
  imageVersion: number
  params: ProcessingParams
  lutDataRef: RefObject<LUTData | null>
  lutDataVersion: number
  displaySource: DisplaySource
}

function asPreviousReady(
  state: PreviewHistogramState,
): ReadyPreviewHistogram | null {
  if (state.state === 'ready') return state
  if ('previous' in state) return state.previous
  return null
}

function nextTask(callback: () => void) {
  return window.setTimeout(callback, 0)
}

export function usePreviewHistogram({
  imageRef,
  imageVersion,
  params,
  lutDataRef,
  lutDataVersion,
  displaySource,
}: UsePreviewHistogramInput): PreviewHistogramState {
  const [state, setState] = useState<PreviewHistogramState>({
    state: 'unavailable',
    reason: 'no-image',
  })
  const versionRef = useRef(0)

  const histogramParams = useMemo(
    () => ({
      styleKind: params.styleKind,
      builtinPreset: params.builtinPreset,
      intensity: params.intensity,
      userExposureEv: params.userExposureEv,
      userContrast: params.userContrast,
    }),
    [
      params.styleKind,
      params.builtinPreset,
      params.intensity,
      params.userExposureEv,
      params.userContrast,
    ],
  )

  const graphParamsKey = useMemo(
    () =>
      JSON.stringify({
        imageVersion,
        lutDataVersion,
        displaySource,
        ...histogramParams,
      }),
    [displaySource, histogramParams, imageVersion, lutDataVersion],
  )

  useEffect(() => {
    const version = versionRef.current + 1
    versionRef.current = version
    let timer: number | null = null
    let cancelled = false
    const image = imageRef.current

    if (!image) {
      setState(
        displaySource === 'embedded'
          ? { state: 'unavailable', reason: 'embedded-only' }
          : { state: 'unavailable', reason: 'no-image' },
      )
      return () => {
        cancelled = true
      }
    }

    if (
      image.layout !== 'rgb-u16' ||
      image.colorSpace !== 'linear-prophoto-rgb' ||
      !(image.data instanceof Uint16Array) ||
      (image.source !== 'quick' && image.source !== 'bounded-hq')
    ) {
      setState({
        state: 'unsupported',
        reason: 'Preview histogram requires RGB16 Linear ProPhoto preview data.',
      })
      return () => {
        cancelled = true
      }
    }

    const graph = resolveExportColorGraph({
      styleKind: histogramParams.styleKind,
      intensity: histogramParams.intensity,
      builtinPreset: histogramParams.builtinPreset,
      lut: lutDataRef.current,
      rawRenderExposure: image.renderExposure,
      userExposureEv: histogramParams.userExposureEv,
      userContrast: histogramParams.userContrast,
    })
    if (!graph.supported) {
      setState({ state: 'unsupported', reason: graph.message })
      return () => {
        cancelled = true
      }
    }

    setState((previous) => {
      const previousReady = asPreviousReady(previous)
      return previousReady
        ? { state: 'stale', previous: previousReady }
        : { state: 'computing', previous: null }
    })

    const processor = createPreviewHistogramProcessor({
      width: image.width,
      rowBandRows: HISTOGRAM_ROW_BAND_ROWS,
      graph,
    })
    let nextRow = 0
    const inputByteLength = image.data.buffer.byteLength

    const runChunk = () => {
      if (cancelled || versionRef.current !== version) return

      if (nextRow === 0) {
        setState((previous) => ({
          state: 'computing',
          previous: asPreviousReady(previous),
        }))
      }

      const rowCount = Math.min(
        HISTOGRAM_ROW_BAND_ROWS,
        image.height - nextRow,
      )
      const offset = nextRow * image.width * CHANNELS_PER_PIXEL
      const length = rowCount * image.width * CHANNELS_PER_PIXEL
      processor.processUint16Rows(
        image.data.subarray(offset, offset + length),
        rowCount,
      )
      nextRow += rowCount

      if (nextRow < image.height) {
        timer = nextTask(runChunk)
        return
      }

      setState(
        processor.finish({
          source: image.source,
          width: image.width,
          height: image.height,
          totalRows: image.height,
          ownership: 'main-thread-chunked-no-copy',
          inputByteLength,
        }),
      )
    }

    timer = window.setTimeout(runChunk, HISTOGRAM_DEBOUNCE_MS)

    return () => {
      cancelled = true
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [displaySource, graphParamsKey, histogramParams, imageRef, lutDataRef])

  return state
}
```

- [ ] **Step 4: Run hook tests**

Run:

```bash
pnpm exec vitest run src/modules/raw-processor/hooks/usePreviewHistogram.test.tsx
```

Expected: pass.

- [ ] **Step 5: Commit no-copy histogram hook**

```bash
git add src/modules/raw-processor/hooks/usePreviewHistogram.ts src/modules/raw-processor/hooks/usePreviewHistogram.test.tsx
git commit -m "feat: schedule preview histogram computation"
```

## Task 3: Raw Processor State Integration

**Files:**

- Modify: `src/modules/raw-processor/hooks/useRawProcessor.ts`
- Modify: `src/modules/raw-processor/hooks/useRawProcessor.test.tsx`

- [ ] **Step 1: Write failing integration tests**

Add these tests to `src/modules/raw-processor/hooks/useRawProcessor.test.tsx` near the preview source tests:

```ts
it('publishes the active decoded preview histogram after load', async () => {
  vi.useFakeTimers()
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
    await result.current.loadFile(new File(['raw'], 'frame.ARW'))
  })
  await act(async () => {
    vi.advanceTimersByTime(200)
    vi.runOnlyPendingTimers()
    await Promise.resolve()
  })

  await waitFor(() => expect(result.current.histogram.state).toBe('ready'))
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
    await result.current.loadFile(new File(['raw'], 'frame.ARW'))
  })
  await act(async () => {
    vi.advanceTimersByTime(200)
    vi.runOnlyPendingTimers()
    await Promise.resolve()
  })
  await waitFor(() => expect(result.current.histogram.state).toBe('ready'))
  const histogram = result.current.histogram

  act(() => {
    result.current.setCompareSplit(0.8)
  })

  expect(result.current.histogram).toBe(histogram)
})
```

- [ ] **Step 2: Run the failing integration tests**

Run:

```bash
pnpm exec vitest run src/modules/raw-processor/hooks/useRawProcessor.test.tsx -t "histogram"
```

Expected: fail because `histogram` is not returned by `useRawProcessor`.

- [ ] **Step 3: Wire histogram into `useRawProcessor`**

Modify `src/modules/raw-processor/hooks/useRawProcessor.ts`:

```ts
import type { PreviewHistogramState } from '@lumaforge/luma-color-runtime'
import { usePreviewHistogram } from './usePreviewHistogram'
```

Add to `UseRawProcessorReturn`:

```ts
histogram: PreviewHistogramState
```

Create the hook value after `displaySource` is derived:

```ts
const histogram = usePreviewHistogram({
  imageRef: decodedImageRef,
  imageVersion: decodedImageVersion,
  params,
  lutDataRef,
  lutDataVersion,
  displaySource,
})
```

Add `histogram` to the returned object:

```ts
histogram,
```

- [ ] **Step 4: Run integration tests**

Run:

```bash
pnpm exec vitest run src/modules/raw-processor/hooks/useRawProcessor.test.tsx -t "histogram"
```

Expected: pass.

- [ ] **Step 5: Commit state integration**

```bash
git add src/modules/raw-processor/hooks/useRawProcessor.ts src/modules/raw-processor/hooks/useRawProcessor.test.tsx
git commit -m "feat: expose preview histogram state"
```

## Task 4: Histogram Tool UI

**Files:**

- Create: `src/modules/raw-processor/components/tools/HistogramTool.tsx`
- Modify: `src/modules/raw-processor/components/index.ts`
- Modify: `src/modules/raw-processor/components/RawToolSurface.tsx`
- Modify: `src/modules/raw-processor/components/RawToolSurface.test.tsx`
- Modify: `src/modules/raw-processor/raw-lab.css`

- [ ] **Step 1: Write failing RawToolSurface tests**

Update `baseProps` in `src/modules/raw-processor/components/RawToolSurface.test.tsx`:

```ts
histogram: { state: 'unavailable' as const, reason: 'no-image' as const },
```

Add tests:

```ts
it('renders histogram near tone controls', () => {
  render(
    <RawToolSurface
      {...baseProps}
      hasImage
      histogram={{
        state: 'ready',
        source: 'quick',
        width: 2,
        height: 1,
        sampledPixels: 2,
        totalPixels: 2,
        bins: {
          luma: Uint32Array.from({ length: 256 }, (_, index) =>
            index === 0 || index === 255 ? 1 : 0,
          ),
          red: Uint32Array.from({ length: 256 }, (_, index) =>
            index === 0 || index === 255 ? 1 : 0,
          ),
          green: new Uint32Array(256),
          blue: new Uint32Array(256),
        },
        clipping: {
          shadowAnyChannel: 1,
          highlightAnyChannel: 1,
          shadowLuma: 1,
          highlightLuma: 1,
        },
        diagnostics: {
          ownership: 'main-thread-chunked-no-copy',
          copiedInputBytes: 0,
          transferredInput: false,
          inputByteLength: 12,
          rowBandRows: 32,
        },
      }}
    />,
  )

  const tone = screen.getByRole('region', { name: 'Tone' })
  const histogram = screen.getByRole('region', { name: 'Histogram' })
  const strength = screen.getByRole('region', { name: 'Strength' })

  expect(
    tone.compareDocumentPosition(histogram) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy()
  expect(
    histogram.compareDocumentPosition(strength) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy()
  expect(within(histogram).getByText('Quick preview')).toBeInTheDocument()
  expect(
    within(histogram).getByLabelText('Preview luminance and RGB histogram'),
  ).toBeInTheDocument()
  expect(within(histogram).getByText('Shadows 1')).toBeInTheDocument()
  expect(within(histogram).getByText('Highlights 1')).toBeInTheDocument()
})

it('shows unsupported histogram state without stale bins', () => {
  render(
    <RawToolSurface
      {...baseProps}
      hasImage
      histogram={{
        state: 'unsupported',
        reason: 'Built-in styles are not supported by full-resolution JPEG export.',
      }}
    />,
  )

  const histogram = screen.getByRole('region', { name: 'Histogram' })
  expect(within(histogram).getByText('Unsupported')).toBeInTheDocument()
  expect(
    within(histogram).queryByLabelText('Preview luminance and RGB histogram'),
  ).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run failing UI tests**

Run:

```bash
pnpm exec vitest run src/modules/raw-processor/components/RawToolSurface.test.tsx -t "histogram"
```

Expected: fail because `histogram` prop and `HistogramTool` do not exist.

- [ ] **Step 3: Implement `HistogramTool`**

Create `src/modules/raw-processor/components/tools/HistogramTool.tsx`:

```tsx
import type { PreviewHistogramState } from '@lumaforge/luma-color-runtime'

import { ToolSection } from './ToolSection'

function sourceLabel(state: PreviewHistogramState) {
  if (state.state === 'ready') {
    return state.source === 'bounded-hq' ? 'HQ preview' : 'Quick preview'
  }
  if (state.state === 'computing') return 'Computing'
  if (state.state === 'stale') return 'Stale'
  if (state.state === 'unsupported') return 'Unsupported'
  return state.reason === 'embedded-only' ? 'Embedded only' : 'Not loaded'
}

function makePath(bins: Uint32Array, width = 128, height = 40) {
  const max = Math.max(1, ...bins)
  const points = Array.from(bins, (count, index) => {
    const x = (index / 255) * width
    const y = height - (count / max) * height
    return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
  })
  return points.join(' ')
}

export function HistogramTool({
  histogram,
}: {
  histogram: PreviewHistogramState
}) {
  const label = sourceLabel(histogram)
  const ready =
    histogram.state === 'ready'
      ? histogram
      : histogram.state === 'stale' || histogram.state === 'computing'
        ? histogram.previous
        : null

  return (
    <ToolSection title="Histogram" eyebrow={label}>
      {ready ? (
        <div className="raw-histogram">
          <svg
            aria-label="Preview luminance and RGB histogram"
            className="raw-histogram-plot"
            viewBox="0 0 128 40"
            role="img"
          >
            <path
              className="raw-histogram-channel raw-histogram-channel-red"
              d={makePath(ready.bins.red)}
            />
            <path
              className="raw-histogram-channel raw-histogram-channel-green"
              d={makePath(ready.bins.green)}
            />
            <path
              className="raw-histogram-channel raw-histogram-channel-blue"
              d={makePath(ready.bins.blue)}
            />
            <path
              className="raw-histogram-luma"
              d={makePath(ready.bins.luma)}
            />
          </svg>
          <div className="raw-histogram-clipping">
            <span>Shadows {ready.clipping.shadowAnyChannel}</span>
            <span>Highlights {ready.clipping.highlightAnyChannel}</span>
          </div>
        </div>
      ) : (
        <p className="raw-tool-note">{label}</p>
      )}
    </ToolSection>
  )
}
```

- [ ] **Step 4: Wire UI into RawToolSurface**

Modify `src/modules/raw-processor/components/RawToolSurface.tsx`:

```tsx
import type { PreviewHistogramState } from '@lumaforge/luma-color-runtime'
import { HistogramTool } from './tools/HistogramTool'
```

Add prop:

```ts
histogram: PreviewHistogramState
```

Render after `ToneTool` and before `Strength`:

```tsx
<HistogramTool histogram={props.histogram} />
```

Modify `src/modules/raw-processor/components/index.ts`:

```ts
export { HistogramTool } from './tools/HistogramTool'
```

- [ ] **Step 5: Add compact histogram CSS**

Add to `src/modules/raw-processor/raw-lab.css` near tone styles:

```css
.raw-histogram {
  display: grid;
  gap: 8px;
}

.raw-histogram-plot {
  display: block;
  width: 100%;
  height: 48px;
  overflow: visible;
  border: 1px solid oklch(0.74 0.035 78 / 0.62);
  border-radius: 8px;
  background: oklch(0.16 0.018 78 / 0.86);
}

.raw-histogram-channel,
.raw-histogram-luma {
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.raw-histogram-channel {
  stroke-width: 0.9;
  opacity: 0.46;
}

.raw-histogram-channel-red {
  stroke: oklch(0.72 0.18 28);
}

.raw-histogram-channel-green {
  stroke: oklch(0.74 0.16 145);
}

.raw-histogram-channel-blue {
  stroke: oklch(0.72 0.14 250);
}

.raw-histogram-luma {
  stroke: oklch(0.96 0.018 86);
  stroke-width: 1.35;
  opacity: 0.9;
}

.raw-histogram-clipping {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  color: var(--raw-ink-soft);
  font-size: 0.7rem;
  font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 6: Run UI tests**

Run:

```bash
pnpm exec vitest run src/modules/raw-processor/components/RawToolSurface.test.tsx -t "histogram"
```

Expected: pass.

- [ ] **Step 7: Commit histogram UI**

```bash
git add src/modules/raw-processor/components/tools/HistogramTool.tsx src/modules/raw-processor/components/index.ts src/modules/raw-processor/components/RawToolSurface.tsx src/modules/raw-processor/components/RawToolSurface.test.tsx src/modules/raw-processor/raw-lab.css
git commit -m "feat: show preview histogram in raw tools"
```

## Task 5: Raw Processor View Handoff and Regression Coverage

**Files:**

- Modify: `src/modules/raw-processor/RawProcessorView.tsx`
- Modify: `src/modules/raw-processor/__tests__/workspace-ui.test.tsx`

- [ ] **Step 1: Write failing view-level test fixture update**

In `src/modules/raw-processor/__tests__/workspace-ui.test.tsx`, update the `useRawProcessor` mock return shape used by RawProcessorView tests:

```ts
histogram: { state: 'unavailable' as const, reason: 'no-image' as const },
```

Add a view smoke assertion near the existing RawToolSurface assertions:

```ts
expect(screen.getByRole('region', { name: 'Histogram' })).toBeInTheDocument()
```

- [ ] **Step 2: Run failing view tests**

Run:

```bash
pnpm exec vitest run src/modules/raw-processor/__tests__/workspace-ui.test.tsx -t "Histogram|RAW tools"
```

Expected: fail until `RawProcessorView` passes `histogram` into `RawToolSurface`.

- [ ] **Step 3: Pass histogram through RawProcessorView**

Modify the `useRawProcessor()` destructure in `src/modules/raw-processor/RawProcessorView.tsx`:

```ts
histogram,
```

Pass it to `RawToolSurface` by adding the new prop to the existing component
call:

```tsx
histogram={histogram}
```

- [ ] **Step 4: Run view tests**

Run:

```bash
pnpm exec vitest run src/modules/raw-processor/__tests__/workspace-ui.test.tsx -t "Histogram|RAW tools"
```

Expected: pass.

- [ ] **Step 5: Commit view handoff**

```bash
git add src/modules/raw-processor/RawProcessorView.tsx src/modules/raw-processor/__tests__/workspace-ui.test.tsx
git commit -m "feat: wire histogram into raw processor view"
```

## Task 6: Full Verification and Browser Smoke

**Files:**

- Modify only files touched in earlier tasks if verification exposes defects.

- [ ] **Step 1: Run focused runtime tests**

Run:

```bash
pnpm --filter @lumaforge/luma-color-runtime test
```

Expected: pass.

- [ ] **Step 2: Run focused app tests**

Run:

```bash
pnpm exec vitest run src/modules/raw-processor/hooks/usePreviewHistogram.test.tsx src/modules/raw-processor/hooks/useRawProcessor.test.tsx src/modules/raw-processor/components/RawToolSurface.test.tsx src/modules/raw-processor/__tests__/workspace-ui.test.tsx
```

Expected: pass.

- [ ] **Step 3: Run typecheck and production build**

Run:

```bash
pnpm --filter @lumaforge/luma-color-runtime typecheck
pnpm build
```

Expected: both commands pass. If `pnpm build` reports missing native runtime assets, run the native package build commands printed by the Vite error and rerun `pnpm build`.

- [ ] **Step 4: Browser smoke with RAW fixture**

Run the dev server:

```bash
pnpm dev --host 0.0.0.0
```

Open `/raw` in Playwright or Chrome DevTools and use the existing same-origin fixture path strategy:

```js
const response = await fetch('/@fs/workspaces/LumaForge/test-images/SGL_1998.NEF')
const bytes = await response.arrayBuffer()
const file = new File([bytes], 'SGL_1998.NEF')
const drop = new DataTransfer()
drop.items.add(file)
document
  .querySelector('[data-raw-dropzone]')
  .dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: drop }))
```

Expected manual observations:

- histogram shows after quick preview without waiting for bounded-HQ;
- source label switches from `Quick preview` to `HQ preview` when bounded-HQ becomes active;
- exposure and contrast changes update the histogram after the debounce;
- compare handle dragging does not restart histogram computation;
- selecting a built-in style shows `Unsupported` for the histogram;
- DevTools memory does not show a second bounded-HQ-sized `ArrayBuffer` created by histogram computation;
- `decodedImageRef.current.data.buffer.byteLength` remains non-zero after histogram completion.

- [ ] **Step 5: Final diff audit**

Run:

```bash
rg -n "readProcessedPixels|readPixels|getImageData|postMessage|transferList|SharedArrayBuffer" packages/luma-color-runtime/src src/modules/raw-processor
git diff --check
git status --short
```

Expected:

- no histogram code calls `readProcessedPixels`, `gl.readPixels`, or `getImageData`;
- no V1 histogram code posts the active preview buffer to a worker;
- `SharedArrayBuffer` appears only in type names, tests, docs, or future-mode guards;
- `git diff --check` is clean;
- only intended histogram files are modified.

- [ ] **Step 6: Commit verification fixes if needed**

If verification required small follow-up fixes:

```bash
git add packages/luma-color-runtime/src src/modules/raw-processor
git commit -m "test: cover preview histogram regressions"
```

Skip this commit if no verification fixes were needed.

## Self-Review Notes

- Spec coverage: preview-only source, processed output bins, quick and bounded-HQ source labels, unsupported built-in styles, no WebGL/Canvas readback, no active buffer transfer, chunked no-copy scheduling, stale/computing/unavailable/unsupported states, and compact UI are each covered by tasks.
- Performance coverage: Task 1 records diagnostics, Task 2 enforces no-copy chunking, Task 4 uses fixed-size SVG layout, and Task 6 includes memory and forbidden API checks.
- Deferred scope: full-resolution export histograms, worker copy, active-buffer transfer, and SharedArrayBuffer production support are not implemented in V1.
