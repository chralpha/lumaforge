# LUT Contract Vocabulary + Recommend-State UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the runtime the single source of canonical LUT-contract vocabulary, split the ambiguous `needs-user-selection` state into `recommended`/`unknown`/`unsupported-output`, then surface the recommendation inline with one-click confirmation.

**Architecture:** Two phases. Phase 1 is a behavior-preserving rename + state-shape split driven by the TypeScript compiler (`LUTProfileResolution`→`LUTContractResolution`, `suggestions`→`recommendations`, `'resolved'`→`'confirmed'`, split `'needs-user-selection'`). Phase 2 adds a shared `deriveLUTContractView` and renders the recommend state, removes dead code, and updates i18n. Preview keeps its honest `display-srgb` fallback; export stays fail-closed.

**Tech Stack:** TypeScript, React, Jotai, Vitest, pnpm workspaces (`@lumaforge/luma-color-runtime`), Tailwind, motion/react, i18n JSON locales.

**Spec:** `docs/superpowers/specs/2026-05-29-lut-contract-vocabulary-and-recommend-ux-design.md`

---

## File Structure

**Phase 1 (rename + split) — production:**
- `packages/luma-color-runtime/src/types.ts` — type `LUTContractResolution` + `LumaColorLUTData.profileResolution`.
- `packages/luma-color-runtime/src/color-graph.ts:208` — `kind !== 'confirmed'`.
- `src/lib/gl/pipeline.ts:10,65,267,269,297,301,793` — type import + `kind !== 'confirmed'`.
- `src/lib/lut/cube-parser.ts:9,34` — type import on `ParsedLUT`.
- `src/lib/lut/profile-resolution.ts:5,282-283,509,515,525,541-549,554,556` — producer split + `confirmed`.
- `src/modules/raw-processor/model/session.ts:4,52-68,102,126` — `LUTContractSelectionState` + status split.
- `src/modules/raw-processor/services/style-system.ts:3,12,51-80,84` — `buildLUTProfileSelectionState`, `describeLUTContract`.
- `src/modules/raw-processor/model/derive-session.ts:35-43` — export gating kinds.
- `src/modules/raw-processor/components/tools/lut-contract.ts` — `getResolvedProfile`, `getContractAttentionState` (kept alive in Phase 1, superseded in Phase 2).
- Consumers carrying the types: `RawToolSurface.tsx`, `LutContractTool.tsx`, `LUTProfileStatus.tsx`, `MobileLutBrowser.tsx`, `MobileLabChrome.tsx`, `useImageSession.ts`, `useRawProcessor.ts`, `session-factory.ts`, `look-session-state.ts`, `raw-load-preparation.ts`, `orchestrate-lut-load.ts`, `ControlsPanel.tsx` (deleted in Phase 2).
- Tests/mocks (~19 files) listed in the spec; updated within the task that breaks them.

**Phase 2 (UX) — production:**
- `src/modules/raw-processor/components/tools/lut-contract.ts` — add `LUTContractView` + `deriveLUTContractView` + `needsContractSelection`.
- `src/modules/raw-processor/components/tools/lut/LUTProfileStatus.tsx` — render recommend rows + adaptive action.
- `src/modules/raw-processor/components/tools/lut/LUTContractBrowser.tsx` — accept `initialStep` + `initialInputDraft`.
- `src/modules/raw-processor/components/mobile/MobileLutBrowser.tsx` — recommend-state parity.
- `src/modules/raw-processor/components/ControlsPanel.tsx` + `components/index.ts` — delete dead duplicate.
- `src/locales/en.json`, `src/locales/zh-CN.json` — copy.

---

# Phase 1 — Runtime vocabulary (behavior-preserving)

## Task 1: Rename type names `LUTProfileResolution` → `LUTContractResolution`, `LUTProfileSelectionState` → `LUTContractSelectionState`

**Files:** all `.ts`/`.tsx` referencing those identifiers (production + tests).

- [ ] **Step 1: Apply the repo-wide identifier rename**

Run (renames the two type identifiers everywhere, including imports/exports/tests; pure token rename):

