# Behavior-Preserving Refactor Execution Plan

## Purpose / Big Picture

This refactor improves internal architecture, maintainability, and performance headroom while preserving observable behavior.
The product boundary remains the existing browser-local flow:

```text
single RAW file -> preview -> look or LUT -> compare -> JPEG export
```

This plan is intentionally incremental.
The repository contains several high-risk runtime, color, preview, and export seams, so each milestone must preserve behavior through characterization tests before production code moves.

## Current Behavior Contract

The following behavior is treated as externally observable and must not change without an approved behavior-change entry:

- Public app routes remain file-generated from `src/pages/`, with `/` and `/raw` as current product routes.
- `src/generated-routes.ts` remains generated and must not be edited by hand.
- The root runtime provider stack remains centralized in `src/providers/root-providers.tsx`; the refactor must not recreate QueryClient, Jotai store, or router plumbing.
- `/raw` remains the browser-local RAW lab surface implemented under `src/modules/raw-processor`.
- RAW loading keeps the embedded, quick, and bounded-HQ preview progression when those stages are available.
- Preview may optimize for responsiveness; export remains the authoritative full-resolution path.
- Export stays fail-closed when runtime facts or color graph support cannot prove a correct full-resolution result.
- Export result actions remain explicit user actions: share, download, and copy.
- Ready export results are invalidated by real source or render-graph changes, not by view-only changes such as compare split.
- Custom `.cube` LUT behavior preserves parse errors, contract selection, detached LUT staging, and stored LUT profile selections.
- Online LUT fetches keep their size limit, verification path, abort semantics, and cache behavior.
- Worker protocols and public package exports for `@lumaforge/luma-raw-runtime`, `@lumaforge/luma-color-runtime`, and `@lumaforge/luma-jpeg-runtime` remain compatible.
- Native artifact verification remains explicit; production build must fail if required native runtime artifacts are absent.
- Existing error codes and user-facing toast messages are behavior unless a specific test documents and approves a change.
- Existing deploy scripts, smoke checks, and environment variable meanings are behavior.

No intentional behavior changes are approved for this run.

## Current Architecture Map

- `packages/luma-raw-runtime` owns RAW session creation, preview extraction, decode sessions, processed-window access, native artifact loading, and RAW worker protocol.
- `packages/luma-color-runtime` owns pure color contracts, LUT graph decisions, tone/exposure math, row-band processing, histogram logic, and GLSL snippets.
- `packages/luma-jpeg-runtime` owns bounded row-oriented JPEG encoding and its worker/native boundaries.
- `src/lib/gl` owns the WebGL preview context, shader program setup, and preview rendering pipeline.
- `src/lib/export` owns full-resolution export orchestration, worker client, strip scheduling, resource registry, output sinks, source fingerprints, and JPEG metadata preservation.
- `src/lib/lut` and `src/lib/profiles` adapt app-level LUT parsing, contract persistence, profile catalogs, and online LUT fetching.
- `src/modules/raw-processor` owns the `/raw` product workflow, UI, session model, state atoms, preview pipeline orchestration, export actions, and user-visible status.
- `src/modules/raw-processor/hooks/useRawProcessor.ts` is the largest coupling point.
  It currently mixes RAW loading, preview stage transitions, LUT loading, export readiness, export checkpointing, resource evacuation, export result handoff, recovery, and UI action wiring.

## Proposed Target Architecture

The target shape is not a broad rewrite.
The refactor should reduce the `useRawProcessor` hook into orchestration over narrow domain helpers for the whole user lifecycle, not only export:

- Session model and pure state transitions live in `src/modules/raw-processor/model` or focused services.
- RAW load orchestration remains in the hook, but preview/session transitions move into pure helpers once characterized.
- Embedded, quick, and bounded-HQ preview state transitions are modeled as one lifecycle boundary with display-source selection as an invariant.
- LUT/look and compare interactions remain view/user intent boundaries; render-affecting changes invalidate export while view-only changes do not.
- Export readiness, export state mutation, checkpoint manifest construction, and debug payload shaping move into testable helper modules.
- User action services remain side-effect focused and keep browser API boundaries explicit.
- Runtime package public exports stay unchanged; package-internal moves require package-local public-contract tests before export changes.
- WebGL and full-resolution export remain separate executors with shared intent, not interchangeable implementations.

## Invariants That Must Remain True

- No public behavior changes are allowed in this run.
- Tests must be added or updated before production refactors.
- Generated route files are not edited.
- Imports from `src` use the `~/` alias when crossing source boundaries.
- Preview and export state must remain distinct.
- Export invalidation must remain based on source or render-graph changes.
- View-only interactions must not clear a ready export.
- In-flight export completion must not publish stale results after source or graph changes.
- Native/runtime build guards must continue to fail closed when required artifacts are missing.
- Resource cleanup must not retain full-resolution export blobs or embedded-preview object URLs beyond their intended lifecycle.

## Performance Hypotheses

- The dominant hot paths are RAW decode/session work, WebGL preview rendering, full-resolution strip export, color row-band transforms, JPEG encoding, and export-result materialization.
- This run will not micro-optimize numeric kernels or worker concurrency without profiling evidence.
- Structurally obvious waste is acceptable to remove when tests prove parity, especially duplicated state-transition logic or accidental allocation retention around export results.
- The first milestone focuses on maintainability and behavior pinning, not runtime speed.

## Baseline Results

- `pnpm install --frozen-lockfile`: exit 0.
  `simple-git-hooks` reported a non-fatal worktree `.git/hooks` `ENOTDIR` warning during prepare.
- `pnpm --filter @lumaforge/luma-color-runtime build`: pass.
- `pnpm --filter @lumaforge/luma-jpeg-runtime build`: pass.
- `pnpm --filter @lumaforge/luma-raw-runtime build`: pass.
- `pnpm test:run` before package builds: failed from missing built workspace package/native artifacts and one deploy URL assertion.
- `pnpm test:run` after workspace package builds: 81 files passed, 1 skipped, 3 failed.
  Remaining failures are missing native smoke artifacts for RAW/JPEG runtime plus the deploy URL expectation mismatch in `scripts/deploy/deploy.test.mjs`.
- `pnpm exec tsc --noEmit`: failed because `src/generated-routes.ts` is absent in the fresh worktree.
- `pnpm exec eslint .`: failed with broad pre-existing Markdown/style issues and several test style issues.
- `pnpm build`: failed closed because native RAW and JPEG runtime assets are absent.

