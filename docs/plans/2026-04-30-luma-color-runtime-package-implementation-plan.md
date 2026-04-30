# Luma Color Runtime Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract LumaForge's gamut, transfer, LUT contract, GLSL enum, color graph, and CPU row-band color execution into `@lumaforge/luma-color-runtime` without changing RAW Lab behavior.

**Architecture:** Add a pure TypeScript workspace package, move existing deterministic color modules into it, keep temporary app-local re-export shims while imports are migrated, then switch preview/export/profile code to package-owned contracts. RAW decoding, WebGL context ownership, export scheduling, JPEG writing, profile fetching, storage, and UI remain app-owned.

**Tech Stack:** TypeScript 6, Vite 8 library build, Vitest, typed arrays, existing React/WebGL app integration.

---

## Source Documents

- Approved spec: `docs/specs/2026-04-30-luma-color-runtime-package-design.md`
- Current package references:
  - `packages/luma-raw-runtime/package.json`
  - `packages/luma-jpeg-runtime/package.json`
- Current color/runtime sources:
  - `src/lib/color/*`
  - `src/lib/export/color-graph.ts`
  - `src/lib/export/lut3d.ts`
  - `src/lib/export/row-band-processor.ts`
  - `src/lib/gl/pipeline.ts`
  - `src/lib/gl/shaders.ts`
  - `src/lib/lut/profile-resolution.ts`
  - `src/lib/profiles/lut-contract.ts`

## Execution Preconditions

Run from a clean checkout or a repo-local worktree:

```bash
git status --short
pnpm install --frozen-lockfile
```

If the checkout already has the approved spec file uncommitted, keep it
untouched unless the user asks to stage or commit docs:

```text
docs/specs/2026-04-30-luma-color-runtime-package-design.md
```

Do not implement native, Wasm, RAW runtime, JPEG runtime, profile publishing, or
UI redesign work in this plan.

## File Structure

Create:

- `packages/luma-color-runtime/package.json`: package metadata, exports, and package-local scripts.
- `packages/luma-color-runtime/tsconfig.json`: declaration-emitting package TypeScript config with no DOM lib.
- `packages/luma-color-runtime/vite.config.ts`: ESM library build for root, `./glsl`, and `./testing` exports.
- `packages/luma-color-runtime/src/index.ts`: public root export.
- `packages/luma-color-runtime/src/types.ts`: package-owned LUT, graph-input, and processing parameter types.
- `packages/luma-color-runtime/src/constants.ts`: moved color gamut constants.
- `packages/luma-color-runtime/src/log-encoding.ts`: moved transfer functions.
- `packages/luma-color-runtime/src/matrix.ts`: moved matrix and gamut conversion helpers.
- `packages/luma-color-runtime/src/registry.ts`: moved gamut, transfer, and LUT profile registry.
- `packages/luma-color-runtime/src/raw-render-exposure.ts`: moved raw render exposure helpers.
- `packages/luma-color-runtime/src/color-graph.ts`: moved export color graph resolver, with `resolveColorGraph` as the primary API.
- `packages/luma-color-runtime/src/lut-contract.ts`: generic LUT contract validation helpers.
- `packages/luma-color-runtime/src/lut3d.ts`: moved trilinear LUT sampler.
- `packages/luma-color-runtime/src/row-band-processor.ts`: moved CPU row-band graph executor.
- `packages/luma-color-runtime/src/glsl.ts`: shared LUT role/range/transfer uniforms and GLSL snippets.
- `packages/luma-color-runtime/src/testing.ts`: deterministic test helpers only.
- `packages/luma-color-runtime/src/package-boundary.test.ts`: dependency-boundary regression test.
- Package-local moved tests:
  - `packages/luma-color-runtime/src/log-encoding.test.ts`
  - `packages/luma-color-runtime/src/matrix.test.ts`
  - `packages/luma-color-runtime/src/registry.test.ts`
  - `packages/luma-color-runtime/src/raw-render-exposure.test.ts`
  - `packages/luma-color-runtime/src/color-graph.test.ts`
  - `packages/luma-color-runtime/src/lut3d.test.ts`
  - `packages/luma-color-runtime/src/row-band-processor.test.ts`
  - `packages/luma-color-runtime/src/lut-contract.test.ts`
  - `packages/luma-color-runtime/src/glsl.test.ts`

Modify:

- `package.json`: add `@lumaforge/luma-color-runtime` workspace dependency.
- `tsconfig.json`: add package path aliases.
- `vitest.config.ts`: add package alias for app-level tests.
- `vite.config.ts`: add package alias for dev/build resolution.
- `src/lib/color/*`: temporary shims while imports migrate, then delete after direct imports are switched.
- `src/lib/export/color-graph.ts`: temporary shim while imports migrate, then delete or keep as an empty compatibility surface only if a caller still needs it.
- `src/lib/export/lut3d.ts`: temporary shim while imports migrate, then delete.
- `src/lib/export/row-band-processor.ts`: temporary shim while imports migrate, then delete.
- `src/lib/export/full-res-export.ts`: import color graph and row-band processor from the package.
- `src/lib/export/full-res-export-client.ts`: import color graph types from the package.
- `src/lib/gl/pipeline.ts`: import package-owned types, uniforms, matrices, registry helpers, and graph resolver.
- `src/lib/gl/shaders.ts`: compose package GLSL snippets into the existing app-owned fragment shader.
- `src/lib/lut/cube-parser.ts`: import LUT data/profile types from the package.
- `src/lib/lut/profile-resolution.ts`: use package contract helpers while keeping localStorage ownership in the app.
- `src/lib/profiles/lut-contract.ts`: map online profile metadata through package helpers while keeping catalog/fetch ownership in the app.
- RAW Lab model, service, component, and test files that currently import color or LUT types through `~/lib/gl/pipeline` or `~/lib/color/*`.

Do not modify:

- `packages/luma-raw-runtime/*`
- `packages/luma-jpeg-runtime/*`
- profile registry publishing code outside this repository
- React UI layout or user-facing copy except import paths required by type ownership changes

---

## Task 1: Scaffold `@lumaforge/luma-color-runtime`

**Files:**

- Create: `packages/luma-color-runtime/package.json`
- Create: `packages/luma-color-runtime/tsconfig.json`
- Create: `packages/luma-color-runtime/vite.config.ts`
- Create: `packages/luma-color-runtime/src/index.ts`
- Create: `packages/luma-color-runtime/src/glsl.ts`
- Create: `packages/luma-color-runtime/src/testing.ts`
- Create: `packages/luma-color-runtime/src/package-boundary.test.ts`
- Modify: `package.json`
- Modify: `tsconfig.json`
- Modify: `vitest.config.ts`
- Modify: `vite.config.ts`

- [ ] **Step 1: Add package metadata**

Create `packages/luma-color-runtime/package.json`:

```json
{
  "name": "@lumaforge/luma-color-runtime",
  "type": "module",
  "version": "0.1.0",
  "private": true,
  "description": "Pure TypeScript color transform contract runtime for LumaForge.",
  "sideEffects": false,
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
  },
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "vite build --config vite.config.ts && tsc -p tsconfig.json --emitDeclarationOnly",
    "test": "vitest run src",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  }
}
```

