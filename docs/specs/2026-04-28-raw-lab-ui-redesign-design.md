# RAW Lab UI redesign design

Date: 2026-04-28

## Goal

Redesign the RAW Lab into a single image-first workspace that uses the current LumaForge product language: warm lab-paper surfaces, darkroom image depth, Lab Green primary actions, amber contract explanation, and restrained operational controls.

The core interaction is a draggable horizontal comparison between `Unprocessed RAW` and `Final JPEG`. Upload happens inside the same preview location that later becomes the real comparison stage. The product should no longer feel like it has a separate upload page followed by a separate editor page.

## Approved direction

Use the image-first light table direction.

- The compare surface owns the screen.
- Desktop controls live in a slim right rail.
- Tablet and mobile controls collapse into a lower drawer or bottom sheet.
- The first screen shows a sample compare surface with an upload dock inside it.
- After upload, the same region transitions into the loaded RAW session.
- Mobile is a real workflow target: upload, preview, compare, look selection, LUT contract selection, and export actions must remain reachable, with capability gates still allowed to disable unsupported full-resolution export.

## Non-goals

- Do not add a new route for upload.
- Do not keep a standalone centered upload page as the first `/raw` state.
- Do not mimic a professional grading suite with dense dark panels, scopes, nodes, or unlimited controls.
- Do not make mobile only a non-crashing responsive view. It must preserve the workflow.
- Do not treat the visible preview canvas as the authoritative full-resolution export path.
- Do not bypass export capability gates to make the UI appear more complete.

## Product scene and theme

The user is a photographer or camera hobbyist reviewing one RAW file on a laptop or tablet, often in a quiet desk or travel setting, trying to get a trustworthy finished JPEG without opening a professional grading suite. The interface should feel like a calibrated photo lab: image first, controls close at hand, and safety boundaries visible without turning the page into a pipeline diagram.

Use a restrained product palette:

- Warm paper background for the application shell.
- Darkroom ink foundation for the image stage.
- Lab Green for primary upload/export actions and verified safe states.
- Amber for color-contract labels and sequence markers.
- Warm hairlines for structure.

Avoid pure black, pure white, purple gradients, decorative glass, bokeh, side-stripe accents, and generic SaaS card grids.

## UI architecture

`/raw` always renders the workspace shell.

```text
RawProcessorView
-> WorkspaceTopBar
-> ComparePreviewStage
   -> EmptySampleCompare
   -> LoadedCompareCanvas
   -> UploadDock
   -> ProgressOverlay
   -> StageErrorState
-> ResponsiveControls
   -> FinishControls
   -> IntensityControls
   -> CustomLutControls
   -> ContractStatus
   -> ExportGate
   -> MetadataStats
```

`RawProcessorView` owns session wiring, file loading, LUT loading, export actions, and capability state. It should not branch into a separate upload page when no image is loaded.

`ComparePreviewStage` owns the visible image area, upload drop target, split-handle interaction, empty sample compare, and stage-local states. This can wrap the current `PreviewCanvas` at first, but the long-term boundary should separate viewer interaction from the rendering core.

`ResponsiveControls` reuses the current control responsibilities but changes presentation:

- Desktop: right rail, approximately 320 to 380px.
- Tablet: lower drawer under or over the stage.
- Mobile: bottom sheet or sectioned lower panel with a sticky action row.

## Empty preview behavior

Before upload, the preview stage shows a real-looking sample compare surface. It should use product image treatment, a vertical split line, a circular handle, and the same labels as the loaded state.

The upload affordance sits inside the preview stage as a compact dock:

- Primary copy: `Drop one RAW here`
- Secondary copy: `No upload, no helper, no account`
- Primary action: choose RAW file
- Accepted file formats should match the current RAW accept list.

Drag-over state should strengthen the stage affordance without replacing the whole sample compare. The user should understand that the sample surface will become their image.

## Loaded compare semantics

The left side is `Unprocessed RAW`.

This means the same decoded RAW technical development with the look/LUT intensity forced to zero. It may include the app's deterministic RAW render exposure and the same preview pipeline foundation. It is not the camera embedded JPEG and not a claim of minimally processed sensor data.

The right side is `Final JPEG`.

This means the current selected built-in look or custom LUT contract with the active intensity, using the same color graph intent that export can reproduce when supported.

The comparison should avoid a second RAW decode or a second runtime session. The target rendering model is a single coherent compare stage, preferably by extending the WebGL pipeline with a split uniform and rendering the two visual states in one preview pass. An incremental implementation may use one canvas plus a clipped overlay only if it preserves the same decoded session and does not reintroduce a dual-decode architecture.

