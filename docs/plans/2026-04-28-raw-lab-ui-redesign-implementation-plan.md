# RAW Lab UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/raw` into a single image-first RAW Lab workspace with upload inside the preview stage, draggable `Unprocessed RAW` versus `Final JPEG` comparison, and responsive desktop/tablet/mobile controls.

**Architecture:** Keep the current raw-processor module and reshape it around a persistent workspace shell. Add viewer-owned compare interaction components, extend the WebGL preview pipeline with compare uniforms, and keep full-resolution export capability gates unchanged. Product UI implementation must follow `PRODUCT.md`, `DESIGN.md`, and the `$impeccable` product-register rules.

**Tech Stack:** React 19, React Router, Jotai, Motion, Tailwind CSS v4, OKLCH CSS, WebGL2 shaders, Vitest, Testing Library, Chrome DevTools browser validation.

---

## File Structure

- Create: `src/modules/raw-processor/raw-lab.css`
  - Owns RAW Lab layout, color tokens, responsive rail/drawer behavior, compare sample art, and upload dock styling.
- Create: `src/modules/raw-processor/components/CompareSplitHandle.tsx`
  - Owns pointer, touch, and keyboard split-control interaction. Exports pure helpers for tests.
- Create: `src/modules/raw-processor/components/ComparePreviewStage.tsx`
  - Owns empty sample compare, loaded preview canvas placement, stage drop target, split handle, labels, and stage-local progress.
- Modify: `src/modules/raw-processor/components/PreviewCanvas.tsx`
  - Removes standalone empty copy and receives compare-capable `params`.
- Modify: `src/modules/raw-processor/components/Dropzone.tsx`
  - Exports RAW accept list and supports a stage variant without the large dashed upload-card style.
- Modify: `src/modules/raw-processor/components/ControlsPanel.tsx`
  - Keeps existing look, intensity, LUT, contract, and export logic but becomes usable as a desktop rail or mobile drawer.
- Modify: `src/modules/raw-processor/components/WorkspaceHeader.tsx`
  - Becomes a compact top bar that also works before a RAW file is loaded.
- Modify: `src/modules/raw-processor/components/index.ts`
  - Exports new stage and handle components.
- Modify: `src/modules/raw-processor/RawProcessorView.tsx`
  - Always renders the workspace shell, wires upload into the stage, and removes the standalone `UploadState` branch.
- Modify: `src/modules/raw-processor/model/session.ts`
  - Adds `compareSplit` to `viewState`.
- Modify: `src/modules/raw-processor/hooks/useImageSession.ts`
  - Initializes compare split for new sessions.
- Modify: `src/modules/raw-processor/hooks/useRawProcessor.ts`
  - Exposes `compareSplit` and `setCompareSplit`, defaults loaded sessions to compare mode, and keeps split state stable across preview upgrades.
- Modify: `src/atoms/raw-processor.ts`
  - Extends `ProcessingParams` defaults with compare mode and split.
- Modify: `src/lib/gl/pipeline.ts`
  - Adds compare view mode and split uniforms.
- Modify: `src/lib/gl/shaders.ts`
  - Renders original and processed states in one shader pass and selects by split.
- Test: `src/modules/raw-processor/__tests__/raw-route-shell.test.tsx`
  - Verifies no standalone upload page and initial workspace shell copy.
- Test: `src/modules/raw-processor/__tests__/workspace-ui.test.tsx`
  - Verifies controls, empty/loaded stage labels, and export disabled copy.
- Test: `src/modules/raw-processor/components/CompareSplitHandle.test.tsx`
  - Verifies helper math, pointer updates, and keyboard updates.
- Test: `src/lib/gl/pipeline.test.ts`
  - Verifies pipeline uniforms for compare mode and split.
- Test: `src/lib/gl/shaders.test.ts`
  - Verifies shader compare branch and original-side semantics.

## Design Constraints From Impeccable

- Register: product.
- Physical scene: a photographer reviewing one RAW on a laptop or tablet in a quiet desk or travel setting, wanting a trustworthy JPEG without opening a pro grading suite.
- Color strategy: restrained. Warm tinted neutrals, one Lab Green action color, amber only for color-contract explanation.
- New CSS must use OKLCH and must not introduce pure `#000`, pure `#fff`, gradient text, decorative glass, side-stripe accents, bokeh, or nested card surfaces.
- Product density is allowed, but image priority wins over control decoration.
- Motion must communicate state only, use opacity/transform, and respect `prefers-reduced-motion`.

### Task 1: Lock The Route Shell Tests

**Files:**
- Modify: `src/modules/raw-processor/__tests__/raw-route-shell.test.tsx`
- Test: `src/modules/raw-processor/__tests__/raw-route-shell.test.tsx`

- [ ] **Step 1: Replace the initial upload-page expectation with workspace expectations**

Change the first test in `src/modules/raw-processor/__tests__/raw-route-shell.test.tsx` to:

```tsx
it('renders the image-first empty RAW Lab workspace', () => {
  mockedUseCapabilityGate.mockReturnValue({
    ready: true,
    supportStatus: 'supported',
    reason: null,
  })

  render(<RawProcessorView />)

  expect(screen.getByRole('banner')).toBeInTheDocument()
  expect(screen.getByText('RAW Lab')).toBeInTheDocument()
  expect(screen.getByText('Drop one RAW here')).toBeInTheDocument()
  expect(screen.getByText('Unprocessed RAW')).toBeInTheDocument()
  expect(screen.getByText('Final JPEG')).toBeInTheDocument()
  expect(screen.queryByText('Browser-local RAW styling')).not.toBeInTheDocument()
  expect(screen.queryByText('Drop your RAW file here')).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Add an export-gate expectation for the empty workspace**

Append this test in the same `describe('rawProcessorView', ...)` block:

```tsx
it('keeps export disabled copy visible before a RAW is loaded', () => {
  mockedUseCapabilityGate.mockReturnValue({
    ready: true,
    supportStatus: 'supported',
    reason: null,
  })

  render(<RawProcessorView />)

  expect(
    screen.getByText('Full-resolution export source is still loading.'),
  ).toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: /export full-resolution jpeg/i }),
  ).toBeDisabled()
})
```

- [ ] **Step 3: Run the route shell test and verify it fails**

Run:

```bash
pnpm test -- --run src/modules/raw-processor/__tests__/raw-route-shell.test.tsx
```

Expected: FAIL because the current implementation still renders the standalone `UploadState` copy and no compare labels.

- [ ] **Step 4: Commit the failing test**

```bash
git add src/modules/raw-processor/__tests__/raw-route-shell.test.tsx
git commit -m "test: define raw lab workspace shell"
```

### Task 2: Add The Empty Compare Stage And Stage Dropzone

**Files:**
- Create: `src/modules/raw-processor/raw-lab.css`
- Create: `src/modules/raw-processor/components/ComparePreviewStage.tsx`
- Modify: `src/modules/raw-processor/components/Dropzone.tsx`
- Modify: `src/modules/raw-processor/components/index.ts`
- Test: `src/modules/raw-processor/__tests__/raw-route-shell.test.tsx`

- [ ] **Step 1: Export the RAW accept list and add a stage dropzone variant**

In `src/modules/raw-processor/components/Dropzone.tsx`, move the raw extension list to module scope:

```tsx
export const RAW_FILE_EXTENSIONS = [
  '.cr2',
  '.cr3',
  '.nef',
  '.arw',
  '.raf',
  '.rw2',
  '.orf',
  '.dng',
  '.pef',
  '.srw',
  '.3fr',
  '.fff',
  '.iiq',
  '.raw',
]
```

Add a `variant` prop to `DropzoneProps`:

```tsx
variant?: 'default' | 'stage'
```

Default it in the function signature:

```tsx
variant = 'default',
```

Replace the base class selection in the `m.div` with:

```tsx
className={clsxm(
  'relative transition-colors cursor-pointer',
  variant === 'stage'
    ? 'rounded-lg border border-[oklch(0.96_0.012_86_/_0.36)]'
    : 'rounded-xl border-2 border-dashed',
  isDragOver
    ? variant === 'stage'
      ? 'border-[oklch(0.59_0.15_153)] bg-[oklch(0.59_0.15_153_/_0.16)]'
      : 'border-accent bg-accent/10'
    : variant === 'stage'
      ? 'hover:border-[oklch(0.59_0.15_153_/_0.72)]'
      : 'border-border hover:border-accent/50 hover:bg-fill/50',
  disabled && 'opacity-50 cursor-not-allowed',
  className,
)}
```

Update the drag-over overlay class to respect the stage radius:

```tsx
className={clsxm(
  'absolute inset-0 flex items-center justify-center',
  variant === 'stage'
    ? 'rounded-lg bg-[oklch(0.59_0.15_153_/_0.18)]'
    : 'rounded-xl bg-accent/20',
)}
```

Update `FileDropzone` to use `RAW_FILE_EXTENSIONS`.

- [ ] **Step 2: Create `raw-lab.css` with the workspace and empty-stage foundation**

Create `src/modules/raw-processor/raw-lab.css`:

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
  min-height: 100svh;
  background:
    linear-gradient(180deg, var(--raw-paper), var(--raw-paper-low)),
    var(--raw-paper);
  color: var(--raw-ink);
}

.raw-lab-shell {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(320px, 360px);
  min-height: 0;
  overflow: hidden;
}

.raw-lab-stage {
  position: relative;
  min-width: 0;
  min-height: 0;
  padding: clamp(12px, 2vw, 22px);
}

.raw-lab-stage-frame {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: min(72svh, 620px);
  overflow: hidden;
  border: 1px solid oklch(0.96 0.012 86 / 0.36);
  border-radius: 8px;
  background:
    linear-gradient(160deg, oklch(0.23 0.026 76), oklch(0.16 0.02 76)),
    var(--raw-dark);
  box-shadow: 0 24px 80px oklch(0.18 0.018 76 / 0.18);
}

.raw-lab-sample {
  position: absolute;
  inset: 0;
  overflow: hidden;
}

.raw-lab-sample-photo,
.raw-lab-sample-finish {
  position: absolute;
  inset: 0;
}

.raw-lab-sample-photo {
  background:
    radial-gradient(circle at 54% 28%, oklch(0.9 0.08 68) 0 5%, transparent 5.4%),
    linear-gradient(140deg, oklch(0.26 0.05 136), oklch(0.58 0.08 72) 46%, oklch(0.24 0.03 53) 47% 100%);
  filter: saturate(0.58) contrast(0.92) brightness(0.82);
}

.raw-lab-sample-finish {
  clip-path: inset(0 0 0 var(--raw-compare-split, 50%));
  background:
    radial-gradient(circle at 54% 28%, oklch(0.92 0.09 68) 0 5%, transparent 5.4%),
    linear-gradient(140deg, oklch(0.3 0.085 145), oklch(0.68 0.1 72) 46%, oklch(0.32 0.045 54) 47% 100%);
  filter: saturate(1.16) contrast(1.06) brightness(1.04);
}

.raw-lab-compare-label {
  position: absolute;
  bottom: 18px;
  z-index: 4;
  max-width: calc(50% - 32px);
  border: 1px solid oklch(0.96 0.012 86 / 0.18);
  border-radius: 999px;
  padding: 7px 10px;
  background: oklch(0.16 0.018 76 / 0.76);
  color: var(--raw-hero-ink);
  font-size: 0.72rem;
  font-weight: 760;
  line-height: 1.1;
}

.raw-lab-compare-label-left {
  left: 18px;
}

.raw-lab-compare-label-right {
  right: 18px;
}

.raw-lab-upload-dock {
  position: absolute;
  left: 50%;
  bottom: clamp(52px, 7vw, 78px);
  z-index: 5;
  display: flex;
  min-width: min(320px, calc(100% - 36px));
  align-items: center;
  gap: 12px;
  border: 1px solid oklch(0.96 0.012 86 / 0.36);
  border-radius: 8px;
  padding: 11px 13px;
  background: oklch(0.16 0.018 76 / 0.84);
  color: var(--raw-hero-ink);
  transform: translateX(-50%);
}

.raw-lab-upload-icon {
  display: grid;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 7px;
  background: var(--raw-green);
  color: var(--raw-ink);
  font-weight: 860;
}

.raw-lab-upload-copy strong {
  display: block;
  font-size: 0.86rem;
  line-height: 1.1;
}

.raw-lab-upload-copy span {
  display: block;
  margin-top: 3px;
  color: oklch(0.9 0.016 86);
  font-size: 0.72rem;
  line-height: 1.25;
}

@media (max-width: 980px) {
  .raw-lab-shell {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(48svh, 1fr) auto;
    overflow-y: auto;
  }

  .raw-lab-stage-frame {
    min-height: min(62svh, 580px);
  }
}

@media (max-width: 640px) {
  .raw-lab-stage {
    padding: 10px;
  }

  .raw-lab-stage-frame {
    min-height: 56svh;
  }

  .raw-lab-upload-dock {
    bottom: 48px;
  }

  .raw-lab-compare-label {
    max-width: calc(50% - 22px);
    padding: 6px 8px;
    font-size: 0.64rem;
  }
}
```

- [ ] **Step 3: Create `ComparePreviewStage.tsx` with an empty sample path**

Create `src/modules/raw-processor/components/ComparePreviewStage.tsx`:

```tsx
import type { LUTData, PipelineStats, ProcessingParams, RawProcessingPipeline } from '~/lib/gl/pipeline'
import type { DecodedImage } from '~/lib/raw/decoder'
import { clsxm } from '~/lib/cn'

import { Dropzone, RAW_FILE_EXTENSIONS } from './Dropzone'
import { PreviewCanvas } from './PreviewCanvas'
import { ProgressOverlay } from './ProgressOverlay'

export interface ComparePreviewStageProps {
  hasImage: boolean
  imageRef: React.RefObject<DecodedImage | null>
  imageVersion: number
  params: ProcessingParams
  lutDataRef: React.RefObject<LUTData | null>
  lutDataVersion: number
  embeddedPreviewUrl?: string | null
  displaySource?: 'embedded' | 'quick' | 'hq' | 'none'
  split: number
  isProcessing: boolean
  progress: number
  phase: 'loading' | 'decoding' | 'processing' | 'exporting'
  recoveryHint?: string
  onRawDrop: (files: File[]) => void
  onStatsUpdate?: (stats: PipelineStats) => void
  onPipelineChange?: (pipeline: RawProcessingPipeline | null) => void
  className?: string
}

function EmptySampleCompare({ split }: { split: number }) {
  return (
    <div
      className="raw-lab-sample"
      style={{ '--raw-compare-split': `${split * 100}%` } as React.CSSProperties}
      aria-hidden="true"
    >
      <div className="raw-lab-sample-photo" />
      <div className="raw-lab-sample-finish" />
    </div>
  )
}

function UploadDock() {
  return (
    <div className="raw-lab-upload-dock">
      <span className="raw-lab-upload-icon" aria-hidden="true">↑</span>
      <span className="raw-lab-upload-copy">
        <strong>Drop one RAW here</strong>
        <span>No upload, no helper, no account</span>
      </span>
    </div>
  )
}

export function ComparePreviewStage({
  hasImage,
  imageRef,
  imageVersion,
  params,
  lutDataRef,
  lutDataVersion,
  embeddedPreviewUrl,
  displaySource = 'none',
  split,
  isProcessing,
  progress,
  phase,
  recoveryHint,
  onRawDrop,
  onStatsUpdate,
  onPipelineChange,
  className,
}: ComparePreviewStageProps) {
  return (
    <section className={clsxm('raw-lab-stage', className)} aria-label="RAW preview comparison">
      <Dropzone
        variant="stage"
        onFileDrop={onRawDrop}
        accept={RAW_FILE_EXTENSIONS}
        disabled={isProcessing}
        className="raw-lab-stage-frame"
      >
        {hasImage ? (
          <PreviewCanvas
            imageRef={imageRef}
            imageVersion={imageVersion}
            params={params}
            lutDataRef={lutDataRef}
            lutDataVersion={lutDataVersion}
            embeddedPreviewUrl={embeddedPreviewUrl}
            displaySource={displaySource}
            onStatsUpdate={onStatsUpdate}
            onPipelineChange={onPipelineChange}
          />
        ) : (
          <EmptySampleCompare split={split} />
        )}

        <span className="raw-lab-compare-label raw-lab-compare-label-left">
          Unprocessed RAW
        </span>
        <span className="raw-lab-compare-label raw-lab-compare-label-right">
          Final JPEG
        </span>

        {!hasImage && <UploadDock />}

        <ProgressOverlay
          visible={isProcessing}
          phase={phase}
          progress={progress}
          recoveryHint={recoveryHint}
        />
      </Dropzone>
    </section>
  )
}
```

- [ ] **Step 4: Export the new stage component**

Update `src/modules/raw-processor/components/index.ts`:

```ts
export * from './ComparePreviewStage'
```

Keep all existing exports.

- [ ] **Step 5: Run the route shell test and verify it still fails**

Run:

```bash
pnpm test -- --run src/modules/raw-processor/__tests__/raw-route-shell.test.tsx
```

Expected: FAIL because `RawProcessorView` has not rendered `ComparePreviewStage` yet.

- [ ] **Step 6: Commit stage scaffolding**

```bash
git add src/modules/raw-processor/raw-lab.css src/modules/raw-processor/components/ComparePreviewStage.tsx src/modules/raw-processor/components/Dropzone.tsx src/modules/raw-processor/components/index.ts
git commit -m "feat: add raw lab compare stage shell"
```

### Task 3: Add Compare Split State And Handle Interaction

**Files:**
- Create: `src/modules/raw-processor/components/CompareSplitHandle.tsx`
- Create: `src/modules/raw-processor/components/CompareSplitHandle.test.tsx`
- Modify: `src/modules/raw-processor/components/ComparePreviewStage.tsx`
- Modify: `src/modules/raw-processor/components/index.ts`
- Modify: `src/modules/raw-processor/raw-lab.css`
- Test: `src/modules/raw-processor/components/CompareSplitHandle.test.tsx`

- [ ] **Step 1: Write split helper and interaction tests**

Create `src/modules/raw-processor/components/CompareSplitHandle.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  clampCompareSplit,
  getCompareSplitFromClientX,
  CompareSplitHandle,
} from './CompareSplitHandle'

describe('compare split helpers', () => {
  it('clamps split to the visible handle range', () => {
    expect(clampCompareSplit(-1)).toBe(0.05)
    expect(clampCompareSplit(0.5)).toBe(0.5)
    expect(clampCompareSplit(2)).toBe(0.95)
  })

  it('maps pointer x position to split fraction', () => {
    expect(
      getCompareSplitFromClientX({ left: 100, width: 400 }, 300),
    ).toBe(0.5)
    expect(
      getCompareSplitFromClientX({ left: 100, width: 400 }, 60),
    ).toBe(0.05)
    expect(
      getCompareSplitFromClientX({ left: 100, width: 400 }, 520),
    ).toBe(0.95)
  })
})

describe('CompareSplitHandle', () => {
  it('updates split with keyboard arrows', () => {
    const onChange = vi.fn()

    render(<CompareSplitHandle value={0.5} onChange={onChange} />)

    const slider = screen.getByRole('slider', {
      name: 'Compare unprocessed RAW and final JPEG',
    })

    fireEvent.keyDown(slider, { key: 'ArrowRight' })
    expect(onChange).toHaveBeenLastCalledWith(0.51)

    fireEvent.keyDown(slider, { key: 'ArrowLeft' })
    expect(onChange).toHaveBeenLastCalledWith(0.49)
  })

  it('updates split with pointer movement', () => {
    const onChange = vi.fn()

    render(<CompareSplitHandle value={0.5} onChange={onChange} />)

    const slider = screen.getByRole('slider')
    Object.defineProperty(slider, 'getBoundingClientRect', {
      value: () => ({ left: 100, width: 400 }),
    })

    fireEvent.pointerDown(slider, { clientX: 340, pointerId: 1 })

    expect(onChange).toHaveBeenCalledWith(0.6)
  })
})
```

- [ ] **Step 2: Run the split test and verify it fails**

Run:

```bash
pnpm test -- --run src/modules/raw-processor/components/CompareSplitHandle.test.tsx
```

Expected: FAIL because `CompareSplitHandle.tsx` does not exist.

- [ ] **Step 3: Implement `CompareSplitHandle.tsx`**

Create `src/modules/raw-processor/components/CompareSplitHandle.tsx`:

```tsx
import { useCallback } from 'react'

import { clsxm } from '~/lib/cn'

const MIN_SPLIT = 0.05
const MAX_SPLIT = 0.95
const KEYBOARD_STEP = 0.01

export function clampCompareSplit(value: number) {
  if (!Number.isFinite(value)) return 0.5
  return Math.min(MAX_SPLIT, Math.max(MIN_SPLIT, value))
}

export function getCompareSplitFromClientX(
  rect: Pick<DOMRect, 'left' | 'width'>,
  clientX: number,
) {
  if (!rect.width || rect.width <= 0) return 0.5
  return clampCompareSplit((clientX - rect.left) / rect.width)
}

export function CompareSplitHandle({
  value,
  onChange,
  disabled = false,
  className,
}: {
  value: number
  onChange: (value: number) => void
  disabled?: boolean
  className?: string
}) {
  const updateFromPointer = useCallback(
    (target: HTMLElement, clientX: number) => {
      onChange(getCompareSplitFromClientX(target.getBoundingClientRect(), clientX))
    },
    [onChange],
  )

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (disabled) return

      event.currentTarget.setPointerCapture?.(event.pointerId)
      updateFromPointer(event.currentTarget, event.clientX)
    },
    [disabled, updateFromPointer],
  )

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (disabled || !event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        return
      }

      updateFromPointer(event.currentTarget, event.clientX)
    },
    [disabled, updateFromPointer],
  )

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (disabled) return

      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        onChange(clampCompareSplit(value - KEYBOARD_STEP))
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        onChange(clampCompareSplit(value + KEYBOARD_STEP))
      } else if (event.key === 'Home') {
        event.preventDefault()
        onChange(MIN_SPLIT)
      } else if (event.key === 'End') {
        event.preventDefault()
        onChange(MAX_SPLIT)
      }
    },
    [disabled, onChange, value],
  )

  return (
    <button
      type="button"
      role="slider"
      aria-label="Compare unprocessed RAW and final JPEG"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clampCompareSplit(value) * 100)}
      disabled={disabled}
      className={clsxm('raw-lab-compare-handle', className)}
      style={{ '--raw-compare-split': `${clampCompareSplit(value) * 100}%` } as React.CSSProperties}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onKeyDown={handleKeyDown}
    >
      <span aria-hidden="true">↔</span>
    </button>
  )
}
```

- [ ] **Step 4: Add handle styles**

Append to `src/modules/raw-processor/raw-lab.css`:

```css
.raw-lab-compare-handle {
  position: absolute;
  inset: 0 auto 0 var(--raw-compare-split, 50%);
  z-index: 6;
  width: 44px;
  min-width: 44px;
  border: 0;
  padding: 0;
  background: transparent;
  color: var(--raw-hero-ink);
  cursor: ew-resize;
  transform: translateX(-50%);
}

.raw-lab-compare-handle::before {
  content: "";
  position: absolute;
  inset: 0 auto 0 50%;
  width: 2px;
  background: oklch(0.96 0.012 86 / 0.9);
  transform: translateX(-50%);
}

.raw-lab-compare-handle span {
  position: absolute;
  top: 50%;
  left: 50%;
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border: 1px solid oklch(0.96 0.012 86 / 0.74);
  border-radius: 999px;
  background: oklch(0.17 0.018 76 / 0.78);
  transform: translate(-50%, -50%);
  font-size: 0.72rem;
  font-weight: 800;
}

.raw-lab-compare-handle:focus-visible span {
  outline: 2px solid var(--raw-green);
  outline-offset: 3px;
}
```

- [ ] **Step 5: Render the handle in the stage**

In `src/modules/raw-processor/components/ComparePreviewStage.tsx`, import the handle:

```tsx
import { CompareSplitHandle } from './CompareSplitHandle'
```

Add a prop:

```tsx
onSplitChange: (split: number) => void
```

Render the handle after the labels:

```tsx
<CompareSplitHandle
  value={split}
  onChange={onSplitChange}
  disabled={isProcessing}
/>
```

- [ ] **Step 6: Export the handle**

Update `src/modules/raw-processor/components/index.ts`:

```ts
export * from './CompareSplitHandle'
```

- [ ] **Step 7: Run split tests**

Run:

```bash
pnpm test -- --run src/modules/raw-processor/components/CompareSplitHandle.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit split interaction**

```bash
git add src/modules/raw-processor/components/CompareSplitHandle.tsx src/modules/raw-processor/components/CompareSplitHandle.test.tsx src/modules/raw-processor/components/ComparePreviewStage.tsx src/modules/raw-processor/components/index.ts src/modules/raw-processor/raw-lab.css
git commit -m "feat: add raw compare split interaction"
```

### Task 4: Extend Processing State And WebGL Compare Rendering

**Files:**
- Modify: `src/atoms/raw-processor.ts`
- Modify: `src/modules/raw-processor/model/session.ts`
- Modify: `src/modules/raw-processor/hooks/useImageSession.ts`
- Modify: `src/modules/raw-processor/hooks/useRawProcessor.ts`
- Modify: `src/lib/gl/pipeline.ts`
- Modify: `src/lib/gl/shaders.ts`
- Modify: `src/lib/gl/pipeline.test.ts`
- Modify: `src/lib/gl/shaders.test.ts`
- Test: `src/lib/gl/pipeline.test.ts`
- Test: `src/lib/gl/shaders.test.ts`

- [ ] **Step 1: Add shader tests for compare semantics**

Append to `src/lib/gl/shaders.test.ts`:

```ts
it.each(PROCESS_SHADER_VARIANTS)(
  '%s variant renders compare mode by split without a second decode',
  (_name, shader) => {
    expect(shader).toContain('uniform int u_viewMode')
    expect(shader).toContain('uniform float u_compareSplit')
    expect(shader).toContain('const int VIEW_MODE_COMPARE = 2')
    expect(shader).toContain(
      'float finalSide = step(clamp(u_compareSplit, 0.0, 1.0), v_texCoord.x)',
    )
    expect(shader).toContain(
      'styledColor = mix(baseDisplayColor, styledColor, finalSide)',
    )
  },
)

