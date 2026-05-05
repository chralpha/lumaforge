# Basic tone exposure and contrast design

Date: 2026-05-01

Related documents:

- [`2026-04-24-phase2-raw-color-pipeline-color-science-audit.md`](./2026-04-24-phase2-raw-color-pipeline-color-science-audit.md)
- [`2026-04-25-high-resolution-browser-export-design.md`](./2026-04-25-high-resolution-browser-export-design.md)
- [`2026-04-27-phase2-raw-render-exposure-implementation-plan.md`](../plans/2026-04-27-phase2-raw-render-exposure-implementation-plan.md)
- [`2026-04-28-raw-lab-ui-redesign-design.md`](./2026-04-28-raw-lab-ui-redesign-design.md)
- [`2026-04-30-luma-color-runtime-package-design.md`](./2026-04-30-luma-color-runtime-package-design.md)

## Goal

Add Lightroom-like Basic Tone controls for user-facing `Exposure` and
`Contrast` to RAW Lab while preserving LumaForge's current color-pipeline
contract:

```text
Linear ProPhoto RGB scene-linear
-> default RAW render exposure
-> user exposure
-> user contrast
-> LUT input gamut
-> LUT input transfer or log curve
-> 3D LUT
-> declared LUT output handling
-> Rec.709/sRGB photo output
```

The controls must be deterministic, browser-local, preview/export equivalent,
and cheap enough to run during interactive preview and full-resolution
row-band export. They are editing controls, separate from the existing
decode-time `raw-render-exposure` stage that normalizes RAW brightness.

## Scope

This spec covers:

- user-facing `Exposure` in EV/stops;
- user-facing `Contrast` around a fixed scene-linear mid-gray pivot;
- shared `@lumaforge/luma-color-runtime` parameter normalization, color graph
  steps, CPU row-band execution, and GLSL snippets;
- RAW Lab UI state, reset behavior, compare/original behavior, and export
  invalidation;
- performance expectations and acceptance tests for preview/export parity.

## Non-goals

- The original 2026-05-01 `Exposure` and `Contrast` phase did not implement
  `Highlights`, `Shadows`, `Whites`, or `Blacks`; the 2026-05-04 follow-up
  section below defines the narrower regional-tone implementation.
- Do not add local tone mapping, masks, histogram-dependent auto correction, or
  content-adaptive highlight recovery.
- Do not change default RAW render exposure selection, DNG baseline exposure
  handling, or the `DecodedImage.renderExposure` attachment point.
- Do not claim pixel equivalence with Lightroom Classic, Adobe Camera Raw,
  darktable, RawTherapee, or OpenColorIO.
- Do not route camera-log LUTs through `display sRGB -> LUT`.
- Do not make WebGL preview the source of truth for full-resolution export.
- Do not solve built-in style export support. If built-in styles remain
  unsupported by the export graph, tone controls do not make that pipeline
  exportable by themselves.
- Do not add tone values to share URLs in this phase. Current share URLs remain
  LUT-source sharing, not full edit-recipe sharing.

## External practice summary

The public references converge on a practical split between global tone controls
and region/clipping controls:

- Adobe Lightroom Classic Basic Tone uses `Exposure` for overall brightness in
  stop-like increments and `Contrast` mainly for midtones, while
  `Highlights`, `Shadows`, `Whites`, and `Blacks` have separate bright-area,
  dark-area, and clipping semantics. This spec follows the user mental model
  and naming only; it does not emulate Adobe's proprietary process version.
- darktable's scene-referred exposure module works by default in the linear
  scene-referred RAW part of the pipeline before the input color profile. This
  spec is inspired by that scene-linear placement, but it is not a darktable
  equivalent because LumaForge's handoff is already Linear ProPhoto rather than
  camera RGB.
- OpenColorIO exposes `ExposureContrastTransform` with exposure in stops,
  contrast around a pivot, and a default pivot of `0.18` for mid-gray. This
  spec uses the same parameter vocabulary and neutral values.
- RawTherapee documents both RGB-style contrast curves and luminance-based curve
  modes that better preserve color ratios. This spec uses a luminance-stable
  contrast scale instead of a per-channel RGB power curve so `Contrast` behaves
  more like a tone control than a saturation booster.

References:

- Adobe Lightroom Classic, "Work with image tone and color":
  https://helpx.adobe.com/lightroom-classic/help/image-tone-color.html
- darktable user manual, exposure module:
  https://darktable-org.github.io/dtdocs/en/module-reference/processing-modules/exposure/
