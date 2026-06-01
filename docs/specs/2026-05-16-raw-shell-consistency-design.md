# /raw Shell Consistency Port

- Date: 2026-05-16
- Status: Aligned with user — proceeding to plan
- Scope: Bring the rest of the `/raw` surface (WorkspaceHeader, mobile rail/sheet, preview-stage chrome) onto the same design system the tool panel redesign established, and delete the bespoke `raw-lab.css` it left behind.
- Predecessor spec: `docs/specs/2026-05-16-raw-tool-panel-redesign-design.md` (the tool-card panel; already implemented)

## Background & Problem

The tool-panel redesign moved the `/raw` tool **cards** onto the app-wide system (Tailwind + `@pastel-palette` semantic tokens + Radix `ui/*` primitives + `~/lib/spring`, quiet typographic hierarchy, warm identity via a `.raw-lab`-scoped `--color-*` override block). That work is half-done: the **shell around the cards is still bespoke** and reads as a different, older, crowded design language.

Concretely, after the panel redesign:

1. **WorkspaceHeader** still renders raw `<button className="raw-lab-topbar-button*">` (not `ui/button`), hard-codes `text-[oklch(0.18_0.018_76)]` / `text-[oklch(0.38_0.032_75)]` arbitrary literals (not `text-text` / `text-text-secondary`), and uses a custom `translateY(-1px)` hover. The `DropdownMenu` is Radix but skinned by bespoke `.raw-lab-more-menu*` rules.
2. **Mobile rail + sheet** is the largest bespoke block (~240 lines of `@media (max-width: 640px)` / `980px` CSS in `raw-lab.css`): hand-rolled `.raw-mobile-tool-tab` / `.raw-mobile-tool-sheet*` with `font-weight: 760–780`, literal gradients, literal borders. The motion layer (`m`, `AnimatePresence`, `Spring`, drag-to-dismiss, `prefersReduced`) is already correct — only the visual class layer is bespoke.
3. **Preview-stage chrome** (`.raw-lab-stage`, `.raw-lab-stage-frame`, `.raw-lab-upload-dock`, `.raw-lab-compare-label`) uses bespoke borders/shadows/literals and heavier type weights.
4. `raw-lab.css` is still 885 lines. Only the scoped `--color-*` block, the `.raw-lab` grid, the histogram SVG strokes, the compare-handle transform math, the sample gradients, and the reduced-motion blanket are genuinely irreducible; the rest is a surviving parallel button/typography/layout system.

Net effect: the cards are calm and on-system, but the header, mobile experience, and stage chrome still carry the old crowded, literal-heavy, heavy-weight identity. The product does not read as one system end to end, and mobile in particular feels off.

## Decisions (confirmed with user)

- Scope: `/raw` only (NOT the landing page or other routes — those are explicitly out of scope for this work).
- Approach: **A — full shell port**. Mirror the panel redesign for the shell: migrate header + mobile + stage chrome onto the shared system and delete the bespoke `raw-lab.css` except the irreducible bits. (Rejected: B token/type-only normalization — leaves the parallel CSS alive; C shell-first deferring the stage — leaves a visible seam at the stage.)
- Preview-stage chrome: **restyle to match** the calm panel language (not merely re-token), while keeping the dark darkroom stage and all drag/WebGL/compare behavior identical.
- Mobile: **first-class** — explicitly designed and browser/WebKit-validated at narrow widths and with safe-area.
- Deliberate scope limits accepted by user:
  - The mobile structural breakpoint stays at exactly **640px** during the Tailwind move (no breakpoint redesign).
  - `LocaleToggle`'s shared global `locale-toggle` class is **not** refactored app-wide; it is restyled in place via `className` at the `/raw` call site only.

## Carry-Over Principles (from the approved panel spec)

These are unchanged and govern every change here:

- Hierarchy from typography and whitespace, not dividers; font-weight capped ~600; the global type scale (`text-callout` / `text-footnote` / `text-headline` / etc.), relaxed line-height.
- Every migrated element consumes the `.raw-lab`-scoped Pastel semantic tokens (`text-text` / `text-text-secondary` / `border-border` / `bg-material-*` / `bg-fill-*` / `text-accent` …), never raw oklch literals.
- Radix primitives carry structure & interaction; Tailwind utilities + tokens handle presentation; component variants via `cva` / `clsxm`.
- Warm darkroom identity is preserved entirely through the existing scoped `--color-*` block — no new `--raw-*`-style token system is introduced.
- Behavior is held constant: export authority / fail-closed / preview-vs-export executor separation, compare-split drag math, WebGL preview, long-press quick export, drag-to-dismiss, `prefers-reduced-motion` gating — all untouched.

## Product Boundary Guardrails

- No new controls, panels, adjustments, or workflow changes. This is a presentation/structure port of existing shell surfaces only.
- Preview and export responsibilities remain distinct; no executor logic is touched.
- Changes are confined to the `/raw` UI shell components and `raw-lab.css`.

## 1. WorkspaceHeader

