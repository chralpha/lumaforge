# /raw Mobile ↔ Desktop Visual Consistency

- Date: 2026-05-21
- Status: Aligned with user — proceeding to spec review then plan
- Scope: The `/raw` surface only. Both viewports (desktop `RawToolSurface` + `ControlsPanel` + `tools/*`, and the mobile branch under `src/modules/raw-processor/components/mobile/*`). Does not touch routing, runtime, color pipeline, export authority, or any non-`/raw` route.
- Predecessor work: `2026-05-18-mobile-raw-lab-photo-first-design.md` (photo-first mobile rebuild — settled the *interaction model*) and `2026-05-16-raw-shell-consistency-design.md` (desktop shell vocabulary). This spec covers the *visual identity* layer that those two specs intentionally did not unify.

## Background & Problem

After several rounds of mobile rebuilding, `/raw` reads as two different products. The runtime fork lives at one line:

```
RawToolSurface.tsx:277  if (isMobileViewport) { … MobileLabChrome … }
```

Below that branch, the two trees are completely disjoint:

- Desktop: `ControlsPanel` (392 LOC) + `tools/{ToneTool, HistogramTool, ExportTool, CompareTool, FileFactsTool}` composed through `ToolCard` + `WorkspaceHeader`.
- Mobile: `mobile/{MobileLabChrome (538), MobileLutBrowser (718), MobileExportPanel, MobileStrengthPanel, ToneStripPanel, ToneFocusEditor, MobileModeDock, MobileTopbar, MobilePeekSurface, FloatingHistogramCard, MobileMoreSheet, MobileMoreMenu, MobileComparePanel}` — roughly 3k LOC of mobile-only surface area.

User diagnosis of where it hurts (three of four offered layers, ranked by felt pain):

1. **Visual language** — typography step, radius, surface treatment (blur/border), accent usage drift between the two trees.
2. **Control vocabulary** — the same concept appears as different primitives (e.g. Strength is a slider on one side, a chip group on the other) with no shared `Chip` / `Slider` definition.
3. **Motion / feedback** — sheet spring on mobile, popover fade on desktop, durations and easings not shared, micro-interactions feel ad hoc.

The user did **not** flag information architecture or terminology as broken, so naming/IA is out of scope. The interaction model divergence (sheet vs popover, dock vs sidebar) is **correct** — it is pinned by the photo-first spec and the user's memory rule that the mobile sheet must be non-modal and never dim the preview. That divergence is not the problem.

The problem is that the two trees stand on no shared foundation. Each platform encodes its own tokens via inline Tailwind strings and a 594-line `raw-lab.css` whose hardcoded values disagree with the equivalents elsewhere. There is no shared `Chip` primitive, no shared sheet/popover surface, no named motion vocabulary. That is what reads as "different products."

## Non-Negotiables

From CLAUDE.md and durable memory:

- The product boundary stays narrow: single RAW → preview → look/LUT → compare → JPEG export. This is **not** a design system project. No new package, no new `design-system/` directory, no `tokens.css` file — token work lands in existing `src/styles/` + Tailwind config.
- The mobile interaction model stays Lightroom/Snapseed-shaped: non-modal sheet, preview never dimmed or blurred while adjusting. Pulling desktop popover idioms into mobile is forbidden.
- Radix is the primitive layer; Tailwind is the finishing layer; no fresh isolated vanilla CSS blocks. Existing vanilla CSS in `raw-lab.css` is grandfathered debt — to be reduced, not deleted wholesale.
- Preview/export executor separation, color-pipeline contracts, export-authority fail-closed semantics, and the `LazyMotion` + `motion/react` + `src/lib/spring` animation stack are untouched.
- Routes change by editing `src/pages/*`. Generated files (`src/generated-routes.ts`) are not touched.

## Decisions (confirmed with user)

- **Anchoring strategy: shared foundation, divergent composition.** Neither platform is the north star. Lock a small platform-agnostic foundation (tokens + a few primitives + named motion presets), and let each platform keep its own component-level idiom (sheet vs popover, dock vs sidebar) on top.
- **Pilot scope: Look mode, with Strength folded in as a sub-control of Look.** Tone (`ToneTool`, `ToneFocusEditor`, `ToneStripPanel`) is explicitly out of this pilot, even though it shares a panel with Look on desktop and shares chrome with Look on mobile.
- **Exit criterion: family resemblance, not pixel parity.** A stranger looking at screenshots from both viewports should sub-consciously associate them as one product family. Pixel parity is the *wrong* target because it fights the interaction-model divergence we are required to preserve.
- **CSS strategy: four-bucket categorization, not a scorch-earth migration.** See the CSS section below.
- **Success criteria are soft.** No hard token-coverage % or LOC delta target. PR review uses the qualitative criterion above.