- [ ] **Step 2: Add package TypeScript config**

Create `packages/luma-color-runtime/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "lib": ["ESNext"],
    "rootDir": ".",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "types": ["vitest/globals", "node"],
    "allowJs": false,
    "strict": true,
    "declaration": true,
    "declarationMap": true,
    "emitDeclarationOnly": false,
    "noEmit": false,
    "outDir": "dist"
  },
  "include": ["src/**/*"],
  "exclude": ["src/**/*.test.ts"]
}
```

- [ ] **Step 3: Add Vite library config**

Create `packages/luma-color-runtime/vite.config.ts`:

```ts
import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vite'

const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  root,
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    lib: {
      entry: {
        index: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
        glsl: fileURLToPath(new URL('./src/glsl.ts', import.meta.url)),
        testing: fileURLToPath(new URL('./src/testing.ts', import.meta.url)),
      },
      formats: ['es'],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    rollupOptions: {
      output: {
        chunkFileNames: '[name].js',
        entryFileNames: '[name].js',
      },
    },
    sourcemap: true,
    target: 'es2022',
  },
  test: {
    environment: 'node',
    globals: true,
  },
})
```

- [ ] **Step 4: Add package entry placeholders that compile**

Create `packages/luma-color-runtime/src/index.ts`:

```ts
export {}
```

Create `packages/luma-color-runtime/src/glsl.ts`:

```ts
export {}
```

Create `packages/luma-color-runtime/src/testing.ts`:

```ts
export {}
```

- [ ] **Step 5: Add package boundary test**

Create `packages/luma-color-runtime/src/package-boundary.test.ts`:

```ts
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const packageRoot = fileURLToPath(new URL('../', import.meta.url))
const sourceRoot = join(packageRoot, 'src')
const forbiddenImportPatterns = [
  /from\s+['"]~\//,
  /from\s+['"]@lumaforge\/luma-raw-runtime/,
  /from\s+['"]@lumaforge\/luma-jpeg-runtime/,
  /from\s+['"]react(?:\/|['"])/,
  /from\s+['"]react-dom(?:\/|['"])/,
  /from\s+['"]jotai(?:\/|['"])/,
]

function listTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry)
    const stats = statSync(path)

    if (stats.isDirectory()) return listTypeScriptFiles(path)
    if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) return [path]

    return []
  })
}

describe('luma color runtime package boundary', () => {
  it('does not import app, raw runtime, jpeg runtime, or React modules', () => {
    const violations = listTypeScriptFiles(sourceRoot).flatMap((filePath) => {
      const source = readFileSync(filePath, 'utf8')
      return forbiddenImportPatterns
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${relative(packageRoot, filePath)}: ${pattern}`)
    })

    expect(violations).toEqual([])
  })
})
```

- [ ] **Step 6: Wire the package into the app workspace**

Modify root `package.json` dependencies:

```json
"@lumaforge/luma-color-runtime": "workspace:*"
```

Modify root `tsconfig.json` path aliases:

```json
"@lumaforge/luma-color-runtime": [
  "./packages/luma-color-runtime/src/index.ts"
],
"@lumaforge/luma-color-runtime/glsl": [
  "./packages/luma-color-runtime/src/glsl.ts"
],
"@lumaforge/luma-color-runtime/testing": [
  "./packages/luma-color-runtime/src/testing.ts"
]
```

Modify `vitest.config.ts` aliases:

```ts
'@lumaforge/luma-color-runtime': fileURLToPath(
  new URL('./packages/luma-color-runtime/src/index.ts', import.meta.url),
),
'@lumaforge/luma-color-runtime/glsl': fileURLToPath(
  new URL('./packages/luma-color-runtime/src/glsl.ts', import.meta.url),
),
'@lumaforge/luma-color-runtime/testing': fileURLToPath(
  new URL('./packages/luma-color-runtime/src/testing.ts', import.meta.url),
),
```

Modify `vite.config.ts` aliases:

```ts
'@lumaforge/luma-color-runtime': resolve(
  ROOT,
  './packages/luma-color-runtime/src/index.ts',
),
'@lumaforge/luma-color-runtime/glsl': resolve(
  ROOT,
  './packages/luma-color-runtime/src/glsl.ts',
),
'@lumaforge/luma-color-runtime/testing': resolve(
  ROOT,
  './packages/luma-color-runtime/src/testing.ts',
),
```

- [ ] **Step 7: Refresh lockfile after adding the workspace dependency**

Run:

```bash
pnpm install --lockfile-only
```

Expected: `pnpm-lock.yaml` records `@lumaforge/luma-color-runtime` as a
workspace dependency of the root project.

- [ ] **Step 8: Verify scaffold**

Run:

```bash
pnpm --filter @lumaforge/luma-color-runtime typecheck
pnpm --filter @lumaforge/luma-color-runtime build
pnpm test:run packages/luma-color-runtime/src/package-boundary.test.ts --exclude '.worktrees/**'
```

Expected: all commands pass.

- [ ] **Step 9: Commit scaffold**

```bash
git add package.json pnpm-lock.yaml tsconfig.json vitest.config.ts vite.config.ts packages/luma-color-runtime
git commit --no-gpg-sign -m "chore: scaffold luma color runtime package"
```

---

## Task 2: Move Color Primitives And Raw Render Exposure

**Files:**

- Move: `src/lib/color/constants.ts` to `packages/luma-color-runtime/src/constants.ts`
- Move: `src/lib/color/log-encoding.ts` to `packages/luma-color-runtime/src/log-encoding.ts`
- Move: `src/lib/color/matrix.ts` to `packages/luma-color-runtime/src/matrix.ts`
- Move: `src/lib/color/registry.ts` to `packages/luma-color-runtime/src/registry.ts`
- Move: `src/lib/color/raw-render-exposure.ts` to `packages/luma-color-runtime/src/raw-render-exposure.ts`
- Move tests from `src/lib/color/*.test.ts` to `packages/luma-color-runtime/src/*.test.ts`
- Modify: `packages/luma-color-runtime/src/index.ts`
- Recreate shims:
  - `src/lib/color/constants.ts`
  - `src/lib/color/log-encoding.ts`
  - `src/lib/color/matrix.ts`
  - `src/lib/color/registry.ts`
  - `src/lib/color/raw-render-exposure.ts`
  - `src/lib/color/index.ts`

- [ ] **Step 1: Move source and test files**

Run:

```bash
git mv src/lib/color/constants.ts packages/luma-color-runtime/src/constants.ts
git mv src/lib/color/log-encoding.ts packages/luma-color-runtime/src/log-encoding.ts
git mv src/lib/color/matrix.ts packages/luma-color-runtime/src/matrix.ts
git mv src/lib/color/registry.ts packages/luma-color-runtime/src/registry.ts
git mv src/lib/color/raw-render-exposure.ts packages/luma-color-runtime/src/raw-render-exposure.ts
git mv src/lib/color/log-encoding.test.ts packages/luma-color-runtime/src/log-encoding.test.ts
git mv src/lib/color/matrix.test.ts packages/luma-color-runtime/src/matrix.test.ts
git mv src/lib/color/registry.test.ts packages/luma-color-runtime/src/registry.test.ts
git mv src/lib/color/raw-render-exposure.test.ts packages/luma-color-runtime/src/raw-render-exposure.test.ts
```

Expected: moved tests still import package-local modules with relative imports.

- [ ] **Step 2: Export moved modules from the package root**

Replace `packages/luma-color-runtime/src/index.ts` with:

```ts
export * from './constants'
export * from './log-encoding'
export * from './matrix'
export * from './raw-render-exposure'
export * from './registry'
```

- [ ] **Step 3: Recreate app-local shims**

Replace `src/lib/color/index.ts` with:

```ts
export * from '@lumaforge/luma-color-runtime'
```

Create `src/lib/color/constants.ts`:

```ts
export * from '@lumaforge/luma-color-runtime'
```

Create `src/lib/color/log-encoding.ts`:

```ts
export * from '@lumaforge/luma-color-runtime'
```

Create `src/lib/color/matrix.ts`:

```ts
export * from '@lumaforge/luma-color-runtime'
```

Create `src/lib/color/registry.ts`:

```ts
export * from '@lumaforge/luma-color-runtime'
```

Create `src/lib/color/raw-render-exposure.ts`:

```ts
export * from '@lumaforge/luma-color-runtime'
```

- [ ] **Step 4: Verify moved package tests**

Run:

```bash
pnpm test:run \
  packages/luma-color-runtime/src/log-encoding.test.ts \
  packages/luma-color-runtime/src/matrix.test.ts \
  packages/luma-color-runtime/src/registry.test.ts \
  packages/luma-color-runtime/src/raw-render-exposure.test.ts \
  packages/luma-color-runtime/src/package-boundary.test.ts \
  --exclude '.worktrees/**'
```

Expected: all moved tests pass.

- [ ] **Step 5: Verify app shims still preserve current imports**

Run:

```bash
pnpm test:run \
  src/lib/gl/pipeline-profile.test.ts \
  src/lib/export/color-graph.test.ts \
  src/lib/export/row-band-processor.test.ts \
  src/lib/lut/profile-resolution.test.ts \
  --exclude '.worktrees/**'
```

Expected: all tests pass while app imports still use `~/lib/color/*`.

- [ ] **Step 6: Commit primitive extraction**

```bash
git add packages/luma-color-runtime/src src/lib/color
git commit --no-gpg-sign -m "refactor: extract color primitives into luma color runtime"
```

---

## Task 3: Move LUT And Processing Types Out Of WebGL Pipeline

**Files:**

- Create: `packages/luma-color-runtime/src/types.ts`
- Modify: `packages/luma-color-runtime/src/index.ts`
- Modify: `src/lib/gl/pipeline.ts`
- Modify: `src/lib/lut/cube-parser.ts`
- Modify: `src/lib/lut/profile-resolution.ts`
- Modify: `src/modules/raw-processor/model/session.ts`
- Modify: `src/modules/raw-processor/services/style-system.ts`
- Modify component/test files that import only `LUTData`, `LUTInputProfile`, `LUTProfileResolution`, or `ProcessingParams` from `~/lib/gl/pipeline`.

- [ ] **Step 1: Add package-owned type module**

Create `packages/luma-color-runtime/src/types.ts`:

```ts
import type { ColorGamutId } from './constants'
import type { TransferFunctionId } from './log-encoding'
import type { LUTColorProfile, SignalRange } from './registry'

export type BuiltinStylePreset =
  | 'neutral'
  | 'warm'
  | 'cool'
  | 'film-soft'
  | 'film-contrast'
  | 'cinematic'
  | 'fade'
  | 'mono'

export interface LumaColorProcessingParams {
  intensity: number
  viewMode: 'processed' | 'original' | 'compare'
  compareSplit: number
  styleKind: 'none' | 'builtin' | 'custom'
  builtinPreset: BuiltinStylePreset | null
}

export type ProcessingParams = LumaColorProcessingParams

export type LUTInputProfile = 'display-srgb' | 'v-log'

export type LUTProfileResolution =
  | {
      kind: 'resolved'
      profile: LUTColorProfile
      confidence: 'metadata' | 'user' | 'persisted-user'
    }
  | {
      kind: 'needs-user-selection'
      suggestions: LUTColorProfile[]
      reason?: 'unsupported-output'
    }

export interface LumaColorLUTData {
  size: number
  data: Float32Array
  domainMin: [number, number, number]
  domainMax: [number, number, number]
  title?: string
  inputProfile: LUTInputProfile
  profileResolution: LUTProfileResolution
}

export type LUTData = LumaColorLUTData

export interface LUTContractSelection {
  inputProfile?: string
  role: LUTColorProfile['role']
  inputGamut?: ColorGamutId
  inputTransfer?: TransferFunctionId
  inputRange?: SignalRange
  outputGamut?: ColorGamutId
  outputTransfer?: TransferFunctionId
  outputRange?: SignalRange
}

export interface StoredLUTContractSelection {
  inputProfile?: string
  role: LUTColorProfile['role']
  inputGamut: ColorGamutId
  inputTransfer: TransferFunctionId
  inputRange: SignalRange
  outputGamut?: ColorGamutId
  outputTransfer?: TransferFunctionId
  outputRange?: SignalRange
}
```

- [ ] **Step 2: Export package types**

Append to `packages/luma-color-runtime/src/index.ts`:

```ts
export * from './types'
```

- [ ] **Step 3: Make `src/lib/gl/pipeline.ts` re-export package types**

In `src/lib/gl/pipeline.ts`, replace local definitions of
`ProcessingParams`, `BuiltinStylePreset`, `LUTInputProfile`,
`LUTProfileResolution`, and `LUTData` with imports and re-exports:

```ts
import type {
  BuiltinStylePreset,
  LUTData,
  LUTInputProfile,
  LUTProfileResolution,
  ProcessingParams,
} from '@lumaforge/luma-color-runtime'

export type {
  BuiltinStylePreset,
  LUTData,
  LUTInputProfile,
  LUTProfileResolution,
  ProcessingParams,
} from '@lumaforge/luma-color-runtime'
```

Keep `PipelineStats`, `RawUploadInput`, `RenderOptions`,
`RawProcessingPipeline`, WebGL resource state, texture upload, and preview render
logic in `src/lib/gl/pipeline.ts`.

- [ ] **Step 4: Switch pure type imports away from `~/lib/gl/pipeline`**

Update files that only need LUT/color types to import from the package:

```ts
import type {
  LUTData,
  LUTInputProfile,
  LUTProfileResolution,
  ProcessingParams,
} from '@lumaforge/luma-color-runtime'
```

Keep imports from `~/lib/gl/pipeline` only for `RawProcessingPipeline`,
`PipelineStats`, and other WebGL-owned runtime types.

Use this search to drive the replacement:

```bash
rg -n "LUTData|LUTInputProfile|LUTProfileResolution|ProcessingParams" \
  src/lib src/modules src/atoms \
  -g '*.ts' -g '*.tsx'
```

- [ ] **Step 5: Verify type migration**

Run:

```bash
pnpm test:run \
  src/lib/lut/cube-parser.test.ts \
  src/lib/lut/profile-resolution.test.ts \
  src/lib/gl/pipeline-profile.test.ts \
  src/lib/gl/pipeline.test.ts \
  src/modules/raw-processor/__tests__/session-derive.test.ts \
  --exclude '.worktrees/**'
```

Expected: all tests pass.

- [ ] **Step 6: Verify `pipeline.ts` no longer owns LUT data/profile types**

Run:

```bash
rg -n "export (type|interface) (ProcessingParams|BuiltinStylePreset|LUTInputProfile|LUTProfileResolution|LUTData)" src/lib/gl/pipeline.ts
```

Expected: no output.

- [ ] **Step 7: Commit type extraction**

```bash
git add packages/luma-color-runtime/src/types.ts packages/luma-color-runtime/src/index.ts src
git commit --no-gpg-sign -m "refactor: move LUT contract types into color runtime"
```

---

## Task 4: Move Color Graph, LUT Sampler, And CPU Row-Band Processor

**Files:**

- Move: `src/lib/export/color-graph.ts` to `packages/luma-color-runtime/src/color-graph.ts`
- Move: `src/lib/export/color-graph.test.ts` to `packages/luma-color-runtime/src/color-graph.test.ts`
- Move: `src/lib/export/lut3d.ts` to `packages/luma-color-runtime/src/lut3d.ts`
- Move: `src/lib/export/lut3d.test.ts` to `packages/luma-color-runtime/src/lut3d.test.ts`
- Move: `src/lib/export/row-band-processor.ts` to `packages/luma-color-runtime/src/row-band-processor.ts`
- Move: `src/lib/export/row-band-processor.test.ts` to `packages/luma-color-runtime/src/row-band-processor.test.ts`
- Modify: `packages/luma-color-runtime/src/index.ts`
- Recreate temporary shims:
  - `src/lib/export/color-graph.ts`
  - `src/lib/export/lut3d.ts`
  - `src/lib/export/row-band-processor.ts`
- Modify: `src/lib/export/full-res-export.ts`
- Modify: `src/lib/export/full-res-export-client.ts`
- Modify: `src/modules/raw-processor/services/export-system.ts`
- Modify: `src/modules/raw-processor/model/derive-session.ts`

- [ ] **Step 1: Move export graph sources and tests**

Run:

```bash
git mv src/lib/export/color-graph.ts packages/luma-color-runtime/src/color-graph.ts
git mv src/lib/export/color-graph.test.ts packages/luma-color-runtime/src/color-graph.test.ts
git mv src/lib/export/lut3d.ts packages/luma-color-runtime/src/lut3d.ts
git mv src/lib/export/lut3d.test.ts packages/luma-color-runtime/src/lut3d.test.ts
git mv src/lib/export/row-band-processor.ts packages/luma-color-runtime/src/row-band-processor.ts
git mv src/lib/export/row-band-processor.test.ts packages/luma-color-runtime/src/row-band-processor.test.ts
```

- [ ] **Step 2: Update moved package imports**

In `packages/luma-color-runtime/src/color-graph.ts`, replace app imports with
package-local imports:

```ts
import type { ColorGamutId } from './constants'
import type { TransferFunctionId } from './log-encoding'
import type { Mat3 } from './matrix'
import {
  getLinearProPhotoToGamutMatrix,
  getLUTOutputToTargetMatrix,
  mat3Identity,
} from './matrix'
import type { RawRenderExposure } from './raw-render-exposure'
import type { LUTColorProfile, LUTRole, SignalRange } from './registry'
import type { LUTData, ProcessingParams } from './types'
```

Rename the descriptor and resolver for the package API, while preserving export
aliases used by existing app tests:

```ts
export type ColorGraphStep = ExportColorGraphStep
export type ColorGraph = ExportColorGraphDescriptor
export type SupportedColorGraph = SupportedExportColorGraphDescriptor

export type ResolveColorGraphInput = {
  styleKind: ProcessingParams['styleKind']
  intensity: number
  builtinPreset: ProcessingParams['builtinPreset']
  lut: LUTData | null
  rawRenderExposure?: RawRenderExposure
}

export function resolveColorGraph(input: ResolveColorGraphInput): ColorGraph {
  return resolveExportColorGraph(input)
}
```

If the file currently defines `resolveExportColorGraph` directly, keep it and
add `resolveColorGraph` as a wrapper in this task. Rename internals in a later
cleanup only if all tests stay green.

In `packages/luma-color-runtime/src/row-band-processor.ts`, replace app imports:

```ts
import { getProPhotoToTargetMatrix } from './matrix'
import { getTransferFunction } from './registry'

import type { SupportedExportColorGraphDescriptor } from './color-graph'
import { mix, sampleLutTrilinear } from './lut3d'
```

- [ ] **Step 3: Export moved graph and CPU modules**

Append to `packages/luma-color-runtime/src/index.ts`:

```ts
export * from './color-graph'
export * from './lut3d'
export * from './row-band-processor'
```

- [ ] **Step 4: Recreate app-local shims**

Create `src/lib/export/color-graph.ts`:

```ts
export {
  resolveColorGraph,
  resolveExportColorGraph,
  resolveUnsupportedLUTOutputReason,
} from '@lumaforge/luma-color-runtime'
export type {
  ColorGraph,
  ColorGraphStep,
  ExportColorGraphDescriptor,
  ExportColorGraphStep,
  SupportedColorGraph,
  SupportedExportColorGraphDescriptor,
} from '@lumaforge/luma-color-runtime'
```

Create `src/lib/export/lut3d.ts`:

```ts
export {
  clamp01,
  mix,
  read,
  sampleLutTrilinear,
} from '@lumaforge/luma-color-runtime'
```

Create `src/lib/export/row-band-processor.ts`:

```ts
export { createRowBandProcessor } from '@lumaforge/luma-color-runtime'
export type {
  CreateRowBandProcessorInput,
  RowBandProcessor,
} from '@lumaforge/luma-color-runtime'
```

- [ ] **Step 5: Switch export call sites to direct package imports**

In `src/lib/export/full-res-export.ts`, replace local graph and row-band imports
with:

```ts
import type {
  ExportColorGraphDescriptor,
  SupportedExportColorGraphDescriptor,
} from '@lumaforge/luma-color-runtime'
import { createRowBandProcessor } from '@lumaforge/luma-color-runtime'
```

In `src/lib/export/full-res-export-client.ts`,
`src/modules/raw-processor/services/export-system.ts`, and
`src/modules/raw-processor/model/derive-session.ts`, import graph types and
helpers from `@lumaforge/luma-color-runtime`.

- [ ] **Step 6: Verify moved graph and row-band tests**

Run:

```bash
pnpm test:run \
  packages/luma-color-runtime/src/color-graph.test.ts \
  packages/luma-color-runtime/src/lut3d.test.ts \
  packages/luma-color-runtime/src/row-band-processor.test.ts \
  packages/luma-color-runtime/src/package-boundary.test.ts \
  src/lib/export/full-res-export.test.ts \
  src/lib/export/full-res-export-client.test.ts \
  src/modules/raw-processor/__tests__/export-system.test.ts \
  --exclude '.worktrees/**'
```

Expected: all tests pass.

- [ ] **Step 7: Commit graph and CPU extraction**

```bash
git add packages/luma-color-runtime/src src/lib/export src/modules/raw-processor
git commit --no-gpg-sign -m "refactor: move export color graph into color runtime"
```

---

## Task 5: Extract Generic LUT Contract Validation

**Files:**

- Create: `packages/luma-color-runtime/src/lut-contract.ts`
- Create: `packages/luma-color-runtime/src/lut-contract.test.ts`
- Modify: `packages/luma-color-runtime/src/index.ts`
- Modify: `src/lib/lut/profile-resolution.ts`
- Modify: `src/lib/lut/profile-resolution.test.ts`
- Modify: `src/lib/profiles/lut-contract.ts`
- Modify: `src/lib/profiles/lut-contract.test.ts`

- [ ] **Step 1: Add package LUT contract tests**

Create `packages/luma-color-runtime/src/lut-contract.test.ts` with these cases:

```ts
import {
  buildStoredContractSelection,
  contractToLUTColorProfile,
  hasCompleteOutputContract,
  hasDisplayLikeInput,
  isLUTRole,
  isSignalRange,
  mapProfileLUTContract,
  resolveColorGamutId,
  resolveTransferFunctionId,
  toLUTContractSelection,
} from './lut-contract'

describe('LUT contract validation', () => {
  it('normalizes legacy gamut and transfer aliases', () => {
    expect(resolveColorGamutId('S-Gamut3.Cine')).toBe('s-gamut3-cine')
    expect(resolveTransferFunctionId('S-Log3')).toBe('s-log3')
  })

  it('validates role and signal range values', () => {
    expect(isLUTRole('combined-look-output')).toBe(true)
    expect(isLUTRole('monitoring')).toBe(false)
    expect(isSignalRange('legal')).toBe(true)
    expect(isSignalRange('narrow')).toBe(false)
  })

  it('allows display-look only for display-like input', () => {
    expect(
      hasDisplayLikeInput({
        inputGamut: 'srgb-rec709',
        inputTransfer: 'gamma24',
      }),
    ).toBe(true)

    expect(
      hasDisplayLikeInput({
        inputGamut: 'v-gamut',
        inputTransfer: 'v-log',
      }),
    ).toBe(false)
  })

  it('requires complete output contracts for non-display roles', () => {
    expect(
      hasCompleteOutputContract({
        outputGamut: 'srgb-rec709',
        outputTransfer: 'bt709',
        outputRange: 'full',
      }),
    ).toBe(true)

    expect(
      buildStoredContractSelection({
        role: 'scene-creative',
        inputGamut: 'v-gamut',
        inputTransfer: 'v-log',
        inputRange: 'full',
      }),
    ).toBeUndefined()
  })

  it('builds a persistable explicit combined-output contract', () => {
    expect(
      buildStoredContractSelection({
        role: 'combined-look-output',
        inputGamut: 'v-gamut',
        inputTransfer: 'v-log',
        inputRange: 'full',
        outputGamut: 'srgb-rec709',
        outputTransfer: 'bt709',
        outputRange: 'legal',
      }),
    ).toMatchObject({
      role: 'combined-look-output',
      inputGamut: 'v-gamut',
      inputTransfer: 'v-log',
      outputGamut: 'srgb-rec709',
      outputTransfer: 'bt709',
      outputRange: 'legal',
    })
  })

  it('converts a stored contract into a LUT color profile', () => {
    const profile = contractToLUTColorProfile('fingerprint-1', {
      role: 'display-look',
      inputGamut: 'srgb-rec709',
      inputTransfer: 'srgb',
      inputRange: 'full',
    })

    expect(profile).toMatchObject({
      id: 'fingerprint-1',
      role: 'display-look',
      inputGamut: 'srgb-rec709',
      inputTransfer: 'srgb',
    })
  })

  it('round-trips resolved profiles into editable contract selections', () => {
    expect(
      toLUTContractSelection({
        id: 'custom',
        label: 'Custom',
        aliases: [],
        role: 'display-look',
        inputGamut: 'srgb-rec709',
        inputTransfer: 'srgb',
        inputRange: 'full',
      }),
    ).toMatchObject({
      role: 'display-look',
      inputGamut: 'srgb-rec709',
      inputTransfer: 'srgb',
    })
  })

  it('maps trusted online metadata without filename or comment authority', () => {
    const result = mapProfileLUTContract({
      intent: 'combined-look-output',
      input: { gamut: 'S-Gamut3.Cine', transfer: 'S-Log3', range: 'full' },
      output: { gamut: 'Rec.709', transfer: 'Gamma 2.4', range: 'legal' },
    })

    expect(result).toMatchObject({
      ok: true,
      value: {
        role: 'combined-look-output',
        inputGamut: 's-gamut3-cine',
        inputTransfer: 's-log3',
        outputGamut: 'srgb-rec709',
        outputTransfer: 'gamma24',
        outputRange: 'legal',
      },
    })
  })
})
```

- [ ] **Step 2: Move pure helpers from app modules into package**

Create `packages/luma-color-runtime/src/lut-contract.ts` by moving these pure
helpers out of `src/lib/lut/profile-resolution.ts` and
`src/lib/profiles/lut-contract.ts`:

```ts
export function isSignalRange(value: unknown): value is SignalRange
export function isLUTRole(value: unknown): value is LUTRole
export function resolveColorGamutId(value: unknown): ColorGamutId | undefined
export function resolveTransferFunctionId(
  value: unknown,
): TransferFunctionId | undefined
export function hasDisplayLikeInput(selection: {
  inputGamut?: ColorGamutId
  inputTransfer?: TransferFunctionId
}): boolean
export function hasCompleteOutputContract(selection: {
  outputGamut?: ColorGamutId
  outputTransfer?: TransferFunctionId
  outputRange?: SignalRange
}): boolean
export function buildStoredContractSelection(
  selection: LUTContractSelection,
): StoredLUTContractSelection | undefined
export function toLUTContractSelection(
  profile: LUTColorProfile,
): LUTContractSelection
export function contractToLUTColorProfile(
  id: string,
  contract: StoredLUTContractSelection,
): LUTColorProfile
export function mapProfileLUTContract(
  lut: unknown,
): OnlineProfileResult<LUTContractSelection>
```

Also move these small structural result types from `src/lib/profiles/catalog.ts`
only if importing them from the app would violate the package boundary:

```ts
export interface LUTContractIssue {
  code: 'unsupported-contract'
  message: string
}

export type LUTContractResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: LUTContractIssue[] }
```

Use package-local imports only:

```ts
import type { ColorGamutId } from './constants'
import type { TransferFunctionId } from './log-encoding'
import type { LUTColorProfile, LUTRole, SignalRange } from './registry'
import {
  getColorGamut,
  getLUTColorProfile,
  getTransferFunction,
} from './registry'
import type { LUTContractSelection, StoredLUTContractSelection } from './types'
```

- [ ] **Step 3: Export contract helpers**

Append to `packages/luma-color-runtime/src/index.ts`:

```ts
export * from './lut-contract'
```

- [ ] **Step 4: Keep app storage and source decisions app-local**

In `src/lib/lut/profile-resolution.ts`, import the moved pure helpers:

```ts
import {
  buildStoredContractSelection,
  contractToLUTColorProfile,
  isSignalRange,
  toLUTContractSelection,
} from '@lumaforge/luma-color-runtime'
import type {
  LUTContractSelection,
  StoredLUTContractSelection,
} from '@lumaforge/luma-color-runtime'
```

Keep these functions in `src/lib/lut/profile-resolution.ts` because they own
browser storage or manual/profile-source policy:

```ts
export function getStoredLUTContractSelection(
  fingerprint: string,
): StoredLUTContractSelection | undefined

export function getStoredLUTProfileSelection(
  fingerprint: string,
): LUTColorProfile | undefined

export function storeLUTContractSelection(
  fingerprint: string,
  selection: LUTContractSelection,
): LUTColorProfile | undefined

export function storeLUTProfileSelection(
  fingerprint: string,
  profileId: string,
): LUTColorProfile | undefined

export function applyLUTContractSelection(
  lut: ParsedLUT,
  selection: LUTContractSelection,
): ParsedLUT | undefined

export function applyLUTProfileSelection(
  lut: ParsedLUT,
  profileId: string,
): ParsedLUT | undefined

export function resolveLUTProfile(input: {
  title: string
  sourceName?: string
  comments: string[]
  fingerprint?: string
}): LUTProfileResolution

export function toCompatInputProfile(
  profileResolution: LUTProfileResolution,
): LUTInputProfile

export function inferLUTInputProfile(input: {
  content: string
  sourceName?: string
  title?: string
}): LUTInputProfile
```

In `src/lib/profiles/lut-contract.ts`, replace the local mapper body with:

```ts
export { mapProfileLUTContract } from '@lumaforge/luma-color-runtime'
export type {
  LUTContractIssue as OnlineProfileIssue,
  LUTContractResult as OnlineProfileResult,
} from '@lumaforge/luma-color-runtime'
```

If `src/lib/profiles/catalog.ts` already exports `OnlineProfileIssue` and
`OnlineProfileResult`, keep those exports there and map the package result into
the existing app result type without changing public app imports.

- [ ] **Step 5: Verify contract tests**

Run:

```bash
pnpm test:run \
  packages/luma-color-runtime/src/lut-contract.test.ts \
  src/lib/lut/profile-resolution.test.ts \
  src/lib/profiles/lut-contract.test.ts \
  src/lib/profiles/catalog.test.ts \
  --exclude '.worktrees/**'
```

Expected: package and app adapter tests pass.

- [ ] **Step 6: Verify package boundary after contract extraction**

Run:

```bash
pnpm test:run packages/luma-color-runtime/src/package-boundary.test.ts --exclude '.worktrees/**'
```

Expected: package imports do not include `~/`, React, raw runtime, or JPEG
runtime.

- [ ] **Step 7: Commit contract extraction**

```bash
git add packages/luma-color-runtime/src src/lib/lut src/lib/profiles
git commit --no-gpg-sign -m "refactor: extract LUT contract validation"
```

---

## Task 6: Extract GLSL Uniforms And Snippets

**Files:**

- Modify: `packages/luma-color-runtime/src/glsl.ts`
- Create: `packages/luma-color-runtime/src/glsl.test.ts`
- Modify: `src/lib/gl/pipeline.ts`
- Modify: `src/lib/gl/shaders.ts`
- Modify: `src/lib/gl/shaders.test.ts`
- Modify: `src/lib/gl/pipeline-profile.test.ts`
- Modify: `src/lib/gl/pipeline-export.test.ts`

- [ ] **Step 1: Add package GLSL parity tests**

Create `packages/luma-color-runtime/src/glsl.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { TRANSFER_FUNCTIONS } from './log-encoding'
import type { LUTRole, SignalRange } from './registry'
import {
  LUMA_COLOR_LUT_GLSL,
  LUMA_COLOR_RANGE_GLSL,
  LUMA_COLOR_TRANSFER_GLSL,
  LUT_RANGE_UNIFORMS,
  LUT_ROLE_UNIFORMS,
  LUT_TRANSFER_UNIFORMS,
} from './glsl'

const roles: LUTRole[] = [
  'display-look',
  'scene-creative',
  'combined-look-output',
  'technical-output',
]
const ranges: SignalRange[] = ['full', 'legal', 'unknown']

describe('GLSL color contract surface', () => {
  it('exports a transfer uniform for every transfer function', () => {
    expect(Object.keys(LUT_TRANSFER_UNIFORMS).sort()).toEqual(
      Object.keys(TRANSFER_FUNCTIONS).sort(),
    )
  })

  it('declares every transfer uniform inside the GLSL snippet', () => {
    for (const [transfer, value] of Object.entries(LUT_TRANSFER_UNIFORMS)) {
      const token = transfer.toUpperCase().replace(/-/g, '_')
      expect(LUMA_COLOR_TRANSFER_GLSL).toContain(
        `const int TRANSFER_${token} = ${value};`,
      )
    }
  })

  it('declares every role and range uniform inside GLSL snippets', () => {
    for (const role of roles) {
      expect(LUT_ROLE_UNIFORMS[role]).toEqual(expect.any(Number))
    }
    for (const range of ranges) {
      expect(LUT_RANGE_UNIFORMS[range]).toEqual(expect.any(Number))
    }

    expect(LUMA_COLOR_RANGE_GLSL).toContain('applySignalRangeForLutInput')
    expect(LUMA_COLOR_RANGE_GLSL).toContain('removeSignalRangeFromLutOutput')
    expect(LUMA_COLOR_LUT_GLSL).toContain('applyLut')
    expect(LUMA_COLOR_LUT_GLSL).toContain('u_lutRole')
  })
})
```

- [ ] **Step 2: Move uniform maps to the package GLSL export**

In `packages/luma-color-runtime/src/glsl.ts`, define the existing numeric
contract from `src/lib/gl/pipeline.ts` and `src/lib/gl/shaders.ts`:

```ts
import type { TransferFunctionId } from './log-encoding'
import type { LUTRole, SignalRange } from './registry'

export const LUT_ROLE_UNIFORMS: Record<LUTRole, number> = {
  'display-look': 0,
  'scene-creative': 1,
  'combined-look-output': 2,
  'technical-output': 3,
}

export const LUT_RANGE_UNIFORMS: Record<SignalRange, number> = {
  full: 0,
  legal: 1,
  unknown: 2,
}

export const LUT_TRANSFER_UNIFORMS: Record<TransferFunctionId, number> = {
  srgb: 0,
  bt709: 1,
  gamma24: 2,
  's-log2': 3,
  's-log3': 4,
  'canon-log': 5,
  'canon-log2': 6,
  'canon-log3': 7,
  'n-log': 8,
  'f-log': 9,
  'f-log2': 10,
  'f-log2c': 11,
  'v-log': 12,
  logc3: 13,
  logc4: 14,
  log3g10: 15,
  acescc: 16,
  acescct: 17,
  'l-log': 18,
  linear: 19,
}
```

Then move the GLSL code that defines transfer constants, transfer encode/decode
functions, signal range helpers, LUT sampling helpers, and LUT role dispatch
from `src/lib/gl/shaders.ts` into exported string constants with these names:

```ts
export const LUMA_COLOR_TRANSFER_GLSL: string
export const LUMA_COLOR_RANGE_GLSL: string
export const LUMA_COLOR_LUT_GLSL: string
```

Keep view mode constants, style constants, built-in style functions, input
texture reads, framebuffer output, compare/original view behavior, and full
shader assembly in `src/lib/gl/shaders.ts`.

- [ ] **Step 3: Import package GLSL in app shaders**

In `src/lib/gl/shaders.ts`, add:

```ts
import {
  LUMA_COLOR_LUT_GLSL,
  LUMA_COLOR_RANGE_GLSL,
  LUMA_COLOR_TRANSFER_GLSL,
} from '@lumaforge/luma-color-runtime/glsl'
```

Compose the process fragment body so the package snippets are inserted after
the app-owned view/style constants and before built-in style functions:

```ts
const PROCESS_FRAGMENT_SHADER_BODY = /* glsl */ `
const int VIEW_MODE_PROCESSED = 0;
const int VIEW_MODE_ORIGINAL = 1;
const int VIEW_MODE_COMPARE = 2;
const int STYLE_NONE = 0;
const int STYLE_BUILTIN = 1;
const int STYLE_CUSTOM = 2;

${LUMA_COLOR_TRANSFER_GLSL}
${LUMA_COLOR_RANGE_GLSL}
${LUMA_COLOR_LUT_GLSL}
`
```

- [ ] **Step 4: Import uniform maps in pipeline and tests**

In `src/lib/gl/pipeline.ts`, remove local `LUT_ROLE_UNIFORMS`,
`LUT_RANGE_UNIFORMS`, and `LUT_TRANSFER_UNIFORMS` definitions and import them:

```ts
import {
  LUT_RANGE_UNIFORMS,
  LUT_ROLE_UNIFORMS,
  LUT_TRANSFER_UNIFORMS,
} from '@lumaforge/luma-color-runtime/glsl'

