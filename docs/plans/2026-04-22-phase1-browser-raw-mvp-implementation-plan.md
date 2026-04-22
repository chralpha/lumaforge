# Phase 1 Browser RAW MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first shippable browser-local RAW styling workflow in `LumaForge`: single-file RAW upload, quick preview, HQ preview, builtin/custom LUT styling, compare mode, and JPEG export with fidelity fallback.

**Architecture:** Keep the existing `src/modules/raw-processor` route as the feature shell, but split state and behavior into focused units: capability gate, image session state, preview pipeline, style system, render core adapter, and export system. Reuse `src/lib/raw`, `src/lib/lut`, and `src/lib/gl`, while removing MVP-external controls from the product UI.

**Tech Stack:** React 19, React Router 7, Jotai, Vite 8, TailwindCSS 4, `libraw-wasm`, WebGL2, Vitest, Testing Library, jsdom

---

## Scope Guard

This plan implements the approved design spec at [2026-04-22-phase1-browser-raw-mvp-design.md](/workspaces/LumaForge/LumaForge/docs/specs/2026-04-22-phase1-browser-raw-mvp-design.md).

Do not expand into:

- batch import/export
- account or cloud features
- TIFF/PNG/WebP product export
- exposure / saturation / contrast / log-space product controls
- AI features
- mobile-first optimization work

## File Structure Map

### Existing files to keep and refocus

- Modify: `package.json`
  Add test scripts and test dependencies.

- Modify: `src/types/libraw-wasm.d.ts`
  Bring the type definition in line with the settings object supported by `libraw-wasm`.

- Modify: `src/lib/raw/decoder.ts`
  Make decode options real, expose quick/HQ decode helpers, and keep browser-only decode logic isolated.

- Modify: `src/lib/lut/cube-parser.ts`
  Enforce first-phase `.cube` constraints and return structured validation errors.

- Modify: `src/lib/export/index.ts`
  Export the new JPEG-only product-facing export entry points.

- Modify: `src/lib/gl/pipeline.ts`
  Add the minimum API needed for compare mode, finite intensity levels, and hidden-canvas export renders.

- Modify: `src/modules/raw-processor/RawProcessorView.tsx`
  Turn it into the route shell that switches between unsupported, upload, and workspace states.

- Modify: `src/modules/raw-processor/components/ControlsPanel.tsx`
  Remove MVP-external controls and replace them with style-focused controls.

- Modify: `src/modules/raw-processor/components/Dropzone.tsx`
  Match first-phase upload and replace-file behavior.

- Modify: `src/modules/raw-processor/components/PreviewCanvas.tsx`
  Consume session/render state and preserve view state across preview upgrades.

- Modify: `src/modules/raw-processor/components/ProgressOverlay.tsx`
  Reflect first-phase progress phases and recovery actions.

- Modify: `src/modules/raw-processor/components/index.ts`
  Re-export the new shell components.

- Modify: `src/modules/raw-processor/hooks/useRawProcessor.ts`
  Shrink it into a composition hook that wires together capability, session, preview, style, and export actions.

- Modify: `src/modules/raw-processor/hooks/index.ts`
  Re-export the new hooks.

- Modify: `src/pages/(main)/raw.tsx`
  Keep the route stable while pointing at the refactored shell.

### New files to create

- Create: `vitest.config.ts`
  Project test runner configuration.

- Create: `src/test/setup.ts`
  Testing Library and DOM setup.

- Create: `src/modules/raw-processor/model/session.ts`
  Stable first-phase types for session, preview bundle, style asset, view state, render state, and export state.

- Create: `src/modules/raw-processor/model/derive-session.ts`
  Pure selectors such as `deriveCanEdit`, `deriveCanExport`, and `selectDisplaySource`.

- Create: `src/modules/raw-processor/state/session.atoms.ts`
  Module-local Jotai atoms for the current image session and helper actions.

- Create: `src/modules/raw-processor/hooks/useCapabilityGate.ts`
  Browser capability detection for the route shell.

- Create: `src/modules/raw-processor/hooks/useImageSession.ts`
  Session creation, replacement, reset, and style/view mutations.

- Create: `src/modules/raw-processor/services/preview-pipeline.ts`
  The orchestrator for embedded preview strategy, quick decode, and HQ decode.

- Create: `src/modules/raw-processor/services/builtin-presets.ts`
  The first-phase builtin preset registry.

- Create: `src/modules/raw-processor/services/style-system.ts`
  Style asset loading, custom LUT validation, finite intensity levels, and style plan generation.

- Create: `src/modules/raw-processor/services/support-matrix.ts`
  Support classification helpers and the initial `official`/`experimental` matrix loader.

- Create: `src/modules/raw-processor/services/export-system.ts`
  JPEG-only export job orchestration, fidelity fallback, and filename generation.

- Create: `src/modules/raw-processor/components/UnsupportedState.tsx`
  Hard-stop screen for missing WebGL2.

- Create: `src/modules/raw-processor/components/UploadState.tsx`
  Upload-page shell with privacy/support copy.

- Create: `src/modules/raw-processor/components/WorkspaceHeader.tsx`
  File name, support badge, replace, reset, and export controls.

- Create: `src/modules/raw-processor/components/SupportBadge.tsx`
  `official`/`experimental` product badge.

- Create: `src/modules/raw-processor/components/IntensityChips.tsx`
  Finite intensity-level control.

- Create: `src/modules/raw-processor/__tests__/raw-route-shell.test.tsx`
  Shell state tests.

- Create: `src/modules/raw-processor/__tests__/session-derive.test.ts`
  Pure state derivation tests.

- Create: `src/modules/raw-processor/__tests__/preview-pipeline.test.ts`
  Preview orchestration tests.

- Create: `src/modules/raw-processor/__tests__/style-system.test.ts`
  Builtin/custom style-system tests.

- Create: `src/modules/raw-processor/__tests__/workspace-ui.test.tsx`
  UI-level tests for style-first controls.

- Create: `src/modules/raw-processor/__tests__/export-system.test.ts`
  Export naming and fidelity fallback tests.

- Create: `docs/specs/2026-04-22-phase1-test-matrix.md`
  Initial manual validation matrix and official-fixture record.

## Task 1: Add a Real Test Harness for the RAW Route

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `src/test/setup.ts`
- Create: `src/modules/raw-processor/__tests__/raw-route-shell.test.tsx`

- [ ] **Step 1: Add the test runner and scripts**

Update `package.json` so the repo has an explicit browser-unit-test stack.

```json
{
  "scripts": {
    "build": "vite build",
    "dev": "vite",
    "format": "prettier --write \"src/**/*.ts\" ",
    "lint": "eslint --fix",
    "prepare": "simple-git-hooks",
    "serve": "vite preview",
    "test": "vitest",
    "test:run": "vitest run"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.8.0",
    "@testing-library/react": "^16.3.0",
    "@testing-library/user-event": "^14.6.1",
    "jsdom": "^26.1.0",
    "vitest": "^3.2.4"
  }
}
```

- [ ] **Step 2: Add the Vitest config and test setup**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: true,
  },
})
```

Create `src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest'
```

- [ ] **Step 3: Add a smoke test for the existing raw route shell**

Create `src/modules/raw-processor/__tests__/raw-route-shell.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'

