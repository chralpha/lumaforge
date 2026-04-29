# Export Result Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace immediate full-resolution JPEG download with a `JPEG ready` result state that offers Share, Download, and Copy actions, with preview-size copy fallback when full-resolution clipboard copy is unsupported.

**Architecture:** Keep the authoritative full-resolution export worker unchanged. Add a small browser-action service for Share/Download/Clipboard, store the successful export result in RAW session state, and render result actions from the existing Export tool. Copy uses the full-resolution JPEG Blob when browser clipboard support allows it, otherwise it renders the final processed preview image and labels that path as preview-sized.

**Tech Stack:** TypeScript 6, React 19 hooks, Jotai state atoms, Vitest, Testing Library, Web Share API, Async Clipboard API, Vite.

---

## Relationship To Existing Specs

Primary spec:

- `docs/specs/2026-04-29-export-result-actions-design.md`

Preserve these existing constraints from related specs:

- Full-resolution export remains browser-local and fail-closed.
- The full-resolution worker, strip scheduler, JPEG encoder, EXIF preservation, color graph, LUT contract rules, and export capability gate are not changed by this plan.
- Preview is not authoritative export output.
- Preview-size copy is allowed only when it is explicitly labeled as preview-sized.

## Execution Preflight

The current repo may have unrelated dirty files. Do not stage or edit them while executing this plan.

```bash
git status --short
pnpm install --frozen-lockfile
```

Expected:

- `git status --short` shows only intentional work for this feature or unrelated existing files that remain unstaged.
- `pnpm install --frozen-lockfile` exits `0`.

Recommended isolated worktree:

```bash
pnpm worktree feat/export-result-actions
cd /workspaces/LumaForge/LumaForge/.worktrees/feat/export-result-actions
pnpm install --frozen-lockfile
```

## File Structure

Create:

- `src/modules/raw-processor/model/export-result.ts`: export result, copy capability, and share capability types plus result construction.
- `src/modules/raw-processor/services/export-result-actions.ts`: browser Share, Download, full-resolution clipboard copy, and preview-size clipboard copy helpers.
- `src/modules/raw-processor/services/export-result-actions.test.ts`: deterministic service coverage with mocked browser APIs.
- `src/modules/raw-processor/components/tools/ExportTool.test.tsx`: result-action UI coverage.

Modify:

- `src/modules/raw-processor/model/session.ts`: replace export `done` status with `ready`, add optional `result`.
- `src/modules/raw-processor/model/derive-session.ts`: keep export runnable while a result is ready and keep only active export as disabled.
- `src/modules/raw-processor/__tests__/session-derive.test.ts`: status derivation coverage for `ready`.
- `src/modules/raw-processor/hooks/useImageSession.ts`: initialize the updated export state.
- `src/modules/raw-processor/hooks/useRawProcessor.ts`: stop immediate download, store `ExportResult`, expose result actions, and clear stale results on render-graph changes.
- `src/modules/raw-processor/hooks/useRawProcessor.test.tsx`: hook coverage for no auto-download, ready result storage, action behavior, and invalidation rules.
- `src/modules/raw-processor/components/tools/ExportTool.tsx`: render processing, unavailable, ready-to-process, and JPEG-ready states.
- `src/modules/raw-processor/components/RawToolSurface.tsx`: pass result and action handlers into `ExportTool`.
- `src/modules/raw-processor/RawProcessorView.tsx`: wire result props from `useRawProcessor` to `RawToolSurface`.
- `src/modules/raw-processor/raw-lab.css`: style the export result surface and action buttons for desktop and mobile tool layouts.

Do not modify:

- `src/lib/export/full-res-export.ts`
- `src/lib/export/full-res-export.worker.ts`
- `src/lib/export/jpeg-metadata.ts`
- `packages/luma-jpeg-runtime/**`
- `packages/luma-raw-runtime/**`

---

### Task 1: Add Export Result Types And Browser Action Service

**Files:**

- Create: `src/modules/raw-processor/model/export-result.ts`
- Create: `src/modules/raw-processor/services/export-result-actions.ts`
- Create: `src/modules/raw-processor/services/export-result-actions.test.ts`

- [ ] **Step 1: Write failing service tests**

