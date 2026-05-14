# RAW Processor Module Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `useRawProcessor.ts` (2342 lines) into thin-hook + orchestrator services, and split large component files, while preserving exact behavior.

**Architecture:** Move heavy implementation from the hook into dedicated async orchestrator functions in `services/`. Each orchestrator receives a `context` object with atoms, refs, and service functions — no React dependency. The hook becomes a ~200-line wiring layer that creates the context and delegates to orchestrators.

**Tech Stack:** React, Jotai (with `createAtomHooks` pattern), TypeScript, Vite

**Pattern for extraction tasks:** Copy the implementation body from the specified line range in `useRawProcessor.ts`, wrap in an exported async function that takes a `context` parameter, then adapt all closure variable references (e.g., `setStatus(x)` → `ctx.atoms.setStatus(x)`). Replace the hook callback with a one-line delegation.

---

### Task 1: Extract `loadFile` → `services/raw/orchestrate-raw-load.ts`

**Files:**
- Create: `src/modules/raw-processor/services/raw/orchestrate-raw-load.ts`
- Modify: `src/modules/raw-processor/hooks/useRawProcessor.ts:652-1160`

**What to extract:** The entire body of `loadFile` callback (lines 652-1160), including the nested helpers `mapPhaseToStatus`, `updatePreviewState`, `applyQuickPreviewToSession`, `startExportCapabilityProbe`, and all the try/catch logic.

**Function signature:**
```ts
export async function orchestrateRawLoad(
  file: File,
  params: ProcessingParams,
  lut: ParsedLUT | null,
  activeStyle: StyleAsset | null,
  ctx: RawLoadContext,
): Promise<void>
```

**Context type `RawLoadContext`** — define it in the same file with fields for every closure variable referenced in the body:
- `atoms: { setStatus, setError, setProgress, setLoadedImage, setSession, getProcessingParams }`
- `refs: { runtimeAbortControllerRef, runtimeSessionRef, runtimeWorkSessionIdRef, pendingLoadSessionIdRef, decodedImageRef, sessionRef, pipelineRef, resourceRegistryRef, embeddedPreviewUrlRef, isMountedRef, disposedRuntimeSessionsRef }`
- `services: { replaceFile, abortRuntimeWork, abortExportWork, queueExportResultResourceDisposal, revokeCurrentEmbeddedPreviewUrl, clearSessionEmbeddedPreviewUrl, setDecodedImageRef, invalidateExportGraph, hasSameRawRenderExposure }`

**Adaptation rules:**
- `setStatus(x)` → `ctx.atoms.setStatus(x)`
- `runtimeAbortControllerRef.current` → `ctx.refs.runtimeAbortControllerRef.current`
- `replaceFile(file, state)` → `ctx.services.replaceFile(file, state)`
- Local variables (`runtimeSession`, `loadSessionId`, `quickPreview`, etc.) stay unchanged
- References to `session`, `loadedImage`, `stats` etc. that were closure-captured — read from `ctx.atoms` or `ctx.refs` as appropriate
- `toast.error(...)` — pass a `scheduleToast` callback in context

- [ ] **Step 1:** Create `services/raw/orchestrate-raw-load.ts` with the `RawLoadContext` type and the function skeleton

- [ ] **Step 2:** Copy the `loadFile` body (lines 652-1160 of useRawProcessor.ts) into the function, adapt all closure references to `ctx.*`

- [ ] **Step 3:** In `useRawProcessor.ts`, replace `loadFile` callback with:
```ts
const loadFile = useCallback(
  (file: File) => orchestrateRawLoad(file, params, lut, activeStyle, rawLoadCtx),
  [params, lut, activeStyle, rawLoadCtx],
)
```
Where `rawLoadCtx` is a `useMemo`-stable context object built from the existing atoms/refs/services at the top of the hook.

