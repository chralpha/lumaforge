# Luma color runtime package design

Date: 2026-04-30

Related documents:

- [`2026-04-24-phase2-raw-color-pipeline-color-science-audit.md`](./2026-04-24-phase2-raw-color-pipeline-color-science-audit.md)
- [`2026-04-25-high-resolution-browser-export-design.md`](./2026-04-25-high-resolution-browser-export-design.md)
- [`2026-04-27-export-performance-optimization-design.md`](./2026-04-27-export-performance-optimization-design.md)
- [`2026-04-30-online-lut-sources-design.md`](./2026-04-30-online-lut-sources-design.md)

## Goal

Extract LumaForge's gamut, transfer, LUT-contract, and color-graph logic into a
dedicated workspace package so the RAW runtime, preview renderer, export worker,
online profile loader, and future compatibility work all depend on the same
color contract boundary.

The package exists to make this pipeline explicit and reusable:

```text
Linear ProPhoto RGB scene-linear
-> LUT input gamut
-> LUT input transfer or Log curve
-> 3D LUT
-> declared LUT output handling
-> Rec.709/sRGB photo output
```

The package is a pure TypeScript package with deterministic math utilities,
contract types, CPU graph execution helpers, and GLSL source helpers. It must
not introduce a native or WASM backend.

## Non-goals

- Do not add a WASM color transform backend.
- Do not move RAW decoding, LibRaw session handling, processed-window reads, or
  runtime native assets into the color package.
- Do not move JPEG encoding, JPEG row sinks, metadata preservation, or output
  file writing into the color package.
- Do not move React state, UI copy, localStorage source management, online
  catalog fetching, or URL-sharing behavior into the color package.
- Do not change the current authoritative scene-linear Linear ProPhoto handoff.
- Do not change LUT licensing, provenance, or redistribution policy.
- Do not broaden output targets beyond the current Rec.709/sRGB JPEG product
  path in this extraction.
- Do not use filename, title, or free-form `.cube` comments as rendering
  authority. They remain hints unless converted into structured metadata or an
  explicit user-selected contract.

## Package identity

Create a new workspace package:

```text
packages/luma-color-runtime
```

Package name:

```text
@lumaforge/luma-color-runtime
```

The package is private in the first repo-local version, matching the current
runtime package pattern. Its public surface is still treated as a real package
contract so the app does not keep importing package internals after extraction.

The package should build to ESM only and emit declarations:

```json
{
  "name": "@lumaforge/luma-color-runtime",
  "type": "module",
  "private": true,
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./glsl": {
      "types": "./dist/glsl.d.ts",
      "import": "./dist/glsl.js"
    },
    "./testing": {
      "types": "./dist/testing.d.ts",
      "import": "./dist/testing.js"
    }
  }
}
```

`./testing` is for deterministic test helpers only. App runtime code should use
the root export or `./glsl`.

## Ownership

`@lumaforge/luma-color-runtime` owns:

- color gamut identifiers, primaries, white points, aliases, and source URLs;
- transfer function identifiers, encode/decode functions, aliases, reference
  points, and source URLs;
- 3x3 matrix utilities, RGB-to-RGB gamut conversion, and chromatic adaptation;
- LUT role, signal range, and LUT color contract types;
- contract validation helpers for manual, structured, persisted, and online
  profile sources;
- content-independent conversion from a resolved LUT contract into a color graph
  descriptor;
- CPU row-band graph execution for full-resolution export;
- shared transfer/range/role enum values used by WebGL uniforms;
- GLSL snippets for transfer functions, signal range conversion, LUT domain
  normalization, and graph role dispatch;
- test fixtures and parity helpers that keep TypeScript and GLSL contracts from
  drifting.

The app keeps ownership of:

- RAW session lifecycle and source capability probing;
- preview canvas and WebGL context lifecycle;
- LUT file upload, source URL management, online catalog fetching, and profile
  hydration;
- persisted browser preferences and user interaction state;
- export worker lifecycle, strip scheduling, cancellation, retry, telemetry, and
  JPEG writing;
- user-facing text and disabled-state decisions.

`@lumaforge/luma-raw-runtime` continues to own RAW access facts:

```text
RAW file -> a window in linear-prophoto-rgb
```

`@lumaforge/luma-jpeg-runtime` continues to own `row-oriented` JPEG encoding:

```text
ordered RGB8 rows -> image/jpeg Blob
```

The new package owns the color transform between those two package boundaries.

## Public API

The initial package surface should be small and data-oriented.

Root export:

```ts
export type ColorGamutId =
  | 'prophoto-rgb'
  | 'srgb-rec709'
  | 'display-p3'
  | 'rec2020'
  | 's-gamut'
  | 's-gamut3'
  | 's-gamut3-cine'
  | 'v-gamut'
  | 'f-gamut'
  | 'f-gamut-c'
  | 'canon-cinema-gamut'
  | 'arri-wide-gamut-3'
  | 'arri-wide-gamut-4'
  | 'red-wide-gamut-rgb'
  | 'aces-ap1'

export type TransferFunctionId =
  | 's-log2'
  | 's-log3'
  | 'canon-log'
  | 'canon-log2'
  | 'canon-log3'
  | 'n-log'
  | 'f-log'
  | 'f-log2'
  | 'f-log2c'
  | 'v-log'
  | 'logc3'
  | 'logc4'
  | 'log3g10'
  | 'acescc'
  | 'acescct'
  | 'srgb'
  | 'bt709'
  | 'gamma24'
  | 'l-log'
  | 'linear'

export type LUTRole =
  | 'display-look'
  | 'scene-creative'
  | 'technical-output'
  | 'combined-look-output'

export type SignalRange = 'full' | 'legal' | 'unknown'

export interface LUTColorProfile {
  id: string
  label: string
  role: LUTRole
  inputGamut: ColorGamutId
  inputTransfer: TransferFunctionId
  inputRange: SignalRange
  outputGamut?: ColorGamutId
  outputTransfer?: TransferFunctionId
  outputRange?: SignalRange
  aliases: string[]
  source?: string
}

export interface LumaColorLUTData {
  size: number
  data: Float32Array
  domainMin: [number, number, number]
  domainMax: [number, number, number]
}

export interface LumaRawRenderExposure {
  ev: number
  multiplier: number
  source: 'identity' | 'dng-baseline-exposure' | 'image-statistics'
}
```

Core functions:

```ts
export function getColorGamut(id: ColorGamutId | string): ColorGamut | undefined
export function getTransferFunction(
  id: TransferFunctionId | string,
): TransferFunctionMetadata | undefined
export function getLinearGamutMatrix(
  srcGamut: ColorGamutId | string,
  dstGamut: ColorGamutId | string,
): Mat3
export function getLinearProPhotoToGamutMatrix(
  targetGamut: ColorGamutId | string,
): Mat3
export function getLUTOutputToTargetMatrix(
  lutOutputGamut: ColorGamutId | string,
  targetGamut: ColorGamutId | string,
): Mat3
export function resolveColorGraph(input: ResolveColorGraphInput): ColorGraph
export function resolveUnsupportedLUTOutputReason(
  profile: LUTColorProfile,
): string | undefined
export function createRowBandProcessor(
  input: CreateRowBandProcessorInput,
): RowBandProcessor
```

The root package must not export React components, hooks, storage keys, worker
constructors, WebGL context factories, JPEG sinks, or raw-runtime types.

## Color graph model

The package should define one shared graph descriptor used by preview and
export. The graph is pure data:

```ts
export type ColorGraphStep =
  | { kind: 'input-linear-prophoto' }
  | { kind: 'raw-render-exposure'; ev: number; multiplier: number }
  | { kind: 'gamut-to-lut-input'; matrix: Mat3; gamut: ColorGamutId }
  | {
      kind: 'encode-lut-transfer'
      transfer: TransferFunctionId
      range: SignalRange
    }
  | {
      kind: 'lut3d'
      size: number
      data: Float32Array
      domainMin: [number, number, number]
      domainMax: [number, number, number]
    }
  | {
      kind: 'lut-output-to-srgb'
      matrix: Mat3
      transfer: TransferFunctionId
      range: SignalRange
      role: LUTRole
      intensity: number
    }
  | { kind: 'output-srgb' }
```

The first extraction should preserve the current behavior:

- no LUT resolves to Linear ProPhoto plus raw render exposure plus output sRGB;
- custom LUTs require a resolved input contract;
- non-display LUTs require declared output gamut, transfer, and range;
- `linear` LUT output transfer is not supported for full-resolution JPEG export
  in this phase;
- built-in styles stay app-owned and remain unsupported by authoritative
  full-resolution export until they are represented as package-owned graph
  operations.

The graph descriptor must stay serializable except for the LUT `Float32Array`.
It must not contain functions, WebGL objects, DOM objects, runtime sessions,
workers, or UI state.

## GLSL surface

Preview still executes color transforms in WebGL. The color package should
provide a small `./glsl` export that keeps shader constants aligned with the
TypeScript graph contract:

```ts
export const LUT_ROLE_UNIFORMS: Record<LUTRole, number>
export const LUT_RANGE_UNIFORMS: Record<SignalRange, number>
export const LUT_TRANSFER_UNIFORMS: Record<TransferFunctionId, number>
export const LUMA_COLOR_TRANSFER_GLSL: string
export const LUMA_COLOR_RANGE_GLSL: string
export const LUMA_COLOR_LUT_GLSL: string
```

`src/lib/gl/shaders.ts` should own the full fragment shader assembly, texture
reads, framebuffer output, built-in style branch, and compare/original view
behavior. The package only supplies reusable color-science snippets and enum
values.

The shader contract must be covered by tests that verify every exported
`TransferFunctionId` has a matching GLSL enum branch. A transfer cannot be added
to TypeScript without updating GLSL.

## CPU row-band execution

The CPU executor remains the authoritative full-resolution export graph
executor. It should move from `src/lib/export/row-band-processor.ts` into the
new package, keeping these properties:

- process `Float32Array` and `Uint16Array` row bands;
- convert RGB16 to Float32 before matrix, transfer, LUT, and output operations;
- quantize to RGB8 only after the full graph is applied;
- reuse scratch buffers sized by row band, not by full image;
- support a no-LUT fast path and a LUT graph path;
- reject unsupported graph shapes loudly.

The export worker will keep scheduling and JPEG writing. It should call the
package row-band processor from inside the existing strip lifecycle:

```text
read LibRaw processed RGB16 window
-> package row-band processor
-> JPEG row writer
```

## Contract resolution

Contract selection is split into package-level validation and app-level source
ownership.

The package owns generic validation:

- normalize gamut and transfer aliases;
- validate role, range, and display-look constraints;
- check whether an output contract is complete;
- convert a validated stored or structured contract into `LUTColorProfile`;
- map trusted online profile metadata into a generic contract result.

The app owns source-specific decisions:

- manual `.cube` upload;
- `lumaforge-profiles` catalog fetching and SHA-256 verification;
- browser localStorage reads and writes;
- user prompts and selection UI;
- query-string source parsing and share links.

This split means `src/lib/lut/profile-resolution.ts` should become a thin
adapter over package validation helpers. It should not be the owner of color
types after extraction.

## Proposed file movement

Move or copy first, then delete old app-local sources after imports are stable.

New package files:

```text
packages/luma-color-runtime/package.json
packages/luma-color-runtime/tsconfig.json
packages/luma-color-runtime/vite.config.ts
packages/luma-color-runtime/src/index.ts
packages/luma-color-runtime/src/constants.ts
packages/luma-color-runtime/src/matrix.ts
packages/luma-color-runtime/src/log-encoding.ts
packages/luma-color-runtime/src/registry.ts
packages/luma-color-runtime/src/color-graph.ts
packages/luma-color-runtime/src/lut-contract.ts
packages/luma-color-runtime/src/lut3d.ts
packages/luma-color-runtime/src/row-band-processor.ts
packages/luma-color-runtime/src/glsl.ts
packages/luma-color-runtime/src/testing.ts
```

Move tests alongside the package:

```text
packages/luma-color-runtime/src/log-encoding.test.ts
packages/luma-color-runtime/src/matrix.test.ts
packages/luma-color-runtime/src/registry.test.ts
packages/luma-color-runtime/src/color-graph.test.ts
packages/luma-color-runtime/src/row-band-processor.test.ts
packages/luma-color-runtime/src/glsl.test.ts
packages/luma-color-runtime/src/lut-contract.test.ts
```

Keep app-local files as adapters during the migration:

```text
src/lib/color/index.ts
src/lib/export/color-graph.ts
src/lib/export/row-band-processor.ts
src/lib/export/lut3d.ts
```

Those adapters should re-export from `@lumaforge/luma-color-runtime` only for a
short migration window. After all app imports are switched to the package, the
adapters can be removed or left as compatibility shims if they reduce churn.

## Dependency direction

Allowed dependencies:

```text
app -> @lumaforge/luma-color-runtime
app -> @lumaforge/luma-raw-runtime
app -> @lumaforge/luma-jpeg-runtime
```

Forbidden dependencies:

```text
@lumaforge/luma-color-runtime -> src/*
@lumaforge/luma-color-runtime -> @lumaforge/luma-raw-runtime
@lumaforge/luma-color-runtime -> @lumaforge/luma-jpeg-runtime
@lumaforge/luma-color-runtime -> react
@lumaforge/luma-color-runtime -> DOM or WebGL runtime objects
```

The package should rely on standard ECMAScript and typed-array APIs. It must not
depend on browser storage, workers, canvas, DOM nodes, or WebGL context APIs.

