# /raw Mobile ↔ Desktop Visual Consistency — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the Look-mode visual-consistency pilot from `docs/specs/2026-05-22-mobile-desktop-visual-consistency-design.md`: a shared foundation (tokens + primitives + named motion) under both `/raw` viewports, with Look mode (including Strength) recomposed against that foundation, while preserving each viewport's interaction model.

**Architecture:** Additive token layer (`lf-*` design tokens added to `src/styles/tailwind.css` `@theme` block, referenced from `~/lib/spring` and component classNames). A new `Chip` primitive in `~/components/ui/chip/`. The mobile LUT browser sheet rerouted through `~/components/ui/dialog` (Radix Dialog) with drag-to-dismiss as a thin behavioural overlay. The desktop LUT browser already uses Dialog — its surface treatment is realigned. `raw-lab.css` is reduced to histogram/SVG (bucket C) plus scrollbar/reset (bucket D) by migrating component-shape rules into component className strings.

**Tech Stack:** Tailwind v4 `@theme` (existing — `src/styles/tailwind.css`), Radix Dialog/Popover (existing — `~/components/ui/{dialog,popover}`), `motion/react` + `~/lib/spring` (existing), Vitest + React Testing Library (existing test stack).

**Design reference:** `MobileDesktopRAWLab-handoff.zip` extracted to `/tmp/raw-lab-handoff/mobile-raw-lab/project/` — canonical token list lives in `colors_and_type.css`; Look-mode composition lives in `lib/MobileRawLab.jsx` (mobile) and `lib/DesktopRawLab.jsx` (desktop). The plan extracts token *values* and *visual treatment* from these files. The plan does not copy their JSX structure — our component boundaries differ.

**Out of scope (deferred to successor specs):** Tone, Compare, Histogram, Export, MoreMenu/chrome edges. These remain untouched in this pilot.

---

## Task 1: Discovery — Look-mode divergence audit

**Files:**
- Create: `docs/audits/2026-05-22-look-mode-divergence.md`
- Read: `src/modules/raw-processor/components/mobile/MobileLutBrowser.tsx`
- Read: `src/modules/raw-processor/components/mobile/MobileStrengthPanel.tsx`
- Read: `src/modules/raw-processor/components/tools/lut/LutBrowserDialog.tsx`
- Read: `src/modules/raw-processor/components/tools/lut/LUTContractBrowser.tsx`
- Read: `src/modules/raw-processor/components/tools/lut/LUTProfileButton.tsx`
- Read: `src/modules/raw-processor/components/tools/StrengthControl.tsx`
- Read: `src/modules/raw-processor/components/ControlsPanel.tsx` (LUT-related sections only)
- Read: `src/modules/raw-processor/raw-lab.css`
- Read: `/tmp/raw-lab-handoff/mobile-raw-lab/project/colors_and_type.css`
- Read: `/tmp/raw-lab-handoff/mobile-raw-lab/project/lib/MobileRawLab.jsx` (Look + LUT browser only)
- Read: `/tmp/raw-lab-handoff/mobile-raw-lab/project/lib/DesktopRawLab.jsx` (Look only)

- [ ] **Step 1: Ensure design handoff is extracted and create the audit document**

```bash
mkdir -p docs/audits
if [ ! -d /tmp/raw-lab-handoff/mobile-raw-lab ]; then
  mkdir -p /tmp/raw-lab-handoff
  unzip -o /workspaces/LumaForge/MobileDesktopRAWLab-handoff.zip -d /tmp/raw-lab-handoff > /dev/null
fi
ls /tmp/raw-lab-handoff/mobile-raw-lab/project/colors_and_type.css
```

Expected: the `colors_and_type.css` path resolves. If the source zip is missing, ask the user for its location — the design handoff is required for tokens and visual reference.

- [ ] **Step 2: Populate audit with four tables**

The audit document must contain exactly these four tables. Use the template below. Every row must have a concrete answer — no "TBD".

