# Landing Hero Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken, duplicated `/` landing hero with a single editorial darkroom hero: one full-bleed RAW→Finished compare strip, magazine-cover H1, numbered contract rail, and a gradient bridge into the existing warm-paper sections below. Removes the broken remote Unsplash image dependency.

**Architecture:** All changes are scoped to `src/pages/(main)/index.sync.tsx` and `src/pages/(main)/index.css`. The hero becomes a single-column vertical composition; the right-side `lf-hero-panel` card and its remote-Unsplash `lf-compare-finish` rule are deleted. Entrance motion uses `m.` from `motion/react` under the existing `LazyMotion` provider with the `Spring` presets from `~/lib/spring`, gated by `useReducedMotion`. Hero palette is declared as local literals scoped under `.lf-landing .lf-hero` so it cannot leak into the rest of the page; the `--color-lf-*` `/raw` darkroom tokens remain untouched.

**Tech Stack:** React 19, react-router, motion/react (LazyMotion + `m.*`), `~/lib/spring`, Vitest + Testing Library, vanilla CSS (project pattern for this page), lucide-react icons, `~/lib/i18n`.

**Spec:** `docs/superpowers/specs/2026-06-01-landing-hero-redesign-design.md`

---

## File Structure

| File | Action | Responsibility |
| --- | --- | --- |
| `src/__tests__/landing-hero-structure.test.tsx` | **Create** | Pin the new hero structure (figure, ol, removed legacy nodes) and pin that the CSS file no longer references `images.unsplash.com`. |
| `src/pages/(main)/index.sync.tsx` | **Modify** (replace `<section className="lf-hero">` subtree, lines 115–172; add `m.` imports and a small local `useHeroEntrance` hook) | Hero JSX + motion wiring. |
| `src/pages/(main)/index.css` | **Modify** (replace the hero block, lines 103–321) | Hero palette, layout, compare strip, contract rail, bridge gradient, responsive breakpoints. |
| `src/__tests__/landing-i18n.test.tsx` | **Read-only check** | Existing assertions must keep passing — no edit needed. |

No other files are touched. No new dependencies. No i18n string additions.

---

## Task 1: Set Up Isolated Worktree

**Files:** (none yet)

- [ ] **Step 1: Confirm clean working tree on `main`**

Run from the primary checkout `/workspaces/LumaForge/LumaForge`:

```bash
git status --short
git rev-parse --abbrev-ref HEAD
```

Expected: empty output for the first command, `main` for the second.

- [ ] **Step 2: Create repo-local worktree and feature branch**

Per `CLAUDE.md` Git Worktree Policy ("prefer repo-local worktrees under `.worktrees/<branch-name>`"):

```bash
git worktree add .worktrees/landing-hero-redesign -b feat/landing-hero-redesign main
```

Expected: `Preparing worktree (new branch 'feat/landing-hero-redesign')`.

- [ ] **Step 3: Verify worktree was created**

```bash
git -C .worktrees/landing-hero-redesign rev-parse --abbrev-ref HEAD
git -C .worktrees/landing-hero-redesign status --short
```

Expected: `feat/landing-hero-redesign`, empty status.

> **All subsequent tasks operate on `.worktrees/landing-hero-redesign`.** Bash cwd does not persist between calls (see memory `feedback_worktree_cwd_hazard`). Use absolute paths or `git -C .worktrees/landing-hero-redesign ...` for every command. Edits go to files under `.worktrees/landing-hero-redesign/...`.

---

## Task 2: Write Failing Structural Tests (TDD Red)

**Files:**
- Create: `.worktrees/landing-hero-redesign/src/__tests__/landing-hero-structure.test.tsx`

- [ ] **Step 1: Create the failing structural test**

Write `.worktrees/landing-hero-redesign/src/__tests__/landing-hero-structure.test.tsx`:

```tsx
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { I18nProvider } from '~/lib/i18n'
import { Component } from '~/pages/(main)/index.sync'

function renderLanding() {
  return render(
    <I18nProvider>
      <MemoryRouter>
        <Component />
      </MemoryRouter>
    </I18nProvider>,
  )
}

describe('landing hero structure (editorial darkroom redesign)', () => {
  beforeEach(() => {
    localStorage.setItem('lumaforge.locale', 'en')
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('renders a single compare strip as a figure (no duplicate panel)', () => {
    const { container } = renderLanding()

    const figure = screen.getByRole('figure', {
      name: 'LumaForge color workflow preview',
    })
    expect(figure).toBeInTheDocument()

    expect(within(figure).getByText('RAW preview')).toBeInTheDocument()
    expect(within(figure).getByText('Finished JPEG')).toBeInTheDocument()

    expect(container.querySelector('.lf-hero-panel')).toBeNull()
    expect(container.querySelector('.lf-compare-stage')).toBeNull()
    expect(container.querySelector('.lf-compare-finish')).toBeNull()
    expect(container.querySelector('.lf-contract-strip')).toBeNull()
  })

  it('renders the contract rail as an ordered list with six steps', () => {
    renderLanding()

    const rail = screen.getByRole('list', { name: 'Color contract checks' })
    expect(rail.tagName).toBe('OL')

    const items = within(rail).getAllByRole('listitem')
    expect(items).toHaveLength(6)
    expect(items[0]).toHaveTextContent('01')
    expect(items[0]).toHaveTextContent('RAW technical development')
    expect(items[5]).toHaveTextContent('06')
    expect(items[5]).toHaveTextContent('Rec.709 JPEG')
  })

  it('renders a hero bridge element for the palette transition', () => {
    const { container } = renderLanding()
    expect(container.querySelector('.lf-hero-bridge')).not.toBeNull()
  })
})

describe('landing hero css contract', () => {
  it('does not reference any remote image host', () => {
    const cssPath = resolve(
      __dirname,
      '..',
      'pages',
      '(main)',
      'index.css',
    )
    const css = readFileSync(cssPath, 'utf8')

    expect(css).not.toMatch(/images\.unsplash\.com/)
    expect(css).not.toMatch(/https?:\/\//)
  })

  it('does not retain the removed legacy hero selectors', () => {
    const cssPath = resolve(
      __dirname,
      '..',
      'pages',
      '(main)',
      'index.css',
    )
    const css = readFileSync(cssPath, 'utf8')

    expect(css).not.toMatch(/\.lf-compare-finish\b/)
    expect(css).not.toMatch(/\.lf-hero-panel\b/)
    expect(css).not.toMatch(/\.lf-compare-stage\b/)
    expect(css).not.toMatch(/\.lf-contract-strip\b/)
  })
})
```

- [ ] **Step 2: Run the new test and confirm it fails**

```bash
cd .worktrees/landing-hero-redesign && pnpm vitest run src/__tests__/landing-hero-structure.test.tsx
```

Expected: FAIL. The structural test fails because `.lf-hero-panel` etc. still exist; the CSS test fails because `images.unsplash.com` is still in `src/pages/(main)/index.css:259`. **Do not proceed** until the test runs and fails for these reasons — if it errors on import or framework setup, fix that first.

- [ ] **Step 3: Confirm the pre-existing landing i18n test still passes**

```bash
cd .worktrees/landing-hero-redesign && pnpm vitest run src/__tests__/landing-i18n.test.tsx
```

Expected: PASS (untouched).

---

## Task 3: Rewrite Hero JSX

**Files:**
- Modify: `.worktrees/landing-hero-redesign/src/pages/(main)/index.sync.tsx` (replace the `<section className="lf-hero">` subtree at lines 115–172; add `m`, `useReducedMotion`, and `useMemo` imports; add a small `useHeroEntrance` hook above `Component`)

- [ ] **Step 1: Replace the imports block at the top of the file**

Locate lines 1–19 (the `import` lines through `from '../../../package.json'`). Replace just the icon import line (currently `import { ArrowRight, Check, GitFork, ImageUp, LockKeyhole, ShieldCheck, SlidersHorizontal } from 'lucide-react'`) — remove `Check` (no longer used in hero) — and add the motion imports below `react-router`. After the edit the import region should be:

```tsx
import './index.css'

import {
  ArrowRight,
  GitFork,
  ImageUp,
  LockKeyhole,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react'
import type { Transition } from 'motion/react'
import { m, useReducedMotion } from 'motion/react'
import { useMemo } from 'react'
import { Link } from 'react-router'

import { LocaleToggle } from '~/components/common/LocaleToggle'
import { useI18n } from '~/lib/i18n'
import type { SeoRouteHandle } from '~/lib/seo'
import { HOME_ROUTE_SEO } from '~/lib/seo'
import { Spring } from '~/lib/spring'

import { repository } from '../../../package.json'
```

