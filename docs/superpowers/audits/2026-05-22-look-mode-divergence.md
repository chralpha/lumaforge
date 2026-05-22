# Look-Mode Divergence Audit (2026-05-22)

Scope: Look-mode surface only — LUT browse + select + apply + Strength + reset.
Sources: code paths in plan Task 1; design reference in `/tmp/raw-lab-handoff`.

Files inspected:
- `src/modules/raw-processor/components/mobile/MobileLutBrowser.tsx`
- `src/modules/raw-processor/components/mobile/MobileStrengthPanel.tsx`
- `src/modules/raw-processor/components/tools/lut/LutBrowserDialog.tsx`
- `src/modules/raw-processor/components/tools/lut/LUTContractBrowser.tsx`
- `src/modules/raw-processor/components/tools/lut/LUTProfileButton.tsx`
- `src/modules/raw-processor/components/tools/StrengthControl.tsx`
- `src/modules/raw-processor/components/ControlsPanel.tsx` (LUT-related sections)
- `src/modules/raw-processor/raw-lab.css`
- `/tmp/raw-lab-handoff/mobile-raw-lab/project/colors_and_type.css`
- `/tmp/raw-lab-handoff/mobile-raw-lab/project/lib/MobileRawLab.jsx` (Look + LUT browser only)
- `/tmp/raw-lab-handoff/mobile-raw-lab/project/lib/DesktopRawLab.jsx` (Look only)

## Table A — Token escapees (hardcoded literals)

Every row is a literal in a TSX className (or inline gradient) that should
resolve to an `lf-*` token from the plan. File paths are repo-relative.

