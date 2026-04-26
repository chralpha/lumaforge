import type {
  JpegWorkerRequest,
  JpegWorkerResponse,
} from '../worker/runtime-core'
import { createJpegRuntimeCore } from '../worker/runtime-core'
import { createLumaJpegRuntime } from './runtime'

type JpegWorkerErrorResponse = {
  id: string
  ok: false
  type: JpegWorkerRequest['type']
  error: { message: string }
}

type WorkerResponse = JpegWorkerResponse | JpegWorkerErrorResponse

type PostedMessage = {
  request: JpegWorkerRequest
  transfer: Transferable[]
}

class CoreBackedWorker {
  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  private readonly core = createJpegRuntimeCore()

  postMessage(request: JpegWorkerRequest) {
    void this.core
      .handleRequest(request)
      .then((response) => {
        queueMicrotask(() => {
          this.onmessage?.({ data: response } as MessageEvent<WorkerResponse>)
        })
      })
      .catch((error) => {
        queueMicrotask(() => {
          this.onmessage?.({
            data: {
              id: request.id,
              ok: false,
              type: request.type,
              error: {
                message: error instanceof Error ? error.message : String(error),
              },
            },
          } as MessageEvent<WorkerResponse>)
        })
      })
  }

  terminate() {}
}

class ManualWorker {
  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  readonly posts: PostedMessage[] = []

  postMessage(request: JpegWorkerRequest, transfer: Transferable[] = []) {
    this.posts.push({ request, transfer })
  }

  respond(request: JpegWorkerRequest, response?: Partial<JpegWorkerResponse>) {
    const payload =
      response?.payload ??
      (request.type === 'finish'
        ? {
            blob: new Blob([new Uint8Array([0xFF, 0xD8, 0xFF, 0xD9])], {
              type: 'image/jpeg',
            }),
          }
        : request.type === 'rows'
          ? { writtenRows: 1 }
          : request.type === 'abort'
            ? { aborted: true }
            : { created: true })

    queueMicrotask(() => {
      this.onmessage?.({
        data: {
          id: request.id,
          ok: true,
          type: request.type,
          payload,
        } as JpegWorkerResponse,
      } as MessageEvent<WorkerResponse>)
    })
  }

