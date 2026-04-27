# Phase 2 LUT Output Contract Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development or superpowers:executing-plans to
> implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking.

**Goal:** Correct Phase 2 LUT handling so LUT input preparation, LUT output
interpretation, and final Rec.709/sRGB export are independent, explicit, and
shared by preview and full-resolution export.

**Architecture:** Keep the existing scene-linear ProPhoto RAW handoff. Replace
automatic filename-driven LUT profile resolution with a generic LUT contract
resolver. The only authoritative sources are structured trusted metadata,
explicit user selection, and a persisted user-selected contract keyed by
content-only LUT identity. The content identity is only a persistence key; it is
not authority by itself.

**Tech Stack:** TypeScript, WebGL2 GLSL shaders, Vitest, LibRaw processed-window
export, LumaForge LUT parser/profile registry.

---

## Relationship to Prior Documents

This plan is a correction successor to
[`2026-04-24-phase2-scene-referred-lut-pipeline-implementation-path.md`](2026-04-24-phase2-scene-referred-lut-pipeline-implementation-path.md).

It supersedes the older plan wherever that plan:

- allows filename/title/free-form comment strings to resolve a color profile
  automatically,
- treats a built-in profile catalog as an automatic LUT decision table,
- infers a LUT output transfer from the LUT input transfer,
- treats `Panasonic V-Gamut / V-Log` as a complete LUT contract instead of only
  the LUT input half,
- allows full-resolution export before both input and output contracts are
  known.

The color-science spec must also carry these constraints because they are
pipeline invariants, not implementation preferences.

## Corrected Invariants

- Final LumaForge browser photo export remains Rec.709/sRGB.
- LUT input and LUT output are separate contracts.
- A V-Gamut/V-Log input contract never implies V-Gamut/V-Log output.
- A technical or combined LUT that outputs Rec.709/display-encoded values must
  not receive a second display gamma pass.
- A creative LUT whose output remains Log must declare that output; the graph
  then needs a Log-to-display conversion after the LUT, not a simple sRGB gamma
  pass.
- Filename, title, and free-form comments may produce UI hints only. They must
  not silently select the render/export contract.
- Content fingerprinting is allowed for cache keys and for reapplying a user's
  previous explicit choice. It must not create an implicit built-in decision.
- Preview and full-resolution export must evaluate the same resolved LUT
  contract.

## Generic Contract Model

The contract is the whole signal description around the LUT:

```ts
export type LUTContractConfidence = 'metadata' | 'user' | 'persisted-user'

export interface LUTColorProfile {
  id: string
  label: string
  role:
    | 'display-look'
    | 'scene-creative'
    | 'technical-output'
    | 'combined-look-output'
  inputGamut: ColorGamutId
  inputTransfer: TransferFunctionId
  inputRange: SignalRange
  outputGamut?: ColorGamutId
  outputTransfer?: TransferFunctionId
  outputRange?: SignalRange
  aliases: string[]
  source?: string
}
```

Resolution rules:

1. Structured metadata can resolve a full contract if it declares enough fields.
2. Explicit user selection can resolve a full contract.
3. A persisted user-selected contract can be reapplied by content-only
   fingerprint.
4. Everything else is `needs-user-selection` with optional suggestions.

Every resolved non-display custom LUT must carry output fields. A same-space
creative LUT expresses "output remains in the input scene/log space" by setting
`outputGamut`, `outputTransfer`, and `outputRange` equal to the input side, not
by omitting them. `technical-output` and `combined-look-output` profiles must
also declare `outputGamut`, `outputTransfer`, and `outputRange`.

## Structured Metadata Format

Support a small machine-readable namespace in `.cube` comments first. Additional
sidecar metadata can use the same field names later.

```text
# LUMAFORGE_INPUT_PROFILE=panasonic-vgamut-vlog
# LUMAFORGE_ROLE=combined-look-output
# LUMAFORGE_INPUT_GAMUT=v-gamut
# LUMAFORGE_INPUT_TRANSFER=v-log
# LUMAFORGE_INPUT_RANGE=full
# LUMAFORGE_OUTPUT_GAMUT=srgb-rec709
# LUMAFORGE_OUTPUT_TRANSFER=bt709
# LUMAFORGE_OUTPUT_RANGE=full
```

Rules:

- Keys are exact and structured; casual strings such as `VLog`, `Rec709`,
  `Input profile: V-Log`, or phrases in the LUT name are not authority.
