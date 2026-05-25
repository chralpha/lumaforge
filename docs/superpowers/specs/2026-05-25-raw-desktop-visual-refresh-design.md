# /raw Desktop Visual Refresh

- Date: 2026-05-25
- Status: Spec consolidated — awaiting plan
- Scope: Every desktop surface inside `/raw`. Concretely: `RawToolSurface.tsx` desktop branch (`isMobileViewport === false`, lines 325–336) and every component it transitively renders — `WorkspaceHeader`, `ToolCard` / `ToolCardStack`, `ToneTool`, `HistogramTool`, `CompareTool`, `FileFactsTool`, `ExportTool`, `LutContractTool`, `LUTContractBrowser`, `LUTProfileButton`, `LUTOutputOptionButton`, `LutBrowserDialog`, `IntensityChips`, `ControlsPanel` (currently exported but unused), and the shared primitives those reach into — `Button`, `Input`, `Chip`, `Accordion`. Does not touch the mobile branch (`src/modules/raw-processor/components/mobile/*`), routing, color pipeline, export authority, runtime, or any non-`/raw` route.
- Predecessor work: `2026-05-21-mobile-desktop-visual-consistency-design.md` (mobile↔desktop foundation pilot). This spec **reframes** the desktop half of that work and leaves the mobile half untouched. See *Relationship to 05-21* below.

## Background & Problem

Two rounds of side-by-side investigation against the live code surfaced a consistent diagnosis: the `/raw` desktop tree reads as a 2014-era pro tool, while mobile reads as a 2024 photo app. Mobile is *not* the problem to fix — it landed in a good place. Desktop is the one that needs work, and the work is **not** "match mobile." Both viewports must preserve their own composition idioms (sidebar+accordion vs photo+dock) per the photo-first interaction-model pin from `2026-05-18-mobile-raw-lab-photo-first-design.md`.

The user's felt-pain has three concrete encoded sources, each verifiable in source:

### 1. Color: "feels like old display tech"

LumaForge and Anthropic both use warm-cream palettes. Anthropic feels modern; LumaForge desktop reads as Kodak-print + CRT-era screenshot. The palette itself is fine — DESIGN.md's OKLCH values are well-chosen. The encoding of *contrast relationships* is what dates it. Three dials, all measured against `src/styles/tailwind.css:169–208`:

| Dial | Encoded today | Modern warm-palette reference | What the gap signals |
|---|---|---|---|
| Body text ↔ background | `lf-ink 0.180 L` on `lf-paper 0.964 L` ≈ **12–13:1** | Anthropic body ≈ 8:1; Linear body ≈ 7:1 | 12:1 is the contrast of black ink on paper. The eye reads "print artifact," not "screen UI." |
| Hairline ↔ surface | `--color-border = lf-hairline 0.74 / 0.62` on `lf-paper 0.964` → ~**12% L delta** | Linear hairline ≈ 4–6% delta; Anthropic often omits the line entirely | Every box is explicitly *drawn*. That is how 1998–2010 desktop GUIs partitioned surfaces. |
| Accent chroma ↔ surface chroma | `lf-green 0.150 C` fill on `lf-paper 0.018 C` → chroma ratio **8.3×** | Linear primary blue ≈ 0.085 C; Anthropic accents ≈ 0.07–0.09 C | High chroma fills on low-chroma warm paper = the visual fingerprint of CMYK print and 8-bit sRGB CRT screenshots. |

DESIGN.md already provides the softer endpoints (`lf-paper-high`, `lf-paper-warm`, `lf-green-deep 0.105 C`, `lf-green-soft`, `lf-amber-soft`); the desktop tree never reaches for them and concentrates on the four "hard" tokens (`lf-paper`, `lf-ink`, `lf-hairline`, `lf-green`).

### 2. Surfaces: "stiff borders and buttons"

The LUT contract browser was the user-cited example; the pattern is everywhere. Three structural moves recur:

- **Outlined-rows on same-colored container.** `LUTProfileButton.tsx:32` renders each row with `border border-lf-hairline bg-lf-paper`. The dialog around it is `bg-lf-paper/95` (`LutBrowserDialog.tsx:135`). Row and container are the same color; the row exists only because a 12%-delta line is drawn around it. Stacked in a `sm:grid-cols-2` grid (`LUTContractBrowser.tsx:261, 284, 314, 333`) this becomes a 2×N table of outlined cells — the canonical macOS Mail 1.0 list look.
- **Two parallel outlined boxes as a tab strip.** `LUTContractBrowser.tsx:217–235` puts the Input/Output tabs as two equal `min-h-8 rounded-lf-control border border-lf-hairline` buttons side by side. This is outlined-box-grid in miniature.
- **Two token vocabularies inside one dialog.** `LUTProfileButton.tsx:32` uses `border-lf-hairline / bg-lf-paper / text-lf-body / border-lf-amber/45`. The sibling `LUTOutputOptionButton.tsx:27` uses `border-border / bg-background / text-callout / border-yellow-600/30` — generic app tokens and raw Tailwind yellow. The same dialog renders both, so the two halves quietly disagree on color.

### 3. Smoking gun: the Button primitive is a Tremor template

`src/components/ui/button/Button.tsx:1` opens with `// Tremor Button [v0.2.0]`. The entire file uses generic app tokens (`bg-background`, `border-border`, `bg-fill`, `bg-accent`) and **black** `shadow-sm` (Tailwind default `0 1px 2px 0 rgb(0 0 0 / 0.05)`) layered on warm paper. WorkspaceHeader's Replace/Reset/Export/More row, ControlsPanel's secondaries, ToneTool's reset, ExportTool's primary all consume it. Mobile components quietly **avoid** this Button and hand-roll their own `inline-flex min-h-10 rounded-lf-pill border-lf-amber/35 bg-lf-amber/12 …` — which is part of why mobile escapes the old-school feel.

This is the largest single leverage point in the desktop tree: the Tremor template is the genericizing layer underneath dozens of surfaces.

### What is *not* broken

- The interaction model (sidebar + accordion + persistent export rail). The user explicitly does not want IA changes; this is product chrome, not aesthetic debt.
- The mobile branch. It already adopted `lf-*` + `on-photo` and reads as a modern photo app.
- The DESIGN.md palette and typography scale. The numbers are right; their *role assignment* is what needs work.
- Radix, Tailwind, `LazyMotion`, `motion/react`, `src/lib/spring`. The stack stays.
- The four shared primitives the 05-21 spec promoted (`Chip`, `Slider`, `SegmentedControl`, sheet/popover surface). `Chip` is already `lf-`-aware and surface-typed; the others should be reused where they apply.

## Feel Target

**轻松但可靠 / relaxed but trustworthy.**

Translated into design dials:

- **Trustworthy** = the contract rail stays legible, type is still confident, accents land at semantic moments, the export-authority chrome is still distinct from preview chrome. Nothing about the calibrated-photo-lab metaphor changes.
- **Relaxed** = lower body contrast, hairlines that often aren't there, raised surfaces described by *light* (inner highlight + ambient shadow) rather than by *drawn borders*, accent chroma sits softer except at action moments.

The aesthetic reference is the *contrast-handling discipline* of Linear and Anthropic — not their palettes, not their componentry. We keep Lab Paper / Ink / Amber / Green / contract-rail vocabulary verbatim.

## Non-Negotiables

From CLAUDE.md, DESIGN.md, PRODUCT.md, and durable memory:

- **Design language is preserved.** OKLCH values in `src/styles/tailwind.css:169–208`, the `lf-*` token names, the typography scale, the "calibrated photo lab" north star, and the contract-rail / amber-explains-color / green-means-go rules all stay. No renames, no removals, no new color families.
- **No new package, no `design-system/` directory, no `tokens.css` file.** Refresh lands in existing `src/styles/`, `src/components/ui/`, and `src/modules/raw-processor/components/`. Product is too narrow for a system spinoff.
- **Mobile branch is untouched.** Every component under `src/modules/raw-processor/components/mobile/*` and the mobile override block in `raw-lab.css` (lines 358–413) is out of scope.
- **Interaction model and information architecture are untouched.** `WorkspaceHeader` stays a top bar. `RawToolSurface` desktop stays an aside+accordion. `ToolCardStack` stays a Radix Accordion of five tools. `LUTContractBrowser` stays a popover anchored to its trigger. Export rail stays pinned at the bottom of the aside.
- **Radix is the primitive layer; Tailwind is the finishing layer; no fresh isolated vanilla CSS blocks.** Existing `raw-lab.css` C/D-bucket vanilla rules (per 05-21) are still grandfathered.
- **The Tremor Button template gets replaced, not augmented.** Half-measures keep the genericizing layer alive. The replacement is a LumaForge-native Button system that consumes `lf-*` tokens directly.
- **Color pipeline / preview executor / export-authority semantics are untouched.** This is a visual refresh, not a behavior change.
- **`m` from `motion/react` inside the existing `LazyMotion`; presets from `src/lib/spring`.** No bespoke spring values.
- **Generated files (`src/generated-routes.ts`) not touched.**

## Decisions

### Anchoring move: redefine *role*, not *value*

Every `lf-*` token keeps its OKLCH value. What changes is the **role table** — when each token is appropriate. This is the entire refresh in one sentence: same paint, different rules about where to apply it.

### The three dial recalibrations are the spine

| Dial | From | To | Why |
|---|---|---|---|
| Body text contrast | `text-lf-ink` 12–13:1 default | `text-lf-ink/[0.80]` ≈ 9:1 default; `text-lf-ink` reserved for high-emphasis headings, primary-action labels, and currently-selected values | Drops the "ink on paper" print signal without sacrificing WCAG AA |
| Hairline strength | `border-lf-hairline` (12% L delta) on most surfaces | `border-lf-ink/[0.06]` (≈ 5% delta) where a border is genuinely needed; **most** borders removed and replaced by surface-tone delta (`lf-paper` → `lf-paper-high` → `lf-paper-warm`) | Stops "drawing every box." Lift comes from tone or light. |
| Accent chroma in fills | `bg-lf-green` (0.150 C) as default selected/active fill | `bg-lf-green/[0.08]` tint + `text-lf-green-deep` (0.105 C) for label; `bg-lf-green` solid reserved for the single export primary action and confirmed-safe contract chips | Removes the Kodak-print signal; keeps the green-means-go rule but pays it out at the *one* moment that matters |

### Surface depth model: light describes lift, not lines

Every raised surface (popovers, the aside sidebar, ToolCard expanded body, export rail) gains:

1. A one-pixel inner highlight at the top edge: `inset 0 1px 0 oklch(0.99 0.01 86 / 0.55)`.
2. The existing warm-tinted ambient shadow (`shadow-lf-popover`, `shadow-lf-photo`) — these are already correctly tinted and stay.
3. A surface fill drawn from the `lf-paper` family (`paper-high` for primary raised, `paper-low` for recessed wells, `paper-warm` for proof bands).

Replaces the current "single warm-paper gradient + crisp hairline" model. The hairline becomes optional rather than structural.

### Token role re-allocation

Existing tokens, new role rules. This is the canonical reference for the refresh.

**Surfaces (light side):**

| Token | New role |
|---|---|
| `lf-paper` | Page-level background only. Not a fill for raised surfaces. |
| `lf-paper-high` | Primary raised surfaces — aside sidebar interior, popover bodies, ToolCard expanded panel. The default "card" surface. |
| `lf-paper-low` | Recessed wells — search input interior, hover state of rows on `lf-paper-high`. |
| `lf-paper-warm` | Proof bands and contextual highlights — selected ToolCard accordion section, contract-rail container. |