Create `src/modules/raw-processor/services/export-result-actions.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'

import { createExportResult } from '../model/export-result'
import {
  copyBlobToClipboard,
  downloadExportResult,
  resolveExportCopyCapability,
  resolveExportShareCapability,
  shareExportResult,
} from './export-result-actions'

function createResult() {
  return createExportResult({
    blob: new Blob(['jpeg'], { type: 'image/jpeg' }),
    filename: 'frame_neutral_fullres.jpg',
    width: 6048,
    height: 4024,
    now: () => 123,
    copyCapability: {
      mode: 'full-resolution',
      label: 'Copy full-resolution image',
    },
  })
}

describe('export result actions', () => {
  it('creates a file-backed export result with size and dimensions', () => {
    const result = createResult()

    expect(result.filename).toBe('frame_neutral_fullres.jpg')
    expect(result.width).toBe(6048)
    expect(result.height).toBe(4024)
    expect(result.size).toBe(4)
    expect(result.createdAt).toBe(123)
    expect(result.file).toBeInstanceOf(File)
    expect(result.file.name).toBe('frame_neutral_fullres.jpg')
    expect(result.file.type).toBe('image/jpeg')
  })

  it('downloads the stored full-resolution blob only when the action is called', () => {
    const result = createResult()
    const click = vi.fn()
    const remove = vi.fn()
    const append = vi.fn()
    const link = { href: '', download: '', click, remove }
    const documentLike = {
      createElement: vi.fn(() => link),
      body: { append },
    } as unknown as Document
    const urlLike = {
      createObjectURL: vi.fn(() => 'blob:export'),
      revokeObjectURL: vi.fn(),
    } as unknown as typeof URL

    downloadExportResult(result, { document: documentLike, URL: urlLike })

    expect(urlLike.createObjectURL).toHaveBeenCalledWith(result.blob)
    expect(link.href).toBe('blob:export')
    expect(link.download).toBe('frame_neutral_fullres.jpg')
    expect(append).toHaveBeenCalledWith(link)
    expect(click).toHaveBeenCalledTimes(1)
    expect(remove).toHaveBeenCalledTimes(1)
    expect(urlLike.revokeObjectURL).toHaveBeenCalledWith('blob:export')
  })

  it('enables share only when the browser can share the JPEG file', () => {
    const result = createResult()
    const navigatorLike = {
      canShare: vi.fn(() => true),
    } as unknown as Navigator

    expect(resolveExportShareCapability(result, navigatorLike)).toEqual({
      available: true,
    })
    expect(navigatorLike.canShare).toHaveBeenCalledWith({
      files: [result.file],
    })
  })

  it('marks share unavailable when file sharing is unsupported', () => {
    const result = createResult()
    const navigatorLike = {} as Navigator

    expect(resolveExportShareCapability(result, navigatorLike)).toEqual({
      available: false,
      reason: 'This browser cannot share JPEG files.',
    })
  })

  it('calls navigator.share with the stored file from user action handlers', async () => {
    const result = createResult()
    const share = vi.fn().mockResolvedValue(undefined)
    const navigatorLike = {
      canShare: vi.fn(() => true),
      share,
    } as unknown as Navigator

    await shareExportResult(result, navigatorLike)

    expect(share).toHaveBeenCalledWith({
      files: [result.file],
      title: 'frame_neutral_fullres.jpg',
    })
  })

  it('prefers full-resolution copy when JPEG clipboard write is supported', () => {
    const write = vi.fn()
    const ClipboardItemMock = Object.assign(
      vi.fn(function ClipboardItem(items: Record<string, Blob>) {
        return { items }
      }),
      { supports: vi.fn((type: string) => type === 'image/jpeg') },
    )
    const environment = {
      navigator: { clipboard: { write } },
      ClipboardItem: ClipboardItemMock,
    }

    expect(resolveExportCopyCapability(environment)).toEqual({
      mode: 'full-resolution',
      label: 'Copy full-resolution image',
    })
  })

  it('falls back to preview-size copy when JPEG clipboard write is unsupported but PNG clipboard write is available', () => {
    const write = vi.fn()
    const ClipboardItemMock = Object.assign(
      vi.fn(function ClipboardItem(items: Record<string, Blob>) {
        return { items }
      }),
      { supports: vi.fn((type: string) => type === 'image/png') },
    )
    const environment = {
      navigator: { clipboard: { write } },
      ClipboardItem: ClipboardItemMock,
    }

    expect(resolveExportCopyCapability(environment)).toEqual({
      mode: 'preview-size',
      label: 'Copy preview-size image',
      reason: 'This browser cannot copy full-resolution JPEG files.',
    })
  })

  it('marks copy unavailable without async clipboard write support', () => {
    expect(resolveExportCopyCapability({ navigator: {} })).toEqual({
      mode: 'unavailable',
      reason: 'Clipboard image copy is not supported in this browser.',
    })
  })

  it('writes the full-resolution JPEG blob to clipboard when requested', async () => {
    const result = createResult()
    const write = vi.fn().mockResolvedValue(undefined)
    const ClipboardItemMock = vi.fn(function ClipboardItem(
      items: Record<string, Blob>,
    ) {
      return { items }
    })
    const environment = {
      navigator: { clipboard: { write } },
      ClipboardItem: ClipboardItemMock,
    }

    await copyBlobToClipboard(result.blob, environment)

    expect(ClipboardItemMock).toHaveBeenCalledWith({
      'image/jpeg': result.blob,
    })
    expect(write).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run service tests and verify they fail**

Run:

```bash
pnpm vitest run src/modules/raw-processor/services/export-result-actions.test.ts
```

Expected: FAIL because `../model/export-result` and `./export-result-actions` do not exist.

- [ ] **Step 3: Add export result model**

Create `src/modules/raw-processor/model/export-result.ts`:

```ts
export type ExportCopyCapability =
  | { mode: 'full-resolution'; label: 'Copy full-resolution image' }
  | {
      mode: 'preview-size'
      label: 'Copy preview-size image'
      reason: string
    }
  | { mode: 'unavailable'; reason: string }

export type ExportShareCapability =
  | { available: true }
  | { available: false; reason: string }

export type ExportResult = {
  blob: Blob
  file: File
  filename: string
  width: number
  height: number
  size: number
  createdAt: number
  copyCapability: ExportCopyCapability
}

export function createExportResult({
  blob,
  filename,
  width,
  height,
  now = () => Date.now(),
  copyCapability,
}: {
  blob: Blob
  filename: string
  width: number
  height: number
  now?: () => number
  copyCapability: ExportCopyCapability
}): ExportResult {
  const createdAt = now()
  const type = blob.type || 'image/jpeg'
  const file = new File([blob], filename, {
    type,
    lastModified: createdAt,
  })

  return {
    blob,
    file,
    filename,
    width,
    height,
    size: blob.size,
    createdAt,
    copyCapability,
  }
}
```

- [ ] **Step 4: Add browser action service**

Create `src/modules/raw-processor/services/export-result-actions.ts`:

```ts
import type {
  ExportCopyCapability,
  ExportResult,
  ExportShareCapability,
} from '../model/export-result'

