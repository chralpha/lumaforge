import { createBaselineJpegEncoder } from './baseline-encoder'
import { createJpegRuntimeCore } from './runtime-core'

const JPEG_SOI_MARKER = 65_496
const JPEG_EOI_MARKER = 65_497
const JPEG_MARKER_PREFIX = 255
const JPEG_SOS_MARKER = 218
const JPEG_SOF0_MARKER = 192
const JPEG_DQT_MARKER = 219
const JPEG_DHT_MARKER = 196

function createBaselineRuntime() {
  return createJpegRuntimeCore(async () => createBaselineJpegEncoder)
}

function readWord(bytes: Uint8Array, offset: number) {
  return (bytes[offset] << 8) | bytes[offset + 1]
}

function readBlobBytes(blob: Blob) {
  if (typeof blob.arrayBuffer === 'function') {
    return blob.arrayBuffer()
  }

  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(blob)
  })
}

async function expectBaselineJpeg(
  blob: Blob,
  dimensions: { width: number; height: number },
) {
  const bytes = new Uint8Array(await readBlobBytes(blob))
  const markers = new Set<number>()
  let sof0: { width: number; height: number } | undefined
  let offset = 2

  expect(readWord(bytes, 0)).toBe(JPEG_SOI_MARKER)
  expect(readWord(bytes, bytes.length - 2)).toBe(JPEG_EOI_MARKER)

  while (offset < bytes.length - 2) {
    if (bytes[offset] !== JPEG_MARKER_PREFIX) {
      offset += 1
      continue
    }

    const marker = bytes[offset + 1]
    markers.add(marker)
    if (marker === JPEG_SOS_MARKER) {
      break
    }

    const segmentLength = readWord(bytes, offset + 2)
    if (marker === JPEG_SOF0_MARKER) {
      sof0 = {
        height: readWord(bytes, offset + 5),
        width: readWord(bytes, offset + 7),
      }
    }
    offset += 2 + segmentLength
  }

  expect(markers.has(JPEG_DQT_MARKER)).toBe(true)
  expect(markers.has(JPEG_SOF0_MARKER)).toBe(true)
  expect(markers.has(JPEG_DHT_MARKER)).toBe(true)
  expect(markers.has(JPEG_SOS_MARKER)).toBe(true)
  expect(sof0).toEqual(dimensions)
}

