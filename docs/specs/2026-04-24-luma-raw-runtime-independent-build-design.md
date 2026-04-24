# Luma RAW Runtime Independent Build Design

- Date: 2026-04-24
- Status: Replacement design
- Scope: `@lumaforge/luma-raw-runtime`
- Supersedes for native runtime readiness:
  - `docs/specs/2026-04-23-luma-raw-runtime-migration-design.md`
  - `docs/plans/2026-04-23-luma-raw-runtime-migration-implementation-plan.md`
  - `docs/plans/2026-04-23-luma-raw-runtime-performance-optimization-plan.md`
  - `docs/plans/2026-04-23-luma-raw-runtime-default-and-libraw-removal-plan.md`
  - `docs/plans/2026-04-23-luma-raw-runtime-benchmark-notes.md`

## 1. Hard Diagnosis

The current package is not yet an independent Luma RAW runtime.

`packages/luma-raw-runtime/native/build-libraw.sh` currently resolves native headers and static libraries from:

```bash
BASELINE_ROOT="${LIBRAW_WASM_ROOT:-/workspaces/LumaForge/LibRaw/LibRaw-Wasm}"
```

That means the current wasm artifact is a Luma wrapper linked against a local `LibRaw-Wasm` build product. It is useful as a prototype, but it is not a reproducible product runtime.

The current CI gap is equally material. `.github/workflows/build.yml` installs Node dependencies and runs `pnpm run build`; it does not install Emscripten, fetch native sources, build LibRaw/LCMS, link `luma_raw.wasm`, or prove that a clean checkout can regenerate native artifacts. Any local benchmark that depends on `/workspaces/LumaForge/...` paths is developer evidence only.

The previous performance work still contains valuable runtime ideas: session reuse, one file transfer per image, bulk JS-to-wasm copy, embedded-first preview, quick output caps, and heap telemetry. The invalid part is the claim that this is already a self-contained, CI-reproducible Luma runtime.

## 2. Product Target

LumaForge is not building a general RAW editor. The runtime exists to make browser-local photo stylization feel fast:

```text
RAW file -> first visual -> standard intermediate color frame -> target Log transform -> LUT/style -> export
```

Performance is measured by the user-visible pipeline, not by one isolated `dcraw_process()` call:

- Time to first visible image must prefer embedded preview when available.
- Time to first stylable RAW-derived frame must prefer capped quick decode.
- Style and LUT changes must never trigger RAW reopen or redecode.
- HQ decode may arrive later and replace the quick frame without changing the style state.
- Main thread blocking is a failure even when pure decode time looks acceptable.

## 3. Non-Goals

This design does not attempt to:

- Recreate Lightroom, RawTherapee, or a full professional raw processor.
- Implement camera-vendor-perfect color rendering in the first independent runtime pass.
- Support every LibRaw optional codec or external SDK on day one.
- Commit private high-megapixel RAW files into the repository.
- Use `LibRaw-Wasm` as a source, static library provider, fixture provider, or hidden build dependency.

## 4. Core Decisions

### 4.1 Independent Native Source Chain

The runtime must build from pinned upstream source archives, verified by SHA-256, using a pinned Emscripten SDK version.

Initial native source lock:

```json
{
  "toolchain": {
    "emsdk": "5.0.6"
  },
  "sources": [
    {
      "name": "libraw",
      "version": "0.22.1",
      "url": "https://github.com/LibRaw/LibRaw/archive/refs/tags/0.22.1.tar.gz",
      "sha256": "e676248284075605aa2697a66eeed7dc258820bd1d4988c724d29edffd726726"
    },
    {
      "name": "lcms2",
      "version": "2.18",
      "url": "https://downloads.sourceforge.net/project/lcms/lcms/2.18/lcms2-2.18.tar.gz",
      "sha256": "ee67be3566f459362c1ee094fde2c159d33fa0390aa4ed5f5af676f9e5004347"
    }
  ]
}
```

Emscripten ports for `zlib`, `libjpeg`, and `libpng` are acceptable only because they are pinned by the `emsdk` version. If we later need different codec behavior, those dependencies must move into the same source lock.

### 4.2 Luma-Owned Wrapper ABI

The only native C++ source authored by this package is Luma-owned wrapper code. The wrapper exposes a small browser-oriented ABI:

- `loadBuffer(data)`
- `openWithSettings(settings)`
- `readMetadata()`
- `extractThumbnail()`
- `decodeQuick(options)`
- `decodeHq(options)`
- `dispose()`
- `heapStats()`

No app code imports LibRaw symbols. No app code knows whether the wrapper internally calls LibRaw, LCMS, Emscripten ports, or future native helpers.

