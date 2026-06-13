# Render Engine Extraction Design

- Date: 2026-06-13
- Status: Draft (active, pre-implementation)
- Type: Package boundary + multi-phase rollout design
- Target package: `@lumaforge/render-engine` (`packages/render-engine`, proposed)
- Branch: `docs/render-engine-extraction-plan`
- Related code today:
  - `src/lib/export/`, `src/lib/preview/`, `src/lib/runtime/`, `src/lib/lut/`, `src/lib/profiles/`
  - `src/modules/raw-processor/services/{export,preview}/`
  - `packages/luma-color-runtime`, `packages/luma-raw-runtime`, `packages/luma-jpeg-runtime`, `packages/luma-native-artifacts`

## 0. Status

Pre-implementation. This spec captures the contract; P0+P1 will be the first executable plan (separate document under `docs/plans/`). P2–P5 plans get written as their preconditions clear.

This document is self-contained: a reader who has never seen the codebase can build a mental model of the target architecture from it alone.

## 1. Purpose

The render pipeline (low-cost deterministic render, full-resolution authoritative export, plus the policy / budget / manifest plumbing around them) is today split between `src/lib/{export,preview,runtime,lut,profiles}/` and `src/modules/raw-processor/services/{export,preview}/`. The app-bound orchestration is intentionally there. The pipeline machinery is not — it is accidentally there because the app was the only consumer.

Goal: extract the pipeline machinery into a standalone workspace package, `@lumaforge/render-engine`, that:

- Runs in both browser and Node.js (single-thread Node acceptable for the first cut).
- Composes the existing `@lumaforge/luma-{color,raw,jpeg}-runtime` packages.
- Exposes a stable injection surface (`LumaRenderContext`) so consumers swap browser/Node adapters at the edges.
- Produces a stable reproducibility envelope (`RenderManifest`) for every render.
- Lets the app keep its React/Jotai orchestrators unchanged, importing primitives from the package instead of `src/lib/*`.

Long-term enabler: a CLI (and AI agent loops) consuming the same engine. The CLI is **not** part of this spec — current work is preparation only.

## 2. Non-Goals

- Multi-threaded Node runtime. Single-thread is the first cut; concurrency comes later.
- Headless GPU rendering. `src/lib/gl/` (WebGL2) stays in the app; Node uses the CPU row-band path only.
- Reimplementing `luma-color-runtime`. That package is already environment-agnostic; we reuse it.
- Moving capability **detection**. `src/lib/runtime/capability-vector.ts` keeps detecting; the engine accepts a `CapabilityVector` as input.
- Building any CLI. Out of scope. Preconditions only.
- New product capabilities (catalogs, batch workflows, accounts, etc.). Per `AGENTS.md` non-negotiables.
- Multi-target output (PNG/TIFF). v1 supports JPEG only; v2+ may extend.

## 3. Phased Rollout

Each phase is independently shippable and verifiable. Subsequent specs and plans land under `docs/specs/` and `docs/plans/` when their phase is up.

| Phase | Title | Status | Output | Verifies |
|---|---|---|---|---|
| **P0** | `luma-native-artifacts` Node loader | Not started | Node entry that resolves WASM artifacts by file path; uses `fs.readFileSync` + `WebAssembly.instantiate` | `pnpm --filter @lumaforge/luma-native-artifacts verify` + Node WASM-instantiate smoke |
| **P1a** | `luma-raw-runtime` Node entry | Not started | `"exports"` map adds `"node"` condition; Node worker factory via `worker_threads` (or single-thread fallback); Node-friendly input adapter (no `File` requirement) | New `pnpm --filter @lumaforge/luma-raw-runtime test:node-smoke` — decode a fixture in Node |
| **P1b** | `luma-jpeg-runtime` Node entry | Not started | Same shape; Node entry returns `Uint8Array` instead of `Blob` | New `pnpm --filter @lumaforge/luma-jpeg-runtime test:node-smoke` — encode rows to file |
| **P2** | `packages/render-engine` skeleton | Blocked on P0+P1 | Empty package with `LumaRenderContext` interface, `RenderManifest` types, `policy/` and `manifest/` shells, canonical-JSON util | Package builds; types pass; manifest roundtrip + canonical-hash tests pass in Node |
| **P3** | Migrate export engine | Blocked on P2 | `runFullResolutionJpegExport` and dependencies move from `src/lib/export/` into `render-engine/export/`; `src/` imports update; React orchestrator stays | App build green; `pnpm test:runtime`; full-res export browser smoke unchanged |
| **P4** | Migrate preview + add candidate / contact-sheet | Blocked on P3 | CPU preview moves to `render-engine/preview/`; new `candidate-render.ts` + `contact-sheet.ts` (CPU-only); `forcePreview=cpu` keeps working in browser | App build green; `pnpm test:runtime`; `/raw?forcePreview=cpu` browser smoke |
| **P5** | Move policy + add `render-budget` | Blocked on P4 | `resource-budget`, `export-policy`, `interactive-policy` move into `render-engine/policy/` with `CapabilityVector` injection; new unified `render-budget.ts`; app and (future) CLI share decisions | App build green; tests assert policy decisions match pre-move snapshots for a fixed capability matrix |

Phases are deliberately bottom-up: P0/P1 unblock Node usage of the runtime packages; P2 introduces the package surface; P3–P5 fill it without changing observable app behavior.

## 4. Package Structure

