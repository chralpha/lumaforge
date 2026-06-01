# LUT Contract Vocabulary + Recommend-State UX — Design

- **Status:** Approved direction, pending spec review
- **Date:** 2026-05-29
- **Branch:** `feat/lut-contract-vocabulary`

## 1. Context & Problem

When a user loads a `.cube` LUT, the app tries to auto-resolve its color
contract (input gamut/transfer/range -> output gamut/transfer/range). The
result is a `LUTProfileResolution` (runtime type) constructed app-side by
`resolveLUTProfile` (`src/lib/lut/profile-resolution.ts:504`):

- `kind: 'resolved'` — contract auto-confirmed (metadata, persisted user choice).
- `kind: 'needs-user-selection'` — could not auto-confirm. Carries `suggestions`
  (auto-inferred candidate profiles) and an optional `reason: 'unsupported-output'`.

`buildLUTProfileSelectionState` (`src/modules/raw-processor/services/style-system.ts:61`)
maps this into the app model `LUTProfileSelectionState`
(`status: 'pending' | 'resolved'`).

### Confirmed defect

`needs-user-selection` conflates two genuinely different situations:

1. **There is a confident recommendation** (`suggestions` non-empty) — e.g. a
   file named `VLog_to_709` infers Panasonic V-Log input + Rec.709 output.
2. **Nothing is known** (`suggestions` empty).

Every status surface collapses both into a single generic amber warning and
**discards the input/output row structure** that the resolved state uses:

- Desktop `tools/lut/LUTProfileStatus.tsx:57-63` — pending renders only
  `raw.lutContract.unknown`; the recommendation is invisible and only reachable
  by opening the "Change contract" dialog.
- Mobile `MobileLutBrowser.tsx:537-542` — same: `needsUserSelection` renders only
  the warning.

Result: a LUT **with** a confident recommendation looks identical to one with no
information at all. The recommendation has zero visible value in the status, and
the consistent "LUT input / LUT output" interaction is broken in this state.

### Naming / exposure drift

- **Three divergent status surfaces.** Besides the two above, `ControlsPanel.tsx:200`
  contains a second, **dead** `LUTProfileStatus` + `LUTProfileSelector`
  (never rendered — no `<ControlsPanel>` usage or test reference; only exported
  in `index.ts`). It hardcodes English, uses a green (not amber) treatment, and
  an inline selector instead of the dialog.
- **Mixed terminology.** The same concept cluster is named `profile` /
  `contract` / `selection` / `resolution` interchangeably; the auto-inferred
  candidates are `suggestions` in the runtime, "Suggested" in the UI, and
  "recommend" colloquially. zh-CN also mixes `色彩合同` and `合同`.

## 2. Goals / Non-goals

### Goals

1. Establish a single **canonical contract vocabulary**, owned by the runtime
   package (it is the contract source of truth, `"private": true`, no external
   consumers).
2. Split the ambiguous `needs-user-selection` into distinct, named states at the
   source so UI no longer has to infer "has recommendation vs knows nothing".
3. Fix the recommend-state UX: surface the recommendation **inline** in the same
   input/output structure, with one-click confirmation.
4. Remove the dead `ControlsPanel` duplicate and align terminology + i18n.

### Non-goals

- No change to color math, inference heuristics, confidence scoring, or numeric
  behavior. This is a rename + a state-shape split + a UI surfacing change.
- No change to the fail-closed export guarantee. Export remains blocked until the
  contract is confirmed.
- `LUTColorProfile` (a registry entry for a known color space) is **not** merged
  into "contract" — it is a genuinely distinct concept and keeps its name.
- No new navigation/dialog flow; the recommend "choose output" path reuses the
  existing two-step browser.

## 3. Canonical vocabulary

| Concept | Current | Canonical |
| --- | --- | --- |
| Registry entry for a known color space | `LUTColorProfile` | **unchanged** |
| The chosen input+output pairing for a LUT | `LUTContractSelection` / `StoredLUTContractSelection` | **unchanged** |
| Result of auto-resolving a LUT's contract on load | `LUTProfileResolution` | `LUTContractResolution` |
| Kind of that result | `kind: 'resolved' \| 'needs-user-selection'` (+ `reason`) | `kind: 'confirmed' \| 'recommended' \| 'unknown' \| 'unsupported-output'` |
| Auto-inferred candidates | `suggestions` | `recommendations` |
| App-side selection state | `LUTProfileSelectionState` (`status: 'pending' \| 'resolved'`) | `LUTContractSelectionState` (`status: 'confirmed' \| 'recommended' \| 'unknown' \| 'unsupported-output'`) |

