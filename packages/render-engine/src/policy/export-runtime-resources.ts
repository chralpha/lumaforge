// ExportRuntimeResources — type-only mirror of
// `src/lib/runtime/export-runtime-resources.ts`. The OPFS / navigator.storage
// PROBING stays in `src/`; the engine's export-policy.ts takes the snapshot
// shape as input.

export interface ExportRuntimeResources {
  readonly opfsSinkAvailable: boolean
  readonly opfsAvailableMB: number | null
  readonly streamingSinkAvailable: boolean
}

export interface ExportRuntimeResourcesInput {
  streamingSinkAvailable: boolean
}
