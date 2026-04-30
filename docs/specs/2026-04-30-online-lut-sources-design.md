# Online LUT sources design

Date: 2026-04-30

Related documents:

- [`2026-04-24-phase2-raw-color-pipeline-color-science-audit.md`](./2026-04-24-phase2-raw-color-pipeline-color-science-audit.md)
- [`2026-04-25-high-resolution-browser-export-design.md`](./2026-04-25-high-resolution-browser-export-design.md)
- [`2026-04-27-export-performance-optimization-design.md`](./2026-04-27-export-performance-optimization-design.md)
- [`2026-04-28-raw-lab-ui-redesign-design.md`](./2026-04-28-raw-lab-ui-redesign-design.md)

External contract:

- `/workspaces/LumaForge/lumaforge-profiles` R2/S3 release format:
  `channels/<name>/catalog.json`, `releases/<tag>/catalog.json`,
  `releases/<tag>/entries/*.json`, and content-addressed `blobs/sha256/*`.

## Goal

Add online LUT sources as the preferred way to load LUTs in the RAW Lab while
keeping manual `.cube` upload as a fallback.

The user supplies source URLs. LumaForge must not hard-code third-party vendor
URLs in the application. A source URL may point to a compatible
`lumaforge-profiles` catalog, one compatible release entry document, or a single
`.cube` file. Compatible profile catalogs provide the best experience because
they carry title, entry metadata, SHA-256 hashes, and trusted LUT contracts.

The product goal is lower friction for ordinary users:

```text
Open RAW photo
-> choose Online LUTs
-> add or select a user-supplied source
-> pick a look by name
-> preview/export with the same fail-closed LUT graph
```

## Approved direction

Use a user-managed "Profile Sources" model.

- The RAW Lab can load compatible online LUT catalogs from URLs the user enters.
- The primary supported online format is the `lumaforge-profiles` R2/S3 runtime
  release format.
- A source URL can be a channel catalog, pinned release catalog, individual
  entry document, or direct `.cube` file.
- Registry entries with complete trusted LUT contracts can load without asking
  the user to reselect input and output contracts.
- Direct `.cube` URLs behave like manual uploads. They do not become trusted
  registry entries, and they still require explicit contract selection unless
  the cube carries supported structured LumaForge metadata.
- Manual `.cube` upload remains available for files that cannot be fetched in
  the browser because of CORS, authentication, licensing, or offline use.

The online LUT list should reduce cognitive load. Entry rows should not display
input contract, output contract, license, or cache state. Those facts remain
internal validation and diagnostics, not primary browse UI.

## Non-goals

- Do not bundle or hard-code third-party LUT source URLs in the LumaForge app.
- Do not use a server proxy, native helper, or account-backed cloud storage for
  the first version.
- Do not crawl arbitrary websites, vendor download pages, bucket listings, R2
  management APIs, S3 LIST, or HEAD discovery endpoints.
- Do not bypass CORS. If a user-supplied URL cannot be fetched by the browser,
  the fallback is manual download and upload.
- Do not publish, mirror, transform, or redistribute third-party LUTs from
  user-entered URLs.
- Do not treat direct `.cube` URLs as trusted contracts based on filename,
  title, or free-form comments.
- Do not add catalog editing or `lumaforge-profiles` authoring features to the
  RAW Lab.
- Do not change the scene-referred LUT graph, export worker, or JPEG export
  correctness rules as part of this feature.

## Source URL model

The user can add a source URL from the LUT tool surface.

Supported source types:

1. Catalog URL:
   `https://profiles.example.com/channels/stable/catalog.json`
   or `https://profiles.example.com/releases/v2026.05.01/catalog.json`.
2. Entry URL:
   `https://profiles.example.com/releases/v2026.05.01/entries/org.example.lut.look.json`.
3. Direct cube URL:
   `https://example.com/luts/look.cube`.

The app stores user-added source records locally:

```ts
type ProfileSourceRecord = {
  id: string
  url: string
  type: 'catalog' | 'entry' | 'cube' | 'unknown'
  title?: string
  addedAt: number
  lastFetchedAt?: number
  lastErrorCode?: ProfileSourceErrorCode
}
```

Source records are local browser preferences. They are not committed to the
repo, uploaded, synced, or shared by default.

The app may infer the source type from the URL suffix and response shape. A URL
with an unknown suffix can still be fetched once and classified by content type
and JSON shape.

## URL query resources and sharing

