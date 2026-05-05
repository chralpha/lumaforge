# Third-Party Notices

This package builds a Luma-owned WebAssembly wrapper around a pinned upstream native library.
The generated `dist/native/luma_jpeg.wasm` artifact may contain object code from the component below.

## libjpeg-turbo

- Component: libjpeg-turbo
- Version: 3.1.4.1
- Source: `https://github.com/libjpeg-turbo/libjpeg-turbo/releases/download/3.1.4.1/libjpeg-turbo-3.1.4.1.tar.gz`
- Locked SHA-256: `ecae8008e2cc9ade2f2c1bb9d5e6d4fb73e7c433866a056bd82980741571a022`
- Package lock: `native/sources.lock.json`
- License file included here:
  - `THIRD_PARTY_LICENSES/libjpeg-turbo-LICENSE.md`

Upstream libjpeg-turbo is covered by compatible BSD-style licenses: the Independent JPEG Group license for the libjpeg API code and the modified 3-clause BSD license for the TurboJPEG API and build system.
The upstream notice also documents zlib-licensed SIMD source code.
Keep the included copyright and permission notices with redistributed source or binary artifact bundles.

## Compliance Checklist For Native Artifact Distribution

- Keep this file and `THIRD_PARTY_LICENSES/` beside redistributed package artifacts.
- Keep `native/sources.lock.json` so recipients can identify exact native source archives and hashes.
- Keep the native wrapper and build scripts available from this package source tree.
- Run `pnpm --filter @lumaforge/luma-jpeg-runtime native:verify` before shipping generated native artifacts.