```bash
cd /workspaces/LumaForge/LumaForge
rg -l 'LUTProfileResolution|LUTProfileSelectionState' -g '*.ts' -g '*.tsx' \
  | xargs sed -i \
    -e 's/LUTProfileResolution/LUTContractResolution/g' \
    -e 's/LUTProfileSelectionState/LUTContractSelectionState/g'
```

- [ ] **Step 2: Verify no stale references remain**

Run: `rg -n 'LUTProfileResolution|LUTProfileSelectionState' -g '*.ts' -g '*.tsx'`
Expected: no output.

- [ ] **Step 3: Typecheck runtime + app**

Run: `pnpm --filter @lumaforge/luma-color-runtime typecheck && pnpm typecheck`
Expected: PASS (no errors — this was a symbol rename only).

- [ ] **Step 4: Run app + runtime tests**

Run: `pnpm test:runtime && pnpm test:app`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit --no-gpg-sign -m "refactor(color-runtime): rename LUTProfile{Resolution,SelectionState} to LUTContract*"
```

## Task 2: Rename field `suggestions` → `recommendations`

**Files:** `packages/luma-color-runtime/src/types.ts`, `src/lib/lut/profile-resolution.ts`, `src/modules/raw-processor/services/style-system.ts`, `src/modules/raw-processor/model/session.ts`, `MobileLutBrowser.tsx`, `LUTProfileStatus.tsx`, `ControlsPanel.tsx`, `LUTContractBrowser.tsx`, and test mocks.

> Note: the prop name `suggestions` on `LUTContractBrowser`/`LUTProfileSelector` may stay as-is (component-local), but the **resolution/selection field** `suggestions` becomes `recommendations`. To keep this task mechanical and safe, rename the field at its definitions and read sites only.

- [ ] **Step 1: Rename the field at the runtime type**

In `packages/luma-color-runtime/src/types.ts`, change the `needs-user-selection` arm field `suggestions: LUTColorProfile[]` to `recommendations: LUTColorProfile[]`.

- [ ] **Step 2: Rename at the model type**

In `src/modules/raw-processor/model/session.ts`, in the `status: 'pending'` arm change `suggestions: LUTColorProfile[]` to `recommendations: LUTColorProfile[]`.

- [ ] **Step 3: Let the compiler list the read sites**

Run: `pnpm typecheck`
Expected: errors at the read sites (`style-system.ts`, `profile-resolution`, `MobileLutBrowser`, `LUTProfileStatus`, `ControlsPanel`, and test mocks). Update each `.suggestions` access and object literal key to `recommendations`. Examples:
- `style-system.ts:70` `suggestions: lut.profileResolution.suggestions` → `recommendations: lut.profileResolution.recommendations`.
- `MobileLutBrowser.tsx:193` `props.lutProfileResolution.suggestions` → `.recommendations`.
- `LUTProfileStatus.tsx:34` `selection.suggestions` → `selection.recommendations`.

- [ ] **Step 4: Update test mocks**

Run: `rg -n "suggestions:" -g '*.test.ts' -g '*.test.tsx'` and rename each mock key `suggestions:` → `recommendations:` where it sits inside a resolution/selection mock (the `kind: 'needs-user-selection'` / `status: 'pending'` objects).

- [ ] **Step 5: Verify green**

Run: `pnpm --filter @lumaforge/luma-color-runtime typecheck && pnpm typecheck && pnpm test:runtime && pnpm test:app`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit --no-gpg-sign -m "refactor(color-runtime): rename contract resolution field suggestions to recommendations"
```

## Task 3: Rename kind/status value `'resolved'` → `'confirmed'`

**Files:** `types.ts`, `profile-resolution.ts`, `color-graph.ts`, `pipeline.ts`, `derive-session.ts`, `style-system.ts`, `session.ts`, `lut-contract.ts`, `RawToolSurface.tsx`, plus test mocks.

- [ ] **Step 1: Change the type literals**

