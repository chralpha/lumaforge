# CPU Preview Safety-Net (GPU-degrade path)

- **Date:** 2026-05-30
- **Status:** Approved (design)
- **Scope:** Phase 2 of the "CapabilityVector as single source of runtime
  acceleration decisions" effort. Phase 1 (retire legacy export capacity inputs)
  is delivered to `main`.
- **Related:** `project_export_capability_single_source` (memory);
  `2026-05-30-retire-legacy-export-capacity-inputs-design.md`.

## Problem

`/raw` hard-fails the entire workspace when the GPU is insufficient. The single
gate `useCapabilityGate` (consumed at `src/modules/raw-processor/RawProcessorView.tsx`
~line 339) returns `supportStatus: 'unsupported'` — a full-page block — for three
reasons: no WebGL2, low fragment-shader float precision (`!toneHighPrecision`), or
no cross-origin isolation (COI).

Two of those are recoverable. RAW decode and the *authoritative* full-resolution
export already run on the **CPU** (`row-band-processor` in
`@lumaforge/luma-color-runtime`, driven from `src/lib/export/full-res-export.ts`),
using the color graph from `resolveExportColorGraph`. So when the GPU can't render
the interactive preview, we can still render a preview on the CPU through the same
authoritative color graph, keeping the `preview → look → export` loop alive instead
of dead-ending the user.

The COI case is **not** recoverable here: the RAW runtime hard-gates decode on COI
(`RAW_CROSS_ORIGIN_ISOLATION_REQUIRED`), so with no COI there is no decoded data to
render. That case must keep hard-failing.

The trigger population (WebGL2 present-but-low-precision, or no WebGL2, on a
COI-capable browser) is a small, shrinking tail — old/cheap GPUs, software GL
(SwiftShader), locked-down environments. This is therefore a **safety net**, not a
bid for GPU-parity interactivity.

## Goals

- When the GPU is insufficient (no WebGL2 or `!toneHighPrecision`) but COI is
  present, enter a **CPU preview mode** instead of hard-failing, so the user can
  still adjust look/LUT/tone, see a processed preview, and export.
- Render the CPU preview through the **authoritative export color graph**, so the
  preview is color-correct (matches export) by construction — not a "looks-ok"
  approximation.
- Keep the CPU render off the main thread (Web Worker) so the tab stays responsive
  on exactly the weak hardware that triggers this.

## Non-Goals (explicit)

- Merging GPU facts (`WebGLCapabilities`) into `CapabilityVector`. The gate already
  reads GPU facts locally; the merge is a separate architectural cleanup.
- Runtime GPU-failure fallback (GPU device whose pipeline fails mid-session). This
  is an upfront, load-time capability decision only.
- Live per-frame CPU re-render during slider drag. CPU preview re-renders on
  parameter **apply/release**.
- CPU split-compare, CPU histogram, bounded-HQ CPU render, SharedArrayBuffer
  zero-copy. All deferred.
- Any change to the export executor or color math.

## Design

### Unit 1 — Gate trigger & preview mode

Extend `useCapabilityGate` to return a discriminated result carrying a preview
mode (exact field shape decided in the plan; semantics below):

- COI missing → `supportStatus: 'unsupported'` — **hard-fail, unchanged**.
- (COI present) WebGL2 missing **or** `!toneHighPrecision` →
  `supportStatus: 'degraded'`, `previewMode: 'cpu'`, with a human reason.
- otherwise → `supportStatus: 'supported'`, `previewMode: 'gpu'`.

`RawProcessorView` hard-blocks only on `'unsupported'`. On `'degraded'` it enters
the normal workspace in CPU mode behind a **non-blocking, dismissible banner**:
"GPU preview unavailable — using a slower CPU preview; live compare and histogram
are off." The `previewMode` flows down to the preview surface and the
compare/histogram controls.

### Unit 2 — CPU preview worker

New `src/lib/preview/cpu-preview.worker.ts`:

- **Input message:** `{ data: Uint16Array (rgb-u16 linear-ProPhoto, transferable),
  width, height, graph: SupportedExportColorGraphDescriptor, renderExposure, requestId }`.
- Runs `createRowBandProcessor({ width, rowBandRows, graph })` band-by-band over the
  window. `processUint16Rows` returns **packed RGB bytes** and **reuses its output
  buffer**, so each band is expanded to **RGBA** (alpha = 255) and copied into the
  assembled frame before the next band (mirrors `full-res-export.ts`).
