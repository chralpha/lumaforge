# DCP via LibRaw + lcms2 — MVP Design

Status: proposal · Owner: ChrAlpha · Date: 2026-06-13

## Summary

Make camera DCP profile selection actually affect rendered pixels by extracting
`ColorMatrix1/2` + illuminants + `ProfileToneCurve` from each DCP at publish
time (in the `lumaforge-profiles` repo), shipping them as a `dcp-params` JSON
sidecar alongside the existing `.dcp` asset, and consuming them in the LumaForge
RAW runtime by writing the DNG-convention `XYZ→Camera` matrix into LibRaw's
`imgdata.color.cam_xyz` (which is the field LibRaw already expects to hold a
ColorMatrix-direction transform) and applying the tone curve as a baked 1D LUT
after raw rendering in linear working space.

This is explicitly a **LibRaw-compatible matrix-injection MVP**, not a full DNG
color renderer. `ForwardMatrix`, `HueSatMap`, `LookTable`, and a standalone DCP
color pipeline are phase-2. LCP support is dropped entirely. Single-DCP user
upload is not in scope.

## Motivation

Before the cleanup on 2026-06-13, calibration UI flowed selected profiles all
the way to `applyCalibrationToSession` over the worker protocol — but the native
wrapper (`packages/luma-raw-runtime/native/libraw_wrapper.cpp`) never consumed
the bytes. Selecting a DCP fetched the asset, transferred it across the
worker boundary, and silently discarded it. This violated the silent-by-default
infra contract: the feature looked applied but did not change pixels. All
calibration work was reverted from `main`; this spec describes the path back.

## Non-Goals

- LCP geometry (distortion, TCA) — out. Vignette correction also out for now.
- DCP `HueSatMap` / `LookTable` — out (phase 2). For many cameras the
  per-profile look (Camera Standard / Portrait / Vivid) lives mostly in these
  HSV tables, not in matrices; Phase 1 therefore makes profile selection
  affect pixels, but it does not deliver Adobe-style profile differentiation.
- DCP `ForwardMatrix` path — out (phase 2). DNG 1.2+ prefers `ForwardMatrix`
  when present for chromatic adaptation correctness; using only `ColorMatrix`
  is the lower-quality fallback DNG path. Phase 1 ships that fallback to fix
  the silent no-op; full colorimetric parity comes when phase 2 lands.
- Single-DCP user upload UI — out. LumaForge does not parse `.dcp` files
  client-side at any point in this MVP.
- Adobe Camera Raw / Lightroom pixel-exact parity — phase 3 at earliest.
- A standalone DCP color pipeline that bypasses LibRaw's color stages — out
  (phase 2 design decision; see Phase 2 / 3 Backlog).

## Cross-Repo Contract

DCP parsing lives in `lumaforge-profiles` only. The producer is the single
source of truth for parser correctness; golden-output fixtures lock the
behavior; LumaForge consumes structured JSON.

Asset shape evolves additively. Each `camera-profile` catalog entry keeps its
existing `role: 'dcp'` binary asset (for provenance and future re-parse), and
gains a `role: 'dcp-params'` JSON asset:

```jsonc
{
  "schemaVersion": 1,
  "profileName": "Sony ILCE-7M4 Adobe Standard",
  "uniqueCameraModelRestriction": "SONY ILCE-7M4",
  "profileCalibrationSignature": null,   // reserved; non-null pairs with LCP/Look
  "profileEmbedPolicy": 0,               // required: 0 allow copying / 1 embed-if-used / 2 never embed / 3 no-restrictions

  // Illuminant interpolation reference. DCP is dual-illuminant in practice;
  // schemaVersion 1 hard-codes "1 or 2 calibrations" as flat fields. A future
  // schemaVersion may switch to a `calibrations[]` array if a profile uses
  // more than two illuminants.
  // Required: illuminant1 always. illuminant2 only present for dual-illuminant DCPs.
  "illuminant1": {
    "code": 17,              // DNG IFD CalibrationIlluminant tag value
    "cct": 2856,             // Kelvin
    "xy": [0.44757, 0.40745] // optional; CIE xy whitepoint when known
  },
  "illuminant2": { "code": 21, "cct": 6504, "xy": [0.31272, 0.32903] } | null,

  // 3x3 row-major matrices in DCP convention: XYZ → CameraRGB.
  // This is the same direction LibRaw's `imgdata.color.cam_xyz` expects.
  // D50 reference handling happens downstream in the Camera→XYZ-D50 transform
  // (with optional ForwardMatrix in phase 2).
  "colorMatrix1": [9 floats],
  "colorMatrix2": [9 floats] | null,

  // Reserved. Phase 2 consumes; phase 1 producers MAY emit, phase 1 client ignores.
  "forwardMatrix1": [9 floats] | null,
  "forwardMatrix2": [9 floats] | null,

  // Tone curve as 1D LUT baked at parse time from the DNG cubic spline.
  // Producer responsibility: parse `(x, y)` sample pairs, validate strictly
  // increasing x and x, y ∈ [0, 1], for SDR profiles enforce endpoints (0,0)
  // and (1,1), build the cubic spline per DNG spec, sample to the LUT below.
  // Linear input space (scene-referred linear working RGB applied per channel).
  // 4096 entries is the contract minimum; 8192 if budget allows.
  "toneCurve": {
    "encoding": "cubic-spline-baked-1d-lut",
    "size": 4096,
    "values": "[base64 little-endian float32 array length=size]"
  } | null,

  // Reserved. Phase 2.
  "hueSatMap": { "dims": [hDiv, sDiv, vDiv], "encoding": "linear", "dataUrl": "...bin" } | null,
  "lookTable": { "dims": [hDiv, sDiv, vDiv], "encoding": "linear", "dataUrl": "...bin" } | null
}
```

Key contract decisions:

- **Illuminant interpolation runs in the client**, not the producer. The
  interpolation alpha depends on the current white-balance neutral, which is
  not knowable at publish time. The producer ships both reference matrices,
  illuminant codes, CCTs, and (optionally) xy whitepoints; the client runs
  the DNG-spec iterative procedure described in Runtime Architecture.
- **Matrix direction is XYZ → Camera**, exactly DNG `ColorMatrix1/2`
  convention. This is the same direction LibRaw's `imgdata.color.cam_xyz`
  is documented to hold (a `XYZ → CamRGB` matrix); the client does not need
  to invert the matrix before writing it into LibRaw.
- **`forwardMatrix*` and HSV maps are reserved fields**. Phase-1 producer
  emits them whenever available so the catalog need not re-version when
  phase 2 lands.
- **HSV map binary payloads are out-of-band** (`dataUrl`) so the catalog
  JSON stays compact and gzip-friendly. A 30×8×16 HSV map is ~92 KB raw;
  not appropriate for inline.
- **Tone curve is baked at parse time, not at runtime**. DNG spec requires
  cubic spline interpolation between sample pairs; per-pixel cubic eval is
  unnecessary if the producer pre-bakes a high-resolution 1D LUT. Runtime
  applies bilinear lookup over the LUT.
- **`profileEmbedPolicy` is required**. The producer must respect Adobe's
  embed policy for legal/redistribution audit; consumers can later use it
  to decide UI behavior (e.g., disable export-embed when policy == 2).

Catalog version (`v2026.06.10` → next dated release) is **informational
only**. The real gate is per-profile asset presence. Old clients that don't
recognise `role: 'dcp-params'` continue to silently ignore DCPs (same as
today). New clients consider a profile applied only when its `dcp-params`
asset resolves AND validates; legacy `.dcp`-only entries render as
"unsupported on this client" silently.

## Data Contract Tests

Owned by `lumaforge-profiles`, TDD. No spec there — tests drive the parser:

- For each canonical DCP fixture (Adobe standard profiles for ~3 representative
  cameras), assert the produced JSON exactly matches the committed golden file.
