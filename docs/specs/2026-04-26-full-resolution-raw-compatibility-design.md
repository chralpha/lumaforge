# Full-resolution RAW compatibility design

Date: 2026-04-26

Related documents:

- [`2026-04-25-high-resolution-browser-export-design.md`](./2026-04-25-high-resolution-browser-export-design.md)
- [`../plans/2026-04-24-phase2-scene-referred-lut-pipeline-implementation-path.md`](../plans/2026-04-24-phase2-scene-referred-lut-pipeline-implementation-path.md)

## Goal

Improve full-resolution RAW export compatibility while preserving the
browser-local, bounded-memory export model.

Full-resolution export is the primary product path. It should support as many
mainstream RAW sources as practical, especially conventional Bayer RAW files
from Sony, Nikon, Canon, Fujifilm GFX, Panasonic, Leica, and similar camera
families when the runtime can decode the source and process bounded windows.
Nikon NEF lossless-compressed Bayer files and Fujifilm GFX Bayer RAF files are
first-class full-resolution targets, not fallback-only sources.

The compatibility direction is LibRaw-first:

```text
original camera RAW
  -> LibRaw opens and unpacks the original source
  -> LibRaw processes bounded crop windows
  -> LumaForge receives scene-linear ProPhoto RGB windows
  -> shared scene-referred LUT graph
  -> full-resolution photo export
```

The product goal remains a consumer-friendly N-to-N RAW/LUT adapter:

```text
many camera RAW sources
  -> one normalized scene-linear working representation
  -> many declared LUT input spaces
  -> correct display/photo output
```

Secondary compatibility export is out of scope for this spec and the
implementation plan that follows it. This document keeps only a short future
memo so the later fallback design does not get confused with the primary
full-resolution compatibility work.

## Current failure model

The current implementation separates preview from export and uses a
worker-driven strip path. Its compatibility boundary is still narrow because the
strip path reimplements too much RAW processing outside LibRaw.

Observed local fixture outcomes:

- `/workspaces/LumaForge/test-images/SGL00940.ARW` exports successfully through
  the existing full-resolution path.
- `/workspaces/LumaForge/test-images/SGL_1998.NEF` fails full-resolution export
  with `unsupported-orientation`.
- `/workspaces/LumaForge/test-images/Fujifilm - GFX100RF - 16bit lossless compressed (4_3).RAF`
  fails full-resolution export with `unsupported-cfa` and related missing export
  facts.

The blocker is not just missing camera white balance or camera-to-working RGB
data. Current export can fail earlier because the app-side path assumes:

- identity orientation,
- a fixed-origin 2x2 Bayer pattern,
- direct `rawdata.raw_image` access,
- app-owned Bayer demosaic,
- app-owned camera white balance application,
- app-owned camera-to-linear-ProPhoto conversion.

That path underuses LibRaw. LibRaw already knows many source facts that the
current wrapper either drops or narrows: visible crop, orientation, filter codes,
X-Trans tables, Fuji layout facts, per-channel levels, camera white balance,
camera matrices, and processed RGB output settings.

## Design principles

1. Full-resolution export remains the main product path.

   A conventional Bayer RAW should not be pushed to fallback merely because it
   is from another brand, is lossless-compressed before unpacking, or requires
   orientation/crop/CFA-phase handling.

2. LibRaw should own RAW interpretation whenever possible.

   The browser worker should schedule strips, run the LumaForge color graph, and
   encode the output. It should not duplicate camera-specific RAW processing when
   LibRaw can process a bounded crop with the original source metadata.

3. Bounded memory is still required.

   The primary path may keep the original input buffer and LibRaw's decoded RAW
   mosaic in memory, but it must not require a whole-image processed RGB buffer.
   Per-strip postprocess buffers are allowed.

4. Capability probes must explain the real blocker.

   The UI can stay simple, but runtime diagnostics need source-kind, orientation,
   crop, color, LibRaw buffer, and processed-window facts so support can be
   broadened without guessing.

