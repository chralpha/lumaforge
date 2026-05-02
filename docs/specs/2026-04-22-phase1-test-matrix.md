# Phase 1 Test Matrix

## Official Matrix Seed

The implementation starts with every successfully decoded file marked as `experimental`.
Promote a camera to `official` only after it passes the full checklist below on a local desktop browser with WebGL2.

## Required checks per official fixture

- upload succeeds
- first visible preview appears
- HQ preview completes
- builtin preset can be applied
- custom `.cube` can be applied
- compare mode works without resetting zoom
- JPEG export succeeds at `balanced`

## Current local fixtures

| Fixture                                          | Intended role                    | rawFormat | Support status | Validation status                                                                                                        |
| ------------------------------------------------ | -------------------------------- | --------- | -------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `/workspaces/LumaForge/test-images/SGL00940.ARW` | Official-candidate Sony fixture  | `arw`     | `experimental` | Upload, preview, safe HQ readiness, builtin style, legal/illegal LUT, compare, and export-fallback pass in host DevTools |
| `/workspaces/LumaForge/test-images/SGL_1998.NEF` | Official-candidate Nikon fixture | `nef`     | `experimental` | Upload, preview, safe HQ readiness, JPEG export, builtin style, custom LUT, and compare pass in host DevTools            |

## Additional manual cases queued for T9

| Case                     | Status | Notes                                                                                                   |
| ------------------------ | ------ | ------------------------------------------------------------------------------------------------------- |
| Legal `.cube` LUT        | PASS   | `/workspaces/LumaForge/test-images/phase1-legal-33.cube` loads as a 33³ custom LUT                      |
| Illegal `.cube` LUT      | PASS   | `/workspaces/LumaForge/test-images/phase1-illegal-29.cube` is rejected with an unsupported-size message |
| Export fallback scenario | PASS   | Simulated JPEG `toBlob` failure preserves the session and recommends `safe` fidelity                    |

## Validation Results

### Global checks

- upload privacy copy: PASS
- unsupported browser hard-stop: PASS
- unsupported non-RAW input: PASS (unsupported extension is ignored by the dropzone)
- corrupt RAW input: PASS (error overlay appears and the upload shell remains usable)
- automated baseline after runtime fixes: PASS (`pnpm test:run`, `pnpm build`)

### Fixture: SGL00940.ARW

- upload: PASS
- first preview surface: PASS
- safe HQ readiness: PASS in host DevTools
- builtin preset: PASS in host DevTools (`Warm` changed the sampled preview pixel)
- custom LUT: PASS in host DevTools with `phase1-legal-33.cube`
- invalid LUT recovery: PASS in host DevTools (`phase1-illegal-29.cube` rejected while the ARW session and legal LUT stayed active)
- compare mode: PASS in host DevTools (`Original` / `Processed` toggled the sampled output)
- export balanced: DEGRADED as expected in host DevTools after a simulated JPEG blob failure
- export fallback recommendation: PASS (`EXPORT_JPEG_BLOB_FAILED. Retry with safe fidelity.`)

### Fixture: SGL_1998.NEF

- upload: PASS in host DevTools via an in-browser `File`
- first preview surface: PASS
- safe HQ readiness: PASS
- no-LUT visible preview: PASS
- builtin preset: PASS in host DevTools (`Warm` changed the preview; `Off` restored the sampled original pixel)
- custom LUT: PASS in host DevTools with a legal 33³ V-Log-marked `.cube`
- compare mode: PASS in host DevTools (`Original` restored the sampled source pixel; `Processed` restored the styled pixel)
- export balanced: PASS (`SGL_1998_original.jpg`)
- export fallback recommendation: PASS via the shared ARW export-failure validation path

### Recovery paths

- unsupported browser hard-stop: PASS
- invalid RAW input shell recovery: PASS
- invalid LUT session preservation: PASS
- HQ failure keeps quick preview path: PASS (`runPreviewPipeline` emits `quick-ready` then `hq-failed`)
- export failure retry recommendation: PASS
- replacing/resetting file state: PASS (`loadFile` resets style/LUT state; reset path returns to the upload shell)

## Environment Notes

