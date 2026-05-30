import type { SupportedExportColorGraphDescriptor } from '@lumaforge/luma-color-runtime'

import type {
  CpuPreviewFailureReason,
  CpuPreviewRequest,
  CpuPreviewResponse,
  CpuPreviewVariant,
} from './cpu-preview-protocol'

export type CpuPreviewWorkerLike = {
  postMessage: (msg: CpuPreviewRequest, transfer?: Transferable[]) => void
  onmessage: ((e: { data: CpuPreviewResponse }) => void) | null
  onerror: ((e: unknown) => void) | null
  terminate: () => void
}

export type CpuPreviewFrame = {
  requestId: number
  sourceId: string
  rgba: Uint8ClampedArray
  width: number
  height: number
}

type PendingRender = {
  variant: CpuPreviewVariant
  graph: SupportedExportColorGraphDescriptor
}

const defaultWorkerFactory = (): CpuPreviewWorkerLike =>
  new Worker(new URL('./cpu-preview.worker.ts', import.meta.url), {
    type: 'module',
  }) as unknown as CpuPreviewWorkerLike

export class CpuPreviewClient {
  private worker: CpuPreviewWorkerLike | null = null
  private sourceId: string | null = null
  private nextRequestId = 1
  private inFlightId: number | null = null
  private pending: PendingRender | null = null
  private frameHandler: ((f: CpuPreviewFrame) => void) | null = null
  private errorHandler: ((r: CpuPreviewFailureReason) => void) | null = null

  constructor(
    private readonly factory: () => CpuPreviewWorkerLike = defaultWorkerFactory,
  ) {}

  onFrame(fn: (f: CpuPreviewFrame) => void) {
    this.frameHandler = fn
  }
  onError(fn: (r: CpuPreviewFailureReason) => void) {
    this.errorHandler = fn
  }

  private ensureWorker(): CpuPreviewWorkerLike {
    if (this.worker) return this.worker
    let worker: CpuPreviewWorkerLike
    try {
      worker = this.factory()
    } catch {
      this.errorHandler?.('worker-construction-failed')
      throw new Error('worker-construction-failed')
    }
    worker.onmessage = (e) => this.handle(e.data)
    worker.onerror = () => this.errorHandler?.('worker-module-load-failed')
    this.worker = worker
    return worker
  }

  loadSource(input: {
    sourceId: string
    width: number
    height: number
    data: Uint16Array
  }) {
    const worker = this.ensureWorker()
    // Release the previously-owned source in the worker before loading a new
    // one, so the worker's source map does not retain stale image buffers.
    if (this.sourceId && this.sourceId !== input.sourceId) {
      worker.postMessage({ type: 'disposeSource', sourceId: this.sourceId })
    }
    this.sourceId = input.sourceId
    this.inFlightId = null
    this.pending = null
    const copy = input.data.slice()
    worker.postMessage(
      {
        type: 'loadSource',
        sourceId: input.sourceId,
        width: input.width,
        height: input.height,
        data: copy,
      },
      [copy.buffer],
    )
  }

  requestRender(req: PendingRender) {
    if (!this.sourceId) return
    if (this.inFlightId != null) {
      this.pending = req
      return
    }
    this.post(req)
  }

  private post(req: PendingRender) {
    const worker = this.ensureWorker()
    const requestId = this.nextRequestId++
    this.inFlightId = requestId
    worker.postMessage({
      type: 'render',
      sourceId: this.sourceId!,
      requestId,
      graph: req.graph,
      variant: req.variant,
    })
  }

  private handle(res: CpuPreviewResponse) {
    if (res.type === 'error') {
      this.inFlightId = null
      this.errorHandler?.(res.reason)
      this.flushPending()
      return
    }
    const isLatest =
      res.requestId === this.inFlightId && res.sourceId === this.sourceId
    this.inFlightId = null
    if (isLatest) {
      this.frameHandler?.({
        requestId: res.requestId,
        sourceId: res.sourceId,
        rgba: res.rgba,
        width: res.width,
        height: res.height,
      })
    }
    this.flushPending()
  }

  private flushPending() {
    if (this.pending && this.sourceId) {
      const next = this.pending
      this.pending = null
      this.post(next)
    }
  }

  dispose() {
    if (this.worker && this.sourceId) {
      this.worker.postMessage({
        type: 'disposeSource',
        sourceId: this.sourceId,
      })
    }
    this.worker?.terminate()
    this.worker = null
    this.sourceId = null
    this.inFlightId = null
    this.pending = null
  }
}
