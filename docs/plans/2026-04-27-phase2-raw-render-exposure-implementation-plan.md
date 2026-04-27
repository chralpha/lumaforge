# Phase 2 RAW Render Exposure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development or superpowers:executing-plans to
> implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking.

**Goal:** Add an explicit, deterministic RAW render exposure stage so strict
LibRaw Linear ProPhoto output has usable default brightness without weakening
the scene-referred LUT contract.

**Architecture:** Keep LibRaw configured for 16-bit Linear ProPhoto with
`noAutoBright: true` and linear gamma. Resolve a `RawRenderExposure` once per
decoded image from DNG baseline exposure or a bounded image-statistics fallback,
then apply its scene-linear multiplier before LUT input gamut/log preparation in
both WebGL preview and full-resolution export.

**Tech Stack:** TypeScript, WebGL2 GLSL shaders, Vitest,
`@lumaforge/luma-raw-runtime`, LibRaw 0.22.1, LumaForge full-resolution export
worker.

---

## Commit Discipline

This plan must be implemented as a sequence of small complete commits. Each
commit must compile its changed type surface and pass the tests named in that
task before the next task starts. Do not combine native metadata, exposure
estimation, preview shader wiring, and export wiring into one commit.

Use these commit messages exactly unless a task's actual diff is narrower:

1. `feat(raw): expose baseline exposure metadata`
2. `feat(color): resolve default raw render exposure`
3. `feat(raw): attach render exposure to decoded images`
4. `feat(gl): apply raw render exposure in preview`
5. `feat(export): apply raw render exposure in full-res export`
6. `test(raw): verify render exposure parity`
7. `docs(color): document raw render exposure implementation`

## Files To Modify

- `packages/luma-raw-runtime/native/libraw_wrapper.cpp`  
  Expose DNG baseline exposure from `imgdata.color.dng_levels`.

- `packages/luma-raw-runtime/worker/native-types.ts`  
  Add `baselineExposure?: number` to native metadata.

- `packages/luma-raw-runtime/worker/native-adapter.ts`  
  Normalize baseline exposure into public metadata.

- `packages/luma-raw-runtime/src/types.ts`  
  Add `baselineExposure?: number` to `LumaRawMetadata`.

- `packages/luma-raw-runtime/worker/native-adapter.test.ts` and
  `packages/luma-raw-runtime/src/types.test.ts`  
  Cover metadata propagation.

- `src/lib/color/raw-render-exposure.ts`  
  New deterministic exposure resolver and statistics fallback.

- `src/lib/color/raw-render-exposure.test.ts`  
  Unit tests for baseline exposure, fallback statistics, clamping, and
  multiplier math.

- `src/lib/raw/decoder.ts`  
  Add `RawRenderExposure` to `DecodedImage`.

- `src/lib/raw/luma-runtime-adapter.ts`  
  Resolve and attach exposure while converting `LumaRawFrame` to
  `DecodedImage`.

- `src/lib/raw/runtime-adapter.test.ts`  
  Verify decoded images carry render exposure.

- `src/modules/raw-processor/components/PreviewCanvas.tsx`  
  Pass the decoded image exposure into `RawUploadInput`.

- `src/lib/gl/pipeline.ts` and `src/lib/gl/shaders.ts`  
  Add a preview uniform and multiply scene-linear ProPhoto before no-LUT,
  built-in style, and scene-referred LUT paths.

- `src/lib/gl/pipeline.test.ts`, `src/lib/gl/shaders.test.ts`, and
  `src/modules/raw-processor/components/PreviewCanvas.test.ts`
  Verify preview graph and uniform behavior.

- `src/lib/export/color-graph.ts`  
  Add a graph step for raw render exposure.

- `src/lib/export/full-res-export.ts`  
  Apply the same multiplier in the CPU strip export path.

- `src/lib/export/color-graph.test.ts` and
  `src/lib/export/full-res-export.test.ts`  
  Verify graph and CPU export bytes.

- `src/modules/raw-processor/hooks/useRawProcessor.ts`  
  Pass the active decoded image exposure into export graph creation.

- `src/modules/raw-processor/hooks/useRawProcessor.test.tsx`  
  Verify export uses the same exposure as preview.

