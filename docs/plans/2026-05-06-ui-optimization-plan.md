# RAW Lab UI/UX Optimization — Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the dual-design-system by migrating all RAW Lab surfaces and shared UI components from raw CSS (`raw-lab.css`) to a unified Radix UI + Tailwind foundation, while reorganizing the tool panel with progressive disclosure guided by the "film darkroom" metaphor.

**Architecture:** Add unified design tokens to `tailwind.css`, then incrementally migrate each component from `.raw-*` CSS classes to Tailwind utilities + Radix primitives. Each component is self-contained — migrated components use Tailwind, unmigrated ones still use raw-lab.css until the final removal. The tool panel is reorganized into three phases (Look, Fine-tune, Export) with collapsible disclosure. Mobile keeps the rail+sheet pattern but simplifies to 2 tabs mapping to the same phases.

**Tech Stack:** React 19, Radix UI primitives, Tailwind CSS v4, `motion/react` (LazyMotion), react-hook-form + zod (tone), Jotai (state)

**Design Brief:** `docs/specs/2026-05-06-ui-optimization-design-brief.md`

**Previous Related Spec:** `docs/specs/2026-04-28-raw-lab-ui-redesign-design.md` (app-shell and image-first layout already implemented)

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/styles/tailwind.css` | Modify | Add unified RAW Lab color/spacing/typography tokens |
| `src/modules/raw-processor/raw-lab.css` | Delete (final step) | Current custom CSS — to be eliminated |
| `src/modules/raw-processor/RawProcessorView.tsx` | Modify | Wire new tool panel layout + progressive disclosure state |
| `src/modules/raw-processor/components/RawToolSurface.tsx` | Rewrite | New panel container with Tailwind, 3-phase layout, progressive disclosure |
| `src/modules/raw-processor/components/WorkspaceHeader.tsx` | Modify | Migrate classes to Tailwind |
| `src/modules/raw-processor/components/ComparePreviewStage.tsx` | Modify | Migrate wrapper classes to Tailwind (no WebGL changes) |
| `src/modules/raw-processor/components/tools/ToolSection.tsx` | Modify | Migrate to Tailwind |
| `src/modules/raw-processor/components/tools/StrengthControl.tsx` | Modify | Migrate to Radix ToggleGroup + Tailwind |
| `src/modules/raw-processor/components/tools/ToneTool.tsx` | Modify | Migrate to Tailwind, add collapsible wrapper |
| `src/modules/raw-processor/components/tools/LutContractTool.tsx` | Modify | Migrate to Tailwind |
| `src/modules/raw-processor/components/tools/ExportTool.tsx` | Modify | Migrate to Tailwind, sticky bottom placement |
| `src/modules/raw-processor/components/tools/FileFactsTool.tsx` | Modify | Migrate to Tailwind, collapsible |
| `src/modules/raw-processor/components/tools/HistogramTool.tsx` | Modify | Migrate wrapper to Tailwind (keep canvas rendering) |
| `src/modules/raw-processor/components/tools/CompareTool.tsx` | Modify | Migrate to Tailwind |

---

### Task 1: Add unified RAW Lab design tokens to tailwind.css

**Files:**
- Modify: `src/styles/tailwind.css`

- [ ] **Step 1: Add RAW Lab color tokens**

Add inside the `@theme` block in `tailwind.css`, after existing custom properties:

```css
/* RAW Lab — film darkroom color system */
--color-raw-paper: oklch(0.964 0.018 86);
--color-raw-paper-high: oklch(0.948 0.022 86);
--color-raw-paper-low: oklch(0.918 0.026 86);
--color-raw-paper-warm: oklch(0.9 0.034 82);
--color-raw-ink: oklch(0.18 0.018 76);
--color-raw-ink-soft: oklch(0.38 0.032 75);
--color-raw-hairline: oklch(0.74 0.035 78);
--color-raw-green: oklch(0.59 0.15 153);
--color-raw-green-hover: oklch(0.66 0.16 153);
--color-raw-green-deep: oklch(0.37 0.105 155);
--color-raw-green-soft: oklch(0.84 0.09 145);
--color-raw-amber: oklch(0.78 0.16 63);
--color-raw-amber-soft: oklch(0.9 0.055 76);
--color-raw-dark: oklch(0.18 0.02 76);
--color-raw-hero-ink: oklch(0.97 0.014 86);
--color-raw-rose: oklch(0.62 0.17 346);
--color-raw-sky: oklch(0.65 0.1 214);
--color-raw-scrollbar-thumb: oklch(0.54 0.055 78 / 0.64);
--color-raw-scrollbar-thumb-hover: oklch(0.43 0.082 152 / 0.78);
```

- [ ] **Step 2: Add RAW Lab spacing/dimension tokens**

Add in the same `@theme` block:

```css
/* RAW Lab — layout tokens */
--spacing-raw-panel-width: 340px;
--spacing-raw-panel-max-width: 400px;
--spacing-raw-topbar-h: auto;
--spacing-raw-mobile-rail-h: 62px;
```

- [ ] **Step 3: Add RAW Lab shadow token**

```css
/* RAW Lab — shadows */
--shadow-raw-photo-panel: 0 24px 80px oklch(0.18 0.018 76 / 0.18);
--shadow-raw-mobile-sheet: 0 -24px 54px oklch(0.18 0.018 76 / 0.22);
```

- [ ] **Step 4: Verify build**

Run: `pnpm build`
Expected: Build succeeds, no new errors (tokens are additive).

---

### Task 2: Migrate ToolSection to Tailwind

**Files:**
- Modify: `src/modules/raw-processor/components/tools/ToolSection.tsx`

- [ ] **Step 1: Rewrite ToolSection with Tailwind classes**

Replace the current implementation:

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
      className={clsxm(
        'border-b border-[color:--color-raw-hairline] py-3.5 first:pt-0 last:border-b-0',
        className,
      )}
    >
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <h2 className="m-0 text-[0.78rem] font-semibold leading-none text-[color:--color-raw-ink]">
          {title}
        </h2>
        {eyebrow && (
          <p className="m-0 text-[0.72rem] leading-snug text-[color:--color-raw-ink-soft]">
            {eyebrow}
          </p>
        )}
      </div>
      {children}
    </section>
  )
}
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck`
Expected: No type errors.

