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

| Fixture | Intended role | rawFormat | Support status | Validation status |
| --- | --- | --- | --- | --- |
| `/workspaces/LumaForge/test-images/SGL00940.ARW` | Official-candidate Sony fixture | `arw` | `experimental` | Upload, preview, safe HQ readiness, builtin style, legal/illegal LUT, compare, and export-fallback pass in host DevTools |
| `/workspaces/LumaForge/test-images/SGL_1998.NEF` | Official-candidate Nikon fixture | `nef` | `experimental` | Upload, preview, safe HQ readiness, JPEG export, builtin style, custom LUT, and compare pass in host DevTools |

## Additional manual cases queued for T9

| Case | Status | Notes |
| --- | --- | --- |
| Legal `.cube` LUT | PASS | `/workspaces/LumaForge/test-images/phase1-legal-33.cube` loads as a 33³ custom LUT |
| Illegal `.cube` LUT | PASS | `/workspaces/LumaForge/test-images/phase1-illegal-29.cube` is rejected with an unsupported-size message |
| Export fallback scenario | PASS | Simulated JPEG `toBlob` failure preserves the session and recommends `safe` fidelity |

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

| Case | Runtime | Expected |
| --- | --- | --- |
| Open supported RAW with the default runtime | luma | Embedded preview appears first when available, quick preview upgrades into the styled canvas, and HQ replaces quick without resetting style |
| Open second RAW in the same tab with the default runtime | luma | Camera metadata and preview dimensions come from the second file, and the session state is rebuilt from the second file instead of the first |
| Disable cross-origin isolation | luma | RAW route shows unsupported-state copy explaining that cross-origin isolation is required for pthread RAW decode |
| Run package/source dependency scan | repo | `! rg "libraw-wasm" package.json pnpm-lock.yaml src packages` exits successfully, proving there are no active package or source references |

## Post Phase 1.5 Runtime Performance Validation

| Fixture | Runtime | Embedded | Quick | HQ | Heap telemetry | Result |
| --- | --- | --- | --- | --- | --- | --- |
| example-sony.ARW | luma session | 10ms | 456ms at 2.50MP | 955ms at 26.01MP | Recorded | Independent source-built benchmark PASS; 24MP-class hard gate met; GitHub Actions clean-checkout gate PASS |
| SGL00940.ARW | luma session | 18ms | 1,394ms at 2.50MP | 2,595ms at 60.97MP | Recorded | Independent source-built benchmark PASS; 60MP HQ retained as directional evidence; GitHub Actions clean-checkout gate PASS |
| SGL_1998.NEF | luma session | 8ms | 1,424ms at 2.50MP | 2,107ms at 45.75MP | Recorded | Independent source-built benchmark PASS; 45MP HQ retained as directional evidence; GitHub Actions clean-checkout gate PASS |

## High-resolution full-res export acceptance

| Case | Expected result |
| --- | --- |
| 61MP Chrome desktop | Full-resolution JPEG export completes or fails closed without renderer crash |
| 61MP Safari desktop | Full-resolution JPEG export completes or fails closed without renderer crash |
| 100MP Chrome desktop | Full-resolution JPEG export completes or fails closed without renderer crash |
| Unsupported RAW-window source | Full-resolution export is disabled with reason |
| Unknown LUT profile | Full-resolution export is disabled with reason |
