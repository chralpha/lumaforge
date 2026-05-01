# iOS Safari 100MP export compatibility design

Date: 2026-05-01

Related documents:

- [`2026-04-25-high-resolution-browser-export-design.md`](./2026-04-25-high-resolution-browser-export-design.md)
- [`2026-04-26-full-resolution-raw-compatibility-design.md`](./2026-04-26-full-resolution-raw-compatibility-design.md)
- [`2026-04-27-export-performance-optimization-design.md`](./2026-04-27-export-performance-optimization-design.md)
- [`2026-04-22-phase1-test-matrix.md`](./2026-04-22-phase1-test-matrix.md)

## Goal

Make 100MP-class full-resolution JPEG export survivable on iOS Safari without
forcing every other platform into the same low-throughput mode.

The compatibility target is:

```text
iOS Safari:
  prefer safe completion and interruption-safe retry over throughput

Android / lower-memory desktop:
  use moderate strips and limited concurrency

desktop Chrome / Edge / Safari:
  preserve the existing faster strip and concurrency profile when telemetry says
  it is safe
```

The design keeps the current product promise: LumaForge exports locally in the
browser, does not upload the RAW file, does not silently lower full-resolution
output dimensions, and does not use the preview canvas as the authoritative
export source.

## Current state

The current export architecture already has the right core shape:

```text
RAW File
-> @lumaforge/luma-raw-runtime session
-> libraw-processed-window strips
-> CPU scene-referred color graph
-> ordered JPEG row writer
-> compressed JPEG bytes
-> final image/jpeg Blob/download handoff
```

Existing protections include:

- full-resolution export runs in a dedicated worker;
- the export path avoids full-image RGB, Canvas, ImageData, and full-size GPU
  surfaces;
- `safe`, `balanced`, and `max` fidelity levels map to progressively larger
  preferred strip rows and concurrency;
- `runFullResolutionJpegExport()` reduces strip rows and concurrency after
  resource-looking failures;
- row-band processing avoids a full-strip Float32 allocation for the color
  graph;
- unsupported RAW facts and unsupported LUT contracts fail closed.

The current compatibility gaps are:

- iOS Safari may terminate the WebContent process without a catchable JavaScript
  exception, so retry-in-place is not enough;
- the current `safe` profile still starts at `256` rows, while the default UI
  export path starts at `balanced`;
- the RAW runtime is currently built around a pthread/SAB path and requires
  cross-origin isolation;
- a resource failure retry keeps running in the same page/runtime high-water
  context unless the caller recreates the worker;
- the product does not persist export attempt state, so a tab reload loses the
  reason for interruption and cannot automatically switch to a safer retry path;
- completed JPEG rows are not reusable unless the encoder exposes durable
  row-resume state; the MVP checkpoint is interruption detection plus safe
  retry, not true mid-image resume;
- the final `image/jpeg Blob` handoff can still become a compressed-output
  memory peak if it is used as the authoritative sink during export;
- before export, the page can still hold large preview, WebGL, export result, or
  in-flight decode resources that are not required to write the full-resolution
  JPEG.

## Non-goals

- Do not add server upload, cloud export, a native helper, or a local daemon.
- Do not make WebGPU, Canvas, ImageData, or GPU readback the authoritative
  full-resolution export path.
- Do not silently downscale the output and keep the full-resolution label.
- Do not make iOS Safari as fast as desktop browsers in this pass.
- Do not broaden RAW format compatibility beyond the existing
  `libraw-processed-window` contract in this spec.
- Do not change the LUT contract model or output color intent.
- Do not keep OPFS output forever; checkpoint state must have explicit cleanup.

## Design principles

1. Treat browser memory signals as advisory.

   `navigator.deviceMemory`, `performance.memory`, WebAssembly grow failures,
   and worker failures can guide profile choice, but they cannot prove that a
   100MP export is safe. iOS can reload the page before LumaForge sees a normal
   error. The design must therefore avoid probing to the edge and must recover
   after reload.

2. Free memory before exporting, not after failure.

   Export should begin from a deliberate low-live-memory state. Large preview
   and previous-result resources compete with RAW/JPEG Wasm heaps and strip
   buffers, especially on iOS Safari.

