# Export Memory Discipline Preflight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make full-resolution export start, retry, and finish from a repo-verifiable bounded live-resource state.

**Architecture:** Tighten the existing export profile, resource registry, evacuation, worker retry, and output-result action boundaries. The implementation adds typed debug payloads and profile-aware evacuation without changing color semantics, full-resolution dimensions, or the authoritative strip-based export path.

**Tech Stack:** TypeScript 6, React 19 hooks, Jotai, Vitest, Testing Library, Vite workers, Playwright, OPFS-backed export references, `@lumaforge/luma-raw-runtime`, `@lumaforge/luma-jpeg-runtime`, `@lumaforge/luma-color-runtime`.

---

## Scope Guard

This plan implements
`docs/specs/2026-05-03-export-memory-discipline-preflight-design.md`.

Keep these boundaries:

- Do not change LUT contracts, color graph semantics, output transfer, or JPEG
  color intent.
- Do not reduce full-resolution output dimensions.
- Do not add Canvas, ImageData, GPU readback, or preview-size rendering to the
  authoritative full-resolution export path.
- Do not add cloud export, native helpers, or local daemons.
- Do not implement RAW processed-window throughput optimization,
  libjpeg-turbo throughput work, or broader pipeline parallelism.
- Do not require real iPhone/iPad validation for this pass.

The done gate is targeted unit tests plus Playwright preflight/debug-event
coverage. Real iOS 100MP validation stays as a separate production evidence
gate.

## Execution Preflight

Run in a repo-local worktree before implementation:

```bash
git status --short
pnpm worktree feat/export-memory-discipline-preflight
cd /workspaces/LumaForge/LumaForge/.worktrees/feat/export-memory-discipline-preflight
pnpm install --frozen-lockfile
```

Expected:

- `git status --short` in the source checkout shows only intentional local
  changes.
- The worktree is on a branch named `feat/export-memory-discipline-preflight`.
- `pnpm install --frozen-lockfile` exits `0`.

If `pnpm install` prints `simple-git-hooks` `ENOTDIR` in a worktree, continue
only if the install exits `0`; this repository has known hook setup noise when
`.git` is a file.

## File Structure

Modify:

- `src/lib/export/execution-profile.ts`: typed debug event payloads and debug
  event union.
- `src/lib/export/execution-profile.test.ts`: debug event payload contract.
- `src/modules/raw-processor/services/export-evacuation.ts`: profile-aware
  owner selection, evacuation callbacks, diagnostics, and evacuation error.
- `src/modules/raw-processor/services/export-evacuation.test.ts`: low-memory
  and desktop owner sets, callback ordering, and failure diagnostics.
- `src/modules/raw-processor/hooks/useRawProcessor.ts`: use profile-aware
  evacuation, emit enriched debug events, pass worker-attempt diagnostics, and
  emit output materialization diagnostics.
- `src/modules/raw-processor/hooks/useRawProcessor.test.tsx`: export preflight
  integration, desktop-fast preservation, pre-worker failure, and lazy
  materialization evidence.
- `src/modules/raw-processor/services/export-system.ts`: attempt diagnostics
  around fresh worker retry and exactly-once disposal.
- `src/modules/raw-processor/__tests__/export-system.test.ts`: attempt
  diagnostics and worker retry proof.
- `src/modules/raw-processor/services/export-result-actions.ts`: optional
  materialization diagnostics for Download, Share, and Copy.
- `src/modules/raw-processor/services/export-result-actions.test.ts`: action
  materialization callbacks and action-local failure behavior.
- `tests/browser/raw-ios-safe-export.spec.ts`: assert enriched debug payloads
  and desktop-fast preservation.

Do not create new product UI in this plan. The only user-visible behavior
change is earlier fail-closed export blocking when required low-memory resources
cannot be evacuated.

---

### Task 1: Type Export Debug Events

**Files:**

- Modify: `src/lib/export/execution-profile.ts`
- Modify: `src/lib/export/execution-profile.test.ts`

- [ ] **Step 1: Write the failing debug event contract test**

First update the import in `src/lib/export/execution-profile.test.ts` so it
includes `emitExportDebugEvent`:

```ts
import {
  emitExportDebugEvent,
  getExportModeCopy,
  selectExportExecutionPlan,
} from './execution-profile'
```

Then append this test in the same file:

```ts
it('emits typed export debug events with machine-checkable payloads', () => {
  const events: unknown[] = []
  const listener = (event: Event) => {
    events.push((event as CustomEvent).detail)
  }

  window.addEventListener('lumaforge-export-debug', listener)
  try {
    emitExportDebugEvent({
      type: 'resource-evacuated',
      payload: {
        profile: 'ios-safe',
        requiredOwners: ['preview', 'bounded-hq', 'webgl', 'export-result'],
        disposedOwners: ['preview', 'bounded-hq', 'webgl', 'export-result'],
        registryCheck: { ok: true },
        remainingLive: [],
        estimatedBytesByOwner: { preview: 1024, webgl: 2048 },
        totalEstimatedBytes: 3072,
        evacuatedAt: '2026-05-03T00:00:00.000Z',
      },
    })
    emitExportDebugEvent({
      type: 'export-worker-attempt',
      payload: {
        attempt: 2,
        profile: 'ios-safe',
        preferredRows: 64,
        concurrency: 1,
        phase: 'retry-scheduled',
        retryReason: 'FULL_RES_EXPORT_RESOURCE_FAILURE',
        previousRows: 128,
        nextRows: 64,
        previousConcurrency: 1,
        nextConcurrency: 1,
        freshWorker: true,
        priorClientDisposed: true,
      },
    })
    emitExportDebugEvent({
      type: 'output-materialized',
      payload: {
        action: 'download',
        outputKind: 'file-backed',
        filename: 'frame_fullres.jpg',
        byteLength: 42,
        materializedAt: '2026-05-03T00:00:01.000Z',
        cleanup: 'scheduled',
      },
    })
  } finally {
    window.removeEventListener('lumaforge-export-debug', listener)
  }

  expect(events).toEqual([
    {
      type: 'resource-evacuated',
      payload: {
        profile: 'ios-safe',
        requiredOwners: ['preview', 'bounded-hq', 'webgl', 'export-result'],
        disposedOwners: ['preview', 'bounded-hq', 'webgl', 'export-result'],
        registryCheck: { ok: true },
        remainingLive: [],
        estimatedBytesByOwner: { preview: 1024, webgl: 2048 },
        totalEstimatedBytes: 3072,
        evacuatedAt: '2026-05-03T00:00:00.000Z',
      },
    },
    {
      type: 'export-worker-attempt',
      payload: {
        attempt: 2,
        profile: 'ios-safe',
        preferredRows: 64,
        concurrency: 1,
        phase: 'retry-scheduled',
        retryReason: 'FULL_RES_EXPORT_RESOURCE_FAILURE',
        previousRows: 128,
        nextRows: 64,
        previousConcurrency: 1,
        nextConcurrency: 1,
        freshWorker: true,
        priorClientDisposed: true,
      },
    },
    {
      type: 'output-materialized',
      payload: {
        action: 'download',
        outputKind: 'file-backed',
        filename: 'frame_fullres.jpg',
        byteLength: 42,
        materializedAt: '2026-05-03T00:00:01.000Z',
        cleanup: 'scheduled',
      },
    },
  ])
})
```

