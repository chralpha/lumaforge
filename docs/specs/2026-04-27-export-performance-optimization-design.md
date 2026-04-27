# Export performance optimization design

Date: 2026-04-27

## Goal

Reduce full-resolution RAW-to-JPEG export latency for 61MP and 100MP-class
photos while preserving the browser-local privacy model, bounded memory
behavior, and the existing scene-referred color contract.

The current high-resolution export architecture is correct but still tuned for
compatibility. It reads processed windows strip-by-strip, applies the CPU
scene-referred color graph, and writes RGB8 rows into the JPEG runtime. That
keeps memory bounded, but 100MP exports can still exceed one minute because the
compatibility path repeats expensive RAW processing work and the JPEG runtime is
currently a pure TypeScript baseline encoder.

The performance target is:

- 100MP-class full-resolution JPEG export should complete under 45 seconds on a
  reference desktop Chrome/Edge/Safari-class machine, with a stretch target under
  30 seconds after the native and encoder paths are both optimized.
- 61MP-class full-resolution JPEG export should complete under 20 seconds on the
  same reference class.
- Unsupported sources, unsupported pipelines, and resource failures must still
  fail closed instead of falling back to preview export or reducing output
  resolution.

## Scope

This spec is a performance follow-up to:

- `docs/specs/2026-04-25-high-resolution-browser-export-design.md`
- `docs/plans/2026-04-25-high-resolution-browser-export-implementation-plan.md`

It keeps these constraints unchanged:

- Desktop Chrome, Edge, and Safari are the production browser targets.
- Mobile may disable or degrade full-resolution export with explicit messaging.
- JPEG remains the primary output format.
- The authoritative export graph remains `RAW -> standard scene-linear working
  space -> target gamut/transfer for LUT input -> LUT -> output sRGB -> JPEG`.
- Export stays local to the browser; no server upload and no native helper.
- The export path must not allocate full-image RGB16, Float32, RGB8, Canvas,
  ImageData, GPU texture, or contiguous JPEG byte buffers.

## Non-goals

- Do not introduce mozjpeg. LumaForge does not need its extra compression work
  for this performance track.
- Do not change default JPEG output semantics for file-size wins. Preserve
  baseline 4:4:4 output first; subsampling can be evaluated separately.
- Do not compress `Uint16 -> Float32 -> RGB8` before custom gamma, Log, or LUT
  operations. Float32 remains required for the color pipeline until final sRGB
  quantization.
- Do not make WebGPU or tiled GPU readback the authoritative export path in this
  phase.
- Do not add new creative image operations such as denoise, sharpening, or local
  tone mapping.

## Baseline to preserve before changes

Before implementation, capture a fresh JSONL baseline for:

- End-to-end browser UI export on the 100MP Fujifilm GFX100RF RAF path with a
  supported V-Log LUT.
- End-to-end browser UI export on the 61MP Sony ARW path.
- Export-worker-only timing using the current `readProcessedWindow` path.
- JPEG-runtime-only timing for 100MP synthetic rows: black, gradient, and
  high-entropy photographic-like rows.

Each row should record:

- source file, dimensions, megapixels, browser, user agent, backend version
- strip rows, total strip count, retry count, active pipeline concurrency
- native RAW open/unpack/process/read timings
- JS/WASM transfer timings and payload byte counts
- color graph timings
- JPEG write and finish timings
- WASM heap before/after/high-water when available
- output blob size and decoded JPEG dimensions

The implementation must optimize against measured stage timings, not just the
overall wall clock.

## Direction 1: native RAW export-session fast path

The highest-value optimization is to stop paying RAW open/unpack/process setup
cost for every output strip.

The current compatibility path in `packages/luma-raw-runtime/native` creates a
new LibRaw crop processor for each processed window, opens the same input buffer,
unpacks it, sets `cropbox`, processes it, copies RGB16 output, then returns the
requested rows. That is safe and format-compatible, but it scales badly with
strip count.

Add an explicit native export-session path:

```text
decode session
-> beginProcessedWindowExport(processingPolicy)
-> readProcessedWindow(outputRect, halo) repeated in output order
-> endProcessedWindowExport()
```

The fast path must:

- open and copy the RAW input into WASM/native memory once per decode session;
- unpack once per export session whenever LibRaw allows a repeatable source
  state;
- expose per-window timings that distinguish repeated setup from actual crop
  processing;
- keep processed window facts identical to the current contract:
  `linear-prophoto-rgb`, RGB16, color applied, orientation applied, visible
  output coordinates;