```
packages/render-engine/
  package.json
  src/
    index.ts                            # public re-exports
    context/
      runtime-context.ts                # LumaRenderContext interface (see §5)
      runtime-context-defaults.ts       # safe defaults for browser usage
    preview/
      preview-plan.ts                   # ex preview-resolution-policy.ts (quick vs bounded HQ)
      preview-render.ts                 # ex cpu-preview-frame.ts; CPU row-band Uint16 -> RGBA8
      preview-jpeg-encode.ts            # NEW. small-output JPEG via luma-jpeg-runtime
      candidate-render.ts               # NEW. multi-param parallel render
      contact-sheet.ts                  # NEW. grid composition; CPU-only
      worker-bridge/
        bridge.ts                       # ex cpu-preview-client.ts (worker-agnostic)
        protocol.ts                     # ex cpu-preview-protocol.ts
        browser-worker.ts               # browser default worker
        node-worker.ts                  # Node worker via worker_threads
    export/
      full-res-export.ts                # ex full-res-export.ts engine
      strip-scheduler.ts                # ex strip-scheduler.ts
      processed-window-transform.ts     # ex processed-window-transform.ts
      pipeline-concurrency.ts           # ex pipeline-concurrency.ts
      buffer-pool.ts                    # ex buffer-pool.ts
      jpeg/
        row-writer.ts                   # ex jpeg/row-writer.ts
        wasm-row-sink.ts                # ex jpeg/wasm-row-sink.ts
    policy/
      capability-input.ts               # CapabilityVector type — INPUT only, not detection
      resource-budget.ts                # ex src/lib/runtime/resource-budget.ts
      export-policy.ts                  # ex src/lib/runtime/export-policy.ts
      interactive-policy.ts             # ex src/lib/runtime/interactive-policy.ts
      render-budget.ts                  # NEW. unified budget across preview/candidate/export
    manifest/
      render-manifest.ts                # base type + schema + canonicalize entry
      export-checkpoint.ts              # render-manifest + in-progress extension
      source-fingerprint.ts             # ex src/lib/export/source-fingerprint.ts
      canonicalize.ts                   # canonical-JSON helper + self-hash
  README.md
  tsconfig.json
  tsconfig.build.json
  vite.config.ts
```

Naming and structure notes:

- Root is `render-engine`, not `luma-render-engine`. Per user decision in the design chat.
- `preview/` here means "deterministic small-output render", **not** browser preview responsiveness. The README leads with this distinction so future contributors do not confuse the two.
- `policy/` chosen over `budget/`; the unified `render-budget.ts` lives inside `policy/`.
- `contact-sheet.ts` is its own file (not nested under `candidate-render.ts`) because inspect-style render, candidate sweep, and preview all consume it.

## 5. LumaRenderContext

The single injection surface. Consumers (app, future CLI) construct one and pass it to every engine call.

```ts
// packages/render-engine/src/context/runtime-context.ts

import type { LumaRawRuntime } from '@lumaforge/luma-raw-runtime'
import type { LumaJpegRuntime } from '@lumaforge/luma-jpeg-runtime'

export interface LumaRenderContext {
  rawRuntime: LumaRawRuntime
  jpegRuntime: LumaJpegRuntime

  capability: CapabilityVector
  observeRenderEvent?: (event: RenderEvent) => void

  outputSink: OutputSink
  manifestStore: ManifestStore               // §6 final RenderManifest persistence
  checkpointStore: CheckpointStore           // §7 in-progress journal persistence
  profileFetcher?: ProfileFetcher
  profileCache?: ProfileCache

  signal?: AbortSignal
}

export interface OutputSink {
  open(name: string, meta: OutputSinkMeta): Promise<OutputSinkHandle>
}

export interface OutputSinkHandle {
  writeChunk(chunk: Uint8Array): Promise<void>
  close(): Promise<OutputSinkResult>
  abort(): Promise<void>
}

export interface OutputSinkMeta {
  format: 'jpeg'
  expectedByteSize?: number
  width: number
  height: number
}

// Every variant carries the SHA-256 of the bytes written through this sink,
// computed BY THE SINK **incrementally** during writes. The sink updates a
// streaming SHA-256 state per `writeChunk` and finalizes the digest on
// `close()`. Sinks MUST NOT accumulate the full output in memory; doing so
// would defeat the OPFS / Node-streaming purpose for large full-resolution
// exports. See §6.7 for the source-vs-output hashing asymmetry and §9 for
// the `streaming-sha256.ts` helper. The engine reads sha256 + byteSize
// from this result to populate the final RenderManifest.output identity
// without re-reading output bytes.
export type OutputSinkResult = {
  sha256: string                          // SHA-256 of all bytes written
  byteSize: number
} & (
  | { kind: 'blob'; blob: Blob }
  | { kind: 'file-handle'; handle: unknown }
  | { kind: 'file-path'; path: string }
)

export interface ProfileFetcher {
  fetchBytes(url: string, options: ProfileFetchOptions): Promise<Uint8Array>
  fetchJson<T>(url: string, options: ProfileFetchOptions): Promise<T>
}

export interface ProfileFetchOptions {
  maxBytes?: number
  signal?: AbortSignal
}

export interface ProfileCache {
  get(key: string): Promise<Uint8Array | undefined>
  set(key: string, value: Uint8Array): Promise<void>
}

// Persistence of the final RenderManifest. Writes MUST be atomic — temp +
// rename, or OPFS equivalent — so a manifest file is either fully present
// or fully absent under crash. Replay readers locate manifests by name.
export interface ManifestStore {
  writeFinal(name: string, manifest: RenderManifest): Promise<void>
  read(name: string): Promise<RenderManifest | null>
}

// Persistence of the in-progress ExportCheckpointManifest journal.
// put() overwrites the existing journal at the same name atomically.
// list() supports session-start recovery (see §7 Finalization ordering).
export interface CheckpointStore {
  put(name: string, manifest: ExportCheckpointManifest): Promise<void>
  read(name: string): Promise<ExportCheckpointManifest | null>
  delete(name: string): Promise<void>
  list(): Promise<string[]>
}

export type RenderEvent =
  | { kind: 'strip-completed'; strip: number; totalStrips: number }
  | { kind: 'preview-frame-ready'; sourceId: string }
  | { kind: 'manifest-written'; manifestSha256: string }
  | { kind: 'render-failed'; reason: string }
```

Design rationale:

- `rawRuntime` and `jpegRuntime` are constructed by the consumer. The engine never instantiates them directly. This keeps Worker/WASM specifics inside their owning packages where browser/Node entry-point logic already lives.
- Camera calibration (DCP) is **applied by the consumer** via `LumaRawDecodeSession.applyCalibration()` before invoking the engine. The engine receives an already-calibrated session and a `CalibrationIdentity` (§6.2) describing what was applied, which it writes into the manifest. This matches the current orchestrator architecture in `src/modules/raw-processor/services/calibration/` and keeps the engine free of DCP solver semantics.

  **Identity origin contract:** the engine writes the `CalibrationIdentity` value **returned by** the orchestrator's `applySelectedCameraProfile`, never a value separately assembled by the caller. `dcp_params_sha256` is the SHA-256 of the **raw sidecar bytes as delivered by the catalog** (and, for a future user-uploaded DCP kind, the bytes the user provided) — not a canonical-reserialized form of the parsed params, because canonical-reserialize-then-hash drifts as the parser evolves and would silently desync from catalog-attested bytes. The sha256 originates upstream at `fetchDcpParams`, which gets it from the catalog's published hash (verified against the downloaded bytes) and returns it alongside the parsed `DcpParams`. The orchestrator threads this `sourceSha256` directly into the identity. This requires a contract change at P3/P4: `fetchDcpParams` returns `{ params: DcpParams, sourceSha256: string }`; the calibration stage caches both; `applySelectedCameraProfile` accepts the sha256 alongside `dcpParams` and includes it in `CameraCalibrationApplyResult.identity` (filled when `applied === true`).
- `capability` is **input**, not detection. Detection stays in `src/lib/runtime/capability-vector.ts` for browser; Node consumers pass a static default.
- `outputSink`, `manifestStore`, and `checkpointStore` are the only filesystem touchpoints. OPFS (browser) and Node `fs` implementations live outside the engine package; the engine writes through these interfaces and never embeds OPFS or `fs` calls itself. Persistence is split across three interfaces so callers can supply different stores per kind (e.g., OPFS for output, IndexedDB for manifests if desired) and so the engine's finalization ordering (§7) operates on explicit boundaries.
- `profileFetcher` + `profileCache` are optional. Engine calls that do not need a remote LUT do not require them.
- `observeRenderEvent` is the unified event hook, replacing today's mix of `dispatchEvent`, toasts, and metrics callbacks. Browser orchestrator wires it into existing infrastructure; Node logs.

## 6. RenderManifest v1

Per design decisions: **JSON-only, identity by reference, semantic-consistency replay target.**

### 6.1 Top-level shape

```ts
// packages/render-engine/src/manifest/render-manifest.ts

// 1. Identity block — what is known when a render STARTS.
//    Shared between the final RenderManifest and the mid-render checkpoint
//    journal (§7) via composition, not subtype.
export interface RenderIdentity {
  source_raw: SourceRawIdentity
  calibration: CalibrationIdentity | null   // DCP camera profile applied to the session
  lut: LutIdentity | null
  color_graph: ColorGraphIdentity
  render_params: RenderParams
  policy: PolicyChoice
  environment: RenderEnvironment
}

// 2. Final, post-render manifest — written ONCE after output bytes exist
//    and OutputSink.close() returns the output sha256.
export interface RenderManifest extends RenderIdentity {
  manifest_version: 1
  kind: RenderManifestKind
  produced_at: string                     // ISO 8601 UTC (render completion)
  parent_manifest_sha256: string | null   // for agent-loop chaining
  output: OutputIdentity                  // includes final sha256
  manifest_sha256: string                 // canonical(self - this field)
}

export type RenderManifestKind = 'preview' | 'candidate' | 'export'
```

### 6.2 Identity fields

```ts
export interface SourceRawIdentity {
  sha256: string                          // full-file streaming SHA-256 (see §6.6)
  byte_size: number
  filename: string                        // basename only
  decoded_dimensions: { width: number; height: number }
}

export type LutIdentity = LutCatalogIdentity | LutLocalFileIdentity

export interface LutCatalogIdentity {
  kind: 'catalog'
  catalog_id: string                      // e.g. "lumaforge-profiles@v2026.06.10"
  entry: string                           // e.g. "panasonic/v-log-to-rec709"
  version: string                         // semver
  sha256: string                          // cube bytes hash
  input_contract: LutColorContract
  output_contract: LutColorContract
}

export interface LutLocalFileIdentity {
  kind: 'local-file'
  filename: string                        // basename only; non-sensitive resolver hint
  sha256: string                          // content identity; full file
  input_contract: LutColorContract
  output_contract: LutColorContract
}

// Note: the manifest deliberately does NOT carry an absolute path.
// Path-to-sha256 resolution is consumer-owned state, kept outside the
// portable manifest so shared/replay artifacts don't leak local
// filesystem details.

export interface LutColorContract {
  gamut: string                           // e.g. "v-gamut", "rec709"
  transfer: string                        // e.g. "v-log", "bt1886"
  range: 'full' | 'legal'
  role?: string                           // e.g. "combined-look-output", "technical-output"
}

// Camera-calibration identity. Captures the inputs to the DCP interpolation
// (profile + sidecar params + WB neutral) so the resulting xyzToCamera
// matrix is reproducible without storing the matrix bytes themselves.
//
// The engine never solves DCP itself — the caller runs
// applySelectedCameraProfile (in src/modules/raw-processor/services/
// calibration/), invokes session.applyCalibration on the warm RAW session,
// then hands the resulting identity (returned by the orchestrator, not
// separately assembled — see §5 Identity origin contract) to the engine.
//
// `dcp_params_sha256` IS the runtime content identity. No separate DCP
// binary is applied at runtime; the sidecar (matrices m1/m2, illuminants,
// schema_version, toneCurve) is the only thing that enters the solver,
// and `xyzToCamera` is deterministic given (dcp_params, white_neutral)
// + the recorded `environment.luma_color_runtime` semver.
//
// The sha256 is over the **raw sidecar bytes as delivered by the catalog**
// (catalog publishes the hash; fetcher verifies it against the downloaded
// bytes), NOT a canonical-reserialized form of the parsed object. See §5
// Identity origin contract: the fetcher returns the sha256 alongside the
// parsed params; the orchestrator threads it through to the identity.
//
// Today only catalog-sourced calibration is modeled. The discriminant
// leaves the door open for user-uploaded DCPs as a future kind.
export interface CalibrationIdentity {
  kind: 'catalog'
  catalog_id: string                      // e.g. "lumaforge-profiles@v2026.06.10"
  profile_id: string                      // catalog entry id
  schema_version: string                  // dcp-params sidecar schema version
  dcp_params_sha256: string               // SHA-256 of the sidecar bytes
  white_neutral: readonly [number, number, number]  // WB neutral used for solve
  alpha: number                           // DCP interpolation parameter; 0 for single-illuminant
  converged: boolean                      // false ↔ camera_profile.interpolation_capped emitted
}

export interface ColorGraphIdentity {
  fingerprint: string                     // sha256 of canonical descriptor
  descriptor: unknown                     // serialized resolveExportColorGraph output (see §14 Q4)
}

export interface OutputIdentity {
  format: 'jpeg'                          // future: 'png' | 'tiff'
  dimensions: { width: number; height: number }
  color_space: 'srgb'                     // future: 'display-p3' | 'rec2020'
  quality: number                         // 0-100 for jpeg
  filename: string                        // sibling file name (relative to manifest)
  sha256: string                          // output bytes hash
}
```