- [ ] **Step 2: Run the test and verify failure**

Run:

```bash
pnpm test:run src/lib/export/execution-profile.test.ts
```

Expected: FAIL with TypeScript errors because `ExportDebugEvent` only accepts
the existing event names.

- [ ] **Step 3: Add typed debug payloads**

Replace the existing `ExportDebugEvent` type in
`src/lib/export/execution-profile.ts` with this union:

```ts
import type {
  LargeResourceOwner,
  ResourceRegistryCheck,
} from './resource-registry'

export type ExportPlanSelectedDebugPayload = {
  profile: ExportExecutionProfileName
  preferredRows: number
  concurrency: number
  runtimeMemoryProfile: ExportRuntimeMemoryProfile
  outputSink: ExportOutputSink
  checkpointMode: ExportCheckpointMode
  checkpointDurableExpected: boolean
}

export type ExportResourceEvacuatedDebugPayload = {
  profile: ExportExecutionProfileName
  requiredOwners: LargeResourceOwner[]
  disposedOwners: LargeResourceOwner[]
  registryCheck: ResourceRegistryCheck
  remainingLive: Array<{
    id: string
    owner: LargeResourceOwner
    kind: string
    estimatedBytes?: number
  }>
  estimatedBytesByOwner: Partial<Record<LargeResourceOwner, number>>
  totalEstimatedBytes: number
  evacuatedAt: string
}

export type ExportCheckpointWrittenDebugPayload = {
  exportId: string
  completedRowsForDiagnostics: number
  totalRows: number
  updatedAt: string
}

export type ExportWorkerAttemptDebugPayload = {
  attempt: number
  profile?: ExportExecutionProfileName
  preferredRows?: number
  concurrency?: number
  phase: 'started' | 'retry-scheduled' | 'disposed'
  retryReason?: string
  previousRows?: number
  nextRows?: number
  previousConcurrency?: number
  nextConcurrency?: number
  freshWorker: boolean
  priorClientDisposed?: boolean
}

export type ExportOutputMaterializedDebugPayload = {
  action: 'download' | 'share' | 'copy'
  outputKind: ExportOutputSink | 'blob' | 'file-backed'
  filename: string
  byteLength: number
  materializedAt: string
  cleanup: 'scheduled' | 'not-needed' | 'completed'
}

export type ExportDebugEvent =
  | {
      type: 'export-plan-selected'
      payload: ExportPlanSelectedDebugPayload
    }
  | {
      type: 'resource-evacuated'
      payload: ExportResourceEvacuatedDebugPayload
    }
  | {
      type: 'checkpoint-written'
      payload: ExportCheckpointWrittenDebugPayload
    }
  | {
      type: 'export-worker-attempt'
      payload: ExportWorkerAttemptDebugPayload
    }
  | {
      type: 'output-materialized'
      payload: ExportOutputMaterializedDebugPayload
    }
```

Keep the existing `emitExportDebugEvent()` implementation:

```ts
export function emitExportDebugEvent(event: ExportDebugEvent) {
  if (typeof window === 'undefined') return

  window.dispatchEvent(
    new CustomEvent('lumaforge-export-debug', { detail: event }),
  )
}
```

- [ ] **Step 4: Run the focused tests**

Run:

```bash
pnpm test:run src/lib/export/execution-profile.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/lib/export/execution-profile.ts src/lib/export/execution-profile.test.ts
git commit -m "test(export): type debug event payloads"
```

Expected: one commit with only the debug event contract changes.

---

### Task 2: Make Export Evacuation Profile-Aware

**Files:**

- Modify: `src/modules/raw-processor/services/export-evacuation.ts`
- Modify: `src/modules/raw-processor/services/export-evacuation.test.ts`

- [ ] **Step 1: Write failing evacuation scope tests**

Replace the two existing tests in
`src/modules/raw-processor/services/export-evacuation.test.ts` with these
tests:

```ts
import { describe, expect, it, vi } from 'vitest'

import { createResourceRegistry } from '~/lib/export/resource-registry'

import {
  ExportEvacuationError,
  createPreExportSnapshot,
  evacuateBeforeExport,
  getPreExportEvacuationOwners,
} from './export-evacuation'

function snapshot() {
  return createPreExportSnapshot({
    file: new File(['raw'], 'frame.RAF', { lastModified: 123 }),
    metadata: { make: 'Fujifilm', model: 'GFX100RF' },
    graph: {
      supported: true,
      outputGamut: 'srgb-rec709',
      outputTransfer: 'srgb',
      lutProfile: null,
      steps: [{ kind: 'input-linear-prophoto' }, { kind: 'output-srgb' }],
    },
    graphFingerprint: '[{"kind":"input-linear-prophoto"}]',
    lutTitle: 'V-Log',
    quickPreviewReady: true,
    tone: { userExposureEv: 0, userContrast: 0 },
    style: { kind: 'custom', name: 'V-Log' },
  })
}

describe('export evacuation', () => {
  it('selects full evacuation for low-memory profiles and result-only cleanup for desktop-fast', () => {
    expect(getPreExportEvacuationOwners('ios-safe')).toEqual([
      'preview',
      'bounded-hq',
      'webgl',
      'export-result',
      'lut-fetch',
    ])
    expect(getPreExportEvacuationOwners('mobile-balanced')).toEqual([
      'preview',
      'bounded-hq',
      'webgl',
      'export-result',
      'lut-fetch',
    ])
    expect(getPreExportEvacuationOwners('desktop-fast')).toEqual([
      'export-result',
    ])
  })

  it('runs only callbacks required by the selected owner set', async () => {
    const registry = createResourceRegistry()
    const events: string[] = []
    registry.register({
      id: 'stale-result',
      owner: 'export-result',
      kind: 'blob',
      dispose: () => events.push('dispose-stale-result'),
    })

    const result = await evacuateBeforeExport({
      registry,
      snapshot: snapshot(),
      owners: getPreExportEvacuationOwners('desktop-fast'),
      abortPreview: () => events.push('abort-preview'),
      abortBoundedHq: () => events.push('abort-bounded-hq'),
      releasePreviousExportResult: () => events.push('release-export-result'),
      stopLutFetches: () => events.push('stop-lut-fetches'),
    })

    expect(events).toEqual([
      'release-export-result',
      'dispose-stale-result',
    ])
    expect(result.requiredOwners).toEqual(['export-result'])
    expect(result.disposedOwners).toEqual(['export-result'])
    expect(result.registryCheck).toEqual({ ok: true })
    expect(result.remainingLive).toEqual([])
  })

  it('releases all low-memory owners before export', async () => {
    const registry = createResourceRegistry()
    const events: string[] = []
    registry.register({
      id: 'preview-worker',
      owner: 'preview',
      kind: 'worker',
      estimatedBytes: 1024,
      dispose: () => events.push('dispose-preview-worker'),
    })
    registry.register({
      id: 'bounded-hq-buffer',
      owner: 'bounded-hq',
      kind: 'array-buffer',
      estimatedBytes: 2048,
      dispose: () => events.push('dispose-bounded-hq-buffer'),
    })
    registry.register({
      id: 'webgl-pipeline',
      owner: 'webgl',
      kind: 'webgl-pipeline',
      estimatedBytes: 4096,
      dispose: () => events.push('dispose-webgl-pipeline'),
    })

    const result = await evacuateBeforeExport({
      registry,
      snapshot: snapshot(),
      owners: getPreExportEvacuationOwners('ios-safe'),
      abortPreview: () => events.push('abort-preview'),
      abortBoundedHq: () => events.push('abort-bounded-hq'),
      releasePreviousExportResult: () => events.push('release-export-result'),
      stopLutFetches: () => events.push('stop-lut-fetches'),
    })

    expect(events).toEqual([
      'abort-preview',
      'abort-bounded-hq',
      'release-export-result',
      'stop-lut-fetches',
      'dispose-bounded-hq-buffer',
      'dispose-preview-worker',
      'dispose-webgl-pipeline',
    ])
    expect(result.registryCheck).toEqual({ ok: true })
    expect(result.remainingLive).toEqual([])
    expect(result.estimatedBytesByOwner).toEqual({})
    expect(result.totalEstimatedBytes).toBe(0)
  })

  it('throws a stable evacuation error when owner disposal fails', async () => {
    const registry = createResourceRegistry()
    registry.register({
      id: 'stuck-webgl',
      owner: 'webgl',
      kind: 'webgl-pipeline',
      dispose: () => {
        throw new Error('dispose failed')
      },
    })

    await expect(
      evacuateBeforeExport({
        registry,
        snapshot: snapshot(),
        owners: getPreExportEvacuationOwners('ios-safe'),
        abortPreview: vi.fn(),
        abortBoundedHq: vi.fn(),
        releasePreviousExportResult: vi.fn(),
        stopLutFetches: vi.fn(),
      }),
    ).rejects.toMatchObject({
      code: 'EXPORT_RESOURCE_EVICTION_INCOMPLETE',
    } satisfies Partial<ExportEvacuationError>)
  })
})
```

- [ ] **Step 2: Run the tests and verify failure**

Run:

```bash
pnpm test:run src/modules/raw-processor/services/export-evacuation.test.ts
```

Expected: FAIL because `getPreExportEvacuationOwners`,
`ExportEvacuationError`, `owners`, `stopLutFetches`, and the diagnostic fields
do not exist.

- [ ] **Step 3: Implement profile-aware evacuation**

Replace the owner constant and `evacuateBeforeExport()` implementation in
`src/modules/raw-processor/services/export-evacuation.ts` with this code:

```ts
import type { ExportExecutionProfileName } from '~/lib/export/execution-profile'
import type {
  LargeResourceOwner,
  ResourceRegistry,
  ResourceRegistryCheck,
  ResourceRegistrySnapshot,
} from '~/lib/export/resource-registry'

export class ExportEvacuationError extends Error {
  readonly code = 'EXPORT_RESOURCE_EVICTION_INCOMPLETE'

  constructor(message = 'Export resources could not be evacuated.', cause?: unknown) {
    super(message, { cause })
    this.name = 'ExportEvacuationError'
  }
}

const LOW_MEMORY_PRE_EXPORT_DISPOSABLE_OWNERS: LargeResourceOwner[] = [
  'preview',
  'bounded-hq',
  'webgl',
  'export-result',
  'lut-fetch',
]

const DESKTOP_PRE_EXPORT_DISPOSABLE_OWNERS: LargeResourceOwner[] = [
  'export-result',
]

export function getPreExportEvacuationOwners(
  profile: ExportExecutionProfileName,
): LargeResourceOwner[] {
  return profile === 'desktop-fast'
    ? [...DESKTOP_PRE_EXPORT_DISPOSABLE_OWNERS]
    : [...LOW_MEMORY_PRE_EXPORT_DISPOSABLE_OWNERS]
}

export type ExportEvacuationResult = {
  snapshot: PreExportSnapshot
  registryCheck: ResourceRegistryCheck
  requiredOwners: LargeResourceOwner[]
  disposedOwners: LargeResourceOwner[]
  remainingLive: ResourceRegistrySnapshot['live']
  estimatedBytesByOwner: ResourceRegistrySnapshot['estimatedBytesByOwner']
  totalEstimatedBytes: number
  evacuatedAt: string
}

function hasOwner(owners: LargeResourceOwner[], owner: LargeResourceOwner) {
  return owners.includes(owner)
}

export async function evacuateBeforeExport(input: {
  registry: ResourceRegistry
  snapshot: PreExportSnapshot
  owners: LargeResourceOwner[]
  abortPreview?: () => void
  abortBoundedHq?: () => void
  releasePreviousExportResult?: () => void
  stopLutFetches?: () => void
}): Promise<ExportEvacuationResult> {
  const owners = [...input.owners]

  try {
    if (hasOwner(owners, 'preview') || hasOwner(owners, 'webgl')) {
      input.abortPreview?.()
    }
    if (hasOwner(owners, 'bounded-hq')) {
      input.abortBoundedHq?.()
    }
    if (hasOwner(owners, 'export-result')) {
      input.releasePreviousExportResult?.()
    }
    if (hasOwner(owners, 'lut-fetch')) {
      input.stopLutFetches?.()
    }

    await input.registry.disposeOwners(owners)
  } catch (error) {
    throw new ExportEvacuationError(
      'Export resources could not be evacuated before worker start.',
      error,
    )
  }

  const registryCheck = input.registry.assertZeroLive(owners)
  const snapshot = input.registry.snapshot()

  return {
    snapshot: input.snapshot,
    registryCheck,
    requiredOwners: owners,
    disposedOwners: owners,
    remainingLive: snapshot.live,
    estimatedBytesByOwner: snapshot.estimatedBytesByOwner,
    totalEstimatedBytes: snapshot.totalEstimatedBytes,
    evacuatedAt: new Date().toISOString(),
  }
}
```

