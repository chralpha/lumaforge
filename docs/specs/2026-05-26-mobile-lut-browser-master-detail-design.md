# Mobile LUT Browser — Master-Detail Refactor & Strength Consolidation

Date: 2026-05-26
Status: Design (awaiting review)
Surface: `/raw` mobile (viewport ≤ 640px)

## Why

The desktop LUT surface was refreshed on 2026-05-25 around a clean two-tier
disclosure model: a `LutContractTool` overview card whose sub-browsers (online
catalog entries and the input/output contract editor) open inside a shared
`LutBrowserDialog`. The mobile counterpart (`MobileLutBrowser`) inherited the
look-and-feel tokens of that refresh, but kept its earlier organization: one
non-modal `m.aside` sheet that flattens every element — current LUT, contract
status, inline contract editor, dropzone, and the full entry list of every
online source — into a single vertical scroll. Two consequences:

- Information architecture drifts from desktop. Multiple online catalogs blow
  the sheet height up; the contract editor competes with the rest of the sheet
  for visual weight.
- Choice rows (`MobileContractOptionButton`, entry buttons) are bespoke
  re-implementations of `LUTProfileButton` / `LUTOutputOptionButton` /
  `LutIconButton`, so token and icon language drifts over time.

In parallel, the `strength` control sits in its own dock tab and uses its own
mobile-only renderer (`MobileStrengthPanel`). Strength only modulates LUT
application; it has no effect when no LUT is loaded. As a dedicated dock
destination it competes with `Look`, `Tone`, `Compare`, `Export` for primary
real estate and forces users to mode-switch for a parameter that always belongs
to the current LUT.

This spec covers two changes that share scope and components:

1. Convert `MobileLutBrowser` from a flat sheet into a three-view master-detail
   sheet (Overview / Catalog / Contract editor), reusing the desktop
   choice-row components instead of mobile-only duplicates.
2. Move `StrengthControl` (desktop component) into the LUT browser Overview and
   remove the standalone `strength` mode from the mobile dock.

The non-modal sheet contract is preserved: the preview must remain visible and
adjustable behind the sheet at all times (per `feedback_mobile_live_preview`).
No nested `LutBrowserDialog` is introduced on mobile — the dialog overlay
would dim the preview.

## Non-Goals

- No change to desktop `LutContractTool`, `LUTContractBrowser`,
  `OnlineLutSourceControls`, or `LutBrowserDialog` layout. They gain only the
  `size: 'comfortable' | 'touch'` opt-in on choice rows and minor extractions
  of pure helpers.
- No change to the LUT runtime / color contract pipeline.
- No change to how the sheet is opened or dismissed from `MobileLabChrome`.
- No new in-sheet entry points for batch / catalog / cloud workflows. The
  product boundary in `CLAUDE.md` still applies.

## Architecture

### View State Machine

`MobileLutBrowser` owns a local view state:

```
type MobileLutBrowserView = 'overview' | 'catalog' | 'contract'
```

| View       | Entry                                                      | Exit                                             |
| ---------- | ---------------------------------------------------------- | ------------------------------------------------ |
| `overview` | Default when the sheet opens                               | Sheet closes (`onClose`)                         |
| `catalog`  | "Browse N LUTs" on a `MobileLutSourceCard`                 | Back arrow OR `loadEntry` success                |
| `contract` | "Change contract" / "Choose contract" in Overview, OR `initialContractEditorOpen=true` on open | Back arrow OR `onLutProfileSelect` commit |

Auxiliary state:

- `catalogResourceId: string | null` — set on push, cleared on pop.
- `contractDraftInputProfile: LUTColorProfile | null` — initialised from
  `resolvedProfile` on every push to the Contract view; resets when the view
  unmounts. Same lifecycle role it has today, just scoped to the view.
- `contractStep: 'input' | 'output'` and `contractQuery: string` — same as
  today, but scoped to the contract view.

When the sheet is closed (`open` flips to `false`), all view-state resets to
`overview` / `null` / `''` so re-opens start clean. The existing
`initialContractEditorOpen` prop is honoured by setting `view='contract'` on
first paint after `open` flips to `true`.

