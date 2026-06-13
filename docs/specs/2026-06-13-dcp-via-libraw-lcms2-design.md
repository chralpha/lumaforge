# DCP via LibRaw + lcms2 — MVP Design

Status: proposal · Owner: ChrAlpha · Date: 2026-06-13

## Summary

Make camera DCP profile selection actually affect rendered pixels by extracting
`ColorMatrix` + illuminants + `ProfileToneCurve` from each DCP at publish time
(in the `lumaforge-profiles` repo), shipping them as a `dcp-params` JSON
sidecar alongside the existing `.dcp` asset, and consuming them in the LumaForge
RAW runtime by overriding LibRaw's built-in camera→XYZ matrix and applying the
tone curve via lcms2 (or post-process LUT).

LCP support is dropped entirely in this MVP. `HueSatMap`, `LookTable`, and
`ForwardMatrix` are deferred to a phase-2 pass. Single-DCP user upload is not in
scope.

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
- DCP `HueSatMap` / `LookTable` — out (phase 2).
- DCP `ForwardMatrix` path — out (phase 2). `ColorMatrix` + illuminant inverse
  interpolation is the MVP correctness story.
- Single-DCP user upload UI — out. Lumaforge does not parse `.dcp` files
  client-side at any point in this MVP.
- Adobe Camera Raw / Lightroom pixel-exact parity — phase 3 at earliest.

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

  // Illuminant interpolation reference. CCT in Kelvin.
  // Required: at least illuminant1. illuminant2 only present for dual-illuminant DCPs.
  "illuminant1": { "code": 17, "cct": 2856 },        // Standard A
  "illuminant2": { "code": 21, "cct": 6504 },        // D65 (optional)

  // 3x3 row-major matrices in DCP convention: XYZ-D50 -> CameraRGB.
  "colorMatrix1": [9 floats],
  "colorMatrix2": [9 floats] | null,

  // Optional. Phase 2 reads these; phase 1 ships them but ignores.
  "forwardMatrix1": [9 floats] | null,
  "forwardMatrix2": [9 floats] | null,

  // Optional scene->display tone curve. Sample pairs sorted by x, x and y in [0,1].
  "toneCurve": [[x0, y0], [x1, y1], ...] | null,

  // Phase 2. Phase 1 omits or ignores.
  "hueSatMap": { "dims": [hDiv, sDiv, vDiv], "encoding": "linear", "dataUrl": "...bin" } | null,
  "lookTable": { "dims": [hDiv, sDiv, vDiv], "encoding": "linear", "dataUrl": "...bin" } | null
}
```

Key contract decisions:

- **Illuminant interpolation runs in the client**, not the producer. Inputs
  depend on per-RAW `AsShotNeutral`, so producer-side precomputation cannot
  replace it. The producer ships both reference matrices and CCTs; the client
  does CCT-domain inverse lerp.
- **Matrix order is XYZ→Camera**, matching DCP convention. The client inverts
  the interpolated 3×3 to get the Camera→XYZ matrix it actually pushes into
  LibRaw.
- **`forwardMatrix*` and HSV maps are reserved fields**. Phase-1 producer can
  emit them already so the catalog need not re-version when phase 2 lands.
- **HSV map binary payloads are out-of-band** (`dataUrl`) so the catalog JSON
  stays compact and gzip-friendly. A 30×8×16 HSV map is ~92 KB raw; not
  appropriate for inline.

Catalog version bumps from current `v2026.06.10` to a new dated version when
the first `dcp-params` asset ships. Old client versions ignore unknown roles
and continue to behave silently (no DCP applied — same as today after
cleanup). New client versions require `dcp-params` present to consider a
profile applied; missing means "ignore, no error".

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
  .dcp ── parser ──► dcp-params JSON  (golden-locked)
                                     └─► catalog asset role: 'dcp-params'

LumaForge (load-time)
  catalog → camera-calibration-runtime
                ├─ resolve `dcp-params` asset for selected camera profile
                └─ resolve AsShotNeutral from RAW metadata
                       ↓
            packages/luma-color-runtime
                interpolateDcpMatrix(matrix1, matrix2, cct1, cct2, asShotNeutral)
                       ↓
                  Camera→XYZ-D50 3x3   +  ProfileToneCurve samples
                       ↓
            worker protocol `applyCalibrationToSession`:
                  { dcpParams: { camToXyz: float[9], toneCurve?: float[][] } }
                       ↓
            libraw_wrapper.cpp
                  - params.cam_xyz[4][3] := camToXyz padded (4th = 0)
                  - params.use_camera_matrix := 0       // suppress adobe_coeff
                  - dcraw_process()
                  - if toneCurve: post-process LUT or lcms2 cmsToneCurve
```

