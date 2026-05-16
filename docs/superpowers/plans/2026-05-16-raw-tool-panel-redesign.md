# /raw Tool Panel Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the crowded, hand-written `/raw` tool panel with a calm tool-card progressive-disclosure surface built on the app-wide Radix primitives + Pastel/Tailwind design system, isomorphic across desktop and mobile.

**Architecture:** A controlled Radix-Accordion-based `ToolCard` (open state persisted in a jotai `atomWithStorage`) replaces `ToolSection`. `RawToolSurface` composes a single shared `renderCards()` used by both the desktop stack and the mobile sheet, with a non-collapsible sticky Export block. Form controls migrate to existing `ui/*` primitives; presentation moves to Tailwind utilities + Pastel semantic tokens, with the warm darkroom identity preserved via a small `--color-*` override block scoped to `.raw-lab`. The three bespoke CSS files and all `--raw-*` variables are deleted.

**Tech Stack:** React, TypeScript, Radix UI (`@radix-ui/react-accordion`, `react-slider`, `react-dialog`), `motion/react` (`m`, `Spring` presets), Tailwind v4 + `@pastel-palette/tailwindcss`, jotai (`atomWithStorage`, `~/lib/jotai`), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-05-16-raw-tool-panel-redesign-design.md`

**Verification per phase:** `pnpm lint`, `pnpm test:run`, `pnpm build`, plus manual browser validation of `/raw` (golden path: load → Look/LUT → Tone → compare → export) including a mobile/WebKit viewport.

---

## Key API Facts (read before starting)

- **Accordion** (`~/components/ui/accordion`, exported: `Accordion`, `AccordionItem`, `AccordionTrigger`, `AccordionContent`):
  - `Accordion` spreads props onto `@radix-ui/react-accordion` `Root`. Pass `type="multiple"`, `value={string[]}`, `onValueChange`.
  - `AccordionItem` requires a `value` prop (Radix). It self-tracks open via a `MutationObserver` on `data-state` — no extra wiring needed.
  - `AccordionTrigger` renders inside `AccordionPrimitive.Header`; children are the visible label; a chevron `<i class="i-mingcute-down-line">` is appended and rotates with `Spring.presets.smooth`.
  - `AccordionContent` renders `AccordionPrimitive.Content` (Radix gives it `role="region"` + `aria-labelledby` the trigger). Accessible name of the region == trigger's accessible text. **Therefore any status meta in the trigger MUST be `aria-hidden="true"`** so the region name stays the bare title (existing tests use `getByRole('region', { name: 'Tone' })`).
- **Slider** (`~/components/ui/slider`, exported `Slider`): controlled Radix slider, props `value: number[]`, `onValueChange: (v:number[])=>void`, `min`, `max`, `step`, `disabled`, `variant?: 'primary'|'secondary'`.
- **Segment** (`~/components/ui/segment`, exported `SegmentGroup`, `SegmentItem`): `SegmentGroup` is internally uncontrolled (keeps its own state, `value` only seeds initial). Sync external programmatic changes by passing a `key` that changes only on programmatic reset. `SegmentItem` props: `value`, `label`.
- **Button** (`~/components/ui/button`, exported `Button`, `IconButton`, `MotionButtonBase`): `Button` variants `primary|secondary|light|ghost|destructive`, sizes `sm|md`, supports `disabled`, `isLoading`.
- **Dialog** (`~/components/ui/dialog`): Radix dialog wrapper, `Dialog`, `DialogTrigger`, plus content parts (see file).
- **jotai**: `import { jotaiStore } from '~/lib/jotai'`; `import { atomWithStorage } from 'jotai/utils'`; use `useAtom(atom, { store: jotaiStore })`.
- **Spring**: `import { Spring } from '~/lib/spring'` → `Spring.presets.smooth|snappy|bouncy`, `Spring.snappy(d, b)` etc.
- **cn**: `import { clsxm, cx } from '~/lib/cn'`.
- **i18n**: `const { t } = useI18n()` from `~/lib/i18n`. Title keys: `raw.lutContract.title`="LUT contract", `raw.tone.title`="Tone", `raw.strength.title`="Strength", `raw.histogram.title`="Histogram", `raw.compare.title`="Compare", `raw.export.title`="Export", `raw.fileFacts.title`="File facts".

---

## File Structure

**Create:**
- `src/modules/raw-processor/state/tool-card.atoms.ts` — persisted open-card state + accordion binding hook.
- `src/modules/raw-processor/components/tools/ToolCard.tsx` — Radix-Accordion-based collapsible card + `ToolCardStack` wrapper.
- `src/modules/raw-processor/components/tools/ToolCard.test.tsx` — behavior tests.
- `src/modules/raw-processor/state/tool-card.atoms.test.ts` — atom default/persistence tests.

**Modify:**
- `src/modules/raw-processor/components/RawToolSurface.tsx` — recompose around `renderCards()` + sticky Export; remove `ToolSection`/eyebrow scaffolding usage.
- `src/modules/raw-processor/components/RawToolSurface.test.tsx` — rewrite structural assertions.
- `src/modules/raw-processor/components/tools/{ToneTool,StrengthControl,CompareTool,FileFactsTool,HistogramTool,ExportTool}.tsx` — Tailwind + primitives, drop `ToolSection`.
- `src/modules/raw-processor/components/tools/lut/{LutContractTool,LUTProfileStatus,LUTContractBrowser,OnlineLutSourceControls,LutBrowserDialog,LUTProfileButton,LUTOutputOptionButton,LutIconButton}.tsx` — Tailwind + `ui/dialog`.
- `src/modules/raw-processor/components/Dropzone.tsx` — Tailwind for LUT dropzone classes.
- `src/modules/raw-processor/components/tools/ToolSection.tsx` + `ToolSection.test.tsx` — delete at end of Phase 3 once unused.
- `src/modules/raw-processor/components/index.ts` — export `ToolCard`, drop `ToolSection`.
- `src/modules/raw-processor/RawProcessorView.tsx` — replace `import './raw-lab.css'` with `import './raw-lab.css'` reduced to the scoped theme block (Phase 1) then the final trimmed stylesheet.
- `src/modules/raw-processor/components/tools/ExportTool.test.tsx`, `__tests__/workspace-ui.test.tsx`, `ToolSection.test.tsx` — update selectors.

**Delete (Phase 3):**
- `src/modules/raw-processor/components/tools/export-tool.css`
- `src/modules/raw-processor/components/tools/lut/lut-tool.css`
- `src/modules/raw-processor/components/tools/ToolSection.tsx` (+ test)
- All `--raw-*` declarations and the layout/visual rules in `raw-lab.css`, leaving only the scoped `.raw-lab { --color-* overrides }` + the few irreducible rules (compare handle transform, histogram SVG strokes, mobile sheet drag scaffolding).

---

# Phase 0 — Scaffolding: persisted state + ToolCard

No user-visible change yet. Builds the reusable primitives with tests.

### Task 0.1: Tool-card open-state atom

**Files:**
- Create: `src/modules/raw-processor/state/tool-card.atoms.ts`
- Test: `src/modules/raw-processor/state/tool-card.atoms.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/modules/raw-processor/state/tool-card.atoms.test.ts
import { afterEach, describe, expect, it } from 'vitest'

