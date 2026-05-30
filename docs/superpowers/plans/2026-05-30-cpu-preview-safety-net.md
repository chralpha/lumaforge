# CPU Preview Safety-Net Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the GPU can't drive the interactive preview (no WebGL2 or low fragment float precision) but COI is present, enter a CPU preview mode — rendering a processed preview through the authoritative export color graph in a Web Worker — instead of hard-failing the whole `/raw` workspace.

**Architecture:** A headless CPU-preview engine (gate decision → worker that owns the decoded window → main-thread client with strict request coalescing → React hook) is built and unit-tested first (Tasks 1–5). Then it is wired into the preview UI with degradations (Tasks 6–8) and verified (Task 9). The CPU renderer reuses `resolveExportColorGraph` + `row-band-processor` (the authoritative export color path), so the preview matches export by construction — including render-exposure, which `resolveExportColorGraph` already folds into the graph as a `raw-render-exposure` step.

**Tech Stack:** TypeScript, Vitest (jsdom app project, `pnpm test:app`), Vite module workers, React, `@lumaforge/luma-color-runtime`.

**Spec:** `docs/superpowers/specs/2026-05-30-cpu-preview-safety-net-design.md`

---

## File Structure

New files:
- `src/lib/preview/raw-preview-capability.ts` — pure gate resolver + `RawPreviewCapability` union.
- `src/lib/preview/cpu-preview-frame.ts` — pure `renderCpuPreviewFrame()` (source + graph → RGBA), shared by worker and tests.
- `src/lib/preview/cpu-preview-protocol.ts` — worker request/response message types + `CpuPreviewFailureReason`.
- `src/lib/preview/cpu-preview.worker.ts` — thin worker wrapping `renderCpuPreviewFrame`.
- `src/lib/preview/cpu-preview-client.ts` — worker-owning client: load-once source, render coalescing.
- `src/modules/raw-processor/hooks/useCpuPreview.ts` — React hook: builds graph from params, drives client, neutral-frame cache.
- `src/modules/raw-processor/components/CpuPreviewCanvas.tsx` — 2D-canvas surface (backing-canvas scaling, spinner, processed/original).
- `src/modules/raw-processor/components/CpuPreviewBanner.tsx` — dismissible degrade banner.

Modified files:
- `src/modules/raw-processor/hooks/useCapabilityGate.ts` — return the union via the pure resolver.
- `src/modules/raw-processor/RawProcessorView.tsx` — hard-block only on `unsupported`; on `degraded` render workspace + banner + CPU preview branch.

Test files (co-located `*.test.ts(x)`): one per new pure/logic module + the component.

---

## Task 1: Gate decision — `RawPreviewCapability` union + pure resolver

**Files:**
- Create: `src/lib/preview/raw-preview-capability.ts`
- Test: `src/lib/preview/raw-preview-capability.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'

import { resolveRawPreviewCapability } from './raw-preview-capability'

const caps = (over: Partial<{ webgl2: boolean; toneHighPrecision: boolean }>) => ({
  webgl2: true,
  toneHighPrecision: true,
  ...over,
})

describe('resolveRawPreviewCapability', () => {
  it('is supported/gpu when webgl2 + highp + COI present', () => {
    expect(resolveRawPreviewCapability(caps({}), true)).toEqual({
      supportStatus: 'supported',
      previewMode: 'gpu',
      reason: null,
    })
  })

  it('hard-fails (unsupported) when COI is missing, regardless of GPU', () => {
    expect(resolveRawPreviewCapability(caps({}), false)).toEqual({
      supportStatus: 'unsupported',
      previewMode: null,
      reason: 'coi-missing',
    })
  })

  it('degrades to cpu when webgl2 missing but COI present', () => {
    expect(resolveRawPreviewCapability(caps({ webgl2: false }), true)).toEqual({
      supportStatus: 'degraded',
      previewMode: 'cpu',
      reason: 'webgl2-missing',
    })
  })

  it('degrades to cpu when float precision is low but COI present', () => {
    expect(
      resolveRawPreviewCapability(caps({ toneHighPrecision: false }), true),
    ).toEqual({
      supportStatus: 'degraded',
      previewMode: 'cpu',
      reason: 'tone-float-precision-low',
    })
  })

  it('treats missing COI as unsupported even when GPU is also insufficient', () => {
    expect(
      resolveRawPreviewCapability(caps({ webgl2: false }), false),
    ).toMatchObject({ supportStatus: 'unsupported', reason: 'coi-missing' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm run test:app src/lib/preview/raw-preview-capability.test.ts`
Expected: FAIL — module not found / `resolveRawPreviewCapability` is not a function.

- [ ] **Step 3: Implement**

```ts
export type RawPreviewCapability =
  | { supportStatus: 'unsupported'; previewMode: null; reason: 'coi-missing' }
  | {
      supportStatus: 'degraded'
      previewMode: 'cpu'
      reason: 'webgl2-missing' | 'tone-float-precision-low'
    }
  | { supportStatus: 'supported'; previewMode: 'gpu'; reason: null }

export type RawPreviewGpuFacts = {
  webgl2: boolean
  toneHighPrecision: boolean
}

/**
 * Pure preview-capability decision. COI gates RAW decode itself (the runtime
 * hard-gates on it), so missing COI is always unsupported. With COI present, an
 * insufficient GPU degrades to the CPU preview instead of hard-failing.
 */
export function resolveRawPreviewCapability(
  gpu: RawPreviewGpuFacts,
  crossOriginIsolated: boolean,
): RawPreviewCapability {
  if (!crossOriginIsolated) {
    return { supportStatus: 'unsupported', previewMode: null, reason: 'coi-missing' }
  }
  if (!gpu.webgl2) {
    return { supportStatus: 'degraded', previewMode: 'cpu', reason: 'webgl2-missing' }
  }
  if (!gpu.toneHighPrecision) {
    return {
      supportStatus: 'degraded',
      previewMode: 'cpu',
      reason: 'tone-float-precision-low',
    }
  }
  return { supportStatus: 'supported', previewMode: 'gpu', reason: null }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm run test:app src/lib/preview/raw-preview-capability.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/preview/raw-preview-capability.ts src/lib/preview/raw-preview-capability.test.ts
git commit --no-gpg-sign -m "feat(raw-preview): pure preview-capability resolver + union"
```