### View Transitions

Each view is a separate `m.div` with `data-mobile-lut-view`. Horizontal slide:

- Overview: rest at `x: 0`. Slides left out to `x: -16px` while a detail enters.
- Catalog / Contract: enter from `x: '100%'`, settle at `0`, exit to `'100%'`.

Transition uses `sheetSpring` (already imported in this file). Reduced-motion
falls back to a 120ms opacity crossfade — the same pattern the existing sheet
mount/unmount uses.

The body scroll container is **per view** (each view renders its own
`overflow-y-auto` container), so going Back lands at top of Overview rather
than restoring scroll. This matches the desktop dialog pattern where each
dialog is a fresh scroll surface.

`AnimatePresence` wraps the view layer with `mode="popLayout"` so the outgoing
view animates without colliding with the incoming one.

### Overview View Composition

Top-to-bottom in the body:

1. **Current LUT row** (`raw.mobile.lut.currentHeading`): chip + Clear button
   (unchanged).
2. **Strength** (`raw.strength.title`): desktop `StrengthControl` rendered
   directly. Always rendered; `disabled={overallDisabled || !hasAppliedLut}`
   matches the existing desktop rule (greys out when no LUT is applied
   rather than disappearing — same affordance contract as the desktop Look
   card).
3. **Contract status** (`raw.mobile.lut.contractHeading`): unchanged content
   (input chip / output chip / amber attention banner) but the button label
   driver now navigates to the Contract view instead of expanding inline.
4. **Upload** (`raw.mobile.lut.uploadHeading`): unchanged `Dropzone`.
5. **Online sources** (`raw.mobile.lut.onlineHeading`): URL input + add + share
   row (unchanged), followed by a list of `MobileLutSourceCard`s. Each card
   exposes Browse / Refresh / Remove. Tapping Browse pushes to the Catalog
   view for that resource.

The body keeps the existing safe-area padding and the drag-to-dismiss handle.

### Catalog View Composition

```
+---------------------------------------------------------------+
| ← <resource label>            <count pill>  <loading pill?>   |
+---------------------------------------------------------------+
| <amber issue chips, if any>                                   |
| ───────────── Family A ─────────────                          |
|   [ Entry title                              Load ↓ ]         |
|   [ Entry title                              Load ↓ ]         |
| ───────────── Family B ─────────────                          |
|   ...                                                         |
| ───────────── Others ─────────────                            |
|   ...                                                         |
+---------------------------------------------------------------+
```

- Header is a sticky-to-top single row inside the body; the body itself owns
  the scroll.
- Each entry is a 44px tap target rendered by a new
  `MobileLutCatalogEntryButton` (mobile-only, mirrors the desktop entry-row
  visual contract but at touch size). On press it sets
  `loadingEntryId` (same state name as today), awaits `loadEntry`, and on
  success pops back to Overview. On failure the per-resource amber chip stack
  surfaces — same contract as today.
- Family grouping is delegated to a new pure helper
  `groupEntriesByFamily(entries)` (extracted from `OnlineLutSourceControls`).
- If the resource is deleted while the Catalog view is open, an effect pops
  back to Overview.

### Contract Editor View Composition

```
+---------------------------------------------------------------+
| ← Edit contract                       <draft input chip>      |
+---------------------------------------------------------------+
| [   Input   |   Output   ]   ← motion layoutId indicator      |
| [ Search profiles… ]                                          |
| ── Suggested input ──                                         |
|   [ Aperture  Profile label                              ]    |
|   [ Aperture  Profile label                              ]    |
| ── Group X ──                                                 |
|   …                                                           |
+---------------------------------------------------------------+
```

- Tab visual uses the existing motion `layoutId` spring (same params as
  desktop `LUTContractBrowser`).
- Search input uses the shared `Input` primitive (mobile sizing: `h-[44px]`,
  `text-lf-control`).
- List items reuse `LUTProfileButton` / `LUTOutputOptionButton` with
  `size="touch"`.
