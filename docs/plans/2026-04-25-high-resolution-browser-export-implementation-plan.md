# High-resolution Browser Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a browser-local full-resolution sRGB JPEG export path that reads RAW windows in bounded strips, applies the scene-referred LUT pipeline, and avoids renderer crashes on 61MP and 100MP-class photos.

**Architecture:** Add raw-window export capabilities to `@lumaforge/luma-raw-runtime`, keep product color and JPEG export in `src/lib/export`, and update the raw processor UI so full-resolution export is independent of HQ preview. The authoritative export path runs in a dedicated worker, uses bounded strip buffers, fails closed for unsupported RAW or LUT pipelines, and never creates full-frame Canvas, ImageData, GPU textures, RGB, or float intermediates.

**Tech Stack:** TypeScript 6, React 19, Vite 8 workers, Vitest, Emscripten/LibRaw native wrapper, Web Workers, CPU/WASM strip processing, row-oriented JPEG encoding.

---

## File structure

Create:

- `src/lib/export/color-graph.ts`: Pure data descriptor for preview/export color intent.
- `src/lib/export/color-graph.test.ts`: Descriptor parity and unsupported-pipeline tests.
- `src/lib/export/demosaic.ts`: Small-halo Bayer demosaic for export strips.
- `src/lib/export/demosaic.test.ts`: CFA, halo, and seam tests.
- `src/lib/export/lut3d.ts`: CPU trilinear 3D LUT sampling for export.
- `src/lib/export/lut3d.test.ts`: LUT sampling tests.
- `src/lib/export/strip-scheduler.ts`: Strip planning, halo expansion, and adaptive strip-size retry planning.
- `src/lib/export/strip-scheduler.test.ts`: Strip planning tests.
- `src/lib/export/buffer-pool.ts`: Bounded typed-array buffer pool.
- `src/lib/export/buffer-pool.test.ts`: Reuse and budget tests.
- `src/lib/export/jpeg/row-writer.ts`: Row-oriented JPEG writer interface and browser runtime wrapper.
- `src/lib/export/jpeg/row-writer.test.ts`: Encoder lifecycle and fail-closed tests with a fake sink.
- `src/lib/export/jpeg/wasm-row-sink.ts`: Product JPEG sink backed by `@lumaforge/luma-jpeg-runtime`.
- `src/lib/export/jpeg/wasm-row-sink.test.ts`: Product sink tests with a mocked JPEG runtime.
- `src/lib/export/full-res-export.ts`: Main worker-side export orchestration.
- `src/lib/export/full-res-export.test.ts`: Capability, progress, cancellation, unsupported-pipeline, and no-full-frame tests.
- `src/lib/export/full-res-export.worker.ts`: Dedicated export worker entry.
- `src/lib/export/full-res-export-client.ts`: Main-thread client for worker requests.
- `src/lib/export/full-res-export-client.test.ts`: Worker error and cancellation tests.
- `src/lib/raw/export-runtime-adapter.ts`: App-facing adapter from Luma runtime session to export session.
- `src/lib/raw/export-runtime-adapter.test.ts`: Adapter capability and raw-window forwarding tests.
- `packages/luma-jpeg-runtime/package.json`: Workspace package for bounded JPEG encoding.
- `packages/luma-jpeg-runtime/src/index.ts`: Public JPEG runtime API.
- `packages/luma-jpeg-runtime/src/runtime.ts`: Row-oriented JPEG runtime client.
- `packages/luma-jpeg-runtime/src/runtime.test.ts`: Runtime API tests.
- `packages/luma-jpeg-runtime/worker/runtime-core.ts`: JPEG worker request handling.
- `packages/luma-jpeg-runtime/worker/runtime-core.test.ts`: Worker-core tests.
- `packages/luma-jpeg-runtime/worker/runtime.worker.ts`: JPEG worker entry.

Modify:

- `packages/luma-raw-runtime/src/types.ts`: Public raw-window export types.
- `packages/luma-raw-runtime/src/index.ts`: Export new types.
- `packages/luma-raw-runtime/src/runtime.ts`: Expose export capability and raw-window methods on sessions.
- `packages/luma-raw-runtime/src/runtime.test.ts`: Runtime session tests.
- `packages/luma-raw-runtime/src/worker-protocol.ts`: Add worker request and response types.
- `packages/luma-raw-runtime/src/worker-client.test.ts`: Transfer and cancellation coverage.
- `packages/luma-raw-runtime/worker/native-types.ts`: Native processor raw-window contract.
- `packages/luma-raw-runtime/worker/native-adapter.ts`: Normalize native export capability and raw-window output.
- `packages/luma-raw-runtime/worker/native-adapter.test.ts`: Native normalizer tests.
- `packages/luma-raw-runtime/worker/runtime-core.ts`: Handle export capability and raw-window requests.
- `packages/luma-raw-runtime/worker/runtime-core.test.ts`: Worker-core fail-closed and raw-window tests.
- `packages/luma-raw-runtime/native/libraw_wrapper.cpp`: LibRaw-backed raw-window prototype for unpacked Bayer sources.
- `src/lib/gl/pipeline.ts`: Derive preview uniforms from `ExportColorGraphDescriptor`.
- `src/lib/gl/pipeline.test.ts`: Preview/export color descriptor parity tests.
- `src/lib/raw/runtime-adapter.ts`: Add export capability to app runtime session.
- `src/lib/raw/luma-runtime-adapter.ts`: Wire Luma runtime export methods.
- `src/modules/raw-processor/model/session.ts`: Add full-resolution export capability state.
- `src/modules/raw-processor/model/derive-session.ts`: Export gating no longer depends on HQ preview.
- `src/modules/raw-processor/state/session.atoms.ts`: Use new export gating.
- `src/modules/raw-processor/hooks/useImageSession.ts`: Initialize export capability state.
- `src/modules/raw-processor/hooks/useRawProcessor.ts`: Probe export support, run full-resolution export worker, and keep preview export separate.
- `src/modules/raw-processor/services/export-system.ts`: Replace Canvas export job with full-resolution export client entrypoint and explicit preview-export helper.
- `src/modules/raw-processor/components/ControlsPanel.tsx`: Separate full-resolution export copy from preview export copy.
- `src/modules/raw-processor/components/WorkspaceHeader.tsx`: Rename export action and surface disabled reason.
- `src/modules/raw-processor/components/ProgressOverlay.tsx`: Show strip progress and recovery hint.
- `src/modules/raw-processor/__tests__/session-derive.test.ts`: Export gating tests.
- `src/modules/raw-processor/__tests__/export-system.test.ts`: Full-resolution export service tests.
- `src/modules/raw-processor/hooks/useRawProcessor.test.tsx`: UI workflow tests.
- `docs/specs/2026-04-22-phase1-test-matrix.md`: Add manual high-resolution export acceptance rows after implementation.

Do not modify:

- `src/lib/gl/export.ts` for the authoritative full-resolution path. Keep it only as legacy preview/canvas export planning until it is removed by a separate cleanup.
- The existing preview pipeline as the source of full-resolution pixels.

---

### Task 1: Runtime public export contract

**Files:**

- Modify: `packages/luma-raw-runtime/src/types.ts`
- Modify: `packages/luma-raw-runtime/src/index.ts`
- Modify: `packages/luma-raw-runtime/src/worker-protocol.ts`
- Test: `packages/luma-raw-runtime/src/types.test.ts`
- Test: `packages/luma-raw-runtime/src/worker-client.test.ts`

- [ ] **Step 1: Add compile-time type coverage for the public contract**

Add this test to `packages/luma-raw-runtime/src/types.test.ts`:

```ts
import type {
  LumaRawExportCapability,
  LumaRawWindow,
  LumaRawWindowRect,
} from './types'

it('types raw-window export capability payloads', () => {
  const rect: LumaRawWindowRect = { x: 4, y: 6, width: 8, height: 10 }
  const supported: LumaRawExportCapability = {
    supported: true,
    width: 6000,
    height: 4000,
    rawWidth: 6048,
    rawHeight: 4024,
    cfa: { pattern: 'rggb', xPhase: 0, yPhase: 0 },
    blackLevel: 512,
    whiteLevel: 16383,
    orientation: 1,
    reasons: [],
  }
  const unsupported: LumaRawExportCapability = {
    supported: false,
    width: 0,
    height: 0,
    rawWidth: 0,
    rawHeight: 0,
    cfa: { pattern: 'unsupported', xPhase: 0, yPhase: 0 },
    blackLevel: 0,
    whiteLevel: 0,
    orientation: 1,
    reasons: ['unsupported-cfa'],
  }
  const rawWindow: LumaRawWindow = {
    rect,
    cfa: supported.cfa,
    data: new Uint16Array(rect.width * rect.height),
    blackLevel: supported.blackLevel,
    whiteLevel: supported.whiteLevel,
  }

  expect(supported.supported).toBe(true)
  expect(unsupported.supported).toBe(false)
  expect(rawWindow.data.length).toBe(80)
})
```

- [ ] **Step 2: Run the type test and verify it fails**

Run:

```bash
pnpm test:run packages/luma-raw-runtime/src/types.test.ts -t "raw-window export capability"
```

Expected: FAIL with missing `LumaRawExportCapability`, `LumaRawWindow`, or `LumaRawWindowRect` exports.

- [ ] **Step 3: Add public raw-window types**

Add these types to `packages/luma-raw-runtime/src/types.ts`:

```ts
export type LumaRawCfaPattern =
  | 'rggb'
  | 'bggr'
  | 'grbg'
  | 'gbrg'
  | 'x-trans'
  | 'unsupported'

export type LumaRawCfaInfo = {
  pattern: LumaRawCfaPattern
  xPhase: 0 | 1 | 2 | 3 | 4 | 5
  yPhase: 0 | 1 | 2 | 3 | 4 | 5
}

export type LumaRawWindowRect = {
  x: number
  y: number
  width: number
  height: number
}

export type LumaRawExportUnsupportedReason =
  | 'unsupported-source'
  | 'unsupported-cfa'
  | 'compressed-raw-window-unavailable'
  | 'raw-window-unavailable'
  | 'missing-dimensions'
  | 'missing-levels'

export type LumaRawExportCapability = {
  supported: boolean
  width: number
  height: number
  rawWidth: number
  rawHeight: number
  cfa: LumaRawCfaInfo
  blackLevel: number
  whiteLevel: number
  orientation: number
  reasons: LumaRawExportUnsupportedReason[]
}

export type LumaRawWindow = {
  rect: LumaRawWindowRect
  cfa: LumaRawCfaInfo
  data: Uint16Array
  blackLevel: number
  whiteLevel: number
}
```