it.each(PROCESS_SHADER_VARIANTS)(
  '%s variant keeps original mode as the unprocessed RAW side',
  (_name, shader) => {
    expect(shader).toContain('const int VIEW_MODE_ORIGINAL = 1')
    expect(shader).toContain('if (u_viewMode == VIEW_MODE_ORIGINAL)')
    expect(shader).toContain('styledColor = baseDisplayColor')
  },
)
```

- [ ] **Step 2: Add pipeline uniform tests**

Append to `src/lib/gl/pipeline.test.ts` under `describe('rawProcessingPipeline render uniforms', ...)`:

```ts
it('sends compare mode and split uniforms to the process shader', async () => {
  contextMock.reset()
  const pipeline = new RawProcessingPipeline(document.createElement('canvas'))
  await pipeline.initialize()

  pipeline.uploadImage({
    data: new Float32Array(4),
    width: 1,
    height: 1,
    layout: 'rgba-float32',
    colorSpace: 'display-srgb-preview',
  })
  pipeline.setParams({
    viewMode: 'compare',
    compareSplit: 0.42,
  })
  pipeline.render()

  expect(contextMock.gl.getUniformLocation).toHaveBeenCalledWith(
    expect.anything(),
    'u_viewMode',
  )
  expect(contextMock.gl.getUniformLocation).toHaveBeenCalledWith(
    expect.anything(),
    'u_compareSplit',
  )
  expect(contextMock.gl.uniform1i).toHaveBeenCalledWith('u_viewMode', 2)
  expect(contextMock.gl.uniform1f).toHaveBeenCalledWith('u_compareSplit', 0.42)
})
```

- [ ] **Step 3: Run GL tests and verify they fail**

Run:

```bash
pnpm test -- --run src/lib/gl/shaders.test.ts src/lib/gl/pipeline.test.ts
```

Expected: FAIL because compare uniforms and compare shader branches do not exist.

- [ ] **Step 4: Extend `ProcessingParams` and defaults**

In `src/lib/gl/pipeline.ts`, change `ProcessingParams` to:

```ts
export interface ProcessingParams {
  intensity: number
  viewMode: 'processed' | 'original' | 'compare'
  compareSplit: number
  styleKind: 'none' | 'builtin' | 'custom'
  builtinPreset: BuiltinStylePreset | null
}
```

Update `DEFAULT_PARAMS`:

```ts
const DEFAULT_PARAMS: ProcessingParams = {
  intensity: 0.7,
  viewMode: 'compare',
  compareSplit: 0.5,
  styleKind: 'none',
  builtinPreset: null,
}
```

In `src/atoms/raw-processor.ts`, update `baseProcessingParamsAtom`:

```ts
const baseProcessingParamsAtom = atom<ProcessingParams>({
  intensity: 0.7,
  viewMode: 'compare',
  compareSplit: 0.5,
  styleKind: 'none',
  builtinPreset: null,
})
```

Update `resetToDefaults()`:

```ts
setProcessingParams({
  intensity: 0.7,
  viewMode: 'compare',
  compareSplit: 0.5,
  styleKind: 'none',
  builtinPreset: null,
})
```

- [ ] **Step 5: Store compare split in session view state**

In `src/modules/raw-processor/model/session.ts`, change `viewState` to:

```ts
viewState: {
  mode: 'processed' | 'original' | 'compare'
  compareSplit: number
  zoom: number
  panX: number
  panY: number
  fitMode: 'screen' | 'custom'
}
```

In `src/modules/raw-processor/hooks/useImageSession.ts`, update `createEmptySession()`:

```ts
viewState: {
  mode: 'compare',
  compareSplit: 0.5,
  zoom: 1,
  panX: 0,
  panY: 0,
  fitMode: 'screen',
},
```

- [ ] **Step 6: Expose compare split from `useRawProcessor`**

In `src/modules/raw-processor/hooks/useRawProcessor.ts`, add to `UseRawProcessorReturn`:

```ts
compareSplit: number
setCompareSplit: (split: number) => void
```

Compute the value near `viewMode`:

```ts
const compareSplit = params.compareSplit
```

Update the `loadFile` reset params block:

```ts
setParams((prev) => ({
  ...prev,
  intensity: 0.7,
  viewMode: 'compare',
  compareSplit: prev.compareSplit ?? 0.5,
  styleKind: 'none',
  builtinPreset: null,
}))
```

Update `setViewMode` so it accepts compare mode through the existing type and writes it to session state:

```ts
viewState: {
  ...prev.viewState,
  mode,
},
```

Add this callback after `setViewMode`:

```ts
const setCompareSplit = useCallback(
  (split: number) => {
    const nextSplit = Math.min(0.95, Math.max(0.05, split))
    setParams((prev) => ({ ...prev, compareSplit: nextSplit }))
    setSession((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        viewState: {
          ...prev.viewState,
          compareSplit: nextSplit,
        },
      }
    })
  },
  [setParams, setSession],
)
```

Return both:

```ts
compareSplit,
setCompareSplit,
```

- [ ] **Step 7: Add compare uniforms in pipeline**

In `src/lib/gl/pipeline.ts`, add:

```ts
const VIEW_MODE_UNIFORMS: Record<ProcessingParams['viewMode'], number> = {
  processed: 0,
  original: 1,
  compare: 2,
}
```

In `getProcessUniforms()`, add:

```ts
u_viewMode: gl.getUniformLocation(program, 'u_viewMode'),
u_compareSplit: gl.getUniformLocation(program, 'u_compareSplit'),
```

In `renderProcessPass()`, after intensity:

```ts
gl.uniform1i(processUniforms.u_viewMode, VIEW_MODE_UNIFORMS[params.viewMode])
gl.uniform1f(
  processUniforms.u_compareSplit,
  Math.min(0.95, Math.max(0.05, params.compareSplit)),
)
```

- [ ] **Step 8: Add compare rendering in shaders**

In `src/lib/gl/shaders.ts`, add to `PROCESS_FRAGMENT_SHADER_HEADER`:

```glsl
uniform int u_viewMode;
uniform float u_compareSplit;
```

Add constants in `PROCESS_FRAGMENT_SHADER_BODY`:

```glsl
const int VIEW_MODE_PROCESSED = 0;
const int VIEW_MODE_ORIGINAL = 1;
const int VIEW_MODE_COMPARE = 2;
```

At the end of `main()`, before `fragColor`, replace:

```glsl
fragColor = vec4(clamp01(styledColor), 1.0);
```

with:

```glsl
if (u_viewMode == VIEW_MODE_ORIGINAL) {
  styledColor = baseDisplayColor;
} else if (u_viewMode == VIEW_MODE_COMPARE) {
  float finalSide = step(clamp(u_compareSplit, 0.0, 1.0), v_texCoord.x);
  styledColor = mix(baseDisplayColor, styledColor, finalSide);
}

fragColor = vec4(clamp01(styledColor), 1.0);
```

- [ ] **Step 9: Remove preview-side intensity override**

In `src/modules/raw-processor/components/PreviewCanvas.tsx`, replace:

```tsx
pipeline.setParams({
  ...params,
  intensity: params.viewMode === 'original' ? 0 : params.intensity,
})
```

with:

```tsx
pipeline.setParams(params)
```

- [ ] **Step 10: Run GL tests**

Run:

```bash
pnpm test -- --run src/lib/gl/shaders.test.ts src/lib/gl/pipeline.test.ts
```

Expected: PASS.

- [ ] **Step 11: Commit compare rendering**

```bash
git add src/atoms/raw-processor.ts src/modules/raw-processor/model/session.ts src/modules/raw-processor/hooks/useImageSession.ts src/modules/raw-processor/hooks/useRawProcessor.ts src/modules/raw-processor/components/PreviewCanvas.tsx src/lib/gl/pipeline.ts src/lib/gl/shaders.ts src/lib/gl/pipeline.test.ts src/lib/gl/shaders.test.ts
git commit -m "feat: render split compare in raw preview pipeline"
```

### Task 5: Replace The Standalone Upload Page With The Workspace Shell

**Files:**
- Modify: `src/modules/raw-processor/RawProcessorView.tsx`
- Modify: `src/modules/raw-processor/components/WorkspaceHeader.tsx`
- Modify: `src/modules/raw-processor/raw-lab.css`
- Test: `src/modules/raw-processor/__tests__/raw-route-shell.test.tsx`
- Test: `src/modules/raw-processor/__tests__/workspace-ui.test.tsx`

- [ ] **Step 1: Update `WorkspaceHeader` into an always-present top bar**

Modify `src/modules/raw-processor/components/WorkspaceHeader.tsx` props:

```tsx
fileName?: string
hasImage: boolean
```

Change the header opening class:

```tsx
<header className="raw-lab-topbar" role="banner">
```

Replace the heading block with:

```tsx
<div className="min-w-0">
  <div className="flex min-w-0 items-center gap-3">
    <span className="raw-lab-mark" aria-hidden="true" />
    <h1 className="truncate text-base font-semibold text-[oklch(0.18_0.018_76)]">
      {hasImage ? fileName : 'RAW Lab'}
    </h1>
    {hasImage && <SupportBadge level={supportLevel} />}
  </div>
  <p className="mt-1 truncate text-xs text-[oklch(0.38_0.032_75)]">
    {hasImage
      ? 'Browser-local RAW finishing workspace'
      : 'Drop one RAW to preview, compare, finish, and export locally.'}
  </p>
  {exportDisabledReason && (
    <p className="mt-1 truncate text-xs text-[oklch(0.38_0.032_75)]">
      Full-res JPEG unavailable: {exportDisabledReason}
    </p>
  )}
