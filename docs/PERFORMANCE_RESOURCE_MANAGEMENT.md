# RAW Performance Resource Management

This document is intended to be self-contained. Source links and code paths are
provenance only; the runtime formulas and project-specific resource rules are
written out here so a reader does not need to chase every implementation file to
understand how LumaForge preserves compatibility without leaving available
performance unused.

Snapshot checked on 2026-06-01 against the resource policy current at
verification time.

Primary implementation sources:

- `src/lib/runtime/capability-vector.ts`
- `src/lib/runtime/resource-budget.ts`
- `src/lib/runtime/interactive-policy.ts`
- `src/lib/runtime/export-policy.ts`
- `src/lib/runtime/export-runtime-resources.ts`
- `src/lib/export/execution-profile.ts`
- `src/modules/raw-processor/services/preview/preview-resolution-policy.ts`
- `src/modules/raw-processor/services/export/export-evacuation.ts`
- `src/lib/raw/luma-runtime-adapter.ts`

## Product Boundary

The product workflow is:

```text
single RAW file -> preview -> look or LUT -> compare -> JPEG export
```

Preview and export share color intent, but they are different executors.
Interactive preview is allowed to optimize for responsiveness and may use
embedded, quick, bounded HQ, WebGL, or CPU-degraded stages. Full-resolution
export is authoritative: it must either reproduce the declared pipeline at the
declared output size or fail closed.

The resource policy therefore has two duties:

1. Compatibility guarantee: avoid resource plans that are likely to terminate
   the tab, silently downscale export, or label a degraded result as full-res.
2. Performance maximization: use stronger preview and export budgets when the
   capability vector can justify them inside the compatibility envelope.

## Stable Capability Vector

`CapabilityVector` is a frozen, session-stable snapshot. It intentionally does
not contain quota, live heap pressure, current preview ownership, or prior export
results. Those can change during a session and are handled by export-time
resource snapshots and resource evacuation.

Fields:

| Field                | Meaning                                 | Rule                                                                |
| -------------------- | --------------------------------------- | ------------------------------------------------------------------- |
| `coi`                | `globalThis.crossOriginIsolated`        | Required before pthread/SAB can be true.                            |
| `pthread`            | WebAssembly thread/SAB availability     | False when `coi` is false.                                          |
| `deviceMemoryGB`     | Coarse browser memory signal            | `null` when unavailable or invalid.                                 |
| `hwConcurrency`      | Browser-reported CPU thread upper bound | Clamped to `[1, 64]`.                                               |
| `webKitClass`        | UA family bucket                        | `chromium`, `webkit-desktop-safari`, `webkit-mobile`, or `unknown`. |
| `maybeOpfsSupported` | Stable OPFS feature hint                | Does not include quota or free space.                               |

The key discipline is that missing memory data is not proof of high memory.
Safari/WebKit often has weaker memory observability than desktop Chromium, so a
new iPhone can be computationally strong while still needing conservative
full-resolution export orchestration.

## Runtime Resource Budget

`deriveRuntimeResourceBudget(cap)` is the shared resource decision helper used by
interactive preview and export policy. It is the place where device class,
memory profile, bounded-HQ preview pixels, export row ceilings, export
concurrency ceilings, and safe side-work concurrency are aligned.

Definitions:

```text
knownLowMemory =
  deviceMemoryGB != null && deviceMemoryGB <= 4

desktopMemory =
  coi &&
  pthread &&
  webKitClass == "chromium" &&
  !knownLowMemory

balancedWebKitPreview =
  coi &&
  pthread &&
  hwConcurrency >= 6 &&
  !knownLowMemory &&
  webKitClass in {"webkit-mobile", "webkit-desktop-safari"}
```

Resource class:

```text
if desktopMemory:
  resourceClass = "desktop-performance"
else if balancedWebKitPreview:
  resourceClass = "webkit-balanced"
else if webKitClass == "webkit-mobile":
  resourceClass = "mobile-safe"
else:
  resourceClass = "compat-safe"
```

Worker memory profile:

```text
workerMemoryProfile = desktopMemory ? "desktop" : "low-memory"
```

This means WebKit mobile can earn a larger preview budget, but it still does not
receive the desktop pthread RAW runtime profile. That separation is deliberate:
preview can spend more pixels when the device appears strong, while export
continues to avoid high-risk worker memory shapes.

### Bounded HQ Preview Budget

Base budgets:

| Budget source                 | Base bounded-HQ pixels |
| ----------------------------- | ---------------------: |
| `desktop-performance`         |           `16_000_000` |
| `webkit-balanced`             |           `12_000_000` |
| `mobile-safe` / `compat-safe` |            `8_000_000` |

Known browser memory further caps this:

```text
if deviceMemoryGB == null:
  boundedHqMaxPixels = basePixels
else:
  boundedHqMaxPixels =
    min(basePixels, max(2_500_000, floor(deviceMemoryGB * 4_000_000)))
```

The `2_500_000` floor matches the quick preview cap. If the source already fits
within quick preview, bounded HQ is skipped rather than decoded redundantly.

### Export Row And Concurrency Ceilings

Export rows are more conservative than preview pixels because full-resolution
export owns RAW/JPEG workers, checkpoint state, row buffers, and output sinks.

Row ceiling:

```text
if webKitClass == "webkit-mobile" || knownLowMemory:
  exportRowSliceCeiling = 128
else if !pthread || webKitClass == "webkit-desktop-safari":
  exportRowSliceCeiling = 256
else:
  exportRowSliceCeiling = 2048
```

Concurrency ceiling:

```text
if pthread &&
   webKitClass != "webkit-mobile" &&
   webKitClass != "webkit-desktop-safari":
  exportConcurrencyCeiling = 3
else:
  exportConcurrencyCeiling = 1
```

Side-work concurrency:

```text
allowConcurrentDecodeAndLutParse =
  pthread && hwConcurrency >= 4 && webKitClass != "webkit-mobile"
```

This keeps mobile WebKit from doing expensive background side work while a RAW
decode path is already active, even when `hwConcurrency` is high.

## Interactive Preview Policy

`deriveInteractivePolicy(cap)` is a thin projection of the shared budget:

```text
boundedHqMaxPixels = budget.boundedHqMaxPixels
previewWorkerMemoryProfile = budget.workerMemoryProfile
allowConcurrentDecodeAndLutParse = budget.allowConcurrentDecodeAndLutParse
```

Preview capability is then decided from graphics facts:

```text
if WebGL2 is available and fragment high-float precision is sufficient:
  previewMode = "gpu"
else if WebGL2 is missing:
  previewMode = "cpu", reason = "webgl2-missing"
else:
  previewMode = "cpu", reason = "tone-float-precision-low"
```

Cross-origin isolation is not a preview capability gate by itself. The RAW
runtime adapter uses the policy-selected memory profile: desktop profile requires
COI, low-memory profile does not. This is why a browser without COI can still
load RAW preview through the low-memory runtime instead of showing a full-page
unsupported state.

## Full-Resolution Export Policy

`deriveExportPolicy(cap, image, intent, runtime)` consumes the same capability
vector plus an export-time resource snapshot.

Image size:

```text
megapixels = width * height / 1_000_000
```

Row slice:

```text
rowSlice = 512
if megapixels >= 100:
  rowSlice = rowSlice / 2
rowSlice = min(rowSlice, budget.exportRowSliceCeiling)
if previousResourceFailure:
  rowSlice = rowSlice / 2
if previousCrashLikeInterruption:
  rowSlice = rowSlice / 4
rowSlice = clamp(floor(rowSlice), 64, 2048)
```

Concurrency:

```text
threadBudget = max(1, hwConcurrency - 1)
if pthread:
  maxConcurrency = min(threadBudget, budget.exportConcurrencyCeiling)
else:
  maxConcurrency = 1
if previousResourceFailure || previousCrashLikeInterruption:
  maxConcurrency = 1

preferenceWeight = { safe: 1, balanced: 2, max: 3 }[performancePreference]
concurrency = clamp(preferenceWeight, 1, maxConcurrency)
```

Output sink:

```text
requiredOpfsMB = megapixels * 4 + 64
opfsFits =
  opfsSinkAvailable &&
  opfsAvailableMB != null &&
  opfsAvailableMB > requiredOpfsMB

if opfsFits:
  outputSink = "opfs-file"
else if streamingSinkAvailable:
  outputSink = "streaming"
else:
  outputSink = "blob-handoff"
```

The `64MB` margin exists because OPFS quota is advisory and the export path has
metadata, checkpoint, encoder, and handoff overhead beyond image megapixels.

Persist cadence:

```text
targetRows = rowSlice <= 128 ? 2048 : 4096
persistEveryNRows =
  clamp(ceil(targetRows / rowSlice) * rowSlice, rowSlice, 4096)
```

Product copy classification:

```text
if megapixels > 50 &&
   outputSink == "blob-handoff" &&
   webKitClass == "webkit-mobile":
  productCopy = "cannot-safely-complete"
else if previousCrashLikeInterruption:
  productCopy = "interrupted-retry"
else if previousResourceFailure:
  productCopy = "resource-retry"
else if outputSink == "blob-handoff" && megapixels > 50:
  productCopy = "non-durable-checkpoint"
else if workerMemoryProfile == "desktop" &&
        concurrency >= 2 &&
        rowSlice >= 512:
  productCopy = "high-performance"
else:
  productCopy = "safe-export"
```