Extend `LumaRawDecodeSession` in `packages/luma-raw-runtime/src/types.ts`:

```ts
probeExportCapability: (
  signal?: AbortSignal,
) => Promise<LumaRawExportCapability>
readRawWindow: (
  rect: LumaRawWindowRect,
  signal?: AbortSignal,
) => Promise<LumaRawWindow>
```

Export the new types from `packages/luma-raw-runtime/src/index.ts`:

```ts
export type {
  LumaRawCfaInfo,
  LumaRawCfaPattern,
  LumaRawExportCapability,
  LumaRawExportUnsupportedReason,
  LumaRawWindow,
  LumaRawWindowRect,
} from './types'
```

- [ ] **Step 4: Add worker protocol requests**

Modify `packages/luma-raw-runtime/src/worker-protocol.ts`:

```ts
import type {
  LumaEmbeddedPreview,
  LumaRawExportCapability,
  LumaRawFrame,
  LumaRawProbe,
  LumaRawRuntimeInfo,
  LumaRawSessionInfo,
  LumaRawWindow,
  LumaRawWindowRect,
} from './types'
```

Add request types:

```ts
| 'probeExportCapabilityFromSession'
| 'readRawWindowFromSession'
```

Add payloads:

```ts
export type LumaRawWorkerRawWindowPayload = {
  sessionId: string
  rect: LumaRawWindowRect
}
```

Extend `LumaRawWorkerRequestPayloadByType`:

```ts
probeExportCapabilityFromSession: LumaRawWorkerSessionPayload
readRawWindowFromSession: LumaRawWorkerRawWindowPayload
```

Extend `LumaRawWorkerPayloadByType`:

```ts
probeExportCapabilityFromSession: LumaRawExportCapability
readRawWindowFromSession: LumaRawWindow
```

- [ ] **Step 5: Verify type tests pass**

Run:

```bash
pnpm test:run packages/luma-raw-runtime/src/types.test.ts packages/luma-raw-runtime/src/worker-client.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/luma-raw-runtime/src/types.ts packages/luma-raw-runtime/src/index.ts packages/luma-raw-runtime/src/worker-protocol.ts packages/luma-raw-runtime/src/types.test.ts packages/luma-raw-runtime/src/worker-client.test.ts
git commit -m "feat(raw-runtime): define raw-window export contract"
```

---

### Task 2: Runtime session methods and fail-closed worker core

**Files:**

- Modify: `packages/luma-raw-runtime/src/runtime.ts`
- Modify: `packages/luma-raw-runtime/worker/native-types.ts`
- Modify: `packages/luma-raw-runtime/worker/native-adapter.ts`
- Modify: `packages/luma-raw-runtime/worker/runtime-core.ts`
- Test: `packages/luma-raw-runtime/src/runtime.test.ts`
- Test: `packages/luma-raw-runtime/worker/native-adapter.test.ts`
- Test: `packages/luma-raw-runtime/worker/runtime-core.test.ts`

- [ ] **Step 1: Add runtime tests for session methods**

Add to `packages/luma-raw-runtime/src/runtime.test.ts`:

```ts
it('forwards export capability and raw-window requests through the session', async () => {
  const worker = new EchoWorker((request) => {
    if (request.type === 'init') {
      return {
        runtime: 'luma',
        version: '0.1.0',
        simd: true,
        pthreads: true,
        crossOriginIsolated: true,
        memoryTier: 'normal',
        workerPoolSize: 1,
      }
    }
    if (request.type === 'openSession') {
      return {
        sessionId: 's1',
        probe: {
          jobId: request.id,
          supportLevel: 'experimental',
          width: 4,
          height: 4,
          timings: { total: 1 },
        },
        timings: { total: 1 },
      }
    }
    if (request.type === 'probeExportCapabilityFromSession') {
      return {
        supported: true,
        width: 4,
        height: 4,
        rawWidth: 4,
        rawHeight: 4,
        cfa: { pattern: 'rggb', xPhase: 0, yPhase: 0 },
        blackLevel: 0,
        whiteLevel: 65535,
        orientation: 1,
        reasons: [],
      }
    }
    if (request.type === 'readRawWindowFromSession') {
      return {
        rect: request.payload.rect,
        cfa: { pattern: 'rggb', xPhase: 0, yPhase: 0 },
        data: new Uint16Array(4),
        blackLevel: 0,
        whiteLevel: 65535,
      }
    }
    if (request.type === 'closeSession') return { closed: true }
    throw new Error(`Unexpected request: ${request.type}`)
  })
  const runtime = createLumaRawRuntime({
    requireCrossOriginIsolation: false,
    workerFactory: () => worker as unknown as Worker,
  })

  const session = await runtime.openSession(new File(['raw'], 'a.dng'))
  await expect(session.probeExportCapability()).resolves.toMatchObject({
    supported: true,
    width: 4,
    height: 4,
  })
  await expect(
    session.readRawWindow({ x: 0, y: 0, width: 2, height: 2 }),
  ).resolves.toMatchObject({
    rect: { x: 0, y: 0, width: 2, height: 2 },
  })
})
```

- [ ] **Step 2: Run runtime test and verify it fails**

Run:

```bash
pnpm test:run packages/luma-raw-runtime/src/runtime.test.ts -t "export capability"
```

Expected: FAIL because `probeExportCapability` and `readRawWindow` are not session methods.

- [ ] **Step 3: Add native types**

Add to `packages/luma-raw-runtime/worker/native-types.ts`:

```ts
import type {
  LumaRawExportCapability,
  LumaRawWindow,
  LumaRawWindowRect,
} from '../src/types'
```

Extend `LumaRawNativeProcessor`:

```ts
probeExportCapability?: () => LumaRawExportCapability
readRawWindow?: (rect: LumaRawWindowRect) => LumaRawWindow
```

- [ ] **Step 4: Normalize native export outputs**

Add to `packages/luma-raw-runtime/worker/native-adapter.ts`:

```ts
function normalizeCfa(value: unknown) {
  const raw = asRecord(value)
  const pattern =
    raw.pattern === 'rggb' ||
    raw.pattern === 'bggr' ||
    raw.pattern === 'grbg' ||
    raw.pattern === 'gbrg' ||
    raw.pattern === 'x-trans'
      ? raw.pattern
      : 'unsupported'
  const xPhase = asNumber(raw.xPhase) ?? 0
  const yPhase = asNumber(raw.yPhase) ?? 0
  return {
    pattern,
    xPhase: Math.max(0, Math.min(5, xPhase)) as 0 | 1 | 2 | 3 | 4 | 5,
    yPhase: Math.max(0, Math.min(5, yPhase)) as 0 | 1 | 2 | 3 | 4 | 5,
  }
}

function normalizeExportCapability(value: unknown) {
  const raw = asRecord(value)
  const reasons = Array.isArray(raw.reasons)
    ? raw.reasons.filter((item): item is string => typeof item === 'string')
    : []

  return {
    supported: raw.supported === true,
    width: asNumber(raw.width) ?? 0,
    height: asNumber(raw.height) ?? 0,
    rawWidth: asNumber(raw.rawWidth) ?? 0,
    rawHeight: asNumber(raw.rawHeight) ?? 0,
    cfa: normalizeCfa(raw.cfa),
    blackLevel: asNumber(raw.blackLevel) ?? 0,
    whiteLevel: asNumber(raw.whiteLevel) ?? 0,
    orientation: asNumber(raw.orientation) ?? 1,
    reasons,
  }
}

function normalizeWindowRect(value: unknown) {
  const raw = asRecord(value)
  return {
    x: asPositiveInteger(raw.x === 0 ? 1 : raw.x, 'rect.x') - 1,
    y: asPositiveInteger(raw.y === 0 ? 1 : raw.y, 'rect.y') - 1,
    width: asPositiveInteger(raw.width, 'rect.width'),
    height: asPositiveInteger(raw.height, 'rect.height'),
  }
}

function normalizeRawWindow(value: unknown) {
  const raw = asRecord(value)
  if (!(raw.data instanceof Uint16Array)) {
    throw new TypeError('Native RAW window did not return Uint16Array data.')
  }
  const rect = normalizeWindowRect(raw.rect)
  const expectedLength = rect.width * rect.height
  if (raw.data.length !== expectedLength) {
    throw new TypeError('Native RAW window data length does not match rect.')
  }
  return {
    rect,
    cfa: normalizeCfa(raw.cfa),
    data: normalizeUint16Output(raw.data, 'raw window'),
    blackLevel: asNumber(raw.blackLevel) ?? 0,
    whiteLevel: asNumber(raw.whiteLevel) ?? 0,
  }
}
```

Add methods inside `createNativeFactory()`:

```ts
probeExportCapability() {
  if (!processor.probeExportCapability) {
    return {
      supported: false,
      width: 0,
      height: 0,
      rawWidth: 0,
      rawHeight: 0,
      cfa: { pattern: 'unsupported', xPhase: 0, yPhase: 0 },
      blackLevel: 0,
      whiteLevel: 0,
      orientation: 1,
      reasons: ['raw-window-unavailable'],
    }
  }
  return normalizeExportCapability(processor.probeExportCapability())
},
readRawWindow(rect) {
  if (!processor.readRawWindow) {
    throw new TypeError('Native RAW raw-window access is unavailable.')
  }
  return normalizeRawWindow(processor.readRawWindow(rect))
},
```

- [ ] **Step 5: Handle requests in runtime core**

Add handlers in `packages/luma-raw-runtime/worker/runtime-core.ts`:

```ts
function handleProbeExportCapabilityFromSession(
  request: LumaRawWorkerRequest<'probeExportCapabilityFromSession'>,
): LumaRawWorkerResponse {
  if (consumeCancellation(request)) return cancelledResponse(request)
  const session = requireSession(request.payload.sessionId)
  const capability = session.processor.probeExportCapability?.() ?? {
    supported: false,
    width: 0,
    height: 0,
    rawWidth: 0,
    rawHeight: 0,
    cfa: { pattern: 'unsupported' as const, xPhase: 0 as const, yPhase: 0 as const },
    blackLevel: 0,
    whiteLevel: 0,
    orientation: 1,
    reasons: ['raw-window-unavailable' as const],
  }

  return {
    id: request.id,
    ok: true,
    type: request.type,
    payload: capability,
  }
}

function handleReadRawWindowFromSession(
  request: LumaRawWorkerRequest<'readRawWindowFromSession'>,
): LumaRawWorkerResponse {
  if (consumeCancellation(request)) return cancelledResponse(request)
  const session = requireSession(request.payload.sessionId)
  if (!session.processor.readRawWindow) {
    throw new LumaRawRuntimeError(
      'RAW_UNSUPPORTED_FORMAT',
      'RAW runtime raw-window access is unavailable for this source.',
    )
  }
  return {
    id: request.id,
    ok: true,
    type: request.type,
    payload: session.processor.readRawWindow(request.payload.rect),
  }
}
```

Add switch cases:

```ts
case 'probeExportCapabilityFromSession':
  return handleProbeExportCapabilityFromSession(request)
case 'readRawWindowFromSession':
  return handleReadRawWindowFromSession(request)
```

- [ ] **Step 6: Expose methods on runtime sessions**

Add to the returned session object in `packages/luma-raw-runtime/src/runtime.ts`:

```ts
probeExportCapability(stageSignal?: AbortSignal) {
  return client.request(
    'probeExportCapabilityFromSession',
    { sessionId: sessionInfo.sessionId },
    [],
    stageSignal,
  )
},
readRawWindow(rect, stageSignal?: AbortSignal) {
  return client.request(
    'readRawWindowFromSession',
    { sessionId: sessionInfo.sessionId, rect },
    [],
    stageSignal,
  )
},
```

- [ ] **Step 7: Verify runtime and worker tests**

Run:

```bash
pnpm test:run packages/luma-raw-runtime/src/runtime.test.ts packages/luma-raw-runtime/worker/native-adapter.test.ts packages/luma-raw-runtime/worker/runtime-core.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/luma-raw-runtime/src/runtime.ts packages/luma-raw-runtime/src/runtime.test.ts packages/luma-raw-runtime/worker/native-types.ts packages/luma-raw-runtime/worker/native-adapter.ts packages/luma-raw-runtime/worker/native-adapter.test.ts packages/luma-raw-runtime/worker/runtime-core.ts packages/luma-raw-runtime/worker/runtime-core.test.ts
git commit -m "feat(raw-runtime): expose session raw-window requests"
```

---

### Task 3: Native LibRaw raw-window prototype

**Files:**

- Modify: `packages/luma-raw-runtime/native/libraw_wrapper.cpp`
- Test: `packages/luma-raw-runtime/worker/runtime-core.test.ts`
- Manual command: `pnpm --filter @lumaforge/luma-raw-runtime build:native`

- [ ] **Step 1: Add runtime-core tests for native-supported and native-unsupported windows**

Add a mock processor test in `packages/luma-raw-runtime/worker/runtime-core.test.ts` that returns:

```ts
const nativeCapability = {
  supported: true,
  width: 4,
  height: 4,
  rawWidth: 4,
  rawHeight: 4,
  cfa: { pattern: 'rggb' as const, xPhase: 0 as const, yPhase: 0 as const },
  blackLevel: 64,
  whiteLevel: 1023,
  orientation: 1,
  reasons: [],
}

const nativeWindow = {
  rect: { x: 0, y: 0, width: 2, height: 2 },
  cfa: nativeCapability.cfa,
  data: new Uint16Array([100, 200, 300, 400]),
  blackLevel: 64,
  whiteLevel: 1023,
}
```

Expected assertions:

```ts
expect(capability.payload).toEqual(nativeCapability)
expect(window.payload).toEqual(nativeWindow)
```

- [ ] **Step 2: Run runtime-core tests and verify mock path passes**

Run:

```bash
pnpm test:run packages/luma-raw-runtime/worker/runtime-core.test.ts -t "raw-window"
```

Expected: PASS for mock runtime behavior.

- [ ] **Step 3: Add native helper functions**

Add to `packages/luma-raw-runtime/native/libraw_wrapper.cpp` in the anonymous namespace:

```cpp
std::string cfaPatternName(LibRaw &processor) {
  const int c00 = processor.COLOR(0, 0);
  const int c01 = processor.COLOR(0, 1);
  const int c10 = processor.COLOR(1, 0);
  const int c11 = processor.COLOR(1, 1);

  if (c00 == 0 && c01 == 1 && c10 == 1 && c11 == 2) return "rggb";
  if (c00 == 2 && c01 == 1 && c10 == 1 && c11 == 0) return "bggr";
  if (c00 == 1 && c01 == 0 && c10 == 2 && c11 == 1) return "grbg";
  if (c00 == 1 && c01 == 2 && c10 == 0 && c11 == 1) return "gbrg";
  return "unsupported";
}

bool hasBayerRawImage(const libraw_data_t &imgdata) {
  return imgdata.rawdata.raw_image != nullptr && imgdata.idata.filters != 0;
}

val cfaObject(const std::string &pattern) {
  val cfa = val::object();
  cfa.set("pattern", pattern);
  cfa.set("xPhase", 0);
  cfa.set("yPhase", 0);
  return cfa;
}

val unsupportedCapability(const libraw_data_t &imgdata,
                          const std::string &reason) {
  const libraw_image_sizes_t &sizes = imgdata.sizes;
  const libraw_colordata_t &color = imgdata.color;

  val reasons = val::array();
  reasons.call<void>("push", reason);

  val capability = val::object();
  capability.set("supported", false);
  capability.set("width", sizes.width);
  capability.set("height", sizes.height);
  capability.set("rawWidth", sizes.raw_width);
  capability.set("rawHeight", sizes.raw_height);
  capability.set("cfa", cfaObject("unsupported"));
  capability.set("blackLevel", color.black);
  capability.set("whiteLevel", color.maximum);
  capability.set("orientation", sizes.flip);
  capability.set("reasons", reasons);
  return capability;
}
```

- [ ] **Step 4: Add native methods**

Add public methods to `LumaRawProcessor`:

```cpp
val probeExportCapability() {
  requireLibRawSuccess("LibRaw unpack", processor_.unpack());
  const libraw_data_t &imgdata = processor_.imgdata;
  const libraw_image_sizes_t &sizes = imgdata.sizes;
  const libraw_colordata_t &color = imgdata.color;

  if (sizes.width <= 0 || sizes.height <= 0 || sizes.raw_width <= 0 ||
      sizes.raw_height <= 0) {
    return unsupportedCapability(imgdata, "missing-dimensions");
  }
  if (color.maximum <= color.black) {
    return unsupportedCapability(imgdata, "missing-levels");
  }
  if (!hasBayerRawImage(imgdata)) {
    return unsupportedCapability(imgdata, "raw-window-unavailable");
  }

  const std::string pattern = cfaPatternName(processor_);
  if (pattern == "unsupported") {
    return unsupportedCapability(imgdata, "unsupported-cfa");
  }

  val reasons = val::array();
  val capability = val::object();
  capability.set("supported", true);
  capability.set("width", sizes.width);
  capability.set("height", sizes.height);
  capability.set("rawWidth", sizes.raw_width);
  capability.set("rawHeight", sizes.raw_height);
  capability.set("cfa", cfaObject(pattern));
  capability.set("blackLevel", color.black);
  capability.set("whiteLevel", color.maximum);
  capability.set("orientation", sizes.flip);
  capability.set("reasons", reasons);
  return capability;
}

val readRawWindow(val rect) {
  requireLibRawSuccess("LibRaw unpack", processor_.unpack());
  const libraw_data_t &imgdata = processor_.imgdata;
  const libraw_image_sizes_t &sizes = imgdata.sizes;
  const libraw_colordata_t &color = imgdata.color;

  if (!hasBayerRawImage(imgdata)) {
    throw std::runtime_error("LibRaw raw-window access is unavailable.");
  }

  const int x = rect["x"].as<int>();
  const int y = rect["y"].as<int>();
  const int width = rect["width"].as<int>();
  const int height = rect["height"].as<int>();
  if (x < 0 || y < 0 || width <= 0 || height <= 0 ||
      x + width > sizes.raw_width || y + height > sizes.raw_height) {
    throw std::runtime_error("RAW window rect is outside the RAW bounds.");
  }

  const uint16_t *source = imgdata.rawdata.raw_image;
  std::vector<uint16_t> window(
      checkedMultiply(static_cast<size_t>(width),
                      static_cast<size_t>(height),
                      "RAW window pixel count"));

  for (int row = 0; row < height; ++row) {
    const size_t src = static_cast<size_t>(y + row) * sizes.raw_width + x;
    const size_t dst = static_cast<size_t>(row) * width;
    std::copy(source + src, source + src + width, window.data() + dst);
  }

  val out_rect = val::object();
  out_rect.set("x", x);
  out_rect.set("y", y);
  out_rect.set("width", width);
  out_rect.set("height", height);

  val output = val::object();
  output.set("rect", out_rect);
  output.set("cfa", cfaObject(cfaPatternName(processor_)));
  output.set("data", copiedUint16Array(window.data(), window.size()));
  output.set("blackLevel", color.black);
  output.set("whiteLevel", color.maximum);
  return output;
}
```

Add bindings:

```cpp
.function("probeExportCapability", &LumaRawProcessor::probeExportCapability)
.function("readRawWindow", &LumaRawProcessor::readRawWindow)
```

- [ ] **Step 5: Build native runtime**

Run:

```bash
pnpm --filter @lumaforge/luma-raw-runtime build:native
```

Expected: build completes without C++ compile errors.

- [ ] **Step 6: Run runtime package tests**

Run:

```bash
pnpm --filter @lumaforge/luma-raw-runtime test
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/luma-raw-runtime/native/libraw_wrapper.cpp packages/luma-raw-runtime/worker/runtime-core.test.ts
git commit -m "feat(raw-runtime): add LibRaw raw-window prototype"
```

---

### Task 4: Export color graph descriptor

**Files:**

- Create: `src/lib/export/color-graph.ts`
- Create: `src/lib/export/color-graph.test.ts`
- Modify: `src/lib/gl/pipeline.ts`
- Test: `src/lib/export/color-graph.test.ts`
- Test: `src/lib/gl/pipeline.test.ts`

- [ ] **Step 1: Write descriptor tests**

