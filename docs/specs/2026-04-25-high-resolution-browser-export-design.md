# High-resolution browser export design

Date: 2026-04-25

## Goal

LumaForge must export high-resolution RAW photos without uploading the file, without requiring a native helper, and without depending on full-image RGB, Canvas, ImageData, or GPU surfaces. Export correctness is the priority. Preview remains interactive and may use approximate lower-resolution rendering, but it must share the same color intent and LUT contract as export.

The first production target is full-resolution sRGB JPEG export on desktop Chrome, Edge, and Safari. Mobile browsers may disable or degrade full-resolution export with explicit product messaging.

## Non-goals

- Do not implement high-bit-depth TIFF, PNG, AVIF, or EXR in the first phase.
- Do not treat preview export as full-resolution export.
- Do not use `display sRGB -> LUT` as the default camera-log LUT path.
- Do not add AI denoise, large-radius local tone mapping, sharpening, or lens correction to the first strip pipeline.
- Do not rely on WebGPU, SharedArrayBuffer, or GPU readback for the authoritative export path.

## Architecture

Use a runtime-first strip exporter with three clear ownership boundaries.

`@lumaforge/luma-raw-runtime` owns RAW access facts:

- RAW session lifetime.
- Metadata, dimensions, orientation, CFA pattern, black level, white level, camera white balance, and camera color data.
- RAW mosaic/window reads.
- Low-level demosaic helpers when the helper depends on runtime-native RAW facts.
- Capability reporting for source formats that can be exported through the raw-window path.

The export worker owns product export:

- Full-resolution strip scheduling.
- Input-window halo planning.
- Buffer pooling and memory budgets.
- Scene-referred color graph execution.
- LUT interpolation and output transform.
- sRGB JPEG scanline or strip encoding.
- Progress, cancellation, retry, and failure reporting.

The raw processor UI owns product state:

- Preview display and interaction.
- LUT/profile selection.
- Export action state.
- Clear distinction between full-resolution export and preview export.
- User-facing fail-closed messages for unsupported files or unsupported pipelines.

This boundary keeps RAW decoding isolated from product color decisions and prevents preview rendering from becoming the source of truth for high-resolution export.

## Export data flow

The full-resolution export path is:

```text
File
-> raw runtime open session
-> metadata + export capability probe
-> strip scheduler
-> read RAW mosaic window + halo
-> demosaic output region
-> scene-linear working RGB
-> LUT input gamut + transfer/log
-> 3D LUT
-> output sRGB transform
-> JPEG scanline/strip encoder
-> output stream
```

The export path must not call the existing full-image HQ decode as its primary input. It must not create a full-frame RGB16, RGB float, RGBA float, Canvas, ImageData, or JPEG staging buffer.

## Strip lifecycle

The output unit is a JPEG-friendly strip. Internally, a strip may be subdivided into smaller tiles to bound working memory, but rows are emitted to the encoder in output order.

For each strip:

```text
plan output rect
-> expand input rect by demosaic halo
-> runtime.readRawWindow(input rect)
-> normalize black/white levels
-> apply camera white balance
-> demosaic into reusable linear buffer
-> apply fused scene-referred color graph
-> quantize to RGB8 sRGB
-> encoder.writeRows()
-> release buffers to pool
```

The first phase only includes local or per-pixel operations. Demosaic may read from the halo. Color transforms, transfer functions, LUT interpolation, and sRGB output must depend only on the current pixel. This keeps strip seams testable and prevents hidden neighborhood dependencies.

## Color science

The authoritative export transform is scene-referred:

```text
RAW mosaic
-> black/white level normalization
-> camera white balance
-> demosaic
-> camera RGB -> standard scene-linear working RGB
-> LUT input gamut linear
-> LUT input transfer/log curve
-> 3D LUT
-> LUT output handling
-> display/output sRGB
-> JPEG RGB8
```

LUTs are contracts. A renderable LUT must have explicit or user-selected metadata for:

- `inputGamut`
- `inputTransfer`
- `role`
- `range`
- optional output gamut or transfer handling

Unknown LUTs must not be silently guessed into a camera-log profile. Unsupported LUT output roles or ranges must disable full-resolution export until the user selects a supported profile or removes the LUT.

Preview and export must use the same color graph descriptor. The descriptor is pure data that records the selected profile, matrices, transfer functions, LUT role, signal range, intensity, and output intent. WebGL preview and CPU/WASM export can execute this descriptor differently, but they must not derive different transform order, matrix selection, transfer function, range handling, or LUT role.

## Preview relationship

Preview is interactive, not authoritative. It may continue to use embedded preview, quick decode, HQ preview, WebGL2 rendering, and lower-resolution textures. It may skip or cap HQ preview on constrained devices.

Full-resolution export is independent of HQ preview readiness. If quick or HQ preview fails, the user may still attempt full-resolution export when the runtime reports raw-window export support for the source file and the selected color pipeline is exportable.

Preview may have small numerical differences from export because of downsampling, GPU precision, or texture formats. It must not differ in profile choice, transform order, LUT role, or output intent.

## Crash prevention

The export worker must prevent renderer crashes by design instead of waiting for browser OOM behavior.

Required safeguards:

- Run full-resolution export in a dedicated worker.
- Preflight metadata dimensions, source support, estimated strip buffers, runtime heap pressure, encoder buffers, and output strategy before enabling export.
- Use bounded buffer pools. Default to one active strip and one worker for the first phase.
- Adaptively reduce strip or tile height after allocation failure, worker failure, or resource pressure.
- Preserve output resolution during retry. If full-resolution output cannot be produced, fail instead of silently lowering resolution.
- Terminate and recreate the export worker after unrecoverable WASM high-water memory, protocol corruption, or native runtime failure.
- Report progress after each completed strip.
- Support cancellation that stops scheduling, closes the encoder, and releases worker resources.

