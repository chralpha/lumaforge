# /raw Shell Consistency Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the rest of the `/raw` surface (WorkspaceHeader, mobile rail/sheet, preview-stage chrome, overlays) onto the same Tailwind + Pastel-token + Radix `ui/*` system the tool-card panel already uses, and delete the bespoke skin/typography CSS it left behind — holding all behavior constant.

**Architecture:** Three phases mirroring the spec. The `.raw-lab`-scoped `--color-*` token block already exists; Pastel Tailwind utilities (`bg-material-medium`, `text-text`, `border-border`, `bg-accent`, …) automatically resolve to the warm scoped values, so migrating skin to those utilities preserves the warm identity for free. **Plan refinement vs spec (transparent):** the spec flagged the mobile breakpoint move as the highest risk; to honor the user's "must not regress" constraint we *retain the structural/geometry/responsive CSS as token-fed scoped rules* (`.raw-lab`/`.raw-lab-shell` grid, `.raw-tool-surface` fixed-positioning `@media`, compare-handle transform math, sample gradients, histogram SVG strokes, sheet structural container, reduced-motion) and delete only the **skin/typography/button/literal** CSS. This still removes the entire parallel *skin* system (the user's actual complaint) with far lower regression risk. Net `raw-lab.css` shrinks from 885 to roughly ~300 token-fed structural lines; zero remaining bespoke buttons/typography/oklch-literals.