- [ ] **Step 4:** Build context object. In the hook body (before any callbacks), add:
```ts
const rawLoadCtx = useMemo<RawLoadContext>(() => ({
  atoms: { setStatus, setError, setProgress, setLoadedImage, setSession, getProcessingParams },
  refs: { runtimeAbortControllerRef, runtimeSessionRef, runtimeWorkSessionIdRef, pendingLoadSessionIdRef, decodedImageRef, sessionRef, pipelineRef, resourceRegistryRef, embeddedPreviewUrlRef, isMountedRef, disposedRuntimeSessionsRef },
  services: { replaceFile, abortRuntimeWork, abortExportWork, queueExportResultResourceDisposal, revokeCurrentEmbeddedPreviewUrl, clearSessionEmbeddedPreviewUrl, setDecodedImageRef, invalidateExportGraph, hasSameRawRenderExposure },
}), [/* stable deps */])
```

- [ ] **Step 5:** Remove unused imports from `useRawProcessor.ts` that are now only needed in the orchestrator

- [ ] **Step 6:** Run `pnpm lint && pnpm test:run && pnpm build`

- [ ] **Step 7:** Commit
```bash
git add src/modules/raw-processor/services/raw/ src/modules/raw-processor/hooks/useRawProcessor.ts
git commit -m "refactor: extract raw load orchestration to service"
```

---

### Task 2: Extract `exportImage` → `services/export/orchestrate-full-res-export.ts`

**Files:**
- Create: `src/modules/raw-processor/services/export/orchestrate-full-res-export.ts`
- Modify: `src/modules/raw-processor/hooks/useRawProcessor.ts:1468-2013`

**What to extract:** The entire body of `exportImage` callback (lines 1468-2013), including `enqueueCheckpointWrite`, checkpoint setup, execution plan selection, resource evacuation, worker job execution, and error handling.

**Function signature:**
```ts
export async function orchestrateFullResExport(
  options: { quality: 'standard' | 'high'; fidelity: 'safe' | 'balanced' | 'max'; previousInterrupted?: boolean; recoveredExportId?: string },
  ctx: ExportContext,
): Promise<void>
```

**Context type `ExportContext`** — fields for:
- `atoms: { setStatus, setError, setProgress, setSession, loadedImage, session, params, lutDataRef, decodedImageRef, stats }`
- `refs: { exportAbortControllerRef, exportGraphVersionRef, isMountedRef, sessionRef, pipelineRef, resourceRegistryRef, previewCopyCanvasRef, discoveredRecoveryRef }`
- `services: { abortExportWork, abortRuntimeWork, registerCurrentPreviewPipelineForEvacuation, registerExportResultResource, revokeCurrentEmbeddedPreviewUrl, setDecodedImageRef, setDiscoveredRecoveryState, scheduleToast }`

- [ ] **Step 1:** Create the file with `ExportContext` type and function skeleton

- [ ] **Step 2:** Copy the exportImage body, adapt closure references to `ctx.*`

- [ ] **Step 3:** Replace `exportImage` callback in the hook with delegation to orchestrator

- [ ] **Step 4:** Build `exportCtx` context object via `useMemo`

- [ ] **Step 5:** Remove unused imports from the hook

- [ ] **Step 6:** Run `pnpm lint && pnpm test:run && pnpm build`

- [ ] **Step 7:** Commit
```bash
git add src/modules/raw-processor/services/export/ src/modules/raw-processor/hooks/useRawProcessor.ts
git commit -m "refactor: extract full-res export orchestration to service"
```

---

### Task 3: Extract LUT loading → `services/lut/orchestrate-lut-load.ts`

**Files:**
- Create: `src/modules/raw-processor/services/lut/orchestrate-lut-load.ts`
- Modify: `src/modules/raw-processor/hooks/useRawProcessor.ts:1162-1292`

**What to extract:** The `loadLUT`, `loadOnlineLUT`, and `selectLUTProfile` callbacks (lines 1162-1292). Bundle all three into one file since they share LUT parsing/validation logic.

```ts
export async function orchestrateLutLoadFromFile(
  file: File,
  ctx: LutLoadContext,
): Promise<void>

export async function orchestrateOnlineLutLoad(
  entry: OnlineLUTEntry,
  options: { signal?: AbortSignal } | undefined,
  ctx: LutLoadContext,
): Promise<void>

export function orchestrateProfileSelection(
  profile: LUTColorProfile | string,
  ctx: LutLoadContext,
): void
```

