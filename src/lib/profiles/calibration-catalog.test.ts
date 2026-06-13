import { describe, expect, it } from 'vitest'

import {
  decodeToneCurveLut,
  parseCalibrationCatalog,
} from './calibration-catalog'

const dcpSha = '0'.repeat(64)
const paramsSha = '1'.repeat(64)

function cameraProfileWithDcpParams() {
  return {
    id: 'org.lumaforge.camera.sample-with-params',
    kind: 'camera-profile',
    format: 'dcp',
    version: '1.0.0',
    title: 'Sample With Params',
    license: 'CC0-1.0',
    redistributionAllowed: true,
    targets: {
      cameraMakers: ['Sony'],
      cameraModels: ['Sony ILCE-7RM5'],
    },
    primaryAsset: {
      role: 'dcp',
      mediaType: 'application/x-adobe-dng-camera-profile',
      size: 120692,
      sha256: dcpSha,
      url: `https://luma-prof.example.com/blobs/sha256/00/00/${dcpSha}.dcp`,
    },
    assets: [
      {
        role: 'dcp-params',
        mediaType: 'application/json',
        size: 4096,
        sha256: paramsSha,
        url: `https://luma-prof.example.com/blobs/sha256/11/11/${paramsSha}.params.json`,
      },
    ],
    entryUrl:
      'https://luma-prof.example.com/releases/v2026.06.10/entries/sample-with-params.json',
  }
}

function cameraProfileWithoutDcpParams() {
  return {
    id: 'org.lumaforge.camera.sample-without-params',
    kind: 'camera-profile',
    format: 'dcp',
    version: '1.0.0',
    title: 'Sample Without Params',
    license: 'CC0-1.0',
    redistributionAllowed: true,
    targets: {
      cameraMakers: ['Apple'],
      cameraModels: ['Apple iPad13,1 back camera'],
    },
    primaryAsset: {
      role: 'dcp',
      mediaType: 'application/x-adobe-dng-camera-profile',
      size: 120698,
      sha256: '2'.repeat(64),
      url: 'https://luma-prof.example.com/blobs/sha256/22/22/sample.dcp',
    },
    entryUrl:
      'https://luma-prof.example.com/releases/v2026.06.10/entries/sample-without-params.json',
  }
}

