import { describe, expect, it } from 'vitest'

import { parseReleaseCatalog, parseReleaseEntry } from './catalog'

const sha256 =
  '9c56cc51b374c3ba189210d5b6d4bf57790d351c96c47c02190ecf1e430635ab'

const primaryAsset = {
  role: 'cube-lut',
  mediaType: 'application/x-cube-lut',
  size: 12,
  sha256,
  url: `https://profiles.example.com/blobs/sha256/9c/56/${sha256}.cube`,
}

const previewAsset = {
  role: 'preview-image',
  mediaType: 'image/webp',
  size: 4096,
  url: 'https://profiles.example.com/previews/kodak-2383-rec709.webp',
  width: 320,
  height: 180,
}

const entryManifest = {
  schemaVersion: 1,
  id: 'kodak-2383-rec709',
  kind: 'lut',
  format: 'cube',
  version: '1.0.0',
  title: 'Kodak 2383 Rec.709',
  description: null,
  license: 'NOASSERTION',
  author: 'Unknown',
  source: 'Unknown',
  sourceUrl: null,
  redistributionAllowed: true,
  targets: {},
  manifestPath: 'profiles/kodak-2383-rec709/manifest.json',
  entryUrl:
    'https://profiles.example.com/releases/v2026.05.01/entries/kodak-2383-rec709.json',
  primaryAsset,
  assets: [],
  createdAt: '2026-04-30T00:00:00.000Z',
  updatedAt: '2026-04-30T00:00:00.000Z',
  lut: {
    intent: 'combined-look-output',
    input: { gamut: 'arri-wide-gamut-3', transfer: 'logc3', range: 'full' },
    output: { gamut: 'rec709', transfer: 'gamma24', range: 'legal' },
  },
  tags: ['film-print'],
}

