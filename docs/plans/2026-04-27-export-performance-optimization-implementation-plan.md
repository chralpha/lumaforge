# Export Performance Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce full-resolution RAW-to-JPEG export latency for 61MP and 100MP-class photos while preserving full-resolution output, browser-local execution, bounded memory, and Float32 color-pipeline precision.

**Architecture:** Add export-stage telemetry first, then replace the pure TypeScript JPEG encoder with a libjpeg-turbo WASM scanline backend, reduce repeated RAW processed-window setup, replace full-strip color allocation with precision-preserving row-band processing, and add bounded pipeline concurrency. Each optimization stays behind existing export/runtime boundaries and is accepted only with before/after benchmark evidence.

**Tech Stack:** TypeScript 6, React 19, Vite 8 workers, Vitest, Emscripten 5.0.6, LibRaw, libjpeg-turbo 3.1.4.1, Web Workers, browser-local `Blob` JPEG output.

---

## Execution preflight

Run implementation in a repo-local worktree:

```bash
pnpm worktree feat/export-performance-optimization
cd /workspaces/LumaForge/LumaForge/.worktrees/feat/export-performance-optimization
```

If native build commands fail because `emcc` is not on `PATH`, activate the cached SDK before retrying:

```bash
. "$HOME/.cache/lumaforge-emsdk/emsdk_env.sh" >/dev/null
emcc --version
```

Expected: `emcc` reports Emscripten `5.0.6` or the locally installed compatible SDK version.

## File structure

Create:

- `src/lib/export/perf/export-metrics.ts`: shared metric types, timers, and JSONL formatting.
- `src/lib/export/perf/export-metrics.test.ts`: metric collector and JSONL tests.
- `src/lib/export/row-band-processor.ts`: Float32-preserving row-band color processor.
- `src/lib/export/row-band-processor.test.ts`: parity tests against the current full-strip graph behavior.
- `src/lib/export/pipeline-concurrency.ts`: bounded strip scheduling and ordered commit queue helpers.
- `src/lib/export/pipeline-concurrency.test.ts`: concurrency, ordering, and resource fallback tests.
- `packages/luma-jpeg-runtime/native/sources.lock.json`: pinned libjpeg-turbo source lock.
- `packages/luma-jpeg-runtime/native/libjpeg_turbo_encoder.cpp`: embind wrapper around libjpeg scanline compression.
- `packages/luma-jpeg-runtime/native/emcc-flags.sh`: JPEG runtime Emscripten flags.
- `packages/luma-jpeg-runtime/native/build-libjpeg-turbo.sh`: native JPEG build entrypoint.
- `packages/luma-jpeg-runtime/native/scripts/fetch-sources.mjs`: pinned-source fetcher.
- `packages/luma-jpeg-runtime/native/scripts/build-wasm.sh`: wrapper link step.
- `packages/luma-jpeg-runtime/native/scripts/verify-native-artifacts.mjs`: provenance and artifact verifier.
- `packages/luma-jpeg-runtime/worker/baseline-encoder.ts`: current TypeScript encoder moved behind a test/debug factory.
- `packages/luma-jpeg-runtime/worker/native-adapter.ts`: normalizes the embind JPEG encoder API.
- `packages/luma-jpeg-runtime/worker/native-adapter.test.ts`: native adapter tests with a fake embind module.
- `packages/luma-jpeg-runtime/worker/load-native-module.ts`: locates and loads `luma_jpeg.js` and `luma_jpeg.wasm`.
- `packages/luma-jpeg-runtime/worker/load-native-module.test.ts`: missing asset and `locateFile` tests.
- `packages/luma-jpeg-runtime/THIRD_PARTY_NOTICES.md`: bundled libjpeg-turbo notice rollup.
- `packages/luma-jpeg-runtime/THIRD_PARTY_LICENSES/libjpeg-turbo-LICENSE.md`: vendored license text.
- `packages/luma-jpeg-runtime/benchmarks/bench-jpeg-runtime.html`: browser encode benchmark page.
- `packages/luma-jpeg-runtime/benchmarks/bench-jpeg-runtime.ts`: 100MP synthetic JPEG benchmark runner.

Modify:

- `docs/specs/2026-04-22-phase1-test-matrix.md`: add final export performance acceptance rows.
- `package.json`: no root script change unless a single repo-level perf command is needed.
- `packages/luma-jpeg-runtime/package.json`: native build, verify, benchmark, and package file entries.
- `packages/luma-jpeg-runtime/vite.config.ts`: package native worker assets with the runtime build.
- `packages/luma-jpeg-runtime/worker/runtime-core.ts`: load the native backend by default, preserve injected factories for tests.
- `packages/luma-jpeg-runtime/worker/runtime-core.test.ts`: switch default production expectations to native-backed core injection.
- `packages/luma-jpeg-runtime/worker/runtime.worker.ts`: initialize the native backend once and fail closed if it is unavailable.
- `packages/luma-raw-runtime/src/types.ts`: add processed-window timing and export-session metadata fields.
- `packages/luma-raw-runtime/src/worker-protocol.ts`: add begin/end processed-window export session messages if the JS session needs explicit control.
- `packages/luma-raw-runtime/src/runtime.ts`: expose optional export-session lifecycle when supported.
- `packages/luma-raw-runtime/worker/native-types.ts`: add native export-session methods and processed-window timing types.
- `packages/luma-raw-runtime/worker/native-adapter.ts`: normalize new native methods and timings.
- `packages/luma-raw-runtime/worker/native-adapter.test.ts`: adapter coverage for export-session timings and fallback.
- `packages/luma-raw-runtime/worker/runtime-core.ts`: call native export-session methods around export-window reads.
- `packages/luma-raw-runtime/worker/runtime-core.test.ts`: session lifecycle, cancellation, and fail-closed coverage.
- `packages/luma-raw-runtime/native/libraw_wrapper.cpp`: processed-window export-session fast path and per-window timing.
- `src/lib/export/full-res-export.ts`: telemetry, row-band processor, and bounded pipeline concurrency.
- `src/lib/export/full-res-export.test.ts`: telemetry, row-band parity, ordered writes, retry, and cancellation tests.
- `src/lib/export/full-res-export-client.ts`: optional metric messages for browser benchmarks.
- `src/lib/export/full-res-export-client.test.ts`: client metric forwarding and cancellation tests.
- `src/lib/export/full-res-export.worker.ts`: forward export metrics and manage RAW export-session lifecycle.
- `src/lib/raw/export-runtime-adapter.ts`: expose begin/end processed-window export when available.
- `src/lib/raw/export-runtime-adapter.test.ts`: adapter optional lifecycle tests.

Do not modify:

- Preview rendering as the source of full-resolution pixels.
- LUT contract semantics or output role handling.
- Default output format away from JPEG.
- JPEG output dimensions as part of performance fallback.

---

### Task 1: Add Export Performance Metrics

**Files:**
- Create: `src/lib/export/perf/export-metrics.ts`
- Create: `src/lib/export/perf/export-metrics.test.ts`
- Modify: `src/lib/export/full-res-export.ts`
- Test: `src/lib/export/full-res-export.test.ts`

- [ ] **Step 1: Write metric collector tests**

Add `src/lib/export/perf/export-metrics.test.ts`:

```ts
import {
  createExportMetricCollector,
  formatExportMetricJsonl,
  type ExportPerfMetric,
} from './export-metrics'

describe('export performance metrics', () => {
  it('records stage durations and formats stable JSONL', () => {
    const collector = createExportMetricCollector({
      requestId: 'export-1',
      fileName: 'sample.RAF',
      width: 11662,
      height: 8746,
      browser: 'unit-test',
    })

    collector.record({
      kind: 'strip',
      stripIndex: 0,
      totalStrips: 2,
      rows: 512,
      rawReadMs: 10,
      colorMs: 4,
      jpegWriteMs: 2,
      totalMs: 16,
    })

    collector.record({
      kind: 'summary',
      stripRows: 512,
      retries: 0,
      concurrency: 1,
      totalMs: 32,
      outputBytes: 1024,
    })

    const records = collector.records()
    expect(records).toHaveLength(2)
    expect(records[0]).toMatchObject({
      requestId: 'export-1',
      fileName: 'sample.RAF',
      megapixels: 101.99,
      kind: 'strip',
      rawReadMs: 10,
      colorMs: 4,
      jpegWriteMs: 2,
    })

    const jsonl = formatExportMetricJsonl(records)
    expect(jsonl.split('\n')).toHaveLength(2)
    expect(JSON.parse(jsonl.split('\n')[0]!) as ExportPerfMetric).toMatchObject({
      requestId: 'export-1',
      kind: 'strip',
    })
  })
})
```

- [ ] **Step 2: Run metric tests and verify failure**

Run:

```bash
pnpm test:run src/lib/export/perf/export-metrics.test.ts
```

Expected: FAIL because `src/lib/export/perf/export-metrics.ts` does not exist.

- [ ] **Step 3: Implement metric collector**

Create `src/lib/export/perf/export-metrics.ts`:

```ts
export type ExportPerfMetricBase = {
  requestId: string
  fileName?: string
  width: number
  height: number
  megapixels: number
  browser?: string
  timestamp: string
}

export type ExportPerfStripMetric = ExportPerfMetricBase & {
  kind: 'strip'
  stripIndex: number
  totalStrips: number
  rows: number
  rawReadMs: number
  colorMs: number
  jpegWriteMs: number
  totalMs: number
}

export type ExportPerfSummaryMetric = ExportPerfMetricBase & {
  kind: 'summary'
  stripRows: number
  retries: number
  concurrency: number
  totalMs: number
  outputBytes: number
}

export type ExportPerfMetric =
  | ExportPerfStripMetric
  | ExportPerfSummaryMetric

export type ExportPerfCollectorInput = {
  requestId: string
  fileName?: string
  width: number
  height: number
  browser?: string
}

type StripRecordInput = Omit<
  ExportPerfStripMetric,
  keyof ExportPerfMetricBase
>

type SummaryRecordInput = Omit<
  ExportPerfSummaryMetric,
  keyof ExportPerfMetricBase
>

function roundMegapixels(width: number, height: number) {
  return Math.round((width * height) / 10_000) / 100
}

function createBase(input: ExportPerfCollectorInput): ExportPerfMetricBase {
  return {
    ...input,
    megapixels: roundMegapixels(input.width, input.height),
    timestamp: new Date().toISOString(),
  }
}

export function createExportMetricCollector(input: ExportPerfCollectorInput) {
  const base = createBase(input)
  const entries: ExportPerfMetric[] = []

  return {
    record(entry: StripRecordInput | SummaryRecordInput) {
      entries.push({ ...base, ...entry } as ExportPerfMetric)
    },
    records() {
      return [...entries]
    },
  }
}

export function formatExportMetricJsonl(records: ExportPerfMetric[]) {
  return records.map((record) => JSON.stringify(record)).join('\n')
}

export function nowMs() {
  return globalThis.performance?.now() ?? Date.now()
}
```

- [ ] **Step 4: Run metric tests and verify pass**

Run:

```bash
pnpm test:run src/lib/export/perf/export-metrics.test.ts
```

Expected: PASS.

- [ ] **Step 5: Add export orchestrator metric test**

Append this test to `src/lib/export/full-res-export.test.ts`:

```ts
it('emits strip and summary performance metrics without changing output rows', async () => {
  const metrics: unknown[] = []
  const writer = {
    writeRows: vi.fn(async () => undefined),
    close: vi.fn(
      async () => new Blob([new Uint8Array([1])], { type: 'image/jpeg' }),
    ),
    abort: vi.fn(async () => undefined),
  }

  const blob = await runFullResolutionJpegExport({
    capability: makeCapability({ width: 4, height: 8 }),
    graph: {
      supported: true,
      outputGamut: 'srgb-rec709',
      outputTransfer: 'srgb',
      lutProfile: null,
      steps: [
        { kind: 'input-linear-prophoto' },
        IDENTITY_RAW_RENDER_EXPOSURE_STEP,
        { kind: 'output-srgb' },
      ],
    },
    preferredRows: 4,
    readProcessedWindow: async (request) => makeProcessedWindow(request),
    writerFactory: () => writer,
    onMetric(metric) {
      metrics.push(metric)
    },
  })

  expect(blob.type).toBe('image/jpeg')
  expect(writer.writeRows).toHaveBeenCalledTimes(2)
  expect(metrics.map((metric) => (metric as { kind: string }).kind)).toEqual([
    'strip',
    'strip',
    'summary',
  ])
})
```

- [ ] **Step 6: Run orchestrator metric test and verify failure**

Run:

```bash
pnpm test:run src/lib/export/full-res-export.test.ts -t "performance metrics"
```

Expected: FAIL because `onMetric` is not part of `RunFullResolutionJpegExportInput`.

- [ ] **Step 7: Wire metrics into export orchestration**

Modify `src/lib/export/full-res-export.ts`:

```ts
import type { ExportPerfMetric } from './perf/export-metrics'
import { createExportMetricCollector, nowMs } from './perf/export-metrics'
```

Extend `RunFullResolutionJpegExportInput`:

```ts
  metricContext?: {
    requestId: string
    fileName?: string
    browser?: string
  }
  onMetric?: (metric: ExportPerfMetric) => void
```

Inside `runFullResolutionJpegExport`, create a collector after capability
validation:

```ts
  const metricCollector = input.onMetric
    ? createExportMetricCollector({
        requestId: input.metricContext?.requestId ?? 'full-res-export',
        fileName: input.metricContext?.fileName,
        browser: input.metricContext?.browser,
        width: input.capability.width,
        height: input.capability.height,
      })
    : null
```

Around each strip, measure the three stages:

```ts
        const stripStart = nowMs()
        const rawStart = nowMs()
        const processedWindow = await input.readProcessedWindow(
          {
            outputRect: strip.output,
            halo: { left: 2, top: 2, right: 2, bottom: 2 },
          },
          input.signal,
        )
        const rawReadMs = nowMs() - rawStart

        const colorStart = nowMs()
        const tile = processedWindowToLinearProPhotoTile(
          processedWindow,
          strip.output,
        )
        const rows = applyGraphToRgbRows(tile.data)
        const colorMs = nowMs() - colorStart

        const jpegStart = nowMs()
        await writer.writeRows(rows, tile.height)
        const jpegWriteMs = nowMs() - jpegStart

        if (metricCollector) {
          metricCollector.record({
            kind: 'strip',
            stripIndex: index,
            totalStrips: strips.length,
            rows: tile.height,
            rawReadMs,
            colorMs,
            jpegWriteMs,
            totalMs: nowMs() - stripStart,
          })
          input.onMetric?.(metricCollector.records().at(-1)!)
        }
```

After `writer.close()`, emit summary:

```ts
      if (metricCollector) {
        metricCollector.record({
          kind: 'summary',
          stripRows,
          retries: 0,
          concurrency: 1,
          totalMs: nowMs() - exportStart,
          outputBytes: blob.size,
        })
        input.onMetric?.(metricCollector.records().at(-1)!)
      }
```

Define `const exportStart = nowMs()` before the retry loop.

- [ ] **Step 8: Run targeted export tests**

Run:

```bash
pnpm test:run src/lib/export/perf/export-metrics.test.ts src/lib/export/full-res-export.test.ts -t "performance metrics"
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/export/perf/export-metrics.ts src/lib/export/perf/export-metrics.test.ts src/lib/export/full-res-export.ts src/lib/export/full-res-export.test.ts
git commit -m "feat(export): add full-resolution export metrics"
```

---

### Task 2: Expose Export Metrics Through Worker Client

**Files:**
- Modify: `src/lib/export/full-res-export-client.ts`
- Modify: `src/lib/export/full-res-export-client.test.ts`
- Modify: `src/lib/export/full-res-export.worker.ts`

- [ ] **Step 1: Write client metric forwarding test**

Add this test to `src/lib/export/full-res-export-client.test.ts`:

```ts
it('forwards worker metric messages to the caller', async () => {
  const worker = new FakeWorker()
  const client = new FullResolutionExportWorkerClient(
    () => worker as unknown as Worker,
  )
  const metrics: unknown[] = []
  const run = client.run({
    file: new File([new Uint8Array([1])], 'sample.RAF'),
    graph: supportedGraph,
    onMetric(metric) {
      metrics.push(metric)
    },
  })

  const start = worker.requests[0]!
  if (start.kind !== 'start') {
    throw new Error('Expected a start request.')
  }
  worker.emit({
    kind: 'metric',
    requestId: start.requestId,
    metric: {
      requestId: start.requestId,
      kind: 'summary',
      width: 4,
      height: 4,
      megapixels: 0,
      timestamp: '2026-04-27T00:00:00.000Z',
      stripRows: 4,
      retries: 0,
      concurrency: 1,
      totalMs: 12,
      outputBytes: 128,
    },
  })
  worker.emit({
    kind: 'success',
    requestId: start.requestId,
    blob: new Blob([new Uint8Array([1])], { type: 'image/jpeg' }),
  })

  await expect(run).resolves.toHaveProperty('type', 'image/jpeg')
  expect(metrics).toHaveLength(1)
  client.dispose()
})
```

- [ ] **Step 2: Run client metric test and verify failure**

Run:

```bash
pnpm test:run src/lib/export/full-res-export-client.test.ts -t "metric messages"
```

Expected: FAIL because the worker response union does not include `metric`.

- [ ] **Step 3: Add metric message types and callback**

Modify `src/lib/export/full-res-export-client.ts`:

```ts
import type { ExportPerfMetric } from './perf/export-metrics'
```

Add response type:

```ts
export type FullResExportWorkerMetricMessage = {
  kind: 'metric'
  requestId: string
  metric: ExportPerfMetric
}
```

Add it to `FullResExportWorkerResponse`:

```ts
  | FullResExportWorkerMetricMessage
```

Add callback to `RunFullResolutionJpegExportInWorkerInput` and `PendingRequest`:

```ts
  onMetric?: (metric: ExportPerfMetric) => void
```

Handle the message before success/error cleanup:

```ts
      if (response.kind === 'metric') {
        pending.onMetric?.(response.metric)
        return
      }
```

Store the callback in `pending.set(...)`:

```ts
        onMetric: input.onMetric,
```

- [ ] **Step 4: Forward worker metrics**

Modify `src/lib/export/full-res-export.worker.ts` in the `runFullResolutionJpegExport` call:

```ts
        metricContext: {
          requestId: message.requestId,
          fileName: message.file.name,
          browser: globalThis.navigator?.userAgent,
        },
        onMetric(metric) {
          self.postMessage({
            kind: 'metric',
            requestId: message.requestId,
            metric,
          } satisfies FullResExportWorkerResponse)
        },
```

- [ ] **Step 5: Run client tests**

Run:

```bash
pnpm test:run src/lib/export/full-res-export-client.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/export/full-res-export-client.ts src/lib/export/full-res-export-client.test.ts src/lib/export/full-res-export.worker.ts
git commit -m "feat(export): forward full-resolution export metrics"
```

---

### Task 3: Add libjpeg-turbo Native Build Skeleton

**Files:**
- Create: `packages/luma-jpeg-runtime/native/sources.lock.json`
- Create: `packages/luma-jpeg-runtime/native/emcc-flags.sh`
- Create: `packages/luma-jpeg-runtime/native/build-libjpeg-turbo.sh`
- Create: `packages/luma-jpeg-runtime/native/scripts/fetch-sources.mjs`
- Create: `packages/luma-jpeg-runtime/native/scripts/verify-native-artifacts.mjs`
- Modify: `packages/luma-jpeg-runtime/package.json`
- Modify: `packages/luma-jpeg-runtime/vite.config.ts`

- [ ] **Step 1: Add pinned source lock**

Create `packages/luma-jpeg-runtime/native/sources.lock.json`:

```json
{
  "schemaVersion": 1,
  "toolchain": {
    "emsdk": "5.0.6"
  },
  "sources": [
    {
      "name": "libjpeg-turbo",
      "version": "3.1.4.1",
      "url": "https://github.com/libjpeg-turbo/libjpeg-turbo/releases/download/3.1.4.1/libjpeg-turbo-3.1.4.1.tar.gz",
      "sha256": "ecae8008e2cc9ade2f2c1bb9d5e6d4fb73e7c433866a056bd82980741571a022",
      "archiveName": "libjpeg-turbo-3.1.4.1.tar.gz",
      "extractDir": "libjpeg-turbo-3.1.4.1"
    }
  ]
}
```

- [ ] **Step 2: Add package scripts and file entries**

Modify `packages/luma-jpeg-runtime/package.json`:

```json
{
  "scripts": {
    "build": "vite build --config vite.config.ts && tsc -p tsconfig.json --emitDeclarationOnly",
    "build:native": "bash native/build-libjpeg-turbo.sh",
    "bench:serve": "vite --host 0.0.0.0 --port 4175 --config vite.config.ts",
    "native:fetch": "node native/scripts/fetch-sources.mjs",
    "native:verify": "node native/scripts/verify-native-artifacts.mjs",
    "test": "vitest run src worker native",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "files": [
    "THIRD_PARTY_LICENSES",
    "THIRD_PARTY_NOTICES.md",
    "dist",
    "native/build-libjpeg-turbo.sh",
    "native/emcc-flags.sh",
    "native/libjpeg_turbo_encoder.cpp",
    "native/scripts",
    "native/sources.lock.json"
  ]
}
```

Preserve the existing `name`, `type`, `version`, `private`, `description`,
`sideEffects`, `exports`, `main`, and `types` fields.

- [ ] **Step 3: Add Emscripten flags**

Create `packages/luma-jpeg-runtime/native/emcc-flags.sh`:

```bash
#!/usr/bin/env bash

set -euo pipefail

export LUMA_JPEG_CFLAGS="-O3 -flto -ffast-math -DNDEBUG"
export LUMA_JPEG_LDFLAGS="-O3 -flto -s MODULARIZE=1 -s EXPORT_ES6=1 -s ENVIRONMENT=web,worker -s ALLOW_MEMORY_GROWTH=1 -s INITIAL_MEMORY=64MB -s DISABLE_EXCEPTION_CATCHING=0"
```

- [ ] **Step 4: Add fetch script by adapting the existing native fetcher**

Run:

```bash
mkdir -p packages/luma-jpeg-runtime/native/scripts
cp packages/luma-raw-runtime/native/scripts/fetch-sources.mjs packages/luma-jpeg-runtime/native/scripts/fetch-sources.mjs
```

Then edit only package-specific labels inside
`packages/luma-jpeg-runtime/native/scripts/fetch-sources.mjs`:

```ts
function formatSource(source) {
  return `${source.name}@${source.version}`
}
```

No other behavior should differ from the RAW runtime fetcher: it must validate
SHA-256, reject unsafe archive entries, and extract into `native/vendor`.

- [ ] **Step 5: Add native build entrypoint**

Create `packages/luma-jpeg-runtime/native/build-libjpeg-turbo.sh`:

```bash
#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

node "${SCRIPT_DIR}/scripts/fetch-sources.mjs"
bash "${SCRIPT_DIR}/scripts/build-wasm.sh"
node "${SCRIPT_DIR}/scripts/verify-native-artifacts.mjs"
```

- [ ] **Step 6: Add wasm build script**

Create `packages/luma-jpeg-runtime/native/scripts/build-wasm.sh`:

```bash
#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NATIVE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
PACKAGE_DIR="$(cd "${NATIVE_DIR}/.." && pwd)"
VENDOR_DIR="${NATIVE_DIR}/vendor"
LIBJPEG_DIR="${VENDOR_DIR}/libjpeg-turbo-3.1.4.1"
BUILD_DIR="${NATIVE_DIR}/build"
OUTPUT_DIR="${PACKAGE_DIR}/dist/native"
OUTPUT_JS="${OUTPUT_DIR}/luma_jpeg.js"

source "${NATIVE_DIR}/emcc-flags.sh"

if ! command -v emcc >/dev/null 2>&1; then
  echo "emcc is required. Activate the Emscripten SDK before running build:native." >&2
  exit 1
fi

if [ ! -d "${LIBJPEG_DIR}" ]; then
  echo "Missing libjpeg-turbo source directory: ${LIBJPEG_DIR}" >&2
  echo "Run native/scripts/fetch-sources.mjs before building." >&2
  exit 1
fi

rm -rf "${BUILD_DIR}"
mkdir -p "${BUILD_DIR}" "${OUTPUT_DIR}"

emcc \
  --bind \
  -I"${LIBJPEG_DIR}" \
  -I"${LIBJPEG_DIR}/src" \
  ${LUMA_JPEG_CFLAGS} \
  ${LUMA_JPEG_LDFLAGS} \
  "${NATIVE_DIR}/libjpeg_turbo_encoder.cpp" \
  "${LIBJPEG_DIR}/src/jcapimin.c" \
  "${LIBJPEG_DIR}/src/jcapistd.c" \
  "${LIBJPEG_DIR}/src/jccoefct.c" \
  "${LIBJPEG_DIR}/src/jccolor.c" \
  "${LIBJPEG_DIR}/src/jcdctmgr.c" \
  "${LIBJPEG_DIR}/src/jchuff.c" \
  "${LIBJPEG_DIR}/src/jcicc.c" \
  "${LIBJPEG_DIR}/src/jcinit.c" \
  "${LIBJPEG_DIR}/src/jcmainct.c" \
  "${LIBJPEG_DIR}/src/jcmarker.c" \
  "${LIBJPEG_DIR}/src/jcmaster.c" \
  "${LIBJPEG_DIR}/src/jcomapi.c" \
  "${LIBJPEG_DIR}/src/jcparam.c" \
  "${LIBJPEG_DIR}/src/jcphuff.c" \
  "${LIBJPEG_DIR}/src/jcprepct.c" \
  "${LIBJPEG_DIR}/src/jcsample.c" \
  "${LIBJPEG_DIR}/src/jctrans.c" \
  "${LIBJPEG_DIR}/src/jdapimin.c" \
  "${LIBJPEG_DIR}/src/jdapistd.c" \
  "${LIBJPEG_DIR}/src/jdatadst.c" \
  "${LIBJPEG_DIR}/src/jdatasrc.c" \
  "${LIBJPEG_DIR}/src/jdcoefct.c" \
  "${LIBJPEG_DIR}/src/jdcolor.c" \
  "${LIBJPEG_DIR}/src/jddctmgr.c" \
  "${LIBJPEG_DIR}/src/jdhuff.c" \
  "${LIBJPEG_DIR}/src/jdicc.c" \
  "${LIBJPEG_DIR}/src/jdinput.c" \
  "${LIBJPEG_DIR}/src/jdmainct.c" \
  "${LIBJPEG_DIR}/src/jdmarker.c" \
  "${LIBJPEG_DIR}/src/jdmaster.c" \
  "${LIBJPEG_DIR}/src/jdmerge.c" \
  "${LIBJPEG_DIR}/src/jdphuff.c" \
  "${LIBJPEG_DIR}/src/jdpostct.c" \
  "${LIBJPEG_DIR}/src/jdsample.c" \
  "${LIBJPEG_DIR}/src/jdtrans.c" \
  "${LIBJPEG_DIR}/src/jerror.c" \
  "${LIBJPEG_DIR}/src/jfdctflt.c" \
  "${LIBJPEG_DIR}/src/jfdctfst.c" \
  "${LIBJPEG_DIR}/src/jfdctint.c" \
  "${LIBJPEG_DIR}/src/jidctflt.c" \
  "${LIBJPEG_DIR}/src/jidctfst.c" \
  "${LIBJPEG_DIR}/src/jidctint.c" \
  "${LIBJPEG_DIR}/src/jquant1.c" \
  "${LIBJPEG_DIR}/src/jquant2.c" \
  "${LIBJPEG_DIR}/src/jutils.c" \
  "${LIBJPEG_DIR}/src/jmemmgr.c" \
  "${LIBJPEG_DIR}/src/jmemnobs.c" \
  -o "${OUTPUT_JS}"

node "${SCRIPT_DIR}/verify-native-artifacts.mjs" --write-provenance

echo "Built Luma JPEG native runtime into ${OUTPUT_DIR}"
```

- [ ] **Step 7: Add artifact verifier**

Create `packages/luma-jpeg-runtime/native/scripts/verify-native-artifacts.mjs` by copying the RAW verifier:

```bash
cp packages/luma-raw-runtime/native/scripts/verify-native-artifacts.mjs packages/luma-jpeg-runtime/native/scripts/verify-native-artifacts.mjs
```

Then change artifact names inside the copied file:

```ts
const jsArtifact = {
  file: 'luma_jpeg.js',
  path: path.join(distNativeDir, 'luma_jpeg.js'),
}
const wasmArtifact = {
  file: 'luma_jpeg.wasm',
  path: path.join(distNativeDir, 'luma_jpeg.wasm'),
}
```

Set forbidden markers for the JPEG package:

```ts
const forbiddenGeneratedMarkers = [
  ['LIBJPEG', 'TURBO', 'ROOT'].join('_'),
  ['/workspaces', 'LumaForge'].join('/'),
]
```

- [ ] **Step 8: Add a minimal native wrapper that exports the class shape**

Create `packages/luma-jpeg-runtime/native/libjpeg_turbo_encoder.cpp`:

```cpp
#include <emscripten/bind.h>

#include <stdexcept>
#include <string>
#include <vector>

namespace {

using emscripten::class_;
using emscripten::val;

class LumaJpegEncoder {
 public:
  LumaJpegEncoder(int width, int height, double quality) {
    if (width <= 0 || height <= 0 || quality <= 0 || quality > 1) {
      throw std::runtime_error("JPEG_INVALID_ENCODER_OPTIONS");
    }
  }

  void writeRows(val, int row_count) {
    if (row_count <= 0) {
      throw std::runtime_error("JPEG_INVALID_ROW_COUNT");
    }
    throw std::runtime_error("JPEG_NATIVE_ENCODER_NOT_LINKED");
  }

  val finish() { throw std::runtime_error("JPEG_NATIVE_ENCODER_NOT_LINKED"); }

  void abort() {}
};

}  // namespace

EMSCRIPTEN_BINDINGS(luma_jpeg_runtime) {
  class_<LumaJpegEncoder>("LumaJpegEncoder")
      .constructor<int, int, double>()
      .function("writeRows", &LumaJpegEncoder::writeRows)
      .function("finish", &LumaJpegEncoder::finish)
      .function("abort", &LumaJpegEncoder::abort);
}
```

This wrapper intentionally fails at encode time until Task 4 wires the libjpeg
scanline implementation. It proves the native build and loader before changing
runtime behavior.

- [ ] **Step 9: Run native fetch and build skeleton**

Run:

```bash
pnpm --filter @lumaforge/luma-jpeg-runtime native:fetch
pnpm --filter @lumaforge/luma-jpeg-runtime build:native
```

Expected: PASS, producing:

```text
packages/luma-jpeg-runtime/dist/native/luma_jpeg.js
packages/luma-jpeg-runtime/dist/native/luma_jpeg.wasm
packages/luma-jpeg-runtime/dist/native/provenance.json
```

- [ ] **Step 10: Commit**

```bash
git add packages/luma-jpeg-runtime/package.json packages/luma-jpeg-runtime/vite.config.ts packages/luma-jpeg-runtime/native
git commit -m "build(jpeg): add libjpeg-turbo native build skeleton"
```

---

### Task 4: Replace JPEG Runtime Core With Native Scanline Backend

**Files:**
- Create: `packages/luma-jpeg-runtime/worker/baseline-encoder.ts`
- Create: `packages/luma-jpeg-runtime/worker/native-adapter.ts`
- Create: `packages/luma-jpeg-runtime/worker/native-adapter.test.ts`
- Create: `packages/luma-jpeg-runtime/worker/load-native-module.ts`
- Create: `packages/luma-jpeg-runtime/worker/load-native-module.test.ts`
- Modify: `packages/luma-jpeg-runtime/native/libjpeg_turbo_encoder.cpp`
- Modify: `packages/luma-jpeg-runtime/worker/runtime-core.ts`
- Modify: `packages/luma-jpeg-runtime/worker/runtime-core.test.ts`
- Modify: `packages/luma-jpeg-runtime/worker/runtime.worker.ts`

- [ ] **Step 1: Move the TypeScript encoder into a baseline factory**

Create `packages/luma-jpeg-runtime/worker/baseline-encoder.ts` by moving the
current `JpegByteWriter` and `BaselineSequentialJpegEncoder` code out of
`worker/runtime-core.ts`.

Export this factory:

```ts
import type { InternalJpegEncoder } from './runtime-core'

export function createBaselineJpegEncoder(input: {
  width: number
  height: number
  quality: number
}): InternalJpegEncoder {
  return new BaselineSequentialJpegEncoder(input.width, input.height, input.quality)
}
```

Keep all current validation error strings unchanged:

```text
JPEG_INVALID_WIDTH
JPEG_INVALID_HEIGHT
JPEG_INVALID_QUALITY
JPEG_ROW_LENGTH_MISMATCH
JPEG_ROW_COUNT_EXCEEDED
JPEG_INCOMPLETE_IMAGE
```

- [ ] **Step 2: Add native adapter tests**

Create `packages/luma-jpeg-runtime/worker/native-adapter.test.ts`:

```ts
import { createNativeJpegEncoderFactory } from './native-adapter'

class FakeNativeEncoder {
  rows: Uint8Array[] = []
  aborted = false
  constructor(
    readonly width: number,
    readonly height: number,
    readonly quality: number,
  ) {}
  writeRows(rows: Uint8Array, rowCount: number) {
    this.rows.push(new Uint8Array(rows))
    return rowCount
  }
  finish() {
    return new Uint8Array([0xff, 0xd8, 0xff, 0xd9])
  }
  abort() {
    this.aborted = true
  }
}

describe('createNativeJpegEncoderFactory', () => {
  it('normalizes native bytes into an image/jpeg blob', async () => {
    const factory = createNativeJpegEncoderFactory({
      LumaJpegEncoder: FakeNativeEncoder,
    })
    const encoder = factory({ width: 2, height: 1, quality: 0.92 })

    await encoder.writeRows(new Uint8Array([255, 0, 0, 0, 255, 0]), 1)
    const blob = await encoder.finish()

    expect(blob.type).toBe('image/jpeg')
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(
      new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
    )
  })

  it('aborts the native encoder', async () => {
    const factory = createNativeJpegEncoderFactory({
      LumaJpegEncoder: FakeNativeEncoder,
    })
    const encoder = factory({ width: 1, height: 1, quality: 0.92 })
    encoder.abort()
    await expect(
      encoder.writeRows(new Uint8Array([0, 0, 0]), 1),
    ).rejects.toThrow('JPEG_RUNTIME_ABORTED')
  })
})
```