5. Brand names are not sensor models.

   Fujifilm must not be treated as synonymous with X-Trans. Fujifilm GFX sources
   are conventional Bayer targets unless runtime facts prove otherwise.

6. Compatibility fallback is deferred.

   This spec may record constraints for a later fallback, but it must not create
   implementation milestones, acceptance criteria, or product behavior for that
   fallback.

## Non-goals

- Do not add server upload, a native helper, or a local daemon.
- Do not implement secondary compatibility export in this spec/plan.
- Do not silently downscale output and keep the full-resolution label.
- Do not implement a full RAW editor, lens-correction pipeline, denoise pipeline,
  or camera-matching profile editor in this compatibility pass.
- Do not expose users to CFA, color matrix, or orientation diagnostics in the
  normal workflow.
- Do not claim perfect cross-camera spectral matching. The working target remains
  preview/export parity in LumaForge's linear ProPhoto scene representation.

## Rejected approach: strip as synthetic RAW

Do not treat each export strip as a standalone small RAW file and feed it to
LibRaw as a new source.

Reasons:

- Vendor RAW data is containerized and often compressed with file-level offsets,
  tables, metadata, makernotes, camera matrices, white balance, crop, and
  orientation facts. A crop of decoded sensor samples is not a valid camera RAW
  file.
- LibRaw's generic Bayer opening path describes a synthetic Bayer dump. It does
  not recover camera metadata from the original source and would force LumaForge
  to provide the same color and geometry facts it is trying to stop
  reimplementing.
- Isolated strips lose demosaic neighborhoods unless the caller recreates halo,
  phase, crop, and algorithm-specific state correctly.
- This approach would keep app-side color science responsibility while giving up
  the main benefit of opening the original RAW with LibRaw.

The accepted interpretation of "process strips with LibRaw" is:

```text
open original RAW once
-> unpack original RAW once
-> for each bounded output window, ask LibRaw to process a crop of that original source
```

## Source taxonomy

Full-resolution support should be reasoned about by runtime facts, not file
extension alone.

### Tier A: Conventional Bayer with simple geometry

Examples: currently supported Sony ARW-style sources.

Required outcome: supported through the LibRaw processed-window path. The
existing raw-mosaic path may remain temporarily as a compatibility bridge while
the new path is implemented.

### Tier B: Conventional Bayer with orientation, crop, phase, or compression facts

Examples: Nikon NEF lossless-compressed Bayer sources, Fujifilm GFX Bayer RAF
sources, and other mainstream Bayer RAW files that LibRaw can unpack but that do
not match the current fixed-origin assumptions.

Required outcome: target full-resolution support through LibRaw processed
windows. These sources should fail only when LibRaw cannot process bounded crops
reliably or cannot expose trustworthy color/geometry facts.

### Tier C: Sensor-specific mosaics or non-Bayer layouts

Examples: X-Trans, Foveon-like sources, RGB-like RAW layouts, monochrome sources,
or other layouts where app-side Bayer demosaic is the wrong abstraction.

Required outcome: prefer LibRaw processed windows when LibRaw supports the
source. If bounded processed windows are not viable yet, fail closed with a
precise reason. A later fallback design may revisit these sources, but this
spec does not implement that path.

### Tier D: Runtime-decodable but non-windowable sources

Examples: sources that can produce a processed full image through LibRaw but
cannot yet provide bounded processed windows.

Required outcome: full-resolution export remains disabled. The source may be
recorded as a future fallback candidate, but this spec does not define fallback
behavior beyond that memo.

## Architecture

Use a LibRaw-owned processed-window contract under the existing export worker.

```text
RAW file
-> runtime session opens original bytes
-> runtime unpacks once
-> export capability probe
-> worker schedules output-space strips
-> runtime processes each strip as a LibRaw crop window
-> runtime returns linear ProPhoto RGB rows
-> shared scene-referred LUT graph
-> JPEG row encoder
```

