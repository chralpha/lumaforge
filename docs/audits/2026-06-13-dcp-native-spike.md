# DCP Matrix Injection — Native Spike (LibRaw 0.22.1)

Date: 2026-06-13
Branch: `perf-calibration-fast-swap` (worktree
`.worktrees/perf-calibration-fast-swap`)
Scope: `@lumaforge/luma-raw-runtime` only. No production wiring touched.

## Verdict: PASS

All three load-bearing gates are met against `LibRaw-0.22.1` vendored at
`packages/luma-raw-runtime/native/vendor/LibRaw-0.22.1/`:

1. Two distinct XYZ-to-Camera matrices produce visibly different RGB16 output
   (L2 distance well above the conservative floor).
2. The same matrix re-injected after another matrix yields bit-identical
   bytes (idempotent).
3. `imgdata.color.rgb_cam` reflects the injection — the spike rebuilds it
   from the caller-supplied matrix via LibRaw's own `cam_xyz_coeff`.

## Strategy Chosen: A (subclass + `cam_xyz_coeff`)

`LibRaw::cam_xyz_coeff(float _rgb_cam[3][4], double cam_xyz[4][3])` is the
helper LibRaw itself uses to derive `rgb_cam` (and `pre_mul`) from a
3-illuminant DCP-style XYZ→Camera matrix — see
`vendor/LibRaw-0.22.1/src/utils/utils_dcraw.cpp:282` and the canonical call
sites `src/metadata/identify.cpp:1417`, `src/metadata/tiff.cpp:1750`,
`src/tables/colordata.cpp:1905`. It is declared in the `protected` section
of `libraw/libraw.h:364`, so direct invocation requires a thin subclass.

The spike wrapper adds `LumaSpikeLibRaw : public LibRaw` exposing
`spike_cam_xyz_coeff`, then re-uses it from `LumaRawProcessor`. This keeps
the math identical to identify-time bring-up, preserving the normalize→
pseudoinverse path and the `pre_mul` side effect that LibRaw guarantees. We
explicitly preferred this over strategies B (re-implement the math inline
against `LibRaw_constants::xyz_rgb`) and C (write `rgb_cam` from a
caller-supplied matrix directly) because:

- Strategy A inherits LibRaw bug fixes and numerical conventions for free.
- Strategy B duplicates the `xyz_rgb` constants and reintroduces a vendor
  drift risk on `LibRaw` upgrades.
- Strategy C bypasses normalization and `pre_mul`, leaving the WB scaling
  contract subtly off when production code wants to swap matrices on a
  warm session.

## The Trap: `raw2image_start` Restores Pristine Color

The first build only mutated `imgdata.color.cam_xyz` and rebuilt
`imgdata.color.rgb_cam`. Verification showed `rgb_cam` was reset back to
the cmatrix-derived baseline by the time `dcraw_process` finished. The
culprit is
`src/preprocessing/raw2image.cpp:21`:

```cpp
memmove(&imgdata.color, &imgdata.rawdata.color, sizeof(imgdata.color));
```

`raw2image_ex()` (called from `dcraw_process`) restores `imgdata.color`
from `imgdata.rawdata.color` — the snapshot taken after `unpack()`. Any
mutation made between `unpack` and `dcraw_process` is silently clobbered.

Fix: mirror the new matrix into both `imgdata.color.*` AND
`imgdata.rawdata.color.*` (`cam_xyz`, `rgb_cam`, `pre_mul`). This is now
documented inline in `native/libraw_wrapper.cpp` so the next person doesn't
hit the same rake.

## Test Setup

- Fixture: `fixtures/.cache/public/raw-pixls-iphone-se.dng` (4032 × 3024,
  Apple iPhone SE DNG, Bayer RGGB).
- Settings: strict export policy
  (`outputColor=4` ProPhoto, `outputBps=16`, `noAutoBright=1`,
  `useCameraWb=1`, `useCameraMatrix=1`, `bright=1`, `highlight=2`,
  `userQual=0`, linear gamma).
- Two row-major 3×3 XYZ→Camera matrices A and B with well-conditioned
  determinants, chosen to drive rgb_cam in different directions.
- Each pass: recycle → reapply settings → open_buffer → unpack → inject →
  cam_xyz_coeff → dcraw_process → copy_mem_image. Test runs A, then B,
  then A again to check idempotency.

## Measurements

