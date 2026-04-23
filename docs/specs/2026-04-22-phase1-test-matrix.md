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
| `/workspaces/LumaForge/test-images/SGL00940.ARW` | Official-candidate Sony fixture | `arw` | `experimental` | In progress |
| `/workspaces/LumaForge/test-images/SGL_1998.NEF` | Official-candidate Nikon fixture | `nef` | `experimental` | Upload, preview, safe HQ readiness, and JPEG export pass in host DevTools; style/LUT checks pending |

## Additional manual cases queued for T9

| Case | Status | Notes |
| --- | --- | --- |
| Legal `.cube` LUT | Ready | Generated `/workspaces/LumaForge/test-images/phase1-legal-33.cube` |
| Illegal `.cube` LUT | Ready | Generated `/workspaces/LumaForge/test-images/phase1-illegal-29.cube` |
| Export fallback scenario | Blocked | Could not reach a stable export-ready state in the available automated browser environments |

## Validation Results

### Global checks

- upload privacy copy: PASS
- unsupported browser hard-stop: PASS
- automated baseline after runtime fixes: PASS (`pnpm test:run`, `pnpm build`)

### Fixture: SGL00940.ARW

- upload: PASS
- first preview surface: PASS
- HQ preview: BLOCKED in the available automated browser environments
- builtin preset: BLOCKED in the available automated browser environments
- custom LUT: BLOCKED in the available automated browser environments
- compare mode: BLOCKED in the available automated browser environments
- export balanced: BLOCKED in the available automated browser environments
- export fallback recommendation: BLOCKED in the available automated browser environments

### Fixture: SGL_1998.NEF

- upload: PASS in host DevTools via an in-browser `File`
- first preview surface: PASS
- safe HQ readiness: PASS
- no-LUT visible preview: PASS
- builtin preset: PENDING
- custom LUT: PENDING
- compare mode: PENDING
- export balanced: PASS (`SGL_1998_original.jpg`)
- export fallback recommendation: PENDING

## Environment Notes

- `npx playwright install chromium` plus `install-deps chromium` completed successfully inside the container.
- DevTools MCP could not reach the container-hosted dev server directly.
- Headless Chromium and headed Chromium under `xvfb-run` both reached the upload and workspace shell, but the long-running RAW validation stalled before a stable HQ/export-ready state could be observed.
- Runtime stabilization fixes landed during T9 to remove the dev-mode `loseContext()` teardown path and to add framebuffer format fallback for the preview pipeline.
- Host DevTools validation on `localhost:4173` reproduced the NEF crash, then passed after adding sampler isolation, decode output budgets, large-file safe HQ reuse, and pipeline ref wiring for export.

## Promotion rule

After each fixture passes the checklist, record the observed `cameraBrand`, `cameraModel`, and `rawFormat` in `src/modules/raw-processor/services/support-matrix.ts` and move that fixture from `experimental` to `official`.