The RAW Lab should also accept online LUT resources from the initial page URL.
This is a source-sharing mechanism, not a way to embed LUT bytes or RAW files.

Use repeatable `luts` query parameters:

```text
/raw?luts=https%3A%2F%2Fprofiles.example.com%2Fchannels%2Fstable%2Fcatalog.json

/raw?luts=https%3A%2F%2Fprofiles.example.com%2Fchannels%2Fstable%2Fcatalog.json&luts=https%3A%2F%2Fexample.com%2Fluts%2Flook.cube
```

Each `luts` value is one encoded resource URL. Supported values are the same as
user-entered source URLs: catalog URL, entry URL, or direct `.cube` URL.

On first RAW Lab load, the app should:

1. Read all `luts` query parameters.
2. Decode each value as a resource URL.
3. Apply the same URL policy used by manually added sources.
4. Deduplicate by normalized URL.
5. Add valid resources to the local source manager as query-provided sources.
6. Classify each resource as a supported catalog, entry, or cube source.
7. Surface invalid resources as source-level errors without blocking the RAW
   workspace.

Query-provided sources must be idempotent. Reloading the same URL or navigating
within the RAW Lab should not duplicate source records. The app should parse the
initial query once per page load or route entry, then treat accepted resources
like user-managed local sources.

Successful resource parsing means the URL passes source policy and can be
classified as a catalog, entry, or direct cube resource. It does not mean a LUT
asset has been downloaded, hash-verified, parsed, or applied. Catalog and entry
resources may fetch JSON metadata during classification. Direct cube resources
should not download cube bytes during query parsing; they should validate bytes
only when the user selects that LUT source.

The app should not automatically apply a LUT from the query string to the active
RAW photo. Query resources populate the online source list; the user still
chooses which LUT to use. This avoids surprise remote fetches becoming visible
image changes and keeps direct `.cube` URLs aligned with the manual-upload
contract flow.

After the resource links have been parsed successfully, the source manager
should offer a share action that creates a URL for the current RAW Lab route
with canonical `luts` query parameters for the valid source resources. The share
URL should include:

- valid catalog source URLs,
- valid entry source URLs,
- valid direct cube source URLs when they were added as URL resources.

The share URL must not include:

- the user's RAW photo,
- downloaded LUT bytes,
- cache keys or storage keys,
- SHA-256 hashes unless they are already part of the source URL,
- selected LUT state,
- user-selected manual contract overrides,
- local file uploads,
- source records that failed URL policy validation.

Share should use the Web Share API when available and fall back to copying the
link. If no valid source resources are available, the share action should stay
unavailable.

Because query URLs are visible to anyone receiving the link, the UI should not
encourage users to share source URLs that contain credentials, private tokens, or
personal signed links. Production URL policy should reject URLs with username or
password components. Other query parameters inside a source URL are preserved
because signed public CDN URLs may rely on them, but sharing such URLs is an
explicit user action.

## Compatible profile contract

The online loader should accept the existing `lumaforge-profiles` R2/S3 runtime
contract without requiring a publishing-format change for the first version.

Catalog documents provide a small browse surface:

```ts
type ReleaseCatalog = {
  schemaVersion: 1
  id: string
  title: string
  description: string
  tag: string
  generatedAt: string
  publicBaseUrl: string
  entries: CatalogEntryDocument[]
}
```

Catalog entries provide title, kind, version, `entryUrl`, and `primaryAsset`.
Full LUT metadata lives in each entry document, so the RAW Lab should hydrate
entry documents lazily when the user selects, opens details for, or when the
background loader has idle time for visible rows.

An entry is loadable as an online LUT only when:

- `schemaVersion` is `1`,
- `kind` is `lut`,
- `format` is `cube`,
- `redistributionAllowed` is `true`,
- the primary asset role is `cube-lut`,
- the primary asset media type is `application/x-cube-lut` or otherwise
  recognized as a cube LUT by extension,
- the entry or asset includes a 64-character SHA-256 hash,
- the asset URL is absolute HTTPS, unless development mode explicitly allows
  localhost,
- the downloaded bytes match the declared SHA-256,
- the cube parser accepts the file, and
- the LUT contract is complete enough to be renderable, or the UI enters the
  existing explicit contract selection state.

The release catalog can be strict about redistributable entries because it
represents published registry state. Direct `.cube` sources are different: the
user is fetching a URL for local use, and LumaForge does not claim the asset is
redistributable.