- [ ] **Step 3: Implement native adapter**

Create `packages/luma-jpeg-runtime/worker/native-adapter.ts`:

```ts
import type { InternalJpegEncoder } from './runtime-core'

type NativeJpegEncoder = {
  writeRows: (rows: Uint8Array, rowCount: number) => number | void
  finish: () => Uint8Array
  abort: () => void
  delete?: () => void
}

export type NativeJpegModule = {
  LumaJpegEncoder: new (
    width: number,
    height: number,
    quality: number,
  ) => NativeJpegEncoder
}

export type NativeJpegEncoderFactoryInput = {
  width: number
  height: number
  quality: number
}

export function createNativeJpegEncoderFactory(module: NativeJpegModule) {
  return (input: NativeJpegEncoderFactoryInput): InternalJpegEncoder => {
    const encoder = new module.LumaJpegEncoder(
      input.width,
      input.height,
      input.quality,
    )
    let aborted = false
    let finished = false

    return {
      async writeRows(rows, rowCount) {
        if (aborted) throw new Error('JPEG_RUNTIME_ABORTED')
        if (finished) throw new Error('JPEG_RUNTIME_FINISHED')
        encoder.writeRows(rows, rowCount)
      },
      async finish() {
        if (aborted) throw new Error('JPEG_RUNTIME_ABORTED')
        if (finished) throw new Error('JPEG_RUNTIME_FINISHED')
        const bytes = encoder.finish()
        finished = true
        encoder.delete?.()
        return new Blob([bytes], { type: 'image/jpeg' })
      },
      abort() {
        if (aborted || finished) return
        aborted = true
        encoder.abort()
        encoder.delete?.()
      },
    }
  }
}
```

- [ ] **Step 4: Implement the C++ scanline encoder**

Replace the temporary class in
`packages/luma-jpeg-runtime/native/libjpeg_turbo_encoder.cpp` with a real
libjpeg scanline encoder:

```cpp
#include <emscripten/bind.h>
#include <emscripten/val.h>
#include <jpeglib.h>

#include <csetjmp>
#include <cstdint>
#include <stdexcept>
#include <string>
#include <vector>

namespace {

using emscripten::class_;
using emscripten::typed_memory_view;
using emscripten::val;

struct JpegErrorManager {
  jpeg_error_mgr pub;
  jmp_buf jump;
  char message[JMSG_LENGTH_MAX];
};

void errorExit(j_common_ptr cinfo) {
  auto* manager = reinterpret_cast<JpegErrorManager*>(cinfo->err);
  (*cinfo->err->format_message)(cinfo, manager->message);
  longjmp(manager->jump, 1);
}

class LumaJpegEncoder {
 public:
  LumaJpegEncoder(int width, int height, double quality)
      : width_(width), height_(height) {
    if (width <= 0 || height <= 0) {
      throw std::runtime_error("JPEG_INVALID_DIMENSIONS");
    }
    if (quality <= 0 || quality > 1) {
      throw std::runtime_error("JPEG_INVALID_QUALITY");
    }

    cinfo_.err = jpeg_std_error(&error_.pub);
    error_.pub.error_exit = errorExit;
    if (setjmp(error_.jump)) {
      throw std::runtime_error(error_.message);
    }

    jpeg_create_compress(&cinfo_);
    jpeg_mem_dest(&cinfo_, &out_buffer_, &out_size_);
    cinfo_.image_width = static_cast<JDIMENSION>(width_);
    cinfo_.image_height = static_cast<JDIMENSION>(height_);
    cinfo_.input_components = 3;
    cinfo_.in_color_space = JCS_RGB;
    jpeg_set_defaults(&cinfo_);
    cinfo_.comp_info[0].h_samp_factor = 1;
    cinfo_.comp_info[0].v_samp_factor = 1;
    cinfo_.comp_info[1].h_samp_factor = 1;
    cinfo_.comp_info[1].v_samp_factor = 1;
    cinfo_.comp_info[2].h_samp_factor = 1;
    cinfo_.comp_info[2].v_samp_factor = 1;
    jpeg_set_quality(&cinfo_, static_cast<int>(quality * 100 + 0.5), TRUE);
    jpeg_start_compress(&cinfo_, TRUE);
  }

  ~LumaJpegEncoder() { cleanup(); }

  void writeRows(val rows, int row_count) {
    if (aborted_) throw std::runtime_error("JPEG_RUNTIME_ABORTED");
    if (finished_) throw std::runtime_error("JPEG_RUNTIME_FINISHED");
    if (row_count <= 0) throw std::runtime_error("JPEG_INVALID_ROW_COUNT");

    const size_t expected =
        static_cast<size_t>(width_) * static_cast<size_t>(row_count) * 3;
    const size_t byte_length = rows["byteLength"].as<size_t>();
    if (byte_length != expected) {
      throw std::runtime_error("JPEG_ROW_LENGTH_MISMATCH");
    }

    row_buffer_.resize(expected);
    val view = val(typed_memory_view(row_buffer_.size(), row_buffer_.data()));
    view.call<void>("set", rows);

    if (setjmp(error_.jump)) {
      throw std::runtime_error(error_.message);
    }

    JSAMPROW row_pointer[1];
    for (int row = 0; row < row_count; ++row) {
      row_pointer[0] =
          reinterpret_cast<JSAMPROW>(row_buffer_.data() +
                                     static_cast<size_t>(row) * width_ * 3);
      jpeg_write_scanlines(&cinfo_, row_pointer, 1);
      ++written_rows_;
    }
  }

  val finish() {
    if (aborted_) throw std::runtime_error("JPEG_RUNTIME_ABORTED");
    if (finished_) throw std::runtime_error("JPEG_RUNTIME_FINISHED");
    if (written_rows_ != height_) {
      throw std::runtime_error("JPEG_INCOMPLETE_IMAGE");
    }

    if (setjmp(error_.jump)) {
      throw std::runtime_error(error_.message);
    }

    jpeg_finish_compress(&cinfo_);
    finished_ = true;
    val bytes = val::global("Uint8Array").new_(
        typed_memory_view(out_size_, out_buffer_));
    cleanup();
    return bytes;
  }

  void abort() {
    aborted_ = true;
    cleanup();
  }

 private:
  void cleanup() {
    if (cleaned_) return;
    cleaned_ = true;
    jpeg_destroy_compress(&cinfo_);
    if (out_buffer_ != nullptr) {
      free(out_buffer_);
      out_buffer_ = nullptr;
      out_size_ = 0;
    }
  }

  int width_;
  int height_;
  int written_rows_ = 0;
  bool aborted_ = false;
  bool finished_ = false;
  bool cleaned_ = false;
  jpeg_compress_struct cinfo_{};
  JpegErrorManager error_{};
  unsigned char* out_buffer_ = nullptr;
  unsigned long out_size_ = 0;
  std::vector<uint8_t> row_buffer_;
};

}  // namespace

EMSCRIPTEN_BINDINGS(luma_jpeg_runtime) {
  class_<LumaJpegEncoder>("LumaJpegEncoder")
      .constructor<int, int, double>()
      .function("writeRows", &LumaJpegEncoder::writeRows)
      .function("finish", &LumaJpegEncoder::finish)
      .function("abort", &LumaJpegEncoder::abort);
}
```

- [ ] **Step 5: Run native JPEG build**

Run:

```bash
pnpm --filter @lumaforge/luma-jpeg-runtime build:native
```

Expected: PASS and `native:verify` validates `luma_jpeg.js`,
`luma_jpeg.wasm`, and `provenance.json`.

- [ ] **Step 6: Add native module loader**

Create `packages/luma-jpeg-runtime/worker/load-native-module.ts`:

```ts
import { createNativeJpegEncoderFactory } from './native-adapter'
import type { NativeJpegModule } from './native-adapter'

type NativeModuleFactory = (options?: {
  locateFile?: (path: string) => string
}) => Promise<unknown>

function nativeAssetUrl(fileName: string) {
  const currentUrl = new URL(import.meta.url)
  const pathParts = currentUrl.pathname.split('/').filter(Boolean)
  const inBuiltWorkerAssets =
    pathParts.at(-1)?.startsWith('runtime.worker') &&
    pathParts.at(-2) === 'assets'
  const nativeDir = inBuiltWorkerAssets ? '../native/' : '../dist/native/'

  return new URL(`${nativeDir}${fileName}`, import.meta.url).href
}

export async function loadNativeJpegEncoderFactory() {
  const moduleUrl = nativeAssetUrl('luma_jpeg.js')
  const wasmUrl = nativeAssetUrl('luma_jpeg.wasm')
  let moduleImport: { default: NativeModuleFactory }

  try {
    moduleImport = (await import(/* @vite-ignore */ moduleUrl)) as {
      default: NativeModuleFactory
    }
  } catch (error) {
    throw new Error('JPEG_NATIVE_RUNTIME_UNAVAILABLE', { cause: error })
  }

  const module = await moduleImport.default({
    locateFile(path) {
      return path.endsWith('.wasm') ? wasmUrl : path
    },
  })

  return createNativeJpegEncoderFactory(module as NativeJpegModule)
}
```

- [ ] **Step 7: Update runtime core to use async backend factories**

Modify `packages/luma-jpeg-runtime/worker/runtime-core.ts`:

```ts
export type InternalJpegEncoderFactory = (input: {
  width: number
  height: number
  quality: number
}) => InternalJpegEncoder

export type InternalJpegEncoderFactoryLoader =
  () => Promise<InternalJpegEncoderFactory>

export function createJpegRuntimeCore(
  loadEncoderFactory: InternalJpegEncoderFactoryLoader,
) {
  let encoderFactoryPromise: Promise<InternalJpegEncoderFactory> | null = null
  let encoder: InternalJpegEncoder | null = null

  async function getEncoderFactory() {
    encoderFactoryPromise ??= loadEncoderFactory()
    return encoderFactoryPromise
  }

  // In the create request branch:
  // const encoderFactory = await getEncoderFactory()
  // encoder = encoderFactory(request.payload)
}
```

Tests that need the baseline encoder should pass:

```ts
createJpegRuntimeCore(async () => createBaselineJpegEncoder)
```

The worker default should pass `loadNativeJpegEncoderFactory`.

- [ ] **Step 8: Update runtime worker default**

Modify `packages/luma-jpeg-runtime/worker/runtime.worker.ts`:

```ts
import { loadNativeJpegEncoderFactory } from './load-native-module'

// ...
core ??= createJpegRuntimeCore(loadNativeJpegEncoderFactory)
```

- [ ] **Step 9: Run package tests and build**

Run:

```bash
pnpm --filter @lumaforge/luma-jpeg-runtime test
pnpm --filter @lumaforge/luma-jpeg-runtime build:native
pnpm --filter @lumaforge/luma-jpeg-runtime build
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add packages/luma-jpeg-runtime
git commit -m "feat(jpeg): use libjpeg-turbo scanline encoder"
```

---

### Task 5: Add JPEG Runtime Encode Benchmark

**Files:**
- Create: `packages/luma-jpeg-runtime/benchmarks/bench-jpeg-runtime.html`
- Create: `packages/luma-jpeg-runtime/benchmarks/bench-jpeg-runtime.ts`
- Modify: `packages/luma-jpeg-runtime/package.json`