3. Use bounded profiles, not aggressive peak search.

   Tile or strip size should move among a few safe bands. Do not run
   `64 -> 128 -> 256 -> 512 -> ... until failure` on mobile Safari.

4. Prefer worker recreation over same-heap retry after resource pressure.

   WebAssembly memory is effectively grow-only for this product. If the export
   worker or native runtime has grown close to a resource boundary, a lower
   profile should start in a fresh worker/runtime context.

5. Preserve high-performance platforms.

   iOS-safe defaults must not replace desktop-fast defaults. Desktop users
   should keep larger strips and limited concurrency when measured headroom is
   available.

6. Use file-backed or streaming output before Blob handoff.

   In `ios-safe`, the authoritative JPEG sink must be OPFS or another bounded
   streaming/file-backed writer. A final `Blob` or object URL is only a download
   handoff after the export has completed and must be revoked promptly.

## Execution profiles

Add an explicit export execution profile layer. It may be selected from platform
signals, user preference, previous crash recovery state, and resource telemetry.

```ts
type ExportExecutionProfileName =
  | 'ios-safe'
  | 'mobile-balanced'
  | 'desktop-fast'

type ExportExecutionProfile = {
  name: ExportExecutionProfileName
  preferredRows: number
  minRows: number
  maxRows: number
  rowBandRows: number
  initialConcurrency: number
  maxConcurrency: number
  boundedHqMaxPixels: number
  releasePreviewPipelineBeforeExport: boolean
  releaseBoundedHqBufferBeforeExport: boolean
  releasePreviousExportResultBeforeExport: boolean
  restartWorkerOnResourceRetry: boolean
  checkpointOutput: boolean
  checkpointMode: 'safe-retry' | 'row-resume'
  outputSink: 'opfs-file' | 'streaming' | 'blob-handoff'
}
```

Initial production profile values:

| Profile           | Default rows  | Range       | Concurrency | Bounded HQ policy | Output sink               | Retry policy                  |
| ----------------- | ------------- | ----------- | ----------- | ----------------- | ------------------------- | ----------------------------- |
| `ios-safe`        | `64` or `128` | `64-256`    | `1`         | `<=8MP` or skip   | OPFS/file-backed first    | restart worker, safe retry    |
| `mobile-balanced` | `128`/`256`   | `64-512`    | `1-2`       | `<=8MP`           | OPFS/streaming preferred  | restart after resource retry  |
| `desktop-fast`    | `512`/`1024`  | `256-2048+` | `2-3`       | current cap       | streaming or Blob handoff | in-place retry first, restart |

`ios-safe` row selection should consider image size:

```text
source >= 80MP:
  preferredRows = 64

source < 80MP:
  preferredRows = 128
```

`desktop-fast` may use `2048` rows or `4` concurrency only after benchmark
evidence shows better median time without higher failure rate or excessive peak
memory.

## Capability profile selection

Profile selection should be deterministic and explainable. Treat browser or
platform detection as one input into a capability profile, not as a Safari-only
UA branch.

Inputs:

- user agent platform family;
- touch/mobile signals;
- `navigator.hardwareConcurrency`, treated only as an upper bound;
- optional coarse memory signals when available;
- previous unfinished export manifest for the same source fingerprint;
- previous in-session resource failure;
- runtime availability, including whether the low-memory RAW runtime can load;
- output sink availability, including OPFS and streaming writer support;
- user-selected export fidelity.

Recommended selection:

```text
previous export interrupted by reload:
  ios-safe regardless of platform for the retry attempt

known-risk iOS WebKit-like mobile environment:
  ios-safe, single worker, low-memory runtime

Android browser:
  mobile-balanced

runtime cannot provide pthread/SAB safely:
  low-memory runtime and no desktop-fast profile

low-memory smoke test cannot initialize:
  fail closed with actionable copy before starting full export

desktop Safari:
  desktop-fast, but cap maxConcurrency lower until Safari evidence exists

desktop Chrome / Edge:
  desktop-fast

previous resource failure in current session:
  next lower profile and fresh worker/runtime
```

User-facing fidelity remains product language. Internally it maps into a profile:

