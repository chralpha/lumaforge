# Relative Temperature Tint Adjust Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add relative `Temperature` and `Tint` controls to RAW Lab under `Adjust -> Color`, keeping them separate from `Tone` while preserving preview, histogram, CPU preview, and full-resolution export parity.

**Architecture:** Build a standalone color-balance runtime module first, then insert a shared `user-color-balance` graph step after `raw-render-exposure` and before user tone. Thread the normalized graph through GPU preview, CPU row-band export, histogram jobs, app state, desktop Adjust UI, and mobile Adjust UI without adding temperature or tint to `ToneValue`.

**Tech Stack:** TypeScript, React 19, Jotai, Radix-compatible local segment primitives, Tailwind CSS v4, Vitest, `@lumaforge/luma-color-runtime`, WebGL2 GLSL.

**Spec:** `docs/specs/2026-05-31-relative-temperature-tint-adjust-design.md`

---

## Constitution

Module boundary:
- `packages/luma-color-runtime/src/color-balance.ts` owns color-balance params, normalization, gain resolution, and CPU tuple application.
- `tone.ts` remains unchanged except for shared imports already used by existing runtime code. `ToneValue`, `setToneParams`, and `resetTone` never receive temperature or tint fields.
- UI state exposes separate `color`, `onColorChange`, and `onColorReset` props beside the existing tone props.

Observable interface:
- Runtime behavior is verified through `color-balance.test.ts`, `color-graph.test.ts`, `row-band-processor.test.ts`, and `glsl.test.ts`.
- App parity is verified through focused WebGL, export-state, histogram, CPU-preview, hook, desktop UI, and mobile UI tests.

Complexity budget:
- Temperature and tint ship together. The fixed cost is one shared color chain through params, graph, preview, export, histogram, and UI. Tint adds one normalized parameter, one gain term, one slider, and focused assertions, so complexity grows linearly relative to a single relative color channel.

Commit standard:
- Use conventional commit messages.
- Do not pass `--no-gpg-sign`.
- Keep each task commit scoped to the files listed in that task.

## File Map

New runtime files:
- `packages/luma-color-runtime/src/color-balance.ts` - relative temperature/tint normalization, gain resolution, RGB application helpers.
- `packages/luma-color-runtime/src/color-balance.test.ts` - math contract tests.

Modified runtime files:
- `packages/luma-color-runtime/src/index.ts` - export the color-balance module.
- `packages/luma-color-runtime/src/types.ts` - compose `LumaColorProcessingParams` from tone plus color-balance params.
- `packages/luma-color-runtime/src/color-graph.ts` - add `user-color-balance` graph step after `raw-render-exposure`.
- `packages/luma-color-runtime/src/color-graph.test.ts` - assert graph order and graph step shape.
- `packages/luma-color-runtime/src/row-band-processor.ts` - apply graph color-balance gain before user exposure/tone in no-LUT and LUT paths.
- `packages/luma-color-runtime/src/row-band-processor.test.ts` - verify CPU output shifts in warm/cool and magenta/green directions.
- `packages/luma-color-runtime/src/glsl.ts` - export package-level GLSL helper for color balance.
- `packages/luma-color-runtime/src/glsl.test.ts` - assert GLSL helper ABI.

Modified WebGL files:
- `src/lib/gl/shaders.ts` - add `u_userColorBalanceGain` uniform and multiply edited scene-linear base before tone.
- `src/lib/gl/shaders.test.ts` - assert uniform and shader order.
- `src/lib/gl/pipeline.ts` - resolve color-balance gain on the CPU and send it as a `vec3` uniform.
- `src/lib/gl/pipeline.test.ts` - assert uniform lookup and `uniform3f` values.
- `src/lib/gl/pipeline-export.test.ts` - update processing params used by export tests.
- `src/modules/raw-processor/components/PreviewCanvas.tsx` - include color params in memoized processed canvas params and dependencies.

Modified app state/export/histogram files:
- `src/atoms/raw-processor.ts` - add default `userTemperature: 0` and `userTint: 0`.
- `src/modules/raw-processor/services/params/orchestrate-params-update.ts` - add `computeColorParams`.
- `src/modules/raw-processor/services/export-state.ts` - invalidate ready export results when color params change.
- `src/modules/raw-processor/services/export-state.test.ts` - cover color param invalidation.
- `src/modules/raw-processor/hooks/useRawProcessor.ts` - expose `setColorParams` and `resetColor`.
- `src/modules/raw-processor/hooks/useRawProcessor.test.tsx` - cover color update/reset and reset scope separation.
- `src/modules/raw-processor/hooks/usePreviewHistogram.ts` - include color fields in job keys and graph input.
- `src/modules/raw-processor/hooks/usePreviewHistogram.test.tsx` - cover recompute on color changes.
- `src/modules/raw-processor/hooks/useCpuPreview.ts` - include color fields in CPU graph input, neutral graph, and render signature.
- `src/modules/raw-processor/hooks/useCpuPreview.test.ts` - cover processed and neutral graph inputs.
- `src/modules/raw-processor/services/export/orchestrate-full-res-export.ts` - pass color params into export graph and add `snapshot.color`.
- `src/modules/raw-processor/__tests__/raw-processor-view-file-facts.test.tsx` - update mocked return shape.
- `src/modules/raw-processor/__tests__/workspace-ui.test.tsx` - update `RawToolSurface` props and Adjust assertions.
- `src/modules/raw-processor/services/raw/orchestrate-raw-load.test.ts` - update default processing params where copied inline.
- `src/modules/raw-processor/services/export-evacuation.test.ts` - update default processing params where copied inline.
- `src/modules/raw-processor/services/original-reference-renderer.ts` - keep original-reference params neutral with color defaults.

New desktop UI files:
- `src/modules/raw-processor/components/tools/ColorTool.tsx` - color value schema, slider fields, value formatting, neutral detection, reset button.
- `src/modules/raw-processor/components/tools/AdjustTool.tsx` - `Tone`/`Color` segmented subpanel wrapper.

Modified desktop UI files:
- `src/modules/raw-processor/components/RawToolSurface.tsx` - replace Tone card with Adjust card and pass color props.
- `src/modules/raw-processor/RawProcessorView.tsx` - derive `color` from processing params and pass `setColorParams`/`resetColor`.
- `src/modules/raw-processor/components/RawToolSurface.test.tsx` - cover desktop Adjust switching and scoped resets.

New mobile UI files:
- `src/modules/raw-processor/components/mobile/color-fields.ts` - mobile color field metadata and value formatting.
- `src/modules/raw-processor/components/mobile/color-fields.test.ts` - color field formatting and neutral checks.
- `src/modules/raw-processor/components/mobile/ColorStripPanel.tsx` - mobile horizontal color slider picker.
- `src/modules/raw-processor/components/mobile/ColorStripPanel.test.tsx` - color strip interactions.
- `src/modules/raw-processor/components/mobile/ColorFocusEditor.tsx` - focused mobile editor for color sliders.
- `src/modules/raw-processor/components/mobile/ColorFocusEditor.test.tsx` - color focus edit/reset/sibling behavior.
- `src/modules/raw-processor/components/mobile/AdjustStripPanel.tsx` - mobile `Tone`/`Color` subpanel selector.
- `src/modules/raw-processor/components/mobile/AdjustStripPanel.test.tsx` - subpanel switch and scoped reset behavior.

Modified mobile UI files:
- `src/modules/raw-processor/components/mobile/MobileModeDock.tsx` - keep mode id `tone`, change label key to `raw.mobile.mode.adjust`.
- `src/modules/raw-processor/components/mobile/MobileModeDock.test.tsx` - assert four modes and Adjust label.
- `src/modules/raw-processor/components/mobile/MobileLabChrome.tsx` - manage separate tone/color focus keys and render Adjust panel.
- `src/modules/raw-processor/components/mobile/MobileLabChrome.test.tsx` - cover Adjust panel switch without adding a fifth dock tab.
- `src/modules/raw-processor/components/mobile/tone-fields.ts` - stays tone-only.
- `src/modules/raw-processor/components/mobile/tone-fields.test.ts` - assert tone keys exclude color fields.

Modified locale files:
- `src/locales/en.json` - add Adjust and Color labels.
- `src/locales/zh-CN.json` - add Adjust and Color labels.
- `src/__tests__/i18n-locales.test.ts` - existing locale parity test should pass after key additions.

---

## Task 1: Runtime Color-Balance Math

**Files:**
- Create: `packages/luma-color-runtime/src/color-balance.ts`
- Create: `packages/luma-color-runtime/src/color-balance.test.ts`
- Modify: `packages/luma-color-runtime/src/index.ts`

- [ ] **Step 1: Write the failing runtime tests**

