# /raw Darkroom Design System Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `/raw` darkroom design system honest and un-mis-researchable — rename value-lying tokens to role names, collapse the warm-then-override-dark structure into a single dark `@theme` source, document the fixed-dark decision, and migrate chrome from vanilla CSS to Radix-first + Tailwind.

**Architecture:** `--color-lf-*` is a shared design-token system (consumed by `ui` Button/Slider/Chip + `/raw`, as CSS vars, Tailwind utilities, and arbitrary values). Tokens stay registered in `src/styles/tailwind.css` `@theme` (required for Tailwind utility generation) but their neutral-surface values become the dark darkroom values that `.raw-lab` previously overrode to. `.raw-lab` keeps only Pastel alias scoping, viewport-specific tokens, and layout. `/raw` is a fixed darkroom that ignores `data-theme`; the rest of the app follows the system theme.

**Tech Stack:** Tailwind v4 (`@theme`), Radix primitives, OKLCH color, Vitest, Playwright (browser parity), pnpm.

**Spec:** `docs/superpowers/specs/2026-05-30-raw-darkroom-design-system-refactor-design.md`

**Conventions for every commit:** use `git commit --no-gpg-sign` (SSH signing hangs headless). Branch is `refactor/raw-darkroom-design-system`. Do not stage the pre-existing unrelated working-tree changes (the `retire-legacy-export-capacity-inputs` deletions); stage only files this plan touches.

