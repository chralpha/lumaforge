# Full-resolution RAW Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current full-resolution RAW export input path with a LibRaw-first bounded processed-window path that improves mainstream RAW compatibility without adding whole-image processed RGB buffers.

**Architecture:** Keep the existing browser worker, strip scheduling, LUT graph, and row-oriented JPEG encoder. Move RAW interpretation, demosaic, camera white balance, orientation, crop handling, and camera-to-ProPhoto conversion into `@lumaforge/luma-raw-runtime` through a new `libraw-processed-window` strategy backed by repeated LibRaw cropbox processing.

**Tech Stack:** TypeScript 6, React 19, Vite 8 workers, Vitest, Emscripten/LibRaw native wrapper, Web Workers, CPU/WASM strip processing, row-oriented JPEG encoding.

---

## Scope guard

This plan implements only the primary full-resolution compatibility path from
[`../specs/2026-04-26-full-resolution-raw-compatibility-design.md`](../specs/2026-04-26-full-resolution-raw-compatibility-design.md).

Do not implement secondary compatibility export in this plan. The future memo in
the spec stays documentation-only.

## File structure

Create:

- `src/lib/export/processed-window-transform.ts`: Convert LibRaw RGB16 processed windows into normalized linear ProPhoto `Float32Array` tiles for the existing LUT graph.
- `src/lib/export/processed-window-transform.test.ts`: Validate RGB16 normalization, rect validation, and no camera matrix reapplication.

Modify:

- `packages/luma-raw-runtime/src/types.ts`: Add processed-window strategy, capability v2 facts, processed-window request/response types, and session method.
- `packages/luma-raw-runtime/src/index.ts`: Re-export the new public types.
- `packages/luma-raw-runtime/src/worker-protocol.ts`: Add `readProcessedWindowFromSession` worker request/response and transfer support.
- `packages/luma-raw-runtime/src/worker-client.test.ts`: Cover processed-window response transfer.
- `packages/luma-raw-runtime/src/runtime.ts`: Add `readProcessedWindow()` to `LumaRawDecodeSession`.
- `packages/luma-raw-runtime/src/runtime.test.ts`: Cover runtime session forwarding.
- `packages/luma-raw-runtime/src/native-smoke.test.ts`: Add optional fixture acceptance for local Sony, Nikon, and Fujifilm files when present.
- `packages/luma-raw-runtime/worker/native-types.ts`: Add native processed-window types and stricter LibRaw open settings.
- `packages/luma-raw-runtime/worker/native-adapter.ts`: Normalize capability v2 and processed-window payloads.
- `packages/luma-raw-runtime/worker/native-adapter.test.ts`: Cover capability v2, processed-window validation, and source-level native wrapper invariants.
- `packages/luma-raw-runtime/worker/runtime-core.ts`: Handle processed-window requests from existing sessions.
- `packages/luma-raw-runtime/worker/runtime-core.test.ts`: Cover processed-window pass-through, unsupported native method failures, and cancellation.
- `packages/luma-raw-runtime/native/libraw_wrapper.cpp`: Add LibRaw cropbox processed-window API and capability diagnostics.
- `src/lib/raw/export-runtime-adapter.ts`: Expose processed-window reads to export workers.
- `src/lib/raw/export-runtime-adapter.test.ts`: Cover adapter forwarding and type guard updates.
- `src/lib/export/full-res-export.ts`: Switch the primary export strategy from raw windows to processed windows.
- `src/lib/export/full-res-export.test.ts`: Replace raw-window/demosaic expectations with processed-window expectations.
- `src/lib/export/full-res-export.worker.ts`: Call `readProcessedWindow` instead of `readRawWindow`.
- `src/lib/export/full-res-export-client.test.ts`: Keep worker contract coverage after strategy change.
- `src/modules/raw-processor/services/export-system.ts`: No behavior change expected beyond type compatibility; update only if the worker input type changes.
- `src/modules/raw-processor/__tests__/export-system.test.ts`: Keep full-resolution job tests green.
- `docs/specs/2026-04-22-phase1-test-matrix.md`: Add manual real-file acceptance results after implementation.

Do not modify:

- `src/lib/gl/export.ts` as a source of full-resolution pixels.
- Preview canvas export behavior.
- Any secondary compatibility export UI, action, worker path, or telemetry.

## Shared verification commands

Use these commands throughout the plan:

```bash
pnpm test:run packages/luma-raw-runtime/src/types.test.ts packages/luma-raw-runtime/src/worker-client.test.ts
pnpm test:run packages/luma-raw-runtime/worker/native-adapter.test.ts packages/luma-raw-runtime/worker/runtime-core.test.ts
pnpm test:run src/lib/raw/export-runtime-adapter.test.ts src/lib/export/processed-window-transform.test.ts src/lib/export/full-res-export.test.ts
pnpm --filter @lumaforge/luma-raw-runtime typecheck
pnpm test:run src/modules/raw-processor/__tests__/export-system.test.ts src/modules/raw-processor/hooks/useRawProcessor.test.tsx
```

Expected final result: all commands exit 0.

Native smoke commands require built artifacts and local fixtures:

```bash
pnpm --filter @lumaforge/luma-raw-runtime build:native
pnpm --filter @lumaforge/luma-raw-runtime test:native-smoke
```

Expected final result: the public DNG smoke test passes, and local real-file
acceptance rows run when the three local fixture paths exist.

---

### Task 1: Public Runtime Contract

**Files:**

- Modify: `packages/luma-raw-runtime/src/types.ts`
- Modify: `packages/luma-raw-runtime/src/index.ts`
- Modify: `packages/luma-raw-runtime/src/worker-protocol.ts`
- Test: `packages/luma-raw-runtime/src/types.test.ts`
- Test: `packages/luma-raw-runtime/src/worker-client.test.ts`

- [ ] **Step 1: Add failing public type coverage**

Add this test to `packages/luma-raw-runtime/src/types.test.ts`:

```ts
import type {
  LumaRawExportCapability,
  LumaRawFullResInputStrategy,
  LumaRawProcessedWindow,
  LumaRawProcessedWindowRequest,
  LumaRawSensorLayout,
} from './types'

it('types LibRaw processed-window full-resolution payloads', () => {
  const strategy: LumaRawFullResInputStrategy = 'libraw-processed-window'
  const layout: LumaRawSensorLayout = 'bayer'
  const request: LumaRawProcessedWindowRequest = {
    outputRect: { x: 0, y: 8, width: 4, height: 2 },
    halo: { left: 2, top: 2, right: 2, bottom: 2 },
  }
  const window: LumaRawProcessedWindow = {
    rect: request.outputRect,
    workingSpace: 'linear-prophoto-rgb',
    data: new Uint16Array(
      request.outputRect.width * request.outputRect.height * 3,
    ),
    width: request.outputRect.width,
    height: request.outputRect.height,
    stride: request.outputRect.width * 3,
    normalized: false,
    orientationApplied: true,
    colorApplied: true,
    warnings: [],
  }
  const capability: LumaRawExportCapability = {
    supported: true,
    strategy,
    width: 4,
    height: 10,
    rawWidth: 4,
    rawHeight: 10,
    visibleCrop: { x: 0, y: 0, width: 4, height: 10 },
    cfa: { pattern: 'rggb', xPhase: 0, yPhase: 0 },
    blackLevel: 0,
    whiteLevel: 65535,
    orientation: { code: 6, supported: true, outputWidth: 10, outputHeight: 4 },
    sensor: {
      layout,
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
      make: 'Nikon',
      model: 'Fixture',
      librawFilterCode: 0x94949494,
      hasRawImage: true,
      hasColor3Image: false,
      hasColor4Image: false,
      hasXTransTable: false,
      canRepeatCropProcess: true,
    },
    reasons: [],
  }

  expect(capability.strategy).toBe(strategy)
  expect(capability.sensor.layout).toBe(layout)
  expect(window.data).toHaveLength(24)
})
```

