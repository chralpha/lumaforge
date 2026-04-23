import { describe, expect, it } from 'vitest'

import { LumaRawRuntimeError } from '../src/errors'
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
        return {
          copyToWasm: 0,
          librawOpen: 0,
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

  it('clones embedded preview subarrays into tight owned buffers', async () => {
    const source = new Uint8Array([9, 8, 1, 2, 3, 4, 7, 6]).subarray(2, 6)
    const core = createRuntimeCore({
      createProcessor() {
        const processor = makeNativeFactory().createProcessor()
        return {
          ...processor,
          extractThumbnail() {
            return {
              data: source,
              width: 2,
              height: 2,
              format: 'jpeg',
            }
          },
        }
      },
    })

    const response = await core.handleRequest({
      id: 'job-preview-subarray',
      type: 'extractEmbeddedPreview',
      payload: {
        fileBuffer: new ArrayBuffer(4),
        fileName: 'sample.ARW',
        fileSize: 4,
      },
    })

    expect(response.ok && response.type === 'extractEmbeddedPreview').toBe(true)
    if (!response.ok || response.type !== 'extractEmbeddedPreview') return

    expect(response.payload?.data).toEqual(new Uint8Array([1, 2, 3, 4]))
    expect(response.payload?.data).not.toBe(source)
    expect(response.payload?.data.byteOffset).toBe(0)
    expect(response.payload?.data.buffer.byteLength).toBe(4)
  })

  it('keeps bitmap embedded preview bytes as octet-stream', async () => {
    const core = createRuntimeCore({
      createProcessor() {
        const processor = makeNativeFactory().createProcessor()
        return {
          ...processor,
          extractThumbnail() {
            return {
              data: new Uint8Array([255, 0, 128, 255]),
              width: 1,
              height: 1,
              format: 'bitmap',
            }
          },
        }
      },
    })

    const response = await core.handleRequest({
      id: 'job-bitmap-preview',
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
        mimeType: 'application/octet-stream',
      },
    })
  })

  it('does not infer PNG MIME from bytes without an encoded native format', async () => {
    const core = createRuntimeCore({
      createProcessor() {
        const processor = makeNativeFactory().createProcessor()
        return {
          ...processor,
          extractThumbnail() {
            return {
              data: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
              width: 1,
              height: 1,
              format: 'unknown',
            }
          },
        }
      },
    })

    const response = await core.handleRequest({
      id: 'job-unknown-preview',
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
        mimeType: 'application/octet-stream',
      },
    })
  })

  it('returns null when embedded thumbnail is unavailable', async () => {
    const core = createRuntimeCore({
      createProcessor() {
        const processor = makeNativeFactory().createProcessor()
        return {
          ...processor,
          extractThumbnail: () => undefined,
        }
      },
    })

    const response = await core.handleRequest({
      id: 'job-no-thumb',
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
      payload: null,
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

  it('reports copyToWasm and librawOpen timings separately when native provides them', async () => {
    const core = createRuntimeCore({
      createProcessor() {
        const processor = makeNativeFactory().createProcessor()

        return {
          ...processor,
          openBuffer(data, settings) {
            processor.openBuffer(data, settings)
            return {
              copyToWasm: 7,
              librawOpen: 11,
            }
          },
        }
      },
    })

    const response = await core.handleRequest({
      id: 'job-open-timings',
      type: 'decodeQuick',
      payload: {
        fileBuffer: new ArrayBuffer(4),
        fileName: 'sample.ARW',
        fileSize: 4,
      },
    })

    expect(response.ok && response.type === 'decodeQuick').toBe(true)
    if (!response.ok || response.type !== 'decodeQuick') return

    expect(response.payload.timings.copyToWasm).toBe(7)
    expect(response.payload.timings.librawOpen).toBe(11)
    expect(response.payload.timings.openBuffer).toBe(18)
  })

  it('clones decoded frame subarrays into tight owned buffers', async () => {
    const source = new Uint16Array([9, 8, 0, 32768, 65535, 7]).subarray(2, 5)
    const core = createRuntimeCore({
      createProcessor() {
        const processor = makeNativeFactory().createProcessor()
        return {
          ...processor,
          decodePreview() {
            return {
              data: source,
              width: 1,
              height: 1,
              bits: 16,
            }
          },
        }
      },
    })

    const response = await core.handleRequest({
      id: 'job-frame-subarray',
      type: 'decodeQuick',
      payload: {
        fileBuffer: new ArrayBuffer(4),
        fileName: 'sample.ARW',
        fileSize: 4,
      },
    })

    expect(response.ok && response.type === 'decodeQuick').toBe(true)
    if (!response.ok || response.type !== 'decodeQuick') return

    expect(response.payload.data).toEqual(new Uint16Array([0, 32768, 65535]))
    expect(response.payload.data).not.toBe(source)
    expect(response.payload.data.byteOffset).toBe(0)
    expect(response.payload.data.buffer.byteLength).toBe(6)
  })

  it('opens quick and HQ decodes with native RGB16 ProPhoto settings', async () => {
    const openSettings: unknown[] = []
    const core = createRuntimeCore({
      createProcessor() {
        const processor = makeNativeFactory().createProcessor()
        return {
          ...processor,
          openBuffer(data, settings) {
            openSettings.push(settings)
            return processor.openBuffer(data, settings)
          },
        }
      },
    })

    await core.handleRequest({
      id: 'job-settings-quick',
      type: 'decodeQuick',
      payload: {
        fileBuffer: new ArrayBuffer(4),
        fileName: 'sample.ARW',
        fileSize: 4,
      },
    })
    await core.handleRequest({
      id: 'job-settings-hq',
      type: 'decodeHq',
      payload: {
        fileBuffer: new ArrayBuffer(4),
        fileName: 'sample.ARW',
        fileSize: 4,
      },
    })

    expect(openSettings).toEqual([
      {
        halfSize: true,
        useCameraWb: true,
        outputColor: 4,
        outputBps: 16,
        noAutoBright: true,
        userQual: 0,
        gamm: [1, 1, 1, 1, 0, 0],
      },
      {
        halfSize: false,
        useCameraWb: true,
        outputColor: 4,
        outputBps: 16,
        noAutoBright: true,
        userQual: 2,
        gamm: [1, 1, 1, 1, 0, 0],
      },
    ])
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

  it('preserves primary native failure when dispose also fails', async () => {
    const core = createRuntimeCore({
      createProcessor() {
        const processor = makeNativeFactory().createProcessor()
        return {
          ...processor,
          readMetadata() {
            throw new LumaRawRuntimeError(
              'RAW_METADATA_FAILED',
              'metadata failed',
            )
          },
          dispose() {
            throw new LumaRawRuntimeError(
              'RAW_RUNTIME_UNAVAILABLE',
              'dispose failed',
            )
          },
        }
      },
    })

    const response = await core.handleRequest({
      id: 'job-primary-failure',
      type: 'probe',
      payload: {
        fileBuffer: new ArrayBuffer(4),
        fileName: 'sample.ARW',
        fileSize: 4,
      },
    })

    expect(response).toMatchObject({
      ok: false,
      type: 'probe',
      error: {
        code: 'RAW_METADATA_FAILED',
        message: 'metadata failed',
      },
    })
  })

  it('acknowledges cancellation and avoids returning data for pre-cancelled jobs', async () => {
    let openCount = 0
    const core = createRuntimeCore({
      createProcessor() {
        const processor = makeNativeFactory().createProcessor()
        return {
          ...processor,
          openBuffer(data, settings) {
            openCount += 1
            return processor.openBuffer(data, settings)
          },
        }
      },
    })

    const cancel = await core.handleRequest({
      id: 'job-cancel-request',
      type: 'cancel',
      payload: {
        targetJobId: 'job-cancelled',
      },
    })
    const cancelled = await core.handleRequest({
      id: 'job-cancelled',
      type: 'decodeQuick',
      payload: {
        fileBuffer: new ArrayBuffer(4),
        fileName: 'sample.ARW',
        fileSize: 4,
      },
    })

    expect(cancel).toMatchObject({
      ok: true,
      type: 'cancel',
      payload: { cancelled: true },
    })
    expect(cancelled).toMatchObject({
      ok: false,
      type: 'decodeQuick',
      error: {
        code: 'RAW_JOB_CANCELLED',
      },
    })
    expect(openCount).toBe(0)
  })

  it('bounds best-effort cancellation tracking', async () => {
    const core = createRuntimeCore(makeNativeFactory())

    for (let index = 0; index < 129; index += 1) {
      await core.handleRequest({
        id: `cancel-${index}`,
        type: 'cancel',
        payload: {
          targetJobId: `cancelled-${index}`,
        },
      })
    }

    const evicted = await core.handleRequest({
      id: 'cancelled-0',
      type: 'probe',
      payload: {
        fileBuffer: new ArrayBuffer(4),
        fileName: 'evicted.ARW',
        fileSize: 4,
      },
    })
    const retained = await core.handleRequest({
      id: 'cancelled-128',
      type: 'probe',
      payload: {
        fileBuffer: new ArrayBuffer(4),
        fileName: 'retained.ARW',
        fileSize: 4,
      },
    })

    expect(evicted).toMatchObject({
      ok: true,
      type: 'probe',
    })
    expect(retained).toMatchObject({
      ok: false,
      type: 'probe',
      error: {
        code: 'RAW_JOB_CANCELLED',
      },
    })
  })
})
