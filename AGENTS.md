# AGENTS.md

Guidance for AI/code agents working in this repository.
Keep changes aligned with the current codebase and product boundary, not generic Vite app assumptions.

## Non-Negotiables

- Use `pnpm` only.
- Do not edit generated files such as `src/generated-routes.ts`.
  Change routes by adding or renaming files under `src/pages/`.
- Use the `~/` alias for imports from `src`.
- Stay inside the shared app runtime patterns: do not recreate the QueryClient, Jotai store, or router plumbing outside the existing providers.
- Do not use `window.location` or other ad hoc navigation paths when the existing router utilities already cover the case.
- For animation, use `m` from `motion/react` inside the existing `LazyMotion` setup in `src/providers/root-providers.tsx`.
  Prefer the presets in `src/lib/spring`.
- Do not describe or reintroduce the RAW runtime as `libraw-wasm`.
  The current runtime boundary is `@lumaforge/luma-raw-runtime`.

## Product Boundary

- LumaForge is a browser-local RAW photo lab for a narrow workflow: `single RAW file -> preview -> look or LUT -> compare -> JPEG export`.
- It is not a desktop-style RAW editor.
  Do not expand changes around catalogs, batch workflows, cloud upload, account systems, local daemons, or broad adjustment panels unless the task explicitly asks for that shift.
- Preview is allowed to optimize for responsiveness through embedded, quick, or HQ stages.
- Export is the authoritative full-resolution path.
  If the runtime cannot prove that export matches the declared pipeline correctly, fail closed instead of exporting a degraded or preview-only result.

## Architecture Snapshot

- `packages/luma-raw-runtime`: browser RAW metadata, decode sessions, processed-window access, export capability facts, and pinned native artifacts.
- `packages/luma-color-runtime`: pure TypeScript color math, LUT contracts, transfer/gamut transforms, graph logic, and GLSL helpers.
- `packages/luma-jpeg-runtime`: bounded row-oriented JPEG encoding.
- `src/lib/gl`: interactive preview rendering.
- `src/lib/export`: worker-driven full-resolution export path.
- `src/modules/raw-processor`: the main `/raw` product workflow and UI surface.
- `src/providers/root-providers.tsx`: the root provider composition.
  Extend this carefully and preserve provider order unless there is a concrete reason to change it.
- `/raw` theme: a fixed cool-slate darkroom defined by `--color-lf-*` in
  `src/styles/tailwind.css` `@theme`; it ignores `data-theme`. See
  `DESIGN.md` "Theme contract" before touching tokens or theme code.

## Implementation Rules

- Follow the existing UI boundaries:
  - primitives in `src/components/ui`
  - shared app components in `src/components/common`
  - domain behavior in `src/modules/<domain>`
- For UI work, start from stable primitives and the existing styling system:
  - prefer Radix-backed primitives or existing app components for interactive
    controls and overlays.
  - use Tailwind utilities, `--color-lf-*` theme tokens, and small component
    refinements to finish visual polish.
  - do not start UI changes by hand-rolling raw HTML or standalone vanilla CSS
    when an existing primitive, component, Tailwind utility, or theme token can
    cover the need.
- Follow the existing state patterns.
  Prefer the helpers in `src/lib/jotai` and the established state locations instead of introducing a second state model.
- Treat color and LUT changes as contract work, not taste work.
  Preserve declared input gamut, transfer/log curve, LUT intent, and output handling instead of adding ad hoc color fixes that merely look acceptable on one sample image.
- When touching `/raw`, keep preview and export responsibilities distinct.
  Interactive preview code and authoritative export code may share intent, but they are not interchangeable executors.

## Spec And Planning Artifacts

- Spec-driven development artifacts live directly under `docs/`, not under
  `docs/superpowers/` or plugin-owned directories.
- Use `docs/specs/` for design/spec documents, `docs/plans/` for
  implementation plans, and `docs/audits/` for audit/review artifacts when a
  written artifact is required.
- If an external workflow or agent skill defaults to `docs/superpowers/...`,
  override that path to the matching `docs/...` directory before writing or
  committing the artifact.

## Git Worktree Policy

- If new work needs isolation, prefer repo-local worktrees under `.worktrees/<branch-name>`.
- Do not default to external worktree paths for this repo.

## Verification

- Use progressive verification so UI iteration does not pay native/runtime build
  costs on every batch:
  - UI-only `/raw` or shared component edits: start with `pnpm test:ui` and a
    focused lint command, or `pnpm lint` when you want autofix.
  - App-surface changes under `src`, `scripts`, or non-native package adapters:
    run `pnpm lint:check`, `pnpm test:app`, `pnpm native:prepare`, and
    `LUMAFORGE_NATIVE_RUNTIME_MODE=prebuilt pnpm build`.
  - Runtime contract changes under `packages/luma-*-runtime`, `src/lib/export`,
    `src/lib/raw`, `src/lib/runtime`, or `src/lib/workers`: run
    `pnpm test:runtime` plus the touched package `typecheck` and `build`
    commands.
  - Native/runtime artifact changes under package `native/` folders or
    `packages/luma-native-artifacts`: run the relevant `build:native`,
    `native:verify`, and native smoke commands.
- Default closeout verification for broad app changes remains:
  - `pnpm lint`
  - `pnpm test:run`
  - `pnpm build`
- `pnpm test:run` is the full Vitest sweep. Do not make it the first command
  after every UI batch when `pnpm test:ui` or `pnpm test:app` gives the faster
  signal needed for the current scope.
- Runtime or package changes usually also need the package-local `build`,
  `typecheck`, and `test` commands.
- Native/runtime artifact changes should also run the relevant `build:native`
  and `native:verify` commands for the touched package.
- CI follows the same split:
  - `app` uses `pnpm lint:check`, `pnpm test:app`, prebuilt native assets, and
    app build checks.
  - `runtime` runs runtime package typecheck/test/build and app adapter tests.
  - `native` installs Emscripten and runs native build/verify/smoke only for
    native artifact paths.
- User-visible `/raw` behavior changes should include browser validation when the change affects interaction, rendering, export handoff, or mobile/WebKit behavior.

## When Unsure

- Follow the current code over old agent habits.
- Follow the README over generic frontend assumptions.
- Keep the product narrow, the color pipeline explicit, and the export path trustworthy.