File: `src/modules/raw-processor/components/WorkspaceHeader.tsx` (+ `raw-lab.css` topbar rules).

- Replace the four raw `<button className="raw-lab-topbar-button*">` with `Button` from `~/components/ui/button`:
  - Replace / Reset / Locale-toggle entry → `variant="secondary"` (or `light` if visually closer to the calm panel buttons; chosen during implementation against the rendered result), `size="sm"`.
  - Full-resolution export → `variant="primary"`.
  - Mobile-only "More" trigger → `Button` (icon + label) as the `DropdownMenuTrigger asChild` child.
- Drop the hard-coded `text-[oklch(...)]` arbitrary values; title → `text-text`, status/unavailable lines → `text-text-secondary`, app type scale, weight ≤600.
- `.raw-lab-topbar` bar container → Tailwind: `border-b border-border`, token background (`bg-material-*`), calmer padding, no bespoke hover transform (the `Button` primitive owns press/hover/focus motion).
- `DropdownMenuContent` keeps Radix; the `.raw-lab-more-menu*` skin → the `ui/dropdown-menu` default token skin plus minimal Tailwind where needed. Keep `align="end"`, all `disabled`/`onSelect` behavior, icons, and i18n verbatim.
- Mobile responsive show/hide of header buttons (currently `@media (max-width: 640px)` rules hiding replace/reset/primary and showing `more`) moves to Tailwind responsive variants at the **same 640px breakpoint**.
- Accessibility/semantics unchanged: `role="banner"`, heading, `SupportBadge`, all aria and i18n keys retained.

## 2. Mobile Rail + Sheet (first-class, isomorphic with the cards)

File: `src/modules/raw-processor/components/RawToolSurface.tsx` (+ `raw-lab.css` `@media` blocks).

The motion layer is already correct and is **kept verbatim**: `m` / `AnimatePresence` / `SHEET_SPRING` / `BACKDROP_SPRING` / `TAP_SPRING`, `drag="y"` + `dragControls` + `onDragEnd` threshold, `prefersReduced` gating, the long-press quick-export handlers, the scroll-hint logic, and every `data-*` / `aria-*` / `id` attribute (`data-raw-mobile-sheet`, `data-raw-tool-sheet`, `data-raw-mobile-panel`, `data-mobile-tool-tab`, `aria-controls`, `aria-expanded`, `aria-disabled`).

Only the **visual class layer** changes:

- `.raw-mobile-tool-rail` / `.raw-mobile-tool-tab` / `.raw-mobile-tool-tab-export` → token-driven Tailwind on the existing `m.button`s. Touch targets stay ≥44px. The export tab gets the primary token treatment; the style tab the secondary; active state via tokens, not literal gradients. Long-press, `whileTap`, and all handlers unchanged.
- `.raw-mobile-tool-sheet` and `-top` / `-drag-handle` / `-header` / `-close` / `-scroll-shell` / `-scroll` / `::after` → Tailwind + scoped tokens. Close button → `IconButton`. Drag handle and scroll-more gradient hint kept but token-fed. Header title → app type scale, weight ≤600.
- `.raw-mobile-tool-backdrop` → token overlay via Tailwind.
- The `@media (max-width: 980px)` and `@media (max-width: 640px)` **structural** switches — `.raw-tool-surface` becoming `position: fixed inset:auto 0 0`, the desktop card area hiding, the rail/sheet display, stage padding for the rail, safe-area insets — move to Tailwind responsive variants (`max-[640px]:` / `max-[980px]:` / arbitrary `env(safe-area-inset-bottom)` where needed) at the **exact same breakpoints**. This is the highest-regression-risk change and gets explicit desktop + 390px + WebKit + safe-area validation.

Outcome: the mobile sheet renders the same `renderCards()` accordion in the same calm language as desktop; mobile and desktop are visually isomorphic.

## 3. Preview-Stage Chrome (restyle to match)

Files: `src/modules/raw-processor/components/ComparePreviewStage.tsx`, `Dropzone.tsx`, `CompareSplitHandle.tsx`, `ProgressOverlay.tsx`, `PreviewCanvas.tsx` (class consumers) + `raw-lab.css` stage rules.

Restyle the chrome *around* the photo to the calm panel language, keeping the dark darkroom stage and **all** behavior identical:

- `.raw-lab-stage` / `.raw-lab-stage-frame` → Tailwind: quiet token border, token-fed dark stage surface, calmer shadow, `rounded-md/lg`.
- `.raw-lab-upload-dock` (+ `-icon`, `-copy`) → token surface, app type scale, weight ≤600; keep focus-visible ring via the global ring token; keep disabled semantics.
- `.raw-lab-compare-label` (+ `-left` / `-right`) → quiet token pill; keep the `[data-raw-compare-dragging]` opacity reveal.

**Irreducible — stays as scoped CSS, but token-fed (no behavior change):**

