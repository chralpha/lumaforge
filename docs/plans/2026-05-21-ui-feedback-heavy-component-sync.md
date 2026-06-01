# /raw Onboarding Paint Boundary + Prewarm Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the high-value subset of the spec — make the `/raw` upload entry feel "received" before any heavy work starts, distinguish cold-start ("warming the engine") from regular loading, give orchestrators a non-UI channel to observe prewarm outcome, and migrate the two remaining off-DOM file pickers that the predecessor shipped Dropzone work did not cover.

**Architecture:** Four phases in dependency order:
1. **Prewarm API upgrade** — `rawRuntimeAdapter.prewarm()` returns a structured outcome, the adapter additionally exposes `getPrewarmState()`. UI silence is preserved (no toast/overlay flips); orchestrator and capability gate get a non-UI observable.
2. **Warming phase** — `'warming'` is added to `ProcessingStatus`, `ProgressOverlay` gets distinct phase copy in both locales.
3. **orchestrateRawLoad refactor** — visible status mutation lands first, then we `await yieldToPaint()` before any cleanup / WASM init / worker spawn. The orchestrator consults `getPrewarmState()` to choose `'warming'` vs `'loading'`. An ordering test pins the contract.
4. **Off-DOM file picker migration** — extract a tiny hidden-file-picker hook and migrate `handleReplaceFile` + `handleRecoveryFileSelect` in `RawProcessorView`, eliminating the remaining WebKit-flaky `document.createElement('input')` paths.

**Deliberately deferred (per Codex review + user direction):** capability-gate prewarm-fault escalation, JPEG/WebGL prewarm, ack-visual choreography (halo etc.), storage-fault UI taxonomy, cross-layer-OR lint enforcement. These remain in the spec but do not ship in this plan; each is called out where it would have lived.

**Tech Stack:** React 19, TypeScript, Vitest + Testing Library, Jotai atoms, motion/react. No new dependencies.

**Spec:** `docs/specs/2026-05-21-ui-feedback-heavy-component-sync-design.md`

**Verification per phase:** `pnpm lint`, `pnpm test:run` (focused on touched files), plus `pnpm build` at the end. Browser smoke (`pnpm serve` + manual upload on `/raw`) at the very end since per project memory headless RAW decode is blocked.

---

## Key API / Codebase Facts (read before starting)

- **`rawRuntimeAdapter`** (`src/lib/raw/runtime-adapter.ts`): singleton built via `createRawRuntimeAdapter()`. Today exposes `prewarm(): Promise<void>` + `openSession` / `decodeQuickRaw` / `decodeBoundedHqRaw` / `extractEmbeddedPreview`. Delegates to functions in `src/lib/raw/luma-runtime-adapter.ts`.
- **`luma-runtime-adapter.ts`** holds the module-level singletons `singletonRuntime` and `singletonRuntimePromise`, plus `RawAdapterError` and a `disposeLumaRawRuntime()` reset used by tests. `prewarmLumaRawRuntime` currently catches all errors silently and returns `Promise<void>`. The error code `'RAW_CROSS_ORIGIN_ISOLATION_REQUIRED'` is the canonical irrecoverable runtime fault.
- **`ProcessingStatus`** (`src/atoms/raw-processor.ts:16`) is the user-intent-lifetime status. Today: `'idle' | 'loading' | 'decoding' | 'processing' | 'exporting' | 'ready' | 'error'`. Reachable via `useProcessingStatusValue` / `useSetProcessingStatus`.
- **`useRawProcessor`** (`src/modules/raw-processor/hooks/useRawProcessor.ts`) derives `isProcessing` from the top-level status at the hook seam. The derived expression is currently `status === 'loading' || status === 'decoding' || status === 'processing' || status === 'exporting'` inside `RawProcessorView`; in this plan it stays in `RawProcessorView` for now (single derive site at the seam) and just gains `'warming'`.
- **`orchestrateRawLoad`** (`src/modules/raw-processor/services/raw/orchestrate-raw-load.ts`) is the load orchestrator. It currently runs synchronous cleanup (`abortRuntimeWork`, `revokeCurrentEmbeddedPreviewUrl`, `replaceFile`, ref nulling, atom resets) and *then* calls `setStatus('loading')` before `await rawRuntimeAdapter.openSession`. We will reorder so `setStatus(initialPhase)` lands first, then `await yieldToPaint()`, then the rest.
- **`yieldToPaint`** is **new**; added to `src/lib/dom.ts` next to the existing callback-style `nextFrame`. Promise-form helper that resolves on the next animation frame (single-rAF is the minimum per spec §2; the helper uses single-rAF for predictability — orchestrator tests can pin the boundary).
- **`ProgressOverlay`** (`src/modules/raw-processor/components/ProgressOverlay.tsx:34-39`) maps the `phase` prop to a label via `phaseLabels: Record<phase, string>`. We add `warming` to this map.
- **i18n strings** live in `src/locales/zh-CN.json` and `src/locales/en.json`. `raw.progress.*` keys are present (`loading`, `decoding`, `processing`, `exporting`, `workerOne`, `workerMany`, `safeExport`, `fastExport`, `strip`). We add `raw.progress.warming`.
- **Off-DOM file pickers still in `RawProcessorView`**: `handleReplaceFile` (`src/modules/raw-processor/RawProcessorView.tsx:170-181`) and `handleRecoveryFileSelect` (`src/modules/raw-processor/RawProcessorView.tsx:183-195`). Both build a `document.createElement('input')`, set `accept`, attach `onchange`, and `click()`. Same WebKit failure mode as the predecessor empty-stage Dropzone bug.
- **Test mocks for `rawRuntimeAdapter`** (`src/modules/raw-processor/hooks/useRawProcessor.test.tsx:31-69`): `vi.hoisted` object passed to `vi.mock('~/lib/raw/runtime-adapter')`. We extend it to include `prewarm` + `getPrewarmState` mocks. The adapter unit test (`src/lib/raw/runtime-adapter.test.ts`) constructs adapters via `createRawRuntimeAdapter({ lumaRuntimeFactory })`.
- **Commit signing**: SSH signing hangs headless; per memory `git commit --no-gpg-sign` is authorized for this loop. Use it in every commit step.

## File Structure

**Create:**
- `src/modules/raw-processor/hooks/useHiddenFilePicker.ts` — Phase 4. Single-responsibility hook: render-prop + ref-based hidden `<input type="file">`. Reused by replace and recovery sites.

