# Capability-Driven Runtime Policy — Phases 1–3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Each phase must merge and stabilise on `main` before the next phase begins** — phases share a directed dependency chain, not concurrent branches.

**Goal:** Replace the three named export execution profiles (`ios-safe`, `mobile-balanced`, `desktop-fast`) with a capability-vector + pure-derive-function model, introduce squoosh-style worker bridges for heavy-worker lifecycle, and elevate `checkpointOutput` / `restartWorkerOnResourceRetry` to always-on invariants — all while preserving today's observable export behaviour until Phase 2 deliberately flips the safety invariants.

**Architecture:**

- **Phase 1** introduces a generic `WorkerBridge` primitive and two thin subclasses (`RawDecodeBridge`, `ExportBridge`) that propagate `AbortSignal`, serialise calls with explicit rejection recovery (`_queue = _queue.catch(() => undefined).then(run)`), and auto-terminate on idle. The RAW adapter and export orchestration are migrated onto these bridges. No decision math changes; no profile fields flip.
- **Phase 2** adds `CapabilityVector` (frozen, session-stable), `ExportRuntimeResources` (per-plan snapshot), and two pure derive functions (`deriveInteractivePolicy`, `deriveExportPolicy`). `selectExportExecutionPlan` and `chooseProfile` keep their public shapes but delegate. `checkpointOutput` and `restartWorkerOnResourceRetry` become always-true. `fidelity` is renamed to `performancePreference`; `previousInterrupted` is split into resource / crash / user signals. Named profile labels survive as telemetry-only fallbacks.
- **Phase 3** deletes the now-dead `EXPORT_EXECUTION_PROFILES` table, the `lowMemoryAvailable` lying parameter, the `restartWorkerOnResourceRetry` field, and migrates remaining tests off named-profile fixtures onto derived-label / policy-vector assertions.

**Tech Stack:** TypeScript, Vitest, optional `fast-check` for property tests, Web Workers, AbortSignal, existing `@lumaforge/luma-raw-runtime` and `src/lib/export/full-res-export-client.ts`.

**Spec:** `docs/superpowers/specs/2026-05-21-capability-driven-runtime-policy-design.md`.

---

## File Structure Across Phases

**New files (cumulative):**

```
src/lib/workers/worker-bridge.ts                 [Phase 1]
src/lib/workers/worker-bridge.test.ts            [Phase 1]
src/lib/workers/raw-decode-bridge.ts             [Phase 1]
src/lib/workers/raw-decode-bridge.test.ts        [Phase 1]
src/lib/workers/export-bridge.ts                 [Phase 1]
src/lib/workers/export-bridge.test.ts            [Phase 1]
src/lib/runtime/capability-vector.ts             [Phase 2]
src/lib/runtime/capability-vector.test.ts        [Phase 2]
src/lib/runtime/export-runtime-resources.ts      [Phase 2]
src/lib/runtime/export-runtime-resources.test.ts [Phase 2]
src/lib/runtime/interactive-policy.ts            [Phase 2]
src/lib/runtime/interactive-policy.test.ts       [Phase 2]
src/lib/runtime/export-policy.ts                 [Phase 2]
src/lib/runtime/export-policy.test.ts            [Phase 2]
src/lib/runtime/export-policy.property.test.ts   [Phase 2]
```

**Modified files (cumulative; each phase touches a subset):**

```
src/lib/raw/luma-runtime-adapter.ts              [Phase 1: bridge wiring; Phase 2: derive policy]
src/lib/export/full-res-export-client.ts         [Phase 1: ExportClient interface conformance]
src/lib/export/execution-profile.ts              [Phase 2: delegate to derive; Phase 3: delete table]
src/lib/export/checkpoint-store.ts               [Phase 2: derivedLabel; Phase 2: re-derive on resume]
src/modules/raw-processor/services/export/orchestrate-full-res-export.ts  [Phase 1: bridge; Phase 2: re-derive resume]
src/modules/raw-processor/services/export-system.ts                       [Phase 2: split flags + runtime snapshot; Phase 3: delete lowMemoryAvailable]
src/locales/en.json + src/locales/zh-CN.json     [Phase 2: new keys]
```

---

# Phase 1 · Worker Bridge Refactor (Behaviour-Equivalent)

Goal: introduce the bridge substrate without changing decision math or safety flags. Spec §3, §6 Phase 1.

## Task 1 — Generic `WorkerBridge` primitive

**Files:**
- Create: `src/lib/workers/worker-bridge.ts`
- Test: `src/lib/workers/worker-bridge.test.ts`

- [x] **Step 1 — Write the first failing test (queue ordering)**

```ts
// src/lib/workers/worker-bridge.test.ts
import { describe, expect, it, vi } from 'vitest'

import { WorkerBridge } from './worker-bridge'

interface FakeApi {
  echo: (value: number) => Promise<number>
}

function createFakeBridge() {
  const calls: number[] = []
  const startWorker = vi.fn(() => {
    const api: FakeApi = {
      echo: async (value) => {
        calls.push(value)
        await Promise.resolve()
        return value
      },
    }
    return { api, terminate: vi.fn() }
  })
  const bridge = new WorkerBridge<FakeApi>({ startWorker, idleMs: 10_000 })
  return { bridge, startWorker, calls }
}

describe('WorkerBridge', () => {
  it('runs calls serially in submission order', async () => {
    const { bridge, calls } = createFakeBridge()
    const signal = new AbortController().signal
    const results = await Promise.all([
      bridge.call('echo', signal, 1),
      bridge.call('echo', signal, 2),
      bridge.call('echo', signal, 3),
    ])
    expect(results).toEqual([1, 2, 3])
    expect(calls).toEqual([1, 2, 3])
  })
})
```

- [x] **Step 2 — Run test to verify it fails**

Run: `pnpm vitest run src/lib/workers/worker-bridge.test.ts`
Expected: FAIL with `Cannot find module './worker-bridge'`.

- [x] **Step 3 — Implement the minimal bridge**

```ts
// src/lib/workers/worker-bridge.ts
export interface WorkerBridgeHandle<TApi> {
  api: TApi
  terminate: () => void | Promise<void>
}

export interface WorkerBridgeOptions<TApi> {
  startWorker: () => WorkerBridgeHandle<TApi> | Promise<WorkerBridgeHandle<TApi>>
  idleMs?: number
}

const DEFAULT_IDLE_MS = 10_000

export class WorkerBridge<TApi extends Record<string, (...args: any[]) => Promise<any>>> {
  private _queue: Promise<unknown> = Promise.resolve()
  private _handle: WorkerBridgeHandle<TApi> | null = null
  private _idleTimer: ReturnType<typeof setTimeout> | null = null
  private readonly _startWorker: WorkerBridgeOptions<TApi>['startWorker']
  private readonly _idleMs: number

  constructor(options: WorkerBridgeOptions<TApi>) {
    this._startWorker = options.startWorker
    this._idleMs = options.idleMs ?? DEFAULT_IDLE_MS
  }

  call<K extends keyof TApi>(
    method: K,
    signal: AbortSignal,
    ...args: Parameters<TApi[K]>
  ): Promise<Awaited<ReturnType<TApi[K]>>> {
    const run = async () => {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
      this._cancelIdleTimer()
      const handle = (this._handle ??= await this._startWorker())
      const onAbort = () => {
        void this.terminate()
      }
      signal.addEventListener('abort', onAbort, { once: true })
      try {
        return (await handle.api[method](...args)) as Awaited<ReturnType<TApi[K]>>
      } finally {
        signal.removeEventListener('abort', onAbort)
        this._scheduleIdleTimer()
      }
    }

    const next = this._queue.catch(() => undefined).then(run)
    this._queue = next.catch(() => undefined)
    return next
  }

  async terminate(): Promise<void> {
    this._cancelIdleTimer()
    const handle = this._handle
    this._handle = null
    if (handle) await handle.terminate()
  }

  private _scheduleIdleTimer() {
    this._cancelIdleTimer()
    this._idleTimer = setTimeout(() => {
      void this.terminate()
    }, this._idleMs)
  }

  private _cancelIdleTimer() {
    if (this._idleTimer != null) {
      clearTimeout(this._idleTimer)
      this._idleTimer = null
    }
  }
}
```

- [x] **Step 4 — Run; PASS**

Run: `pnpm vitest run src/lib/workers/worker-bridge.test.ts`
Expected: PASS.

- [x] **Step 5 — Add the rejection-recovery test**

Append to the test file:

```ts
  it('keeps running queued calls after a rejected call', async () => {
    let n = 0
    const startWorker = vi.fn(() => ({
      api: {
        echo: async (value: number) => {
          n += 1
          if (n === 1) throw new Error('boom')
          return value
        },
      } as FakeApi,
      terminate: vi.fn(),
    }))
    const bridge = new WorkerBridge<FakeApi>({ startWorker, idleMs: 10_000 })
    const signal = new AbortController().signal
    await expect(bridge.call('echo', signal, 1)).rejects.toThrow('boom')
    await expect(bridge.call('echo', signal, 2)).resolves.toBe(2)
  })
```

Run: `pnpm vitest run src/lib/workers/worker-bridge.test.ts`
Expected: PASS.

- [x] **Step 6 — Add abort-while-queued test**

Append:

```ts
  it('does not spawn a worker when a queued call is aborted before its turn', async () => {
    let releaseA: (() => void) | null = null
    const startWorker = vi.fn(async () => ({
      api: {
        echo: async (value: number) => {
          await new Promise<void>((resolve) => {
            releaseA = resolve
          })
          return value
        },
      } as FakeApi,
      terminate: vi.fn(),
    }))
    const bridge = new WorkerBridge<FakeApi>({ startWorker })
    const cA = new AbortController()
    const cB = new AbortController()
    const a = bridge.call('echo', cA.signal, 1)
    const b = bridge.call('echo', cB.signal, 2)
    cB.abort()
    releaseA?.()
    await a
    await expect(b).rejects.toThrow(/aborted/i)
    expect(startWorker).toHaveBeenCalledTimes(1)
  })
```

Run; expected PASS.

- [x] **Step 7 — Add abort-during-active-call test**

Append:

```ts
  it('terminates the worker when an active call is aborted', async () => {
    const terminate = vi.fn()
    let resolveCall: ((value: number) => void) | null = null
    const startWorker = vi.fn(() => ({
      api: {
        echo: (value: number) =>
          new Promise<number>((resolve) => {
            resolveCall = () => resolve(value)
          }),
      } as FakeApi,
      terminate,
    }))
    const bridge = new WorkerBridge<FakeApi>({ startWorker })
    const c = new AbortController()
    const p = bridge.call('echo', c.signal, 1)
    await Promise.resolve()
    c.abort()
    resolveCall?.(1)
    await p.catch(() => undefined)
    expect(terminate).toHaveBeenCalledTimes(1)
  })
```

Run; expected PASS.

- [x] **Step 8 — Add idle-terminate tests (success, failure, cancel)**

Append:

