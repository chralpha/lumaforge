# Phase 2 Scene-Referred LUT Pipeline Implementation Path

Date: 2026-04-24

Related audit: [`docs/specs/2026-04-24-raw-color-pipeline-color-science-audit.md`](../specs/2026-04-24-raw-color-pipeline-color-science-audit.md)

## 1. Goal

Phase 2 should make LumaForge a consumer-friendly **N-to-N RAW/LUT adapter**:

```text
N camera RAW sources
  -> one normalized scene-linear working representation
  -> M LUT-declared input gamut/log spaces
  -> correct display/photo output
```

The user-facing workflow should remain simple:

```text
Open RAW photo -> choose style LUT -> choose or confirm LUT input profile -> export photo
```

The internal pipeline must be color-science correct:

```text
RAW
  -> Linear ProPhoto RGB scene-linear
  -> LUT input gamut linear
  -> LUT input transfer/log curve
  -> 3D LUT
  -> declared LUT output handling
  -> display/photo output transform
```

This is **not** a high-end intermediate interchange product. Phase 2 does not need EXR, OCIO config authoring, ACES AMF export, or complex middleware integration. It does need the final exported photo to be produced by the same scene-referred transform graph used for preview, so the style is accurate and not accidentally double-transformed.

## 2. Non-Goals

- Do not expose users to ACES/OCIO project setup, EXR interchange, or color-management jargon unless they open an advanced panel.
- Do not build a full grading application.
- Do not claim perfect cross-camera spectral matching. The RAW decode is still LibRaw Linear ProPhoto, not a camera-specific ACES IDT library.
- Do not keep applying camera-log LUTs after display sRGB conversion.
- Do not assume a LUT is correct just because a filename contains a brand name.

## 3. Selected Architecture

### 3.1 Recommended Option: Scene-Referred Preview and Export

This is the selected Phase 2 architecture.

```text
LibRaw RGB16 Linear ProPhoto D50
  -> preview or export shader
  -> ProPhoto D50 to target gamut linear, with chromatic adaptation
  -> target transfer function encode
  -> LUT sampling
  -> LUT output interpretation
  -> display/photo output transform
```

The term "preview-first" only describes the product priority: fast interactive preview and normal photo export. It does **not** mean the LUT remains display-referred. Camera/log LUTs must be applied before display output.

### 3.2 Alternatives Considered

#### Alternative A: Keep Display-Referred LUTs

```text
Linear ProPhoto -> display sRGB -> LUT
```

This is fast and simple, but incorrect for LogC4, Log3G10, V-Log, S-Log3, Canon Log, N-Log, F-Log, ACEScc, ACEScct, and similar LUTs. It remains useful only for LUTs explicitly authored for display sRGB.

Decision: keep as a compatibility mode, but not as the default for camera-log LUTs.

#### Alternative B: Full OCIO/ACES Runtime in Browser

This would provide the strongest transform graph semantics, but it adds WASM/runtime size, config complexity, slower startup, and a UX burden that does not match the product goal.

Decision: defer. The Phase 2 registry should be designed so an OCIO backend can replace or supplement the custom shader graph later.

#### Alternative C: CPU Transform Before GPU LUT

CPU-transforming every pixel into each LUT input space is easier to debug but too slow for high-resolution RAW previews and repeated style switching.

Decision: use CPU only for metadata, matrix preparation, validation, and tests. Per-pixel transforms belong on the GPU.

## 4. Color Profile Model

Phase 2 must stop treating a LUT input as a single loose string such as `v-log`. A LUT profile is a contract:

```ts
export type LUTRole =
  | 'display-look'
  | 'scene-creative'
  | 'technical-output'
  | 'combined-look-output'

export type SignalRange = 'full' | 'legal' | 'unknown'

export interface LUTColorProfile {
  id: string
  label: string
  role: LUTRole
  inputGamut: ColorGamutId
  inputTransfer: TransferFunctionId
  inputRange: SignalRange
  outputGamut?: ColorGamutId
  outputTransfer?: TransferFunctionId
  outputRange?: SignalRange
  aliases: string[]
  source?: string
}
```

The important distinction is:

- `inputGamut`: the RGB primary set expected by the LUT.
- `inputTransfer`: the curve expected by the LUT.
- `role`: whether the LUT is a pure creative transform, a technical/output transform, or a combined creative/output LUT.
- `outputGamut` and `outputTransfer`: required when the LUT output is not the same scene/log space as the input.

## 5. Required LUT Profile Catalog

Phase 2 should ship a built-in searchable catalog. Unknown LUTs should open the selector with filename-based suggestions, but the user must be able to override them.