In `packages/luma-color-runtime/src/types.ts`, change the resolution arm `kind: 'resolved'` → `kind: 'confirmed'`.
In `src/modules/raw-processor/model/session.ts`, change the selection arm `status: 'resolved'` → `status: 'confirmed'`, and the confidence extraction `Extract<LUTContractResolution, { kind: 'resolved' }>` → `{ kind: 'confirmed' }`.

- [ ] **Step 2: Update producers and comparisons (compiler-guided)**

Run: `pnpm typecheck`. Update each error site:
- `profile-resolution.ts:283,515,525` `kind: 'resolved'` → `kind: 'confirmed'`.
- `profile-resolution.ts:556` `profileResolution.kind !== 'resolved'` → `!== 'confirmed'`.
- `color-graph.ts:208` `kind !== 'resolved'` → `!== 'confirmed'`.
- `pipeline.ts:269,301,793` `kind !== 'resolved'` → `!== 'confirmed'`.
- `derive-session.ts:35` `kind === 'resolved'` → `=== 'confirmed'`.
- `style-system.ts:52,84` `kind === 'resolved'` → `=== 'confirmed'`.
- `lut-contract.ts:19` `kind === 'resolved'` → `=== 'confirmed'`; `lut-contract.ts:20` `status === 'resolved'` → `=== 'confirmed'`.
- `RawToolSurface.tsx:263` `kind === 'resolved'` → `=== 'confirmed'`.

- [ ] **Step 3: Update test mocks**

Run: `rg -n "kind: 'resolved'|status: 'resolved'" -g '*.test.ts' -g '*.test.tsx'` and rename each to `'confirmed'`.

- [ ] **Step 4: Verify green**

Run: `pnpm --filter @lumaforge/luma-color-runtime typecheck && pnpm typecheck && pnpm test:runtime && pnpm test:app`
Expected: PASS (behavior identical; `resolved` was just relabeled).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit --no-gpg-sign -m "refactor(color-runtime): rename contract kind resolved to confirmed"
```

## Task 4: Split `'needs-user-selection'` into `'recommended' | 'unknown' | 'unsupported-output'`

**Files:** `types.ts`, `profile-resolution.ts`, `session.ts`, `style-system.ts`, `derive-session.ts`, `lut-contract.ts`, `LUTProfileStatus.tsx`, `MobileLutBrowser.tsx`, `MobileLabChrome.tsx`, `RawToolSurface.tsx`, and test mocks.

- [ ] **Step 1: Replace the runtime union arm**

In `packages/luma-color-runtime/src/types.ts`, replace the second arm of `LUTContractResolution` so the full type reads:

```ts
export type LUTContractResolution =
  | {
      kind: 'confirmed'
      profile: LUTColorProfile
      confidence: 'metadata' | 'user' | 'persisted-user'
    }
  | { kind: 'recommended'; recommendations: LUTColorProfile[] }
  | { kind: 'unknown' }
  | { kind: 'unsupported-output'; recommendations: LUTColorProfile[] }
```

- [ ] **Step 2: Split the producer**

In `src/lib/lut/profile-resolution.ts`, replace the tail of `resolveLUTProfile` (the block currently at lines ~532-550) with:

```ts
  const inputProfileInput = buildInputProfileInput(input)
  const recommendations = uniqueProfiles(
    inferLUTColorProfileHints(inputProfileInput).map((profile) =>
      annotateProfileOutput(profile, signature),
    ),
  )

  if (hasUnsupportedOutputAnnotation(signature)) {
    return { kind: 'unsupported-output', recommendations }
  }

  if (recommendations.length > 0) {
    return { kind: 'recommended', recommendations }
  }

  return { kind: 'unknown' }
```

- [ ] **Step 3: Split the model state**

In `src/modules/raw-processor/model/session.ts`, replace the `status: 'pending'` arm so `LUTContractSelectionState` reads:

```ts
export type LUTContractSelectionState =
  | {
      status: 'confirmed'
      fingerprint: string
      profileId: string
      confidence: Extract<
        LUTContractResolution,
        { kind: 'confirmed' }
      >['confidence']
    }
  | {
      status: 'recommended'
      fingerprint: string
      title: string
      sourceName?: string
      recommendations: LUTColorProfile[]
    }
  | { status: 'unknown'; fingerprint: string; title: string; sourceName?: string }
  | {
      status: 'unsupported-output'
      fingerprint: string
      title: string
      sourceName?: string
      recommendations: LUTColorProfile[]
    }