## App integration

Update root workspace dependencies:

```json
{
  "dependencies": {
    "@lumaforge/luma-color-runtime": "workspace:*"
  }
}
```

Update TypeScript paths during development:

```json
{
  "paths": {
    "@lumaforge/luma-color-runtime": [
      "./packages/luma-color-runtime/src/index.ts"
    ],
    "@lumaforge/luma-color-runtime/glsl": [
      "./packages/luma-color-runtime/src/glsl.ts"
    ],
    "@lumaforge/luma-color-runtime/testing": [
      "./packages/luma-color-runtime/src/testing.ts"
    ]
  }
}
```

Preview path:

- `src/lib/gl/pipeline.ts` imports role/range/transfer uniforms and graph helper
  types from the package.
- `src/lib/gl/shaders.ts` imports or composes package GLSL snippets.
- WebGL context creation, texture upload, hidden canvas export, and telemetry
  stay app-local.

Export path:

- `src/lib/export/full-res-export.ts` imports `createRowBandProcessor` from the
  package.
- `src/lib/export/color-graph.ts` becomes a package re-export or is removed
  after callers switch to `resolveColorGraph`.
- Strip scheduling, ordered concurrency, retry, and metrics remain app-local.

LUT/profile path:

- `src/lib/lut/profile-resolution.ts` uses package contract validators.
- `src/lib/profiles/lut-contract.ts` maps online profile JSON into package
  contract input, but keeps fetch and provenance checks app-local.

## Rollout plan

1. Add `packages/luma-color-runtime` with copied pure color code and tests.
2. Move graph descriptor and row-band processor into the package after lifting
   `LUTData`, `ProcessingParams`, and raw render exposure types out of GL/app
   modules.
3. Add GLSL enum/snippet exports and parity tests.
4. Replace app imports in `src/lib/color`, `src/lib/export`, `src/lib/gl`,
   `src/lib/lut`, `src/lib/profiles`, and RAW Lab model/service code.
5. Keep temporary app-local re-export shims until all direct imports are clean.
6. Remove or shrink shims once tests pass and import boundaries are stable.
7. Update docs that describe package boundaries and deployment checks.

This can be implemented without changing user-visible RAW Lab behavior.

## Testing

Package tests:

- transfer reference points and round trips;
- matrix conversion and white-point adaptation;
- LUT profile registry lookup and alias search;
- contract validation for display-look, scene-creative, technical-output, and
  combined-look-output roles;
- fail-closed behavior for missing output contracts and unknown ranges;
- color graph resolution for no-LUT, scene LUT, display LUT, and combined output
  LUT paths;
- row-band precision tests proving Float32 math before final RGB8 quantization;
- GLSL enum parity tests for every transfer, role, and range.

App integration tests:

- existing `src/lib/gl/pipeline-profile.test.ts`;
- existing `src/lib/gl/shaders.test.ts`;
- existing `src/lib/export/full-res-export.test.ts`;
- existing `src/lib/export/color-graph.test.ts` until replaced by package tests;
- existing `src/lib/lut/profile-resolution.test.ts`;
- existing RAW Lab workflow tests for manual and online LUT sources.

Recommended first verification command:

```bash
pnpm test:run \
  packages/luma-color-runtime/src \
  src/lib/gl/pipeline-profile.test.ts \
  src/lib/gl/shaders.test.ts \
  src/lib/export/full-res-export.test.ts \
  src/lib/lut/profile-resolution.test.ts \
  src/lib/profiles/lut-contract.test.ts \
  --exclude '.worktrees/**'
```

Build verification:

```bash
pnpm --filter @lumaforge/luma-color-runtime typecheck
pnpm --filter @lumaforge/luma-color-runtime build
pnpm build
```

## Acceptance

- A new `@lumaforge/luma-color-runtime` package exists and builds without native
  or WASM artifacts.
- The package has no dependency on RAW runtime, JPEG runtime, React, app-local
  `src/*`, WebGL contexts, workers, storage, or DOM runtime objects.
- Color gamut, transfer, LUT contract, graph descriptor, GLSL enum, and CPU
  row-band execution are available through the package public API.
- Preview and full-resolution export consume the same package-owned contract
  vocabulary.
- Current RAW Lab behavior is unchanged for no-LUT export, display LUTs,
  scene-creative LUTs with complete output contracts, combined output LUTs, and
  unresolved LUT fail-closed states.
- Unknown or incomplete LUT contracts still fail closed for full-resolution
  export.
- Tests prove TypeScript and GLSL transfer enums cannot drift silently.
- Root build and targeted tests pass with `.worktrees` excluded.