import { RawProcessorView } from '../RawProcessorView'

describe('RawProcessorView', () => {
  it('renders the initial upload CTA', () => {
    render(<RawProcessorView />)

    expect(screen.getByText('Drop your RAW file here')).toBeInTheDocument()
  })
})
```

- [ ] **Step 4: Run the smoke test**

Run:

```bash
pnpm install
pnpm test -- --run src/modules/raw-processor/__tests__/raw-route-shell.test.tsx
```

Expected:

```text
PASS  src/modules/raw-processor/__tests__/raw-route-shell.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml vitest.config.ts src/test/setup.ts src/modules/raw-processor/__tests__/raw-route-shell.test.tsx
git commit -m "test: add vitest harness for raw processor"
```

## Task 2: Add the Capability Gate and Three-Screen Shell

**Files:**
- Create: `src/modules/raw-processor/hooks/useCapabilityGate.ts`
- Create: `src/modules/raw-processor/components/UnsupportedState.tsx`
- Create: `src/modules/raw-processor/components/UploadState.tsx`
- Modify: `src/modules/raw-processor/RawProcessorView.tsx`
- Modify: `src/modules/raw-processor/components/index.ts`
- Test: `src/modules/raw-processor/__tests__/raw-route-shell.test.tsx`

- [ ] **Step 1: Write the failing shell-state test**

Append these tests to `src/modules/raw-processor/__tests__/raw-route-shell.test.tsx`:

```tsx
import { vi } from 'vitest'

vi.mock('../hooks/useCapabilityGate', () => ({
  useCapabilityGate: vi.fn(),
}))

const mockedUseCapabilityGate = vi.mocked(
  (await import('../hooks/useCapabilityGate')).useCapabilityGate,
)

