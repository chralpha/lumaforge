# Luma RAW Runtime Performance Optimization Implementation Plan

> 2026-04-24 correction: This document is superseded for native runtime readiness by `docs/specs/2026-04-24-luma-raw-runtime-independent-build-design.md` and `docs/plans/2026-04-24-luma-raw-runtime-independent-build-implementation-plan.md`. The V2 measurements remain historical prototype evidence, but they do not prove an independent Luma runtime because the native build linked against local `LibRaw-Wasm` artifacts and CI did not rebuild wasm from pinned sources.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current Luma RAW runtime from a functionally correct but slower replacement into a measured performance win by removing repeated file reads/transfers, replacing byte-by-byte JS-to-WASM copies, fixing embedded preview dimensions, capping quick output size, and adding rollout-grade telemetry.

**Architecture:** Keep `@lumaforge/luma-raw-runtime` as the independent package, but change its execution model from stateless per-stage jobs to a session-based decode pipeline. A session reads and transfers a RAW file once, loads it into native memory once, then reuses the native input buffer for embedded, quick, and HQ stages. Benchmarks must compare the app-equivalent legacy path against the session-based Luma path across all local fixtures before any default rollout.

**Tech Stack:** pnpm workspace, TypeScript 6, Vitest, Vite browser benchmark, Web Worker, Emscripten Embind, LibRaw, LCMS, WebGL2, Playwright/manual browser fixture runs

---

## Scope Guard

This plan is a follow-up to:

- [2026-04-23-luma-raw-runtime-migration-design.md](/workspaces/LumaForge/LumaForge/docs/specs/2026-04-23-luma-raw-runtime-migration-design.md)
- [2026-04-23-luma-raw-runtime-migration-implementation-plan.md](/workspaces/LumaForge/LumaForge/docs/plans/2026-04-23-luma-raw-runtime-migration-implementation-plan.md)

It assumes the migration implementation exists in the LumaForge migration branch/worktree, including:

- `packages/luma-raw-runtime`
- `src/lib/raw/luma-runtime-adapter.ts`
- `src/lib/raw/runtime-adapter.ts`
- RGB16 WebGL input support
- benchmark notes that blocked default rollout

Do not switch the default runtime to `luma` in this plan. The default switch remains gated by the final benchmark and manual validation task.

## Performance Diagnosis To Preserve

Current benchmark evidence showed the runtime was dominated by `openBuffer`:

```jsonl
{"runtime":"luma","stage":"embedded","file":"example-sony.ARW","width":0,"height":0,"total":5806,"timings":{"openBuffer":5746,"thumbnail":11,"readFile":46}}
{"runtime":"luma","stage":"quick","file":"example-sony.ARW","width":3120,"height":2084,"total":6442,"timings":{"openBuffer":5903,"unpack":499,"readFile":40}}
{"runtime":"luma","stage":"hq","file":"example-sony.ARW","width":6240,"height":4168,"total":6951,"timings":{"openBuffer":5863,"unpack":1047,"readFile":41}}
```

Root causes this plan targets:

- Native `openBuffer()` copies JS bytes one element at a time.
- Runtime public methods read and transfer the same `File` once per stage.
- Worker creates a fresh native processor per stage.
- Embedded preview returns `0x0` dimensions for JPEG thumbnails.
- Quick decode can output 6MP to 15MP, exceeding preview needs.
- Runtime-core clones output typed arrays that are already JS-owned.
- Benchmarks compare legacy full decode against Luma staged decode, not app-equivalent flows.
- `ALLOW_MEMORY_GROWTH=1` remains without heap telemetry.

## File Structure Map

### Runtime package files to modify

- Modify: `packages/luma-raw-runtime/src/types.ts`
  Add session types, expanded timings, heap telemetry, and quick decode options.

- Modify: `packages/luma-raw-runtime/src/worker-protocol.ts`
  Add `openSession`, session-scoped stage requests, `closeSession`, and heap stat payloads.

- Modify: `packages/luma-raw-runtime/src/worker-client.ts`
  Keep existing correlation behavior and support new request types.

- Modify: `packages/luma-raw-runtime/src/runtime.ts`
  Add `openSession(file)` and implement existing one-shot methods through temporary sessions.

- Modify: `packages/luma-raw-runtime/src/runtime.test.ts`
  Cover session open, single file transfer, stage calls by session ID, and close.

- Modify: `packages/luma-raw-runtime/worker/native-types.ts`
  Split native buffer loading from LibRaw open settings, add output cap options, and heap stats.

- Modify: `packages/luma-raw-runtime/worker/native-adapter.ts`
  Adapt the new native methods and expose heap byte size.

- Modify: `packages/luma-raw-runtime/worker/native-adapter.test.ts`
  Cover thumbnail dimension fallback, no output clone semantics, and heap stat adaptation.

- Modify: `packages/luma-raw-runtime/worker/runtime-core.ts`
  Store native sessions, reuse loaded buffers, add session-scoped stage execution, and report heap telemetry.

- Modify: `packages/luma-raw-runtime/worker/runtime-core.test.ts`
  Cover session reuse, cancellation, cleanup, and output-size caps.

- Modify: `packages/luma-raw-runtime/native/libraw_wrapper.cpp`
  Replace byte-by-byte copy, add `loadBuffer`, `openWithSettings`, thumbnail dimension fallback, output downsample, and one-copy output.

- Modify: `packages/luma-raw-runtime/native/emcc-flags.sh`
  Keep current flags initially, add explicit telemetry-friendly runtime exports only if needed by heap measurement.

- Modify: `packages/luma-raw-runtime/benchmarks/bench-runtime.ts`
  Compare app-equivalent legacy quick/HQ against Luma session embedded/quick/HQ and include all local fixtures.

- Modify: `packages/luma-raw-runtime/benchmarks/bench-runtime.html`
  Add multi-file benchmark UI and copyable JSONL output.

### App integration files to modify

- Modify: `src/lib/raw/luma-runtime-adapter.ts`
  Add session adapter and keep one-shot compatibility methods.

- Modify: `src/lib/raw/runtime-adapter.ts`
  Expose session path to the RAW processor hook while preserving legacy fallback.

- Modify: `src/modules/raw-processor/services/preview-pipeline.ts`
  Accept a prepared runtime session so embedded, quick, and HQ do not reopen the same file.

- Modify: `src/modules/raw-processor/hooks/useRawProcessor.ts`
  Open one runtime session per selected file, close it on replace/reset/cancel, and use quick output caps.

- Modify tests:
  - `src/lib/raw/runtime-adapter.test.ts`
  - `src/modules/raw-processor/__tests__/preview-pipeline.test.ts`
  - `src/modules/raw-processor/hooks/useRawProcessor.test.tsx`

### Validation docs to modify

- Modify: `docs/plans/2026-04-23-luma-raw-runtime-benchmark-notes.md`
  Replace blocked benchmark notes with new measurements and explicit rollout status.

- Modify: `docs/specs/2026-04-22-phase1-test-matrix.md`
  Add ARW, NEF, and 24MP-class Sony runtime migration validation rows.

## Task 1: Replace Benchmark With App-Equivalent Performance Baseline

**Files:**
- Modify: `packages/luma-raw-runtime/benchmarks/bench-runtime.html`
- Modify: `packages/luma-raw-runtime/benchmarks/bench-runtime.ts`
- Modify: `packages/luma-raw-runtime/fixtures/README.md`

- [ ] **Step 1: Write benchmark scope into fixture README**

Update `packages/luma-raw-runtime/fixtures/README.md`:

```md
# Luma RAW Runtime Fixtures

RAW fixtures are local developer assets and are not committed by default.

Run the browser benchmark against these local files:

- `/workspaces/LumaForge/LibRaw/LibRaw-Wasm/example-sony.ARW`
- `/workspaces/LumaForge/test-images/SGL00940.ARW`
- `/workspaces/LumaForge/test-images/SGL_1998.NEF`

Benchmark command:

```bash
pnpm --filter @lumaforge/luma-raw-runtime bench:serve
```

Open `http://localhost:4174/benchmarks/bench-runtime.html`, select all three RAW fixtures, and click `Run benchmark`.

The benchmark is app-equivalent:

- legacy quick uses `libraw-wasm` with `halfSize: true`
- legacy HQ uses the current Phase 1 large-file behavior: reuse quick for files at or above 32 MiB
- Luma uses one decode session per file
- Luma embedded, quick, and HQ timings are reported separately
- output JSONL includes file, size, megapixels, stage, width, height, total, read, transfer, copy, open, unpack/process, heap bytes, and target status
```

- [ ] **Step 2: Update benchmark HTML for multi-file input**

Modify `packages/luma-raw-runtime/benchmarks/bench-runtime.html` input and status area:

```html
<input
  id="fixture"
  type="file"
  multiple
  accept=".arw,.cr2,.cr3,.nef,.raf,.rw2,.orf,.dng,.pef,.srw,.3fr,.fff,.iiq,.raw"
/>
<button id="run" type="button">Run benchmark</button>
<button id="copy" type="button">Copy JSONL</button>
<pre id="output"></pre>
```

- [ ] **Step 3: Replace benchmark script with app-equivalent stages**

Replace `packages/luma-raw-runtime/benchmarks/bench-runtime.ts` with:

```ts
import LibRaw from 'libraw-wasm'

import { createLumaRawRuntime } from '../src/runtime'

const QUICK_PREVIEW_MAX_PIXELS = 2_500_000
const LARGE_RAW_SAFE_HQ_REUSE_BYTES = 32 * 1024 * 1024

type BenchStage =
  | 'legacy-quick'
  | 'legacy-hq'
  | 'luma-open-session'
  | 'luma-embedded'
  | 'luma-quick'
  | 'luma-hq'

type BenchRecord = {
  runtime: 'libraw-wasm' | 'luma'
  stage: BenchStage
  file: string
  fileSize: number
  megapixels?: number
  width?: number
  height?: number
  total: number
  targetStatus: 'within-target' | 'over-target' | 'baseline'
  timings?: Record<string, number | undefined>
  heap?: Record<string, number | undefined>
}