## Data flow

Catalog source:

```text
user enters catalog URL
-> fetch JSON with credentials omitted
-> validate release catalog shape
-> store source record and lightweight catalog cache
-> list compatible LUT entries by title
-> user selects entry
-> fetch entryUrl if not hydrated
-> validate entry shape and LUT metadata
-> fetch primaryAsset.url
-> compute SHA-256
-> compare declared hash
-> parse cube bytes
-> map entry.lut metadata to a renderable LUT contract
-> load the LUT through the same preview/export path as manual upload
```

Entry source:

```text
user enters entry URL
-> fetch JSON with credentials omitted
-> validate entry shape
-> synthesize a one-entry source
-> fetch and verify primary asset when selected
-> load through the shared LUT path
```

Direct cube source:

```text
user enters cube URL
-> fetch bytes with credentials omitted
-> enforce size and content limits
-> parse cube bytes
-> use structured LumaForge cube metadata if present
-> otherwise enter explicit contract selection
-> load through the shared LUT path
```

Manual upload should share the final parse and load pipeline:

```text
File or downloaded bytes
-> parseCubeLUT(...)
-> validateLUT(...)
-> resolve or request LUT contract
-> toCustomStyle(...)
-> invalidate export graph
-> update preview/export session
```

This requires refactoring the current `loadLUT(file)` hook path into a shared
byte/source loader rather than duplicating parsing and session updates.

Initial query source:

```text
user opens /raw?luts=<resource-url>&luts=<resource-url>
-> parse and normalize luts query values
-> validate each resource URL against the source URL policy
-> deduplicate against existing local source records
-> add valid resources to the source manager
-> classify accepted resources without downloading direct cube bytes
-> show source-level errors for invalid resources
-> enable share-link action once at least one resource is valid
```

## Product UI

The LUT tool should make online LUTs the primary path and manual upload the
fallback.

Recommended structure:

```text
LUT contract
-> Online LUTs
   -> source selector / add source
   -> collapsed source summaries
   -> floating entry browser when a source is opened
-> File upload fallback
-> Contract status only after a LUT is loaded or needs user input
```

Remote LUT sources are collapsed by default. A source summary should show:

- source label,
- compatible LUT count when known,
- loading state,
- source-level issue state,
- refresh, share, remove, and open actions where applicable.

Opening a source should show its entries in an anchored floating browser rather
than pushing the tool panel downward. The floating browser should have a fixed
maximum height and its own internal scrolling. Large catalogs are supported as
a browse surface, but the UI should not encourage users to manage many
catalogs or behave like a general asset library.

Do not add search, filtering, sorting, favorites, or catalog-management
features in this version. Source URLs remain user-managed compatibility inputs,
not a curated in-app store.

The floating entry browser is deliberately simple. A row should show:

- LUT title,
- optional source or collection name when it helps distinguish duplicate titles,
- selected state.

Do not show these fields in each entry row:

- input contract,
- output contract,
- license,
- cache state,
- hash,
- storage key,
- blob URL.

Those facts may appear only in a secondary diagnostic disclosure, developer
debug UI, error detail, or future advanced mode. The default UI should help a
user pick a look, not read a color-management manifest.

When a user selects a registry LUT with a complete trusted contract, the visible
state can say the LUT is ready. It does not need to restate the input and output
contract in the entry row. If the selected LUT cannot render because its
contract is incomplete or unsupported, reuse the existing contract selection or
unsupported-output messaging at the loaded-LUT status level.

The source manager should stay compact:

- Add source URL.
- Refresh source.
- Remove source.
- Share source link when one or more resource URLs are valid.
- Show source-level failures, such as CORS blocked or invalid catalog.

Desktop interaction should use a click-open anchored floating browser. Hover
should not open it. `Esc` should close the browser, outside click should close
it, and focus should return to the source open control. Mobile interaction
should use a bottom-sheet-like overlay within the RAW tools surface rather than
a narrow popover.

It should not expose bucket internals, release object paths, or full manifest
fields as the normal browsing model.

The share action belongs to the source manager, not to individual entry rows.
Its job is to share the user's LUT resource setup, not a selected LUT asset or
the current RAW edit.

## Contract mapping

Registry LUT metadata maps into the existing app contract model.

