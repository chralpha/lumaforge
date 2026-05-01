# Basic Tone Exposure and Contrast Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add user-facing Exposure and Contrast controls to RAW Lab with shared preview/export color behavior.

**Architecture:** `@lumaforge/luma-color-runtime` owns tone parameter normalization, math, graph steps, GLSL snippets, and CPU row-band execution. The app only owns UI state, control rendering, preview uniform wiring, and export invalidation. Tone runs after `raw-render-exposure` and before LUT input conversion.

**Tech Stack:** TypeScript, React 19, Jotai, WebGL2 GLSL ES 3.00, Vitest, pnpm workspaces, `@lumaforge/luma-color-runtime`.

---

## File Map

- Create `packages/luma-color-runtime/src/tone.ts`: tone parameter normalization, exposure multiplier, contrast factor, exact luminance-scale math, constants, and allocation-free scalar helpers.
- Create `packages/luma-color-runtime/src/tone.test.ts`: math, normalization, near-black, saturated-color, negative-channel, and neutral tests.
- Modify `packages/luma-color-runtime/src/types.ts`: add `userExposureEv` and `userContrast` to `ProcessingParams`.
- Modify `packages/luma-color-runtime/src/index.ts`: already exports `./types`; add `./tone`.
- Modify `packages/luma-color-runtime/src/glsl.ts`: add `LUMA_COLOR_TONE_GLSL`.
- Modify `packages/luma-color-runtime/src/color-graph.ts`: add `user-exposure` and `user-contrast` graph steps and normalized tone input.
- Modify `packages/luma-color-runtime/src/color-graph.test.ts`: update graph shapes and unsupported-pipeline assertions.
- Modify `packages/luma-color-runtime/src/row-band-processor.ts`: compile and execute tone steps for no-LUT and LUT graphs before output/LUT input conversion.
- Modify `packages/luma-color-runtime/src/row-band-processor.test.ts`: update graph fixtures and add tone output, LUT input, neutral, and strip-equivalence tests.
- Modify `src/lib/gl/shaders.ts`: apply shared GLSL tone to processed path while preserving original/compare semantics.
- Modify `src/lib/gl/shaders.test.ts`: assert tone uniforms, GLSL snippet composition, and original/processed routing.
- Modify `src/lib/gl/context.ts` and `src/lib/gl/context.test.ts`: record fragment high-float precision and expose tone precision capability.
- Modify `src/modules/raw-processor/hooks/useCapabilityGate.ts`: fail closed when tone preview precision is unavailable.
- Modify `src/lib/gl/pipeline.ts` and `src/lib/gl/pipeline.test.ts`: add tone uniforms, defaults, normalized params, and no-reupload render tests.
- Modify `src/atoms/raw-processor.ts`: add neutral tone defaults and reset behavior.
- Modify `src/modules/raw-processor/hooks/useRawProcessor.ts` and `src/modules/raw-processor/hooks/useRawProcessor.test.tsx`: add tone setters, reset, export invalidation, export graph params, and old-param migration.
- Create `src/modules/raw-processor/components/tools/ToneTool.tsx`: Exposure/Contrast sliders and reset button.
- Modify `src/modules/raw-processor/components/RawToolSurface.tsx` and `src/modules/raw-processor/components/RawToolSurface.test.tsx`: insert Tone section before Strength and wire props.
- Modify `src/modules/raw-processor/RawProcessorView.tsx`: pass tone values and handlers to `RawToolSurface`.
- Modify `src/modules/raw-processor/raw-lab.css`: style tone sliders and preserved-tone state text.

## Task 1: Runtime Tone Math and Processing Params

**Files:**

- Create: `packages/luma-color-runtime/src/tone.ts`
- Create: `packages/luma-color-runtime/src/tone.test.ts`
- Modify: `packages/luma-color-runtime/src/types.ts`
- Modify: `packages/luma-color-runtime/src/index.ts`

- [ ] **Step 1: Write failing tone math tests**

Create `packages/luma-color-runtime/src/tone.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import {
  applyUserContrastRgb,
  applyUserExposureRgb,
  contrastFactorFromAmount,
  normalizeToneParams,
  resolveToneParams,
  userExposureMultiplierFromEv,
} from './tone'

const EPS = 1e-12

function expectRgbClose(
  actual: readonly [number, number, number],
  expected: readonly [number, number, number],
) {
  expect(actual[0]).toBeCloseTo(expected[0], 12)
  expect(actual[1]).toBeCloseTo(expected[1], 12)
  expect(actual[2]).toBeCloseTo(expected[2], 12)
}

describe('tone math', () => {
  it('normalizes missing and invalid tone params to neutral', () => {
    expect(normalizeToneParams(undefined)).toEqual({
      userExposureEv: 0,
      userContrast: 0,
    })
    expect(
      normalizeToneParams({
        userExposureEv: Number.NaN,
        userContrast: Infinity,
      }),
    ).toEqual({
      userExposureEv: 0,
      userContrast: 0,
    })
  })

  it('clamps tone params to the public editing range', () => {
    expect(
      normalizeToneParams({ userExposureEv: 12, userContrast: -180 }),
    ).toEqual({
      userExposureEv: 5,
      userContrast: -100,
    })
  })

  it('maps exposure stops and contrast amount to bounded factors', () => {
    expect(userExposureMultiplierFromEv(1)).toBe(2)
    expect(userExposureMultiplierFromEv(-1)).toBe(0.5)
    expect(contrastFactorFromAmount(-100)).toBeCloseTo(Math.SQRT1_2, 12)
    expect(contrastFactorFromAmount(0)).toBe(1)
    expect(contrastFactorFromAmount(100)).toBeCloseTo(Math.SQRT2, 12)
  })

  it('keeps exposure as pure gain without clipping negative channels', () => {
    expectRgbClose(applyUserExposureRgb([-0.25, 0.5, 2], 2), [-0.5, 1, 4])
  })

  it('keeps neutral contrast as exact passthrough including negative channels', () => {
    const tone = resolveToneParams({ userExposureEv: 0, userContrast: 0 })
    expectRgbClose(applyUserContrastRgb([-0.25, 0.5, 2], tone), [
      -0.25,
      0.5,
      2,
    ])
  })

  it('clips negative channels only at non-neutral contrast entry', () => {
    const tone = resolveToneParams({ userExposureEv: 0, userContrast: 50 })
    expectRgbClose(applyUserContrastRgb([-0.1, -0.2, -0.3], tone), [0, 0, 0])
  })

  it('leaves black and 18 percent luminance stable under contrast', () => {
    const tone = resolveToneParams({ userExposureEv: 0, userContrast: 100 })
    expectRgbClose(applyUserContrastRgb([0, 0, 0], tone), [0, 0, 0])
    expectRgbClose(applyUserContrastRgb([0.18, 0.18, 0.18], tone), [
      0.18,
      0.18,
      0.18,
    ])
  })

  it.each([1e-8, 1e-6, 1e-4])(
    'keeps near-black positive luminance continuous for Y=%s',
    (y) => {
      const lift = resolveToneParams({ userExposureEv: 0, userContrast: -100 })
      const crush = resolveToneParams({ userExposureEv: 0, userContrast: 100 })
      const lifted = applyUserContrastRgb([y, y, y], lift)
      const crushed = applyUserContrastRgb([y, y, y], crush)

      expect(lifted[0]).toBeGreaterThan(y)
      expect(crushed[0]).toBeLessThan(y)
      expect(lifted[0]).toBeGreaterThan(EPS)
      expect(crushed[0]).toBeGreaterThanOrEqual(0)
    },
  )

  it('preserves positive RGB ratios before downstream gamut and output clipping', () => {
    const tone = resolveToneParams({ userExposureEv: 0, userContrast: 60 })
    const actual = applyUserContrastRgb([0.32, 0.16, 0.08], tone)

    expect(actual[0] / actual[1]).toBeCloseTo(2, 12)
    expect(actual[1] / actual[2]).toBeCloseTo(2, 12)
  })

  it.each([
    ['saturated red', [1, 0, 0] as const],
    ['saturated green', [0, 1, 0] as const],
    ['saturated blue', [0, 0, 1] as const],
    ['sky blue', [0.22, 0.48, 0.95] as const],
    ['skin tone', [0.78, 0.46, 0.32] as const],
    ['foliage', [0.18, 0.42, 0.12] as const],
    ['cyan', [0, 1, 1] as const],
    ['magenta', [1, 0, 1] as const],
    ['neon', [0.1, 1.2, 0.75] as const],
  ])('keeps %s finite and ratio-stable', (_label, sample) => {
    const tone = resolveToneParams({ userExposureEv: 0, userContrast: 50 })
    const actual = applyUserContrastRgb(sample, tone)
    expect(actual.every(Number.isFinite)).toBe(true)
    for (let channel = 0; channel < 3; channel += 1) {
      if (sample[channel] > 0) {
        expect(actual[channel]).toBeGreaterThan(0)
      }
    }
  })
})
```