### 6.3 Render params, policy, environment

```ts
export interface RenderParams {
  exposure_ev: number
  tone_curve?: ToneCurveParams
  color_balance?: ColorBalanceParams
  intensity?: number
  // ... mirrors the engine's descriptor input shape; stays in sync via shared types
}

export interface PolicyChoice {
  kind: 'preview-quick' | 'preview-bounded-hq' | 'candidate' | 'export-full'
  row_slice: number
  concurrency: number
}

export interface RenderEnvironment {
  render_engine: string                   // semver
  luma_color_runtime: string
  luma_raw_runtime: string
  luma_jpeg_runtime: string
  native_artifacts: { build_id: string; variant: 'desktop' | 'low-memory' }
}
```

### 6.4 Canonicalization + self-hash

`manifest_sha256` is the SHA-256 of the canonical form of the manifest object with the `manifest_sha256` field removed.

Canonical form rules:

- Object keys sorted lexicographically at every nesting level.
- Numbers serialized via `JSON.stringify` defaults (IEEE 754 doubles).
- Strings JSON-escaped via default `JSON.stringify`.
- No trailing newlines, no whitespace.
- No `undefined` values; absent fields are omitted, not set to `null` (except where the type explicitly allows `null`, e.g. `parent_manifest_sha256`).

Reader contract:

- Recompute the canonical hash over the **full parsed JSON object**, including any fields the consumer's typed interface doesn't recognize. Consumers MUST use a JSON parser that preserves unknown fields (idiomatic `JSON.parse` does). Compare to `manifest_sha256`; mismatch is a hard reject.
- Only **after** hash verification passes may the consumer project the parsed object onto its typed interface and ignore unknown fields. This makes future-added fields forward-compatible while still authenticating them — a tampered or stripped unknown field changes the hash.
- `manifest_version > 1` → reject (consumer too old).
- `environment` mismatch with current runtime versions emits a warning, not an error — the replay target is semantic consistency, not bit-exactness.

### 6.5 Example v1 manifest

```json
{
  "manifest_version": 1,
  "kind": "preview",
  "produced_at": "2026-06-13T12:00:00Z",
  "parent_manifest_sha256": null,

  "source_raw": {
    "sha256": "9f3a2c...",
    "byte_size": 31457280,
    "filename": "DSC0042.ARW",
    "decoded_dimensions": { "width": 6000, "height": 4000 }
  },

  "calibration": {
    "kind": "catalog",
    "catalog_id": "lumaforge-profiles@v2026.06.10",
    "profile_id": "sony/ilce-7m4/adobe-standard",
    "schema_version": "1.0.0",
    "dcp_params_sha256": "bb22aa...",
    "white_neutral": [0.4710, 1.0, 0.7340],
    "alpha": 0.62,
    "converged": true
  },

  "lut": {
    "kind": "catalog",
    "catalog_id": "lumaforge-profiles@v2026.06.10",
    "entry": "panasonic/v-log-to-rec709",
    "version": "1.2.0",
    "sha256": "a1b2c3...",
    "input_contract":  { "gamut": "v-gamut", "transfer": "v-log",  "range": "full" },
    "output_contract": { "gamut": "rec709",  "transfer": "bt1886", "range": "full",
                         "role": "combined-look-output" }
  },

  "color_graph": {
    "fingerprint": "deadbe...",
    "descriptor": { "steps": ["..."] }
  },

  "render_params": {
    "exposure_ev": 0.3,
    "color_balance": { "temp_k": 5600, "tint": -2 }
  },

  "output": {
    "format": "jpeg",
    "dimensions": { "width": 1024, "height": 683 },
    "color_space": "srgb",
    "quality": 85,
    "filename": "preview-001.jpg",
    "sha256": "ee11ee..."
  },

  "policy": {
    "kind": "preview-quick",
    "row_slice": 512,
    "concurrency": 1
  },

  "environment": {
    "render_engine": "0.1.0",
    "luma_color_runtime": "0.1.0",
    "luma_raw_runtime": "0.1.0",
    "luma_jpeg_runtime": "0.1.0",
    "native_artifacts": { "build_id": "raw-2026-06-10/jpeg-2026-06-10", "variant": "desktop" }
  },

  "manifest_sha256": "0f0f0f..."
}
```

### 6.6 Source identity hashing

`source_raw.sha256` is a **full-file streaming SHA-256**, computed by the engine over the entire RAW source bytes. This is content identity, not a resume token.

- **Browser implementation: whole-file digest.** Read the file into a single `ArrayBuffer` (via `file.arrayBuffer()` or equivalent) and call `crypto.subtle.digest('SHA-256', buffer)`. WebCrypto digest is one-shot — there is no streaming `update`/`finalize` API. Memory budget during hashing: peak holding equals `byte_size`.
- **Node implementation: streaming.** `createHash('sha256')` from `node:crypto`, updated over a readable stream or `Uint8Array` chunks. Memory budget: O(1).
- **Cross-environment determinism.** Both implementations hash the same byte sequence and produce identical sha256. P2 includes a fixture test that runs the same input through both code paths and asserts equality.

Performance target: ≤ 150 ms for files up to 64 MB on a 2020-era laptop; larger files pay proportionally. The typical workflow in this app is single RAW under 100 MB, which is acceptable. If mobile-Safari memory pressure surfaces with very large RAWs, a future WASM streaming SHA-256 hasher published from `luma-native-artifacts` is the planned fallback (out of scope for v1).

