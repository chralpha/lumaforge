# Preview histogram design

Date: 2026-05-02

Related documents:

- [`2026-04-25-high-resolution-browser-export-design.md`](./2026-04-25-high-resolution-browser-export-design.md)
- [`2026-04-28-raw-lab-ui-redesign-design.md`](./2026-04-28-raw-lab-ui-redesign-design.md)
- [`2026-04-30-luma-color-runtime-package-design.md`](./2026-04-30-luma-color-runtime-package-design.md)
- [`2026-05-01-basic-tone-exposure-contrast-design.md`](./2026-05-01-basic-tone-exposure-contrast-design.md)

## Goal

Add a RAW Lab histogram that explains the current editable preview's brightness,
channel distribution, and clipping risk without making full-resolution export
more expensive.

The first implementation should be preview-only. It should compute bins from the
active decoded preview buffer and the same color graph semantics used by
preview/export, not from the full-resolution export worker and not from the
displayed WebGL or Canvas surface.

The histogram is an editing aid. It can tell the user whether the current
preview edit is pushed into shadows, highlights, or channel clipping. It must
not claim that every full-resolution output pixel has been analyzed.

## Decision

LumaForge should ship a preview-source histogram first.

This is enough for the current product because the preview path is already a
color-close reference for export when the selected graph is supported:

```text
RGB16 Linear ProPhoto preview source
-> raw-render-exposure
-> user exposure
-> user contrast
-> LUT input gamut and transfer, when supported
-> LUT sampling and output handling, when supported
-> sRGB display/output bins
```

The preview still differs from export in resolution, sampling, implementation,
and precision. Quick and bounded-HQ preview are downsampled before application
JavaScript and WebGL upload. Preview executes WebGL shaders, while export uses
CPU/WASM row-band processing. The histogram therefore describes the current
preview source's processed output distribution. It is suitable for color and
brightness interpretation, but it is not an authoritative full-resolution
export audit.

## Scope

This spec covers:

- a luminance histogram for the current processed preview edit;
- RGB channel histograms for the current processed preview edit;
- shadow and highlight clipping counters derived from processed output bins;
- explicit histogram source state: `quick`, `bounded-hq`, `stale`,
  `computing`, `unsupported`, or `unavailable`;
- recomputation when the active decoded preview source, raw render exposure,
  tone parameters, custom LUT data, LUT profile, style kind, or intensity
  changes;
- bounded CPU and memory behavior suitable for interactive RAW Lab editing.

## Non-goals

- Do not add a full-resolution export histogram in this phase.
- Do not gate export readiness on histogram results.
- Do not compute a histogram by calling WebGL `readPixels`,
  `RawProcessingPipeline.readProcessedPixels()`, Canvas `getImageData()`, or
  any other GPU/display-surface readback path.
- Do not allocate a full-preview or full-export processed RGB/RGBA image only
  to compute bins.
- Do not add histogram-based auto exposure, auto contrast, or auto correction.
- Do not make the embedded JPEG preview an authoritative histogram source.
- Do not compute a spatially mixed compare-split histogram.
- Do not solve built-in style export parity. Built-in style histogram support
  should remain unavailable until the style transform is owned by the shared
  color runtime or by a deliberately tested histogram-only CPU implementation.

## Current system context

`PreviewCanvas` uploads decoded RAW preview data through
`createRawUploadInput`. The editable RAW path accepts `rgb-u16` data tagged as
`linear-prophoto-rgb` and carries `renderExposure` into the WebGL pipeline. This
is the correct source for a preview histogram.

The preview shader applies raw render exposure, user exposure, user contrast,
and then style/LUT processing before producing sRGB display color. In compare
mode, the left side is the technical base and the right side is the processed
edit. A histogram should not read the compare composite from the canvas because
that would make bins depend on the handle position and canvas size.

`@lumaforge/luma-color-runtime` owns the shared graph descriptor through
`resolveExportColorGraph`. The current graph order includes
`input-linear-prophoto`, `raw-render-exposure`, `user-exposure`,
`user-contrast`, optional LUT input/output handling, and `output-srgb`.

The full-resolution row-band processor already proves the right execution
shape: process bounded row chunks, reuse scratch buffers, and produce RGB8 sRGB
output from `Float32Array` or `Uint16Array` rows. A histogram processor should
reuse that graph logic or share its compiled graph applier rather than
introducing a second transform order.

