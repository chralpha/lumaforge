# Bounded Preview Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace full-resolution HQ preview with an embedded -> quick `<=2.5MP` -> bounded HQ `12MP` preview ladder that becomes interactive after quick preview and never uploads full-resolution preview pixels.

**Architecture:** Keep full-resolution export separate from preview. Add a bounded-HQ runtime API that always receives a `maxOutputPixels` cap, wire the app adapter and session model to `bounded-hq`, then make the preview pipeline return after quick preview while bounded HQ continues as a silent background upgrade. Failures in bounded HQ update only preview diagnostics and keep quick preview active.

**Tech Stack:** TypeScript 6, React 19 hooks, Jotai state atoms, Vitest, Vite workers, `@lumaforge/luma-raw-runtime`, LibRaw WASM.

---

## Relationship To Existing Plans

This is an appended plan. Do not edit older implementation plans while executing it.

Primary spec sources:

- `docs/specs/2026-04-25-high-resolution-browser-export-design.md`
- `docs/specs/2026-04-22-phase1-browser-raw-mvp-design.md`
- `docs/specs/2026-04-23-luma-raw-runtime-migration-design.md`

The implementation must preserve these invariants:

- Preview never requests, returns, transfers, uploads, or renders an uncapped full-resolution RGB preview asset.
- Quick preview is capped at `2_500_000` pixels and is the first interactive preview source.
- Bounded HQ preview is capped by policy at `12_000_000` pixels and is skipped only when quick preview already covers the source.
- Quick preview readiness unblocks LUT selection, compare, view changes, and export-readiness evaluation.
- Bounded HQ failure never moves the session into a fatal state when quick preview is ready.
- Full-resolution export uses the processed-window export path and does not depend on bounded HQ preview readiness.

## Execution Preflight

Start from a clean worktree or an isolated repo-local worktree:

```bash
git status --short
pnpm install --frozen-lockfile
```

Expected:

- `git status --short` shows only intentional local changes.
- `pnpm install --frozen-lockfile` exits `0`.

If using an isolated worktree:

```bash
pnpm worktree feat/bounded-preview-pipeline
cd /workspaces/LumaForge/LumaForge/.worktrees/feat/bounded-preview-pipeline
pnpm install --frozen-lockfile
```

## File Structure

Modify:

- `src/lib/raw/decoder.ts`: define preview pixel caps and rename decoded preview source type to include `bounded-hq`.
- `src/lib/raw/luma-runtime-adapter.ts`: expose `decodeBoundedHqRaw()` and call runtime bounded HQ with a cap.
- `src/lib/raw/runtime-adapter.ts`: expose bounded HQ through `RawRuntimeSession` and `RawRuntimeAdapter`.
- `src/lib/raw/runtime-adapter.test.ts`: adapter coverage for capped bounded HQ requests and normalized errors.
- `packages/luma-raw-runtime/src/types.ts`: add bounded HQ options and public runtime/session methods.
- `packages/luma-raw-runtime/src/worker-protocol.ts`: add bounded HQ request and response types with `maxOutputPixels`.
- `packages/luma-raw-runtime/src/runtime.ts`: send bounded HQ worker requests and keep session timing behavior.
- `packages/luma-raw-runtime/src/runtime.test.ts`: runtime client coverage for bounded HQ payloads.
- `packages/luma-raw-runtime/worker/runtime-core.ts`: route bounded HQ to high-quality native settings with capped output and `source: 'bounded-hq'`.
- `packages/luma-raw-runtime/worker/runtime-core.test.ts`: worker coverage for capped bounded HQ and no uncapped HQ preview path.
- `packages/luma-raw-runtime/src/worker-client.test.ts`: worker client type coverage for bounded HQ transfer behavior if message names are asserted.
- `src/modules/raw-processor/model/session.ts`: rename preview state from `hqImage` to `boundedHqPreview`, add `skipped`, and change `DisplaySource`.
- `src/modules/raw-processor/model/derive-session.ts`: prefer bounded HQ display, keep quick as export gate, and remove HQ readiness dependency.
- `src/modules/raw-processor/__tests__/session-derive.test.ts`: derivation coverage for quick-ready export and bounded-HQ failure.
- `src/modules/raw-processor/services/preview-resolution-policy.ts`: choose quick and bounded-HQ caps without browser-specific policy branches.
- `src/modules/raw-processor/services/preview-resolution-policy.test.ts`: policy tests for the default cap and tiny-source skip decisions.
- `src/modules/raw-processor/services/preview-pipeline.ts`: make bounded HQ a background stage and add bounded-HQ events.
- `src/modules/raw-processor/__tests__/preview-pipeline.test.ts`: preview event ordering and nonblocking bounded-HQ tests.
- `src/modules/raw-processor/hooks/useRawProcessor.ts`: wire quick-ready interactivity, silent bounded-HQ update, cancellation, and status/progress behavior.
- `src/modules/raw-processor/hooks/useRawProcessor.test.tsx`: hook coverage for quick unblocking, bounded-HQ failure, and session replacement cancellation.

Do not modify:

- Existing `docs/plans/*.md`.
- Full-resolution export strip scheduling or output dimensions.
- LUT contract semantics.
- Built-in/custom LUT profile resolution.

---

### Task 1: Update Preview Model Names And Export Derivation

**Files:**

- Modify: `src/lib/raw/decoder.ts`
- Modify: `src/modules/raw-processor/model/session.ts`
- Modify: `src/modules/raw-processor/model/derive-session.ts`
- Modify: `src/modules/raw-processor/__tests__/session-derive.test.ts`

- [ ] **Step 1: Write failing session derivation tests**

Edit `src/modules/raw-processor/__tests__/session-derive.test.ts` so `baseSession.previewBundle` uses `boundedHqPreview` and add these tests:

```ts
it('prefers bounded HQ for display without requiring it for export', () => {
  const session: ImageSession = {
    ...baseSession,
    previewBundle: {
      ...baseSession.previewBundle,
      quickDecodePreview: { status: 'ready', width: 2000, height: 1250 },
      boundedHqPreview: { status: 'ready', width: 4000, height: 3000 },
    },
    exportState: {
      ...baseSession.exportState,
      status: 'idle',
      fullResCapability: { status: 'supported', width: 8000, height: 6000 },
    },
  }

  expect(selectDisplaySource(session.previewBundle)).toBe('bounded-hq')
  expect(deriveCanExport(session)).toBe(true)
})

it('keeps export available when bounded HQ fails after quick preview', () => {
  const session: ImageSession = {
    ...baseSession,
    previewBundle: {
      ...baseSession.previewBundle,
      quickDecodePreview: { status: 'ready', width: 2000, height: 1250 },
      boundedHqPreview: {
        status: 'failed',
        errorCode: 'RAW_BOUNDED_HQ_DECODE_FAILED',
      },
    },
    exportState: {
      ...baseSession.exportState,
      status: 'idle',
      fullResCapability: { status: 'supported', width: 8000, height: 6000 },
    },
  }

  expect(selectDisplaySource(session.previewBundle)).toBe('quick')
  expect(deriveCanEdit(session)).toBe(true)
  expect(deriveCanExport(session)).toBe(true)
})

it('requires quick preview before full-resolution export can be enabled', () => {
  const session: ImageSession = {
    ...baseSession,
    previewBundle: {
      ...baseSession.previewBundle,
      boundedHqPreview: { status: 'ready', width: 4000, height: 3000 },
    },
    exportState: {
      ...baseSession.exportState,
      status: 'idle',
      fullResCapability: { status: 'supported', width: 8000, height: 6000 },
    },
  }

  expect(deriveCanExport(session)).toBe(false)
  expect(deriveExportDisabledReason(session)).toBe(
    'Quick preview is still being prepared.',
  )
})
```

- [ ] **Step 2: Run the tests and verify they fail**

Run:

```bash
pnpm test:run src/modules/raw-processor/__tests__/session-derive.test.ts --exclude '.worktrees/**'
```

Expected: fail with TypeScript or assertion errors referencing `boundedHqPreview`, `bounded-hq`, or missing quick-preview export gating.

- [ ] **Step 3: Update raw preview constants and source type**

Edit `src/lib/raw/decoder.ts`:

```ts
export type DecodedImageSource = 'quick' | 'bounded-hq'

export interface DecodedImage {
  width: number
  height: number
  channels: 3 | 4
  bitsPerChannel: 16 | 32
  data: Float32Array | Uint16Array
  layout: DecodedImageLayout
  colorSpace: DecodedImageColorSpace
  source?: DecodedImageSource
  timings?: Record<string, number | undefined>
  metadata: ImageMetadata
  renderExposure: RawRenderExposure
}

export const QUICK_PREVIEW_MAX_PIXELS = 2_500_000
export const BOUNDED_HQ_PREVIEW_MAX_PIXELS = 12_000_000
export const BOUNDED_HQ_PREVIEW_LOW_MEMORY_MAX_PIXELS = 8_000_000
```

- [ ] **Step 4: Update session types**

Edit `src/modules/raw-processor/model/session.ts`:

```ts
export type PreviewStatus = 'idle' | 'loading' | 'ready' | 'failed' | 'skipped'
export type DisplaySource = 'embedded' | 'quick' | 'bounded-hq' | 'none'

export type PreviewBundle = {
  embeddedPreview: PreviewAsset
  quickDecodePreview: PreviewAsset
  boundedHqPreview: PreviewAsset
  displaySource: DisplaySource
  boundedHqRequiredForExport: false
}
```

Update every local session initializer in tests and hooks from:

```ts
hqImage: { status: 'idle' },
hqRequiredForExport: false,
```

to:

```ts
boundedHqPreview: { status: 'idle' },
boundedHqRequiredForExport: false,
```

- [ ] **Step 5: Update derived session behavior**

Edit `src/modules/raw-processor/model/derive-session.ts`:

```ts
export function selectDisplaySource(
  preview: PreviewBundle,
): 'embedded' | 'quick' | 'bounded-hq' | 'none' {
  if (preview.boundedHqPreview.status === 'ready') return 'bounded-hq'
  if (preview.quickDecodePreview.status === 'ready') return 'quick'
  if (preview.embeddedPreview.status === 'ready') return 'embedded'
  return 'none'
}

export function deriveCanExport(session: ImageSession): boolean {
  return (
    session.previewBundle.quickDecodePreview.status === 'ready' &&
    session.exportState.fullResCapability.status === 'supported' &&
    session.exportState.status !== 'exporting' &&
    !deriveUnsupportedExportPipelineReason(session)
  )
}
```

Add this branch before the capability switch in `deriveExportDisabledReason()`:

```ts
if (session.previewBundle.quickDecodePreview.status !== 'ready') {
  return 'Quick preview is still being prepared.'
}
```

- [ ] **Step 6: Run the focused tests**

Run:

```bash
pnpm test:run src/modules/raw-processor/__tests__/session-derive.test.ts src/lib/raw/decoder.test.ts --exclude '.worktrees/**'
```

