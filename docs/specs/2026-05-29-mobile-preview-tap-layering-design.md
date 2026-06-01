# Mobile Preview Tap — Layering & Polish

Date: 2026-05-29
Surface: `/raw` mobile (`src/modules/raw-processor/components/mobile`)

## Background

On mobile, a single tap on the preview frame currently does exactly one thing:
`setImmersive((v) => !v)` (`MobileLabChrome.tsx:232`). It is a pure toggle of
the immersive layer (hide topbar + dock, show a "Show controls" pill), wired
through `useMobilePreviewGestures` on the same DOM element that owns pinch/pan.

A review asked whether the tap should instead progressively collapse the
expanded tool panel first and only enter immersive when nothing is left to
collapse. After weighing it against the industry convention (iOS Photos /
Lightroom mobile use a pure chrome toggle, not progressive peeling), the
decision is to **keep the pure toggle as the core semantics** and not introduce
progressive peeling of the dock panel.

Two concrete problems remain under that pure-toggle commitment:

1. **The toggle is not self-consistent while a bottom sheet is open.** The LUT
   browser (`MobileLutBrowser.tsx:1006`, `Dialog modal={false}`, `max-h-[82%]`,
   `bottom-0`, `onInteractOutside` prevented) and the More sheet
   (`MobileMoreSheet.tsx:78`, `aria-modal="false"`, `max-h-[78%]`, `bottom-0`)
   are non-modal bottom sheets with no full-screen scrim. The gesture gate
   `previewGesturesEnabled = hasImage && !handoffActive && !focusKey`
   (`MobileLabChrome.tsx:227`) does not account for an open sheet. Tapping the
   ~18–22% of the photo still exposed above a sheet fires the tap handler and
   toggles immersive *behind* the sheet: the topbar/dock recede, the "Show
   controls" pill renders at `z-[12]` underneath the `z-[46]` sheet (so it is
   not even reachable), and long-press peek can fire behind the sheet too. The
   same outside tap is deliberately ignored by the sheet (`preventDefault`) yet
   acted on by the immersive toggle — a contradiction.

2. **Entering immersive while the dock panel is expanded feels abrupt.** The
   whole chrome (expanded panel + tab bar + topbar) fades out as one wall via a
   single `DOCK_SPRING` opacity exit, rather than the panel tidying away first.

## Decisions

- **Core tap semantics: pure toggle (unchanged).** No progressive peeling of the
  dock panel. The panel + chrome enter/leave immersive atomically, and exiting
  immersive restores whatever chrome state was present (symmetric restore).
- **Outside tap on an open sheet closes the sheet.** Tapping the exposed preview
  while a LUT/More sheet is open dismisses the sheet (standard tap-outside-to-
  close) and does **not** toggle immersive in the same tap.
- **Soften the immersive transition when a panel is expanded.** Collapse the
  panel first, then recede the chrome ("collapse, then recede"), and reverse the
  order on exit.

## Model: preview-tap precedence

A preview tap resolves the **single top-most transient layer** (first match wins):

```
0. No image / export handoff / tone-focus editor  -> gestures disabled (no-op)
1. A bottom sheet is open (LUT browser OR More)     -> close the sheet           [NEW]
2. Otherwise                                        -> toggle immersive (atomic)  [unchanged]
```

Rationale and boundaries:

- Rule 1 only ever resolves *one* layer per tap (at most one sheet is meant to be
  open), so it does not reintroduce multi-level peeling. The dock panel toggle
  stays atomic under Rule 2 — the panel is treated as chrome, not as a dismissable
  transient surface.
- **Long-press peek is suppressed while a sheet is open**, reusing the existing
  `allowPeek` switch: `allowPeek = !compareSplitOpen && !lutBrowserOpen && !moreOpen`.
  The hook stays `enabled` so (a) a short tap can still close the sheet and (b) the
  `contextmenu` `preventDefault` keeps suppressing the browser image callout on the
  exposed strip.
- **Histogram card is NOT in this stack.** It is a passive `pointer-events-none`
  HUD the user explicitly toggles from the topbar; it rides the immersive toggle
  (hidden in immersive, restored on exit) instead of being closed by a tap. A tap
  passes through it and toggles immersive as today.
- **Compare split unchanged:** peek already suppressed via `allowPeek`; tap toggles
  immersive (split view persists, chrome recedes → clean comparison).

## Implementation

All changes are in `src/modules/raw-processor/components/mobile/`. The
`useMobilePreviewGestures` hook logic is unchanged; only its inputs and the
`onTap` callback in `MobileLabChrome.tsx` change, plus the immersive transition
sequencing.

### Slice 1 — sheet precedence (correctness fix)

In `MobileLabChrome.tsx`:

- Add a `closeSheets()` helper: `setLutBrowserOpen(false)`,
  `setLutBrowserStartsInContract(false)`, `setMoreOpen(false)`.
- Replace the `onTap` passed to `useMobilePreviewGestures`:
  ```ts
  onTap: () => {
    if (lutBrowserOpen || moreOpen) {
      closeSheets()
      return
    }
    // Slice 2 will route this through the sequenced enter/exit helpers.
    setImmersive((v) => !v)
  }
  ```
