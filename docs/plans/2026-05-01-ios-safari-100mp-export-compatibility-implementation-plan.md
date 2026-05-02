# iOS Safari 100MP Export Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make 100MP-class full-resolution JPEG export survive iOS Safari memory limits without forcing desktop and high-memory platforms into the same low-throughput mode.

**Architecture:** Add an explicit export execution profile, route iOS-safe through a low-memory RAW runtime and file-backed/streaming output path, evacuate preview resources before export, and persist interruption checkpoints as crash detection plus safe retry from row `0`. Keep true row resume out of MVP until the JPEG runtime exposes durable encoder state.

**Tech Stack:** TypeScript 6, React 19 hooks, Jotai state atoms, Vitest, Vite 8 workers, Emscripten, OPFS, Playwright WebKit, `@lumaforge/luma-raw-runtime`, `@lumaforge/luma-jpeg-runtime`, LibRaw, libjpeg-turbo.

---

## Scope Guard

This plan implements `docs/specs/2026-05-01-ios-safari-100mp-export-compatibility-design.md`.

Do not implement cloud export, native helpers, WebGPU export, canvas/ImageData full-resolution export, silent downscale, or JPEG mid-stream row resume in this plan.

MVP checkpoint semantics are:

```text
interrupted export detected
-> source reacquired through current File or user reselect
-> fingerprint verified
-> retry from row 0 with ios-safe
```

Do not use "resume" in product copy unless the manifest says `recoveryMode: 'row-resume'` and the JPEG encoder state validates. This plan only implements `recoveryMode: 'safe-retry'`.

The first `ios-safe` RAW runtime must use a conservative `MAXIMUM_MEMORY=1024MB` cap, single worker, and `64` or `128` export rows. Keep the cap behind a named build profile so it can only be widened after real-device iPhone/iPad evidence proves the higher ceiling is stable.

## Execution Preflight

Run in a repo-local worktree unless the user explicitly asks to work on the current checkout:

```bash
git status --short
pnpm worktree feat/ios-safari-100mp-export-compat
cd /workspaces/LumaForge/LumaForge/.worktrees/feat/ios-safari-100mp-export-compat
pnpm install --frozen-lockfile
```

Expected:

- `git status --short` shows only intentional local changes.
- `pnpm install --frozen-lockfile` exits `0`.

If native commands fail because `emcc` is missing:

```bash
. "$HOME/.cache/lumaforge-emsdk/emsdk_env.sh" > /dev/null
emcc --version
```

Expected: `emcc --version` prints the active Emscripten SDK version.

## File Structure

Create:

- `src/lib/export/execution-profile.ts`: execution profile names, selected plan shape, platform/capability profile selection, bounded row/concurrency defaults, and product copy keys.
- `src/lib/export/execution-profile.test.ts`: profile selection, row defaults, runtime mode, output sink, and retry override tests.
- `src/lib/export/resource-registry.ts`: dev-visible large-resource ownership registry with deterministic release assertions.
- `src/lib/export/resource-registry.test.ts`: registration, disposal, duplicate release, owner summary, and zero-live assertions.
- `src/lib/export/source-fingerprint.ts`: file fingerprint builder and matcher for reload recovery.
- `src/lib/export/source-fingerprint.test.ts`: fingerprint matching and mismatch tests.
- `src/lib/export/checkpoint-store.ts`: OPFS-backed checkpoint manifest interface plus in-memory test backend.
- `src/lib/export/checkpoint-store.test.ts`: manifest normalization, write/scan/remove, stale cleanup, and safe-retry semantics.
- `src/lib/export/output-sink.ts`: output sink selection and file-backed result references for export completion handoff.
- `src/lib/export/output-sink.test.ts`: OPFS availability, fallback, Blob handoff gating, and object URL cleanup tests.
- `src/modules/raw-processor/services/export-evacuation.ts`: export snapshot creation and preview-resource evacuation orchestration.
- `src/modules/raw-processor/services/export-evacuation.test.ts`: abort/dispose/release ordering and snapshot field tests.
- `src/modules/raw-processor/services/export-recovery.ts`: interrupted checkpoint discovery, reselect validation, and recovery product copy state.
- `src/modules/raw-processor/services/export-recovery.test.ts`: safe retry from row `0`, source-required copy, and fingerprint mismatch tests.
- `tests/browser/raw-ios-safe-export.spec.ts`: Playwright WebKit preflight for profile selection, evacuation, checkpoint detection, and desktop preservation.
- `tests/browser/raw-export-fixtures.ts`: fixture resolver and skip helper for browser validation.
- `playwright.config.ts`: WebKit/Chromium preflight config with Vite dev server.

Modify:

- `package.json`: add Playwright scripts and dependency when browser validation is introduced.
- `vite.config.ts`: copy both desktop and low-memory RAW native artifact directories into app build output.
- `packages/luma-raw-runtime/package.json`: build and verify both `desktop` and `low-memory` native RAW variants.
- `packages/luma-raw-runtime/native/emcc-flags.sh`: select Emscripten flags from `LUMA_RAW_MEMORY_PROFILE`.
- `packages/luma-raw-runtime/native/scripts/build-wasm.sh`: emit native artifacts under `dist/native/<profile>/`.
- `packages/luma-raw-runtime/native/scripts/verify-native-artifacts.mjs`: verify both native profiles and write profile-specific provenance.
- `packages/luma-raw-runtime/src/types.ts`: add runtime memory profile and runtime info fields.
- `packages/luma-raw-runtime/src/worker-protocol.ts`: include runtime memory profile in `init`.
- `packages/luma-raw-runtime/src/runtime.ts`: accept `memoryProfile` and make cross-origin isolation required only for the desktop/pthread profile.
- `packages/luma-raw-runtime/worker/load-native-module.ts`: load `low-memory` or `desktop` native assets.
- `packages/luma-raw-runtime/worker/runtime.worker.ts`: keep one runtime core per memory profile.
- `packages/luma-raw-runtime/worker/runtime-core.ts`: report selected runtime memory profile.
- `src/lib/raw/luma-runtime-adapter.ts`: request low-memory runtime for iOS-safe export workers.
- `src/lib/raw/runtime-adapter.ts`: expose runtime profile selection to app code.
- `src/lib/export/jpeg/row-writer.ts`: return a file-backed output handle instead of requiring an in-memory `Blob` for every export.
- `src/lib/export/jpeg/wasm-row-sink.ts`: pass chunk/file-backed sink options into the JPEG runtime.
- `packages/luma-jpeg-runtime/src/runtime.ts`: add optional chunk callback and file-backed finish mode.
- `packages/luma-jpeg-runtime/worker/runtime-core.ts`: emit compressed chunks before final close where backend supports it.
- `packages/luma-jpeg-runtime/worker/native-adapter.ts`: adapt native chunk output; keep Blob finish for non-iOS fallback.
- `src/lib/export/full-res-export.ts`: consume execution plan, emit richer telemetry, write checkpoints after committed strips, and surface resource failures to caller when fresh-worker retry is required.
- `src/lib/export/full-res-export-client.ts`: include execution plan, checkpoint config, output sink config, and worker restart metrics in messages.
- `src/lib/export/full-res-export.worker.ts`: select runtime profile, use checkpoint/output sink, and send safe-retry metrics.
- `src/modules/raw-processor/services/export-system.ts`: select profiles, run fresh-worker retry loop, and return file-backed export result references.
- `src/modules/raw-processor/model/export-result.ts`: represent Blob-backed and file-backed export results.
- `src/modules/raw-processor/services/export-result-actions.ts`: materialize Blob only for download/share/copy handoff and revoke URLs immediately.
- `src/modules/raw-processor/model/session.ts`: add export profile, checkpoint, retry, and recovery state fields.
- `src/modules/raw-processor/model/derive-session.ts`: keep export gating fail-closed while allowing safe recovery prompts.
- `src/modules/raw-processor/hooks/useRawProcessor.ts`: evacuate resources before export, release previous results, integrate safe retry/recovery, and expose recovery actions.
- `src/modules/raw-processor/components/tools/ExportTool.tsx`: render safe-mode, retry, source-reselect, and non-durable checkpoint copy.
- `src/modules/raw-processor/components/ProgressOverlay.tsx`: show profile and checkpoint-aware export progress copy.
- Existing tests under `src/lib/export`, `src/modules/raw-processor`, `packages/luma-raw-runtime`, and `packages/luma-jpeg-runtime`.

Do not modify:

- LUT contract semantics or output color intent.
- Full-resolution output dimensions as a compatibility fallback.
- Preview canvas as an export source.
- Existing unrelated UI layout or style tokens.

---

### Task 1: Add Export Execution Profiles

**Files:**

- Create: `src/lib/export/execution-profile.ts`
- Create: `src/lib/export/execution-profile.test.ts`
- Modify: `src/modules/raw-processor/services/export-system.ts`
- Test: `src/modules/raw-processor/__tests__/export-system.test.ts`

- [ ] **Step 1: Write failing profile tests**

Create `src/lib/export/execution-profile.test.ts`:

```ts
import {
  selectExportExecutionPlan,
  getExportModeCopy,
  type ExportExecutionProfileName,
} from './execution-profile'

describe('export execution profile selection', () => {
  it('forces ios-safe after interrupted checkpoint regardless of platform', () => {
    const plan = selectExportExecutionPlan({
      fidelity: 'max',
      sourceWidth: 11662,
      sourceHeight: 8746,
      previousInterrupted: true,
      runtime: { lowMemoryAvailable: true, pthreadAvailable: true },
      output: { opfsAvailable: true, streamingAvailable: true },
      platform: { userAgent: 'Mozilla/5.0 (Windows NT 10.0)', touch: false },
    })

    expect(plan.profile.name).toBe('ios-safe')
    expect(plan.preferredRows).toBe(64)
    expect(plan.concurrency).toBe(1)
    expect(plan.runtimeMemoryProfile).toBe('low-memory')
    expect(plan.checkpointMode).toBe('safe-retry')
    expect(plan.outputSink).toBe('opfs-file')
  })

  it('uses ios-safe for iPhone WebKit-like environments', () => {
    const plan = selectExportExecutionPlan({
      fidelity: 'balanced',
      sourceWidth: 11662,
      sourceHeight: 8746,
      runtime: { lowMemoryAvailable: true, pthreadAvailable: true },
      output: { opfsAvailable: true, streamingAvailable: false },
      platform: {
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
        touch: true,
      },
    })

    expect(plan.profile.name).toBe('ios-safe')
    expect(plan.maxConcurrency).toBe(1)
    expect(plan.preferredRows).toBe(64)
  })

  it.each([
    ['mobile-balanced', 256, 2],
    ['desktop-fast', 1024, 3],
  ] as Array<[ExportExecutionProfileName, number, number]>)(
    'keeps non-iOS %s throughput defaults',
    (expectedProfile, expectedRows, expectedConcurrency) => {
      const plan = selectExportExecutionPlan({
        fidelity: expectedProfile === 'desktop-fast' ? 'max' : 'balanced',
        sourceWidth: expectedProfile === 'desktop-fast' ? 9504 : 6000,
        sourceHeight: expectedProfile === 'desktop-fast' ? 6336 : 4000,
        runtime: { lowMemoryAvailable: true, pthreadAvailable: true },
        output: { opfsAvailable: false, streamingAvailable: true },
        platform: {
          userAgent:
            expectedProfile === 'desktop-fast'
              ? 'Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 Chrome/126 Safari/537.36'
              : 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36',
          touch: expectedProfile !== 'desktop-fast',
          hardwareConcurrency: 8,
        },
      })

      expect(plan.profile.name).toBe(expectedProfile)
      expect(plan.preferredRows).toBe(expectedRows)
      expect(plan.concurrency).toBe(expectedConcurrency)
    },
  )

  it('maps product copy without saying resume for safe retry', () => {
    expect(getExportModeCopy('interrupted-source-needed')).toBe(
      'The browser interrupted the previous export. Please reselect the same RAW file so LumaForge can retry with a safer setting.',
    )
    expect(getExportModeCopy('interrupted-source-needed')).not.toMatch(
      /resume/i,
    )
  })
})
```

- [ ] **Step 2: Run profile tests and verify failure**

Run:

```bash
pnpm test:run src/lib/export/execution-profile.test.ts
```

Expected: FAIL because `src/lib/export/execution-profile.ts` does not exist.

- [ ] **Step 3: Implement profile selector**

Create `src/lib/export/execution-profile.ts`:

```ts
import type { ExportFidelity } from '~/lib/gl/export'

export type ExportExecutionProfileName =
  | 'ios-safe'
  | 'mobile-balanced'
  | 'desktop-fast'

export type ExportCheckpointMode = 'safe-retry' | 'row-resume'
export type ExportOutputSink = 'opfs-file' | 'streaming' | 'blob-handoff'
export type ExportRuntimeMemoryProfile = 'low-memory' | 'desktop'

export type ExportExecutionProfile = {
  name: ExportExecutionProfileName
  minRows: number
  maxRows: number
  preferredRowsFor100Mp: number
  preferredRowsBelow100Mp: number
  rowBandRows: number
  initialConcurrency: number
  maxConcurrency: number
  boundedHqMaxPixels: number
  releasePreviewPipelineBeforeExport: boolean
  releaseBoundedHqBufferBeforeExport: boolean
  releasePreviousExportResultBeforeExport: boolean
  restartWorkerOnResourceRetry: boolean
  checkpointOutput: boolean
  checkpointMode: ExportCheckpointMode
}

export type ExportExecutionPlan = {
  profile: ExportExecutionProfile
  preferredRows: number
  concurrency: number
  maxConcurrency: number
  runtimeMemoryProfile: ExportRuntimeMemoryProfile
  outputSink: ExportOutputSink
  checkpointMode: ExportCheckpointMode
  productCopy:
    | 'high-performance'
    | 'safe-export'
    | 'resource-retry'
    | 'interrupted-retry'
    | 'interrupted-source-needed'
    | 'non-durable-checkpoint'
    | 'cannot-safely-complete'
}

export const EXPORT_EXECUTION_PROFILES: Record<
  ExportExecutionProfileName,
  ExportExecutionProfile
> = {
  'ios-safe': {
    name: 'ios-safe',
    minRows: 64,
    maxRows: 256,
    preferredRowsFor100Mp: 64,
    preferredRowsBelow100Mp: 128,
    rowBandRows: 64,
    initialConcurrency: 1,
    maxConcurrency: 1,
    boundedHqMaxPixels: 8_000_000,
    releasePreviewPipelineBeforeExport: true,
    releaseBoundedHqBufferBeforeExport: true,
    releasePreviousExportResultBeforeExport: true,
    restartWorkerOnResourceRetry: true,
    checkpointOutput: true,
    checkpointMode: 'safe-retry',
  },
  'mobile-balanced': {
    name: 'mobile-balanced',
    minRows: 64,
    maxRows: 512,
    preferredRowsFor100Mp: 128,
    preferredRowsBelow100Mp: 256,
    rowBandRows: 64,
    initialConcurrency: 1,
    maxConcurrency: 2,
    boundedHqMaxPixels: 8_000_000,
    releasePreviewPipelineBeforeExport: true,
    releaseBoundedHqBufferBeforeExport: true,
    releasePreviousExportResultBeforeExport: true,
    restartWorkerOnResourceRetry: true,
    checkpointOutput: true,
    checkpointMode: 'safe-retry',
  },
  'desktop-fast': {
    name: 'desktop-fast',
    minRows: 256,
    maxRows: 2048,
    preferredRowsFor100Mp: 512,
    preferredRowsBelow100Mp: 1024,
    rowBandRows: 64,
    initialConcurrency: 2,
    maxConcurrency: 3,
    boundedHqMaxPixels: 12_000_000,
    releasePreviewPipelineBeforeExport: false,
    releaseBoundedHqBufferBeforeExport: false,
    releasePreviousExportResultBeforeExport: true,
    restartWorkerOnResourceRetry: false,
    checkpointOutput: false,
    checkpointMode: 'safe-retry',
  },
}

export function getImageMegapixels(width?: number, height?: number) {
  if (!width || !height) return 0
  return (width * height) / 1_000_000
}

export function isKnownRiskWebKitMobile(input: {
  userAgent?: string
  touch?: boolean
}) {
  const ua = input.userAgent ?? ''
  const isiOS = /\b(iPhone|iPad|iPod)\b/i.test(ua)
  const webKit = /\bAppleWebKit\b/i.test(ua)
  const mobile = input.touch === true || /\bMobile\b/i.test(ua)
  return isiOS && webKit && mobile
}

function chooseProfile(input: {
  fidelity: ExportFidelity
  previousInterrupted?: boolean
  previousResourceFailure?: boolean
  runtime: { lowMemoryAvailable: boolean; pthreadAvailable: boolean }
  platform: { userAgent?: string; touch?: boolean }
}): ExportExecutionProfileName {
  if (input.previousInterrupted) return 'ios-safe'
  if (isKnownRiskWebKitMobile(input.platform)) return 'ios-safe'
  if (!input.runtime.pthreadAvailable) return 'mobile-balanced'
  if (input.previousResourceFailure) {
    return input.fidelity === 'max' ? 'mobile-balanced' : 'ios-safe'
  }
  if (input.fidelity === 'max') return 'desktop-fast'
  if (input.fidelity === 'balanced') {
    return input.platform.touch ? 'mobile-balanced' : 'desktop-fast'
  }
  return input.platform.touch ? 'ios-safe' : 'mobile-balanced'
}

function chooseOutputSink(input: {
  profile: ExportExecutionProfileName
  output: { opfsAvailable: boolean; streamingAvailable: boolean }
}): ExportOutputSink {
  if (input.profile === 'ios-safe' && input.output.opfsAvailable) {
    return 'opfs-file'
  }
  if (input.output.streamingAvailable) return 'streaming'
  return 'blob-handoff'
}

export function selectExportExecutionPlan(input: {
  fidelity: ExportFidelity
  sourceWidth?: number
  sourceHeight?: number
  previousInterrupted?: boolean
  previousResourceFailure?: boolean
  runtime: { lowMemoryAvailable: boolean; pthreadAvailable: boolean }
  output: { opfsAvailable: boolean; streamingAvailable: boolean }
  platform: {
    userAgent?: string
    touch?: boolean
    hardwareConcurrency?: number
  }
}): ExportExecutionPlan {
  const profileName = chooseProfile(input)
  const profile = EXPORT_EXECUTION_PROFILES[profileName]
  const megapixels = getImageMegapixels(input.sourceWidth, input.sourceHeight)
  const preferredRows =
    megapixels >= 80
      ? profile.preferredRowsFor100Mp
      : profile.preferredRowsBelow100Mp
  const outputSink = chooseOutputSink({
    profile: profileName,
    output: input.output,
  })
  const runtimeMemoryProfile: ExportRuntimeMemoryProfile =
    profileName === 'desktop-fast' && input.runtime.pthreadAvailable
      ? 'desktop'
      : 'low-memory'

  return {
    profile,
    preferredRows,
    concurrency: profile.initialConcurrency,
    maxConcurrency: profile.maxConcurrency,
    runtimeMemoryProfile,
    outputSink,
    checkpointMode: profile.checkpointMode,
    productCopy:
      profileName === 'desktop-fast' ? 'high-performance' : 'safe-export',
  }
}

export function getExportModeCopy(key: ExportExecutionPlan['productCopy']) {
  const copy: Record<ExportExecutionPlan['productCopy'], string> = {
    'high-performance': 'Using high-performance full-resolution export.',
    'safe-export':
      'This device is using low-memory export mode. Export may take longer.',
    'resource-retry':
      'Export hit a browser memory limit. Retrying with a safer setting.',
    'interrupted-retry':
      'The browser interrupted the previous export. LumaForge will retry with a safer low-memory setting.',
    'interrupted-source-needed':
      'The browser interrupted the previous export. Please reselect the same RAW file so LumaForge can retry with a safer setting.',
    'non-durable-checkpoint':
      'This browser cannot store export progress. Keep the tab open while the JPEG is being written.',
    'cannot-safely-complete':
      'This browser cannot safely complete a 100MP local full-resolution export. Try a desktop browser or export a smaller version.',
  }

  return copy[key]
}
```

- [ ] **Step 4: Route existing export helpers through the profile selector**

Edit `src/modules/raw-processor/services/export-system.ts` so the old fidelity helpers delegate to the profile selector for current-session defaults:

```ts
import {
  selectExportExecutionPlan,
  type ExportExecutionPlan,
} from '~/lib/export/execution-profile'

export function selectCurrentExportExecutionPlan(input: {
  fidelity: ExportFidelity
  sourceWidth?: number
  sourceHeight?: number
  previousInterrupted?: boolean
  previousResourceFailure?: boolean
}) {
  return selectExportExecutionPlan({
    ...input,
    runtime: {
      lowMemoryAvailable: true,
      pthreadAvailable:
        typeof crossOriginIsolated === 'boolean' ? crossOriginIsolated : false,
    },
    output: {
      opfsAvailable:
        typeof navigator !== 'undefined' &&
        Boolean(navigator.storage?.getDirectory),
      streamingAvailable:
        typeof WritableStream !== 'undefined' &&
        typeof ReadableStream !== 'undefined',
    },
    platform: {
      userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
      touch:
        typeof navigator !== 'undefined' &&
        navigator.maxTouchPoints !== undefined &&
        navigator.maxTouchPoints > 0,
      hardwareConcurrency:
        typeof navigator === 'undefined'
          ? undefined
          : navigator.hardwareConcurrency,
    },
  })
}

export function getPreferredRowsForFidelity(fidelity: ExportFidelity) {
  return selectCurrentExportExecutionPlan({ fidelity }).preferredRows
}

export function getConcurrencyForFidelity(fidelity: ExportFidelity) {
  return selectCurrentExportExecutionPlan({ fidelity }).concurrency
}

export type { ExportExecutionPlan }
```

- [ ] **Step 5: Update export-system tests**

Extend `src/modules/raw-processor/__tests__/export-system.test.ts`:

```ts
import { selectCurrentExportExecutionPlan } from '../services/export-system'

it('selects ios-safe rows for 100MP current-session safe export', () => {
  const plan = selectCurrentExportExecutionPlan({
    fidelity: 'safe',
    sourceWidth: 11662,
    sourceHeight: 8746,
  })

  expect(plan.preferredRows).toBeLessThanOrEqual(128)
  expect(plan.concurrency).toBe(1)
  expect(plan.checkpointMode).toBe('safe-retry')
})
```

- [ ] **Step 6: Run profile/export tests**

Run:

```bash
pnpm test:run src/lib/export/execution-profile.test.ts src/modules/raw-processor/__tests__/export-system.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 1**

```bash
git add src/lib/export/execution-profile.ts \
  src/lib/export/execution-profile.test.ts \
  src/modules/raw-processor/services/export-system.ts \
  src/modules/raw-processor/__tests__/export-system.test.ts
git commit -m "feat(export): add execution profile selection"
```

### Task 2: Add Low-Memory RAW Runtime Variant Selection

**Files:**

- Modify: `packages/luma-raw-runtime/native/emcc-flags.sh`
- Modify: `packages/luma-raw-runtime/native/scripts/build-wasm.sh`
- Modify: `packages/luma-raw-runtime/native/scripts/verify-native-artifacts.mjs`
- Modify: `packages/luma-raw-runtime/package.json`
- Modify: `packages/luma-raw-runtime/src/types.ts`
- Modify: `packages/luma-raw-runtime/src/worker-protocol.ts`
- Modify: `packages/luma-raw-runtime/src/runtime.ts`
- Modify: `packages/luma-raw-runtime/worker/load-native-module.ts`
- Modify: `packages/luma-raw-runtime/worker/runtime.worker.ts`
- Modify: `packages/luma-raw-runtime/worker/runtime-core.ts`
- Modify: `packages/luma-raw-runtime/src/runtime.test.ts`
- Modify: `packages/luma-raw-runtime/worker/runtime-core.test.ts`
- Modify: `vite.config.ts`

- [ ] **Step 1: Write failing runtime profile tests**

Add to `packages/luma-raw-runtime/src/runtime.test.ts`:

```ts
it('does not require cross-origin isolation for low-memory runtime profile', async () => {
  const requests: unknown[] = []
  const worker = createRespondingWorker((request) => {
    requests.push(request)
    return {
      id: request.id,
      ok: true,
      type: request.type,
      payload: {
        runtime: 'luma',
        version: '0.1.0',
        simd: true,
        pthreads: false,
        crossOriginIsolated: false,
        memoryTier: 'low',
        memoryProfile: 'low-memory',
        workerPoolSize: 1,
      },
    }
  })

  const runtime = createLumaRawRuntime({
    memoryProfile: 'low-memory',
    workerFactory: () => worker as unknown as Worker,
  })

  await expect(runtime.init()).resolves.toMatchObject({
    memoryProfile: 'low-memory',
    pthreads: false,
    memoryTier: 'low',
  })
  expect(requests[0]).toMatchObject({
    type: 'init',
    payload: {
      requireCrossOriginIsolation: false,
      memoryProfile: 'low-memory',
    },
  })
})
```

Add to `packages/luma-raw-runtime/worker/runtime-core.test.ts`:

```ts
it('reports low-memory runtime info when initialized with low-memory profile', async () => {
  const core = createRuntimeCore(fakeNativeFactory(), {
    memoryProfile: 'low-memory',
  })

  await expect(
    core.handleRequest({
      id: 'init-low',
      type: 'init',
      payload: {
        requireCrossOriginIsolation: false,
        memoryProfile: 'low-memory',
      },
    }),
  ).resolves.toMatchObject({
    ok: true,
    payload: {
      pthreads: false,
      memoryTier: 'low',
      memoryProfile: 'low-memory',
      workerPoolSize: 1,
    },
  })
})
```

- [ ] **Step 2: Run runtime tests and verify failure**

Run:

```bash
pnpm --filter @lumaforge/luma-raw-runtime test
```

Expected: FAIL because `memoryProfile` is not part of the public runtime options or worker protocol.

- [ ] **Step 3: Add runtime memory profile types**

Edit `packages/luma-raw-runtime/src/types.ts`:

```ts
export type LumaRawRuntimeMemoryProfile = 'desktop' | 'low-memory'

export type LumaRawRuntimeInfo = {
  runtime: 'luma'
  version: string
  simd: boolean
  pthreads: boolean
  crossOriginIsolated: boolean
  memoryTier: LumaRawMemoryTier
  memoryProfile: LumaRawRuntimeMemoryProfile
  workerPoolSize: number
}
```

Edit `packages/luma-raw-runtime/src/worker-protocol.ts`:

```ts
import type { LumaRawRuntimeMemoryProfile } from './types'