</div>
```

Update buttons:

```tsx
<button
  type="button"
  onClick={onReplaceFile}
  disabled={isExporting}
  className="raw-lab-topbar-button"
>
  {hasImage ? 'Replace' : 'Choose RAW'}
</button>
<button
  type="button"
  onClick={onResetSession}
  disabled={!hasImage || isExporting}
  className="raw-lab-topbar-button"
>
  Reset
</button>
<button
  type="button"
  onClick={onOpenExport}
  disabled={!canExport}
  className="raw-lab-topbar-button raw-lab-topbar-button-primary"
>
  Full-res JPEG
</button>
```

- [ ] **Step 2: Add topbar CSS**

Append to `src/modules/raw-processor/raw-lab.css`:

```css
.raw-lab-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid var(--raw-hairline);
  padding: 12px clamp(14px, 2vw, 22px);
  background: oklch(0.952 0.018 86);
}

.raw-lab-mark {
  display: inline-block;
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
  border: 2px solid currentColor;
  border-radius: 5px;
  background:
    linear-gradient(135deg, transparent 45%, currentColor 46% 54%, transparent 55%),
    oklch(0.82 0.13 145 / 0.24);
}

.raw-lab-topbar-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 8px;
}

.raw-lab-topbar-button {
  min-height: 38px;
  border: 1px solid var(--raw-hairline);
  border-radius: 8px;
  padding: 8px 11px;
  background: var(--raw-paper);
  color: var(--raw-ink);
  font-size: 0.8rem;
  font-weight: 700;
  transition:
    transform 180ms cubic-bezier(0.22, 1, 0.36, 1),
    background-color 180ms cubic-bezier(0.22, 1, 0.36, 1),
    border-color 180ms cubic-bezier(0.22, 1, 0.36, 1);
}

.raw-lab-topbar-button:hover:not(:disabled) {
  transform: translateY(-1px);
  border-color: var(--raw-green);
}

.raw-lab-topbar-button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.raw-lab-topbar-button-primary {
  border-color: oklch(0.74 0.15 152);
  background: var(--raw-green);
  color: var(--raw-ink);
}

