# Luma RAW Runtime Benchmark Notes

Date: 2026-04-23

> 2026-04-24 correction: This document is superseded for native runtime readiness by `docs/specs/2026-04-24-luma-raw-runtime-independent-build-design.md` and `docs/plans/2026-04-24-luma-raw-runtime-independent-build-implementation-plan.md`. The V2 measurements remain historical prototype evidence, but they do not prove an independent Luma runtime because the native build linked against local `LibRaw-Wasm` artifacts and CI did not rebuild wasm from pinned sources.

## Default Runtime And Dependency Removal

Status: historical prototype PASS only; independent native runtime readiness is blocked until the 2026-04-24 source-build and CI gates pass.

- The app RAW facade now always uses `@lumaforge/luma-raw-runtime`.
- The npm `libraw-wasm` dependency has been removed from the root app, runtime package benchmark, and lockfile.
- Legacy benchmark rows in this document are historical V2 baseline evidence only.
- Live benchmark runs are Luma-only validation runs, but they must be repeated after the independent native build chain replaces the local `LibRaw-Wasm` baseline.

## Historical V2 Benchmark Commands

```bash
pnpm test:run
VITE_RAW_RUNTIME=libraw-wasm pnpm build
. "$HOME/.cache/lumaforge-emsdk/emsdk_env.sh" >/dev/null
pnpm --filter @lumaforge/luma-raw-runtime build:native
VITE_RAW_RUNTIME=luma pnpm build
pnpm --filter @lumaforge/luma-raw-runtime bench:serve
```

These commands were captured during the V2 benchmark run before the final fallback removal. They are retained only as baseline evidence for the legacy-to-Luma comparison below.

## Targets

| Target | Expected |
| --- | --- |
| embedded preview | under 1000 ms |
| quick preview | 2000 to 4000 ms |
| 24MP HQ preview | 5000 to 8000 ms |

## Historical V2 Automated Check Results

| Command | Result | Evidence |
| --- | --- | --- |
| `pnpm test:run` | PASS | 18 test files passed, 127 tests passed |
| `VITE_RAW_RUNTIME=libraw-wasm pnpm build` | PASS | Production build completed in 5.07s; Vite emitted existing large-chunk, generated-route optional export, and checker timing warnings |
| `. "$HOME/.cache/lumaforge-emsdk/emsdk_env.sh" >/dev/null` | PASS | Emscripten SDK environment activated for the native build shell |
| `pnpm --filter @lumaforge/luma-raw-runtime build:native` | PASS | Built native runtime into `packages/luma-raw-runtime/dist/native`; generated JS now exports `Module["HEAPU8"]`; emcc warned about `-pthread` with `ALLOW_MEMORY_GROWTH` |
| `VITE_RAW_RUNTIME=luma pnpm build` | PASS | Production build completed in 4.26s; Vite emitted the same existing warnings |
| `pnpm test:run packages/luma-raw-runtime/worker/native-adapter.test.ts -t "heap"` | PASS | 3 heap telemetry tests passed |
| `pnpm test:run packages/luma-raw-runtime/worker/runtime-core.test.ts -t "heap"` | PASS | 1 session heap telemetry test passed |

## Fixtures

| Fixture | Size | Notes |
| --- | ---: | --- |
| `/workspaces/LumaForge/LibRaw/LibRaw-Wasm/example-sony.ARW` | 31,793,152 bytes | Smaller Sony ARW local fixture; Luma HQ output is about 26MP |
| `/workspaces/LumaForge/test-images/SGL00940.ARW` | 82,817,024 bytes | Sony ARW local fixture; Luma HQ output is about 61MP |
| `/workspaces/LumaForge/test-images/SGL_1998.NEF` | 56,377,803 bytes | Nikon NEF local fixture; Luma HQ output is about 46MP |

## Benchmark Attempts

| Attempt | Result | Evidence |
| --- | --- | --- |
| Chrome DevTools MCP upload with benchmark file input | BLOCKED | DevTools upload produced zero-byte browser `File` objects, including for a 3-byte `/tmp/upload-check.txt`, so it was not used as benchmark evidence |
| Playwright upload using temp `/tmp/luma-playwright` install and cached Chromium | PASS | Browser reported `crossOriginIsolated: true`, selected all three RAW fixtures with expected byte sizes, and emitted 18 benchmark JSONL rows saved to `/tmp/luma-raw-runtime-perf-v2.jsonl` |

## Result Table

