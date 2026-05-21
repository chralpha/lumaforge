# /raw Heavy-Component / UI Feedback Synchronization

- Date: 2026-05-21
- Status: Aligned with user — proceeding to plan
- Scope: All `/raw` interactions that cross a Worker boundary, hit WASM init, await an OPFS/network roundtrip, or block the main thread for more than one frame. Covers RAW upload (first & replace), local LUT load, online LUT fetch, full-resolution export, and interrupted-export recovery. Out of scope: routing/navigation, tool panel toggles, tone sliders, and any sub-frame main-thread work.
- Predecessor work: the prewarm + Dropzone changes shipped on 2026-05-21 (`rawRuntimeAdapter.prewarm()`, always-mounted file input). This spec codifies the discipline behind those changes and extends it to the rest of the `/raw` surface.

## Background & Problem

`/raw` runs three heavy subsystems behind a SPA shell: the RAW WASM runtime (`@lumaforge/luma-raw-runtime`), the JPEG worker pool (full-resolution export), and the WebGL preview pipeline. Each has non-trivial cold-start cost. Past incidents at the seam between UI feedback and heavy work include:

1. The empty-stage `Dropzone` used an off-DOM `document.createElement('input')` for the file picker. Under WebKit and after repeated clicks the change event sometimes never fired, manifesting as "first upload silently fails, needs a retry."
2. The RAW runtime was lazily imported only on first upload. The dynamic `import()` + `runtime.init()` worker spawn happens while the main thread is also finishing initial hydration, so `setStatus('loading')` lands but does not paint until WASM is fetched — perceived as "the backend is already running, the UI is out of sync."
3. Multiple parallel `status`/`isProcessing` fields exist across the top-level atom, `session.renderState`, and `session.exportState`. Consumers occasionally OR them together to derive a local "loading" boolean, and the derived value disagrees with neighbour components.

These are all instances of the same root: the *visual contract* with the user ("acknowledge my action within ~100ms, then keep telling me the truth") and the *work contract* with the runtime ("fetch WASM, spawn workers, decode, process, encode") are not the same state machine, but the codebase keeps treating them as one. This spec separates them and gives each a discipline.

## Decisions (confirmed with user)

- Scope: the full `/raw` heavy-interaction surface (not just the onboarding upload path, not project-wide).
- Prescription level: **principles + contracts**. Each section names a principle, fixes the interface shape the principle implies, points at the existing `/raw` applications, lists anti-patterns, and gives a soft (qualitative) success criterion. No hard ms targets.
- State machine philosophy: **codify the existing layered split** (capability gate / top-level `ProcessingStatus` / `session.renderState` / `session.exportState`). Do not merge them into one phase machine. Make the layering explicit and forbid cross-layer OR in consumer components.
- Success criteria: soft. No hard INP/paint ms numbers; PR reviewers use the qualitative metric in each section as the rubric.
- Framing: **lifecycle**. Sections walk the user-perceived time axis `predict → ack → load → progress → complete → recover`. Two appendices then provide a layer cheat sheet and a named-pattern table for PR-review shorthand.

## Carry-Over Principles

Constants that govern every section:

- The visual contract and the work contract are independent state machines that converge. The codebase has one authoritative cross-layer derive site (`useRawProcessor`); everything below it consumes single derived values.
- Phases advance monotonically within a single user-intent lifecycle. Backwards transitions exist only as explicit `reset()` / `error` / `cancelled`.
- `prewarm()` is silent on failure. The real entry path is the only legitimate error channel for any given user intent.
- Test environment (`import.meta.env.MODE === 'test'`) short-circuits any side-effect-only behaviour (prewarm, idle-time work). Tests never observe nondeterministic warmup races.
- All scoping, behavioural invariants, and warm darkroom identity from prior specs (export authority, fail-closed, preview-vs-export executor separation, mobile WebKit handling) are untouched.

## Glossary