`entry.lut.inputGamut`, `entry.lut.inputTransfer`, `entry.lut.outputGamut`,
`entry.lut.outputTransfer`, and `entry.lut.intent` are the authoritative
registry fields. They should be normalized through the app's color registry
aliases before use. A registry contract should not be accepted if it names a
gamut, transfer, role, or range the current app cannot resolve.

Recommended mapping:

```ts
type OnlineLUTContract = {
  role: LUTRole
  inputGamut: ColorGamutId
  inputTransfer: TransferFunctionId
  inputRange: SignalRange
  outputGamut?: ColorGamutId
  outputTransfer?: TransferFunctionId
  outputRange?: SignalRange
}
```

`intent` maps to role:

- `display-look` -> `display-look`
- `scene-creative` or `look` -> `scene-creative` when output remains
  scene/log, otherwise `combined-look-output` when the LUT declares Rec.709 or
  display output
- `combined-look-output` -> `combined-look-output`
- `technical-output` -> `technical-output`
- unknown or unsupported intents require explicit user confirmation or fail
  closed

The renderer remains fail-closed. A non-display LUT must still carry a complete
output contract before preview or export can use it. The online source system
only changes where trusted contract metadata can come from.

## Cache and persistence

Use two cache layers:

1. Source metadata cache:
   local JSON records for source URL, catalog summary, hydrated entries, fetch
   timestamps, and source-level errors.
2. Asset byte cache:
   Cache Storage or IndexedDB records keyed by SHA-256 for verified cube bytes.

The cache key for registry assets should be the declared SHA-256 after it is
verified. If hash verification fails, the bytes must not be cached as a trusted
asset and must not be loaded.

Direct `.cube` URL bytes may be cached only after computing a content hash, and
the cache record must remain local-user-supplied rather than registry-trusted.

The UI should not expose per-entry cache state in the default list. Cache state
can inform performance silently and can appear in debug diagnostics if needed.

## Security and licensing boundaries

All runtime fetches should use:

- `GET`,
- `credentials: 'omit'`,
- `redirect: 'follow'` within normal browser limits,
- HTTPS-only production URLs,
- explicit size limits for JSON and cube responses,
- abortable timeouts.

The first version should reject:

- `javascript:`, `data:`, `file:`, `blob:`, and extension-origin URLs entered by
  the user,
- non-HTTPS production URLs,
- URLs with username or password components,
- private browser-only credential flows,
- responses that exceed the configured catalog, entry, or cube size limits,
- assets whose computed hash does not match the registry declaration.

CORS failures are expected for many vendor sites. The product should explain
that the browser cannot fetch that URL and offer manual `.cube` upload as the
fallback.

Licensing is not inferred from user-entered URLs. LumaForge may use published
registry entries only as described by their registry metadata and only after
hash verification. Direct URL loads are local user actions and must not be
presented as LumaForge-distributed content.

## Error handling

Use stable error categories:

- `source-url-invalid`: URL is not allowed.
- `source-fetch-failed`: network failure or timeout.
- `source-cors-blocked`: browser blocked the response.
- `source-invalid-catalog`: JSON is not a compatible catalog.
- `source-invalid-entry`: JSON is not a compatible entry.
- `source-empty`: source has no compatible LUT entries.
- `asset-fetch-failed`: selected LUT bytes could not be downloaded.
- `asset-hash-mismatch`: downloaded bytes do not match declared SHA-256.
- `asset-too-large`: response exceeds the configured LUT limit.
- `lut-parse-failed`: cube parser rejected the file.
- `lut-contract-unsupported`: registry contract names an unsupported gamut,
  transfer, role, range, or output.
- `lut-contract-required`: LUT loaded but still needs explicit user contract
  selection.

Source-level errors belong in the source manager. Selected-LUT errors belong in
the LUT status area. Toasts can summarize failures, but the tool surface must
hold the durable recovery path.

## Component boundaries

Recommended implementation boundaries:

- `src/lib/profiles/source-url.ts`: URL classification and production/dev
  allowlist rules.
- `src/lib/profiles/catalog.ts`: catalog and entry validation, normalization,
  and compatibility filtering.
- `src/lib/profiles/cache.ts`: metadata and verified byte cache adapters.
- `src/lib/profiles/fetch.ts`: abortable fetch helpers with size limits.
- `src/lib/profiles/lut-contract.ts`: registry LUT metadata to app contract
  mapping.
- `src/modules/raw-processor/services/online-lut-sources.ts`: RAW Lab-facing
  source orchestration.