Keep the existing `PreExportSnapshot` and `createPreExportSnapshot()` exports
above this implementation.

- [ ] **Step 4: Run evacuation tests**

Run:

```bash
pnpm test:run src/modules/raw-processor/services/export-evacuation.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/modules/raw-processor/services/export-evacuation.ts src/modules/raw-processor/services/export-evacuation.test.ts
git commit -m "feat(export): make evacuation profile aware"
```

Expected: one commit with evacuation service and tests.

---

### Task 3: Integrate Profile-Aware Evacuation In RAW Processor

**Files:**

- Modify: `src/modules/raw-processor/hooks/useRawProcessor.ts`
- Modify: `src/modules/raw-processor/hooks/useRawProcessor.test.tsx`

- [ ] **Step 1: Add hook tests for enriched evacuation and pre-worker failure**

Append these tests near the existing full-resolution export tests in
`src/modules/raw-processor/hooks/useRawProcessor.test.tsx`:

```tsx
it('emits enriched low-memory evacuation diagnostics before full-resolution export', async () => {
  const events: unknown[] = []
  window.addEventListener('lumaforge-export-debug', (event) => {
    events.push((event as CustomEvent).detail)
  })
  const boundedHqDecode = deferred<DecodedImage>()
  let boundedHqSignal: AbortSignal | undefined
  const runtimeDispose = vi.fn()
  const pipelineDispose = vi.fn()

  rawRuntimeAdapterMock.openSession.mockResolvedValue({
    sourceDimensions: defaultSourceDimensions,
    extractEmbeddedPreview: vi.fn().mockResolvedValue(null),
    decodeQuickRaw: vi.fn().mockResolvedValue(createDecodedImage('quick')),
    decodeBoundedHqRaw: vi.fn((_options, _progress, signal) => {
      boundedHqSignal = signal
      return boundedHqDecode.promise
    }),
    probeExportCapability: vi.fn().mockResolvedValue(createSupportedCapability()),
    dispose: runtimeDispose,
  })
  exportSystemMock.runFullResolutionExportJob.mockResolvedValue({
    filename: 'frame_neutral_fullres.jpg',
    blob: new Blob(['jpeg'], { type: 'image/jpeg' }),
  })

  const { result } = renderHook(() => useRawProcessor(), { wrapper })

  await act(async () => {
    await result.current.loadFile(new File(['raw'], 'frame.ARW'))
  })
  act(() => {
    result.current.pipelineRef.current = {
      dispose: pipelineDispose,
    } as never
  })
  await act(async () => {
    await result.current.exportImage({
      quality: 'high',
      fidelity: 'balanced',
    })
  })

  const evacuation = events.find(
    (event) =>
      typeof event === 'object' &&
      event !== null &&
      (event as { type?: string }).type === 'resource-evacuated',
  ) as { payload?: Record<string, unknown> } | undefined

  expect(evacuation?.payload).toMatchObject({
    profile: 'mobile-balanced',
    requiredOwners: ['preview', 'bounded-hq', 'webgl', 'export-result', 'lut-fetch'],
    disposedOwners: ['preview', 'bounded-hq', 'webgl', 'export-result', 'lut-fetch'],
    registryCheck: { ok: true },
    remainingLive: [],
  })
  expect(boundedHqSignal?.aborted).toBe(true)
  expect(runtimeDispose).toHaveBeenCalledTimes(1)
  expect(pipelineDispose).toHaveBeenCalledWith({ releaseContext: false })
})

it('fails before starting the export worker when required evacuation throws', async () => {
  const pipelineDispose = vi.fn(() => {
    throw new Error('dispose failed')
  })

  exportSystemMock.runFullResolutionExportJob.mockResolvedValue({
    filename: 'frame_neutral_fullres.jpg',
    blob: new Blob(['jpeg'], { type: 'image/jpeg' }),
  })

  const { result } = renderHook(() => useRawProcessor(), { wrapper })

  await act(async () => {
    await result.current.loadFile(new File(['raw'], 'frame.ARW'))
  })
  act(() => {
    result.current.pipelineRef.current = {
      dispose: pipelineDispose,
    } as never
  })
  await act(async () => {
    await result.current.exportImage({
      quality: 'high',
      fidelity: 'balanced',
    })
  })

  expect(exportSystemMock.runFullResolutionExportJob).not.toHaveBeenCalled()
  expect(jotaiStore.get(currentSessionAtom)?.exportState).toMatchObject({
    status: 'failed',
    lastErrorCode: 'EXPORT_RESOURCE_EVICTION_INCOMPLETE',
    retryRecommended: false,
  })
})
```

- [ ] **Step 2: Run the hook tests and verify failure**

Run:

```bash
pnpm test:run src/modules/raw-processor/hooks/useRawProcessor.test.tsx --runInBand
```

Expected: FAIL because `useRawProcessor` still calls evacuation without an
owner set and emits the smaller evacuation payload.

- [ ] **Step 3: Import the new evacuation helper**

In `src/modules/raw-processor/hooks/useRawProcessor.ts`, change the
evacuation import to:

```ts
import {
  createPreExportSnapshot,
  evacuateBeforeExport,
  getPreExportEvacuationOwners,
} from '../services/export-evacuation'
```

- [ ] **Step 4: Add a debug payload helper**

Add this helper next to `toDebugRegistryCheck()`:

```ts
function toResourceEvacuatedDebugPayload(input: {
  profile: ExportExecutionPlan['profile']['name']
  evacuation: Awaited<ReturnType<typeof evacuateBeforeExport>>
}) {
  return {
    profile: input.profile,
    requiredOwners: input.evacuation.requiredOwners,
    disposedOwners: input.evacuation.disposedOwners,
    registryCheck: toDebugRegistryCheck(input.evacuation.registryCheck),
    remainingLive: input.evacuation.remainingLive.map(
      ({ id, owner, kind, estimatedBytes }) => ({
        id,
        owner,
        kind,
        estimatedBytes,
      }),
    ),
    estimatedBytesByOwner: input.evacuation.estimatedBytesByOwner,
    totalEstimatedBytes: input.evacuation.totalEstimatedBytes,
    evacuatedAt: input.evacuation.evacuatedAt,
  }
}
```

