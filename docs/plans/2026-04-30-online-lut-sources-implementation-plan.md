# Online LUT Sources Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add browser-local online LUT sources to RAW Lab so users can paste compatible `lumaforge-profiles` catalog, entry, or direct `.cube` URLs; accept `luts` URL query resources on first RAW Lab load; fetch and verify registry-backed LUT assets only when selected; and expose a share button that emits a canonical RAW Lab URL containing the valid source resources.

**Architecture:** Split the feature into pure source parsing, profile registry validation, verified asset fetching, RAW processor load integration, and RAW Lab UI orchestration. Query parsing and sharing stay byte-free. Registry catalog and entry sources verify SHA-256 before CUBE parsing. Direct `.cube` URLs use the same trust level as manual uploads and never inherit registry contracts from comments or filenames.

**Tech Stack:** React 19, React Router 7, TypeScript, Jotai-backed RAW processor state, Vitest + Testing Library, browser `fetch`, browser `crypto.subtle`, Cache Storage with an in-memory fallback for tests.

---

## Source Documents

- Approved spec: `docs/specs/2026-04-30-online-lut-sources-design.md`
- Profile registry format reference: `/workspaces/LumaForge/lumaforge-profiles/lumaforge-profiles.json`
- Profile entry format reference: `/workspaces/LumaForge/lumaforge-profiles/profiles/*/manifest.json`

## Execution Preconditions

- Start from a clean worktree or an isolated repo-local worktree:

```bash
git status --short
pnpm worktree feat/online-lut-sources
cd /workspaces/LumaForge/LumaForge/.worktrees/feat/online-lut-sources
pnpm install --frozen-lockfile
```

- If staying in the current checkout, still run:

```bash
git status --short
pnpm install --frozen-lockfile
```

- Do not modify RAW runtime, export worker, high-resolution export, or `lumaforge-profiles` publishing code in this implementation.

## File Plan

Create:

- `src/lib/profiles/source-url.ts`
- `src/lib/profiles/source-url.test.ts`
- `src/lib/profiles/catalog.ts`
- `src/lib/profiles/catalog.test.ts`
- `src/lib/profiles/lut-contract.ts`
- `src/lib/profiles/lut-contract.test.ts`
- `src/lib/profiles/fetch.ts`
- `src/lib/profiles/fetch.test.ts`
- `src/modules/raw-processor/services/online-lut-sources.ts`
- `src/modules/raw-processor/services/online-lut-sources.test.ts`
- `src/modules/raw-processor/hooks/useOnlineLutSources.ts`
- `src/modules/raw-processor/hooks/useOnlineLutSources.test.tsx`

Modify:

- `src/modules/raw-processor/hooks/useRawProcessor.ts`
- `src/modules/raw-processor/hooks/useRawProcessor.test.tsx`
- `src/modules/raw-processor/components/tools/LutContractTool.tsx`
- `src/modules/raw-processor/components/RawToolSurface.tsx`
- `src/modules/raw-processor/components/RawToolSurface.test.tsx`
- `src/modules/raw-processor/RawProcessorView.tsx`
- `src/modules/raw-processor/__tests__/raw-route-shell.test.tsx`
- `src/modules/raw-processor/raw-lab.css`

## Data Model

Add these public types in `src/lib/profiles/source-url.ts`:

```ts
export type ProfileSourceType = 'catalog' | 'entry' | 'cube'

export type ProfileSourceErrorCode =
  | 'empty-url'
  | 'invalid-url'
  | 'unsupported-scheme'
  | 'credentialed-url'
  | 'unsupported-resource'

export interface ProfileSourceResource {
  id: string
  url: string
  type: ProfileSourceType
  label: string
  fromQuery: boolean
}

export interface ProfileSourceParseIssue {
  raw: string
  code: ProfileSourceErrorCode
  message: string
}
```

Add these public types in `src/lib/profiles/catalog.ts`:

```ts
export interface OnlineLUTAsset {
  url: string
  sha256: string
  bytes?: number
  title?: string
}

export interface OnlineLUTEntry {
  id: string
  title: string
  sourceUrl: string
  sourceType: 'catalog-entry' | 'direct-cube'
  cube: OnlineLUTAsset
  trustedContract?: LUTContractSelection
  tags: string[]
}
```

Add these public types in `src/modules/raw-processor/services/online-lut-sources.ts`:

```ts
export interface OnlineLUTSourceState {
  resources: ProfileSourceResource[]
  entries: OnlineLUTEntry[]
  issues: ProfileSourceParseIssue[]
  activeResourceId: string | null
  isLoading: boolean
}

export interface OnlineLUTLoadRequest {
  entryId: string
  signal?: AbortSignal
}
```

Entry rows must display only title, short source label, and a load action. They must not render input contract, output contract, license, cache status, hash, or byte size.

## Task 1: Source URL, Query, And Share Utilities

- [ ] Write failing tests in `src/lib/profiles/source-url.test.ts`.

Cover these cases:

- `https://profiles.example.com/channels/stable/catalog.json` classifies as `catalog`.
- `https://profiles.example.com/releases/v2026.05.01/catalog.json` classifies as `catalog`.
- `https://profiles.example.com/releases/v2026.05.01/entries/org.example.lut.look.json` classifies as `entry`.
- `https://example.com/lumaforge-profiles.json` classifies as `catalog` for compatibility with shared registry index URLs.
- `https://example.com/kodak-2383.cube` classifies as `cube`.
- `http://localhost:4173/test.cube` is accepted for local development.
- `ftp://example.com/test.cube`, `javascript:alert(1)`, and `file:///tmp/test.cube` are rejected.
- `https://user:pass@example.com/test.cube` is rejected.
- Repeated `luts` query params are parsed in order and deduped by normalized URL:

```ts
const result = parseLUTResourceQuery(
  '?luts=https%3A%2F%2Fprofiles.example.com%2Fchannels%2Fstable%2Fcatalog.json&luts=https%3A%2F%2Fexample.com%2Fk.cube',
)

expect(result.resources).toHaveLength(2)
expect(result.resources.map((resource) => resource.type)).toEqual([
  'catalog',
  'cube',
])
```

- Source URL inner query params are preserved:

```ts
const result = parseLUTResourceQuery(
  '?luts=https%3A%2F%2Fcdn.example.com%2Fmanifest.json%3Fv%3D2',
)

expect(result.resources[0]?.url).toBe(
  'https://cdn.example.com/manifest.json?v=2',
)
```

- `createLUTResourceShareUrl("/raw?image=local", resources)` emits only `luts` params and keeps a stable ordering:

```ts
expect(createLUTResourceShareUrl('/raw?image=local', resources)).toBe(
  '/raw?luts=https%3A%2F%2Fprofiles.example.com%2Fchannels%2Fstable%2Fcatalog.json',
)
```

- [ ] Implement `normalizeProfileSourceUrl`, `classifyProfileSourceUrl`, `parseLUTResourceQuery`, and `createLUTResourceShareUrl` in `src/lib/profiles/source-url.ts`.
- [ ] Use `new URL(value, window.location.origin)` only when `window` exists; tests must pass in jsdom and Node-like Vitest contexts.
- [ ] Preserve source URL search params and hash fragments in normalized resource URLs.
- [ ] Do not fetch, preconnect, or instantiate image/file APIs in this module.
- [ ] Verify:

```bash
pnpm exec vitest run src/lib/profiles/source-url.test.ts
```

- [ ] Commit:

```bash
git add src/lib/profiles/source-url.ts src/lib/profiles/source-url.test.ts
git commit --no-gpg-sign -m "feat: add online LUT source URL parsing"
```

## Task 2: Profile Catalog, Entry, And Contract Mapping

- [ ] Write failing tests in `src/lib/profiles/catalog.test.ts` and `src/lib/profiles/lut-contract.test.ts`.

Use in-test fixtures that mirror the R2/S3 runtime release shape:

```ts
const entryManifest = {
  schemaVersion: 1,
  id: 'kodak-2383-rec709',
  kind: 'lut',
  format: 'cube',
  version: '1.0.0',
  title: 'Kodak 2383 Rec.709',
  description: null,
  license: 'NOASSERTION',
  author: 'Unknown',
  source: 'Unknown',
  sourceUrl: null,
  redistributionAllowed: true,
  targets: {},
  manifestPath: 'profiles/kodak-2383-rec709/manifest.json',
  entryUrl:
    'https://profiles.example.com/releases/v2026.05.01/entries/kodak-2383-rec709.json',
  primaryAsset: {
    role: 'cube-lut',
    mediaType: 'application/x-cube-lut',
    size: 12,
    sha256: '9c56cc51b374c3ba189210d5b6d4bf57790d351c96c47c02190ecf1e430635ab',
    url: 'https://profiles.example.com/blobs/sha256/9c/56/9c56cc51b374c3ba189210d5b6d4bf57790d351c96c47c02190ecf1e430635ab.cube',
  },
  assets: [],
  createdAt: '2026-04-30T00:00:00.000Z',
  updatedAt: '2026-04-30T00:00:00.000Z',
  lut: {
    intent: 'combined-look-output',
    input: { gamut: 'arri-wide-gamut-3', transfer: 'logc3', range: 'full' },
    output: { gamut: 'rec709', transfer: 'gamma24', range: 'legal' },
  },
  tags: ['film-print'],
}
```

