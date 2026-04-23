# Luma RAW Runtime Default And LibRaw Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the optimized custom `@lumaforge/luma-raw-runtime` the only app RAW runtime, remove the npm `libraw-wasm` dependency, and preserve benchmark evidence that Luma outperforms the previous app-equivalent legacy flow.

**Architecture:** Keep app RAW consumption behind `src/lib/raw`, but collapse the facade to the Luma runtime path and remove the feature-flagged legacy branch. Shared app RAW types and file-extension helpers remain in `src/lib/raw/decoder.ts` for import stability, while decode work is performed only by `src/lib/raw/luma-runtime-adapter.ts` and `packages/luma-raw-runtime`. The browser benchmark becomes a dependency-free Luma validation harness and uses the recorded V2 notes as the historical legacy baseline.

**Tech Stack:** pnpm workspace, TypeScript 6, Vitest, Vite, React 19, Web Worker, Emscripten Embind, LibRaw native static library, WebGL2

---

## Context

This plan follows the completed optimization plan:

- `docs/plans/2026-04-23-luma-raw-runtime-performance-optimization-plan.md`
- `/tmp/luma-raw-runtime-perf-v2.jsonl`
- `docs/plans/2026-04-23-luma-raw-runtime-benchmark-notes.md`

V2 proved the optimized Luma session runtime is rollout-eligible in the app scenario. This plan performs the separate, now-approved final migration step that V2 explicitly excluded: remove the fallback and the npm `libraw-wasm` dependency.

Do not remove the native LibRaw C++ dependency used by `packages/luma-raw-runtime/native/libraw_wrapper.cpp`. Only remove the npm package named `libraw-wasm` and app/runtime-package code that imports it.

## File Structure Map

- Modify: `src/lib/raw/runtime-adapter.ts`
  Collapse adapter selection to Luma only. Remove `RawRuntimeKind`, `runtimeKindFromEnv`, and legacy decoder imports.

- Modify: `src/lib/raw/runtime-adapter.test.ts`
  Remove env/default legacy assertions. Assert no env flag is required, Luma is used by default, session signal forwarding still works, and stable errors remain.

- Modify: `src/modules/raw-processor/hooks/useCapabilityGate.ts`
  Require cross-origin isolation whenever the API exposes `crossOriginIsolated === false`, because Luma pthread decode is now the only RAW runtime.

- Modify: `src/modules/raw-processor/__tests__/raw-route-shell.test.tsx`
  Update shell wording from feature-flag-specific Luma behavior to default RAW runtime behavior.

- Modify: `src/vite-env.d.ts`
  Remove `VITE_RAW_RUNTIME` typing.

- Modify: `src/lib/raw/decoder.ts`
  Keep shared `DecodedImage`, `ImageMetadata`, `ProgressCallback`, `QUICK_PREVIEW_MAX_PIXELS`, supported extension helpers, and `getFileExtension`; remove all `libraw-wasm` imports and legacy decode functions.

- Modify: `src/lib/raw/decoder.test.ts`
  Replace legacy conversion/libraw option tests with shared helper tests.

- Delete: `src/types/libraw-wasm.d.ts`
  No source file should declare the removed npm module.

- Modify: `package.json`
  Remove root dependency `"libraw-wasm"`.

- Modify: `packages/luma-raw-runtime/package.json`
  Remove devDependency `"libraw-wasm"`.

- Modify: `pnpm-lock.yaml`
  Regenerate after package edits with `pnpm install`.

- Modify: `packages/luma-raw-runtime/benchmarks/bench-runtime.ts`
  Remove live legacy benchmark rows and `libraw-wasm` import. Keep Luma open/embedded/quick/HQ JSONL output with heap/timing fields.

- Modify: `packages/luma-raw-runtime/fixtures/README.md`
  Document the Luma-only live benchmark and the historical V2 legacy comparison notes.

- Modify: `docs/plans/2026-04-23-luma-raw-runtime-benchmark-notes.md`
  Record that the default switch and dependency removal are complete; legacy rows are historical baseline evidence.

- Modify: `docs/specs/2026-04-22-phase1-test-matrix.md`
  Update migration rows to remove `VITE_RAW_RUNTIME` fallback checks.

- Modify: `PLAN.md`
  Track this Phase 3 task as the active long-running memory.

- Modify: `ACCEPTANCE.md`
  Define the stopping bar for Luma-only runtime and `libraw-wasm` removal.

