# Mobile Preview Tap — Layering & Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the mobile `/raw` preview tap self-consistent — a tap on an exposed preview while a bottom sheet is open closes the sheet (instead of toggling immersive behind it), and entering/leaving immersive while the dock panel is expanded collapses the panel first, then recedes the chrome.

**Architecture:** Keep the pure immersive toggle as the core tap semantics. Add a one-layer precedence rule in the `onTap` callback (sheet open → close sheet; else toggle immersive) and suppress long-press peek while a sheet is open via the existing `allowPeek` switch. Replace the atomic immersive flip on the user-initiated path with sequenced `enterImmersive`/`exitImmersive` helpers that stagger the dock-panel collapse against the chrome recede using a short timer (instant under reduced motion). All logic lives in `MobileLabChrome.tsx`; `useMobilePreviewGestures` is unchanged.

**Tech Stack:** React, TypeScript, `motion/react` (`m`, `AnimatePresence`), Vitest + Testing Library, `~/` alias, pnpm.

**Spec:** `docs/superpowers/specs/2026-05-29-mobile-preview-tap-layering-design.md`

---

## File Structure

- **Modify** `src/modules/raw-processor/components/mobile/MobileLabChrome.tsx`
  — owns the immersive/dock/sheet state and wires the preview gesture hook.
  All behavior changes land here.
- **Modify** `src/modules/raw-processor/motion.ts` — add the
  `IMMERSIVE_STAGGER_MS` constant next to `DOCK_SPRING` (Slice 2 only).
- **Modify** `src/modules/raw-processor/components/mobile/MobileLabChrome.test.tsx`
  — add sheet-precedence + peek-suppression tests (Slice 1); add a
  collapse-then-recede sequencing test and update the existing immersive toggle
  test (Slice 2).

No new files. `useMobilePreviewGestures.ts`, `MobileModeDock.tsx`,
`MobileLutBrowser.tsx`, and `MobileMoreSheet.tsx` are **not** modified — the
hook's `enabled`/`allowPeek`/`onTap` inputs change from the call site only, and
the sheets close via their existing controlled `open` props.

---

## Task 0: Setup

**Files:** none (branch + doc commit)

- [ ] **Step 1: Create a working branch**

Run:
```bash
git switch -c feat/mobile-preview-tap-layering
```
Expected: `Switched to a new branch 'feat/mobile-preview-tap-layering'`

(If the executor uses an isolated worktree via `superpowers:using-git-worktrees`,
the branch is created there instead — skip this step.)

- [ ] **Step 2: Commit the design + plan docs**

```bash
git add docs/superpowers/specs/2026-05-29-mobile-preview-tap-layering-design.md \
        docs/superpowers/plans/2026-05-29-mobile-preview-tap-layering.md
git commit --no-gpg-sign -m "docs(raw-mobile): spec + plan for preview-tap layering"
```

> **Note:** SSH commit signing hangs in this headless environment; `--no-gpg-sign`
> is the authorized workaround for this loop. Use it on every commit below.

---

## Task 1 (Slice 1): Sheet precedence — tap closes an open sheet

**Files:**
- Modify: `src/modules/raw-processor/components/mobile/MobileLabChrome.tsx` (gesture wiring, ~line 227-233)
- Test: `src/modules/raw-processor/components/mobile/MobileLabChrome.test.tsx`

### Step 1.1: Add the failing tests

- [ ] **Step 1: Add `waitFor` to the Testing Library import**

In `MobileLabChrome.test.tsx`, change the import on line 2:

```ts
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
```

- [ ] **Step 2: Add two tests after the existing `short tap toggles immersive` test**

Insert immediately after the test that ends at line 434 (`it('short tap toggles immersive (chrome hidden) and back', ...)`):