- `src/modules/raw-processor/hooks/useRawProcessor.ts`: refactor `loadLUT` into
  a shared `loadLUTFromSource` path that accepts local files or downloaded
  bytes.
- `src/modules/raw-processor/components/tools/LutContractTool.tsx`: add the
  online source UI while preserving manual upload.

The online source modules should be testable without React. The RAW processor
hook should only coordinate session state after a cube is parsed and validated.

## Testing

Unit coverage:

- URL classification accepts catalog, entry, and cube URLs.
- Production URL policy rejects unsafe schemes and non-HTTPS URLs.
- Production URL policy rejects URLs with username or password components.
- Query parsing accepts repeated `luts` parameters and deduplicates normalized
  resource URLs.
- Share-link serialization emits canonical repeated `luts` parameters for valid
  source resources and excludes invalid or local-file sources.
- Catalog validation accepts the current `lumaforge-profiles` release catalog
  shape.
- Entry validation accepts current release entry documents and rejects
  non-LUT, non-cube, local-only, missing-hash, and wrong-role entries.
- Hash verification rejects mismatched bytes before parsing.
- Registry LUT metadata maps to renderable app contracts only when all required
  fields resolve.
- Direct cube URLs do not become trusted contracts from filenames or
  free-form comments.
- Cache lookup by SHA-256 avoids duplicate downloads after verification.

Hook/service coverage:

- Manual upload and online downloads share the same parse, validation, session
  update, and export invalidation path.
- Initial `/raw?luts=...` navigation adds valid query resources to the source
  manager without duplicating existing source records.
- A complete registry LUT contract loads without opening the contract selector.
- An incomplete registry LUT enters the existing contract-required state.
- A CORS or fetch failure leaves the current loaded RAW session intact.

UI coverage:

- Remote LUT sources render as collapsed summaries by default.
- Opening a source renders entries in a floating browser with internal
  scrolling instead of inline panel expansion.
- The online entry browser displays title, optional source or collection, and
  selected state only.
- The entry row does not display input contract, output contract, license,
  cache state, hash, storage key, or blob URL.
- The online source UI does not include search, filtering, sorting, favorites,
  or catalog-management controls.
- The source manager enables a share-link action only after at least one source
  resource URL is valid.
- Source-level failures are visible in the source manager.
- Manual `.cube` upload remains reachable when online fetch fails.

Browser validation:

- Use a local fixture server with CORS enabled for catalog, entry, and cube
  fixtures.
- Verify that selecting an online registry LUT previews and exports through the
  same renderable contract as manual loading of the same bytes.
- Verify that a CORS-blocked source shows the fallback path without clearing the
  active RAW session.
- Verify that opening a large catalog does not increase the outer RAW Lab page
  height or force the tool panel to reflow downward.

## Acceptance criteria

- A user can add a compatible catalog URL and select a LUT by title.
- A user can add a compatible entry URL and load that single LUT.
- A user can add a direct `.cube` URL and load it through the same explicit
  contract flow as manual upload.
- A user can open `/raw?luts=<encoded-resource-url>` and see the valid resource
  in the online source manager on first load.
- After at least one resource URL is valid, the source manager offers a share
  action that produces a RAW Lab URL with canonical `luts` query parameters.
- The share URL includes source resource URLs only; it does not include RAW
  photos, downloaded LUT bytes, cache state, selected entry state, or manual
  contract overrides.
- The app verifies SHA-256 for registry assets before parsing and loading.
- The default online LUT list does not show contract, license, cache, hash, or
  storage details per entry.
- Remote LUT resources are collapsed by default, and opening a source displays
  entries in a floating browser with internal scrolling.
- The online source browser does not include search, filtering, sorting,
  favorites, or catalog-management controls.
- Manual upload remains available and unchanged as the fallback path.
- Unsupported URLs, CORS failures, invalid catalogs, hash mismatches, and
  unsupported contracts fail closed with recoverable product messages.
- Full-resolution export remains disabled for unresolved or unsupported LUT
  contracts and remains enabled for verified renderable contracts.

## Future work

If catalogs become large, `lumaforge-profiles` can add optional lightweight
facets to catalog entries, such as `format`, `lut.vendor`, `lut.family`,
`lut.inputTransfer`, and `lut.inputGamut`. The first version should not require
that schema change because the current runtime format can be consumed by lazy
entry hydration.

Future versions may add named source presets, signed catalog metadata, or
cross-device source sync. Those features should stay separate from the first
browser-local user-supplied URL workflow.
