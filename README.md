# LumaForge

LumaForge is a browser-local RAW photo lab for fast, color-safe straight-out
looks. Drop in a camera RAW file, preview it immediately, apply a built-in look
or a declared `.cube` LUT contract, compare the result against the original, and
export a full-resolution JPEG without installing a heavyweight editor or sending
the source image to a server.

The project is intentionally narrower than a desktop RAW editor. It focuses on
one high-value workflow:

```text
single RAW file -> browser-local decode -> look or LUT -> compare -> JPEG export
```

## Why It Exists

Most LUT workflows assume that the input image already lives in the color space
the LUT was authored for. RAW photos do not. They start as camera-dependent
sensor data, and a LUT made for ARRI LogC4, RED Log3G10, Sony S-Log3, Panasonic
V-Log, or a display-referred Rec.709 image cannot be applied honestly until the
input contract is explicit.

Professional color tools such as DaVinci Resolve can build this kind of color
workflow, but they are designed to obey the operator. If a user feeds the wrong
gamma, log curve, gamut, or LUT output into a node graph, the tool will still
calculate the requested result. That freedom is valuable for professionals, but
it also makes casual RAW-to-LUT workflows easy to misconfigure.

LumaForge takes the opposite product stance for this workflow. It limits the
available choices so ordinary users can get a convenient finished JPEG without
learning the failure modes of color science first. Running in the browser also
means the tool can work across many devices without environment setup,
application installs, native helpers, or license friction.

LumaForge explores a practical browser-first version of that pipeline:

- keep image processing local to the browser;
- normalize RAW input into a known scene-linear working representation;
- constrain gamma, log, gamut, and LUT output choices so incompatible contracts
  are not rendered silently;
- keep preview interactive while full-resolution export runs through a bounded
  worker path;
- fail closed when a source file or color pipeline cannot be exported correctly.

## Current Capabilities

- Browser-local RAW loading for common camera formats such as ARW, NEF, RAF,
  RW2, ORF, DNG, CR2, CR3, PEF, SRW, IIQ, 3FR, FFF, and related RAW extensions.
- Embedded, quick, and HQ preview stages so the first visible image can appear
  before the heavier decode finishes.
- WebGL2 preview rendering with original/processed comparison.
- Built-in looks: Neutral, Warm, Cool, Film Soft, Film Contrast, Cinematic,
  Fade, and Mono.
- Custom `.cube` LUT upload with explicit camera/log or display contract
  selection.
- LUT profile coverage for common creative targets including ARRI LogC,
  REDWideGamutRGB / Log3G10, Nikon N-Log, Sony S-Log, Canon Log, Fujifilm
  F-Log, Panasonic V-Log, ACES, and display sRGB.
- Full-resolution JPEG export through a dedicated worker using bounded
  processed-window strips instead of full-frame canvas or GPU readback.
- A self-packaged `@lumaforge/luma-raw-runtime` WebAssembly runtime built around
  pinned LibRaw, Little CMS, and Emscripten inputs.
- A row-oriented `@lumaforge/luma-jpeg-runtime` package for bounded JPEG output.

## Product Boundary

LumaForge is currently an active RAW + LUT pipeline prototype. It is designed
for modern desktop browsers with WebGL2. Mobile browsers, unusual RAW layouts,
and files that cannot expose the required processed-window facts may be
disabled with an explicit unsupported message.

Full-resolution export is deliberately stricter than preview. If the runtime
cannot prove that the RAW source and selected LUT graph can be reproduced by the
authoritative worker export path, LumaForge disables export instead of silently
downscaling, changing the color path, or exporting a preview image under a
full-resolution label.

Non-goals for the current product surface:

- no cloud upload requirement;
- no account system;
- no batch processing;
- no local daemon or native helper;
- no full desktop-style RAW development panel;
- no AI denoise, masking, lens correction, or project catalog.

## Architecture

```text
RAW file
-> @lumaforge/luma-raw-runtime
-> metadata, embedded preview, quick/HQ decode, export capability facts
-> Linear ProPhoto scene-referred working image
-> LUT input gamut and transfer/log encoding
-> built-in look or declared .cube LUT
-> output transform to Rec.709/sRGB
-> browser preview or full-resolution JPEG export
```

The main boundaries are:

- `packages/luma-raw-runtime`: RAW metadata, preview extraction, decode sessions,
  processed-window reads, and native runtime packaging.
- `src/lib/color`: color spaces, transfer functions, LUT profile contracts, and
  deterministic RAW render exposure.
- `src/lib/gl`: WebGL2 preview pipeline.
- `src/lib/export`: worker-driven full-resolution color graph and strip export.
- `packages/luma-jpeg-runtime`: bounded row-oriented JPEG encoding.
- `src/modules/raw-processor`: the product UI for upload, preview, style
  selection, LUT contract selection, compare, status, and export.

Preview and export share color intent, but they are not the same executor.
Preview is interactive and may use lower-resolution assets. Export is the
authoritative full-resolution path.

## Getting Started

Requirements:

- Node.js compatible with the repo toolchain
- pnpm 10.18.0
- A modern desktop browser with WebGL2

Install dependencies:

```bash
pnpm install
```

Start the development server:

```bash
pnpm dev
```

Open the RAW workspace:

```text
http://localhost:5173/raw
```

Build for production:

```bash
pnpm build
```

Run tests:

```bash
pnpm test:run
```

## Native Runtime Tasks

The RAW and JPEG runtimes are workspace packages. Their native inputs are pinned
and should not depend on `libraw-wasm`, `LibRaw-Wasm`, or local baseline paths.

Production builds prefer the prebuilt `@lumaforge/luma-native-artifacts` package
when its native files are available. Development serving defaults to workspace
source artifacts. Override selection with `LUMAFORGE_NATIVE_RUNTIME_MODE`:

- `auto`: prefer prebuilt artifacts, then fall back to workspace artifacts.
- `prebuilt`: require `@lumaforge/luma-native-artifacts` artifacts.
- `source`: require workspace `packages/*/dist/native` artifacts.

Common runtime commands:

```bash
pnpm native:prepare
pnpm native:build
pnpm native:verify
pnpm --filter @lumaforge/luma-raw-runtime test
```

Before publishing a refreshed native artifact package:

```bash
pnpm native:build
pnpm native:verify
pnpm native:artifacts:sync
pnpm native:artifacts:verify
pnpm native:artifacts:pack
```

Public RAW smoke fixtures can be fetched with:

```bash
pnpm --filter @lumaforge/luma-raw-runtime fixtures:fetch-public
```

## License

LumaForge is distributed under GPL-3.0. See [LICENSE](./LICENSE).

The RAW and native artifact packages carry third-party native notices for
LibRaw, Little CMS, libjpeg-turbo, and the pinned Emscripten toolchain. See
[packages/luma-raw-runtime/THIRD_PARTY_NOTICES.md](./packages/luma-raw-runtime/THIRD_PARTY_NOTICES.md)
before redistributing native artifacts.