type ClipboardEnvironment = {
  navigator?: {
    clipboard?: {
      write?: (items: ClipboardItem[]) => Promise<void>
    }
  }
  ClipboardItem?: {
    new (items: Record<string, Blob>): ClipboardItem
    supports?: (type: string) => boolean
  }
}

export function resolveExportShareCapability(
  result: ExportResult,
  navigatorLike: Navigator = navigator,
): ExportShareCapability {
  if (
    typeof navigatorLike.canShare === 'function' &&
    navigatorLike.canShare({ files: [result.file] })
  ) {
    return { available: true }
  }

  return {
    available: false,
    reason: 'This browser cannot share JPEG files.',
  }
}

export async function shareExportResult(
  result: ExportResult,
  navigatorLike: Navigator = navigator,
) {
  const capability = resolveExportShareCapability(result, navigatorLike)
  if (!capability.available) {
    throw new Error(capability.reason)
  }

  await navigatorLike.share({
    files: [result.file],
    title: result.filename,
  })
}

export function downloadExportResult(
  result: ExportResult,
  environment: {
    document?: Document
    URL?: typeof URL
  } = {},
) {
  const documentLike = environment.document ?? document
  const urlLike = environment.URL ?? URL
  const url = urlLike.createObjectURL(result.blob)
  const link = documentLike.createElement('a')

  link.href = url
  link.download = result.filename
  documentLike.body.append(link)
  link.click()
  link.remove()
  urlLike.revokeObjectURL(url)
}

export function resolveExportCopyCapability(
  environment: ClipboardEnvironment = globalThis,
): ExportCopyCapability {
  const write = environment.navigator?.clipboard?.write
  const ClipboardItemCtor = environment.ClipboardItem

  if (typeof write !== 'function' || !ClipboardItemCtor) {
    return {
      mode: 'unavailable',
      reason: 'Clipboard image copy is not supported in this browser.',
    }
  }

  if (ClipboardItemCtor.supports?.('image/jpeg')) {
    return {
      mode: 'full-resolution',
      label: 'Copy full-resolution image',
    }
  }

  if (ClipboardItemCtor.supports?.('image/png')) {
    return {
      mode: 'preview-size',
      label: 'Copy preview-size image',
      reason: 'This browser cannot copy full-resolution JPEG files.',
    }
  }

  return {
    mode: 'unavailable',
    reason: 'Clipboard image copy is not supported in this browser.',
  }
}

export async function copyBlobToClipboard(
  blob: Blob,
  environment: ClipboardEnvironment = globalThis,
) {
  const write = environment.navigator?.clipboard?.write
  const ClipboardItemCtor = environment.ClipboardItem

  if (typeof write !== 'function' || !ClipboardItemCtor) {
    throw new Error('Clipboard image copy is not supported in this browser.')
  }

  const type = blob.type || 'image/jpeg'
  await write([new ClipboardItemCtor({ [type]: blob })])
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Preview image copy failed.'))
        return
      }

      resolve(blob)
    }, type)
  })
}

export async function copyCanvasToClipboard(
  canvas: HTMLCanvasElement,
  environment: ClipboardEnvironment = globalThis,
) {
  const blob = await canvasToBlob(canvas, 'image/png')
  const pngBlob =
    blob.type === 'image/png' ? blob : new Blob([blob], { type: 'image/png' })

  await copyBlobToClipboard(pngBlob, environment)
}
```

- [ ] **Step 5: Run service tests and verify they pass**

Run:

```bash
pnpm vitest run src/modules/raw-processor/services/export-result-actions.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 1**

```bash
git add src/modules/raw-processor/model/export-result.ts src/modules/raw-processor/services/export-result-actions.ts src/modules/raw-processor/services/export-result-actions.test.ts
git commit -m "feat: add export result action services"
```

---

### Task 2: Store Export Results In Session State

**Files:**

- Modify: `src/modules/raw-processor/model/session.ts`
- Modify: `src/modules/raw-processor/model/derive-session.ts`
- Modify: `src/modules/raw-processor/__tests__/session-derive.test.ts`
- Modify: `src/modules/raw-processor/hooks/useImageSession.ts`
- Modify: `src/modules/raw-processor/hooks/useRawProcessor.ts`
- Modify: `src/modules/raw-processor/hooks/useRawProcessor.test.tsx`

- [ ] **Step 1: Write failing derivation test for ready status**

Add this test to `src/modules/raw-processor/__tests__/session-derive.test.ts`:

```ts
it('keeps export runnable when a previous result is ready', () => {
  const session: ImageSession = {
    ...baseSession,
    previewBundle: {
      ...baseSession.previewBundle,
      quickDecodePreview: { status: 'ready', width: 2000, height: 1250 },
    },
    exportState: {
      ...baseSession.exportState,
      status: 'ready',
      fullResCapability: { status: 'supported', width: 4000, height: 3000 },
    },
  }

  expect(deriveCanExport(session)).toBe(true)
  expect(deriveExportDisabledReason(session)).toBeUndefined()
})
```

- [ ] **Step 2: Write failing hook test for no immediate download**

In `src/modules/raw-processor/hooks/useRawProcessor.test.tsx`, replace the expectations in `runs the full-resolution export job with decoded render exposure and records strip progress` so it expects no anchor download and a ready result:

```ts
expect(jotaiStore.get(currentSessionAtom)?.exportState).toMatchObject({
  status: 'ready',
  lastProgress: {
    completedStrips: 4,
    totalStrips: 4,
  },
  lastSuccessfulSize: {
    width: 6048,
    height: 4024,
  },
  result: {
    filename: 'frame_neutral_fullres.jpg',
    width: 6048,
    height: 4024,
    size: 4,
  },
})
expect(click).not.toHaveBeenCalled()
expect(remove).not.toHaveBeenCalled()
expect(append).not.toHaveBeenCalled()
expect(revokeObjectURL).not.toHaveBeenCalled()
```

- [ ] **Step 3: Run targeted tests and verify they fail**

Run:

```bash
pnpm vitest run src/modules/raw-processor/__tests__/session-derive.test.ts src/modules/raw-processor/hooks/useRawProcessor.test.tsx
```

Expected: FAIL because `ready` is not part of the export status type and export still downloads immediately.

- [ ] **Step 4: Update session types**

In `src/modules/raw-processor/model/session.ts`, import the result type and replace the export status:

```ts
import type { ExportResult } from './export-result'
```

Change `exportState` to:

```ts
  exportState: {
    status: 'idle' | 'preparing' | 'exporting' | 'ready' | 'failed'
    qualityPreset: 'standard' | 'high'
    fidelityLevel: ExportFidelity
    fullResCapability: FullResExportCapabilityState
    result?: ExportResult
    lastProgress?: {
      completedStrips: number
      totalStrips: number
    }
    recommendedRetryLevel?: Extract<ExportFidelity, 'safe' | 'balanced'>
    lastSuccessfulSize?: { width: number; height: number }
    lastErrorCode?: string
    retryRecommended: boolean
  }
```

Do not leave any `status: 'done'` references in source or tests.

- [ ] **Step 5: Update export derivation**

In `src/modules/raw-processor/model/derive-session.ts`, keep the current active-export guard and allow `ready`:

```ts
export function deriveCanExport(session: ImageSession): boolean {
  return (
    session.previewBundle.quickDecodePreview.status === 'ready' &&
    session.exportState.fullResCapability.status === 'supported' &&
    session.exportState.status !== 'exporting' &&
    !deriveUnsupportedExportPipelineReason(session)
  )
}
```

The existing `deriveExportDisabledReason()` active-export branch remains:

```ts
if (session.exportState.status === 'exporting') {
  return 'Full-resolution export is already running.'
}
```

- [ ] **Step 6: Store result after export completion**

In `src/modules/raw-processor/hooks/useRawProcessor.ts`, add imports:

```ts
import { createExportResult } from '../model/export-result'
import { resolveExportCopyCapability } from '../services/export-result-actions'
```

Remove the immediate download block after `completedCapability`:

```ts
const url = URL.createObjectURL(result.blob)
const link = document.createElement('a')
link.href = url
link.download = result.filename
document.body.append(link)
link.click()
link.remove()
URL.revokeObjectURL(url)
```

Replace the success state update with:

```ts
const exportResult = createExportResult({
  blob: result.blob,
  filename: result.filename,
  width: completedCapability.width,
  height: completedCapability.height,
  copyCapability: resolveExportCopyCapability(),
})

setSession((prev) =>
  prev && prev.id === exportSessionId
    ? {
        ...prev,
        exportState: {
          ...prev.exportState,
          status: 'ready',
          result: exportResult,
          retryRecommended: false,
          lastSuccessfulSize: {
            width: completedCapability.width,
            height: completedCapability.height,
          },
        },
      }
    : prev,
)
setStatus('ready')
scheduleToast(() =>
  toast.success('JPEG ready', {
    description: result.filename,
  }),
)
```

When setting `status: 'exporting'`, clear stale result:

```ts
result: undefined,
```

When setting `status: 'failed'`, clear stale result in the failure branch:

```ts
result: undefined,
```

- [ ] **Step 7: Run targeted tests and verify they pass**

Run:

```bash
pnpm vitest run src/modules/raw-processor/__tests__/session-derive.test.ts src/modules/raw-processor/hooks/useRawProcessor.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit Task 2**

```bash
git add src/modules/raw-processor/model/session.ts src/modules/raw-processor/model/derive-session.ts src/modules/raw-processor/__tests__/session-derive.test.ts src/modules/raw-processor/hooks/useImageSession.ts src/modules/raw-processor/hooks/useRawProcessor.ts src/modules/raw-processor/hooks/useRawProcessor.test.tsx
git commit -m "feat: keep completed exports as ready results"
```

---

### Task 3: Add Result Action Handlers And Invalidation Rules

**Files:**

- Modify: `src/modules/raw-processor/hooks/useRawProcessor.ts`
- Modify: `src/modules/raw-processor/hooks/useRawProcessor.test.tsx`

- [ ] **Step 1: Add failing hook tests for actions and invalidation**

Add these tests to `src/modules/raw-processor/hooks/useRawProcessor.test.tsx` near the export tests:

```ts
it('downloads a ready export only when downloadExportResult is called', async () => {
  rawRuntimeAdapterMock.extractEmbeddedPreview.mockResolvedValue(null)
  rawRuntimeAdapterMock.decodeQuickRaw.mockResolvedValue(
    createDecodedImage('quick'),
  )
  rawRuntimeAdapterMock.decodeBoundedHqRaw.mockResolvedValue(
    createDecodedImage('bounded-hq'),
  )
  exportSystemMock.runFullResolutionExportJob.mockResolvedValue({
    filename: 'frame_neutral_fullres.jpg',
    blob: new Blob(['jpeg'], { type: 'image/jpeg' }),
  })
  const { click } = stubDownloadLink()

  const { result } = renderHook(() => useRawProcessor(), { wrapper })
  await act(async () => {
    await result.current.loadFile(new File(['raw'], 'frame.ARW'))
  })
  await act(async () => {
    await result.current.exportImage({ quality: 'high', fidelity: 'balanced' })
  })

  expect(click).not.toHaveBeenCalled()

  act(() => {
    result.current.downloadExportResult()
  })

  expect(click).toHaveBeenCalledTimes(1)
})