The export worker consumes scene-linear ProPhoto RGB before the LUT graph. It no
longer needs camera white balance, camera-to-working RGB matrices, or app-side
demosaic for the primary path.

### Primary strategy: LibRaw processed windows

Runtime API:

```ts
type LibRawProcessedWindowRequest = {
  outputRect: { x: number; y: number; width: number; height: number }
  halo: { left: number; top: number; right: number; bottom: number }
}

type LibRawProcessedWindow = {
  rect: { x: number; y: number; width: number; height: number }
  workingSpace: 'linear-prophoto-rgb'
  data: Uint16Array
  width: number
  height: number
  stride: number
  normalized: false
  orientationApplied: true
  colorApplied: true
  warnings: string[]
}
```

Runtime behavior:

1. Open the original RAW with LibRaw and keep that session alive for export.
2. Call `unpack()` once to decode vendor compression into LibRaw-owned raw data.
3. For each requested output strip:
   - map the output-space rect to the source crop in LibRaw coordinates,
   - expand the crop by the demosaic halo,
   - align the crop to LibRaw's source layout constraints,
   - set `imgdata.params.cropbox`,
   - clear any previous postprocessed image buffer,
   - call `dcraw_process()`,
   - read the resulting RGB bitmap with `get_mem_image_format()` and
     `copy_mem_image()`,
   - discard halo rows/columns,
   - return the interior rect in final output coordinates.

Strict full-resolution export must not use `dcraw_make_mem_image()` for this
path because that API allocates an entire returned RGB bitmap. `copy_mem_image()`
with a caller-owned per-window buffer is the preferred boundary.

Required LibRaw output policy:

- `use_camera_wb = 1`
- `use_auto_wb = 0`
- `use_camera_matrix = 1` unless parity tests justify a stricter embedded-matrix
  policy
- `output_color = ProPhoto`
- `output_bps = 16`
- linear gamma (`gamm[0] = 1`, `gamm[1] = 1`)
- `no_auto_bright = 1`
- `bright = 1.0`
- a fixed highlight policy shared with preview/export expectations
- a fixed demosaic quality policy documented in tests
- no per-window auto exposure, auto white balance, or histogram-dependent
  brightness adjustment

This makes every returned window camera-WB-applied, demosaiced, converted to
linear ProPhoto RGB, and ready for the LumaForge LUT graph.

### Transitional strategy: Raw mosaic windows

The existing raw-mosaic path may remain as a temporary bridge for already
supported fixtures and as a low-level diagnostic path.

It is not the target architecture for broad RAW compatibility. It should not be
the path that unlocks Nikon NEF or Fujifilm GFX RAF unless the LibRaw
processed-window feasibility spike proves impossible.

If retained, raw mosaic windows must still be corrected:

- local CFA phase must account for visible crop, halo, and orientation,
- per-channel black levels must be applied when reported,
- non-identity orientation must not be a generic unsupported error,
- camera white balance and matrices must come from runtime facts, not app-side
  guesses.

## Orientation and coordinate contract

Full-resolution export schedules in final output coordinates.

For each output strip:

```text
output rect in displayed/exported orientation
-> runtime maps to LibRaw cropbox coordinates plus halo
-> LibRaw processes the crop
-> runtime returns a linear ProPhoto RGB window in output orientation
-> export worker writes JPEG rows in output order
```

The runtime must own the canonical mapping because it has the source dimensions,
margins, orientation code, crop facts, Fuji layout facts, and LibRaw output
dimensions.

Implementation may choose one of two internal approaches:

- set cropbox in source coordinates and let LibRaw apply orientation for the
  processed crop, then map the returned crop into output coordinates;
- process source-oriented crops and apply orientation in the runtime wrapper
  before returning rows.