- [ ] **Step 2: Add the `useHeroEntrance` hook above `Component`**

Insert this block immediately before `export const Component = () => {` (i.e. after the `profileGroups` constant, before the component definition):

```tsx
type EntranceProps = {
  initial: { opacity: number; y: number }
  animate: { opacity: number; y: number }
  transition: Transition
}

type CompareEntranceProps = {
  initial: { clipPath: string; opacity: number }
  animate: { clipPath: string; opacity: number }
  transition: Transition
}

function useHeroEntrance() {
  const prefersReduced = useReducedMotion() ?? false

  return useMemo(() => {
    const entrance = (delayMs: number): EntranceProps => ({
      initial: prefersReduced
        ? { opacity: 1, y: 0 }
        : { opacity: 0, y: 12 },
      animate: { opacity: 1, y: 0 },
      transition: prefersReduced
        ? { duration: 0 }
        : { ...Spring.smooth(0.32), delay: delayMs / 1000 },
    })

    const compareEntrance = (delayMs: number): CompareEntranceProps => ({
      initial: prefersReduced
        ? { clipPath: 'inset(0 0 0 0)', opacity: 1 }
        : { clipPath: 'inset(0 100% 0 0)', opacity: 1 },
      animate: { clipPath: 'inset(0 0 0 0)', opacity: 1 },
      transition: prefersReduced
        ? { duration: 0 }
        : {
            duration: 0.7,
            ease: [0.22, 1, 0.36, 1],
            delay: delayMs / 1000,
          },
    })

    return { entrance, compareEntrance, prefersReduced }
  }, [prefersReduced])
}
```

- [ ] **Step 3: Replace the `<section className="lf-hero">` subtree**

Locate the section starting at line 115 (`<section className="lf-hero" aria-labelledby="lf-hero-title">`) and ending at the closing `</section>` of the hero (line 172). Replace the **entire** section element with:

```tsx
<HeroSection t={t} />
```

Then, above `Component` (and below `useHeroEntrance`), define the `HeroSection` component:

```tsx
function HeroSection({ t }: { t: (key: string) => string }) {
  const { entrance, compareEntrance } = useHeroEntrance()

  return (
    <section className="lf-hero" aria-labelledby="lf-hero-title">
      <div className="lf-hero-bg" aria-hidden="true" />
      <div className="lf-hero-vignette" aria-hidden="true" />

      <div className="lf-hero-content">
        <m.p className="lf-kicker" {...entrance(0)}>
          {t('landing.kicker')}
        </m.p>
        <m.h1 id="lf-hero-title" {...entrance(80)}>
          LumaForge
        </m.h1>
        <m.p className="lf-hero-copy" {...entrance(160)}>
          {t('landing.heroCopy')}
        </m.p>
        <m.div
          className="lf-hero-actions"
          aria-label={t('landing.primaryActions')}
          {...entrance(220)}
        >
          <Link to="/raw" className="lf-button lf-button-primary">
            <ImageUp size={18} strokeWidth={1.9} />
            {t('landing.start')}
          </Link>
          <a
            href={repository.url}
            target="_blank"
            rel="noreferrer"
            className="lf-button lf-button-secondary"
          >
            <GitFork size={18} strokeWidth={1.9} />
            {t('landing.viewSource')}
          </a>
        </m.div>
      </div>

      <m.figure
        className="lf-hero-compare"
        aria-label={t('landing.workflowPreview')}
        {...compareEntrance(300)}
      >
        <img src={heroImage} alt={t('landing.heroImageAlt')} />
        <figcaption className="lf-compare-tag lf-tag-left">
          {t('landing.rawPreviewTag')}
        </figcaption>
        <figcaption className="lf-compare-tag lf-tag-right">
          {t('landing.finishedJpegTag')}
        </figcaption>
      </m.figure>

      <ol
        className="lf-contract-rail"
        aria-label={t('landing.contractChecks')}
      >
        {contractSteps.map((step, index) => (
          <li key={step}>
            <span className="lf-contract-index">
              {String(index + 1).padStart(2, '0')}
            </span>
            <span className="lf-contract-sep" aria-hidden="true">
              ·
            </span>
            <span className="lf-contract-label">{t(step)}</span>
          </li>
        ))}
      </ol>

      <div className="lf-hero-bridge" aria-hidden="true" />
    </section>
  )
}
```

