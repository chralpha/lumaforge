# Luma RAW Runtime Independent Benchmark Notes

Date: 2026-04-24

Status: local source-build and performance gates PASS.

Independent Luma RAW runtime status: local release-readiness gates passed for browser-local RAW MVP; production-ready status still requires a GitHub Actions run from a clean checkout.

## Provenance

| Field | Value |
| --- | --- |
| Code commit under test | `0e2731ac2194079b26f8c0f211789df1f5d7340f` |
| Native source lock | `packages/luma-raw-runtime/native/sources.lock.json` |
| Source lock SHA-256 | `0063ccceab14b963713aa43ec0358580c9df8380494b7c0f14f5c06faf5ce5c8` |
| Emscripten | `emcc 5.0.6 (6ea9c28c38cdd40c1032fa04400c9d16230ee180)` |
| Browser | `HeadlessChrome/147.0.7727.15`; `crossOriginIsolated: true` |
| JSONL output | `/tmp/luma-raw-runtime-independent-perf.jsonl` |

Locked native sources:

| Source | Version | SHA-256 |
| --- | --- | --- |
| LibRaw | `0.22.1` | `e676248284075605aa2697a66eeed7dc258820bd1d4988c724d29edffd726726` |
| Little CMS | `2.18` | `ee67be3566f459362c1ee094fde2c159d33fa0390aa4ed5f5af676f9e5004347` |

## Build Gate

| Command | Result | Evidence |
| --- | --- | --- |
| `. "$HOME/.cache/lumaforge-emsdk/emsdk_env.sh"` | PASS | `emcc --version` reported `5.0.6`. |
| `pnpm --filter @lumaforge/luma-raw-runtime build:native` | PASS | Rebuilt LCMS and LibRaw from locked source archives, then emitted `dist/native/luma_raw.js`, `dist/native/luma_raw.wasm`, and `dist/native/provenance.json`. |
| LibRaw LCMS configure check | PASS | `config.log` reported `checking for lcms2... yes`; `Makefile` contains `LCMS2_LIBS = ... -llcms2`. |
| `pnpm --filter @lumaforge/luma-raw-runtime native:verify` | PASS | Native provenance and baseline dependency guard passed. |
| `pnpm --filter @lumaforge/luma-raw-runtime build` | PASS | Runtime Vite and TypeScript build completed. |
| `pnpm --filter @lumaforge/luma-raw-runtime test:native-smoke` | PASS | Public DNG smoke decode passed with locally rebuilt native artifacts through the same smoke path used by CI. |
| `pnpm --filter @lumaforge/luma-raw-runtime test` | PASS | 5 test files, 63 tests passed. |
| `pnpm build` | PASS | App production build completed and packaged the native RAW assets. |
| GitHub Actions clean-checkout native build | PENDING | Not run in this local workspace; required before claiming production-ready release status. |

## Fixture List

| Fixture | Role | Size |
| --- | --- | ---: |
| `/workspaces/LumaForge/LibRaw/LibRaw-Wasm/example-sony.ARW` | 24MP-class Sony HQ hard gate; local historical fixture only, not a build input | 31,793,152 |
| `/workspaces/LumaForge/test-images/SGL_1998.NEF` | 45MP Nikon directional HQ evidence | 56,377,803 |
| `/workspaces/LumaForge/test-images/SGL00940.ARW` | 60MP Sony directional HQ evidence | 82,817,024 |

The browser benchmark was run through Playwright because Chrome DevTools MCP file upload exposed container files as zero-byte `File` objects. Playwright selected the same local files through Chromium's file input and confirmed their expected byte sizes.

## JSONL Summary

