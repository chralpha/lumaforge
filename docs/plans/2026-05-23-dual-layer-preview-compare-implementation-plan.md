# Dual-Layer Preview Compare Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace shader-driven compare interaction with a capability-gated layered preview viewer: primary dual-WebGL compare, with a bounded JPEG original-left layer as the compatibility fallback.

**Architecture:** Keep RAW decode and export boundaries unchanged. Prefer two CSS-clipped WebGL preview canvases when capability policy allows it: one original technical-base pipeline and one processed pipeline. When two live preview pipelines are unsafe, generate one revocable JPEG original snapshot and keep the processed WebGL canvas. Do not fall back to the current single-canvas WebGL compare shader.

**Tech Stack:** TypeScript, React 19, Jotai session state, Vitest, Testing Library, Playwright, WebGL2, CSS `clip-path`, `@lumaforge/luma-raw-runtime`, `@lumaforge/luma-color-runtime`.

---

## Source Spec

Implement against:

- `docs/specs/2026-05-23-dual-layer-preview-compare-design.md`
- `docs/specs/2026-04-25-high-resolution-browser-export-design.md`
- `docs/specs/2026-04-28-raw-lab-ui-redesign-design.md`
- `docs/specs/2026-05-01-ios-safari-100mp-export-compatibility-design.md`

Preserve these invariants:

- Export remains the authoritative full-resolution JPEG path.
- Preview never creates a full-resolution RGB, Canvas, ImageData, or WebGL
  surface.
- Two persistent WebGL preview pipelines are allowed only when the compare mode
  policy selects `dual-webgl`.
- The current single-canvas shader compare path is not a fallback target.
- JPEG fallback failure degrades preview only; it does not weaken export gates.
- Pre-export evacuation releases the original snapshot together with other
  preview resources.

## Execution Preflight

Use the current repo root:

```bash
cd /workspaces/LumaForge/LumaForge
git status --short --untracked-files=all
pnpm install --frozen-lockfile
```

Expected:

- `git status` shows only intentional local changes.
- `pnpm install --frozen-lockfile` exits `0`.

If isolation is needed for implementation, create a repo-local worktree:

```bash
pnpm worktree feat/dual-layer-preview-compare
cd /workspaces/LumaForge/LumaForge/.worktrees/feat/dual-layer-preview-compare
pnpm install --frozen-lockfile
```

## File Structure

Create:

- `src/modules/raw-processor/services/compare-render-mode.ts`: choose `dual-webgl`, `jpeg-fallback`, or `processed-only` from capability and snapshot state.
- `src/modules/raw-processor/services/compare-render-mode.test.ts`: mode-selection tests that prove single-canvas shader compare is never selected.
- `src/modules/raw-processor/services/original-reference-snapshot.ts`: snapshot key, pixel policy, resource metadata, and cleanup helpers.
- `src/modules/raw-processor/services/original-reference-snapshot.test.ts`: key, policy, and cleanup tests.
- `src/modules/raw-processor/services/original-reference-renderer.ts`: one-shot original snapshot renderer using a temporary `RawProcessingPipeline`.
- `src/modules/raw-processor/services/original-reference-renderer.test.ts`: renderer success/failure/resource cleanup tests with mocked pipeline and canvas APIs.
- `src/modules/raw-processor/hooks/useOriginalReferenceSnapshot.ts`: React lifecycle hook for creating, replacing, revoking, and falling back from snapshots.
- `src/modules/raw-processor/hooks/useOriginalReferenceSnapshot.test.tsx`: hook tests for source changes, quick-to-bounded-HQ upgrades, unmount cleanup, and failed generation.
- `src/modules/raw-processor/components/OriginalWebglLayer.tsx`: primary left-side original WebGL canvas layer.
- `src/modules/raw-processor/components/OriginalWebglLayer.test.tsx`: original pipeline params and lifecycle tests.
- `src/modules/raw-processor/components/OriginalReferenceLayer.tsx`: presentational left-side image layer.
- `src/modules/raw-processor/components/OriginalReferenceLayer.test.tsx`: rendering and accessibility-hidden tests.

Modify:

- `src/modules/raw-processor/components/ComparePreviewStage.tsx`: pass original snapshot state into `PreviewCanvas`.
- `src/modules/raw-processor/components/PreviewCanvas.tsx`: render dual-WebGL primary mode, JPEG fallback mode, and processed-only mode; keep processed WebGL in processed mode while layered compare is active; skip shader split renders during viewer-only interaction.
- `src/modules/raw-processor/components/preview-canvas.css`: add layer, clip, and scoped `will-change` rules.
- `src/modules/raw-processor/hooks/useRawProcessor.ts`: register snapshot object URLs with the existing resource registry and clear snapshots on preview evacuation/reset.
- `src/modules/raw-processor/hooks/useRawProcessor.test.tsx`: resource registry, export evacuation, and interaction render-count coverage.
- `src/modules/raw-processor/__tests__/workspace-ui.test.tsx`: loaded compare DOM/fallback tests.
- `src/modules/raw-processor/services/preview-viewport.ts`: keep helper behavior but stop relying on shader compare compensation when CSS compare is active.
- `src/modules/raw-processor/components/PreviewCanvas.test.ts`: render-count and CSS compare mode tests.

Use without modifying:

- `src/lib/export/resource-registry.ts`: the implementation uses existing `owner: 'preview'` and `kind: 'object-url'`.

Do not modify:

- Full-resolution export strip scheduling.
- LUT contract resolution.
- RAW runtime processed-window export APIs.
- Generated route files.

---

### Task 1: Compare Render Mode Policy

**Files:**

- Create: `src/modules/raw-processor/services/compare-render-mode.ts`
- Create: `src/modules/raw-processor/services/compare-render-mode.test.ts`

- [ ] **Step 1: Write failing mode-selection tests**

Create `src/modules/raw-processor/services/compare-render-mode.test.ts`:

```ts
import { selectCompareRenderMode } from './compare-render-mode'

describe('selectCompareRenderMode', () => {
  it('prefers dual WebGL when capability allows two live preview pipelines', () => {
    expect(
      selectCompareRenderMode({
        requestedViewMode: 'compare',
        supportsCssClip: true,
        dualWebglAllowed: true,
        originalWebglReady: true,
        jpegSnapshotReady: false,
      }),
    ).toEqual({ kind: 'dual-webgl' })
  })

  it('uses JPEG fallback when dual WebGL is not allowed and a snapshot is ready', () => {
    expect(
      selectCompareRenderMode({
        requestedViewMode: 'compare',
        supportsCssClip: true,
        dualWebglAllowed: false,
        originalWebglReady: false,
        jpegSnapshotReady: true,
      }),
    ).toEqual({ kind: 'jpeg-fallback', reason: 'dual-webgl-unavailable' })
  })

  it('uses JPEG fallback when left WebGL fails after dual WebGL was allowed', () => {
    expect(
      selectCompareRenderMode({
        requestedViewMode: 'compare',
        supportsCssClip: true,
        dualWebglAllowed: true,
        originalWebglReady: false,
        originalWebglFailed: true,
        jpegSnapshotReady: true,
      }),
    ).toEqual({ kind: 'jpeg-fallback', reason: 'original-webgl-failed' })
  })

  it('does not select the legacy single-canvas shader compare path', () => {
    expect(
      selectCompareRenderMode({
        requestedViewMode: 'compare',
        supportsCssClip: false,
        dualWebglAllowed: true,
        originalWebglReady: false,
        jpegSnapshotReady: true,
      }),
    ).toEqual({ kind: 'processed-only', reason: 'css-clip-unavailable' })
  })
})
```