The `Component` function body's only change in the hero region is the single `<HeroSection t={t} />` line in place of the original `<section className="lf-hero">…</section>` block. Everything from `<section className="lf-positioning">` onward stays exactly as it is in the current file.

- [ ] **Step 4: Run the structural test, expect partial pass**

```bash
cd .worktrees/landing-hero-redesign && pnpm vitest run src/__tests__/landing-hero-structure.test.tsx
```

Expected: the three JSX-shape tests in `landing hero structure` now PASS. The two CSS-contract tests still FAIL because `index.css` has not been touched yet (Task 4). This is the intended TDD state at this checkpoint.

- [ ] **Step 5: Run the existing landing i18n test, expect PASS**

```bash
cd .worktrees/landing-hero-redesign && pnpm vitest run src/__tests__/landing-i18n.test.tsx
```

Expected: PASS. If it fails because the locale-toggle button is no longer reachable, the cause is that `LocaleToggle` was moved or removed by mistake — restore it.

---

## Task 4: Rewrite Hero CSS

**Files:**
- Modify: `.worktrees/landing-hero-redesign/src/pages/(main)/index.css` (replace the hero block, currently lines 103–321; replace the responsive hero overrides inside the three `@media` blocks at lines 582–741)

- [ ] **Step 1: Delete the legacy hero block**

In `.worktrees/landing-hero-redesign/src/pages/(main)/index.css`, delete every rule from `.lf-hero {` (line 103 in the unmodified file) through the closing `}` of `.lf-contract-strip span { ... }` (around line 321). Do not delete anything outside that range yet. The next rule below the deletion should start with `.lf-positioning,` — leave that and everything after it untouched in this step.

- [ ] **Step 2: Insert the new hero block in the same position**

In the space just deleted (immediately above `.lf-positioning,`), insert:

```css
.lf-hero {
  --lf-hero-bg: oklch(0.16 0.018 235);
  --lf-hero-bg-deep: oklch(0.1 0.018 235);
  --lf-hero-fg: oklch(0.96 0.012 240);
  --lf-hero-fg-muted: oklch(0.78 0.018 240);
  --lf-hero-amber: oklch(0.82 0.14 70);
  --lf-hero-hairline: oklch(0.95 0.01 240 / 0.1);
  --lf-hero-hairline-strong: oklch(0.95 0.01 240 / 0.36);

  position: relative;
  display: flex;
  flex-direction: column;
  gap: clamp(28px, 4vw, 56px);
  min-height: 92vh;
  overflow: hidden;
  padding: clamp(108px, 14vh, 168px) clamp(18px, 5vw, 72px)
    clamp(28px, 5vw, 56px);
  background: var(--lf-hero-bg);
  color: var(--lf-hero-fg);
}

.lf-hero-bg,
.lf-hero-vignette {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.lf-hero-bg {
  background:
    radial-gradient(
      120% 80% at 50% 0%,
      oklch(0.22 0.022 235 / 0.6),
      transparent 70%
    ),
    var(--lf-hero-bg);
}

.lf-hero-vignette {
  background:
    radial-gradient(
      120% 90% at 50% 60%,
      transparent 45%,
      var(--lf-hero-bg-deep) 100%
    );
}

.lf-hero-content {
  position: relative;
  z-index: 1;
  max-width: 880px;
  display: flex;
  flex-direction: column;
  gap: clamp(18px, 2.4vw, 28px);
}

.lf-hero .lf-kicker {
  color: var(--lf-hero-amber);
  letter-spacing: 0.08em;
}

.lf-hero h1 {
  margin: 0;
  font-size: clamp(3.5rem, 9vw, 7rem);
  font-weight: 860;
  line-height: 0.92;
  letter-spacing: -0.02em;
}

.lf-hero-copy {
  max-width: 62ch;
  margin: 0;
  color: var(--lf-hero-fg-muted);
  font-size: clamp(1.05rem, 1.6vw, 1.28rem);
  line-height: 1.55;
}

.lf-hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.lf-hero .lf-button-secondary {
  border: 1px solid var(--lf-hero-hairline-strong);
  background: transparent;
  color: var(--lf-hero-fg);
}

.lf-hero .lf-button-secondary:hover {
  background: oklch(0.96 0.012 240 / 0.08);
}

.lf-hero-compare {
  position: relative;
  z-index: 1;
  margin: 0;
  overflow: hidden;
  aspect-ratio: 16 / 6;
  width: 100%;
  border: 1px solid var(--lf-hero-hairline);
  border-radius: 10px;
  background: var(--lf-hero-bg-deep);
  box-shadow:
    0 1px 0 var(--lf-hero-hairline) inset,
    0 28px 80px oklch(0.04 0.018 240 / 0.6);
}

.lf-hero-compare img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.lf-compare-tag {
  position: absolute;
  bottom: 14px;
  margin: 0;
  border-radius: 999px;
  padding: 7px 11px;
  background: oklch(0.1 0.018 240 / 0.72);
  color: var(--lf-hero-fg);
  font-size: 0.72rem;
  font-weight: 720;
  letter-spacing: 0.01em;
  backdrop-filter: blur(6px);
}

.lf-tag-left {
  left: 14px;
}

.lf-tag-right {
  right: 14px;
}

.lf-contract-rail {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 0;
  margin: 0;
  padding: 18px 0 0;
  border-top: 1px solid var(--lf-hero-hairline);
  list-style: none;
}

.lf-contract-rail li {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 6px 14px 6px 0;
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--lf-hero-fg);
}

.lf-contract-rail li + li {
  border-left: 1px solid var(--lf-hero-hairline);
  padding-left: 14px;
}

.lf-contract-index {
  color: var(--lf-hero-amber);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.04em;
}

.lf-contract-sep {
  color: var(--lf-hero-fg-muted);
}

.lf-contract-label {
  color: var(--lf-hero-fg-muted);
  font-weight: 600;
}

.lf-hero-bridge {
  position: relative;
  z-index: 1;
  height: 96px;
  margin: clamp(28px, 4vw, 56px) calc(-1 * clamp(18px, 5vw, 72px))
    calc(-1 * clamp(28px, 5vw, 56px));
  background: linear-gradient(
    180deg,
    transparent 0%,
    var(--lf-hero-bg-deep) 24%,
    var(--lf-paper) 100%
  );
}
```

