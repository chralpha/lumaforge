# @lumaforge/luma-native-artifacts

Prebuilt browser WebAssembly artifacts for LumaForge deployments.

This package is an artifact bundle, not a JavaScript runtime API.
The LumaForge
app and workspace runtime packages still own the TypeScript API, worker
protocols, native source locks, and source rebuild scripts.
This package exists
so production/self-hosted builds can download the generated RAW and JPEG native
artifacts instead of rebuilding LibRaw, Little CMS, and libjpeg-turbo from source
on every deployment.

## Contents

- `native/desktop/luma_raw.js`
- `native/desktop/luma_raw.wasm`
- `native/low-memory/luma_raw.js`
- `native/low-memory/luma_raw.wasm`
- `native/luma_jpeg.js`
- `native/luma_jpeg.wasm`
- `native/provenance/raw.json`
- `native/provenance/jpeg.json`
- `LICENSE`
- `THIRD_PARTY_NOTICES.md`
- `THIRD_PARTY_LICENSES/`

## Publish Flow

Build and verify native artifacts from source before syncing this package:

```bash
pnpm native:build
pnpm native:verify
pnpm native:artifacts:sync
pnpm native:artifacts:verify
pnpm native:artifacts:pack
```

`pnpm native:artifacts:sync` copies the current runtime native outputs into
this package and refreshes the compliance files.
The copied artifacts are
generated files and are intentionally ignored by git; publish from a verified
working tree after sync.

## App Build Selection

The root app resolves native assets with `LUMAFORGE_NATIVE_RUNTIME_MODE`:

- `auto`: prefer this prebuilt package when available, otherwise use workspace
  source artifacts.
- `prebuilt`: require this package's native assets.
- `source`: require workspace `packages/*/dist/native` artifacts.

Development serving defaults to `source`.
Production builds default to `auto`,
which prefers the prebuilt package.
