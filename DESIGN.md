---

name: LumaForge
description: Browser-local RAW finishing lab with color-safe guardrails.
colors:
lf-paper: 'oklch(0.964 0.018 86)'
lf-paper-low: 'oklch(0.918 0.026 86)'
lf-paper-warm: 'oklch(0.9 0.034 82)'
lf-ink: 'oklch(0.18 0.018 76)'
lf-ink-soft: 'oklch(0.38 0.032 75)'
lf-hairline: 'oklch(0.74 0.035 78)'
lf-green: 'oklch(0.59 0.15 153)'
lf-green-hover: 'oklch(0.66 0.16 153)'
lf-green-deep: 'oklch(0.37 0.105 155)'
lf-amber: 'oklch(0.78 0.16 63)'
lf-rose: 'oklch(0.62 0.17 346)'
lf-sky: 'oklch(0.65 0.1 214)'
lf-hero-ink: 'oklch(0.97 0.014 86)'
typography:
display:
fontFamily: 'Geist Sans, ui-sans-serif, system-ui, sans-serif'
fontSize: 'clamp(3.05rem, 10vw, 6.8rem)'
fontWeight: 860
lineHeight: 0.9
headline:
fontFamily: 'Geist Sans, ui-sans-serif, system-ui, sans-serif'
fontSize: 'clamp(2.35rem, 5vw, 3.4rem)'
fontWeight: 830
lineHeight: 1.04
title:
fontFamily: 'Geist Sans, ui-sans-serif, system-ui, sans-serif'
fontSize: '1.46rem'
fontWeight: 760
lineHeight: 1.15
body:
fontFamily: 'Geist Sans, ui-sans-serif, system-ui, sans-serif'
fontSize: '1.03rem'
fontWeight: 400
lineHeight: 1.65
label:
fontFamily: 'Geist Sans, ui-sans-serif, system-ui, sans-serif'
fontSize: '0.76rem'
fontWeight: 780
lineHeight: 1.2
letterSpacing: 'normal'
rounded:
mark: '5px'
control: '8px'
panel: '8px'
pill: '999px'
spacing:
hairline: '1px'
chip-gap: '7px'
control-gap: '12px'
content-gap: 'clamp(28px, 5vw, 72px)'
section-block: 'clamp(58px, 8vw, 112px)'
section-inline: 'clamp(18px, 6vw, 88px)'
components:
button-primary:
backgroundColor: '{colors.lf-green}'
textColor: '{colors.lf-ink}'
rounded: '{rounded.control}'
padding: '12px 17px'
height: '46px'
button-primary-hover:
backgroundColor: '{colors.lf-green-hover}'
textColor: '{colors.lf-ink}'
rounded: '{rounded.control}'
padding: '12px 17px'
height: '46px'
button-secondary:
backgroundColor: 'oklch(0.16 0.018 76 / 0.48)'
textColor: '{colors.lf-hero-ink}'
rounded: '{rounded.control}'
padding: '12px 17px'
height: '46px'
chip-contract:
backgroundColor: 'oklch(0.16 0.018 76 / 0.54)'
textColor: 'oklch(0.94 0.014 86)'
rounded: '{rounded.pill}'
padding: '7px 10px'
height: '30px'
surface-panel:
backgroundColor: 'oklch(0.18 0.02 76)'
textColor: '{colors.lf-hero-ink}'
rounded: '{rounded.panel}'
workspace-chrome:
description: 'Photo-first dark on-photo chrome used inside /raw. Brand and landing keep the warm paper system above.'
on-photo-paper: 'oklch(0.118 0.006 255)'
on-photo-paper-high: 'oklch(0.16 0.007 255 / 0.9)'
on-photo-paper-low: 'oklch(0.085 0.006 255 / 0.74)'
on-photo-bg: 'oklch(0.125 0.006 255 / 0.56)'
on-photo-bg-strong: 'oklch(0.105 0.006 255 / 0.84)'
on-photo-bord: 'oklch(0.9 0.006 255 / 0.34)'
on-photo-bord-soft: 'oklch(0.9 0.006 255 / 0.18)'
on-photo-text: '{colors.lf-hero-ink}'
on-photo-text-soft: 'oklch(0.86 0.012 255 / 0.7)'
on-photo-text-meta: 'oklch(0.74 0.01 255 / 0.56)'
stage-base: 'oklch(0.064 0.006 255)'
stage-panel: 'oklch(0.13 0.006 255 / 0.78)'
stage-hairline: 'oklch(0.96 0.006 255 / 0.2)'
accent-ready: '{colors.lf-green}'
accent-destructive: '{colors.lf-rose}'
# Lift Wash Ladder: cool-white opacities used for every structural lift
# in the chrome (hover, track fill, active thumb, top highlight, seam).
# Warmth is reserved for accent (lf-green) and destructive (lf-rose);
# structural lifts stay cool to keep the chrome one material.
lift-soft: 'oklch(0.96 0.006 255 / 0.05)'      # tool card hover, segmented track, tool rail seam, .raw-lab-shell wash
lift-medium: 'oklch(0.96 0.006 255 / 0.06)'    # topbar button hover, tool rail inset hairline
lift-card: 'oklch(0.96 0.006 255 / 0.08)'      # tool card open top highlight, stage frame inset, export footer top highlight
lift-strong: 'oklch(0.96 0.006 255 / 0.10)'    # segmented thumb active
lift-highlight: 'oklch(0.96 0.006 255 / 0.14)' # segmented thumb top highlight
# Text Opacity Ladder on dark chrome (hero-ink at fractional opacities).
# Roles map to the readability sweep that brought every body / value /
# label callsite above the WCAG AA floor on the slate substrate.
text-headline: '{colors.lf-hero-ink}'        # tool card title, file name in topbar, modal titles
text-body: 'oklch(from {colors.lf-hero-ink} l c h / 0.72)' # notes, hints, hover label
text-value: 'oklch(from {colors.lf-hero-ink} l c h / 0.80)' # numeric readouts (Tone slider value, histogram counts)
text-dt-label: 'oklch(from {colors.lf-hero-ink} l c h / 0.62)' # dt labels (ExportTool, FileFactsTool)
text-meta: 'oklch(from {colors.lf-hero-ink} l c h / 0.44)'   # tool card meta strings, disclosure chevrons (rest)
segmented:
description: 'Strength and the LUT contract tabs share one paint via segmented-chrome.ts. Sizes diverge for touch vs mouse; paint stays one.'
track: '{workspace-chrome.lift-soft}'              # borderless 5% cool-white fill
thumb-active: '{workspace-chrome.lift-strong}'     # 10% cool-white wash
thumb-active-highlight: '{workspace-chrome.lift-highlight}' # 1px inset top highlight
text-inactive: 'oklch(from {colors.lf-hero-ink} l c h / 0.72)'
text-inactive-hover: 'oklch(from {colors.lf-hero-ink} l c h / 0.92)'
text-active: '{colors.lf-hero-ink}'
text-active-weight: 'semibold'
focus-ring: 'oklch(from {colors.lf-green} l c h / 0.80)'
height-touch: '44px'
height-mouse-sm: '36px'
height-mouse-tabs: '28px'
------------------------------------------------------------------------