```text
Safe:
  ios-safe on iOS, mobile-safe shape elsewhere

Balanced:
  mobile-balanced or desktop-fast with moderate defaults

Max:
  desktop-fast only when the current platform is not iOS-safe
```

On iOS Safari, `Max` should either be hidden or treated as `Safe` with explicit
copy: "Safari memory limits require low-memory export mode on this device."

## Pre-export resource evacuation

Before the full-resolution worker starts, the UI must create an export snapshot
and release large resources that are not required for the authoritative export.

Keep these lightweight state fields:

- original `File` reference for the current JS session only;
- source fingerprint and file facts;
- metadata and full-resolution capability result;
- current LUT contract and parsed LUT payload reference needed to build the
  export graph;
- tone params, style params, intensity, and RAW render exposure;
- quick-preview readiness and display-source status;
- export profile and quality selection;
- cancellation intent.

The current-session `File` reference is not durable across an iOS reload or
WebContent termination. Recovery after reload must reacquire the source through
a still-readable persisted file handle, a user reselecting the same RAW, or a
source copy that was intentionally stored in OPFS.

Release or stop these large resources:

- active RAW runtime session and worker used by preview;
- in-flight bounded HQ decode request;
- in-flight preview decode request;
- bounded HQ decoded RGB16 buffer;
- WebGL textures and `RawProcessingPipeline` preview resources;
- old full-resolution export `Blob` and object URLs;
- previous export worker after completion, cancellation, or resource failure;
- obsolete JPEG row writer or encoder session;
- stale online LUT fetch buffers once the parsed LUT contract/data is retained.

The evacuation flow:

```text
user clicks full-resolution export
-> freeze lightweight export snapshot
-> abort in-flight preview and bounded HQ work
-> dispose preview RAW session if export will open its own runtime session
-> dispose WebGL preview pipeline and textures
-> release bounded HQ decoded buffer
-> release previous export result Blob and object URLs
-> force UI into low-memory export view using lightweight preview state
-> start export worker with selected profile
```

The low-memory export view may show progress, filename, profile mode, and
cancel/retry controls. It must not require the live WebGL pipeline to keep
rendering while export is active.

After export finishes or fails, the app may rebuild preview resources from the
current-session `File` or a reacquired source and retained lightweight state.
Rehydration must be best-effort: failure to restore bounded HQ preview must not
invalidate the completed export or the quick-preview session state.

Evacuation acceptance must verify actions and object reachability, not promise a
specific browser memory number. Add a dev-only `ResourceRegistry` for large
owners during implementation. Each large resource should register an owner,
byte estimate when known, and dispose callback. The pre-export gate should
assert:

- all preview and bounded-HQ `AbortController`s are signaled;
- preview and export workers acknowledge disposal or are terminated;
- WebGL resources call `deleteTexture`, `deleteFramebuffer`, and `deleteBuffer`
  where applicable;
- old object URLs are revoked and old `Blob` references are nulled;
- no large `ArrayBuffer` remains reachable from app state after the export
  snapshot is created;
- debug registry counts show zero live preview-owned RAW sessions, WebGL
  pipelines, bounded-HQ buffers, and stale export results before the export
  worker starts.

## Worker and runtime lifecycle

The full-resolution export worker should own its RAW runtime and JPEG runtime
for exactly one export attempt.

Lifecycle:

```text
create export worker
-> init selected RAW runtime build
-> open RAW session from current or reacquired source
-> probe or validate cached capability against current runtime
-> begin processed-window export
-> process ordered strips
-> finish JPEG output
-> preserve metadata
-> close RAW/JPEG sessions
-> terminate worker
```

On resource-looking failure:

```text
resource failure
-> abort current writer
-> end processed-window export if possible
-> terminate worker
-> lower profile or rows
-> create fresh worker/runtime
-> retry from row 0 unless checkpoint explicitly supports row-resume
```

Do not rely on a large `WebAssembly.Memory.grow()` probe to choose the profile on
iOS. A small smoke probe may confirm the low-memory build initializes, but the
real safety check is the first bounded export strips plus checkpoint recovery.

## Runtime build strategy