describe('online LUT release catalog parsing', () => {
  it('accepts release catalog entries that point at redistributable CUBE LUT entries', () => {
    const result = parseReleaseCatalog(
      {
        schemaVersion: 1,
        entries: [
          {
            id: entryManifest.id,
            kind: 'lut',
            version: entryManifest.version,
            title: entryManifest.title,
            license: entryManifest.license,
            redistributionAllowed: true,
            primaryAsset,
            entryUrl: entryManifest.entryUrl,
          },
        ],
      },
      'https://profiles.example.com/releases/v2026.05.01/catalog.json',
    )

    expect(result).toEqual({
      ok: true,
      value: [
        {
          id: 'kodak-2383-rec709',
          title: 'Kodak 2383 Rec.709',
          sourceUrl:
            'https://profiles.example.com/releases/v2026.05.01/entries/kodak-2383-rec709.json',
          sourceType: 'catalog-entry',
          cube: {
            url: primaryAsset.url,
            sha256,
            bytes: 12,
            title: 'Kodak 2383 Rec.709',
          },
          tags: [],
        },
      ],
    })
  })

  it('parses a safe preview image asset from catalog rows', () => {
    const result = parseReleaseCatalog(
      {
        schemaVersion: 1,
        entries: [
          {
            id: entryManifest.id,
            kind: 'lut',
            version: entryManifest.version,
            title: entryManifest.title,
            license: entryManifest.license,
            redistributionAllowed: true,
            primaryAsset,
            previewAsset,
            entryUrl: entryManifest.entryUrl,
          },
        ],
      },
      'https://profiles.example.com/releases/v2026.05.01/catalog.json',
    )

    expect(result).toMatchObject({
      ok: true,
      value: [
        {
          id: 'kodak-2383-rec709',
          preview: {
            url: previewAsset.url,
            mediaType: 'image/webp',
            bytes: 4096,
            width: 320,
            height: 180,
            title: 'Kodak 2383 Rec.709',
          },
        },
      ],
    })
  })

  it('parses the family field from catalog entries', () => {
    const result = parseReleaseCatalog(
      {
        schemaVersion: 1,
        entries: [
          {
            id: entryManifest.id,
            kind: 'lut',
            version: entryManifest.version,
            title: entryManifest.title,
            license: entryManifest.license,
            redistributionAllowed: true,
            primaryAsset,
            entryUrl: entryManifest.entryUrl,
            family: 'Kodak Vision3',
          },
        ],
      },
      'https://profiles.example.com/releases/v2026.05.01/catalog.json',
    )

    expect(result).toEqual({
      ok: true,
      value: [
        {
          id: 'kodak-2383-rec709',
          title: 'Kodak 2383 Rec.709',
          sourceUrl:
            'https://profiles.example.com/releases/v2026.05.01/entries/kodak-2383-rec709.json',
          sourceType: 'catalog-entry',
          cube: {
            url: primaryAsset.url,
            sha256,
            bytes: 12,
            title: 'Kodak 2383 Rec.709',
          },
          tags: [],
          family: 'Kodak Vision3',
        },
      ],
    })
  })

  it('rejects release catalog entries with relative entry URLs', () => {
    const result = parseReleaseCatalog(
      {
        schemaVersion: 1,
        entries: [
          {
            id: entryManifest.id,
            kind: 'lut',
            version: entryManifest.version,
            title: entryManifest.title,
            license: entryManifest.license,
            redistributionAllowed: true,
            primaryAsset,
            entryUrl: 'entries/kodak-2383-rec709.json',
          },
        ],
      },
      'https://profiles.example.com/releases/v2026.05.01/catalog.json',
    )

    expect(result).toMatchObject({
      ok: false,
      issues: [{ code: 'invalid-url', entryId: 'kodak-2383-rec709' }],
    })
  })

  it('returns compatible LUT entries from mixed release catalogs', () => {
    const result = parseReleaseCatalog(
      {
        schemaVersion: 1,
        entries: [
          {
            id: entryManifest.id,
            kind: 'lut',
            version: entryManifest.version,
            title: entryManifest.title,
            license: entryManifest.license,
            redistributionAllowed: true,
            primaryAsset,
            entryUrl: entryManifest.entryUrl,
          },
          {
            id: 'camera-profile',
            kind: 'camera-profile',
            version: '1.0.0',
            title: 'Camera Profile',
            license: 'NOASSERTION',
            redistributionAllowed: true,
            primaryAsset: {
              role: 'dcp-profile',
              mediaType: 'application/octet-stream',
              size: 12,
              sha256,
              url: 'https://profiles.example.com/camera.dcp',
            },
            entryUrl:
              'https://profiles.example.com/releases/v2026.05.01/entries/camera-profile.json',
          },
        ],
      },
      'https://profiles.example.com/releases/v2026.05.01/catalog.json',
    )

    expect(result).toMatchObject({
      ok: true,
      value: [
        {
          id: 'kodak-2383-rec709',
          title: 'Kodak 2383 Rec.709',
        },
      ],
    })
  })

  it('returns unsupported-entry issues when every catalog entry is non-LUT', () => {
    const result = parseReleaseCatalog(
      {
        schemaVersion: 1,
        entries: [
          {
            id: 'camera-profile',
            kind: 'camera-profile',
            version: '1.0.0',
            title: 'Camera Profile',
            license: 'NOASSERTION',
            redistributionAllowed: true,
            primaryAsset: {
              role: 'dcp-profile',
              mediaType: 'application/octet-stream',
              size: 12,
              sha256,
              url: 'https://profiles.example.com/camera.dcp',
            },
            entryUrl:
              'https://profiles.example.com/releases/v2026.05.01/entries/camera-profile.json',
          },
        ],
      },
      'https://profiles.example.com/releases/v2026.05.01/catalog.json',
    )

    expect(result).toMatchObject({
      ok: false,
      issues: [{ code: 'unsupported-entry', entryId: 'camera-profile' }],
    })
  })

  it('returns unsupported-entry issues when every LUT entry is non-redistributable', () => {
    const result = parseReleaseCatalog(
      {
        schemaVersion: 1,
        entries: [
          {
            id: entryManifest.id,
            kind: 'lut',
            version: entryManifest.version,
            title: entryManifest.title,
            license: entryManifest.license,
            redistributionAllowed: false,
            primaryAsset,
            entryUrl: entryManifest.entryUrl,
          },
        ],
      },
      'https://profiles.example.com/releases/v2026.05.01/catalog.json',
    )

    expect(result).toMatchObject({
      ok: false,
      issues: [{ code: 'unsupported-entry', entryId: 'kodak-2383-rec709' }],
    })
  })

  it('preserves asset validation issues when every candidate LUT is malformed', () => {
    const result = parseReleaseCatalog(
      {
        schemaVersion: 1,
        entries: [
          {
            id: entryManifest.id,
            kind: 'lut',
            version: entryManifest.version,
            title: entryManifest.title,
            license: entryManifest.license,
            redistributionAllowed: true,
            primaryAsset: {
              role: 'thumbnail',
              mediaType: 'image/png',
              size: 0,
              url: 'ftp://profiles.example.com/not-a-cube.png',
            },
            entryUrl: entryManifest.entryUrl,
          },
        ],
      },
      'https://profiles.example.com/releases/v2026.05.01/catalog.json',
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'missing-sha256',
            entryId: 'kodak-2383-rec709',
          }),
          expect.objectContaining({
            code: 'invalid-url',
            entryId: 'kodak-2383-rec709',
          }),
          expect.objectContaining({
            code: 'unsupported-asset',
            entryId: 'kodak-2383-rec709',
          }),
        ]),
      )
    }
  })
})