- Auto-advance: selecting an input pushes `contractStep='output'` (same rule
  as today). Selecting an output commits via `onLutProfileSelect` and pops
  back to Overview.

## Components

### New / changed

| File                                                                                        | Change                                                                                                                                                       |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/modules/raw-processor/components/mobile/MobileLutBrowser.tsx`                          | Refactor: view state machine + three subviews. Drop bespoke `MobileContractOptionButton` and inline catalog rendering. Use `StrengthControl` in Overview.    |
| `src/modules/raw-processor/components/mobile/MobileLutSourceCard.tsx` (**new**)             | Single online-source card: label + count/loading/issue pills + Browse / Refresh / Remove icon buttons. No entry list inside.                                 |
| `src/modules/raw-processor/components/mobile/MobileLutCatalogEntryButton.tsx` (**new**)     | 44px tap entry row used by the Catalog view. Title + Load (Download/Loader2). Mirrors the desktop entry-row contract at touch density.                      |
| `src/modules/raw-processor/components/tools/lut/LUTProfileButton.tsx`                       | Add optional `size?: 'comfortable' \| 'touch'`. `touch` opt-in: `min-h-[44px]`, larger icon slot, larger gap. Desktop default unchanged.                     |
| `src/modules/raw-processor/components/tools/lut/LUTOutputOptionButton.tsx`                  | Same `size` opt-in.                                                                                                                                          |
| `src/modules/raw-processor/components/tools/lut/lut-source-grouping.ts` (**new**)           | Pure helper `groupEntriesByFamily(entries)` extracted from the IIFE in `OnlineLutSourceControls`. Returns `{ families: Array<{ family, items }>, others }`.  |
| `src/modules/raw-processor/components/tools/lut-contract.ts`                                | Add `getContractAttentionState(selection, resolution)` returning `{ needsUserSelection, needsOutputContract, unsupportedOutput, needsAttention }`. Replaces scattered ad-hoc checks. |
| `src/modules/raw-processor/components/tools/lut/OnlineLutSourceControls.tsx`                | Consume `groupEntriesByFamily` instead of inline IIFE. No visual change.                                                                                     |
| `src/modules/raw-processor/components/tools/lut/LUTProfileStatus.tsx`                       | Consume `getContractAttentionState`. No visual change.                                                                                                       |
| `src/modules/raw-processor/components/mobile/MobileLabChrome.tsx`                           | Remove `mode === 'strength'` branch and `strengthControl` prop. Pass strength props through to `MobileLutBrowser` instead.                                   |
| `src/modules/raw-processor/components/mobile/MobileModeDock.tsx`                            | Remove `'strength'` from `MobileMode` and from `TABS`. Drop `Gauge` import. `grid-cols-5` → `grid-cols-4`.                                                   |
| `src/modules/raw-processor/components/RawToolSurface.tsx`                                   | Drop `mobileStrengthControl` synthesis. Plumb `activeIntensity` / `onIntensitySelect` / `strengthDisabled` into the `mobileLutBrowser` props object.         |

### Removed

| File                                                                  | Reason                                              |
| --------------------------------------------------------------------- | --------------------------------------------------- |
| `src/modules/raw-processor/components/mobile/MobileStrengthPanel.tsx` | Replaced by desktop `StrengthControl` in Overview.  |

(`MobileStrengthPanel` has no co-located test file today, so nothing to delete
on the test side.)

### `LUTProfileButton` / `LUTOutputOptionButton` touch density

Both buttons currently use:

- Row: `grid-cols-[22px_minmax(0,1fr)] gap-2 px-1.5 py-1.5 text-[0.74rem]`
- Icon slot: `size-[22px]`, icon glyph `size-[12px]`

Add a `size` prop (default `'comfortable'`). When `size === 'touch'`:

- Row: `min-h-[44px] grid-cols-[28px_minmax(0,1fr)] gap-2.5 px-2 py-2 text-[0.82rem]`
- Icon slot: `size-[28px]`, icon glyph `size-[14px]`

No new variants on color tokens — same oklch tint/hover/active states.

### `MobileLutSourceCard` API

```ts
interface MobileLutSourceCardProps {
  resource: OnlineLutResource
  entryCount: number
  isLoading: boolean
  issues: OnlineLutIssue[]
  onBrowse: () => void
  onRefresh: () => void
  onRemove: () => void
}
```

Visual: same chrome as today's resource card (paper-warm 55%, rounded-md, gap
1.5) but with a single set of 44px buttons on the right and no inline entry
list.

### `MobileLutCatalogEntryButton` API

```ts
interface MobileLutCatalogEntryButtonProps {
  title: string
  loading: boolean
  disabled: boolean
  onClick: () => void
  ariaLabel: string
}
```

Visual: 44px row, `text-lf-control font-medium text-lf-ink`, right-side
Download icon (or Loader2 spinning). Same hover/border treatment as today.

## Data Flow

```
RawToolSurface
  └─ mobileLutBrowser props (now includes activeIntensity, onIntensitySelect, strengthDisabled)
        │
        ▼