- [ ] **Step 1: Add benchmark HTML**

Create `packages/luma-jpeg-runtime/benchmarks/bench-jpeg-runtime.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Luma JPEG Runtime Benchmark</title>
  </head>
  <body>
    <button id="run" type="button">Run benchmark</button>
    <button id="copy" type="button">Copy JSONL</button>
    <pre id="output"></pre>
    <script type="module" src="./bench-jpeg-runtime.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: Add benchmark runner**

Create `packages/luma-jpeg-runtime/benchmarks/bench-jpeg-runtime.ts`:

```ts
import { createLumaJpegRuntime } from '../src/runtime'

type Pattern = 'black' | 'gradient' | 'high-entropy'

const width = 11662
const height = 8746
const bandRows = 64
const quality = 0.92
const output = document.querySelector<HTMLPreElement>('#output')!
const runButton = document.querySelector<HTMLButtonElement>('#run')!
const copyButton = document.querySelector<HTMLButtonElement>('#copy')!

function now() {
  return performance.now()
}

function fillRows(pattern: Pattern, rows: Uint8Array, startY: number, rowCount: number) {
  for (let y = 0; y < rowCount; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 3
      if (pattern === 'black') {
        rows[index] = 0
        rows[index + 1] = 0
        rows[index + 2] = 0
      } else if (pattern === 'gradient') {
        rows[index] = Math.round((x / Math.max(1, width - 1)) * 255)
        rows[index + 1] = Math.round(((startY + y) / Math.max(1, height - 1)) * 255)
        rows[index + 2] = 128
      } else {
        const value = (x * 1103515245 + (startY + y) * 12345) >>> 0
        rows[index] = value & 255
        rows[index + 1] = (value >>> 8) & 255
        rows[index + 2] = (value >>> 16) & 255
      }
    }
  }
}

async function runPattern(pattern: Pattern) {
  const runtime = createLumaJpegRuntime()
  const encoder = runtime.createEncoder({ width, height, quality })
  const start = now()
  let writeMs = 0

  try {
    for (let y = 0; y < height; y += bandRows) {
      const rowCount = Math.min(bandRows, height - y)
      const rows = new Uint8Array(width * rowCount * 3)
      fillRows(pattern, rows, y, rowCount)
      const writeStart = now()
      await encoder.writeRows(rows, rowCount)
      writeMs += now() - writeStart
    }

    const finishStart = now()
    const blob = await encoder.finish()
    const finishMs = now() - finishStart
    return {
      pattern,
      width,
      height,
      megapixels: Math.round((width * height) / 10_000) / 100,
      quality,
      bandRows,
      writeMs,
      finishMs,
      totalMs: now() - start,
      outputBytes: blob.size,
      userAgent: navigator.userAgent,
    }
  } finally {
    runtime.dispose()
  }
}

runButton.addEventListener('click', async () => {
  output.textContent = ''
  const rows = []
  for (const pattern of ['black', 'gradient', 'high-entropy'] as const) {
    const record = await runPattern(pattern)
    rows.push(JSON.stringify(record))
    output.textContent = rows.join('\n')
  }
})

copyButton.addEventListener('click', async () => {
  await navigator.clipboard.writeText(output.textContent ?? '')
})
```

- [ ] **Step 3: Run benchmark server**

Run:

```bash
pnpm --filter @lumaforge/luma-jpeg-runtime build:native
pnpm --filter @lumaforge/luma-jpeg-runtime bench:serve
```

Open `http://localhost:4175/benchmarks/bench-jpeg-runtime.html`, click
`Run benchmark`, and copy JSONL into the task notes.

Expected: each row reports `width: 11662`, `height: 8746`, `outputBytes > 0`,
and `totalMs`.

- [ ] **Step 4: Commit**

```bash
git add packages/luma-jpeg-runtime/benchmarks packages/luma-jpeg-runtime/package.json
git commit -m "test(jpeg): add browser encode benchmark"
```

---

### Task 6: Add RAW Processed-Window Export Session Contract

**Files:**
- Modify: `packages/luma-raw-runtime/src/types.ts`
- Modify: `packages/luma-raw-runtime/src/worker-protocol.ts`
- Modify: `packages/luma-raw-runtime/src/runtime.ts`
- Modify: `packages/luma-raw-runtime/worker/native-types.ts`
- Modify: `packages/luma-raw-runtime/worker/native-adapter.ts`
- Modify: `packages/luma-raw-runtime/worker/native-adapter.test.ts`
- Modify: `packages/luma-raw-runtime/worker/runtime-core.ts`
- Modify: `packages/luma-raw-runtime/worker/runtime-core.test.ts`

- [ ] **Step 1: Add type test for processed-window timings**

Add to `packages/luma-raw-runtime/src/types.test.ts`:

```ts
import type {
  LumaRawProcessedWindow,
  LumaRawProcessedWindowTimings,
} from './types'

it('types processed-window export timing payloads', () => {
  const timings: LumaRawProcessedWindowTimings = {
    setup: 1,
    open: 2,
    unpack: 3,
    process: 4,
    outputCopy: 5,
    total: 15,
  }
  const window: LumaRawProcessedWindow = {
    rect: { x: 0, y: 0, width: 2, height: 2 },
    workingSpace: 'linear-prophoto-rgb',
    data: new Uint16Array(12),
    width: 2,
    height: 2,
    stride: 6,
    normalized: false,
    orientationApplied: true,
    colorApplied: true,
    warnings: [],
    timings,
  }

  expect(window.timings?.process).toBe(4)
})
```

- [ ] **Step 2: Run type test and verify failure**

Run:

```bash
pnpm test:run packages/luma-raw-runtime/src/types.test.ts -t "processed-window export timing"
```

Expected: FAIL because `LumaRawProcessedWindowTimings` does not exist.

- [ ] **Step 3: Add timing types**

Modify `packages/luma-raw-runtime/src/types.ts`:

```ts
export type LumaRawProcessedWindowTimings = {
  setup?: number
  open?: number
  unpack?: number
  process?: number
  outputCopy?: number
  orientation?: number
  total: number
}
```

Extend `LumaRawProcessedWindow`:

```ts
  timings?: LumaRawProcessedWindowTimings
```

- [ ] **Step 4: Add native adapter test**

Add to `packages/luma-raw-runtime/worker/native-adapter.test.ts`:

```ts
it('normalizes processed-window timings from native output', () => {
  const processor = createProcessor({
    processedWindow: {
      rect: { x: 0, y: 0, width: 1, height: 1 },
      workingSpace: 'linear-prophoto-rgb',
      data: new Uint16Array([1, 2, 3]),
      width: 1,
      height: 1,
      stride: 3,
      normalized: false,
      orientationApplied: true,
      colorApplied: true,
      warnings: [],
      timings: {
        open: 1,
        unpack: 2,
        process: 3,
        outputCopy: 4,
        total: 10,
      },
    },
  })

  expect(
    processor.readProcessedWindow({
      outputRect: { x: 0, y: 0, width: 1, height: 1 },
      halo: { left: 0, top: 0, right: 0, bottom: 0 },
    }).timings,
  ).toEqual({
    open: 1,
    unpack: 2,
    process: 3,
    outputCopy: 4,
    total: 10,
  })
})
```

- [ ] **Step 5: Normalize timings**

Modify `packages/luma-raw-runtime/worker/native-adapter.ts` with:

```ts
function normalizeProcessedWindowTimings(value: unknown) {
  if (value === undefined || value === null) return undefined
  const raw = asRecord(value)
  const total = asFiniteNumber(raw.total, 'processedWindow.timings.total')
  return {
    setup: asFiniteNumberOrUndefined(raw.setup),
    open: asFiniteNumberOrUndefined(raw.open),
    unpack: asFiniteNumberOrUndefined(raw.unpack),
    process: asFiniteNumberOrUndefined(raw.process),
    outputCopy: asFiniteNumberOrUndefined(raw.outputCopy),
    orientation: asFiniteNumberOrUndefined(raw.orientation),
    total,
  }
}
```

When normalizing `readProcessedWindow`, include:

```ts
timings: normalizeProcessedWindowTimings(raw.timings),
```

- [ ] **Step 6: Add optional export-session native methods**

Modify `packages/luma-raw-runtime/worker/native-types.ts`:

```ts
export type LumaRawNativeProcessedWindowExportSessionInfo = {
  active: true
}
```

Extend `LumaRawNativeProcessor`:

```ts
  beginProcessedWindowExport?: () => LumaRawNativeProcessedWindowExportSessionInfo
  endProcessedWindowExport?: () => void
```

Extend the embind type in `native-adapter.ts` with matching optional methods and
pass them through:

```ts
beginProcessedWindowExport: native.beginProcessedWindowExport
  ? () => native.beginProcessedWindowExport!() as { active: true }
  : undefined,
endProcessedWindowExport: native.endProcessedWindowExport
  ? () => native.endProcessedWindowExport!()
  : undefined,
```

- [ ] **Step 7: Add runtime-core session lifecycle test**

Add to `packages/luma-raw-runtime/worker/runtime-core.test.ts`:

```ts
it('uses native processed-window export lifecycle when available', async () => {
  const calls: string[] = []
  const baseFactory = makeNativeFactory()
  const core = createRuntimeCore({
    createProcessor() {
      const processor = baseFactory.createProcessor()
      return {
        ...processor,
        beginProcessedWindowExport() {
          calls.push('begin')
          return { active: true }
        },
        readProcessedWindow(request) {
          calls.push(`read:${request.outputRect.y}`)
          return {
            rect: request.outputRect,
            workingSpace: 'linear-prophoto-rgb',
            data: new Uint16Array(request.outputRect.width * request.outputRect.height * 3),
            width: request.outputRect.width,
            height: request.outputRect.height,
            stride: request.outputRect.width * 3,
            normalized: false,
            orientationApplied: true,
            colorApplied: true,
            warnings: [],
            timings: { total: 1 },
          }
        },
        endProcessedWindowExport() {
          calls.push('end')
        },
      }
    },
  })

  await core.handleRequest({
    id: 'open',
    type: 'openSession',
    payload: {
      fileBuffer: new ArrayBuffer(4),
      fileName: 'sample.RAF',
      fileSize: 4,
      sessionId: 'session-1',
    },
  })
  await core.handleRequest({
    id: 'begin',
    type: 'beginProcessedWindowExportFromSession',
    payload: { sessionId: 'session-1' },
  })
  await core.handleRequest({
    id: 'read',
    type: 'readProcessedWindowFromSession',
    payload: {
      sessionId: 'session-1',
      request: {
        outputRect: { x: 0, y: 0, width: 1, height: 1 },
        halo: { left: 0, top: 0, right: 0, bottom: 0 },
      },
    },
  })
  await core.handleRequest({
    id: 'end',
    type: 'endProcessedWindowExportFromSession',
    payload: { sessionId: 'session-1' },
  })

  expect(calls).toEqual(['begin', 'read:0', 'end'])
})
```

- [ ] **Step 8: Add worker protocol request types**

Modify `packages/luma-raw-runtime/src/worker-protocol.ts`:

```ts
  | 'beginProcessedWindowExportFromSession'
  | 'endProcessedWindowExportFromSession'
```

Add payload mappings:

```ts
  beginProcessedWindowExportFromSession: LumaRawWorkerSessionPayload
  endProcessedWindowExportFromSession: LumaRawWorkerSessionPayload
```

Add response mappings:

```ts
  beginProcessedWindowExportFromSession: { active: true }
  endProcessedWindowExportFromSession: { ended: true }
```