export type LumaRawWorkerRequestPayloadByType = {
  init: {
    requireCrossOriginIsolation: boolean
    memoryProfile: LumaRawRuntimeMemoryProfile
  }
  // keep the existing payload entries unchanged
}
```

- [ ] **Step 4: Thread memory profile through runtime and worker**

Edit `packages/luma-raw-runtime/src/runtime.ts`:

```ts
import type { LumaRawRuntimeMemoryProfile } from './types'

export type LumaRawRuntimeOptions = {
  requireCrossOriginIsolation?: boolean
  memoryProfile?: LumaRawRuntimeMemoryProfile
  workerFactory?: () => Worker
}

export function createLumaRawRuntime(
  options: LumaRawRuntimeOptions = {},
): LumaRawRuntime {
  const memoryProfile = options.memoryProfile ?? 'desktop'
  const requireCrossOriginIsolation =
    options.requireCrossOriginIsolation ?? memoryProfile === 'desktop'
  const client = new LumaRawWorkerClient(
    options.workerFactory ?? defaultWorkerFactory,
  )

  return {
    async init(): Promise<LumaRawRuntimeInfo> {
      assertCrossOriginIsolation(requireCrossOriginIsolation)
      return client.request('init', {
        requireCrossOriginIsolation,
        memoryProfile,
      })
    },
    // keep existing openSession/probe/decode methods
  }
}
```

Edit `packages/luma-raw-runtime/worker/runtime-core.ts`:

```ts
import type { LumaRawRuntimeMemoryProfile } from '../src/types'

type RuntimeCoreOptions = {
  memoryProfile?: LumaRawRuntimeMemoryProfile
}

function getRuntimeInfo(
  memoryProfile: LumaRawRuntimeMemoryProfile,
): LumaRawRuntimeInfo {
  const hardwareConcurrency =
    typeof globalThis.navigator?.hardwareConcurrency === 'number'
      ? globalThis.navigator.hardwareConcurrency
      : 1
  const workerPoolSize =
    memoryProfile === 'low-memory'
      ? 1
      : Math.max(1, Math.min(4, hardwareConcurrency))
  const isolated =
    'crossOriginIsolated' in globalThis
      ? Boolean(globalThis.crossOriginIsolated)
      : false

  return {
    runtime: 'luma',
    version: '0.1.0',
    simd: true,
    pthreads: memoryProfile === 'desktop',
    crossOriginIsolated: isolated,
    memoryTier: memoryProfile === 'low-memory' ? 'low' : 'normal',
    memoryProfile,
    workerPoolSize,
  }
}

export function createRuntimeCore(
  nativeFactory: LumaRawNativeFactory,
  options: RuntimeCoreOptions = {},
) {
  const memoryProfile = options.memoryProfile ?? 'desktop'

  return {
    async handleRequest(request: LumaRawWorkerRequest) {
      if (request.type === 'init') {
        return {
          id: request.id,
          ok: true,
          type: request.type,
          payload: getRuntimeInfo(
            request.payload.memoryProfile ?? memoryProfile,
          ),
        }
      }
      // keep the existing switch cases
    },
  }
}
```

Edit `packages/luma-raw-runtime/worker/runtime.worker.ts`:

```ts
import type { LumaRawRuntimeMemoryProfile } from '../src/types'

const corePromises = new Map<
  LumaRawRuntimeMemoryProfile,
  ReturnType<typeof createCore>
>()

async function createCore(memoryProfile: LumaRawRuntimeMemoryProfile) {
  const nativeFactory = await loadNativeFactory({ memoryProfile })
  return createRuntimeCore(nativeFactory, { memoryProfile })
}

self.onmessage = async (event: MessageEvent<LumaRawWorkerRequest>) => {
  const request = event.data
  const memoryProfile =
    request.type === 'init' ? request.payload.memoryProfile : 'desktop'

  let corePromise = corePromises.get(memoryProfile)
  if (!corePromise) {
    corePromise = createCore(memoryProfile)
    corePromises.set(memoryProfile, corePromise)
  }

  const core = await corePromise
  const response = await core.handleRequest(request)
  postResponse(request, response)
}
```

- [ ] **Step 5: Select profile-specific native assets**

Edit `packages/luma-raw-runtime/worker/load-native-module.ts`:

```ts
import type { LumaRawRuntimeMemoryProfile } from '../src/types'

export type LoadNativeFactoryOptions = {
  memoryProfile?: LumaRawRuntimeMemoryProfile
}

function nativeAssetUrl(
  fileName: string,
  memoryProfile: LumaRawRuntimeMemoryProfile,
) {
  const currentUrl = new URL(import.meta.url)
  const pathParts = currentUrl.pathname.split('/').filter(Boolean)
  const inBuiltWorkerAssets =
    pathParts.at(-1)?.startsWith('runtime.worker') &&
    pathParts.at(-2) === 'assets'
  const nativeDir = inBuiltWorkerAssets
    ? `../native/${memoryProfile}/`
    : `../dist/native/${memoryProfile}/`

  return new URL(`${nativeDir}${fileName}`, import.meta.url).href
}

export async function loadNativeFactory({
  memoryProfile = 'desktop',
}: LoadNativeFactoryOptions = {}): Promise<LumaRawNativeFactory> {
  const moduleUrl = nativeAssetUrl('luma_raw.js', memoryProfile)
  const wasmUrl = nativeAssetUrl('luma_raw.wasm', memoryProfile)
  // keep the existing import and locateFile flow
}
```

- [ ] **Step 6: Build both native profiles**

Edit `packages/luma-raw-runtime/native/emcc-flags.sh`:

```bash
#!/usr/bin/env bash

set -euo pipefail

LUMA_RAW_MEMORY_PROFILE="${LUMA_RAW_MEMORY_PROFILE:-desktop}"

case "${LUMA_RAW_MEMORY_PROFILE}" in
  desktop)
    export LUMA_RAW_CFLAGS="-O3 -flto -ffast-math -msimd128 -DNDEBUG -DUSE_LCMS2"
    export LUMA_RAW_LDFLAGS="-O3 -flto -pthread -s USE_PTHREADS=1 -s MODULARIZE=1 -s EXPORT_ES6=1 -s ENVIRONMENT=web,worker -s ALLOW_MEMORY_GROWTH=1 -s INITIAL_MEMORY=256MB -s USE_LIBPNG=1 -s USE_LIBJPEG=1 -s USE_ZLIB=1 -s DISABLE_EXCEPTION_CATCHING=0 -s EXPORTED_RUNTIME_METHODS=HEAPU8"
    ;;
  low-memory)
    export LUMA_RAW_CFLAGS="-O3 -flto -ffast-math -msimd128 -DNDEBUG -DUSE_LCMS2"
    export LUMA_RAW_LDFLAGS="-O3 -flto -s MODULARIZE=1 -s EXPORT_ES6=1 -s ENVIRONMENT=web,worker -s ALLOW_MEMORY_GROWTH=1 -s INITIAL_HEAP=64MB -s MAXIMUM_MEMORY=1024MB -s MEMORY_GROWTH_LINEAR_STEP=16MB -s ABORTING_MALLOC=0 -s USE_LIBPNG=1 -s USE_LIBJPEG=1 -s USE_ZLIB=1 -s DISABLE_EXCEPTION_CATCHING=0 -s EXPORTED_RUNTIME_METHODS=HEAPU8"
    ;;
  *)
    echo "Unknown LUMA_RAW_MEMORY_PROFILE: ${LUMA_RAW_MEMORY_PROFILE}" >&2
    exit 1
    ;;
esac
```

Edit `packages/luma-raw-runtime/native/scripts/build-wasm.sh`:

```bash
PROFILE="${LUMA_RAW_MEMORY_PROFILE:-desktop}"
OUTPUT_DIR="${PACKAGE_DIR}/dist/native/${PROFILE}"
OUTPUT_JS="${OUTPUT_DIR}/luma_raw.js"

mkdir -p "${OUTPUT_DIR}"
```

Edit `packages/luma-raw-runtime/package.json` scripts:

```json
{
  "scripts": {
    "build:native": "LUMA_RAW_MEMORY_PROFILE=desktop bash native/build-libraw.sh && LUMA_RAW_MEMORY_PROFILE=low-memory bash native/build-libraw.sh",
    "build:native:desktop": "LUMA_RAW_MEMORY_PROFILE=desktop bash native/build-libraw.sh",
    "build:native:low-memory": "LUMA_RAW_MEMORY_PROFILE=low-memory bash native/build-libraw.sh"
  }
}
```

- [ ] **Step 7: Copy profile directories in the app build**

Edit `vite.config.ts` so the RAW runtime asset set copies directories:

```ts
const NATIVE_RUNTIME_ASSETS = [
  {
    label: 'Luma RAW runtime desktop',
    packageName: '@lumaforge/luma-raw-runtime',
    sourceDir: resolve(ROOT, './packages/luma-raw-runtime/dist/native/desktop'),
    targetDir: 'native/desktop',
    files: ['luma_raw.js', 'luma_raw.wasm'],
  },
  {
    label: 'Luma RAW runtime low-memory',
    packageName: '@lumaforge/luma-raw-runtime',
    sourceDir: resolve(
      ROOT,
      './packages/luma-raw-runtime/dist/native/low-memory',
    ),
    targetDir: 'native/low-memory',
    files: ['luma_raw.js', 'luma_raw.wasm'],
  },
  {
    label: 'Luma JPEG runtime',
    packageName: '@lumaforge/luma-jpeg-runtime',
    sourceDir: resolve(ROOT, './packages/luma-jpeg-runtime/dist/native'),
    targetDir: 'native',
    files: ['luma_jpeg.js', 'luma_jpeg.wasm'],
  },
] as const
```

Update `writeBundle()` to use `assetSet.targetDir`:

```ts
const nativeOutputDir = resolve(outputDir, assetSet.targetDir)
mkdirSync(nativeOutputDir, { recursive: true })
```

- [ ] **Step 8: Run runtime package tests**

Run:

```bash
pnpm --filter @lumaforge/luma-raw-runtime test
pnpm --filter @lumaforge/luma-raw-runtime typecheck
```

Expected: PASS.

- [ ] **Step 9: Run native profile build verification**

Run:

```bash
pnpm --filter @lumaforge/luma-raw-runtime build:native
test -f packages/luma-raw-runtime/dist/native/desktop/luma_raw.js
test -f packages/luma-raw-runtime/dist/native/desktop/luma_raw.wasm
test -f packages/luma-raw-runtime/dist/native/low-memory/luma_raw.js
test -f packages/luma-raw-runtime/dist/native/low-memory/luma_raw.wasm
```

Expected: all commands exit `0`.

- [ ] **Step 10: Commit Task 2**

```bash
git add packages/luma-raw-runtime/native/emcc-flags.sh \
  packages/luma-raw-runtime/native/scripts/build-wasm.sh \
  packages/luma-raw-runtime/native/scripts/verify-native-artifacts.mjs \
  packages/luma-raw-runtime/package.json \
  packages/luma-raw-runtime/src/types.ts \
  packages/luma-raw-runtime/src/worker-protocol.ts \
  packages/luma-raw-runtime/src/runtime.ts \
  packages/luma-raw-runtime/worker/load-native-module.ts \
  packages/luma-raw-runtime/worker/runtime.worker.ts \
  packages/luma-raw-runtime/worker/runtime-core.ts \
  packages/luma-raw-runtime/src/runtime.test.ts \
  packages/luma-raw-runtime/worker/runtime-core.test.ts \
  vite.config.ts
git commit -m "feat(raw): add low-memory runtime profile"
```

### Task 3: Add Resource Registry And Pre-Export Evacuation

**Files:**

- Create: `src/lib/export/resource-registry.ts`
- Create: `src/lib/export/resource-registry.test.ts`
- Create: `src/modules/raw-processor/services/export-evacuation.ts`
- Create: `src/modules/raw-processor/services/export-evacuation.test.ts`
- Modify: `src/modules/raw-processor/hooks/useRawProcessor.ts`
- Modify: `src/modules/raw-processor/hooks/useRawProcessor.test.tsx`

- [ ] **Step 1: Write resource registry tests**

Create `src/lib/export/resource-registry.test.ts`:

```ts
import {
  createResourceRegistry,
  type LargeResourceOwner,
} from './resource-registry'

describe('resource registry', () => {
  it('tracks live resources by owner and disposes them once', async () => {
    const registry = createResourceRegistry()
    const dispose = vi.fn()

    const tracked = registry.register({
      id: 'preview-worker',
      owner: 'preview',
      kind: 'worker',
      estimatedBytes: 64 * 1024 * 1024,
      dispose,
    })

    expect(registry.snapshot().liveByOwner.preview).toBe(1)
    await tracked.dispose()
    await tracked.dispose()

    expect(dispose).toHaveBeenCalledTimes(1)
    expect(registry.assertZeroLive(['preview'])).toEqual({ ok: true })
  })

  it('reports nonzero live resources before export starts', () => {
    const registry = createResourceRegistry()
    registry.register({
      id: 'bounded-hq',
      owner: 'bounded-hq',
      kind: 'array-buffer',
      estimatedBytes: 12,
      dispose: vi.fn(),
    })

    expect(registry.assertZeroLive(['bounded-hq'])).toEqual({
      ok: false,
      live: [{ id: 'bounded-hq', owner: 'bounded-hq', kind: 'array-buffer' }],
    })
  })
})
```

- [ ] **Step 2: Implement resource registry**

Create `src/lib/export/resource-registry.ts`:

```ts
export type LargeResourceOwner =
  | 'preview'
  | 'bounded-hq'
  | 'webgl'
  | 'export-result'
  | 'export-worker'
  | 'lut-fetch'