### 5.1 Tier 1: Must Ship in Phase 2

These cover the requested mainstream camera and LUT ecosystems.

| Brand / Ecosystem | Preset ID                  | Input gamut              | Input transfer |
| ----------------- | -------------------------- | ------------------------ | -------------- |
| ARRI              | `arri-awg4-logc4`          | ARRI Wide Gamut 4        | LogC4          |
| ARRI              | `arri-awg3-logc3`          | ARRI Wide Gamut 3        | LogC3          |
| RED               | `red-rwg-log3g10`          | REDWideGamutRGB          | Log3G10        |
| Nikon ZR / RED    | `nikon-zr-rwg-log3g10`     | REDWideGamutRGB          | Log3G10        |
| Nikon             | `nikon-bt2020-nlog`        | Rec.2020 / BT.2020       | N-Log          |
| Sony              | `sony-sgamut3cine-slog3`   | S-Gamut3.Cine            | S-Log3         |
| Sony              | `sony-sgamut3-slog3`       | S-Gamut3                 | S-Log3         |
| Sony              | `sony-sgamut-slog2`        | S-Gamut                  | S-Log2         |
| Canon             | `canon-cinema-gamut-clog2` | Canon Cinema Gamut       | Canon Log 2    |
| Canon             | `canon-cinema-gamut-clog3` | Canon Cinema Gamut       | Canon Log 3    |
| Canon             | `canon-cinema-gamut-clog`  | Canon Cinema Gamut       | Canon Log      |
| Fujifilm          | `fuji-fgamut-flog`         | F-Gamut                  | F-Log          |
| Fujifilm          | `fuji-fgamut-flog2`        | F-Gamut                  | F-Log2         |
| Fujifilm          | `fuji-fgamutc-flog2c`      | F-Gamut C                | F-Log2C        |
| Panasonic         | `panasonic-vgamut-vlog`    | V-Gamut                  | V-Log          |
| ACES              | `aces-ap1-acescc`          | ACES AP1                 | ACEScc         |
| ACES              | `aces-ap1-acescct`         | ACES AP1                 | ACEScct        |
| Display           | `display-srgb`             | sRGB / Rec.709 primaries | sRGB           |
| Display           | `rec709-gamma24`           | Rec.709                  | Gamma 2.4      |

Notes:

- Nikon ZR is listed separately for UX clarity, but it maps to REDWideGamutRGB / Log3G10 when the LUT is authored for Log3G10.
- Nikon N-Log LUTs, including RED-supervised Nikon creative LUTs, should remain separate from Nikon ZR Log3G10 LUTs.
- Fujifilm F-Log2C uses the F-Log2 curve but a different gamut preset.
- ACEScc and ACEScct must both be supported because LUTs may be authored for either.

### 5.2 Tier 2: Add After Tier 1 Is Stable

These are useful for N-to-N coverage but should not block the first Phase 2 release:

| Brand / Ecosystem             | Preset examples                                                                           |
| ----------------------------- | ----------------------------------------------------------------------------------------- |
| Blackmagic Design             | BMD Wide Gamut Gen 4 / Gen 5 + Film Gen 4 / Gen 5                                         |
| DJI                           | D-Gamut / D-Log, D-Gamut / D-Log M                                                        |
| Apple                         | Apple Log, likely paired with Rec.2020-style wide gamut handling                          |
| Leica                         | L-Log, likely Rec.2020 or Leica-declared gamut depending on source                        |
| Hasselblad / DJI stills looks | display-referred or vendor-profiled creative LUTs unless a log/gamut contract is declared |
| Generic cinema                | Cineon / Printing Density style film LUT inputs                                           |

Tier 2 should be added through the same registry, not by adding ad hoc shader branches.

## 6. Transform Graph

### 6.1 Scene-Referred Creative LUT

Use this path when a LUT expects a camera-log input and returns the same or another scene-referred encoding:

```text
Linear ProPhoto D50
  -> target gamut linear
  -> target transfer encode
  -> LUT
  -> output transfer decode, if outputTransfer is declared
  -> output gamut to display linear
  -> display encoding
```

Example:

```text
Linear ProPhoto D50
  -> AWG4 linear D65
  -> LogC4
  -> LUT
  -> LogC4 decode, if LUT output remains LogC4
  -> AWG4 linear to display linear sRGB
  -> sRGB encode
```

### 6.2 Combined Look + Output LUT

Most consumer LUTs are not pure scene-referred creative transforms. Many are named like:

```text
SLog3_SGamut3Cine_to_Rec709.cube
VLog_to_Rec709.cube
RWG_Log3G10_to_REC709_BT1886.cube
CinemaGamut_CanonLog3-to-BT709_WideDR.cube
```

These should use:

```text
Linear ProPhoto D50
  -> LUT input gamut linear
  -> LUT input transfer encode
  -> LUT
  -> declared output display decode, if needed
  -> canvas/export sRGB encode
```

If the LUT output is Rec.709 / BT.1886 / gamma 2.4, the output should not be sent through another camera output transform. It should be treated as display-referred output and converted to the canvas/export target.

### 6.3 Display LUT Compatibility

Keep the Phase 1 path for LUTs explicitly marked as display sRGB:

```text
Linear ProPhoto D50
  -> display sRGB
  -> display LUT
```

This is a compatibility mode for web/photo LUTs, Lightroom-like LUTs, and LUTs that are authored over already-rendered images.

## 7. File-Level Implementation Plan

### 7.1 Color Registry

Create:

```text
src/lib/color/registry.ts
src/lib/color/registry.test.ts
```

Responsibilities:

- Define `ColorGamutId`, `TransferFunctionId`, `LUTColorProfile`, and `LUTRole`.
- Store primaries, white points, aliases, and official-source URLs.
- Store transfer function metadata and reference points.
- Export Tier 1 profile presets.
- Provide lookup helpers:

```ts
getColorGamut(id: ColorGamutId)
getTransferFunction(id: TransferFunctionId)
getLUTColorProfile(id: string)
searchLUTColorProfiles(query: string)
inferLUTColorProfileHints(input: { title: string; sourceName?: string; comments: string[] })
```

### 7.2 Transfer Functions

Modify:

```text
src/lib/color/log-encoding.ts
src/lib/color/log-encoding.test.ts
```

Add or validate:

- S-Log2
- S-Log3
- Canon Log
- Canon Log 2
- Canon Log 3
- N-Log
- F-Log
- F-Log2
- F-Log2C alias to F-Log2 curve
- V-Log
- LogC3
- LogC4
- Log3G10
- ACEScc
- ACEScct
- sRGB
- gamma 2.4

Each transfer function needs:

- encode
- decode
- reference points
- official source URL
- tests for zero/black, 18% gray where published, and a high reference point where published

### 7.3 Matrix and Gamut Conversion

Modify:

```text
src/lib/color/constants.ts
src/lib/color/matrix.ts
src/lib/color/matrix.test.ts
```

Required additions:

- ACES AP1
- Canon Cinema Gamut
- S-Gamut
- S-Gamut3
- S-Gamut3.Cine
- V-Gamut
- F-Gamut
- F-Gamut C
- N-Log Rec.2020 preset
- ARRI Wide Gamut 3
- ARRI Wide Gamut 4
- REDWideGamutRGB
- Rec.709 / sRGB
- Display P3, if export target selection is added

The CPU should precompute:

```text
Linear ProPhoto D50 -> target gamut linear
LUT output gamut linear -> display/export target linear
```

The shader should receive those matrices as uniforms. Do not hard-code only V-Gamut in GLSL.

### 7.4 LUT Parser and Metadata

Modify:

```text
src/lib/lut/cube-parser.ts
src/lib/lut/cube-parser.test.ts
src/lib/gl/pipeline.ts
src/modules/raw-processor/services/style-system.ts
```

Replace:

```ts
type LUTInputProfile = 'display-srgb' | 'v-log'
```

With:

```ts
type LUTProfileResolution =
  | {
      kind: 'resolved'
      profile: LUTColorProfile
      confidence: 'explicit' | 'filename' | 'user'
    }
  | { kind: 'needs-user-selection'; suggestions: LUTColorProfile[] }
```

`.cube` files rarely contain enough standardized metadata. Phase 2 should:

- Parse comments and title.
- Preserve comments for hinting.
- Infer likely profiles from filename and comments.
- Detect common output phrases: `to Rec709`, `BT709`, `BT.1886`, `WideDR`, `LC-709`, `709 Type A`, `to Linear`, `to Cineon`.
- Show the selector when confidence is not high.
- Persist the user's chosen profile per LUT file fingerprint.

### 7.5 UI Profile Selector

Modify:

```text
src/modules/raw-processor/components/ControlsPanel.tsx
src/modules/raw-processor/services/style-system.ts
src/modules/raw-processor/state/session.atoms.ts
```

The user interaction should be:

```text
Upload LUT
  -> app suggests "Sony S-Gamut3.Cine / S-Log3 -> Rec.709"
  -> user can accept or open "Change LUT input"
  -> searchable preset list grouped by Brand / Log / Output
```