### 4.3 Runtime Package Boundary

`packages/luma-raw-runtime` remains a monorepo package, but it must be independently buildable and testable.

Expected structure:

```text
packages/luma-raw-runtime/
  native/
    sources.lock.json
    build-libraw.sh
    emcc-flags.sh
    patches/
    scripts/
      fetch-sources.mjs
      build-deps.sh
      build-wasm.sh
      verify-native-artifacts.mjs
      verify-no-baseline-deps.mjs
  src/
  worker/
  benchmarks/
  fixtures/
    public.lock.json
    README.md
```

Generated native files live under ignored directories:

```text
packages/luma-raw-runtime/native/.cache/
packages/luma-raw-runtime/native/vendor/
packages/luma-raw-runtime/native/build/
packages/luma-raw-runtime/dist/native/
```

CI may cache those directories by lock hash, but correctness must not depend on the cache.

### 4.4 Build Artifacts Are Generated, Not Copied

The package build must be able to run from a clean checkout:

```bash
pnpm install --frozen-lockfile
pnpm --filter @lumaforge/luma-raw-runtime native:fetch
pnpm --filter @lumaforge/luma-raw-runtime build:native
pnpm --filter @lumaforge/luma-raw-runtime native:verify
pnpm --filter @lumaforge/luma-raw-runtime build
pnpm build
```

No step may read from:

- `/workspaces/LumaForge/LibRaw/LibRaw-Wasm`
- `../LibRaw-Wasm`
- any developer home directory
- any pre-existing `includes/` or `libs/` folder outside `packages/luma-raw-runtime/native`

### 4.5 `libraw-wasm` Is A Benchmark Competitor Only

The npm package `libraw-wasm` and the repository `ybouane/LibRaw-Wasm` may be used only as an external comparison baseline in benchmark documentation. They must not appear in active runtime source, native build scripts, package dependencies, CI build inputs, or generated provenance.

If a live benchmark still needs to compare against `libraw-wasm`, it should live in an optional benchmark harness that installs the competitor explicitly for that harness. The runtime package itself must not depend on it.

## 5. Runtime Performance Architecture

### 5.1 Session-Oriented Decode

The runtime keeps the session model from the prototype:

```text
openSession(file)
  -> transfer file once
  -> copy into wasm once
  -> LibRaw open once per settings family
  -> embedded / quick / hq stages reuse session state
```

One-shot public APIs may remain for compatibility, but internally they should open a temporary session and close it.

### 5.2 Staged Output

The browser product path has three stages:

| Stage | Purpose | Required behavior |
| --- | --- | --- |
| Embedded | Fast first visual | Extract LibRaw thumbnail/preview without `unpack()` or `dcraw_process()` when possible |
| Quick | First stylable RAW-derived frame | Use fast demosaic settings, camera WB, Linear ProPhoto RGB, and cap output to preview budget |
| HQ | Replacement frame | Decode full quality for export/zoom when budget allows; large files may remain asynchronous/background |

Embedded preview is not color-authoritative. It may be styled as a temporary display preview, but the UI must treat quick/HQ frames as the authoritative path for scene-referred LUT work.

### 5.3 Color Contract

The runtime output contract remains:

```text
RGB16 Linear ProPhoto
```

The runtime does not apply creative LUTs. It supplies a standard intermediate frame and metadata. The app render pipeline converts that frame to the target LUT's expected Log encoding on GPU, then applies the LUT.

This keeps runtime performance work separate from style-system behavior:

- RAW decode happens only on image change.
- Log conversion and LUT application happen on style change.
- Export reuses the current decoded frame where possible.

### 5.4 Memory Contract

The runtime must report wasm heap telemetry for every open, embedded, quick, and HQ stage:

```ts
type LumaRawHeapStats = {
  before?: number
  after?: number
  peak?: number
}
```

`ALLOW_MEMORY_GROWTH=1` is acceptable for compatibility only if telemetry stays visible in CI and benchmark output. If heap growth dominates large files, the next optimization is a tiered build strategy:

- `normal`: lower initial memory, broad compatibility.
- `high`: higher initial memory, fewer growth pauses for 45MP+ files.

### 5.5 Main Thread Contract

Decode and native module initialization must stay outside the UI thread. The app may show preview, progress, and cancellation state on the main thread, but all RAW CPU work belongs in worker code.

If `SharedArrayBuffer` is required for pthread decode, the app must fail closed with:

```text
RAW_CROSS_ORIGIN_ISOLATION_REQUIRED
```

Do not silently fall back to a slow main-thread path.

## 6. CI And Fixture Strategy