export type LargeResourceKind =
  | 'worker'
  | 'raw-session'
  | 'webgl-pipeline'
  | 'array-buffer'
  | 'blob'
  | 'object-url'
  | 'abort-controller'

export type LargeResourceRecord = {
  id: string
  owner: LargeResourceOwner
  kind: LargeResourceKind
  estimatedBytes?: number
  dispose: () => void | Promise<void>
}

export type TrackedLargeResource = LargeResourceRecord & {
  disposed: boolean
  dispose: () => Promise<void>
}

export function createResourceRegistry() {
  const resources = new Map<string, TrackedLargeResource>()

  return {
    register(record: LargeResourceRecord): TrackedLargeResource {
      if (resources.has(record.id)) {
        throw new Error(`RESOURCE_REGISTRY_DUPLICATE_ID:${record.id}`)
      }

      let disposed = false
      const tracked: TrackedLargeResource = {
        ...record,
        get disposed() {
          return disposed
        },
        async dispose() {
          if (disposed) return
          disposed = true
          try {
            await record.dispose()
          } finally {
            resources.delete(record.id)
          }
        },
      }
      resources.set(record.id, tracked)
      return tracked
    },

    snapshot() {
      const live = [...resources.values()].map((resource) => ({
        id: resource.id,
        owner: resource.owner,
        kind: resource.kind,
        estimatedBytes: resource.estimatedBytes,
      }))
      const liveByOwner = live.reduce(
        (counts, resource) => ({
          ...counts,
          [resource.owner]: (counts[resource.owner] ?? 0) + 1,
        }),
        {} as Partial<Record<LargeResourceOwner, number>>,
      )
      return { live, liveByOwner }
    },

    async disposeOwners(owners: LargeResourceOwner[]) {
      const ownerSet = new Set(owners)
      for (const resource of [...resources.values()]) {
        if (ownerSet.has(resource.owner)) {
          await resource.dispose()
        }
      }
    },

    assertZeroLive(owners: LargeResourceOwner[]) {
      const ownerSet = new Set(owners)
      const live = [...resources.values()]
        .filter((resource) => ownerSet.has(resource.owner))
        .map((resource) => ({
          id: resource.id,
          owner: resource.owner,
          kind: resource.kind,
        }))

      return live.length === 0
        ? { ok: true as const }
        : { ok: false as const, live }
    },
  }
}
```

- [ ] **Step 3: Write evacuation service tests**

Create `src/modules/raw-processor/services/export-evacuation.test.ts`:

```ts
import { createResourceRegistry } from '~/lib/export/resource-registry'

import {
  createPreExportSnapshot,
  evacuateBeforeExport,
} from './export-evacuation'

describe('export evacuation', () => {
  it('keeps lightweight state and disposes preview-owned resources before export', async () => {
    const registry = createResourceRegistry()
    const abortPreview = vi.fn()
    const disposePipeline = vi.fn()
    registry.register({
      id: 'preview-pipeline',
      owner: 'webgl',
      kind: 'webgl-pipeline',
      dispose: disposePipeline,
    })

    const file = new File(['raw'], 'frame.RAF', { lastModified: 123 })
    const snapshot = createPreExportSnapshot({
      file,
      metadata: { make: 'Fujifilm', model: 'GFX100RF' },
      graphFingerprint: 'graph-1',
      lutTitle: 'V-Log',
      quickPreviewReady: true,
      tone: { userExposureEv: 0, userContrast: 0 },
      style: { kind: 'custom', name: 'V-Log' },
    })

    const result = await evacuateBeforeExport({
      registry,
      abortPreview,
      abortBoundedHq: vi.fn(),
      releasePreviousExportResult: vi.fn(),
      snapshot,
    })

    expect(abortPreview).toHaveBeenCalledTimes(1)
    expect(disposePipeline).toHaveBeenCalledTimes(1)
    expect(result.registryCheck).toEqual({ ok: true })
    expect(result.snapshot.file).toBe(file)
    expect(result.snapshot.quickPreviewReady).toBe(true)
  })
})
```

- [ ] **Step 4: Implement evacuation service**

Create `src/modules/raw-processor/services/export-evacuation.ts`:

```ts
import type { ExportColorGraphDescriptor } from '@lumaforge/luma-color-runtime'

import type { LargeResourceOwner } from '~/lib/export/resource-registry'

type Registry = ReturnType<
  typeof import('~/lib/export/resource-registry').createResourceRegistry
>

export type PreExportSnapshot = {
  file: File
  metadata: unknown
  graph?: ExportColorGraphDescriptor
  graphFingerprint: string
  lutTitle?: string
  quickPreviewReady: boolean
  tone: unknown
  style: unknown
}

export function createPreExportSnapshot(input: PreExportSnapshot) {
  return { ...input }
}

export async function evacuateBeforeExport(input: {
  registry: Registry
  snapshot: PreExportSnapshot
  abortPreview: () => void
  abortBoundedHq: () => void
  releasePreviousExportResult: () => void
}) {
  input.abortPreview()
  input.abortBoundedHq()
  input.releasePreviousExportResult()

  const owners: LargeResourceOwner[] = [
    'preview',
    'bounded-hq',
    'webgl',
    'export-result',
    'lut-fetch',
  ]
  await input.registry.disposeOwners(owners)
  const registryCheck = input.registry.assertZeroLive(owners)

  return {
    snapshot: input.snapshot,
    registryCheck,
    evacuatedAt: new Date().toISOString(),
  }
}
```

- [ ] **Step 5: Wire hook-owned resources to the registry**

In `src/modules/raw-processor/hooks/useRawProcessor.ts`, create one registry ref and register large resources where they are created:

```ts
import { createResourceRegistry } from '~/lib/export/resource-registry'
import {
  createPreExportSnapshot,
  evacuateBeforeExport,
} from '../services/export-evacuation'

const resourceRegistryRef = useRef(createResourceRegistry())
```

When setting `pipelineRef.current`, register the WebGL pipeline:

```ts
const registerPreviewPipeline = useCallback(
  (pipeline: RawProcessingPipeline | null) => {
    pipelineRef.current = pipeline
    if (!pipeline) return

    resourceRegistryRef.current.register({
      id: `webgl-pipeline-${sessionRef.current?.id ?? 'detached'}`,
      owner: 'webgl',
      kind: 'webgl-pipeline',
      dispose: () => pipeline.dispose({ releaseContext: true }),
    })
  },
  [],
)
```

Before full-resolution export starts, call:

```ts
const snapshot = createPreExportSnapshot({
  file: loadedImage.file,
  metadata: loadedImage.metadata,
  graph,
  graphFingerprint: JSON.stringify(graph.steps),
  lutTitle: activeStyle?.kind === 'custom' ? activeStyle.name : undefined,
  quickPreviewReady:
    session.previewBundle.quickDecodePreview.status === 'ready',
  tone: {
    userExposureEv: params.userExposureEv,
    userContrast: params.userContrast,
  },
  style: activeStyle,
})

const evacuation = await evacuateBeforeExport({
  registry: resourceRegistryRef.current,
  snapshot,
  abortPreview: abortRuntimeWork,
  abortBoundedHq: abortRuntimeWork,
  releasePreviousExportResult() {
    setSession(clearExportResultState)
  },
})

if (!evacuation.registryCheck.ok) {
  throw new Error('EXPORT_RESOURCE_EVICTION_INCOMPLETE')
}
```

- [ ] **Step 6: Add hook tests for evacuation ordering**

In `src/modules/raw-processor/hooks/useRawProcessor.test.tsx`, add a test around the export action:

```ts
it('evacuates preview resources and clears stale export result before full-resolution export', async () => {
  const oldBlob = new Blob(['old'], { type: 'image/jpeg' })
  const exportRun = vi.fn().mockResolvedValue({
    filename: 'frame_fullres.jpg',
    result: {
      kind: 'blob',
      blob: new Blob(['new'], { type: 'image/jpeg' }),
      byteLength: 3,
    },
  })

  mockRunFullResolutionExportJob(exportRun)

  const { result } = renderUseRawProcessorWithReadySession({
    exportResultBlob: oldBlob,
  })

  await act(async () => {
    await result.current.exportImage({ quality: 'high', fidelity: 'balanced' })
  })

  expect(exportRun).toHaveBeenCalledTimes(1)
  expect(result.current.exportResult?.filename).toBe('frame_fullres.jpg')
})
```

- [ ] **Step 7: Run registry and hook tests**

Run:

```bash
pnpm test:run src/lib/export/resource-registry.test.ts \
  src/modules/raw-processor/services/export-evacuation.test.ts \
  src/modules/raw-processor/hooks/useRawProcessor.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit Task 3**

```bash
git add src/lib/export/resource-registry.ts \
  src/lib/export/resource-registry.test.ts \
  src/modules/raw-processor/services/export-evacuation.ts \
  src/modules/raw-processor/services/export-evacuation.test.ts \
  src/modules/raw-processor/hooks/useRawProcessor.ts \
  src/modules/raw-processor/hooks/useRawProcessor.test.tsx
git commit -m "feat(export): evacuate preview resources before full-res export"
```

### Task 4: Add Source Fingerprints And Safe-Retry Checkpoints

**Files:**

- Create: `src/lib/export/source-fingerprint.ts`
- Create: `src/lib/export/source-fingerprint.test.ts`
- Create: `src/lib/export/checkpoint-store.ts`
- Create: `src/lib/export/checkpoint-store.test.ts`

- [ ] **Step 1: Write source fingerprint tests**

Create `src/lib/export/source-fingerprint.test.ts`:

```ts
import {
  createSourceFingerprint,
  sourceFingerprintMatches,
} from './source-fingerprint'

describe('source fingerprint', () => {
  it('matches the same selected RAW facts', async () => {
    const file = new File(['abcdef'], 'frame.RAF', { lastModified: 123 })
    const fingerprint = await createSourceFingerprint(file, {
      width: 11662,
      height: 8746,
    })

    await expect(
      sourceFingerprintMatches(file, fingerprint, {
        width: 11662,
        height: 8746,
      }),
    ).resolves.toBe(true)
  })

  it('rejects same name and size with a different hash prefix', async () => {
    const first = new File(['abcdef'], 'frame.RAF', { lastModified: 123 })
    const second = new File(['abcdeg'], 'frame.RAF', { lastModified: 123 })
    const fingerprint = await createSourceFingerprint(first, {
      width: 1,
      height: 1,
    })

    await expect(
      sourceFingerprintMatches(second, fingerprint, { width: 1, height: 1 }),
    ).resolves.toBe(false)
  })
})
```

- [ ] **Step 2: Implement source fingerprinting**

Create `src/lib/export/source-fingerprint.ts`:

```ts
export type SourceFingerprint = {
  name: string
  size: number
  lastModified: number
  width?: number
  height?: number
  hashPrefixHex: string
}

function toHex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export async function createSourceFingerprint(
  file: File,
  facts: { width?: number; height?: number } = {},
): Promise<SourceFingerprint> {
  const prefix = file.slice(0, Math.min(file.size, 1024 * 1024))
  const digest = await crypto.subtle.digest(
    'SHA-256',
    await prefix.arrayBuffer(),
  )
  return {
    name: file.name,
    size: file.size,
    lastModified: file.lastModified,
    width: facts.width,
    height: facts.height,
    hashPrefixHex: toHex(digest),
  }
}

export async function sourceFingerprintMatches(
  file: File,
  expected: SourceFingerprint,
  facts: { width?: number; height?: number } = {},
) {
  if (file.name !== expected.name) return false
  if (file.size !== expected.size) return false
  if (file.lastModified !== expected.lastModified) return false
  if (expected.width !== undefined && facts.width !== expected.width)
    return false
  if (expected.height !== undefined && facts.height !== expected.height)
    return false

  const actual = await createSourceFingerprint(file, facts)
  return actual.hashPrefixHex === expected.hashPrefixHex
}
```

- [ ] **Step 3: Write checkpoint tests**

Create `src/lib/export/checkpoint-store.test.ts`:

```ts
import {
  createMemoryCheckpointBackend,
  createCheckpointStore,
  type ExportCheckpointManifest,
} from './checkpoint-store'

function manifest(overrides: Partial<ExportCheckpointManifest> = {}) {
  return {
    version: 1,
    exportId: 'export-1',
    sourceFingerprint: {
      name: 'frame.RAF',
      size: 3,
      lastModified: 123,
      hashPrefixHex: 'abc',
    },
    fileName: 'frame.RAF',
    sourceSize: 3,
    sourceLastModified: 123,
    outputWidth: 11662,
    outputHeight: 8746,
    graphFingerprint: 'graph-1',
    profile: 'ios-safe',
    attempt: 1,
    preferredRows: 64,
    totalRows: 8746,
    recoveryMode: 'safe-retry',
    outputSink: 'opfs-file',
    sourceReacquisition: 'user-reselect-required',
    completedRowsForDiagnostics: 64,
    jpegState: 'restart-required',
    updatedAt: '2026-05-01T00:00:00.000Z',
    ...overrides,
  } satisfies ExportCheckpointManifest
}

describe('checkpoint store', () => {
  it('writes and scans active safe-retry manifests', async () => {
    const backend = createMemoryCheckpointBackend()
    const store = createCheckpointStore(backend)

    await store.writeActive(manifest())

    await expect(store.listActive()).resolves.toEqual([manifest()])
  })

  it('rejects row resume manifests in MVP recovery decisions', async () => {
    const backend = createMemoryCheckpointBackend()
    const store = createCheckpointStore(backend)
    await store.writeActive(
      manifest({ recoveryMode: 'row-resume', jpegState: 'resumable' }),
    )

    await expect(store.listSafeRetryCandidates()).resolves.toEqual([])
  })
})
```