```markdown
# Look-Mode Divergence Audit (2026-05-22)

Scope: Look-mode surface only — LUT browse + select + apply + Strength + reset.
Sources: code paths in plan Task 1; design reference in `/tmp/raw-lab-handoff`.

## Table A — Token escapees (hardcoded literals)

| # | Location (file:line) | Literal | Layer (className / CSS) | Target `lf-*` token |
|---|---------------------|---------|-------------------------|---------------------|
| ... | | | | |

Capture every: hex/oklch colour, px/rem radius, px/rem spacing that controls
chrome (padding/margin around Look surface, sheet edges, chip gap), ms duration,
custom shadow string, opacity-bearing colour like `white/20`, `black/35`.

## Table B — Component-shape rules in raw-lab.css consumed by Look

| # | Selector | Used by (component) | Bucket (B/C/D) | Migration target |
|---|----------|--------------------|----------------|-----------------|
| ... | | | | |

For Bucket B targets, "Migration target" is the component file that will own the
className. For Bucket C, write "retarget to var(--lf-*)". For Bucket D, write
"move to raw-lab.surface.css".

## Table C — Sheet/popover behaviour inventory

| # | Surface | File:line | Current impl | Has focus trap? | Has scroll lock? | Has escape? | Motion source |
|---|---------|-----------|--------------|-----------------|------------------|-------------|---------------|
| 1 | Mobile LUT browser sheet | MobileLutBrowser.tsx:~309 | hand-rolled m.div + useDragControls | ? | ? | ? | ad-hoc |
| 2 | Desktop LUT browser | LutBrowserDialog.tsx | ? | from Radix | from Radix | from Radix | ? |
| ... | | | | | | | |

## Table D — Primitive coverage

| Concept in Look | Current mobile | Current desktop | Shared primitive exists? | Action |
|-----------------|----------------|-----------------|--------------------------|--------|
| LUT preset card | inline JSX in MobileLutBrowser | LUTProfileButton | No | Promote shared `LutCard` OR keep separate but share Chip + surface tokens |
| Contract chip | inline JSX | inline JSX | No (`Chip` does not exist) | Create `~/components/ui/chip/` |
| Strength segments | `StrengthControl` | `StrengthControl` | Yes (SegmentGroup) | None — already shared |
| Sheet/popover surface | hand-rolled (Mobile) | Radix Dialog (Desktop) | Partial | Route mobile through Radix Dialog |
| Eyebrow label ("Look", "Strength") | inline | inline | No (existing eyebrow spec applied via raw-lab.css) | Keep CSS; add to Bucket A audit |
```

- [ ] **Step 3: Commit the audit**

```bash
git add docs/audits/2026-05-22-look-mode-divergence.md
git commit --no-gpg-sign -m "docs(audit): look-mode divergence inventory for visual consistency pilot"
```

The audit is the source of truth for Tasks 2–10. Subsequent tasks reference rows by table letter + row number.

---

## Task 2: Define `lf-*` token layer in Tailwind theme

**Files:**
- Modify: `src/styles/tailwind.css` (insert `lf-*` tokens into the existing `@theme` block at line 85 and the `@theme inline` block at line 217)
- Read: `/tmp/raw-lab-handoff/mobile-raw-lab/project/colors_and_type.css` (lines 20–108 are the canonical token block)

The token set is additive — existing `--color-*`, `--secondary`, `--muted` tokens stay unchanged. `lf-*` becomes the vocabulary the Look pilot consumes.

- [ ] **Step 1: Add the `lf-*` design tokens to `src/styles/tailwind.css`**

Inside the existing `@theme {` block (around line 85), append:

```css
  /* LumaForge design tokens — see colors_and_type.css in design handoff */
  --color-lf-paper:        oklch(0.964 0.018 86);
  --color-lf-paper-high:   oklch(0.948 0.022 86);
  --color-lf-paper-low:    oklch(0.918 0.026 86);
  --color-lf-paper-warm:   oklch(0.900 0.034 82);
  --color-lf-ink:          oklch(0.180 0.018 76);
  --color-lf-ink-soft:     oklch(0.380 0.032 75);
  --color-lf-hairline:     oklch(0.740 0.035 78);
  --color-lf-hero-ink:     oklch(0.970 0.014 86);
  --color-lf-dark:         oklch(0.180 0.020 76);
  --color-lf-dark-low:     oklch(0.230 0.026 76);
  --color-lf-green:        oklch(0.590 0.150 153);
  --color-lf-green-hover:  oklch(0.660 0.160 153);
  --color-lf-green-deep:   oklch(0.370 0.105 155);
  --color-lf-green-soft:   oklch(0.840 0.090 145);
  --color-lf-amber:        oklch(0.780 0.160 63);
  --color-lf-amber-soft:   oklch(0.900 0.055 76);
  --color-lf-rose:         oklch(0.620 0.170 346);
  --color-lf-sky:          oklch(0.650 0.100 214);
  --color-lf-hist-red:     oklch(0.78 0.18 29);
  --color-lf-hist-green:   oklch(0.86 0.15 126);
  --color-lf-hist-blue:    oklch(0.82 0.12 215);
  --color-lf-hist-luma:    oklch(0.96 0.018 86);
  --color-lf-on-photo-bg:        oklch(0.16 0.018 76 / 0.48);
  --color-lf-on-photo-bg-strong: oklch(0.16 0.018 76 / 0.76);
  --color-lf-on-photo-bord:      oklch(0.95 0.01  86 / 0.45);
  --color-lf-on-photo-bord-soft: oklch(0.96 0.012 86 / 0.26);

  --radius-lf-mark:    5px;
  --radius-lf-control: 8px;
  --radius-lf-panel:   8px;
  --radius-lf-pill:    999px;

  --spacing-lf-hairline:     1px;
  --spacing-lf-chip-gap:     7px;
  --spacing-lf-control-gap:  12px;

  --shadow-lf-photo:   0 24px 80px oklch(0.18 0.018 76 / 0.18);
  --shadow-lf-popover: 0 16px 42px oklch(0.18 0.018 76 / 0.18);
  --shadow-lf-mark:    0 8px 22px  oklch(0.10 0.020 78 / 0.24);

  --ease-lf-standard: cubic-bezier(0.22, 1, 0.36, 1);
  --duration-lf-standard: 180ms;
  --duration-lf-fast:     160ms;
```