# Design System: LumaForge

## 1. Overview

**Creative North Star: "The Calibrated Photo Lab"**

LumaForge should feel like a precise photo lab that has already removed the unsafe switches before the user arrives.
The visual system combines photographic drama with product restraint: large confident type, warm paper surfaces, dark image overlays, and explicit color-contract rails.

The system rejects generic SaaS polish.
Avoid purple gradients, hero metrics, repeated icon-card grids, glassy panels, and vague technical decoration.
The brand is not a dark grading suite either.
It should feel approachable for a casual RAW shooter while still signaling that careful color work is happening underneath.

Product surfaces inherit the same brand atoms — green action affordances, amber contract labels, strict hairlines, and plain-language guardrails — but the substrate splits into two registers:

- **Brand / Landing / Marketing.** Warm paper system described in §§2–5. Day-readable, document-feeling, calm.
- **Workspace Chrome (`/raw`).** Photo-first dark on-photo chrome described in §6. Photographic-judgement environment, slate-and-glass, the photo owns the surface.

Both registers share `lf-green`, `lf-amber`, `lf-rose`, `lf-sky`, `lf-hero-ink`, Geist Sans, the same rounded scale, and the same component grammar (Compare Panel, Contract Rail). They diverge in substrate (paper vs. slate), in topbar/tool-rail materiality (opaque card vs. translucent glass), and in seam idiom (1px warm hairlines vs. inset shadow with subtle highlights).