- [ ] **Step 4: Implement checkpoint store**

Create `src/lib/export/checkpoint-store.ts`:

```ts
import type {
  ExportCheckpointMode,
  ExportExecutionProfileName,
  ExportOutputSink,
} from './execution-profile'
import type { SourceFingerprint } from './source-fingerprint'

export type SourceReacquisitionMode =
  | 'current-session-file'
  | 'persisted-file-handle'
  | 'user-reselect-required'
  | 'opfs-source-copy'

export type ExportCheckpointManifest = {
  version: 1
  exportId: string
  sourceFingerprint: SourceFingerprint
  fileName: string
  sourceSize: number
  sourceLastModified: number
  outputWidth: number
  outputHeight: number
  graphFingerprint: string
  profile: ExportExecutionProfileName
  attempt: number
  preferredRows: number
  totalRows: number
  recoveryMode: ExportCheckpointMode
  outputSink: ExportOutputSink
  sourceReacquisition: SourceReacquisitionMode
  completedRowsForDiagnostics: number
  nextRowForResume?: number
  jpegState: 'restart-required' | 'resumable'
  chunks?: Array<{
    index: number
    startRow: number
    rowCount: number
    byteLength: number
  }>
  updatedAt: string
}

export type CheckpointBackend = {
  write: (exportId: string, manifest: ExportCheckpointManifest) => Promise<void>
  list: () => Promise<ExportCheckpointManifest[]>
  remove: (exportId: string) => Promise<void>
}

export function createMemoryCheckpointBackend(): CheckpointBackend {
  const manifests = new Map<string, ExportCheckpointManifest>()
  return {
    async write(exportId, manifest) {
      manifests.set(exportId, manifest)
    },
    async list() {
      return [...manifests.values()]
    },
    async remove(exportId) {
      manifests.delete(exportId)
    },
  }
}

export function normalizeSafeRetryManifest(
  manifest: ExportCheckpointManifest,
): ExportCheckpointManifest {
  return {
    ...manifest,
    recoveryMode: 'safe-retry',
    jpegState: 'restart-required',
    nextRowForResume: undefined,
    chunks: undefined,
  }
}

export function createCheckpointStore(backend: CheckpointBackend) {
  return {
    writeActive(manifest: ExportCheckpointManifest) {
      return backend.write(
        manifest.exportId,
        normalizeSafeRetryManifest(manifest),
      )
    },
    listActive() {
      return backend.list()
    },
    async listSafeRetryCandidates() {
      return (await backend.list()).filter(
        (manifest) =>
          manifest.recoveryMode === 'safe-retry' &&
          manifest.jpegState === 'restart-required',
      )
    },
    remove(exportId: string) {
      return backend.remove(exportId)
    },
  }
}
```

- [ ] **Step 5: Add OPFS backend**

Extend `src/lib/export/checkpoint-store.ts`:

```ts
export function createOpfsCheckpointBackend(
  storage: StorageManager = navigator.storage,
): CheckpointBackend {
  const rootPromise = storage.getDirectory()

  async function activeDirectory() {
    const root = await rootPromise
    const exportsDir = await root.getDirectoryHandle('.lumaforge-exports', {
      create: true,
    })
    return exportsDir.getDirectoryHandle('active', { create: true })
  }

  return {
    async write(exportId, manifest) {
      const active = await activeDirectory()
      const dir = await active.getDirectoryHandle(exportId, { create: true })
      const file = await dir.getFileHandle('manifest.json', { create: true })
      const writable = await file.createWritable()
      await writable.write(JSON.stringify(manifest))
      await writable.close()
    },
    async list() {
      const active = await activeDirectory()
      const manifests: ExportCheckpointManifest[] = []
      for await (const [, handle] of active.entries()) {
        if (handle.kind !== 'directory') continue
        try {
          const fileHandle = await handle.getFileHandle('manifest.json')
          const file = await fileHandle.getFile()
          manifests.push(
            JSON.parse(await file.text()) as ExportCheckpointManifest,
          )
        } catch {
          continue
        }
      }
      return manifests
    },
    async remove(exportId) {
      const active = await activeDirectory()
      await active.removeEntry(exportId, { recursive: true })
    },
  }
}
```

- [ ] **Step 6: Run checkpoint tests**

Run:

```bash
pnpm test:run src/lib/export/source-fingerprint.test.ts src/lib/export/checkpoint-store.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 4**

```bash
git add src/lib/export/source-fingerprint.ts \
  src/lib/export/source-fingerprint.test.ts \
  src/lib/export/checkpoint-store.ts \
  src/lib/export/checkpoint-store.test.ts
git commit -m "feat(export): add safe-retry checkpoints"
```

### Task 5: Add File-Backed Output Result References

**Files:**

- Create: `src/lib/export/output-sink.ts`
- Create: `src/lib/export/output-sink.test.ts`
- Modify: `src/modules/raw-processor/model/export-result.ts`
- Modify: `src/modules/raw-processor/services/export-result-actions.ts`
- Modify: `src/modules/raw-processor/services/export-result-actions.test.ts`
- Modify: `src/lib/export/jpeg/row-writer.ts`
- Modify: `src/lib/export/jpeg/wasm-row-sink.ts`
- Modify: `packages/luma-jpeg-runtime/src/runtime.ts`
- Modify: `packages/luma-jpeg-runtime/worker/runtime-core.ts`
- Modify: `packages/luma-jpeg-runtime/worker/native-adapter.ts`
- Modify: `packages/luma-jpeg-runtime/worker/runtime-core.test.ts`
- Modify: `packages/luma-jpeg-runtime/src/runtime.test.ts`

- [ ] **Step 1: Write output result tests**

Create `src/lib/export/output-sink.test.ts`:

```ts
import {
  createBlobOutputResult,
  createMemoryFileBackedOutputResult,
  materializeOutputBlob,
} from './output-sink'

describe('export output sink', () => {
  it('materializes file-backed output only at handoff', async () => {
    const result = createMemoryFileBackedOutputResult({
      exportId: 'export-1',
      filename: 'frame.jpg',
      mimeType: 'image/jpeg',
      bytes: new Uint8Array([1, 2, 3]),
    })

    expect(result.kind).toBe('file-backed')
    expect(result.byteLength).toBe(3)
    await expect(materializeOutputBlob(result)).resolves.toMatchObject({
      type: 'image/jpeg',
      size: 3,
    })
  })

  it('keeps Blob-backed output explicit for non-ios handoff', async () => {
    const blob = new Blob(['jpeg'], { type: 'image/jpeg' })
    const result = createBlobOutputResult({ blob, filename: 'frame.jpg' })

    await expect(materializeOutputBlob(result)).resolves.toBe(blob)
  })
})
```

- [ ] **Step 2: Implement output result helpers**

Create `src/lib/export/output-sink.ts`:

```ts
export type BlobOutputResult = {
  kind: 'blob'
  filename: string
  blob: Blob
  byteLength: number
  mimeType: string
}

export type FileBackedOutputResult = {
  kind: 'file-backed'
  exportId: string
  filename: string
  byteLength: number
  mimeType: string
  openBlob: () => Promise<Blob>
  cleanup?: () => Promise<void>
}

export type ExportOutputResult = BlobOutputResult | FileBackedOutputResult

export function createBlobOutputResult(input: {
  filename: string
  blob: Blob
}): BlobOutputResult {
  return {
    kind: 'blob',
    filename: input.filename,
    blob: input.blob,
    byteLength: input.blob.size,
    mimeType: input.blob.type || 'image/jpeg',
  }
}

export function createMemoryFileBackedOutputResult(input: {
  exportId: string
  filename: string
  mimeType: string
  bytes: Uint8Array
}): FileBackedOutputResult {
  const bytes = new Uint8Array(input.bytes)
  return {
    kind: 'file-backed',
    exportId: input.exportId,
    filename: input.filename,
    byteLength: bytes.byteLength,
    mimeType: input.mimeType,
    openBlob: async () => new Blob([bytes], { type: input.mimeType }),
  }
}

export async function materializeOutputBlob(result: ExportOutputResult) {
  if (result.kind === 'blob') return result.blob
  return result.openBlob()
}
```

- [ ] **Step 3: Update export result model and actions**

Edit `src/modules/raw-processor/model/export-result.ts`:

```ts
import type { ExportOutputResult } from '~/lib/export/output-sink'

export type ExportResult = {
  output: ExportOutputResult
  filename: string
  width: number
  height: number
  size: number
  createdAt: number
  copyCapability: ExportCopyCapability
}

export function createExportResult({
  output,
  filename = output.filename,
  width,
  height,
  now = () => Date.now(),
  copyCapability,
}: {
  output: ExportOutputResult
  filename?: string
  width: number
  height: number
  now?: () => number
  copyCapability: ExportCopyCapability
}): ExportResult {
  return {
    output,
    filename,
    width,
    height,
    size: output.byteLength,
    createdAt: now(),
    copyCapability,
  }
}
```

Edit `src/modules/raw-processor/services/export-result-actions.ts`:

```ts
import { materializeOutputBlob } from '~/lib/export/output-sink'

async function createShareProbeFile(result: ExportResult) {
  return new File([], result.filename, {
    type: result.output.mimeType || 'image/jpeg',
    lastModified: result.createdAt,
  })
}

async function createShareFile(result: ExportResult) {
  const blob = await materializeOutputBlob(result.output)
  return new File([blob], result.filename, {
    type: blob.type || 'image/jpeg',
    lastModified: result.createdAt,
  })
}

export async function downloadExportResult(
  result: ExportResult,
  environment: { document?: Document; URL?: typeof URL } = {},
) {
  const documentLike = environment.document ?? document
  const urlLike = environment.URL ?? URL
  const blob = await materializeOutputBlob(result.output)
  const url = urlLike.createObjectURL(blob)
  const link = documentLike.createElement('a')

  link.href = url
  link.download = result.filename
  documentLike.body.append(link)
  link.click()
  link.remove()
  urlLike.revokeObjectURL(url)
}

export async function shareExportResult(
  result: ExportResult,
  navigatorLike: Navigator = navigator,
) {
  const capability = await resolveExportShareCapability(result, navigatorLike)
  if (!capability.available) throw new Error(capability.reason)

  await navigatorLike.share({
    files: [await createShareFile(result)],
    title: result.filename,
  })
}

export async function copyBlobToClipboard(
  result: ExportResult,
  environment: ClipboardEnvironment = globalThis,
) {
  const blob = await materializeOutputBlob(result.output)
  const clipboard = environment.navigator?.clipboard
  const ClipboardItemCtor = environment.ClipboardItem

  if (typeof clipboard?.write !== 'function' || !ClipboardItemCtor) {
    throw new Error('Clipboard image copy is not supported in this browser.')
  }

  const type = blob.type || 'image/jpeg'
  await clipboard.write([new ClipboardItemCtor({ [type]: blob })])
}
```

- [ ] **Step 4: Add chunk callback to JPEG runtime API**

Edit `packages/luma-jpeg-runtime/src/runtime.ts`:

```ts
export type LumaJpegChunk = {
  bytes: Uint8Array
  byteOffset: number
  final: boolean
}

export type LumaJpegRuntimeOptions = {
  workerFactory?: () => Worker
  onChunk?: (chunk: LumaJpegChunk) => void | Promise<void>
}
```

Handle worker chunk responses before resolving request responses:

```ts
if (response.ok && response.type === 'chunk') {
  void options.onChunk?.(response.payload)
  return
}
```

Edit `packages/luma-jpeg-runtime/worker/runtime-core.ts` to add the response:

```ts
export type JpegWorkerResponse =
  | ExistingResponses
  | {
      id: string
      ok: true
      type: 'chunk'
      payload: { bytes: Uint8Array; byteOffset: number; final: boolean }
    }
```

When the native backend exposes chunks, post them before the `finish` response. Keep the existing Blob `finish` path for non-iOS and tests.

- [ ] **Step 5: Wire row writer to output handles**

Edit `src/lib/export/jpeg/row-writer.ts`:

```ts
import type { ExportOutputResult } from '../output-sink'

export type JpegRowSinkSession = {
  writeRows: (rgbRows: Uint8Array, rowCount: number) => Promise<void>
  close: () => Promise<ExportOutputResult>
  abort: () => Promise<void> | void
}

export type JpegRowWriter = {
  writeRows: (rgbRows: Uint8Array, rowCount: number) => Promise<void>
  close: () => Promise<ExportOutputResult>
  abort: () => Promise<void>
}
```

Edit `src/lib/export/jpeg/wasm-row-sink.ts`:

```ts
import {
  createBlobOutputResult,
  type ExportOutputResult,
} from '../output-sink'

async close(): Promise<ExportOutputResult> {
  const blob = await encoder.finish()
  state = 'closed'
  disposeRuntime()
  return createBlobOutputResult({
    filename: 'export.jpg',
    blob,
  })
}
```

The OPFS-backed chunk sink is added in Task 6 when the export worker knows `exportId` and filename.

- [ ] **Step 6: Update tests**

Run:

```bash
pnpm test:run src/lib/export/output-sink.test.ts \
  src/modules/raw-processor/services/export-result-actions.test.ts \
  src/lib/export/jpeg/row-writer.test.ts \
  src/lib/export/jpeg/wasm-row-sink.test.ts \
  packages/luma-jpeg-runtime/src/runtime.test.ts \
  packages/luma-jpeg-runtime/worker/runtime-core.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 5**