The current pthread RAW runtime remains appropriate for desktop-fast paths, but
iOS-safe needs a lower-memory runtime option.

Required build variants:

```text
raw-runtime low-memory:
  pthread: false unless measured iOS hardware data proves safety
  SharedArrayBuffer required: false
  INITIAL_HEAP <= 64MB, or a measured value justified by tests
  MAXIMUM_MEMORY <= 1024-1368MB
  MEMORY_GROWTH_LINEAR_STEP = 16MB or similarly small fixed step
  ABORTING_MALLOC = 0
  malloc/new/native arena failures return typed resource errors

raw-runtime desktop:
  current pthread/SAB path
  larger initial heap
  desktop memory ceiling
  performance-oriented growth step
```

The app must select the runtime build before loading the native module. A failed
desktop build initialization may fall back to low-memory only if the source and
selected pipeline remain supported and the user-facing mode changes to safe
export. It must not silently continue under the "fast" label.

The low-memory runtime is an acceptance requirement for `ios-safe`, not an
optional optimization. If the current pthread/SAB build is used on iOS during
development, the implementation is still preflight-only until real device data
proves it is stable under the `ios-safe` resource budget.

JPEG runtime should also expose availability and heap/error telemetry, but the
first compatibility risk is RAW runtime memory. JPEG remains row-oriented and
ordered.

## Output checkpoint and recovery

iOS Safari can terminate the page before any catch block runs. Real graceful
failure therefore requires durable attempt state outside the current JS heap.

Checkpoint semantics are explicit:

```text
MVP:
  crash/interruption detection + safe retry from row 0

Later:
  true row resume only after the JPEG encoder exposes durable restart markers,
  chunk boundaries, or serializable encoder state
```

The UI and telemetry must use "retry" for the MVP. Do not use "resume" unless
`recoveryMode: 'row-resume'` is backed by a proven encoder capability.

Use OPFS as the preferred checkpoint store when available:

```text
/.lumaforge-exports/
  active/<exportId>/manifest.json
  active/<exportId>/output.tmp
  active/<exportId>/chunks/
  complete/<exportId>/output.jpg
```

Manifest shape:

```ts
type ExportCheckpointManifest = {
  version: 1
  exportId: string
  sourceFingerprint: string
  fileName: string
  sourceSize: number
  sourceLastModified: number
  outputWidth: number
  outputHeight: number
  graphFingerprint: string
  profile: ExportExecutionProfileName
  attempt: number
  preferredRows: number
  totalRows: number
  recoveryMode: 'safe-retry' | 'row-resume'
  outputSink: 'opfs-file' | 'streaming' | 'blob-handoff'
  sourceReacquisition:
    | 'current-session-file'
    | 'persisted-file-handle'
    | 'user-reselect-required'
    | 'opfs-source-copy'
  completedRowsForDiagnostics: number
  nextRowForResume?: number
  jpegState: 'restart-required' | 'resumable'
  chunks?: Array<{
    index: number
    startRow: number
    rowCount: number
    byteLength: number
  }>
  updatedAt: string
}
```

For the first implementation, use:

```text
recoveryMode: 'safe-retry'
jpegState: 'restart-required'
completedRowsForDiagnostics: last flushed row count
nextRowForResume: omitted
chunks: omitted or diagnostics-only
```

This manifest detects that the browser interrupted a previous export and
selects safer settings for the next attempt. It does not imply that previously
encoded JPEG bytes are reusable.

Recovery behavior:

```text
app starts or RAW route opens
-> scan active checkpoint manifests
-> show "Previous export was interrupted by the browser"
-> try to reacquire the same source
   - if a persisted file handle is readable, verify fingerprint and retry
   - if an OPFS source copy exists, verify fingerprint and retry
   - otherwise ask the user to reselect the same RAW and verify fingerprint
-> retry with ios-safe profile from row 0 for MVP
-> only row-resume when recoveryMode is row-resume and encoder state validates
-> clean stale manifests after user dismisses or export completes
```

The fingerprint check should include size, `lastModified`, name, dimensions or
metadata facts, and a content hash prefix when available. Name/size matching
alone is not sufficient for an automatic retry after reload.

Source reacquisition options:

```text
current-session File:
  valid only until page reload or process termination

persisted FileSystemFileHandle:
  may be used if permission is still available or can be reacquired through user
  activation; do not assume silent access after reload

user reselect:
  default recovery path when no durable readable handle exists

OPFS source copy:
  strongest recovery path, but it duplicates RAW storage and must be explicit,
  quota-checked, and cleaned up with the export checkpoint
```

The default product copy for reselect should be:

```text
"The browser interrupted the previous export. Please reselect the same RAW file
so LumaForge can retry with a safer setting."
```

In `ios-safe`, the authoritative output sink is OPFS or another bounded
file-backed/streaming writer. The implementation must not accumulate the
complete JPEG as an in-memory `Blob` during export. A final `Blob` URL may be
created only after successful completion for browser download handoff, and must
be revoked immediately after handoff or user dismissal.

If OPFS is unavailable or quota is insufficient, LumaForge should still use the
safe profile and show a clear non-durable retry warning. If no file-backed or
streaming sink is available, the implementation may run a non-checkpointed safe
export only when it can avoid a full compressed-output memory spike; otherwise
it must fail closed with actionable copy.

## Telemetry and diagnostics

Telemetry must be local/debug-oriented unless product analytics are explicitly
added later.

Each export attempt should record JSONL-compatible metric rows:

- request/export id;
- source file name, size, dimensions, megapixels;
- browser family and user agent;
- selected profile, preferred rows, min/max rows, row-band rows;
- selected runtime build, checkpoint mode, output sink, and source
  reacquisition mode;
- concurrency, retry count, worker restart count;
- resource evacuation timings;
- count of released resources by type and `ResourceRegistry` live counts before
  worker start;
- object URL revoke count and previous export `Blob` release state;
- quick preview status and bounded HQ status before evacuation;
- RAW runtime build id and memory mode;
- JPEG runtime backend id;
- per-strip raw read, color graph, JPEG write, and total time;
- processed-window native timings when available;
- Wasm heap before/after/high-water when available;
- OPFS quota estimate and bytes written when available;
- checkpoint writes, manifest flush time, and recovery decision;
- final output bytes and decoded JPEG dimensions;
- outcome: success, unsupported-source, unsupported-pipeline,
  resource-failure, cancelled, interrupted-safe-retry,
  interrupted-row-resume, interrupted-source-missing, interrupted-unrecoverable.

Failure telemetry should preserve the stable error code. The UI can stay concise,
but the debug record must distinguish allocation failure, worker crash,
cross-origin isolation failure, JPEG runtime unavailable, OPFS quota failure, and
unsupported RAW/window facts.

## Product messaging

User-facing copy should stay short and actionable.

Mode copy:

```text
High-performance export:
  "Using high-performance full-resolution export."

Safe export:
  "This device is using low-memory export mode. Export may take longer."

Resource retry:
  "Export hit a browser memory limit. Retrying with a safer setting."

Interrupted recovery:
  "The browser interrupted the previous export. LumaForge will retry with a
  safer low-memory setting."

Interrupted recovery, source needed:
  "The browser interrupted the previous export. Please reselect the same RAW
  file so LumaForge can retry with a safer setting."

Non-durable checkpoint environment:
  "This browser cannot store export progress. Keep the tab open while the JPEG
  is being written."

Cannot safely complete:
  "This browser cannot safely complete a 100MP local full-resolution export.
  Try a desktop browser or export a smaller version."
```

The UI must not expose implementation terms such as OPFS, WebAssembly memory, or
LibRaw cropbox in normal user copy.

## Playwright WebKit validation

Add a real browser validation track that runs the same user flow in Playwright
WebKit before implementation is accepted.

This project does not currently depend on Playwright. The implementation plan
should add `@playwright/test` only if the repo accepts automated browser
validation as a maintained test dependency. Until then, the spec can be
validated through a temporary `pnpm dlx playwright` harness, but durable
acceptance should live in the repo.

Validation scenarios:

1. `ios-safe` profile selection
   - Launch Playwright WebKit with a mobile Safari-like viewport and user agent.
   - Open the production preview `/raw` route with cross-origin isolation
     headers.
   - Load a 100MP RAF fixture through the real file input or same-origin
     in-page `File` construction path.
   - Wait for quick preview readiness.
   - Apply a supported LUT contract and tone params.
   - Start full-resolution export.
   - Assert the selected profile is `ios-safe`, concurrency is `1`, and
     preferred rows are `64` or `128`.

2. Pre-export resource evacuation
   - Trigger bounded HQ decode before export.
   - Start export while bounded HQ is pending or complete.
   - Assert preview decode is aborted, bounded HQ buffers are released, old
     export results are cleared, and the WebGL preview pipeline is disposed.
   - Record evacuation time and resource counts.

3. Resource retry with fresh worker
   - Inject a deterministic resource failure after the first strip or first JPEG
     write.
   - Assert the current worker is terminated.
   - Assert the retry uses lower rows or lower profile in a fresh worker.
   - Assert output dimensions are unchanged.

4. OPFS checkpoint path
   - Enable checkpointing.
   - Start export and wait for at least one checkpoint flush.
   - Reload the page or simulate startup after interruption.
   - Assert the app detects the unfinished manifest and offers safe retry from
     row `0`.
   - If the source is no longer readable, assert the UI asks for the same RAW to
     be reselected before retry.
   - If a later encoder advertises `row-resume`, assert resume only after
     manifest and encoder state validation.
   - Record checkpoint bytes, manifest flush time, and recovery decision.

5. Successful desktop preservation
   - Run the same flow in Chromium with desktop profile.
   - Assert `desktop-fast` does not get forced to iOS row sizes or concurrency.
   - Compare summary metrics against the existing Chromium baseline.

Minimum metric output for each Playwright run:

```json
{
  "browser": "webkit",
  "profile": "ios-safe",
  "sourceMp": 101.99,
  "preferredRows": 64,
  "concurrency": 1,
  "checkpointMode": "safe-retry",
  "outputSink": "opfs-file",
  "sourceReacquisition": "current-session-file",
  "evacuationMs": 0,
  "workerRestarts": 0,
  "checkpointWrites": 0,
  "checkpointBytes": 0,
  "quickPreviewReady": true,
  "boundedHqReleased": true,
  "oldExportBlobReleased": true,
  "decodedWidth": 11662,
  "decodedHeight": 8746,
  "outcome": "success"
}
```

Playwright WebKit is not a substitute for a real iPhone Safari acceptance pass.
It is the preflight gate that catches profile selection, lifecycle, checkpoint,
and UI-state regressions before testing on hardware.

## Real-device acceptance matrix

Before claiming iOS Safari production support, run the same fixture family on
real hardware:

- iPhone low-RAM class: normal Safari browsing mode.
- Newer iPhone 6GB/8GB class: normal Safari browsing mode.
- iPad 8GB+ class: normal Safari browsing mode.
- Private Browsing or storage-disabled mode: verifies OPFS/source persistence
  fallback behavior and user copy.
- Low storage quota or near-full device: verifies OPFS quota failure behavior and
  fail-closed user copy.
- Background tab, screen lock, or app switch during export: verifies
  interruption detection and safe retry copy.
- Reload after first checkpoint: verifies row-0 retry and source reacquisition.
- Injected worker/native resource failure: verifies fresh-worker retry.
- Unsupported RAW and unsupported LUT contract: verifies fail-closed behavior is
  preserved under `ios-safe`.

## Acceptance criteria

Functional:

- iOS Safari-like runs select `ios-safe` before export starts.
- Export preflight verifies disposal actions for active preview runtime, bounded
  HQ buffers, WebGL textures, old export blobs, and in-flight preview decode
  work.
- `ResourceRegistry` debug counts show zero live preview-owned RAW sessions,
  WebGL pipelines, bounded-HQ buffers, and stale export results before the
  export worker starts.
- The retained lightweight snapshot is sufficient to start export in the current
  session and later rebuild preview state after source reacquisition.
- Full-resolution export never uses full-size Canvas, ImageData, WebGL texture,
  or full-image RGB/Float32 staging buffers.
- Resource-looking failures trigger lower rows/profile and a fresh worker
  restart before retry.