**Key Characteristics:**

- Photographic first: use real image surfaces when explaining RAW, LUTs, comparison, or export.
- Color-safe: controls expose compatible contracts, not free-form mystery knobs.
- Scene-referred by default: camera-log LUT work starts from RAW scene-linear data, not from display sRGB.
- Warm precision: neutrals are tinted toward paper, ink, and darkroom warmth.
- Visible boundaries: use hairlines, rails, numbered steps, and contract chips instead of decorative cards.
- Browser-local confidence: repeat no upload, no native helper, no account, and no license friction where relevant.

## 2. Colors

The palette is a warm lab-paper system with a green action signal and small calibrated accent roles.
OKLCH is the canonical color notation for implementation.

### Primary

- **Lab Green** (`oklch(0.59 0.15 153)`): Primary action color for starting, exporting, confirming safe contract choices, and active product states.
  Use sparingly so it remains a clear call to action.
- **Deep Lab Green** (`oklch(0.37 0.105 155)`): Section labels on light surfaces, secondary success markers, and textual emphasis where primary green would be too loud.

### Secondary

- **Calibration Amber** (`oklch(0.78 0.16 63)`): Kicker labels, contract-rail numbers, and explanatory highlights.
  Use it to introduce color-science concepts, not for generic warnings.
- **Sensor Rose** (`oklch(0.62 0.17 346)`): Occasional secondary proof icon or profile-family accent.
  Keep it rare.
- **Preview Sky** (`oklch(0.65 0.1 214)`): Occasional technical proof accent, especially for preview, browser, or runtime capability references.

### Neutral

- **Lab Paper** (`oklch(0.964 0.018 86)`): Main light surface.
  It should read as warm paper, never pure white.
- **Low Paper** (`oklch(0.918 0.026 86)`): Slightly deeper neutral for broad bands and background transitions.
- **Warm Proof Surface** (`oklch(0.9 0.034 82)`): Proof and feature bands that need visual separation without becoming cards.
- **Darkroom Ink** (`oklch(0.18 0.018 76)`): Primary dark text and dark section foundation.
  It should feel tinted, not black.
- **Soft Ink** (`oklch(0.38 0.032 75)`): Body copy on light surfaces.
- **Warm Hairline** (`oklch(0.74 0.035 78)`): Borders, rails, and structural separators.

### Named Rules

**The No Pure Neutral Rule.** Do not use pure black or pure white.
Every neutral should carry a small warm tint.

**The Green Means Go Rule.** Primary green is reserved for the main action or an export-safe state.
Do not use it as casual decoration.

**The Amber Explains Color Rule.** Amber belongs to labels, rails, and color-contract explanation.
It should not become a generic warning color.

## 3. Typography

**Display Font:** Geist Sans with system sans fallback\
**Body Font:** Geist Sans with system sans fallback\
**Label/Mono Font:** Geist Sans for labels; mono is only for code, file facts, or actual technical values.

**Character:** The system uses one committed sans family with aggressive weight contrast.
It should feel engineered and photographic, not editorial, cute, or generic.

### Hierarchy

- **Display** (860, `clamp(3.05rem, 10vw, 6.8rem)`, `0.9`): Brand wordmarks and one-off hero statements only.
- **Headline** (830, `clamp(2.35rem, 5vw, 3.4rem)`, `1.04`): Section propositions and major product claims.
- **Title** (760, `1.46rem`, `1.15`): Proof points, panel titles, and compact component headings.
- **Body** (400, `1.03rem`, `1.65`): Explanatory copy.
  Keep body text near 65 to 75 characters per line.
