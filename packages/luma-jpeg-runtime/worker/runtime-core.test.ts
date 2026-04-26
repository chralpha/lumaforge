import { createJpegRuntimeCore } from './runtime-core'

function readWord(bytes: Uint8Array, offset: number) {
  return (bytes[offset] << 8) | bytes[offset + 1]
}

async function expectBaselineJpeg(
  blob: Blob,
  dimensions: { width: number; height: number },
) {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const markers = new Set<number>()
  let sof0: { width: number; height: number } | undefined
  let offset = 2

  expect(readWord(bytes, 0)).toBe(0xffd8)
  expect(readWord(bytes, bytes.length - 2)).toBe(0xffd9)

  while (offset < bytes.length - 2) {
    if (bytes[offset] !== 0xff) {
      offset += 1
      continue
    }

    const marker = bytes[offset + 1]
    markers.add(marker)
    if (marker === 0xda) {
      break
    }

    const segmentLength = readWord(bytes, offset + 2)
    if (marker === 0xc0) {
      sof0 = {
        height: readWord(bytes, offset + 5),
        width: readWord(bytes, offset + 7),
      }
    }
    offset += 2 + segmentLength
  }

  expect(markers.has(0xdb)).toBe(true)
  expect(markers.has(0xc0)).toBe(true)
  expect(markers.has(0xc4)).toBe(true)
  expect(markers.has(0xda)).toBe(true)
  expect(sof0).toEqual(dimensions)
}

describe('createJpegRuntimeCore', () => {
  it('tracks written rows after create', async () => {
    const core = createJpegRuntimeCore()

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
    const core = createJpegRuntimeCore()

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
          255, 255, 255, 0, 0, 0, 255, 0, 0,
          0, 255, 0, 0, 0, 255, 255, 255, 0,
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
          128, 0, 0, 0, 128, 0, 0, 0, 128,
          255, 128, 0, 0, 128, 255, 128, 128, 128,
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

  it('rejects finish before create', async () => {
    const core = createJpegRuntimeCore()

    await expect(
      core.handleRequest({
        id: 'finish-before-create',
        type: 'finish',
        payload: {},
      }),
    ).rejects.toThrow('JPEG_RUNTIME_NOT_CREATED')
  })

  it('rejects rows before create', async () => {
    const core = createJpegRuntimeCore()

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
    const core = createJpegRuntimeCore()

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
    const core = createJpegRuntimeCore(() => ({
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
    const core = createJpegRuntimeCore()

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
    const core = createJpegRuntimeCore()

    await expect(
      core.handleRequest({
        id: 'create-invalid-quality',
        type: 'create',
        payload: { width: 1, height: 1, quality: 0 },
      }),
    ).rejects.toThrow('JPEG_INVALID_QUALITY')
  })

  it('rejects create while an encoder is ready', async () => {
    const core = createJpegRuntimeCore()

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
    const core = createJpegRuntimeCore(() => ({
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
    const core = createJpegRuntimeCore(() => ({
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
})