The UI copy should avoid pro-only jargon while still being precise:

```text
LUT input: Sony S-Gamut3.Cine / S-Log3
LUT output: Rec.709 display
```

For unknown LUTs:

```text
This LUT does not declare its color input. Choose the camera/log space it was made for.
```

### 7.6 GPU Shader Pipeline

Modify:

```text
src/lib/gl/shaders.ts
src/lib/gl/pipeline.ts
src/lib/gl/shaders.test.ts
src/lib/gl/pipeline-input.test.ts
```

The U16 shader must stop converting to display sRGB inside `readInputColor()`. Instead:

```text
readInputSceneLinearProPhoto()
  -> scene LUT branch or display branch
```

New uniforms:

```glsl
uniform mat3 u_inputToLutGamut;
uniform mat3 u_lutOutputToDisplayGamut;
uniform int u_lutInputTransfer;
uniform int u_lutOutputTransfer;
uniform int u_lutRole;
uniform int u_lutInputRange;
uniform int u_lutOutputRange;
```

Shader stages:

```text
1. Read Linear ProPhoto RGB from RGB16 texture.
2. If display LUT: convert to display sRGB and sample LUT.
3. If scene/log LUT:
   a. Matrix to target linear gamut.
   b. Encode target transfer/log.
   c. Apply legal/full-range scaling if needed.
   d. Sample LUT.
   e. Interpret LUT output according to role/output profile.
   f. Convert to display/export target.
4. Mix intensity in the correct domain:
   - display LUTs: display domain
   - scene creative LUTs: preferably scene-linear after decoding output
   - combined output LUTs: display domain
5. Encode to canvas sRGB.
```

Performance policy:

- Branch by one uniform per frame, not per LUT sample.
- Precompute matrices on CPU.
- Keep 3D LUT as GPU texture.
- Use tetrahedral interpolation only if performance is acceptable; otherwise keep trilinear and list tetrahedral as Phase 2.1.
- Prefer `RGBA16F` processing targets when available; fall back to `RGBA8` with a visible capability warning only if necessary.

### 7.7 Export Path

Modify:

```text
src/lib/gl/export.ts
src/lib/gl/pipeline.ts
src/modules/raw-processor/services/export-system.ts
```

The export path must use the same scene-referred pipeline as preview, not a separate display shortcut.

For normal consumer export:

```text
full-resolution RAW decode
  -> same transform graph
  -> canvas/export sRGB
  -> JPEG or PNG
```

Large-file strategy:

- If the full image exceeds GPU max texture size or memory budget, export in tiles.
- Tiling is safe because Phase 2 color transforms are per-pixel and have no spatial dependencies.
- Stitch tiles into the export canvas before JPEG/PNG encoding.

This keeps the final photo color-science correct without exposing users to high-precision intermediate files.

## 8. Validation Strategy

### 8.1 Numeric Tests

Add tests for:

- Transfer function reference points.
- Encode/decode round trips.
- Matrix round trips for known gamuts.
- D50 to D65 chromatic adaptation.
- LUT profile inference from real-world filenames.

### 8.2 Shader Equivalence Tests

For each Tier 1 profile:

```text
CPU reference transform
  vs
GPU shader transform on synthetic color patches
```

Use:

- neutral ramp
- RGB primary ramp
- saturation sweep
- skin-tone-like patches
- high-saturation edge cases

Tolerance should be profile-specific, but initial target can be:

```text
max absolute channel error <= 2/255 for display output
```

### 8.3 Golden LUT Tests

Create or obtain small legal test LUTs:

- identity display sRGB LUT
- identity V-Log/V-Gamut technical LUT
- identity LogC4/AWG4 technical LUT
- identity RWG/Log3G10 technical LUT
- simple contrast LUT with declared output

These do not need to be vendor LUTs. They can be generated internally from the same profile definitions to validate routing, domain scaling, and output interpretation.

## 9. Performance Targets

Interactive preview:

```text
<= 16 ms shader processing for common preview sizes on a modern laptop GPU
<= 33 ms on weaker integrated GPUs
```

LUT switching:

```text
3D LUT upload should be the dominant one-time cost.
Profile changes should only update uniforms and re-render.
```

Export:

```text
Full-size export should prefer quality and correctness over interactivity.
Tile export should prevent max-texture-size failures for large RAW files.
```

Memory:

```text
Avoid CPU-side full-resolution float buffers.
Keep RAW upload as RGB16 where possible.
Use GPU matrices and 3D textures for transforms.
```

## 10. Implementation Sequence

### Milestone 1: Registry and Metadata

