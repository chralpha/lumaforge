export interface WorkerBridgeHandle<TApi> {
  api: TApi
  terminate: () => void | Promise<void>
}

export interface WorkerBridgeOptions<TApi> {
  startWorker: () =>
    | WorkerBridgeHandle<TApi>
    | Promise<WorkerBridgeHandle<TApi>>
  idleMs?: number
}

const DEFAULT_IDLE_MS = 10_000

type WorkerBridgeMethod = (...args: any[]) => Promise<any>
type WorkerBridgeArgs<
  TApi,
  K extends keyof TApi,
> = TApi[K] extends WorkerBridgeMethod ? Parameters<TApi[K]> : never
type WorkerBridgeResult<
  TApi,
  K extends keyof TApi,
> = TApi[K] extends WorkerBridgeMethod ? Awaited<ReturnType<TApi[K]>> : never

export class WorkerBridge<TApi extends object> {
  private _queue: Promise<unknown> = Promise.resolve()
  private _handle: WorkerBridgeHandle<TApi> | null = null
  private _idleTimer: ReturnType<typeof setTimeout> | null = null
  private readonly _startWorker: WorkerBridgeOptions<TApi>['startWorker']
  private readonly _idleMs: number

  constructor(options: WorkerBridgeOptions<TApi>) {
    this._startWorker = options.startWorker
    this._idleMs = options.idleMs ?? DEFAULT_IDLE_MS
  }

  call<K extends keyof TApi>(
    method: K,
    signal: AbortSignal,
    ...args: WorkerBridgeArgs<TApi, K>
  ): Promise<WorkerBridgeResult<TApi, K>> {
    const run = async (): Promise<WorkerBridgeResult<TApi, K>> => {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
      this._cancelIdleTimer()
      const handle = (this._handle ??= await this._startWorker())
      const onAbort = () => {
        void this.terminate()
      }
      signal.addEventListener('abort', onAbort, { once: true })
      try {
        const apiMethod = handle.api[method] as WorkerBridgeMethod
        return (await apiMethod(...args)) as WorkerBridgeResult<TApi, K>
      } finally {
        signal.removeEventListener('abort', onAbort)
        this._scheduleIdleTimer()
      }
    }

    const next = this._queue.catch(() => undefined).then(run)
    this._queue = next.catch(() => undefined)
    return next
  }

  async terminate(): Promise<void> {
    this._cancelIdleTimer()
    const handle = this._handle
    this._handle = null
    if (handle) await handle.terminate()
  }

  private _scheduleIdleTimer() {
    this._cancelIdleTimer()
    this._idleTimer = setTimeout(() => {
      void this.terminate()
    }, this._idleMs)
  }

  private _cancelIdleTimer() {
    if (this._idleTimer != null) {
      clearTimeout(this._idleTimer)
      this._idleTimer = null
    }
  }
}