The engine caches the hash within a session keyed by **source object identity**, never by metadata:

- Browser: `WeakMap<File, string>`. Cache invalidates naturally when the `File` reference is GC'd, and a fresh user upload of the same-named file gets a new `File` reference → recompute.
- Node: a slot tied to an open file handle (or no cache at all and recompute per session — typical workflows have one source RAW, so the cost is paid once).

Metadata-keyed caching (`{name, size, lastModified}`) is **explicitly forbidden** by this spec because metadata can collide across distinct content (file copies preserve mtime; cameras reuse sequence numbers across cards). A metadata-keyed cache could return a stale sha256 for a different file with identical metadata and silently write the wrong identity into a manifest.

The cache is **not** part of the manifest — it is runtime state.

The legacy `SourceFingerprint` in `src/lib/export/source-fingerprint.ts` is **not** a content identity. It hashes only the first 1 MiB (`SOURCE_FINGERPRINT_HASH_BYTES = 1024 * 1024`) and pairs `name`/`size`/`lastModified` for file-system-side "is this the same file?" validation during resume. It stays in `src/lib/export/`, renamed at P3 to `resume-fingerprint.ts` so it can't be confused with content identity. The checkpoint journal (§7) carries both: full sha256 for replay identity, prefix fingerprint for fast resume validation.

### 6.7 Output hashing vs source hashing (intentional asymmetry)

The spec uses two hashing strategies, deliberately different:

- **Source hashing** (§6.6, whole-file): runs ONCE per source RAW per session. Bytes are read in by the runtime regardless (decode requires them); reusing them for a single one-shot WebCrypto digest is fine. Memory budget peaks at `source.byte_size` during the digest call. Cache key: source object identity (`WeakMap<File>`).
- **Output hashing** (§5 OutputSink): runs DURING the export, alongside streaming writes to OPFS / Node fs. The sink updates an incremental SHA-256 state per `writeChunk` and finalizes on `close()`. Memory budget: O(1) — the rolling hash state is ~100 bytes. This is REQUIRED so OPFS-backed exports (which exist precisely to AVOID holding the full output in memory) continue to bound memory under crash-safe streaming.

WebCrypto's one-shot digest is unsuitable for output. The engine ships a small streaming SHA-256 helper (see `streaming-sha256.ts` in §9). Node sinks pass through to `node:crypto.createHash('sha256')` directly.

This asymmetry is deliberate, not laziness.

## 7. ExportCheckpointManifest as a Mid-Render Journal

Today's `ExportCheckpointManifest` (`src/lib/export/checkpoint-store.ts:29`) records resume state for an interrupted export. It **cannot** be a strict subtype of `RenderManifest` because the lifecycles differ: `RenderManifest.output.sha256` is known only after `OutputSink.close()` returns, but in-progress checkpoints don't have that yet. Per design refinement after adversarial review, the two types **compose** the shared `RenderIdentity` (§6.1); neither is a subtype of the other.

```ts
// packages/render-engine/src/manifest/export-checkpoint.ts

export interface ExportCheckpointManifest extends RenderIdentity {
  checkpoint_version: 1
  kind: 'export-in-progress'
  export_id: string
  started_at: string                      // ISO 8601 UTC
  last_checkpointed_at: string            // ISO 8601 UTC

  // v1 supports safe-retry only: on interrupt, resume restarts from a
  // verified RenderIdentity rather than reusing partial output bytes.
  // row-resume (mid-export resume from byte offsets) is a heavier
  // contract deferred to a future phase — see §14 Q7. Legacy row-resume
  // continues to work via the legacy code path during migration.
  recovery_mode: 'safe-retry'

  // How the source RAW bytes can be reacquired after a reload/crash.
  // Required even for safe-retry because resume still needs to decode
  // from the same source. The legacy checkpoint already carries this
  // mode (checkpoint-store.ts:78-83); v1 forwards it unchanged.
  source_reacquisition: SourceReacquisitionMode

  // Intended output — dimensions/format/filename known up-front;
  // sha256 is only filled when the final RenderManifest is written.
  output_intended: OutputIntent

  // Resume validation + telemetry. completed_strips is informational
  // (progress bar, debugging) in safe-retry mode; the resumer does not
  // use it to skip work.
  resume_fingerprint: ResumeFingerprint   // prefix hash + name/size/lastModified
  in_progress: ExportInProgress
}

export interface OutputIntent {
  format: 'jpeg'
  dimensions: { width: number; height: number }
  color_space: 'srgb'
  quality: number
  filename: string                        // basename only
}

export interface ResumeFingerprint {
  name: string
  size: number
  last_modified: number                   // ms since epoch
  hash_prefix_hex: string                 // first 1 MiB SHA-256; resume only
}

export interface ExportInProgress {
  completed_strips: number[]              // strip indices already written
  jpeg_state: JpegResumeState
}

export type SourceReacquisitionMode =
  | 'current-session-file'        // File reference held in same session
  | 'persisted-file-handle'       // FileSystemFileHandle persisted; re-prompt for permission
  | 'user-reselect-required'      // User must reselect the file on resume
  | 'opfs-source-copy'            // Source bytes copied to OPFS; re-open via OPFS
```

### Lifecycle (v1: safe-retry)

1. **Begin.** Engine writes the checkpoint journal with `RenderIdentity` (including the full `source_raw.sha256` per §6.6) + `output_intended` + `recovery_mode: 'safe-retry'` + initial `in_progress = { completed_strips: [], jpeg_state: ... }`.
2. **Progress.** As strips complete, engine updates `last_checkpointed_at` and `in_progress.completed_strips` for **telemetry only** (progress bar, debugging). Resume does not use them to skip work. Updates use atomic temp+rename or OPFS-handle equivalent so the journal itself never goes corrupt under crash.
3. **Interrupt → Resume.** The journal is the resume input. Engine validates the source by fast `resume_fingerprint` check, then confirms full `source_raw.sha256` matches a fresh hash of the offered file — this catches files that happen to share a 1 MiB prefix but differ later. On match, **export restarts from scratch** with the same `RenderIdentity`; the partial output is discarded.
4. **Finalize.** On successful completion, the final **`RenderManifest`** (§6) is written **once**, with `output.sha256` filled from the closed `OutputSink`. The journal is then deleted.