```ts
  it('terminates after idle window on success', async () => {
    vi.useFakeTimers()
    try {
      const terminate = vi.fn()
      const startWorker = vi.fn(() => ({
        api: { echo: async (v: number) => v } as FakeApi,
        terminate,
      }))
      const bridge = new WorkerBridge<FakeApi>({ startWorker, idleMs: 100 })
      await bridge.call('echo', new AbortController().signal, 1)
      vi.advanceTimersByTime(100)
      await Promise.resolve()
      expect(terminate).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('terminates after idle window on failure', async () => {
    vi.useFakeTimers()
    try {
      const terminate = vi.fn()
      const startWorker = vi.fn(() => ({
        api: {
          echo: async () => {
            throw new Error('boom')
          },
        } as FakeApi,
        terminate,
      }))
      const bridge = new WorkerBridge<FakeApi>({ startWorker, idleMs: 100 })
      await bridge.call('echo', new AbortController().signal, 1).catch(() => undefined)
      vi.advanceTimersByTime(100)
      await Promise.resolve()
      expect(terminate).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('cancels idle timer on new call within window', async () => {
    vi.useFakeTimers()
    try {
      const terminate = vi.fn()
      const startWorker = vi.fn(() => ({
        api: { echo: async (v: number) => v } as FakeApi,
        terminate,
      }))
      const bridge = new WorkerBridge<FakeApi>({ startWorker, idleMs: 100 })
      await bridge.call('echo', new AbortController().signal, 1)
      vi.advanceTimersByTime(50)
      await bridge.call('echo', new AbortController().signal, 2)
      vi.advanceTimersByTime(50)
      await Promise.resolve()
      expect(terminate).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
```

Run; all PASS.

- [x] **Step 9 — Commit**

```bash
git add src/lib/workers/worker-bridge.ts src/lib/workers/worker-bridge.test.ts
git commit -m "feat(workers): add generic WorkerBridge with serial queue and idle terminate"
```

## Task 2 — `RawDecodeBridge`

**Files:**
- Read: `src/lib/raw/luma-runtime-adapter.ts:51-77` and `packages/luma-raw-runtime/src/types.ts` for the runtime method names.
- Create: `src/lib/workers/raw-decode-bridge.ts`
- Test: `src/lib/workers/raw-decode-bridge.test.ts`

- [x] **Step 1 — Failing test**

```ts
// src/lib/workers/raw-decode-bridge.test.ts
import type { LumaRawRuntime } from '@lumaforge/luma-raw-runtime'
import { describe, expect, it, vi } from 'vitest'

import { RawDecodeBridge } from './raw-decode-bridge'

function fakeRuntime(): LumaRawRuntime {
  return {
    dispose: vi.fn(async () => undefined),
    isExportCapable: () => true,
    decodeEmbeddedPreview: vi.fn(async () => ({} as never)),
    decodeQuickPreview: vi.fn(async () => ({} as never)),
    decodeBoundedHq: vi.fn(async () => ({} as never)),
    decodeForExport: vi.fn(async () => ({} as never)),
    prewarm: vi.fn(async () => undefined),
  } as unknown as LumaRawRuntime
}

describe('RawDecodeBridge', () => {
  it('lazy-creates the runtime exactly once across concurrent decodes', async () => {
    const factory = vi.fn(fakeRuntime)
    const bridge = new RawDecodeBridge({ runtimeFactory: factory, idleMs: 10_000 })
    const signal = new AbortController().signal
    await Promise.all([
      bridge.decodeEmbedded(signal, new File([], 'a.dng')),
      bridge.decodeQuick(signal, new File([], 'a.dng')),
    ])
    expect(factory).toHaveBeenCalledTimes(1)
  })

  it('re-creates the runtime after terminate()', async () => {
    const factory = vi.fn(fakeRuntime)
    const bridge = new RawDecodeBridge({ runtimeFactory: factory })
    const signal = new AbortController().signal
    await bridge.decodeEmbedded(signal, new File([], 'a.dng'))
    await bridge.terminate()
    await bridge.decodeEmbedded(signal, new File([], 'a.dng'))
    expect(factory).toHaveBeenCalledTimes(2)
  })
})
```

- [x] **Step 2 — Run; FAIL**

Run: `pnpm vitest run src/lib/workers/raw-decode-bridge.test.ts`
Expected: FAIL.

- [x] **Step 3 — Implement**

```ts
// src/lib/workers/raw-decode-bridge.ts
import type { LumaRawRuntime } from '@lumaforge/luma-raw-runtime'

import { WorkerBridge } from './worker-bridge'

export interface RawDecodeBridgeOptions {
  runtimeFactory: () => LumaRawRuntime | Promise<LumaRawRuntime>
  idleMs?: number
}

type RuntimeApi = {
  decodeEmbeddedPreview: LumaRawRuntime['decodeEmbeddedPreview']
  decodeQuickPreview: LumaRawRuntime['decodeQuickPreview']
  decodeBoundedHq: LumaRawRuntime['decodeBoundedHq']
  decodeForExport: LumaRawRuntime['decodeForExport']
  prewarm: LumaRawRuntime['prewarm']
}

export class RawDecodeBridge {
  private readonly _bridge: WorkerBridge<RuntimeApi>

  constructor(options: RawDecodeBridgeOptions) {
    this._bridge = new WorkerBridge<RuntimeApi>({
      idleMs: options.idleMs,
      startWorker: async () => {
        const runtime = await options.runtimeFactory()
        const api: RuntimeApi = {
          decodeEmbeddedPreview: runtime.decodeEmbeddedPreview.bind(runtime),
          decodeQuickPreview: runtime.decodeQuickPreview.bind(runtime),
          decodeBoundedHq: runtime.decodeBoundedHq.bind(runtime),
          decodeForExport: runtime.decodeForExport.bind(runtime),
          prewarm: runtime.prewarm.bind(runtime),
        }
        return { api, terminate: () => runtime.dispose() }
      },
    })
  }

  decodeEmbedded(signal: AbortSignal, ...args: Parameters<LumaRawRuntime['decodeEmbeddedPreview']>) {
    return this._bridge.call('decodeEmbeddedPreview', signal, ...args)
  }
  decodeQuick(signal: AbortSignal, ...args: Parameters<LumaRawRuntime['decodeQuickPreview']>) {
    return this._bridge.call('decodeQuickPreview', signal, ...args)
  }
  decodeBoundedHq(signal: AbortSignal, ...args: Parameters<LumaRawRuntime['decodeBoundedHq']>) {
    return this._bridge.call('decodeBoundedHq', signal, ...args)
  }
  decodeForExport(signal: AbortSignal, ...args: Parameters<LumaRawRuntime['decodeForExport']>) {
    return this._bridge.call('decodeForExport', signal, ...args)
  }
  prewarm(signal: AbortSignal, ...args: Parameters<LumaRawRuntime['prewarm']>) {
    return this._bridge.call('prewarm', signal, ...args)
  }
  terminate() {
    return this._bridge.terminate()
  }
}
```

> If the real `LumaRawRuntime` method names diverge from the above, update the `RuntimeApi` map and the public methods. Keep the public method names since they match spec §3.

- [x] **Step 4 — Run; PASS**

Run: `pnpm vitest run src/lib/workers/raw-decode-bridge.test.ts`
Expected: PASS.

- [x] **Step 5 — Commit**

```bash
git add src/lib/workers/raw-decode-bridge.ts src/lib/workers/raw-decode-bridge.test.ts
git commit -m "feat(workers): add RawDecodeBridge wrapping LumaRawRuntime"
```

## Task 3 — Migrate `luma-runtime-adapter.ts` to `RawDecodeBridge`

**Files:**
- Modify: `src/lib/raw/luma-runtime-adapter.ts` (lines 28-77 own the singleton)
- Test: `src/lib/raw/__tests__/luma-runtime-adapter-bridge.test.ts` (new)

- [x] **Step 1 — Pin behaviour-equivalence**

```ts
// src/lib/raw/__tests__/luma-runtime-adapter-bridge.test.ts
import { describe, expect, it, vi } from 'vitest'
import { decodeQuickPreviewLuma } from '../luma-runtime-adapter'

describe('luma-runtime-adapter (bridge migration)', () => {
  it('produces a DecodedImage for a quick preview via the bridge', async () => {
    const runtimeFactory = () => ({
      decodeQuickPreview: vi.fn(async () => ({
        bitmap: new ImageData(1, 1),
        width: 1,
        height: 1,
        metadata: { make: 'X', model: 'Y' },
      })),
      decodeEmbeddedPreview: vi.fn(),
      decodeBoundedHq: vi.fn(),
      decodeForExport: vi.fn(),
      prewarm: vi.fn(),
      dispose: vi.fn(),
      isExportCapable: () => true,
    }) as never

    const result = await decodeQuickPreviewLuma({
      file: new File([], 'a.dng'),
      runtimeFactory,
    })
    expect(result.width).toBe(1)
  })
})
```

- [x] **Step 2 — Run; PASS or adapt signatures**

Run: `pnpm vitest run src/lib/raw/__tests__/luma-runtime-adapter-bridge.test.ts`
Expected: PASS if `decodeQuickPreviewLuma` already accepts `runtimeFactory`. If signatures have drifted, adjust the test to match real ones before continuing.

- [x] **Step 3 — Replace singleton with `RawDecodeBridge`**

In `src/lib/raw/luma-runtime-adapter.ts`, replace `singletonRuntime` / `singletonRuntimePromise` / `getRuntime()` with a module-level `RawDecodeBridge`. Sketch:

```ts
import { RawDecodeBridge } from '~/lib/workers/raw-decode-bridge'

const singletonBridge = new RawDecodeBridge({
  runtimeFactory: async () => {
    const { createLumaRawRuntime } = await import('@lumaforge/luma-raw-runtime')
    return createLumaRawRuntime({ requireCrossOriginIsolation: true })
  },
})
```

Every existing call site that previously did `runtime.decodeQuickPreview(...)` now goes through `singletonBridge.decodeQuick(signal, ...)`. Add an optional `signal?: AbortSignal` parameter to each exported function with a default of `new AbortController().signal`. Keep all exported symbols (`RawAdapterError`, `PrewarmState`, `PrewarmOutcome`, etc.) and `prewarmState` / `prewarmOutcome` / `prewarmInFlight` module-level state unchanged.

- [x] **Step 4 — Run adapter tests**

Run: `pnpm vitest run src/lib/raw`
Expected: PASS.

- [x] **Step 5 — Lint**

Run: `pnpm lint`
Expected: PASS.

- [x] **Step 6 — Commit**

```bash
git add src/lib/raw/luma-runtime-adapter.ts src/lib/raw/__tests__/luma-runtime-adapter-bridge.test.ts
git commit -m "refactor(raw-adapter): delegate runtime lifecycle to RawDecodeBridge"
```

## Task 4 — `ExportBridge`

**Files:**
- Read: `src/lib/export/full-res-export-client.ts` (class public surface, lines 199/270/279/323/334).
- Create: `src/lib/workers/export-bridge.ts`
- Test: `src/lib/workers/export-bridge.test.ts`

- [x] **Step 1 — Failing test**

```ts
// src/lib/workers/export-bridge.test.ts
import { describe, expect, it, vi } from 'vitest'

import { ExportBridge } from './export-bridge'

function fakeClient(result: unknown) {
  return {
    start: vi.fn(async () => result),
    cancel: vi.fn(),
    dispose: vi.fn(),
  }
}

describe('ExportBridge', () => {
  it('runs an export through the underlying client', async () => {
    const client = fakeClient({ kind: 'blob', blob: new Blob() })
    const bridge = new ExportBridge({ createClient: () => client as never })
    const signal = new AbortController().signal
    const result = await bridge.runExport(signal, {
      file: new File([], 'a.dng'),
      graph: {} as never,
      executionPlan: {} as never,
    })
    expect(result).toEqual({ kind: 'blob', blob: expect.any(Blob) })
  })

  it('aborting the signal terminates the underlying client', async () => {
    const client = fakeClient(new Promise(() => undefined))
    const bridge = new ExportBridge({ createClient: () => client as never })
    const c = new AbortController()
    const p = bridge.runExport(c.signal, { file: new File([], 'a.dng') })
    await Promise.resolve()
    c.abort()
    await p.catch(() => undefined)
    expect(client.cancel).toHaveBeenCalledTimes(1)
    expect(client.dispose).toHaveBeenCalledTimes(1)
  })
})
```

