# Selective color HSL MVP design

Date: 2026-06-14

Related documents:

- [`2026-04-22-phase1-browser-raw-mvp-design.md`](./2026-04-22-phase1-browser-raw-mvp-design.md)
- [`2026-04-24-phase2-raw-color-pipeline-color-science-audit.md`](./2026-04-24-phase2-raw-color-pipeline-color-science-audit.md)
- [`2026-04-30-luma-color-runtime-package-design.md`](./2026-04-30-luma-color-runtime-package-design.md)
- [`2026-05-01-basic-tone-exposure-contrast-design.md`](./2026-05-01-basic-tone-exposure-contrast-design.md)
- [`2026-05-31-relative-temperature-tint-adjust-design.md`](./2026-05-31-relative-temperature-tint-adjust-design.md)
- [`2026-06-13-dcp-via-libraw-lcms2-design.md`](./2026-06-13-dcp-via-libraw-lcms2-design.md)

## Goal

Add a selective-color HSL adjustment to RAW Lab as a third subpanel of `Adjust`,
sitting beside the existing `Tone` and `Color` subpanels. The control lets the
photographer shift the hue, saturation, and lightness of eight named hue bands
(red, orange, yellow, green, aqua, blue, purple, magenta) independently, with
preview and export reproducing identically through the same color graph.

The processing model must keep selective color separate from tone and color
balance, run in a perceptually uniform space (OKLab/OKLCh) at the scene-referred
stage of the pipeline, and avoid hue cross-talk that the legacy LCh-based
designs are known for.

## Scope

This spec covers:

- a fixed eight-band HSL panel with per-band `hue`, `saturation`, and `lightness`
  shifts in OKLCh;
- a `user-selective-color` step inserted after `user-regional-tone` and before
  any LUT input conversion in the shared color graph;
- OKLab/OKLCh primitives in `@lumaforge/luma-color-runtime` (forward, inverse,
  and GLSL helpers), built fresh — no Oklab helpers ship in the runtime today;
- a 256-entry 1D LUT bake pipeline in `@lumaforge/luma-color-runtime` that
  packs the 24 user scalars into one hue-indexed RGBA lookup table
  (R = `hueShift`, G = `satMul`, B = `lightAdd`, A reserved), written into
  a caller-owned `Float32Array(1024)` out-buffer;
- a chroma-attenuation clamp inside the package's apply function that
  protects near-achromatic pixels from amplified hue noise;
- WebGL2 preview shader integration in `src/lib/gl`, where `src/` owns
  uniform binding, texture upload, and the shader template, and consumes
  the OKLab plus selective-color GLSL helpers from the package's `glsl.ts`;
- CPU row-band parity in `@lumaforge/luma-color-runtime` for export, sharing
  the same apply function with any future CLI/headless consumer;
- full-resolution export, preview histogram, and export-result invalidation;
- desktop and mobile RAW Lab surface changes needed to expose the controls.

## Non-goals

- Do not ship a Split Toning or Color Grading three-way panel. That is a
  separate feature with a different insertion point (display-referred,
  post-tone) and a different parameter shape; it will live in its own spec.
- Do not expose user-tunable band centers, band widths, or smoothness sliders.
  Eight fixed centers cover the Lightroom/Capture One Basic mental model and
  the 24 scalars are already the parameter budget.
- Do not ship a Capture One Advanced-style 3D local hue/sat/lum selection. The
  product boundary excludes per-region/local adjustments.
- Do not ship a dedicated Skin Tone tab. The standard orange band plus the
  chroma-attenuation clamp covers the common case for v1.
- Do not ship a guided filter on the OKLCh selection weights. The combination
  of OKLab uniformity, smoothstep fall-off, and chroma clamp is intended to
  avoid the LCh-style cross-talk artifacts without a neighborhood pass.
- Do not add a WebGPU or WASM-SIMD-threaded backend for selective color.
  Preview continues to use the existing WebGL2 fragment-shader path; export
  continues to use the existing CPU row-band processor in
  `@lumaforge/luma-color-runtime`. This preserves the current preview-vs-export
  backend split rather than promoting either side. Backend re-evaluation is
  gated on iOS Safari WebGPU stabilising for twelve months and Samsung
  Xclipse shipping in stable Chrome Android.
- Do not include selective color in reusable Look preset serialization in
  v1. Selective color participates in normal Adjust session state and
  export snapshots; it is excluded only from the Look preset format, until
  that format gets its own versioned schema bump.
- Do not add URL-share sync for selective color in v1.
- Current edit session state, export snapshots, and undo history MUST
  include selective color from day one — those are not optional, and an
  HSL edit being silently lost on view-mode switch or compare-toggle would
  read as a bug.
- Do not change the runtime's DCP application order. Selective color composes
  on top of whatever the raw runtime emits as `linear-prophoto-rgb`.

## External practice summary

Two prior research rounds (industry landscape and performance/backend
feasibility) underpin the decisions in this spec. Headline conclusions:

- Working space: OKLab/OKLCh wins on perceptual hue uniformity, computational
  cost in a fragment shader (two matmuls plus a cube root), and existing
  ecosystem maturity (CSS Color 4, Photoshop gradient default). CIE Lab/LCh
  has a well-documented blue-to-purple hue shift in the 270–330° segment;
  darktable's own manual warns against its color-zones implementation in
  favour of the scene-referred color equalizer. CAM16-UCS scores marginally
  better on raw lightness/chroma RMS but requires surround/background luminance
  modeling that LumaForge cannot supply.
- Insertion point: scene-referred, between user tone and LUT input conversion.
  Display-referred placement breaks LUT survival across export and composes
  unpredictably with the DCP look table portion of camera profiles.
- Selection model: continuous LUT256 baked from eight equally-meaningful band
  centers (not user-placed nodes) with smoothstep C¹ fall-off. darktable's
  color equalizer made the same trade after color zones produced "ungraceful
  transitions" with user-placed nodes.
- Backend: WebGL2 fragment shader with RGBA16F intermediates. WebGL2 RGBA16F
  via `EXT_color_buffer_float` is Baseline Widely available across all four
  required platforms since 2021-09. WebGPU is shipping on iOS Safari 26 but is
  not battle-tested for 16MP RGBA16F memory workloads, and WASM-SIMD threads
  would force COOP/COEP site-wide, breaking the calibration profile, DCP
  catalog, and native artifact CDN contracts.

Where these conclusions are load-bearing for the math contract or the
implementation, the relevant section reproduces the rationale inline so the
spec stays self-contained.

## Current system context

`@lumaforge/luma-raw-runtime` returns editable preview buffers and export
processed windows as `linear-prophoto-rgb` with camera white balance, camera
matrix, and (in DCP-MVP paths) DCP `ColorMatrix` and `HueSatMap` already
applied. The app-level color graph treats this as `input-linear-prophoto` and
does not re-apply camera color science.

The current shared color graph is:

```text
input-linear-prophoto
-> raw-render-exposure
-> user-color-balance
-> user-exposure
-> user-contrast
-> user-regional-tone
-> ( gamut-to-lut-input -> encode-lut-transfer -> lut3d -> lut-output-to-srgb )?
-> output-srgb
```

`@lumaforge/luma-color-runtime` already exposes:

- `tone.ts`, `color-balance.ts`, `raw-render-exposure.ts` — scene-referred user
  ops on Linear ProPhoto RGB;
- `lut3d.ts`, `lut-domain.ts`, `lut-contract.ts`, `log-encoding.ts` — LUT
  domain/transfer machinery;
- `matrix.ts` with `getLinearProPhotoToGamutMatrix` and ProPhoto luminance
  coefficients;
- `glsl.ts` with reusable GLSL string constants for transfer and range work;
- `row-band-processor.ts` as the CPU mirror used by exports.

It does **not** currently expose OKLab/OKLCh primitives. The HSL feature must
add them.

WebGL preview owns its shader in `src/lib/gl/shaders.ts` and uniform plumbing
in `src/lib/gl/pipeline.ts`. The preview main function applies, in order,
`u_rawRenderExposureMultiplier`, `u_userColorBalanceGain`, and `applyUserTone`,
then forks to the LUT or built-in-style branches. Selective color must enter
this main function in the right slot.

## Package boundary

The `@lumaforge/luma-color-runtime` package is the single source of truth for
all color math, graph shapes, normalization, serialization shapes, and the
GLSL helper strings. The `src/` tree owns UI surfaces, uniform plumbing,
texture upload, and atom wiring only.

