import { act, renderHook } from '@testing-library/react'
import type { MutableRefObject } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { CalibrationEntry } from '~/lib/profiles/calibration-catalog'
import type { DcpParams } from '~/lib/profiles/dcp-params'
import type { RawRuntimeSession } from '~/lib/raw/runtime-adapter'

import { useRawCalibrationStage } from './useRawCalibrationStage'

function makeRuntimeSessionRef(): MutableRefObject<RawRuntimeSession | null> {
  const session: Partial<RawRuntimeSession> = {
    applyCalibration: vi.fn().mockResolvedValue({ applied: true }),
  }
  return { current: session as RawRuntimeSession }
}

function makeDcpParams(overrides: Partial<DcpParams> = {}): DcpParams {
  return {
    schemaVersion: 1,
    profileName: 'Synthetic Profile',
    uniqueCameraModelRestriction: null,
    profileCalibrationSignature: null,
    profileEmbedPolicy: 0,
    illuminant1: { code: 17, cct: 2856 },
    illuminant2: null,
    colorMatrix1: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    colorMatrix2: null,
    forwardMatrix1: null,
    forwardMatrix2: null,
    toneCurve: null,
    hueSatMap: null,
    lookTable: null,
    ...overrides,
  }
}

function makeEntry(
  overrides: Partial<CalibrationEntry> = {},
): CalibrationEntry {
  return {
    id: 'sony-a7m4-standard',
    kind: 'camera-profile',
    title: 'Sony A7M4 Standard',
    version: '1.0.0',
    dcpParamsAssetUrl: 'https://example.test/profiles/a7m4-standard.json',
    dcpAssetUrl: 'https://example.test/profiles/a7m4-standard.dcp',
    ...overrides,
  }
}