import { jotaiStore } from '~/lib/jotai'

import {
  DEFAULT_OPEN_TOOL_CARDS,
  TOOL_CARD_IDS,
  toolCardOpenAtom,
} from './tool-card.atoms'

afterEach(() => {
  jotaiStore.set(toolCardOpenAtom, DEFAULT_OPEN_TOOL_CARDS)
  localStorage.clear()
})

describe('toolCardOpenAtom', () => {
  it('defaults to look and tone open', () => {
    expect(jotaiStore.get(toolCardOpenAtom)).toEqual(['look', 'tone'])
  })

  it('exposes the canonical card id set', () => {
    expect(TOOL_CARD_IDS).toEqual([
      'look',
      'tone',
      'histogram',
      'compare',
      'fileFacts',
    ])
  })

  it('persists updates to localStorage under the raw key', () => {
    jotaiStore.set(toolCardOpenAtom, ['look'])
    expect(jotaiStore.get(toolCardOpenAtom)).toEqual(['look'])
    expect(localStorage.getItem('raw-tool-cards-open')).toContain('look')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:run src/modules/raw-processor/state/tool-card.atoms.test.ts`
Expected: FAIL — module `./tool-card.atoms` not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/modules/raw-processor/state/tool-card.atoms.ts
import { atomWithStorage } from 'jotai/utils'

export const TOOL_CARD_IDS = [
  'look',
  'tone',
  'histogram',
  'compare',
  'fileFacts',
] as const

export type ToolCardId = (typeof TOOL_CARD_IDS)[number]

export const DEFAULT_OPEN_TOOL_CARDS: ToolCardId[] = ['look', 'tone']

export const toolCardOpenAtom = atomWithStorage<ToolCardId[]>(
  'raw-tool-cards-open',
  DEFAULT_OPEN_TOOL_CARDS,
  undefined,
  { getOnInit: true },
)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:run src/modules/raw-processor/state/tool-card.atoms.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/modules/raw-processor/state/tool-card.atoms.ts src/modules/raw-processor/state/tool-card.atoms.test.ts
git commit --no-gpg-sign -m "feat(raw): add persisted tool-card open-state atom"
```

> Note: this repo signs commits via SSH and the signing key is not in the agent; `--no-gpg-sign` is used by prior user authorization for this work. If the user has loaded the key, drop the flag.

### Task 0.2: ToolCard + ToolCardStack component

**Files:**
- Create: `src/modules/raw-processor/components/tools/ToolCard.tsx`
- Test: `src/modules/raw-processor/components/tools/ToolCard.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/modules/raw-processor/components/tools/ToolCard.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach } from 'vitest'
import { describe, expect, it } from 'vitest'

import { jotaiStore } from '~/lib/jotai'

import {
  DEFAULT_OPEN_TOOL_CARDS,
  toolCardOpenAtom,
} from '../../state/tool-card.atoms'
import { ToolCard, ToolCardStack } from './ToolCard'

afterEach(() => {
  jotaiStore.set(toolCardOpenAtom, DEFAULT_OPEN_TOOL_CARDS)
})

function setup() {
  return render(
    <ToolCardStack ariaLabel="RAW finishing controls">
      <ToolCard id="tone" title="Tone">
        <p>tone body</p>
      </ToolCard>
      <ToolCard id="histogram" title="Histogram" meta={<span>Clip 3</span>}>
        <p>hist body</p>
      </ToolCard>
    </ToolCardStack>,
  )
}

describe('toolCard', () => {
  it('renders an open card as a region named only by its title', () => {
    setup()
    const tone = screen.getByRole('region', { name: 'Tone' })
    expect(tone).toBeInTheDocument()
    expect(screen.getByText('tone body')).toBeVisible()
  })

  it('keeps a collapsed card body out of the document', () => {
    setup()
    expect(screen.queryByText('hist body')).not.toBeInTheDocument()
  })

  it('toggles open state and aria-expanded on trigger click', async () => {
    const user = userEvent.setup()
    setup()
    const trigger = screen.getByRole('button', { name: 'Histogram' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(await screen.findByText('hist body')).toBeVisible()
  })

  it('persists open state to the shared atom', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByRole('button', { name: 'Histogram' }))
    expect(jotaiStore.get(toolCardOpenAtom)).toEqual(
      expect.arrayContaining(['tone', 'histogram']),
    )
  })

  it('exposes the stack container with the finishing aria label', () => {
    setup()
    expect(
      screen.getByRole('group', { name: 'RAW finishing controls' }),
    ).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:run src/modules/raw-processor/components/tools/ToolCard.test.tsx`
Expected: FAIL — `./ToolCard` not found.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/modules/raw-processor/components/tools/ToolCard.tsx
import type { ReactNode } from 'react'
import { useAtom } from 'jotai'

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '~/components/ui/accordion'
import { clsxm } from '~/lib/cn'
import { jotaiStore } from '~/lib/jotai'

import type { ToolCardId } from '../../state/tool-card.atoms'
import { toolCardOpenAtom } from '../../state/tool-card.atoms'

export function ToolCardStack({
  ariaLabel,
  className,
  children,
}: {
  ariaLabel: string
  className?: string
  children: ReactNode
}) {
  const [open, setOpen] = useAtom(toolCardOpenAtom, { store: jotaiStore })

  return (
    <Accordion
      type="multiple"
      value={open}
      onValueChange={(next) => setOpen(next as ToolCardId[])}
      role="group"
      aria-label={ariaLabel}
      className={clsxm('flex flex-col gap-1', className)}
    >
      {children}
    </Accordion>
  )
}

export function ToolCard({
  id,
  title,
  meta,
  className,
  children,
}: {
  id: ToolCardId
  title: string
  meta?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <AccordionItem
      value={id}
      data-tool-card={id}
      className={clsxm(
        'border-0 border-b-0 data-[state=open]:border-t data-[state=open]:border-border first:data-[state=open]:border-t-0',
        className,
      )}
    >
      <AccordionTrigger className="py-3 text-headline font-medium text-text no-underline hover:no-underline">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate">{title}</span>
          {meta != null && (
            <span aria-hidden="true" className="text-footnote text-text-secondary truncate">
              {meta}
            </span>
          )}
        </span>
      </AccordionTrigger>
      <AccordionContent className="pt-0 pb-3 text-body">
        {children}
      </AccordionContent>
    </AccordionItem>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:run src/modules/raw-processor/components/tools/ToolCard.test.tsx`
Expected: PASS (5 tests). If the region name includes the meta text, confirm `aria-hidden="true"` is on the meta span.

- [ ] **Step 5: Commit**

```bash
git add src/modules/raw-processor/components/tools/ToolCard.tsx src/modules/raw-processor/components/tools/ToolCard.test.tsx
git commit --no-gpg-sign -m "feat(raw): add Radix-accordion ToolCard with persisted open state"
```

### Task 0.3: Export ToolCard from the component barrel

**Files:**
- Modify: `src/modules/raw-processor/components/index.ts`

- [ ] **Step 1: Add the export**

Add next to the existing `ToolSection` export line:

```ts
export { ToolCard, ToolCardStack } from './tools/ToolCard'
```

- [ ] **Step 2: Typecheck**

Run: `pnpm lint`
Expected: PASS (no unused/exports errors).

- [ ] **Step 3: Commit**

```bash
git add src/modules/raw-processor/components/index.ts
git commit --no-gpg-sign -m "chore(raw): export ToolCard from component barrel"
```

---

# Phase 1 — Recompose RawToolSurface + warm theme tokens + sticky Export

User-visible: cards replace flat sections, Export is a persistent bottom block, desktop & mobile share one card set, warm identity expressed via scoped tokens. Tool internals still use their current markup/classes (migrated in Phase 2/3) — this phase only changes composition and the surface shell.

### Task 1.1: Add the scoped warm-theme token block

**Files:**
- Modify: `src/modules/raw-processor/raw-lab.css` (top `.raw-lab { ... }` block only)

- [ ] **Step 1: Add `--color-*` overrides** scoped to `.raw-lab`, immediately after the existing `--raw-*` variables (do not delete `--raw-*` yet — Phase 3 removes them):

```css
.raw-lab {
  /* Warm darkroom identity expressed through Pastel semantic tokens.
     Every migrated element consumes these, not literals. */
  --color-background: oklch(0.964 0.018 86);
  --color-text: oklch(0.18 0.018 76);
  --color-text-secondary: oklch(0.38 0.032 75);
  --color-text-tertiary: oklch(0.5 0.035 75);
  --color-border: oklch(0.74 0.035 78 / 0.62);
  --color-border-secondary: oklch(0.74 0.035 78 / 0.4);
  --color-accent: oklch(0.59 0.15 153);
  --color-fill: oklch(0.918 0.026 86);
  --color-fill-secondary: oklch(0.9 0.034 82 / 0.9);
  --color-fill-tertiary: oklch(0.86 0.03 80 / 0.56);
  --color-material-opaque: oklch(0.948 0.022 86);
  --color-material-medium: oklch(0.942 0.024 86);
}
```

- [ ] **Step 2: Verify build**

Run: `pnpm build`
Expected: PASS. Visually confirm `/raw` still renders warm (no regression yet — only token aliases added).

- [ ] **Step 3: Commit**

```bash
git add src/modules/raw-processor/raw-lab.css
git commit --no-gpg-sign -m "feat(raw): add scoped warm Pastel token overrides for /raw"
```

### Task 1.2: Rewrite RawToolSurface composition around shared cards

**Files:**
- Modify: `src/modules/raw-processor/components/RawToolSurface.tsx`
- Modify: `src/modules/raw-processor/components/RawToolSurface.test.tsx`

This task changes structure only; tool components keep their current internal markup. `renderStyleTools`/`renderExportTools` are replaced by `renderCards()` (returns the accordion cards) plus a separate `renderExportBlock()` (non-collapsible).

- [ ] **Step 1: Rewrite the structural test first**

Replace the first two tests (`groups controls as a RAW finishing surface...` and `renders tone controls before strength`) and the mobile-rail tests with the new structure. New assertions:

```tsx
it('renders the finishing surface with a card stack and a persistent export block', () => {
  const { container } = render(<RawToolSurface {...baseProps} />)
  expect(
    container.querySelector('[data-raw-tool-surface="raw-finishing"]'),
  ).toBeInTheDocument()
  // card stack present
  expect(
    screen.getByRole('group', { name: 'RAW finishing controls' }),
  ).toBeInTheDocument()
  // Look (LUT contract + strength) open by default → region present
  expect(
    screen.getByRole('region', { name: 'LUT contract' }),
  ).toBeInTheDocument()
  expect(screen.getByRole('region', { name: 'Tone' })).toBeInTheDocument()
  // Export is a persistent, non-collapsible region
  const exportRegion = screen.getByRole('region', { name: 'Export' })
  expect(exportRegion).toHaveAttribute('data-raw-export-block', 'persistent')
  // collapsed-by-default reference cards are not expanded
  expect(screen.queryByRole('region', { name: 'Histogram' })).toBeNull()
  expect(screen.queryByRole('region', { name: 'Compare' })).toBeNull()
  expect(screen.queryByRole('region', { name: 'File facts' })).toBeNull()
  // but their triggers exist
  expect(screen.getByRole('button', { name: 'Histogram' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Compare' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'File facts' })).toBeInTheDocument()
})

it('shares one card set between desktop stack and mobile sheet', async () => {
  const user = userEvent.setup()
  const { container } = render(<RawToolSurface {...baseProps} />)
  const surface = container.querySelector('[data-raw-tool-surface]')
  expect(surface).toHaveAttribute('data-raw-tool-sheet', 'closed')
  await user.click(screen.getByRole('button', { name: 'Tools' }))
  expect(surface).toHaveAttribute('data-raw-tool-sheet', 'open')
  const sheet = container.querySelector(
    '[data-raw-mobile-sheet]',
  ) as HTMLElement
  expect(
    within(sheet).getByRole('group', { name: 'RAW finishing controls' }),
  ).toBeInTheDocument()
})
```

Update the histogram-ordering test: histogram is now a collapsed card; assert that opening its trigger reveals the plot:

```tsx
it('reveals the histogram plot when its card is expanded', async () => {
  const user = userEvent.setup()
  render(<RawToolSurface {...baseProps} hasImage histogram={/* ready fixture from existing test */} />)
  await user.click(screen.getByRole('button', { name: 'Histogram' }))
  const histogram = await screen.findByRole('region', { name: 'Histogram' })
  expect(
    within(histogram).getByLabelText('Preview luminance and RGB histogram'),
  ).toBeInTheDocument()
})
```

Keep the tone-change, disabled-before-upload, preserved-tone, long-press-export, and online-LUT tests but update any that depend on tone/strength being immediately visible to first open the relevant card (Tone is open by default; Strength is inside the Look card which is open by default). Replace `getByRole('button', { name: 'Style' })` / `'Export'` rail expectations: the rail now has a single **Tools** entry plus the **Export** action — update `mobileTools` assertions accordingly (see Task 1.4).

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:run src/modules/raw-processor/components/RawToolSurface.test.tsx`
Expected: FAIL — old structure assertions gone, `data-raw-export-block` / `group` not present yet.

- [ ] **Step 3: Implement the recomposition**

In `RawToolSurface.tsx`:
- Remove `ToolSection`-based `renderStyleTools({ includeFileFacts })`. Add:

```tsx
const renderCards = () => (
  <ToolCardStack ariaLabel={t('raw.tools.aria')}>
    <ToolCard id="look" title={t('raw.lutContract.title')}>
      <LutContractTool
        currentLutName={props.currentLutName}
        disabled={props.isProcessing}
        onLutLoad={props.onLutLoad}
        onLutClear={props.onLutClear}
        lutProfileSelection={props.lutProfileSelection}
        lutProfileResolution={props.lutProfileResolution}
        onLutProfileSelect={props.onLutProfileSelect}
        onlineLutSources={props.onlineLutSources}
      />
      <div className="mt-4">
        <StrengthControl
          value={props.activeIntensity}
          onChange={props.onIntensitySelect}
          disabled={disabled}
        />
      </div>
    </ToolCard>
    <ToolCard id="tone" title={t('raw.tone.title')}>
      <ToneTool
        value={props.tone}
        disabled={disabled}
        onChange={props.onToneChange}
        onReset={props.onToneReset}
      />
    </ToolCard>
    <ToolCard
      id="histogram"
      title={t('raw.histogram.title')}
      meta={histogramMeta}
    >
      <HistogramTool histogram={props.histogram} />
    </ToolCard>
    <ToolCard id="compare" title={t('raw.compare.title')}>
      <CompareTool disabled={disabled} onCompareReset={props.onCompareReset} />
    </ToolCard>
    <ToolCard id="fileFacts" title={t('raw.fileFacts.title')}>
      <FileFactsTool
        supportLevel={props.supportLevel}
        metadata={props.metadata}
        stats={props.stats}
      />
    </ToolCard>
  </ToolCardStack>
)

const renderExportBlock = () => (
  <section
    aria-label={t('raw.export.title')}
    data-raw-export-block="persistent"
    className="border-t border-border bg-material-medium px-4 py-3"
  >
    <ExportTool
      canExport={props.canExport}
      disabledReason={props.disabledReason}
      isProcessing={props.isProcessing}
      onExport={props.onExport}
      exportResult={props.exportResult}
      exportShareCapability={props.exportShareCapability}
      recovery={props.recovery}
      onShareExport={props.onShareExport}
      onDownloadExport={props.onDownloadExport}
      onCopyExport={props.onCopyExport}
      onRecoverExportSource={props.onRecoverExportSource}
      embedded
    />
  </section>
)
```

  - `histogramMeta`: derive a short clip summary string from `props.histogram` when `state === 'ready'` (e.g. ``Shadows ${h.clipping.shadowAnyChannel} · Highlights ${h.clipping.highlightAnyChannel}``), else `undefined`.
  - `ExportTool` gets a new optional `embedded?: boolean` prop: when true it renders **without** its own `ToolSection` wrapper (just its inner content). Add the prop in this task as a thin conditional in `ExportTool.tsx` (full Tailwind migration is Phase 2): wrap the current return in `embedded ? <>{innerContent}</> : <ToolSection .../>`. Extract the body into `innerContent`.
- The desktop container becomes a 2-row grid: scrollable card area + sticky export block:

```tsx
<aside
  className="raw-tool-surface grid min-h-0 grid-rows-[minmax(0,1fr)_auto] overflow-hidden border-l border-border bg-material-medium"
  data-raw-tool-surface="raw-finishing"
  data-raw-tool-sheet={mobileOpen ? 'open' : 'closed'}
  aria-label={t('raw.tools.aria')}
>
  <div className="hidden min-h-0 overflow-y-auto px-3.5 py-3.5 lg:block">
    {renderCards()}
  </div>
  <div className="hidden lg:block">{renderExportBlock()}</div>
  {/* mobile rail + sheet: Task 1.4 */}
</aside>
```

  Keep `.raw-tool-surface` class for the scrollbar rule (still in `raw-lab.css` until Phase 3). Replace the `MobileToolPanel = 'style' | 'export'` state with a single boolean `mobileOpen` (sheet shows the full card set) plus the existing long-press quick-export handler retained for the rail Export button.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test:run src/modules/raw-processor/components/RawToolSurface.test.tsx`
Expected: PASS for the rewritten structural tests. Iterate selectors until green.

- [ ] **Step 5: Commit**

```bash
git add src/modules/raw-processor/components/RawToolSurface.tsx src/modules/raw-processor/components/RawToolSurface.test.tsx src/modules/raw-processor/components/tools/ExportTool.tsx
git commit --no-gpg-sign -m "feat(raw): recompose tool surface into shared card stack + sticky export"
```

### Task 1.3: Desktop visual rhythm cleanup (remove per-section dividers)

**Files:**
- Modify: `src/modules/raw-processor/raw-lab.css`

- [ ] **Step 1:** In `raw-lab.css`, change `.raw-tool-section` to drop its `border-bottom` and reduce `padding-block` to `0` (the ToolCard now owns spacing). Keep the rule (other tools still render via `ToolSection` until Phase 2/3). Replace:

```css
.raw-tool-section {
  padding-block: 14px;
  border-bottom: 1px solid oklch(0.74 0.035 78 / 0.62);
}
```

with:

```css
.raw-tool-section {
  padding-block: 0;
  border-bottom: 0;
}
```

- [ ] **Step 2:** Run `pnpm test:run src/modules/raw-processor` and `pnpm build`. Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/modules/raw-processor/raw-lab.css
git commit --no-gpg-sign -m "refactor(raw): drop per-section dividers in favor of card rhythm"
```

### Task 1.4: Mobile rail → single Tools sheet sharing the card set

**Files:**
- Modify: `src/modules/raw-processor/components/RawToolSurface.tsx`
- Modify: `src/modules/raw-processor/components/RawToolSurface.test.tsx`
- Modify: `src/locales/en.json` and `src/locales/zh.json` (or the project's other locale file) — add `raw.mobileTools.tools` = `"Tools"` / Chinese equivalent.

- [ ] **Step 1: Locate the second locale file**

Run: `ls src/locales`
Note both files (e.g. `en.json`, `zh.json`). Add key `raw.mobileTools.tools` ("Tools" / "工具") to each.

- [ ] **Step 2: Write/adjust the failing mobile test**

```tsx
it('opens the unified Tools sheet from the bottom rail', async () => {
  const user = userEvent.setup()
  const { container } = render(<RawToolSurface {...baseProps} />)
  const surface = container.querySelector('[data-raw-tool-surface]')
  const tools = screen.getByRole('button', { name: 'Tools' })
  expect(surface).toHaveAttribute('data-raw-tool-sheet', 'closed')
  await user.click(tools)
  expect(surface).toHaveAttribute('data-raw-tool-sheet', 'open')
  const sheet = container.querySelector('[data-raw-mobile-sheet]') as HTMLElement
  expect(
    within(sheet).getByRole('group', { name: 'RAW finishing controls' }),
  ).toBeInTheDocument()
  await user.click(tools)
  expect(surface).toHaveAttribute('data-raw-tool-sheet', 'closed')
})

it('keeps Export quick-action on the rail with long-press export', async () => {
  const user = userEvent.setup()
  const onExport = vi.fn()
  render(<RawToolSurface {...baseProps} hasImage canExport onExport={onExport} />)
  const exportTab = screen.getByRole('button', { name: 'Export' })
  await user.pointer({ keys: '[MouseLeft>]', target: exportTab })
  await new Promise((r) => setTimeout(r, 600))
  await user.pointer({ keys: '[/MouseLeft]' })
  expect(onExport).toHaveBeenCalledWith({ quality: 'high', fidelity: 'balanced' })
})
```

- [ ] **Step 3: Run to verify fail**

Run: `pnpm test:run src/modules/raw-processor/components/RawToolSurface.test.tsx -t "unified Tools sheet"`
Expected: FAIL — "Tools" button not present.

- [ ] **Step 4: Implement the mobile rail + sheet**

Replace the old two-tab rail + `AnimatePresence` sheet with:
- A `nav.raw-mobile-tool-rail` containing two `m.button`s: **Tools** (`onClick` toggles `mobileOpen`, `aria-controls` the sheet id, `aria-expanded={mobileOpen}`) and **Export** (keeps `handleExportLongPressStart`/`clearLongPress`, `onClick` triggers tap export sheet OR opens sheet+scrolls to export — simplest: `onClick` opens the sheet, long-press quick-exports; preserve existing long-press handler exactly).
- One `AnimatePresence` backdrop + one sheet (`data-raw-mobile-sheet`) whose scroll body renders `{renderCards()}` followed by `{renderExportBlock()}`. Keep the existing drag-to-dismiss `m.div` (`drag="y"`, `dragControls`, `onDragEnd` threshold) and `prefersReduced` gating from the current implementation — only the contents change to the shared `renderCards()`.
- Keep classes `raw-mobile-tool-rail`, `raw-mobile-tool-sheet`, `raw-mobile-tool-backdrop` etc. (still styled by `raw-lab.css` until Phase 3) and add `data-raw-mobile-sheet` to the sheet `m.div`.

- [ ] **Step 5: Run tests to verify pass**

Run: `pnpm test:run src/modules/raw-processor/components/RawToolSurface.test.tsx`
Expected: PASS. Also run `pnpm test:run src/modules/raw-processor/__tests__/workspace-ui.test.tsx` and fix any rail-name selectors there (`Style`→`Tools`).

- [ ] **Step 6: Phase-1 full verification**

Run:
```bash
pnpm lint && pnpm test:run && pnpm build
```
Expected: PASS. Then manually open `/raw` (desktop + a 390px mobile emulation): cards expand/collapse with spring, state persists across reload, Export always reachable, mobile Tools sheet shows the same cards, drag-to-dismiss works, reduced-motion is respected.

- [ ] **Step 7: Commit**

```bash
git add src/modules/raw-processor/components/RawToolSurface.tsx src/modules/raw-processor/components/RawToolSurface.test.tsx src/modules/raw-processor/__tests__/workspace-ui.test.tsx src/locales
git commit --no-gpg-sign -m "feat(raw): unify mobile rail into a single shared Tools sheet"
```

---

# Phase 2 — Migrate primary controls to primitives + Tailwind

Each task: swap bespoke markup/classes for `ui/*` primitives + Pastel tokens, update the coupled test selectors, keep behavior identical.

### Task 2.1: ToneTool → `ui/slider` + Tailwind

**Files:**
- Modify: `src/modules/raw-processor/components/tools/ToneTool.tsx`
- Modify: `src/modules/raw-processor/components/RawToolSurface.test.tsx` (tone tests)

- [ ] **Step 1: Update the tone tests** to drive sliders via the Radix slider role instead of `fireEvent.change` on `<input type=range>`. Radix Slider thumb has `role="slider"` with `aria-label` from an associated label. Replace each `fireEvent.change(getByLabelText('Exposure'), ...)` with keyboard interaction:

```tsx
const exposure = within(screen.getByRole('region', { name: 'Tone' }))
  .getByRole('slider', { name: 'Exposure' })
exposure.focus()
await user.keyboard('{ArrowRight}')
expect(onToneChange).toHaveBeenCalled() // value moved by one step
```

  Keep assertions for: all six labels present, disabled state (`toHaveAttribute('aria-disabled','true')` or the thumb `data-disabled`), `Reset tone` button calls `onToneReset`, "Tone settings preserved" text for non-neutral. Drop the `.raw-tool-reset-button` class assertion (replace with the Button being present by name).

- [ ] **Step 2: Run to verify fail**

Run: `pnpm test:run src/modules/raw-processor/components/RawToolSurface.test.tsx -t "tone"`
Expected: FAIL.

- [ ] **Step 3: Rewrite ToneTool** keeping the `react-hook-form`-free shape (the form was only used for reset bookkeeping; replace with controlled values + an `isNeutral` check). For each field render a labelled row using `Slider`:

```tsx
import { Slider } from '~/components/ui/slider'
import { Button } from '~/components/ui/button'
// ...
const FIELDS: { key: keyof ToneValue; labelKey: string; min: number; max: number; step: number; group: 'basic' | 'fine' }[] = [
  { key: 'userExposureEv', labelKey: 'raw.tone.exposure', min: -5, max: 5, step: 0.01, group: 'basic' },
  { key: 'userContrast', labelKey: 'raw.tone.contrast', min: -100, max: 100, step: 1, group: 'basic' },
  { key: 'userHighlights', labelKey: 'raw.tone.highlights', min: -100, max: 100, step: 1, group: 'fine' },
  { key: 'userShadows', labelKey: 'raw.tone.shadows', min: -100, max: 100, step: 1, group: 'fine' },
  { key: 'userWhites', labelKey: 'raw.tone.whites', min: -100, max: 100, step: 1, group: 'fine' },
  { key: 'userBlacks', labelKey: 'raw.tone.blacks', min: -100, max: 100, step: 1, group: 'fine' },
]
```

  Render two groups separated by `class="mt-4"` (whitespace, not a divider). Each row:

```tsx
<div className="grid gap-2">
  <div className="flex items-center justify-between text-callout">
    <label htmlFor={id} className="font-medium text-text">{t(field.labelKey)}</label>
    <output className="tabular-nums text-text-secondary">{formatted}</output>
  </div>
  <Slider
    aria-label={t(field.labelKey)}
    value={[value[field.key]]}
    min={field.min}
    max={field.max}
    step={field.step}
    disabled={disabled}
    onValueChange={([v]) => onChange({ [field.key]: v })}
  />
</div>
```

  Reset button: `<Button variant="light" size="sm" disabled={disabled} onClick={handleReset}>` with the rotate icon and `t('raw.tone.reset')`. `isNeutral` compares all values to `TONE_DEFAULTS`. Keep `t('raw.tone.note')` and the `t('raw.tone.preserved')` line (Tailwind `text-callout text-text-secondary`). Remove the `ToolSection` wrapper — `ToolCard` provides the card; return a `<div className="grid gap-3">`.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test:run src/modules/raw-processor/components/RawToolSurface.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/raw-processor/components/tools/ToneTool.tsx src/modules/raw-processor/components/RawToolSurface.test.tsx
git commit --no-gpg-sign -m "refactor(raw): rebuild ToneTool on ui/slider + Tailwind tokens"
```

### Task 2.2: StrengthControl → `ui/segment`

**Files:**
- Modify: `src/modules/raw-processor/components/tools/StrengthControl.tsx`
- Modify: `src/modules/raw-processor/components/RawToolSurface.test.tsx` (any strength assertions)

- [ ] **Step 1: Update/confirm tests.** Add/keep a test that the four levels render and clicking one calls `onChange`. Because `SegmentGroup` is internally uncontrolled, pass `key={value}` so a programmatic intensity reset re-seeds it; assert clicking `Strong` calls `onChange('strong')`:

```tsx
it('selects a strength level', async () => {
  const user = userEvent.setup()
  const onChange = vi.fn()
  render(<RawToolSurface {...baseProps} hasImage onIntensitySelect={onChange} />)
  await user.click(screen.getByRole('tab', { name: 'Strong' }))
  expect(onChange).toHaveBeenCalledWith('strong')
})
```

- [ ] **Step 2: Run → fail.** `pnpm test:run src/modules/raw-processor/components/RawToolSurface.test.tsx -t "strength level"`.

- [ ] **Step 3: Rewrite StrengthControl:**

```tsx
import { SegmentGroup, SegmentItem } from '~/components/ui/segment'
import { useI18n } from '~/lib/i18n'

const LEVELS = ['off', 'light', 'standard', 'strong'] as const
export type StrengthLevel = (typeof LEVELS)[number]

export function StrengthControl({ value, onChange, disabled }: {
  value: StrengthLevel
  onChange: (value: StrengthLevel) => void
  disabled: boolean
}) {
  const { t } = useI18n()
  const labels: Record<StrengthLevel, string> = {
    off: t('raw.strength.off'),
    light: t('raw.strength.light'),
    standard: t('raw.strength.standard'),
    strong: t('raw.strength.strong'),
  }
  return (
    <div aria-disabled={disabled} className={disabled ? 'pointer-events-none opacity-50' : ''}>
      <SegmentGroup
        key={value}
        value={value}
        onValueChanged={(v) => onChange(v as StrengthLevel)}
        className="w-full"
      >
        {LEVELS.map((level) => (
          <SegmentItem key={level} value={level} label={labels[level]} className="flex-1" />
        ))}
      </SegmentGroup>
    </div>
  )
}
```

  (`SegmentItem` uses `role="tab"`, so tests query by `role: 'tab'`.) Note in a code comment why `key={value}` is required (SegmentGroup is internally uncontrolled; this re-seeds on external/programmatic change).

- [ ] **Step 4: Run → pass.** `pnpm test:run src/modules/raw-processor/components/RawToolSurface.test.tsx`.

- [ ] **Step 5: Commit**

```bash
git add src/modules/raw-processor/components/tools/StrengthControl.tsx src/modules/raw-processor/components/RawToolSurface.test.tsx
git commit --no-gpg-sign -m "refactor(raw): rebuild StrengthControl on ui/segment"
```

### Task 2.3: ExportTool → `ui/button` + Tailwind, drop ToolSection/CSS

**Files:**
- Modify: `src/modules/raw-processor/components/tools/ExportTool.tsx`
- Modify: `src/modules/raw-processor/components/tools/ExportTool.test.tsx`
- Modify: `src/modules/raw-processor/components/RawToolSurface.test.tsx` (export-button class assertions)

- [ ] **Step 1: Update ExportTool.test.tsx and RawToolSurface export assertions.** Remove `.raw-export-button`/`raw-export-button-primary` class assertions; assert by role/name and `Button` semantics (e.g. primary export button is `getByRole('button', { name: 'Export full-resolution JPEG' })`, disabled state via `toBeDisabled()`). Keep all behavioral assertions (share/download/copy handlers, low-memory note, recovery reselect, ready facts dimensions/size).

- [ ] **Step 2: Run → fail.** `pnpm test:run src/modules/raw-processor/components/tools/ExportTool.test.tsx`.

- [ ] **Step 3: Rewrite ExportTool:**
  - Remove `import './export-tool.css'`.
  - Remove the `ToolSection` wrapper; honor the `embedded` prop added in Task 1.2 by always returning the inner content (the persistent block in `renderExportBlock` provides the section semantics, label and surface). Return a `<div className="grid gap-3">`.
  - Replace every `.raw-export-button*` button with `<Button variant="primary"|"secondary" size="md">` (icons kept as lucide children). Primary export/share = `variant="primary"`; download/copy/reselect = `variant="secondary"`.
  - Replace `.raw-export-result*`, `.raw-export-actions`, `.raw-export-result-facts` with Tailwind: result heading `text-callout text-text-secondary` + `strong` `text-body text-text`; facts `dl` as `grid grid-cols-2 gap-x-3 gap-y-1 text-callout`; actions `flex flex-wrap gap-2`.
  - Replace `.raw-tool-note` with `text-callout leading-relaxed text-text-secondary`.

- [ ] **Step 4: Run → pass.** `pnpm test:run src/modules/raw-processor/components/tools/ExportTool.test.tsx src/modules/raw-processor/components/RawToolSurface.test.tsx`.

- [ ] **Step 5: Phase-2 full verification + commit**

```bash
pnpm lint && pnpm test:run && pnpm build
```
Manually verify `/raw`: Tone sliders drag and reset, Strength segments switch (incl. session reset re-seed), Export buttons (export/share/download/copy/recovery) all function and look consistent with the app button system.

```bash
git add src/modules/raw-processor/components/tools/ExportTool.tsx src/modules/raw-processor/components/tools/ExportTool.test.tsx src/modules/raw-processor/components/RawToolSurface.test.tsx
git commit --no-gpg-sign -m "refactor(raw): rebuild ExportTool on ui/button + Tailwind"
```

---

# Phase 3 — Reference cards, LUT dialog, delete bespoke CSS

### Task 3.1: CompareTool + FileFactsTool → Tailwind

**Files:**
- Modify: `src/modules/raw-processor/components/tools/CompareTool.tsx`
- Modify: `src/modules/raw-processor/components/tools/FileFactsTool.tsx`
- Modify: coupled assertions in `RawToolSurface.test.tsx` (`raw-tool-reset-button` class on compare reset → assert by role/name).

- [ ] **Step 1:** Update the `uses Raw Lab-specific reset controls...` test: replace `.raw-tool-reset-button` class checks with `getByRole('button', { name: 'Reset compare view' })` presence (open the Compare card first). Run → fail.

- [ ] **Step 2:** Rewrite both, removing `ToolSection`:
  - `CompareTool`: return `<div className="grid gap-3">` with note `text-callout text-text-secondary` and a `<Button variant="light" size="sm">` reset (rotate icon + `t('raw.compare.reset')`).
  - `FileFactsTool`: return `<dl className="grid grid-cols-2 gap-x-3 gap-y-2">`; `dt` `text-footnote text-text-secondary`; `dd` `mt-0.5 truncate text-callout font-medium text-text`.

- [ ] **Step 3:** Run → pass: `pnpm test:run src/modules/raw-processor/components/RawToolSurface.test.tsx`.

- [ ] **Step 4: Commit**

```bash
git add src/modules/raw-processor/components/tools/CompareTool.tsx src/modules/raw-processor/components/tools/FileFactsTool.tsx src/modules/raw-processor/components/RawToolSurface.test.tsx
git commit --no-gpg-sign -m "refactor(raw): rebuild Compare/FileFacts tools on Tailwind tokens"
```

### Task 3.2: HistogramTool container → Tailwind (keep visx SVG)

**Files:**
- Modify: `src/modules/raw-processor/components/tools/HistogramTool.tsx`
- Modify: `src/modules/raw-processor/raw-lab.css` — keep only the SVG stroke/fill rules (`.raw-histogram-channel-*`, `.raw-histogram-luma`, `.raw-histogram-grid`); convert them to consume the scoped tokens (no behavior change, they are SVG-only and have no utility equivalent).

- [ ] **Step 1:** Tests: the existing histogram tests assert `.raw-histogram-channel-fill` count etc. Keep those class names on the SVG paths (they remain styled by the retained CSS). Only the wrapper `.raw-histogram`, `.raw-histogram-plot`, `.raw-histogram-clipping` move to Tailwind. Update only assertions that referenced the wrapper classes (if any) — the existing tests query SVG path classes and text, which stay valid. Run the histogram tests to confirm they still pass after Step 2.

- [ ] **Step 2:** In `HistogramTool.tsx` remove `ToolSection`; return `<div className="grid gap-2">`; status line `text-callout text-text-secondary`; the plot wrapper gets Tailwind `block w-full h-[108px] overflow-hidden rounded-md border border-border` plus an inline dark background using the scoped token (`bg-[var(--color-text)]/95` is wrong tonally — instead add a tiny retained class `.raw-histogram-plot` keeping only its `background`/`box-shadow`, fed by tokens). Clipping row → `flex flex-wrap gap-1.5 text-footnote tabular-nums text-text-secondary`.

- [ ] **Step 3:** Run → pass: `pnpm test:run src/modules/raw-processor/components/RawToolSurface.test.tsx`.

- [ ] **Step 4: Commit**

```bash
git add src/modules/raw-processor/components/tools/HistogramTool.tsx src/modules/raw-processor/raw-lab.css
git commit --no-gpg-sign -m "refactor(raw): Tailwind histogram container, keep token-fed SVG strokes"
```

### Task 3.3: LUT tools → Tailwind + `ui/dialog`

**Files:**
- Modify: `src/modules/raw-processor/components/tools/lut/LutContractTool.tsx`, `LUTProfileStatus.tsx`, `LUTContractBrowser.tsx`, `OnlineLutSourceControls.tsx`, `LutBrowserDialog.tsx`, `LUTProfileButton.tsx`, `LUTOutputOptionButton.tsx`, `LutIconButton.tsx`
- Modify: `src/modules/raw-processor/components/Dropzone.tsx` (LUT dropzone classes only)
- Modify: `src/modules/raw-processor/components/RawToolSurface.test.tsx` (the large block of `raw-lut-*` selector tests)

This is the largest single task. The online-LUT browser tests assert many `raw-lut-*` classes, `data-lut-source-placement`, dialog roles, focus behavior, and CSS-variable-driven positioning. Preserve the **behavior and the data-attributes/roles** (`role="dialog"`, `aria-haspopup`, `aria-expanded`, `aria-controls`, `data-raw-lut-browser-dialog`, `data-lut-source-placement`, `--raw-lut-source-browser-*` custom props can stay as inline style custom props on the element — they are positioning math, not part of the deleted token system). Replace only the **visual classes** with Tailwind.

- [ ] **Step 1:** Go test-by-test. For each `toHaveClass('raw-lut-...')` assertion, replace with a structural/role assertion or a stable `data-*` hook. Add `data-raw-lut="dropzone|clear|browser-list|contract-option|..."` attributes where a test needs to target an element that no longer has a semantic role. Update the test file accordingly. Run the file → expect failures only where visuals changed, not behavior.

- [ ] **Step 2:** Migrate component markup:
  - `LutContractTool`: remove `import './lut-tool.css'`; remove `ToolSection`; return `<div className="grid gap-3">`.
  - Dropzone LUT variant (`Dropzone.tsx`): replace `.raw-lut-dropzone*` classes with Tailwind (`min-h-9 rounded-md border border-border bg-fill-secondary px-2 py-1.5 text-callout text-text-secondary` + hover `hover:border-accent/40 hover:bg-fill`), keeping `min-w-0`, `truncate`, and the `title` attribute the existing test asserts. Keep the `aria-label` `add .cube lut`.
  - Browser dialog (`LutBrowserDialog`/`LUTContractBrowser`): wrap with `~/components/ui/dialog` for focus trap/escape/outside-click (the existing tests assert Escape closes + focus restore + outside click — Radix Dialog provides these natively; ensure `aria-haspopup="dialog"`, `aria-expanded`, `aria-controls` remain on the trigger, and the dialog keeps `role="dialog"` with the same accessible name `"<source> LUTs"`). Keep the positioning custom properties (`--raw-lut-source-browser-top`, etc.) as inline styles on the dialog content element and keep `data-lut-source-placement`/`data-raw-lut-browser-dialog` — the placement-math tests depend on them. Replace background/border/padding classes with Tailwind tokens.
  - `LUTProfileButton`, `LUTOutputOptionButton`, `LutIconButton`, `OnlineLutSourceControls`, `LUTProfileStatus`: replace `raw-lut-*` visual classes with Tailwind token utilities; replace the `raw-lut-contract-change-button` with `<Button variant="secondary" size="sm">`; keep all `aria-*`, `role`, `data-*`, and i18n.

- [ ] **Step 3:** Run the full surface test file iteratively until green:

Run: `pnpm test:run src/modules/raw-processor/components/RawToolSurface.test.tsx`
Expected: PASS (all online-LUT + contract tests behavior-equivalent).

- [ ] **Step 4: Commit**

```bash
git add src/modules/raw-processor/components/tools/lut src/modules/raw-processor/components/Dropzone.tsx src/modules/raw-processor/components/RawToolSurface.test.tsx
git commit --no-gpg-sign -m "refactor(raw): rebuild LUT tools on Tailwind + ui/dialog"
```

### Task 3.4: Delete bespoke CSS, `--raw-*`, and ToolSection

**Files:**
- Delete: `src/modules/raw-processor/components/tools/export-tool.css`, `src/modules/raw-processor/components/tools/lut/lut-tool.css`
- Delete: `src/modules/raw-processor/components/tools/ToolSection.tsx`, `src/modules/raw-processor/components/tools/ToolSection.test.tsx`
- Modify: `src/modules/raw-processor/raw-lab.css` — keep ONLY: the scoped `.raw-lab { --color-* }` block, `.raw-lab` layout grid/height, `.raw-lab-shell`/`.raw-lab-stage*` (preview stage), the histogram SVG stroke rules, the compare split handle transform rules, and the mobile sheet/rail scaffolding still referenced by class. Delete all other rules and every `--raw-*` declaration; rewrite remaining rules to consume `--color-*`/standard values. Re-point any retained selector that used `--raw-*` to the scoped `--color-*`.
- Modify: `src/modules/raw-processor/components/index.ts` — remove `export { ToolSection }`.
- Grep guard: no remaining `--raw-` token usages outside the retained scoped block, no `import './export-tool.css'` / `lut-tool.css`.

- [ ] **Step 1:** Remove the two CSS imports' files and the imports referencing them (already removed in 2.3/3.3 — verify with grep):

Run: `grep -rn "export-tool.css\|lut-tool.css\|ToolSection\|--raw-" src/modules/raw-processor --include=*.tsx --include=*.ts`
Expected after edits: only matches inside `raw-lab.css` retained scoped block and the histogram/compare/mobile rules that now use `--color-*` (zero `--raw-` token *definitions* except none; zero component refs to deleted files).

- [ ] **Step 2:** Delete files:

```bash
git rm src/modules/raw-processor/components/tools/export-tool.css \
  src/modules/raw-processor/components/tools/lut/lut-tool.css \
  src/modules/raw-processor/components/tools/ToolSection.tsx \
  src/modules/raw-processor/components/tools/ToolSection.test.tsx
```

- [ ] **Step 3:** Trim `raw-lab.css` per the Files list above. Replace each former `var(--raw-paper)` etc. with the matching `var(--color-background)` etc. Delete the `--raw-*` block entirely.

- [ ] **Step 4: Full verification**

Run:
```bash
pnpm lint && pnpm test:run && pnpm build
```
Expected: PASS, no unused-export or missing-import errors, no orphaned CSS.

- [ ] **Step 5: Browser validation (golden path + mobile/WebKit)**

Start dev server, open `/raw`:
- Load a RAW → Look/LUT (open browser dialog, pick contract, change) → adjust Strength → Tone sliders → toggle reference cards → drag compare on the image → Export (run, share/download/copy).
- Mobile emulation 390px + a WebKit run: Tools sheet opens with the full card set, drag-to-dismiss, Export quick long-press, scrolling, safe-area.
- Confirm warm identity intact (paper/ink/green), no leftover bright Pastel defaults, calm spacing, no per-section dividers.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit --no-gpg-sign -m "refactor(raw): delete bespoke CSS and --raw-* tokens, drop ToolSection"
```

---

## Self-Review Notes (author check — completed)

- **Spec coverage:** §1 IA → Task 1.2 (`renderCards` order, defaults via 0.1 atom). §2 ToolCard → Tasks 0.1–0.3. §3 Radix-first/Tailwind → Phase 2 + 3.3. §3 warm identity → Task 1.1. §4 desktop layout/sticky export/scrollbar → 1.2/1.3 (scrollbar rule retained then trimmed 3.4). §5 mobile sheet isomorphic → 1.4. §6 motion/a11y → Accordion/Spring reused (0.2), aria preserved each task. §7 phasing/verification → phase-end verification tasks. §8 testing → test step in every task; `ToolSection.test` deletion in 3.4. Risks (blast radius, token audit, accordion/stagger jitter) addressed by phasing + grep guard + controlled Accordion.
- **Placeholder scan:** no TBD/TODO; each code step has concrete code or concrete file+token+command instructions; mechanical CSS migrations specify exact files, exact class→token mappings, and exact verification commands rather than reproducing ~2.4k lines.
- **Type consistency:** `toolCardOpenAtom`/`ToolCardId`/`TOOL_CARD_IDS`/`DEFAULT_OPEN_TOOL_CARDS` consistent across 0.1/0.2/1.2; `ToolCard`/`ToolCardStack` props consistent; `ExportTool` `embedded` prop introduced in 1.2 and consumed in 2.3; rail "Tools" key added in 1.4 and used in tests; Radix region-name/`aria-hidden` meta rule stated once and relied on by all card tests.
```