- Tighten peek suppression:
  ```ts
  allowPeek: !compareSplitOpen && !lutBrowserOpen && !moreOpen,
  ```
- Leave `previewGesturesEnabled` unchanged (the hook must stay enabled so the tap
  can close the sheet and the contextmenu guard stays active).
- Leave the sheets' Radix `onInteractOutside`/`onPointerDownOutside`
  `preventDefault` in place — closing is driven explicitly from the tap handler,
  so the two paths do not double-fire.

The `onTap` closure reads `lutBrowserOpen`/`moreOpen`; the hook already stores
`onTap` in a ref refreshed every render, so the latest values are seen.

### Slice 2 — "collapse, then recede" immersive transition (polish)

Replace the atomic `setImmersive((v) => !v)` (for the *user-initiated* path only)
with sequenced enter/exit helpers in `MobileLabChrome.tsx`:

- New constant in `motion.ts` (next to `DOCK_SPRING`): `IMMERSIVE_STAGGER_MS = 140`
  — the lead the panel-collapse gets before the chrome recedes. Tunable; chosen as
  a partial lead within the `DOCK_SPRING` (~240ms) band so it reads as a sequence,
  not two separate animations.
- Add refs: `immersiveStaggerTimer` (cleanup) and `expandedBeforeImmersive`.
- `enterImmersive()`:
  - If `dockExpanded && !prefersReduced`: record `expandedBeforeImmersive = true`,
    `setDockExpanded(false)` (panel slides down via the dock's existing
    AnimatePresence — the same animation as tapping the active tab), then after
    `IMMERSIVE_STAGGER_MS`, `setImmersive(true)`.
  - Else: record `expandedBeforeImmersive = dockExpanded`, `setImmersive(true)`
    immediately (atomic, as today).
- `exitImmersive()`:
  - `setImmersive(false)` immediately (topbar + collapsed dock spring back).
  - If `expandedBeforeImmersive && !prefersReduced`: after `IMMERSIVE_STAGGER_MS`,
    `setDockExpanded(true)` (panel slides back up). Else if `expandedBeforeImmersive`:
    `setDockExpanded(true)` immediately.
  - Reset `expandedBeforeImmersive = false`.
- `onTap` (final form):
  ```ts
  onTap: () => {
    if (lutBrowserOpen || moreOpen) { closeSheets(); return }
    if (immersive) exitImmersive()
    else enterImmersive()
  }
  ```
- The "Show controls" pill `onClick` calls `exitImmersive()` (not bare
  `setImmersive(false)`), so it gets the same staggered restore.
- **Teardown paths stay instant.** The existing effects that force
  `setImmersive(false)` on `!hasImage` / `handoffActive` / `preferExportMode`
  keep calling the setters directly and must also clear `immersiveStaggerTimer`
  and reset `expandedBeforeImmersive`. Add timer cleanup on unmount.
- Under `prefersReduced`, both halves collapse to instant — preserving the old
  atomic behavior for reduced-motion users.

## Edge cases

- **Both sheets open at once** (reachable in theory via the topbar More menu while
  a sheet is open): `closeSheets()` clears both — the tap dismisses the sheet
  layer entirely. Acceptable and safe given rarity.
- **Tap closes sheet, then immersive:** closing a sheet consumes the tap; a
  subsequent tap (no sheet) toggles immersive. One tap, one layer.
- **Immersive teardown mid-stagger:** if `hasImage`/handoff/export forces immersive
  off while a stagger timer is pending, the timer is cleared so no late
  `setImmersive(true)`/`setDockExpanded(true)` fires onto a torn-down state.

## Testing

`MobileLabChrome.test.tsx`:

- **Update** `short tap toggles immersive (chrome hidden) and back` (line 419):
  the enter half is now staggered (panel collapse → 140ms → immersive). Drive it
  with fake timers (`vi.useFakeTimers()` + `vi.advanceTimersByTime`) or `waitFor`
  so the topbar-hidden assertion observes the post-stagger state. The exit half
  (click "Show controls" → topbar returns) stays synchronous (the topbar is not
  gated by `dockExpanded`).
- **Add** "tap on exposed preview closes an open sheet instead of toggling
  immersive": open the LUT browser (or More), dispatch a pointerdown/up on
  `previewFrameEl`, assert the sheet closed and the topbar is still present
  (immersive did not engage).
- **Add** "long-press peek is suppressed while a sheet is open": open a sheet,
  hold past `LONG_PRESS_MS`, assert `onViewModeChange` was not called with
  `'original'`.
- Existing peek/pinch tests are unaffected (no sheet open in those).

## Verification

- `pnpm test:ui` (or focused `MobileLabChrome` test run) + `pnpm lint`.
- Per CLAUDE.md, this is user-visible `/raw` interaction behavior: validate in a
  real mobile/WebKit browser — sheet-open outside-tap closes the sheet (not
  immersive-behind-sheet), and the collapse-then-recede sequence on a phone
  viewport with motion enabled.

## Out of scope

- Progressive peeling of the dock panel (explicitly rejected — pure toggle stays).
- Changing sheet content, drag-to-dismiss, or the histogram HUD behavior.
- Any non-tap gesture vocabulary changes (pinch/pan/long-press peek logic).