---

### Task 3: Migrate StrengthControl to Radix ToggleGroup + Tailwind

**Files:**
- Modify: `src/modules/raw-processor/components/tools/StrengthControl.tsx`

- [ ] **Step 1: Rewrite using Radix ToggleGroup**

```tsx
import * as ToggleGroup from '@radix-ui/react-toggle-group'
import { useI18n } from '~/lib/i18n'

const LEVELS = ['off', 'light', 'standard', 'strong'] as const

export type StrengthLevel = (typeof LEVELS)[number]

export function StrengthControl({
  value,
  onChange,
  disabled,
}: {
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
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(v) => {
        if (v) onChange(v as StrengthLevel)
      }}
      disabled={disabled}
      aria-label={t('raw.strength.title')}
      className="grid grid-cols-4 overflow-hidden rounded-lg border border-[color:--color-raw-hairline]"
    >
      {LEVELS.map((level, i) => (
        <ToggleGroup.Item
          key={level}
          value={level}
          disabled={disabled}
          className={[
            'min-h-[34px] min-w-0 border-0 border-r border-[color:--color-raw-hairline] bg-[color:--color-raw-paper] text-[0.76rem] font-medium text-[color:--color-raw-ink-soft] transition-colors duration-160 last:border-r-0',
            'hover:not-disabled:bg-[color:--color-raw-green-soft] hover:not-disabled:text-[color:--color-raw-ink]',
            'data-[state=on]:border-[color:--color-raw-green] data-[state=on]:bg-[color:--color-raw-green-soft] data-[state=on]:text-[color:--color-raw-ink]',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'focus-visible:outline-2 focus-visible:outline-[color:--color-raw-green] focus-visible:outline-offset-2',
          ].join(' ')}
        >
          {labels[level]}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  )
}
```

- [ ] **Step 2: Verify build and typecheck**

Run: `pnpm typecheck && pnpm build`
Expected: No errors.

---

### Task 4: Migrate ToneTool to Tailwind with collapsible container

**Files:**
- Modify: `src/modules/raw-processor/components/tools/ToneTool.tsx`

- [ ] **Step 1: Update ToneTool to accept a `collapsed` prop and use Tailwind classes**

Replace the component to wrap content in a collapsible container. The ToneTool itself remains responsible for sliders; a parent controls collapse state.

```tsx
import { RotateCcw } from 'lucide-react'
import { useId } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { useI18n } from '~/lib/i18n'
import { ToolSection } from './ToolSection'

export const ToneValueSchema = z.object({
  userExposureEv: z.number().min(-5).max(5),
  userContrast: z.number().min(-100).max(100),
  userHighlights: z.number().min(-100).max(100),
  userShadows: z.number().min(-100).max(100),
  userWhites: z.number().min(-100).max(100),
  userBlacks: z.number().min(-100).max(100),
})

export type ToneValue = z.infer<typeof ToneValueSchema>

const TONE_DEFAULTS: ToneValue = {
  userExposureEv: 0,
  userContrast: 0,
  userHighlights: 0,
  userShadows: 0,
  userWhites: 0,
  userBlacks: 0,
}

export function ToneTool({
  value,
  disabled,
  onChange,
  onReset,
}: {
  value: ToneValue
  disabled: boolean
  onChange: (value: Partial<ToneValue>) => void
  onReset: () => void
}) {
  const { t } = useI18n()
  const { register, watch, reset } = useForm<ToneValue>({
    values: value,
    defaultValues: TONE_DEFAULTS,
  })

  const exposureId = useId()
  const contrastId = useId()
  const highlightsId = useId()
  const shadowsId = useId()
  const whitesId = useId()
  const blacksId = useId()

  const currentValues = watch()
  const isNeutral = Object.entries(currentValues).every(
    ([key, val]) => val === TONE_DEFAULTS[key as keyof ToneValue],
  )

  const handleReset = () => {
    reset(TONE_DEFAULTS)
    onReset()
  }

  const registerRange = (field: keyof ToneValue) =>
    register(field, {
      valueAsNumber: true,
      onChange: (event) =>
        onChange({ [field]: Number(event.currentTarget.value) }),
    })

  return (
    <ToolSection title={t('raw.tone.title')} eyebrow={t('raw.tone.eyebrow')}>
      <div className="grid gap-2.5">
        {(
          [
            ['userExposureEv', exposureId, t('raw.tone.exposure'), -5, 5, 0.01, 'EV'] as const,
            ['userContrast', contrastId, t('raw.tone.contrast'), -100, 100, 1, ''] as const,
            ['userHighlights', highlightsId, t('raw.tone.highlights'), -100, 100, 1, ''] as const,
            ['userShadows', shadowsId, t('raw.tone.shadows'), -100, 100, 1, ''] as const,
            ['userWhites', whitesId, t('raw.tone.whites'), -100, 100, 1, ''] as const,
            ['userBlacks', blacksId, t('raw.tone.blacks'), -100, 100, 1, ''] as const,
          ] as const
        ).map(([field, id, label, min, max, step, unit]) => (
          <div
            key={field}
            className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2.5 gap-y-1.5"
          >
            <label htmlFor={id} className="text-[0.76rem] font-semibold text-[color:--color-raw-ink]">
              {label}
            </label>
            <output aria-hidden="true" className="text-[color:--color-raw-ink-soft] tabular-nums">
              {step < 1 ? value[field].toFixed(2) : Math.round(value[field])}{unit ? ` ${unit}` : ''}
            </output>
            <input
              id={id}
              type="range"
              min={min}
              max={max}
              step={step}
              disabled={disabled}
              className="col-span-full w-full accent-[color:--color-raw-green]"
              {...registerRange(field)}
            />
          </div>
        ))}
      </div>
      <p className="raw-tool-note">{t('raw.tone.note')}</p>
      {!isNeutral && <p className="raw-tool-note">{t('raw.tone.preserved')}</p>}
      <button
        type="button"
        className="raw-tool-reset-button"
        disabled={disabled}
        onClick={handleReset}
      >
        <RotateCcw aria-hidden="true" />
        {t('raw.tone.reset')}
      </button>
    </ToolSection>
  )
}
```