Full-resolution export never silently downscales output dimensions. If the
policy says a large local export cannot be completed safely with the available
sink, the UI must fail closed and say so.

## Device-Class Outcomes

These are derived outcomes, not hard-coded marketing tiers.

| Environment                                                                       |                         Preview budget | RAW runtime profile |                                        Export rows | Export concurrency |
| --------------------------------------------------------------------------------- | -------------------------------------: | ------------------- | -------------------------------------------------: | -----------------: |
| Chromium desktop with COI, pthread, not known-low-memory                          |                           up to `16MP` | `desktop`           |   starts at `512`, can go higher by policy ceiling |          up to `3` |
| Strong WebKit mobile with COI, pthread, `hwConcurrency >= 6`, no known-low-memory |                           up to `12MP` | `low-memory`        |                                      `128` ceiling |                `1` |
| WebKit mobile without those strong signals, or known-low-memory mobile            |                            up to `8MP` | `low-memory`        |                                      `128` ceiling |                `1` |
| Desktop Safari WebKit                                                             |    `12MP` when strong, otherwise `8MP` | `low-memory`        |                                      `256` ceiling |                `1` |
| Unknown non-WebKit with pthread                                                   | usually `8MP` unless memory caps lower | `low-memory`        | can use wider rows, but not desktop memory profile |          up to `3` |
| No pthread                                                                        |   up to `8MP` unless memory caps lower | `low-memory`        |        `256` ceiling, or `128` if known-low-memory |                `1` |

The important iPhone rule is the second row: strong recent iPhones can justify a
better preview surface, but that does not imply desktop-style export workers.
This avoids wasting the device's interactive performance while preserving the
authoritative export safety boundary.

## Resource Lifecycle And Evacuation

Before full-resolution export starts, the app builds a lightweight export
snapshot and disposes large preview-owned resources. Required owners are:

```text
preview
bounded-hq
webgl
export-result
lut-fetch
```

The evacuation sequence is:

```text
user starts full-resolution export
-> freeze export graph, source facts, current params, LUT contract, and policy
-> abort in-flight preview and bounded-HQ work
-> dispose active preview RAW runtime session
-> dispose WebGL preview pipeline and textures
-> release bounded-HQ decoded buffer
-> release previous export Blob/object URLs
-> release obsolete LUT fetch buffers
-> verify ResourceRegistry has no remaining required owners
-> start full-resolution export worker with the selected plan
```

Export completion may restore preview best-effort from the current session file.
Failure to restore bounded HQ preview must not invalidate a completed export.

On resource-looking export failure, retry uses a fresh worker/runtime context and
a lower policy. WebAssembly memory is effectively grow-only for this product, so
retrying in the same grown worker after memory pressure is not accepted as a
compatibility strategy.

## What Must Not Change Accidentally

- Do not make HQ preview export the primary product promise. It is a fallback or
  social-size compromise; full-resolution export remains authoritative.
- Do not use preview success as proof that full-resolution export is safe.
- Do not let WebKit mobile receive the desktop RAW memory profile just because it
  reports many hardware threads.
- Do not use missing `deviceMemoryGB` as evidence of abundant memory.
- Do not silently downscale a full-resolution export and keep the full-res label.
- Do not keep preview buffers, WebGL textures, previous export blobs, or in-flight
  bounded-HQ work alive while export starts.
- Do not reintroduce a named-profile table as the decision source. Names are
  telemetry/product-copy labels only; policy is derived from capability, intent,
  and export-time resources.

## Verification Map

Policy and invariant tests:

- `src/lib/runtime/resource-budget.test.ts`
- `src/lib/runtime/interactive-policy.test.ts`
- `src/lib/runtime/export-policy.test.ts`
- `src/lib/runtime/export-policy.property.test.ts`
- `src/lib/export/execution-profile.test.ts`

Preview capability and degraded-mode tests:

- `src/lib/preview/raw-preview-capability.test.ts`
- `src/modules/raw-processor/hooks/useCapabilityGate.test.tsx`
- `src/modules/raw-processor/__tests__/raw-preview-degrade.test.tsx`
- `src/lib/preview/cpu-preview-parity.test.ts`

Export lifecycle and resource tests:

- `src/modules/raw-processor/services/export/export-evacuation.test.ts`
- `src/modules/raw-processor/hooks/stages/export/useExportResourceManagement.test.tsx`
- `tests/browser/raw-export-lifecycle-resources.spec.ts`
- `tests/browser/raw-ios-safe-export.spec.ts`
- `tests/browser/raw-hq-preview-export.spec.ts`

When changing this policy, run the smallest focused unit set first, then
production-like browser validation for any user-visible RAW preview, export
handoff, or mobile/WebKit behavior change.