```ts
  it('tap on the exposed preview closes an open sheet instead of toggling immersive', async () => {
    render(<MobileLabChrome {...base} previewFrameEl={previewFrameEl} />)
    await userEvent.click(screen.getByRole('button', { name: /lut browser/i }))
    expect(
      screen.getByRole('dialog', { name: /lut browser/i }),
    ).toBeInTheDocument()

    act(() => {
      previewFrameEl.dispatchEvent(new Event('pointerdown', { bubbles: true }))
      previewFrameEl.dispatchEvent(new Event('pointerup', { bubbles: true }))
    })

    // The sheet closes; immersive does NOT engage (topbar still present).
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: /lut browser/i }),
      ).not.toBeInTheDocument(),
    )
    expect(
      screen.getByRole('heading', { name: 'DSC09142.ARW' }),
    ).toBeInTheDocument()
  })

  it('suppresses long-press peek while a sheet is open', () => {
    const onViewModeChange = vi.fn()
    render(
      <MobileLabChrome
        {...base}
        previewFrameEl={previewFrameEl}
        onViewModeChange={onViewModeChange}
      />,
    )
    // Open the LUT browser synchronously, then drive the hold on fake timers.
    fireEvent.click(screen.getByRole('button', { name: /lut browser/i }))
    vi.useFakeTimers()
    act(() => {
      previewFrameEl.dispatchEvent(new Event('pointerdown', { bubbles: true }))
      vi.advanceTimersByTime(400)
    })
    expect(onViewModeChange).not.toHaveBeenCalledWith('original')
    act(() => {
      previewFrameEl.dispatchEvent(new Event('pointerup', { bubbles: true }))
    })
    vi.useRealTimers()
  })
```

- [ ] **Step 3: Run the new tests to verify they fail**

Run:
```bash
pnpm exec vitest run src/modules/raw-processor/components/mobile/MobileLabChrome.test.tsx -t "closes an open sheet|suppresses long-press peek while a sheet is open"
```
Expected: FAIL. With current code, tapping the preview while the LUT browser is
open toggles immersive (the dialog stays open and the topbar disappears), and
long-press peek still fires `onViewModeChange('original')` because `allowPeek`
ignores open sheets.

### Step 1.2: Implement the precedence rule

- [ ] **Step 4: Replace the gesture-hook wiring**

In `MobileLabChrome.tsx`, replace this block (currently ~line 228-233):

```ts
  useMobilePreviewGestures(props.previewFrameEl ?? null, {
    enabled: previewGesturesEnabled,
    allowPeek: !compareSplitOpen,
    onPeekChange,
    onTap: () => setImmersive((v) => !v),
  })
```

with:

```ts
  const closeSheets = () => {
    setLutBrowserOpen(false)
    setLutBrowserStartsInContract(false)
    setMoreOpen(false)
  }
  useMobilePreviewGestures(props.previewFrameEl ?? null, {
    enabled: previewGesturesEnabled,
    allowPeek: !compareSplitOpen && !lutBrowserOpen && !moreOpen,
    onPeekChange,
    onTap: () => {
      if (lutBrowserOpen || moreOpen) {
        closeSheets()
        return
      }
      setImmersive((v) => !v)
    },
  })
```

Leave `previewGesturesEnabled` (line 227) unchanged — the hook must stay enabled
so the tap can close the sheet and the `contextmenu` guard keeps suppressing the
browser image callout on the exposed strip.

- [ ] **Step 5: Run the new tests to verify they pass**

Run:
```bash
pnpm exec vitest run src/modules/raw-processor/components/mobile/MobileLabChrome.test.tsx -t "closes an open sheet|suppresses long-press peek while a sheet is open"
```
Expected: PASS (2 passed).

- [ ] **Step 6: Run the full file to confirm no regressions**

Run:
```bash
pnpm exec vitest run src/modules/raw-processor/components/mobile/MobileLabChrome.test.tsx
```
Expected: PASS — all tests green, including the unchanged `short tap toggles
immersive (chrome hidden) and back` (Slice 1 does not add the stagger yet).

- [ ] **Step 7: Lint the touched files**

Run:
```bash
pnpm lint
```
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/modules/raw-processor/components/mobile/MobileLabChrome.tsx \
        src/modules/raw-processor/components/mobile/MobileLabChrome.test.tsx