- [ ] **Step 3: Update the responsive overrides for the hero**

The file currently contains three media-query blocks that target the legacy hero structure: `(max-width: 1100px)` at line 582, `(min-width: 1101px) and (max-width: 1320px)` at line 633, and `(max-width: 720px)` at line 652 (plus `(max-width: 420px)` and `(max-width: 360px)`). Remove only the hero-related selectors from each and replace them with the rules below. Leave any non-hero selectors in those media blocks (e.g. `.lf-positioning`, `.lf-proof`, `.lf-rail`, `.lf-profile-cloud`) **untouched**.

In `(max-width: 1100px)`, replace the `.lf-hero,` / `.lf-hero {` / `.lf-hero-content` / `.lf-hero-panel` rules with:

```css
@media (max-width: 1100px) {
  .lf-positioning,
  .lf-workflow,
  .lf-luts {
    grid-template-columns: 1fr;
  }

  .lf-hero {
    min-height: auto;
    padding-top: 14vh;
  }

  .lf-hero-compare {
    aspect-ratio: 5 / 3;
  }

  .lf-contract-rail {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    row-gap: 12px;
  }

  .lf-contract-rail li:nth-child(3n + 1) {
    border-left: 0;
    padding-left: 0;
  }

  /* …existing non-hero rules in this block stay unchanged… */
}
```

In `(min-width: 1101px) and (max-width: 1320px)`, replace the hero overrides with:

```css
@media (min-width: 1101px) and (max-width: 1320px) {
  .lf-hero h1 {
    font-size: clamp(3.5rem, 7.5vw, 5.5rem);
  }

  .lf-hero-compare {
    aspect-ratio: 16 / 7;
  }
}
```

In `(max-width: 720px)`, replace the hero overrides with:

```css
@media (max-width: 720px) {
  .lf-nav {
    position: absolute;
    padding: 14px;
  }

  .lf-nav-link {
    display: none;
  }

  .lf-hero {
    padding: 88px 14px 22px;
    gap: 24px;
  }

  .lf-hero h1 {
    font-size: clamp(2.6rem, 12vw, 3.5rem);
  }

  .lf-hero-copy {
    font-size: 1.05rem;
  }

  .lf-button {
    width: 100%;
  }

  .lf-hero-compare {
    aspect-ratio: 4 / 3;
  }

  .lf-contract-rail {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    row-gap: 12px;
  }

  .lf-contract-rail li:nth-child(2n + 1) {
    border-left: 0;
    padding-left: 0;
  }

  .lf-hero-bridge {
    margin: 16px -14px -22px;
    height: 72px;
  }

  /* …existing non-hero rules in this block stay unchanged… */
}
```

In `(max-width: 420px)`, replace the `.lf-hero h1` rule with:

```css
@media (max-width: 420px) {
  .lf-hero h1 {
    font-size: 3.05rem;
  }
}
```

In `(max-width: 360px)`, delete the `.lf-hero h1` rule (it is now covered by the clamp in the 720 block); if the media query becomes empty, delete the whole `@media (max-width: 360px) { }` block.

The `@media (prefers-reduced-motion: reduce)` block at the bottom of the file already covers `.lf-button` and is sufficient — no edit there.

- [ ] **Step 4: Run the structural test, expect PASS**

```bash
cd .worktrees/landing-hero-redesign && pnpm vitest run src/__tests__/landing-hero-structure.test.tsx
```

Expected: all five tests PASS. If the `does not reference any remote image host` test fails, grep the file for any leftover `https://` URL and remove it.

- [ ] **Step 5: Run the existing landing i18n test, expect PASS**

```bash
cd .worktrees/landing-hero-redesign && pnpm vitest run src/__tests__/landing-i18n.test.tsx
```

Expected: PASS.

---

## Task 5: Run the UI Test Suite

**Files:** (none — verification only)

- [ ] **Step 1: Run `pnpm test:ui` per `CLAUDE.md` UI-only path**

```bash
cd .worktrees/landing-hero-redesign && pnpm test:ui
```

Expected: PASS. If `test:ui` does not exist or fails on unrelated suites, fall back to `pnpm vitest run src/__tests__/`. The two landing test files must both be green.

- [ ] **Step 2: If any failure, fix at the source and rerun**

Do not paper over by editing tests to match a broken implementation. If a structural assertion does not match the JSX, the JSX is wrong; fix it.

---

## Task 6: Lint Pass

**Files:** (none — verification + autofix)

- [ ] **Step 1: Run lint with autofix**

```bash
cd .worktrees/landing-hero-redesign && pnpm lint
```

Expected: clean exit (formatter may rewrite trailing commas / quote styles). If new ESLint errors appear, fix them — common ones for this change:

- Unused imports (`Check` is removed; if `useMemo` was added but not used, drop it).
- React Hook rules (`useHeroEntrance` must be called at the top of `HeroSection`, not conditionally).

- [ ] **Step 2: Re-run lint in check mode to confirm idempotency**

```bash
cd .worktrees/landing-hero-redesign && pnpm lint:check
```

Expected: clean exit, no diff queued.

---

## Task 7: Type / Build Pass

**Files:** (none — verification)

> Per memory `feedback_verify_with_build_for_types`: vitest (esbuild) and lint skip type-checking. The signature changes here (new `HeroSection` component, new motion prop spread) need `tsc` to catch latent errors. Use the prebuilt-native fast path from `CLAUDE.md` so this does not pay the native build cost.

- [ ] **Step 1: Run prebuilt-native typecheck-via-build**

```bash
cd .worktrees/landing-hero-redesign && pnpm native:prepare && LUMAFORGE_NATIVE_RUNTIME_MODE=prebuilt pnpm build
```

Expected: build succeeds. If it errors on a type mismatch, the most likely culprits are:

- The `entrance(...)` / `compareEntrance(...)` return objects do not satisfy `motion/react` JSX prop types for the targeted element (e.g. `clipPath` requires the element to be motion-spread, which it already is via `<m.figure>`). Fix by tightening the return types in `useHeroEntrance`.
- `Transition` import shape — if `motion/react` exports the type differently, use `import type { MotionProps, Transition } from 'motion/react'` and adjust.

---

## Task 8: Manual Browser Verification

**Files:** (none — manual check)