it('keeps a ready export after share cancellation', async () => {
  rawRuntimeAdapterMock.extractEmbeddedPreview.mockResolvedValue(null)
  rawRuntimeAdapterMock.decodeQuickRaw.mockResolvedValue(
    createDecodedImage('quick'),
  )
  rawRuntimeAdapterMock.decodeBoundedHqRaw.mockResolvedValue(
    createDecodedImage('bounded-hq'),
  )
  exportSystemMock.runFullResolutionExportJob.mockResolvedValue({
    filename: 'frame_neutral_fullres.jpg',
    blob: new Blob(['jpeg'], { type: 'image/jpeg' }),
  })
  vi.stubGlobal('navigator', {
    canShare: vi.fn(() => true),
    share: vi.fn().mockRejectedValue(
      Object.assign(new DOMException('Abort', 'AbortError'), {
        name: 'AbortError',
      }),
    ),
  })

  const { result } = renderHook(() => useRawProcessor(), { wrapper })
  await act(async () => {
    await result.current.loadFile(new File(['raw'], 'frame.ARW'))
  })
  await act(async () => {
    await result.current.exportImage({ quality: 'high', fidelity: 'balanced' })
  })
  await act(async () => {
    await result.current.shareExportResult()
  })

  expect(toastMock.error).not.toHaveBeenCalledWith(
    'Share failed',
    expect.anything(),
  )
  expect(jotaiStore.get(currentSessionAtom)?.exportState.status).toBe('ready')
  expect(jotaiStore.get(currentSessionAtom)?.exportState.result).toBeDefined()
})

it('clears a ready export when render graph inputs change but not when compare split changes', async () => {
  rawRuntimeAdapterMock.extractEmbeddedPreview.mockResolvedValue(null)
  rawRuntimeAdapterMock.decodeQuickRaw.mockResolvedValue(
    createDecodedImage('quick'),
  )
  rawRuntimeAdapterMock.decodeBoundedHqRaw.mockResolvedValue(
    createDecodedImage('bounded-hq'),
  )
  exportSystemMock.runFullResolutionExportJob.mockResolvedValue({
    filename: 'frame_neutral_fullres.jpg',
    blob: new Blob(['jpeg'], { type: 'image/jpeg' }),
  })

  const { result } = renderHook(() => useRawProcessor(), { wrapper })
  await act(async () => {
    await result.current.loadFile(new File(['raw'], 'frame.ARW'))
  })
  await act(async () => {
    await result.current.exportImage({ quality: 'high', fidelity: 'balanced' })
  })

  expect(jotaiStore.get(currentSessionAtom)?.exportState.result).toBeDefined()

  act(() => {
    result.current.setCompareSplit(0.25)
  })
  expect(jotaiStore.get(currentSessionAtom)?.exportState.result).toBeDefined()

  act(() => {
    result.current.selectIntensityLevel('strong')
  })
  expect(jotaiStore.get(currentSessionAtom)?.exportState.status).toBe('idle')
  expect(jotaiStore.get(currentSessionAtom)?.exportState.result).toBeUndefined()
})
```

- [ ] **Step 2: Run hook tests and verify they fail**

Run:

```bash
pnpm vitest run src/modules/raw-processor/hooks/useRawProcessor.test.tsx
```

Expected: FAIL because `downloadExportResult`, `shareExportResult`, and stale-result invalidation do not exist yet.

- [ ] **Step 3: Add a stale-result clearing helper**

In `src/modules/raw-processor/hooks/useRawProcessor.ts`, add this helper near other local helpers:

```ts
function clearExportResultState<T extends ImageSession | null>(session: T): T {
  if (!session?.exportState.result) {
    return session
  }

  return {
    ...session,
    exportState: {
      ...session.exportState,
      status:
        session.exportState.status === 'ready'
          ? 'idle'
          : session.exportState.status,
      result: undefined,
    },
  }
}
```

If `ImageSession` is not imported as a value type in this file, add it to the existing type import from `../model/session`.

- [ ] **Step 4: Clear result when render graph inputs change**

In `useRawProcessor.ts`, wrap these session updates with `clearExportResultState`:

```ts
setSession((prev) =>
  prev
    ? clearExportResultState({
        ...prev,
        activeStyle: style,
        lutProfileSelection: buildLUTProfileSelectionState(parsed),
      })
    : prev,
)
```

Apply the same rule in:

- successful `loadLUT`,
- successful `selectLUTProfile`,
- `selectBuiltinStyle`,
- `selectIntensityLevel`,
- `clearLUT`.

Do not clear result in:

- `setViewMode`,
- `setCompareSplit`,
- `handleCompareSplitPreviewChange` in `RawProcessorView`.

`loadFile()` already replaces the whole session and therefore clears prior results.

- [ ] **Step 5: Add result action handlers**

In `useRawProcessor.ts`, import action helpers:

```ts
import {
  copyBlobToClipboard,
  copyCanvasToClipboard,
  downloadExportResult as downloadStoredExportResult,
  resolveExportShareCapability,
  shareExportResult as shareStoredExportResult,
} from '../services/export-result-actions'
```

Add these callbacks after `exportImage`:

```ts
const downloadExportResult = useCallback(() => {
  const result = sessionRef.current?.exportState.result
  if (!result) return

  try {
    downloadStoredExportResult(result)
  } catch (err) {
    const description =
      err instanceof Error ? err.message : 'Download action failed.'
    scheduleToast(() =>
      toast.error('Download failed', {
        description,
      }),
    )
  }
}, [scheduleToast])