- *Heavy work*: any operation that crosses a Worker boundary, hits WASM init, awaits an OPFS/network roundtrip, or blocks the main thread for more than one frame.
- *Phase*: a named, monotonic step in the lifecycle of a single user intent.
- *Intent signal*: any observable user behaviour that predicts a heavy action — route mount, viewport entry, pointer hover, keyboard focus. Commit (click/file-select) is not an intent signal, it is the terminal event.
- *Optimistic ack*: a visual transition committed before the heavy work has produced quantifiable progress.
- *Paint budget*: the maximum synchronous work allowed between a user event and the next paint. Soft target: ≤ 1 frame (~16ms).

## Section 1 · Predict (intent prediction & prewarm)

**Principle.** Heavy work starts on intent, not on commit. Every zero-cost intent signal that buys real commit-time latency must be wired.

**Contract.**

- Each heavy subsystem exposes a `prewarm(): Promise<void>` that is **idempotent** (repeat calls do not rebuild), **silent on failure** (errors do not surface to UI; real entry paths surface them with full context), and **input-free** (does not accept a `File` or any user-intent payload — that is partial load, not warmup).
- Callers invoke prewarm from a fire-and-forget `useEffect` with explicit scheduling: `requestIdleCallback` preferred, `setTimeout(_, ≥ 200ms)` as fallback. Module top-level side-effects to "warm" a subsystem are forbidden — they tax non-/raw visitors and complicate SSR/test.
- Test env must short-circuit prewarm (`import.meta.env.MODE === 'test'`).

**`/raw` applications.**

- ✅ Shipped: `rawRuntimeAdapter.prewarm()` invoked from `RawProcessorView` mount via `requestIdleCallback`.
- ⏳ Candidate: JPEG worker pool prewarm folded into the same effect so the first export does not pay a cold-start cost.
- ⏳ Candidate: UploadDock `pointerenter` / `focus` upgraded to an immediate prewarm trigger, covering the case where idle never runs before the user clicks.

**Anti-patterns.**

- Module-import side-effects to "warm" a subsystem.
- Unwrapped prewarm errors leaking to `console.error` and polluting test output.
- Treating "start decoding this file" as prewarm — that is already real work, not prediction.

**Soft metric.** After the user reads the empty-state copy (~2–3 seconds) and clicks for the first time, the runtime should already be ready or in its final initialisation step. There should be no visible gap between `setStatus(next)` and the spinner appearing.

## Section 2 · Ack (optimistic acknowledgement)

**Principle.** Click-to-visible-feedback must beat the human "did anything happen?" threshold (~100ms). The visual transition is committed in the event handler itself, before any `await` competes for ordering.

**Contract.**

- Heavy entry-point handlers MUST call the visible state mutation (`setStatus`, `setSession`, etc.) **before** any synchronous teardown of prior resources (`abortRuntimeWork`, `revokeCurrentEmbeddedPreviewUrl`, `replaceFile`, ref nulling). Teardown happens after the ack commits.
- React 18 urgent updates fire naturally inside click handlers; the heavy work proper, if it touches React state, goes through `useTransition` / a microtask boundary so it cannot block the ack render.
- The ack visual MUST be distinguishable from the in-progress visual. Users need to see "received → working" as two beats whenever cold-start latency is large enough to notice. Acceptable: stage-edge accent halo / instant skeleton hint / dedicated `preparing…` copy. Forbidden: nothing changes, then suddenly a spinner.

**`/raw` applications.**

- ⏳ `orchestrateRawLoad` currently runs synchronous cleanup before `setStatus('loading')`. Refactor so the visible transition lands first; teardown runs in the next tick.
- ⏳ Introduce a transient ack phase (`warming` per Section 3 covers part of this, but the stage-edge ack is independent of phase). On `file change`, the stage paints a light accent edge immediately; once the runtime worker echoes back, it transitions into the standard loading visual.
- The export button and online LUT row clicks apply the same rule.

**Anti-patterns.**