## Shared Foundation vs Platform-Specific

| Layer | Shared? | Notes |
|---|---|---|
| Color tokens (surface, foreground, accent, border, ring) | **Yes** | One palette. Both platforms reference the same Tailwind theme keys. |
| Typography scale + weights | **Yes** | Mobile picks a *step* on the same scale (one step larger for touch), not a different scale. |
| Radius, border thickness, surface treatment (blur, elevation) | **Yes** | This is the single biggest "looks like a sibling" signal. |
| Motion presets (durations, easings, spring) | **Yes** | Two named exports from `src/lib/spring` — `sheetSpring` (mobile sheets, drag-to-dismiss) and `surfaceFade` (desktop popovers, mode swap). No bespoke transitions in pilot scope. |
| Iconography sizing/stroke/optical alignment | **Yes** | Cheapest unification win. |
| Control primitives: `Chip`, `Slider`, `SegmentedControl`, sheet/popover surface | **Yes** — primitive only | Both platforms compose with the same building blocks. The *composition* (chip row vs slider) still differs. |
| Component-level idiom: sheet vs popover, dock vs sidebar, peek vs floating panel | **No** | Interaction-model territory. Preserved per Snapseed/photo-first pin. |
| Empty state, copy voice, i18n keys | Aligned, low-priority | Not in current pain; keep aligned to prevent drift. |

## CSS Strategy — Four Buckets

Current inventory:

- `src/modules/raw-processor/raw-lab.css` — 594 lines, ~70 rules.
- `src/modules/raw-processor/components/preview-canvas.css` — 45 lines.
- `src/styles/{index.css, tailwind.css}` — global stack.
- `src/pages/(main)/index.css` — page entry.

Every rule in `raw-lab.css` and `preview-canvas.css` falls into one of four buckets. The pilot processes each bucket differently:

| Bucket | Examples | Action | Why |
|---|---|---|---|
| **A. Token escapees** | hardcoded hex colours, px radius, ms durations, blur values | **Migrate.** Replace with Tailwind utilities that reference theme tokens. | This is the primary source of cross-viewport drift. Token lockdown is the actual remediation. |
| **B. Component shape/layout** | `.raw-tool-surface` padding, border, grid; `.raw-lab-shell` layout | **Migrate.** Move into component `className` strings. Delete the original class. | Component becomes self-describing; token changes auto-propagate. |
| **C. SVG / canvas styling** | `.raw-histogram-channel-{fill,line}-{red,green,blue}`, `.raw-histogram-grid line` | **Keep as CSS, retarget to tokens.** Rewrite values to reference CSS custom properties exposed by the token layer. | Tailwind has limited reach inside SVG. Eliminate drift by tokenising values, not by removing the file. |
| **D. Scrollbar pseudos, resets, globals** | `::-webkit-scrollbar-*`, `.raw-lab *` reset | **Keep as CSS, isolate.** Move into a small dedicated file (e.g. `raw-lab.surface.css`) with a comment marking it intentional vanilla. | Not worth Tailwind-ifying. But should not co-mingle with bucket A debt. |

Expected outcome at end of pilot: `raw-lab.css` reduced to roughly buckets C + D (target shape ≤150 lines, no token literals). This is a directional target, not a gate.

## Radix Consolidation Inside Pilot

Within Look (including Strength):

- `MobileLutBrowser` (718 LOC, hand-rolled sheet) and the desktop Look popover/panel **both consume Radix Dialog and/or Popover primitives**. Differences shrink to trigger shape, content composition, and one of the two motion presets.
- Focus management, escape semantics, scroll lock, and `aria-*` wiring come from Radix. Hand-rolled versions in `mobile/*` are removed.
- Drag-to-dismiss on mobile sheet remains custom (Radix does not own it). It hooks into the same `sheetSpring` preset.

The four cross-cutting primitives (`Chip`, `Slider`, `SegmentedControl`, sheet/popover surface wrapper) land in `src/components/ui/` so both `ControlsPanel` and `MobileLabChrome` import from the same module path.

## Order of Operations (pilot)

