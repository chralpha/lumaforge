# Capability-Driven Runtime Policy

- Date: 2026-05-21 (revised after adversarial review the same day)
- Status: Aligned with user — proceeding to plan
- Scope: The decision surface that selects export row slice, worker concurrency, runtime memory profile, checkpoint behaviour, preview HQ budget, and worker lifecycle across `/raw`. Affects `src/lib/export/execution-profile.ts`, `src/lib/export/full-res-export-client.ts`, `src/lib/export/full-res-export.worker.ts`, `src/lib/export/checkpoint-store.ts`, `src/lib/raw/luma-runtime-adapter.ts`, the export-system and export orchestrators under `src/modules/raw-processor/services/`, and the preview-copy capability surface in `orchestrate-full-res-export.ts`. Out of scope: the LUT graph, GL preview shaders, mobile vs desktop UI chrome (those remain interaction-driven splits).
- Predecessor work: the export profile table introduced `ios-safe`/`mobile-balanced`/`desktop-fast` named tiers and the heavy-component lifecycle spec landed earlier today. This spec replaces the named-tier decision model with a capability vector + derived policy and adopts a squoosh-style worker bridge for lifecycle.

## Background & Problem

`/raw` today carries four overlapping mode axes that compound at the export decision site:

1. Three named **export execution profiles** (`ios-safe`, `mobile-balanced`, `desktop-fast`) in `src/lib/export/execution-profile.ts`. Each fixes fifteen fields, of which six are identical across tiers (`rowBandRows`, `checkpointMode`, three `release...BeforeExport` flags, and `preferredRows` baseline shape).
2. A **runtime memory profile** axis (`'low-memory' | 'desktop'`) in `packages/luma-raw-runtime`. Today only one branch enables `'desktop'` (desktop-fast + pthread), and the preview adapter (`src/lib/raw/luma-runtime-adapter.ts`) hard-codes `requireCrossOriginIsolation: true`, which implicitly forces `'desktop'` for the preview path regardless of platform.
3. A **fidelity** user preference (`max | balanced | safe`) that combines multiplicatively with platform detection inside `chooseProfile`. The name is misleading: it does not affect JPEG quality, demosaic precision, or colour fidelity — it only modulates concurrency. This spec renames it to `performancePreference`.
4. A **previous-failure** session signal that demotes the chosen profile. Today this signal conflates two distinct outcomes: user cancel (intent) and OOM-like interruption (resource pressure). Penalties applied to a cancel are punitive without cause.

Three long-standing principle violations live inside this collapse:

- **`desktop-fast` sets `checkpointOutput: false` and `restartWorkerOnResourceRetry: false`** — trading recoverability for throughput on the fast path. This contradicts the project rule "compatibility first, then performance within compatibility." A user who hits a transient resource failure on desktop today must reload and start over.
- **The preview adapter forces `requireCrossOriginIsolation: true`** unconditionally. On `webkit-mobile` this produces a desktop-grade RAW runtime that is more OOM-prone than the export path on the same device.
- The `lowMemoryAvailable: boolean` field on the chooser interface is hard-coded `true` at both call sites (`export-system.ts:44`, `export-system.ts:72`). It is a lying capability.

A separate concern is **worker lifecycle**. Today the export profile carries three `release...BeforeExport` booleans plus an explicit `restartWorkerOnResourceRetry` flag. These are profile fields only because the codebase has no per-worker lifecycle discipline. Squoosh handles the equivalent problem in a 71-line `worker-bridge` module: a per-bridge promise chain, an `AbortSignal` that triggers `worker.terminate()`, and a 10-second idle timeout that auto-terminates the worker. That pattern subsumes "release before next phase" by lazy reclamation.

### Working-tree state at spec time

The unstaged working tree has already flipped `desktop-fast`'s three `release...BeforeExport` flags from `false` to `true` (preview pipeline + bounded-HQ buffer + previous-export result are now released on the desktop path before export). This is a **partial rollout**: the desktop path now disposes preview resources before export but still has `checkpointOutput: false` and `restartWorkerOnResourceRetry: false`. A resource failure on this path leaves the user with a blank stage and no resumable export. The Phase 1 PR must close this gap before Phase 2 ships — see §6.

## Decisions (confirmed with user, revised after adversarial review)