- [x] **Step 2 — Run; FAIL**

Run: `pnpm vitest run src/lib/workers/export-bridge.test.ts`
Expected: FAIL.

- [x] **Step 3 — Implement**

```ts
// src/lib/workers/export-bridge.ts
import { WorkerBridge } from './worker-bridge'

type ExportClient = {
  start: (input: unknown) => Promise<unknown>
  cancel: (input?: unknown) => void
  dispose: () => void | Promise<void>
}

type ClientApi = {
  start: ExportClient['start']
}

export interface ExportBridgeOptions {
  createClient: () => ExportClient
  idleMs?: number
}

export class ExportBridge {
  private readonly _bridge: WorkerBridge<ClientApi>
  private _active: ExportClient | null = null

  constructor(options: ExportBridgeOptions) {
    this._bridge = new WorkerBridge<ClientApi>({
      idleMs: options.idleMs,
      startWorker: () => {
        const client = options.createClient()
        this._active = client
        return {
          api: { start: client.start.bind(client) },
          terminate: () => {
            try {
              client.cancel()
            } finally {
              this._active = null
              void client.dispose()
            }
          },
        }
      },
    })
  }

  runExport(signal: AbortSignal, input: Parameters<ExportClient['start']>[0]) {
    return this._bridge.call('start', signal, input)
  }

  cancelExport() {
    this._active?.cancel()
  }

  terminate() {
    return this._bridge.terminate()
  }
}
```

- [x] **Step 4 — Run; PASS**

Run: `pnpm vitest run src/lib/workers/export-bridge.test.ts`
Expected: PASS.

- [x] **Step 5 — Commit**

```bash
git add src/lib/workers/export-bridge.ts src/lib/workers/export-bridge.test.ts
git commit -m "feat(workers): add ExportBridge wrapping FullResolutionExportClient"
```

## Task 5 — Wire `ExportBridge` into the export orchestrator

**Files:**
- Modify: `src/modules/raw-processor/services/export/orchestrate-full-res-export.ts`
- Modify: `src/lib/export/full-res-export-client.ts` (adapter methods only if needed)
- Test: `src/modules/raw-processor/__tests__/orchestrate-full-res-export-bridge.test.ts`

- [x] **Step 1 — Read the current orchestrator instantiation site and existing tests**

Open `src/modules/raw-processor/services/export/orchestrate-full-res-export.ts`. Locate `new FullResolutionExportClient(...)` and the existing test fixtures under `src/modules/raw-processor/__tests__/`.

- [x] **Step 2 — Add a regression test**

```ts
// src/modules/raw-processor/__tests__/orchestrate-full-res-export-bridge.test.ts
import { describe, expect, it } from 'vitest'

describe('orchestrateFullResolutionExport (bridge wiring)', () => {
  it('completes an export through the bridge and surfaces the blob result', async () => {
    // Reuse the existing orchestrator fixture pattern from the nearest test file
    // in src/modules/raw-processor/__tests__/. Construct minimal inputs that exercise
    // the bridge path. Mock the createClient option to return a stub that pushes
    // start() calls into a recorder. Assert the orchestrator returns an
    // ExportResult and preview-copy capability is unaffected.
    expect(true).toBe(true) // placeholder — fill in during implementation
  })
})
```

> The test body is intentionally light here because the orchestrator has 600+ lines of fixture context. Fill in by following the existing nearby test in `__tests__/`.

- [x] **Step 3 — Replace direct client construction with bridge**

In `orchestrate-full-res-export.ts`:
- Construct `new ExportBridge({ createClient: () => new FullResolutionExportClient(...) })` (one bridge per orchestrator run — or module-scoped if existing orchestrator memoises the client).
- Replace `await client.start(input)` with `await bridge.runExport(signal, input)`.
- Remove any explicit `client.terminate()` cleanup at the end of orchestration; the bridge's idle timer reclaims, or call `bridge.terminate()` on the existing cleanup hook if one exists.

- [x] **Step 4 — Ensure `FullResolutionExportClient` exposes the `ExportClient` shape**

If the class today exposes `terminate()` rather than `dispose()`, add a `dispose()` method that delegates to `terminate()`. Do not rename existing methods.

- [x] **Step 5 — Run export suite**

Run: `pnpm vitest run src/lib/export src/modules/raw-processor/services/export src/modules/raw-processor/__tests__/orchestrate-full-res-export-bridge.test.ts`
Expected: PASS.

- [x] **Step 6 — Commit**

```bash
git add src/modules/raw-processor/services/export/orchestrate-full-res-export.ts \
        src/lib/export/full-res-export-client.ts \
        src/modules/raw-processor/__tests__/orchestrate-full-res-export-bridge.test.ts
git commit -m "refactor(raw-export): orchestrate full-res export through ExportBridge"
```

## Task 6 — Pre-export `rawDecodeBridge.terminate()` for memory-peak parity

Spec §6 Phase 1. Without this step, the export bridge could spawn its worker while the decode bridge's idle timer keeps the RAW runtime alive — both heavy resources would coexist briefly, breaking Phase 1's behaviour-equivalent claim.

- [x] **Step 1 — Failing test**

Append to the bridge wiring test file:

```ts
  it('terminates the RAW decode bridge before starting the export', async () => {
    const startOrder: string[] = []
    const decodeTerminate = vi.fn(async () => {
      startOrder.push('decode-terminate')
    })
    const exportStart = vi.fn(async () => {
      startOrder.push('export')
      return { kind: 'blob', blob: new Blob() } as never
    })
    // Inject test doubles for both bridges via the orchestrator's
    // dependency-injection seam. If no seam exists, add an optional
    // `decodeBridge` parameter that defaults to the module-level singleton.
    await runOrchestratorWithDoubles({
      decodeBridge: { terminate: decodeTerminate } as never,
      exportClient: { start: exportStart, cancel: vi.fn(), dispose: vi.fn() } as never,
    })
    expect(startOrder).toEqual(['decode-terminate', 'export'])
    expect(decodeTerminate).toHaveBeenCalledTimes(1)
  })
```

- [x] **Step 2 — Run; FAIL**

Run: `pnpm vitest run src/modules/raw-processor/__tests__/orchestrate-full-res-export-bridge.test.ts`
Expected: FAIL.

- [x] **Step 3 — Wire the awaited terminate**

In `orchestrate-full-res-export.ts`, add `await decodeBridge.terminate()` as the first step of the export run (immediately after argument validation, before any `bridge.runExport(...)`). Add the optional `decodeBridge` parameter to the orchestrator's options with the module-level singleton from `luma-runtime-adapter.ts` as default.

- [x] **Step 4 — Run; PASS**

Run: `pnpm vitest run src/modules/raw-processor`
Expected: PASS.

- [x] **Step 5 — Commit**

```bash
git add src/modules/raw-processor/services/export/orchestrate-full-res-export.ts \
        src/modules/raw-processor/__tests__/orchestrate-full-res-export-bridge.test.ts
git commit -m "fix(raw-export): terminate decode bridge before export to preserve memory shape"
```

## Task 7 — Preview-size copy capability regression pin

Spec §6 Phase 1. Locks down the invariant after commits `12a5ea6` and `3f06313` already addressed the bug.

- [x] **Step 1 — Failing assertion**

```ts
  it('does not advertise preview-size copy when no canvas was captured and the pipeline was released', async () => {
    // Construct an orchestrator run where:
    //  - the export plan releases the preview pipeline (every named profile does today),
    //  - pipeline.renderToHiddenCanvas() throws or returns null,
    //  - the browser nominally supports PNG clipboard fallback.
    // Assert: returned ExportResult's copyCapability.previewSize.available === false
    // OR copyCapability.mode !== 'preview-size'.
    expect(true).toBe(false) // placeholder
  })
```

- [x] **Step 2 — Run; FAIL or PASS-as-regression-pin**

Run: `pnpm vitest run src/modules/raw-processor/__tests__/orchestrate-full-res-export-bridge.test.ts`
Expected: FAIL if the bug regressed; PASS as a regression pin if the existing fix held. If FAIL, fix the orchestrator's `copyCapability` block near `orchestrate-full-res-export.ts:332-337` to downgrade `previewSize.available` when `previewCopyCanvas` is null.

- [x] **Step 3 — Run; PASS**

Run: `pnpm vitest run src/modules/raw-processor/__tests__/orchestrate-full-res-export-bridge.test.ts`
Expected: PASS.

- [x] **Step 4 — Commit**

```bash
git add src/modules/raw-processor/__tests__/orchestrate-full-res-export-bridge.test.ts \
        src/modules/raw-processor/services/export/orchestrate-full-res-export.ts
git commit -m "test(raw-export): pin preview-size copy capability after preview release"
```

## Task 8 — Phase 1 verification

No code changes.

- [x] **Step 1 — Lint**: `pnpm lint` — PASS.
- [x] **Step 2 — Tests**: `pnpm test:run` — PASS.
- [x] **Step 3 — Build**: `pnpm build` — PASS.
- [x] **Step 4 — Browser smoke** (per `project_raw_browser_validation.md`): `pnpm build && pnpm preview`. Upload RAW, walk through embedded → quick → HQ, apply a LUT, run an export. Confirm no visible difference vs `main` before this branch.

**Phase 1 complete. Merge and confirm green on `main` before starting Phase 2.**

---

# Phase 2 · Capability Vector & Derived Policies

Goal: replace the named-profile decision model with a capability-vector + derive-function model. Flip `checkpointOutput` and `restartWorkerOnResourceRetry` to always-on. Rename `fidelity` → `performancePreference`. Split `previousInterrupted`. Spec §§1, 1.5, 2, 4, 5, 6 Phase 2.

## Task 9 — `CapabilityVector` detector

**Files:**
- Create: `src/lib/runtime/capability-vector.ts`
- Test: `src/lib/runtime/capability-vector.test.ts`

- [x] **Step 1 — Failing test (hostile-navigator normalisation)**

```ts
// src/lib/runtime/capability-vector.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  detectCapabilityVector,
  resetCapabilityVectorForTest,
  type CapabilityVector,
} from './capability-vector'

afterEach(() => {
  resetCapabilityVectorForTest()
  vi.unstubAllGlobals()
})

describe('detectCapabilityVector', () => {
  it('produces a frozen vector with sane defaults when navigator fields are missing', async () => {
    vi.stubGlobal('navigator', {
      userAgent: '',
      hardwareConcurrency: undefined,
      deviceMemory: undefined,
      storage: undefined,
    } as never)
    vi.stubGlobal('crossOriginIsolated', false)
    const vector: CapabilityVector = await detectCapabilityVector()
    expect(Object.isFrozen(vector)).toBe(true)
    expect(vector.coi).toBe(false)
    expect(vector.pthread).toBe(false)
    expect(vector.hwConcurrency).toBeGreaterThanOrEqual(1)
    expect(vector.deviceMemoryGB).toBeNull()
    expect(vector.webKitClass).toBe('unknown')
    expect(vector.maybeOpfsSupported).toBe(false)
  })
})
```