Create `packages/luma-color-runtime/src/color-balance.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import {
  applyColorBalanceRgb,
  normalizeColorBalanceParams,
  resolveColorBalanceParams,
} from './color-balance'

function expectCloseTriplet(
  actual: readonly [number, number, number],
  expected: readonly [number, number, number],
) {
  expect(actual[0]).toBeCloseTo(expected[0], 6)
  expect(actual[1]).toBeCloseTo(expected[1], 6)
  expect(actual[2]).toBeCloseTo(expected[2], 6)
}

describe('color balance', () => {
  it('normalizes invalid and out-of-range input to finite UI bounds', () => {
    expect(
      normalizeColorBalanceParams({
        userTemperature: Number.POSITIVE_INFINITY,
        userTint: Number.NaN,
      }),
    ).toEqual({ userTemperature: 0, userTint: 0 })

    expect(
      normalizeColorBalanceParams({
        userTemperature: 140,
        userTint: -180,
      }),
    ).toEqual({ userTemperature: 100, userTint: -100 })
  })

  it('resolves neutral controls to identity gain', () => {
    const resolved = resolveColorBalanceParams({
      userTemperature: 0,
      userTint: 0,
    })

    expect(resolved.userTemperature).toBe(0)
    expect(resolved.userTint).toBe(0)
    expectCloseTriplet(resolved.gain, [1, 1, 1])
  })

  it('warms by increasing red relative to blue', () => {
    const warm = resolveColorBalanceParams({ userTemperature: 100, userTint: 0 })
    const cool = resolveColorBalanceParams({
      userTemperature: -100,
      userTint: 0,
    })

    expect(warm.gain[0]).toBeGreaterThan(warm.gain[2])
    expect(cool.gain[2]).toBeGreaterThan(cool.gain[0])
  })

  it('tints magenta by reducing green relative to red and blue', () => {
    const magenta = resolveColorBalanceParams({
      userTemperature: 0,
      userTint: 100,
    })
    const green = resolveColorBalanceParams({
      userTemperature: 0,
      userTint: -100,
    })

    expect(magenta.gain[1]).toBeLessThan(magenta.gain[0])
    expect(magenta.gain[1]).toBeLessThan(magenta.gain[2])
    expect(green.gain[1]).toBeGreaterThan(green.gain[0])
    expect(green.gain[1]).toBeGreaterThan(green.gain[2])
  })

  it('applies gain without clamping channel values', () => {
    const resolved = resolveColorBalanceParams({
      userTemperature: 100,
      userTint: 100,
    })

    const output = applyColorBalanceRgb([-0.1, 0.18, 2], resolved.gain)

    expect(output[0]).toBeLessThan(0)
    expect(output[1]).toBeGreaterThan(0)
    expect(output[2]).toBeGreaterThan(1)
  })
})
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
pnpm --filter @lumaforge/luma-color-runtime exec vitest run src/color-balance.test.ts
```

Expected: FAIL because `./color-balance` does not exist.

- [ ] **Step 3: Add the color-balance module**

Create `packages/luma-color-runtime/src/color-balance.ts`:

```ts
import { LINEAR_PROPHOTO_LUMINANCE } from './tone'

export const USER_TEMPERATURE_MIN = -100
export const USER_TEMPERATURE_MAX = 100
export const USER_TINT_MIN = -100
export const USER_TINT_MAX = 100
export const COLOR_BALANCE_TEMP_MAX_EV = 0.22
export const COLOR_BALANCE_TINT_MAX_EV = 0.16
export const COLOR_BALANCE_TINT_RED_BLUE_SHARE = 0.35

export interface LumaColorBalanceParams {
  userTemperature: number
  userTint: number
}

export interface ResolvedColorBalanceParams extends LumaColorBalanceParams {
  gain: readonly [number, number, number]
  operator: 'linear-prophoto-relative-rgb-gain'
  luminanceCoefficients: readonly [number, number, number]
}

export type ColorBalanceRgb = readonly [number, number, number]
export type MutableColorBalanceRgb = [number, number, number]

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function finiteOrDefault(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export function normalizeColorBalanceParams(
  input?: Partial<LumaColorBalanceParams> | null,
): LumaColorBalanceParams {
  return {
    userTemperature: clamp(
      finiteOrDefault(input?.userTemperature, 0),
      USER_TEMPERATURE_MIN,
      USER_TEMPERATURE_MAX,
    ),
    userTint: clamp(
      finiteOrDefault(input?.userTint, 0),
      USER_TINT_MIN,
      USER_TINT_MAX,
    ),
  }
}

export function resolveColorBalanceParams(
  input?: Partial<LumaColorBalanceParams> | null,
): ResolvedColorBalanceParams {
  const normalized = normalizeColorBalanceParams(input)
  const temperatureNorm = normalized.userTemperature / 100
  const tintNorm = normalized.userTint / 100

  const rawR = Math.pow(
    2,
    temperatureNorm * COLOR_BALANCE_TEMP_MAX_EV +
      tintNorm *
        COLOR_BALANCE_TINT_MAX_EV *
        COLOR_BALANCE_TINT_RED_BLUE_SHARE,
  )
  const rawG = Math.pow(2, -tintNorm * COLOR_BALANCE_TINT_MAX_EV)
  const rawB = Math.pow(
    2,
    -temperatureNorm * COLOR_BALANCE_TEMP_MAX_EV +
      tintNorm *
        COLOR_BALANCE_TINT_MAX_EV *
        COLOR_BALANCE_TINT_RED_BLUE_SHARE,
  )

  const luminance =
    rawR * LINEAR_PROPHOTO_LUMINANCE[0] +
    rawG * LINEAR_PROPHOTO_LUMINANCE[1] +
    rawB * LINEAR_PROPHOTO_LUMINANCE[2]
  const lumaScale = 1 / Math.max(luminance, 1e-6)

  return {
    ...normalized,
    gain: [rawR * lumaScale, rawG * lumaScale, rawB * lumaScale],
    operator: 'linear-prophoto-relative-rgb-gain',
    luminanceCoefficients: LINEAR_PROPHOTO_LUMINANCE,
  }
}

export function applyColorBalanceRgb(
  rgb: ColorBalanceRgb,
  gain: readonly [number, number, number],
): [number, number, number] {
  return applyColorBalanceRgbInto(rgb, gain, [0, 0, 0])
}

export function applyColorBalanceRgbInto(
  rgb: ColorBalanceRgb,
  gain: readonly [number, number, number],
  out: MutableColorBalanceRgb,
): MutableColorBalanceRgb {
  out[0] = rgb[0] * gain[0]
  out[1] = rgb[1] * gain[1]
  out[2] = rgb[2] * gain[2]
  return out
}
```

- [ ] **Step 4: Export the module**

In `packages/luma-color-runtime/src/index.ts`, add:

```ts
export * from './color-balance'
```

- [ ] **Step 5: Verify the runtime test passes**

Run:

```bash
pnpm --filter @lumaforge/luma-color-runtime exec vitest run src/color-balance.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/luma-color-runtime/src/color-balance.ts packages/luma-color-runtime/src/color-balance.test.ts packages/luma-color-runtime/src/index.ts
git commit -m "feat(color-runtime): add relative color balance math"
```

---

## Task 2: Shared Graph and CPU Row-Band Support

**Files:**
- Modify: `packages/luma-color-runtime/src/types.ts`
- Modify: `packages/luma-color-runtime/src/color-graph.ts`
- Modify: `packages/luma-color-runtime/src/color-graph.test.ts`
- Modify: `packages/luma-color-runtime/src/row-band-processor.ts`
- Modify: `packages/luma-color-runtime/src/row-band-processor.test.ts`

- [ ] **Step 1: Update graph tests first**

In `packages/luma-color-runtime/src/color-graph.test.ts`, change all expected graph order arrays to include `user-color-balance` immediately after `raw-render-exposure`.

Add this assertion inside the no-LUT graph test:

```ts
expect(graph.steps[2]).toMatchObject({
  kind: 'user-color-balance',
  temperature: 0,
  tint: 0,
  gain: [1, 1, 1],
  operator: 'linear-prophoto-relative-rgb-gain',
  luminanceCoefficients: [0.2880402, 0.7118741, 0.0000857],
})
```

Add a dedicated ordering test:

```ts
it('places user color balance after raw render exposure and before tone', () => {
  const graph = resolveExportColorGraph({
    styleKind: 'none',
    intensity: 0.7,
    builtinPreset: null,
    lut: null,
    userTemperature: 40,
    userTint: -25,
  })

  expect(graph.supported).toBe(true)
  if (!graph.supported) throw new Error('Expected supported graph')
  expect(graph.steps.map((step) => step.kind).slice(0, 5)).toEqual([
    'input-linear-prophoto',
    'raw-render-exposure',
    'user-color-balance',
    'user-exposure',
    'user-contrast',
  ])
  expect(graph.steps[2]).toMatchObject({
    kind: 'user-color-balance',
    temperature: 40,
    tint: -25,
  })
})
```

- [ ] **Step 2: Run graph tests to confirm failure**

Run:

```bash
pnpm --filter @lumaforge/luma-color-runtime exec vitest run src/color-graph.test.ts
```

Expected: FAIL with missing `user-color-balance` step.

- [ ] **Step 3: Compose processing params from tone and color**

In `packages/luma-color-runtime/src/types.ts`, add:

```ts
import type { LumaColorBalanceParams } from './color-balance'
```

Change the processing interface to:

```ts
export interface LumaColorProcessingParams
  extends LumaColorToneParams,
    LumaColorBalanceParams {
  intensity: number
  viewMode: 'processed' | 'original' | 'compare'
  compareSplit: number
  styleKind: 'none' | 'builtin' | 'custom'
  builtinPreset: BuiltinStylePreset | null
}
```

- [ ] **Step 4: Add the graph step variant and resolver input**

In `packages/luma-color-runtime/src/color-graph.ts`, add imports:

```ts
import type { LumaColorBalanceParams } from './color-balance'
import { resolveColorBalanceParams } from './color-balance'
```

Add this union arm to `ExportColorGraphStep` after `raw-render-exposure`:

```ts
  | {
      kind: 'user-color-balance'
      temperature: number
      tint: number
      gain: readonly [number, number, number]
      operator: 'linear-prophoto-relative-rgb-gain'
      luminanceCoefficients: readonly [number, number, number]
    }
```

Add input fields to `resolveExportColorGraph`:

```ts
  userTemperature?: LumaColorBalanceParams['userTemperature']
  userTint?: LumaColorBalanceParams['userTint']
```

Resolve color before building `base`:

```ts
  const colorBalance = resolveColorBalanceParams({
    userTemperature: input.userTemperature,
    userTint: input.userTint,
  })
```

Insert this step after `raw-render-exposure`:

```ts
    {
      kind: 'user-color-balance',
      temperature: colorBalance.userTemperature,
      tint: colorBalance.userTint,
      gain: colorBalance.gain,
      operator: colorBalance.operator,
      luminanceCoefficients: colorBalance.luminanceCoefficients,
    },
```

- [ ] **Step 5: Verify graph tests pass**

Run:

```bash
pnpm --filter @lumaforge/luma-color-runtime exec vitest run src/color-graph.test.ts
```

Expected: PASS.

- [ ] **Step 6: Update CPU row-band tests first**

In `packages/luma-color-runtime/src/row-band-processor.test.ts`, update `neutralToneSteps()` callers so test graphs include a color step:

```ts
function neutralColorStep(): SupportedExportColorGraphDescriptor['steps'][number] {
  return {
    kind: 'user-color-balance',
    temperature: 0,
    tint: 0,
    gain: [1, 1, 1],
    operator: 'linear-prophoto-relative-rgb-gain',
    luminanceCoefficients: [0.2880402, 0.7118741, 0.0000857],
  }
}
```

Place `neutralColorStep()` after every `raw-render-exposure` test graph step.

Add this CPU behavior test:

```ts
it('applies color balance before tone in no-lut export', () => {
  const graph: SupportedExportColorGraphDescriptor = {
    ...noLutGraph,
    steps: noLutGraph.steps.map((step) =>
      step.kind === 'user-color-balance'
        ? {
            ...step,
            temperature: 100,
            gain: [1.15, 1, 0.85],
          }
        : step,
    ),
  }
  const processor = createRowBandProcessor({
    width: 1,
    rowBandRows: 1,
    graph,
  })

  const rows = processor.processFloatRows(
    new Float32Array([0.18, 0.18, 0.18]),
    1,
  )

  expect(rows[0]).toBeGreaterThan(rows[2])
})
```

- [ ] **Step 7: Run row-band tests to confirm failure**

Run:

```bash
pnpm --filter @lumaforge/luma-color-runtime exec vitest run src/row-band-processor.test.ts
```

Expected: FAIL because graph shape guards still expect the old step indexes.

- [ ] **Step 8: Update row-band graph guards and appliers**

In `packages/luma-color-runtime/src/row-band-processor.ts`, add the color step type:

```ts
type UserColorBalanceStep = Extract<
  SupportedExportColorGraphDescriptor['steps'][number],
  { kind: 'user-color-balance' }
>
```

Change the simple no-LUT tuple guard to:

```ts
  steps: [
    { kind: 'input-linear-prophoto' },
    Extract<
      SupportedExportColorGraphDescriptor['steps'][number],
      { kind: 'raw-render-exposure' }
    >,
    UserColorBalanceStep,
    Extract<
      SupportedExportColorGraphDescriptor['steps'][number],
      { kind: 'user-exposure' }
    >,
    Extract<
      SupportedExportColorGraphDescriptor['steps'][number],
      { kind: 'user-contrast' }
    >,
    Extract<
      SupportedExportColorGraphDescriptor['steps'][number],
      { kind: 'user-regional-tone' }
    >,
    { kind: 'output-srgb' },
  ]
```

Change simple no-LUT guard conditions to length `7` and step indexes:

```ts
    graph.steps.length === 7 &&
    graph.steps[0]?.kind === 'input-linear-prophoto' &&
    graph.steps[1]?.kind === 'raw-render-exposure' &&
    graph.steps[2]?.kind === 'user-color-balance' &&
    graph.steps[3]?.kind === 'user-exposure' &&
    graph.steps[4]?.kind === 'user-contrast' &&
    graph.steps[5]?.kind === 'user-regional-tone' &&
    graph.steps[6]?.kind === 'output-srgb'
```

Change the supported LUT tuple guard to include `UserColorBalanceStep`, length `11`, and indexes:

```ts
    graph.steps.length === 11 &&
    graph.steps[0]?.kind === 'input-linear-prophoto' &&
    graph.steps[1]?.kind === 'raw-render-exposure' &&
    graph.steps[2]?.kind === 'user-color-balance' &&
    graph.steps[3]?.kind === 'user-exposure' &&
    graph.steps[4]?.kind === 'user-contrast' &&
    graph.steps[5]?.kind === 'user-regional-tone' &&
    graph.steps[6]?.kind === 'gamut-to-lut-input' &&
    graph.steps[7]?.kind === 'encode-lut-transfer' &&
    graph.steps[8]?.kind === 'lut3d' &&
    graph.steps[9]?.kind === 'lut-output-to-srgb' &&
    graph.steps[10]?.kind === 'output-srgb'
```

Add gain sanitization:

```ts
function getUserColorBalanceGain(
  step: UserColorBalanceStep,
): readonly [number, number, number] {
  return [
    Number.isFinite(step.gain[0]) ? step.gain[0] : 1,
    Number.isFinite(step.gain[1]) ? step.gain[1] : 1,
    Number.isFinite(step.gain[2]) ? step.gain[2] : 1,
  ]
}
```

In both no-LUT and LUT branches, read indexes like this:

```ts
  const rawRenderExposureMultiplier = getRawRenderExposureMultiplier(
    graph.steps[1],
  )
  const colorBalanceGain = getUserColorBalanceGain(graph.steps[2])
  const exposureMultiplier = getUserExposureMultiplier(graph.steps[3])
  const contrastStep = graph.steps[4]
  const regionalToneStep = graph.steps[5]
```

In both loops, split raw render exposure, color balance, and user exposure:

```ts
        const baseR = (linear[index] ?? 0) * rawRenderExposureMultiplier
        const baseG = (linear[index + 1] ?? 0) * rawRenderExposureMultiplier
        const baseB = (linear[index + 2] ?? 0) * rawRenderExposureMultiplier
        const exposedR = baseR * colorBalanceGain[0] * exposureMultiplier
        const exposedG = baseG * colorBalanceGain[1] * exposureMultiplier
        const exposedB = baseB * colorBalanceGain[2] * exposureMultiplier
```

Update LUT branch indexes:

```ts
  const inputMatrix = graph.steps[6].matrix
  const encodeStep = graph.steps[7]
  const lutStep = graph.steps[8]
  const outputStep = graph.steps[9]
```

- [ ] **Step 9: Verify row-band tests pass**

Run:

```bash
pnpm --filter @lumaforge/luma-color-runtime exec vitest run src/row-band-processor.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add packages/luma-color-runtime/src/types.ts packages/luma-color-runtime/src/color-graph.ts packages/luma-color-runtime/src/color-graph.test.ts packages/luma-color-runtime/src/row-band-processor.ts packages/luma-color-runtime/src/row-band-processor.test.ts
git commit -m "feat(color-runtime): add color balance graph step"
```

---

## Task 3: GLSL and WebGL Preview Parity

**Files:**
- Modify: `packages/luma-color-runtime/src/glsl.ts`
- Modify: `packages/luma-color-runtime/src/glsl.test.ts`
- Modify: `src/lib/gl/shaders.ts`
- Modify: `src/lib/gl/shaders.test.ts`
- Modify: `src/lib/gl/pipeline.ts`
- Modify: `src/lib/gl/pipeline.test.ts`
- Modify: `src/lib/gl/pipeline-export.test.ts`
- Modify: `src/modules/raw-processor/components/PreviewCanvas.tsx`

- [ ] **Step 1: Add package GLSL assertions**

In `packages/luma-color-runtime/src/glsl.test.ts`, import `LUMA_COLOR_BALANCE_GLSL` and add:

```ts
it('exports relative color balance GLSL helper for preview parity', () => {
  expect(LUMA_COLOR_BALANCE_GLSL).toContain('applyUserColorBalance')
  expect(LUMA_COLOR_BALANCE_GLSL).toContain('vec3 gain')
  expect(LUMA_COLOR_BALANCE_GLSL).toContain('return color * gain')
})
```

- [ ] **Step 2: Run package GLSL test to confirm failure**

Run:

```bash
pnpm --filter @lumaforge/luma-color-runtime exec vitest run src/glsl.test.ts
```

Expected: FAIL because `LUMA_COLOR_BALANCE_GLSL` is not exported.

- [ ] **Step 3: Export GLSL helper**

In `packages/luma-color-runtime/src/glsl.ts`, add:

```ts
export const LUMA_COLOR_BALANCE_GLSL = /* glsl */ `
vec3 applyUserColorBalance(vec3 color, vec3 gain) {
  return color * gain;
}
`
```

- [ ] **Step 4: Verify package GLSL test passes**

Run:

```bash
pnpm --filter @lumaforge/luma-color-runtime exec vitest run src/glsl.test.ts
```

Expected: PASS.

- [ ] **Step 5: Update shader tests first**

In `src/lib/gl/shaders.test.ts`, add assertions that the fragment shader contains:

```ts
expect(shader).toContain('uniform vec3 u_userColorBalanceGain')
expect(shader).toContain('applyUserColorBalance(')
expect(shader.indexOf('u_rawRenderExposureMultiplier')).toBeLessThan(
  shader.indexOf('applyUserColorBalance'),
)
expect(shader.indexOf('applyUserColorBalance')).toBeLessThan(
  shader.indexOf('applyUserTone'),
)
```

- [ ] **Step 6: Run shader test to confirm failure**

Run:

```bash
pnpm run test:app src/lib/gl/shaders.test.ts
```

Expected: FAIL because the uniform and helper are absent.

- [ ] **Step 7: Add color balance to the shader**

In `src/lib/gl/shaders.ts`, import the helper:

```ts
  LUMA_COLOR_BALANCE_GLSL,
```

Add the uniform beside existing tone uniforms:

```glsl
uniform vec3 u_userColorBalanceGain;
```

Add the helper snippet before tone:

```glsl
${LUMA_COLOR_BALANCE_GLSL}
${LUMA_COLOR_TONE_GLSL}
```

Change the main path to:

```glsl
  vec3 technicalBaseSceneLinearProPhoto =
    readInputSceneLinearProPhoto(v_texCoord) * u_rawRenderExposureMultiplier;
  vec3 colorBalancedSceneLinearProPhoto = applyUserColorBalance(
    technicalBaseSceneLinearProPhoto,
    u_userColorBalanceGain
  );
  vec3 editedBaseSceneLinearProPhoto = applyUserTone(
    colorBalancedSceneLinearProPhoto,
    u_userExposureMultiplier,
    u_userContrastAmount,
    u_userContrastFactor,
    u_userHighlights,
    u_userShadows,
    u_userWhites,
    u_userBlacks
  );
```