```bash
git add src/lib/export/output-sink.ts \
  src/lib/export/output-sink.test.ts \
  src/modules/raw-processor/model/export-result.ts \
  src/modules/raw-processor/services/export-result-actions.ts \
  src/modules/raw-processor/services/export-result-actions.test.ts \
  src/lib/export/jpeg/row-writer.ts \
  src/lib/export/jpeg/wasm-row-sink.ts \
  src/lib/export/jpeg/row-writer.test.ts \
  src/lib/export/jpeg/wasm-row-sink.test.ts \
  packages/luma-jpeg-runtime/src/runtime.ts \
  packages/luma-jpeg-runtime/worker/runtime-core.ts \
  packages/luma-jpeg-runtime/worker/native-adapter.ts \
  packages/luma-jpeg-runtime/src/runtime.test.ts \
  packages/luma-jpeg-runtime/worker/runtime-core.test.ts
git commit -m "feat(export): support file-backed JPEG handoff"
```

### Task 6: Add Fresh-Worker Retry And Worker Checkpoint Plumbing

**Files:**

- Modify: `src/lib/export/full-res-export.ts`
- Modify: `src/lib/export/full-res-export.test.ts`
- Modify: `src/lib/export/full-res-export-client.ts`
- Modify: `src/lib/export/full-res-export-client.test.ts`
- Modify: `src/lib/export/full-res-export.worker.ts`
- Modify: `src/lib/export/full-res-export.worker.test.ts`
- Modify: `src/modules/raw-processor/services/export-system.ts`
- Modify: `src/modules/raw-processor/__tests__/export-system.test.ts`

- [ ] **Step 1: Write worker-client plan propagation tests**

Add to `src/lib/export/full-res-export-client.test.ts`:

```ts
it('passes execution plan and checkpoint config to the worker', async () => {
  const worker = new FakeWorker()
  const client = new FullResolutionExportWorkerClient(
    () => worker as unknown as Worker,
  )

  const run = client.run({
    file: new File(['raw'], 'sample.RAF'),
    graph: supportedGraph,
    executionPlan: {
      profileName: 'ios-safe',
      preferredRows: 64,
      concurrency: 1,
      runtimeMemoryProfile: 'low-memory',
      outputSink: 'opfs-file',
      checkpointMode: 'safe-retry',
    },
    checkpoint: {
      exportId: 'export-1',
      graphFingerprint: 'graph-1',
      sourceFingerprint: {
        name: 'sample.RAF',
        size: 3,
        lastModified: 0,
        hashPrefixHex: 'abc',
      },
    },
  })

  const start = worker.requests[0]
  expect(start).toMatchObject({
    kind: 'start',
    executionPlan: {
      profileName: 'ios-safe',
      preferredRows: 64,
      runtimeMemoryProfile: 'low-memory',
    },
  })

  if (!start || start.kind !== 'start') throw new Error('missing start request')
  worker.emit({
    kind: 'success',
    requestId: start.requestId,
    result: {
      kind: 'blob',
      filename: 'sample.jpg',
      blob: new Blob(['jpeg'], { type: 'image/jpeg' }),
      byteLength: 4,
      mimeType: 'image/jpeg',
    },
  })

  await expect(run).resolves.toMatchObject({ kind: 'blob' })
})
```

- [ ] **Step 2: Extend worker message types**

Edit `src/lib/export/full-res-export-client.ts`:

```ts
import type { ExportOutputResult } from './output-sink'
import type {
  ExportCheckpointMode,
  ExportExecutionProfileName,
  ExportOutputSink,
  ExportRuntimeMemoryProfile,
} from './execution-profile'
import type { SourceFingerprint } from './source-fingerprint'

export type FullResWorkerExecutionPlan = {
  profileName: ExportExecutionProfileName
  preferredRows: number
  concurrency: number
  runtimeMemoryProfile: ExportRuntimeMemoryProfile
  outputSink: ExportOutputSink
  checkpointMode: ExportCheckpointMode
}

export type FullResWorkerCheckpointConfig = {
  exportId: string
  graphFingerprint: string
  sourceFingerprint: SourceFingerprint
}

export type FullResExportWorkerStartMessage = {
  kind: 'start'
  requestId: string
  file: File
  graph: ExportColorGraphDescriptor
  executionPlan?: FullResWorkerExecutionPlan
  checkpoint?: FullResWorkerCheckpointConfig
  preferredRows?: number
  concurrency?: number
  quality?: number
  collectMetrics: boolean
}

export type FullResExportWorkerSuccessMessage = {
  kind: 'success'
  requestId: string
  result: ExportOutputResult
}
```

Update `PendingRequest.resolve` and `run()` to resolve `ExportOutputResult` instead of `Blob`.

- [ ] **Step 3: Surface resource failures for fresh-worker retry**

Edit `src/lib/export/full-res-export.ts` to support a caller-managed retry policy:

```ts
export type RunFullResolutionJpegExportInput = {
  // existing fields
  retryPolicy?: 'in-process' | 'surface-resource-failure'
  onCheckpoint?: (entry: {
    completedRowsForDiagnostics: number
    totalRows: number
    stripRows: number
  }) => void | Promise<void>
}

export class FullResExportResourceFailure extends Error {
  readonly nextRows: number

  constructor(nextRows: number) {
    super('FULL_RES_EXPORT_RESOURCE_FAILURE')
    this.name = 'FullResExportResourceFailure'
    this.nextRows = nextRows
  }
}
```

In the resource-failure catch branch:

```ts
const nextStripRows = reduceStripRows(stripRows, MIN_EXPORT_STRIP_ROWS)

if (input.retryPolicy === 'surface-resource-failure') {
  throw new FullResExportResourceFailure(nextStripRows)
}
```

After each committed strip, call:

```ts
await input.onCheckpoint?.({
  completedRowsForDiagnostics: Math.min(
    input.capability.height,
    completedStrips * stripRows,
  ),
  totalRows: input.capability.height,
  stripRows,
})
```

- [ ] **Step 4: Select low-memory runtime in worker**

Edit `src/lib/export/full-res-export.worker.ts`:

```ts
const runtime = createLumaRawRuntime({
  memoryProfile: message.executionPlan?.runtimeMemoryProfile ?? 'desktop',
  requireCrossOriginIsolation:
    (message.executionPlan?.runtimeMemoryProfile ?? 'desktop') === 'desktop',
})
```

Pass plan fields to export:

```ts
return runFullResolutionJpegExport({
  capability,
  graph: message.graph,
  preferredRows: message.executionPlan?.preferredRows ?? message.preferredRows,
  concurrency: message.executionPlan?.concurrency ?? message.concurrency,
  quality: message.quality,
  signal: controller.signal,
  readProcessedWindow: exportSession.readProcessedWindow,
  retryPolicy:
    message.executionPlan?.profileName === 'ios-safe'
      ? 'surface-resource-failure'
      : 'in-process',
  onCheckpoint: message.checkpoint
    ? async (entry) => {
        self.postMessage({
          kind: 'metric',
          requestId: message.requestId,
          metric: {
            kind: 'checkpoint',
            requestId: message.requestId,
            completedRowsForDiagnostics: entry.completedRowsForDiagnostics,
            totalRows: entry.totalRows,
            stripRows: entry.stripRows,
            timestamp: new Date().toISOString(),
          },
        } satisfies FullResExportWorkerResponse)
      }
    : undefined,
})
```

- [ ] **Step 5: Add fresh-worker retry loop in export-system**

Edit `src/modules/raw-processor/services/export-system.ts`:

```ts
function errorLooksLikeFreshWorkerRetry(error: unknown) {
  return (
    error instanceof Error &&
    (error.message === 'FULL_RES_EXPORT_RESOURCE_FAILURE' ||
      error.message === 'FULL_RES_EXPORT_WORKER_FAILED')
  )
}

export async function runFullResolutionExportJob(input: {
  file: File
  filename: string
  graph: ExportColorGraphDescriptor
  quality?: number
  executionPlan?: ExportExecutionPlan
  onProgress?: (progress: FullResolutionExportProgress) => void
  signal?: AbortSignal
  clientFactory?: () => FullResolutionExportWorkerClient
}) {
  let plan = input.executionPlan
  let attempts = 0

  while (true) {
    attempts += 1
    const client = input.clientFactory?.() ?? createFullResolutionExportClient()
    try {
      const result = await client.run({
        file: input.file,
        graph: input.graph,
        quality: input.quality,
        preferredRows: plan?.preferredRows,
        concurrency: plan?.concurrency,
        executionPlan: plan
          ? {
              profileName: plan.profile.name,
              preferredRows: plan.preferredRows,
              concurrency: plan.concurrency,
              runtimeMemoryProfile: plan.runtimeMemoryProfile,
              outputSink: plan.outputSink,
              checkpointMode: plan.checkpointMode,
            }
          : undefined,
        onProgress: input.onProgress,
        signal: input.signal,
      })
      return { filename: input.filename, result, attempts }
    } catch (error) {
      client.dispose()
      if (
        !plan?.profile.restartWorkerOnResourceRetry ||
        attempts >= 3 ||
        !errorLooksLikeFreshWorkerRetry(error)
      ) {
        throw error
      }
      plan = {
        ...plan,
        preferredRows: Math.max(
          plan.profile.minRows,
          Math.floor(plan.preferredRows / 2),
        ),
        concurrency: 1,
        productCopy: 'resource-retry',
      }
    } finally {
      client.dispose()
    }
  }
}
```

- [ ] **Step 6: Run worker/export tests**

Run:

```bash
pnpm test:run src/lib/export/full-res-export.test.ts \
  src/lib/export/full-res-export-client.test.ts \
  src/lib/export/full-res-export.worker.test.ts \
  src/modules/raw-processor/__tests__/export-system.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 6**

```bash
git add src/lib/export/full-res-export.ts \
  src/lib/export/full-res-export.test.ts \
  src/lib/export/full-res-export-client.ts \
  src/lib/export/full-res-export-client.test.ts \
  src/lib/export/full-res-export.worker.ts \
  src/lib/export/full-res-export.worker.test.ts \
  src/modules/raw-processor/services/export-system.ts \
  src/modules/raw-processor/__tests__/export-system.test.ts
git commit -m "feat(export): retry ios resource failures in fresh workers"
```

### Task 7: Integrate Safe Export State Into The RAW Processor UI

**Files:**

- Modify: `src/modules/raw-processor/model/session.ts`
- Modify: `src/modules/raw-processor/model/derive-session.ts`
- Modify: `src/modules/raw-processor/hooks/useRawProcessor.ts`
- Modify: `src/modules/raw-processor/hooks/useRawProcessor.test.tsx`
- Modify: `src/modules/raw-processor/components/tools/ExportTool.tsx`
- Modify: `src/modules/raw-processor/components/tools/ExportTool.test.tsx`
- Modify: `src/modules/raw-processor/components/ProgressOverlay.tsx`

- [ ] **Step 1: Extend session model**

Edit `src/modules/raw-processor/model/session.ts`:

```ts
import type {
  ExportCheckpointMode,
  ExportExecutionProfileName,
  ExportOutputSink,
  ExportRuntimeMemoryProfile,
} from '~/lib/export/execution-profile'

export type ExportRecoveryState =
  | { status: 'none' }
  | {
      status: 'source-required'
      exportId: string
      message: string
      expectedFileName: string
    }
  | {
      status: 'ready-to-retry'
      exportId: string
      message: string
    }

export type ActiveExportPlanState = {
  profileName: ExportExecutionProfileName
  preferredRows: number
  concurrency: number
  runtimeMemoryProfile: ExportRuntimeMemoryProfile
  outputSink: ExportOutputSink
  checkpointMode: ExportCheckpointMode
}
```

Add fields inside `exportState`:

```ts
activePlan?: ActiveExportPlanState
recovery: ExportRecoveryState
checkpointDurable: boolean
```

Initialize new sessions with:

```ts
recovery: { status: 'none' },
checkpointDurable: false,
```

- [ ] **Step 2: Update hook export flow**

In `src/modules/raw-processor/hooks/useRawProcessor.ts`, replace the export call setup with:

```ts
const executionPlan = selectCurrentExportExecutionPlan({
  fidelity,
  sourceWidth: session.exportState.fullResCapability.width,
  sourceHeight: session.exportState.fullResCapability.height,
})

setSession((prev) =>
  prev
    ? {
        ...prev,
        exportState: {
          ...prev.exportState,
          status: 'exporting',
          qualityPreset: quality,
          fidelityLevel: fidelity,
          activePlan: {
            profileName: executionPlan.profile.name,
            preferredRows: executionPlan.preferredRows,
            concurrency: executionPlan.concurrency,
            runtimeMemoryProfile: executionPlan.runtimeMemoryProfile,
            outputSink: executionPlan.outputSink,
            checkpointMode: executionPlan.checkpointMode,
          },
          checkpointDurable: executionPlan.outputSink === 'opfs-file',
          result: undefined,
          lastProgress: undefined,
          retryRecommended: false,
          recommendedRetryLevel: undefined,
        },
      }
    : prev,
)