- [ ] **Step 1:** Create file with context type and function skeletons

- [ ] **Step 2:** Copy implementation bodies, adapt to context

- [ ] **Step 3:** Replace callbacks in hook with delegations

- [ ] **Step 4:** Build `lutCtx` context object

- [ ] **Step 5:** Verify and commit

---

### Task 4: Extract param/state updates → `services/params/orchestrate-params-update.ts`

**Files:**
- Create: `src/modules/raw-processor/services/params/orchestrate-params-update.ts`
- Modify: `src/modules/raw-processor/hooks/useRawProcessor.ts` (replace `setViewMode`, `setCompareSplit`, `setPreviewViewport`, `resetPreviewViewport`, `selectIntensityLevel`, `clearLUT`, `handleSetParams`, `setToneParams`, `resetTone`)

**What to extract:** The pure state-transition logic from the param-related callbacks. These are simpler than the async orchestrators — mostly computing next state from current state + input.

**Functions to export:**
```ts
export function computeViewModeChange(session: ImageSession | null, mode: ViewMode): ImageSession | null
export function computeCompareSplitChange(session: ImageSession | null, split: number): ImageSession | null
export function computeViewportChange(session: ImageSession | null, viewport: PreviewViewport): ImageSession | null
export function computeIntensityChange(prevParams: ProcessingParams, prevSession: ImageSession | null, activeStyle: StyleAsset | null, level: IntensityLevel): { params: ProcessingParams; session: ImageSession | null; shouldInvalidateExportGraph: boolean }
export function computeClearLUT(prevParams: ProcessingParams, prevSession: ImageSession | null, activeStyle: StyleAsset | null, hasLut: boolean, hasLutData: boolean, hasLutProfileSelection: boolean): { params: ProcessingParams; session: ImageSession | null; shouldInvalidateExportGraph: boolean }
export function computeToneParams(prevParams: ProcessingParams, toneParams: Partial<ToneParams>): { params: ProcessingParams; shouldClearExportResult: boolean }
```

- [ ] **Step 1:** Create file with all exported functions, copy the pure computation logic from each callback body

- [ ] **Step 2:** In the hook, rewrite each callback to call the corresponding function inline (these are synchronous — no context object needed, just direct function calls)

- [ ] **Step 3:** Verify and commit

---

### Task 5: Create context builder + slim down hook return

**Files:**
- Modify: `src/modules/raw-processor/hooks/useRawProcessor.ts`

After all extractions, the hook should be ~250-350 lines. Final cleanup:

- [ ] **Step 1:** Consolidate the per-domain context objects (`rawLoadCtx`, `exportCtx`, `lutCtx`) into a single `ctx` if they have significant overlap, or keep separate if dependencies differ enough

- [ ] **Step 2:** Remove any remaining unused imports (functions that moved to orchestrators)

- [ ] **Step 3:** Verify the return value matches `UseRawProcessorReturn` interface exactly

- [ ] **Step 4:** Run `pnpm lint && pnpm test:run && pnpm build`

- [ ] **Step 5:** Commit
```bash
git add src/modules/raw-processor/hooks/useRawProcessor.ts
git commit -m "refactor: slim down useRawProcessor to thin wiring layer"
```

---

### Task 6: Split `ControlsPanel.tsx` → separate MetadataPanel + StatsPanel

**Files:**
- Create: `src/modules/raw-processor/components/MetadataPanel.tsx`
- Create: `src/modules/raw-processor/components/StatsPanel.tsx`
- Modify: `src/modules/raw-processor/components/ControlsPanel.tsx` (remove lines 394-489)
- Modify: `src/modules/raw-processor/components/index.ts` (add new re-exports)

**What moves:**
- `MetadataPanel` function (lines 397-451) → `MetadataPanel.tsx` with its imports (`m` from motion, `clsxm`, `Spring`)
- `StatsPanel` function (lines 456-489) → `StatsPanel.tsx` with its imports

- [ ] **Step 1:** Create `MetadataPanel.tsx` — copy the function and its required imports