@media (max-width: 640px) {
  .raw-lab-topbar {
    align-items: flex-start;
    gap: 10px;
  }

  .raw-lab-topbar-actions {
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .raw-lab-topbar-button {
    min-height: 36px;
    padding-inline: 9px;
    font-size: 0.74rem;
  }
}
```

- [ ] **Step 3: Replace `RawProcessorView` layout branch**

In `src/modules/raw-processor/RawProcessorView.tsx`, import CSS:

```tsx
import './raw-lab.css'
```

Remove `UploadState` from imports.

Destructure from `useRawProcessor()`:

```tsx
compareSplit,
setCompareSplit,
```

Replace the returned layout with this structure:

```tsx
return (
  <div className={clsxm('raw-lab', className)}>
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

    <div className="raw-lab-shell">
      <ComparePreviewStage
        hasImage={hasImage}
        imageRef={decodedImageRef}
        imageVersion={decodedImageVersion}
        params={params}
        lutDataRef={lutDataRef}
        lutDataVersion={lutDataVersion}
        embeddedPreviewUrl={embeddedPreviewUrl}
        displaySource={displaySource}
        split={compareSplit}
        onSplitChange={setCompareSplit}
        isProcessing={isProcessing}
        phase={
          status === 'loading'
            ? 'loading'
            : status === 'decoding'
              ? 'decoding'
              : status === 'exporting'
                ? 'exporting'
                : 'processing'
        }
        progress={progress}
        recoveryHint={progressRecoveryHint}
        onRawDrop={handleFileDrop}
        onStatsUpdate={handleStatsUpdate}
        onPipelineChange={handlePipelineChange}
      />

      <aside className="raw-lab-controls" aria-label="RAW finishing controls">
        <ControlsPanel
          presetOptions={presetOptions.map(({ id, name }) => ({ id, name }))}
          activePresetId={activePresetId}
          activeIntensity={activeIntensity}
          viewMode={viewMode}
          onPresetSelect={(id) =>
            selectBuiltinStyle(id as (typeof presetOptions)[number]['id'])
          }
          onIntensitySelect={selectIntensityLevel}
          onViewModeChange={setViewMode}
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
        />
        {loadedImage.metadata && (
          <MetadataPanel
            metadata={{
              ...loadedImage.metadata,
              width:
                decodedImageRef.current?.width ?? loadedImage.metadata.width,
              height:
                decodedImageRef.current?.height ?? loadedImage.metadata.height,
            }}
          />
        )}
        {stats && <StatsPanel stats={stats} />}
      </aside>
    </div>

    <ErrorOverlay
      visible={status === 'error' && !!error}
      message={error || ''}
      onDismiss={dismissError}
    />
  </div>
)
```

- [ ] **Step 4: Add controls region CSS**

Append to `src/modules/raw-processor/raw-lab.css`:

```css
.raw-lab-controls {
  min-height: 0;
  overflow-y: auto;
  border-left: 1px solid var(--raw-hairline);
  background: oklch(0.928 0.024 86);
  padding: 14px;
}

@media (max-width: 980px) {
  .raw-lab-controls {
    border-top: 1px solid var(--raw-hairline);
    border-left: 0;
    padding: 12px;
  }
}
```

- [ ] **Step 5: Update `ControlsPanelProps` for empty sessions**

In `src/modules/raw-processor/components/ControlsPanel.tsx`, add:

```ts
hasImage: boolean
```

Use it to disable preset and LUT controls before upload:

```tsx
disabled={!hasImage || isProcessing}
```

For preset buttons:

```tsx
disabled={!hasImage || isProcessing}
```

For `LutDropzone`:

```tsx
disabled={!hasImage || isProcessing}
```

Keep export disabled through `canExport`.

- [ ] **Step 6: Run route shell tests**

Run:

```bash
pnpm test -- --run src/modules/raw-processor/__tests__/raw-route-shell.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Run workspace UI tests and fix prop compile drift**

Run:

```bash
pnpm test -- --run src/modules/raw-processor/__tests__/workspace-ui.test.tsx
```

Expected first run may fail because `controlsPanelProps()` must include `hasImage: true`. Fix the helper:

```ts
hasImage: true,
```

Rerun until PASS.

- [ ] **Step 8: Commit the workspace shell**

```bash
git add src/modules/raw-processor/RawProcessorView.tsx src/modules/raw-processor/components/WorkspaceHeader.tsx src/modules/raw-processor/components/ControlsPanel.tsx src/modules/raw-processor/raw-lab.css src/modules/raw-processor/__tests__/raw-route-shell.test.tsx src/modules/raw-processor/__tests__/workspace-ui.test.tsx
git commit -m "feat: replace raw upload page with lab workspace"
```

### Task 6: Refine Product Controls, Copy, And Responsive Behavior

**Files:**
- Modify: `src/modules/raw-processor/components/ControlsPanel.tsx`
- Modify: `src/modules/raw-processor/components/ProgressOverlay.tsx`
- Modify: `src/modules/raw-processor/components/UnsupportedState.tsx`
- Modify: `src/modules/raw-processor/raw-lab.css`
- Test: `src/modules/raw-processor/__tests__/workspace-ui.test.tsx`
- Test: `src/modules/raw-processor/__tests__/raw-route-shell.test.tsx`

- [ ] **Step 1: Add product-copy expectations to workspace UI tests**

Append to `describe('controlsPanel', ...)` in `src/modules/raw-processor/__tests__/workspace-ui.test.tsx`:

```tsx
it('keeps compare copy tied to the new split interaction', () => {
  render(<ControlsPanel {...controlsPanelProps({ viewMode: 'compare' })} />)

  expect(screen.getByText('Compare')).toBeInTheDocument()
  expect(screen.getByText('Drag the split on the image.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Processed' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Original' })).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run the workspace UI test and verify it fails**

Run:

```bash
pnpm test -- --run src/modules/raw-processor/__tests__/workspace-ui.test.tsx
```

Expected: FAIL because the controls still show Processed and Original buttons.

- [ ] **Step 3: Replace compare toggle buttons with split guidance**

In `src/modules/raw-processor/components/ControlsPanel.tsx`, replace the Compare section:

```tsx
<section className="space-y-3">
  <label className="text-sm font-medium text-text">Compare</label>
  <div className="flex gap-2">
    <Button
      variant={viewMode === 'processed' ? 'primary' : 'secondary'}
      size="sm"
      onClick={() => onViewModeChange('processed')}
    >
      Processed
    </Button>
    <Button
      variant={viewMode === 'original' ? 'primary' : 'secondary'}
      size="sm"
      onClick={() => onViewModeChange('original')}
    >
      Original
    </Button>
  </div>
</section>
```

with:

```tsx
<section className="space-y-2">
  <label className="text-sm font-medium text-text">Compare</label>
  <p className="text-xs leading-relaxed text-text-secondary">
    Drag the split on the image.
  </p>
  <Button
    variant="secondary"
    size="sm"
    onClick={() => onViewModeChange('compare')}
    disabled={!hasImage || isProcessing || viewMode === 'compare'}
  >
    Reset compare view
  </Button>
</section>
```

- [ ] **Step 4: Remove colored side-stripe callouts**

In `src/modules/raw-processor/components/ControlsPanel.tsx`, replace each `border-l-2 border-accent/70 pl-3` warning paragraph with a full-border tinted box:

```tsx
className="rounded-md border border-accent/30 bg-accent/10 px-3 py-2 text-xs leading-relaxed text-text-secondary"
```

This satisfies the `$impeccable` side-stripe ban.

- [ ] **Step 5: Tune progress and unsupported states to the lab palette**

In `ProgressOverlay`, replace:

```tsx
'absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-50'
```

with:

```tsx
'absolute inset-0 z-50 flex items-center justify-center bg-[oklch(0.18_0.02_76_/_0.78)]'
```

In `UnsupportedState`, use warm lab copy:

```tsx
<h2 className="text-2xl font-semibold text-text">
  This browser cannot run the RAW Lab
</h2>
```

Keep the reason text and desktop browser guidance.

- [ ] **Step 6: Add responsive control polish**

Append to `src/modules/raw-processor/raw-lab.css`:

```css
.raw-lab-controls > * + * {
  margin-top: 12px;
}

.raw-lab-controls [data-raw-panel="controls"] {
  border-radius: 8px;
  border: 1px solid var(--raw-hairline);
  background: var(--raw-paper);
}

@media (max-width: 980px) {
  .raw-lab-controls [data-raw-panel="controls"] {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
  }
}

@media (max-width: 640px) {
  .raw-lab-controls [data-raw-panel="controls"] {
    display: block;
  }
}

@media (prefers-reduced-motion: reduce) {
  .raw-lab *,
  .raw-lab *::before,
  .raw-lab *::after {
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
  }
}
```

Add `data-raw-panel="controls"` to the root `m.div` in `ControlsPanel`.

- [ ] **Step 7: Run focused UI tests**

Run:

```bash
pnpm test -- --run src/modules/raw-processor/__tests__/workspace-ui.test.tsx src/modules/raw-processor/__tests__/raw-route-shell.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit responsive control polish**

```bash
git add src/modules/raw-processor/components/ControlsPanel.tsx src/modules/raw-processor/components/ProgressOverlay.tsx src/modules/raw-processor/components/UnsupportedState.tsx src/modules/raw-processor/raw-lab.css src/modules/raw-processor/__tests__/workspace-ui.test.tsx
git commit -m "feat: refine raw lab controls for product UI"
```

### Task 7: Add Loaded-Stage Regression Coverage

**Files:**
- Modify: `src/modules/raw-processor/__tests__/workspace-ui.test.tsx`
- Test: `src/modules/raw-processor/__tests__/workspace-ui.test.tsx`

- [ ] **Step 1: Add loaded compare stage tests**

Append to `src/modules/raw-processor/__tests__/workspace-ui.test.tsx`:

```tsx
import { ComparePreviewStage } from '../components/ComparePreviewStage'
```

Add this helper near the top of the file:

```tsx
function compareStageProps(
  overrides: Partial<ComponentProps<typeof ComparePreviewStage>> = {},
): ComponentProps<typeof ComparePreviewStage> {
  return {
    hasImage: false,
    imageRef: { current: null },
    imageVersion: 0,
    params: {
      intensity: 0.7,
      viewMode: 'compare',
      compareSplit: 0.5,
      styleKind: 'none',
      builtinPreset: null,
    },
    lutDataRef: { current: null },
    lutDataVersion: 0,
    embeddedPreviewUrl: null,
    displaySource: 'none',
    split: 0.5,
    onSplitChange: () => {},
    isProcessing: false,
    phase: 'loading',
    progress: 0,
    onRawDrop: () => {},
    ...overrides,
  }
}
```

Add tests:

```tsx
describe('comparePreviewStage', () => {
  it('places upload inside the empty compare stage', () => {
    render(<ComparePreviewStage {...compareStageProps()} />)

    expect(screen.getByLabelText('RAW preview comparison')).toBeInTheDocument()
    expect(screen.getByText('Drop one RAW here')).toBeInTheDocument()
    expect(screen.getByText('Unprocessed RAW')).toBeInTheDocument()
    expect(screen.getByText('Final JPEG')).toBeInTheDocument()
    expect(screen.getByRole('slider')).toBeInTheDocument()
  })

  it('keeps compare labels when an image is loaded', async () => {
    await act(async () => {
      render(
        <ComparePreviewStage
          {...compareStageProps({
            hasImage: true,
            imageRef: {
              current: {
                data: new Float32Array(4),
                width: 1,
                height: 1,
                layout: 'rgba-float32',
                colorSpace: 'display-srgb-preview',
                metadata: { width: 1, height: 1 },
                renderExposure: { ev: 0, multiplier: 1, source: 'identity' },
              },
            },
          })}
        />,
      )
    })

    expect(screen.queryByText('Drop one RAW here')).not.toBeInTheDocument()
    expect(screen.getByText('Unprocessed RAW')).toBeInTheDocument()
    expect(screen.getByText('Final JPEG')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run loaded-stage tests and verify failures**

Run:

```bash
pnpm test -- --run src/modules/raw-processor/__tests__/workspace-ui.test.tsx
```

Expected: PASS. The fixture uses `renderExposure.source: 'identity'`, which is a valid `RawRenderExposureSource`.

- [ ] **Step 3: Run workspace UI tests**

Run:

```bash
pnpm test -- --run src/modules/raw-processor/__tests__/workspace-ui.test.tsx
```

Expected: PASS.

- [ ] **Step 4: Commit loaded-stage coverage**

```bash
git add src/modules/raw-processor/__tests__/workspace-ui.test.tsx
git commit -m "test: cover raw lab compare stage states"
```

### Task 8: Full Verification And Browser Design Pass

**Files:**
- Modify only files already touched by Tasks 1 through 7 when a verification failure proves they need correction.
- Test: focused raw-processor tests, GL tests, typecheck, build.

- [ ] **Step 1: Run focused automated tests**

Run:

```bash
pnpm test -- --run \
  src/modules/raw-processor/__tests__/raw-route-shell.test.tsx \
  src/modules/raw-processor/__tests__/workspace-ui.test.tsx \
  src/modules/raw-processor/components/CompareSplitHandle.test.tsx \
  src/lib/gl/shaders.test.ts \
  src/lib/gl/pipeline.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run:

```bash
pnpm exec tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Run build**

Run:

```bash
pnpm build
```

Expected: PASS.

- [ ] **Step 4: Run static design-rule checks**

Run:

```bash
rg -n "#000|#fff|background-clip:\\s*text|border-left:\\s*[2-9]|border-right:\\s*[2-9]|bokeh|glass" src/modules/raw-processor
```

Expected: no matches in newly added RAW Lab UI code. If a match appears in pre-existing code that was not touched, do not refactor it unless it affects the new surface.

- [ ] **Step 5: Start the dev server**

Run:

```bash
pnpm dev --host 0.0.0.0
```

Expected: Vite reports a local URL. Keep the server running for browser checks.

- [ ] **Step 6: Browser-check desktop empty state**

Use Chrome DevTools:

```text
Navigate to /raw at 1440 x 1000.
Verify the first screen is the RAW Lab workspace, not a centered upload page.
Verify the sample compare, upload dock, top bar, right rail, and disabled export gate are visible.
Drag the compare handle and verify it moves.
```

Expected: no text overlap, no layout jump, no hidden primary upload action.

- [ ] **Step 7: Browser-check tablet and mobile empty states**

Use Chrome DevTools:

```text
Resize to 900 x 1100.
Verify controls collapse below the stage and the upload dock remains inside the stage.

Resize to 390 x 844.
Verify top-bar buttons fit or wrap cleanly, compare labels fit, upload dock is reachable, and controls remain available below the stage.
```

Expected: full workflow remains reachable on both viewports.

- [ ] **Step 8: Browser-check loaded RAW behavior**

Use an available local RAW fixture, for example `/workspaces/LumaForge/test-images/SGL_1998.NEF` if present:

```text
Drop or choose the RAW in /raw.
Verify the same stage remains in place during loading.
Verify embedded or quick preview appears without returning to upload page.
Verify labels remain Unprocessed RAW and Final JPEG.
Drag the split after preview is visible.
Choose a built-in look and verify only the Final JPEG side changes.
Verify export remains disabled or enabled according to the existing capability gate message.
```

Expected: no second decode is triggered by split movement, and the stage does not resize during progress overlays.

- [ ] **Step 9: Stop the dev server**

Stop the Vite server with `Ctrl+C`. Do not leave needed command sessions running.

- [ ] **Step 10: Commit verification fixes**

When verification required code changes, stage the touched RAW Lab files explicitly:

```bash
git add \
  src/atoms/raw-processor.ts \
  src/lib/gl/pipeline.ts \
  src/lib/gl/shaders.ts \
  src/lib/gl/pipeline.test.ts \
  src/lib/gl/shaders.test.ts \
  src/modules/raw-processor/RawProcessorView.tsx \
  src/modules/raw-processor/raw-lab.css \
  src/modules/raw-processor/components/ComparePreviewStage.tsx \
  src/modules/raw-processor/components/CompareSplitHandle.tsx \
  src/modules/raw-processor/components/CompareSplitHandle.test.tsx \
  src/modules/raw-processor/components/ControlsPanel.tsx \
  src/modules/raw-processor/components/Dropzone.tsx \
  src/modules/raw-processor/components/PreviewCanvas.tsx \
  src/modules/raw-processor/components/ProgressOverlay.tsx \
  src/modules/raw-processor/components/UnsupportedState.tsx \
  src/modules/raw-processor/components/WorkspaceHeader.tsx \
  src/modules/raw-processor/components/index.ts \
  src/modules/raw-processor/hooks/useImageSession.ts \
  src/modules/raw-processor/hooks/useRawProcessor.ts \
  src/modules/raw-processor/model/session.ts \
  src/modules/raw-processor/__tests__/raw-route-shell.test.tsx \
  src/modules/raw-processor/__tests__/workspace-ui.test.tsx
git commit -m "fix: polish raw lab responsive states"
```

When no files changed after verification, skip this commit.

### Task 9: Final Integration Check

**Files:**
- No planned code changes.

- [ ] **Step 1: Check worktree**

Run:

```bash
git status --short
```

Expected: only intentional uncommitted files, or a clean worktree.

- [ ] **Step 2: Review commit stack**

Run:

```bash
git log --oneline --max-count=12
```

Expected commits include:

```text
test: define raw lab workspace shell
feat: add raw lab compare stage shell
feat: add raw compare split interaction
feat: render split compare in raw preview pipeline
feat: replace raw upload page with lab workspace
feat: refine raw lab controls for product UI
test: cover raw lab compare stage states
```

Optional final polish commit only if Task 8 found issues.

- [ ] **Step 3: Record verification evidence for handoff**

Prepare a short final note with:

```text
Automated:
- pnpm test -- --run ...
- pnpm exec tsc --noEmit
- pnpm build

Browser:
- /raw desktop 1440 x 1000
- /raw tablet 900 x 1100
- /raw mobile 390 x 844
- loaded RAW fixture path and observed export gate state
```

Do not claim full-resolution export passed unless a real supported source exported successfully during the browser check.
