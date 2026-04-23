# Luma RAW Runtime Benchmark Notes

Date: 2026-04-23

## Commands

```bash
pnpm test:run
VITE_RAW_RUNTIME=libraw-wasm pnpm build
pnpm --filter @lumaforge/luma-raw-runtime build:native
. "$HOME/.cache/lumaforge-emsdk/emsdk_env.sh" >/dev/null && pnpm --filter @lumaforge/luma-raw-runtime build:native
VITE_RAW_RUNTIME=luma pnpm build
pnpm --filter @lumaforge/luma-raw-runtime bench:serve
```

## Targets

| Target | Expected |
| --- | --- |
| embedded preview | under 1000 ms |
| quick preview | 2000 to 4000 ms |
| 24MP HQ preview | 5000 to 8000 ms |

## Automated Check Results

| Command | Result | Evidence |
| --- | --- | --- |
| `pnpm test:run` | PASS | 18 test files passed, 96 tests passed |
| `VITE_RAW_RUNTIME=libraw-wasm pnpm build` | PASS | Production build completed in 3.87s |
| `pnpm --filter @lumaforge/luma-raw-runtime build:native` | BLOCKED without SDK env | `emcc is required. Activate the Emscripten SDK before running build:native.` |
| `. "$HOME/.cache/lumaforge-emsdk/emsdk_env.sh" >/dev/null && pnpm --filter @lumaforge/luma-raw-runtime build:native` | PASS | Built native runtime into `packages/luma-raw-runtime/dist/native` |
| `VITE_RAW_RUNTIME=luma pnpm build` | PASS | Production build completed in 3.98s |

## Fixture

| Fixture | Size | Notes |
| --- | ---: | --- |
| `/workspaces/LumaForge/test-images/SGL00940.ARW` | 82,817,024 bytes | Sony ARW local fixture; not committed |

## Benchmark Attempts

| Attempt | Result | Evidence |
| --- | --- | --- |
| Chrome DevTools MCP upload with `/workspaces/LumaForge/test-images/SGL00940.ARW` | ERROR | Page emitted JSON errors for `libraw-wasm/full` and all Luma stages: `A requested file or directory could not be found at the time an operation was processed.` |
| Chrome DevTools MCP upload with `/workspaces/LumaForge/LibRaw/LibRaw-Wasm/example-sony.ARW` | ERROR | Same JSON error emitted for `libraw-wasm/full` and all Luma stages. |
| Playwright upload using temp `/tmp/luma-playwright` install and cached Chromium | PASS | Browser reported `crossOriginIsolated: true` and emitted four benchmark JSONL rows saved to `/tmp/luma-raw-runtime-bench.jsonl`. |

## Result Table

| Fixture | Runtime | Stage | Width | Height | Total ms | Target status |
| --- | --- | --- | ---: | ---: | ---: | --- |
| SGL00940.ARW | libraw-wasm | full | 9566 | 6374 | 15169 | Legacy comparison baseline |
| SGL00940.ARW | luma | embedded | 0 | 0 | 14995 | Target exceeded: expected under 1000 ms |
| SGL00940.ARW | luma | quick | 4783 | 3187 | 16882 | Target exceeded: expected 2000 to 4000 ms |
| SGL00940.ARW | luma | hq | 9566 | 6374 | 18196 | Target exceeded: expected 5000 to 8000 ms |

## Raw Benchmark Output

Saved at `/tmp/luma-raw-runtime-bench.jsonl`:

```jsonl
{"runtime":"libraw-wasm","stage":"full","file":"SGL00940.ARW","width":9566,"height":6374,"total":15169.01500000013}
{"runtime":"luma","stage":"embedded","file":"SGL00940.ARW","width":0,"height":0,"total":14995.044999999925,"timings":{"openBuffer":14857.079999999609,"metadata":1.5150000001303852,"thumbnail":19.805000000167638,"total":14995.044999999925,"readFile":109.78500000014901}}
{"runtime":"luma","stage":"quick","file":"SGL00940.ARW","width":4783,"height":3187,"total":16881.95499999961,"timings":{"openBuffer":15325.73499999987,"metadata":0.0849999999627471,"unpack":1457.0750000001863,"total":16881.95499999961,"readFile":99.0449999999255}}
{"runtime":"luma","stage":"hq","file":"SGL00940.ARW","width":9566,"height":6374,"total":18195.825000000186,"timings":{"openBuffer":15344.645000000019,"metadata":0.17500000027939677,"unpack":2760.714999999851,"total":18195.825000000186,"readFile":90.27999999979511}}
```