Required assertions:

- A release catalog with `entries: [{ id, entryUrl, primaryAsset }]` accepts only LUT CUBE entries.
- Catalog `entryUrl` values remain absolute runtime URLs.
- A release entry selects `primaryAsset` when its role is `cube-lut` and its media type or URL extension is recognized as CUBE.
- Additional `assets` entries are accepted only as fallback when `primaryAsset` is absent from a non-release-compatible fixture.
- Missing `sha256` rejects the entry with a typed validation issue.
- Unsupported `kind`, `format`, `primaryAsset.role`, or `redistributionAllowed` rejects the entry.
- `combined-look-output` maps to `LUTContractSelection` with role `combined-look-output`.
- `display-look`, `technical-output`, and `scene-creative` map to their same roles.
- Legacy `look` maps to `combined-look-output` only when an output gamut and transfer are present; otherwise it maps to `scene-creative`.
- Missing range defaults to `"full"` for input and output contracts.
- Unknown gamut or transfer rejects the trusted contract, causing the caller to treat the entry as unavailable rather than falling back to comments.

- [ ] Implement catalog validators in `src/lib/profiles/catalog.ts`.
- [ ] Implement contract mapping in `src/lib/profiles/lut-contract.ts` using `getColorGamut` and `getTransferFunction` from `src/lib/color/registry.ts`.
- [ ] Keep validators structural and permissive only where the published registry permits optional fields. Do not add category-folder assumptions.
- [ ] Return typed issues instead of throwing for expected validation failures.
- [ ] Verify:

```bash
pnpm exec vitest run src/lib/profiles/catalog.test.ts src/lib/profiles/lut-contract.test.ts
```

- [ ] Commit:

```bash
git add src/lib/profiles/catalog.ts src/lib/profiles/catalog.test.ts src/lib/profiles/lut-contract.ts src/lib/profiles/lut-contract.test.ts
git commit --no-gpg-sign -m "feat: validate online LUT profile manifests"
```

## Task 3: Verified Fetch And Cache Layer

- [ ] Write failing tests in `src/lib/profiles/fetch.test.ts`.

Test with mocked `fetch`, `crypto.subtle.digest`, and a test cache adapter:

- `fetchJsonWithLimit` aborts through the supplied `AbortSignal`.
- JSON responses over the byte limit reject before parsing.
- Non-2xx responses return a typed network issue.
- `fetchBytesWithLimit` rejects oversized CUBE responses.
- `sha256Hex` returns lowercase hex.
- `fetchVerifiedCubeAsset` compares the response bytes against the manifest `sha256`.
- Hash mismatch returns a typed validation issue and no parsed LUT.
- Direct `.cube` URL loading uses `fetchBytesWithLimit` but never accepts a trusted contract.
- Query parsing does not call this module.
- Cache hit avoids a second network call and still verifies hash before returning bytes.

- [ ] Implement `src/lib/profiles/fetch.ts` with these exported functions:

```ts
export async function fetchJsonWithLimit<T>(
  url: string,
  options: { signal?: AbortSignal; maxBytes: number },
): Promise<T>

export async function fetchBytesWithLimit(
  url: string,
  options: { signal?: AbortSignal; maxBytes: number },
): Promise<Uint8Array>

export async function sha256Hex(bytes: Uint8Array): Promise<string>

export async function fetchVerifiedCubeAsset(
  asset: OnlineLUTAsset,
  options: {
    signal?: AbortSignal
    maxBytes: number
    cache?: OnlineProfileCache
  },
): Promise<Uint8Array>
```

- [ ] Add an `OnlineProfileCache` interface that wraps Cache Storage when available and uses an in-memory `Map<string, Uint8Array>` in tests:

```ts
export interface OnlineProfileCache {
  get(cacheKey: string): Promise<Uint8Array | null>
  set(cacheKey: string, bytes: Uint8Array): Promise<void>
}
```

- [ ] Use cache keys in the form `sha256:<hex>` for registry-backed assets and `url:<normalized-url>` for direct CUBE URLs.
- [ ] Keep CORS failures visible as source load failures. Do not proxy requests or retry through another origin.
- [ ] Verify:

```bash
pnpm exec vitest run src/lib/profiles/fetch.test.ts
```

- [ ] Commit:

```bash
git add src/lib/profiles/fetch.ts src/lib/profiles/fetch.test.ts
git commit --no-gpg-sign -m "feat: fetch verified online LUT assets"
```

## Task 4: Online LUT Source Orchestration Service

- [ ] Write failing tests in `src/modules/raw-processor/services/online-lut-sources.test.ts`.

Required assertions:

- Adding a catalog resource fetches the catalog JSON and each referenced entry manifest.
- Adding an entry resource fetches only that entry manifest.
- Adding a direct CUBE resource creates a direct entry without downloading bytes.
- Invalid query resources are recorded as issues and valid resources still load.
- Duplicate resources are not duplicated in state.
- Removing a resource removes entries owned only by that resource.
- Refreshing a resource re-fetches catalog/entry metadata but does not fetch CUBE bytes.
- The service can build share resources from the current valid source list.

- [ ] Implement pure service functions in `src/modules/raw-processor/services/online-lut-sources.ts`.

Export these operations:

```ts
export async function resolveProfileSourceResource(
  resource: ProfileSourceResource,
  options: {
    fetchJson: typeof fetchJsonWithLimit
    signal?: AbortSignal
  },
): Promise<OnlineLUTSourceResolution>

export function mergeOnlineLUTSourceResolution(
  state: OnlineLUTSourceState,
  resolution: OnlineLUTSourceResolution,
): OnlineLUTSourceState

export function removeOnlineLUTSourceResource(
  state: OnlineLUTSourceState,
  resourceId: string,
): OnlineLUTSourceState
```

- [ ] Represent each entry with its owning resource ID so removal and refresh are deterministic.
- [ ] Convert direct CUBE URLs into entries with `sourceType: "direct-cube"` and no `trustedContract`.
- [ ] Verify:

```bash
pnpm exec vitest run src/modules/raw-processor/services/online-lut-sources.test.ts
```

- [ ] Commit:

```bash
git add src/modules/raw-processor/services/online-lut-sources.ts src/modules/raw-processor/services/online-lut-sources.test.ts
git commit --no-gpg-sign -m "feat: manage online LUT source metadata"
```

## Task 5: Shared RAW Processor LUT Load Path

- [ ] Extend `src/modules/raw-processor/hooks/useRawProcessor.test.tsx` with failing tests.

Cover:

- Manual upload still calls the existing CUBE parse and style update flow.
- Online direct CUBE loading behaves like manual upload and leaves contract selection required when comments cannot resolve the input profile.
- Online registry entry loading applies `trustedContract` through `applyLUTContractSelection`.
- Unsupported trusted contract rejects the load and leaves the previous active LUT unchanged.
- Network, hash, and parse errors surface through the same toast/error path used by manual upload.

- [ ] Refactor `src/modules/raw-processor/hooks/useRawProcessor.ts` to share the parse/validate/style/session update path.

Add an internal helper shaped like:

```ts
interface LoadLUTContentOptions {
  content: string
  sourceName: string
  trustedContract?: LUTContractSelection
}

async function loadLUTContent(options: LoadLUTContentOptions): Promise<void> {
  const parsed = parseCubeLUT(options.content, {
    sourceName: options.sourceName,
  })

  const contracted = options.trustedContract
    ? applyLUTContractSelection(parsed, options.trustedContract)
    : parsed

  if (!contracted) {
    throw new Error('Unsupported LUT color contract.')
  }

  const validation = validateLUT(contracted)
  if (!validation.valid) {
    throw new Error(validation.errors[0] ?? 'Invalid LUT file.')
  }

  // Reuse the existing custom style/session update body.
}
```

- [ ] Keep `loadLUT(file: File)` as the manual upload API.
- [ ] Add a new returned callback from `useRawProcessor`:

```ts
loadOnlineLUT(entry: OnlineLUTEntry, options?: { signal?: AbortSignal }): Promise<void>;
```

- [ ] In `loadOnlineLUT`, fetch bytes with `fetchVerifiedCubeAsset` for registry entries, fetch direct bytes for direct CUBE entries, decode UTF-8 with `TextDecoder`, then call `loadLUTContent`.
- [ ] Use existing graph invalidation and export-result invalidation behavior exactly once per successful load.
- [ ] Verify:

```bash
pnpm exec vitest run src/modules/raw-processor/hooks/useRawProcessor.test.tsx
```