- `docs/specs/2026-04-24-phase2-raw-color-pipeline-color-science-audit.md`  
  Keep the spec aligned with the implemented surface.

---

## Task 1: Expose Baseline Exposure Metadata

**Files:**

- Modify: `packages/luma-raw-runtime/native/libraw_wrapper.cpp`
- Modify: `packages/luma-raw-runtime/worker/native-types.ts`
- Modify: `packages/luma-raw-runtime/worker/native-adapter.ts`
- Modify: `packages/luma-raw-runtime/src/types.ts`
- Modify: `packages/luma-raw-runtime/worker/native-adapter.test.ts`
- Modify: `packages/luma-raw-runtime/src/types.test.ts`

- [ ] **Step 1: Write failing metadata tests**

In `packages/luma-raw-runtime/worker/native-adapter.test.ts`, add a test for
`readMetadata()` normalization:

```ts
it('normalizes finite DNG baseline exposure metadata', () => {
  const processor = createNativeFactory({
    LumaRawProcessor: class {
      loadBuffer() {
        return { copyToWasm: 0 }
      }
      openWithSettings() {
        return { copyToWasm: 0, librawOpen: 0 }
      }
      openBuffer() {
        return { copyToWasm: 0, librawOpen: 0 }
      }
      readMetadata() {
        return {
          width: 2,
          height: 1,
          baselineExposure: 1.25,
        }
      }
      extractThumbnail() {
        return undefined
      }
      decodePreview() {
        return {
          data: new Uint16Array([1, 2, 3, 4, 5, 6]),
          width: 2,
          height: 1,
        }
      }
      decodeHq() {
        return {
          data: new Uint16Array([1, 2, 3, 4, 5, 6]),
          width: 2,
          height: 1,
        }
      }
      delete() {}
    },
  }).createProcessor()

  expect(processor.readMetadata()).toMatchObject({
    width: 2,
    height: 1,
    baselineExposure: 1.25,
  })
})
```

In `packages/luma-raw-runtime/src/types.test.ts`, add a compile-time fixture:

```ts
it('allows optional baseline exposure in public metadata', () => {
  const frame: LumaRawFrame = {
    jobId: 'job-1',
    source: 'quick',
    width: 1,
    height: 1,
    data: new Uint16Array([0, 0, 0]),
    layout: 'rgb',
    bitDepth: 16,
    colorSpace: 'linear-prophoto-rgb',
    orientation: 1,
    metadata: {
      width: 1,
      height: 1,
      baselineExposure: 0.75,
      supportLevel: 'supported',
    },
    timings: { total: 1 },
  }

  expect(frame.metadata.baselineExposure).toBe(0.75)
})
```

- [ ] **Step 2: Run failing tests**

```bash
pnpm test:run packages/luma-raw-runtime/worker/native-adapter.test.ts packages/luma-raw-runtime/src/types.test.ts --exclude '.worktrees/**'
```

Expected: FAIL because `baselineExposure` is not typed or normalized.

- [ ] **Step 3: Add native metadata**

In `packages/luma-raw-runtime/native/libraw_wrapper.cpp`, update
`readMetadata()` after `whiteLevel`:

```cpp
const float baseline_exposure = color.dng_levels.baseline_exposure;
if (std::isfinite(baseline_exposure) && baseline_exposure > -999.0f) {
  metadata.set("baselineExposure", baseline_exposure);
}
```

Do not change `applyStrictExportProcessingSettings(...)`,
`quickSettings`, or `hqSettings`.

- [ ] **Step 4: Add TypeScript metadata fields**

Add `baselineExposure?: number` to:

```ts
export type LumaRawNativeMetadata = {
  baselineExposure?: number
}
```

and:

```ts
export type LumaRawMetadata = {
  baselineExposure?: number
}
```

In `normalizeNativeMetadata(...)`, add:

```ts
baselineExposure: asNumber(raw.baselineExposure),
```

- [ ] **Step 5: Verify**

