# RAW Lab tool-section eyebrow hierarchy — design

Date: 2026-05-15
Surface: `/raw` (RAW lab), desktop + mobile sheet
Source: `LumaForge Design System-handoff.zip` → `ui_kits/raw-lab`

## Context

The handoff bundle was distilled from this codebase, so its `shared.css` is ~90%
identical to the live `src/modules/raw-processor/raw-lab.css`. The one meaningful
visual refinement the mockup introduces is the **tool-section eyebrow hierarchy**:
every tool section gets an UPPERCASE deep-green kicker *above* a slightly larger
title — the "eyebrow + title row" motif `DESIGN.md` calls a signature pattern.

User decisions:

- Intent: apply the mockup as a judgment-based refinement (not strict pixel diff).
- Scope: RAW lab desktop + RAW lab mobile + design tokens.
- Eyebrow text: full i18n (add missing keys to `en.json` and `zh-CN.json`).
- Include the two implied CSS cleanups.

## Problem

`ToolSection` accepts an `eyebrow` prop, and 4 tools already pass it (Tone, Export,
Compare, LUT). But:

1. `ToolSection.tsx` renders `eyebrow` as a plain `<p>` *after* the `<h2>`, so it
   reads as a caption, not a kicker.
2. There is no `.raw-tool-eyebrow` style; the section `<h2>` is undersized
   (`0.78rem` vs the mockup's `0.86rem`).
3. Histogram, Strength, and File facts pass no eyebrow at all (no i18n keys exist).
4. The live CSS has a conflicting duplicate `.raw-strength-control button` rule
   block, and Tone's `<output>` has no `font-size` (the mockup sets `0.76rem`).

## Design

Desktop and the mobile bottom sheet render the same tool components, so the mobile
sheet inherits the fix automatically — no mobile-specific markup change.

### 1. `components/tools/ToolSection.tsx`

Wrap eyebrow + title in a stacked `<div>`; render the eyebrow first with
`className="raw-tool-eyebrow"`, then the `<h2>`. Preserve the existing
`aria-label={title}` and `className` passthrough.

### 2. `raw-lab.css`

- Restructure `.raw-tool-section-heading` so the eyebrow→title pair stacks
  vertically (the heading flex row keeps `justify-content: space-between` for any
  trailing slot).
- Add `.raw-tool-eyebrow`: `font-size: 0.66rem`, `font-weight: 780`,
  `text-transform: uppercase`, `letter-spacing: 0`, `margin: 0 0 2px`,
  `color: var(--raw-green-deep)`.
- Change `.raw-tool-section-heading h2` `font-size` `0.78rem` → `0.86rem`
  (weight stays `760`).
- Add `.raw-tone-control output { font-size: 0.76rem }`.
- Remove the conflicting duplicate `.raw-strength-control button` block
  (the early rule that gives individual buttons a `border-radius: 8px` and full
  border, which fights the real segmented-control rule later in the file).
  The single segmented-control definition (border container + `border-right`
  dividers, square buttons) is the one that stays.

### 3. Wire missing eyebrows

Pass `eyebrow={t(...)}` at:

- `components/tools/HistogramTool.tsx` → `raw.histogram.eyebrow`
- `components/tools/FileFactsTool.tsx` → `raw.fileFacts.eyebrow`
- `components/RawToolSurface.tsx` (inline Strength `ToolSection`) →
  `raw.strength.eyebrow`

### 4. i18n keys

Add to both `src/locales/en.json` and `src/locales/zh-CN.json`:

| Key                   | en          | zh-CN        |
| --------------------- | ----------- | ------------ |
| `raw.histogram.eyebrow` | HQ preview  | 高质量预览   |
| `raw.strength.eyebrow`  | Look        | 风格         |
| `raw.fileFacts.eyebrow` | Source      | 来源         |

(Existing eyebrow keys for Tone/Export/Compare/LUT already exist in both files.)

## Out of scope / flagged

- **Design tokens: no change.** The lab's `--raw-*` values already exactly match
  canonical `colors_and_type.css`. Restructuring into a shared token layer would
  touch the marketing surface (explicitly out of scope) and is scope creep.
- **Compare labels stay reveal-on-drag.** The mockup shows them always visible;
  the live `opacity:0` → `[data-raw-compare-dragging]` behavior is a deliberate
  existing refinement and is kept.

## Verification

- `pnpm lint`
- `pnpm test:run`
- `pnpm build`
- Browser check of `/raw` at desktop width and `<640px`: confirm the eyebrow
  kicker renders above each tool title in deep green uppercase, and that it also
  appears in the mobile bottom sheet (Style + Export tabs).