- [ ] **Step 5: Use profile-aware evacuation before worker start**

In the export flow, replace the `evacuateBeforeExport({ ... })` call with:

```ts
const evacuationOwners = getPreExportEvacuationOwners(
  jobExecutionPlan.profile.name,
)
const evacuation = await evacuateBeforeExport({
  registry,
  snapshot,
  owners: evacuationOwners,
  abortPreview: () => {
    abortRuntimeWork()
    revokeCurrentEmbeddedPreviewUrl()
  },
  abortBoundedHq: abortRuntimeWork,
  releasePreviousExportResult() {
    setSession((prev) =>
      prev && prev.id === exportSessionId
        ? clearExportResultForActiveExport(prev)
        : prev,
    )
  },
  stopLutFetches() {
    // Online LUT fetches already use per-request abort signals. This hook keeps
    // the owner contract explicit for future registered LUT fetch resources.
  },
})

if (!isCurrentExport()) {
  return
}

emitExportDebugEvent({
  type: 'resource-evacuated',
  payload: toResourceEvacuatedDebugPayload({
    profile: jobExecutionPlan.profile.name,
    evacuation,
  }),
})
```

Keep the existing `if (!evacuation.registryCheck.ok)` block immediately after
this event emission. Its thrown error must keep this shape:

```ts
throw Object.assign(new Error('EXPORT_RESOURCE_EVICTION_INCOMPLETE'), {
  code: 'EXPORT_RESOURCE_EVICTION_INCOMPLETE',
})
```

- [ ] **Step 6: Enrich plan selection debug payload**

Replace the `export-plan-selected` payload in `useRawProcessor.ts` with:

```ts
emitExportDebugEvent({
  type: 'export-plan-selected',
  payload: {
    profile: jobExecutionPlan.profile.name,
    preferredRows: jobExecutionPlan.preferredRows,
    concurrency: jobExecutionPlan.concurrency,
    runtimeMemoryProfile: jobExecutionPlan.runtimeMemoryProfile,
    checkpointMode: jobExecutionPlan.checkpointMode,
    outputSink: jobExecutionPlan.outputSink,
    checkpointDurableExpected:
      jobExecutionPlan.profile.checkpointOutput &&
      jobExecutionPlan.outputSink === 'opfs-file',
  },
})
```

- [ ] **Step 7: Run focused hook tests**

Run:

```bash
pnpm test:run src/modules/raw-processor/hooks/useRawProcessor.test.tsx --runInBand
```

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```bash
git add src/modules/raw-processor/hooks/useRawProcessor.ts src/modules/raw-processor/hooks/useRawProcessor.test.tsx
git commit -m "feat(raw): enforce export evacuation preflight"
```

Expected: one commit with hook integration and hook tests.

---

### Task 4: Emit Worker Attempt Diagnostics

**Files:**

- Modify: `src/modules/raw-processor/services/export-system.ts`
- Modify: `src/modules/raw-processor/__tests__/export-system.test.ts`
- Modify: `src/modules/raw-processor/hooks/useRawProcessor.ts`

- [ ] **Step 1: Write failing attempt diagnostics tests**

Append this test to `src/modules/raw-processor/__tests__/export-system.test.ts`:

```ts
it('reports fresh worker attempt lifecycle during resource retry', async () => {
  const file = new File(['raw'], 'frame.ARW')
  const output = createBlobOutputResult({
    filename: 'frame_neutral_fullres.jpg',
    blob: new Blob(['jpeg'], { type: 'image/jpeg' }),
  })
  const graph: ExportColorGraphDescriptor = {
    supported: true,
    outputGamut: 'srgb-rec709',
    outputTransfer: 'srgb',
    lutProfile: null,
    steps: [{ kind: 'input-linear-prophoto' }, { kind: 'output-srgb' }],
  }
  const executionPlan = selectCurrentExportExecutionPlan({
    fidelity: 'safe',
    sourceWidth: 11662,
    sourceHeight: 8746,
  })
  const first = {
    run: vi.fn().mockRejectedValue(
      Object.assign(new Error('FULL_RES_EXPORT_RESOURCE_FAILURE'), {
        nextRows: 64,
      }),
    ),
    dispose: vi.fn(),
  }
  const second = {
    run: vi.fn().mockResolvedValue(output),
    dispose: vi.fn(),
  }
  const clientFactory = vi
    .fn()
    .mockReturnValueOnce(first)
    .mockReturnValueOnce(second)
  const onAttempt = vi.fn()

  await runFullResolutionExportJob({
    file,
    filename: 'frame_neutral_fullres.jpg',
    graph,
    executionPlan,
    onAttempt,
    clientFactory: clientFactory as never,
  })

  expect(onAttempt).toHaveBeenNthCalledWith(1, {
    attempt: 1,
    profile: executionPlan.profile.name,
    preferredRows: executionPlan.preferredRows,
    concurrency: executionPlan.concurrency,
    phase: 'started',
    freshWorker: true,
  })
  expect(onAttempt).toHaveBeenNthCalledWith(2, {
    attempt: 1,
    profile: executionPlan.profile.name,
    preferredRows: executionPlan.preferredRows,
    concurrency: executionPlan.concurrency,
    phase: 'retry-scheduled',
    retryReason: 'FULL_RES_EXPORT_RESOURCE_FAILURE',
    previousRows: executionPlan.preferredRows,
    nextRows: 64,
    previousConcurrency: executionPlan.concurrency,
    nextConcurrency: 1,
    freshWorker: true,
    priorClientDisposed: false,
  })
  expect(onAttempt).toHaveBeenNthCalledWith(3, {
    attempt: 1,
    profile: executionPlan.profile.name,
    preferredRows: executionPlan.preferredRows,
    concurrency: executionPlan.concurrency,
    phase: 'disposed',
    freshWorker: false,
    priorClientDisposed: true,
  })
  expect(onAttempt).toHaveBeenNthCalledWith(4, {
    attempt: 2,
    profile: executionPlan.profile.name,
    preferredRows: 64,
    concurrency: 1,
    phase: 'started',
    freshWorker: true,
  })
})
```

- [ ] **Step 2: Run export-system tests and verify failure**

Run:

```bash
pnpm test:run src/modules/raw-processor/__tests__/export-system.test.ts
```