Expected: all selected tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/raw/decoder.ts src/modules/raw-processor/model/session.ts src/modules/raw-processor/model/derive-session.ts src/modules/raw-processor/__tests__/session-derive.test.ts src/lib/raw/decoder.test.ts
git commit -m "refactor(raw): model bounded preview sources"
```

---

### Task 2: Add Bounded HQ Runtime API

**Files:**

- Modify: `packages/luma-raw-runtime/src/types.ts`
- Modify: `packages/luma-raw-runtime/src/worker-protocol.ts`
- Modify: `packages/luma-raw-runtime/src/runtime.ts`
- Modify: `packages/luma-raw-runtime/src/runtime.test.ts`
- Modify: `packages/luma-raw-runtime/worker/runtime-core.ts`
- Modify: `packages/luma-raw-runtime/worker/runtime-core.test.ts`
- Modify: `packages/luma-raw-runtime/src/worker-client.test.ts`

- [ ] **Step 1: Write failing public runtime tests**

In `packages/luma-raw-runtime/src/runtime.test.ts`, add a test that asserts capped bounded HQ requests:

```ts
it('sends bounded HQ session requests with an explicit pixel cap', async () => {
  const requests: Array<{ type: string; payload: unknown }> = []
  const runtime = createLumaRawRuntime({
    requireCrossOriginIsolation: false,
    workerFactory: () =>
      createMockWorker((request) => {
        requests.push({ type: request.type, payload: request.payload })
        if (request.type === 'init') {
          return makeInitResponse(request)
        }
        if (request.type === 'openSession') {
          return makeOpenSessionResponse(request, 'raw-session-1')
        }
        if (request.type === 'decodeBoundedHqFromSession') {
          return makeFrameResponse(request, {
            source: 'bounded-hq',
            width: 4000,
            height: 3000,
          })
        }
        if (request.type === 'closeSession') {
          return makeCloseSessionResponse(request)
        }
        throw new Error(`Unexpected request ${request.type}`)
      }),
  })

  const session = await runtime.openSession(new File(['raw'], 'sample.RAF'))
  const frame = await session.decodeBoundedHq({ maxOutputPixels: 12_000_000 })

  expect(frame.source).toBe('bounded-hq')
  expect(requests.map((request) => request.type)).toContain(
    'decodeBoundedHqFromSession',
  )
  expect(requests.at(-1)?.payload).toMatchObject({
    sessionId: 'raw-session-1',
    maxOutputPixels: 12_000_000,
  })
})
```

Use the helper names already present in `runtime.test.ts`; if a helper has a different local name, keep the existing helper and preserve the request assertions above.

- [ ] **Step 2: Write failing worker-core tests**

In `packages/luma-raw-runtime/worker/runtime-core.test.ts`, add:

```ts
it('uses high-quality native settings with a bounded HQ output cap', async () => {
  const decodeHq = vi.fn(() => makeNativeImage({ width: 4000, height: 3000 }))
  const core = createRuntimeCore(
    createNativeFactory({
      createProcessor: () =>
        createNativeProcessor({
          decodeHq,
          readMetadata: () =>
            makeNativeMetadata({ width: 11662, height: 8746 }),
        }),
    }),
  )

  const opened = await core.handleRequest({
    id: 'open-1',
    type: 'openSession',
    payload: makeOpenSessionPayload(),
  })
  expect(opened.ok && opened.type === 'openSession').toBe(true)
  if (!opened.ok || opened.type !== 'openSession') return

  const response = await core.handleRequest({
    id: 'bounded-1',
    type: 'decodeBoundedHqFromSession',
    payload: {
      sessionId: opened.payload.sessionId,
      maxOutputPixels: 12_000_000,
    },
  })

  expect(response.ok && response.type === 'decodeBoundedHqFromSession').toBe(
    true,
  )
  if (!response.ok || response.type !== 'decodeBoundedHqFromSession') return
  expect(response.payload.source).toBe('bounded-hq')
  expect(decodeHq).toHaveBeenCalledWith({ maxOutputPixels: 12_000_000 })
})
```

- [ ] **Step 3: Run the runtime tests and verify they fail**

Run:

```bash
pnpm test:run packages/luma-raw-runtime/src/runtime.test.ts packages/luma-raw-runtime/worker/runtime-core.test.ts --exclude '.worktrees/**'
```

Expected: fail because `decodeBoundedHq`, `decodeBoundedHqFromSession`, and `source: 'bounded-hq'` do not exist yet.

- [ ] **Step 4: Add bounded HQ types**

Edit `packages/luma-raw-runtime/src/types.ts`:

```ts
export type LumaRawBoundedHqOptions = {
  maxOutputPixels: number
}

export type LumaRawFrame = {
  jobId: string
  sessionId?: string
  source: 'quick' | 'bounded-hq'
  width: number
  height: number
  data: Uint16Array
  layout: 'rgb'
  bitDepth: 16
  colorSpace: 'linear-prophoto-rgb'
  orientation: number
  blackLevel?: number
  whiteLevel?: number
  metadata: LumaRawMetadata
  timings: LumaRawTimings
  heap?: LumaRawHeapStats
}
```

In `LumaRawDecodeSession`, replace `decodeHq` with:

```ts
decodeBoundedHq: (options: LumaRawBoundedHqOptions, signal?: AbortSignal) =>
  Promise<LumaRawFrame>
```

In `LumaRawRuntime`, replace file-level `decodeHq` with:

```ts
decodeBoundedHq: (
  file: File,
  options: LumaRawBoundedHqOptions,
  signal?: AbortSignal,
) => Promise<LumaRawFrame>
```

- [ ] **Step 5: Add worker protocol messages**

Edit `packages/luma-raw-runtime/src/worker-protocol.ts`:

```ts
export type LumaRawWorkerRequestType =
  | 'init'
  | 'openSession'
  | 'extractEmbeddedPreviewFromSession'
  | 'decodeQuickFromSession'
  | 'decodeBoundedHqFromSession'
  | 'probeExportCapabilityFromSession'
  | 'beginProcessedWindowExportFromSession'
  | 'readRawWindowFromSession'
  | 'readProcessedWindowFromSession'
  | 'endProcessedWindowExportFromSession'
  | 'closeSession'
  | 'probe'
  | 'extractEmbeddedPreview'
  | 'decodeQuick'
  | 'decodeBoundedHq'
  | 'cancel'