| File | Stage | MP | Total ms | Read ms | Copy ms | LibRaw open ms | Unpack ms | Heap before | Heap after | Gate result |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| example-sony.ARW | luma-open-session | 26.01 | 85 | 53 | 16 | 13 |  | 268,435,456 | 268,435,456 | baseline |
| example-sony.ARW | luma-embedded | 25.56 | 10 |  | 0 | 0 |  | 268,435,456 | 268,435,456 | within-target |
| example-sony.ARW | luma-quick | 2.50 | 456 |  | 0 | 0 | 455 | 268,435,456 | 268,435,456 | within-target |
| example-sony.ARW | luma-hq | 26.01 | 955 |  | 0 | 0 | 955 | 268,435,456 | 450,297,856 | within-target |
| SGL_1998.NEF | luma-open-session | 45.75 | 115 | 75 | 28 | 9 |  | 268,435,456 | 268,435,456 | baseline |
| SGL_1998.NEF | luma-embedded | 45.44 | 8 |  | 0 | 0 |  | 268,435,456 | 268,435,456 | within-target |
| SGL_1998.NEF | luma-quick | 2.50 | 1,424 |  | 0 | 0 | 1,424 | 268,435,456 | 386,662,400 | within-target |
| SGL_1998.NEF | luma-hq | 45.75 | 2,107 |  | 0 | 0 | 2,106 | 386,662,400 | 790,560,768 | baseline |
| SGL00940.ARW | luma-open-session | 60.97 | 176 | 114 | 48 | 11 |  | 268,435,456 | 268,435,456 | baseline |
| SGL00940.ARW | luma-embedded | 60.22 | 18 |  | 0 | 0 |  | 268,435,456 | 268,435,456 | within-target |
| SGL00940.ARW | luma-quick | 2.50 | 1,394 |  | 0 | 0 | 1,394 | 268,435,456 | 484,048,896 | within-target |
| SGL00940.ARW | luma-hq | 60.97 | 2,595 |  | 0 | 0 | 2,595 | 484,048,896 | 1,068,171,264 | baseline |

Every JSONL row has `provenanceSourceLockSha256 = 0063ccceab14b963713aa43ec0358580c9df8380494b7c0f14f5c06faf5ce5c8`, `error = null`, and heap telemetry.

## Gate Result

Independent performance gate result: PASS.

Release-readiness caveat: the local source-build, smoke, app build, and performance gates passed. The design's CI reproducibility gate remains pending until GitHub Actions builds native wasm and runs the smoke decode from a clean checkout.

Threshold status:

| Threshold | Result |
| --- | --- |
| Embedded preview under 1000ms with non-zero dimensions | PASS: 8ms to 18ms. |
| Quick rows at or below 2.6MP and under 4000ms | PASS: all quick rows are 2.50MP and 456ms to 1,424ms. |
| 24MP-class HQ rows under 8000ms | PASS: `example-sony.ARW` HQ is 26.01MP and 955ms. |
| 45MP+ and 60MP HQ rows recorded as directional evidence | PASS: 45.75MP HQ is 2,107ms; 60.97MP HQ is 2,595ms. |
| Every Luma row has heap telemetry | PASS. |
| Provenance source lock hash present in benchmark output | PASS. |

## Regressions Versus V2 Prototype

No independent-build decode regression required Task 11 optimization.

| File | Stage | Independent ms | Historical V2 ms | Ratio |
| --- | --- | ---: | ---: | ---: |
| example-sony.ARW | luma-quick | 456 | 448 | 1.02 |
| example-sony.ARW | luma-hq | 955 | 883 | 1.08 |
| SGL_1998.NEF | luma-quick | 1,424 | 1,382 | 1.03 |
| SGL_1998.NEF | luma-hq | 2,107 | 2,293 | 0.92 |
| SGL00940.ARW | luma-quick | 1,394 | 1,362 | 1.02 |
| SGL00940.ARW | luma-hq | 2,595 | 3,273 | 0.79 |

The small 24MP quick/HQ differences are within the same browser benchmark band and still far under the hard targets. The largest scenario win remains the product-specific session model versus historical `libraw-wasm`: one input copy per image session, embedded-first preview, capped quick decode, and deferred HQ decode. In the recorded local fixtures, independent Luma HQ is about 6.4x faster than historical `libraw-wasm` HQ on the 26MP Sony fixture, about 4.0x faster on the 45MP Nikon fixture, and about 4.5x faster on the 60MP Sony fixture.
