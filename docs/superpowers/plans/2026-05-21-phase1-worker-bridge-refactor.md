# Phase 1 · Worker Bridge Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a squoosh-style worker bridge that wraps the RAW decode runtime and the full-resolution export worker, propagating `AbortSignal`, serialising calls, and auto-terminating on idle, while preserving today's export decision behaviour bit-for-bit.

**Architecture:** A small generic `WorkerBridge` base in `src/lib/workers/worker-bridge.ts` owns three primitives — a serial promise chain with explicit rejection recovery (`_queue = _queue.catch(() => undefined).then(run)`), an `AbortSignal`-driven `terminate()` path, and an idle timer. Two thin subclasses (`RawDecodeBridge`, `ExportBridge`) wire the existing RAW adapter and the existing `FullResolutionExportClient` into that primitive. `ExportBridge.runExport` synchronously awaits `rawDecodeBridge.terminate()` as its first step to preserve today's pre-export memory-peak shape. No safety-invariant changes in this phase: `restartWorkerOnResourceRetry` and `checkpointOutput` keep their current per-profile values; the named profile table is untouched. Phase 1 is strictly behaviour-equivalent.

**Tech Stack:** TypeScript, Vitest, Web Workers, AbortSignal, existing `@lumaforge/luma-raw-runtime` and `src/lib/export/full-res-export-client.ts`.

**Spec:** `docs/superpowers/specs/2026-05-21-capability-driven-runtime-policy-design.md` (sections 3, 6 Phase 1, 8).

---

## File Structure

**New files:**
- `src/lib/workers/worker-bridge.ts` — generic bridge primitive (~120 lines)
- `src/lib/workers/worker-bridge.test.ts` — unit tests for the 6 §3 scenarios
- `src/lib/workers/raw-decode-bridge.ts` — wraps RAW runtime singleton + decode methods
- `src/lib/workers/raw-decode-bridge.test.ts`
- `src/lib/workers/export-bridge.ts` — wraps `FullResolutionExportClient`
- `src/lib/workers/export-bridge.test.ts`

**Modified files:**
- `src/lib/raw/luma-runtime-adapter.ts` — delegate singleton/terminate lifecycle to `RawDecodeBridge`; keep existing public API
- `src/lib/export/full-res-export-client.ts` — keep the class; bridge wraps it
- `src/modules/raw-processor/services/export/orchestrate-full-res-export.ts` — replace direct `FullResolutionExportClient` instantiation with `ExportBridge`; first step of `runExport` awaits `rawDecodeBridge.terminate()`
- `src/modules/raw-processor/__tests__/orchestrate-full-res-export-bridge.test.ts` — new regression test for the existing preview-copy capability path

**Out of scope for Phase 1:**
- Capability vector / derive functions (Phase 2)
- Always-on checkpoint / always-on retry (Phase 2)
- OPFS atomic-output contract (Phase 2)
- Named-profile cleanup (Phase 3)
- `fidelity` → `performancePreference` rename (Phase 2)

---

## Task 1 — Generic `WorkerBridge` primitive

**Files:**
- Create: `src/lib/workers/worker-bridge.ts`
- Test: `src/lib/workers/worker-bridge.test.ts`

- [ ] **Step 1 — Write the first failing test (queue ordering)**

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
    const terminate = vi.fn()
    return { api, terminate }
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

- [ ] **Step 2 — Run the test to verify it fails**

Run: `pnpm vitest run src/lib/workers/worker-bridge.test.ts`
Expected: FAIL with `Cannot find module './worker-bridge'`.

- [ ] **Step 3 — Implement the minimal bridge**

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

- [ ] **Step 4 — Run the queue-ordering test to verify it passes**

Run: `pnpm vitest run src/lib/workers/worker-bridge.test.ts`
Expected: PASS.

- [ ] **Step 5 — Add the rejection-recovery test**

Append to `src/lib/workers/worker-bridge.test.ts`:

```ts
  it('keeps running queued calls after a rejected call', async () => {
    const startWorker = vi.fn(() => {
      let n = 0
      return {
        api: {
          echo: async (value: number) => {
            n += 1
            if (n === 1) throw new Error('boom')
            return value
          },
        },
        terminate: vi.fn(),
      }
    })
    const bridge = new WorkerBridge<FakeApi>({ startWorker, idleMs: 10_000 })
    const signal = new AbortController().signal
    await expect(bridge.call('echo', signal, 1)).rejects.toThrow('boom')
    await expect(bridge.call('echo', signal, 2)).resolves.toBe(2)
  })
```

Run: `pnpm vitest run src/lib/workers/worker-bridge.test.ts`
Expected: PASS (the `_queue.catch(() => undefined)` chain already handles this).

- [ ] **Step 6 — Add abort-while-queued test**

Append:

```ts
  it('does not spawn a worker when a queued call is aborted before its turn', async () => {
    const { bridge, startWorker } = createFakeBridge()
    const controllerA = new AbortController()
    const controllerB = new AbortController()
    let releaseA: (() => void) | null = null
    const blockingStart = vi.fn(async () => {
      const api: FakeApi = {
        echo: async (value: number) => {
          await new Promise<void>((resolve) => {
            releaseA = resolve
          })
          return value
        },
      }
      return { api, terminate: vi.fn() }
    })
    const blockingBridge = new WorkerBridge<FakeApi>({ startWorker: blockingStart })
    const aPromise = blockingBridge.call('echo', controllerA.signal, 1)
    const bPromise = blockingBridge.call('echo', controllerB.signal, 2)
    controllerB.abort()
    releaseA?.()
    await aPromise
    await expect(bPromise).rejects.toThrow(/aborted/i)
    expect(blockingStart).toHaveBeenCalledTimes(1)
    void startWorker
    void bridge
  })
```

Run: `pnpm vitest run src/lib/workers/worker-bridge.test.ts`
Expected: PASS.

- [ ] **Step 7 — Add abort-during-active-call test**

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
    const controller = new AbortController()
    const callPromise = bridge.call('echo', controller.signal, 1)
    await Promise.resolve()
    controller.abort()
    resolveCall?.(1)
    await callPromise.catch(() => undefined)
    expect(terminate).toHaveBeenCalledTimes(1)
  })