**Text emphasis:**

| Token | New role |
|---|---|
| `lf-ink` (solid) | High-emphasis only: panel titles, primary action labels, currently-selected option labels, FileFacts numeric readouts. |
| `lf-ink/[0.80]` | Body text default. |
| `lf-ink-soft` (existing) | Secondary copy, descriptions, meta. |
| `lf-ink/[0.55]` + `tracking-tight` | Eyebrow / section labels (replaces the current `text-lf-label uppercase` shouting at full opacity). |

**Borders:**

| Token | New role |
|---|---|
| `lf-ink/[0.06]` | The default hairline where a hairline is *needed* (popover edge, search input edge inside a recessed well). |
| `lf-hairline` (current 0.62 alpha) | Reserved for *structural* separators that must read across multiple meters of layout — the aside ↔ preview seam, the export rail top edge. Not used for individual rows or buttons. |
| Surface delta | Default. Most "box-shaped" elements stop having a border at all. |

**Accent usage:**

| Use case | Token combination |
|---|---|
| Selected row (LUT option, list item) | `bg-lf-green/[0.08]` + 2px-wide left edge `bg-lf-green` + `text-lf-green-deep` |
| Hover row | `bg-lf-ink/[0.04]` + `text-lf-ink` |
| Confirmed-safe chip (existing pattern) | Existing `Chip` `green` paper variant — unchanged |
| Primary action (export, confirm) | `bg-lf-green` solid + `text-lf-ink` (already correct in DESIGN.md; current Tremor Button uses `text-background` which is wrong) |
| Secondary action | `bg-lf-paper-high` + `border-lf-ink/[0.06]` + `text-lf-ink/[0.80]`; hover lifts to `lf-paper-low` |
| Attention / pending contract | `bg-lf-amber-soft/[0.40]` + `text-lf-ink` + leading `AlertTriangle` in `lf-amber` |
| Focus ring | 2px `lf-green` outline at `outline-offset-2` (existing pattern is correct) |

**Motion contract:**

| State change | Treatment |
|---|---|
| Hover (any interactive surface) | 120ms ease-out fill+text transition; no translate, no shadow appearance |
| Active tap | Existing `active:scale-[0.98]` is fine; keep |
| Popover/dialog enter | Existing `surfaceFade` preset from `src/lib/spring` (still to be added per 05-21) |
| Accordion section expand | Existing Radix Accordion default with `Spring.presets.smooth` content transition |

`hover:-translate-y-px hover:shadow-sm` is removed everywhere. It's a 2018 affordance that signals "this button can be lifted off the page," which is exactly the skeumorphic register the refresh is trying to leave behind.

### Component refresh targets

The list of components the refresh touches and what *shape* changes for each. No "how" — that belongs in the plan.