Expected: FAIL because `runFullResolutionExportJob()` does not accept
`onAttempt`.

- [ ] **Step 3: Add attempt event types and callback**

In `src/modules/raw-processor/services/export-system.ts`, add this type near
the existing exports:

```ts
export type FullResolutionExportAttemptEvent = {
  attempt: number
  profile?: ExportExecutionPlan['profile']['name']
  preferredRows?: number
  concurrency?: number
  phase: 'started' | 'retry-scheduled' | 'disposed'
  retryReason?: string
  previousRows?: number
  nextRows?: number
  previousConcurrency?: number
  nextConcurrency?: number
  freshWorker: boolean
  priorClientDisposed?: boolean
}
```

Add `onAttempt` to the `runFullResolutionExportJob()` input type:

```ts
onAttempt?: (event: FullResolutionExportAttemptEvent) => void
```

Also add `onAttempt` to the destructured parameter list of
`runFullResolutionExportJob()`:

```ts
export async function runFullResolutionExportJob({
  file,
  filename,
  graph,
  quality,
  preferredRows,
  concurrency,
  executionPlan,
  checkpoint,
  onProgress,
  onMetric,
  onAttempt,
  signal,
  clientFactory = createFullResolutionExportClient,
}: {
  file: File
  filename: string
  graph: ExportColorGraphDescriptor
  quality?: RunFullResolutionJpegExportInWorkerInput['quality']
  preferredRows?: RunFullResolutionJpegExportInWorkerInput['preferredRows']
  concurrency?: RunFullResolutionJpegExportInWorkerInput['concurrency']
  executionPlan?: ExportExecutionPlan
  checkpoint?: FullResWorkerCheckpointConfig
  onProgress?: (progress: FullResolutionExportProgress) => void
  onMetric?: RunFullResolutionJpegExportInWorkerInput['onMetric']
  onAttempt?: (event: FullResolutionExportAttemptEvent) => void
  signal?: AbortSignal
  clientFactory?: () => FullResolutionExportWorkerClient
}) {
```

- [ ] **Step 4: Emit attempt lifecycle events**

Inside `runFullResolutionExportJob()`, emit attempt events with this shape:

```ts
while (true) {
  attempts += 1
  const client = clientFactory()
  const attemptPlan = plan

  onAttempt?.({
    attempt: attempts,
    profile: attemptPlan?.profile.name,
    preferredRows: attemptPlan?.preferredRows ?? preferredRows,
    concurrency: attemptPlan?.concurrency ?? concurrency,
    phase: 'started',
    freshWorker: true,
  })

  try {
    const output = await client.run({
      file,
      filename,
      graph,
      quality,
      preferredRows: attemptPlan?.preferredRows ?? preferredRows,
      concurrency: attemptPlan?.concurrency ?? concurrency,
      executionPlan: attemptPlan ? toWorkerExecutionPlan(attemptPlan) : undefined,
      checkpoint: attemptPlan?.profile.checkpointOutput ? checkpoint : undefined,
      onProgress,
      onMetric,
      signal,
    })

    return { filename, output, attempts }
  } catch (error) {
    if (
      !attemptPlan?.profile.restartWorkerOnResourceRetry ||
      attempts >= 3 ||
      !errorLooksLikeFreshWorkerRetry(error)
    ) {
      throw error
    }

    const nextRows =
      getFreshWorkerRetryRows(error) ??
      Math.floor(attemptPlan.preferredRows / 2)
    const normalizedNextRows = Math.min(
      attemptPlan.profile.maxRows,
      Math.max(attemptPlan.profile.minRows, nextRows),
    )

    onAttempt?.({
      attempt: attempts,
      profile: attemptPlan.profile.name,
      preferredRows: attemptPlan.preferredRows,
      concurrency: attemptPlan.concurrency,
      phase: 'retry-scheduled',
      retryReason:
        error instanceof Error ? error.message : 'FULL_RES_EXPORT_WORKER_FAILED',
      previousRows: attemptPlan.preferredRows,
      nextRows: normalizedNextRows,
      previousConcurrency: attemptPlan.concurrency,
      nextConcurrency: 1,
      freshWorker: true,
      priorClientDisposed: false,
    })

    plan = {
      ...attemptPlan,
      preferredRows: normalizedNextRows,
      concurrency: 1,
      productCopy: 'resource-retry',
    }
  } finally {
    client.dispose()
    onAttempt?.({
      attempt: attempts,
      profile: attemptPlan?.profile.name,
      preferredRows: attemptPlan?.preferredRows ?? preferredRows,
      concurrency: attemptPlan?.concurrency ?? concurrency,
      phase: 'disposed',
      freshWorker: false,
      priorClientDisposed: true,
    })
  }
}
```

Keep the existing function signature fields and the existing return value.

- [ ] **Step 5: Emit worker attempt debug events from the hook**

In `useRawProcessor.ts`, pass `onAttempt` into `runFullResolutionExportJob()`:

```ts
onAttempt: (attempt) => {
  if (!isCurrentExport()) return

  emitExportDebugEvent({
    type: 'export-worker-attempt',
    payload: attempt,
  })
},
```

Place this next to the existing `onMetric` and `onProgress` callbacks.

- [ ] **Step 6: Run focused tests**

Run:

```bash
pnpm test:run src/modules/raw-processor/__tests__/export-system.test.ts src/modules/raw-processor/hooks/useRawProcessor.test.tsx --runInBand
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add src/modules/raw-processor/services/export-system.ts src/modules/raw-processor/__tests__/export-system.test.ts src/modules/raw-processor/hooks/useRawProcessor.ts
git commit -m "feat(export): report worker retry attempts"
```

Expected: one commit with worker attempt diagnostics.

---

### Task 5: Prove Lazy Output Materialization

**Files:**

- Modify: `src/modules/raw-processor/services/export-result-actions.ts`
- Modify: `src/modules/raw-processor/services/export-result-actions.test.ts`
- Modify: `src/modules/raw-processor/hooks/useRawProcessor.ts`
- Modify: `src/modules/raw-processor/hooks/useRawProcessor.test.tsx`

- [ ] **Step 1: Write failing action materialization tests**

Append this test to
`src/modules/raw-processor/services/export-result-actions.test.ts`:

```ts
it('reports file-backed output materialization only inside user actions', async () => {
  vi.useFakeTimers()
  const openBlob = vi.fn(
    async () => new Blob(['jpeg'], { type: 'image/jpeg' }),
  )
  const onMaterialize = vi.fn()
  const result = createResult({
    output: {
      kind: 'file-backed',
      exportId: 'export-1',
      filename: 'frame_neutral_fullres.jpg',
      byteLength: 4,
      mimeType: 'image/jpeg',
      openBlob,
    },
  })
  const click = vi.fn()
  const remove = vi.fn()
  const append = vi.fn()
  const link = { href: '', download: '', click, remove }
  const documentLike = {
    createElement: vi.fn(() => link),
    body: { append },
  } as unknown as Document
  const urlLike = {
    createObjectURL: vi.fn(() => 'blob:export'),
    revokeObjectURL: vi.fn(),
  } as unknown as typeof URL

  expect(openBlob).not.toHaveBeenCalled()

  await downloadExportResult(result, {
    document: documentLike,
    URL: urlLike,
    onMaterialize,
    now: () => '2026-05-03T00:00:00.000Z',
  })

  expect(openBlob).toHaveBeenCalledTimes(1)
  expect(onMaterialize).toHaveBeenCalledWith({
    action: 'download',
    outputKind: 'file-backed',
    filename: 'frame_neutral_fullres.jpg',
    byteLength: 4,
    materializedAt: '2026-05-03T00:00:00.000Z',
    cleanup: 'scheduled',
  })

  vi.runOnlyPendingTimers()
  expect(urlLike.revokeObjectURL).toHaveBeenCalledWith('blob:export')
  vi.useRealTimers()
})
```

- [ ] **Step 2: Run action tests and verify failure**

Run:

```bash
pnpm test:run src/modules/raw-processor/services/export-result-actions.test.ts
```

Expected: FAIL because action functions do not accept materialization
diagnostics.

- [ ] **Step 3: Add materialization diagnostics types**

In `src/modules/raw-processor/services/export-result-actions.ts`, add:

```ts
export type ExportOutputMaterializationAction = 'download' | 'share' | 'copy'

export type ExportOutputMaterializationEvent = {
  action: ExportOutputMaterializationAction
  outputKind: ExportResult['output']['kind']
  filename: string
  byteLength: number
  materializedAt: string
  cleanup: 'scheduled' | 'not-needed' | 'completed'
}

type MaterializationDiagnostics = {
  onMaterialize?: (event: ExportOutputMaterializationEvent) => void
  now?: () => string
}

function reportMaterialized(
  result: ExportResult,
  action: ExportOutputMaterializationAction,
  diagnostics: MaterializationDiagnostics | undefined,
  cleanup: ExportOutputMaterializationEvent['cleanup'],
) {
  diagnostics?.onMaterialize?.({
    action,
    outputKind: result.output.kind,
    filename: result.filename,
    byteLength: result.size,
    materializedAt: diagnostics.now?.() ?? new Date().toISOString(),
    cleanup,
  })
}
```

- [ ] **Step 4: Report materialization from actions**

Update the action signatures and calls:

```ts
export async function shareExportResult(
  result: ExportResult,
  navigatorLike: Navigator = navigator,
  diagnostics?: MaterializationDiagnostics,
) {
  const capability = resolveExportShareCapability(result, navigatorLike)
  if (!capability.available) {
    throw new Error(capability.reason)
  }

  const file = await createShareFile(result)
  reportMaterialized(result, 'share', diagnostics, 'not-needed')
  await navigatorLike.share({
    files: [file],
    title: result.filename,
  })
}

export async function downloadExportResult(
  result: ExportResult,
  environment: {
    document?: Document
    URL?: typeof URL
  } & MaterializationDiagnostics = {},
) {
  const documentLike = environment.document ?? document
  const urlLike = environment.URL ?? URL
  const blob = await materializeOutputBlob(result.output)
  reportMaterialized(result, 'download', environment, 'scheduled')
  const url = urlLike.createObjectURL(blob)
  const link = documentLike.createElement('a')

  link.href = url
  link.download = result.filename
  documentLike.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => {
    urlLike.revokeObjectURL(url)
  }, 0)
}

export async function copyExportResultToClipboard(
  result: ExportResult,
  environment: ClipboardEnvironment = globalThis,
  diagnostics?: MaterializationDiagnostics,
) {
  const blob = await materializeOutputBlob(result.output)
  reportMaterialized(result, 'copy', diagnostics, 'not-needed')
  await copyBlobToClipboard(blob, environment)
}
```

Do not report materialization from `resolveExportShareCapability()`. It should
continue to use the zero-byte probe file and keep file-backed output unopened.

- [ ] **Step 5: Emit materialization debug events from the hook**

In `useRawProcessor.ts`, add this helper next to the export-result action
callbacks:

```ts
const createMaterializationDiagnostics = useCallback(
  (action: 'download' | 'share' | 'copy') => ({
    onMaterialize(event: {
      action: 'download' | 'share' | 'copy'
      outputKind: 'blob' | 'file-backed'
      filename: string
      byteLength: number
      materializedAt: string
      cleanup: 'scheduled' | 'not-needed' | 'completed'
    }) {
      emitExportDebugEvent({
        type: 'output-materialized',
        payload: {
          ...event,
          action,
        },
      })
    },
  }),
  [],
)
```

Then update the action calls:

```ts
await downloadStoredExportResult(
  result,
  createMaterializationDiagnostics('download'),
)
await shareStoredExportResult(
  result,
  navigator,
  createMaterializationDiagnostics('share'),
)
await copyExportResultToClipboard(
  result,
  globalThis,
  createMaterializationDiagnostics('copy'),
)
```

Keep preview-size `copyCanvasToClipboard()` unchanged; it is not
full-resolution output materialization.

- [ ] **Step 6: Add hook test for no completion-time file open**

Append this test to `src/modules/raw-processor/hooks/useRawProcessor.test.tsx`:

```tsx
it('does not open file-backed export output until a result action runs', async () => {
  const events: unknown[] = []
  window.addEventListener('lumaforge-export-debug', (event) => {
    events.push((event as CustomEvent).detail)
  })
  const openBlob = vi.fn(
    async () => new Blob(['jpeg'], { type: 'image/jpeg' }),
  )
  const output: FileBackedOutputResult = {
    kind: 'file-backed',
    exportId: 'export-1',
    filename: 'frame_neutral_fullres.jpg',
    byteLength: 4,
    mimeType: 'image/jpeg',
    openBlob,
  }

  exportSystemMock.runFullResolutionExportJob.mockResolvedValue({
    filename: 'frame_neutral_fullres.jpg',
    output,
  })
  const { click } = stubDownloadLink()

  const { result } = renderHook(() => useRawProcessor(), { wrapper })
  await act(async () => {
    await result.current.loadFile(new File(['raw'], 'frame.ARW'))
  })
  await act(async () => {
    await result.current.exportImage({
      quality: 'high',
      fidelity: 'balanced',
    })
  })

  expect(openBlob).not.toHaveBeenCalled()
  expect(result.current.exportResult?.output.kind).toBe('file-backed')

  await act(async () => {
    await result.current.downloadExportResult()
  })

  expect(openBlob).toHaveBeenCalledTimes(1)
  expect(click).toHaveBeenCalledTimes(1)
  expect(events).toContainEqual(
    expect.objectContaining({
      type: 'output-materialized',
      payload: expect.objectContaining({
        action: 'download',
        outputKind: 'file-backed',
        filename: 'frame_neutral_fullres.jpg',
        byteLength: 4,
      }),
    }),
  )
})
```