describe('online LUT release entry parsing', () => {
  it('accepts a release entry primaryAsset and maps its trusted contract', () => {
    const result = parseReleaseEntry(
      {
        ...entryManifest,
        previewAsset,
      },
      'https://profiles.example.com/releases/v2026.05.01/entries/kodak-2383-rec709.json',
    )

    expect(result).toEqual({
      ok: true,
      value: {
        id: 'kodak-2383-rec709',
        title: 'Kodak 2383 Rec.709',
        sourceUrl:
          'https://profiles.example.com/releases/v2026.05.01/entries/kodak-2383-rec709.json',
        sourceType: 'catalog-entry',
        cube: {
          url: primaryAsset.url,
          sha256,
          bytes: 12,
          title: 'Kodak 2383 Rec.709',
        },
        preview: {
          url: previewAsset.url,
          mediaType: 'image/webp',
          bytes: 4096,
          width: 320,
          height: 180,
          title: 'Kodak 2383 Rec.709',
        },
        trustedContract: {
          inputProfile: 'arri-awg3-logc3',
          role: 'combined-look-output',
          inputGamut: 'arri-wide-gamut-3',
          inputTransfer: 'logc3',
          inputRange: 'full',
          outputGamut: 'srgb-rec709',
          outputTransfer: 'gamma24',
          outputRange: 'legal',
        },
        tags: ['film-print'],
      },
    })
  })

  it('prefers release-compatible primaryAsset over fallback assets', () => {
    const result = parseReleaseEntry(
      {
        ...entryManifest,
        primaryAsset,
        assets: [
          {
            role: 'cube-lut',
            mediaType: 'application/x-cube-lut',
            size: 13,
            sha256:
              'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            url: 'https://profiles.example.com/fallback.cube',
          },
        ],
      },
      entryManifest.entryUrl,
    )

    expect(result).toMatchObject({
      ok: true,
      value: {
        cube: {
          url: primaryAsset.url,
          sha256,
          bytes: 12,
        },
      },
    })
  })

  it('uses assets only as fallback for non-release-compatible fixtures', () => {
    const result = parseReleaseEntry(
      {
        ...entryManifest,
        primaryAsset: undefined,
        assets: [primaryAsset],
      },
      entryManifest.entryUrl,
    )

    expect(result).toMatchObject({
      ok: true,
      value: {
        cube: {
          url: primaryAsset.url,
          sha256,
          bytes: 12,
        },
      },
    })
  })

  it('rejects missing sha256 with a typed issue', () => {
    const result = parseReleaseEntry(
      {
        ...entryManifest,
        primaryAsset: { ...primaryAsset, sha256: undefined },
      },
      entryManifest.entryUrl,
    )

    expect(result).toMatchObject({
      ok: false,
      issues: [{ code: 'missing-sha256', entryId: 'kodak-2383-rec709' }],
    })
  })

  it('rejects unsupported release entry shape with typed issues', () => {
    const result = parseReleaseEntry(
      {
        ...entryManifest,
        redistributionAllowed: false,
        primaryAsset: { ...primaryAsset, role: 'thumbnail' },
      },
      entryManifest.entryUrl,
    )

    expect(result).toMatchObject({
      ok: false,
      issues: [
        { code: 'unsupported-entry', entryId: 'kodak-2383-rec709' },
        { code: 'unsupported-asset', entryId: 'kodak-2383-rec709' },
      ],
    })
  })

  it('rejects missing or unsupported release entry schema versions', () => {
    expect(
      parseReleaseEntry(
        { ...entryManifest, schemaVersion: undefined },
        entryManifest.entryUrl,
      ),
    ).toMatchObject({
      ok: false,
      issues: [{ code: 'invalid-entry', entryId: 'kodak-2383-rec709' }],
    })

    expect(
      parseReleaseEntry(
        { ...entryManifest, schemaVersion: 2 },
        entryManifest.entryUrl,
      ),
    ).toMatchObject({
      ok: false,
      issues: [{ code: 'invalid-entry', entryId: 'kodak-2383-rec709' }],
    })
  })

  it('rejects unsupported release entry formats directly', () => {
    const result = parseReleaseEntry(
      { ...entryManifest, format: 'icc' },
      entryManifest.entryUrl,
    )

    expect(result).toMatchObject({
      ok: false,
      issues: [{ code: 'unsupported-entry', entryId: 'kodak-2383-rec709' }],
    })
  })

  it('rejects invalid primary asset URLs', () => {
    const result = parseReleaseEntry(
      {
        ...entryManifest,
        primaryAsset: {
          ...primaryAsset,
          url: 'ftp://profiles.example.com/lut.cube',
        },
      },
      entryManifest.entryUrl,
    )

    expect(result).toMatchObject({
      ok: false,
      issues: [{ code: 'invalid-url', entryId: 'kodak-2383-rec709' }],
    })
  })
})