MobileLabChrome
  └─ <MobileLutBrowser {...lutBrowser} />     (no `mobileStrengthControl` prop anymore)
        │
        ▼
MobileLutBrowser (owns view state)
   ├─ Overview view
   │   ├─ <StrengthControl value=... onChange=... disabled=... />     (desktop component, reused)
   │   ├─ <MobileLutSourceCard onBrowse=() => pushCatalog(resource.id) />
   │   └─ change-contract button: pushContract()
   ├─ Catalog view
   │   └─ <MobileLutCatalogEntryButton onClick=loadAndPop />
   └─ Contract view
       └─ <LUTProfileButton size="touch" /> & <LUTOutputOptionButton size="touch" />
```

The hook surface (`useOnlineLutSources`) is unchanged.

## Pure helpers

### `groupEntriesByFamily(entries)`

```ts
export function groupEntriesByFamily<T extends { family?: string | null }>(
  entries: readonly T[],
): { families: Array<{ family: string; items: T[] }>; others: T[] } { … }
```

Pure, no React. Replaces the IIFE block in `OnlineLutSourceControls.tsx`
(lines 138–230 today). Both desktop and the new mobile Catalog view consume
it. Property order is preserved: families appear in first-seen order, then
others.

### `getContractAttentionState(selection, resolution)`

```ts
export interface ContractAttentionState {
  needsUserSelection: boolean
  needsOutputContract: boolean
  unsupportedOutput: boolean
  needsAttention: boolean
}
```

Pure. Centralises the three checks currently duplicated in
`LUTProfileStatus.tsx`, `MobileLutBrowser.tsx`, and `MobileLabChrome.tsx`.
`needsAttention === needsUserSelection || needsOutputContract || unsupportedOutput`.

## Edge cases

- **`open=false`**: sheet unmounts via `AnimatePresence`. All view state
  resets on the next open.
- **`initialContractEditorOpen=true`**: on open, jump straight to
  `view='contract'`, with `contractStep='output'` iff
  `needsOutputContract && resolvedProfile` (preserves today's behaviour).
- **Resource removed while Catalog open**: effect watching `resourcesById`
  pops back to Overview.
- **`loadEntry` fails**: stay in Catalog view; per-resource amber chip
  surfaces as today.
- **`onLutProfileSelect` commit**: pop to Overview and reset
  `sheetBodyRef.current.scrollTop = 0` (already in code today; preserved per
  view-local scroll container).
- **No LUT applied**: Overview renders Strength but in disabled state — same
  affordance as desktop's Look card, where the segment dims to 50% opacity
  but stays visible so users see what's coming once a LUT is applied.
- **Drag-to-dismiss**: gesture only attaches to the sheet header, not to
  view bodies — unchanged.
- **Body scroll lock**: `document.body.style.overflow = 'hidden'` while sheet
  open — unchanged.

## Error / state surfaces

No new failure modes. The amber chip stack per resource is the single source
of truth for catalog load failures. The contract attention banner is the
single source of truth for contract-state problems. Both already exist; this
spec only relocates them inside the new view structure.

## Accessibility

- Each view has an `aria-labelledby` on its container pointing at its visible
  heading (`<resource label>` for Catalog, "Edit contract" for Contract,
  existing `raw.mobile.lut.title` for Overview).
- Back arrow buttons get `aria-label={t('raw.mobile.lut.back')}` (new i18n
  key). Buttons remain ≥ 44px.
- Tabs in Contract view keep `role="tablist"` / `role="tab"` /
  `aria-selected`; `motion layoutId` indicator is `aria-hidden`.
- `aria-modal` is still **not** set on the sheet (it stays non-modal so the
  preview remains interactive).

## i18n

Existing keys used as-is (`raw.lutContract.*`, `raw.lutSource.*`,
`raw.mobile.lut.*`, `raw.strength.*`). New keys:

| Key                          | Purpose                                    |
| ---------------------------- | ------------------------------------------ |
| `raw.mobile.lut.back`        | aria-label on back-arrow in detail views.  |
| `raw.mobile.lut.browseEntries` | Button label "Browse {{count}} LUTs" on `MobileLutSourceCard`. |
| `raw.mobile.lut.catalogTitle` | aria heading for Catalog view (`{{label}}`). |
| `raw.mobile.lut.contractTitle` | aria heading for Contract editor view.   |

Existing key `raw.mobile.lut.contractHeading` ("Color contract") is reused as
the visible label of the Change/Choose-contract button cluster in Overview.
The `raw.mobile.strength.note` key may be retired if Strength inside Overview
doesn't need the explanatory line; final decision deferred to implementation.

## Tests

| File                                                                              | What                                                                                                                            |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `MobileLutBrowser.test.tsx`                                                       | Push/pop between Overview ↔ Catalog ↔ Contract. `loadEntry` success returns to Overview. `initialContractEditorOpen` lands on Contract. Strength control is present and disabled when no LUT. |
| `MobileLabChrome.test.tsx`                                                        | No `mode === 'strength'` branch; dock has 4 tabs; strength props plumbed through to `MobileLutBrowser`.                          |
| `MobileModeDock.test.tsx`                                                         | Tab count = 4; no `'strength'` id; `grid-cols-4`.                                                                                |
| `lut-source-grouping.test.ts` (**new**)                                           | `groupEntriesByFamily` family order, others fallback, empty input.                                                               |
| `lut-contract.test.ts` (extend)                                                   | `getContractAttentionState` covers all four flags for resolved / unresolved / unsupported-output / needs-output cases.            |
| `MobileStrengthPanel.test.tsx`                                                    | Deleted with the component.                                                                                                      |

## Verification plan

Per `CLAUDE.md` progressive-verification guidance, this touches `/raw` mobile
UI plus shared `tools/lut/*` choice rows. Scope = "UI + shared component edits"
with limited contract surface (only the helper extractions cross the boundary).

- `pnpm test:ui` (primary)
- `pnpm lint` (autofix)
- Browser validation on viewport ≤ 640px (via `vite preview`, per
  `project_raw_browser_validation`):
  - Overview opens, Strength visible always; modifiable only when a LUT is
    applied (disabled state otherwise).
  - Browse → Catalog → tap entry loads and pops back.
  - Change contract → tabs, search, suggested + grouped lists, output commit
    pops back.
  - Resource Remove from Overview while Catalog open on that resource pops
    back to Overview (effect-driven).
- No native / runtime / export contract changes. `pnpm test:runtime` /
  `pnpm test:app` are not required for this scope.

## Migration / rollout

Single PR. No feature flag. No backwards-compat shim — the dock layout and
`MobileMode` literal are repo-internal types.

## Open items (defer to implementation)

- Exact spring params for the horizontal view transition (re-use
  `sheetSpring` first; only tune if it feels off in browser validation).
- Whether `raw.mobile.strength.note` survives in any form. Likely drop, since
  the parameter is now in context next to the LUT.
- Whether to merge `MobileLutCatalogEntryButton` and the future desktop
  catalog-entry extraction into one component later. Defer — desktop entry
  rows live inside a dialog with different chrome rules.
