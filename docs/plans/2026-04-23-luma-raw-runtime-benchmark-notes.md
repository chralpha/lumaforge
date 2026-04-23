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

## Fixtures

| Fixture | Size | Notes |
| --- | ---: | --- |
| `/workspaces/LumaForge/test-images/SGL00940.ARW` | 82,817,024 bytes | Sony ARW local fixture; 9566 x 6374 legacy output is about 61MP, so target comparison is directional and not directly comparable to the 24MP HQ budget |
| `/workspaces/LumaForge/LibRaw/LibRaw-Wasm/example-sony.ARW` | 31,793,152 bytes | Smaller Sony ARW local fixture; 6240 x 4168 Luma HQ output is about 26MP, closest available local fixture for the 24MP HQ budget |

## Benchmark Attempts

| Attempt | Result | Evidence |
| --- | --- | --- |
| Chrome DevTools MCP upload with `/workspaces/LumaForge/test-images/SGL00940.ARW` | ERROR | Page emitted JSON errors for `libraw-wasm/full` and all Luma stages: `A requested file or directory could not be found at the time an operation was processed.` |
| Chrome DevTools MCP upload with `/workspaces/LumaForge/LibRaw/LibRaw-Wasm/example-sony.ARW` | ERROR | Same JSON error emitted for `libraw-wasm/full` and all Luma stages. |
| Playwright upload using temp `/tmp/luma-playwright` install and cached Chromium with `SGL00940.ARW` | PASS | Browser reported `crossOriginIsolated: true` and emitted four benchmark JSONL rows saved to `/tmp/luma-raw-runtime-bench.jsonl`. |
| Playwright upload using temp `/tmp/luma-playwright` install and cached Chromium with `example-sony.ARW` | PASS | Browser reported `crossOriginIsolated: true` and emitted four benchmark JSONL rows saved to `/tmp/luma-raw-runtime-bench-example-sony.jsonl`. |

## Result Table

| Fixture | Runtime | Stage | Width | Height | Total ms | Target comparison |
| --- | --- | --- | ---: | ---: | ---: | --- |
| SGL00940.ARW | libraw-wasm | full | 9566 | 6374 | 15169 | Legacy comparison baseline; about 61MP, not directly comparable to 24MP target |
| SGL00940.ARW | luma | embedded | 0 | 0 | 14995 | Directional only for this 61MP fixture; exceeds embedded target under 1000 ms |
| SGL00940.ARW | luma | quick | 4783 | 3187 | 16882 | Directional only for this 61MP fixture; exceeds quick target 2000 to 4000 ms |
| SGL00940.ARW | luma | hq | 9566 | 6374 | 18196 | Directional only for this 61MP fixture; exceeds 24MP HQ target 5000 to 8000 ms |
| example-sony.ARW | libraw-wasm | full | 6272 | 4168 | 11585 | Legacy comparison baseline; about 26MP |
| example-sony.ARW | luma | embedded | 0 | 0 | 5806 | Exceeds embedded target under 1000 ms |
| example-sony.ARW | luma | quick | 3120 | 2084 | 6442 | Exceeds quick target 2000 to 4000 ms |
| example-sony.ARW | luma | hq | 6240 | 4168 | 6951 | Within 24MP HQ target 5000 to 8000 ms, using closest available local fixture at about 26MP |

## Raw Benchmark Output

Saved at `/tmp/luma-raw-runtime-bench.jsonl`:

```jsonl
{"runtime":"libraw-wasm","stage":"full","file":"SGL00940.ARW","width":9566,"height":6374,"total":15169.01500000013}
{"runtime":"luma","stage":"embedded","file":"SGL00940.ARW","width":0,"height":0,"total":14995.044999999925,"timings":{"openBuffer":14857.079999999609,"metadata":1.5150000001303852,"thumbnail":19.805000000167638,"total":14995.044999999925,"readFile":109.78500000014901}}
{"runtime":"luma","stage":"quick","file":"SGL00940.ARW","width":4783,"height":3187,"total":16881.95499999961,"timings":{"openBuffer":15325.73499999987,"metadata":0.0849999999627471,"unpack":1457.0750000001863,"total":16881.95499999961,"readFile":99.0449999999255}}
{"runtime":"luma","stage":"hq","file":"SGL00940.ARW","width":9566,"height":6374,"total":18195.825000000186,"timings":{"openBuffer":15344.645000000019,"metadata":0.17500000027939677,"unpack":2760.714999999851,"total":18195.825000000186,"readFile":90.27999999979511}}
```

Saved at `/tmp/luma-raw-runtime-bench-example-sony.jsonl`:

```jsonl
{"runtime":"libraw-wasm","stage":"full","file":"example-sony.ARW","width":6272,"height":4168,"total":11585.42500000028}
{"runtime":"luma","stage":"embedded","file":"example-sony.ARW","width":0,"height":0,"total":5806.26500000013,"timings":{"openBuffer":5745.895000000019,"metadata":0.7099999999627471,"thumbnail":11.489999999757856,"total":5806.26500000013,"readFile":45.890000000130385}}
{"runtime":"luma","stage":"quick","file":"example-sony.ARW","width":3120,"height":2084,"total":6441.824999999721,"timings":{"openBuffer":5902.814999999944,"metadata":0.060000000055879354,"unpack":498.69499999983236,"total":6441.824999999721,"readFile":40.239999999757856}}
{"runtime":"luma","stage":"hq","file":"example-sony.ARW","width":6240,"height":4168,"total":6951.339999999851,"timings":{"openBuffer":5862.930000000168,"metadata":0.09499999973922968,"unpack":1047.1200000001118,"total":6951.339999999851,"readFile":41.14500000001863}}
```

## Memory Growth Impact

`ALLOW_MEMORY_GROWTH=1` is retained in `packages/luma-raw-runtime/native/emcc-flags.sh`.
The current browser benchmark does not directly measure wasm heap growth or peak memory.
Observed timings include large `openBuffer` costs, so these results should be treated as performance-risk evidence, not proof that memory growth is acceptable.
Follow-up is required to capture browser memory, heap, or Emscripten heap-growth telemetry before approving default Luma rollout.

## Task 12 Readiness

Default runtime switch to `luma` is deferred and not approved by the current evidence.
The blockers are: embedded preview reports `0x0` dimensions and is over budget, quick preview is over budget, only HQ for the smaller about 26MP fixture is within target, and fewer than three RAW fixtures have validated benchmark/manual matrix coverage.

Before Task 12 can switch the default runtime, follow-up work must fix embedded preview dimensions and timing, improve quick performance or document an accepted rationale, add at least a third fixture/manual matrix pass, and rerun benchmark evidence.