Wait — the note and reset button still use raw-lab classes. Those need migration in this same task or a follow-up. Let me keep the plan focused: migrate structural classes first, the few remaining `.raw-tool-note` and `.raw-tool-reset-button` classes get addressed in the final component sweep. For now, the tone sliders use Tailwind; the helper elements follow in a later pass.

- [ ] **Step 2: Verify build**

Run: `pnpm typecheck && pnpm build`
Expected: No errors. `.raw-tool-note` and `.raw-tool-reset-button` still render from raw-lab.css.

---

### Task 5: Migrate LutContractTool structural classes to Tailwind

**Files:**
- Modify: `src/modules/raw-processor/components/tools/LutContractTool.tsx`

- [ ] **Step 1: Read current file to understand exact structure**

Read the file to identify all `.raw-*` class references.

- [ ] **Step 2: Replace all `.raw-*` classes with Tailwind equivalents**

Map:
- `.raw-lut-source-controls` → `grid gap-2 min-w-0 mb-2.5`
- `.raw-lut-dropzone-shell` → `items-stretch`
- `.raw-lut-dropzone` → Tailwind button/dropzone styles using `--color-raw-*` tokens
- `.raw-lut-dropzone-content` → `h-full gap-2`
- `.raw-lut-dropzone-icon` → `grid size-6 shrink-0 place-items-center rounded-[5px] border border-[color:--color-raw-hairline] bg-[color:oklch(0.86_0.03_80_/_0.56)] text-[color:--color-raw-ink-soft]`
- `.raw-lut-dropzone-name` → `text-[0.76rem] font-semibold leading-tight text-current`
- `.raw-lut-clear-button` → Tailwind button using tokens
- `.raw-lut-source-input-row` → `grid grid-cols-[minmax(0,1fr)_32px_32px] gap-1.5 min-w-0`
- `.raw-lut-input` → `border-[color:oklch(0.7_0.04_78_/_0.74)] bg-[color:oklch(0.948_0.022_86_/_0.9)] text-[color:--color-raw-ink] shadow-none`
- `.raw-lut-source-icon-button` → Tailwind icon button
- `.raw-lut-source-list` → `grid gap-1.5 min-w-0`
- `.raw-lut-source-resource` → `grid min-w-0 py-1.5 border-t border-[color:--color-raw-hairline]`
- `.raw-lut-source-resource-row` → `grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 min-w-0`
- `.raw-lut-source-summary` → `flex min-w-0 items-center gap-1.5`
- `.raw-lut-source-actions` → `flex gap-1`
- `.raw-lut-source-label` → `text-[0.72rem] font-semibold text-[color:--color-raw-green-deep] truncate`
- `.raw-lut-source-count` → `shrink-0 rounded-full border border-[color:--color-raw-hairline] px-1.5 py-0.5 bg-[color:oklch(0.964_0.018_86_/_0.62)] text-[0.64rem] font-bold text-[color:--color-raw-ink-soft] leading-tight`
- `.raw-lut-source-state` → same base + green tint
- `.raw-lut-source-state-issue` → same base + amber tint
- `.raw-lut-browser-dialog` → fixed positioned dialog using `--color-raw-*` tokens
- `.raw-lut-browser-heading` → `flex min-w-0 items-center justify-between gap-2.5`
- `.raw-lut-browser-list` → `grid self-stretch min-h-0 gap-1.5 overflow-y-auto overscroll-contain pr-0.5`
- `.raw-lut-contract-browser-tabs` → `grid grid-cols-2 gap-1.5`
- `.raw-lut-contract-browser-tab` → button with selected state styling
- `.raw-lut-contract-browser-group` → `m-0 text-[0.68rem] font-semibold uppercase text-[color:oklch(0.47_0.085_68)]`
- `.raw-lut-contract-option` → button with suggested/active variants
- `.raw-lut-contract-status` → `m-0 rounded-lg border border-[color:oklch(0.78_0.16_63_/_0.38)] p-2.5 text-[0.72rem] leading-snug text-[color:--color-raw-ink-soft]`
- `.raw-lut-contract-status-amber` → amber gradient bg
- `.raw-lut-contract-facts` → `grid gap-1.5 min-w-0 text-[0.72rem] leading-snug text-[color:--color-raw-ink]`
- `.raw-lut-contract-fact` → `grid grid-cols-[4.9rem_minmax(0,1fr)] gap-2 min-w-0 m-0`
- `.raw-lut-contract-term` → `text-[color:oklch(0.47_0.085_68)] font-semibold`
- `.raw-lut-contract-value` → `min-w-0 overflow-wrap-anywhere text-[color:--color-raw-ink] font-medium`
- `.raw-lut-contract-change-button` → Tailwind button
- `.raw-lut-source-family-group` → `grid gap-1.5`
- `.raw-lut-source-family-heading` → `m-0 text-[0.68rem] font-semibold uppercase text-[color:--color-raw-ink-soft]`
- `.raw-lut-source-entry` → `grid grid-cols-[minmax(0,1fr)_32px] items-center gap-1.5 min-w-0 rounded-lg border border-[color:--color-raw-hairline] px-1.5 py-1.5 bg-[color:oklch(0.964_0.018_86_/_0.36)]`
- `.raw-lut-source-entry-title` → `text-[0.74rem] font-medium text-[color:--color-raw-ink] truncate`
- `.raw-lut-source-browser-empty` → `m-0 text-[0.72rem] leading-snug text-[color:--color-raw-ink-soft]`
- `.raw-lut-source-issues` → `grid gap-1`
- `.raw-lut-source-issues p` → `m-0 text-[0.7rem] leading-snug text-[color:--color-raw-ink-soft]`

