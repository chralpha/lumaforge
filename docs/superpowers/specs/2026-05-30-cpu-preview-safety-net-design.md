# CPU Preview Safety-Net (GPU-degrade path)

- **Date:** 2026-05-30
- **Status:** Approved (design), revised after adversarial review
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

`@lumaforge/luma-color-runtime` is **pure TypeScript with no dependencies and no
WASM** — relevant to the failure model below.

## Goals

- When the GPU is insufficient (no WebGL2 or `!toneHighPrecision`) but COI is
  present, enter a **CPU preview mode** instead of hard-failing, so the user can
  still adjust look/LUT/tone, see a processed preview, and export.
- Render the CPU preview through the **authoritative export color graph**, so the
  preview is color-correct (matches export) by construction.
- Keep the CPU render off the main thread (Web Worker) and bounded in work so the
  tab stays responsive on the weak hardware that triggers this.

## Non-Goals (explicit)

- Merging GPU facts (`WebGLCapabilities`) into `CapabilityVector`.
- Runtime GPU-failure fallback (a GPU device whose pipeline fails mid-session).
  This is an upfront, load-time capability decision only.
- Live per-frame CPU re-render during slider drag. CPU preview re-renders on
  parameter **apply/release**.
- CPU split-compare, CPU histogram, bounded-HQ CPU render, SharedArrayBuffer
  zero-copy.
- Any change to the export executor or color math.
- Adding export-ability to the preview gate — export readiness stays owned by
  `export-readiness.ts` / `fullResCapability`.

## Design

### Unit 1 — Gate trigger & preview mode

Extend `useCapabilityGate` to return a **discriminated union** (prevents invalid
states such as "unsupported but a previewMode exists"):

```ts
type RawPreviewCapability =
  | { supportStatus: 'unsupported'; previewMode: null; reason: 'coi-missing' }
  | { supportStatus: 'degraded';   previewMode: 'cpu'; reason: 'webgl2-missing' | 'tone-float-precision-low' }
  | { supportStatus: 'supported';  previewMode: 'gpu'; reason: null }
```

(Field names finalized in the plan; semantics fixed here.) The gate is
**preview-scoped only**; it does NOT carry `canExport`. Export-ability remains
computed by `export-readiness.ts`/`fullResCapability`, the single source of truth
for export.

`RawProcessorView` hard-blocks only on `'unsupported'`. On `'degraded'` it enters
the normal workspace in CPU mode behind a **non-blocking, dismissible banner**:
"GPU preview unavailable — using a slower CPU preview; live compare and histogram
are off." `previewMode` flows to the preview surface and the compare/histogram
controls.

### Unit 2 — CPU preview worker (two-phase protocol)

New `src/lib/preview/cpu-preview.worker.ts`. The decoded source window is handed to
the worker **once** and owned by the worker; subsequent renders carry only
graph/exposure/variant. This avoids re-transferring (and detaching) a multi-MB
buffer on every parameter change.

```ts
type CpuPreviewRequest =
  | { type: 'loadSource'; sourceId: string; width: number; height: number; data: Uint16Array }
  | { type: 'render'; sourceId: string; requestId: number; graph: SupportedExportColorGraphDescriptor; renderExposure: number; variant: 'processed' | 'neutral' }
  | { type: 'disposeSource'; sourceId: string }

type CpuPreviewResponse =
  | { type: 'rendered'; sourceId: string; requestId: number; rgba: Uint8ClampedArray; width: number; height: number }
  | { type: 'error'; sourceId: string; requestId?: number; reason: CpuPreviewFailureReason }
```