Keep `technicalBaseDisplayColor` derived from `technicalBaseSceneLinearProPhoto` so Original and the compare left side stay unedited.

- [ ] **Step 8: Verify shader test passes**

Run:

```bash
pnpm run test:app src/lib/gl/shaders.test.ts
```

Expected: PASS.

- [ ] **Step 9: Update pipeline tests first**

In `src/lib/gl/pipeline.test.ts`, extend the tone-uniform test params:

```ts
userTemperature: 50,
userTint: -25,
```

Assert uniform lookup:

```ts
expect(contextMock.gl.getUniformLocation).toHaveBeenCalledWith(
  expect.anything(),
  'u_userColorBalanceGain',
)
```

Assert upload:

```ts
expect(contextMock.gl.uniform3f).toHaveBeenCalledWith(
  'u_userColorBalanceGain',
  expect.any(Number),
  expect.any(Number),
  expect.any(Number),
)
```

- [ ] **Step 10: Run pipeline test to confirm failure**

Run:

```bash
pnpm run test:app src/lib/gl/pipeline.test.ts
```

Expected: FAIL because the pipeline does not request or set `u_userColorBalanceGain`.

- [ ] **Step 11: Thread color gain through pipeline**

In `src/lib/gl/pipeline.ts`, import:

```ts
  resolveColorBalanceParams,
```

Add defaults where `DEFAULT_PROCESSING_PARAMS` are defined:

```ts
  userTemperature: 0,
  userTint: 0,
```

Add the process uniform location:

```ts
      u_userColorBalanceGain: gl.getUniformLocation(
        program,
        'u_userColorBalanceGain',
      ),
```

Pass color params into every `resolveExportColorGraph` call:

```ts
      userTemperature: this.params.userTemperature,
      userTint: this.params.userTint,
```

Resolve and upload color balance before tone uniforms:

```ts
    const colorBalance = resolveColorBalanceParams({
      userTemperature: params.userTemperature,
      userTint: params.userTint,
    })
    gl.uniform3f(
      processUniforms.u_userColorBalanceGain,
      colorBalance.gain[0],
      colorBalance.gain[1],
      colorBalance.gain[2],
    )
```

- [ ] **Step 12: Include color params in preview canvas memo**

In `src/modules/raw-processor/components/PreviewCanvas.tsx`, add:

```ts
        userTemperature: params.userTemperature,
        userTint: params.userTint,
```

to `processedCanvasParams`, and add dependencies:

```ts
      params.userTemperature,
      params.userTint,
```

- [ ] **Step 13: Update export pipeline fixture params**

In `src/lib/gl/pipeline-export.test.ts`, add `userTemperature: 0` and `userTint: 0` to every inline `ProcessingParams` object that currently lists tone fields.

- [ ] **Step 14: Verify WebGL-focused tests**

Run:

```bash
pnpm run test:app src/lib/gl/shaders.test.ts src/lib/gl/pipeline.test.ts src/lib/gl/pipeline-export.test.ts src/modules/raw-processor/components/PreviewCanvas.test.ts
```

Expected: PASS.

- [ ] **Step 15: Commit**

```bash
git add packages/luma-color-runtime/src/glsl.ts packages/luma-color-runtime/src/glsl.test.ts src/lib/gl/shaders.ts src/lib/gl/shaders.test.ts src/lib/gl/pipeline.ts src/lib/gl/pipeline.test.ts src/lib/gl/pipeline-export.test.ts src/modules/raw-processor/components/PreviewCanvas.tsx
git commit -m "feat(raw-preview): apply color balance in WebGL preview"
```

---

## Task 4: App Params, Export Invalidation, Histogram, CPU Preview

**Files:**
- Modify: `src/atoms/raw-processor.ts`
- Modify: `src/modules/raw-processor/services/params/orchestrate-params-update.ts`
- Modify: `src/modules/raw-processor/services/export-state.ts`
- Modify: `src/modules/raw-processor/services/export-state.test.ts`
- Modify: `src/modules/raw-processor/hooks/useRawProcessor.ts`
- Modify: `src/modules/raw-processor/hooks/useRawProcessor.test.tsx`
- Modify: `src/modules/raw-processor/hooks/usePreviewHistogram.ts`
- Modify: `src/modules/raw-processor/hooks/usePreviewHistogram.test.tsx`
- Modify: `src/modules/raw-processor/hooks/useCpuPreview.ts`
- Modify: `src/modules/raw-processor/hooks/useCpuPreview.test.ts`
- Modify: `src/modules/raw-processor/services/export/orchestrate-full-res-export.ts`
- Modify: `src/modules/raw-processor/__tests__/raw-processor-view-file-facts.test.tsx`
- Modify: `src/modules/raw-processor/__tests__/workspace-ui.test.tsx`
- Modify: copied inline processing params in affected tests.

- [ ] **Step 1: Add defaults in tests first**

In tests that define a local processing params object, add:

```ts
userTemperature: 0,
userTint: 0,
```

Start with:

```bash
rg -n "userBlacks:" src/modules/raw-processor src/lib/gl -g '*.test.ts' -g '*.test.tsx'
```

Update only objects that satisfy `ProcessingParams` or mock the `useRawProcessor` return params.

- [ ] **Step 2: Add export invalidation tests**

In `src/modules/raw-processor/services/export-state.test.ts`, add:

```ts
it('treats temperature and tint changes as render graph changes', () => {
  const current = makeProcessingParams()

  expect(
    changesRenderGraphParams(current, { userTemperature: 12 }),
  ).toBe(true)
  expect(changesRenderGraphParams(current, { userTint: -8 })).toBe(true)
})
```

If the file does not have `makeProcessingParams()`, create it in the test file:

```ts
function makeProcessingParams(): ProcessingParams {
  return {
    intensity: 0.7,
    viewMode: 'compare',
    compareSplit: 0.5,
    styleKind: 'none',
    builtinPreset: null,
    userExposureEv: 0,
    userContrast: 0,
    userHighlights: 0,
    userShadows: 0,
    userWhites: 0,
    userBlacks: 0,
    userTemperature: 0,
    userTint: 0,
  }
}
```

- [ ] **Step 3: Run export-state test to confirm failure**

Run:

```bash
pnpm run test:app src/modules/raw-processor/services/export-state.test.ts
```

Expected: FAIL because `changesRenderGraphParams` ignores color params.

- [ ] **Step 4: Add app defaults and invalidation fields**

In `src/atoms/raw-processor.ts`, add defaults:

```ts
  userTemperature: 0,
  userTint: 0,
```

In `src/modules/raw-processor/services/export-state.ts`, add:

```ts
    (Object.hasOwn(next, 'userTemperature') &&
      next.userTemperature !== current.userTemperature) ||
    (Object.hasOwn(next, 'userTint') &&
      next.userTint !== current.userTint)
```

after the existing tone checks.

- [ ] **Step 5: Add color param compute helper**

In `src/modules/raw-processor/services/params/orchestrate-params-update.ts`, import:

```ts
import { normalizeColorBalanceParams, normalizeToneParams } from '@lumaforge/luma-color-runtime'
```

Add:

```ts
export function computeColorParams(
  prevParams: ProcessingParams,
  colorParams: Partial<Pick<ProcessingParams, 'userTemperature' | 'userTint'>>,
): { params: ProcessingParams; shouldClearExportResult: boolean } {
  const normalized = normalizeColorBalanceParams({
    userTemperature:
      colorParams.userTemperature ?? prevParams.userTemperature,
    userTint: colorParams.userTint ?? prevParams.userTint,
  })

  const shouldClearExportResult = changesRenderGraphParams(
    prevParams,
    normalized,
  )

  return {
    params: { ...prevParams, ...normalized },
    shouldClearExportResult,
  }
}
```

- [ ] **Step 6: Expose set/reset color from the hook**

In `src/modules/raw-processor/hooks/useRawProcessor.ts`, add to `UseRawProcessorReturn`:

```ts
  setColorParams: (
    params: Partial<Pick<ProcessingParams, 'userTemperature' | 'userTint'>>,
  ) => void
  resetColor: () => void
```

Import `computeColorParams`, then add:

```ts
  const setColorParams = useCallback(
    (
      colorParams: Partial<
        Pick<ProcessingParams, 'userTemperature' | 'userTint'>
      >,
    ) => {
      let shouldClearExportResult = false
      setParams((prev) => {
        const { params: nextParams, shouldClearExportResult: shouldClear } =
          computeColorParams(prev, colorParams)
        shouldClearExportResult = shouldClear
        return nextParams
      })

      if (shouldClearExportResult) {
        invalidateExportGraph()
      }
    },
    [invalidateExportGraph, setParams],
  )

  const resetColor = useCallback(() => {
    handleSetParams({
      userTemperature: 0,
      userTint: 0,
    })
  }, [handleSetParams])
```

Return both fields:

```ts
    setColorParams,
    resetColor,
```

- [ ] **Step 7: Add hook tests for scoped resets**

In `src/modules/raw-processor/hooks/useRawProcessor.test.tsx`, add:

```ts
it('updates and resets color params without resetting tone params', () => {
  const { result } = renderUseRawProcessor()

  act(() => {
    result.current.setToneParams({ userExposureEv: 1, userContrast: 25 })
    result.current.setColorParams({ userTemperature: 35, userTint: -10 })
  })

  expect(result.current.params).toMatchObject({
    userExposureEv: 1,
    userContrast: 25,
    userTemperature: 35,
    userTint: -10,
  })

  act(() => {
    result.current.resetColor()
  })

  expect(result.current.params).toMatchObject({
    userExposureEv: 1,
    userContrast: 25,
    userTemperature: 0,
    userTint: 0,
  })
})
```