Create `src/lib/export/color-graph.test.ts`:

```ts
import { getLUTColorProfile } from '~/lib/color/registry'
import { resolveExportColorGraph } from './color-graph'

it('resolves no-lut export to linear ProPhoto then sRGB output', () => {
  const graph = resolveExportColorGraph({
    styleKind: 'none',
    intensity: 0.7,
    builtinPreset: null,
    lut: null,
  })

  expect(graph.supported).toBe(true)
  expect(graph.outputGamut).toBe('srgb-rec709')
  expect(graph.outputTransfer).toBe('srgb')
  expect(graph.steps.map((step) => step.kind)).toEqual([
    'input-linear-prophoto',
    'output-srgb',
  ])
})

it('resolves scene creative LUTs with explicit input gamut and transfer', () => {
  const profile = getLUTColorProfile('sony-sgamut3cine-slog3')!
  const graph = resolveExportColorGraph({
    styleKind: 'custom',
    intensity: 0.7,
    builtinPreset: null,
    lut: {
      size: 2,
      data: new Float32Array(24),
      domainMin: [0, 0, 0],
      domainMax: [1, 1, 1],
      inputProfile: 'v-log',
      profileResolution: {
        kind: 'resolved',
        confidence: 'user',
        profile,
      },
    },
  })

  expect(graph.supported).toBe(true)
  expect(graph.steps.map((step) => step.kind)).toEqual([
    'input-linear-prophoto',
    'gamut-to-lut-input',
    'encode-lut-transfer',
    'lut3d',
    'lut-output-to-srgb',
    'output-srgb',
  ])
})

it('fails closed for unresolved LUT profiles', () => {
  const graph = resolveExportColorGraph({
    styleKind: 'custom',
    intensity: 0.7,
    builtinPreset: null,
    lut: {
      size: 2,
      data: new Float32Array(24),
      domainMin: [0, 0, 0],
      domainMax: [1, 1, 1],
      inputProfile: 'display-srgb',
      profileResolution: {
        kind: 'needs-user-selection',
        suggestions: [],
      },
    },
  })

  expect(graph.supported).toBe(false)
  expect(graph.reason).toBe('unsupported-pipeline')
})
```

- [ ] **Step 2: Run descriptor tests and verify they fail**

Run:

```bash
pnpm test:run src/lib/export/color-graph.test.ts
```

Expected: FAIL because `color-graph.ts` does not exist.

- [ ] **Step 3: Implement descriptor**

Create `src/lib/export/color-graph.ts`:

```ts
import type { TransferFunctionId } from '~/lib/color/log-encoding'
import {
  getLinearProPhotoToGamutMatrix,
  getLUTOutputToTargetMatrix,
  mat3Identity,
  type Mat3,
} from '~/lib/color/matrix'
import type { ColorGamutId } from '~/lib/color/constants'
import type { LUTColorProfile, LUTRole, SignalRange } from '~/lib/color/registry'
import type { LUTData, ProcessingParams } from '~/lib/gl/pipeline'

export type ExportColorGraphStep =
  | { kind: 'input-linear-prophoto' }
  | { kind: 'gamut-to-lut-input'; matrix: Mat3; gamut: ColorGamutId }
  | { kind: 'encode-lut-transfer'; transfer: TransferFunctionId; range: SignalRange }
  | { kind: 'lut3d'; size: number; data: Float32Array; domainMin: [number, number, number]; domainMax: [number, number, number]; role: LUTRole; intensity: number }
  | { kind: 'lut-output-to-srgb'; matrix: Mat3 }
  | { kind: 'builtin-style'; preset: NonNullable<ProcessingParams['builtinPreset']>; intensity: number }
  | { kind: 'output-srgb' }

export type ExportColorGraphDescriptor =
  | {
      supported: true
      outputGamut: 'srgb-rec709'
      outputTransfer: 'srgb'
      lutProfile: LUTColorProfile | null
      steps: ExportColorGraphStep[]
    }
  | {
      supported: false
      reason: 'unsupported-pipeline'
      message: string
      steps: []
    }

export function resolveExportColorGraph(input: {
  styleKind: ProcessingParams['styleKind']
  intensity: number
  builtinPreset: ProcessingParams['builtinPreset']
  lut: LUTData | null
}): ExportColorGraphDescriptor {
  const base: ExportColorGraphStep[] = [{ kind: 'input-linear-prophoto' }]

  if (input.styleKind === 'builtin' && input.builtinPreset) {
    return {
      supported: true,
      outputGamut: 'srgb-rec709',
      outputTransfer: 'srgb',
      lutProfile: null,
      steps: [
        ...base,
        { kind: 'builtin-style', preset: input.builtinPreset, intensity: input.intensity },
        { kind: 'output-srgb' },
      ],
    }
  }

  if (input.styleKind !== 'custom' || !input.lut) {
    return {
      supported: true,
      outputGamut: 'srgb-rec709',
      outputTransfer: 'srgb',
      lutProfile: null,
      steps: [...base, { kind: 'output-srgb' }],
    }
  }

  if (input.lut.profileResolution.kind !== 'resolved') {
    return {
      supported: false,
      reason: 'unsupported-pipeline',
      message: 'Choose a LUT input profile before full-resolution export.',
      steps: [],
    }
  }

  const profile = input.lut.profileResolution.profile
  if (profile.outputTransfer && profile.outputTransfer !== 'srgb' && profile.outputTransfer !== 'gamma24') {
    return {
      supported: false,
      reason: 'unsupported-pipeline',
      message: 'This LUT output transfer is not supported by full-resolution JPEG export.',
      steps: [],
    }
  }

  const inputMatrix =
    profile.inputGamut === 'prophoto-rgb'
      ? mat3Identity()
      : getLinearProPhotoToGamutMatrix(profile.inputGamut)
  const outputMatrix = profile.outputGamut
    ? getLUTOutputToTargetMatrix(profile.outputGamut, 'srgb-rec709')
    : mat3Identity()

  return {
    supported: true,
    outputGamut: 'srgb-rec709',
    outputTransfer: 'srgb',
    lutProfile: profile,
    steps: [
      ...base,
      { kind: 'gamut-to-lut-input', matrix: inputMatrix, gamut: profile.inputGamut },
      { kind: 'encode-lut-transfer', transfer: profile.inputTransfer, range: profile.inputRange },
      {
        kind: 'lut3d',
        size: input.lut.size,
        data: input.lut.data,
        domainMin: input.lut.domainMin,
        domainMax: input.lut.domainMax,
        role: profile.role,
        intensity: input.intensity,
      },
      { kind: 'lut-output-to-srgb', matrix: outputMatrix },
      { kind: 'output-srgb' },
    ],
  }
}
```

- [ ] **Step 4: Wire preview pipeline to use the descriptor**

Modify `src/lib/gl/pipeline.ts` so `RawProcessingPipeline` computes the same descriptor before resolving LUT uniforms:

```ts
import { resolveExportColorGraph } from '~/lib/export/color-graph'
```

In `getTelemetrySnapshot()`, create the graph:

```ts
const exportGraph = resolveExportColorGraph({
  styleKind: this.params.styleKind,
  intensity: this.params.intensity,
  builtinPreset: this.params.builtinPreset,
  lut: this.lutData,
})
```

Keep existing shader uniforms, but derive the resolved profile from `exportGraph.lutProfile` when `exportGraph.supported` is true. This preserves preview behavior while making descriptor drift visible in telemetry and tests.

- [ ] **Step 5: Verify descriptor tests**

Run:

```bash
pnpm test:run src/lib/export/color-graph.test.ts src/lib/gl/pipeline.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/export/color-graph.ts src/lib/export/color-graph.test.ts src/lib/gl/pipeline.ts src/lib/gl/pipeline.test.ts
git commit -m "feat(export): add shared color graph descriptor"
```

---

### Task 5: Strip planning, buffer pool, demosaic, and LUT CPU primitives

**Files:**

- Create: `src/lib/export/strip-scheduler.ts`
- Create: `src/lib/export/strip-scheduler.test.ts`
- Create: `src/lib/export/buffer-pool.ts`
- Create: `src/lib/export/buffer-pool.test.ts`
- Create: `src/lib/export/demosaic.ts`
- Create: `src/lib/export/demosaic.test.ts`
- Create: `src/lib/export/lut3d.ts`
- Create: `src/lib/export/lut3d.test.ts`

- [ ] **Step 1: Write strip scheduler tests**

Create `src/lib/export/strip-scheduler.test.ts`:

```ts
import { expandRectWithHalo, planExportStrips } from './strip-scheduler'

it('plans ordered strips without changing output dimensions', () => {
  const strips = planExportStrips({
    width: 10,
    height: 9,
    preferredRows: 4,
    minRows: 2,
    halo: 2,
  })

  expect(strips.map((strip) => strip.output)).toEqual([
    { x: 0, y: 0, width: 10, height: 4 },
    { x: 0, y: 4, width: 10, height: 4 },
    { x: 0, y: 8, width: 10, height: 1 },
  ])
})

it('expands input rect by halo and clamps to raw bounds', () => {
  expect(
    expandRectWithHalo(
      { x: 0, y: 4, width: 10, height: 4 },
      { width: 10, height: 9 },
      2,
    ),
  ).toEqual({ x: 0, y: 2, width: 10, height: 7 })
})
```

- [ ] **Step 2: Implement strip scheduler**

Create `src/lib/export/strip-scheduler.ts`:

```ts
import type { LumaRawWindowRect } from '@lumaforge/luma-raw-runtime'

export type ExportStrip = {
  output: LumaRawWindowRect
  input: LumaRawWindowRect
}

export function expandRectWithHalo(
  rect: LumaRawWindowRect,
  bounds: { width: number; height: number },
  halo: number,
): LumaRawWindowRect {
  const x = Math.max(0, rect.x - halo)
  const y = Math.max(0, rect.y - halo)
  const right = Math.min(bounds.width, rect.x + rect.width + halo)
  const bottom = Math.min(bounds.height, rect.y + rect.height + halo)
  return { x, y, width: right - x, height: bottom - y }
}

export function planExportStrips(input: {
  width: number
  height: number
  preferredRows: number
  minRows: number
  halo: number
}): ExportStrip[] {
  const rows = Math.max(input.minRows, input.preferredRows)
  const strips: ExportStrip[] = []
  for (let y = 0; y < input.height; y += rows) {
    const output = {
      x: 0,
      y,
      width: input.width,
      height: Math.min(rows, input.height - y),
    }
    strips.push({
      output,
      input: expandRectWithHalo(output, input, input.halo),
    })
  }
  return strips
}

export function reduceStripRows(currentRows: number, minRows: number) {
  return Math.max(minRows, Math.floor(currentRows / 2))
}
```