describe('parseCalibrationCatalog', () => {
  it('parses camera-profile entries with and without dcp-params', () => {
    const result = parseCalibrationCatalog({
      schemaVersion: 1,
      entries: [cameraProfileWithDcpParams(), cameraProfileWithoutDcpParams()],
    })

    expect(result.issues).toEqual([])
    expect(result.entries).toHaveLength(2)

    const [withParams, withoutParams] = result.entries

    expect(withParams).toEqual({
      id: 'org.lumaforge.camera.sample-with-params',
      kind: 'camera-profile',
      title: 'Sample With Params',
      version: '1.0.0',
      dcpParamsAssetUrl: `https://luma-prof.example.com/blobs/sha256/11/11/${paramsSha}.params.json`,
      dcpAssetUrl: `https://luma-prof.example.com/blobs/sha256/00/00/${dcpSha}.dcp`,
      targets: {
        cameraMakers: ['Sony'],
        cameraModels: ['Sony ILCE-7RM5'],
      },
    })

    // Missing dcp-params is a silent "unsupported on this client" state, not
    // an error — the entry stays in the list with a null asset url.
    expect(withoutParams.dcpParamsAssetUrl).toBeNull()
    expect(withoutParams.dcpAssetUrl).toMatch(/^https:\/\//u)
  })

  it('ignores LUT entries because they belong to the LUT catalog parser', () => {
    const result = parseCalibrationCatalog({
      schemaVersion: 1,
      entries: [
        cameraProfileWithDcpParams(),
        {
          id: 'kodak-2383-rec709',
          kind: 'lut',
          format: 'cube',
          version: '1.0.0',
          title: 'Kodak 2383 Rec.709',
          license: 'NOASSERTION',
          redistributionAllowed: true,
          primaryAsset: {
            role: 'cube-lut',
            mediaType: 'application/x-cube-lut',
            size: 12,
            sha256: 'a'.repeat(64),
            url: 'https://luma-prof.example.com/blobs/lut.cube',
          },
          entryUrl:
            'https://luma-prof.example.com/releases/v2026.06.10/entries/lut.json',
        },
      ],
    })

    expect(result.issues).toEqual([])
    expect(result.entries.map((entry) => entry.kind)).toEqual([
      'camera-profile',
    ])
  })

  it('rejects documents with the wrong schemaVersion as invalid-catalog', () => {
    const result = parseCalibrationCatalog({
      schemaVersion: 2,
      entries: [cameraProfileWithDcpParams()],
    })

    expect(result.entries).toEqual([])
    expect(result.issues).toMatchObject([{ code: 'invalid-catalog' }])
  })

  it('rejects documents whose entries are not an array', () => {
    expect(
      parseCalibrationCatalog({ schemaVersion: 1, entries: {} }),
    ).toMatchObject({
      entries: [],
      issues: [{ code: 'invalid-catalog' }],
    })
  })

  it('reports missing required entry fields with invalid-entry', () => {
    const result = parseCalibrationCatalog({
      schemaVersion: 1,
      entries: [
        {
          // missing id, version
          kind: 'camera-profile',
          title: 'Anonymous',
        },
      ],
    })

    expect(result.entries).toEqual([])
    expect(result.issues).toMatchObject([{ code: 'invalid-entry' }])
  })

  it('reports unsupported calibration kinds with unsupported-entry', () => {
    const result = parseCalibrationCatalog({
      schemaVersion: 1,
      entries: [
        {
          id: 'lens-correction',
          kind: 'lens-correction-profile',
          title: 'Lens Correction',
          version: '1.0.0',
        },
      ],
    })

    expect(result.entries).toEqual([])
    expect(result.issues).toMatchObject([
      { code: 'unsupported-entry', entryId: 'lens-correction' },
    ])
  })

  it('drops dcp-params asset URLs that are not runtime URLs', () => {
    const entry = cameraProfileWithDcpParams()
    entry.assets[0].url = 'ftp://luma-prof.example.com/sample.params.json'

    const result = parseCalibrationCatalog({
      schemaVersion: 1,
      entries: [entry],
    })

    expect(result.issues).toEqual([])
    expect(result.entries[0].dcpParamsAssetUrl).toBeNull()
  })
})

describe('decodeToneCurveLut', () => {
  // Float32Array([0, 0.25, 0.5, 0.75, 1.0]) encoded as base64 little-endian.
  const ENCODED = 'AAAAAAAAgD4AAAA/AABAPwAAgD8='
  const DECODED = [0, 0.25, 0.5, 0.75, 1.0]

  it('round-trips a known base64 little-endian Float32 payload', () => {
    const lut = decodeToneCurveLut({
      encoding: 'cubic-spline-baked-1d-lut',
      size: 5,
      values: ENCODED,
    })

    expect(lut).toBeInstanceOf(Float32Array)
    expect(lut).toHaveLength(5)
    expect(Array.from(lut)).toEqual(DECODED)
  })

  it('honours the declared size even if the payload is longer', () => {
    const lut = decodeToneCurveLut({
      encoding: 'cubic-spline-baked-1d-lut',
      size: 3,
      values: ENCODED,
    })

    expect(Array.from(lut)).toEqual([0, 0.25, 0.5])
  })

  it('throws when the payload is truncated relative to size', () => {
    expect(() =>
      decodeToneCurveLut({
        encoding: 'cubic-spline-baked-1d-lut',
        size: 10,
        values: ENCODED,
      }),
    ).toThrow(/truncated/u)
  })

  it('throws on unsupported encodings', () => {
    expect(() =>
      decodeToneCurveLut({
        // Intentionally widen to test the runtime guard regardless of the
        // compile-time literal type.
        encoding: 'piecewise-linear' as unknown as 'cubic-spline-baked-1d-lut',
        size: 5,
        values: ENCODED,
      }),
    ).toThrow(/encoding/u)
  })

  it('throws on non-positive size', () => {
    expect(() =>
      decodeToneCurveLut({
        encoding: 'cubic-spline-baked-1d-lut',
        size: 0,
        values: ENCODED,
      }),
    ).toThrow(/size/u)
  })
})
