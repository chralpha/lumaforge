# Mobile Adjust Panel — Inline Slider List

Date: 2026-05-31
Owner: /raw mobile workspace
Status: Design approved, pending implementation plan

## Summary

Replace the mobile Adjust panel's strip-of-tiles + focus-editor-modal pattern with an
inline vertical list of single-line slider rows. Eliminates the modal handoff between
"pick a field" and "scrub a value", and removes horizontal overflow so every Tone and
Color field is reachable in one glance.

The change is scoped to the `/raw` mobile chrome (`MobileLabChrome` + Adjust panel).
Desktop Adjust UI, the underlying `ToneValue`/`ColorValue` models, color/runtime
contracts, preview pipeline, and export path are unchanged.

## Motivation

The current mobile Adjust flow forces two layers of interaction:

1. Open Adjust mode → see a horizontal strip of compact field tiles
   (Exposure / Contrast / Highlights / Shadows / Whites / Blacks; Temperature / Tint).
2. Tap a tile → a full-bleed `ToneFocusEditor` / `ColorFocusEditor` overlay mounts,
   with its own top bar (Cancel / field label / Done) and a bottom slider tray with
   neutral and sibling-pill rows.

Two pain points justify a structural change rather than visual polish:

- **The modal handoff feels heavy.** Every single adjustment requires entering the
  focus editor, even for a small nudge. Cancel/Done semantics imply transactional
  commits the workflow does not actually need — the dock is already non-modal and the
  app's broader mental model (see [[feedback_mobile_live_preview]]) is Lightroom /
  Snapseed-style continuous adjustment, not modal commits.
- **Horizontal strip hides fields below the fold.** Whites / Blacks / Tint require
  horizontal scrolling on common phone widths. Users miss they exist.

Tone↔Color segment friction and dock vertical real estate are acceptable as-is; this
spec does not optimize for them.

## Non-goals

- Combining Tone and Color into a single unsegmented list.
- Changing field set, ranges, units, or value semantics.
- Touching desktop Adjust (`AdjustTool`) or its tests.
- Adding a new gesture vocabulary to the preview surface
  (peek / pinch / pan / tap-immersive unchanged).
- Re-theming or re-tokening the `/raw` darkroom surface.

## Design

### Dock layout

When `mode === 'tone'` in `MobileLabChrome`, the dock panel contents are:

```
┌────────────────────────────────────────────┐
│  [ Tone | Color ]              ↺ Reset      │
├────────────────────────────────────────────┤
│  Exposure   ━━━━━●━━━━━━━━━   +0.50         │
│  Contrast   ━━━━━━━━●━━━━━━   −12           │
│  Highlights ━━━━●━━━━━━━━━━    0            │
│  Shadows    ━━━━━━━●━━━━━━━   +8            │
│  Whites     ━━━━━●━━━━━━━━━    0            │
│  Blacks     ━━━━━●━━━━━━━━━    0            │
└────────────────────────────────────────────┘
```

- Top row: existing `SegmentGroup` for Tone | Color, with the per-section Reset button
  aligned to the row's right edge. The reset is disabled when the active section's
  values are neutral (uses existing `isToneNeutral` / `isColorNeutral`).
- Below the segment: a vertical list of rows, one per field in
  `MOBILE_TONE_FIELDS` (or `MOBILE_COLOR_FIELDS` when the Color segment is active).
- Every row is visible without internal horizontal scroll. Tone list fits in
  approximately 264 px (six 40–44 px rows + small gaps); Color list is about 124 px.

### Row anatomy

Each row is a single horizontal line:

- **Label** (left, ~88 px): full field name from i18n
  (e.g. `raw.tone.exposure.label`), 13–14 px, semibold, color follows
  active/dirty/neutral state.
- **Slider track** (center, flex): the existing `Slider` primitive from
  `src/components/ui/slider/Slider`, set to the field's `min` / `max` / `step` from
  the field metadata. `thumbAriaLabel` is the localized field label.
- **Value** (right, ~52 px): tabular numeric formatted via `formatToneValueShort` /
  `formatColorValueShort`, plus unit if any.
  - When the field is dirty (value ≠ 0), the value cell is a tappable button with
    a ≥44 px hit area that resets the field to 0. Visual treatment: amber-soft
    color, subtle underline-on-press affordance.
  - When the field is neutral, the value cell is plain text (not a button).