The user-facing word becomes **Recommended / 推荐**. zh-CN standardizes the
contract noun on the dominant existing term **色彩合同** (no new term introduced).

## 4. Runtime semantic change (the state split)

New runtime type (`packages/luma-color-runtime/src/types.ts`):

```ts
export type LUTContractResolution =
  | { kind: 'confirmed'; profile: LUTColorProfile; confidence: 'metadata' | 'user' | 'persisted-user' }
  | { kind: 'recommended'; recommendations: LUTColorProfile[] }          // non-empty
  | { kind: 'unknown' }
  | { kind: 'unsupported-output'; recommendations: LUTColorProfile[] }   // may be empty
```

- `confirmed` replaces `resolved` (same payload).
- `needs-user-selection` is split by the producer:
  - `recommendations.length > 0` and not unsupported -> `recommended`.
  - `reason === 'unsupported-output'` -> `unsupported-output` (keeps any candidates).
  - otherwise -> `unknown`.

The split is decided **app-side** in `resolveLUTProfile`
(`src/lib/lut/profile-resolution.ts:504-551`), which constructs the values; the
**type** is owned by the runtime.

App model (`src/modules/raw-processor/model/session.ts:52`):

```ts
export type LUTContractSelectionState =
  | { status: 'confirmed'; fingerprint; profileId; confidence }
  | { status: 'recommended'; fingerprint; title; sourceName?; recommendations: LUTColorProfile[] }
  | { status: 'unknown'; fingerprint; title; sourceName? }
  | { status: 'unsupported-output'; fingerprint; title; sourceName?; recommendations: LUTColorProfile[] }
```

## 5. Affected symbols & construction/consumption sites

Rename `LUTProfileResolution` -> `LUTContractResolution`, `suggestions` ->
`recommendations`, `LUTProfileSelectionState` -> `LUTContractSelectionState`,
and update `kind`/`status` checks at every site, including:

- Runtime: `packages/luma-color-runtime/src/types.ts` (type + `LumaColorLUTData.profileResolution`),
  `index.ts` re-exports.
- App producers: `src/lib/lut/profile-resolution.ts` (`resolveLUTProfile`,
  `applyLUTContractSelection` -> `confirmed`/`'user'`, `toCompatInputProfile`
  `kind !== 'resolved'` -> `!== 'confirmed'`).
- Model mapping: `src/modules/raw-processor/services/style-system.ts:61`
  (`buildLUTProfileSelectionState`), `describeLUTContract`.
- Export gating: `src/modules/raw-processor/model/derive-session.ts:30-43`
  (`deriveUnsupportedExportPipelineReason`) — map `confirmed`,
  `unsupported-output`; `recommended`/`unknown` keep the existing
  "Choose a LUT input profile before full-resolution export." block.
- Status surfaces: `tools/lut/LUTProfileStatus.tsx`, `tools/lut-contract.ts`
  (the shared derivation), `MobileLutBrowser.tsx`, `RawToolSurface.tsx:265`.
- Tests/mocks: ~20 files (mostly `*.test.tsx` mocks) — mechanical updates.

`.suggestions` is read in only 6 places; most of the ~20 hits are test mocks.

## 6. Recommended-state UX

A single shared derivation in `tools/lut-contract.ts` replaces
`getContractAttentionState`/`ContractAttentionState`:

```ts
type LUTContractView =
  | { status: 'confirmed'; profile; outputLabel }
  | { status: 'incomplete-output'; profile }                 // confirmed input, output still required
  | { status: 'recommended'; recommendation; recommendations; completesContract: boolean }
  | { status: 'unknown' }
  | { status: 'unsupported-output'; recommendations }

function deriveLUTContractView(selection, resolution): LUTContractView
// needsAttention === (view.status !== 'confirmed')
```

`recommendation` is the top candidate (`recommendations[0]`). `completesContract`
is true when applying it yields a complete stored contract — i.e. it already has
a full output (`buildStoredContractSelection` succeeds: complete output for
non-`display-look` roles, or a display-like `display-look`). This is the key
branch, because `annotateProfileOutput` only adds an output when the
signature contains a `to X` marker.