```

Add:

```ts
export type LumaRawWorkerBoundedHqSessionPayload = {
  sessionId: string
  maxOutputPixels: number
}
```

Set payload and response mappings:

```ts
decodeBoundedHqFromSession: LumaRawWorkerBoundedHqSessionPayload
decodeBoundedHq: LumaRawWorkerFilePayload & { maxOutputPixels: number }
```

```ts
decodeBoundedHqFromSession: LumaRawFrame
decodeBoundedHq: LumaRawFrame
```

- [ ] **Step 6: Implement runtime client methods**

Edit `packages/luma-raw-runtime/src/runtime.ts`:

```ts
decodeBoundedHq(options, stageSignal?: AbortSignal) {
  return client.request(
    'decodeBoundedHqFromSession',
    {
      sessionId: sessionInfo.sessionId,
      maxOutputPixels: options.maxOutputPixels,
    },
    [],
    stageSignal,
  )
}
```

Add file-level runtime method:

```ts
async decodeBoundedHq(
  file: File,
  options: LumaRawBoundedHqOptions,
  signal?: AbortSignal,
): Promise<LumaRawFrame> {
  const session = await openSession(file, {}, signal)
  try {
    return mergeSessionStageTimings(
      await session.decodeBoundedHq(options, signal),
      session,
    )
  } finally {
    session.dispose()
  }
}
```

- [ ] **Step 7: Implement worker core bounded HQ routing**

Edit `packages/luma-raw-runtime/worker/runtime-core.ts`:

```ts
function createFramePayload(
  request: LumaRawWorkerRequest<
    | 'decodeQuick'
    | 'decodeBoundedHq'
    | 'decodeQuickFromSession'
    | 'decodeBoundedHqFromSession'
  >,
  nativeMetadata: LumaRawNativeMetadata,
  image: LumaRawNativeImage,
  timings: LumaRawTimings,
  heap?: LumaRawHeapStats,
): LumaRawFrame {
  const metadata = toMetadata(nativeMetadata)
  const isBoundedHq =
    request.type === 'decodeBoundedHq' ||
    request.type === 'decodeBoundedHqFromSession'

  return {
    jobId: request.id,
    sessionId: request.payload.sessionId,
    source: isBoundedHq ? 'bounded-hq' : 'quick',
    width: image.width,
    height: image.height,
    data: image.data,
    layout: 'rgb',
    bitDepth: image.bits,
    colorSpace: 'linear-prophoto-rgb',
    orientation: metadata.orientation ?? 1,
    blackLevel: metadata.blackLevel,
    whiteLevel: metadata.whiteLevel,
    metadata,
    timings,
    ...(heap ? { heap } : {}),
  }
}
```

In file and session decode handlers, route bounded HQ to:

```ts
const image = isBoundedHqRequest(request)
  ? processor.decodeHq({ maxOutputPixels: request.payload.maxOutputPixels })
  : processor.decodePreview({
      maxOutputPixels:
        request.payload.maxOutputPixels ??
        session.maxOutputPixels ??
        defaultQuickMaxOutputPixels,
    })
```

Define `isBoundedHqRequest()` near the handlers:

```ts
function isBoundedHqRequest(
  request: LumaRawWorkerRequest,
): request is LumaRawWorkerRequest<
  'decodeBoundedHq' | 'decodeBoundedHqFromSession'
> {
  return (
    request.type === 'decodeBoundedHq' ||
    request.type === 'decodeBoundedHqFromSession'
  )
}
```

- [ ] **Step 8: Remove app-facing uncapped HQ runtime usage**

Search:

```bash
rg -n "decodeHq|decodeHqFromSession|source: 'hq'|source === 'hq'" packages/luma-raw-runtime/src packages/luma-raw-runtime/worker src/lib/raw src/modules/raw-processor
```

Expected after code edits: matches remain only in native wrapper names, historical docs/spec text, or compatibility tests that explicitly assert the native method receives `maxOutputPixels`.

- [ ] **Step 9: Run runtime tests**

Run:

```bash
pnpm test:run packages/luma-raw-runtime/src/runtime.test.ts packages/luma-raw-runtime/worker/runtime-core.test.ts packages/luma-raw-runtime/src/worker-client.test.ts --exclude '.worktrees/**'
```

Expected: all selected tests pass.

- [ ] **Step 10: Commit**

```bash
git add packages/luma-raw-runtime/src/types.ts packages/luma-raw-runtime/src/worker-protocol.ts packages/luma-raw-runtime/src/runtime.ts packages/luma-raw-runtime/src/runtime.test.ts packages/luma-raw-runtime/worker/runtime-core.ts packages/luma-raw-runtime/worker/runtime-core.test.ts packages/luma-raw-runtime/src/worker-client.test.ts
git commit -m "feat(raw-runtime): add bounded HQ preview decode"
```

---

### Task 3: Expose Bounded HQ Through The App Raw Adapter

**Files:**

- Modify: `src/lib/raw/luma-runtime-adapter.ts`
- Modify: `src/lib/raw/runtime-adapter.ts`
- Modify: `src/lib/raw/runtime-adapter.test.ts`

- [ ] **Step 1: Write failing adapter tests**

In `src/lib/raw/runtime-adapter.test.ts`, update `makeLumaFrame()` to accept `'quick' | 'bounded-hq'`, then add:

```ts
it('requests bounded HQ with the configured preview cap through an open session', async () => {
  const decodeBoundedHq = vi.fn().mockResolvedValue(makeLumaFrame('bounded-hq'))
  const runtime = makeRuntime({
    openSession: vi.fn().mockResolvedValue({
      sessionId: 'raw-session-1',
      probe: makeProbe({ width: 11662, height: 8746 }),
      timings: makeTimings(),
      extractEmbeddedPreview: vi.fn(),
      decodeQuick: vi.fn().mockResolvedValue(makeLumaFrame('quick')),
      decodeBoundedHq,
      probeExportCapability: vi.fn().mockResolvedValue(makeExportCapability()),
      readRawWindow: vi.fn(),
      readProcessedWindow: vi.fn(),
      dispose: vi.fn(),
    }),
  })
  const adapter = createRawRuntimeAdapter({ lumaRuntimeFactory: () => runtime })
  const session = await adapter.openSession(new File(['raw'], 'sample.RAF'))

  const image = await session.decodeBoundedHqRaw({
    maxOutputPixels: BOUNDED_HQ_PREVIEW_LOW_MEMORY_MAX_PIXELS,
  })

  expect(image.source).toBe('bounded-hq')
  expect(decodeBoundedHq).toHaveBeenCalledWith(
    { maxOutputPixels: BOUNDED_HQ_PREVIEW_LOW_MEMORY_MAX_PIXELS },
    undefined,
  )
  expect(session.sourceDimensions).toEqual({ width: 11662, height: 8746 })
})

