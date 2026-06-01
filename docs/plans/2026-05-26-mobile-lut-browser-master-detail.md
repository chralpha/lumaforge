# Mobile LUT Browser Master-Detail + Strength Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `MobileLutBrowser` into a three-view master-detail sheet (Overview / Catalog / Contract editor), reusing desktop choice-row components at touch density, and consolidate the `strength` control into the LUT browser Overview by removing the standalone `strength` mode from the mobile dock.

**Architecture:** Keep the existing non-modal `m.aside` sheet (preview remains visible). Introduce a local `view` state machine that animates between three subviews using `sheetSpring` (reduced-motion → fade). Extract two pure helpers from existing inline code so desktop and mobile share the same family grouping and contract-attention logic. Add `size: 'comfortable' | 'touch'` prop to `LUTProfileButton` / `LUTOutputOptionButton` so mobile can reuse them with 44px tap targets. Delete `MobileStrengthPanel` and use desktop `StrengthControl` directly in the Overview.

**Tech Stack:** React 18, TypeScript, Tailwind (lf-* tokens), `motion/react` (LazyMotion + `m` only, per CLAUDE.md), Radix Dialog primitives, vitest + @testing-library/react.

**Spec:** `docs/specs/2026-05-26-mobile-lut-browser-master-detail-design.md`

---

## File Structure Overview

**Create (new files):**
- `src/modules/raw-processor/components/tools/lut/lut-source-grouping.ts` — pure `groupEntriesByFamily` helper.
- `src/modules/raw-processor/components/tools/lut/lut-source-grouping.test.ts` — its tests.
- `src/modules/raw-processor/components/mobile/MobileLutSourceCard.tsx` — single resource card with Browse/Refresh/Remove icon buttons (no inline entries).
- `src/modules/raw-processor/components/mobile/MobileLutCatalogEntryButton.tsx` — 44px tap entry row used by the Catalog view.

**Modify:**
- `src/modules/raw-processor/components/tools/lut/LUTProfileButton.tsx` — add `size` prop.
- `src/modules/raw-processor/components/tools/lut/LUTOutputOptionButton.tsx` — add `size` prop.
- `src/modules/raw-processor/components/tools/lut/OnlineLutSourceControls.tsx` — consume `groupEntriesByFamily`.
- `src/modules/raw-processor/components/tools/lut-contract.ts` — add `getContractAttentionState`.
- `src/modules/raw-processor/components/tools/lut/LUTProfileStatus.tsx` — consume `getContractAttentionState`.
- `src/modules/raw-processor/components/mobile/MobileLutBrowser.tsx` — view state machine, Overview/Catalog/Contract views, Strength in Overview.
- `src/modules/raw-processor/components/mobile/MobileLutBrowser.test.tsx` — push/pop, loadEntry → pop, initialContractEditorOpen, strength visibility.
- `src/modules/raw-processor/components/mobile/MobileModeDock.tsx` — remove `'strength'`, 4 tabs.
- `src/modules/raw-processor/components/mobile/MobileModeDock.test.tsx` — 4-tab assertions.
- `src/modules/raw-processor/components/mobile/MobileLabChrome.tsx` — remove `strength` branch and `strengthControl` prop.
- `src/modules/raw-processor/components/mobile/MobileLabChrome.test.tsx` — 4-tab assertion, no strength branch.
- `src/modules/raw-processor/components/RawToolSurface.tsx` — drop `mobileStrengthControl` synthesis, plumb strength into `mobileLutBrowser`.
- `src/locales/en.json` — add 2 keys, remove 2 keys.
- `src/locales/zh-CN.json` — mirror.

**Delete:**
- `src/modules/raw-processor/components/mobile/MobileStrengthPanel.tsx` — no consumer after the dock change.

**Extend tests:**
- `src/modules/raw-processor/components/tools/__tests__/lut-contract.test.ts` (or co-located test) for `getContractAttentionState`.

---

## Task 1: Extract `groupEntriesByFamily` pure helper

**Files:**
- Create: `src/modules/raw-processor/components/tools/lut/lut-source-grouping.ts`
- Create: `src/modules/raw-processor/components/tools/lut/lut-source-grouping.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/modules/raw-processor/components/tools/lut/lut-source-grouping.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { groupEntriesByFamily } from './lut-source-grouping'

interface Entry {
  id: string
  family?: string | null
}

describe('groupEntriesByFamily', () => {
  it('groups entries by first-seen family order and keeps the rest in others', () => {
    const entries: Entry[] = [
      { id: 'a', family: 'Kodak' },
      { id: 'b', family: 'Fuji' },
      { id: 'c', family: 'Kodak' },
      { id: 'd' },
      { id: 'e', family: null },
    ]

    const result = groupEntriesByFamily(entries)

    expect(result.families).toEqual([
      { family: 'Kodak', items: [entries[0], entries[2]] },
      { family: 'Fuji', items: [entries[1]] },
    ])
    expect(result.others).toEqual([entries[3], entries[4]])
  })

  it('returns empty groups for an empty input', () => {
    expect(groupEntriesByFamily([])).toEqual({ families: [], others: [] })
  })

  it('treats every entry as ungrouped when no family is set', () => {
    const entries: Entry[] = [{ id: 'a' }, { id: 'b', family: null }]

    expect(groupEntriesByFamily(entries)).toEqual({
      families: [],
      others: entries,
    })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/modules/raw-processor/components/tools/lut/lut-source-grouping.test.ts`
Expected: FAIL — cannot find module `./lut-source-grouping`.

- [ ] **Step 3: Implement the helper**

Create `src/modules/raw-processor/components/tools/lut/lut-source-grouping.ts`:

```ts
export interface FamilyGroup<T> {
  family: string
  items: T[]
}

export interface GroupedEntries<T> {
  families: FamilyGroup<T>[]
  others: T[]
}

export function groupEntriesByFamily<T extends { family?: string | null }>(
  entries: readonly T[],
): GroupedEntries<T> {
  const families = new Map<string, T[]>()
  const others: T[] = []

  for (const entry of entries) {
    if (entry.family) {
      const bucket = families.get(entry.family)
      if (bucket) {
        bucket.push(entry)
      } else {
        families.set(entry.family, [entry])
      }
    } else {
      others.push(entry)
    }
  }

  return {
    families: Array.from(families, ([family, items]) => ({ family, items })),
    others,
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/modules/raw-processor/components/tools/lut/lut-source-grouping.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/modules/raw-processor/components/tools/lut/lut-source-grouping.ts \
        src/modules/raw-processor/components/tools/lut/lut-source-grouping.test.ts
git commit --no-gpg-sign -m "refactor(raw): extract groupEntriesByFamily helper"
```

---

## Task 2: Adopt `groupEntriesByFamily` in `OnlineLutSourceControls`

**Files:**
- Modify: `src/modules/raw-processor/components/tools/lut/OnlineLutSourceControls.tsx` (the IIFE around lines 139–230)

Goal: Replace the inline `familyGroups`/`ungrouped` bookkeeping with a call to `groupEntriesByFamily`. No visual change.

- [ ] **Step 1: Update `OnlineLutSourceControls.tsx`**

Add the import near the other tool imports:

```ts
import { groupEntriesByFamily } from './lut-source-grouping'
```

Replace the IIFE inside the `openEntries.length > 0` branch (lines 138–230 today) with:

```tsx
{openEntries.length > 0 ? (
  (() => {
    const { families, others } = groupEntriesByFamily(openEntries)

    const renderEntry = (entry: (typeof openEntries)[number]) => {
      const isLoading = loadingEntryId === entry.id
      const handleLoadEntry = async () => {
        if (loadingEntryId) return
        setLoadingEntryId(entry.id)
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        )
        try {
          await onlineLutSources.loadEntry(entry.id)
          closeBrowser(openResource.id, { restoreFocus: true })
        } catch {
          // per-resource issue chip surfaces the failure
        } finally {
          setLoadingEntryId(null)
        }
      }

      return (
        <div
          key={entry.id}
          className="grid min-w-0 grid-cols-[minmax(0,1fr)_28px] items-center gap-2 rounded-md px-1.5 py-1 transition-colors duration-150 hover:bg-[oklch(from_var(--color-lf-ink)_l_c_h_/_0.045)]"
          data-raw-lut="source-entry"
          data-raw-lut-entry-loading={isLoading ? 'true' : undefined}
        >
          <span className="min-w-0 truncate text-[0.74rem] leading-[1.35] text-lf-ink/75">
            {entry.title}
          </span>
          <LutIconButton
            label={t('raw.lutSource.load', { label: entry.title })}
            busy={isLoading}
            disabled={isLoading}
            onClick={() => {
              void handleLoadEntry()
            }}
          >
            {isLoading ? (
              <Loader2 aria-hidden="true" />
            ) : (
              <Download aria-hidden="true" />
            )}
          </LutIconButton>
        </div>
      )
    }

    return (
      <>
        {families.map(({ family, items }) => (
          <div key={family} className="grid gap-1">
            <div className="px-1 text-[0.7rem] font-medium tracking-tight text-lf-ink/50">
              {family}
            </div>
            <div className="grid gap-0.5 sm:grid-cols-2">
              {items.map(renderEntry)}
            </div>
          </div>
        ))}
        {others.length > 0 && (
          <div className="grid gap-1">
            <div className="px-1 text-[0.7rem] font-medium tracking-tight text-lf-ink/50">
              {t('raw.lutSource.others')}
            </div>
            <div className="grid gap-0.5 sm:grid-cols-2">
              {others.map(renderEntry)}
            </div>
          </div>
        )}
      </>
    )
  })()
) : (
  <p className="text-[0.78rem] leading-relaxed text-lf-ink/55">
    {openIssues.length > 0
      ? t('raw.lutSource.noneCompatible')
      : t('raw.lutSource.noneYet')}
  </p>
)}
```

- [ ] **Step 2: Run desktop online-source regressions**

Run: `pnpm vitest run src/modules/raw-processor`
Expected: existing tests pass. If any test references the inline grouping internals (`familyGroups`), update it to assert observable DOM (family heading text, entry rows) instead. None should exist today; ensure no new failures.

- [ ] **Step 3: Lint**

Run: `pnpm lint`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/modules/raw-processor/components/tools/lut/OnlineLutSourceControls.tsx
git commit --no-gpg-sign -m "refactor(raw): adopt groupEntriesByFamily in OnlineLutSourceControls"
```

---

## Task 3: Add `getContractAttentionState` helper

**Files:**
- Modify: `src/modules/raw-processor/components/tools/lut-contract.ts` (append at end)
- Create or modify: `src/modules/raw-processor/components/tools/__tests__/lut-contract.test.ts` (if file already exists, append the new describe block; otherwise create co-located `src/modules/raw-processor/components/tools/lut-contract.test.ts`)

- [ ] **Step 1: Confirm test file location**

Run: `find src/modules/raw-processor -name "lut-contract.test.*" -not -path "*node_modules*" -not -path "*.worktrees*"`
If a test file exists, append; if none, create `src/modules/raw-processor/components/tools/lut-contract.test.ts`.

- [ ] **Step 2: Write the failing test**

Add to (or create) the lut-contract test file:

```ts
import { getLUTColorProfile } from '@lumaforge/luma-color-runtime'
import { describe, expect, it } from 'vitest'

