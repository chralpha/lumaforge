# Capability-Driven Runtime Policy

- Date: 2026-05-21
- Status: Aligned with user — proceeding to plan
- Scope: The decision surface that selects export row slice, worker concurrency, runtime memory profile, checkpoint behaviour, preview HQ budget, and worker lifecycle across `/raw`. Affects `src/lib/export/execution-profile.ts`, `src/lib/export/full-res-export-client.ts`, `src/lib/export/full-res-export.worker.ts`, `src/lib/export/checkpoint-store.ts`, `src/lib/raw/luma-runtime-adapter.ts`, and the export-system orchestration in `src/modules/raw-processor/services/`. Out of scope: the LUT graph, GL preview shaders, mobile vs desktop UI chrome (those remain interaction-driven splits).
- Predecessor work: the export profile table introduced `ios-safe`/`mobile-balanced`/`desktop-fast` named tiers and the heavy-component lifecycle spec landed earlier today. This spec replaces the named-tier decision model with a capability vector + derived policy and adopts a squoosh-style worker bridge for lifecycle.

## Background & Problem

`/raw` today carries four overlapping mode axes that compound at the export decision site:

1. Three named **export execution profiles** (`ios-safe`, `mobile-balanced`, `desktop-fast`) in `src/lib/export/execution-profile.ts`. Each fixes fifteen fields, of which six are identical across tiers (`rowBandRows`, `checkpointMode`, three `release...BeforeExport` flags, and `preferredRows` baseline shape).
2. A **runtime memory profile** axis (`'low-memory' | 'desktop'`) in `packages/luma-raw-runtime`. Today only one branch enables `'desktop'` (desktop-fast + pthread), and the preview adapter (`src/lib/raw/luma-runtime-adapter.ts`) hard-codes `requireCrossOriginIsolation: true`, which implicitly forces `'desktop'` for the preview path regardless of platform.
3. A **fidelity** user preference (`max | balanced | safe`) that combines multiplicatively with platform detection inside `chooseProfile`.
4. A **previous-failure** session signal that demotes the chosen profile.

The chooser collapses five independent boolean/enum facts into three named tiers, then re-expands them when consumers need to derive concurrency, sink, or memory profile. Two long-standing principle violations live inside this collapse:

- **`desktop-fast` sets `checkpointOutput: false` and `restartWorkerOnResourceRetry: false`** — trading recoverability for ~5–15% throughput on the fast path. This contradicts the project rule "compatibility first, then performance within compatibility." A user who hits a transient resource failure on desktop today must reload and start over.
- **The preview adapter forces `requireCrossOriginIsolation: true`** unconditionally. On `webkit-mobile` this produces a desktop-grade RAW runtime that is more OOM-prone than the export path on the same device, an inconsistency only justified by "preview is allowed to optimize for responsiveness" — which is true, but the *upper bound* of preview should still respect the device.
- The `lowMemoryAvailable: boolean` field on the chooser interface is hard-coded `true` at both call sites (`export-system.ts:44`, `export-system.ts:72`). It is a lying capability.

A separate concern is **worker lifecycle**. Today the export profile carries three `release...BeforeExport` booleans (all `true` in every tier) plus an explicit `restartWorkerOnResourceRetry` flag. These are profile fields only because the codebase has no per-worker lifecycle discipline. Squoosh handles the equivalent problem in a 71-line `worker-bridge` module: a per-bridge promise chain, an `AbortSignal` that triggers `worker.terminate()`, and a 10-second idle timeout that auto-terminates the worker. That pattern subsumes "release before next phase" by lazy reclamation.

## Decisions (confirmed with user)