- **Label** (780, `0.76rem`, uppercase, no letter-spacing): Kicker labels and short contract group labels.

### Named Rules

**The One Big Word Rule.** Use display scale for the page or view’s central idea, not for every section.

**The Contract Label Rule.** Labels may be uppercase, but body copy should stay sentence case and plain.

**The No Costume Mono Rule.** Do not use monospace as shorthand for “technical.”
Use it only when the text is truly code, metadata, or a numeric readout.

## 4. Elevation

The system is mostly structural, not shadow-heavy.
Depth comes from photographic layers, tonal bands, hairline rails, and image overlays.
Shadows are allowed on floating image comparison panels, but they should feel like a heavy print or light table surface, not glass.

### Shadow Vocabulary

- **Photo Panel Shadow** (`0 24px 80px oklch(0.18 0.018 76 / 0.18)`): Use for large preview or comparison panels that sit above photography.
- **No Shadow Rest State**: Product controls, lists, chips, and workflow rows should usually rely on borders, tonal surfaces, and spacing instead of drop shadows.

### Named Rules

**The Flat Controls Rule.** Controls are tactile through color, border, and motion, not through heavy shadow.

**The Image Gets Depth Rule.** Reserve dramatic depth for photographs and comparison surfaces.

## 5. Components

### Buttons

- **Shape:** 8px radius, minimum height 46px, inline icon plus text when action meaning benefits from an icon.
- **Primary:** Lab Green background, Darkroom Ink text, 12px 17px padding, 1px green border.
  Use for start, export, confirm, and safe primary actions.
- **Hover / Focus:** Lift by `translateY(-1px)` and shift to Hover Green.
  Use `cubic-bezier(0.22, 1, 0.36, 1)` for 180ms transitions.
  Respect reduced motion.
- **Secondary:** Dark translucent ink surface on photographic or dark backgrounds.
  Use a warm-tinted 1px border.
  Never compete with the primary action.

### Chips

- **Style:** Pills with 999px radius, 1px warm translucent border, compact padding, bold text, and optional check icon.
- **Role:** Contract chips show resolved safety facts such as RAW technical development, target gamut, target log curve, LUT output, and Rec.709 JPEG.
- **State:** Selected or verified chips should use an icon plus text, not color alone.

### Cards / Containers

- **Corner Style:** 8px for image panels and framed previews.
  Avoid large rounded corners on serious product surfaces.
- **Background:** Use Lab Paper, Low Paper, Warm Proof Surface, or darkroom overlays.
  Do not put cards inside cards.
- **Shadow Strategy:** Only large image panels get the Photo Panel Shadow.
- **Border:** Prefer 1px warm hairlines.
  Do not use colored side stripes.
- **Internal Padding:** Marketing sections use generous responsive padding.
  Product panels should use tighter, task-oriented padding.

### Inputs / Fields

- **Style:** Use warm paper or darkroom surfaces with a 1px hairline.
  Radius should stay near 8px.
- **Focus:** Shift border or ring toward Lab Green, paired with text feedback when the state affects export safety.
- **Error / Disabled:** Disabled export or unsupported source states must explain the blocker in plain language.

### Navigation

- **Style:** Minimal fixed brand nav over photographic surfaces, then compact product navigation inside tools.
- **Typography:** 0.82rem to 0.95rem, strong weight, no all-caps body navigation.
- **Mobile:** Hide secondary text links if necessary, but keep one route to source or support and one route to the RAW lab.

### Signature Component: Compare Panel

The compare panel is the system’s signature motif.
It uses a real photograph, a vertical split, a circular handle, and paired labels.
It should communicate “before and after” instantly without needing explanatory copy.
When reused in product surfaces, keep the split line crisp and avoid making it decorative if there is no real comparison state.

### Signature Component: Contract Rail

The contract rail explains why LumaForge is safe.
Use numbered steps or verified chips to show ordered color math.
It should never become a generic timeline.
Every rail item must correspond to a real transform or safety gate.

