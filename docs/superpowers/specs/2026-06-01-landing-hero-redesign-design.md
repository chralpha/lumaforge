# Landing Hero Redesign — Design

- **Date:** 2026-06-01
- **Status:** Approved (design); pending implementation plan
- **Branch:** `feat/landing-hero-redesign` (to create)
- **Register:** marketing (LumaForge `/`)
- **Scope:** Hero section only. The five sections below the hero
  (positioning, proof, pipeline, workflow, luts, final) are not changed.

## 1. Problem

The first block of the landing page is the highest-attention surface on the
site, and it currently reads as broken and confused:

- **Broken visual dependency.** The right-side compare card at
  `src/pages/(main)/index.css:259` paints the "finished" half of the split with
  a remote Unsplash URL
  (`https://images.unsplash.com/photo-1500530855697-b586d89ba3ee...`). In any
  environment where that asset does not load — offline, restrictive CSP,
  hotlink protection, image proxy failure — the right half goes blank and the
  compare card looks structurally collapsed. This also contradicts the product
  position of "browser-local, no upload, no external dependency."
- **Duplicated central metaphor.** The hero already paints
  `public/og-raw-preview.svg` as a full-bleed background, and that SVG itself
  is a built-in "left RAW / right finished / center divider" compare
  illustration. The right `lf-hero-panel` block then repeats the same compare
  metaphor as a second card. Two compare visuals on one screen compete for
  attention and dilute the H1 + CTA in the middle.
- **Composition reads as marketing template, not editorial.** Two side-by-side
  cards under a generic top-of-page treatment makes the page feel templated
  rather than confidently authored, which underserves a product whose voice is
  "the page only lets compatible math meet."

There is no functional bug outside the broken Unsplash dependency. The rest is
a composition and taste problem on the most attention-bearing surface.

## 2. Goals

1. **Remove the broken external dependency.** No remote image in hero.
   Everything ships from `public/`.
2. **One dominant visual idea.** A single full-bleed RAW→Finished compare
   strip replaces the duplicate compare card. The center of the hero is the
   wordmark + manifesto + CTAs, not a side panel.
3. **Editorial darkroom register.** Cool deep slate background, restrained
   warm-amber accent on the kicker only, magazine-cover typography. Visually
   confident and quiet.
4. **Hero-only scope, with a graceful palette transition.** Subsequent
   sections stay on the existing warm-paper palette. A 96 px gradient bridge
   between the hero bottom and the positioning section absorbs the palette
   shift so the page does not "snap."
5. **Preserve existing product copy and i18n keys.** Reuse `landing.kicker`,
   `landing.heroCopy`, `landing.start`, `landing.viewSource`,
   `landing.rawPreviewTag`, `landing.finishedJpegTag`, and
   `landing.contract.0..5`. No translation churn.

## 3. Non-Goals

- The five sections below the hero (positioning, proof, pipeline, workflow,
  luts, final) are out of scope. Their palette, layout, and content do not
  change in this design.
- The `/raw` theme tokens in `src/styles/tailwind.css` `@theme` and the
  `--color-lf-*` darkroom tokens are not touched. Per `CLAUDE.md`, those are
  reserved for `/raw`. The landing hero defines its own local hex/oklch
  literals scoped to `.lf-landing .lf-hero`.
- No interactive draggable compare in the hero. The compare strip is a
  passive marquee. The interactive split-compare belongs to `/raw`.
- No new fonts. Stays on Geist Sans.
- No new dependencies.

## 4. Composition

Desktop (≥ 1101 px), vertical flow inside `.lf-hero`:

```
┌─ nav (transparent on dark, fixed) ───────────────────────────┐
│  ▴ LumaForge                       EN · RAW Lab · ⌥ Source  │
├─ .lf-hero (deep cool slate + vignette + grain) ──────────────┤
│                                                              │
│  .lf-kicker          BROWSER RAW FINISHING LAB               │
│                                                              │
│  h1                  LumaForge                               │
│                                                              │
│  .lf-hero-copy       RAW to finished JPEG, with the          │
│                      color-science traps removed.            │
│                                                              │
│  .lf-hero-actions    [▣ Start in the browser] [⌥ Source]    │
│                                                              │
│  ─── hairline divider ──────────────────────────────────────  │
│                                                              │
│  .lf-hero-compare    [ full-bleed og-raw-preview.svg ]       │
│                      RAW tag bottom-left                     │
│                      Finished JPEG tag bottom-right          │
│                                                              │
│  ─── hairline divider ──────────────────────────────────────  │
│                                                              │
│  .lf-contract-rail   01·RAW dev  02·Linear  03·Gamut         │
│                      04·Log      05·LUT     06·Rec.709       │
│                                                              │
├─ .lf-hero-bridge (96 px gradient slate → warm paper) ────────┤
│  .lf-positioning (unchanged, warm paper)                     │
```