- OpenColorIO 2.4 API, `ExposureContrastTransform`:
  https://opencolorio.readthedocs.io/en/v2.4.2/api/transforms.html#exposurecontrasttransform
- RawPedia, Exposure:
  https://rawpedia.rawtherapee.com/Exposure
- Colour Science for Python, ProPhoto RGB dataset:
  https://colour.readthedocs.io/en/v0.3.7/colour.models.dataset.prophoto_rgb.html
- docs.gl, GLSL ES `pow`:
  https://docs.gl/el3/pow

## Current system context

`@lumaforge/luma-raw-runtime` already returns processed RAW windows and preview
buffers in scene-linear `linear-prophoto-rgb` with camera white balance and the
camera matrix applied by the runtime. The app must not re-apply camera white
balance or a camera matrix when adding tone controls.

`@lumaforge/luma-color-runtime` currently owns `ProcessingParams`,
`resolveExportColorGraph`, `raw-render-exposure`, and the CPU row-band processor
used by full-resolution export. `ProcessingParams` currently contains look
intensity, view mode, compare split, style kind, and built-in preset only.

The current graph begins with:

```text
input-linear-prophoto
-> raw-render-exposure
```

For no-LUT export it then goes directly to `output-srgb`. For LUT export it
continues through gamut conversion, LUT input transfer, 3D LUT sampling, LUT
output handling, and `output-srgb`.

The preview shader already has a display-style helper named `adjustContrast`
for built-in presets. That helper is not sufficient for this feature because it
lives in preview-only code, operates after display conversion for built-in
styles, and has no CPU export equivalent. New user tone controls must live in
the shared color runtime and be executed by both preview and export.

## User controls

Add two persisted processing parameters owned by
`@lumaforge/luma-color-runtime`:

```ts
export interface LumaColorToneParams {
  userExposureEv: number
  userContrast: number
}
```

`ProcessingParams` should include these fields directly in the first
implementation, not behind an optional nested object, so existing atom updates
and partial parameter merges remain simple:

```ts
export interface LumaColorProcessingParams extends LumaColorToneParams {
  intensity: number
  viewMode: 'processed' | 'original' | 'compare'
  compareSplit: number
  styleKind: 'none' | 'builtin' | 'custom'
  builtinPreset: BuiltinStylePreset | null
}
```

Defaults:

```ts
userExposureEv: 0
userContrast: 0
```

UI ranges:

- `Exposure`: `-5.00` to `+5.00` EV, display with two decimals when typed and
  one decimal while dragging.
- `Contrast`: `-100` to `+100`, integer display, neutral `0`.

Runtime hard normalization:

- non-finite `userExposureEv` normalizes to `0`;
- `userExposureEv` clamps to `[-5, 5]`;
- non-finite `userContrast` normalizes to `0`;
- `userContrast` clamps to `[-100, 100]`.

The runtime may expose helpers such as `normalizeToneParams`,
`userExposureMultiplierFromEv`, and `contrastFactorFromAmount`; the graph and
executors must consume normalized values only.

## Math contract

Exposure is a pure EV gain. It does not clamp channels:

```text
exposed = scene * pow(2, userExposureEv)
```

The current RAW runtime produces non-negative `RGB16` Linear ProPhoto samples,
but the exposure operator must stay mathematically pure so future float inputs
or gamut-conversion edge cases are not silently clipped by exposure-only edits.

Contrast is a pivoted scene-linear luminance adjustment that preserves the
input RGB ratios by applying one shared scale to all three channels:

```text
contrastFactor = pow(2, userContrast / 200)
pivot = 0.18

if userContrast == 0:
  contrasted = exposed
else:
  contrastInput = max(exposed, 0)
  Y = dot(contrastInput, vec3(0.2880402, 0.7118741, 0.0000857))
  if Y <= 0:
    contrasted = vec3(0)
  else:
    targetY = pivot * pow(Y / pivot, contrastFactor)
    scale = targetY / Y
    contrasted = contrastInput * scale
```

Neutral values:

```text
userExposureEv = 0 -> multiplier = 1
userContrast = 0 -> contrastFactor = 1
```

Slider endpoints:

```text
userContrast = -100 -> contrastFactor ~= 0.7071
userContrast = +100 -> contrastFactor ~= 1.4142
```

This is OCIO-inspired rather than OCIO-identical:

- the parameter semantics match stops, neutral contrast `1`, and a fixed
  `0.18` pivot;