| Metric | Value |
| ---: | :--- |
| Image size | 4032 × 3024 (36,578,304 RGB16 samples) |
| L2(A, B) | **5,051,169** |
| L2(A, A') | **0** (bit-identical) |
| `\|rgb_cam[A] - rgb_cam[B]\|` (L1, 9 elements) | 33.25 |
| rgb_cam[A] | 5.6434, -2.8985, -1.7449, -2.4282, 2.6309, 0.7973, 0.3306, -0.4261, 1.0955 |
| rgb_cam[B] | 10.8348, -13.3607, 3.5260, -3.9364, 7.6887, -2.7523, 0.2260, -1.4256, 2.1996 |
| pre_mul[A]_after | 1, 0.4550, 0.9231, 0.4550 |
| pre_mul[B]_after | 1, 0.4550, 0.9231, 0.4550 |

### `pre_mul` Behavior

`cam_xyz_coeff` writes `pre_mul[i] = 1 / sum(cam_rgb_row_i)`, so the two
matrices initially produce different `pre_mul` arrays. By the time we read
them back, however, both A and B share the same `pre_mul`. Reason: the
strict export policy uses `useCameraWb=1` and the fixture exposes a valid
`cam_mul`, so `scale_colors()` (src/postprocessing/postprocessing_utils_dcrdefs.cpp:111)
overrides `pre_mul` with the camera WB regardless of what `cam_xyz_coeff`
produced. This is expected and matches dcraw semantics. Production code
that wants the DCP-derived `pre_mul` to win must clear `cam_mul` or run with
`useCameraWb=0`.

### `use_camera_matrix` Notes

The spike intentionally keeps `useCameraMatrix=1` (the strict export
default). Flipping it to 0 routes LibRaw through the `raw_color=1` branch
in `convert_to_rgb_loop`, which skips `out_cam` entirely and emits the raw
camera RGB. That defeats the spike: our injected `rgb_cam` is never read.
The production calibration plumbing must keep `useCameraMatrix=1` so
`convert_to_rgb` picks up the spike-style injection.

### `dcraw_process` Timing

`dcraw_process` is a single bounded operation per invocation; there is no
runtime "swap matrices and re-call cheap" path inside LibRaw — the spike
recycles + reopens + unpacks each time, costing the full per-call ~2s on
the iPhone SE DNG inside Node/jsdom (full-image AHD interpolate + convert).
The fast-swap perf story in the parent worktree relies on caching the
unpacked rawdata; LibRaw does not expose a "re-postprocess without
re-unpacking" entry point, so production worker protocol will need to
either accept the unpack cost or extend LibRaw with a custom entry that
runs `raw2image_ex` + `convert_to_rgb` only after the second open.

## Caveats For Production Code

1. **rawdata mirror is mandatory.** Any production `applyCalibrationToSession`
   must write to both `imgdata.color.*` and `imgdata.rawdata.color.*`
   (matched fields), or run `dcraw_process` will silently revert.
2. **rgb_cam is `[3][4]`**, not `[3][3]`. The 4th column is the X-Trans /
   4-color slot; the spike leaves it zero outside `colors > 3` cameras.
   Production must clear or populate column 3 to avoid stale numbers from
   a previous calibration.
3. **`pre_mul` and `scale_colors` interact.** If a production calibration
   wants DCP-derived neutral, it must drop `use_camera_wb=1` or pre-clear
   `cam_mul`. The spike documents but does not enforce this.
4. **No worker protocol.** The spike adds a single Embind entry
   `applyDcpParamsSpike(settings, matrix)` returning RGB16 + diagnostics.
   It is non-production and must be removed by the follow-up worker
   protocol PR that introduces `applyCalibrationToSession`.
5. **Subclass discipline.** `LumaSpikeLibRaw` is the only place that
   reaches into `protected` LibRaw API. Future protected-helper exposures
   should land here too rather than scattering subclasses.
6. **`cam_xyz_coeff` numerics.** The helper normalizes by row sum; a
   zero-or-negative row sum collapses that row to zero and forces
   `pre_mul=1`. Production calibration profiles with extreme tints may hit
   this; validate matrices before injection.

## Files Touched

- `packages/luma-raw-runtime/native/libraw_wrapper.cpp` — adds
  `LumaSpikeLibRaw` subclass and the `applyDcpParamsSpike` Embind entry.
- `packages/luma-raw-runtime/src/native-dcp-spike.test.ts` — new vitest
  spec covering the three pass conditions.

## Commands

- Build: `pnpm --filter @lumaforge/luma-raw-runtime build:native:desktop`
- Test: `pnpm --filter @lumaforge/luma-raw-runtime exec vitest run src/native-dcp-spike.test.ts`

## Next PR (out of scope)

Worker protocol entry `applyCalibrationToSession({ dcpId, lcpId, ... })`
that:

- Carries the spike's matrix injection into the worker boundary.
- Removes `applyDcpParamsSpike` from the Embind block.
- Adds the rawdata-mirror fix to the production path and re-validates with
  warm-session swap timing.