const shareExportResult = useCallback(async () => {
  const result = sessionRef.current?.exportState.result
  if (!result) return

  try {
    await shareStoredExportResult(result)
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return
    }

    const description =
      err instanceof Error ? err.message : 'Share action failed.'
    scheduleToast(() =>
      toast.error('Share failed', {
        description,
      }),
    )
  }
}, [scheduleToast])

const copyExportResult = useCallback(async () => {
  const result = sessionRef.current?.exportState.result
  if (!result) return

  try {
    if (result.copyCapability.mode === 'full-resolution') {
      await copyBlobToClipboard(result.blob)
      scheduleToast(() => toast.success('Full-resolution image copied'))
      return
    }

    if (result.copyCapability.mode === 'preview-size') {
      const pipeline = pipelineRef.current
      const previewSize = stats?.previewSize
      if (!pipeline || !previewSize) {
        throw new Error('Preview image is not ready to copy.')
      }

      const canvas = await pipeline.renderToHiddenCanvas({
        width: previewSize.width,
        height: previewSize.height,
      })
      await copyCanvasToClipboard(canvas)
      scheduleToast(() => toast.success('Preview-size image copied'))
      return
    }

    throw new Error(result.copyCapability.reason)
  } catch (err) {
    const description =
      err instanceof Error ? err.message : 'Copy action failed.'
    scheduleToast(() =>
      toast.error('Copy failed', {
        description,
      }),
    )
  }
}, [scheduleToast, stats?.previewSize, pipelineRef])
```

Add `downloadExportResult`, `shareExportResult`, `copyExportResult`, and `exportShareCapability` to the hook return:

```ts
const exportResult = session?.exportState.result ?? null
const exportShareCapability = exportResult
  ? resolveExportShareCapability(exportResult)
  : { available: false as const, reason: 'Export a JPEG before sharing.' }
```

Return:

```ts
exportResult,
exportShareCapability,
downloadExportResult,
shareExportResult,
copyExportResult,
```

- [ ] **Step 6: Run hook tests and verify they pass**

Run:

```bash
pnpm vitest run src/modules/raw-processor/hooks/useRawProcessor.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit Task 3**

```bash
git add src/modules/raw-processor/hooks/useRawProcessor.ts src/modules/raw-processor/hooks/useRawProcessor.test.tsx
git commit -m "feat: add export result action handlers"
```

---

### Task 4: Render Export Result Actions In The Tool Surface

**Files:**

- Modify: `src/modules/raw-processor/components/tools/ExportTool.tsx`
- Create: `src/modules/raw-processor/components/tools/ExportTool.test.tsx`
- Modify: `src/modules/raw-processor/components/RawToolSurface.tsx`
- Modify: `src/modules/raw-processor/RawProcessorView.tsx`
- Modify: `src/modules/raw-processor/components/RawToolSurface.test.tsx`

- [ ] **Step 1: Write failing ExportTool tests**

Create `src/modules/raw-processor/components/tools/ExportTool.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { ExportResult } from '../../model/export-result'
import { ExportTool } from './ExportTool'

function createResult(overrides: Partial<ExportResult> = {}): ExportResult {
  const blob = new Blob(['jpeg'], { type: 'image/jpeg' })
  const file = new File([blob], 'frame_neutral_fullres.jpg', {
    type: 'image/jpeg',
  })

  return {
    blob,
    file,
    filename: 'frame_neutral_fullres.jpg',
    width: 6048,
    height: 4024,
    size: blob.size,
    createdAt: 123,
    copyCapability: {
      mode: 'preview-size',
      label: 'Copy preview-size image',
      reason: 'This browser cannot copy full-resolution JPEG files.',
    },
    ...overrides,
  }
}

describe('ExportTool', () => {
  it('starts export from the ready-to-process state', async () => {
    const user = userEvent.setup()
    const onExport = vi.fn()

    render(
      <ExportTool
        canExport
        isProcessing={false}
        onExport={onExport}
        exportResult={null}
        exportShareCapability={{ available: false, reason: 'Export first.' }}
        onShareExport={vi.fn()}
        onDownloadExport={vi.fn()}
        onCopyExport={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole('button', {
        name: /export full-resolution jpeg/i,
      }),
    )

    expect(onExport).toHaveBeenCalledWith({
      quality: 'high',
      fidelity: 'balanced',
    })
  })

  it('renders ready result actions without reusing the export button as download', async () => {
    const user = userEvent.setup()
    const onExport = vi.fn()
    const onShareExport = vi.fn()
    const onDownloadExport = vi.fn()
    const onCopyExport = vi.fn()

    render(
      <ExportTool
        canExport
        isProcessing={false}
        onExport={onExport}
        exportResult={createResult()}
        exportShareCapability={{ available: true }}
        onShareExport={onShareExport}
        onDownloadExport={onDownloadExport}
        onCopyExport={onCopyExport}
      />,
    )

    expect(screen.getByText('JPEG ready')).toBeInTheDocument()
    expect(screen.getByText('frame_neutral_fullres.jpg')).toBeInTheDocument()
    expect(screen.getByText('6048 x 4024')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Copy preview-size image' }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Share' }))
    await user.click(screen.getByRole('button', { name: 'Download' }))
    await user.click(
      screen.getByRole('button', { name: 'Copy preview-size image' }),
    )

    expect(onShareExport).toHaveBeenCalledTimes(1)
    expect(onDownloadExport).toHaveBeenCalledTimes(1)
    expect(onCopyExport).toHaveBeenCalledTimes(1)
    expect(onExport).not.toHaveBeenCalled()
  })

  it('keeps download available when share is unsupported', () => {
    render(
      <ExportTool
        canExport
        isProcessing={false}
        onExport={vi.fn()}
        exportResult={createResult()}
        exportShareCapability={{
          available: false,
          reason: 'This browser cannot share JPEG files.',
        }}
        onShareExport={vi.fn()}
        onDownloadExport={vi.fn()}
        onCopyExport={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Share' })).toBeDisabled()
    expect(
      screen.getByText('This browser cannot share JPEG files.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Download' })).toBeEnabled()
  })
})
```