- Add the color registry.
- Add Tier 1 profile presets.
- Add transfer-function reference tests.
- Add gamut matrix tests.
- Keep existing behavior unchanged.

### Milestone 2: LUT Profile Resolution

- Extend `.cube` parsing.
- Add filename/comment inference.
- Add manual profile selection model.
- Persist selected profile per LUT fingerprint.
- Keep old `display-srgb` and `v-log` mappings through compatibility aliases.

### Milestone 3: Scene-Referred Shader Branch

- Refactor U16 shader to preserve Linear ProPhoto until after LUT handling.
- Add matrix uniforms.
- Add transfer-function enum uniforms.
- Support Tier 1 log encoders in GLSL.
- Support combined-output LUT handling.
- Verify with synthetic identity LUTs.

### Milestone 4: Consumer UI

- Add a compact LUT profile selector.
- Show inferred input/output profile.
- Warn only when the profile is unknown or confidence is low.
- Avoid blocking casual users when inference is high.

### Milestone 5: Correct Export

- Route export through the same transform graph.
- Add full-resolution capability checks.
- Add tiled export when needed.
- Add export tests for selected LUT profiles.

### Milestone 6: Quality and Performance Hardening

- Add shader/CPU equivalence tests.
- Add performance telemetry around transform path, LUT upload, and export.
- Add fallback warnings for low-precision WebGL devices.
- Evaluate tetrahedral interpolation as an optional quality upgrade.

## 11. Phase 2.1 Deferrals

The following items are explicitly deferred from the Phase 2 acceptance bar and
should be tracked as Phase 2.1 quality upgrades:

- Real GPU shader-vs-CPU pixel equivalence tests over rendered synthetic color
  patches.
- Tetrahedral 3D LUT interpolation and related quality/performance evaluation.
- Product-level export telemetry surfacing or persistence, beyond the internal
  pipeline telemetry needed for diagnostics.

## 12. Product UX Principle

The user should not have to understand the full transform graph. The advanced truth is:

```text
input gamut + input log + LUT role + output interpretation
```

The consumer-facing UI should say:

```text
This LUT was made for: Sony S-Gamut3.Cine / S-Log3
This LUT outputs: Rec.709 photo/display
```

For unknown LUTs:

```text
Choose what the LUT was made for.
```

That single choice is the key to N-to-N compatibility.

## 13. Official Reference Sources

- ACES Input Transforms: <https://docs.acescentral.com/system-components/input-transforms/>
- ACEScc Specification: <https://docs.acescentral.com/encodings/acescc/>
- ACEScct Specification: <https://docs.acescentral.com/encodings/acescct/>
- ARRI LogC4 Specification: <https://www.arri.com/resource/blob/278790/bea879ac0d041a925bed27a096ab3ec2/2022-05-arri-logc4-specification-data.pdf>
- REDWideGamutRGB and Log3G10 White Paper: <https://docs.red.com/955-0187/PDF/915-0187%20Rev-C%20%20%20RED%20OPS%2C%20White%20Paper%20on%20REDWideGamutRGB%20and%20Log3G10.pdf>
- RED IPP2 Image Pipeline Stages: <https://docs.red.com/915-0190/915-0190%20Rev-D%20%20%20RED%20OPS%2C%20IPP2%20Image%20Pipeline%20Stages.pdf>
- Sony S-Gamut3.Cine/S-Gamut3/S-Log3 Technical Summary: <https://www.sony.jp/ls-camera/knowledge/pdf/TechnicalSummary_for_S-Gamut3Cine_S-Gamut3_S-Log3_V1_00.pdf>
- Canon Log Gamma Curves White Paper: <https://www.usa.canon.com/content/dam/canon-assets/white-papers/pro/white-paper-canon-log-gamma-curves.pdf>
- Nikon Log/RAW Technical Guide: <https://onlinemanual.nikonimglib.com/technicalguide/log_raw/video_recording_editing/en/pdf/TG_Log-RAW_%28En%2902.pdf>
- Nikon ZR product page: <https://imaging.nikon.com/imaging/lineup/z_cinema/z_r/>
- Fujifilm F-Log Data Sheet: <https://dl.fujifilm-x.com/support/lut/F-Log_DataSheet_E_Ver.1.2.pdf>
- Fujifilm F-Log2 Data Sheet: <https://dl.fujifilm-x.com/support/lut/F-Log2_DataSheet_E_Ver.1.1.pdf>
- Panasonic V-Log/V-Gamut Reference Manual: <https://pro-av.panasonic.net/en/cinema_camera_varicam_eva/support/pdf/VARICAM_V-Log_V-Gamut.pdf>
