# /raw Heavy-Component / UI Feedback Synchronization

- Date: 2026-05-21
- Status: Aligned with user — proceeding to plan
- Scope: All `/raw` interactions that cross a Worker boundary, hit WASM init, await an OPFS/network roundtrip, or block the main thread for more than one frame. Covers RAW upload (first & replace), local LUT load, online LUT fetch, full-resolution export, and interrupted-export recovery. Out of scope: routing/navigation, tool panel toggles, tone sliders, and any sub-frame main-thread work.
- Predecessor work: the prewarm + Dropzone changes shipped on 2026-05-21 (`rawRuntimeAdapter.prewarm()`, **empty-stage** `Dropzone` always-mounted input). This spec codifies the discipline behind those changes and extends it. **Two off-DOM file pickers in `RawProcessorView` (`handleReplaceFile`, `handleRecoveryFileSelect`) still use `document.createElement('input')` and are explicit migration targets, not shipped work.**

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
- `prewarm()` is **UI-silent**: its outcome never directly paints a toast or error overlay. The real entry path remains the only legitimate user-facing error channel. Orchestrators and the capability gate observe prewarm outcome via a separate non-UI channel (`getPrewarmState()` + structured Promise resolution).
- Test environment (`import.meta.env.MODE === 'test'`) short-circuits any side-effect-only behaviour (prewarm, idle-time work). Tests never observe nondeterministic warmup races.
- All scoping, behavioural invariants, and warm darkroom identity from prior specs (export authority, fail-closed, preview-vs-export executor separation, mobile WebKit handling) are untouched.

## Glossary

- *Heavy work*: any operation that crosses a Worker boundary, hits WASM init, awaits an OPFS/network roundtrip, or blocks the main thread for more than one frame.
- *Phase*: a named, monotonic step in the lifecycle of a single user intent.
- *Intent signal*: any observable user behaviour that predicts a heavy action — route mount, viewport entry, pointer hover, keyboard focus. Commit (click/file-select) is not an intent signal, it is the terminal event.
- *Optimistic ack*: a visual transition committed before the heavy work has produced quantifiable progress.
- *Paint budget*: the boundary by which the ack visual MUST be observable. The spec does not assert a wall-clock ms target; the §2 verification clause pins this through a test that asserts ack visibility before any heavy work begins.

## Section 1 · Predict (intent prediction & prewarm)

**Principle.** Heavy work starts on intent, not on commit. Every zero-cost intent signal that buys real commit-time latency must be wired.

**Contract.**

- A heavy subsystem MAY expose `prewarm()`. When it does, the function MUST be **idempotent** (repeat calls do not rebuild), **input-free** (does not accept a `File` or any user-intent payload — that is partial load, not warmup), and **UI-silent** (its outcome never directly produces a toast, error overlay, or capability-gate flip on its own).
- "UI-silent" is not "no observable signal." `prewarm()` resolves with a structured outcome `Promise<{ status: 'ready' | 'failed'; reason?: string; recoverable?: boolean }>` so orchestrators and the capability gate can observe success/failure without going through the user-facing surface. UI silence means the outcome alone never paints; downstream consumers decide whether and how to react.
- The adapter additionally exposes a synchronous `getPrewarmState(): 'idle' | 'pending' | 'ready' | 'failed'` so synchronous consumers (the load orchestrator deciding warming vs loading) can branch without awaiting.
- Callers invoke prewarm from a fire-and-forget `useEffect` with explicit scheduling: `requestIdleCallback` preferred, `setTimeout(_, ≥ 200ms)` as fallback. Module top-level side-effects to "warm" a subsystem are forbidden — they tax non-/raw visitors and complicate SSR/test.
- Test env must short-circuit prewarm (`import.meta.env.MODE === 'test'`); `getPrewarmState()` returns `'idle'` in tests so consumers fall through the cold path deterministically.
- **Scope of "MAY".** This spec only requires the **RAW runtime** adapter to implement the prewarm contract above. JPEG worker pool prewarm and WebGL pipeline prewarm are explicitly **out of scope** for this work; they are revisited only with measurement evidence in a separate follow-up.