For camera-log LUTs, the contract rail should make the scene-referred path visible: RAW technical development, scene-linear handoff, LUT input gamut, LUT input transfer, declared LUT output, and final photo output.
Do not describe the default path as display sRGB followed by a LUT.

## 6. Workspace Chrome (RAW)

The `/raw` workspace runs in a **photo-first dark on-photo chrome**.
The photograph is the substrate; the topbar, tool rail, and export footer float over it as translucent control surfaces.
This is the canonical environment for evaluating RAW color, and it is also the language mobile `/raw` has used from day one — desktop now matches.

This register applies **only inside `/raw`**.
Marketing, landing, not-found, and any non-workspace surface continues to use the warm paper system from §§2–5.

### Why the split

Lab green, calibration amber, and warm hairlines remain the brand truth, but a warm paper substrate is the wrong evaluation environment for RAW color:
paper biases perceived saturation downward and competes with the photograph for eye attention.
Every pro RAW editor ships dark by default for this exact reason.
The workspace chrome adopts that convention while keeping the brand's accent system intact.

### Palette

The chrome retokenizes the substrate, not the accents:

- **On-Photo Paper** (`oklch(0.118 0.006 255)`): Substrate of topbar, tool rail, and panels. Slate with imperceptible cool tint.
- **On-Photo Paper High / Low / Warm**: `oklch(0.16 0.007 255 / 0.9)`, `oklch(0.085 0.006 255 / 0.74)`, `oklch(0.18 0.008 255 / 0.78)`. Tonal bands inside the chrome.
- **On-Photo BG / BG Strong**: `oklch(0.125 0.006 255 / 0.56)`, `oklch(0.105 0.006 255 / 0.84)`. Hover / pressed / open washes.
- **On-Photo Bord / Bord Soft**: `oklch(0.9 0.006 255 / 0.34)`, `oklch(0.9 0.006 255 / 0.18)`. Hairlines and structural seams; prefer the soft variant.
- **Hero Ink** (`{colors.lf-hero-ink}`): Primary text on all chrome surfaces.
- **Stage Base** (`oklch(0.064 0.006 255)`): Behind the preview frame; deepest slate.
- **Stage Panel / Hairline**: `oklch(0.13 0.006 255 / 0.78)`, `oklch(0.96 0.006 255 / 0.2)`. Compare handle and stage overlays.
- **Lab Green / Sensor Rose**: Unchanged. Used for ready state, focus rings, and destructive hover.

### Lift Wash Ladder

Every structural lift in the chrome — hover wash, track fill, active thumb, top highlight, seam — is the same cool-white hue at different opacities.
The hue is `oklch(0.96 0.006 255 / *)`, which matches the stage hairline.
Warmth is reserved for accent (`lf-green` for ready / focus / committed) and destructive (`lf-rose`); structural lifts stay cool so the chrome reads as one continuous material instead of switching tints between surfaces.

The ladder, lowest to brightest:

- **5% (lift-soft)** — tool card hover, segmented track fill, tool rail seam, `.raw-lab-shell` atmospheric wash.
- **6% (lift-medium)** — topbar button hover, tool rail inner highlight.
- **8% (lift-card)** — tool card open top highlight, stage frame top highlight, export footer top inset.
- **10% (lift-strong)** — segmented thumb active fill.
- **14% (lift-highlight)** — segmented thumb top highlight, compare handle inset highlight.

Do not pull structural lifts from `--color-lf-hero-ink` (warm).
That hue was used briefly in early drafts and left a single warm wash inside an otherwise cool-keyed chrome; aligning to the ladder restores material continuity.

### Topbar

- 52px min-height, translucent slate plate, `backdrop-filter: blur(14px) saturate(120%)`.
- Brand block on the left (24px icon with 1px inset ring, title at 0.875rem semibold tracking-tight, subtitle at 0.685rem at 52% opacity).
- Action cluster on the right is **ghost-style**: rest is `bg-transparent`, hover is the **lift-medium wash** (`oklch(0.96 0.006 255 / 0.06)`), focus is 2px `lf-green/80` outline with -1px offset.
  Hover wash must come from the ladder above, not from `bg-on-photo-bg` — on the topbar's near-floor substrate that token resolves to ~L=0.11 over L=0.09 and the hover becomes invisible.