The journal is **never** treated as a render manifest. Replay/identity readers always read the final `RenderManifest`. Resume readers always read the journal.

**Why safe-retry for v1.** `row-resume` (resuming mid-export from byte offsets without re-rendering completed strips) requires a durable transactional contract — persisted byte offsets, rolling output hash, strict write→flush→journal-update ordering, and `OutputSink.reopen/truncate/append` semantics that validate partial output before continuing. That contract deserves its own design pass and is out of scope for v1. Legacy `row-resume` checkpoints already in the wild continue to work via the legacy code path during the migration window (see Migration below). Tracked as §14 Q7.

### Migration

The legacy checkpoint shape (`{ version: 1, sourceFingerprint, fileName, ... }` at `src/lib/export/checkpoint-store.ts:29-53`) carries only a 1 MiB prefix hash, not a full `source_raw.sha256`. A load-time adapter cannot synthesize the full content identity without the source bytes, which the loader does not have. The migration is therefore **dual-path**, not in-place rewrite:

- **Legacy checkpoints** continue to load and resume through the legacy path for one release. They keep their legacy shape; the new identity model is not retrofitted onto them. The legacy resume code is preserved in `src/lib/export/` and marked `// legacy resume path; eligible for removal after vN+1`.
- **New exports** write the new `ExportCheckpointManifest` shape from the start, including the full `source_raw.sha256` computed during `openSession`.
- **Successful legacy resume** → the export completes and writes a **new-shape** `RenderManifest` (with full `output.sha256` from the sink and a fresh `source_raw.sha256` computed during the resume). The legacy journal is then deleted.
- **Unavailable source** (file gone, fingerprint mismatch) → the legacy checkpoint is reported as unresumable, same behavior as today. No silent identity downgrade is ever allowed — the engine never writes a `RenderManifest` whose `source_raw.sha256` it did not compute.

The OPFS-backed checkpoint store stays in `src/lib/export/` and consumes the engine's `RenderIdentity` + `ExportCheckpointManifest` types for the new path while keeping legacy types in a separate, soon-to-be-removed module.

### Finalization ordering and crash recovery

A successful export performs THREE durable mutations: closing output, writing the final manifest, deleting the journal. The spec pins the ordering:

1. `outputSink.close()` returns `{ sha256, byteSize, ... }` — output is fully durable.
2. Engine constructs `RenderManifest` with `output.sha256` filled, computes `manifest_sha256`.
3. `manifestStore.writeFinal(name, manifest)` — atomic (temp + rename, OPFS equivalent).
4. `checkpointStore.delete(name)` — best-effort; failure here is observable but harmless.

Recovery at session start, for each name in `checkpointStore.list()`:

| State observed | Interpretation | Action |
|---|---|---|
| Journal exists, manifest exists | Crashed between step 3 and 4 — export completed successfully | Delete the journal |
| Journal exists, no manifest, source available | Crashed before step 3 — interrupted export | Offer resume (v1 = `safe-retry`: restart with same `RenderIdentity`; legacy = legacy code path) |
| Journal exists, no manifest, source unavailable | Crashed before step 3, source lost | Report unresumable; surface to user for manual clear |
| No journal, manifest exists | Normal completed state | No action |
| Output bytes present, no journal, no manifest | Crashed between step 1 and 3 (extremely narrow window) | Report orphan output; user clears (acceptable: rare AND detectable) |

P3 includes tests for the first three rows above with simulated crash injection. The orphan-output row is documented but not asserted in P3 because it requires injecting a crash inside `manifestStore.writeFinal` itself.

## 8. What Moves (source → target)

Concrete file moves planned for P3–P5. Most files keep their content; imports update.

| Today | Target | Phase |
|---|---|---|
| `src/lib/export/full-res-export.ts` | `render-engine/export/full-res-export.ts` | P3 |
| `src/lib/export/full-res-export.worker.ts` | **stays** (Worker file, app-specific bundling) | — |
| `src/lib/export/full-res-export-client.ts` | **stays** (browser Worker client) | — |
| `src/lib/export/strip-scheduler.ts` | `render-engine/export/strip-scheduler.ts` | P3 |
| `src/lib/export/processed-window-transform.ts` | `render-engine/export/processed-window-transform.ts` | P3 |
| `src/lib/export/pipeline-concurrency.ts` | `render-engine/export/pipeline-concurrency.ts` | P3 |
| `src/lib/export/buffer-pool.ts` | `render-engine/export/buffer-pool.ts` | P3 |
| `src/lib/export/source-fingerprint.ts` | **stays** as resume token; renamed to `resume-fingerprint.ts` at P3 to distinguish from content identity (§6.6) | — |
| `src/lib/export/checkpoint-store.ts` types | `render-engine/manifest/export-checkpoint.ts` | P3 |
| `src/lib/export/checkpoint-store.ts` OPFS impl | **stays** in `src/lib/export/` | — |
| `src/lib/export/jpeg/row-writer.ts` | `render-engine/export/jpeg/row-writer.ts` | P3 |
| `src/lib/export/jpeg/wasm-row-sink.ts` | `render-engine/export/jpeg/wasm-row-sink.ts` | P3 |
| `src/lib/export/output-sink.ts` | **stays** (OPFS); engine consumes via `OutputSink` interface | — |
| `src/lib/export/execution-profile.ts` | **stays** (localStorage / window events) | — |
| `src/lib/export/tiff-encoder.ts` | **stays** (DOM-bound; unrelated to engine) | — |
| `src/modules/raw-processor/services/export/orchestrate-full-res-export.ts` | **stays** (React/Jotai orchestrator) | — |
| `src/lib/preview/cpu-preview-frame.ts` | `render-engine/preview/preview-render.ts` | P4 |
| `src/lib/preview/cpu-preview-protocol.ts` | `render-engine/preview/worker-bridge/protocol.ts` | P4 |
| `src/lib/preview/cpu-preview-client.ts` | `render-engine/preview/worker-bridge/bridge.ts` (worker-agnostic) | P4 |
| `src/lib/preview/cpu-preview.worker.ts` | `render-engine/preview/worker-bridge/browser-worker.ts` | P4 |
| `src/lib/preview/raw-preview-capability.ts` | **stays** (browser GPU detection) | — |
| `src/modules/raw-processor/services/preview/preview-resolution-policy.ts` | `render-engine/preview/preview-plan.ts` | P4 |
| `src/modules/raw-processor/services/preview/preview-pipeline.ts` | **stays** (orchestrator) | — |
| `src/modules/raw-processor/services/preview/preview-session-state.ts` | **stays** (Jotai) | — |
| `src/lib/runtime/resource-budget.ts` | `render-engine/policy/resource-budget.ts` | P5 |
| `src/lib/runtime/export-policy.ts` | `render-engine/policy/export-policy.ts` | P5 |
| `src/lib/runtime/interactive-policy.ts` | `render-engine/policy/interactive-policy.ts` | P5 |
| `src/lib/runtime/capability-vector.ts` | **stays** (browser detection only) | — |
| `src/lib/runtime/preview-gpu-budget.ts` | **stays** (DOM-bound) | — |
| `src/lib/runtime/export-runtime-resources.ts` | **stays** (`navigator.storage` probe) | — |
| `src/modules/raw-processor/{services,state,hooks/stages}/calibration/*` | **stays** (DCP orchestrator + Jotai + workflow stage; engine receives already-calibrated session and `CalibrationIdentity` from caller per §5 design rationale) | — |
| `src/lib/profiles/calibration-catalog.ts`, `src/lib/profiles/dcp-params.ts` | **stays** (sidecar fetch + parse; calibration identity originates here) | — |
| `src/lib/lut/*` | **stays** for P0–P5 (engine consumes via `LutIdentity` + `ProfileFetcher`) | Future P6 candidate |
| `src/lib/profiles/*` | **stays** for P0–P5 (same as above) | Future P6 candidate |