**`/raw` applications.**

- ✅ Shipped (partial): `rawRuntimeAdapter.prewarm()` invoked from `RawProcessorView` mount via `requestIdleCallback`. **Current return type is `Promise<void>` and there is no `getPrewarmState()`; the structured-outcome + sync-state upgrade is in scope for the plan that follows this spec.**
- ⏳ UploadDock `pointerenter` / `focus` upgraded to an immediate prewarm trigger, covering the case where idle never runs before the user clicks.
- ⛔ Out of scope: JPEG worker pool prewarm, WebGL pipeline prewarm. Re-examine only after instrumentation shows a measured cold-start hit on the first export or first preview.

**Anti-patterns.**

- Module-import side-effects to "warm" a subsystem.
- Unwrapped prewarm errors leaking to `console.error` and polluting test output.
- Treating "start decoding this file" as prewarm — that is already real work, not prediction.

**Soft metric.** After the user reads the empty-state copy (~2–3 seconds) and clicks for the first time, the runtime should already be ready or in its final initialisation step. There should be no visible gap between `setStatus(next)` and the spinner appearing.

## Section 2 · Ack (optimistic acknowledgement)

**Principle.** Click-to-visible-feedback must beat the human "did anything happen?" threshold (~100ms). The visual transition is committed in the event handler itself, before any `await` competes for ordering.

**Contract.**

- Heavy entry-point handlers MUST commit the visible state mutation (`setStatus`, `setSession`, etc.) **before** any synchronous teardown of prior resources (`abortRuntimeWork`, `revokeCurrentEmbeddedPreviewUrl`, `replaceFile`, ref nulling) and before any blocking import / WASM init / worker spawn / OPFS-network roundtrip / export kickoff.
- **After the ack state mutation, the handler MUST yield a paint boundary before doing any heavy work.** A paint boundary is `await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))` (a single rAF) at minimum; under heavy main-thread contention a double-rAF is the robust form. A microtask boundary (`await Promise.resolve()`) and `useTransition` are **not** sufficient — microtasks run before rendering, so an implementation that only yields a microtask can comply with the order rule while still preventing the ack from painting.
- The ack visual MUST be distinguishable from the in-progress visual. Users need to see "received → working" as two beats whenever cold-start latency is large enough to notice. Acceptable forms (pick one per surface, do not standardize prematurely): stage-edge accent halo / instant skeleton hint / dedicated `preparing…` copy / button busy-pressed state / overlay fade-in. The spec does not pick a visual; it requires distinguishability. Forbidden: nothing changes, then suddenly a spinner.
- **Verification clause.** A test with an artificially-delayed `prewarm()` / WASM init MUST be able to observe the ack rendered before any heavy work starts. This is the only "hard" gate in the spec; everything else is a soft target.

**`/raw` applications.**

- ⏳ `orchestrateRawLoad` currently runs synchronous cleanup before `setStatus('loading')`. Refactor so the visible transition lands first, then yield a paint boundary, then run teardown / runtime open / decode.
- ⏳ `handleReplaceFile` and `handleRecoveryFileSelect` in `RawProcessorView` are migrated to the same always-mounted-input pattern as the empty-stage `Dropzone`. Both currently use off-DOM `document.createElement('input')` and are the WebKit-failure-prone paths the original incident was about; the predecessor work only covered the empty stage.
- ⏳ Introduce a transient ack visual on the upload entry. On `file change`, the stage commits an immediate visual cue (form decided at plan time per the contract above) and yields a paint boundary before the heavy work begins.
- The export button and online LUT row clicks apply the same paint-boundary rule.

**Anti-patterns.**

- Cleanup / dispose / atom-reset before the visible state change.
- Acking with the same visual as in-progress (users cannot tell "received" from "still working").
- Over-acking — transitioning to `ready`-like visuals before the work has produced a verifiable artifact.

**Soft metric.** A click on any heavy entry control (UploadDock, Export, LUT picker activation, online LUT row) produces a visible change within the next paint, regardless of whether the backend is cold-starting.

## Section 3 · Load (cold-start path)