- [ ] **Step 2:** Create `StatsPanel.tsx` — copy the function and its required imports

- [ ] **Step 3:** Remove the functions from `ControlsPanel.tsx`, keep only `ControlsPanel` and its internal helpers (`LUTProfileButton`, `LUTProfileSelector`, `LUTProfileStatus`)

- [ ] **Step 4:** Update `components/index.ts`:
```ts
export { MetadataPanel } from './MetadataPanel'
export { StatsPanel } from './StatsPanel'
```

- [ ] **Step 5:** Verify `pnpm lint && pnpm test:run && pnpm build`

- [ ] **Step 6:** Commit

---

### Task 7: Split `LutContractTool.tsx` → `components/tools/lut/` directory

**Files:**
- Create: `src/modules/raw-processor/components/tools/lut/LutContractTool.tsx` (~80 lines, main entry)
- Create: `src/modules/raw-processor/components/tools/lut/LutBrowserDialog.tsx` (lines 178-266)
- Create: `src/modules/raw-processor/components/tools/lut/LUTProfileButton.tsx` (lines 268-314)
- Create: `src/modules/raw-processor/components/tools/lut/lut-output-options.ts` (lines 316-405: dedupe, group, helpers)
- Create: `src/modules/raw-processor/components/tools/lut/LUTOutputOptionButton.tsx` (lines 407-438)
- Create: `src/modules/raw-processor/components/tools/lut/LUTContractBrowser.tsx` (lines 440-762)
- Create: `src/modules/raw-processor/components/tools/lut/LUTProfileStatus.tsx` (lines 764-862)
- Create: `src/modules/raw-processor/components/tools/lut/LutIconButton.tsx` (lines 864-906)
- Create: `src/modules/raw-processor/components/tools/lut/OnlineLutSourceControls.tsx` (lines 908-1275)
- Create: `src/modules/raw-processor/components/tools/lut/lut-browser-layout.ts` (lines 65-155: constants, viewport math)
- Keep: `src/modules/raw-processor/components/tools/lut-contract.ts` (already exists)
- Delete: `src/modules/raw-processor/components/tools/LutContractTool.tsx`

**Internal imports:** Each sub-component imports what it needs. The main `LutContractTool.tsx` imports all sub-components. Types shared between sub-components (`OnlineLutBrowserLayout`, `OnlineLutBrowserStyle`, etc.) stay in the main file or a shared `types.ts`.

- [ ] **Step 1:** Create `components/tools/lut/lut-browser-layout.ts` — copy constants (L65-70), `clampNumber`, `getViewportBoundedBrowserLayout`, `toBrowserStyle`, `useRawLabPortalContainer`, `isInsideElement`

- [ ] **Step 2:** Create `components/tools/lut/lut-output-options.ts` — copy `dedupeProfiles`, `dedupeOutputOptions`, `getOutputGroupLabel`, `toDeclaredOutputOption`, `toSearchOutputOption`, `toOutputCarrierProfile`, `groupOutputOptions`

- [ ] **Step 3:** Create each component file — copy the function and its specific imports

- [ ] **Step 4:** Create `LutContractTool.tsx` in the new directory — imports and composes all sub-components, contains the main `LutContractTool` export and shared types

- [ ] **Step 5:** Update `components/tools/lut-contract.ts` — no changes needed (already a separate file)

- [ ] **Step 6:** Update `components/index.ts` — change `LutContractTool` import path:
```ts
export { LutContractTool } from './tools/lut/LutContractTool'
```

- [ ] **Step 7:** Verify `pnpm lint && pnpm test:run && pnpm build`

- [ ] **Step 8:** Commit

---

### Task 8: Split `PreviewCanvas.tsx` → separate ExportCanvas

**Files:**
- Create: `src/modules/raw-processor/components/ExportCanvas.tsx`
- Create: `src/modules/raw-processor/components/preview-canvas-helpers.ts`
- Modify: `src/modules/raw-processor/components/PreviewCanvas.tsx` (remove ExportCanvas + helpers)
- Modify: `src/modules/raw-processor/components/index.ts`