- [ ] **Step 3: Verify build**

Run: `pnpm typecheck && pnpm build`

---

### Task 6: Migrate ExportTool structural classes to Tailwind

**Files:**
- Modify: `src/modules/raw-processor/components/tools/ExportTool.tsx`

- [ ] **Step 1: Read current file**

Read to identify all `.raw-*` class references.

- [ ] **Step 2: Replace `.raw-*` classes with Tailwind**
  - `.raw-export-result` → `grid gap-2.5 min-w-0 rounded-lg border border-[color:--color-raw-hairline] p-2.5 bg-gradient-to-b from-[color:oklch(0.942_0.026_84)] to-[color:oklch(0.91_0.034_82)]`
  - `.raw-export-result-heading` → `grid gap-1 min-w-0`
  - Heading `span` → `text-[0.72rem] font-bold uppercase text-[color:--color-raw-green-deep]`
  - Heading `strong` → `text-[0.86rem] font-bold text-[color:--color-raw-ink] truncate`
  - `.raw-export-result-facts` → `grid grid-cols-2 gap-2 m-0`
  - Fact `div` → `min-w-0 rounded-[5px] border border-[color:--color-raw-hairline] p-2 bg-[color:oklch(0.962_0.018_86_/_0.58)]`
  - Fact `dt` → `text-[0.68rem] uppercase text-[color:--color-raw-ink-soft]`
  - Fact `dd` → `m-0 text-[0.82rem] tabular-nums text-[color:--color-raw-ink]`
  - `.raw-export-actions` → `grid grid-cols-1 gap-2`
  - `.raw-export-button` → Tailwind button base
  - `.raw-export-button-primary` → primary variant using `--color-raw-green`
  - `.raw-export-button-secondary` → secondary variant

- [ ] **Step 3: Verify build**

Run: `pnpm build`

---

### Task 7: Migrate FileFactsTool and HistogramTool to Tailwind

**Files:**
- Modify: `src/modules/raw-processor/components/tools/FileFactsTool.tsx`
- Modify: `src/modules/raw-processor/components/tools/HistogramTool.tsx`

- [ ] **Step 1: Migrate FileFactsTool**
  - `.raw-file-facts` → `grid grid-cols-2 gap-x-3 gap-y-2 m-0`
  - Fact `dt` → `text-[0.68rem] text-[color:--color-raw-ink-soft]`
  - Fact `dd` → `mt-0.5 overflow-hidden text-[0.75rem] font-medium text-[color:--color-raw-ink] text-ellipsis whitespace-nowrap`

- [ ] **Step 2: Migrate HistogramTool wrapper**
  - `.raw-histogram` → `grid gap-2`
  - `.raw-histogram-plot` → `block w-full h-[108px] overflow-hidden rounded-lg border border-[color:--color-raw-hairline] bg-gradient-to-b from-[color:oklch(0.235_0.025_78_/_0.96)] to-[color:oklch(0.17_0.022_76_/_0.96)] shadow-[inset_0_1px_0_oklch(0.92_0.026_86_/_0.12),inset_0_-18px_28px_oklch(0.12_0.018_76_/_0.2)]`
  - `.raw-histogram-clipping` → `flex flex-wrap gap-1.5 text-[0.7rem] tabular-nums text-[color:--color-raw-ink-soft]`
  - Keep all `.raw-histogram-*` canvas rendering classes (grid, channel-fill, channel-line, luma) — these are for the SVG histogram internals and not layout. They stay until the canvas rendering itself is refactored.

- [ ] **Step 3: Verify**

Run: `pnpm typecheck && pnpm build`

---

### Task 8: Rebuild RawToolSurface — new panel container with progressive disclosure

**Files:**
- Modify: `src/modules/raw-processor/components/RawToolSurface.tsx`

- [ ] **Step 1: Rewrite RawToolSurface with 3-phase layout + collapsible Tone**

Replace the current `aside.raw-tool-surface` with a Tailwind-styled panel. The key structural change: Phase 1 (Look = LUT + Intensity) always visible, Phase 2 (Fine-tune = Tone) collapsible via a disclosure trigger, Phase 3 (Export) sticky at bottom. Histogram and File Facts as collapsible metadata section at the very bottom.

