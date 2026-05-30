# /raw Darkroom Design System Refactor — Design

- **Date:** 2026-05-30
- **Status:** Approved (design); pending implementation plan
- **Branch:** `refactor/raw-darkroom-design-system`
- **Register:** product (LumaForge `/raw`)

## 1. Problem

The `/raw` surface renders as a cool-slate darkroom, but the design tokens
actively lie about this, which makes the theme un-researchable from the code:

- `--color-lf-paper` is **defined** as warm light paper
  (`oklch(0.964 0.018 86)`) in `src/styles/tailwind.css` `@theme`, then the
  **same token is redefined** as cool slate dark (`oklch(0.118 0.006 255)`)
  roughly 200 lines into `src/modules/raw-processor/raw-lab.css`, inside media
  queries. The token name says "paper/light"; the rendered value is
  "slate/dark."
- The darkroom palette is **defined warm once, then overridden dark twice** —
  the desktop (`min-width: 641px`) and mobile (`max-width: 640px`) blocks repeat
  a near-identical neutral token set (the file itself comments that mobile
  "mirror[s] the desktop block verbatim"). There is no single source of truth.
- A fresh reader (human or agent) who opens `tailwind.css` first concludes the
  product is a warm-paper light theme. This actually happened during the
  research that preceded this spec.

Secondary: the `useDark` / `data-theme` machinery implies a switchable
light/dark theme, but `/raw` is hardwired dark via media queries and ignores it,
and there is dead scaffolding (`useSetTheme` has zero callers).

Tertiary: `raw-lab.css` (915 lines) mixes the token layer, chrome layout, and
intrinsic visual effects in one vanilla-CSS file. The project design-system
direction is Radix-first with Tailwind to finish, and to avoid fresh isolated
vanilla CSS blocks.

## 2. Goals

1. **Token truth:** rename the misleading neutral/surface tokens so names match
   their dark values, preserving every color value byte-for-byte (zero visual
   delta from the rename itself).
2. **Single source of truth:** collapse the "warm definition then dark override
   twice" structure into one canonical darkroom palette declaration, so the
   effective values live in exactly one place.
3. **Un-confusable:** make the fixed-darkroom decision explicit in `DESIGN.md`,
   a token-file header pointer, a `CLAUDE.md` Architecture pointer, and a guard
   test, so future agents cannot repeat the mis-research.
4. **Radix-first + Tailwind-finish:** migrate chrome structure / layout / flat
   color out of vanilla CSS into Radix primitives + Tailwind utilities, leaving
   only genuinely-impossible effects in a thin, clearly-labeled CSS file.
5. **Dead-scaffold cleanup:** delete the genuinely-dead `useSetTheme`; document
   the `/raw` fixed-dark vs. rest-of-app-follows-system boundary.

## 3. Non-goals and scope fences

These must NOT be touched by this refactor:

- `src/modules/raw-processor/components/preview-canvas.css` — the interactive
  **preview executor** frame (gesture `touch-action`, compare `clip-path`,
  pan/zoom `transform`, `will-change`, layer z-index). Preview/export are
  contract-sensitive per `CLAUDE.md`.
- `src/modules/raw-processor/raw-lab.surface.css` — already documented as
  intentional vanilla CSS (`::-webkit-scrollbar`, `box-sizing` reset). Leave it.
- The WebGL preview pipeline and the `src/lib/export` color path. Chrome only.
- The global theme system for **non-`/raw`** surfaces. The landing page
  (`StarBackground`), `sonner` toasts, and the `data-theme` `dark:` variant all
  legitimately follow the system theme and stay intact.
- Color contracts: declared input gamut, transfer/log curve, LUT intent, and
  output handling are out of scope. This is chrome and token-naming work.

## 4. Token model

### 4.1 Rename map (misleading neutral family only)

Only the neutral/surface tokens whose names imply lightness are renamed. The
hue-role tokens (`lf-green*`, `lf-amber*`, `lf-rose`, `lf-sky`, `lf-hist-*`,
`lf-on-photo-*`) already have honest names and keep them.

