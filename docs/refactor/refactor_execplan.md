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
The refactor should reduce the `useRawProcessor` hook into orchestration over narrow domain helpers:

- Session model and pure state transitions live in `src/modules/raw-processor/model` or focused services.
- RAW preview orchestration remains in the hook until its state machine is fully characterized.
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