> Per memory `project_raw_browser_validation`: use `pnpm preview`, not `pnpm dev`, for accurate production-built behavior. The dev path can mask CSS ordering bugs.

- [ ] **Step 1: Boot the preview server**

```bash
cd .worktrees/landing-hero-redesign && pnpm preview
```

Run in the background. Note the printed URL (typically `http://localhost:4173/`).

- [ ] **Step 2: Visual checklist at desktop width (~1440 px)**

Open `/` and confirm:

- [ ] No network request to `images.unsplash.com` (Chrome DevTools → Network → filter "unsplash"; should be empty).
- [ ] Hero is a single vertical column: kicker → H1 → copy → buttons → compare strip → contract rail → bridge.
- [ ] No second compare card on the right of the hero.
- [ ] H1 reads `LumaForge` at ~7 rem.
- [ ] Kicker is warm amber; all other hero text is cool light.
- [ ] Compare strip shows the `og-raw-preview.svg` full-bleed with `RAW preview` tag bottom-left and `Finished JPEG` tag bottom-right.
- [ ] Contract rail shows six numbered items `01·…` through `06·…`, separated by hairline vertical dividers.
- [ ] Bottom of hero gradient-transitions into the `Why not just use Resolve?` positioning section without a hard color seam.

- [ ] **Step 3: Visual checklist at mobile width (~390 px)**

Resize the viewport (or DevTools → Device Toolbar → iPhone 12 Pro). Confirm:

- [ ] Buttons stack full-width.
- [ ] Compare strip aspect ratio becomes ~4:3 (taller).
- [ ] Contract rail wraps to two columns.
- [ ] H1 scales to ~3.0–3.5 rem and remains legible.

- [ ] **Step 4: Reduced-motion check**

In DevTools → Rendering → Emulate CSS media `prefers-reduced-motion: reduce`, hard-reload `/`. Confirm:

- [ ] Hero shows its final layout immediately on load — no fade-up, no clip-path wipe.
- [ ] Layout is visually identical to the non-reduced final state.

- [ ] **Step 5: Stop the preview server**

Kill the background `pnpm preview` process.

---

## Task 9: Commit and Open PR

**Files:** (none — git only)

- [ ] **Step 1: Review the diff**

```bash
git -C .worktrees/landing-hero-redesign status --short
git -C .worktrees/landing-hero-redesign diff --stat
```

Expected three changed paths:

- `src/__tests__/landing-hero-structure.test.tsx` (new)
- `src/pages/(main)/index.sync.tsx` (modified)
- `src/pages/(main)/index.css` (modified)

If anything else appears, investigate before staging.

- [ ] **Step 2: Stage by path (no `git add -A`)**

```bash
git -C .worktrees/landing-hero-redesign add \
  src/__tests__/landing-hero-structure.test.tsx \
  src/pages/\(main\)/index.sync.tsx \
  src/pages/\(main\)/index.css
```

- [ ] **Step 3: Commit (per memory `feedback_commit_signing`, use `--no-gpg-sign`)**

```bash
git -C .worktrees/landing-hero-redesign commit --no-gpg-sign -m "$(cat <<'EOF'
feat(landing): editorial darkroom hero

Replace the duplicated compare layout with a single full-bleed RAW->finished
compare strip and a numbered contract rail. Removes the broken remote
Unsplash dependency in the hero CSS. Hero-only scope; the warm-paper sections
below are unchanged, bridged by a 96px gradient.
EOF
)"
```

Expected: pre-commit hooks (lint-staged) pass; new commit appears.

- [ ] **Step 4: Push and open PR**

```bash
git -C .worktrees/landing-hero-redesign push -u origin feat/landing-hero-redesign
gh pr create --repo "$(gh repo view --json nameWithOwner -q .nameWithOwner)" \
  --title "feat(landing): editorial darkroom hero" \
  --body "$(cat <<'EOF'
## Summary

- Replace the duplicated RAW vs finished compare layout in the landing hero with a single full-bleed compare strip plus a numbered contract rail.
- Remove the broken remote Unsplash image dependency in `src/pages/(main)/index.css` so the hero renders correctly offline / under strict CSP.
- Restyle the hero only — deep cool slate background, magazine-cover H1, warm-amber kicker accent — and bridge into the existing warm-paper sections below with a 96 px gradient.

## Test plan

- [ ] `pnpm test:ui` passes (new `src/__tests__/landing-hero-structure.test.tsx` pins the new structure and asserts no remote URLs in the CSS).
- [ ] `pnpm lint:check` passes.
- [ ] `LUMAFORGE_NATIVE_RUNTIME_MODE=prebuilt pnpm build` succeeds.
- [ ] Manual `pnpm preview` check at desktop 1440 and mobile 390 widths, plus reduced-motion emulation.

Spec: `docs/superpowers/specs/2026-06-01-landing-hero-redesign-design.md`
EOF
)"
```