The names follow Tailwind v4's `@theme` convention (`--color-*`, `--radius-*`, `--spacing-*`, `--shadow-*`, `--ease-*`, `--duration-*`) so Tailwind generates `bg-lf-paper`, `rounded-lf-control`, `shadow-lf-popover`, `duration-lf-standard`, etc. utility classes automatically.

- [ ] **Step 2: Add typography size tokens to the `@theme` block**

```css
  --text-lf-title:   1.46rem;
  --text-lf-body:    1.03rem;
  --text-lf-label:   0.76rem;
  --text-lf-control: 0.78rem;
```

Display/headline tokens are intentionally omitted — Look pilot does not use them.

- [ ] **Step 3: Run typecheck + build to confirm tokens emit correctly**

```bash
pnpm build
```

Expected: build passes. If Tailwind throws about token naming, the `@theme` block has a syntax issue — fix and re-run.

- [ ] **Step 4: Commit**

```bash
git add src/styles/tailwind.css
git commit --no-gpg-sign -m "feat(theme): land lf-* design tokens for visual consistency pilot"
```

---

## Task 3: Add `sheetSpring` and `surfaceFade` motion presets

**Files:**
- Modify: `src/lib/spring/index.ts` (or the file that exports the existing Spring presets — discover during step 1)
- Test: `src/lib/spring/__tests__/sheet-spring.test.ts` (create)

- [ ] **Step 1: Locate the current Spring export surface**

```bash
ls src/lib/spring/
```

Identify the file that exports the existing preset(s) used by `~/components/ui/segment`. That's where the two new presets land.

- [ ] **Step 2: Write the failing test**

`src/lib/spring/__tests__/sheet-spring.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { Spring, sheetSpring, surfaceFade } from '../index'

describe('motion presets', () => {
  it('Spring stays exported (unchanged for existing consumers)', () => {
    expect(Spring).toBeDefined()
  })

  it('sheetSpring is a non-reduced-motion-friendly spring transition', () => {
    expect(sheetSpring).toMatchObject({
      type: 'spring',
    })
  })

  it('surfaceFade pairs duration-lf-fast with ease-lf-standard semantics', () => {
    expect(surfaceFade).toMatchObject({
      duration: 0.16,
    })
    expect(surfaceFade.ease).toBeDefined()
  })
})
```

- [ ] **Step 3: Run the test and verify it fails**

```bash
pnpm vitest run src/lib/spring/__tests__/sheet-spring.test.ts
```

Expected: FAIL — `sheetSpring`/`surfaceFade` not exported.

- [ ] **Step 4: Add the two presets**

In the existing spring index, add:

```ts
import type { Transition } from 'motion/react'

export const sheetSpring: Transition = {
  type: 'spring',
  stiffness: 320,
  damping: 34,
  mass: 0.85,
}

export const surfaceFade: Transition = {
  duration: 0.16,
  ease: [0.22, 1, 0.36, 1],
}
```

Stiffness/damping/mass chosen to match `--duration-lf-standard` (~180ms settle) at the design system's `--ease-lf-standard` curve.

- [ ] **Step 5: Run the test and verify it passes**

```bash
pnpm vitest run src/lib/spring/__tests__/sheet-spring.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/spring src/lib/spring/__tests__/sheet-spring.test.ts
git commit --no-gpg-sign -m "feat(motion): add sheetSpring and surfaceFade presets"
```

---

## Task 4: Create the `Chip` primitive

**Files:**
- Create: `src/components/ui/chip/Chip.tsx`
- Create: `src/components/ui/chip/index.ts`
- Test: `src/components/ui/chip/Chip.test.tsx`

The chip serves Look's contract row, pill labels, and the LUT card "Official" tag. Variants needed (informed by design handoff + audit Table D):

- `tone`: `'neutral' | 'amber' | 'rose' | 'sky' | 'green'`
- `surface`: `'paper' | 'on-photo'` — switches between paper-stack token set and translucent-on-photo token set
- `size`: `'sm' | 'md'`

- [ ] **Step 1: Write the failing test**

