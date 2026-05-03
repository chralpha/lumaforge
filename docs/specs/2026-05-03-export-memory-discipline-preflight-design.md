# Export memory discipline preflight design

Date: 2026-05-03

Related documents:

- [`2026-04-25-high-resolution-browser-export-design.md`](./2026-04-25-high-resolution-browser-export-design.md)
- [`2026-04-27-export-performance-optimization-design.md`](./2026-04-27-export-performance-optimization-design.md)
- [`2026-05-01-ios-safari-100mp-export-compatibility-design.md`](./2026-05-01-ios-safari-100mp-export-compatibility-design.md)
- [`2026-05-02-preview-histogram-design.md`](./2026-05-02-preview-histogram-design.md)

## Goal

Make full-resolution export begin, retry, and finish from a provably bounded
live-resource state before doing deeper throughput work.

This pass focuses on repo-verifiable memory discipline for 100MP-class exports:

```text
before export:
  account for heavy preview/export resources and evacuate the ones the selected
  execution profile does not need

during export:
  keep one heavy export attempt active, and recreate workers after
  resource-looking failures when the profile requires it

after export:
  keep file-backed output lazy, materialize Blob/File objects only for explicit
  user actions, and clean up temporary handles
```

The acceptance gate is automated evidence in the repo: focused unit tests plus
Playwright preflight/debug events. Real iPhone/iPad 100MP validation remains a
separate production-support gate.

## Current state

The current LumaForge export path already has the right high-level shape:

```text
RAW File
-> @lumaforge/luma-raw-runtime
-> libraw-processed-window strips
-> row-bounded CPU color graph
-> @lumaforge/luma-jpeg-runtime scanline writer
-> Blob-backed or file-backed JPEG result
-> Download / Share / Copy action
```

Existing protections include:

- `ios-safe`, `mobile-balanced`, and `desktop-fast` execution profiles;
- low-memory RAW runtime selection for safe profiles;
- resource failure retry with reduced rows/concurrency;
- OPFS safe-retry checkpoint manifests;
- pre-export evacuation hooks for preview, bounded-HQ, WebGL, LUT fetch, and
  previous export result owners;
- file-backed export result references and lazy action materialization;
- debug events for plan selection, evacuation, and checkpoint writes.

The remaining risk is not that export lacks strips. The risk is that large
resources can overlap around strip export:

- preview or bounded-HQ work may still be settling when export starts;
- a WebGL pipeline or embedded preview object URL may remain live even when the
  low-memory export profile does not need it;
- stale ready export results can hold Blob or file-backed handles;
- resource retry can look correct at the API level but accidentally reuse a
  dirty worker/runtime state;
- file-backed outputs can regress into eager Blob/File materialization at
  completion time;
- debug events may not expose enough evidence to verify the intended discipline.

## Non-goals

- Do not change LUT contracts, color graph semantics, output transfer, or JPEG
  color intent.
- Do not reduce full-resolution export dimensions.
- Do not introduce Canvas, ImageData, GPU readback, or preview-size rendering as
  the authoritative full-resolution export source.
- Do not add server upload, cloud export, a native helper, or a local daemon.
- Do not implement RAW processed-window throughput optimization, libjpeg-turbo
  throughput work, or broader pipeline parallelism in this pass.
- Do not require real iOS device validation as this pass's done gate.
- Do not make desktop-fast inherit every ios-safe evacuation cost.

## Design principles

1. Prove the page is in the expected state before starting export.

   Low-memory profiles should not start the full-resolution worker unless the
   required preview/export resource owners have been disposed or explicitly
   marked outside the profile's evacuation scope.

2. Keep only one heavy operation active.

   Export start should abort or dispose preview/HQ work that competes with the
   RAW and JPEG runtimes. Resource failure retry should use a fresh worker when
   the profile says the previous attempt may have polluted memory state.

3. Materialize results only at the edge.

   A file-backed JPEG result should remain a reference during export completion.
   Download, Share, and Copy can open a Blob/File for that user action, then
   clean temporary object URLs or probe objects promptly.

4. Preserve desktop throughput choices.

   Desktop-fast keeps lighter evacuation defaults and may keep in-place retry
   where the execution plan explicitly allows it. Mobile and ios-safe profiles
   prefer completion over speed.

