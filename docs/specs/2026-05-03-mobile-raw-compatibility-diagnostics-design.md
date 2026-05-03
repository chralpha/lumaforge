# Mobile RAW compatibility diagnostics design

Date: 2026-05-03

Related documents:

- [`2026-04-24-luma-raw-runtime-independent-build-design.md`](./2026-04-24-luma-raw-runtime-independent-build-design.md)
- [`2026-04-26-full-resolution-raw-compatibility-design.md`](./2026-04-26-full-resolution-raw-compatibility-design.md)
- [`2026-05-01-ios-safari-100mp-export-compatibility-design.md`](./2026-05-01-ios-safari-100mp-export-compatibility-design.md)

## Goal

Build a repeatable diagnostics baseline for phone-captured RAW files.

More phones now produce DNG-based RAW files, including Apple ProRAW and Android
Camera2 DNG output. LumaForge should use LibRaw as far as practical, but phone
RAW compatibility must be measured from runtime facts instead of inferred from
`.dng` extension support or from upstream camera lists alone. Upstream LibRaw
camera lists are useful discovery input, but the LumaForge build is the actual
compatibility boundary.

This pass records whether representative public phone RAW fixtures can:

- open in `@lumaforge/luma-raw-runtime`;
- expose usable metadata and thumbnails;
- produce quick and bounded-HQ preview frames;
- report full-resolution export capability through `probeExportCapability`;
- read a small `libraw-processed-window` tile when export capability is present.

The output is a structured support matrix. A fixture that fails is still useful
when the failure is classified with stable runtime reasons and diagnostic facts.

## Current state

The runtime already has the right major boundary:

```text
RAW file
-> @lumaforge/luma-raw-runtime
-> LibRaw 0.22.1 / LCMS 2.18 native wasm
-> metadata / thumbnail / preview / processed-window export APIs
```

Current package facts:

- `packages/luma-raw-runtime/native/sources.lock.json` pins LibRaw `0.22.1`,
  LCMS `2.18`, and Emscripten `5.0.6`.
- `packages/luma-raw-runtime/fixtures/public.lock.json` contains one public
  `raw-pixls-iphone-se-dng` fixture.
- `packages/luma-raw-runtime/src/native-smoke.test.ts` can run the real native
  runtime against the locked iPhone SE DNG fixture.
- Full-resolution export in app code already requires
  `strategy === 'libraw-processed-window'` and `windows.librawProcessed`.

The missing piece is a repeatable phone RAW compatibility matrix. The current
single fixture proves that a clean native runtime can open at least one public
DNG; it does not answer whether ProRAW-like DNGs, Android Camera2 DNGs, large
phone DNGs, or vendor-app DNG variants reach preview or export.

## Non-goals

- Do not change the pinned LibRaw version in this pass.
- Do not change Emscripten build flags or add optional native SDKs in this pass.
- Do not modify the native `readProcessedWindow` implementation in this pass.
- Do not claim official support for Apple ProRAW, Samsung Expert RAW, Google
  Pixel RAW, or Android DNG in product copy.
- Do not commit downloaded RAW fixture binaries to the repository.
- Do not add a UI support table or broaden visible support claims before the
  diagnostics matrix exists.

## Design principles

1. Treat phone RAW as a fact-driven compatibility target.

   DNG support is a starting point, not a guarantee. Apple ProRAW is DNG, and
   Android `DngCreator` writes DNG from RAW sensor buffers, but individual files
   can differ in metadata, processing stage, crop, orientation, compression,
   color matrices, thumbnail availability, and processed-window behavior.

2. Keep fixture provenance explicit and lightweight.

   Public fixture metadata, URLs, hashes, source notes, and expected diagnostic
   intent live in the repo. Downloaded RAW bytes remain under ignored cache
   paths.

3. Separate CI smoke from local compatibility.

   CI should keep one or a few small public phone RAW smoke fixtures. Larger or
   slower phone RAW files may live in the same lockfile as `local-compatibility`
   fixtures and run only when requested.