**Modify:**
- `src/lib/raw/luma-runtime-adapter.ts` — Phase 1. Add `PrewarmState` / `PrewarmOutcome` types, module-level prewarm state machine, updated `prewarmLumaRawRuntime`, new `getPrewarmStateForLuma`, extend `disposeLumaRawRuntime` to reset state.
- `src/lib/raw/runtime-adapter.ts` — Phase 1. Re-export types, extend `RawRuntimeAdapter` shape with `prewarm: () => Promise<PrewarmOutcome>` and `getPrewarmState: () => PrewarmState`.
- `src/lib/raw/runtime-adapter.test.ts` — Phase 1. New tests for outcome shape + state transitions; reset prewarm state per test.
- `src/lib/dom.ts` — Phase 3. Add Promise-style `yieldToPaint()` next to `nextFrame`.
- `src/atoms/raw-processor.ts` — Phase 2. Add `'warming'` variant.
- `src/locales/zh-CN.json` + `src/locales/en.json` — Phase 2. Add `raw.progress.warming` key.
- `src/modules/raw-processor/components/ProgressOverlay.tsx` — Phase 2. Extend `phase` prop union + `phaseLabels` map.
- `src/modules/raw-processor/RawProcessorView.tsx` — Phases 2 & 4. Extend `isProcessing` derive to include `'warming'`; map `phase` for ProgressOverlay; migrate the two off-DOM file pickers to `useHiddenFilePicker`.
- `src/modules/raw-processor/services/raw/orchestrate-raw-load.ts` — Phase 3. Reorder: `setStatus(initial)` → `await ctx.services.yieldToPaint()` → cleanup + heavy. Branch initial phase from `rawRuntimeAdapter.getPrewarmState()` injected via ctx.
- `src/modules/raw-processor/hooks/useRawProcessor.ts` — Phase 3. Inject `yieldToPaint` and `getPrewarmState` into the `rawLoadCtx`.
- `src/modules/raw-processor/hooks/useRawProcessor.test.tsx` — Phase 3. Extend `rawRuntimeAdapterMock` with `prewarm` + `getPrewarmState`; add ordering test.

**Out of plan scope (deferred, do not touch):**
- `src/modules/raw-processor/hooks/useCapabilityGate.ts` — escalation is in the spec but deferred per Codex.
- JPEG / WebGL prewarm — explicitly out of spec scope.

---

## Phase 1 — Prewarm API upgrade (luma + adapter)

### Task 1: Add PrewarmState / PrewarmOutcome types in `luma-runtime-adapter.ts`

**Files:**
- Modify: `src/lib/raw/luma-runtime-adapter.ts`

- [ ] **Step 1 — Add the types and module-level state machine.** Insert the following right above `let singletonRuntime: LumaRawRuntime | null = null` (around line 20):

```ts
export type PrewarmState = 'idle' | 'pending' | 'ready' | 'failed'

export interface PrewarmOutcome {
  status: 'ready' | 'failed'
  reason?: string
  recoverable?: boolean
}

let prewarmState: PrewarmState = 'idle'
let prewarmOutcome: PrewarmOutcome | null = null
```

- [ ] **Step 2 — Add a recoverability classifier.** Append this helper right above `export async function extractEmbeddedPreviewWithLuma` (the function that follows the current `prewarmLumaRawRuntime`):

```ts
function classifyPrewarmFailure(error: unknown): {
  reason: string
  recoverable: boolean
} {
  const code = getRawErrorCode(error)
  if (code === 'RAW_CROSS_ORIGIN_ISOLATION_REQUIRED') {
    return {
      reason: error instanceof Error ? error.message : code,
      recoverable: false,
    }
  }
  const reason =
    error instanceof Error ? error.message : 'RAW runtime prewarm failed.'
  return { reason, recoverable: true }
}
```

- [ ] **Step 3 — Commit.** No tests yet; we'll co-commit the implementation in the next task.

```bash
git add src/lib/raw/luma-runtime-adapter.ts
git commit --no-gpg-sign -m "feat(raw-runtime): scaffold prewarm state types and failure classifier"
```

### Task 2: Rewrite `prewarmLumaRawRuntime` + add `getPrewarmStateForLuma`

**Files:**
- Modify: `src/lib/raw/luma-runtime-adapter.ts`

- [ ] **Step 1 — Replace the existing `prewarmLumaRawRuntime` body.** Find:

```ts
export async function prewarmLumaRawRuntime(
  runtimeFactory?: () => LumaRawRuntime,
): Promise<void> {
  try {
    const runtime = await getRuntime(runtimeFactory)
    await runtime.init()
  } catch {
    // Prewarm is best-effort: actual upload paths surface errors with full context.
  }
}
```

Replace with:

```ts
export async function prewarmLumaRawRuntime(
  runtimeFactory?: () => LumaRawRuntime,
): Promise<PrewarmOutcome> {
  if (prewarmState === 'ready' && prewarmOutcome) {
    return prewarmOutcome
  }
  if (prewarmState === 'failed' && prewarmOutcome) {
    return prewarmOutcome
  }
  prewarmState = 'pending'
  try {
    const runtime = await getRuntime(runtimeFactory)
    await runtime.init()
    const outcome: PrewarmOutcome = { status: 'ready' }
    prewarmOutcome = outcome
    prewarmState = 'ready'
    return outcome
  } catch (error) {
    const classification = classifyPrewarmFailure(error)
    const outcome: PrewarmOutcome = {
      status: 'failed',
      reason: classification.reason,
      recoverable: classification.recoverable,
    }
    prewarmOutcome = outcome
    prewarmState = 'failed'
    return outcome
  }
}

export function getPrewarmStateForLuma(): PrewarmState {
  return prewarmState
}
```

- [ ] **Step 2 — Extend `disposeLumaRawRuntime` to clear prewarm state.** Find:

```ts
export function disposeLumaRawRuntime() {
  singletonRuntime?.dispose()
  singletonRuntime = null
  singletonRuntimePromise = null
}
```

Replace with:

```ts
export function disposeLumaRawRuntime() {
  singletonRuntime?.dispose()
  singletonRuntime = null
  singletonRuntimePromise = null
  prewarmState = 'idle'
  prewarmOutcome = null
}
```

- [ ] **Step 3 — Commit.**

```bash
git add src/lib/raw/luma-runtime-adapter.ts
git commit --no-gpg-sign -m "feat(raw-runtime): make prewarm outcome observable via state probe"
```

### Task 3: Extend `RawRuntimeAdapter` shape

**Files:**
- Modify: `src/lib/raw/runtime-adapter.ts`

- [ ] **Step 1 — Re-export types and extend imports.** At the top of the file, change:

```ts
import {
  decodeBoundedHqRawWithLuma,
  decodeQuickRawWithLuma,
  extractEmbeddedPreviewWithLuma,
  openRawSessionWithLuma,
  prewarmLumaRawRuntime,
} from './luma-runtime-adapter'
```

to:

```ts
import {
  decodeBoundedHqRawWithLuma,
  decodeQuickRawWithLuma,
  extractEmbeddedPreviewWithLuma,
  getPrewarmStateForLuma,
  openRawSessionWithLuma,
  prewarmLumaRawRuntime,
} from './luma-runtime-adapter'
export type {
  PrewarmOutcome,
  PrewarmState,
} from './luma-runtime-adapter'
```

- [ ] **Step 2 — Extend `RawRuntimeAdapter` type.** Find:

```ts
export type RawRuntimeAdapter = {
  prewarm: () => Promise<void>
  openSession: (file: File, signal?: AbortSignal) => Promise<RawRuntimeSession>
```

Replace with:

```ts
export type RawRuntimeAdapter = {
  prewarm: () => Promise<import('./luma-runtime-adapter').PrewarmOutcome>
  getPrewarmState: () => import('./luma-runtime-adapter').PrewarmState
  openSession: (file: File, signal?: AbortSignal) => Promise<RawRuntimeSession>
```

- [ ] **Step 3 — Implement `getPrewarmState` in the factory.** Find the `prewarm()` entry inside the returned object of `createRawRuntimeAdapter`:

```ts
  return {
    prewarm() {
      return prewarmLumaRawRuntime(lumaRuntimeFactory)
    },
    openSession(file, signal) {
```

Replace with:

```ts
  return {
    prewarm() {
      return prewarmLumaRawRuntime(lumaRuntimeFactory)
    },
    getPrewarmState() {
      return getPrewarmStateForLuma()
    },
    openSession(file, signal) {
```

- [ ] **Step 4 — Commit.**

```bash
git add src/lib/raw/runtime-adapter.ts
git commit --no-gpg-sign -m "feat(raw-runtime-adapter): expose prewarm outcome + getPrewarmState"
```

### Task 4: Add prewarm tests in `runtime-adapter.test.ts`

**Files:**
- Modify: `src/lib/raw/runtime-adapter.test.ts`

- [ ] **Step 1 — Add a fresh `describe` block at the bottom of the file (before the final `})` of the outer `describe('raw runtime adapter', …)`).** Insert:

```ts
  it('returns ready outcome and ready state after a successful prewarm', async () => {
    const { runtime } = makeLumaRuntime()
    const adapter = createRawRuntimeAdapter({
      lumaRuntimeFactory: () => runtime,
    })

    expect(adapter.getPrewarmState()).toBe('idle')

    const outcome = await adapter.prewarm()

    expect(outcome).toEqual({ status: 'ready' })
    expect(adapter.getPrewarmState()).toBe('ready')
    expect(runtime.init).toHaveBeenCalledTimes(1)
  })

  it('returns failed outcome with recoverable=false for irrecoverable RAW_CROSS_ORIGIN_ISOLATION_REQUIRED', async () => {
    const { runtime } = makeLumaRuntime()
    const error = Object.assign(
      new Error('Cross-origin isolation is required.'),
      { code: 'RAW_CROSS_ORIGIN_ISOLATION_REQUIRED' },
    )
    vi.mocked(runtime.init).mockRejectedValue(error)
    const adapter = createRawRuntimeAdapter({
      lumaRuntimeFactory: () => runtime,
    })

    const outcome = await adapter.prewarm()

    expect(outcome).toMatchObject({
      status: 'failed',
      recoverable: false,
    })
    expect(outcome.reason).toContain('Cross-origin isolation')
    expect(adapter.getPrewarmState()).toBe('failed')
  })

  it('classifies unknown errors as recoverable failures', async () => {
    const { runtime } = makeLumaRuntime()
    vi.mocked(runtime.init).mockRejectedValue(new Error('network blip'))
    const adapter = createRawRuntimeAdapter({
      lumaRuntimeFactory: () => runtime,
    })

    const outcome = await adapter.prewarm()

    expect(outcome).toMatchObject({
      status: 'failed',
      recoverable: true,
      reason: 'network blip',
    })
    expect(adapter.getPrewarmState()).toBe('failed')
  })

  it('memoizes outcome across calls (no re-init on repeat prewarm)', async () => {
    const { runtime } = makeLumaRuntime()
    const adapter = createRawRuntimeAdapter({
      lumaRuntimeFactory: () => runtime,
    })

    const first = await adapter.prewarm()
    const second = await adapter.prewarm()

    expect(first).toEqual({ status: 'ready' })
    expect(second).toEqual({ status: 'ready' })
    expect(runtime.init).toHaveBeenCalledTimes(1)
  })

  it('disposeLumaRawRuntime resets prewarm state to idle', async () => {
    const { runtime } = makeLumaRuntime()
    const adapter = createRawRuntimeAdapter({
      lumaRuntimeFactory: () => runtime,
    })

    await adapter.prewarm()
    expect(adapter.getPrewarmState()).toBe('ready')

    disposeLumaRawRuntime()

    expect(adapter.getPrewarmState()).toBe('idle')
  })
```

- [ ] **Step 2 — Run the focused tests.**

```bash
pnpm test:run -- src/lib/raw/runtime-adapter.test.ts
```

Expected: all new tests pass; existing tests still pass.

- [ ] **Step 3 — Commit.**

```bash
git add src/lib/raw/runtime-adapter.test.ts
git commit --no-gpg-sign -m "test(raw-runtime-adapter): cover prewarm outcome and state probe"
```

### Task 5: Verify nothing downstream broke

**Files:** none modified.

- [ ] **Step 1 — Sanity sweep of existing consumers.** Run:

```bash
pnpm test:run -- src/lib/raw src/modules/raw-processor
```

Expected: all tests pass. Reason: `RawProcessorView`'s existing `void rawRuntimeAdapter.prewarm()` ignores the return value, so widening from `Promise<void>` to `Promise<PrewarmOutcome>` is backwards-compatible.

- [ ] **Step 2 — No commit (verification only).**

---

## Phase 2 — Warming phase + locales + overlay copy

### Task 6: Add `'warming'` to `ProcessingStatus`

**Files:**
- Modify: `src/atoms/raw-processor.ts`

- [ ] **Step 1 — Edit the union.** Find:

```ts
export type ProcessingStatus =
  | 'idle'
  | 'loading'
  | 'decoding'
  | 'processing'
  | 'exporting'
  | 'ready'
  | 'error'
```

Replace with:

```ts
export type ProcessingStatus =
  | 'idle'
  | 'warming'
  | 'loading'
  | 'decoding'
  | 'processing'
  | 'exporting'
  | 'ready'
  | 'error'
```

- [ ] **Step 2 — Run typecheck via build.** Since there is no standalone `typecheck` script, run lint (which uses TS rules):

```bash
pnpm lint
```

Expected: clean. If the lint surfaces unhandled `'warming'` cases anywhere, note them — we'll handle the known sites (ProgressOverlay phase map, isProcessing derive, getProgressRecoveryHint) in the next tasks.

- [ ] **Step 3 — No commit yet** (we ship `warming` together with its overlay copy + derive update in the next two tasks for atomicity).

### Task 7: Add `raw.progress.warming` to both locales + map in `ProgressOverlay`

**Files:**
- Modify: `src/locales/zh-CN.json`
- Modify: `src/locales/en.json`
- Modify: `src/modules/raw-processor/components/ProgressOverlay.tsx`

- [ ] **Step 1 — Add the zh-CN key.** Open `src/locales/zh-CN.json`. Find the `raw.progress.loading` entry (around line 280). Insert directly above it:

```json
  "raw.progress.warming": "正在唤醒 RAW 引擎...",
```

- [ ] **Step 2 — Add the en key.** Open `src/locales/en.json`. Find the analogous `raw.progress.loading` entry. Insert directly above it:

```json
  "raw.progress.warming": "Waking the RAW engine...",
```

- [ ] **Step 3 — Verify the locale-consistency test still passes.** Run:

```bash
pnpm test:run -- src/__tests__/i18n-locales.test.ts
```

Expected: pass. Both locale files must have the same set of keys.

- [ ] **Step 4 — Extend `ProgressOverlay` phase union + label map.** Open `src/modules/raw-processor/components/ProgressOverlay.tsx`. Find:

```ts
export interface ProgressOverlayProps {
  visible: boolean
  phase: 'loading' | 'decoding' | 'processing' | 'exporting'
  progress?: number // 0-100
  message?: string
  recoveryHint?: string
  className?: string
}
```

Replace the `phase` field with:

```ts
  phase: 'warming' | 'loading' | 'decoding' | 'processing' | 'exporting'
```

Find:

```ts
  const phaseLabels: Record<ProgressOverlayProps['phase'], string> = {
    loading: t('raw.progress.loading'),
    decoding: t('raw.progress.decoding'),
    processing: t('raw.progress.processing'),
    exporting: t('raw.progress.exporting'),
  }
```

Replace with:

```ts
  const phaseLabels: Record<ProgressOverlayProps['phase'], string> = {
    warming: t('raw.progress.warming'),
    loading: t('raw.progress.loading'),
    decoding: t('raw.progress.decoding'),
    processing: t('raw.progress.processing'),
    exporting: t('raw.progress.exporting'),
  }
```

- [ ] **Step 5 — Commit Tasks 6 + 7 together** (warming is one indivisible change):

```bash
git add src/atoms/raw-processor.ts src/locales/zh-CN.json src/locales/en.json src/modules/raw-processor/components/ProgressOverlay.tsx
git commit --no-gpg-sign -m "feat(raw): add warming phase with distinct overlay copy"
```

### Task 8: Update `isProcessing` derive + phase mapping in `RawProcessorView`

**Files:**
- Modify: `src/modules/raw-processor/RawProcessorView.tsx`

- [ ] **Step 1 — Include warming in `isProcessing`.** Find (around line 224-228):

```tsx
  const isProcessing =
    status === 'loading' ||
    status === 'decoding' ||
    status === 'processing' ||
    status === 'exporting'
```

Replace with:

```tsx
  const isProcessing =
    status === 'warming' ||
    status === 'loading' ||
    status === 'decoding' ||
    status === 'processing' ||
    status === 'exporting'
```

- [ ] **Step 2 — Map warming → warming for ProgressOverlay.** Find the inline `phase={ status === 'loading' ? 'loading' : … }` expression in the JSX block that passes props to `ComparePreviewStage` (around line 299-307):

```tsx
          phase={
            status === 'loading'
              ? 'loading'
              : status === 'decoding'
                ? 'decoding'
                : status === 'exporting'
                  ? 'exporting'
                  : 'processing'
          }
```

Replace with:

```tsx
          phase={
            status === 'warming'
              ? 'warming'
              : status === 'loading'
                ? 'loading'
                : status === 'decoding'
                  ? 'decoding'
                  : status === 'exporting'
                    ? 'exporting'
                    : 'processing'
          }
```

- [ ] **Step 3 — Propagate the `phase` union through ComparePreviewStage.** Open `src/modules/raw-processor/components/ComparePreviewStage.tsx`. Find:

```ts
  phase: 'loading' | 'decoding' | 'processing' | 'exporting'
```

Replace with:

```ts
  phase: 'warming' | 'loading' | 'decoding' | 'processing' | 'exporting'
```

- [ ] **Step 4 — Run focused tests.**

```bash
pnpm test:run -- src/modules/raw-processor/components/ProgressOverlay.test.tsx src/modules/raw-processor/__tests__/workspace-ui.test.tsx
```

Expected: pass. (Existing tests do not assert phase contents, only structure.)

- [ ] **Step 5 — Commit.**

```bash
git add src/modules/raw-processor/RawProcessorView.tsx src/modules/raw-processor/components/ComparePreviewStage.tsx
git commit --no-gpg-sign -m "feat(raw): wire warming phase through derive and stage"
```

---

## Phase 3 — orchestrateRawLoad paint boundary + warming branch

### Task 9: Add Promise-style `yieldToPaint` utility

**Files:**
- Modify: `src/lib/dom.ts`

- [ ] **Step 1 — Append the helper directly under `nextFrame`.** Open `src/lib/dom.ts`. Locate:

```ts
export const nextFrame = (fn: (...args: any[]) => any) => {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      fn()
    })
  })
}
```

Append below:

```ts
/**
 * Promise-flavoured single-frame yield. Resolves after the next animation
 * frame has fired — used as the paint boundary required by the
 * `/raw` heavy-interaction spec §2 (ack-before-work).
 *
 * In jsdom (vitest) requestAnimationFrame is shimmed via setTimeout, so this
 * still resolves; tests that need to observe the boundary should spy on the
 * orchestrator's injected `yieldToPaint` rather than this module-level export.
 */
export const yieldToPaint = (): Promise<void> =>
  new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame !== 'function') {
      setTimeout(() => resolve(), 0)
      return
    }
    requestAnimationFrame(() => resolve())
  })
```

- [ ] **Step 2 — Commit.**

```bash
git add src/lib/dom.ts
git commit --no-gpg-sign -m "feat(dom): add Promise-style yieldToPaint helper"
```

### Task 10: Inject `yieldToPaint` and `getPrewarmState` into the load context

**Files:**
- Modify: `src/modules/raw-processor/services/raw/orchestrate-raw-load.ts`
- Modify: `src/modules/raw-processor/hooks/useRawProcessor.ts`

- [ ] **Step 1 — Extend `RawLoadContext.services`.** Open `src/modules/raw-processor/services/raw/orchestrate-raw-load.ts`. Find the `services:` block inside the `RawLoadContext` interface:

```ts
  services: {
    scheduleToast: (notify: () => void) => void
    replaceFile: (
      file: File,
      retainedSessionState: RetainedSessionState,
    ) => ImageSession
    abortRuntimeWork: () => void
    abortExportWork: () => void
    queueExportResultResourceDisposal: () => void
    revokeCurrentEmbeddedPreviewUrl: () => void
    clearSessionEmbeddedPreviewUrl: (id?: string) => void
    setDecodedImageRef: (next: DecodedImage | null) => void
    invalidateExportGraph: () => void
    registerCurrentPreviewPipelineForEvacuation: () => void
    disposeRuntimeSession: (session?: RawRuntimeSession | null) => void
  }
```

Append two new service entries (so the orchestrator only depends on injected functions, never on direct module imports):

