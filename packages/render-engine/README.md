# @lumaforge/render-engine

Headless render engine for LumaForge. Runs in browser and Node.js.

This package is a workspace component established per the
`docs/specs/2026-06-13-render-engine-extraction-design.md` design contract.
P2 of that spec — the skeleton — ships:

- `LumaRenderContext` injection surface (`./context/runtime-context.ts`).
- `RenderManifest` v1 + `ExportCheckpointManifest` types (`./manifest/*`).
- Canonical-JSON helper + manifest_sha256 computation (`./manifest/canonicalize.ts`).
- Whole-file streaming SHA-256 for source content identity
  (`./manifest/source-content-id.ts`).
- Incremental SHA-256 for `OutputSink` chunked writes
  (`./manifest/streaming-sha256.ts`).
- `policy/` shells (CapabilityVector input type, RenderBudget).

P3 will migrate the export engine; P4 the preview path + add candidate /
contact-sheet; P5 the policy decisions. Until those phases land this
package exposes only types + the manifest utilities.

## Subpath exports

- `@lumaforge/render-engine` — public types and entry points
- `@lumaforge/render-engine/manifest` — manifest types and hash utilities
- `@lumaforge/render-engine/policy` — policy input types

## Test environment

Tests run under Node (vitest `environment: 'node'`). The package is
designed to work in both browser and Node, but Node is the canonical test
environment.
