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
---

# Design System: LumaForge

## 1. Overview

**Creative North Star: "The Calibrated Photo Lab"**

LumaForge should feel like a precise photo lab that has already removed the unsafe switches before the user arrives. The visual system combines photographic drama with product restraint: large confident type, warm paper surfaces, dark image overlays, and explicit color-contract rails.

The system rejects generic SaaS polish. Avoid purple gradients, hero metrics, repeated icon-card grids, glassy panels, and vague technical decoration. The brand is not a dark grading suite either. It should feel approachable for a casual RAW shooter while still signaling that careful color work is happening underneath.

Product surfaces should inherit the same calibrated language as the landing page, but with more operational density. The RAW workspace can be quieter than the marketing page; it should still use warm-tinted neutrals, green action affordances, amber contract labels, strict hairlines, and plain-language guardrails.

**Key Characteristics:**

- Photographic first: use real image surfaces when explaining RAW, LUTs, comparison, or export.
- Color-safe: controls expose compatible contracts, not free-form mystery knobs.
- Scene-referred by default: camera-log LUT work starts from RAW scene-linear data, not from display sRGB.
- Warm precision: neutrals are tinted toward paper, ink, and darkroom warmth.
- Visible boundaries: use hairlines, rails, numbered steps, and contract chips instead of decorative cards.
- Browser-local confidence: repeat no upload, no native helper, no account, and no license friction where relevant.

## 2. Colors

The palette is a warm lab-paper system with a green action signal and small calibrated accent roles. OKLCH is the canonical color notation for implementation.

### Primary

- **Lab Green** (`oklch(0.59 0.15 153)`): Primary action color for starting, exporting, confirming safe contract choices, and active product states. Use sparingly so it remains a clear call to action.
- **Deep Lab Green** (`oklch(0.37 0.105 155)`): Section labels on light surfaces, secondary success markers, and textual emphasis where primary green would be too loud.

### Secondary

- **Calibration Amber** (`oklch(0.78 0.16 63)`): Kicker labels, contract-rail numbers, and explanatory highlights. Use it to introduce color-science concepts, not for generic warnings.
- **Sensor Rose** (`oklch(0.62 0.17 346)`): Occasional secondary proof icon or profile-family accent. Keep it rare.
- **Preview Sky** (`oklch(0.65 0.1 214)`): Occasional technical proof accent, especially for preview, browser, or runtime capability references.

### Neutral

- **Lab Paper** (`oklch(0.964 0.018 86)`): Main light surface. It should read as warm paper, never pure white.
- **Low Paper** (`oklch(0.918 0.026 86)`): Slightly deeper neutral for broad bands and background transitions.
- **Warm Proof Surface** (`oklch(0.9 0.034 82)`): Proof and feature bands that need visual separation without becoming cards.
- **Darkroom Ink** (`oklch(0.18 0.018 76)`): Primary dark text and dark section foundation. It should feel tinted, not black.
- **Soft Ink** (`oklch(0.38 0.032 75)`): Body copy on light surfaces.
- **Warm Hairline** (`oklch(0.74 0.035 78)`): Borders, rails, and structural separators.

### Named Rules

**The No Pure Neutral Rule.** Do not use pure black or pure white. Every neutral should carry a small warm tint.

**The Green Means Go Rule.** Primary green is reserved for the main action or an export-safe state. Do not use it as casual decoration.

**The Amber Explains Color Rule.** Amber belongs to labels, rails, and color-contract explanation. It should not become a generic warning color.

## 3. Typography

**Display Font:** Geist Sans with system sans fallback  
**Body Font:** Geist Sans with system sans fallback  
**Label/Mono Font:** Geist Sans for labels; mono is only for code, file facts, or actual technical values.

**Character:** The system uses one committed sans family with aggressive weight contrast. It should feel engineered and photographic, not editorial, cute, or generic.

### Hierarchy

- **Display** (860, `clamp(3.05rem, 10vw, 6.8rem)`, `0.9`): Brand wordmarks and one-off hero statements only.
- **Headline** (830, `clamp(2.35rem, 5vw, 3.4rem)`, `1.04`): Section propositions and major product claims.
- **Title** (760, `1.46rem`, `1.15`): Proof points, panel titles, and compact component headings.
- **Body** (400, `1.03rem`, `1.65`): Explanatory copy. Keep body text near 65 to 75 characters per line.
- **Label** (780, `0.76rem`, uppercase, no letter-spacing): Kicker labels and short contract group labels.

### Named Rules