it('normalizes bounded HQ failures to RAW_BOUNDED_HQ_DECODE_FAILED', async () => {
  const runtime = makeRuntime({
    openSession: vi.fn().mockResolvedValue({
      sessionId: 'raw-session-1',
      probe: makeProbe(),
      timings: makeTimings(),
      extractEmbeddedPreview: vi.fn(),
      decodeQuick: vi.fn(),
      decodeBoundedHq: vi.fn().mockRejectedValue(new Error('bounded failed')),
      probeExportCapability: vi.fn().mockResolvedValue(makeExportCapability()),
      readRawWindow: vi.fn(),
      readProcessedWindow: vi.fn(),
      dispose: vi.fn(),
    }),
  })
  const adapter = createRawRuntimeAdapter({ lumaRuntimeFactory: () => runtime })
  const session = await adapter.openSession(new File(['raw'], 'sample.RAF'))

  await expect(
    session.decodeBoundedHqRaw({
      maxOutputPixels: BOUNDED_HQ_PREVIEW_MAX_PIXELS,
    }),
  ).rejects.toMatchObject({
    code: 'RAW_BOUNDED_HQ_DECODE_FAILED',
  })
})
```

- [ ] **Step 2: Run adapter tests and verify they fail**

Run:

```bash
pnpm test:run src/lib/raw/runtime-adapter.test.ts --exclude '.worktrees/**'
```

Expected: fail because `decodeBoundedHqRaw`, bounded HQ options, and `decodeBoundedHq` wiring are missing.

- [ ] **Step 3: Update app adapter types**

Edit `src/lib/raw/runtime-adapter.ts`:

```ts
import {
  decodeBoundedHqRawWithLuma,
  decodeQuickRawWithLuma,
  extractEmbeddedPreviewWithLuma,
  openRawSessionWithLuma,
} from './luma-runtime-adapter'
```

Update `RawRuntimeSession`:

```ts
sourceDimensions: {
  width?: number
  height?: number
}
decodeBoundedHqRaw: (
  options: { maxOutputPixels: number },
  onProgress?: ProgressCallback,
  signal?: AbortSignal,
) => Promise<DecodedImage>
```

Update `RawRuntimeAdapter`:

```ts
decodeBoundedHqRaw: (
  file: File,
  options: { maxOutputPixels: number },
  onProgress?: ProgressCallback,
) => Promise<DecodedImage>
```

Update `createRawRuntimeAdapter()`:

```ts
decodeBoundedHqRaw(file, options, onProgress) {
  return decodeBoundedHqRawWithLuma(
    file,
    options,
    onProgress,
    lumaRuntimeFactory,
  )
}
```

- [ ] **Step 4: Implement Luma adapter bounded HQ**

Edit `src/lib/raw/luma-runtime-adapter.ts`:

```ts
import { QUICK_PREVIEW_MAX_PIXELS } from './decoder'
```

Add:

```ts
export async function decodeBoundedHqRawWithLuma(
  file: File,
  options: { maxOutputPixels: number },
  onProgress?: ProgressCallback,
  runtimeFactory?: () => LumaRawRuntime,
): Promise<DecodedImage> {
  try {
    onProgress?.({ phase: 'decoding', progress: 0 })
    const runtime = await getRuntime(runtimeFactory)
    await runtime.init()
    const frame = await runtime.decodeBoundedHq(file, options)
    onProgress?.({ phase: 'complete', progress: 100 })
    return frameToDecodedImage(frame)
  } catch (error) {
    throw normalizeRawAdapterError(error, 'RAW_BOUNDED_HQ_DECODE_FAILED')
  }
}
```

Update `openRawSessionWithLuma()` return object:

```ts
sourceDimensions: {
  width: session.probe.width,
  height: session.probe.height,
},
async decodeBoundedHqRaw(
  options: { maxOutputPixels: number },
  onProgress?: ProgressCallback,
  signal?: AbortSignal,
) {
  try {
    onProgress?.({ phase: 'decoding', progress: 0 })
    const frame = await session.decodeBoundedHq(options, signal)
    onProgress?.({ phase: 'complete', progress: 100 })
    return frameToDecodedImage(frame)
  } catch (error) {
    throw normalizeRawAdapterError(error, 'RAW_BOUNDED_HQ_DECODE_FAILED')
  }
}
```

- [ ] **Step 5: Run adapter tests**

Run:

```bash
pnpm test:run src/lib/raw/runtime-adapter.test.ts --exclude '.worktrees/**'
```

Expected: all selected tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/raw/luma-runtime-adapter.ts src/lib/raw/runtime-adapter.ts src/lib/raw/runtime-adapter.test.ts
git commit -m "feat(raw): expose bounded HQ preview adapter"
```

---

### Task 4: Make Preview Pipeline Nonblocking After Quick Preview

**Files:**

- Create: `src/modules/raw-processor/services/preview-resolution-policy.ts`
- Create: `src/modules/raw-processor/services/preview-resolution-policy.test.ts`
- Modify: `src/modules/raw-processor/services/preview-pipeline.ts`
- Modify: `src/modules/raw-processor/__tests__/preview-pipeline.test.ts`

- [ ] **Step 1: Write failing preview-resolution policy tests**