- A 1px hairline divides the locale toggle from the file actions.
- Destructive action (reset) gains a `lf-rose/14` hover and `lf-rose/70` focus ring; it never asserts itself at rest.
- Press feedback is a `translateY(0.5px)` micro-shift, not a scale.

### Tool Rail

- Right column, dark on-photo plate with `backdrop-filter: blur(14px) saturate(120%)`.
- No drawn border; the seam to the stage is an inset hairline `inset 1px 0 0 oklch(0.96 0.006 255 / 0.06)`.
- Scrollbar uses the dark thumb token, scrollbar-gutter: stable to prevent jitter on first scroll.
- Tool cards are Radix Accordion items:
  - Rest: transparent border, no fill.
  - Hover: **lift-soft wash** (`5% cool white`) — a lift, not a recolor.
  - Open: gradient fill, top highlight at **lift-card** (`inset 0 1px 0 oklch(0.96 0.006 255 / 0.08)`) + lower inset shadow for depth.
  - Trigger: 32px min-height, label color ladder `66 → 88 → 100%`, chevron `40 → 64 → 72%`.
  - Focus-visible: inset 2px `lf-green/80` outline (does not collide with the open hairline).
- Meta strings on triggers use `tabular-nums` so counts (e.g. histogram clipping) do not reflow as values cross thresholds.

### Segmented Controls

Strength (LUT lift amount) and the LUT contract tabs (input / output, both viewports) all render segmented controls.
Their paint is centralized in `src/modules/raw-processor/components/tools/segmented-chrome.ts` — a single source so a future polish loop changes the look in one file and every consumer follows.

Paint contract (cross-platform):

- **Track**: borderless **lift-soft wash** (`bg-[oklch(0.96_0.006_255/0.05)]`). No drawn hairline. The fill itself lifts the track above the chrome surface; on the flatter mobile LUT sheet that was previously the dominant edge of the control, while on the structured desktop tool card it became a third hairline competing with the existing seams.
- **Inactive item**: `text-lf-hero-ink/72` at rest, `text-lf-hero-ink/92` on pointer hover — the segment under the pointer previews a lift before commit.
- **Active item**: `text-lf-hero-ink` (full) + **`font-semibold`** weight contrast.
  Weight is the readability anchor when the bg delta is subtle.
- **Active thumb**: **lift-strong wash** (`oklch(0.96 0.006 255 / 0.10)`) + 1px **lift-highlight** top inset.
  No outline ring, no drop shadow, no glass border — earlier drafts stacked all three and the segment read as crystalline rather than as one of the chrome's surfaces.
- **Focus ring**: 2px `lf-green/80` outline with -1px offset, matching topbar and tool card focus.
- **Sizes diverge by interaction only**: 44px min-height for touch (mobile Strength, mobile LUT contract tabs), 36px for desktop Strength (mouse density), 28px for desktop LUT contract tabs (tab density).
  Paint stays one across all sizes.

The `SegmentGroup` / `SegmentItem` primitives in `src/components/ui/segment/` are intentionally **color-agnostic**.
Consumers own all color (track, item text, active thumb) so the same primitive can render on paper, on the workspace chrome, and on themed dark mode without color leaks (see Primitive Color Agnosticism Rule below).

### Text Opacity Ladder

Every body / numeric / label callsite on dark chrome maps to a fixed step of the ladder.
The ladder lands every role above the WCAG AA floor on the slate substrate and preserves the label → value hierarchy.

