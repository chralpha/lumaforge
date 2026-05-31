# Relative temperature and tint adjust design

Date: 2026-05-31

Related documents:

- [`2026-04-24-phase2-raw-color-pipeline-color-science-audit.md`](./2026-04-24-phase2-raw-color-pipeline-color-science-audit.md)
- [`2026-04-26-full-resolution-raw-compatibility-design.md`](./2026-04-26-full-resolution-raw-compatibility-design.md)
- [`2026-04-30-luma-color-runtime-package-design.md`](./2026-04-30-luma-color-runtime-package-design.md)
- [`2026-05-01-basic-tone-exposure-contrast-design.md`](./2026-05-01-basic-tone-exposure-contrast-design.md)
- [`2026-05-02-preview-histogram-design.md`](./2026-05-02-preview-histogram-design.md)

## Goal

Add relative `Temperature` and `Tint` controls to RAW Lab as basic color
adjustments that sit beside, but not inside, the existing tone controls.

The user-facing information architecture should become:

```text
Adjust
-> Tone
-> Color
```

`Tone` continues to own exposure, contrast, highlights, shadows, whites, and
blacks. `Color` owns relative temperature and tint in this phase. Both subpanels
belong to the same Adjust group because they are foundational image adjustments,
not LUT/style selection.

The processing model must keep color balance separate from tone so future color
controls such as vibrance or saturation can expand the `Color` subpanel without
polluting `ToneValue`, `resetTone`, tone copy, or tone tests.

## Scope

This spec covers:

- relative, neutral-centered `Temperature` and `Tint` controls;
- an `Adjust` tool grouping that contains independent `Tone` and `Color`
  subpanels;
- shared `@lumaforge/luma-color-runtime` parameter normalization, graph
  descriptor, CPU row-band execution, and GLSL preview parity;
- preview histogram, export invalidation, and full-resolution export parity;
- desktop and mobile RAW Lab surface changes needed to expose the controls.

## Non-goals

- Do not implement absolute Kelvin white balance.
- Do not expose camera profile, illuminant selection, or as-shot/manual WB
  modes.
- Do not re-run RAW decode, LibRaw `dcraw_process`, or processed-window reads
  when temperature or tint changes.
- Do not change LibRaw's current camera-white-balance and camera-matrix policy.
- Do not place temperature or tint inside the `Tone` data type or reset path.
- Do not solve built-in style export support.
- Do not add recipe persistence or URL sharing for these new controls in this
  phase.

## Current system context

`@lumaforge/luma-raw-runtime` returns editable preview buffers and export
processed windows as `linear-prophoto-rgb` with camera white balance and the
camera matrix already applied. Existing specs explicitly require tone controls
not to re-apply camera white balance or a camera matrix.

The current shared color graph begins:

```text
input-linear-prophoto
-> raw-render-exposure
-> user-exposure
-> user-contrast
-> user-regional-tone
```

For no-LUT export it then goes to `output-srgb`. For custom LUT export it
continues through LUT input gamut, transfer encoding, 3D LUT sampling, LUT
output handling, and `output-srgb`.

Preview and full-resolution export already share the same graph intent:

- WebGL preview applies uniforms in `src/lib/gl/pipeline.ts` and
  `src/lib/gl/shaders.ts`.
- Full-resolution export uses the `@lumaforge/luma-color-runtime` graph and
  row-band processor.
- Preview histogram builds a graph from the same `ProcessingParams` and should
  remain independent of compare split position.

The new color adjustment must enter that same shared graph. A preview-only
shader helper or built-in warm/cool style is not acceptable because export and
histogram would drift from preview.

## Product decision

Use an `Adjust` group with two subpanels:

```text
Adjust
  Tone
    Exposure
    Contrast
    Highlights
    Shadows
    Whites
    Blacks

  Color
    Temperature
    Tint
```

Desktop should replace the current `Tone` tool card with an `Adjust` card. The
card body uses a segmented control for `Tone` and `Color`. The selected subpanel
shows only the relevant sliders and reset action.

Mobile should replace the bottom dock's current `Tone` mode label with
`Adjust`, preserving the number of dock modes. The expanded panel uses the same
`Tone`/`Color` subpanel choice before entering any focused slider editor. This
avoids adding a fifth dock tab and keeps basic editing in one place.

Reset behavior remains scoped:

- `Reset tone` resets only tone parameters.
- `Reset color` resets only temperature and tint.
- A global `Reset adjust` is not part of V1, because it would make accidental
  cross-subpanel loss easier on mobile.

## User controls

Add a separate color-balance parameter interface in
`@lumaforge/luma-color-runtime`:

```ts
export interface LumaColorBalanceParams {
  userTemperature: number
  userTint: number
}
```

`ProcessingParams` should include these fields directly, while still keeping
the source interfaces separate:

```ts
export interface LumaColorProcessingParams
  extends LumaColorToneParams,
    LumaColorBalanceParams {
  intensity: number
  viewMode: 'processed' | 'original' | 'compare'
  compareSplit: number
  styleKind: 'none' | 'builtin' | 'custom'
  builtinPreset: BuiltinStylePreset | null
}
```

Defaults:

```ts
userTemperature: 0
userTint: 0
```

UI ranges:

- `Temperature`: `-100` to `+100`, integer display, neutral `0`.
- `Tint`: `-100` to `+100`, integer display, neutral `0`.

Interpretation:

- positive `Temperature` means warmer;
- negative `Temperature` means cooler;
- positive `Tint` means more magenta;
- negative `Tint` means more green.

Runtime hard normalization:

- non-finite values normalize to `0`;
- `userTemperature` clamps to `[-100, 100]`;
- `userTint` clamps to `[-100, 100]`.

The UI may label the controls `Temperature` and `Tint`, but product copy and
internal code should treat them as relative adjustments. They are not Kelvin or
camera-native white-balance values.

## Math contract

The V1 color balance is a deterministic scene-linear RGB gain in Linear
ProPhoto RGB after RAW render exposure and before tone.

Normalize controls:

```text
temperatureNorm = clamp(userTemperature, -100, 100) / 100
tintNorm = clamp(userTint, -100, 100) / 100
```

Resolve channel gains in EV-like units:

```text
TEMP_MAX_EV = 0.22
TINT_MAX_EV = 0.16
TINT_RED_BLUE_SHARE = 0.35

rawR = pow(2, temperatureNorm * TEMP_MAX_EV
            + tintNorm * TINT_MAX_EV * TINT_RED_BLUE_SHARE)
rawG = pow(2, -tintNorm * TINT_MAX_EV)
rawB = pow(2, -temperatureNorm * TEMP_MAX_EV
            + tintNorm * TINT_MAX_EV * TINT_RED_BLUE_SHARE)
```

Normalize gains so neutral gray keeps the same scene-linear luminance under the
runtime's Linear ProPhoto luminance coefficients:

```text
L = vec3(0.2880402, 0.7118741, 0.0000857)
lumaScale = 1 / max(dot(vec3(rawR, rawG, rawB), L), 1e-6)
gain = vec3(rawR, rawG, rawB) * lumaScale
```

Apply:

```text
colorBalanced = sceneLinearProPhoto * gain
```

Neutral behavior:

```text
userTemperature = 0
userTint = 0
gain = vec3(1)
```

The operator does not clamp. Downstream tone, LUT input conversion, and final
output encoding already define where non-negative clamps occur. Preserving this
contract keeps color balance composable with existing tone behavior.

## Graph order

Insert a new graph step after `raw-render-exposure` and before user tone:

```text
input-linear-prophoto
-> raw-render-exposure
-> user-color-balance
-> user-exposure
-> user-contrast
-> user-regional-tone
-> optional LUT input/output handling
-> output-srgb
```

New graph step shape:

```ts
type UserColorBalanceGraphStep = {
  kind: 'user-color-balance'
  temperature: number
  tint: number
  gain: readonly [number, number, number]
  operator: 'linear-prophoto-relative-rgb-gain'
  luminanceCoefficients: readonly [number, number, number]
}
```

`ExportColorGraphStep` should include this variant in addition to the existing
input, raw-render-exposure, tone, LUT, built-in style, and output variants.

The step must be present even at neutral values, matching the existing tone
graph style. This keeps graph fingerprints stable and makes export snapshots
explicit about the active color-balance state.

## Runtime modules

Add a new color-balance module in `@lumaforge/luma-color-runtime`, separate from
`tone.ts`:

```text
src/color-balance.ts
```

Responsibilities:

- define `LumaColorBalanceParams`;
- normalize relative temperature and tint;
- resolve RGB gain;
- apply color balance into caller-owned RGB tuples for CPU code;
- export GLSL helper snippets for preview parity.

`tone.ts` should not import this module. Higher-level graph construction should
compose both modules.

`types.ts` should export `ProcessingParams` as the composition of look, tone, and
color-balance fields.

`color-graph.ts` should resolve normalized color-balance params and place the
new step before tone.

`row-band-processor.ts` should multiply the scene-linear ProPhoto values by the
resolved gain after raw render exposure and before exposure/contrast/regional
tone.

## Preview shader

WebGL preview should add uniforms for the resolved gain, not recompute UI
normalization in shader code:

```text
uniform vec3 u_userColorBalanceGain;
```

The main preview path becomes:

```text
technicalBaseSceneLinearProPhoto =
  readInputSceneLinearProPhoto(uv) * u_rawRenderExposureMultiplier

colorBalancedSceneLinearProPhoto =
  technicalBaseSceneLinearProPhoto * u_userColorBalanceGain

editedBaseSceneLinearProPhoto =
  applyUserTone(colorBalancedSceneLinearProPhoto, toneUniforms)
```

Compare/original semantics:

- `Original` remains the technical base after RAW render exposure only.
- `Processed` includes color balance, tone, and style/LUT.
- `Compare` left side remains technical base; right side includes the full edit.

This mirrors the current tone behavior and makes the relative color adjustment a
real edit rather than a viewing transform.

## Full-resolution export

Full-resolution export should receive the same normalized color-balance fields
when building `resolveExportColorGraph`.

No LibRaw API changes are required for V1. The export path keeps reading
`LumaRawProcessedWindow` rows that are already `linear-prophoto-rgb` and
`colorApplied: true`, then applies color balance in the app-owned row-band
processor.

Changing temperature or tint must invalidate any ready export result because the
render graph output changes.

Export snapshots should include a separate color object:

```ts
color: {
  userTemperature: number
  userTint: number
}
```

Do not place these fields under the existing `tone` snapshot key.

## Preview histogram

The histogram job key must include `userTemperature` and `userTint`.

The histogram graph should pass the color-balance fields into
`resolveExportColorGraph` so output bins reflect the same processed preview edit
as export.

The histogram remains unavailable for embedded-only preview sources and remains
independent of compare split position.

## State and UI integration

Processing defaults must include:

```ts
userTemperature: 0
userTint: 0
```

Add color-specific helpers instead of expanding tone helpers:

```ts
setColorParams(params: Partial<Pick<ProcessingParams,
  'userTemperature' | 'userTint'
>>): void

resetColor(): void
```

`setToneParams` and `resetTone` keep their current scope.

Desktop:

- `RawToolSurface` receives separate `tone` and `color` values.
- `AdjustTool` owns the subpanel switch and delegates to `ToneTool` or
  `ColorTool`.
- `ToneTool` should not know about temperature or tint.
- `ColorTool` owns its schema, fields, formatting, neutral detection, and reset
  action.

Mobile:

- Rename the dock label from `Tone` to `Adjust`.
- Keep the dock mode count unchanged.
- Add a subpanel selector for `Tone` and `Color` inside the expanded Adjust
  panel.
- Reuse the existing focused slider interaction pattern for color fields, but
  with color-specific field metadata and formatting.
- Keep tone focus and color focus state separate so switching subpanels does not
  reuse the wrong key type.

Localization:

- Add `raw.adjust.title`, `raw.adjust.tone`, and `raw.adjust.color`.
- Keep existing `raw.tone.*` keys.
- Add `raw.color.temperature`, `raw.color.tint`, `raw.color.reset`,
  `raw.color.note`, and `raw.color.preserved`.

## Validation

Focused tests should cover:

- `normalizeColorBalanceParams` clamps and defaults invalid input.
- Neutral color balance resolves to gain `[1, 1, 1]`.
- Positive temperature increases red relative to blue after luminance
  normalization.
- Negative temperature increases blue relative to red.
- Positive tint reduces green relative to red/blue.
- Negative tint increases green relative to red/blue.
- The shared graph includes `user-color-balance` after `raw-render-exposure` and
  before `user-exposure`.
- CPU row-band no-LUT export applies color balance before tone.
- GPU preview threads `u_userColorBalanceGain`.
- Changing temperature or tint clears a ready export result.
- Preview histogram recomputes when temperature or tint changes.
- Desktop Adjust can switch between Tone and Color without crossing reset
  scopes.
- Mobile Adjust exposes Tone and Color without adding a fifth dock mode.

Manual QA should verify:

- processed preview changes immediately when dragging either slider;
- compare left side remains unchanged while the right side reflects color edits;
- exported JPEG matches the processed preview directionally for no-LUT and
  supported custom-LUT graphs;
- reset tone does not reset color;
- reset color does not reset tone.

## Complexity and sequencing

Temp and tint should ship together. The fixed cost is introducing a separate
Color adjustment chain through shared params, graph, preview, export, histogram,
and UI. Tint adds only one additional parameter, one slider, and a small amount
of normalization/formatting/test coverage once that chain exists.

Recommended implementation order:

1. Add color-balance math and graph support in `@lumaforge/luma-color-runtime`.
2. Thread color-balance params through preview, histogram, export, and
   invalidation.
3. Add desktop `Adjust` grouping with `Tone` and `Color` subpanels.
4. Add mobile `Adjust` grouping with the existing focused-slider interaction.
5. Run focused runtime, export, histogram, and RAW processor UI tests.

The main architectural constraint is parity, not UI. Preview, histogram, and
full-resolution export must all consume the same normalized graph semantics.