**Principle.** The cold-start window (dynamic import + WASM init + worker spawn) is a distinct phase from "running on the user's file." The UI says "waking the engine," not "loading your photo," because the photo has not yet entered the pipeline.

**Contract.**

- Heavy subsystems expose a phase enum that distinguishes *warmup-stage* from *data-stage* phases. The top-level `/raw` enum becomes: `idle | warming | loading | decoding | processing | ready | exporting | error`. `warming` covers WASM init and worker spawn; `loading` covers reading the user's file into the runtime.
- The orchestrator decides between `warming` and `loading` by consulting `getPrewarmState()` (the synchronous probe from §1), not by awaiting `prewarm()`. If state is `'ready'`, it skips straight to `loading`. If `'pending'`, it enters `warming` and awaits the in-flight prewarm Promise. If `'failed'`, it routes through the runtime-fault path per §6 (no per-file blame).
- Cold-path failures (WASM fetch failure, cross-origin isolation gone, worker spawn refused) are routed by **recoverability**, not by where they were detected. The capability gate consults `getPrewarmState()` and **MAY escalate `supportStatus` to `unsupported` only for irrecoverable runtime-init faults** — cross-origin isolation lost, WebGL2 / WebAssembly disabled in the browser, missing required CPU features. Transient faults (network blip on WASM fetch, abort, transient worker spawn failure) MUST NOT escalate; they remain runtime faults retried on the next intent per §6.
- The "may escalate" rule is one-way and idle: the capability gate never demotes a route the user has not yet interacted with into an unsupported state purely on a recoverable prewarm error. The escalation only fires for proven environment-level limits.

**`/raw` applications.**

- ⏳ Add `'warming'` to `ProcessingStatus` (`~/atoms/raw-processor`). Today the first user-visible status on a cold first upload is `'loading'`, mislabelling the time when the engine itself is initializing. **Minimum landing**: a localized `warming` overlay copy is acceptable if a full status-enum addition would force churn across reducers/components/tests beyond what this work warrants. The hard target is "user never sees 'reading photo' while WASM is actually still booting", not the enum shape.
- ⏳ `ProgressOverlay` gains a distinct phase copy for `warming` (Chinese "正在唤醒 RAW 引擎"; English "Waking the RAW engine"), separate from `loading` ("正在读取 RAW" / "Reading RAW").
- ⏳ The capability gate is upgraded to consult `getPrewarmState()` (§1). It escalates to `unsupported` only for irrecoverable faults; transient prewarm failures remain in §6's runtime-fault track. The gate today is a synchronous `useMemo` over `detectCapabilities()`; the upgrade adds a single derived value from the prewarm-state probe, not a refactor of the gate itself.

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
- Optimistic state reverses with timeline continuity, not "JK that did not happen." Concretely: whichever ack visual §2 chose, on failure it cross-fades into the error surface instead of snapping back to the empty state.
- Long-running phases (export, online LUT) expose a cancel handle to the UI. The cancel path converges on `ready` or `idle` — the phase machine never sticks.

**`/raw` applications.**

- `dismissError` returns the top-level status to `idle` — already on contract.
- The online LUT path's `AbortController` chain is the canonical cancel-converges-to-stable example.
- ⏳ Once §2 picks the upload-path ack visual, the failure path must coordinate motion with `ErrorOverlay`'s `AnimatePresence` so the ack visual cross-fades into the scrim rather than snapping off.

**Anti-patterns.**

- Routing a per-file fault into the capability gate (poisons the route for the next file too).
- Catching a runtime fault and leaving the next intent to hit a stale singleton (must call `disposeLumaRawRuntime()` so the next call re-initialises).
- Surfacing a toast for an `aborted` load (the user chose to abort by uploading a new file; the toast is noise).

**Soft metric.** Any failure leaves the user with either (a) the ability to retry the same action immediately, or (b) a clear explanation of which environment limit blocks them. There is no case whose only recourse is "refresh the page."

## Appendix A · Layered state-machine cheat sheet