git commit --no-gpg-sign -m "fix(MobileLabChrome): tap on exposed preview closes open sheet, not immersive"
```

---

## Task 2 (Slice 2): Collapse-then-recede immersive transition

**Files:**
- Modify: `src/modules/raw-processor/motion.ts`
- Modify: `src/modules/raw-processor/components/mobile/MobileLabChrome.tsx`
- Test: `src/modules/raw-processor/components/mobile/MobileLabChrome.test.tsx`

### Step 2.1: Add the failing sequencing test

- [ ] **Step 1: Add the sequencing test**

In `MobileLabChrome.test.tsx`, insert this test immediately after the
`tap on the exposed preview closes an open sheet ...` test added in Task 1:

```ts
  it('collapses the dock panel before receding into immersive', () => {
    vi.useFakeTimers()
    render(<MobileLabChrome {...base} previewFrameEl={previewFrameEl} />)
    // Dock panel is expanded by default (Look mode) — its LUT button is present.
    expect(
      screen.getByRole('button', { name: /lut browser/i }),
    ).toBeInTheDocument()

    act(() => {
      previewFrameEl.dispatchEvent(new Event('pointerdown', { bubbles: true }))
      previewFrameEl.dispatchEvent(new Event('pointerup', { bubbles: true }))
    })

    // Phase 1: panel collapsed, but chrome (topbar) is still present.
    expect(screen.queryByRole('button', { name: /lut browser/i })).toBeNull()
    expect(
      screen.getByRole('heading', { name: 'DSC09142.ARW' }),
    ).toBeInTheDocument()

    // Phase 2: after the stagger, chrome recedes into immersive.
    act(() => {
      vi.advanceTimersByTime(160)
    })
    expect(
      screen.queryByRole('heading', { name: 'DSC09142.ARW' }),
    ).not.toBeInTheDocument()
    vi.useRealTimers()
  })
```

- [ ] **Step 2: Run it to verify it fails**

Run:
```bash
pnpm exec vitest run src/modules/raw-processor/components/mobile/MobileLabChrome.test.tsx -t "collapses the dock panel before receding"
```
Expected: FAIL at the Phase 1 assertion — with the current atomic toggle the tap
hides the topbar immediately, so `getByRole('heading', { name: 'DSC09142.ARW' })`
is no longer in the document.

### Step 2.2: Add the stagger constant

- [ ] **Step 3: Add `IMMERSIVE_STAGGER_MS` to `motion.ts`**

In `src/modules/raw-processor/motion.ts`, add this directly below the
`export const DOCK_SPRING = Spring.smooth(0.24)` line:

```ts
// Lead time the dock-panel collapse gets before the chrome recedes into
// immersive (and the reverse on exit). A partial lead inside the DOCK_SPRING
// (~240ms) band so it reads as one "collapse, then recede" sequence rather than
// two separate animations. Bypassed under reduced motion (instant flip).
export const IMMERSIVE_STAGGER_MS = 140
```

### Step 2.3: Wire the sequenced enter/exit

- [ ] **Step 4: Import the constant**

In `MobileLabChrome.tsx`, change the motion import (line 22):

```ts
import { DOCK_SPRING, IMMERSIVE_STAGGER_MS } from '../../motion'
```

- [ ] **Step 5: Add the stagger refs**

In `MobileLabChrome.tsx`, add these two refs next to the existing refs (after
`const preferExportModeWasActive = useRef(false)`, line 94):

```ts
  const immersiveStaggerTimer = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )
  const expandedBeforeImmersive = useRef(false)
```

- [ ] **Step 6: Clear a pending stagger in each teardown effect**

Three teardown effects force `setImmersive(false)`. Insert the same guard at the
top of each effect body so a pending stagger timer can never fire onto a
torn-down state.

In the `hasImage` teardown effect, after `if (hasImage) return` (line 103):

```ts
    if (immersiveStaggerTimer.current !== null) {
      clearTimeout(immersiveStaggerTimer.current)
      immersiveStaggerTimer.current = null
    }
```

In the `handoffActive` teardown effect, after `if (!handoffActive) return` (line 120):

```ts
    if (immersiveStaggerTimer.current !== null) {
      clearTimeout(immersiveStaggerTimer.current)
      immersiveStaggerTimer.current = null
    }
```

In the `preferExportMode` effect, after `if (!shouldActivate) return` (line 146):

```ts
    if (immersiveStaggerTimer.current !== null) {
      clearTimeout(immersiveStaggerTimer.current)
      immersiveStaggerTimer.current = null
    }