- [ ] **Step 2: Run the failing mode-selection tests**

```bash
pnpm test:run src/modules/raw-processor/services/compare-render-mode.test.ts --exclude '.worktrees/**'
```

Expected: fail because `compare-render-mode.ts` does not exist.

- [ ] **Step 3: Implement the mode selector**

Create `src/modules/raw-processor/services/compare-render-mode.ts`:

```ts
import type { ProcessingParams } from '@lumaforge/luma-color-runtime'

export type CompareRenderMode =
  | { kind: 'off' }
  | { kind: 'dual-webgl' }
  | {
      kind: 'jpeg-fallback'
      reason: 'dual-webgl-unavailable' | 'original-webgl-failed'
    }
  | {
      kind: 'processed-only'
      reason:
        | 'not-compare'
        | 'css-clip-unavailable'
        | 'jpeg-fallback-unavailable'
    }

export type SelectCompareRenderModeInput = {
  requestedViewMode: ProcessingParams['viewMode']
  supportsCssClip: boolean
  dualWebglAllowed: boolean
  originalWebglReady: boolean
  originalWebglFailed?: boolean
  jpegSnapshotReady: boolean
}

export function selectCompareRenderMode({
  requestedViewMode,
  supportsCssClip,
  dualWebglAllowed,
  originalWebglReady,
  originalWebglFailed = false,
  jpegSnapshotReady,
}: SelectCompareRenderModeInput): CompareRenderMode {
  if (requestedViewMode !== 'compare') return { kind: 'off' }
  if (!supportsCssClip) {
    return { kind: 'processed-only', reason: 'css-clip-unavailable' }
  }
  if (dualWebglAllowed && originalWebglReady) return { kind: 'dual-webgl' }
  if (jpegSnapshotReady) {
    return {
      kind: 'jpeg-fallback',
      reason: originalWebglFailed
        ? 'original-webgl-failed'
        : 'dual-webgl-unavailable',
    }
  }

  return { kind: 'processed-only', reason: 'jpeg-fallback-unavailable' }
}
```

- [ ] **Step 4: Run the mode-selection tests**

```bash
pnpm test:run src/modules/raw-processor/services/compare-render-mode.test.ts --exclude '.worktrees/**'
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/modules/raw-processor/services/compare-render-mode.ts src/modules/raw-processor/services/compare-render-mode.test.ts
git commit -m "feat(raw): select layered compare render mode"
```

---

### Task 2: JPEG Fallback Snapshot Model And Policy

**Files:**

- Create: `src/modules/raw-processor/services/original-reference-snapshot.ts`
- Create: `src/modules/raw-processor/services/original-reference-snapshot.test.ts`

- [ ] **Step 1: Write failing snapshot model tests**

Create `src/modules/raw-processor/services/original-reference-snapshot.test.ts`:

```ts
import {
  createOriginalReferenceSnapshotKey,
  getOriginalReferenceSnapshotMaxPixels,
  releaseOriginalReferenceSnapshot,
} from './original-reference-snapshot'

describe('original reference snapshot policy', () => {
  it('keys the snapshot by source facts and technical-base facts only', () => {
    const base = createOriginalReferenceSnapshotKey({
      sessionId: 'session-a',
      displaySource: 'quick',
      imageVersion: 3,
      width: 2000,
      height: 1250,
      renderExposureEv: 0.5,
      policyVersion: 1,
    })

    const styleChange = createOriginalReferenceSnapshotKey({
      sessionId: 'session-a',
      displaySource: 'quick',
      imageVersion: 3,
      width: 2000,
      height: 1250,
      renderExposureEv: 0.5,
      policyVersion: 1,
      ignored: {
        split: 0.82,
        zoom: 4,
        panX: 120,
        panY: -30,
        styleFingerprint: 'classic-709',
        lutFingerprint: 'lut-a',
        intensity: 0.25,
        userExposureEv: 1,
      },
    })

    expect(styleChange).toBe(base)
  })

  it('changes the key for bounded HQ upgrade and render exposure change', () => {
    const quick = createOriginalReferenceSnapshotKey({
      sessionId: 'session-a',
      displaySource: 'quick',
      imageVersion: 3,
      width: 2000,
      height: 1250,
      renderExposureEv: 0.5,
      policyVersion: 1,
    })

    expect(
      createOriginalReferenceSnapshotKey({
        sessionId: 'session-a',
        displaySource: 'bounded-hq',
        imageVersion: 4,
        width: 4000,
        height: 3000,
        renderExposureEv: 0.5,
        policyVersion: 1,
      }),
    ).not.toBe(quick)

    expect(
      createOriginalReferenceSnapshotKey({
        sessionId: 'session-a',
        displaySource: 'quick',
        imageVersion: 3,
        width: 2000,
        height: 1250,
        renderExposureEv: 0.75,
        policyVersion: 1,
      }),
    ).not.toBe(quick)
  })

  it('caps snapshot pixels by capability policy and active preview dimensions', () => {
    expect(
      getOriginalReferenceSnapshotMaxPixels({
        displaySourcePixels: 12_000_000,
        webKitClass: 'webkit-mobile',
        pthread: false,
      }),
    ).toBe(2_500_000)

    expect(
      getOriginalReferenceSnapshotMaxPixels({
        displaySourcePixels: 2_000_000,
        webKitClass: 'chromium',
        pthread: true,
      }),
    ).toBe(2_000_000)
  })

  it('revokes object URLs exactly once', () => {
    const revokeObjectURL = vi.fn()
    const snapshot = {
      key: 'snapshot-a',
      objectUrl: 'blob:original-a',
      width: 100,
      height: 50,
      source: 'quick' as const,
      mimeType: 'image/jpeg' as const,
      estimatedBytes: 1234,
    }

    releaseOriginalReferenceSnapshot(snapshot, { revokeObjectURL })
    releaseOriginalReferenceSnapshot(snapshot, { revokeObjectURL })

    expect(revokeObjectURL).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:original-a')
  })
})
```

- [ ] **Step 2: Run the failing tests**

```bash
pnpm test:run src/modules/raw-processor/services/original-reference-snapshot.test.ts --exclude '.worktrees/**'
```

Expected: fail because `original-reference-snapshot.ts` does not exist.

- [ ] **Step 3: Implement the snapshot model**

Create `src/modules/raw-processor/services/original-reference-snapshot.ts`:

```ts
import type { DisplaySource } from '../model/session'

export type OriginalReferenceSnapshot = {
  key: string
  objectUrl: string
  width: number
  height: number
  source: Extract<DisplaySource, 'quick' | 'bounded-hq'>
  mimeType: 'image/jpeg'
  estimatedBytes: number
}

export type OriginalReferenceSnapshotKeyInput = {
  sessionId: string
  displaySource: Extract<DisplaySource, 'quick' | 'bounded-hq'>
  imageVersion: number
  width: number
  height: number
  renderExposureEv: number
  policyVersion: number
  ignored?: Record<string, unknown>
}

export type SnapshotCapabilityPolicyInput = {
  displaySourcePixels: number
  webKitClass:
    | 'chromium'
    | 'webkit-desktop-safari'
    | 'webkit-mobile'
    | 'unknown'
  pthread: boolean
}

const releasedSnapshotUrls = new Set<string>()

export function createOriginalReferenceSnapshotKey({
  sessionId,
  displaySource,
  imageVersion,
  width,
  height,
  renderExposureEv,
  policyVersion,
}: OriginalReferenceSnapshotKeyInput): string {
  return [
    'original-reference',
    `policy:${policyVersion}`,
    `session:${sessionId}`,
    `source:${displaySource}`,
    `version:${imageVersion}`,
    `size:${width}x${height}`,
    `renderExposure:${Number.isFinite(renderExposureEv) ? renderExposureEv : 0}`,
  ].join('|')
}

export function getOriginalReferenceSnapshotMaxPixels({
  displaySourcePixels,
  webKitClass,
  pthread,
}: SnapshotCapabilityPolicyInput): number {
  const policyCap =
    webKitClass === 'webkit-mobile' || !pthread
      ? 2_500_000
      : webKitClass === 'webkit-desktop-safari'
        ? 4_000_000
        : 8_000_000

  return Math.max(1, Math.min(displaySourcePixels, policyCap))
}

export function releaseOriginalReferenceSnapshot(
  snapshot: OriginalReferenceSnapshot | null | undefined,
  {
    revokeObjectURL = URL.revokeObjectURL.bind(URL),
  }: {
    revokeObjectURL?: (url: string) => void
  } = {},
): void {
  if (!snapshot || releasedSnapshotUrls.has(snapshot.objectUrl)) return
  releasedSnapshotUrls.add(snapshot.objectUrl)
  revokeObjectURL(snapshot.objectUrl)
}
```

- [ ] **Step 4: Run the snapshot tests**

```bash
pnpm test:run src/modules/raw-processor/services/original-reference-snapshot.test.ts --exclude '.worktrees/**'
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/modules/raw-processor/services/original-reference-snapshot.ts src/modules/raw-processor/services/original-reference-snapshot.test.ts
git commit -m "feat(raw): define original reference snapshot policy"
```

---

### Task 3: One-Shot Original Snapshot Renderer

**Files:**

- Create: `src/modules/raw-processor/services/original-reference-renderer.ts`
- Create: `src/modules/raw-processor/services/original-reference-renderer.test.ts`

- [ ] **Step 1: Write failing renderer tests**

Create `src/modules/raw-processor/services/original-reference-renderer.test.ts`:

```ts
import type { DecodedImage } from '~/lib/raw/decoder'

import { renderOriginalReferenceSnapshot } from './original-reference-renderer'

const createObjectURL = vi.fn(() => 'blob:original-rendered')
const revokeObjectURL = vi.fn()

function createImage(): DecodedImage {
  return {
    width: 1600,
    height: 1000,
    channels: 3,
    bitsPerChannel: 16,
    data: new Uint16Array(1600 * 1000 * 3),
    layout: 'rgb-u16',
    colorSpace: 'linear-prophoto-rgb',
    source: 'quick',
    metadata: {
      width: 1600,
      height: 1000,
      make: 'Test',
      model: 'Fixture',
    },
    renderExposure: { ev: 0, multiplier: 1, source: 'identity' },
  }
}

describe('renderOriginalReferenceSnapshot', () => {
  beforeEach(() => {
    createObjectURL.mockClear()
    revokeObjectURL.mockClear()
  })

  it('renders original params, encodes a JPEG blob, and disposes the pipeline', async () => {
    const dispose = vi.fn()
    const uploadImage = vi.fn()
    const setParams = vi.fn()
    const render = vi.fn()

    const snapshot = await renderOriginalReferenceSnapshot({
      image: createImage(),
      key: 'snapshot-key',
      maxPixels: 1_000_000,
      createPipeline: () =>
        ({
          initialize: vi.fn().mockResolvedValue(undefined),
          uploadImage,
          setParams,
          render,
          dispose,
        }) as never,
      createCanvas: () =>
        ({
          width: 0,
          height: 0,
          toBlob: (callback: BlobCallback) =>
            callback(new Blob(['jpeg'], { type: 'image/jpeg' })),
        }) as HTMLCanvasElement,
      createObjectURL,
      revokeObjectURL,
    })

    expect(uploadImage).toHaveBeenCalledOnce()
    expect(setParams).toHaveBeenCalledWith(
      expect.objectContaining({
        viewMode: 'original',
        styleKind: 'none',
        intensity: 0,
      }),
    )
    expect(render).toHaveBeenCalledWith({ waitForGpu: true })
    expect(dispose).toHaveBeenCalledWith({ releaseContext: true })
    expect(snapshot).toMatchObject({
      key: 'snapshot-key',
      objectUrl: 'blob:original-rendered',
      width: 1265,
      height: 791,
      source: 'quick',
      mimeType: 'image/jpeg',
      estimatedBytes: 4,
    })
  })

  it('disposes the pipeline and revokes partial output when encoding fails', async () => {
    const dispose = vi.fn()

    await expect(
      renderOriginalReferenceSnapshot({
        image: createImage(),
        key: 'snapshot-key',
        maxPixels: 1_000_000,
        createPipeline: () =>
          ({
            initialize: vi.fn().mockResolvedValue(undefined),
            uploadImage: vi.fn(),
            setParams: vi.fn(),
            render: vi.fn(),
            dispose,
          }) as never,
        createCanvas: () =>
          ({
            width: 0,
            height: 0,
            toBlob: (callback: BlobCallback) => callback(null),
          }) as HTMLCanvasElement,
        createObjectURL,
        revokeObjectURL,
      }),
    ).rejects.toThrow('ORIGINAL_REFERENCE_SNAPSHOT_ENCODE_FAILED')

    expect(dispose).toHaveBeenCalledWith({ releaseContext: true })
    expect(createObjectURL).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the failing tests**

```bash
pnpm test:run src/modules/raw-processor/services/original-reference-renderer.test.ts --exclude '.worktrees/**'
```

Expected: fail because the renderer module does not exist.

- [ ] **Step 3: Implement the renderer**

Create `src/modules/raw-processor/services/original-reference-renderer.ts`:

```ts
import type { ProcessingParams } from '@lumaforge/luma-color-runtime'

import { RawProcessingPipeline } from '~/lib/gl/pipeline'
import type { RawUploadInput } from '~/lib/gl/pipeline'
import type { DecodedImage } from '~/lib/raw/decoder'

import type { OriginalReferenceSnapshot } from './original-reference-snapshot'

type PipelineLike = Pick<
  RawProcessingPipeline,
  'initialize' | 'uploadImage' | 'setParams' | 'render' | 'dispose'
>

export type RenderOriginalReferenceSnapshotInput = {
  image: DecodedImage
  key: string
  maxPixels: number
  createCanvas?: () => HTMLCanvasElement
  createPipeline?: (canvas: HTMLCanvasElement) => PipelineLike
  createObjectURL?: (blob: Blob) => string
  revokeObjectURL?: (url: string) => void
}

const ORIGINAL_REFERENCE_PARAMS: ProcessingParams = {
  viewMode: 'original',
  compareSplit: 0.5,
  intensity: 0,
  styleKind: 'none',
  builtinPreset: null,
  userExposureEv: 0,
  userContrast: 0,
  userHighlights: 0,
  userShadows: 0,
  userWhites: 0,
  userBlacks: 0,
}