Use the existing render helper name in the file. If it is named differently, adapt only the helper call, not the assertions.

- [ ] **Step 8: Thread color through histogram**

In `src/modules/raw-processor/hooks/usePreviewHistogram.ts`, include `params.userTemperature` and `params.userTint` in `toneKey`, in `resolveExportColorGraph`, in the destructured params, in `histogramParams`, and in the memo dependencies.

Graph input:

```ts
    userTemperature: params.userTemperature,
    userTint: params.userTint,
```

Memo params:

```ts
      userTemperature,
      userTint,
```

Dependencies:

```ts
      userTemperature,
      userTint,
```

- [ ] **Step 9: Add histogram recompute test**

In `src/modules/raw-processor/hooks/usePreviewHistogram.test.tsx`, add an assertion that changing only `userTemperature` transitions through a new compute job while keeping `compareSplit` irrelevant. Use the existing async helper style in the file and set:

```ts
rerender({
  params: { ...defaultParams, userTemperature: 25 },
})
```

Expected assertion:

```ts
expect(result.current.state).toBe('computing')
```

- [ ] **Step 10: Thread color through CPU preview**

In `src/modules/raw-processor/hooks/useCpuPreview.ts`, add fields to `CpuPreviewParams`:

```ts
  userTemperature: number
  userTint: number
```

In the neutral branch of `buildCpuPreviewGraph`, set:

```ts
          userTemperature: 0,
          userTint: 0,
```

Append both fields to `renderSig`:

```ts
|${params.userTemperature}|${params.userTint}
```

- [ ] **Step 11: Add CPU preview graph test**

In `src/modules/raw-processor/hooks/useCpuPreview.test.ts`, add:

```ts
it('passes color balance params to the processed CPU preview graph', () => {
  const graph = buildCpuPreviewGraph(
    {
      ...baseCpuPreviewParams,
      userTemperature: 40,
      userTint: -20,
    },
    'processed',
  )

  expect('unsupportedReason' in graph).toBe(false)
  if ('unsupportedReason' in graph) throw new Error('Expected graph')
  expect(graph.steps.find((step) => step.kind === 'user-color-balance')).toMatchObject({
    kind: 'user-color-balance',
    temperature: 40,
    tint: -20,
  })
})
```

Also assert neutral graph resets both fields to `0`.

- [ ] **Step 12: Thread color through full-resolution export**

In `src/modules/raw-processor/services/export/orchestrate-full-res-export.ts`, pass color fields into `resolveExportColorGraph`:

```ts
    userTemperature: ctx.atoms.params.userTemperature,
    userTint: ctx.atoms.params.userTint,
```

Add a separate snapshot object:

```ts
      color: {
        userTemperature: ctx.atoms.params.userTemperature,
        userTint: ctx.atoms.params.userTint,
      },
```

Do not add these fields to the existing `tone` snapshot object.

- [ ] **Step 13: Verify focused state/export/histogram tests**

Run:

```bash
pnpm run test:app src/modules/raw-processor/services/export-state.test.ts src/modules/raw-processor/hooks/useRawProcessor.test.tsx src/modules/raw-processor/hooks/usePreviewHistogram.test.tsx src/modules/raw-processor/hooks/useCpuPreview.test.ts src/modules/raw-processor/__tests__/raw-processor-view-file-facts.test.tsx src/modules/raw-processor/__tests__/workspace-ui.test.tsx
```

Expected: PASS.

- [ ] **Step 14: Commit**

```bash
git add src/atoms/raw-processor.ts src/modules/raw-processor/services/params/orchestrate-params-update.ts src/modules/raw-processor/services/export-state.ts src/modules/raw-processor/services/export-state.test.ts src/modules/raw-processor/hooks/useRawProcessor.ts src/modules/raw-processor/hooks/useRawProcessor.test.tsx src/modules/raw-processor/hooks/usePreviewHistogram.ts src/modules/raw-processor/hooks/usePreviewHistogram.test.tsx src/modules/raw-processor/hooks/useCpuPreview.ts src/modules/raw-processor/hooks/useCpuPreview.test.ts src/modules/raw-processor/services/export/orchestrate-full-res-export.ts src/modules/raw-processor/__tests__/raw-processor-view-file-facts.test.tsx src/modules/raw-processor/__tests__/workspace-ui.test.tsx src/modules/raw-processor/services/raw/orchestrate-raw-load.test.ts src/modules/raw-processor/services/export-evacuation.test.ts src/modules/raw-processor/services/original-reference-renderer.ts
git commit -m "feat(raw-processor): thread color balance through processing state"
```

---

## Task 5: Desktop Adjust UI

**Files:**
- Create: `src/modules/raw-processor/components/tools/ColorTool.tsx`
- Create: `src/modules/raw-processor/components/tools/AdjustTool.tsx`
- Modify: `src/modules/raw-processor/components/RawToolSurface.tsx`
- Modify: `src/modules/raw-processor/RawProcessorView.tsx`
- Modify: `src/modules/raw-processor/components/RawToolSurface.test.tsx`
- Modify: `src/modules/raw-processor/__tests__/workspace-ui.test.tsx`
- Modify: `src/locales/en.json`
- Modify: `src/locales/zh-CN.json`

- [ ] **Step 1: Add desktop UI tests first**

In `src/modules/raw-processor/components/RawToolSurface.test.tsx`, add tests that render the desktop surface with:

```ts
color={{
  userTemperature: 0,
  userTint: 0,
}}
onColorChange={vi.fn()}
onColorReset={vi.fn()}
```

Add assertions:

```ts
expect(screen.getByRole('heading', { name: /Adjust/i })).toBeInTheDocument()
expect(screen.getByRole('tab', { name: /Tone/i })).toBeInTheDocument()
expect(screen.getByRole('tab', { name: /Color/i })).toBeInTheDocument()
```

Then click Color and assert:

```ts
await user.click(screen.getByRole('tab', { name: /Color/i }))
expect(screen.getByText(/Temperature/i)).toBeInTheDocument()
expect(screen.getByText(/Tint/i)).toBeInTheDocument()
```

Add scoped reset assertions:

```ts
await user.click(screen.getByRole('button', { name: /Reset color/i }))
expect(onColorReset).toHaveBeenCalledTimes(1)
expect(onToneReset).not.toHaveBeenCalled()
```

- [ ] **Step 2: Run desktop UI test to confirm failure**

Run:

```bash
pnpm run test:app src/modules/raw-processor/components/RawToolSurface.test.tsx
```

Expected: FAIL because `RawToolSurface` has no color props and no Adjust card.

- [ ] **Step 3: Create the Color tool**

Create `src/modules/raw-processor/components/tools/ColorTool.tsx`:

```tsx
import { RotateCcw } from 'lucide-react'
import { useId } from 'react'
import { z } from 'zod'

import { Button } from '~/components/ui/button'
import { Slider } from '~/components/ui/slider'
import type { Translate } from '~/lib/i18n'
import { useI18n } from '~/lib/i18n'

export const ColorValueSchema = z.object({
  userTemperature: z.number().min(-100).max(100),
  userTint: z.number().min(-100).max(100),
})

export type ColorValue = z.infer<typeof ColorValueSchema>

const COLOR_DEFAULTS: ColorValue = {
  userTemperature: 0,
  userTint: 0,
}

const FIELDS: {
  key: keyof ColorValue
  labelKey: Parameters<Translate>[0]
  min: number
  max: number
  step: number
}[] = [
  {
    key: 'userTemperature',
    labelKey: 'raw.color.temperature',
    min: -100,
    max: 100,
    step: 1,
  },
  {
    key: 'userTint',
    labelKey: 'raw.color.tint',
    min: -100,
    max: 100,
    step: 1,
  },
]

function ColorField({
  field,
  label,
  value,
  disabled,
  onChange,
}: {
  field: (typeof FIELDS)[number]
  label: string
  value: ColorValue
  disabled: boolean
  onChange: (value: Partial<ColorValue>) => void
}) {
  const labelId = useId()
  const currentValue = value[field.key]
  const formatted = `${currentValue > 0 ? '+' : ''}${Math.round(currentValue)}`

  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between text-[0.8rem]">
        <label id={labelId} className="font-medium text-lf-on-surface/80">
          {label}
        </label>
        <output
          aria-hidden="true"
          className="tabular-nums font-medium text-lf-on-surface/80"
        >
          {formatted}
        </output>
      </div>
      <Slider
        thumbAriaLabelledBy={labelId}
        value={[currentValue]}
        min={field.min}
        max={field.max}
        step={field.step}
        disabled={disabled}
        onValueChange={([nextValue]) => onChange({ [field.key]: nextValue })}
      />
    </div>
  )
}

export function isColorNeutral(value: ColorValue): boolean {
  return Object.entries(value).every(
    ([key, val]) => val === COLOR_DEFAULTS[key as keyof ColorValue],
  )
}

export function ColorTool({
  value,
  disabled,
  onChange,
  onReset,
}: {
  value: ColorValue
  disabled: boolean
  onChange: (value: Partial<ColorValue>) => void
  onReset: () => void
}) {
  const { t } = useI18n()
  const neutral = isColorNeutral(value)

  return (
    <div className="grid gap-3">
      <div className="grid gap-3.5">
        {FIELDS.map((field) => (
          <ColorField
            key={field.key}
            field={field}
            label={t(field.labelKey)}
            value={value}
            disabled={disabled}
            onChange={onChange}
          />
        ))}
      </div>
      <p className="text-[0.78rem] leading-relaxed text-lf-on-surface/72">
        {t('raw.color.note')}
      </p>
      {!neutral && (
        <p className="text-[0.78rem] leading-relaxed text-lf-on-surface/72">
          {t('raw.color.preserved')}
        </p>
      )}
      <Button
        variant="light"
        size="sm"
        disabled={disabled || neutral}
        onClick={onReset}
        className="self-start [&_svg]:size-3.5"
      >
        <RotateCcw aria-hidden="true" />
        {t('raw.color.reset')}
      </Button>
    </div>
  )
}
```