| File | Runtime | Stage | File size | Width | Height | MP | Total ms | Read ms | Transfer ms | Copy ms | Open buffer ms | LibRaw open ms | Unpack ms | Process ms | Heap before | Heap after | Heap peak/bytes | Status |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| example-sony.ARW | libraw-wasm | legacy-quick | 31793152 | 3136 | 2084 | 6.54 | 4354 | 59 |  |  | 3818 |  |  | 477 |  |  |  | baseline |
| example-sony.ARW | libraw-wasm | legacy-hq | 31793152 | 6272 | 4168 | 26.14 | 6148 | 62 |  |  | 3776 |  |  | 2310 |  |  |  | baseline |
| example-sony.ARW | luma | luma-open-session | 31793152 | 6240 | 4168 | 26.01 | 78 | 46 |  | 19 | 29 | 10 |  |  | 268435456 | 268435456 | 268435456 | baseline |
| example-sony.ARW | luma | luma-embedded | 31793152 | 6192 | 4128 | 25.56 | 11 |  |  | 0 | 0 | 0 |  |  | 268435456 | 268435456 | 268435456 | within-target |
| example-sony.ARW | luma | luma-quick | 31793152 | 1934 | 1292 | 2.5 | 448 |  |  | 0 | 0 | 0 | 448 |  | 268435456 | 268435456 | 268435456 | within-target |
| example-sony.ARW | luma | luma-hq | 31793152 | 6240 | 4168 | 26.01 | 883 |  |  | 0 | 0 | 0 | 883 |  | 268435456 | 450297856 | 450297856 | within-target |
| SGL00940.ARW | libraw-wasm | legacy-quick | 82817024 | 4783 | 3187 | 15.24 | 11644 | 196 |  |  | 9955 |  |  | 1493 |  |  |  | baseline |
| SGL00940.ARW | libraw-wasm | legacy-hq | 82817024 | 4783 | 3187 | 15.24 | 11644 | 196 |  |  | 9955 |  |  | 1493 |  |  |  | baseline |
| SGL00940.ARW | luma | luma-open-session | 82817024 | 9566 | 6374 | 60.97 | 165 | 110 |  | 41 | 51 | 10 |  |  | 268435456 | 268435456 | 268435456 | baseline |
| SGL00940.ARW | luma | luma-embedded | 82817024 | 9504 | 6336 | 60.22 | 17 |  |  | 0 | 0 | 0 |  |  | 268435456 | 268435456 | 268435456 | within-target |
| SGL00940.ARW | luma | luma-quick | 82817024 | 1936 | 1290 | 2.5 | 1362 |  |  | 0 | 0 | 0 | 1362 |  | 268435456 | 484048896 | 484048896 | within-target |
| SGL00940.ARW | luma | luma-hq | 82817024 | 9566 | 6374 | 60.97 | 3273 |  |  | 0 | 0 | 0 | 3273 |  | 484048896 | 1068171264 | 1068171264 | baseline |
| SGL_1998.NEF | libraw-wasm | legacy-quick | 56377803 | 2760 | 4144 | 11.44 | 8483 | 238 |  |  | 6761 |  |  | 1485 |  |  |  | baseline |
| SGL_1998.NEF | libraw-wasm | legacy-hq | 56377803 | 2760 | 4144 | 11.44 | 8483 | 238 |  |  | 6761 |  |  | 1485 |  |  |  | baseline |
| SGL_1998.NEF | luma | luma-open-session | 56377803 | 8288 | 5520 | 45.75 | 116 | 75 |  | 28 | 38 | 10 |  |  | 268435456 | 268435456 | 268435456 | baseline |
| SGL_1998.NEF | luma | luma-embedded | 56377803 | 8256 | 5504 | 45.44 | 8 |  |  | 0 | 0 | 0 |  |  | 268435456 | 268435456 | 268435456 | within-target |
| SGL_1998.NEF | luma | luma-quick | 56377803 | 1290 | 1937 | 2.5 | 1382 |  |  | 0 | 0 | 0 | 1382 |  | 268435456 | 386662400 | 386662400 | within-target |
| SGL_1998.NEF | luma | luma-hq | 56377803 | 5520 | 8288 | 45.75 | 2293 |  |  | 0 | 0 | 0 | 2292 |  | 386662400 | 790560768 | 790560768 | baseline |

## Performance Optimization V2 Summary

- JS-to-WASM input copy now reports as `copyToWasm`.
- LibRaw open parsing now reports as `librawOpen`.
- Luma uses one runtime session per RAW file.
- Quick output is capped to 2.5MP by default.
- Heap telemetry is recorded per Luma stage.
- V2 gate passed for the local prototype; independent runtime readiness must be re-measured after the source-build migration.

## Raw Benchmark Output

Saved at `/tmp/luma-raw-runtime-perf-v2.jsonl`.

The file contains 18 JSONL rows covering:

- `example-sony.ARW`, `SGL00940.ARW`, and `SGL_1998.NEF`
- historical `legacy-quick` and `legacy-hq` rows for `libraw-wasm`
- `luma-open-session`, `luma-embedded`, `luma-quick`, and `luma-hq` for `luma`

## Memory Growth Impact

`ALLOW_MEMORY_GROWTH=1` is retained in `packages/luma-raw-runtime/native/emcc-flags.sh`.
The native build exports `HEAPU8` via `EXPORTED_RUNTIME_METHODS=HEAPU8`, allowing the worker adapter to report wasm heap byte length before and after each Luma stage.
Observed heap peak reached 1,068,171,264 bytes after `SGL00940.ARW` HQ decode and 790,560,768 bytes after `SGL_1998.NEF` HQ decode.
The largest observed per-stage heap increase was 584,122,368 bytes for `SGL00940.ARW` HQ decode, from 484,048,896 bytes before the stage to 1,068,171,264 bytes after it.

## Rollout Gate Readiness

This benchmark run did not find required Luma stages over target, and embedded previews did not report `0x0`.
Heap telemetry is present for all Luma benchmark rows.
Task 9 gate review completed with the rollout status recorded below, and the later final migration used that result to remove the app fallback and npm `libraw-wasm` dependency.

## V2 Rollout Gate

Historical status: eligible for default-runtime rollout in a separate change.

Evidence:

- Rollout-check script exited `0` for `/tmp/luma-raw-runtime-perf-v2.jsonl` with `checked: 12` and `failures: []`.
- All embedded previews have non-zero dimensions and meet the under-1000 ms target.
- All quick previews are at or below 2.6MP and meet the under-4000 ms target.
- 24MP-class HQ completes under 8000 ms.
- HQ rows above the 30MP gate cutoff are directional baseline evidence and are not compared to the 24MP HQ target.
- Heap telemetry is present for all Luma stages.
- This V2 gate result is now historical context for the completed Luma-only migration.