- gamma remains out of scope;
- log/video styles remain out of scope because LumaForge applies this operation
  in scene-linear Linear ProPhoto before LUT input encoding;
- `contrastFactor` is intentionally more conservative than `pow(2, amount /
  100)` because the operation happens in scene-linear space and `+100` should
  not explode highlights before the LUT input transform;
- `pow` only receives non-negative luminance values, avoiding GLSL undefined
  behavior for negative bases;
- the neutral branch must be keyed by normalized `userContrast === 0`, not a
  fragile floating-point comparison against the derived `contrastFactor`;
- the zero-luminance branch is only for exact black after contrast input
  clipping. There is no `epsilon` branch in the tone shape because near-black
  positive luminance must remain continuous, especially for negative contrast.

This contrast operator is not a per-channel RGB curve. It is designed to be
luminance-stable: colors with the same RGB ratio receive the same scalar gain.
It still is not a fully perceptual or hue-locked color appearance model. Later
gamut conversion, transfer encoding, LUT domain clamping, LUT sampling, and
final sRGB clipping can still change saturation or hue, and those downstream
effects must be parity-tested.

User contrast is defined only for non-negative scene-linear RGB. Exposure-only
edits preserve finite negative channels if a future float path introduces them,
but non-neutral contrast clips negative channels at contrast entry before
luminance and `pow` evaluation.

The operation is intentionally global and content-independent. It must not read
histograms, auto-pick mid-gray, vary per export strip, or depend on neighboring
pixels. This keeps full-resolution strip export seam-free and deterministic.

## Color graph

Extend `ExportColorGraphStep` with explicit user tone steps:

```ts
| {
    kind: 'user-exposure'
    ev: number
    multiplier: number
  }
| {
    kind: 'user-contrast'
    amount: number
    factor: number
    pivot: number
    operator: 'linear-prophoto-luminance-scale'
    luminanceCoefficients: [number, number, number]
    zeroLuminanceMode: 'return-black'
  }
```

The supported no-LUT graph becomes:

```text
input-linear-prophoto
-> raw-render-exposure
-> user-exposure
-> user-contrast
-> output-srgb
```

The supported LUT graph becomes:

```text
input-linear-prophoto
-> raw-render-exposure
-> user-exposure
-> user-contrast
-> gamut-to-lut-input
-> encode-lut-transfer
-> lut3d
-> lut-output-to-srgb
-> output-srgb
```

The descriptor should include identity tone steps even when the values are
neutral. Compiled CPU and GLSL executors must fold neutral exposure and neutral
contrast to no-ops so default edits do not add measurable work.

`raw-render-exposure` remains a separate graph step. Do not overload it with
user edits even though `RawRenderExposureSource` currently includes `user`.
Default render exposure is a decode/session fact; user exposure is an edit.

## Preview behavior

Preview must execute the same tone order as export:

```text
technicalBaseScene = inputLinearProPhoto * rawRenderExposureMultiplier
editedBaseScene = applyUserContrast(applyUserExposure(technicalBaseScene))
```

For processed view:

- no style or LUT: display `editedBaseScene`;
- built-in style: run the existing built-in style from the edited base;
- custom LUT: feed `editedBaseScene` into the existing LUT role path.

For style/LUT strength mixing, the base side of the mix must be the edited base,
not the raw-only base. Changing look strength must not remove user exposure or
contrast.

For original view:

- display `technicalBaseScene` converted to sRGB;
- exclude user exposure, user contrast, built-in styles, custom LUTs, and look
  strength.

For compare view:

- left side: original view semantics;
- right side: processed view semantics.

This preserves the current compare contract: the "original" side is the same
RAW technical-development foundation, not a camera JPEG and not minimally
processed sensor data.

Slider changes must update uniforms and re-render the current preview. They must
not re-open the RAW session, re-decode quick/HQ previews, re-upload the input
texture, or re-upload the LUT texture.

## Full-resolution export behavior

Full-resolution export must use the same graph descriptor as preview. The export
worker passes normalized tone params into `resolveExportColorGraph` along with
style, LUT, intensity, and decoded `rawRenderExposure`.

No-LUT exports with tone controls are supported:

```text
RGB16 Linear ProPhoto rows
-> raw-render-exposure
-> user-exposure
-> user-contrast
-> Linear ProPhoto to Rec.709/sRGB
-> JPEG RGB8 rows
```

Custom LUT exports with tone controls are supported only when the existing LUT
contract is already exportable. Tone controls must not relax unknown or
unsupported LUT output rules.