**What moves:**
- `ExportCanvas` component (lines 854-end) → `ExportCanvas.tsx`
- `createRawUploadInput`, `syncRawUploadInput`, `getPointerDistance`, `getPointerMidpoint`, `tryCapturePointer`, `tryReleasePointer` → `preview-canvas-helpers.ts`

- [ ] **Step 1:** Create `preview-canvas-helpers.ts` with the 6 helper functions and their imports

- [ ] **Step 2:** Create `ExportCanvas.tsx` with the component, importing from `preview-canvas-helpers` if needed

- [ ] **Step 3:** Update `PreviewCanvas.tsx` — import helpers from new location, remove `ExportCanvas`

- [ ] **Step 4:** Update `components/index.ts`:
```ts
export { ExportCanvas } from './ExportCanvas'
export { createRawUploadInput, syncRawUploadInput } from './preview-canvas-helpers'
```

- [ ] **Step 5:** Verify and commit

---

### Task 9: CSS co-location (best-effort)

**Files:**
- Create: `src/modules/raw-processor/components/tools/lut/lut-tool.css` (~600 lines)
- Create: `src/modules/raw-processor/components/tools/export-tool.css` (~130 lines)
- Create: `src/modules/raw-processor/components/preview-canvas.css` (~45 lines)
- Modify: `src/modules/raw-processor/raw-lab.css` (remove extracted sections)
- Modify: `src/modules/raw-processor/components/tools/lut/LutContractTool.tsx` (add CSS import)
- Modify: `src/modules/raw-processor/components/tools/ExportTool.tsx` (add CSS import)
- Modify: `src/modules/raw-processor/components/PreviewCanvas.tsx` (add CSS import)

**⚠️ CSS extraction is fragile.** Combined selectors in `raw-lab.css` (e.g., scrollbar rules that group `.raw-tool-surface, .raw-tool-stack, .raw-lut-browser-list`) mean some rules cannot be cleanly split. Strategy: only extract rules whose selectors exclusively match the target component. Leave shared/combined selectors in `raw-lab.css`.

**Lines to extract:**
- LUT-specific (lines 349-948): `.raw-lut-source-*`, `.raw-lut-dropzone-*`, `.raw-lut-browser-*`, `.raw-lut-contract-*`, `.raw-lut-clear-*`, `.raw-lut-source-icon-*`, `@keyframes raw-lut-source-spin`, and LUT-specific media query blocks
- Export-specific (lines 949-1080): `.raw-export-result*`, `.raw-export-actions*`, `.raw-export-button*`
- Preview canvas (lines 1334-1377): `.raw-preview-*`

- [ ] **Step 1:** Create `lut-tool.css` — copy lines 349-948 from raw-lab.css into it

- [ ] **Step 2:** Create `export-tool.css` — copy lines 949-1080

- [ ] **Step 3:** Create `preview-canvas.css` — copy lines 1334-1377

- [ ] **Step 4:** Remove extracted sections from `raw-lab.css`

- [ ] **Step 5:** Add `import './lut-tool.css'` in `LutContractTool.tsx`, `import '../export-tool.css'` in `ExportTool.tsx`, `import '../preview-canvas.css'` in `PreviewCanvas.tsx`

- [ ] **Step 6:** Verify in browser — the `/raw` page should render identically. Check compare split, LUT browser, export panel

- [ ] **Step 7:** Commit

---

### Task 10: Final verification

- [ ] **Step 1:** Run full CI: `pnpm lint && pnpm test:run && pnpm build`

- [ ] **Step 2:** Browser manual test — full `/raw` workflow:
  - Load a RAW file
  - Apply a LUT
  - Switch view modes (processed/original/compare), drag split
  - Export a JPEG
  - Download/copy/share the result

- [ ] **Step 3:** Commit any final fixes

---

## Dependency Order

Tasks 1-5 must run sequentially (they modify the same hook file).
Tasks 6-8 are independent and can run in any order after Task 5.
Task 9 depends on Tasks 7-8 (component files must exist to add CSS imports).
Task 10 is the final gate.