- [ ] **Step 7: Run focused tests**

Run:

```bash
pnpm test:run src/modules/raw-processor/services/export-result-actions.test.ts src/modules/raw-processor/hooks/useRawProcessor.test.tsx --runInBand
```

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```bash
git add src/modules/raw-processor/services/export-result-actions.ts src/modules/raw-processor/services/export-result-actions.test.ts src/modules/raw-processor/hooks/useRawProcessor.ts src/modules/raw-processor/hooks/useRawProcessor.test.tsx
git commit -m "feat(export): trace lazy output materialization"
```

Expected: one commit with output action diagnostics.

---

### Task 6: Extend Browser Preflight Debug Assertions

**Files:**

- Modify: `tests/browser/raw-ios-safe-export.spec.ts`

- [ ] **Step 1: Add browser preflight assertions for enriched payloads**

In `tests/browser/raw-ios-safe-export.spec.ts`, add this helper below
`collectExportEvents()`:

```ts
function eventPayload(events: ExportDebugEvent[], type: string) {
  return events.find((event) => event.type === type)?.payload ?? null
}
```

Then replace the final debug-event assertions with:

```ts
const events = await collectExportEvents(page)
const planPayload = eventPayload(events, 'export-plan-selected')
expect(planPayload).toMatchObject({
  profile: expectedPlan.profile,
  concurrency: expectedPlan.concurrency,
  runtimeMemoryProfile: expectedPlan.runtimeMemoryProfile,
  checkpointMode: expectedPlan.checkpointMode,
  outputSink: expectedPlan.outputSink,
})
expect(expectedPlan.preferredRows).toContain(planPayload?.preferredRows)

const evacuationPayload = eventPayload(events, 'resource-evacuated')
expect(evacuationPayload).toMatchObject({
  profile: expectedPlan.profile,
  registryCheck: { ok: true },
  remainingLive: [],
})

if (expectedPlan.profile === 'desktop-fast') {
  expect(evacuationPayload?.requiredOwners).toEqual(['export-result'])
} else {
  expect(evacuationPayload?.requiredOwners).toEqual([
    'preview',
    'bounded-hq',
    'webgl',
    'export-result',
    'lut-fetch',
  ])
}

const workerAttemptPayload = eventPayload(events, 'export-worker-attempt')
expect(workerAttemptPayload).toMatchObject({
  attempt: 1,
  profile: expectedPlan.profile,
  phase: 'started',
  freshWorker: true,
})

if (expectedPlan.checkpointExpected) {
  expect(events).toContainEqual(
    expect.objectContaining({
      type: 'checkpoint-written',
    }),
  )
}
```

Keep the `try/finally` attachment of `export-events.json`.

- [ ] **Step 2: Run the browser test in Chromium desktop**

Run:

```bash
pnpm exec playwright test tests/browser/raw-ios-safe-export.spec.ts --project=chromium-desktop
```

Expected: PASS when a supported RAW fixture is available, or SKIP with the
existing unsupported-browser-build message when the fixture/runtime path is not
available in that browser.

- [ ] **Step 3: Run the browser test in WebKit preflight**

Run:

```bash
pnpm exec playwright test tests/browser/raw-ios-safe-export.spec.ts --project=webkit-ios-safe
```

Expected: PASS when the local fixture and browser runtime support processed
window export, or SKIP with the existing unsupported-browser-build message. A
missing private 100MP RAF fixture should use the existing fixture skip behavior.

- [ ] **Step 4: Commit**

Run:

```bash
git add tests/browser/raw-ios-safe-export.spec.ts
git commit -m "test(export): assert memory discipline preflight events"
```

Expected: one commit with browser preflight assertions only.

---

## Final Verification

Run the focused unit suite:

```bash
pnpm test:run \
  src/lib/export/execution-profile.test.ts \
  src/modules/raw-processor/services/export-evacuation.test.ts \
  src/modules/raw-processor/__tests__/export-system.test.ts \
  src/modules/raw-processor/services/export-result-actions.test.ts \
  src/modules/raw-processor/hooks/useRawProcessor.test.tsx \
  --runInBand
```

Expected: PASS.

Run the broader export surface:

```bash
pnpm test:run \
  src/lib/export/resource-registry.test.ts \
  src/lib/export/full-res-export.test.ts \
  src/lib/export/full-res-export-client.test.ts \
  src/lib/export/full-res-export.worker.test.ts \
  src/lib/export/output-sink.test.ts \
  src/modules/raw-processor/components/tools/ExportTool.test.tsx \
  src/modules/raw-processor/components/ProgressOverlay.test.tsx \
  --runInBand
```

Expected: PASS.

Run browser preflight:

```bash
pnpm exec playwright test tests/browser/raw-ios-safe-export.spec.ts --project=chromium-desktop
pnpm exec playwright test tests/browser/raw-ios-safe-export.spec.ts --project=webkit-ios-safe
```

Expected: PASS or documented SKIP when local fixtures or the Playwright browser
build cannot exercise processed-window full-resolution export.

Run type/build checks:

```bash
pnpm test:run src/lib/export/perf/export-metrics.test.ts
pnpm build
```

Expected: PASS.

## Acceptance Checklist

- `ios-safe` and `mobile-balanced` exports start only after required resource
  owners are evacuated or fail before the full-resolution worker starts.
- `desktop-fast` keeps result-only evacuation and does not dispose the preview
  pipeline during normal export start.
- Safe-profile resource failures retry through a fresh worker client.
- Each worker client attempt is disposed exactly once.
- File-backed export output is not opened during export completion.
- Download, Share, and full-resolution Copy report materialization only inside
  the user action path.
- No full-resolution export code path uses Canvas, ImageData, GPU readback, or
  preview-size output as the authoritative source.
- The final handoff states that real iOS 100MP validation is still a separate
  production evidence gate.