The full-resolution export path is forbidden from creating:

- full-image Canvas
- full-image ImageData
- full-image RGB or float intermediate buffers
- full-image GPU textures
- full-image JPEG assembly buffers

## Compatibility and fail-closed behavior

Full-resolution export is enabled only when all required capabilities are available:

- The RAW source supports raw-window reads.
- The CFA and demosaic path are supported.
- Orientation and output dimensions are known.
- The selected LUT/profile pipeline is renderable by the CPU/WASM export graph.
- A JPEG encoder path is available.

Failures are grouped into three product-visible classes.

`unsupported-source`:

The RAW format, compression mode, CFA type, orientation handling, or raw-window access is not supported.

`unsupported-pipeline`:

The selected LUT, transfer, range, output role, or future operation cannot be reproduced by the authoritative export graph.

`resource-failure`:

The browser, worker, WASM runtime, encoder, or output stream cannot complete export within the bounded memory strategy.

Full-resolution export must fail closed for unsupported files or unsupported pipelines. It must not fall back to the existing full-HQ RGB path or preview export while keeping the full-resolution label. Preview export may exist as a separate, explicitly named action.

## Runtime API direction

The runtime should grow a low-level export capability surface rather than a product-specific `exportJpeg` API.

The expected shape is:

```text
session.probeExportCapabilities()
session.readRawWindow(rect)
session.readMetadata()
session.close()
```

The returned raw window must carry enough facts for the export worker to avoid guessing:

- source rect and output rect mapping
- CFA pattern and phase for the rect
- bit depth or normalized sample range
- black and white levels
- camera white balance
- camera color data
- orientation and visible crop facts

Product color, LUT handling, JPEG quality, retry policy, and output-stream decisions stay outside the raw runtime.

## Completion clarification after integration review

The first production target is not satisfied by a placeholder JPEG runtime or by treating raw Bayer samples as if they were already scene-linear working RGB. A high-resolution export implementation is complete only when the runtime and export worker can either produce the same scene-linear working input as preview or fail closed before the export action is enabled.

The raw-window contract must provide one of these two paths:

- processed scene-linear working RGB windows with visible-output coordinates already applied
- raw mosaic windows plus all facts required to reproduce preview-equivalent scene-linear RGB in the export worker

For the raw mosaic path, capability probing must report `unsupported` unless these facts are present:

- visible crop origin and size, including raw-space to visible-output mapping
- orientation handling status for the exported output frame
- CFA phase for each returned window after crop and halo expansion
- black and white levels
- camera white balance multipliers
- camera-to-working-space color transform, targeting the same linear ProPhoto working space used by preview

For the first production milestone, non-identity orientation may fail closed with an explicit unsupported-source reason until rotation and flip transforms are implemented in the strip pipeline. Silent geometry guessing is not allowed.

The JPEG runtime must contain a real encoder backend that accepts ordered RGB8 rows or bounded row batches and returns an `image/jpeg` `Blob`. A validation shell that accepts rows but throws `JPEG_RUNTIME_UNAVAILABLE` on finish is only a scaffold and must keep full-resolution export disabled or fail closed with a resource/runtime reason.

The implementation plan must treat these as required follow-up work, not residual risk:

- expose runtime color and geometry facts
- consume those facts in the CPU export path before the color graph runs
- replace the JPEG runtime placeholder with a real bounded encoder backend
- rerun final review and browser acceptance before claiming production completion

## Testing and acceptance

Runtime contract tests:

- Raw-window reads return the requested rect and preserve CFA alignment.
- Halo expansion works at image boundaries.
- Black/white levels, orientation, CFA phase, and dimensions are stable.
- Unsupported source formats fail closed with structured capability errors.

Color graph tests:

- The preview path and export path derive the same matrix sequence, transfer function, signal range, LUT role, and output intent from the same descriptor.
- Small synthetic inputs compare within a documented tolerance between CPU export and preview-derived uniforms.
- Unknown or unsupported LUT contracts do not render through full-resolution export.

Strip seam tests:

- Synthetic Bayer fixtures compare one full-window reference against multi-strip output.
- Real RAW window fixtures check strip boundaries after demosaic halo and color graph application.
- The first phase has no seam-prone non-local operations beyond demosaic halo.

Browser and resource tests:

- 61MP and 100MP-class RAW files can attempt full-resolution export without renderer crash.
- Export failure preserves current editing state.
- Worker failure does not crash the page.
- Adaptive strip-size retry reduces memory pressure without reducing output resolution.
- Desktop Chrome, Edge, and Safari are covered for supported fixtures.
- Mobile browsers either clearly disable full-resolution export or show an explicit unsupported message.

Product acceptance:

- Full-resolution export does not depend on HQ preview readiness.
- Supported exports produce JPEG dimensions equal to the RAW output dimensions.
- Unsupported files and unsupported LUT pipelines are clearly disabled or fail with actionable messaging.
- Preview export and full-resolution export are labeled as separate actions.

Task 15 verification status recorded 2026-04-26:

- Automated runtime/export/readiness coverage passed for the full Task 15 targeted test list (`18` files, `199` tests).
- Package checks passed for `@lumaforge/luma-raw-runtime` tests and `@lumaforge/luma-jpeg-runtime` tests/build.
- Native asset build is environment-blocked because `emcc` is not installed in the worktree environment; `build:native` fetched LibRaw and lcms2, then failed before native compilation.
- App build and dev server startup are blocked by the missing native assets (`luma_raw.js`, `luma_raw.wasm`), so Chrome/Safari desktop browser acceptance remains pending until the Emscripten toolchain is available.