- [ ] **Step 2: Run the failing tone tests**

Run:

```bash
pnpm --filter @lumaforge/luma-color-runtime exec vitest run src/tone.test.ts
```

Expected: fail with an import error for `./tone`.

- [ ] **Step 3: Implement `tone.ts`**

Create `packages/luma-color-runtime/src/tone.ts`:

```ts
export const USER_EXPOSURE_EV_MIN = -5
export const USER_EXPOSURE_EV_MAX = 5
export const USER_CONTRAST_MIN = -100
export const USER_CONTRAST_MAX = 100
export const USER_CONTRAST_PIVOT = 0.18
export const LINEAR_PROPHOTO_LUMINANCE = [
  0.2880402,
  0.7118741,
  0.0000857,
] as const

export interface LumaColorToneParams {
  userExposureEv: number
  userContrast: number
}

export interface ResolvedToneParams extends LumaColorToneParams {
  userExposureMultiplier: number
  userContrastFactor: number
  contrastPivot: number
  luminanceCoefficients: readonly [number, number, number]
}

export type Rgb = readonly [number, number, number]

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function finiteOrDefault(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export function userExposureMultiplierFromEv(ev: number) {
  return Math.pow(2, ev)
}

export function contrastFactorFromAmount(amount: number) {
  return Math.pow(2, amount / 200)
}

export function normalizeToneParams(
  input?: Partial<LumaColorToneParams> | null,
): LumaColorToneParams {
  return {
    userExposureEv: clamp(
      finiteOrDefault(input?.userExposureEv, 0),
      USER_EXPOSURE_EV_MIN,
      USER_EXPOSURE_EV_MAX,
    ),
    userContrast: clamp(
      finiteOrDefault(input?.userContrast, 0),
      USER_CONTRAST_MIN,
      USER_CONTRAST_MAX,
    ),
  }
}

export function resolveToneParams(
  input?: Partial<LumaColorToneParams> | null,
): ResolvedToneParams {
  const normalized = normalizeToneParams(input)
  return {
    ...normalized,
    userExposureMultiplier: userExposureMultiplierFromEv(
      normalized.userExposureEv,
    ),
    userContrastFactor: contrastFactorFromAmount(normalized.userContrast),
    contrastPivot: USER_CONTRAST_PIVOT,
    luminanceCoefficients: LINEAR_PROPHOTO_LUMINANCE,
  }
}

export function applyUserExposureRgb(
  rgb: Rgb,
  multiplier: number,
): [number, number, number] {
  return [rgb[0] * multiplier, rgb[1] * multiplier, rgb[2] * multiplier]
}

export function applyUserContrastRgb(
  rgb: Rgb,
  tone: ResolvedToneParams,
): [number, number, number] {
  if (tone.userContrast === 0) {
    return [rgb[0], rgb[1], rgb[2]]
  }

  const r = Math.max(rgb[0], 0)
  const g = Math.max(rgb[1], 0)
  const b = Math.max(rgb[2], 0)
  const [yr, yg, yb] = tone.luminanceCoefficients
  const y = yr * r + yg * g + yb * b
  if (y <= 0) return [0, 0, 0]

  const targetY =
    tone.contrastPivot *
    Math.pow(y / tone.contrastPivot, tone.userContrastFactor)
  const scale = targetY / y
  return [r * scale, g * scale, b * scale]
}

export function applyUserToneRgb(
  rgb: Rgb,
  tone: ResolvedToneParams,
): [number, number, number] {
  return applyUserContrastRgb(
    applyUserExposureRgb(rgb, tone.userExposureMultiplier),
    tone,
  )
}
```

- [ ] **Step 4: Add tone params to `ProcessingParams`**

Modify `packages/luma-color-runtime/src/types.ts`:

```ts
import type { LumaColorToneParams } from './tone'

export interface LumaColorProcessingParams extends LumaColorToneParams {
  intensity: number
  viewMode: 'processed' | 'original' | 'compare'
  compareSplit: number
  styleKind: 'none' | 'builtin' | 'custom'
  builtinPreset: BuiltinStylePreset | null
}
```

Modify `packages/luma-color-runtime/src/index.ts`:

```ts
export * from './color-graph'
export * from './constants'
export * from './log-encoding'
export * from './lut-contract'
export * from './lut3d'
export * from './matrix'
export * from './raw-render-exposure'
export * from './registry'
export * from './row-band-processor'
export * from './tone'
export * from './types'
```

- [ ] **Step 5: Run tone tests**

Run:

```bash
pnpm --filter @lumaforge/luma-color-runtime exec vitest run src/tone.test.ts
```

Expected: pass all tests in `tone.test.ts`.

- [ ] **Step 6: Commit runtime tone math**

Run:

```bash
git add packages/luma-color-runtime/src/tone.ts packages/luma-color-runtime/src/tone.test.ts packages/luma-color-runtime/src/types.ts packages/luma-color-runtime/src/index.ts
git commit -m "feat(color-runtime): add basic tone math"
```

## Task 2: Color Graph Tone Steps

**Files:**

- Modify: `packages/luma-color-runtime/src/color-graph.ts`
- Modify: `packages/luma-color-runtime/src/color-graph.test.ts`

- [ ] **Step 1: Write failing color graph tests**

Add these tests to `packages/luma-color-runtime/src/color-graph.test.ts`:

```ts
it('inserts neutral user tone steps in no-lut export graphs', () => {
  const graph = resolveExportColorGraph({
    styleKind: 'none',
    intensity: 0.7,
    builtinPreset: null,
    lut: null,
  })

  expect(graph.supported).toBe(true)
  if (!graph.supported) throw new Error('Expected supported graph')
  expect(graph.steps.map((step) => step.kind)).toEqual([
    'input-linear-prophoto',
    'raw-render-exposure',
    'user-exposure',
    'user-contrast',
    'output-srgb',
  ])
  expect(graph.steps[2]).toMatchObject({
    kind: 'user-exposure',
    ev: 0,
    multiplier: 1,
  })
  expect(graph.steps[3]).toMatchObject({
    kind: 'user-contrast',
    amount: 0,
    factor: 1,
    pivot: 0.18,
    operator: 'linear-prophoto-luminance-scale',
    luminanceCoefficients: [0.2880402, 0.7118741, 0.0000857],
    zeroLuminanceMode: 'return-black',
  })
})

it('places user tone before LUT input conversion', () => {
  const profile = getLUTColorProfile('sony-sgamut3cine-slog3')
  if (!profile) throw new Error('Missing profile')

  const graph = resolveExportColorGraph({
    styleKind: 'custom',
    intensity: 0.7,
    builtinPreset: null,
    userExposureEv: 1,
    userContrast: 50,
    lut: {
      size: 2,
      data: new Float32Array(24),
      domainMin: [0, 0, 0],
      domainMax: [1, 1, 1],
      inputProfile: 'v-log',
      profileResolution: {
        kind: 'resolved',
        confidence: 'user',
        profile: {
          ...profile,
          outputGamut: 's-gamut3-cine',
          outputTransfer: 's-log3',
          outputRange: 'full',
        },
      },
    },
  })

  expect(graph.supported).toBe(true)
  if (!graph.supported) throw new Error('Expected supported graph')
  expect(graph.steps.map((step) => step.kind)).toEqual([
    'input-linear-prophoto',
    'raw-render-exposure',
    'user-exposure',
    'user-contrast',
    'gamut-to-lut-input',
    'encode-lut-transfer',
    'lut3d',
    'lut-output-to-srgb',
    'output-srgb',
  ])
  expect(graph.steps[2]).toMatchObject({
    kind: 'user-exposure',
    ev: 1,
    multiplier: 2,
  })
  expect(graph.steps[3]).toMatchObject({
    kind: 'user-contrast',
    amount: 50,
    factor: Math.pow(2, 50 / 200),
  })
})

it('keeps built-in style export failure pointed at built-in style support', () => {
  const graph = resolveExportColorGraph({
    styleKind: 'builtin',
    intensity: 0.7,
    builtinPreset: 'warm',
    userExposureEv: 1,
    userContrast: 50,
    lut: null,
  })

  expect(graph.supported).toBe(false)
  if (graph.supported) throw new Error('Expected unsupported graph')
  expect(graph.message).toBe(
    'Built-in styles are not supported by full-resolution JPEG export.',
  )
})
```