This boundary is load-bearing because a future CLI/headless package will
consume `@lumaforge/luma-color-runtime` directly and must produce
pixel-identical output without importing anything from `src/`.

Concretely, for selective color:

- math (OKLab forward/inverse, OKLCh polar, LUT bake, row-band apply) lives
  in `@lumaforge/luma-color-runtime`. Nothing math-shaped lives in `src/`;
- the `user-selective-color` graph step shape, its parameter interface, and
  its export-snapshot shape live in `@lumaforge/luma-color-runtime`. `src/`
  imports them as types;
- the GLSL helper function bodies — `linearProPhotoToOklab`,
  `oklabToLinearProPhoto`, `oklabToOklch`, `oklchToOklab`, and
  `applyUserSelectiveColor` — are exported as string constants from
  `@lumaforge/luma-color-runtime/glsl`. The `src/lib/gl` shader template
  concatenates these strings into its program source. The shader template
  in `src/` never inlines its own copy of the math;
- numeric constants (band centers, deflection limits, chroma clamp
  thresholds) live in `@lumaforge/luma-color-runtime` and are imported by
  both the package's own helpers and by any `src/` code (UI ranges, copy)
  that needs to display them;
- `src/lib/gl/pipeline.ts` owns uniform-location lookups, texture object
  creation, and `texSubImage2D` upload calls only. It never bakes LUTs and
  never computes OKLab values. It calls `resolveSelectiveColorParams` and
  uploads the buffers the package returns;
- `src/lib/preview` (CPU-degraded preview) and `src/lib/export` (full-res
  export) call into the row-band processor exposed by the package. They do
  not duplicate the apply function.

A package-boundary test (extending `package-boundary.test.ts`) asserts that
running `applySelectiveColorRow` on a canonical swatch grid from a Node-only
entry point — with no `src/` imports on the call graph — produces the same
output as the in-app row-band path within F32 tolerance. This test is the
falsifiability gate on the CLI claim.

## Product decision

Add a third subpanel `HSL` under the existing `Adjust` group:

```text
Adjust
  Tone
    Exposure, Contrast, Highlights, Shadows, Whites, Blacks
  Color
    Temperature, Tint
  HSL
    Red, Orange, Yellow, Green, Aqua, Blue, Purple, Magenta
      each: Hue, Saturation, Lightness
```

Desktop replaces the current two-segment `Tone`/`Color` segmented control with
a three-segment `Tone`/`Color`/`HSL` control. Each band exposes three slider
rows. Bands are presented in their fixed UI order with no add/remove affordance.

Mobile keeps the dock at its current mode count. Inside the expanded `Adjust`
panel, the subpanel selector grows from two options (`Tone`, `Color`) to three
(`Tone`, `Color`, `HSL`). Band selection inside `HSL` uses the same focused
slider interaction pattern as `Tone` and `Color`, with the band acting as the
section header and Hue/Saturation/Lightness as the focusable rows.

The UI label `HSL` is a photographer-facing convention. The implementation
is OKLCh hue, chroma, and lightness, not cylindrical RGB HSL — band centers
are calibrated in OKLCh, the saturation slider multiplies OKLCh chroma, and
the lightness slider offsets OKLab L. Test names, internal identifiers, and
documentation use `selective color` or `OKLCh per-band shift`; only the
user-facing copy uses `HSL`.

**Skin tones sit in the red→orange interpolation region**: skin tones live
around OKLCh hue 40–55°, between the red band (≈ 29.2°) and the orange
band (≈ 69.5°). The smoothstep partition-of-unity bake means a `Red`
slider edit will move skin partially, and an `Orange` slider edit will too
— by design, matching Lightroom Color Mixer and Capture One Basic Color
Editor. Users adjusting skin should expect to coordinate Red and Orange
together; a dedicated Skin Tone tab (Capture One Advanced) is deliberately
out of v1 scope. Deep skin tones can have OKLCh chroma close to the
chroma-attenuation clamp (`CHROMA_CLAMP_HIGH = 0.020`); the smoothstep
ramp from `CHROMA_CLAMP_LOW = 0.005` to `CHROMA_CLAMP_HIGH` reduces band
response smoothly in that regime, which is correct behaviour rather than
a bug — heavy hue shifts on near-grey deep-skin pixels would otherwise
amplify chroma noise. This expectation is exposed as `raw.hsl.note` copy
near the band list.

Reset behavior remains scoped:

- `Reset HSL` resets only the 24 selective-color scalars.
- `Reset tone` and `Reset color` keep their current scope.
- A global `Reset adjust` remains out of scope.

## User controls

Add a separate selective-color parameter interface in
`@lumaforge/luma-color-runtime`:

```ts
export type HSLBandId =
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'aqua'
  | 'blue'
  | 'purple'
  | 'magenta'

export interface HSLBandShift {
  readonly hue: number
  readonly saturation: number
  readonly lightness: number
}

export interface LumaColorSelectiveColorParams {
  readonly selectiveColor: Readonly<Record<HSLBandId, Readonly<HSLBandShift>>>
}
```

`ProcessingParams` adds the new interface beside the existing tone and balance
ones:

```ts
export interface LumaColorProcessingParams
  extends LumaColorToneParams,
    LumaColorBalanceParams,
    LumaColorSelectiveColorParams {
  intensity: number
  viewMode: 'processed' | 'original' | 'compare'
  compareSplit: number
  styleKind: 'none' | 'builtin' | 'custom'
  builtinPreset: BuiltinStylePreset | null
}
```

Defaults: all 24 scalars resolve to 0. The neutral band must be produced by
a factory, never by a shared object literal, so that any future mutable
update on one band cannot alias into another through a shared reference.

```ts
const makeNeutralBand = (): HSLBandShift => ({
  hue: 0,
  saturation: 0,
  lightness: 0,
})

selectiveColor: {
  red:     makeNeutralBand(),
  orange:  makeNeutralBand(),
  yellow:  makeNeutralBand(),
  green:   makeNeutralBand(),
  aqua:    makeNeutralBand(),
  blue:    makeNeutralBand(),
  purple:  makeNeutralBand(),
  magenta: makeNeutralBand(),
}
```

The parameter interfaces declared above are deep-readonly so the type
system also rejects in-place mutation; the factory only matters when the
state owner forgets to invoke an immutable update helper.

A `state_safety` test mutates one band's slider via the state-store update
path and asserts the other seven bands' resolved values are unchanged by
reference and by value.

UI ranges:

- Hue: `-100` to `+100`, integer display, neutral `0`. Maps to ±30° of OKLCh
  hue rotation at full deflection.
- Saturation: `-100` to `+100`, integer display, neutral `0`. Maps to a chroma
  multiplier in `[0, 2]` at full deflection.
- Lightness: `-100` to `+100`, integer display, neutral `0`. Maps to an OKLab
  `L` additive offset in `[-0.20, +0.20]` at full deflection.

The exact mapping is documented in the math contract. Slider values themselves
are unit-free and bounded to ±100 so they always round-trip cleanly through
display, copy, and (future) serialization.

Runtime hard normalization:

- non-finite values normalize to `0`;
- each scalar clamps to `[-100, 100]`;
- missing bands resolve to neutral, never to a partial state.

## Math contract

### Step 1 — convert into OKLab/OKLCh

Selective color runs on the scene-referred Linear ProPhoto RGB value emitted
by the prior tone step. Conversion to OKLab uses a single composed matrix that
folds linear ProPhoto → XYZ → LMS, followed by a sign-preserving cube-root
nonlinearity and the OKLab output matrix.

```text
LMS_proPhoto = M_proPhotoToLMS * vec3(rgb_proPhoto)
LMS_prime    = signedCbrt(LMS_proPhoto)
OKLab        = M_LMSToOKLab    * LMS_prime
```

`signedCbrt(x) = sign(x) * pow(abs(x), 1.0 / 3.0)` per-component. This
preserves sign on inputs that occasionally go negative at gamut edges and is
symmetric with the inverse cube on the way back. A naive non-negative clamp
would silently swallow negative LMS values and break the OKLab round-trip
**and** break the neutral-identity guarantee that this pass must satisfy
when all band scalars are zero.

The package exports a GLSL helper exactly as:

```glsl
float signedCbrt(float x) {
  return sign(x) * pow(abs(x), 1.0 / 3.0);
}

vec3 signedCbrt(vec3 v) {
  return sign(v) * pow(abs(v), vec3(1.0 / 3.0));
}
```

The CPU helper mirrors the same algorithm exactly — `Math.sign(x) *
Math.pow(Math.abs(x), 1 / 3)` per channel, not `Math.cbrt(x)` — so that GPU
and CPU agree bit-for-bit modulo `pow` driver precision. The precision-parity
strategy in the Failure handling section depends on this match.

Neither the shader template in `src/lib/gl` nor the row-band processor opens
this primitive in its own code path; both import the same `signedCbrt`
helper from `@lumaforge/luma-color-runtime`.

`M_proPhotoToLMS` is the static product of the standard linear ProPhoto → XYZ
(D50) matrix, a Bradford chromatic adaptation from D50 to D65, and Ottosson's
OKLab M1 LMS matrix. It must be precomputed in `matrix.ts` and treated as a
constant; runtime code never multiplies the three matrices at frame time.

`M_LMSToOKLab` is Ottosson's M2 matrix verbatim.

Polar form (uniform `[0, 1)` hue convention):

```text
C      = sqrt(OKLab.a^2 + OKLab.b^2)
h      = atan2(OKLab.b, OKLab.a)            // radians in [-pi, pi]
h_norm = fract(h / (2 * pi) + 1.0)          // [0, 1), red == 0
```

`h_norm` is the single hue-axis convention used everywhere in this spec:
- the OKLab `+a` half-axis (`a > 0, b = 0`) maps to `h_norm = 0`,
  LUT index 0 — this is OKLCh hue 0°, a pure-math direction, **not** the
  canonical sRGB red whose OKLCh hue is ≈ 29.2°;
- LUT index `i` corresponds to OKLCh hue `(i / LUT_SIZE) * 2 * pi`
  radians;
- the seam between LUT index 255 and LUT index 0 sits at OKLCh hue 0°
  / 360°. This is INSIDE the magenta→red wrap-around interpolation
  bracket (between magenta center ≈ 328.5° and red center ≈ 29.2°+360°),
  NOT at any band centre. An implementer must not place the red band at
  LUT index 0.

This convention is load-bearing for the band-center table below. Any
deviation — for example the legacy `(h + pi) / (2 * pi)` form that places
hue 0 at the middle of the LUT — would map the entire `BAND_CENTERS_RAD`
table to the wrong LUT positions and turn the user-facing `Red` slider
into an aqua/blue slider.

Two separate tests guard this:

- `hue_axis_origin` (synthetic): an OKLab vector with `a > 0, b = 0`
  (use any non-trivial in-gamut magnitude, e.g. `a = 0.25, b = 0`) maps
  to `h_norm = 0` within F64 tolerance. This is a pure-math test of the
  polar form, independent of any sRGB anchor.
- `canonical_red_lut_position` (end-to-end): linear sRGB red `(1, 0, 0)`
  pushed through the full pipeline (sRGB → linear ProPhoto → OKLab →
  OKLCh) yields `h_norm ≈ 29.2 / 360 ≈ 0.0811`, which corresponds to
  LUT index ≈ 20.8 (between LUT positions 20 and 21). This confirms that
  the red BAND lives roughly one twelfth of the way into the LUT, NOT
  at the seam.

### Step 2 — sample the packed 1D LUT with explicit seam wrap

The selective-color shader receives a single `RGBA16F` 256×1 lookup texture
encoding all three curves in one sampler:

- R: additive OKLCh hue shift in radians at hue position `i`;
- G: multiplicative chroma factor at hue position `i`;
- B: additive OKLab L offset at hue position `i`;
- A: reserved.

The texture uses `NEAREST` filtering on both axes. Interpolation is
performed explicitly in the shader to guarantee correct behaviour at the
255→0 seam, because GL's `LINEAR`+`REPEAT` blends through a texel boundary
that does not correspond to the OKLCh hue wrap; relying on it would produce
visible banding at the OKLCh red boundary on every frame.

The seam-aware lookup is canonical in both the GLSL helper and the CPU
helper:

```glsl
vec4 sampleSelectiveColorLut(sampler2D lut, float hNorm) {
  float x   = fract(hNorm) * 256.0;
  float i0f = floor(x);
  float t   = x - i0f;
  int i0    = int(i0f);
  int i1    = int(mod(float(i0 + 1), 256.0));
  vec4 a    = texelFetch(lut, ivec2(i0, 0), 0);
  vec4 b    = texelFetch(lut, ivec2(i1, 0), 0);
  return mix(a, b, t);
}
```

The CPU mirror in the row-band processor performs the identical fractional
lookup and modular `i1`, so per-texel-centre, per-midpoint, and per-seam
sampling matches bit-for-bit. A `texture_parity` test exercises all three
sample positions for randomized LUT contents and asserts agreement within
F32 tolerance.

### Step 3 — apply with chroma-attenuation clamp and direct (a, b) rotation

A near-achromatic pixel has unstable hue. Applying a hue shift to such a
pixel amplifies colour noise in shadows and on neutrals. The clamp
attenuates all three adjustments based on the source chroma:

```text
CHROMA_CLAMP_LOW  = 0.005
CHROMA_CLAMP_HIGH = 0.020
strength = smoothstep(CHROMA_CLAMP_LOW, CHROMA_CLAMP_HIGH, C_source)
```

The apply step rotates `(a, b)` directly rather than reconstructing them
from `cos(h_out), sin(h_out)`, which saves a redundant `atan2 → cos/sin`
round-trip on a hue we already have in cartesian form:

```text
sample = sampleSelectiveColorLut(lut, h_norm)
delta  = strength * sample.r                   // effective hue shift
scale  = mix(1.0, sample.g, strength)          // effective chroma scale
addL   = strength * sample.b                   // effective L offset

cosD   = cos(delta)
sinD   = sin(delta)

a_out  = (OKLab.a * cosD - OKLab.b * sinD) * scale
b_out  = (OKLab.a * sinD + OKLab.b * cosD) * scale
L_out  = OKLab.L + addL
```

`scale` is bounded by the bake to `[0, 2]`, so the chroma never goes
negative. The chroma magnitude `C_out = C * scale` equals
`sqrt(a_out² + b_out²)` by construction; the implementation never needs to
recompute it.

### Step 4 — back to linear ProPhoto

`a_out`, `b_out`, `L_out` arrive directly from Step 3 in cartesian OKLab,
so no polar reconstruction is needed:

```text
LMS_prime' = M_OKLabToLMS * vec3(L_out, a_out, b_out)
LMS'       = LMS_prime' * LMS_prime' * LMS_prime'    // element-wise cube
rgb_out    = M_LMSToProPhoto * LMS'
```

`M_OKLabToLMS` is the inverse of Ottosson's M2. `M_LMSToProPhoto` is the
inverse of `M_proPhotoToLMS`. Both are precomputed constants.

Element-wise cube is naturally sign-preserving (`x * x * x` keeps the sign of
`x`), which closes the round-trip with `signedCbrt` on the forward path. A
neutral selective-color input therefore reproduces the source linear ProPhoto
within machine epsilon, modulo the matrix conditioning of the composed
ProPhoto↔LMS transforms — verified by the package-level OKLab round-trip
test.

`rgb_out` is **not clamped** to non-negative. Downstream tone, LUT input
conversion, output transform, and final encoding own clamp semantics, matching
the convention established by `user-color-balance` and the tone stages.

### Band centers — calibrated in OKLCh, not HSV

Band centers are **OKLCh hue coordinates** measured against canonical sRGB
primary and secondary swatches passed through the same
ProPhoto-D50 → D65 → OKLab pipeline this pass uses. They are NOT HSV/HSL
wheel angles; using the naive HSV positions `[0, 30, 60, 120, 180, 240, 270,
300]` would offset every band by 30°–60° from the perceived swatch and break
the "Red slider controls red" product contract.

The calibration anchors, with the value the implementation must reproduce
within ±0.5° using the package's own `linearProPhotoToOklab`. Values are
precomputed from full F64 sRGB → linear ProPhoto → Bradford-D65 → OKLab,
quoted to 1 decimal degree:

| Band    | Anchor swatch (linear sRGB)         | OKLCh hue (deg) |
| ------- | ----------------------------------- | --------------- |
| red     | sRGB primary `(1, 0, 0)`            | ≈ 29.2          |
| orange  | midpoint(red, yellow) in OKLCh hue  | ≈ 69.5          |
| yellow  | sRGB secondary `(1, 1, 0)`          | ≈ 109.8         |
| green   | sRGB primary `(0, 1, 0)`            | ≈ 142.5         |
| aqua    | sRGB secondary `(0, 1, 1)`          | ≈ 194.8         |
| blue    | sRGB primary `(0, 0, 1)`            | ≈ 264.2         |
| purple  | midpoint(blue, magenta) in OKLCh hue| ≈ 296.4         |
| magenta | sRGB secondary `(1, 0, 1)`          | ≈ 328.5         |

These figures are the v1 target band positions. The implementation must
compute the primary/secondary anchors at module-load time, derive the two
midpoints in OKLCh hue space (short-arc midpoint between adjacent
primaries), store the eight angles in `BAND_CENTERS_RAD`, and freeze them
as constants for the rest of the session. The `band_centers_match_table`
test asserts each computed value matches the documented degree within
±0.5°; if a future ProPhoto/D65/Bradford constant changes, this test
surfaces the band-center drift instead of letting it ship silently.

### Bake — 24 scalars to one LUT256

The bake runs whenever a band scalar changes. It produces a single
`Float32Array` buffer of length `4 * 256 = 1024` (RGBA) that the preview
uploads as a 256×1 `RGBA16F` texture in one call. R = `hueShift` (radians),
G = `satMul` (multiplier, clamped `[0, 2]`), B = `lightAdd` (OKLab L), A is
reserved.

```text
LUT_SIZE          = 256
HUE_MAX_DELTA_RAD = pi / 6       // ±30° at slider ±100
SAT_MAX_FACTOR    = 1.0          // slider +100 -> chroma * 2.0; slider -100 -> * 0.0
LIGHT_MAX_DELTA   = 0.20         // OKLab L offset at slider ±100

for i in [0, LUT_SIZE):
  h_i = (i / LUT_SIZE) * 2 * pi
  (left, right) = adjacentBandCenters(h_i)        // wrap-around in [0, 2pi)
  t  = wrapFraction(h_i, BAND_CENTERS_RAD[left], BAND_CENTERS_RAD[right])
  t' = smoothstep(0, 1, t)                        // C¹ polynomial fall-off
  band = mixBandShift(left, right, t')            // lerp the three scalars

  outBuffer[4 * i + 0] = (band.hue        / 100) * HUE_MAX_DELTA_RAD
  outBuffer[4 * i + 1] = clamp(
                          1 + (band.saturation / 100) * SAT_MAX_FACTOR,
                          0, 2)
  outBuffer[4 * i + 2] = (band.lightness  / 100) * LIGHT_MAX_DELTA
  outBuffer[4 * i + 3] = 0                        // reserved
```

`wrapFraction` returns the fraction of the arc from the left band center to
`h_i`, divided by the arc length between left and right centers, with both
arcs measured on the unit circle so the seam between the magenta band
(≈ 328.5°) and the red band (≈ 29.2° + 360°) produces a clean monotonic
`t ∈ [0, 1]` across the wrap. The explicit reference implementation:

```text
wrapFraction(h, left, right):
  rightEffective = right >= left ? right : right + 2π
  hEffective     = h     >= left ? h     : h     + 2π
  return clamp((hEffective - left) / (rightEffective - left), 0, 1)
```

`mixBandShift(left, right, t')` is the per-component linear interpolation
of the three band shift scalars:

```text
mixBandShift(left, right, t'):
  return {
    hue:       (1 - t') * left.hue       + t' * right.hue,
    saturation:(1 - t') * left.saturation + t' * right.saturation,
    lightness: (1 - t') * left.lightness  + t' * right.lightness,
  }
```

`adjacentBandCenters(h_i)` returns the bracket `[left, right]` of band
centers surrounding `h_i` on the unit circle. When `h_i` equals a band
center exactly, the band is assigned to the **right** bracket
(left-inclusive convention). Either bracket choice gives the same LUT
entry at an exact band center (both yield `t' = 0` for "right is the
center" or `t' = 1` for "left is the center", both producing 100% weight
on the center band), so the convention is documented only for
`band_center_boundary_consistency` regression coverage.

The fall-off is **smoothstep (C¹ Hermite polynomial)**, not raised cosine.
All earlier sections that summarized the fall-off use the same term. Triangular (linear) fall-off is explicitly rejected because
it is the source of the "ungraceful transitions" the prior research
documented in older LCh-based implementations.

A partition-of-unity-style assertion checks that the per-position sum of
contributing band weights stays within `1e-3` of 1 across all 256 hue
positions; this prevents silent regressions where two-band overlap leaves
gaps or peaks.

### Neutral behaviour

```text
all band scalars = 0
outBuffer[4*i + 0] = 0   // hueShift
outBuffer[4*i + 1] = 1   // satMul
outBuffer[4*i + 2] = 0   // lightAdd
outBuffer[4*i + 3] = 0   // reserved
```

Under these LUT contents the math contract evaluates to `rgb_out == rgb_in`
for **every** linear ProPhoto input — including inputs with negative
channels and inputs above 1.0 — because:

1. `signedCbrt` on the forward and element-wise cube on the inverse round-trip
   any real-valued LMS triple, including negatives;
2. `M_proPhotoToLMS * M_LMSToProPhoto` is precomputed to be the identity
   matrix within F32 machine epsilon;
3. the apply step computes `delta = strength * 0 = 0`,
   `scale = mix(1, 1, strength) = 1`, `addL = strength * 0 = 0`, so
   `(a_out, b_out, L_out) == (a, b, L)` under any `strength` and the
   chroma clamp does not affect the identity.

A dedicated `neutral_identity` test asserts this on three sample sets: a
ColorChecker grid, a deep-shadow patch with `(0.001, 0.0008, 0.0009)`, an
above-clip patch with `(1.4, 1.2, 1.5)`, and a synthetic
negative-LMS-triggering patch (e.g. a saturated wide-gamut emulator value).
All four must produce zero per-channel delta in 8-bit output.

The preview must still upload the LUT and execute the pass even at neutral
so graph fingerprints, export snapshots, and parity tests stay consistent.

## Color graph

Insert a new graph step after `user-regional-tone` and before the LUT chain
fork:

```text
input-linear-prophoto
-> raw-render-exposure
-> user-color-balance
-> user-exposure
-> user-contrast
-> user-regional-tone
-> user-selective-color                    <- new
-> ( gamut-to-lut-input -> ... -> lut-output-to-srgb )?
-> output-srgb
```

New graph step shape — durable state only, NO mutable buffers:

```ts
type UserSelectiveColorGraphStep = {
  kind: 'user-selective-color'
  bands: Readonly<Record<HSLBandId, Readonly<HSLBandShift>>>
  chromaClampLow: number     // 0.005
  chromaClampHigh: number    // 0.020
  workingSpace: 'oklab-via-prophoto-d65'
  operator: 'oklch-per-band-shift'
  constantsVersion: number   // bumps when BAND_CENTERS_RAD or limits change
}
```

The 1024-entry `RGBA16F` LUT buffer is **NOT** part of the graph step.
Graph steps are immutable snapshots used for fingerprinting, histogram
keys, export snapshots, and replay; binding a pooled `Float32Array` to
that snapshot would let a later in-place bake silently mutate "old" graph
state.

Instead the package separates two object kinds:

```ts
type PreparedSelectiveColorLut = {
  bands: Readonly<Record<HSLBandId, Readonly<HSLBandShift>>>
  buffer: Float32Array         // length 1024, RGBA packed
  constantsVersion: number
}
```

`resolveSelectiveColorParams(params, outBuffer?)` returns both a
`UserSelectiveColorGraphStep` (which the graph holds) and a
`PreparedSelectiveColorLut` (which the caller owns and uploads).
`outBuffer` is the caller-owned out-buffer — the renderer passes its
pooled `Float32Array(1024)`; the CLI/headless export path passes a freshly
allocated buffer or omits the argument and lets the resolver allocate
one. Graph fingerprinting is computed from the normalized scalars and
`constantsVersion` only; it never reads `buffer`. A `lut_ownership` test
mutates the pooled `buffer` after the graph step is captured and asserts
the graph fingerprint and any captured export snapshot are unaffected.