- [x] **Step 2 — Run; FAIL**

Run: `pnpm vitest run src/lib/runtime/capability-vector.test.ts`
Expected: FAIL.

- [x] **Step 3 — Implement detector**

```ts
// src/lib/runtime/capability-vector.ts
export interface CapabilityVector {
  readonly coi: boolean
  readonly pthread: boolean
  readonly deviceMemoryGB: number | null
  readonly hwConcurrency: number
  readonly webKitClass:
    | 'chromium'
    | 'webkit-desktop-safari'
    | 'webkit-mobile'
    | 'unknown'
  readonly maybeOpfsSupported: boolean
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : fallback
  return Math.min(max, Math.max(min, n))
}

function classifyUserAgent(ua: string, touch: boolean): CapabilityVector['webKitClass'] {
  if (!ua) return 'unknown'
  const isiOS = /\b(?:iPhone|iPad|iPod)\b/i.test(ua)
  const isIPadOsDesktopMode = /\bMacintosh\b/i.test(ua) && touch
  const webKit = /\bAppleWebKit\b/i.test(ua)
  const mobile = touch || /\bMobile\b/i.test(ua)
  if ((isiOS || isIPadOsDesktopMode) && webKit && mobile) return 'webkit-mobile'
  const desktopMac = /\bMacintosh\b/i.test(ua)
  const safari = /\bSafari\b/i.test(ua)
  const chromiumFamily = /\b(?:Chrome|Chromium|CriOS|Edg|OPR|FxiOS)\b/i.test(ua)
  if (desktopMac && webKit && safari && !chromiumFamily && !touch) return 'webkit-desktop-safari'
  if (chromiumFamily) return 'chromium'
  return 'unknown'
}

async function detectThreads(coi: boolean): Promise<boolean> {
  if (!coi) return false
  try {
    if (typeof SharedArrayBuffer === 'undefined') return false
    return true
  } catch {
    return false
  }
}

let cached: CapabilityVector | null = null
let inFlight: Promise<CapabilityVector> | null = null
let testOverride: CapabilityVector | null = null

export async function detectCapabilityVector(): Promise<CapabilityVector> {
  if (testOverride) return testOverride
  if (cached) return cached
  if (inFlight) return inFlight

  inFlight = (async () => {
    const nav = (globalThis as { navigator?: Navigator & { deviceMemory?: number } }).navigator
    const ua = nav?.userAgent ?? ''
    const touch = typeof nav?.maxTouchPoints === 'number' ? nav.maxTouchPoints > 0 : false
    const coi = Boolean((globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated)
    const pthread = await detectThreads(coi)
    const webKitClass = classifyUserAgent(ua, touch)
    const deviceMemory = nav?.deviceMemory
    const deviceMemoryGB =
      typeof deviceMemory === 'number' && Number.isFinite(deviceMemory) && deviceMemory > 0
        ? deviceMemory
        : null
    const hwConcurrency = clampInteger(nav?.hardwareConcurrency, 1, 64, 1)
    const maybeOpfsSupported =
      typeof nav?.storage?.getDirectory === 'function' &&
      typeof nav?.storage?.estimate === 'function'

    const vector: CapabilityVector = Object.freeze({
      coi,
      pthread,
      deviceMemoryGB,
      hwConcurrency,
      webKitClass,
      maybeOpfsSupported,
    })
    cached = vector
    inFlight = null
    return vector
  })()

  return inFlight
}

export function getCapabilityVectorSnapshot(): CapabilityVector | null {
  return testOverride ?? cached
}

export function setCapabilityVectorForTest(vector: CapabilityVector): void {
  testOverride = Object.freeze({ ...vector })
}

export function resetCapabilityVectorForTest(): void {
  testOverride = null
  cached = null
  inFlight = null
}
```

- [x] **Step 4 — Run; PASS**

Run: `pnpm vitest run src/lib/runtime/capability-vector.test.ts`
Expected: PASS.

- [x] **Step 5 — Add UA-class tests and invariant tests**

Append the four UA buckets (`chromium`, `webkit-mobile`, `webkit-desktop-safari`, `unknown`) and the two invariants (`pthread implies coi`, `hwConcurrency >= 1` under hostile inputs) per the test pattern in step 1. Run; PASS.

- [x] **Step 6 — Commit**

```bash
git add src/lib/runtime/capability-vector.ts src/lib/runtime/capability-vector.test.ts
git commit -m "feat(runtime): add CapabilityVector detector with normalisation and test injection"
```

## Task 10 — `ExportRuntimeResources` snapshot

**Files:**
- Create: `src/lib/runtime/export-runtime-resources.ts`
- Test: `src/lib/runtime/export-runtime-resources.test.ts`

- [x] **Step 1 — Failing tests**

```ts
// src/lib/runtime/export-runtime-resources.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  resetCapabilityVectorForTest,
  setCapabilityVectorForTest,
} from './capability-vector'
import { snapshotExportRuntimeResources } from './export-runtime-resources'

afterEach(() => {
  resetCapabilityVectorForTest()
  vi.unstubAllGlobals()
})

describe('snapshotExportRuntimeResources', () => {
  it('computes available MB from quota minus usage', async () => {
    setCapabilityVectorForTest({
      coi: true, pthread: true, deviceMemoryGB: 16, hwConcurrency: 8,
      webKitClass: 'chromium', maybeOpfsSupported: true,
    })
    vi.stubGlobal('navigator', {
      storage: { estimate: vi.fn(async () => ({ quota: 1_000_000_000, usage: 200_000_000 })) },
    } as never)
    const snap = await snapshotExportRuntimeResources({ streamingSinkAvailable: true })
    expect(snap.opfsSinkAvailable).toBe(true)
    expect(snap.opfsAvailableMB).toBe(800)
    expect(snap.streamingSinkAvailable).toBe(true)
  })

  it('marks opfs unavailable when capability vector says so', async () => {
    setCapabilityVectorForTest({
      coi: true, pthread: true, deviceMemoryGB: 16, hwConcurrency: 8,
      webKitClass: 'chromium', maybeOpfsSupported: false,
    })
    const snap = await snapshotExportRuntimeResources({ streamingSinkAvailable: true })
    expect(snap.opfsSinkAvailable).toBe(false)
    expect(snap.opfsAvailableMB).toBeNull()
  })
})
```

- [x] **Step 2 — Run; FAIL**

Run: `pnpm vitest run src/lib/runtime/export-runtime-resources.test.ts`
Expected: FAIL.

- [x] **Step 3 — Implement**

```ts
// src/lib/runtime/export-runtime-resources.ts
import { getCapabilityVectorSnapshot } from './capability-vector'

export interface ExportRuntimeResources {
  readonly opfsSinkAvailable: boolean
  readonly opfsAvailableMB: number | null
  readonly streamingSinkAvailable: boolean
}

export interface ExportRuntimeResourcesInput {
  streamingSinkAvailable: boolean
}

export async function snapshotExportRuntimeResources(
  input: ExportRuntimeResourcesInput,
): Promise<ExportRuntimeResources> {
  const cap = getCapabilityVectorSnapshot()
  if (!cap?.maybeOpfsSupported) {
    return Object.freeze({
      opfsSinkAvailable: false,
      opfsAvailableMB: null,
      streamingSinkAvailable: input.streamingSinkAvailable,
    })
  }
  try {
    const estimate = await (globalThis as { navigator?: Navigator }).navigator?.storage?.estimate?.()
    const quota = estimate?.quota ?? 0
    const usage = estimate?.usage ?? 0
    const availableBytes = Math.max(0, quota - usage)
    const opfsAvailableMB = quota > 0 ? Math.floor(availableBytes / 1_000_000) : null
    return Object.freeze({
      opfsSinkAvailable: quota > 0,
      opfsAvailableMB,
      streamingSinkAvailable: input.streamingSinkAvailable,
    })
  } catch {
    return Object.freeze({
      opfsSinkAvailable: false,
      opfsAvailableMB: null,
      streamingSinkAvailable: input.streamingSinkAvailable,
    })
  }
}
```

- [x] **Step 4 — Run; PASS**

Run: `pnpm vitest run src/lib/runtime/export-runtime-resources.test.ts`
Expected: PASS.

- [x] **Step 5 — Commit**

```bash
git add src/lib/runtime/export-runtime-resources.ts src/lib/runtime/export-runtime-resources.test.ts
git commit -m "feat(runtime): add ExportRuntimeResources snapshot with quota-minus-usage"
```

## Task 11 — `deriveInteractivePolicy`

**Files:**
- Create: `src/lib/runtime/interactive-policy.ts`
- Test: `src/lib/runtime/interactive-policy.test.ts`

- [x] **Step 1 — Failing test**

```ts
// src/lib/runtime/interactive-policy.test.ts
import { describe, expect, it } from 'vitest'

import type { CapabilityVector } from './capability-vector'
import { deriveInteractivePolicy } from './interactive-policy'

const baseCap: CapabilityVector = {
  coi: true, pthread: true, deviceMemoryGB: 16, hwConcurrency: 8,
  webKitClass: 'chromium', maybeOpfsSupported: true,
}

describe('deriveInteractivePolicy', () => {
  it('grants 16MP HQ on chromium desktop', () => {
    const p = deriveInteractivePolicy(baseCap)
    expect(p.boundedHqMaxPixels).toBe(16_000_000)
    expect(p.previewWorkerMemoryProfile).toBe('desktop')
    expect(p.allowConcurrentDecodeAndLutParse).toBe(true)
  })
  it('caps to 8MP on webkit-mobile', () => {
    const p = deriveInteractivePolicy({ ...baseCap, webKitClass: 'webkit-mobile' })
    expect(p.boundedHqMaxPixels).toBe(8_000_000)
    expect(p.previewWorkerMemoryProfile).toBe('low-memory')
  })
  it('caps by deviceMemory when known', () => {
    const p = deriveInteractivePolicy({ ...baseCap, deviceMemoryGB: 2 })
    expect(p.boundedHqMaxPixels).toBe(8_000_000)
  })
  it('forces low-memory when !pthread', () => {
    const p = deriveInteractivePolicy({ ...baseCap, pthread: false })
    expect(p.boundedHqMaxPixels).toBe(8_000_000)
    expect(p.previewWorkerMemoryProfile).toBe('low-memory')
    expect(p.allowConcurrentDecodeAndLutParse).toBe(false)
  })
  it('gates desktop memory profile to chromium only', () => {
    const p = deriveInteractivePolicy({ ...baseCap, webKitClass: 'webkit-desktop-safari' })
    expect(p.previewWorkerMemoryProfile).toBe('low-memory')
  })
})
```

- [x] **Step 2 — Run; FAIL**

Run: `pnpm vitest run src/lib/runtime/interactive-policy.test.ts`
Expected: FAIL.

- [x] **Step 3 — Implement**