Update existing graph-shape assertions in this file so no-LUT expects five
steps and LUT expects nine steps.

- [ ] **Step 2: Run color graph tests and verify red**

Run:

```bash
pnpm --filter @lumaforge/luma-color-runtime exec vitest run src/color-graph.test.ts
```

Expected: fail because `user-exposure` and `user-contrast` steps do not exist.

- [ ] **Step 3: Extend graph types and resolver**

Modify `packages/luma-color-runtime/src/color-graph.ts`:

```ts
import type { LumaColorToneParams } from './tone'
import { resolveToneParams } from './tone'

export type ExportColorGraphStep =
  | { kind: 'input-linear-prophoto' }
  | { kind: 'raw-render-exposure'; ev: number; multiplier: number }
  | { kind: 'user-exposure'; ev: number; multiplier: number }
  | {
      kind: 'user-contrast'
      amount: number
      factor: number
      pivot: number
      operator: 'linear-prophoto-luminance-scale'
      luminanceCoefficients: readonly [number, number, number]
      zeroLuminanceMode: 'return-black'
    }
  | { kind: 'gamut-to-lut-input'; matrix: Mat3; gamut: ColorGamutId }
```

Update the resolver input:

```ts
export function resolveExportColorGraph(input: {
  styleKind: ProcessingParams['styleKind']
  intensity: number
  builtinPreset: ProcessingParams['builtinPreset']
  lut: LUTData | null
  rawRenderExposure?: RawRenderExposure
  userExposureEv?: LumaColorToneParams['userExposureEv']
  userContrast?: LumaColorToneParams['userContrast']
}): ExportColorGraphDescriptor {
  const rawRenderExposure =
    input.rawRenderExposure ?? IDENTITY_RAW_RENDER_EXPOSURE
  const tone = resolveToneParams({
    userExposureEv: input.userExposureEv,
    userContrast: input.userContrast,
  })
  const base: ExportColorGraphStep[] = [
    { kind: 'input-linear-prophoto' },
    {
      kind: 'raw-render-exposure',
      ev: rawRenderExposure.ev,
      multiplier: rawRenderExposure.multiplier,
    },
    {
      kind: 'user-exposure',
      ev: tone.userExposureEv,
      multiplier: tone.userExposureMultiplier,
    },
    {
      kind: 'user-contrast',
      amount: tone.userContrast,
      factor: tone.userContrastFactor,
      pivot: tone.contrastPivot,
      operator: 'linear-prophoto-luminance-scale',
      luminanceCoefficients: tone.luminanceCoefficients,
      zeroLuminanceMode: 'return-black',
    },
  ]
```

Update `ResolveColorGraphInput` with `userExposureEv?: number` and
`userContrast?: number`.

- [ ] **Step 4: Run color graph tests**

Run:

```bash
pnpm --filter @lumaforge/luma-color-runtime exec vitest run src/color-graph.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit graph integration**

Run:

```bash
git add packages/luma-color-runtime/src/color-graph.ts packages/luma-color-runtime/src/color-graph.test.ts
git commit -m "feat(color-runtime): add tone graph steps"
```

## Task 3: CPU Row-Band Tone Execution

**Files:**

- Modify: `packages/luma-color-runtime/src/row-band-processor.ts`
- Modify: `packages/luma-color-runtime/src/row-band-processor.test.ts`

- [ ] **Step 1: Update row-band graph fixtures and add failing tests**

In `packages/luma-color-runtime/src/row-band-processor.test.ts`, update
`noLutGraph.steps` to:

```ts
steps: [
  { kind: 'input-linear-prophoto' },
  { kind: 'raw-render-exposure', ev: 0, multiplier: 1 },
  { kind: 'user-exposure', ev: 0, multiplier: 1 },
  {
    kind: 'user-contrast',
    amount: 0,
    factor: 1,
    pivot: 0.18,
    operator: 'linear-prophoto-luminance-scale',
    luminanceCoefficients: [0.2880402, 0.7118741, 0.0000857],
    zeroLuminanceMode: 'return-black',
  },
  { kind: 'output-srgb' },
]
```

Add tests:

```ts
it('changes no-lut output when user exposure changes', () => {
  const graph: SupportedExportColorGraphDescriptor = {
    ...noLutGraph,
    steps: noLutGraph.steps.map((step) =>
      step.kind === 'user-exposure'
        ? { kind: 'user-exposure', ev: 1, multiplier: 2 }
        : step,
    ),
  }
  const processor = createRowBandProcessor({ width: 1, rowBandRows: 1, graph })
  const rows = processor.processFloatRows(new Float32Array([0.1, 0.1, 0.1]), 1)

  expect(rows[0]).toBeGreaterThan(toSrgbByte(0.1))
})

it('keeps neutral tone output equal to the pre-tone no-lut reference', () => {
  const processor = createRowBandProcessor({
    width: 1,
    rowBandRows: 1,
    graph: noLutGraph,
  })
  const rows = processor.processFloatRows(new Float32Array([0.18, 0.18, 0.18]), 1)

  expect(rows).toEqual(
    new Uint8Array([
      toSrgbByte(0.18),
      toSrgbByte(0.18),
      toSrgbByte(0.18),
    ]),
  )
})

it('applies user contrast before LUT input sampling', () => {
  const graph = makePrecisionProbeGraph(0.2, 0.6)
  const contrastStep = graph.steps.find((step) => step.kind === 'user-contrast')
  if (!contrastStep || contrastStep.kind !== 'user-contrast') {
    throw new Error('Missing contrast step')
  }
  contrastStep.amount = 100
  contrastStep.factor = Math.SQRT2

  const processor = createRowBandProcessor({ width: 1, rowBandRows: 1, graph })
  const rows = processor.processFloatRows(new Float32Array([0.36, 0.36, 0.36]), 1)

  expect(rows[0]).toBeGreaterThan(toSrgbByte(0.4))
})
```

Update `makePrecisionProbeGraph` so it includes neutral tone steps before
`gamut-to-lut-input`.

- [ ] **Step 2: Run row-band tests and verify red**

Run:

```bash
pnpm --filter @lumaforge/luma-color-runtime exec vitest run src/row-band-processor.test.ts
```

Expected: fail with `FULL_RES_EXPORT_UNSUPPORTED_PIPELINE` or graph-shape
assertion failures.

- [ ] **Step 3: Compile tone steps in row-band processor**

Modify `packages/luma-color-runtime/src/row-band-processor.ts`:

```ts
type UserExposureStep = Extract<
  SupportedExportColorGraphDescriptor['steps'][number],
  { kind: 'user-exposure' }