- `LUMAFORGE_INPUT_PROFILE` may fill input fields from the registry, but output
  fields still come from explicit metadata or user selection.
- Unsupported output transfers must fail closed rather than falling back to
  input transfer.

## Files To Modify

- `src/lib/color/log-encoding.ts`
  Add a `bt709` transfer function distinct from `gamma24` and `srgb`.

- `src/lib/color/log-encoding.test.ts`
  Verify BT.709 encode/decode reference points and round trips.

- `src/lib/color/registry.ts`
  Add display output profile entries/helpers for Rec.709/BT.709 output
  contracts if the current registry lacks them.

- `src/lib/color/registry.test.ts`
  Verify registry lookup for Rec.709 BT.709 output.

- `src/lib/gl/pipeline.ts`
  Update `LUTProfileResolution` confidence, transfer uniforms, output-contract
  renderability, and remove output-from-input fallbacks.

- `src/lib/gl/shaders.ts`
  Add BT.709 transfer encode/decode branches.

- `src/lib/gl/shaders.test.ts`
  Verify shader constants and transfer branches.

- `src/lib/lut/cube-parser.ts`
  Compute content-only LUT identity, parse structured metadata, and keep
  filename/title/comments as display hints only.

- `src/lib/lut/profile-resolution.ts`
  Resolve contracts from structured metadata, explicit user selection, or
  persisted user-selected contracts only.

- `src/lib/lut/cube-parser.test.ts` and
  `src/lib/lut/profile-resolution.test.ts`
  Reject filename-only decisions and verify structured metadata plus persisted
  user selection behavior.

- `src/lib/export/color-graph.ts`
  Require output contracts for custom LUT export and decode declared display/log
  output before final sRGB encoding.

- `src/lib/export/color-graph.test.ts`
  Verify V-Log input plus Rec.709/BT.709 output graph and fail-closed behavior
  for missing output.

- `src/lib/export/full-res-export.ts`
  Keep final sRGB JPEG writing, but ensure technical/combined LUTs mix/write in
  the correct encoded or linear domain according to role.

- `src/lib/export/full-res-export.test.ts` and
  `src/lib/export/full-res-export.real.test.ts`
  Add generic regression coverage for declared input/output contracts.

- `src/modules/raw-processor/components/ControlsPanel.tsx`
  Show input and output contract state separately.

- `src/modules/raw-processor/services/style-system.ts`
  Update warning/copy logic for pending input/output contract selection.

- `src/modules/raw-processor/hooks/useRawProcessor.ts`
  Apply user-selected full LUT contracts instead of input-only profiles.

- `src/modules/raw-processor/__tests__/workspace-ui.test.tsx`,
  `src/modules/raw-processor/__tests__/style-system.test.ts`, and
  `src/modules/raw-processor/hooks/useRawProcessor.test.tsx`
  Update UI and hook expectations.

---

## Task 1: Add BT.709 Transfer Support

**Files:**

- Modify: `src/lib/color/log-encoding.ts`
- Modify: `src/lib/color/log-encoding.test.ts`
- Modify: `src/lib/gl/pipeline.ts`
- Modify: `src/lib/gl/shaders.ts`
- Modify: `src/lib/gl/shaders.test.ts`

- [ ] **Step 1: Write failing transfer tests**

Add to `src/lib/color/log-encoding.test.ts`:

```ts
import { bt709Decode, bt709Encode } from './log-encoding'

it('encodes and decodes BT.709 display transfer separately from sRGB and gamma 2.4', () => {
  expect(bt709Encode(0)).toBe(0)
  expect(bt709Encode(0.018)).toBeCloseTo(0.081, 6)
  expect(bt709Decode(0.081)).toBeCloseTo(0.018, 6)
  expect(bt709Decode(bt709Encode(0.18))).toBeCloseTo(0.18, 6)
  expect(bt709Encode(0.18)).not.toBeCloseTo(srgbEncode(0.18), 4)
  expect(bt709Encode(0.18)).not.toBeCloseTo(gamma24Encode(0.18), 4)
})
```

- [ ] **Step 2: Run the failing test**

```bash
pnpm test:run src/lib/color/log-encoding.test.ts --exclude '.worktrees/**'
```

Expected: FAIL because `bt709Encode` and `bt709Decode` are not exported.

