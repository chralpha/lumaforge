import { describe, expect, it } from 'vitest'

import { LumaRawRuntimeError } from '../src/errors'
import type { LumaRawNativeFactory } from './native-types'
import { createRuntimeCore } from './runtime-core'

const makeNativeFactory = (): LumaRawNativeFactory => ({
  createProcessor() {
    let openCount = 0
    let loaded = false

    return {
      loadBuffer(data) {
        if (data.byteLength === 0) {
          throw new Error('empty input')
        }
        loaded = true
        return {
          copyToWasm: 0,
        }
      },
      openWithSettings(_settings) {
        if (!loaded) {
          throw new Error('missing input')
        }
        openCount += 1
        return {
          copyToWasm: 0,
          librawOpen: 0,
        }
      },
      openBuffer(data, settings) {
        this.loadBuffer(data)
        return this.openWithSettings(settings)
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

  it('keeps embedded preview buffers without cloning in runtime-core', async () => {
    const source = new Uint8Array([1, 2, 3, 4])
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

    expect(response.payload?.data).toBe(source)
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

  it('records heap before and after session stages', async () => {
    let heap = 256
    const core = createRuntimeCore({
      createProcessor() {
        return makeNativeFactory().createProcessor()
      },
      heapBytes() {
        heap += 16
        return heap
      },
    })
    const expectHeapGrowth = (stats?: {
      before?: number
      after?: number
      peak?: number
    }) => {
      expect(stats?.before).toBeGreaterThan(0)
      expect(stats?.after).toBeGreaterThan(stats?.before ?? 0)
      expect(stats?.peak).toBe(stats?.after)
    }

    const opened = await core.handleRequest({
      id: 'job-heap-open',
      type: 'openSession',
      payload: {
        fileBuffer: new ArrayBuffer(4),
        fileName: 'sample.ARW',
        fileSize: 4,
      },
    })

    expect(opened.ok && opened.type === 'openSession').toBe(true)
    if (!opened.ok || opened.type !== 'openSession') return
    expectHeapGrowth(opened.payload.heap)

    const sessionId = opened.payload.sessionId
    const embedded = await core.handleRequest({
      id: 'job-heap-embedded',
      type: 'extractEmbeddedPreviewFromSession',
      payload: { sessionId },
    })
    const quick = await core.handleRequest({
      id: 'job-heap-quick',
      type: 'decodeQuickFromSession',
      payload: { sessionId },
    })
    const hq = await core.handleRequest({
      id: 'job-heap-hq',
      type: 'decodeHqFromSession',
      payload: { sessionId },
    })
    await core.handleRequest({
      id: 'job-heap-close',
      type: 'closeSession',
      payload: { sessionId },
    })

    expect(
      embedded.ok && embedded.type === 'extractEmbeddedPreviewFromSession',
    ).toBe(true)
    expect(quick.ok && quick.type === 'decodeQuickFromSession').toBe(true)
    expect(hq.ok && hq.type === 'decodeHqFromSession').toBe(true)
    if (
      !embedded.ok ||
      embedded.type !== 'extractEmbeddedPreviewFromSession' ||
      !quick.ok ||
      quick.type !== 'decodeQuickFromSession' ||
      !hq.ok ||
      hq.type !== 'decodeHqFromSession'
    ) {
      return
    }

    expectHeapGrowth(embedded.payload?.heap)
    expectHeapGrowth(quick.payload.heap)
    expectHeapGrowth(hq.payload.heap)
  })

  it('opens a session once and reuses loaded input across session stages', async () => {
    let loadCount = 0
    let disposeCount = 0
    let heapBytes = 268435456
    const openSettings: unknown[] = []
    const previewOptions: unknown[] = []
    const core = createRuntimeCore({
      createProcessor() {
        const processor = makeNativeFactory().createProcessor()
        return {
          ...processor,
          loadBuffer(data) {
            loadCount += 1
            return processor.loadBuffer(data)
          },
          openWithSettings(settings) {
            openSettings.push(settings)
            return processor.openWithSettings(settings)
          },
          decodePreview(options) {
            previewOptions.push(options)
            return processor.decodePreview(options)
          },
          dispose() {
            disposeCount += 1
            processor.dispose()
          },
        }
      },
      heapBytes() {
        heapBytes += 1024
        return heapBytes
      },
    })

    const open = await core.handleRequest({
      id: 'job-session-open',
      type: 'openSession',
      payload: {
        fileBuffer: new ArrayBuffer(4),
        fileName: 'sample.ARW',
        fileSize: 4,
        maxOutputPixels: 123,
      },
    })

    expect(open.ok && open.type === 'openSession').toBe(true)
    if (!open.ok || open.type !== 'openSession') return
    expect(open.payload.heap).toMatchObject({
      before: 268436480,
      after: 268437504,
    })

    const sessionId = open.payload.sessionId
    const embedded = await core.handleRequest({
      id: 'job-session-embedded',
      type: 'extractEmbeddedPreviewFromSession',
      payload: { sessionId },
    })
    const quick = await core.handleRequest({
      id: 'job-session-quick',
      type: 'decodeQuickFromSession',
      payload: { sessionId },
    })
    const hq = await core.handleRequest({
      id: 'job-session-hq',
      type: 'decodeHqFromSession',
      payload: { sessionId },
    })
    const close = await core.handleRequest({
      id: 'job-session-close',
      type: 'closeSession',
      payload: { sessionId },
    })

    expect(embedded).toMatchObject({
      ok: true,
      type: 'extractEmbeddedPreviewFromSession',
      payload: {
        sessionId,
        source: 'embedded',
      },
    })
    expect(quick).toMatchObject({
      ok: true,
      type: 'decodeQuickFromSession',
      payload: {
        sessionId,
        source: 'quick',
      },
    })
    expect(hq).toMatchObject({
      ok: true,
      type: 'decodeHqFromSession',
      payload: {
        sessionId,
        source: 'hq',
      },
    })
    expect(close).toMatchObject({
      ok: true,
      type: 'closeSession',
      payload: { closed: true },
    })
    expect(loadCount).toBe(1)
    expect(openSettings).toMatchObject([
      { halfSize: true },
      { halfSize: true },
      { halfSize: true },
      { halfSize: false },
    ])
    expect(previewOptions).toEqual([{ maxOutputPixels: 123 }])
    expect(disposeCount).toBe(1)
  })

  it('passes quick maxOutputPixels to native decodePreview', async () => {
    let receivedMaxOutputPixels: number | undefined

    const core = createRuntimeCore({
      createProcessor() {
        return {
          openBuffer() {
            return { copyToWasm: 1, librawOpen: 1 }
          },
          loadBuffer() {
            return { copyToWasm: 1 }
          },
          openWithSettings() {
            return { copyToWasm: 0, librawOpen: 1 }
          },
          readMetadata() {
            return { width: 6000, height: 4000 }
          },
          extractThumbnail() {
            return undefined
          },
          decodePreview(options) {
            receivedMaxOutputPixels = options?.maxOutputPixels
            return {
              data: new Uint16Array(1500 * 1000 * 3),
              width: 1500,
              height: 1000,
              bits: 16,
            }
          },
          decodeHq() {
            return {
              data: new Uint16Array(6000 * 4000 * 3),
              width: 6000,
              height: 4000,
              bits: 16,
            }
          },
          dispose() {},
        }
      },
    })

    const opened = await core.handleRequest({
      id: 'job-open-session',
      type: 'openSession',
      payload: {
        fileBuffer: new ArrayBuffer(4),
        fileName: 'sample.ARW',
        fileSize: 4,
        maxOutputPixels: 1_000_000,
      },
    })
    expect(opened.ok && opened.type === 'openSession').toBe(true)
    if (!opened.ok || opened.type !== 'openSession') return

    const response = await core.handleRequest({
      id: 'job-quick-session',
      type: 'decodeQuickFromSession',
      payload: {
        sessionId: opened.payload.sessionId,
        maxOutputPixels: 1_500_000,
      },
    })

    expect(response.ok && response.type === 'decodeQuickFromSession').toBe(true)
    expect(receivedMaxOutputPixels).toBe(1_500_000)
  })

  it('returns session export capability and raw-window payloads', async () => {
    const core = createRuntimeCore({
      createProcessor() {
        return {
          ...makeNativeFactory().createProcessor(),
          probeExportCapability() {
            return {
              supported: true,
              width: 4000,
              height: 3000,
              rawWidth: 4024,
              rawHeight: 3024,
              cfa: { pattern: 'rggb', xPhase: 0, yPhase: 0 },
              blackLevel: 512,
              whiteLevel: 16383,
              orientation: 1,
              reasons: [],
            }
          },
          readRawWindow(rect) {
            return {
              rect,
              cfa: { pattern: 'rggb', xPhase: 0, yPhase: 0 },
              data: new Uint16Array(rect.width * rect.height),
              blackLevel: 512,
              whiteLevel: 16383,
            }
          },
        }
      },
    })

    const opened = await core.handleRequest({
      id: 'job-export-open',
      type: 'openSession',
      payload: {
        fileBuffer: new ArrayBuffer(4),
        fileName: 'sample.ARW',
        fileSize: 4,
      },
    })
    expect(opened.ok && opened.type === 'openSession').toBe(true)
    if (!opened.ok || opened.type !== 'openSession') return

    const capability = await core.handleRequest({
      id: 'job-export-capability',
      type: 'probeExportCapabilityFromSession',
      payload: { sessionId: opened.payload.sessionId },
    })
    const window = await core.handleRequest({
      id: 'job-export-window',
      type: 'readRawWindowFromSession',
      payload: {
        sessionId: opened.payload.sessionId,
        rect: { x: 4, y: 6, width: 2, height: 3 },
      },
    })

    expect(capability).toMatchObject({
      ok: true,
      type: 'probeExportCapabilityFromSession',
      payload: {
        supported: true,
        width: 4000,
        rawWidth: 4024,
        cfa: { pattern: 'rggb' },
      },
    })
    expect(window).toMatchObject({
      ok: true,
      type: 'readRawWindowFromSession',
      payload: {
        rect: { x: 4, y: 6, width: 2, height: 3 },
        cfa: { pattern: 'rggb' },
        blackLevel: 512,
        whiteLevel: 16383,
      },
    })
  })

  it('fails closed for missing session raw-window support', async () => {
    const core = createRuntimeCore(makeNativeFactory())

    const opened = await core.handleRequest({
      id: 'job-export-fallback-open',
      type: 'openSession',
      payload: {
        fileBuffer: new ArrayBuffer(4),
        fileName: 'sample.ARW',
        fileSize: 4,
      },
    })
    expect(opened.ok && opened.type === 'openSession').toBe(true)
    if (!opened.ok || opened.type !== 'openSession') return

    const capability = await core.handleRequest({
      id: 'job-export-fallback-capability',
      type: 'probeExportCapabilityFromSession',
      payload: { sessionId: opened.payload.sessionId },
    })
    const window = await core.handleRequest({
      id: 'job-export-fallback-window',
      type: 'readRawWindowFromSession',
      payload: {
        sessionId: opened.payload.sessionId,
        rect: { x: 0, y: 0, width: 1, height: 1 },
      },
    })

    expect(capability).toMatchObject({
      ok: true,
      type: 'probeExportCapabilityFromSession',
      payload: {
        supported: false,
        reasons: ['raw-window-unavailable'],
      },
    })
    expect(window).toMatchObject({
      ok: false,
      type: 'readRawWindowFromSession',
      error: {
        code: 'RAW_UNSUPPORTED_FORMAT',
        message: 'RAW runtime raw-window access is unavailable for this source.',
      },
    })
  })

  it('passes default quick maxOutputPixels to native decodePreview', async () => {
    const previewOptions: unknown[] = []
    const hqOptions: unknown[] = []
    const core = createRuntimeCore({
      createProcessor() {
        const processor = makeNativeFactory().createProcessor()
        return {
          ...processor,
          decodePreview(options) {
            previewOptions.push(options)
            return processor.decodePreview(options)
          },
          decodeHq(options) {
            hqOptions.push(options)
            return processor.decodeHq(options)
          },
        }
      },
    })

    const quick = await core.handleRequest({
      id: 'job-default-quick-cap',
      type: 'decodeQuick',
      payload: {
        fileBuffer: new ArrayBuffer(4),
        fileName: 'sample.ARW',
        fileSize: 4,
      },
    })
    const opened = await core.handleRequest({
      id: 'job-default-session-cap-open',
      type: 'openSession',
      payload: {
        fileBuffer: new ArrayBuffer(4),
        fileName: 'sample.ARW',
        fileSize: 4,
      },
    })
    expect(opened.ok && opened.type === 'openSession').toBe(true)
    if (!opened.ok || opened.type !== 'openSession') return

    const sessionQuick = await core.handleRequest({
      id: 'job-default-session-cap-quick',
      type: 'decodeQuickFromSession',
      payload: {
        sessionId: opened.payload.sessionId,
      },
    })
    const hq = await core.handleRequest({
      id: 'job-default-hq-no-cap',
      type: 'decodeHqFromSession',
      payload: {
        sessionId: opened.payload.sessionId,
      },
    })

    expect(quick.ok && quick.type === 'decodeQuick').toBe(true)
    expect(
      sessionQuick.ok && sessionQuick.type === 'decodeQuickFromSession',
    ).toBe(true)
    expect(hq.ok && hq.type === 'decodeHqFromSession').toBe(true)
    expect(previewOptions).toEqual([
      { maxOutputPixels: 2_500_000 },
      { maxOutputPixels: 2_500_000 },
    ])
    expect(hqOptions).toEqual([undefined])
  })

  it('disposes an opened session when late cancellation targets its open request', async () => {
    let disposeCount = 0
    const core = createRuntimeCore({
      createProcessor() {
        const processor = makeNativeFactory().createProcessor()
        return {
          ...processor,
          dispose() {
            disposeCount += 1
            processor.dispose()
          },
        }
      },
    })

    const open = await core.handleRequest({
      id: 'job-late-cancel-open',
      type: 'openSession',
      payload: {
        fileBuffer: new ArrayBuffer(4),
        fileName: 'sample.ARW',
        fileSize: 4,
      },
    })

    expect(open.ok && open.type === 'openSession').toBe(true)
    if (!open.ok || open.type !== 'openSession') return

    const cancel = await core.handleRequest({
      id: 'job-late-cancel',
      type: 'cancel',
      payload: {
        targetJobId: 'job-late-cancel-open',
      },
    })
    const decodeAfterCancel = await core.handleRequest({
      id: 'job-after-late-cancel',
      type: 'decodeQuickFromSession',
      payload: {
        sessionId: open.payload.sessionId,
      },
    })

    expect(cancel).toMatchObject({
      ok: true,
      type: 'cancel',
      payload: { cancelled: true },
    })
    expect(disposeCount).toBe(1)
    expect(decodeAfterCancel).toMatchObject({
      ok: false,
      type: 'decodeQuickFromSession',
      error: {
        code: 'RAW_WORKER_PROTOCOL_ERROR',
      },
    })
  })

  it('returns a protocol error for unknown session ids', async () => {
    const core = createRuntimeCore(makeNativeFactory())

    const response = await core.handleRequest({
      id: 'job-missing-session',
      type: 'decodeQuickFromSession',
      payload: {
        sessionId: 'missing-session',
      },
    })

    expect(response).toMatchObject({
      ok: false,
      type: 'decodeQuickFromSession',
      error: {
        code: 'RAW_WORKER_PROTOCOL_ERROR',
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

  it('uses measured openBuffer timing when native open timings are unavailable', async () => {
    const core = createRuntimeCore({
      createProcessor() {
        const processor = makeNativeFactory().createProcessor()

        return {
          ...processor,
          openBuffer(data, settings) {
            processor.openBuffer(data, settings)
            return undefined
          },
        }
      },
    })

    const response = await core.handleRequest({
      id: 'job-open-fallback-timing',
      type: 'decodeQuick',
      payload: {
        fileBuffer: new ArrayBuffer(4),
        fileName: 'sample.ARW',
        fileSize: 4,
      },
    })

    expect(response.ok && response.type === 'decodeQuick').toBe(true)
    if (!response.ok || response.type !== 'decodeQuick') return

    expect(response.payload.timings.openBuffer).toBeGreaterThanOrEqual(0)
    expect(response.payload.timings.copyToWasm).toBeUndefined()
    expect(response.payload.timings.librawOpen).toBeUndefined()
  })

  it('returns a stable failure when native open timings are malformed', async () => {
    const core = createRuntimeCore({
      createProcessor() {
        const processor = makeNativeFactory().createProcessor()

        return {
          ...processor,
          openBuffer(data, settings) {
            processor.openBuffer(data, settings)
            return {
              copyToWasm: -1,
              librawOpen: 11,
            }
          },
        }
      },
    })

    const response = await core.handleRequest({
      id: 'job-bad-open-timings',
      type: 'decodeQuick',
      payload: {
        fileBuffer: new ArrayBuffer(4),
        fileName: 'sample.ARW',
        fileSize: 4,
      },
    })

    expect(response).toMatchObject({
      ok: false,
      type: 'decodeQuick',
      error: {
        code: 'RAW_OPEN_FAILED',
        message: 'Native RAW openBuffer returned invalid copyToWasm timing.',
      },
    })
  })

  it('keeps native-owned output buffers without cloning in runtime-core', async () => {
    const nativeData = new Uint16Array([1, 2, 3])
    const core = createRuntimeCore({
      createProcessor() {
        return {
          openBuffer() {
            return { copyToWasm: 1, librawOpen: 1 }
          },
          loadBuffer() {
            return { copyToWasm: 1 }
          },
          openWithSettings() {
            return { copyToWasm: 0, librawOpen: 1 }
          },
          readMetadata() {
            return { width: 1, height: 1 }
          },
          extractThumbnail() {
            return undefined
          },
          decodePreview() {
            return {
              data: nativeData,
              width: 1,
              height: 1,
              bits: 16,
            }
          },
          decodeHq() {
            return {
              data: nativeData,
              width: 1,
              height: 1,
              bits: 16,
            }
          },
          dispose() {},
        }
      },
    })

    const response = await core.handleRequest({
      id: 'job-no-clone',
      type: 'decodeQuick',
      payload: {
        fileBuffer: new ArrayBuffer(4),
        fileName: 'sample.ARW',
        fileSize: 4,
      },
    })

    expect(response.ok && response.type === 'decodeQuick').toBe(true)
    if (!response.ok || response.type !== 'decodeQuick') return

    expect(response.payload.data).toBe(nativeData)
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