- Cleanup / dispose / atom-reset before the visible state change.
- Acking with the same visual as in-progress (users cannot tell "received" from "still working").
- Over-acking — transitioning to `ready`-like visuals before the work has produced a verifiable artifact.

**Soft metric.** A click on any heavy entry control (UploadDock, Export, LUT picker activation, online LUT row) produces a visible change within the next paint, regardless of whether the backend is cold-starting.

## Section 3 · Load (cold-start path)

**Principle.** The cold-start window (dynamic import + WASM init + worker spawn) is a distinct phase from "running on the user's file." The UI says "waking the engine," not "loading your photo," because the photo has not yet entered the pipeline.

**Contract.**

- Heavy subsystems expose a phase enum that distinguishes *warmup-stage* from *data-stage* phases. The top-level `/raw` enum becomes: `idle | warming | loading | decoding | processing | ready | exporting | error`. `warming` covers WASM init and worker spawn; `loading` covers reading the user's file into the runtime.
- The orchestrator enters `warming` only when `prewarm()` has not yet resolved. If prewarm already succeeded, the transition skips straight to `loading` — the phase machine never lies about what is actually happening.
- Cold-path failures (WASM fetch failure, cross-origin isolation gone, worker spawn refused) surface through the **capability gate**, not through the per-file error channel. They produce a "this environment cannot run /raw" path, not a "this file failed" path.

**`/raw` applications.**

- ⏳ Add `'warming'` to `ProcessingStatus` (`~/atoms/raw-processor`). Today the first user-visible status on a cold first upload is `'loading'`, mislabelling 80% of the wall-clock time.
- ⏳ `ProgressOverlay` gains a distinct phase copy for `warming` (Chinese "正在唤醒 RAW 引擎"; English "Waking the RAW engine"), separate from `loading` ("正在读取 RAW" / "Reading RAW").
- ⏳ The capability gate is upgraded to also consume *post-mount runtime-init faults* surfaced by prewarm. Today it is a pure synchronous `useMemo` over `detectCapabilities()`; it grows the ability to escalate to `unsupported` after the fact if prewarm reports an unrecoverable runtime error.

**Anti-patterns.**