```

Run: `pnpm vitest run src/lib/workers/worker-bridge.test.ts`
Expected: PASS.

- [ ] **Step 8 — Add idle-terminate-after-success and after-failure tests**

Append:

```ts
  it('terminates the worker after the idle window when calls succeed', async () => {
    vi.useFakeTimers()
    try {
      const terminate = vi.fn()
      const startWorker = vi.fn(() => ({
        api: { echo: async (value: number) => value } as FakeApi,
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

  it('terminates the worker after the idle window when calls fail', async () => {
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
      await bridge
        .call('echo', new AbortController().signal, 1)
        .catch(() => undefined)
      vi.advanceTimersByTime(100)
      await Promise.resolve()
      expect(terminate).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('cancels the idle timer when a new call arrives in the window', async () => {
    vi.useFakeTimers()
    try {
      const terminate = vi.fn()
      const startWorker = vi.fn(() => ({
        api: { echo: async (value: number) => value } as FakeApi,
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

Run: `pnpm vitest run src/lib/workers/worker-bridge.test.ts`
Expected: ALL PASS.

- [ ] **Step 9 — Commit**

```bash
git add src/lib/workers/worker-bridge.ts src/lib/workers/worker-bridge.test.ts
git commit -m "feat(workers): add generic WorkerBridge with serial queue and idle terminate"
```

---

## Task 2 — `RawDecodeBridge` wrapping the RAW runtime singleton

**Files:**
- Read: `src/lib/raw/luma-runtime-adapter.ts:51-77` (current singleton lifecycle)
- Create: `src/lib/workers/raw-decode-bridge.ts`
- Test: `src/lib/workers/raw-decode-bridge.test.ts`

- [ ] **Step 1 — Write a failing test that the bridge lazy-creates a runtime exactly once across two concurrent decode calls**

```ts
// src/lib/workers/raw-decode-bridge.test.ts
import type { LumaRawRuntime } from '@lumaforge/luma-raw-runtime'
import { describe, expect, it, vi } from 'vitest'

import { RawDecodeBridge } from './raw-decode-bridge'

function fakeRuntime(): LumaRawRuntime {
  const dispose = vi.fn(async () => undefined)
  return {
    dispose,
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
})
```

- [ ] **Step 2 — Run the test to verify it fails**

Run: `pnpm vitest run src/lib/workers/raw-decode-bridge.test.ts`
Expected: FAIL with `Cannot find module './raw-decode-bridge'`.

- [ ] **Step 3 — Implement `RawDecodeBridge`**

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
        return {
          api,
          terminate: () => runtime.dispose(),
        }
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

> Note: if the real `LumaRawRuntime` method names diverge from those used above (verify against `packages/luma-raw-runtime/src/types.ts`), update the `RuntimeApi` map and the public methods. Keep the public method names (`decodeEmbedded`, `decodeQuick`, etc.) since they match the spec's §3 contract.

- [ ] **Step 4 — Run the lazy-create test to verify it passes**

Run: `pnpm vitest run src/lib/workers/raw-decode-bridge.test.ts`
Expected: PASS.

- [ ] **Step 5 — Add a test that `terminate()` disposes the runtime and the next call re-creates it**

Append to the test file:

```ts
  it('re-creates the runtime after terminate() is called', async () => {
    const factory = vi.fn(fakeRuntime)
    const bridge = new RawDecodeBridge({ runtimeFactory: factory })
    const signal = new AbortController().signal
    await bridge.decodeEmbedded(signal, new File([], 'a.dng'))
    await bridge.terminate()
    await bridge.decodeEmbedded(signal, new File([], 'a.dng'))
    expect(factory).toHaveBeenCalledTimes(2)
  })
```

Run: `pnpm vitest run src/lib/workers/raw-decode-bridge.test.ts`
Expected: PASS.

- [ ] **Step 6 — Commit**

```bash
git add src/lib/workers/raw-decode-bridge.ts src/lib/workers/raw-decode-bridge.test.ts
git commit -m "feat(workers): add RawDecodeBridge wrapping LumaRawRuntime"
```

---

## Task 3 — Migrate `luma-runtime-adapter.ts` to delegate to `RawDecodeBridge`

**Files:**
- Modify: `src/lib/raw/luma-runtime-adapter.ts` (lines 28-77 own the singleton lifecycle; the public API surface — exported functions consumed by `runtime-adapter.ts` and elsewhere — must stay byte-equivalent)
- Add: `src/lib/raw/__tests__/luma-runtime-adapter-bridge.test.ts`

- [ ] **Step 1 — Read the current public surface**

Open `src/lib/raw/luma-runtime-adapter.ts` and list every `export`. The adapter currently exports `RawAdapterError`, `RawAdapterErrorCode`, `PrewarmState`, `PrewarmOutcome`, plus the decoding/prewarm functions. The migration MUST NOT change these names or signatures.

- [ ] **Step 2 — Add a failing test pinning behaviour-equivalence: `decodeQuickPreview` still returns the same shape**

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

(If the existing adapter test file already has analogous coverage at the public API, reuse it; otherwise the file above is a fresh pin.)

- [ ] **Step 3 — Run the test; it likely passes today (the adapter already accepts a `runtimeFactory`). If it does, the test is a regression pin for the migration.**

Run: `pnpm vitest run src/lib/raw/__tests__/luma-runtime-adapter-bridge.test.ts`
Expected: PASS (or FAIL if the signature has drifted — fix the test to match real signatures before continuing).

- [ ] **Step 4 — Replace the singleton block with `RawDecodeBridge`**

In `src/lib/raw/luma-runtime-adapter.ts`, replace the singleton variables (`singletonRuntime`, `singletonRuntimePromise`) and the `getRuntime()` function with a module-level `RawDecodeBridge`. Every existing call site that previously did `runtime.decodeQuickPreview(...)` now goes through `bridge.decodeQuick(signal, ...)`, where `signal` is taken from the caller (existing functions already accept callbacks; add an optional `signal?: AbortSignal` parameter with a default `new AbortController().signal`). Keep all exported symbols the same.

```ts
// Sketch — fill in around the existing exports
import { RawDecodeBridge } from '~/lib/workers/raw-decode-bridge'

const singletonBridge = new RawDecodeBridge({
  runtimeFactory: async () => {
    const { createLumaRawRuntime } = await import('@lumaforge/luma-raw-runtime')
    return createLumaRawRuntime({ requireCrossOriginIsolation: true })
  },
})

// Replace getRuntime() consumers, e.g.:
// const runtime = await getRuntime(runtimeFactory)
// const frame = await runtime.decodeQuickPreview(input)
// becomes:
// const frame = await singletonBridge.decodeQuick(signal ?? defaultSignal, input)
```

Preserve the `prewarmState` / `prewarmOutcome` / `prewarmInFlight` module-level state exactly — only the *runtime acquisition* moves into the bridge.

- [ ] **Step 5 — Run the full adapter test suite**

Run: `pnpm vitest run src/lib/raw/luma-runtime-adapter`
Expected: PASS (all existing tests stay green). If any test references `singletonRuntime` directly via the module's internal state, update it to assert via the public API instead.

- [ ] **Step 6 — Run lint and typecheck**

Run: `pnpm lint`
Expected: PASS.

- [ ] **Step 7 — Commit**

```bash
git add src/lib/raw/luma-runtime-adapter.ts src/lib/raw/__tests__/luma-runtime-adapter-bridge.test.ts
git commit -m "refactor(raw-adapter): delegate runtime lifecycle to RawDecodeBridge"
```

---

## Task 4 — `ExportBridge` wrapping `FullResolutionExportClient`

**Files:**
- Read: `src/lib/export/full-res-export-client.ts` for the public class shape and the `start` / `cancel` / worker `terminate` calls (lines 199, 270, 279, 323, 334).
- Create: `src/lib/workers/export-bridge.ts`
- Test: `src/lib/workers/export-bridge.test.ts`

- [ ] **Step 1 — Write a failing test that `ExportBridge.runExport` runs through a stub client and resolves with its result**

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
})
```

- [ ] **Step 2 — Run the test; it fails (module missing)**

Run: `pnpm vitest run src/lib/workers/export-bridge.test.ts`
Expected: FAIL.

- [ ] **Step 3 — Implement `ExportBridge`**

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
  private _activeClient: ExportClient | null = null

  constructor(options: ExportBridgeOptions) {
    this._bridge = new WorkerBridge<ClientApi>({
      idleMs: options.idleMs,
      startWorker: () => {
        const client = options.createClient()
        this._activeClient = client
        return {
          api: { start: client.start.bind(client) },
          terminate: () => {
            try {
              client.cancel()
            } finally {
              this._activeClient = null
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
    this._activeClient?.cancel()
  }

  terminate() {
    return this._bridge.terminate()
  }
}
```

(Replace `unknown` with the actual `FullResExportWorkerStartMessage`-derived input type in the next task once integrated.)

- [ ] **Step 4 — Run the test to verify it passes**

Run: `pnpm vitest run src/lib/workers/export-bridge.test.ts`
Expected: PASS.

- [ ] **Step 5 — Add an abort propagation test**

Append:

```ts
  it('aborting the signal terminates the underlying client', async () => {
    const client = fakeClient(new Promise(() => undefined))
    const bridge = new ExportBridge({ createClient: () => client as never })
    const controller = new AbortController()
    const callPromise = bridge.runExport(controller.signal, { file: new File([], 'a.dng') })
    await Promise.resolve()
    controller.abort()
    await callPromise.catch(() => undefined)
    expect(client.cancel).toHaveBeenCalledTimes(1)
    expect(client.dispose).toHaveBeenCalledTimes(1)
  })
```

Run: `pnpm vitest run src/lib/workers/export-bridge.test.ts`
Expected: PASS.

- [ ] **Step 6 — Commit**

```bash
git add src/lib/workers/export-bridge.ts src/lib/workers/export-bridge.test.ts
git commit -m "feat(workers): add ExportBridge wrapping FullResolutionExportClient"
```

---

## Task 5 — Wire `ExportBridge` into the export orchestration

**Files:**
- Modify: `src/modules/raw-processor/services/export/orchestrate-full-res-export.ts` (replace direct `new FullResolutionExportClient(...)` with `ExportBridge`; the public function signature does not change)
- Modify: `src/lib/export/full-res-export-client.ts` only if the class needs a thin adapter so it implements the `ExportClient` shape used by the bridge (`start` / `cancel` / `dispose`). If those methods exist with different names today, add adapter methods OR update the bridge type definition to match.
- Test: existing tests under `src/modules/raw-processor/__tests__/` and `src/lib/export/full-res-export-client.test.ts`

- [ ] **Step 1 — Read the current orchestrator instantiation site**

Open `src/modules/raw-processor/services/export/orchestrate-full-res-export.ts` and locate where `FullResolutionExportClient` is created. Note any `terminate()` / disposal calls — the bridge subsumes them.

- [ ] **Step 2 — Add a regression test pinning end-to-end behaviour with the bridge (no abort path)**

```ts
// src/modules/raw-processor/__tests__/orchestrate-full-res-export-bridge.test.ts
import { describe, expect, it, vi } from 'vitest'

import { orchestrateFullResolutionExport } from '~/modules/raw-processor/services/export/orchestrate-full-res-export'

describe('orchestrateFullResolutionExport (bridge wiring)', () => {
  it('completes an export through the bridge and surfaces the blob result', async () => {
    // Fill in: construct the smallest realistic input that exercises the bridge path.
    // Mock the client factory the orchestrator uses to return a stub client whose
    // start() resolves with a known blob result. Assert the orchestrator returns
    // a structurally-equivalent ExportResult and that the preview-copy capability
    // path is unaffected.
    expect(true).toBe(true) // placeholder — fill in with real mocks during implementation
  })
})
```

> Implementation note: this test stub is intentionally light because the real `orchestrateFullResolutionExport` function has many dependencies (the orchestrator is 613 lines). When you fill it in, look at the existing nearby tests in `src/modules/raw-processor/__tests__/` for the established mocking pattern, and reuse those builders rather than reinventing them.

- [ ] **Step 3 — Replace the direct client construction with the bridge**

In `orchestrate-full-res-export.ts`, replace the line that constructs `new FullResolutionExportClient(...)` with construction of an `ExportBridge`. The orchestrator function's call site that previously did `await client.start(input)` becomes `await bridge.runExport(signal, input)`. Any explicit `client.terminate()` calls at the end of the orchestration are removed — the bridge's idle timer handles it (or `bridge.terminate()` is called explicitly on the orchestrator's existing cleanup path if one exists).

- [ ] **Step 4 — Ensure `FullResolutionExportClient` implements the `ExportClient` interface the bridge expects**

If the class today has `terminate()` rather than `dispose()`, add a `dispose()` method that delegates to `terminate()`. Do not rename existing methods. Keep the public class API stable.

- [ ] **Step 5 — Run the full export test suite**

Run: `pnpm vitest run src/lib/export src/modules/raw-processor/services/export src/modules/raw-processor/__tests__/orchestrate-full-res-export-bridge.test.ts`
Expected: PASS.

- [ ] **Step 6 — Commit**

```bash
git add src/modules/raw-processor/services/export/orchestrate-full-res-export.ts \
        src/lib/export/full-res-export-client.ts \
        src/modules/raw-processor/__tests__/orchestrate-full-res-export-bridge.test.ts
git commit -m "refactor(raw-export): orchestrate full-res export through ExportBridge"
```

---

## Task 6 — Pre-export `rawDecodeBridge.terminate()` for memory-peak parity

**Files:**
- Modify: `src/modules/raw-processor/services/export/orchestrate-full-res-export.ts`
- Test: `src/modules/raw-processor/__tests__/orchestrate-full-res-export-bridge.test.ts`

This task preserves today's pre-export memory shape. Without it, the export bridge could spawn its worker while the decode bridge's 10-second idle timer is still keeping the RAW runtime alive — both heavy resources would coexist briefly. Spec §6 Phase 1.

- [ ] **Step 1 — Add a failing test asserting the decode bridge is terminated before export starts**

```ts
  it('terminates the RAW decode bridge before starting the export', async () => {
    const decodeTerminate = vi.fn()
    const startOrder: string[] = []

    // Inject test doubles for both bridges via the orchestrator's existing
    // dependency-injection seam (or via the module's exported test hook).
    // The fake export client's start() pushes 'export' to startOrder.
    // The fake decode bridge's terminate() pushes 'decode-terminate'.
    // Assert: startOrder === ['decode-terminate', 'export'].

    expect(startOrder).toEqual(['decode-terminate', 'export'])
    expect(decodeTerminate).toHaveBeenCalledTimes(1)
  })
```

> If the orchestrator does not currently expose a DI seam for the decode bridge, add a minimal one (an optional `decodeBridge` parameter that defaults to the module-level singleton). Do not refactor wider.

- [ ] **Step 2 — Run the test to verify it fails**

Run: `pnpm vitest run src/modules/raw-processor/__tests__/orchestrate-full-res-export-bridge.test.ts`
Expected: FAIL.

- [ ] **Step 3 — Wire the awaited terminate**

Edit `orchestrate-full-res-export.ts` so the first step of the export run (immediately after argument validation, before any bridge call to `runExport`) is:

```ts
await decodeBridge.terminate()
```

Add the optional `decodeBridge` parameter to the orchestrator's options if not already present. Use the module-level singleton from `luma-runtime-adapter.ts` as the default.

- [ ] **Step 4 — Run the test to verify it passes**

Run: `pnpm vitest run src/modules/raw-processor/__tests__/orchestrate-full-res-export-bridge.test.ts`
Expected: PASS.

- [ ] **Step 5 — Run the wider export suite to confirm nothing regressed**

Run: `pnpm vitest run src/lib/export src/modules/raw-processor`
Expected: PASS.

- [ ] **Step 6 — Commit**

```bash
git add src/modules/raw-processor/services/export/orchestrate-full-res-export.ts \
        src/modules/raw-processor/__tests__/orchestrate-full-res-export-bridge.test.ts
git commit -m "fix(raw-export): terminate decode bridge before export to preserve memory shape"
```

---

## Task 7 — Regression test: preview-copy capability path

**Files:**
- Test only: `src/modules/raw-processor/__tests__/orchestrate-full-res-export-bridge.test.ts`

Spec §6 Phase 1 mandates this test even after the existing `12a5ea6`/`3f06313` fix. The invariant: any code path that sets `copyCapability.previewSize.available = true` must have a reachable canvas source (either the captured `previewCopyCanvas` or the live pipeline).

- [ ] **Step 1 — Add a failing assertion**

```ts
  it('does not advertise preview-size copy when no canvas was captured and the pipeline was released', async () => {
    // Construct an orchestrator run where:
    //  - the export plan releases the preview pipeline (today: ios-safe, mobile-balanced, desktop-fast all do)
    //  - the pipeline's renderToHiddenCanvas() throws or returns null (simulating WebGL failure)
    //  - the browser nominally supports PNG clipboard fallback
    // Assert the returned ExportResult's copyCapability.previewSize.available === false
    // OR copyCapability.mode !== 'preview-size'.
    expect(true).toBe(false) // placeholder
  })
```

- [ ] **Step 2 — Verify it fails on the current code if preview-size remains advertised**

Run: `pnpm vitest run src/modules/raw-processor/__tests__/orchestrate-full-res-export-bridge.test.ts`
Expected: FAIL (if the existing code already downgrades correctly per commit `3f06313`, this step instead PASSES and the assertion becomes a regression pin — proceed to step 4).

- [ ] **Step 3 — If the test failed, fix the orchestrator**

Locate the block in `orchestrate-full-res-export.ts` near line 332 (`copyCapability = resolveExportCopyCapability()`). Ensure that when `previewCopyCanvas` is null after the try/catch around `renderToHiddenCanvas`, `copyCapability` is downgraded to `{ mode: 'full-size', previewSize: { available: false } }` (use the existing shape — read the surrounding code for the exact type).

- [ ] **Step 4 — Run the test to confirm it now passes (and is a regression pin)**

Run: `pnpm vitest run src/modules/raw-processor/__tests__/orchestrate-full-res-export-bridge.test.ts`
Expected: PASS.

- [ ] **Step 5 — Commit**

```bash
git add src/modules/raw-processor/__tests__/orchestrate-full-res-export-bridge.test.ts \
        src/modules/raw-processor/services/export/orchestrate-full-res-export.ts
git commit -m "test(raw-export): pin preview-size copy capability after preview release"
```

---

## Task 8 — Behaviour-equivalence verification

No code changes. Goal: confirm Phase 1 left every observable behaviour identical.

- [ ] **Step 1 — Full lint**

Run: `pnpm lint`
Expected: PASS.

- [ ] **Step 2 — Full test suite**

Run: `pnpm test:run`
Expected: PASS. If any test fails that is not one of the new bridge tests, treat it as a regression and fix before continuing.

- [ ] **Step 3 — Build**

Run: `pnpm build`
Expected: PASS.

- [ ] **Step 4 — Browser smoke (manual)**

Following the user's project convention in memory (`feedback_consistency_reference.md` + `project_raw_browser_validation.md`):
- Run `pnpm build && pnpm preview` (vite preview, not dev — per the user's memory).
- Open the preview URL.
- Upload a RAW file via the Dropzone.
- Confirm the embedded/quick/HQ preview stages render exactly as on `main` before this branch.
- Apply a LUT.
- Run an export at default settings.
- After export completes, confirm the preview restores and Copy actions are reachable.

If any visible difference exists vs `main`, capture it (screenshot + console log) and investigate before claiming Phase 1 complete.

- [ ] **Step 5 — No commit** (this task is verification only)

---

## Self-Review Notes

- All §3 verification bullets from the spec are covered by Task 1's six bridge tests.
- §6 Phase 1 prerequisites are covered: Task 6 preserves the pre-export memory-peak shape; Task 7 pins the preview-copy capability regression; the working-tree partial rollout was already addressed by commits `12a5ea6` and `3f06313` before this plan was written, so the "(a) revert vs (b) stack" decision is moot — the codebase is in a consistent state and this plan does not touch the per-profile safety flags.
- The Phase 1 boundary is strict: no profile field is added or removed, no safety invariant is changed, no derive function is introduced. Those land in Phase 2.
- Two tasks (5, 7) contain placeholder test bodies because they need to harmonise with the existing 613-line orchestrator's test fixtures. The plan documents that explicitly and points at the established pattern in `src/modules/raw-processor/__tests__/`. This is intentional under-specification — over-specifying would invent a fixture style that diverges from the rest of the suite.