## Task 1: Make The App Runtime Luma-Only

**Files:**
- Modify: `src/lib/raw/runtime-adapter.ts`
- Modify: `src/lib/raw/runtime-adapter.test.ts`
- Modify: `src/modules/raw-processor/hooks/useCapabilityGate.ts`
- Modify: `src/modules/raw-processor/__tests__/raw-route-shell.test.tsx`
- Modify: `src/vite-env.d.ts`

- [ ] **Step 1: Write failing adapter tests for default Luma behavior**

In `src/lib/raw/runtime-adapter.test.ts`, remove the `RawRuntimeKind`, `runtimeKindFromEnv`, `setRawRuntimeEnv`, and `originalRuntimeKind` helpers. Replace tests that mention legacy default/env selection with:

```ts
it('uses the luma runtime by default without an env flag', async () => {
  const { runtime } = makeLumaRuntime()
  const adapter = createRawRuntimeAdapter({
    lumaRuntimeFactory: () => runtime,
  })

  await adapter.decodeQuickRaw(new File(['raw'], 'sample.ARW'))

  expect(runtime.init).toHaveBeenCalledTimes(1)
  expect(runtime.decodeQuick).toHaveBeenCalledTimes(1)
})

it('returns embedded preview bytes from the default luma runtime', async () => {
  const { runtime } = makeLumaRuntime()
  const adapter = createRawRuntimeAdapter({
    lumaRuntimeFactory: () => runtime,
  })

  const preview = await adapter.extractEmbeddedPreview(
    new File(['raw'], 'sample.ARW'),
  )

  expect(preview).toMatchObject({
    width: 1600,
    height: 1067,
    mimeType: 'image/jpeg',
  })
})
```

Also remove every `runtimeKind: 'luma'` option from tests. The injected `lumaRuntimeFactory` alone must select Luma.

- [ ] **Step 2: Run adapter tests and confirm failure**

Run:

```bash
pnpm test:run src/lib/raw/runtime-adapter.test.ts
```

Expected before implementation: TypeScript or runtime failures because `createRawRuntimeAdapter` still expects legacy runtime selection or tests still reference removed env helpers.

- [ ] **Step 3: Collapse `runtime-adapter.ts` to Luma only**

Change `src/lib/raw/runtime-adapter.ts` to this shape:

```ts
import type {
  LumaEmbeddedPreview,
  LumaRawRuntime,
} from '@lumaforge/luma-raw-runtime'

import type { DecodedImage, ProgressCallback } from './decoder'
import {
  decodeHqRawWithLuma,
  decodeQuickRawWithLuma,
  extractEmbeddedPreviewWithLuma,
  openRawSessionWithLuma,
} from './luma-runtime-adapter'

export type RawRuntimeSession = {
  extractEmbeddedPreview: (
    signal?: AbortSignal,
  ) => Promise<LumaEmbeddedPreview | null>
  decodeQuickRaw: (
    onProgress?: ProgressCallback,
    signal?: AbortSignal,
  ) => Promise<DecodedImage>
  decodeHqRaw: (
    onProgress?: ProgressCallback,
    signal?: AbortSignal,
  ) => Promise<DecodedImage>
  dispose: () => void
}

export type RawRuntimeAdapter = {
  openSession: (file: File, signal?: AbortSignal) => Promise<RawRuntimeSession>
  extractEmbeddedPreview: (file: File) => Promise<LumaEmbeddedPreview | null>
  decodeQuickRaw: (
    file: File,
    onProgress?: ProgressCallback,
  ) => Promise<DecodedImage>
  decodeHqRaw: (
    file: File,
    onProgress?: ProgressCallback,
  ) => Promise<DecodedImage>
}

export function createRawRuntimeAdapter({
  lumaRuntimeFactory,
}: {
  lumaRuntimeFactory?: () => LumaRawRuntime
} = {}): RawRuntimeAdapter {
  return {
    openSession(file, signal) {
      return openRawSessionWithLuma(file, lumaRuntimeFactory, signal)
    },
    extractEmbeddedPreview(file) {
      return extractEmbeddedPreviewWithLuma(file, lumaRuntimeFactory)
    },
    decodeQuickRaw(file, onProgress) {
      return decodeQuickRawWithLuma(file, onProgress, lumaRuntimeFactory)
    },
    decodeHqRaw(file, onProgress) {
      return decodeHqRawWithLuma(file, onProgress, lumaRuntimeFactory)
    },
  }
}

export const rawRuntimeAdapter = createRawRuntimeAdapter()
```

