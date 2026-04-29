# RAW Lab App Shell And Tool Surface Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply a corrective second-pass refactor to the already implemented RAW Lab redesign so `/raw` becomes a non-scrolling viewport app surface with a materially rebuilt, task-grouped RAW finishing tool surface.

**Architecture:** Keep the existing compare preview and RAW processing pipeline unless a regression is found. Refactor the route shell, responsive CSS, and right-rail or bottom-sheet tool surface around the revised design spec at `docs/specs/2026-04-28-raw-lab-ui-redesign-design.md`. `$impeccable` product-register review is a required design driver, not a final polish pass.

**Tech Stack:** React 19, React Router, Jotai, Motion, Tailwind CSS v4, OKLCH CSS, Vitest, Testing Library, Chrome DevTools visual validation.

## Scope Boundary

This is an additive follow-up plan. Do not edit or rewrite `docs/plans/2026-04-28-raw-lab-ui-redesign-implementation-plan.md`; that plan already describes the first completed implementation pass.

This plan targets the dissatisfaction found after that pass:

- Desktop `/raw` should fit the viewport and should not expose a footer or dead document area below the lab.
- Mobile `/raw` should keep the preview visible and expose controls through a pull-up or sticky tool surface rather than document scrolling.
- The former `ControlsPanel` visual language should not remain the production surface. Replacing or splitting it is preferred when it improves hierarchy, texture, and readability.

## Impeccable Design Gate

Before editing UI code, run the work as a product design correction:

- Register: product.
- Physical scene: a photographer reviews one RAW on a laptop or tablet in a quiet desk or travel setting, trying to finish a trustworthy JPEG without opening a professional grading suite.
- Color strategy: restrained. Warm lab-paper surfaces, darkroom image depth, Lab Green for primary actions, amber only for color-contract explanation.
- Use browser review during implementation, not after. Passing unit tests is not sufficient if the rail or sheet still reads as the old sidebar.
- Do not preserve `ControlsPanel` only because it already passes tests. The new tool surface should be allowed to replace component boundaries.

## File Structure

- Create: `src/App.test.tsx`
  - Tests that common site chrome is hidden on `/raw`.
- Modify: `src/App.tsx`
  - Exports a small footer route predicate and hides the footer on `/raw`.
- Modify: `src/modules/raw-processor/RawProcessorView.tsx`
  - Adds explicit viewport-shell data attributes, owns mobile sheet state, and renders the new tool surface instead of the legacy panel stack.
- Modify: `src/modules/raw-processor/raw-lab.css`
  - Converts `/raw` to a fixed viewport app shell with internal overflow only. Adds desktop rail, tablet drawer, and mobile pull-up sheet styling.
- Create: `src/modules/raw-processor/components/RawToolSurface.tsx`
  - Coordinates desktop rail and mobile sheet presentation for all RAW finishing tools.
- Create: `src/modules/raw-processor/components/tools/ToolSection.tsx`
  - Shared section shell for the tool surface. It is not a card and should avoid nested-card styling.
- Create: `src/modules/raw-processor/components/tools/FinishTool.tsx`
  - Built-in looks and strength control.
- Create: `src/modules/raw-processor/components/tools/StrengthControl.tsx`
  - Segmented or stepped strength control that replaces loose chip styling.
- Create: `src/modules/raw-processor/components/tools/CompareTool.tsx`
  - Split reset and short guidance only.
- Create: `src/modules/raw-processor/components/tools/LutContractTool.tsx`
  - Custom `.cube` upload, profile search, resolved input and output contract, unsupported-output explanation.
- Create: `src/modules/raw-processor/components/tools/ExportTool.tsx`
  - Full-resolution JPEG state, capability reason, progress affordance, and export action.
- Create: `src/modules/raw-processor/components/tools/FileFactsTool.tsx`
  - Compact camera, dimensions, support level, and timing facts.
- Create: `src/modules/raw-processor/components/tools/lut-contract.ts`
  - Moves LUT contract helper functions out of the old panel file.
- Modify: `src/modules/raw-processor/components/index.ts`
  - Exports the new tool surface and removes the old render-path dependency.
- Modify: `src/modules/raw-processor/__tests__/raw-route-shell.test.tsx`
  - Locks viewport-shell markers and footer-free route intent.
- Modify: `src/modules/raw-processor/__tests__/workspace-ui.test.tsx`
  - Moves panel tests from old labels to new task grouping and disabled explanations.
- Create: `src/modules/raw-processor/components/RawToolSurface.test.tsx`
  - Tests tool grouping, mobile sheet toggling, and the absence of the legacy panel marker.

### Task 1: Hide Common Footer On The RAW App Route

**Files:**

- Create: `src/App.test.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Add the failing footer route predicate test**

Create `src/App.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest'

import { shouldShowAppFooter } from './App'