`ExportColorGraphStep` adds the variant alongside the existing ones, with
the same no-mutable-buffer shape.

The step is always emitted, even at neutral values. This matches the
existing `user-color-balance` convention and keeps the graph fingerprint
stable so preview, histogram, and export agree on the active pipeline at
all times.

## Runtime package modules

All new computation lands in `@lumaforge/luma-color-runtime`. No new
computation lands in the app `src/` tree. Add two new modules under the
package:

```text
packages/luma-color-runtime/src/oklab.ts
packages/luma-color-runtime/src/selective-color.ts
```

`oklab.ts` responsibilities:

- export `M_PROPHOTO_TO_LMS`, `M_LMS_TO_PROPHOTO`, `M_LMS_TO_OKLAB`,
  `M_OKLAB_TO_LMS` as readonly `Float32Array` constants;
- export `linearProPhotoToOklab(rgb)` and `oklabToLinearProPhoto(lab)` for CPU
  code;
- export `oklabToOklch(lab)` and `oklchToOklab(lch)` helpers;
- export GLSL string constants (`OKLAB_GLSL`) for shader composition;
- pure functions, no allocation in the hot loop — caller-owned out buffers.

`selective-color.ts` responsibilities:

- export `LumaColorSelectiveColorParams`, `HSLBandId`, `HSLBandShift`,
  `makeNeutralBand`;
- export `BAND_CENTERS_RAD` (computed at module load from the canonical
  swatch anchors documented in the math contract), `HUE_MAX_DELTA_RAD`,
  `SAT_MAX_FACTOR`, `LIGHT_MAX_DELTA`, `CHROMA_CLAMP_LOW`,
  `CHROMA_CLAMP_HIGH`, `LUT_CONSTANTS_VERSION`;
- export `resolveSelectiveColorParams(params, outBuffer?)` returning a
  `{ step: UserSelectiveColorGraphStep, prepared: PreparedSelectiveColorLut }`
  pair, with the caller-owned `outBuffer` (length 1024 `Float32Array`)
  reused in place when supplied;
- export `sampleSelectiveColorLut(buffer, hNorm)` for the CPU mirror of the
  seam-aware fetch in Step 2;
- export `applySelectiveColorRow(...)` for CPU row-band code (consumes a
  `PreparedSelectiveColorLut`, not the raw params);
- export GLSL helper string `SELECTIVE_COLOR_GLSL` that consumes
  `OKLAB_GLSL` and defines `sampleSelectiveColorLut` and
  `applyUserSelectiveColor`;
- import only from `matrix.ts`, `constants.ts`, and `oklab.ts`.

`tone.ts` and `color-balance.ts` must not import `selective-color.ts`. Higher-
level graph construction in `color-graph.ts` composes all three.

`types.ts` updates `ProcessingParams` to include the new interface.

`color-graph.ts` resolves the new step after the tone step and before the LUT
fork.

`row-band-processor.ts` invokes the new module after regional tone and before
the LUT input conversion. The LUTs travel with the graph step, not the
processor's own state.

## Preview shader

The WebGL preview shader template in `src/lib/gl/shaders.ts` consumes the
package's `OKLAB_GLSL` and `SELECTIVE_COLOR_GLSL` strings exported from
`@lumaforge/luma-color-runtime/glsl`. The template inlines them into the
fragment program source; it does not redeclare the OKLab matrices, the cube
root pipeline, or the apply function. Editing the math is editing the
package, not the shader template.

WebGL preview adds two uniforms on top of the existing tone and balance
uniforms:

```text
uniform sampler2D u_selectiveColorLUT;          // 256x1 RGBA16F, NEAREST
uniform vec2      u_selectiveColorChromaClamp;  // (low, high)
```

The LUT texture is a single 256×1 `RGBA16F` with `NEAREST` filtering on both
axes — no `LINEAR` filtering, no `GL_REPEAT`. Linear interpolation between
adjacent texels and the modular wrap at the 255→0 seam are computed in the
shader via `texelFetch`, as documented in the math contract Step 2. This
choice is deliberate: it dodges every known mobile-driver half-float
filtering quirk and gives bit-identical sampling to the CPU mirror used by
export.

The preview main function inserts the new pass between tone and the
LUT/style branches:

```text
vec3 technicalBaseSceneLinearProPhoto =
  readInputSceneLinearProPhoto(uv) * u_rawRenderExposureMultiplier;

vec3 colorBalancedSceneLinearProPhoto = applyUserColorBalance(
  technicalBaseSceneLinearProPhoto, u_userColorBalanceGain);

vec3 tonedSceneLinearProPhoto = applyUserTone(
  colorBalancedSceneLinearProPhoto, ...toneUniforms);

vec3 editedBaseSceneLinearProPhoto = applyUserSelectiveColor(
  tonedSceneLinearProPhoto,
  u_selectiveColorLUT,
  u_selectiveColorChromaClamp);
```

`editedBaseSceneLinearProPhoto` then feeds the existing LUT/style branches
unchanged.

Compare/original semantics:

- `Original` remains the technical base after RAW render exposure only.
- `Processed` includes color balance, tone, selective color, and any
  style/LUT.
- `Compare` left side remains technical base; right side reflects the full
  edit.

This mirrors the existing tone and color-balance behaviour and makes
selective color a real edit rather than a viewing transform.

The `applyUserSelectiveColor` helper itself ships in
`SELECTIVE_COLOR_GLSL` from `@lumaforge/luma-color-runtime` so preview and any
future runtime-driven render share one source of truth for the OKLab and
OKLCh math.

## Full-resolution export behavior

Full-resolution export receives the same normalized selective-color params
when building `resolveExportColorGraph`. The export path reads
`LumaRawProcessedWindow` rows that are already `linear-prophoto-rgb` and
applies selective color via the row-band processor exposed by
`@lumaforge/luma-color-runtime`, sharing `applySelectiveColorRow` with the
CPU preview fallback and with any future CLI/headless consumer of the
package.

The export pipeline must use F32 intermediates end-to-end through the
selective-color stage to preserve cbrt precision. Export does not use a GPU
in v1; the row-band processor is the single source of authoritative output.

Changing any selective-color scalar must invalidate a ready export result
because the render graph output changes.

Export snapshots include a separate `selectiveColor` block:

```ts
selectiveColor: {
  red:     { hue: number, saturation: number, lightness: number },
  orange:  { ... },
  yellow:  { ... },
  green:   { ... },
  aqua:    { ... },
  blue:    { ... },
  purple:  { ... },
  magenta: { ... },
}
```

Do not place these fields under `tone` or `color`.

## Preview histogram

The histogram job key must include all 24 scalars (or, equivalently, a hash
of the resolved LUTs).

The histogram graph passes the selective-color block into
`resolveExportColorGraph` so output bins reflect the same edit users see in
preview.

The histogram remains unavailable for embedded-only preview sources and
remains independent of compare split position.

## State and UI integration

Processing defaults extend with the neutral block above.

Add HSL-specific state helpers instead of expanding tone or color helpers:

```ts
setSelectiveColorBand(
  band: HSLBandId,
  shift: Partial<HSLBandShift>
): void

resetSelectiveColor(): void
```

`setToneParams`, `resetTone`, `setColorParams`, and `resetColor` keep their
current scope.

Desktop:

- `RawToolSurface` receives a separate `selectiveColor` value.
- `AdjustTool` owns the three-segment subpanel switch (`Tone`, `Color`, `HSL`)
  and delegates to `ToneTool`, `ColorTool`, or a new `HSLTool`.
- `ToneTool` and `ColorTool` must not know about selective color.
- `HSLTool` owns its band-row layout, slider metadata, neutral detection, and
  reset action.

Mobile:

- The dock label stays `Adjust`; mode count stays the same.
- The expanded `Adjust` panel grows the subpanel selector to three entries.
- `HSL` uses a band-list view; tapping a band reveals the three focused slider
  rows. The focused slider HUD reuses the same scrub interaction pattern as
  Tone and Color.
- Keep band focus, slider focus, and subpanel focus state separate so
  switching subpanels does not cross-pollinate focus or reset scopes.

Localization:

- Add `raw.adjust.hsl`.
- Add `raw.hsl.bands.red`, `.orange`, `.yellow`, `.green`, `.aqua`, `.blue`,
  `.purple`, `.magenta`.