After user tone, LUT input values must follow the existing LUT input gamut,
transfer, signal-range, and domain normalization policy. Tone controls must not
introduce a second hidden clamp before LUT sampling. If the shared LUT executor
clips or normalizes encoded LUT coordinates to the LUT domain, preview and
export must do so through the same runtime-owned helper and tests.

Built-in style exports remain unsupported until the color runtime owns a CPU
implementation of built-in styles. If a built-in style is active, export should
continue to fail closed with the existing unsupported-pipeline message even when
exposure or contrast are non-neutral.

Export result invalidation must include changes to `userExposureEv` and
`userContrast`. A previously generated JPEG is stale after either value changes.

## UI behavior

Add a `Tone` section to the RAW tools surface before style `Strength`:

```text
Tone
Exposure  [-5.0 ........ 0.0 ........ +5.0]
Contrast  [-100 ........ 0 ........ +100]
Reset tone
```

Behavior:

- controls are disabled until an image is available and the processor is not in
  a blocking load/decode/export state;
- `Reset tone` sets only `userExposureEv` and `userContrast` to neutral;
- global session reset keeps existing `resetToDefaults` semantics and also
  resets both tone params;
- clearing a LUT or changing style does not reset tone;
- compare reset does not reset tone;
- uploading a new image preserves tone, matching the current "keep processing
  params" behavior, unless the user explicitly chooses global reset.

The UI labels should be conservative:

- `Exposure` value suffix: `EV`;
- `Contrast` value suffix: none;
- tooltip or helper copy: "Applies before LUT conversion and full-resolution
  export."
- compare/original tooltip copy: "Original shows the technical RAW base render
  before user tone, style, and LUT."
- when a new image is loaded while tone params are non-neutral, the tool surface
  should show lightweight state text such as "Tone settings preserved" near
  `Reset tone`.

## Performance budget

Exposure is cheap: three multiplications per pixel and no additional buffers.

Contrast adds one luminance calculation, one `pow`, one division, and three
channel multiplies per pixel when non-neutral. This is the only meaningful
performance risk in the phase. The implementation must therefore:

- compile identity tone to no-op work for default values;
- skip the contrast math entirely when `userContrast === 0`;
- keep the row-band processor's existing reusable `Float32Array` and
  `Uint8Array` scratch buffers;
- add no full-frame CPU, GPU, Canvas, ImageData, or readback surfaces;
- keep slider changes to uniform updates and a render pass only;
- record export color-stage metrics before and after enabling non-neutral tone.

If exact `pow` contrast fails the export budget, optimize inside
`@lumaforge/luma-color-runtime` instead of weakening preview/export parity. The
allowed optimization path is:

- build a package-owned 1D contrast scale table over
  `log2(Y / contrastPivot)`, not linear `Y`, and interpolate it in the CPU
  row-band executor;
- use exact formula behavior for `Y <= 0`;
- use a first implementation domain of `[-24, 12]` in `log2(Y / 0.18)`, which
  covers approximately `1.07e-8 <= Y <= 737`;
- outside the table domain, use the exact formula instead of clamping to the
  table edge, so the approximation never becomes a hidden shadow or highlight
  tone policy;
- keep the exact formula as the test oracle;
- require absolute linear-RGB error `<= 1 / 1024` for outputs in `[0, 1]` and
  relative error `<= 0.5%` for larger finite outputs;
- cover exact GLSL mode and approximate CPU mode with shared golden samples
  below the near-black table range, around black, around the `0.18` pivot, in
  `[0, 1]`, and above `1` for HDR scene-linear values;
- document the approximation mode in export telemetry if it ships.

Acceptance budget:

- neutral tone produces no measurable regression beyond normal run-to-run noise
  in preview render and export color-stage metrics;
- non-neutral exposure alone should be effectively absorbed into the existing
  per-pixel multiply path;
- non-neutral contrast may increase CPU color-stage time, but must not increase
  peak row-band memory beyond the existing scratch-buffer size;
- if a real 100MP-class no-LUT export shows contrast increasing color-stage
  time by more than `25%` over the same export with neutral contrast, optimize
  the package-owned contrast executor before merging rather than moving
  contrast into preview-only shader code.

## Failure handling

Invalid tone params must normalize to defaults before graph resolution. They
must not make the graph unsupported and must not produce `NaN`, `Infinity`, or
negative final encoded values.

Unsupported export state remains fail-closed only for unsupported source,
unsupported LUT/profile pipeline, missing raw render exposure, missing JPEG
encoder, or resource failure. User exposure and contrast are not optional
preview-only features; export must not silently omit them.