- [ ] **Step 4: Create the Adjust wrapper**

Create `src/modules/raw-processor/components/tools/AdjustTool.tsx`:

```tsx
import { useState } from 'react'

import { SegmentGroup, SegmentItem } from '~/components/ui/segment'
import { cn } from '~/lib/cn'
import { useI18n } from '~/lib/i18n'

import type { ColorValue } from './ColorTool'
import { ColorTool } from './ColorTool'
import {
  SEGMENTED_FOCUS_RING,
  SEGMENTED_ITEM_TEXT,
  SEGMENTED_ITEM_TEXT_ACTIVE,
  SEGMENTED_THUMB_ACTIVE_VIA_PARENT,
  SEGMENTED_TRACK,
} from './segmented-chrome'
import type { ToneValue } from './ToneTool'
import { ToneTool } from './ToneTool'

type AdjustSubpanel = 'tone' | 'color'

const TRACK_CLASS = cn('h-9 w-full', SEGMENTED_TRACK)
const ITEM_CLASS = cn(
  'flex-1 text-[0.76rem]',
  SEGMENTED_ITEM_TEXT,
  SEGMENTED_ITEM_TEXT_ACTIVE,
  SEGMENTED_THUMB_ACTIVE_VIA_PARENT,
  SEGMENTED_FOCUS_RING,
)

function isAdjustSubpanel(value: string): value is AdjustSubpanel {
  return value === 'tone' || value === 'color'
}

export function AdjustTool({
  tone,
  color,
  disabled,
  onToneChange,
  onToneReset,
  onColorChange,
  onColorReset,
}: {
  tone: ToneValue
  color: ColorValue
  disabled: boolean
  onToneChange: (value: Partial<ToneValue>) => void
  onToneReset: () => void
  onColorChange: (value: Partial<ColorValue>) => void
  onColorReset: () => void
}) {
  const { t } = useI18n()
  const [subpanel, setSubpanel] = useState<AdjustSubpanel>('tone')

  return (
    <div className="grid gap-3">
      <SegmentGroup
        value={subpanel}
        onValueChanged={(value) => {
          if (isAdjustSubpanel(value)) setSubpanel(value)
        }}
        aria-label={t('raw.adjust.title')}
        disabled={disabled}
        className={TRACK_CLASS}
      >
        <SegmentItem
          value="tone"
          label={t('raw.adjust.tone')}
          className={ITEM_CLASS}
        />
        <SegmentItem
          value="color"
          label={t('raw.adjust.color')}
          className={ITEM_CLASS}
        />
      </SegmentGroup>
      {subpanel === 'tone' ? (
        <ToneTool
          value={tone}
          disabled={disabled}
          onChange={onToneChange}
          onReset={onToneReset}
        />
      ) : (
        <ColorTool
          value={color}
          disabled={disabled}
          onChange={onColorChange}
          onReset={onColorReset}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 5: Wire desktop RawToolSurface**

In `src/modules/raw-processor/components/RawToolSurface.tsx`:

Replace the `ToneTool` import with:

```ts
import { AdjustTool } from './tools/AdjustTool'
import type { ColorValue } from './tools/ColorTool'
import type { ToneValue } from './tools/ToneTool'
```

Add props:

```ts
  color: ColorValue
  onColorChange: (value: Partial<ColorValue>) => void
  onColorReset: () => void
```

Replace the Tone card:

```tsx
      <ToolCard id="adjust" title={t('raw.adjust.title')}>
        <AdjustTool
          tone={props.tone}
          color={props.color}
          disabled={editorDisabled}
          onToneChange={props.onToneChange}
          onToneReset={props.onToneReset}
          onColorChange={props.onColorChange}
          onColorReset={props.onColorReset}
        />
      </ToolCard>
```

In `moreSheet.pipelineSteps`, change the tone label:

```ts
      { index: 2, label: t('raw.adjust.title'), timing: '—' },
```

- [ ] **Step 6: Wire RawProcessorView**

In `src/modules/raw-processor/RawProcessorView.tsx`, destructure:

```ts
    setColorParams,
    resetColor,
```

Create color props near the existing tone object:

```ts
  const color = {
    userTemperature: params.userTemperature,
    userTint: params.userTint,
  }
```

Pass to `RawToolSurface`:

```tsx
          color={color}
          onColorChange={setColorParams}
          onColorReset={resetColor}
```

- [ ] **Step 7: Add locale keys**

In `src/locales/en.json`, add:

```json
"raw.adjust.title": "Adjust",
"raw.adjust.tone": "Tone",
"raw.adjust.color": "Color",
"raw.color.temperature": "Temperature",
"raw.color.tint": "Tint",
"raw.color.note": "Relative color balance. Applies before tone, LUT conversion, and full-resolution export.",
"raw.color.preserved": "Color settings preserved",
"raw.color.reset": "Reset color"
```

In `src/locales/zh-CN.json`, add:

```json
"raw.adjust.title": "调整",
"raw.adjust.tone": "影调",
"raw.adjust.color": "色彩",
"raw.color.temperature": "色温",
"raw.color.tint": "色调偏移",
"raw.color.note": "相对色彩平衡。会先于影调、LUT 转换和全分辨率导出应用。",
"raw.color.preserved": "色彩设置已保留",
"raw.color.reset": "重置色彩"
```

Place these keys next to the existing `raw.tone.*` keys and keep valid JSON commas.

- [ ] **Step 8: Update workspace mocks**

In `src/modules/raw-processor/__tests__/workspace-ui.test.tsx`, every `RawToolSurface` props helper gets:

```ts
    color: {
      userTemperature: 0,
      userTint: 0,
    },
    onColorChange: vi.fn(),
    onColorReset: vi.fn(),
```

Update text expectations from Tone card to Adjust card where they target the desktop tool title.

- [ ] **Step 9: Verify desktop UI tests**

Run:

```bash
pnpm run test:app src/modules/raw-processor/components/RawToolSurface.test.tsx src/modules/raw-processor/__tests__/workspace-ui.test.tsx src/__tests__/i18n-locales.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/modules/raw-processor/components/tools/ColorTool.tsx src/modules/raw-processor/components/tools/AdjustTool.tsx src/modules/raw-processor/components/RawToolSurface.tsx src/modules/raw-processor/RawProcessorView.tsx src/modules/raw-processor/components/RawToolSurface.test.tsx src/modules/raw-processor/__tests__/workspace-ui.test.tsx src/locales/en.json src/locales/zh-CN.json
git commit -m "feat(raw-processor): add desktop Adjust color controls"
```

---

## Task 6: Mobile Adjust UI

**Files:**
- Create: `src/modules/raw-processor/components/mobile/color-fields.ts`
- Create: `src/modules/raw-processor/components/mobile/color-fields.test.ts`
- Create: `src/modules/raw-processor/components/mobile/ColorStripPanel.tsx`
- Create: `src/modules/raw-processor/components/mobile/ColorStripPanel.test.tsx`
- Create: `src/modules/raw-processor/components/mobile/ColorFocusEditor.tsx`
- Create: `src/modules/raw-processor/components/mobile/ColorFocusEditor.test.tsx`
- Create: `src/modules/raw-processor/components/mobile/AdjustStripPanel.tsx`
- Create: `src/modules/raw-processor/components/mobile/AdjustStripPanel.test.tsx`
- Modify: `src/modules/raw-processor/components/mobile/MobileModeDock.tsx`
- Modify: `src/modules/raw-processor/components/mobile/MobileModeDock.test.tsx`
- Modify: `src/modules/raw-processor/components/mobile/MobileLabChrome.tsx`
- Modify: `src/modules/raw-processor/components/mobile/MobileLabChrome.test.tsx`
- Modify: `src/modules/raw-processor/components/mobile/tone-fields.test.ts`
- Modify: `src/modules/raw-processor/components/RawToolSurface.tsx`
- Modify: `src/locales/en.json`
- Modify: `src/locales/zh-CN.json`

- [ ] **Step 1: Add mobile field tests first**

Create `src/modules/raw-processor/components/mobile/color-fields.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import {
  COLOR_NEUTRAL,
  formatColorValue,
  formatColorValueShort,
  isColorNeutral,
  MOBILE_COLOR_FIELDS,
} from './color-fields'

describe('mobile color fields', () => {
  it('contains only relative color fields', () => {
    expect(MOBILE_COLOR_FIELDS.map((field) => field.key)).toEqual([
      'userTemperature',
      'userTint',
    ])
  })

  it('formats signed integer color values', () => {
    expect(formatColorValueShort('userTemperature', 20)).toBe('+20')
    expect(formatColorValueShort('userTint', -8)).toBe('-8')
    expect(formatColorValue('userTint', 0)).toBe('0')
  })

  it('detects neutral color values', () => {
    expect(isColorNeutral(COLOR_NEUTRAL)).toBe(true)
    expect(isColorNeutral({ ...COLOR_NEUTRAL, userTint: 1 })).toBe(false)
  })
})
```

In `src/modules/raw-processor/components/mobile/tone-fields.test.ts`, add:

```ts
expect(MOBILE_TONE_FIELDS.map((field) => field.key)).not.toContain(
  'userTemperature',
)
expect(MOBILE_TONE_FIELDS.map((field) => field.key)).not.toContain('userTint')
```

- [ ] **Step 2: Run mobile field tests to confirm failure**

Run:

```bash
pnpm run test:app src/modules/raw-processor/components/mobile/color-fields.test.ts src/modules/raw-processor/components/mobile/tone-fields.test.ts
```

Expected: FAIL because `color-fields.ts` does not exist.

- [ ] **Step 3: Create mobile color metadata**

Create `src/modules/raw-processor/components/mobile/color-fields.ts`:

```ts
import type { Translate } from '~/lib/i18n'