const result = await runFullResolutionExportJob({
  file: loadedImage.file,
  filename,
  quality: quality === 'high' ? 0.92 : 0.86,
  executionPlan,
  graph,
  onProgress,
  signal: exportAbortController.signal,
})
```

When creating the final export result:

```ts
const exportResult = createExportResult({
  output: result.result,
  filename: result.filename,
  width: completedCapability.width,
  height: completedCapability.height,
  copyCapability: resolveExportCopyCapability(),
})
```

- [ ] **Step 3: Update UI copy**

Edit `src/modules/raw-processor/components/tools/ExportTool.tsx` props:

```ts
activePlan?: ActiveExportPlanState
recovery?: ExportRecoveryState
checkpointDurable?: boolean
```

Render safe mode copy above the export button:

```tsx
{
  activePlan?.profileName === 'ios-safe' && (
    <p className="raw-tool-note">
      This device is using low-memory export mode. Export may take longer.
    </p>
  )
}
{
  checkpointDurable === false && activePlan?.profileName === 'ios-safe' && (
    <p className="raw-tool-note">
      This browser cannot store export progress. Keep the tab open while the
      JPEG is being written.
    </p>
  )
}
{
  recovery?.status === 'source-required' && (
    <p className="raw-tool-note">{recovery.message}</p>
  )
}
```

- [ ] **Step 4: Update progress overlay copy**

Edit `src/modules/raw-processor/components/ProgressOverlay.tsx`:

```ts
const activePlan =
  phase === 'exporting' ? session?.exportState.activePlan : undefined
const exportProfileCopy =
  activePlan?.profileName === 'ios-safe'
    ? `Safe export · ${activePlan.preferredRows} rows · 1 worker`
    : activePlan
      ? `High-performance export · ${activePlan.preferredRows} rows · ${activePlan.concurrency} workers`
      : undefined
```

Render it below strip progress:

```tsx
{
  exportProfileCopy && (
    <p className="mt-2 text-xs tabular-nums text-[oklch(0.91_0.02_86_/_0.82)]">
      {exportProfileCopy}
    </p>
  )
}
```

- [ ] **Step 5: Add UI tests**

Add to `src/modules/raw-processor/components/tools/ExportTool.test.tsx`:

```ts
it('shows low-memory and non-durable checkpoint copy for ios-safe export', () => {
  render(
    <ExportTool
      canExport
      isProcessing={false}
      onExport={vi.fn()}
      exportResult={null}
      exportShareCapability={{ available: false, reason: 'Export a JPEG before sharing.' }}
      onShareExport={vi.fn()}
      onDownloadExport={vi.fn()}
      onCopyExport={vi.fn()}
      activePlan={{
        profileName: 'ios-safe',
        preferredRows: 64,
        concurrency: 1,
        runtimeMemoryProfile: 'low-memory',
        outputSink: 'blob-handoff',
        checkpointMode: 'safe-retry',
      }}
      checkpointDurable={false}
      recovery={{ status: 'none' }}
    />,
  )

  expect(screen.getByText(/low-memory export mode/i)).toBeInTheDocument()
  expect(screen.getByText(/cannot store export progress/i)).toBeInTheDocument()
})
```

- [ ] **Step 6: Run hook/UI tests**

Run:

```bash
pnpm test:run src/modules/raw-processor/hooks/useRawProcessor.test.tsx \
  src/modules/raw-processor/components/tools/ExportTool.test.tsx \
  src/modules/raw-processor/components/PreviewCanvas.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 7**

```bash
git add src/modules/raw-processor/model/session.ts \
  src/modules/raw-processor/model/derive-session.ts \
  src/modules/raw-processor/hooks/useRawProcessor.ts \
  src/modules/raw-processor/hooks/useRawProcessor.test.tsx \
  src/modules/raw-processor/components/tools/ExportTool.tsx \
  src/modules/raw-processor/components/tools/ExportTool.test.tsx \
  src/modules/raw-processor/components/ProgressOverlay.tsx
git commit -m "feat(raw): surface safe export state"
```

### Task 8: Add Interrupted Export Recovery And Source Reselect

**Files:**

- Create: `src/modules/raw-processor/services/export-recovery.ts`
- Create: `src/modules/raw-processor/services/export-recovery.test.ts`
- Modify: `src/modules/raw-processor/hooks/useRawProcessor.ts`
- Modify: `src/modules/raw-processor/hooks/useRawProcessor.test.tsx`
- Modify: `src/modules/raw-processor/RawProcessorView.tsx`
- Modify: `src/modules/raw-processor/components/tools/ExportTool.tsx`

- [ ] **Step 1: Write recovery service tests**

Create `src/modules/raw-processor/services/export-recovery.test.ts`:

```ts
import type { ExportCheckpointManifest } from '~/lib/export/checkpoint-store'
import { sourceFingerprintMatches } from '~/lib/export/source-fingerprint'

import {
  createInterruptedExportRecovery,
  validateRecoveryReselection,
} from './export-recovery'

vi.mock('~/lib/export/source-fingerprint', () => ({
  sourceFingerprintMatches: vi.fn(),
}))

function manifest(): ExportCheckpointManifest {
  return {
    version: 1,
    exportId: 'export-1',
    sourceFingerprint: {
      name: 'frame.RAF',
      size: 3,
      lastModified: 123,
      hashPrefixHex: 'abc',
    },
    fileName: 'frame.RAF',
    sourceSize: 3,
    sourceLastModified: 123,
    outputWidth: 11662,
    outputHeight: 8746,
    graphFingerprint: 'graph-1',
    profile: 'ios-safe',
    attempt: 1,
    preferredRows: 64,
    totalRows: 8746,
    recoveryMode: 'safe-retry',
    outputSink: 'opfs-file',
    sourceReacquisition: 'user-reselect-required',
    completedRowsForDiagnostics: 64,
    jpegState: 'restart-required',
    updatedAt: '2026-05-01T00:00:00.000Z',
  }
}

describe('export recovery', () => {
  it('creates source-required copy without saying resume', () => {
    const recovery = createInterruptedExportRecovery(manifest())

    expect(recovery.status).toBe('source-required')
    expect(recovery.message).toMatch(/reselect the same RAW file/i)
    expect(recovery.message).toMatch(/retry/i)
    expect(recovery.message).not.toMatch(/resume/i)
  })

  it('accepts a reselected matching source', async () => {
    vi.mocked(sourceFingerprintMatches).mockResolvedValue(true)

    await expect(
      validateRecoveryReselection(new File(['raw'], 'frame.RAF'), manifest()),
    ).resolves.toEqual({ ok: true })
  })
})
```

- [ ] **Step 2: Implement recovery service**

Create `src/modules/raw-processor/services/export-recovery.ts`:

```ts
import type { ExportCheckpointManifest } from '~/lib/export/checkpoint-store'
import { sourceFingerprintMatches } from '~/lib/export/source-fingerprint'

export function createInterruptedExportRecovery(
  manifest: ExportCheckpointManifest,
) {
  return {
    status: 'source-required' as const,
    exportId: manifest.exportId,
    expectedFileName: manifest.fileName,
    manifest,
    message:
      'The browser interrupted the previous export. Please reselect the same RAW file so LumaForge can retry with a safer setting.',
  }
}

export async function validateRecoveryReselection(
  file: File,
  manifest: ExportCheckpointManifest,
) {
  const ok = await sourceFingerprintMatches(file, manifest.sourceFingerprint, {
    width: manifest.outputWidth,
    height: manifest.outputHeight,
  })
  return ok
    ? { ok: true as const }
    : {
        ok: false as const,
        reason:
          'The selected RAW does not match the interrupted export source.',
      }
}
```

- [ ] **Step 3: Scan checkpoints on hook mount**

In `src/modules/raw-processor/hooks/useRawProcessor.ts`, add:

```ts
useEffect(() => {
  let cancelled = false
  const store = createCheckpointStore(createOpfsCheckpointBackend())

  void store
    .listSafeRetryCandidates()
    .then((manifests) => {
      if (cancelled || manifests.length === 0) return
      const recovery = createInterruptedExportRecovery(manifests[0]!)
      setSession((prev) =>
        prev
          ? {
              ...prev,
              exportState: {
                ...prev.exportState,
                recovery,
              },
            }
          : prev,
      )
    })
    .catch(() => undefined)

  return () => {
    cancelled = true
  }
}, [setSession])
```

Expose a hook action:

```ts
recoverInterruptedExport: (file: File) => Promise<void>
```

Implement:

```ts
const recoverInterruptedExport = useCallback(
  async (file: File) => {
    const recovery = sessionRef.current?.exportState.recovery
    if (!recovery || recovery.status !== 'source-required') return

    const validation = await validateRecoveryReselection(
      file,
      recovery.manifest,
    )
    if (!validation.ok) {
      scheduleToast(() =>
        toast.error('RAW file does not match', {
          description: validation.reason,
        }),
      )
      return
    }

    await loadFile(file)
    await exportImage({ quality: 'high', fidelity: 'safe' })
  },
  [exportImage, loadFile, scheduleToast],
)
```

- [ ] **Step 4: Add reselect UI path**

In `src/modules/raw-processor/RawProcessorView.tsx`, add a file picker for recovery:

```ts
const handleRecoveryFileSelect = useCallback(() => {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept =
    '.cr2,.cr3,.nef,.arw,.raf,.rw2,.orf,.dng,.pef,.srw,.3fr,.fff,.iiq,.raw'
  input.onchange = () => {
    const nextFile = input.files?.[0]
    if (nextFile) {
      void recoverInterruptedExport(nextFile)
    }
  }
  input.click()
}, [recoverInterruptedExport])
```

Pass `onRecoverExportSource={handleRecoveryFileSelect}` to `RawToolSurface` and `ExportTool`.

In `ExportTool.tsx`:

```tsx
{
  recovery?.status === 'source-required' && (
    <Button
      variant="secondary"
      size="sm"
      className="w-full"
      onClick={onRecoverExportSource}
    >
      Reselect RAW and retry
    </Button>
  )
}
```

- [ ] **Step 5: Run recovery tests**

Run:

```bash
pnpm test:run src/modules/raw-processor/services/export-recovery.test.ts \
  src/modules/raw-processor/hooks/useRawProcessor.test.tsx \
  src/modules/raw-processor/components/tools/ExportTool.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit Task 8**

```bash
git add src/modules/raw-processor/services/export-recovery.ts \
  src/modules/raw-processor/services/export-recovery.test.ts \
  src/modules/raw-processor/hooks/useRawProcessor.ts \
  src/modules/raw-processor/hooks/useRawProcessor.test.tsx \
  src/modules/raw-processor/RawProcessorView.tsx \
  src/modules/raw-processor/components/RawToolSurface.tsx \
  src/modules/raw-processor/components/tools/ExportTool.tsx \
  src/modules/raw-processor/components/tools/ExportTool.test.tsx
git commit -m "feat(export): recover interrupted exports with safe retry"
```

### Task 9: Add Playwright WebKit Preflight

**Files:**

- Create: `playwright.config.ts`
- Create: `tests/browser/raw-export-fixtures.ts`
- Create: `tests/browser/raw-ios-safe-export.spec.ts`
- Modify: `package.json`
- Modify: `src/lib/export/execution-profile.ts`
- Modify: `src/modules/raw-processor/hooks/useRawProcessor.ts`

- [ ] **Step 1: Add browser debug metrics channel**

In `src/lib/export/execution-profile.ts`, export a debug event helper:

```ts
export type ExportDebugEvent = {
  type: 'export-plan-selected' | 'resource-evacuated' | 'checkpoint-written'
  payload: unknown
}

export function emitExportDebugEvent(event: ExportDebugEvent) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent('lumaforge-export-debug', { detail: event }),
  )
}
```

In `src/modules/raw-processor/hooks/useRawProcessor.ts`, call it after plan selection and evacuation:

```ts
emitExportDebugEvent({
  type: 'export-plan-selected',
  payload: {
    profile: executionPlan.profile.name,
    preferredRows: executionPlan.preferredRows,
    concurrency: executionPlan.concurrency,
    checkpointMode: executionPlan.checkpointMode,
    outputSink: executionPlan.outputSink,
  },
})
```

- [ ] **Step 2: Add Playwright dependency and scripts**

Run:

```bash
pnpm add -D @playwright/test
```

Edit `package.json`:

```json
{
  "scripts": {
    "test:browser": "playwright test",
    "test:browser:webkit": "playwright test --project=webkit-ios-safe"
  }
}
```

- [ ] **Step 3: Add Playwright config**

Create `playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/browser',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  webServer: {
    command: 'pnpm dev --host 127.0.0.1 --port 4178',
    url: 'http://127.0.0.1:4178/raw',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'webkit-ios-safe',
      use: {
        ...devices['iPhone 14 Pro'],
        browserName: 'webkit',
        baseURL: 'http://127.0.0.1:4178',
      },
    },
    {
      name: 'chromium-desktop',
      use: {
        ...devices['Desktop Chrome'],
        browserName: 'chromium',
        baseURL: 'http://127.0.0.1:4178',
      },
    },
  ],
})
```

- [ ] **Step 4: Add fixture resolver**

Create `tests/browser/raw-export-fixtures.ts`:

```ts
import { existsSync } from 'node:fs'

import type { TestInfo } from '@playwright/test'

export function resolveRawFixture(testInfo: TestInfo) {
  const fixture =
    process.env.LUMAFORGE_100MP_RAF ??
    '/workspaces/LumaForge/test-images/Fujifilm - GFX100RF - 16bit lossless compressed (4_3).RAF'

  if (!existsSync(fixture)) {
    testInfo.skip(
      true,
      `Set LUMAFORGE_100MP_RAF to a local 100MP RAF fixture. Missing: ${fixture}`,
    )
  }

  return fixture
}
```

- [ ] **Step 5: Add WebKit preflight test**

Create `tests/browser/raw-ios-safe-export.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

import { resolveRawFixture } from './raw-export-fixtures'