- [ ] **Step 4: Make the capability gate match the Luma-only runtime**

Update `src/modules/raw-processor/hooks/useCapabilityGate.ts` by deleting `isLumaRuntimeEnabled()` and changing the cross-origin branch to:

```ts
if (
  typeof globalThis.crossOriginIsolated === 'boolean' &&
  !globalThis.crossOriginIsolated
) {
  return {
    ready: true,
    supportStatus: 'unsupported' as const,
    reason: 'Cross-origin isolation is required for pthread RAW decode',
  }
}
```

Delete `VITE_RAW_RUNTIME` from `src/vite-env.d.ts`, leaving only the Vite and Vitest references plus `ImportMeta`.

- [ ] **Step 5: Run focused app runtime tests**

Run:

```bash
pnpm test:run src/lib/raw/runtime-adapter.test.ts src/modules/raw-processor/__tests__/raw-route-shell.test.tsx src/modules/raw-processor/hooks/useRawProcessor.test.tsx
```

Expected: all focused tests pass.

- [ ] **Step 6: Commit Task 1**

Run:

```bash
git add src/lib/raw/runtime-adapter.ts src/lib/raw/runtime-adapter.test.ts src/modules/raw-processor/hooks/useCapabilityGate.ts src/modules/raw-processor/__tests__/raw-route-shell.test.tsx src/vite-env.d.ts
git commit -m "feat(raw): make luma runtime the default"
```

## Task 2: Remove App-Level `libraw-wasm` Source And Dependency

**Files:**
- Modify: `src/lib/raw/decoder.ts`
- Modify: `src/lib/raw/decoder.test.ts`
- Delete: `src/types/libraw-wasm.d.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Write shared-helper tests**

Replace `src/lib/raw/decoder.test.ts` with tests that do not import legacy decode helpers:

```ts
import { describe, expect, it } from 'vitest'

import {
  QUICK_PREVIEW_MAX_PIXELS,
  getFileExtension,
  isSupportedRaw,
} from './decoder'

describe('raw shared helpers', () => {
  it('accepts common camera RAW extensions case-insensitively', () => {
    expect(isSupportedRaw(new File(['raw'], 'sony.ARW'))).toBe(true)
    expect(isSupportedRaw('nikon.nef')).toBe(true)
    expect(isSupportedRaw('lut.cube')).toBe(false)
  })

  it('returns lowercase file extensions', () => {
    expect(getFileExtension('Frame.NEF')).toBe('nef')
    expect(getFileExtension('no-extension')).toBe('')
  })

  it('keeps the app quick preview cap aligned with the runtime session cap', () => {
    expect(QUICK_PREVIEW_MAX_PIXELS).toBe(2_500_000)
  })
})
```

- [ ] **Step 2: Run the helper test and confirm failure**

Run:

```bash
pnpm test:run src/lib/raw/decoder.test.ts
```

Expected before implementation: it may still pass if helpers already exist, but `rg "libraw-wasm" src` must still fail the dependency-removal acceptance check.

- [ ] **Step 3: Strip legacy decoder implementation**

Change `src/lib/raw/decoder.ts` so it only exports app-shared types and helpers:

```ts
export type DecodedImageLayout = 'rgba-float32' | 'rgb-u16'

export type DecodedImageColorSpace =
  | 'display-srgb-preview'
  | 'linear-prophoto-rgb'

export interface DecodedImage {
  width: number
  height: number
  channels: 3 | 4
  bitsPerChannel: 16 | 32
  data: Float32Array | Uint16Array
  layout: DecodedImageLayout
  colorSpace: DecodedImageColorSpace
  source?: 'quick' | 'hq'
  timings?: Record<string, number | undefined>
  metadata: ImageMetadata
}

export interface ImageMetadata {
  make?: string
  model?: string
  lens?: string
  iso?: number
  aperture?: number
  focalLength?: number
  shutterSpeed?: string
  timestamp?: Date
  width: number
  height: number
  orientation?: number
}

export interface DecodeProgress {
  phase: 'loading' | 'decoding' | 'processing' | 'complete'
  progress: number
}

export type ProgressCallback = (progress: DecodeProgress) => void