```ts
// src/lib/runtime/interactive-policy.ts
import type { CapabilityVector } from './capability-vector'

export interface InteractivePolicy {
  readonly boundedHqMaxPixels: number
  readonly previewWorkerMemoryProfile: 'low-memory' | 'desktop'
  readonly allowConcurrentDecodeAndLutParse: boolean
}

export function deriveInteractivePolicy(cap: CapabilityVector): InteractivePolicy {
  let boundedHqMaxPixels = 16_000_000
  if (cap.webKitClass === 'webkit-mobile' || !cap.pthread) {
    boundedHqMaxPixels = Math.min(boundedHqMaxPixels, 8_000_000)
  }
  if (cap.deviceMemoryGB != null) {
    boundedHqMaxPixels = Math.min(boundedHqMaxPixels, cap.deviceMemoryGB * 4_000_000)
  }
  const previewWorkerMemoryProfile: InteractivePolicy['previewWorkerMemoryProfile'] =
    cap.coi && cap.pthread && cap.webKitClass === 'chromium' ? 'desktop' : 'low-memory'
  const allowConcurrentDecodeAndLutParse = cap.pthread && cap.hwConcurrency >= 4
  return Object.freeze({
    boundedHqMaxPixels,
    previewWorkerMemoryProfile,
    allowConcurrentDecodeAndLutParse,
  })
}
```

- [x] **Step 4 — Run; PASS**

Run: `pnpm vitest run src/lib/runtime/interactive-policy.test.ts`
Expected: PASS.

- [x] **Step 5 — Commit**

```bash
git add src/lib/runtime/interactive-policy.ts src/lib/runtime/interactive-policy.test.ts
git commit -m "feat(runtime): add deriveInteractivePolicy with conservative desktop gating"
```

## Task 12 — `deriveExportPolicy` core

**Files:**
- Create: `src/lib/runtime/export-policy.ts`
- Test: `src/lib/runtime/export-policy.test.ts`

- [x] **Step 1 — Failing tests (seven scenarios)**

```ts
// src/lib/runtime/export-policy.test.ts
import { describe, expect, it } from 'vitest'

import type { CapabilityVector } from './capability-vector'
import { deriveExportPolicy } from './export-policy'
import type { ExportRuntimeResources } from './export-runtime-resources'

const baseCap: CapabilityVector = {
  coi: true, pthread: true, deviceMemoryGB: 16, hwConcurrency: 8,
  webKitClass: 'chromium', maybeOpfsSupported: true,
}
const opfsRuntime: ExportRuntimeResources = Object.freeze({
  opfsSinkAvailable: true, opfsAvailableMB: 4_000, streamingSinkAvailable: true,
})

describe('deriveExportPolicy', () => {
  it('produces high-performance on chromium desktop / balanced preference', () => {
    const p = deriveExportPolicy(
      baseCap, { width: 6000, height: 4000 },
      { performancePreference: 'balanced', previousResourceFailure: false, previousCrashLikeInterruption: false, previousUserInterrupted: false },
      opfsRuntime,
    )
    expect(p.rowSlice).toBe(512)
    expect(p.concurrency).toBe(2)
    expect(p.workerMemoryProfile).toBe('desktop')
    expect(p.outputSink).toBe('opfs-file')
    expect(p.productCopy).toBe('high-performance')
    expect(p.persistEveryNRows).toBe(4096)
    expect(p.derivedLabel).toBe('desktop-thr2-rs512-opfs-file-wkchromium')
  })

  it('caps webkit-mobile to rowSlice 128 / conc 1 / low-memory', () => {
    const p = deriveExportPolicy(
      { ...baseCap, webKitClass: 'webkit-mobile' }, { width: 6000, height: 4000 },
      { performancePreference: 'max', previousResourceFailure: false, previousCrashLikeInterruption: false, previousUserInterrupted: false },
      opfsRuntime,
    )
    expect(p.rowSlice).toBeLessThanOrEqual(128)
    expect(p.concurrency).toBe(1)
    expect(p.workerMemoryProfile).toBe('low-memory')
  })

  it('user-cancel is idempotent vs no prior state', () => {
    const intent = { performancePreference: 'balanced' as const, previousResourceFailure: false, previousCrashLikeInterruption: false, previousUserInterrupted: false }
    const a = deriveExportPolicy(baseCap, { width: 6000, height: 4000 }, intent, opfsRuntime)
    const b = deriveExportPolicy(baseCap, { width: 6000, height: 4000 }, { ...intent, previousUserInterrupted: true }, opfsRuntime)
    expect(b).toEqual(a)
  })

  it('previousResourceFailure halves rowSlice and floors concurrency', () => {
    const p = deriveExportPolicy(
      baseCap, { width: 6000, height: 4000 },
      { performancePreference: 'max', previousResourceFailure: true, previousCrashLikeInterruption: false, previousUserInterrupted: false },
      opfsRuntime,
    )
    expect(p.rowSlice).toBe(256)
    expect(p.concurrency).toBe(1)
    expect(p.productCopy).toBe('resource-retry')
  })

  it('previousCrashLikeInterruption quarters rowSlice', () => {
    const p = deriveExportPolicy(
      baseCap, { width: 6000, height: 4000 },
      { performancePreference: 'max', previousResourceFailure: false, previousCrashLikeInterruption: true, previousUserInterrupted: false },
      opfsRuntime,
    )
    expect(p.rowSlice).toBe(128)
    expect(p.concurrency).toBe(1)
    expect(p.productCopy).toBe('interrupted-retry')
  })

  it('falls through to streaming when OPFS cannot fit', () => {
    const p = deriveExportPolicy(
      baseCap, { width: 20_000, height: 15_000 },
      { performancePreference: 'balanced', previousResourceFailure: false, previousCrashLikeInterruption: false, previousUserInterrupted: false },
      Object.freeze({ opfsSinkAvailable: true, opfsAvailableMB: 100, streamingSinkAvailable: true }),
    )
    expect(p.outputSink).toBe('streaming')
  })

  it('cannot-safely-complete on webkit-mobile + 60MP + blob-handoff', () => {
    const p = deriveExportPolicy(
      { ...baseCap, webKitClass: 'webkit-mobile' }, { width: 9000, height: 6700 },
      { performancePreference: 'safe', previousResourceFailure: false, previousCrashLikeInterruption: false, previousUserInterrupted: false },
      Object.freeze({ opfsSinkAvailable: false, opfsAvailableMB: null, streamingSinkAvailable: false }),
    )
    expect(p.outputSink).toBe('blob-handoff')
    expect(p.productCopy).toBe('cannot-safely-complete')
  })
})
```

- [x] **Step 2 — Run; FAIL**

Run: `pnpm vitest run src/lib/runtime/export-policy.test.ts`
Expected: FAIL.

- [x] **Step 3 — Implement per spec §2.2**

```ts
// src/lib/runtime/export-policy.ts
import type { CapabilityVector } from './capability-vector'
import type { ExportRuntimeResources } from './export-runtime-resources'

export type PolicyProductCopy =
  | 'high-performance'
  | 'safe-export'
  | 'resource-retry'
  | 'interrupted-retry'
  | 'non-durable-checkpoint'
  | 'cannot-safely-complete'

export type ExportOrchestrationCopy = PolicyProductCopy | 'interrupted-source-needed'

export type PerformancePreference = 'safe' | 'balanced' | 'max'

export interface ExportIntent {
  readonly performancePreference: PerformancePreference
  readonly previousResourceFailure: boolean
  readonly previousCrashLikeInterruption: boolean
  readonly previousUserInterrupted: boolean
}

export interface ExportPolicy {
  readonly rowSlice: number
  readonly concurrency: number
  readonly maxConcurrency: number
  readonly workerMemoryProfile: 'low-memory' | 'desktop'
  readonly persistEveryNRows: number
  readonly outputSink: 'opfs-file' | 'streaming' | 'blob-handoff'
  readonly productCopy: PolicyProductCopy
  readonly derivedLabel: string
}

export const LARGE_EXPORT_MEGAPIXEL_THRESHOLD = 50
const OPFS_SAFETY_MARGIN_MB = 64
const OPFS_MB_PER_MEGAPIXEL = 4

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const preferenceWeight = (p: PerformancePreference) => (p === 'safe' ? 1 : p === 'balanced' ? 2 : 3)

export function deriveExportPolicy(
  cap: CapabilityVector,
  image: { width: number; height: number },
  intent: ExportIntent,
  runtime: ExportRuntimeResources,
): ExportPolicy {
  const megapixels = (image.width * image.height) / 1_000_000

  let rowSlice = 512
  if (megapixels >= 100) rowSlice /= 2
  if (!cap.pthread) rowSlice = Math.min(rowSlice, 256)
  if (cap.webKitClass === 'webkit-mobile') rowSlice = Math.min(rowSlice, 128)
  if (cap.webKitClass === 'webkit-desktop-safari') rowSlice = Math.min(rowSlice, 256)
  if (cap.deviceMemoryGB != null && cap.deviceMemoryGB <= 4) rowSlice = Math.min(rowSlice, 128)
  if (intent.previousResourceFailure) rowSlice /= 2
  if (intent.previousCrashLikeInterruption) rowSlice /= 4
  rowSlice = clamp(Math.floor(rowSlice), 64, 2048)

  const threadBudget = Math.max(1, cap.hwConcurrency - 1)
  let cMax = cap.pthread ? Math.min(threadBudget, 3) : 1
  if (cap.webKitClass === 'webkit-mobile' || cap.webKitClass === 'webkit-desktop-safari') cMax = 1
  if (intent.previousResourceFailure || intent.previousCrashLikeInterruption) cMax = 1
  cMax = Math.max(1, cMax)
  const concurrency = clamp(preferenceWeight(intent.performancePreference), 1, cMax)

  const workerMemoryProfile: ExportPolicy['workerMemoryProfile'] =
    cap.coi && cap.pthread && cap.webKitClass === 'chromium' ? 'desktop' : 'low-memory'

  const targetRows = rowSlice <= 128 ? 2048 : 4096
  const persistEveryNRows = clamp(Math.ceil(targetRows / rowSlice) * rowSlice, rowSlice, 4096)

  const opfsFits =
    runtime.opfsSinkAvailable &&
    runtime.opfsAvailableMB != null &&
    runtime.opfsAvailableMB > megapixels * OPFS_MB_PER_MEGAPIXEL + OPFS_SAFETY_MARGIN_MB
  const outputSink: ExportPolicy['outputSink'] = opfsFits
    ? 'opfs-file'
    : runtime.streamingSinkAvailable
      ? 'streaming'
      : 'blob-handoff'

  let productCopy: PolicyProductCopy
  if (
    megapixels > LARGE_EXPORT_MEGAPIXEL_THRESHOLD &&
    outputSink === 'blob-handoff' &&
    cap.webKitClass === 'webkit-mobile'
  ) {
    productCopy = 'cannot-safely-complete'
  } else if (intent.previousCrashLikeInterruption) {
    productCopy = 'interrupted-retry'
  } else if (intent.previousResourceFailure) {
    productCopy = 'resource-retry'
  } else if (outputSink === 'blob-handoff' && megapixels > LARGE_EXPORT_MEGAPIXEL_THRESHOLD) {
    productCopy = 'non-durable-checkpoint'
  } else if (workerMemoryProfile === 'desktop' && concurrency >= 2 && rowSlice >= 512) {
    productCopy = 'high-performance'
  } else {
    productCopy = 'safe-export'
  }

  const derivedLabel = `${workerMemoryProfile}-thr${concurrency}-rs${rowSlice}-${outputSink}-wk${cap.webKitClass}`

  return Object.freeze({
    rowSlice, concurrency, maxConcurrency: cMax, workerMemoryProfile,
    persistEveryNRows, outputSink, productCopy, derivedLabel,
  })
}
```