- [ ] **Step 9: Implement runtime-core request handling**

In `packages/luma-raw-runtime/worker/runtime-core.ts`, add branches:

```ts
case 'beginProcessedWindowExportFromSession': {
  const session = requireSession(request.payload.sessionId)
  const active = session.processor.beginProcessedWindowExport?.() ?? { active: true }
  return successResponse(request, active)
}
case 'endProcessedWindowExportFromSession': {
  const session = requireSession(request.payload.sessionId)
  session.processor.endProcessedWindowExport?.()
  return successResponse(request, { ended: true })
}
```

Use the existing session lookup and success-response helpers in the file. If the
helper names differ, keep the current local naming and return the same payloads.

- [ ] **Step 10: Run raw runtime tests**

Run:

```bash
pnpm --filter @lumaforge/luma-raw-runtime test
```

Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add packages/luma-raw-runtime/src packages/luma-raw-runtime/worker
git commit -m "feat(raw): add processed-window export session contract"
```

---

### Task 7: Implement Native Processed-Window Export Session Timings

**Files:**
- Modify: `packages/luma-raw-runtime/native/libraw_wrapper.cpp`
- Test: `packages/luma-raw-runtime/src/native-smoke.test.ts`

- [ ] **Step 1: Add native smoke expectation for processed-window timings**

Extend the supported fixture path in `packages/luma-raw-runtime/src/native-smoke.test.ts`
with:

```ts
const capability = await session.probeExportCapability()
if (capability.supported && capability.windows.librawProcessed) {
  await session.beginProcessedWindowExport?.()
  try {
    const window = await session.readProcessedWindow({
      outputRect: { x: 0, y: 0, width: 16, height: 16 },
      halo: { left: 0, top: 0, right: 0, bottom: 0 },
    })
    expect(window.timings?.total).toBeGreaterThanOrEqual(0)
    expect(window.timings?.process).toBeGreaterThanOrEqual(0)
  } finally {
    await session.endProcessedWindowExport?.()
  }
}
```

- [ ] **Step 2: Run smoke test and verify failure**

Run:

```bash
. "$HOME/.cache/lumaforge-emsdk/emsdk_env.sh" >/dev/null
pnpm --filter @lumaforge/luma-raw-runtime build:native
pnpm --filter @lumaforge/luma-raw-runtime test:native-smoke
```

Expected: FAIL because native processed windows do not yet include timing output
or because session lifecycle methods are not exposed from the public session.

- [ ] **Step 3: Add C++ timing helpers**

Modify `packages/luma-raw-runtime/native/libraw_wrapper.cpp`:

```cpp
val timingObject(double setup, double open, double unpack, double process,
                 double output_copy, double orientation, double total) {
  val timings = val::object();
  timings.set("setup", setup);
  timings.set("open", open);
  timings.set("unpack", unpack);
  timings.set("process", process);
  timings.set("outputCopy", output_copy);
  timings.set("orientation", orientation);
  timings.set("total", total);
  return timings;
}
```

In `readProcessedWindow`, capture:

```cpp
const double total_start = nowMs();
const double setup_start = nowMs();
// parse request, validate orientation, calculate source crop
const double setup_end = nowMs();
const double open_start = nowMs();
// open_buffer
const double open_end = nowMs();
const double unpack_start = nowMs();
// unpack
const double unpack_end = nowMs();
const double process_start = nowMs();
// dcraw_process
const double process_end = nowMs();
const double copy_start = nowMs();
// copy_mem_image and output_data population
const double copy_end = nowMs();
```

Set output timings:

```cpp
output.set("timings",
           timingObject(setup_end - setup_start, open_end - open_start,
                        unpack_end - unpack_start, process_end - process_start,
                        copy_end - copy_start, 0, nowMs() - total_start));
```

- [ ] **Step 4: Expose lifecycle methods in public session**

Modify `packages/luma-raw-runtime/src/types.ts`:

```ts
beginProcessedWindowExport?: (signal?: AbortSignal) => Promise<{ active: true }>
endProcessedWindowExport?: (signal?: AbortSignal) => Promise<{ ended: true }>
```

Add methods to `LumaRawDecodeSession` in `packages/luma-raw-runtime/src/runtime.ts`
by sending the new worker protocol requests.

- [ ] **Step 5: Run native smoke**

Run:

```bash
. "$HOME/.cache/lumaforge-emsdk/emsdk_env.sh" >/dev/null
pnpm --filter @lumaforge/luma-raw-runtime build:native
pnpm --filter @lumaforge/luma-raw-runtime test:native-smoke
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/luma-raw-runtime/native/libraw_wrapper.cpp packages/luma-raw-runtime/src packages/luma-raw-runtime/worker
git commit -m "feat(raw): report processed-window export timings"
```

---

### Task 8: Wire RAW Export-Session Lifecycle Into Full-Resolution Worker

**Files:**
- Modify: `src/lib/raw/export-runtime-adapter.ts`
- Modify: `src/lib/raw/export-runtime-adapter.test.ts`
- Modify: `src/lib/export/full-res-export.worker.ts`

- [ ] **Step 1: Add adapter lifecycle test**

Add to `src/lib/raw/export-runtime-adapter.test.ts`:

```ts
it('passes through optional processed-window export lifecycle methods', async () => {
  const session = {
    probeExportCapability: vi.fn(),
    readRawWindow: vi.fn(),
    readProcessedWindow: vi.fn(),
    beginProcessedWindowExport: vi.fn(async () => ({ active: true })),
    endProcessedWindowExport: vi.fn(async () => ({ ended: true })),
  }

  const exportSession = createRawExportSession(session)

  await expect(exportSession.beginProcessedWindowExport?.()).resolves.toEqual({
    active: true,
  })
  await expect(exportSession.endProcessedWindowExport?.()).resolves.toEqual({
    ended: true,
  })
})
```

- [ ] **Step 2: Run adapter test and verify failure**

Run:

```bash
pnpm test:run src/lib/raw/export-runtime-adapter.test.ts -t "processed-window export lifecycle"
```

Expected: FAIL because `RawExportSession` does not expose lifecycle methods.

- [ ] **Step 3: Extend adapter**

Modify `src/lib/raw/export-runtime-adapter.ts`:

```ts
export type RawExportSession = {
  probeExportCapability: (
    signal?: AbortSignal,
  ) => Promise<LumaRawExportCapability>
  readRawWindow: LumaRawDecodeSession['readRawWindow']
  readProcessedWindow: LumaRawDecodeSession['readProcessedWindow']
  beginProcessedWindowExport?: LumaRawDecodeSession['beginProcessedWindowExport']
  endProcessedWindowExport?: LumaRawDecodeSession['endProcessedWindowExport']
}
```

Return optional pass-throughs:

```ts
    beginProcessedWindowExport: session.beginProcessedWindowExport
      ? (signal) => session.beginProcessedWindowExport?.(signal)
      : undefined,
    endProcessedWindowExport: session.endProcessedWindowExport
      ? (signal) => session.endProcessedWindowExport?.(signal)
      : undefined,
```

Update `isRawExportSession` so lifecycle methods are optional and do not affect
the type guard.

- [ ] **Step 4: Use lifecycle in worker**

Modify `src/lib/export/full-res-export.worker.ts`:

```ts
      const exportSession = createRawExportSession(session)
      const capability = await exportSession.probeExportCapability(
        controller.signal,
      )
      await exportSession.beginProcessedWindowExport?.(controller.signal)
      try {
        const blob = await runFullResolutionJpegExport({
          capability,
          graph: message.graph,
          preferredRows: message.preferredRows,
          quality: message.quality,
          signal: controller.signal,
          readProcessedWindow: exportSession.readProcessedWindow,
          // existing callbacks
        })
        // existing success response
      } finally {
        await exportSession.endProcessedWindowExport?.(controller.signal)
      }
```

Keep `session.dispose()` in its existing outer `finally`.

- [ ] **Step 5: Run worker and adapter tests**

Run:

```bash
pnpm test:run src/lib/raw/export-runtime-adapter.test.ts src/lib/export/full-res-export-client.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/raw/export-runtime-adapter.ts src/lib/raw/export-runtime-adapter.test.ts src/lib/export/full-res-export.worker.ts
git commit -m "feat(export): use processed-window export session"
```

---

### Task 9: Add Precision-Preserving Row-Band Processor

**Files:**
- Create: `src/lib/export/row-band-processor.ts`
- Create: `src/lib/export/row-band-processor.test.ts`
- Modify: `src/lib/export/full-res-export.ts`
- Test: `src/lib/export/full-res-export.test.ts`

- [ ] **Step 1: Add row-band parity tests**

Create `src/lib/export/row-band-processor.test.ts`:

```ts
import type { SupportedExportColorGraphDescriptor } from './color-graph'
import { createRowBandProcessor } from './row-band-processor'

const noLutGraph: SupportedExportColorGraphDescriptor = {
  supported: true,
  outputGamut: 'srgb-rec709',
  outputTransfer: 'srgb',
  lutProfile: null,
  steps: [
    { kind: 'input-linear-prophoto' },
    { kind: 'raw-render-exposure', ev: 0, multiplier: 1 },
    { kind: 'output-srgb' },
  ],
}

describe('createRowBandProcessor', () => {
  it('keeps Float32 math until final RGB8 quantization', () => {
    const processor = createRowBandProcessor({
      width: 2,
      rowBandRows: 1,
      graph: noLutGraph,
    })
    const rows = processor.processUint16Rows(
      new Uint16Array([0, 32768, 65535, 65535, 32768, 0]),
      1,
    )

    expect(rows).toBeInstanceOf(Uint8Array)
    expect(rows).toHaveLength(6)
    expect(rows.some((value) => value > 0)).toBe(true)
  })

  it('reuses the returned RGB8 buffer across row bands', () => {
    const processor = createRowBandProcessor({
      width: 1,
      rowBandRows: 1,
      graph: noLutGraph,
    })
    const first = processor.processUint16Rows(
      new Uint16Array([1000, 2000, 3000]),
      1,
    )
    const second = processor.processUint16Rows(
      new Uint16Array([4000, 5000, 6000]),
      1,
    )

    expect(second.buffer).toBe(first.buffer)
  })
})
```

- [ ] **Step 2: Run row-band tests and verify failure**

Run:

```bash
pnpm test:run src/lib/export/row-band-processor.test.ts
```

Expected: FAIL because `row-band-processor.ts` does not exist.

- [ ] **Step 3: Implement row-band processor**

Create `src/lib/export/row-band-processor.ts`:

```ts
import { getProPhotoToTargetMatrix } from '~/lib/color/matrix'

import type { SupportedExportColorGraphDescriptor } from './color-graph'

const UINT16_MAX = 65535
const CHANNELS = 3
const PROPHOTO_TO_SRGB_MATRIX = getProPhotoToTargetMatrix('srgb-rec709')

function clamp01(value: number) {
  if (value <= 0) return 0
  if (value >= 1) return 1
  return value
}

function clampMin0(value: number) {
  return value < 0 ? 0 : value
}

function linearToSrgb(linear: number) {
  const clamped = clampMin0(linear)
  return clamped <= 0.0031308
    ? clamped * 12.92
    : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055
}

function toSrgbByte(linear: number) {
  return Math.round(clamp01(linearToSrgb(linear)) * 255)
}

export type RowBandProcessorInput = {
  width: number
  rowBandRows: number
  graph: SupportedExportColorGraphDescriptor
}