- [ ] **Step 3: Implement BT.709**

Add `bt709` to `TransferFunctionId`, `TRANSFER_SOURCE_URLS`, and
`TRANSFER_FUNCTIONS`:

```ts
export function bt709Encode(linear: number): number {
  const clamped = Math.max(linear, 0)
  return clamped < 0.018
    ? 4.5 * clamped
    : 1.099 * Math.pow(clamped, 0.45) - 0.099
}

export function bt709Decode(encoded: number): number {
  const clamped = Math.max(encoded, 0)
  return clamped < 0.081
    ? clamped / 4.5
    : Math.pow((clamped + 0.099) / 1.099, 1 / 0.45)
}
```

- [ ] **Step 4: Add WebGL uniform and shader support**

Insert `bt709` immediately after `srgb` and shift later numeric constants:

```ts
export const LUT_TRANSFER_UNIFORMS: Record<TransferFunctionId, number> = {
  srgb: 0,
  bt709: 1,
  gamma24: 2,
  // keep the rest stable after renumbering
}
```

Add GLSL encode/decode branches for `TRANSFER_BT709`.

- [ ] **Step 5: Verify**

```bash
pnpm test:run src/lib/color/log-encoding.test.ts src/lib/gl/shaders.test.ts --exclude '.worktrees/**'
```

Expected: PASS.

---

## Task 2: Replace Automatic Filename Resolution With Generic Contracts

**Files:**

- Modify: `src/lib/gl/pipeline.ts`
- Modify: `src/lib/lut/cube-parser.ts`
- Modify: `src/lib/lut/profile-resolution.ts`
- Modify: `src/lib/lut/cube-parser.test.ts`
- Modify: `src/lib/lut/profile-resolution.test.ts`

- [ ] **Step 1: Write failing parser and resolver tests**

Filename/title/free-form comments must not resolve:

```ts
it('does not resolve LUT contracts from filename or free-form comments', () => {
  const lut = parseCubeLUT(
    makeCube({ comments: ['LUMIXPHOTOSTYLE VLOG'], title: 'Generated' }),
    { sourceName: 'technical-vlog-to-rec709.cube' },
  )

  expect(lut.profileResolution).toMatchObject({
    kind: 'needs-user-selection',
  })
  expect(lut.profileResolution).not.toMatchObject({
    kind: 'resolved',
  })
})
```

Structured metadata must resolve a full contract:

```ts
it('resolves structured metadata as a full input and output contract', () => {
  const lut = parseCubeLUT(
    makeCube({
      title: 'Trusted LUT',
      comments: [
        'LUMAFORGE_INPUT_PROFILE=panasonic-vgamut-vlog',
        'LUMAFORGE_ROLE=combined-look-output',
        'LUMAFORGE_OUTPUT_GAMUT=srgb-rec709',
        'LUMAFORGE_OUTPUT_TRANSFER=bt709',
        'LUMAFORGE_OUTPUT_RANGE=full',
      ],
    }),
    { sourceName: 'renamed-file.cube' },
  )

  expect(lut.profileResolution).toMatchObject({
    kind: 'resolved',
    confidence: 'metadata',
    profile: {
      inputGamut: 'v-gamut',
      inputTransfer: 'v-log',
      role: 'combined-look-output',
      outputGamut: 'srgb-rec709',
      outputTransfer: 'bt709',
      outputRange: 'full',
    },
  })
})
```

Persisted user selection must be explicit and content-keyed:

```ts
it('reapplies a persisted user-selected contract by content fingerprint', () => {
  const first = parseCubeLUT(makeCube(), { sourceName: 'first-name.cube' })

  applyLUTContractSelection(first, {
    role: 'combined-look-output',
    inputProfile: 'panasonic-vgamut-vlog',
    outputGamut: 'srgb-rec709',
    outputTransfer: 'bt709',
    outputRange: 'full',
  })

  const renamed = parseCubeLUT(makeCube(), { sourceName: 'renamed.cube' })

  expect(renamed.fingerprint).toBe(first.fingerprint)
  expect(renamed.profileResolution).toMatchObject({
    kind: 'resolved',
    confidence: 'persisted-user',
  })
})
```

- [ ] **Step 2: Run the failing tests**

```bash
pnpm test:run src/lib/lut/cube-parser.test.ts src/lib/lut/profile-resolution.test.ts --exclude '.worktrees/**'
```