- [ ] **Step 3: Write buffer pool tests and implementation**

Create `src/lib/export/buffer-pool.test.ts`:

```ts
import { TypedBufferPool } from './buffer-pool'

it('reuses released Uint16 buffers by length', () => {
  const pool = new TypedBufferPool(() => new Uint16Array(4), 2)
  const first = pool.acquire()
  pool.release(first)
  expect(pool.acquire()).toBe(first)
})

it('rejects releases above capacity', () => {
  const pool = new TypedBufferPool(() => new Float32Array(3), 1)
  const first = pool.acquire()
  const second = pool.acquire()
  pool.release(first)
  pool.release(second)
  expect(pool.size).toBe(1)
})
```

Create `src/lib/export/buffer-pool.ts`:

```ts
export class TypedBufferPool<T extends ArrayBufferView> {
  private readonly free: T[] = []

  constructor(
    private readonly create: () => T,
    private readonly capacity: number,
  ) {}

  get size() {
    return this.free.length
  }

  acquire(): T {
    return this.free.pop() ?? this.create()
  }

  release(buffer: T) {
    if (this.free.length >= this.capacity) return
    this.free.push(buffer)
  }

  clear() {
    this.free.length = 0
  }
}
```

- [ ] **Step 4: Write CPU primitive tests**

Create `src/lib/export/demosaic.test.ts`:

```ts
import { demosaicBilinearRgb } from './demosaic'

it('demosaics an RGGB window into RGB float output', () => {
  const out = demosaicBilinearRgb({
    data: new Uint16Array([
      100, 20, 110, 30,
      40, 200, 50, 210,
      120, 60, 130, 70,
      80, 220, 90, 230,
    ]),
    rect: { x: 0, y: 0, width: 4, height: 4 },
    cfa: { pattern: 'rggb', xPhase: 0, yPhase: 0 },
    blackLevel: 0,
    whiteLevel: 255,
    output: { x: 1, y: 1, width: 2, height: 2 },
  })

  expect(out.width).toBe(2)
  expect(out.height).toBe(2)
  expect(out.data.length).toBe(12)
  expect(out.data.every((value) => Number.isFinite(value))).toBe(true)
})
```

Create `src/lib/export/lut3d.test.ts`:

```ts
import { sampleLutTrilinear } from './lut3d'

it('samples identity 2x2x2 LUT', () => {
  const data = new Float32Array([
    0, 0, 0, 1, 0, 0,
    0, 1, 0, 1, 1, 0,
    0, 0, 1, 1, 0, 1,
    0, 1, 1, 1, 1, 1,
  ])

  expect(sampleLutTrilinear(data, 2, 0.5, 0.5, 0.5)).toEqual([0.5, 0.5, 0.5])
})
```

- [ ] **Step 5: Implement CPU primitives**

Create `src/lib/export/lut3d.ts`:

```ts
function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}

function read(data: Float32Array, size: number, r: number, g: number, b: number) {
  const index = ((b * size + g) * size + r) * 3
  return [data[index], data[index + 1], data[index + 2]] as [number, number, number]
}

function mix(a: number, b: number, t: number) {
  return a + (b - a) * t
}

export function sampleLutTrilinear(
  data: Float32Array,
  size: number,
  r: number,
  g: number,
  b: number,
): [number, number, number] {
  const x = clamp01(r) * (size - 1)
  const y = clamp01(g) * (size - 1)
  const z = clamp01(b) * (size - 1)
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const z0 = Math.floor(z)
  const x1 = Math.min(size - 1, x0 + 1)
  const y1 = Math.min(size - 1, y0 + 1)
  const z1 = Math.min(size - 1, z0 + 1)
  const tx = x - x0
  const ty = y - y0
  const tz = z - z0

  const c000 = read(data, size, x0, y0, z0)
  const c100 = read(data, size, x1, y0, z0)
  const c010 = read(data, size, x0, y1, z0)
  const c110 = read(data, size, x1, y1, z0)
  const c001 = read(data, size, x0, y0, z1)
  const c101 = read(data, size, x1, y0, z1)
  const c011 = read(data, size, x0, y1, z1)
  const c111 = read(data, size, x1, y1, z1)

  return [0, 1, 2].map((channel) => {
    const x00 = mix(c000[channel], c100[channel], tx)
    const x10 = mix(c010[channel], c110[channel], tx)
    const x01 = mix(c001[channel], c101[channel], tx)
    const x11 = mix(c011[channel], c111[channel], tx)
    return mix(mix(x00, x10, ty), mix(x01, x11, ty), tz)
  }) as [number, number, number]
}
```

Create `src/lib/export/demosaic.ts` with a bilinear RGGB/BGGR/GRBG/GBRG implementation. The exported signature must be:

```ts
import type { LumaRawCfaInfo, LumaRawWindow, LumaRawWindowRect } from '@lumaforge/luma-raw-runtime'

export type LinearRgbTile = {
  width: number
  height: number
  data: Float32Array
}

export function demosaicBilinearRgb(input: LumaRawWindow & { output: LumaRawWindowRect }): LinearRgbTile
```

The implementation must normalize samples with:

```ts
const normalized = (sample - blackLevel) / Math.max(1, whiteLevel - blackLevel)
```

Clamp normalized values to `[0, 1]`. For missing color samples, average same-color neighbors inside the raw window. If no same-color neighbor exists at a border, reuse the current sample.

- [ ] **Step 6: Verify primitive tests**

Run:

```bash
pnpm test:run src/lib/export/strip-scheduler.test.ts src/lib/export/buffer-pool.test.ts src/lib/export/demosaic.test.ts src/lib/export/lut3d.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/export/strip-scheduler.ts src/lib/export/strip-scheduler.test.ts src/lib/export/buffer-pool.ts src/lib/export/buffer-pool.test.ts src/lib/export/demosaic.ts src/lib/export/demosaic.test.ts src/lib/export/lut3d.ts src/lib/export/lut3d.test.ts
git commit -m "feat(export): add bounded strip processing primitives"
```

---

### Task 6: Row-oriented JPEG writer and product sink boundary

**Files:**

- Create: `src/lib/export/jpeg/row-writer.ts`
- Create: `src/lib/export/jpeg/row-writer.test.ts`
- Create: `src/lib/export/jpeg/wasm-row-sink.ts`
- Create: `src/lib/export/jpeg/wasm-row-sink.test.ts`
- Create: `packages/luma-jpeg-runtime/package.json`
- Create: `packages/luma-jpeg-runtime/tsconfig.json`
- Create: `packages/luma-jpeg-runtime/vite.config.ts`
- Create: `packages/luma-jpeg-runtime/src/index.ts`
- Create: `packages/luma-jpeg-runtime/src/runtime.ts`
- Create: `packages/luma-jpeg-runtime/src/runtime.test.ts`
- Create: `packages/luma-jpeg-runtime/worker/runtime-core.ts`
- Create: `packages/luma-jpeg-runtime/worker/runtime-core.test.ts`
- Create: `packages/luma-jpeg-runtime/worker/runtime.worker.ts`

- [ ] **Step 1: Write row-writer lifecycle tests**

Create `src/lib/export/jpeg/row-writer.test.ts`:

```ts
import { createJpegRowWriter } from './row-writer'

it('writes rows and closes to a JPEG blob', async () => {
  const writer = createJpegRowWriter({
    width: 2,
    height: 2,
    quality: 0.9,
    sink: {
      async encode({ rows }) {
        expect(rows).toHaveLength(2)
        return new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], {
          type: 'image/jpeg',
        })
      },
    },
  })

  writer.writeRows(new Uint8Array([255, 0, 0, 0, 255, 0]), 1)
  writer.writeRows(new Uint8Array([0, 0, 255, 255, 255, 255]), 1)

  await expect(writer.close()).resolves.toMatchObject({ type: 'image/jpeg' })
})

it('fails closed when row count exceeds image height', () => {
  const writer = createJpegRowWriter({
    width: 1,
    height: 1,
    quality: 0.9,
    sink: { encode: async () => new Blob() },
  })

  writer.writeRows(new Uint8Array([0, 0, 0]), 1)
  expect(() => writer.writeRows(new Uint8Array([0, 0, 0]), 1)).toThrow(
    'JPEG_ROW_COUNT_EXCEEDED',
  )
})
```

- [ ] **Step 2: Implement bounded writer interface**

Create `src/lib/export/jpeg/row-writer.ts`:

```ts
export type JpegRowSink = {
  encode: (input: {
    width: number
    height: number
    quality: number
    rows: Uint8Array[]
  }) => Promise<Blob>
}

export type JpegRowWriter = {
  writeRows: (rgbRows: Uint8Array, rowCount: number) => void
  close: () => Promise<Blob>
  abort: () => void
}

export function createJpegRowWriter(input: {
  width: number
  height: number
  quality: number
  sink: JpegRowSink
}): JpegRowWriter {
  const rows: Uint8Array[] = []
  let writtenRows = 0
  let aborted = false

  return {
    writeRows(rgbRows, rowCount) {
      if (aborted) throw new Error('JPEG_WRITER_ABORTED')
      if (rowCount <= 0 || !Number.isInteger(rowCount)) {
        throw new Error('JPEG_INVALID_ROW_COUNT')
      }
      if (rgbRows.length !== input.width * rowCount * 3) {
        throw new Error('JPEG_ROW_LENGTH_MISMATCH')
      }
      if (writtenRows + rowCount > input.height) {
        throw new Error('JPEG_ROW_COUNT_EXCEEDED')
      }
      rows.push(new Uint8Array(rgbRows))
      writtenRows += rowCount
    },
    async close() {
      if (aborted) throw new Error('JPEG_WRITER_ABORTED')
      if (writtenRows !== input.height) {
        throw new Error('JPEG_INCOMPLETE_IMAGE')
      }
      return input.sink.encode({
        width: input.width,
        height: input.height,
        quality: input.quality,
        rows,
      })
    },
    abort() {
      aborted = true
      rows.length = 0
    },
  }
}
```