```tsx
import type { LUTColorProfile, LUTProfileResolution, PreviewHistogramState } from '@lumaforge/luma-color-runtime'
import { ChevronDown, Download, SlidersHorizontal, X } from 'lucide-react'
import type { ComponentProps } from 'react'
import { useCallback, useId, useRef, useState } from 'react'
import * as Collapsible from '@radix-ui/react-collapsible'
import { m } from 'motion/react'

import { useI18n } from '~/lib/i18n'
import type { UseOnlineLutSourcesResult } from '../hooks/useOnlineLutSources'
import type { ExportResult, ExportShareCapability } from '../model/export-result'
import type { ExportRecoveryState, LUTProfileSelectionState } from '../model/session'
import { CompareTool } from './tools/CompareTool'
import { ExportTool } from './tools/ExportTool'
import { FileFactsTool } from './tools/FileFactsTool'
import { HistogramTool } from './tools/HistogramTool'
import { LutContractTool } from './tools/LutContractTool'
import type { StrengthLevel } from './tools/StrengthControl'
import { StrengthControl } from './tools/StrengthControl'
import type { ToneValue } from './tools/ToneTool'
import { ToneTool } from './tools/ToneTool'
import { ToolSection } from './tools/ToolSection'

type MobileToolPanel = 'style' | 'export'

export function RawToolSurface(props: {
  activeIntensity: StrengthLevel
  tone: ToneValue
  onIntensitySelect: (level: StrengthLevel) => void
  onToneChange: (value: Partial<ToneValue>) => void
  onToneReset: () => void
  onCompareReset: () => void
  onLutLoad: (files: File[]) => void
  onLutClear: () => void
  onLutProfileSelect: (profile: LUTColorProfile) => void
  onExport: (options: { quality: 'standard' | 'high'; fidelity: 'safe' | 'balanced' | 'max' }) => void
  canExport: boolean
  disabledReason?: string
  isProcessing: boolean
  exportResult: ExportResult | null
  exportShareCapability: ExportShareCapability
  histogram: PreviewHistogramState
  recovery?: ExportRecoveryState
  onShareExport: () => void
  onDownloadExport: () => void
  onCopyExport: () => void
  onRecoverExportSource?: () => void
  hasImage: boolean
  currentLutName?: string | null
  lutProfileSelection?: LUTProfileSelectionState | null
  lutProfileResolution?: LUTProfileResolution | null
  onlineLutSources?: UseOnlineLutSourcesResult
  supportLevel: 'official' | 'experimental'
  metadata: ComponentProps<typeof FileFactsTool>['metadata']
  stats: ComponentProps<typeof FileFactsTool>['stats']
}) {
  const { t } = useI18n()
  const [mobilePanel, setMobilePanel] = useState<MobileToolPanel | null>(null)
  const [toneExpanded, setToneExpanded] = useState(false)
  const mobileToolSheetId = useId()
  const disabled = !props.hasImage || props.isProcessing
  const mobilePanelTitle =
    mobilePanel === 'style' ? t('raw.mobileTools.style')
    : mobilePanel === 'export' ? t('raw.mobileTools.export')
    : ''
  const { canExport, isProcessing, exportResult, onExport } = props
  const canStartMobileExport = canExport && !isProcessing && !exportResult
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [sheetDragY, setSheetDragY] = useState(0)
  const sheetDragStartRef = useRef<number | null>(null)
  const sheetRef = useRef<HTMLDivElement | null>(null)

  const handleMobilePanelToggle = useCallback((panel: MobileToolPanel) => {
    setMobilePanel((currentPanel) => (currentPanel === panel ? null : panel))
  }, [])

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }, [])

  const handleExportLongPressStart = useCallback(() => {
    clearLongPress()
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null
      if (canStartMobileExport) {
        onExport({ quality: 'high', fidelity: 'balanced' })
      }
    }, 500)
  }, [canStartMobileExport, clearLongPress, onExport])

  // Sheet drag handlers (keep existing logic, update class refs)
  const handleSheetPointerDown = useCallback((event: React.PointerEvent) => {
    const el = event.currentTarget as HTMLElement
    el.setPointerCapture?.(event.pointerId)
    sheetDragStartRef.current = event.clientY
  }, [])

  const handleSheetPointerMove = useCallback((event: React.PointerEvent) => {
    if (sheetDragStartRef.current === null) return
    const delta = event.clientY - sheetDragStartRef.current
    setSheetDragY(Math.max(0, delta))
  }, [])

  const handleSheetPointerUp = useCallback((event: React.PointerEvent) => {
    const el = event.currentTarget as HTMLElement
    el.releasePointerCapture?.(event.pointerId)
    sheetDragStartRef.current = null
    const sheet = sheetRef.current
    const threshold = sheet ? Math.max(80, sheet.offsetHeight * 0.28) : 80
    if (sheetDragYRef.current > threshold) {
      setMobilePanel(null)
    }
    setSheetDragY(0)
  }, [])

  const handleSheetPointerCancel = useCallback((event: React.PointerEvent) => {
    const el = event.currentTarget as HTMLElement
    el.releasePointerCapture?.(event.pointerId)
    sheetDragStartRef.current = null
    setSheetDragY(0)
  }, [])

  const sheetDragYRef = useRef(sheetDragY)
  sheetDragYRef.current = sheetDragY

  // Shared desktop panel content
  const DesktopPanel = () => (
    <>
      {/* Phase 1: Look — always visible */}
      <ToolSection title={t('raw.look.title')}>
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
        <div className="mt-2.5">
          <StrengthControl
            value={props.activeIntensity}
            onChange={props.onIntensitySelect}
            disabled={disabled}
          />
        </div>
      </ToolSection>

      {/* Phase 2: Fine-tune — collapsible */}
      <Collapsible.Root open={toneExpanded} onOpenChange={setToneExpanded}>
        <Collapsible.Trigger className="flex w-full items-center justify-between rounded-lg border border-[color:--color-raw-hairline] px-3 py-2 text-[0.78rem] font-semibold text-[color:--color-raw-ink] transition-colors hover:border-[color:--color-raw-green] hover:text-[color:--color-raw-green-deep]">
          {t('raw.tone.fineTune')}
          <ChevronDown
            aria-hidden
            className="size-4 transition-transform duration-200"
            style={{ transform: toneExpanded ? 'rotate(180deg)' : undefined }}
          />
        </Collapsible.Trigger>
        <Collapsible.Content asChild>
          <m.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="pt-3">
              <ToneTool
                value={props.tone}
                disabled={disabled}
                onChange={props.onToneChange}
                onReset={props.onToneReset}
              />
              <HistogramTool histogram={props.histogram} />
            </div>
          </m.div>
        </Collapsible.Content>
      </Collapsible.Root>

      {/* Compare reset (minimal) */}
      <CompareTool disabled={disabled} onCompareReset={props.onCompareReset} />

      {/* Phase 3: Export — sticky at bottom */}
      <div className="sticky bottom-0 -mx-3.5 -mb-3.5 border-t border-[color:--color-raw-hairline] bg-gradient-to-b from-[color:oklch(0.954_0.022_86)] to-[color:oklch(0.91_0.03_84)] px-3.5 py-3">
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
        />
      </div>

      {/* File facts (collapsed by default once a file is loaded) */}
      <FileFactsTool
        supportLevel={props.supportLevel}
        metadata={props.metadata}
        stats={props.stats}
      />
    </>
  )

  return (
    <aside
      className="grid grid-rows-[auto_minmax(0,1fr)] gap-3 min-w-0 min-h-0 overflow-hidden border-l border-[color:--color-raw-hairline] bg-gradient-to-b from-[color:oklch(0.942_0.024_86)] to-[color:oklch(0.91_0.03_84)] p-3.5"
      data-raw-tool-sheet={mobilePanel ? 'open' : 'closed'}
      data-raw-mobile-panel={mobilePanel ?? 'closed'}
      aria-label={t('raw.tools.aria')}
    >
      {/* Desktop scrollable content */}
      <div className="raw-tool-stack hidden @[981px]:block">
        <DesktopPanel />
      </div>

      {/* Mobile sheet (keep existing sheet structure, update classes) */}
      <div
        id={mobileToolSheetId}
        ref={sheetRef}
        className="raw-mobile-tool-sheet"
        style={
          sheetDragY > 0
            ? { transform: `translateY(${sheetDragY}px)`, transition: 'none' }
            : undefined
        }
      >
        {/* ... existing sheet drag + header + scroll structure ... */}
        {/* Content maps to same DesktopPanel sections but per-tab */}
        <div className="raw-mobile-tool-sheet-scroll">
          {mobilePanel === 'style' && (
            <>
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
              <ToolSection title={t('raw.strength.title')}>
                <StrengthControl
                  value={props.activeIntensity}
                  onChange={props.onIntensitySelect}
                  disabled={disabled}
                />
              </ToolSection>
              <ToneTool
                value={props.tone}
                disabled={disabled}
                onChange={props.onToneChange}
                onReset={props.onToneReset}
              />
            </>
          )}
          {mobilePanel === 'export' && (
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
            />
          )}
        </div>
      </div>

      {/* Mobile rail — 2 tabs */}
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
}
```