| Component | Refresh shape |
|---|---|
| `Button` (`src/components/ui/button/Button.tsx`) | Replace Tremor template with LumaForge-native variants consuming `lf-*` tokens directly. Primary uses solid `lf-green` + `lf-ink` text. Secondary uses paper-high surface + soft `lf-ink/[0.06]` border. Light/ghost use no border, hover via fill only. All shadows warm-tinted (use `lf-paper-high` family, never raw Tailwind `shadow-sm`). No `hover:-translate-y-px`. |
| `Input` | Borderless inside recessed wells (where it lives in popovers); soft `lf-ink/[0.06]` border when free-standing. Focus ring stays green. |
| `Chip` | Verify the existing primitive — already `lf-`-aware and `surface`-typed. Refresh-time check: paper variants should pull from the new role table (e.g. `tone='neutral'` paper should be `bg-lf-paper-low` not `bg-lf-paper`). |
| `Accordion` (`src/components/ui/accordion`) | Remove default borders between items; section separation becomes typographic + spacing only. Open state may use a `bg-lf-paper-warm` proof band on the trigger row. |
| `WorkspaceHeader` | Soften the bottom `border-b border-border` to `border-lf-ink/[0.06]`. Locale toggle and secondary buttons go through the refreshed Button. Background shifts from `bg-material-opaque/85 backdrop-blur-background` to `bg-lf-paper-high` (the blur is for visual depth that the new surface model handles via tone). |
| `RawToolSurface` aside (desktop branch) | Replace the inline gradient (`bg-[linear-gradient(180deg,oklch(0.942_0.024_86),oklch(0.91_0.03_84)),var(--color-fill)]`) with `bg-lf-paper-high` + an inner highlight via a wrapped `before:` element. The `border-l border-border` seam becomes `border-l border-lf-hairline` *kept* (this is one of the structural separators that earns a hairline). |
| `ToolCard` / `ToolCardStack` | Remove the `data-[state=open]:border-t data-[state=open]:border-border` rule. Trigger row uses `text-lf-ink` (closed) and `text-lf-ink` + `bg-lf-paper-warm` (open). Meta text shifts to `text-lf-ink/[0.55] tracking-tight`. Content padding stays. |
| `ToneTool` / sliders | Field labels move to the new eyebrow style. Numeric readouts use `text-lf-ink` (high-emphasis). Section spacing increases to give the panel "room to breathe." |
| `HistogramTool` | No structural change. Histogram SVG is bucket-C per 05-21 and migrates via that workstream. |
| `CompareTool` | Reset button goes through refreshed Button (secondary). No other shape change. |
| `FileFactsTool` | Numeric/value cells use `text-lf-ink`; field labels use the new eyebrow style. |
| `ExportTool` (and the persistent rail wrapper) | Primary export button is the single place `bg-lf-green` solid appears at full chroma. Surrounding rail surface uses `lf-paper-warm` to read as a proof band, with a 1px top hairline (`lf-hairline` — structural). |
| `LutContractTool` | Surface refreshed via the role table. No structural change. |
| `LUTContractBrowser` | Three changes: (a) the two-tab strip becomes a single segmented control with a sliding indicator (Radix `Tabs` + motion `layoutId` or via the `SegmentedControl` primitive from 05-21 if it lands first); (b) the search `Input` becomes borderless inside the popover well; (c) the two-column grid of options is allowed but the *items* lose their borders per the next row. |
| `LUTProfileButton`, `LUTOutputOptionButton` | Consolidate to one component (or to a shared internal). Row treatment: no border by default; hover `bg-lf-ink/[0.04]`; selected `bg-lf-green/[0.08]` + left 2px `bg-lf-green` accent + `text-lf-green-deep`. Highlighted (suggested) state uses `bg-lf-amber-soft/[0.40]` background with no border. Existing `text-callout` / `border-yellow-600/30` generic tokens in `LUTOutputOptionButton` are deleted. |
| `LutBrowserDialog` | Popover body: `bg-lf-paper-high` + inner top highlight + `shadow-lf-popover`. The outer `border border-lf-hairline` shrinks to `border-lf-ink/[0.06]`. The close `X` button goes through refreshed Button. The scrim `bg-lf-paper/35 backdrop-blur-sm` is fine as is — scrim is the one place blur stays. |
| `IntensityChips` | Promote to use the shared `Chip` primitive with `tone='green'` selected / `tone='neutral'` rest. The current hand-rolled `rounded-full bg-accent` becomes the chip primitive. |
| `Dropzone` (LUT) | Refresh outline to dashed `border-lf-ink/[0.12]` (still soft) with `bg-lf-paper-low` recess. Active drag state lifts to `bg-lf-green/[0.06]` + dashed `border-lf-green/[0.45]`. |
| `Divider` | Switches default from `border-border` to `border-lf-ink/[0.06]`. |
| `ControlsPanel` (currently unused per `RawToolSurface`) | Confirm dead status (`grep ControlsPanel src` shows only its own self-export). If dead, delete during the refresh — keeping it forces maintaining two desktop layouts. |