  terminate() {}
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

async function drainMicrotasks() {
  await Promise.resolve()
  await Promise.resolve()
}

async function expectBaselineJpeg(
  blob: Blob,
  dimensions: { width: number; height: number },
) {
  const bytes = new Uint8Array(await readBlobBytes(blob))
  const markers = new Set<number>()
  let sof0: { width: number; height: number } | undefined
  let offset = 2

  expect(readWord(bytes, 0)).toBe(0xFFD8)
  expect(readWord(bytes, bytes.length - 2)).toBe(0xFFD9)

  while (offset < bytes.length - 2) {
    if (bytes[offset] !== 0xFF) {
      offset += 1
      continue
    }

    const marker = bytes[offset + 1]
    markers.add(marker)
    if (marker === 0xDA) {
      break
    }

    const segmentLength = readWord(bytes, offset + 2)
    if (marker === 0xC0) {
      sof0 = {
        height: readWord(bytes, offset + 5),
        width: readWord(bytes, offset + 7),
      }
    }
    offset += 2 + segmentLength
  }

  expect(markers.has(0xDB)).toBe(true)
  expect(markers.has(0xC0)).toBe(true)
  expect(markers.has(0xC4)).toBe(true)
  expect(markers.has(0xDA)).toBe(true)
  expect(sof0).toEqual(dimensions)
}

describe('createLumaJpegRuntime', () => {
  it('encodes ordered RGB8 rows through a worker-backed runtime', async () => {
    const runtime = createLumaJpegRuntime({
      workerFactory: () => new CoreBackedWorker() as unknown as Worker,
    })
    const encoder = runtime.createEncoder({ width: 3, height: 5, quality: 0.9 })

    await encoder.writeRows(
      new Uint8Array([
        255, 255, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 0,
        255, 0, 255, 0, 255, 255, 64, 64, 64,
      ]),
      3,
    )
    await encoder.writeRows(
      new Uint8Array([
        128, 0, 0, 0, 128, 0, 0, 0, 128, 255, 128, 0, 0, 128, 255, 128, 128,
        128,
      ]),
      2,
    )
    const blob = await encoder.finish()

    expect(blob.type).toBe('image/jpeg')
    expect(blob.size).toBeGreaterThan(0)
    await expectBaselineJpeg(blob, { width: 3, height: 5 })
    runtime.dispose()
  })

  it('preserves worker failure messages', async () => {
    const runtime = createLumaJpegRuntime({
      workerFactory: () => new CoreBackedWorker() as unknown as Worker,
    })
    const encoder = runtime.createEncoder({ width: 2, height: 1, quality: 0.9 })

    await expect(
      encoder.writeRows(new Uint8Array([255, 255, 255]), 1),
    ).rejects.toThrow('JPEG_ROW_LENGTH_MISMATCH')
    runtime.dispose()
  })

  it('rejects a second public encoder while one is active', async () => {
    const worker = new ManualWorker()
    const runtime = createLumaJpegRuntime({
      workerFactory: () => worker as unknown as Worker,
    })

    runtime.createEncoder({ width: 1, height: 1, quality: 0.9 })

    expect(() =>
      runtime.createEncoder({ width: 1, height: 1, quality: 0.9 }),
    ).toThrow('JPEG_RUNTIME_ENCODER_ACTIVE')
    worker.respond(worker.posts[0].request)
    await drainMicrotasks()
    runtime.dispose()
  })

  it('does not post rows when abort wins the create boundary', async () => {
    const worker = new ManualWorker()
    const runtime = createLumaJpegRuntime({
      workerFactory: () => worker as unknown as Worker,
    })
    const encoder = runtime.createEncoder({ width: 1, height: 1, quality: 0.9 })
    const writePromise = encoder.writeRows(new Uint8Array([255, 255, 255]), 1)

    encoder.abort()
    worker.respond(worker.posts[0].request)

    await expect(writePromise).rejects.toThrow('JPEG_RUNTIME_ABORTED')
    expect(worker.posts.map((post) => post.request.type)).toEqual([
      'create',
      'abort',
    ])
    worker.respond(worker.posts[1].request)
    await drainMicrotasks()
    runtime.dispose()
  })

  it('does not post finish when abort wins the create boundary', async () => {
    const worker = new ManualWorker()
    const runtime = createLumaJpegRuntime({
      workerFactory: () => worker as unknown as Worker,
    })
    const encoder = runtime.createEncoder({ width: 1, height: 1, quality: 0.9 })
    const finishPromise = encoder.finish()

    encoder.abort()
    worker.respond(worker.posts[0].request)

    await expect(finishPromise).rejects.toThrow('JPEG_RUNTIME_ABORTED')
    expect(worker.posts.map((post) => post.request.type)).toEqual([
      'create',
      'abort',
    ])
    worker.respond(worker.posts[1].request)
    await drainMicrotasks()
    runtime.dispose()
  })

  it('transfers tight row buffers and copies sliced row views before posting', async () => {
    const worker = new ManualWorker()
    const runtime = createLumaJpegRuntime({
      workerFactory: () => worker as unknown as Worker,
    })
    const encoder = runtime.createEncoder({ width: 1, height: 2, quality: 0.9 })
    worker.respond(worker.posts[0].request)

    const tightRows = new Uint8Array([255, 255, 255])
    const tightWrite = encoder.writeRows(tightRows, 1)
    await drainMicrotasks()
    worker.respond(worker.posts[1].request)
    await tightWrite

    const backingRows = new Uint8Array([0, 99, 99, 99, 0])
    const slicedRows = backingRows.subarray(1, 4)
    const slicedWrite = encoder.writeRows(slicedRows, 1)
    await drainMicrotasks()
    worker.respond(worker.posts[2].request)
    await slicedWrite

    const tightPost = worker.posts[1]
    const slicedPost = worker.posts[2]

    expect(tightPost.transfer).toEqual([tightRows.buffer])
    expect(tightPost.request.type).toBe('rows')
    if (tightPost.request.type !== 'rows') {
      throw new Error('expected rows request')
    }
    expect(tightPost.request.payload.rows.buffer).toBe(tightRows.buffer)

    expect(slicedPost.request.type).toBe('rows')
    if (slicedPost.request.type !== 'rows') {
      throw new Error('expected rows request')
    }
    expect(slicedPost.request.payload.rows).toEqual(
      new Uint8Array([99, 99, 99]),
    )
    expect(slicedPost.request.payload.rows.buffer).not.toBe(backingRows.buffer)
    expect(slicedPost.request.payload.rows.byteOffset).toBe(0)
    expect(slicedPost.request.payload.rows.byteLength).toBe(
      slicedPost.request.payload.rows.buffer.byteLength,
    )
    expect(slicedPost.transfer).toEqual([
      slicedPost.request.payload.rows.buffer,
    ])
    runtime.dispose()
  })
})