- [x] **Step 4 — Run; PASS**

Run: `pnpm vitest run src/lib/runtime/export-policy.test.ts`
Expected: PASS.

- [x] **Step 5 — Commit**

```bash
git add src/lib/runtime/export-policy.ts src/lib/runtime/export-policy.test.ts
git commit -m "feat(runtime): add deriveExportPolicy with per-spec derivation"
```

## Task 13 — Property tests for `deriveExportPolicy`

**Files:**
- Create: `src/lib/runtime/export-policy.property.test.ts`

- [x] **Step 1 — Check `fast-check` dep**

Run: `pnpm pkg get devDependencies.fast-check`
- If a version is returned → use it directly.
- If `undefined` → install: `pnpm add -D fast-check` (announce the dep add explicitly; this is a small additional dev dependency).
- Note: repo-pinned `pnpm@10.18.0` reports `ERR_PNPM_NOT_IMPLEMENTED` for `pnpm pkg get`; this run verified absence with `rg '"fast-check"' package.json pnpm-lock.yaml`, then added it with `pnpm add -D fast-check`.

- [x] **Step 2 — Write the property tests**

```ts
// src/lib/runtime/export-policy.property.test.ts
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import type { CapabilityVector } from './capability-vector'
import { deriveExportPolicy } from './export-policy'
import type { ExportRuntimeResources } from './export-runtime-resources'

const capArb: fc.Arbitrary<CapabilityVector> = fc.record({
  coi: fc.boolean(),
  pthread: fc.boolean(),
  deviceMemoryGB: fc.option(fc.integer({ min: 1, max: 64 }), { nil: null }),
  hwConcurrency: fc.integer({ min: 1, max: 64 }),
  webKitClass: fc.constantFrom('chromium', 'webkit-desktop-safari', 'webkit-mobile', 'unknown'),
  maybeOpfsSupported: fc.boolean(),
}).map((v) => ({ ...v, pthread: v.coi && v.pthread }))

const intentArb = fc.record({
  performancePreference: fc.constantFrom('safe', 'balanced', 'max'),
  previousResourceFailure: fc.boolean(),
  previousCrashLikeInterruption: fc.boolean(),
  previousUserInterrupted: fc.boolean(),
})

const imageArb = fc.record({
  width: fc.integer({ min: 100, max: 20_000 }),
  height: fc.integer({ min: 100, max: 20_000 }),
})

const runtimeArb: fc.Arbitrary<ExportRuntimeResources> = fc.record({
  opfsSinkAvailable: fc.boolean(),
  opfsAvailableMB: fc.option(fc.integer({ min: 0, max: 100_000 }), { nil: null }),
  streamingSinkAvailable: fc.boolean(),
})

describe('deriveExportPolicy invariants (property)', () => {
  it('always returns a sane policy', () => {
    fc.assert(
      fc.property(capArb, imageArb, intentArb, runtimeArb, (cap, image, intent, runtime) => {
        const p = deriveExportPolicy(cap, image, intent, runtime)
        expect(p.rowSlice).toBeGreaterThanOrEqual(64)
        expect(p.rowSlice).toBeLessThanOrEqual(2048)
        expect(p.concurrency).toBeGreaterThanOrEqual(1)
        expect(p.maxConcurrency).toBeGreaterThanOrEqual(1)
        expect(p.concurrency).toBeLessThanOrEqual(p.maxConcurrency)
        expect(p.persistEveryNRows).toBeGreaterThanOrEqual(p.rowSlice)
        expect(p.persistEveryNRows).toBeLessThanOrEqual(4096)
        if (p.workerMemoryProfile === 'desktop') {
          expect(cap.coi).toBe(true)
          expect(cap.pthread).toBe(true)
          expect(cap.webKitClass).toBe('chromium')
        }
      }),
      { numRuns: 1_000 },
    )
  })

  it('user-cancel does not change the policy', () => {
    fc.assert(
      fc.property(capArb, imageArb, intentArb, runtimeArb, (cap, image, intent, runtime) => {
        const a = deriveExportPolicy(cap, image, { ...intent, previousUserInterrupted: false }, runtime)
        const b = deriveExportPolicy(cap, image, { ...intent, previousUserInterrupted: true }, runtime)
        expect(b).toEqual(a)
      }),
      { numRuns: 500 },
    )
  })

  it('resource failure weakly decreases rowSlice and concurrency', () => {
    fc.assert(
      fc.property(capArb, imageArb, intentArb, runtimeArb, (cap, image, intent, runtime) => {
        const clean = deriveExportPolicy(cap, image, { ...intent, previousResourceFailure: false, previousCrashLikeInterruption: false }, runtime)
        const failed = deriveExportPolicy(cap, image, { ...intent, previousResourceFailure: true, previousCrashLikeInterruption: false }, runtime)
        expect(failed.rowSlice).toBeLessThanOrEqual(clean.rowSlice)
        expect(failed.concurrency).toBeLessThanOrEqual(clean.concurrency)
      }),
      { numRuns: 500 },
    )
  })
})
```

- [x] **Step 3 — Run; PASS**

Run: `pnpm vitest run src/lib/runtime/export-policy.property.test.ts`
Expected: PASS. If any property fails, the failing case is a real bug in `deriveExportPolicy` — fix the derive math, not the property.

- [x] **Step 4 — Commit**

```bash
git add src/lib/runtime/export-policy.property.test.ts
git commit -m "test(runtime): add property tests for deriveExportPolicy invariants"
```

## Task 14 — Migrate `selectExportExecutionPlan` to delegate

**Files:**
- Modify: `src/lib/export/execution-profile.ts` (lines 316–403 own the chooser + plan selector)
- Modify: `src/lib/export/execution-profile.test.ts`

- [x] **Step 1 — Failing test asserting new input shape**

Append to `execution-profile.test.ts`:

```ts
it('accepts performancePreference, three previous-failure flags, capability, and runtime resources', () => {
  const plan = selectExportExecutionPlan({
    performancePreference: 'balanced',
    previousResourceFailure: false,
    previousCrashLikeInterruption: false,
    previousUserInterrupted: false,
    sourceWidth: 6000,
    sourceHeight: 4000,
    capability: {
      coi: true, pthread: true, deviceMemoryGB: 16, hwConcurrency: 8,
      webKitClass: 'chromium', maybeOpfsSupported: true,
    },
    runtime: {
      opfsSinkAvailable: true, opfsAvailableMB: 4_000, streamingSinkAvailable: true,
    },
  } as never)
  expect(plan.profile.checkpointOutput).toBe(true)
  expect(plan.profile.restartWorkerOnResourceRetry).toBe(true)
  expect(plan.runtimeMemoryProfile).toBe('desktop')
  expect((plan as { derivedLabel?: string }).derivedLabel).toMatch(/chromium/)
})
```

- [x] **Step 2 — Run; FAIL**

Run: `pnpm vitest run src/lib/export/execution-profile.test.ts`
Expected: FAIL.

- [x] **Step 3 — Update `selectExportExecutionPlan` signature and delegate**

In `src/lib/export/execution-profile.ts`:

1. Add the new input shape: replace `fidelity: ExportFidelity` with `performancePreference: PerformancePreference`. Accept `fidelity?: ExportFidelity` as a deprecation alias for one phase (map missing `performancePreference` from `fidelity`).
2. Replace `previousInterrupted?: boolean` with three flags. Accept `previousInterrupted` as alias mapped onto `previousCrashLikeInterruption`.
3. Accept new `capability: CapabilityVector` and `runtime: ExportRuntimeResources` fields. If absent, fall back to `getCapabilityVectorSnapshot()` for capability and require runtime to be passed (the caller in `export-system.ts` always passes one in Task 16).
4. Build the policy via `deriveExportPolicy({...})`.
5. Translate the derived policy into the existing `ExportExecutionPlan` shape:
   - `profile: ExportExecutionProfile` is synthesised with **`checkpointOutput: true` and `restartWorkerOnResourceRetry: true` always** and other fields populated from the derived policy (`preferredRowsFor100Mp` / `preferredRowsBelow100Mp` both set to `derivedPolicy.rowSlice`; `boundedHqMaxPixels` from `deriveInteractivePolicy(capability)`).
   - `preferredRows: derivedPolicy.rowSlice`
   - `concurrency: derivedPolicy.concurrency`
   - `maxConcurrency: derivedPolicy.maxConcurrency`
   - `runtimeMemoryProfile: derivedPolicy.workerMemoryProfile`
   - `outputSink: derivedPolicy.outputSink`
   - `productCopy: derivedPolicy.productCopy` (orchestrator may override to `'interrupted-source-needed'`)
   - New fields: `derivedLabel: derivedPolicy.derivedLabel`, `policyVector: derivedPolicy`.
6. `chooseProfile` becomes a thin shim returning a synthesised `ExportExecutionProfileName` for the persisted `profile` field (for §4 back-compat): `derivedPolicy.workerMemoryProfile === 'desktop' && derivedPolicy.concurrency >= 2 && derivedPolicy.rowSlice >= 512 ? 'desktop-fast' : capability.webKitClass === 'webkit-mobile' ? 'ios-safe' : 'mobile-balanced'`.

- [x] **Step 4 — Run the entire `execution-profile.test.ts` and fix existing assertions**

Run: `pnpm vitest run src/lib/export/execution-profile.test.ts`
Expected: most existing tests still pass; the few that asserted on named-profile constants (e.g. `profile.maxRows === 256`) need to assert on derived fields (`plan.preferredRows`, `plan.concurrency`, `plan.derivedLabel`) instead. Update each affected assertion.

- [x] **Step 5 — Run the wider export surface**

Run: `pnpm vitest run src/lib/export src/modules/raw-processor/services/export src/modules/raw-processor/__tests__`
Expected: PASS. Update any test in the export-system or orchestrator suites that relied on the old named-profile row counts to assert on derived values.

- [x] **Step 6 — Commit**

```bash
git add src/lib/export/execution-profile.ts src/lib/export/execution-profile.test.ts
git commit -m "refactor(export): delegate selectExportExecutionPlan to deriveExportPolicy"
```

## Task 15 — Migrate `luma-runtime-adapter.ts` to consult `deriveInteractivePolicy`

**Files:**
- Modify: `src/lib/raw/luma-runtime-adapter.ts`
- Test: `src/lib/raw/__tests__/luma-runtime-adapter-bridge.test.ts` (append)

- [x] **Step 1 — Failing test**

Append to the existing bridge test file:

```ts
  it('honours deriveInteractivePolicy for the preview runtime memory profile', async () => {
    setCapabilityVectorForTest({
      coi: true, pthread: true, deviceMemoryGB: 4, hwConcurrency: 4,
      webKitClass: 'webkit-mobile', maybeOpfsSupported: true,
    })
    try {
      const seen: unknown[] = []
      const runtimeFactory = vi.fn(({ memoryProfile, requireCrossOriginIsolation }: any) => {
        seen.push({ memoryProfile, requireCrossOriginIsolation })
        return fakeRuntime()
      }) as never
      await decodeQuickPreviewLuma({ file: new File([], 'a.dng'), runtimeFactory })
      expect(seen[0]).toMatchObject({ memoryProfile: 'low-memory', requireCrossOriginIsolation: false })
    } finally {
      resetCapabilityVectorForTest()
    }
  })
```

- [x] **Step 2 — Run; FAIL**

