import type { LumaRawCameraCalibrationProfile } from '@lumaforge/luma-raw-runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { DcpParams, DcpParamsToneCurve } from '~/lib/profiles/dcp-params'

import { applySelectedCameraProfile } from './camera-calibration-runtime'
import type { CameraProfileTelemetryEvent } from './telemetry'
import {
  resetCameraProfileTelemetrySink,
  setCameraProfileTelemetrySink,
} from './telemetry'

afterEach(() => {
  resetCameraProfileTelemetrySink()
  vi.restoreAllMocks()
})

// A dual-illuminant DCP whose ColorMatrix1 and ColorMatrix2 are visibly
// distinct so the iterative interpolation produces a non-trivial alpha and
// distinct downstream xyzToCamera values. The illuminants span A → D65.
function makeDualIlluminantDcp(): DcpParams {
  return {
    schemaVersion: 1,
    profileName: 'Synthetic Dual',
    uniqueCameraModelRestriction: null,
    profileCalibrationSignature: null,
    profileEmbedPolicy: 0,
    illuminant1: { code: 17, cct: 2856, xy: [0.44757, 0.40745] },
    illuminant2: { code: 21, cct: 6504, xy: [0.31272, 0.32903] },
    // Distinct matrices so lerp(m1, m2, alpha) varies measurably with alpha.
    colorMatrix1: [1.2, -0.3, 0.05, -0.2, 1.1, 0.1, 0.02, -0.15, 0.95],
    colorMatrix2: [0.85, 0.05, -0.1, 0.1, 1.0, -0.05, -0.1, 0.05, 1.1],
    forwardMatrix1: null,
    forwardMatrix2: null,
    toneCurve: null,
    hueSatMap: null,
    lookTable: null,
  }
}

function makeSingleIlluminantDcp(): DcpParams {
  return {
    ...makeDualIlluminantDcp(),
    illuminant2: null,
    colorMatrix2: null,
  }
}

function makeToneCurve(size = 4096): DcpParamsToneCurve {
  // Linear identity ramp, 4096 entries.
  const buffer = new ArrayBuffer(size * Float32Array.BYTES_PER_ELEMENT)
  const view = new Float32Array(buffer)
  for (let i = 0; i < size; i += 1) view[i] = i / (size - 1)
  const bytes = new Uint8Array(buffer)

  // Encode to base64 without `Buffer` to match the lib/profiles browser-only
  // contract (the consumer uses `atob`). jsdom + Node test runtimes both
  // expose `btoa` natively.
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i] as number)
  }
  const values = btoa(binary)

  return { encoding: 'cubic-spline-baked-1d-lut', size, values }
}

function makeSessionMock() {
  return {
    applyCalibration: vi
      .fn<
        (
          profile: LumaRawCameraCalibrationProfile,
          signal?: AbortSignal,
        ) => Promise<{ applied: true }>
      >()
      .mockResolvedValue({ applied: true }),
  }
}