- `loadSource.data` is sent once. The main thread MUST NOT read that buffer after
  hand-off (whether `loadSource` transfers it and drops the main ref, or copies it
  into the worker, is a plan decision; either satisfies the "source resent at most
  once per source" invariant).
- `render` runs `createRowBandProcessor({ width, rowBandRows, graph })` band-by-band
  over the owned source. `processUint16Rows` returns **packed RGB bytes** and
  **reuses its output buffer**, so each band is expanded to **RGBA** (alpha = 255)
  and copied into the assembled frame before the next band (mirrors
  `full-res-export.ts`).
- `rendered.rgba` is transferred back to the main thread.
- The worker depends only on `@lumaforge/luma-color-runtime`; it does not decode or
  touch GL.

### Unit 3 — CPU preview client (main thread)

New client/hook (e.g. `src/lib/preview/cpu-preview-client.ts` +
`src/modules/raw-processor/hooks/useCpuPreview.ts`):

- Owns the worker lifecycle; loads the source once per decoded window
  (`disposeSource` on replacement/unmount, `terminate` on teardown).
- Builds the graph via `resolveExportColorGraph(params)` and threads
  `renderExposure` identically to the export path (see Correctness).
- **Queue discipline (explicit):** at most **one in-flight** render message and at
  most **one pending-latest**. A new request while one is in-flight *replaces*
  pending (does not enqueue). On response: commit only if `requestId` is latest and
  `sourceId` matches and the component is still mounted; then post pending-latest if
  any. This bounds CPU work on weak devices — the worker never grinds through a
  backlog of superseded frames.
- **Neutral-frame cache:** the `'neutral'` (original) frame is cached keyed by
  `sourceId + renderExposure + neutralGraphVersion`; look/LUT/intensity changes do
  not invalidate it. Only source / render-exposure / neutral-graph-contract changes
  recompute it.

### Unit 4 — CPU preview surface & UI degradations

- New `CpuPreviewCanvas` component: draws the latest RGBA frame and shows a
  **spinner overlay** while a render is in flight. Because `putImageData` ignores
  the 2D transform, scaling uses a **backing canvas at frame size** + `drawImage`
  onto the fit-scaled visible canvas (not `ctx.scale()` + `putImageData`).
- The preview mount selects `CpuPreviewCanvas` vs the existing GPU `PreviewCanvas`
  by `previewMode` — keeping the two executors as separate focused units (the GPU
  `PreviewCanvas` is not made polymorphic).
- Source resolution: the **quick** decode window (already capped), never bounded-HQ.
- Degradations in CPU mode:
  - Compare → processed-only plus the existing **`original`** view (reusing the
    app's established `viewMode: 'original'` vocabulary), rendered as the
    `variant: 'neutral'` (no-look, no-LUT) CPU frame of the same window. Live
    split-compare is disabled.
  - Histogram reuses its existing `'unsupported'` state (shows unavailable).
  - Tone / intensity / LUT / builtin presets still apply — re-render on release.

### Unit 5 — Data flow

Decode (RAW runtime, requires COI) → quick `uint16-rgb` linear-ProPhoto window on
the main thread (already produced; today feeds `createRawUploadInput`) → in CPU
mode handed once to the CPU preview client/worker → renders RGBA → `CpuPreviewCanvas`
draws. Parameter change → debounce → coalesced re-render.

### Correctness (color contract)

The CPU preview reuses the authoritative export graph, so it matches export by
construction. The one real risk is **render-exposure**: the GPU preview applies
`rawRenderExposureMultiplier` as a shader uniform on the linear window, while the
export/CPU path applies render-exposure through its own mechanism.

- **Blocker:** the plan MUST establish the exact **folding position** of
  render-exposure (multiplied before the graph, inside it, or pre/post-tone) as a
  fixed contract, and apply it identically in the CPU preview.
- **Authority is export, not the GPU preview.** The gating parity test is
  **CPU-preview == export** for the same source/graph/exposure (covering
  exposure < 1, exposure > 1, highlight clipping, tone curve, LUT-enabled, and the
  neutral graph). GPU-vs-CPU readback parity is desirable-if-feasible but is NOT a
  blocker — the GPU preview's own fidelity to export is pre-existing and out of
  scope, and reliable real-WebGL readback is not available in the jsdom app tests.

### Error handling

`CpuPreviewFailureReason = 'worker-construction-failed' | 'worker-module-load-failed'
| 'source-transfer-failed' | 'invalid-source-buffer' | 'render-failed' |
'out-of-memory'`. (No `color-runtime-init` mode — the color runtime is pure TS with
no init step.)

Fallback priority on a preview failure: **last-known-good processed frame →
embedded camera thumbnail → explicit "preview unavailable" placeholder**. A failure
never blanks a working frame and never crashes the workspace.

Export is unaffected by GPU-preview unavailability: it is already CPU, runs in its
own separate worker, and the GPU `previewCopyCanvas` step in
`orchestrate-full-res-export.ts` is already null-safe (`if (pipeline && previewSize)`)
— in CPU mode the optional "copy preview image" convenience simply becomes
unavailable. A preview-worker construction/load failure is independent of export's
worker and does not affect export.

## Testing

- **Gate matrix:** webgl2 × toneHighPrecision × COI → expected
  `supportStatus`/`previewMode` (incl. COI-missing still `'unsupported'`, and no
  `canExport` leakage into the gate).
- **Source ownership:** after `loadSource`, the main thread does not re-read the
  handed-off buffer, and subsequent `render` requests carry no source data
  (source resent at most once per window).
- **Queue discipline:** firing N rapid apply/release events results in at most
  (one in-flight + one pending) `render` messages posted to the worker; stale /
  mismatched-`sourceId` / post-unmount responses are not committed.
- **RGB→RGBA assembly:** band assembly produces correct RGBA against a known small
  graph + window (alpha = 255, per-band copy correctness).
- **Color-contract parity (key guard):** CPU-rendered small frame == export path
  output for the same params/graph/window **including render-exposure**, with
  exposure≠1 and clipping fixtures.
- **Worker init failure:** mock worker construction throw / module-load reject /
  render reject → workspace does not crash; falls back per priority.
- **No-thumbnail placeholder:** with no embedded thumbnail and no last-good frame,
  an explicit placeholder shows (not a blank canvas).
- **Memory cap:** the quick-window max size bounds the `width*height*4` RGBA
  allocation (guards low-end OOM).
- **`CpuPreviewCanvas` component:** draws latest frame, spinner while in-flight,
  processed/original toggle, backing-canvas scaling.
- Reuse existing `luma-color-runtime` graph tests; do not duplicate color math.

## Verification

Per `AGENTS.md`: app-surface + UI change touching `src` and a new worker. Run
`pnpm lint:check`, `pnpm test:app`, and — since a new worker + preview path is
user-visible `/raw` behavior — browser validation on a forced-degrade environment.
`pnpm test:run`/`build` at closeout.

## Risks & open items for the plan

- **Render-exposure folding position** (above) — establish before claiming parity.
- **Worker bundling** under Vite — follow the existing `full-res-export.worker.ts`
  pattern.
- **Forced-degrade harness** for browser validation — how to simulate
  `!toneHighPrecision` / no-WebGL2 (a capability override hook, defined in the plan).
- **Source hand-off mechanism** (transfer vs copy on `loadSource`) — decide in the
  plan against the "main thread must not read a detached buffer" constraint.