Run: `pnpm vitest run src/lib/raw`
Expected: FAIL.

- [x] **Step 3 — Edit `luma-runtime-adapter.ts`**

Replace:

```ts
createLumaRawRuntime({ requireCrossOriginIsolation: true })
```

with:

```ts
import { detectCapabilityVector, getCapabilityVectorSnapshot } from '~/lib/runtime/capability-vector'
import { deriveInteractivePolicy } from '~/lib/runtime/interactive-policy'

// inside the bridge's runtimeFactory
const cap = getCapabilityVectorSnapshot() ?? (await detectCapabilityVector())
const policy = deriveInteractivePolicy(cap)
return createLumaRawRuntime({
  requireCrossOriginIsolation: policy.previewWorkerMemoryProfile === 'desktop',
  memoryProfile: policy.previewWorkerMemoryProfile,
})
```

Confirm `createLumaRawRuntime` accepts `memoryProfile` (see `packages/luma-raw-runtime/src/runtime.ts:20`).

- [x] **Step 4 — Run; PASS**

Run: `pnpm vitest run src/lib/raw`
Expected: PASS.

- [x] **Step 5 — Commit**

```bash
git add src/lib/raw/luma-runtime-adapter.ts src/lib/raw/__tests__/luma-runtime-adapter-bridge.test.ts
git commit -m "refactor(raw-adapter): consult deriveInteractivePolicy for runtime memory profile"
```

## Task 16 — Wire export-system to snapshot resources and pass split flags

**Files:**
- Modify: `src/modules/raw-processor/services/export-system.ts`
- Modify: any caller passing `fidelity` / `previousInterrupted` to `selectExportExecutionPlan`

- [x] **Step 1 — Failing test**

```ts
// Append to src/modules/raw-processor/__tests__/export-system.test.ts
it('snapshots ExportRuntimeResources at plan time, not boot time', async () => {
  // Reuse the existing export-system fixture pattern in this file.
  // Mock navigator.storage.estimate to return different (quota, usage) on each call.
  // Run two consecutive plan selections. Assert each plan's outputSink reflects
  // the state at its own snapshot moment (e.g. first plan = opfs-file, second
  // plan after quota tightens = streaming or blob-handoff).
  expect(true).toBe(false) // placeholder
})
```

- [x] **Step 2 — Run; FAIL**

Run: `pnpm vitest run src/modules/raw-processor/__tests__/export-system.test.ts`
Expected: FAIL.

- [x] **Step 3 — Edit `export-system.ts`**

At each `selectExportExecutionPlan` call site (`:44`, `:72`):

```ts
import { detectCapabilityVector } from '~/lib/runtime/capability-vector'
import { snapshotExportRuntimeResources } from '~/lib/runtime/export-runtime-resources'

// Replace the existing call with:
const capability = await detectCapabilityVector()
const runtime = await snapshotExportRuntimeResources({ streamingSinkAvailable })
const plan = selectExportExecutionPlan({
  performancePreference,           // 1:1 from existing fidelity user setting
  previousResourceFailure,         // mapped from session state
  previousCrashLikeInterruption,   // mapped from session state
  previousUserInterrupted,         // mapped from session state
  sourceWidth, sourceHeight,
  capability, runtime,
})
```

- Delete the hard-coded `lowMemoryAvailable: true` at both call sites (the field stays on the chooser interface as a no-op alias for one phase; Phase 3 removes it).
- For the three new `previous*` flags, map from the session state your existing code uses (today there is one `previousInterrupted` boolean; on Phase 2 split it into resource vs crash via the failure reason if available, otherwise default to `previousCrashLikeInterruption: previousInterrupted` to preserve current behaviour).

- [x] **Step 4 — Run; PASS**

Run: `pnpm vitest run src/modules/raw-processor/__tests__/export-system.test.ts`
Expected: PASS.

- [x] **Step 5 — Run broader suite**

Run: `pnpm vitest run src/modules/raw-processor`
Expected: PASS.

- [x] **Step 6 — Commit**

```bash
git add src/modules/raw-processor/services/export-system.ts \
        src/modules/raw-processor/__tests__/export-system.test.ts
git commit -m "refactor(export-system): snapshot ExportRuntimeResources per plan with split failure flags"
```

## Task 17 — Telemetry: emit `derivedLabel` and `policyVector`

**Files:**
- Modify: `src/lib/export/execution-profile.ts` (the `ExportPlanSelectedDebugPayload` type and emitter)
- Modify: `src/lib/export/execution-profile.test.ts`

- [x] **Step 1 — Failing test**

```ts
// Append to src/lib/export/execution-profile.test.ts
it('emits derivedLabel and policyVector alongside legacy profile in debug events', () => {
  const events: any[] = []
  const handler = (e: Event) => events.push((e as CustomEvent).detail)
  window.addEventListener('lumaforge-export-debug', handler)
  try {
    selectExportExecutionPlan({ /* same input as Task 14 step 1 */ } as never)
    const selected = events.find((e) => e.type === 'export-plan-selected')
    expect(selected.payload.derivedLabel).toBeTruthy()
    expect(selected.payload.policyVector).toBeDefined()
    expect(selected.payload.profile).toBeDefined()
  } finally {
    window.removeEventListener('lumaforge-export-debug', handler)
  }
})
```

- [x] **Step 2 — Run; FAIL**

Run: `pnpm vitest run src/lib/export/execution-profile.test.ts`
Expected: FAIL.

- [x] **Step 3 — Extend payload type and emitter**

Update `ExportPlanSelectedDebugPayload`:

```ts
export type ExportPlanSelectedDebugPayload = {
  profile: ExportExecutionProfileName
  derivedLabel: string
  policyVector: ExportPolicy
  preferredRows: number
  concurrency: number
  runtimeMemoryProfile: ExportRuntimeMemoryProfile
  outputSink: ExportOutputSink
  checkpointMode: ExportCheckpointMode
  checkpointDurableExpected: boolean
}
```

In the plan-selection emitter, populate the new fields from the derived policy.

- [x] **Step 4 — Run; PASS**

Run: `pnpm vitest run src/lib/export/execution-profile.test.ts`
Expected: PASS.

- [x] **Step 5 — Commit**

```bash
git add src/lib/export/execution-profile.ts src/lib/export/execution-profile.test.ts
git commit -m "feat(telemetry): emit derivedLabel and policyVector alongside legacy profile"
```

## Task 18 — Checkpoint store: write `derivedLabel`; never derive runtime from stored `profile`

**Files:**
- Modify: `src/lib/export/checkpoint-store.ts`
- Test: `src/lib/export/checkpoint-store.test.ts`
- Modify: `src/modules/raw-processor/services/export/orchestrate-full-res-export.ts` (resume path)

- [x] **Step 1 — Failing test**

```ts
// Append to src/lib/export/checkpoint-store.test.ts
it('re-derives policy from current capability on resume, ignoring stored profile', async () => {
  setCapabilityVectorForTest({
    coi: false, pthread: false, deviceMemoryGB: 4, hwConcurrency: 4,
    webKitClass: 'webkit-mobile', maybeOpfsSupported: false,
  })
  try {
    // Write a checkpoint record with profile = 'desktop-fast'.
    // Reload via the public reader.
    // Trigger the resume path (or compute the resume policy via the same code path).
    // Assert the resume policy is low-memory, not desktop.
    expect(true).toBe(false) // placeholder
  } finally {
    resetCapabilityVectorForTest()
  }
})
```

- [x] **Step 2 — Run; FAIL**

Run: `pnpm vitest run src/lib/export/checkpoint-store.test.ts`
Expected: FAIL.

- [x] **Step 3 — Edit `checkpoint-store.ts`**

1. Extend the record type with `derivedLabel?: string`. New writes always set it; old reads tolerate absence.
2. Update the reader: it returns the stored fields as data. It does **not** synthesise a policy.
3. Add a code comment marking the invariant: stored `profile` is metadata only.

- [x] **Step 4 — Edit the resume path in the orchestrator**

In `orchestrate-full-res-export.ts`, when a checkpoint is found:
- Call `selectExportExecutionPlan({...})` with the **current** capability + the **current** runtime snapshot + the **manifest's** image dimensions.
- Use the resulting plan for resume execution.
- Do not consult `record.profile` for any decision.

- [x] **Step 5 — Run; PASS**

Run: `pnpm vitest run src/lib/export/checkpoint-store.test.ts src/modules/raw-processor/__tests__`
Expected: PASS.

- [x] **Step 6 — Commit**

```bash
git add src/lib/export/checkpoint-store.ts src/lib/export/checkpoint-store.test.ts \
        src/modules/raw-processor/services/export/orchestrate-full-res-export.ts
git commit -m "feat(checkpoint): write derivedLabel and always re-derive policy on resume"
```

## Task 19 — i18n keys for `highPerformance` and `derivedLabelHint`

**Files:**
- Modify: `src/locales/en.json` + `src/locales/zh-CN.json`
- Modify: `src/lib/export/execution-profile.ts` (wire `raw.export.highPerformance` into `getExportModeCopy`)

- [x] **Step 1 — Add keys**

`en.json`:
```json
"raw": {
  "export": {
    "highPerformance": "Using high-performance full-resolution export.",
    "derivedLabelHint": "Export profile: {label}"
  }
}
```

`zh-CN.json`:
```json
"raw": {
  "export": {
    "highPerformance": "正在使用高性能全分辨率导出。",
    "derivedLabelHint": "导出策略：{label}"
  }
}
```

(Merge into the existing nested structure — do not overwrite siblings.)

- [x] **Step 2 — Wire `getExportModeCopy`**

Replace the inline English string for `'high-performance'` with a `t('raw.export.highPerformance')` lookup. Leave `derivedLabelHint` available for Phase 3 wiring into the debug panel.

- [x] **Step 3 — Run i18n-sensitive tests**

Run: `pnpm vitest run`
Expected: PASS.

- [x] **Step 4 — Commit**

```bash
git add src/locales/en.json src/locales/zh-CN.json src/lib/export/execution-profile.ts
git commit -m "i18n(raw-export): add highPerformance and derivedLabelHint keys"
```

## Task 20 — Phase 2 verification

No code changes.

- [x] **Step 1 — Lint**: `pnpm lint` — PASS.
- [x] **Step 2 — Tests**: `pnpm test:run` — PASS.
- [x] **Step 3 — Build**: `pnpm build` — PASS.
- [x] **Step 4 — Browser matrix smoke** (vite preview) — PASS:
  - Chromium desktop: telemetry `derivedLabel` matches `desktop-thrN-rsM-...-wkchromium`.
  - Safari desktop: matches `low-memory-thr1-rs256-...-wkwebkit-desktop-safari`.
  - iOS Safari: matches `low-memory-thr1-rs128-...-wkwebkit-mobile`, checkpoint enabled.
  - Trigger a deliberate resource failure on chromium (small OPFS quota or large image) and confirm the retry surfaces `'resource-retry'` copy and re-runs through the bridge.