- Golden files live next to fixtures; parser changes must update goldens
  intentionally.
- Producer-side `LUT_CATALOG_MAX_BYTES`-style budget check for the new
  `dcp-params` JSON so a malformed huge curve can't bloat catalog fetch.

LumaForge mirrors the schema in a single TypeScript type and one runtime
validator at the consumer boundary. No cross-repo schema generator — the type
is small and rare-change.

## Runtime Architecture

```
profiles repo (publish-time)
  .dcp ── parser ──► dcp-params JSON     (golden-locked)
                       │
                       ├─ ColorMatrix1/2 (XYZ→Camera)
                       ├─ Illuminant1/2 codes + CCT (+ xy if known)
                       └─ toneCurve: cubic-spline baked to 4096-entry 1D LUT
                                     └─► catalog asset role: 'dcp-params'

LumaForge (load-time)
  catalog → camera-calibration-runtime
                ├─ resolve `dcp-params` asset
                ├─ validate schemaVersion + required fields
                └─ feed to color runtime with current WB neutral
                       ↓
            packages/luma-color-runtime/src/dcp-interpolate.ts
                solveDcpInterpolation({
                  matrices: { m1, m2 },
                  illuminants: { i1, i2 },
                  whiteNeutral,            // current WB camera-neutral, not always AsShot
                }) → {
                  xyzToCamera: Float32Array(9),   // interpolated, DNG ColorMatrix direction
                  alpha: number                   // for diagnostics/telemetry
                }
                       ↓
            worker protocol `applyCalibrationToSession`:
                  cameraCalibration: {
                    profileId, profileName,
                    xyzToCamera: Float32Array(9),
                    toneCurveLut?: Float32Array(4096),   // already baked
                  }
                       ↓
            libraw_wrapper.cpp
                  - imgdata.color.cam_xyz[i][j] := xyzToCamera          (matches LibRaw direction)
                  - params.use_camera_matrix := 0                       // ignore embedded/adobe_coeff
                  - re-trigger LibRaw's cam_xyz_coeff() so rgb_cam refreshes
                  - dcraw_process()                                     // unchanged downstream
                  - if toneCurveLut: post-process 1D LUT in linear working space
                                     (before output gamma / colorspace conversion)
```

Key implementation points:

- **WB-neutral source is "current selected WB", not always `AsShotNeutral`**.
  If the user has a WB slider that moves the neutral, the DCP interpolation
  alpha must follow. Phase 1 may bind to AsShotNeutral as a stopgap if the
  WB-slider integration is not ready, but the API takes a `whiteNeutral`
  parameter so the producer-side wiring is forward-compatible.
- **`packages/luma-color-runtime` gains `dcp-interpolate.ts`**: pure TS, no
  React, no I/O. Implements the DNG-spec iterative procedure (DNG 1.6 §6):
  - Initial guess: xy from `whiteNeutral` assuming illuminant1 transform.
  - Iterate: from xy compute CCT, from CCT compute interpolation `alpha` via
    inverse-CCT weighting (`alpha = (1/cct − 1/cct2) / (1/cct1 − 1/cct2)`,
    clamped to [0,1]), interpolate `xyzToCamera`, invert to get
    `cameraToXyz`, transform `whiteNeutral` back to XYZ, recompute xy.
  - Convergence: typically 3–5 iterations; cap at 8 and emit telemetry if
    capped.
  - Output: the converged `xyzToCamera` and the final `alpha`.
- **Inverse-CCT weighting is not the algorithm; it is one step in the loop**.
  Closed-form one-step alpha only works when CCT is already known.
- **Worker protocol payload swaps `dcpBytes` for structured fields**:
  - Remove `dcpBytes: ArrayBuffer`.
  - Add `xyzToCamera: Float32Array(9)` (transferable via `.buffer`).
  - Add optional `toneCurveLut: Float32Array(>=4096)` (already baked by
    producer; client never sees raw sample pairs).