- **Decision surface**: collapse the three named export profiles to a single derived policy function. Names survive only as derived telemetry labels (e.g. `"derived-low-memory-thr1"`), never as decision sources.
- **Two policy targets**, one shared input: `deriveInteractivePolicy(cap)` for the preview path, `deriveExportPolicy(cap, image, opts)` for the export path. Both consume the same `CapabilityVector`. The product boundary "preview is allowed to optimize for responsiveness" survives as a *target-function difference*, not as a mode toggle.
- **Safety features are invariants**, not tier fields. `restartWorkerOnResourceRetry` and `checkpointOutput` are removed; both behaviours are always on. Checkpoint flush cadence is derived from row size so the desktop fast path pays near-zero overhead (`persistEveryNRows ≈ 4096 ÷ rowSlice * rowSlice`).
- **Worker lifecycle** adopts the squoosh bridge pattern. One bridge per heavy worker (RAW decode, full-res export). Each bridge owns a serial promise chain, propagates an `AbortSignal` that triggers `terminate()`, and auto-terminates after a configurable idle window. The three `release...BeforeExport` profile flags are deleted; the bridge handles reclamation by being idle.
- **No legacy escape hatch.** The user explicitly declined a `LUMAFORGE_FORCE_DESKTOP_FAST_LEGACY` flag. Rollback strategy is `git revert` on the phase commits, not a runtime toggle.
- **Phased rollout, three phases**. Each phase is independently shippable and revertable. Phase 1 is the bridge refactor (behaviour-equivalent), Phase 2 introduces the capability vector and derived policies, Phase 3 deletes dead fields and migrates telemetry/i18n.

## Glossary

- *Capability vector*: a frozen, six-field struct of platform-observable facts produced once at app boot. See §2.
- *Policy*: the concrete output of a derive function — what row slice, what concurrency, which sink. Policies are derived from capability + intent, never set by name.
- *Bridge*: a per-worker class that owns the worker handle, serializes calls, propagates an `AbortSignal` to `worker.terminate()`, and reclaims the worker after an idle window.
- *Derived label*: a string telemetry name computed from a policy (e.g. `"low-memory-thr1-opfs"`). It exists only for log filtering and does not feed back into decisions.

## Carry-Over Principles

- The `/raw` product boundary in `CLAUDE.md` is unchanged: single RAW file in, JPEG out, single user intent at a time. The bridge pattern works precisely because product flow already serializes the heavy paths.
- Preview is still authorized to use a higher budget than export (`deriveInteractivePolicy` returns a more generous `boundedHqMaxPixels` than the export path picks for row work).
- Export remains the authoritative full-resolution path. Where capability is insufficient to safely produce the declared output, export must fail closed (the `'cannot-safely-complete'` product copy is retained and rederived from the policy).
- The mobile/desktop UI chrome split (`MobileLabChrome` vs `RawToolSurface`) is interaction-driven and untouched.

## Section 1 · Capability Vector

**Principle.** Decisions take observable platform facts as input, not pre-named tiers. Each fact is collected once, exposed as a frozen object, and consumed by pure derive functions.

**Contract.**

The vector has six fields. There are no other capability inputs anywhere in the decision pipeline.

| Field | Type | Source | Notes |
|---|---|---|---|
| `coi` | `boolean` | `globalThis.crossOriginIsolated` | Self-hosted deploys force COI via `vite.config.ts` headers; `false` only when embedded/iframed. |
| `pthread` | `boolean` | Existing `supports-wasm-threads` style detect | Implied false when `coi` is false. |
| `opfsQuotaMB` | `number \| null` | `navigator.storage.estimate()`, cached at boot | `null` = unknown; treat as "no OPFS" for safety. |
| `deviceMemoryGB` | `number \| null` | `navigator.deviceMemory` | Safari returns `undefined`; null-tolerant. |
| `hwConcurrency` | `number` | `navigator.hardwareConcurrency` | Safari caps to 8, sometimes lies; consumers always clamp. |
| `webKitClass` | `'chromium' \| 'webkit-desktop-safari' \| 'webkit-mobile' \| 'unknown'` | Existing UA-class function (`isKnownRiskWebKitMobile` + `isKnownRiskWebKitDesktop` refactored) | Hard signal — overrides numeric fields when it implies a stricter ceiling. |

**Explicitly absent from the vector** (and the reason in each case):