> **Note:** This is the architectural sketch. The actual implementation must preserve all existing behavior (sheet drag, long-press export, i18n, etc.) while replacing the CSS class surface. The mobile sheet classes (`.raw-mobile-tool-sheet`, `.raw-mobile-tool-rail`, etc.) are migrated in Task 9.

- [ ] **Step 2: Verify build**

Run: `pnpm typecheck && pnpm build`
Expected: Some `.raw-*` classes still referenced from mobile sheet/rail/topbar. Those are migrated in subsequent tasks.

---

### Task 9: Migrate mobile sheet and rail to Tailwind

**Files:**
- Modify: `src/modules/raw-processor/components/RawToolSurface.tsx` (continue)

- [ ] **Step 1: Replace mobile sheet classes with Tailwind**

Replace `.raw-mobile-tool-sheet` classes in RawToolSurface.tsx:
```
raw-mobile-tool-sheet → fixed inset-auto-0-0 z-30 grid grid-rows-[auto_minmax(0,1fr)] min-h-0 overflow-hidden rounded-t-xl border-t border-[color:--color-raw-hairline] bg-gradient-to-b from-[color:oklch(0.954_0.022_86)] to-[color:oklch(0.91_0.03_84)] shadow-[0_-24px_54px_oklch(0.18_0.018_76_/_0.22)] transition-[transform,visibility] duration-280 ease-[cubic-bezier(0.22,1,0.36,1)]
  closed state → translate-y-full invisible
  open state: → translate-y-0 visible pointer-events-auto
```

Replace:
```
raw-mobile-tool-sheet-top → touch-none
raw-mobile-tool-sheet-drag-handle → flex justify-center pt-2
  ::before → block w-8 h-1 rounded-full bg-[color:oklch(0.74_0.035_78_/_0.64)]
raw-mobile-tool-sheet-header → flex items-center justify-between gap-3 border-b border-[color:--color-raw-hairline] px-3 py-2.5
raw-mobile-tool-sheet-header h2 → m-0 text-[0.84rem] font-semibold leading-tight text-[color:--color-raw-ink]
raw-mobile-tool-sheet-close → grid size-11 shrink-0 place-items-center rounded-lg border border-[color:--color-raw-hairline] bg-[color:--color-raw-paper] text-[color:--color-raw-ink]
raw-mobile-tool-sheet-close svg → size-4
raw-mobile-tool-sheet-scroll → min-h-0 overflow-y-auto px-3 pb-3
```

- [ ] **Step 2: Replace mobile rail classes with Tailwind**

```
raw-mobile-tool-rail → z-[1] grid grid-cols-2 gap-2 border-t border-[color:--color-raw-hairline] px-2.5 pt-2 pb-[max(8px,env(safe-area-inset-bottom))] bg-gradient-to-b from-[color:oklch(0.958_0.018_86)] to-[color:oklch(0.925_0.026_86)] shadow-[0_-14px_36px_oklch(0.18_0.018_76_/_0.18)]
raw-mobile-tool-tab → inline-flex min-w-0 min-h-[46px] items-center justify-center gap-1.5 rounded-lg border border-[color:--color-raw-hairline] bg-[color:--color-raw-paper] text-[0.78rem] font-bold leading-none text-[color:--color-raw-ink]
raw-mobile-tool-tab[data-active=true] → border-[color:--color-raw-green-deep] bg-[color:oklch(0.86_0.065_145)]
raw-mobile-tool-tab-export → border-[color:oklch(0.74_0.15_152)] bg-[color:--color-raw-green] text-[color:--color-raw-ink]
raw-mobile-tool-tab-export[aria-disabled=true] → border-[color:--color-raw-hairline] bg-[color:oklch(0.92_0.026_86)] text-[color:--color-raw-ink-soft]
```