`RawProcessingPipeline.readProcessedPixels()` is not acceptable for this
feature. It allocates `inputWidth * inputHeight * 4` `Float32Array` entries and
performs a GPU readback from the processed FBO. That is exactly the kind of
full-surface allocation and GPU synchronization the export design avoids.

## Histogram semantics

The primary histogram represents the processed final edit for the active
preview source. It does not change when the user moves the compare split, since
the compare split is a viewing mode rather than an edit.

Bins are display/output bins:

- RGB bins count final sRGB output bytes per channel, `0..255`.
- Luminance bins count a Rec.709-style luma value derived from final output RGB
  bytes, also `0..255`.
- Shadow clipping counts pixels with any channel at `0`, plus a separate luma
  zero count.
- Highlight clipping counts pixels with any channel at `255`, plus a separate
  luma max count.

Using output bins matches the user's visual interpretation: the histogram
answers "what does this preview edit look like on output?" rather than "what
does the raw scene-linear buffer contain before tone and LUT?".

An optional future base histogram may show the technical base after
`raw-render-exposure` only. It should not be included in V1 unless the UI needs
it for a specific compare workflow.

## Source eligibility

The histogram can be `ready` only when the active image source is a decoded RAW
preview buffer with:

- `layout: 'rgb-u16'`
- `colorSpace: 'linear-prophoto-rgb'`
- finite width and height
- attached `renderExposure`

When only an embedded preview URL is visible, the histogram state is
`unavailable`. The embedded JPEG is fast visual feedback, but it is already a
camera-rendered or container-provided image and does not share the editable
Linear ProPhoto contract.

Quick preview is the first useful histogram source. Bounded-HQ preview replaces
the quick histogram when it becomes the active decoded preview source. If
bounded-HQ fails or is skipped, the quick histogram remains valid for the
active preview.

## Pipeline support

V1 should support processed histograms for:

- no style or LUT, using raw render exposure plus user tone and sRGB output;
- custom LUTs whose profile resolution produces a supported shared graph.

For unsupported pipelines, the histogram must fail closed:

- unresolved custom LUT profile: `unsupported`;
- custom LUT output contract unsupported by the shared graph: `unsupported`;
- built-in style active: `unsupported` for the processed-style histogram.

The UI may keep showing the last valid histogram with a stale state while a new
histogram is computing, but it must not silently present a base or previous
histogram as the current processed result.

Built-in styles currently live in the preview shader and are not supported by
the full-resolution export graph. Porting them to the shared color runtime only
for histogram display would create another parity surface. That should be a
separate decision, not hidden inside this feature.

## Architecture

Add histogram execution next to the shared color runtime rather than inside the
WebGL preview pipeline:

```text
RAW Lab state
-> active DecodedImage preview source
-> resolveExportColorGraph(...)
-> histogram runner selected by input ownership policy
-> row-bounded graph execution
-> bin accumulator
-> RAW Lab histogram view model
```

The preferred API shape is a small runtime helper with explicit state:

```ts
type ReadyPreviewHistogram = {
  state: 'ready'
  source: 'quick' | 'bounded-hq'
  width: number
  height: number
  sampledPixels: number
  totalPixels: number
  bins: {
    luma: Uint32Array
    red: Uint32Array
    green: Uint32Array
    blue: Uint32Array
  }
  clipping: {
    shadowAnyChannel: number
    highlightAnyChannel: number
    shadowLuma: number
    highlightLuma: number
  }
}

type PreviewHistogramState =
  | ReadyPreviewHistogram
  | { state: 'computing'; previous: ReadyPreviewHistogram | null }
  | { state: 'stale'; previous: ReadyPreviewHistogram }
  | { state: 'unsupported'; reason: string }
  | { state: 'unavailable'; reason: 'embedded-only' | 'no-image' }
```

The processor should accept:

- `Uint16Array` RGB preview rows;
- preview width and height;
- active source label;
- `RawRenderExposure`;
- normalized processing params;
- current `LUTData | null`;
- a supported color graph descriptor.

The implementation should process rows and accumulate bins directly. It may
reuse a small row scratch buffer, but it must not materialize a full processed
preview image.

## Input ownership and worker policy

