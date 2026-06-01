# /raw Tool Panel Redesign

- Date: 2026-05-16
- Status: Aligned, pending nothing — proceeding to plan
- Scope: Information architecture, components, and design-system embedding for the `/raw` desktop & mobile tool panel

## Background & Problem

The `/raw` tool panel (desktop right-side `raw-tool-surface` vertical stack + mobile bottom rail/sheet) is crowded, cramped, and primitive. Root causes:

1. All 7 `ToolSection`s (LUT, Tone, Histogram, Strength, Compare, Export, File Facts) are permanently expanded in a single scrolling list with no hierarchy.
2. Font sizes are uniformly small (0.66–0.86rem), font-weights uniformly 7xx, with `text-transform: uppercase` double-decker eyebrow + title and a hairline divider per section — high visual noise, tight rhythm.
3. `/raw` maintains a parallel design system: `raw-lab.css` / `export-tool.css` / `tools/lut/lut-tool.css` (~2.4k lines) plus a `--raw-*` token set and pervasive hand-written oklch literals, disconnected from the app-wide Radix + `@pastel-palette` Tailwind system.
4. Desktop and mobile each have their own implementation (mobile's 2-tab Style/Export crams LUT+Tone+Histogram+Strength into one sheet); the mental model is forked.

## Core Design Philosophy

Distilled after researching the Anthropic and Snapseed design languages:

- **Anthropic**: warm paper/ink, low chroma, restraint; hierarchy from typography and whitespace rather than lines; quiet UI that recedes so content leads.
- **Snapseed**: the photo is the absolute protagonist; one task at a time, controls surface on demand; large touch targets; the panel does not permanently intrude.

Five operating principles:

1. Photo is the protagonist; the panel recedes — shrink permanent chrome.
2. Progressive disclosure: separate primary controls (direct) from reference info (on demand).
3. Hierarchy comes from typography and rhythm, not dividers — drop the double-decker eyebrow and per-section hairline.
4. Embed into the app-wide design system: Radix primitives carry structure and interaction, Tailwind + Pastel semantic tokens handle presentation, eliminate the parallel CSS.
5. Desktop and mobile are isomorphic: one shared set of tool-card components and state; mobile is the same cards in a sheet.

## Decisions (confirmed with user)

- Refactor boundary: structure + visuals together.
- Approach A: tool cards + progressive disclosure (not Snapseed-style full-screen single-tool, not visual-only reshuffle).
- Warm identity: keep the "darkroom paper/ink" art direction, but express it via a small group of `--color-*` overrides scoped to `.raw-lab` — no more scattered literals.
- Rollout: phased, each phase independently verifiable (lint/test/build/browser).
- Implementation phase brings in the `impeccable` design skill for continuous visual scrutiny.

## Product Boundary Guardrails

- No new adjustments or new panels; the control set is unchanged, only reorganized and re-presented.
- Export's authoritativeness, fail-closed behavior, and the preview/export executor separation are untouched.
- Changes are confined to the UI shell: `ToolSection→ToolCard`, `RawToolSurface` composition, migrating form controls to existing primitives, deleting the 3 CSS files and `--raw-*`.

## 1. Information Architecture

By the workflow `preview → look/LUT → compare → export`, grouped by role:

- Primary controls (default expanded)
  - **Look card**: LUT/look selection + output contract + strength (Strength folded into Look — "which look + how strong" is one thing, removes a card).
  - **Tone card**: 6 sliders, internally split into two groups — basics (Exposure/Contrast) | fine (Highlights/Shadows/Whites/Blacks), separated by whitespace not a line.
- Reference info (default collapsed, header row shows status at a glance)
  - **Histogram card**: collapsed; header row summarizes clipping counts.
  - **Compare card**: collapsed; note + reset.
  - **File Facts card**: collapsed.
- **Export**: not part of the accordion. Desktop: bottom sticky persistent primary action. Mobile: keeps the rail's dedicated entry and long-press quick export.

Per-card default open/closed state is defined in one central place (`Look`, `Tone` open; `Histogram`, `Compare`, `FileFacts` collapsed).

## 2. ToolCard Component (replaces ToolSection)

- Built on `~/components/ui/accordion` (the Radix Accordion wrapper, already includes motion + `Spring`).
- `Accordion` root `type="multiple"`, controlled; the open set is stored in a persisted jotai atom (via a `~/lib/jotai` helper), keyed per `cardId`, surviving reload.
- Single-line title (drop the uppercase double-decker eyebrow); header row holds chevron, title, and a trailing meta slot (current LUT name / Tone "adjusted" chip / clipping counts).
- Collapse, `aria-expanded`, `aria-controls`, keyboard reachability, collapsed content removed from tab order — all provided by Radix Accordion, no longer hand-written.
- Expand animation reuses the Accordion's built-in motion + `Spring`; `prefers-reduced-motion` handled by its existing logic.
- All existing i18n keys retained; with the title reduced to a single line, the aria-label still derives from the title.
- `Export` does not go through the Accordion; it is the third row of the surface grid as a persistent block.

## 3. Design-System Embedding: Radix-first + Tailwind Finishing

Goal: eliminate the parallel design system, merge into the app-wide Radix + Pastel/Tailwind.

- Radix-first (structure & interaction delegated to primitives)
  - ToolCard → `ui/accordion`
  - Tone 6 sliders → `ui/slider` (Radix Slider)
  - Strength → `ui/segment`
  - LUT browser/dialog → `ui/dialog`
  - Buttons → `ui/button` / `IconButton` / `MotionButton`
  - label/switch → corresponding `ui` primitives
  - Histogram stays a visx SVG (no matching primitive); only its container and strokes go through tokens
- Tailwind finishing (presentation via utilities + semantic tokens)
  - Colors use Pastel semantic tokens: `bg-material-*` / `text-text` / `text-text-secondary` / `border-border` / `bg-fill-*` / `text-accent`
  - Font sizes use the global type scale: `text-callout` / `text-headline` / `text-title3` / `text-footnote` etc. (scaled up one notch overall, weight capped ~600, relaxed line-height)
  - Radius `rounded-md/lg`, standard spacing scale; component variants via `cva` / `clsxm`
- Warm identity preserved
  - Define a small group of `--color-*` overrides scoped to `.raw-lab` (e.g. `--color-background→warm paper`, `--color-text→ink`, `--color-accent→green`, warmed material/border); every element otherwise consumes Pastel semantic tokens.
  - Local dark blocks (dark darkroom stage, histogram dark base, etc.) are expressed via these scoped tokens, not literals.
- Deletion: `src/modules/raw-processor/raw-lab.css`, `components/tools/export-tool.css`, `components/tools/lut/lut-tool.css`, and all `--raw-*`.
  - The few things not expressible as utilities (compare split handle transform math, sheet drag, histogram SVG strokes) stay as minimal scoped style or motion/inline, all consuming tokens, introducing no new `--raw-*` system.

## 4. Desktop Layout

- `.raw-tool-surface` → Tailwind layout: width `minmax(360px,420px)`; grid two rows `1fr / auto` — card scroll area + bottom sticky Export block (the top app title is still owned by `WorkspaceHeader` outside the surface, not in this grid).
- Drop the per-section `border-bottom`; cards separated by whitespace rhythm, borderless and quiet; an expanded card gets only a faint top hairline (`border-border`), a collapsed card is a single quiet title row.
- Scrollbar uses the `tailwind-scrollbar` plugin classes, replacing hand-written `::-webkit-scrollbar`.

## 5. Mobile Sheet (isomorphic with desktop)

- The bottom rail becomes: entry one opens the **unified card sheet** (same ToolCard accordion as desktop, shared `renderCards()`), entry two is the Export primary action (long-press quick export retained).
- The sheet content is the card accordion scroll area; touch targets ≥44px guaranteed via standard spacing classes.
- Sheet container/backdrop uses `ui/dialog` or the existing sheet primitive + Tailwind; drag-to-dismiss uses motion (reusing `Spring`), `prefers-reduced-motion` gating retained, no longer relying on `@media` raw CSS.

## 6. Motion & Accessibility

- Reuse `~/lib/spring` presets and the existing Accordion / MotionButton motion; chevron rotates with spring, `whileTap` on press.
- Keyboard reachable, collapsed content out of tab order, focus-visible ring via the global `focusRing`/`outline-ring`.
- All existing aria semantics and i18n retained.

## 7. Phased Implementation

1. Phase 1: introduce `ToolCard` (on `ui/accordion`) + persisted jotai open state + the `.raw-lab`-scoped `--color-*` warm theme overrides. `RawToolSurface` switches to ToolCard composition, Export moves to the persistent bottom block. Desktop and mobile share `renderCards()`.
2. Phase 2: migrate primary controls to primitives + Tailwind — Look (incl. Strength→`segment`), Tone (→`slider`), Export (→`button`).
3. Phase 3: migrate reference cards (Histogram container, Compare, File Facts, LUT browser→`dialog`); delete the 3 CSS files and all `--raw-*`; clean up the mobile `@media` raw CSS.

Each phase independently passes `pnpm lint`, `pnpm test:run`, `pnpm build`, with browser validation of affected `/raw` interactions and mobile/WebKit behavior.

## 8. Testing

- `ToolSection.test.tsx` → `ToolCard.test.tsx`: renders title, toggles `aria-expanded`, persists open state, default open/closed, `prefers-reduced-motion` path.
- Update `RawToolSurface.test.tsx`, `__tests__/workspace-ui.test.tsx`: assert desktop card stack and mobile sheet share the same card set, Export persistent block present, mobile rail entry, collapse defaults.
- Existing `ExportTool.test.tsx`, `ToolSection.test.tsx` etc. updated with migrated selectors.
- Browser validation: golden path (load → Look/LUT → Tone → compare → export) plus mobile sheet collapse interaction and WebKit.

## Risks

- Deleting ~2.4k lines of CSS + rewriting ~15 components is a large blast radius — mitigated by phasing + full verification each phase.
- The warm theme override must cover all local dark blocks (darkroom stage, histogram base, compare label); Phase 1 establishes the full token mapping and audits each one to avoid leftover literals.
- Controlled + persisted Radix Accordion must coordinate with the existing `useToolMotion` stagger to avoid first-render jitter.