- Output dimensions are never reduced by compatibility fallback.
- Unsupported source and unsupported pipeline failures remain fail-closed.
- MVP OPFS checkpoint records enough state to detect an interrupted export and
  retry from row `0` with `ios-safe`.
- Product copy says "retry" unless the manifest and encoder state prove
  `row-resume`.
- Recovery after reload reacquires the source through a readable persisted
  handle, OPFS source copy, or user reselect plus fingerprint verification. A
  volatile `File` reference alone is not accepted as a reload recovery design.
- If checkpoint storage is unavailable, the UI shows non-durable safe-mode copy.
- In `ios-safe`, JPEG bytes are written to OPFS or another bounded
  file-backed/streaming sink during export. A complete `Blob` may exist only
  after successful completion for download handoff.
- Final object URLs are revoked and previous export `Blob` references are nulled
  before the next export attempt.

Performance and resource:

- iOS-safe starts at `64` or `128` rows for 100MP-class sources and concurrency
  `1`.
- Desktop-fast keeps at least the existing `512`/`1024` row path and concurrency
  above `1` when profile selection allows it.
- `ios-safe` uses a low-memory RAW runtime that is non-pthread/SAB-free unless
  measured iOS hardware data proves the threaded build safe.
- Low-memory RAW runtime build settings are accepted only with small initial
  heap, conservative maximum memory, fixed small linear growth step, non-aborting
  allocation behavior, and typed resource errors.
- Pre-export evacuation metrics are recorded in JSONL.
- Per-strip raw read, color, JPEG write, and checkpoint timings are recorded.
- Worker restart count, retry profile, output sink, checkpoint mode, and source
  reacquisition mode are recorded.
- Existing Chromium 61MP and 100MP performance rows are not regressed by
  iOS-safe defaults.

Validation:

- Targeted unit tests cover profile selection, resource evacuation ordering,
  retry decision, checkpoint manifest normalization, and product copy.
- Worker-level tests cover fresh-worker retry after resource failure.
- Playwright WebKit production-preview validation records JSONL for the
  iOS-safe flow.
- Chromium production-preview validation proves desktop-fast is still used for
  the same supported fixtures.
- Real-device validation covers low-RAM iPhone, newer iPhone, iPad, OPFS
  unavailable, low quota, background/screen lock, reload-after-checkpoint,
  injected resource failure, unsupported RAW, and unsupported LUT contract cases.
- Real iPhone Safari acceptance is required before claiming iOS production
  support; Playwright WebKit alone can only approve the implementation for
  preflight.

## Rollout order

1. Add execution profile types and capability-profile selection tests.
2. Add low-memory RAW runtime build selection and initialization smoke tests.
3. Add pre-export resource snapshot, `ResourceRegistry`, and evacuation tests.
4. Add preview/runtime/WebGL disposal hooks needed by evacuation.
5. Add file-backed or streaming output sink selection before Blob handoff.
6. Add fresh-worker retry semantics for resource-looking export failures.
7. Add OPFS checkpoint manifest, cleanup, source reacquisition, and row-0 safe
   retry detection.
8. Add Playwright WebKit production-preview validation and JSONL capture.
9. Re-run Chromium production-preview baseline to prove desktop performance is
   not forced into iOS-safe mode.
10. Run real iPhone Safari hardware acceptance before marking iOS support as
    production-ready.

## Open constraints

- JPEG mid-stream row resume depends on encoder support. The first checkpoint
  pass must restart the JPEG from row `0` with safer settings while preserving
  the user's source identity and export graph.
- After reload, an in-memory `File` reference is gone. Recovery requires a
  readable persisted handle, user reselect plus fingerprint verification, or an
  explicit OPFS source copy.
- OPFS quota behavior varies by browser and storage pressure. Quota shortage
  must degrade to non-durable safe export or fail closed before a compressed
  output memory spike, not crash.
- If the low-memory non-pthread RAW build cannot support required LibRaw
  processed windows, iOS-safe must fail closed with product copy instead of
  trying a higher-risk desktop runtime.
- If Playwright WebKit cannot load the current pthread/SAB build in the test
  environment, the validation harness should record the exact blocker and still
  run unit/worker checks. That blocker cannot be treated as iOS production
  support.
