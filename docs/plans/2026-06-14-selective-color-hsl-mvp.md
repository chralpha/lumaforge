# Selective Color HSL MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the scene-referred OKLab/OKLCh per-band HSL feature defined in the spec, end to end: package math + bake + apply, GLSL helper strings, color-graph integration, CPU row-band export, WebGL2 preview shader, desktop and mobile UI surfaces, full test suite (named tests from the spec), and a measured perf prototype gate. Preview and export must produce pixel-identical 8-bit output through one shared apply function; nothing math-shaped lives outside `@lumaforge/luma-color-runtime`.

**Architecture:** The package gains two new modules (`oklab.ts` and `selective-color.ts`) plus a new `user-selective-color` graph step variant. `row-band-processor.ts` and `color-graph.ts` thread the new step. The app gains one extra fragment-shader pass slot in `src/lib/gl/shaders.ts`, two new uniforms in `src/lib/gl/pipeline.ts` (one packed RGBA16F 256×1 lookup texture + chroma-clamp vec2), state helpers and atoms under `src/modules/raw-processor/state`, a new desktop `HSLTool` next to `ToneTool`/`ColorTool`, and a third Mobile Adjust subpanel. CLI/headless compatibility is enforced by extending `package-boundary.test.ts` to assert the package's `applySelectiveColorRow` is reachable with no `src/` import on the call graph.

**Tech Stack:** TypeScript, `@lumaforge/luma-color-runtime` (Vitest + tsc), Vitest (app), WebGL2 (RGBA16F render targets via `EXT_color_buffer_float`), Playwright (browser smoke), motion/react under existing LazyMotion, Jotai for state, react-router. No new dependencies. No WebGPU. No WASM SIMD.

**Spec:** [`docs/specs/2026-06-14-selective-color-hsl-mvp-design.md`](../specs/2026-06-14-selective-color-hsl-mvp-design.md)

---

## File Structure

| File | Action | Responsibility |
| --- | --- | --- |
| `packages/luma-color-runtime/src/oklab.ts` | **Create** | Composed ProPhoto↔LMS matrices, `signedCbrt`, `linearProPhotoToOklab`, `oklabToLinearProPhoto`, `oklabToOklch`, `oklchToOklab`, `OKLAB_GLSL` string. |
| `packages/luma-color-runtime/src/oklab.test.ts` | **Create** | F64 ColorChecker round-trip, signed-cbrt negative-LMS round-trip, F32 tolerance bounds. |
| `packages/luma-color-runtime/src/selective-color.ts` | **Create** | Types (`HSLBandId`, `HSLBandShift`, `LumaColorSelectiveColorParams`, factory `makeNeutralBand`), constants (`BAND_CENTERS_RAD`, `HUE_MAX_DELTA_RAD`, `SAT_MAX_FACTOR`, `LIGHT_MAX_DELTA`, `CHROMA_CLAMP_LOW`, `CHROMA_CLAMP_HIGH`, `LUT_CONSTANTS_VERSION`), `resolveSelectiveColorParams`, `sampleSelectiveColorLut`, `applySelectiveColorRow`, `SELECTIVE_COLOR_GLSL`. |
| `packages/luma-color-runtime/src/selective-color.test.ts` | **Create** | All math-contract tests named in spec §Tests and acceptance. |
| `packages/luma-color-runtime/src/selective-color.parity.test.ts` | **Create** | `lut_survival_pixel_parity` — CPU vs headless WebGL2 swatch grid. |
| `packages/luma-color-runtime/src/color-graph.ts` | **Modify** | Add `UserSelectiveColorGraphStep` variant to `ExportColorGraphStep`; resolve it after `user-regional-tone` and before LUT input conversion. |
| `packages/luma-color-runtime/src/color-graph.test.ts` | **Modify** | Assert graph composition includes new step in the right slot. |
| `packages/luma-color-runtime/src/types.ts` | **Modify** | Extend `LumaColorProcessingParams` with `LumaColorSelectiveColorParams`. |
| `packages/luma-color-runtime/src/row-band-processor.ts` | **Modify** | Call `applySelectiveColorRow` after regional tone and before LUT input. |
| `packages/luma-color-runtime/src/row-band-processor.test.ts` | **Modify** | Cover row-band selective-color pass at neutral and non-neutral. |
| `packages/luma-color-runtime/src/package-boundary.test.ts` | **Modify** | Add CLI-importable assertion: `applySelectiveColorRow` reachable with no `src/` import. |
| `packages/luma-color-runtime/src/index.ts` | **Modify** | Re-export new symbols. |
| `src/lib/gl/shaders.ts` | **Modify** | Concatenate `OKLAB_GLSL` + `SELECTIVE_COLOR_GLSL`; add `u_selectiveColorLUT` + `u_selectiveColorChromaClamp` uniforms; call `applyUserSelectiveColor` between tone and LUT/style branches. |
| `src/lib/gl/shaders.test.ts` | **Modify** | Assert new uniforms appear in the shader source. |
| `src/lib/gl/pipeline.ts` | **Modify** | Allocate one 256×1 `RGBA16F` texture + one pooled `Float32Array(1024)` per session; `texSubImage2D` upload on resolved-params change. |
| `src/lib/gl/pipeline.test.ts` | **Modify** | Assert uniform locations resolved, texture format `RGBA16F`, `NEAREST` filtering. |
| `src/modules/raw-processor/state/processing-defaults.ts` | **Modify** | Add neutral selective-color block to defaults. |
| `src/modules/raw-processor/state/processing-atoms.ts` | **Modify** | Add atoms, `setSelectiveColorBand`, `resetSelectiveColor`. |
| `src/modules/raw-processor/state/processing-atoms.test.ts` | **Modify** | Cover `state_safety` invariant and reset-scope independence. |
| `src/modules/raw-processor/components/RawWorkflowToolProvider.tsx` | **Modify** | Bridge selective-color state/actions to tool surfaces. |
| `src/modules/raw-processor/components/tools/AdjustTool.tsx` | **Modify** | Replace 2-segment Tone/Color with 3-segment Tone/Color/HSL. |
| `src/modules/raw-processor/components/tools/HSLTool.tsx` | **Create** | 8 bands × 3 sliders, reset action, neutral indicator. |
| `src/modules/raw-processor/components/tools/HSLTool.test.tsx` | **Create** | UI structure, slider ranges, neutral detection, reset scope. |
| `src/modules/raw-processor/components/mobile/AdjustListPanel.tsx` | **Modify** | Add HSL subpanel selector entry. |
| `src/modules/raw-processor/components/mobile/HSLListPanel.tsx` | **Create** | Mobile band-list view, focused-slider HUD wiring. |
| `src/modules/raw-processor/components/mobile/HSLListPanel.test.tsx` | **Create** | Mobile UI structure, band focus, slider focus separation. |
| `src/lib/preview/cpu-render.ts` | **Modify** | CPU-degraded preview path consumes the package's row-band apply. |
| `src/lib/export/export-worker.ts` | **Modify** | Export worker threads new params into `resolveExportColorGraph`. |
| `src/lib/export/export-worker.test.ts` | **Modify** | Export invalidation on band scalar change; processed snapshot includes `selectiveColor`. |
| `src/modules/raw-processor/services/preview/histogram.ts` | **Modify** | Histogram job key includes the 24 scalars (or a hash of the resolved LUT). |
| `src/i18n/locales/en.ts` (and other locales) | **Modify** | `raw.adjust.hsl`, `raw.hsl.bands.*`, `raw.hsl.fields.*`, `raw.hsl.reset`, `raw.hsl.note`. |
| `tests/browser/raw-hsl-smoke.spec.ts` | **Create** | Playwright smoke: dial each band, observe processed preview update, run export, assert no error. |
| `scripts/bench-selective-color-row.ts` | **Create** | 1 MP synthetic image → `applySelectiveColorRow`, reports per-step pixels/ms. |