| Current (lies) | New (honest) | Notes |
|---|---|---|
| `--color-lf-paper` | `--color-lf-surface` | base chrome surface |
| `--color-lf-paper-high` | `--color-lf-surface-raised` | raised material |
| `--color-lf-paper-low` | `--color-lf-surface-sunk` | recessed fill |
| `--color-lf-paper-warm` | `--color-lf-surface-muted` | muted fill |
| `--color-lf-ink` | `--color-lf-on-surface` | primary text |
| `--color-lf-ink-soft` | `--color-lf-on-surface-soft` | secondary text |
| `--color-lf-hero-ink` | `--color-lf-on-photo-ink` | bright text over photo/stage |
| `--color-lf-dark` | `--color-lf-darkroom-stage` | warm export stage bg |
| `--color-lf-dark-low` | `--color-lf-darkroom-stage-low` | warm export stage bg, lower |
| `--color-lf-hairline` | (remove if dead, else `--color-lf-hairline`) | verify no consumers |

Implementation: a mechanical rename across all definitions and consumers
(`.ts`, `.tsx`, `.css`). Values are unchanged. A one-shot codemod / global
replace is appropriate (delegate to Codex, Claude reviews the diff).

### 4.2 Single-source consolidation

- The warm neutral base values in `.raw-lab` never render (the two media queries
  together cover all widths), so the base neutral palette is replaced by the
  **canonical darkroom values** — no more warm-definition-then-dark-override.
- The desktop and mobile blocks hold identical neutral darkroom values today;
  hoist that shared neutral set into the single `.raw-lab` base declaration and
  delete the duplication.
- Keep in the media queries ONLY genuinely viewport-specific tokens and layout:
  - `--color-preview-mat`, `--color-preview-mat-edge`, `--color-preview-border`
    (desktop vs. mobile differ on purpose; guarded by `raw-lab-css.test.ts`).
  - viewport background image / gradient, `grid-template-rows`, stage padding,
    full-bleed mobile stage.
- Keep the deliberately-warm tokens (export `darkroom` field, `lf-amber`
  safelight, `lf-hist-*`). These are design intent, not legacy.
- Remove neutral warm-paper surface tokens that no longer render after
  consolidation.

### 4.3 Canonical location

Each effective value lives in exactly one place:

- `src/styles/tailwind.css` `@theme` keeps the brand hue tokens (`lf-green*`,
  `lf-amber*`, `lf-rose`, `lf-sky`, `lf-hist-*`), the deliberately-warm export
  tokens (renamed `lf-darkroom-stage` / `-low`), the bright on-photo ink
  (renamed `lf-on-photo-ink`), the `lf-on-photo-*` tokens, and the non-color
  design tokens (radius, spacing, shadow, type, ease, duration).
- The **neutral darkroom surface palette** (`lf-surface*`, `lf-on-surface*`, and
  the `.raw-lab` chrome aliases: `--color-background`, `--color-text`,
  `--color-border*`, `--color-fill*`, `--color-material-*`, `--color-stage-*`,
  scrollbar) is defined **once** on the `.raw-lab` base in `raw-lab.css`. No
  warm-paper surface values remain in `@theme`. The `raw-lab.css` header comment
  states this file is the canonical source for the effective surface values and
  points to `DESIGN.md`.

## 5. Theme scaffold

- Delete `useSetTheme` (zero callers; verified).
- Keep `useSyncThemeark` (writes `data-theme`, mounted in `SettingSync`),
  `useThemeAtomValue` (`sonner`), `useIsDark` (`StarBackground`). These serve
  non-`/raw` surfaces that follow the system theme.
- Document, in `DESIGN.md` and the `raw-lab.css` header, that `/raw` is a fixed
  cool-slate darkroom that intentionally ignores `data-theme`, while the rest of
  the app follows the system theme.

## 6. Chrome to Radix-first + Tailwind

Move out of `raw-lab.css` into component `className` strings (Radix primitives
where a primitive fits): structural layout, spacing/rhythm, flat background /
border / text colors, simple states.

Keep in a thin, clearly-labeled CSS file (the `surface.css` model) only effects
that are genuinely impossible or unreasonable in Tailwind:

- multi-stop / layered gradients and radial backgrounds,
- `mix-blend-mode: screen` (histogram additive glow on the dark field),
- `backdrop-filter` glass chrome,
- `::before` / `::after` pseudo-elements (compare hairline, export-ready stripe,
  darkroom field),
- `clip-path` (compare split on chrome, not the preview executor),
- data-attribute state selectors that map to component state.