| # | Location (file:line) | Literal | Layer (className / CSS) | Target `lf-*` token |
|---|---------------------|---------|-------------------------|---------------------|
| 1  | mobile/MobileLutBrowser.tsx:78 | `rounded-md` | className | `rounded-lf-control` (8px) |
| 2  | mobile/MobileLutBrowser.tsx:80 | `border-accent` | className | `border-lf-green` |
| 3  | mobile/MobileLutBrowser.tsx:80 | `bg-accent/15` | className | `bg-lf-green/15` (selected chip → prefer `lf-green-soft`) |
| 4  | mobile/MobileLutBrowser.tsx:80 | `text-white` | className | `text-lf-hero-ink` |
| 5  | mobile/MobileLutBrowser.tsx:82 | `border-amber-400/45` | className | `border-lf-amber/45` |
| 6  | mobile/MobileLutBrowser.tsx:82 | `bg-amber-400/12` | className | `bg-lf-amber/12` (or `bg-lf-amber-soft/12`) |
| 7  | mobile/MobileLutBrowser.tsx:82 | `text-white` | className | `text-lf-hero-ink` |
| 8  | mobile/MobileLutBrowser.tsx:83 | `border-white/15` | className | `border-lf-on-photo-bord-soft` |
| 9  | mobile/MobileLutBrowser.tsx:83 | `bg-black/35` | className | `bg-lf-on-photo-bg` |
| 10 | mobile/MobileLutBrowser.tsx:83 | `text-white/82` | className | `text-lf-hero-ink/82` |
| 11 | mobile/MobileLutBrowser.tsx:83 | `hover:border-amber-400/40` | className | `hover:border-lf-amber/40` |
| 12 | mobile/MobileLutBrowser.tsx:83 | `hover:text-white` | className | `hover:text-lf-hero-ink` |
| 13 | mobile/MobileLutBrowser.tsx:102 | `rounded-full` | className | `rounded-lf-pill` |
| 14 | mobile/MobileLutBrowser.tsx:102 | `text-[0.68rem]` | className | use `lf-label` token family (closest: `lf-label` 0.76rem) — note slight off-spec, propose `lf-label` |
| 15 | mobile/MobileLutBrowser.tsx:104 | `border-amber-400/45` | className | `border-lf-amber/45` |
| 16 | mobile/MobileLutBrowser.tsx:104 | `bg-amber-400/12` | className | `bg-lf-amber/12` |
| 17 | mobile/MobileLutBrowser.tsx:104 | `text-amber-200` | className | `text-lf-amber-soft` |
| 18 | mobile/MobileLutBrowser.tsx:105 | `border-white/18` | className | `border-lf-on-photo-bord-soft` |
| 19 | mobile/MobileLutBrowser.tsx:105 | `bg-black/35` | className | `bg-lf-on-photo-bg` |
| 20 | mobile/MobileLutBrowser.tsx:105 | `text-white/86` | className | `text-lf-hero-ink/86` |
| 21 | mobile/MobileLutBrowser.tsx:309 | `rounded-t-2xl` | className | (sheet rim) → custom `rounded-t-[16px]` is out of token set; nearest is `lf-panel` (8px) — flag as **gap** for Task 2 token additions |
| 22 | mobile/MobileLutBrowser.tsx:309 | `border-white/20` | className | `border-lf-on-photo-bord` |
| 23 | mobile/MobileLutBrowser.tsx:309 | inline `bg-[linear-gradient(180deg,oklch(0.21_0.024_78),oklch(0.13_0.02_76))]` | className | replace with `bg-lf-dark-low` → `bg-lf-dark` gradient utility (token-driven) |
| 24 | mobile/MobileLutBrowser.tsx:309 | `text-white` | className | `text-lf-hero-ink` |
| 25 | mobile/MobileLutBrowser.tsx:309 | `shadow-[0_-22px_50px_oklch(0.04_0.012_76/0.55)]` | className | `shadow-lf-popover` (sheet rim shadow, mirror token) |
| 26 | mobile/MobileLutBrowser.tsx:329 | `bg-text/30` | className | `bg-lf-hero-ink/30` (handle bar) |
| 27 | mobile/MobileLutBrowser.tsx:340 | `border-white/25` | className | `border-lf-on-photo-bord` |
| 28 | mobile/MobileLutBrowser.tsx:340 | `bg-black/35` | className | `bg-lf-on-photo-bg` |
| 29 | mobile/MobileLutBrowser.tsx:340 | `text-white` (+ `[&_svg]:stroke-white`) | className | `text-lf-hero-ink` |
| 30 | mobile/MobileLutBrowser.tsx:353 | `rounded-xl` | className | (12px) — outside token set; propose `rounded-lf-panel` (8px) with explicit gap note |
| 31 | mobile/MobileLutBrowser.tsx:353 | `border-white/15` | className | `border-lf-on-photo-bord-soft` |
| 32 | mobile/MobileLutBrowser.tsx:353 | `bg-black/35` | className | `bg-lf-on-photo-bg` |
| 33 | mobile/MobileLutBrowser.tsx:354 | `text-white` | className | `text-lf-hero-ink` |
| 34 | mobile/MobileLutBrowser.tsx:359 | `rounded-md` | className | `rounded-lf-control` |
| 35 | mobile/MobileLutBrowser.tsx:359 | `border-white/20` | className | `border-lf-on-photo-bord` |
| 36 | mobile/MobileLutBrowser.tsx:359 | `bg-black/35` | className | `bg-lf-on-photo-bg` |
| 37 | mobile/MobileLutBrowser.tsx:359 | `text-white` | className | `text-lf-hero-ink` |
| 38 | mobile/MobileLutBrowser.tsx:359 | `hover:border-amber-400/50` | className | `hover:border-lf-amber/50` |
| 39 | mobile/MobileLutBrowser.tsx:359 | `hover:text-amber-400` | className | `hover:text-lf-amber` |
| 40 | mobile/MobileLutBrowser.tsx:378 | `rounded-full` | className | `rounded-lf-pill` |
| 41 | mobile/MobileLutBrowser.tsx:378 | `text-[0.64rem]` | className | off-spec from `lf-label` (0.76rem) — propose new `lf-eyebrow` micro size or rebase on `lf-label` |
| 42 | mobile/MobileLutBrowser.tsx:380 | `border-amber-400/40` | className | `border-lf-amber/40` |
| 43 | mobile/MobileLutBrowser.tsx:380 | `bg-amber-400/12` | className | `bg-lf-amber/12` |
| 44 | mobile/MobileLutBrowser.tsx:380 | `text-amber-200` | className | `text-lf-amber-soft` |
| 45 | mobile/MobileLutBrowser.tsx:381 | `border-accent/35` | className | `border-lf-green/35` |
| 46 | mobile/MobileLutBrowser.tsx:381 | `bg-accent/12` | className | `bg-lf-green/12` (or `bg-lf-green-soft/12`) |
| 47 | mobile/MobileLutBrowser.tsx:381 | `text-accent` | className | `text-lf-green` |
| 48 | mobile/MobileLutBrowser.tsx:390 | `rounded-xl` | className | `rounded-lf-panel` (gap; 8px not 12px) |
| 49 | mobile/MobileLutBrowser.tsx:390 | `border-white/15` | className | `border-lf-on-photo-bord-soft` |
| 50 | mobile/MobileLutBrowser.tsx:390 | `bg-black/35` | className | `bg-lf-on-photo-bg` |
| 51 | mobile/MobileLutBrowser.tsx:392 | `rounded-md` | className | `rounded-lf-control` |
| 52 | mobile/MobileLutBrowser.tsx:392 | `border-amber-400/35` | className | `border-lf-amber/35` |
| 53 | mobile/MobileLutBrowser.tsx:392 | `bg-amber-400/10` | className | `bg-lf-amber/10` |
| 54 | mobile/MobileLutBrowser.tsx:392 | `text-amber-100` | className | `text-lf-amber-soft` |
| 55 | mobile/MobileLutBrowser.tsx:400 | `text-[0.64rem]` | className | (eyebrow micro) — flag as Bucket A gap; rebase on `lf-label` |
| 56 | mobile/MobileLutBrowser.tsx:400 | `text-white/48` | className | `text-lf-hero-ink/48` |
| 57 | mobile/MobileLutBrowser.tsx:406 | `text-[0.64rem]` | className | (see #55) |
| 58 | mobile/MobileLutBrowser.tsx:406 | `text-white/48` | className | `text-lf-hero-ink/48` |
| 59 | mobile/MobileLutBrowser.tsx:418 | `rounded-md` | className | `rounded-lf-control` |
| 60 | mobile/MobileLutBrowser.tsx:418 | `border-amber-400/35` | className | `border-lf-amber/35` |
| 61 | mobile/MobileLutBrowser.tsx:418 | `bg-amber-400/10` | className | `bg-lf-amber/10` |
| 62 | mobile/MobileLutBrowser.tsx:418 | `text-amber-100` | className | `text-lf-amber-soft` |
| 63 | mobile/MobileLutBrowser.tsx:424 | `text-white/68` | className | `text-lf-hero-ink/68` |
| 64 | mobile/MobileLutBrowser.tsx:431 | `rounded-md` | className | `rounded-lf-control` |
| 65 | mobile/MobileLutBrowser.tsx:431 | `border-amber-400/35` | className | `border-lf-amber/35` |
| 66 | mobile/MobileLutBrowser.tsx:431 | `bg-amber-400/12` | className | `bg-lf-amber/12` |
| 67 | mobile/MobileLutBrowser.tsx:431 | `text-amber-100` | className | `text-lf-amber-soft` |
| 68 | mobile/MobileLutBrowser.tsx:431 | `hover:border-amber-300/60` | className | `hover:border-lf-amber/60` (no 300 in lf, lighten not modelled — single amber token) |
| 69 | mobile/MobileLutBrowser.tsx:431 | `hover:text-white` | className | `hover:text-lf-hero-ink` |
| 70 | mobile/MobileLutBrowser.tsx:447 | `rounded-xl` | className | `rounded-lf-panel` |
| 71 | mobile/MobileLutBrowser.tsx:447 | `border-white/15` | className | `border-lf-on-photo-bord-soft` |
| 72 | mobile/MobileLutBrowser.tsx:447 | `bg-black/42` | className | `bg-lf-on-photo-bg` (closest; on-photo-bg is 0.48) |
| 73 | mobile/MobileLutBrowser.tsx:457,466 | `border-white/15`, `bg-black/35`, `text-white/68`, `border-amber-400/45`, `bg-amber-400/12`, `text-amber-100` | className | same as rows 8/9/63/5/6/54 — tab pair |
| 74 | mobile/MobileLutBrowser.tsx:488 | `border-white/18`, `bg-black/35`, `text-white`, `placeholder:text-white/42`, `focus:border-amber-400/55` | className | `border-lf-on-photo-bord-soft`, `bg-lf-on-photo-bg`, `text-lf-hero-ink`, `placeholder:text-lf-hero-ink/42`, `focus:border-lf-amber/55` |
| 75 | mobile/MobileLutBrowser.tsx:500,529,564,590 | `text-[0.64rem]` + `text-white/48` (eyebrow group label) | className | eyebrow micro (see #55), `text-lf-hero-ink/48` |
| 76 | mobile/MobileLutBrowser.tsx:516,546 | `text-white/58` | className | `text-lf-hero-ink/58` |
| 77 | mobile/MobileLutBrowser.tsx:555,613 | `text-white/68` | className | `text-lf-hero-ink/68` |
| 78 | mobile/MobileLutBrowser.tsx:635 | `border-white/20`, `bg-black/35` | className | `border-lf-on-photo-bord`, `bg-lf-on-photo-bg` |
| 79 | mobile/MobileLutBrowser.tsx:639,642 | `text-white`, `text-white/70` | className | `text-lf-hero-ink`, `text-lf-hero-ink/70` |
| 80 | mobile/MobileLutBrowser.tsx:660 | `rounded-md`, `border-accent/30`, `bg-accent/10`, `text-accent` | className | `rounded-lf-control`, `border-lf-green/30`, `bg-lf-green/10`, `text-lf-green` |
| 81 | mobile/MobileLutBrowser.tsx:672 | `rounded-xl`, `border-white/15`, `bg-black/35` | className | `rounded-lf-panel`, `border-lf-on-photo-bord-soft`, `bg-lf-on-photo-bg` |
| 82 | mobile/MobileLutBrowser.tsx:675 | `text-white` | className | `text-lf-hero-ink` |
| 83 | mobile/MobileLutBrowser.tsx:678 | `rounded-full`, `border-white/20`, `bg-black/35`, `text-[0.64rem]`, `text-white/70` | className | `rounded-lf-pill`, `border-lf-on-photo-bord`, `bg-lf-on-photo-bg`, eyebrow micro, `text-lf-hero-ink/70` |
| 84 | mobile/MobileLutBrowser.tsx:689 | `rounded-md`, `border-white/15`, `bg-black/25`, `hover:border-amber-400/40` | className | `rounded-lf-control`, `border-lf-on-photo-bord-soft`, `bg-lf-on-photo-bg` (note 0.25 vs 0.48 — propose `bg-lf-on-photo-bg/52`), `hover:border-lf-amber/40` |
| 85 | mobile/MobileLutBrowser.tsx:698,701 | `text-white`, `text-amber-400` | className | `text-lf-hero-ink`, `text-lf-amber` |
| 86 | mobile/MobileStrengthPanel.tsx:48 | `min-h-[46px]` | className | spacing gap; closest is no `lf-` spacing token at 46px — flag for Task 2 (44px ergonomic tap floor or new `lf-tap`) |
| 87 | mobile/MobileStrengthPanel.tsx:48 | `rounded-lg` | className | `rounded-lf-control` (8px vs Tailwind `lg` 8px) — match |
| 88 | mobile/MobileStrengthPanel.tsx:48 | `text-[0.82rem]` | className | closest is `lf-control` (0.78rem) — slight off-spec; propose `lf-control` |
| 89 | mobile/MobileStrengthPanel.tsx:50 | `border-amber-400` | className | `border-lf-amber` |
| 90 | mobile/MobileStrengthPanel.tsx:50 | `bg-amber-400/15` | className | `bg-lf-amber/15` (or `bg-lf-amber-soft`) |
| 91 | mobile/MobileStrengthPanel.tsx:50 | `text-amber-300` | className | `text-lf-amber` |
| 92 | mobile/MobileStrengthPanel.tsx:51 | `border-white/15`, `bg-black/38`, `text-white`, `hover:border-white/30` | className | `border-lf-on-photo-bord-soft`, `bg-lf-on-photo-bg`, `text-lf-hero-ink`, `hover:border-lf-on-photo-bord` |
| 93 | mobile/MobileStrengthPanel.tsx:59 | `text-white/65` | className | `text-lf-hero-ink/65` |
| 94 | tools/lut/LutBrowserDialog.tsx:104 | `z-[59]` + `pointer-events-none fixed inset-0 bg-transparent` | className | no token needed; overlay is transparent |
| 95 | tools/lut/LutBrowserDialog.tsx:112 | `rounded-md` | className | `rounded-lf-control` |
| 96 | tools/lut/LutBrowserDialog.tsx:112 | `border-border` | className | `border-lf-hairline` |
| 97 | tools/lut/LutBrowserDialog.tsx:112 | `bg-background/95` | className | `bg-lf-paper/95` |
| 98 | tools/lut/LutBrowserDialog.tsx:112 | `shadow-lg` | className | `shadow-lf-popover` |
| 99 | tools/lut/LutBrowserDialog.tsx:112 | `backdrop-blur-background` | className | keep (engine-level utility); no `lf-` token analog |
| 100 | tools/lut/LutBrowserDialog.tsx:113 | `max-[720px]:bottom-[calc(62px+max(8px,env(safe-area-inset-bottom))+min(56svh,430px)+8px)]` + the rest of the responsive chain | className | layout math; no token (out of scope literals — keep) |
| 101 | tools/lut/LutBrowserDialog.tsx:147 | `text-callout`, `text-text` | className | `text-lf-body` (callout maps closest); `text-lf-ink` |
| 102 | tools/lut/LutBrowserDialog.tsx:152 | `text-footnote`, `text-text-secondary` | className | nearest is `lf-label`; `text-lf-ink-soft` |
| 103 | tools/lut/LutBrowserDialog.tsx:161 | `rounded-md`, `border-border`, `bg-background`, `text-text-secondary`, `hover:border-accent/50`, `hover:bg-fill-secondary`, `hover:text-text`, `focus-visible:outline-accent` | className | `rounded-lf-control`, `border-lf-hairline`, `bg-lf-paper`, `text-lf-ink-soft`, `hover:border-lf-green/50`, `hover:bg-lf-paper-low`, `hover:text-lf-ink`, `focus-visible:outline-lf-green` |
| 104 | tools/lut/LUTContractBrowser.tsx:221,230 | `min-h-8`, `rounded-md`, `border-border`, `bg-background`, `text-callout`, `text-text-secondary`, `hover:border-accent/40`, `focus-visible:outline-accent`, `aria-selected:border-accent/50`, `aria-selected:bg-accent/10`, `aria-selected:text-accent` | className | `rounded-lf-control`, `border-lf-hairline`, `bg-lf-paper`, `text-lf-body`, `text-lf-ink-soft`, `hover:border-lf-green/40`, `focus-visible:outline-lf-green`, `aria-selected:border-lf-green/50`, `aria-selected:bg-lf-green-soft/35` (or `bg-lf-green/10`), `aria-selected:text-lf-green` |
| 105 | tools/lut/LUTContractBrowser.tsx:246 | `h-8`, `border-border`, `bg-background`, `text-xs`, `text-text`, `placeholder:text-text-tertiary`, `focus:border-accent`, `focus:ring-accent/20` | className (inputClassName) | `border-lf-hairline`, `bg-lf-paper`, text size `lf-control`, `text-lf-ink`, `placeholder:text-lf-ink-soft/65`, `focus:border-lf-green`, `focus:ring-lf-green/20` |
| 106 | tools/lut/LUTContractBrowser.tsx:258,281,311,330 | `text-footnote`, `text-text-secondary` (eyebrow above grouped lists) | className | `lf-label` family; `text-lf-ink-soft` |
| 107 | tools/lut/LUTContractBrowser.tsx:302,347 | `text-callout`, `text-text-secondary` (empty-state copy) | className | `text-lf-body`, `text-lf-ink-soft` |
| 108 | tools/lut/LUTProfileButton.tsx:32 | `rounded-md`, `border-border`, `bg-background`, `text-callout`, `text-text-secondary`, `hover:border-accent/50`, `hover:bg-fill-secondary`, `hover:text-text`, `focus-visible:outline-accent` | className | `rounded-lf-control`, `border-lf-hairline`, `bg-lf-paper`, `text-lf-body`, `text-lf-ink-soft`, `hover:border-lf-green/50`, `hover:bg-lf-paper-low`, `hover:text-lf-ink`, `focus-visible:outline-lf-green` |
| 109 | tools/lut/LUTProfileButton.tsx:33 | `border-yellow-600/30`, `bg-yellow-500/10`, `text-text` (highlighted variant) | className | `border-lf-amber/45`, `bg-lf-amber/12`, `text-lf-ink` (alt: `bg-lf-amber-soft/35`) |
| 110 | tools/lut/LUTProfileButton.tsx:34 | `border-accent`, `bg-accent/10`, `text-text` (active variant) | className | `border-lf-green`, `bg-lf-green-soft/35` (or `bg-lf-green/10`), `text-lf-ink` |
| 111 | tools/StrengthControl.tsx:30 | `opacity-50` (disabled) | className | no `lf-` token; keep |
| 112 | tools/StrengthControl.tsx:41 | `w-full` | className | layout only; no token |
| 113 | ControlsPanel.tsx:80 | `rounded-md`, `text-xs` | className (LUTProfileButton local copy) | `rounded-lf-control`, `text-lf-control` |
| 114 | ControlsPanel.tsx:82 | `focus-visible:outline-primary` | className | `focus-visible:outline-lf-green` |
| 115 | ControlsPanel.tsx:83 | `border-accent`, `bg-accent/10`, `text-text` (active) | className | `border-lf-green`, `bg-lf-green/10`, `text-lf-ink` |
| 116 | ControlsPanel.tsx:85 | `border-accent/40`, `bg-fill`, `text-text` (highlighted) | className | `border-lf-green/40`, `bg-lf-paper-low`, `text-lf-ink` |
| 117 | ControlsPanel.tsx:86 | `border-border`, `bg-background`, `text-text-secondary`, `hover:border-accent/40`, `hover:text-text` | className | `border-lf-hairline`, `bg-lf-paper`, `text-lf-ink-soft`, `hover:border-lf-green/40`, `hover:text-lf-ink` |
| 118 | ControlsPanel.tsx:149 | `h-8`, `text-xs` (search input) | className | `text-lf-control` |
| 119 | ControlsPanel.tsx:155,174 | `text-[11px]`, `font-medium`, `uppercase`, `text-text-tertiary` (eyebrow) | className | propose `lf-label` micro; `text-lf-ink-soft` |
| 120 | ControlsPanel.tsx:191 | `text-xs`, `text-text-tertiary` (empty-state) | className | `text-lf-control`, `text-lf-ink-soft` |
| 121 | ControlsPanel.tsx:234,239,259 | `rounded-md`, `border-accent/30`, `bg-accent/10`, `text-xs`, `text-text-secondary` (advisory banner) | className | `rounded-lf-control`, `border-lf-green/30`, `bg-lf-green/10`, `text-lf-control`, `text-lf-ink-soft` |
| 122 | ControlsPanel.tsx:245,252 | `text-text-tertiary`, `text-text` (contract terms) | className | `text-lf-ink-soft`, `text-lf-ink` |
| 123 | ControlsPanel.tsx:312 | `gap-6`, `p-5`, `bg-material-medium`, `rounded-xl`, `border-border` (panel root) | className | spacing keeps; `bg-lf-paper-high`, `rounded-lf-panel`, `border-lf-hairline` |
| 124 | ControlsPanel.tsx:321,331,348,371 | `text-sm`, `font-medium`, `text-text` (section labels) | className | propose `lf-control` or `lf-label`; `text-lf-ink` |
| 125 | ControlsPanel.tsx:332,363,383 | `text-xs`, `leading-relaxed`, `text-text-secondary` / `text-text-tertiary` (helper copy) | className | `text-lf-control`, `text-lf-ink-soft` |

Notes / gaps (for Task 2 token additions):
- 12px radius (`rounded-xl`) is used on every mobile card. The token set has
  `lf-panel` at 8px. Either rebase mobile cards on 8px or extend tokens with
  `lf-card` at 12px before Task 6 lands.
- A "micro" eyebrow size (`text-[0.64rem]`, `text-[0.68rem]`) is used in many
  places. The smallest design token is `lf-label` at 0.76rem. Plan needs a
  `lf-eyebrow` micro (~0.66rem) or to lift the literals to `lf-label`.
- `text-[0.82rem]` on the strength chip is between `lf-control` (0.78rem) and
  `lf-body` (1.03rem). Propose `lf-control`.
- Mobile tap floor of 46–48px has no token (the design CSS uses `48px` for
  CTA). Propose `lf-tap` minimum-height token in Task 2.

## Table B — Component-shape rules in raw-lab.css consumed by Look

Bucket A literals are catalogued in Table A — they do not appear in this
table. Each row below is a selector block in `src/modules/raw-processor/raw-lab.css`.

| # | Selector | Used by (component) | Bucket (B/C/D) | Migration target |
|---|----------|--------------------|----------------|-----------------|
| 1 | `.raw-lab` (root vars + grid + height) | `RawLab.tsx` (and via `data-mode` overlays); Look chrome inherits color tokens | B (palette tokens) | Replace the bag of `--color-*` aliases with `var(--color-lf-*)` references; selector shape (grid/height) stays in `raw-lab.surface.css` |
| 2 | `.raw-lab, .raw-lab *, ::before, ::after` (`box-sizing`) | universal reset | D | `raw-lab.surface.css` |
| 3 | `.raw-lab-shell` (grid) | `RawLab.tsx` / shell layout | B | move to `RawLab` className via `grid grid-cols-...` tokens |
| 4 | `.raw-tool-surface` (border/background/grid/scrollbar coupling) | `RawToolSurface.tsx:327`; this is the Look mode container on desktop | B (shape) + C (scrollbar palette retarget) | Bucket B parts → `RawToolSurface` className; Bucket C parts (scrollbar color) stay CSS but retarget to `var(--color-lf-*)` |
| 5 | `.raw-tool-surface, [data-raw-lut='source-browser-list'], [data-raw-lut='contract-browser-list']` (scrollbar-color + scrollbar-width) | `RawToolSurface`, online LUT source list, `LUTContractBrowser` list | C | retarget to `var(--lf-hairline)` and `var(--lf-green-deep)` |
| 6 | `::-webkit-scrollbar` (width 10px) on the same selector group | same as #5 | D | `raw-lab.surface.css` |
| 7 | `::-webkit-scrollbar-track` | same group | D | `raw-lab.surface.css` |
| 8 | `::-webkit-scrollbar-thumb` (min-height, border, radius, background) | same group | C | retarget background to `var(--lf-hairline)` / `var(--lf-green-deep)` |
| 9 | `::-webkit-scrollbar-thumb:hover` | same group | C | retarget to `var(--lf-green-hover)` |
| 10 | `::-webkit-scrollbar-corner` | same group | D | `raw-lab.surface.css` |
| 11 | `.raw-histogram-plot` (background + inset shadows) | `HistogramTool.tsx` — out of Look scope (Histogram) | OUT OF SCOPE (noted) | n/a (Tone/Histogram path) |
| 12 | `.raw-histogram-grid line`, channel fills, channel lines, luma | `HistogramTool.tsx` — out of Look scope | OUT OF SCOPE | n/a |
| 13 | `.raw-lab-stage` (positioning, padding) | `ComparePreviewStage.tsx` etc. — preview/compare, not Look chrome | OUT OF SCOPE | n/a |
| 14 | `.raw-lab-stage[data-preview-state=...]` | preview state coloring | OUT OF SCOPE | n/a |
| 15 | `.raw-lab-sample*` | demo/sample placeholder | OUT OF SCOPE | n/a |
| 16 | `.raw-lab-compare-*` | `CompareSplitHandle.tsx` — compare, not Look | OUT OF SCOPE | n/a |
| 17 | `.raw-progress-*` | `ProgressOverlay.tsx` — not Look | OUT OF SCOPE | n/a |
| 18 | `.raw-mobile-empty*` | `MobileLabChrome.tsx` empty branch (Look surface is hidden in empty) | OUT OF SCOPE (empty branch, not Look chrome) | n/a |
| 19 | `@media (max-width: 980px) .raw-lab` / `.raw-lab-shell` / `.raw-tool-surface` | shell, tool surface | B | move to `RawLab`/`RawToolSurface` responsive className |
| 20 | `@media (max-width: 640px) .raw-lab` (mobile palette override) | shell-wide on mobile | B (palette tokens) | replace `--color-*` overrides with `--color-lf-*` (dark mode set) and inline at `RawLab` |
| 21 | `@media (max-width: 640px) .raw-lab-shell, .raw-lab-stage, .raw-lab-stage-frame` | shell/stage | OUT OF SCOPE (stage), B (shell) for Look mode container |
| 22 | `@media (max-height: 480px) .raw-lab header[role='banner']` | header compaction | B | move to `WorkspaceHeader` className |
| 23 | `@media (prefers-reduced-motion: reduce) .raw-lab *` | universal | D | `raw-lab.surface.css` |

Out-of-scope-but-noted (referenced for completeness, not migrated by Tasks
9/10): `.raw-lab-stage*`, `.raw-lab-sample*`, `.raw-lab-compare-*`,
`.raw-progress-*`, `.raw-histogram-*`, `.raw-mobile-empty*`. These remain in
`raw-lab.css` until the Tone/Compare/Histogram/Progress/Empty pilots run.

## Table C — Sheet/popover behaviour inventory

| # | Surface | File:line | Current impl | Has focus trap? | Has scroll lock? | Has escape? | Motion source |
|---|---------|-----------|--------------|-----------------|------------------|-------------|---------------|
| 1 | Mobile LUT browser sheet | `mobile/MobileLutBrowser.tsx:301-714` | hand-rolled `<m.aside>` + `useDragControls` inside `AnimatePresence`; `role="dialog"` `aria-modal="false"`; close via X button + drag-dismiss when `info.offset.y > 80 || info.velocity.y > 500` | No | No (page scroll lock not applied; sheet body has its own `overflow-y-auto`) | No (no `Escape` key handler bound) | ad-hoc: `motion/react` `SHEET_SPRING` for enter/exit, no Radix scaffolding |
| 2 | Mobile contract editor sub-panel | `mobile/MobileLutBrowser.tsx:446-621` (rendered inside the sheet when `contractEditorOpen`) | inline conditional `<div>` with `role="tablist"` tabs; no dialog semantics | No | No (inherits sheet) | No | none (no motion) |
| 3 | Desktop LUT source browser dialog | `tools/lut/LutBrowserDialog.tsx:97-170` (`kind="source"` consumer) | Radix `Dialog` (`@radix-ui/react-dialog`) with `modal={false}`, `Portal`, `Content`; close via `DialogPrimitive.Close` + custom pointerdown-outside guard | Partial — Radix Dialog provides focus management; `modal={false}` means no focus trap, but `onCloseAutoFocus={preventDefault + queueMicrotask(restoreFocus)}` restores focus to trigger | No (non-modal — no scroll lock; `modal={false}`) | Yes — Radix Dialog binds `Escape` by default (and `onPointerDownOutside` close on outside pointerdown) | none explicit (Radix Dialog has no enter motion here; `forceMount` keeps DOM, opacity controlled by `open`) |
| 4 | Desktop LUT contract browser dialog | `tools/lut/LUTContractBrowser.tsx:188-355` (wraps `LutBrowserDialog` with `kind="contract"`) | same as #3 (delegates to `LutBrowserDialog`) | Partial (same as #3) | No (same) | Yes (same) | none (same) |
| 5 | Desktop LUT browser overlay sibling | `tools/lut/LutBrowserDialog.tsx:103-105` | `<div data-raw-lut-browser-overlay="" />` — pointer-events: none, transparent, no behaviour | n/a | n/a | n/a | none |
| 6 | Inline contract selector (legacy) | `ControlsPanel.tsx:138-198` (`LUTProfileSelector`) | inline `<div>` collapsing under `LUTProfileStatus` toggle; not a dialog | n/a | n/a | n/a | none |

Concrete gaps for Task 5 (route mobile through Radix Dialog):
- Mobile sheet has no Escape key handler. Radix Dialog adds it.
- Mobile sheet does not scroll-lock the underlying page. With `modal={true}`,
  Radix Dialog adds `data-scroll-locked` automatically.
- Mobile sheet does not focus-trap; Radix Dialog adds a trap when modal.
- Mobile sheet uses ad-hoc `m.aside` motion; replace with Radix `Content` and
  wrap in `m.div` driven by the new `sheetSpring` motion preset (Task 3) so
  the desktop popover and mobile sheet share `surfaceFade` for the overlay
  and `sheetSpring` for the panel.

## Table D — Primitive coverage

| Concept in Look | Current mobile | Current desktop | Shared primitive exists? | Action |
|-----------------|----------------|-----------------|--------------------------|--------|
| LUT preset card | inline JSX in `MobileLutBrowser.tsx` (the resource-entry button at `:686-705` is the closest analog; no thumbnail strip exists yet in code) | `LUTProfileButton.tsx` (no thumbnail; text-only) | No | Promote shared `LutCard` once thumbnails land OR keep separate but share `Chip` + surface tokens for the picker rows |
| Contract chip | inline `<span>` (`ContractChip` local to `MobileLutBrowser.tsx:92-116`) | inline JSX inside `ControlsPanel.LUTProfileStatus` (`p.grid` rows at `:244-256`) and `LutBrowserDialog` title/description bar | No (`Chip` primitive does not exist) | Create `~/components/ui/chip/` (Task 4) and route both consumers through it |
| Strength segments | `MobileStrengthPanel.tsx` (custom `m.button` grid) | `StrengthControl.tsx` via `SegmentGroup`/`SegmentItem` from `~/components/ui/segment` | Partial (desktop uses shared `SegmentGroup`; mobile does not) | Route mobile through `SegmentGroup` too OR keep separate but adopt `Chip` tokens; either way share lf tokens |
| Sheet/popover surface | hand-rolled `m.aside` (`MobileLutBrowser.tsx:303`) | Radix Dialog via `LutBrowserDialog.tsx` | Partial | Route mobile through Radix Dialog (Task 5); both consume `surfaceFade` + `sheetSpring` motion presets |
| Eyebrow label ("Look", "Strength") | inline (no eyebrow currently in mobile sheet; the `text-[0.64rem] uppercase` micro-label is the closest) | inline `text-footnote` + `uppercase` in `LUTContractBrowser.tsx:258,281,311,330` (and `text-[11px] uppercase` in `ControlsPanel.tsx:155,174`) | No (no `Eyebrow` primitive; design CSS provides `.lf-label` class) | Keep CSS-class approach; add to Bucket A audit (Tailwind utility chain → `lf-label` token + Tailwind class once Task 2 adds the token; no new primitive needed) |
| Reset button (LUT clear / Compare reset) | "Clear" button at `MobileLutBrowser.tsx:359` | "Reset compare view" / `LutDropzone` clear in `ControlsPanel.tsx:336-342` and the dropzone clear path | Partial (`Button` primitive exists) | No new primitive; align tokens via Tasks 6/8 |
| Search input | bare `<input>` at `MobileLutBrowser.tsx:480-489` | shared `Input` primitive at `LUTContractBrowser.tsx:240-247` and `ControlsPanel.tsx:143-150` | Partial | Route mobile through shared `Input` (or at minimum align tokens) |
| Tab pair (Input / Output contract step) | inline `<button role="tab">` at `MobileLutBrowser.tsx:453-470` | inline `<button role="tab">` at `LUTContractBrowser.tsx:217-234` | No (no `Tabs` primitive used here; both reinvent) | Out of scope for this pilot; flag for later — keep inline but apply `Chip`/segment tokens |
| Close (X) button | `IconButton` at `MobileLutBrowser.tsx:335-341` | `DialogPrimitive.Close` styled inline at `LutBrowserDialog.tsx:157-164` | Partial (mobile uses shared `IconButton`; desktop uses Radix Close styled directly) | Align via tokens; no new primitive |
| LUT thumbnail (per design handoff `mrl-look-card`) | not implemented in mobile sheet today (resource-entry text rows only) | not implemented in desktop today (`LUTProfileButton` is text-only) | No | Out of scope for Look pilot Tasks 2–12; flag as a later add — when it lands it should consume `LutCard` |
| Backdrop / overlay | none on mobile (sheet is `bg-[linear-gradient(...)]` over preview, no scrim) | transparent `<div data-raw-lut-browser-overlay />` (no visual scrim) | n/a | When Task 5 routes mobile through Radix Dialog, both surfaces will share the same `surfaceFade` overlay treatment |