describe('useRawCalibrationStage', () => {
  it('returns the no-matches surface by default and resets selection on session change', async () => {
    const runtimeSessionRef = makeRuntimeSessionRef()
    const { result, rerender } = renderHook(
      ({ sessionId }: { sessionId: string | null }) =>
        useRawCalibrationStage({
          sessionId,
          runtimeSessionRef,
          getWhiteNeutral: () => [0.5, 1, 0.6],
        }),
      { initialProps: { sessionId: 'session-1' } },
    )

    expect(result.current.availableProfiles).toEqual([])
    expect(result.current.selectedCameraProfileId).toBe(null)

    // Select null — pure state, no runtime call.
    await act(async () => {
      await result.current.selectCameraProfile(null)
    })
    expect(result.current.selectedCameraProfileId).toBe(null)

    // Force a value, then change sessionId — selection must reset.
    await act(async () => {
      await result.current.selectCameraProfile('unknown')
    })
    expect(result.current.selectedCameraProfileId).toBe('unknown')

    rerender({ sessionId: 'session-2' })
    expect(result.current.selectedCameraProfileId).toBe(null)
  })

  it('fetches the dcp-params sidecar and forwards a converged profile to applyCalibration', async () => {
    const runtimeSessionRef = makeRuntimeSessionRef()
    const entry = makeEntry()
    const dcp = makeDcpParams()
    const fetchDcpParams = vi.fn().mockResolvedValue(dcp)
    const applyService = vi.fn().mockResolvedValue({ applied: true, alpha: 0 })

    const { result } = renderHook(() =>
      useRawCalibrationStage({
        sessionId: 'session-1',
        runtimeSessionRef,
        getAvailableProfiles: () => [entry],
        getWhiteNeutral: () => [0.5, 1, 0.6],
        fetchDcpParams,
        applyService,
      }),
    )

    expect(result.current.availableProfiles).toEqual([entry])

    let outcome: unknown
    await act(async () => {
      outcome = await result.current.selectCameraProfile(entry.id)
    })

    expect(fetchDcpParams).toHaveBeenCalledWith(entry.dcpParamsAssetUrl)
    expect(applyService).toHaveBeenCalledTimes(1)
    const [serviceInput] = applyService.mock.calls[0]
    expect(serviceInput.profileId).toBe(entry.id)
    expect(serviceInput.dcpParams).toBe(dcp)
    expect(serviceInput.whiteNeutral).toEqual([0.5, 1, 0.6])
    expect(outcome).toEqual({ applied: true, alpha: 0 })
    expect(result.current.selectedCameraProfileId).toBe(entry.id)
  })

  it('treats a sidecar-less entry as unsupported but still drives the service for telemetry', async () => {
    const runtimeSessionRef = makeRuntimeSessionRef()
    const entry = makeEntry({ dcpParamsAssetUrl: null })
    const fetchDcpParams = vi.fn()
    const applyService = vi
      .fn()
      .mockResolvedValue({ applied: false, reason: 'unsupported' })

    const { result } = renderHook(() =>
      useRawCalibrationStage({
        sessionId: 'session-1',
        runtimeSessionRef,
        getAvailableProfiles: () => [entry],
        getWhiteNeutral: () => [0.5, 1, 0.6],
        fetchDcpParams,
        applyService,
      }),
    )

    let outcome: unknown
    await act(async () => {
      outcome = await result.current.selectCameraProfile(entry.id)
    })

    expect(fetchDcpParams).not.toHaveBeenCalled()
    expect(applyService).toHaveBeenCalledTimes(1)
    const [serviceInput] = applyService.mock.calls[0]
    expect(serviceInput.dcpParams).toBe(null)
    expect(outcome).toEqual({ applied: false, reason: 'unsupported' })
  })

  it('skips the service when no runtime session is warm yet', async () => {
    const runtimeSessionRef: MutableRefObject<RawRuntimeSession | null> = {
      current: null,
    }
    const entry = makeEntry()
    const fetchDcpParams = vi.fn()
    const applyService = vi.fn()

    const { result } = renderHook(() =>
      useRawCalibrationStage({
        sessionId: 'session-1',
        runtimeSessionRef,
        getAvailableProfiles: () => [entry],
        getWhiteNeutral: () => [0.5, 1, 0.6],
        fetchDcpParams,
        applyService,
      }),
    )

    let outcome: unknown
    await act(async () => {
      outcome = await result.current.selectCameraProfile(entry.id)
    })

    expect(fetchDcpParams).not.toHaveBeenCalled()
    expect(applyService).not.toHaveBeenCalled()
    expect(outcome).toEqual({ applied: false, reason: 'skipped' })
    // Selection state still updates so the UI reflects the click.
    expect(result.current.selectedCameraProfileId).toBe(entry.id)
  })

  it('skips the service when whiteNeutral is unavailable', async () => {
    const runtimeSessionRef = makeRuntimeSessionRef()
    const entry = makeEntry()
    const fetchDcpParams = vi.fn().mockResolvedValue(makeDcpParams())
    const applyService = vi.fn()

    const { result } = renderHook(() =>
      useRawCalibrationStage({
        sessionId: 'session-1',
        runtimeSessionRef,
        getAvailableProfiles: () => [entry],
        getWhiteNeutral: () => null,
        fetchDcpParams,
        applyService,
      }),
    )

    let outcome: unknown
    await act(async () => {
      outcome = await result.current.selectCameraProfile(entry.id)
    })

    expect(fetchDcpParams).not.toHaveBeenCalled()
    expect(applyService).not.toHaveBeenCalled()
    expect(outcome).toEqual({ applied: false, reason: 'skipped' })
  })

  it('treats a network failure as silent-unsupported without throwing', async () => {
    const runtimeSessionRef = makeRuntimeSessionRef()
    const entry = makeEntry()
    const fetchDcpParams = vi.fn().mockRejectedValue(new Error('offline'))
    const applyService = vi
      .fn()
      .mockResolvedValue({ applied: false, reason: 'unsupported' })

    const { result } = renderHook(() =>
      useRawCalibrationStage({
        sessionId: 'session-1',
        runtimeSessionRef,
        getAvailableProfiles: () => [entry],
        getWhiteNeutral: () => [0.5, 1, 0.6],
        fetchDcpParams,
        applyService,
      }),
    )

    let outcome: unknown
    await act(async () => {
      outcome = await result.current.selectCameraProfile(entry.id)
    })

    expect(applyService).toHaveBeenCalledTimes(1)
    const [serviceInput] = applyService.mock.calls[0]
    expect(serviceInput.dcpParams).toBe(null)
    expect(outcome).toEqual({ applied: false, reason: 'unsupported' })
  })

  it('uses the cache when one is provided', async () => {
    const runtimeSessionRef = makeRuntimeSessionRef()
    const entry = makeEntry()
    const cachedDcp = makeDcpParams()
    const fetchDcpParams = vi.fn()
    const applyService = vi.fn().mockResolvedValue({ applied: true, alpha: 0 })

    const { result } = renderHook(() =>
      useRawCalibrationStage({
        sessionId: 'session-1',
        runtimeSessionRef,
        getAvailableProfiles: () => [entry],
        getWhiteNeutral: () => [0.5, 1, 0.6],
        fetchDcpParams,
        applyService,
        getCachedDcpParams: () => cachedDcp,
      }),
    )

    await act(async () => {
      await result.current.selectCameraProfile(entry.id)
    })

    expect(fetchDcpParams).not.toHaveBeenCalled()
    expect(applyService).toHaveBeenCalledTimes(1)
    expect(applyService.mock.calls[0][0].dcpParams).toBe(cachedDcp)
  })
})