1. **Joint visual + CSS audit of Look.** Side-by-side screenshots from each viewport for: Look entry, LUT browsing, Look applied, Strength adjustment, Look reset/clear, Look error state. Each visible divergence is recorded in a single table with three columns: *what differs*, *encoded in TSX className*, *encoded in raw-lab.css*. This determines which file each fix touches.
2. **Lock the 6 token groups** (color, type, radius, spacing, motion, elevation/blur). Use existing Tailwind theme + `src/styles/` — no new files. Bucket A migrations land as a side effect of replacing literals with token references.
3. **Bucket B migration** for Look-touching components. `raw-tool-surface` (only the parts Look uses), the Look popover container on desktop, and the Look sheet container on mobile move to className. Classes deleted from `raw-lab.css` as their last consumer disappears.
4. **Radix consolidation of Look's sheet/popover.** Both viewports route through Radix Dialog/Popover. Hand-rolled focus traps and scroll locks in `MobileLutBrowser` are removed.
5. **Promote 4 shared primitives** (`Chip`, `Slider`, `SegmentedControl`, sheet/popover surface). Look + Strength on both viewports re-compose using these. No other module is migrated in pilot.
6. **Bucket C retargeting + bucket D isolation.** Histogram SVG styles in `raw-lab.css` switch to CSS-variable references. Scrollbar/reset rules move into an explicitly-labelled file.
7. **Reviewer walkthrough.** Take fresh screenshots and verify against the family-resemblance criterion. Note any deferred divergences (Tone, Export, Compare, MoreMenu) as successor work.

Steps 1–2 are sequencing-critical (audit precedes token lock, token lock precedes any className changes). Steps 3–6 can interleave per-component.

## Anti-Patterns / Rejected Approaches

- **One "responsive" component that swaps slider↔chips at a breakpoint.** Tempting and always rots. The two interaction models have different lifecycles (drag handle, focus trap, escape semantics, hover affordance). They share primitives, not composed components.
- **A new `design-system/` package or `tokens.css` file.** Product is too narrow. Tokens land in Tailwind config and `src/styles/`. Primitives land in `src/components/ui/`. No new top-level directory.
- **Anchoring to desktop**: forces mobile back into popover idioms, fights the photo-first spec.
- **Anchoring to mobile**: forces desktop into sheet/dock idioms, wrong for mouse-and-keyboard.
- **Expanding pilot to Tone in the same pass.** Tone has its own subtree (`ToneTool`, `ToneFocusEditor`, `ToneStripPanel`) with its own visual contracts. Folding it in doubles surface area and dilutes the exit criterion. Tone is successor work.
- **Deleting `mobile/`.** The runtime fork at `RawToolSurface.tsx:277` is correct. The contents of each branch just need to stand on the same foundation.
- **Pixel parity.** Not the target. Family resemblance is.
- **Scorch-earth `raw-lab.css` deletion.** Buckets C and D are legitimate vanilla CSS. The pilot reduces, retargets, and isolates — it does not erase.

## Success Criterion (single, qualitative)

A stranger shown one mobile screenshot and one desktop screenshot of `/raw` Look mode would, without prompting, associate them as the same product family. The interaction layouts obviously differ (sheet + dock vs sidebar + popover); the typography, radius, accent, surface treatment, motion vocabulary, and icon language do not.

PR reviewers apply this rubric directly. There is no token-coverage %, no LOC delta gate, no automated visual diff.

## Out of Scope / Successor Work

Once the Look pilot lands and the family-resemblance bar is met, the same template applies to (in suggested order):

1. **Export** — `ExportTool` desktop + `MobileExportPanel` mobile. Smaller surface than Look; mostly a chrome alignment pass once primitives exist.
2. **Compare** — `CompareTool` + `CompareSplitHandle` desktop + `MobileComparePanel` mobile. Has its own interaction model (split handle vs swipe) that should also be preserved.
3. **Histogram** — `HistogramTool` desktop + `FloatingHistogramCard` mobile. Mostly bucket C work in CSS; should be cheap after pilot.
4. **Tone** — `ToneTool` desktop + `ToneFocusEditor` / `ToneStripPanel` mobile. Largest surface, deliberately last.
5. **MoreMenu / chrome edges** — `WorkspaceHeader` desktop + `MobileTopbar` / `MobileMoreSheet` / `MobileMoreMenu` mobile.

Each is a separate spec → plan cycle. None are gated on each other after the pilot's foundation lands.

## Open Questions

- None blocking. The pilot can start as soon as a plan exists.