No new top-level dependencies. No new locales. No new generated routes.

---

## Task 1: Set up isolated worktree

**Files:** (none yet)

- [ ] **Step 1: Confirm clean working tree on `main`**

```bash
git status --short
git rev-parse --abbrev-ref HEAD
```

Expected: empty for the first command, `main` for the second.

- [ ] **Step 2: Create the worktree and branch**

Per CLAUDE.md Git Worktree Policy:

```bash
pnpm worktree feat/selective-color-hsl-mvp
```

Expected: `.worktrees/feat-selective-color-hsl-mvp` checked out at branch `feat/selective-color-hsl-mvp`, branched from `main`.

- [ ] **Step 3: Verify worktree**

```bash
git -C .worktrees/feat-selective-color-hsl-mvp rev-parse --abbrev-ref HEAD
git -C .worktrees/feat-selective-color-hsl-mvp status --short
```

Expected: `feat/selective-color-hsl-mvp`, empty status.

> **All subsequent tasks operate on `.worktrees/feat-selective-color-hsl-mvp`.** Bash cwd does not persist between calls (see memory `feedback_worktree_cwd_hazard`). Use absolute paths or `git -C .worktrees/feat-selective-color-hsl-mvp ...` for every command. Edits go to files under `.worktrees/feat-selective-color-hsl-mvp/...`.

---

## Task 2: OKLab/OKLCh primitives in the package

**Files:**
- Create: `.worktrees/feat-selective-color-hsl-mvp/packages/luma-color-runtime/src/oklab.ts`
- Create: `.worktrees/feat-selective-color-hsl-mvp/packages/luma-color-runtime/src/oklab.test.ts`

- [ ] **Step 1: Write failing F64 round-trip tests (TDD red)**