- **Headline** (full `lf-hero-ink`) — tool card titles, file name in topbar, modal titles.
- **Hover label** (full `lf-hero-ink`) — anything under the pointer that wants to commit to "selected".
- **Numeric value** (`/80`, also `tabular-nums`) — Tone slider readout, histogram numeric counts when ready, file size and dimensions in the export result.
- **Hover-state previews** (`/92`) — inactive segmented item hover, ghost button hover.
- **Body / hints / notes** (`/72`) — tool card body copy, Tone / Compare / Histogram notes, LUT contract empty hints, online LUT source hints.
- **DT label** (`/62`) — definition terms in dl rows (ExportTool dimensions / file size, FileFactsTool, LUTProfileStatus input/output terms).
- **Closed trigger / subtitle / topbar subtitle** (`/52` – `/56`) — accordion closed-state title, subtitle copy, eyebrow labels (e.g. "STRENGTH").
- **Meta / disclosure dim** (`/40` – `/44`) — tool card meta strings, accordion chevron at rest.

Hover and active states brighten one or two steps; do not invent intermediate values mid-component.

### Stage and Compare Handle

- Stage padding is `clamp(14px, 1.45vw, 20px)`. Frame border is `oklch(0.96 0.006 255 / 0.08)` at 10px radius with a soft `0 22px 64px` photo-panel shadow + 1px inset top highlight.
- Compare handle circle is a glass panel (`backdrop-filter: blur(8px) saturate(120%)`) with `0.72` hero-ink border at rest.
- Hover and drag earn an `lf-green` accent ring (4px `lf-green/18` halo), matching the same accent system the topbar focus and export-ready stripe use.

### Export Footer (persistent action zone)

- The bottom of the tool rail is reserved for the export action and its result block.
- A 1px **lf-green ready-stripe** sits on top of the footer, opacity 0 → 1 as `canExport` flips true. This is the chrome's commit cue — Linear / X use the same idiom for "this is the action that ships".
- Footer plate is the deepest tone in the rail; an inset baseline shadow stratifies it below the tool card stack.

### Progress Overlay

- The export progress overlay runs in the same cool slate palette as the rest of the chrome (the shared mobile darkroom is warm amber; the desktop variant overrides it).
- Flat-handoff variant — used for full-stage export — paints a radial slate gradient with a darkroom film-strip overlay at 4% opacity.

### Topbar and Tool Rail Are Glass

Both the topbar and the tool rail are translucent: `backdrop-filter: blur(14px) saturate(120%)`.
This is intentional. It lets the photograph's color tint the chrome, so a warm-toned image warms the rail and a cool-toned image cools it.
The chrome reads as one continuous material with the photograph, not as a separate UI slab.

### Named Rules

**The Photo Owns the Stage Rule.** The photograph is the substrate; chrome is the layer over it. Topbar and tool rail must not compete with the photo for visual hierarchy.

**The Chrome Is Glass Rule.** Every chrome surface that floats over the photo uses `backdrop-filter`. The chrome does not invent its own opaque color; it tints with the photo.

**The Slate, Not Black Rule.** Substrate is `oklch(0.064–0.12, c≈0.006)`. Never pure black. The faint cool tint distinguishes it from a generic dark UI and keeps it photographic.

**The One Accent Rule.** Lab Green is the only accent for ready / focus / committed states. Sensor Rose is reserved for destructive intent. No other accent enters the chrome.

**The Inset Hairline Rule.** Seams between chrome surfaces are inset shadows (1px top highlight + 1px bottom shadow), not drawn borders. Borders are reserved for the stage frame and tool card open state.

**The Cool Lift Rule.** Every structural lift (hover, track, active fill, top highlight, seam) uses the cool-white Lift Wash Ladder. Warmth is reserved for `lf-green` (ready / focus / committed) and `lf-rose` (destructive). Never pull a structural lift from `--color-lf-hero-ink` (warm) — it leaves a foreign warm element in an otherwise cool-keyed chrome.

**The Borderless Track Rule.** Wells, tracks, and group containers inside the chrome (segmented controls, dropdown wells, inline button groups) define their edge by a Lift Wash fill, not by a drawn `border-*`. Drawn borders depend on substrate contrast and read heavier on flat sheets than on structured surfaces; a fill-based well behaves the same on both.

