import { describe, expect, it } from 'vitest'

import type { LumaRawNativeFactory } from './native-types'
import { createRuntimeCore } from './runtime-core'

const makeNativeFactory = (): LumaRawNativeFactory => ({
  createProcessor() {
    let openCount = 0

    return {
      openBuffer(data) {
        openCount += 1
        if (data.byteLength === 0) {
          throw new Error('empty input')
        }
      },
      readMetadata() {
        return {
          width: 4000,
          height: 3000,
          rawWidth: 4024,
          rawHeight: 3024,
          make: 'Sony',
          model: `A7-${openCount}`,
          iso: 200,
          orientation: 1,
          thumbnail: {
            width: 1600,
            height: 1067,
            format: 'jpeg',
          },
          blackLevel: 512,
          whiteLevel: 16383,
        }
      },
      extractThumbnail() {
        return {
          data: new Uint8Array([1, 2, 3, 4]),
          width: 1600,
          height: 1067,
          format: 'jpeg',
        }
      },
      decodePreview() {
        return {
          data: new Uint16Array([0, 32768, 65535]),
          width: 1,
          height: 1,
          bits: 16,
        }
      },
      decodeHq() {
        return {
          data: new Uint16Array([65535, 32768, 0]),
          width: 1,
          height: 1,
          bits: 16,
        }
      },
      dispose() {},
    }
  },
})

describe('runtime-core', () => {
  it('returns probe metadata without maker-note bulk', async () => {
    const core = createRuntimeCore(makeNativeFactory())

    const response = await core.handleRequest({
      id: 'job-1',
      type: 'probe',
      payload: {
        fileBuffer: new ArrayBuffer(4),
        fileName: 'sample.ARW',
        fileSize: 4,
      },
    })

    expect(response).toMatchObject({
      ok: true,
      type: 'probe',
      payload: {
        width: 4000,
        height: 3000,
        make: 'Sony',
        supportLevel: 'experimental',
      },
    })
  })

  it('returns embedded JPEG preview bytes', async () => {
    const core = createRuntimeCore(makeNativeFactory())

    const response = await core.handleRequest({
      id: 'job-2',
      type: 'extractEmbeddedPreview',
      payload: {
        fileBuffer: new ArrayBuffer(4),
        fileName: 'sample.ARW',
        fileSize: 4,
      },
    })

    expect(response).toMatchObject({
      ok: true,
      type: 'extractEmbeddedPreview',
      payload: {
        width: 1600,
        height: 1067,
        mimeType: 'image/jpeg',
        colorSpace: 'display-srgb-preview',
      },
    })
  })

  it('returns quick and HQ RGB16 Linear ProPhoto frames', async () => {
    const core = createRuntimeCore(makeNativeFactory())

    const quick = await core.handleRequest({
      id: 'job-3',
      type: 'decodeQuick',
      payload: {
        fileBuffer: new ArrayBuffer(4),
        fileName: 'sample.ARW',
        fileSize: 4,
      },
    })
    const hq = await core.handleRequest({
      id: 'job-4',
      type: 'decodeHq',
      payload: {
        fileBuffer: new ArrayBuffer(4),
        fileName: 'sample.ARW',
        fileSize: 4,
      },
    })

    expect(quick).toMatchObject({
      ok: true,
      payload: {
        source: 'quick',
        layout: 'rgb',
        bitDepth: 16,
        colorSpace: 'linear-prophoto-rgb',
      },
    })
    expect(hq).toMatchObject({
      ok: true,
      payload: {
        source: 'hq',
        layout: 'rgb',
        bitDepth: 16,
        colorSpace: 'linear-prophoto-rgb',
      },
    })
  })

  it('reopens each file with fresh per-image native state', async () => {
    const core = createRuntimeCore(makeNativeFactory())

    const first = await core.handleRequest({
      id: 'job-5',
      type: 'probe',
      payload: {
        fileBuffer: new ArrayBuffer(4),
        fileName: 'first.ARW',
        fileSize: 4,
      },
    })
    const second = await core.handleRequest({
      id: 'job-6',
      type: 'probe',
      payload: {
        fileBuffer: new ArrayBuffer(4),
        fileName: 'second.ARW',
        fileSize: 4,
      },
    })

    expect(first.ok && first.type === 'probe' && first.payload.model).toBe(
      'A7-1',
    )
    expect(second.ok && second.type === 'probe' && second.payload.model).toBe(
      'A7-1',
    )
  })
})