>
type UserContrastStep = Extract<
  SupportedExportColorGraphDescriptor['steps'][number],
  { kind: 'user-contrast' }
>

function getUserExposureMultiplier(step: UserExposureStep) {
  return Number.isFinite(step.multiplier) ? step.multiplier : 1
}

type MutableRgb = [number, number, number]

function applyUserContrastScalarTo(
  r: number,
  g: number,
  b: number,
  step: UserContrastStep,
  out: MutableRgb,
) {
  if (step.amount === 0) {
    out[0] = r
    out[1] = g
    out[2] = b
    return out
  }

  const positiveR = Math.max(r, 0)
  const positiveG = Math.max(g, 0)
  const positiveB = Math.max(b, 0)
  const y =
    step.luminanceCoefficients[0] * positiveR +
    step.luminanceCoefficients[1] * positiveG +
    step.luminanceCoefficients[2] * positiveB
  if (y <= 0) {
    out[0] = 0
    out[1] = 0
    out[2] = 0
    return out
  }

  const targetY = step.pivot * Math.pow(y / step.pivot, step.factor)
  const scale = targetY / y
  out[0] = positiveR * scale
  out[1] = positiveG * scale
  out[2] = positiveB * scale
  return out
}
```

Update `isSimpleNoLutGraph` to expect five steps:

```ts
graph.steps.length === 5 &&
graph.steps[0]?.kind === 'input-linear-prophoto' &&
graph.steps[1]?.kind === 'raw-render-exposure' &&
graph.steps[2]?.kind === 'user-exposure' &&
graph.steps[3]?.kind === 'user-contrast' &&
graph.steps[4]?.kind === 'output-srgb'
```

Update `isSupportedLutGraph` to expect nine steps, with user tone at indexes
`2` and `3`.

In both graph appliers, compute edited scene values once before display or LUT
work:

```ts
const exposureMultiplier = getUserExposureMultiplier(graph.steps[2])
const contrastStep = graph.steps[3]
const toneScratch: [number, number, number] = [0, 0, 0]

const exposedR = (linear[index] ?? 0) * rawRenderExposureMultiplier * exposureMultiplier
const exposedG =
  (linear[index + 1] ?? 0) * rawRenderExposureMultiplier * exposureMultiplier
const exposedB =
  (linear[index + 2] ?? 0) * rawRenderExposureMultiplier * exposureMultiplier
const scene = applyUserContrastScalarTo(
  exposedR,
  exposedG,
  exposedB,
  contrastStep,
  toneScratch,
)
const sceneR = scene[0]
const sceneG = scene[1]
const sceneB = scene[2]
```

Use `sceneR`, `sceneG`, and `sceneB` for base display conversion and LUT input
conversion.

- [ ] **Step 4: Run row-band tests**

Run:

```bash
pnpm --filter @lumaforge/luma-color-runtime exec vitest run src/row-band-processor.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit CPU tone execution**

Run:

```bash
git add packages/luma-color-runtime/src/row-band-processor.ts packages/luma-color-runtime/src/row-band-processor.test.ts
git commit -m "feat(color-runtime): apply tone in row export"
```

## Task 4: GLSL Tone and Preview Pipeline Uniforms

**Files:**

- Modify: `packages/luma-color-runtime/src/glsl.ts`
- Modify: `src/lib/gl/shaders.ts`
- Modify: `src/lib/gl/shaders.test.ts`
- Modify: `src/lib/gl/context.ts`
- Modify: `src/lib/gl/context.test.ts`
- Modify: `src/modules/raw-processor/hooks/useCapabilityGate.ts`
- Modify: `src/lib/gl/pipeline.ts`
- Modify: `src/lib/gl/pipeline.test.ts`

- [ ] **Step 1: Write failing shader and pipeline tests**

Add shader assertions to `src/lib/gl/shaders.test.ts`:

```ts
it.each(PROCESS_SHADER_VARIANTS)(
  '%s variant applies user tone only to processed side',
  (_name, shader) => {
    expect(shader).toContain('uniform float u_userExposureMultiplier')
    expect(shader).toContain('uniform float u_userContrastAmount')
    expect(shader).toContain('uniform float u_userContrastFactor')
    expect(shader).toContain('vec3 technicalBaseSceneLinearProPhoto')
    expect(shader).toContain('vec3 editedBaseSceneLinearProPhoto')
    expect(shader).toContain(
      'styledColor = mix(technicalBaseDisplayColor, styledColor, finalSide)',
    )
  },
)
```

Add these fields to the `contextMock.capabilities` object in
`src/lib/gl/pipeline.test.ts` before adding assertions:

```ts
fragmentHighFloatPrecision: 23,
fragmentHighFloatRangeMin: 127,
fragmentHighFloatRangeMax: 127,
toneHighPrecision: true,
```

Add pipeline uniform assertions to `src/lib/gl/pipeline.test.ts`:

```ts
it('sends normalized user tone uniforms to the process shader', async () => {
  contextMock.reset()
  const pipeline = new RawProcessingPipeline(document.createElement('canvas'))
  await pipeline.initialize()

  pipeline.uploadImage({
    data: new Uint16Array([1024, 1024, 1024]),
    width: 1,
    height: 1,
    layout: 'rgb-u16',
    colorSpace: 'linear-prophoto-rgb',
    renderExposureEv: 0,
    renderExposureMultiplier: 1,
  })
  pipeline.setParams({ userExposureEv: 1, userContrast: 50 })
  pipeline.render()

  expect(contextMock.gl.uniform1f).toHaveBeenCalledWith(
    'u_userExposureMultiplier',
    2,
  )
  expect(contextMock.gl.uniform1f).toHaveBeenCalledWith(
    'u_userContrastAmount',
    50,
  )
  expect(contextMock.gl.uniform1f).toHaveBeenCalledWith(
    'u_userContrastFactor',
    Math.pow(2, 50 / 200),
  )
})
```

- [ ] **Step 2: Run shader and pipeline tests and verify red**

Run:

```bash
pnpm exec vitest run src/lib/gl/shaders.test.ts src/lib/gl/pipeline.test.ts
```

Expected: fail because tone uniforms and GLSL helpers are missing.

- [ ] **Step 3: Add shared tone GLSL**

Append to `packages/luma-color-runtime/src/glsl.ts`:

```ts
export const LUMA_COLOR_TONE_GLSL = /* glsl */ `
const vec3 LINEAR_PROPHOTO_LUMINANCE = vec3(0.2880402, 0.7118741, 0.0000857);
const float USER_CONTRAST_PIVOT = 0.18;

vec3 applyUserExposure(vec3 sceneLinear, float exposureMultiplier) {
  return sceneLinear * exposureMultiplier;
}

vec3 applyUserContrast(
  vec3 exposedSceneLinear,
  float contrastAmount,
  float contrastFactor
) {
  if (contrastAmount == 0.0) {
    return exposedSceneLinear;
  }

  vec3 contrastInput = max(exposedSceneLinear, vec3(0.0));
  float y = dot(contrastInput, LINEAR_PROPHOTO_LUMINANCE);
  if (y <= 0.0) {
    return vec3(0.0);
  }

  float targetY = USER_CONTRAST_PIVOT * pow(y / USER_CONTRAST_PIVOT, contrastFactor);
  return contrastInput * (targetY / y);
}

vec3 applyUserTone(
  vec3 sceneLinear,
  float exposureMultiplier,
  float contrastAmount,
  float contrastFactor
) {
  return applyUserContrast(
    applyUserExposure(sceneLinear, exposureMultiplier),
    contrastAmount,
    contrastFactor
  );
}
`
```

- [ ] **Step 4: Wire shader code and uniforms**

Modify `src/lib/gl/shaders.ts` imports:

```ts
import {
  LUMA_COLOR_LUT_GLSL,
  LUMA_COLOR_RANGE_GLSL,
  LUMA_COLOR_TONE_GLSL,
  LUMA_COLOR_TRANSFER_GLSL,
} from '@lumaforge/luma-color-runtime/glsl'
```

Add uniforms:

```glsl
uniform float u_userExposureMultiplier;
uniform float u_userContrastAmount;
uniform float u_userContrastFactor;
```

Add `${LUMA_COLOR_TONE_GLSL}` after the transfer/range/LUT snippets.

Replace the main body base-scene block with:

```glsl
vec3 technicalBaseSceneLinearProPhoto =
  readInputSceneLinearProPhoto(v_texCoord) * u_rawRenderExposureMultiplier;
vec3 editedBaseSceneLinearProPhoto = applyUserTone(
  technicalBaseSceneLinearProPhoto,
  u_userExposureMultiplier,
  u_userContrastAmount,
  u_userContrastFactor
);
vec3 technicalBaseDisplayLinear =
  linearProPhotoToLinearSrgb(max(technicalBaseSceneLinearProPhoto, vec3(0.0)));
vec3 editedBaseDisplayLinear =
  linearProPhotoToLinearSrgb(max(editedBaseSceneLinearProPhoto, vec3(0.0)));
vec3 technicalBaseDisplayColor = linearToSrgb(technicalBaseDisplayLinear);
vec3 editedBaseDisplayColor = linearToSrgb(editedBaseDisplayLinear);
vec3 styledColor = editedBaseDisplayColor;
```

For built-in and LUT branches, feed `editedBaseSceneLinearProPhoto` and
`editedBaseDisplayColor`. For original view, assign `technicalBaseDisplayColor`.
For compare view, mix technical left with styled right:

```glsl
if (u_viewMode == VIEW_MODE_ORIGINAL) {
  styledColor = technicalBaseDisplayColor;
} else if (u_viewMode == VIEW_MODE_COMPARE) {
  float finalSide = step(clamp(u_compareSplit, 0.0, 1.0), v_texCoord.x);
  styledColor = mix(technicalBaseDisplayColor, styledColor, finalSide);
}
```

- [ ] **Step 5: Add highp fragment precision capability**

Modify `src/lib/gl/context.ts`:

```ts
export interface WebGLCapabilities {
  webgl2: boolean
  maxTextureSize: number
  max3DTextureSize: number
  floatTextures: boolean
  floatTexturesLinear: boolean
  halfFloatTextures: boolean
  halfFloatTexturesLinear: boolean
  colorBufferFloat: boolean
  colorBufferHalfFloat: boolean
  maxVertexUniformVectors: number
  maxFragmentUniformVectors: number
  maxVaryingVectors: number
  fragmentHighFloatPrecision: number
  fragmentHighFloatRangeMin: number
  fragmentHighFloatRangeMax: number
  toneHighPrecision: boolean
  rendererInfo: string
  vendorInfo: string
}
```

Inside `detectCapabilities`, after extension checks:

```ts
const highFloat = tempGl.getShaderPrecisionFormat(
  tempGl.FRAGMENT_SHADER,
  tempGl.HIGH_FLOAT,
)
const fragmentHighFloatPrecision = highFloat?.precision ?? 0
const fragmentHighFloatRangeMin = highFloat?.rangeMin ?? 0
const fragmentHighFloatRangeMax = highFloat?.rangeMax ?? 0
const toneHighPrecision =
  fragmentHighFloatPrecision >= 16 && fragmentHighFloatRangeMax >= 62
```

Return these fields in both supported and unsupported capability objects.
For the unsupported object, use:

```ts
fragmentHighFloatPrecision: 0,
fragmentHighFloatRangeMin: 0,
fragmentHighFloatRangeMax: 0,
toneHighPrecision: false,
```

Modify `src/modules/raw-processor/hooks/useCapabilityGate.ts`:

```ts
if (!caps.toneHighPrecision) {
  return {
    ready: true,
    supportStatus: 'unsupported' as const,
    reason: 'High precision fragment shader math is required for RAW tone controls',
  }
}
```

- [ ] **Step 6: Wire pipeline uniforms**

Modify `src/lib/gl/pipeline.ts` imports:

```ts
import {
  getLinearProPhotoToGamutMatrix,
  getLUTOutputToTargetMatrix,
  mat3Identity,
  mat3ToGLSL,
  resolveExportColorGraph,
  resolveToneParams,
} from '@lumaforge/luma-color-runtime'
```

Update `DEFAULT_PARAMS`:

```ts
const DEFAULT_PARAMS: ProcessingParams = {
  intensity: 0.7,
  viewMode: 'compare',
  compareSplit: 0.5,
  styleKind: 'none',
  builtinPreset: null,
  userExposureEv: 0,
  userContrast: 0,
}
```

Add uniform lookups:

```ts
u_userExposureMultiplier: gl.getUniformLocation(
  program,
  'u_userExposureMultiplier',
),
u_userContrastAmount: gl.getUniformLocation(program, 'u_userContrastAmount'),
u_userContrastFactor: gl.getUniformLocation(program, 'u_userContrastFactor'),
```

Before uploading process uniforms:

```ts
const tone = resolveToneParams({
  userExposureEv: params.userExposureEv,
  userContrast: params.userContrast,
})
gl.uniform1f(
  processUniforms.u_userExposureMultiplier,
  tone.userExposureMultiplier,
)
gl.uniform1f(processUniforms.u_userContrastAmount, tone.userContrast)
gl.uniform1f(processUniforms.u_userContrastFactor, tone.userContrastFactor)
```

When calling `resolveExportColorGraph` in telemetry, pass tone:

```ts
const exportGraph = resolveExportColorGraph({
  styleKind: this.params.styleKind,
  intensity: this.params.intensity,
  builtinPreset: this.params.builtinPreset,
  lut: this.lutData,
  userExposureEv: this.params.userExposureEv,
  userContrast: this.params.userContrast,
})
```

- [ ] **Step 7: Run preview tests**

Run:

```bash
pnpm exec vitest run src/lib/gl/context.test.ts src/lib/gl/shaders.test.ts src/lib/gl/pipeline.test.ts
```

Expected: pass.

- [ ] **Step 8: Commit preview tone wiring**

Run:

```bash
git add packages/luma-color-runtime/src/glsl.ts src/lib/gl/shaders.ts src/lib/gl/shaders.test.ts src/lib/gl/context.ts src/lib/gl/context.test.ts src/modules/raw-processor/hooks/useCapabilityGate.ts src/lib/gl/pipeline.ts src/lib/gl/pipeline.test.ts
git commit -m "feat(raw-lab): apply tone in preview pipeline"
```

## Task 5: RAW Processor State and Export Invalidation

**Files:**

- Modify: `src/atoms/raw-processor.ts`
- Modify: `src/modules/raw-processor/hooks/useRawProcessor.ts`
- Modify: `src/modules/raw-processor/hooks/useRawProcessor.test.tsx`

- [ ] **Step 1: Add failing hook tests for tone state**

Add tests to `src/modules/raw-processor/hooks/useRawProcessor.test.tsx`:

```ts
it('clears a ready export when user tone changes', async () => {
  rawRuntimeAdapterMock.extractEmbeddedPreview.mockResolvedValue(null)
  rawRuntimeAdapterMock.decodeQuickRaw.mockResolvedValue(createDecodedImage('quick'))
  rawRuntimeAdapterMock.decodeBoundedHqRaw.mockResolvedValue(
    createDecodedImage('bounded-hq'),
  )
  exportSystemMock.runFullResolutionExportJob.mockResolvedValue({
    filename: 'frame_neutral_fullres.jpg',
    blob: new Blob(['jpeg'], { type: 'image/jpeg' }),
  })

  const { result } = renderHook(() => useRawProcessor(), { wrapper })
  await act(async () => {
    await result.current.loadFile(new File(['raw'], 'frame.ARW'))
  })
  await act(async () => {
    await result.current.exportImage({ quality: 'high', fidelity: 'balanced' })
  })

  expect(jotaiStore.get(currentSessionAtom)?.exportState.result).toBeDefined()

  act(() => {
    result.current.setToneParams({ userExposureEv: 1 })
  })

  expect(jotaiStore.get(currentSessionAtom)?.exportState.status).toBe('idle')
  expect(jotaiStore.get(currentSessionAtom)?.exportState.result).toBeUndefined()
})

it('resets only tone params from the tone reset action', () => {
  const { result } = renderHook(() => useRawProcessor(), { wrapper })

  act(() => {
    result.current.setParams({
      userExposureEv: 1,
      userContrast: 50,
      styleKind: 'custom',
      intensity: 0.2,
    })
  })
  act(() => {
    result.current.resetTone()
  })

  expect(result.current.params).toMatchObject({
    userExposureEv: 0,
    userContrast: 0,
    styleKind: 'custom',
    intensity: 0.2,
  })
})

it('passes user tone into full-resolution export graph', async () => {
  rawRuntimeAdapterMock.extractEmbeddedPreview.mockResolvedValue(null)
  rawRuntimeAdapterMock.decodeQuickRaw.mockResolvedValue(createDecodedImage('quick'))
  rawRuntimeAdapterMock.decodeBoundedHqRaw.mockResolvedValue(
    createDecodedImage('bounded-hq'),
  )
  exportSystemMock.runFullResolutionExportJob.mockResolvedValue({
    filename: 'frame_tone_fullres.jpg',
    blob: new Blob(['jpeg'], { type: 'image/jpeg' }),
  })

  const { result } = renderHook(() => useRawProcessor(), { wrapper })
  await act(async () => {
    await result.current.loadFile(new File(['raw'], 'frame.ARW'))
  })
  act(() => {
    result.current.setToneParams({ userExposureEv: 1, userContrast: 50 })
  })
  await act(async () => {
    await result.current.exportImage({ quality: 'high', fidelity: 'balanced' })
  })

  const [{ graph }] = exportSystemMock.runFullResolutionExportJob.mock.calls[0]!
  expect(graph.steps.map((step) => step.kind)).toContain('user-exposure')
  expect(graph.steps.map((step) => step.kind)).toContain('user-contrast')
})
```

- [ ] **Step 2: Run hook tests and verify red**

Run:

```bash
pnpm exec vitest run src/modules/raw-processor/hooks/useRawProcessor.test.tsx
```

Expected: fail because `setToneParams` and `resetTone` do not exist.

- [ ] **Step 3: Add defaults and migration at atom boundary**

Modify `src/atoms/raw-processor.ts` default params:

```ts
const DEFAULT_PROCESSING_PARAMS: ProcessingParams = {
  intensity: 0.7,
  viewMode: 'compare',
  compareSplit: 0.5,
  styleKind: 'none',
  builtinPreset: null,
  userExposureEv: 0,
  userContrast: 0,
}

const baseProcessingParamsAtom = atom<ProcessingParams>({
  ...DEFAULT_PROCESSING_PARAMS,
})
```

Use the same object in `resetToDefaults`:

```ts
setProcessingParams({ ...DEFAULT_PROCESSING_PARAMS })
```

- [ ] **Step 4: Add tone actions and invalidation**

Modify `src/modules/raw-processor/hooks/useRawProcessor.ts` imports:

```ts
import {
  normalizeToneParams,
  type ProcessingParams,
  resolveExportColorGraph,
} from '@lumaforge/luma-color-runtime'
```

Extend `changesRenderGraphParams`:

```ts
(Object.hasOwn(next, 'userExposureEv') &&
  next.userExposureEv !== current.userExposureEv) ||
(Object.hasOwn(next, 'userContrast') &&
  next.userContrast !== current.userContrast)
```

Extend return type:

```ts
setToneParams: (
  params: Partial<Pick<ProcessingParams, 'userExposureEv' | 'userContrast'>>,
) => void
resetTone: () => void
```

Implement handlers near `handleSetParams`:

```ts
const setToneParams = useCallback(
  (
    toneParams: Partial<
      Pick<ProcessingParams, 'userExposureEv' | 'userContrast'>
    >,
  ) => {
    const normalized = normalizeToneParams({
      userExposureEv: toneParams.userExposureEv ?? params.userExposureEv,
      userContrast: toneParams.userContrast ?? params.userContrast,
    })
    handleSetParams(normalized)
  },
  [handleSetParams, params.userContrast, params.userExposureEv],
)

const resetTone = useCallback(() => {
  handleSetParams({ userExposureEv: 0, userContrast: 0 })
}, [handleSetParams])
```

Pass tone into export graph:

```ts
const graph = resolveExportColorGraph({
  styleKind: params.styleKind,
  intensity: params.intensity,
  builtinPreset: params.builtinPreset,
  lut: lutDataRef.current,
  rawRenderExposure,
  userExposureEv: params.userExposureEv,
  userContrast: params.userContrast,
})
```

Return `setToneParams` and `resetTone`.

- [ ] **Step 5: Preserve tone through image load**

In the `loadFile` `setParams((prev) => ...)` block, leave tone fields from
`prev` intact by spreading `prev` first. The final assignment must look like:

```ts
setParams((prev) => ({
  ...prev,
  intensity: preservedCustomStyle
    ? mapIntensityLevel(preservedCustomStyle.currentIntensityLevel)
    : 0.7,
  viewMode: 'compare',
  compareSplit: preservedCompareSplit,
  styleKind: preservedCustomStyle ? 'custom' : 'none',
  builtinPreset: null,
}))
```

Add a hook test:

```ts
it('preserves non-neutral tone when a new image loads', async () => {
  rawRuntimeAdapterMock.extractEmbeddedPreview.mockResolvedValue(null)
  rawRuntimeAdapterMock.decodeQuickRaw.mockResolvedValue(createDecodedImage('quick'))
  rawRuntimeAdapterMock.decodeBoundedHqRaw.mockResolvedValue(
    createDecodedImage('bounded-hq'),
  )
  const { result } = renderHook(() => useRawProcessor(), { wrapper })

  act(() => {
    result.current.setToneParams({ userExposureEv: 1, userContrast: 50 })
  })
  await act(async () => {
    await result.current.loadFile(new File(['raw'], 'first.ARW'))
  })
  await act(async () => {
    await result.current.loadFile(new File(['raw'], 'second.ARW'))
  })

  expect(result.current.params).toMatchObject({
    userExposureEv: 1,
    userContrast: 50,
  })
})
```

- [ ] **Step 6: Update neutral params in existing test fixtures**

Add neutral tone fields to existing `ProcessingParams` test fixtures in these
files:

```text
src/lib/export/full-res-export.real.test.ts
src/lib/gl/pipeline-export.test.ts
src/lib/gl/pipeline.test.ts
src/modules/raw-processor/__tests__/raw-processor-view-file-facts.test.tsx
src/modules/raw-processor/__tests__/raw-route-shell.test.tsx
src/modules/raw-processor/__tests__/workspace-ui.test.tsx
src/modules/raw-processor/components/PreviewCanvas.test.ts
src/modules/raw-processor/hooks/useRawProcessor.test.tsx
```

Use the same literal fields everywhere:

```ts
userExposureEv: 0,
userContrast: 0,
```

- [ ] **Step 7: Run hook and atom tests**

Run:

```bash
pnpm exec vitest run src/modules/raw-processor/hooks/useRawProcessor.test.tsx src/modules/raw-processor/__tests__/raw-route-shell.test.tsx
```

Expected: pass.

- [ ] **Step 8: Commit state and export invalidation**

Run:

```bash
git add src/atoms/raw-processor.ts src/modules/raw-processor/hooks/useRawProcessor.ts src/modules/raw-processor/hooks/useRawProcessor.test.tsx src/lib/export/full-res-export.real.test.ts src/lib/gl/pipeline-export.test.ts src/lib/gl/pipeline.test.ts src/modules/raw-processor/__tests__/raw-processor-view-file-facts.test.tsx src/modules/raw-processor/__tests__/raw-route-shell.test.tsx src/modules/raw-processor/__tests__/workspace-ui.test.tsx src/modules/raw-processor/components/PreviewCanvas.test.ts
git commit -m "feat(raw-lab): track basic tone params"
```

## Task 6: RAW Lab Tone UI

**Files:**

- Create: `src/modules/raw-processor/components/tools/ToneTool.tsx`
- Modify: `src/modules/raw-processor/components/RawToolSurface.tsx`
- Modify: `src/modules/raw-processor/components/RawToolSurface.test.tsx`
- Modify: `src/modules/raw-processor/RawProcessorView.tsx`
- Modify: `src/modules/raw-processor/raw-lab.css`

- [ ] **Step 1: Write failing RawToolSurface tests**

Add to `src/modules/raw-processor/components/RawToolSurface.test.tsx` base
props:

```ts
tone: {
  userExposureEv: 0,
  userContrast: 0,
},
onToneChange: vi.fn(),
onToneReset: vi.fn(),
```

Update the Testing Library import in the same file:

```ts
import { fireEvent, render, screen, within } from '@testing-library/react'
```

Add tests:

```ts
it('renders tone controls before strength', async () => {
  render(<RawToolSurface {...baseProps} hasImage />)

  const tone = screen.getByRole('region', { name: 'Tone' })
  expect(within(tone).getByLabelText('Exposure')).toBeInTheDocument()
  expect(within(tone).getByLabelText('Contrast')).toBeInTheDocument()
  expect(screen.getByRole('region', { name: 'Tone' })).toBeInTheDocument()
})

it('sends normalized tone changes and resets only tone', async () => {
  const user = userEvent.setup()
  const onToneChange = vi.fn()
  const onToneReset = vi.fn()
  render(
    <RawToolSurface
      {...baseProps}
      hasImage
      tone={{ userExposureEv: 0, userContrast: 0 }}
      onToneChange={onToneChange}
      onToneReset={onToneReset}
    />,
  )

  fireEvent.change(screen.getByLabelText('Exposure'), {
    target: { value: '1.25' },
  })
  expect(onToneChange).toHaveBeenLastCalledWith({ userExposureEv: 1.25 })

  await user.click(screen.getByRole('button', { name: 'Reset tone' }))
  expect(onToneReset).toHaveBeenCalledTimes(1)
})

it('shows preserved tone state for non-neutral tone', () => {
  render(
    <RawToolSurface
      {...baseProps}
      hasImage
      tone={{ userExposureEv: 1, userContrast: 50 }}
    />,
  )

  expect(screen.getByText('Tone settings preserved')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run RawToolSurface tests and verify red**

Run:

```bash
pnpm exec vitest run src/modules/raw-processor/components/RawToolSurface.test.tsx
```

Expected: fail because Tone UI props and controls are missing.

- [ ] **Step 3: Create `ToneTool`**

Create `src/modules/raw-processor/components/tools/ToneTool.tsx`:

```tsx
import type { ProcessingParams } from '@lumaforge/luma-color-runtime'

import { Button } from '~/components/ui/button'

import { ToolSection } from './ToolSection'

export type ToneValue = Pick<
  ProcessingParams,
  'userExposureEv' | 'userContrast'
>

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
  const isNeutral = value.userExposureEv === 0 && value.userContrast === 0

  return (
    <ToolSection title="Tone" eyebrow="Basic">
      <div className="raw-tone-control">
        <label>
          <span>Exposure</span>
          <output>{value.userExposureEv.toFixed(2)} EV</output>
          <input
            aria-label="Exposure"
            type="range"
            min={-5}
            max={5}
            step={0.01}
            value={value.userExposureEv}
            disabled={disabled}
            onChange={(event) =>
              onChange({ userExposureEv: Number(event.currentTarget.value) })
            }
          />
        </label>
        <label>
          <span>Contrast</span>
          <output>{Math.round(value.userContrast)}</output>
          <input
            aria-label="Contrast"
            type="range"
            min={-100}
            max={100}
            step={1}
            value={value.userContrast}
            disabled={disabled}
            onChange={(event) =>
              onChange({ userContrast: Number(event.currentTarget.value) })
            }
          />
        </label>
      </div>
      <p className="raw-tool-note">
        Applies before LUT conversion and full-resolution export.
      </p>
      {!isNeutral && <p className="raw-tool-note">Tone settings preserved</p>}
      <Button variant="secondary" size="sm" disabled={disabled} onClick={onReset}>
        Reset tone
      </Button>
    </ToolSection>
  )
}
```

- [ ] **Step 4: Wire ToneTool into RawToolSurface and RawProcessorView**

Modify `src/modules/raw-processor/components/RawToolSurface.tsx` imports:

```ts
import { ToneTool, type ToneValue } from './tools/ToneTool'
```

Add props:

```ts
tone: ToneValue
onToneChange: (value: Partial<ToneValue>) => void
onToneReset: () => void
```

Render `ToneTool` before `Strength`:

```tsx
<ToneTool
  value={props.tone}
  disabled={disabled}
  onChange={props.onToneChange}
  onReset={props.onToneReset}
/>
```

Modify `src/modules/raw-processor/RawProcessorView.tsx` destructuring:

```ts
setToneParams,
resetTone,
```

Pass to `RawToolSurface`:

```tsx
tone={{
  userExposureEv: params.userExposureEv,
  userContrast: params.userContrast,
}}
onToneChange={setToneParams}
onToneReset={resetTone}
```

- [ ] **Step 5: Add tone CSS**

Append near strength styles in `src/modules/raw-processor/raw-lab.css`:

```css
.raw-tone-control {
  display: grid;
  gap: 10px;
}

.raw-tone-control label {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 6px 10px;
  color: var(--raw-ink);
  font-size: 0.76rem;
  font-weight: 700;
}

.raw-tone-control output {
  color: var(--raw-ink-soft);
  font-variant-numeric: tabular-nums;
}

.raw-tone-control input[type='range'] {
  grid-column: 1 / -1;
  width: 100%;
  accent-color: var(--raw-green);
}
```

- [ ] **Step 6: Run UI tests**

Run:

```bash
pnpm exec vitest run src/modules/raw-processor/components/RawToolSurface.test.tsx src/modules/raw-processor/__tests__/workspace-ui.test.tsx
```

Expected: pass.

- [ ] **Step 7: Commit tone UI**

Run:

```bash
git add src/modules/raw-processor/components/tools/ToneTool.tsx src/modules/raw-processor/components/RawToolSurface.tsx src/modules/raw-processor/components/RawToolSurface.test.tsx src/modules/raw-processor/RawProcessorView.tsx src/modules/raw-processor/raw-lab.css
git commit -m "feat(raw-lab): add basic tone controls"
```

## Task 7: Full Runtime Test Closure

**Files:**

- Modify tests only if prior task test failures identify outdated assertions.

- [ ] **Step 1: Run color runtime test suite**

Run:

```bash
pnpm --filter @lumaforge/luma-color-runtime test
```

Expected: pass all runtime tests.

- [ ] **Step 2: Run focused app tests**

Run:

```bash
pnpm exec vitest run src/lib/gl src/modules/raw-processor
```

Expected: pass all GL and RAW processor tests.

- [ ] **Step 3: Typecheck color runtime**

Run:

```bash
pnpm --filter @lumaforge/luma-color-runtime typecheck
```

Expected: no TypeScript errors.

- [ ] **Step 4: Build color runtime package**

Run:

```bash
pnpm --filter @lumaforge/luma-color-runtime build
```

Expected: package build completes and declaration emit succeeds.

- [ ] **Step 5: Run app build**

Run:

```bash
pnpm build
```

Expected: Vite production build completes.

- [ ] **Step 6: Commit test assertion updates**

If the previous steps required assertion-only updates, commit them:

```bash
git add packages/luma-color-runtime/src src/lib/gl src/modules/raw-processor
git commit -m "test(raw-lab): cover basic tone parity"
```

If no files changed after Task 6, skip this commit.

## Task 8: Performance Gate

**Files:**

- No source files should change if exact `pow` contrast meets the gate.

- [ ] **Step 1: Measure exact contrast export cost**

Run a full-resolution no-LUT export benchmark using the existing export path and
a 100MP-class RAW fixture. If the fixture cache is missing, prepare it first:

```bash
pnpm --filter @lumaforge/luma-raw-runtime fixtures:fetch-public
```

Then run the export smoke or browser benchmark used by the full-resolution
export track:

```bash
pnpm exec vitest run src/lib/export/full-res-export.real.test.ts
```

Expected: pass. Record the `colorMs` metrics for neutral contrast and
`userContrast: 100`.

- [ ] **Step 2: Apply the performance gate**

Gate:

```text
nonNeutralColorMs <= neutralColorMs * 1.25
```

Expected: if the gate passes, keep exact `pow` implementation. If the gate
fails, execute Task 9 before implementation is considered complete.

## Task 9: CPU Contrast Approximation Fallback

**Files:**

- Modify: `packages/luma-color-runtime/src/tone.ts`
- Modify: `packages/luma-color-runtime/src/tone.test.ts`
- Modify: `packages/luma-color-runtime/src/row-band-processor.ts`
- Modify: `packages/luma-color-runtime/src/row-band-processor.test.ts`

Execute this task only when Task 8 fails the `1.25x` color-stage gate.

- [ ] **Step 1: Add failing approximation tests**

Add to `packages/luma-color-runtime/src/tone.test.ts`:

```ts
import {
  createContrastScaleTable,
  sampleContrastScaleTable,
} from './tone'