- [ ] **Step 2: Run the type test and verify it fails**

Run:

```bash
pnpm test:run packages/luma-raw-runtime/src/types.test.ts -t "LibRaw processed-window"
```

Expected: FAIL with missing processed-window type exports.

- [ ] **Step 3: Add public processed-window types**

Update `packages/luma-raw-runtime/src/types.ts` so the existing raw-window types
remain exported and these new types are available:

```ts
export type LumaRawSensorLayout =
  | 'bayer'
  | 'x-trans'
  | 'foveon'
  | 'monochrome'
  | 'rgb-like'
  | 'unknown'

export type LumaRawFullResInputStrategy =
  | 'libraw-processed-window'
  | 'raw-mosaic-window'

export type LumaRawExportUnsupportedReason =
  | 'libraw-open-failed'
  | 'libraw-unpack-failed'
  | 'libraw-cropbox-window-unavailable'
  | 'libraw-cropbox-not-repeatable'
  | 'orientation-transform-unimplemented'
  | 'unsupported-sensor-layout'
  | 'unsupported-cfa-pattern'
  | 'missing-visible-crop'
  | 'missing-levels'
  | 'missing-camera-white-balance'
  | 'missing-camera-to-output-color'
  | 'degenerate-camera-to-output-color'
  | 'processed-window-unavailable'
  | 'raw-window-unavailable-after-unpack'
  | 'jpeg-runtime-unavailable'
  | 'unsupported-source'
  | 'unsupported-cfa'
  | 'compressed-raw-window-unavailable'
  | 'raw-window-unavailable'
  | 'missing-dimensions'
  | 'unsupported-orientation'
  | 'missing-color-transform'
  | 'missing-export-facts'

export type LumaRawExportOrientation = {
  code: number
  supported: boolean
  outputWidth?: number
  outputHeight?: number
}

export type LumaRawExportColorFacts = {
  workingSpace: 'linear-prophoto-rgb'
  librawOutputColor: 'prophoto'
  gamma: 'linear'
  cameraWhiteBalanceAppliedByRuntime: boolean
  cameraMatrixAppliedByRuntime: boolean
  whiteBalance?: [number, number, number, number]
  cameraToWorkingRgb?: [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ]
}

export type LumaRawExportSensorFacts = {
  layout: LumaRawSensorLayout
  colorCount: number
  cfa?: LumaRawCfaInfo
  phaseIsWindowLocal: boolean
}

export type LumaRawExportLevelFacts = {
  black: number
  white: number
  perChannelBlack?: [number, number, number, number]
}

export type LumaRawExportWindowFacts = {
  librawProcessed: boolean
  rawMosaic: boolean
}

export type LumaRawExportDiagnostics = {
  make?: string
  model?: string
  normalizedMake?: string
  normalizedModel?: string
  librawFilterCode?: number
  hasRawImage: boolean
  hasColor3Image: boolean
  hasColor4Image: boolean
  hasXTransTable: boolean
  canRepeatCropProcess?: boolean
  lastLibRawWarningMask?: number
}

export type LumaRawProcessedWindowRequest = {
  outputRect: LumaRawWindowRect
  halo: { left: number; top: number; right: number; bottom: number }
}

export type LumaRawProcessedWindow = {
  rect: LumaRawWindowRect
  workingSpace: 'linear-prophoto-rgb'
  data: Uint16Array
  width: number
  height: number
  stride: number
  normalized: false
  orientationApplied: true
  colorApplied: true
  warnings: string[]
}
```

Extend `LumaRawExportCapability` instead of replacing it wholesale, so old
callers keep compiling while the export path migrates:

```ts
export type LumaRawExportCapability = {
  supported: boolean
  strategy?: LumaRawFullResInputStrategy
  width: number
  height: number
  rawWidth: number
  rawHeight: number
  visibleCrop?: LumaRawVisibleCrop
  cfa: LumaRawCfaInfo
  blackLevel: number
  whiteLevel: number
  orientation?: LumaRawExportOrientation
  sensor: LumaRawExportSensorFacts
  levels?: LumaRawExportLevelFacts
  color?: LumaRawExportColorFacts
  windows: LumaRawExportWindowFacts
  diagnostics: LumaRawExportDiagnostics
  reasons: LumaRawExportUnsupportedReason[]
}
```

Extend `LumaRawDecodeSession`:

```ts
readProcessedWindow: (
  request: LumaRawProcessedWindowRequest,
  signal?: AbortSignal,
) => Promise<LumaRawProcessedWindow>
```

- [ ] **Step 4: Add processed-window worker protocol**

Update `packages/luma-raw-runtime/src/worker-protocol.ts`:

```ts
import type {
  LumaRawProcessedWindow,
  LumaRawProcessedWindowRequest,
} from './types'

export type LumaRawWorkerProcessedWindowPayload = {
  sessionId: string
  request: LumaRawProcessedWindowRequest
}
```

Add `readProcessedWindowFromSession` to `LumaRawWorkerRequestType`,
`LumaRawWorkerRequestPayloadByType`, and `LumaRawWorkerPayloadByType`:

```ts
readProcessedWindowFromSession: LumaRawWorkerProcessedWindowPayload
readProcessedWindowFromSession: LumaRawProcessedWindow
```

- [ ] **Step 5: Add transfer coverage for processed windows**

Add this case to `packages/luma-raw-runtime/src/worker-client.test.ts`:

```ts
it('transfers processed-window payload buffers', () => {
  const payload = {
    rect: { x: 0, y: 0, width: 2, height: 1 },
    workingSpace: 'linear-prophoto-rgb' as const,
    data: new Uint16Array([1, 2, 3, 4, 5, 6]),
    width: 2,
    height: 1,
    stride: 6,
    normalized: false as const,
    orientationApplied: true as const,
    colorApplied: true as const,
    warnings: [],
  }

  expect(collectTransferables(payload)).toEqual([payload.data.buffer])
})
```

- [ ] **Step 6: Run public contract tests**