5. Make discipline observable.

   Tests and browser preflight should assert selected profile, owners evacuated,
   remaining live resources, worker attempt count, output sink, checkpoint
   durability, and result materialization timing.

## Architecture

This is an additive hardening layer over the existing export system.

`useRawProcessor` remains the user-flow orchestrator. It resolves the current
graph, creates a pre-export snapshot, selects an execution plan, requests
resource evacuation, starts the worker export, and records the ready result.

`resource-registry` remains the resource ledger. It should account for all
large live owners relevant to export:

- `preview`
- `bounded-hq`
- `webgl`
- `export-result`
- `export-worker`
- `lut-fetch`

`export-evacuation` owns the low-memory preflight protocol:

```text
createPreExportSnapshot(...)
-> dispose profile-required owners
-> assert zero-live for required owners
-> return snapshot, registry check, and diagnostics
```

`export-system` owns retry orchestration. It should create a new
`FullResolutionExportWorkerClient` for every attempt when
`restartWorkerOnResourceRetry` is true, reduce rows/concurrency after resource
failures, and dispose each client exactly once.

`full-res-export-client` and `full-res-export.worker` own worker lifecycle
evidence. They should expose enough metrics/debug detail to prove cancellation,
failure, and retry did not leave a stale worker active.

`ExportOutputResult` keeps the result boundary:

```text
completion:
  BlobOutputResult or FileBackedOutputResult reference

Download / Share / Copy:
  materialize Blob/File only inside the action
  revoke action object URLs promptly
```

## Export start flow

The export start path should run in this order:

1. Resolve a supported export color graph from current RAW render exposure,
   tone, style, and LUT state.
2. Select the execution plan from fidelity, source dimensions, interrupted
   checkpoint state, platform, runtime availability, and output sink
   availability.
3. Build a pre-export snapshot with:
   - source `File`
   - metadata
   - graph and graph fingerprint
   - LUT title when relevant
   - quick-preview readiness
   - tone and style state
4. If the selected profile requires preview release, register the current WebGL
   pipeline and other live owners before evacuation.
5. Evacuate the profile-required owners:
   - abort active preview work;
   - abort pending bounded-HQ work;
   - dispose the preview WebGL pipeline when required;
   - revoke embedded preview object URLs when required;
   - dispose stale export-result resources;
   - stop LUT fetches that are not needed for the resolved snapshot.
6. Assert zero-live resources for the owners required by the selected profile.
7. Emit a `resource-evacuated` debug event with profile, required owners, live
   resources, and estimated bytes.
8. Start full-resolution export only after the evacuation check passes.

If the zero-live check fails for a required owner, export fails before worker
start with `EXPORT_RESOURCE_EVICTION_INCOMPLETE`.

## Worker and retry flow

The retry policy is profile-owned.

For `ios-safe` and `mobile-balanced`:

```text
resource-looking failure
-> abort current attempt
-> dispose current FullResolutionExportWorkerClient
-> reduce rows and set concurrency to 1
-> create a fresh worker client
-> retry until the configured attempt cap is reached
```

For `desktop-fast`:

```text
normal resource retry
-> allow the existing in-process retry policy when selected by the plan

worker failure or explicit fresh-worker requirement
-> recreate the worker client before retry
```

Each attempt should be observable:

- attempt index;
- profile name;
- preferred rows;
- concurrency;
- retry reason;
- whether the worker client was freshly created;
- whether the prior client was disposed.

Cancellation, session replacement, and render graph invalidation should abort
the active attempt and prevent stale completion from writing a ready result.

## Output materialization flow

Completion should not eagerly turn a file-backed result into a large Blob or
File. The ready state stores an `ExportResult` with an `ExportOutputResult`.

Action behavior:

- Download opens the Blob only for the download action and revokes the object
  URL after the click handoff.
- Share probes support with the lightest valid probe object available, then
  creates the full File only inside the user activation path.
- Copy materializes full-resolution output only when clipboard support allows
  it. Otherwise it uses the existing preview-size copy fallback without marking
  it as full-resolution.

