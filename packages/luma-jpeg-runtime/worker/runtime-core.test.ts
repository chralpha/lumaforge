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

  it('fails closed on finish until a runtime exists', async () => {
    const core = createJpegRuntimeCore()

    await core.handleRequest({
      id: 'create-2',
      type: 'create',
      payload: { width: 1, height: 1, quality: 0.9 },
    })
    await core.handleRequest({
      id: 'rows-2',
      type: 'rows',
      payload: {
        rows: new Uint8Array([255, 255, 255]),
        rowCount: 1,
      },
    })

    await expect(
      core.handleRequest({
        id: 'finish-1',
        type: 'finish',
        payload: {},
      }),
    ).rejects.toThrow('JPEG_RUNTIME_UNAVAILABLE')
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