4. Preserve runtime evidence even when support fails.

   A failed export capability is useful if it records sensor layout,
   orientation, crop, color facts, window flags, warning mask, and stable reason
   codes.

5. Avoid support-claim drift.

   Diagnostics may say "this fixture worked". User-facing docs should not turn
   that into broad official device support until there is a maintained support
   policy and enough coverage.

## Fixture registry

Extend `packages/luma-raw-runtime/fixtures/public.lock.json` from a single smoke
fixture into a small registry:

```ts
type PublicRawFixture = {
  name: string
  file: string
  url: string
  sha256: string
  license: string
  source: string
  deviceBrand?: string
  deviceModel?: string
  rawFamily:
    | 'apple-dng'
    | 'apple-proraw-dng'
    | 'android-dng'
    | 'generic-dng'
  purpose: 'ci-smoke' | 'local-compatibility'
}
```

Initial fixture coverage should prefer public, redistributable samples:

| Family | Purpose | Requirement |
| --- | --- | --- |
| `apple-dng` | `ci-smoke` | Keep the existing small iPhone SE DNG as the minimum clean-build smoke. |
| `apple-proraw-dng` | `local-compatibility` | Add at least one public ProRAW DNG sample with stable source and hash. |
| `android-dng` | `local-compatibility` | Add at least one public Camera2-style Android DNG sample. |
| `generic-dng` | `local-compatibility` | Optional control sample for non-phone DNG behavior. |

The existing `fixtures/scripts/fetch-public-fixtures.mjs` should continue to
own downloads and SHA-256 verification. If needed, extend it to filter by
`purpose` so CI can fetch only `ci-smoke` fixtures.

## Diagnostics runner

Add a package-local diagnostics runner:

```text
packages/luma-raw-runtime/fixtures/scripts/diagnose-raw-compatibility.mjs
```

The runner reads the fixture registry, verifies downloaded files, loads the real
native runtime, and runs each selected fixture through the same staged probe:

```text
File
-> createLumaRawRuntime()
-> openSession(file)
-> session.probe / read metadata
-> session.extractEmbeddedPreview()
-> session.decodeQuick(maxOutputPixels)
-> session.decodeBoundedHq(maxOutputPixels)
-> session.probeExportCapability()
-> if supported: readProcessedWindow(center 64x64 tile)
-> write structured report
```

The report should be JSON-first and stored in an ignored cache path:

```text
packages/luma-raw-runtime/fixtures/.cache/reports/mobile-raw-compatibility.json
```

The report must not include image pixel payloads. It may include dimensions,
timings, stable error codes, and normalized diagnostic facts.

## Report shape

The report has one entry per fixture:

```ts
type RawCompatibilityReportEntry = {
  fixture: {
    name: string
    file: string
    source: string
    deviceBrand?: string
    deviceModel?: string
    rawFamily: PublicRawFixture['rawFamily']
    purpose: PublicRawFixture['purpose']
  }
  runtime: {
    version: string
    memoryProfile: 'desktop' | 'low-memory'
  }
  metadata?: {
    make?: string
    model?: string
    normalizedMake?: string
    normalizedModel?: string
    width?: number
    height?: number
    rawWidth?: number
    rawHeight?: number
    orientation?: number
    baselineExposure?: number
    thumbnail?: { width: number; height: number; format: string }
  }
  stages: {
    open: StageResult
    thumbnail: StageResult
    quick: StageResult
    boundedHq: StageResult
    exportCapability: StageResult
    processedWindow: StageResult
  }
  capability?: {
    supported: boolean
    strategy?: string
    reasons: string[]
    sensor?: {
      layout: string
      colorCount: number
      cfa?: { pattern: string; xPhase: number; yPhase: number }
    }
    orientation?: {
      code: number
      supported: boolean
      outputWidth?: number
      outputHeight?: number
    }
    visibleCrop?: { x: number; y: number; width: number; height: number }
    windows?: { librawProcessed: boolean; rawMosaic: boolean }
    diagnostics?: {
      librawFilterCode?: number
      hasRawImage: boolean
      hasColor3Image: boolean
      hasColor4Image: boolean
      hasXTransTable: boolean
      canRepeatCropProcess?: boolean
      lastLibRawWarningMask?: number
    }
  }
  classification:
    | 'supported'
    | 'preview-only'
    | 'metadata-only'
    | 'open-failed'
}

type StageResult =
  | { ok: true; durationMs?: number }
  | { ok: false; code?: string; message: string; durationMs?: number }
```