Baseline failures are recorded as pre-change failures and must not be attributed to this refactor unless this branch worsens them.

## Milestones

### M0: Reconnaissance and Plan

Intended internal change:
Document current behavior, architecture boundaries, baseline failures, validation gates, and selected first milestone.

Expected behavior:
No production behavior changes.

Validation:
Check git status after writing this plan and commit it separately.

### M1: Characterize and Extract RAW Export State Helpers

Intended internal change:
Move pure export/session state helpers out of `src/modules/raw-processor/hooks/useRawProcessor.ts` into a focused helper module with direct tests.

Expected behavior:
Ready/exporting export-state clearing, render-graph change detection, raw render exposure equality, full-resolution capability mapping, retry manifest shape, checkpoint metric detection, and export failure descriptions remain identical.

Test-first work:
Add a failing test file for the new helper module before moving production code.

Target files:

- Create `src/modules/raw-processor/services/export-state.test.ts`
- Create `src/modules/raw-processor/services/export-state.ts`
- Modify `src/modules/raw-processor/hooks/useRawProcessor.ts`

Validation:

- `pnpm exec vitest run src/modules/raw-processor/services/export-state.test.ts`
- `pnpm exec vitest run src/modules/raw-processor/hooks/useRawProcessor.test.tsx`
- `pnpm exec vitest run src/modules/raw-processor/__tests__/export-system.test.ts src/modules/raw-processor/services/export-result-actions.test.ts`

### M2: Review and Decide Next Seam

Intended internal change:
Use subagent findings and M1 results to select the next safe seam.

Expected behavior:
No additional production changes until a new characterization test is written.

Candidate seams:

- Preview event/state transition reducer for `loadFile`.
- Export job orchestration and checkpoint writer helper.
- Export result materialization diagnostics.
- Runtime package public-contract test gaps.

### M3: Extract Full-Resolution Export Readiness

Intended internal change:
Move full-resolution export readiness derivation out of `useRawProcessor.ts` into a focused `export-readiness.ts` service so the hook consumes one narrow behavior-preserving helper for `canExport`, disabled copy, and the export action guard.

Expected behavior:
Full-resolution export remains fail-closed until the source file, session, quick preview, supported processed-window capability, decoded RAW render exposure, supported style/LUT graph, and safe execution plan are all ready.
Disabled copy precedence remains source/session missing, session-level reason, missing RAW render exposure, then unsafe execution-plan copy.
The export worker must still not start for probing, unsupported, missing exposure, unsupported style/LUT output, or unsafe 100MP iOS blob-handoff paths.

Test-first work:
Add characterization tests for the new readiness helper before moving production logic.

Target files:

- Create `src/modules/raw-processor/services/export-readiness.test.ts`
- Create `src/modules/raw-processor/services/export-readiness.ts`
- Modify `src/modules/raw-processor/hooks/useRawProcessor.ts`

Validation:

- `pnpm exec vitest run src/modules/raw-processor/services/export-readiness.test.ts`
- `pnpm exec vitest run src/modules/raw-processor/services/export-state.test.ts`
- `pnpm exec vitest run src/modules/raw-processor/hooks/useRawProcessor.test.tsx`
- `pnpm exec vitest run src/modules/raw-processor/services/export-readiness.test.ts src/modules/raw-processor/services/export-state.test.ts src/modules/raw-processor/hooks/useRawProcessor.test.tsx src/modules/raw-processor/__tests__/export-system.test.ts src/modules/raw-processor/services/export-result-actions.test.ts src/modules/raw-processor/__tests__/session-derive.test.ts --exclude '.worktrees/**'`
- `pnpm exec eslint src/modules/raw-processor/services/export-readiness.ts src/modules/raw-processor/services/export-readiness.test.ts src/modules/raw-processor/services/export-state.ts src/modules/raw-processor/services/export-state.test.ts src/modules/raw-processor/hooks/useRawProcessor.ts`
- `pnpm exec tsc --noEmit --pretty false`, expected to remain blocked only by the existing missing `src/generated-routes.ts` fresh-worktree baseline.

### M4: Move Export Evacuation Diagnostics to Service Boundary

Intended internal change:
Move resource-evacuation debug payload shaping from `useRawProcessor.ts` into `export-evacuation.ts`.

Expected behavior:
The `lumaforge-export-debug` `resource-evacuated` event keeps the same payload shape, including sanitized registry checks and remaining-live estimated byte diagnostics.
Pre-export resource cleanup, fail-closed evacuation checks, and worker start ordering remain unchanged.

Test-first work:
Add characterization coverage for the exported diagnostics payload helper before moving production logic.

Target files:

- Modify `src/modules/raw-processor/services/export-evacuation.test.ts`
- Modify `src/modules/raw-processor/services/export-evacuation.ts`
- Modify `src/modules/raw-processor/hooks/useRawProcessor.ts`

Validation:

- `pnpm exec vitest run src/modules/raw-processor/services/export-evacuation.test.ts`
- `pnpm exec vitest run src/modules/raw-processor/services/export-evacuation.test.ts src/modules/raw-processor/hooks/useRawProcessor.test.tsx --exclude '.worktrees/**'`
- `pnpm exec eslint src/modules/raw-processor/services/export-evacuation.ts src/modules/raw-processor/services/export-evacuation.test.ts src/modules/raw-processor/hooks/useRawProcessor.ts`

### M5: Extract RAW Preview Session Transitions

Intended internal change:
Move pure preview/session transition updates out of `useRawProcessor.ts` into a focused `preview-session-state.ts` service.

Expected behavior:
Loading a RAW still preserves compare split and any staged custom LUT, enters compare mode, marks quick and bounded-HQ previews as loading, and probes export capability.
Embedded preview readiness still publishes an object URL backed display source without metadata changes.
Quick preview readiness still upgrades display source, stores decoded metadata, updates source facts and render state, and starts export capability probing from the hook.
Bounded-HQ readiness still becomes the preferred display source.
Quick preview failure still fails both quick and bounded-HQ preview state, falls back to embedded display when available, marks render failed, blocks full-resolution export with `Quick preview did not complete.`, and preserves existing user-facing error/toast behavior from the hook.
Bounded-HQ failure or skip still leaves quick preview usable and does not create a global load error.

Test-first work:
Add characterization tests for the pure transition helper before moving hook-local update logic.

Target files:

- Create `src/modules/raw-processor/services/preview-session-state.test.ts`
- Create `src/modules/raw-processor/services/preview-session-state.ts`
- Modify `src/modules/raw-processor/hooks/useRawProcessor.ts`

Validation:

- `pnpm exec vitest run src/modules/raw-processor/services/preview-session-state.test.ts`
- `pnpm exec vitest run src/modules/raw-processor/services/preview-session-state.test.ts src/modules/raw-processor/hooks/useRawProcessor.test.tsx src/modules/raw-processor/__tests__/preview-pipeline.test.ts src/modules/raw-processor/__tests__/session-derive.test.ts --exclude '.worktrees/**'`
- `pnpm exec eslint src/modules/raw-processor/services/preview-session-state.ts src/modules/raw-processor/services/preview-session-state.test.ts src/modules/raw-processor/hooks/useRawProcessor.ts`

### M6: Share Compare Split Math Across Hook and UI

Intended internal change:
Move compare split clamping and pointer-to-split math into a small pure `compare-split.ts` service used by both `useRawProcessor.ts` and `CompareSplitHandle.tsx`.

Expected behavior:
Compare split remains clamped to `0.05..0.95`, non-finite values still fall back to `0.5`, unusable pointer geometry still falls back to `0.5`, pointer and keyboard interactions keep the same values, and committed compare split changes remain view-only for export invalidation.

Test-first work:
Add characterization tests for the shared pure helper before wiring hook/UI imports.

Target files:

- Create `src/modules/raw-processor/services/compare-split.test.ts`
- Create `src/modules/raw-processor/services/compare-split.ts`
- Modify `src/modules/raw-processor/components/CompareSplitHandle.tsx`
- Modify `src/modules/raw-processor/hooks/useRawProcessor.ts`

Validation:

- `pnpm exec vitest run src/modules/raw-processor/services/compare-split.test.ts src/modules/raw-processor/components/CompareSplitHandle.test.tsx src/modules/raw-processor/hooks/useRawProcessor.test.tsx --exclude '.worktrees/**'`
- `pnpm exec eslint src/modules/raw-processor/services/compare-split.ts src/modules/raw-processor/services/compare-split.test.ts src/modules/raw-processor/components/CompareSplitHandle.tsx src/modules/raw-processor/hooks/useRawProcessor.ts`

### M7: Extract RAW Session Factory

Intended internal change:
Move the initial RAW session shape from `useImageSession.ts` into a pure model factory so hook code owns persistence while the model owns default session data.

Expected behavior:
New RAW sessions still use `crypto.randomUUID()` and `Date.now()`, keep the existing lowercased extension derivation, default support to `experimental`, start all previews idle with `displaySource: none`, enter compare view with split `0.5`, retain any active custom style and LUT profile selection passed by the RAW loader, and keep export defaults unchanged.

Test-first work:
Add characterization tests for the pure factory before changing `useImageSession.ts`.

Target files:

- Create `src/modules/raw-processor/model/session-factory.test.ts`
- Create `src/modules/raw-processor/model/session-factory.ts`
- Modify `src/modules/raw-processor/hooks/useImageSession.ts`

Validation:

- `pnpm exec vitest run src/modules/raw-processor/model/session-factory.test.ts src/modules/raw-processor/hooks/useRawProcessor.test.tsx --exclude '.worktrees/**'`
- `pnpm exec eslint src/modules/raw-processor/model/session-factory.ts src/modules/raw-processor/model/session-factory.test.ts src/modules/raw-processor/hooks/useImageSession.ts`

### M8: Extract Look Session State Transitions

Intended internal change:
Move pure active-look session mutations out of `useRawProcessor.ts` into a focused `look-session-state.ts` service.
The hook should continue to own side effects, global processing params, LUT parsing/fetching, and export graph invalidation decisions, while the service owns how `ImageSession.activeStyle`, `lutProfileSelection`, active intensity, and ready export result clearing are applied.

Expected behavior:
Loading a custom LUT still stores the custom style and profile-selection state on the active session and clears ready/exporting results when the render graph changes.
Selecting a LUT contract still preserves the current custom intensity when one is already active.
Selecting a builtin style still replaces any custom look, clears LUT profile selection, and clears export results only when the render graph actually changes.
Changing intensity still updates the active style when present and preserves a ready export when the requested level is already active.
Clearing LUT/look still removes active style and LUT profile selection, keeps neutral params, emits the existing toast from the hook, and preserves a ready export when no render-graph input changed.

Test-first work:
Add characterization tests for the pure look/session helper before rewiring hook code.

Target files:

- Create `src/modules/raw-processor/services/look-session-state.test.ts`
- Create `src/modules/raw-processor/services/look-session-state.ts`
- Modify `src/modules/raw-processor/hooks/useRawProcessor.ts`

Validation:

- `pnpm exec vitest run src/modules/raw-processor/services/look-session-state.test.ts`
- `pnpm exec vitest run src/modules/raw-processor/services/look-session-state.test.ts src/modules/raw-processor/hooks/useRawProcessor.test.tsx src/modules/raw-processor/__tests__/style-system.test.ts --exclude '.worktrees/**'`
- `pnpm exec eslint src/modules/raw-processor/services/look-session-state.ts src/modules/raw-processor/services/look-session-state.test.ts src/modules/raw-processor/hooks/useRawProcessor.ts`

### M9: Extract View Session State Transitions

Intended internal change:
Move pure view-mode and committed compare-split session mutations out of `useRawProcessor.ts` into a focused `view-session-state.ts` service.
The hook should continue to own Jotai processing params and the UI should continue to own preview-only drag rendering.

Expected behavior:
`setViewMode` still updates both processing params and `session.viewState.mode`.
`setCompareSplit` still clamps through the shared compare split helper, updates processing params, and mirrors the committed split into `session.viewState.compareSplit`.
View-only changes remain non-render-graph changes and must not clear ready export results.
Loading a new RAW still forces compare mode while preserving the previous committed compare split through the existing load transition.

Test-first work:
Add characterization tests for the pure view/session helper and hook-level `setViewMode` sync before rewiring hook code.

Target files:

- Create `src/modules/raw-processor/services/view-session-state.test.ts`
- Create `src/modules/raw-processor/services/view-session-state.ts`
- Modify `src/modules/raw-processor/hooks/useRawProcessor.test.tsx`
- Modify `src/modules/raw-processor/hooks/useRawProcessor.ts`