- **Output message:** `{ requestId, rgba: Uint8ClampedArray (transferable), width, height }`
  or `{ requestId, error }`.

The worker depends only on `@lumaforge/luma-color-runtime` (color), never on the
RAW runtime or GL. It does not decode; it consumes the already-decoded window.

### Unit 3 — CPU preview client (main thread)

New client/hook (e.g. `src/lib/preview/cpu-preview-client.ts` +
`src/modules/raw-processor/hooks/useCpuPreview.ts`):

- Owns the worker lifecycle.
- Builds the graph via `resolveExportColorGraph(params)` (same call the GPU
  pipeline's telemetry uses), threads `renderExposure` the same way the export path
  does (see Correctness).
- Posts a render request on parameter apply/release; **coalesces** requests
  (latest-wins, drops responses for superseded `requestId`s).
- Returns the latest RGBA frame + an in-flight flag.

### Unit 4 — CPU preview surface & UI degradations

- New `CpuPreviewCanvas` component: a 2D-canvas that `putImageData`s the latest RGBA
  frame (fit-scaled to the element) and shows a **spinner overlay** while a render
  is in flight.
- The preview mount selects `CpuPreviewCanvas` vs the existing GPU `PreviewCanvas`
  by `previewMode` — keeping the two executors as separate focused units (the GPU
  `PreviewCanvas` is not made polymorphic).
- Source resolution: the **quick** decode window (already capped), never bounded-HQ.
- Degradations in CPU mode:
  - Compare → processed-only plus an **"original" toggle**, where "original" is a
    neutral (no-look, no-LUT) CPU render of the same window via the graph. Live
    split-compare is disabled.
  - Histogram reuses its existing `'unsupported'` state (shows unavailable).
  - Tone / intensity / LUT / builtin presets still apply — re-render on release.

### Unit 5 — Data flow

Decode (RAW runtime, requires COI) → quick `uint16-rgb` linear-ProPhoto window on
the main thread (already produced; today feeds `createRawUploadInput`) → in CPU
mode routed to the CPU preview client → worker renders RGBA → `CpuPreviewCanvas`
draws. Parameter change → debounce → re-render latest.

### Correctness (color contract)

The CPU preview reuses the authoritative export graph, so it matches export by
construction. The one risk is **render-exposure**: the GPU preview applies
`rawRenderExposureMultiplier` as a shader uniform on top of the linear window,
while the export/CPU path applies render-exposure through its own mechanism. The
plan MUST verify how `full-res-export` threads render-exposure and apply it
identically in the CPU preview, so CPU preview, GPU preview, and export agree.
This is the gating correctness check, covered by a parity test (below).

### Error handling

Worker init / transfer / render failure surfaces a clear in-preview error and
falls back to the embedded camera thumbnail; it never crashes the workspace.
Export is unaffected: it is already CPU, and the GPU `previewCopyCanvas` step in
`orchestrate-full-res-export.ts` is already null-safe (`if (pipeline && previewSize)`)
— in CPU mode (no GPU pipeline) the optional "copy preview image" convenience
simply becomes unavailable.

## Testing

- **Gate matrix:** webgl2 × toneHighPrecision × COI → expected
  `supportStatus`/`previewMode` (incl. COI-missing still `'unsupported'`).
- **CPU client logic:** request coalescing (stale responses dropped), and
  RGB→RGBA band assembly correctness against a known small graph + window.
- **Color-contract parity:** a CPU-rendered small frame equals the export path
  output for the same params/graph/window (both use `row-band-processor`),
  including render-exposure. This is the key contract guard.
- **`CpuPreviewCanvas` component:** draws the latest frame, spinner while
  in-flight, processed/original toggle.
- Reuse existing `luma-color-runtime` graph tests; do not duplicate color math.

## Verification

Per `AGENTS.md`: this is an app-surface + UI change touching `src` and a new
worker. Run `pnpm lint:check`, `pnpm test:app`, and (since a new worker + preview
path is user-visible `/raw` behavior) browser validation on a forced-degrade
environment. `pnpm test:run`/`build` at closeout.

## Risks & open items for the plan

- **Render-exposure threading** (above) — verify before claiming color parity.
- **Worker bundling** under Vite (the repo already bundles workers, e.g.
  `full-res-export.worker.ts`; follow that pattern).
- **Forced-degrade harness for browser validation** — how to simulate
  `!toneHighPrecision` / no-WebGL2 for manual/automated validation (the plan
  defines the approach; capability override hook likely).