```

- [ ] **Step 7: Add an unmount cleanup effect**

In `MobileLabChrome.tsx`, add this effect immediately after the
`preferExportMode` effect (after its closing `}, [hasImage, props.preferExportMode])`,
~line 161):

```ts
  useEffect(
    () => () => {
      if (immersiveStaggerTimer.current !== null) {
        clearTimeout(immersiveStaggerTimer.current)
      }
    },
    [],
  )
```

- [ ] **Step 8: Replace the gesture-hook wiring with the sequenced helpers**

Replace the block added in Task 1 (the `closeSheets` + `useMobilePreviewGestures`
block) with:

```ts
  const closeSheets = () => {
    setLutBrowserOpen(false)
    setLutBrowserStartsInContract(false)
    setMoreOpen(false)
  }
  const clearImmersiveStagger = () => {
    if (immersiveStaggerTimer.current !== null) {
      clearTimeout(immersiveStaggerTimer.current)
      immersiveStaggerTimer.current = null
    }
  }
  // Entering immersive while the dock panel is expanded tidies the panel away
  // first, then recedes the chrome a beat later — one "collapse, then recede"
  // sequence instead of a wall vanishing at once. Exit reverses it. Reduced
  // motion collapses both halves to an instant flip.
  const enterImmersive = () => {
    clearImmersiveStagger()
    expandedBeforeImmersive.current = dockExpanded
    if (dockExpanded && !prefersReduced) {
      setDockExpanded(false)
      immersiveStaggerTimer.current = setTimeout(() => {
        immersiveStaggerTimer.current = null
        setImmersive(true)
      }, IMMERSIVE_STAGGER_MS)
      return
    }
    setImmersive(true)
  }
  const exitImmersive = () => {
    clearImmersiveStagger()
    setImmersive(false)
    if (expandedBeforeImmersive.current) {
      if (prefersReduced) {
        setDockExpanded(true)
      } else {
        immersiveStaggerTimer.current = setTimeout(() => {
          immersiveStaggerTimer.current = null
          setDockExpanded(true)
        }, IMMERSIVE_STAGGER_MS)
      }
    }
    expandedBeforeImmersive.current = false
  }
  useMobilePreviewGestures(props.previewFrameEl ?? null, {
    enabled: previewGesturesEnabled,
    allowPeek: !compareSplitOpen && !lutBrowserOpen && !moreOpen,
    onPeekChange,
    onTap: () => {
      if (lutBrowserOpen || moreOpen) {
        closeSheets()
        return
      }
      if (immersive) exitImmersive()
      else enterImmersive()
    },
  })
```

- [ ] **Step 9: Route the "Show controls" pill through `exitImmersive`**

In `MobileLabChrome.tsx`, the immersive restore button currently has
`onClick={() => setImmersive(false)}` (line 510). Change it to:

```tsx
            onClick={exitImmersive}
```

### Step 2.4: Update the existing immersive toggle test for the stagger

- [ ] **Step 10: Replace the `short tap toggles immersive (chrome hidden) and back` test**

The enter half is now staggered, so the test must advance the timer. Replace the
whole test (currently lines 419-434) with:

```ts
  it('short tap toggles immersive (chrome hidden) and back', () => {
    vi.useFakeTimers()
    render(<MobileLabChrome {...base} previewFrameEl={previewFrameEl} />)
    expect(screen.getByRole('heading', { name: 'DSC09142.ARW' })).toBeVisible()
    act(() => {
      previewFrameEl.dispatchEvent(new Event('pointerdown', { bubbles: true }))
      previewFrameEl.dispatchEvent(new Event('pointerup', { bubbles: true }))
    })
    // Panel collapses first; immersive engages after the stagger.
    act(() => {
      vi.advanceTimersByTime(160)
    })
    expect(
      screen.queryByRole('heading', { name: 'DSC09142.ARW' }),
    ).not.toBeInTheDocument()
    // restore affordance brings the chrome back immediately
    fireEvent.click(screen.getByRole('button', { name: /show controls/i }))
    expect(
      screen.getByRole('heading', { name: 'DSC09142.ARW' }),
    ).toBeInTheDocument()
    // flush the pending panel re-expand before restoring real timers
    act(() => {
      vi.advanceTimersByTime(160)
    })
    vi.useRealTimers()
  })