it('approximates contrast scale over log luminance within tolerance', () => {
  const table = createContrastScaleTable({
    amount: 100,
    factor: Math.SQRT2,
    pivot: 0.18,
    minLogY: -24,
    maxLogY: 12,
    samples: 2049,
  })

  for (const y of [1e-8, 1e-6, 0.01, 0.18, 1, 8, 128]) {
    const exact = Math.pow(y / 0.18, Math.SQRT2 - 1)
    const approx = sampleContrastScaleTable(table, y)
    expect(Math.abs(approx - exact)).toBeLessThanOrEqual(
      Math.max(1 / 1024, Math.abs(exact) * 0.005),
    )
  }
})

it('uses exact contrast outside approximation domain', () => {
  const table = createContrastScaleTable({
    amount: -100,
    factor: Math.SQRT1_2,
    pivot: 0.18,
    minLogY: -24,
    maxLogY: 12,
    samples: 2049,
  })

  expect(sampleContrastScaleTable(table, 0)).toBe(0)
  expect(sampleContrastScaleTable(table, 1e-12)).toBe(
    Math.pow(1e-12 / 0.18, Math.SQRT1_2 - 1),
  )
  expect(sampleContrastScaleTable(table, 1000)).toBe(
    Math.pow(1000 / 0.18, Math.SQRT1_2 - 1),
  )
})
```

- [ ] **Step 2: Implement the table helpers**

Add to `packages/luma-color-runtime/src/tone.ts`:

```ts
export interface ContrastScaleTable {
  amount: number
  factor: number
  pivot: number
  minLogY: number
  maxLogY: number
  samples: number
  values: Float32Array
}

export function exactContrastScale(y: number, pivot: number, factor: number) {
  if (y <= 0) return 0
  return Math.pow(y / pivot, factor - 1)
}

export function createContrastScaleTable(input: {
  amount: number
  factor: number
  pivot: number
  minLogY: number
  maxLogY: number
  samples: number
}): ContrastScaleTable {
  const values = new Float32Array(input.samples)
  const span = input.maxLogY - input.minLogY
  for (let index = 0; index < input.samples; index += 1) {
    const t = input.samples === 1 ? 0 : index / (input.samples - 1)
    const logY = input.minLogY + span * t
    const y = input.pivot * Math.pow(2, logY)
    values[index] = exactContrastScale(y, input.pivot, input.factor)
  }
  return { ...input, values }
}

export function sampleContrastScaleTable(
  table: ContrastScaleTable,
  y: number,
) {
  if (y <= 0) return 0
  const logY = Math.log2(y / table.pivot)
  if (logY < table.minLogY || logY > table.maxLogY) {
    return exactContrastScale(y, table.pivot, table.factor)
  }
  const position =
    ((logY - table.minLogY) / (table.maxLogY - table.minLogY)) *
    (table.samples - 1)
  const lower = Math.floor(position)
  const upper = Math.min(table.samples - 1, lower + 1)
  const mix = position - lower
  return (table.values[lower] ?? 0) * (1 - mix) + (table.values[upper] ?? 0) * mix
}
```

- [ ] **Step 3: Use the table in CPU row-band only**

In `compileGraphApplier`, when `contrastStep.amount !== 0`, create one table per
compiled processor:

```ts
const contrastScaleTable =
  contrastStep.amount === 0
    ? null
    : createContrastScaleTable({
        amount: contrastStep.amount,
        factor: contrastStep.factor,
        pivot: contrastStep.pivot,
        minLogY: -24,
        maxLogY: 12,
        samples: 2049,
      })
```

In CPU contrast evaluation, use the table when present:

```ts
const scale = contrastScaleTable
  ? sampleContrastScaleTable(contrastScaleTable, y)
  : exactContrastScale(y, step.pivot, step.factor)
return [
  positiveR * scale,
  positiveG * scale,
  positiveB * scale,
] as const
```

Keep GLSL exact `pow`; tests compare CPU approximation against exact oracle.

- [ ] **Step 4: Run approximation tests**

Run:

```bash
pnpm --filter @lumaforge/luma-color-runtime exec vitest run src/tone.test.ts src/row-band-processor.test.ts
```

Expected: pass.

- [ ] **Step 5: Re-run the performance gate**

Run:

```bash
pnpm exec vitest run src/lib/export/full-res-export.real.test.ts
```

Expected: pass and `userContrast: 100` color-stage time is at or below the
`1.25x` gate.

- [ ] **Step 6: Commit approximation fallback**

Run:

```bash
git add packages/luma-color-runtime/src/tone.ts packages/luma-color-runtime/src/tone.test.ts packages/luma-color-runtime/src/row-band-processor.ts packages/luma-color-runtime/src/row-band-processor.test.ts
git commit -m "perf(color-runtime): add contrast scale approximation"
```

## Final Acceptance

- [ ] `pnpm --filter @lumaforge/luma-color-runtime test`
- [ ] `pnpm --filter @lumaforge/luma-color-runtime typecheck`
- [ ] `pnpm --filter @lumaforge/luma-color-runtime build`
- [ ] `pnpm exec vitest run src/lib/gl src/modules/raw-processor`
- [ ] `pnpm build`
- [ ] Browser smoke on `/raw`: load RAW, set `Exposure +1.00 EV`, set `Contrast +50`, verify preview updates without decode restart.
- [ ] Full-resolution no-LUT export with non-neutral tone produces a JPEG and export metrics stay within the performance gate.
- [ ] Full-resolution custom LUT export with non-neutral tone keeps the LUT profile contract and tone affects the LUT input path.

## Implementation Notes

- Execute implementation in a dedicated repo-local worktree, for example
  `.worktrees/feat/basic-tone-exposure-contrast`, unless the user explicitly
  chooses inline work on the current checkout.
- Do not implement `Highlights`, `Shadows`, `Whites`, or `Blacks`.
- Do not make built-in style export supported in this plan.
- Do not add tone params to share URLs.
- Do not re-decode or re-upload RAW/LUT textures for slider-only tone changes.
- Preserve `raw-render-exposure` as a decode/session fact and user exposure as an edit step.
