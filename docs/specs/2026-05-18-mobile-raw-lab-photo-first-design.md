# Mobile RAW Lab — Photo-First Rebuild

Date: 2026-05-18
Status: Approved (design); pending spec review
Scope: `/raw` mobile surface only (`≤640px`). Desktop untouched.

## 1. Problem

On mobile, tapping **Style** opens a 56vh bottom sheet that covers most of the
photo, so the user cannot see what a slider does while dragging it. The current
surface is a 2-tab rail (Style / Export) plus a sheet of stacked tool cards.

Source design: Claude Design handoff bundle `Mobile RAW Lab.html` + chat
transcript. The design philosophy is **"the photo is always the primary
surface; every change is visible while you make it."**

## 2. Goal

Rebuild the mobile `/raw` surface as a photo-first lab: the live preview stays
full-bleed at all times; all controls float over it in a thumb-zone dock; every
tone change feeds the real preview pipeline so feedback is immediate.

Adopt the design's **layout, information architecture, and microinteractions**.
Do **not** adopt the prototype's implementation scaffolding (fake CSS-filter
"after" image, raw inline CSS transitions, `libraw-wasm` naming).

## 3. Non-Negotiables (from CLAUDE.md)

- Preview and export executors stay distinct. Live feedback drives the **real**
  WebGL preview pipeline (`PreviewCanvas` inside `ComparePreviewStage`) via the
  existing `onToneChange` / params path — never a CSS-filter fake image.
- Color/LUT is contract work. Preserve declared input gamut, transfer curve,
  LUT intent. No ad hoc color math copied from the prototype.
- The RAW runtime boundary is `@lumaforge/luma-raw-runtime`. The prototype's
  "RAW decode (libraw-wasm)" pipeline label must be corrected.
- Use the `~/` import alias. Stay inside the shared QueryClient / Jotai / router
  runtime — no second state model.
- **Styling: Radix primitives first, Tailwind utilities to finish. No fresh
  isolated vanilla CSS blocks.** Reuse existing tokens/utilities. `raw-lab.css`
  may receive small additions only where a Tailwind/Radix expression is
  genuinely insufficient (e.g. complex layered scrims), and such additions must
  be token-based and minimal.
- Animation: `m` from `motion/react` within the existing `LazyMotion`. Use the
  `Spring` presets from `~/lib/spring` (and the existing `SHEET_SPRING`,
  `TAP_SPRING`, `useToolMotion` in `src/modules/raw-processor/motion.ts`).
  Honor `prefersReduced`.
- Do not edit generated files. Routes via `src/pages/` only (not relevant here).

## 4. Architecture — Approach A (approved)

On `≤640px`, `.raw-lab-shell` is the positioning context:

- `ComparePreviewStage` renders full-bleed (it is already the live WebGL
  preview + compare split + RAW/Finished labels).
- `WorkspaceHeader` is hidden on mobile; its role moves into the new floating
  topbar inside the mobile surface.
- `RawToolSurface`'s mobile branch (already a separate `max-[640px]` path,
  desktop is `max-[640px]:hidden`) is rebuilt to render the photo-first chrome
  as absolutely/fixed-positioned layers over the stage. The existing desktop
  branch is left intact.

Component decomposition (new files under
`src/modules/raw-processor/components/mobile/`, each with one clear purpose):

- `MobileLabChrome.tsx` — orchestrates mobile mode state (`look | tone |
  compare | export`), `more` sheet, focus key, peek; composes the layers below.
- `MobileTopbar.tsx` — mark, file title + support dot, histogram toggle,
  More-menu (Replace RAW / Reset session / browser-local facts).
- `MobileModeDock.tsx` — 5-mode tab bar (Look · Tone · Compare · More ·
  Export) + the active mode panel; panel height capped (~24vh).
- `ToneStripPanel.tsx` — six live tone pills (maps 1:1 to `ToneTool`
  `TONE_FIELDS`: `userExposureEv` ±5/0.01, others ±100/1).
- `ToneFocusEditor.tsx` — single-parameter editor: big readout, center-tick
  track, neutral reset, sibling strip; Cancel reverts via a tone snapshot,
  Done commits. Uses Radix Slider (same primitive as `ToneTool`).
- `MobilePeekSurface.tsx` — long-press anywhere on the photo shows the
  unprocessed RAW by driving the existing compare/`displaySource` path
  (authoritative preview), not an opacity hack. Release restores Finished.