- `npx playwright install chromium` plus `install-deps chromium` completed successfully inside the container.
- DevTools MCP could not reach the container-hosted dev server directly.
- Headless Chromium and headed Chromium under `xvfb-run` both reached the upload and workspace shell, but the long-running RAW validation stalled before a stable HQ/export-ready state could be observed.
- Runtime stabilization fixes landed during T9 to remove the dev-mode `loseContext()` teardown path and to add framebuffer format fallback for the preview pipeline.
- Host DevTools validation on `localhost:4173` reproduced the NEF crash, then passed after adding sampler isolation, decode output budgets, large-file safe HQ reuse, and pipeline ref wiring for export.

## Promotion rule

After each fixture passes the checklist, record the observed `cameraBrand`, `cameraModel`, and `rawFormat` in `src/modules/raw-processor/services/support-matrix.ts` and move that fixture from `experimental` to `official`.

## Post Phase 1.5 RAW Runtime Migration Checks

| Case                                                     | Runtime | Expected                                                                                                                                     |
| -------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Open supported RAW with the default runtime              | luma    | Embedded preview appears first when available, quick preview upgrades into the styled canvas, and HQ replaces quick without resetting style  |
| Open second RAW in the same tab with the default runtime | luma    | Camera metadata and preview dimensions come from the second file, and the session state is rebuilt from the second file instead of the first |
| Disable cross-origin isolation                           | luma    | RAW route shows unsupported-state copy explaining that cross-origin isolation is required for pthread RAW decode                             |
| Run package/source dependency scan                       | repo    | `! rg "libraw-wasm" package.json pnpm-lock.yaml src packages` exits successfully, proving there are no active package or source references   |

## Post Phase 1.5 Runtime Performance Validation

| Fixture          | Runtime      | Embedded | Quick             | HQ                 | Heap telemetry | Result                                                                                                                     |
| ---------------- | ------------ | -------- | ----------------- | ------------------ | -------------- | -------------------------------------------------------------------------------------------------------------------------- |
| example-sony.ARW | luma session | 10ms     | 456ms at 2.50MP   | 955ms at 26.01MP   | Recorded       | Independent source-built benchmark PASS; 24MP-class hard gate met; GitHub Actions clean-checkout gate PASS                 |
| SGL00940.ARW     | luma session | 18ms     | 1,394ms at 2.50MP | 2,595ms at 60.97MP | Recorded       | Independent source-built benchmark PASS; 60MP HQ retained as directional evidence; GitHub Actions clean-checkout gate PASS |
| SGL_1998.NEF     | luma session | 8ms      | 1,424ms at 2.50MP | 2,107ms at 45.75MP | Recorded       | Independent source-built benchmark PASS; 45MP HQ retained as directional evidence; GitHub Actions clean-checkout gate PASS |

## Historical high-resolution full-res export acceptance

Status refreshed 2026-04-26. Historical evidence below was captured before
the LibRaw processed-window export path replaced the earlier RAW-window export
contract; do not read these rows as current processed-window browser JPEG
acceptance for this branch.

| Fixture                                 | Browser        | Expected                                                                                          | Result             | Evidence                                                                                                                                                                                                                  |
| --------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 61MP RAW fixture                        | Chrome desktop | Full-resolution JPEG export completes with exported dimensions equal to runtime output dimensions | HISTORICAL PASS    | Production preview Chrome exported `SGL00940_neutral_fullres.jpg`; captured JPEG blob was `28,991,385` bytes and browser-decoded to `9566×6374`, matching the runtime output dimensions before the processed-window path. |
| 61MP RAW fixture                        | Safari desktop | Full-resolution JPEG export completes or fails closed without renderer crash                      | HISTORICAL PENDING | Safari host acceptance was still pending for the earlier RAW-window path.                                                                                                                                                 |
| 100MP RAW fixture                       | Chrome desktop | Full-resolution JPEG export completes or fails closed without renderer crash                      | HISTORICAL PASS    | Production preview Chrome loaded `GFX100RF.RAF` without renderer crash and fail-closed with export disabled before the processed-window path: `missing-color-transform, unsupported-cfa`.                                 |
| Unsupported pre-processed-window source | Chrome desktop | Full-resolution export disabled with an unsupported raw-window reason                             | HISTORICAL PASS    | Production preview Chrome loaded `COOLSCAN.nef` and disabled export with `raw-window-unavailable, unsupported-cfa` before the processed-window path.                                                                      |
| Unknown LUT profile                     | Chrome desktop | Full-resolution export disabled until user selects LUT input                                      | HISTORICAL PASS    | Production preview Chrome loaded `phase1-legal-33.cube` on `SGL00940.ARW`; export disabled before the processed-window path with `Choose a LUT input profile before full-resolution export.`                              |