Create `src/modules/raw-processor/services/preview-resolution-policy.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import {
  BOUNDED_HQ_PREVIEW_MAX_PIXELS,
  QUICK_PREVIEW_MAX_PIXELS,
} from '~/lib/raw/decoder'

import { decideBoundedHqPreview } from './preview-resolution-policy'

describe('decideBoundedHqPreview', () => {
  it('uses the default bounded HQ cap on normal desktop-class input', () => {
    expect(
      decideBoundedHqPreview({
        sourceWidth: 6000,
        sourceHeight: 4000,
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/605.1 Safari/605.1',
      }),
    ).toEqual({
      kind: 'decode',
      maxOutputPixels: BOUNDED_HQ_PREVIEW_MAX_PIXELS,
    })
  })

  it('uses the default bounded HQ cap on mobile-class input', () => {
    expect(
      decideBoundedHqPreview({
        sourceWidth: 11662,
        sourceHeight: 8746,
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
      }),
    ).toEqual({
      kind: 'decode',
      maxOutputPixels: BOUNDED_HQ_PREVIEW_MAX_PIXELS,
    })
  })

  it('skips bounded HQ when quick preview already covers the source', () => {
    expect(
      decideBoundedHqPreview({
        sourceWidth: 1200,
        sourceHeight: 900,
        userAgent: 'unit-test',
      }),
    ).toEqual({
      kind: 'skip',
      reason: `Source fits within quick preview cap ${QUICK_PREVIEW_MAX_PIXELS}.`,
    })
  })
})
```

- [ ] **Step 2: Implement preview-resolution policy**

Create `src/modules/raw-processor/services/preview-resolution-policy.ts`:

```ts
import {
  BOUNDED_HQ_PREVIEW_MAX_PIXELS,
  QUICK_PREVIEW_MAX_PIXELS,
} from '~/lib/raw/decoder'

export type BoundedHqPreviewDecision =
  | { kind: 'decode'; maxOutputPixels: number }
  | { kind: 'skip'; reason: string }

export function decideBoundedHqPreview({
  sourceWidth,
  sourceHeight,
}: {
  sourceWidth: number
  sourceHeight: number
  userAgent: string
}): BoundedHqPreviewDecision {
  const sourcePixels = sourceWidth * sourceHeight
  if (sourcePixels <= QUICK_PREVIEW_MAX_PIXELS) {
    return {
      kind: 'skip',
      reason: `Source fits within quick preview cap ${QUICK_PREVIEW_MAX_PIXELS}.`,
    }
  }

  return {
    kind: 'decode',
    maxOutputPixels: BOUNDED_HQ_PREVIEW_MAX_PIXELS,
  }
}
```

- [ ] **Step 3: Run policy tests**

Run:

```bash
pnpm test:run src/modules/raw-processor/services/preview-resolution-policy.test.ts --exclude '.worktrees/**'
```

Expected: all selected tests pass.

- [ ] **Step 4: Write failing preview-pipeline tests**

In `src/modules/raw-processor/__tests__/preview-pipeline.test.ts`, rename HQ assertions to bounded HQ and add:

```ts
it('returns after quick preview while bounded HQ continues in the background', async () => {
  const events: PreviewEvent[] = []
  let resolveBoundedHq!: (value: { width: number; height: number }) => void
  const boundedHqPromise = new Promise<{ width: number; height: number }>(
    (resolve) => {
      resolveBoundedHq = resolve
    },
  )

  const result = await runPreviewPipeline({
    runtimeSession: {
      extractEmbeddedPreview: vi.fn().mockResolvedValue(null),
      decodeQuickRaw: vi.fn().mockResolvedValue({ width: 1600, height: 1000 }),
      decodeBoundedHqRaw: vi.fn().mockReturnValue(boundedHqPromise),
    },
    boundedHqDecision: { kind: 'decode', maxOutputPixels: 12_000_000 },
    onEvent: (event) => events.push(event),
  })

  expect(events.map((event) => event.type)).toEqual(['quick-ready'])
  expect(result.boundedHqPromise).toBeInstanceOf(Promise)

  resolveBoundedHq({ width: 4000, height: 3000 })
  await result.boundedHqPromise

  expect(events.map((event) => event.type)).toEqual([
    'quick-ready',
    'bounded-hq-ready',
  ])
})

it('keeps quick preview when bounded HQ fails', async () => {
  const events: PreviewEvent[] = []
  const error = Object.assign(new Error('bounded failed'), {
    code: 'RAW_BOUNDED_HQ_DECODE_FAILED',
  })

  const result = await runPreviewPipeline({
    runtimeSession: {
      extractEmbeddedPreview: vi.fn().mockResolvedValue(null),
      decodeQuickRaw: vi.fn().mockResolvedValue({ width: 1600, height: 1000 }),
      decodeBoundedHqRaw: vi.fn().mockRejectedValue(error),
    },
    boundedHqDecision: { kind: 'decode', maxOutputPixels: 12_000_000 },
    onEvent: (event) => events.push(event),
  })

  await result.boundedHqPromise

  expect(events).toContainEqual({
    type: 'bounded-hq-failed',
    errorCode: 'RAW_BOUNDED_HQ_DECODE_FAILED',
  })
  expect(events).toContainEqual(
    expect.objectContaining({ type: 'quick-ready' }),
  )
})
```

- [ ] **Step 5: Run tests and verify they fail**

Run:

```bash
pnpm test:run src/modules/raw-processor/__tests__/preview-pipeline.test.ts --exclude '.worktrees/**'
```

Expected: fail because bounded-HQ event names, policy input, and return shape do not exist.

- [ ] **Step 6: Update preview event types**

Edit `src/modules/raw-processor/services/preview-pipeline.ts`:

```ts
export type PreviewEvent =
  | ({ type: 'embedded-ready' } & EmbeddedPreviewPayload)
  | { type: 'quick-ready'; width: number; height: number }
  | { type: 'quick-failed'; errorCode: string; message: string }
  | { type: 'bounded-hq-ready'; width: number; height: number }
  | { type: 'bounded-hq-failed'; errorCode: string }
  | { type: 'bounded-hq-skipped'; reason: string }

export type PreviewPipelineResult = {
  boundedHqPromise: Promise<void> | null
}
```

- [ ] **Step 7: Add bounded HQ decision input**

Update `runPreviewPipeline()` parameters:

```ts
import type { BoundedHqPreviewDecision } from './preview-resolution-policy'

export async function runPreviewPipeline({
  runtimeSession,
  boundedHqDecision,
  onEvent,
}: {
  runtimeSession: {
    extractEmbeddedPreview: () => Promise<EmbeddedPreviewPayload | null>
    decodeQuickRaw: () => Promise<{ width: number; height: number }>
    decodeBoundedHqRaw: (options: {
      maxOutputPixels: number
    }) => Promise<{ width: number; height: number }>
  }
  boundedHqDecision: BoundedHqPreviewDecision
  onEvent: (event: PreviewEvent) => void
}): Promise<PreviewPipelineResult> {
```

