import { createJpegRuntimeCore } from './runtime-core'

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

  it('returns an image/jpeg blob on finish', async () => {
    const core = createJpegRuntimeCore()

    await core.handleRequest({
      id: 'create-2',
      type: 'create',
      payload: { width: 2, height: 2, quality: 0.9 },
    })
    await core.handleRequest({
      id: 'rows-2',
      type: 'rows',
      payload: {
        rows: new Uint8Array([
          255, 255, 255, 0, 0, 0,
          255, 0, 0, 0, 255, 0,
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
})