---

## Task 2: Route `useCapabilityGate` through the resolver

**Files:**
- Modify: `src/modules/raw-processor/hooks/useCapabilityGate.ts`
- Test: `src/modules/raw-processor/hooks/useCapabilityGate.test.tsx`

Current `useCapabilityGate` (for reference) returns `{ ready, supportStatus: 'supported' | 'unsupported', reason }` by reading `detectCapabilities()` (`~/lib/gl/context`) and `globalThis.crossOriginIsolated`. We keep `ready: true` and the WebGL2/precision/COI inputs, but produce the union via the pure resolver and surface `previewMode`.

- [ ] **Step 1: Write the failing test**

```tsx
import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import * as glContext from '~/lib/gl/context'

import { useCapabilityGate } from './useCapabilityGate'

describe('useCapabilityGate', () => {
  afterEach(() => vi.restoreAllMocks())

  it('reports gpu preview when capable + COI', () => {
    vi.spyOn(glContext, 'detectCapabilities').mockReturnValue({
      webgl2: true,
      toneHighPrecision: true,
    } as glContext.WebGLCapabilities)
    vi.stubGlobal('crossOriginIsolated', true)
    const { result } = renderHook(() => useCapabilityGate())
    expect(result.current).toMatchObject({
      supportStatus: 'supported',
      previewMode: 'gpu',
    })
    vi.unstubAllGlobals()
  })

  it('degrades to cpu preview when precision is low but COI present', () => {
    vi.spyOn(glContext, 'detectCapabilities').mockReturnValue({
      webgl2: true,
      toneHighPrecision: false,
    } as glContext.WebGLCapabilities)
    vi.stubGlobal('crossOriginIsolated', true)
    const { result } = renderHook(() => useCapabilityGate())
    expect(result.current).toMatchObject({
      supportStatus: 'degraded',
      previewMode: 'cpu',
      reason: 'tone-float-precision-low',
    })
    vi.unstubAllGlobals()
  })

  it('stays unsupported when COI missing', () => {
    vi.spyOn(glContext, 'detectCapabilities').mockReturnValue({
      webgl2: false,
      toneHighPrecision: false,
    } as glContext.WebGLCapabilities)
    vi.stubGlobal('crossOriginIsolated', false)
    const { result } = renderHook(() => useCapabilityGate())
    expect(result.current).toMatchObject({
      supportStatus: 'unsupported',
      previewMode: null,
    })
    vi.unstubAllGlobals()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm run test:app src/modules/raw-processor/hooks/useCapabilityGate.test.tsx`
Expected: FAIL — `previewMode` undefined / shape mismatch.

- [ ] **Step 3: Implement**

Replace the body of `useCapabilityGate` so it returns `{ ready: true } & RawPreviewCapability`:

```ts
import { useMemo } from 'react'

import { detectCapabilities } from '~/lib/gl/context'
import type { RawPreviewCapability } from '~/lib/preview/raw-preview-capability'
import { resolveRawPreviewCapability } from '~/lib/preview/raw-preview-capability'

export type RawCapabilityGate = { ready: true } & RawPreviewCapability

export function useCapabilityGate(): RawCapabilityGate {
  return useMemo(() => {
    const caps = detectCapabilities()
    const coi =
      typeof globalThis.crossOriginIsolated === 'boolean'
        ? globalThis.crossOriginIsolated
        : true
    const capability = resolveRawPreviewCapability(
      { webgl2: caps.webgl2, toneHighPrecision: caps.toneHighPrecision },
      coi,
    )
    return { ready: true, ...capability }
  }, [])
}
```

Note: the legacy default for an indeterminate `crossOriginIsolated` was permissive in the old gate; keep `true` so non-isolated *test* environments without the global do not spuriously hard-fail. The COI hard-fail still fires whenever the global is explicitly `false`.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm run test:app src/modules/raw-processor/hooks/useCapabilityGate.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/modules/raw-processor/hooks/useCapabilityGate.ts src/modules/raw-processor/hooks/useCapabilityGate.test.tsx
git commit --no-gpg-sign -m "feat(raw-preview): gate emits previewMode (gpu/cpu/unsupported)"
```

---

## Task 3: Worker protocol types + pure RGBA frame renderer

**Files:**
- Create: `src/lib/preview/cpu-preview-protocol.ts`
- Create: `src/lib/preview/cpu-preview-frame.ts`
- Test: `src/lib/preview/cpu-preview-frame.test.ts`

`processUint16Rows` returns **packed RGB** and reuses its buffer, so we expand to RGBA (alpha 255) and copy each band before the next call.

- [ ] **Step 1: Protocol types (no test; pure type module)**

`src/lib/preview/cpu-preview-protocol.ts`:

```ts
import type { SupportedExportColorGraphDescriptor } from '@lumaforge/luma-color-runtime'

export type CpuPreviewVariant = 'processed' | 'neutral'