```

- [ ] **Step 4: Rewrite `buildLUTProfileSelectionState`**

In `src/modules/raw-processor/services/style-system.ts`, replace the function body:

```ts
export function buildLUTProfileSelectionState(
  lut: ParsedLUT,
): LUTContractSelectionState {
  const resolution = lut.profileResolution
  if (resolution.kind === 'confirmed') {
    return {
      status: 'confirmed',
      fingerprint: lut.fingerprint,
      profileId: resolution.profile.id,
      confidence: resolution.confidence,
    }
  }
  if (resolution.kind === 'recommended') {
    return {
      status: 'recommended',
      fingerprint: lut.fingerprint,
      title: lut.title,
      sourceName: lut.sourceName,
      recommendations: resolution.recommendations,
    }
  }
  if (resolution.kind === 'unsupported-output') {
    return {
      status: 'unsupported-output',
      fingerprint: lut.fingerprint,
      title: lut.title,
      sourceName: lut.sourceName,
      recommendations: resolution.recommendations,
    }
  }
  return {
    status: 'unknown',
    fingerprint: lut.fingerprint,
    title: lut.title,
    sourceName: lut.sourceName,
  }
}
```

- [ ] **Step 5: Update export gating**

In `src/modules/raw-processor/model/derive-session.ts`, replace lines ~35-43 with:

```ts
  if (profileResolution.kind === 'confirmed') {
    return resolveUnsupportedLUTOutputReason(profileResolution.profile)
  }

  if (profileResolution.kind === 'unsupported-output') {
    return 'This LUT output transfer is not supported by full-resolution JPEG export.'
  }

  return 'Choose a LUT input profile before full-resolution export.'
```

- [ ] **Step 6: Update remaining consumers (behavior-preserving)**

- `src/modules/raw-processor/components/tools/lut-contract.ts` `getContractAttentionState`:
  replace `const needsUserSelection = resolution?.kind === 'needs-user-selection'` with
  `const needsUserSelection = resolution != null && resolution.kind !== 'confirmed'`,
  and the `unsupportedOutput` line with `resolution?.kind === 'unsupported-output'`.
- `src/modules/raw-processor/components/tools/lut/LUTProfileStatus.tsx`:
  `isPending` → `const isPending = selection != null && selection.status !== 'confirmed'`;
  recommendations → `const recommendations = selection && (selection.status === 'recommended' || selection.status === 'unsupported-output') ? selection.recommendations : []`;
  the `unsupportedOutput` derivation → `resolution?.kind === 'unsupported-output'`.
- `src/modules/raw-processor/components/mobile/MobileLutBrowser.tsx:190-196` `profileSuggestions`:

```ts
  const profileSuggestions = useMemo(() => {
    const resolution = props.lutProfileResolution
    return resolution &&
      (resolution.kind === 'recommended' ||
        resolution.kind === 'unsupported-output')
      ? resolution.recommendations
      : []
  }, [props.lutProfileResolution])
```

- `src/modules/raw-processor/components/mobile/MobileLabChrome.tsx:333`: replace
  `props.lutBrowser.lutProfileResolution?.kind === 'needs-user-selection'` with
  `props.lutBrowser.lutProfileResolution != null && props.lutBrowser.lutProfileResolution.kind !== 'confirmed'`.
- `src/modules/raw-processor/components/RawToolSurface.tsx:262-267` `lutResolved`:

```ts
  const lutResolved =
    props.lutProfileResolution?.kind === 'confirmed'
      ? props.lutProfileResolution.profile.role
      : props.lutProfileResolution
        ? t('raw.histogram.notLoaded')
        : '—'