export {
  LUT_RANGE_UNIFORMS,
  LUT_ROLE_UNIFORMS,
  LUT_TRANSFER_UNIFORMS,
} from '@lumaforge/luma-color-runtime/glsl'
```

Update tests that import uniform maps from `./pipeline` only if they can import
from `@lumaforge/luma-color-runtime/glsl` without losing coverage.

- [ ] **Step 5: Verify shader and uniform parity**

Run:

```bash
pnpm test:run \
  packages/luma-color-runtime/src/glsl.test.ts \
  src/lib/gl/shaders.test.ts \
  src/lib/gl/pipeline-profile.test.ts \
  src/lib/gl/pipeline-export.test.ts \
  --exclude '.worktrees/**'
```

Expected: package GLSL parity tests and app shader tests pass.

- [ ] **Step 6: Commit GLSL extraction**

```bash
git add packages/luma-color-runtime/src/glsl.ts packages/luma-color-runtime/src/glsl.test.ts src/lib/gl
git commit --no-gpg-sign -m "refactor: share color GLSL contract from runtime package"
```

---

## Task 7: Switch App Imports To Package And Retire Shims

**Files:**

- Modify: all `src/**/*.ts` and `src/**/*.tsx` files that import migrated color runtime APIs through `~/lib/color/*`, `~/lib/export/color-graph`, `~/lib/export/lut3d`, or `~/lib/export/row-band-processor`.
- Delete when unused:
  - `src/lib/color/constants.ts`
  - `src/lib/color/log-encoding.ts`
  - `src/lib/color/matrix.ts`
  - `src/lib/color/registry.ts`
  - `src/lib/color/raw-render-exposure.ts`
  - `src/lib/color/index.ts`
  - `src/lib/export/color-graph.ts`
  - `src/lib/export/lut3d.ts`
  - `src/lib/export/row-band-processor.ts`

- [ ] **Step 1: Replace color primitive imports**

Use:

```bash
rg -n "from ['\"]~/lib/color" src -g '*.ts' -g '*.tsx'
```

Replace value and type imports with:

```ts
import {
  getColorGamut,
  getLUTColorProfile,
  getTransferFunction,
  searchLUTColorProfiles,
} from '@lumaforge/luma-color-runtime'
import type {
  ColorGamutId,
  LUTColorProfile,
  RawRenderExposure,
  SignalRange,
  TransferFunctionId,
} from '@lumaforge/luma-color-runtime'
```

Keep imported symbol lists minimal in each file.

- [ ] **Step 2: Replace export graph and row-band imports**

Use:

```bash
rg -n "from ['\"]~/lib/export/(color-graph|lut3d|row-band-processor)" src -g '*.ts' -g '*.tsx'
```

Replace those imports with:

```ts
import {
  createRowBandProcessor,
  resolveExportColorGraph,
  resolveUnsupportedLUTOutputReason,
} from '@lumaforge/luma-color-runtime'
import type {
  ExportColorGraphDescriptor,
  SupportedExportColorGraphDescriptor,
} from '@lumaforge/luma-color-runtime'
```

- [ ] **Step 3: Replace LUT/profile type imports from WebGL pipeline**

Use:

```bash
rg -n "from ['\"]~/lib/gl/pipeline['\"]" src -g '*.ts' -g '*.tsx'
```

For imports that only need package-owned types, switch to:

```ts
import type {
  LUTData,
  LUTInputProfile,
  LUTProfileResolution,
  ProcessingParams,
} from '@lumaforge/luma-color-runtime'
```

Keep `~/lib/gl/pipeline` imports for WebGL runtime classes and stats:

```ts
import type { PipelineStats, RawProcessingPipeline } from '~/lib/gl/pipeline'
```

- [ ] **Step 4: Delete obsolete shims after import search is clean**

Run:

```bash
rg -n "from ['\"]~/lib/color|from ['\"]~/lib/export/(color-graph|lut3d|row-band-processor)" src -g '*.ts' -g '*.tsx'
```

Expected: no output.

Then delete:

```bash
git rm src/lib/color/constants.ts
git rm src/lib/color/log-encoding.ts
git rm src/lib/color/matrix.ts
git rm src/lib/color/registry.ts
git rm src/lib/color/raw-render-exposure.ts
git rm src/lib/color/index.ts
git rm src/lib/export/color-graph.ts
git rm src/lib/export/lut3d.ts
git rm src/lib/export/row-band-processor.ts
```

- [ ] **Step 5: Verify import boundary**

Run:

```bash
rg -n "from ['\"]~/lib/color|from ['\"]~/lib/export/(color-graph|lut3d|row-band-processor)" src -g '*.ts' -g '*.tsx'
rg -n "from ['\"]~/lib/gl/pipeline['\"]" src -g '*.ts' -g '*.tsx'
```

Expected:

- first command has no output;
- second command only lists files that use WebGL-owned runtime APIs such as
  `RawProcessingPipeline`, `PipelineStats`, or `RawUploadInput`.

- [ ] **Step 6: Run integration tests after shim removal**

Run:

```bash
pnpm test:run \
  packages/luma-color-runtime/src \
  src/lib/gl/pipeline.test.ts \
  src/lib/gl/pipeline-profile.test.ts \
  src/lib/gl/pipeline-export.test.ts \
  src/lib/gl/shaders.test.ts \
  src/lib/export/full-res-export.test.ts \
  src/lib/export/full-res-export-client.test.ts \
  src/lib/export/full-res-export.worker.test.ts \
  src/lib/lut/cube-parser.test.ts \
  src/lib/lut/profile-resolution.test.ts \
  src/lib/profiles/lut-contract.test.ts \
  src/modules/raw-processor/__tests__/export-system.test.ts \
  src/modules/raw-processor/__tests__/session-derive.test.ts \
  --exclude '.worktrees/**'
```

Expected: all targeted package and app tests pass.

- [ ] **Step 7: Commit app import migration**

```bash
git add packages/luma-color-runtime src
git commit --no-gpg-sign -m "refactor: consume color runtime package from app"
```

---

## Task 8: Final Build, Docs, And Acceptance Verification

**Files:**

- Modify: `docs/specs/2026-04-22-phase1-test-matrix.md` only if final verification adds a durable package-boundary check row.
- Verify: `docs/specs/2026-04-30-luma-color-runtime-package-design.md`
- Verify: `docs/plans/2026-04-30-luma-color-runtime-package-implementation-plan.md`

- [ ] **Step 1: Verify package build and typecheck**

Run:

```bash
pnpm --filter @lumaforge/luma-color-runtime typecheck
pnpm --filter @lumaforge/luma-color-runtime build
```

Expected: both commands pass and emit ESM/declaration files under
`packages/luma-color-runtime/dist`.

- [ ] **Step 2: Verify package boundary**

Run:

```bash
pnpm test:run packages/luma-color-runtime/src/package-boundary.test.ts --exclude '.worktrees/**'
```

Expected: the test passes with no forbidden package imports.

- [ ] **Step 3: Verify focused color, preview, export, and profile tests**

Run:

```bash
pnpm test:run \
  packages/luma-color-runtime/src \
  src/lib/gl/pipeline.test.ts \
  src/lib/gl/pipeline-profile.test.ts \
  src/lib/gl/pipeline-export.test.ts \
  src/lib/gl/shaders.test.ts \
  src/lib/export/full-res-export.test.ts \
  src/lib/export/full-res-export-client.test.ts \
  src/lib/export/full-res-export.worker.test.ts \
  src/lib/export/full-res-export.real.test.ts \
  src/lib/lut/cube-parser.test.ts \
  src/lib/lut/profile-resolution.test.ts \
  src/lib/profiles/catalog.test.ts \
  src/lib/profiles/lut-contract.test.ts \
  src/modules/raw-processor/hooks/useRawProcessor.test.tsx \
  src/modules/raw-processor/__tests__/export-system.test.ts \
  src/modules/raw-processor/__tests__/session-derive.test.ts \
  --exclude '.worktrees/**'
```

Expected: all targeted tests pass. If `full-res-export.real.test.ts` needs
local runtime artifacts, build the existing runtime artifacts first:

```bash
pnpm --filter @lumaforge/luma-raw-runtime build:native
pnpm --filter @lumaforge/luma-raw-runtime build
pnpm --filter @lumaforge/luma-jpeg-runtime build:native
pnpm --filter @lumaforge/luma-jpeg-runtime build
```

Then rerun the focused test command.

- [ ] **Step 4: Verify root build**

Run:

```bash
pnpm build
```

Expected: Vite root build passes. If it fails because existing native runtime
assets are missing, build the current raw and JPEG runtime assets with the
commands shown in Step 3 and rerun `pnpm build`.

- [ ] **Step 5: Verify no migrated import paths remain**

Run:

```bash
rg -n "from ['\"]~/lib/color|from ['\"]~/lib/export/(color-graph|lut3d|row-band-processor)" src -g '*.ts' -g '*.tsx'
rg -n "@lumaforge/luma-color-runtime.*(react|raw-runtime|jpeg-runtime)|from ['\"]~/" packages/luma-color-runtime/src -g '*.ts'
```

Expected: both commands have no output.

- [ ] **Step 6: Verify formatting of new docs and package sources**

Run:

```bash
pnpm exec prettier --check \
  docs/specs/2026-04-30-luma-color-runtime-package-design.md \
  docs/plans/2026-04-30-luma-color-runtime-package-implementation-plan.md \
  "packages/luma-color-runtime/src/**/*.ts" \
  packages/luma-color-runtime/package.json \
  packages/luma-color-runtime/tsconfig.json \
  packages/luma-color-runtime/vite.config.ts