## Interaction

The compare split defaults near 50 percent and can be adjusted with:

- Pointer drag.
- Touch drag.
- Keyboard focus on the handle with arrow-key adjustment.

The handle should have an accessible name that describes the split comparison. Touch target size should be at least 44px where practical. The current split value should survive style changes, HQ preview upgrades, and control panel open/close transitions.

Motion should be short and state-driven. Use opacity and transform transitions around 150 to 250ms. Respect `prefers-reduced-motion`; reduced-motion users should get immediate state changes.

## State behavior

Empty:

- Show sample compare and upload dock.
- Controls may show default looks and contract explanation, but unavailable actions should be clearly disabled.

Drag-over:

- Keep the sample compare visible.
- Emphasize the drop target and upload dock.

Loading and decoding:

- Keep the stage dimensions stable.
- Show progress over the stage.
- Do not collapse back into an upload page.

Embedded, quick, and HQ preview:

- Progressively upgrade the same stage.
- Do not reset compare split, selected look, zoom, pan, or control drawer state.

Error:

- Fail closed inside the stage with plain language.
- Keep recovery actions visible: choose another RAW, retry when available, reset session.

Unsupported browser:

- Preserve the product shell where possible.
- Explain the missing capability, for example WebGL2, rather than rendering a generic error page.

Exporting:

- Keep preview visible.
- Show bounded progress.
- Disable replace, reset, and conflicting changes while export is active.

## Responsive behavior

Desktop:

- Full-height workspace.
- Top bar remains compact.
- Compare stage takes remaining width and height.
- Control rail stays fixed width and scrolls independently.
- Metadata and stats can live in the control rail or a compact bottom strip if they do not reduce image priority.

Tablet:

- Keep the compare stage first.
- Collapse controls into a lower drawer.
- Export action remains visible without opening every control group.

Mobile:

- Vertical stack: compact top bar, compare stage, sticky action row, bottom sheet controls.
- The upload dock remains inside the preview stage.
- Controls are grouped by task: look, compare, LUT contract, export, file facts.
- Full-resolution export may be disabled by capability gates, but the disabled reason must be visible.

The layout must avoid text overflow in buttons, chips, file names, and contract labels. Long file names should truncate in the top bar and remain available through metadata or a tooltip-like detail surface if needed.

## Component implications

Existing components should be reshaped rather than replaced wholesale.

- `UploadState` should either be removed or reduced to an empty-stage subcomponent, not a page-level view.
- `Dropzone` should support being used as the stage-level RAW drop target without forcing a large dashed card style.
- `PreviewCanvas` should receive or be wrapped with compare controls. The rendering core should not own upload copy or control layout.
- `ControlsPanel` should become presentation-flexible enough for right rail and bottom sheet use.
- `WorkspaceHeader` should become a compact top bar with better mobile truncation and icon-backed actions.

New component names are allowed when they clarify ownership. The expected split is viewer interaction versus render core, not a broad package-level extraction in this redesign.

## Testing and verification

Automated tests should cover:

- `/raw` renders the workspace shell when there is no image.
- The empty state includes sample compare labels and upload affordance inside the preview stage.
- The standalone upload page copy no longer appears as the primary screen.
- Loaded compare labels are `Unprocessed RAW` and `Final JPEG`.
- Compare split can be changed by pointer and keyboard interaction.
- Export disabled copy remains visible when capability gates fail.
- Mobile control presentation keeps upload, look selection, LUT contract, and export reachable.

Browser verification should cover:

- Desktop viewport around 1440px wide.
- Tablet viewport around 900px wide.
- Mobile viewport around 390px wide.
- Empty state visual continuity with the landing page compare motif.
- Loaded state image priority and right-rail or bottom-sheet behavior.
- Drag-over, decoding, error, and exporting overlays do not resize the stage.

If a real RAW fixture is used for manual validation, the check should verify upload, first visible preview, compare split interaction, style selection, export gate messaging, and successful export only when capability support is present.

## Acceptance criteria

- `/raw` opens directly into the image-first workspace.
- Upload is performed inside the preview stage.
- There is no separate upload page state.
- The preview stage supports a draggable `Unprocessed RAW` versus `Final JPEG` comparison.
- The left side uses the same RAW technical-development foundation with look intensity forced to zero.
- The right side uses the active final look or LUT contract.
- Desktop, tablet, and mobile each preserve the full workflow.
- Full-resolution export remains fail-closed and capability-driven.
- The implementation follows LumaForge product design rules from `PRODUCT.md` and `DESIGN.md`.