export type CpuPreviewFailureReason =
  | 'worker-construction-failed'
  | 'worker-module-load-failed'
  | 'source-transfer-failed'
  | 'invalid-source-buffer'
  | 'render-failed'
  | 'out-of-memory'

export type CpuPreviewRequest =
  | { type: 'loadSource'; sourceId: string; width: number; height: number; data: Uint16Array }
  | {
      type: 'render'
      sourceId: string
      requestId: number
      graph: SupportedExportColorGraphDescriptor
      variant: CpuPreviewVariant
    }
  | { type: 'disposeSource'; sourceId: string }

export type CpuPreviewResponse =
  | {
      type: 'rendered'
      sourceId: string
      requestId: number
      rgba: Uint8ClampedArray
      width: number
      height: number
    }
  | {
      type: 'error'
      sourceId: string
      requestId?: number
      reason: CpuPreviewFailureReason
    }
```

Note: `renderExposure` is NOT a separate field — it is already folded into `graph` by `resolveExportColorGraph` (the `raw-render-exposure` step). The client builds the graph; the worker only applies it.

- [ ] **Step 2: Write the failing test for `renderCpuPreviewFrame`**

```ts
import {
  resolveExportColorGraph,
  type SupportedExportColorGraphDescriptor,
} from '@lumaforge/luma-color-runtime'
import { createRowBandProcessor } from '@lumaforge/luma-color-runtime'
import { describe, expect, it } from 'vitest'

import { renderCpuPreviewFrame } from './cpu-preview-frame'

function neutralGraph(): SupportedExportColorGraphDescriptor {
  const g = resolveExportColorGraph({
    styleKind: 'none',
    intensity: 0,
    builtinPreset: null,
    lut: null,
  })
  if (!g.supported) throw new Error('expected supported graph')
  return g
}