Key implementation points:

- **`packages/luma-color-runtime` gains `dcp-interpolate.ts`**: pure TS, no
  React, no I/O. Inputs: two matrices, two illuminant CCTs, AsShotNeutral.
  Output: interpolated 3×3 Camera→XYZ-D50. Implements the DNG 1.6 inverse-CCT
  weighting (`α = (1/CCT_shot − 1/CCT_2) / (1/CCT_1 − 1/CCT_2)`).
- **Worker protocol payload swaps `dcpBytes` for `dcpParams`**. Existing
  `LumaRawWorkerApplyCalibrationPayload.cameraCalibration` shape changes:
  - Remove `dcpBytes: ArrayBuffer`.
  - Add `camToXyz: Float32Array` (length 9, transferable via its `.buffer`).
  - Add optional `toneCurve: Float32Array` (interleaved x,y pairs, even length).
- **`lensCorrection` field stays removed**. Cleanup already deleted it. Do not
  reintroduce a placeholder; LCP comes back only when LCP support comes back.
- **Native entry point**: extend `applyCalibrationToSession` in the wrapper to
  read `camToXyz` and overwrite `imgdata.color.cam_xyz`, set
  `params.use_camera_matrix = 0`. If `toneCurve` present, store sampled pairs
  on the session and run a single-thread `dcraw_process()` post-process pass
  over the float output buffer. Choice of lcms2 `cmsToneCurve` vs hand-rolled
  bilinear is open; pick whichever drops fewer ms in benchmarks.

## Pipeline Math: What Changes in the Wrapper

Today in `libraw_wrapper.cpp:617-647`, `buildCameraToWorkingRgb` reads
`color.rgb_cam` (LibRaw's Camera→sRGB, derived from its built-in `adobe_coeff`
table or DNG embedded matrix) and `color.cam_xyz` (Camera→XYZ same source) and
produces the working-RGB transform.

After this change:

1. Before `dcraw_process()`, if `cameraCalibration.camToXyz` was provided via
   `applyCalibrationToSession`, overwrite `imgdata.color.cam_xyz[i][j]` from the
   3×3 input and set `params.use_camera_matrix = 0`. LibRaw will skip its
   internal table lookup and rebuild `rgb_cam` from our matrix via its existing
   `cam_xyz_coeff()` codepath.
2. The existing `buildCameraToWorkingRgb` continues to work unchanged — it
   reads `rgb_cam` / `cam_xyz` regardless of where they came from. This is the
   key safety property of the approach: no new exit point in the wrapper.
3. If `toneCurve` was provided, run a post-process 1D LUT over the float
   processed image. Tone curve samples are in scene-linear space (DCP
   convention); apply per-channel after raw rendering, before final output
   conversion.

`use_camera_wb` and `cam_mul` are not touched — DCP affects camera→XYZ, not
white balance. AsShotNeutral is consumed for the CCT interpolation alpha only,
not pushed back into LibRaw's WB.

## UI Surface

Calibration tool is hidden by default until both sides ship. Re-enable
conditions:

- Catalog version is the new dcp-params-aware version (client checks once at
  catalog load).
- A `dcp-params` asset successfully resolves for a selected profile.

When a profile has only a legacy `.dcp` asset (no `dcp-params`), the picker
treats it as "unsupported on this client" — silent, no error toast, the entry
just stays unselectable with a one-line muted hint. Matches the silent infra
UX rule from prior incidents.

Mobile calibration tab does not come back in MVP. Desktop card returns in
its restyled-and-demoted form (right rail, below LUT). All UI code for both
slots and pickers must be re-authored — the calibration components dropped by
the cleanup are not coming back via cherry-pick.

## Test Strategy

LumaForge side:

- `packages/luma-color-runtime/src/dcp-interpolate.test.ts`: unit cover the
  CCT inverse-lerp against three reference cases (low-only, high-only,
  mid-mix). Use DNG spec's worked example as ground truth.
- `src/modules/raw-processor/services/calibration/camera-calibration-runtime.test.ts`:
  unit cover the resolver — given a session + `dcp-params` fetcher mock, the
  resolved payload contains the right `camToXyz` and `toneCurve`.
- `src/lib/raw/luma-runtime-adapter.test.ts`: verify the transferables list
  includes the `camToXyz.buffer` (and `toneCurve.buffer` if present).
- `packages/luma-raw-runtime/src/runtime.test.ts`: verify
  `applyCalibrationToSession` carries the new payload shape.
- One browser fixture in `tests/browser/`: load a Sony / Nikon / Canon RAW with
  its Adobe-standard DCP profile selected, snapshot the rendered preview,
  compare against a Lightroom-exported JPEG of the same RAW + same profile,
  assert mean ΔE76 below a threshold to be calibrated empirically per camera.
  This is the only "Adobe parity" check in MVP and it's intentionally loose —
  exact parity is phase 3.

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

- **CCT interpolation correctness.** Get this wrong and every photo on every
  dual-illuminant DCP shifts color. Mitigation: dnG spec example as a fixture;
  parity check against Adobe DNG Converter on the three test cameras.
- **`use_camera_matrix = 0` side effects.** Verified the existing
  `buildCameraToWorkingRgb` path is matrix-source-agnostic. Still — check
  LibRaw's `cam_xyz_coeff()` re-derives `rgb_cam` correctly when `cam_xyz` is
  externally set rather than table-looked-up. If it doesn't (some LibRaw
  versions only refresh on file open), we may need to also overwrite
  `rgb_cam` ourselves from the inverted ProPhoto chain.
- **Catalog cross-repo coordination.** This is a synchronized release. Plan:
  producer ships `dcp-params` first (forward-compatible — old clients ignore);
  LumaForge consumer ships next; once the next consumer is in production, the
  UI re-enables. Roll back independently if either side regresses.
- **Tone curve placement.** "After raw render, before output color conversion"
  is the working assumption. Validate this matches Adobe's documented order
  for `ProfileToneCurve` — DNG spec describes it as applied in linear ProPhoto.
- **Profile-name string handling.** The `profileName` field is for diagnostics
  and chip labels. It must not be used as an identity key — that's
  `profileId` (existing catalog entry id).

## Phase 2 / 3 Backlog (not in this spec)

- `ForwardMatrix1/2` path as an alternative to `ColorMatrix` inversion.
- `HueSatMap` baked to a 3D RGB CLUT applied via lcms2 `cmsStageAllocCLut16`,
  or hand-rolled HSV kernel. This is the "camera-style profile look" knob.
- `LookTable` (same shape as HueSatMap, applied after).
- LCP revival: vignette first (cheap, no warp), then distortion (bilinear),
  then TCA. Each its own spec.
- Single-DCP user upload: factor `lumaforge-profiles`' parser into a shared
  npm package consumed by both repos, dynamic-import on the client only when
  user picks a local DCP file.