| Layer | Owner | UI consumer | Phase enum | Lifecycle |
|---|---|---|---|---|
| Capability gate | `useCapabilityGate` (synchronous `detectCapabilities`; upgraded to consult `getPrewarmState()` per §1) | route shell — renders `UnsupportedState` or passes through | `supported \| unsupported(reason)` | One per session; monotone; escalates only on irrecoverable prewarm faults, never on transient ones |
| Top-level ProcessingStatus | `~/atoms/raw-processor` | stage chrome via `ProgressOverlay`; tool surface via derived `isProcessing` | `idle \| warming \| loading \| decoding \| processing \| ready \| exporting \| error` | One pass per user intent; resets via `reset()` / `dismissError` |
| session.renderState | `applyPreviewLoadStarted` / `applyPreviewReady` / `applyQuickPreviewFailure` | `PreviewCanvas` display source + status indicator | `pending \| embedded-ready \| quick-ready \| bounded-hq-ready \| failed` | Within one session lifetime |
| session.exportState | export orchestrator | export panel | `idle \| exporting \| ready \| error \| source-required` (recovery) | Within one session lifetime; can run multiple times |

**Cross-layer rule.** Consumers subscribe to exactly one layer. `useRawProcessor` is the only legitimate cross-layer derive site; the values it emits (`isProcessing`, `previewSuspended`, `canExport`, etc.) are single values that go down independently. Leaf components do not OR across layers.

## Appendix B · Named patterns (PR-review shorthand)

- *IdlePrewarm* (§1) — route-mount `prewarm()` via `requestIdleCallback`, idempotent, input-free, UI-silent. Outcome is observable to orchestrators via `getPrewarmState()` + structured Promise resolution.
- *OptimisticAck* (§2) — visible state mutation precedes synchronous cleanup AND yields a paint boundary (rAF) before heavy work; ack visual is distinguishable from in-progress visual.
- *DistinguishedColdStart* (§3) — when prewarm has not yet resolved, the user-visible state distinguishes "warming engine" from "reading file" — either via a `warming` phase variant or via localized overlay copy.
- *MonotonePhase* (§4) — phases advance forward only within a single intent; progress does not regress.
- *PaintBudget* (§0 + §2) — ack visual MUST be observable before heavy work starts. Verified by test, not by ms threshold.
- *AtomicHandoff* (§5) — `ready` commits in the same render tick as the observable artifact.
- *FailureAwareOptimism* (§6) — every ack has a defined reversal that reads as same-timeline continuation; transient prewarm faults stay in the runtime-fault track and do not escalate the capability gate.

## Out of Scope (deliberate)

- JPEG worker pool prewarm. Deferred to a measured follow-up that proves a real cold-start hit on first export.
- WebGL pipeline context pre-allocation / prewarm. Same deferral.
- Hard ms targets, INP/CWV instrumentation, perf-budget CI gates. The verification clause in §2 is the only "hard" gate; everything else is qualitative.
- Project-wide generalisation. The spec is `/raw` scoped; lifting it to other future heavy surfaces is a separate exercise.
- Merging the four layered state machines into one. The codified separation is the decision; reunification is explicitly declined.
- Mobile-specific motion choreography for the ack visual. Mobile preview-stage rules from the prior mobile spec (`2026-05-18-mobile-raw-lab-photo-first-design.md`) continue to govern; ack motion respects them but is not redesigned here.
- A general state-machine library / `XState` migration. The four-layer split stays plain TS atoms/objects.

## Open Questions (resolve during plan)

- Exact copy for `warming` in both locales.
- Where the §2 ack visual is rendered for the upload path — `Dropzone` (component-local) vs. `ComparePreviewStage` (stage-level). The spec requires that the ack be distinguishable and that the paint boundary is honored; the rendering site is a plan-level decision.
- Whether `'warming'` lands as a top-level `ProcessingStatus` variant or as a localized overlay-copy condition. The contract is the *user-visible truth*, not the enum shape; pick the form that minimises churn while satisfying §3.
- Exact shape of `getPrewarmState()` and `prewarm()`'s return type — the spec specifies the names and obligations; final TypeScript shape is decided when the adapter is upgraded.
