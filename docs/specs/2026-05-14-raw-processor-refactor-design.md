# RAW Processor Module Refactor

## Goal

Break up large monolithic files in `src/modules/raw-processor/` while preserving
exact functionality, the existing service/hook/model/state directory structure,
and the current Jotai atom patterns.

## Problem Summary

The module already has good horizontal separation (model, services, hooks, state,
components). The problem is vertical: individual files grew too large.

| File | Lines | Issue |
|------|-------|-------|
| `hooks/useRawProcessor.ts` | 2342 | God hook: inline effects, pure logic, and orchestration all mixed |
| `components/tools/LutContractTool.tsx` | 1324 | 8+ internal sub-components bundled in one file |
| `components/PreviewCanvas.tsx` | 862 | PreviewCanvas + ExportCanvas + helpers bundled |
| `components/ControlsPanel.tsx` | 489 | ControlsPanel + MetadataPanel + StatsPanel bundled |
| `raw-lab.css` | 1809 | Some component-specific styles should be co-located |

## Approach: Service Orchestrator + Thin Hook

Move heavy implementation from the hook into dedicated **orchestrator functions**
in `services/`. These are plain async functions that take atoms and refs as
explicit parameters — no React dependency, testable in isolation. The hook
becomes a thin wiring layer (~200 lines).

### Orchestrator Function Signature Pattern

```ts
export async function orchestrateRawLoad(
  file: File,
  context: {
    atoms: { setStatus, setSession, ... }
    refs: { pipelineRef, sessionRef, ... }
    services: { replaceFile, runPreviewPipeline, ... }
  }
): Promise<void>
```

## File Changes

### 1. Split `useRawProcessor.ts` (2342 → ~200 lines)

New orchestrator files:

```
services/
  raw/
    orchestrate-raw-load.ts          # loadFile implementation (~300 lines)
  lut/
    orchestrate-lut-load.ts          # loadLUT + loadOnlineLUT + selectLUTProfile (~200 lines)
  export/
    orchestrate-full-res-export.ts   # exportImage main flow (~250 lines)
    orchestrate-export-recovery.ts   # interrupted export recovery (~80 lines)
  params/
    orchestrate-params-update.ts     # setViewMode, setCompareSplit, setPreviewViewport,
                                       selectIntensityLevel (~100 lines)

hooks/
  useRawLoader.ts                    # Thin wrapper around orchestrate-raw-load (~50 lines)
  useExportEngine.ts                 # Thin wrapper around orchestrate-full-res-export (~40 lines)
  useRawProcessor.ts                 # Composer: reads atoms, builds context, returns callbacks (~200 lines)
```

What stays in `useRawProcessor.ts`:
- Atom reads (useProcessingParamsValue, etc.)
- Ref creation (useRef for mutable non-reactive state)
- Context object construction (useMemo)
- Lifecycle effects (recovery check, mount cleanup)
- Return value assembly

### 2. Split `LutContractTool.tsx` (1324 → directory)

```
components/tools/lut/
  LutContractTool.tsx             # Main component entry (~80 lines)
  LutBrowserDialog.tsx            # LUT browser dialog (~80 lines)
  LUTProfileButton.tsx            # Profile selection button (~60 lines)
  LUTContractBrowser.tsx          # Contract browser panel (~100 lines)
  LUTProfileStatus.tsx            # Profile status indicator (~60 lines)
  LutIconButton.tsx               # LUT icon button (~50 lines)
  OnlineLutSourceControls.tsx     # Online LUT source controls (~200 lines)
  lut-browser-layout.ts           # Viewport-bounded layout math (pure functions) (~60 lines)
  lut-output-options.ts           # Output option dedup/group helpers (pure functions) (~80 lines)
  lut-contract.ts                 # Already exists, keep
```

### 3. Split `PreviewCanvas.tsx` (862 → 3 files)

```
components/
  PreviewCanvas.tsx               # Interactive preview canvas (~550 lines)
  ExportCanvas.tsx                # Off-screen export preview canvas (~200 lines)
  preview-canvas-helpers.ts       # createRawUploadInput, syncRawUploadInput, pointer utils (~80 lines)
```

### 4. Split `ControlsPanel.tsx` (489 → 3 files)

```
components/
  ControlsPanel.tsx               # Main controls layout (~280 lines)
  MetadataPanel.tsx               # Metadata display (~100 lines)
  StatsPanel.tsx                  # Pipeline stats display (~80 lines)
```

### 5. CSS Co-location

```
raw-lab.css                       # Keep for shared styles, variables, layout (~900 lines)
components/tools/lut/lut-tool.css # LUT tool specific styles (~250 lines)
components/tools/export-tool.css  # Export panel styles (~100 lines)
components/preview-canvas.css     # Preview canvas styles (~150 lines)
```

### 6. Barrel Exports

`components/index.ts` and `hooks/index.ts` keep identical re-export signatures.
No external consumers break.

## Non-Goals

- No new dependencies (no `jotai-effect`, no new packages)
- No module-level restructuring (stays under `raw-processor/`)
- No behavior changes, no prop/type signature changes
- No test file refactoring (tests are already well-organized in `__tests__/`)

## Migration Strategy

Each split is an independent, atomic commit:
1. `useRawProcessor.ts` orchestrator extraction (largest change, most risk)
2. `LutContractTool.tsx` component extraction
3. `PreviewCanvas.tsx` split
4. `ControlsPanel.tsx` split
5. CSS co-location

Each commit passes `pnpm lint && pnpm test:run && pnpm build` before proceeding.

## Verification

- `pnpm lint` — no ESLint/Prettier errors
- `pnpm test:run` — all existing tests pass unchanged
- `pnpm build` — production build succeeds
- Manual browser check of `/raw` workflow: load RAW → apply LUT → compare → export JPEG