Validation:

- `pnpm exec vitest run src/modules/raw-processor/services/view-session-state.test.ts`
- `pnpm exec vitest run src/modules/raw-processor/services/view-session-state.test.ts src/modules/raw-processor/services/compare-split.test.ts src/modules/raw-processor/hooks/useRawProcessor.test.tsx src/modules/raw-processor/components/CompareSplitHandle.test.tsx --exclude '.worktrees/**'`
- `pnpm exec eslint src/modules/raw-processor/services/view-session-state.ts src/modules/raw-processor/services/view-session-state.test.ts src/modules/raw-processor/hooks/useRawProcessor.ts src/modules/raw-processor/hooks/useRawProcessor.test.tsx`

### M10: Extract RAW Load Preparation State

Intended internal change:
Move the pure data preparation at the start of `loadFile` into `raw-load-preparation.ts`.
The hook should continue to own unsupported-file checks, runtime session setup, abort/cleanup refs, preview events, atoms, and side effects.

Expected behavior:
Loading or replacing a RAW still preserves the previously committed compare split after clamping.
Detached/custom LUT state still carries into the new RAW session.
Replacing a RAW while a custom LUT is active still preserves the active custom intensity; builtin/neutral sources still reset custom intensity to the LUT default.
The load-start processing param patch still forces compare mode, clears builtin preset, sets `styleKind` to `custom` only when a LUT exists, maps custom intensity through the existing intensity mapper, and preserves unrelated params such as user tone by only returning a partial patch.

Test-first work:
Add characterization tests for the pure load-preparation helper before rewiring `loadFile`.

Target files:

- Create `src/modules/raw-processor/services/raw-load-preparation.test.ts`
- Create `src/modules/raw-processor/services/raw-load-preparation.ts`
- Modify `src/modules/raw-processor/hooks/useRawProcessor.ts`

Validation:

- `pnpm exec vitest run src/modules/raw-processor/services/raw-load-preparation.test.ts`
- `pnpm exec vitest run src/modules/raw-processor/services/raw-load-preparation.test.ts src/modules/raw-processor/hooks/useRawProcessor.test.tsx src/modules/raw-processor/services/preview-session-state.test.ts src/modules/raw-processor/services/look-session-state.test.ts src/modules/raw-processor/services/view-session-state.test.ts --exclude '.worktrees/**'`
- `pnpm exec eslint src/modules/raw-processor/services/raw-load-preparation.ts src/modules/raw-processor/services/raw-load-preparation.test.ts src/modules/raw-processor/hooks/useRawProcessor.ts`

## Validation Gates

Every milestone must pass its targeted tests or record a pre-existing failure.
Before claiming the branch is ready, run the full relevant suite again:

- `pnpm test:run`
- `pnpm exec tsc --noEmit`, after generating routes or documenting why route generation is blocked
- `pnpm exec eslint .` or the exact lint gate requested by the repository, with pre-existing failures separated
- `pnpm build`, after native artifacts exist or with the existing fail-closed native-asset gate recorded
- Package-local `build`, `typecheck`, and `test` commands for touched packages
- Browser validation for user-visible `/raw` behavior changes

This run should not require browser validation unless a milestone unexpectedly changes UI interaction or rendering behavior.

## Decision Log

- 2026-05-04: Use repo-local `.worktrees/refactor-behavior-preserving-architecture` for isolation, matching repository policy.
- 2026-05-04: Treat the fresh-worktree test/build failures as baseline setup failures until evidence shows this branch introduced them.
- 2026-05-04: Do not run `pnpm lint` with auto-fix during baseline because it can mutate broad unrelated Markdown files; use non-mutating `pnpm exec eslint .` for the baseline record.
- 2026-05-04: Select a narrow first milestone around export state helpers because `useRawProcessor.ts` is the largest coupling point and the target behavior can be characterized without UI changes.
- 2026-05-04: Keep native/runtime artifact generation out of M1 because M1 does not touch native package code and native builds are an environment gate, not a prerequisite for extracting pure app helpers.
- 2026-05-04: Correct targeted Vitest commands to omit `--runInBand`; this repo's installed Vitest rejects that option.
- 2026-05-04: Reconnaissance confirmed the high-risk cross-boundary surfaces are route-provider wiring, `/raw` state to export graph, preview/export contract parity, package-root API exports, OPFS checkpoint manifests, and online LUT fetch/cache behavior.
- 2026-05-04: Performance review identified RAW session reuse, preview staging, WebGL upload/rendering, full-resolution strip export, row-band color transforms, JPEG worker transfer/copy behavior, and export-result materialization as hot paths; M1 deliberately avoids changing those executors.
- 2026-05-04: Select full-resolution export readiness as the next seam because it removes duplicated hook-only guard logic while preserving the preview/export boundary and existing fail-closed behavior.
- 2026-05-04: Keep unsafe export readiness using the existing default `balanced` execution-plan probe; changing it to the requested export fidelity would be a behavior change and is out of scope.
- 2026-05-04: After user correction, broaden the refactor track from export-specific seams to the complete `/raw` lifecycle. Select preview session transitions as the next non-export seam because the behavior is already partly characterized at hook level and can be isolated without changing runtime, UI, or export execution.
- 2026-05-04: Select compare split math as the next seam because it is a view-only lifecycle boundary currently duplicated between hook and UI, and it can be shared without changing compare interaction behavior or export invalidation semantics.
- 2026-05-04: Select RAW session creation as the next seam because it is part of the upload/load lifecycle, has a pure default data shape, and lets `useImageSession.ts` become a thin state adapter without touching runtime preview behavior.
- 2026-05-04: Preserve existing no-dot filename extension derivation in RAW sessions (`RAWFILE` becomes `rawfile`). This is odd but observable through session source facts, so changing it is out of scope.
- 2026-05-04: Select look/LUT session state transitions as the next full-lifecycle seam because style application is a render-affecting user action currently mixed with hook side effects, but its session mutation rules are pure and already partially characterized by hook tests.
- 2026-05-04: Select view/session state transitions as the next seam because compare/view interactions are view-only lifecycle behavior, already share split math, and can be isolated without touching preview rendering or export invalidation.
- 2026-05-04: Select RAW load preparation as the next seam because upload/replacement behavior mixes compare, detached LUT, retained custom intensity, and initial processing param patches inside `loadFile`, but those rules are pure and can be characterized without touching async runtime or cleanup behavior.