describe('shouldShowAppFooter', () => {
  it('hides document-page footer on app-like surfaces', () => {
    expect(shouldShowAppFooter('/')).toBe(false)
    expect(shouldShowAppFooter('/raw')).toBe(false)
    expect(shouldShowAppFooter('/raw/')).toBe(false)
  })

  it('keeps the footer on ordinary document routes', () => {
    expect(shouldShowAppFooter('/profiles')).toBe(true)
    expect(shouldShowAppFooter('/about')).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test and confirm the current behavior fails**

Run:

```bash
pnpm test:run src/App.test.tsx
```

Expected: FAIL because `shouldShowAppFooter` is not exported yet.

- [ ] **Step 3: Export the route predicate and use it in `App`**

Modify `src/App.tsx`:

```tsx
export function shouldShowAppFooter(pathname: string) {
  return pathname !== '/' && pathname !== '/raw' && pathname !== '/raw/'
}

export const App: FC = () => {
  const location = useLocation()
  const showFooter = shouldShowAppFooter(location.pathname)

  return (
    <RootProviders>
      <AppLayer />
      {showFooter && <Footer />}
    </RootProviders>
  )
}
```

- [ ] **Step 4: Run the focused test**

Run:

```bash
pnpm test:run src/App.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "fix: hide footer on raw lab route"
```

### Task 2: Lock The Viewport App Shell Contract

**Files:**

- Modify: `src/modules/raw-processor/RawProcessorView.tsx`
- Modify: `src/modules/raw-processor/raw-lab.css`
- Modify: `src/modules/raw-processor/__tests__/raw-route-shell.test.tsx`

- [ ] **Step 1: Add route-shell assertions for the corrected app shell**

Append to `src/modules/raw-processor/__tests__/raw-route-shell.test.tsx`:

```tsx
it('marks raw lab as a viewport app surface', () => {
  mockedUseCapabilityGate.mockReturnValue({
    ready: true,
    supportStatus: 'supported',
    reason: null,
  })

  const { container } = render(<RawProcessorView />)
  const shell = container.querySelector('[data-raw-lab-shell="viewport"]')
  const layout = container.querySelector('[data-raw-lab-layout="stage-tools"]')

  expect(shell).toHaveClass('raw-lab')
  expect(shell).toHaveAttribute('data-raw-lab-state', 'empty')
  expect(layout).toHaveClass('raw-lab-shell')
})
```

- [ ] **Step 2: Run the shell test and confirm it fails**

Run:

```bash
pnpm test:run src/modules/raw-processor/__tests__/raw-route-shell.test.tsx
```

Expected: FAIL because the data attributes do not exist yet.

- [ ] **Step 3: Add explicit shell attributes in `RawProcessorView`**

Change the root and shell elements:

```tsx
return (
  <div
    className={clsxm('raw-lab', className)}
    data-raw-lab-shell="viewport"
    data-raw-lab-state={hasImage ? 'loaded' : 'empty'}
  >
    <WorkspaceHeader
      fileName={sourceFileName}
      hasImage={hasImage}
      supportLevel={supportLevel}
      canExport={canExport}
      disabledReason={exportDisabledReason}
      onReplaceFile={handleReplaceFile}
      onResetSession={reset}
      onOpenExport={() =>
        handleExport({ quality: 'high', fidelity: 'balanced' })
      }
    />

    <div className="raw-lab-shell" data-raw-lab-layout="stage-tools">
      {/* existing stage and temporary controls remain until Task 5 */}
    </div>
  </div>
)
```

- [ ] **Step 4: Replace document-flow layout rules with viewport rules**

In `src/modules/raw-processor/raw-lab.css`, update the shell foundation:

```css
.raw-lab {
  --raw-paper: oklch(0.964 0.018 86);
  --raw-paper-low: oklch(0.918 0.026 86);
  --raw-paper-warm: oklch(0.9 0.034 82);
  --raw-ink: oklch(0.18 0.018 76);
  --raw-ink-soft: oklch(0.38 0.032 75);
  --raw-hairline: oklch(0.74 0.035 78);
  --raw-green: oklch(0.59 0.15 153);
  --raw-green-deep: oklch(0.37 0.105 155);
  --raw-amber: oklch(0.78 0.16 63);
  --raw-dark: oklch(0.18 0.02 76);
  --raw-hero-ink: oklch(0.97 0.014 86);
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  height: 100svh;
  min-height: 0;
  overflow: hidden;
  background:
    linear-gradient(180deg, var(--raw-paper), var(--raw-paper-low)),
    var(--raw-paper);
  color: var(--raw-ink);
}

.raw-lab-shell {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(340px, 400px);
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.raw-lab-stage {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.raw-lab-stage-frame {
  height: 100%;
  min-height: 0;
}
```

- [ ] **Step 5: Replace tablet and mobile document-flow rules**

Replace the current `max-width: 980px` and `max-width: 640px` layout blocks with app-shell rules:

```css
@media (max-width: 980px) {
  .raw-lab {
    grid-template-rows: auto minmax(0, 1fr);
  }

  .raw-lab-shell {
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
    grid-template-columns: minmax(0, 1fr);
    overflow: hidden;
  }

  .raw-lab-controls {
    max-height: min(42svh, 390px);
    overflow-y: auto;
    border-top: 1px solid var(--raw-hairline);
    border-left: 0;
  }
}

@media (max-width: 640px) {
  .raw-lab-topbar {
    min-height: 76px;
    align-items: flex-start;
  }

  .raw-lab-stage {
    padding: 8px;
  }

  .raw-lab-controls {
    max-height: 38svh;
  }
}
```

- [ ] **Step 6: Run the focused tests**

Run:

```bash
pnpm test:run src/App.test.tsx src/modules/raw-processor/__tests__/raw-route-shell.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx src/App.test.tsx src/modules/raw-processor/RawProcessorView.tsx src/modules/raw-processor/raw-lab.css src/modules/raw-processor/__tests__/raw-route-shell.test.tsx
git commit -m "fix: make raw lab a viewport app shell"
```

### Task 3: Define The New Tool Surface With Tests First

**Files:**

- Create: `src/modules/raw-processor/components/RawToolSurface.test.tsx`
- Modify: `src/modules/raw-processor/__tests__/workspace-ui.test.tsx`

- [ ] **Step 1: Create the focused tool-surface test**

Create `src/modules/raw-processor/components/RawToolSurface.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { RawToolSurface } from './RawToolSurface'

const baseProps = {
  presetOptions: [
    { id: 'neutral', name: 'Neutral' },
    { id: 'warm', name: 'Warm' },
  ],
  activePresetId: 'neutral',
  activeIntensity: 'standard' as const,
  onPresetSelect: vi.fn(),
  onIntensitySelect: vi.fn(),
  onCompareReset: vi.fn(),
  onLutLoad: vi.fn(),
  onLutClear: vi.fn(),
  onLutProfileSelect: vi.fn(),
  onExport: vi.fn(),
  canExport: false,
  disabledReason: 'Full-resolution export source is still loading.',
  isProcessing: false,
  hasImage: false,
  currentLutName: null,
  lutProfileSelection: null,
  lutProfileResolution: null,
  supportLevel: 'experimental' as const,
  metadata: null,
  stats: null,
}

describe('RawToolSurface', () => {
  it('groups controls as a RAW finishing surface instead of a legacy panel', () => {
    const { container } = render(<RawToolSurface {...baseProps} />)

    expect(
      container.querySelector('[data-raw-panel="controls"]'),
    ).not.toBeInTheDocument()
    expect(
      container.querySelector('[data-raw-tool-surface="raw-finishing"]'),
    ).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Finish' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Strength' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Compare' })).toBeInTheDocument()
    expect(
      screen.getByRole('region', { name: 'LUT contract' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Export' })).toBeInTheDocument()
    expect(
      screen.getByRole('region', { name: 'File facts' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Choose a RAW to activate looks.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Full-resolution export source is still loading.'),
    ).toBeInTheDocument()
  })

  it('opens and closes the mobile tool sheet without relying on page scroll', async () => {
    const user = userEvent.setup()
    render(<RawToolSurface {...baseProps} />)

    const toggle = screen.getByRole('button', { name: 'RAW tools' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })
})
```

- [ ] **Step 2: Move existing panel tests toward task grouping**

In `src/modules/raw-processor/__tests__/workspace-ui.test.tsx`, keep LUT behavior tests but change the top-level panel expectations so they render `RawToolSurface` and assert task regions instead of `Builtin looks` plus old divider flow.

Replace the component import and props helper:

```tsx
import { RawToolSurface } from '../components/RawToolSurface'

function rawToolSurfaceProps(
  overrides: Partial<ComponentProps<typeof RawToolSurface>> = {},
): ComponentProps<typeof RawToolSurface> {
  return {
    presetOptions: [
      { id: 'neutral', name: 'Neutral' },
      { id: 'warm', name: 'Warm' },
    ],
    activePresetId: 'neutral',
    activeIntensity: 'standard',
    onPresetSelect: () => {},
    onIntensitySelect: () => {},
    onCompareReset: () => {},
    onLutLoad: () => {},
    onLutClear: () => {},
    onLutProfileSelect: () => {},
    onExport: () => {},
    canExport: false,
    disabledReason: 'Full-resolution export source is still loading.',
    isProcessing: false,
    hasImage: true,
    currentLutName: null,
    lutProfileSelection: null,
    lutProfileResolution: null,
    supportLevel: 'experimental',
    metadata: null,
    stats: null,
    ...overrides,
  }
}
```

Use this replacement for the old `shows finite intensity choices and no pro controls` test:

```tsx
it('presents task-grouped RAW finishing tools', () => {
  render(<RawToolSurface {...rawToolSurfaceProps()} />)

  expect(screen.getByRole('region', { name: 'Finish' })).toBeInTheDocument()
  expect(screen.getByRole('region', { name: 'Strength' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Neutral' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Standard' })).toBeInTheDocument()
  expect(screen.queryByText('Exposure')).not.toBeInTheDocument()
  expect(screen.queryByText('Log Space')).not.toBeInTheDocument()
})
```

- [ ] **Step 3: Run the focused tests and confirm they fail**

Run:

```bash
pnpm test:run src/modules/raw-processor/components/RawToolSurface.test.tsx src/modules/raw-processor/__tests__/workspace-ui.test.tsx
```

Expected: FAIL because `RawToolSurface` and its test helper do not exist yet.

- [ ] **Step 4: Commit the failing tests**

```bash
git add src/modules/raw-processor/components/RawToolSurface.test.tsx src/modules/raw-processor/__tests__/workspace-ui.test.tsx
git commit -m "test: define raw lab tool surface contract"
```

### Task 4: Replace The Legacy Panel With Task-Level Tool Components

**Files:**

- Create: `src/modules/raw-processor/components/RawToolSurface.tsx`
- Create: `src/modules/raw-processor/components/tools/ToolSection.tsx`
- Create: `src/modules/raw-processor/components/tools/FinishTool.tsx`
- Create: `src/modules/raw-processor/components/tools/StrengthControl.tsx`
- Create: `src/modules/raw-processor/components/tools/CompareTool.tsx`
- Create: `src/modules/raw-processor/components/tools/LutContractTool.tsx`
- Create: `src/modules/raw-processor/components/tools/ExportTool.tsx`
- Create: `src/modules/raw-processor/components/tools/FileFactsTool.tsx`
- Create: `src/modules/raw-processor/components/tools/lut-contract.ts`
- Modify: `src/modules/raw-processor/components/index.ts`
- Modify: `src/modules/raw-processor/components/ControlsPanel.tsx`

- [ ] **Step 1: Create the shared tool section primitive**

Create `src/modules/raw-processor/components/tools/ToolSection.tsx`:

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
        <h2>{title}</h2>
        {eyebrow && <p>{eyebrow}</p>}
      </div>
      {children}
    </section>
  )
}
```

- [ ] **Step 2: Create the strength control**

Create `src/modules/raw-processor/components/tools/StrengthControl.tsx`:

```tsx
const LEVELS = ['off', 'light', 'standard', 'strong'] as const

export type StrengthLevel = (typeof LEVELS)[number]

const LABELS: Record<StrengthLevel, string> = {
  off: 'Off',
  light: 'Light',
  standard: 'Standard',
  strong: 'Strong',
}

export function StrengthControl({
  value,
  onChange,
  disabled,
}: {
  value: StrengthLevel
  onChange: (value: StrengthLevel) => void
  disabled: boolean
}) {
  return (
    <div className="raw-strength-control" role="group" aria-label="Strength">
      {LEVELS.map((level) => (
        <button
          key={level}
          type="button"
          aria-pressed={value === level}
          disabled={disabled}
          onClick={() => onChange(level)}
        >
          {LABELS[level]}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Create the finish and compare tools**

Create `src/modules/raw-processor/components/tools/FinishTool.tsx`:

```tsx
import { ToolSection } from './ToolSection'

export function FinishTool({
  presetOptions,
  activePresetId,
  disabled,
  onPresetSelect,
}: {
  presetOptions: Array<{ id: string; name: string }>
  activePresetId: string | null
  disabled: boolean
  onPresetSelect: (id: string) => void
}) {
  return (
    <ToolSection title="Finish" eyebrow="Look">
      <div className="raw-finish-grid">
        {presetOptions.map((preset) => (
          <button
            key={preset.id}
            type="button"
            aria-pressed={activePresetId === preset.id}
            disabled={disabled}
            onClick={() => onPresetSelect(preset.id)}
          >
            <span>{preset.name}</span>
          </button>
        ))}
      </div>
      {disabled && (
        <p className="raw-tool-note">Choose a RAW to activate looks.</p>
      )}
    </ToolSection>
  )
}
```

Create `src/modules/raw-processor/components/tools/CompareTool.tsx`:

```tsx
import { Button } from '~/components/ui/button'

import { ToolSection } from './ToolSection'

export function CompareTool({
  disabled,
  onCompareReset,
}: {
  disabled: boolean
  onCompareReset: () => void
}) {
  return (
    <ToolSection title="Compare" eyebrow="Split">
      <p className="raw-tool-note">Drag the split directly on the image.</p>
      <Button
        variant="secondary"
        size="sm"
        disabled={disabled}
        onClick={onCompareReset}
      >
        Reset compare view
      </Button>
    </ToolSection>
  )
}
```

- [ ] **Step 4: Move LUT helper logic into `tools/lut-contract.ts`**

Move these helpers out of `src/modules/raw-processor/components/ControlsPanel.tsx` and into `src/modules/raw-processor/components/tools/lut-contract.ts`:

```tsx
export {
  getProfileContractLabel,
  getProfileGroupLabel,
  getProfileOutputLabel,
  getResolvedProfile,
  groupProfiles,
  hasDisplayLikeInput,
  toSelectableContract,
}
```

The moved functions should keep the same bodies and imports from `~/lib/color/registry`.

- [ ] **Step 5: Create `LutContractTool`**

Create `src/modules/raw-processor/components/tools/LutContractTool.tsx` by moving `LUTProfileButton`, `LUTProfileSelector`, and `LUTProfileStatus` from the old panel, then wrapping them in:

```tsx
export function LutContractTool({
  currentLutName,
  disabled,
  onLutLoad,
  onLutClear,
  lutProfileSelection,
  lutProfileResolution,
  onLutProfileSelect,
}: {
  currentLutName?: string | null
  disabled: boolean
  onLutLoad: (files: File[]) => void
  onLutClear: () => void
  lutProfileSelection?: LUTProfileSelectionState | null
  lutProfileResolution?: LUTProfileResolution | null
  onLutProfileSelect: (profile: LUTColorProfile) => void
}) {
  return (
    <ToolSection title="LUT contract" eyebrow="Color">
      <LutDropzone
        onFileDrop={onLutLoad}
        currentLut={currentLutName}
        onClear={onLutClear}
        disabled={disabled}
      />
      {currentLutName ? (
        <LUTProfileStatus
          key={lutProfileSelection?.fingerprint ?? currentLutName}
          selection={lutProfileSelection}
          resolution={lutProfileResolution}
          onSelect={onLutProfileSelect}
        />
      ) : (
        <p className="raw-tool-note">
          Add a `.cube` LUT only when its input and output contract is known.
        </p>
      )}
    </ToolSection>
  )
}
```

- [ ] **Step 6: Create `ExportTool` and `FileFactsTool`**

Create `src/modules/raw-processor/components/tools/ExportTool.tsx`:

```tsx
import { Button } from '~/components/ui/button'

import { ToolSection } from './ToolSection'

export function ExportTool({
  canExport,
  disabledReason,
  isProcessing,
  onExport,
}: {
  canExport: boolean
  disabledReason: string
  isProcessing: boolean
  onExport: (options: {
    quality: 'standard' | 'high'
    fidelity: 'safe' | 'balanced' | 'max'
  }) => void
}) {
  return (
    <ToolSection title="Export" eyebrow="Full-res JPEG">
      <Button
        variant="primary"
        size="sm"
        className="w-full"
        disabled={!canExport || isProcessing}
        onClick={() => onExport({ quality: 'high', fidelity: 'balanced' })}
      >
        Export full-resolution JPEG
      </Button>
      <p className="raw-tool-note">
        {canExport
          ? 'Exports from the LibRaw processed-window path.'
          : disabledReason}
      </p>
    </ToolSection>
  )
}
```

Create `src/modules/raw-processor/components/tools/FileFactsTool.tsx`:

```tsx
import { ToolSection } from './ToolSection'

export function FileFactsTool({
  supportLevel,
  metadata,
  stats,
}: {
  supportLevel: 'official' | 'experimental'
  metadata: null | {
    make?: string
    model?: string
    lens?: string
    iso?: number
    aperture?: number
    focalLength?: number
    shutterSpeed?: string
    width: number
    height: number
  }
  stats: null | {
    processTime: number
    inputSize: { width: number; height: number }
    previewSize: { width: number; height: number }
  }
}) {
  const facts = [
    { label: 'Support', value: supportLevel },
    metadata && {
      label: 'Camera',
      value: `${metadata.make || ''} ${metadata.model || ''}`.trim(),
    },
    metadata && {
      label: 'Size',
      value: `${metadata.width} x ${metadata.height}`,
    },
    stats && {
      label: 'Preview',
      value: `${stats.previewSize.width} x ${stats.previewSize.height}`,
    },
    stats && { label: 'Render', value: `${Math.round(stats.processTime)} ms` },
  ].filter(Boolean) as Array<{ label: string; value?: string | number }>

  return (
    <ToolSection title="File facts">
      <dl className="raw-file-facts">
        {facts.map((fact) => (
          <div key={fact.label}>
            <dt>{fact.label}</dt>
            <dd>{fact.value || 'Not loaded'}</dd>
          </div>
        ))}
      </dl>
    </ToolSection>
  )
}
```

- [ ] **Step 7: Create `RawToolSurface`**

Create `src/modules/raw-processor/components/RawToolSurface.tsx`:

```tsx
import type { ComponentProps } from 'react'
import { useState } from 'react'

import type { LUTColorProfile } from '~/lib/color/registry'
import type { LUTProfileResolution } from '~/lib/gl/pipeline'

import type { LUTProfileSelectionState } from '../model/session'
import { CompareTool } from './tools/CompareTool'
import { ExportTool } from './tools/ExportTool'
import { FileFactsTool } from './tools/FileFactsTool'
import { FinishTool } from './tools/FinishTool'
import { LutContractTool } from './tools/LutContractTool'
import { StrengthControl, type StrengthLevel } from './tools/StrengthControl'
import { ToolSection } from './tools/ToolSection'

export function RawToolSurface(props: {
  presetOptions: Array<{ id: string; name: string }>
  activePresetId: string | null
  activeIntensity: StrengthLevel
  onPresetSelect: (id: string) => void
  onIntensitySelect: (level: StrengthLevel) => void
  onCompareReset: () => void
  onLutLoad: (files: File[]) => void
  onLutClear: () => void
  onLutProfileSelect: (profile: LUTColorProfile) => void
  onExport: (options: {
    quality: 'standard' | 'high'
    fidelity: 'safe' | 'balanced' | 'max'
  }) => void
  canExport: boolean
  disabledReason: string
  isProcessing: boolean
  hasImage: boolean
  currentLutName?: string | null
  lutProfileSelection?: LUTProfileSelectionState | null
  lutProfileResolution?: LUTProfileResolution | null
  supportLevel: 'official' | 'experimental'
  metadata: ComponentProps<typeof FileFactsTool>['metadata']
  stats: ComponentProps<typeof FileFactsTool>['stats']
}) {
  const [open, setOpen] = useState(false)
  const disabled = !props.hasImage || props.isProcessing

  return (
    <aside
      className="raw-lab-controls raw-tool-surface"
      data-raw-tool-surface="raw-finishing"
      data-raw-tool-sheet={open ? 'open' : 'closed'}
      aria-label="RAW finishing controls"
    >
      <button
        type="button"
        className="raw-tool-sheet-toggle"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        RAW tools
      </button>

      <div className="raw-tool-stack">
        <FinishTool
          presetOptions={props.presetOptions}
          activePresetId={props.activePresetId}
          disabled={disabled}
          onPresetSelect={props.onPresetSelect}
        />
        <ToolSection title="Strength">
          <StrengthControl
            value={props.activeIntensity}
            onChange={props.onIntensitySelect}
            disabled={disabled}
          />
        </ToolSection>
        <CompareTool
          disabled={disabled}
          onCompareReset={props.onCompareReset}
        />
        <LutContractTool
          currentLutName={props.currentLutName}
          disabled={disabled}
          onLutLoad={props.onLutLoad}
          onLutClear={props.onLutClear}
          lutProfileSelection={props.lutProfileSelection}
          lutProfileResolution={props.lutProfileResolution}
          onLutProfileSelect={props.onLutProfileSelect}
        />
        <ExportTool
          canExport={props.canExport}
          disabledReason={props.disabledReason}
          isProcessing={props.isProcessing}
          onExport={props.onExport}
        />
        <FileFactsTool
          supportLevel={props.supportLevel}
          metadata={props.metadata}
          stats={props.stats}
        />
      </div>
    </aside>
  )
}
```

- [ ] **Step 8: Remove the old render-path panel export**

In `src/modules/raw-processor/components/index.ts`, export `RawToolSurface` and tool modules. Keep `ControlsPanel` exported only until no tests import it. After migrating tests, remove `ControlsPanel` from the render path.

- [ ] **Step 9: Run the focused tests**

Run:

```bash
pnpm test:run src/modules/raw-processor/components/RawToolSurface.test.tsx src/modules/raw-processor/__tests__/workspace-ui.test.tsx
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/modules/raw-processor/components src/modules/raw-processor/__tests__/workspace-ui.test.tsx
git commit -m "feat: rebuild raw lab tool surface"
```

### Task 5: Wire The New Tool Surface Into The RAW View

**Files:**

- Modify: `src/modules/raw-processor/RawProcessorView.tsx`
- Modify: `src/modules/raw-processor/components/index.ts`
- Modify: `src/modules/raw-processor/__tests__/raw-route-shell.test.tsx`
- Modify: `src/modules/raw-processor/__tests__/workspace-ui.test.tsx`

- [ ] **Step 1: Replace legacy imports in `RawProcessorView`**

Remove `ControlsPanel`, `MetadataPanel`, and `StatsPanel` from the component import list. Import `RawToolSurface`.

- [ ] **Step 2: Build compact metadata and stats props near render**

Add before `return`:

```tsx
const toolMetadata = loadedImage.metadata
  ? {
      ...loadedImage.metadata,
      width: decodedImageRef.current?.width ?? loadedImage.metadata.width,
      height: decodedImageRef.current?.height ?? loadedImage.metadata.height,
    }
  : null

const toolStats = stats
  ? {
      processTime: stats.processTime,
      inputSize: stats.inputSize,
      previewSize: stats.previewSize,
    }
  : null
```

- [ ] **Step 3: Render `RawToolSurface` instead of the old aside stack**

Replace the existing `<aside className="raw-lab-controls">` block with:

```tsx
<RawToolSurface
  presetOptions={presetOptions.map(({ id, name }) => ({ id, name }))}
  activePresetId={activePresetId}
  activeIntensity={activeIntensity}
  onPresetSelect={(id) =>
    selectBuiltinStyle(id as (typeof presetOptions)[number]['id'])
  }
  onIntensitySelect={selectIntensityLevel}
  onCompareReset={handleCompareReset}
  onLutLoad={handleLutDrop}
  onLutClear={clearLUT}
  currentLutName={currentLutName}
  lutProfileSelection={lutProfileSelection}
  lutProfileResolution={
    activeStyle?.kind === 'custom'
      ? activeStyle.lutAsset?.profileResolution
      : null
  }
  onLutProfileSelect={selectLUTProfile}
  onExport={handleExport}
  canExport={canExport}
  disabledReason={exportDisabledReason}
  isProcessing={isProcessing}
  hasImage={hasImage}
  supportLevel={supportLevel}
  metadata={toolMetadata}
  stats={toolStats}
/>
```

- [ ] **Step 4: Add route-level assertion that legacy panel is absent**

Append to `src/modules/raw-processor/__tests__/raw-route-shell.test.tsx`:

```tsx
it('uses the rebuilt raw tool surface on the route', () => {
  mockedUseCapabilityGate.mockReturnValue({
    ready: true,
    supportStatus: 'supported',
    reason: null,
  })

  const { container } = render(<RawProcessorView />)

  expect(
    container.querySelector('[data-raw-tool-surface="raw-finishing"]'),
  ).toBeInTheDocument()
  expect(
    container.querySelector('[data-raw-panel="controls"]'),
  ).not.toBeInTheDocument()
})
```

- [ ] **Step 5: Run the route and workspace tests**

Run:

```bash
pnpm test:run src/modules/raw-processor/__tests__/raw-route-shell.test.tsx src/modules/raw-processor/__tests__/workspace-ui.test.tsx src/modules/raw-processor/components/RawToolSurface.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/modules/raw-processor/RawProcessorView.tsx src/modules/raw-processor/components src/modules/raw-processor/__tests__/raw-route-shell.test.tsx src/modules/raw-processor/__tests__/workspace-ui.test.tsx
git commit -m "refactor: wire raw lab tool surface"
```

### Task 6: Give The Tool Surface Its Own Material System

**Files:**

- Modify: `src/modules/raw-processor/raw-lab.css`
- Modify: `src/modules/raw-processor/components/RawToolSurface.tsx`
- Modify: `src/modules/raw-processor/components/tools/*.tsx`

- [ ] **Step 1: Add raw tool surface CSS tokens and structure**

Add below the existing topbar styles in `src/modules/raw-processor/raw-lab.css`:

```css
.raw-tool-surface {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 12px;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border-left: 1px solid var(--raw-hairline);
  background:
    linear-gradient(180deg, oklch(0.942 0.024 86), oklch(0.91 0.03 84)),
    var(--raw-paper-low);
  padding: 14px;
}

.raw-tool-sheet-toggle {
  display: none;
}

.raw-tool-stack {
  min-height: 0;
  overflow-y: auto;
  padding-right: 2px;
}

.raw-tool-section {
  padding-block: 14px;
  border-bottom: 1px solid oklch(0.74 0.035 78 / 0.62);
}

.raw-tool-section:first-child {
  padding-top: 0;
}

.raw-tool-section:last-child {
  border-bottom: 0;
}

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

- [ ] **Step 2: Add finish, strength, and facts CSS**

Add:

```css
.raw-finish-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.raw-finish-grid button,
.raw-strength-control button {
  min-width: 0;
  border: 1px solid oklch(0.74 0.035 78 / 0.72);
  border-radius: 7px;
  background: oklch(0.964 0.018 86);
  color: var(--raw-ink-soft);
  font-size: 0.76rem;
  font-weight: 690;
}

.raw-finish-grid button {
  min-height: 42px;
  padding: 9px 10px;
  text-align: left;
}

.raw-finish-grid button[aria-pressed='true'],
.raw-strength-control button[aria-pressed='true'] {
  border-color: oklch(0.54 0.14 153);
  background: oklch(0.84 0.09 145);
  color: var(--raw-ink);
}

.raw-strength-control {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0;
  overflow: hidden;
  border: 1px solid oklch(0.74 0.035 78 / 0.72);
  border-radius: 8px;
}

.raw-strength-control button {
  min-height: 34px;
  border-width: 0 1px 0 0;
  border-radius: 0;
}

.raw-strength-control button:last-child {
  border-right: 0;
}

.raw-file-facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 12px;
  margin: 0;
}

.raw-file-facts div {
  min-width: 0;
}

.raw-file-facts dt {
  color: var(--raw-ink-soft);
  font-size: 0.68rem;
}

.raw-file-facts dd {
  margin: 2px 0 0;
  overflow: hidden;
  color: var(--raw-ink);
  font-size: 0.75rem;
  font-weight: 680;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

- [ ] **Step 3: Add mobile pull-up sheet behavior**

Replace mobile `.raw-lab-controls` rules with:

```css
@media (max-width: 980px) {
  .raw-tool-surface {
    border-top: 1px solid var(--raw-hairline);
    border-left: 0;
  }
}

@media (max-width: 640px) {
  .raw-tool-surface {
    position: relative;
    z-index: 8;
    max-height: 42svh;
    border-radius: 8px 8px 0 0;
    padding: 8px 10px max(10px, env(safe-area-inset-bottom));
    box-shadow: 0 -18px 40px oklch(0.18 0.018 76 / 0.18);
  }

  .raw-tool-sheet-toggle {
    display: flex;
    min-height: 38px;
    align-items: center;
    justify-content: center;
    border: 1px solid oklch(0.74 0.035 78 / 0.72);
    border-radius: 8px;
    background: oklch(0.964 0.018 86);
    color: var(--raw-ink);
    font-size: 0.78rem;
    font-weight: 760;
  }

  .raw-tool-stack {
    max-height: 0;
    overflow: hidden;
  }

  .raw-tool-surface[data-raw-tool-sheet='open'] .raw-tool-stack {
    max-height: calc(42svh - 52px);
    overflow-y: auto;
  }
}
```

- [ ] **Step 4: Remove leftover CSS that targets the old panel marker**

Delete rules that target:

```css
.raw-lab-controls [data-raw-panel="controls"]
```

and any descendant selectors under that marker.

- [ ] **Step 5: Run focused tests**

Run:

```bash
pnpm test:run src/modules/raw-processor/components/RawToolSurface.test.tsx src/modules/raw-processor/__tests__/workspace-ui.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/modules/raw-processor/raw-lab.css src/modules/raw-processor/components
git commit -m "style: polish raw lab tool surface"
```

### Task 7: Browser Verify The Design, Not Just The Tests

**Files:**

- No required source changes unless browser review exposes a defect.

- [ ] **Step 1: Start the dev server**

Run:

```bash
pnpm dev
```

Keep the server running for the browser checks.

- [ ] **Step 2: Desktop viewport check**

Use Chrome DevTools at a viewport around 1440 x 900 and open `/raw`.

Evaluate:

```js
;(() => {
  return {
    scrollHeight: document.scrollingElement.scrollHeight,
    innerHeight: window.innerHeight,
    footer: Boolean(document.querySelector('footer')),
    stage: document
      .querySelector('.raw-lab-stage-frame')
      ?.getBoundingClientRect(),
    tools: document
      .querySelector('[data-raw-tool-surface="raw-finishing"]')
      ?.getBoundingClientRect(),
  }
})()
```

Expected:

- `footer` is `false`.
- `scrollHeight` is not greater than `innerHeight`.
- Stage and tools are both visible.
- The right rail does not look like the previous card-with-dividers template.

- [ ] **Step 3: Tablet viewport check**

Use Chrome DevTools at a viewport around 900 x 900 and open `/raw`.

Evaluate the same snippet from Step 2.

Expected:

- Preview remains visible.
- Tool surface is anchored below or over the stage.
- Any overflow is inside the tool surface.

- [ ] **Step 4: Mobile viewport check**

Use Chrome DevTools at a viewport around 390 x 844 and open `/raw`.

Evaluate:

```js
;(() => {
  const stage = document
    .querySelector('.raw-lab-stage-frame')
    ?.getBoundingClientRect()
  const toggle = document.querySelector('.raw-tool-sheet-toggle')
  toggle?.click()
  const openStage = document
    .querySelector('.raw-lab-stage-frame')
    ?.getBoundingClientRect()
  const tools = document
    .querySelector('[data-raw-tool-surface="raw-finishing"]')
    ?.getBoundingClientRect()

  return {
    beforeStageVisible: Boolean(
      stage && stage.bottom > 96 && stage.top < window.innerHeight,
    ),
    afterStageVisible: Boolean(
      openStage && openStage.bottom > 96 && openStage.top < window.innerHeight,
    ),
    toolVisible: Boolean(tools && tools.bottom <= window.innerHeight + 1),
    footer: Boolean(document.querySelector('footer')),
    scrollHeight: document.scrollingElement.scrollHeight,
    innerHeight: window.innerHeight,
  }
})()
```

Expected:

- `beforeStageVisible` is `true`.
- `afterStageVisible` is `true`.
- `toolVisible` is `true`.
- `footer` is `false`.
- `scrollHeight` is not meaningfully greater than `innerHeight`.

- [ ] **Step 5: Impeccable review checkpoint**

Review the resulting desktop rail and mobile sheet against the `$impeccable` product rules:

- It uses familiar product UI controls and does not invent decorative affordances.
- It avoids nested cards, generic SaaS card stacks, glass effects, side-stripe accents, pure black, pure white, and purple gradients.
- It keeps the image as the primary object.
- It uses section labels and disabled reasons that are readable at working distance.
- It does not look like the old `ControlsPanel` with different spacing.

- [ ] **Step 6: Run the full focused verification set**

Run:

```bash
pnpm test:run src/App.test.tsx src/modules/raw-processor/__tests__/raw-route-shell.test.tsx src/modules/raw-processor/__tests__/workspace-ui.test.tsx src/modules/raw-processor/components/RawToolSurface.test.tsx src/modules/raw-processor/components/CompareSplitHandle.test.tsx src/modules/raw-processor/components/PreviewCanvas.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit any browser-driven corrections**

If browser review required source changes, commit them:

```bash
git add src/App.tsx src/modules/raw-processor src/styles
git commit -m "fix: finalize raw lab responsive surface"
```

If no source changes were required, record the browser evidence in the PR or final handoff rather than adding a no-op commit.

## Final Acceptance

- `/raw` has no common footer.
- Desktop `/raw` does not document-scroll in empty or loaded normal states.
- Mobile `/raw` keeps the preview visible before and after opening the tool surface.
- Controls are reachable through a rail, drawer, or pull-up surface with internal overflow only.
- The new tool surface is task-grouped as Finish, Strength, Compare, LUT contract, Export, and File facts.
- The old `data-raw-panel="controls"` surface is no longer in the route render path.
- Full-resolution export remains capability-gated and fail-closed.
- Compare preview semantics and `Unprocessed RAW` versus `Final JPEG` labels remain unchanged.
- `$impeccable` product design review is treated as a blocking acceptance gate.