function fitWithinPixelCap(width: number, height: number, maxPixels: number) {
  const sourcePixels = Math.max(1, width * height)
  const scale = Math.min(1, Math.sqrt(Math.max(1, maxPixels) / sourcePixels))

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

function canvasToJpegBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('ORIGINAL_REFERENCE_SNAPSHOT_ENCODE_FAILED'))
          return
        }
        resolve(blob)
      },
      'image/jpeg',
      0.92,
    )
  })
}

function createSnapshotUploadInput(image: DecodedImage): RawUploadInput {
  if (
    image.layout === 'rgb-u16' &&
    image.colorSpace === 'linear-prophoto-rgb' &&
    image.data instanceof Uint16Array
  ) {
    return {
      data: image.data,
      width: image.width,
      height: image.height,
      layout: 'rgb-u16',
      colorSpace: 'linear-prophoto-rgb',
      renderExposureEv: image.renderExposure.ev,
      renderExposureMultiplier: image.renderExposure.multiplier,
    }
  }

  if (
    image.layout === 'rgba-float32' &&
    image.colorSpace === 'display-srgb-preview' &&
    image.data instanceof Float32Array
  ) {
    return {
      data: image.data,
      width: image.width,
      height: image.height,
      layout: 'rgba-float32',
      colorSpace: 'display-srgb-preview',
    }
  }

  throw new Error('ORIGINAL_REFERENCE_SNAPSHOT_UNSUPPORTED_INPUT')
}

export async function renderOriginalReferenceSnapshot({
  image,
  key,
  maxPixels,
  createCanvas = () => document.createElement('canvas'),
  createPipeline = (canvas) => new RawProcessingPipeline(canvas),
  createObjectURL = URL.createObjectURL.bind(URL),
}: RenderOriginalReferenceSnapshotInput): Promise<OriginalReferenceSnapshot> {
  const canvas = createCanvas()
  const target = fitWithinPixelCap(image.width, image.height, maxPixels)
  canvas.width = target.width
  canvas.height = target.height

  const pipeline = createPipeline(canvas)
  try {
    await pipeline.initialize()
    pipeline.uploadImage(createSnapshotUploadInput(image))
    pipeline.setParams(ORIGINAL_REFERENCE_PARAMS)
    pipeline.render({ waitForGpu: true })

    const blob = await canvasToJpegBlob(canvas)
    return {
      key,
      objectUrl: createObjectURL(blob),
      width: target.width,
      height: target.height,
      source: image.source === 'bounded-hq' ? 'bounded-hq' : 'quick',
      mimeType: 'image/jpeg',
      estimatedBytes: blob.size,
    }
  } finally {
    pipeline.dispose({ releaseContext: true })
  }
}
```

- [ ] **Step 4: Run the renderer tests**

```bash
pnpm test:run src/modules/raw-processor/services/original-reference-renderer.test.ts --exclude '.worktrees/**'
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/modules/raw-processor/services/original-reference-renderer.ts src/modules/raw-processor/services/original-reference-renderer.test.ts
git commit -m "feat(raw): render original reference snapshots"
```

---

### Task 4: Snapshot Lifecycle Hook

**Files:**

- Create: `src/modules/raw-processor/hooks/useOriginalReferenceSnapshot.ts`
- Create: `src/modules/raw-processor/hooks/useOriginalReferenceSnapshot.test.tsx`

- [ ] **Step 1: Write failing hook tests**

Create `src/modules/raw-processor/hooks/useOriginalReferenceSnapshot.test.tsx`:

```ts
import { renderHook, waitFor } from '@testing-library/react'
import type { DecodedImage } from '~/lib/raw/decoder'

import { useOriginalReferenceSnapshot } from './useOriginalReferenceSnapshot'

function createImage(
  source: 'quick' | 'bounded-hq',
  width = 1600,
): DecodedImage {
  return {
    width,
    height: 1000,
    channels: 3,
    bitsPerChannel: 16,
    data: new Uint16Array(width * 1000 * 3),
    layout: 'rgb-u16',
    colorSpace: 'linear-prophoto-rgb',
    source,
    metadata: { width, height: 1000 },
    renderExposure: { ev: 0, multiplier: 1, source: 'identity' },
  }
}

describe('useOriginalReferenceSnapshot', () => {
  it('creates a snapshot and keeps it stable across style-only rerenders', async () => {
    const renderSnapshot = vi.fn().mockResolvedValue({
      key: 'key-a',
      objectUrl: 'blob:a',
      width: 100,
      height: 50,
      source: 'quick',
      mimeType: 'image/jpeg',
      estimatedBytes: 10,
    })

    const image = createImage('quick')
    const { result, rerender } = renderHook(
      ({ styleVersion }) =>
        useOriginalReferenceSnapshot({
          sessionId: 'session-a',
          image,
          imageVersion: 1,
          displaySource: 'quick',
          capability: { webKitClass: 'chromium', pthread: true },
          styleVersion,
          renderSnapshot,
        }),
      { initialProps: { styleVersion: 1 } },
    )

    await waitFor(() =>
      expect(result.current.snapshot?.objectUrl).toBe('blob:a'),
    )
    rerender({ styleVersion: 2 })

    expect(renderSnapshot).toHaveBeenCalledTimes(1)
  })

  it('keeps the old snapshot visible until bounded HQ replacement is ready', async () => {
    let resolveSecond!: (value: unknown) => void
    const renderSnapshot = vi
      .fn()
      .mockResolvedValueOnce({
        key: 'quick-key',
        objectUrl: 'blob:quick',
        width: 100,
        height: 50,
        source: 'quick',
        mimeType: 'image/jpeg',
        estimatedBytes: 10,
      })
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveSecond = resolve
        }),
      )
    const releaseSnapshot = vi.fn()

    const { result, rerender } = renderHook(
      ({ image, displaySource, imageVersion }) =>
        useOriginalReferenceSnapshot({
          sessionId: 'session-a',
          image,
          imageVersion,
          displaySource,
          capability: { webKitClass: 'chromium', pthread: true },
          renderSnapshot,
          releaseSnapshot,
        }),
      {
        initialProps: {
          image: createImage('quick'),
          displaySource: 'quick' as const,
          imageVersion: 1,
        },
      },
    )

    await waitFor(() =>
      expect(result.current.snapshot?.objectUrl).toBe('blob:quick'),
    )

    rerender({
      image: createImage('bounded-hq', 2400),
      displaySource: 'bounded-hq',
      imageVersion: 2,
    })

    expect(result.current.snapshot?.objectUrl).toBe('blob:quick')
    resolveSecond({
      key: 'hq-key',
      objectUrl: 'blob:hq',
      width: 200,
      height: 100,
      source: 'bounded-hq',
      mimeType: 'image/jpeg',
      estimatedBytes: 20,
    })

    await waitFor(() =>
      expect(result.current.snapshot?.objectUrl).toBe('blob:hq'),
    )
    expect(releaseSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ objectUrl: 'blob:quick' }),
    )
  })

  it('reports fallback when generation fails', async () => {
    const { result } = renderHook(() =>
      useOriginalReferenceSnapshot({
        sessionId: 'session-a',
        image: createImage('quick'),
        imageVersion: 1,
        displaySource: 'quick',
        capability: { webKitClass: 'chromium', pthread: true },
        renderSnapshot: vi
          .fn()
          .mockRejectedValue(
            new Error('ORIGINAL_REFERENCE_SNAPSHOT_ENCODE_FAILED'),
          ),
      }),
    )

    await waitFor(() =>
      expect(result.current.fallbackReason).toBe(
        'ORIGINAL_REFERENCE_SNAPSHOT_ENCODE_FAILED',
      ),
    )
  })
})
```

- [ ] **Step 2: Run the failing hook tests**

```bash
pnpm test:run src/modules/raw-processor/hooks/useOriginalReferenceSnapshot.test.tsx --exclude '.worktrees/**'
```

Expected: fail because the hook module does not exist.

- [ ] **Step 3: Implement the hook**

Create `src/modules/raw-processor/hooks/useOriginalReferenceSnapshot.ts`:

```ts
import { useEffect, useMemo, useRef, useState } from 'react'