Mobile (≤ 720 px): same vertical order, full-width stacked. Buttons stack
full-width. The compare strip keeps a 4:3 aspect on phones (instead of 16:6
on desktop) so the split divider remains legible. The contract rail wraps
to two or three lines of pills rather than a single row.

## 5. Visual System (hero-scoped)

### Palette

All values declared on `.lf-landing .lf-hero` so they cannot leak into the
rest of the page.

| Role                | Token / value                                  |
| ------------------- | ---------------------------------------------- |
| Hero background     | `oklch(0.16 0.018 235)` deep cool slate        |
| Hero text primary   | `oklch(0.96 0.012 240)`                        |
| Hero text muted     | `oklch(0.78 0.018 240)`                        |
| Kicker accent       | `oklch(0.82 0.14 70)` warm amber (sole accent) |
| Hairline divider    | `oklch(0.95 0.01 240 / 0.10)`                  |
| Vignette overlay    | radial, center bright → edges                  |
|                     | `oklch(0.10 0.018 235 / 0.55)` at corners      |
| Primary CTA bg      | reuse landing `--lf-green`                     |
| Primary CTA text    | `oklch(0.145 0.018 152)` (kept from current)   |
| Secondary CTA bg    | `transparent`                                  |
| Secondary CTA border| `oklch(0.96 0.012 240 / 0.36)`                 |

### Typography

- H1: Geist Sans, weight 860, `font-size: clamp(3.5rem, 9vw, 7rem)`,
  `line-height: 0.92`, `letter-spacing: -0.02em`. The slight negative
  tracking pushes it from "marketing wordmark" to "magazine cover."
- Kicker: 0.76 rem, weight 780, `letter-spacing: 0.08em`, uppercase, warm
  amber. One-line, no wrap.
- Copy: `clamp(1.05rem, 1.6vw, 1.28rem)`, `line-height: 1.55`, `max-width:
  62ch`. Tightened from current 1.6 to feel more composed.
- Contract rail labels: 0.78 rem, weight 700, with index in tabular-nums
  (`font-variant-numeric: tabular-nums`) so the 01..06 column reads as a
  numbered series.

### Compare strip

- Single `<img>` of `public/og-raw-preview.svg` rendered into a
  `.lf-hero-compare` block.
- Container: full-bleed within hero gutter, `aspect-ratio: 16 / 6` on
  desktop, `aspect-ratio: 4 / 3` on mobile, `border-radius: 8px`, hairline
  border, `box-shadow: 0 24px 80px oklch(0.04 0.018 240 / 0.6)`.
- Two absolutely-positioned tags reuse existing i18n strings:
  `landing.rawPreviewTag` (bottom-left) and `landing.finishedJpegTag`
  (bottom-right). Same pill style as the current `.lf-compare-tag`, kept.
- No remote image. No draggable handle. The SVG already contains its own
  center divider; we do not add a second one.

### Contract rail

- Six items rendered from existing `contractSteps` array
  (`landing.contract.0..5`).
- Layout: `display: grid; grid-template-columns: repeat(6, 1fr)` on desktop,
  collapses to `repeat(3, 1fr)` between 720–1100, and `repeat(2, 1fr)` below
  720.
- Each item: `<span class="lf-contract-index">01</span><span
  class="lf-contract-sep" aria-hidden="true">·</span><span
  class="lf-contract-label">RAW dev</span>`.
- Indexes are amber (same as kicker accent) to tie back to the one accent
  color used in this hero. Labels are cool light.

### Hero → next-section bridge

- A 96 px-tall element appended as the last child of `.lf-hero`
  (`.lf-hero-bridge`) with a linear-gradient from the hero slate background
  to the `.lf-positioning` warm paper background. This avoids a hard color
  snap when the user begins scrolling.

## 6. Motion

All motion uses `m.` from `motion/react` inside the existing `LazyMotion`
provider in `src/providers/root-providers.tsx`, with presets from
`src/lib/spring`. All motion is gated by `useReducedMotion`; in reduced
mode the hero is fully static and identical visually.

Entrance, on mount, fired once:

1. Kicker — `opacity 0 → 1`, `y 12 → 0`, `delay 0ms`, `duration 320ms`,
   ease standard.
