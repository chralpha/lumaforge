# Luma RAW Runtime Fixtures

CI uses locked public fixtures:

```bash
pnpm --filter @lumaforge/luma-raw-runtime fixtures:fetch-public
```

The public fixture set provides the locked input for clean-build decode smoke coverage. It does not prove high-megapixel performance.

Local performance benchmarks default to the browser file picker:

```bash
pnpm --filter @lumaforge/luma-raw-runtime bench:serve
```

Open `benchmarks/bench-runtime.html`, select one or more local RAW files, and
copy the JSONL output. The benchmark page does not read fixture paths from the
environment.

There is currently no headless local-fixture helper in this package. If one is
added, its contract is:

```bash
LUMAFORGE_RAW_FIXTURE_DIR=/absolute/path/to/local/fixtures \
  pnpm --filter @lumaforge/luma-raw-runtime <headless-benchmark-command>
```

That helper must fail with a clear message when `LUMAFORGE_RAW_FIXTURE_DIR` is
missing. Do not hard-code local absolute fixture paths in runtime source,
benchmark code, or CI.