Expected: FAIL because filename/free-form comment inference still resolves
profiles and content identity still includes `sourceName`.

- [ ] **Step 3: Make LUT identity content-only**

In `src/lib/lut/cube-parser.ts`, remove `sourceName` from stable identity:

```ts
const fingerprintSource = [
  input.title,
  input.size,
  input.domainMin.join(','),
  input.domainMax.join(','),
  input.comments.join('\n'),
  input.data.length,
  fullData,
].join('\u001F')
```

Keep `sourceName` on `ParsedLUT` for display only.

- [ ] **Step 4: Parse structured metadata**

In `src/lib/lut/profile-resolution.ts`, add an exact-key parser:

```ts
function readStructuredMetadata(comments: string[]) {
  const metadata = new Map<string, string>()
  for (const comment of comments) {
    const match = comment.match(/^LUMAFORGE_([A-Z_]+)\s*=\s*(.+)$/)
    if (match) metadata.set(match[1], match[2].trim())
  }
  return metadata
}
```

Use it before persisted user selection if the metadata declares a complete
contract. User overrides should still be possible through the selector and then
persist as a user-selected contract.

- [ ] **Step 5: Remove filename resolution as authority**

Change `LUTProfileResolution` confidence from:

```ts
confidence: 'explicit' | 'filename' | 'user'
```

to:

```ts
confidence: 'metadata' | 'user' | 'persisted-user'
```

Keep `inferLUTColorProfileHints(...)`, but use its result only for
`needs-user-selection.suggestions`. `resolveLUTProfile(...)` should only return
`kind: 'resolved'` for structured metadata, explicit user selection, or a
persisted user-selected contract.

- [ ] **Step 6: Store full user-selected contracts**

Replace input-profile-only storage with a full serializable contract:

```ts
export interface StoredLUTContractSelection {
  inputProfile?: string
  role: LUTColorProfile['role']
  inputGamut: ColorGamutId
  inputTransfer: TransferFunctionId
  inputRange: SignalRange
  outputGamut?: ColorGamutId
  outputTransfer?: TransferFunctionId
  outputRange?: SignalRange
}
```

Reject selections that do not satisfy role-specific output requirements.

- [ ] **Step 7: Verify**

```bash
pnpm test:run src/lib/lut/cube-parser.test.ts src/lib/lut/profile-resolution.test.ts --exclude '.worktrees/**'
```

Expected: PASS.

---

## Task 3: Require Explicit LUT Output Contracts In Preview And Export

**Files:**

- Modify: `src/lib/export/color-graph.ts`
- Modify: `src/lib/export/color-graph.test.ts`
- Modify: `src/lib/gl/pipeline.ts`
- Modify: `src/lib/gl/pipeline-profile.test.ts`
- Modify: `src/lib/gl/pipeline-export.test.ts`

- [ ] **Step 1: Write failing graph tests**

V-Log input plus Rec.709/BT.709 output should be a combined-output LUT:

```ts
it('routes V-Log input and BT.709 Rec.709 output as a combined output LUT', () => {
  const base = getLUTColorProfile('panasonic-vgamut-vlog')
  expect(base).toBeDefined()

  const graph = resolveExportColorGraph({
    styleKind: 'custom',
    intensity: 1,
    builtinPreset: null,
    lut: {
      size: 2,
      data: new Float32Array(24),
      domainMin: [0, 0, 0],
      domainMax: [1, 1, 1],
      inputProfile: 'v-log',
      profileResolution: {
        kind: 'resolved',
        confidence: 'metadata',
        profile: {
          ...base!,
          role: 'combined-look-output',
          outputGamut: 'srgb-rec709',
          outputTransfer: 'bt709',
          outputRange: 'full',
        },
      },
    },
  })

  expect(graph.supported).toBe(true)
  if (!graph.supported) throw new Error('Expected supported graph')
  expect(graph.steps).toContainEqual(
    expect.objectContaining({
      kind: 'lut-output-to-srgb',
      transfer: 'bt709',
      range: 'full',
      role: 'combined-look-output',
    }),
  )
})
```

Missing output must fail closed:

```ts
it('fails closed when a non-display LUT has no declared output contract', () => {
  const profile = getLUTColorProfile('panasonic-vgamut-vlog')
  expect(profile).toBeDefined()

  const graph = resolveExportColorGraph({
    styleKind: 'custom',
    intensity: 1,
    builtinPreset: null,
    lut: {
      size: 2,
      data: new Float32Array(24),
      domainMin: [0, 0, 0],
      domainMax: [1, 1, 1],
      inputProfile: 'v-log',
      profileResolution: {
        kind: 'resolved',
        confidence: 'user',
        profile: profile!,
      },
    },
  })

  expect(graph).toMatchObject({
    supported: false,
    reason: 'unsupported-pipeline',
    message: 'Choose a LUT output profile before full-resolution export.',
  })
})
```

- [ ] **Step 2: Run the failing tests**

```bash
pnpm test:run src/lib/export/color-graph.test.ts src/lib/gl/pipeline-profile.test.ts --exclude '.worktrees/**'
```

Expected: FAIL because current code still falls back from output to input
transfer in some cases.

- [ ] **Step 3: Remove output-from-input fallback**

In `src/lib/export/color-graph.ts` and `src/lib/gl/pipeline.ts`, use:

```ts
function resolveEffectiveLUTOutputTransfer(
  profile: LUTColorProfile,
): TransferFunctionId | undefined {
  if (profile.outputTransfer) return profile.outputTransfer
  if (profile.role === 'display-look') return profile.inputTransfer
  return undefined
}
```

If the effective output transfer is missing, preview should disable the LUT and
export should return an unsupported graph with a user-actionable message.

- [ ] **Step 4: Preserve final sRGB output**

Keep the export target fixed:

```ts
const OUTPUT_GAMUT = 'srgb-rec709'
const OUTPUT_TRANSFER = 'srgb'
```

The correction is how the LUT output is decoded before this final encode.

- [ ] **Step 5: Update preview tests**

Replace expectations that a bare `panasonic-vgamut-vlog` profile is renderable
as a full contract:

```ts
expect(isLUTProfileRenderable(resolved(profile!))).toBe(false)
```

Add a structured-contract renderable test:

```ts
expect(uniforms.lutInputTransfer).toBe(LUT_TRANSFER_UNIFORMS['v-log'])
expect(uniforms.lutOutputTransfer).toBe(LUT_TRANSFER_UNIFORMS.bt709)
expect(uniforms.lutRole).toBe(LUT_ROLE_UNIFORMS['combined-look-output'])
```

- [ ] **Step 6: Verify**

```bash
pnpm test:run src/lib/export/color-graph.test.ts src/lib/gl/pipeline-profile.test.ts src/lib/gl/pipeline-export.test.ts --exclude '.worktrees/**'
```

Expected: PASS.

---

## Task 4: Correct Full-Resolution LUT Output Application

**Files:**

- Modify: `src/lib/export/full-res-export.ts`
- Modify: `src/lib/export/full-res-export.test.ts`
- Modify: `src/lib/export/full-res-export.real.test.ts`

- [ ] **Step 1: Write failing CPU export test**

Add a two-pixel test where a combined-output LUT returns BT.709 encoded gray
and export writes final sRGB bytes after BT.709 decode plus sRGB encode:

```ts
it('decodes BT.709 LUT output before final sRGB JPEG encoding', async () => {
  const bt709EncodedGray = 0.4090077
  const lut = new Float32Array(2 * 2 * 2 * 3)
  lut.fill(bt709EncodedGray)
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
        {
          kind: 'gamut-to-lut-input',
          matrix: mat3Identity(),
          gamut: 'v-gamut',
        },
        { kind: 'encode-lut-transfer', transfer: 'v-log', range: 'full' },
        {
          kind: 'lut3d',
          size: 2,
          data: lut,
          domainMin: [0, 0, 0],
          domainMax: [1, 1, 1],
        },
        {
          kind: 'lut-output-to-srgb',
          matrix: mat3Identity(),
          transfer: 'bt709',
          range: 'full',
          role: 'combined-look-output',
          intensity: 1,
        },
        { kind: 'output-srgb' },
      ],
    },
    readProcessedWindow: vi.fn((request: LumaRawProcessedWindowRequest) =>
      Promise.resolve(makeProcessedWindow(request, 32768)),
    ),
    writerFactory: () => writer,
  })

  const bt709Linear = Math.pow((bt709EncodedGray + 0.099) / 1.099, 1 / 0.45)
  const expected = Math.round(linearToSrgb(bt709Linear) * 255)

  expect(writtenRows[0]?.bytes[0]).toBe(expected)
  expect(writtenRows[0]?.bytes[0]).not.toBe(Math.round(bt709EncodedGray * 255))
})
```