Both surfaces consume this view; chrome stays per-surface (desktop text rows,
mobile chips). The `recommended` state reuses the resolved input/output rows:

### Complete recommendation (`completesContract === true`)

```
LUT input    Panasonic V-Log     ·recommended
LUT output   Rec.709 display     ·recommended
⚠ Inferred from the file name/metadata — confirm before export.
[ Use this contract ]   [ Change ]
```

`Use this contract` -> `onSelect(recommendation)` -> existing
`orchestrateProfileSelection` -> `confirmed`.

### Input-only recommendation (`completesContract === false`)

```
LUT input    Panasonic V-Log     ·recommended
LUT output   Choose…
⚠ Input recognized — choose an output to confirm.
[ Choose output ]   [ Change ]
```

`Choose output` -> opens the existing browser at the **output** step with
`draftInput` prefilled to the recommendation (reuses the current two-step flow,
no new interaction).

### Invariants

- **Preview** keeps the current honest `display-srgb` fallback
  (`toCompatInputProfile`); the recommendation is never silently applied to the
  pipeline.
- **Export** stays fail-closed (`derive-session.ts`): blocked until `confirmed`.
- `unknown` keeps the existing generic warning. `unsupported-output` keeps its
  message but retains the `Change` entry point.

## 7. Dead-code removal

Remove the dead duplicate `LUTProfileStatus` + `LUTProfileSelector` in
`ControlsPanel.tsx`, and `ControlsPanel` itself plus its `index.ts` export,
after a final `rg` confirms no `<ControlsPanel>` usage and no test reference.

## 8. i18n (`src/locales/en.json`, `src/locales/zh-CN.json`)

- Browser headings `raw.lutContract.suggestedInput` / `suggestedOutput`:
  "Suggested" -> "Recommended" / "建议" -> "推荐".
- Add keys for the inline recommend rows: `recommendedBadge`,
  `recommendedNote` (complete), `recommendedInputOnlyNote`, `applyContract`
  ("Use this contract"), `chooseOutput` ("Choose output").
- zh-CN: standardize the contract noun on `色彩合同` across keys.
- Keep `raw.lutContract.unknown` for the `unknown` state.

## 9. Implementation sequencing

**Step 1 — runtime vocabulary (pure refactor).** Rename types/fields, split the
`kind`/`status` shapes, and propagate to all producers, consumers, model, and
test mocks. No behavior change. Done when green:
`pnpm test:runtime`, color-runtime `typecheck` + `build`, `pnpm test:app`.

**Step 2 — recommend-state UX.** Add `deriveLUTContractView`; render the inline
recommend rows + adaptive primary action on desktop and mobile; remove the dead
`ControlsPanel` code; update i18n. Done when green: `pnpm test:ui` / `pnpm test:app`,
`pnpm lint:check`, plus a browser validation pass (vite preview) for the
recommend interaction on desktop and mobile/WebKit.

## 10. Testing

- `deriveLUTContractView`: all five view states, and `completesContract` true/false.
- `resolveLUTProfile`: emits `confirmed` / `recommended` / `unknown` /
  `unsupported-output` for representative inputs.
- Desktop `LUTProfileStatus` / `RawToolSurface`: recommended state renders input
  + output rows; `Use this contract` vs `Choose output` branch by
  `completesContract`; export stays blocked while recommended.
- Mobile `MobileLutBrowser`: recommended-state parity.
- Export gating unchanged for `recommended`/`unknown`/`unsupported-output`.

## 11. Verification commands

- Step 1: `pnpm test:runtime`, `pnpm --filter @lumaforge/luma-color-runtime typecheck`,
  `pnpm --filter @lumaforge/luma-color-runtime build`, `pnpm test:app`.
- Step 2: `pnpm test:ui`, `pnpm test:app`, `pnpm lint:check`; browser validation
  via vite preview.
- Closeout for the branch: `pnpm lint`, `pnpm test:run`, `pnpm build`.

## 12. Risks & mitigations

- **Runtime is the export-trust boundary.** Mitigation: Step 1 is a
  semantics-preserving rename verified by `test:runtime`; TypeScript flags every
  missed rename site.
- **Test-mock churn.** Mitigation: contained to Step 1; the type checker drives
  the edits.
- **Coupling a large rename to a behavior change.** Mitigation: two independent,
  individually-green steps so regressions are bisectable.