Run:

```bash
pnpm test:run packages/luma-raw-runtime/src/types.test.ts packages/luma-raw-runtime/src/worker-client.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/luma-raw-runtime/src/types.ts packages/luma-raw-runtime/src/index.ts packages/luma-raw-runtime/src/worker-protocol.ts packages/luma-raw-runtime/src/types.test.ts packages/luma-raw-runtime/src/worker-client.test.ts
git commit -m "feat(raw): add processed-window export contract"
```

---

### Task 2: Native Adapter and Runtime-Core Protocol

**Files:**

- Modify: `packages/luma-raw-runtime/worker/native-types.ts`
- Modify: `packages/luma-raw-runtime/worker/native-adapter.ts`
- Modify: `packages/luma-raw-runtime/worker/native-adapter.test.ts`
- Modify: `packages/luma-raw-runtime/worker/runtime-core.ts`
- Modify: `packages/luma-raw-runtime/worker/runtime-core.test.ts`
- Modify: `packages/luma-raw-runtime/src/runtime.ts`
- Modify: `packages/luma-raw-runtime/src/runtime.test.ts`

- [ ] **Step 1: Add failing native-adapter processed-window tests**

Add this to `packages/luma-raw-runtime/worker/native-adapter.test.ts`:

```ts
it('normalizes native processed-window payloads', () => {
  const processor = createProcessor({
    processedWindow: {
      rect: { x: 0, y: 2, width: 2, height: 1 },
      workingSpace: 'linear-prophoto-rgb',
      data: new Uint16Array([100, 200, 300, 400, 500, 600]),
      width: 2,
      height: 1,
      stride: 6,
      normalized: false,
      orientationApplied: true,
      colorApplied: true,
      warnings: ['LIBRAW_WARN_FALLBACK_TO_AHD'],
    },
  })

  expect(
    processor.readProcessedWindow?.({
      outputRect: { x: 0, y: 2, width: 2, height: 1 },
      halo: { left: 2, top: 2, right: 2, bottom: 2 },
    }),
  ).toMatchObject({
    rect: { x: 0, y: 2, width: 2, height: 1 },
    workingSpace: 'linear-prophoto-rgb',
    width: 2,
    height: 1,
    stride: 6,
    normalized: false,
    orientationApplied: true,
    colorApplied: true,
    warnings: ['LIBRAW_WARN_FALLBACK_TO_AHD'],
  })
})

it('rejects malformed processed-window RGB16 lengths', () => {
  const processor = createProcessor({
    processedWindow: {
      rect: { x: 0, y: 0, width: 2, height: 1 },
      workingSpace: 'linear-prophoto-rgb',
      data: new Uint16Array([1, 2, 3]),
      width: 2,
      height: 1,
      stride: 6,
      normalized: false,
      orientationApplied: true,
      colorApplied: true,
      warnings: [],
    },
  })

  expect(() =>
    processor.readProcessedWindow?.({
      outputRect: { x: 0, y: 0, width: 2, height: 1 },
      halo: { left: 0, top: 0, right: 0, bottom: 0 },
    }),
  ).toThrow(
    'Native RAW processed-window data length does not match RGB dimensions.',
  )
})
```

Extend the local `ProcessorValues` test helper with:

```ts
processedWindow?: unknown
```

and add an embind method to the fake processor:

```ts
readProcessedWindow(_request: unknown) {
  return values.processedWindow
}
```

- [ ] **Step 2: Run the native-adapter tests and verify they fail**

Run:

```bash
pnpm test:run packages/luma-raw-runtime/worker/native-adapter.test.ts -t "processed-window"
```

Expected: FAIL with missing `readProcessedWindow` normalization.

- [ ] **Step 3: Add native processed-window types**

Update `packages/luma-raw-runtime/worker/native-types.ts`:

```ts
import type {
  LumaRawProcessedWindow,
  LumaRawProcessedWindowRequest,
} from '../src/types'

export type LumaRawNativeProcessedWindowRequest = LumaRawProcessedWindowRequest

export type LumaRawNativeProcessedWindow = LumaRawProcessedWindow
```

Add `readProcessedWindow` to `LumaRawNativeProcessor`:

```ts
readProcessedWindow?: (
  request: LumaRawNativeProcessedWindowRequest,
) => LumaRawNativeProcessedWindow
```

Extend `LumaRawNativeOpenSettings`:

```ts
useAutoWb: false
useCameraMatrix: 1
bright: 1
highlight: 2
```

- [ ] **Step 4: Normalize processed windows in the native adapter**

In `packages/luma-raw-runtime/worker/native-adapter.ts`, import the new request
and response types. Add this normalizer next to `normalizeRawWindow`:

```ts
function normalizeProcessedWindow(value: unknown): LumaRawProcessedWindow {
  const raw = asRecord(value)
  const rect = normalizeWindowRect(raw.rect)
  const width = asPositiveInteger(raw.width, 'width')
  const height = asPositiveInteger(raw.height, 'height')
  const stride = asPositiveInteger(raw.stride, 'stride')

  if (!(raw.data instanceof Uint16Array)) {
    throw new TypeError(
      'Native RAW processed-window did not return Uint16Array data.',
    )
  }

  const expectedLength = width * height * 3
  if (!Number.isSafeInteger(expectedLength)) {
    throw new TypeError('Native RAW processed-window dimensions are too large.')
  }
  if (raw.data.length !== expectedLength) {
    throw new TypeError(
      'Native RAW processed-window data length does not match RGB dimensions.',
    )
  }
  if (
    raw.workingSpace !== 'linear-prophoto-rgb' ||
    raw.normalized !== false ||
    raw.orientationApplied !== true ||
    raw.colorApplied !== true
  ) {
    throw new TypeError(
      'Native RAW processed-window returned invalid color or orientation flags.',
    )
  }

  return {
    rect,
    workingSpace: 'linear-prophoto-rgb',
    data: normalizeUint16Output(raw.data, 'processed-window'),
    width,
    height,
    stride,
    normalized: false,
    orientationApplied: true,
    colorApplied: true,
    warnings: Array.isArray(raw.warnings)
      ? raw.warnings.filter(
          (warning): warning is string => typeof warning === 'string',
        )
      : [],
  }
}
```

Add this method to the returned processor object:

```ts
readProcessedWindow: processor.readProcessedWindow
  ? (request) => normalizeProcessedWindow(processor.readProcessedWindow?.(request))
  : undefined,
```

- [ ] **Step 5: Add runtime-core processed-window tests**

Add this case to `packages/luma-raw-runtime/worker/runtime-core.test.ts`:

```ts
it('passes through native processed-window payloads from sessions', async () => {
  const processedWindow = {
    rect: { x: 0, y: 0, width: 2, height: 1 },
    workingSpace: 'linear-prophoto-rgb' as const,
    data: new Uint16Array([100, 200, 300, 400, 500, 600]),
    width: 2,
    height: 1,
    stride: 6,
    normalized: false as const,
    orientationApplied: true as const,
    colorApplied: true as const,
    warnings: [],
  }
  const core = createRuntimeCore({
    createProcessor() {
      const processor = makeNativeFactory().createProcessor()
      return {
        ...processor,
        readProcessedWindow(request) {
          expect(request).toEqual({
            outputRect: { x: 0, y: 0, width: 2, height: 1 },
            halo: { left: 2, top: 2, right: 2, bottom: 2 },
          })
          return processedWindow
        },
      }
    },
  })

  const opened = await core.handleRequest({
    id: 'job-processed-open',
    type: 'openSession',
    payload: {
      fileBuffer: new ArrayBuffer(4),
      fileName: 'sample.NEF',
      fileSize: 4,
    },
  })
  expect(opened.ok && opened.type === 'openSession').toBe(true)
  if (!opened.ok || opened.type !== 'openSession') return

  const response = await core.handleRequest({
    id: 'job-processed-window',
    type: 'readProcessedWindowFromSession',
    payload: {
      sessionId: opened.payload.sessionId,
      request: {
        outputRect: { x: 0, y: 0, width: 2, height: 1 },
        halo: { left: 2, top: 2, right: 2, bottom: 2 },
      },
    },
  })

  expect(response).toMatchObject({
    ok: true,
    type: 'readProcessedWindowFromSession',
    payload: {
      rect: { x: 0, y: 0, width: 2, height: 1 },
      workingSpace: 'linear-prophoto-rgb',
    },
  })
})
```

Add a second case that uses a processor without `readProcessedWindow` and expects
a failure response with `RAW_RUNTIME_UNAVAILABLE`.

- [ ] **Step 6: Implement runtime-core and runtime session forwarding**

In `packages/luma-raw-runtime/worker/runtime-core.ts`, add:

```ts
function handleReadProcessedWindowFromSession(
  request: LumaRawWorkerRequest<'readProcessedWindowFromSession'>,
): LumaRawWorkerResponse {
  if (consumeCancellation(request)) {
    return cancelledResponse(request)
  }

  const session = requireSession(request.payload.sessionId)
  if (!session.processor.readProcessedWindow) {
    throw new LumaRawRuntimeError(
      'RAW_RUNTIME_UNAVAILABLE',
      'RAW runtime processed-window access is unavailable.',
    )
  }

  return {
    id: request.id,
    ok: true,
    type: request.type,
    payload: session.processor.readProcessedWindow(request.payload.request),
  }
}
```

Add the new request type to the `handleRequest` switch.

In `packages/luma-raw-runtime/src/runtime.ts`, add to the returned
`LumaRawDecodeSession`:

```ts
readProcessedWindow(request, stageSignal?: AbortSignal) {
  return client.request(
    'readProcessedWindowFromSession',
    { sessionId: sessionInfo.sessionId, request },
    [],
    stageSignal,
  )
}
```

Update `packages/luma-raw-runtime/src/runtime.test.ts` with a session forwarding
case matching the new method.

- [ ] **Step 7: Run protocol tests**

Run:

```bash
pnpm test:run packages/luma-raw-runtime/worker/native-adapter.test.ts packages/luma-raw-runtime/worker/runtime-core.test.ts packages/luma-raw-runtime/src/runtime.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/luma-raw-runtime/worker/native-types.ts packages/luma-raw-runtime/worker/native-adapter.ts packages/luma-raw-runtime/worker/native-adapter.test.ts packages/luma-raw-runtime/worker/runtime-core.ts packages/luma-raw-runtime/worker/runtime-core.test.ts packages/luma-raw-runtime/src/runtime.ts packages/luma-raw-runtime/src/runtime.test.ts
git commit -m "feat(raw): wire processed-window runtime protocol"
```

---

### Task 3: Capability V2 Diagnostics

**Files:**

- Modify: `packages/luma-raw-runtime/native/libraw_wrapper.cpp`
- Modify: `packages/luma-raw-runtime/worker/native-adapter.ts`
- Modify: `packages/luma-raw-runtime/worker/native-adapter.test.ts`
- Modify: `packages/luma-raw-runtime/worker/runtime-core.test.ts`

- [ ] **Step 1: Add failing capability v2 normalizer test**

Add this test to `packages/luma-raw-runtime/worker/native-adapter.test.ts`:

```ts
it('normalizes capability v2 facts while retaining legacy geometry fields', () => {
  const processor = createProcessor({
    exportCapability: {
      supported: true,
      strategy: 'libraw-processed-window',
      width: 8256,
      height: 5504,
      rawWidth: 8288,
      rawHeight: 5520,
      visibleCrop: { x: 16, y: 8, width: 8256, height: 5504 },
      cfa: { pattern: 'rggb', xPhase: 0, yPhase: 0 },
      blackLevel: 512,
      whiteLevel: 16383,
      orientation: {
        code: 6,
        supported: true,
        outputWidth: 5504,
        outputHeight: 8256,
      },
      sensor: {
        layout: 'bayer',
        colorCount: 3,
        cfa: { pattern: 'rggb', xPhase: 0, yPhase: 0 },
        phaseIsWindowLocal: false,
      },
      levels: {
        black: 512,
        white: 16383,
        perChannelBlack: [512, 512, 512, 512],
      },
      color: {
        workingSpace: 'linear-prophoto-rgb',
        librawOutputColor: 'prophoto',
        gamma: 'linear',
        cameraWhiteBalanceAppliedByRuntime: true,
        cameraMatrixAppliedByRuntime: true,
      },
      windows: { librawProcessed: true, rawMosaic: true },
      diagnostics: {
        make: 'Nikon',
        model: 'Fixture',
        normalizedMake: 'Nikon',
        normalizedModel: 'Fixture',
        librawFilterCode: 0x94949494,
        hasRawImage: true,
        hasColor3Image: false,
        hasColor4Image: false,
        hasXTransTable: false,
        canRepeatCropProcess: true,
        lastLibRawWarningMask: 0,
      },
      reasons: [],
    },
  })

  expect(processor.probeExportCapability?.()).toMatchObject({
    supported: true,
    strategy: 'libraw-processed-window',
    orientation: {
      code: 6,
      supported: true,
      outputWidth: 5504,
      outputHeight: 8256,
    },
    sensor: { layout: 'bayer', colorCount: 3 },
    windows: { librawProcessed: true, rawMosaic: true },
    diagnostics: { make: 'Nikon', hasRawImage: true },
  })
})
```

- [ ] **Step 2: Run the capability test and verify it fails**

Run:

```bash
pnpm test:run packages/luma-raw-runtime/worker/native-adapter.test.ts -t "capability v2"
```

Expected: FAIL until the normalizer accepts the v2 fields.

- [ ] **Step 3: Extend capability normalization**

In `packages/luma-raw-runtime/worker/native-adapter.ts`:

- accept `strategy` only when it is `'libraw-processed-window'` or
  `'raw-mosaic-window'`;