## 9. What's Net-New

| Module | Purpose | Phase |
|---|---|---|
| `render-engine/preview/candidate-render.ts` | Multi-param preview render. Signature: `candidateRender(params: RenderParams[], options: { maxConcurrent: number; signal: AbortSignal }) => AsyncIterable<{ params, manifest, outputBytes }>`. The `AsyncIterable` return + `maxConcurrent` cap ensure unbounded sweeps cannot accumulate output bytes in memory; the caller streams candidates as they complete. Full back-pressure across preview/candidate/export comes in P5 via `render-budget`; this API shape is the floor of safety regardless of who calls it. | P4 |
| `render-engine/preview/contact-sheet.ts` | Grid composition of N small JPEGs (or pre-encoded frames); CPU-only; output JPEG of the grid | P4 |
| `render-engine/preview/preview-jpeg-encode.ts` | Thin wrapper around `luma-jpeg-runtime`; Node returns `Uint8Array`, browser returns `Blob` (via `OutputSink`) | P4 |
| `render-engine/policy/render-budget.ts` | Unified budget: max concurrent renders across preview/candidate/export; back-pressure across the three | P5 |
| `render-engine/manifest/render-manifest.ts` | The v1 type + canonicalize + serialize/deserialize | P2 |
| `render-engine/manifest/canonicalize.ts` | Canonical-JSON helper + self-hash util + tests | P2 |
| `render-engine/manifest/source-content-id.ts` | Full-file SHA-256 hasher per §6.6. Browser: whole-file `crypto.subtle.digest('SHA-256', await file.arrayBuffer())`, cached via `WeakMap<File, string>` (NOT metadata-keyed). Node: streaming `createHash('sha256')` from `node:crypto`, cached against an open file handle or no-cache. P2 ships a fixture test: two files with identical `{name, size, lastModified}` but different bytes must produce different sha256, proving the cache does not collide on metadata. | P2 |
| `render-engine/manifest/streaming-sha256.ts` | Incremental SHA-256 used by output sinks (§5 + §6.7). Browser: a small JS implementation (~150 LOC, no external dep) — chosen over WASM for v1 to avoid adding an artifact dependency; revisit if a `luma-native-artifacts` WASM hasher lands. Node: thin wrapper over `node:crypto.createHash('sha256')`. P2 ships a fixture: streaming the same bytes in different chunk sizes produces an identical final digest, equal to a single one-shot `crypto.subtle.digest` over the same bytes. | P2 |
| `render-engine/context/runtime-context.ts` | The `LumaRenderContext` interface | P2 |

## 10. What Stays in src/

- React/Jotai state, hooks, view controllers (`src/modules/raw-processor/{components,hooks,state,model}`).
- Workflow stage hooks (`src/modules/raw-processor/hooks/stages/*`).
- Browser-specific orchestrators (`src/modules/raw-processor/services/*` that bind UI events to engine calls).
- Capability detection (`src/lib/runtime/capability-vector.ts`, `preview-gpu-budget.ts`, `export-runtime-resources.ts`).
- OPFS / localStorage / `window.dispatchEvent` integrations (`src/lib/export/output-sink.ts`, `execution-profile.ts`).
- Resume token (`src/lib/export/source-fingerprint.ts`, renamed to `resume-fingerprint.ts` at P3). Resume-only; full content identity lives in `render-engine/manifest/source-content-id.ts`.
- WebGL2 renderer (`src/lib/gl/`).
- LUT/profile parsing (`src/lib/lut/`, `src/lib/profiles/`). Engine consumes via interfaces. Move into engine is a possible future phase if value warrants.
- Camera-calibration orchestrator (`src/modules/raw-processor/services/calibration/`, `state/calibration.atoms.ts`, `hooks/stages/calibration/`). Calls `session.applyCalibration` before engine render; engine writes `CalibrationIdentity` into the manifest (§6.2).
- Mobile-specific UI (`src/modules/raw-processor/components/mobile/*`).

## 11. Adapter Surfaces

For each injection point, the table names the concrete browser impl (which stays in `src/`) and the Node-side expectation.

