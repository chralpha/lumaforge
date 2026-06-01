# Retire Legacy Export Capacity Inputs

- **Date:** 2026-05-30
- **Status:** Approved (design)
- **Scope:** Phase 1 of a two-phase effort to make `CapabilityVector` the single
  source of truth for runtime acceleration decisions.
- **Related:** `2026-05-21-capability-driven-runtime-policy-design.md` (introduced
  `CapabilityVector` + per-domain policy derivation). Phase 2 (a CPU preview
  degrade path driven by GPU facts) is intentionally deferred to its own spec.

## Problem

`selectExportExecutionPlan` in `src/lib/export/execution-profile.ts` still accepts
two input models at once:

- The current model: an explicit `capability: CapabilityVector` plus
  `runtime: ExportRuntimeResources`.
- A legacy model: a `runtime: { pthreadAvailable }` union member, an
  `output: { opfsAvailable, streamingAvailable }` field, and a
  `platform: { userAgent, touch, hardwareConcurrency }` field, from which a
  `CapabilityVector` and `ExportRuntimeResources` are synthesized at call time.

All three production call sites already pass the current model:

- `src/modules/raw-processor/services/export-system.ts` (initial + retry plans)
- `src/lib/export/checkpoint-store.ts` (`selectCheckpointResumeExecutionPlan`)
- `src/modules/raw-processor/services/export-readiness.ts`

The legacy branches are kept alive only by `execution-profile.test.ts`, which
still constructs plans from `runtime: { pthreadAvailable }` / `output:` /
`platform:` literals. The cost is a dual-shaped public input, a type-guard
(`isExportRuntimeResources`), and two resolver functions (`resolveCapability`,
`resolveRuntimeResources`) that read a global snapshot
(`getCapabilityVectorSnapshot`) as a hidden input inside an otherwise pure
derivation. This directly contradicts the "single source of truth" goal: the
function can derive a plan from inputs that bypass the measured capability
vector.

The legacy type identifiers (`LegacyRuntimeInput`, `LegacyOutputInput`,
`isExportRuntimeResources`, `resolveCapability`, `resolveRuntimeResources`) are
referenced only within `execution-profile.ts`; no other module consumes them.

## Goals

- Make `selectExportExecutionPlan` derive its plan solely from an explicit
  `capability: CapabilityVector` and `runtime: ExportRuntimeResources`.
- Remove the legacy input surface and the hidden global-snapshot read so the
  function is pure with respect to its arguments.

## Non-Goals

- `fidelity` (the `performancePreference` alias) is a *preference* input, not a
  *capacity* input. It is out of scope and left untouched.
- No change to policy math (`deriveExportPolicy`), profile selection
  (`chooseProfile`), or any externally observable export behavior. This is a
  pure refactor.
- Phase 2 (surfacing GPU facts into the capability surface / CPU preview degrade
  path) is a separate spec.

## Design

Approach: make both capacity inputs required and delete the legacy surface
entirely.

### Input type

`SelectExportExecutionPlanInput` changes:

- `runtime: ExportRuntimeResources` — drop the union with `LegacyRuntimeInput`.
- `capability: CapabilityVector` — drop the optional marker.
- Remove the `output?: LegacyOutputInput` field.
- Remove the `platform?: { userAgent?, touch?, hardwareConcurrency? }` field.

### Deletions

- `LegacyRuntimeInput`
- `LegacyOutputInput`
- `isExportRuntimeResources`
- `resolveCapability`
- `resolveRuntimeResources`

### Function body

`selectExportExecutionPlan` reads `input.capability` and `input.runtime`
directly. The remaining pipeline is unchanged:
`deriveExportPolicy(capability, image, intent, runtime)` →
`chooseProfile(policy, capability)` → `synthesizeProfile(profileName, policy)` →
assemble `ExportExecutionPlan`.

`getCapabilityVectorSnapshot` is no longer imported by this module; the import
is removed. (`classifyUserAgent` was imported only for legacy synthesis and is
also removed if unused after the change.)

### Boundaries / contracts

- `selectExportExecutionPlan` is app-internal (`src/lib/export`, not a published
  package export). Tightening its signature is safe; all callers are in-repo.
- Each production call site already resolves its own `CapabilityVector` (via
  `detectCapabilityVector()` or `getCapabilityVectorSnapshot()` at the call
  site) and its own `ExportRuntimeResources` (via
  `snapshotExportRuntimeResources`). Responsibility for measuring capability
  stays at the call site, where it belongs; the planner is now a pure mapping
  from facts to plan.

## Test Plan

`src/lib/export/execution-profile.test.ts`: rewrite the cases that currently use
the legacy shape so they pass explicit `capability: CapabilityVector` and
`runtime: ExportRuntimeResources` literals.

- Cases that exercised device classes via `platform.userAgent` strings are
  rewritten to set `webKitClass` directly (e.g. `'webkit-mobile'`,
  `'chromium'`). User-agent → `webKitClass` classification is the responsibility
  of the `capability-vector` tests, not the export-policy tests; this rewrite
  improves separation rather than losing coverage.
- All policy assertions (`rowSlice`, `concurrency`, `maxConcurrency`,
  `outputSink`, `productCopy`, `derivedLabel`, profile name) are preserved
  unchanged. Only the input construction changes.

No production caller changes are expected, because all three already pass the
current shape.

## Verification

- `pnpm test:app` — covers `execution-profile.test.ts` and
  `export-system.test.ts`.
- Lint the touched files (`pnpm lint:check`, or `pnpm lint` for autofix scoped
  to the change).
- Typecheck via the app build path is exercised by `test:app` / `lint:check`;
  the signature tightening will surface any missed caller at compile time.

## Risks & Rollback

- **Risk:** a caller relied implicitly on the global-snapshot fallback inside
  `resolveCapability`. Mitigation: all three production callers already pass
  `capability` explicitly; the compiler will flag any that do not.
- **Risk:** test rewrite accidentally changes asserted behavior. Mitigation:
  keep every assertion identical; change only input construction; the diff
  should show input-shape edits and no expectation edits.
- **Rollback:** single-commit revert; the change is isolated to
  `execution-profile.ts` and its test.
