# Luma RAW Runtime Fixtures

RAW fixtures are local developer assets and are not committed by default.

Run the browser benchmark against these local files:

- `/workspaces/LumaForge/LibRaw/LibRaw-Wasm/example-sony.ARW`
- `/workspaces/LumaForge/test-images/SGL00940.ARW`
- `/workspaces/LumaForge/test-images/SGL_1998.NEF`

Benchmark command:

```bash
pnpm --filter @lumaforge/luma-raw-runtime bench:serve
```

Open `http://localhost:4174/benchmarks/bench-runtime.html`, select all three RAW fixtures, and click `Run benchmark`.

The live benchmark validates the optimized Luma runtime only:

- Luma opens one decode session per file
- Luma embedded, quick, and HQ timings are reported separately
- output JSONL includes file, size, megapixels, stage, width, height, total, read, transfer, copy, open, unpack/process, heap bytes, and target status

Historical app-equivalent legacy comparison rows are recorded in:

- `docs/plans/2026-04-23-luma-raw-runtime-benchmark-notes.md`
- `/tmp/luma-raw-runtime-perf-v2.jsonl` when available in the local validation environment

Keep fixture files in this directory only on local machines unless the project has explicit redistribution rights for a sample.