export function createRowBandProcessor(input: RowBandProcessorInput) {
  if (input.width <= 0 || !Number.isInteger(input.width)) {
    throw new Error('ROW_BAND_INVALID_WIDTH')
  }
  if (input.rowBandRows <= 0 || !Number.isInteger(input.rowBandRows)) {
    throw new Error('ROW_BAND_INVALID_ROWS')
  }

  const maxSamples = input.width * input.rowBandRows * CHANNELS
  const floatScratch = new Float32Array(maxSamples)
  const rgb8 = new Uint8Array(maxSamples)

  if (input.graph.lutProfile !== null) {
    throw new Error('ROW_BAND_LUT_PATH_NOT_WIRED')
  }

  function processFloatRows(source: Float32Array, rowCount: number) {
    const sampleCount = assertRowInput(source, rowCount)
    for (let index = 0; index < sampleCount; index += 3) {
      const sceneR = clampMin0(source[index] ?? 0)
      const sceneG = clampMin0(source[index + 1] ?? 0)
      const sceneB = clampMin0(source[index + 2] ?? 0)
      const displayLinearR = clampMin0(
        PROPHOTO_TO_SRGB_MATRIX[0] * sceneR +
          PROPHOTO_TO_SRGB_MATRIX[1] * sceneG +
          PROPHOTO_TO_SRGB_MATRIX[2] * sceneB,
      )
      const displayLinearG = clampMin0(
        PROPHOTO_TO_SRGB_MATRIX[3] * sceneR +
          PROPHOTO_TO_SRGB_MATRIX[4] * sceneG +
          PROPHOTO_TO_SRGB_MATRIX[5] * sceneB,
      )
      const displayLinearB = clampMin0(
        PROPHOTO_TO_SRGB_MATRIX[6] * sceneR +
          PROPHOTO_TO_SRGB_MATRIX[7] * sceneG +
          PROPHOTO_TO_SRGB_MATRIX[8] * sceneB,
      )
      rgb8[index] = toSrgbByte(displayLinearR)
      rgb8[index + 1] = toSrgbByte(displayLinearG)
      rgb8[index + 2] = toSrgbByte(displayLinearB)
    }

    return rgb8.subarray(0, sampleCount)
  }

  function processUint16Rows(source: Uint16Array, rowCount: number) {
    const sampleCount = assertRowInput(source, rowCount)
    for (let index = 0; index < sampleCount; index += 1) {
      floatScratch[index] = source[index]! / UINT16_MAX
    }
    return processFloatRows(floatScratch.subarray(0, sampleCount), rowCount)
  }

  function assertRowInput(source: Uint16Array | Float32Array, rowCount: number) {
    if (rowCount <= 0 || rowCount > input.rowBandRows) {
      throw new Error('ROW_BAND_INVALID_ROW_COUNT')
    }
    const sampleCount = input.width * rowCount * CHANNELS
    if (source.length !== sampleCount) {
      throw new Error('ROW_BAND_SOURCE_LENGTH_MISMATCH')
    }
    return sampleCount
  }

  return {
    rowBandRows: input.rowBandRows,
    processFloatRows,
    processUint16Rows,
  }
}
```

This first pass wires the no-LUT path. The next step moves the existing LUT path
from `full-res-export.ts` into the same processor without changing math order.

- [ ] **Step 4: Run row-band tests**

Run:

```bash
pnpm test:run src/lib/export/row-band-processor.test.ts
```

Expected: PASS.

- [ ] **Step 5: Move LUT graph code without changing behavior**

Move these private helpers from `src/lib/export/full-res-export.ts` into
`src/lib/export/row-band-processor.ts`:

```text
applySignalRangeForLutInput
removeSignalRangeFromLutOutput
normalizeLutSample
isSimpleNoLutGraph
isSupportedLutGraph
compileGraphApplier
```

Change the processor so `processUint16Rows(...)` fills `floatScratch` and then
calls the same graph applier through `processFloatRows(...)`.

The critical invariant is:

```text
Uint16 RGB -> Float32 scratch -> full graph -> RGB8
```

No LUT/log/gamma stage may read RGB8.

- [ ] **Step 6: Add parity test against existing export output**

Add to `src/lib/export/full-res-export.test.ts`:

```ts
it('row-band processor preserves LUT graph export bytes within tolerance', async () => {
  const writtenRows: Uint8Array[] = []
  const writer = {
    writeRows: vi.fn(async (bytes: Uint8Array) => {
      writtenRows.push(new Uint8Array(bytes))
    }),
    close: vi.fn(
      async () => new Blob([new Uint8Array([1])], { type: 'image/jpeg' }),
    ),
    abort: vi.fn(async () => undefined),
  }

  await runFullResolutionJpegExport({
    capability: makeCapability({ width: 2, height: 2 }),
    graph: {
      supported: true,
      outputGamut: 'srgb-rec709',
      outputTransfer: 'srgb',
      lutProfile: null,
      steps: [
        { kind: 'input-linear-prophoto' },
        IDENTITY_RAW_RENDER_EXPOSURE_STEP,
        { kind: 'output-srgb' },
      ],
    },
    preferredRows: 2,
    readProcessedWindow: async (request) => makeProcessedWindow(request, 32768),
    writerFactory: () => writer,
  })

  expect(writtenRows).toHaveLength(1)
  expect(writtenRows[0]).toEqual(new Uint8Array(12).fill(writtenRows[0]![0]!))
})
```

- [ ] **Step 7: Use row-band processor in export orchestration**

Modify `src/lib/export/full-res-export.ts`:

```ts
import { createRowBandProcessor } from './row-band-processor'
```

Replace:

```ts
const applyGraphToRgbRows = compileGraphApplier(input.graph)
```

with:

```ts
const rowBandProcessor = createRowBandProcessor({
  width: input.capability.width,
  rowBandRows: Math.min(64, stripRows),
  graph: input.graph,
})
```

Replace the full-strip Float32 conversion path:

```ts
const tile = processedWindowToLinearProPhotoTile(processedWindow, strip.output)
const rows = applyGraphToRgbRows(tile.data)
await writer.writeRows(rows, tile.height)
```

with row slices:

```ts
const tile = processedWindowToLinearProPhotoTile(processedWindow, strip.output)
for (let row = 0; row < tile.height; row += rowBandProcessor.rowBandRows) {
  const rowCount = Math.min(rowBandProcessor.rowBandRows, tile.height - row)
  const sourceStart = row * tile.width * 3
  const sourceEnd = sourceStart + rowCount * tile.width * 3
  const rows = rowBandProcessor.processFloatRows(
    tile.data.subarray(sourceStart, sourceEnd),
    rowCount,
  )
  await writer.writeRows(rows, rowCount)
}
```

Expose `rowBandRows` and `processFloatRows(...)` from the processor so existing
`processedWindowToLinearProPhotoTile` can be replaced in a separate commit. This
keeps the first integration small and behaviorally low-risk.

- [ ] **Step 8: Run export tests**

Run:

```bash
pnpm test:run src/lib/export/row-band-processor.test.ts src/lib/export/full-res-export.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/export/row-band-processor.ts src/lib/export/row-band-processor.test.ts src/lib/export/full-res-export.ts src/lib/export/full-res-export.test.ts
git commit -m "feat(export): process color graph in reusable row bands"
```

---

### Task 10: Remove Full-Strip Float32 Allocation

**Files:**
- Modify: `src/lib/export/processed-window-transform.ts`
- Modify: `src/lib/export/processed-window-transform.test.ts`
- Modify: `src/lib/export/row-band-processor.ts`
- Modify: `src/lib/export/full-res-export.ts`
- Test: `src/lib/export/full-res-export.test.ts`

- [ ] **Step 1: Add row-view transform test**

Add to `src/lib/export/processed-window-transform.test.ts`:

```ts
it('returns validated processed-window row views without allocating Float32', () => {
  const window = makeProcessedWindow({
    rect: { x: 0, y: 0, width: 2, height: 2 },
    data: new Uint16Array([
      1, 2, 3, 4, 5, 6,
      7, 8, 9, 10, 11, 12,
    ]),
  })

  const rows = processedWindowToRgb16Rows(window, window.rect)

  expect(rows.width).toBe(2)
  expect(rows.height).toBe(2)
  expect(rows.row(1)).toEqual(new Uint16Array([7, 8, 9, 10, 11, 12]))
})
```

- [ ] **Step 2: Run transform test and verify failure**

Run:

```bash
pnpm test:run src/lib/export/processed-window-transform.test.ts -t "row views"
```

Expected: FAIL because `processedWindowToRgb16Rows` does not exist.

- [ ] **Step 3: Add RGB16 row-view transform**

Modify `src/lib/export/processed-window-transform.ts`:

```ts
export type ProcessedRgb16Rows = {
  width: number
  height: number
  row: (index: number) => Uint16Array
}

export function processedWindowToRgb16Rows(
  window: LumaRawProcessedWindow,
  expectedRect: LumaRawWindowRect,
): ProcessedRgb16Rows {
  assertValidProcessedWindow(window, expectedRect)
  return {
    width: window.width,
    height: window.height,
    row(index) {
      if (index < 0 || index >= window.height || !Number.isInteger(index)) {
        throw new Error(INVALID_PROCESSED_WINDOW)
      }
      const start = index * window.stride
      return window.data.subarray(start, start + window.width * 3)
    },
  }
}
```

Extract the existing validation from `processedWindowToLinearProPhotoTile(...)`
into `assertValidProcessedWindow(...)` and keep existing tests passing.

- [ ] **Step 4: Add Uint16 row-band processor API**

Modify `src/lib/export/row-band-processor.ts`:

```ts
processUint16Rows(source: Uint16Array, rowCount: number) {
  const sampleCount = assertRowInput(source, rowCount)
  for (let index = 0; index < sampleCount; index += 1) {
    floatScratch[index] = source[index]! / UINT16_MAX
  }
  return applyGraph(floatScratch.subarray(0, sampleCount), rgb8, sampleCount)
}
```

Keep `processFloatRows(...)` for tests and for any caller that already has a
Float32 row band.

- [ ] **Step 5: Use row-view transform in full export**

Modify `src/lib/export/full-res-export.ts`:

```ts
const tile = processedWindowToRgb16Rows(processedWindow, strip.output)
for (let row = 0; row < tile.height; row += rowBandProcessor.rowBandRows) {
  const rowCount = Math.min(rowBandProcessor.rowBandRows, tile.height - row)
  const source = new Uint16Array(tile.width * rowCount * 3)
  for (let bandRow = 0; bandRow < rowCount; bandRow += 1) {
    source.set(tile.row(row + bandRow), bandRow * tile.width * 3)
  }
  const rows = rowBandProcessor.processUint16Rows(source, rowCount)
  await writer.writeRows(rows, rowCount)
}
```

The temporary `Uint16Array` is row-band sized, not full-strip sized. It can be
replaced with a reusable buffer in the same file after tests pass.

- [ ] **Step 6: Reuse the row-band Uint16 buffer**

Add before strip loop:

```ts
const rgb16Band = new Uint16Array(
  input.capability.width * rowBandProcessor.rowBandRows * 3,
)
```

Replace the per-band allocation with:

```ts
const sampleCount = tile.width * rowCount * 3
const source = rgb16Band.subarray(0, sampleCount)
for (let bandRow = 0; bandRow < rowCount; bandRow += 1) {
  source.set(tile.row(row + bandRow), bandRow * tile.width * 3)
}
const rows = rowBandProcessor.processUint16Rows(source, rowCount)
```

- [ ] **Step 7: Run targeted tests**

Run:

```bash
pnpm test:run src/lib/export/processed-window-transform.test.ts src/lib/export/row-band-processor.test.ts src/lib/export/full-res-export.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/export/processed-window-transform.ts src/lib/export/processed-window-transform.test.ts src/lib/export/row-band-processor.ts src/lib/export/full-res-export.ts src/lib/export/full-res-export.test.ts
git commit -m "perf(export): remove full-strip float allocation"
```

---

### Task 11: Add Bounded Pipeline Concurrency

**Files:**
- Create: `src/lib/export/pipeline-concurrency.ts`
- Create: `src/lib/export/pipeline-concurrency.test.ts`
- Modify: `src/lib/export/full-res-export.ts`
- Modify: `src/lib/export/full-res-export.test.ts`
- Modify: `src/modules/raw-processor/services/export-system.ts`

- [ ] **Step 1: Add concurrency helper tests**

Create `src/lib/export/pipeline-concurrency.test.ts`:

```ts
import { normalizeExportConcurrency, runOrderedConcurrent } from './pipeline-concurrency'