- `touch`: an interaction-model fact, not a capability. Lives in the UI layer.
- `fidelity`: a user preference; passed to `deriveExportPolicy` as an `opts` weight.
- `previousResourceFailure` / `previousInterrupted`: session state; passed to `deriveExportPolicy` as `opts` penalty inputs.
- `lowMemoryAvailable`: deleted. It was a lying parameter (hard-coded `true` everywhere it was called).

**Contract on the detector.**

- One factory module `src/lib/runtime/capability-vector.ts` exposes `getCapabilityVector(): Promise<CapabilityVector>` (async to allow `navigator.storage.estimate()`) and a synchronous `getCapabilityVectorSnapshot(): CapabilityVector | null` for hot-path consumers (returns the cached value if boot detection completed, else `null` to force the caller to await).
- The vector is computed exactly once per session. Re-detection is not supported (capability facts are stable enough for our purposes and re-running `storage.estimate()` is a perf trap).
- The detector is test-deterministic: `import.meta.env.MODE === 'test'` returns a fixed safe-default vector unless the test injects a fixture. No `Math.random`, no clocks.

**Verification.**

- Pure-function unit tests for the UA-class refactor (input UA → expected `webKitClass`).
- Integration test that boots the vector in an `happy-dom` environment with mocked `navigator`/`globalThis` flags and asserts the produced vector.

## Section 2 · Derive Functions

**Principle.** Policies are produced by total pure functions. Same input produces same output. No `Math.random`, no fallback to `globalThis`, no hidden config files.

### 2.1 `deriveInteractivePolicy(cap: CapabilityVector): InteractivePolicy`

Output shape:

```
interface InteractivePolicy {
  boundedHqMaxPixels: number
  previewWorkerMemoryProfile: 'low-memory' | 'desktop'
  allowConcurrentDecodeAndLutParse: boolean
}
```

Derivation (concise; the implementation may refactor, but the *effective ceiling per branch* must match):

- `boundedHqMaxPixels`:
  - Start at `16_000_000`.
  - Floor `8_000_000` if `webKitClass === 'webkit-mobile'`.
  - Floor `8_000_000` if `!pthread`.
  - Floor `deviceMemoryGB * 4_000_000` if `deviceMemoryGB != null` (caps the budget on low-RAM devices).
  - Result is `min` of all caps.
- `previewWorkerMemoryProfile`:
  - `'desktop'` only when `coi && pthread && webKitClass !== 'webkit-mobile'`.
  - Otherwise `'low-memory'`.
- `allowConcurrentDecodeAndLutParse`:
  - `pthread && hwConcurrency >= 4`. Used by the LUT parsing path to decide whether it can overlap with an in-flight decode.

**Why these shapes.** The preview target is "maximize visible HQ within OOM-safety margins." The webkit-mobile ceiling matches the current `ios-safe` boundedHq cap (8 MP); the chromium/desktop ceiling lifts to 16 MP from today's 12 MP because the bridge pattern reclaims memory aggressively (see §3), removing a constraint that today's profile table conservatively bakes in.

### 2.2 `deriveExportPolicy(cap, image, opts): ExportPolicy`

Inputs:

```
interface ExportInputs {
  image: { width: number; height: number }
  opts: {
    fidelity: 'safe' | 'balanced' | 'max'
    previousResourceFailure: boolean
    previousInterrupted: boolean
    opfsSinkAvailable: boolean
    streamingSinkAvailable: boolean
  }
}
```

Output shape:

```
interface ExportPolicy {
  rowSlice: number
  concurrency: number
  maxConcurrency: number
  workerMemoryProfile: 'low-memory' | 'desktop'
  persistEveryNRows: number
  outputSink: 'opfs-file' | 'streaming' | 'blob-handoff'
  productCopy:
    | 'high-performance'
    | 'safe-export'
    | 'resource-retry'
    | 'interrupted-retry'
    | 'interrupted-source-needed'
    | 'non-durable-checkpoint'
    | 'cannot-safely-complete'
  derivedLabel: string
}
```

Derivation rules (the implementation must produce values equivalent to these; algebra may refactor):

