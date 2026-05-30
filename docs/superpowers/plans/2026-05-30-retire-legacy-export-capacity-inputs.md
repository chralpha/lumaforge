# Retire Legacy Export Capacity Inputs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `selectExportExecutionPlan` derive its plan solely from an explicit `capability: CapabilityVector` and `runtime: ExportRuntimeResources`, deleting the legacy `runtime:{pthreadAvailable}` / `output` / `platform` input surface and the hidden global-snapshot read.

**Architecture:** Pure refactor with no externally observable behavior change. All three production callers already pass the current shape; the legacy branches are kept alive only by `execution-profile.test.ts`. We first migrate the one piece of UA-classification coverage that lives in the export-policy tests over to `capability-vector.test.ts` (where it belongs), then migrate the export-policy tests to the explicit shape, then delete the legacy surface from the source.

**Tech Stack:** TypeScript, Vitest (jsdom app project via `pnpm test:app`), ESLint.

**Spec:** `docs/superpowers/specs/2026-05-30-retire-legacy-export-capacity-inputs-design.md`

---

## File Structure

- `src/lib/runtime/capability-vector.test.ts` — **modify.** Add one `it.each` tuple so iPadOS-desktop-mode UA classification (`Macintosh` + touch → `webkit-mobile`) is asserted here. This is the only UA classification currently exercised solely by the export-policy tests.
- `src/lib/export/execution-profile.test.ts` — **modify.** Replace legacy-shaped inputs with explicit `capability`/`runtime` literals; delete the obsolete `lowMemoryAvailable` type guard and the now-duplicate iPadOS case.
- `src/lib/export/execution-profile.ts` — **modify.** Delete `LegacyRuntimeInput`, `LegacyOutputInput`, `isExportRuntimeResources`, `resolveCapability`, `resolveRuntimeResources`; make `capability` and `runtime` required; drop the now-unused value import.

No production caller changes: `export-system.ts`, `checkpoint-store.ts`, and `export-readiness.ts` already pass `capability` + `runtime: ExportRuntimeResources`.

---

## Task 1: Migrate iPadOS-desktop-mode UA classification coverage

**Files:**
- Modify: `src/lib/runtime/capability-vector.test.ts` (the `it.each` table at lines 37-62)

**Why:** The export-policy test "uses low-memory policy for iPadOS Safari desktop-mode user agents with touch" is the only test that exercises `classifyUserAgent` for a `Macintosh` UA *with* touch resolving to `webkit-mobile`. Task 2 collapses that test (it becomes a duplicate once `webKitClass` is set directly), so this classification assertion must move to the classification test first.

- [ ] **Step 1: Add the iPadOS-desktop-mode tuple to the classification table**

In `src/lib/runtime/capability-vector.test.ts`, find the `webkit-desktop-safari` tuple and insert a new tuple immediately before it. Change:

```ts
    [
      'webkit-desktop-safari',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.4 Safari/605.1.15',
      0,
      'webkit-desktop-safari',
    ],
    ['unknown', 'LumaForgeTest/1.0', 0, 'unknown'],
```

to:

```ts
    [
      'webkit-mobile (iPadOS desktop-mode UA + touch)',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
      5,
      'webkit-mobile',
    ],
    [
      'webkit-desktop-safari',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.4 Safari/605.1.15',
      0,
      'webkit-desktop-safari',
    ],
    ['unknown', 'LumaForgeTest/1.0', 0, 'unknown'],
```

(The new row uses a `Macintosh` UA with `maxTouchPoints: 5`, which `classifyUserAgent` treats as iPadOS desktop-mode → `webkit-mobile`. The existing `webkit-desktop-safari` row keeps the same UA shape with `maxTouchPoints: 0`, so the pair documents that touch is the discriminator.)

- [ ] **Step 2: Run the test to verify it passes against current code**