- **Decision surface**: collapse the three named export profiles to a single derived policy function. Names survive only as derived telemetry labels, never as decision sources.
- **Two policy targets**, one shared input: `deriveInteractivePolicy(cap)` for the preview path, `deriveExportPolicy(cap, image, intent, runtime)` for the export path. Both consume the same `CapabilityVector`. The product boundary "preview is allowed to optimize for responsiveness" survives as a *target-function difference*, not as a mode toggle.
- **Strict separation: stable capability vs export-time runtime resource.** `CapabilityVector` contains only facts that are stable over the session. Storage availability (OPFS quota minus usage, OPFS / streaming sink reachability) is snapshotted *at export-plan time*, not at boot.
- **Safety features are invariants in Phase 2, not in Phase 1.** Phase 1 is strictly behaviour-equivalent (preserves today's `restartWorkerOnResourceRetry: false` and `checkpointOutput: false` on `desktop-fast`). Phase 2 flips both to always-on across all derived policies and removes the fields.
- **`performancePreference`, not `fidelity`.** The user-preference type is renamed across the export plan, telemetry, and i18n. The migration is mechanical (one-to-one mapping) and lands in Phase 2.
- **Previous-failure source is distinguished.** Three flags replace today's single `previousInterrupted`: `previousResourceFailure`, `previousCrashLikeInterruption`, `previousUserInterrupted`. Only resource and crash-like outcomes apply a penalty; user cancel does not.
- **Worker lifecycle** adopts the squoosh bridge pattern. Each bridge owns a serial promise chain that explicitly recovers from rejection (`_queue = _queue.catch(() => undefined).then(...)`), propagates an `AbortSignal` that triggers `terminate()`, and auto-terminates after a configurable idle window.
- **OPFS output is written atomically.** Temp path → finalize marker → atomic rename. Aborted or failed exports clean up the temp path; checkpoint readers ignore temp paths without a finalize marker.
- **Legacy checkpoints never feed runtime decisions.** Old records' `profile` field is metadata for diagnostics/copy only. Resume re-derives a fresh conservative policy from the current capability vector, current export-time storage snapshot, and the manifest's image dimensions.
- **No legacy escape hatch.** The user explicitly declined a `LUMAFORGE_FORCE_DESKTOP_FAST_LEGACY` flag. Rollback strategy is `git revert` on the phase commits, not a runtime toggle.
- **Phased rollout, three phases**. Each phase is independently shippable and revertable.

## Glossary

- *Capability vector*: a frozen, sanitised struct of session-stable platform facts produced once at app boot. See §1.
- *Export runtime resources*: an export-time snapshot of session-volatile facts (OPFS quota minus usage, sink reachability). Recomputed at every export-plan call. See §1.5.
- *Policy*: the concrete output of a derive function — what row slice, what concurrency, which sink. Policies are derived from capability + intent + runtime resources, never set by name.
- *Bridge*: a per-worker class that owns the worker handle, serialises calls, propagates an `AbortSignal` to `worker.terminate()`, and reclaims the worker after an idle window.
- *Derived label*: a string telemetry name computed from a policy. It exists only for log filtering and does not feed back into decisions.

## Carry-Over Principles

- The `/raw` product boundary in `CLAUDE.md` is unchanged: single RAW file in, JPEG out, single user intent at a time. The bridge pattern works precisely because product flow already serialises the heavy paths.
- Preview is still authorised to use a higher budget than export (`deriveInteractivePolicy` returns a more generous `boundedHqMaxPixels` than the export path picks for row work).
- Export remains the authoritative full-resolution path. Where capability + resources are insufficient to safely produce the declared output, export must fail closed.
- The mobile/desktop UI chrome split (`MobileLabChrome` vs `RawToolSurface`) is interaction-driven and untouched.

## Section 1 · Capability Vector

**Principle.** Stable platform facts only. Sanitised at the boundary. Frozen. Never includes anything that can change during a session.

**Contract.**

| Field | Type | Source | Invariant |
|---|---|---|---|
| `coi` | `boolean` | `globalThis.crossOriginIsolated` | — |
| `pthread` | `boolean` | wasm-threads detect AND `coi` | `pthread === false when coi === false` |
| `deviceMemoryGB` | `number \| null` | `navigator.deviceMemory` | Safari returns `undefined` → `null` |
| `hwConcurrency` | `number` | `clampInteger(navigator.hardwareConcurrency ?? 1, 1, 64)` | `hwConcurrency >= 1` (hard floor at detector) |
| `webKitClass` | `'chromium' \| 'webkit-desktop-safari' \| 'webkit-mobile' \| 'unknown'` | UA classifier | never `null`, never empty string |
| `maybeOpfsSupported` | `boolean` | feature-detect `navigator.storage?.getDirectory != null` | does not include quota |

**Explicitly absent from the vector** (and the reason in each case):

- `opfsQuotaMB`, `opfsAvailableMB`, `opfsSinkAvailable`, `streamingSinkAvailable`: **storage availability is volatile**; it changes with prior outputs, checkpoints, other tabs, browser cleanup. These belong in `ExportRuntimeResources` (§1.5) and are recomputed at every export-plan call.
- `touch`: an interaction-model fact, not a capability. Lives in the UI layer.
- `performancePreference`: a user preference; passed to `deriveExportPolicy` as `intent`.
- `previousResourceFailure` / `previousCrashLikeInterruption` / `previousUserInterrupted`: session state; passed as `intent`.
- `lowMemoryAvailable`: deleted. It was a lying parameter.

**Detector contract.**

- One factory module `src/lib/runtime/capability-vector.ts` exposes:
  - `getCapabilityVector(): Promise<CapabilityVector>` — async to allow storage feature detection; runs once per session and memoises.
  - `getCapabilityVectorSnapshot(): CapabilityVector | null` — synchronous accessor for hot-path consumers; returns the cached value if detection completed, else `null`.
  - `setCapabilityVectorForTest(vector: CapabilityVector): void` and `resetCapabilityVectorForTest(): void` — test-only injection.
- The returned vector is `Object.freeze`'d and field-by-field normalised. Invariants enforced at the detector boundary, not at consumers.
- `import.meta.env.MODE === 'test'` returns a safe-default vector unless `setCapabilityVectorForTest` was called.

**Verification.**

- Unit tests for the UA-class refactor (input UA → expected `webKitClass`).
- Detector tests assert all invariants under hostile `navigator` shapes (missing fields, zero/negative `hardwareConcurrency`, undefined `deviceMemory`).
- A property test for invariant enforcement (`pthread implies coi`, `hwConcurrency >= 1`, `webKitClass !== null`).

## Section 1.5 · Export Runtime Resources

**Principle.** Volatile facts are computed at the moment of decision, not at boot.

**Contract.**

```
interface ExportRuntimeResources {
  opfsSinkAvailable: boolean
  opfsAvailableMB: number | null   // null = unknown; treat as no-OPFS for safety
  streamingSinkAvailable: boolean
}
```

Computation rule (called *immediately before* `deriveExportPolicy`, never cached):

- `opfsSinkAvailable = cap.maybeOpfsSupported && (await navigator.storage.estimate()).quota != null`
- `opfsAvailableMB = clamp((quota ?? 0) - (usage ?? 0), 0, ∞) / 1_000_000` when supported; `null` otherwise. The available bytes, not the total quota.
- `streamingSinkAvailable` from the existing feature probe (unchanged).

**Verification.**

- Unit tests with mocked `navigator.storage.estimate()` returning various `(quota, usage)` shapes.
- Integration test: simulate quota drop between two consecutive plans and assert the second plan reflects the new resource state.

## Section 2 · Derive Functions

**Principle.** Policies are produced by total pure functions. Same input produces same output. No `Math.random`, no fallback to `globalThis`, no hidden config files.

### 2.1 `deriveInteractivePolicy(cap: CapabilityVector): InteractivePolicy`

Output:

```
interface InteractivePolicy {
  boundedHqMaxPixels: number
  previewWorkerMemoryProfile: 'low-memory' | 'desktop'
  allowConcurrentDecodeAndLutParse: boolean
}
```

Derivation:

- `boundedHqMaxPixels`: start `16_000_000`; floor `8_000_000` if `webKitClass === 'webkit-mobile' || !pthread`; floor `deviceMemoryGB * 4_000_000` if `deviceMemoryGB != null`. Result = `min` of caps.
- `previewWorkerMemoryProfile`: `'desktop'` only when `coi && pthread && webKitClass === 'chromium'` (Phase 2 first version — conservative; Safari desktop unlocks via Phase 2.1 calibration). Otherwise `'low-memory'`.
- `allowConcurrentDecodeAndLutParse`: `pthread && hwConcurrency >= 4`.

### 2.2 `deriveExportPolicy(cap, image, intent, runtime): ExportPolicy`

Signature:

```
interface ExportIntent {
  performancePreference: 'safe' | 'balanced' | 'max'
  previousResourceFailure: boolean
  previousCrashLikeInterruption: boolean
  previousUserInterrupted: boolean   // recorded but applies no penalty
}

function deriveExportPolicy(
  cap: CapabilityVector,
  image: { width: number; height: number },
  intent: ExportIntent,
  runtime: ExportRuntimeResources,
): ExportPolicy
```

Output:

```
type PolicyProductCopy =
  | 'high-performance'
  | 'safe-export'
  | 'resource-retry'
  | 'interrupted-retry'
  | 'non-durable-checkpoint'
  | 'cannot-safely-complete'

interface ExportPolicy {
  rowSlice: number
  concurrency: number
  maxConcurrency: number
  workerMemoryProfile: 'low-memory' | 'desktop'
  persistEveryNRows: number
  outputSink: 'opfs-file' | 'streaming' | 'blob-handoff'
  productCopy: PolicyProductCopy
  derivedLabel: string
}
```

The export orchestration may *override* `productCopy` with the orchestration-only value `'interrupted-source-needed'` when the source `File` is missing on resume. That value is **not** producible by `deriveExportPolicy`; it lives at the orchestration boundary:

```
type ExportOrchestrationCopy = PolicyProductCopy | 'interrupted-source-needed'
```

**Row slice**:
- Baseline `512`.
- Halve when megapixels ≥ 100.
- `min(256)` when `!pthread`.
- `min(128)` when `webKitClass === 'webkit-mobile'`.
- `min(256)` when `webKitClass === 'webkit-desktop-safari'`.
- `min(128)` when `deviceMemoryGB != null && deviceMemoryGB <= 4`.
- Penalty `÷ 2` on `previousResourceFailure`; `÷ 4` on `previousCrashLikeInterruption`. `previousUserInterrupted` applies no penalty.
- Final `clamp(64, 2048)`.

**Concurrency**:
- `threadBudget = Math.max(1, cap.hwConcurrency - 1)`
- `cMax = pthread ? Math.min(threadBudget, 3) : 1`
- `cMax = 1` when `webKitClass ∈ {'webkit-mobile', 'webkit-desktop-safari'}`.
- `cMax = 1` when `intent.previousResourceFailure || intent.previousCrashLikeInterruption`.
- `preferenceWeight = { safe: 1, balanced: 2, max: 3 }[performancePreference]`.
- `concurrency = clamp(preferenceWeight, 1, cMax)`; `maxConcurrency = Math.max(1, cMax)` (hard floor — guards against any drift below 1).

**Worker memory profile** (Phase 2 first version, conservative):
- `'desktop'` only when `coi && pthread && webKitClass === 'chromium'`.
- Otherwise `'low-memory'`.
- Phase 2.1 (post-telemetry) may expand to `webkit-desktop-safari && deviceMemoryGB >= 8`.

**Persist cadence** (always on in Phase 2):
- `targetRows = rowSlice <= 128 ? 2048 : 4096`
- `persistEveryNRows = clamp(Math.ceil(targetRows / rowSlice) * rowSlice, rowSlice, 4096)`

  | rowSlice | persistEveryNRows |
  |---:|---:|
  | 64 | 2048 |
  | 128 | 2048 |
  | 256 | 4096 |
  | 512 | 4096 |
  | 1024 | 4096 |

**Output sink** (uses runtime resources, not capability):
- `'opfs-file'` when `runtime.opfsSinkAvailable && runtime.opfsAvailableMB != null && runtime.opfsAvailableMB > megapixels * 4 + 64` (4 MB/MP JPEG headroom plus 64 MB safety margin; constants calibrated in Phase 2.1).
- Else `'streaming'` when `runtime.streamingSinkAvailable`.
- Else `'blob-handoff'`.

**Product copy**:
- `'cannot-safely-complete'` when `megapixels > 50 && outputSink === 'blob-handoff' && webKitClass === 'webkit-mobile'`.
- `'interrupted-retry'` when `intent.previousCrashLikeInterruption`.
- `'resource-retry'` when `intent.previousResourceFailure`.
- `'non-durable-checkpoint'` when `outputSink === 'blob-handoff' && megapixels > 50` (the 50 MP threshold is a constant defined alongside the derive function — `LARGE_EXPORT_MEGAPIXEL_THRESHOLD = 50`).
- `'high-performance'` when `workerMemoryProfile === 'desktop' && concurrency >= 2 && rowSlice >= 512`.
- `'safe-export'` otherwise.
- `'interrupted-source-needed'` is set only by the export orchestration on resume when the source `File` is missing — never by this derive.

**Derived label** (telemetry only, never branched on):
```
`${workerMemoryProfile}-thr${concurrency}-rs${rowSlice}-${outputSink}-wk${webKitClass}`
```
Example: `"low-memory-thr1-rs128-opfs-file-wkwebkit-mobile"`. The `rs` and `wk` segments are essential because two policies with the same memory profile and concurrency can differ on row slice and platform — without them, dashboards group rows of unlike behaviour.

**Verification.**

- Property test: 10k random vectors and inputs. Assert invariants:
  - `rowSlice ∈ [64, 2048]`.
  - `concurrency >= 1` and `maxConcurrency >= 1` (this is the bug-resistant invariant; `concurrency <= maxConcurrency` always).
  - `persistEveryNRows >= rowSlice && persistEveryNRows <= 4096`.
  - `workerMemoryProfile === 'low-memory' || (coi && pthread && webKitClass === 'chromium')`.
  - Worker memory profile never `'desktop'` when `webKitClass === 'webkit-mobile'`.
  - Penalty monotonicity: `previousResourceFailure: true` weakly decreases `rowSlice` and `concurrency` vs `false`; `previousCrashLikeInterruption: true` strictly decreases vs `false`.
  - User cancel idempotency: flipping only `previousUserInterrupted` produces the same policy.
- Snapshot tests for ten representative cases (iPhone Safari 24 MP, Pixel Chrome 60 MP, M1 Safari desktop 100 MP, Chromium Linux 60 MP + previous resource failure, Chromium Linux + previous user cancel — must equal no-penalty case, etc.).

## Section 3 · Worker Bridges

**Principle.** Each heavy worker is owned by a bridge instance that serialises calls, propagates `AbortSignal` end-to-end, and auto-terminates on idle. Lifecycle is mechanical, not procedural. Squoosh's `worker-bridge/index.ts` is the working precedent.

**Contract on each bridge.**

- Internal state: `_queue: Promise<unknown>`, `_worker?: Worker`, `_workerApi?: Wrapped`, `_idleTimer?: number`.
- Each public method:
  1. Takes an `AbortSignal` as its first argument.
  2. Updates the queue with **explicit rejection recovery**: `this._queue = this._queue.catch(() => undefined).then(async () => { ... })`. This is mandatory, not a "nice to have" — a single rejected call must not brick subsequent calls.
  3. Throws `AbortError` synchronously if the signal is already aborted, before any worker work.
  4. Lazy-starts the worker if `_worker` is undefined; clears any pending idle timer.
  5. Registers an `abort` listener that calls `_terminateWorker()`.
  6. After the wrapped call settles (success or failure), removes the abort listener and starts a new `_idleTimer` to terminate the worker after `IDLE_MS`.
- `IDLE_MS` default `10_000` (squoosh's value).
- The bridge does not expose `_worker` or `_workerApi`. Consumers use the typed method surface only.

**Two bridges in scope.**

1. `RawDecodeBridge` wrapping the RAW runtime worker. Replaces the singleton + ad-hoc lifecycle in `src/lib/raw/luma-runtime-adapter.ts`. Methods: `prewarm`, `decodeEmbedded`, `decodeQuick`, `decodeBoundedHq`, `decodeForExport`. Each takes an `AbortSignal`.
2. `ExportBridge` wrapping `full-res-export.worker.ts`. Replaces lifecycle code in `full-res-export-client.ts` and the export orchestration. Methods: `runExport`, `cancelExport`.

**What this lets us delete (Phase 2, after the policy collapse).**

- `releasePreviewPipelineBeforeExport`, `releaseBoundedHqBufferBeforeExport`, `releasePreviousExportResultBeforeExport` — three booleans in every profile. When `ExportBridge.runExport` starts, it explicitly `await rawDecodeBridge.terminate()` to preserve today's pre-export memory-peak shape (the bridge's idle timer alone would leave a 10-second window where both workers coexist).
- `restartWorkerOnResourceRetry` — the bridge already terminates the worker on abort, and a subsequent call lazy-starts a fresh one. Restart-on-retry becomes default behaviour.

**Boundary discipline.**

- `LutParsing`, `GlPaint`, per-frame preview math do **not** get bridges. The bridge pattern applies only to crossings of (a) a Worker boundary AND (b) heavy work (wasm/large buffers).
- `prewarm` on the RAW bridge remains UI-silent per the predecessor spec. It cancels its own idle timer so the warm worker survives long enough for the user to commit; it resolves with the existing structured outcome `{ status: 'ready' | 'failed', ... }`.

**Verification.**

Unit tests using a stubbed `Worker` global must cover:
- Two parallel calls execute serially (queue ordering).
- Call A fails → Call B still runs (rejection recovery — this is the bug Codex flagged).
- Call B aborts while queued behind Call A → Call B does **not** lazy-start a worker after A finishes.
- Abort during an active call → `worker.terminate()` is called, internal state is cleared, the next call starts a fresh worker.
- Idle-terminate after success AND after failure both fire (`_idleTimer` is set in `finally`, not in `then`).
- Idle-terminate is cancelled when a new call arrives within the window.

## Section 3.5 · OPFS Output Atomicity

**Principle.** Aggressive worker termination + checkpointed OPFS output means writes can be interrupted mid-stream. The on-disk state must never present a partial file as complete.

**Contract.**

- Export writes to a temp path: `${target}.tmp-${exportId}`.
- A finalize marker is written only after the last byte is flushed: `${target}.tmp-${exportId}.finalized` (sentinel file, zero-byte, or a metadata key — implementation choice deferred to plan).
- Atomic commit: rename `${target}.tmp-${exportId}` → `${target}` only after the finalize marker is present. The rename is atomic on OPFS.
- Abort or failure path: delete the temp path when reachable; if delete fails (browser/OPFS quirks), leave the temp path — it will not be picked up by checkpoint readers because no finalize marker exists.
- Checkpoint readers: ignore any `*.tmp-*` path without a sibling `.finalized` marker. Garbage-collect orphaned temp paths older than 24 hours on the next successful export.

**Verification.**

- Integration test: start export, abort mid-write, assert no committed output and no checkpoint resume points to the temp path.
- Integration test: kill the worker via `terminate()` mid-write; assert reader does not pick up the temp file on next session.

## Section 4 · Checkpoint Store Compatibility

**Constraint.** `src/lib/export/checkpoint-store.ts:33` persists a `profile: ExportExecutionProfileName` field. The store is durable across sessions; a hard schema break would invalidate in-progress checkpoints.

**Decision.** Keep the field as **metadata only**. It never feeds runtime decisions.

- The persisted record gains a new field `derivedLabel: string` written from the policy.
- `profile` is retained for read compatibility and human-readable debug copy. New writes set it deterministically from the policy (`workerMemoryProfile === 'desktop' && concurrency >= 2 && rowSlice >= 512 ? 'desktop-fast' : webKitClass === 'webkit-mobile' && workerMemoryProfile === 'low-memory' ? 'ios-safe' : 'mobile-balanced'`) so the field type stays valid.
- **Resume rule**: when reading a checkpoint, **always re-derive a fresh policy** from the current `CapabilityVector`, the current `ExportRuntimeResources` snapshot, and the manifest's image dimensions. The stored `profile` and `derivedLabel` are *only* read for:
  - telemetry fallback labels in resume events,
  - human-readable diagnostic copy on the recovery surface,
  - conservative-resume hinting (e.g. if the stored profile was `ios-safe`, the resume UI may surface "this was a low-memory export" copy).
- Stored `profile` MUST NOT select row slice, concurrency, memory profile, or output sink on resume. If the freshly derived policy diverges from the stored values, the fresh policy wins; if that materially changes the output (e.g. smaller row slice means resuming requires re-computing already-emitted strips), the resume path fails closed and the user is prompted to start a new export.
- After Phase 3 ships and a deprecation window passes, `profile` may be dropped in a future migration. Not in scope.

**Verification.**

- Round-trip test: write a current-policy record, read with the new reader, assert `derivedLabel` is the source of truth on debug surfaces and that resume re-derives policy from current capability/runtime.
- Backward-read test: write a record with only the legacy `profile` field, read with the new reader, assert that resume re-derives a fresh conservative policy from current state — **never** synthesises policy values from the profile name.

## Section 5 · Telemetry and i18n

**Telemetry.**

- `export-plan-selected` debug event keeps the same dispatch path. The payload gains `derivedLabel: string` and `policyVector: ExportPolicy`.
- The legacy `profile: ExportExecutionProfileName` field is retained in the payload until Phase 3 ships.
- `runtimeMemoryProfile` in the payload reflects `workerMemoryProfile` from the policy.

**i18n.**

- `raw.export.lowMemory` retained.
- New keys: `raw.export.highPerformance`, `raw.export.derivedLabelHint` (debug panel only). Both `en.json` and `zh-CN.json`.
- `getExportModeCopy(...)` continues to map `productCopy` enum values to human strings; the enum stays stable.
- The `fidelity` → `performancePreference` rename touches one user-facing string in each locale and the matching key in `src/locales/`.

## Section 6 · Phasing

Each phase is a single PR (or a tight stack), ships independently, and is revertable via `git revert`.

### Phase 1 · Bridge refactor (strictly behaviour-equivalent)

- Introduce `RawDecodeBridge` and `ExportBridge` per §3, including explicit `_queue.catch(() => undefined).then(...)` queue shape.
- Migrate `src/lib/raw/luma-runtime-adapter.ts` to use `RawDecodeBridge`.
- Migrate `full-res-export-client.ts` and the export orchestration to use `ExportBridge`.
- `ExportBridge.runExport`'s first step is `await rawDecodeBridge.terminate()` (synchronous reclamation) to match today's pre-export memory-peak shape.
- **No safety-invariant changes.** `restartWorkerOnResourceRetry` and `checkpointOutput` retain their current per-profile values. Phase 1 does not enable always-on checkpoint or always-on retry.
- **Pre-Phase 1 prerequisite**: the unstaged working tree already flipped `desktop-fast`'s three `release...BeforeExport` flags to `true`. This left the desktop path in a partial state where preview is released but neither checkpoint nor auto-restart is active — a resource failure produces a blank stage with no resume. Phase 1 must EITHER:
  - (a) revert those flags so Phase 1 truly preserves prior behaviour, OR
  - (b) treat Phase 1 as Phase 1 + Phase 2 stacked: ship bridge **and** flip checkpoint/restart invariants together in the same PR, with the regression tests below.
  - The plan that follows this spec will pick one. Default recommendation: **(a)** — revert and defer to Phase 2.
- **Regression test (always required, regardless of (a) or (b))**: preview-size copy capability. The export result currently advertises preview-size copy when the browser supports PNG clipboard fallback (`orchestrate-full-res-export.ts:332-337`), but `previewCopyCanvas` is only prepared when the plan does NOT release the preview pipeline. The bridge refactor must either capture the preview-copy canvas before evacuation, downgrade `copyCapability` when evacuation is planned, or restore the preview before the Copy action fires. The test asserts that any code path which sets `copyCapability.previewSize.available = true` also has a reachable canvas source.

### Phase 2 · Capability vector and derived policies

- Add `src/lib/runtime/capability-vector.ts` and `src/lib/runtime/export-runtime-resources.ts`.
- Add `src/lib/runtime/interactive-policy.ts` and `src/lib/runtime/export-policy.ts`.
- Replace `chooseProfile` / `selectExportExecutionPlan` internals; keep their public function signatures returning an `ExportExecutionPlan`-shaped object, but compute via `deriveExportPolicy`.
- Update `src/lib/raw/luma-runtime-adapter.ts` to consult `deriveInteractivePolicy` instead of hard-coding `requireCrossOriginIsolation: true`.
- **Flip safety invariants to always-on**: `checkpointOutput: true` for every derived plan; persist cadence from §2.2; `restartWorkerOnResourceRetry` becomes implicit via bridge. Add the regression tests for "desktop export → resource failure → automatic restart → completes" and "desktop export → resource failure → checkpoint resumes from durable record."
- Rename `fidelity` to `performancePreference` across types, telemetry payload, and i18n keys.
- Split `previousInterrupted` into `previousResourceFailure`, `previousCrashLikeInterruption`, `previousUserInterrupted` at the call sites that record these signals.
- The named profile labels survive in the persisted `profile` field per §4 and in the telemetry payload alongside `derivedLabel`.

### Phase 2.1 · Calibration (post-telemetry, optional)

- Observe `policyVector` distribution and `cannot-safely-complete` rate across `chromium`, `webkit-desktop-safari`, `webkit-mobile` for two weeks.
- Tune constants if data warrants: OPFS safety margin (default 64 MB), the 4 MB/MP JPEG factor, desktop Safari memory-profile gate (`webkit-desktop-safari && deviceMemoryGB >= 8` → `'desktop'`).
- This phase is data-driven, not a code refactor. Scope it as a separate PR only if calibration actually moves a constant.

### Phase 3 · Cleanup

- Delete `lowMemoryAvailable` from the chooser interface and the two call sites.
- Delete the `EXPORT_EXECUTION_PROFILES` table. Profile-name `string` literals survive only inside the checkpoint legacy reader and the telemetry legacy field.
- Delete `restartWorkerOnResourceRetry` field from the plan type.
- Replace `boundedHqMaxPixels` field in the plan type with a call to `deriveInteractivePolicy(cap)` at every consumer site.
- Update tests that asserted on named profiles to assert on derived labels or policy vectors.

## Section 7 · Cost & Benefit

**Cost (revised after adversarial review).**

| Item | Estimate |
|---|---|
| Files touched (direct grep) | 18 existing references + 6 new files (`capability-vector.ts`, `export-runtime-resources.ts`, `interactive-policy.ts`, `export-policy.ts`, `raw-decode-bridge.ts`, `export-bridge.ts`) |
| Net code delta | +250 lines new logic (more than original estimate due to atomic-output contract, runtime-resource snapshot, expanded property tests), −250 lines deleted ≈ **net zero LOC** |
| Worker code changes | Minimal: worker still reads `workerMemoryProfile` and `rowSlice` from message payload. The OPFS atomic-write contract may add a small finalize-marker step inside the worker (~30 lines). |
| Checkpoint-store schema | Additive (new `derivedLabel`); old `profile` retained as metadata only |
| Test rewrite | Property test (new) + ~10 snapshot tests (new) + bridge unit tests (the 6 listed scenarios) + OPFS atomicity integration tests + resume-re-derive tests; total new test code ~600 lines. Existing named-profile fixtures across `execution-profile.test.ts` and `export-system` tests are migrated, not deleted. |
| i18n | 2 new keys per locale; `fidelity` → `performancePreference` is a mechanical rename |
| Engineering days | **5–7** implementation, **2–3** browser-matrix verification. Total **7–10 days**, pessimistic **12 days**. (Up from 4–6 because the adversarial pass added atomic OPFS contract, resource snapshot, property-test invariants, and the preview-copy regression test.) |

**Benefit.**

- Decision surface collapses from a `platform × profile × fidelity` matrix to a continuous policy over a sanitised vector + an export-time resource snapshot.
- Three long-standing principle violations are fixed (always-on checkpoint, always-on restart, preview respects platform).
- Lying capability flag `lowMemoryAvailable` deleted.
- Worker lifecycle is mechanical (idle-terminate) instead of procedural (`release...BeforeExport` flags).
- OPFS partial-output corruption is impossible by construction.
- Resume from old checkpoints is safe (always re-derive policy; never resurrect stale profile semantics).
- Telemetry gains the policy vector AND a richer `derivedLabel` (now including `rowSlice` and `webKitClass`) — distinct strategies no longer collapse to the same label.
- The misnamed `fidelity` becomes the accurate `performancePreference`.

**Explicit non-goals.**

- No SSR-time capability detection.
- No dynamic re-detection of capability mid-session.
- No legacy feature flag.

## Section 8 · Risks and Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Phase 1 partial-state regression (preview released without checkpoint/restart) | High if not addressed | Phase 1 prerequisite in §6 explicitly resolves this before Phase 1 lands. Regression test for "desktop resource failure has resumable state" is mandatory if going the (b) path. |
| Preview-size Copy advertised after preview release | Already a working-tree bug | Phase 1 regression test asserts `copyCapability.previewSize.available === true ⇒ canvas reachable`. |
| First-version derive thresholds wrong on real hardware | Medium | Phase 2.1 calibration window with `policyVector` telemetry. |
| `navigator.deviceMemory` undefined on Safari | Certain | Null-tolerant derive; `webKitClass` covers Safari ceiling separately. |
| OPFS estimate races with first export | Low | `ExportRuntimeResources` computed immediately before each plan call, not at boot. |
| Phase 1 bridge regression under retry | Medium | Bridge unit tests cover the 6 scenarios in §3 verification. |
| Property tests over-constrain derive math | Low | Invariants are bounds-and-monotonicity, not exact values; snapshot tests catch intentional changes via reviewable diffs. |
| Legacy reader synthesises wrong policy from stale `profile` | Eliminated by design | §4 forbids using `profile` for runtime decisions; resume always re-derives from current state. Phase 2 unit test pins this. |
| Bridge `_queue` brick on first rejection | Eliminated by design | §3 mandates `_queue.catch(() => undefined).then(...)`; bridge test "call A fails → call B still runs" is mandatory. |
| OPFS partial-output corruption | Eliminated by design | §3.5 temp-path + finalize-marker contract; abort tests assert no committed output. |

## Section 9 · Appendix · Affected Files Inventory

Direct references to named profile literals or `ExportExecutionProfileName` — 18 files:

```
src/modules/raw-processor/components/tools/ExportTool.test.tsx
src/modules/raw-processor/components/ProgressOverlay.test.tsx
src/modules/raw-processor/model/session.ts
src/modules/raw-processor/services/export-evacuation.ts
src/modules/raw-processor/services/export-recovery.test.ts
src/modules/raw-processor/services/export-state.test.ts
src/modules/raw-processor/services/export-evacuation.test.ts
src/modules/raw-processor/__tests__/export-system.test.ts
src/lib/export/execution-profile.ts
src/lib/export/checkpoint-store.test.ts
src/lib/export/full-res-export.worker.ts
src/lib/export/checkpoint-store.ts
src/lib/export/execution-profile.test.ts
src/lib/export/full-res-export-client.ts
src/lib/export/full-res-export-client.test.ts
src/lib/export/full-res-export.worker.test.ts
src/modules/raw-processor/hooks/useRawProcessor.ts
src/modules/raw-processor/hooks/useRawProcessor.test.tsx
```

Working-tree partial rollout to resolve in Phase 1 prerequisite:

```
src/lib/export/execution-profile.ts (desktop-fast release flags flipped to true)
src/modules/raw-processor/services/export/orchestrate-full-res-export.ts (preview-copy capability path)
```

New files introduced by this spec:

```
src/lib/runtime/capability-vector.ts
src/lib/runtime/export-runtime-resources.ts
src/lib/runtime/interactive-policy.ts
src/lib/runtime/export-policy.ts
src/lib/workers/raw-decode-bridge.ts
src/lib/workers/export-bridge.ts
```

(Paths are illustrative; the plan PR may choose a different location under `src/lib/`.)