## Classification rules

Use a deterministic support classification:

| Classification | Required facts |
| --- | --- |
| `supported` | Open succeeds, preview succeeds, `probeExportCapability.supported === true`, and a small processed window reads successfully. |
| `preview-only` | Open and at least one preview stage succeeds, but full-resolution export is unavailable with stable reasons. |
| `metadata-only` | Open and metadata succeed, but preview or processing fails. |
| `open-failed` | LibRaw/runtime cannot open the fixture. |

Stable reasons come from `LumaRawExportUnsupportedReason` or normalized runtime
error codes. Diagnostic facts remain attached to the entry so a later runtime
change can tell whether the blocker is orientation, crop, color, sensor layout,
LibRaw warning state, or processed-window repeatability.

## Support matrix output

The JSON report is the authoritative artifact. A Markdown summary may be
generated for human review, but it should be derived from JSON and kept out of
product copy unless the user explicitly asks for publication.

Example table columns:

| Fixture | Family | Open | Preview | Full-res window | Classification | Reason |
| --- | --- | --- | --- | --- | --- | --- |
| `raw-pixls-iphone-se-dng` | `apple-dng` | yes | yes | yes/no | `supported` or `preview-only` | stable reason or empty |

## Testing and acceptance

Automated tests:

- Validate fixture registry schema, including `rawFamily`, `purpose`, URL,
  hash, and no duplicate `name` or `file`.
- Test report normalization and classification with table-driven pure inputs.
- Test script behavior when fixtures are missing, hash verification fails, or
  an entry is marked `local-compatibility` but CI mode is requested.
- Keep at least one real native smoke test for the locked public iPhone DNG.

Manual/local acceptance:

- Fetch public fixtures into `packages/luma-raw-runtime/fixtures/.cache`.
- Run the diagnostics runner against all phone RAW fixtures.
- Confirm the report includes Apple DNG, ProRAW-like DNG, and Android DNG
  entries when those fixture URLs are available.
- Confirm unsupported cases preserve stable reasons rather than collapsing into
  generic `unsupported`.

Documentation acceptance:

- Package README and product surfaces may mention that phone RAW diagnostics
  exist.
- They must not claim official Apple ProRAW, Samsung Expert RAW, Google Pixel
  RAW, or Android DNG support from this diagnostics pass alone.

## Future work

If the diagnostics matrix shows repeated blockers, follow-up specs can target
specific runtime changes:

- upgrade LibRaw or enable an optional native DNG-related feature when the
  current build is the blocker;
- improve processed-window crop/orientation handling when diagnostics show a
  repeatable geometry limitation;
- handle DNG variants that produce RGB-like or already-demosaiced data without
  forcing them through Bayer assumptions;
- build a maintained official support matrix once enough fixture evidence and
  regression coverage exist.

## References

- LibRaw 0.22 supported camera list, including DNG and Apple iPhone entries:
  https://www.libraw.org/supported-cameras
- Apple ProRAW support article. Apple documents ProRAW as DNG and notes that
  non-ProRAW-aware DNG apps may render it differently:
  https://support.apple.com/en-ie/119916
- Android `DngCreator` API reference. Android documents DNG creation from
  `ImageFormat.RAW_SENSOR` buffers and associated metadata:
  https://developer.android.com/reference/android/hardware/camera2/DngCreator