Run: `pnpm test:app -- src/lib/runtime/capability-vector.test.ts`
Expected: PASS — all `classifies %s user agents` rows green, including the new `webkit-mobile (iPadOS desktop-mode UA + touch)` row. (No source change is needed; current `classifyUserAgent` already handles this.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/runtime/capability-vector.test.ts
git commit --no-gpg-sign -m "test(runtime): cover iPadOS desktop-mode UA classification"
```

---

## Task 2: Migrate execution-profile tests to capability/runtime inputs

**Files:**
- Modify: `src/lib/export/execution-profile.test.ts` (replace the block from the first `it` after `afterEach` through the `'accepts performancePreference...'` test — currently lines 26-245)

**Why:** Move the policy tests onto the explicit `capability`/`runtime` shape. The source still supports this shape, so the suite stays green before the legacy surface is deleted in Task 3. Device classes that were previously selected via `platform.userAgent` strings are set directly via `webKitClass`; UA→`webKitClass` classification is now covered by `capability-vector.test.ts` (Task 1). All policy assertions are preserved.

- [ ] **Step 1: Replace the legacy-shaped test block**

Replace everything from this line:

```ts
  it('rejects lowMemoryAvailable in legacy runtime input at type level', () => {
```

down to and including the closing of the `'accepts performancePreference, three previous-failure flags, capability, and runtime resources'` test (the `})` that precedes `it('maps product copy without saying resume for safe retry', ...)`), with the following block:

```ts
  it('uses crash-retry policy after interrupted checkpoint regardless of platform', () => {
    const plan = selectExportExecutionPlan({
      fidelity: 'max',
      sourceWidth: 11662,
      sourceHeight: 8746,
      previousInterrupted: true,
      capability: {
        coi: true,
        pthread: true,
        deviceMemoryGB: null,
        hwConcurrency: 1,
        webKitClass: 'unknown',
        maybeOpfsSupported: true,
      },
      runtime: {
        opfsSinkAvailable: true,
        opfsAvailableMB: Number.POSITIVE_INFINITY,
        streamingSinkAvailable: true,
      },
    })

    expect(plan.preferredRows).toBe(64)
    expect(plan.concurrency).toBe(1)
    expect(plan.runtimeMemoryProfile).toBe('low-memory')
    expect(plan.checkpointMode).toBe('safe-retry')
    expect(plan.outputSink).toBe('opfs-file')
    expect(plan.productCopy).toBe('interrupted-retry')
  })

  it('uses low-memory OPFS policy for webkit-mobile environments', () => {
    const plan = selectExportExecutionPlan({
      fidelity: 'balanced',
      sourceWidth: 11662,
      sourceHeight: 8746,
      capability: {
        coi: true,
        pthread: true,
        deviceMemoryGB: null,
        hwConcurrency: 1,
        webKitClass: 'webkit-mobile',
        maybeOpfsSupported: true,
      },
      runtime: {
        opfsSinkAvailable: true,
        opfsAvailableMB: Number.POSITIVE_INFINITY,
        streamingSinkAvailable: false,
      },
    })

    expect(plan.maxConcurrency).toBe(1)
    expect(plan.preferredRows).toBe(128)
    expect(plan.concurrency).toBe(1)
    expect(plan.runtimeMemoryProfile).toBe('low-memory')
    expect(plan.outputSink).toBe('opfs-file')
    expect(plan.derivedLabel).toContain('wkwebkit-mobile')
    expect(plan.policyVector).toMatchObject({
      workerMemoryProfile: 'low-memory',
      rowSlice: 128,
      concurrency: 1,
      outputSink: 'opfs-file',
    })
  })

  it('marks webkit-mobile large blob handoff exports as unable to complete safely', () => {
    const plan = selectExportExecutionPlan({
      fidelity: 'balanced',
      sourceWidth: 9566,
      sourceHeight: 6374,
      capability: {
        coi: false,
        pthread: false,
        deviceMemoryGB: null,
        hwConcurrency: 1,
        webKitClass: 'webkit-mobile',
        maybeOpfsSupported: false,
      },
      runtime: {
        opfsSinkAvailable: false,
        opfsAvailableMB: null,
        streamingSinkAvailable: false,
      },
    })

    expect(plan.outputSink).toBe('blob-handoff')
    expect(plan.runtimeMemoryProfile).toBe('low-memory')
    expect(plan.derivedLabel).toContain('wkwebkit-mobile')
    expect(plan.productCopy).toBe('cannot-safely-complete')
    expect(getExportModeCopy(plan.productCopy)).toMatch(
      /cannot safely complete this large local full-resolution export/i,
    )
  })

  it('keeps smaller webkit-mobile blob handoff exports allowed', () => {
    const plan = selectExportExecutionPlan({
      fidelity: 'balanced',
      sourceWidth: 6048,
      sourceHeight: 4024,
      capability: {
        coi: false,
        pthread: false,
        deviceMemoryGB: null,
        hwConcurrency: 1,
        webKitClass: 'webkit-mobile',
        maybeOpfsSupported: false,
      },
      runtime: {
        opfsSinkAvailable: false,
        opfsAvailableMB: null,
        streamingSinkAvailable: false,
      },
    })

    expect(plan.outputSink).toBe('blob-handoff')
    expect(plan.runtimeMemoryProfile).toBe('low-memory')
    expect(plan.derivedLabel).toContain('wkwebkit-mobile')
    expect(plan.productCopy).toBe('safe-export')
  })

  it('uses low-memory policy for desktop Safari WebKit workers', () => {
    const plan = selectExportExecutionPlan({
      fidelity: 'balanced',
      sourceWidth: 5520,
      sourceHeight: 8288,
      capability: {
        coi: true,
        pthread: true,
        deviceMemoryGB: null,
        hwConcurrency: 8,
        webKitClass: 'webkit-desktop-safari',
        maybeOpfsSupported: false,
      },
      runtime: {
        opfsSinkAvailable: false,
        opfsAvailableMB: null,
        streamingSinkAvailable: false,
      },
    })

    expect(plan.preferredRows).toBe(256)
    expect(plan.concurrency).toBe(1)
    expect(plan.runtimeMemoryProfile).toBe('low-memory')
    expect(plan.derivedLabel).toContain('wkwebkit-desktop-safari')
  })

  it.each([
    ['balanced', 2],
    ['max', 3],
  ] as Array<['balanced' | 'max', number]>)(
    'derives non-WebKit chromium %s throughput policy',
    (performancePreference, expectedConcurrency) => {
      const plan = selectExportExecutionPlan({
        performancePreference,
        sourceWidth: 10000,
        sourceHeight: 9000,
        capability: {
          coi: true,
          pthread: true,
          deviceMemoryGB: null,
          hwConcurrency: 8,
          webKitClass: 'chromium',
          maybeOpfsSupported: false,
        },
        runtime: {
          opfsSinkAvailable: false,
          opfsAvailableMB: null,
          streamingSinkAvailable: true,
        },
      })

      expect(plan.preferredRows).toBe(512)
      expect(plan.concurrency).toBe(expectedConcurrency)
      expect(plan.runtimeMemoryProfile).toBe('desktop')
      expect(plan.outputSink).toBe('streaming')
      expect(plan.derivedLabel).toContain('wkchromium')
      expect(plan.policyVector).toMatchObject({
        workerMemoryProfile: 'desktop',
        rowSlice: 512,
        concurrency: expectedConcurrency,
        outputSink: 'streaming',
      })
    },
  )

  it('accepts performancePreference, three previous-failure flags, capability, and runtime resources', () => {
    const plan = selectExportExecutionPlan({
      performancePreference: 'balanced',
      previousResourceFailure: false,
      previousCrashLikeInterruption: false,
      previousUserInterrupted: false,
      sourceWidth: 6000,
      sourceHeight: 4000,
      capability: {
        coi: true,
        pthread: true,
        deviceMemoryGB: 16,
        hwConcurrency: 8,
        webKitClass: 'chromium',
        maybeOpfsSupported: true,
      },
      runtime: {
        opfsSinkAvailable: true,
        opfsAvailableMB: 4_000,
        streamingSinkAvailable: true,
      },
    })

    expect(plan.profile.checkpointOutput).toBe(true)
    expect(plan.runtimeMemoryProfile).toBe('desktop')
    expect(plan.derivedLabel).toMatch(/chromium/)
  })
```

Notes on what changed and why:
- Deleted `'rejects lowMemoryAvailable in legacy runtime input at type level'` — it guards a field on a legacy type being removed wholesale; the new required signature is enforced at every call site by the compiler.
- Deleted `'uses low-memory policy for iPadOS Safari desktop-mode user agents with touch'` — once `webKitClass` is set directly it is byte-identical to `'uses low-memory OPFS policy for webkit-mobile environments'`; its classification intent moved to Task 1.
- The `it.each` now varies only `performancePreference` (the two old rows differed only by fidelity once both UAs collapse to `chromium`).
- Removed the `} as never)` cast and the `(plan as { derivedLabel?: string })` cast in the last test — the explicit input now type-checks cleanly and `plan.derivedLabel` is typed.

- [ ] **Step 2: Run the migrated suite to verify it passes**

Run: `pnpm test:app -- src/lib/export/execution-profile.test.ts`
Expected: PASS — every test green. (Source still accepts the explicit shape, so no source change is needed yet.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/export/execution-profile.test.ts
git commit --no-gpg-sign -m "test(export): drive plan selection from capability/runtime inputs"
```