describe('renderCpuPreviewFrame', () => {
  it('produces width*height*4 RGBA with alpha=255 and matches row-band RGB output', () => {
    const width = 2
    const height = 2
    const source = new Uint16Array([
      1000, 2000, 3000, 4000, 5000, 6000, // row 0: 2 px RGB
      7000, 8000, 9000, 10000, 11000, 12000, // row 1
    ])
    const graph = neutralGraph()

    const rgba = renderCpuPreviewFrame({ data: source, width, height, graph })

    expect(rgba).toBeInstanceOf(Uint8ClampedArray)
    expect(rgba.length).toBe(width * height * 4)
    for (let p = 0; p < width * height; p += 1) {
      expect(rgba[p * 4 + 3]).toBe(255) // alpha
    }

    // Parity with the authoritative export executor for the same graph.
    const proc = createRowBandProcessor({ width, rowBandRows: height, graph })
    const rgb = proc.processUint16Rows(source, height) // packed RGB
    for (let p = 0; p < width * height; p += 1) {
      expect(rgba[p * 4 + 0]).toBe(rgb[p * 3 + 0])
      expect(rgba[p * 4 + 1]).toBe(rgb[p * 3 + 1])
      expect(rgba[p * 4 + 2]).toBe(rgb[p * 3 + 2])
    }
  })
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm run test:app src/lib/preview/cpu-preview-frame.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `cpu-preview-frame.ts`**

```ts
import {
  createRowBandProcessor,
  type SupportedExportColorGraphDescriptor,
} from '@lumaforge/luma-color-runtime'

const PREVIEW_ROW_BAND_ROWS = 32

export type RenderCpuPreviewFrameInput = {
  data: Uint16Array
  width: number
  height: number
  graph: SupportedExportColorGraphDescriptor
}

/**
 * Render a full RGBA frame from an rgb-u16 linear-ProPhoto window using the
 * authoritative export color graph. `processUint16Rows` returns packed RGB and
 * reuses its output buffer, so each band is expanded to RGBA and copied out
 * before the next band.
 */
export function renderCpuPreviewFrame({
  data,
  width,
  height,
  graph,
}: RenderCpuPreviewFrameInput): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(width * height * 4)
  const proc = createRowBandProcessor({
    width,
    rowBandRows: Math.min(PREVIEW_ROW_BAND_ROWS, height),
    graph,
  })

  for (let row = 0; row < height; row += proc.rowBandRows) {
    const rowCount = Math.min(proc.rowBandRows, height - row)
    const srcOffset = row * width * 3
    const band = data.subarray(srcOffset, srcOffset + rowCount * width * 3)
    const rgb = proc.processUint16Rows(band, rowCount) // packed RGB, reused buffer
    const pixelCount = rowCount * width
    const dstPixelOffset = row * width
    for (let p = 0; p < pixelCount; p += 1) {
      const d = (dstPixelOffset + p) * 4
      const s = p * 3
      rgba[d + 0] = rgb[s + 0]
      rgba[d + 1] = rgb[s + 1]
      rgba[d + 2] = rgb[s + 2]
      rgba[d + 3] = 255
    }
  }

  return rgba
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm run test:app src/lib/preview/cpu-preview-frame.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/preview/cpu-preview-protocol.ts src/lib/preview/cpu-preview-frame.ts src/lib/preview/cpu-preview-frame.test.ts
git commit --no-gpg-sign -m "feat(raw-preview): pure CPU preview frame renderer + worker protocol"
```

---

## Task 4: Color-contract parity test (CPU frame vs export, including render-exposure)

**Files:**
- Test: `src/lib/preview/cpu-preview-parity.test.ts`

This is the key contract guard: the CPU preview frame must equal the export path's RGB output for the same params/graph/window across exposure≠1, clipping, tone, and LUT.

- [ ] **Step 1: Write the parity test**

```ts
import {
  createRowBandProcessor,
  exposureMultiplierFromEv,
  resolveExportColorGraph,
  type RawRenderExposure,
} from '@lumaforge/luma-color-runtime'
import { describe, expect, it } from 'vitest'

import { renderCpuPreviewFrame } from './cpu-preview-frame'

function makeExposure(ev: number): RawRenderExposure {
  return { ev, multiplier: exposureMultiplierFromEv(ev), source: 'metadata' }
}

function buildGraph(over: Partial<Parameters<typeof resolveExportColorGraph>[0]>) {
  const g = resolveExportColorGraph({
    styleKind: 'none',
    intensity: 0,
    builtinPreset: null,
    lut: null,
    ...over,
  })
  if (!g.supported) throw new Error('expected supported graph')
  return g
}

const width = 4
const height = 4
const source = new Uint16Array(width * height * 3)
for (let i = 0; i < source.length; i += 1) source[i] = (i * 911) % 65536

function exportRgb(graph: ReturnType<typeof buildGraph>) {
  const proc = createRowBandProcessor({ width, rowBandRows: height, graph })
  return proc.processUint16Rows(source, height)
}

function assertParity(graph: ReturnType<typeof buildGraph>) {
  const rgba = renderCpuPreviewFrame({ data: source, width, height, graph })
  const rgb = exportRgb(graph)
  for (let p = 0; p < width * height; p += 1) {
    expect(rgba[p * 4 + 0]).toBe(rgb[p * 3 + 0])
    expect(rgba[p * 4 + 1]).toBe(rgb[p * 3 + 1])
    expect(rgba[p * 4 + 2]).toBe(rgb[p * 3 + 2])
  }
}

describe('CPU preview == export parity', () => {
  it('matches with render-exposure < 1', () => {
    assertParity(buildGraph({ rawRenderExposure: makeExposure(-1.5) }))
  })
  it('matches with render-exposure > 1 (highlight clipping)', () => {
    assertParity(buildGraph({ rawRenderExposure: makeExposure(2.5) }))
  })
  it('matches with tone adjustments', () => {
    assertParity(
      buildGraph({ userContrast: 40, userHighlights: -30, userShadows: 25 }),
    )
  })
})
```

(If a `RawRenderExposure.source` literal other than `'metadata'` is required by the type, use the value the type permits — confirm against `raw-render-exposure.ts`.)

- [ ] **Step 2: Run to verify it passes** (no new implementation — guards existing behavior)

Run: `pnpm run test:app src/lib/preview/cpu-preview-parity.test.ts`
Expected: PASS. If any case fails, the CPU frame diverges from export — STOP and reconcile `renderCpuPreviewFrame` band handling before continuing (do not change export/color math).

- [ ] **Step 3: Commit**

```bash
git add src/lib/preview/cpu-preview-parity.test.ts
git commit --no-gpg-sign -m "test(raw-preview): CPU preview matches export across exposure/tone"
```

---

## Task 5: CPU preview client — load-once source + render coalescing

**Files:**
- Create: `src/lib/preview/cpu-preview-client.ts`
- Test: `src/lib/preview/cpu-preview-client.test.ts`

The client owns a worker-like object, loads the source once per `sourceId`, and enforces **≤1 in-flight render + ≤1 pending-latest**. It is tested against a fake worker (no real Worker in jsdom).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from 'vitest'

import { CpuPreviewClient, type CpuPreviewWorkerLike } from './cpu-preview-client'
import type { CpuPreviewRequest, CpuPreviewResponse } from './cpu-preview-protocol'

function fakeWorker() {
  const posted: CpuPreviewRequest[] = []
  let onmessage: ((e: { data: CpuPreviewResponse }) => void) | null = null
  const worker: CpuPreviewWorkerLike = {
    postMessage: (msg: CpuPreviewRequest) => {
      posted.push(msg)
    },
    set onmessage(fn) {
      onmessage = fn
    },
    get onmessage() {
      return onmessage
    },
    set onerror(_fn) {},
    terminate: vi.fn(),
  }
  const respond = (r: CpuPreviewResponse) => onmessage?.({ data: r })
  return { worker, posted, respond }
}

const graph = { steps: [] } as never // shape irrelevant to client queueing

describe('CpuPreviewClient', () => {
  it('sends the source exactly once, then renders carry no source data', () => {
    const { worker, posted } = fakeWorker()
    const client = new CpuPreviewClient(() => worker)
    const data = new Uint16Array(2 * 2 * 3)
    client.loadSource({ sourceId: 's1', width: 2, height: 2, data })
    client.requestRender({ variant: 'processed', graph })
    const loads = posted.filter((m) => m.type === 'loadSource')
    const renders = posted.filter((m) => m.type === 'render')
    expect(loads).toHaveLength(1)
    expect(renders).toHaveLength(1)
    expect('data' in renders[0]).toBe(false)
  })

  it('keeps at most one in-flight render + one pending-latest', () => {
    const { worker, posted, respond } = fakeWorker()
    const client = new CpuPreviewClient(() => worker)
    client.loadSource({ sourceId: 's1', width: 2, height: 2, data: new Uint16Array(12) })

    for (let i = 0; i < 5; i += 1) client.requestRender({ variant: 'processed', graph })

    // Only the first render is posted; the rest collapse into one pending.
    expect(posted.filter((m) => m.type === 'render')).toHaveLength(1)

    const firstRender = posted.find((m) => m.type === 'render') as Extract<
      CpuPreviewRequest,
      { type: 'render' }
    >
    respond({
      type: 'rendered',
      sourceId: 's1',
      requestId: firstRender.requestId,
      rgba: new Uint8ClampedArray(16),
      width: 2,
      height: 2,
    })

    // After the in-flight completes, exactly one pending render is posted.
    expect(posted.filter((m) => m.type === 'render')).toHaveLength(2)
  })

  it('commits only the latest frame and ignores stale responses', () => {
    const { worker, posted, respond } = fakeWorker()
    const client = new CpuPreviewClient(() => worker)
    const frames: number[] = []
    client.onFrame((f) => frames.push(f.requestId))
    client.loadSource({ sourceId: 's1', width: 2, height: 2, data: new Uint16Array(12) })
    client.requestRender({ variant: 'processed', graph })
    client.requestRender({ variant: 'processed', graph }) // becomes pending

    const renders = posted.filter((m) => m.type === 'render') as Array<
      Extract<CpuPreviewRequest, { type: 'render' }>
    >
    // Respond to the in-flight (first) -> commit + flush pending.
    respond({
      type: 'rendered', sourceId: 's1', requestId: renders[0].requestId,
      rgba: new Uint8ClampedArray(16), width: 2, height: 2,
    })
    const renders2 = posted.filter((m) => m.type === 'render') as Array<
      Extract<CpuPreviewRequest, { type: 'render' }>
    >
    respond({
      type: 'rendered', sourceId: 's1', requestId: renders2[1].requestId,
      rgba: new Uint8ClampedArray(16), width: 2, height: 2,
    })
    // A late duplicate of the first must be ignored.
    respond({
      type: 'rendered', sourceId: 's1', requestId: renders[0].requestId,
      rgba: new Uint8ClampedArray(16), width: 2, height: 2,
    })
    expect(frames).toEqual([renders[0].requestId, renders2[1].requestId])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm run test:app src/lib/preview/cpu-preview-client.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `cpu-preview-client.ts`**

```ts
import type {
  CpuPreviewFailureReason,
  CpuPreviewRequest,
  CpuPreviewResponse,
  CpuPreviewVariant,
} from './cpu-preview-protocol'
import type { SupportedExportColorGraphDescriptor } from '@lumaforge/luma-color-runtime'

export type CpuPreviewWorkerLike = {
  postMessage: (msg: CpuPreviewRequest, transfer?: Transferable[]) => void
  onmessage: ((e: { data: CpuPreviewResponse }) => void) | null
  onerror: ((e: unknown) => void) | null
  terminate: () => void
}

export type CpuPreviewFrame = {
  requestId: number
  sourceId: string
  rgba: Uint8ClampedArray
  width: number
  height: number
}

type PendingRender = {
  variant: CpuPreviewVariant
  graph: SupportedExportColorGraphDescriptor
}

const defaultWorkerFactory = (): CpuPreviewWorkerLike =>
  new Worker(new URL('./cpu-preview.worker.ts', import.meta.url), {
    type: 'module',
  }) as unknown as CpuPreviewWorkerLike

export class CpuPreviewClient {
  private worker: CpuPreviewWorkerLike | null = null
  private sourceId: string | null = null
  private nextRequestId = 1
  private inFlightId: number | null = null
  private pending: PendingRender | null = null
  private frameHandler: ((f: CpuPreviewFrame) => void) | null = null
  private errorHandler: ((r: CpuPreviewFailureReason) => void) | null = null

  constructor(private readonly factory: () => CpuPreviewWorkerLike = defaultWorkerFactory) {}

  onFrame(fn: (f: CpuPreviewFrame) => void) {
    this.frameHandler = fn
  }
  onError(fn: (r: CpuPreviewFailureReason) => void) {
    this.errorHandler = fn
  }

  private ensureWorker(): CpuPreviewWorkerLike {
    if (this.worker) return this.worker
    let worker: CpuPreviewWorkerLike
    try {
      worker = this.factory()
    } catch {
      this.errorHandler?.('worker-construction-failed')
      throw new Error('worker-construction-failed')
    }
    worker.onmessage = (e) => this.handle(e.data)
    worker.onerror = () => this.errorHandler?.('worker-module-load-failed')
    this.worker = worker
    return worker
  }

  loadSource(input: { sourceId: string; width: number; height: number; data: Uint16Array }) {
    const worker = this.ensureWorker()
    this.sourceId = input.sourceId
    this.inFlightId = null
    this.pending = null
    // Copy so the caller's buffer is never detached out from under app state.
    const copy = input.data.slice()
    worker.postMessage(
      { type: 'loadSource', sourceId: input.sourceId, width: input.width, height: input.height, data: copy },
      [copy.buffer],
    )
  }

  requestRender(req: PendingRender) {
    if (!this.sourceId) return
    if (this.inFlightId != null) {
      this.pending = req // collapse: keep only the latest
      return
    }
    this.post(req)
  }

  private post(req: PendingRender) {
    const worker = this.ensureWorker()
    const requestId = this.nextRequestId++
    this.inFlightId = requestId
    worker.postMessage({
      type: 'render',
      sourceId: this.sourceId!,
      requestId,
      graph: req.graph,
      variant: req.variant,
    })
  }

  private handle(res: CpuPreviewResponse) {
    if (res.type === 'error') {
      this.inFlightId = null
      this.errorHandler?.(res.reason)
      this.flushPending()
      return
    }
    const isLatest = res.requestId === this.inFlightId && res.sourceId === this.sourceId
    this.inFlightId = null
    if (isLatest) {
      this.frameHandler?.({
        requestId: res.requestId,
        sourceId: res.sourceId,
        rgba: res.rgba,
        width: res.width,
        height: res.height,
      })
    }
    this.flushPending()
  }

  private flushPending() {
    if (this.pending && this.sourceId) {
      const next = this.pending
      this.pending = null
      this.post(next)
    }
  }

  dispose() {
    if (this.worker && this.sourceId) {
      this.worker.postMessage({ type: 'disposeSource', sourceId: this.sourceId })
    }
    this.worker?.terminate()
    this.worker = null
    this.sourceId = null
    this.inFlightId = null
    this.pending = null
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm run test:app src/lib/preview/cpu-preview-client.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Implement the worker shell `cpu-preview.worker.ts`**

```ts
/// <reference lib="webworker" />
import { renderCpuPreviewFrame } from './cpu-preview-frame'
import type { CpuPreviewRequest, CpuPreviewResponse } from './cpu-preview-protocol'

type SourceState = { width: number; height: number; data: Uint16Array }
const sources = new Map<string, SourceState>()

function reply(res: CpuPreviewResponse, transfer?: Transferable[]) {
  ;(self as unknown as Worker).postMessage(res, transfer ?? [])
}

self.onmessage = (e: MessageEvent<CpuPreviewRequest>) => {
  const msg = e.data
  if (msg.type === 'loadSource') {
    if (!(msg.data instanceof Uint16Array) || msg.data.length !== msg.width * msg.height * 3) {
      reply({ type: 'error', sourceId: msg.sourceId, reason: 'invalid-source-buffer' })
      return
    }
    sources.set(msg.sourceId, { width: msg.width, height: msg.height, data: msg.data })
    return
  }
  if (msg.type === 'disposeSource') {
    sources.delete(msg.sourceId)
    return
  }
  // render
  const src = sources.get(msg.sourceId)
  if (!src) {
    reply({ type: 'error', sourceId: msg.sourceId, requestId: msg.requestId, reason: 'invalid-source-buffer' })
    return
  }
  try {
    const rgba = renderCpuPreviewFrame({
      data: src.data,
      width: src.width,
      height: src.height,
      graph: msg.graph,
    })
    reply(
      { type: 'rendered', sourceId: msg.sourceId, requestId: msg.requestId, rgba, width: src.width, height: src.height },
      [rgba.buffer],
    )
  } catch (error) {
    const reason =
      error instanceof RangeError ? 'out-of-memory' : 'render-failed'
    reply({ type: 'error', sourceId: msg.sourceId, requestId: msg.requestId, reason })
  }
}

export {}
```

Note: the `neutral` vs `processed` distinction is realized by the **graph** the client builds (Task 6), not by the worker. The worker just applies whatever graph it receives.

- [ ] **Step 6: Commit**

```bash
git add src/lib/preview/cpu-preview-client.ts src/lib/preview/cpu-preview-client.test.ts src/lib/preview/cpu-preview.worker.ts
git commit --no-gpg-sign -m "feat(raw-preview): worker client with load-once source + render coalescing"
```

---

## Task 6: `useCpuPreview` hook — graph building + neutral cache

**Files:**
- Create: `src/modules/raw-processor/hooks/useCpuPreview.ts`
- Test: `src/modules/raw-processor/hooks/useCpuPreview.test.ts` (pure helpers only)

The hook wires the client to the live preview params + the decoded `quick` window. To keep it testable, factor the pure parts into exported helpers and test those; the React effect wiring is exercised in the component/integration test (Task 7) and browser validation.

Pure helpers to implement + test:

```ts
// neutral cache key: invalidate only on source / render-exposure / neutral-graph change
export function neutralFrameCacheKey(sourceId: string, renderExposureEv: number): string

// build the graph for a variant from the live params (mirrors resolveExportColorGraph inputs)
export type CpuPreviewParams = {
  styleKind: ProcessingParams['styleKind']
  intensity: number
  builtinPreset: ProcessingParams['builtinPreset']
  lut: LUTData | null
  rawRenderExposure: RawRenderExposure
  userExposureEv: number; userContrast: number; userHighlights: number
  userShadows: number; userWhites: number; userBlacks: number
}
export function buildCpuPreviewGraph(
  params: CpuPreviewParams,
  variant: CpuPreviewVariant,
): SupportedExportColorGraphDescriptor | { unsupportedReason: string }
```

- [ ] **Step 1: Write the failing test**

```ts
import { exposureMultiplierFromEv, type RawRenderExposure } from '@lumaforge/luma-color-runtime'
import { describe, expect, it } from 'vitest'

import { buildCpuPreviewGraph, neutralFrameCacheKey } from './useCpuPreview'

const exposure: RawRenderExposure = { ev: 0.5, multiplier: exposureMultiplierFromEv(0.5), source: 'metadata' }
const baseParams = {
  styleKind: 'custom' as const, intensity: 0.8, builtinPreset: null, lut: null,
  rawRenderExposure: exposure,
  userExposureEv: 0, userContrast: 20, userHighlights: 0, userShadows: 0, userWhites: 0, userBlacks: 0,
}

describe('useCpuPreview helpers', () => {
  it('neutral cache key changes with source + render exposure only', () => {
    expect(neutralFrameCacheKey('s1', 0.5)).toBe(neutralFrameCacheKey('s1', 0.5))
    expect(neutralFrameCacheKey('s1', 0.5)).not.toBe(neutralFrameCacheKey('s1', 1.0))
    expect(neutralFrameCacheKey('s1', 0.5)).not.toBe(neutralFrameCacheKey('s2', 0.5))
  })

  it('neutral variant drops look/LUT/tone but keeps render exposure', () => {
    const g = buildCpuPreviewGraph(baseParams, 'neutral')
    expect('unsupportedReason' in g).toBe(false)
    // Neutral graph equals a no-look graph carrying the same render exposure.
    const expected = buildCpuPreviewGraph(
      { ...baseParams, styleKind: 'none', intensity: 0, lut: null, userContrast: 0 },
      'processed',
    )
    expect(g).toEqual(expected)
  })

  it('processed variant honors the look params', () => {
    const g = buildCpuPreviewGraph(baseParams, 'processed')
    expect('unsupportedReason' in g).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm run test:app src/modules/raw-processor/hooks/useCpuPreview.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the hook + helpers**

Implement `buildCpuPreviewGraph` by calling `resolveExportColorGraph`. For `'neutral'`, pass `styleKind: 'none', intensity: 0, builtinPreset: null, lut: null` and zeroed user tone, but keep `rawRenderExposure`. Return `{ unsupportedReason }` when the resolved graph is not `supported` (e.g. an unsupported LUT output transfer) so the caller can fall back. `neutralFrameCacheKey` = `` `${sourceId}:${renderExposureEv}` ``.

The hook (`useCpuPreview`) takes `{ enabled: boolean; decodedImageRef; params; variant }`, lazily constructs a `CpuPreviewClient`, calls `loadSource` whenever the decoded `quick` window identity changes (derive a stable `sourceId`, e.g. an incrementing decode id or the window byte length + dims), and `requestRender(buildCpuPreviewGraph(params, variant))` on param/variant change (debounced via the existing apply/release path — do not render per pointer-move). It memoizes the neutral frame by `neutralFrameCacheKey`. It returns `{ frame, inFlight, failureReason }`. Dispose the client on unmount.

Wire the live params from the same source `PreviewCanvas`/`ComparePreviewStage` reads (session params + `decodedImageRef.current.renderExposure`). The decoded source must be the `quick` window (`DecodedImage` with `data instanceof Uint16Array`, `source === 'quick'`, `layout` rgb16). If only a Float32 window is present, the CPU path does not run (degrade banner explains); guard accordingly.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm run test:app src/modules/raw-processor/hooks/useCpuPreview.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/modules/raw-processor/hooks/useCpuPreview.ts src/modules/raw-processor/hooks/useCpuPreview.test.ts
git commit --no-gpg-sign -m "feat(raw-preview): useCpuPreview hook + graph build + neutral cache"
```

---

## Task 7: `CpuPreviewCanvas` + `CpuPreviewBanner` components

**Files:**
- Create: `src/modules/raw-processor/components/CpuPreviewCanvas.tsx`
- Create: `src/modules/raw-processor/components/CpuPreviewBanner.tsx`
- Test: `src/modules/raw-processor/components/CpuPreviewCanvas.test.tsx`

`CpuPreviewCanvas` props: `{ frame: CpuPreviewFrame | null; inFlight: boolean; fallbackThumbnailUrl?: string | null; failureReason?: CpuPreviewFailureReason | null }`. Rendering rules:
- Maintain a hidden **backing canvas** at `frame.width × frame.height`; `putImageData(new ImageData(frame.rgba, frame.width, frame.height), 0, 0)`; then `drawImage(backing, 0, 0, cssW, cssH)` onto the visible canvas (do NOT rely on `ctx.scale` + `putImageData`).
- While `inFlight`, show a spinner overlay; keep the previous frame visible (last-good).
- If no frame and `failureReason`: show `fallbackThumbnailUrl` if present, else an explicit "preview unavailable" placeholder (never a blank canvas).

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { CpuPreviewCanvas } from './CpuPreviewCanvas'

const frame = {
  requestId: 1, sourceId: 's1',
  rgba: new Uint8ClampedArray(2 * 2 * 4).fill(128),
  width: 2, height: 2,
}

describe('CpuPreviewCanvas', () => {
  it('draws the frame to a backing canvas via drawImage (not transform+putImageData)', () => {
    const drawImage = vi.fn()
    const putImageData = vi.fn()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage, putImageData, clearRect: vi.fn(), scale: vi.fn(),
    } as unknown as CanvasRenderingContext2D)

    render(<CpuPreviewCanvas frame={frame} inFlight={false} />)
    expect(putImageData).toHaveBeenCalled() // onto backing canvas
    expect(drawImage).toHaveBeenCalled() // backing -> visible
    vi.restoreAllMocks()
  })

  it('shows a spinner while a render is in flight', () => {
    render(<CpuPreviewCanvas frame={frame} inFlight />)
    expect(screen.getByTestId('cpu-preview-spinner')).toBeInTheDocument()
  })

  it('shows an explicit placeholder when no frame and no thumbnail on failure', () => {
    render(<CpuPreviewCanvas frame={null} inFlight={false} failureReason="render-failed" />)
    expect(screen.getByTestId('cpu-preview-unavailable')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm run test:app src/modules/raw-processor/components/CpuPreviewCanvas.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement both components**

`CpuPreviewCanvas`: a `useRef` visible canvas + an offscreen backing `document.createElement('canvas')` sized to the frame; an effect redraws on `frame` change (backing `putImageData` then visible `drawImage` fit-scaled, honoring `devicePixelRatio`). Spinner overlay gated by `inFlight` (use the existing loader primitive; `data-testid="cpu-preview-spinner"`). Placeholder element `data-testid="cpu-preview-unavailable"` when `frame == null && !fallbackThumbnailUrl`. Follow existing `/raw` styling (Radix + Tailwind, `lf-*` tokens) per `AGENTS.md`/`DESIGN.md`.

`CpuPreviewBanner`: a dismissible banner (reuse an existing banner/alert primitive if present under `src/components/ui`) with copy keyed off the gate `reason` (`'webgl2-missing' | 'tone-float-precision-low'`), e.g. "GPU preview unavailable — using a slower CPU preview. Live compare and histogram are off." i18n via the existing `t()` (add keys under `raw.preview.cpuDegraded.*`).

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm run test:app src/modules/raw-processor/components/CpuPreviewCanvas.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/modules/raw-processor/components/CpuPreviewCanvas.tsx src/modules/raw-processor/components/CpuPreviewBanner.tsx src/modules/raw-processor/components/CpuPreviewCanvas.test.tsx
git commit --no-gpg-sign -m "feat(raw-preview): CpuPreviewCanvas + degrade banner"
```

---

## Task 8: Wire CPU mode into `RawProcessorView` + degradations

**Files:**
- Modify: `src/modules/raw-processor/RawProcessorView.tsx` (gate consumer ~line 339; preview mount ~line 376)
- Test: `src/modules/raw-processor/__tests__/raw-route-shell.test.tsx` (extend) or a focused new view test

Integration task (no new pure logic). Changes:

1. The gate result is now the union. Keep the existing hard-block branch but trigger it only for `supportStatus === 'unsupported'` (COI). The `UnsupportedState` reason copy stays.
2. When `supportStatus === 'degraded'` (`previewMode === 'cpu'`): render the normal workspace shell, but
   - render `<CpuPreviewBanner reason={capability.reason} />` (dismissible) above/within the workspace chrome,
   - replace the `<ComparePreviewStage>` mount with a CPU preview surface driven by `useCpuPreview(...)` + `<CpuPreviewCanvas>`, in **processed-only** mode with an `original` toggle that swaps `variant` between `'processed'` and `'neutral'` (no live split),
   - pass `previewMode` to the compare + histogram controls so compare-split is disabled and the histogram shows its existing `'unsupported'` state.
3. When `supportStatus === 'supported'` (`previewMode === 'gpu'`): unchanged GPU path.

- [ ] **Step 1: Write the failing test**

A view-level test that mounts `RawProcessorView` (with the existing test providers/harness used by `raw-route-shell.test.tsx`) under two stubbed gate states:
- `degraded`/`cpu`: asserts the workspace shell renders (NOT the full-page `UnsupportedState`), the degrade banner is present (`data-testid` or banner copy), and the GPU `PreviewCanvas` is absent.
- `unsupported`/`coi-missing`: asserts the full-page `UnsupportedState` still renders.

Stub `useCapabilityGate` via `vi.mock('../hooks/useCapabilityGate', ...)` returning the union shapes. Use the existing harness's image/session stubs so the workspace can mount. (Mirror the setup already in `raw-route-shell.test.tsx`.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm run test:app src/modules/raw-processor/__tests__/raw-route-shell.test.tsx`
Expected: FAIL — degraded path not implemented (currently degrade would either hard-block or render the GPU stage).

- [ ] **Step 3: Implement the wiring** in `RawProcessorView.tsx` as described above. Thread a `previewMode` prop (or context) into `ComparePreviewStage`/compare + histogram controls to gate split-compare and histogram. Keep the GPU path byte-for-byte unchanged when `previewMode === 'gpu'`.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm run test:app src/modules/raw-processor/__tests__/raw-route-shell.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/raw-processor/RawProcessorView.tsx src/modules/raw-processor/__tests__/raw-route-shell.test.tsx
git commit --no-gpg-sign -m "feat(raw-preview): enter CPU preview mode on GPU degrade instead of hard-fail"
```

---

## Task 9: Verification + browser validation

**Files:** none (verification only)

- [ ] **Step 1: Lint**

Run: `pnpm lint:check`
Expected: PASS (no unused vars/imports; no `any` regressions in new files).

- [ ] **Step 2: App test sweep**

Run: `pnpm run test:app`
Expected: PASS — all new suites green, no regressions in existing preview/export/gate suites.

- [ ] **Step 3: Forced-degrade browser validation**

Per `project_raw_browser_validation` (use `vite preview`, not dev). Force the degrade by overriding GPU facts: in `detectCapabilities`/`useCapabilityGate`, support a dev/test override (e.g. a `?forcePreview=cpu` query flag read once at gate time, guarded to non-production) so a real browser can exercise CPU mode without low-precision hardware. Validate: workspace loads with banner, a RAW produces a processed CPU preview, tone/LUT/intensity re-render on release, the `original` toggle works, compare-split + histogram are disabled, and export still succeeds. Capture findings.

- [ ] **Step 4: Closeout build**

Run: `LUMAFORGE_NATIVE_RUNTIME_MODE=prebuilt pnpm build`
Expected: PASS — the new module worker bundles (mirrors `full-res-export.worker.ts`).

- [ ] **Step 5: Commit any validation-driven fixes** with focused messages.

---

## Notes for the implementer

- Work only in the worktree: `/workspaces/LumaForge/LumaForge/.worktrees/feat/raw-cpu-preview-safety-net`. Bash cwd does not persist — prefix each command with `cd <worktree> &&`. `node_modules` is a symlink; do not `pnpm install`.
- Commits use `--no-gpg-sign` (SSH signing hangs headless).
- Color correctness is guaranteed by reusing `resolveExportColorGraph` (render-exposure is folded into the graph as a `raw-render-exposure` step — no separate handling). Never duplicate or "tweak" color math to make a preview look right; the Task 4 parity test is the contract.
- Branch: `feat/raw-cpu-preview-safety-net` (off `main` @ `2193c47`).