- **`lensCorrection` field stays removed**. Cleanup already deleted it. Do not
  reintroduce a placeholder; LCP returns only when LCP support returns.
- **Native entry point**: extend `applyCalibrationToSession` in the wrapper
  to write `xyzToCamera` into `imgdata.color.cam_xyz`, force LibRaw to
  refresh `rgb_cam` (see "Pre-MVP native spike" below for the exact API
  call), and stash the tone-curve LUT for the post-process pass. The
  post-process LUT runs once per `dcraw_process()` output, per channel,
  in linear working space — before any output gamma or color-space conversion.
- **Profile swap reuses the warm session** via `applyCalibrationToSession`
  (already implemented). Switching profile does NOT re-decode; only the
  matrix + LUT change. The full re-render cost is the post-process pass
  plus the LibRaw color-stage refresh, both bounded.

## Pipeline Math: What Changes in the Wrapper

Today in `libraw_wrapper.cpp:617-647`, `buildCameraToWorkingRgb` reads
`color.rgb_cam` (LibRaw's Camera→sRGB matrix, refreshed by `cam_xyz_coeff()`
from `color.cam_xyz`) and `color.cam_xyz` (LibRaw's XYZ→Camera matrix in DNG
ColorMatrix direction, populated by LibRaw from the file's embedded matrix or
`adobe_coeff` tables) and produces the working-RGB transform.

After this change:

1. Before `dcraw_process()`, if `cameraCalibration.xyzToCamera` was provided
   via `applyCalibrationToSession`:
   - Overwrite `imgdata.color.cam_xyz[i][j]` from the 3×3 input (row-major,
     fourth row left zero — LibRaw stores `[4][3]` but only 3 are populated
     for 3-color cameras).
   - Set `params.use_camera_matrix = 0` to instruct LibRaw to ignore both the
     embedded color profile and the `adobe_coeff` table.
   - Force LibRaw to refresh `rgb_cam` from the new `cam_xyz`. The exact API
     is verified by the Pre-MVP native spike (below) — `cam_xyz_coeff()` is
     internal to some LibRaw versions, and the public re-derivation path
     may differ.
2. The existing `buildCameraToWorkingRgb` continues to work unchanged — it
   reads `rgb_cam` / `cam_xyz` regardless of where they came from. This is
   the key safety property: there is no new exit point in the wrapper and
   the downstream sRGB→ProPhoto step is matrix-source-agnostic.
3. If `toneCurveLut` was provided, run a 1D LUT over the float processed
   image after raw rendering but **before** any output gamma or color-space
   conversion. The LUT input is linear ProPhoto (the working space the
   wrapper currently outputs); per-channel bilinear over the 4096-entry LUT.
   In DNG order, `LookTable` runs after the matrix and before `ToneCurve`;
   phase 1 has no LookTable so the ToneCurve is the only post-matrix step.

`use_camera_wb` and `cam_mul` are not touched. DCP affects the camera→XYZ
matrix path, not white balance. `whiteNeutral` is consumed by the iterative
interpolation only; nothing about it is pushed back into LibRaw's WB.

### Pre-MVP native spike (gates Phase 1)

Before any UI or catalog wiring lands, a small native test must pass:

```
given:
  known RAW fixture
  matrix A injected via applyCalibrationToSession
  matrix B injected via applyCalibrationToSession (different from A)

assert:
  dcraw_process output buffer differs between A and B
  imgdata.color.cam_xyz reflects the injected matrix at process time
  imgdata.color.rgb_cam differs between A and B (proves rgb_cam refresh)
  pre_mul behavior is consistent (either updates with matrix, or
  is intentionally pinned — pick one and document)
```

If LibRaw 0.22.1's `cam_xyz_coeff()` does not refresh `rgb_cam` when
`cam_xyz` is externally mutated post-open, the spike must produce the
exact native API or sequence that does. If no such API exists in the
version we ship, phase 1 falls back to also computing `rgb_cam` from the
inverted matrix and writing it directly — both fields, atomically, before
`dcraw_process()`. The spike result drives the wrapper implementation; do
not write production code on speculation.