test('WebKit mobile preflight selects ios-safe before export', async ({
  page,
}, testInfo) => {
  const fixture = resolveRawFixture(testInfo)
  const events: Array<{ type: string; payload: Record<string, unknown> }> = []

  await page.addInitScript(() => {
    window.addEventListener('lumaforge-export-debug', (event) => {
      const custom = event as CustomEvent
      ;(
        window as unknown as { __LUMAFORGE_EXPORT_EVENTS__: unknown[] }
      ).__LUMAFORGE_EXPORT_EVENTS__ ??= []
      ;(
        window as unknown as { __LUMAFORGE_EXPORT_EVENTS__: unknown[] }
      ).__LUMAFORGE_EXPORT_EVENTS__.push(custom.detail)
    })
  })

  await page.goto('/raw')
  await page
    .getByLabel(/load raw file|replace raw file/i)
    .setInputFiles(fixture)
  await expect(page.getByText(/export full-resolution jpeg/i)).toBeVisible({
    timeout: 60_000,
  })
  await page
    .getByRole('button', { name: /export full-resolution jpeg/i })
    .click()

  await expect
    .poll(async () => {
      return page.evaluate(() => {
        return (
          (window as unknown as { __LUMAFORGE_EXPORT_EVENTS__?: unknown[] })
            .__LUMAFORGE_EXPORT_EVENTS__ ?? []
        )
      })
    })
    .toContainEqual(
      expect.objectContaining({
        type: 'export-plan-selected',
        payload: expect.objectContaining({
          profile: 'ios-safe',
          concurrency: 1,
          checkpointMode: 'safe-retry',
        }),
      }),
    )

  events.push(
    ...((await page.evaluate(() => {
      return (
        (window as unknown as { __LUMAFORGE_EXPORT_EVENTS__?: unknown[] })
          .__LUMAFORGE_EXPORT_EVENTS__ ?? []
      )
    })) as Array<{ type: string; payload: Record<string, unknown> }>),
  )

  testInfo.attach('export-events.json', {
    body: JSON.stringify(events, null, 2),
    contentType: 'application/json',
  })
})
```

- [ ] **Step 6: Run Playwright WebKit preflight**

Run:

```bash
pnpm test:browser:webkit
```

Expected:

- PASS when `LUMAFORGE_100MP_RAF` points to an available local fixture.
- SKIP with an explicit fixture path message when the fixture is not available.

- [ ] **Step 7: Commit Task 9**

```bash
git add package.json pnpm-lock.yaml playwright.config.ts \
  tests/browser/raw-export-fixtures.ts \
  tests/browser/raw-ios-safe-export.spec.ts \
  src/lib/export/execution-profile.ts \
  src/modules/raw-processor/hooks/useRawProcessor.ts
git commit -m "test(export): add webkit ios-safe preflight"
```

### Task 10: Final Acceptance Matrix And Release Verification

**Files:**

- Modify: `docs/specs/2026-04-22-phase1-test-matrix.md`
- Modify: `docs/plans/2026-05-01-ios-safari-100mp-export-compatibility-implementation-plan.md`

- [x] **Step 1: Add acceptance rows to the test matrix**

Edit `docs/specs/2026-04-22-phase1-test-matrix.md` with:

```md
## iOS Safari 100MP Export Compatibility

| Environment                          | Fixture                           | Required evidence                                                              |
| ------------------------------------ | --------------------------------- | ------------------------------------------------------------------------------ |
| Playwright WebKit mobile preflight   | 100MP RAF when locally available  | `ios-safe`, `64` or `128` rows, concurrency `1`, safe-retry checkpoint mode    |
| Chromium desktop preflight           | same supported fixture family     | `desktop-fast` remains available and does not inherit iOS row limits           |
| iPhone low-RAM Safari                | 100MP RAF                         | completes or detects interruption and asks for source reselect with retry copy |
| Newer iPhone Safari                  | 100MP RAF                         | completes in `ios-safe` without full-size canvas/ImageData export              |
| iPad Safari                          | 100MP RAF                         | completes in `ios-safe` or documented higher safe profile with JSONL metrics   |
| Private Browsing or OPFS unavailable | 100MP RAF                         | non-durable checkpoint copy and no misleading resume wording                   |
| Low storage quota                    | 100MP RAF                         | fails closed before compressed output memory spike                             |
| Reload after checkpoint              | 100MP RAF                         | detects active manifest and retries from row `0` after source verification     |
| Unsupported RAW                      | unsupported fixture               | fail-closed source copy remains intact                                         |
| Unsupported LUT contract             | supported RAW plus unresolved LUT | fail-closed LUT contract copy remains intact                                   |
```

- [x] **Step 2: Run targeted unit suites**

Run:

```bash
pnpm test:run src/lib/export/execution-profile.test.ts \
  src/lib/export/resource-registry.test.ts \
  src/lib/export/source-fingerprint.test.ts \
  src/lib/export/checkpoint-store.test.ts \
  src/lib/export/output-sink.test.ts \
  src/lib/export/full-res-export.test.ts \
  src/lib/export/full-res-export-client.test.ts \
  src/lib/export/full-res-export.worker.test.ts \
  src/modules/raw-processor/services/export-evacuation.test.ts \
  src/modules/raw-processor/services/export-recovery.test.ts \
  src/modules/raw-processor/__tests__/export-system.test.ts \
  src/modules/raw-processor/hooks/useRawProcessor.test.tsx \
  src/modules/raw-processor/components/tools/ExportTool.test.tsx
```

Expected: PASS.

- [x] **Step 3: Run package runtime tests**

Run:

```bash
pnpm --filter @lumaforge/luma-raw-runtime test
pnpm --filter @lumaforge/luma-jpeg-runtime test
pnpm --filter @lumaforge/luma-raw-runtime typecheck
pnpm --filter @lumaforge/luma-jpeg-runtime typecheck
```

Expected: PASS.

- [x] **Step 4: Run native build gates**

Run:

```bash
pnpm --filter @lumaforge/luma-raw-runtime build:native
pnpm --filter @lumaforge/luma-raw-runtime native:verify
pnpm --filter @lumaforge/luma-jpeg-runtime build:native
pnpm --filter @lumaforge/luma-jpeg-runtime native:verify
```

Expected: PASS and native artifacts exist for RAW `desktop`, RAW `low-memory`, and JPEG runtime.

- [ ] **Step 5: Run repo-wide checks**

Run:

```bash
pnpm test:run
pnpm exec tsc --noEmit
pnpm build
pnpm exec prettier --check docs/specs/2026-05-01-ios-safari-100mp-export-compatibility-design.md docs/plans/2026-05-01-ios-safari-100mp-export-compatibility-implementation-plan.md
git diff --check
```

Expected: PASS.

- [x] **Step 6: Run browser preflight**

Run:

```bash
pnpm test:browser:webkit
pnpm test:browser --project=chromium-desktop
```

Expected:

- WebKit preflight records `ios-safe`, `safe-retry`, low-memory runtime, and concurrency `1`.
- Chromium desktop preflight records `desktop-fast` when the fixture and runtime support it.

- [x] **Step 7: Record manual real-device acceptance**

Create a local validation note outside the implementation commit or append to the PR description. Use this exact checklist:

```md
Real-device iOS Safari acceptance:

- iPhone low-RAM class, normal Safari:
- Newer iPhone 6GB/8GB class, normal Safari:
- iPad 8GB+ class, normal Safari:
- Private Browsing / storage disabled:
- Low storage quota / near-full device:
- Background tab / screen lock / app switch during export:
- Reload after first checkpoint:
- Injected worker/native resource failure:
- Unsupported RAW:
- Unsupported LUT contract:
```

Do not claim iOS production support until at least the iPhone low-RAM, newer iPhone, and reload-after-checkpoint rows have concrete results.

- [ ] **Step 8: Commit Task 10**

```bash
git add docs/specs/2026-04-22-phase1-test-matrix.md \
  docs/plans/2026-05-01-ios-safari-100mp-export-compatibility-implementation-plan.md
git commit -m "docs(export): add ios safari export acceptance plan"
```

### Task 10 Verification Notes

Task 10 is a documentation acceptance update. These notes do not claim real-device
iOS Safari production support.

Task 9 / review-fix evidence already run before Task 10:

- PASS: `pnpm test:run src/lib/export/execution-profile.test.ts src/modules/raw-processor/hooks/useRawProcessor.test.tsx` (`69` tests).
- PASS: `pnpm test:run src/modules/raw-processor/hooks/useRawProcessor.test.tsx` (`64` tests) after the review fix.
- PASS: `pnpm exec tsc --noEmit --pretty false`.
- SKIPPED: `pnpm test:browser:webkit` (`1` skipped) in the current local Playwright WebKit because processed-window full-resolution export is unavailable in this browser build.
- PASS: `pnpm test:browser --project=chromium-desktop` (`1` test).
- PASS: targeted eslint/prettier checks and `git diff --check`.
- NOTE: A prior full `pnpm test:run` failed outside this task area in `scripts/deploy/deploy.test.mjs` because the expected preview URL was `https://feat-prod-preview.luma.ichr.me` and the actual URL was `https://feat-prod-preview.lumaforge.pages.dev`; do not classify that as a Task 10 regression without a fresh rerun/investigation.

Task 10 final verification status:

- PASS: Step 2 targeted unit suites:
  `pnpm test:run src/lib/export/execution-profile.test.ts src/lib/export/resource-registry.test.ts src/lib/export/source-fingerprint.test.ts src/lib/export/checkpoint-store.test.ts src/lib/export/output-sink.test.ts src/lib/export/full-res-export.test.ts src/lib/export/full-res-export-client.test.ts src/lib/export/full-res-export.worker.test.ts src/modules/raw-processor/services/export-evacuation.test.ts src/modules/raw-processor/services/export-recovery.test.ts src/modules/raw-processor/__tests__/export-system.test.ts src/modules/raw-processor/hooks/useRawProcessor.test.tsx src/modules/raw-processor/components/tools/ExportTool.test.tsx`
  (`13` files, `186` tests).
- PASS: Step 3 package runtime tests:
  `pnpm --filter @lumaforge/luma-raw-runtime test` (`5` files, `128`
  tests), `pnpm --filter @lumaforge/luma-jpeg-runtime test` (`4` files,
  `40` tests), `pnpm --filter @lumaforge/luma-raw-runtime typecheck`, and
  `pnpm --filter @lumaforge/luma-jpeg-runtime typecheck`.
- PASS: Step 4 native build gates after activating the cached Emscripten SDK:
  `pnpm --filter @lumaforge/luma-raw-runtime build:native`,
  `pnpm --filter @lumaforge/luma-raw-runtime native:verify`,
  `pnpm --filter @lumaforge/luma-jpeg-runtime build:native`, and
  `pnpm --filter @lumaforge/luma-jpeg-runtime native:verify`. RAW `desktop`,
  RAW `low-memory`, and JPEG native artifacts were verified.
- PARTIAL: Step 5 repo-wide checks. `pnpm exec tsc --noEmit --pretty false`
  passed. `pnpm build` passed with the existing route-builder undefined
  `loader` warning and chunk-size warning. The docs Prettier check and
  `git diff --check` passed. `pnpm test:run` failed only in the pre-existing
  deploy URL assertion after commit `2940b66` excluded Playwright specs from
  Vitest and `@lumaforge/luma-jpeg-runtime` JS artifacts were rebuilt: `78`
  files passed, `937` tests passed, `1` deploy test failed
  (`scripts/deploy/deploy.test.mjs` expected
  `https://feat-prod-preview.luma.ichr.me`, received
  `https://feat-prod-preview.lumaforge.pages.dev`).
- PASS/SKIP: Step 6 browser preflight reruns. `pnpm test:browser:webkit`
  skipped `1` test in the current local Playwright WebKit because
  processed-window full-resolution export is unavailable in this browser build.
  `pnpm test:browser --project=chromium-desktop` passed `1` test and recorded
  the desktop profile path.

Real-device iOS Safari acceptance:

- iPhone low-RAM class, normal Safari: PENDING / Not run
- Newer iPhone 6GB/8GB class, normal Safari: PENDING / Not run
- iPad 8GB+ class, normal Safari: PENDING / Not run
- Private Browsing / storage disabled: PENDING / Not run
- Low storage quota / near-full device: PENDING / Not run
- Background tab / screen lock / app switch during export: PENDING / Not run
- Reload after first checkpoint: PENDING / Not run
- Injected worker/native resource failure: PENDING / Not run
- Unsupported RAW: PENDING / Not run
- Unsupported LUT contract: PENDING / Not run

Do not claim iOS production support until at least the iPhone low-RAM, newer
iPhone, and reload-after-checkpoint rows have concrete results.

## Self-Review Checklist

- Spec coverage:
  - Bounded profiles: Task 1.
  - Low-memory runtime: Task 2.
  - Resource evacuation: Task 3.
  - Checkpoint semantics as safe retry, not row resume: Task 4 and Task 8.
  - Source reacquisition after reload: Task 4 and Task 8.
  - iOS file-backed/streaming output before Blob handoff: Task 5.
  - Fresh worker retry: Task 6.
  - Product copy: Task 7 and Task 8.
  - Playwright WebKit preflight: Task 9.
  - Real-device matrix: Task 10.

- Red-flag scan:
  - Run the banned-token search from the planning skill and keep the result empty.

- Type consistency:
  - `ExportExecutionPlan.profile.name` is used by app code.
  - Worker messages use `FullResWorkerExecutionPlan.profileName`.
  - Checkpoints use `recoveryMode: 'safe-retry'`.
  - Product copy uses "retry" for MVP.
  - Export results use `ExportOutputResult`, not a required top-level `Blob`.