`src/components/ui/chip/Chip.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Chip } from './Chip'

describe('<Chip />', () => {
  it('renders label', () => {
    render(<Chip>Daylight</Chip>)
    expect(screen.getByText('Daylight')).toBeInTheDocument()
  })

  it('applies tone variant tokens', () => {
    render(<Chip tone="amber" data-testid="chip">Calibration</Chip>)
    const chip = screen.getByTestId('chip')
    expect(chip.className).toMatch(/lf-amber/)
  })

  it('applies on-photo surface tokens', () => {
    render(<Chip surface="on-photo" data-testid="chip">Open</Chip>)
    const chip = screen.getByTestId('chip')
    expect(chip.className).toMatch(/lf-on-photo/)
  })

  it('forwards aria attributes', () => {
    render(<Chip aria-label="LUT contract">Linear</Chip>)
    expect(screen.getByLabelText('LUT contract')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

```bash
pnpm vitest run src/components/ui/chip/Chip.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the chip**

`src/components/ui/chip/Chip.tsx`:

```tsx
import type { HTMLAttributes } from 'react'

import { cn } from '~/lib/cn'

type ChipTone = 'neutral' | 'amber' | 'rose' | 'sky' | 'green'
type ChipSurface = 'paper' | 'on-photo'
type ChipSize = 'sm' | 'md'

interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: ChipTone
  surface?: ChipSurface
  size?: ChipSize
}

const TONE_PAPER: Record<ChipTone, string> = {
  neutral: 'bg-lf-paper-low text-lf-ink-soft border-lf-hairline',
  amber:   'bg-lf-amber-soft text-lf-ink border-lf-amber',
  rose:    'bg-lf-paper-warm text-lf-rose border-lf-rose/40',
  sky:     'bg-lf-paper-low text-lf-sky border-lf-sky/40',
  green:   'bg-lf-green-soft text-lf-green-deep border-lf-green-deep/30',
}

const TONE_ON_PHOTO: Record<ChipTone, string> = {
  neutral: 'bg-lf-on-photo-bg text-lf-hero-ink border-lf-on-photo-bord-soft',
  amber:   'bg-lf-on-photo-bg-strong text-lf-amber border-lf-amber/55',
  rose:    'bg-lf-on-photo-bg-strong text-lf-rose border-lf-rose/55',
  sky:     'bg-lf-on-photo-bg-strong text-lf-sky border-lf-sky/55',
  green:   'bg-lf-on-photo-bg-strong text-lf-green-soft border-lf-green/55',
}

const SIZE: Record<ChipSize, string> = {
  sm: 'h-6 px-2 text-lf-label tracking-wide uppercase',
  md: 'h-7 px-2.5 text-lf-control',
}

export function Chip({
  tone = 'neutral',
  surface = 'paper',
  size = 'sm',
  className,
  children,
  ...rest
}: ChipProps) {
  const tonePalette = surface === 'on-photo' ? TONE_ON_PHOTO : TONE_PAPER
  return (
    <span
      {...rest}
      className={cn(
        'inline-flex items-center gap-1 rounded-lf-pill border font-medium whitespace-nowrap',
        tonePalette[tone],
        SIZE[size],
        className,
      )}
    >
      {children}
    </span>
  )
}
```

`src/components/ui/chip/index.ts`:

```ts
export { Chip } from './Chip'
```

- [ ] **Step 4: Run the test and verify it passes**

```bash
pnpm vitest run src/components/ui/chip/Chip.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Run lint to confirm no style violations**

```bash
pnpm lint --filter=./src/components/ui/chip
```

If the project's lint config doesn't accept `--filter`, run `pnpm lint` and confirm no new errors under `src/components/ui/chip`.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/chip
git commit --no-gpg-sign -m "feat(ui): add Chip primitive for visual consistency pilot"
```

---

## Task 5: Route mobile LUT browser sheet through Radix Dialog

**Files:**
- Modify: `src/modules/raw-processor/components/mobile/MobileLutBrowser.tsx`
- Read: `src/components/ui/dialog/Dialog.tsx` (understand existing wrapper API)
- Test: existing `src/modules/raw-processor/components/mobile/MobileLutBrowser.test.tsx`

The hand-rolled `m.div` sheet at the current MobileLutBrowser sheet root is replaced by `<Dialog>` + `<DialogContent>` from `~/components/ui/dialog`. Drag-to-dismiss stays — it wraps `DialogContent`'s motion layer via `motion/react` `m.div` *inside* the dialog content slot, not as a replacement.

- [ ] **Step 1: Read existing Dialog API**

```bash
sed -n '1,260p' src/components/ui/dialog/Dialog.tsx
```

Identify the exact prop names of: `Dialog`, `DialogContent`, `DialogOverlay`, `DialogTrigger`, `DialogTitle`. Note whether `DialogContent` supports a custom `asChild` motion wrapper (Radix convention).

- [ ] **Step 2: Confirm the test file's current assertions**

```bash
cat src/modules/raw-processor/components/mobile/MobileLutBrowser.test.tsx
```