- [ ] Commit:

```bash
git add src/modules/raw-processor/hooks/useRawProcessor.ts src/modules/raw-processor/hooks/useRawProcessor.test.tsx
git commit --no-gpg-sign -m "feat: load verified online LUT entries"
```

## Task 6: RAW Lab Hook And UI Wiring

- [ ] Write failing tests in `src/modules/raw-processor/hooks/useOnlineLutSources.test.tsx` and extend `src/modules/raw-processor/components/RawToolSurface.test.tsx`.

Required assertions:

- First RAW Lab load with `?luts=<catalog-url>` parses the resource once.
- Re-rendering with the same search string does not duplicate resources.
- The hook exposes a disabled share state when no valid source exists.
- The hook exposes an enabled share action after at least one valid resource parses.
- The share action writes the canonical URL to `navigator.clipboard.writeText` when available.
- Remote LUT sources render as collapsed summary rows by default.
- Source summary rows show source label, compatible LUT count when known, source loading/issue state, and source actions.
- Opening a source renders entry rows in a floating browser, not inline in the tool stack.
- The floating browser uses a fixed max height with internal scrolling.
- Entry rows render title and load action only inside the floating browser.
- Entry rows do not render `input contract`, `output contract`, `license`, `cache`, `sha256`, or byte count text.
- The source UI does not include search, filtering, sorting, favorites, or catalog-management controls.
- `Escape` and outside click close the floating browser, and focus returns to the source open control.
- Manual upload controls remain visible.

- [ ] Implement `src/modules/raw-processor/hooks/useOnlineLutSources.ts`.

Hook inputs:

```ts
export interface UseOnlineLutSourcesOptions {
  search: string
  pathname: string
  loadOnlineLUT: (
    entry: OnlineLUTEntry,
    options?: { signal?: AbortSignal },
  ) => Promise<void>
}
```

Hook outputs:

```ts
export interface UseOnlineLutSourcesResult {
  state: OnlineLUTSourceState
  sourceUrlInput: string
  setSourceUrlInput(value: string): void
  addSourceFromInput(): Promise<void>
  refreshSource(resourceId: string): Promise<void>
  removeSource(resourceId: string): void
  loadEntry(entryId: string): Promise<void>
  share: {
    enabled: boolean
    url: string
    copy(): Promise<void>
  }
}
```

- [ ] Use `useRef` to remember the initial search string that has already been imported.
- [ ] Abort in-flight source metadata requests on unmount and when refreshing the same resource.
- [ ] Do not abort a RAW photo decode/export operation from this hook.
- [ ] Modify `src/modules/raw-processor/RawProcessorView.tsx`:

```ts
const location = useLocation()
const processor = useRawProcessor()
const onlineLutSources = useOnlineLutSources({
  search: location.search,
  pathname: location.pathname,
  loadOnlineLUT: processor.loadOnlineLUT,
})
```

- [ ] Add props to `RawToolSurface` and pass them into `LutContractTool`.
- [ ] Update `LutContractTool` with:
  - Source URL input
  - Add source button
  - Share button, enabled only after valid parsed resources exist
  - Collapsed resource summary rows with refresh, remove, and open actions
  - Source entry counts and source-level loading/issue states in summary rows
  - A click-open floating entry browser with fixed max height and internal scrolling
  - Simple entry rows with title, source label, and load action inside the floating browser
  - Desktop close behavior for `Escape` and outside click, with focus restored to the open control
  - Mobile bottom-sheet-like overlay behavior instead of a narrow popover
  - Existing manual upload area below or above the online source controls
- [ ] Use lucide-react icons for add, refresh, remove, share, and download/load buttons.
- [ ] Do not add search, filtering, sorting, favorites, or catalog-management controls.
- [ ] Update `src/modules/raw-processor/raw-lab.css` with responsive, compact controls, anchored floating browser positioning, internal list scrolling, and reduced-motion-safe state transitions. Avoid nested cards and avoid hero-style typography.
- [ ] Verify:

```bash
pnpm exec vitest run src/modules/raw-processor/hooks/useOnlineLutSources.test.tsx src/modules/raw-processor/components/RawToolSurface.test.tsx
```

- [ ] Commit:

```bash
git add src/modules/raw-processor/hooks/useOnlineLutSources.ts src/modules/raw-processor/hooks/useOnlineLutSources.test.tsx src/modules/raw-processor/components/tools/LutContractTool.tsx src/modules/raw-processor/components/RawToolSurface.tsx src/modules/raw-processor/components/RawToolSurface.test.tsx src/modules/raw-processor/RawProcessorView.tsx src/modules/raw-processor/raw-lab.css
git commit --no-gpg-sign -m "feat: add RAW Lab online LUT source controls"
```