Work component-by-component: command topbar, tool rail, tool card, export
footer, compare handle, progress / darkroom overlay, mobile mode dock, mobile
empty state, histogram container. Each component is its own checkpoint with a
visual-parity check and green tests before moving on. Never big-bang.

Delegate the mechanical className conversion to Codex; Claude reviews each diff
for contract-sensitive changes (on-photo contrast, blend behavior).

## 7. Anti-confusion deliverables

1. `DESIGN.md`: a top-of-file statement — "`/raw` is a fixed cool-slate
   darkroom; it ignores `data-theme`. The rest of the app follows the system
   theme." Plus a token glossary mapping role to renamed token.
2. `raw-lab.css` header comment: states the fixed-dark decision, that this file
   is the canonical source for the effective darkroom surface values, and points
   to `DESIGN.md`.
3. Token contract test: asserts the canonical darkroom surface tokens exist and
   are dark (lightness below a threshold), and guards that warm-paper light
   values cannot reappear for the surface roles (regression guard against the
   exact confusing state this refactor removes).
4. `CLAUDE.md` Architecture Snapshot: one line pointing agents to `DESIGN.md`
   for the `/raw` theme contract. Highest leverage because `CLAUDE.md` loads
   every session.

## 8. Safety net

- **Value preservation:** the rename changes names only; a mapping check asserts
  old-value equals new-value so the rename has zero visual delta.
- **Visual parity gate:** capture baseline `/raw` screenshots before any change
  (desktop + mobile; empty/boot and sample-stage states; stable selectors).
  Compare after each phase. Browser validation runs under `vite preview` (not
  dev); headless RAW decode is blocked, so use the empty/boot and sample-stage
  states rather than a decoded RAW.
- **Existing guards:** keep `raw-lab-css.test.ts` and
  `CompareSplitHandle.test.tsx` green; update `raw-lab-css.test.ts` intentionally
  for the consolidated structure (it currently asserts the warm base preview-mat
  values and the desktop/mobile split).

## 9. Phasing (each phase ends green and committable)

- **Phase 0 — Baseline:** capture visual-parity reference screenshots.
- **Phase 1 — Token truth:** rename neutral family (values byte-identical);
  consolidate to one canonical darkroom declaration; remove dead warm-paper
  surface tokens; update `raw-lab-css.test.ts`; add token contract test; update
  `DESIGN.md`, `raw-lab.css` header, `CLAUDE.md` pointer. Verify parity
  screenshots identical, tests green.
- **Phase 2 — Theme scaffold:** delete `useSetTheme`; document the `/raw`
  fixed-dark boundary. Verify.
- **Phase 3 — Chrome to Radix + Tailwind:** per-component migration with a
  parity check and tests after each component.

## 10. Verification

Per `CLAUDE.md` progressive verification:

- UI-only chrome / token edits: `pnpm test:ui` + focused lint (or `pnpm lint`).
- App-surface scope (`src`): `pnpm lint:check`, `pnpm test:app`,
  `pnpm native:prepare`, `LUMAFORGE_NATIVE_RUNTIME_MODE=prebuilt pnpm build`.
- Closeout: `pnpm lint`, `pnpm test:run`, `pnpm build`.
- Browser validation for user-visible `/raw` rendering changes (the parity
  gate), including mobile / WebKit chrome.

Commit signing: use `git commit --no-gpg-sign` (SSH signing hangs headless in
this environment).

## 11. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Aggressive chrome rewrite silently shifts darkroom rendering | Per-component visual-parity gate; rename preserves values byte-for-byte; scope fences keep preview/export untouched |
| Token consolidation breaks jsdom tests that read base `.raw-lab` values | Update `raw-lab-css.test.ts` to the consolidated structure intentionally |
| Removing theme scaffold breaks landing/toast | Only `useSetTheme` removed; verified `useSyncThemeark` / `useThemeAtomValue` / `useIsDark` retained |
| Forcing intrinsic effects into Tailwind degrades the look | Keep blend modes, gradients, backdrop-filter, pseudo-elements, clip-path in the thin labeled CSS file |
| Large diff is hard to review | Phase + checkpoint per component; delegate mechanical work to Codex, Claude reviews |

## 12. Open questions

None. Scope confirmed: Phase 3 is fully in scope this round; rename vocabulary
(`surface` / `on-surface` / `sunk`) approved; theme cleanup limited to deleting
`useSetTheme` plus documentation.