Cover, in `oklab.test.ts`:
- 24 ColorChecker patches: `linearProPhotoToOklab` ↔ `oklabToLinearProPhoto` round-trip within `1e-5` per channel against F64 reference (build reference values by reproducing the spec's composed matrix product in the test file with literal F64 constants — do not import from `oklab.ts`).
- Signed-cbrt branch: synthetic wide-gamut samples that produce a negative LMS channel round-trip within `1e-5` per channel. Asserts `signedCbrt` plus element-wise cube symmetry.
- `oklabToOklch` ↔ `oklchToOklab` round-trip on a 24-sample hue ramp at `L = 0.7, C = 0.10` within F32 tolerance.
- Hue convention: `(a > 0, b = 0)` → `atan2 = 0` → `h_norm = 0` (matches spec test `hue_axis_origin`).

Run:

```bash
cd .worktrees/feat-selective-color-hsl-mvp && pnpm --filter @lumaforge/luma-color-runtime test src/oklab.test.ts
```

Expected: red (oklab module missing).

- [ ] **Step 2: Implement `oklab.ts` (TDD green)**

Export, per spec §Runtime package modules / oklab.ts:
- `M_PROPHOTO_TO_LMS`, `M_LMS_TO_PROPHOTO`, `M_LMS_TO_OKLAB`, `M_OKLAB_TO_LMS` as `Float32Array` constants. Compute the composed `M_PROPHOTO_TO_LMS` as the static product (linear ProPhoto → XYZ-D50) × (Bradford D50→D65) × (Ottosson M1). Compute `M_LMS_TO_PROPHOTO` as `mat3Invert(M_PROPHOTO_TO_LMS)`. Quantize to F32 at module load.
- `signedCbrt(x: number)` scalar helper.
- `linearProPhotoToOklab(rgb, out?)` and `oklabToLinearProPhoto(lab, out?)` with caller-owned out-buffers (no per-call allocation).
- `oklabToOklch(lab, out?)` and `oklchToOklab(lch, out?)` — same.
- `OKLAB_GLSL` exported string constant containing:
  ```glsl
  // Composed matrices as `const mat3` literals.
  // signedCbrt(float) and signedCbrt(vec3) helpers.
  // linearProPhotoToOklab(vec3) and oklabToLinearProPhoto(vec3) helpers.
  ```
  The GLSL must match the TS algorithm bit-for-bit modulo `pow` driver precision (see spec §Failure handling / Precision parity).

Re-run the test command. Expected: green.

- [ ] **Step 3: Verify package build + types**

```bash
pnpm --filter @lumaforge/luma-color-runtime typecheck
pnpm --filter @lumaforge/luma-color-runtime build
```

Expected: clean.

- [ ] **Step 4: Commit checkpoint**

```bash
git -C .worktrees/feat-selective-color-hsl-mvp add packages/luma-color-runtime/src/oklab.ts packages/luma-color-runtime/src/oklab.test.ts
git -C .worktrees/feat-selective-color-hsl-mvp commit --no-gpg-sign -m "feat(color-runtime): OKLab/OKLCh primitives for selective color"
```

---

## Task 3: Selective-color types, constants, and band-center calibration

**Files:**
- Create: `.worktrees/feat-selective-color-hsl-mvp/packages/luma-color-runtime/src/selective-color.ts`
- Create: `.worktrees/feat-selective-color-hsl-mvp/packages/luma-color-runtime/src/selective-color.test.ts`

- [ ] **Step 1: Write failing tests for types, factory, and band centers (TDD red)**

Cover, in `selective-color.test.ts`:
- `state_safety`: `makeNeutralBand()` returns a fresh object each call; mutating one band's resolved shift leaves the other seven unchanged by reference and by value (see spec §User controls).
- `hue_axis_origin`: synthetic OKLab `(a = 0.25, b = 0)` maps to `h_norm = 0`, LUT index 0 (see spec §Math contract Step 1).
- `canonical_red_lut_position`: linear sRGB red `(1, 0, 0)` through full pipeline → `h_norm ≈ 0.0811` → LUT index ≈ 20.8.
- `band_centers_match_table`: `BAND_CENTERS_RAD` recomputed at module load matches the documented degree values 29.2 / 69.5 / 109.8 / 142.5 / 194.8 / 264.2 / 296.4 / 328.5 within ±0.5°.
- `band_center_boundary_consistency`: at `h_i` equal to a band centre exactly, both bracket choices in `adjacentBandCenters` produce the same LUT entry within F32 tolerance.

Run:

```bash
pnpm --filter @lumaforge/luma-color-runtime test src/selective-color.test.ts
```

Expected: red.

- [ ] **Step 2: Implement types, factory, constants, band-center calibration (TDD green)**

Export, per spec §User controls and §Math contract:
- Type aliases and interfaces: `HSLBandId`, `HSLBandShift` (deep-readonly), `LumaColorSelectiveColorParams` (deep-readonly), `NormalizedSelectiveColorBands`.
- `makeNeutralBand(): HSLBandShift` — fresh object factory.
- Constants: `HUE_MAX_DELTA_RAD = Math.PI / 6`, `SAT_MAX_FACTOR = 1.0`, `LIGHT_MAX_DELTA = 0.20`, `CHROMA_CLAMP_LOW = 0.005`, `CHROMA_CLAMP_HIGH = 0.020`, `LUT_SIZE = 256`, `LUT_CONSTANTS_VERSION = 1`.
- `BAND_CENTERS_RAD: readonly number[]` — eight angles in radians, computed at module load from:
  1. sRGB primaries/secondaries fed through `(sRGB → linear sRGB)` → `(linear sRGB → linear ProPhoto via inverse of getLinearProPhotoToGamutMatrix('srgb-rec709'))` → `linearProPhotoToOklab` → `oklabToOklch`.
  2. Two midpoints derived as OKLCh short-arc midpoints between adjacent primaries.
- `adjacentBandCenters(h_i: number): [leftIdx: number, rightIdx: number]` — left-inclusive convention at exact band boundaries (see spec §Bake / `wrapFraction`).
- `wrapFraction(h: number, left: number, right: number): number` — explicit reference implementation from spec.

Re-run test command. Expected: green.

- [ ] **Step 3: Verify**

```bash
pnpm --filter @lumaforge/luma-color-runtime typecheck
pnpm --filter @lumaforge/luma-color-runtime build
```

Expected: clean.

- [ ] **Step 4: Commit checkpoint**

```bash
git -C .worktrees/feat-selective-color-hsl-mvp add packages/luma-color-runtime/src/selective-color.ts packages/luma-color-runtime/src/selective-color.test.ts
git -C .worktrees/feat-selective-color-hsl-mvp commit --no-gpg-sign -m "feat(color-runtime): selective-color types, factory, OKLCh band-center calibration"
```

---

## Task 4: Bake function + partition-of-unity tests

**Files:**
- Modify: `.worktrees/feat-selective-color-hsl-mvp/packages/luma-color-runtime/src/selective-color.ts`
- Modify: `.worktrees/feat-selective-color-hsl-mvp/packages/luma-color-runtime/src/selective-color.test.ts`

- [ ] **Step 1: Write failing tests for the bake (TDD red)**

Add to `selective-color.test.ts`:
- `bake_size_invariant`: `resolveSelectiveColorParams` writes exactly 1024 entries.
- `bake_field_naming`: bake reads `band.saturation` (regression guard).
- `partition_of_unity_exactly_two_bands`: for every LUT position, exactly two band centres contribute, their weights sum to 1 within F32, and the six non-adjacent centres each receive exactly zero weight.

Run. Expected: red.

- [ ] **Step 2: Implement `resolveSelectiveColorParams` and `mixBandShift` (TDD green)**

Per spec §Bake:
- `mixBandShift(left, right, t)`: per-component lerp of three shift scalars.
- `resolveSelectiveColorParams(params, outBuffer?)` returns
  ```ts
  { step: UserSelectiveColorGraphStep, prepared: PreparedSelectiveColorLut }
  ```
  The packed RGBA layout is `[hueShift, satMul, lightAdd, 0]` per LUT index; total length `4 * 256 = 1024`. When `outBuffer` is undefined, allocate. When supplied, write in place. The returned `prepared.buffer` is the same `Float32Array` reference passed in.
- The graph step contains normalized scalars + `chromaClampLow`, `chromaClampHigh`, `workingSpace: 'oklab-via-prophoto-d65'`, `operator: 'oklch-per-band-shift'`, `constantsVersion: LUT_CONSTANTS_VERSION`. **No `Float32Array` field.**

Re-run. Expected: green.

- [ ] **Step 3: Verify**

```bash
pnpm --filter @lumaforge/luma-color-runtime test src/selective-color.test.ts
pnpm --filter @lumaforge/luma-color-runtime typecheck
```

Expected: clean.

- [ ] **Step 4: Commit checkpoint**

```bash
git -C .worktrees/feat-selective-color-hsl-mvp add packages/luma-color-runtime/src/selective-color.ts packages/luma-color-runtime/src/selective-color.test.ts
git -C .worktrees/feat-selective-color-hsl-mvp commit --no-gpg-sign -m "feat(color-runtime): selective-color LUT bake with smoothstep partition-of-unity"
```

---

## Task 5: Apply function (CPU row-band) and the full failure-mode test sweep

**Files:**
- Modify: `.worktrees/feat-selective-color-hsl-mvp/packages/luma-color-runtime/src/selective-color.ts`
- Modify: `.worktrees/feat-selective-color-hsl-mvp/packages/luma-color-runtime/src/selective-color.test.ts`

- [ ] **Step 1: Write the full named-test sweep (TDD red)**

Add the remaining spec tests to `selective-color.test.ts`:
- `canonical_swatch_dominance` (≥ 0.99 effective weight at each anchor)
- `canonical_swatch_isolation` (exactly 0 from non-adjacent bands)
- `neutral_identity_in_gamut` (ColorChecker grid)
- `neutral_identity_above_clip` (`(1.4, 1.2, 1.5)`)
- `neutral_identity_negative_lms` (synthetic wide-gamut sample producing negative LMS)
- `seam_continuity` at the 255→0 boundary
- `blue_purple_no_shift`
- `aqua_no_shift_under_desaturation`
- `skin_attenuation_under_red` (pinned skin patch `OKLab(0.70, 0.072, 0.072)`)
- `skin_band_maps_to_orange`
- `skin_band_partition_of_unity`
- `skin_isolation_under_yellow`
- `chroma_amplitude_clamp`
- `cross_talk_smoothness`

Each test derives its expected value from the implementation's actual `BAND_CENTERS_RAD` and `HUE_MAX_DELTA_RAD` — no hard-coded numeric literals other than band-anchor sRGB tuples and the documented constants. Run. Expected: red.

- [ ] **Step 2: Implement `applySelectiveColorRow` and `sampleSelectiveColorLut` (TDD green)**

Per spec §Math contract Step 2–4:
- `sampleSelectiveColorLut(buffer, hNorm)`: fractional lookup with `i1 = (i0 + 1) % 256`, returns `(hueShift, satMul, lightAdd, reserved)`.
- `applySelectiveColorRow(input, lut, output, length)`:
  1. `linearProPhotoToOklab` → `oklabToOklch` (polar).
  2. `strength = smoothstep(CHROMA_CLAMP_LOW, CHROMA_CLAMP_HIGH, C)`.
  3. `sample = sampleSelectiveColorLut(lut, h_norm)`.
  4. `delta = strength * sample.r`, `scale = mix(1, sample.g, strength)`, `addL = strength * sample.b`.
  5. Direct `(a, b)` rotation: `a_out = (a*cos(delta) - b*sin(delta)) * scale`, `b_out = (a*sin(delta) + b*cos(delta)) * scale`, `L_out = L + addL`.
  6. `oklabToLinearProPhoto` inverse. No clamp.

Re-run. Expected: green.

- [ ] **Step 3: Verify**

```bash
pnpm --filter @lumaforge/luma-color-runtime test
pnpm --filter @lumaforge/luma-color-runtime typecheck
pnpm --filter @lumaforge/luma-color-runtime build
```

Expected: clean across the whole package.

- [ ] **Step 4: Commit checkpoint**

```bash
git -C .worktrees/feat-selective-color-hsl-mvp add packages/luma-color-runtime/src/selective-color.ts packages/luma-color-runtime/src/selective-color.test.ts
git -C .worktrees/feat-selective-color-hsl-mvp commit --no-gpg-sign -m "feat(color-runtime): selective-color CPU apply with OKLab roundtrip and chroma clamp"
```

---

## Task 6: GLSL helper strings + headless WebGL2 parity

**Files:**
- Modify: `.worktrees/feat-selective-color-hsl-mvp/packages/luma-color-runtime/src/selective-color.ts`
- Create: `.worktrees/feat-selective-color-hsl-mvp/packages/luma-color-runtime/src/selective-color.parity.test.ts`

- [ ] **Step 1: Write the parity test (TDD red)**

`selective-color.parity.test.ts`:
- Allocate a headless WebGL2 context (the package already depends on `@vitest/web-worker` or equivalent for headless renderer fixtures — wire that in if missing).
- Build a 32×32 swatch grid covering the eight band centres at `OKLCh.L = 0.5, 0.7` and `C = 0.05, 0.10`.
- Run the grid through CPU `applySelectiveColorRow` AND through a one-pass fragment program that consumes `OKLAB_GLSL` + `SELECTIVE_COLOR_GLSL` and samples the same `Float32Array(1024)` baked LUT uploaded as a 256×1 `RGBA16F` texture.
- Assert 8-bit pixel parity within ±1 LSB per channel — this is `lut_survival_pixel_parity`.
- Also assert texel-centre / midpoint / seam parity at three specific `h_norm` values (`32/256`, `32.5/256`, `255.5/256`) — this is `texture_parity_centres`, `texture_parity_midpoints`, `texture_parity_seam`.

Run. Expected: red.

- [ ] **Step 2: Implement `SELECTIVE_COLOR_GLSL` and `sampleSelectiveColorLut` GLSL helpers (TDD green)**

Add to the bottom of `selective-color.ts`:
```ts
export const SELECTIVE_COLOR_GLSL = /* glsl */ `
  // Concatenation hooks for OKLAB_GLSL; consumer is expected to
  // string-concat OKLAB_GLSL + SELECTIVE_COLOR_GLSL in that order.
  //
  // vec4 sampleSelectiveColorLut(sampler2D lut, float hNorm) { ... }
  // vec3 applyUserSelectiveColor(vec3 rgbProPhoto, sampler2D lut, vec2 chromaClamp) { ... }
`
```
Both helpers use the exact algorithm written in the CPU mirror; the seam-aware lookup uses `texelFetch` against a `NEAREST`-filtered sampler.

Re-run. Expected: green.

- [ ] **Step 3: Verify**

```bash
pnpm --filter @lumaforge/luma-color-runtime test
```

Expected: clean.

- [ ] **Step 4: Commit checkpoint**

```bash
git -C .worktrees/feat-selective-color-hsl-mvp add packages/luma-color-runtime/src/selective-color.ts packages/luma-color-runtime/src/selective-color.parity.test.ts
git -C .worktrees/feat-selective-color-hsl-mvp commit --no-gpg-sign -m "feat(color-runtime): selective-color GLSL helpers + CPU/GPU parity test"
```

---

## Task 7: Color graph integration + package-boundary extension

**Files:**
- Modify: `.worktrees/feat-selective-color-hsl-mvp/packages/luma-color-runtime/src/color-graph.ts`
- Modify: `.worktrees/feat-selective-color-hsl-mvp/packages/luma-color-runtime/src/color-graph.test.ts`
- Modify: `.worktrees/feat-selective-color-hsl-mvp/packages/luma-color-runtime/src/types.ts`
- Modify: `.worktrees/feat-selective-color-hsl-mvp/packages/luma-color-runtime/src/index.ts`
- Modify: `.worktrees/feat-selective-color-hsl-mvp/packages/luma-color-runtime/src/package-boundary.test.ts`

- [ ] **Step 1: Write failing graph/boundary tests (TDD red)**

In `color-graph.test.ts`:
- `graph_step_composition`: the resolved graph includes `user-selective-color` after `user-regional-tone` and before `gamut-to-lut-input` for the no-LUT and custom-LUT paths.
- `graph_step_no_buffer`: `UserSelectiveColorGraphStep` lacks any `Float32Array` field. Use `expect-type` or an equivalent compile-time assertion.
- `lut_ownership`: after `resolveExportColorGraph` captures the step, mutating the pooled `Float32Array(1024)` out-buffer in place does not change the graph fingerprint, the histogram job key, or any captured export snapshot.

In `package-boundary.test.ts`:
- Existing assertions stay green.
- Add `selective_color_cli_importable`: run the apply path from a Node-only entry point with no `src/` import on the call graph (use the boundary helper already in place; extend its allowlist as needed).

Run:

```bash
pnpm --filter @lumaforge/luma-color-runtime test src/color-graph.test.ts src/package-boundary.test.ts
```

Expected: red.

- [ ] **Step 2: Thread the new step (TDD green)**

In `color-graph.ts`:
- Add the `user-selective-color` variant to `ExportColorGraphStep`.
- Extend `resolveExportColorGraph` to insert the step after `user-regional-tone` and before LUT input conversion. Resolve normalized params via `resolveSelectiveColorParams`. **Do not capture the LUT buffer in the step.**
- Update fingerprinting to hash normalized scalars + `constantsVersion`.

In `types.ts`: extend `LumaColorProcessingParams` with `LumaColorSelectiveColorParams`. Update `ProcessingParams` defaults to include the neutral block.

In `index.ts`: re-export `applySelectiveColorRow`, `resolveSelectiveColorParams`, `makeNeutralBand`, `BAND_CENTERS_RAD`, `LUT_CONSTANTS_VERSION`, `OKLAB_GLSL`, `SELECTIVE_COLOR_GLSL`.

Re-run. Expected: green.

- [ ] **Step 3: Verify**

```bash
pnpm --filter @lumaforge/luma-color-runtime test
pnpm --filter @lumaforge/luma-color-runtime typecheck
pnpm --filter @lumaforge/luma-color-runtime build
```

Expected: clean.

- [ ] **Step 4: Commit checkpoint**

```bash
git -C .worktrees/feat-selective-color-hsl-mvp add packages/luma-color-runtime/src
git -C .worktrees/feat-selective-color-hsl-mvp commit --no-gpg-sign -m "feat(color-runtime): user-selective-color graph step + package boundary"
```

---

## Task 8: Row-band processor wiring + CPU degraded preview

**Files:**
- Modify: `.worktrees/feat-selective-color-hsl-mvp/packages/luma-color-runtime/src/row-band-processor.ts`
- Modify: `.worktrees/feat-selective-color-hsl-mvp/packages/luma-color-runtime/src/row-band-processor.test.ts`
- Modify: `.worktrees/feat-selective-color-hsl-mvp/src/lib/preview/cpu-render.ts`

- [ ] **Step 1: Write failing row-band coverage (TDD red)**

In `row-band-processor.test.ts`:
- Neutral selective color leaves rows pixel-identical to the prior pipeline.
- Non-neutral red.hue = +50 produces the expected shift on a row of OKLCh skin-hue pixels (mirrors `skin_attenuation_under_red` at the row-band layer).

Run. Expected: red.

- [ ] **Step 2: Thread `applySelectiveColorRow` (TDD green)**

In `row-band-processor.ts`: between regional tone and LUT input conversion, call `applySelectiveColorRow` with the prepared LUT buffer the processor received from `resolveSelectiveColorParams`.

In `src/lib/preview/cpu-render.ts`: pass through the resolved selective-color params to the CPU degraded preview path. Allocate one `Float32Array(1024)` per session.

Re-run. Expected: green.

- [ ] **Step 3: Verify**

```bash
pnpm --filter @lumaforge/luma-color-runtime test
pnpm test:runtime
pnpm test:app -- src/lib/preview
```

Expected: clean.

- [ ] **Step 4: Commit checkpoint**

```bash
git -C .worktrees/feat-selective-color-hsl-mvp add packages/luma-color-runtime/src/row-band-processor.ts packages/luma-color-runtime/src/row-band-processor.test.ts src/lib/preview/cpu-render.ts
git -C .worktrees/feat-selective-color-hsl-mvp commit --no-gpg-sign -m "feat(color-runtime,preview): wire selective-color into row-band processor and CPU preview"
```

---

## Task 9: WebGL preview shader integration

**Files:**
- Modify: `.worktrees/feat-selective-color-hsl-mvp/src/lib/gl/shaders.ts`
- Modify: `.worktrees/feat-selective-color-hsl-mvp/src/lib/gl/shaders.test.ts`
- Modify: `.worktrees/feat-selective-color-hsl-mvp/src/lib/gl/pipeline.ts`
- Modify: `.worktrees/feat-selective-color-hsl-mvp/src/lib/gl/pipeline.test.ts`

- [ ] **Step 1: Write failing shader/pipeline tests (TDD red)**

In `shaders.test.ts`:
- Shader source contains `uniform sampler2D u_selectiveColorLUT`, `uniform vec2 u_selectiveColorChromaClamp`, and the `OKLAB_GLSL` + `SELECTIVE_COLOR_GLSL` strings reachable via substring match.
- Shader source calls `applyUserSelectiveColor` in the main function between `applyUserTone` and the LUT/style branches.

In `pipeline.test.ts`:
- `u_selectiveColorLUT` and `u_selectiveColorChromaClamp` uniform locations resolve.
- The pipeline allocates exactly one 256×1 `RGBA16F` texture with `NEAREST` filtering, and exactly one pooled `Float32Array(1024)`. Slider drag does not re-allocate.

Run. Expected: red.

- [ ] **Step 2: Modify shader source and pipeline (TDD green)**

In `shaders.ts`:
- Import `OKLAB_GLSL` and `SELECTIVE_COLOR_GLSL` from `@lumaforge/luma-color-runtime`.
- Concatenate them into the program template ahead of `void main()`.
- Add the two uniforms.
- Insert `vec3 editedBaseSceneLinearProPhoto = applyUserSelectiveColor(tonedSceneLinearProPhoto, u_selectiveColorLUT, u_selectiveColorChromaClamp);` between the tone step and the LUT/style branches.

In `pipeline.ts`:
- Allocate the texture once per session via `gl.texImage2D(..., RGBA16F, ...)` with `gl.NEAREST` min/mag and `gl.CLAMP_TO_EDGE` wrap.
- Allocate one pooled `Float32Array(1024)` per session.
- On resolved-params change, call `resolveSelectiveColorParams(params, pool)` and `gl.texSubImage2D` upload from `pool`.
- Bind `u_selectiveColorChromaClamp` to `(CHROMA_CLAMP_LOW, CHROMA_CLAMP_HIGH)` (imported constants).

Re-run. Expected: green.

- [ ] **Step 3: Verify**

```bash
pnpm test:ui
pnpm lint:check
LUMAFORGE_NATIVE_RUNTIME_MODE=prebuilt pnpm build
```

Expected: clean.

- [ ] **Step 4: Commit checkpoint**

```bash
git -C .worktrees/feat-selective-color-hsl-mvp add src/lib/gl
git -C .worktrees/feat-selective-color-hsl-mvp commit --no-gpg-sign -m "feat(gl): WebGL2 preview shader pass for selective color"
```

---

## Task 10: State atoms, reducer helpers, invalidation

**Files:**
- Modify: `.worktrees/feat-selective-color-hsl-mvp/src/modules/raw-processor/state/processing-defaults.ts`
- Modify: `.worktrees/feat-selective-color-hsl-mvp/src/modules/raw-processor/state/processing-atoms.ts`
- Modify: `.worktrees/feat-selective-color-hsl-mvp/src/modules/raw-processor/state/processing-atoms.test.ts`
- Modify: `.worktrees/feat-selective-color-hsl-mvp/src/lib/export/export-worker.ts`
- Modify: `.worktrees/feat-selective-color-hsl-mvp/src/lib/export/export-worker.test.ts`
- Modify: `.worktrees/feat-selective-color-hsl-mvp/src/modules/raw-processor/services/preview/histogram.ts`

- [ ] **Step 1: Write failing state and lifecycle tests (TDD red)**

In `processing-atoms.test.ts`:
- `state_safety` at the atom layer: `setSelectiveColorBand('red', { hue: 50 })` does not mutate `orange`/`yellow`/etc.
- `resetSelectiveColor` clears all 24 scalars; `resetTone` and `resetColor` leave selective color untouched.

In `export-worker.test.ts`:
- Changing any of the 24 scalars invalidates a ready export result.
- Export snapshot includes a top-level `selectiveColor` block with the eight bands.

Histogram coverage (extend the existing histogram test): job key includes the resolved LUT hash; histogram recomputes when any band scalar changes.

Run. Expected: red.

- [ ] **Step 2: Implement (TDD green)**

In `processing-defaults.ts`: add the neutral selective-color block using `makeNeutralBand()`.

In `processing-atoms.ts`: add `selectiveColorAtom`, `setSelectiveColorBand(band, shift)`, `resetSelectiveColor()`.

In `export-worker.ts`: thread params through `resolveExportColorGraph`; on band scalar change, invalidate ready-export. In snapshot serialization, emit the `selectiveColor` block.

In `histogram.ts`: include selective-color params in the job key.

Re-run. Expected: green.

- [ ] **Step 3: Verify**

```bash
pnpm test:app
pnpm lint:check
LUMAFORGE_NATIVE_RUNTIME_MODE=prebuilt pnpm build
```

Expected: clean.

- [ ] **Step 4: Commit checkpoint**

```bash
git -C .worktrees/feat-selective-color-hsl-mvp add src/modules/raw-processor/state src/lib/export src/modules/raw-processor/services/preview
git -C .worktrees/feat-selective-color-hsl-mvp commit --no-gpg-sign -m "feat(raw): selective-color state, export invalidation, histogram recompute"
```

---

## Task 11: Desktop AdjustTool + HSLTool

**Files:**
- Modify: `.worktrees/feat-selective-color-hsl-mvp/src/modules/raw-processor/components/tools/AdjustTool.tsx`
- Create: `.worktrees/feat-selective-color-hsl-mvp/src/modules/raw-processor/components/tools/HSLTool.tsx`
- Create: `.worktrees/feat-selective-color-hsl-mvp/src/modules/raw-processor/components/tools/HSLTool.test.tsx`
- Modify: `.worktrees/feat-selective-color-hsl-mvp/src/modules/raw-processor/components/RawWorkflowToolProvider.tsx`

- [ ] **Step 1: Write failing UI tests (TDD red)**

`HSLTool.test.tsx`:
- Renders 8 sections in the documented band order (`raw.hsl.bands.red` ... `raw.hsl.bands.magenta`).
- Each section has 3 sliders labeled with `raw.hsl.fields.hue`/`.saturation`/`.lightness`.
- All sliders are bounded to `[-100, +100]` and step `1`.
- Reset action calls `resetSelectiveColor` and does NOT call `resetTone` or `resetColor`.
- Neutral indicator visible iff all 24 scalars are 0.

`AdjustTool.test.tsx` (extend existing):
- Three-segment control with `Tone`, `Color`, `HSL` segments in that order.
- Selecting `HSL` mounts `HSLTool`.
- Switching segments preserves each subpanel's value (no cross-reset).

Run. Expected: red.

- [ ] **Step 2: Implement (TDD green)**

Build `HSLTool.tsx` using existing primitives in `src/components/ui` and the existing slider HUD pattern in `src/modules/raw-processor/components/mobile` (desktop variant). Layout: 8 band rows; each row shows the band name, a small color chip representing the band's anchor swatch on dark `/raw` palette (use `Chip surface="on-photo"` per memory `feedback_chip_surface_on_photo`), and three slider rows for hue/saturation/lightness.

Extend `AdjustTool.tsx` to a three-segment Radix segmented control. Use `m.` from `motion/react` for any segment-change motion, gated by `useReducedMotion`.

Wire into `RawWorkflowToolProvider.tsx`.

Re-run. Expected: green.

- [ ] **Step 3: Verify**

```bash
pnpm test:ui
pnpm lint:check
LUMAFORGE_NATIVE_RUNTIME_MODE=prebuilt pnpm build
```

Expected: clean.

- [ ] **Step 4: Commit checkpoint**

```bash
git -C .worktrees/feat-selective-color-hsl-mvp add src/modules/raw-processor/components/tools src/modules/raw-processor/components/RawWorkflowToolProvider.tsx
git -C .worktrees/feat-selective-color-hsl-mvp commit --no-gpg-sign -m "feat(raw): desktop HSLTool with three-segment Adjust grouping"
```

---

## Task 12: Mobile HSL subpanel

**Files:**
- Modify: `.worktrees/feat-selective-color-hsl-mvp/src/modules/raw-processor/components/mobile/AdjustListPanel.tsx`
- Create: `.worktrees/feat-selective-color-hsl-mvp/src/modules/raw-processor/components/mobile/HSLListPanel.tsx`
- Create: `.worktrees/feat-selective-color-hsl-mvp/src/modules/raw-processor/components/mobile/HSLListPanel.test.tsx`

- [ ] **Step 1: Write failing mobile UI tests (TDD red)**

`HSLListPanel.test.tsx`:
- Renders 8 band entries.
- Tapping a band reveals 3 focused-slider rows that reuse the existing `ScrubValueHud` interaction (see memory `feedback_mobile_live_preview` — the slider must NOT dim or blur the preview).
- Band focus and slider focus are independent of Tone/Color focus state.

Run. Expected: red.

- [ ] **Step 2: Implement (TDD green)**

Build `HSLListPanel.tsx` reusing existing primitives in `src/modules/raw-processor/components/mobile`. Adjust `AdjustListPanel.tsx` to expose three subpanel options (`Tone`, `Color`, `HSL`).

Re-run. Expected: green.

- [ ] **Step 3: Verify**

```bash
pnpm test:ui
LUMAFORGE_NATIVE_RUNTIME_MODE=prebuilt pnpm build
```

Expected: clean.

- [ ] **Step 4: Commit checkpoint**

```bash
git -C .worktrees/feat-selective-color-hsl-mvp add src/modules/raw-processor/components/mobile
git -C .worktrees/feat-selective-color-hsl-mvp commit --no-gpg-sign -m "feat(raw): mobile HSL subpanel with focused-slider HUD"
```

---

## Task 13: i18n, browser smoke, CPU micro-bench

**Files:**
- Modify: `.worktrees/feat-selective-color-hsl-mvp/src/i18n/locales/*.ts`
- Create: `.worktrees/feat-selective-color-hsl-mvp/tests/browser/raw-hsl-smoke.spec.ts`
- Create: `.worktrees/feat-selective-color-hsl-mvp/scripts/bench-selective-color-row.ts`

- [ ] **Step 1: Add localization strings**

Per spec §State and UI integration / Localization:
- `raw.adjust.hsl`
- `raw.hsl.bands.red`, `.orange`, `.yellow`, `.green`, `.aqua`, `.blue`, `.purple`, `.magenta`
- `raw.hsl.fields.hue`, `.saturation`, `.lightness`
- `raw.hsl.reset`
- `raw.hsl.note` — copy explaining the adjacent-band sharing behaviour for skin tones (red+orange coordinate together). Match the wording in spec §Product decision.

Apply across all locale files. Run:

```bash
pnpm lint:check
```

Expected: clean.

- [ ] **Step 2: Browser smoke**

`tests/browser/raw-hsl-smoke.spec.ts`: navigate to `/raw`, load a fixture, open Adjust → HSL, drag each band's hue slider in turn, observe that the processed preview changes within one frame, and verify export completes without error. Use the existing browser-test helpers documented in `tests/browser`.

Run:

```bash
pnpm test:browser -- tests/browser/raw-hsl-smoke.spec.ts
```

Expected: green on desktop Chromium project.

- [ ] **Step 3: CPU micro-bench script**

`scripts/bench-selective-color-row.ts`: process a 1024×1024 synthetic gradient (1 MP) through `applySelectiveColorRow` and report per-step pixels/ms: matrix-forward, signedCbrt, atan2, LUT sample, sin/cos(delta), matrix-inverse.

Run:

```bash
pnpm exec tsx scripts/bench-selective-color-row.ts
```

Capture the desktop output and add it to the commit message as the measured-baseline anchor.

- [ ] **Step 4: Commit checkpoint**

```bash
git -C .worktrees/feat-selective-color-hsl-mvp add src/i18n tests/browser/raw-hsl-smoke.spec.ts scripts/bench-selective-color-row.ts
git -C .worktrees/feat-selective-color-hsl-mvp commit --no-gpg-sign -m "feat(raw): selective-color i18n, browser smoke, CPU micro-benchmark"
```

---

## Task 14: iPhone 13 perf prototype gate

**Files:**
- Create: `.worktrees/feat-selective-color-hsl-mvp/docs/audits/2026-06-XX-selective-color-perf-gate.md` (date the file when the run completes)

- [ ] **Step 1: Build the preview asset**

```bash
LUMAFORGE_NATIVE_RUNTIME_MODE=prebuilt pnpm build
pnpm serve
```

- [ ] **Step 2: Run the prototype**

On a real iPhone 13/14-class Safari connected to the dev host:
1. Open `/raw`, load a 16 MP fixture from the runtime fixture set.
2. Open Adjust → HSL. Drag the `red.hue` slider continuously for one minute; record frame time (Safari Web Inspector → Timelines → JavaScript & Events) at 5-second intervals.
3. Trigger a full 16 MP export. Record wall-clock from "Export" tap to ready-banner.
4. Repeat with a second fixture that has a high-ISO blue sky to spot-check the `aqua_no_shift_under_desaturation` behaviour in the wild.

- [ ] **Step 3: Author the audit document**

Per spec §Performance prototype gate, the audit must record:
- Median preview frame time during slider drag and the 5th/95th-percentile.
- Wall-clock 16 MP export time.
- Whether the selective-color stage in isolation adds ≥ 5 ms per frame (toggle the feature off via a temporary URL flag for a 30-second baseline comparison).
- Whether any device-lost or memory-pressure warnings surfaced.
- Pass/fail per the spec's gate.

If gate passes, commit and proceed to PR. If gate fails AND the cause is the selective-color stage, escalate via the spec's fallback ladder before promoting; if the cause is the pre-existing pipeline, document the finding and ship selective color unchanged.

- [ ] **Step 4: Commit checkpoint**

```bash
git -C .worktrees/feat-selective-color-hsl-mvp add docs/audits
git -C .worktrees/feat-selective-color-hsl-mvp commit --no-gpg-sign -m "docs(raw): selective-color iPhone 13 perf prototype gate report"
```

---

## Final verification before PR

Run the full closeout per CLAUDE.md verification policy:

```bash
git -C .worktrees/feat-selective-color-hsl-mvp status --short
pnpm lint
pnpm test:run
pnpm test:browser
LUMAFORGE_NATIVE_RUNTIME_MODE=prebuilt pnpm build
```

Expected: clean across all four. Capture verification command outcomes (per `superpowers:verification-before-completion`).

Open a PR from `feat/selective-color-hsl-mvp` to `main`. PR title should match the spec name: `feat(raw): selective color HSL MVP`. PR body should include:
- Short summary tying back to the spec and plan.
- Test summary (named-test list verified green).
- Performance gate result from Task 14.
- Explicit non-goals reminder so reviewers do not pull deferred work (Split Toning, Color Grading three-way, user-tunable band centers, guided filter) into the review.

---

## Open questions to resolve during implementation

The spec deferred several decisions to prototype-time. Resolve and record each before merging:

1. **RGBA16F vs R32F precision** — the `lut_survival_pixel_parity` test result is the falsifier. If 16F fails, switch the LUT texture format to R32F and re-test. Do NOT relax the parity bound to paper over a precision miss.
2. **DCP HueSatMap composition order** — verify on a fixture that has an active DCP profile that selective color applied at the documented insertion point produces stable, expected behaviour. If not, file a follow-up and document the workaround in the audit.
3. **`expect-type` tooling for `graph_step_no_buffer`** — confirm the package's existing TS tooling supports compile-time type assertions; if not, add `tsd` or equivalent as a dev-dep and document in `packages/luma-color-runtime/package.json`.

Any other open question raised during the build goes into the audit document from Task 14, not into the spec.