2. H1 — same, `delay 80ms`.
3. Copy — same, `delay 160ms`.
4. Actions — same, `delay 220ms`.
5. Compare strip — `clip-path: inset(0 100% 0 0) → inset(0 0 0 0)`,
   `duration 700ms`, ease cubic-bezier(0.22, 1, 0.36, 1), `delay 300ms`.
6. Contract rail — fade only, `delay 500ms`, stagger 40 ms between items.

No hover motion in the hero other than the existing button lift, which is
inherited from `.lf-button` and is already reduced-motion gated.

## 7. Markup Changes

File: `src/pages/(main)/index.sync.tsx`

Inside `<section className="lf-hero" ...>` (lines 115–172), replace the
existing children with:

```tsx
<div className="lf-hero-bg" aria-hidden="true" />
<div className="lf-hero-vignette" aria-hidden="true" />

<div className="lf-hero-content">
  <m.p className="lf-kicker" {...entrance(0)}>
    {t('landing.kicker')}
  </m.p>
  <m.h1 id="lf-hero-title" {...entrance(80)}>
    LumaForge
  </m.h1>
  <m.p className="lf-hero-copy" {...entrance(160)}>
    {t('landing.heroCopy')}
  </m.p>
  <m.div
    className="lf-hero-actions"
    aria-label={t('landing.primaryActions')}
    {...entrance(220)}
  >
    <Link to="/raw" className="lf-button lf-button-primary">
      <ImageUp size={18} strokeWidth={1.9} />
      {t('landing.start')}
    </Link>
    <a
      href={repository.url}
      target="_blank"
      rel="noreferrer"
      className="lf-button lf-button-secondary"
    >
      <GitFork size={18} strokeWidth={1.9} />
      {t('landing.viewSource')}
    </a>
  </m.div>
</div>

<m.figure
  className="lf-hero-compare"
  aria-label={t('landing.workflowPreview')}
  {...compareEntrance(300)}
>
  <img src={heroImage} alt={t('landing.heroImageAlt')} />
  <figcaption className="lf-compare-tag lf-tag-left">
    {t('landing.rawPreviewTag')}
  </figcaption>
  <figcaption className="lf-compare-tag lf-tag-right">
    {t('landing.finishedJpegTag')}
  </figcaption>
</m.figure>

<ol
  className="lf-contract-rail"
  aria-label={t('landing.contractChecks')}
>
  {contractSteps.map((step, index) => (
    <li key={step}>
      <span className="lf-contract-index">
        {String(index + 1).padStart(2, '0')}
      </span>
      <span className="lf-contract-sep" aria-hidden="true">·</span>
      <span className="lf-contract-label">{t(step)}</span>
    </li>
  ))}
</ol>

<div className="lf-hero-bridge" aria-hidden="true" />
```

Where `entrance(delay)` and `compareEntrance(delay)` are small local helpers
defined in the same file returning `motion/react` props, gated by
`useReducedMotion`.

Removed entirely:
- `<img className="lf-hero-image" ... />` (becomes `lf-hero-bg` background
  layer drawn in CSS — see below)
- `<div className="lf-hero-shade" />` (rolled into the new bg/vignette)
- The entire `<div className="lf-hero-panel">` block including the broken
  `.lf-compare-finish` Unsplash painting

The Lucide imports `Check`, `SlidersHorizontal`, etc. used elsewhere on the
page are preserved.

## 8. CSS Changes

File: `src/pages/(main)/index.css`

Surgical: replace the existing hero block (lines 103–321 today, roughly
`.lf-hero` through `.lf-contract-strip`) with a new hero block. Everything
from `.lf-positioning` downward is untouched.

Removed:
- `.lf-hero-image`, `.lf-hero-shade`, `.lf-hero-content` (rewritten),
  `.lf-hero-panel`, `.lf-compare-stage`, `.lf-compare-finish` (this is the
  rule that loaded Unsplash), `.lf-compare-divider`, `.lf-compare-tag`,
  `.lf-tag-left`, `.lf-tag-right` (selectors kept under new structure),
  `.lf-contract-strip`.

Added:
- `.lf-hero` — column flex, `min-height: 92vh`, deep slate base, large
  vertical padding, single-column composition.
- `.lf-hero-bg` — absolute layer, deep slate; the `og-raw-preview.svg`
  background that today doubles as both hero backdrop AND compare visual is
  retired from the background role. The background is now pure color +
  vignette + grain noise (CSS `url(data:...)` or a tiny inline SVG).
