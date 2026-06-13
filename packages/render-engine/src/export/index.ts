// `@lumaforge/render-engine/export` subpath entry.
//
// P3a (this phase) ships the pure-logic primitives the export engine uses.
// The orchestrator function itself (`runFullResolutionJpegExport`) moves at
// P3b once the wasm-row-sink + row-writer adapter seams are refactored to
// the spec's `OutputSink` interface.

export { TypedBufferPool } from './buffer-pool'
export {
  normalizeExportConcurrency,
  runOrderedConcurrent,
} from './pipeline-concurrency'
export {
  type LinearProPhotoTile,
  type ProcessedRgb16Rows,
  processedWindowToLinearProPhotoTile,
  processedWindowToRgb16Rows,
} from './processed-window-transform'
export {
  expandRectWithHalo,
  type ExportStrip,
  MAX_EXPORT_STRIP_ROWS,
  normalizePreferredStripRows,
  planExportStrips,
  reduceStripRows,
} from './strip-scheduler'