Task 15 command evidence:

- PASS: `pnpm test:run packages/luma-raw-runtime/src/runtime.test.ts packages/luma-raw-runtime/worker/native-adapter.test.ts packages/luma-raw-runtime/worker/runtime-core.test.ts packages/luma-jpeg-runtime/src/runtime.test.ts packages/luma-jpeg-runtime/worker/runtime-core.test.ts src/lib/export/color-graph.test.ts src/lib/export/strip-scheduler.test.ts src/lib/export/buffer-pool.test.ts src/lib/export/demosaic.test.ts src/lib/export/lut3d.test.ts src/lib/export/raw-window-transform.test.ts src/lib/export/jpeg/row-writer.test.ts src/lib/export/full-res-export.test.ts src/lib/export/full-res-export-client.test.ts src/lib/raw/runtime-adapter.test.ts src/modules/raw-processor/__tests__/session-derive.test.ts src/modules/raw-processor/__tests__/export-system.test.ts src/modules/raw-processor/__tests__/preview-pipeline.test.ts src/modules/raw-processor/hooks/useRawProcessor.test.tsx` (`19` files, `208` tests).
- PASS: `pnpm --filter @lumaforge/luma-raw-runtime build:native` after activating the cached Emscripten SDK; native artifacts `luma_raw.js`, `luma_raw.wasm`, and `provenance.json` were written and verified.
- PASS: `pnpm --filter @lumaforge/luma-raw-runtime native:verify`.
- PASS: `pnpm --filter @lumaforge/luma-raw-runtime fixtures:fetch-public` followed by `pnpm --filter @lumaforge/luma-raw-runtime test:native-smoke` (`1` test).
- PASS: `pnpm --filter @lumaforge/luma-raw-runtime test` (`5` files, `81` tests).
- PASS: `pnpm --dir packages/luma-raw-runtime exec vitest run worker/native-adapter.test.ts` (`31` tests), including LibRaw CFA green-slot normalization and idempotent native unpack coverage.
- PASS: Direct native probe/read smoke for `SGL00940.ARW` after capability probing: supported `9566×6374`, CFA `rggb`, and RAW windows `16×16` plus `9566×516` both read successfully.
- PASS: `pnpm --filter @lumaforge/luma-jpeg-runtime test` (`2` files, `17` tests).
- PASS: `pnpm --filter @lumaforge/luma-jpeg-runtime build`.
- PASS: `pnpm --filter @lumaforge/luma-raw-runtime build`.
- PASS: `pnpm build`; existing route-builder undefined `loader`/`handle` and chunk-size warnings remain non-fatal.
- HISTORICAL PASS: Production preview on desktop Chrome loaded `/raw`, exported the 61MP fixture, and confirmed fail-closed gating for the 100MP, unsupported RAW-window, and unknown LUT profile cases above before the processed-window path. Browser full JPEG export has not been rerun for the current processed-window branch.
- PENDING: desktop Safari full-resolution fixture acceptance still needs to run on a Safari host.

## Full-resolution LibRaw processed-window RAW export

