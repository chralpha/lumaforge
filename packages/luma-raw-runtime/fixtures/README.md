# Luma RAW Runtime Fixtures

RAW fixtures are local developer assets and are not committed by default.

Use this naming convention:

- `sony-a7-24mp.ARW`
- `canon-r-30mp.CR3`
- `nikon-z-24mp.NEF`

Benchmark command:

```bash
pnpm --filter @lumaforge/luma-raw-runtime bench:serve
```

Open `http://localhost:4174/benchmarks/bench-runtime.html`, choose a local fixture, and run the browser benchmark. The benchmark prints JSON lines with `runtime`, `stage`, `width`, `height`, `total`, and native timing fields. Keep fixture files in this directory only on local machines unless the project has explicit redistribution rights for a sample.