### CSS-side scope

This refresh is **finishing-layer**, not structural. Vanilla CSS in `raw-lab.css` is mostly out of scope — it lives in 05-21's bucket-C/D categorization. Three exceptions:

- The top of `raw-lab.css` (lines 6–32) defines `--color-border`, `--color-text-tertiary`, `--color-fill-secondary` etc. as oklch literals or transforms of `lf-*`. Several of these need to soften to match the new role table — e.g. `--color-border` becomes `oklch(from var(--color-lf-ink) l c h / 0.06)` instead of `oklch(from var(--color-lf-hairline) l c h / 0.62)`.
- `raw-progress-overlay` / `raw-progress-panel` surfaces (lines 264–311) should adopt the inner-highlight motif so the progress panel feels like the same family as the refreshed popovers.
- The mobile override block (lines 358–413) stays exactly as is — out of scope.

## Relationship to 05-21

`2026-05-21-mobile-desktop-visual-consistency-design.md` framed the divergence as "two trees on no shared foundation" and prescribed shared primitives + token lockdown + a Look pilot on both viewports. Investigation since then has shifted the picture:

- Mobile already adopted `lf-*` + `on-photo` thoroughly. It does not need a refresh.
- Desktop is encoded against **pre-`lf-*` generic tokens** (Tremor Button, `text-text` / `text-callout`, `border-border`, `bg-background`) and against the **hardest** points in the `lf-*` palette (saturated `lf-green` fills, full-opacity `lf-ink` body text, full-opacity `lf-hairline` borders). Desktop's "old school" feel comes from these two encoding habits, not from missing foundation work.
- The four shared primitives 05-21 promoted are still useful — `Chip` is already in place; `SegmentedControl` is wanted here for the LUT tab strip. Adopting them is part of this refresh, not separate from it.

This spec therefore:

- **Replaces** the desktop half of the 05-21 pilot. The "shared foundation" framing is downgraded: foundation work continues but is not the headline lever.
- **Leaves intact** the mobile half and the bucket-A/B/C/D CSS migration plan from 05-21. Those workstreams continue.
- **Drops** "family resemblance" as the exit criterion for desktop. The new criterion is the *feel target* below — which subsumes family resemblance (mobile is the family resemblance target by default since it is already refreshed) but goes beyond it.

## Anti-Patterns / Rejected Approaches

- **Importing mobile's `lf-on-photo` darkroom surfaces into desktop.** The desktop has no photo backdrop. The `on-photo` palette only works against the dark full-bleed image. On a light paper surface it reads as a misplaced overlay.
- **Inverting desktop to dark mode.** DESIGN.md commits to the calibrated paper lab. A "darkroom desktop" would break the brand and replicate the very anti-reference PRODUCT.md flags: *"Do not mimic a professional grading-suite interface with dark panels, dense node graphs, scopes, and unlimited knobs."*
- **Adding glassmorphism / backdrop-blur as a modernness shortcut.** Banned by CLAUDE.md and impeccable's absolute bans. The scrim's existing `backdrop-blur-sm` is the only allowed instance and is purposeful.
- **Side-stripe borders to signal selected state.** Banned by impeccable. The selected row affordance is a 2px left edge that is the same width as the icon column — read as a *gutter accent*, not as a side stripe.
- **Adopting Linear's palette or component library.** We borrow only the *contrast-handling discipline*. Lab Green stays green; Lab Paper stays warm; amber stays amber.
- **Replacing the Accordion + sidebar composition with a mobile-style photo-first overlay on desktop.** That is interaction-model territory and is pinned out of scope. Desktop earns its "modern" feel through finishing-layer treatment, not IA inversion.
- **Renaming or removing `lf-*` tokens.** The role table changes; the names and OKLCH values do not.
- **Splitting the refresh into per-component PRs that each ship to main individually.** The dial recalibrations (contrast, hairline, chroma) need to land together — half-applied they look like bugs.
- **Keeping the Tremor Button "for now."** It is the largest single source of the genericizing pull on the desktop tree and must be replaced as part of this refresh, not deferred.

