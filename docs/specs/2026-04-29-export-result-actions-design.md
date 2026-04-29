# Export result actions design

Date: 2026-04-29

Related documents:

- [`2026-04-25-high-resolution-browser-export-design.md`](./2026-04-25-high-resolution-browser-export-design.md)
- [`2026-04-26-full-resolution-raw-compatibility-design.md`](./2026-04-26-full-resolution-raw-compatibility-design.md)
- [`2026-04-28-raw-lab-ui-redesign-design.md`](./2026-04-28-raw-lab-ui-redesign-design.md)

## Goal

Change full-resolution JPEG export from an immediate download into an explicit
result handoff.

The export worker still produces the same authoritative full-resolution JPEG
Blob through the existing browser-local, fail-closed path. When processing
finishes, LumaForge should keep that result available and present three user
actions:

- Share
- Download
- Copy

This makes mobile export practical. Mobile browser downloads often land in a
generic Downloads location, while the system share sheet can save the final
JPEG to Photos or the platform camera roll.

## Product behavior

The export button starts processing. It does not trigger a download directly.

After processing completes, the RAW Lab enters a `JPEG ready` state and shows a
result action surface. The surface displays:

- exported filename,
- full-resolution dimensions,
- file size,
- completion state,
- Share, Download, and Copy actions.

Mobile layout should make Share the primary action. Desktop layout may make
Download the primary action while keeping Share and Copy adjacent.

The result remains available until it is invalidated by a source or render
graph change, replaced by a newer export, or dismissed by session teardown.
Closing the result surface should not discard the current exported JPEG while
the session is still valid.

## Non-goals

- Do not change the full-resolution export worker, strip scheduler, JPEG
  encoder, metadata preservation, color graph, LUT contract rules, or export
  capability gate as part of this design.
- Do not add cloud upload, server-side share links, native helpers, account
  flows, or platform-specific installed-app integrations.
- Do not silently substitute a preview-sized image for full-resolution export.
- Do not auto-open the system share sheet after worker completion. Share must
  be initiated from a user action.
- Do not make preview export look like the authoritative full-resolution
  output.

## Action semantics

### Share

Share always targets the authoritative full-resolution JPEG result.

When a result is ready, LumaForge constructs a `File` from the JPEG Blob using
the exported filename and `image/jpeg` type. The Share action is available only
when the browser can share that file. On activation, LumaForge calls the system
share flow with the file.

The Share action must be triggered from the user's button press. Worker
completion may open the result surface, but it must not call the share API
directly because browser share APIs require user activation.

If the browser cannot share JPEG files, the action surface keeps the Share
button disabled or visibly unavailable and explains that this browser cannot
share the exported JPEG. Download remains available.

User cancellation of the share sheet is not an export failure. The result
surface stays open.

### Download

Download targets the same authoritative full-resolution JPEG Blob used by
Share.

The existing object URL and temporary anchor behavior remains valid, but it
moves behind the user's Download button. The app should create the object URL
only for the download action or for an explicit result preview, and revoke it
after use or when the result is replaced.

### Copy

Copy is a convenience action, not a replacement for export.

LumaForge first attempts a full-resolution image copy when the browser supports
writing a JPEG image to the clipboard. If that path is supported, Copy writes
the authoritative exported JPEG result.

If full-resolution JPEG clipboard write is not supported, Copy remains
available as a preview-sized copy. In that state, the action label and feedback
must make the downgrade explicit:

- Button label: `Copy preview-size image`
- Success message: `Preview-size image copied`

The full-resolution path uses:

- Button label: `Copy full-resolution image`
- Success message: `Full-resolution image copied`

Preview-sized copy must copy the final processed image at preview resolution,
not the compare split, not canvas UI chrome, and not labels or controls. It
should use the current preview source and current finishing graph so the copied
image is visually close to the final JPEG, while remaining explicitly
preview-sized.

If preview-sized copy also cannot be produced, the Copy action is unavailable
with a clipboard support reason. This does not affect Share or Download.

## State model

The current export lifecycle needs to distinguish processing from result
handoff. The recommended status set is:

```ts
type ExportStatus = 'idle' | 'preparing' | 'exporting' | 'ready' | 'failed'
```

`ready` means the authoritative full-resolution JPEG exists and can be consumed
by one or more result actions.

The export state should keep a result record separate from progress and failure
facts:

```ts
type ExportResult = {
  blob: Blob
  file: File
  filename: string
  width: number
  height: number
  size: number
  createdAt: number
  copyCapability: ExportCopyCapability
}

type ExportCopyCapability =
  | { mode: 'full-resolution'; label: 'Copy full-resolution image' }
  | { mode: 'preview-size'; label: 'Copy preview-size image'; reason: string }
  | { mode: 'unavailable'; reason: string }
```

The result should be cleared when any of these changes:

- source RAW file,
- selected built-in finish,
- finish intensity,
- loaded LUT file,
- LUT input or output contract,
- export quality or fidelity settings that would change the JPEG output,
- raw render exposure facts for the active source.

The result should not be cleared by view-only changes:

- compare split,
- zoom,
- pan,
- tool sheet open or closed state,
- result surface open or closed state.

The result may live in a dedicated React/Jotai state outside the serializable
`ImageSession` object, as long as it follows the same invalidation rules.

## UI architecture

Add an export result action surface inside the RAW Lab tool system.

Desktop can render it as an expanded `Export` tool section or a compact modal.
Mobile should render it as a bottom sheet or lower action panel so Share is
reachable without leaving the preview workflow.

The surface belongs to product state, not toast state. Toasts are appropriate
for transient action feedback, but they should not be the only way to discover
that the JPEG is ready.

The Export tool should show four broad states:

1. Unavailable: export capability is still loading or failed closed.
2. Ready to process: the source and graph can be exported.
3. Processing: progress and strip count are visible.
4. JPEG ready: result actions are visible.

The `JPEG ready` state should not obscure the fact that the file is
full-resolution. When Copy is preview-sized, the UI must distinguish that single
action from the full-resolution result.

## Data flow

The processing path remains unchanged until the worker returns a Blob:

```text
user clicks Export
-> export worker runs full-resolution export
-> worker returns { blob, filename }
-> UI creates ExportResult
-> session enters ready state
-> result action surface opens
```

Result actions consume that stored result:

```text
Share
-> consume ExportResult.file
-> call system share from user activation

Download
-> consume ExportResult.blob
-> create temporary object URL
-> trigger download
-> revoke object URL

Copy full-resolution
-> consume ExportResult.blob or file
-> write JPEG image to clipboard

Copy preview-size
-> render or capture final processed preview image
-> write preview-sized image to clipboard
```

The result action surface should not re-run full-resolution export for Share or
Download. Copy preview-size may render from the preview path because it is
explicitly labeled as preview-sized.

## Error handling

Export worker failure remains an export failure and uses the existing retry
guidance.

Result action failures are action failures, not export failures:

- Share unsupported: Share is unavailable; Download remains available.
- Share canceled: no error toast; keep the result surface open.
- Share runtime failure: show a short action error and keep the result surface
  open.
- Download action failure: show a short action error when the failure is
  detectable.
- Full-resolution copy unsupported: use preview-sized copy when possible.
- Preview-sized copy unavailable: mark Copy unavailable and explain clipboard
  support.
- Copy runtime failure: show a short action error and keep the result surface
  open.

The app must not clear a successful export result because Share or Copy failed.

## Accessibility and responsive behavior

The result actions must be ordinary buttons with accessible names that include
the action and, for Copy, the size tier. Disabled actions should expose a short
reason in visible text or an accessible description.

Mobile should keep the preview workflow intact:

- Share is reachable as the primary result action.
- Download remains available as a fallback.
- Copy labels disclose full-resolution or preview-size behavior.
- Long filenames truncate visually without hiding dimensions or action buttons.

Reduced-motion users should get immediate state changes when the result surface
opens or closes.

## Testing targets

Unit and component tests should verify:

- full-resolution export completion no longer triggers an immediate anchor
  download,
- export completion stores an `ExportResult` with Blob, File, filename, size,
  and dimensions,
- Download triggers the existing object URL download only after the Download
  button is clicked,
- Share is available only when file sharing is supported,
- Share cancellation does not mark export as failed,
- Copy uses full-resolution JPEG clipboard write when supported,
- Copy falls back to a clearly labeled preview-sized image when full-resolution
  copy is unsupported,
- Copy unavailable does not affect Download or Share availability,
- changing source, finish, intensity, LUT, LUT contract, quality, or fidelity
  invalidates the stored result,
- changing compare split, zoom, pan, or tool sheet state does not invalidate the
  stored result.

Browser validation should cover:

- mobile viewport: exporting opens a result sheet with Share as the primary
  action,
- desktop viewport: exporting opens a result state without automatically
  downloading,
- Download action: download is triggered only from user click,
- unsupported Share environment: Share is unavailable and Download still works,
- unsupported full-resolution Copy environment: Copy is labeled
  `Copy preview-size image` and does not imply full-resolution clipboard output.

## Acceptance criteria

- Processing a supported RAW still uses the authoritative full-resolution export
  path and produces the same JPEG Blob as before.
- Worker completion does not directly download the JPEG.
- A result action surface appears after successful export.
- Share, Download, and Copy all consume the stored result or an explicitly
  labeled preview-sized copy path.
- Mobile prioritizes Share because it is the route most likely to save into the
  system photo library.
- Copy remains available as preview-sized copy when full-resolution clipboard
  write is unsupported, and this downgrade is visible before and after the
  action.
- Share or Copy failure does not erase the exported JPEG or change export status
  to failed.
- Existing fail-closed export capability behavior remains intact.