The migration must keep all assertions passing. If any assertion depends on the hand-rolled sheet's DOM (e.g. `role="dialog"` provided manually), update the test to query Radix-emitted DOM (Radix Dialog sets `role="dialog"` automatically) — but only if the underlying behaviour is preserved.

- [ ] **Step 3: Restructure the sheet to use Dialog**

Replace the current sheet root JSX (`<motion.div ... className="absolute inset-x-0 bottom-0 z-[46] grid max-h-[82%] grid-rows-..." drag="y" dragControls={...} ...>`) with:

```tsx
import { Dialog, DialogContent } from '~/components/ui/dialog'
import { sheetSpring } from '~/lib/spring'

// open state already exists in component; reuse it
<Dialog open={open} onOpenChange={onOpenChange}>
  <DialogContent
    aria-label={t('raw.lut.browser.title')}
    className="absolute inset-x-0 bottom-0 z-[46] grid max-h-[82%] grid-rows-[auto_minmax(0,1fr)] rounded-t-lf-panel border-t border-lf-on-photo-bord bg-lf-dark text-lf-hero-ink shadow-lf-popover pb-safe-offset-3"
  >
    <m.div
      drag={prefersReduced ? false : 'y'}
      dragControls={dragControls}
      dragListener={false}
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={{ top: 0, bottom: 0.4 }}
      onDragEnd={existingOnDragEnd}
      transition={sheetSpring}
      className="contents"
    >
      {/* unchanged sheet contents */}
    </m.div>
  </DialogContent>
</Dialog>
```

Notes:
- Radix Dialog handles focus trap, escape, scroll lock, and `aria-modal` automatically. Remove any hand-rolled equivalents.
- Drag handle stays — `onPointerDown={(e) => dragControls.start(e)}` on the visual drag handle is preserved.
- The overlay treatment ("never dim/blur the preview" memory rule): override Radix's default overlay by passing `<DialogOverlay className="hidden" />` or the project's existing convention for non-modal sheets — discover by grepping `DialogOverlay` usages once in step 2's reading.
- The big inline `bg-[linear-gradient(...)]` and `shadow-[0_-22px_...]` literals in the current sheet className become `bg-lf-dark` + `shadow-lf-popover`. The remaining surface tokens (`border-lf-on-photo-bord`, `rounded-lf-panel`) come from Task 2's `lf-*` set.

- [ ] **Step 4: Run the existing MobileLutBrowser tests**

```bash
pnpm vitest run src/modules/raw-processor/components/mobile/MobileLutBrowser.test.tsx
```

Expected: PASS. If a test asserts on hand-rolled DOM that Radix replaces, update the assertion to query the new DOM (e.g. `getByRole('dialog')` instead of `container.querySelector('.fixed.bottom-0')`).

- [ ] **Step 5: Run the full mobile component test suite**

```bash
pnpm vitest run src/modules/raw-processor/components/mobile
```

Expected: PASS. The MobileLabChrome / MobileMoreSheet / etc. tests must not regress.

- [ ] **Step 6: Commit**

```bash
git add src/modules/raw-processor/components/mobile/MobileLutBrowser.tsx \
        src/modules/raw-processor/components/mobile/MobileLutBrowser.test.tsx
git commit --no-gpg-sign -m "refactor(raw-mobile): route LUT browser sheet through Radix Dialog"
```

---

## Task 6: Apply `lf-*` tokens to MobileLutBrowser surface (Bucket A — TSX)

**Files:**
- Modify: `src/modules/raw-processor/components/mobile/MobileLutBrowser.tsx`

Using Table A rows scoped to `MobileLutBrowser.tsx`, replace every captured literal with its `lf-*` token equivalent.

- [ ] **Step 1: List the literals from the audit**

Open `docs/audits/2026-05-22-look-mode-divergence.md`, filter Table A by `Location` starting with `MobileLutBrowser.tsx`. Each row tells you the literal and the target token.

- [ ] **Step 2: Apply replacements**

Examples (the exact set comes from the audit):

| Old | New |
|---|---|
| `border-white/20` | `border-lf-on-photo-bord` |
| `border-white/25` | `border-lf-on-photo-bord` |
| `border-white/15` | `border-lf-on-photo-bord-soft` |
| `bg-black/35` | `bg-lf-on-photo-bg` |
| `bg-[linear-gradient(180deg,oklch(0.21_0.024_78),oklch(0.13_0.02_76))]` | `bg-lf-dark` |
| `shadow-[0_-22px_50px_oklch(0.04_0.012_76/0.55)]` | `shadow-lf-popover` |
| `rounded-t-2xl` | `rounded-t-lf-panel` |
| `text-white` | `text-lf-hero-ink` |
| `hover:border-amber-400/50` | `hover:border-lf-amber` |
| `hover:text-amber-400` | `hover:text-lf-amber` |
| `border-amber-400/35` / `bg-amber-400/10` / `text-amber-100` | `border-lf-amber/45` / `bg-lf-amber-soft/15` / `text-lf-amber-soft` |