describe('RawProcessorView shell states', () => {
  it('shows the unsupported state when WebGL2 is unavailable', () => {
    mockedUseCapabilityGate.mockReturnValue({
      ready: true,
      supportStatus: 'unsupported',
      reason: 'WebGL2 is required',
    })

    render(<RawProcessorView />)

    expect(screen.getByText('This browser is not supported')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
pnpm test -- --run src/modules/raw-processor/__tests__/raw-route-shell.test.tsx
```

Expected:

```text
FAIL  src/modules/raw-processor/__tests__/raw-route-shell.test.tsx
Error: Failed to resolve import "../hooks/useCapabilityGate"
```

- [ ] **Step 3: Add the capability hook and unsupported/upload shell components**

Create `src/modules/raw-processor/hooks/useCapabilityGate.ts`:

```ts
import { useMemo } from 'react'

import { detectCapabilities } from '~/lib/gl/context'

export function useCapabilityGate() {
  return useMemo(() => {
    const caps = detectCapabilities()

    if (!caps.webgl2) {
      return {
        ready: true,
        supportStatus: 'unsupported' as const,
        reason: 'WebGL2 is required',
      }
    }

    return {
      ready: true,
      supportStatus: 'supported' as const,
      reason: null,
    }
  }, [])
}
```

Create `src/modules/raw-processor/components/UnsupportedState.tsx`:

```tsx
export function UnsupportedState({ reason }: { reason: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <h2 className="text-2xl font-semibold text-text">
        This browser is not supported
      </h2>
      <p className="max-w-xl text-sm text-text-secondary">{reason}</p>
      <p className="max-w-xl text-sm text-text-tertiary">
        Use the latest desktop Chrome, Edge, or Safari with WebGL2 enabled.
      </p>
    </div>
  )
}
```

Create `src/modules/raw-processor/components/UploadState.tsx`:

```tsx
import { FileDropzone } from './Dropzone'

export function UploadState({
  onFileDrop,
  disabled,
}: {
  onFileDrop: (files: File[]) => void
  disabled?: boolean
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 p-8">
      <div className="max-w-2xl text-center">
        <h1 className="text-3xl font-semibold text-text">
          Browser-local RAW styling
        </h1>
        <p className="mt-3 text-sm text-text-secondary">
          Upload one RAW photo, preview it fast, apply a builtin look or a
          custom LUT, and export a share-ready JPEG.
        </p>
        <p className="mt-2 text-xs text-text-tertiary">
          Your photo stays in this browser by default and is not uploaded to a
          server.
        </p>
      </div>

      <FileDropzone onFileDrop={onFileDrop} disabled={disabled} />
    </div>
  )
}
```

Modify the top of `src/modules/raw-processor/RawProcessorView.tsx`:

```tsx
import { useCapabilityGate } from './hooks/useCapabilityGate'
import { UnsupportedState } from './components/UnsupportedState'
import { UploadState } from './components/UploadState'
```

Then replace the empty-state branch:

```tsx
  const capability = useCapabilityGate()

  if (capability.ready && capability.supportStatus === 'unsupported') {
    return <UnsupportedState reason={capability.reason || 'WebGL2 is required'} />
  }

  // ...

        {!hasImage ? (
          <m.div
            className="flex-1 flex items-center justify-center p-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={Spring.presets.smooth}
          >
            <UploadState onFileDrop={handleFileDrop} disabled={isProcessing} />
          </m.div>
        ) : (
```

Update `src/modules/raw-processor/components/index.ts`:

```ts
export { UnsupportedState } from './UnsupportedState'
export { UploadState } from './UploadState'
```

- [ ] **Step 4: Run the shell-state tests**

Run:

```bash
pnpm test -- --run src/modules/raw-processor/__tests__/raw-route-shell.test.tsx
```

Expected:

```text
PASS  src/modules/raw-processor/__tests__/raw-route-shell.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add src/modules/raw-processor/hooks/useCapabilityGate.ts src/modules/raw-processor/components/UnsupportedState.tsx src/modules/raw-processor/components/UploadState.tsx src/modules/raw-processor/components/index.ts src/modules/raw-processor/RawProcessorView.tsx src/modules/raw-processor/__tests__/raw-route-shell.test.tsx
git commit -m "feat: add capability gate and raw route shell states"
```

## Task 3: Introduce the First-Phase Session Model and Derived Selectors

**Files:**
- Create: `src/modules/raw-processor/model/session.ts`
- Create: `src/modules/raw-processor/model/derive-session.ts`
- Create: `src/modules/raw-processor/state/session.atoms.ts`
- Create: `src/modules/raw-processor/hooks/useImageSession.ts`
- Modify: `src/modules/raw-processor/hooks/useRawProcessor.ts`
- Modify: `src/modules/raw-processor/hooks/index.ts`
- Test: `src/modules/raw-processor/__tests__/session-derive.test.ts`

- [ ] **Step 1: Write the failing selector tests**

Create `src/modules/raw-processor/__tests__/session-derive.test.ts`:

```ts
import {
  deriveCanEdit,
  deriveCanExport,
  selectDisplaySource,
} from '../model/derive-session'
import type { ImageSession } from '../model/session'

const baseSession: ImageSession = {
  id: 's1',
  createdAt: 1,
  sourceFile: {
    name: 'frame.ARW',
    extension: 'arw',
    sizeBytes: 1,
    supportLevel: 'experimental',
  },
  previewBundle: {
    embeddedPreview: { status: 'idle' },
    quickDecodePreview: { status: 'idle' },
    hqImage: { status: 'idle' },
    displaySource: 'none',
    hqRequiredForExport: true,
  },
  activeStyle: null,
  viewState: {
    mode: 'processed',
    zoom: 1,
    panX: 0,
    panY: 0,
    fitMode: 'screen',
  },
  renderState: { status: 'idle' },
  exportState: {
    status: 'idle',
    qualityPreset: 'high',
    fidelityLevel: 'balanced',
    retryRecommended: false,
  },
}

describe('session derivation', () => {
  it('enables editing when any preview source is ready', () => {
    const session = {
      ...baseSession,
      previewBundle: {
        ...baseSession.previewBundle,
        quickDecodePreview: { status: 'ready', width: 200, height: 100 },
      },
    }

    expect(deriveCanEdit(session)).toBe(true)
    expect(selectDisplaySource(session.previewBundle)).toBe('quick')
  })

  it('enables export only when hq is ready and no export is running', () => {
    expect(deriveCanExport(baseSession)).toBe(false)

    const session = {
      ...baseSession,
      activeStyle: {
        kind: 'builtin' as const,
        name: 'Neutral',
        defaultIntensityLevel: 'standard' as const,
        currentIntensityLevel: 'standard' as const,
      },
      previewBundle: {
        ...baseSession.previewBundle,
        hqImage: { status: 'ready', width: 4000, height: 3000 },
      },
      renderState: { status: 'ready' as const },
    }

    expect(deriveCanExport(session)).toBe(true)
  })
})
```

- [ ] **Step 2: Run the selector tests and verify they fail**

Run:

```bash
pnpm test -- --run src/modules/raw-processor/__tests__/session-derive.test.ts
```

Expected:

```text
FAIL  src/modules/raw-processor/__tests__/session-derive.test.ts
Error: Failed to resolve import "../model/derive-session"
```

- [ ] **Step 3: Add the session model, selectors, and module-local atoms**

Create `src/modules/raw-processor/model/session.ts`:

```ts
export type SupportLevel = 'official' | 'experimental' | 'unsupported'
export type PreviewStatus = 'idle' | 'loading' | 'ready' | 'failed'
export type DisplaySource = 'embedded' | 'quick' | 'hq' | 'none'
export type IntensityLevel = 'off' | 'light' | 'standard' | 'strong'
export type ExportFidelity = 'safe' | 'balanced' | 'max'

export type PreviewAsset = {
  status: PreviewStatus
  width?: number
  height?: number
  bitmap?: ImageBitmap | null
  errorCode?: string
}

export type PreviewBundle = {
  embeddedPreview: PreviewAsset
  quickDecodePreview: PreviewAsset
  hqImage: PreviewAsset
  displaySource: DisplaySource
  hqRequiredForExport: true
}

export type StyleAsset = {
  kind: 'builtin' | 'custom'
  name: string
  defaultIntensityLevel: Exclude<IntensityLevel, 'off'>
  currentIntensityLevel: IntensityLevel
  warning?: string
  lutAsset?: {
    format: 'cube'
    dimension: 17 | 33 | 65
    title?: string
  }
  inputPrepProfile?: {
    profileId: string
    description: string
  }
}

export type ImageSession = {
  id: string
  createdAt: number
  sourceFile: {
    name: string
    extension: string
    sizeBytes: number
    rawFormat?: string
    cameraBrand?: string
    cameraModel?: string
    width?: number
    height?: number
    supportLevel: SupportLevel
  }
  previewBundle: PreviewBundle
  activeStyle: StyleAsset | null
  viewState: {
    mode: 'processed' | 'original'
    zoom: number
    panX: number
    panY: number
    fitMode: 'screen' | 'custom'
  }
  renderState: {
    status: 'idle' | 'preparing' | 'rendering' | 'ready' | 'failed'
    lastRenderSource?: Exclude<DisplaySource, 'none'>
    lastErrorCode?: string
  }
  exportState: {
    status: 'idle' | 'preparing' | 'exporting' | 'done' | 'failed'
    qualityPreset: 'standard' | 'high'
    fidelityLevel: ExportFidelity
    recommendedRetryLevel?: Extract<ExportFidelity, 'safe' | 'balanced'>
    lastSuccessfulSize?: { width: number; height: number }
    lastErrorCode?: string
    retryRecommended: boolean
  }
}
```

Create `src/modules/raw-processor/model/derive-session.ts`:

```ts
import type { ImageSession, PreviewBundle } from './session'

export function selectDisplaySource(
  preview: PreviewBundle,
): 'embedded' | 'quick' | 'hq' | 'none' {
  if (preview.hqImage.status === 'ready') return 'hq'
  if (preview.quickDecodePreview.status === 'ready') return 'quick'
  if (preview.embeddedPreview.status === 'ready') return 'embedded'
  return 'none'
}

export function deriveCanEdit(session: ImageSession): boolean {
  return selectDisplaySource(session.previewBundle) !== 'none'
}

export function deriveCanExport(session: ImageSession): boolean {
  return (
    session.previewBundle.hqImage.status === 'ready' &&
    session.renderState.status !== 'failed' &&
    session.exportState.status !== 'exporting'
  )
}
```

Create `src/modules/raw-processor/state/session.atoms.ts`:

```ts
import { atom } from 'jotai'

import type { ImageSession } from '../model/session'
import { selectDisplaySource } from '../model/derive-session'

export const currentSessionAtom = atom<ImageSession | null>(null)

export const displaySourceAtom = atom((get) => {
  const session = get(currentSessionAtom)
  return session ? selectDisplaySource(session.previewBundle) : 'none'
})
```

Create `src/modules/raw-processor/hooks/useImageSession.ts`:

```ts
import { useAtom } from 'jotai'
import { useCallback } from 'react'

import { currentSessionAtom } from '../state/session.atoms'
import type { ImageSession, StyleAsset } from '../model/session'

function createEmptySession(file: File): ImageSession {
  return {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    sourceFile: {
      name: file.name,
      extension: file.name.split('.').pop()?.toLowerCase() || '',
      sizeBytes: file.size,
      supportLevel: 'experimental',
    },
    previewBundle: {
      embeddedPreview: { status: 'idle' },
      quickDecodePreview: { status: 'idle' },
      hqImage: { status: 'idle' },
      displaySource: 'none',
      hqRequiredForExport: true,
    },
    activeStyle: null,
    viewState: { mode: 'processed', zoom: 1, panX: 0, panY: 0, fitMode: 'screen' },
    renderState: { status: 'idle' },
    exportState: {
      status: 'idle',
      qualityPreset: 'high',
      fidelityLevel: 'balanced',
      retryRecommended: false,
    },
  }
}

export function useImageSession() {
  const [session, setSession] = useAtom(currentSessionAtom)

  const replaceFile = useCallback((file: File) => {
    setSession(createEmptySession(file))
  }, [setSession])

  const resetSession = useCallback(() => {
    setSession(null)
  }, [setSession])

  const setActiveStyle = useCallback((style: StyleAsset | null) => {
    setSession((prev) => (prev ? { ...prev, activeStyle: style } : prev))
  }, [setSession])

  return { session, replaceFile, resetSession, setActiveStyle, setSession }
}
```

Modify `src/modules/raw-processor/hooks/useRawProcessor.ts` to compose `useImageSession()` instead of holding ad hoc local refs for top-level session state.

- [ ] **Step 4: Run the selector tests**

Run:

```bash
pnpm test -- --run src/modules/raw-processor/__tests__/session-derive.test.ts
```

Expected:

```text
PASS  src/modules/raw-processor/__tests__/session-derive.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/modules/raw-processor/model/session.ts src/modules/raw-processor/model/derive-session.ts src/modules/raw-processor/state/session.atoms.ts src/modules/raw-processor/hooks/useImageSession.ts src/modules/raw-processor/hooks/useRawProcessor.ts src/modules/raw-processor/hooks/index.ts src/modules/raw-processor/__tests__/session-derive.test.ts
git commit -m "feat: add first-phase image session model"
```

## Task 4: Build the Preview Pipeline with Quick/HQ Fallback

**Files:**
- Modify: `src/types/libraw-wasm.d.ts`
- Modify: `src/lib/raw/decoder.ts`
- Create: `src/modules/raw-processor/services/preview-pipeline.ts`
- Modify: `src/modules/raw-processor/hooks/useRawProcessor.ts`
- Test: `src/modules/raw-processor/__tests__/preview-pipeline.test.ts`

- [ ] **Step 1: Write the failing preview orchestration tests**

Create `src/modules/raw-processor/__tests__/preview-pipeline.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'

import { runPreviewPipeline } from '../services/preview-pipeline'

describe('runPreviewPipeline', () => {
  it('falls back to quick preview when embedded preview is unavailable', async () => {
    const onEvent = vi.fn()

    await runPreviewPipeline({
      file: new File(['raw'], 'frame.ARW'),
      extractEmbeddedPreview: vi.fn().mockResolvedValue(null),
      decodeQuickPreview: vi.fn().mockResolvedValue({ width: 800, height: 600 }),
      decodeHqPreview: vi.fn().mockResolvedValue({ width: 4000, height: 3000 }),
      onEvent,
    })

    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'quick-ready', width: 800, height: 600 }),
    )
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'hq-ready', width: 4000, height: 3000 }),
    )
  })
})
```

- [ ] **Step 2: Run the preview test and verify it fails**

Run:

```bash
pnpm test -- --run src/modules/raw-processor/__tests__/preview-pipeline.test.ts
```

Expected:

```text
FAIL  src/modules/raw-processor/__tests__/preview-pipeline.test.ts
Error: Failed to resolve import "../services/preview-pipeline"
```

- [ ] **Step 3: Make decode options real and add the preview pipeline service**

Update `src/types/libraw-wasm.d.ts`:

```ts
export interface LibRawOpenOptions {
  halfSize?: boolean
  useCameraWb?: boolean
  outputColor?: number
  outputBps?: 8 | 16
  noAutoBright?: boolean
}

export default class LibRaw {
  constructor()
  open(data: Uint8Array, options?: LibRawOpenOptions): Promise<void>
  metadata(detailed?: boolean): Promise<LibRawMetadata>
  imageData(): Promise<LibRawImageData>
}
```

Update the core of `src/lib/raw/decoder.ts`:

```ts
export interface DecodeOptions {
  useCameraWB?: boolean
  outputColorSpace?: 'raw' | 'sRGB' | 'AdobeRGB' | 'ProPhotoRGB'
  halfSize?: boolean
}

function toLibRawOptions(options?: DecodeOptions) {
  return {
    halfSize: options?.halfSize ?? false,
    useCameraWb: options?.useCameraWB ?? true,
    outputColor: 1,
    outputBps: 16 as const,
    noAutoBright: true,
  }
}

// ...
await libraw.open(uint8Array, toLibRawOptions(_options))
```

Add helpers near the bottom of `src/lib/raw/decoder.ts`:

```ts
export async function decodeQuickRaw(file: File, onProgress?: ProgressCallback) {
  return decodeRaw(file, { useCameraWB: true, halfSize: true }, onProgress)
}

export async function decodeHqRaw(file: File, onProgress?: ProgressCallback) {
  return decodeRaw(file, { useCameraWB: true, halfSize: false }, onProgress)
}
```

Create `src/modules/raw-processor/services/preview-pipeline.ts`:

```ts
type PreviewEvent =
  | { type: 'embedded-ready'; width: number; height: number }
  | { type: 'quick-ready'; width: number; height: number }
  | { type: 'hq-ready'; width: number; height: number }
  | { type: 'hq-failed'; errorCode: string }

export async function runPreviewPipeline({
  file,
  extractEmbeddedPreview,
  decodeQuickPreview,
  decodeHqPreview,
  onEvent,
}: {
  file: File
  extractEmbeddedPreview: (file: File) => Promise<{ width: number; height: number } | null>
  decodeQuickPreview: (file: File) => Promise<{ width: number; height: number }>
  decodeHqPreview: (file: File) => Promise<{ width: number; height: number }>
  onEvent: (event: PreviewEvent) => void
}) {
  const embedded = await extractEmbeddedPreview(file)
  if (embedded) {
    onEvent({ type: 'embedded-ready', ...embedded })
  }

  if (!embedded) {
    const quick = await decodeQuickPreview(file)
    onEvent({ type: 'quick-ready', ...quick })
  }

  try {
    const hq = await decodeHqPreview(file)
    onEvent({ type: 'hq-ready', ...hq })
  } catch {
    onEvent({ type: 'hq-failed', errorCode: 'RAW_HQ_DECODE_FAILED' })
  }
}

export async function extractEmbeddedPreviewBestEffort() {
  return null
}
```

Modify `src/modules/raw-processor/hooks/useRawProcessor.ts` to call `runPreviewPipeline()` after `replaceFile(file)` and to submit results only when the active `session.id` still matches.

- [ ] **Step 4: Run the preview tests**

Run:

```bash
pnpm test -- --run src/modules/raw-processor/__tests__/preview-pipeline.test.ts
```

Expected:

```text
PASS  src/modules/raw-processor/__tests__/preview-pipeline.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/types/libraw-wasm.d.ts src/lib/raw/decoder.ts src/modules/raw-processor/services/preview-pipeline.ts src/modules/raw-processor/hooks/useRawProcessor.ts src/modules/raw-processor/__tests__/preview-pipeline.test.ts
git commit -m "feat: add quick and hq preview pipeline"
```

## Task 5: Add the Style System for Builtin Presets and Custom LUTs

**Files:**
- Modify: `src/lib/lut/cube-parser.ts`
- Create: `src/modules/raw-processor/services/builtin-presets.ts`
- Create: `src/modules/raw-processor/services/style-system.ts`
- Modify: `src/modules/raw-processor/hooks/useRawProcessor.ts`
- Test: `src/modules/raw-processor/__tests__/style-system.test.ts`

- [ ] **Step 1: Write the failing style-system tests**

Create `src/modules/raw-processor/__tests__/style-system.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import {
  buildBuiltinStyle,
  mapIntensityLevel,
  toCustomStyle,
} from '../services/style-system'

describe('style-system', () => {
  it('builds builtin styles with an input prep profile', () => {
    const style = buildBuiltinStyle('film-soft')

    expect(style.kind).toBe('builtin')
    expect(style.inputPrepProfile?.profileId).toBe('normalized-film-soft')
  })

  it('maps finite intensity levels to blend values', () => {
    expect(mapIntensityLevel('off')).toBe(0)
    expect(mapIntensityLevel('standard')).toBe(0.7)
    expect(mapIntensityLevel('strong')).toBe(1)
  })

  it('adds a best-effort warning to custom LUT styles', () => {
    const style = toCustomStyle({
      title: 'Client LUT',
      size: 33,
      domainMin: [0, 0, 0],
      domainMax: [1, 1, 1],
      data: new Float32Array(33 * 33 * 33 * 3),
    })

    expect(style.kind).toBe('custom')
    expect(style.warning).toMatch(/best effort/i)
  })
})
```

- [ ] **Step 2: Run the style-system test and verify it fails**

Run:

```bash
pnpm test -- --run src/modules/raw-processor/__tests__/style-system.test.ts
```

Expected:

```text
FAIL  src/modules/raw-processor/__tests__/style-system.test.ts
Error: Failed to resolve import "../services/style-system"
```

- [ ] **Step 3: Enforce first-phase LUT constraints and add the style registry**

Update `src/lib/lut/cube-parser.ts` validation:

```ts
export function validateLUT(lut: ParsedLUT): {
  valid: boolean
  errors: string[]
} {
  const errors: string[] = []

  if (![17, 33, 65].includes(lut.size)) {
    errors.push(`Unsupported LUT size: ${lut.size}. Only 17, 33, and 65 are allowed in phase 1.`)
  }

  const expectedLength = lut.size * lut.size * lut.size * 3
  if (lut.data.length !== expectedLength) {
    errors.push(
      `Data length mismatch: expected ${expectedLength}, got ${lut.data.length}`,
    )
  }

  for (let i = 0; i < lut.data.length; i++) {
    if (!Number.isFinite(lut.data[i])) {
      errors.push(`Invalid value at index ${i}: ${lut.data[i]}`)
      break
    }
  }

  return { valid: errors.length === 0, errors }
}
```

Create `src/modules/raw-processor/services/builtin-presets.ts`:

```ts
export const BUILTIN_PRESETS = [
  {
    id: 'neutral',
    name: 'Neutral',
    description: 'Clean baseline look',
    inputPrepProfile: { profileId: 'normalized-neutral', description: 'Neutral normalized path' },
    defaultIntensityLevel: 'standard' as const,
  },
  {
    id: 'warm',
    name: 'Warm',
    description: 'Softer warm contrast',
    inputPrepProfile: { profileId: 'normalized-warm', description: 'Warm normalized path' },
    defaultIntensityLevel: 'standard' as const,
  },
  {
    id: 'cool',
    name: 'Cool',
    description: 'Cooler blue-green separation',
    inputPrepProfile: { profileId: 'normalized-cool', description: 'Cool normalized path' },
    defaultIntensityLevel: 'standard' as const,
  },
  {
    id: 'film-soft',
    name: 'Film Soft',
    description: 'Gentle filmic contrast',
    inputPrepProfile: { profileId: 'normalized-film-soft', description: 'Soft film prep' },
    defaultIntensityLevel: 'standard' as const,
  },
  {
    id: 'film-contrast',
    name: 'Film Contrast',
    description: 'Punchier film response',
    inputPrepProfile: { profileId: 'normalized-film-contrast', description: 'Contrast film prep' },
    defaultIntensityLevel: 'strong' as const,
  },
  {
    id: 'cinematic',
    name: 'Cinematic',
    description: 'Cinematic crossover look',
    inputPrepProfile: { profileId: 'normalized-cinematic', description: 'Cinematic prep' },
    defaultIntensityLevel: 'standard' as const,
  },
  {
    id: 'fade',
    name: 'Fade',
    description: 'Lifted shadows and gentle rolloff',
    inputPrepProfile: { profileId: 'normalized-fade', description: 'Faded prep' },
    defaultIntensityLevel: 'light' as const,
  },
  {
    id: 'mono',
    name: 'Mono',
    description: 'Black and white finish',
    inputPrepProfile: { profileId: 'normalized-mono', description: 'Mono prep' },
    defaultIntensityLevel: 'standard' as const,
  },
] as const
```

Create `src/modules/raw-processor/services/style-system.ts`:

```ts
import type { ParsedLUT } from '~/lib/lut/cube-parser'

import { BUILTIN_PRESETS } from './builtin-presets'

export function mapIntensityLevel(level: 'off' | 'light' | 'standard' | 'strong') {
  if (level === 'off') return 0
  if (level === 'light') return 0.4
  if (level === 'standard') return 0.7
  return 1
}

export function buildBuiltinStyle(id: (typeof BUILTIN_PRESETS)[number]['id']) {
  const preset = BUILTIN_PRESETS.find((item) => item.id === id)
  if (!preset) throw new Error(`Unknown builtin preset: ${id}`)

  return {
    kind: 'builtin' as const,
    name: preset.name,
    defaultIntensityLevel: preset.defaultIntensityLevel,
    currentIntensityLevel: preset.defaultIntensityLevel,
    inputPrepProfile: preset.inputPrepProfile,
  }
}

export function toCustomStyle(lut: ParsedLUT) {
  return {
    kind: 'custom' as const,
    name: lut.title || 'Custom LUT',
    defaultIntensityLevel: 'standard' as const,
    currentIntensityLevel: 'standard' as const,
    warning:
      'Custom LUTs are applied in a best-effort path and may not match pro video software exactly.',
    lutAsset: {
      format: 'cube' as const,
      dimension: lut.size as 17 | 33 | 65,
      title: lut.title,
    },
  }
}
```

Modify `src/modules/raw-processor/hooks/useRawProcessor.ts` so builtin preset selection and custom LUT upload both update the session via the new style-system functions, and keep only one active style at a time.

- [ ] **Step 4: Run the style-system tests**

Run:

```bash
pnpm test -- --run src/modules/raw-processor/__tests__/style-system.test.ts
```

Expected:

```text
PASS  src/modules/raw-processor/__tests__/style-system.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/lut/cube-parser.ts src/modules/raw-processor/services/builtin-presets.ts src/modules/raw-processor/services/style-system.ts src/modules/raw-processor/hooks/useRawProcessor.ts src/modules/raw-processor/__tests__/style-system.test.ts
git commit -m "feat: add builtin and custom style system"
```

## Task 6: Refactor the Workspace UI Around Styling, Compare Mode, and Support Badges

**Files:**
- Create: `src/modules/raw-processor/components/WorkspaceHeader.tsx`
- Create: `src/modules/raw-processor/components/SupportBadge.tsx`
- Create: `src/modules/raw-processor/components/IntensityChips.tsx`
- Modify: `src/modules/raw-processor/components/ControlsPanel.tsx`
- Modify: `src/modules/raw-processor/components/PreviewCanvas.tsx`
- Modify: `src/modules/raw-processor/components/ProgressOverlay.tsx`
- Modify: `src/modules/raw-processor/RawProcessorView.tsx`
- Test: `src/modules/raw-processor/__tests__/workspace-ui.test.tsx`

- [ ] **Step 1: Write the failing workspace UI tests**

Create `src/modules/raw-processor/__tests__/workspace-ui.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'

import { ControlsPanel } from '../components/ControlsPanel'

describe('ControlsPanel', () => {
  it('shows finite intensity choices and no pro controls', () => {
    render(
      <ControlsPanel
        presetOptions={[
          { id: 'neutral', name: 'Neutral' },
          { id: 'warm', name: 'Warm' },
        ]}
        activePresetId="neutral"
        activeIntensity="standard"
        viewMode="processed"
        onPresetSelect={() => {}}
        onIntensitySelect={() => {}}
        onViewModeChange={() => {}}
        onLutLoad={() => {}}
        onLutClear={() => {}}
        onExport={() => {}}
        canExport={false}
        isProcessing={false}
      />,
    )

    expect(screen.getByText('Neutral')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Standard' })).toBeInTheDocument()
    expect(screen.queryByText('Exposure')).not.toBeInTheDocument()
    expect(screen.queryByText('Log Space')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the UI test and verify it fails**

Run:

```bash
pnpm test -- --run src/modules/raw-processor/__tests__/workspace-ui.test.tsx
```

Expected:

```text
FAIL  src/modules/raw-processor/__tests__/workspace-ui.test.tsx
TypeError: Cannot read properties of undefined
```

- [ ] **Step 3: Replace pro controls with style-first workspace controls**

Create `src/modules/raw-processor/components/SupportBadge.tsx`:

```tsx
export function SupportBadge({
  level,
}: {
  level: 'official' | 'experimental'
}) {
  return (
    <span
      className={
        level === 'official'
          ? 'rounded-full bg-green/10 px-2 py-1 text-xs text-green'
          : 'rounded-full bg-yellow/10 px-2 py-1 text-xs text-yellow'
      }
    >
      {level === 'official' ? 'Official support' : 'Experimental support'}
    </span>
  )
}
```

Create `src/modules/raw-processor/components/IntensityChips.tsx`:

```tsx
const LEVELS = ['off', 'light', 'standard', 'strong'] as const

export function IntensityChips({
  value,
  onChange,
}: {
  value: (typeof LEVELS)[number]
  onChange: (value: (typeof LEVELS)[number]) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {LEVELS.map((level) => (
        <button
          key={level}
          type="button"
          onClick={() => onChange(level)}
          className={
            value === level
              ? 'rounded-full bg-accent px-3 py-1 text-xs text-background'
              : 'rounded-full bg-fill px-3 py-1 text-xs text-text-secondary'
          }
        >
          {level[0].toUpperCase() + level.slice(1)}
        </button>
      ))}
    </div>
  )
}
```

Rewrite `src/modules/raw-processor/components/ControlsPanel.tsx` props and render path:

```tsx
export interface ControlsPanelProps {
  presetOptions: Array<{ id: string; name: string }>
  activePresetId: string | null
  activeIntensity: 'off' | 'light' | 'standard' | 'strong'
  viewMode: 'processed' | 'original'
  onPresetSelect: (id: string) => void
  onIntensitySelect: (level: 'off' | 'light' | 'standard' | 'strong') => void
  onViewModeChange: (mode: 'processed' | 'original') => void
  onLutLoad: (files: File[]) => void
  onLutClear: () => void
  onExport: (options: { quality: 'standard' | 'high'; fidelity: 'safe' | 'balanced' | 'max' }) => void
  canExport: boolean
  isProcessing: boolean
}
```

Render this control body:

```tsx
<div className="space-y-6">
  <section className="space-y-3">
    <label className="text-sm font-medium text-text">Builtin looks</label>
    <div className="grid grid-cols-2 gap-2">
      {presetOptions.map((preset) => (
        <button
          key={preset.id}
          type="button"
          onClick={() => onPresetSelect(preset.id)}
          className={
            activePresetId === preset.id
              ? 'rounded-xl border border-accent bg-accent/10 px-3 py-3 text-left text-sm text-text'
              : 'rounded-xl border border-border bg-background px-3 py-3 text-left text-sm text-text-secondary'
          }
        >
          {preset.name}
        </button>
      ))}
    </div>
  </section>

  <section className="space-y-3">
    <label className="text-sm font-medium text-text">Intensity</label>
    <IntensityChips value={activeIntensity} onChange={onIntensitySelect} />
  </section>

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
</div>
```

Update the processing params shape in `src/lib/gl/pipeline.ts` so the workspace passes MVP-only rendering inputs:

```ts
export interface ProcessingParams {
  intensity: number
  viewMode: 'processed' | 'original'
}

const DEFAULT_PARAMS: ProcessingParams = {
  intensity: 0.7,
  viewMode: 'processed',
}
```

Modify `src/modules/raw-processor/RawProcessorView.tsx` header branch so it uses `WorkspaceHeader` and `SupportBadge` instead of the current generic `RAW Processor` header.

Create `src/modules/raw-processor/components/WorkspaceHeader.tsx`:

```tsx
import { SupportBadge } from './SupportBadge'

export function WorkspaceHeader({
  fileName,
  supportLevel,
  canExport,
  onReplaceFile,
  onResetSession,
  onOpenExport,
}: {
  fileName: string
  supportLevel: 'official' | 'experimental'
  canExport: boolean
  onReplaceFile: () => void
  onResetSession: () => void
  onOpenExport: () => void
}) {
  return (
    <header className="flex items-center justify-between gap-4 border-b border-border px-6 py-4">
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          <h1 className="truncate text-lg font-semibold text-text">{fileName}</h1>
          <SupportBadge level={supportLevel} />
        </div>
        <p className="text-xs text-text-tertiary">
          Browser-local RAW styling workspace
        </p>
      </div>

      <div className="flex items-center gap-2">
        <button type="button" onClick={onReplaceFile} className="rounded-lg bg-fill px-3 py-2 text-sm text-text">
          Replace file
        </button>
        <button type="button" onClick={onResetSession} className="rounded-lg bg-fill px-3 py-2 text-sm text-text">
          Reset
        </button>
        <button
          type="button"
          onClick={onOpenExport}
          disabled={!canExport}
          className="rounded-lg bg-accent px-3 py-2 text-sm text-background disabled:opacity-50"
        >
          Export JPEG
        </button>
      </div>
    </header>
  )
}
```

Modify the render path in `src/modules/raw-processor/components/PreviewCanvas.tsx` so compare mode is controlled by `viewMode` rather than by swapping the session image:

```tsx
useEffect(() => {
  const pipeline = pipelineRef.current
  if (!pipeline || !isInitialized || !imageData) return

  pipeline.setParams({
    ...params,
    intensity:
      params.viewMode === 'original'
        ? 0
        : params.intensity,
  })

  const stats = pipeline.render()
  onStatsUpdate?.(stats)
}, [params, isInitialized, imageData, onStatsUpdate])
```

- [ ] **Step 4: Run the workspace UI tests**

Run:

```bash
pnpm test -- --run src/modules/raw-processor/__tests__/workspace-ui.test.tsx
```

Expected:

```text
PASS  src/modules/raw-processor/__tests__/workspace-ui.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add src/modules/raw-processor/components/WorkspaceHeader.tsx src/modules/raw-processor/components/SupportBadge.tsx src/modules/raw-processor/components/IntensityChips.tsx src/modules/raw-processor/components/ControlsPanel.tsx src/modules/raw-processor/components/PreviewCanvas.tsx src/modules/raw-processor/components/ProgressOverlay.tsx src/modules/raw-processor/RawProcessorView.tsx src/modules/raw-processor/__tests__/workspace-ui.test.tsx
git commit -m "feat: refocus raw workspace around styling controls"
```

## Task 7: Add JPEG Export Jobs with Fidelity Fallback

**Files:**
- Create: `src/modules/raw-processor/services/export-system.ts`
- Modify: `src/lib/export/index.ts`
- Modify: `src/lib/gl/pipeline.ts`
- Modify: `src/modules/raw-processor/hooks/useRawProcessor.ts`
- Test: `src/modules/raw-processor/__tests__/export-system.test.ts`

- [ ] **Step 1: Write the failing export-system tests**

Create `src/modules/raw-processor/__tests__/export-system.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import {
  buildExportFilename,
  recommendRetryLevel,
} from '../services/export-system'

describe('export-system', () => {
  it('generates filenames for builtin and custom styles', () => {
    expect(buildExportFilename('frame.ARW', 'Neutral')).toBe('frame_Neutral.jpg')
    expect(buildExportFilename('frame.ARW', 'custom')).toBe('frame_custom.jpg')
  })

  it('recommends the next lower fidelity level on failure', () => {
    expect(recommendRetryLevel('max')).toBe('balanced')
    expect(recommendRetryLevel('balanced')).toBe('safe')
    expect(recommendRetryLevel('safe')).toBe(null)
  })
})
```

- [ ] **Step 2: Run the export test and verify it fails**

Run:

```bash
pnpm test -- --run src/modules/raw-processor/__tests__/export-system.test.ts
```

Expected:

```text
FAIL  src/modules/raw-processor/__tests__/export-system.test.ts
Error: Failed to resolve import "../services/export-system"
```

- [ ] **Step 3: Add the export service and hidden-canvas render path**

Create `src/modules/raw-processor/services/export-system.ts`:

```ts
export function buildExportFilename(inputName: string, styleName: string) {
  const basename = inputName.replace(/\.[^.]+$/, '')
  return `${basename}_${styleName}.jpg`
}

export function recommendRetryLevel(
  level: 'safe' | 'balanced' | 'max',
): 'safe' | 'balanced' | null {
  if (level === 'max') return 'balanced'
  if (level === 'balanced') return 'safe'
  return null
}

export async function runExportJob({
  renderToCanvas,
  filename,
  quality,
}: {
  renderToCanvas: () => Promise<HTMLCanvasElement>
  filename: string
  quality: number
}) {
  const canvas = await renderToCanvas()

  return await new Promise<{ filename: string; blob: Blob }>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('EXPORT_JPEG_BLOB_FAILED'))
          return
        }

        resolve({ filename, blob })
      },
      'image/jpeg',
      quality,
    )
  })
}
```

Update `src/lib/export/index.ts`:

```ts
export * from './tiff-encoder'
export * from '~/modules/raw-processor/services/export-system'
```

Add this API to `src/lib/gl/pipeline.ts`:

```ts
private inputPixels: Float32Array | null = null

uploadImage(data: Float32Array, width: number, height: number): void {
  this.inputPixels = data
  // existing texture upload logic stays here
}

async renderToHiddenCanvas({
  width,
  height,
}: {
  width: number
  height: number
}) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const pipeline = new RawProcessingPipeline(canvas)
  await pipeline.initialize()
  if (!this.inputPixels) {
    throw new Error('EXPORT_SOURCE_MISSING')
  }

  pipeline.uploadImage(this.inputPixels, this.inputWidth, this.inputHeight)
  if (this.lutData) pipeline.uploadLUT(this.lutData)
  pipeline.setParams(this.params)
  pipeline.render()

  return canvas
}
```

Modify `src/modules/raw-processor/hooks/useRawProcessor.ts` so export:

- requires HQ ready
- converts `high` to `0.95` and `standard` to `0.85`
- records `recommendedRetryLevel` when export fails
- never reuses the visible preview canvas as the export source

Use this shape for the export action:

```ts
const exportImage = useCallback(
  async ({
    quality,
    fidelity,
  }: {
    quality: 'standard' | 'high'
    fidelity: 'safe' | 'balanced' | 'max'
  }) => {
    if (!session || session.previewBundle.hqImage.status !== 'ready' || !pipelineRef.current) {
      toast.error('High-quality preview is required before export')
      return
    }

    try {
      setSession((prev) =>
        prev
          ? {
              ...prev,
              exportState: {
                ...prev.exportState,
                status: 'exporting',
                qualityPreset: quality,
                fidelityLevel: fidelity,
                retryRecommended: false,
                recommendedRetryLevel: undefined,
              },
            }
          : prev,
      )

      const filename = buildExportFilename(
        session.sourceFile.name,
        session.activeStyle?.kind === 'custom' ? 'custom' : session.activeStyle?.name || 'original',
      )

      await runExportJob({
        filename,
        quality: quality === 'high' ? 0.95 : 0.85,
        renderToCanvas: () =>
          pipelineRef.current!.renderToHiddenCanvas({
            width: session.sourceFile.width || 0,
            height: session.sourceFile.height || 0,
          }),
      })

      setSession((prev) =>
        prev
          ? {
              ...prev,
              exportState: { ...prev.exportState, status: 'done', retryRecommended: false },
            }
          : prev,
      )
    } catch {
      const retryLevel = recommendRetryLevel(fidelity)

      setSession((prev) =>
        prev
          ? {
              ...prev,
              exportState: {
                ...prev.exportState,
                status: 'failed',
                lastErrorCode: 'EXPORT_RENDER_FAILED',
                retryRecommended: retryLevel !== null,
                recommendedRetryLevel: retryLevel ?? undefined,
              },
            }
          : prev,
      )
    }
  },
  [pipelineRef, session, setSession],
)
```

- [ ] **Step 4: Run the export-system tests**

Run:

```bash
pnpm test -- --run src/modules/raw-processor/__tests__/export-system.test.ts
```

Expected:

```text
PASS  src/modules/raw-processor/__tests__/export-system.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/modules/raw-processor/services/export-system.ts src/lib/export/index.ts src/lib/gl/pipeline.ts src/modules/raw-processor/hooks/useRawProcessor.ts src/modules/raw-processor/__tests__/export-system.test.ts
git commit -m "feat: add jpeg export jobs with fidelity fallback"
```

## Task 8: Add Error Codes, Support Classification, and the Initial Test Matrix

**Files:**
- Create: `src/modules/raw-processor/services/support-matrix.ts`
- Modify: `src/modules/raw-processor/hooks/useRawProcessor.ts`
- Modify: `src/modules/raw-processor/components/ProgressOverlay.tsx`
- Create: `docs/specs/2026-04-22-phase1-test-matrix.md`
- Test: `src/modules/raw-processor/__tests__/raw-route-shell.test.tsx`

- [ ] **Step 1: Write the failing support-classification test**

Append this test to `src/modules/raw-processor/__tests__/raw-route-shell.test.tsx`:

```tsx
import { classifySupportLevel } from '../services/support-matrix'

describe('support classification', () => {
  it('marks unknown but decodable files as experimental', () => {
    expect(
      classifySupportLevel({
        cameraBrand: 'Sony',
        cameraModel: 'Unknown Model',
        rawFormat: 'arw',
      }),
    ).toBe('experimental')
  })
})
```

- [ ] **Step 2: Run the shell/support tests and verify they fail**

Run:

```bash
pnpm test -- --run src/modules/raw-processor/__tests__/raw-route-shell.test.tsx
```

Expected:

```text
FAIL  src/modules/raw-processor/__tests__/raw-route-shell.test.tsx
Error: Failed to resolve import "../services/support-matrix"
```

- [ ] **Step 3: Add support classification, error-code mapping, and the initial matrix doc**

Create `src/modules/raw-processor/services/support-matrix.ts`:

```ts
export type SupportKey = {
  cameraBrand?: string
  cameraModel?: string
  rawFormat?: string
}

const OFFICIAL_MATRIX: Array<SupportKey> = []

export function classifySupportLevel(input: SupportKey) {
  const isOfficial = OFFICIAL_MATRIX.some(
    (entry) =>
      entry.cameraBrand === input.cameraBrand &&
      entry.cameraModel === input.cameraModel &&
      entry.rawFormat === input.rawFormat,
  )

  return isOfficial ? 'official' : 'experimental'
}
```

Add this error-code mapper near the top of `src/modules/raw-processor/hooks/useRawProcessor.ts`:

```ts
function toUserFacingErrorCode(code: unknown) {
  if (typeof code === 'string' && code.startsWith('LUT_')) return code
  if (typeof code === 'string' && code.startsWith('EXPORT_')) return code
  if (typeof code === 'string' && code.startsWith('RAW_')) return code
  return 'RAW_UNKNOWN'
}
```

Create `docs/specs/2026-04-22-phase1-test-matrix.md`:

```md
# Phase 1 Test Matrix

## Official Matrix Seed

The implementation starts with every successfully decoded file marked as `experimental`.
Promote a camera to `official` only after it passes the full checklist below on a local desktop browser with WebGL2.

## Required checks per official fixture

- upload succeeds
- first visible preview appears
- HQ preview completes
- builtin preset can be applied
- custom `.cube` can be applied
- compare mode works without resetting zoom
- JPEG export succeeds at `balanced`

## Current local fixtures

- `/workspaces/LumaForge/test-images/SGL00940.ARW`
- `/workspaces/LumaForge/test-images/SGL_1998.NEF`

## Promotion rule

After each fixture passes the checklist, record the observed `cameraBrand`, `cameraModel`, and `rawFormat` in `src/modules/raw-processor/services/support-matrix.ts` and move that fixture from `experimental` to `official`.
```

Modify `src/modules/raw-processor/components/ProgressOverlay.tsx` to accept recovery copy, not just a generic spinner label:

```tsx
export interface ProgressOverlayProps {
  visible: boolean
  phase: 'loading' | 'decoding' | 'processing' | 'exporting'
  progress?: number
  message?: string
  recoveryHint?: string
  className?: string
}
```

And render the hint:

```tsx
{recoveryHint && (
  <p className="mt-2 max-w-xs text-center text-xs text-text-tertiary">
    {recoveryHint}
  </p>
)}
```

- [ ] **Step 4: Run the support/error tests**

Run:

```bash
pnpm test -- --run src/modules/raw-processor/__tests__/raw-route-shell.test.tsx
```

Expected:

```text
PASS  src/modules/raw-processor/__tests__/raw-route-shell.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add src/modules/raw-processor/services/support-matrix.ts src/modules/raw-processor/hooks/useRawProcessor.ts src/modules/raw-processor/components/ProgressOverlay.tsx docs/specs/2026-04-22-phase1-test-matrix.md src/modules/raw-processor/__tests__/raw-route-shell.test.tsx
git commit -m "feat: add support classification and recovery guidance"
```

## Task 9: Run the Full First-Phase Validation Sweep

**Files:**
- Modify: `docs/specs/2026-04-22-phase1-test-matrix.md`
- Test: `src/modules/raw-processor/__tests__/raw-route-shell.test.tsx`
- Test: `src/modules/raw-processor/__tests__/session-derive.test.ts`
- Test: `src/modules/raw-processor/__tests__/preview-pipeline.test.ts`
- Test: `src/modules/raw-processor/__tests__/style-system.test.ts`
- Test: `src/modules/raw-processor/__tests__/workspace-ui.test.tsx`
- Test: `src/modules/raw-processor/__tests__/export-system.test.ts`

- [ ] **Step 1: Run the full automated test suite**

Run:

```bash
pnpm test:run
```

Expected:

```text
PASS  src/modules/raw-processor/__tests__/raw-route-shell.test.tsx
PASS  src/modules/raw-processor/__tests__/session-derive.test.ts
PASS  src/modules/raw-processor/__tests__/preview-pipeline.test.ts
PASS  src/modules/raw-processor/__tests__/style-system.test.ts
PASS  src/modules/raw-processor/__tests__/workspace-ui.test.tsx
PASS  src/modules/raw-processor/__tests__/export-system.test.ts
Test Files  6 passed
```

- [ ] **Step 2: Run the production build**

Run:

```bash
pnpm build
```

Expected:

```text
vite v8
✓ built in
```

- [ ] **Step 3: Execute the manual checklist with local fixtures**

Run:

```bash
pnpm dev
```

Then verify in the browser with:

- `/workspaces/LumaForge/test-images/SGL00940.ARW`
- `/workspaces/LumaForge/test-images/SGL_1998.NEF`
- one legal `33x33x33` `.cube`
- one illegal `.cube` with the wrong size

Record results in `docs/specs/2026-04-22-phase1-test-matrix.md` using this exact section format:

```md
## Validation Results

### Fixture: SGL00940.ARW
- upload: PASS
- first preview: PASS
- HQ preview: PASS
- builtin preset: PASS
- custom LUT: PASS
- compare mode: PASS
- export balanced: PASS
- export max: FAIL
- retry at safe: PASS

### Fixture: SGL_1998.NEF
- upload: PASS
- first preview: PASS
- HQ preview: PASS
- builtin preset: PASS
- custom LUT: PASS
- compare mode: PASS
- export balanced: PASS
```

- [ ] **Step 4: Review the diff and ensure MVP scope stayed intact**

Run:

```bash
git diff --stat HEAD~9..HEAD
```

Expected:

```text
Only phase-1 raw MVP files changed; no TIFF/PNG product UI, no pro adjustment controls, no cloud/account code.
```

- [ ] **Step 5: Commit**

```bash
git add docs/specs/2026-04-22-phase1-test-matrix.md
git commit -m "docs: record phase 1 raw mvp validation results"
```

## Self-Review

### Spec coverage

- Product shell and WebGL2 hard gate: Task 2
- Session model and derived state: Task 3
- Quick/HQ preview flow and fallback: Task 4
- Builtin/custom style split and finite intensity levels: Task 5 and Task 6
- Compare mode and style-first workspace: Task 6
- JPEG-only export with fidelity fallback: Task 7
- Error recovery and support classification: Task 8
- Validation matrix and final acceptance sweep: Task 8 and Task 9

### Placeholder scan

This plan intentionally avoids `TODO`, `TBD`, “handle this later”, and “similar to task N”. All file paths, commands, and code targets are explicit.

### Type consistency

The plan uses the same names throughout:

- `ImageSession`
- `deriveCanEdit`
- `deriveCanExport`
- `runPreviewPipeline`
- `buildBuiltinStyle`
- `toCustomStyle`
- `buildExportFilename`
- `recommendRetryLevel`
- `classifySupportLevel`

No later task renames these APIs.