- Add `raw.hsl.fields.hue`, `.saturation`, `.lightness`.
- Add `raw.hsl.reset`, `raw.hsl.note`.
- Bands must share keys with any future Color Grading panel where the same
  semantic appears (none in v1).

## Performance budget

Target:

- preview interactive at 60 fps while a slider is being dragged, including
  re-bake of the packed LUT and re-upload to GPU on each frame;
- full-resolution export adds no more than 200 ms per 16 MP at the
  selective-color stage on a representative desktop and 400 ms on a
  representative iPhone 13-class device (mobile export budget is not the
  binding constraint, but is tracked here for regression triage).

Slider drag must NOT re-allocate the LUT each frame.
`resolveSelectiveColorParams` in `@lumaforge/luma-color-runtime` accepts a
caller-owned `Float32Array(1024)` out-buffer and writes the packed RGBA
bake in place. The renderer (`src/lib/gl/pipeline.ts`) owns one pooled
out-buffer per session and one pre-allocated 256×1 `RGBA16F` texture, and
uploads via `texSubImage2D` rather than `texImage2D`. The pooled buffer is
read-then-uploaded synchronously inside one frame; the graph step retains
none of its identity. This ownership split keeps the bake function pure and
caller-agnostic — the same function powers the CLI/headless export path,
which allocates its out-buffer per export and does not pool.

Slider release does not need a separate "high-quality" path. The same
shader and the same bake run on drag and on release.

### CPU export budget realism and fallback decision

The CPU row-band hot loop performs, per pixel: two 3×3 matmuls (forward and
inverse ProPhoto↔LMS), three `signedCbrt` (forward) + three cubes
(inverse), one `atan2`, one `sin/cos(delta)` pair, one packed LUT sample,
and the chroma-clamp `smoothstep`. The 200 ms / 16 MP desktop and 400 ms /
16 MP mobile numbers above are TARGETS, not measured budgets — the prior
research found no published wall-clock numbers for this exact workload, so
they must be falsified or confirmed by a single-stage micro-benchmark
delivered with the implementation (`scripts/bench-selective-color-row.ts`).

If measured CPU export misses the budget, the v1 fallback ladder is:

1. **Ship at the measured cost behind no flag.** Selective color is a core
   adjustment; an extra few hundred ms on 16 MP export is acceptable when
   the alternative is a degraded image. The performance gate fails only
   when export blows past `2 s / 16 MP` total wall-clock, not when the
   selective-color stage alone is over budget.
2. **Promote selective color to the existing GPU export path** if and when
   that path lands. v1 does not include GPU export, so this is a v2 move.
3. **Lower-cost CPU approximation** — for example a coarser cube root via
   the bit-trick approximation used in fast OKLab implementations — only
   if it passes the LUT-survival pixel-parity test against the F32
   reference. The reference path itself never moves.

Reducing visible quality (skipping the chroma clamp, dropping seam
interpolation, downsampling the LUT) is not an acceptable v1 fallback for
export. It is acceptable as a *preview-only* debug toggle when diagnosing
mobile perf, as described in the performance prototype gate.

A one-day implementation prototype on an iPhone 13-class Safari is the
falsifiability check for the preview side of the recommendation. If
preview drops below 60 fps, the diagnosis must distinguish whether the
selective-color pass is the cause or whether the existing pipeline was
already at the budget — only the former warrants shader simplification.

## Failure handling

### Precision parity between preview and export

Preview runs in WebGL2 RGBA16F intermediates; export runs in CPU F32. The
sign-preserving cube-root and the 1D LUT linear interpolation are the two
ULP-sensitive steps.

To avoid drift between the two implementations, both paths use the same
`signedCbrt(x) = sign(x) * pow(abs(x), 1/3)` formulation rather than the
runtime's native `Math.cbrt`. CPU code calls `Math.pow(Math.abs(x), 1/3)`
with explicit sign restoration. GPU code calls `pow(abs(x), 1.0/3.0)` with
the same sign restoration. Using the algorithmically-identical formulation
on both sides drops parity drift below the test threshold even though it
sacrifices a fraction of an ULP versus the platform `cbrt`.

The contract is that **export is the authoritative output**; preview must
follow it within ±1 LSB per 8-bit channel on the canonical swatch grid that
spans all eight band centers and the seam at 0/360°. A parity test in a new
`selective-color.parity.test.ts` loads the same swatch grid, runs both the
CPU helper from the package and the GLSL helper via headless WebGL2, and
asserts the bound.

If the bound is violated in practice, the resolution is to investigate the
divergence — typically driver-specific GLSL `pow` precision on a particular
GPU — rather than to silently quantize the user's image. The CPU export path
is never downgraded to match a flawed GPU path; the GPU preview path is the
side that must converge on the authoritative result.

### LUT seam handling

The 256→0 seam at the hue axis is the most likely visual artifact site.
The shader interpolates explicitly across `(i, (i + 1) mod 256)` rather than
relying on `GL_REPEAT`. A test asserts that a continuous hue ramp at constant
chroma and lightness with `red.saturation = +50` shows no derivative
discontinuity at hue 0/360°.

### Chroma noise floor

The `CHROMA_CLAMP_LOW`/`HIGH` thresholds protect near-achromatic pixels.
A test loads a synthetic mid-grey patch and asserts that a `red.hue = +100`
shift produces a visible delta no larger than the clamp envelope allows.

### Failure mode catalog (informational)

The prior research documents at least six failure modes; the math contract
and tests address them as follows:

| Failure mode             | Mitigation                                       |
| ------------------------ | ------------------------------------------------ |
| Sky cyan → teal          | OKLab working space + `aqua_no_shift_under_desaturation` test (mirrored by `blue_purple_no_shift` for the blue band) |
| Skin drift across non-adjacent bands | Smoothstep fall-off keeps yellow/green/blue/etc out; tested via `skin_isolation_under_yellow` |
| Skin shared between red and orange | Intentional — adjacent bands share by partition-of-unity; exact derived shift (not zero) asserted via `skin_attenuation_under_red`, `skin_band_maps_to_orange`, and `skin_band_partition_of_unity` |
| Foliage clip             | Chroma stays unclamped here; downstream owns it  |
| Neon highlight desat     | LUT-survival test compares preview vs export     |
| Magenta ↔ red wrap       | Explicit seam interpolation + seam test          |
| Shadow color amplification | Chroma-attenuation clamp + grey-patch test    |

## Tests and acceptance

Focused tests should cover:

**Parameter normalization**

- `normalizeSelectiveColorParams` clamps and defaults invalid input across
  all 24 scalars.
- `state_safety`: a state-store update on one band leaves the other seven
  bands unchanged by reference and by value.

**Hue coordinate**

- `hue_axis_origin` (synthetic, polar-form only): an OKLab vector with
  `a > 0, b = 0` (e.g. `a = 0.25, b = 0`) maps to `h_norm = 0` and to LUT
  index 0 within F64 tolerance. A vector with `a = 0, b > 0` maps to
  `h_norm = 0.25` (LUT index 64). This test does not touch any sRGB
  swatch — it is the pure-math gate on `atan2 / (2π) + 1` wrapping.
- `canonical_red_lut_position` (end-to-end): linear sRGB red `(1, 0, 0)`
  pushed through the full sRGB → linear ProPhoto → OKLab pipeline
  produces `h_norm ≈ 0.0811`, i.e. LUT index ≈ 20.8 (between integer
  positions 20 and 21). This test asserts the red BAND is **not** at the
  seam — the seam (index 255→0) sits inside the magenta→red bracket,
  not at the red band centre.