## Success Criterion

A reviewer shown desktop `/raw` (with a RAW loaded, in Look mode, with the LUT contract browser open) without prompting would describe it as:

> "Feels like a clean modern photo lab. Reads as the same family as Linear or Anthropic in restraint, but with its own warm-paper identity. Doesn't feel like a 2014 raw editor and doesn't feel like a generic SaaS template either."

Equivalent operational checks:

- No "outlined-box-grids that read as cells in a frame." Open the LUT contract browser and rows are differentiated by hover/selected fill, not by a drawn border around each.
- Body text reads comfortably for 10 minutes without the "newsprint" punch.
- The eye is drawn to one or two accent moments per screen (the export button; the selected contract chip), not to a dozen.
- Looking at a screenshot, no element shouts "Tremor template" or "Material Design default chip."
- The desktop and mobile screenshots no longer feel like two products — the 05-21 family-resemblance bar is met as a side effect, not as the goal.

There is no token-coverage %, no LOC delta, no automated visual diff gate. Review is qualitative.

## Out of Scope / Successor Work

- **Mobile `/raw` branch.** Already on its own modern trajectory; no edits.
- **Marketing pages**, landing, brand surfaces. Different register (brand vs product per impeccable). Separate spec if those need work.
- **Color pipeline, export authority, preview executor.** Not visual.
- **Histogram SVG style retargeting.** Continues under 05-21's bucket-C workstream.
- **Tone tool deep redesign.** The refresh touches its surface treatment via the role table, but Tone's information architecture and slider IA stay as-is (Tone is the largest remaining surface and was the next-up successor in 05-21 — keep that ordering).
- **`MoreMenu` / chrome edges.** Listed in 05-21 successor work; same here.
- **A `SegmentedControl` primitive.** If 05-21 lands it first, this refresh consumes it; if not, the refresh hand-rolls the LUT tab strip and the primitive lands later as extraction.

## Open Questions

1. **`ControlsPanel.tsx` deletion vs rescue.** `grep ControlsPanel src` shows only its own self-export. Confirm dead and delete during the refresh, or rescue it as the canonical lf-aware desktop reference? Recommendation: delete; it's a fossil from before the `ToolCardStack` design.
2. **Scope of Button replacement.** The refreshed Button is `/raw`-driven but `Button` is shared app-wide. Does the replacement (a) live alongside Tremor as a parallel `lf-*` variant family used only in `/raw`, or (b) replace Tremor wholesale across the app? Recommendation: (b), with a one-time audit of non-`/raw` usages to verify no surprises. Defer if non-`/raw` consumers are non-trivial.
3. **Inner-highlight implementation.** A pseudo-element `::before` with `inset 0 1px 0 …` is the cleanest, but means tweaking each surface's element structure. Alternative: a small utility class or a Tailwind theme `boxShadow` token that combines `shadow-lf-popover` + inner highlight. Recommendation: utility-class approach via Tailwind theme, applied as a single className like `shadow-lf-lift`.
4. **`WorkspaceHeader` backdrop-blur removal.** Currently `bg-material-opaque/85 backdrop-blur-background`. New role table says solid `lf-paper-high`. The blur is currently doing real work over the preview when scrolled — verify that with the new surface model nothing visually breaks at the header/preview seam.
5. **Plan boundary.** This spec is intentionally not a plan. The successor planning step needs to decide order of landing (Button first vs role-table-CSS first vs LUTContractBrowser as the demo case) and whether to land behind a feature flag for staged review.