import type { DecodedImage } from '~/lib/raw/decoder'

import type { DisplaySource } from '../model/session'
import {
  createOriginalReferenceSnapshotKey,
  getOriginalReferenceSnapshotMaxPixels,
  releaseOriginalReferenceSnapshot,
  type OriginalReferenceSnapshot,
} from '../services/original-reference-snapshot'
import { renderOriginalReferenceSnapshot } from '../services/original-reference-renderer'

export type OriginalReferenceSnapshotCapability = {
  webKitClass:
    | 'chromium'
    | 'webkit-desktop-safari'
    | 'webkit-mobile'
    | 'unknown'
  pthread: boolean
}

export type UseOriginalReferenceSnapshotInput = {
  sessionId: string | null
  image: DecodedImage | null
  imageVersion: number
  displaySource: DisplaySource
  capability: OriginalReferenceSnapshotCapability
  styleVersion?: number
  renderSnapshot?: typeof renderOriginalReferenceSnapshot
  releaseSnapshot?: typeof releaseOriginalReferenceSnapshot
}

export function useOriginalReferenceSnapshot({
  sessionId,
  image,
  imageVersion,
  displaySource,
  capability,
  renderSnapshot = renderOriginalReferenceSnapshot,
  releaseSnapshot = releaseOriginalReferenceSnapshot,
}: UseOriginalReferenceSnapshotInput) {
  const [snapshot, setSnapshot] = useState<OriginalReferenceSnapshot | null>(
    null,
  )
  const [fallbackReason, setFallbackReason] = useState<string | null>(null)
  const snapshotRef = useRef<OriginalReferenceSnapshot | null>(null)

  const key = useMemo(() => {
    if (!sessionId || !image) return null
    if (displaySource !== 'quick' && displaySource !== 'bounded-hq') return null

    return createOriginalReferenceSnapshotKey({
      sessionId,
      displaySource,
      imageVersion,
      width: image.width,
      height: image.height,
      renderExposureEv: image.renderExposure.ev,
      policyVersion: 1,
    })
  }, [displaySource, image, imageVersion, sessionId])

  useEffect(() => {
    if (
      !key ||
      !image ||
      (displaySource !== 'quick' && displaySource !== 'bounded-hq')
    ) {
      return
    }
    if (snapshotRef.current?.key === key) return

    let cancelled = false
    setFallbackReason(null)

    const maxPixels = getOriginalReferenceSnapshotMaxPixels({
      displaySourcePixels: image.width * image.height,
      webKitClass: capability.webKitClass,
      pthread: capability.pthread,
    })

    void renderSnapshot({ image, key, maxPixels })
      .then((nextSnapshot) => {
        if (cancelled) {
          releaseSnapshot(nextSnapshot)
          return
        }
        const previous = snapshotRef.current
        snapshotRef.current = nextSnapshot
        setSnapshot(nextSnapshot)
        if (previous && previous.objectUrl !== nextSnapshot.objectUrl) {
          releaseSnapshot(previous)
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return
        const message =
          error instanceof Error
            ? error.message
            : 'ORIGINAL_REFERENCE_SNAPSHOT_FAILED'
        setFallbackReason(message)
      })

    return () => {
      cancelled = true
    }
  }, [
    capability.pthread,
    capability.webKitClass,
    displaySource,
    image,
    key,
    releaseSnapshot,
    renderSnapshot,
  ])

  useEffect(() => {
    return () => {
      releaseSnapshot(snapshotRef.current)
      snapshotRef.current = null
    }
  }, [releaseSnapshot])

  return {
    snapshot,
    fallbackReason,
  }
}
```

- [ ] **Step 4: Run the hook tests**

```bash
pnpm test:run src/modules/raw-processor/hooks/useOriginalReferenceSnapshot.test.tsx --exclude '.worktrees/**'
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/modules/raw-processor/hooks/useOriginalReferenceSnapshot.ts src/modules/raw-processor/hooks/useOriginalReferenceSnapshot.test.tsx
git commit -m "feat(raw): manage original reference snapshot lifecycle"
```

---

### Task 5: Dual-WebGL Primary And JPEG Fallback Rendering

**Files:**

- Create: `src/modules/raw-processor/components/OriginalWebglLayer.tsx`
- Create: `src/modules/raw-processor/components/OriginalWebglLayer.test.tsx`
- Create: `src/modules/raw-processor/components/OriginalReferenceLayer.tsx`
- Create: `src/modules/raw-processor/components/OriginalReferenceLayer.test.tsx`
- Modify: `src/modules/raw-processor/components/PreviewCanvas.tsx`
- Modify: `src/modules/raw-processor/components/ComparePreviewStage.tsx`
- Modify: `src/modules/raw-processor/components/preview-canvas.css`
- Modify: `src/modules/raw-processor/__tests__/workspace-ui.test.tsx`

- [ ] **Step 1: Write failing component tests**

Add `src/modules/raw-processor/components/OriginalWebglLayer.test.tsx`:

```tsx
import { render, waitFor } from '@testing-library/react'

import { OriginalWebglLayer } from './OriginalWebglLayer'

describe('OriginalWebglLayer', () => {
  it('renders technical-base original params into a left WebGL canvas', async () => {
    const setParams = vi.fn()
    const renderPipeline = vi.fn()

    render(
      <OriginalWebglLayer
        imageRef={{ current: decodedImage }}
        imageVersion={1}
        createPipeline={() =>
          ({
            initialize: vi.fn().mockResolvedValue(undefined),
            uploadImage: vi.fn(),
            setParams,
            render: renderPipeline,
            resize: vi.fn(),
            dispose: vi.fn(),
          }) as never
        }
      />,
    )

    await waitFor(() => expect(renderPipeline).toHaveBeenCalled())
    expect(setParams).toHaveBeenCalledWith(
      expect.objectContaining({
        viewMode: 'original',
        styleKind: 'none',
        intensity: 0,
      }),
    )
  })
})
```

Add `src/modules/raw-processor/components/OriginalReferenceLayer.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'

import { OriginalReferenceLayer } from './OriginalReferenceLayer'

describe('OriginalReferenceLayer', () => {
  it('renders a non-interactive original reference image', () => {
    render(
      <OriginalReferenceLayer
        snapshot={{
          key: 'snapshot-a',
          objectUrl: 'blob:original-a',
          width: 100,
          height: 50,
          source: 'quick',
          mimeType: 'image/jpeg',
          estimatedBytes: 10,
        }}
      />,
    )

    const image = screen.getByRole('img', { hidden: true })
    expect(image).toHaveAttribute('src', 'blob:original-a')
    expect(image).toHaveAttribute('aria-hidden', 'true')
    expect(image).toHaveClass('raw-preview-original-image')
  })
})
```

Add workspace UI tests for both compare modes:

```tsx
expect(
  container.querySelector('.raw-preview-original-webgl-layer'),
).toBeTruthy()
expect(
  container.querySelector('.raw-preview-processed-layer canvas'),
).toBeTruthy()
expect(getPreviewCanvas()).toHaveAttribute('data-compare-mode', 'dual-webgl')

expect(container.querySelector('.raw-preview-original-layer')).toBeTruthy()
expect(getPreviewCanvas()).toHaveAttribute('data-compare-mode', 'jpeg-fallback')
```

- [ ] **Step 2: Run the failing component tests**

```bash
pnpm test:run src/modules/raw-processor/components/OriginalReferenceLayer.test.tsx src/modules/raw-processor/__tests__/workspace-ui.test.tsx --exclude '.worktrees/**'
```

Expected: fail because the mode selector, layer components, and props are not
threaded into `PreviewCanvas`.

- [ ] **Step 3: Create the original layer components**

Create `src/modules/raw-processor/components/OriginalWebglLayer.tsx` as a small
left-canvas owner that uses the same upload helper as `PreviewCanvas`, sets
`viewMode: 'original'`, `styleKind: 'none'`, and `intensity: 0`, and disposes
its pipeline on unmount:

```tsx
import type { RawProcessingPipeline } from '~/lib/gl/pipeline'
import { RawProcessingPipeline as DefaultRawProcessingPipeline } from '~/lib/gl/pipeline'
import type { DecodedImage } from '~/lib/raw/decoder'

import {
  createRawUploadInput,
  syncRawUploadInput,
} from './preview-canvas-helpers'

export function OriginalWebglLayer({
  imageRef,
  imageVersion,
  createPipeline = (canvas) => new DefaultRawProcessingPipeline(canvas),
}: {
  imageRef: React.RefObject<DecodedImage | null>
  imageVersion: number
  createPipeline?: (
    canvas: HTMLCanvasElement,
  ) => Pick<
    RawProcessingPipeline,
    'initialize' | 'uploadImage' | 'setParams' | 'render' | 'resize' | 'dispose'
  >
}) {
  // Implementation mirrors PreviewCanvas lifecycle but owns only the original
  // technical-base left layer. It never receives LUT data and never reads
  // compareSplit.
  return (
    <div className="raw-preview-original-webgl-layer" aria-hidden="true">
      <canvas className="raw-preview-original-webgl-canvas" />
    </div>
  )
}
```

Create `src/modules/raw-processor/components/OriginalReferenceLayer.tsx`:

```tsx
import type { OriginalReferenceSnapshot } from '../services/original-reference-snapshot'

export function OriginalReferenceLayer({
  snapshot,
}: {
  snapshot: OriginalReferenceSnapshot
}) {
  return (
    <div className="raw-preview-original-layer" aria-hidden="true">
      <img
        src={snapshot.objectUrl}
        width={snapshot.width}
        height={snapshot.height}
        alt=""
        aria-hidden="true"
        draggable={false}
        className="raw-preview-original-image"
        decoding="async"
      />
    </div>
  )
}
```

- [ ] **Step 4: Thread snapshot props to the canvas**

Add optional props to `ComparePreviewStageProps`:

```ts
compareRenderMode?: CompareRenderMode
originalReferenceSnapshot?: OriginalReferenceSnapshot | null
originalReferenceFallbackReason?: string | null
dualWebglAllowed?: boolean
```

Pass those props to `PreviewCanvas`.

Add the same optional props to `PreviewCanvasProps`.

- [ ] **Step 5: Render the dual-layer DOM**

In `PreviewCanvas.tsx`, import `OriginalWebglLayer`,
`OriginalReferenceLayer`, and `selectCompareRenderMode`. Derive:

```ts
const hasOriginalReferenceSnapshot = Boolean(originalReferenceSnapshot)
const compareRenderMode = selectCompareRenderMode({
  requestedViewMode: params.viewMode,
  supportsCssClip: supportsCssCompare,
  dualWebglAllowed,
  originalWebglReady,
  originalWebglFailed,
  jpegSnapshotReady: hasOriginalReferenceSnapshot,
})
const useLayeredCompare =
  compareRenderMode.kind === 'dual-webgl' ||
  compareRenderMode.kind === 'jpeg-fallback'
```

Inside the `.raw-preview-surface`, render:

```tsx
{
  compareRenderMode.kind === 'dual-webgl' && (
    <OriginalWebglLayer imageRef={imageRef} imageVersion={imageVersion} />
  )
}

{
  compareRenderMode.kind === 'jpeg-fallback' && originalReferenceSnapshot && (
    <OriginalReferenceLayer snapshot={originalReferenceSnapshot} />
  )
}

;<div
  className={clsxm(
    'raw-preview-processed-layer',
    useLayeredCompare && 'raw-preview-processed-layer-clipped',
  )}
  data-compare-mode={compareRenderMode.kind}
>
  <canvas
    ref={canvasRef}
    className="raw-preview-canvas"
    aria-label={t('raw.preview.aria')}
  />
</div>
```

Keep the embedded preview image outside layered compare mode so embedded-only
sessions continue to behave as they do today. Do not render the legacy
single-canvas shader compare path when `compareRenderMode.kind` is
`processed-only`; render processed preview with compare controls disabled.

- [ ] **Step 6: Add CSS layer rules**

Edit `src/modules/raw-processor/components/preview-canvas.css`:

```css
.raw-preview-original-layer,
.raw-preview-original-webgl-layer,
.raw-preview-processed-layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.raw-preview-original-layer,
.raw-preview-original-webgl-layer {
  z-index: 1;
  clip-path: inset(0 calc(100% - var(--raw-compare-split, 50%)) 0 0);
  pointer-events: none;
}

.raw-preview-processed-layer {
  z-index: 2;
}

.raw-preview-processed-layer-clipped {
  clip-path: inset(0 0 0 var(--raw-compare-split, 50%));
}

.raw-preview-original-image {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  user-select: none;
  -webkit-user-select: none;
  -webkit-user-drag: none;
  -webkit-touch-callout: none;
  pointer-events: none;
}

.raw-preview-original-webgl-canvas {
  display: block;
  width: 100%;
  height: 100%;
  user-select: none;
  -webkit-user-select: none;
  -webkit-user-drag: none;
  -webkit-touch-callout: none;
  pointer-events: none;
}

.raw-preview-frame-interactive .raw-preview-surface,
.raw-preview-frame-panning .raw-preview-surface,
.raw-preview-frame-panning .raw-preview-original-layer,
.raw-preview-frame-panning .raw-preview-processed-layer {
  will-change: transform, clip-path;
}
```

- [ ] **Step 7: Run component tests**

```bash
pnpm test:run src/modules/raw-processor/components/OriginalReferenceLayer.test.tsx src/modules/raw-processor/__tests__/workspace-ui.test.tsx --exclude '.worktrees/**'
```

Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add src/modules/raw-processor/components/OriginalReferenceLayer.tsx src/modules/raw-processor/components/OriginalReferenceLayer.test.tsx src/modules/raw-processor/components/PreviewCanvas.tsx src/modules/raw-processor/components/ComparePreviewStage.tsx src/modules/raw-processor/components/preview-canvas.css src/modules/raw-processor/__tests__/workspace-ui.test.tsx
git commit -m "feat(raw): render dual-layer preview compare"
```

---

### Task 6: Remove WebGL Work From Viewer-Only Interaction

**Files:**

- Modify: `src/modules/raw-processor/components/PreviewCanvas.tsx`
- Modify: `src/modules/raw-processor/services/preview-viewport.ts`
- Modify: `src/modules/raw-processor/hooks/useRawProcessor.test.tsx`
- Modify: `src/modules/raw-processor/components/PreviewCanvas.test.ts`

- [ ] **Step 1: Write failing render-count tests**

In the existing preview tests, mock `RawProcessingPipeline` and assert pure
viewer movement does not call processed-pipeline `render()` when layered compare
is active:

```tsx
it('does not rerender WebGL during split changes when original snapshot compare is active', async () => {
  const renderPipeline = vi.fn()
  vi.mocked(RawProcessingPipeline).mockImplementation(
    () =>
      ({
        initialize: vi.fn().mockResolvedValue(undefined),
        uploadImage: vi.fn(),
        uploadLUT: vi.fn(),
        clearLUT: vi.fn(),
        setParams: vi.fn(),
        resize: vi.fn(),
        render: renderPipeline,
        dispose: vi.fn(),
      }) as never,
  )

  const { rerender } = render(
    <LoadedPreviewCanvas split={0.5} compareMode="jpeg-fallback" />,
  )
  await waitFor(() => expect(renderPipeline).toHaveBeenCalled())
  renderPipeline.mockClear()

  rerender(<LoadedPreviewCanvas split={0.8} compareMode="jpeg-fallback" />)

  expect(renderPipeline).not.toHaveBeenCalled()
})
```

Add the matching pan/zoom assertion:

```tsx
rerender(
  <LoadedPreviewCanvas
    previewViewport={{ zoom: 2, panX: 80, panY: 0, fitMode: 'custom' }}
    compareMode="dual-webgl"
  />,
)
expect(renderPipeline).not.toHaveBeenCalled()
```

- [ ] **Step 2: Run the failing render-count tests**

```bash
pnpm test:run src/modules/raw-processor/hooks/useRawProcessor.test.tsx src/modules/raw-processor/__tests__/workspace-ui.test.tsx --exclude '.worktrees/**'
```

Expected: fail because viewport changes still drive shader compare renders.

- [ ] **Step 3: Render processed-only params while CSS compare is active**

In `PreviewCanvas.tsx`, derive processed params:

```ts
const pipelineParams = useLayeredCompare
  ? {
      ...params,
      viewMode: 'processed' as const,
      compareSplit: 0.5,
    }
  : params
```

Use `pipelineParams` in the main params render effect.

- [ ] **Step 4: Skip shader compare split refresh in layered compare modes**

Guard the layout effect that refreshes `compareSplit`:

```ts
useLayoutEffect(() => {
  if (useLayeredCompare) return
  const pipeline = pipelineRef.current
  if (!pipeline || !isInitialized) return
  if (params.viewMode !== 'compare') return

  // This path is retained only for non-layered legacy cleanup windows.
  // It is not a fallback mode for this refactor.
}, [
  useLayeredCompare,
  isInitialized,
  params,
  previewViewport,
  getViewportGeometry,
])
```

Do not call `getCanvasCompareSplit(...)` from `dual-webgl`,
`jpeg-fallback`, or `processed-only` compare modes.

- [ ] **Step 5: Push CSS variables directly to the frame**

Set CSS variables on the preview frame or track:

```tsx
style={
  {
    '--raw-preview-pan-x': `${normalizedPreviewViewport.panX}px`,
    '--raw-preview-pan-y': `${normalizedPreviewViewport.panY}px`,
    '--raw-preview-zoom': normalizedPreviewViewport.zoom,
    '--raw-compare-split': `${params.compareSplit * 100}%`,
  } as React.CSSProperties
}
```

Keep the existing `requestAnimationFrame` commit path for persisted
`previewViewport` state. The CSS variable write can happen from props and from
the already scheduled state updates; no new global state model is needed.

- [ ] **Step 6: Run render-count tests**

```bash
pnpm test:run src/modules/raw-processor/hooks/useRawProcessor.test.tsx src/modules/raw-processor/__tests__/workspace-ui.test.tsx --exclude '.worktrees/**'
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add src/modules/raw-processor/components/PreviewCanvas.tsx src/modules/raw-processor/services/preview-viewport.ts src/modules/raw-processor/hooks/useRawProcessor.test.tsx src/modules/raw-processor/__tests__/workspace-ui.test.tsx
git commit -m "feat(raw): keep viewer interaction off the WebGL render path"
```

---

### Task 7: Resource Registry And Export Evacuation Integration

**Files:**

- Modify: `src/modules/raw-processor/hooks/useRawProcessor.ts`
- Modify: `src/modules/raw-processor/hooks/useRawProcessor.test.tsx`
- Modify: `src/lib/export/resource-registry.test.ts` if object URL lifecycle coverage is clearer there.

- [ ] **Step 1: Write failing resource tests**

Add hook coverage:

```ts
it('registers the original reference snapshot as a preview object-url resource', async () => {
  const revokeObjectURL = vi
    .spyOn(URL, 'revokeObjectURL')
    .mockImplementation(() => {})

  await loadRawUntilSnapshotReady({
    snapshot: {
      key: 'snapshot-a',
      objectUrl: 'blob:original-a',
      width: 100,
      height: 50,
      source: 'quick',
      mimeType: 'image/jpeg',
      estimatedBytes: 1234,
    },
  })

  await act(async () => {
    await result.current.exportJpeg()
  })

  expect(revokeObjectURL).toHaveBeenCalledWith('blob:original-a')
  expect(findExportDebugEvent('resource-evacuated')?.payload).toMatchObject({
    requiredOwners: expect.arrayContaining(['preview', 'webgl']),
    registryCheck: { ok: true },
  })
})
```

Use the existing `useRawProcessor.test.tsx` helper style for RAW load and export
setup. The important assertion is that the snapshot is registered under
`owner: 'preview'` with `kind: 'object-url'` and is gone after evacuation.

- [ ] **Step 2: Run the failing resource tests**

```bash
pnpm test:run src/modules/raw-processor/hooks/useRawProcessor.test.tsx --exclude '.worktrees/**'
```

Expected: fail because snapshots are not registered with the resource registry.

- [ ] **Step 3: Register snapshots with the existing preview owner**

In `useRawProcessor.ts`, keep a tracked resource ref:

```ts
const originalReferenceResourceRef = useRef<TrackedLargeResource | null>(null)
const originalReferenceResourceIdRef = useRef(0)
```

Add a registration helper:

```ts
const registerOriginalReferenceSnapshotForEvacuation = useCallback(
  (snapshot: OriginalReferenceSnapshot | null) => {
    const previous = originalReferenceResourceRef.current
    originalReferenceResourceRef.current = null
    if (previous) {
      void previous.dispose().catch((error) => {
        console.warn('Failed to clean up original reference snapshot:', error)
      })
    }

    const registry = resourceRegistryRef.current
    if (!snapshot || !registry) return

    let tracked: TrackedLargeResource | null = null
    tracked = registry.register({
      id: `original-reference-${++originalReferenceResourceIdRef.current}`,
      owner: 'preview',
      kind: 'object-url',
      estimatedBytes: snapshot.estimatedBytes,
      dispose: () => {
        if (originalReferenceResourceRef.current === tracked) {
          originalReferenceResourceRef.current = null
        }
        releaseOriginalReferenceSnapshot(snapshot)
      },
    })
    originalReferenceResourceRef.current = tracked
  },
  [],
)
```

Call the helper whenever the hook returns a new snapshot, and clear it on reset.

- [ ] **Step 4: Ensure export evacuation releases the snapshot**

No new owner is needed because `getPreExportEvacuationOwners(...)` already
includes `preview`. Verify that the resource debug payload lists no live
`original-reference-*` resource after evacuation.

- [ ] **Step 5: Run resource tests**

```bash
pnpm test:run src/modules/raw-processor/hooks/useRawProcessor.test.tsx src/modules/raw-processor/services/export-evacuation.test.ts --exclude '.worktrees/**'
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add src/modules/raw-processor/hooks/useRawProcessor.ts src/modules/raw-processor/hooks/useRawProcessor.test.tsx
git commit -m "feat(raw): evacuate original preview snapshots before export"
```

---

### Task 8: Capability Mode Gates And Browser Validation

**Files:**

- Modify: `src/modules/raw-processor/components/PreviewCanvas.tsx`
- Modify: `src/modules/raw-processor/hooks/useOriginalReferenceSnapshot.ts`
- Modify: `src/modules/raw-processor/__tests__/workspace-ui.test.tsx`

- [ ] **Step 1: Write mode-gate tests**

Add tests for JPEG fallback:

```tsx
it('uses JPEG fallback when dual WebGL is disallowed and a snapshot exists', async () => {
  render(
    <LoadedRawWorkspace
      dualWebglAllowed={false}
      originalReferenceSnapshot={snapshot}
    />,
  )

  expect(screen.getByRole('img', { hidden: true })).toHaveAttribute(
    'src',
    'blob:original-a',
  )
  expect(getPreviewCanvas()).toHaveAttribute(
    'data-compare-mode',
    'jpeg-fallback',
  )
})

it('does not fall back to legacy shader compare when JPEG fallback fails', async () => {
  render(
    <LoadedRawWorkspace
      dualWebglAllowed={false}
      originalReferenceFallbackReason="ORIGINAL_REFERENCE_SNAPSHOT_ENCODE_FAILED"
    />,
  )

  expect(getPreviewCanvas()).toHaveAttribute(
    'data-compare-mode',
    'processed-only',
  )
})
```

Add tests for unsupported CSS clipping:

```tsx
vi.stubGlobal('CSS', {
  supports: vi.fn((property: string, value: string) => {
    return !(property === 'clip-path' && value === 'inset(0 0 0 0)')
  }),
})

expect(getPreviewCanvas()).toHaveAttribute(
  'data-compare-mode',
  'processed-only',
)
```

- [ ] **Step 2: Run mode-gate tests**

```bash
pnpm test:run src/modules/raw-processor/__tests__/workspace-ui.test.tsx --exclude '.worktrees/**'
```

Expected: fail until `data-compare-mode` and CSS support gating exist.

- [ ] **Step 3: Add CSS compare capability detection**

In `PreviewCanvas.tsx`, derive:

```ts
const supportsCssCompare =
  typeof CSS === 'undefined' ||
  CSS.supports('clip-path', 'inset(0 0 0 0)') ||
  CSS.supports('-webkit-clip-path', 'inset(0 0 0 0)')

const compareRenderMode = selectCompareRenderMode({
  requestedViewMode: params.viewMode,
  supportsCssClip: supportsCssCompare,
  dualWebglAllowed,
  originalWebglReady,
  originalWebglFailed,
  jpegSnapshotReady: Boolean(originalReferenceSnapshot),
})

const useLayeredCompare =
  compareRenderMode.kind === 'dual-webgl' ||
  compareRenderMode.kind === 'jpeg-fallback'
```

The selector must not return or encode a `shader` mode.

Set a stable diagnostic attribute:

```tsx
data-compare-mode={
  params.viewMode !== 'compare'
    ? 'off'
    : compareRenderMode.kind
}
```

- [ ] **Step 4: Run targeted automated tests**

```bash
pnpm test:run src/modules/raw-processor/services/original-reference-snapshot.test.ts src/modules/raw-processor/services/original-reference-renderer.test.ts src/modules/raw-processor/hooks/useOriginalReferenceSnapshot.test.tsx src/modules/raw-processor/__tests__/workspace-ui.test.tsx src/modules/raw-processor/hooks/useRawProcessor.test.tsx --exclude '.worktrees/**'
```

Expected: pass.

- [ ] **Step 5: Run full verification**

```bash
pnpm lint
pnpm test:run --exclude '.worktrees/**'
pnpm build
```

Expected: all commands exit `0`.

- [ ] **Step 6: Run browser validation**

Start a production preview or dev server according to current repo practice:

```bash
pnpm build
pnpm preview --host 0.0.0.0
```

Use Playwright or Chrome DevTools to validate:

- desktop Chromium `1440x900`;
- mobile Chromium around `390x844`;
- Playwright WebKit if the local environment can launch it;
- same-origin fetch-to-File synthetic RAW drop;
- capable desktop quick preview shows `dual-webgl` compare;
- constrained or forced-fallback quick preview shows `jpeg-fallback` compare
  when snapshot succeeds;
- bounded HQ upgrade replaces the left original layer or fallback snapshot
  without resetting split/zoom/pan;
- dragging split does not increment preview render telemetry;
- wheel zoom and pan move both layers together;
- export handoff revokes the snapshot and disposes WebGL preview before worker
  start.

If WebKit cannot launch in the Linux/container environment, record it as
`BLOCKED: local Playwright WebKit unavailable` and include the Chromium evidence.

- [ ] **Step 7: Commit**

```bash
git add src/modules/raw-processor/components/PreviewCanvas.tsx src/modules/raw-processor/hooks/useOriginalReferenceSnapshot.ts src/modules/raw-processor/__tests__/workspace-ui.test.tsx
git commit -m "feat(raw): add preview compare fallback gates"
```

---

## Final Verification Checklist

Run:

```bash
git status --short --untracked-files=all
pnpm lint
pnpm test:run --exclude '.worktrees/**'
pnpm build
```

Expected:

- only intended implementation files are modified;
- lint passes;
- tests pass;
- production build passes.

Manual/browser evidence to capture in the final handoff:

- browser and viewport used;
- RAW fixture path;
- compare mode attribute, expected `dual-webgl` on capable devices or
  `jpeg-fallback` on constrained devices;
- fallback snapshot source, expected `quick` first and `bounded-hq` after
  upgrade when bounded HQ succeeds and JPEG fallback is selected;
- proof that pure split drag does not call the processed WebGL render path;
- export evacuation debug event with `preview` and `webgl` owners disposed.

Do not claim iOS Safari compatibility from Linux Playwright WebKit alone. Treat
it as a compatibility proxy until a real iOS Safari run is available.