- `canonical_swatch_dominance`: at each of the eight anchors documented
  in the band-center table — sRGB primaries/secondaries and the two
  OKLCh midpoints — applying that anchor's hue slider at any non-zero
  deflection (with all other sliders zero) produces an observed OKLCh
  hue shift whose effective weight `w_eff = observed / ((slider / 100) *
  HUE_MAX_DELTA_RAD)` is **≥ 0.99**. `w_eff = 1` is **not** achievable
  in general: the documented band centres fall on fractional LUT
  positions (red ≈ 20.76, orange ≈ 49.42, yellow ≈ 78.08, green ≈
  101.33, aqua ≈ 138.52, blue ≈ 187.88, purple ≈ 210.77, magenta ≈
  233.60), so the seam-aware sample at the anchor interpolates between
  two LUT entries each carrying a smoothstep weight slightly below 1.0.
  Worked example for the red anchor under `red.hue = +50`: LUT[20] at
  `h_i = 28.125°` (inside the magenta→red bracket) holds red weight
  `1 − smoothstep(0.9823) ≈ 0.9990`; LUT[21] at `h_i = 29.531°` (inside
  the red→orange bracket) holds red weight `1 − smoothstep(0.00821)
  ≈ 0.9998`; the seam-aware sample at LUT position 20.76 lerps these
  with `t ≈ 0.76`, giving `w_eff ≈ 0.9996`, i.e. observed shift
  `0.5 * 0.9996 * π/6 ≈ 0.2617 rad` against the ideal `0.5 * 1.0 * π/6
  ≈ 0.2618 rad`. The test computes the expected bound from the
  implementation's actual `BAND_CENTERS_RAD` and `LUT_SIZE` — the 0.99
  floor above is a discretization safety margin for `LUT_SIZE = 256`
  combined with RGBA16F storage noise, not a fixed numeric threshold.
- `canonical_swatch_isolation`: at each anchor, applying any **non-adjacent
  band's** slider (the five bands other than the anchor's two
  immediate neighbours) with the anchor's own slider zero produces an
  observed shift of **exactly 0** within F32 tolerance. This is
  algebraic, not numeric: the two LUT bins straddling the anchor each
  embed shifts only from the two surrounding bracket centres
  (magenta+red for the LUT bin to the left of the red anchor,
  red+orange for the bin to the right), so any non-adjacent slider is
  literally absent from the LUT values being sampled. The "at most
  0.10" wording from earlier drafts was wrong — the contribution is
  zero by construction, not "small". Note: the two **adjacent** bands
  (e.g. magenta and orange for the red anchor) do leak in a tiny
  amount because the LUT bin to the left of red embeds a small
  magenta-weighted contribution; that leakage is bounded by `1 − w_eff
  ≤ 0.01` from the dominance bound above and is documented behaviour
  matching the "skin shared between red and orange" entry in the
  failure-mode catalog.
- `band_centers_match_table`: `BAND_CENTERS_RAD` recomputed at module load
  matches the documented degree values within ±0.5°. The documented values
  are now precise to 1 decimal degree
  (29.2 / 69.5 / 109.8 / 142.5 / 194.8 / 264.2 / 296.4 / 328.5), so the
  ±0.5° gate is no longer a tolerance for sloppy documentation — it is a
  drift detector for the underlying ProPhoto/Bradford/M1/M2 constants.
- `band_center_boundary_consistency`: at `h_i` equal to a band centre
  exactly, `adjacentBandCenters` may pick either bracket; both bracket
  choices must produce the same LUT entry within F32 tolerance (both
  resolve to 100% weight on the centre band, one via `t' = 0` and the
  other via `t' = 1`).
- `seam_continuity`: rendering a continuous OKLCh hue ramp at constant
  `L = 0.7, C = 0.10` with `red.saturation = +50` shows no derivative
  discontinuity across the seam (between LUT positions 255 and 0,
  i.e. OKLCh hue 360°/0°, inside the magenta→red bracket) — the
  numerical derivative there is bounded by the same threshold as the
  derivative at any other band-bracket interior position.

**Neutral identity (extends to negative and out-of-gamut input)**

- `neutral_identity_in_gamut`: ColorChecker grid through the pass with all
  scalars zero produces zero per-channel delta in 8-bit output.
- `neutral_identity_above_clip`: input `(1.4, 1.2, 1.5)` passes through
  unchanged within F32 tolerance.
- `neutral_identity_negative_lms`: a synthetic wide-gamut sample that
  produces a negative LMS channel after `M_proPhotoToLMS` passes through
  unchanged within F32 tolerance — proves `signedCbrt` round-trips through
  the negative branch and validates that `max(LMS, 0)` was correctly
  rejected.

**Bake correctness**

- `partition_of_unity_exactly_two_bands`: for each of the 256 LUT
  positions, **exactly two** band centres contribute and their weights
  sum to 1 within F32 tolerance. The earlier "sum ≈ 1" formulation was
  too weak: any two-band linear interpolation passes it by algebra. The
  tightened form additionally asserts that the bracket finder selects
  exactly two centres (no three-way contribution, no single-centre
  fallback) and that the six non-adjacent centres each receive **exactly
  zero** weight at that LUT position.
- `bake_field_naming`: the bake reads `band.saturation` and not `band.sat`
  (regression catch from spec evolution).
- `bake_size_invariant`: the output buffer is exactly 1024 entries; never
  1020, never 1028.

**OKLab round-trip**

- OKLab forward and inverse round-trip for the 24 ColorChecker patches at
  ≤ `1e-5` per channel against an F64 reference, and ≤ `1e-3` per channel
  in F32.

**Failure-mode coverage**

The canonical skin patch used by the four `skin_*` tests below is
pinned to `OKLab(L = 0.70, a = 0.072, b = 0.072)`, i.e. OKLCh
`(L = 0.70, C ≈ 0.102, h = 45°)`. The chroma value sits comfortably above
`CHROMA_CLAMP_HIGH = 0.020`, so the chroma-attenuation strength is
exactly 1 for this patch and the tests can compute expected shifts as
algebraic equalities rather than ranges. Deep-skin variants with lower
chroma fall into the smoothstep ramp between `CHROMA_CLAMP_LOW` and
`CHROMA_CLAMP_HIGH` by design; that behaviour is verified separately by
`chroma_amplitude_clamp` and is intentional (it suppresses hue-noise
amplification on near-grey shadows), not a bug.

- `blue_purple_no_shift`: a hue ramp at `OKLCh.L = 0.7, C = 0.10` reduced
  to `C = 0.05` by `blue.saturation = -50` stays within `1e-2` of its
  source OKLCh hue across the 270–330° segment.
- `aqua_no_shift_under_desaturation`: the analogous "sky cyan → teal"
  failure mode. A hue ramp at `OKLCh.L = 0.7, C = 0.10` reduced to
  `C = 0.05` by `aqua.saturation = -50` stays within `1e-2` of its
  source OKLCh hue across the 165–225° segment. This is the test the
  failure-mode catalog's "Sky cyan → teal" entry refers to; without it
  the blue check alone leaves the aqua band's perceptual stability
  unverified.
- `skin_attenuation_under_red`: the pinned skin patch sits in the
  red→orange interpolation region. Define
  `t(h) = (h − red°) / (orange° − red°)` and
  `w_red(h) = 1 − smoothstep(t(h))` using the implementation's actual
  `BAND_CENTERS_RAD` (red ≈ 29.2°, orange ≈ 69.5°). At h = 45° the bake
  computes `t ≈ 0.391`, `smoothstep(t) ≈ 0.338`, and
  `w_red(45°) ≈ 0.662`. Under `red.hue = +50` with all other scalars
  zero, the bake's LUT entry at the patch hue equals exactly
  `(red.hue / 100) * w_red(45°) * HUE_MAX_DELTA_RAD`. The test computes
  the expected value from the implementation's own constants (not from
  hard-coded literals) and asserts the observed OKLCh-hue shift equals
  it within F32 LUT-sampling tolerance (≈ 1e-4 rad). The illustrative
  magnitude is `0.50 * 0.662 * π/6 ≈ 0.173 rad ≈ 9.9°`.
  The shift is non-zero by design: the smoothstep partition-of-unity bake
  intentionally lets adjacent bands share the skin region so "warmer
  skin" via coordinated red + orange edits feels natural, matching
  Lightroom Color Mixer and Capture One Basic Color Editor.
- `skin_band_maps_to_orange`: the same pinned skin patch under
  `orange.hue = +50` with all other scalars zero produces a shift of
  exactly `(orange.hue / 100) * (1 − w_red(45°)) * HUE_MAX_DELTA_RAD`,
  illustratively `0.50 * 0.338 * π/6 ≈ 0.088 rad ≈ 5.1°`. The test again
  derives the expected value from the implementation's own constants.
- `skin_band_partition_of_unity`: with `red.hue = orange.hue = +50` and
  all other scalars zero, the pinned skin patch shift equals exactly
  `0.50 * HUE_MAX_DELTA_RAD ≈ 0.262 rad ≈ 15.0°`, regardless of the
  precise `w_red(45°)` value — confirming the red+orange weights sum to
  1 and that the user's "warmer skin" coordinated-edit expectation is
  met exactly.