import type { ColorValue } from '../tools/ColorTool'

export type MobileColorField = {
  key: keyof ColorValue
  labelKey: Parameters<Translate>[0]
  short: string
  min: number
  max: number
  step: number
  unit: string
}

export const MOBILE_COLOR_FIELDS: MobileColorField[] = [
  {
    key: 'userTemperature',
    labelKey: 'raw.color.temperature',
    short: 'TEMP',
    min: -100,
    max: 100,
    step: 1,
    unit: '',
  },
  {
    key: 'userTint',
    labelKey: 'raw.color.tint',
    short: 'TINT',
    min: -100,
    max: 100,
    step: 1,
    unit: '',
  },
]

const sign = (value: number) => (value > 0 ? '+' : '')

export function formatColorValueShort(
  _key: keyof ColorValue,
  value: number,
): string {
  return `${sign(value)}${Math.round(value)}`
}

export function formatColorValue(key: keyof ColorValue, value: number): string {
  return formatColorValueShort(key, value)
}

export const COLOR_NEUTRAL: ColorValue = {
  userTemperature: 0,
  userTint: 0,
}

export function isColorNeutral(value: ColorValue): boolean {
  return MOBILE_COLOR_FIELDS.every((field) => value[field.key] === 0)
}
```

- [ ] **Step 4: Verify mobile field tests pass**

Run:

```bash
pnpm run test:app src/modules/raw-processor/components/mobile/color-fields.test.ts src/modules/raw-processor/components/mobile/tone-fields.test.ts
```

Expected: PASS.

- [ ] **Step 5: Add ColorStripPanel**

Create `src/modules/raw-processor/components/mobile/ColorStripPanel.tsx` by following the existing `ToneStripPanel` structure but using color types and keys:

```tsx
import { RotateCcw } from 'lucide-react'
import { m } from 'motion/react'

import { clsxm } from '~/lib/cn'
import { useI18n } from '~/lib/i18n'

import { TAP_SPRING } from '../../motion'
import type { ColorValue } from '../tools/ColorTool'
import {
  formatColorValueShort,
  isColorNeutral,
  MOBILE_COLOR_FIELDS,
} from './color-fields'