```bash
pnpm test:run packages/luma-raw-runtime/worker/native-adapter.test.ts packages/luma-raw-runtime/src/types.test.ts --exclude '.worktrees/**'
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add \
  packages/luma-raw-runtime/native/libraw_wrapper.cpp \
  packages/luma-raw-runtime/worker/native-types.ts \
  packages/luma-raw-runtime/worker/native-adapter.ts \
  packages/luma-raw-runtime/src/types.ts \
  packages/luma-raw-runtime/worker/native-adapter.test.ts \
  packages/luma-raw-runtime/src/types.test.ts
git commit -m "feat(raw): expose baseline exposure metadata"
```

---

## Task 2: Add Default Render Exposure Resolver

**Files:**

- Create: `src/lib/color/raw-render-exposure.ts`
- Create: `src/lib/color/raw-render-exposure.test.ts`

- [ ] **Step 1: Write failing resolver tests**

Create `src/lib/color/raw-render-exposure.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import {
  estimateRawRenderExposureFromRgbU16,
  exposureMultiplierFromEv,
  resolveRawRenderExposure,
} from './raw-render-exposure'

describe('raw render exposure', () => {
  it('uses finite DNG baseline exposure as an EV multiplier', () => {
    expect(
      resolveRawRenderExposure({
        metadata: { baselineExposure: 1.5 },
        image: null,
      }),
    ).toEqual({
      ev: 1.5,
      multiplier: Math.pow(2, 1.5),
      source: 'dng-baseline',
    })
  })

  it('clamps metadata exposure to the automatic safety range', () => {
    expect(
      resolveRawRenderExposure({
        metadata: { baselineExposure: 9 },
        image: null,
      }),
    ).toMatchObject({ ev: 3, source: 'dng-baseline' })
  })

  it('estimates a deterministic fallback from RGB16 luminance percentile', () => {
    const data = new Uint16Array([
      1024, 1024, 1024, 2048, 2048, 2048, 4096, 4096, 4096, 8192, 8192, 8192,
    ])

    const exposure = estimateRawRenderExposureFromRgbU16({
      data,
      width: 4,
      height: 1,
    })

    expect(exposure.source).toBe('image-statistics')
    expect(exposure.ev).toBeGreaterThan(0)
    expect(exposure.multiplier).toBe(exposureMultiplierFromEv(exposure.ev))
  })

  it('falls back to identity when pixels are unusable', () => {
    expect(
      resolveRawRenderExposure({
        metadata: {},
        image: { data: new Uint16Array([0, 0, 0]), width: 1, height: 1 },
      }),
    ).toEqual({ ev: 0, multiplier: 1, source: 'identity' })
  })
})
```

- [ ] **Step 2: Run failing test**

```bash
pnpm test:run src/lib/color/raw-render-exposure.test.ts --exclude '.worktrees/**'
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement resolver**

Create `src/lib/color/raw-render-exposure.ts`:

```ts
const UINT16_MAX = 65535
const AUTO_EV_LIMIT = 3
const TARGET_P95_LUMINANCE = 0.75
const MIN_USABLE_LUMINANCE = 1 / UINT16_MAX

export type RawRenderExposureSource =
  | 'dng-baseline'
  | 'image-statistics'
  | 'identity'
  | 'user'

export type RawRenderExposure = {
  ev: number
  multiplier: number
  source: RawRenderExposureSource
}

export type RawRenderExposureMetadata = {
  baselineExposure?: number
}