**The Tabular Number Rule.** Any numeric meta in chrome (clipping counts, render time, file size, dimensions) uses `tabular-nums` so values do not reflow as they cross 10 / 100 / 1000.

**The Primitive Color Agnosticism Rule.** UI primitives in `src/components/ui/*` must NOT hardcode `@theme`-derived color tokens (`text-text`, `text-text-secondary`, `bg-fill-*`, `bg-background`, etc.) as defaults. `tailwind-merge`'s default classifier does not dedupe custom `@theme` tokens against arbitrary `bg-[oklch(...)]` / `text-[...]` overrides, so primitive defaults silently win CSS source order on any chrome variant whose `@media`-scoped overrides do not touch that specific token. Primitives stay structural (layout, size if necessary, shape); consumers — module / chrome — own all color decisions.

### Cross-platform parity

Mobile `/raw` has used this language since the first mobile design.
This section documents desktop catching up — both viewports now share one set of tokens (`lf-on-photo-*`, `lf-hero-ink`, the stage palette), one set of idioms (glass chrome, photo-owned stage, ghost actions, lf-green accent), and one mental model.
Avoid letting them diverge again.

## 7. Do's and Don'ts

### Do:

- **Do** use warm OKLCH neutrals from the Lab Paper and Darkroom Ink families.
- **Do** reserve Lab Green for primary action, export-safe states, and active guardrail states.
- **Do** use real image material when talking about RAW, preview, LUTs, compare, or export.
- **Do** explain unsafe states with direct copy: unknown LUT contract, unsupported source, unsupported output, or export not reproducible.
- **Do** use rails, numbered rows, chips, and hairlines to explain workflow sequence.
- **Do** keep product controls denser than marketing sections while retaining the same colors, typography, and safety language.

### Don't:

- **Don't** mimic DaVinci Resolve with dense dark panels, nodes, scopes, and unlimited grading controls.
- **Don't** add a hero metric block, repeated same-size icon cards, or centered template stacks.
- **Don't** use purple gradients, gradient text, decorative orbs, bokeh blobs, or marketing-decoration glassmorphism. The workspace chrome's glass (§6) is a photographic-substrate tinter, not a decorative pattern — keep it scoped to `/raw`.
- **Don't** use colored side stripes on cards, list items, callouts, or alerts. The export footer's top-edge `lf-green` ready-stripe (§6) is a state cue tied to a runtime fact, not a card ornament — do not generalize that pattern outside the workspace chrome's commit zone.
- **Don't** use pure black, pure white, or category-reflex dark blue tool styling. The workspace chrome's slate is `oklch(0.064–0.12, c≈0.006)`, a near-neutral with a faint cool cast — not navy, not black.
- **Don't** silently render mismatched gamma, log, gamut, or LUT output choices.
- **Don't** leave template attribution, placeholder demo widgets, or component-gallery copy on user-facing pages.
- **Don't** drift the brand and the workspace chrome apart. Both must keep `lf-green` as the only ready/focus accent, `lf-rose` as the only destructive accent, Geist Sans as the only sans family, and the same rounded scale.
- **Don't** hardcode color tokens (`text-text`, `text-text-secondary`, `bg-fill-*`, `bg-background`) into the `src/components/ui/*` primitives. `tailwind-merge` does not dedupe `@theme` tokens against arbitrary `bg-[oklch(...)]` / `text-[...]` overrides; the hardcoded default will silently win on any chrome variant whose `@media` override does not touch that specific token (the mobile track and the mobile active-text regressions both traced back to this exact shape). Keep primitives color-agnostic; let consumers paint.
- **Don't** pull structural lifts from `oklch(from var(--color-lf-hero-ink) l c h / *)` (warm). Use the Lift Wash Ladder (`oklch(0.96 0.006 255 / *)`, cool). Warmth belongs to accent / destructive, not to neutral interaction.
- **Don't** draw borders on segmented controls, dropdown wells, or button groups inside the chrome. A drawn 1px hairline reads heavier on the flatter mobile sheets than on the structurally-rich desktop tool card, breaking cross-platform parity. Use a Lift Wash fill instead.