If preview and export disagree about tone support, the implementation is
incorrect. The UI should not expose an editable tone control whose effect cannot
be exported through the authoritative graph.

## Tests and acceptance

Color runtime unit tests:

- `normalizeToneParams` returns neutral values for missing, `NaN`, and
  infinities;
- exposure maps `+1 EV` to multiplier `2` and `-1 EV` to multiplier `0.5`;
- exposure-only edits preserve negative finite channels if such float inputs
  reach the operator;
- non-neutral contrast clips negative channels at contrast entry and never
  feeds a negative value to `pow`;
- contrast maps `-100`, `0`, `+100` to factors `sqrt(0.5)`, `1`, and
  `sqrt(2)`;
- neutral tone is bit-identical to the pre-tone graph for synthetic CPU samples
  where the old graph was deterministic, or within a strict documented
  tolerance where float/GPU precision prevents bit identity;
- contrast leaves black, `0.18` luminance, and neutral params stable as
  expected;
- near-black tests cover `Y = 0`, `1e-8`, `1e-6`, and `1e-4` for `-100`,
  `-50`, `+50`, and `+100`, asserting monotonicity, continuity, and CPU/GLSL
  parity;
- contrast preserves RGB ratios for positive finite samples before downstream
  gamut conversion, LUT domain handling, and output clipping;
- CPU and GLSL sample values match within a documented tolerance for a matrix of
  exposure and contrast values;
- grayscale ramp visual/golden tests cover `-100`, `-50`, `+50`, and `+100` so
  the contrast mapping can be judged before implementation is accepted;
- saturated-color golden tests cover saturated red, saturated green, saturated
  blue, sky blue, skin tone, foliage green, cyan, magenta, and a neon-like
  patch. These tests must document expected luminance-model behavior rather than
  pretending the operator is perceptual.

Color graph tests:

- no-LUT graph includes `user-exposure` and `user-contrast` between
  `raw-render-exposure` and `output-srgb`;
- LUT graph includes tone steps before LUT input gamut and transfer encoding;
- unresolved LUTs still fail closed;
- built-in styles still return unsupported export graphs;
- non-neutral tone plus an active built-in style still reports built-in style
  export unsupported, not a tone-control export failure;
- sanitized invalid params never alter support status.

Row-band export tests:

- no-LUT export output changes when exposure changes;
- no-LUT export output changes when contrast changes;
- custom LUT export receives tone-adjusted scene values before LUT input
  encoding;
- row-band output is identical for one full band and multiple smaller bands on
  the same synthetic input.

Preview tests:

- shaders declare tone uniforms or include shared tone GLSL snippets from
  `@lumaforge/luma-color-runtime`;
- tone preview shaders use `precision highp float`; capability detection must
  fail closed for tone-enabled preview if fragment highp precision is not
  available or reports unusable precision, rather than silently falling back to
  mediump tone math;
- `setParams({ userExposureEv })` and `setParams({ userContrast })` re-render
  without re-uploading the input texture or LUT texture;
- processed view includes tone;
- original view excludes tone;
- compare left excludes tone and compare right includes tone.

Hook/UI tests:

- default params include neutral tone;
- old processing params or persisted state without `userExposureEv` and
  `userContrast` migrate to neutral tone without changing existing style,
  intensity, view mode, or compare split;
- `changesRenderGraphParams` invalidates export results on tone changes;
- `Reset tone` resets only tone;
- global reset resets tone along with existing defaults;
- new image upload preserves tone unless global reset is invoked.

Browser smoke:

- load a RAW fixture, change exposure, change contrast, and confirm visible
  preview updates without a decode restart;
- export the same edit and confirm the exported JPEG visibly matches the
  processed preview within the expected preview/export tolerance;
- repeat with an exportable custom LUT and confirm tone affects the LUT input,
  not only the display output.

## Follow-up: Highlights, Shadows, Whites, Blacks

This follow-up closes the previous future memo with a bounded regional-tone
implementation. The controls follow the Basic panel mental model but do not
claim Lightroom or Camera Raw pixel equivalence.

Additional external practice:

- Adobe documents `Highlights` and `Shadows` as bright-area and dark-area
  controls, while `Whites` and `Blacks` affect white and black clipping
  semantics. Adobe also recommends watching the histogram and clipping
  previews when changing endpoint sliders.
- darktable's tone equalizer and RawTherapee's Shadows/Highlights show the
  high-end direction for regional tone: tone masks, guided or edge-aware
  filtering, and local-contrast preservation. Those designs are image-context
  dependent and introduce radius/filter state.
