# High-resolution browser export design

Date: 2026-04-25

## Goal

LumaForge must export high-resolution RAW photos without uploading the file, without requiring a native helper, and without depending on full-image RGB, Canvas, ImageData, or GPU surfaces. Export correctness is the priority. Preview remains interactive and never renders from full-resolution preview pixel surfaces, but it must share the same color intent and LUT contract as export.

The first production target is full-resolution sRGB JPEG export on desktop Chrome, Edge, and Safari. Mobile browsers may disable or degrade full-resolution export with explicit product messaging.

## Non-goals

- Do not implement high-bit-depth TIFF, PNG, AVIF, or EXR in the first phase.
- Do not treat preview export as full-resolution export.
- Do not decode, transfer, or upload full-resolution RGB assets for preview.
- Do not use `display sRGB -> LUT` as the default camera-log LUT path.
- Do not add AI denoise, large-radius local tone mapping, sharpening, or lens correction to the first strip pipeline.
- Do not rely on WebGPU, SharedArrayBuffer, or GPU readback for the authoritative export path.

## Architecture

Use a runtime-first strip exporter with three clear ownership boundaries.

`@lumaforge/luma-raw-runtime` owns RAW access facts:

- RAW session lifetime.
- Metadata, dimensions, orientation, CFA pattern, black level, white level, camera white balance, and camera color data.
- LibRaw processed-window reads for the current primary full-resolution RAW input strategy.
- RAW mosaic/window reads as transitional diagnostics and legacy support, not the primary export input contract.
- Low-level demosaic helpers when the helper depends on runtime-native RAW facts.
- Capability reporting for source formats that can be exported through the `libraw-processed-window` path.

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
- Preview-resolution policy: embedded preview, quick preview, and bounded HQ preview.
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
-> read LibRaw processed RGB16 window
-> normalize to scene-linear working RGB
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
-> expand output rect by processed-window halo
-> runtime.readProcessedWindow(output rect + halo)
-> validate LibRaw RGB16 linear ProPhoto window facts
-> normalize processed RGB16 samples into reusable linear buffer
-> apply shared LUT graph
-> quantize to RGB8 sRGB
-> encoder.writeRows()
-> release buffers to pool
```

The current primary path asks LibRaw for processed RGB16 windows and keeps the shared LUT graph, sRGB conversion, and JPEG row writing in the export worker. Raw mosaic windows are transitional diagnostics and legacy support unless they can reproduce preview-equivalent scene-linear RGB without guessing. Color transforms, transfer functions, LUT interpolation, and sRGB output must depend only on the current pixel. This keeps strip seams testable and prevents hidden neighborhood dependencies.

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

Preview is interactive, not authoritative, and never full-resolution. The preview ladder is:

1. Embedded preview, when available, for earliest visual feedback.
2. Quick preview at or below `2.5MP`. This is the first editable preview source and must be good enough to unblock LUT/profile selection and other interactive operations.
3. Bounded HQ preview, targeting roughly `8MP` to `12MP` by default. This is a background resolution upgrade, not a prerequisite for editing. The cap may be lowered by device policy, runtime capability, or memory pressure, but it must never rise to full source resolution.

Quick preview success makes the RAW session interactive. After quick preview is ready, the UI must dismiss blocking upload/decode progress and allow subsequent operations such as LUT selection, profile changes, compare, and export-readiness evaluation. Bounded HQ decode runs silently in the background with its own cancellation and retry policy. If bounded HQ succeeds, the UI may atomically replace the displayed preview source. If bounded HQ is skipped, fails, or is aborted, the product keeps the quick preview and must not move the session into a blocking or fatal error state.

Downsampling for quick and bounded HQ preview must happen before the preview pixel buffer is returned to application JavaScript, before WebGL texture upload, and before display/output sRGB conversion. The preview pipeline must not decode a full-resolution HQ RGB buffer and then shrink it in JavaScript, Canvas, ImageData, or GPU memory. If the raw runtime cannot produce a bounded HQ asset within the active policy, it must return a structured skip or resource failure and leave quick preview as the active display source.

Full-resolution export is independent of bounded HQ preview readiness. If quick preview succeeds but bounded HQ preview fails, the user may still attempt full-resolution export when the runtime reports `libraw-processed-window` export support for the source file and the selected color pipeline is exportable.

Preview may have small numerical differences from export because of downsampling, GPU precision, or texture formats. It must not differ in profile choice, transform order, LUT role, or output intent.

## Crash prevention

The export worker must prevent renderer crashes by design instead of waiting for browser OOM behavior.

Required safeguards:

- Run full-resolution export in a dedicated worker.
- Preflight metadata dimensions, source support, estimated strip buffers, runtime heap pressure, encoder buffers, and output strategy before enabling export.
- Use bounded buffer pools. Default to one active strip and one worker for the first phase.
- Adaptively reduce strip or tile height after allocation failure, worker failure, or resource pressure.
- Preserve output resolution during retry. If full-resolution output cannot be produced, fail instead of silently lowering resolution.
- Keep preview retries bounded by the preview policy. A preview retry may lower the bounded HQ cap or keep quick preview, but it must not fall back to a full-resolution preview decode.
- Terminate and recreate the export worker after unrecoverable WASM high-water memory, protocol corruption, or native runtime failure.
- Report progress after each completed strip.
- Support cancellation that stops scheduling, closes the encoder, and releases worker resources.

The full-resolution export path and product preview path are forbidden from creating source-sized preview/export pixel surfaces:

- full-image Canvas
- full-image ImageData
- full-image RGB or float intermediate buffers
- full-image GPU textures
- full-image contiguous JPEG byte assembly buffers

For preview, these limits apply before display color conversion. A `100MP` source may produce an embedded preview, a `<=2.5MP` quick preview, or an `8MP` to `12MP` bounded HQ preview, but it must not produce a `100MP` RGB preview asset.

The first browser-local JPEG target may retain encoded JPEG chunks as `Blob` parts until `finish()` returns the final download `Blob`. This is the final compressed output object, not an intermediate pixel staging surface, and it must not be assembled into one contiguous full-image `Uint8Array` before `Blob` creation. A future streaming or file-backed sink can reduce the final compressed-output footprint, but it is not required for the first production browser path.

## Compatibility and fail-closed behavior

Full-resolution export is enabled only when all required capabilities are available:

- The RAW source supports LibRaw processed-window reads.
- LibRaw can apply the required crop, orientation, demosaic, white balance, and camera-to-ProPhoto processing for bounded windows.
- Orientation and output dimensions are known.
- The selected LUT/profile pipeline is renderable by the CPU/WASM export graph.
- A JPEG encoder path is available.

Failures are grouped into three product-visible classes.

`unsupported-source`:

The RAW format, compression mode, LibRaw processed-window path, or required orientation/crop handling is not supported.

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
session.readProcessedWindow(rect)
session.readMetadata()
session.close()
```

