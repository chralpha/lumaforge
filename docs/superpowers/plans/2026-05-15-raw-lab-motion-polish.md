# RAW Lab Motion Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the RAW lab's transitions from plain CSS to `motion/react` spring physics, adding staggered entrance reveals, a backdrop scrim, drag gesture migration, and tactile press feedback.

**Architecture:** A new `motion.ts` file defines shared variants and a `useToolMotion()` hook that respects `prefers-reduced-motion`. `ToolSection` becomes `m.section` with item variants (inheriting animation triggers from parent stagger containers via motion's variant propagation). `RawToolSurface` is the core rewrite: the hand-rolled pointer drag is replaced by motion's `drag`/`useDragControls`, the sheet and backdrop use `AnimatePresence` for mount/unmount springs, and the desktop stack + mobile content use stagger containers. Key buttons get `whileTap` spring feedback.

**Tech Stack:** React, TypeScript, `motion/react` v12 (with `m` inside the existing `LazyMotion` in `root-providers.tsx`), `Spring` presets from `src/lib/spring.ts`, plain CSS (`raw-lab.css`), Vitest + `@testing-library/react`.

Spec: `docs/superpowers/specs/2026-05-15-raw-lab-motion-polish-design.md`

---

### Task 1: Shared motion hook and variants

**Files:**
- Create: `src/modules/raw-processor/motion.ts`

- [ ] **Step 1: Create motion.ts**

Create `src/modules/raw-processor/motion.ts`:

```ts
import { useReducedMotion } from 'motion/react'
import type { Variants } from 'motion/react'
import { useMemo } from 'react'

import { Spring } from '~/lib/spring'

export const SHEET_SPRING = Spring.presets.snappy
export const BACKDROP_SPRING = Spring.smooth(0.3)
export const TAP_SPRING = Spring.snappy(0.25)

export function useToolMotion() {
  const prefersReduced = useReducedMotion() ?? false

  const variants = useMemo(
    () => ({
      container: {
        hidden: {},
        visible: {
          transition: { staggerChildren: prefersReduced ? 0 : 0.045 },
        },
      } satisfies Variants,
      item: {
        hidden: { opacity: 0, ...(prefersReduced ? {} : { y: 12 }) },
        visible: {
          opacity: 1,
          y: 0,
          transition: Spring.presets.snappy,
        },
      } satisfies Variants,
    }),
    [prefersReduced],
  )

  return { prefersReduced, ...variants }
}
```

- [ ] **Step 2: Verify build passes**

Run: `pnpm -C /workspaces/LumaForge/LumaForge build`
Expected: succeeds (type-checking validates the imports and `satisfies Variants`).

- [ ] **Step 3: Commit**

```bash
git add src/modules/raw-processor/motion.ts
git commit -m "feat(raw): add shared motion variants and useToolMotion hook"
```

---

### Task 2: ToolSection → m.section with item variants

**Files:**
- Modify: `src/modules/raw-processor/components/tools/ToolSection.tsx`
- Modify: `src/modules/raw-processor/components/tools/ToolSection.test.tsx`

- [ ] **Step 1: Update ToolSection.tsx**

Replace the entire file content:

```tsx
import type { ReactNode } from 'react'

import { m } from 'motion/react'

import { clsxm } from '~/lib/cn'
import { useToolMotion } from '../../motion'

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
  const { item } = useToolMotion()

  return (
    <m.section
      aria-label={title}
      className={clsxm('raw-tool-section', className)}
      variants={item}
    >
      <div className="raw-tool-section-heading">
        <div className="raw-tool-section-heading-text">
          {eyebrow && <p className="raw-tool-eyebrow">{eyebrow}</p>}
          <h2>{title}</h2>
        </div>
      </div>
      {children}
    </m.section>
  )
}
```

- [ ] **Step 2: Run existing ToolSection test**

Run: `pnpm exec vitest run src/modules/raw-processor/components/tools/ToolSection.test.tsx`
Expected: PASS — `m.section` renders as `<section>` in the DOM, so existing assertions on `aria-label`, heading role, and `raw-tool-eyebrow` class still hold. The `useToolMotion()` hook calls `useReducedMotion()` which reads `matchMedia` (returns `false` in jsdom).

If the test fails because `m.section` needs `LazyMotion`, add a wrapper. Create a helper at the top of the test:

```tsx
import { LazyMotion } from 'motion/react'
const features = () => Promise.resolve({})
const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <LazyMotion features={features}>{children}</LazyMotion>
)
```

Then pass `{ wrapper: Wrapper }` as the second arg to `render()`.

- [ ] **Step 3: Commit**

```bash
git add src/modules/raw-processor/components/tools/ToolSection.tsx src/modules/raw-processor/components/tools/ToolSection.test.tsx
git commit -m "feat(raw): convert ToolSection to m.section with motion variants"
```

---

### Task 3: CSS cleanup — remove sheet transition, add backdrop rule

**Files:**
- Modify: `src/modules/raw-processor/raw-lab.css`

- [ ] **Step 1: Remove CSS transition + visibility from .raw-mobile-tool-sheet**

In `src/modules/raw-processor/raw-lab.css`, find this block inside the `@media (max-width: 639px)` query (around line 873):

```css
  .raw-mobile-tool-sheet {
    z-index: 0;
    display: grid;
    max-height: min(56svh, 430px);
    min-height: 0;
    grid-template-rows: auto minmax(0, 1fr);
    overflow: hidden;
    border-top: 1px solid var(--raw-hairline);
    border-radius: 12px 12px 0 0;
    background:
      linear-gradient(180deg, oklch(0.954 0.022 86), oklch(0.91 0.03 84)),
      var(--raw-paper-low);
    box-shadow: 0 -24px 54px oklch(0.18 0.018 76 / 0.22);
    transform: translateY(100%);
    visibility: hidden;
    transition:
      transform 280ms cubic-bezier(0.22, 1, 0.36, 1),
      visibility 280ms cubic-bezier(0.22, 1, 0.36, 1);
  }
```

Replace with (removing `transform`, `visibility`, and `transition` — motion owns these now):

```css
  .raw-mobile-tool-sheet {
    z-index: 0;
    display: grid;
    max-height: min(56svh, 430px);
    min-height: 0;
    grid-template-rows: auto minmax(0, 1fr);
    overflow: hidden;
    border-top: 1px solid var(--raw-hairline);
    border-radius: 12px 12px 0 0;
    background:
      linear-gradient(180deg, oklch(0.954 0.022 86), oklch(0.91 0.03 84)),
      var(--raw-paper-low);
    box-shadow: 0 -24px 54px oklch(0.18 0.018 76 / 0.22);
    pointer-events: auto;
  }
```

- [ ] **Step 2: Remove [data-raw-tool-sheet='open'] rule**

Delete this block entirely (around line 893):

```css
  [data-raw-tool-sheet='open'] .raw-mobile-tool-sheet {
    transform: translateY(0);
    visibility: visible;
    pointer-events: auto;
  }
```

- [ ] **Step 3: Add .raw-mobile-tool-backdrop rule**

Insert this rule immediately before the `.raw-mobile-tool-sheet` rule (inside the same `@media (max-width: 639px)` block):

```css
  .raw-mobile-tool-backdrop {
    position: fixed;
    inset: 0;
    background: oklch(0.18 0.018 76 / 0.40);
    -webkit-tap-highlight-color: transparent;
  }
```

- [ ] **Step 4: Verify lint passes**

Run: `pnpm -C /workspaces/LumaForge/LumaForge lint`
Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add src/modules/raw-processor/raw-lab.css
git commit -m "style(raw): remove sheet CSS transitions, add backdrop rule"
```

---

### Task 4: RawToolSurface — spring sheet + drag + backdrop

**Files:**
- Modify: `src/modules/raw-processor/components/RawToolSurface.tsx`

This is the core rewrite. The hand-rolled pointer drag system is replaced by motion primitives.

- [ ] **Step 1: Update imports**

Replace the imports at the top of `RawToolSurface.tsx`:

```tsx
import type {
  LUTColorProfile,
  LUTProfileResolution,
  PreviewHistogramState,
} from '@lumaforge/luma-color-runtime'
import { Download, SlidersHorizontal, X } from 'lucide-react'
import { AnimatePresence, m, useDragControls } from 'motion/react'
import type { ComponentProps } from 'react'
import { useCallback, useId, useRef, useState } from 'react'

import { useI18n } from '~/lib/i18n'

import type { UseOnlineLutSourcesResult } from '../hooks/useOnlineLutSources'
import type {
  ExportResult,
  ExportShareCapability,
} from '../model/export-result'
import type {
  ExportRecoveryState,
  LUTProfileSelectionState,
} from '../model/session'
import { BACKDROP_SPRING, SHEET_SPRING, useToolMotion } from '../motion'
import { CompareTool } from './tools/CompareTool'
import { ExportTool } from './tools/ExportTool'
import { FileFactsTool } from './tools/FileFactsTool'
import { HistogramTool } from './tools/HistogramTool'
import { LutContractTool } from './tools/lut/LutContractTool'
import type { StrengthLevel } from './tools/StrengthControl'
import { StrengthControl } from './tools/StrengthControl'
import type { ToneValue } from './tools/ToneTool'
import { ToneTool } from './tools/ToneTool'
import { ToolSection } from './tools/ToolSection'
```

- [ ] **Step 2: Replace drag state/handlers with motion primitives**

Inside the `RawToolSurface` function body, remove these lines:

```tsx
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [sheetDragY, setSheetDragY] = useState(0)
  const sheetDragStartRef = useRef<number | null>(null)
  const sheetRef = useRef<HTMLDivElement | null>(null)
```

And remove the entire blocks for `handleSheetPointerDown`, `handleSheetPointerMove`, `handleSheetPointerUp`, `handleSheetPointerCancel`, and the `sheetDragYRef` ref + assignment (lines 106–140 in the original file).

Replace all of those with:

```tsx
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sheetRef = useRef<HTMLDivElement | null>(null)
  const dragControls = useDragControls()
  const { prefersReduced, container, item } = useToolMotion()
```

Keep `handleMobilePanelToggle`, `clearLongPress`, and `handleExportLongPressStart` unchanged.

- [ ] **Step 3: Rewrite the return JSX — sheet + backdrop + drag**

Replace the entire return statement starting at `return (` with:

```tsx
  return (
    <aside
      className="raw-tool-surface"
      data-raw-tool-surface="raw-finishing"
      data-raw-tool-sheet={mobilePanel ? 'open' : 'closed'}
      data-raw-mobile-panel={mobilePanel ?? 'closed'}
      aria-label={t('raw.tools.aria')}
    >
      <div className="raw-tool-stack raw-tool-stack-desktop">
        {renderStyleTools({ includeFileFacts: false })}
        {renderCompareTools()}
        {renderExportTools()}
        <FileFactsTool
          supportLevel={props.supportLevel}
          metadata={props.metadata}
          stats={props.stats}
        />
      </div>

      <AnimatePresence>
        {mobilePanel && (
          <m.div
            key="backdrop"
            className="raw-mobile-tool-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={BACKDROP_SPRING}
            onClick={() => setMobilePanel(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {mobilePanel && (
          <m.div
            key="sheet"
            id={mobileToolSheetId}
            ref={sheetRef}
            className="raw-mobile-tool-sheet"
            initial={{ y: '100%' }}
            animate={
              prefersReduced ? { opacity: 1 } : { y: '0%' }
            }
            exit={
              prefersReduced ? { opacity: 0 } : { y: '100%' }
            }
            transition={SHEET_SPRING}
            drag={prefersReduced ? false : 'y'}
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={(_, info) => {
              const sheet = sheetRef.current
              const threshold = sheet
                ? Math.max(80, sheet.offsetHeight * 0.28)
                : 80
              if (info.offset.y > threshold || info.velocity.y > 500) {
                setMobilePanel(null)
              }
            }}
          >
            <div
              className="raw-mobile-tool-sheet-top"
              onPointerDown={(e) => dragControls.start(e)}
            >
              <div
                className="raw-mobile-tool-sheet-drag-handle"
                aria-hidden="true"
              />
              <div className="raw-mobile-tool-sheet-header">
                <h2>{mobilePanelTitle}</h2>
                <button
                  type="button"
                  className="raw-mobile-tool-sheet-close"
                  aria-label={t('raw.mobileTools.close')}
                  onClick={() => setMobilePanel(null)}
                >
                  <X aria-hidden="true" />
                </button>
              </div>
            </div>
            <div className="raw-mobile-tool-sheet-scroll">
              {mobilePanel === 'style' &&
                renderStyleTools({ includeFileFacts: false })}
              {mobilePanel === 'export' && renderExportTools()}
            </div>
          </m.div>
        )}
      </AnimatePresence>

      <nav
        className="raw-mobile-tool-rail"
        aria-label={t('raw.mobileTools.aria')}
      >
        <button
          type="button"
          className="raw-mobile-tool-tab"
          data-mobile-tool-tab="style"
          data-active={mobilePanel === 'style'}
          aria-expanded={mobilePanel === 'style'}
          aria-controls={mobileToolSheetId}
          onClick={() => handleMobilePanelToggle('style')}
        >
          <SlidersHorizontal aria-hidden="true" />
          {t('raw.mobileTools.style')}
        </button>
        <button
          type="button"
          className="raw-mobile-tool-tab raw-mobile-tool-tab-export"
          data-mobile-tool-tab="export"
          data-active={mobilePanel === 'export'}
          aria-disabled={!props.canExport || props.isProcessing}
          aria-expanded={mobilePanel === 'export'}
          aria-controls={mobileToolSheetId}
          onClick={() => handleMobilePanelToggle('export')}
          onPointerDown={handleExportLongPressStart}
          onPointerUp={clearLongPress}
          onPointerLeave={clearLongPress}
          onPointerCancel={clearLongPress}
        >
          <Download aria-hidden="true" />
          {t('raw.mobileTools.export')}
        </button>
      </nav>
    </aside>
  )
```

Note: rail buttons stay as plain `<button>` in this task — `whileTap` is added in Task 6.

- [ ] **Step 4: Run tests to check for breakage**

Run: `pnpm exec vitest run src/modules/raw-processor/components/RawToolSurface.test.tsx`

Some tests may fail because:
- The sheet `m.div` is now conditionally rendered via `AnimatePresence` (not always in the DOM).
- Tests that query `.raw-mobile-tool-sheet` before opening a panel will get `null`.
- The test `opens mobile tools from the bottom action rail` checks `data-raw-tool-sheet='closed'` on the aside — this should still pass since the aside keeps the attribute.
- The test `opens the Export sheet on tap` queries `.raw-mobile-tool-sheet` after opening — should still pass.

Note any failures for Task 7.

- [ ] **Step 5: Commit**

```bash
git add src/modules/raw-processor/components/RawToolSurface.tsx
git commit -m "feat(raw): spring sheet + motion drag + backdrop scrim"
```

---

### Task 5: RawToolSurface — stagger containers + content swap

**Files:**
- Modify: `src/modules/raw-processor/components/RawToolSurface.tsx`

- [ ] **Step 1: Convert desktop stack to stagger container**

Find:

```tsx
      <div className="raw-tool-stack raw-tool-stack-desktop">
        {renderStyleTools({ includeFileFacts: false })}
        {renderCompareTools()}
        {renderExportTools()}
        <FileFactsTool
          supportLevel={props.supportLevel}
          metadata={props.metadata}
          stats={props.stats}
        />
      </div>
```

Replace with:

```tsx
      <m.div
        className="raw-tool-stack raw-tool-stack-desktop"
        variants={container}
        initial="hidden"
        animate="visible"
      >
        {renderStyleTools({ includeFileFacts: false })}
        {renderCompareTools()}
        {renderExportTools()}
        <FileFactsTool
          supportLevel={props.supportLevel}
          metadata={props.metadata}
          stats={props.stats}
        />
      </m.div>
```

- [ ] **Step 2: Add AnimatePresence for mobile content swap**

Inside the sheet `m.div`, replace the content scroll area:

```tsx
            <div className="raw-mobile-tool-sheet-scroll">
              {mobilePanel === 'style' &&
                renderStyleTools({ includeFileFacts: false })}
              {mobilePanel === 'export' && renderExportTools()}
            </div>
```

With:

```tsx
            <div className="raw-mobile-tool-sheet-scroll">
              <AnimatePresence mode="wait">
                {mobilePanel === 'style' && (
                  <m.div
                    key="style"
                    variants={container}
                    initial="hidden"
                    animate="visible"
                    exit={{ opacity: 0, transition: { duration: 0.1 } }}
                  >
                    {renderStyleTools({ includeFileFacts: false })}
                  </m.div>
                )}
                {mobilePanel === 'export' && (
                  <m.div
                    key="export"
                    variants={container}
                    initial="hidden"
                    animate="visible"
                    exit={{ opacity: 0, transition: { duration: 0.1 } }}
                  >
                    {renderExportTools()}
                  </m.div>
                )}
              </AnimatePresence>
            </div>
```

- [ ] **Step 3: Run tests**

Run: `pnpm exec vitest run src/modules/raw-processor/components/RawToolSurface.test.tsx`
Note any failures for Task 7.

- [ ] **Step 4: Commit**

```bash
git add src/modules/raw-processor/components/RawToolSurface.tsx
git commit -m "feat(raw): stagger desktop stack + mobile content swap animation"
```

---

### Task 6: Button whileTap across all targets

**Files:**
- Modify: `src/modules/raw-processor/components/RawToolSurface.tsx`
- Modify: `src/modules/raw-processor/components/tools/StrengthControl.tsx`
- Modify: `src/modules/raw-processor/components/tools/ExportTool.tsx`

- [ ] **Step 1: Rail tabs + close button in RawToolSurface**

In `RawToolSurface.tsx`, import `TAP_SPRING` at the top (add to the existing import from `../motion`):

```tsx
import { BACKDROP_SPRING, SHEET_SPRING, TAP_SPRING, useToolMotion } from '../motion'
```

Then replace the Style rail tab `<button>`:

```tsx
        <m.button
          type="button"
          className="raw-mobile-tool-tab"
          data-mobile-tool-tab="style"
          data-active={mobilePanel === 'style'}
          aria-expanded={mobilePanel === 'style'}
          aria-controls={mobileToolSheetId}
          onClick={() => handleMobilePanelToggle('style')}
          whileTap={{ scale: 0.96 }}
          transition={TAP_SPRING}
        >
          <SlidersHorizontal aria-hidden="true" />
          {t('raw.mobileTools.style')}
        </m.button>
```

Replace the Export rail tab `<button>`:

```tsx
        <m.button
          type="button"
          className="raw-mobile-tool-tab raw-mobile-tool-tab-export"
          data-mobile-tool-tab="export"
          data-active={mobilePanel === 'export'}
          aria-disabled={!props.canExport || props.isProcessing}
          aria-expanded={mobilePanel === 'export'}
          aria-controls={mobileToolSheetId}
          onClick={() => handleMobilePanelToggle('export')}
          onPointerDown={handleExportLongPressStart}
          onPointerUp={clearLongPress}
          onPointerLeave={clearLongPress}
          onPointerCancel={clearLongPress}
          whileTap={{ scale: 0.96 }}
          transition={TAP_SPRING}
        >
          <Download aria-hidden="true" />
          {t('raw.mobileTools.export')}
        </m.button>
```

Replace the close button inside the sheet header:

```tsx
                <m.button
                  type="button"
                  className="raw-mobile-tool-sheet-close"
                  aria-label={t('raw.mobileTools.close')}
                  onClick={() => setMobilePanel(null)}
                  whileTap={{ scale: 0.92 }}
                  transition={TAP_SPRING}
                >
                  <X aria-hidden="true" />
                </m.button>
```

- [ ] **Step 2: StrengthControl buttons**

In `src/modules/raw-processor/components/tools/StrengthControl.tsx`, add motion imports:

```tsx
import { m } from 'motion/react'

import { useI18n } from '~/lib/i18n'
import { TAP_SPRING } from '../../motion'
```

Then replace `<button` with `<m.button` in the map:

```tsx
  return (
    <div
      className="raw-strength-control"
      role="group"
      aria-label={t('raw.strength.title')}
    >
      {LEVELS.map((level) => (
        <m.button
          key={level}
          type="button"
          aria-pressed={value === level}
          disabled={disabled}
          onClick={() => onChange(level)}
          whileTap={{ scale: 0.97 }}
          transition={TAP_SPRING}
        >
          {labels[level]}
        </m.button>
      ))}
    </div>
  )
```

- [ ] **Step 3: ExportTool primary button**

In `src/modules/raw-processor/components/tools/ExportTool.tsx`, add motion imports after the existing `import './export-tool.css'`:

```tsx
import './export-tool.css'

import { useAtomValue } from 'jotai'
import { Copy, Download, FolderOpen, Share2 } from 'lucide-react'
import { m } from 'motion/react'

import { localizeCopyLabel, localizeRawReason, useI18n } from '~/lib/i18n'
import { TAP_SPRING } from '../../motion'
```

Then find the primary export button (around line 172):

```tsx
          <button
            type="button"
            className="raw-export-button raw-export-button-primary"
            disabled={!canExport || isProcessing}
            onClick={() => onExport({ quality: 'high', fidelity: 'balanced' })}
          >
            <Download aria-hidden="true" />
            {isProcessing ? t('raw.export.preparing') : t('raw.export.run')}
          </button>
```

Replace with:

```tsx
          <m.button
            type="button"
            className="raw-export-button raw-export-button-primary"
            disabled={!canExport || isProcessing}
            onClick={() => onExport({ quality: 'high', fidelity: 'balanced' })}
            whileTap={{ scale: 0.97 }}
            transition={TAP_SPRING}
          >
            <Download aria-hidden="true" />
            {isProcessing ? t('raw.export.preparing') : t('raw.export.run')}
          </m.button>
```

- [ ] **Step 4: Run lint + tests**

Run: `pnpm -C /workspaces/LumaForge/LumaForge lint && pnpm exec vitest run src/modules/raw-processor/`
Note any failures for Task 7.

- [ ] **Step 5: Commit**

```bash
git add src/modules/raw-processor/components/RawToolSurface.tsx src/modules/raw-processor/components/tools/StrengthControl.tsx src/modules/raw-processor/components/tools/ExportTool.tsx
git commit -m "feat(raw): add whileTap spring feedback to key buttons"
```

---

### Task 7: Update tests for motion migration

**Files:**
- Modify: `src/modules/raw-processor/components/RawToolSurface.test.tsx`

After the motion migration, some `RawToolSurface` tests may fail because the sheet `m.div` is now conditionally rendered (only in the DOM when `mobilePanel !== null`), and `m.*` components may need the `LazyMotion` provider in the test environment.

- [ ] **Step 1: Run the full test suite to identify failures**

Run: `pnpm exec vitest run src/modules/raw-processor/`
Note which tests fail and why.

- [ ] **Step 2: Add LazyMotion wrapper if needed**

If tests fail because `m.*` components need `LazyMotion`, add a wrapper at the top of `RawToolSurface.test.tsx`:

```tsx
import { LazyMotion } from 'motion/react'
```

And add a render wrapper:

```tsx
const loadFeatures = () =>
  import('motion/react').then((mod) => mod.domMax)

function renderWithMotion(ui: React.ReactElement) {
  return render(<LazyMotion features={loadFeatures}>{ui}</LazyMotion>)
}
```

Then replace all `render(<RawToolSurface .../>)` calls with `renderWithMotion(<RawToolSurface .../>)`.

- [ ] **Step 3: Fix any broken assertions**

Common fixes:

1. **Sheet presence before opening:** If a test queries `.raw-mobile-tool-sheet` before the sheet is opened, it will now be `null` (AnimatePresence unmounts it). If any test does this, assert `null` or remove that assertion.

2. **Button role queries:** `m.button` renders as `<button>`, so `getByRole('button')` queries should still work.

3. **data-raw-tool-sheet attribute:** Still on the `<aside>` element, not the sheet itself. Tests checking this on the surface element should pass.

4. **AnimatePresence exit animations in tests:** motion animations don't run in jsdom (no rAF). `AnimatePresence` exit callbacks may not fire. If a test opens then closes the sheet and checks that `.raw-mobile-tool-sheet` is gone, it may still be in the DOM (exit animation pending). Fix by wrapping the check in `waitFor()`:

```tsx
import { waitFor } from '@testing-library/react'

await waitFor(() => {
  expect(container.querySelector('.raw-mobile-tool-sheet')).not.toBeInTheDocument()
})
```

Or flush motion animations by adding to each affected test:

```tsx
import { act } from 'react'

// After the close action:
await act(async () => {})
```

- [ ] **Step 4: Run tests again to verify all pass**

Run: `pnpm exec vitest run src/modules/raw-processor/`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/modules/raw-processor/components/RawToolSurface.test.tsx src/modules/raw-processor/components/tools/ToolSection.test.tsx
git commit -m "test(raw): update tests for motion/react migration"
```

---

### Task 8: Build and browser verification

**Files:** none (verification only)

- [ ] **Step 1: Full lint + test + build**

Run: `pnpm -C /workspaces/LumaForge/LumaForge lint && pnpm -C /workspaces/LumaForge/LumaForge test:run && pnpm -C /workspaces/LumaForge/LumaForge build`
Expected: all pass.

- [ ] **Step 2: Browser check at desktop width (>640px)**

Start the dev server (`pnpm -C /workspaces/LumaForge/LumaForge dev`), open `/raw`. Confirm:
- Tool sections stagger-reveal on initial load (sections slide up + fade in sequentially, ~45ms apart).
- Strength segmented control buttons have spring press scale on click.
- No backdrop scrim appears on desktop (desktop has no sheet).

- [ ] **Step 3: Browser check at <640px (mobile)**

Resize to <640px. Confirm:
- **Sheet open (tap Style):** backdrop fades in (40% dim), sheet springs up with snappy settle (slight overshoot).
- **Sheet close (X button):** sheet springs down, backdrop fades out.
- **Drag dismiss (distance):** pull sheet down past ~28% of its height, release — sheet springs away, backdrop fades.
- **Drag dismiss (velocity flick):** quick downward flick — sheet dismisses even below distance threshold.
- **Drag spring-back:** pull down less than threshold, slow release — sheet springs back to open.
- **Backdrop tap-to-dismiss:** tap the dimmed preview area — sheet closes.
- **Style ↔ Export swap:** tap Export while Style sheet is open — outgoing content fades (quick), incoming content staggers in.
- **Stagger reveal inside sheet:** when sheet opens, tool sections stagger-reveal.
- **whileTap scale:** rail tabs (Style/Export), close button (X), strength buttons, export button all show spring scale-down on press.

- [ ] **Step 4: Reduced motion check**

In DevTools → Rendering, enable "Emulate CSS media feature prefers-reduced-motion: reduce". Confirm:
- No spatial transforms (no slide, no scale, no y offset).
- Sheet appears/disappears with opacity crossfade only.
- Tool sections appear with opacity only (no stagger delay, no y slide).
- No drag gesture (pulling the sheet handle does nothing).
- Backdrop still fades in/out (opacity is non-spatial).

- [ ] **Step 5: Commit (only if fixes were needed)**

```bash
git add -A
git commit -m "fix(raw): motion polish browser-validation adjustments"
```

If no adjustments were needed, skip this step.

---

## Self-Review

**Spec coverage:**
- Mobile bottom sheet spring open/close → Task 4 ✓
- Drag gesture migration (useDragControls, velocity flick) → Task 4 ✓
- Backdrop scrim (AnimatePresence, tap-to-dismiss) → Task 4 ✓
- Tool section staggered reveal (desktop + mobile) → Task 2 (m.section) + Task 5 (stagger containers) ✓
- Mobile content swap (AnimatePresence mode="wait") → Task 5 ✓
- Button whileTap (rail, close, strength, export) → Task 6 ✓
- CSS cleanup (remove transition/visibility, add backdrop rule) → Task 3 ✓
- Reduced motion (useReducedMotion, gate spatial animation) → Task 1 (hook) + Task 4 (sheet/drag) + Task 2 (item variants) ✓
- Spring presets (snappy default, smooth backdrop, fast tap) → Task 1 ✓
- Shared variants pattern → Task 1 ✓
- Out of scope items (compare handle, preview stages, desktop layout) → not touched ✓
- Verification (lint, test, build, browser desktop + mobile + reduced motion) → Task 7 + Task 8 ✓

**Placeholder scan:** None — every step has exact code, paths, and commands.

**Type consistency:**
- `useToolMotion()` returns `{ prefersReduced, container, item }` (Task 1) — consumed in ToolSection as `{ item }` (Task 2) and RawToolSurface as `{ prefersReduced, container, item }` (Task 4) — names match.
- `SHEET_SPRING`, `BACKDROP_SPRING`, `TAP_SPRING` exported from `motion.ts` (Task 1) — imported in RawToolSurface (Tasks 4, 6), StrengthControl (Task 6), ExportTool (Task 6) — names match.
- `m.section` in ToolSection (Task 2), `m.div` in RawToolSurface (Tasks 4, 5), `m.button` in RawToolSurface/StrengthControl/ExportTool (Task 6) — all from `motion/react` — consistent.
- `useDragControls()` (Task 4) → `dragControls.start(e)` on pointer down (Task 4) — method name matches motion API.
- Variant names `"hidden"` / `"visible"` consistent across container (Task 5) and item (Task 2) variants.