Either implementation is acceptable only if the public API returns output-space
windows and Nikon-style non-identity orientation no longer disables
full-resolution export by itself.

## Crop and halo contract

LibRaw cropbox is applied before rotation. The runtime must therefore align and
expand crop requests in source coordinates before invoking LibRaw.

Requirements:

- Every crop must include enough halo for the selected demosaic algorithm.
- Returned windows must remove halo before the export worker sees rows.
- Adjacent strips must be visually continuous. Seam tests compare overlapping
  strips against a larger processed crop.
- Bayer crops must preserve correct filter phase after crop alignment.
- X-Trans crops must respect the six-by-six phase when supported.
- Fuji-specific rotated or stretched layouts must be treated as runtime-owned
  mapping problems, not app-side Bayer assumptions.
- Invalid crop requests must fail before processing begins for that strip.

## Color contract

The primary full-resolution path returns:

```text
linear ProPhoto RGB, scene-referred, 16-bit integer samples
```

For LibRaw processed windows:

- LibRaw applies camera white balance.
- LibRaw performs demosaic or source-specific interpolation.
- LibRaw applies the camera-to-output color conversion.
- The runtime returns linear ProPhoto RGB.
- The export worker must not apply camera white balance or a camera matrix again.

Any source lacking trustworthy color facts must fail full-resolution export with
a precise reason. This spec does not route color-fact failures into a fallback
implementation.

Preview/export parity must be tested with the same LibRaw settings. A small
fixture or bounded crop should compare:

- current preview decode output,
- a LibRaw processed crop window,
- a whole-image LibRaw process on sources small enough to fit memory.

The goal is not bit-identical parity with every third-party RAW processor. The
goal is a stable, documented LumaForge scene-linear input to the LUT pipeline.

## Memory contract

Strict full-resolution export may hold:

- original input bytes,
- one LibRaw session,
- LibRaw decoded raw data after `unpack()`,
- one current crop postprocess buffer,
- one current export/LUT/JPEG row buffer,
- small scheduler and progress state.

Strict full-resolution export must not hold:

- a whole-image processed RGB bitmap,
- the preview canvas as export source of truth,
- multiple full decoded RAW sessions unless a browser-specific fallback is
  explicitly budgeted,
- per-strip synthetic RAW files.

Memory preflight should estimate:

```text
input bytes
+ LibRaw rawdata bytes
+ max processed crop bytes
+ max LUT/JPEG working bytes
+ wasm/runtime overhead budget
```

Desktop Safari remains a first-class target. If its WASM memory limit cannot
support a source, the export should fail closed before starting.

## Capability probe v2

Replace the single coarse capability result with a structured report that can be
reduced to simple UI states.

Expected shape:

```ts
type RawSensorLayout =
  | 'bayer'
  | 'x-trans'
  | 'foveon'
  | 'monochrome'
  | 'rgb-like'
  | 'unknown'

type FullResInputStrategy = 'libraw-processed-window' | 'raw-mosaic-window'

type FullResCapabilityV2 = {
  supported: boolean
  strategy?: FullResInputStrategy
  width: number
  height: number
  rawWidth: number
  rawHeight: number
  visibleCrop?: LumaRawVisibleCrop
  orientation?: {
    code: number
    supported: boolean
    outputWidth: number
    outputHeight: number
  }
  sensor: {
    layout: RawSensorLayout
    colorCount: number
    cfa?: LumaRawCfaInfo
    phaseIsWindowLocal: boolean
  }
  levels?: {
    black: number
    white: number
    perChannelBlack?: [number, number, number, number]
  }
  color?: {
    workingSpace: 'linear-prophoto-rgb'
    librawOutputColor: 'prophoto'
    gamma: 'linear'
    cameraWhiteBalanceAppliedByRuntime: boolean
    cameraMatrixAppliedByRuntime: boolean
  }
  windows: {
    librawProcessed: boolean
    rawMosaic: boolean
  }
  reasons: LumaRawExportUnsupportedReasonV2[]
  diagnostics: {
    make?: string
    model?: string
    normalizedMake?: string
    normalizedModel?: string
    librawFilterCode?: number
    hasRawImage: boolean
    hasColor3Image: boolean
    hasColor4Image: boolean
    hasXTransTable: boolean
    canRepeatCropProcess?: boolean
    lastLibRawWarningMask?: number
  }
}
```