- `.raw-lab-compare-handle` transform/position math (`--raw-compare-split-x`, `translateX` math, `::before`/`span` hit-area) — geometry, no utility equivalent. Re-point its color literals to scoped tokens.
- `.raw-lab-sample-photo` / `.raw-lab-sample-finish` gradient art (and `--raw-compare-split` clip-path) — generated sample imagery, not a utility.
- `.raw-histogram-*` SVG stroke/fill rules — already retained by the panel work; keep, token-fed.
- `.raw-lab` grid/height + the scoped `--color-*` block; the `@media (prefers-reduced-motion)` blanket.

## 4. raw-lab.css Teardown

After sections 1–3, `raw-lab.css` retains ONLY:

- `.raw-lab { --color-* … }` scoped token block + `.raw-lab` grid/height + the `box-sizing` reset.
- `.raw-histogram-plot` + `.raw-histogram-*` SVG stroke/fill rules.
- `.raw-lab-compare-handle*` transform/geometry rules and `.raw-lab-sample-*` gradient rules (token-fed).
- The `@media (prefers-reduced-motion: reduce)` blanket.

Everything else (topbar/button/menu rules, the entire mobile `@media` button/sheet skin, stage frame/upload/label visual rules) is deleted. Expected ~885 → roughly ~150 lines. No remaining parallel button/typography system; no new token system introduced.

Grep guards (must pass at the end):

- No `text-[oklch` / `bg-[oklch` / `border-[oklch` arbitrary literals in `src/modules/raw-processor/**/*.tsx`.
- No `.raw-lab-topbar-button`, `.raw-mobile-tool-tab`, `.raw-mobile-tool-sheet`, `.raw-lab-upload-dock`, `.raw-lab-stage-frame` **style rules** remaining in `raw-lab.css` (the only `raw-*` class rules left are the histogram/compare-handle/sample geometry).
- No component still importing deleted skin.

## 5. Phased Implementation

Three phases, each independently passing `pnpm lint && pnpm test:run && pnpm build` plus the noted browser validation. Each phase is a discrete commit set.

1. **Phase 1 — WorkspaceHeader.** Migrate to `ui/button` / `ui/dropdown-menu` + scoped tokens; move header responsive show/hide to Tailwind at the 640px breakpoint; delete the topbar/menu CSS rules. Verify: desktop + 640px boundary; header actions (replace/reset/export/more) all function; dropdown keyboard + disabled states.
2. **Phase 2 — Mobile rail + sheet.** Migrate the visual class layer to Tailwind/tokens/`ui/*`; move the `@media` structural switches to Tailwind responsive variants at the same 640px/980px breakpoints; keep all motion/drag/handlers verbatim; delete the mobile `@media` skin CSS. Verify: desktop unaffected, 390px mobile, WebKit run, drag-to-dismiss, long-press quick export, scroll-hint, safe-area inset.
3. **Phase 3 — Stage chrome restyle + teardown.** Restyle stage frame / upload dock / compare label to tokens; re-point the irreducible geometry rules to tokens; delete all remaining non-irreducible `raw-lab.css`; run the grep guards. Verify: golden path (load → Look/LUT → Tone → compare drag → export) on desktop and mobile/WebKit; warm identity intact; no leftover literals or parallel skin.

## 6. Testing

Behavior is held constant; only class-coupled selectors change.

- `src/modules/raw-processor/__tests__/workspace-ui.test.tsx` and `src/modules/raw-processor/components/RawToolSurface.test.tsx`: replace `.raw-lab-topbar-button*` / `.raw-mobile-tool-tab` / sheet class assertions with role/name assertions (`getByRole('button', { name: … })`, `Button` semantics, `toBeDisabled()`). Keep every behavioral assertion: rail toggle open/closed via `data-raw-tool-sheet`, long-press quick export calls `onExport` with the expected options, drag-dismiss path, disabled-before-upload, export reachable.
- Any WorkspaceHeader-specific test: assert by role/name, not bespoke class.
- Stage tests (compare drag, upload dock, progress overlay): keep `data-*`/role hooks; add stable `data-*` hooks where a previously class-targeted element loses its only selector.
- Browser validation per the phase list above; Phase 3 includes the full golden path on desktop and a mobile/WebKit viewport.

## Risks

- **Highest risk: the mobile structural breakpoint move.** Translating `.raw-tool-surface { position: fixed … }` and the rail/sheet display switch from a CSS `@media` block to Tailwind responsive variants can subtly shift stacking, fixed positioning, or safe-area math. Mitigation: keep the exact 640px/980px breakpoints, move structure before deleting the old CSS, and validate desktop + 390px + WebKit + safe-area before teardown.
- Class-coupled tests across two files — mitigated by changing only selectors, holding behavior assertions constant, and per-phase `pnpm test:run`.
- Stage chrome restyle must not alter the dark darkroom stage tonally or perturb compare-drag geometry — mitigated by keeping geometry rules as token-fed scoped CSS and validating compare drag in-browser.
- Blast radius across header + mobile + stage + ~700 deleted CSS lines — mitigated by the same phase→lint/test/build/browser discipline that the panel redesign used successfully.
