// RenderBudget — type sketch.
//
// P2 ships the type only; the unified back-pressure logic across
// preview / candidate / export lands in P5 alongside the policy migration.
// See spec §9 (`render-budget.ts`) and §14 Q7.

export interface RenderBudget {
  /**
   * Maximum concurrent render units in flight across preview + candidate +
   * export. Each render unit consumes one slot; preview-quick is 1, an
   * export is `policy.concurrency`.
   */
  readonly maxConcurrent: number

  /**
   * Maximum candidate sweep size (`candidate-render` calls). Caps the array
   * of `RenderParams` accepted by `candidateRender(...)` before the
   * AsyncIterable starts producing.
   */
  readonly maxCandidatesPerSweep: number

  /**
   * Soft memory budget in MiB. Sinks and decode paths SHOULD respect it;
   * the engine does NOT enforce it (no monitoring) — it's a hint passed to
   * policy decisions (memory-aware strip slicing, etc.).
   */
  readonly softMemoryBudgetMiB: number
}