- Mapping cold-start delay onto `'loading'` (users blame their file for what is engine init).
- Surfacing prewarm failures inline (contradicts Section 1's silent-failure rule).
- Per-file retry that recreates the runtime singleton (defeats `disposeLumaRawRuntime`'s contract and pays WASM init multiple times).

**Soft metric.** When cold-start is > ~300ms, the user perceives it as a distinct phase from steady-state loading, not as a long spinner with one ambiguous label.

## Section 4 · Progress (in-flight, monotone advance)

**Principle.** Progress is the truth. Phases advance forward only, never replay, never regress. The UI subscribes to the authoritative phase, not to a fan-in of booleans across layers.

**Contract.**

- The top-level phase advances forward only within a single user-intent lifecycle: `warming → loading → decoding → processing → ready`. Backwards transitions occur exclusively via explicit `reset()` / `error` / `cancelled`.
- Within a phase, progress is monotonic (no jumps backwards within `decoding`). Phase transitions reset progress to zero cleanly.
- The UI subscribes to **one authoritative status field per concern**: stage chrome → top-level `ProcessingStatus`; preview-internal hints → `session.renderState`; export panel → `session.exportState`. Consumers MUST NOT OR-together booleans from multiple layers to derive a local `isProcessing`. Cross-layer derive happens once at the hook seam (`useRawProcessor`), which then passes single values down (`isProcessing`, `previewSuspended`, `canExport`).
- Worker / WASM progress callbacks use a stable `{ phase, progress }` shape. Adapters MAY remap (the RAW runtime emits `'decoding'`; the orchestrator MAY upgrade to `'processing'` when the GL pipeline takes over), but remapping is centralised in one place.

**`/raw` applications.**

- `useRawProcessor` already derives `isProcessing` once at the hook seam — keep that shape. The new `'warming'` must be included in the derive.
- `ProgressOverlay`'s `phase` prop is already a discriminated union — keep.
- Multiple status layers stay separate by design. They are not allowed to merge in consumers; they may merge in the hook seam.

**Anti-patterns.**

- Boolean spaghetti at the consumer (`isProcessing || isLoading || isWorking`).
- Skipping phases (`loading → ready` with no `decoding`/`processing` between, even when those ran on the backend).
- Progress regressions because two upstreams (RAW worker + GL pipeline) write to the same progress field.

**Soft metric.** A 5-second screen recording of a typical first upload shows phase labels changing exactly N times in order, with no repeats and no regressions, until `ready`.

## Section 5 · Complete (handoff to steady state)

**Principle.** "Complete" means the result is observable, the resources that produced it are accounted for, and the state machine has returned to a known steady state. Intermediate artifacts from the load lifecycle do not leak into the editing steady state.

**Contract.**

- Entering `ready` requires, at minimum:
  - At least one observable artifact is committed — `decodedImageRef.current` is populated OR `embeddedPreviewUrl` is committed on the session.
  - `loadedImage.file` matches the current `session.sourceFile`.
  - `session.renderState.status` has reached its terminal value for this session.
- Atomic handoff: the visible transition to `ready` commits in the same render tick as the observable artifact. The status does not flip to `ready` while the canvas is still black with no embedded preview either.
- Intermediate artifacts (temporary decoded buffers, embedded preview URLs, runtime sessions that will not be reused) are registered in the resource registry. The registry is the system of record for "is anything still in custody under the hood."

**`/raw` applications.**

- `applyPreviewReady` already gates by `decoded` presence — codify it.
- `registerDecodedPreviewForEvacuation` and `registerCurrentPreviewPipelineForEvacuation` are the canonical pattern for load-stage artifacts that need post-load custody. Spec points new heavy paths at the same registry.
- `loadedImage.file` = user-input ground truth; `decodedImageRef.current` (or `embeddedPreviewUrl`) = pipeline-output ground truth. `ready` is the moment they agree.

**Anti-patterns.**

- Flipping `ready` based on phase progression alone, without verifying an observable artifact.
- Leaving previous-session resources alive after the new session reached `ready` (the registry leak path).
- Conflating "ready to interact" with "ready to export" — export readiness is derived separately via `deriveFullResExportReadiness`.

**Soft metric.** The moment `ready` is reached, the user can immediately drag the compare slider, scrub tone parameters, and trigger export. There is no subsequent "still finalizing" hint.

## Section 6 · Recover (failure-aware optimism)

**Principle.** Every optimistic ack and every long-running phase has a defined failure shape that returns the user to a state where the optimism is no longer being claimed. Errors are part of the lifecycle, not an exception channel.

**Contract.**

- Each heavy entry point declares its failure taxonomy:
  - *unsupported* — capability-level; the route gate handles it; the whole feature is unavailable for this environment.
  - *runtime fault* — WASM / worker subsystem failed; dispose the singleton and re-open on the next intent.
  - *storage fault* — OPFS quota / locked / I/O. Does not require disposing the RAW runtime; user is told to free space or retry.
  - *per-file fault* — this file failed but the runtime remains healthy.
  - *aborted* — user navigated away or replaced the file mid-load.
- `aborted` is the only failure with no UI surface. The other four each have a stable user-visible representation (capability page, toast + reset, toast + retry, inline error overlay + dismiss), stable enough to be pinned by screenshot tests.
- Optimistic state reverses with timeline continuity, not "JK that did not happen." Concretely: if Section 2's ack halo appeared, on failure it cross-fades into the error overlay instead of snapping back to the empty state.
- Long-running phases (export, online LUT) expose a cancel handle to the UI. The cancel path converges on `ready` or `idle` — the phase machine never sticks.

**`/raw` applications.**

- `dismissError` returns the top-level status to `idle` — already on contract.
- The online LUT path's `AbortController` chain is the canonical cancel-converges-to-stable example.
- ⏳ With Section 2's ack halo introduced, the failure path must coordinate motion with `ErrorOverlay`'s `AnimatePresence` so the halo cross-fades into the scrim rather than snapping off.

**Anti-patterns.**

- Routing a per-file fault into the capability gate (poisons the route for the next file too).
- Catching a runtime fault and leaving the next intent to hit a stale singleton (must call `disposeLumaRawRuntime()` so the next call re-initialises).
- Surfacing a toast for an `aborted` load (the user chose to abort by uploading a new file; the toast is noise).

**Soft metric.** Any failure leaves the user with either (a) the ability to retry the same action immediately, or (b) a clear explanation of which environment limit blocks them. There is no case whose only recourse is "refresh the page."

## Appendix A · Layered state-machine cheat sheet

| Layer | Owner | UI consumer | Phase enum | Lifecycle |
|---|---|---|---|---|
| Capability gate | `useCapabilityGate` (synchronous `detectCapabilities`; upgraded to also consume post-mount prewarm runtime-init faults) | route shell — renders `UnsupportedState` or passes through | `supported \| unsupported(reason)` | One per session; monotone; only prewarm post-mount probe may escalate |
| Top-level ProcessingStatus | `~/atoms/raw-processor` | stage chrome via `ProgressOverlay`; tool surface via derived `isProcessing` | `idle \| warming \| loading \| decoding \| processing \| ready \| exporting \| error` | One pass per user intent; resets via `reset()` / `dismissError` |
| session.renderState | `applyPreviewLoadStarted` / `applyPreviewReady` / `applyQuickPreviewFailure` | `PreviewCanvas` display source + status indicator | `pending \| embedded-ready \| quick-ready \| bounded-hq-ready \| failed` | Within one session lifetime |
| session.exportState | export orchestrator | export panel | `idle \| exporting \| ready \| error \| source-required` (recovery) | Within one session lifetime; can run multiple times |

**Cross-layer rule.** Consumers subscribe to exactly one layer. `useRawProcessor` is the only legitimate cross-layer derive site; the values it emits (`isProcessing`, `previewSuspended`, `canExport`, etc.) are single values that go down independently. Leaf components do not OR across layers.

## Appendix B · Named patterns (PR-review shorthand)

- *IdlePrewarm* (§1) — route-mount `prewarm()` via `requestIdleCallback`, silent and idempotent.
- *OptimisticAck* (§2) — visible state mutation precedes synchronous cleanup; ack visual is distinguishable from in-progress visual.
- *DistinguishedColdStart* (§3) — `warming` is a peer of `loading`, with its own copy.
- *MonotonePhase* (§4) — phases advance forward only within a single intent; progress does not regress.
- *PaintBudget* (§0 + §2) — synchronous work between an event and the next paint stays ≤ 1 frame.
- *AtomicHandoff* (§5) — `ready` commits in the same render tick as the observable artifact.
- *FailureAwareOptimism* (§6) — every ack has a defined reversal that reads as same-timeline continuation.

## Out of Scope (deliberate)

- Hard ms targets, INP/CWV instrumentation, perf-budget CI gates. May come in a follow-up.
- Project-wide generalisation (the spec is `/raw` scoped; lifting it to other future heavy surfaces is a separate exercise).
- Merging the four layered state machines into one. The codified separation is the decision; reunification is explicitly declined.
- Mobile-specific motion choreography for the ack halo. Mobile preview-stage rules from the prior mobile spec (`2026-05-18-mobile-raw-lab-photo-first-design.md`) continue to govern; ack motion respects them but is not redesigned here.

## Open Questions (resolve during plan)

- Exact copy for `warming` in both locales.
- Whether ack halo lives in `Dropzone` (component-local) or in `ComparePreviewStage` (stage-level) — the spec only requires it to exist, not where it is rendered.
- Whether the JPEG worker pool and the WebGL pipeline both expose `prewarm()`, or whether only the RAW runtime does. The spec mandates the *contract shape*; whether each subsystem ships its own prewarm is a plan-level decision.
