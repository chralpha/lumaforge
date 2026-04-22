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
| `/workspaces/LumaForge/test-images/SGL00940.ARW` | Official-candidate Sony fixture | `arw` | `experimental` | Pending |
| `/workspaces/LumaForge/test-images/SGL_1998.NEF` | Official-candidate Nikon fixture | `nef` | `experimental` | Pending |

## Additional manual cases queued for T9

| Case | Status | Notes |
| --- | --- | --- |
| Legal `.cube` LUT | Pending | Add a 17/33/65 grid local fixture before the final sweep |
| Illegal `.cube` LUT | Pending | Use a malformed or unsupported-dimension `.cube` file |
| Export fallback scenario | Pending | Force a high-fidelity export failure, then retry at the recommended level |

## Promotion rule

After each fixture passes the checklist, record the observed `cameraBrand`, `cameraModel`, and `rawFormat` in `src/modules/raw-processor/services/support-matrix.ts` and move that fixture from `experimental` to `official`.
