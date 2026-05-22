# LUT Share UX Ralph Loop (2026-05-22)

Persistent memory for the ralph loop refactoring the lumaforge-profiles
manifest sharing surface. Each loop iteration reads this file, picks one
high-leverage pain point not yet listed under **Completed work**, ships it,
and appends a one-line entry. When no pain point remains, the loop appends
`LOOP CONVERGED` to **Completed work** and exits without further commits.

## Scope (four buckets)

1. **Desktop OnlineLutSourceControls refactor.**
   File: `src/modules/raw-processor/components/tools/lut/OnlineLutSourceControls.tsx`
   (432 lines, single component). Decompose, retarget tokens, fix
   info-hierarchy, error/loading/empty states. Entry point lives in
   `LutContractTool.tsx`.
2. **Mobile manifest entry.**
   `MobileLutBrowser.tsx` currently consumes `onlineLutSources.state` passively
   (resources/entries already configured on desktop) — there is **no**
   add/refresh/remove affordance reachable from a mobile-only session.
   `MobileMoreSheet.tsx` is read-only fact rows. Add a discoverable entry —
   most likely a "Sources" tab/section inside `MobileLutBrowser` or a
   dedicated sheet routed from there. Must respect the
   "never dim/blur the live preview" rule for mobile tool sheets.
3. **Visual consistency across desktop + mobile.**
   Anchor to the recent refactor direction: `lf-*` design tokens, Radix Dialog,
   the `Chip` primitive (`src/components/ui/chip.tsx`), and motion presets
   `sheetSpring` / `surfaceFade` from `src/lib/spring`. Match an element to its
   contextual pairing rather than the global same-type family.
4. **Manifest reliability layer.**
   `src/lib/profiles/{catalog,fetch,source-url,lut-contract}.ts` and
   `src/modules/raw-processor/hooks/useOnlineLutSources.ts`. Improve error,
   empty, stale, offline UX surfaces — but do not change the contract semantics
   covered by the existing tests without a deliberate update to those tests.

## Hard constraints

- Single RAW lab boundary: no catalog/batch/account/cloud drift.
- `pnpm` only; `~/` alias for `src` imports.
- Radix first → Tailwind to finish → no fresh isolated vanilla CSS blocks.
- Use `m` from `motion/react` inside existing LazyMotion; prefer `src/lib/spring` presets.
- Do not edit `src/generated-routes.ts` (generated).
- Runtime is `@lumaforge/luma-raw-runtime`, **never** `libraw-wasm`.
- Mobile tool sheets are non-modal — must not dim/blur the live preview.
- Commit with `git commit --no-gpg-sign` (SSH signing hangs headless).
- Conventional commit prefix: `refactor(raw-desktop)`, `feat(raw-mobile)`,
  `fix(profiles)`, `style(raw-mobile)`, etc., matching the recent log style.
- Branch: stay on `main` (recent refactor commits are all on main).
- Do **not** `git push`.

## Per-iteration protocol

1. Read this file. Skim **Completed work** to avoid re-doing finished items.
2. Read the four scope files most relevant to the chosen bucket. Identify
   the single highest-leverage pain point not yet listed. Single-concern.
3. Implement the fix. Stay inside existing patterns (providers, jotai,
   router utilities, motion presets, lf-* tokens, Chip primitive).
4. Verify the touched area:
   - `pnpm lint` — touched files clean. Tolerate pre-existing baseline noise.
   - `pnpm test:run` — relevant tests green; no new regressions.
   - `pnpm build` — must succeed.
5. Commit on `main` with `git commit --no-gpg-sign` and a tight conventional
   message. Append a one-line entry under **Completed work** in the same
   commit (so future iterations can see it).
6. If the audit yields no clean single improvement after honest inspection,
   append `LOOP CONVERGED — <one-line reason>` and exit without committing
   code changes.

## Anti-churn rules

- If a pain point was addressed in **Completed work**, do not relitigate the
  decision. Only revisit if a verified regression appears.
- Do not introduce a new state model — extend `useOnlineLutSources` or its
  consumers instead.
- Do not add a second source of truth for manifest data.
- A single iteration ships one independently reviewable change. If the chosen
  pain point cannot be solved in one focused diff, decompose and ship the
  smallest meaningful slice; record the remaining slices in **Backlog**.

## Backlog (slices waiting for a future iteration)

_(empty — populate as iterations split work)_

## Completed work

_(one line per iteration — newest first)_

- 2026-05-22 — Bucket 1/3 — surfaced per-resource issue messages inline on desktop `OnlineLutSourceControls` (via amber `Chip` primitive, `surface="paper"`, `normal-case`), parity with mobile iteration 3. Scoped the tail global block to only render `!resourceId` issues so per-resource messages no longer double up.
- 2026-05-22 — Bucket 1/3 — swept `OnlineLutSourceControls` clean of legacy tokens (`text-callout`/`text-footnote`/`text-text*`/`bg-fill`/`bg-background`/`border-border`/`text-accent`/raw yellow/`text-[0.64rem]`/`rounded-md`/`rounded-full`) onto the desktop paper-surface `lf-*` family (`lf-ink`, `lf-ink-soft`, `lf-paper`, `lf-hairline`, `lf-green`, `lf-amber-soft`, `lf-control`, `lf-label`, `lf-body`, `lf-eyebrow`, `lf-pill`). Brings desktop into the consistency baseline established by the look-mode audit.
- 2026-05-22 — Bucket 2 — surfaced per-resource issue messages inside each mobile resource card via the `Chip` primitive (amber tone + AlertTriangle). Filters `state.issues` by `resourceId`. Mobile users now see *why* a source failed instead of guessing from a generic "Issue" badge.
- 2026-05-22 — Bucket 2 — added per-resource Refresh + Remove controls and a per-resource loading badge to the mobile online sources cards in `MobileLutBrowser`, mirroring the desktop affordances. Refresh button surfaces `aria-busy` and disables while the active resource resolves.
- 2026-05-22 — Bucket 2 — added URL input + Add submit button to the mobile online LUT sources section of `MobileLutBrowser`, wired through to `useOnlineLutSources.sourceUrlInput / addSourceFromInput`. Mobile-only sessions can now add a manifest source for the first time. Empty-state of the section now self-explains the entry.