describe('applySelectedCameraProfile', () => {
  it('emits unsupported and skips the runtime call when dcpParams is null', async () => {
    const events: CameraProfileTelemetryEvent[] = []
    setCameraProfileTelemetrySink((event) => events.push(event))
    const session = makeSessionMock()

    const result = await applySelectedCameraProfile({
      session,
      profileId: 'sony-a7m4-standard',
      dcpParams: null,
      whiteNeutral: [0.5, 1.0, 0.6],
    })

    expect(result).toEqual({ applied: false, reason: 'unsupported' })
    expect(session.applyCalibration).not.toHaveBeenCalled()
    expect(events).toEqual([
      {
        type: 'camera_profile.unsupported',
        profileId: 'sony-a7m4-standard',
        reason: 'missing_dcp_params',
      },
    ])
  })

  it('passes the single ColorMatrix1 through when the DCP is single-illuminant (alpha=0)', async () => {
    const session = makeSessionMock()
    const dcp = makeSingleIlluminantDcp()

    const result = await applySelectedCameraProfile({
      session,
      profileId: 'single',
      dcpParams: dcp,
      whiteNeutral: [0.5, 1.0, 0.6],
    })

    expect(result.applied).toBe(true)
    expect(result.alpha).toBe(0)

    expect(session.applyCalibration).toHaveBeenCalledTimes(1)
    const [profile] = session.applyCalibration.mock.calls[0]!
    expect(profile.profileId).toBe('single')
    expect(profile.profileName).toBe(dcp.profileName)
    expect(profile.xyzToCamera).toBeInstanceOf(Float32Array)
    expect(profile.xyzToCamera.length).toBe(9)
    // Single-illuminant short-circuit: xyzToCamera equals colorMatrix1.
    expect(Array.from(profile.xyzToCamera)).toEqual(
      dcp.colorMatrix1.map((value) => Math.fround(value)),
    )
    expect(profile.toneCurveLut).toBeUndefined()
  })

  it('decodes and forwards the tone-curve LUT when present', async () => {
    const session = makeSessionMock()
    const dcp = { ...makeSingleIlluminantDcp(), toneCurve: makeToneCurve(4096) }

    await applySelectedCameraProfile({
      session,
      profileId: 'tone-curve',
      dcpParams: dcp,
      whiteNeutral: [0.5, 1.0, 0.6],
    })

    expect(session.applyCalibration).toHaveBeenCalledTimes(1)
    const [profile] = session.applyCalibration.mock.calls[0]!
    expect(profile.toneCurveLut).toBeInstanceOf(Float32Array)
    expect(profile.toneCurveLut!.length).toBe(4096)
    // Endpoints of the identity ramp.
    expect(profile.toneCurveLut![0]).toBe(0)
    expect(profile.toneCurveLut![4095]).toBeCloseTo(1, 6)
  })

  it('emits camera_profile.applied with profileId, schemaVersion, alpha', async () => {
    const events: CameraProfileTelemetryEvent[] = []
    setCameraProfileTelemetrySink((event) => events.push(event))
    const session = makeSessionMock()
    const dcp = makeDualIlluminantDcp()

    const result = await applySelectedCameraProfile({
      session,
      profileId: 'dual',
      dcpParams: dcp,
      whiteNeutral: [0.5, 1.0, 0.6],
    })

    expect(result.applied).toBe(true)
    const applied = events.find(
      (event) => event.type === 'camera_profile.applied',
    )
    expect(applied).toBeDefined()
    if (applied?.type !== 'camera_profile.applied') {
      throw new Error('applied event not emitted')
    }
    expect(applied.profileId).toBe('dual')
    expect(applied.schemaVersion).toBe(1)
    expect(applied.alpha).toBeGreaterThanOrEqual(0)
    expect(applied.alpha).toBeLessThanOrEqual(1)
  })

  // Tier 3 critical test: apply A vs B yields differing xyzToCamera bytes.
  // This is the regression that guards against the silent no-op re-appearing.
  it('produces distinct xyzToCamera payloads when applying two different profiles', async () => {
    const session = makeSessionMock()
    const dcpA = makeDualIlluminantDcp()
    const dcpB: DcpParams = {
      ...dcpA,
      // Swap matrices to force a measurably different solver output even at
      // the same whiteNeutral / illuminants.
      colorMatrix1: dcpA.colorMatrix2 as readonly number[],
      colorMatrix2: dcpA.colorMatrix1,
    }

    await applySelectedCameraProfile({
      session,
      profileId: 'a',
      dcpParams: dcpA,
      whiteNeutral: [0.5, 1.0, 0.6],
    })
    await applySelectedCameraProfile({
      session,
      profileId: 'b',
      dcpParams: dcpB,
      whiteNeutral: [0.5, 1.0, 0.6],
    })

    expect(session.applyCalibration).toHaveBeenCalledTimes(2)
    const [profileA] = session.applyCalibration.mock.calls[0]!
    const [profileB] = session.applyCalibration.mock.calls[1]!

    const bytesA = new Uint8Array(profileA.xyzToCamera.buffer)
    const bytesB = new Uint8Array(profileB.xyzToCamera.buffer)
    expect(bytesA).not.toEqual(bytesB)

    // Stronger assertion: at least one matrix element differs by a measurable
    // amount (catches silent no-ops where bytes happen to match).
    let maxDelta = 0
    for (let i = 0; i < profileA.xyzToCamera.length; i += 1) {
      maxDelta = Math.max(
        maxDelta,
        Math.abs(
          (profileA.xyzToCamera[i] ?? 0) - (profileB.xyzToCamera[i] ?? 0),
        ),
      )
    }
    expect(maxDelta).toBeGreaterThan(1e-3)
  })

  it('emits camera_profile.rejected and rethrows when the session call fails', async () => {
    const events: CameraProfileTelemetryEvent[] = []
    setCameraProfileTelemetrySink((event) => events.push(event))
    const session = {
      applyCalibration: vi
        .fn<
          (
            profile: LumaRawCameraCalibrationProfile,
            signal?: AbortSignal,
          ) => Promise<{ applied: true }>
        >()
        .mockRejectedValue(new Error('worker boom')),
    }

    await expect(
      applySelectedCameraProfile({
        session,
        profileId: 'crash',
        dcpParams: makeSingleIlluminantDcp(),
        whiteNeutral: [0.5, 1.0, 0.6],
      }),
    ).rejects.toThrow('worker boom')

    const rejected = events.find(
      (event) => event.type === 'camera_profile.rejected',
    )
    expect(rejected).toBeDefined()
    if (rejected?.type !== 'camera_profile.rejected') {
      throw new Error('rejected event not emitted')
    }
    expect(rejected.reason).toBe('runtime_error')
    expect(rejected.detail).toContain('worker boom')
  })

  it('emits camera_profile.rejected when tone-curve decoding throws', async () => {
    const events: CameraProfileTelemetryEvent[] = []
    setCameraProfileTelemetrySink((event) => events.push(event))
    const session = makeSessionMock()
    const dcp = {
      ...makeSingleIlluminantDcp(),
      toneCurve: makeToneCurve(),
    }
    const decodeToneCurve = vi.fn(() => {
      throw new Error('truncated curve')
    })

    const result = await applySelectedCameraProfile({
      session,
      profileId: 'bad-curve',
      dcpParams: dcp,
      whiteNeutral: [0.5, 1.0, 0.6],
      decodeToneCurve,
    })

    expect(result).toEqual({ applied: false, reason: 'rejected' })
    expect(session.applyCalibration).not.toHaveBeenCalled()
    const rejected = events.find(
      (event) => event.type === 'camera_profile.rejected',
    )
    expect(rejected).toBeDefined()
    if (rejected?.type === 'camera_profile.rejected') {
      expect(rejected.reason).toBe('schema_invalid')
    }
  })

  it('routes per-call telemetry override away from the global sink', async () => {
    const globalEvents: CameraProfileTelemetryEvent[] = []
    const localEvents: CameraProfileTelemetryEvent[] = []
    setCameraProfileTelemetrySink((event) => globalEvents.push(event))
    const session = makeSessionMock()

    await applySelectedCameraProfile({
      session,
      profileId: 'local',
      dcpParams: makeSingleIlluminantDcp(),
      whiteNeutral: [0.5, 1.0, 0.6],
      telemetry: (event) => localEvents.push(event),
    })

    expect(localEvents.length).toBeGreaterThan(0)
    expect(globalEvents).toHaveLength(0)
  })

  it('forwards the abort signal to session.applyCalibration', async () => {
    const session = makeSessionMock()
    const controller = new AbortController()

    await applySelectedCameraProfile({
      session,
      profileId: 'with-signal',
      dcpParams: makeSingleIlluminantDcp(),
      whiteNeutral: [0.5, 1.0, 0.6],
      signal: controller.signal,
    })

    expect(session.applyCalibration).toHaveBeenCalledTimes(1)
    const [, signal] = session.applyCalibration.mock.calls[0]!
    expect(signal).toBe(controller.signal)
  })
})