### 6.1 CI Build Reproducibility

Pull request CI must prove:

- Native sources download and match `sources.lock.json`.
- LibRaw and LCMS build from source under the pinned Emscripten SDK.
- `luma_raw.js`, `luma_raw.wasm`, and `provenance.json` are generated.
- Active native build files contain no `LibRaw-Wasm`, `BASELINE_ROOT`, or `/workspaces/LumaForge` references.
- TypeScript package tests and root app build pass after native artifact generation.

### 6.2 CI RAW Smoke Fixture

CI should use a small public RAW fixture downloaded by lockfile. A suitable first fixture is a raw.pixls.us public DNG entry:

```json
{
  "name": "raw-pixls-iphone-se-dng",
  "url": "https://raw.pixls.us/data/Apple/iPhone%20SE/A4973FFB-9CBD-4ED8-805D-E30F4AE08A95.dng",
  "sha256": "7a2a9747a0cb1537007233ce7e8b7233c5ee641d683b7b3da29e22387994a0d7",
  "license": "CC0/public-domain declaration on raw.pixls.us upload flow",
  "purpose": "CI decode smoke, not performance gate"
}
```

This fixture is not enough to claim high-megapixel performance. It only proves that the clean CI-built wasm can open a real RAW file and produce metadata or a quick frame.

### 6.3 Real Performance Fixtures

High-megapixel fixtures remain external because they are large and may not be redistributable.

The benchmark harness must accept fixtures through explicit input, not hard-coded absolute paths:

```bash
LUMAFORGE_RAW_FIXTURE_DIR=/workspaces/LumaForge/test-images \
pnpm --filter @lumaforge/luma-raw-runtime bench:browser
```

Required local/manual performance set:

- Sony ARW around 24MP to 26MP
- Sony ARW around 60MP
- Nikon NEF around 45MP

The current local files under `/workspaces/LumaForge/test-images` may satisfy developer validation, but docs must label them as local evidence, not CI evidence.

## 7. Rollout Gates

Do not claim the runtime is production-ready until all gates pass.

| Gate | Requirement |
| --- | --- |
| Source provenance | `sources.lock.json` exists, all downloads verify SHA-256, provenance JSON is emitted |
| Baseline independence | `pnpm --filter @lumaforge/luma-raw-runtime native:verify-baseline` passes, or an equivalent scan finds no active build dependency outside verifier source, generated artifacts, caches, vendored sources, and historical docs |
| CI reproducibility | GitHub Actions builds native wasm from clean checkout |
| Smoke decode | CI opens at least one locked public RAW fixture with the CI-built wasm |
| App build | Root `pnpm build` runs after native build and does not depend on local `dist/native` leftovers |
| Performance | Local/manual high-megapixel benchmark shows embedded < 1000ms, quick <= 4000ms, 24MP HQ <= 8000ms, and no missing heap telemetry |
| UX | RAW upload, embedded preview, quick replacement, HQ replacement, LUT styling, compare, and export remain functional |

The current V2 benchmark can be retained as historical evidence for session optimization. It is not sufficient to pass the new rollout gate because it did not prove independent source build or CI reproducibility.

## 8. Migration Strategy

### Phase A: Make The Current State Honest

Mark older migration/default/benchmark docs as superseded for native readiness. Keep their performance measurements as historical notes only.

### Phase B: Replace The Native Build Chain

Add source lock, fetch scripts, dependency build scripts, artifact verification, and baseline-dependency scans. Rewrite `build-libraw.sh` so it never reads from `LibRaw-Wasm`.

### Phase C: Make CI Rebuild Native Artifacts

Update GitHub Actions so every PR can rebuild native wasm from pinned sources. Add cache only after the clean path works.

### Phase D: Restore Performance Claims

Re-run the local high-megapixel benchmark and record results only after Phase B and Phase C pass. If performance regresses versus the prototype, optimize the independent build rather than reusing `LibRaw-Wasm` outputs.

### Phase E: Default Runtime Decision

The app can keep using Luma in development, but release/default-readiness must be tied to the new gates. If independent build or smoke decode fails, the release status is blocked, regardless of previous local V2 timings.

## 9. References

- LibRaw upstream documents RAW data, metadata, and embedded preview extraction as library responsibilities, and documents LGPL/CDDL licensing and release policy: https://github.com/LibRaw/LibRaw
- raw.pixls.us publishes a RAW sample repository, provides SHA-256 file lists, and declares uploaded files under a public-domain/CC0-style flow: https://raw.pixls.us/
- Little CMS 2.18 is the initial pinned LCMS source for this runtime plan: https://www.littlecms.com/tags/lcms2-2.18/