export const QUICK_PREVIEW_MAX_PIXELS = 2_500_000

export const SUPPORTED_RAW_EXTENSIONS = new Set([
  'cr2', 'cr3', 'crw', 'nef', 'nrw', 'arw', 'srf', 'sr2', 'raf', 'rw2',
  'rwl', 'orf', 'pef', 'ptx', 'srw', 'dng', 'iiq', '3fr', 'fff', 'x3f',
  'dcr', 'dcs', 'kdc', 'mos', 'raw', 'rwz', 'erf', 'mef', 'mrw',
])

export function isSupportedRaw(file: File | string): boolean {
  const name = typeof file === 'string' ? file : file.name
  const ext = getFileExtension(name)
  return ext ? SUPPORTED_RAW_EXTENSIONS.has(ext) : false
}

export function getFileExtension(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : ''
}
```

Keep `DecodedImageLayout` support for `rgba-float32` so existing render/export code remains tolerant of old snapshots and tests, but no source should construct that path via `libraw-wasm`.

- [ ] **Step 4: Remove package dependency and declaration file**

Delete:

```bash
rm src/types/libraw-wasm.d.ts
```

Edit `package.json` and remove:

```json
"libraw-wasm": "^1.1.2"
```

Run:

```bash
pnpm install
```

Expected: `pnpm-lock.yaml` no longer contains `libraw-wasm@1.1.2` if no other package depends on it.

- [ ] **Step 5: Verify no app dependency remains**

Run:

```bash
pnpm test:run src/lib/raw/decoder.test.ts src/lib/raw/runtime-adapter.test.ts src/modules/raw-processor/hooks/useRawProcessor.test.tsx
pnpm exec tsc --noEmit
rg "libraw-wasm" src package.json pnpm-lock.yaml
```

Expected: tests and typecheck pass. The final `rg` command exits non-zero because no matches remain in active app source, root package manifest, or lockfile.

- [ ] **Step 6: Commit Task 2**

Run:

```bash
git add package.json pnpm-lock.yaml src/lib/raw/decoder.ts src/lib/raw/decoder.test.ts src/types/libraw-wasm.d.ts
git commit -m "refactor(raw): remove libraw-wasm app dependency"
```

## Task 3: Make Runtime Benchmark Dependency-Free

**Files:**
- Modify: `packages/luma-raw-runtime/benchmarks/bench-runtime.ts`
- Modify: `packages/luma-raw-runtime/fixtures/README.md`
- Modify: `packages/luma-raw-runtime/package.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Remove live legacy benchmark rows**

In `packages/luma-raw-runtime/benchmarks/bench-runtime.ts`:

- Delete `import LibRaw from 'libraw-wasm'`.
- Delete `legacyDecode`, `benchLegacy`, `terminateLibrawWorker`, `LARGE_RAW_SAFE_HQ_REUSE_BYTES`, and legacy `BenchStage` variants.
- Set runtime type to only `'luma'`.
- Keep stages: `'luma-open-session'`, `'luma-embedded'`, `'luma-quick'`, `'luma-hq'`.
- In `run()`, call only `await benchLuma(file)` for each selected fixture.

The live benchmark must still print JSONL records with file size, dimensions, megapixels, total, read/transfer/copy/open/unpack/process fields, heap fields, and target status.

- [ ] **Step 2: Remove benchmark package dependency**

Edit `packages/luma-raw-runtime/package.json` and remove the `devDependencies` block if it only contains:

```json
"libraw-wasm": "^1.1.2"
```

Run:

```bash
pnpm install
```

- [ ] **Step 3: Update fixture README**

Change `packages/luma-raw-runtime/fixtures/README.md` so the benchmark description says:

```md
The live benchmark validates the optimized Luma runtime only:

- Luma opens one decode session per file
- Luma embedded, quick, and HQ timings are reported separately
- output JSONL includes file, size, megapixels, stage, width, height, total, read, transfer, copy, open, unpack/process, heap bytes, and target status

Historical app-equivalent `libraw-wasm` comparison rows are recorded in:

- `docs/plans/2026-04-23-luma-raw-runtime-benchmark-notes.md`
- `/tmp/luma-raw-runtime-perf-v2.jsonl` when available in the local validation environment
```

- [ ] **Step 4: Verify runtime package without `libraw-wasm`**

Run:

```bash
pnpm --filter @lumaforge/luma-raw-runtime typecheck
pnpm test:run packages/luma-raw-runtime/src/runtime.test.ts packages/luma-raw-runtime/worker/runtime-core.test.ts packages/luma-raw-runtime/worker/native-adapter.test.ts
rg "libraw-wasm" packages/luma-raw-runtime/package.json packages/luma-raw-runtime/benchmarks packages/luma-raw-runtime/fixtures pnpm-lock.yaml
```

Expected: typecheck and tests pass. The final `rg` command exits non-zero because the active runtime package and lockfile no longer reference `libraw-wasm`.

- [ ] **Step 5: Commit Task 3**

Run:

```bash
git add packages/luma-raw-runtime/package.json packages/luma-raw-runtime/benchmarks/bench-runtime.ts packages/luma-raw-runtime/fixtures/README.md pnpm-lock.yaml
git commit -m "perf(raw-runtime): remove legacy benchmark dependency"
```

## Task 4: Update Acceptance Docs And Final Verification

**Files:**
- Modify: `docs/plans/2026-04-23-luma-raw-runtime-benchmark-notes.md`
- Modify: `docs/specs/2026-04-22-phase1-test-matrix.md`
- Modify: `docs/specs/2026-04-23-luma-raw-runtime-migration-design.md`
- Modify: `PLAN.md`
- Modify: `ACCEPTANCE.md`

- [ ] **Step 1: Update benchmark notes**

In `docs/plans/2026-04-23-luma-raw-runtime-benchmark-notes.md`, add a final status section:

```md
## Default Runtime And Dependency Removal

Status: PASS as of 2026-04-23.

- The app RAW facade now always uses `@lumaforge/luma-raw-runtime`.
- The npm `libraw-wasm` dependency has been removed from the root app, runtime package benchmark, and lockfile.
- Legacy benchmark rows in this document are historical V2 baseline evidence only.
- Live benchmark runs are Luma-only validation runs.
```

Also remove text that says the default switch remains out of scope.

- [ ] **Step 2: Update migration validation rows**

In `docs/specs/2026-04-22-phase1-test-matrix.md`, replace the migration rows that mention `VITE_RAW_RUNTIME=libraw-wasm` / `VITE_RAW_RUNTIME=luma` with rows that validate:

- Open supported RAW with default Luma runtime.
- Open a second RAW in the same tab with default Luma runtime.
- Disable cross-origin isolation and confirm unsupported-state copy.
- Confirm package/source dependency scan has no active `libraw-wasm` references.

- [ ] **Step 3: Update migration design**

In `docs/specs/2026-04-23-luma-raw-runtime-migration-design.md`, add a status note near the top:

```md
> 2026-04-23 update: V2 performance validation passed and the final migration removes the feature-flagged `libraw-wasm` fallback. The app default is now the custom Luma RAW runtime; `libraw-wasm` references below are retained only as historical migration baseline context.
```

- [ ] **Step 4: Update root memory**

Update `PLAN.md` so:

- `Current Task` is Task 4 until final checks pass.
- `Remaining Tasks` marks Tasks 1-3 complete and Task 4 in progress.
- `Next Action` names the exact next verification command.

Update `ACCEPTANCE.md` so final status is PASS only after checks pass, not before.

- [ ] **Step 5: Run final verification**

Run:

```bash
pnpm test:run
pnpm exec tsc --noEmit
. "$HOME/.cache/lumaforge-emsdk/emsdk_env.sh" >/dev/null && pnpm --filter @lumaforge/luma-raw-runtime build:native
pnpm --filter @lumaforge/luma-raw-runtime typecheck
pnpm build
rg "libraw-wasm" package.json pnpm-lock.yaml src packages
git diff --check
```

Expected:

- All tests pass.
- TypeScript checks pass.
- Native runtime rebuild passes.
- Runtime package typecheck passes.
- App production build passes.
- Active package/source scan has no `libraw-wasm` matches.
- Whitespace check passes.

- [ ] **Step 6: Commit Task 4**

Run:

```bash
git add docs/plans/2026-04-23-luma-raw-runtime-benchmark-notes.md docs/specs/2026-04-22-phase1-test-matrix.md docs/specs/2026-04-23-luma-raw-runtime-migration-design.md PLAN.md ACCEPTANCE.md
git commit -m "docs(raw-runtime): finalize luma default migration"
```