Inline chips (the LUT-card "Official" badge, the "Daylight" / "Open" contract chip) become `<Chip tone="..." surface="on-photo" />` using the primitive from Task 4. Capture them as separate commit-able edits if the JSX touch is large.

- [ ] **Step 3: Run lint + the MobileLutBrowser tests**

```bash
pnpm lint
pnpm vitest run src/modules/raw-processor/components/mobile/MobileLutBrowser.test.tsx
```

Expected: PASS, no new lint errors.

- [ ] **Step 4: Commit**

```bash
git add src/modules/raw-processor/components/mobile/MobileLutBrowser.tsx
git commit --no-gpg-sign -m "style(raw-mobile): apply lf-* tokens to LUT browser surface"
```

---

## Task 7: Apply `lf-*` tokens to MobileStrengthPanel and surrounding chrome

**Files:**
- Modify: `src/modules/raw-processor/components/mobile/MobileStrengthPanel.tsx`
- Modify (only the Look-related section): `src/modules/raw-processor/components/mobile/MobileLabChrome.tsx`
- Test: existing tests under `src/modules/raw-processor/components/mobile/*StrengthPanel*.test.tsx` if present

The Strength control itself is `StrengthControl` (already shared, uses `SegmentGroup`). The pilot fix is the *surrounding chrome*: section heading, eyebrow label, divider, contract chip, and the "Applies to LUT, not tone" caption — these all have hardcoded values today.

- [ ] **Step 1: Apply replacements from audit Table A rows scoped to MobileStrengthPanel**

Replace eyebrow / heading / caption colour and size literals with `text-lf-label` (eyebrow), `text-lf-title` (heading), `text-lf-body` / `text-lf-ink-soft` (caption). Replace any divider literal with `border-lf-hairline`.

- [ ] **Step 2: Apply the same in MobileLabChrome's Look section only**

Search MobileLabChrome.tsx for any literal flagged in Table A. Modify only the Look-related JSX subtree; leave Tone/Export/Compare subtrees untouched (out of scope).

- [ ] **Step 3: Run lint + mobile tests**

```bash
pnpm lint
pnpm vitest run src/modules/raw-processor/components/mobile
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/modules/raw-processor/components/mobile/MobileStrengthPanel.tsx \
        src/modules/raw-processor/components/mobile/MobileLabChrome.tsx
git commit --no-gpg-sign -m "style(raw-mobile): apply lf-* tokens to Strength panel + Look chrome"
```

---

## Task 8: Apply `lf-*` tokens to desktop Look surface

**Files:**
- Modify: `src/modules/raw-processor/components/tools/lut/LutBrowserDialog.tsx`
- Modify: `src/modules/raw-processor/components/tools/lut/LUTProfileButton.tsx`
- Modify: `src/modules/raw-processor/components/tools/lut/LUTContractBrowser.tsx`
- Modify: `src/modules/raw-processor/components/tools/lut/LUTProfileStatus.tsx`
- Modify: `src/modules/raw-processor/components/tools/lut/LutContractTool.tsx`
- Modify: `src/modules/raw-processor/components/tools/lut/LutIconButton.tsx`
- Modify (Look + Strength sections only): `src/modules/raw-processor/components/ControlsPanel.tsx`

Each file gets touched only for the literals appearing in audit Table A. Other content stays.

- [ ] **Step 1: Apply replacements per audit, file by file**

For each LUT-tool file, do one focused edit pass:
1. Open the file.
2. Replace literals row-by-row from Table A.
3. Substitute inline chip JSX with `<Chip ... />` where the audit flags it (likely in `LUTProfileStatus` for contract chips).
4. Save.

For `ControlsPanel.tsx`, restrict edits to the LUT / Look / Strength JSX subtree. Tone/Histogram/Export/Compare sections are out of scope.

- [ ] **Step 2: Run lint + the LUT tool tests**

```bash
pnpm lint
pnpm vitest run src/modules/raw-processor/components/tools/lut
```

Expected: PASS.

- [ ] **Step 3: Commit (split if large)**

```bash
git add src/modules/raw-processor/components/tools/lut \
        src/modules/raw-processor/components/ControlsPanel.tsx
git commit --no-gpg-sign -m "style(raw-desktop): apply lf-* tokens to Look + LUT browser surface"
```

If the LUT-tool diff is large, split into two commits (one for `tools/lut/*`, one for `ControlsPanel.tsx`).

---

## Task 9: Migrate Bucket B selectors out of `raw-lab.css`

**Files:**
- Modify: `src/modules/raw-processor/raw-lab.css`
- Modify: the component files identified in audit Table B as the "Migration target" for each Bucket B row

