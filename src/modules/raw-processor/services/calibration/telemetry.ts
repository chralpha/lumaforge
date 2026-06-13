/**
 * Structured telemetry / debug-log events emitted by the camera-calibration
 * runtime. Silent-by-default UX (no toast, no error) does not mean silent
 * code: the boundary still emits one event per outcome so the rollout can be
 * audited.
 *
 * The event vocabulary mirrors the MVP spec exactly:
 *
 *   camera_profile.applied             { profileId, schemaVersion, alpha }
 *   camera_profile.unsupported         { profileId, reason }
 *   camera_profile.rejected            { profileId, reason, detail }
 *   camera_profile.interpolation_capped { profileId, iterations }
 *
 * The default emitter logs via `console.debug` (a no-op for end users; visible
 * in DevTools). Callers may inject a different sink for tests or for a future
 * structured logger.
 */

export type CameraProfileTelemetryEvent =
  | {
      type: 'camera_profile.applied'
      profileId: string
      schemaVersion: number
      alpha: number
    }
  | {
      type: 'camera_profile.unsupported'
      profileId: string
      reason: 'missing_dcp_params'
    }
  | {
      type: 'camera_profile.rejected'
      profileId: string
      reason: 'schema_invalid' | 'matrix_singular' | 'runtime_error'
      detail: string
    }
  | {
      type: 'camera_profile.interpolation_capped'
      profileId: string
      iterations: number
    }

export type CameraProfileTelemetrySink = (
  event: CameraProfileTelemetryEvent,
) => void

// Default sink is intentionally a no-op. The hosting app installs a real
// sink through `setCameraProfileTelemetrySink` (or wires `console.debug`
// from a single point) so the module stays compatible with the project's
// no-console lint rule. Tests install their own assertion sink.
const defaultSink: CameraProfileTelemetrySink = () => {
  /* no-op */
}

let activeSink: CameraProfileTelemetrySink = defaultSink

/**
 * Replace the global sink. Returns the previous sink so tests can restore it
 * deterministically — `vi.spyOn(console, 'debug')` is not enough when we want
 * to assert structured event payloads.
 */
export function setCameraProfileTelemetrySink(
  sink: CameraProfileTelemetrySink,
): CameraProfileTelemetrySink {
  const previous = activeSink
  activeSink = sink
  return previous
}

export function resetCameraProfileTelemetrySink(): void {
  activeSink = defaultSink
}

export function emitCameraProfileEvent(
  event: CameraProfileTelemetryEvent,
): void {
  activeSink(event)
}