- `MobileMoreSheet.tsx` — pull-up, non-modal, drag-down to dismiss; renders
  real pipeline / LUT-contract / file-facts data (reusing `FileFactsTool`,
  `LutContractTool` content where practical).
- Floating histogram reuses the real `histogram` prop and `HistogramTool`
  data; hidden during focus and peek.

State stays in the existing hooks/atoms (`useRawProcessor`, session atoms).
The only new local UI state is mode/focus/peek/sheet visibility, owned by
`MobileLabChrome`. No new global state model.

## 5. Mode behaviors

| Mode | Panel | Preview effect |
|---|---|---|
| Look | LUT carousel + Strength (reuse `LutContractTool` + `StrengthControl` data) | real pipeline |
| Tone | Tone pill strip → tap → focus editor | real pipeline via `onToneChange` |
| Compare | Split toggle + reset; reuses existing `compareSplit` / `CompareSplitHandle` | real |
| More | opens pull-up sheet (non-modal) | n/a |
| Export | reuses `ExportTool` (authoritative full-res path) | n/a |

Long-press peek works in every mode (suppressed while focus editor is open).

## 6. Microinteractions & texture (React/motion, not vanilla CSS)

- Tap-scale (`whileTap={{ scale: 0.96 }}`, `TAP_SPRING`) on dock tabs, icon
  buttons, focus Cancel/Done, look cards.
- Mode-panel + focus editor enter/exit via `m` + `AnimatePresence` with
  `SHEET_SPRING` / spring presets; slide+fade, reduced-motion → opacity only.
- Chrome-recede while scrubbing: existing pattern (fade non-essential chrome to
  low opacity while a slider/range is dragged) extended to the focus editor so
  the photo has maximum visual weight mid-drag.
- More sheet: spring pull-up, drag-down dismiss with velocity/threshold
  (reuse the existing `useDragControls` + `onDragEnd` pattern in
  `RawToolSurface`).
- Tactile drag grabber, toast on export/reset (reuse existing toast affordance
  if present, else a minimal `m` toast).
- Frosted panels / gradient scrims expressed with Tailwind tokens
  (`bg-material-*`, `backdrop-blur-*`, safe-area utilities already in use); any
  unavoidable layered-scrim CSS is a small, token-based addition to
  `raw-lab.css`.

## 7. i18n

All user-facing strings go through `useI18n()` / `t(...)`. Reuse existing
`raw.*` keys in `src/locales/en.json` + `src/locales/zh-CN.json`
(`raw.mobileTools.*`, `raw.tone.*`, `raw.compare.*`, `raw.export.*`,
`raw.histogram.*`, `raw.fileFacts.*`, `raw.lutContract.*`). Add new keys to
**both** locale files for any new copy (mode labels, peek hint, focus
neutral/bounds, More-sheet headings). No hardcoded literals.

## 8. Out of scope

Desktop surface, catalogs/batch, cloud, accounts, broad new adjustment panels.
No new color math. No changes to the export executor beyond reusing
`ExportTool`.

## 9. Verification (ralph-loop done bar)

The loop iterates until **all** pass:

1. `pnpm lint` clean (scoped to touched files vs. the known pre-existing
   baseline).
2. `pnpm test:run` green; add/adjust component tests for new mobile components
   (test-driven where practical, mirroring existing `*.test.tsx` patterns).
3. `pnpm build` succeeds.
4. Browser validation at a mobile viewport: golden path (load → Tone pill →
   focus drag updates the real preview live → Done) plus peek (long-press
   shows RAW), Look, Compare split, More sheet open/drag-dismiss, Export. No
   regression in desktop layout. Verify WebKit-sensitive behavior
   (touch/pointer, safe-area).

Each loop iteration ends with `verification-before-completion`: evidence
(command output / browser observation) before any "done" claim.

## 10. Risks

- Overlay z-order/pointer-events conflicts between the floating chrome, the
  peek surface, and `CompareSplitHandle`. Mitigation: explicit z-index layers
  documented in `MobileLabChrome`, peek surface constrained to the photo region
  (not over dock/topbar), pointer-events audited.
- Focus-editor scrub must not fight Radix Slider pointer capture. Reuse the
  proven `lostpointercapture` end-signal pattern from `RawToolSurface`.
- Peek via `displaySource`/compare path must not desync the histogram or
  export readiness. Drive only the display, restore on release.