The app-facing UI can still show one concise reason, but tests and debug output
must retain the structured facts.

Reason codes should distinguish:

- `libraw-open-failed`
- `libraw-unpack-failed`
- `libraw-cropbox-window-unavailable`
- `libraw-cropbox-not-repeatable`
- `orientation-transform-unimplemented`
- `unsupported-sensor-layout`
- `unsupported-cfa-pattern`
- `missing-visible-crop`
- `missing-levels`
- `missing-camera-white-balance`
- `missing-camera-to-output-color`
- `degenerate-camera-to-output-color`
- `processed-window-unavailable`
- `raw-window-unavailable-after-unpack`
- `jpeg-runtime-unavailable`

Existing coarse reasons may remain as compatibility aliases, but new tests should
assert the precise reason.

## Future memo: secondary compatibility export

Secondary compatibility export is not part of this spec's implementation scope.
It should not appear in the follow-up plan as a milestone, acceptance target, or
UI behavior.

The later design can revisit it for sources that:

- can produce a color-managed processed image through the runtime,
- cannot yet expose bounded LibRaw processed windows,
- pass memory and browser-resource preflight,
- would otherwise leave the user with no export option.

Constraints to preserve for that later design:

- It must be a separate action or explicitly separate menu item.
- It must not be selected automatically after full-resolution export fails.
- It must disclose that it uses a less memory-bounded compatibility path.
- It must fail before starting if estimated pixel buffers exceed the configured
  browser/device budget.
- It must not silently downscale while preserving a full-resolution label.
- It must emit telemetry distinct from strict full-resolution export.

## Milestones

### P0: Capability diagnostics and LibRaw facts baseline

Add capability v2 diagnostics without broadening support yet.

Acceptance:

- Sony `SGL00940.ARW` still reports supported full-resolution export.
- Nikon `SGL_1998.NEF` reports conventional Bayer source facts and identifies
  orientation as a mapping requirement, not a fallback decision.
- Fujifilm GFX RAF reports actual sensor layout from runtime facts. If it is
  Bayer, the blocker must not be generic brand-based `unsupported-cfa`.
- Debug logs and tests expose color-fact status separately from orientation,
  sensor layout, rawdata buffers, and processed-window availability.

### P1: LibRaw cropbox feasibility spike

Prove that the runtime can process repeated bounded crops from one original RAW
session after a single unpack.

Acceptance:

- The runtime can process at least two non-overlapping crop windows from the same
  opened and unpacked source without reopening the RAW file.
- `free_image()` plus updated `params.cropbox` is sufficient, or the spike
  documents the minimum safe reset needed.
- `copy_mem_image()` returns RGB16 crop data without `dcraw_make_mem_image()`.
- Crop output settings are fixed to camera WB, ProPhoto, 16-bit, linear gamma,
  and no auto brightness.
- A crop from a small source matches the corresponding region from a whole-image
  LibRaw process within the documented tolerance.
- The spike runs on Sony, Nikon NEF, and Fujifilm GFX RAF fixtures.

### P2: Processed-window runtime API

Add the native `readLibRawProcessedWindow` API and TypeScript adapter.

Acceptance:

- The API accepts output-space rects and returns output-space linear ProPhoto RGB
  windows.
- The API handles non-identity orientation without marking conventional Bayer
  sources unsupported.
- The API removes halo before returning rows.
- The API reports precise per-source blockers when crop processing fails.
- Tests prove that camera WB and camera-to-output color conversion are applied
  once and only once.