For every row in Table B with `Bucket = B`, move the declarations from the CSS file into the component's `className`, then delete the selector block from `raw-lab.css`.

- [ ] **Step 1: For each Bucket B row in Table B, apply the migration**

For each row:
1. Open the selector block in `raw-lab.css`.
2. Convert each CSS property to its Tailwind equivalent (preferring `lf-*` tokens). If a property has no Tailwind shorthand, use arbitrary-value syntax referencing the token (e.g. `[grid-template-columns:minmax(0,1fr)_auto]`).
3. Append the resulting classes to the target component's existing `className`.
4. Delete the CSS selector block (and any now-orphaned selector ancestors).

- [ ] **Step 2: Verify visual parity by running tests**

```bash
pnpm vitest run src/modules/raw-processor
```

Expected: PASS. Tests do not assert pixel parity, but they will catch DOM-shape regressions if a CSS-only class is referenced from a test.

- [ ] **Step 3: Manual visual spot-check**

```bash
pnpm build && pnpm preview
```

Open the preview URL in a browser. Navigate to `/raw`. With a test RAW file (or via the route's stub state), enter Look mode. Verify:
- Card grid still grids.
- Strength segmented control still segments.
- LUT browser still opens and dismisses.

Memory note: vite preview, not dev (per `project_raw_browser_validation`).

- [ ] **Step 4: Commit**

```bash
git add src/modules/raw-processor/raw-lab.css \
        src/modules/raw-processor/components
git commit --no-gpg-sign -m "refactor(raw): migrate Bucket B selectors from raw-lab.css to className"
```

---

## Task 10: Retarget Bucket C (SVG/canvas) and isolate Bucket D (scrollbar/reset)

**Files:**
- Modify: `src/modules/raw-processor/raw-lab.css`
- Create: `src/modules/raw-processor/raw-lab.surface.css`
- Modify: `src/modules/raw-processor/RawProcessorView.tsx` (or wherever `raw-lab.css` is imported) — add the new surface import

- [ ] **Step 1: Retarget Bucket C selectors to CSS variables**

For each Bucket C row in Table B (`raw-histogram-*` and related SVG selectors), replace hardcoded hex/oklch values with `var(--color-lf-hist-red)`, `var(--color-lf-hist-green)`, `var(--color-lf-hist-blue)`, `var(--color-lf-hist-luma)` from Task 2's token set. Scrollbar/reset selectors are not touched here.

Example transformation:

```css
/* before */
.raw-histogram-channel-fill-red { fill: oklch(0.78 0.18 29); }

/* after */
.raw-histogram-channel-fill-red { fill: var(--color-lf-hist-red); }
```

- [ ] **Step 2: Move Bucket D selectors into the new surface file**

Cut all `::-webkit-scrollbar-*` selectors and the `.raw-lab *` reset block (and any other Bucket D row in Table B) out of `raw-lab.css` and paste them into a new file:

`src/modules/raw-processor/raw-lab.surface.css`:

```css
/*
 * raw-lab surface: scrollbar + reset rules.
 * Intentional vanilla CSS — Tailwind has limited reach into ::-webkit-scrollbar
 * pseudo-elements and the .raw-lab *  universal reset block.
 * Do not add token-bearing rules here; those live in raw-lab.css (SVG/canvas)
 * or in component className strings.
 */
```

Then paste the cut rules underneath.

- [ ] **Step 3: Import the new surface file**

Find the existing `import './raw-lab.css'` (likely in `RawProcessorView.tsx` or `src/modules/raw-processor/index.ts`). Add immediately after it:

```ts
import './raw-lab.surface.css'
```

- [ ] **Step 4: Verify `raw-lab.css` now contains only Bucket C and any remaining cross-cutting rules**

```bash
wc -l src/modules/raw-processor/raw-lab.css
```

Expected: significantly reduced from the original 594 lines (directional target: ≤150 lines per spec). If higher, audit again — some rules likely qualify for migration but were missed in earlier tasks.

- [ ] **Step 5: Run lint, tests, and build**

```bash
pnpm lint && pnpm test:run && pnpm build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/modules/raw-processor/raw-lab.css \
        src/modules/raw-processor/raw-lab.surface.css \
        src/modules/raw-processor/RawProcessorView.tsx
git commit --no-gpg-sign -m "refactor(raw): retarget SVG rules to lf-* vars and isolate scrollbar/reset"
```

---

## Task 11: Browser validation against the family-resemblance criterion

**Files:**
- Update: `docs/audits/2026-05-22-look-mode-divergence.md` (add a final "After" section)

- [ ] **Step 1: Build + preview**

```bash
pnpm build && pnpm preview
```

Confirm the preview URL.

- [ ] **Step 2: Capture before/after pairs**

For each of these states, capture two screenshots (mobile viewport ~390×844, desktop viewport ~1440×900):
1. Look mode entry — first paint of Look surface
2. LUT browser open
3. LUT selected, Strength = Standard
4. Strength changed to Strong
5. Look reset / cleared

Place screenshots under `docs/audits/screenshots/2026-05-22/`.

Memory note: headless RAW decode is blocked in the WSL devcontainer (per `project_raw_browser_validation`). If a real RAW upload cannot complete in preview, use whatever Look-stub the existing test fixtures rely on, or capture screenshots from a state that does not require a decoded preview (token-bearing chrome is still the criterion target).

- [ ] **Step 3: Apply the family-resemblance rubric**

For each screenshot pair, ask: *would a stranger sub-consciously associate these as the same product?* Check specifically:
- Typography step (mobile uses a one-step-larger version of the same scale).
- Radius (both use `lf-control` / `lf-panel`).
- Surface treatment (mobile sheet uses `lf-dark` + `lf-on-photo-bord`; desktop popover uses `lf-paper` family but with same border + radius style).
- Accent colour (both use `lf-amber` for contract / `lf-green` for action).
- Iconography weight / size.
- Eyebrow label colour matches (`lf-green-deep` or `lf-amber` per design).

- [ ] **Step 4: Record the result in the audit doc**

Append to `docs/audits/2026-05-22-look-mode-divergence.md`:

```markdown
## After (2026-05-22)

Family-resemblance verdict per state:

| State | Pair (mobile/desktop) | Verdict | Notes |
|-------|----------------------|---------|-------|
| Look entry | screenshots/2026-05-22/look-entry-{mobile,desktop}.png | PASS / NEEDS FIX | … |
| LUT browser open | … | … | … |
| LUT selected, Strength=Standard | … | … | … |
| Strength=Strong | … | … | … |
| Reset | … | … | … |
```

For any NEEDS FIX row, file the divergence under "Deferred — feeds successor specs" so the Tone/Compare/Histogram/Export plans inherit it.

- [ ] **Step 5: Commit**

```bash
git add docs/audits/2026-05-22-look-mode-divergence.md \
        docs/audits/screenshots/2026-05-22
git commit --no-gpg-sign -m "docs(audit): family-resemblance verdict for Look-mode pilot"
```

---

## Task 12: Final verification gate

**Files:** none modified — verification only.

- [ ] **Step 1: Run the project's standard verification stack**

```bash
pnpm lint
pnpm test:run
pnpm build
```

Expected: all PASS.

- [ ] **Step 2: Manual smoke test on the touched surface**

Reopen the preview from Task 11 if not still running. Walk through:
- Open Look mode → LUT browser → select a LUT → close browser.
- Toggle Strength: Off → Light → Standard → Strong → Off.
- Reset Look.

Each step should respond. The LUT browser sheet (mobile) should now have Radix-managed focus trap + escape semantics; pressing Esc with the sheet open should dismiss it.

- [ ] **Step 3: Confirm successor work is on the table, not in this PR**

The following remain unchanged (and must be confirmed unchanged in `git diff main`):
- Tone surface: `ToneTool.tsx`, `ToneFocusEditor.tsx`, `ToneStripPanel.tsx`, `tone-fields.ts`.
- Compare surface: `CompareTool.tsx`, `CompareSplitHandle.tsx`, `MobileComparePanel.tsx`.
- Histogram surface: `HistogramTool.tsx`, `FloatingHistogramCard.tsx`.
- Export surface: `ExportTool.tsx`, `MobileExportPanel.tsx`.
- Chrome edges: `WorkspaceHeader.tsx`, `MobileTopbar.tsx`, `MobileMoreSheet.tsx`, `MobileMoreMenu.tsx`.

```bash
git diff --stat main -- \
  src/modules/raw-processor/components/tools/ToneTool.tsx \
  src/modules/raw-processor/components/mobile/ToneFocusEditor.tsx \
  src/modules/raw-processor/components/mobile/ToneStripPanel.tsx \
  src/modules/raw-processor/components/tools/CompareTool.tsx \
  src/modules/raw-processor/components/CompareSplitHandle.tsx \
  src/modules/raw-processor/components/mobile/MobileComparePanel.tsx \
  src/modules/raw-processor/components/tools/HistogramTool.tsx \
  src/modules/raw-processor/components/mobile/FloatingHistogramCard.tsx \
  src/modules/raw-processor/components/tools/ExportTool.tsx \
  src/modules/raw-processor/components/mobile/MobileExportPanel.tsx \
  src/modules/raw-processor/components/WorkspaceHeader.tsx \
  src/modules/raw-processor/components/mobile/MobileTopbar.tsx \
  src/modules/raw-processor/components/mobile/MobileMoreSheet.tsx \
  src/modules/raw-processor/components/mobile/MobileMoreMenu.tsx
```

Expected: empty output (no diff). If any of these files appear, the pilot has leaked scope — revert those changes before continuing.

The pilot lands when this gate is clean.