| Interface | Browser impl (stays) | Node-side expectation |
|---|---|---|
| `LumaRawRuntime` | `createLumaRawRuntime` with default worker factory (P1a today) | `createLumaRawRuntime` with `worker_threads` factory or single-thread mode (P1a) |
| `LumaJpegRuntime` | `createLumaJpegRuntime` with default worker factory (P1b) | Same with Node factory; `finish()` returns `Uint8Array` (P1b) |
| `OutputSink` | OPFS-backed (current `src/lib/export/output-sink.ts`) | `fs.createWriteStream`-backed; result kind `file-path` |
| `ProfileFetcher` | wraps current `src/lib/profiles/fetch.ts` | Node 20+ `fetch()`; `Uint8Array` result |
| `ProfileCache` | localStorage / memory (current) | memory / `fs` |
| `CapabilityVector` | detected in `src/lib/runtime/capability-vector.ts` | static default: `{ coi: true, pthread: false, deviceMemoryGB: 8, hwConcurrency: 1, ... }` |
| `RenderEvent` observer | wires into existing toast/dispatchEvent/metrics | logs / writes to stdout |

## 12. Test Strategy

**Per package:**

- `render-engine` unit tests run in Node only (Vitest, no DOM). Cover: manifest canonicalize/verify, policy decisions, strip scheduler math, processed-window transform.
- `render-engine` integration test runs in Node: encode a known-input `Uint16Array` buffer → JPEG bytes → assert sha256. Uses `luma-color-runtime` + `luma-jpeg-runtime` Node entries.
- `luma-raw-runtime` and `luma-jpeg-runtime` keep existing browser tests; add Node smoke tests at P1.
- App-side: existing `pnpm test:app` and browser specs (`pnpm test:browser`) regress through migration. No new browser tests required.

**Per phase verification (per `AGENTS.md` Verification section):**

- P0 / P1: `pnpm test:runtime`; per-package `typecheck` + `build`.
- P2: same + new package's `test` + `build`.
- P3: `pnpm lint:check` + `pnpm test:app` + `pnpm native:prepare` + `LUMAFORGE_NATIVE_RUNTIME_MODE=prebuilt pnpm build`; browser smoke of full-res export.
- P4: same + `/raw?forcePreview=cpu` browser smoke.
- P5: app build + `pnpm test:runtime`; policy parity test (snapshot decisions for a fixed `CapabilityVector` matrix; compare pre-move vs post-move).

## 13. Complexity Budget

| Phase | Net new code | Net moved code | LOC delta (est.) |
|---|---|---|---|
| P0 | ~80 LOC (Node loader util + tests) | 0 | +80 |
| P1a | ~150 LOC (Node entry + factory + smoke test) | 0 | +150 |
| P1b | ~120 LOC (Node entry + factory + smoke test) | 0 | +120 |
| P2 | ~640 LOC (RenderIdentity composition, manifest types, canonicalize, source-content-id whole-file hasher, streaming-sha256 for output, ManifestStore + CheckpointStore interfaces, tests including cache-collision and chunk-size-equivalence fixtures) | 0 | +640 |
| P3 | ~50 LOC (interface adapters in src/) | ~1500 LOC moved + reorganized | small net |
| P4 | ~300 LOC (candidate + contact-sheet + tests) | ~500 LOC moved | +300 |
| P5 | ~100 LOC (`render-budget` + tests) | ~600 LOC moved | +100 |

If any phase exceeds 2× its budget, stop and reconsider scope before merging.

## 14. Open Questions

1. **Node engine version floor.** Target Node 20 (has `fetch`, `crypto.subtle`, `File`) vs Node 18 (has fetch, no `File`). Recommend **Node 20**. Decision needed at P1.
2. **`luma-native-artifacts` Node loader location.** Add a helper to the artifacts package (`load-for-node.mjs`) vs inline it in each consumer runtime. Recommend **artifacts package** because loader logic is shared. P0 decision.
3. **Engine package bundler.** Vite (matches existing runtime packages) vs `tsup` (cleaner ESM-only output). Recommend **Vite** for consistency. P2 decision.
4. **`RenderManifest.color_graph.descriptor` shape.** Today's `resolveExportColorGraph` returns an internal type; serializing it requires either a stable shape or a versioned snapshot. Recommend **freeze the descriptor shape at P2** and add a version field to it. May require a small change in `luma-color-runtime` exports.
5. **Browser bundle size.** Adding `render-engine` as a dep of `src/` shifts bytes around but should not grow them (it is mostly re-housed code). P3 verification step: measure JS bundle before/after; flag a regression > 5%.
6. **Single-thread Node mode for `luma-raw-runtime`.** Today's worker uses pthread + SAB optionally. For single-thread Node, the runtime probably needs an in-process decode path. Detection: P1a's first task is a feasibility probe — does the Emscripten build run usefully without pthread inside Node? If not, we run the WASM in a `worker_threads` Worker that lives for the runtime lifetime, accepting the cold-start cost.
7. **`row-resume` contract modernization (§7 follow-up).** v1 of `ExportCheckpointManifest` is `safe-retry` only. A future phase modernizes `row-resume` so interrupted exports can pick up mid-strip without redoing completed work. That contract needs: per-strip durable byte offsets (existing `ExportCheckpointChunk` shape at `checkpoint-store.ts:22-27` already tracks `byteLength`); a `rolling_output_sha256` field on the journal updated after each durable flush; strict write→flush→journal-update ordering enforced by the engine; an `OutputSink.reopen(name) → { byteSize, rollingHashState }` + `truncate(offset)` + `append(chunk)` API contract; and a resume validation step that re-hashes existing output bytes against `rolling_output_sha256` before continuing. This is a separate spec.
8. **Streaming SHA-256 implementation choice.** v1 ships a JS implementation in `streaming-sha256.ts` for browser-side output hashing (~150 LOC, no external dep). Alternative: extend `luma-native-artifacts` with a WASM streaming SHA-256 hasher (faster but adds an artifact dependency to v1). Recommend **JS for v1** — well-known algorithm, no new toolchain — and revisit only if profiling shows hashing dominates export wall-time on a real device.

## 15. References

- `AGENTS.md` — Non-Negotiables, Product Boundary, Spec And Planning Artifacts, Verification.
- Related project memory:
  - `project_calibration_catalog_boundary` — catalog identity model consumed by `LutCatalogIdentity` and `CalibrationIdentity`.
  - `feedback_fix_at_source` — fix-at-source bias justifies move-vs-adapt for in-repo packages.
  - `project_export_capability_single_source` — single-source export capability work; P3 inherits this trajectory.
