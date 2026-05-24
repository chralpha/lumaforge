# Dual-layer preview compare design

Date: 2026-05-23

Status: Best-practice consensus for the next `/raw` preview refactor.

Related documents:

- [`2026-04-25-high-resolution-browser-export-design.md`](./2026-04-25-high-resolution-browser-export-design.md)
- [`2026-04-28-raw-lab-ui-redesign-design.md`](./2026-04-28-raw-lab-ui-redesign-design.md)
- [`2026-04-29-bounded-preview-pipeline-implementation-plan.md`](../plans/2026-04-29-bounded-preview-pipeline-implementation-plan.md)
- [`2026-05-01-ios-safari-100mp-export-compatibility-design.md`](./2026-05-01-ios-safari-100mp-export-compatibility-design.md)

## Goal

Make compare split, zoom, and pan responsive inside the preview scene while
keeping HQ preview compatibility explicit. The preferred design is a
capability-gated dual-WebGL compare: one original WebGL layer on the left and
one processed WebGL layer on the right, both moved by CSS. A bounded JPEG
original layer is the compatibility fallback when the device should not keep two
live preview pipelines.

This document is scoped to the preview scene. Full-resolution export already
releases preview before its highest memory phase and remains the authoritative
output path.

## Decision summary

Use a layered DOM/CSS viewer with two render modes:

```text
preferred mode:
active bounded preview pixels
-> original RawProcessingPipeline
-> <canvas> original left layer

active bounded preview pixels
-> processed RawProcessingPipeline
-> <canvas> processed right layer

fallback mode:
active bounded preview pixels
-> one-time original-reference JPEG snapshot
-> <img> original left layer

active bounded preview pixels
-> processed RawProcessingPipeline
-> <canvas> processed right layer

shared viewer state
-> CSS split, zoom, and pan variables
```

The preferred left original layer is rendered by a second WebGL preview pipeline
only when the capability policy says the device can retain two live preview
pipelines. That layer renders technical-base RAW and then remains visually
static until the source preview asset changes.

The fallback left original layer is a bounded JPEG snapshot generated once per
source/display-preview version and then treated as an image asset. It does not
own a persistent WebGL context, shader program, FBO, or RAW runtime session.

The current single-canvas shader compare path is not a fallback target for this
refactor. If dual-WebGL compare is not safe, use the JPEG left-layer fallback.
If the JPEG fallback also cannot be created or retained safely, show
processed-only preview with explicit compare-unavailable diagnostics.

## Research inputs

- Squoosh local reference:
  - `/workspaces/LumaForge/squoosh/src/client/lazy-app/Compress/Output/custom-els/TwoUp/index.ts`
  - `/workspaces/LumaForge/squoosh/src/client/lazy-app/Compress/Output/custom-els/TwoUp/styles.css`
  - `/workspaces/LumaForge/squoosh/src/client/lazy-app/Compress/Output/custom-els/PinchZoom/index.ts`
- Browser API references refreshed on 2026-05-23:
  - MDN WebGL best practices: delete GPU objects eagerly, lose finished
    contexts eagerly, and avoid blocking GPU readback patterns.
  - MDN `WEBGL_lose_context`: explicit context release is available as a WebGL
    extension.
  - MDN `clip-path`, `transform`, and `will-change`: the viewer can express
    split and pan/zoom through compositor-friendly CSS, but `will-change`
    should be scoped to active interaction rather than left on permanently.
  - MDN `HTMLCanvasElement.toBlob()`, `OffscreenCanvas.convertToBlob()`,
    `createImageBitmap()`, and `ImageBitmap.close()`: snapshot outputs should
    prefer object URLs or closeable bitmap resources over retained JS pixel
    arrays.

Squoosh is useful for the interaction shape, not for copying its rendering
model. Squoosh compares two regular image/canvas surfaces. LumaForge must keep
RAW decode, LUT contracts, bounded HQ, and export separation intact.

## Current state

The current loaded compare path is a single WebGL canvas. The shader receives
`viewMode = compare` and `compareSplit`, then mixes technical-base display color
on the left with processed display color on the right.

This has two good properties:

- it avoids a second RAW decode;
- it avoids two persistent WebGL preview canvases.