The returned processed window must carry enough facts for the export worker to avoid guessing:

- source rect and output rect mapping
- RGB16 bit depth and normalized sample range
- linear ProPhoto color space confirmation
- orientation and visible crop facts

Product color, LUT handling, JPEG quality, retry policy, and output-stream decisions stay outside the raw runtime.

## Completion clarification after integration review

The first production target is not satisfied by a placeholder JPEG runtime or by treating raw Bayer samples as if they were already scene-linear working RGB. A high-resolution export implementation is complete only when the runtime and export worker can either produce the same scene-linear working input as preview or fail closed before the export action is enabled.

The current primary RAW input strategy is `libraw-processed-window`: processed scene-linear working RGB windows with visible-output coordinates already applied. Raw mosaic windows are transitional diagnostics and legacy support unless they can reproduce preview-equivalent scene-linear RGB without guessing.

For any retained raw mosaic path, capability probing must report `unsupported` unless these facts are present:

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
- Bounded preview decodes respect the requested output-pixel cap and preserve full source metadata separately from preview dimensions.

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
- 100MP-class RAW files on mobile WebKit reach quick-preview interactivity without renderer crash, without a full-resolution preview decode, and without blocking on bounded HQ completion.
- Bounded HQ preview either upgrades the active preview within the configured cap or fails quietly while preserving quick preview and editing state.
- Export failure preserves current editing state.
- Worker failure does not crash the page.
- Adaptive strip-size retry reduces memory pressure without reducing output resolution.
- Desktop Chrome, Edge, and Safari are covered for supported fixtures.
- Mobile browsers either clearly disable full-resolution export or show an explicit unsupported message.

Product acceptance:

- Preview follows the embedded -> quick `<=2.5MP` -> bounded HQ `8MP` to `12MP` ladder and never performs full-resolution preview decode.
- Quick preview readiness unblocks interactive editing; bounded HQ readiness is opportunistic only.
- Full-resolution export does not depend on bounded HQ preview readiness.
- Supported exports produce JPEG dimensions equal to the RAW output dimensions.
- Unsupported files and unsupported LUT pipelines are clearly disabled or fail with actionable messaging.
- Preview export and full-resolution export are labeled as separate actions.

Task 15 verification status recorded 2026-04-26:

- Automated runtime/export/readiness coverage passed for the full Task 15 targeted test list plus preview-pipeline coverage (`19` files, `208` tests).
- Package checks passed for `@lumaforge/luma-raw-runtime` tests and `@lumaforge/luma-jpeg-runtime` tests/build.
- Native asset build is unblocked when the cached Emscripten SDK is activated with `. "$HOME/.cache/lumaforge-emsdk/emsdk_env.sh"`; `build:native` writes and verifies `luma_raw.js`, `luma_raw.wasm`, and `provenance.json`.
- Chrome production-preview browser acceptance passed for the supported 61MP Sony fixture: `SGL00940_neutral_fullres.jpg` was captured as an `image/jpeg` blob and browser-decoded to `9566×6374`, matching runtime output dimensions.
- Chrome production-preview fail-closed acceptance passed for the 100MP-class GFX fixture, an unsupported RAW-window scanner NEF, and an unknown LUT input profile.
- Desktop Safari acceptance remains pending until a Safari host is available.