### P3: Full-resolution export integration

Move the primary export worker strategy to LibRaw processed windows.

Acceptance:

- Sony `SGL00940.ARW` exports through `libraw-processed-window` or stays on the
  transitional path only behind an explicit temporary compatibility guard.
- Nikon `SGL_1998.NEF` can full-resolution export when LibRaw crop processing
  succeeds.
- Fujifilm GFX Bayer RAF can full-resolution export when LibRaw crop processing
  succeeds.
- Exported dimensions match oriented runtime output dimensions.
- JPEG rows are written in displayed output order.
- Worker memory never includes a whole-image processed RGB buffer.

### P4: Retire app-owned Bayer assumptions

Reduce the raw-mosaic path to diagnostics or narrowly justified fallback cases.

Acceptance:

- Mainstream Bayer support no longer depends on JavaScript demosaic.
- `unsupported-cfa` is not used for sources that LibRaw can process as bounded
  windows.
- Existing raw-mosaic tests are either migrated to processed-window tests or
  explicitly retained as low-level runtime tests.
- Preview/export parity tests cover the shared LibRaw settings that define
  LumaForge's scene-linear RAW interpretation.

## Test matrix

Minimum local real-file acceptance:

| Fixture                                                     | Expected primary path     | Required outcome                                                                 |
| ----------------------------------------------------------- | ------------------------- | -------------------------------------------------------------------------------- |
| `SGL00940.ARW`                                              | LibRaw processed window   | Export succeeds with exact runtime output dimensions                             |
| `SGL_1998.NEF`                                              | LibRaw processed window   | Export succeeds, or reports only the remaining precise LibRaw crop/color blocker |
| `Fujifilm - GFX100RF - 16bit lossless compressed (4_3).RAF` | LibRaw processed window   | Export succeeds, or reports precise non-generic runtime blocker                  |
| Known X-Trans RAF fixture                                   | LibRaw processed window   | Does not enter JavaScript Bayer demosaic path                                    |
| Unknown LUT profile on supported RAW                        | No export                 | Full-resolution remains disabled until LUT input is selected                     |
| Unsupported scanner/non-camera RAW                          | No full-resolution export | Reports non-windowable or unsupported source facts without crashing              |

Automated coverage:

- Runtime capability v2 normalization tests.
- Native wrapper tests for repeated cropbox processing.
- Native wrapper tests for orientation, crop, WB, output color, and warnings.
- Processed-window seam tests comparing adjacent strips against a larger crop.
- Export orchestration tests for processed-window strategy selection.
- UI gating tests for primary full-resolution export.

Browser coverage:

- Chrome and Edge must pass supported full-resolution fixtures.
- Desktop Safari remains a first-class target for memory behavior and must either
  export supported fixtures or fail closed without page instability.
- Mobile browsers may disable full-resolution export with explicit messaging.

## Documentation updates after implementation

After implementation, update:

- [`2026-04-22-phase1-test-matrix.md`](./2026-04-22-phase1-test-matrix.md) with
  real fixture outcomes.
- [`2026-04-25-high-resolution-browser-export-design.md`](./2026-04-25-high-resolution-browser-export-design.md)
  to describe the LibRaw processed-window contract if it becomes the public
  runtime/export boundary.
- The implementation plan that follows this spec, under `docs/plans/`.

## Open decisions for implementation planning

- Whether repeated crop processing can safely reuse one LibRaw instance with
  `free_image()` and updated `cropbox`, or whether the runtime needs a small
  LibRaw-session pool with an explicit memory budget.
- Which demosaic quality and highlight policy should define LumaForge's
  full-resolution RAW interpretation.
- Whether orientation should be applied by LibRaw, by the native wrapper after
  `copy_mem_image()`, or by the export worker as a temporary bridge.
- What crop halo size is required for the selected demosaic policy.