```ts
  services: {
    scheduleToast: (notify: () => void) => void
    replaceFile: (
      file: File,
      retainedSessionState: RetainedSessionState,
    ) => ImageSession
    abortRuntimeWork: () => void
    abortExportWork: () => void
    queueExportResultResourceDisposal: () => void
    revokeCurrentEmbeddedPreviewUrl: () => void
    clearSessionEmbeddedPreviewUrl: (id?: string) => void
    setDecodedImageRef: (next: DecodedImage | null) => void
    invalidateExportGraph: () => void
    registerCurrentPreviewPipelineForEvacuation: () => void
    disposeRuntimeSession: (session?: RawRuntimeSession | null) => void
    yieldToPaint: () => Promise<void>
    getPrewarmState: () => import(
      '~/lib/raw/runtime-adapter'
    ).PrewarmState
    prewarm: () => Promise<
      import('~/lib/raw/runtime-adapter').PrewarmOutcome
    >
  }
```

- [ ] **Step 2 — Wire them in `useRawProcessor.ts`.** Open `src/modules/raw-processor/hooks/useRawProcessor.ts`. Add to the imports at the top:

```ts
import { yieldToPaint } from '~/lib/dom'
import { rawRuntimeAdapter } from '~/lib/raw/runtime-adapter'
```

(If `rawRuntimeAdapter` is already imported, skip that second line.)

- [ ] **Step 3 — Pass them through the `rawLoadCtx` memo.** Find the `services:` block inside the `useMemo<RawLoadContext>` (around the existing `services: { scheduleToast, replaceFile, … disposeRuntimeSession }` literal):

```ts
      services: {
        scheduleToast,
        replaceFile,
        abortRuntimeWork,
        abortExportWork,
        queueExportResultResourceDisposal,
        revokeCurrentEmbeddedPreviewUrl,
        clearSessionEmbeddedPreviewUrl,
        setDecodedImageRef,
        invalidateExportGraph,
        registerCurrentPreviewPipelineForEvacuation,
        disposeRuntimeSession,
      },
```

Replace with:

```ts
      services: {
        scheduleToast,
        replaceFile,
        abortRuntimeWork,
        abortExportWork,
        queueExportResultResourceDisposal,
        revokeCurrentEmbeddedPreviewUrl,
        clearSessionEmbeddedPreviewUrl,
        setDecodedImageRef,
        invalidateExportGraph,
        registerCurrentPreviewPipelineForEvacuation,
        disposeRuntimeSession,
        yieldToPaint,
        getPrewarmState: () => rawRuntimeAdapter.getPrewarmState(),
        prewarm: () => rawRuntimeAdapter.prewarm(),
      },
```

- [ ] **Step 4 — Commit.**

```bash
git add src/modules/raw-processor/services/raw/orchestrate-raw-load.ts src/modules/raw-processor/hooks/useRawProcessor.ts
git commit --no-gpg-sign -m "refactor(raw-load): inject yieldToPaint and prewarm state into orchestrator"
```

### Task 11: Reorder `orchestrateRawLoad` — ack first, paint boundary, then heavy work

**Files:**
- Modify: `src/modules/raw-processor/services/raw/orchestrate-raw-load.ts`

- [ ] **Step 1 — Hoist the visible ack to the top of the `try` block.** Open `orchestrate-raw-load.ts`. Find the top of the `try { … }` body (currently begins with `ctx.refs.runtimeWorkSessionIdRef.current = null` and a series of teardown calls; `setStatus('loading')` is reached only ~25 lines later, after `replaceFile`).

The current ordering is approximately:

```ts
  try {
    ctx.refs.runtimeWorkSessionIdRef.current = null
    ctx.refs.pendingLoadSessionIdRef.current = null
    ctx.atoms.setPendingRecoveryRetry(null)
    ctx.services.abortExportWork()
    ctx.services.abortRuntimeWork()
    ctx.services.queueExportResultResourceDisposal()
    ctx.services.revokeCurrentEmbeddedPreviewUrl()
    ctx.refs.previewCopyCanvasRef.current = null
    runtimeAbortController = new AbortController()
    ctx.refs.runtimeAbortControllerRef.current = runtimeAbortController
    const runtimeSignal = runtimeAbortController.signal
    const loadState = prepareRawLoadState({
      params: ctx.atoms.getProcessingParams(),
      lut,
      activeStyle,
    })

    const nextSession = ctx.services.replaceFile(
      file,
      loadState.retainedSessionState,
    )
    loadSessionId = nextSession.id
    let quickPreview: DecodedImage | null = null
    let boundedHqPreview: DecodedImage | null = null

    ctx.refs.sessionRef.current = nextSession
    ctx.refs.runtimeWorkSessionIdRef.current = nextSession.id
    ctx.refs.pendingLoadSessionIdRef.current = nextSession.id
    ctx.services.setDecodedImageRef(null)
    ctx.atoms.setLoadedImage({ file, decoded: null, metadata: null })
    ctx.atoms.setStatus('loading')
    ctx.atoms.setProgress(0)
    ctx.atoms.setError(null)
    ctx.atoms.setParams((prev) => ({
      ...prev,
      ...loadState.processingParamsPatch,
    }))

    ctx.atoms.setSession((prev) => {
      if (!prev || prev.id !== nextSession.id) {
        return prev
      }

      return applyPreviewLoadStarted(prev, loadState.compareSplit)
    })
```

Replace the whole block above with the following reordered shape (every line preserved; only sequence and warming-decision logic added):

```ts
  try {
    const initialPhase: 'warming' | 'loading' =
      ctx.services.getPrewarmState() === 'ready' ? 'loading' : 'warming'

    ctx.atoms.setStatus(initialPhase)
    ctx.atoms.setProgress(0)
    ctx.atoms.setError(null)

    await ctx.services.yieldToPaint()

    ctx.refs.runtimeWorkSessionIdRef.current = null
    ctx.refs.pendingLoadSessionIdRef.current = null
    ctx.atoms.setPendingRecoveryRetry(null)
    ctx.services.abortExportWork()
    ctx.services.abortRuntimeWork()
    ctx.services.queueExportResultResourceDisposal()
    ctx.services.revokeCurrentEmbeddedPreviewUrl()
    ctx.refs.previewCopyCanvasRef.current = null
    runtimeAbortController = new AbortController()
    ctx.refs.runtimeAbortControllerRef.current = runtimeAbortController
    const runtimeSignal = runtimeAbortController.signal
    const loadState = prepareRawLoadState({
      params: ctx.atoms.getProcessingParams(),
      lut,
      activeStyle,
    })

    const nextSession = ctx.services.replaceFile(
      file,
      loadState.retainedSessionState,
    )
    loadSessionId = nextSession.id
    let quickPreview: DecodedImage | null = null
    let boundedHqPreview: DecodedImage | null = null

    ctx.refs.sessionRef.current = nextSession
    ctx.refs.runtimeWorkSessionIdRef.current = nextSession.id
    ctx.refs.pendingLoadSessionIdRef.current = nextSession.id
    ctx.services.setDecodedImageRef(null)
    ctx.atoms.setLoadedImage({ file, decoded: null, metadata: null })
    ctx.atoms.setParams((prev) => ({
      ...prev,
      ...loadState.processingParamsPatch,
    }))

    ctx.atoms.setSession((prev) => {
      if (!prev || prev.id !== nextSession.id) {
        return prev
      }

      return applyPreviewLoadStarted(prev, loadState.compareSplit)
    })

    if (initialPhase === 'warming') {
      const outcome = await ctx.services.prewarm()
      if (!ctx.refs.isMountedRef.current) {
        return
      }
      if (outcome.status === 'failed') {
        throw new RawAdapterErrorLike(outcome.reason ?? 'Prewarm failed.')
      }
      ctx.atoms.setStatus('loading')
    }
```