**Tech Stack:** React, TypeScript, Tailwind v4 + `@pastel-palette/tailwindcss`, Radix `ui/button` (`Button`/`IconButton`) + `ui/dropdown-menu`, `motion/react` (`m`, existing `SHEET_SPRING`/`BACKDROP_SPRING`/`TAP_SPRING`), `~/lib/cn` (`clsxm`), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-05-16-raw-shell-consistency-design.md`

**Verification per phase:** `pnpm lint`, `pnpm test:run`, `pnpm build`, plus the per-phase browser validation noted in each phase's final task.

---

## Key API / Codebase Facts (read before starting)

- **`Button`** (`~/components/ui/button`): `variant` = `primary|secondary|light|ghost|destructive`, `size` = `sm|md` (default `md`). Renders `<button>` (or `asChild` via Radix `Slot`). Owns its own hover/active/focus motion + `disabled:` styles. Primary = `bg-accent text-background`; secondary = `border-border bg-background text-text`; light = `bg-fill text-text` borderless. Accessible name comes from children.
- **`IconButton`** (`~/components/ui/button`): `m.button`-based, props `icon: ElementType`, `size` (`sm|default|md|lg`), `active`, `className`, plus motion button props. Has built-in `whileTap`. Use for the sheet close button.
- **`DropdownMenu*`** (`~/components/ui/dropdown-menu/DropdownMenu`): `DropdownMenuContent` already has a token skin (`bg-material-medium border-border text-text shadow-context-menu rounded-[6px] p-1`). `DropdownMenuItem` already token-skinned (`focus:bg-accent ... h-[28px] w-full text-sm`). So the `.raw-lab-more-menu*` `className` overrides should simply be **removed** (let the default skin apply), keeping `align="end"`.
- **Scoped tokens** already defined at the top of `src/modules/raw-processor/raw-lab.css` `.raw-lab { … }`: `--color-background`, `--color-text`, `--color-text-secondary`, `--color-text-tertiary`, `--color-border`, `--color-border-secondary`, `--color-accent`, `--color-accent-strong`, `--color-fill`, `--color-fill-secondary`, `--color-fill-tertiary`, `--color-material-opaque`, `--color-material-medium`, `--color-stage-background`, `--color-on-stage`, `--color-scrollbar-thumb`, `--color-scrollbar-thumb-hover`. Pastel utilities (`bg-material-medium`, `text-text`, `border-border`, `bg-fill`, `bg-accent`, `text-accent`, …) read these. For the dark stage/overlay there is **no Pastel utility** — use arbitrary **var** utilities like `bg-[var(--color-stage-background)]` / `text-[var(--color-on-stage)]` (these are tokens, not literals, so they pass the grep guard which forbids `[oklch`).
- **i18n:** no new keys needed. Header uses `raw.header.*`, mobile rail `raw.mobileTools.*`, stage `raw.stage.*`, progress `raw.progress.*` — all already present. Tests run under `zh-CN` locale (e.g. header "choose RAW" button name asserts as `选择 RAW`).
- **`LocaleToggle`** renders `clsxm('locale-toggle', className)`. There is **no `.locale-toggle` CSS rule** anywhere — all styling comes from the passed `className`. So on `/raw` we pass `Button`-equivalent utility classes via `className`; the bare `locale-toggle` class is inert and untouched (confirmed scope-safe).
- **Behavior held constant — DO NOT TOUCH:** every `data-*`/`aria-*`/`id`/`role`, the compare-split pointer/keyboard logic & CSS custom props (`--raw-compare-split`, `--raw-compare-split-x`), `useDragControls`/`onDragEnd` threshold, `prefersReduced` gating, long-press export handlers, scroll-hint logic, `Dropzone` drag/drop, WebGL `PreviewCanvas`.
- **Commit signing:** this repo signs commits via SSH and the signing key is not in the agent; `--no-gpg-sign` is used by prior user authorization for this work (same as the panel plan). If the user has loaded the key, drop the flag.

## File Structure

**Modify only (no new files):**
- `src/modules/raw-processor/components/WorkspaceHeader.tsx` — Phase 1.
- `src/modules/raw-processor/components/RawToolSurface.tsx` — Phase 2 (mobile rail/sheet/backdrop skin only).
- `src/modules/raw-processor/components/ComparePreviewStage.tsx` — Phase 3 (UploadDock, compare labels, stage-frame hook).
- `src/modules/raw-processor/components/Dropzone.tsx` — Phase 3 (`variant="stage"` literals → tokens).
- `src/modules/raw-processor/components/ProgressOverlay.tsx` — Phase 3 (ProgressOverlay + ErrorOverlay literals → tokens).
- `src/modules/raw-processor/components/CompareSplitHandle.tsx` — Phase 3 (only the `clsxm('raw-lab-compare-handle', …)` stays; no change unless a stable hook is needed — none is).
- `src/modules/raw-processor/raw-lab.css` — Phases 1–3 (delete skin rules; add scrim tokens; keep structural/geometry).
- `src/modules/raw-processor/__tests__/workspace-ui.test.tsx` — Phases 1 & 3 (selector updates).
- `src/modules/raw-processor/components/RawToolSurface.test.tsx` — Phase 2 (backdrop selector).

---

# Phase 1 — WorkspaceHeader → ui/button + ui/dropdown-menu + tokens

User-visible: header buttons adopt the calm app button system; menu uses the default token skin; bespoke topbar/menu CSS deleted. Behavior identical.

### Task 1.1: Update header-coupled test selectors

**Files:**
- Modify: `src/modules/raw-processor/__tests__/workspace-ui.test.tsx`

There are no `.raw-lab-topbar*` class assertions in the test (header is asserted purely by role/name — verified). The only thing to confirm is that button accessible names are unchanged after migration.

- [ ] **Step 1: Add a guard test** near the other header assertions (after the existing `选择 RAW` enabled assertion around line 330). Insert:

```tsx
it('renders header actions as accessible buttons', () => {
  renderRawProcessor()
  expect(screen.getByRole('button', { name: '选择 RAW' })).toBeInTheDocument()
})
```

(Use the same `renderRawProcessor()`/render helper the surrounding tests use — match the existing local helper name in the file.)

- [ ] **Step 2: Run to verify it passes (pre-migration baseline)**

Run: `pnpm test:run src/modules/raw-processor/__tests__/workspace-ui.test.tsx -t "accessible buttons"`
Expected: PASS (header already exposes the button by name; this locks the contract before refactor).

- [ ] **Step 3: Commit**

```bash
git add src/modules/raw-processor/__tests__/workspace-ui.test.tsx
git commit --no-gpg-sign -m "test(raw): lock header action accessibility before shell port"
```

### Task 1.2: Migrate WorkspaceHeader to ui/button + token bar

**Files:**
- Modify: `src/modules/raw-processor/components/WorkspaceHeader.tsx`

- [ ] **Step 1: Replace imports and the four raw buttons + bar.** Replace the file body's `return (...)` with the token version. Add `import { Button } from '~/components/ui/button'` to the import block. New `return`:

```tsx
  return (
    <header
      className="flex min-w-0 items-center justify-between gap-4 border-b border-border bg-material-opaque px-3 py-3 sm:px-4"
      role="banner"
    >
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-3">
          <img
            className="size-7 shrink-0 rounded-[5px] object-cover"
            src={appIcon}
            alt=""
            aria-hidden="true"
          />
          <h1 className="truncate text-base font-semibold text-text">
            {hasImage ? fileName : t('raw.header.title')}
          </h1>
          {hasImage && (
            <span className="inline-flex max-[640px]:hidden">
              <SupportBadge level={supportLevel} />
            </span>
          )}
        </div>
        <p className="mt-1 truncate text-xs text-text-secondary">
          {hasImage
            ? t('raw.header.subtitleLoaded')
            : t('raw.header.subtitleEmpty')}
        </p>
        {exportDisabledReason && (
          <p className="mt-1 truncate text-xs text-text-secondary max-[640px]:hidden">
            {t('raw.header.unavailablePrefix', {
              reason: exportDisabledReason,
            })}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <LocaleToggle className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-text transition-colors hover:bg-fill-secondary max-[640px]:hidden" />
        <Button
          variant="secondary"
          size="sm"
          type="button"
          onClick={onReplaceFile}
          disabled={isExporting}
          className="max-[640px]:hidden"
        >
          {hasImage ? t('raw.header.replace') : t('raw.header.chooseRaw')}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          type="button"
          onClick={onResetSession}
          disabled={!hasImage || isExporting}
          className="max-[640px]:hidden"
        >
          {t('raw.header.reset')}
        </Button>
        <Button
          variant="primary"
          size="sm"
          type="button"
          onClick={onOpenExport}
          disabled={!canExport}
          className="max-[640px]:hidden"
        >
          {t('raw.header.fullRes')}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="secondary"
              size="sm"
              type="button"
              className="hidden gap-1.5 max-[640px]:inline-flex"
            >
              <MoreHorizontal aria-hidden="true" className="size-4" />
              {t('raw.header.more')}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              disabled={isExporting}
              onSelect={onReplaceFile}
            >
              <FolderOpen aria-hidden="true" className="size-[15px]" />
              {hasImage ? t('raw.header.replace') : t('raw.header.chooseRaw')}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!hasImage || isExporting}
              onSelect={onResetSession}
            >
              <RotateCcw aria-hidden="true" className="size-[15px]" />
              {t('raw.header.reset')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
```

Note: `max-[640px]:hidden` / `max-[640px]:inline-flex` preserve the exact 640px responsive show/hide the old CSS did (hide replace/reset/primary/locale/badge, show "More") — no breakpoint change. The `DropdownMenuItem` children need `inline-flex` gap; if icons don't space, add `className="gap-2"` to each `DropdownMenuItem` (the default item skin is `flex items-center`).

- [ ] **Step 2: Run header tests**

Run: `pnpm test:run src/modules/raw-processor/__tests__/workspace-ui.test.tsx`
Expected: PASS (button names unchanged: `选择 RAW`/`重置`/etc. resolve via i18n; disabled states preserved).

- [ ] **Step 3: Commit**

```bash
git add src/modules/raw-processor/components/WorkspaceHeader.tsx
git commit --no-gpg-sign -m "refactor(raw): rebuild WorkspaceHeader on ui/button + token bar"
```

### Task 1.3: Delete bespoke topbar/menu CSS

**Files:**
- Modify: `src/modules/raw-processor/raw-lab.css`

- [ ] **Step 1: Delete these rule blocks** from `raw-lab.css` (now unreferenced): `.raw-lab-topbar`, `.raw-lab-mark`, `.raw-lab-support-badge`, `.raw-lab-topbar-actions`, `.raw-lab-topbar-button` (+ `:hover`/`:focus-visible`/`:disabled`/`-primary`), `.raw-lab-topbar-more` (+ ` svg`), `.raw-lab-locale-toggle`, `.raw-lab-more-menu` (+ `-item`, `-item svg`, `-item:focus`/`[data-highlighted]`/`[data-disabled]`, `-separator`). Also delete the `@media (max-width: 640px)` sub-rules that target `.raw-lab-topbar*` / `.raw-lab-mark` / `.raw-lab-title` / `.raw-lab-status` / `.raw-lab-support-badge` / `.raw-lab-unavailable` / `.raw-lab-topbar-actions` / `.raw-lab-topbar-button*` / `.raw-lab-topbar-more` (the header-only mobile overrides — leave the stage/tool-surface/mobile-sheet `@media` rules for Phases 2–3).

- [ ] **Step 2: Verify no dangling references**

Run: `grep -rn "raw-lab-topbar\|raw-lab-more-menu\|raw-lab-mark\|raw-lab-locale-toggle\|raw-lab-support-badge" src/modules/raw-processor --include="*.tsx" --include="*.css"`
Expected: **no matches**.

- [ ] **Step 3: Phase-1 verification**

Run: `pnpm lint && pnpm test:run && pnpm build`
Expected: PASS. Then manually open `/raw` desktop + at the 640px boundary: header shows Replace/Reset/Full-res/Locale ≥641px and collapses to the "More" menu ≤640px; all actions work; dropdown keyboard nav + disabled states intact; warm paper/ink look preserved (buttons read calm, weight ≤600).

- [ ] **Step 4: Commit**

```bash
git add src/modules/raw-processor/raw-lab.css
git commit --no-gpg-sign -m "refactor(raw): delete bespoke topbar/menu CSS"
```

---

# Phase 2 — Mobile rail + sheet skin → Tailwind + tokens + ui/*

User-visible (≤640px): rail tabs and the sheet adopt the calm token system. Motion/drag/handlers/structure untouched; only the visual class layer changes. The structural `@media` rules that make `.raw-tool-surface` a fixed overlay and lay out the sheet are **retained, token-fed** (risk mitigation per Architecture note).

### Task 2.1: Add a stable backdrop hook and update its test selector

**Files:**
- Modify: `src/modules/raw-processor/components/RawToolSurface.tsx`
- Modify: `src/modules/raw-processor/components/RawToolSurface.test.tsx`

- [ ] **Step 1:** In `RawToolSurface.tsx`, on the backdrop `m.div` (the one with `className="raw-mobile-tool-backdrop"`), add a stable hook attribute: `data-raw-mobile-backdrop`. Keep the class for now (skin migrated in Task 2.3).

- [ ] **Step 2:** In `RawToolSurface.test.tsx` line ~410, replace `container.querySelector('.raw-mobile-tool-backdrop')` with `container.querySelector('[data-raw-mobile-backdrop]')`.

- [ ] **Step 3: Run the surface tests**

Run: `pnpm test:run src/modules/raw-processor/components/RawToolSurface.test.tsx`
Expected: PASS (only the selector source changed; behavior identical).

- [ ] **Step 4: Commit**

```bash
git add src/modules/raw-processor/components/RawToolSurface.tsx src/modules/raw-processor/components/RawToolSurface.test.tsx
git commit --no-gpg-sign -m "test(raw): target mobile backdrop via stable data hook"
```

### Task 2.2: Migrate rail tabs to token Tailwind

**Files:**
- Modify: `src/modules/raw-processor/components/RawToolSurface.tsx`

The rail `<nav>` and the two `m.button`s currently use `raw-mobile-tool-rail` / `raw-mobile-tool-tab` / `raw-mobile-tool-tab-export`. Keep all handlers/`data-*`/`aria-*`/`whileTap`/`transition` exactly. Replace only `className`s.

- [ ] **Step 1: Replace the rail markup** (the `<nav className="raw-mobile-tool-rail" …>` block near the end of the component) `className`s:
  - `<nav>`: `className="raw-mobile-tool-rail hidden gap-2 border-t border-border bg-material-opaque p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] max-[640px]:grid max-[640px]:grid-cols-2"` — keep the `raw-mobile-tool-rail` class **only** as a structural pointer-events hook (retained CSS handles `pointer-events:auto` inside the fixed surface); visual skin now Tailwind.
  - Style tab `m.button`: `className={clsxm('inline-flex min-h-[46px] min-w-0 items-center justify-center gap-1.5 rounded-md border text-xs font-medium leading-none transition-colors', mobilePanel === 'style' ? 'border-accent-strong bg-fill-secondary text-text' : 'border-border bg-background text-text')}` (import `clsxm` from `~/lib/cn` — add to imports). Keep `data-mobile-tool-tab="style"`, `data-active`, `aria-expanded`, `aria-controls`, `onClick`, `whileTap`, `transition`, the `<SlidersHorizontal aria-hidden="true" />` (add `className="size-4"`), and the label.
  - Export tab `m.button`: `className={clsxm('inline-flex min-h-[46px] min-w-0 items-center justify-center gap-1.5 rounded-md border text-xs font-medium leading-none transition-colors', (!props.canExport || props.isProcessing) ? 'border-border bg-fill text-text-secondary' : 'border-transparent bg-accent text-background')}`. Keep all pointer/long-press handlers, `data-*`, `aria-*`, `whileTap`, `transition`, `<Download aria-hidden="true" className="size-4" />`, label.

- [ ] **Step 2: Run surface tests**

Run: `pnpm test:run src/modules/raw-processor/components/RawToolSurface.test.tsx`
Expected: PASS (rail buttons keep accessible names `Style`/`Export`, all `data-raw-tool-sheet` toggles and long-press behavior unchanged).

- [ ] **Step 3: Commit**

```bash
git add src/modules/raw-processor/components/RawToolSurface.tsx
git commit --no-gpg-sign -m "refactor(raw): rebuild mobile rail tabs on token Tailwind"
```

### Task 2.3: Migrate sheet + backdrop skin to Tailwind + IconButton

**Files:**
- Modify: `src/modules/raw-processor/components/RawToolSurface.tsx`

Keep the `raw-mobile-tool-sheet`, `raw-mobile-tool-sheet-top`, `raw-mobile-tool-sheet-scroll-shell`, `raw-mobile-tool-sheet-scroll`, `raw-mobile-tool-backdrop` classes as **structural hooks** (retained CSS owns position/scroll/safe-area/`::after` fades). Add Tailwind token skin classes alongside them and drop the visual properties from CSS in Task 2.4.

- [ ] **Step 1: Update sheet markup classes** (keep every `ref`, `data-*`, `id`, motion prop, `onPointerDown`, `onScroll`, `AnimatePresence` exactly):
  - backdrop `m.div`: `className="raw-mobile-tool-backdrop bg-[var(--color-stage-background)]/40"`.
  - sheet `m.div`: `className="raw-mobile-tool-sheet border-t border-border bg-material-medium"`.
  - `raw-mobile-tool-sheet-top` div: add `bg-material-opaque`.
  - drag-handle div: keep class; its visual bar is `::before` in retained CSS — leave as is (token-fed in 2.4).
  - header div (`raw-mobile-tool-sheet-header`): `className="raw-mobile-tool-sheet-header flex items-center justify-between gap-3 border-b border-border px-3.5 pb-2.5 pt-2"`.
  - header `<h2>`: `className="m-0 text-sm font-medium text-text"`.
  - close button: replace the `<m.button className="raw-mobile-tool-sheet-close" …>` with `IconButton` (add `import { IconButton } from '~/components/ui/button'`):

```tsx
<IconButton
  icon={X}
  size="md"
  aria-label={t('raw.mobileTools.close')}
  onClick={closeMobilePanel}
  className="rounded-md border border-border bg-background text-text"
/>
```

  (`IconButton` provides its own `whileTap`; the old `TAP_SPRING` `whileTap` is replaced by the primitive's built-in tap motion — behavior-equivalent.)
  - `raw-mobile-tool-sheet-scroll-shell` div: keep class + `data-scroll-more` (retained CSS owns the scroll-hint `::after`).
  - `raw-mobile-tool-sheet-scroll` div: keep class (retained CSS owns scroll/safe-area padding).

- [ ] **Step 2: Run surface tests + workspace-ui tests**

Run: `pnpm test:run src/modules/raw-processor/components/RawToolSurface.test.tsx src/modules/raw-processor/__tests__/workspace-ui.test.tsx`
Expected: PASS (close button keeps `aria-label`; sheet `data-raw-mobile-sheet` and toggling unchanged).

- [ ] **Step 3: Commit**

```bash
git add src/modules/raw-processor/components/RawToolSurface.tsx
git commit --no-gpg-sign -m "refactor(raw): rebuild mobile sheet skin on Tailwind + IconButton"
```

### Task 2.4: Strip mobile skin properties from CSS, keep structure token-fed

**Files:**
- Modify: `src/modules/raw-processor/raw-lab.css`

Within the `@media (max-width: 640px)` block, the mobile rules now split into **structure (keep, token-fed)** and **skin (delete)**.

- [ ] **Step 1: Delete skin-only declarations**, keeping structural ones:
  - `.raw-mobile-tool-sheet`: **keep** `position`, `z-index`, `isolation`, `display`, `width`, `max-height`, `min-height`, `margin-inline`, `grid-template-rows`, `overflow`, `pointer-events`; **delete** `border-top`, `border-radius`, `background`, `box-shadow` (now Tailwind). Re-point the retained `::after` `background` to `var(--color-fill)` instead of the oklch literal.
  - `.raw-mobile-tool-sheet-top`: keep `position`/`z-index`/`touch-action`; delete `border-radius`/`background`.
  - `.raw-mobile-tool-sheet-drag-handle::before`: keep; change `background` to `var(--color-border)`.
  - `.raw-mobile-tool-sheet-header`: **delete entirely** (all Tailwind now).
  - `.raw-mobile-tool-sheet-header h2`, `.raw-mobile-tool-sheet-close` (+ ` svg`): **delete entirely** (Tailwind/IconButton now).
  - `.raw-mobile-tool-sheet-scroll-shell`: keep `position`/`z-index`/`min-height`/`overflow`; change `background` to `var(--color-fill)`. Keep `::after` but re-point its gradient stops to `var(--color-fill)` / `var(--color-border)` (token-fed).
  - `.raw-mobile-tool-sheet-scroll`: keep entirely (structure: height/overflow/overscroll/padding/safe-area).
  - `.raw-mobile-tool-card-stack`: keep (`gap`).
  - `.raw-mobile-tool-sheet [data-tool-card]`: change `border-color` to `var(--color-border)`.
  - `.raw-mobile-tool-sheet [data-tool-card-trigger]`: keep (touch target sizing).
  - `.raw-mobile-tool-sheet [data-raw-export-block='persistent']`: keep (structural reset).
  - `.raw-mobile-tool-rail`: **keep only** `z-index` + `pointer-events: auto` (structural — it lives inside the `pointer-events:none` fixed surface); **delete** `display`, `grid-template-columns`, `gap`, `border-top`, `padding`, `background`, `box-shadow` (Tailwind now).
  - `.raw-mobile-tool-tab` (+ ` svg`, `[data-active='true']`, `:focus-visible`, `-export`, `-export[aria-disabled='true']`): **delete entirely** (Tailwind now). Keep `.raw-mobile-tool-tab:focus-visible` only if focus ring is lost — verify in browser; if needed, replace with the global `focusRing` via a Tailwind `focus-visible:` utility on the buttons instead (preferred — add `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent` to both rail buttons in 2.2 and delete the CSS rule).
  - `.raw-mobile-tool-backdrop`: keep `position`/`inset`/`z-index`/`-webkit-tap-highlight-color`/`pointer-events`; **delete** `background` (Tailwind now).
  - Top-level (outside `@media`) `.raw-mobile-tool-sheet, .raw-mobile-tool-rail { display: none }` default — **keep** (structural default).
  - `.raw-tool-surface` `@media` rules (the `position: fixed inset:auto 0 0; pointer-events:none` etc. at ≤640, and the ≤980 `max-height` tablet rule) — **keep entirely** (structural; risk-mitigated retention).

- [ ] **Step 2: Verify no skin classes dangling & no new literals**

Run: `grep -n "raw-mobile-tool-tab\|raw-mobile-tool-sheet-header\|raw-mobile-tool-sheet-close" src/modules/raw-processor/raw-lab.css; grep -n "oklch(" src/modules/raw-processor/raw-lab.css | grep -i "mobile-tool"`
Expected: first grep no matches (skin rules gone); second grep no matches (mobile rules now token-fed).

- [ ] **Step 3: Phase-2 verification (mobile-critical)**

Run: `pnpm lint && pnpm test:run && pnpm build`
Expected: PASS. Then manual browser validation:
- **Desktop unaffected** (rail/sheet hidden, card stack + sticky export unchanged).
- **390px mobile**: rail tabs calm/token; tap Style → sheet rises with the same card accordion as desktop; tap Export → export panel; close button works; **drag-to-dismiss** works (threshold unchanged); **long-press Export** quick-exports; scroll-hint fade appears when overflowing; safe-area inset respected at the bottom.
- **WebKit run** of the above (Safari/WebKit viewport): sheet positioning, drag, safe-area.
- Reduced-motion: sheet uses opacity (not slide), no spring.

- [ ] **Step 4: Commit**

```bash
git add src/modules/raw-processor/raw-lab.css src/modules/raw-processor/components/RawToolSurface.tsx
git commit --no-gpg-sign -m "refactor(raw): strip mobile skin CSS, retain token-fed structure"
```

---

# Phase 3 — Stage chrome restyle + overlays + teardown

User-visible: stage frame / upload dock / compare labels / progress & error overlays adopt the calm token language; remaining bespoke skin/literal CSS deleted. Dark darkroom stage + all drag/WebGL behavior identical.

### Task 3.1: Add scrim tokens to the scoped block

**Files:**
- Modify: `src/modules/raw-processor/raw-lab.css`

The overlays/labels need a few alpha-on-dark values that have no Pastel utility. Add them to the existing `.raw-lab { … }` scoped block (next to `--color-stage-background`):

- [ ] **Step 1: Add tokens** inside `.raw-lab { … }`:

```css
  --color-stage-scrim: oklch(0.16 0.018 76 / 0.82);
  --color-stage-panel: oklch(0.16 0.018 76 / 0.78);
  --color-on-stage-soft: oklch(0.91 0.02 86 / 0.82);
  --color-stage-hairline: oklch(0.96 0.012 86 / 0.18);
  --color-progress: oklch(0.78 0.16 63);
  --color-progress-track: oklch(0.97 0.014 86 / 0.18);
```

- [ ] **Step 2: Build sanity**

Run: `pnpm build`
Expected: PASS (tokens added, nothing consumes them yet — no visual change).

- [ ] **Step 3: Commit**

```bash
git add src/modules/raw-processor/raw-lab.css
git commit --no-gpg-sign -m "feat(raw): add scoped stage scrim tokens"
```

### Task 3.2: Restyle UploadDock + compare labels + stage-frame hook

**Files:**
- Modify: `src/modules/raw-processor/components/ComparePreviewStage.tsx`
- Modify: `src/modules/raw-processor/__tests__/workspace-ui.test.tsx`

- [ ] **Step 1: Update test selectors** in `workspace-ui.test.tsx`:
  - Lines ~944 & ~1003: `container.querySelector('.raw-lab-stage-frame')` → `container.querySelector('[data-raw-stage-frame]')`. The adjacent `expect(stageFrame).toHaveClass('cursor-default')` stays valid (that class comes from `Dropzone` `frameClassName`, unchanged).
  - Line ~1015: `expect(uploadButton).toHaveClass('raw-lab-upload-dock')` → replace with `expect(uploadButton).toHaveAttribute('data-raw-upload-dock')`.
  - Line ~1042: `.raw-lab-sample` selector — **unchanged** (sample gradient is retained CSS).

- [ ] **Step 2: Run to verify fail**

Run: `pnpm test:run src/modules/raw-processor/__tests__/workspace-ui.test.tsx -t "stage"`
Expected: FAIL (selectors `[data-raw-stage-frame]` / `[data-raw-upload-dock]` not present yet).

- [ ] **Step 3: Migrate `ComparePreviewStage.tsx`:**
  - `UploadDock` button: replace `className="raw-lab-upload-dock"` with `data-raw-upload-dock` + Tailwind:

```tsx
    <button
      type="button"
      data-raw-upload-dock
      className="absolute bottom-[clamp(52px,7vw,78px)] left-1/2 z-[5] flex min-w-[min(320px,calc(100%-36px))] -translate-x-1/2 items-center gap-3 rounded-md border border-[var(--color-stage-hairline)] bg-[var(--color-stage-panel)] px-3 py-2.5 text-[var(--color-on-stage)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60 max-[640px]:bottom-[18px] max-[640px]:min-w-[min(300px,calc(100%-28px))]"
      onClick={(event) => {
        event.stopPropagation()
        onOpenFilePicker()
      }}
      disabled={disabled}
    >
      <span
        className="grid size-[34px] shrink-0 place-items-center rounded-[5px] bg-accent font-bold text-background"
        aria-hidden="true"
      >
        ↑
      </span>
      <span className="block">
        <strong className="block text-sm leading-tight">
          {t('raw.stage.uploadTitle')}
        </strong>
        <span className="mt-0.5 block text-xs leading-snug text-[var(--color-on-stage-soft)]">
          {t('raw.stage.uploadCopy')}
        </span>
      </span>
    </button>
```

  - Compare labels: replace both spans:

```tsx
            <span className="raw-lab-compare-label pointer-events-none absolute bottom-[18px] left-[18px] z-[4] max-w-[calc(50%-32px)] rounded-full border border-[var(--color-stage-hairline)] bg-[var(--color-stage-panel)] px-2.5 py-1.5 text-xs font-medium leading-tight text-[var(--color-on-stage)] opacity-0 transition-opacity duration-200 max-[640px]:max-w-[calc(50%-22px)]">
              {t('raw.stage.leftLabel')}
            </span>
            <span className="raw-lab-compare-label absolute bottom-[18px] right-[18px] left-auto z-[4] max-w-[calc(50%-32px)] rounded-full border border-[var(--color-stage-hairline)] bg-[var(--color-stage-panel)] px-2.5 py-1.5 pointer-events-none text-xs font-medium leading-tight text-[var(--color-on-stage)] opacity-0 transition-opacity duration-200 max-[640px]:max-w-[calc(50%-22px)]">
              {t('raw.stage.rightLabel')}
            </span>
```

  Keep the `raw-lab-compare-label` class as the **hook** the retained `[data-raw-compare-dragging] .raw-lab-compare-label { opacity: 1 }` rule targets (that opacity-reveal stays in CSS — see Task 3.4). Remove the now-duplicated bespoke `.raw-lab-compare-label*` *skin* properties in 3.4.
  - Stage-frame hook: on the `<Dropzone variant="stage" … className="raw-lab-stage-frame">`, change `className="raw-lab-stage-frame"` to `className="raw-lab-stage-frame"` **and add** `data-raw-stage-frame` is not a Dropzone prop — instead pass it through: Dropzone forwards `data-raw-lut` but not arbitrary data attrs. Simplest: keep the `raw-lab-stage-frame` class as the test hook and **revert the test change for stage-frame** — i.e. in Step 1 do NOT change the `.raw-lab-stage-frame` selector; only change the upload-dock assertion. (Stage-frame skin is migrated via Dropzone tokens in Task 3.3; the class remains as a stable structural hook used only by tests.)

  > Correction applied: In Step 1, **only** change line ~1015 (`raw-lab-upload-dock` → `data-raw-upload-dock`). Leave lines ~944/~1003 `.raw-lab-stage-frame` selectors as-is; `raw-lab-stage-frame` stays as a class hook (no skin rule will remain for it after 3.3/3.4, but the class string is harmless and keeps these tests stable).

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test:run src/modules/raw-processor/__tests__/workspace-ui.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/raw-processor/components/ComparePreviewStage.tsx src/modules/raw-processor/__tests__/workspace-ui.test.tsx
git commit --no-gpg-sign -m "refactor(raw): restyle upload dock + compare labels on tokens"
```

### Task 3.3: De-literal Dropzone stage variant + overlays

**Files:**
- Modify: `src/modules/raw-processor/components/Dropzone.tsx`
- Modify: `src/modules/raw-processor/components/ProgressOverlay.tsx`
- Modify: `src/modules/raw-processor/__tests__/workspace-ui.test.tsx`

- [ ] **Step 1: Update the literal-coupled test** in `workspace-ui.test.tsx` line ~1079: `expect(screen.getByText('50%')).toHaveClass('text-[oklch(0.97_0.014_86)]')` → `expect(screen.getByText('50%')).toHaveClass('text-[var(--color-on-stage)]')`.

- [ ] **Step 2: Run to verify fail**

Run: `pnpm test:run src/modules/raw-processor/__tests__/workspace-ui.test.tsx -t "50%"`
Expected: FAIL (still the oklch literal class).

- [ ] **Step 3: Replace oklch literals with token vars:**
  - `Dropzone.tsx` `variant === 'stage'` branches: replace
    - `bg-[oklch(0.59_0.15_153_/_0.18)]` → `bg-accent/20`
    - `border-[oklch(0.96_0.012_86_/_0.36)]` → `border-[var(--color-stage-hairline)]`
    - `border-[oklch(0.59_0.15_153)] bg-[oklch(0.59_0.15_153_/_0.16)]` → `border-accent bg-accent/20`
    - `hover:border-[oklch(0.59_0.15_153_/_0.72)]` → `hover:border-accent/70`
  - `ProgressOverlay.tsx` (ProgressOverlay): replace
    - scrim `bg-[oklch(0.14_0.018_76_/_0.82)]` → `bg-[var(--color-stage-scrim)]`
    - panel `border-[oklch(0.97_0.014_86_/_0.16)] bg-[oklch(0.16_0.018_76_/_0.78)] shadow-[0_24px_80px_oklch(0.1_0.02_76_/_0.32)]` → `border-[var(--color-stage-hairline)] bg-[var(--color-stage-panel)] shadow-lg`
    - ring `stroke="oklch(0.97 0.014 86 / 0.2)"` → `stroke="var(--color-progress-track)"`; arc `stroke="oklch(0.78 0.16 63)"` → `stroke="var(--color-progress)"`
    - `text-[oklch(0.97_0.014_86)]` (both occurrences) → `text-[var(--color-on-stage)]`
    - `text-[oklch(0.91_0.02_86_/_0.82)]` (all three) → `text-[var(--color-on-stage-soft)]`
    - bar track `bg-[oklch(0.97_0.014_86_/_0.18)]` → `bg-[var(--color-progress-track)]`; fill `bg-[oklch(0.78_0.16_63)]` → `bg-[var(--color-progress)]`
  - `ProgressOverlay.tsx` (ErrorOverlay): scrim `bg-[oklch(0.18_0.02_76_/_0.78)]` → `bg-[var(--color-stage-scrim)]` (rest of ErrorOverlay already uses tokens — `text-text`, `bg-fill`, etc.).

- [ ] **Step 4: Run to verify pass + guard**

Run: `pnpm test:run src/modules/raw-processor/__tests__/workspace-ui.test.tsx`
Then: `grep -rn "\[oklch" src/modules/raw-processor --include="*.tsx"`
Expected: tests PASS; grep returns **no matches** (zero oklch literals in any `/raw` tsx).

- [ ] **Step 5: Commit**

```bash
git add src/modules/raw-processor/components/Dropzone.tsx src/modules/raw-processor/components/ProgressOverlay.tsx src/modules/raw-processor/__tests__/workspace-ui.test.tsx
git commit --no-gpg-sign -m "refactor(raw): replace stage/overlay oklch literals with scoped tokens"
```

### Task 3.4: Final CSS teardown — delete stage skin, keep geometry token-fed

**Files:**
- Modify: `src/modules/raw-processor/raw-lab.css`

- [ ] **Step 1: Delete stage skin rules**, keeping geometry/structure:
  - `.raw-lab-stage`: keep (`position/overflow/padding` structural). Keep its ≤640 `@media` padding rule.
  - `.raw-lab-stage-frame`: **delete** `border`, `box-shadow`; **keep** nothing else needed (the Dropzone element already has Tailwind `rounded-lg` + token border via Task 3.3). If the rule becomes empty, delete the whole rule. The `raw-lab-stage-frame` class string stays on the element as an inert test hook.
  - `.raw-lab-upload-dock` (+ `:focus-visible`, `:disabled`, `-icon`, `-copy strong`, `-copy span`) and the ≤640 `.raw-lab-upload-dock` override: **delete entirely** (Tailwind now).
  - `.raw-lab-compare-label` (+ `-left`, `-right`) and the ≤640 `.raw-lab-compare-label` override: **delete the skin** (`border/background/color/font/padding/border-radius/position offsets`); **keep ONLY** `[data-raw-compare-dragging] .raw-lab-compare-label { opacity: 1 }` (the drag-reveal hook). Ensure the base `.raw-lab-compare-label { opacity:0; transition }` is now provided by Tailwind (added in 3.2) — so the standalone base rule can be deleted; keep just the `[data-raw-compare-dragging]` override.
  - **Keep token-fed (re-point any oklch literal to `var(--color-*)`):** `.raw-histogram-*` (already), `.raw-lab-compare-handle` (+ `::before`, ` span`, `:hover`/`:focus-visible`/`[data-raw-compare-dragging]` variants, `:disabled`) — re-point its `oklch(0.96…)` / `oklch(0.17…)` literals to `var(--color-on-stage)` / `var(--color-stage-panel)` / `var(--color-stage-hairline)`; `.raw-lab-sample-photo` / `.raw-lab-sample-finish` gradients (generated art — keep as-is, literals allowed in CSS sample art only); `.raw-lab` / `.raw-lab-shell` grid + ≤980/≤640 layout; `.raw-tool-surface` structural + scrollbar rules (re-point scrollbar to `var(--color-scrollbar-thumb*)` already done); `.raw-histogram-plot`; the `@media (prefers-reduced-motion)` blanket.

- [ ] **Step 2: Grep guards (must all pass)**

Run:
```bash
grep -rn "\[oklch" src/modules/raw-processor --include="*.tsx"
grep -n "raw-lab-topbar-button\|raw-lab-more-menu\|raw-mobile-tool-tab\|raw-lab-upload-dock\|raw-lab-stage-frame *{" src/modules/raw-processor/raw-lab.css
grep -rn "raw-lab-topbar\b\|raw-mobile-tool-sheet-close\|raw-mobile-tool-sheet-header" src/modules/raw-processor --include="*.tsx" --include="*.css"
```
Expected: **all three return no matches** (no tsx oklch literals; no deleted skin rules; no dangling references). `wc -l src/modules/raw-processor/raw-lab.css` should be roughly ~300 (structural/geometry/token only).

- [ ] **Step 3: Phase-3 full verification + golden path**

Run: `pnpm lint && pnpm test:run && pnpm build`
Expected: PASS, no unused-class/missing-import errors.

Manual browser validation:
- **Desktop golden path**: load a RAW → open LUT browser, pick a contract, change LUT → adjust Strength → Tone sliders → expand Histogram/Compare/File-facts cards → drag the compare split on the image (handle geometry + dragging label reveal intact) → Export (run; share/download/copy). Progress + error overlays read calm on the dark stage; warm paper/ink identity intact; no bright default Pastel leaking; no per-section dividers; weights ≤600.
- **Mobile 390px + WebKit**: header collapses to "More"; Tools/Export rail calm; sheet = same cards; drag-to-dismiss; long-press quick export; upload dock + compare labels restyled; safe-area respected.

- [ ] **Step 4: Commit**

```bash
git add src/modules/raw-processor/raw-lab.css
git commit --no-gpg-sign -m "refactor(raw): delete stage skin CSS, retain token-fed geometry"
```

---

## Self-Review Notes (author check — completed)

- **Spec coverage:** §1 WorkspaceHeader → Tasks 1.1–1.3. §2 Mobile rail/sheet (first-class) → Tasks 2.1–2.4 (rail 2.2, sheet+IconButton 2.3, CSS split 2.4, backdrop hook 2.1). §3 Stage chrome restyle → 3.1–3.4 (scrim tokens 3.1, upload/labels 3.2, dropzone/overlay literals 3.3). §4 Teardown + grep guards → 3.4 (+ 1.3, 2.4 incremental deletes). §5 Phasing/verification → per-phase final task with lint/test/build + browser/WebKit. §6 Testing → selector-only updates in 1.1/2.1/3.2/3.3, behavior assertions untouched. Spec "Risks" (breakpoint move) → mitigated by the documented Architecture refinement: structural/responsive CSS retained token-fed, only skin deleted; 640px breakpoint preserved verbatim (`max-[640px]:` utilities).
- **Divergence from spec, flagged:** spec predicted ~150 retained CSS lines; this plan retains structural+responsive CSS (~300 lines) to satisfy the user's explicit "must not regress" constraint, removing only the parallel *skin* system. Documented in the Architecture section and Self-Review for transparency.
- **Placeholder scan:** no TBD/TODO; every code step has concrete code or an exact selector→token mapping list and exact grep/test commands. Mechanical CSS deletions enumerate exact selectors + the exact verification greps rather than reproducing ~885 lines (same precedent the accepted panel plan used).
- **Type/selector consistency:** `data-raw-mobile-backdrop` introduced in 2.1 and used by the updated test; `data-raw-upload-dock` introduced in 3.2 and asserted in 3.2 Step 1; `raw-lab-stage-frame` / `raw-lab-compare-label` / `raw-lab-sample` retained as stable hooks consistently; scrim tokens defined in 3.1 and consumed in 3.2/3.3; `Button`/`IconButton`/`DropdownMenu*` import paths and variant names match the Key API Facts; the 640px breakpoint is expressed identically (`max-[640px]:`) across header, rail, and stage to match the retained `@media (max-width: 640px)` structural rules.