```

- [ ] **Step 11: Run the sequencing + toggle tests to verify they pass**

Run:
```bash
pnpm exec vitest run src/modules/raw-processor/components/mobile/MobileLabChrome.test.tsx -t "collapses the dock panel before receding|short tap toggles immersive"
```
Expected: PASS (2 passed).

- [ ] **Step 12: Run the full file**

Run:
```bash
pnpm exec vitest run src/modules/raw-processor/components/mobile/MobileLabChrome.test.tsx
```
Expected: PASS — all tests green (peek/cancel-peek tests unaffected; no sheet open in those).

- [ ] **Step 13: Lint**

Run:
```bash
pnpm lint
```
Expected: no errors.

- [ ] **Step 14: Commit**

```bash
git add src/modules/raw-processor/motion.ts \
        src/modules/raw-processor/components/mobile/MobileLabChrome.tsx \
        src/modules/raw-processor/components/mobile/MobileLabChrome.test.tsx
git commit --no-gpg-sign -m "feat(MobileLabChrome): collapse dock panel before receding into immersive"
```

---

## Task 3: Suite + browser validation

**Files:** none

- [ ] **Step 1: Run the UI test project**

Run:
```bash
pnpm test:ui
```
Expected: PASS — `vitest run src/modules/raw-processor src/components/ui src/components/common` all green.

- [ ] **Step 2: Browser validation (required for `/raw` interaction changes)**

Per `CLAUDE.md`, validate user-visible `/raw` interaction in a real browser on a
mobile/WebKit viewport (use `vite preview`, not dev). Confirm:
1. With the LUT browser (or More) sheet open, tapping the exposed photo strip
   **closes the sheet** and does NOT hide the topbar/dock behind it.
2. Long-press on the exposed strip while a sheet is open does **not** trigger the
   "Showing unprocessed RAW" peek.
3. With the dock panel expanded, a single tap **collapses the panel first, then**
   the topbar/dock recede into immersive; the "Show controls" pill restores chrome
   and the panel slides back up.
4. With OS "reduce motion" enabled, the immersive toggle is instant (no stagger).

> Note (from project memory): headless RAW decode is blocked in this environment,
> and the stage Dropzone is drag-only — loading a RAW for manual validation may
> require a real interactive browser session. If decode cannot be exercised
> headlessly, hand this step to an interactive run.

---

## Self-Review

**Spec coverage:**
- Pure-toggle core preserved → Task 2 keeps the toggle, only sequences it. ✓
- Outside tap on open sheet closes it → Task 1 Step 4 (`onTap` sheet branch + `closeSheets`). ✓
- Peek suppressed while sheet open → Task 1 Step 4 (`allowPeek` extended). ✓
- Hook stays enabled (tap-to-close + contextmenu guard) → Task 1 Step 4 leaves `previewGesturesEnabled` untouched. ✓
- Collapse-then-recede + symmetric restore → Task 2 Steps 5-9 (`enterImmersive`/`exitImmersive`, `expandedBeforeImmersive`). ✓
- Reduced motion = instant → Task 2 Step 8 (`!prefersReduced` guards). ✓
- Teardown clears pending stagger + unmount cleanup → Task 2 Steps 6-7. ✓
- Histogram not in tap-close stack / compare unchanged → no code added for them; behavior preserved by leaving those paths alone. ✓
- Testing (update existing + 3 new) → Task 1 Step 2, Task 2 Steps 1 & 10. ✓
- Verification (`pnpm test:ui`, lint, browser) → Task 3. ✓

**Placeholder scan:** No TBD/TODO; every code step shows the exact code and every
run step shows the command + expected result. ✓

**Type/name consistency:** `closeSheets`, `clearImmersiveStagger`, `enterImmersive`,
`exitImmersive`, `immersiveStaggerTimer`, `expandedBeforeImmersive`,
`IMMERSIVE_STAGGER_MS` are used identically across Tasks 1-2. The Task 1 `onTap`
(toggle) is fully superseded by the Task 2 `onTap` (enter/exit) via a block
replacement, not a partial edit. ✓