Row vertical states:

- **Idle**: normal opacity, neutral border.
- **Dirty** (value ≠ 0): label and value tinted with the existing
  `text-lf-amber-soft` token used by the current strip's dirty tiles.
- **Active scrub** (this row is being dragged): row "lifts" with a subtle
  `bg-lf-on-photo-bg-strong` background and `border-lf-amber` border emphasis.
- **Other rows during a scrub**: opacity ~40%, no interaction needed.

### Scrubbing behavior

On `pointerdown` of a slider row:

1. The row enters scrub state (visual emphasis above).
2. Sibling rows in the panel recede to ~40% opacity.
3. The surrounding dock chrome (mode tabs) dims via the existing
   `setScrubbing(true)` plumbing — same hook the current focus editor uses, narrower
   trigger.
4. A floating value HUD mounts as a sibling of the dock inside `MobileLabChrome`,
   centered horizontally and vertically over the preview frame:
   - Top line: uppercase field name, small (e.g. `0.65rem` semibold,
     `text-lf-amber-soft`).
   - Bottom line: large tabular value (e.g. `2.0rem` semibold, `text-lf-on-photo-ink`),
     identical to the value displayed inline in the row but at glance-size.
   - Surface: `bg-lf-on-photo-bg-strong` with `backdrop-blur-background` and the
     standard `border-lf-on-photo-bord-soft` pill border. `pointer-events: none`.
   - Motion: `surfaceFade` in/out (`m` from `motion/react`, inside the existing
     `LazyMotion`).

On `pointerup` / `pointercancel`:

- Scrub state ends, recede unwinds, HUD fades out.

Continuous drag updates `tone` / `color` via the existing `onToneChange` /
`onColorChange` callbacks with a `Partial<ToneValue>` / `Partial<ColorValue>` patch
— same contract as today.

### Reset behavior

- **Per-section reset** (Reset button on the segment row): calls the existing
  `onToneReset` / `onColorReset`, disabled when section is neutral.
- **Per-field reset** (tap the dirty value cell): sets that field's value to 0 via
  the same `onChange` callback. No confirmation, no overlay — instant.

There is no "Cancel" affordance because there is no transactional commit. Adjustments
land continuously, the same way they already do on desktop and inside the focus
editor (which never restored state on Done either).

### Tone ↔ Color switching

Tapping the `Tone` or `Color` segment swaps the field list with `surfaceFade`
motion, keyed by section. Scrub state, if any, is cleared on swap.

### Preview gesture compatibility

- Pinch / pan / peek / tap-to-immersive remain on the preview frame, wired via the
  existing `useMobilePreviewGestures` hook on `props.previewFrameEl`.
- Slider rows live inside the dock panel above the preview frame. Pointer events on a
  slider's hit area do not reach the preview, so multi-touch / gesture conflicts do
  not arise.
- `previewGesturesEnabled` is now `props.hasImage && !handoffActive && scrubField === null`
  (replacing the old `!focusActive` check). The intent — block peek during a slider
  drag — is preserved; the trigger is narrower.

## Architecture

### Files added

- `src/modules/raw-processor/components/mobile/AdjustListPanel.tsx`
  - Replaces `AdjustStripPanel.tsx` (file renamed, exports renamed).
  - Receives `tone`, `color`, `onToneChange`, `onColorChange`, `onToneReset`,
    `onColorReset`, and a new `onScrubChange(field | null)` callback.
  - Manages the local `activePanel` segment state (same as today).
- `src/modules/raw-processor/components/mobile/ToneListPanel.tsx`
  - Replaces `ToneStripPanel.tsx`.
  - Renders only the Tone field rows. The Tone reset button is no longer here —
    it lives on `AdjustListPanel`'s segment row.
- `src/modules/raw-processor/components/mobile/ColorListPanel.tsx`
  - Replaces `ColorStripPanel.tsx`. Same structure.
- `src/modules/raw-processor/components/mobile/AdjustSliderRow.tsx`
  - Shared single-line row primitive used by both `ToneListPanel` and
    `ColorListPanel`. Owns: label, slider, value cell with reset, dirty/active
    styling, pointer-event handling that calls `onScrubChange`.