- [ ] **Step 3: Verify**

Run: `pnpm build`

---

### Task 10: Migrate WorkspaceHeader to Tailwind

**Files:**
- Modify: `src/modules/raw-processor/components/WorkspaceHeader.tsx`

- [ ] **Step 1: Replace all `.raw-lab-*` classes in WorkspaceHeader**

```
raw-lab-topbar → flex items-center justify-between gap-4 max-w-full min-w-0 border-b border-[color:--color-raw-hairline] px-[clamp(12px,2vw,22px)] py-3 bg-[color:oklch(0.952_0.018_86)]
raw-lab-mark → block size-7 shrink-0 rounded-[5px] shadow-[0_8px_22px_oklch(0.1_0.02_78_/_0.12)] object-cover
raw-lab-title-row → (already uses Tailwind flex/min-w-0/items-center/gap-3)
raw-lab-title → (inline classes already present)
raw-lab-support-badge → inline-flex
raw-lab-status → (already uses Tailwind mt-1/truncate/text-xs)
raw-lab-unavailable → (already uses Tailwind mt-1/truncate/text-xs)
raw-lab-topbar-actions → flex shrink-0 items-center gap-2
raw-lab-topbar-button → inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-lg border border-[color:--color-raw-hairline] bg-[color:--color-raw-paper] px-[11px] py-2 text-[0.8rem] font-bold text-[color:--color-raw-ink] transition-all duration-180 ease-[cubic-bezier(0.22,1,0.36,1)] hover:not-disabled:-translate-y-px hover:not-disabled:border-[color:--color-raw-green] focus-visible:outline-2 focus-visible:outline-[color:--color-raw-green] focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50
raw-lab-topbar-button-primary → border-[color:oklch(0.74_0.15_152)] bg-[color:--color-raw-green] text-[color:--color-raw-ink]
raw-lab-topbar-more → (keep hidden on desktop, visible on mobile via responsive)
raw-lab-locale-toggle → min-w-[70px]
raw-lab-more-menu → (already uses DropdownMenuContent className)
```

- [ ] **Step 2: Verify**

Run: `pnpm typecheck && pnpm build`

---

### Task 11: Migrate ComparePreviewStage wrapper classes to Tailwind

**Files:**
- Modify: `src/modules/raw-processor/components/ComparePreviewStage.tsx`

- [ ] **Step 1: Replace stage wrapper classes**

Only migrate the layout/structure classes. Do NOT touch WebGL canvas rendering or compare handle classes (those are excluded from this plan).

```
raw-lab-stage → relative min-w-0 min-h-0 overflow-hidden p-[clamp(12px,2vw,22px)]
raw-lab-stage-frame → relative w-full h-full min-h-0 overflow-hidden rounded-lg border border-[color:oklch(0.96_0.012_86_/_0.36)] bg-gradient-to-br from-[color:oklch(0.23_0.026_76)] to-[color:oklch(0.16_0.02_76)] shadow-[0_24px_80px_oklch(0.18_0.018_76_/_0.18)]
raw-lab-sample → absolute inset-0 overflow-hidden
raw-lab-sample-photo → absolute inset-0 (keep existing decorative gradient background)
raw-lab-sample-finish → absolute inset-0 (keep existing clip-path and gradient)
raw-lab-upload-dock → absolute left-1/2 bottom-[clamp(52px,7vw,78px)] z-[5] flex min-w-[min(320px,calc(100%-36px))] items-center gap-3 rounded-lg border border-[color:oklch(0.96_0.012_86_/_0.36)] px-[13px] py-[11px] bg-[color:oklch(0.16_0.018_76_/_0.84)] text-[color:--color-raw-hero-ink] cursor-pointer -translate-x-1/2 focus-visible:outline-2 focus-visible:outline-[color:--color-raw-green] focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60
raw-lab-upload-icon → grid size-[34px] shrink-0 place-items-center rounded-[5px] bg-[color:--color-raw-green] text-[color:--color-raw-ink] font-extrabold
raw-lab-upload-copy strong → block text-[0.86rem] leading-tight
raw-lab-upload-copy span → block mt-[3px] text-[0.72rem] leading-snug text-[color:oklch(0.9_0.016_86)]
```

- [ ] **Step 2: Verify**

Run: `pnpm build`

---

### Task 12: Migrate remaining raw-lab classes — sweep pass

**Files:**
- Modify: All files still referencing `.raw-*` classes

- [ ] **Step 1: Find all remaining `.raw-*` class references**

Run: `grep -rn "raw-" src/modules/raw-processor/ --include="*.tsx" --include="*.ts" | grep -v "\.test\." | grep -v "raw-lab.css" | grep -v "data-raw"`

- [ ] **Step 2: Migrate each remaining reference**

Common remaining classes and their Tailwind equivalents:

```
raw-tool-note → m-0 text-[0.72rem] leading-snug text-[color:--color-raw-ink-soft]
raw-tool-reset-button → inline-flex mt-2.5 h-[34px] w-fit max-w-full items-center justify-center gap-1.5 rounded-lg border border-[color:oklch(0.68_0.042_78_/_0.74)] bg-[color:oklch(0.902_0.034_82_/_0.9)] px-[11px] py-1.5 text-[0.72rem] font-semibold leading-tight text-[color:--color-raw-ink-soft] transition-all duration-160 ease-[cubic-bezier(0.22,1,0.36,1)] hover:not-disabled:-translate-y-px hover:not-disabled:border-[color:oklch(0.56_0.12_153_/_0.42)] hover:not-disabled:bg-[color:oklch(0.882_0.046_82)] hover:not-disabled:text-[color:--color-raw-green-deep] focus-visible:outline-2 focus-visible:outline-[color:--color-raw-green] focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50

raw-tool-stack → contain-paint min-h-0 overflow-y-auto pr-0.5
raw-tool-stack-desktop → (responsive visibility handled by Tailwind)

raw-lab-shell → grid grid-cols-[minmax(0,1fr)_minmax(var(--spacing-raw-panel-width),var(--spacing-raw-panel-max-width))] min-w-0 min-h-0 overflow-hidden
```