- [ ] **Step 3: Create JPEG runtime package shell**

Create `packages/luma-jpeg-runtime/package.json`:

```json
{
  "name": "@lumaforge/luma-jpeg-runtime",
  "type": "module",
  "version": "0.1.0",
  "private": true,
  "description": "Bounded row-oriented JPEG encoder runtime for LumaForge.",
  "sideEffects": [
    "./dist/*.worker.js"
  ],
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "vite build --config vite.config.ts && tsc -p tsconfig.json --emitDeclarationOnly",
    "test": "vitest run src worker",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  }
}
```

Create `packages/luma-jpeg-runtime/src/index.ts`:

```ts
export type {
  LumaJpegEncoder,
  LumaJpegEncoderOptions,
  LumaJpegRuntime,
} from './runtime'
export { createLumaJpegRuntime } from './runtime'
```

Create `packages/luma-jpeg-runtime/src/runtime.ts`:

```ts
export type LumaJpegEncoderOptions = {
  width: number
  height: number
  quality: number
}

export type LumaJpegEncoder = {
  writeRows: (rows: Uint8Array, rowCount: number) => Promise<void>
  finish: () => Promise<Blob>
  abort: () => void
}

export type LumaJpegRuntime = {
  createEncoder: (options: LumaJpegEncoderOptions) => LumaJpegEncoder
  dispose: () => void
}

export function createLumaJpegRuntime(): LumaJpegRuntime {
  throw new Error('JPEG_RUNTIME_UNAVAILABLE')
}
```

Create `packages/luma-jpeg-runtime/worker/runtime-core.ts`:

```ts
export type JpegWorkerRequest =
  | {
      id: string
      type: 'create'
      payload: { width: number; height: number; quality: number }
    }
  | { id: string; type: 'rows'; payload: { rows: Uint8Array; rowCount: number } }
  | { id: string; type: 'finish'; payload: Record<string, never> }
  | { id: string; type: 'abort'; payload: Record<string, never> }

export function createJpegRuntimeCore() {
  let width = 0
  let height = 0
  let writtenRows = 0

  return {
    async handleRequest(request: JpegWorkerRequest) {
      if (request.type === 'create') {
        width = request.payload.width
        height = request.payload.height
        writtenRows = 0
        return {
          id: request.id,
          ok: true,
          type: request.type,
          payload: { created: true },
        }
      }

      if (request.type === 'rows') {
        if (request.payload.rows.length !== width * request.payload.rowCount * 3) {
          throw new Error('JPEG_ROW_LENGTH_MISMATCH')
        }
        if (writtenRows + request.payload.rowCount > height) {
          throw new Error('JPEG_ROW_COUNT_EXCEEDED')
        }
        writtenRows += request.payload.rowCount
        return {
          id: request.id,
          ok: true,
          type: request.type,
          payload: { writtenRows },
        }
      }

      if (request.type === 'finish') {
        if (writtenRows !== height) throw new Error('JPEG_INCOMPLETE_IMAGE')
        throw new Error('JPEG_RUNTIME_UNAVAILABLE')
      }

      writtenRows = 0
      return {
        id: request.id,
        ok: true,
        type: request.type,
        payload: { aborted: true },
      }
    },
  }
}
```

This package must fail closed with `JPEG_RUNTIME_UNAVAILABLE` until a real row-oriented encoder is added. That failure must keep full-resolution export disabled in product state.

- [ ] **Step 4: Add product JPEG sink adapter**

Create `src/lib/export/jpeg/wasm-row-sink.ts`:

```ts
import {
  createLumaJpegRuntime,
  type LumaJpegRuntime,
} from '@lumaforge/luma-jpeg-runtime'

import type { JpegRowSink } from './row-writer'

export function createWasmJpegRowSink(
  runtime: LumaJpegRuntime = createLumaJpegRuntime(),
): JpegRowSink {
  return {
    async encode({ width, height, quality, rows }) {
      const encoder = runtime.createEncoder({ width, height, quality })
      try {
        for (const rowChunk of rows) {
          await encoder.writeRows(rowChunk, rowChunk.length / (width * 3))
        }
        return await encoder.finish()
      } finally {
        runtime.dispose()
      }
    },
  }
}
```

Create `src/lib/export/jpeg/wasm-row-sink.test.ts`:

```ts
import { createWasmJpegRowSink } from './wasm-row-sink'

it('forwards row chunks to the JPEG runtime', async () => {
  const calls: string[] = []
  const sink = createWasmJpegRowSink({
    createEncoder() {
      return {
        async writeRows() {
          calls.push('rows')
        },
        async finish() {
          calls.push('finish')
          return new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], {
            type: 'image/jpeg',
          })
        },
        abort() {
          calls.push('abort')
        },
      }
    },
    dispose() {
      calls.push('dispose')
    },
  })

  const blob = await sink.encode({
    width: 1,
    height: 1,
    quality: 0.9,
    rows: [new Uint8Array([255, 255, 255])],
  })

  expect(blob.type).toBe('image/jpeg')
  expect(calls).toEqual(['rows', 'finish', 'dispose'])
})
```

- [ ] **Step 5: Verify writer and sink tests**

Run:

```bash
pnpm test:run src/lib/export/jpeg/row-writer.test.ts src/lib/export/jpeg/wasm-row-sink.test.ts packages/luma-jpeg-runtime/worker/runtime-core.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/export/jpeg/row-writer.ts src/lib/export/jpeg/row-writer.test.ts src/lib/export/jpeg/wasm-row-sink.ts src/lib/export/jpeg/wasm-row-sink.test.ts packages/luma-jpeg-runtime
git commit -m "feat(export): define row-oriented JPEG runtime boundary"
```

---

### Task 7: Full-resolution export orchestrator and worker client

**Files:**

- Create: `src/lib/export/full-res-export.ts`
- Create: `src/lib/export/full-res-export.test.ts`
- Create: `src/lib/export/full-res-export.worker.ts`
- Create: `src/lib/export/full-res-export-client.ts`
- Create: `src/lib/export/full-res-export-client.test.ts`
- Create: `src/lib/raw/export-runtime-adapter.ts`
- Create: `src/lib/raw/export-runtime-adapter.test.ts`

- [ ] **Step 1: Write orchestrator tests**

Create `src/lib/export/full-res-export.test.ts`:

```ts
import { runFullResolutionJpegExport } from './full-res-export'

const capability = {
  supported: true,
  width: 4,
  height: 4,
  rawWidth: 4,
  rawHeight: 4,
  cfa: { pattern: 'rggb' as const, xPhase: 0 as const, yPhase: 0 as const },
  blackLevel: 0,
  whiteLevel: 255,
  orientation: 1,
  reasons: [],
}

it('fails closed when runtime capability is unsupported', async () => {
  await expect(
    runFullResolutionJpegExport({
      capability: { ...capability, supported: false, reasons: ['unsupported-cfa'] },
      readRawWindow: async () => {
        throw new Error('should not read')
      },
      graph: { supported: true, outputGamut: 'srgb-rec709', outputTransfer: 'srgb', lutProfile: null, steps: [{ kind: 'input-linear-prophoto' }, { kind: 'output-srgb' }] },
      quality: 0.9,
      createWriter: () => {
        throw new Error('should not create writer')
      },
      onProgress: () => undefined,
    }),
  ).rejects.toThrow('FULL_RES_EXPORT_UNSUPPORTED_SOURCE')
})

it('reports progress by completed strips', async () => {
  const progress: number[] = []
  const blob = await runFullResolutionJpegExport({
    capability,
    readRawWindow: async (rect) => ({
      rect,
      cfa: capability.cfa,
      blackLevel: 0,
      whiteLevel: 255,
      data: new Uint16Array(rect.width * rect.height).fill(128),
    }),
    graph: { supported: true, outputGamut: 'srgb-rec709', outputTransfer: 'srgb', lutProfile: null, steps: [{ kind: 'input-linear-prophoto' }, { kind: 'output-srgb' }] },
    quality: 0.9,
    preferredRows: 2,
    createWriter: () => {
      const rows: Uint8Array[] = []
      return {
        writeRows(row) {
          rows.push(row)
        },
        close: async () => new Blob(rows, { type: 'image/jpeg' }),
        abort() {
          rows.length = 0
        },
      }
    },
    onProgress: (event) => progress.push(event.progress),
  })

  expect(blob.type).toBe('image/jpeg')
  expect(progress.at(-1)).toBe(100)
})
```

- [ ] **Step 2: Implement orchestrator**

Create `src/lib/export/full-res-export.ts`:

```ts
import type {
  LumaRawExportCapability,
  LumaRawWindow,
  LumaRawWindowRect,
} from '@lumaforge/luma-raw-runtime'
import type { ExportColorGraphDescriptor } from './color-graph'
import { demosaicBilinearRgb } from './demosaic'
import type { JpegRowWriter } from './jpeg/row-writer'
import { planExportStrips } from './strip-scheduler'

export type FullResolutionExportProgress = {
  completedStrips: number
  totalStrips: number
  progress: number
}

export async function runFullResolutionJpegExport(input: {
  capability: LumaRawExportCapability
  readRawWindow: (rect: LumaRawWindowRect) => Promise<LumaRawWindow>
  graph: ExportColorGraphDescriptor
  quality: number
  preferredRows?: number
  createWriter: () => JpegRowWriter
  onProgress: (event: FullResolutionExportProgress) => void
  signal?: AbortSignal
}): Promise<Blob> {
  if (!input.capability.supported) {
    throw new Error('FULL_RES_EXPORT_UNSUPPORTED_SOURCE')
  }
  if (!input.graph.supported) {
    throw new Error('FULL_RES_EXPORT_UNSUPPORTED_PIPELINE')
  }

  const strips = planExportStrips({
    width: input.capability.width,
    height: input.capability.height,
    preferredRows: input.preferredRows ?? 512,
    minRows: 64,
    halo: 2,
  })
  const writer = input.createWriter()

  try {
    for (let index = 0; index < strips.length; index += 1) {
      if (input.signal?.aborted) throw new Error('FULL_RES_EXPORT_CANCELLED')
      const strip = strips[index]
      const rawWindow = await input.readRawWindow(strip.input)
      const linear = demosaicBilinearRgb({
        ...rawWindow,
        output: strip.output,
      })
      const rgbRows = new Uint8Array(linear.width * linear.height * 3)
      for (let i = 0; i < linear.width * linear.height; i += 1) {
        rgbRows[i * 3] = Math.round(Math.min(1, Math.max(0, linear.data[i * 3])) * 255)
        rgbRows[i * 3 + 1] = Math.round(Math.min(1, Math.max(0, linear.data[i * 3 + 1])) * 255)
        rgbRows[i * 3 + 2] = Math.round(Math.min(1, Math.max(0, linear.data[i * 3 + 2])) * 255)
      }
      writer.writeRows(rgbRows, linear.height)
      input.onProgress({
        completedStrips: index + 1,
        totalStrips: strips.length,
        progress: Math.round(((index + 1) / strips.length) * 100),
      })
    }
    return await writer.close()
  } catch (error) {
    writer.abort()
    throw error
  }
}
```