- [ ] **Step 2: Run the failing test**

```bash
pnpm test:run src/lib/export/full-res-export.test.ts --exclude '.worktrees/**'
```

Expected: FAIL until `bt709` transfer exists in the export transfer registry and
the full-resolution applier decodes the declared output transfer.

- [ ] **Step 3: Keep role-specific mixing correct**

For `combined-look-output` and `technical-output`, the invariant is:

```ts
const lutOutputLinear = decodeTransfer.decode(lutOutputEncoded)
const styledDisplayLinear = outputMatrix * lutOutputLinear
const finalSrgb = linearToSrgb(styledDisplayLinear)
```

No path should apply `linearToSrgb` directly to an already display-encoded LUT
sample without first decoding `outputStep.transfer`.

- [ ] **Step 4: Keep real fixture coverage generic**

`src/lib/export/full-res-export.real.test.ts` should cover declared contracts,
not specific filename recognition. Use one of these patterns:

- a real RAW fixture plus a synthetic or copied LUT that carries structured
  metadata,
- or a parsed LUT with an explicit user-selected contract applied in the test
  setup.

The test should assert:

```ts
expect(graph.lutProfile).toMatchObject({
  role: 'combined-look-output',
  inputGamut: 'v-gamut',
  inputTransfer: 'v-log',
  outputGamut: 'srgb-rec709',
  outputTransfer: 'bt709',
})

expect(graph.steps).toContainEqual(
  expect.objectContaining({
    kind: 'lut-output-to-srgb',
    transfer: 'bt709',
    role: 'combined-look-output',
  }),
)
```

- [ ] **Step 5: Verify**

```bash
pnpm test:run src/lib/export/full-res-export.test.ts src/lib/export/full-res-export.real.test.ts --exclude '.worktrees/**'
```

Expected: PASS. The real test may take roughly 90 seconds.

---

## Task 5: Update UI To Show Input And Output Contracts

**Files:**

- Modify: `src/modules/raw-processor/components/ControlsPanel.tsx`
- Modify: `src/modules/raw-processor/services/style-system.ts`
- Modify: `src/modules/raw-processor/hooks/useRawProcessor.ts`
- Modify: `src/modules/raw-processor/__tests__/workspace-ui.test.tsx`
- Modify: `src/modules/raw-processor/__tests__/style-system.test.ts`
- Modify: `src/modules/raw-processor/hooks/useRawProcessor.test.tsx`

- [ ] **Step 1: Write failing UI tests**

Resolved LUT panel:

```ts
expect(screen.getByText('LUT input:')).toBeInTheDocument()
expect(screen.getByText('Panasonic V-Gamut / V-Log')).toBeInTheDocument()
expect(screen.getByText('LUT output:')).toBeInTheDocument()
expect(screen.getByText('Rec.709 display')).toBeInTheDocument()
```

Missing output:

```ts
expect(screen.getByText(/choose the LUT output/i)).toBeInTheDocument()
expect(
  screen.getByRole('button', { name: 'Change LUT contract' }),
).toBeInTheDocument()
```

- [ ] **Step 2: Run the failing UI tests**

```bash
pnpm test:run src/modules/raw-processor/__tests__/workspace-ui.test.tsx src/modules/raw-processor/__tests__/style-system.test.ts src/modules/raw-processor/hooks/useRawProcessor.test.tsx --exclude '.worktrees/**'
```

Expected: FAIL because the UI currently talks mostly about LUT input.

- [ ] **Step 3: Update display labels**

In `ControlsPanel.tsx`, make missing output explicit:

```ts
function getProfileOutputLabel(profile?: LUTColorProfile) {
  if (!profile) return undefined
  if (profile.role === 'display-look') return 'Rec.709 display'
  if (!profile.outputGamut || !profile.outputTransfer) {
    return 'Output profile required'
  }
  if (
    profile.outputGamut === 'srgb-rec709' &&
    ['srgb', 'bt709', 'gamma24'].includes(profile.outputTransfer)
  ) {
    return 'Rec.709 display'
  }
  // existing gamut / transfer label fallback
}
```

Rename the action from `Change LUT input` to `Change LUT contract`.

- [ ] **Step 4: Update style warnings**