Action failures should be scoped to the action. A failed Download, Share, or
Copy does not invalidate the ready result unless cleanup proves the underlying
file-backed output is gone.

## Diagnostics

Extend existing `lumaforge-export-debug` events instead of adding a new
observability surface.

`export-plan-selected` should include:

- profile name;
- preferred rows;
- concurrency;
- runtime memory profile;
- output sink;
- checkpoint mode;
- checkpoint durability expectation.

`resource-evacuated` should include:

- profile name;
- required owner list;
- disposed owner list;
- registry check result;
- remaining live resources with owner, kind, and id;
- estimated bytes by owner when available.

`checkpoint-written` should keep:

- export id;
- completed rows for diagnostics;
- total rows;
- timestamp.

Add an export attempt debug payload either as a new event type or as part of
worker metrics:

- attempt index;
- retry reason;
- previous rows and next rows;
- previous concurrency and next concurrency;
- fresh worker created;
- prior client disposed.

Add output materialization diagnostics for tests:

- output kind at completion;
- whether file-backed output was opened during completion;
- action that materialized the output;
- cleanup result.

These diagnostics are for test and development evidence. They should not become
verbose user-facing copy.

## Error handling

The pass keeps fail-closed behavior.

- Unsupported RAW facts still fail before export.
- Unsupported color graphs and LUT contracts still fail before export.
- Required evacuation failure fails before worker start.
- OPFS/checkpoint unavailability keeps the existing non-durable safe-mode
  behavior and must not use misleading resume language.
- Worker resource failure follows the selected retry policy.
- Worker cancellation, route reset, file replacement, or graph invalidation
  must leave the session without a stale ready export result.
- Output action failures stay action-local unless the result reference cannot
  be reopened or cleanup removed it.

## Testing and acceptance

This pass is accepted by repo-verifiable evidence.

Unit tests:

- `resource-registry` covers owner accounting, duplicate protection, disposal,
  and zero-live assertions.
- `export-evacuation` covers ordering, required owner sets, snapshots, and
  failure before worker start.
- `useRawProcessor` covers export start clearing stale result, aborting preview
  and bounded-HQ work, disposing preview pipeline, and suppressing stale
  completions after reset or graph changes.
- `export-system` and `full-res-export-client` cover fresh worker retry,
  reduced rows/concurrency, attempt count, and exactly-once client disposal.
- output-result action tests cover lazy file-backed materialization for
  Download, Share, and Copy.

Browser preflight:

- Extend `tests/browser/raw-ios-safe-export.spec.ts` to assert plan selection,
  evacuation debug payloads, checkpoint or non-durable mode, and desktop-fast
  preservation.
- The browser preflight may use local fixture skips when the 100MP private RAF
  is unavailable, but the debug-event contract should still be testable.

Acceptance criteria:

- `ios-safe` and `mobile-balanced` exports start only after required resource
  owners are evacuated or fail before the full-resolution worker starts.
- `desktop-fast` keeps throughput-oriented defaults unless a resource failure
  triggers downgrade.
- Resource-looking failures for safe profiles retry through a fresh worker.
- File-backed results are not materialized into Blob/File during export
  completion.
- No full-resolution path uses Canvas, ImageData, GPU readback, or preview-size
  output as the authoritative source.
- The final handoff explicitly states that real iOS 100MP validation remains a
  separate evidence gate.

## Rollout

1. Add or tighten diagnostics without changing export behavior.
2. Harden resource registry coverage for all owners needed by low-memory
   export.
3. Make pre-export evacuation fail before worker start when required owners
   remain live.
4. Prove fresh-worker retry and exactly-once disposal in tests.
5. Prove lazy file-backed result materialization in action tests.
6. Extend Playwright preflight to assert debug event payloads and desktop-fast
   preservation.
7. Update the implementation plan with the exact file list and targeted
   verification commands.

## Open follow-up gates

Real-device production support still needs:

- iPhone Safari 100MP export with screen on;
- iPhone Safari reload/interruption after checkpoint;
- iPad Safari 100MP export;
- desktop Safari preservation run;
- before/after memory observations where the browser exposes them.

These are intentionally outside this repo-verifiable preflight pass.