## Task 7: Route-Level Query And Sharing Acceptance Tests

- [ ] Extend `src/modules/raw-processor/__tests__/raw-route-shell.test.tsx`.

Cover:

- Rendering `/raw?luts=https%3A%2F%2Fexample.com%2Flumaforge-profiles.json` imports the resource into the source manager.
- Rendering `/raw?luts=javascript%3Aalert(1)&luts=https%3A%2F%2Fexample.com%2Fvalid.cube` keeps the valid CUBE resource and surfaces one issue.
- Share button copies `/raw?luts=<encoded-valid-resource>` and excludes unrelated RAW Lab params.
- Direct CUBE query resource does not download until the user clicks its load action.

- [ ] Add one integration test that stubs catalog JSON, entry manifest JSON, CUBE bytes, and hash verification to exercise the full flow from query source to active custom LUT.
- [ ] Verify:

```bash
pnpm exec vitest run src/modules/raw-processor/__tests__/raw-route-shell.test.tsx
```

- [ ] Commit:

```bash
git add src/modules/raw-processor/__tests__/raw-route-shell.test.tsx
git commit --no-gpg-sign -m "test: cover RAW Lab online LUT source workflow"
```

## Task 8: Full Verification And Final Review

- [ ] Run targeted unit and component tests:

```bash
pnpm exec vitest run src/lib/profiles/source-url.test.ts src/lib/profiles/catalog.test.ts src/lib/profiles/lut-contract.test.ts src/lib/profiles/fetch.test.ts
pnpm exec vitest run src/modules/raw-processor/services/online-lut-sources.test.ts src/modules/raw-processor/hooks/useOnlineLutSources.test.tsx src/modules/raw-processor/hooks/useRawProcessor.test.tsx src/modules/raw-processor/components/RawToolSurface.test.tsx src/modules/raw-processor/__tests__/raw-route-shell.test.tsx
```

- [ ] Run repo-wide checks:

```bash
pnpm test:run
pnpm exec tsc --noEmit
pnpm exec prettier --check "src/**/*.{ts,tsx}" "docs/specs/2026-04-30-online-lut-sources-design.md" "docs/plans/2026-04-30-online-lut-sources-implementation-plan.md"
git diff --check
```

- [ ] Inspect the online LUT UI in the browser:

```bash
pnpm dev
```

Open:

- `http://localhost:5173/raw`
- `http://localhost:5173/raw?luts=https%3A%2F%2Fexample.com%2Flumaforge-profiles.json`

Manual acceptance:

- Pasted catalog URL adds a collapsed source summary with the compatible LUT count.
- Opening a source shows entries in a floating browser with internal scrolling, without expanding the tool panel downward.
- Pasted entry manifest URL adds exactly that entry.
- Pasted direct `.cube` URL adds a direct entry without downloading bytes.
- Invalid URL produces a clear inline issue and does not remove valid sources.
- Share button appears after a valid source resource parses and copies a URL containing only `luts` params.
- Entry rows do not show input contract, output contract, license, cache, hash, or bytes.
- The online source UI does not show search, filtering, sorting, favorites, or catalog-management controls.
- `Escape` and outside click close the floating browser and return focus to the source open control.
- Loading a registry-backed entry fetches, verifies, parses, applies the trusted contract, and activates the LUT.
- Loading a direct CUBE entry behaves like manual upload.
- Manual upload still works after adding and removing online sources.

- [ ] Review final diff:

```bash
git status --short
git log --oneline --decorate -8
git diff origin/main...HEAD --stat
```

- [ ] If any verification command fails, fix the failing task before creating the final implementation handoff.

## Implementation Notes

- Query import success means resource URL policy and source classification succeeded. It does not imply network success, hash success, or CUBE parse success.
- The share URL includes valid source resources only. It excludes RAW photo state, downloaded LUT bytes, cache keys, selected LUT state, manual contract overrides, local file uploads, and invalid source attempts.
- Registry-backed entries are trusted only after manifest validation and SHA-256 verification of CUBE bytes.
- Direct CUBE URLs remain untrusted. They may be parsed and resolved through existing CUBE comments, but they cannot inherit registry metadata.
- If a trusted contract cannot be resolved through the app color registry, fail closed with a visible entry/source issue.
- Keep existing manual upload and contract override behavior intact.