Worker execution is not free shared memory. Ordinary `postMessage()` uses
structured cloning, which copies data. Transferable `ArrayBuffer`s avoid a copy
by moving ownership, but the sender's buffer is detached. `SharedArrayBuffer`
can share memory, but it requires a secure, cross-origin-isolated document and
adds synchronization constraints.

The implementation must therefore select an explicit input ownership mode:

```ts
type HistogramInputOwnership =
  | 'main-thread-chunked-no-copy'
  | 'worker-transfer-detaches-source'
  | 'worker-copy-accepted-under-budget'
  | 'worker-shared-buffer-requires-coi'
```

V1 default: `main-thread-chunked-no-copy`.

This mode reads the active `DecodedImage.data` on the main thread, processes a
bounded number of rows per task, yields between chunks, and accumulates bins
without copying or transferring the preview input. It is the only V1 mode that
satisfies both requirements at once:

- keep the active preview source usable by `PreviewCanvas`;
- avoid an extra quick or bounded-HQ preview input buffer.

`worker-transfer-detaches-source` is forbidden for the active
`DecodedImage.data`. `PreviewCanvas` can re-read the active typed array during
pipeline initialization, image-version updates, and parameter/LUT re-renders.
Detaching that buffer would make the preview source invalid. This mode is
allowed only for a future input buffer that is produced exclusively for
histogram work and never stored as the active preview source.

`worker-copy-accepted-under-budget` is allowed only behind an explicit byte
budget and memory-policy check. The copied bytes must be counted as transient
histogram memory. The default copy cap is one quick preview input:

```text
2,500,000 px * 3 channels * 2 bytes = 15,000,000 bytes
```

Bounded-HQ preview input can be roughly:

```text
12,000,000 px * 3 channels * 2 bytes = 72,000,000 bytes
```

Copying bounded-HQ input is therefore not allowed by default. If the active
source exceeds the copy cap, the runner must choose
`main-thread-chunked-no-copy`, `worker-shared-buffer-requires-coi`, or a
deterministic sampled histogram. It must not silently clone the full source.

`worker-shared-buffer-requires-coi` is future work. It requires the decoded
preview input to be created on top of `SharedArrayBuffer` from the start, plus
runtime checks such as `crossOriginIsolated`. It must not be used as the only
production path because cross-origin isolation affects hosting, third-party
resources, and deployment headers.

## Scheduling and invalidation

Histogram work must be versioned, cancellable, and lower priority than preview
rendering.

Recompute on:

- `imageVersion` changes;
- quick-to-bounded-HQ source replacement;
- `renderExposure` changes on the decoded image;
- `userExposureEv` or `userContrast` changes;
- `styleKind`, `builtinPreset`, `intensity`, LUT data, or LUT contract changes.

Do not recompute on:

- compare split changes;
- canvas resize;
- zoom, pan, or viewport-only changes;
- export progress changes.

During slider interaction, debounce recomputation by roughly `100ms` to
`200ms`. Keep the last completed histogram visible as `stale` while a new
version is pending. If a newer version starts, older work must stop publishing
results.

The scheduler must be able to stop after each row chunk. Main-thread chunks
should target a small wall-clock budget per task, for example `4ms` to `8ms`,
then yield with the next task or idle callback. A long bounded-HQ custom-LUT
histogram may finish later or fall back to deterministic sampling, but it must
not monopolize the main thread.

## Performance budget

The memory budget is small if the implementation only accumulates bins:

- four `Uint32Array(256)` histograms: about 4 KB;
- clipping counters and metadata: negligible;
- row scratch buffers: bounded by `width * rowBandRows * channels`, not by the
  full image height;
- no extra copy of the preview input buffer in the default
  `main-thread-chunked-no-copy` path;
- any worker input copy must be explicitly selected as
  `worker-copy-accepted-under-budget` and counted against the transient memory
  budget;
- no GPU readback buffer.

CPU cost is linear in the number of preview pixels and in the graph complexity.
No-LUT graphs are cheap. Custom LUT graphs are heavier because they include
gamut conversion, transfer encode/decode, and trilinear LUT sampling.

Expected policy:

- quick preview: scan the full preview source;
- bounded-HQ preview: scan the full preview source with the no-copy chunked
  runner, or use shared-buffer worker execution only when the hosting/runtime
  preconditions are already satisfied;