Scrollbar classes (`.raw-tool-stack::-webkit-scrollbar-*`, etc.) → Move to a Tailwind `@utility` or inline style. The scrollbar styling uses custom properties; keep them in raw-lab.css for now and address in the final removal task.

Histogram canvas SVG classes → Keep as-is (they're for SVG rendering, not layout).

Compare handle classes → Keep as-is (WebGL-dependent, excluded from this plan).

- [ ] **Step 3: Verify build**

Run: `pnpm build`

---

### Task 13: Delete raw-lab.css and remove import

**Files:**
- Delete: `src/modules/raw-processor/raw-lab.css`
- Modify: `src/modules/raw-processor/RawProcessorView.tsx` (remove `import './raw-lab.css'`)

- [ ] **Step 1: Verify zero `.raw-*` class references remain in TSX/TS files**

Run: `grep -rn "raw-" src/modules/raw-processor/ --include="*.tsx" --include="*.ts" | grep -v "data-raw"`

Expected: Only `data-raw-*` attribute references remain (these are data attributes for state selectors, not CSS classes). Any remaining `.raw-*` CSS class references must be migrated first.

- [ ] **Step 2: Remove the import**

In `RawProcessorView.tsx`, remove line:
```tsx
import './raw-lab.css'
```

- [ ] **Step 3: Delete the file**

Run: `rm src/modules/raw-processor/raw-lab.css`

- [ ] **Step 4: Handle scrollbar styling**

The scrollbar styles from raw-lab.css need to move. Add a `@utility` in `tailwind.css`:

```css
@utility raw-scrollbar {
  scrollbar-color: var(--color-raw-scrollbar-thumb) transparent;
  scrollbar-width: thin;
  &::-webkit-scrollbar { width: 10px; }
  &::-webkit-scrollbar-track { background: transparent; }
  &::-webkit-scrollbar-thumb {
    min-height: 44px;
    border: 3px solid transparent;
    border-radius: 999px;
    background: var(--color-raw-scrollbar-thumb);
    background-clip: content-box;
  }
  &::-webkit-scrollbar-thumb:hover { background: var(--color-raw-scrollbar-thumb-hover); background-clip: content-box; }
  &::-webkit-scrollbar-corner { background: transparent; }
}
```

Replace remaining `raw-tool-stack` scrollbar references with this utility class.

- [ ] **Step 5: Remove unused mobile-responsive classes**

Check: the `@media (max-width: 980px)` and `@media (max-width: 640px)` breakpoints in raw-lab.css contain layout changes that must have Tailwind equivalents applied. Verify by checking the responsive `@` variants in the Tailwind classes on the migrated components.

- [ ] **Step 6: Verify full build**

Run: `pnpm typecheck && pnpm lint && pnpm build`

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(raw): migrate from raw-lab.css to unified Tailwind + Radix UI"
```

---

### Task 14: Responsive verification and polish

**Files:**
- All modified files

- [ ] **Step 1: Desktop layout verification (1440px+)**

Checklist:
- [ ] `.raw-lab-shell` grid: preview stage takes remaining width, tool panel is 340-400px
- [ ] Tool panel scrolls internally when content overflows, not the page
- [ ] Export section is sticky at panel bottom
- [ ] Tone section collapses/expands with animation
- [ ] Topbar is compact, no overflow
- [ ] No global footer visible on `/raw`
- [ ] `document.scrollingElement.scrollHeight` does not exceed viewport height

- [ ] **Step 2: Tablet verification (720-980px)**

Checklist:
- [ ] Preview stage + controls stack vertically (grid switches to single column)
- [ ] Tool panel becomes bottom surface, not sidebar
- [ ] Export remains accessible

- [ ] **Step 3: Mobile verification (≤640px)**

Checklist:
- [ ] Bottom rail visible with 2 tabs
- [ ] Tapping a tab opens corresponding sheet
- [ ] Sheet drag to dismiss works
- [ ] Long-press on Export tab triggers export
- [ ] Preview stays visible when sheet is open
- [ ] Safe area insets respected on notched devices

- [ ] **Step 4: Run full verification suite**

```bash
pnpm lint
pnpm test:run
pnpm build
```

---

### Task 15: Final commit and review prep

- [ ] **Step 1: Verify git status is clean**

Run: `git status`

- [ ] **Step 2: Run pre-commit checks**

```bash
pnpm lint
pnpm test:run
pnpm typecheck
pnpm build
```

Expected: All pass.

- [ ] **Step 3: Commit all remaining changes**

```bash
git add -A
git commit -m "feat(raw): reorganize tool panel with progressive disclosure, unify design system"
```

---

## Verification Checklist

Before marking complete, verify:

- [ ] `raw-lab.css` file is deleted
- [ ] Zero `.raw-*` CSS class references remain in any `.tsx`/`.ts` file (except `data-raw-*` attributes)
- [ ] All RAW Lab UI renders correctly at desktop (1440px), tablet (900px), mobile (390px)
- [ ] Tool panel shows Phase 1 (LUT + Intensity) always visible
- [ ] Tone section expands/collapses via disclosure trigger
- [ ] Export section is sticky at panel bottom
- [ ] Mobile rail has 2 tabs: Look (LUT + Intensity + Tone) and Export
- [ ] `pnpm lint` passes
- [ ] `pnpm test:run` passes
- [ ] `pnpm typecheck` passes
- [ ] `pnpm build` succeeds
- [ ] Compare split interaction still works (no WebGL changes made)
- [ ] Export capability gates still enforced