describe('pipeline concurrency', () => {
  it('normalizes requested concurrency into a bounded value', () => {
    expect(normalizeExportConcurrency(undefined, 'safe')).toBe(1)
    expect(normalizeExportConcurrency(undefined, 'balanced')).toBe(2)
    expect(normalizeExportConcurrency(undefined, 'max')).toBe(3)
    expect(normalizeExportConcurrency(8, 'max')).toBe(3)
  })

  it('commits completed work in source order', async () => {
    const committed: number[] = []
    await runOrderedConcurrent(
      [0, 1, 2],
      2,
      async (value) => ({ index: value, value }),
      async (result) => {
        committed.push(result.value)
      },
    )

    expect(committed).toEqual([0, 1, 2])
  })
})
```

- [ ] **Step 2: Run concurrency tests and verify failure**

Run:

```bash
pnpm test:run src/lib/export/pipeline-concurrency.test.ts
```

Expected: FAIL because `pipeline-concurrency.ts` does not exist.

- [ ] **Step 3: Implement concurrency helper**

Create `src/lib/export/pipeline-concurrency.ts`:

```ts
import type { ExportFidelity } from '~/lib/gl/export'

export function normalizeExportConcurrency(
  requested: number | undefined,
  fidelity: ExportFidelity,
) {
  const defaultValue = fidelity === 'safe' ? 1 : fidelity === 'balanced' ? 2 : 3
  const raw = requested ?? defaultValue
  if (!Number.isFinite(raw) || raw <= 0) {
    throw new Error('FULL_RES_EXPORT_INVALID_CONCURRENCY')
  }
  return Math.min(3, Math.max(1, Math.floor(raw)))
}

export async function runOrderedConcurrent<T, R extends { index: number }>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
  commit: (result: R) => Promise<void>,
) {
  const limit = Math.min(items.length, Math.max(1, concurrency))
  const results = new Map<number, R>()
  let nextStart = 0
  let nextCommit = 0

  async function runOne(startIndex: number): Promise<void> {
    const result = await worker(items[startIndex]!, startIndex)
    results.set(startIndex, result)

    while (results.has(nextCommit)) {
      const ready = results.get(nextCommit)!
      results.delete(nextCommit)
      await commit(ready)
      nextCommit += 1
    }

    if (nextStart < items.length) {
      const current = nextStart
      nextStart += 1
      await runOne(current)
    }
  }

  const starters: Promise<void>[] = []
  while (nextStart < limit) {
    const current = nextStart
    nextStart += 1
    starters.push(runOne(current))
  }

  await Promise.all(starters)
}
```

- [ ] **Step 4: Extend export input**

Modify `src/lib/export/full-res-export.ts`:

```ts
  concurrency?: number
```

Use `normalizeExportConcurrency(input.concurrency, 'balanced')` initially, and
record it in summary metrics.

- [ ] **Step 5: Add export ordered-write test**

Append to `src/lib/export/full-res-export.test.ts`:

```ts
it('keeps JPEG writes ordered when concurrency is greater than one', async () => {
  const writes: number[] = []
  const writer = {
    writeRows: vi.fn(async (_bytes: Uint8Array, rowCount: number) => {
      writes.push(rowCount)
    }),
    close: vi.fn(
      async () => new Blob([new Uint8Array([1])], { type: 'image/jpeg' }),
    ),
    abort: vi.fn(async () => undefined),
  }

  await runFullResolutionJpegExport({
    capability: makeCapability({ width: 4, height: 8 }),
    graph: {
      supported: true,
      outputGamut: 'srgb-rec709',
      outputTransfer: 'srgb',
      lutProfile: null,
      steps: [
        { kind: 'input-linear-prophoto' },
        IDENTITY_RAW_RENDER_EXPOSURE_STEP,
        { kind: 'output-srgb' },
      ],
    },
    preferredRows: 4,
    concurrency: 2,
    readProcessedWindow: async (request) => makeProcessedWindow(request),
    writerFactory: () => writer,
  })

  expect(writes).toEqual([4, 4])
})
```

- [ ] **Step 6: Wire ordered concurrent preparation**

In `src/lib/export/full-res-export.ts`, split strip work into:

```ts
type PreparedStrip = {
  index: number
  rows: Array<{ bytes: Uint8Array; rowCount: number }>
  metrics: {
    rawReadMs: number
    colorMs: number
    totalMs: number
  }
}
```

Use `runOrderedConcurrent`:

```ts
await runOrderedConcurrent(
  strips,
  concurrency,
  async (strip, index) => {
    // read processed window and create row-band RGB8 chunks
    return { index, rows, metrics }
  },
  async (prepared) => {
    const jpegStart = nowMs()
    for (const rowChunk of prepared.rows) {
      await writer!.writeRows(rowChunk.bytes, rowChunk.rowCount)
    }
    const jpegWriteMs = nowMs() - jpegStart
    // progress and metric emission stay here, in commit order
  },
)
```

The prepared rows are strip-sized at most; do not increase concurrency above the
normalized cap.

- [ ] **Step 7: Add resource fallback behavior**

When a resource-looking error occurs, retry with:

```ts
concurrency = 1
stripRows = reduceStripRows(stripRows, MIN_EXPORT_STRIP_ROWS)
```

Keep the existing output-resolution-preserving retry behavior.

- [ ] **Step 8: Run export tests**

Run:

```bash
pnpm test:run src/lib/export/pipeline-concurrency.test.ts src/lib/export/full-res-export.test.ts src/modules/raw-processor/__tests__/export-system.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/export/pipeline-concurrency.ts src/lib/export/pipeline-concurrency.test.ts src/lib/export/full-res-export.ts src/lib/export/full-res-export.test.ts src/modules/raw-processor/services/export-system.ts src/modules/raw-processor/__tests__/export-system.test.ts
git commit -m "perf(export): add bounded strip concurrency"
```

---

### Task 12: Run End-to-End Performance Validation

**Files:**
- Modify: `docs/specs/2026-04-22-phase1-test-matrix.md`
- Modify: `docs/plans/2026-04-27-export-performance-optimization-implementation-plan.md`

- [ ] **Step 1: Run automated unit and package gates**

Run:

```bash
pnpm --filter @lumaforge/luma-jpeg-runtime build:native
pnpm --filter @lumaforge/luma-jpeg-runtime test
pnpm --filter @lumaforge/luma-jpeg-runtime build
pnpm --filter @lumaforge/luma-raw-runtime build:native
pnpm --filter @lumaforge/luma-raw-runtime test:native-smoke
pnpm --filter @lumaforge/luma-raw-runtime test
pnpm test:run src/lib/export src/lib/raw src/modules/raw-processor
pnpm build
```

Expected: all commands PASS.

- [ ] **Step 2: Run JPEG encode benchmark**

Run:

```bash
pnpm --filter @lumaforge/luma-jpeg-runtime bench:serve
```

Open `http://localhost:4175/benchmarks/bench-jpeg-runtime.html`, run the
benchmark, and record JSONL rows for:

```text
black
gradient
high-entropy
```

Acceptance: each 100MP row reports a complete JPEG with `outputBytes > 0`, and
`totalMs` is no longer close to the old pure TypeScript floor.

- [ ] **Step 3: Run browser UI export validation**

Start production preview:

```bash
pnpm build
pnpm serve --host 0.0.0.0
```

Validate in Chrome or Edge:

```text
open /raw
load /workspaces/LumaForge/test-images/SGL00940.ARW
export full-resolution JPEG with Neutral/Off
confirm JPEG exported
decode downloaded Blob with createImageBitmap
confirm dimensions match runtime full-resolution dimensions
copy export metric JSONL
```

Validate the 100MP target:

```text
open /raw
load /workspaces/LumaForge/test-images/Fujifilm - GFX100RF - 16bit lossless compressed (4_3).RAF
load the supported V-Log LUT used in previous acceptance
export full-resolution JPEG
confirm JPEG exported
decode downloaded Blob with createImageBitmap
confirm dimensions are 11662 x 8746
copy export metric JSONL
```

Safari validation must be run on a Safari host with the same production build.

- [ ] **Step 4: Update acceptance matrix**

Append rows to `docs/specs/2026-04-22-phase1-test-matrix.md`:

```md
| Full-resolution export perf | 61MP Sony ARW | Chrome/Edge production preview | Measured | Record total milliseconds, decoded dimensions, and metric JSONL summary |
| Full-resolution export perf | 100MP Fujifilm GFX100RF RAF + supported V-Log LUT | Chrome/Edge production preview | Measured | Record total milliseconds, decoded dimensions `11662x8746`, and metric JSONL summary |
| Full-resolution export perf | 100MP JPEG encode-only | `@lumaforge/luma-jpeg-runtime` benchmark | Measured | Record black, gradient, and high-entropy milliseconds |
| Full-resolution export perf | Safari smoke | Safari production preview | Measured or blocked | Record decoded dimensions and metric JSONL summary, or the exact blocker |
```

- [ ] **Step 5: Record plan completion evidence**

In this plan file, add a final section named `Completion Evidence` with:

```md
## Completion Evidence

- JPEG native build:
- RAW native build:
- Automated tests:
- Chrome/Edge 61MP export:
- Chrome/Edge 100MP export:
- Safari export:
- Before/after timing summary:
```

Fill each line with the concrete command output summary or measured timing.

- [ ] **Step 6: Commit**

```bash
git add docs/specs/2026-04-22-phase1-test-matrix.md docs/plans/2026-04-27-export-performance-optimization-implementation-plan.md
git commit -m "docs(export): record export performance validation"
```

---

## Self-review checklist

- Spec coverage:
  - Baseline telemetry and JSONL evidence: Tasks 1, 2, and 12.
  - libjpeg-turbo only, no mozjpeg: Tasks 3, 4, and 5.
  - Native RAW processed-window setup reduction: Tasks 6, 7, and 8.
  - Bounded concurrency with ordered JPEG writes: Task 11.
  - Float32 precision before final RGB8 quantization: Tasks 9 and 10.
  - Browser-local fail-closed behavior and acceptance: Tasks 4, 8, 11, and 12.
- Type consistency:
  - `ExportPerfMetric` flows from `export-metrics.ts` through client worker messages.
  - `LumaRawProcessedWindowTimings` is optional on `LumaRawProcessedWindow`.
  - `beginProcessedWindowExport` and `endProcessedWindowExport` are optional session capabilities.
  - JPEG runtime public API remains `createEncoder`, `writeRows`, `finish`, `abort`.
- Execution safety:
  - Each native build step has a verification command.
  - Every runtime behavior change has a targeted Vitest command.
  - Each major stage ends with a commit.