- OpenColorIO keeps the 0.18 mid-gray pivot expressed in linear light. The
  follow-up keeps the same scene-linear reference for Basic Tone instead of
  moving the controls after display conversion.

References:

- Adobe Lightroom Classic, "Work with image tone and color":
  https://helpx.adobe.com/lightroom-classic/help/image-tone-color.html
- darktable user manual, tone equalizer:
  https://docs.darktable.org/usermanual/development/en/module-reference/processing-modules/tone-equalizer/
- RawPedia, Shadows/Highlights:
  https://rawpedia.rawtherapee.com/Shadows/Highlights

### Best-practice decision

Implement this phase as deterministic per-pixel regional luminance scaling in
scene-linear Linear ProPhoto, after `user-contrast` and before LUT input
conversion:

```text
input-linear-prophoto
-> raw-render-exposure
-> user-exposure
-> user-contrast
-> user-regional-tone
-> LUT input or output-srgb
```

Do not implement guided filters, radius controls, local adaptation, histogram
auto-points, hard clipping, or highlight recovery in this phase. Those can look
better in a desktop editor, but they either need neighboring pixels or a
defined strip-safe dependency model. LumaForge's full-resolution export must
remain row-band safe, seam-free, and preview/export equivalent.

`Whites` and `Blacks` therefore ship as soft endpoint-region controls, not hard
levels. They increase or decrease luminance near the white and black ends and
let the existing histogram/clipping readout show the result. They must not hide
a pre-LUT clamp or silently map scene values to pure white or pure black.

### Regional params

Extend `LumaColorToneParams` and `ProcessingParams`:

```ts
export interface LumaColorToneParams {
  userExposureEv: number
  userContrast: number
  userHighlights: number
  userShadows: number
  userWhites: number
  userBlacks: number
}
```

Defaults:

```text
userHighlights = 0
userShadows = 0
userWhites = 0
userBlacks = 0
```

UI and runtime range for all four regional sliders is `[-100, 100]`, integer
step, with non-finite input normalizing to `0`.

### Regional math

The operator computes luminance from non-negative scene-linear Linear ProPhoto,
derives a log2 luminance coordinate around 18% gray, blends four smooth masks,
then applies one RGB scale so positive-channel ratios remain stable before
downstream gamut, LUT-domain, and output clipping:

```text
Y = dot(max(rgb, 0), LinearProPhotoLuminance)
x = log2(Y / 0.18)

highlightsMask = smoothstep(-1, 3, x)
shadowsMask = 1 - smoothstep(-4, 1, x)
whitesMask = smoothstep(2, 5.5, x)
blacksMask = 1 - smoothstep(-8, -3, x)

regionalEv =
  highlightsMask * userHighlights / 100 * 1.25 +
  shadowsMask * userShadows / 100 * 1.25 +
  whitesMask * userWhites / 100 * 1.0 +
  blacksMask * userBlacks / 100 * 1.0

output = rgb * pow(2, regionalEv)
```

If all four regional sliders are neutral, the operator is an exact no-op,
including for finite negative channels. If any regional slider is non-neutral,
negative channels are clipped at regional-tone entry before luminance and log
evaluation, matching the existing non-neutral contrast safety rule.

The mask ranges are intentionally broad enough to keep one-slider endpoint
curves monotonic over the supported scene-linear range. The operator is global
and content-independent; it must not depend on neighboring pixels, export strip
height, or a histogram pass.

### UI and invalidation

The RAW Lab `Tone` section now contains:

```text
Exposure
Contrast
Highlights
Shadows
Whites
Blacks
Reset tone
```

`Reset tone` resets all six tone params. Uploading a new image preserves all six
tone params unless the user invokes the global reset. Any change to a regional
slider invalidates an existing export result and recomputes the preview
histogram through the shared graph. Original and compare-left views remain the
technical RAW base before user tone, style, and LUT.

### Follow-up acceptance

- Shared color-runtime tests cover normalization, bright/dark targeting,
  endpoint targeting, negative-channel safety, monotonic grayscale ramps, RGB
  ratio stability, CPU row-band execution, histogram processing, and graph
  ordering.
- GLSL preview uses the same regional masks and receives four regional tone
  uniforms.
- Full-resolution export receives regional tone through the same graph before
  LUT input conversion.
- UI/hook tests cover rendering, disabling, partial updates, reset behavior,
  export invalidation, preserved tone on new image load, and histogram key
  recomputation.