export type RawRenderExposureImage = {
  data: Uint16Array
  width: number
  height: number
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function finiteOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function exposureMultiplierFromEv(ev: number) {
  return Math.pow(2, ev)
}

function exposure(
  ev: number,
  source: RawRenderExposureSource,
): RawRenderExposure {
  const clampedEv = clamp(ev, -AUTO_EV_LIMIT, AUTO_EV_LIMIT)
  return {
    ev: clampedEv,
    multiplier: exposureMultiplierFromEv(clampedEv),
    source,
  }
}

function percentile(sorted: number[], p: number) {
  const index = clamp(Math.floor((sorted.length - 1) * p), 0, sorted.length - 1)
  return sorted[index] ?? 0
}

export function estimateRawRenderExposureFromRgbU16(
  image: RawRenderExposureImage,
): RawRenderExposure {
  const sampleCount = image.width * image.height
  if (
    !Number.isSafeInteger(sampleCount) ||
    sampleCount <= 0 ||
    image.data.length < sampleCount * 3
  ) {
    return exposure(0, 'identity')
  }

  const step = Math.max(1, Math.floor(sampleCount / 4096))
  const luminance: number[] = []
  for (let pixel = 0; pixel < sampleCount; pixel += step) {
    const offset = pixel * 3
    const r = (image.data[offset] ?? 0) / UINT16_MAX
    const g = (image.data[offset + 1] ?? 0) / UINT16_MAX
    const b = (image.data[offset + 2] ?? 0) / UINT16_MAX
    const y = 0.2880402 * r + 0.7118741 * g + 0.0000857 * b
    if (Number.isFinite(y) && y > MIN_USABLE_LUMINANCE) {
      luminance.push(y)
    }
  }

  if (luminance.length === 0) return exposure(0, 'identity')

  luminance.sort((left, right) => left - right)
  const p95 = percentile(luminance, 0.95)
  if (p95 <= MIN_USABLE_LUMINANCE) return exposure(0, 'identity')

  return exposure(Math.log2(TARGET_P95_LUMINANCE / p95), 'image-statistics')
}

export function resolveRawRenderExposure(input: {
  metadata: RawRenderExposureMetadata
  image: RawRenderExposureImage | null
}): RawRenderExposure {
  const baselineExposure = finiteOrUndefined(input.metadata.baselineExposure)
  if (baselineExposure !== undefined) {
    return exposure(baselineExposure, 'dng-baseline')
  }

  if (input.image) return estimateRawRenderExposureFromRgbU16(input.image)

  return exposure(0, 'identity')
}
```

- [ ] **Step 4: Verify**

```bash
pnpm test:run src/lib/color/raw-render-exposure.test.ts --exclude '.worktrees/**'
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/color/raw-render-exposure.ts src/lib/color/raw-render-exposure.test.ts
git commit -m "feat(color): resolve default raw render exposure"
```

---

## Task 3: Attach Render Exposure To Decoded Images

**Files:**

- Modify: `src/lib/raw/decoder.ts`
- Modify: `src/lib/raw/luma-runtime-adapter.ts`
- Modify: `src/lib/raw/runtime-adapter.test.ts`

- [ ] **Step 1: Write failing adapter tests**

In `src/lib/raw/runtime-adapter.test.ts`, add:

```ts
it('attaches DNG baseline render exposure to decoded images', async () => {
  const frame = makeLumaFrame('quick')
  frame.metadata.baselineExposure = 1
  const { runtime } = makeLumaRuntime({
    decodeQuick: vi.fn().mockResolvedValue(frame),
  })
  const adapter = createRawRuntimeAdapter({ lumaRuntimeFactory: () => runtime })

  const image = await adapter.decodeQuickRaw(new File(['raw'], 'sample.DNG'))

  expect(image.renderExposure).toEqual({
    ev: 1,
    multiplier: 2,
    source: 'dng-baseline',
  })
})

it('attaches statistical render exposure when metadata is missing', async () => {
  const frame = makeLumaFrame('quick')
  frame.metadata.baselineExposure = undefined
  frame.data = new Uint16Array([
    2048, 2048, 2048, 4096, 4096, 4096, 8192, 8192, 8192,
  ])
  frame.width = 3
  frame.height = 1
  const { runtime } = makeLumaRuntime({
    decodeQuick: vi.fn().mockResolvedValue(frame),
  })
  const adapter = createRawRuntimeAdapter({ lumaRuntimeFactory: () => runtime })

  const image = await adapter.decodeQuickRaw(new File(['raw'], 'sample.RAF'))

  expect(image.renderExposure.source).toBe('image-statistics')
  expect(image.renderExposure.ev).toBeGreaterThan(0)
})
```

- [ ] **Step 2: Run failing tests**

```bash
pnpm test:run src/lib/raw/runtime-adapter.test.ts --exclude '.worktrees/**'
```

Expected: FAIL because `DecodedImage.renderExposure` does not exist.

- [ ] **Step 3: Add decoded image field**

In `src/lib/raw/decoder.ts`:

```ts
import type { RawRenderExposure } from '~/lib/color/raw-render-exposure'

export interface ImageMetadata {
  baselineExposure?: number
}

export interface DecodedImage {
  renderExposure: RawRenderExposure
}
```

In `src/lib/raw/luma-runtime-adapter.ts`:

```ts
import { resolveRawRenderExposure } from '~/lib/color/raw-render-exposure'

export function metadataToImageMetadata(frame: LumaRawFrame): ImageMetadata {
  return {
    baselineExposure: frame.metadata.baselineExposure,
    // existing fields stay unchanged
  }
}

export function frameToDecodedImage(frame: LumaRawFrame): DecodedImage {
  const metadata = metadataToImageMetadata(frame)
  return {
    // existing fields stay unchanged
    metadata,
    renderExposure: resolveRawRenderExposure({
      metadata,
      image: {
        data: frame.data,
        width: frame.width,
        height: frame.height,
      },
    }),
  }
}
```

- [ ] **Step 4: Verify**

```bash
pnpm test:run src/lib/raw/runtime-adapter.test.ts src/lib/color/raw-render-exposure.test.ts --exclude '.worktrees/**'
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/raw/decoder.ts src/lib/raw/luma-runtime-adapter.ts src/lib/raw/runtime-adapter.test.ts
git commit -m "feat(raw): attach render exposure to decoded images"
```

---

## Task 4: Apply Render Exposure In Preview

**Files:**

- Modify: `src/modules/raw-processor/components/PreviewCanvas.tsx`
- Modify: `src/lib/gl/pipeline.ts`
- Modify: `src/lib/gl/shaders.ts`
- Modify: `src/modules/raw-processor/components/PreviewCanvas.test.ts`
- Modify: `src/lib/gl/pipeline.test.ts`
- Modify: `src/lib/gl/shaders.test.ts`

- [ ] **Step 1: Write failing preview tests**

In `src/modules/raw-processor/components/PreviewCanvas.test.ts`, assert that
upload input carries the decoded exposure:

```ts
it('passes decoded raw render exposure into WebGL upload input', () => {
  const data = new Uint16Array([1024, 1024, 1024])
  expect(
    createRawUploadInput({
      data,
      layout: 'rgb-u16',
      colorSpace: 'linear-prophoto-rgb',
      width: 1,
      height: 1,
      renderExposureEv: 1.5,
    }),
  ).toMatchObject({
    renderExposureEv: 1.5,
    renderExposureMultiplier: Math.pow(2, 1.5),
  })
})
```

In `src/lib/gl/shaders.test.ts`, add:

```ts
expect(shader).toContain('uniform float u_rawRenderExposureMultiplier')
expect(shader).toContain(
  'vec3 baseSceneLinearProPhoto = max(readInputSceneLinearProPhoto(v_texCoord) * u_rawRenderExposureMultiplier, vec3(0.0))',
)
```

- [ ] **Step 2: Run failing tests**

```bash
pnpm test:run src/modules/raw-processor/components/PreviewCanvas.test.ts src/lib/gl/shaders.test.ts src/lib/gl/pipeline.test.ts --exclude '.worktrees/**'
```

Expected: FAIL because preview upload and shader uniform are missing.

- [ ] **Step 3: Extend preview upload input**

In `src/lib/gl/pipeline.ts`, add to the `linear-prophoto-rgb` input variant:

```ts
renderExposureEv: number
renderExposureMultiplier: number
```

Track the current multiplier in `RawProcessingPipeline`, initialize it to `1`,
set it in `uploadImage(input)`, and send it in `renderProcessPass()`:

```ts
private rawRenderExposureMultiplier = 1

uploadImage(input: RawUploadInput): void {
  this.rawRenderExposureMultiplier =
    input.colorSpace === 'linear-prophoto-rgb'
      ? input.renderExposureMultiplier
      : 1
}

gl.uniform1f(
  processUniforms.u_rawRenderExposureMultiplier,
  this.rawRenderExposureMultiplier,
)
```

In `PreviewCanvas.tsx`, add `renderExposureEv` to `createRawUploadInput(...)`
and compute:

```ts
const ev = Number.isFinite(renderExposureEv) ? renderExposureEv : 0
renderExposureEv: ev,
renderExposureMultiplier: Math.pow(2, ev),
```

When creating upload input from a decoded image:

```ts
renderExposureEv: image?.renderExposure.ev ?? 0,
```

- [ ] **Step 4: Apply multiplier in shader**

In `src/lib/gl/shaders.ts`, add the uniform:

```glsl
uniform float u_rawRenderExposureMultiplier;
```

Replace the base scene read with:

```glsl
vec3 baseSceneLinearProPhoto = max(
  readInputSceneLinearProPhoto(v_texCoord) * u_rawRenderExposureMultiplier,
  vec3(0.0)
);
```

The multiplier must be before `applySceneLutToDisplayLinear(...)` and
`applyCombinedOutputLut(...)`, so LUT input log encoding receives normalized
scene-linear values.

- [ ] **Step 5: Verify**

```bash
pnpm test:run src/modules/raw-processor/components/PreviewCanvas.test.ts src/lib/gl/shaders.test.ts src/lib/gl/pipeline.test.ts --exclude '.worktrees/**'
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add \
  src/modules/raw-processor/components/PreviewCanvas.tsx \
  src/lib/gl/pipeline.ts \
  src/lib/gl/shaders.ts \
  src/modules/raw-processor/components/PreviewCanvas.test.ts \
  src/lib/gl/pipeline.test.ts \
  src/lib/gl/shaders.test.ts
git commit -m "feat(gl): apply raw render exposure in preview"
```

---

## Task 5: Apply Render Exposure In Full-Resolution Export

**Files:**

- Modify: `src/lib/export/color-graph.ts`
- Modify: `src/lib/export/full-res-export.ts`
- Modify: `src/modules/raw-processor/hooks/useRawProcessor.ts`
- Modify: `src/lib/export/color-graph.test.ts`
- Modify: `src/lib/export/full-res-export.test.ts`
- Modify: `src/modules/raw-processor/hooks/useRawProcessor.test.tsx`

- [ ] **Step 1: Write failing export graph test**

In `src/lib/export/color-graph.test.ts`, add:

```ts
it('inserts raw render exposure before output conversion', () => {
  const graph = resolveExportColorGraph({
    styleKind: 'none',
    intensity: 0.7,
    builtinPreset: null,
    lut: null,
    rawRenderExposure: { ev: 1, multiplier: 2, source: 'image-statistics' },
  })

  expect(graph).toMatchObject({
    supported: true,
    steps: [
      { kind: 'input-linear-prophoto' },
      { kind: 'raw-render-exposure', ev: 1, multiplier: 2 },
      { kind: 'output-srgb' },
    ],
  })
})
```

In `src/lib/export/full-res-export.test.ts`, add a byte-level no-LUT test where
input `0.25` becomes `0.5` before final sRGB encoding:

```ts
it('applies raw render exposure before final sRGB encoding', async () => {
  const writtenRows: Array<{ bytes: Uint8Array }> = []
  const writer = {
    writeRows: vi.fn(async (bytes: Uint8Array) => {
      writtenRows.push({ bytes: new Uint8Array(bytes) })
    }),
    close: vi.fn(async () => new Blob([], { type: 'image/jpeg' })),
    abort: vi.fn(async () => undefined),
  }

  await runFullResolutionJpegExport({
    capability: makeCapability(),
    graph: {
      supported: true,
      outputGamut: 'srgb-rec709',
      outputTransfer: 'srgb',
      lutProfile: null,
      steps: [
        { kind: 'input-linear-prophoto' },
        { kind: 'raw-render-exposure', ev: 1, multiplier: 2 },
        { kind: 'output-srgb' },
      ],
    },
    readProcessedWindow: vi.fn((request) =>
      Promise.resolve(makeProcessedWindow(request, 16384)),
    ),
    writerFactory: () => writer,
  })

  const expected = Math.round(linearToSrgb(0.5) * 255)
  expect(writtenRows[0]?.bytes[0]).toBe(expected)
})
```

- [ ] **Step 2: Run failing tests**

```bash
pnpm test:run src/lib/export/color-graph.test.ts src/lib/export/full-res-export.test.ts src/modules/raw-processor/hooks/useRawProcessor.test.tsx --exclude '.worktrees/**'
```

Expected: FAIL because the export graph has no raw-render-exposure step.

- [ ] **Step 3: Extend graph descriptor**

In `src/lib/export/color-graph.ts`, add:

```ts
import type { RawRenderExposure } from '~/lib/color/raw-render-exposure'

export type ExportColorGraphStep =
  | { kind: 'input-linear-prophoto' }
  | { kind: 'raw-render-exposure'; ev: number; multiplier: number }

const IDENTITY_RAW_RENDER_EXPOSURE: RawRenderExposure = {
  ev: 0,
  multiplier: 1,
  source: 'identity',
}

export function resolveExportColorGraph(input: {
  rawRenderExposure?: RawRenderExposure
}) {
  const rawRenderExposure =
    input.rawRenderExposure ?? IDENTITY_RAW_RENDER_EXPOSURE
  const base: ExportColorGraphStep[] = [
    { kind: 'input-linear-prophoto' },
    {
      kind: 'raw-render-exposure',
      ev: rawRenderExposure.ev,
      multiplier: rawRenderExposure.multiplier,
    },
  ]
}
```

Keep the exposure step before `gamut-to-lut-input`.

- [ ] **Step 4: Apply graph step in CPU export**

In `src/lib/export/full-res-export.ts`, handle the step in
`compileGraphApplier(...)` before LUT input conversion:

```ts
let rawRenderExposureMultiplier = 1
for (const step of graph.steps) {
  if (step.kind === 'raw-render-exposure') {
    rawRenderExposureMultiplier = step.multiplier
  }
}

const exposedR = baseR * rawRenderExposureMultiplier
const exposedG = baseG * rawRenderExposureMultiplier
const exposedB = baseB * rawRenderExposureMultiplier
```

Use `exposedR/G/B` for no-LUT output, gamut conversion, LUT input transfer, and
display mixing base values.

- [ ] **Step 5: Pass active decoded exposure to export graph**

In `src/modules/raw-processor/hooks/useRawProcessor.ts`, when calling
`resolveExportColorGraph(...)`, pass:

```ts
rawRenderExposure: decodedImageRef.current?.renderExposure,
```

The export path must use the same decoded image exposure that preview used.

- [ ] **Step 6: Verify**

```bash
pnpm test:run src/lib/export/color-graph.test.ts src/lib/export/full-res-export.test.ts src/modules/raw-processor/hooks/useRawProcessor.test.tsx --exclude '.worktrees/**'
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add \
  src/lib/export/color-graph.ts \
  src/lib/export/full-res-export.ts \
  src/modules/raw-processor/hooks/useRawProcessor.ts \
  src/lib/export/color-graph.test.ts \
  src/lib/export/full-res-export.test.ts \
  src/modules/raw-processor/hooks/useRawProcessor.test.tsx
git commit -m "feat(export): apply raw render exposure in full-res export"
```

---

## Task 6: Verify Preview/Export Parity

**Files:**

- Modify: `src/lib/export/full-res-export.real.test.ts`
- Modify: `src/modules/raw-processor/__tests__/export-system.test.ts`

- [ ] **Step 1: Add parity assertions**

In the real export test, assert that the resolved graph contains exactly one
raw render exposure step and that it precedes LUT input preparation:

```ts
const exposureIndex = graph.steps.findIndex(
  (step) => step.kind === 'raw-render-exposure',
)
const lutInputIndex = graph.steps.findIndex(
  (step) => step.kind === 'gamut-to-lut-input',
)

expect(exposureIndex).toBeGreaterThan(0)
expect(lutInputIndex).toBeGreaterThan(exposureIndex)
```

In the export-system test, assert the descriptor carries the decoded image
exposure:

```ts
expect(exportRequest.graph.steps).toContainEqual(
  expect.objectContaining({
    kind: 'raw-render-exposure',
    multiplier: expect.any(Number),
  }),
)
```

- [ ] **Step 2: Run targeted parity tests**

```bash
pnpm test:run src/lib/export/full-res-export.real.test.ts src/modules/raw-processor/__tests__/export-system.test.ts --exclude '.worktrees/**'
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/export/full-res-export.real.test.ts src/modules/raw-processor/__tests__/export-system.test.ts
git commit -m "test(raw): verify render exposure parity"
```

---

## Task 7: Documentation And Final Verification

**Files:**

- Modify:
  `docs/specs/2026-04-24-phase2-raw-color-pipeline-color-science-audit.md`
- Modify:
  `docs/plans/2026-04-27-phase2-raw-render-exposure-implementation-plan.md`

**Implementation status:** Completed on 2026-04-27. The final verification used
the actual `src/modules/raw-processor/components/PreviewCanvas.test.ts` path.
Native smoke initially failed only because the public
`raw-pixls-iphone-se.dng` fixture was absent; the allowed
`pnpm --filter @lumaforge/luma-raw-runtime fixtures:fetch-public` command
fetched it, and the rerun passed.

- [ ] **Step 1: Run focused test suite**

```bash
pnpm test:run \
  packages/luma-raw-runtime/worker/native-adapter.test.ts \
  packages/luma-raw-runtime/src/types.test.ts \
  src/lib/color/raw-render-exposure.test.ts \
  src/lib/raw/runtime-adapter.test.ts \
  src/modules/raw-processor/components/PreviewCanvas.test.ts \
  src/lib/gl/shaders.test.ts \
  src/lib/gl/pipeline.test.ts \
  src/lib/export/color-graph.test.ts \
  src/lib/export/full-res-export.test.ts \
  src/modules/raw-processor/hooks/useRawProcessor.test.tsx \
  src/modules/raw-processor/__tests__/export-system.test.ts \
  --exclude '.worktrees/**'
```

Expected: PASS.

- [ ] **Step 2: Run real RAW export regression**

```bash
pnpm test:run src/lib/export/full-res-export.real.test.ts --exclude '.worktrees/**'
```

Expected: PASS.

- [ ] **Step 3: Run native smoke if native artifacts changed**

Because Task 1 changes `packages/luma-raw-runtime/native/libraw_wrapper.cpp`,
run:

```bash
pnpm test:run packages/luma-raw-runtime/src/native-smoke.test.ts --exclude '.worktrees/**'
```

Expected: PASS in an environment with the native WASM artifact available.

- [ ] **Step 4: Run formatting checks**

```bash
pnpm exec prettier --check \
  docs/specs/2026-04-24-phase2-raw-color-pipeline-color-science-audit.md \
  docs/plans/2026-04-27-phase2-raw-render-exposure-implementation-plan.md \
  src/lib/color/raw-render-exposure.ts \
  src/lib/color/raw-render-exposure.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add \
  docs/specs/2026-04-24-phase2-raw-color-pipeline-color-science-audit.md \
  docs/plans/2026-04-27-phase2-raw-render-exposure-implementation-plan.md
git commit -m "docs(color): document raw render exposure implementation"
```

---

## Acceptance Criteria

- LibRaw remains configured for 16-bit Linear ProPhoto, linear gamma, camera WB,
  camera matrix, and `noAutoBright: true`.
- DNG baseline exposure is exposed to app code when LibRaw provides a finite
  value.
- Non-DNG or metadata-missing RAW files get a deterministic bounded exposure
  fallback from image statistics.
- Preview and full-resolution export use the same `RawRenderExposure`.
- The raw render exposure multiplier is applied before LUT input gamut/log
  conversion.
- Export strips do not compute their own independent exposure.
- Final browser photo export remains Rec.709/sRGB.
- The implementation lands as small complete commits with the commit messages
  listed in this plan.

## Self-Review

- Spec coverage: The plan implements the spec boundary that LibRaw stays strict
  and LumaForge owns render exposure.
- Placeholder scan: No step contains unresolved placeholders or unspecified validation.
- Type consistency: `RawRenderExposure`, `baselineExposure`,
  `renderExposureEv`, and `renderExposureMultiplier` are used consistently.
- Scope: This plan does not add a full photographic tone curve, an OCIO backend,
  or vendor picture-style matching.