- [ ] **Step 8: Launch bounded HQ as a background promise**

Replace the serial HQ block in `runPreviewPipeline()` with:

```ts
onEvent({ type: 'quick-ready', ...quick })
await yieldToPreviewPaint()

if (boundedHqDecision.kind === 'skip') {
  onEvent({ type: 'bounded-hq-skipped', reason: boundedHqDecision.reason })
  return { boundedHqPromise: null }
}

const boundedHqPromise = (async () => {
  try {
    const boundedHq = await runtimeSession.decodeBoundedHqRaw({
      maxOutputPixels: boundedHqDecision.maxOutputPixels,
    })
    onEvent({ type: 'bounded-hq-ready', ...boundedHq })
  } catch (error) {
    onEvent({
      type: 'bounded-hq-failed',
      errorCode: toPreviewErrorCode(error, 'RAW_BOUNDED_HQ_DECODE_FAILED'),
    })
  }
})()

return { boundedHqPromise }
```

Return `{ boundedHqPromise: null }` in the quick-failure path.

- [ ] **Step 9: Run preview-pipeline tests**

Run:

```bash
pnpm test:run src/modules/raw-processor/services/preview-resolution-policy.test.ts src/modules/raw-processor/__tests__/preview-pipeline.test.ts --exclude '.worktrees/**'
```

Expected: all selected tests pass.

- [ ] **Step 10: Commit**

```bash
git add src/modules/raw-processor/services/preview-resolution-policy.ts src/modules/raw-processor/services/preview-resolution-policy.test.ts src/modules/raw-processor/services/preview-pipeline.ts src/modules/raw-processor/__tests__/preview-pipeline.test.ts
git commit -m "feat(raw): make bounded preview upgrade nonblocking"
```

---

### Task 5: Wire Hook State To Quick-Ready Interactivity

**Files:**

- Modify: `src/modules/raw-processor/hooks/useRawProcessor.ts`
- Modify: `src/modules/raw-processor/hooks/useRawProcessor.test.tsx`
- Modify: `src/modules/raw-processor/services/preview-resolution-policy.ts`

- [ ] **Step 1: Write failing hook tests**

In `src/modules/raw-processor/hooks/useRawProcessor.test.tsx`, update mocks from `decodeHqRaw` to `decodeBoundedHqRaw` and add:

```ts
it('enters ready state after quick preview before bounded HQ resolves', async () => {
  const boundedHq = deferred<DecodedImage>()
  rawRuntimeAdapterMock.decodeQuickRaw.mockResolvedValue(
    createDecodedImage('quick'),
  )
  rawRuntimeAdapterMock.decodeBoundedHqRaw.mockReturnValue(boundedHq.promise)

  const { result } = renderHook(() => useRawProcessor(), { wrapper })
  await act(async () => {
    await result.current.loadFile(makeRawFile('sample.RAF'))
  })

  expect(result.current.status).toBe('ready')
  expect(result.current.displaySource).toBe('quick')

  act(() => {
    result.current.selectBuiltinStyle('classic-chrome')
  })

  expect(result.current.activePresetId).toBe('classic-chrome')
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
    await result.current.loadFile(makeRawFile('sample.RAF'))
  })
  await waitFor(() => {
    expect(result.current.displaySource).toBe('quick')
  })

  expect(result.current.error).toBeNull()
  expect(result.current.status).toBe('ready')
})
```

- [ ] **Step 2: Run hook tests and verify they fail**

Run:

```bash
pnpm test:run src/modules/raw-processor/hooks/useRawProcessor.test.tsx --exclude '.worktrees/**'
```

Expected: fail because the hook still uses `hqImage`, `decodeHqRaw`, and serial HQ progress.

- [ ] **Step 3: Rename hook state from HQ to bounded HQ**

Edit `src/modules/raw-processor/hooks/useRawProcessor.ts`:

```ts
const displaySource = session?.previewBundle.displaySource || 'none'
```

Change the return interface:

```ts
displaySource: 'embedded' | 'quick' | 'bounded-hq' | 'none'
```

During session loading, initialize:

```ts
previewBundle: {
  ...prev.previewBundle,
  quickDecodePreview: { status: 'loading' },
  boundedHqPreview: { status: 'loading' },
},
```

- [ ] **Step 4: Update preview state helper**

Change `updatePreviewState()` source type:

```ts
const updatePreviewState = (
  source: 'embedded' | 'quick' | 'bounded-hq',
  payload: {
    width: number
    height: number
    objectUrl?: string
    mimeType?: string
    timings?: Record<string, number | undefined>
  },
  decoded?: DecodedImage | null,
) => {
  // existing session guard stays in place
}
```

Update the preview bundle branch:

```ts
boundedHqPreview:
  source === 'bounded-hq'
    ? {
        status: 'ready' as const,
        width: payload.width,
        height: payload.height,
        timings: payload.timings ?? decoded?.timings,
      }
    : prev.previewBundle.boundedHqPreview,
```

Set render source:

```ts
renderState: {
  status: 'ready',
  lastRenderSource: source,
},
```

- [ ] **Step 5: Use bounded HQ adapter without blocking global progress**

After `activeRuntimeSession` is assigned, compute the bounded HQ policy:

```ts
const boundedHqDecision = decideBoundedHqPreview({
  sourceWidth: activeRuntimeSession.sourceDimensions.width ?? 0,
  sourceHeight: activeRuntimeSession.sourceDimensions.height ?? 0,
  userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent || '',
})
```

In the `runPreviewPipeline()` call, replace `decodeHqRaw()` with:

```ts
async decodeBoundedHqRaw(options) {
  const boundedHqPreview = await activeRuntimeSession.decodeBoundedHqRaw(
    options,
    undefined,
    runtimeSignal,
  )
  hqPreview = boundedHqPreview
  return {
    width: boundedHqPreview.width,
    height: boundedHqPreview.height,
  }
},
```