- `.lf-hero-vignette` — radial gradient overlay.
- `.lf-hero-content` — centered max-width column (`max-width: 880px`),
  left-aligned text, lives in normal flow above the compare strip.
- `.lf-hero-compare` — `<figure>` block, `aspect-ratio: 16 / 6` on desktop,
  hairline border, deep shadow, contains the SVG and the two corner tags.
- `.lf-compare-tag`, `.lf-tag-left`, `.lf-tag-right` — kept (selector
  parity with current code), reapplied under `.lf-hero-compare`.
- `.lf-contract-rail` — `<ol>` grid, six columns desktop, three between
  720–1100, two below 720.
- `.lf-contract-index`, `.lf-contract-sep`, `.lf-contract-label` — typography.
- `.lf-hero-bridge` — 96 px linear-gradient transition into
  `.lf-positioning` warm paper.

Responsive breakpoints follow the file's existing convention:

- `(min-width: 1101px) and (max-width: 1320px)` — clamp H1 to ~5.5rem,
  compare strip min-height 360 px.
- `(max-width: 1100px)` — same single-column layout, compare strip aspect
  ratio softens to 5:3.
- `(max-width: 720px)` — H1 to 3.5 rem, copy to 1.05 rem, buttons full-width,
  compare strip to 4:3, contract rail to two columns, hero padding 88/14/22.
- `(max-width: 420px)` — H1 to 3.05 rem (matches current).

Reduced motion is honored by `@media (prefers-reduced-motion: reduce)` for
any CSS-driven animation and by `useReducedMotion` for `motion/react`.

## 9. i18n

No new keys are required for the hero to ship. Existing keys cover every
visible string. A single optional new key may be added later if a status
microcopy is introduced (e.g., "Available now"), but it is not in this
design.

Both `src/locales/en.json` and `src/locales/zh-CN.json` are unchanged by
this design.

## 10. Accessibility

- `<section>` retains `aria-labelledby="lf-hero-title"`.
- H1 `id` is preserved.
- The compare strip becomes `<figure aria-label={t('landing.workflowPreview')}>`
  with `<figcaption>` corner tags so the role is "figure" instead of
  "generic div with aria-label."
- Contract rail becomes `<ol>` (it is a numbered sequence) with
  `aria-label={t('landing.contractChecks')}`.
- All decorative SVG/background layers carry `aria-hidden="true"`.
- The CTA button order (Primary first, Secondary second) is preserved so
  tab order does not regress.
- Color contrast: hero text on the deep slate background lands at AAA for
  body and AA-large for muted text; checked at design time, verified at
  implementation.

## 11. Risk and Trade-offs

- **Cool-dark hero followed by warm-paper sections is a deliberate jolt.**
  The 96 px bridge softens it but does not eliminate it. We accept this as
  editorial pacing (cover → body). If the bridge reads as awkward in the
  built page, the fallback is to widen it to 160 px or add a thin hairline
  rule at the seam.
- **One accent color (warm amber) carrying both the kicker and the rail
  index numbers** is a discipline bet: it gives the hero a clear color
  story but means we cannot freely introduce a third accent later without
  reopening this design.
- **No interactive compare in the hero** trades demo charm for visual
  authority. The interactive compare lives one click away inside `/raw`,
  which is where it can be honest about behavior. The hero stays a
  marquee.
- **Local hero palette literals** (not `--color-lf-*` tokens) deliberately
  do not promote the landing hero into the darkroom token system. If we
  later decide the marketing page should adopt darkroom tokens, that is a
  separate refactor with its own design.

## 12. Verification

Per `CLAUDE.md` UI-only path:

1. `pnpm test:ui` — smoke any landing render tests.
2. `pnpm lint` — autofix and check.
3. `pnpm preview` (not dev) + manual visit to `/` at desktop 1440, tablet
   1100, mobile 390 widths. Confirm:
   - No request to `images.unsplash.com` in the network panel
     (the broken-image symptom).
   - Single hero compare strip, no duplicate side card.
   - Hero → positioning transition reads as a deliberate bridge, not a
     visual error.
   - Reduced-motion mode renders the hero with no entrance animation and
     no clip-path wipe.
4. Lighthouse pass on `/` is not required for this change but should not
   regress; the hero removes one external image request, which should help.

## 13. Out of Scope (explicit)

- The five sections below the hero.
- The `useDark` / `data-theme` machinery.
- The `/raw` theme tokens.
- Any change to `package.json`, route generation, or build.
- Any change to the favicon or `public/og-raw-preview.svg` (the SVG is
  reused as-is; if the marketing team later wants a different hero image,
  that is a separate asset change, not a code change).