Browser evidence captured on 2026-05-21:
- Chromium desktop (`Desktop Chrome` descriptor, valid 17-point display LUT): `desktop-thr2-rs512-opfs-file-wkchromium`, `checkpointDurableExpected: true`, resource evacuation OK.
- Playwright WebKit desktop (valid 17-point display LUT): `low-memory-thr1-rs256-blob-handoff-wkwebkit-desktop-safari`, resource evacuation OK. The Playwright WebKit environment did not expose OPFS, so the sink correctly fell back to `blob-handoff`.
- Playwright iPhone WebKit (no LUT; policy-only export smoke): `low-memory-thr1-rs128-blob-handoff-wkwebkit-mobile`, resource evacuation OK. The Playwright WebKit environment did not expose OPFS, so durable checkpointing could not be browser-validated there.
- Chromium resource retry: first full-res export worker was intercepted to emit `FULL_RES_EXPORT_RESOURCE_FAILURE`; the app emitted `retry-scheduled` with `nextRows: 64`, disposed the first worker, then started attempt 2 with a fresh worker.

**Phase 2 complete. Merge and confirm green on `main` before starting Phase 3.**

---

# Phase 3 · Cleanup

Goal: delete the now-dead `EXPORT_EXECUTION_PROFILES` table, the lying `lowMemoryAvailable` field, the redundant `restartWorkerOnResourceRetry` field, and the `boundedHqMaxPixels` field in the plan type. Migrate remaining tests off named-profile fixtures. Spec §6 Phase 3.

## Task 21 — Delete `lowMemoryAvailable`

**Files:**
- Modify: `src/lib/export/execution-profile.ts` (input type for `selectExportExecutionPlan`)
- Modify: `src/modules/raw-processor/services/export-system.ts` (the two call sites that pass `lowMemoryAvailable: true`)

- [x] **Step 1 — Failing assertion**

Add a TypeScript-level check: extending the `selectExportExecutionPlan` input with `lowMemoryAvailable: true` should now be a type error. Manual check is fine — alternatively, add a `// @ts-expect-error` annotation in a test that intentionally passes the dead field and asserts the compiler errors.

- [x] **Step 2 — Delete the field**

Remove `lowMemoryAvailable: boolean` from the `runtime: { ... }` input type. Remove all references in `export-system.ts` and the test fixtures.

- [x] **Step 3 — Run; PASS**

Run: `pnpm vitest run && pnpm lint`
Expected: PASS.

- [x] **Step 4 — Commit**

```bash
git add src/lib/export/execution-profile.ts src/modules/raw-processor/services/export-system.ts
git commit -m "refactor(export): remove dead lowMemoryAvailable parameter"
```

## Task 22 — Delete `EXPORT_EXECUTION_PROFILES` table

**Files:**
- Modify: `src/lib/export/execution-profile.ts` (delete the const)
- Modify: any consumer that imports `EXPORT_EXECUTION_PROFILES`

- [ ] **Step 1 — Grep consumers**

Run: `grep -rn "EXPORT_EXECUTION_PROFILES" src/`
Expected: a small list — the table is used inside `selectExportExecutionPlan` itself (replaced in Phase 2) and possibly in some legacy test fixtures.

- [ ] **Step 2 — Remove imports and the const**

Delete the `EXPORT_EXECUTION_PROFILES` const definition. Any remaining consumer should already be using the derived path; if not, update the consumer to derive from `selectExportExecutionPlan` output.

- [ ] **Step 3 — Keep `ExportExecutionProfileName` type alive (one more phase)**

The `ExportExecutionProfileName` string-union type is still referenced by the checkpoint store record schema and by the legacy `profile` telemetry field. Keep the type alias. Only the **table** (the const) goes.

- [ ] **Step 4 — Run; PASS**

Run: `pnpm vitest run && pnpm lint && pnpm build`
Expected: PASS.

- [ ] **Step 5 — Commit**

```bash
git add src/lib/export/execution-profile.ts
git commit -m "refactor(export): delete EXPORT_EXECUTION_PROFILES table (decision moved to deriveExportPolicy)"
```

## Task 23 — Delete `restartWorkerOnResourceRetry` field

**Files:**
- Modify: `src/lib/export/execution-profile.ts` (the `ExportExecutionProfile` type)
- Modify: any consumer reading `profile.restartWorkerOnResourceRetry`

- [ ] **Step 1 — Grep consumers**

Run: `grep -rn "restartWorkerOnResourceRetry" src/`
Expected: a handful of consumers in `full-res-export-client.ts` and the export-system retry path. With Phase 1's bridges in place, all of them are effectively unconditional (always-true after Phase 2).

- [ ] **Step 2 — Remove the field**

Delete `restartWorkerOnResourceRetry` from the `ExportExecutionProfile` type. Replace each consumer's read with the constant `true` (or simply remove the gate entirely; the bridge handles restart).

- [ ] **Step 3 — Run; PASS**

Run: `pnpm vitest run && pnpm lint && pnpm build`
Expected: PASS.

- [ ] **Step 4 — Commit**

```bash
git add src/lib/export/execution-profile.ts src/lib/export/full-res-export-client.ts \
        src/modules/raw-processor/services/
git commit -m "refactor(export): remove restartWorkerOnResourceRetry field (bridge handles it)"
```

## Task 24 — Replace `boundedHqMaxPixels` field with call to `deriveInteractivePolicy`

**Files:**
- Modify: `src/lib/export/execution-profile.ts` (the `ExportExecutionProfile` type)
- Modify: every consumer reading `plan.profile.boundedHqMaxPixels`

- [ ] **Step 1 — Grep consumers**

Run: `grep -rn "boundedHqMaxPixels" src/`
Expected: the preview pipeline (`preview-pipeline.ts`, the orchestrator's resume path) reads this value.

- [ ] **Step 2 — Replace reads**

Replace each `plan.profile.boundedHqMaxPixels` with `deriveInteractivePolicy(capability).boundedHqMaxPixels`. The capability snapshot is already in scope wherever a plan is in scope.

- [ ] **Step 3 — Remove the field**

Delete `boundedHqMaxPixels: number` from the `ExportExecutionProfile` type. Update the synthesised profile in `selectExportExecutionPlan` to no longer set it.

- [ ] **Step 4 — Run; PASS**

Run: `pnpm vitest run && pnpm lint && pnpm build`
Expected: PASS.

- [ ] **Step 5 — Commit**

```bash
git add src/lib/export/execution-profile.ts src/modules/raw-processor/services/preview-pipeline.ts \
        src/modules/raw-processor/services/export/orchestrate-full-res-export.ts
git commit -m "refactor(preview): read boundedHqMaxPixels from deriveInteractivePolicy"
```

## Task 25 — Migrate tests off named-profile fixtures

**Files:**
- Modify: `src/lib/export/execution-profile.test.ts`
- Modify: `src/lib/export/checkpoint-store.test.ts`
- Modify: `src/lib/export/full-res-export-client.test.ts`
- Modify: `src/modules/raw-processor/__tests__/export-system.test.ts`
- Modify: any other test that asserts on `'ios-safe'` / `'mobile-balanced'` / `'desktop-fast'` literals as decision sources

- [ ] **Step 1 — Grep tests**

Run: `grep -rln "'ios-safe'\\|'mobile-balanced'\\|'desktop-fast'" src/`
Expected: a list of test files (and the legacy mappers inside the checkpoint store and telemetry, which are intentionally retained for back-compat).

- [ ] **Step 2 — Rewrite assertions**

For each test:
- If the test asserts on `plan.profile.name === 'ios-safe'` as a *decision*, replace it with assertions on derived fields (e.g. `plan.runtimeMemoryProfile === 'low-memory'`, `plan.preferredRows <= 128`, `plan.derivedLabel.includes('webkit-mobile')`).
- If the test asserts on a stored `profile` field in a checkpoint record, leave the literal in place (this is the intentional metadata field per §4).

- [ ] **Step 3 — Run the migrated suites**

Run: `pnpm vitest run`
Expected: PASS.

- [ ] **Step 4 — Commit**

```bash
git add src/lib/export src/modules/raw-processor
git commit -m "test(export): migrate assertions from named profiles to derived label/policy"
```

## Task 26 — Phase 3 verification

No code changes.

- [ ] **Step 1 — Lint**: `pnpm lint` — PASS.
- [ ] **Step 2 — Tests**: `pnpm test:run` — PASS.
- [ ] **Step 3 — Build**: `pnpm build` — PASS.
- [ ] **Step 4 — Browser matrix smoke** (vite preview): repeat the Phase 2 matrix and confirm behaviour identical.
- [ ] **Step 5 — Grep audit**: `grep -rn "EXPORT_EXECUTION_PROFILES\\|lowMemoryAvailable\\|restartWorkerOnResourceRetry\\|boundedHqMaxPixels" src/` should return only:
  - the type alias `ExportExecutionProfileName` (intentionally retained),
  - the legacy `profile` field in checkpoint records (intentional metadata),
  - the legacy `profile` field in telemetry payloads (intentional, deprecated for a future phase).
  Any other hit indicates a missed cleanup.

**Phase 3 complete. The capability-driven runtime policy is fully landed.**

---

## Self-Review Notes

**Phase 1 spec coverage.**
- §3 bridge contract: Task 1 (six test scenarios), Task 2 (RAW), Task 4 (Export).
- §6 Phase 1 prerequisite (preview-copy capability after release): Task 7 regression pin.
- §6 Phase 1 memory-peak parity: Task 6 explicit `await rawDecodeBridge.terminate()` before export.
- The pre-existing partial rollout (commits `12a5ea6` + `3f06313` already released desktop-fast preview while keeping checkpoint/retry off) is preserved unchanged in Phase 1; the safety-flag flip happens in Phase 2 Task 14 atomically with the always-on invariants.

**Phase 2 spec coverage.**
- §1 capability vector: Task 9.
- §1.5 runtime resource snapshot: Task 10.
- §2.1 interactive policy: Task 11.
- §2.2 export policy + property tests: Tasks 12, 13.
- §4 checkpoint re-derive on resume: Task 18.
- §5 telemetry + i18n: Tasks 17, 19.
- §6 Phase 2 always-on invariants: Task 14 step 3 (synthesised profile sets both flags to true).

**Phase 3 spec coverage.**
- All §6 Phase 3 bullets: Tasks 21–25.

**Placeholders.** Three tasks (Task 5 step 2, Task 16 step 1, Task 18 step 1) contain `expect(true).toBe(false)` placeholder bodies because they need to harmonise with the existing 600+ line orchestrator / 315-line export-system fixture style. Each task documents that explicitly and points at the established pattern in the same test directory. Filling them in is part of the task execution, not a separate plan step.

**Type consistency.** The `ExportPolicy` shape defined in Task 12 is consumed by Tasks 14, 17, 18; the `CapabilityVector` from Task 9 is consumed by Tasks 11, 12, 14, 15, 16, 18; the `ExportRuntimeResources` from Task 10 is consumed by Tasks 12, 14, 16, 18. Field names match across tasks: `workerMemoryProfile`, `rowSlice`, `concurrency`, `maxConcurrency`, `persistEveryNRows`, `outputSink`, `productCopy`, `derivedLabel`. The `previewWorkerMemoryProfile` field on `InteractivePolicy` is named distinctly from the `workerMemoryProfile` field on `ExportPolicy` to keep the two domains separate.

**Dependencies.** `fast-check` is the only potentially new dev dependency, added conditionally in Task 13 step 1. No production dependencies change.

**Reversibility.** Each phase is a single tight stack of commits. Reverting any phase is `git revert <range>` on its commits without touching the others' files (the file boundaries are clean: `src/lib/workers/*` for Phase 1, `src/lib/runtime/*` and the delegate refactor for Phase 2, the deletions for Phase 3). No runtime feature flag exists per spec.