```

Expected: Prettier reports all checked files use the configured style.

- [ ] **Step 7: Record acceptance evidence**

Update the implementation PR description or final handoff with these concrete
results:

```text
pnpm --filter @lumaforge/luma-color-runtime typecheck
pnpm --filter @lumaforge/luma-color-runtime build
pnpm test:run packages/luma-color-runtime/src src/lib/gl/pipeline.test.ts src/lib/gl/pipeline-profile.test.ts src/lib/gl/pipeline-export.test.ts src/lib/gl/shaders.test.ts src/lib/export/full-res-export.test.ts src/lib/lut/profile-resolution.test.ts src/lib/profiles/lut-contract.test.ts --exclude '.worktrees/**'
pnpm build
```

Only add a row to `docs/specs/2026-04-22-phase1-test-matrix.md` if the project
needs a durable release checklist entry for the package boundary test.

- [ ] **Step 8: Final commit**

If Step 7 added a doc row:

```bash
git add docs/specs/2026-04-22-phase1-test-matrix.md
git commit --no-gpg-sign -m "docs: record color runtime verification"
```

If no doc row was needed, do not create an empty commit.

---

## Acceptance Criteria

- `@lumaforge/luma-color-runtime` exists as a private workspace package with
  root, `./glsl`, and `./testing` exports.
- The package builds ESM and declaration output without native or Wasm artifacts.
- The package boundary test proves it does not import app `src/*`, React, RAW
  runtime, JPEG runtime, DOM runtime objects, workers, storage, or WebGL context
  factories.
- Color gamut, transfer, matrix, registry, raw render exposure, LUT contract,
  color graph, GLSL enum/snippet, LUT sampler, and CPU row-band logic are
  package-owned.
- Preview and export consume package-owned role, range, transfer, and LUT graph
  contracts.
- `src/lib/gl/pipeline.ts` no longer owns LUT data/profile/processing types; it
  owns WebGL runtime state and rendering only.
- `src/lib/lut/profile-resolution.ts` owns manual and persisted selection flow,
  but generic validation lives in the package.
- `src/lib/profiles/lut-contract.ts` keeps online source mapping app-local while
  delegating generic contract validation to the package.
- No app code imports migrated color runtime APIs through `~/lib/color/*`,
  `~/lib/export/color-graph`, `~/lib/export/lut3d`, or
  `~/lib/export/row-band-processor`.
- Current behavior is preserved for no-LUT export, display-look LUTs,
  scene-creative LUTs with complete output contracts, combined output LUTs,
  unsupported built-in full-resolution export, and unresolved LUT fail-closed
  states.
- Focused package, preview, export, LUT parser, profile contract, and RAW Lab
  integration tests pass with `.worktrees` excluded.
- Root `pnpm build` passes after existing raw/JPEG runtime artifacts are
  available.