The first implementation writes the orchestration boundary. Task 8 replaces the direct linear-to-sRGB quantization with full graph execution.

- [ ] **Step 3: Implement raw export adapter**

Create `src/lib/raw/export-runtime-adapter.ts`:

```ts
import type {
  LumaRawDecodeSession,
  LumaRawExportCapability,
  LumaRawWindow,
  LumaRawWindowRect,
} from '@lumaforge/luma-raw-runtime'
import type { RawRuntimeSession } from './runtime-adapter'

export type RawExportSession = {
  probeExportCapability: (signal?: AbortSignal) => Promise<LumaRawExportCapability>
  readRawWindow: (rect: LumaRawWindowRect, signal?: AbortSignal) => Promise<LumaRawWindow>
}

export function createRawExportSession(session: LumaRawDecodeSession): RawExportSession {
  return {
    probeExportCapability(signal) {
      return session.probeExportCapability(signal)
    },
    readRawWindow(rect, signal) {
      return session.readRawWindow(rect, signal)
    },
  }
}

export function isRawExportSession(value: RawRuntimeSession): value is RawRuntimeSession & RawExportSession {
  return (
    typeof (value as Partial<RawExportSession>).probeExportCapability === 'function' &&
    typeof (value as Partial<RawExportSession>).readRawWindow === 'function'
  )
}
```

- [ ] **Step 4: Implement worker client**

Create `src/lib/export/full-res-export-client.ts` with a main-thread wrapper that sends `{ fileId, graph, quality }` to `full-res-export.worker.ts`, tracks progress events, and rejects with worker error messages. Use the same request-id pattern as `LumaRawWorkerClient`.

Create `src/lib/export/full-res-export.worker.ts` with message handlers for `start` and `cancel`. The worker must instantiate the Luma runtime itself from the transferred `File`, open a session, probe capability, and call `runFullResolutionJpegExport()`.

- [ ] **Step 5: Verify export tests**

Run:

```bash
pnpm test:run src/lib/export/full-res-export.test.ts src/lib/export/full-res-export-client.test.ts src/lib/raw/export-runtime-adapter.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/export/full-res-export.ts src/lib/export/full-res-export.test.ts src/lib/export/full-res-export.worker.ts src/lib/export/full-res-export-client.ts src/lib/export/full-res-export-client.test.ts src/lib/raw/export-runtime-adapter.ts src/lib/raw/export-runtime-adapter.test.ts
git commit -m "feat(export): add full-resolution export worker"
```

---

### Task 8: Execute full color graph in CPU export

**Files:**

- Modify: `src/lib/export/full-res-export.ts`
- Modify: `src/lib/export/color-graph.ts`
- Modify: `src/lib/export/lut3d.ts`
- Test: `src/lib/export/full-res-export.test.ts`
- Test: `src/lib/export/color-graph.test.ts`

- [ ] **Step 1: Add color execution tests**

Add to `src/lib/export/full-res-export.test.ts`:

```ts
it('uses the color graph before writing JPEG rows', async () => {
  const rows: Uint8Array[] = []
  await runFullResolutionJpegExport({
    capability,
    readRawWindow: async (rect) => ({
      rect,
      cfa: capability.cfa,
      blackLevel: 0,
      whiteLevel: 255,
      data: new Uint16Array(rect.width * rect.height).fill(255),
    }),
    graph: {
      supported: true,
      outputGamut: 'srgb-rec709',
      outputTransfer: 'srgb',
      lutProfile: null,
      steps: [
        { kind: 'input-linear-prophoto' },
        { kind: 'output-srgb' },
      ],
    },
    quality: 0.9,
    preferredRows: 2,
    createWriter: () => ({
      writeRows(row) {
        rows.push(row)
      },
      close: async () => new Blob(),
      abort() {},
    }),
    onProgress: () => undefined,
  })

  expect(rows[0][0]).toBe(255)
})
```

- [ ] **Step 2: Implement graph execution**

Add an internal function in `src/lib/export/full-res-export.ts`:

```ts
function applyGraphToRgbRows(
  linear: Float32Array,
  graph: Extract<ExportColorGraphDescriptor, { supported: true }>,
): Uint8Array {
  const out = new Uint8Array((linear.length / 3) * 3)
  for (let i = 0; i < linear.length; i += 3) {
    let r = linear[i]
    let g = linear[i + 1]
    let b = linear[i + 2]

    for (const step of graph.steps) {
      if (step.kind === 'gamut-to-lut-input' || step.kind === 'lut-output-to-srgb') {
        const m = step.matrix
        const nr = m[0] * r + m[1] * g + m[2] * b
        const ng = m[3] * r + m[4] * g + m[5] * b
        const nb = m[6] * r + m[7] * g + m[8] * b
        r = nr
        g = ng
        b = nb
      }
      if (step.kind === 'encode-lut-transfer') {
        const transfer = getTransferFunction(step.transfer)
        if (!transfer) throw new Error('FULL_RES_EXPORT_UNSUPPORTED_PIPELINE')
        r = transfer.encode(r)
        g = transfer.encode(g)
        b = transfer.encode(b)
      }
      if (step.kind === 'lut3d') {
        const sampled = sampleLutTrilinear(step.data, step.size, r, g, b)
        r = r + (sampled[0] - r) * step.intensity
        g = g + (sampled[1] - g) * step.intensity
        b = b + (sampled[2] - b) * step.intensity
      }
    }

    out[i] = toSrgbByte(r)
    out[i + 1] = toSrgbByte(g)
    out[i + 2] = toSrgbByte(b)
  }
  return out
}
```

Add helpers:

```ts
function toSrgbByte(linear: number) {
  const value = Math.min(1, Math.max(0, linear))
  const encoded = value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055
  return Math.round(Math.min(1, Math.max(0, encoded)) * 255)
}
```

Replace direct quantization in the strip loop with:

```ts
const rgbRows = applyGraphToRgbRows(linear.data, input.graph)
```

- [ ] **Step 3: Verify color export tests**

Run:

```bash
pnpm test:run src/lib/export/full-res-export.test.ts src/lib/export/color-graph.test.ts src/lib/export/lut3d.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/export/full-res-export.ts src/lib/export/full-res-export.test.ts src/lib/export/color-graph.ts src/lib/export/color-graph.test.ts src/lib/export/lut3d.ts
git commit -m "feat(export): apply scene-referred color graph in full-res export"
```

---

### Task 9: UI export gating and fail-closed product state

**Files:**

- Modify: `src/modules/raw-processor/model/session.ts`
- Modify: `src/modules/raw-processor/model/derive-session.ts`
- Modify: `src/modules/raw-processor/state/session.atoms.ts`
- Modify: `src/modules/raw-processor/hooks/useImageSession.ts`
- Modify: `src/modules/raw-processor/hooks/useRawProcessor.ts`
- Modify: `src/modules/raw-processor/services/export-system.ts`
- Modify: `src/modules/raw-processor/components/WorkspaceHeader.tsx`
- Modify: `src/modules/raw-processor/components/ControlsPanel.tsx`
- Modify: `src/modules/raw-processor/components/ProgressOverlay.tsx`
- Test: `src/modules/raw-processor/__tests__/session-derive.test.ts`
- Test: `src/modules/raw-processor/__tests__/export-system.test.ts`
- Test: `src/modules/raw-processor/hooks/useRawProcessor.test.tsx`

- [ ] **Step 1: Update session state tests**

Modify `src/modules/raw-processor/__tests__/session-derive.test.ts` so export is enabled by full-resolution capability, not HQ preview:

```ts
it('enables full-resolution export when raw-window export is supported without HQ preview', () => {
  const session = {
    ...baseSession,
    previewBundle: {
      ...baseSession.previewBundle,
      quickDecodePreview: { status: 'ready', width: 1200, height: 800 },
      hqImage: { status: 'failed', errorCode: 'RAW_HQ_DECODE_FAILED' },
    },
    exportState: {
      ...baseSession.exportState,
      fullResCapability: {
        status: 'supported',
        width: 6000,
        height: 4000,
      },
      status: 'idle',
    },
  }

  expect(deriveCanExport(session)).toBe(true)
})
```

- [ ] **Step 2: Update session model**

Modify `src/modules/raw-processor/model/session.ts`:

```ts
export type FullResExportCapabilityState =
  | { status: 'unknown' }
  | { status: 'probing' }
  | { status: 'supported'; width: number; height: number }
  | { status: 'unsupported'; reason: string }

export type PreviewBundle = {
  embeddedPreview: PreviewAsset
  quickDecodePreview: PreviewAsset
  hqImage: PreviewAsset
  displaySource: DisplaySource
  hqRequiredForExport: false
}
```

Add to `exportState`:

```ts
fullResCapability: FullResExportCapabilityState
lastProgress?: {
  completedStrips: number
  totalStrips: number
}
```

Initialize in `src/modules/raw-processor/hooks/useImageSession.ts`:

```ts
hqRequiredForExport: false,
```

and:

```ts
fullResCapability: { status: 'unknown' },
```

- [ ] **Step 3: Update deriveCanExport**

Modify `src/modules/raw-processor/model/derive-session.ts`:

```ts
export function deriveCanExport(session: ImageSession): boolean {
  return (
    session.exportState.fullResCapability.status === 'supported' &&
    session.renderState.status !== 'failed' &&
    session.exportState.status !== 'exporting'
  )
}
```

- [ ] **Step 4: Replace export service entrypoint**

Modify `src/modules/raw-processor/services/export-system.ts`:

```ts
import type { ExportColorGraphDescriptor } from '~/lib/export/color-graph'
import { createFullResolutionExportClient } from '~/lib/export/full-res-export-client'

export function buildExportFilename(inputName: string, styleName: string) {
  const basename = inputName.replace(/\.[^.]+$/, '')
  return `${basename}_${styleName}_fullres.jpg`
}

export async function runFullResolutionExportJob(input: {
  file: File
  filename: string
  graph: ExportColorGraphDescriptor
  quality: number
  onProgress: (progress: number) => void
  signal?: AbortSignal
}) {
  const client = createFullResolutionExportClient()
  try {
    const blob = await client.exportJpeg(input)
    return { filename: input.filename, blob }
  } finally {
    client.dispose()
  }
}
```

Keep `runExportJob()` only if it is renamed to `runPreviewExportJob()` and all UI copy identifies it as preview export.

- [ ] **Step 5: Wire `useRawProcessor`**

In `loadFile`, after opening the runtime session, call:

```ts
setSession((prev) =>
  prev && prev.id === nextSession.id
    ? {
        ...prev,
        exportState: {
          ...prev.exportState,
          fullResCapability: { status: 'probing' },
        },
      }
    : prev,
)

const capability = await activeRuntimeSession.probeExportCapability(runtimeSignal)

setSession((prev) =>
  prev && prev.id === nextSession.id
    ? {
        ...prev,
        exportState: {
          ...prev.exportState,
          fullResCapability: capability.supported
            ? { status: 'supported', width: capability.width, height: capability.height }
            : { status: 'unsupported', reason: capability.reasons[0] ?? 'unsupported-source' },
        },
      }
    : prev,
)
```

Update `exportImage()` so it:

```ts
const graph = resolveExportColorGraph({
  styleKind: params.styleKind,
  intensity: params.intensity,
  builtinPreset: params.builtinPreset,
  lut: lutData,
})

if (!graph.supported) {
  setError(graph.message)
  return
}

const result = await runFullResolutionExportJob({
  file: loadedImage.file,
  filename: buildExportFilename(sourceFileName, activeStyle?.name ?? 'neutral'),
  graph,
  quality: options.quality === 'high' ? 0.92 : 0.86,
  onProgress(progress) {
    setProgress(progress)
  },
})
```

Remove the requirement that `pipelineRef.current` renders a full-frame canvas before full-resolution export.

- [ ] **Step 6: Update UI copy**

Modify `WorkspaceHeader.tsx` button text:

```tsx
Full-res JPEG
```

Add a `disabledReason?: string` prop and show it near the header subtitle when export is disabled.

Modify `ControlsPanel.tsx` export button copy to distinguish:

```tsx
Full-resolution JPEG export
```

If preview export remains visible, label it:

```tsx
Preview JPEG
```

- [ ] **Step 7: Verify UI tests**

Run:

```bash
pnpm test:run src/modules/raw-processor/__tests__/session-derive.test.ts src/modules/raw-processor/__tests__/export-system.test.ts src/modules/raw-processor/hooks/useRawProcessor.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/modules/raw-processor/model/session.ts src/modules/raw-processor/model/derive-session.ts src/modules/raw-processor/state/session.atoms.ts src/modules/raw-processor/hooks/useImageSession.ts src/modules/raw-processor/hooks/useRawProcessor.ts src/modules/raw-processor/services/export-system.ts src/modules/raw-processor/components/WorkspaceHeader.tsx src/modules/raw-processor/components/ControlsPanel.tsx src/modules/raw-processor/components/ProgressOverlay.tsx src/modules/raw-processor/__tests__/session-derive.test.ts src/modules/raw-processor/__tests__/export-system.test.ts src/modules/raw-processor/hooks/useRawProcessor.test.tsx
git commit -m "feat(raw): gate full-res export on raw-window capability"
```

---

### Task 10: Resource failure handling and manual acceptance

**Files:**

- Modify: `src/lib/export/full-res-export.ts`
- Modify: `src/lib/export/full-res-export.test.ts`
- Modify: `src/lib/export/full-res-export-client.ts`
- Modify: `src/modules/raw-processor/hooks/useRawProcessor.ts`
- Modify: `docs/specs/2026-04-22-phase1-test-matrix.md`

- [ ] **Step 1: Add adaptive retry tests**

Add to `src/lib/export/full-res-export.test.ts`:

```ts
it('retries with smaller strips after resource failure without lowering output dimensions', async () => {
  let attempts = 0
  const blob = await runFullResolutionJpegExport({
    capability,
    readRawWindow: async (rect) => {
      attempts += 1
      if (attempts === 1) throw new Error('RESOURCE_ALLOCATION_FAILED')
      return {
        rect,
        cfa: capability.cfa,
        blackLevel: 0,
        whiteLevel: 255,
        data: new Uint16Array(rect.width * rect.height).fill(128),
      }
    },
    graph: { supported: true, outputGamut: 'srgb-rec709', outputTransfer: 'srgb', lutProfile: null, steps: [{ kind: 'input-linear-prophoto' }, { kind: 'output-srgb' }] },
    quality: 0.9,
    preferredRows: 4,
    createWriter: () => ({
      writeRows() {},
      close: async () => new Blob([new Uint8Array([1])], { type: 'image/jpeg' }),
      abort() {},
    }),
    onProgress: () => undefined,
  })

  expect(blob.type).toBe('image/jpeg')
  expect(attempts).toBeGreaterThan(1)
})
```

- [ ] **Step 2: Implement adaptive strip retry**

Modify `runFullResolutionJpegExport()` to wrap the strip loop in:

```ts
let preferredRows = input.preferredRows ?? 512
while (preferredRows >= 64) {
  try {
    return await runOnceWithRows(preferredRows)
  } catch (error) {
    if (!(error instanceof Error) || !/RESOURCE|ALLOCATION|memory/i.test(error.message)) {
      throw error
    }
    preferredRows = reduceStripRows(preferredRows, 64)
  }
}
throw new Error('FULL_RES_EXPORT_RESOURCE_FAILURE')
```

Keep output `width` and `height` unchanged for every retry.

- [ ] **Step 3: Add worker crash handling**

Modify `src/lib/export/full-res-export-client.ts` so `worker.onerror` and `worker.onmessageerror` reject pending export with:

```ts
new Error('FULL_RES_EXPORT_WORKER_FAILED')
```

Terminate the worker after either event.

- [ ] **Step 4: Add manual acceptance rows**

Append to `docs/specs/2026-04-22-phase1-test-matrix.md`:

```md
## High-resolution full-res export acceptance

| Fixture | Browser | Expected |
|---|---|---|
| 61MP RAW fixture | Chrome desktop | Full-res JPEG completes or fails closed without renderer crash |
| 61MP RAW fixture | Safari desktop | Full-res JPEG completes or fails closed without renderer crash |
| 100MP RAW fixture | Chrome desktop | Full-res JPEG completes or fails closed without renderer crash |
| Unsupported RAW-window source | Chrome desktop | Full-res export disabled with unsupported-source reason |
| Unknown LUT profile | Chrome desktop | Full-res export disabled until user selects LUT input |
```

- [ ] **Step 5: Run targeted tests**

Run:

```bash
pnpm test:run src/lib/export/full-res-export.test.ts src/lib/export/full-res-export-client.test.ts src/modules/raw-processor/hooks/useRawProcessor.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Run build**

Run:

```bash
pnpm build
```

Expected: Vite build completes.

- [ ] **Step 7: Manual browser acceptance**

Run:

```bash
pnpm dev --host 0.0.0.0
```

Manual checks:

- Load a 61MP RAW fixture.
- Confirm embedded or quick preview appears before HQ preview.
- Confirm full-resolution export button does not wait for HQ preview if raw-window capability is supported.
- Export full-resolution JPEG.
- Confirm exported JPEG dimensions match RAW output dimensions.
- Confirm browser page remains alive during and after export.
- Cancel one export and confirm editing state remains.
- Load an unsupported RAW-window source and confirm full-resolution export is disabled.

- [ ] **Step 8: Commit**

```bash
git add src/lib/export/full-res-export.ts src/lib/export/full-res-export.test.ts src/lib/export/full-res-export-client.ts src/modules/raw-processor/hooks/useRawProcessor.ts docs/specs/2026-04-22-phase1-test-matrix.md
git commit -m "fix(export): harden full-res export resource failures"
```

---

## Final verification

Run:

```bash
pnpm test:run packages/luma-raw-runtime/src/runtime.test.ts packages/luma-raw-runtime/worker/native-adapter.test.ts packages/luma-raw-runtime/worker/runtime-core.test.ts src/lib/export/color-graph.test.ts src/lib/export/strip-scheduler.test.ts src/lib/export/buffer-pool.test.ts src/lib/export/demosaic.test.ts src/lib/export/lut3d.test.ts src/lib/export/jpeg/row-writer.test.ts src/lib/export/full-res-export.test.ts src/lib/export/full-res-export-client.test.ts src/lib/raw/export-runtime-adapter.test.ts src/modules/raw-processor/__tests__/session-derive.test.ts src/modules/raw-processor/__tests__/export-system.test.ts src/modules/raw-processor/hooks/useRawProcessor.test.tsx
```

Expected: PASS.

Run:

```bash
pnpm --filter @lumaforge/luma-raw-runtime build:native
pnpm --filter @lumaforge/luma-raw-runtime test
pnpm build
```

Expected: all commands complete successfully.

Manual acceptance must cover desktop Chrome and Safari before claiming the high-resolution crash-prevention requirement is complete.

## Self-review

Spec coverage:

- Runtime raw-window access is covered by Tasks 1, 2, and 3.
- Strip scheduling, halo, bounded buffers, and no full-image surfaces are covered by Tasks 5, 7, and 10.
- Scene-referred LUT color graph is covered by Tasks 4 and 8.
- JPEG-only sRGB output is covered by Tasks 6, 7, and 8.
- Preview/export separation and HQ-preview independence are covered by Task 9.
- Fail-closed unsupported source and unsupported pipeline behavior is covered by Tasks 2, 4, 7, and 9.
- Resource failure and page-crash prevention are covered by Task 10.

Known implementation risk:

- The native raw-window prototype supports unpacked Bayer `raw_image` sources first. Compressed RAW formats or non-Bayer CFA must return unsupported capability until explicit runtime support exists.
- The row-writer boundary is intentionally isolated so the real JPEG sink can be swapped without changing strip processing or UI state.