Note three deliberate changes:
1. The four atom writes for `setStatus`/`setProgress`/`setError` move to the very top, *before* `yieldToPaint`.
2. The `setStatus('loading')` previously mid-block is removed there (already covered above by `setStatus(initialPhase)` and the post-prewarm `setStatus('loading')`).
3. A new `RawAdapterErrorLike` thrown from the warming branch propagates to the existing `catch` arm that already maps to `runtime-fault` UX per §6.

- [ ] **Step 2 — Define `RawAdapterErrorLike`.** At the top of `orchestrate-raw-load.ts` after the imports, append:

```ts
class RawAdapterErrorLike extends Error {
  readonly code = 'RAW_PREWARM_FAILED'
  constructor(message: string) {
    super(message)
    this.name = 'RawAdapterError'
  }
}
```

(This mirrors `RawAdapterError` from `luma-runtime-adapter.ts` so the existing `getStableErrorCode` + `toUserFacingErrorCode` pipeline routes the failure to the standard error overlay. We define it locally to avoid pulling the full Luma module into orchestrator imports.)

- [ ] **Step 3 — Commit.** This is one cohesive change; do not split.

```bash
git add src/modules/raw-processor/services/raw/orchestrate-raw-load.ts
git commit --no-gpg-sign -m "refactor(raw-load): ack-then-paint-then-work, branch on prewarm state"
```

### Task 12: Update `useRawProcessor.test.tsx` mock surface

**Files:**
- Modify: `src/modules/raw-processor/hooks/useRawProcessor.test.tsx`

- [ ] **Step 1 — Extend the hoisted adapter mock.** Find:

```ts
const rawRuntimeAdapterMock = vi.hoisted(() => ({
  openSession: vi.fn(),
  extractEmbeddedPreview: vi.fn(),
  decodeQuickRaw: vi.fn(),
  decodeBoundedHqRaw: vi.fn(),
  probeExportCapability: vi.fn(),
}))
```

Replace with:

```ts
const rawRuntimeAdapterMock = vi.hoisted(() => ({
  openSession: vi.fn(),
  extractEmbeddedPreview: vi.fn(),
  decodeQuickRaw: vi.fn(),
  decodeBoundedHqRaw: vi.fn(),
  probeExportCapability: vi.fn(),
  prewarm: vi.fn(),
  getPrewarmState: vi.fn(),
}))
```

- [ ] **Step 2 — Default the mock to a stable `'ready'` state.** Find the `beforeEach` (or equivalent reset) block where the mock's `.mockReset()` calls live. Append:

```ts
    rawRuntimeAdapterMock.getPrewarmState.mockReset().mockReturnValue('ready')
    rawRuntimeAdapterMock.prewarm
      .mockReset()
      .mockResolvedValue({ status: 'ready' })
```

This ensures existing tests that did not care about prewarm continue exercising the "warm" code path (skipping `'warming'`).

- [ ] **Step 3 — Run focused tests.**

```bash
pnpm test:run -- src/modules/raw-processor/hooks/useRawProcessor.test.tsx
```

Expected: pass.

- [ ] **Step 4 — Commit.**

```bash
git add src/modules/raw-processor/hooks/useRawProcessor.test.tsx
git commit --no-gpg-sign -m "test(useRawProcessor): extend adapter mock with prewarm state"
```

### Task 13: Add an ordering test that pins the ack-before-work contract

**Files:**
- Create: `src/modules/raw-processor/services/raw/orchestrate-raw-load.test.ts`

- [ ] **Step 1 — Write the test.** Create the file with:

```ts
import { describe, expect, it, vi } from 'vitest'

import type { ProcessingParams } from '@lumaforge/luma-color-runtime'

import type { RawLoadContext } from './orchestrate-raw-load'
import { orchestrateRawLoad } from './orchestrate-raw-load'

// Mock the adapter at module level (vi.mock is hoisted). The orchestrator
// only uses openSession from this import; getPrewarmState/prewarm are
// injected via ctx.services and controlled per test below.
vi.mock('~/lib/raw/runtime-adapter', () => ({
  rawRuntimeAdapter: {
    openSession: vi.fn().mockImplementation(() => new Promise(() => {})),
    getPrewarmState: () => 'ready' as const,
    prewarm: () => Promise.resolve({ status: 'ready' as const }),
  },
}))

function buildContext(overrides: {
  yieldToPaint: () => Promise<void>
  getPrewarmState: () => 'idle' | 'pending' | 'ready' | 'failed'
  prewarm?: () => Promise<{ status: 'ready' | 'failed'; reason?: string }>
  openSession?: () => Promise<unknown>
  order: string[]
}): RawLoadContext {
  const noop = () => {}
  return {
    atoms: {
      setStatus: vi.fn((s) => overrides.order.push(`status:${s}`)),
      setError: vi.fn(),
      setProgress: vi.fn(),
      setLoadedImage: vi.fn(),
      getProcessingParams: vi.fn(
        () =>
          ({
            intensity: 0.7,
            viewMode: 'compare',
            compareSplit: 0.5,
            styleKind: 'none',
            builtinPreset: null,
            userExposureEv: 0,
            userContrast: 0,
            userHighlights: 0,
            userShadows: 0,
            userWhites: 0,
            userBlacks: 0,
          }) satisfies ProcessingParams,
      ),
      setParams: vi.fn(),
      setSession: vi.fn(),
      setDecodedImageVersion: vi.fn(),
      setStats: vi.fn(),
      setPendingRecoveryRetry: vi.fn(),
    },
    services: {
      scheduleToast: noop,
      replaceFile: vi.fn((_file) => ({
        id: 'session-1',
        sourceFile: { name: 'x.ARW', supportLevel: 'experimental', sizeBytes: 1 },
        viewState: { zoom: 1, panX: 0, panY: 0, fitMode: 'screen' },
        previewBundle: {
          embeddedPreview: { objectUrl: null },
          displaySource: 'none',
        },
        renderState: { status: 'pending', lastErrorCode: null },
        exportState: {
          status: 'idle',
          recovery: { status: 'none' },
          fullResCapability: { status: 'idle' },
        },
        lutProfileSelection: null,
        activeStyle: null,
      } as unknown as ReturnType<RawLoadContext['services']['replaceFile']>)),
      abortRuntimeWork: vi.fn(() =>
        overrides.order.push('abortRuntimeWork'),
      ),
      abortExportWork: vi.fn(() => overrides.order.push('abortExportWork')),
      queueExportResultResourceDisposal: vi.fn(),
      revokeCurrentEmbeddedPreviewUrl: vi.fn(),
      clearSessionEmbeddedPreviewUrl: vi.fn(),
      setDecodedImageRef: vi.fn(),
      invalidateExportGraph: vi.fn(),
      registerCurrentPreviewPipelineForEvacuation: vi.fn(),
      disposeRuntimeSession: vi.fn(),
      yieldToPaint: vi.fn(async () => {
        overrides.order.push('yieldToPaint')
        await overrides.yieldToPaint()
      }),
      getPrewarmState: overrides.getPrewarmState,
      prewarm:
        overrides.prewarm ??
        (async () => ({ status: 'ready' as const })),
    },
    refs: {
      runtimeAbortControllerRef: { current: null },
      runtimeSessionRef: { current: null },
      disposedRuntimeSessionsRef: { current: new WeakSet() },
      decodedImageRef: { current: null },
      sessionRef: { current: null },
      pipelineRef: { current: null },
      resourceRegistryRef: { current: null },
      embeddedPreviewUrlRef: { current: null },
      isMountedRef: { current: true },
      runtimeWorkSessionIdRef: { current: null },
      pendingLoadSessionIdRef: { current: null },
      previewPipelineResourceIdRef: { current: 0 },
      previewCopyCanvasRef: { current: null },
    },
  }
}

describe('orchestrateRawLoad ack-before-work contract', () => {
  it('commits visible status then awaits a paint boundary before any teardown', async () => {
    const order: string[] = []
    let resolvePaint: () => void = () => {}
    const yieldGate = new Promise<void>((resolve) => {
      resolvePaint = resolve
    })

    const ctx = buildContext({
      yieldToPaint: () => yieldGate,
      getPrewarmState: () => 'ready',
      order,
    })

    const file = new File(['raw'], 'sample.ARW')
    const loadPromise = orchestrateRawLoad(file, {} as ProcessingParams, null, null, ctx)

    // Microtask flush — setStatus + yieldToPaint should have fired,
    // teardown should NOT have fired yet.
    await Promise.resolve()
    await Promise.resolve()

    expect(order).toEqual(['status:loading', 'yieldToPaint'])

    // Release the paint boundary; teardown should now proceed.
    resolvePaint()
    await Promise.resolve()
    await Promise.resolve()

    expect(order).toContain('abortRuntimeWork')
    expect(order.indexOf('yieldToPaint')).toBeLessThan(
      order.indexOf('abortRuntimeWork'),
    )

    // Suppress the unresolved openSession promise.
    loadPromise.catch(() => undefined)
  })

  it('enters warming when prewarm is pending, then transitions to loading after prewarm resolves', async () => {
    const order: string[] = []
    let resolvePrewarm: (
      value: { status: 'ready' | 'failed'; reason?: string },
    ) => void = () => {}
    const prewarmPromise = new Promise<{
      status: 'ready' | 'failed'
      reason?: string
    }>((resolve) => {
      resolvePrewarm = resolve
    })

    const ctx = buildContext({
      yieldToPaint: () => Promise.resolve(),
      getPrewarmState: () => 'pending',
      prewarm: () => prewarmPromise,
      order,
    })

    const file = new File(['raw'], 'sample.ARW')
    const loadPromise = orchestrateRawLoad(file, {} as ProcessingParams, null, null, ctx)

    await Promise.resolve()
    await Promise.resolve()

    expect(order[0]).toBe('status:warming')
    expect(order).not.toContain('status:loading')

    resolvePrewarm({ status: 'ready' })
    await Promise.resolve()
    await Promise.resolve()

    expect(order).toContain('status:loading')

    loadPromise.catch(() => undefined)
  })
})
```

- [ ] **Step 2 — Run the new test.**

```bash
pnpm test:run -- src/modules/raw-processor/services/raw/orchestrate-raw-load.test.ts
```

Expected: pass.

- [ ] **Step 3 — Commit.**

```bash
git add src/modules/raw-processor/services/raw/orchestrate-raw-load.test.ts
git commit --no-gpg-sign -m "test(raw-load): pin ack-paint-then-work and warming branch contracts"
```

---

## Phase 4 — Off-DOM file picker migration

### Task 14: Create the `useHiddenFilePicker` hook

**Files:**
- Create: `src/modules/raw-processor/hooks/useHiddenFilePicker.ts`

- [ ] **Step 1 — Write the hook.** Create the file with:

```ts
import { useCallback, useRef } from 'react'

export interface UseHiddenFilePickerOptions {
  accept: string
  onFile: (file: File) => void
}

export interface UseHiddenFilePickerHandle {
  open: () => void
  inputProps: {
    ref: React.RefObject<HTMLInputElement | null>
    type: 'file'
    accept: string
    'aria-hidden': true
    tabIndex: -1
    className: string
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => void
  }
}

/**
 * Always-mounted hidden file input. The caller renders `<input {...inputProps} />`
 * somewhere in its tree; `open()` triggers the native picker through that
 * real-DOM element, avoiding the WebKit-flaky off-DOM
 * `document.createElement('input')` pattern.
 *
 * Used by replace and recovery upload paths in RawProcessorView.
 */
export function useHiddenFilePicker(
  options: UseHiddenFilePickerOptions,
): UseHiddenFilePickerHandle {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const onFileRef = useRef(options.onFile)
  onFileRef.current = options.onFile

  const open = useCallback(() => {
    inputRef.current?.click()
  }, [])

  const onChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.currentTarget.files?.[0]
      event.currentTarget.value = ''
      if (file) {
        onFileRef.current(file)
      }
    },
    [],
  )

  return {
    open,
    inputProps: {
      ref: inputRef,
      type: 'file',
      accept: options.accept,
      'aria-hidden': true,
      tabIndex: -1,
      className: 'sr-only',
      onChange,
    },
  }
}
```

- [ ] **Step 2 — Commit.**

```bash
git add src/modules/raw-processor/hooks/useHiddenFilePicker.ts
git commit --no-gpg-sign -m "feat(raw): add useHiddenFilePicker hook for ref-driven uploads"
```

### Task 15: Migrate `handleReplaceFile` and `handleRecoveryFileSelect`

**Files:**
- Modify: `src/modules/raw-processor/RawProcessorView.tsx`

- [ ] **Step 1 — Import the hook.** Add to the imports block:

```ts
import { useHiddenFilePicker } from './hooks/useHiddenFilePicker'
```

- [ ] **Step 2 — Declare two hidden pickers near the top of `RawProcessorViewInner`** (right after the `useRawProcessor` destructure, before the existing `useCallback` declarations):

```tsx
  const RAW_FILE_ACCEPT =
    '.cr2,.cr3,.nef,.arw,.raf,.rw2,.orf,.dng,.pef,.srw,.3fr,.fff,.iiq,.raw'

  const replacePicker = useHiddenFilePicker({
    accept: RAW_FILE_ACCEPT,
    onFile: (file) => {
      void loadFile(file)
    },
  })

  const recoveryPicker = useHiddenFilePicker({
    accept: RAW_FILE_ACCEPT,
    onFile: (file) => {
      void recoverInterruptedExport(file)
    },
  })
```

- [ ] **Step 3 — Replace `handleReplaceFile`.** Find:

```tsx
  const handleReplaceFile = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept =
      '.cr2,.cr3,.nef,.arw,.raf,.rw2,.orf,.dng,.pef,.srw,.3fr,.fff,.iiq,.raw'
    input.onchange = () => {
      const nextFile = input.files?.[0]
      if (nextFile) {
        loadFile(nextFile)
      }
    }
    input.click()
  }, [loadFile])
```

Replace with:

```tsx
  const handleReplaceFile = useCallback(() => {
    replacePicker.open()
  }, [replacePicker])
```

- [ ] **Step 4 — Replace `handleRecoveryFileSelect`.** Find:

```tsx
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

Replace with:

```tsx
  const handleRecoveryFileSelect = useCallback(() => {
    recoveryPicker.open()
  }, [recoveryPicker])
```

- [ ] **Step 5 — Render the hidden inputs.** At the very end of the main JSX (right before the closing `</div>` of `data-raw-lab-shell="viewport"`, after `<ErrorOverlay … />`), append:

```tsx
      <input {...replacePicker.inputProps} />
      <input {...recoveryPicker.inputProps} />
```

- [ ] **Step 6 — Run the workspace-ui test that exercises this surface.**

```bash
pnpm test:run -- src/modules/raw-processor/__tests__/workspace-ui.test.tsx
```

Expected: pass. (No test currently asserts the off-DOM `document.createElement` path for replace/recovery — only the empty-stage Dropzone was covered.)

- [ ] **Step 7 — Commit.**

```bash
git add src/modules/raw-processor/RawProcessorView.tsx
git commit --no-gpg-sign -m "refactor(raw): migrate replace/recovery pickers to mounted-input hook"
```

### Task 16: Add a focused test for the new pickers

**Files:**
- Create: `src/modules/raw-processor/hooks/useHiddenFilePicker.test.tsx`

- [ ] **Step 1 — Write the test.** Create the file with:

```tsx
import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useHiddenFilePicker } from './useHiddenFilePicker'

function Harness({ onFile }: { onFile: (f: File) => void }) {
  const picker = useHiddenFilePicker({
    accept: '.cr2,.cr3,.arw',
    onFile,
  })
  return (
    <>
      <button type="button" onClick={picker.open}>
        Open
      </button>
      <input data-testid="hidden-input" {...picker.inputProps} />
    </>
  )
}

describe('useHiddenFilePicker', () => {
  it('renders the input with the accessibility + accept attributes', () => {
    const { getByTestId } = render(<Harness onFile={() => {}} />)
    const input = getByTestId('hidden-input') as HTMLInputElement
    expect(input.type).toBe('file')
    expect(input.accept).toBe('.cr2,.cr3,.arw')
    expect(input.getAttribute('aria-hidden')).toBe('true')
    expect(input.tabIndex).toBe(-1)
    expect(input.className).toBe('sr-only')
  })

  it('open() invokes the ref-bound input click, not document.createElement', () => {
    const createElementSpy = vi.spyOn(document, 'createElement')
    const { getByTestId, getByText } = render(<Harness onFile={() => {}} />)
    const input = getByTestId('hidden-input') as HTMLInputElement
    const clickSpy = vi.spyOn(input, 'click').mockImplementation(() => {})

    fireEvent.click(getByText('Open'))

    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(createElementSpy).not.toHaveBeenCalledWith('input')
    createElementSpy.mockRestore()
  })

  it('forwards the selected file to onFile and clears the input value', () => {
    const onFile = vi.fn()
    const { getByTestId } = render(<Harness onFile={onFile} />)
    const input = getByTestId('hidden-input') as HTMLInputElement
    const file = new File(['raw'], 'sample.ARW')

    fireEvent.change(input, { target: { files: [file] } })

    expect(onFile).toHaveBeenCalledWith(file)
    expect(input.value).toBe('')
  })
})
```

- [ ] **Step 2 — Run the test.**

```bash
pnpm test:run -- src/modules/raw-processor/hooks/useHiddenFilePicker.test.tsx
```

Expected: pass.

- [ ] **Step 3 — Commit.**

```bash
git add src/modules/raw-processor/hooks/useHiddenFilePicker.test.tsx
git commit --no-gpg-sign -m "test(useHiddenFilePicker): cover ref-driven click and onChange"
```

---

## Phase 5 — Final verification

### Task 17: Run the full lint + test + build sweep and browser smoke

**Files:** none modified.

- [ ] **Step 1 — Lint.**

```bash
pnpm lint
```

Expected: clean.

- [ ] **Step 2 — Tests (full suite).**

```bash
pnpm test:run
```

Expected: 1204+ tests pass (existing baseline) plus the new prewarm, ordering, and useHiddenFilePicker tests.

- [ ] **Step 3 — Build.**

```bash
pnpm build
```

Expected: success. Pre-existing warnings (>500kb chunk, `loader` import) are not introduced by this work.

- [ ] **Step 4 — Browser smoke (per project memory: vite preview, not dev).**

```bash
pnpm serve --port 4173 --strictPort
```

Then in a separate terminal hit `http://localhost:4173/raw`. Verify visually:
1. The page loads, the empty stage and UploadDock are visible.
2. Clicking UploadDock opens the file picker reliably on repeat attempts (no off-DOM flakiness).
3. After selecting a RAW file, the `ProgressOverlay` appears immediately (warming or loading copy, depending on whether prewarm has resolved by the time of click).
4. After a successful load, `Replace RAW` button opens a picker via the new mounted-input path (no DevTools "input element was not in DOM" warnings).

If you cannot test in a real browser (e.g. headless dev container), document the limitation and note that the unit ordering test (Task 13) substitutes for the paint-boundary assertion per spec §2 verification clause.

- [ ] **Step 5 — Stop the preview server.**

```bash
pkill -f "vite preview --port 4173"
```

No commit (verification only).

---

## Deferred (explicitly out of scope for this plan)

The spec includes the following items that are intentionally **not** implemented here, per Codex adversarial review + user direction:

- **Capability gate prewarm-fault escalation** (spec §3 final bullet) — defer to a follow-up plan. The new `getPrewarmState()` + `recoverable` flag make this trivially additive when the time comes.
- **JPEG worker pool prewarm** (spec §1 out-of-scope) — defer until measurement shows a real cold-start hit on first export.
- **WebGL pipeline prewarm** — same as above.
- **Custom ack visual** (halo / edge / skeleton) — the existing `ProgressOverlay` entrance via `AnimatePresence` plus the new `'warming'` copy already produces a distinguishable ack vs in-progress visual. A dedicated halo or other choreography is not in this plan.
- **Storage-fault UI taxonomy** (spec §6) — defer to a follow-up; the orchestrator currently still folds OPFS faults into the existing error overlay.
- **Lint rule that bans leaf cross-layer OR** (spec §4 derive-site rule) — defer; rely on PR review and the named-pattern Appendix B until we have a custom eslint rule.

When picking up any of these later, refer back to the spec sections cited and to Appendix B's named patterns to keep the language consistent.