The cost is that split alignment is coupled to shader texture coordinates. When
zoom or pan changes, the preview compensates the shader split through
`getCanvasCompareSplit(...)` and re-renders the WebGL pipeline. That makes
high-frequency viewer interaction compete with the same WebGL resources used
for style/LUT rendering.

The design keeps the "one decoded preview source" property and removes the
"viewer motion requires shader compare updates" property. It replaces shader
compare with layered compare: either two capability-gated WebGL layers or one
processed WebGL layer plus one JPEG original fallback layer.

## Compare semantics

The left side remains `Unprocessed RAW`.

For this refactor, that means:

- the same active decoded preview source used by the processed preview;
- deterministic RAW render exposure applied;
- the technical base display transform;
- no user tone controls;
- no built-in style;
- no custom LUT;
- no intensity blend.

This matches the current shader's `technicalBaseDisplayColor` branch. It is not
the camera embedded JPEG and not minimally processed sensor data.

The right side remains `Final JPEG`.

For preview, that means the active processed preview rendering of the selected
style/LUT/tone intent. Export can still differ numerically because export uses a
CPU/WASM strip executor, but preview and export must continue to derive the same
color graph descriptor where the pipeline is exportable.

## Original-reference JPEG fallback

JPEG is not the preferred compare path. It is the fallback used when capability
policy, WebGL context pressure, or runtime failures make a persistent left
original WebGL layer unsafe.

Add an explicit `OriginalReferenceSnapshot` resource:

```ts
export type OriginalReferenceSnapshot = {
  key: string
  objectUrl: string
  width: number
  height: number
  source: 'quick' | 'bounded-hq'
  mimeType: 'image/jpeg'
  estimatedBytes: number
}
```

The snapshot key must include only facts that change the left technical-base
image:

- session/source id or file fingerprint;
- active decoded preview source, `quick` or `bounded-hq`;
- active decoded preview dimensions;
- decoded preview image version;
- render-exposure identity;
- preview orientation/geometry facts if they become explicit in the app model;
- snapshot policy version.

The snapshot key must not include:

- compare split;
- zoom or pan;
- selected look;
- LUT payload or LUT contract;
- intensity;
- user tone controls, while the left side remains the technical base.

When the viewer chooses JPEG fallback and quick preview becomes ready, the app
may generate a quick snapshot and show compare immediately. If bounded HQ later
becomes ready, it should build the HQ snapshot in the background and atomically
swap it in only after the new image is decoded. The quick snapshot remains
visible during that upgrade.

## Snapshot generation strategy

Preferred generation is:

```text
DecodedImage
-> temporary or reusable hidden original renderer
-> render original technical base at capped snapshot dimensions
-> JPEG Blob
-> object URL
-> revoke previous snapshot URL
-> dispose temporary WebGL resources and lose the temporary context
```

The generation renderer may use the existing `RawProcessingPipeline` shader
logic with original params because that preserves the current color semantics.
It must not remain mounted as a second live preview pipeline after the snapshot
is produced.

The snapshot pixel budget is separate from bounded HQ decode policy:

| Environment policy          |     Snapshot cap | Rationale                                                          |
| --------------------------- | ---------------: | ------------------------------------------------------------------ |
| WebKit mobile or no pthread | `2.5MP` to `4MP` | Keep image memory bounded and favor interaction survival.          |
| Mobile-balanced             |   `4MP` to `6MP` | Better pinch detail without competing with export-scale resources. |
| Desktop-fast                |   `6MP` to `8MP` | Preserve zoom quality while staying below bounded HQ defaults.     |

The cap must never exceed the active decoded preview dimensions. A quick preview
source therefore cannot produce an oversized original snapshot.

Use JPEG object URLs for V1. They keep the retained JS object small, can be
revoked through the existing resource lifecycle, and are simple to display in an
`<img>`. `ImageBitmap` can be added later if browser measurements show a real
win, but then every bitmap must call `close()` on cleanup.

## Viewer architecture

The loaded preview surface becomes layered:

```text
PreviewCanvas
-> frame: owns pointer, wheel, double-click, touch-action; overflow:hidden
   -> track: aspect-fit box, CSS transformed by zoom/pan
      -> surface: layout-only stacking parent
         -> OriginalWebglLayer <canvas> OR OriginalReferenceLayer <img>
         -> processed <canvas>
   -> split handle: viewport-space control, anchored to track bounds
```

The track itself owns the zoom/pan transform so the scaled photo can extend
into the surrounding empty frame space (the frame's `overflow: hidden` clips
the scaled track at the viewport edge). Mounting the transform on the track
rather than on individual layers keeps both image layers and the compare clip
in perfect alignment without per-layer compensation:

```css
.raw-preview-track {
  transform: translate3d(var(--raw-preview-pan-x), var(--raw-preview-pan-y), 0)
    scale(var(--raw-preview-zoom));
}
```

The compare split is a CSS variable owned by the frame or track:

```css
.raw-preview-original-layer {
  clip-path: inset(0 calc(100% - var(--raw-compare-split)) 0 0);
}

.raw-preview-processed-layer {
  clip-path: inset(0 0 0 var(--raw-compare-split));
}
```

The split handle lives in viewport space (a sibling of the preview frame) so
it stays easy to drag at high zoom. Its vertical extent is bound to the live
image-track rect via `--raw-compare-track-top` and `--raw-compare-track-height`
so the visible compare line spans exactly the photo area — not the empty
letterbox gutters above or below.

`will-change: transform` and `will-change: clip-path` should be applied only
while pointer, wheel, or touch interaction is active. Keeping both enabled
permanently can pin extra compositor memory on the devices this refactor is
trying to protect.

## WebGL compatibility boundary

The compatibility rule is strict:

```text
Allowed:
  two live WebGL preview pipelines when capability policy allows dual-webgl
  one live processed WebGL preview pipeline plus JPEG fallback otherwise
  zero or one short-lived hidden WebGL renderer during JPEG fallback creation
  explicit disposal of temporary textures/FBOs/programs/context

Forbidden:
  two persistent WebGL preview canvases when capability policy selects fallback
  a full-resolution original snapshot
  snapshot generation that blocks quick-preview interactivity
  fallback to the current single-canvas shader compare path
```

This boundary balances compatibility and interaction:

- devices that support the current WebGL2 preview can keep the current processed
  pipeline;
- dual-WebGL-capable devices keep original and processed preview surfaces sharp
  without shader split updates during viewer motion;
- WebKit mobile and other constrained devices avoid persistent double-context
  pressure by selecting the JPEG fallback;
- JPEG fallback failure degrades to processed-only preview with compare disabled
  and does not weaken export.

## Fallback ladder

Use this ordered ladder:

1. Dual-WebGL CSS-layer compare: original WebGL canvas plus processed WebGL
   canvas, only when capability policy allows two live preview pipelines.
2. JPEG-left CSS-layer compare: original JPEG snapshot plus processed WebGL
   canvas, when dual-WebGL compare is not safe or left WebGL initialization
   fails.
3. Processed-only preview with explicit compare-unavailable diagnostics, when
   WebGL works but neither layered compare mode can be safely shown.
4. Embedded/quick non-WebGL messaging, when WebGL2 itself is unavailable.

The current single-canvas WebGL compare shader is intentionally absent from the
fallback ladder. Keeping it as a second fallback would preserve the split/zoom
render coupling this refactor is meant to remove and would make capability
behavior harder to reason about.

The fallback decision is local to preview. It must not enable or disable
full-resolution export except through existing capability and export-readiness
rules.

## Resource ownership

Register the original snapshot with the existing large-resource registry:

```text
owner: preview
kind: object-url
estimatedBytes: jpegBlob.size
dispose: URL.revokeObjectURL(objectUrl)
```

The app should keep only one original snapshot alive for the active session.
During quick-to-bounded-HQ upgrade, keep the old snapshot until the new one is
ready, then revoke the old URL immediately.

Pre-export evacuation already disposes `preview` and `webgl` owners. The
snapshot must participate in that path. Export is not allowed to retain the
snapshot as a comfort image during the low-memory export handoff unless the
export policy explicitly permits a small non-preview placeholder.

## Invalidation and lifecycle

Create or refresh the snapshot when:

- a new RAW file/session is loaded;
- quick preview becomes the first editable preview source;
- bounded HQ replaces quick as the display source;
- the left technical-base semantics change in a future feature;
- the snapshot policy changes after capability detection.

Do not refresh the snapshot when:

- split changes;
- zoom or pan changes;
- selected built-in look changes;
- custom LUT changes;
- intensity changes;
- export progress changes.

On reset, file replacement, preview suspension, or unmount, revoke the object
URL and clear any in-flight snapshot job.

## Interaction behavior

Split, zoom, and pan should update CSS variables on the preview frame during
active movement and commit the stable session state on release or at a bounded
`requestAnimationFrame` cadence. React state should remain the source of truth
for committed view state, but high-frequency movement does not need a React
render for every event.

Processed WebGL re-render triggers become:

- source preview image upload;
- LUT upload or clear;
- processing params that affect the right side;
- canvas resize;
- WebGL context recovery.

Processed WebGL re-render triggers must not include:

- split drag while the original snapshot is active;
- pan while the original snapshot is active;
- zoom while the original snapshot is active.

## Memory expectations

This design does not make the processed WebGL path free. The right side still
needs the active preview texture and processing FBO. The benefit is avoiding a
second persistent preview pipeline and avoiding reprocessing the preview during
viewer-only interaction.

Approximate retained preview resources at `12MP`:

- current single processed WebGL: one input texture plus one processed target;
- preferred dual-WebGL design: two preview pipelines, gated to devices with
  enough context and texture headroom;
- JPEG fallback design: one processed WebGL path plus one capped JPEG object URL
  and browser-decoded image surface.

The JPEG/object URL layer still costs memory after decode. That is why the
snapshot has its own cap, joins preview evacuation, and does not stay alive
through export.

## Testing and acceptance

Unit tests should prove:

- the snapshot key changes for source/image/render-exposure/display-source
  changes;
- the snapshot key ignores split, zoom, pan, style, LUT, intensity, and user
  tone;
- old object URLs are revoked on replacement and unmount;
- failed dual-WebGL selection reports a structured fallback reason before JPEG
  fallback is attempted;
- failed JPEG fallback generation reports a structured compare-unavailable
  reason;
- pre-export evacuation disposes the snapshot through the `preview` owner.

Component tests should prove:

- loaded compare renders an original WebGL canvas and one processed WebGL canvas
  when dual-WebGL mode is selected;
- loaded compare renders an original image layer and one processed canvas when
  JPEG fallback is selected;
- the processed pipeline receives processed-only params while CSS split is
  active;
- split/zoom/pan updates do not call `RawProcessingPipeline.render()` when no
  right-side visual params changed;
- no fallback test expects the existing shader compare path;
- quick-to-bounded-HQ upgrade swaps snapshots without resetting split, zoom, or
  pan.

Browser validation should cover:

- desktop Chromium at `1440x900`;
- mobile-sized Chromium at about `390x844`;
- Playwright WebKit where available in the Linux environment;
- real RAW upload through the existing same-origin fetch/drop path;
- split drag, wheel zoom, touch/pointer pan, and double-click reset;
- visual pixel checks that both sides move together under CSS transform;
- telemetry or test instrumentation showing no WebGL render loop during pure
  split dragging.

Acceptance criteria:

- Dual-WebGL CSS-layer compare is the default loaded preview path when
  capability policy allows two live preview pipelines.
- JPEG-left CSS-layer compare is the fallback loaded preview path when
  dual-WebGL compare is not safe.
- Single-canvas shader compare is not used as a fallback.
- The fallback left original snapshot is bounded, revocable, and released during
  preview evacuation.
- Split, zoom, and pan stay visually synchronized across both layers.
- Viewer-only interaction does not trigger processed WebGL renders.
- JPEG fallback failure disables compare and keeps processed-only preview
  without changing export behavior.
- Export remains authoritative, full-resolution, and fail-closed.

## Deferred scope

- Full-resolution original snapshots.
- User-adjustable left-side exposure or white balance.
- A persistent original WebGL layer.
- WebGPU preview rendering.
- Exporting from the preview snapshot.
- Multi-image compare or catalog behavior.