type BenchErrorRecord = {
  runtime: 'libraw-wasm' | 'luma'
  stage: BenchStage
  file: string
  fileSize: number
  error: string
}

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`Missing benchmark control: ${selector}`)
  return element
}

const input = required<HTMLInputElement>('#fixture')
const runButton = required<HTMLButtonElement>('#run')
const copyButton = required<HTMLButtonElement>('#copy')
const output = required<HTMLPreElement>('#output')

function targetStatus(stage: BenchStage, total: number, megapixels?: number): BenchRecord['targetStatus'] {
  if (stage === 'legacy-quick' || stage === 'legacy-hq') return 'baseline'
  if (stage === 'luma-embedded') return total < 1000 ? 'within-target' : 'over-target'
  if (stage === 'luma-quick') return total <= 4000 ? 'within-target' : 'over-target'
  if (stage === 'luma-hq' && (megapixels ?? 0) > 30) return 'baseline'
  if (stage === 'luma-hq') return total <= 8000 ? 'within-target' : 'over-target'
  return 'baseline'
}

function print(record: BenchRecord | BenchErrorRecord) {
  output.textContent += `${JSON.stringify(record)}\n`
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function terminateLibrawWorker(libraw: LibRaw) {
  const worker = (libraw as unknown as { worker?: unknown }).worker
  if (worker instanceof Worker) worker.terminate()
}

function outputMegapixels(width?: number, height?: number) {
  return width && height ? Number(((width * height) / 1_000_000).toFixed(2)) : undefined
}

async function legacyDecode(file: File, stage: 'legacy-quick' | 'legacy-hq') {
  const start = performance.now()
  const libraw = new LibRaw()

  try {
    const bytes = new Uint8Array(await file.arrayBuffer())
    await libraw.open(bytes, {
      halfSize: true,
      useCameraWb: true,
      outputColor: 1,
      outputBps: 16,
      noAutoBright: false,
    })
    const image = await libraw.imageData()
    const total = performance.now() - start
    print({
      runtime: 'libraw-wasm',
      stage,
      file: file.name,
      fileSize: file.size,
      width: image.width,
      height: image.height,
      megapixels: outputMegapixels(image.width, image.height),
      total,
      targetStatus: targetStatus(stage, total),
    })
  } catch (error) {
    print({
      runtime: 'libraw-wasm',
      stage,
      file: file.name,
      fileSize: file.size,
      error: errorMessage(error),
    })
  } finally {
    terminateLibrawWorker(libraw)
  }
}

async function benchLegacy(file: File) {
  await legacyDecode(file, 'legacy-quick')
  if (file.size >= LARGE_RAW_SAFE_HQ_REUSE_BYTES) {
    await legacyDecode(file, 'legacy-hq')
  } else {
    await legacyDecode(file, 'legacy-hq')
  }
}

async function benchLuma(file: File) {
  const runtime = createLumaRawRuntime({ requireCrossOriginIsolation: false })

  try {
    await runtime.init()

    const session = await runtime.openSession(file, {
      quickMaxOutputPixels: QUICK_PREVIEW_MAX_PIXELS,
    })

    print({
      runtime: 'luma',
      stage: 'luma-open-session',
      file: file.name,
      fileSize: file.size,
      width: session.probe.width,
      height: session.probe.height,
      megapixels: outputMegapixels(session.probe.width, session.probe.height),
      total: session.timings.total,
      targetStatus: 'baseline',
      timings: session.timings,
      heap: session.heap,
    })

    const embedded = await session.extractEmbeddedPreview()
    if (embedded) {
      print({
        runtime: 'luma',
        stage: 'luma-embedded',
        file: file.name,
        fileSize: file.size,
        width: embedded.width,
        height: embedded.height,
        megapixels: outputMegapixels(embedded.width, embedded.height),
        total: embedded.timings.total,
        targetStatus: targetStatus('luma-embedded', embedded.timings.total),
        timings: embedded.timings,
        heap: embedded.heap,
      })
    }

    const quick = await session.decodeQuick()
    print({
      runtime: 'luma',
      stage: 'luma-quick',
      file: file.name,
      fileSize: file.size,
      width: quick.width,
      height: quick.height,
      megapixels: outputMegapixels(quick.width, quick.height),
      total: quick.timings.total,
      targetStatus: targetStatus('luma-quick', quick.timings.total),
      timings: quick.timings,
      heap: quick.heap,
    })

    const hq = await session.decodeHq()
    const hqMegapixels = outputMegapixels(hq.width, hq.height)
    print({
      runtime: 'luma',
      stage: 'luma-hq',
      file: file.name,
      fileSize: file.size,
      width: hq.width,
      height: hq.height,
      megapixels: hqMegapixels,
      total: hq.timings.total,
      targetStatus: targetStatus('luma-hq', hq.timings.total, hqMegapixels),
      timings: hq.timings,
      heap: hq.heap,
    })

    session.dispose()
  } catch (error) {
    print({
      runtime: 'luma',
      stage: 'luma-open-session',
      file: file.name,
      fileSize: file.size,
      error: errorMessage(error),
    })
  } finally {
    runtime.dispose()
  }
}

async function run() {
  output.textContent = ''
  const files = [...(input.files ?? [])]
  if (files.length === 0) {
    output.textContent = 'Choose at least one RAW fixture.\n'
    return
  }

  runButton.disabled = true
  try {
    for (const file of files) {
      await benchLegacy(file)
      await benchLuma(file)
    }
  } finally {
    runButton.disabled = false
  }
}

runButton.addEventListener('click', () => {
  run().catch((error) => {
    output.textContent += `${errorMessage(error)}\n`
  })
})

copyButton.addEventListener('click', async () => {
  await navigator.clipboard.writeText(output.textContent || '')
})
```

- [ ] **Step 4: Run benchmark typecheck**

Run:

```bash
pnpm --filter @lumaforge/luma-raw-runtime typecheck
```

Expected:

```text
packages/luma-raw-runtime typecheck: Done
```

- [ ] **Step 5: Commit**

```bash
git add packages/luma-raw-runtime/benchmarks packages/luma-raw-runtime/fixtures/README.md
git commit -m "test(raw-runtime): align benchmark with app decode flow"
```

## Task 2: Replace Native Byte-By-Byte Input Copy With Bulk Copy

**Files:**
- Modify: `packages/luma-raw-runtime/native/libraw_wrapper.cpp`
- Modify: `packages/luma-raw-runtime/worker/native-types.ts`
- Modify: `packages/luma-raw-runtime/worker/native-adapter.ts`
- Modify: `packages/luma-raw-runtime/worker/runtime-core.ts`
- Modify: `packages/luma-raw-runtime/worker/runtime-core.test.ts`

- [ ] **Step 1: Add runtime-core timing test**

Add to `packages/luma-raw-runtime/worker/runtime-core.test.ts`:

```ts
it('reports copyToWasm and librawOpen timings separately when native provides them', async () => {
  const core = createRuntimeCore({
    createProcessor() {
      return {
        openBuffer() {
          return { copyToWasm: 7, librawOpen: 11 }
        },
        readMetadata() {
          return {
            width: 4000,
            height: 3000,
          }
        },
        extractThumbnail() {
          return undefined
        },
        decodePreview() {
          return {
            data: new Uint16Array([1, 2, 3]),
            width: 1,
            height: 1,
            bits: 16,
          }
        },
        decodeHq() {
          return {
            data: new Uint16Array([1, 2, 3]),
            width: 1,
            height: 1,
            bits: 16,
          }
        },
        dispose() {},
      }
    },
    heapBytes() {
      return 256 * 1024 * 1024
    },
  })

  const response = await core.handleRequest({
    id: 'job-copy-timing',
    type: 'decodeQuick',
    payload: {
      fileBuffer: new ArrayBuffer(4),
      fileName: 'sample.ARW',
      fileSize: 4,
    },
  })

  expect(response.ok && response.type === 'decodeQuick').toBe(true)
  if (!response.ok || response.type !== 'decodeQuick') return
  expect(response.payload.timings.copyToWasm).toBe(7)
  expect(response.payload.timings.librawOpen).toBe(11)
})
```

- [ ] **Step 2: Run failing timing test**

Run:

```bash
pnpm test:run packages/luma-raw-runtime/worker/runtime-core.test.ts -t "copyToWasm"
```

Expected:

```text
FAIL  packages/luma-raw-runtime/worker/runtime-core.test.ts > reports copyToWasm
```

- [ ] **Step 3: Extend timing and native types**

Modify `packages/luma-raw-runtime/src/types.ts`:

```ts
export type LumaRawTimings = {
  readFile?: number
  transferToWorker?: number
  copyToWasm?: number
  librawOpen?: number
  openBuffer?: number
  metadata?: number
  thumbnail?: number
  unpack?: number
  process?: number
  makeMemImage?: number
  outputCopy?: number
  transfer?: number
  total: number
}
```

Modify `packages/luma-raw-runtime/worker/native-types.ts`:

```ts
export type LumaRawNativeOpenTimings = {
  copyToWasm: number
  librawOpen: number
}

export type LumaRawNativeProcessor = {
  openBuffer(
    data: Uint8Array,
    settings: LumaRawNativeOpenSettings,
  ): LumaRawNativeOpenTimings
  readMetadata(): LumaRawNativeMetadata
  extractThumbnail(): LumaRawNativeThumbnail | undefined
  decodePreview(options?: LumaRawNativeDecodeOptions): LumaRawNativeImage
  decodeHq(options?: LumaRawNativeDecodeOptions): LumaRawNativeImage
  dispose(): void
}

export type LumaRawNativeFactory = {
  createProcessor(): LumaRawNativeProcessor
  heapBytes?(): number
}
```

- [ ] **Step 4: Adapt native return shape**

Modify `packages/luma-raw-runtime/worker/native-adapter.ts` `EmbindProcessor`:

```ts
type EmbindProcessor = {
  openBuffer: (
    data: Uint8Array,
    settings: LumaRawNativeOpenSettings,
  ) => unknown
  readMetadata: () => unknown
  extractThumbnail: () => unknown
  decodePreview: (options?: unknown) => unknown
  decodeHq: (options?: unknown) => unknown
  delete?: () => void
}
```

Add:

```ts
function normalizeOpenTimings(value: unknown) {
  const raw = asRecord(value)
  return {
    copyToWasm: asNumber(raw.copyToWasm) ?? 0,
    librawOpen: asNumber(raw.librawOpen) ?? 0,
  }
}
```

Change processor adapter:

```ts
openBuffer(data, settings) {
  return normalizeOpenTimings(processor.openBuffer(data, settings))
}
```

Change factory return:

```ts
return {
  createProcessor(): LumaRawNativeProcessor {
    const processor = new module.LumaRawProcessor()
    return {
      openBuffer(data, settings) {
        return normalizeOpenTimings(processor.openBuffer(data, settings))
      },
      readMetadata() {
        return normalizeMetadata(processor.readMetadata())
      },
      extractThumbnail() {
        return normalizeThumbnail(processor.extractThumbnail())
      },
      decodePreview(options) {
        return normalizeImage(processor.decodePreview(options))
      },
      decodeHq(options) {
        return normalizeImage(processor.decodeHq(options))
      },
      dispose() {
        processor.delete?.()
      },
    }
  },
  heapBytes() {
    const heap = (module as unknown as { HEAPU8?: Uint8Array }).HEAPU8
    return heap?.buffer.byteLength ?? 0
  },
}
```

- [ ] **Step 5: Record native timing fields in runtime-core**

Modify `packages/luma-raw-runtime/worker/runtime-core.ts` where `openBuffer` is called:

```ts
const openTimings = processor.openBuffer(
  new Uint8Array(request.payload.fileBuffer),
  settings,
)
timer.assign({
  copyToWasm: openTimings.copyToWasm,
  librawOpen: openTimings.librawOpen,
  openBuffer: openTimings.copyToWasm + openTimings.librawOpen,
})
```

Update `createTimer()` to support `assign`:

```ts
type Timer = {
  mark: (name: Exclude<keyof LumaRawTimings, 'total'>) => void
  assign: (values: Partial<LumaRawTimings>) => void
  finish: () => LumaRawTimings
}
```

Implementation:

```ts
assign(values) {
  Object.assign(timings, values)
  last = now()
}
```

- [ ] **Step 6: Replace byte loop in native wrapper**

Modify `packages/luma-raw-runtime/native/libraw_wrapper.cpp` imports:

```cpp
#include <emscripten.h>
```

Add:

```cpp
double nowMs() {
  return emscripten_get_now();
}

std::vector<unsigned char> copyInputBytes(val data) {
  const val Uint8Array = val::global("Uint8Array");
  const val ArrayBuffer = val::global("ArrayBuffer");

  val u8 = data.instanceof(Uint8Array)
               ? data
               : (data.instanceof(ArrayBuffer)
                      ? Uint8Array.new_(data)
                      : Uint8Array.new_(data["buffer"], data["byteOffset"], data["byteLength"]));

  const size_t length = u8["byteLength"].as<size_t>();
  std::vector<unsigned char> out(length);
  val wasmView = val(typed_memory_view(out.size(), out.data()));
  wasmView.call<void>("set", u8);
  return out;
}
```

Replace `openBuffer`:

```cpp
val openBuffer(val data, val settings) {
  processor_.recycle();
  processed_ = false;

  const double copy_start = nowMs();
  input_buffer_ = copyInputBytes(data);
  const double copy_end = nowMs();

  applySettings(settings);
  const double open_start = nowMs();
  requireLibRawSuccess(
      "LibRaw open_buffer",
      processor_.open_buffer(input_buffer_.data(), input_buffer_.size()));
  const double open_end = nowMs();

  val timings = val::object();
  timings.set("copyToWasm", copy_end - copy_start);
  timings.set("librawOpen", open_end - open_start);
  return timings;
}
```

- [ ] **Step 7: Rebuild native runtime and run tests**

Run:

```bash
. "$HOME/.cache/lumaforge-emsdk/emsdk_env.sh" >/dev/null
pnpm --filter @lumaforge/luma-raw-runtime build:native
pnpm test:run packages/luma-raw-runtime/worker/runtime-core.test.ts packages/luma-raw-runtime/worker/native-adapter.test.ts
```

Expected:

```text
Built Luma RAW native runtime into
PASS  packages/luma-raw-runtime/worker/runtime-core.test.ts
PASS  packages/luma-raw-runtime/worker/native-adapter.test.ts
```

- [ ] **Step 8: Commit**

```bash
git add packages/luma-raw-runtime/native packages/luma-raw-runtime/src/types.ts packages/luma-raw-runtime/worker
git commit -m "perf(raw-runtime): bulk copy raw input into wasm"
```

## Task 3: Add Session-Based Runtime API

**Files:**
- Modify: `packages/luma-raw-runtime/src/types.ts`
- Modify: `packages/luma-raw-runtime/src/worker-protocol.ts`
- Modify: `packages/luma-raw-runtime/src/runtime.ts`
- Modify: `packages/luma-raw-runtime/src/runtime.test.ts`
- Modify: `packages/luma-raw-runtime/worker/native-types.ts`
- Modify: `packages/luma-raw-runtime/worker/native-adapter.ts`
- Modify: `packages/luma-raw-runtime/worker/runtime-core.ts`
- Modify: `packages/luma-raw-runtime/worker/runtime-core.test.ts`
- Modify: `packages/luma-raw-runtime/native/libraw_wrapper.cpp`

- [ ] **Step 1: Write runtime session API test**

Add to `packages/luma-raw-runtime/src/runtime.test.ts`:

```ts
it('opens a session once and runs embedded, quick, and HQ by session id', async () => {
  const requests: string[] = []
  const worker = new EchoWorker((request) => {
    requests.push(request.type)

    if (request.type === 'openSession') {
      return {
        id: request.id,
        ok: true,
        type: 'openSession',
        payload: {
          sessionId: 'session-1',
          probe: {
            jobId: request.id,
            width: 6240,
            height: 4168,
            supportLevel: 'experimental',
            timings: { total: 10 },
          },
          timings: { readFile: 5, transferToWorker: 1, copyToWasm: 20, librawOpen: 30, total: 56 },
          heap: { before: 268435456, after: 268435456 },
        },
      }
    }

    if (request.type === 'extractEmbeddedPreviewFromSession') {
      return {
        id: request.id,
        ok: true,
        type: request.type,
        payload: {
          jobId: request.id,
          sessionId: 'session-1',
          source: 'embedded',
          width: 1616,
          height: 1080,
          data: new Uint8Array([1, 2, 3]),
          mimeType: 'image/jpeg',
          colorSpace: 'display-srgb-preview',
          orientation: 1,
          timings: { thumbnail: 7, total: 7 },
          heap: { before: 268435456, after: 268435456 },
        },
      }
    }

    if (request.type === 'decodeQuickFromSession' || request.type === 'decodeHqFromSession') {
      return {
        id: request.id,
        ok: true,
        type: request.type,
        payload: {
          jobId: request.id,
          sessionId: 'session-1',
          source: request.type === 'decodeHqFromSession' ? 'hq' : 'quick',
          width: 1000,
          height: 667,
          data: new Uint16Array(1000 * 667 * 3),
          layout: 'rgb',
          bitDepth: 16,
          colorSpace: 'linear-prophoto-rgb',
          orientation: 1,
          metadata: { width: 1000, height: 667, supportLevel: 'experimental' },
          timings: { unpack: 100, total: 100 },
          heap: { before: 268435456, after: 268435456 },
        },
      }
    }

    return {
      id: request.id,
      ok: true,
      type: 'closeSession',
      payload: { closed: true },
    }
  })

  const runtime = createLumaRawRuntime({
    requireCrossOriginIsolation: false,
    workerFactory: () => worker as unknown as Worker,
  })

  const session = await runtime.openSession(new File(['raw'], 'sample.ARW'))
  await session.extractEmbeddedPreview()
  await session.decodeQuick()
  await session.decodeHq()
  session.dispose()

  expect(requests).toEqual([
    'openSession',
    'extractEmbeddedPreviewFromSession',
    'decodeQuickFromSession',
    'decodeHqFromSession',
    'closeSession',
  ])
})
```

- [ ] **Step 2: Run failing session API test**

Run:

```bash
pnpm test:run packages/luma-raw-runtime/src/runtime.test.ts -t "opens a session once"
```

Expected:

```text
FAIL  packages/luma-raw-runtime/src/runtime.test.ts > opens a session once
```

- [ ] **Step 3: Add public session types**

Modify `packages/luma-raw-runtime/src/types.ts`:

```ts
export type LumaRawHeapStats = {
  before?: number
  after?: number
  peak?: number
}

export type LumaRawQuickOptions = {
  maxOutputPixels?: number
}

export type LumaRawSessionInfo = {
  sessionId: string
  probe: LumaRawProbe
  timings: LumaRawTimings
  heap?: LumaRawHeapStats
}

export type LumaRawDecodeSession = LumaRawSessionInfo & {
  extractEmbeddedPreview(signal?: AbortSignal): Promise<LumaEmbeddedPreview | null>
  decodeQuick(
    options?: LumaRawQuickOptions,
    signal?: AbortSignal,
  ): Promise<LumaRawFrame>
  decodeHq(signal?: AbortSignal): Promise<LumaRawFrame>
  dispose(): void
}
```

Extend `LumaEmbeddedPreview` and `LumaRawFrame`:

```ts
heap?: LumaRawHeapStats
```

Extend `LumaRawRuntime`:

```ts
openSession(
  file: File,
  options?: LumaRawQuickOptions,
  signal?: AbortSignal,
): Promise<LumaRawDecodeSession>
```

- [ ] **Step 4: Add protocol request types**

Modify `packages/luma-raw-runtime/src/worker-protocol.ts` request types:

```ts
export type LumaRawWorkerRequestType =
  | 'init'
  | 'openSession'
  | 'extractEmbeddedPreviewFromSession'
  | 'decodeQuickFromSession'
  | 'decodeHqFromSession'
  | 'closeSession'
  | 'probe'
  | 'extractEmbeddedPreview'
  | 'decodeQuick'
  | 'decodeHq'
  | 'cancel'
```

Add payload types:

```ts
export type LumaRawWorkerSessionPayload = {
  sessionId: string
}

export type LumaRawWorkerQuickSessionPayload = {
  sessionId: string
  maxOutputPixels?: number
}
```

Add request payload mappings:

```ts
openSession: LumaRawWorkerFilePayload & { maxOutputPixels?: number }
extractEmbeddedPreviewFromSession: LumaRawWorkerSessionPayload
decodeQuickFromSession: LumaRawWorkerQuickSessionPayload
decodeHqFromSession: LumaRawWorkerSessionPayload
closeSession: LumaRawWorkerSessionPayload
```

Add response payload mappings:

```ts
openSession: LumaRawSessionInfo
extractEmbeddedPreviewFromSession: LumaEmbeddedPreview | null
decodeQuickFromSession: LumaRawFrame
decodeHqFromSession: LumaRawFrame
closeSession: { closed: true }
```

- [ ] **Step 5: Implement runtime session facade**

Modify `packages/luma-raw-runtime/src/runtime.ts`:

```ts
async function openSession(
  file: File,
  options: LumaRawQuickOptions = {},
  signal?: AbortSignal,
): Promise<LumaRawDecodeSession> {
  const { fileBuffer, readFile } = await readFileBuffer(file, signal)
  const sessionInfo = await client.request(
    'openSession',
    {
      ...createFilePayload(file, fileBuffer),
      maxOutputPixels: options.maxOutputPixels,
    },
    [fileBuffer],
    signal,
  )

  const sessionId = sessionInfo.sessionId
  let disposed = false

  const closeSession = () => {
    if (disposed) return
    disposed = true
    void client.request('closeSession', { sessionId }).catch(() => {})
  }

  return {
    ...sessionInfo,
    timings: {
      ...sessionInfo.timings,
      readFile,
      total: sessionInfo.timings.total + readFile,
    },
    async extractEmbeddedPreview(stageSignal?: AbortSignal) {
      return client.request(
        'extractEmbeddedPreviewFromSession',
        { sessionId },
        [],
        stageSignal,
      )
    },
    async decodeQuick(stageOptions = options, stageSignal?: AbortSignal) {
      return client.request(
        'decodeQuickFromSession',
        {
          sessionId,
          maxOutputPixels: stageOptions.maxOutputPixels,
        },
        [],
        stageSignal,
      )
    },
    async decodeHq(stageSignal?: AbortSignal) {
      return client.request(
        'decodeHqFromSession',
        { sessionId },
        [],
        stageSignal,
      )
    },
    dispose: closeSession,
  }
}
```

Expose it in the returned runtime object:

```ts
openSession,
```

Reimplement one-shot methods through temporary sessions:

```ts
async decodeQuick(file, signal) {
  const session = await openSession(file, undefined, signal)
  try {
    return await session.decodeQuick(undefined, signal)
  } finally {
    session.dispose()
  }
}
```

Use the same pattern for `probe`, `extractEmbeddedPreview`, and `decodeHq`.

- [ ] **Step 6: Add native loaded-buffer methods**

Modify `packages/luma-raw-runtime/native/libraw_wrapper.cpp`:

```cpp
val loadBuffer(val data) {
  const double copy_start = nowMs();
  input_buffer_ = copyInputBytes(data);
  const double copy_end = nowMs();

  val timings = val::object();
  timings.set("copyToWasm", copy_end - copy_start);
  return timings;
}

val openWithSettings(val settings) {
  if (input_buffer_.empty()) {
    throw std::runtime_error("No RAW input buffer loaded.");
  }

  processor_.recycle();
  processed_ = false;
  applySettings(settings);

  const double open_start = nowMs();
  requireLibRawSuccess(
      "LibRaw open_buffer",
      processor_.open_buffer(input_buffer_.data(), input_buffer_.size()));
  const double open_end = nowMs();

  val timings = val::object();
  timings.set("copyToWasm", 0);
  timings.set("librawOpen", open_end - open_start);
  return timings;
}

val openBuffer(val data, val settings) {
  val copyTimings = loadBuffer(data);
  val openTimings = openWithSettings(settings);
  val timings = val::object();
  timings.set("copyToWasm", copyTimings["copyToWasm"]);
  timings.set("librawOpen", openTimings["librawOpen"]);
  return timings;
}
```

Add bindings:

```cpp
.function("loadBuffer", &LumaRawProcessor::loadBuffer)
.function("openWithSettings", &LumaRawProcessor::openWithSettings)
```

- [ ] **Step 7: Extend native adapter for loaded buffers**

Modify `packages/luma-raw-runtime/worker/native-types.ts`:

```ts
loadBuffer(data: Uint8Array): Pick<LumaRawNativeOpenTimings, 'copyToWasm'>
openWithSettings(settings: LumaRawNativeOpenSettings): LumaRawNativeOpenTimings
```

Modify `packages/luma-raw-runtime/worker/native-adapter.ts`:

```ts
loadBuffer(data) {
  return {
    copyToWasm: normalizeOpenTimings(processor.loadBuffer(data)).copyToWasm,
  }
},
openWithSettings(settings) {
  return normalizeOpenTimings(processor.openWithSettings(settings))
},
```

- [ ] **Step 8: Store sessions in runtime-core**

Modify `packages/luma-raw-runtime/worker/runtime-core.ts`:

```ts
type RuntimeSession = {
  sessionId: string
  processor: LumaRawNativeProcessor
  fileName: string
  fileSize: number
  maxOutputPixels?: number
  metadata?: LumaRawNativeMetadata
}

const sessions = new Map<string, RuntimeSession>()

function nextSessionId() {
  return `raw-session-${crypto.randomUUID()}`
}
```

Add helpers:

```ts
function openProcessorWithSettings(
  processor: LumaRawNativeProcessor,
  settings: LumaRawNativeOpenSettings,
  timer: Timer,
) {
  const openTimings = processor.openWithSettings(settings)
  timer.assign({
    copyToWasm: openTimings.copyToWasm,
    librawOpen: openTimings.librawOpen,
    openBuffer: openTimings.copyToWasm + openTimings.librawOpen,
  })
}

function requireSession(sessionId: string) {
  const session = sessions.get(sessionId)
  if (!session) {
    throw new LumaRawRuntimeError(
      'RAW_WORKER_PROTOCOL_ERROR',
      `Unknown RAW session: ${sessionId}`,
    )
  }
  return session
}
```

Handle `openSession`:

```ts
case 'openSession': {
  const timer = createTimer()
  const heapBefore = nativeFactory.heapBytes?.()
  const processor = nativeFactory.createProcessor()
  const copy = processor.loadBuffer(new Uint8Array(request.payload.fileBuffer))
  timer.assign({ copyToWasm: copy.copyToWasm })
  openProcessorWithSettings(processor, quickSettings, timer)
  const metadata = processor.readMetadata()
  timer.mark('metadata')

  const sessionId = nextSessionId()
  sessions.set(sessionId, {
    sessionId,
    processor,
    fileName: request.payload.fileName,
    fileSize: request.payload.fileSize,
    maxOutputPixels: request.payload.maxOutputPixels,
    metadata,
  })

  return {
    id: request.id,
    ok: true,
    type: 'openSession',
    payload: {
      sessionId,
      probe: createProbePayload(request.id, metadata, timer.finish()),
      timings: timer.finish(),
      heap: { before: heapBefore, after: nativeFactory.heapBytes?.() },
    },
  }
}
```

Handle close:

```ts
case 'closeSession': {
  const session = sessions.get(request.payload.sessionId)
  session?.processor.dispose()
  sessions.delete(request.payload.sessionId)
  return {
    id: request.id,
    ok: true,
    type: 'closeSession',
    payload: { closed: true },
  }
}
```

Handle session stages by reusing the loaded buffer:

```ts
case 'extractEmbeddedPreviewFromSession': {
  const session = requireSession(request.payload.sessionId)
  const timer = createTimer()
  const heapBefore = nativeFactory.heapBytes?.()
  openProcessorWithSettings(session.processor, quickSettings, timer)
  const metadata = session.processor.readMetadata()
  timer.mark('metadata')
  const thumbnail = session.processor.extractThumbnail()
  timer.mark('thumbnail')
  session.metadata = metadata
  return createEmbeddedResponse(request, metadata, thumbnail, timer.finish(), {
    before: heapBefore,
    after: nativeFactory.heapBytes?.(),
  })
}
```

Use the same session for quick and HQ:

```ts
const settings = request.type === 'decodeHqFromSession' ? hqSettings : quickSettings
openProcessorWithSettings(session.processor, settings, timer)
const metadata = session.processor.readMetadata()
timer.mark('metadata')
const image =
  request.type === 'decodeHqFromSession'
    ? session.processor.decodeHq()
    : session.processor.decodePreview({ maxOutputPixels: request.payload.maxOutputPixels ?? session.maxOutputPixels })
timer.mark('unpack')
```

- [ ] **Step 9: Run session tests**

Run:

```bash
. "$HOME/.cache/lumaforge-emsdk/emsdk_env.sh" >/dev/null
pnpm --filter @lumaforge/luma-raw-runtime build:native
pnpm test:run packages/luma-raw-runtime/src/runtime.test.ts packages/luma-raw-runtime/worker/runtime-core.test.ts packages/luma-raw-runtime/worker/native-adapter.test.ts
```

Expected:

```text
Built Luma RAW native runtime into
PASS  packages/luma-raw-runtime/src/runtime.test.ts
PASS  packages/luma-raw-runtime/worker/runtime-core.test.ts
PASS  packages/luma-raw-runtime/worker/native-adapter.test.ts
```

- [ ] **Step 10: Commit**

```bash
git add packages/luma-raw-runtime
git commit -m "perf(raw-runtime): reuse raw input across decode session"
```

## Task 4: Fix Embedded Preview Dimensions and Avoid Extra Output Clones

**Files:**
- Modify: `packages/luma-raw-runtime/native/libraw_wrapper.cpp`
- Modify: `packages/luma-raw-runtime/worker/runtime-core.ts`
- Modify: `packages/luma-raw-runtime/worker/native-adapter.test.ts`
- Modify: `packages/luma-raw-runtime/worker/runtime-core.test.ts`

- [ ] **Step 1: Add native-adapter thumbnail fallback test**

Add to `packages/luma-raw-runtime/worker/native-adapter.test.ts`:

```ts
it('normalizes JPEG thumbnail dimensions from metadata fallback fields', () => {
  const module = {
    LumaRawProcessor: class {
      openBuffer() {
        return { copyToWasm: 1, librawOpen: 2 }
      }
      loadBuffer() {
        return { copyToWasm: 1 }
      }
      openWithSettings() {
        return { copyToWasm: 0, librawOpen: 2 }
      }
      readMetadata() {
        return {}
      }
      extractThumbnail() {
        return {
          data: new Uint8Array([1, 2, 3]),
          width: 0,
          height: 0,
          thumbWidth: 1616,
          thumbHeight: 1080,
          format: 'jpeg',
        }
      }
      decodePreview() {
        return { data: new Uint16Array([1, 2, 3]), width: 1, height: 1 }
      }
      decodeHq() {
        return { data: new Uint16Array([1, 2, 3]), width: 1, height: 1 }
      }
    },
  }

  const processor = createNativeFactory(module).createProcessor()
  expect(processor.extractThumbnail()).toMatchObject({
    width: 1616,
    height: 1080,
    format: 'jpeg',
  })
})
```

- [ ] **Step 2: Add runtime-core no-clone test**

Add to `packages/luma-raw-runtime/worker/runtime-core.test.ts`:

```ts
it('keeps native-owned output buffers without cloning in runtime-core', async () => {
  const nativeData = new Uint16Array([1, 2, 3])
  const core = createRuntimeCore({
    createProcessor() {
      return {
        openBuffer() {
          return { copyToWasm: 1, librawOpen: 1 }
        },
        loadBuffer() {
          return { copyToWasm: 1 }
        },
        openWithSettings() {
          return { copyToWasm: 0, librawOpen: 1 }
        },
        readMetadata() {
          return { width: 1, height: 1 }
        },
        extractThumbnail() {
          return undefined
        },
        decodePreview() {
          return { data: nativeData, width: 1, height: 1, bits: 16 }
        },
        decodeHq() {
          return { data: nativeData, width: 1, height: 1, bits: 16 }
        },
        dispose() {},
      }
    },
  })

  const response = await core.handleRequest({
    id: 'job-no-clone',
    type: 'decodeQuick',
    payload: {
      fileBuffer: new ArrayBuffer(4),
      fileName: 'sample.ARW',
      fileSize: 4,
    },
  })

  expect(response.ok && response.type === 'decodeQuick').toBe(true)
  if (!response.ok || response.type !== 'decodeQuick') return
  expect(response.payload.data).toBe(nativeData)
})
```

- [ ] **Step 3: Run failing tests**

Run:

```bash
pnpm test:run packages/luma-raw-runtime/worker/native-adapter.test.ts packages/luma-raw-runtime/worker/runtime-core.test.ts -t "thumbnail dimensions|without cloning"
```

Expected:

```text
FAIL  packages/luma-raw-runtime/worker/native-adapter.test.ts
FAIL  packages/luma-raw-runtime/worker/runtime-core.test.ts
```

- [ ] **Step 4: Fix native thumbnail dimensions**

Modify `packages/luma-raw-runtime/native/libraw_wrapper.cpp` in `extractThumbnail()`:

```cpp
const int fallback_width = processor_.imgdata.thumbnail.twidth;
const int fallback_height = processor_.imgdata.thumbnail.theight;
const int width = image->width > 0 ? image->width : fallback_width;
const int height = image->height > 0 ? image->height : fallback_height;

thumbnail.set("data", copiedUint8Array(image->data, image->data_size));
thumbnail.set("width", width);
thumbnail.set("height", height);
thumbnail.set("thumbWidth", fallback_width);
thumbnail.set("thumbHeight", fallback_height);
thumbnail.set("format", processedImageFormat(image->type));
```

- [ ] **Step 5: Fix native-adapter thumbnail fallback**

Modify `packages/luma-raw-runtime/worker/native-adapter.ts` `normalizeThumbnail()`:

```ts
const width = asNumber(raw.width) || asNumber(raw.thumbWidth) || 0
const height = asNumber(raw.height) || asNumber(raw.thumbHeight) || 0

return {
  data: raw.data,
  width,
  height,
  format,
}
```

- [ ] **Step 6: Remove runtime-core output clones**

Modify `packages/luma-raw-runtime/worker/runtime-core.ts`:

```ts
function createFramePayload(
  request: LumaRawWorkerRequest<'decodeQuick' | 'decodeHq' | 'decodeQuickFromSession' | 'decodeHqFromSession'>,
  nativeMetadata: LumaRawNativeMetadata,
  image: LumaRawNativeImage,
  timings: LumaRawTimings,
  heap?: LumaRawHeapStats,
): LumaRawFrame {
  const metadata = toMetadata(nativeMetadata)
  return {
    jobId: request.id,
    sessionId: request.payload.sessionId,
    source:
      request.type === 'decodeHq' || request.type === 'decodeHqFromSession'
        ? 'hq'
        : 'quick',
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
    heap,
  }
}
```

For embedded payload, use:

```ts
data: thumbnail.data,
```

Remove `cloneUint8Array()` and `cloneUint16Array()` helpers.

- [ ] **Step 7: Avoid native double-copy for full-size output**

Modify `packages/luma-raw-runtime/native/libraw_wrapper.cpp` `decodeImage()` full-size path:

```cpp
const uint16_t *source = reinterpret_cast<const uint16_t *>(image->data);
output.set("data", copiedUint16Array(source, sample_count));
output.set("width", image->width);
output.set("height", image->height);
return output;
```

Do not allocate `std::vector<uint16_t> rgb` when no downsample is requested.

- [ ] **Step 8: Rebuild and run tests**

Run:

```bash
. "$HOME/.cache/lumaforge-emsdk/emsdk_env.sh" >/dev/null
pnpm --filter @lumaforge/luma-raw-runtime build:native
pnpm test:run packages/luma-raw-runtime/worker/native-adapter.test.ts packages/luma-raw-runtime/worker/runtime-core.test.ts
```

Expected:

```text
Built Luma RAW native runtime into
PASS  packages/luma-raw-runtime/worker/native-adapter.test.ts
PASS  packages/luma-raw-runtime/worker/runtime-core.test.ts
```

- [ ] **Step 9: Commit**

```bash
git add packages/luma-raw-runtime/native packages/luma-raw-runtime/worker
git commit -m "perf(raw-runtime): fix thumbnail metadata and output copies"
```

## Task 5: Cap Quick Output Pixels In Native

**Files:**
- Modify: `packages/luma-raw-runtime/native/libraw_wrapper.cpp`
- Modify: `packages/luma-raw-runtime/worker/native-types.ts`
- Modify: `packages/luma-raw-runtime/worker/native-adapter.ts`
- Modify: `packages/luma-raw-runtime/worker/runtime-core.ts`
- Modify: `packages/luma-raw-runtime/worker/runtime-core.test.ts`

- [ ] **Step 1: Add quick cap runtime-core test**

Add to `packages/luma-raw-runtime/worker/runtime-core.test.ts`:

```ts
it('passes quick maxOutputPixels to native decodePreview', async () => {
  let receivedMaxOutputPixels: number | undefined

  const core = createRuntimeCore({
    createProcessor() {
      return {
        openBuffer() {
          return { copyToWasm: 1, librawOpen: 1 }
        },
        loadBuffer() {
          return { copyToWasm: 1 }
        },
        openWithSettings() {
          return { copyToWasm: 0, librawOpen: 1 }
        },
        readMetadata() {
          return { width: 6000, height: 4000 }
        },
        extractThumbnail() {
          return undefined
        },
        decodePreview(options) {
          receivedMaxOutputPixels = options?.maxOutputPixels
          return {
            data: new Uint16Array(1500 * 1000 * 3),
            width: 1500,
            height: 1000,
            bits: 16,
          }
        },
        decodeHq() {
          return {
            data: new Uint16Array(6000 * 4000 * 3),
            width: 6000,
            height: 4000,
            bits: 16,
          }
        },
        dispose() {},
      }
    },
  })

  const opened = await core.handleRequest({
    id: 'job-open-session',
    type: 'openSession',
    payload: {
      fileBuffer: new ArrayBuffer(4),
      fileName: 'sample.ARW',
      fileSize: 4,
      maxOutputPixels: 2_500_000,
    },
  })
  expect(opened.ok && opened.type === 'openSession').toBe(true)
  if (!opened.ok || opened.type !== 'openSession') return

  const response = await core.handleRequest({
    id: 'job-quick-session',
    type: 'decodeQuickFromSession',
    payload: {
      sessionId: opened.payload.sessionId,
      maxOutputPixels: 2_500_000,
    },
  })

  expect(response.ok && response.type === 'decodeQuickFromSession').toBe(true)
  expect(receivedMaxOutputPixels).toBe(2_500_000)
})
```

- [ ] **Step 2: Run failing quick cap test**

Run:

```bash
pnpm test:run packages/luma-raw-runtime/worker/runtime-core.test.ts -t "quick maxOutputPixels"
```

Expected:

```text
FAIL  packages/luma-raw-runtime/worker/runtime-core.test.ts > quick maxOutputPixels
```

- [ ] **Step 3: Add native decode option type**

Modify `packages/luma-raw-runtime/worker/native-types.ts`:

```ts
export type LumaRawNativeDecodeOptions = {
  maxOutputPixels?: number
}
```

Use it in `decodePreview(options?: LumaRawNativeDecodeOptions)` and `decodeHq(options?: LumaRawNativeDecodeOptions)`.

- [ ] **Step 4: Add C++ output-size planner**

Modify `packages/luma-raw-runtime/native/libraw_wrapper.cpp`:

```cpp
struct OutputSize {
  int width;
  int height;
};

OutputSize planOutputSize(int width, int height, int max_pixels) {
  if (max_pixels <= 0 || static_cast<double>(width) * height <= max_pixels) {
    return {width, height};
  }

  const double scale = std::sqrt(static_cast<double>(max_pixels) / (static_cast<double>(width) * height));
  int out_width = std::max(1, static_cast<int>(std::floor(width * scale)));
  int out_height = std::max(1, static_cast<int>(std::floor(height * scale)));

  while (static_cast<double>(out_width) * out_height > max_pixels) {
    if (out_width >= out_height) {
      --out_width;
    } else {
      --out_height;
    }
  }

  return {out_width, out_height};
}

int maxOutputPixelsFromOptions(val options) {
  if (options.isNull() || options.isUndefined()) return 0;
  if (!options.hasOwnProperty("maxOutputPixels")) return 0;
  return options["maxOutputPixels"].as<int>();
}
```

Add includes:

```cpp
#include <cmath>
```

- [ ] **Step 5: Downsample RGB16 output in native**

Change native methods:

```cpp
val decodePreview(val options = val::undefined()) {
  return decodeImage(maxOutputPixelsFromOptions(options));
}

val decodeHq(val options = val::undefined()) {
  return decodeImage(maxOutputPixelsFromOptions(options));
}
```

Change `decodeImage()` signature:

```cpp
val decodeImage(int max_output_pixels) {
```

After validating `byte_count`, add:

```cpp
const OutputSize output_size = planOutputSize(image->width, image->height, max_output_pixels);
const uint16_t *source = reinterpret_cast<const uint16_t *>(image->data);

if (output_size.width == image->width && output_size.height == image->height) {
  output.set("data", copiedUint16Array(source, sample_count));
  output.set("width", image->width);
  output.set("height", image->height);
  return output;
}

const size_t output_pixel_count =
    checkedMultiply(static_cast<size_t>(output_size.width),
                    static_cast<size_t>(output_size.height),
                    "Luma RAW downsample pixel count");
std::vector<uint16_t> resized(output_pixel_count * 3);

for (int y = 0; y < output_size.height; ++y) {
  const int source_y = std::min(
      image->height - 1,
      static_cast<int>(std::floor(((static_cast<double>(y) + 0.5) * image->height) / output_size.height)));
  for (int x = 0; x < output_size.width; ++x) {
    const int source_x = std::min(
        image->width - 1,
        static_cast<int>(std::floor(((static_cast<double>(x) + 0.5) * image->width) / output_size.width)));
    const size_t src = (static_cast<size_t>(source_y) * image->width + source_x) * 3;
    const size_t dst = (static_cast<size_t>(y) * output_size.width + x) * 3;
    resized[dst] = source[src];
    resized[dst + 1] = source[src + 1];
    resized[dst + 2] = source[src + 2];
  }
}

output.set("data", copiedUint16Array(resized.data(), resized.size()));
output.set("width", output_size.width);
output.set("height", output_size.height);
return output;
```

- [ ] **Step 6: Pass options through native adapter**

Modify `packages/luma-raw-runtime/worker/native-adapter.ts`:

```ts
decodePreview(options) {
  return normalizeImage(processor.decodePreview(options))
},
decodeHq(options) {
  return normalizeImage(processor.decodeHq(options))
},
```

- [ ] **Step 7: Pass options from runtime-core**

In `decodeQuickFromSession` and one-shot `decodeQuick`, call:

```ts
processor.decodePreview({
  maxOutputPixels:
    request.payload.maxOutputPixels ??
    session.maxOutputPixels ??
    2_500_000,
})
```

Do not cap HQ unless an explicit HQ option is added later.

- [ ] **Step 8: Rebuild and run tests**

Run:

```bash
. "$HOME/.cache/lumaforge-emsdk/emsdk_env.sh" >/dev/null
pnpm --filter @lumaforge/luma-raw-runtime build:native
pnpm test:run packages/luma-raw-runtime/worker/runtime-core.test.ts packages/luma-raw-runtime/worker/native-adapter.test.ts
```

Expected:

```text
Built Luma RAW native runtime into
PASS  packages/luma-raw-runtime/worker/runtime-core.test.ts
PASS  packages/luma-raw-runtime/worker/native-adapter.test.ts
```

- [ ] **Step 9: Commit**

```bash
git add packages/luma-raw-runtime/native packages/luma-raw-runtime/worker
git commit -m "perf(raw-runtime): cap quick rgb16 output size"
```

## Task 6: Use One Runtime Session In The App Preview Pipeline

**Files:**
- Modify: `src/lib/raw/luma-runtime-adapter.ts`
- Modify: `src/lib/raw/runtime-adapter.ts`
- Modify: `src/lib/raw/runtime-adapter.test.ts`
- Modify: `src/modules/raw-processor/services/preview-pipeline.ts`
- Modify: `src/modules/raw-processor/__tests__/preview-pipeline.test.ts`
- Modify: `src/modules/raw-processor/hooks/useRawProcessor.ts`
- Modify: `src/modules/raw-processor/hooks/useRawProcessor.test.tsx`

- [ ] **Step 1: Add raw adapter session test**

Add to `src/lib/raw/runtime-adapter.test.ts`:

```ts
it('opens one luma session and decodes stages without rereading the file', async () => {
  const extractEmbeddedPreview = vi.fn().mockResolvedValue(null)
  const decodeQuick = vi.fn().mockResolvedValue(makeLumaFrame('quick'))
  const decodeHq = vi.fn().mockResolvedValue(makeLumaFrame('hq'))
  const dispose = vi.fn()
  const runtime = makeLumaRuntime({
    openSession: vi.fn().mockResolvedValue({
      sessionId: 'session-1',
      probe: {
        jobId: 'probe',
        width: 6240,
        height: 4168,
        supportLevel: 'experimental',
        timings: { total: 1 },
      },
      timings: { total: 1 },
      extractEmbeddedPreview,
      decodeQuick,
      decodeHq,
      dispose,
    }),
  })

  const adapter = createRawRuntimeAdapter({
    runtimeKind: 'luma',
    lumaRuntimeFactory: () => runtime,
  })

  const session = await adapter.openSession(new File(['raw'], 'sample.ARW'))
  await session.extractEmbeddedPreview()
  await session.decodeQuickRaw()
  await session.decodeHqRaw()
  session.dispose()

  expect(runtime.openSession).toHaveBeenCalledTimes(1)
  expect(extractEmbeddedPreview).toHaveBeenCalledTimes(1)
  expect(decodeQuick).toHaveBeenCalledTimes(1)
  expect(decodeHq).toHaveBeenCalledTimes(1)
  expect(dispose).toHaveBeenCalledTimes(1)
})
```

Define helper in the test file:

```ts
function makeLumaFrame(source: 'quick' | 'hq') {
  return {
    jobId: `${source}-1`,
    source,
    width: 1,
    height: 1,
    data: new Uint16Array([0, 32768, 65535]),
    layout: 'rgb' as const,
    bitDepth: 16 as const,
    colorSpace: 'linear-prophoto-rgb' as const,
    orientation: 1,
    metadata: {
      width: 1,
      height: 1,
      supportLevel: 'experimental' as const,
    },
    timings: { total: 1 },
  }
}
```

- [ ] **Step 2: Run failing adapter session test**

Run:

```bash
pnpm test:run src/lib/raw/runtime-adapter.test.ts -t "opens one luma session"
```

Expected:

```text
FAIL  src/lib/raw/runtime-adapter.test.ts > opens one luma session
```

- [ ] **Step 3: Add app adapter session contract**

Modify `src/lib/raw/runtime-adapter.ts`:

```ts
export type RawRuntimeSession = {
  extractEmbeddedPreview(): Promise<LumaEmbeddedPreview | null>
  decodeQuickRaw(onProgress?: ProgressCallback): Promise<DecodedImage>
  decodeHqRaw(onProgress?: ProgressCallback): Promise<DecodedImage>
  dispose(): void
}

export type RawRuntimeAdapter = {
  openSession(file: File): Promise<RawRuntimeSession>
  extractEmbeddedPreview(file: File): Promise<LumaEmbeddedPreview | null>
  decodeQuickRaw(file: File, onProgress?: ProgressCallback): Promise<DecodedImage>
  decodeHqRaw(file: File, onProgress?: ProgressCallback): Promise<DecodedImage>
}
```

- [ ] **Step 4: Implement luma session adapter**

Modify `src/lib/raw/luma-runtime-adapter.ts`:

```ts
export async function openRawSessionWithLuma(
  file: File,
  runtimeFactory?: () => LumaRawRuntime,
): Promise<RawRuntimeSession> {
  const runtime = getRuntime(runtimeFactory)
  await runtime.init()
  const session = await runtime.openSession(file, {
    maxOutputPixels: QUICK_PREVIEW_MAX_PIXELS,
  })

  return {
    extractEmbeddedPreview() {
      return session.extractEmbeddedPreview()
    },
    async decodeQuickRaw(onProgress?: ProgressCallback) {
      onProgress?.({ phase: 'decoding', progress: 50 })
      const frame = await session.decodeQuick({
        maxOutputPixels: QUICK_PREVIEW_MAX_PIXELS,
      })
      onProgress?.({ phase: 'complete', progress: 100 })
      return frameToDecodedImage(frame)
    },
    async decodeHqRaw(onProgress?: ProgressCallback) {
      onProgress?.({ phase: 'decoding', progress: 50 })
      const frame = await session.decodeHq()
      onProgress?.({ phase: 'complete', progress: 100 })
      return frameToDecodedImage(frame)
    },
    dispose() {
      session.dispose()
    },
  }
}
```

Import `QUICK_PREVIEW_MAX_PIXELS` from `./decoder`.

- [ ] **Step 5: Implement legacy session adapter**

Modify `src/lib/raw/runtime-adapter.ts` legacy branch:

```ts
openSession(file) {
  return Promise.resolve({
    extractEmbeddedPreview() {
      return Promise.resolve(null)
    },
    decodeQuickRaw(onProgress) {
      return decodeQuickRawLegacy(file, onProgress)
    },
    decodeHqRaw(onProgress) {
      return decodeHqRawLegacy(file, onProgress)
    },
    dispose() {},
  })
}
```

Modify luma branch:

```ts
openSession(file) {
  return openRawSessionWithLuma(file, lumaRuntimeFactory)
}
```

- [ ] **Step 6: Update preview pipeline to use prepared session**

Modify `src/modules/raw-processor/services/preview-pipeline.ts` signature:

```ts
export async function runPreviewPipeline({
  runtimeSession,
  onEvent,
}: {
  runtimeSession: {
    extractEmbeddedPreview(): Promise<EmbeddedPreviewPayload | null>
    decodeQuickRaw(): Promise<{ width: number; height: number }>
    decodeHqRaw(): Promise<{ width: number; height: number }>
  }
  onEvent: (event: PreviewEvent) => void
}) {
  let embedded: EmbeddedPreviewPayload | null = null
  try {
    embedded = await runtimeSession.extractEmbeddedPreview()
  } catch {
    embedded = null
  }

  if (embedded) {
    onEvent({ type: 'embedded-ready', ...embedded })
  }

  const quick = await runtimeSession.decodeQuickRaw()
  onEvent({ type: 'quick-ready', ...quick })
  await yieldToPreviewPaint()

  try {
    const hq = await runtimeSession.decodeHqRaw()
    onEvent({ type: 'hq-ready', ...hq })
  } catch (error) {
    onEvent({
      type: 'hq-failed',
      errorCode: toPreviewErrorCode(error, 'RAW_HQ_DECODE_FAILED'),
    })
  }
}
```

- [ ] **Step 7: Update hook to create and close one session**

Modify `src/modules/raw-processor/hooks/useRawProcessor.ts` before `runPreviewPipeline`:

```ts
const runtimeSession = await rawRuntimeAdapter.openSession(file)
```

Use:

```ts
await runPreviewPipeline({
  runtimeSession: {
    extractEmbeddedPreview: runtimeSession.extractEmbeddedPreview,
    decodeQuickRaw: async () => {
      quickPreview = await runtimeSession.decodeQuickRaw(({ phase, progress }) => {
        if (!matchesActiveSession()) return
        setStatus(mapPhaseToStatus(phase))
        setProgress(progress * 0.5)
      })
      return { width: quickPreview.width, height: quickPreview.height }
    },
    decodeHqRaw: async () => {
      if (quickPreview && file.size >= LARGE_RAW_SAFE_HQ_REUSE_BYTES) {
        hqPreview = quickPreview
        return { width: hqPreview.width, height: hqPreview.height }
      }

      hqPreview = await runtimeSession.decodeHqRaw(({ phase, progress }) => {
        if (!matchesActiveSession()) return
        setStatus(mapPhaseToStatus(phase))
        setProgress(50 + progress * 0.5)
      })
      return { width: hqPreview.width, height: hqPreview.height }
    },
  },
  onEvent,
})
```

Ensure cleanup:

```ts
finally {
  runtimeSession?.dispose()
}
```

Store the current runtime session in a ref and dispose it before replacing files:

```ts
runtimeSessionRef.current?.dispose()
runtimeSessionRef.current = runtimeSession
```

- [ ] **Step 8: Update preview-pipeline tests**

Modify `src/modules/raw-processor/__tests__/preview-pipeline.test.ts` tests to pass `runtimeSession`:

```ts
await runPreviewPipeline({
  runtimeSession: {
    extractEmbeddedPreview: vi.fn().mockResolvedValue(null),
    decodeQuickRaw: vi.fn().mockResolvedValue({ width: 800, height: 600 }),
    decodeHqRaw: vi.fn().mockResolvedValue({ width: 4000, height: 3000 }),
  },
  onEvent,
})
```

- [ ] **Step 9: Run app adapter and hook tests**

Run:

```bash
pnpm test:run src/lib/raw/runtime-adapter.test.ts src/modules/raw-processor/__tests__/preview-pipeline.test.ts src/modules/raw-processor/hooks/useRawProcessor.test.tsx
```

Expected:

```text
PASS  src/lib/raw/runtime-adapter.test.ts
PASS  src/modules/raw-processor/__tests__/preview-pipeline.test.ts
PASS  src/modules/raw-processor/hooks/useRawProcessor.test.tsx
```

- [ ] **Step 10: Commit**

```bash
git add src/lib/raw src/modules/raw-processor
git commit -m "perf(raw): reuse runtime session in preview pipeline"
```

## Task 7: Add Heap Growth Telemetry

**Files:**
- Modify: `packages/luma-raw-runtime/src/types.ts`
- Modify: `packages/luma-raw-runtime/worker/native-adapter.ts`
- Modify: `packages/luma-raw-runtime/worker/runtime-core.ts`
- Modify: `packages/luma-raw-runtime/worker/runtime-core.test.ts`
- Modify: `packages/luma-raw-runtime/benchmarks/bench-runtime.ts`

- [ ] **Step 1: Add heap telemetry runtime-core test**

Add to `packages/luma-raw-runtime/worker/runtime-core.test.ts`:

```ts
it('records heap before and after session stages', async () => {
  let heap = 256
  const core = createRuntimeCore({
    createProcessor() {
      return makeNativeProcessor()
    },
    heapBytes() {
      heap += 16
      return heap
    },
  })

  const opened = await core.handleRequest({
    id: 'job-heap-open',
    type: 'openSession',
    payload: {
      fileBuffer: new ArrayBuffer(4),
      fileName: 'sample.ARW',
      fileSize: 4,
    },
  })

  expect(opened.ok && opened.type === 'openSession').toBe(true)
  if (!opened.ok || opened.type !== 'openSession') return
  expect(opened.payload.heap?.before).toBeGreaterThan(0)
  expect(opened.payload.heap?.after).toBeGreaterThan(opened.payload.heap?.before ?? 0)
})
```

Add this helper in the same test file if it is not already present:

```ts
function makeNativeProcessor() {
  return {
    openBuffer() {
      return { copyToWasm: 1, librawOpen: 1 }
    },
    loadBuffer() {
      return { copyToWasm: 1 }
    },
    openWithSettings() {
      return { copyToWasm: 0, librawOpen: 1 }
    },
    readMetadata() {
      return { width: 1, height: 1 }
    },
    extractThumbnail() {
      return undefined
    },
    decodePreview() {
      return { data: new Uint16Array([1, 2, 3]), width: 1, height: 1, bits: 16 as const }
    },
    decodeHq() {
      return { data: new Uint16Array([1, 2, 3]), width: 1, height: 1, bits: 16 as const }
    },
    dispose() {},
  }
}
```

- [ ] **Step 2: Run failing heap test**

Run:

```bash
pnpm test:run packages/luma-raw-runtime/worker/runtime-core.test.ts -t "heap before"
```

Expected:

```text
FAIL  packages/luma-raw-runtime/worker/runtime-core.test.ts > records heap
```

- [ ] **Step 3: Add heap to response types**

Modify `packages/luma-raw-runtime/src/types.ts`:

```ts
export type LumaRawHeapStats = {
  before?: number
  after?: number
  peak?: number
}
```

Add `heap?: LumaRawHeapStats` to:

- `LumaRawSessionInfo`
- `LumaRawFrame`
- `LumaEmbeddedPreview`

- [ ] **Step 4: Implement heap helper in runtime-core**

Modify `packages/luma-raw-runtime/worker/runtime-core.ts`:

```ts
function captureHeap(nativeFactory: LumaRawNativeFactory) {
  return nativeFactory.heapBytes?.()
}

function heapStats(before?: number, after?: number): LumaRawHeapStats | undefined {
  if (before === undefined && after === undefined) return undefined
  return {
    before,
    after,
    peak: Math.max(before ?? 0, after ?? 0),
  }
}
```

For each `openSession`, embedded, quick, and HQ stage:

```ts
const heapBefore = captureHeap(nativeFactory)
// stage work
const heapAfter = captureHeap(nativeFactory)
const heap = heapStats(heapBefore, heapAfter)
```

Pass `heap` into payload creation.

- [ ] **Step 5: Expose heap bytes from native adapter**

Modify `packages/luma-raw-runtime/worker/native-adapter.ts` factory return:

```ts
heapBytes() {
  const heap = (module as unknown as { HEAPU8?: Uint8Array }).HEAPU8
  return heap?.buffer.byteLength ?? 0
}
```

- [ ] **Step 6: Include heap in benchmark output**

Verify `packages/luma-raw-runtime/benchmarks/bench-runtime.ts` still prints heap fields for every Luma stage. The open-session row must include:

```ts
heap: session.heap,
```

The embedded row must include:

```ts
heap: embedded.heap,
```

The quick row must include:

```ts
heap: quick.heap,
```

The HQ row must include:

```ts
heap: hq.heap,
```

- [ ] **Step 7: Run tests**

Run:

```bash
pnpm test:run packages/luma-raw-runtime/worker/runtime-core.test.ts packages/luma-raw-runtime/worker/native-adapter.test.ts
```

Expected:

```text
PASS  packages/luma-raw-runtime/worker/runtime-core.test.ts
PASS  packages/luma-raw-runtime/worker/native-adapter.test.ts
```

- [ ] **Step 8: Commit**

```bash
git add packages/luma-raw-runtime/src/types.ts packages/luma-raw-runtime/worker packages/luma-raw-runtime/benchmarks/bench-runtime.ts
git commit -m "perf(raw-runtime): report wasm heap telemetry"
```

## Task 8: Run Full Performance Validation And Update Benchmark Notes

**Files:**
- Modify: `docs/plans/2026-04-23-luma-raw-runtime-benchmark-notes.md`
- Modify: `docs/specs/2026-04-22-phase1-test-matrix.md`

- [ ] **Step 1: Run automated verification**

Run:

```bash
pnpm test:run
VITE_RAW_RUNTIME=libraw-wasm pnpm build
. "$HOME/.cache/lumaforge-emsdk/emsdk_env.sh" >/dev/null
pnpm --filter @lumaforge/luma-raw-runtime build:native
VITE_RAW_RUNTIME=luma pnpm build
```

Expected:

```text
Test Files  all passed
✓ built in
Built Luma RAW native runtime into
✓ built in
```

- [ ] **Step 2: Run browser benchmark**

Run:

```bash
pnpm --filter @lumaforge/luma-raw-runtime bench:serve
```

Open `http://localhost:4174/benchmarks/bench-runtime.html`, select:

- `/workspaces/LumaForge/LibRaw/LibRaw-Wasm/example-sony.ARW`
- `/workspaces/LumaForge/test-images/SGL00940.ARW`
- `/workspaces/LumaForge/test-images/SGL_1998.NEF`

Click `Run benchmark`, copy JSONL output to:

```bash
/tmp/luma-raw-runtime-perf-v2.jsonl
```

Expected: JSONL includes at least 18 rows: 3 files x 2 legacy stages plus 3 files x 4 Luma stages.

- [ ] **Step 3: Generate benchmark markdown table**

Run:

```bash
node <<'NODE'
const fs = require('node:fs')
const records = fs
  .readFileSync('/tmp/luma-raw-runtime-perf-v2.jsonl', 'utf8')
  .trim()
  .split('\n')
  .filter(Boolean)
  .map((line) => JSON.parse(line))

const rows = records.map((r) => {
  const heapBefore = r.heap?.before ?? ''
  const heapAfter = r.heap?.after ?? ''
  const copy = Math.round(r.timings?.copyToWasm ?? 0)
  const open = Math.round(r.timings?.librawOpen ?? 0)
  const unpack = Math.round(r.timings?.unpack ?? r.timings?.process ?? 0)
  return `| ${r.file} | ${r.runtime} | ${r.stage} | ${r.width ?? ''} | ${r.height ?? ''} | ${r.megapixels ?? ''} | ${Math.round(r.total ?? 0)} | ${copy} | ${open} | ${unpack} | ${heapBefore} | ${heapAfter} | ${r.targetStatus ?? 'error'} |`
})

console.log(`| File | Runtime | Stage | Width | Height | MP | Total ms | Copy ms | Open ms | Unpack ms | Heap before | Heap after | Status |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
${rows.join('\n')}`)
NODE
```

- [ ] **Step 4: Update benchmark notes**

Replace the result table in `docs/plans/2026-04-23-luma-raw-runtime-benchmark-notes.md` with the generated table and add:

```md
## Performance Optimization V2 Summary

- JS-to-WASM input copy now reports as `copyToWasm`.
- LibRaw open parsing now reports as `librawOpen`.
- Luma uses one runtime session per RAW file.
- Quick output is capped to 2.5MP by default.
- Heap telemetry is recorded per stage.
- Rollout remains blocked if any required Luma stage exceeds target or any embedded preview reports `0x0`.
```

- [ ] **Step 5: Update manual migration matrix**

Append to `docs/specs/2026-04-22-phase1-test-matrix.md`:

```md
## Post Phase 1.5 Runtime Performance Validation

| Fixture | Runtime | Embedded | Quick | HQ | Heap telemetry | Result |
| --- | --- | --- | --- | --- | --- | --- |
| example-sony.ARW | luma session | Recorded in benchmark notes | Recorded in benchmark notes | Recorded in benchmark notes | Recorded | V2 gate passed; default switch separate |
| SGL00940.ARW | luma session | Recorded in benchmark notes | Recorded in benchmark notes | Recorded in benchmark notes | Recorded | V2 gate passed; default switch separate |
| SGL_1998.NEF | luma session | Recorded in benchmark notes | Recorded in benchmark notes | Recorded in benchmark notes | Recorded | V2 gate passed; default switch separate |
```

- [ ] **Step 6: Commit**

```bash
git add docs/plans/2026-04-23-luma-raw-runtime-benchmark-notes.md docs/specs/2026-04-22-phase1-test-matrix.md
git commit -m "docs(raw-runtime): record optimized performance validation"
```

## Task 9: Rollout Gate Decision Without Default Switch

**Files:**
- Modify: `docs/plans/2026-04-23-luma-raw-runtime-benchmark-notes.md`
- Modify: `ACCEPTANCE.md`

- [ ] **Step 1: Evaluate rollout criteria**

Run:

```bash
node <<'NODE'
const fs = require('node:fs')
const records = fs
  .readFileSync('/tmp/luma-raw-runtime-perf-v2.jsonl', 'utf8')
  .trim()
  .split('\n')
  .filter(Boolean)
  .map((line) => JSON.parse(line))

const requiredLuma = records.filter((r) => r.runtime === 'luma')
const failures = requiredLuma.filter((r) => {
  if (r.error) return true
  if (r.stage === 'luma-embedded') return r.width <= 0 || r.height <= 0 || r.total >= 1000
  if (r.stage === 'luma-quick') return r.total > 4000 || (r.megapixels ?? 99) > 2.6
  if (r.stage === 'luma-hq' && (r.megapixels ?? 0) <= 30) return r.total > 8000
  return false
})

console.log(JSON.stringify({ checked: requiredLuma.length, failures }, null, 2))
process.exitCode = failures.length === 0 ? 0 : 1
NODE
```

Expected for rollout approval:

```json
{
  "checked": 12,
  "failures": []
}
```

- [ ] **Step 2: Record decision**

When Step 1 exits `0`, append:

```md
## V2 Rollout Gate

Status: eligible for default-runtime rollout in a separate change.

Evidence:

- All embedded previews have non-zero dimensions and meet the under-1000 ms target.
- All quick previews are at or below 2.6MP and meet the under-4000 ms target.
- 24MP-class HQ completes under 8000 ms.
- 61MP fixture is documented as directional and not compared to the 24MP HQ target.
- Heap telemetry is present for all Luma stages.
```

When Step 1 exits non-zero, append:

```md
## V2 Rollout Gate

Status: default-runtime rollout remains blocked.

Evidence:

The rollout-check script reported one or more failures in `/tmp/luma-raw-runtime-perf-v2.jsonl`. Keep `VITE_RAW_RUNTIME=libraw-wasm` as the safe default and fix the listed stages before re-evaluating.
```

- [ ] **Step 3: Update ACCEPTANCE**

Append to `ACCEPTANCE.md`:

```md
## Luma RAW Runtime Performance Follow-Up

- Performance optimization follow-up completed through benchmark V2.
- Default runtime switch is controlled by the V2 rollout gate in `docs/plans/2026-04-23-luma-raw-runtime-benchmark-notes.md`.
- `VITE_RAW_RUNTIME=libraw-wasm` remains the rollback path until a separate default-runtime switch commit is approved.
```

- [ ] **Step 4: Final verification**

Run:

```bash
pnpm test:run
VITE_RAW_RUNTIME=libraw-wasm pnpm build
VITE_RAW_RUNTIME=luma pnpm build
git status --short
```

Expected:

```text
Test Files  all passed
✓ built in
✓ built in
```

`git status --short` should show only the docs changed for this task before commit.

- [ ] **Step 5: Commit**

```bash
git add docs/plans/2026-04-23-luma-raw-runtime-benchmark-notes.md ACCEPTANCE.md
git commit -m "docs(raw-runtime): record performance rollout gate"
```

## Final Verification

Run:

```bash
pnpm test:run
VITE_RAW_RUNTIME=libraw-wasm pnpm build
. "$HOME/.cache/lumaforge-emsdk/emsdk_env.sh" >/dev/null
pnpm --filter @lumaforge/luma-raw-runtime build:native
VITE_RAW_RUNTIME=luma pnpm build
git status --short
```

Expected:

```text
Test Files  all passed
✓ built in
Built Luma RAW native runtime into
✓ built in
```

`git status --short` should print no tracked changes. Local RAW fixtures under `/workspaces/LumaForge/test-images` remain untracked external test assets.

## Success Criteria

- `copyToWasm` replaces byte-by-byte copy and is visible in benchmark JSONL.
- `example-sony.ARW` embedded preview has non-zero dimensions and total under 1000 ms.
- `example-sony.ARW` quick preview is capped near 2.5MP and total under 4000 ms.
- `example-sony.ARW` HQ remains under 8000 ms.
- `SGL_1998.NEF` is included in benchmark evidence and its >30MP HQ row is directional, not compared to the 24MP HQ budget gate.
- `SGL00940.ARW` is recorded as 61MP directional evidence, not as the 24MP HQ budget gate.
- Heap before/after is present for every Luma stage.
- App preview pipeline opens one Luma runtime session per selected file.
- Default runtime is not switched in this plan.

## Spec Coverage Map

- Input-copy bottleneck: Task 2.
- Repeated file read/transfer/open bottleneck: Tasks 3 and 6.
- Embedded `0x0` blocker: Task 4.
- Quick over-budget blocker: Task 5.
- Missing heap-growth telemetry: Task 7.
- Non-comparable benchmark evidence: Tasks 1 and 8.
- Fewer than three fixture validation blocker: Task 8.
- Safe rollout gate: Task 9.