import { getContractAttentionState } from './lut-contract'

describe('getContractAttentionState', () => {
  it('flags needs-user-selection when resolution is unresolved', () => {
    const state = getContractAttentionState(null, {
      kind: 'needs-user-selection',
      reason: 'ambiguous',
      suggestions: [],
    })

    expect(state).toEqual({
      needsUserSelection: true,
      needsOutputContract: false,
      unsupportedOutput: false,
      needsAttention: true,
    })
  })

  it('flags unsupported-output when that is the reason', () => {
    const state = getContractAttentionState(null, {
      kind: 'needs-user-selection',
      reason: 'unsupported-output',
      suggestions: [],
    })

    expect(state.unsupportedOutput).toBe(true)
    expect(state.needsUserSelection).toBe(true)
    expect(state.needsAttention).toBe(true)
  })

  it('flags needs-output-contract when the resolved profile has no declared output', () => {
    // Sony S-Gamut3.Cine / S-Log3 is a scene-referred input with no declared
    // display output — getProfileOutputLabel returns "Output profile required".
    const profile = getLUTColorProfile('sony-sgamut3cine-slog3')
    if (!profile) throw new Error('test fixture missing: sony-sgamut3cine-slog3')

    const state = getContractAttentionState(
      { status: 'resolved', profileId: profile.id, fingerprint: 'x' } as never,
      { kind: 'resolved', profile },
    )

    expect(state.needsOutputContract).toBe(true)
    expect(state.needsAttention).toBe(true)
  })

  it('reports no attention needed when everything is resolved', () => {
    // rec709-gamma24 is a display-look profile with display-like input —
    // getProfileOutputLabel returns "Rec.709 display", never "required".
    const profile = getLUTColorProfile('rec709-gamma24')
    if (!profile) throw new Error('test fixture missing: rec709-gamma24')

    const state = getContractAttentionState(
      { status: 'resolved', profileId: profile.id, fingerprint: 'x' } as never,
      { kind: 'resolved', profile },
    )

    expect(state).toEqual({
      needsUserSelection: false,
      needsOutputContract: false,
      unsupportedOutput: false,
      needsAttention: false,
    })
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run src/modules/raw-processor/components/tools/lut-contract.test.ts`
(adjust path if you placed the test under `__tests__/`)
Expected: FAIL — `getContractAttentionState is not exported`.

- [ ] **Step 4: Implement the helper**

Append to `src/modules/raw-processor/components/tools/lut-contract.ts`:

```ts
export interface ContractAttentionState {
  needsUserSelection: boolean
  needsOutputContract: boolean
  unsupportedOutput: boolean
  needsAttention: boolean
}

export function getContractAttentionState(
  selection?: LUTProfileSelectionState | null,
  resolution?: LUTProfileResolution | null,
): ContractAttentionState {
  const resolvedProfile = getResolvedProfile(selection, resolution)
  const outputLabel = getProfileOutputLabel(resolvedProfile)
  const needsOutputContract = outputLabel === 'Output profile required'
  const needsUserSelection = resolution?.kind === 'needs-user-selection'
  const unsupportedOutput =
    resolution?.kind === 'needs-user-selection' &&
    resolution.reason === 'unsupported-output'

  return {
    needsUserSelection,
    needsOutputContract,
    unsupportedOutput,
    needsAttention:
      needsUserSelection || needsOutputContract || unsupportedOutput,
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run src/modules/raw-processor/components/tools/lut-contract.test.ts`
Expected: PASS (4 tests). The fixture ids `sony-sgamut3cine-slog3` and `rec709-gamma24` are exercised by other tests in `packages/luma-color-runtime`; if either disappears from the registry, swap to another profile that satisfies the same shape (scene-referred input with no declared output / display-look with declared output).

- [ ] **Step 6: Commit**

```bash
git add src/modules/raw-processor/components/tools/lut-contract.ts \
        src/modules/raw-processor/components/tools/lut-contract.test.ts
git commit --no-gpg-sign -m "feat(raw): add getContractAttentionState helper"
```

---

## Task 4: Adopt `getContractAttentionState` in `LUTProfileStatus`

**Files:**
- Modify: `src/modules/raw-processor/components/tools/lut/LUTProfileStatus.tsx`

- [ ] **Step 1: Refactor the helper consumption**

Update the imports near the top:

```ts
import {
  getContractAttentionState,
  getProfileOutputLabel,
  getResolvedProfile,
} from '../lut-contract'
```

Replace the four scattered checks (`needsOutputContract`, `isUnsupportedOutput`, etc.) with:

```ts
const resolvedProfile = getResolvedProfile(selection, resolution)
const outputLabel = getProfileOutputLabel(resolvedProfile)
const attention = getContractAttentionState(selection, resolution)
const isPending = selection?.status === 'pending'
const suggestions =
  selection?.status === 'pending' ? selection.suggestions : []
```

Replace references:

- `isUnsupportedOutput` → `attention.unsupportedOutput`
- `needsOutputContract` (the local) → `attention.needsOutputContract`

Leave the rest of the JSX untouched.

- [ ] **Step 2: Run regression tests**

Run: `pnpm vitest run src/modules/raw-processor`
Expected: no new failures.

- [ ] **Step 3: Lint**

Run: `pnpm lint`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/modules/raw-processor/components/tools/lut/LUTProfileStatus.tsx
git commit --no-gpg-sign -m "refactor(raw): consume contract attention helper in LUTProfileStatus"
```

---

## Task 5: Add `size` prop to `LUTProfileButton`

**Files:**
- Modify: `src/modules/raw-processor/components/tools/lut/LUTProfileButton.tsx`

- [ ] **Step 1: Update the component signature and class composition**

Replace the entire file with:

```tsx
import type { LUTColorProfile } from '@lumaforge/luma-color-runtime'
import { Aperture } from 'lucide-react'

import { clsxm } from '~/lib/cn'

import { getProfileContractLabel } from '../lut-contract'

export type LUTProfileButtonSize = 'comfortable' | 'touch'

export function LUTProfileButton({
  profile,
  activeProfileId,
  onSelect,
  label,
  ariaLabel,
  highlighted = false,
  size = 'comfortable',
}: {
  profile: LUTColorProfile
  activeProfileId?: string
  onSelect: (profile: LUTColorProfile) => void
  label?: string
  ariaLabel?: string
  highlighted?: boolean
  size?: LUTProfileButtonSize
}) {
  const isActive = activeProfileId === profile.id
  const buttonLabel = label ?? getProfileContractLabel(profile)
  const isTouch = size === 'touch'

  return (
    <button
      type="button"
      aria-label={ariaLabel ?? buttonLabel}
      aria-pressed={isActive}
      onClick={() => onSelect(profile)}
      className={clsxm(
        'group/lut-row relative grid w-full min-w-0 items-center rounded-md text-left transition-colors duration-150 ease-out',
        'text-lf-ink/75',
        'hover:bg-[oklch(from_var(--color-lf-ink)_l_c_h_/_0.045)] hover:text-lf-ink/90',
        'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-lf-green',
        isTouch
          ? 'min-h-[44px] grid-cols-[28px_minmax(0,1fr)] gap-2.5 px-2 py-2'
          : 'grid-cols-[22px_minmax(0,1fr)] gap-2 px-1.5 py-1.5',
        highlighted &&
          !isActive &&
          'bg-[oklch(from_var(--color-lf-amber)_l_c_h_/_0.10)] text-lf-ink/90',
        isActive &&
          'bg-[oklch(from_var(--color-lf-green)_l_c_h_/_0.12)] text-lf-green-deep',
      )}
      data-raw-lut="contract-option"
      data-raw-lut-size={size}
    >
      <span
        aria-hidden="true"
        className={clsxm(
          'inline-grid place-items-center rounded-md transition-colors duration-150',
          isTouch ? 'size-[28px]' : 'size-[22px]',
          isActive
            ? 'bg-[oklch(from_var(--color-lf-green)_l_c_h_/_0.18)] text-lf-green-deep'
            : highlighted
              ? 'bg-[oklch(from_var(--color-lf-amber)_l_c_h_/_0.16)] text-lf-ink/70'
              : 'bg-[oklch(from_var(--color-lf-ink)_l_c_h_/_0.05)] text-lf-ink/45 group-hover/lut-row:bg-[oklch(from_var(--color-lf-ink)_l_c_h_/_0.08)] group-hover/lut-row:text-lf-ink/65',
        )}
      >
        <Aperture
          className={clsxm(isTouch ? 'size-[14px]' : 'size-[12px]', 'stroke-[1.75]')}
        />
      </span>
      <span
        className={clsxm(
          'block min-w-0 break-words leading-[1.35]',
          isTouch ? 'text-[0.82rem]' : 'text-[0.74rem]',
          isActive ? 'font-semibold' : 'font-normal',
        )}
      >
        {buttonLabel}
      </span>
    </button>
  )
}
```

- [ ] **Step 2: Run desktop regressions**

Run: `pnpm vitest run src/modules/raw-processor`
Expected: pass. Desktop still uses the default `comfortable` size.

- [ ] **Step 3: Lint**

Run: `pnpm lint`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/modules/raw-processor/components/tools/lut/LUTProfileButton.tsx
git commit --no-gpg-sign -m "feat(raw): add touch size variant to LUTProfileButton"
```

---

## Task 6: Add `size` prop to `LUTOutputOptionButton`

**Files:**
- Modify: `src/modules/raw-processor/components/tools/lut/LUTOutputOptionButton.tsx`

- [ ] **Step 1: Update the component signature and class composition**

Replace the entire file with:

```tsx
import { Monitor } from 'lucide-react'

import { clsxm } from '~/lib/cn'
import { useI18n } from '~/lib/i18n'

import type { LUTOutputOption } from './lut-output-options'

export type LUTOutputOptionButtonSize = 'comfortable' | 'touch'

export function LUTOutputOptionButton({
  option,
  activeOptionId,
  onSelect,
  highlighted = false,
  size = 'comfortable',
}: {
  option: LUTOutputOption
  activeOptionId?: string
  onSelect: (option: LUTOutputOption) => void
  highlighted?: boolean
  size?: LUTOutputOptionButtonSize
}) {
  const { t } = useI18n()
  const isActive = activeOptionId === option.id
  const isTouch = size === 'touch'

  return (
    <button
      type="button"
      aria-label={t('raw.lutContract.useOutput', { label: option.label })}
      aria-pressed={isActive}
      onClick={() => onSelect(option)}
      className={clsxm(
        'group/lut-row relative grid w-full min-w-0 items-center rounded-md text-left transition-colors duration-150 ease-out',
        'text-lf-ink/75',
        'hover:bg-[oklch(from_var(--color-lf-ink)_l_c_h_/_0.045)] hover:text-lf-ink/90',
        'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-lf-green',
        isTouch
          ? 'min-h-[44px] grid-cols-[28px_minmax(0,1fr)] gap-2.5 px-2 py-2'
          : 'grid-cols-[22px_minmax(0,1fr)] gap-2 px-1.5 py-1.5',
        highlighted &&
          !isActive &&
          'bg-[oklch(from_var(--color-lf-amber)_l_c_h_/_0.10)] text-lf-ink/90',
        isActive &&
          'bg-[oklch(from_var(--color-lf-green)_l_c_h_/_0.12)] text-lf-green-deep',
      )}
      data-raw-lut="contract-option"
      data-raw-lut-size={size}
    >
      <span
        aria-hidden="true"
        className={clsxm(
          'inline-grid place-items-center rounded-md transition-colors duration-150',
          isTouch ? 'size-[28px]' : 'size-[22px]',
          isActive
            ? 'bg-[oklch(from_var(--color-lf-green)_l_c_h_/_0.18)] text-lf-green-deep'
            : highlighted
              ? 'bg-[oklch(from_var(--color-lf-amber)_l_c_h_/_0.16)] text-lf-ink/70'
              : 'bg-[oklch(from_var(--color-lf-ink)_l_c_h_/_0.05)] text-lf-ink/45 group-hover/lut-row:bg-[oklch(from_var(--color-lf-ink)_l_c_h_/_0.08)] group-hover/lut-row:text-lf-ink/65',
        )}
      >
        <Monitor
          className={clsxm(isTouch ? 'size-[14px]' : 'size-[12px]', 'stroke-[1.75]')}
        />
      </span>
      <span
        className={clsxm(
          'block min-w-0 break-words leading-[1.35]',
          isTouch ? 'text-[0.82rem]' : 'text-[0.74rem]',
          isActive ? 'font-semibold' : 'font-normal',
        )}
      >
        {option.label}
      </span>
    </button>
  )
}
```

- [ ] **Step 2: Run regressions**

Run: `pnpm vitest run src/modules/raw-processor`
Expected: pass.

- [ ] **Step 3: Lint**

Run: `pnpm lint`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/modules/raw-processor/components/tools/lut/LUTOutputOptionButton.tsx
git commit --no-gpg-sign -m "feat(raw): add touch size variant to LUTOutputOptionButton"
```

---

## Task 7: Add new i18n keys

**Files:**
- Modify: `src/locales/en.json`
- Modify: `src/locales/zh-CN.json`

- [ ] **Step 1: Add the new keys to `en.json`**

Locate the `raw.mobile.lut.*` cluster (~line 139) and add (alphabetical position not required; keep adjacent to siblings):

```json
"raw.mobile.lut.back": "Back to LUT browser",
"raw.mobile.lut.browseEntries": "Browse {{count}} LUTs",
```

- [ ] **Step 2: Mirror the keys to `zh-CN.json`**

Add to `src/locales/zh-CN.json` near the same cluster:

```json
"raw.mobile.lut.back": "返回 LUT 浏览器",
"raw.mobile.lut.browseEntries": "浏览 {{count}} 个 LUT",
```

- [ ] **Step 3: Verify both files still parse as JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('src/locales/en.json','utf8'))" && node -e "JSON.parse(require('fs').readFileSync('src/locales/zh-CN.json','utf8'))"`
Expected: no output, exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/locales/en.json src/locales/zh-CN.json
git commit --no-gpg-sign -m "i18n(raw): add mobile LUT browser back/browse keys"
```

---

## Task 8: Create `MobileLutSourceCard`

**Files:**
- Create: `src/modules/raw-processor/components/mobile/MobileLutSourceCard.tsx`

This is the per-resource card shown in the Overview view: label + pills + 3 icon buttons (Browse / Refresh / Remove). No entries are rendered inside the card — Browse pushes to the Catalog view.

- [ ] **Step 1: Create the component**

```tsx
import { AlertTriangle, FolderOpen, RefreshCw, Trash2 } from 'lucide-react'

import { Chip } from '~/components/ui/chip'
import { useI18n } from '~/lib/i18n'

import type { UseOnlineLutSourcesResult } from '../../hooks/useOnlineLutSources'

type Resource = UseOnlineLutSourcesResult['state']['resources'][number]
type Issue = UseOnlineLutSourcesResult['state']['issues'][number]

export function MobileLutSourceCard(props: {
  resource: Resource
  entryCount: number
  isLoading: boolean
  issues: Issue[]
  onBrowse: () => void
  onRefresh: () => void
  onRemove: () => void
}) {
  const { t } = useI18n()
  const label = props.resource.label || props.resource.url

  return (
    <div
      className="grid gap-1.5 rounded-md bg-lf-paper-warm/55 px-2.5 py-2.5"
      data-raw-mobile-lut="source-card"
    >
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="min-w-0 truncate text-lf-control font-semibold text-lf-ink">
            {label}
          </span>
          <span className="shrink-0 rounded-lf-pill border border-lf-hairline/45 bg-lf-paper px-1.5 py-0.5 text-lf-eyebrow font-semibold leading-none text-lf-ink-soft">
            {t('raw.mobile.lut.entryCount', { count: props.entryCount })}
          </span>
          {props.isLoading && (
            <span
              className="shrink-0 rounded-lf-pill border border-lf-green-deep/30 bg-lf-green-soft/55 px-1.5 py-0.5 text-lf-eyebrow font-semibold leading-none text-lf-green-deep"
              role="status"
            >
              {t('raw.lutSource.loading')}
            </span>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            aria-label={t('raw.lutSource.open', { label })}
            onClick={props.onBrowse}
            className="grid size-[44px] place-items-center rounded-md border border-lf-hairline/45 bg-lf-paper text-lf-ink/70 transition-colors hover:border-lf-amber/55 hover:bg-lf-paper-warm hover:text-lf-ink"
          >
            <FolderOpen aria-hidden="true" className="size-5" />
          </button>
          <button
            type="button"
            aria-label={t('raw.lutSource.refresh', { label })}
            aria-busy={props.isLoading}
            disabled={props.isLoading}
            onClick={props.onRefresh}
            className="grid size-[44px] place-items-center rounded-md border border-lf-hairline/45 bg-lf-paper text-lf-ink/70 transition-colors hover:border-lf-amber/55 hover:bg-lf-paper-warm hover:text-lf-ink disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw
              aria-hidden="true"
              className={`size-5 ${props.isLoading ? 'animate-spin motion-reduce:animate-none' : ''}`}
            />
          </button>
          <button
            type="button"
            aria-label={t('raw.lutSource.remove', { label })}
            onClick={props.onRemove}
            className="grid size-[44px] place-items-center rounded-md border border-lf-hairline/45 bg-lf-paper text-lf-ink/70 transition-colors hover:border-lf-amber/55 hover:bg-lf-paper-warm hover:text-lf-ink"
          >
            <Trash2 aria-hidden="true" className="size-5" />
          </button>
        </div>
      </div>
      {props.issues.length > 0 && (
        <ul
          className="m-0 grid list-none gap-1 p-0"
          role="status"
          aria-live="polite"
        >
          {props.issues.map((issue, index) => (
            <li
              key={[
                issue.code,
                issue.entryId ?? issue.sourceUrl ?? 'resource',
                index,
              ].join(':')}
              className="m-0"
            >
              <Chip tone="amber" size="sm" className="max-w-full">
                <AlertTriangle
                  aria-hidden="true"
                  className="size-3 shrink-0"
                />
                <span className="min-w-0 truncate">{issue.message}</span>
              </Chip>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Type-check the new file**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: no errors related to this file.

- [ ] **Step 3: Lint**

Run: `pnpm lint`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/modules/raw-processor/components/mobile/MobileLutSourceCard.tsx
git commit --no-gpg-sign -m "feat(raw-mobile): add MobileLutSourceCard component"
```

---

## Task 9: Create `MobileLutCatalogEntryButton`

**Files:**
- Create: `src/modules/raw-processor/components/mobile/MobileLutCatalogEntryButton.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { Download, Loader2 } from 'lucide-react'

import { useI18n } from '~/lib/i18n'

export function MobileLutCatalogEntryButton(props: {
  title: string
  loading: boolean
  disabled: boolean
  ariaLabel: string
  onClick: () => void
}) {
  const { t } = useI18n()

  return (
    <button
      type="button"
      aria-label={props.ariaLabel}
      aria-busy={props.loading || undefined}
      disabled={props.disabled || props.loading}
      onClick={props.onClick}
      className="grid min-h-[44px] min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md border border-lf-hairline/40 bg-lf-paper px-2.5 py-2 text-left transition-colors hover:border-lf-amber/55 hover:bg-lf-paper-warm disabled:cursor-not-allowed disabled:opacity-50"
      data-raw-mobile-lut="catalog-entry"
      data-raw-mobile-lut-entry-loading={props.loading ? 'true' : undefined}
    >
      <span className="min-w-0 truncate text-lf-control font-medium text-lf-ink">
        {props.title}
      </span>
      {props.loading ? (
        <Loader2
          aria-hidden="true"
          className="size-4 animate-spin text-lf-green-deep motion-reduce:animate-none"
        />
      ) : (
        <span className="text-xs font-semibold text-lf-green-deep">
          {t('raw.mobile.lut.load')}
        </span>
      )}
    </button>
  )
}
```

- [ ] **Step 2: Lint + type-check**

Run: `pnpm lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/modules/raw-processor/components/mobile/MobileLutCatalogEntryButton.tsx
git commit --no-gpg-sign -m "feat(raw-mobile): add MobileLutCatalogEntryButton component"
```

---

## Task 10: Refactor `MobileLutBrowser` — split into view state machine

This is the largest task; Steps 1–8 are tightly scoped, all mutating the same file. Commit at the end.

**Files:**
- Modify: `src/modules/raw-processor/components/mobile/MobileLutBrowser.tsx` (full rewrite of the body — keep the file path)
- Modify: `src/modules/raw-processor/components/mobile/MobileLutBrowser.test.tsx`

- [ ] **Step 1: Replace `MobileLutBrowser.tsx` with the master-detail implementation**

Rewrite the file. Preserve the exported `MobileLutBrowserProps` interface signature **except** add three new optional fields used by the Overview Strength row:

```ts
import type { StrengthLevel } from '../tools/StrengthControl'

export interface MobileLutBrowserProps {
  open: boolean
  onClose: () => void
  initialContractEditorOpen?: boolean
  currentLutName?: string | null
  disabled: boolean
  onLutLoad: (files: File[]) => void
  onLutClear: () => void
  lutProfileSelection?: LUTProfileSelectionState | null
  lutProfileResolution?: LUTProfileResolution | null
  onLutProfileSelect: (profile: LUTColorProfile) => void
  onlineLutSources?: UseOnlineLutSourcesResult
  // NEW — Strength row in the Overview view.
  activeIntensity: StrengthLevel
  onIntensitySelect: (level: StrengthLevel) => void
  strengthDisabled: boolean
}
```

The full file replacement (use this as the entire file body):

```tsx
import type {
  LUTColorProfile,
  LUTProfileResolution,
} from '@lumaforge/luma-color-runtime'
import { searchLUTColorProfiles } from '@lumaforge/luma-color-runtime'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { AlertTriangle, ArrowLeft, Check, Plus, Share2, X } from 'lucide-react'
import { AnimatePresence, m, useDragControls } from 'motion/react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { IconButton } from '~/components/ui/button'
import { Chip } from '~/components/ui/chip'
import { Dialog } from '~/components/ui/dialog'
import { Input } from '~/components/ui/input'
import { useI18n } from '~/lib/i18n'
import { sheetSpring } from '~/lib/spring'

import type { UseOnlineLutSourcesResult } from '../../hooks/useOnlineLutSources'
import type { LUTProfileSelectionState } from '../../model/session'
import { useToolMotion } from '../../motion'
import { Dropzone } from '../Dropzone'
import { groupEntriesByFamily } from '../tools/lut/lut-source-grouping'
import type { LUTOutputOption } from '../tools/lut/lut-output-options'
import {
  dedupeOutputOptions,
  dedupeProfiles,
  groupOutputOptions,
  toDeclaredOutputOption,
  toOutputCarrierProfile,
  toSearchOutputOption,
} from '../tools/lut/lut-output-options'
import { LUTOutputOptionButton } from '../tools/lut/LUTOutputOptionButton'
import { LUTProfileButton } from '../tools/lut/LUTProfileButton'
import {
  composeLUTContractProfile,
  getContractAttentionState,
  getProfileOutputLabel,
  getResolvedProfile,
  groupProfiles,
} from '../tools/lut-contract'
import type { StrengthLevel } from '../tools/StrengthControl'
import { StrengthControl } from '../tools/StrengthControl'
import { MobileLutCatalogEntryButton } from './MobileLutCatalogEntryButton'
import { MobileLutSourceCard } from './MobileLutSourceCard'

export interface MobileLutBrowserProps {
  open: boolean
  onClose: () => void
  initialContractEditorOpen?: boolean
  currentLutName?: string | null
  disabled: boolean
  onLutLoad: (files: File[]) => void
  onLutClear: () => void
  lutProfileSelection?: LUTProfileSelectionState | null
  lutProfileResolution?: LUTProfileResolution | null
  onLutProfileSelect: (profile: LUTColorProfile) => void
  onlineLutSources?: UseOnlineLutSourcesResult
  activeIntensity: StrengthLevel
  onIntensitySelect: (level: StrengthLevel) => void
  strengthDisabled: boolean
}

type View = 'overview' | 'catalog' | 'contract'
type ContractStep = 'input' | 'output'

function ContractChip({
  label,
  tone = 'neutral',
}: {
  label: string
  tone?: 'neutral' | 'warning'
}) {
  return (
    <Chip
      tone={tone === 'warning' ? 'amber' : 'neutral'}
      size="sm"
      className="min-w-0 max-w-full"
    >
      {tone === 'warning' ? (
        <AlertTriangle aria-hidden="true" className="size-3 shrink-0" />
      ) : (
        <Check aria-hidden="true" className="size-3 shrink-0" />
      )}
      <span className="min-w-0 truncate">{label}</span>
    </Chip>
  )
}

export function MobileLutBrowser(props: MobileLutBrowserProps) {
  const { t } = useI18n()
  const { prefersReduced } = useToolMotion()
  const dragControls = useDragControls()
  const onlineSourceInputId = useId()
  const contractSearchId = useId()
  const [view, setView] = useState<View>('overview')
  const [catalogResourceId, setCatalogResourceId] = useState<string | null>(
    null,
  )
  const [loadingEntryId, setLoadingEntryId] = useState<string | null>(null)
  const [contractStep, setContractStep] = useState<ContractStep>('input')
  const [contractQuery, setContractQuery] = useState('')
  const initialContractEditorAppliedRef = useRef(false)
  const sheetBodyRef = useRef<HTMLDivElement | null>(null)

  const entriesByResourceId = useMemo(() => {
    const entries = new Map<
      string,
      UseOnlineLutSourcesResult['state']['entries']
    >()

    for (const resource of props.onlineLutSources?.state.resources ?? []) {
      entries.set(resource.id, [])
    }

    for (const entry of props.onlineLutSources?.state.entries ?? []) {
      entries.set(entry.resourceId, [
        ...(entries.get(entry.resourceId) ?? []),
        entry,
      ])
    }

    return entries
  }, [
    props.onlineLutSources?.state.entries,
    props.onlineLutSources?.state.resources,
  ])
  const issuesByResourceId = useMemo(() => {
    const issues = new Map<
      string,
      UseOnlineLutSourcesResult['state']['issues']
    >()

    for (const issue of props.onlineLutSources?.state.issues ?? []) {
      if (!issue.resourceId) continue

      issues.set(issue.resourceId, [
        ...(issues.get(issue.resourceId) ?? []),
        issue,
      ])
    }

    return issues
  }, [props.onlineLutSources?.state.issues])

  const profileSuggestions = useMemo(
    () =>
      props.lutProfileResolution?.kind === 'needs-user-selection'
        ? props.lutProfileResolution.suggestions
        : [],
    [props.lutProfileResolution],
  )
  const resolvedProfile = getResolvedProfile(
    props.lutProfileSelection,
    props.lutProfileResolution,
  )
  const outputLabel = getProfileOutputLabel(resolvedProfile)
  const attention = getContractAttentionState(
    props.lutProfileSelection,
    props.lutProfileResolution,
  )
  const displayOutputLabel =
    outputLabel && !attention.needsOutputContract ? outputLabel : undefined
  const [draftInputProfile, setDraftInputProfile] =
    useState<LUTColorProfile | null>(resolvedProfile ?? null)

  // Reset state when the sheet closes.
  useEffect(() => {
    if (props.open) return

    setView('overview')
    setCatalogResourceId(null)
    setContractStep('input')
    setContractQuery('')
    setDraftInputProfile(resolvedProfile ?? null)
    initialContractEditorAppliedRef.current = false
  }, [props.open, resolvedProfile])

  // Honour `initialContractEditorOpen` on first paint after open.
  useEffect(() => {
    if (
      !props.open ||
      !props.initialContractEditorOpen ||
      initialContractEditorAppliedRef.current
    ) {
      return
    }

    initialContractEditorAppliedRef.current = true
    setDraftInputProfile(resolvedProfile ?? null)
    setContractQuery('')
    setContractStep(
      attention.needsOutputContract && resolvedProfile ? 'output' : 'input',
    )
    setView('contract')
  }, [
    attention.needsOutputContract,
    props.initialContractEditorOpen,
    props.open,
    resolvedProfile,
  ])

  // Pop back to Overview if the resource we are browsing gets removed.
  useEffect(() => {
    if (view !== 'catalog' || !catalogResourceId) return
    const exists = (props.onlineLutSources?.state.resources ?? []).some(
      (r) => r.id === catalogResourceId,
    )
    if (!exists) {
      setView('overview')
      setCatalogResourceId(null)
    }
  }, [
    catalogResourceId,
    props.onlineLutSources?.state.resources,
    view,
  ])

  useEffect(() => {
    if (!props.open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [props.open])

  // Contract search results
  const contractSearchResults = useMemo(
    () => searchLUTColorProfiles(contractQuery),
    [contractQuery],
  )
  const hasContractQuery = contractQuery.trim().length > 0
  const resultIds = useMemo(
    () => new Set(contractSearchResults.map((profile) => profile.id)),
    [contractSearchResults],
  )
  const visibleSuggestions = useMemo(
    () =>
      dedupeProfiles(profileSuggestions).filter(
        (profile) => !hasContractQuery || resultIds.has(profile.id),
      ),
    [hasContractQuery, profileSuggestions, resultIds],
  )
  const suggestionIds = useMemo(
    () => new Set(visibleSuggestions.map((profile) => profile.id)),
    [visibleSuggestions],
  )
  const groupedInputProfiles = useMemo(
    () =>
      groupProfiles(
        dedupeProfiles(contractSearchResults).filter(
          (profile) => !suggestionIds.has(profile.id),
        ),
      ),
    [contractSearchResults, suggestionIds],
  )
  const suggestedOutputOptions = useMemo(
    () =>
      dedupeOutputOptions(
        visibleSuggestions
          .map(
            (profile) =>
              toDeclaredOutputOption(profile) ?? toSearchOutputOption(profile),
          )
          .filter(Boolean) as LUTOutputOption[],
      ),
    [visibleSuggestions],
  )
  const groupedOutputOptions = useMemo(
    () =>
      groupOutputOptions(
        dedupeOutputOptions(
          contractSearchResults
            .filter((profile) => !suggestionIds.has(profile.id))
            .map(toSearchOutputOption),
        ),
      ),
    [contractSearchResults, suggestionIds],
  )
  const activeOutputOptionId = useMemo(() => {
    if (
      !resolvedProfile?.outputGamut ||
      !resolvedProfile.outputTransfer ||
      !resolvedProfile.outputRange
    ) {
      return undefined
    }

    return `${resolvedProfile.id}:declared-output`
  }, [resolvedProfile])
  const hasInputMatches =
    visibleSuggestions.length > 0 || groupedInputProfiles.length > 0
  const hasOutputMatches =
    suggestedOutputOptions.length > 0 || groupedOutputOptions.length > 0

  const pushCatalog = (resourceId: string) => {
    setCatalogResourceId(resourceId)
    setView('catalog')
  }
  const pushContract = (step: ContractStep = 'input') => {
    setDraftInputProfile(resolvedProfile ?? null)
    setContractQuery('')
    setContractStep(step)
    setView('contract')
  }
  const backToOverview = () => {
    setView('overview')
    setCatalogResourceId(null)
  }
  const handleInputSelect = (profile: LUTColorProfile) => {
    setDraftInputProfile(profile)
    setContractQuery('')
    setContractStep('output')
  }
  const handleOutputSelect = (option: LUTOutputOption) => {
    const inputProfile = draftInputProfile ?? option.sourceProfile

    props.onLutProfileSelect(
      composeLUTContractProfile(inputProfile, toOutputCarrierProfile(option)),
    )
    setContractQuery('')
    backToOverview()
    if (sheetBodyRef.current) sheetBodyRef.current.scrollTop = 0
  }

  const contractActionLabel = attention.needsUserSelection
    ? t('raw.mobile.lut.chooseContract')
    : attention.needsOutputContract
      ? t('raw.mobile.lut.chooseOutput')
      : t('raw.mobile.lut.changeContract')

  const handleOpenChange = (open: boolean) => {
    if (!open) props.onClose()
  }

  const catalogResource = catalogResourceId
    ? (props.onlineLutSources?.state.resources ?? []).find(
        (r) => r.id === catalogResourceId,
      )
    : undefined
  const catalogEntries = catalogResourceId
    ? (entriesByResourceId.get(catalogResourceId) ?? [])
    : []
  const catalogIssues = catalogResourceId
    ? (issuesByResourceId.get(catalogResourceId) ?? [])
    : []

  const viewTransition = prefersReduced
    ? { type: 'tween' as const, duration: 0.12 }
    : sheetSpring

  return (
    <Dialog modal={false} open={props.open} onOpenChange={handleOpenChange}>
      <AnimatePresence>
        {props.open && (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Content
              asChild
              forceMount
              aria-label={t('raw.mobile.lut.title')}
              aria-describedby={undefined}
              onPointerDownOutside={(event) => event.preventDefault()}
              onInteractOutside={(event) => event.preventDefault()}
            >
              <m.aside
                key="lut-browser"
                data-mobile-substrate="ink-sheet"
                data-mobile-lut-view={view}
                className="absolute inset-x-0 bottom-0 z-[46] grid max-h-[82%] grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-t-xl border-t border-lf-hairline/40 bg-lf-paper-high pb-safe-offset-3 text-lf-ink shadow-[0_-14px_36px_-6px_oklch(0.18_0.018_76/0.22)]"
                initial={prefersReduced ? { opacity: 0 } : { y: '100%' }}
                animate={prefersReduced ? { opacity: 1 } : { y: '0%' }}
                exit={prefersReduced ? { opacity: 0 } : { y: '100%' }}
                transition={sheetSpring}
                drag={prefersReduced ? false : 'y'}
                dragControls={dragControls}
                dragListener={false}
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={{ top: 0, bottom: 0.4 }}
                onDragEnd={(_, info) => {
                  if (info.offset.y > 80 || info.velocity.y > 500)
                    props.onClose()
                }}
              >
                <div
                  className="grid gap-2 px-3.5 pb-3 pt-2.5"
                  onPointerDown={(event) => dragControls.start(event)}
                >
                  <div
                    aria-hidden="true"
                    className="mx-auto h-1 w-9 rounded-lf-pill bg-lf-ink/25"
                  />
                  <div className="flex items-center justify-between gap-2.5">
                    {view === 'overview' ? (
                      <DialogPrimitive.Title asChild>
                        <h2 className="m-0 text-[0.95rem] font-semibold text-lf-ink">
                          {t('raw.mobile.lut.title')}
                        </h2>
                      </DialogPrimitive.Title>
                    ) : (
                      <button
                        type="button"
                        aria-label={t('raw.mobile.lut.back')}
                        onClick={backToOverview}
                        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md px-1 text-lf-ink/80 transition-colors hover:bg-lf-ink/5 hover:text-lf-ink"
                      >
                        <ArrowLeft aria-hidden="true" className="size-5" />
                        <span className="text-[0.95rem] font-semibold">
                          {view === 'catalog'
                            ? (catalogResource?.label ??
                              catalogResource?.url ??
                              t('raw.mobile.lut.title'))
                            : t('raw.mobile.lut.editContract')}
                        </span>
                      </button>
                    )}
                    <IconButton
                      icon={X}
                      size="md"
                      aria-label={t('raw.mobile.lut.close')}
                      onClick={props.onClose}
                      className="size-[44px] rounded-md bg-transparent text-lf-ink/55 transition-colors hover:bg-lf-ink/5 hover:text-lf-ink [&_svg]:size-5 [&_svg]:stroke-current"
                    />
                  </div>
                </div>

                <div
                  ref={sheetBodyRef}
                  className="relative min-h-0 overflow-hidden"
                >
                  <AnimatePresence mode="popLayout" initial={false}>
                    {view === 'overview' && (
                      <m.div
                        key="overview"
                        data-mobile-lut-view-body="overview"
                        className="grid min-h-0 gap-3 overflow-y-auto px-4 pb-5 pt-1"
                        initial={prefersReduced ? { opacity: 0 } : { x: '-16%', opacity: 0.6 }}
                        animate={prefersReduced ? { opacity: 1 } : { x: 0, opacity: 1 }}
                        exit={prefersReduced ? { opacity: 0 } : { x: '-16%', opacity: 0.4 }}
                        transition={viewTransition}
                      >
                        {/* Current LUT */}
                        <section className="grid gap-2">
                          <h3 className="m-0 text-lf-body font-semibold text-lf-ink">
                            {t('raw.mobile.lut.currentHeading')}
                          </h3>
                          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md bg-lf-paper-warm/55 px-3 py-2.5">
                            <span className="min-w-0 truncate text-[0.82rem] font-semibold text-lf-ink">
                              {props.currentLutName ?? '—'}
                            </span>
                            <button
                              type="button"
                              className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-lf-hairline/45 bg-lf-paper px-2.5 text-xs font-semibold text-lf-ink/80 transition-colors hover:border-lf-amber/55 hover:bg-lf-paper-warm hover:text-lf-ink disabled:cursor-not-allowed disabled:opacity-50"
                              disabled={!props.currentLutName || props.disabled}
                              onClick={props.onLutClear}
                            >
                              {t('raw.mobile.lut.clear')}
                            </button>
                          </div>
                        </section>

                        {/* Strength */}
                        <section
                          className="grid gap-2"
                          data-raw-mobile-lut="strength"
                        >
                          <h3 className="m-0 text-lf-body font-semibold text-lf-ink">
                            {t('raw.strength.title')}
                          </h3>
                          <StrengthControl
                            value={props.activeIntensity}
                            onChange={props.onIntensitySelect}
                            disabled={props.strengthDisabled}
                          />
                        </section>

                        {/* Contract */}
                        {(props.currentLutName ||
                          props.lutProfileSelection ||
                          props.lutProfileResolution) && (
                          <section className="grid gap-2">
                            <div className="flex items-center justify-between gap-2">
                              <h3 className="m-0 text-lf-body font-semibold text-lf-ink">
                                {t('raw.mobile.lut.contractHeading')}
                              </h3>
                              <span
                                className={[
                                  'rounded-lf-pill border px-2 py-0.5 text-lf-eyebrow font-semibold',
                                  attention.needsAttention
                                    ? 'border-lf-amber bg-lf-amber-soft text-lf-ink'
                                    : 'border-lf-green-deep/30 bg-lf-green-soft text-lf-green-deep',
                                ].join(' ')}
                              >
                                {attention.needsAttention
                                  ? t('raw.mobile.lut.contractNeedsReview')
                                  : t('raw.mobile.lut.contractResolved')}
                              </span>
                            </div>

                            <div className="grid gap-2.5 rounded-md bg-lf-paper-warm/55 px-3 py-2.5">
                              {attention.needsUserSelection ? (
                                <p className="m-0 rounded-md border border-lf-amber/55 bg-lf-amber-soft/55 px-2.5 py-2 text-xs leading-relaxed text-lf-ink">
                                  {attention.unsupportedOutput
                                    ? t('raw.lutContract.unsupportedOutput')
                                    : t('raw.lutContract.unknown')}
                                </p>
                              ) : resolvedProfile ? (
                                <div className="grid gap-2">
                                  <div className="grid gap-1">
                                    <span className="text-[0.66rem] tracking-tight font-semibold uppercase text-lf-ink/55">
                                      {t('raw.lutContract.inputTerm')}
                                    </span>
                                    <ContractChip label={resolvedProfile.label} />
                                  </div>
                                  <div className="grid gap-1">
                                    <span className="text-[0.66rem] tracking-tight font-semibold uppercase text-lf-ink/55">
                                      {t('raw.lutContract.outputTerm')}
                                    </span>
                                    <ContractChip
                                      label={
                                        displayOutputLabel ??
                                        t('raw.mobile.lut.outputRequired')
                                      }
                                      tone={
                                        attention.needsOutputContract
                                          ? 'warning'
                                          : 'neutral'
                                      }
                                    />
                                  </div>
                                  {attention.needsOutputContract && (
                                    <p className="m-0 rounded-md border border-lf-amber/55 bg-lf-amber-soft/55 px-2.5 py-2 text-xs leading-relaxed text-lf-ink">
                                      {t('raw.lutContract.needsOutput')}
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <p className="m-0 text-xs leading-relaxed text-lf-ink-soft">
                                  {t('raw.mobile.lut.noContract')}
                                </p>
                              )}

                              <button
                                type="button"
                                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md border border-lf-amber/55 bg-lf-amber-soft px-3 text-lf-control font-semibold text-lf-ink transition-colors hover:border-lf-amber hover:bg-lf-amber/30 disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={props.disabled}
                                onClick={() =>
                                  pushContract(
                                    attention.needsOutputContract &&
                                      resolvedProfile
                                      ? 'output'
                                      : 'input',
                                  )
                                }
                              >
                                {contractActionLabel}
                              </button>
                            </div>
                          </section>
                        )}

                        {/* Upload */}
                        <section className="grid gap-2.5">
                          <h3 className="m-0 text-lf-body font-semibold text-lf-ink">
                            {t('raw.mobile.lut.uploadHeading')}
                          </h3>
                          <Dropzone
                            onFileDrop={props.onLutLoad}
                            accept={['.cube']}
                            multiple
                            disabled={props.disabled}
                            aria-label={t('raw.mobile.lut.uploadAria')}
                            className="grid min-h-20 place-items-center border-lf-hairline/45 bg-lf-paper-warm/55 px-3 py-4 text-center"
                            interactiveMotion={false}
                          >
                            <div className="grid gap-1">
                              <span className="text-lf-control font-semibold text-lf-ink">
                                {t('raw.mobile.lut.uploadTitle')}
                              </span>
                              <span className="text-xs text-lf-ink-soft">
                                {t('raw.mobile.lut.uploadHint')}
                              </span>
                            </div>
                          </Dropzone>
                        </section>

                        {/* Online sources */}
                        {props.onlineLutSources && (
                          <section className="grid gap-2">
                            <div className="flex items-center justify-between gap-2">
                              <h3 className="m-0 text-lf-body font-semibold text-lf-ink">
                                {t('raw.mobile.lut.onlineHeading')}
                              </h3>
                              <button
                                type="button"
                                aria-label={t('raw.lutSource.copy')}
                                disabled={!props.onlineLutSources.share.enabled}
                                onClick={() => {
                                  props.onlineLutSources?.share.copy().then(
                                    () =>
                                      toast.success(t('raw.lutSource.copied')),
                                    () =>
                                      toast.error(
                                        t('raw.lutSource.copyFailed'),
                                      ),
                                  )
                                }}
                                className="grid size-[44px] shrink-0 place-items-center rounded-md border border-lf-hairline/45 bg-lf-paper text-lf-ink/70 transition-colors hover:border-lf-amber/55 hover:bg-lf-paper-warm hover:text-lf-ink disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <Share2 aria-hidden="true" className="size-5" />
                              </button>
                            </div>
                            <form
                              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2"
                              onSubmit={(event) => {
                                event.preventDefault()
                                if (
                                  !props.onlineLutSources?.sourceUrlInput.trim()
                                ) {
                                  return
                                }
                                void props.onlineLutSources?.addSourceFromInput()
                              }}
                            >
                              <label
                                htmlFor={onlineSourceInputId}
                                className="sr-only"
                              >
                                {t('raw.lutSource.url')}
                              </label>
                              <Input
                                id={onlineSourceInputId}
                                type="url"
                                inputMode="url"
                                autoComplete="off"
                                autoCapitalize="off"
                                autoCorrect="off"
                                spellCheck={false}
                                value={props.onlineLutSources.sourceUrlInput}
                                placeholder="https://.../catalog.json"
                                onChange={(event) =>
                                  props.onlineLutSources?.setSourceUrlInput(
                                    event.currentTarget.value,
                                  )
                                }
                                inputClassName="h-[44px] rounded-md border-lf-hairline/45 bg-lf-paper text-lf-control text-lf-ink shadow-none placeholder:text-lf-ink/40 focus:border-lf-amber focus:ring-lf-amber/20"
                              />
                              <button
                                type="submit"
                                aria-label={t('raw.lutSource.add')}
                                disabled={
                                  !props.onlineLutSources.sourceUrlInput.trim()
                                }
                                className="grid size-[44px] shrink-0 place-items-center rounded-md border border-lf-hairline/45 bg-lf-paper text-lf-ink/70 transition-colors hover:border-lf-amber/55 hover:bg-lf-paper-warm hover:text-lf-ink disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <Plus aria-hidden="true" className="size-5" />
                              </button>
                            </form>
                            {props.onlineLutSources.state.resources.length ===
                              0 && (
                              <p className="m-0 text-xs leading-relaxed text-lf-ink-soft">
                                {t('raw.lutSource.emptyHint')}
                              </p>
                            )}
                            <div
                              className="grid gap-2"
                              aria-busy={
                                props.onlineLutSources.state.isLoading
                              }
                            >
                              {props.onlineLutSources.state.isLoading && (
                                <p
                                  className="m-0 rounded-md border border-lf-green-deep/30 bg-lf-green-soft/55 px-2.5 py-2 text-xs font-semibold text-lf-green-deep"
                                  role="status"
                                >
                                  {t('raw.mobile.lut.loading')}
                                </p>
                              )}
                              {props.onlineLutSources.state.resources.map(
                                (resource) => {
                                  const entries =
                                    entriesByResourceId.get(resource.id) ?? []
                                  const issues =
                                    issuesByResourceId.get(resource.id) ?? []
                                  const isLoading =
                                    props.onlineLutSources!.state.isLoading &&
                                    props.onlineLutSources!.state
                                      .activeResourceId === resource.id

                                  return (
                                    <MobileLutSourceCard
                                      key={resource.id}
                                      resource={resource}
                                      entryCount={entries.length}
                                      isLoading={isLoading}
                                      issues={issues}
                                      onBrowse={() => pushCatalog(resource.id)}
                                      onRefresh={() =>
                                        void props.onlineLutSources?.refreshSource(
                                          resource.id,
                                        )
                                      }
                                      onRemove={() =>
                                        props.onlineLutSources?.removeSource(
                                          resource.id,
                                        )
                                      }
                                    />
                                  )
                                },
                              )}
                            </div>
                          </section>
                        )}
                      </m.div>
                    )}

                    {view === 'catalog' && catalogResource && (
                      <m.div
                        key={`catalog-${catalogResource.id}`}
                        data-mobile-lut-view-body="catalog"
                        className="grid min-h-0 gap-3 overflow-y-auto px-4 pb-5 pt-1"
                        initial={prefersReduced ? { opacity: 0 } : { x: '100%' }}
                        animate={prefersReduced ? { opacity: 1 } : { x: 0 }}
                        exit={prefersReduced ? { opacity: 0 } : { x: '100%' }}
                        transition={viewTransition}
                      >
                        {catalogIssues.length > 0 && (
                          <ul
                            className="m-0 grid list-none gap-1 p-0"
                            role="status"
                            aria-live="polite"
                          >
                            {catalogIssues.map((issue, index) => (
                              <li
                                key={[
                                  issue.code,
                                  issue.entryId ??
                                    issue.sourceUrl ??
                                    'resource',
                                  index,
                                ].join(':')}
                                className="m-0"
                              >
                                <Chip
                                  tone="amber"
                                  size="sm"
                                  className="max-w-full"
                                >
                                  <AlertTriangle
                                    aria-hidden="true"
                                    className="size-3 shrink-0"
                                  />
                                  <span className="min-w-0 truncate">
                                    {issue.message}
                                  </span>
                                </Chip>
                              </li>
                            ))}
                          </ul>
                        )}
                        {(() => {
                          const { families, others } =
                            groupEntriesByFamily(catalogEntries)
                          const renderEntry = (
                            entry: (typeof catalogEntries)[number],
                          ) => {
                            const loading = loadingEntryId === entry.id
                            const handleLoad = async () => {
                              if (
                                loadingEntryId ||
                                !props.onlineLutSources
                              ) {
                                return
                              }
                              setLoadingEntryId(entry.id)
                              await new Promise<void>((resolve) =>
                                requestAnimationFrame(() => resolve()),
                              )
                              try {
                                await props.onlineLutSources.loadEntry(
                                  entry.id,
                                )
                                backToOverview()
                              } catch {
                                // per-resource issue chip surfaces the failure
                              } finally {
                                setLoadingEntryId(null)
                              }
                            }
                            return (
                              <MobileLutCatalogEntryButton
                                key={entry.id}
                                title={entry.title}
                                loading={loading}
                                disabled={props.disabled}
                                ariaLabel={t('raw.mobile.lut.loadEntry', {
                                  label: entry.title,
                                })}
                                onClick={() => void handleLoad()}
                              />
                            )
                          }
                          return (
                            <>
                              {families.map(({ family, items }) => (
                                <div key={family} className="grid gap-1.5">
                                  <p className="m-0 px-1 text-[0.66rem] tracking-tight font-semibold uppercase text-lf-ink/55">
                                    {family}
                                  </p>
                                  <div className="grid gap-1.5">
                                    {items.map(renderEntry)}
                                  </div>
                                </div>
                              ))}
                              {others.length > 0 && (
                                <div className="grid gap-1.5">
                                  <p className="m-0 px-1 text-[0.66rem] tracking-tight font-semibold uppercase text-lf-ink/55">
                                    {t('raw.lutSource.others')}
                                  </p>
                                  <div className="grid gap-1.5">
                                    {others.map(renderEntry)}
                                  </div>
                                </div>
                              )}
                              {catalogEntries.length === 0 && (
                                <p className="m-0 text-xs leading-relaxed text-lf-ink-soft">
                                  {catalogIssues.length > 0
                                    ? t('raw.lutSource.noneCompatible')
                                    : t('raw.lutSource.noneYet')}
                                </p>
                              )}
                            </>
                          )
                        })()}
                      </m.div>
                    )}

                    {view === 'contract' && (
                      <m.div
                        key="contract"
                        data-mobile-lut-view-body="contract"
                        className="grid min-h-0 gap-2.5 overflow-y-auto px-4 pb-5 pt-1"
                        initial={prefersReduced ? { opacity: 0 } : { x: '100%' }}
                        animate={prefersReduced ? { opacity: 1 } : { x: 0 }}
                        exit={prefersReduced ? { opacity: 0 } : { x: '100%' }}
                        transition={viewTransition}
                      >
                        <div
                          className="relative grid grid-cols-2 rounded-md bg-[oklch(from_var(--color-lf-ink)_l_c_h_/_0.05)] p-0.5"
                          role="tablist"
                          aria-label={t('raw.lutContract.panels')}
                        >
                          {(['input', 'output'] as const).map((tabId) => {
                            const isActive = contractStep === tabId
                            const labelText =
                              tabId === 'input'
                                ? t('raw.lutContract.inputTab')
                                : t('raw.lutContract.outputTab')
                            return (
                              <button
                                key={tabId}
                                type="button"
                                role="tab"
                                aria-selected={isActive}
                                className={[
                                  'relative z-10 min-h-[44px] rounded-[5px] px-2 text-[0.82rem] transition-colors duration-150',
                                  'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-lf-green',
                                  isActive
                                    ? 'font-semibold text-lf-ink/90'
                                    : 'font-normal text-lf-ink/50 hover:text-lf-ink/75',
                                ].join(' ')}
                                onClick={() => setContractStep(tabId)}
                              >
                                {isActive && (
                                  <m.span
                                    layoutId="mobile-lut-contract-tab-indicator"
                                    aria-hidden="true"
                                    className="absolute inset-0 -z-10 rounded-[5px] bg-lf-paper-high shadow-lf-soft"
                                    transition={{
                                      type: 'spring',
                                      stiffness: 460,
                                      damping: 38,
                                      mass: 0.6,
                                    }}
                                  />
                                )}
                                <span className="relative">{labelText}</span>
                              </button>
                            )
                          })}
                        </div>

                        <label className="sr-only" htmlFor={contractSearchId}>
                          {t('raw.lutContract.search')}
                        </label>
                        <Input
                          id={contractSearchId}
                          type="search"
                          aria-label={t('raw.lutContract.search')}
                          value={contractQuery}
                          placeholder={t('raw.lutContract.searchPlaceholder')}
                          onChange={(event) =>
                            setContractQuery(event.currentTarget.value)
                          }
                          inputClassName="h-[44px] rounded-md border-lf-hairline/45 bg-lf-paper text-lf-control text-lf-ink shadow-none placeholder:text-lf-ink/40 focus:border-lf-amber focus:ring-lf-amber/20"
                        />

                        <div
                          className="grid min-h-0 content-start gap-1.5 overflow-y-auto overscroll-contain pr-0.5"
                          data-raw-mobile-lut="contract-list"
                          data-lut-contract-step={contractStep}
                        >
                          {contractStep === 'input' ? (
                            <>
                              {visibleSuggestions.length > 0 && (
                                <div className="grid gap-1">
                                  <p className="m-0 px-1 text-[0.66rem] tracking-tight font-semibold uppercase text-lf-ink/55">
                                    {t('raw.lutContract.suggestedInput')}
                                  </p>
                                  <div className="grid gap-1">
                                    {visibleSuggestions.map((profile) => (
                                      <LUTProfileButton
                                        key={profile.id}
                                        profile={profile}
                                        activeProfileId={
                                          draftInputProfile?.id
                                        }
                                        label={profile.label}
                                        ariaLabel={t(
                                          'raw.lutContract.useInput',
                                          {
                                            label: profile.label,
                                          },
                                        )}
                                        onSelect={handleInputSelect}
                                        highlighted
                                        size="touch"
                                      />
                                    ))}
                                  </div>
                                </div>
                              )}
                              {groupedInputProfiles.map((group) => (
                                <div
                                  key={`input-${group.label}`}
                                  className="grid gap-1"
                                >
                                  <p className="m-0 px-1 text-[0.66rem] tracking-tight font-semibold uppercase text-lf-ink/55">
                                    {t('raw.lutContract.groupInput', {
                                      group: group.label,
                                    })}
                                  </p>
                                  <div className="grid gap-1">
                                    {group.items.map((profile) => (
                                      <LUTProfileButton
                                        key={profile.id}
                                        profile={profile}
                                        activeProfileId={
                                          draftInputProfile?.id
                                        }
                                        label={profile.label}
                                        ariaLabel={t(
                                          'raw.lutContract.useInput',
                                          {
                                            label: profile.label,
                                          },
                                        )}
                                        onSelect={handleInputSelect}
                                        size="touch"
                                      />
                                    ))}
                                  </div>
                                </div>
                              ))}
                              {!hasInputMatches && (
                                <p className="m-0 text-lf-control leading-relaxed text-lf-ink-soft">
                                  {t('raw.lutContract.noInput')}
                                </p>
                              )}
                            </>
                          ) : (
                            <>
                              {suggestedOutputOptions.length > 0 && (
                                <div className="grid gap-1">
                                  <p className="m-0 px-1 text-[0.66rem] tracking-tight font-semibold uppercase text-lf-ink/55">
                                    {t('raw.lutContract.suggestedOutput')}
                                  </p>
                                  <div className="grid gap-1">
                                    {suggestedOutputOptions.map((option) => (
                                      <LUTOutputOptionButton
                                        key={option.id}
                                        option={option}
                                        activeOptionId={activeOutputOptionId}
                                        onSelect={handleOutputSelect}
                                        highlighted
                                        size="touch"
                                      />
                                    ))}
                                  </div>
                                </div>
                              )}
                              {groupedOutputOptions.map((group) => (
                                <div
                                  key={`output-${group.label}`}
                                  className="grid gap-1"
                                >
                                  <p className="m-0 px-1 text-[0.66rem] tracking-tight font-semibold uppercase text-lf-ink/55">
                                    {t('raw.lutContract.groupOutput', {
                                      group: group.label,
                                    })}
                                  </p>
                                  <div className="grid gap-1">
                                    {group.items.map((option) => (
                                      <LUTOutputOptionButton
                                        key={option.id}
                                        option={option}
                                        activeOptionId={activeOutputOptionId}
                                        onSelect={handleOutputSelect}
                                        size="touch"
                                      />
                                    ))}
                                  </div>
                                </div>
                              ))}
                              {!hasOutputMatches && (
                                <p className="m-0 text-lf-control leading-relaxed text-lf-ink-soft">
                                  {t('raw.lutContract.noOutput')}
                                </p>
                              )}
                            </>
                          )}
                        </div>
                      </m.div>
                    )}
                  </AnimatePresence>
                </div>
              </m.aside>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </Dialog>
  )
}
```

- [ ] **Step 2: Update `MobileLutBrowser.test.tsx` fixtures**

Add the three new props to `baseProps`:

```ts
const baseProps = {
  open: true,
  onClose: vi.fn(),
  currentLutName: 'Kodak 2383.cube',
  disabled: false,
  onLutLoad: vi.fn(),
  onLutClear: vi.fn(),
  lutProfileSelection: null,
  lutProfileResolution: null,
  onLutProfileSelect: vi.fn(),
  // NEW
  activeIntensity: 'standard' as const,
  onIntensitySelect: vi.fn(),
  strengthDisabled: false,
}
```

- [ ] **Step 3: Add navigation tests**

Append inside the `describe('mobileLutBrowser', ...)` block:

```ts
it('renders Strength in the Overview and disables it when no LUT is applied', () => {
  const { rerender } = render(<MobileLutBrowser {...baseProps} />)
  const strengthGroup = screen.getByRole('radiogroup', { name: /strength/i })
  expect(strengthGroup).toBeInTheDocument()

  rerender(
    <MobileLutBrowser {...baseProps} strengthDisabled currentLutName={null} />,
  )
  // SegmentGroup applies aria-disabled at the wrapper; check the closest
  // wrapper carries the disabled affordance.
  expect(
    screen.getByRole('radiogroup', { name: /strength/i }).closest(
      '[aria-disabled="true"]',
    ),
  ).not.toBeNull()
})

it('pushes the Catalog view from a source card and pops back on load', async () => {
  const onlineLutSources = onlineLutSourcesFixture()
  render(
    <MobileLutBrowser {...baseProps} onlineLutSources={onlineLutSources} />,
  )

  await userEvent.click(
    screen.getByRole('button', { name: /Open Profiles catalog/i }),
  )

  expect(screen.getByRole('button', { name: /back to lut browser/i }))
    .toBeInTheDocument()
  const entry = await screen.findByRole('button', {
    name: /Load Kodak 2383 Rec.709/i,
  })
  await userEvent.click(entry)

  // loadEntry success pops to Overview — back-button gone, top heading back.
  expect(
    screen.queryByRole('button', { name: /back to lut browser/i }),
  ).not.toBeInTheDocument()
  expect(onlineLutSources.loadEntry).toHaveBeenCalledWith('kodak-2383-rec709')
})

it('pushes the Contract view when the user changes the contract', async () => {
  render(<MobileLutBrowser {...baseProps} />)
  await userEvent.click(
    screen.getByRole('button', { name: /change lut contract/i }),
  )
  expect(
    screen.getByRole('tab', { name: /input/i }),
  ).toBeInTheDocument()
  await userEvent.click(
    screen.getByRole('button', { name: /back to lut browser/i }),
  )
  expect(
    screen.queryByRole('tab', { name: /input/i }),
  ).not.toBeInTheDocument()
})

it('opens directly into the Contract view when initialContractEditorOpen is true', () => {
  render(<MobileLutBrowser {...baseProps} initialContractEditorOpen />)
  expect(screen.getByRole('tab', { name: /input/i })).toBeInTheDocument()
})
```

If existing tests assume inline entry buttons in the Overview (e.g. the `'loads an online LUT entry row'` test), update them to:

1. Click Browse on the source card first.
2. Then click the entry button inside the Catalog view.

Apply the same shim wherever a test previously expected to see entries listed in the top-level sheet.

- [ ] **Step 4: Run the mobile LUT tests**

Run: `pnpm vitest run src/modules/raw-processor/components/mobile/MobileLutBrowser.test.tsx`
Expected: all tests pass. Fix any test that fails because it was asserting the old flat layout.

- [ ] **Step 5: Lint**

Run: `pnpm lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/modules/raw-processor/components/mobile/MobileLutBrowser.tsx \
        src/modules/raw-processor/components/mobile/MobileLutBrowser.test.tsx
git commit --no-gpg-sign -m "refactor(raw-mobile): master-detail LUT browser with strength in overview"
```

---

## Task 11: Trim `MobileMode` and `MobileModeDock`

**Files:**
- Modify: `src/modules/raw-processor/components/mobile/MobileModeDock.tsx`
- Modify: `src/modules/raw-processor/components/mobile/MobileModeDock.test.tsx`

- [ ] **Step 1: Update `MobileModeDock.tsx`**

Replace the imports and TABS so `strength` is gone:

```tsx
import type { LucideIcon } from 'lucide-react'
import {
  Download,
  SlidersHorizontal,
  SplitSquareHorizontal,
  Wand2,
} from 'lucide-react'
import { m } from 'motion/react'
import type { ReactNode } from 'react'

import { clsxm } from '~/lib/cn'
import type { Translate } from '~/lib/i18n'
import { useI18n } from '~/lib/i18n'

import { TAP_SPRING } from '../../motion'

export type MobileMode = 'look' | 'tone' | 'compare' | 'export'

const TABS: {
  id: MobileMode
  icon: LucideIcon
  labelKey: Parameters<Translate>[0]
  primary?: boolean
}[] = [
  { id: 'look', icon: Wand2, labelKey: 'raw.mobile.mode.look' },
  { id: 'tone', icon: SlidersHorizontal, labelKey: 'raw.mobile.mode.tone' },
  {
    id: 'compare',
    icon: SplitSquareHorizontal,
    labelKey: 'raw.mobile.mode.compare',
  },
  {
    id: 'export',
    icon: Download,
    labelKey: 'raw.mobile.mode.export',
    primary: true,
  },
]
```

Update the `<nav>` grid class:

```tsx
<nav
  aria-label={t('raw.mobile.modes.aria')}
  role="tablist"
  className="grid grid-cols-4 gap-1 border-t border-lf-on-photo-bord-soft px-2.5 pb-2 pt-2"
>
```

(Everything else in the file is unchanged.)

- [ ] **Step 2: Update `MobileModeDock.test.tsx`**

Replace the first test that expects 5 tabs / clicks the strength tab:

```tsx
it('renders the handoff mode tabs and switches mode when expanded', async () => {
  const onModeChange = vi.fn()
  const onOpenMore = vi.fn()
  render(
    <MobileModeDock
      mode="tone"
      expanded
      onModeChange={onModeChange}
      onCollapse={vi.fn()}
      onOpenMore={onOpenMore}
      canExport={false}
      panel={<div data-testid="panel">tone-panel</div>}
    />,
  )
  expect(screen.getByTestId('panel')).toHaveTextContent('tone-panel')
  const tabs = screen.getAllByRole('tab')
  expect(tabs).toHaveLength(4)
  expect(screen.queryByRole('tab', { name: /more/i })).not.toBeInTheDocument()
  expect(
    screen.queryByRole('tab', { name: /strength/i }),
  ).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('tab', { name: /look/i }))
  expect(onModeChange).toHaveBeenCalledWith('look')
  await userEvent.click(screen.getByRole('tab', { name: /compare/i }))
  expect(onModeChange).toHaveBeenCalledWith('compare')
  expect(onOpenMore).not.toHaveBeenCalled()
})
```

- [ ] **Step 3: Run the dock tests**

Run: `pnpm vitest run src/modules/raw-processor/components/mobile/MobileModeDock.test.tsx`
Expected: pass (all four tests in the file).

- [ ] **Step 4: Commit**

```bash
git add src/modules/raw-processor/components/mobile/MobileModeDock.tsx \
        src/modules/raw-processor/components/mobile/MobileModeDock.test.tsx
git commit --no-gpg-sign -m "refactor(raw-mobile): drop strength dock tab"
```

---

## Task 12: Strip strength branch from `MobileLabChrome`

**Files:**
- Modify: `src/modules/raw-processor/components/mobile/MobileLabChrome.tsx`
- Modify: `src/modules/raw-processor/components/mobile/MobileLabChrome.test.tsx`

- [ ] **Step 1: Remove the `strengthControl` prop**

In `MobileLabChrome.tsx` props (around line 62), delete the `strengthControl: ReactNode` line.

- [ ] **Step 2: Remove the strength branch in the `panel` ternary**

At ~line 398, delete the `mode === 'strength' ? ( props.strengthControl ) :` clause. The ternary now reads:

```tsx
const panel =
  mode === 'tone' ? (
    <ToneStripPanel ... />
  ) : mode === 'look' ? (
    <div className="grid gap-2.5">...</div>
  ) : mode === 'compare' ? (
    <MobileComparePanel ... />
  ) : (
    props.exportPanel
  )
```

- [ ] **Step 3: Remove the unused `ReactNode` import if it becomes orphaned**

After removing `strengthControl: ReactNode`, check whether any other prop typed as `ReactNode` remains in the props block. `exportPanel: ReactNode` is still there, so the import stays.

- [ ] **Step 4: Update `MobileLabChrome.test.tsx`**

Adjust the test fixture (`base` props) — remove any `strengthControl: <MobileStrengthPanel ... />` or test-only stub. If the test passed `strengthControl={...}`, drop it; if instead the test passed `strengthControl={<div>strength</div>}`, drop it as well.

Then rewrite the test currently at lines 135–148:

```tsx
it('look mode opens the LUT browser and dock has no strength tab', async () => {
  render(<MobileLabChrome {...base} />)
  const dock = screen.getByRole('tablist', { name: /lab modes/i })
  expect(within(dock).getAllByRole('tab')).toHaveLength(4)
  expect(
    within(dock).queryByRole('tab', { name: /strength/i }),
  ).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: /lut browser/i }))
  expect(
    screen.getByRole('dialog', { name: /lut browser/i }),
  ).toBeInTheDocument()
})
```

Also remove or update the two other lines that referenced `screen.queryByText('strength')` (the `keeps the mobile topbar...` test at line 177 and the rerender at line 138). Remove those assertions — they were verifying behavior of the strength panel that no longer exists.

- [ ] **Step 5: Run the chrome tests**

Run: `pnpm vitest run src/modules/raw-processor/components/mobile/MobileLabChrome.test.tsx`
Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add src/modules/raw-processor/components/mobile/MobileLabChrome.tsx \
        src/modules/raw-processor/components/mobile/MobileLabChrome.test.tsx
git commit --no-gpg-sign -m "refactor(raw-mobile): drop strength branch from MobileLabChrome"
```

---

## Task 13: Plumb strength through `RawToolSurface` to the LUT browser

**Files:**
- Modify: `src/modules/raw-processor/components/RawToolSurface.tsx`

- [ ] **Step 1: Remove `MobileStrengthPanel` import**

Delete this line (currently ~line 23):

```ts
import { MobileStrengthPanel } from './mobile/MobileStrengthPanel'
```

- [ ] **Step 2: Delete the `mobileStrengthControl` synthesis**

Remove the block (currently ~lines 117–125):

```tsx
const mobileStrengthControl = (
  <MobileStrengthPanel
    value={props.activeIntensity}
    onChange={props.onIntensitySelect}
    disabled={mobileStrengthDisabled}
  />
)
```

- [ ] **Step 3: Extend `mobileLutBrowser` object with strength fields**

Update the `mobileLutBrowser` object (currently ~lines 146–155):

```tsx
const mobileLutBrowser = {
  currentLutName: props.currentLutName,
  disabled: props.isProcessing || lutDropDisabled,
  onLutLoad: props.onLutLoad,
  onLutClear: props.onLutClear,
  lutProfileSelection: props.lutProfileSelection,
  lutProfileResolution: props.lutProfileResolution,
  onLutProfileSelect: props.onLutProfileSelect,
  onlineLutSources: props.onlineLutSources,
  activeIntensity: props.activeIntensity,
  onIntensitySelect: props.onIntensitySelect,
  strengthDisabled: mobileStrengthDisabled,
}
```

- [ ] **Step 4: Remove the `strengthControl` prop from the `<MobileLabChrome />` JSX**

In the JSX (currently ~line 330), delete the line:

```tsx
strengthControl={mobileStrengthControl}
```

- [ ] **Step 5: Type-check the whole app**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 6: Run the mobile + raw-processor suites**

Run: `pnpm vitest run src/modules/raw-processor`
Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add src/modules/raw-processor/components/RawToolSurface.tsx
git commit --no-gpg-sign -m "refactor(raw-mobile): plumb strength into LUT browser overview"
```

---

## Task 14: Delete `MobileStrengthPanel` and prune i18n keys

**Files:**
- Delete: `src/modules/raw-processor/components/mobile/MobileStrengthPanel.tsx`
- Modify: `src/locales/en.json`
- Modify: `src/locales/zh-CN.json`

- [ ] **Step 1: Sanity-check no consumers remain**

Run: `grep -rn "MobileStrengthPanel" src/ --include="*.ts" --include="*.tsx" 2>/dev/null`
Expected: no output. If anything still references it, return to Task 13 and clean those up before deleting.

- [ ] **Step 2: Delete the component file**

Run: `git rm src/modules/raw-processor/components/mobile/MobileStrengthPanel.tsx`

- [ ] **Step 3: Remove i18n keys**

In `src/locales/en.json`, delete:

```json
"raw.mobile.mode.strength": "Strength",
```
```json
"raw.mobile.strength.note": "How aggressively the LUT and tone settings are applied at full-resolution export. Default Standard matches the desktop pipeline.",
```

In `src/locales/zh-CN.json`, delete:

```json
"raw.mobile.mode.strength": "强度",
```
```json
"raw.mobile.strength.note": "导出全分辨率时 LUT 与影调设置的施加强度。默认 Standard 与桌面端管线一致。",
```

- [ ] **Step 4: Verify JSON parse**

Run: `node -e "JSON.parse(require('fs').readFileSync('src/locales/en.json','utf8'))" && node -e "JSON.parse(require('fs').readFileSync('src/locales/zh-CN.json','utf8'))"`
Expected: exit 0.

- [ ] **Step 5: Sanity-check no consumers of the deleted i18n keys**

Run:
```
grep -rn "raw.mobile.mode.strength\|raw.mobile.strength.note" src/ --include="*.ts" --include="*.tsx" --include="*.json"
```
Expected: no output (locales already cleaned, no source code references).

- [ ] **Step 6: Commit**

```bash
git add -A src/modules/raw-processor/components/mobile/MobileStrengthPanel.tsx \
       src/locales/en.json src/locales/zh-CN.json
git commit --no-gpg-sign -m "chore(raw-mobile): drop MobileStrengthPanel and dead i18n keys"
```

---

## Task 15: Final verification

**Files:** none modified — verification only.

- [ ] **Step 1: Run UI test sweep**

Run: `pnpm test:ui`
Expected: pass.

- [ ] **Step 2: Lint the workspace**

Run: `pnpm lint`
Expected: clean.

- [ ] **Step 3: Type-check the app**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`
Expected: clean.

- [ ] **Step 4: Browser validation (mobile viewport ≤ 640px)**

Start preview server (per `project_raw_browser_validation` — use vite preview, not dev):

```
pnpm build && pnpm preview
```

Open the served URL in a browser at a ≤ 640px viewport. Validate:

1. Open `/raw`, load a RAW file from a test fixture (or use the empty state to skip — RAW decode is gated in headless contexts; manual desktop browser is fine).
2. Open the LUT browser. Confirm Overview shows: current LUT row, Strength (disabled when no LUT applied), upload, online sources list.
3. Add a sample online catalog URL (use any known good fixture). Confirm a source card appears with Browse / Refresh / Remove buttons and the entries do NOT inline.
4. Tap Browse — confirm Catalog view slides in with a Back arrow and family groupings.
5. Tap an entry — confirm a load happens and the sheet returns to Overview.
6. Tap Change/Choose contract — confirm Contract view slides in with Input/Output tabs, search, and touch-sized rows. Pick an output. Confirm the sheet returns to Overview and the LUT contract status updates.
7. Confirm the dock has 4 tabs (Look / Tone / Compare / Export) — no Strength tab.

- [ ] **Step 5: Stage and verify the full diff is clean**

Run: `git status` and `git log --oneline origin/main..HEAD`
Expected: A series of commits matching Tasks 1–14, no untracked debris.

- [ ] **Step 6: (Optional) PR-ready commit message summary**

If a PR is being raised, gather the commit list with `git log --oneline origin/main..HEAD` and use the spec as the PR body backbone.

---

## Self-Review Notes

- **Spec coverage check:**
  - View state machine, push/pop, animations → Task 10.
  - Strength in Overview using desktop `StrengthControl` → Tasks 10 + 13.
  - Remove `strength` mode → Tasks 11 + 12 + 13 + 14.
  - New `MobileLutSourceCard` / `MobileLutCatalogEntryButton` → Tasks 8 + 9.
  - `groupEntriesByFamily` + `OnlineLutSourceControls` adoption → Tasks 1 + 2.
  - `getContractAttentionState` + `LUTProfileStatus` adoption → Tasks 3 + 4.
  - `LUTProfileButton` / `LUTOutputOptionButton` size variant → Tasks 5 + 6.
  - i18n adds → Task 7; i18n removes → Task 14.
  - Tests: helper, view nav, dock, chrome → Tasks 1, 3, 10, 11, 12.
  - Verification (UI + browser) → Task 15.
- **Type consistency:**
  - `MobileMode` literal: changed in Task 11; consumers in `MobileLabChrome` (Task 12) and `useState<MobileMode>('look')` initial value (stays 'look' — safe).
  - `MobileLutBrowserProps` additions: `activeIntensity` / `onIntensitySelect` / `strengthDisabled` consistent between Task 10 (declared) and Task 13 (plumbed).
  - `getContractAttentionState` shape consistent between Task 3 (definition) and Task 10 (consumer) and Task 4 (consumer).
- **Placeholder scan:** No TBDs, no “add appropriate handling”. All test bodies and components are written out in full. Spec link is in the header.