- **Row slice**:
  - Baseline `512`.
  - Halve when megapixels ≥ 100.
  - `min(256)` when `!pthread`.
  - `min(128)` when `webKitClass === 'webkit-mobile'`.
  - `min(256)` when `webKitClass === 'webkit-desktop-safari'`.
  - `min(128)` when `deviceMemoryGB != null && deviceMemoryGB <= 4`.
  - Apply penalty `÷ 2` on `previousResourceFailure`, `÷ 4` on `previousInterrupted`.
  - Final `clamp(64, 2048)`.
- **Concurrency**:
  - Cap `cMax = pthread ? min(hwConcurrency - 1, 3) : 1`.
  - Override `cMax = 1` when `webKitClass ∈ {'webkit-mobile', 'webkit-desktop-safari'}`.
  - Pick `concurrency = clamp(fidelityWeight, 1, cMax)`, where `fidelityWeight = { safe: 1, balanced: 2, max: 3 }`.
  - Return `maxConcurrency: cMax` separately for the retry path.
- **Worker memory profile**: same rule as `deriveInteractivePolicy` (`'desktop'` only when `coi && pthread && webKitClass !== 'webkit-mobile'`).
- **Persist cadence (always on)**:
  - `persistEveryNRows = clamp(round(2048 / rowSlice) * rowSlice, rowSlice, 4096)`.
  - At `rowSlice=64` this flushes ~every 2048 rows. At `rowSlice=1024` it flushes ~every 4096 rows. The desktop path therefore retains checkpoint recoverability at near-zero IO cost.
- **Output sink**:
  - `'opfs-file'` when `opfsSinkAvailable && opfsQuotaMB != null && opfsQuotaMB > megapixels * 4`. The `4 MB/MP` factor is a conservative upper bound for a high-quality JPEG plus the writer's working buffer; calibration of this constant is part of the Phase 2 telemetry follow-up.
  - Else `'streaming'` when `streamingSinkAvailable`.
  - Else `'blob-handoff'`.
- **Product copy**: re-derived from the policy, not from a profile name:
  - `'cannot-safely-complete'` when image is large (> 50 MP), sink fell through to `'blob-handoff'`, and `webKitClass === 'webkit-mobile'`.
  - `'interrupted-retry'` when `previousInterrupted`.
  - `'resource-retry'` when `previousResourceFailure`.
  - `'non-durable-checkpoint'` when sink is `'blob-handoff'` and image is large.
  - `'high-performance'` when `workerMemoryProfile === 'desktop' && concurrency >= 2 && rowSlice >= 512`.
  - `'safe-export'` otherwise.
  - Note: `'interrupted-source-needed'` is **not** derived here. It is set by the export orchestration when a checkpoint exists but the source `File` is no longer in memory (the user reloaded the page and must reselect the same RAW). It remains a session-state outcome, not a capability outcome, and lives in `src/modules/raw-processor/services/`.
- **Derived label** (telemetry only, never branched on): `${workerMemoryProfile}-thr${concurrency}-${outputSink}` — e.g. `"low-memory-thr1-opfs-file"`. Stable across sessions, easy to group in logs.

**Verification.**

- Property test: for ten thousand random vectors and inputs, assert invariants: `rowSlice ∈ [64, 2048]`, `concurrency ≥ 1`, `persistEveryNRows ≥ rowSlice`, `persistEveryNRows ≤ 4096`, `workerMemoryProfile === 'low-memory' || (coi && pthread && webKitClass !== 'webkit-mobile')`.
- Snapshot tests for ten representative cases (iPhone Safari + 24 MP, Pixel Chrome + 60 MP, M1 Safari desktop + 100 MP, Chromium Linux + 60 MP + previous-resource-failure, etc.) so changes to the derive math show up as reviewable diffs.

## Section 3 · Worker Bridges

**Principle.** Each heavy worker is owned by a bridge instance that serializes calls, propagates `AbortSignal` end-to-end, and auto-terminates on idle. Lifecycle is mechanical, not procedural. Squoosh's `worker-bridge/index.ts` is the working precedent; LumaForge reuses its shape.

**Contract on each bridge.**

