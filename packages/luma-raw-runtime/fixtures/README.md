# Luma RAW Runtime Fixtures

CI uses locked public fixtures:

```bash
pnpm --filter @lumaforge/luma-raw-runtime fixtures:fetch-public
```

The default fetch command downloads only `purpose: "ci-smoke"` fixtures. It is
kept small so native smoke tests remain practical in CI.

For local compatibility diagnostics, fetch every locked public fixture:

```bash
pnpm --filter @lumaforge/luma-raw-runtime fixtures:fetch-public:all
```

Downloaded RAW files are cached under:

```text
packages/luma-raw-runtime/fixtures/.cache/public/
```

That directory is ignored and must not be committed.

Run the phone RAW diagnostics matrix after native artifacts exist:

```bash
pnpm --filter @lumaforge/luma-raw-runtime build:native:desktop
pnpm --filter @lumaforge/luma-raw-runtime fixtures:fetch-public:all
pnpm --filter @lumaforge/luma-raw-runtime fixtures:diagnose-mobile-raw
```

The diagnostics report is written to:

```text
packages/luma-raw-runtime/fixtures/.cache/reports/mobile-raw-compatibility.json
```

The JSON report is engineering evidence only. Do not convert it into official
Apple ProRAW, Google Pixel RAW, Samsung Expert RAW, or Android DNG support copy
without a separate support-policy decision.

Local performance benchmarks default to the browser file picker:

```bash
pnpm --filter @lumaforge/luma-raw-runtime bench:serve
```

Open `benchmarks/bench-runtime.html`, select one or more local RAW files, and
copy the JSONL output. The benchmark page does not read fixture paths from the
environment.

There is currently no headless high-megapixel benchmark helper in this package.
If one is added, its contract is:

```bash
LUMAFORGE_RAW_FIXTURE_DIR=/absolute/path/to/local/fixtures \
  pnpm --filter @lumaforge/luma-raw-runtime <headless-benchmark-command>
```

That helper must fail with a clear message when `LUMAFORGE_RAW_FIXTURE_DIR` is
missing. Do not hard-code local absolute fixture paths in runtime source,
benchmark code, or CI.