## UI Surface

Calibration tool is hidden by default until per-profile `dcp-params`
resolution succeeds. Re-enable condition is **asset presence + schema
validation pass**, evaluated per profile, not per catalog.

When a profile has only a legacy `.dcp` asset (no `dcp-params`), the picker
treats it as "unsupported on this client" — silent, no error toast, the
entry just stays unselectable with a one-line muted hint. Matches the
silent infra UX rule from prior incidents.

Silent UX at the surface does not mean silent code. Emit structured
telemetry / debug-log events at the boundary so the rollout can be
audited:

```
camera_profile.applied             { profileId, schemaVersion, alpha }
camera_profile.unsupported         { profileId, reason: 'missing_dcp_params' }
camera_profile.rejected            { profileId, reason: 'schema_invalid', detail }
camera_profile.interpolation_capped { profileId, iterations: 8 }
```

Mobile calibration tab does not come back in MVP. Desktop card returns in
its restyled-and-demoted form (right rail, below LUT). All UI code for both
slots and pickers must be re-authored — the calibration components dropped
by the cleanup are not coming back via cherry-pick.

## Test Strategy

A five-tier pyramid. Tiers 1–4 gate Phase 1; tier 5 is canary, not gate.

**Tier 1 — Parser contract (profiles repo, TDD).** For each canonical DCP
fixture (Adobe Standard for Sony / Nikon / Canon representative bodies),
the parser produces an exact byte-stable `dcp-params` JSON committed as
golden. Parser changes must update goldens intentionally.

**Tier 2 — Matrix math correctness (LumaForge unit).**
- `packages/luma-color-runtime/src/dcp-interpolate.test.ts`: synthetic
  profile fixtures (one with only `ColorMatrix1`, one dual-illuminant
  spanning A and D65, one with degenerate equal illuminants). For each,
  assert the iterative `solveDcpInterpolation` converges within 8
  iterations and matches a reference computation (numpy/pure-math) to
  within 1e-6 on each matrix element.
- Cover edge cases: `whiteNeutral` outside both illuminants (clamp),
  exactly at one illuminant (alpha = 0 or 1), CCT inversion direction.

**Tier 3 — Runtime no-op regression (LumaForge integration).**
- `src/modules/raw-processor/services/calibration/camera-calibration-runtime.test.ts`:
  given a session + `dcp-params` fetcher mock, the resolved payload
  carries the right `xyzToCamera` and `toneCurveLut` lengths.
- `src/lib/raw/luma-runtime-adapter.test.ts`: transferables list
  includes the `xyzToCamera.buffer` and (when present)
  `toneCurveLut.buffer`.
- `packages/luma-raw-runtime/src/runtime.test.ts`: confirms the new
  `applyCalibrationToSession` payload shape.
- **Critical**: a worker-level test that loads a RAW, applies profile A,
  applies profile B, compares the two output buffers, and asserts they
  differ by more than a defined epsilon. This is the single test that
  guards against the silent no-op coming back.

**Tier 4 — Neutral correctness (LumaForge integration).**
- For a synthetic neutral patch (gray card) RAW, after DCP application
  with its matching camera profile, the rendered patch stays within a
  small ΔE of D65 / D50 grey (depending on output space). This catches
  matrix-direction errors that pass tier 3 by changing pixels but
  changing them the wrong way.

**Tier 5 — Lightroom canary (manual / non-blocking).**
- One browser fixture per representative camera: load the RAW with its
  Adobe Standard profile selected, snapshot the rendered preview, and
  visually compare to a Lightroom JPEG export of the same RAW + same
  profile. This is a "no catastrophic shift" smoke test, not a parity
  gate — Phase 1 has no `ForwardMatrix` / `HueSatMap` / `LookTable`,
  so Lightroom output is intentionally different. Use a wide threshold
  or human review only; do not regress-gate CI on it.