## Rollback Plan

- Revert the latest milestone commit if targeted tests fail in a way that cannot be corrected without behavior change.
- If a helper extraction creates uncertainty, keep the original hook logic and only retain characterization tests.
- If an intentional behavior change becomes necessary, stop implementation, document the proposed change here, and request approval before modifying production behavior.
- Keep commits small enough that each milestone can be reverted independently.

## Progress Log

- 2026-05-04: Created isolated worktree and installed dependencies.
- 2026-05-04: Ran baseline package builds and baseline test/type/lint/build checks.
- 2026-05-04: Identified `useRawProcessor.ts` as the first bounded refactor seam.
- 2026-05-04: Added characterization tests for exported helper behavior in `export-state.test.ts`.
- 2026-05-04: Extracted pure export-state helpers to `src/modules/raw-processor/services/export-state.ts`.
- 2026-05-04: Extended `useRawProcessor` coverage to assert file-backed export output cleanup is deferred for compare-split changes and runs after render-graph invalidation.
- 2026-05-04: Targeted validation passed: `pnpm exec vitest run src/modules/raw-processor/services/export-state.test.ts src/modules/raw-processor/hooks/useRawProcessor.test.tsx src/modules/raw-processor/__tests__/export-system.test.ts src/modules/raw-processor/services/export-result-actions.test.ts`.
- 2026-05-04: Targeted lint passed for changed files with `pnpm exec eslint src/modules/raw-processor/services/export-state.ts src/modules/raw-processor/services/export-state.test.ts src/modules/raw-processor/hooks/useRawProcessor.ts`.
- 2026-05-04: Full `pnpm test:run` still fails only on the recorded baseline blockers: missing RAW/JPEG native smoke artifacts and the deploy URL expectation mismatch.
- 2026-05-04: Final behavior, architecture, performance, and reliability/security reviews found no regressions in M1.
- 2026-05-04: Residual risk remains pre-existing and behavior-preserved: checkpoint metrics are accepted by `kind === 'checkpoint'` only.
- 2026-05-04: M2 review selected the full-resolution export readiness seam after explorer review of `useRawProcessor.ts` and nearby service tests.
- 2026-05-04: Added RED characterization tests for `deriveFullResExportReadiness`; initial run failed because the helper did not exist.
- 2026-05-04: Extracted full-resolution export readiness logic to `export-readiness.ts`, removed hook-local duplicate readiness helpers, and deleted the unreachable post-readiness capability guard from `exportImage`.
- 2026-05-04: During hook integration, targeted tests exposed a variable-shadowing TDZ in the refactor; fixed by separating the pre-export session snapshot from the post-worker completed session.
- 2026-05-04: Behavior review found no M3 regressions and noted residual branch-combination coverage is still covered at hook/model level.
- 2026-05-04: Architecture review found the hook should not cast after a boolean readiness check and that readiness policy should not make `export-state.ts` a catch-all.
- 2026-05-04: Refined `deriveFullResExportReadiness` into a typed discriminated union carrying ready-state values and moved readiness policy into `export-readiness.ts`.
- 2026-05-04: Performance/reliability review noted a duplicate session-level export derivation in the first helper draft; the typed helper now returns `canExport: true` directly after the existing disabled-reason, exposure, and unsafe-plan gates pass.
- 2026-05-04: Targeted validation passed: `pnpm exec vitest run src/modules/raw-processor/services/export-readiness.test.ts src/modules/raw-processor/services/export-state.test.ts src/modules/raw-processor/hooks/useRawProcessor.test.tsx src/modules/raw-processor/__tests__/export-system.test.ts src/modules/raw-processor/services/export-result-actions.test.ts src/modules/raw-processor/__tests__/session-derive.test.ts --exclude '.worktrees/**'`.
- 2026-05-04: Changed-file lint passed with `pnpm exec eslint src/modules/raw-processor/services/export-readiness.ts src/modules/raw-processor/services/export-readiness.test.ts src/modules/raw-processor/services/export-state.ts src/modules/raw-processor/services/export-state.test.ts src/modules/raw-processor/hooks/useRawProcessor.ts`.
- 2026-05-04: `pnpm exec tsc --noEmit --pretty false` remains blocked only by the recorded fresh-worktree `src/generated-routes.ts` absence after fixing new test literal-type issues.
- 2026-05-04: Full `pnpm test:run` after M3 still fails only on the recorded baseline blockers: missing RAW/JPEG native smoke artifacts and the deploy URL expectation mismatch. Newly discovered `export-readiness.test.ts` passes in full-suite discovery.
- 2026-05-04: Added RED characterization for resource evacuation debug payload shaping in `export-evacuation.test.ts`; initial run failed because the service helper did not exist.
- 2026-05-04: Moved resource evacuation debug payload shaping from `useRawProcessor.ts` to `export-evacuation.ts`.
- 2026-05-04: M4 targeted validation passed: `pnpm exec vitest run src/modules/raw-processor/services/export-evacuation.test.ts src/modules/raw-processor/hooks/useRawProcessor.test.tsx --exclude '.worktrees/**'`.
- 2026-05-04: M4 changed-file lint passed with `pnpm exec eslint src/modules/raw-processor/services/export-evacuation.ts src/modules/raw-processor/services/export-evacuation.test.ts src/modules/raw-processor/hooks/useRawProcessor.ts`.
- 2026-05-04: Combined M3/M4 targeted validation passed: `pnpm exec vitest run src/modules/raw-processor/services/export-readiness.test.ts src/modules/raw-processor/services/export-state.test.ts src/modules/raw-processor/services/export-evacuation.test.ts src/modules/raw-processor/hooks/useRawProcessor.test.tsx src/modules/raw-processor/__tests__/export-system.test.ts src/modules/raw-processor/services/export-result-actions.test.ts src/modules/raw-processor/__tests__/session-derive.test.ts --exclude '.worktrees/**'`.
- 2026-05-04: `pnpm exec tsc --noEmit --pretty false` remains blocked only by the recorded fresh-worktree `src/generated-routes.ts` absence after M4.
- 2026-05-04: Final `pnpm test:run` after M4 reported 83 passed files, 1 skipped file, 1021 passed tests, and 8 skipped tests. It still fails only on recorded baseline blockers: missing RAW/JPEG native smoke artifacts and the deploy URL assertion mismatch.
- 2026-05-04: Final `pnpm exec eslint .` still fails on recorded repo-wide baseline lint issues, mostly Markdown formatting plus existing test style issues, with 415 errors.
- 2026-05-04: Final `pnpm build` still fails closed on recorded missing native RAW/JPEG runtime assets.
- 2026-05-04: Re-scoped the next milestone to full `/raw` usage lifecycle and added M5 for RAW preview session transitions before any non-doc production edits.
- 2026-05-04: Added RED characterization tests for pure RAW preview session transitions in `preview-session-state.test.ts`; first run failed because the helper module did not exist, then the stubbed helper failed all seven behavior assertions.
- 2026-05-04: Extracted preview load-start, preview-ready, quick-failed, bounded-HQ-failed, and bounded-HQ-skipped session transitions into `preview-session-state.ts` and rewired `useRawProcessor.ts` to call those helpers while leaving async guards, status/progress updates, toasts, and runtime cleanup in the hook.
- 2026-05-04: M5 targeted validation passed: `pnpm exec vitest run src/modules/raw-processor/services/preview-session-state.test.ts src/modules/raw-processor/hooks/useRawProcessor.test.tsx src/modules/raw-processor/__tests__/preview-pipeline.test.ts src/modules/raw-processor/__tests__/session-derive.test.ts --exclude '.worktrees/**'` with 98 passing tests.
- 2026-05-04: M5 combined lifecycle/export targeted validation passed: `pnpm exec vitest run src/modules/raw-processor/services/preview-session-state.test.ts src/modules/raw-processor/services/export-readiness.test.ts src/modules/raw-processor/services/export-state.test.ts src/modules/raw-processor/services/export-evacuation.test.ts src/modules/raw-processor/hooks/useRawProcessor.test.tsx src/modules/raw-processor/__tests__/preview-pipeline.test.ts src/modules/raw-processor/__tests__/session-derive.test.ts src/modules/raw-processor/__tests__/export-system.test.ts src/modules/raw-processor/services/export-result-actions.test.ts --exclude '.worktrees/**'` with 150 passing tests.
- 2026-05-04: M5 changed-file lint passed with `pnpm exec eslint src/modules/raw-processor/services/preview-session-state.ts src/modules/raw-processor/services/preview-session-state.test.ts src/modules/raw-processor/hooks/useRawProcessor.ts`.
- 2026-05-04: `pnpm exec tsc --noEmit --pretty false` after M5 remains blocked only by the recorded fresh-worktree `src/generated-routes.ts` absence.
- 2026-05-04: Added M6 to remove duplicated compare split math across hook and UI while preserving view-only compare behavior.
- 2026-05-04: M5 behavior review found no regressions. Independent reviewer validation passed `pnpm test:run src/modules/raw-processor/services/preview-session-state.test.ts src/modules/raw-processor/__tests__/preview-pipeline.test.ts` with 17 passing tests and recorded only the existing `generated-routes` typecheck blocker as residual risk.
- 2026-05-04: M5 architecture/performance review found no over-abstraction, dependency inversion, circular import, stale-async, or performance issues. Reviewer validation passed focused preview-session-state tests, changed-file ESLint, and `git diff --check be5b2a6^ be5b2a6`.
- 2026-05-04: Added RED characterization tests for shared compare split math in `compare-split.test.ts`; first run failed because the helper module did not exist.
- 2026-05-04: Extracted shared compare split clamping and pointer geometry into `compare-split.ts`, rewired `CompareSplitHandle.tsx` and `useRawProcessor.ts`, and preserved component re-exports for existing internal imports/tests.
- 2026-05-04: M6 targeted validation first caught a migration miss where `Home`/`End` keys still referenced removed component-local split bounds; fixed by exporting shared compare split bounds from the helper.
- 2026-05-04: M6 targeted validation passed: `pnpm exec vitest run src/modules/raw-processor/services/compare-split.test.ts src/modules/raw-processor/components/CompareSplitHandle.test.tsx src/modules/raw-processor/hooks/useRawProcessor.test.tsx --exclude '.worktrees/**'` with 85 passing tests.
- 2026-05-04: M6 changed-file lint passed with `pnpm exec eslint src/modules/raw-processor/services/compare-split.ts src/modules/raw-processor/services/compare-split.test.ts src/modules/raw-processor/components/CompareSplitHandle.tsx src/modules/raw-processor/hooks/useRawProcessor.ts`.
- 2026-05-04: M6 combined lifecycle/export targeted validation passed: `pnpm exec vitest run src/modules/raw-processor/services/compare-split.test.ts src/modules/raw-processor/services/preview-session-state.test.ts src/modules/raw-processor/components/CompareSplitHandle.test.tsx src/modules/raw-processor/hooks/useRawProcessor.test.tsx src/modules/raw-processor/__tests__/preview-pipeline.test.ts src/modules/raw-processor/__tests__/session-derive.test.ts src/modules/raw-processor/services/export-readiness.test.ts src/modules/raw-processor/services/export-state.test.ts src/modules/raw-processor/services/export-evacuation.test.ts --exclude '.worktrees/**'` with 132 passing tests.
- 2026-05-04: `pnpm exec tsc --noEmit --pretty false` after M6 remains blocked only by the recorded fresh-worktree `src/generated-routes.ts` absence.
- 2026-05-04: Post-commit M6 targeted validation passed: `pnpm exec vitest run src/modules/raw-processor/services/compare-split.test.ts src/modules/raw-processor/components/CompareSplitHandle.test.tsx src/modules/raw-processor/hooks/useRawProcessor.test.tsx --exclude '.worktrees/**'` with 85 passing tests.
- 2026-05-04: Added M7 to extract RAW session creation into a pure model factory before changing `useImageSession.ts`.
- 2026-05-04: M6 behavior/architecture review found no regressions in clamp range, non-finite fallback, Home/End keys, keyboard steps, pointer geometry, component re-exports, or view-only export invalidation. Reviewer validation passed the 85-test compare/hook suite, changed-file ESLint, and `git diff --check d0337b4^ d0337b4`.
- 2026-05-04: Added RED characterization tests for `createImageSession`; first run failed because `session-factory.ts` did not exist.
- 2026-05-04: Extracted RAW session creation from `useImageSession.ts` into `model/session-factory.ts`, leaving `useImageSession.ts` as the Jotai state adapter.
- 2026-05-04: M7 initial validation corrected a mistaken test assumption: no-dot filenames currently derive the whole lowercased filename as `sourceFile.extension`, so the characterization was updated to preserve that behavior.
- 2026-05-04: M7 targeted validation passed: `pnpm exec vitest run src/modules/raw-processor/model/session-factory.test.ts src/modules/raw-processor/hooks/useRawProcessor.test.tsx --exclude '.worktrees/**'` with 74 passing tests.
- 2026-05-04: M7 changed-file lint passed with `pnpm exec eslint src/modules/raw-processor/model/session-factory.ts src/modules/raw-processor/model/session-factory.test.ts src/modules/raw-processor/hooks/useImageSession.ts`.
- 2026-05-04: M7 combined lifecycle targeted validation passed: `pnpm exec vitest run src/modules/raw-processor/model/session-factory.test.ts src/modules/raw-processor/services/compare-split.test.ts src/modules/raw-processor/services/preview-session-state.test.ts src/modules/raw-processor/components/CompareSplitHandle.test.tsx src/modules/raw-processor/hooks/useRawProcessor.test.tsx src/modules/raw-processor/__tests__/preview-pipeline.test.ts src/modules/raw-processor/__tests__/session-derive.test.ts --exclude '.worktrees/**'` with 115 passing tests.
- 2026-05-04: `pnpm exec tsc --noEmit --pretty false` after M7 remains blocked only by the recorded fresh-worktree `src/generated-routes.ts` absence after fixing new test-only type issues.
- 2026-05-04: M7 behavior/architecture review found no regressions in UUID/time generation, source extension derivation, preview/render/export/view defaults, retained active style, retained LUT profile selection, or Jotai adapter boundary. Reviewer validation passed the 74-test session-factory/useRawProcessor suite.
- 2026-05-04: Post-M7 combined targeted validation passed: `pnpm exec vitest run src/modules/raw-processor/model/session-factory.test.ts src/modules/raw-processor/services/compare-split.test.ts src/modules/raw-processor/services/preview-session-state.test.ts src/modules/raw-processor/components/CompareSplitHandle.test.tsx src/modules/raw-processor/hooks/useRawProcessor.test.tsx src/modules/raw-processor/__tests__/preview-pipeline.test.ts src/modules/raw-processor/__tests__/session-derive.test.ts src/modules/raw-processor/services/export-readiness.test.ts src/modules/raw-processor/services/export-state.test.ts src/modules/raw-processor/services/export-evacuation.test.ts src/modules/raw-processor/__tests__/export-system.test.ts src/modules/raw-processor/services/export-result-actions.test.ts --exclude '.worktrees/**'` with 167 passing tests.
- 2026-05-04: Post-M7 changed-file ESLint passed across touched lifecycle helper/hook/component files.
- 2026-05-04: Final `pnpm test:run` still fails only on recorded baseline blockers: missing RAW/JPEG native smoke artifacts and deploy URL assertion mismatch. Current totals were 86 passed files, 1 skipped file, 1035 passed tests, and 8 skipped tests, with 3 baseline failures.
- 2026-05-04: Final `pnpm exec eslint .` still fails on recorded repo-wide baseline lint issues, mainly Markdown formatting and existing test style issues, with 415 errors.
- 2026-05-04: Final `pnpm build` still fails closed on recorded missing native RAW/JPEG runtime assets.
- 2026-05-04: Added M8 to extract pure look/LUT session state transitions while leaving parsing/fetching/toasts/global params in `useRawProcessor.ts`.
- 2026-05-04: Added RED characterization tests for pure look session transitions in `look-session-state.test.ts`; first run failed because the helper module did not exist.
- 2026-05-04: Extracted active look application, active look clearing, intensity mutation, and custom-intensity preservation into `look-session-state.ts`; rewired `useRawProcessor.ts` without moving LUT parsing/fetching/toasts or global processing params.
- 2026-05-04: M8 targeted validation passed: `pnpm exec vitest run src/modules/raw-processor/services/look-session-state.test.ts src/modules/raw-processor/hooks/useRawProcessor.test.tsx src/modules/raw-processor/__tests__/style-system.test.ts --exclude '.worktrees/**'` with 82 passing tests.
- 2026-05-04: M8 changed-file lint passed with `pnpm exec eslint src/modules/raw-processor/services/look-session-state.ts src/modules/raw-processor/services/look-session-state.test.ts src/modules/raw-processor/hooks/useRawProcessor.ts`.
- 2026-05-04: M8 combined lifecycle/export targeted validation passed: `pnpm exec vitest run src/modules/raw-processor/services/look-session-state.test.ts src/modules/raw-processor/model/session-factory.test.ts src/modules/raw-processor/services/compare-split.test.ts src/modules/raw-processor/services/preview-session-state.test.ts src/modules/raw-processor/components/CompareSplitHandle.test.tsx src/modules/raw-processor/hooks/useRawProcessor.test.tsx src/modules/raw-processor/__tests__/preview-pipeline.test.ts src/modules/raw-processor/__tests__/session-derive.test.ts src/modules/raw-processor/__tests__/style-system.test.ts src/modules/raw-processor/services/export-readiness.test.ts src/modules/raw-processor/services/export-state.test.ts src/modules/raw-processor/services/export-evacuation.test.ts src/modules/raw-processor/__tests__/export-system.test.ts src/modules/raw-processor/services/export-result-actions.test.ts --exclude '.worktrees/**'` with 178 passing tests.
- 2026-05-04: `pnpm exec tsc --noEmit --pretty false` after M8 remains blocked only by the recorded fresh-worktree `src/generated-routes.ts` absence.
- 2026-05-04: M8 behavior review found no behavior-changing findings. Reviewer noted existing hook tests cover LUT load/profile selection, detached LUT across RAW replacement, toast/fetch ownership, export invalidation on intensity, and `clearLUT`/repeated controls preserving ready export.
- 2026-05-04: M8 architecture/performance review found no over-abstraction, circular dependency, export-state semantic drift, allocation risk, or stale-state risk. Reviewer noted `look-session-state.ts` owns only pure `ImageSession` look mutations and leaves side-effect/invalidation decisions in the hook.
- 2026-05-04: Added M9 for pure view/session state transitions and hook-level `setViewMode` characterization.
- 2026-05-04: Added RED characterization tests for pure view session transitions in `view-session-state.test.ts`; first run failed because the helper module did not exist.
- 2026-05-04: Added hook characterization for `setViewMode` and committed `setCompareSplit` keeping processing params and session view state synchronized.
- 2026-05-04: Extracted committed view-mode and compare-split session mutations into `view-session-state.ts`, leaving Jotai params and preview-only UI drag rendering outside the service.
- 2026-05-04: M9 targeted validation passed: `pnpm exec vitest run src/modules/raw-processor/services/view-session-state.test.ts src/modules/raw-processor/services/compare-split.test.ts src/modules/raw-processor/hooks/useRawProcessor.test.tsx src/modules/raw-processor/components/CompareSplitHandle.test.tsx --exclude '.worktrees/**'` with 90 passing tests after adding committed compare-split hook sync coverage.
- 2026-05-04: M9 changed-file lint passed with `pnpm exec eslint src/modules/raw-processor/services/view-session-state.ts src/modules/raw-processor/services/view-session-state.test.ts src/modules/raw-processor/hooks/useRawProcessor.ts src/modules/raw-processor/hooks/useRawProcessor.test.tsx`.
- 2026-05-04: M9 combined lifecycle/export targeted validation passed: `pnpm exec vitest run src/modules/raw-processor/services/view-session-state.test.ts src/modules/raw-processor/services/look-session-state.test.ts src/modules/raw-processor/model/session-factory.test.ts src/modules/raw-processor/services/compare-split.test.ts src/modules/raw-processor/services/preview-session-state.test.ts src/modules/raw-processor/components/CompareSplitHandle.test.tsx src/modules/raw-processor/hooks/useRawProcessor.test.tsx src/modules/raw-processor/__tests__/preview-pipeline.test.ts src/modules/raw-processor/__tests__/session-derive.test.ts src/modules/raw-processor/__tests__/style-system.test.ts src/modules/raw-processor/services/export-readiness.test.ts src/modules/raw-processor/services/export-state.test.ts src/modules/raw-processor/services/export-evacuation.test.ts src/modules/raw-processor/__tests__/export-system.test.ts src/modules/raw-processor/services/export-result-actions.test.ts --exclude '.worktrees/**'` with 182 passing tests.
- 2026-05-04: `pnpm exec tsc --noEmit --pretty false` after M9 remains blocked only by the recorded fresh-worktree `src/generated-routes.ts` absence.
- 2026-05-04: M9 behavior review found no regressions and confirmed view-only drag rendering remains in UI/pipeline code, not the helper.
- 2026-05-04: M9 architecture/performance review found no over-abstraction, stale-state, allocation hot-path, dependency-direction, or circular-import risk. Reviewer noted double clamping is redundant but safe because both paths use the same shared compare helper.
- 2026-05-04: Added M10 for pure RAW load preparation state while leaving runtime session setup, abort/cleanup refs, preview events, and side effects in `useRawProcessor.ts`.
- 2026-05-04: Added RED characterization tests for RAW load preparation in `raw-load-preparation.test.ts`; first run failed because the helper module did not exist.
- 2026-05-04: Extracted compare split retention, detached/custom LUT retention, custom intensity preservation, and load-start processing param patch derivation into `raw-load-preparation.ts`.
- 2026-05-04: M10 targeted validation passed: `pnpm exec vitest run src/modules/raw-processor/services/raw-load-preparation.test.ts src/modules/raw-processor/hooks/useRawProcessor.test.tsx src/modules/raw-processor/services/preview-session-state.test.ts src/modules/raw-processor/services/look-session-state.test.ts src/modules/raw-processor/services/view-session-state.test.ts --exclude '.worktrees/**'` with 94 passing tests after adding unsupported-file early-return coverage.
- 2026-05-04: M10 changed-file lint initially caught import-sort issues in the new helper/test; targeted `pnpm exec eslint --fix src/modules/raw-processor/services/raw-load-preparation.ts src/modules/raw-processor/services/raw-load-preparation.test.ts` resolved them. Final changed-file lint passed with `pnpm exec eslint src/modules/raw-processor/services/raw-load-preparation.ts src/modules/raw-processor/services/raw-load-preparation.test.ts src/modules/raw-processor/hooks/useRawProcessor.ts`.
- 2026-05-04: M10 combined lifecycle/export targeted validation passed: `pnpm exec vitest run src/modules/raw-processor/services/raw-load-preparation.test.ts src/modules/raw-processor/services/view-session-state.test.ts src/modules/raw-processor/services/look-session-state.test.ts src/modules/raw-processor/model/session-factory.test.ts src/modules/raw-processor/services/compare-split.test.ts src/modules/raw-processor/services/preview-session-state.test.ts src/modules/raw-processor/components/CompareSplitHandle.test.tsx src/modules/raw-processor/hooks/useRawProcessor.test.tsx src/modules/raw-processor/__tests__/preview-pipeline.test.ts src/modules/raw-processor/__tests__/session-derive.test.ts src/modules/raw-processor/__tests__/style-system.test.ts src/modules/raw-processor/services/export-readiness.test.ts src/modules/raw-processor/services/export-state.test.ts src/modules/raw-processor/services/export-evacuation.test.ts src/modules/raw-processor/__tests__/export-system.test.ts src/modules/raw-processor/services/export-result-actions.test.ts --exclude '.worktrees/**'` with 188 passing tests.
- 2026-05-04: `pnpm exec tsc --noEmit --pretty false` after M10 remains blocked only by the recorded fresh-worktree `src/generated-routes.ts` absence.
- 2026-05-04: M10 behavior review found no regressions and confirmed unsupported-file guard remains before runtime/session mutation. Reviewer noted the missing focused unsupported-file side-effect test; added it before commit.
- 2026-05-04: M10 architecture/performance review found no over-abstraction, stale-state, allocation, dependency-direction, async lifecycle, or circular-import risk. Reviewer confirmed `raw-load-preparation.ts` is pure and imports only existing pure helpers/model types.
- 2026-05-04: Post-M10 `pnpm test:run` still fails only on recorded baseline blockers. Current totals: 89 passed files, 1 skipped file, 1051 passed tests, 8 skipped tests, with 3 baseline failures: missing JPEG native artifact, missing RAW native artifact, and deploy URL assertion mismatch in `scripts/deploy/deploy.test.mjs`.
- 2026-05-04: Post-M10 `pnpm exec eslint .` still fails on recorded repo-wide baseline lint issues, with 415 errors concentrated in Markdown formatting/license docs plus existing test style issues.
- 2026-05-04: Post-M10 `pnpm build` still fails closed on recorded missing native RAW/JPEG runtime assets.