Use contract-level copy:

```ts
const warning =
  lut.profileResolution.kind === 'resolved'
    ? `This LUT uses ${describeLUTContract(lut.profileResolution)}.`
    : 'Choose the LUT input and output contract before preview or export.'
```

- [ ] **Step 5: Update hook selection**

`applyLUTProfileSelection` should become contract selection. Selecting only a
camera-log input profile must not make a custom LUT renderable unless the LUT
also has explicit output fields, including the same-space case where output
gamut/transfer/range equal the input side.

- [ ] **Step 6: Verify**

```bash
pnpm test:run src/modules/raw-processor/__tests__/workspace-ui.test.tsx src/modules/raw-processor/__tests__/style-system.test.ts src/modules/raw-processor/hooks/useRawProcessor.test.tsx --exclude '.worktrees/**'
```

Expected: PASS.

---

## Task 6: End-To-End Verification And Documentation Cleanup

**Files:**

- Modify:
  `docs/plans/2026-04-24-phase2-scene-referred-lut-pipeline-implementation-path.md`
- Modify:
  `docs/specs/2026-04-24-phase2-raw-color-pipeline-color-science-audit.md`
- Modify:
  `docs/plans/2026-04-27-phase2-lut-output-contract-correction-plan.md`

- [ ] **Step 1: Run the targeted LUT/export suite**

```bash
pnpm test:run \
  src/lib/color/log-encoding.test.ts \
  src/lib/lut/cube-parser.test.ts \
  src/lib/lut/profile-resolution.test.ts \
  src/lib/export/color-graph.test.ts \
  src/lib/export/full-res-export.test.ts \
  src/lib/gl/pipeline-profile.test.ts \
  src/lib/gl/pipeline-export.test.ts \
  src/modules/raw-processor/__tests__/workspace-ui.test.tsx \
  src/modules/raw-processor/__tests__/style-system.test.ts \
  src/modules/raw-processor/hooks/useRawProcessor.test.tsx \
  --exclude '.worktrees/**'
```

Expected: PASS.

- [ ] **Step 2: Run real RAW/LUT regression**

```bash
pnpm test:run src/lib/export/full-res-export.real.test.ts --exclude '.worktrees/**'
```

Expected: PASS. The real test must assert declared input and output contracts,
not filename recognition.

- [ ] **Step 3: Run runtime smoke if native artifacts changed**

If this work touches `packages/luma-raw-runtime` or native runtime artifacts,
run:

```bash
pnpm test:run packages/luma-raw-runtime/src/native-smoke.test.ts --exclude '.worktrees/**'
```

Expected: PASS. If runtime files were not changed, state the skip reason in the
final implementation report.

- [ ] **Step 4: Run formatting check on docs**

```bash
pnpm exec prettier --check \
  docs/specs/2026-04-24-phase2-raw-color-pipeline-color-science-audit.md \
  docs/plans/2026-04-24-phase2-scene-referred-lut-pipeline-implementation-path.md \
  docs/plans/2026-04-27-phase2-lut-output-contract-correction-plan.md
```

Expected: PASS.

---

## Acceptance Criteria

- A LUT with structured contract metadata resolves to the declared input and
  output contract regardless of filename.
- A user-selected full contract persists by content-only fingerprint and is
  reapplied only as that user's previous choice.
- A bare filename, title, or casual comment does not resolve a LUT contract.
- A non-display LUT with missing output contract does not preview or export as
  if output equals input.
- Full-resolution export remains fixed to Rec.709/sRGB JPEG.
- Combined/technical LUT output is decoded from its declared output transfer
  before final sRGB encoding.
- Creative LUT output that remains Log requires an explicit Log output contract
  and a real Log-to-display step.
- Preview and full-resolution export use the same declared LUT contract.
- Existing RAW processed-window capability checks remain unchanged.

## Self-Review

- Spec coverage: The plan covers input/output independence, structured metadata,
  user-selected contracts, final sRGB export, and no filename authority.
- Specificity: The plan does not depend on a particular LUT pack, filename, or
  external project convention.
- Type consistency: The plan consistently uses `bt709`, `combined-look-output`,
  `srgb-rec709`, `v-gamut`, and `v-log`.
- Scope: This plan corrects LUT contract handling only. It does not reopen RAW
  decode, LibRaw cropbox processing, secondary compatibility export, or
  server-side processing.