**Scope fences — never edit these:** `src/modules/raw-processor/components/preview-canvas.css` (preview executor), `src/modules/raw-processor/raw-lab.surface.css` (intentional vanilla CSS), the WebGL preview pipeline, `src/lib/export`, and `src/pages/(main)/index.css` (the landing's separate `.lf-landing` palette).

---

## Rename map (used throughout Phase 1)

| Old name | New name | @theme value after Phase 1 |
|---|---|---|
| `lf-paper` | `lf-surface` | `oklch(0.118 0.006 255)` |
| `lf-paper-high` | `lf-surface-raised` | `oklch(0.16 0.007 255 / 0.9)` |
| `lf-paper-low` | `lf-surface-sunk` | `oklch(0.085 0.006 255 / 0.74)` |
| `lf-paper-warm` | `lf-surface-muted` | `oklch(0.18 0.008 255 / 0.78)` |
| `lf-ink` | `lf-on-surface` | `var(--color-lf-on-photo-ink)` |
| `lf-ink-soft` | `lf-on-surface-soft` | `oklch(0.84 0.012 255 / 0.68)` |
| `lf-hero-ink` | `lf-on-photo-ink` | `oklch(0.970 0.014 86)` (unchanged) |
| `lf-dark` | `lf-darkroom-stage` | `oklch(0.180 0.020 76)` (unchanged) |
| `lf-dark-low` | `lf-darkroom-stage-low` | `oklch(0.230 0.026 76)` (unchanged) |
| `lf-hairline` | `lf-hairline` (unchanged) | `oklch(0.740 0.035 78)` (unchanged) |

Hue tokens (`lf-green*`, `lf-amber*`, `lf-rose`, `lf-sky`, `lf-hist-*`) and `lf-on-photo-*` are NOT renamed.

---

## Phase 0 — Baseline visual parity

### Task 0: Capture `/raw` baseline screenshots

**Files:**
- Create: `docs/superpowers/plans/_artifacts/darkroom-baseline/` (screenshots; git-ignored or committed per repo norm)

- [ ] **Step 1: Build and serve the app**

Run:
```bash
LUMAFORGE_NATIVE_RUNTIME_MODE=prebuilt pnpm build
pnpm serve --port 4321 &  # 'serve' -> vite preview (there is no 'preview' script)
```
Expected: preview server serving the production build (per `project_raw_browser_validation`: use `vite preview`, not dev).

- [ ] **Step 2: Capture desktop + mobile, empty/boot and sample-stage states**

Use the chrome-devtools / Playwright MCP to navigate to `http://localhost:4321/raw`, then screenshot:
- desktop empty/boot state (selector `.raw-lab[data-raw-lab-state="empty"]`)
- desktop sample-stage (`.raw-lab-sample` visible)
- mobile empty (`resize 390x844`, `.raw-mobile-empty`)
- mobile sample-stage

Save each PNG into the baseline folder. Headless RAW decode is blocked, so do NOT attempt to decode a real RAW; the empty/boot and sample-stage states are the parity surfaces.

- [ ] **Step 3: Commit the baseline reference**

```bash
git add docs/superpowers/plans/_artifacts/darkroom-baseline
git commit --no-gpg-sign -m "test(raw): capture darkroom baseline screenshots for parity gate"
```

These are the reference for the parity check after Phases 1 and 3.

---

## Phase 1 — Token truth (single dark source)

### Task 1: Mechanical rename across all consumption channels

**Files (modify):** all `.ts` / `.tsx` / `.css` under `src` that reference the renamed tokens — notably `src/styles/tailwind.css`, `src/modules/raw-processor/raw-lab.css`, `src/components/ui/button/Button.tsx`, `src/components/ui/slider/Slider.tsx`, `src/components/ui/slider/Slider.test.tsx`, `src/components/ui/chip/Chip.tsx`, `src/modules/raw-processor/components/Dropzone.tsx`, `src/modules/raw-processor/components/tools/lut/*.tsx`, `src/modules/raw-processor/components/mobile/MobileLutBrowser.test.tsx`.

- [ ] **Step 1: Run the ordered rename (longest-first to avoid partial overlaps)**

Run from repo root. Order matters: compound names before their prefixes, and `hero-ink` before `ink`.

```bash
cd /workspaces/LumaForge/LumaForge
FILES=$(grep -rlE "lf-(paper|ink|hero-ink|dark)" src --include="*.ts" --include="*.tsx" --include="*.css")
for f in $FILES; do
  perl -pi -e '
    s/lf-paper-high/lf-surface-raised/g;
    s/lf-paper-low/lf-surface-sunk/g;
    s/lf-paper-warm/lf-surface-muted/g;
    s/lf-paper/lf-surface/g;
    s/lf-hero-ink/lf-on-photo-ink/g;
    s/lf-ink-soft/lf-on-surface-soft/g;
    s/lf-ink/lf-on-surface/g;
    s/lf-dark-low/lf-darkroom-stage-low/g;
    s/lf-dark(?![a-z-])/lf-darkroom-stage/g;
  ' "$f"
done
```

Note: `lf-hairline`, `lf-green*`, `lf-amber*`, `lf-rose`, `lf-sky`, `lf-hist-*`, `lf-on-photo-*` are intentionally NOT matched.

- [ ] **Step 2: Verify no old names remain (except in docs/specs)**

Run:
```bash
grep -rnE "lf-(paper|hero-ink)\b|--color-lf-ink\b|lf-ink[^-]|lf-dark\b" src --include="*.ts" --include="*.tsx" --include="*.css"
```
Expected: no output (all renamed). If any line appears, fix it by hand.

- [ ] **Step 3: Run the UI suite to confirm value-preserving rename**

Run: `pnpm test:ui`
Expected: PASS. The rename is name-only; values are unchanged at this step (`@theme` still warm, `.raw-lab` still overrides dark), so `/raw` rendering is identical and class-assertion tests (Slider, MobileLutBrowser) pass against the renamed classes.

- [ ] **Step 4: Commit the rename**

```bash
# Stage only renamed files; NEVER `git add -A` (foreign unstaged changes exist).
git add $(git diff --name-only -- src | grep -vE 'ExportCanvas|IntensityChips|MetadataPanel|StatsPanel|UploadState|raw-processor/components/index\.ts|state/session\.atoms\.ts')
git commit --no-gpg-sign -m "refactor(raw): rename value-lying lf tokens to role names

paper->surface, ink->on-surface, hero-ink->on-photo-ink, dark->darkroom-stage.
Name-only; values unchanged. Spans CSS vars, Tailwind utilities, arbitrary
values, and test assertions."
```

### Task 2: Set `@theme` neutral surface tokens to the dark values

**Files:**
- Modify: `src/styles/tailwind.css` (the renamed neutral token definitions, formerly lines ~169-174)

- [ ] **Step 1: Replace the four warm surface values with the dark darkroom values**

In `src/styles/tailwind.css`, the renamed block currently reads (warm):
```css
  --color-lf-surface:        oklch(0.964 0.018 86);
  --color-lf-surface-raised: oklch(0.948 0.022 86);
  --color-lf-surface-sunk:   oklch(0.918 0.026 86);
  --color-lf-surface-muted:  oklch(0.900 0.034 82);
  --color-lf-on-surface:     oklch(0.180 0.018 76);
  --color-lf-on-surface-soft: oklch(0.380 0.032 75);
  --color-lf-hairline:       oklch(0.740 0.035 78);
```
Change the six surface tokens to the dark values (leave `--color-lf-hairline` unchanged):
```css
  --color-lf-surface:        oklch(0.118 0.006 255);
  --color-lf-surface-raised: oklch(0.16 0.007 255 / 0.9);
  --color-lf-surface-sunk:   oklch(0.085 0.006 255 / 0.74);
  --color-lf-surface-muted:  oklch(0.18 0.008 255 / 0.78);
  --color-lf-on-surface:     var(--color-lf-on-photo-ink);
  --color-lf-on-surface-soft: oklch(0.84 0.012 255 / 0.68);
  --color-lf-hairline:       oklch(0.740 0.035 78);
```

- [ ] **Step 2: Do not commit yet — proceed to Task 3 (the `.raw-lab` override removal is the same logical change).**

### Task 3: Remove the redundant `.raw-lab` neutral overrides

**Files:**
- Modify: `src/modules/raw-processor/raw-lab.css` (desktop block formerly lines ~67-72; mobile block formerly lines ~626-631)

- [ ] **Step 1: Delete the six neutral surface redefinitions from the desktop block**

In the `@media (min-width: 641px) { .raw-lab { … } }` block, delete these six lines (now renamed):
```css
    --color-lf-surface: oklch(0.118 0.006 255);
    --color-lf-surface-raised: oklch(0.16 0.007 255 / 0.9);
    --color-lf-surface-sunk: oklch(0.085 0.006 255 / 0.74);
    --color-lf-surface-muted: oklch(0.18 0.008 255 / 0.78);
    --color-lf-on-surface: var(--color-lf-on-photo-ink);
    --color-lf-on-surface-soft: oklch(0.84 0.012 255 / 0.68);
```
Keep everything else in the block (green overrides, Pastel aliases, preview-mat, on-photo, layout, background).

- [ ] **Step 2: Delete the same six lines from the mobile block**

In the `@media (max-width: 640px) { .raw-lab { … } }` block, delete the identical six renamed lines. Keep the rest.

- [ ] **Step 3: Verify `/raw` renders identically (parity gate)**

Run:
```bash
LUMAFORGE_NATIVE_RUNTIME_MODE=prebuilt pnpm build
pnpm serve --port 4321 &  # 'serve' -> vite preview (there is no 'preview' script)
```
Re-capture the four `/raw` screenshots from Task 0 and compare to the baseline. Expected: pixel-identical (the `@theme` dark values equal the deleted override values). If any surface differs, a value was mis-copied in Task 2; fix it.

- [ ] **Step 4: Commit the single-source consolidation**

```bash
git add src/styles/tailwind.css src/modules/raw-processor/raw-lab.css
git commit --no-gpg-sign -m "refactor(raw): single dark source for neutral surface tokens

@theme neutral surface tokens now hold the darkroom values directly; remove the
redundant per-token .raw-lab desktop/mobile overrides. /raw renders identically;
no more warm-define-then-dark-override hop."
```

### Task 4: Update and extend the CSS guard tests

**Files:**
- Modify: `src/modules/raw-processor/__tests__/raw-lab-css.test.ts`
- Create: `src/modules/raw-processor/__tests__/darkroom-tokens.test.ts`

- [ ] **Step 1: Fix `raw-lab-css.test.ts` for the consolidated structure**

The first test reads `--color-preview-mat` from the desktop `.raw-lab` base and the mobile block. Those tokens still exist (viewport-specific), so update only references that assumed the deleted neutral redefs. Re-run to find breaks:

Run: `pnpm vitest run src/modules/raw-processor/__tests__/raw-lab-css.test.ts`
Expected before fix: the preview-mat assertions still pass (unchanged); if any assertion referenced a now-deleted neutral line, update it to read the `@theme` token instead. Make the test green.

- [ ] **Step 2: Write the token-truth contract test**

Create `src/modules/raw-processor/__tests__/darkroom-tokens.test.ts`:
```ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const tailwindCss = readFileSync(
  resolve(process.cwd(), 'src/styles/tailwind.css'),
  'utf8',
)
const rawLabCss = readFileSync(
  resolve(process.cwd(), 'src/modules/raw-processor/raw-lab.css'),
  'utf8',
)

function lightnessOf(decl: string) {
  const match = decl.match(/oklch\(\s*([0-9.]+)/)
  expect(match, `expected an oklch literal in: ${decl}`).not.toBeNull()
  return Number(match![1])
}

describe('darkroom token truth', () => {
  it('defines the neutral surface tokens dark in @theme (single source)', () => {
    for (const token of ['--color-lf-surface', '--color-lf-surface-raised']) {
      const line = tailwindCss
        .split('\n')
        .find((l) => l.trim().startsWith(`${token}:`))
      expect(line, `missing ${token} in @theme`).toBeDefined()
      expect(lightnessOf(line!)).toBeLessThan(0.3)
    }
  })

  it('does not reintroduce warm-paper light surface values', () => {
    // The pre-refactor lie: a light surface value on the surface role.
    expect(tailwindCss).not.toContain('--color-lf-surface:        oklch(0.964')
    expect(tailwindCss).not.toMatch(/--color-lf-paper\b/)
  })

  it('keeps .raw-lab from re-declaring the neutral surface tokens', () => {
    expect(rawLabCss).not.toMatch(/--color-lf-surface\s*:/)
    expect(rawLabCss).not.toMatch(/--color-lf-on-surface\s*:/)
  })
})
```

- [ ] **Step 3: Run the new test**

Run: `pnpm vitest run src/modules/raw-processor/__tests__/darkroom-tokens.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit the guards**

```bash
git add src/modules/raw-processor/__tests__/raw-lab-css.test.ts src/modules/raw-processor/__tests__/darkroom-tokens.test.ts
git commit --no-gpg-sign -m "test(raw): guard darkroom token truth and single-source structure"
```

### Task 5: Anti-confusion docs

**Files:**
- Modify: `DESIGN.md`
- Modify: `src/modules/raw-processor/raw-lab.css` (header comment)
- Modify: `src/styles/tailwind.css` (comment at the lf token block)
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add the theme statement to the top of `DESIGN.md`**

Add, near the top:
```markdown
## Theme contract (read first)

`/raw` is a fixed cool-slate darkroom (hue ~255). It ignores `data-theme` and
is dark in every system theme. The rest of the app (landing, toasts, star
background) follows the system theme via Pastel `data-theme`.

The `--color-lf-*` tokens are the darkroom design system, defined once in
`src/styles/tailwind.css` `@theme` with their true dark values. Token roles:
`surface` / `surface-raised` / `surface-sunk` / `surface-muted` (chrome
surfaces), `on-surface` / `on-surface-soft` (text), `on-photo-ink` /
`on-photo-*` (over the photograph), `darkroom-stage*` (warm export moment),
hue roles `green` / `amber` / `rose` / `sky` / `hist-*`. The landing has a
separate warm palette under `.lf-landing` in `src/pages/(main)/index.css`.
```

- [ ] **Step 2: Add the `raw-lab.css` header comment**

At the very top of `src/modules/raw-processor/raw-lab.css`:
```css
/* /raw is a FIXED cool-slate darkroom. It ignores data-theme.
   The canonical lf-* token values live in src/styles/tailwind.css @theme
   (already dark). This file scopes the Pastel aliases (--color-background,
   --color-text, ...) to .raw-lab and carries viewport-specific tokens and
   intrinsic effects. Do NOT re-declare the neutral lf-surface/on-surface
   tokens here. See DESIGN.md "Theme contract". */
```

- [ ] **Step 3: Add the `@theme` comment**

Above the `--color-lf-surface` block in `src/styles/tailwind.css`:
```css
  /* LumaForge /raw darkroom tokens — these are DARK by design and are the
     single source of truth. /raw renders them directly; do not expect a
     light variant. See DESIGN.md "Theme contract". */
```

- [ ] **Step 4: Add the `CLAUDE.md` Architecture pointer**

In `CLAUDE.md` under "Architecture Snapshot", add one bullet:
```markdown
- `/raw` theme: a fixed cool-slate darkroom defined by `--color-lf-*` in
  `src/styles/tailwind.css` `@theme`; it ignores `data-theme`. See
  `DESIGN.md` "Theme contract" before touching tokens or theme code.
```

- [ ] **Step 5: Commit the docs**

```bash
git add DESIGN.md src/modules/raw-processor/raw-lab.css src/styles/tailwind.css CLAUDE.md
git commit --no-gpg-sign -m "docs(raw): document the fixed darkroom theme contract"
```

### Task 6: Phase 1 closeout verification

- [ ] **Step 1: Run app-surface verification**

Run:
```bash
pnpm lint:check
pnpm test:app
```
Expected: PASS.

- [ ] **Step 2: Build**

Run: `LUMAFORGE_NATIVE_RUNTIME_MODE=prebuilt pnpm build`
Expected: succeeds.

---

## Phase 2 — Theme-scaffold cleanup

### Task 7: Delete the dead `useSetTheme`

**Files:**
- Modify: `src/hooks/common/useDark.ts`

- [ ] **Step 1: Confirm zero callers**

Run: `grep -rn "useSetTheme" src --include="*.ts" --include="*.tsx" | grep -v "useDark.ts"`
Expected: no output.

- [ ] **Step 2: Remove the export**

In `src/hooks/common/useDark.ts`, delete the `useSetTheme` declaration:
```ts
export const useSetTheme = () =>
  useCallback((colorMode: ColorMode) => {
    jotaiStore.set(themeAtom, colorMode)
  }, [])
```
Remove now-unused imports if `useCallback` / `jotaiStore` become unused (check the rest of the file first; `jotaiStore` and `useCallback` are only used here — verify with a grep in the file before deleting imports).

- [ ] **Step 3: Verify**

Run: `pnpm test:ui && pnpm lint:check`
Expected: PASS (the retained `useSyncThemeark`, `useThemeAtomValue`, `useIsDark` are untouched).

- [ ] **Step 4: Commit**

```bash
git add src/hooks/common/useDark.ts
git commit --no-gpg-sign -m "chore(theme): remove dead useSetTheme (zero callers)

Theme follows the system; /raw is fixed dark. Keep useSyncThemeark,
useThemeAtomValue, useIsDark (landing, toasts, star background)."
```

---

## Phase 3 — Chrome to Radix-first + Tailwind

Migrate convertible rules out of `raw-lab.css` into component `className` strings (Radix primitives where a primitive fits). Keep genuinely-impossible effects in a thin, clearly-labeled CSS file.

**Per-component procedure (apply to each Task 8.x):**
1. Read the component's current rules in `raw-lab.css` (identified by its data-attribute selector) and the component `.tsx`.
2. Classify each declaration:
   - **Convertible → Tailwind className on the component:** layout (flex/grid/gap/padding/min-h), flat background / border / text colors that map to existing tokens, simple transitions, simple states.
   - **Intrinsic → stays in CSS:** multi-stop / layered gradients, radial backgrounds, `mix-blend-mode`, `backdrop-filter`, `::before`/`::after`, `clip-path`, data-attribute state selectors that cannot be expressed inline.
3. Move convertible declarations to the component; delete them from `raw-lab.css`.
4. Move any remaining intrinsic rules for this component into `raw-lab.effects.css` (create on first use; mirror the labeled-CSS pattern of `raw-lab.surface.css`). Import it where `raw-lab.css` is imported (`RawProcessorView.tsx`).
5. Verify: `pnpm test:ui`, then rebuild + re-capture this component's `/raw` screenshot and diff against the Phase 0 baseline. Must be pixel-identical (or an intentional, noted diff).
6. Commit one component per commit: `style(raw-desktop): migrate <component> chrome to Radix+Tailwind`.

### Task 8.0: Create the effects CSS shell

**Files:**
- Create: `src/modules/raw-processor/raw-lab.effects.css`
- Modify: `src/modules/raw-processor/RawProcessorView.tsx`

- [ ] **Step 1: Create `raw-lab.effects.css` with a header**

```css
/*
 * raw-lab effects: intrinsic darkroom visuals that Tailwind cannot express
 * cleanly — layered/radial gradients, mix-blend-mode, backdrop-filter,
 * ::before/::after, clip-path. Structure/layout/flat color live on the
 * components as Tailwind classes. See DESIGN.md "Theme contract".
 */
```

- [ ] **Step 2: Import it after `raw-lab.css`**

In `src/modules/raw-processor/RawProcessorView.tsx`, after the existing `import './raw-lab.surface.css'`:
```ts
import './raw-lab.effects.css'
```

- [ ] **Step 3: Verify and commit**

Run: `pnpm test:ui`
Expected: PASS (empty file is a no-op).
```bash
git add src/modules/raw-processor/raw-lab.effects.css src/modules/raw-processor/RawProcessorView.tsx
git commit --no-gpg-sign -m "style(raw): add labeled effects css shell for chrome migration"
```

### Tasks 8.1 – 8.9: Per-component migration

Apply the per-component procedure above to each, in this order (least-risky first). One commit each; parity gate after each.

- [ ] **Task 8.1 — Command topbar.** Selector `[data-raw-desktop-chrome='on-photo-topbar']`, actions `[data-raw-desktop-actions='command-cluster']`. Component: `src/modules/raw-processor/components/WorkspaceHeader.tsx`. Gradient + backdrop-filter stay in effects.css; layout/flat color to className.
- [ ] **Task 8.2 — Tool rail.** Selector `[data-raw-desktop-chrome='on-photo-tools']`, `[data-raw-tool-scroll]`, layout `[data-raw-desktop-layout='photo-stage-command-rail']`. Component: `src/modules/raw-processor/components/RawToolSurface.tsx`. Inner-shadow/backdrop stay in effects.css.
- [ ] **Task 8.3 — Tool card.** Selectors `[data-tool-card]`, `[data-tool-card][data-state='open']`, `[data-tool-card-trigger]`. Component: `src/modules/raw-processor/components/RawToolSurface.tsx` (cards). Use the Radix primitive already backing the disclosure if present; gradients/inset-shadow stay in effects.css.
- [ ] **Task 8.4 — Export footer.** Selectors `[data-raw-export-block='persistent']`, `::before`, `[data-raw-export-ready='true']`. Component: the export block in `RawToolSurface.tsx` / its export sub-component. The `::before` accent stripe + gradient stay in effects.css; the ready-state toggling stays attribute-driven.
- [ ] **Task 8.5 — Compare handle.** Selectors `.raw-lab-compare-handle`, `span`, `::before`, dragging state. Component: `src/modules/raw-processor/components/CompareSplitHandle.tsx`. Keep `transform`/`clip` logic and the green focus ring in effects.css; flat layout to className. Keep `CompareSplitHandle.test.tsx` green.
- [ ] **Task 8.6 — Stage frame.** Selectors `.raw-lab-stage`, `.raw-lab-stage-frame`, `.raw-lab-shell`. Component: `RawProcessorView.tsx` / `ComparePreviewStage.tsx`. Box-shadow framing stays in effects.css.
- [ ] **Task 8.7 — Progress / darkroom overlay.** Selectors `.raw-progress-overlay`, `[data-progress-variant='flat-handoff']`, `.raw-progress-darkroom-field`, `.raw-progress-panel`. Component: `src/modules/raw-processor/components/ProgressOverlay.tsx`. ALL gradients + the darkroom field stay in effects.css; only flat layout to className.
- [ ] **Task 8.8 — Histogram container.** Selectors `.raw-histogram-plot`, grid/baseline, channel fills/lines, `.raw-histogram-luma`. Component: `src/modules/raw-processor/components/tools/HistogramTool.tsx`. The `mix-blend-mode: screen` fills/lines and `drop-shadow` MUST stay in effects.css (they only work on the dark field). Only the container box may take className.
- [ ] **Task 8.9 — Mobile chrome.** Selectors under `@media (max-width: 640px)`: `.raw-mobile-empty*`, dock. Components: `src/modules/raw-processor/components/mobile/*`. Per `feedback_mobile_live_preview`, never dim/blur the preview. Radial backgrounds stay in effects.css; layout/flat color to className. Re-capture mobile baseline.

### Task 9: Phase 3 closeout

- [ ] **Step 1: Confirm `raw-lab.css` is now token + scoping only**

Run: `grep -cE "linear-gradient|radial-gradient|mix-blend-mode|backdrop-filter|::before|::after|clip-path" src/modules/raw-processor/raw-lab.css`
Expected: 0 (all intrinsic effects moved to `raw-lab.effects.css`), or a small documented remainder noted in the commit.

- [ ] **Step 2: Full closeout verification**

Run:
```bash
pnpm lint
pnpm test:run
LUMAFORGE_NATIVE_RUNTIME_MODE=prebuilt pnpm build
```
Expected: all PASS.

- [ ] **Step 3: Final parity gate**

Re-capture all four `/raw` screenshots and diff against the Phase 0 baseline. The whole refactor must leave `/raw` pixel-identical (any intentional diff is noted). Validate desktop + mobile, and WebKit chrome per `project_raw_browser_validation`.

- [ ] **Step 4: Finish the branch**

Use `superpowers:finishing-a-development-branch` to open the PR (do not merge to `main` without review).

---

## Delegation note

The Task 1 rename and the Task 8.x className conversions are mechanical; per `feedback_codex_delegation`, hand them to Codex and have Claude review each diff for contract-sensitive changes (on-photo contrast, blend behavior, parity). The contract-sensitive edits (Tasks 2–4 token values + guards) are Claude's to author.