- Internal state: `_queue: Promise<unknown>`, `_worker?: Worker`, `_workerApi?: Wrapped`, `_idleTimer?: number`.
- Each public method:
  1. Takes an `AbortSignal` as its first argument.
  2. Chains itself on `_queue`.
  3. Throws `AbortError` synchronously if the signal is already aborted.
  4. Lazy-starts the worker if `_worker` is undefined; clears any pending idle timer.
  5. Registers an `abort` listener that calls `_terminateWorker()` (worker.terminate is the cancel — there is no cooperative cancel).
  6. After the wrapped call settles (success or failure), removes the abort listener and starts a new `_idleTimer` to terminate the worker after `IDLE_MS`.
- `IDLE_MS` is configurable per bridge. Default `10_000` (squoosh's value). Both bridges adopt this default unless measurement says otherwise.
- The bridge does not expose `_worker` or `_workerApi` directly. Consumers go through the typed method surface only.

**Two bridges in scope.**

1. `RawDecodeBridge` wrapping the RAW runtime worker. Replaces the singleton + ad-hoc lifecycle in `src/lib/raw/luma-runtime-adapter.ts`. Methods: `prewarm`, `decodeEmbedded`, `decodeQuick`, `decodeBoundedHq`, `decodeForExport`. Each takes an `AbortSignal`.
2. `ExportBridge` wrapping `full-res-export.worker.ts`. Replaces the lifecycle code currently scattered across `full-res-export-client.ts` and the `export-system` orchestration. Methods: `runExport`, `cancelExport`.

**What this lets us delete.**

- `releasePreviewPipelineBeforeExport`, `releaseBoundedHqBufferBeforeExport`, `releasePreviousExportResultBeforeExport` — three booleans in every profile, all `true`. When `ExportBridge.runExport` starts, the *separate* `RawDecodeBridge` instance is idle and its 10-second timer will reclaim it; for the cases where we cannot wait, `runExport` can call `RawDecodeBridge.terminate()` directly. No profile flag needed.
- `restartWorkerOnResourceRetry` — the bridge already terminates the worker on abort, and a subsequent call lazy-starts a fresh one. Restart-on-retry is the default behaviour.

**Boundary discipline.**

- `LutParsing`, `GlPaint`, and per-frame preview math do **not** get bridges. They are not Worker-bound or they are short-lived enough that bridge ceremony is overhead. The bridge pattern applies only to crossings of (a) a Worker boundary AND (b) heavy work (wasm/large buffers).
- `prewarm` on the RAW bridge remains UI-silent per the predecessor spec. It cancels its own idle timer (so the warm worker survives long enough for the user to commit) and resolves with the existing structured outcome `{ status: 'ready' | 'failed', ... }`.

**Verification.**

- Unit tests using a stubbed `Worker` global: assert that two parallel `decode(...)` calls execute serially; assert that `abortSignal.abort()` calls `worker.terminate()` and clears the bridge state; assert that idling for `IDLE_MS` triggers terminate; assert that a new call after idle-terminate spawns a fresh worker.
- Integration test: full export + new export cancel-and-restart on the same bridge; assert no leaked workers (worker count returns to zero after `IDLE_MS`).

## Section 4 · Checkpoint Store Compatibility

**Constraint.** `src/lib/export/checkpoint-store.ts:33` persists a `profile: ExportExecutionProfileName` field. The store is durable across sessions; a hard schema break would invalidate in-progress checkpoints on rollout.

**Decision.** Keep the field, change its semantics.

- The persisted record gains a new field `derivedLabel: string` written from the policy.
- The old `profile` field is retained for read compatibility. New writes set it to a deterministic mapping of the policy: `workerMemoryProfile === 'desktop' && concurrency >= 2 && rowSlice >= 512 ? 'desktop-fast' : workerMemoryProfile === 'low-memory' && webKitClass === 'webkit-mobile' ? 'ios-safe' : 'mobile-balanced'`. This keeps the field's type valid without anchoring the decision back to a name.
- Readers prefer `derivedLabel` when present, fall back to `profile` when reading a Phase 1–era record.
- After all three phases ship and a deprecation window passes, `profile` may be dropped in a future migration. Not in scope for this spec.

**Verification.**

- Round-trip test: write a Phase 2 record, read with a Phase 2 reader, assert `derivedLabel` is the source of truth and `profile` is informational.
- Backward-read test: write a record with only the legacy `profile` field, read with the new reader, assert the reader synthesizes a usable policy from the legacy mapping.

## Section 5 · Telemetry and i18n

**Telemetry.**

- `export-plan-selected` debug event keeps the same dispatch path. The payload gains `derivedLabel: string` and `policyVector: ExportPolicy` (the full policy struct, redacted of `productCopy` which is duplicated).
- The legacy `profile: ExportExecutionProfileName` field is retained in the payload until Phase 3 ships, with the same mapping as the checkpoint store.
- `runtimeMemoryProfile` in the payload now reflects `workerMemoryProfile` from the policy.

**i18n.**

- `raw.export.lowMemory` (the existing low-memory note) is retained.
- New keys: `raw.export.highPerformance`, `raw.export.derivedLabelHint` (used in the developer-facing debug panel only). Both English and zh-CN catalogs in `src/locales/`.
- `getExportModeCopy(...)` continues to map `productCopy` enum values to human strings; the enum stays stable. Only the *derivation* of which enum value is chosen changes.

## Section 6 · Phasing

Each phase is a single PR (or a tight stack), ships independently, and is revertable via `git revert`.

### Phase 1 · Bridge refactor (behaviour-equivalent)

- Introduce `RawDecodeBridge` and `ExportBridge` per §3.
- Migrate `src/lib/raw/luma-runtime-adapter.ts` to use `RawDecodeBridge`.
- Migrate `full-res-export-client.ts` and the export-system orchestration to use `ExportBridge`.
- Preserve the existing pre-export memory-peak shape: `ExportBridge.runExport`'s first step is `await rawDecodeBridge.terminate()` (synchronous reclamation, not lazy idle wait). This keeps Phase 1 behaviour-equivalent — the bridge's idle timer alone would leave a 10-second window during which both workers could coexist in memory.
- Delete the three `release...BeforeExport` boolean fields from the export profile table; delete the call sites that read them.
- `restartWorkerOnResourceRetry` becomes implicit (bridge terminates on retry). Keep the named field for one release cycle to ease review, default it to `true` everywhere, then delete in Phase 3.
- **No policy / decision changes in this phase.** All three named profiles still exist and still produce the same numbers (minus the deleted lifecycle flags). The expected behavioural delta is "tighter cleanup; no observable visual change."

### Phase 2 · Capability vector and derived policies

- Add `src/lib/runtime/capability-vector.ts`.
- Add `src/lib/runtime/interactive-policy.ts` and `src/lib/runtime/export-policy.ts`.
- Replace `chooseProfile` / `selectExportExecutionPlan` internals: keep the *function signature* (still returns an `ExportExecutionPlan`-shaped object), but compute via `deriveExportPolicy`.
- Update `src/lib/raw/luma-runtime-adapter.ts` to consult `deriveInteractivePolicy` instead of hard-coding `requireCrossOriginIsolation: true`.
- Always-on checkpoint: `checkpointOutput: true` for every derived plan; persist cadence from §2.2.
- Always-on retry restart: bridge handles it; the `restartWorkerOnResourceRetry` field becomes a no-op that always reads `true`.
- The named profile labels (`'ios-safe'` etc.) survive in the persisted `profile` field per §4 and in the telemetry payload alongside `derivedLabel`.

### Phase 3 · Cleanup

- Delete `lowMemoryAvailable` from the chooser interface and the two call sites.
- Delete the `EXPORT_EXECUTION_PROFILES` table (the const object). Profile-name `string` literals survive only inside the checkpoint legacy reader and the telemetry legacy field.
- Delete `restartWorkerOnResourceRetry` field from the plan type.
- Replace `boundedHqMaxPixels` field in the plan type with a reference to `deriveInteractivePolicy(cap).boundedHqMaxPixels` at every call site.
- Update tests that asserted on named profiles to assert on derived labels or policy vectors.

## Section 7 · Cost & Benefit

**Cost (point estimates; ranges in parentheses are pessimistic).**

| Item | Estimate |
|---|---|
| Files touched (direct grep) | 18 (existing references to named profile literals) + 5 new files |
| Net code delta | +150 lines new derive logic, −250 lines deleted profile / lifecycle flags / dead params ≈ **−100 LOC** |
| Worker code changes | Zero (the worker still reads `workerMemoryProfile` and `rowSlice` from its message payload) |
| Checkpoint-store schema | Additive (new `derivedLabel` field); old `profile` field retained for read |
| Test rewrite | Property test (new), ~10 snapshot tests (new), removal of named-profile fixtures across `execution-profile.test.ts` and a handful of `export-system` tests |
| i18n | 2 new keys per locale; no existing key removed in scope |
| Engineering days | **3–4** implementation, **1–2** browser-matrix verification (Chrome/Chromium, Firefox, Safari mac, Safari iOS, Edge). Total **4–6 days**, pessimistic **8 days** |

**Benefit.**

- Decision surface collapses from `platform(3) × profile(3) × fidelity(3) = 27` named combinations to a continuous policy over a six-field vector. The chooser's nested `if` chain disappears.
- Two long-standing principle violations are fixed:
  - Desktop fast path retains checkpoint recoverability (always-on checkpoint with derived flush cadence — measured overhead trends toward zero as row slice grows).
  - Preview runtime respects platform (`webkit-mobile` no longer forced into `'desktop'` memory profile).
- The lying capability flag `lowMemoryAvailable` is deleted.
- Worker lifecycle becomes mechanical (idle-terminate) instead of procedural (`release...BeforeExport` flags). Three boolean fields, multiple call sites, vanish.
- Telemetry gains the *vector* alongside the label, making post-hoc analysis tractable without losing the ability to filter by a stable label string.

**Explicit non-goals.**

- No SSR-time capability detection. The current `/raw` shell is client-only.
- No "throttle preview when battery low" or similar dynamic re-detection — the vector is captured once.
- No legacy feature flag. The user explicitly declined `LUMAFORGE_FORCE_DESKTOP_FAST_LEGACY`. Rollback is `git revert`.

## Section 8 · Risks and Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| First-version derive thresholds (e.g. row slice baseline `512`) are wrong on real hardware | Medium | Phase 2 ships behind the existing per-event telemetry; collect `policyVector` for two weeks, calibrate constants in a follow-up Phase 2.1. |
| `navigator.deviceMemory` returns `undefined` on Safari — derive math falls through to `null` branches | Certain | Already handled by null-tolerant clauses; `webKitClass` covers the Safari ceiling separately. |
| OPFS quota estimate races with first export on cold boot | Low | `getCapabilityVector()` is awaited at app boot before `/raw` mount; export path always uses the resolved vector. |
| Phase 1 bridge refactor introduces a regression that only surfaces under retry | Medium | Phase 1 keeps the existing chooser numbers; add an explicit integration test for "decode + cancel + new decode" and "export + cancel + new export." |
| Property tests over-constrain and reject legitimate derive math changes | Low | Property invariants are weak (bounds + monotonic, not exact values); snapshot tests catch intentional changes via reviewable diffs. |
| Checkpoint-store legacy reader synthesizes a wrong policy from a stale `profile` field | Medium | The legacy mapping is conservative (synthesizes a `'low-memory'` posture on ambiguity); a Phase 2 unit test pins it. |

## Section 9 · Appendix · Affected Files Inventory

Direct references to named profile literals (`'ios-safe' | 'mobile-balanced' | 'desktop-fast'`) or to `ExportExecutionProfileName` — 18 files:

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

New files introduced by this spec:

```
src/lib/runtime/capability-vector.ts
src/lib/runtime/interactive-policy.ts
src/lib/runtime/export-policy.ts
src/lib/workers/raw-decode-bridge.ts
src/lib/workers/export-bridge.ts
```

(Bridge file locations are illustrative; the plan PR may choose a different path under `src/lib/`.)