- keep the current cropbox compatibility path as a fail-closed or safe fallback
  tier, not as the target performance path.

Implementation should be evidence-driven. First prototype and benchmark these
candidate native paths:

- Reuse one LibRaw processor inside a native export session if repeated cropbox
  processing is safe after reset/recycle.
- Reuse the input buffer and native allocations while recreating only the minimum
  LibRaw state if full processor reuse is not safe.
- Move toward raw-window plus LumaForge-owned demosaic/color facts only if LibRaw
  processed-window reuse cannot deliver the target. That path must preserve the
  same scene-linear ProPhoto input facts before it replaces processed windows.

The release gate for Direction 1 is that per-strip RAW setup no longer dominates
the 100MP export. A 100MP run with the same strip height should show repeated
open/unpack cost amortized or eliminated in the JSONL profile.

## Direction 2: libjpeg-turbo WASM scanline backend

Replace the pure TypeScript JPEG encoder core in
`@lumaforge/luma-jpeg-runtime` with a libjpeg-turbo-backed WASM encoder.

Use the traditional libjpeg scanline API shape, not a whole-image TurboJPEG
entrypoint that would require a full RGB8 source buffer:

```text
create(width, height, quality, sampling)
-> writeRows(rgb8Rows, rowCount)
-> finish()
-> Blob(image/jpeg)
```

Design requirements:

- Preserve the current public TypeScript runtime API and worker boundary.
- Build libjpeg-turbo from pinned source under `packages/luma-jpeg-runtime`.
- Include package-local license and notice files for the IJG and Modified BSD
  license obligations.
- Start with baseline 4:4:4 output for parity with the current encoder.
- Keep RGB8 rows ordered top-to-bottom; the encoder must reject missing,
  repeated, or extra rows.
- Use a bounded destination manager that flushes encoded chunks to JS/Blob parts.
  Do not assemble the compressed JPEG into one contiguous `Uint8Array`.
- Treat the current TS encoder as a test/reference or debug backend only. The
  production full-resolution path should fail closed if the native JPEG backend
  is unavailable.
- Add a scalar WASM artifact first, then add a SIMD artifact selected by runtime
  capability if it provides a measured browser win.

Important caveat: libjpeg-turbo's native advantage comes partly from SIMD and
optimized Huffman paths. WASM SIMD requires explicit Emscripten support and does
not guarantee native assembly parity in every browser. The benchmark must report
scalar and SIMD results separately on Chrome, Edge, and Safari.

The JPEG-only 100MP benchmark should drop from the current pure TypeScript floor
to a low single-digit or low-teens second range before this direction is accepted.
Exact acceptance should be based on the browser JSONL numbers, not native
libjpeg-turbo claims.

## Direction 3: bounded pipeline concurrency

After Directions 1 and 2 are measurable, overlap independent stages without
increasing crash risk.

The export pipeline has natural stage boundaries:

```text
RAW processed-window read
-> color graph + RGB8 quantization
-> JPEG scanline write
```

The first implementation should use a bounded producer/consumer model:

- Default to one active strip on `safe`.
- Allow two in-flight strip slots on `balanced` when the memory estimate leaves
  enough headroom.
- Allow three in-flight strip slots only for `max` and only after browser memory
  telemetry validates it.
- Never run unbounded RAW reads or unbounded JPEG writes.
- Keep output rows committed to the JPEG encoder in strict output order even if
  earlier stages are prepared ahead of time.
- On allocation failure, worker failure, or resource pressure, retry with lower
  strip height and concurrency one before failing.

This direction should overlap the raw runtime worker, export worker color stage,
and JPEG worker where possible. It should not start with multiple concurrent
LibRaw export sessions; that would multiply WASM heap pressure and can easily
erase the win.

GPU acceleration is a later optional branch of this direction, not the default
path. A tiled GPU color stage is acceptable only after:

- CPU and GPU graph outputs are compared against real LUT fixtures within a
  documented tolerance;
- no full-resolution GPU texture is required;
- readback happens in bounded row/tile buffers;
- Safari support is validated;
- the CPU path remains the authoritative fallback.

## Direction 4: precision-preserving row-band processing

Direction 4 is not a precision reduction. It is a memory-layout and loop-fusion
optimization.

The current CPU export path materializes a full-strip `Float32Array` from RGB16
and then materializes a separate full-strip `Uint8Array` after the color graph.
That is correct, but it creates avoidable allocation and memory bandwidth costs.

Replace the full-strip transform with a reusable row-band processor:

```text
RGB16 processed window rows
-> reusable Float32 scratch for N rows
-> Float32 matrix / gamma / Log / LUT / output transform
-> reusable RGB8 row buffer
-> jpeg.writeRows()
```

Requirements:

- Float32 remains the internal precision for matrix math, custom gamma/log
  transfer functions, LUT sampling, LUT intensity mixing, and output transform.
- RGB8 quantization occurs only after the full color graph for that row band is
  complete.
- No LUT, Log, or custom transfer stage may consume pre-quantized RGB8 unless a
  future explicitly separate preview-only mode says so.
- Reuse scratch buffers sized by row band, not by full image.
- Fuse simple no-LUT and LUT graph loops separately so each pixel is read and
  written as few times as possible.
- Precompute graph constants, matrices, transfer function handles, LUT domain
  spans, range conversion constants, and optional 16-bit transfer lookup tables
  when they preserve Float32-equivalent output within tolerance.

The acceptance test for this direction is numerical, not bit identity with the
old allocation shape. Synthetic and real LUT fixtures must prove the optimized
row-band path matches the existing CPU export graph within the documented
tolerance before replacing it.

## Memory budget

The optimized export path should keep peak live pixel buffers bounded by:

```text
activeStripSlots * (
  processedWindow RGB16 bytes
  + rowBand Float32 scratch bytes
  + rowBand RGB8 bytes
  + small encoder staging bytes
)
+ raw runtime WASM heap
+ jpeg runtime WASM heap
+ compressed Blob parts
```

For 100MP export, the design must continue to avoid:

- full-image RGB16 buffers
- full-image Float32 buffers
- full-image RGB8 buffers
- full-image Canvas/ImageData/GPU textures
- one contiguous compressed JPEG byte array

If the memory estimate exceeds a browser-specific budget, reduce in this order:

1. pipeline concurrency
2. row-band height
3. strip height

Do not reduce output dimensions or silently switch to preview export.

## Benchmark and validation matrix

Automated benchmarks:

- `@lumaforge/luma-jpeg-runtime` encode-only benchmark for synthetic 100MP rows.
- Export-worker benchmark with mocked raw windows to isolate color graph and JPEG.
- Native raw-runtime benchmark for processed-window reads with per-window timing.
- End-to-end browser benchmark that downloads and decodes the output JPEG.

Fixture coverage:

- 26MP Sony public/local fixture for regression speed.
- 45MP Nikon fixture for orientation and compatibility coverage.
- 61MP Sony fixture for current supported high-resolution acceptance.
- 100MP Fujifilm GFX100RF RAF with a supported V-Log LUT for the primary target.

Browser coverage:

- Chrome production build preview.
- Edge production build preview.
- Safari production build preview on a Safari host.

Correctness gates:

- Output JPEG decodes to the exact expected full-resolution dimensions.
- Supported LUT output remains visually and numerically consistent with the
  existing CPU graph.
- Unknown LUT contracts and unsupported RAW facts fail closed.
- Cancellation stops scheduling, aborts the JPEG encoder, and releases workers.
- Resource retry preserves output dimensions.

Performance gates:

- Direction 1 accepted only when processed-window repeated setup cost is no
  longer the dominant 100MP stage.
- Direction 2 accepted only when JPEG-only 100MP encode time is no longer close
  to the current pure TypeScript floor.
- Direction 3 accepted only when concurrency improves median end-to-end time
  without increasing peak memory beyond the configured budget.
- Direction 4 accepted only when allocation reduction is measurable and color
  graph parity stays within tolerance.

## Rollout order

1. Add performance telemetry and benchmark harnesses before changing behavior.
2. Implement libjpeg-turbo backend behind the existing JPEG runtime API.
3. Implement native RAW export-session fast path and keep the compatibility
   cropbox path as fallback.
4. Replace full-strip color allocation with the precision-preserving row-band
   processor.
5. Add bounded pipeline concurrency with adaptive fallback.
6. Re-run browser acceptance on Chrome, Edge, and Safari.
7. Update the high-resolution export acceptance matrix with measured before/after
   results.

## External references

- libjpeg-turbo project overview: `https://www.libjpeg-turbo.org/`
- libjpeg-turbo license: `https://raw.githubusercontent.com/libjpeg-turbo/libjpeg-turbo/main/LICENSE.md`
- libjpeg scanline API shape: `https://refspecs.linuxbase.org/LSB_3.1.0/LSB-Desktop-generic/LSB-Desktop-generic/libjpeg.jpeg.write.scanlines.1.html`
- Emscripten WASM SIMD notes: `https://emscripten.org/docs/porting/simd.html`