- normalize `sensor`, `levels`, `windows`, and `diagnostics`;
- keep top-level `cfa`, `blackLevel`, and `whiteLevel` as compatibility aliases;
- allow `orientation.supported === true` for non-identity orientation when
  `windows.librawProcessed === true`;
- mark unsupported when `windows.librawProcessed !== true`.

Use this support check inside `normalizeExportCapability`:

```ts
if (raw.supported === true && windows.librawProcessed !== true) {
  supported = false
  reasons.add('processed-window-unavailable')
}
```

- [ ] **Step 4: Add source-level native wrapper invariant tests**

Add these tests to `packages/luma-raw-runtime/worker/native-adapter.test.ts`:

```ts
it('documents that native capability v2 is based on LibRaw source facts', () => {
  const wrapperSource = readFileSync(
    resolve(
      dirname(fileURLToPath(import.meta.url)),
      '..',
      'native',
      'libraw_wrapper.cpp',
    ),
    'utf8',
  )

  expect(wrapperSource).toContain('sensorLayoutObject')
  expect(wrapperSource).toContain('hasColor3Image')
  expect(wrapperSource).toContain('hasColor4Image')
  expect(wrapperSource).toContain('librawProcessed')
})

it('does not use orientation identity as the processed-window support gate', () => {
  const wrapperSource = readFileSync(
    resolve(
      dirname(fileURLToPath(import.meta.url)),
      '..',
      'native',
      'libraw_wrapper.cpp',
    ),
    'utf8',
  )
  const probe = wrapperSource.match(
    /val probeExportCapability[\s\S]*?\n  \}/,
  )?.[0]

  expect(probe).toBeTruthy()
  expect(probe).not.toContain('unsupported-orientation')
})
```

- [ ] **Step 5: Implement native capability v2 objects**

In `packages/luma-raw-runtime/native/libraw_wrapper.cpp`, add helper builders:

```cpp
std::string sensorLayoutName(const libraw_data_t &imgdata) {
  if (imgdata.idata.is_foveon) return "foveon";
  if (imgdata.idata.filters == LIBRAW_XTRANS) return "x-trans";
  if (imgdata.idata.filters != 0) return "bayer";
  if (imgdata.rawdata.color3_image || imgdata.rawdata.color4_image) {
    return "rgb-like";
  }
  return "unknown";
}

val sensorLayoutObject(const LibRaw &processor) {
  const libraw_data_t &imgdata = processor.imgdata;
  val sensor = val::object();
  sensor.set("layout", sensorLayoutName(imgdata));
  sensor.set("colorCount", imgdata.idata.colors);
  sensor.set("cfa", cfaObject(cfaPatternName(processor)));
  sensor.set("phaseIsWindowLocal", false);
  return sensor;
}
```

Add `levelsObject`, `windowsObject`, and `diagnosticsObject` helpers with the
field names from the spec. `windowsObject` should set:

```cpp
windows.set("librawProcessed", true);
windows.set("rawMosaic", hasBayerRawImage(imgdata));
```

Update `probeExportCapability()` so support requires:

- positive output and raw dimensions,
- valid levels,
- `windows.librawProcessed === true`,
- source layout not equal to `unknown`,
- LibRaw output color settings available through the fixed export policy.

The probe must not reject non-identity `sizes.flip`. It should return
`orientation.supported = true` and output dimensions rotated when `sizes.flip & 4`.

- [ ] **Step 6: Run capability tests**

Run:

```bash
pnpm test:run packages/luma-raw-runtime/worker/native-adapter.test.ts packages/luma-raw-runtime/worker/runtime-core.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/luma-raw-runtime/native/libraw_wrapper.cpp packages/luma-raw-runtime/worker/native-adapter.ts packages/luma-raw-runtime/worker/native-adapter.test.ts packages/luma-raw-runtime/worker/runtime-core.test.ts
git commit -m "feat(raw): expose LibRaw full-res capability facts"
```

---

### Task 4: LibRaw Cropbox Processed-Window API

**Files:**

- Modify: `packages/luma-raw-runtime/native/libraw_wrapper.cpp`
- Modify: `packages/luma-raw-runtime/worker/native-adapter.test.ts`
- Modify: `packages/luma-raw-runtime/src/native-smoke.test.ts`

- [ ] **Step 1: Add native source tests for cropbox processing**

Add this source-level test to
`packages/luma-raw-runtime/worker/native-adapter.test.ts`:

```ts
it('documents native processed-window cropbox processing primitives', () => {
  const wrapperSource = readFileSync(
    resolve(
      dirname(fileURLToPath(import.meta.url)),
      '..',
      'native',
      'libraw_wrapper.cpp',
    ),
    'utf8',
  )

  expect(wrapperSource).toContain('readProcessedWindow')
  expect(wrapperSource).toContain('params.cropbox')
  expect(wrapperSource).toContain('processor_.free_image()')
  expect(wrapperSource).toContain('processor_.dcraw_process()')
  expect(wrapperSource).toContain('processor_.copy_mem_image')
  expect(wrapperSource).not.toContain('dcraw_make_mem_image(&image_error)')
})
```

- [ ] **Step 2: Run the source test and verify it fails**

Run:

```bash
pnpm test:run packages/luma-raw-runtime/worker/native-adapter.test.ts -t "cropbox processing primitives"
```

Expected: FAIL until the native wrapper adds `readProcessedWindow`.

- [ ] **Step 3: Add fixed export settings to native open settings**

In `packages/luma-raw-runtime/worker/runtime-core.ts`, update `quickSettings`:

```ts
const quickSettings = {
  halfSize: true,
  useCameraWb: true,
  useAutoWb: false,
  useCameraMatrix: 1,
  outputColor: 4,
  outputBps: 16,
  noAutoBright: true,
  bright: 1,
  highlight: 2,
  userQual: 0,
  gamm: [1, 1, 1, 1, 0, 0],
} satisfies LumaRawNativeOpenSettings
```

Keep `hqSettings` as `{ ...quickSettings, halfSize: false, userQual: 2 }`.

In `packages/luma-raw-runtime/native/libraw_wrapper.cpp`, update
`applySettings()`:

```cpp
params.use_auto_wb = settings["useAutoWb"].as<bool>() ? 1 : 0;
params.use_camera_matrix = settings["useCameraMatrix"].as<int>();
params.bright = settings["bright"].as<double>();
params.highlight = settings["highlight"].as<int>();
```

- [ ] **Step 4: Implement `readProcessedWindow` in native wrapper**

In `LumaRawProcessor`, add a public method:

```cpp
val readProcessedWindow(val request) {
  ensureUnpacked();

  const LumaProcessedWindowRequest parsed = parseProcessedWindowRequest(request);
  const LumaSourceCrop crop = mapOutputRectToSourceCrop(processor_.imgdata, parsed);
  const libraw_output_params_t saved_params = processor_.imgdata.params;

  try {
    applyStrictExportProcessingSettings(processor_.imgdata.params);
    processor_.imgdata.params.user_flip = 0;
    processor_.imgdata.params.cropbox[0] = crop.x;
    processor_.imgdata.params.cropbox[1] = crop.y;
    processor_.imgdata.params.cropbox[2] = crop.width;
    processor_.imgdata.params.cropbox[3] = crop.height;

    processor_.free_image();
    processed_ = false;
    requireLibRawSuccess("LibRaw dcraw_process cropbox", processor_.dcraw_process());

    int width = 0;
    int height = 0;
    int colors = 0;
    int bps = 0;
    processor_.get_mem_image_format(&width, &height, &colors, &bps);
    if (width <= 0 || height <= 0 || colors != 3 || bps != 16) {
      throw std::runtime_error("LibRaw processed-window output is not RGB16.");
    }

    std::vector<uint16_t> source(
        checkedMultiply(
            checkedMultiply(static_cast<size_t>(width), static_cast<size_t>(height),
                            "LibRaw processed-window pixel count"),
            static_cast<size_t>(3),
            "LibRaw processed-window sample count"));
    requireLibRawSuccess(
        "LibRaw copy_mem_image cropbox",
        processor_.copy_mem_image(
            source.data(),
            checkedMultiply(static_cast<size_t>(width), static_cast<size_t>(3 * sizeof(uint16_t)),
                            "LibRaw processed-window stride"),
            0));

    const LumaRgb16Window oriented = orientAndTrimProcessedWindow(
        source, width, height, crop, parsed, normalizedOrientationCode(processor_.imgdata.sizes.flip));
    return processedWindowObject(parsed.output_rect, oriented);
  } catch (...) {
    processor_.imgdata.params = saved_params;
    processor_.free_image();
    processed_ = false;
    throw;
  }
}
```

Add the helper types used above near the existing `OutputSize` struct. The helper
contract is:

- `parseProcessedWindowRequest()` validates `outputRect` and non-negative halo;
- `mapOutputRectToSourceCrop()` maps output-oriented rects to source cropbox
  coordinates and includes halo;
- `applyStrictExportProcessingSettings()` sets camera WB, no auto WB, ProPhoto,
  16-bit, linear gamma, no auto bright, fixed brightness, and fixed highlight;
- `orientAndTrimProcessedWindow()` removes halo and applies the LibRaw
  orientation code to return rows in output order;
- `processedWindowObject()` returns the TypeScript shape from Task 1.

Bind the method in `EMSCRIPTEN_BINDINGS`:

```cpp
.function("readProcessedWindow", &LumaRawProcessor::readProcessedWindow)
```

- [ ] **Step 5: Make repeated crop processing safe**

Inside `readProcessedWindow()`:

- always call `processor_.free_image()` before crop processing;
- restore `imgdata.params` in both success and failure paths;
- set `processed_ = false` after processing so later preview/HQ decode does not
  reuse a cropped processed image;
- never call `dcraw_make_mem_image()` in this method.

Add this comment before the reset block:

```cpp
// Cropbox processing intentionally reuses the decoded rawdata but not a prior
// processed image; every export strip must get a fresh LibRaw postprocess pass.
```

- [ ] **Step 6: Add native smoke acceptance rows**

In `packages/luma-raw-runtime/src/native-smoke.test.ts`, add local fixture paths:

```ts
const localCompatibilityFixtures = [
  {
    label: 'Sony ARW',
    path: '/workspaces/LumaForge/test-images/SGL00940.ARW',
  },
  {
    label: 'Nikon NEF',
    path: '/workspaces/LumaForge/test-images/SGL_1998.NEF',
  },
  {
    label: 'Fujifilm GFX RAF',
    path: '/workspaces/LumaForge/test-images/Fujifilm - GFX100RF - 16bit lossless compressed (4_3).RAF',
  },
] as const
```

Add a test that skips missing local files but exercises present files:

```ts
it.each(localCompatibilityFixtures)(
  'processes a bounded LibRaw window for $label when the local fixture exists',
  async ({ path, label }) => {
    try {
      await requireFile(
        path,
        `${label} local fixture`,
        'Local compatibility fixture is optional.',
      )
    } catch {
      return
    }

    const bytes = await readFile(path)
    const runtime = createLumaRawRuntime({
      workerFactory: () => new NativeSmokeWorker() as unknown as Worker,
    })
    const file = new File(
      [new Uint8Array(bytes)],
      path.split('/').at(-1) ?? label,
    )

    try {
      const session = await runtime.openSession(file, {
        maxOutputPixels: quickDecodeMaxOutputPixels,
      })
      try {
        const capability = await session.probeExportCapability()
        expect(capability.strategy, label).toBe('libraw-processed-window')
        expect(capability.supported, `${label} capability`).toBe(true)

        const width = Math.min(64, capability.width)
        const height = Math.min(32, capability.height)
        const window = await session.readProcessedWindow({
          outputRect: { x: 0, y: 0, width, height },
          halo: { left: 2, top: 2, right: 2, bottom: 2 },
        })

        expect(window.workingSpace).toBe('linear-prophoto-rgb')
        expect(window.width).toBe(width)
        expect(window.height).toBe(height)
        expect(window.data).toHaveLength(width * height * 3)
      } finally {
        session.dispose()
      }
    } finally {
      runtime.dispose()
    }
  },
  smokeTimeoutMs,
)
```

- [ ] **Step 7: Build native artifacts and run smoke tests**

Run:

```bash
pnpm --filter @lumaforge/luma-raw-runtime build:native
pnpm --filter @lumaforge/luma-raw-runtime test:native-smoke
```

Expected: PASS. The local Sony, Nikon, and Fujifilm checks run if files are
available in `/workspaces/LumaForge/test-images`.

- [ ] **Step 8: Commit**

```bash
git add packages/luma-raw-runtime/native/libraw_wrapper.cpp packages/luma-raw-runtime/worker/native-adapter.test.ts packages/luma-raw-runtime/src/native-smoke.test.ts
git commit -m "feat(raw): process LibRaw cropbox export windows"
```

---

### Task 5: Export Worker Processed-Window Strategy

**Files:**

- Create: `src/lib/export/processed-window-transform.ts`
- Create: `src/lib/export/processed-window-transform.test.ts`
- Modify: `src/lib/export/full-res-export.ts`
- Modify: `src/lib/export/full-res-export.test.ts`
- Modify: `src/lib/raw/export-runtime-adapter.ts`
- Modify: `src/lib/raw/export-runtime-adapter.test.ts`
- Modify: `src/lib/export/full-res-export.worker.ts`

- [ ] **Step 1: Add processed-window transform tests**

Create `src/lib/export/processed-window-transform.test.ts`:

```ts
import type { LumaRawProcessedWindow } from '@lumaforge/luma-raw-runtime'

import { processedWindowToLinearProPhotoTile } from './processed-window-transform'

function makeWindow(
  overrides: Partial<LumaRawProcessedWindow> = {},
): LumaRawProcessedWindow {
  return {
    rect: { x: 0, y: 0, width: 2, height: 1 },
    workingSpace: 'linear-prophoto-rgb',
    data: new Uint16Array([0, 32768, 65535, 65535, 0, 32768]),
    width: 2,
    height: 1,
    stride: 6,
    normalized: false,
    orientationApplied: true,
    colorApplied: true,
    warnings: [],
    ...overrides,
  }
}

it('normalizes LibRaw RGB16 windows into linear ProPhoto float tiles', () => {
  const tile = processedWindowToLinearProPhotoTile(makeWindow())

  expect(tile.width).toBe(2)
  expect(tile.height).toBe(1)
  expect(Array.from(tile.data)).toEqual([
    0,
    32768 / 65535,
    1,
    1,
    0,
    32768 / 65535,
  ])
})

it('rejects processed windows that are not already oriented and color-applied', () => {
  expect(() =>
    processedWindowToLinearProPhotoTile(
      makeWindow({ colorApplied: false as true }),
    ),
  ).toThrow('FULL_RES_EXPORT_INVALID_PROCESSED_WINDOW')
})
```

- [ ] **Step 2: Run the transform tests and verify they fail**

Run:

```bash
pnpm test:run src/lib/export/processed-window-transform.test.ts
```

Expected: FAIL with missing module.

- [ ] **Step 3: Implement processed-window transform**

Create `src/lib/export/processed-window-transform.ts`:

```ts
import type { LumaRawProcessedWindow } from '@lumaforge/luma-raw-runtime'

export type LinearProPhotoTile = {
  width: number
  height: number
  data: Float32Array
}

export function processedWindowToLinearProPhotoTile(
  window: LumaRawProcessedWindow,
): LinearProPhotoTile {
  if (
    window.workingSpace !== 'linear-prophoto-rgb' ||
    window.normalized !== false ||
    window.orientationApplied !== true ||
    window.colorApplied !== true
  ) {
    throw new Error('FULL_RES_EXPORT_INVALID_PROCESSED_WINDOW')
  }

  const expectedLength = window.width * window.height * 3
  if (
    !Number.isSafeInteger(expectedLength) ||
    window.data.length !== expectedLength ||
    window.stride !== window.width * 3
  ) {
    throw new Error('FULL_RES_EXPORT_INVALID_PROCESSED_WINDOW')
  }

  const data = new Float32Array(expectedLength)
  for (let index = 0; index < expectedLength; index += 1) {
    data[index] = (window.data[index] ?? 0) / 65535
  }

  return { width: window.width, height: window.height, data }
}
```

- [ ] **Step 4: Update raw export adapter**

Modify `src/lib/raw/export-runtime-adapter.ts` so `RawExportSession` exposes:

```ts
readProcessedWindow: LumaRawDecodeSession['readProcessedWindow']
```

and `createRawExportSession()` forwards:

```ts
readProcessedWindow(request, signal) {
  return session.readProcessedWindow(request, signal)
}
```

Update `isRawExportSession()` to require `readProcessedWindow`.

Adjust `src/lib/raw/export-runtime-adapter.test.ts` so it expects
`readProcessedWindow` forwarding and still rejects objects missing the method.

- [ ] **Step 5: Add failing full-res export tests**

In `src/lib/export/full-res-export.test.ts`, replace the first successful export
test's fake reader with:

```ts
const readProcessedWindow = vi.fn(async (request) => ({
  rect: request.outputRect,
  workingSpace: 'linear-prophoto-rgb' as const,
  data: new Uint16Array(
    request.outputRect.width * request.outputRect.height * 3,
  ).fill(32768),
  width: request.outputRect.width,
  height: request.outputRect.height,
  stride: request.outputRect.width * 3,
  normalized: false as const,
  orientationApplied: true as const,
  colorApplied: true as const,
  warnings: [],
}))
```

Update the call to `runFullResolutionJpegExport()`:

```ts
readProcessedWindow,
```

Add this fail-closed test:

```ts
it('requires the LibRaw processed-window strategy', async () => {
  await expect(
    runFullResolutionJpegExport({
      capability: makeCapability({
        strategy: 'raw-mosaic-window',
        windows: { librawProcessed: false, rawMosaic: true },
      }),
      graph: {
        supported: true,
        outputGamut: 'srgb-rec709',
        outputTransfer: 'srgb',
        lutProfile: null,
        steps: [{ kind: 'input-linear-prophoto' }, { kind: 'output-srgb' }],
      },
      readProcessedWindow: vi.fn(),
      writerFactory: () => ({
        writeRows: vi.fn(),
        close: vi.fn(),
        abort: vi.fn(),
      }),
    }),
  ).rejects.toThrow('FULL_RES_EXPORT_UNSUPPORTED_SOURCE')
})
```

Run:

```bash
pnpm test:run src/lib/export/full-res-export.test.ts src/lib/raw/export-runtime-adapter.test.ts
```

Expected: FAIL until export code uses processed windows.

- [ ] **Step 6: Switch export orchestration to processed windows**

In `src/lib/export/full-res-export.ts`:

- remove `LumaRawWindow`, `readRawWindow`, `demosaicBilinearRgb`,
  `applyCameraToWorkingRgbInPlace`, and `mapOutputRectToRawWindow` from the
  primary export path;
- add `LumaRawProcessedWindowRequest` and `LumaRawProcessedWindow`;
- add `processedWindowToLinearProPhotoTile`;
- change `RunFullResolutionJpegExportInput` to:

```ts
readProcessedWindow: (
  request: LumaRawProcessedWindowRequest,
  signal?: AbortSignal,
) => Promise<LumaRawProcessedWindow>
```

Change the support gate:

```ts
if (
  !input.capability.supported ||
  input.capability.strategy !== 'libraw-processed-window' ||
  input.capability.windows.librawProcessed !== true ||
  input.capability.color?.workingSpace !== 'linear-prophoto-rgb' ||
  input.capability.color.cameraWhiteBalanceAppliedByRuntime !== true ||
  input.capability.color.cameraMatrixAppliedByRuntime !== true
) {
  throw new Error('FULL_RES_EXPORT_UNSUPPORTED_SOURCE')
}
```

Inside the strip loop, replace raw-window mapping and demosaic with:

```ts
const processedWindow = await input.readProcessedWindow(
  {
    outputRect: strip.output,
    halo: { left: 2, top: 2, right: 2, bottom: 2 },
  },
  input.signal,
)
const tile = processedWindowToLinearProPhotoTile(processedWindow)
const rows = applyGraphToRgbRows(tile.data)
await writer.writeRows(rows, tile.height)
```

- [ ] **Step 7: Update export worker**

In `src/lib/export/full-res-export.worker.ts`, pass:

```ts
readProcessedWindow: exportSession.readProcessedWindow,
```

instead of `readRawWindow`.

- [ ] **Step 8: Run export tests**

Run:

```bash
pnpm test:run src/lib/raw/export-runtime-adapter.test.ts src/lib/export/processed-window-transform.test.ts src/lib/export/full-res-export.test.ts src/lib/export/full-res-export-client.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/export/processed-window-transform.ts src/lib/export/processed-window-transform.test.ts src/lib/export/full-res-export.ts src/lib/export/full-res-export.test.ts src/lib/raw/export-runtime-adapter.ts src/lib/raw/export-runtime-adapter.test.ts src/lib/export/full-res-export.worker.ts src/lib/export/full-res-export-client.test.ts
git commit -m "feat(export): use LibRaw processed windows for full-res export"
```

---

### Task 6: UI Gating and Manual Acceptance

**Files:**

- Modify: `src/modules/raw-processor/services/export-system.ts`
- Modify: `src/modules/raw-processor/__tests__/export-system.test.ts`
- Modify: `src/modules/raw-processor/hooks/useRawProcessor.test.tsx`
- Modify: `docs/specs/2026-04-22-phase1-test-matrix.md`

- [ ] **Step 1: Add UI gating regression tests**

In `src/modules/raw-processor/hooks/useRawProcessor.test.tsx`, update the fake
capability builders so supported full-resolution export uses:

```ts
strategy: 'libraw-processed-window',
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
```

Add one assertion that a capability with `strategy: 'raw-mosaic-window'` keeps
the full-resolution export action disabled.

- [ ] **Step 2: Run UI tests and verify failures are only type/strategy related**

Run:

```bash
pnpm test:run src/modules/raw-processor/__tests__/export-system.test.ts src/modules/raw-processor/hooks/useRawProcessor.test.tsx
```

Expected: FAIL only where mocks or gating still assume raw-window export.

- [ ] **Step 3: Update export service types only when necessary**

If `src/modules/raw-processor/services/export-system.ts` has type errors after
Task 5, update `RunFullResolutionJpegExportInWorkerInput` references so the
service remains a thin wrapper around `FullResolutionExportWorkerClient`.

Do not add secondary export actions, retry actions, or fallback UI.

- [ ] **Step 4: Update manual test matrix**

Append a section to `docs/specs/2026-04-22-phase1-test-matrix.md`:

```md
## Full-resolution LibRaw processed-window RAW export

| Fixture                                                                                       | Expected result                                                                                           | Status                      |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------- |
| `/workspaces/LumaForge/test-images/SGL00940.ARW`                                              | Full-resolution export uses `libraw-processed-window` and succeeds.                                       | Record result during Task 7 |
| `/workspaces/LumaForge/test-images/SGL_1998.NEF`                                              | Full-resolution export uses `libraw-processed-window`; non-identity orientation is not a support blocker. | Record result during Task 7 |
| `/workspaces/LumaForge/test-images/Fujifilm - GFX100RF - 16bit lossless compressed (4_3).RAF` | Full-resolution export uses `libraw-processed-window` when LibRaw reports a processable source.           | Record result during Task 7 |
```

- [ ] **Step 5: Run focused UI tests**

Run:

```bash
pnpm test:run src/modules/raw-processor/__tests__/export-system.test.ts src/modules/raw-processor/hooks/useRawProcessor.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/modules/raw-processor/services/export-system.ts src/modules/raw-processor/__tests__/export-system.test.ts src/modules/raw-processor/hooks/useRawProcessor.test.tsx docs/specs/2026-04-22-phase1-test-matrix.md
git commit -m "test(raw): gate full-res export on processed-window support"
```

---

### Task 7: Final Verification and Documentation Pass

**Files:**

- Modify if needed: `docs/plans/2026-04-25-high-resolution-browser-export-implementation-plan.md`
- Modify if needed: `docs/specs/2026-04-25-high-resolution-browser-export-design.md`

- [ ] **Step 1: Run runtime and export tests**

Run:

```bash
pnpm test:run packages/luma-raw-runtime/src/types.test.ts packages/luma-raw-runtime/src/worker-client.test.ts
pnpm test:run packages/luma-raw-runtime/worker/native-adapter.test.ts packages/luma-raw-runtime/worker/runtime-core.test.ts
pnpm test:run src/lib/raw/export-runtime-adapter.test.ts src/lib/export/processed-window-transform.test.ts src/lib/export/full-res-export.test.ts src/lib/export/full-res-export-client.test.ts
pnpm test:run src/modules/raw-processor/__tests__/export-system.test.ts src/modules/raw-processor/hooks/useRawProcessor.test.tsx
```

Expected: all commands PASS.

- [ ] **Step 2: Run typecheck**

Run:

```bash
pnpm --filter @lumaforge/luma-raw-runtime typecheck
pnpm exec tsc --noEmit
```

Expected: both commands PASS. If the root project does not have a standalone
`tsconfig` entry suitable for `pnpm exec tsc --noEmit`, run `pnpm build` instead
and record the exact command in the final implementation summary.

- [ ] **Step 3: Run native smoke**

Run:

```bash
pnpm --filter @lumaforge/luma-raw-runtime build:native
pnpm --filter @lumaforge/luma-raw-runtime test:native-smoke
```

Expected: PASS. Local Sony/Nikon/Fujifilm fixture checks run when those files
exist.

- [ ] **Step 4: Check scope guard**

Run:

```bash
rg -n "secondary compatibility|secondary-compatibility|compatibility export" src packages docs/plans/2026-04-26-full-resolution-raw-compatibility-implementation-plan.md
```

Expected: matches only this plan's scope guard or the spec future memo. There
must be no new implementation code for secondary compatibility export.

- [ ] **Step 5: Update high-resolution design doc only if public contract changed**

If the public runtime/export contract now documents raw mosaic windows as the
primary strategy, update
`docs/specs/2026-04-25-high-resolution-browser-export-design.md` to state that
the primary RAW input strategy is `libraw-processed-window` and raw mosaic
windows are transitional diagnostics.

If that document already points readers to the new compatibility spec for the
primary contract, leave it unchanged.

- [ ] **Step 6: Commit final docs if changed**

```bash
git add docs/specs/2026-04-25-high-resolution-browser-export-design.md docs/plans/2026-04-25-high-resolution-browser-export-implementation-plan.md docs/specs/2026-04-22-phase1-test-matrix.md
git commit -m "docs(raw): align high-res export docs with LibRaw processed windows"
```

Skip this commit when no files changed in Step 5.

## Final acceptance

The implementation is complete when:

- full-resolution export capability uses `strategy: 'libraw-processed-window'`;
- the export worker no longer demosaics RAW mosaic windows in the primary path;
- runtime processed windows are output-oriented linear ProPhoto RGB16;
- non-identity orientation is not an automatic full-resolution support blocker;
- Sony ARW, Nikon NEF, and Fujifilm GFX RAF local fixtures either export through
  the primary path or report a precise LibRaw crop/color blocker;
- no secondary compatibility export behavior is implemented;
- focused runtime, export, UI, typecheck, and native smoke verification pass.