- `src/modules/raw-processor/components/mobile/ScrubValueHud.tsx`
  - Floating HUD over the preview during scrub. ~40 lines, animated with
    `surfaceFade`, `pointer-events-none`.

### Files removed

- `src/modules/raw-processor/components/mobile/ToneStripPanel.tsx`
- `src/modules/raw-processor/components/mobile/ColorStripPanel.tsx`
- `src/modules/raw-processor/components/mobile/AdjustStripPanel.tsx`
- `src/modules/raw-processor/components/mobile/ToneFocusEditor.tsx`
- `src/modules/raw-processor/components/mobile/ColorFocusEditor.tsx`
- The corresponding `.test.tsx` files for the removed components.

### Files modified

- `src/modules/raw-processor/components/mobile/MobileLabChrome.tsx`
  - Remove state: `toneFocusKey`, `colorFocusKey`, `toneSnapshot`, `colorSnapshot`.
  - Remove handlers: `startFocus`, `cancelFocus`, `commitFocus`, `switchFocus`,
    `startColorFocus`, `cancelColorFocus`, `commitColorFocus`, `switchColorFocus`.
  - Remove the focus-related cleanup branches inside the `hasImage` /
    `handoffActive` / `preferExportMode` reset effects.
  - Remove the `ToneFocusEditor` and `ColorFocusEditor` `AnimatePresence` blocks
    at the bottom of the JSX.
  - Add state: `scrubField: { kind: 'tone' | 'color'; key: string; value: number } | null`.
  - Replace `focusActive` with `scrubField !== null` everywhere it gates
    `previewGesturesEnabled` and chrome receding.
  - Replace the `mode === 'tone'` branch of `panelContent` with
    `<AdjustListPanel ... onScrubChange={setScrubField} />`.
  - Render `<ScrubValueHud field={scrubField} />` (or null) between the
    immersive-show button block and the dock chrome `AnimatePresence`.
- `src/modules/raw-processor/components/mobile/MobileLabChrome.test.tsx`
  - Drop assertions about focus-editor mount/unmount.
  - Add assertions about scrub HUD mount and dock receding when a tone slider is
    dragged. Use `userEvent.pointer` against the slider thumb.

### Helpers reused unchanged

- `tone-fields.ts` — `MOBILE_TONE_FIELDS`, `formatToneValue`,
  `formatToneValueShort`, `isToneNeutral`, plus each field's `labelKey` / `min` /
  `max` / `step` / `unit` metadata.
- `color-fields.ts` — same for color.
- `Slider` from `src/components/ui/slider/Slider`.
- Motion presets from `src/lib/spring` (`surfaceFade`, `TAP_SPRING`) and
  `src/modules/raw-processor/motion.ts` (`SHEET_SPRING` if needed for the HUD).

### i18n keys

- Removed: `raw.mobile.toneStrip.hint`, `raw.mobile.colorStrip.hint`,
  `raw.mobile.toneStrip.aria`, `raw.mobile.colorStrip.aria`,
  `raw.mobile.focus.cancel`, `raw.mobile.focus.done`,
  `raw.mobile.focus.neutral`, `raw.mobile.focus.siblingsAria`.
- Added: `raw.mobile.adjustList.fieldResetAria` (a11y label for the per-field
  reset target, e.g. `"Reset {label}"`).
- Kept: all field labels and short names used by `MOBILE_TONE_FIELDS` /
  `MOBILE_COLOR_FIELDS`.

Existing i18n surfaces under `src/lib/i18n` will be updated for both supported
locales.

## State flow

```
MobileLabChrome
  ├─ scrubField (new local state)
  ├─ panel = <AdjustListPanel
  │            tone color
  │            onToneChange onColorChange
  │            onToneReset  onColorReset
  │            onScrubChange={setScrubField} />
  └─ <ScrubValueHud field={scrubField} />
```

`AdjustListPanel`:

```
[ Tone | Color ]               [Reset]
<ToneListPanel | ColorListPanel
   value
   onChange      // forwards to MobileLabChrome
   onScrubChange // forwards to MobileLabChrome
/>
```

`ToneListPanel` / `ColorListPanel` map fields to `AdjustSliderRow`:

```
<AdjustSliderRow
   field            // metadata from MOBILE_TONE_FIELDS / MOBILE_COLOR_FIELDS
   value
   onChange={(v) => parentOnChange({ [field.key]: v })}
   onScrubChange={(scrubbing) =>
     parentOnScrubChange(scrubbing ? { kind, key: field.key, value } : null)
   }
/>
```

## Tests

- `AdjustSliderRow.test.tsx` (new): renders label, slider, value; dragging the
  slider emits `onChange`; tapping the value cell when dirty emits
  `onChange(value=0)`; tapping the value cell when neutral is a no-op (not a button);
  pointerdown/up emits `onScrubChange(true/false)`; a11y label on the thumb matches
  the localized field label.
- `ToneListPanel.test.tsx` (replaces `ToneStripPanel.test.tsx`): renders one row per
  `MOBILE_TONE_FIELDS` entry in order; no horizontal scroll container.
- `ColorListPanel.test.tsx` (replaces `ColorStripPanel.test.tsx`): same for color.
- `AdjustListPanel.test.tsx` (repurposed from `AdjustStripPanel.test.tsx`): segment
  switches list; reset button on segment row disabled when neutral; reset button
  calls section reset when dirty; `onScrubChange` from a child row bubbles to the
  parent.
- `ScrubValueHud.test.tsx` (new): renders nothing when `field === null`; renders
  field name + formatted value when present; carries `pointer-events-none`.
- `MobileLabChrome.test.tsx` (modified): scrubbing a tone slider mounts the HUD
  and applies `data-scrubbing` to the chrome; releasing unmounts the HUD; previous
  focus-editor assertions removed.

Motion gotcha from memory ([[feedback_motion_test_gotcha]]): the HUD uses
`AnimatePresence` so jsdom does not need to flush enter animations. Tests assert
presence via the always-mounted `<ScrubValueHud field={field}>` returning null vs a
DOM node, not via animation completion.

## Risks and mitigations

- **Dock height grows for Tone mode (~264 px vs the current strip + collapse).**
  The existing dock collapse handle remains, so the user can shrink it. The list is
  bounded by its content; the dock does not need internal scroll under common phone
  widths. If a future field is added pushing the list past ~320 px, the dock panel
  will pick up `overflow-y: auto` with `overscroll-contain`.
- **Per-field reset via tapping the value risks accidental resets.** Mitigation:
  reset only fires on a tap that resolves on the value cell (not a drag that ended
  there); the cell is non-interactive when the value is already neutral; the action
  is reversible with one more drag.
- **No Cancel affordance to undo a scrub.** The focus editor's Cancel button
  currently restores a pre-edit snapshot; this spec removes that. Safety nets that
  remain: the always-visible row value (the user can read the value as they drag
  and stop early), per-field tap-to-zero on the value cell, and the per-section
  Reset on the segment row. A formal multi-step undo is out of scope and can be
  added later as a separate spec if user feedback shows it is missed.
- **HUD overlap with the histogram card.** The `FloatingHistogramCard` is anchored
  near the top of the preview; the HUD is centered vertically. If a future histogram
  position change introduces overlap, the HUD's vertical anchor can shift downward
  toward the dock by reusing existing safe-area offsets.

## Out of scope follow-ups

- Combining the Tone and Color segments into one unsegmented list (would require
  field metadata unification and is a separate UX question).
- Adding a hold-to-fine-scrub gesture on slider thumbs.
- Snap-to-neutral haptics on iOS Safari (browser support is uneven; not part of this
  spec).

## Verification

Scope: UI-only `/raw` mobile change. Per `CLAUDE.md` progressive verification:

1. `pnpm test:ui` — focused vitest sweep for the touched mobile components.
2. `pnpm lint` — autofix on touched files.
3. `pnpm build` — full tsc pass (per [[feedback_verify_with_build_for_types]],
   needed because component prop signatures change).
4. Browser validation in WebKit-emulated mobile viewport via `pnpm preview`
   (per [[project_raw_browser_validation]]): load a small RAW through the
   Dropzone, enter Adjust mode, drag a Tone slider (Exposure), confirm HUD mounts
   and updates, release and confirm HUD unmounts, confirm per-field reset works,
   confirm per-section reset works, confirm Tone↔Color segment swap, confirm
   peek (long-press preview) still works outside of scrub.

No native, runtime, or package changes — `test:runtime`, `build:native`, and
`native:verify` are intentionally skipped.