**The One Big Word Rule.** Use display scale for the page or view’s central idea, not for every section.

**The Contract Label Rule.** Labels may be uppercase, but body copy should stay sentence case and plain.

**The No Costume Mono Rule.** Do not use monospace as shorthand for “technical.” Use it only when the text is truly code, metadata, or a numeric readout.

## 4. Elevation

The system is mostly structural, not shadow-heavy. Depth comes from photographic layers, tonal bands, hairline rails, and image overlays. Shadows are allowed on floating image comparison panels, but they should feel like a heavy print or light table surface, not glass.

### Shadow Vocabulary

- **Photo Panel Shadow** (`0 24px 80px oklch(0.18 0.018 76 / 0.18)`): Use for large preview or comparison panels that sit above photography.
- **No Shadow Rest State**: Product controls, lists, chips, and workflow rows should usually rely on borders, tonal surfaces, and spacing instead of drop shadows.

### Named Rules

**The Flat Controls Rule.** Controls are tactile through color, border, and motion, not through heavy shadow.

**The Image Gets Depth Rule.** Reserve dramatic depth for photographs and comparison surfaces.

## 5. Components

### Buttons

- **Shape:** 8px radius, minimum height 46px, inline icon plus text when action meaning benefits from an icon.
- **Primary:** Lab Green background, Darkroom Ink text, 12px 17px padding, 1px green border. Use for start, export, confirm, and safe primary actions.
- **Hover / Focus:** Lift by `translateY(-1px)` and shift to Hover Green. Use `cubic-bezier(0.22, 1, 0.36, 1)` for 180ms transitions. Respect reduced motion.
- **Secondary:** Dark translucent ink surface on photographic or dark backgrounds. Use a warm-tinted 1px border. Never compete with the primary action.

### Chips

- **Style:** Pills with 999px radius, 1px warm translucent border, compact padding, bold text, and optional check icon.
- **Role:** Contract chips show resolved safety facts such as RAW technical development, target gamut, target log curve, LUT output, and Rec.709 JPEG.
- **State:** Selected or verified chips should use an icon plus text, not color alone.

### Cards / Containers

- **Corner Style:** 8px for image panels and framed previews. Avoid large rounded corners on serious product surfaces.
- **Background:** Use Lab Paper, Low Paper, Warm Proof Surface, or darkroom overlays. Do not put cards inside cards.
- **Shadow Strategy:** Only large image panels get the Photo Panel Shadow.
- **Border:** Prefer 1px warm hairlines. Do not use colored side stripes.
- **Internal Padding:** Marketing sections use generous responsive padding. Product panels should use tighter, task-oriented padding.

### Inputs / Fields

- **Style:** Use warm paper or darkroom surfaces with a 1px hairline. Radius should stay near 8px.
- **Focus:** Shift border or ring toward Lab Green, paired with text feedback when the state affects export safety.
- **Error / Disabled:** Disabled export or unsupported source states must explain the blocker in plain language.

### Navigation

- **Style:** Minimal fixed brand nav over photographic surfaces, then compact product navigation inside tools.
- **Typography:** 0.82rem to 0.95rem, strong weight, no all-caps body navigation.
- **Mobile:** Hide secondary text links if necessary, but keep one route to source or support and one route to the RAW lab.

### Signature Component: Compare Panel

The compare panel is the system’s signature motif. It uses a real photograph, a vertical split, a circular handle, and paired labels. It should communicate “before and after” instantly without needing explanatory copy. When reused in product surfaces, keep the split line crisp and avoid making it decorative if there is no real comparison state.

### Signature Component: Contract Rail

The contract rail explains why LumaForge is safe. Use numbered steps or verified chips to show ordered color math. It should never become a generic timeline. Every rail item must correspond to a real transform or safety gate.

For camera-log LUTs, the contract rail should make the scene-referred path visible: RAW technical development, scene-linear handoff, LUT input gamut, LUT input transfer, declared LUT output, and final photo output. Do not describe the default path as display sRGB followed by a LUT.

## 6. Do's and Don'ts

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
- **Don't** use purple gradients, gradient text, decorative orbs, bokeh blobs, or default glassmorphism.
- **Don't** use colored side stripes on cards, list items, callouts, or alerts.
- **Don't** use pure black, pure white, or category-reflex dark blue tool styling.
- **Don't** silently render mismatched gamma, log, gamut, or LUT output choices.
- **Don't** leave template attribution, placeholder demo widgets, or component-gallery copy on user-facing pages.