profiles side runs TDD; no LumaForge dependency. The golden JSON files for
each camera-fixture DCP are the contract surface this consumer trusts.

## Catalog Version + Migration

- Producer publishes existing v2026.06.10 unchanged.
- Next release (`vYYYY.MM.DD`) emits `dcp-params` for every `camera-profile`
  entry that has a parseable DCP. Entries without a parseable DCP drop the
  `dcp-params` asset rather than emit a partial one.
- Client behavior is fully controlled by asset presence. No client-side
  version gate beyond the per-profile resolution.
- The legacy `role: 'dcp'` binary stays — useful for provenance, future
  reparse, and a possible "user uploaded their own DCP" path. It is never
  consumed by LumaForge in MVP.

## Risks + Open Questions

- **Iterative interpolation correctness.** Get this wrong and every photo on
  every dual-illuminant DCP shifts color. Mitigation: DNG spec worked example
  + numpy-reference goldens in Tier 2; the alpha is emitted as telemetry so
  unusual values are auditable in the rollout.
- **`use_camera_matrix = 0` + LibRaw `rgb_cam` refresh.** Promoted from risk
  to **explicit Phase 1 gate**. See "Pre-MVP native spike" above; if the
  spike cannot make `rgb_cam` refresh from a post-open `cam_xyz` mutation in
  LibRaw 0.22.1, the wrapper writes both fields directly.
- **Catalog cross-repo coordination.** Synchronized but order-flexible:
  producer ships `dcp-params` first (forward-compatible — old clients
  ignore); LumaForge consumer ships next; once the next consumer is in
  production, the UI re-enables per-profile as `dcp-params` resolves.
  Roll back independently if either side regresses.
- **Tone curve placement.** Spec says "linear working space, after the
  matrix, before output gamma". `LookTable` (phase 2) sits between the
  matrix and the tone curve per DNG spec; the post-process pass must
  preserve that ordering when phase 2 lands.
- **Profile-name string handling.** The `profileName` field is for
  diagnostics and chip labels. It must not be used as an identity key —
  that's `profileId` (existing catalog entry id).
- **Profile differentiation is limited in Phase 1.** Cameras whose Adobe
  profiles (Standard, Portrait, Landscape, Vivid) differ mainly in
  `HueSatMap` / `LookTable` rather than matrices will produce visibly
  similar previews under Phase 1. This is correct behavior given the
  fallback path, but UI copy and any "compare profiles" affordance must
  not promise visible differentiation here. Phase 2 unlocks it.

## Phase 2 / 3 Backlog (not in this spec)

- **`ForwardMatrix1/2` path.** Preferred DNG 1.2+ camera→XYZ-D50 transform.
  With this path, the renderer no longer relies on inverting `ColorMatrix`
  plus Bradford chromatic adaptation; instead it uses
  `FM * D * Inverse(AB * CC)` per spec. This is the upgrade from "fallback
  path" to "full DNG matrix correctness".
- **`HueSatMap`** baked to a 3D RGB CLUT applied via lcms2
  `cmsStageAllocCLut16`, or hand-rolled HSV kernel. This is the
  "camera-style profile look" knob and the main source of
  Standard / Portrait / Vivid visual differentiation.
- **`LookTable`** (same shape as HueSatMap, applied after the matrix and
  before the tone curve per DNG order).
- **Standalone DCP color pipeline.** Move camera→XYZ-D50 + ProPhoto
  conversion out of LibRaw entirely; LibRaw outputs linear camera RGB,
  `luma-color-runtime` owns everything color-ward. Enables full DNG
  parity and decouples future profile work from LibRaw's color stage.
- **LCP revival**: vignette first (cheap, no warp), then distortion
  (bilinear), then TCA. Each its own spec.
- **Single-DCP user upload**: factor `lumaforge-profiles`' parser into a
  shared npm package consumed by both repos, dynamic-import on the client
  only when user picks a local DCP file.