describe('createJpegRuntimeCore', () => {
  it('tracks written rows after create', async () => {
    const core = createBaselineRuntime()

    await expect(
      core.handleRequest({
        id: 'create-1',
        type: 'create',
        payload: { width: 2, height: 2, quality: 0.9 },
      }),
    ).resolves.toMatchObject({
      ok: true,
      type: 'create',
      payload: { created: true },
    })

    await expect(
      core.handleRequest({
        id: 'rows-1',
        type: 'rows',
        payload: {
          rows: new Uint8Array([255, 0, 0, 0, 255, 0]),
          rowCount: 1,
        },
      }),
    ).resolves.toMatchObject({
      ok: true,
      type: 'rows',
      payload: { writtenRows: 1 },
    })
  })

  it('returns a baseline image/jpeg blob on finish', async () => {
    const core = createBaselineRuntime()

    await core.handleRequest({
      id: 'create-2',
      type: 'create',
      payload: { width: 3, height: 5, quality: 0.9 },
    })
    await core.handleRequest({
      id: 'rows-2',
      type: 'rows',
      payload: {
        rows: new Uint8Array([
          255, 255, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 0,
          255, 0, 255, 0, 255, 255, 64, 64, 64,
        ]),
        rowCount: 3,
      },
    })
    await core.handleRequest({
      id: 'rows-2b',
      type: 'rows',
      payload: {
        rows: new Uint8Array([
          128, 0, 0, 0, 128, 0, 0, 0, 128, 255, 128, 0, 0, 128, 255, 128, 128,
          128,
        ]),
        rowCount: 2,
      },
    })

    const response = await core.handleRequest({
      id: 'finish-1',
      type: 'finish',
      payload: {},
    })

    expect(response.ok).toBe(true)
    expect(response.type).toBe('finish')
    if (response.type !== 'finish') {
      throw new Error('expected finish response')
    }
    expect(response.payload.blob.type).toBe('image/jpeg')
    expect(response.payload.blob.size).toBeGreaterThan(0)
    await expectBaselineJpeg(response.payload.blob, { width: 3, height: 5 })
  })

  it('emits backend chunks before returning the finish response', async () => {
    const chunk = {
      bytes: new Uint8Array([255, 216]),
      byteOffset: 0,
      final: false,
    }
    const emitted: unknown[] = []
    const core = createJpegRuntimeCore(
      async () => () => ({
        async writeRows() {},
        async finish() {
          return new Blob(['jpeg'], { type: 'image/jpeg' })
        },
        drainChunks() {
          return [chunk]
        },
        abort() {},
      }),
      {
        onResponse: (response) => {
          emitted.push(response)
        },
      },
    )

    await core.handleRequest({
      id: 'create-chunked-finish',
      type: 'create',
      payload: { width: 1, height: 1, quality: 0.9 },
    })
    await core.handleRequest({
      id: 'rows-before-chunked-finish',
      type: 'rows',
      payload: { rows: new Uint8Array([255, 255, 255]), rowCount: 1 },
    })

    const response = await core.handleRequest({
      id: 'finish-chunked',
      type: 'finish',
      payload: {},
    })

    expect(emitted).toEqual([
      {
        id: 'finish-chunked',
        ok: true,
        type: 'chunk',
        payload: chunk,
      },
    ])
    expect(response).toMatchObject({
      id: 'finish-chunked',
      ok: true,
      type: 'finish',
    })
  })

  it('returns an empty finish blob in chunk-only mode after emitting chunks', async () => {
    const chunk = {
      bytes: new Uint8Array([255, 216, 255, 217]),
      byteOffset: 0,
      final: true,
    }
    const emitted: unknown[] = []
    const core = createJpegRuntimeCore(
      async () => () => ({
        async writeRows() {},
        async finish() {
          return new Blob([], { type: 'image/jpeg' })
        },
        drainChunks() {
          return [chunk]
        },
        abort() {},
      }),
      {
        onResponse: (response) => {
          emitted.push(response)
        },
      },
    )

    await core.handleRequest({
      id: 'create-chunk-only',
      type: 'create',
      payload: {
        width: 1,
        height: 1,
        quality: 0.9,
        finishMode: 'chunks',
      },
    })
    await core.handleRequest({
      id: 'rows-before-chunk-only',
      type: 'rows',
      payload: { rows: new Uint8Array([255, 255, 255]), rowCount: 1 },
    })

    const response = await core.handleRequest({
      id: 'finish-chunk-only',
      type: 'finish',
      payload: {},
    })

    expect(emitted).toEqual([
      {
        id: 'finish-chunk-only',
        ok: true,
        type: 'chunk',
        payload: chunk,
      },
    ])
    expect(response.type).toBe('finish')
    if (response.type !== 'finish') {
      throw new Error('expected finish response')
    }
    expect(response.payload.blob.size).toBe(0)
  })

  it('assembles a blob from backend chunks when blob mode receives an empty finish blob', async () => {
    const chunks = [
      {
        bytes: new Uint8Array([255, 216]),
        byteOffset: 0,
        final: false,
      },
      {
        bytes: new Uint8Array([255, 217]),
        byteOffset: 2,
        final: true,
      },
    ]
    const core = createJpegRuntimeCore(async () => () => ({
      async writeRows() {},
      async finish() {
        return new Blob([], { type: 'image/jpeg' })
      },
      drainChunks() {
        return chunks
      },
      abort() {},
    }))

    await core.handleRequest({
      id: 'create-blob-from-chunks',
      type: 'create',
      payload: { width: 1, height: 1, quality: 0.9 },
    })
    await core.handleRequest({
      id: 'rows-before-blob-from-chunks',
      type: 'rows',
      payload: { rows: new Uint8Array([255, 255, 255]), rowCount: 1 },
    })

    const response = await core.handleRequest({
      id: 'finish-blob-from-chunks',
      type: 'finish',
      payload: {},
    })

    expect(response.type).toBe('finish')
    if (response.type !== 'finish') {
      throw new Error('expected finish response')
    }
    await expect(readBlobBytes(response.payload.blob)).resolves.toEqual(
      new Uint8Array([255, 216, 255, 217]).buffer,
    )
  })

  it('rejects chunk-only finish when the backend emits no chunks', async () => {
    const core = createJpegRuntimeCore(async () => () => ({
      async writeRows() {},
      async finish() {
        return new Blob(['jpeg'], { type: 'image/jpeg' })
      },
      abort() {},
    }))

    await core.handleRequest({
      id: 'create-missing-chunks',
      type: 'create',
      payload: {
        width: 1,
        height: 1,
        quality: 0.9,
        finishMode: 'chunks',
      },
    })
    await core.handleRequest({
      id: 'rows-before-missing-chunks',
      type: 'rows',
      payload: { rows: new Uint8Array([255, 255, 255]), rowCount: 1 },
    })

    await expect(
      core.handleRequest({
        id: 'finish-missing-chunks',
        type: 'finish',
        payload: {},
      }),
    ).rejects.toThrow('JPEG_RUNTIME_CHUNKS_UNAVAILABLE')
  })

  it('rejects finish before create', async () => {
    const core = createBaselineRuntime()

    await expect(
      core.handleRequest({
        id: 'finish-before-create',
        type: 'finish',
        payload: {},
      }),
    ).rejects.toThrow('JPEG_RUNTIME_NOT_CREATED')
  })

  it('rejects rows before create', async () => {
    const core = createBaselineRuntime()

    await expect(
      core.handleRequest({
        id: 'rows-before-create',
        type: 'rows',
        payload: {
          rows: new Uint8Array([255, 255, 255]),
          rowCount: 1,
        },
      }),
    ).rejects.toThrow('JPEG_RUNTIME_NOT_CREATED')
  })

  it('rejects non-positive row counts', async () => {
    const core = createBaselineRuntime()

    await core.handleRequest({
      id: 'create-3',
      type: 'create',
      payload: { width: 1, height: 1, quality: 0.9 },
    })

    await expect(
      core.handleRequest({
        id: 'rows-invalid-count',
        type: 'rows',
        payload: {
          rows: new Uint8Array([]),
          rowCount: 0,
        },
      }),
    ).rejects.toThrow('JPEG_INVALID_ROW_COUNT')
  })

  it('rejects row length mismatches before writing to the backend', async () => {
    let wroteRows = false
    const core = createJpegRuntimeCore(async () => () => ({
      async writeRows() {
        wroteRows = true
      },
      async finish() {
        return new Blob([], { type: 'image/jpeg' })
      },
      abort() {},
    }))

    await core.handleRequest({
      id: 'create-length-mismatch',
      type: 'create',
      payload: { width: 2, height: 1, quality: 0.9 },
    })

    await expect(
      core.handleRequest({
        id: 'rows-length-mismatch',
        type: 'rows',
        payload: {
          rows: new Uint8Array([255, 255, 255]),
          rowCount: 1,
        },
      }),
    ).rejects.toThrow('JPEG_ROW_LENGTH_MISMATCH')
    expect(wroteRows).toBe(false)
  })

  it('rejects rows after abort', async () => {
    const core = createBaselineRuntime()

    await core.handleRequest({
      id: 'create-4',
      type: 'create',
      payload: { width: 1, height: 1, quality: 0.9 },
    })
    await core.handleRequest({
      id: 'abort-1',
      type: 'abort',
      payload: {},
    })

    await expect(
      core.handleRequest({
        id: 'rows-after-abort',
        type: 'rows',
        payload: {
          rows: new Uint8Array([255, 255, 255]),
          rowCount: 1,
        },
      }),
    ).rejects.toThrow('JPEG_RUNTIME_ABORTED')
  })

  it('rejects invalid JPEG quality at create time', async () => {
    const core = createBaselineRuntime()

    await expect(
      core.handleRequest({
        id: 'create-invalid-quality',
        type: 'create',
        payload: { width: 1, height: 1, quality: 0 },
      }),
    ).rejects.toThrow('JPEG_INVALID_QUALITY')
  })

  it('rejects create while an encoder is ready', async () => {
    const core = createBaselineRuntime()

    await core.handleRequest({
      id: 'create-active',
      type: 'create',
      payload: { width: 1, height: 1, quality: 0.9 },
    })

    await expect(
      core.handleRequest({
        id: 'create-active-2',
        type: 'create',
        payload: { width: 1, height: 1, quality: 0.9 },
      }),
    ).rejects.toThrow('JPEG_RUNTIME_ENCODER_ACTIVE')
  })

  it('rejects in-flight rows when abort wins the worker boundary', async () => {
    let resolveWriteRows: (() => void) | undefined
    const core = createJpegRuntimeCore(async () => () => ({
      writeRows: () =>
        new Promise<void>((resolve) => {
          resolveWriteRows = resolve
        }),
      async finish() {
        return new Blob([], { type: 'image/jpeg' })
      },
      abort() {},
    }))

    await core.handleRequest({
      id: 'create-in-flight-rows',
      type: 'create',
      payload: { width: 1, height: 1, quality: 0.9 },
    })
    const rowsPromise = core.handleRequest({
      id: 'rows-in-flight',
      type: 'rows',
      payload: { rows: new Uint8Array([255, 255, 255]), rowCount: 1 },
    })

    await core.handleRequest({
      id: 'abort-in-flight-rows',
      type: 'abort',
      payload: {},
    })
    resolveWriteRows?.()

    await expect(rowsPromise).rejects.toThrow('JPEG_RUNTIME_ABORTED')
  })

  it('rejects in-flight finish when abort wins the worker boundary', async () => {
    let resolveFinish: (() => void) | undefined
    const core = createJpegRuntimeCore(async () => () => ({
      async writeRows() {},
      finish: () =>
        new Promise<Blob>((resolve) => {
          resolveFinish = () => resolve(new Blob([], { type: 'image/jpeg' }))
        }),
      abort() {},
    }))

    await core.handleRequest({
      id: 'create-in-flight-finish',
      type: 'create',
      payload: { width: 1, height: 1, quality: 0.9 },
    })
    await core.handleRequest({
      id: 'rows-before-finish',
      type: 'rows',
      payload: { rows: new Uint8Array([255, 255, 255]), rowCount: 1 },
    })
    const finishPromise = core.handleRequest({
      id: 'finish-in-flight',
      type: 'finish',
      payload: {},
    })

    await core.handleRequest({
      id: 'abort-in-flight-finish',
      type: 'abort',
      payload: {},
    })
    resolveFinish?.()

    await expect(finishPromise).rejects.toThrow('JPEG_RUNTIME_ABORTED')
  })

  it('marks backend write failures terminal without reusing the encoder', async () => {
    let createCalls = 0
    let writeRowsCalls = 0
    let finishCalls = 0
    const core = createJpegRuntimeCore(async () => () => {
      createCalls += 1

      return {
        async writeRows() {
          writeRowsCalls += 1
          throw new Error('JPEG_NATIVE_WRITE_FAILED')
        },
        async finish() {
          finishCalls += 1
          return new Blob([], { type: 'image/jpeg' })
        },
        abort() {},
      }
    })

    await core.handleRequest({
      id: 'create-write-failure',
      type: 'create',
      payload: { width: 1, height: 1, quality: 0.9 },
    })

    await expect(
      core.handleRequest({
        id: 'rows-write-failure',
        type: 'rows',
        payload: { rows: new Uint8Array([255, 255, 255]), rowCount: 1 },
      }),
    ).rejects.toThrow('JPEG_NATIVE_WRITE_FAILED')
    await expect(
      core.handleRequest({
        id: 'rows-after-write-failure',
        type: 'rows',
        payload: { rows: new Uint8Array([255, 255, 255]), rowCount: 1 },
      }),
    ).rejects.toThrow('JPEG_RUNTIME_ABORTED')
    await expect(
      core.handleRequest({
        id: 'finish-after-write-failure',
        type: 'finish',
        payload: {},
      }),
    ).rejects.toThrow('JPEG_RUNTIME_ABORTED')
    await expect(
      core.handleRequest({
        id: 'create-after-write-failure',
        type: 'create',
        payload: { width: 1, height: 1, quality: 0.9 },
      }),
    ).rejects.toThrow('JPEG_RUNTIME_ABORTED')

    expect(createCalls).toBe(1)
    expect(writeRowsCalls).toBe(1)
    expect(finishCalls).toBe(0)
  })

  it('marks backend finish failures terminal without reusing the encoder', async () => {
    let createCalls = 0
    let writeRowsCalls = 0
    let finishCalls = 0
    const core = createJpegRuntimeCore(async () => () => {
      createCalls += 1

      return {
        async writeRows() {
          writeRowsCalls += 1
        },
        async finish() {
          finishCalls += 1
          throw new Error('JPEG_NATIVE_FINISH_FAILED')
        },
        abort() {},
      }
    })

    await core.handleRequest({
      id: 'create-finish-failure',
      type: 'create',
      payload: { width: 1, height: 1, quality: 0.9 },
    })
    await core.handleRequest({
      id: 'rows-before-finish-failure',
      type: 'rows',
      payload: { rows: new Uint8Array([255, 255, 255]), rowCount: 1 },
    })

    await expect(
      core.handleRequest({
        id: 'finish-failure',
        type: 'finish',
        payload: {},
      }),
    ).rejects.toThrow('JPEG_NATIVE_FINISH_FAILED')
    await expect(
      core.handleRequest({
        id: 'finish-after-finish-failure',
        type: 'finish',
        payload: {},
      }),
    ).rejects.toThrow('JPEG_RUNTIME_ABORTED')
    await expect(
      core.handleRequest({
        id: 'rows-after-finish-failure',
        type: 'rows',
        payload: { rows: new Uint8Array([255, 255, 255]), rowCount: 1 },
      }),
    ).rejects.toThrow('JPEG_RUNTIME_ABORTED')
    await expect(
      core.handleRequest({
        id: 'create-after-finish-failure',
        type: 'create',
        payload: { width: 1, height: 1, quality: 0.9 },
      }),
    ).rejects.toThrow('JPEG_RUNTIME_ABORTED')

    expect(createCalls).toBe(1)
    expect(writeRowsCalls).toBe(1)
    expect(finishCalls).toBe(1)
  })
})