---

## Task 3: Remove the legacy input surface from execution-profile.ts

**Files:**
- Modify: `src/lib/export/execution-profile.ts` (imports near lines 1-6; type/helper block near lines 295-365; `selectExportExecutionPlan` body near lines 393-394)

- [ ] **Step 1: Drop the now-unused value import**

Change:

```ts
import type { CapabilityVector } from '~/lib/runtime/capability-vector'
import {
  classifyUserAgent,
  getCapabilityVectorSnapshot,
} from '~/lib/runtime/capability-vector'
```

to:

```ts
import type { CapabilityVector } from '~/lib/runtime/capability-vector'
```

(`classifyUserAgent` and `getCapabilityVectorSnapshot` were used only inside `resolveCapability`, deleted below. The `CapabilityVector` type import stays — it is still used by `chooseProfile`, `ExportExecutionPlan.capabilitySnapshot`, and the input type.)

- [ ] **Step 2: Delete the legacy types, type guard, and resolvers; make capability/runtime required**

Replace this block:

```ts
type LegacyRuntimeInput = {
  pthreadAvailable: boolean
}

type LegacyOutputInput = {
  opfsAvailable: boolean
  streamingAvailable: boolean
}

type SelectExportExecutionPlanInput = {
  performancePreference?: PerformancePreference
  fidelity?: ExportFidelity
  sourceWidth?: number
  sourceHeight?: number
  previousInterrupted?: boolean
  previousCrashLikeInterruption?: boolean
  previousUserInterrupted?: boolean
  previousResourceFailure?: boolean
  capability?: CapabilityVector
  runtime: ExportRuntimeResources | LegacyRuntimeInput
  output?: LegacyOutputInput
  platform?: {
    userAgent?: string
    touch?: boolean
    hardwareConcurrency?: number
  }
}

function isExportRuntimeResources(
  runtime: ExportRuntimeResources | LegacyRuntimeInput,
): runtime is ExportRuntimeResources {
  return 'opfsSinkAvailable' in runtime
}

function resolveCapability(
  input: SelectExportExecutionPlanInput,
): CapabilityVector {
  if (input.capability) return input.capability

  const snapshot = getCapabilityVectorSnapshot()
  if (snapshot) return snapshot

  const runtime = input.runtime
  const legacyRuntime = isExportRuntimeResources(runtime) ? null : runtime
  const platform = input.platform ?? {}
  return Object.freeze({
    coi: legacyRuntime?.pthreadAvailable ?? false,
    pthread: legacyRuntime?.pthreadAvailable ?? false,
    deviceMemoryGB: null,
    hwConcurrency: Math.max(1, Math.floor(platform.hardwareConcurrency ?? 1)),
    webKitClass: classifyUserAgent(
      platform.userAgent ?? '',
      platform.touch ?? false,
    ),
    maybeOpfsSupported: input.output?.opfsAvailable ?? false,
  })
}

function resolveRuntimeResources(
  input: SelectExportExecutionPlanInput,
): ExportRuntimeResources {
  if (isExportRuntimeResources(input.runtime)) return input.runtime

  return Object.freeze({
    opfsSinkAvailable: input.output?.opfsAvailable ?? false,
    opfsAvailableMB: input.output?.opfsAvailable
      ? Number.POSITIVE_INFINITY
      : null,
    streamingSinkAvailable: input.output?.streamingAvailable ?? false,
  })
}
```