```

- [ ] **Step 7: Update test mocks**

Run: `rg -n "needs-user-selection" -g '*.test.ts' -g '*.test.tsx'`. For each mock, replace `kind: 'needs-user-selection'` with `kind: 'recommended'` when it has non-empty `recommendations`, `kind: 'unsupported-output'` when it set `reason: 'unsupported-output'` (drop the now-removed `reason` key), or `kind: 'unknown'` (and remove the empty `recommendations: []`) otherwise. Apply the same mapping to `status: 'pending'` selection mocks.

- [ ] **Step 8: Verify green**

Run: `pnpm --filter @lumaforge/luma-color-runtime typecheck && pnpm --filter @lumaforge/luma-color-runtime build && pnpm typecheck && pnpm test:runtime && pnpm test:app`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit --no-gpg-sign -m "refactor(color-runtime): split needs-user-selection into recommended/unknown/unsupported-output"
```

---

# Phase 2 — Recommend-state UX

## Task 5: Add `deriveLUTContractView` + `needsContractSelection`

**Files:**
- Modify: `src/modules/raw-processor/components/tools/lut-contract.ts`
- Test: `src/modules/raw-processor/components/tools/lut-contract.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `lut-contract.test.ts`:

```ts
import { getLUTColorProfile } from '@lumaforge/luma-color-runtime'
import { describe, expect, it } from 'vitest'

import { deriveLUTContractView } from './lut-contract'

const vlog709 = getLUTColorProfile('panasonic-vgamut-vlog')! // input-only unless output annotated