- if bounded-HQ histogram work becomes too slow on lower-end devices, allow a
  deterministic row/column stride capped by a histogram pixel budget, but keep
  `sampledPixels` and `totalPixels` in the view model so the UI can avoid
  overstating precision.

The feature should never delay upload completion, preview painting, LUT
selection, or export start. A missing or stale histogram is acceptable during
interaction; blocking editing for a histogram is not.

## UI contract

Place the histogram in the RAW Lab tool surface near the Basic Tone controls,
not as an export panel. The visual surface should be compact:

- one combined luminance histogram as the primary shape;
- subtle RGB channel overlays or a channel toggle;
- small shadow/highlight clipping indicators;
- a source label such as `Quick preview`, `HQ preview`, `Stale`, or
  `Unsupported`.

The UI copy must avoid implying full-resolution proof. It should describe the
source, not educate at length.

When the processed histogram is unsupported, the panel should use an explicit
unsupported state rather than showing silently wrong bins. The exact user-facing
wording can be decided in implementation, but the state must be represented in
the model.

## Testing

Color runtime tests:

- synthetic black, white, gray, and RGB primary inputs produce exact bins;
- exposure shifts bins in the expected direction;
- contrast changes luma distribution around the pivot;
- custom LUT identity produces the same bins as no-LUT output where applicable;
- clipping counters match synthetic channel extremes;
- unsupported graphs return an unsupported state instead of partial bins.

Scheduling tests:

- parameter changes invalidate previous histogram versions;
- quick preview histogram appears before bounded-HQ is ready;
- bounded-HQ replaces quick histogram after source replacement;
- compare split and canvas resize do not invalidate histogram bins;
- stale results cannot overwrite a newer completed version.

Ownership tests:

- the default runner leaves `decodedImage.data.buffer.byteLength` unchanged;
- the active preview source is never present in a worker transfer list;
- bounded-HQ input above the copy cap does not use
  `worker-copy-accepted-under-budget`;
- quick-preview worker copy, if implemented, reports copied bytes in histogram
  diagnostics or test-visible runner metadata;
- `SharedArrayBuffer` mode is selected only when `crossOriginIsolated` and the
  runtime-created source buffer both satisfy the shared-buffer contract.

Regression checks:

- histogram code never calls `readProcessedPixels`, `gl.readPixels`,
  `getImageData`, or full-image processed-output allocation paths;
- row scratch memory is bounded by row count;
- worker or chunked execution yields during rapid slider changes;
- no histogram path detaches the active preview typed array.

Browser smoke:

- load a RAW fixture, wait for quick preview, and see a histogram without
  waiting for bounded-HQ;
- adjust exposure and contrast, and confirm the histogram updates after the
  debounce while preview remains interactive;
- apply a resolved custom LUT and confirm the histogram reflects the LUT output
  path;
- activate a built-in style and confirm the histogram enters the defined
  unsupported state instead of showing stale processed bins as current.

Web platform references:

- MDN, "Using Web Workers":
  https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers
- MDN, "Transferable objects":
  https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects
- MDN, "SharedArrayBuffer":
  https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer

## Acceptance criteria

- The first decoded quick preview can produce a histogram without full-res
  export work.
- Bounded-HQ preview can replace the quick histogram when it becomes the active
  preview source.
- Tone and supported LUT changes update the histogram through the shared graph
  semantics after debounce.
- Unsupported pipelines fail closed in the histogram model.
- The feature does not use WebGL/Canvas readback.
- The feature does not allocate a full processed preview or export image for
  histogram computation.
- The default path does not clone or transfer the active preview input buffer.
- Any worker execution mode declares whether it copies, transfers, or shares the
  input buffer, and bounded-HQ copies are rejected unless an explicit memory
  budget allows them.
- Slider interaction and preview rendering remain responsive while histogram
  work is pending.

## Future work

Future export-side histograms should be accumulated inside the export strip
pipeline, one strip at a time, if the product needs authoritative full-resolution
clipping analysis. That would use the same row-band output values already being
encoded and would not require a second full-resolution pixel pass.

Future regional tone controls such as `Highlights`, `Shadows`, `Whites`, and
`Blacks` may use this histogram as UI context, but they should not depend on it
for automatic correction in their first implementation.