export function ColorStripPanel(props: {
  color: ColorValue
  focusKey: keyof ColorValue | null
  onPickField: (key: keyof ColorValue) => void
  onReset: () => void
}) {
  const { t } = useI18n()
  const neutral = isColorNeutral(props.color)
  return (
    <div>
      <div className="flex items-center justify-between gap-3 px-0.5 pb-1.5 text-[0.68rem] text-lf-on-photo-ink/68">
        <span>{t('raw.mobile.adjustStrip.hint')}</span>
        <button
          type="button"
          onClick={props.onReset}
          disabled={neutral}
          aria-label={t('raw.color.reset')}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lf-pill border border-lf-on-photo-bord-soft px-2.5 py-1 text-[0.66rem] font-semibold text-lf-on-photo-ink/82 transition-colors hover:border-lf-amber/55 hover:text-lf-amber-soft disabled:cursor-not-allowed disabled:opacity-40"
        >
          <RotateCcw aria-hidden="true" className="size-3" />
          {t('raw.color.reset')}
        </button>
      </div>
      <div
        role="tablist"
        aria-label={t('raw.mobile.colorStrip.aria')}
        className="flex gap-1.5 overflow-x-auto px-0.5 py-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {MOBILE_COLOR_FIELDS.map((field) => {
          const value = props.color[field.key]
          const dirty = value !== 0
          const active = props.focusKey === field.key
          return (
            <m.button
              key={field.key}
              type="button"
              role="tab"
              aria-selected={active}
              whileTap={{ scale: 0.96 }}
              transition={TAP_SPRING}
              onClick={() => props.onPickField(field.key)}
              className={clsxm(
                'grid min-h-[60px] min-w-[84px] shrink-0 grid-rows-[auto_auto] items-center gap-1 rounded-md border px-2.5 py-2 text-lf-on-photo-ink transition-colors',
                active
                  ? 'border-lf-amber bg-lf-on-photo-bg-strong'
                  : dirty
                    ? 'border-lf-amber/45 bg-lf-on-photo-bg'
                    : 'border-lf-on-photo-bord-soft bg-lf-on-photo-bg hover:border-lf-on-photo-bord',
              )}
            >
              <span
                className={clsxm(
                  'text-[0.62rem] font-semibold uppercase tracking-wide',
                  active || dirty
                    ? 'text-lf-amber-soft'
                    : 'text-lf-on-photo-ink/72',
                )}
              >
                {field.short}
              </span>
              <m.span
                key={formatColorValueShort(field.key, value)}
                initial={{ opacity: 0.55, y: 2 }}
                animate={{ opacity: 1, y: 0 }}
                transition={TAP_SPRING}
                className="text-base font-semibold leading-none tabular-nums"
              >
                {formatColorValueShort(field.key, value)}
              </m.span>
            </m.button>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Add ColorFocusEditor**

Create `src/modules/raw-processor/components/mobile/ColorFocusEditor.tsx` from `ToneFocusEditor.tsx`, replacing:
- `ToneValue` with `ColorValue`
- `MOBILE_TONE_FIELDS` with `MOBILE_COLOR_FIELDS`
- `formatToneValue` with `formatColorValue`
- `formatToneValueShort` with `formatColorValueShort`
- `raw.mobile.focus.siblingsAria` with `raw.mobile.focus.colorSiblingsAria`
- `data-tone-focus` with `data-color-focus`

The value-change call remains:

```tsx
onValueChange={([nextValue]) => props.onChange({ [field.key]: nextValue })}
```

- [ ] **Step 7: Add AdjustStripPanel**

Create `src/modules/raw-processor/components/mobile/AdjustStripPanel.tsx`:

```tsx
import { useState } from 'react'

import { SegmentGroup, SegmentItem } from '~/components/ui/segment'
import { cn } from '~/lib/cn'
import { useI18n } from '~/lib/i18n'

import type { ColorValue } from '../tools/ColorTool'
import type { ToneValue } from '../tools/ToneTool'
import { ColorStripPanel } from './ColorStripPanel'
import { ToneStripPanel } from './ToneStripPanel'

type AdjustSubpanel = 'tone' | 'color'

function isAdjustSubpanel(value: string): value is AdjustSubpanel {
  return value === 'tone' || value === 'color'
}

export function AdjustStripPanel(props: {
  tone: ToneValue
  color: ColorValue
  toneFocusKey: keyof ToneValue | null
  colorFocusKey: keyof ColorValue | null
  onPickToneField: (key: keyof ToneValue) => void
  onPickColorField: (key: keyof ColorValue) => void
  onToneReset: () => void
  onColorReset: () => void
}) {
  const { t } = useI18n()
  const [subpanel, setSubpanel] = useState<AdjustSubpanel>('tone')

  return (
    <div className="grid gap-2.5">
      <SegmentGroup
        value={subpanel}
        onValueChanged={(value) => {
          if (isAdjustSubpanel(value)) setSubpanel(value)
        }}
        aria-label={t('raw.adjust.title')}
        className={cn(
          'h-10 w-full rounded-md bg-[oklch(0.96_0.006_255/0.05)] p-1',
        )}
      >
        <SegmentItem
          value="tone"
          label={t('raw.adjust.tone')}
          className="flex-1 text-[0.76rem] font-medium text-lf-on-photo-ink/72 data-[state=active]:font-semibold data-[state=active]:text-lf-on-photo-ink"
        />
        <SegmentItem
          value="color"
          label={t('raw.adjust.color')}
          className="flex-1 text-[0.76rem] font-medium text-lf-on-photo-ink/72 data-[state=active]:font-semibold data-[state=active]:text-lf-on-photo-ink"
        />
      </SegmentGroup>
      {subpanel === 'tone' ? (
        <ToneStripPanel
          tone={props.tone}
          focusKey={props.toneFocusKey}
          onPickField={props.onPickToneField}
          onReset={props.onToneReset}
        />
      ) : (
        <ColorStripPanel
          color={props.color}
          focusKey={props.colorFocusKey}
          onPickField={props.onPickColorField}
          onReset={props.onColorReset}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 8: Change dock label without changing mode count**

In `src/modules/raw-processor/components/mobile/MobileModeDock.tsx`, keep:

```ts
export type MobileMode = 'look' | 'tone' | 'compare' | 'export'
```

Change only the label key for the `tone` tab:

```ts
{ id: 'tone', icon: SlidersHorizontal, labelKey: 'raw.mobile.mode.adjust' },
```

In locales add:

```json
"raw.mobile.mode.adjust": "Adjust",
"raw.mobile.adjustStrip.hint": "Choose tone or color, then drag a value live on the photo.",
"raw.mobile.colorStrip.aria": "Color parameters",
"raw.mobile.focus.colorSiblingsAria": "Other color parameters"
```

and in Chinese:

```json
"raw.mobile.mode.adjust": "调整",
"raw.mobile.adjustStrip.hint": "先选择影调或色彩，再拖动数值实时调整照片。",
"raw.mobile.colorStrip.aria": "色彩参数",
"raw.mobile.focus.colorSiblingsAria": "其他色彩参数"
```

- [ ] **Step 9: Wire MobileLabChrome**

In `src/modules/raw-processor/components/mobile/MobileLabChrome.tsx`, add props:

```ts
  color: ColorValue
  onColorChange: (patch: Partial<ColorValue>) => void
  onColorReset: () => void
```

Replace the single `focusKey` with:

```ts
  const [toneFocusKey, setToneFocusKey] = useState<keyof ToneValue | null>(null)
  const [colorFocusKey, setColorFocusKey] = useState<keyof ColorValue | null>(
    null,
  )
```

Keep separate snapshots:

```ts
  const toneSnapshot = useRef<ToneValue | null>(null)
  const colorSnapshot = useRef<ColorValue | null>(null)
```

Render `AdjustStripPanel` for `mode === 'tone'`:

```tsx
      <AdjustStripPanel
        tone={props.tone}
        color={props.color}
        toneFocusKey={toneFocusKey}
        colorFocusKey={colorFocusKey}
        onPickToneField={startToneFocus}
        onPickColorField={startColorFocus}
        onToneReset={props.onToneReset}
        onColorReset={props.onColorReset}
      />
```

Render `ToneFocusEditor` when `toneFocusKey` is set, and render `ColorFocusEditor` when `colorFocusKey` is set. On entering one focus type, clear the other focus key:

```ts
  const startToneFocus = (key: keyof ToneValue) => {
    colorFocusKey && setColorFocusKey(null)
    toneSnapshot.current = props.tone
    setToneFocusKey(key)
  }

  const startColorFocus = (key: keyof ColorValue) => {
    toneFocusKey && setToneFocusKey(null)
    colorSnapshot.current = props.color
    setColorFocusKey(key)
  }
```

- [ ] **Step 10: Pass color props from RawToolSurface to mobile**

In `src/modules/raw-processor/components/RawToolSurface.tsx`, add to `MobileLabChrome`:

```tsx
          color={props.color}
          onColorChange={props.onColorChange}
          onColorReset={props.onColorReset}
```

- [ ] **Step 11: Add mobile tests**

In `src/modules/raw-processor/components/mobile/MobileModeDock.test.tsx`, assert four tabs and Adjust label:

```ts
expect(screen.getAllByRole('tab')).toHaveLength(4)
expect(screen.getByRole('tab', { name: /Adjust/i })).toBeInTheDocument()
```

In `src/modules/raw-processor/components/mobile/MobileLabChrome.test.tsx`, render with color props:

```tsx
color={{ userTemperature: 0, userTint: 0 }}
onColorChange={vi.fn()}
onColorReset={vi.fn()}
```

Open Adjust, switch to Color, and assert Temperature/Tint are visible. Assert Look, Adjust, Compare, Export remain the only dock labels.

- [ ] **Step 12: Verify mobile focused tests**

Run:

```bash
pnpm run test:app src/modules/raw-processor/components/mobile/color-fields.test.ts src/modules/raw-processor/components/mobile/ColorStripPanel.test.tsx src/modules/raw-processor/components/mobile/ColorFocusEditor.test.tsx src/modules/raw-processor/components/mobile/AdjustStripPanel.test.tsx src/modules/raw-processor/components/mobile/MobileModeDock.test.tsx src/modules/raw-processor/components/mobile/MobileLabChrome.test.tsx src/modules/raw-processor/components/mobile/tone-fields.test.ts src/modules/raw-processor/components/mobile/ToneStripPanel.test.tsx src/modules/raw-processor/components/mobile/ToneFocusEditor.test.tsx src/__tests__/i18n-locales.test.ts
```

Expected: PASS.

- [ ] **Step 13: Commit**

```bash
git add src/modules/raw-processor/components/mobile/color-fields.ts src/modules/raw-processor/components/mobile/color-fields.test.ts src/modules/raw-processor/components/mobile/ColorStripPanel.tsx src/modules/raw-processor/components/mobile/ColorStripPanel.test.tsx src/modules/raw-processor/components/mobile/ColorFocusEditor.tsx src/modules/raw-processor/components/mobile/ColorFocusEditor.test.tsx src/modules/raw-processor/components/mobile/AdjustStripPanel.tsx src/modules/raw-processor/components/mobile/AdjustStripPanel.test.tsx src/modules/raw-processor/components/mobile/MobileModeDock.tsx src/modules/raw-processor/components/mobile/MobileModeDock.test.tsx src/modules/raw-processor/components/mobile/MobileLabChrome.tsx src/modules/raw-processor/components/mobile/MobileLabChrome.test.tsx src/modules/raw-processor/components/mobile/tone-fields.test.ts src/modules/raw-processor/components/RawToolSurface.tsx src/locales/en.json src/locales/zh-CN.json
git commit -m "feat(raw-processor): add mobile Adjust color controls"
```

---

## Task 7: Focused Verification and Review

**Files:**
- Review all files changed in Tasks 1-6.
- No new production files in this task.

- [ ] **Step 1: Run runtime package verification**

Run:

```bash
pnpm --filter @lumaforge/luma-color-runtime exec vitest run src/color-balance.test.ts src/color-graph.test.ts src/row-band-processor.test.ts src/glsl.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run runtime package typecheck**

Run:

```bash
pnpm --filter @lumaforge/luma-color-runtime typecheck
```

Expected: PASS.

- [ ] **Step 3: Run app focused tests**

Run:

```bash
pnpm run test:app src/lib/gl/shaders.test.ts src/lib/gl/pipeline.test.ts src/lib/gl/pipeline-export.test.ts src/modules/raw-processor/services/export-state.test.ts src/modules/raw-processor/hooks/usePreviewHistogram.test.tsx src/modules/raw-processor/hooks/useCpuPreview.test.ts src/modules/raw-processor/hooks/useRawProcessor.test.tsx src/modules/raw-processor/components/PreviewCanvas.test.ts src/modules/raw-processor/components/RawToolSurface.test.tsx src/modules/raw-processor/components/mobile/color-fields.test.ts src/modules/raw-processor/components/mobile/ColorStripPanel.test.tsx src/modules/raw-processor/components/mobile/ColorFocusEditor.test.tsx src/modules/raw-processor/components/mobile/AdjustStripPanel.test.tsx src/modules/raw-processor/components/mobile/MobileLabChrome.test.tsx src/modules/raw-processor/components/mobile/MobileModeDock.test.tsx src/modules/raw-processor/components/mobile/tone-fields.test.ts src/modules/raw-processor/components/mobile/ToneStripPanel.test.tsx src/modules/raw-processor/components/mobile/ToneFocusEditor.test.tsx src/modules/raw-processor/__tests__/workspace-ui.test.tsx src/modules/raw-processor/__tests__/raw-processor-view-file-facts.test.tsx src/__tests__/i18n-locales.test.ts
```

Expected: PASS.

- [ ] **Step 4: Check formatting on changed files**

Run:

```bash
pnpm exec prettier --check packages/luma-color-runtime/src/color-balance.ts packages/luma-color-runtime/src/color-balance.test.ts packages/luma-color-runtime/src/types.ts packages/luma-color-runtime/src/color-graph.ts packages/luma-color-runtime/src/color-graph.test.ts packages/luma-color-runtime/src/row-band-processor.ts packages/luma-color-runtime/src/row-band-processor.test.ts packages/luma-color-runtime/src/glsl.ts packages/luma-color-runtime/src/glsl.test.ts src/lib/gl/shaders.ts src/lib/gl/shaders.test.ts src/lib/gl/pipeline.ts src/lib/gl/pipeline.test.ts src/lib/gl/pipeline-export.test.ts src/atoms/raw-processor.ts src/modules/raw-processor/services/params/orchestrate-params-update.ts src/modules/raw-processor/services/export-state.ts src/modules/raw-processor/services/export-state.test.ts src/modules/raw-processor/hooks/useRawProcessor.ts src/modules/raw-processor/hooks/useRawProcessor.test.tsx src/modules/raw-processor/hooks/usePreviewHistogram.ts src/modules/raw-processor/hooks/usePreviewHistogram.test.tsx src/modules/raw-processor/hooks/useCpuPreview.ts src/modules/raw-processor/hooks/useCpuPreview.test.ts src/modules/raw-processor/services/export/orchestrate-full-res-export.ts src/modules/raw-processor/components/PreviewCanvas.tsx src/modules/raw-processor/components/tools/ColorTool.tsx src/modules/raw-processor/components/tools/AdjustTool.tsx src/modules/raw-processor/components/RawToolSurface.tsx src/modules/raw-processor/components/RawToolSurface.test.tsx src/modules/raw-processor/RawProcessorView.tsx src/modules/raw-processor/components/mobile/color-fields.ts src/modules/raw-processor/components/mobile/color-fields.test.ts src/modules/raw-processor/components/mobile/ColorStripPanel.tsx src/modules/raw-processor/components/mobile/ColorStripPanel.test.tsx src/modules/raw-processor/components/mobile/ColorFocusEditor.tsx src/modules/raw-processor/components/mobile/ColorFocusEditor.test.tsx src/modules/raw-processor/components/mobile/AdjustStripPanel.tsx src/modules/raw-processor/components/mobile/AdjustStripPanel.test.tsx src/modules/raw-processor/components/mobile/MobileModeDock.tsx src/modules/raw-processor/components/mobile/MobileModeDock.test.tsx src/modules/raw-processor/components/mobile/MobileLabChrome.tsx src/modules/raw-processor/components/mobile/MobileLabChrome.test.tsx src/modules/raw-processor/components/mobile/tone-fields.test.ts src/locales/en.json src/locales/zh-CN.json
```

Expected: PASS.

- [ ] **Step 5: Review the diff against the spec**

Run:

```bash
git diff --stat HEAD~6..HEAD
git diff HEAD~6..HEAD -- packages/luma-color-runtime/src src/lib/gl src/atoms/raw-processor.ts src/modules/raw-processor src/locales
```

Review these invariants:
- `ToneValue`, `setToneParams`, and `resetTone` contain no `userTemperature` or `userTint`.
- `user-color-balance` is present after `raw-render-exposure` and before `user-exposure` for no-LUT and custom-LUT supported graphs.
- Original and compare-left preview paths use technical base after raw render exposure only.
- Export snapshot has separate `tone` and `color` objects.
- Mobile dock still has four modes.
- Reset tone does not reset color; reset color does not reset tone.

- [ ] **Step 6: Commit verification-only fixes if the review finds a defect**

If the review finds a defect, fix only that defect, rerun the focused command that exposed it, then commit:

```bash
git add <files changed by the defect fix>
git commit -m "fix(raw-processor): align color balance adjust parity"
```

If the review finds no defect, do not create an empty commit.