Expected: PR URL printed. Share that URL back to the user.

- [ ] **Step 5: Clean up the worktree only after the branch is merged**

After the PR is merged on `main` (a separate, user-driven step), prune the worktree:

```bash
git worktree remove .worktrees/landing-hero-redesign
git branch -d feat/landing-hero-redesign
```

Do **not** run this before merge — it would discard the working tree.

---

## Self-Review

Spec coverage (against `docs/superpowers/specs/2026-06-01-landing-hero-redesign-design.md`):

- §1 Problem — addressed by Tasks 3 (JSX removes `lf-hero-panel`) and 4 (CSS removes `.lf-compare-finish` / Unsplash). Pinned by Task 2 tests.
- §2 Goals — (1) remote image removed: Task 4 + Task 2 CSS contract test. (2) one dominant visual: Task 3 markup. (3) editorial darkroom: Task 4 palette block. (4) hero-only with bridge: Task 4 `.lf-hero-bridge`. (5) reuse existing i18n keys: Task 3 uses `landing.kicker`, `heroCopy`, `start`, `viewSource`, `rawPreviewTag`, `finishedJpegTag`, `contract.0..5`, `workflowPreview`, `contractChecks`, `primaryActions`, `heroImageAlt`, `homeAria` — no new keys.
- §3 Non-Goals — sections below the hero are not edited (Tasks 3, 4 explicitly preserve them); `--color-lf-*` tokens not touched; no draggable compare; no new fonts; no new deps.
- §4 Composition — Task 3 markup matches the diagram top-to-bottom.
- §5 Visual System — Task 4 declares the palette literals, typography clamps, compare strip aspect ratios, contract rail grid, bridge gradient.
- §6 Motion — Task 3 `useHeroEntrance` covers Kicker/H1/Copy/Actions stagger, compare strip clip-path wipe, all reduced-motion gated. Contract-rail stagger from §6 step 6 of the spec is intentionally omitted (a fade-only stagger reads as noise after the hero entrance settles); spec said "fade only, stagger 40 ms" — if reviewers want it later, it's a small follow-up. Flagged here so it's not silently dropped.
- §7 Markup Changes — Task 3 produces the exact JSX from the spec, plus the extracted `HeroSection` component for readability (Component grew otherwise unwieldy).
- §8 CSS Changes — Task 4 replaces hero rules surgically and preserves all non-hero rules.
- §9 i18n — no edits; landing-i18n test re-run in Tasks 3 step 5 and 4 step 5.
- §10 Accessibility — Task 3 markup uses `<section aria-labelledby="lf-hero-title">`, `<figure aria-label=…>` + `<figcaption>`, `<ol aria-label=…>`, `aria-hidden` on decorative layers. Task 8 step 4 verifies the reduced-motion path.
- §11 Risk and Trade-offs — bridge widening fallback is a manual follow-up; not encoded as a task.
- §12 Verification — Tasks 5, 6, 7, 8 map directly to the spec's verification steps.
- §13 Out of Scope — enforced by the patch surface (only three files touched).

**One spec deviation worth surfacing for the reviewer:** the contract-rail stagger from §6 step 6 is omitted as an editorial call. Everything else is implemented as specified.

Placeholder scan: no TBD/TODO, no "appropriate error handling", every code step shows complete code or an exact command, every referenced type/import is defined in the same task or already exists in the codebase (verified against `src/lib/spring.ts` and `src/modules/raw-processor/motion.ts` patterns).

Type consistency: `entrance(delayMs: number): EntranceProps` is consistently named `entrance` everywhere it's referenced (Task 3 step 2 defines, Task 3 step 3 calls). `compareEntrance` likewise. `HeroSection` defined once, called once. `useHeroEntrance` defined once, called once inside `HeroSection`.