| Fixture                                                                                       | Expected result                                                                                           | Status                                                                                                                                                                                                           |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/workspaces/LumaForge/test-images/SGL00940.ARW`                                              | Full-resolution export uses `libraw-processed-window` and succeeds.                                       | NATIVE SMOKE PASS during Task 7: `pnpm --filter @lumaforge/luma-raw-runtime test:native-smoke` processed a bounded LibRaw cropbox window for Sony ARW. Browser full JPEG export was not rerun in Task 7.         |
| `/workspaces/LumaForge/test-images/SGL_1998.NEF`                                              | Full-resolution export uses `libraw-processed-window`; non-identity orientation is not a support blocker. | NATIVE SMOKE PASS during Task 7: `pnpm --filter @lumaforge/luma-raw-runtime test:native-smoke` processed a bounded LibRaw cropbox window for Nikon NEF. Browser full JPEG export was not rerun in Task 7.        |
| `/workspaces/LumaForge/test-images/Fujifilm - GFX100RF - 16bit lossless compressed (4_3).RAF` | Full-resolution export uses `libraw-processed-window` when LibRaw reports a processable source.           | NATIVE SMOKE PASS during Task 7: `pnpm --filter @lumaforge/luma-raw-runtime test:native-smoke` processed a bounded LibRaw cropbox window for Fujifilm GFX RAF. Browser full JPEG export was not rerun in Task 7. |

## Full-resolution export performance validation

Status refreshed 2026-04-28 on the export performance optimization branch.

| Area                        | Case                                              | Browser or tool                                                      | Status  | Evidence                                                                                                                                                                                                                                           |
| --------------------------- | ------------------------------------------------- | -------------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full-resolution export perf | 61MP Sony ARW                                     | Chrome/Edge production preview, validated with Headless Chromium 143 | PASS    | Exported `SGL00940_neutral_fullres.jpg`; browser decoded JPEG blob `42,966,085` bytes to `9566x6374`; summary metric `totalMs=9746.53`, `stripRows=512`, `concurrency=2`, `retries=0`.                                                             |
| Full-resolution export perf | 100MP Fujifilm GFX100RF RAF + supported V-Log LUT | Chrome/Edge production preview, validated with Headless Chromium 143 | PASS    | Exported `Fujifilm - GFX100RF - 16bit lossless compressed (4_3)_Generated by Resolve_fullres.jpg`; browser decoded JPEG blob `28,538,713` bytes to `11662x8746`; summary metric `totalMs=65018.91`, `stripRows=512`, `concurrency=2`, `retries=0`. |
| Full-resolution export perf | 100MP JPEG encode-only                            | `@lumaforge/luma-jpeg-runtime` benchmark                             | PASS    | All rows reported `dimensionMatch=true`, decoded `11662x8746`, and `outputBytes > 0`. Runtime-direct totals: black `1938.7-1985.7ms`, gradient `2187.4-2269.6ms`, high-entropy `6013.7-6209.3ms`.                                                  |
| Full-resolution export perf | Safari smoke                                      | Safari production preview                                            | BLOCKED | Safari is unavailable in the current Linux/container environment; this row still requires a Safari host running the same production build.                                                                                                         |

## iOS Safari 100MP Export Compatibility

| Environment                          | Fixture                           | Required evidence                                                              |
| ------------------------------------ | --------------------------------- | ------------------------------------------------------------------------------ |
| Playwright WebKit mobile preflight   | 100MP RAF when locally available  | `ios-safe`, `64` or `128` rows, concurrency `1`, safe-retry checkpoint mode    |
| Chromium desktop preflight           | same supported fixture family     | `desktop-fast` remains available and does not inherit iOS row limits           |
| iPhone low-RAM Safari                | 100MP RAF                         | completes or detects interruption and asks for source reselect with retry copy |
| Newer iPhone Safari                  | 100MP RAF                         | completes in `ios-safe` without full-size canvas/ImageData export              |
| iPad Safari                          | 100MP RAF                         | completes in `ios-safe` or documented higher safe profile with JSONL metrics   |
| Private Browsing or OPFS unavailable | 100MP RAF                         | non-durable checkpoint copy and no misleading resume wording                   |
| Low storage quota                    | 100MP RAF                         | fails closed before compressed output memory spike                             |
| Reload after checkpoint              | 100MP RAF                         | detects active manifest and retries from row `0` after source verification     |
| Unsupported RAW                      | unsupported fixture               | fail-closed source copy remains intact                                         |
| Unsupported LUT contract             | supported RAW plus unresolved LUT | fail-closed LUT contract copy remains intact                                   |