with:

```ts
type SelectExportExecutionPlanInput = {
  performancePreference?: PerformancePreference
  fidelity?: ExportFidelity
  sourceWidth?: number
  sourceHeight?: number
  previousInterrupted?: boolean
  previousCrashLikeInterruption?: boolean
  previousUserInterrupted?: boolean
  previousResourceFailure?: boolean
  capability: CapabilityVector
  runtime: ExportRuntimeResources
}
```

- [ ] **Step 3: Read capability/runtime directly in the planner**

In `selectExportExecutionPlan`, change:

```ts
  const capability = resolveCapability(input)
  const runtime = resolveRuntimeResources(input)
```

to:

```ts
  const capability = input.capability
  const runtime = input.runtime
```

- [ ] **Step 4: Run the focused export suites to verify green**

Run: `pnpm test:app -- src/lib/export/execution-profile.test.ts src/modules/raw-processor/__tests__/export-system.test.ts`
Expected: PASS — no legacy-shape usage remains; production callers already pass the explicit shape, so nothing else needs editing.

- [ ] **Step 5: Run the full app verification split**

Run: `pnpm lint:check`
Expected: PASS — no unused-import or no-unused-vars errors for `classifyUserAgent` / `getCapabilityVectorSnapshot` (both removed), and no caller flagged for a missing `capability`/`runtime`.

Run: `pnpm test:app`
Expected: PASS — full app Vitest project green, confirming no other consumer relied on the legacy input or the snapshot fallback.

- [ ] **Step 6: Commit**

```bash
git add src/lib/export/execution-profile.ts
git commit --no-gpg-sign -m "refactor(export): require capability/runtime, drop legacy plan inputs"
```

---

## Notes for the implementer

- `pnpm test:app` is the jsdom app Vitest project (see `vitest.app.config.ts`); it covers both touched test files plus `export-system.test.ts`. Do not reach for `pnpm test:run` (full sweep) for this scope.
- Commits use `--no-gpg-sign` because SSH commit signing hangs in this headless environment.
- This branch is `refactor/retire-legacy-export-capacity-inputs`, already created off `main`.
- `fidelity` is intentionally left in `SelectExportExecutionPlanInput`; it is a preference alias, not a capacity input, and is out of scope. The retained `fidelity: 'max'`/`'balanced'` usages in the migrated tests keep the `performancePreference ?? fidelity` alias path covered.