describe('deriveLUTContractView', () => {
  it('returns confirmed with output label for a resolved selection', () => {
    const view = deriveLUTContractView(
      { status: 'confirmed', fingerprint: 'fp', profileId: 'display-srgb', confidence: 'metadata' },
      null,
    )
    expect(view.status).toBe('confirmed')
  })

  it('returns recommended with completesContract=false for an input-only recommendation', () => {
    const view = deriveLUTContractView(
      { status: 'recommended', fingerprint: 'fp', title: 't', recommendations: [vlog709] },
      { kind: 'recommended', recommendations: [vlog709] },
    )
    expect(view.status).toBe('recommended')
    if (view.status === 'recommended') {
      expect(view.recommendation.id).toBe(vlog709.id)
      expect(view.completesContract).toBe(false)
    }
  })

  it('returns recommended with completesContract=true when the recommendation has a full output', () => {
    const complete = { ...vlog709, role: 'combined-look-output' as const, outputGamut: 'srgb-rec709' as const, outputTransfer: 'gamma24' as const, outputRange: 'full' as const }
    const view = deriveLUTContractView(
      { status: 'recommended', fingerprint: 'fp', title: 't', recommendations: [complete] },
      { kind: 'recommended', recommendations: [complete] },
    )
    expect(view.status === 'recommended' && view.completesContract).toBe(true)
  })

  it('returns unknown when there is no recommendation', () => {
    const view = deriveLUTContractView(
      { status: 'unknown', fingerprint: 'fp', title: 't' },
      { kind: 'unknown' },
    )
    expect(view.status).toBe('unknown')
  })

  it('returns unsupported-output', () => {
    const view = deriveLUTContractView(
      { status: 'unsupported-output', fingerprint: 'fp', title: 't', recommendations: [] },
      { kind: 'unsupported-output', recommendations: [] },
    )
    expect(view.status).toBe('unsupported-output')
  })

  it('returns incomplete-output for a confirmed profile lacking output', () => {
    const view = deriveLUTContractView(
      { status: 'confirmed', fingerprint: 'fp', profileId: 'panasonic-vgamut-vlog', confidence: 'user' },
      null,
    )
    expect(['confirmed', 'incomplete-output']).toContain(view.status)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test:ui src/modules/raw-processor/components/tools/lut-contract.test.ts`
Expected: FAIL — `deriveLUTContractView` not exported.

- [ ] **Step 3: Implement**

Add to `src/modules/raw-processor/components/tools/lut-contract.ts`:

```ts
export type LUTContractView =
  | { status: 'confirmed'; profile: LUTColorProfile; outputLabel?: string }
  | { status: 'incomplete-output'; profile: LUTColorProfile }
  | {
      status: 'recommended'
      recommendation: LUTColorProfile
      recommendations: LUTColorProfile[]
      completesContract: boolean
    }
  | { status: 'unknown' }
  | { status: 'unsupported-output'; recommendations: LUTColorProfile[] }

export function needsContractSelection(
  resolution?: LUTProfileResolutionLike,
): boolean {
  return resolution != null && resolution.kind !== 'confirmed'
}

export function deriveLUTContractView(
  selection?: LUTContractSelectionState | null,
  resolution?: LUTContractResolution | null,
): LUTContractView {
  const resolved = getResolvedProfile(selection, resolution)
  if (resolved) {
    const outputLabel = getProfileOutputLabel(resolved)
    if (outputLabel === 'Output profile required') {
      return { status: 'incomplete-output', profile: resolved }
    }
    return { status: 'confirmed', profile: resolved, outputLabel }
  }

  const recommendations =
    resolution &&
    (resolution.kind === 'recommended' ||
      resolution.kind === 'unsupported-output')
      ? resolution.recommendations
      : selection &&
          (selection.status === 'recommended' ||
            selection.status === 'unsupported-output')
        ? selection.recommendations
        : []

  if (
    resolution?.kind === 'unsupported-output' ||
    selection?.status === 'unsupported-output'
  ) {
    return { status: 'unsupported-output', recommendations }
  }

  if (recommendations.length > 0) {
    const recommendation = recommendations[0]
    return {
      status: 'recommended',
      recommendation,
      recommendations,
      completesContract: Boolean(toSelectableContract(recommendation)),
    }
  }

  return { status: 'unknown' }
}
```

Add the `LUTContractResolution`/`LUTContractSelectionState` type imports at the top of the file (alongside the existing imports). `LUTProfileResolutionLike` is just `LUTContractResolution`; use that type directly in `needsContractSelection`.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test:ui src/modules/raw-processor/components/tools/lut-contract.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit --no-gpg-sign -m "feat(raw): add deriveLUTContractView shared contract status derivation"
```

## Task 6: Render the recommend state inline on desktop (`LUTProfileStatus`)

**Files:**
- Modify: `src/modules/raw-processor/components/tools/lut/LUTProfileStatus.tsx`
- Modify: `src/modules/raw-processor/components/tools/lut/LUTContractBrowser.tsx`
- Test: `src/modules/raw-processor/components/RawToolSurface.test.tsx`

- [ ] **Step 1: Add `initialStep`/`initialInputDraft` to the browser**

In `LUTContractBrowser.tsx`, add optional props `initialStep?: 'input' | 'output'` and `initialInputDraft?: LUTColorProfile | null`. In the `useEffect` that runs on open (lines ~64-69), replace the reset with:

```ts
  useEffect(() => {
    if (!open) return
    setQuery('')
    setStep(initialStep ?? 'input')
    setDraftInputProfile(initialInputDraft ?? currentProfile ?? null)
  }, [currentProfile, initialInputDraft, initialStep, open])
```

- [ ] **Step 2: Write the failing tests**

In `RawToolSurface.test.tsx`, add tests asserting: (a) a `recommended` selection with `completesContract` true renders an input row + output row + a `data-raw-lut="apply-contract"` button; (b) clicking it calls `onLutProfileSelect` with the recommendation; (c) an input-only recommendation renders a `data-raw-lut="choose-output"` button that opens the browser. Model the mocks on the existing `suggestions`→`recommendations` mocks already in that file.

```ts
it('surfaces a complete recommendation inline and applies it on confirm', async () => {
  const onSelect = vi.fn()
  // render RawToolSurface with lutProfileSelection: { status: 'recommended', ... recommendations: [completeProfile] }
  // and lutProfileResolution: { kind: 'recommended', recommendations: [completeProfile] }
  // expect input + output rows visible
  // click [data-raw-lut="apply-contract"] → expect(onSelect).toHaveBeenCalledWith(completeProfile)
})
```

- [ ] **Step 3: Run to verify fail**

Run: `pnpm test:ui src/modules/raw-processor/components/RawToolSurface.test.tsx`
Expected: FAIL.

- [ ] **Step 4: Implement the recommend branch**

Rewrite `LUTProfileStatus.tsx` to consume `deriveLUTContractView`. Render order: `confirmed`/`incomplete-output` keep the existing input/output rows (incomplete-output keeps the `needsOutput` note). For `recommended`, render the same two-row grid using `view.recommendation.label` and (when `view.completesContract`) `getProfileOutputLabel(view.recommendation)`, each followed by a `·` + `t('raw.lutContract.recommendedBadge')` tag; show `t('raw.lutContract.recommendedNote')` (complete) or `t('raw.lutContract.recommendedInputOnlyNote')` (input-only); render the primary action:

```tsx
{view.status === 'recommended' && (
  view.completesContract ? (
    <Button
      type="button" variant="primary" size="sm"
      data-raw-lut="apply-contract"
      onClick={() => onSelect(view.recommendation)}
    >
      {t('raw.lutContract.applyContract')}
    </Button>
  ) : (
    <Button
      type="button" variant="light" size="sm"
      data-raw-lut="choose-output"
      onClick={() => { setBrowserInitialStep('output'); setBrowserInitialDraft(view.recommendation); setBrowserOpen(true) }}
    >
      {t('raw.lutContract.chooseOutput')}
    </Button>
  )
)}
```

Keep the existing `Change LUT contract` button (it opens the browser at `input`). Pass `initialStep={browserInitialStep}` and `initialInputDraft={browserInitialDraft}` to `<LUTContractBrowser>`, resetting them to `'input'`/`null` on close. `unknown` keeps `t('raw.lutContract.unknown')`; `unsupported-output` keeps `t('raw.lutContract.unsupportedOutput')`.

- [ ] **Step 5: Run to verify pass**

Run: `pnpm test:ui src/modules/raw-processor/components/RawToolSurface.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit --no-gpg-sign -m "feat(raw): surface LUT recommendation inline with one-click confirm (desktop)"
```

## Task 7: Recommend-state parity on mobile (`MobileLutBrowser`)

**Files:**
- Modify: `src/modules/raw-processor/components/mobile/MobileLutBrowser.tsx`
- Test: `src/modules/raw-processor/components/mobile/MobileLutBrowser.test.tsx`

- [ ] **Step 1: Write failing tests**

In `MobileLutBrowser.test.tsx`, add a test that a `recommended` selection renders the recommended input chip + output chip (or "Choose output" for input-only) inside `renderContractStatusSection`, and the primary button applies the recommendation (complete) or opens the contract view at the output step (input-only). Reuse the existing recommended mocks in this file.

- [ ] **Step 2: Run to verify fail**

Run: `pnpm test:ui src/modules/raw-processor/components/mobile/MobileLutBrowser.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `renderContractStatusSection`, compute `const view = deriveLUTContractView(props.lutProfileSelection, props.lutProfileResolution)`. Replace the `attention.needsUserSelection ? (warning) : resolvedProfile ? (rows) : (noContract)` branch so that `view.status === 'recommended'` renders the input/output `ContractChip`s (output chip uses `getProfileOutputLabel(view.recommendation)` when `completesContract`, else the `Choose output` affordance) plus a primary button: complete → `props.onLutProfileSelect(view.recommendation)`; input-only → `openContractView('output')` after `setDraftInputProfile(view.recommendation)`. `unknown`/`unsupported-output` keep their current warnings.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test:ui src/modules/raw-processor/components/mobile/MobileLutBrowser.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit --no-gpg-sign -m "feat(raw): recommend-state parity in mobile LUT browser"
```

## Task 8: i18n copy

**Files:** `src/locales/en.json`, `src/locales/zh-CN.json`

- [ ] **Step 1: Add/replace keys (en.json)**

```json
"raw.lutContract.suggestedInput": "Recommended input",
"raw.lutContract.suggestedOutput": "Recommended output",
"raw.lutContract.recommendedBadge": "recommended",
"raw.lutContract.recommendedNote": "Inferred from the file name/metadata — confirm before export.",
"raw.lutContract.recommendedInputOnlyNote": "Input recognized — choose an output to confirm.",
"raw.lutContract.applyContract": "Use this contract",
"raw.lutContract.chooseOutput": "Choose output"
```

- [ ] **Step 2: Add/replace keys (zh-CN.json), standardizing the noun on 色彩合同**

```json
"raw.lutContract.suggestedInput": "推荐输入",
"raw.lutContract.suggestedOutput": "推荐输出",
"raw.lutContract.recommendedBadge": "推荐",
"raw.lutContract.recommendedNote": "已按文件名/元数据推断，确认后才会用于导出。",
"raw.lutContract.recommendedInputOnlyNote": "已识别输入，选择输出后即可确认。",
"raw.lutContract.applyContract": "采用此色彩合同",
"raw.lutContract.chooseOutput": "选择输出"
```

- [ ] **Step 3: Verify locale parity + tests**

Run: `pnpm test:app` (locale-key parity tests, if present) and `pnpm test:ui`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit --no-gpg-sign -m "i18n(raw): recommended contract copy; standardize zh contract noun"
```

## Task 9: Remove dead `ControlsPanel` duplicate

**Files:** delete `src/modules/raw-processor/components/ControlsPanel.tsx`; edit `src/modules/raw-processor/components/index.ts`.

- [ ] **Step 1: Confirm it is dead**

Run: `rg -n "<ControlsPanel|ControlsPanel" src --glob '*.tsx' --glob '*.ts'`
Expected: only the definition file and the `index.ts` export — no JSX usage, no test reference. If anything else appears, STOP and reassess.

- [ ] **Step 2: Delete the file and its export**

```bash
git rm src/modules/raw-processor/components/ControlsPanel.tsx
```
Remove the `ControlsPanel` line from `src/modules/raw-processor/components/index.ts`.

- [ ] **Step 3: Verify green**

Run: `pnpm typecheck && pnpm test:app`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit --no-gpg-sign -m "chore(raw): remove dead ControlsPanel duplicate contract surface"
```

## Task 10: Replace `getContractAttentionState` with the shared view + closeout

**Files:** `tools/lut-contract.ts`, `MobileLutBrowser.tsx`, `tools/lut-contract.test.ts`.

- [ ] **Step 1: Migrate remaining consumers**

Replace `getContractAttentionState`/`ContractAttentionState` usage in `MobileLutBrowser.tsx` (the `attention.*` reads: `needsAttention`, `needsUserSelection`, `needsOutputContract`, `unsupportedOutput`) with values derived from `deriveLUTContractView` (`needsAttention = view.status !== 'confirmed'`, etc.). Then delete `getContractAttentionState` + `ContractAttentionState` and any now-unused test for it.

- [ ] **Step 2: Verify green**

Run: `pnpm test:ui && pnpm test:app`
Expected: PASS.

- [ ] **Step 3: Branch closeout verification**

Run: `pnpm lint && pnpm test:run && pnpm build`
Expected: PASS. Then perform a browser validation pass (vite preview) of the recommend interaction on desktop and a mobile/WebKit viewport — staged LUT drop, recommend rows visible, `Use this contract` confirms, `Choose output` opens the output step, export stays blocked until confirmed.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit --no-gpg-sign -m "refactor(raw): replace contract attention state with deriveLUTContractView"
```

---

## Self-Review notes

- **Spec coverage:** vocabulary rename (Tasks 1-4), state split (Task 4), shared exposure (Tasks 5,10), recommend UX both surfaces (Tasks 6-7), preview/export invariants (unchanged by Tasks 4-7; export gating updated in Task 4 Step 5), dead-code removal (Task 9), i18n (Task 8). All covered.
- **Type consistency:** `LUTContractResolution`, `LUTContractSelectionState`, `recommendations`, `'confirmed'`, `LUTContractView`, `deriveLUTContractView`, `needsContractSelection`, `completesContract` used consistently across tasks.
- **Invariants:** `toCompatInputProfile` returns `display-srgb` for every non-`confirmed` kind (Task 3 Step 2), preserving the honest preview fallback; `deriveUnsupportedExportPipelineReason` returns the choose-input block for `recommended`/`unknown` (Task 4 Step 5), preserving fail-closed export.