Keep quick progress as the blocking progress:

```ts
setStatus(mapPhaseToStatus(phase))
setProgress(progress)
```

Do not call `setStatus()` or `setProgress()` from the bounded HQ progress callback.

- [ ] **Step 6: Handle bounded HQ events silently**

Update the event switch:

```ts
case 'bounded-hq-ready': {
  updatePreviewState('bounded-hq', event, hqPreview)
  break
}
case 'bounded-hq-failed': {
  setSession((prev) => {
    if (!prev || prev.id !== nextSession.id) return prev
    const previewBundle = {
      ...prev.previewBundle,
      boundedHqPreview: {
        status: 'failed' as const,
        errorCode: toUserFacingErrorCode(event.errorCode),
      },
    }
    return {
      ...prev,
      previewBundle: {
        ...previewBundle,
        displaySource: selectDisplaySource(previewBundle),
      },
    }
  })
  break
}
```

Do not call `setError()` or `setStatus('failed')` for bounded HQ failure when quick preview is ready.

- [ ] **Step 7: Ensure loadFile resolves after quick and export probe**

Capture the pipeline result:

```ts
const previewResult = await runPreviewPipeline({
  runtimeSession: {
    extractEmbeddedPreview() {
      return activeRuntimeSession.extractEmbeddedPreview(runtimeSignal)
    },
    async decodeQuickRaw() {
      quickPreview = await activeRuntimeSession.decodeQuickRaw(
        ({ phase, progress }) => {
          if (!matchesActiveSession()) return
          setStatus(mapPhaseToStatus(phase))
          setProgress(progress)
        },
        runtimeSignal,
      )
      return { width: quickPreview.width, height: quickPreview.height }
    },
    async decodeBoundedHqRaw(options) {
      hqPreview = await activeRuntimeSession.decodeBoundedHqRaw(
        options,
        undefined,
        runtimeSignal,
      )
      return { width: hqPreview.width, height: hqPreview.height }
    },
  },
  boundedHqDecision,
  onEvent,
})

void previewResult.boundedHqPromise
```

Then await export capability only:

```ts
await exportCapabilityPromise
```

Do not await `previewResult.boundedHqPromise` before returning from `loadFile()`.

- [ ] **Step 8: Run hook tests**

Run:

```bash
pnpm test:run src/modules/raw-processor/hooks/useRawProcessor.test.tsx src/modules/raw-processor/__tests__/preview-pipeline.test.ts src/modules/raw-processor/__tests__/session-derive.test.ts --exclude '.worktrees/**'
```

Expected: all selected tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/modules/raw-processor/hooks/useRawProcessor.ts src/modules/raw-processor/hooks/useRawProcessor.test.tsx
git commit -m "feat(raw): keep editing unblocked after quick preview"
```

---

### Task 6: Final Verification

**Files:**

- Verify all files touched by Tasks 1 through 5.

- [ ] **Step 1: Run focused unit suites**

Run:

```bash
pnpm test:run \
  packages/luma-raw-runtime/src/runtime.test.ts \
  packages/luma-raw-runtime/worker/runtime-core.test.ts \
  packages/luma-raw-runtime/src/worker-client.test.ts \
  src/lib/raw/runtime-adapter.test.ts \
  src/modules/raw-processor/__tests__/session-derive.test.ts \
  src/modules/raw-processor/services/preview-resolution-policy.test.ts \
  src/modules/raw-processor/__tests__/preview-pipeline.test.ts \
  src/modules/raw-processor/hooks/useRawProcessor.test.tsx \
  --exclude '.worktrees/**'
```

Expected: all selected tests pass.

- [ ] **Step 2: Run formatting**

Run:

```bash
pnpm exec prettier --check \
  docs/specs/2026-04-25-high-resolution-browser-export-design.md \
  docs/specs/2026-04-22-phase1-browser-raw-mvp-design.md \
  docs/plans/2026-04-29-bounded-preview-pipeline-implementation-plan.md \
  src/lib/raw/decoder.ts \
  src/lib/raw/luma-runtime-adapter.ts \
  src/lib/raw/runtime-adapter.ts \
  src/modules/raw-processor/model/session.ts \
  src/modules/raw-processor/model/derive-session.ts \
  src/modules/raw-processor/services/preview-resolution-policy.ts \
  src/modules/raw-processor/services/preview-resolution-policy.test.ts \
  src/modules/raw-processor/services/preview-pipeline.ts \
  src/modules/raw-processor/hooks/useRawProcessor.ts
```

Expected: Prettier reports all matched files use the configured style.

- [ ] **Step 3: Run production build**

Run:

```bash
pnpm build
```

Expected: build exits `0`. Existing chunk-size warnings are acceptable if no new error is introduced.

- [ ] **Step 4: Search for forbidden preview usage**

Run:

```bash
rg -n "decodeHqRaw|decodeHqFromSession|source: 'hq'|displaySource.*hq|hqImage|hqRequiredForExport" src packages/luma-raw-runtime --glob '*.{ts,tsx}'
```

Expected: no app preview path still references uncapped HQ. Native adapter implementation names may remain only where `decodeHq({ maxOutputPixels })` is used behind `decodeBoundedHq`.

- [ ] **Step 5: Commit final verification notes if a doc/test matrix was updated**

If execution records validation in a test matrix, commit it:

```bash
git add docs/specs/2026-04-22-phase1-test-matrix.md
git commit -m "docs(raw): record bounded preview validation"
```

Skip this step when no validation record file is modified.

---

## Self-Review Checklist

- The plan creates a new file under `docs/plans` and does not modify any older plan.
- Every implementation task has a failing-test step before implementation.
- Runtime bounded HQ always carries `maxOutputPixels`.
- The app adapter no longer exposes an uncapped HQ preview method.
- The hook sets ready state after quick preview and does not await bounded HQ before returning from `loadFile()`.
- Bounded HQ failure updates preview diagnostics only and keeps quick preview active.
