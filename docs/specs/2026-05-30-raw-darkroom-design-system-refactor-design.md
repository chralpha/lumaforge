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
- The landing's **separate** warm palette in `src/pages/(main)/index.css`
  (`.lf-landing` `--lf-*`, no `color-` prefix). It is a parallel system the
  `/raw` tokens do not touch; folding the two together is not in scope.
- Color contracts: declared input gamut, transfer/log curve, LUT intent, and
  output handling are out of scope. This is chrome and token-naming work.

## 4. Token model

### 4.0 Corrected architecture (verified)

`--color-lf-*` is a **shared design-token system**, not a `/raw`-private set. It
is consumed three ways: CSS `var()`, Tailwind utilities (`text-lf-ink`,
`bg-lf-paper-high`, `border-lf-hairline`), and Tailwind arbitrary values
(`bg-[oklch(from_var(--color-lf-ink)_l_c_h_/_0.04)]`), across the `ui` primitives
**Button, Slider, Chip** plus `/raw` components and their tests.

Consequences that override the original draft:

- **Tokens must stay registered in `@theme`.** Tailwind v4 only generates
  `text-lf-*` / `bg-lf-*` utilities for `@theme` tokens. They cannot be deleted
  from `@theme`; doing so removes the utilities and breaks Button/Slider/Chip.
- **`lf-hairline` is live**, not dead — `Chip.tsx` uses `border-lf-hairline`.
  Keep it.
- In the **live app these primitives render almost exclusively inside `.raw-lab`
  (dark)**. The landing (`index.sync.tsx`) has its **own separate** warm palette
  under `.lf-landing` (`--lf-paper`, no `color-` prefix) and renders no
  `<Button>`; the only non-`/raw` Button is Footer's `ghost` variant with a
  Pastel color override; the `lf-*` selects are not mounted. So the warm `@theme`
  values render on **no live light surface**.

**Decision (approved):** the canonical `@theme` value for the neutral surface
family is the **dark darkroom value** (single source of truth, honest name AND
value). The `.raw-lab` per-token neutral override is removed.

### 4.1 Rename map

Neutral/surface tokens whose names imply a lightness value are renamed to
role-neutral names (honest regardless of context). Hue-role tokens (`lf-green*`,
`lf-amber*`, `lf-rose`, `lf-sky`, `lf-hist-*`, `lf-on-photo-*`) and `lf-hairline`
already read as roles and keep their names.

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
| `--color-lf-hairline` | `--color-lf-hairline` (unchanged) | live: `Chip` border |

The rename touches **every consumption channel**: CSS `var()` and
`oklch(from var(--color-lf-X) …)`, Tailwind utilities (`text-lf-X`, `bg-lf-X`,
`border-lf-X`, `ring-lf-X`, `outline-lf-X`), Tailwind arbitrary values
(`[oklch(from_var(--color-lf-X)…)]`), and test assertions that reference any of
these. Order replacements longest-first to avoid partial overlaps
(`lf-paper-high` before `lf-paper`; `lf-hero-ink` before `lf-ink`; `lf-dark-low`
before `lf-dark`). Mechanical and scriptable; delegate to Codex, Claude reviews
the diff.

### 4.2 Single-source consolidation

- In `@theme`, the renamed neutral surface tokens take the **dark darkroom
  values** that `.raw-lab` currently overrides to (e.g.
  `--color-lf-surface: oklch(0.118 0.006 255)`,
  `--color-lf-on-surface: var(--color-lf-on-photo-ink)`). One honest definition,
  no warm-to-dark hop.
- Remove the per-token neutral `lf-*` redefinitions from BOTH the desktop
  (`min-width: 641px`) and mobile (`max-width: 640px`) `.raw-lab` blocks. They
  become redundant (the `@theme` value is already the darkroom value), which also
  deletes the desktop/mobile duplication.
- `.raw-lab` keeps only: the Pastel **alias scoping** (`--color-background`,
  `--color-text`, `--color-border*`, `--color-fill*`, `--color-material-*`,
  `--color-stage-*`, scrollbar) mapped to the `lf-*` tokens so the darkroom stays
  scoped to `/raw` and the rest of the app keeps following the system theme; the
  genuinely **viewport-specific** tokens (`--color-preview-mat`,
  `--color-preview-mat-edge`, `--color-preview-border`, guarded by
  `raw-lab-css.test.ts`); and layout (background gradient, `grid-template-rows`,
  stage padding, full-bleed mobile stage).
- Keep the deliberately-warm tokens (export `darkroom` field, `lf-amber`
  safelight, `lf-hist-*`). Design intent, not legacy.

### 4.3 Render-parity note

Because the warm `@theme` values render on no live light surface, and `/raw`
already renders the dark override values, moving the dark values into `@theme`
and dropping the `.raw-lab` override leaves `/raw` **pixel-identical**. The only
theoretical delta is Footer's lone `ghost`-Button hover tint
(`--color-lf-ink` at ~4% opacity) shifting warm to cool; it is imperceptible and
already color-overridden. The visual-parity gate (Section 8) confirms `/raw`
parity.

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
3. Token contract test: asserts the `@theme` neutral surface tokens
   (`lf-surface*`, `lf-on-surface*`) exist and are dark (lightness below a
   threshold), and that `.raw-lab` no longer re-declares them (guards against the
   warm-then-override structure reappearing).
4. `CLAUDE.md` Architecture Snapshot: one line pointing agents to `DESIGN.md`
   for the `/raw` theme contract. Highest leverage because `CLAUDE.md` loads
   every session.

## 8. Safety net

- **Value preservation:** the rename changes token names only. The neutral
  `@theme` values move from their warm defaults to the dark values `.raw-lab`
  already overrode to, so `/raw` renders identical values (Section 4.3). The
  parity gate is the oracle.
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
- **Phase 1 — Token truth:** rename the neutral family across all consumption
  channels; set the `@theme` neutral surface tokens to the dark darkroom values
  and remove the `.raw-lab` per-token neutral override (desktop + mobile);
  update `raw-lab-css.test.ts`; add token contract test; update `DESIGN.md`,
  `raw-lab.css` header, `CLAUDE.md` pointer. Verify parity screenshots identical,
  tests green.
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
| Aggressive chrome rewrite silently shifts darkroom rendering | Per-component visual-parity gate; rename preserves names; `/raw` keeps the same rendered values; scope fences keep preview/export untouched |
| Deleting `lf-*` from `@theme` would break Tailwind utilities (Button/Slider/Chip) | Tokens stay registered in `@theme`; only their value changes (warm to dark) |
| Token consolidation breaks jsdom tests that read base `.raw-lab` values | Update `raw-lab-css.test.ts` to the consolidated structure intentionally |
| Removing theme scaffold breaks landing/toast | Only `useSetTheme` removed; verified `useSyncThemeark` / `useThemeAtomValue` / `useIsDark` retained |
| Forcing intrinsic effects into Tailwind degrades the look | Keep blend modes, gradients, backdrop-filter, pseudo-elements, clip-path in the thin labeled CSS file |
| Large diff is hard to review | Phase + checkpoint per component; delegate mechanical work to Codex, Claude reviews |

## 12. Open questions

None. Scope confirmed: Phase 3 is fully in scope this round; rename vocabulary
(`surface` / `on-surface` / `sunk`) approved; theme cleanup limited to deleting
`useSetTheme` plus documentation; canonical `@theme` neutral value resolved to
the dark darkroom value (single source); `lf-hairline` kept (live `Chip`
consumer); landing's separate `.lf-landing` palette out of scope.