- [ ] **Step 2: Run ExportTool tests and verify they fail**

Run:

```bash
pnpm vitest run src/modules/raw-processor/components/tools/ExportTool.test.tsx
```

Expected: FAIL because `ExportTool` does not accept result action props.

- [ ] **Step 3: Update ExportTool props and UI**

Modify `src/modules/raw-processor/components/tools/ExportTool.tsx`:

```tsx
import type {
  ExportResult,
  ExportShareCapability,
} from '../../model/export-result'
import { Button } from '~/components/ui/button'

import { ToolSection } from './ToolSection'

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function ExportTool({
  canExport,
  disabledReason,
  isProcessing,
  onExport,
  exportResult,
  exportShareCapability,
  onShareExport,
  onDownloadExport,
  onCopyExport,
}: {
  canExport: boolean
  disabledReason?: string
  isProcessing: boolean
  onExport: (options: {
    quality: 'standard' | 'high'
    fidelity: 'safe' | 'balanced' | 'max'
  }) => void
  exportResult: ExportResult | null
  exportShareCapability: ExportShareCapability
  onShareExport: () => void
  onDownloadExport: () => void
  onCopyExport: () => void
}) {
  const unavailableReason =
    disabledReason || 'Full-resolution export source is still loading.'

  return (
    <ToolSection title="Export" eyebrow="Full-res JPEG">
      {exportResult ? (
        <div className="raw-export-result">
          <div className="raw-export-result-heading">
            <span>JPEG ready</span>
            <strong>{exportResult.filename}</strong>
          </div>
          <dl className="raw-export-result-facts">
            <div>
              <dt>Size</dt>
              <dd>
                {exportResult.width} x {exportResult.height}
              </dd>
            </div>
            <div>
              <dt>File</dt>
              <dd>{formatBytes(exportResult.size)}</dd>
            </div>
          </dl>
          <div className="raw-export-actions">
            <Button
              variant="primary"
              size="sm"
              className="w-full"
              disabled={!exportShareCapability.available}
              onClick={onShareExport}
            >
              Share
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              onClick={onDownloadExport}
            >
              Download
            </Button>
            {exportResult.copyCapability.mode === 'unavailable' ? (
              <Button variant="secondary" size="sm" className="w-full" disabled>
                Copy
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                className="w-full"
                onClick={onCopyExport}
              >
                {exportResult.copyCapability.label}
              </Button>
            )}
          </div>
          {!exportShareCapability.available && (
            <p className="raw-tool-note">{exportShareCapability.reason}</p>
          )}
          {exportResult.copyCapability.mode !== 'full-resolution' && (
            <p className="raw-tool-note">
              {exportResult.copyCapability.mode === 'preview-size'
                ? exportResult.copyCapability.reason
                : exportResult.copyCapability.reason}
            </p>
          )}
        </div>
      ) : (
        <>
          <Button
            variant="primary"
            size="sm"
            className="w-full"
            disabled={!canExport || isProcessing}
            onClick={() => onExport({ quality: 'high', fidelity: 'balanced' })}
          >
            {isProcessing ? 'Preparing JPEG...' : 'Export full-resolution JPEG'}
          </Button>
          <p className="raw-tool-note">
            {canExport
              ? 'Exports from the LibRaw processed-window path.'
              : unavailableReason}
          </p>
        </>
      )}
    </ToolSection>
  )
}
```

- [ ] **Step 4: Wire RawToolSurface props**

In `src/modules/raw-processor/components/RawToolSurface.tsx`, import the result types:

```ts
import type {
  ExportResult,
  ExportShareCapability,
} from '../model/export-result'
```

Add props:

```ts
  exportResult: ExportResult | null
  exportShareCapability: ExportShareCapability
  onShareExport: () => void
  onDownloadExport: () => void
  onCopyExport: () => void
```

Pass them to `ExportTool`:

```tsx
<ExportTool
  canExport={props.canExport}
  disabledReason={props.disabledReason}
  isProcessing={props.isProcessing}
  onExport={props.onExport}
  exportResult={props.exportResult}
  exportShareCapability={props.exportShareCapability}
  onShareExport={props.onShareExport}
  onDownloadExport={props.onDownloadExport}
  onCopyExport={props.onCopyExport}
/>
```

Update `RawToolSurface.test.tsx` `baseProps`:

```ts
  exportResult: null,
  exportShareCapability: {
    available: false as const,
    reason: 'Export a JPEG before sharing.',
  },
  onShareExport: vi.fn(),
  onDownloadExport: vi.fn(),
  onCopyExport: vi.fn(),
```

- [ ] **Step 5: Wire RawProcessorView props**

In `src/modules/raw-processor/RawProcessorView.tsx`, destructure these values from `useRawProcessor()`:

```ts
exportResult,
exportShareCapability,
downloadExportResult,
shareExportResult,
copyExportResult,
```

Pass them into `RawToolSurface`:

```tsx
<RawToolSurface
  exportResult={exportResult}
  exportShareCapability={exportShareCapability}
  onShareExport={shareExportResult}
  onDownloadExport={downloadExportResult}
  onCopyExport={copyExportResult}
/>
```

- [ ] **Step 6: Run UI tests and verify they pass**

Run:

```bash
pnpm vitest run src/modules/raw-processor/components/tools/ExportTool.test.tsx src/modules/raw-processor/components/RawToolSurface.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit Task 4**

```bash
git add src/modules/raw-processor/components/tools/ExportTool.tsx src/modules/raw-processor/components/tools/ExportTool.test.tsx src/modules/raw-processor/components/RawToolSurface.tsx src/modules/raw-processor/components/RawToolSurface.test.tsx src/modules/raw-processor/RawProcessorView.tsx
git commit -m "feat: show export result actions"
```

---

### Task 5: Style The Result Surface And Run Focused Verification

**Files:**

- Modify: `src/modules/raw-processor/raw-lab.css`
- Modify: `src/modules/raw-processor/hooks/useRawProcessor.test.tsx`
- Modify: `src/modules/raw-processor/components/tools/ExportTool.test.tsx`

- [ ] **Step 1: Add CSS for result surface**

Append these styles near the existing `.raw-tool-note` and tool-section rules in `src/modules/raw-processor/raw-lab.css`:

```css
.raw-export-result {
  display: grid;
  gap: 10px;
}

.raw-export-result-heading {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.raw-export-result-heading span {
  color: var(--raw-green-deep);
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.raw-export-result-heading strong {
  min-width: 0;
  overflow: hidden;
  color: var(--raw-ink);
  font-size: 0.86rem;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.raw-export-result-facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin: 0;
}

.raw-export-result-facts div {
  min-width: 0;
}

.raw-export-result-facts dt {
  color: var(--raw-ink-soft);
  font-size: 0.68rem;
  text-transform: uppercase;
}

.raw-export-result-facts dd {
  margin: 0;
  color: var(--raw-ink);
  font-size: 0.82rem;
  font-variant-numeric: tabular-nums;
}

.raw-export-actions {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
}
```

- [ ] **Step 2: Run focused tests**

Run:

```bash
pnpm vitest run src/modules/raw-processor/services/export-result-actions.test.ts src/modules/raw-processor/__tests__/session-derive.test.ts src/modules/raw-processor/hooks/useRawProcessor.test.tsx src/modules/raw-processor/components/tools/ExportTool.test.tsx src/modules/raw-processor/components/RawToolSurface.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Run typecheck or build if no typecheck script exists**

Run:

```bash
pnpm build
```

Expected: PASS. If the build fails because local native runtime package artifacts are missing, run:

```bash
pnpm --filter @lumaforge/luma-jpeg-runtime build
pnpm --filter @lumaforge/luma-raw-runtime build
pnpm build
```

Expected: final `pnpm build` exits `0`.

- [ ] **Step 4: Browser validation**

Start the dev server:

```bash
pnpm dev --host 0.0.0.0
```

Expected: Vite prints a local URL.

Use a browser against `/raw` and validate:

- Load a supported RAW fixture.
- Click Export.
- Confirm no browser download starts when processing completes.
- Confirm the Export section shows `JPEG ready`, filename, dimensions, file size, Share, Download, and Copy.
- Confirm Download starts only after clicking Download.
- In a mobile viewport, confirm Share is visible as the primary action in the tool sheet.
- In a mocked or unsupported share environment, confirm Share is unavailable and Download remains available.
- In a mocked full-resolution clipboard-unsupported environment, confirm Copy is labeled `Copy preview-size image`.

Stop the dev server before finishing.

- [ ] **Step 5: Commit Task 5**

```bash
git add src/modules/raw-processor/raw-lab.css src/modules/raw-processor/hooks/useRawProcessor.test.tsx src/modules/raw-processor/components/tools/ExportTool.test.tsx
git commit -m "test: verify export result actions"
```

---

## Final Verification

Run the focused test suite:

```bash
pnpm vitest run src/modules/raw-processor/services/export-result-actions.test.ts src/modules/raw-processor/__tests__/session-derive.test.ts src/modules/raw-processor/hooks/useRawProcessor.test.tsx src/modules/raw-processor/components/tools/ExportTool.test.tsx src/modules/raw-processor/components/RawToolSurface.test.tsx
```

Expected: PASS.

Run the app build:

```bash
pnpm build
```

Expected: PASS.

Run browser validation from Task 5 and record the exact browser, viewport, RAW fixture, and observed result-action behavior in the delivery note.

## Acceptance Checklist

- [ ] Export completion does not call the temporary anchor download path.
- [ ] Successful export stores an `ExportResult` with Blob, File, filename, dimensions, size, created time, and copy capability.
- [ ] Export status uses `ready` for completed result handoff.
- [ ] Share uses the full-resolution `File` and is disabled when `navigator.canShare({ files })` is false.
- [ ] Download consumes the same full-resolution Blob and runs only after the user clicks Download.
- [ ] Copy writes the full-resolution JPEG when supported.
- [ ] Copy remains available as `Copy preview-size image` when full-resolution JPEG clipboard copy is unsupported and PNG clipboard write is supported.
- [ ] Preview-size copy uses the processed preview image, not compare UI chrome.
- [ ] Share cancellation and Copy failure do not clear the successful export result.
- [ ] Changing source, finish, intensity, LUT, or LUT contract clears a stale result.
- [ ] Changing compare split, zoom, pan, or tool sheet state does not clear a result.
- [ ] Existing fail-closed export gating remains intact.