- `skin_isolation_under_yellow`: the same pinned skin patch under
  `yellow.hue = ±50` shifts by less than `1e-6` OKLCh radians (i.e.
  exactly zero within F32 numeric tolerance) — skin is isolated from
  non-adjacent bands because the bake at hue 45° draws its
  interpolation only from the surrounding two centres (red and orange),
  with algebraically zero contribution from yellow/green/aqua/blue/
  purple/magenta by the design of `adjacentBandCenters`.
- `chroma_amplitude_clamp`: a mid-grey patch (OKLCh chroma 0.001, well
  below `CHROMA_CLAMP_LOW`) under `red.hue = +100` produces a
  per-channel delta below `1 / 255` in the 8-bit output.
- `cross_talk_smoothness`: a continuous hue ramp at constant `L`, `C`,
  sheared by `red.hue = +50`, has no derivative discontinuity at band
  edges — numerical derivative below the configured threshold.

**Texture / sampler parity**

- `texture_parity_centres`: random LUT contents sampled at
  `h_norm = i / 256` agree bit-for-bit between the CPU `sampleSelectiveColorLut`
  and the headless WebGL2 helper for all `i`.
- `texture_parity_midpoints`: same agreement at `h_norm = (i + 0.5) / 256`.
- `texture_parity_seam`: same agreement at `h_norm` just below and just
  above the 255→0 boundary.

**Backend parity**

- `lut_survival_pixel_parity`: a swatch grid run through the CPU row-band
  processor and through the headless WebGL2 helper produces identical
  8-bit output within ±1 LSB per channel.

**Graph + lifecycle**

- `graph_step_composition`: the shared graph includes `user-selective-color`
  after `user-regional-tone` and before any `gamut-to-lut-input`.
- `graph_step_no_buffer`: `UserSelectiveColorGraphStep` does not include a
  `Float32Array` field. The compiler enforces this; the test guards
  against future regressions through type assertion.
- `lut_ownership`: after `resolveSelectiveColorParams` is called and the
  graph step is captured, mutating the pooled `Float32Array(1024)`
  out-buffer in place does not change the graph fingerprint, the histogram
  job key, or any previously captured export snapshot.
- Export invalidation: changing any band scalar clears a ready export
  result.
- Histogram recompute: changing any band scalar requeues the histogram
  job.

**UI**

- Desktop `Adjust` switches between Tone, Color, and HSL without crossing
  reset scopes.
- Mobile `Adjust` exposes HSL without adding a fifth dock mode.
- HSL band focus does not cross with Color or Tone focus.

**Performance micro-benchmark (lands with implementation)**

- `bench_selective_color_row`: a 1 MP synthetic image processed through
  `applySelectiveColorRow` reports per-step pixels/ms (matmul forward,
  `signedCbrt`, `atan2`, LUT sample, `sin/cos(delta)`, matmul inverse) so
  regressions can be attributed and the export budget can be defended
  with measured numbers rather than estimates.

Manual QA:

- processed preview changes immediately when dragging any HSL slider;
- compare left side remains unchanged while the right side reflects HSL
  edits;
- exported JPEG matches the processed preview directionally for no-LUT and
  supported custom-LUT graphs across the eight band centers;
- a real RAW with a clear blue sky exhibits no visible cyan→teal shift under
  `blue.saturation = -50`;
- a real RAW with face-forward skin exhibits a *moderate, smooth* skin
  shift under `red.hue = +50` (not zero — adjacent-band sharing is by
  design), and zero visible shift under `yellow.hue = ±50` or
  `green.hue = ±50`;
- a real RAW with face-forward skin exhibits a smoothly matched shift when
  `red.hue` and `orange.hue` are dialed together — confirming the
  documented "coordinate red and orange for skin" UX expectation;
- mobile slider drag stays above 55 fps on an iPhone 13-class device for the
  duration of a one-second drag;
- reset HSL does not reset tone or color, and vice versa.

## Performance prototype gate

Before promoting selective color out of feature-flag in production, a one-day
device prototype must verify on iPhone 13-class Safari:

- preview frame time during slider drag at the actual `/raw` preview canvas
  size stays at or above 55 fps for ≥ 95 % of frames in a one-minute drag
  log;
- 16 MP export wall-clock for the selective-color stage stays within the
  performance budget above;
- the selective-color stage in isolation adds less than 5 ms per frame in
  preview when measured against the same scene with selective color disabled.

If preview budget is missed and the cause is the selective-color pass, the
short-term mitigation is to disable the chroma-clamp `smoothstep` and the
explicit seam interpolation behind an internal switch and re-measure; if
either reproduces the budget, that becomes the v1 quality versus performance
trade-off. The user-facing controls do not change.

If the cause is upstream pipeline cost, that is a separate engineering issue
and selective color ships unchanged. The diagnosis path is part of this gate
explicitly so the team does not respond to a pre-existing performance issue
by removing HSL.

## Complexity and sequencing

The OKLab/OKLCh primitives, the LUT bake, and the row-band processor are the
fixed cost. The 24 scalars and the packed LUT are cheap once that machinery
is in place.

Recommended implementation order:

1. Add OKLab forward/inverse and OKLCh helpers in `@lumaforge/luma-color-runtime`
   with F64-reference parity tests against published ColorChecker values.
2. Add `selective-color.ts` with the LUT bake, the row-band apply, and the
   GLSL string. Land the failure-mode catalog tests early so they constrain
   the apply function.
3. Add `user-selective-color` graph step and thread it through
   `color-graph.ts`, the row-band processor, and the export graph resolver.
4. Add preview shader uniforms, pooled LUT textures, and the
   `applyUserSelectiveColor` shader call in the right slot of the main
   function. Run the headless WebGL2 parity test.
5. Add desktop `AdjustTool` three-segment control and `HSLTool` with band
   rows.
6. Add mobile `HSL` subpanel inside the expanded `Adjust` panel with the
   focused-slider HUD wired to per-band rows.
7. Run focused runtime, color graph, row-band processor, preview shader,
   histogram, export-invalidation, UI, browser, and CPU-degraded preview
   tests. The CPU preview path must continue to apply selective color
   correctly.
8. Extend `package-boundary.test.ts` to assert that selective color runs
   end-to-end via `@lumaforge/luma-color-runtime` alone — no transitive
   `src/` import on the call graph from the package entry point through
   `applySelectiveColorRow`. This guarantees the future CLI/headless
   package can adopt selective color without app dependencies.
9. Run the performance prototype on iPhone 13-class Safari.

The primary architectural constraint is parity, not UI. Preview, CPU preview
fallback, histogram, and full-resolution export must consume the same
normalized graph semantics and the same OKLab math.

## Open questions deferred to follow-up work

- **Split Toning / Color Grading three-way panel.** Lightroom places this
  display-referred after tone; darktable's `color balance rgb` keeps it
  scene-referred. The choice depends on whether LumaForge treats split-toning
  as colour correction (scene) or creative grade (display). A separate spec
  decides.
- **Color Mixer naming and Look serialization.** Lightroom renamed `HSL` to
  `Color Mixer` in CC 10.4. Until selective color is part of a serialized
  Look format, the LumaForge UI label `HSL` is acceptable.
- **User-tunable band centers or smoothness slider.** darktable's color
  equalizer exposes a global node-position rotation. LumaForge defers this
  until user data shows the eight fixed centers leave a real gap.
- **Guided filter on the selection weights.** darktable's color equalizer
  applies one. The current spec relies on OKLab plus chroma-clamp; if the
  prototype shows mottled edges on high-ISO skies, a separable spatial pass
  on the selection weights becomes a v2 enhancement.
- **WebGPU re-evaluation.** Reconsider migrating selective color (and the
  rest of `src/lib/gl`) to WebGPU once iOS Safari WebGPU has shipped stably
  for twelve months and Chrome Android stable covers Samsung Xclipse. The
  expected wall-clock gain for selective color specifically is small (the
  workload is one extra fragment pass with a single packed 1D LUT sample),
  so the
  migration is justified by general pipeline benefits, not by HSL alone.
- **WASM-SIMD-threaded CPU preview path.** The existing `src/lib/preview`
  CPU-degraded path is pure TS today. SIMD/threaded acceleration is a
  separate optimization, gated on the COOP/COEP cost analysis of the
  calibration profile and native-artifact CDN contracts. Selective color
  must continue to work on the un-accelerated path until that work happens.
