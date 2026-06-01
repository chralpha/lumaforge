# RAW Lab Tool-Section Eyebrow Hierarchy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render an uppercase deep-green eyebrow kicker above every RAW-lab tool-section title, matching the design-system mockup, and apply two implied CSS cleanups.

**Architecture:** `ToolSection` is the single shared component for every tool panel (used on desktop and inside the mobile bottom sheet). Fixing its markup + the `.raw-tool-eyebrow` CSS rule + wiring the 3 missing eyebrow props propagates everywhere with no mobile-specific changes.

**Tech Stack:** React, TypeScript, plain CSS (`raw-lab.css`), flat-JSON i18n (`src/locales/*.json`), Vitest + `@testing-library/react`.

Spec: `docs/specs/2026-05-15-raw-lab-eyebrow-hierarchy-design.md`

---

### Task 1: ToolSection renders eyebrow first with eyebrow class

**Files:**
- Modify: `src/modules/raw-processor/components/tools/ToolSection.tsx`
- Test: `src/modules/raw-processor/components/tools/ToolSection.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

Create `src/modules/raw-processor/components/tools/ToolSection.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ToolSection } from './ToolSection'

describe('ToolSection', () => {
  it('renders the eyebrow before the title with the eyebrow class', () => {
    render(
      <ToolSection title="Tone" eyebrow="Basic">
        <p>body</p>
      </ToolSection>,
    )

    const eyebrow = screen.getByText('Basic')
    const title = screen.getByRole('heading', { name: 'Tone' })

    expect(eyebrow).toHaveClass('raw-tool-eyebrow')
    // eyebrow appears before the title in DOM order
    expect(
      eyebrow.compareDocumentPosition(title) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('omits the eyebrow when not provided', () => {
    render(
      <ToolSection title="Histogram">
        <p>body</p>
      </ToolSection>,
    )
    expect(document.querySelector('.raw-tool-eyebrow')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/modules/raw-processor/components/tools/ToolSection.test.tsx`
Expected: FAIL — eyebrow has no `raw-tool-eyebrow` class and renders after the title.

- [ ] **Step 3: Update ToolSection.tsx**

Replace the component body so the heading stacks eyebrow then title:

```tsx
import type { ReactNode } from 'react'

import { clsxm } from '~/lib/cn'

export function ToolSection({
  title,
  eyebrow,
  children,
  className,
}: {
  title: string
  eyebrow?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section
      aria-label={title}
      className={clsxm('raw-tool-section', className)}
    >
      <div className="raw-tool-section-heading">
        <div className="raw-tool-section-heading-text">
          {eyebrow && <p className="raw-tool-eyebrow">{eyebrow}</p>}
          <h2>{title}</h2>
        </div>
      </div>
      {children}
    </section>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/modules/raw-processor/components/tools/ToolSection.test.tsx`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git -C /workspaces/LumaForge/LumaForge add src/modules/raw-processor/components/tools/ToolSection.tsx src/modules/raw-processor/components/tools/ToolSection.test.tsx
git -C /workspaces/LumaForge/LumaForge commit -m "feat(raw): render tool-section eyebrow above title"
```

---

### Task 2: Add eyebrow + heading CSS and cleanups in raw-lab.css

**Files:**
- Modify: `src/modules/raw-processor/raw-lab.css`

- [ ] **Step 1: Restructure the heading rule and add the eyebrow rule**

Find this block (around lines 275–297):

```css
.raw-tool-section-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.raw-tool-section-heading h2 {
  margin: 0;
  color: var(--raw-ink);
  font-size: 0.78rem;
  font-weight: 760;
  letter-spacing: 0;
}

.raw-tool-section-heading p,
.raw-tool-note {
  margin: 0;
  color: var(--raw-ink-soft);
  font-size: 0.72rem;
  line-height: 1.45;
}
```

Replace it with:

```css
.raw-tool-section-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.raw-tool-section-heading-text {
  min-width: 0;
}

.raw-tool-eyebrow {
  margin: 0 0 2px;
  color: var(--raw-green-deep);
  font-size: 0.66rem;
  font-weight: 780;
  letter-spacing: 0;
  text-transform: uppercase;
}

.raw-tool-section-heading h2 {
  margin: 0;
  color: var(--raw-ink);
  font-size: 0.86rem;
  font-weight: 760;
  letter-spacing: 0;
}

.raw-tool-note {
  margin: 0;
  color: var(--raw-ink-soft);
  font-size: 0.72rem;
  line-height: 1.45;
}
```

Note: the old `.raw-tool-section-heading p` selector is intentionally dropped — the eyebrow now has its own `.raw-tool-eyebrow` rule and is the only `<p>` in the heading.

- [ ] **Step 2: Add Tone output font-size**

Find this block (around lines 382–385):

```css
.raw-tone-control output {
  color: var(--raw-ink-soft);
  font-variant-numeric: tabular-nums;
}
```

Replace with:

```css
.raw-tone-control output {
  color: var(--raw-ink-soft);
  font-size: 0.76rem;
  font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 3: Remove the conflicting duplicate strength-control button block**

Delete this entire block (around lines 349–363) — it is the early, conflicting definition that gives individual buttons a border and `border-radius: 8px`, fighting the real segmented-control rule defined later (around lines 486–503, which stays):

```css
.raw-strength-control button {
  min-width: 0;
  border: 1px solid oklch(0.74 0.035 78 / 0.72);
  border-radius: 8px;
  background: oklch(0.964 0.018 86);
  color: var(--raw-ink-soft);
  font-size: 0.76rem;
  font-weight: 690;
}

.raw-strength-control button[aria-pressed='true'] {
  border-color: oklch(0.54 0.14 153);
  background: oklch(0.84 0.09 145);
  color: var(--raw-ink);
}
```

Then, in the surviving segmented-control block later in the file, confirm the
button rule still carries the visual properties. Find (around lines 495–499):

```css
.raw-strength-control button {
  min-height: 34px;
  border-width: 0 1px 0 0;
  border-radius: 0;
}
```

Replace with:

```css
.raw-strength-control button {
  min-height: 34px;
  min-width: 0;
  border: 0;
  border-right: 1px solid oklch(0.74 0.035 78 / 0.72);
  border-radius: 0;
  background: oklch(0.964 0.018 86);
  color: var(--raw-ink-soft);
  font-size: 0.76rem;
  font-weight: 690;
}

.raw-strength-control button[aria-pressed='true'] {
  border-color: oklch(0.54 0.14 153);
  background: oklch(0.84 0.09 145);
  color: var(--raw-ink);
}
```

(This preserves the `aria-pressed` selected state that was removed with the deleted block, now placed alongside the segmented-control definition. The existing `.raw-strength-control button:last-child { border-right: 0 }` rule directly below stays unchanged.)

- [ ] **Step 4: Verify lint and build pass**

Run: `pnpm -C /workspaces/LumaForge/LumaForge lint && pnpm -C /workspaces/LumaForge/LumaForge build`
Expected: both succeed with no errors.

- [ ] **Step 5: Commit**

```bash
git -C /workspaces/LumaForge/LumaForge add src/modules/raw-processor/raw-lab.css
git -C /workspaces/LumaForge/LumaForge commit -m "style(raw): add tool-section eyebrow rule, dedupe strength control"
```

---

### Task 3: Add missing eyebrow i18n keys

**Files:**
- Modify: `src/locales/en.json`
- Modify: `src/locales/zh-CN.json`

- [ ] **Step 1: Add English keys**

In `src/locales/en.json`, add each eyebrow key directly after its matching title line.

After `  "raw.histogram.title": "Histogram",` add:

```json
  "raw.histogram.eyebrow": "HQ preview",
```

After `  "raw.strength.title": "Strength",` add:

```json
  "raw.strength.eyebrow": "Look",
```

After `  "raw.fileFacts.title": "File facts",` add:

```json
  "raw.fileFacts.eyebrow": "Source",
```

- [ ] **Step 2: Add Simplified Chinese keys**

In `src/locales/zh-CN.json`, add each eyebrow key directly after its matching title line.

After `  "raw.histogram.title": "直方图",` add:

```json
  "raw.histogram.eyebrow": "高质量预览",
```

After `  "raw.strength.title": "强度",` add:

```json
  "raw.strength.eyebrow": "风格",
```

After `  "raw.fileFacts.title": "文件信息",` add:

```json
  "raw.fileFacts.eyebrow": "来源",
```

- [ ] **Step 3: Verify JSON is valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('/workspaces/LumaForge/LumaForge/src/locales/en.json','utf8'));JSON.parse(require('fs').readFileSync('/workspaces/LumaForge/LumaForge/src/locales/zh-CN.json','utf8'));console.log('ok')"`
Expected: prints `ok`.

- [ ] **Step 4: Commit**

```bash
git -C /workspaces/LumaForge/LumaForge add src/locales/en.json src/locales/zh-CN.json
git -C /workspaces/LumaForge/LumaForge commit -m "i18n(raw): add histogram/strength/fileFacts eyebrow strings"
```

---

### Task 4: Wire the 3 missing eyebrow props at call sites

**Files:**
- Modify: `src/modules/raw-processor/components/tools/HistogramTool.tsx:226`
- Modify: `src/modules/raw-processor/components/tools/FileFactsTool.tsx:61`
- Modify: `src/modules/raw-processor/components/RawToolSurface.tsx:163`

- [ ] **Step 1: HistogramTool**

In `src/modules/raw-processor/components/tools/HistogramTool.tsx`, change:

```tsx
    <ToolSection title={t('raw.histogram.title')}>
```

to:

```tsx
    <ToolSection
      title={t('raw.histogram.title')}
      eyebrow={t('raw.histogram.eyebrow')}
    >
```

- [ ] **Step 2: FileFactsTool**

In `src/modules/raw-processor/components/tools/FileFactsTool.tsx`, change:

```tsx
    <ToolSection title={t('raw.fileFacts.title')}>
```

to:

```tsx
    <ToolSection
      title={t('raw.fileFacts.title')}
      eyebrow={t('raw.fileFacts.eyebrow')}
    >
```

- [ ] **Step 3: Strength (inline in RawToolSurface)**

In `src/modules/raw-processor/components/RawToolSurface.tsx`, change:

```tsx
      <ToolSection title={t('raw.strength.title')}>
```

to:

```tsx
      <ToolSection
        title={t('raw.strength.title')}
        eyebrow={t('raw.strength.eyebrow')}
      >
```

- [ ] **Step 4: Run the full unit suite + lint**

Run: `pnpm -C /workspaces/LumaForge/LumaForge lint && pnpm -C /workspaces/LumaForge/LumaForge test:run`
Expected: lint clean, all tests pass (including Task 1's `ToolSection.test.tsx`).

- [ ] **Step 5: Commit**

```bash
git -C /workspaces/LumaForge/LumaForge add src/modules/raw-processor/components/tools/HistogramTool.tsx src/modules/raw-processor/components/tools/FileFactsTool.tsx src/modules/raw-processor/components/RawToolSurface.tsx
git -C /workspaces/LumaForge/LumaForge commit -m "feat(raw): wire histogram/strength/fileFacts eyebrows"
```

---

### Task 5: Build and browser verification

**Files:** none (verification only)

- [ ] **Step 1: Production build**

Run: `pnpm -C /workspaces/LumaForge/LumaForge build`
Expected: build succeeds.

- [ ] **Step 2: Browser check at desktop width**

Start the dev server (`pnpm -C /workspaces/LumaForge/LumaForge dev`), open `/raw`, load any RAW (or use the empty state). Confirm every tool section (LUT contract, Tone, Histogram, Strength, Compare, Export, File facts) shows an uppercase deep-green eyebrow (e.g. `COLOR`, `BASIC`, `HQ PREVIEW`, `LOOK`, `SPLIT`, `FULL-RES JPEG`, `SOURCE`) directly above a `0.86rem` title. Confirm the Strength segmented control still renders as one joined 4-segment bar (no per-button rounded borders).

- [ ] **Step 3: Browser check at <640px**

Resize to <640px (or device emulation). Open the Style tab → bottom sheet; confirm the same eyebrows appear above titles inside the sheet. Open the Export tab; confirm the Export eyebrow renders.

- [ ] **Step 4: Final commit (only if any fix was needed in steps 2–3)**

```bash
git -C /workspaces/LumaForge/LumaForge add -A
git -C /workspaces/LumaForge/LumaForge commit -m "fix(raw): eyebrow hierarchy browser-validation adjustments"
```

If no adjustments were needed, skip this step.

---

## Self-Review

**Spec coverage:**
- ToolSection markup (eyebrow first, eyebrow class) → Task 1 ✓
- `.raw-tool-eyebrow` rule + `h2` 0.86rem + Tone `output` 0.76rem + strength dedupe → Task 2 ✓
- 3 missing i18n keys (en + zh-CN) → Task 3 ✓
- Wire Histogram / FileFacts / Strength eyebrows → Task 4 ✓
- Tokens unchanged (no task) → matches spec "out of scope" ✓
- Compare labels untouched → matches spec "out of scope" ✓
- Verification (`lint`, `test:run`, `build`, browser desktop + <640px) → Tasks 2/4/5 ✓

**Placeholder scan:** none — every step has exact paths, code, and commands.

**Type consistency:** `ToolSection` prop names (`title`, `eyebrow`, `children`, `className`) unchanged from the existing signature; the 4 already-wired call sites (Tone/Export/Compare/LUT) need no edit and stay compatible. New i18n keys (`raw.histogram.eyebrow`, `raw.strength.eyebrow`, `raw.fileFacts.eyebrow`) are defined in Task 3 and consumed in Task 4 — names match.
