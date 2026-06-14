# Selective Color HSL MVP — performance prototype gate

Date: 2026-06-14
Branch: `feat/selective-color-hsl-mvp`
HEAD at capture: `37aa257bb01a0eb03f627eb2c46086b71d69bf48`
Status: **PENDING (iPhone 13 run not yet executed; desktop baseline captured)**

## Purpose

Falsify the performance budget for the selective-color stage:

- Preview interactive at 60 fps while dragging an HSL slider on iPhone
  13-class Safari.
- Full 16 MP export wall-clock < 2 s total.

Source spec: `docs/specs/2026-06-14-selective-color-hsl-mvp-design.md`
(§Performance budget, §CPU export budget realism and fallback decision,
§Performance prototype gate).

## What was measured locally (this run)

**Environment:**

- Host: WSL2 / Node 24 / x86_64.
- Build: `LUMAFORGE_NATIVE_RUNTIME_MODE=prebuilt pnpm build` — clean
  (`built in 7.30s`, no type or bundler errors).
- Bench: `node scripts/bench-selective-color-row.ts` — 1024×1024 (1 MP)
  synthetic OKLCh gradient through `applySelectiveColorRow` with a
  non-trivial bake (`red.hue=+50`, `blue.saturation=-30`), 2 warm-up plus
  10 measured iterations.

**Selective-color CPU stage results:**

```
selective_color_row: input=1024x1024 (1048576 px), iterations=10
selective_color_row: total_ms_per_pass_avg=100.473
selective_color_row: total_ms_per_pass_median=100.456
selective_color_row: total_ms_per_pass_min=99.602
selective_color_row: total_ms_per_pass_max=101.772
selective_color_row: pixels_per_ms=10436
selective_color_row: megapixels_per_second=10.44
```

**Extrapolated to 16 MP single-threaded export (this hardware):**

- Avg ms per 1 MP pass: 100.473 ms.
- 16 MP single-threaded selective-color stage: ≈ 1607.6 ms.
- This is the selective-color stage in isolation, **not** the total export
  wall-clock.

## Gate criteria (from spec)

Pass condition (selective color promoted out of feature-flag):

1. Preview frame time during slider drag at the actual `/raw` preview
   canvas size stays at or above 55 fps for ≥ 95 % of frames in a
   one-minute drag log.
2. 16 MP export wall-clock **total** < 2 s.
3. Selective-color stage in isolation adds less than 5 ms per preview
   frame when measured against the same scene with selective color
   disabled.

Failure handling (per spec §CPU export budget realism and fallback
decision):

- If selective color misses the in-isolation 5 ms preview budget,
  diagnose whether the existing preview pipeline was already at the
  budget before this stage was added.
- If 16 MP export total > 2 s and the cause is selective color, escalate
  per the fallback ladder:
  1. Ship at measured cost behind no flag if total wall-clock is still
     < 2 s — the gate is total wall-clock, not stage in isolation.
  2. Promote selective color to the GPU export path (deferred to v2).
  3. Lower-cost CPU approximation that still passes the LUT-survival
     pixel-parity test.

## Local baseline observations (advisory)

The local CPU bench reports ≈ 100 ms per 1 MP single-threaded on
desktop x86_64 Node 24 / WSL2. Extrapolated to 16 MP: ≈ 1.6 s for the
selective-color stage **in isolation**.

The spec's narrative targeted ≈ 200 ms per stage on the export path; the
local measurement is ≈ 8× that target on this hardware. The spec
explicitly framed those numbers as targets to be falsified by the bench,
and the gate that ships is the **total** 16 MP export wall-clock < 2 s,
not the stage-in-isolation 200 ms anchor.

Mobile is expected to be slower than desktop x86_64. The iPhone 13
Safari run is required to evaluate the real total-wall-clock gate; the
desktop number alone cannot pass or fail the gate.

## iPhone 13 prototype protocol (pending)

**Operator steps:**

1. Check out `feat/selective-color-hsl-mvp` at commit
   `37aa257bb01a0eb03f627eb2c46086b71d69bf48` (or the latest commit on
   the branch at run time — note the SHA in the recording template
   below).
2. Build the preview asset:

   ```bash
   pnpm install
   pnpm native:prepare
   LUMAFORGE_NATIVE_RUNTIME_MODE=prebuilt pnpm build
   pnpm serve   # or: pnpm exec vite preview
   ```

3. Open `/raw` on an iPhone 13/14-class Safari connected to the dev
   host. Load a 16 MP RAW fixture from
   `packages/luma-raw-runtime/fixtures/`.
4. Frame-time recording:
   - Open Safari Web Inspector → Timelines → JavaScript & Events.
   - Drag the `red.hue` slider continuously for one minute. Sample at
     5-second intervals.
   - Note median, p5, and p95 frame times.
5. 16 MP export wall-clock:
   - Tap Export, await the export-ready banner.
   - Record total wall-clock from tap to ready.
6. Spot-check the failure modes:
   - Load a fixture with a clear blue sky. Drag `aqua.saturation` to
     −50. Verify no visible cyan→teal shift.
   - Load a fixture with face-forward skin. Drag `red.hue` and
     `orange.hue` independently to +50. Verify smooth, expected
     behaviour.
7. Note any device-lost or memory-pressure warnings in the Safari
   console.

**Recording template:**

| Metric | Measured value | Gate | Pass/Fail |
| --- | --- | --- | --- |
| Branch HEAD SHA at run | | record exact SHA | — |
| Preview frame time (median, slider drag) | | ≤ 16.6 ms (60 fps) ideal; ≤ 18.2 ms (55 fps) acceptable for ≥ 95 % of frames | |
| Preview frame time (p95, slider drag) | | ≤ 18.2 ms | |
| Selective-color stage cost in isolation (frame delta vs disabled) | | < 5 ms | |
| 16 MP export wall-clock total | | < 2 s | |
| `aqua_no_shift_under_desaturation` visual spot check | | No visible teal | |
| `skin_attenuation_under_red` visual spot check | | Smoothly attenuated | |

## Decision matrix (operator)

After the iPhone run:

- **All gates pass:** mark this audit as PASS, file the PR.
- **Preview fps regression caused by selective color (in-isolation
  > 5 ms):** disable the chroma-clamp `smoothstep` AND/OR seam
  interpolation as a temporary toggle and re-measure. If a single toggle
  reproduces budget, document the toggle as a v1 trade-off.
- **Preview fps regression NOT caused by selective color:** document the
  upstream culprit; ship selective color unchanged.
- **Export total > 2 s, selective color is the major contributor:**
  escalate per spec fallback ladder (ship at measured cost OR introduce
  lower-cost CPU approximation OR defer to GPU export).
- **Memory pressure or device-lost on iPhone:** file as a real concern;
  do not ship without resolution.

## Open follow-ups

- T13's CPU bench measures total per-pass time. Per-step decomposition
  (matmul forward, signedCbrt, atan2, LUT sample, sin/cos, matmul
  inverse) is deferred. If the iPhone run flags selective color as the
  perf bottleneck, instrument the per-step breakdown to pinpoint the hot
  loop's expensive ops before reaching for the fallback ladder.
- The local ≈ 100 ms per 1 MP single-threaded number suggests Web Worker
  parallelism could reduce wall-clock at the cost of memory bandwidth.
  Out of scope for v1 per the spec (no WASM-SIMD-threaded backend in
  this MVP).
- The neutral-bypass in `row-band-processor.ts` (T8) preserves byte-exact
  precision for all-neutral graphs. Re-confirm on the iPhone that the
  bypass triggers when the user has not touched HSL — a regressed bypass
  would silently charge the stage cost on every export.
