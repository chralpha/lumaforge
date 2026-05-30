import { describe, expect, it, vi } from 'vitest'

import type {CpuPreviewWorkerLike} from './cpu-preview-client';
import {
  CpuPreviewClient
} from './cpu-preview-client'
import type {
  CpuPreviewRequest,
  CpuPreviewResponse,
} from './cpu-preview-protocol'

function fakeWorker() {
  const posted: CpuPreviewRequest[] = []
  let onmessage: ((e: { data: CpuPreviewResponse }) => void) | null = null
  const worker: CpuPreviewWorkerLike = {
    postMessage: (msg: CpuPreviewRequest) => {
      posted.push(msg)
    },
    set onmessage(fn) {
      onmessage = fn
    },
    get onmessage() {
      return onmessage
    },
    set onerror(_fn) {},
    get onerror() {
      return null
    },
    terminate: vi.fn(),
  }
  const respond = (r: CpuPreviewResponse) => onmessage?.({ data: r })
  return { worker, posted, respond }
}

const graph = { steps: [] } as never

describe('cpuPreviewClient', () => {
  it('sends the source exactly once, then renders carry no source data', () => {
    const { worker, posted } = fakeWorker()
    const client = new CpuPreviewClient(() => worker)
    const data = new Uint16Array(2 * 2 * 3)
    client.loadSource({ sourceId: 's1', width: 2, height: 2, data })
    client.requestRender({ variant: 'processed', graph })
    const loads = posted.filter((m) => m.type === 'loadSource')
    const renders = posted.filter((m) => m.type === 'render')
    expect(loads).toHaveLength(1)
    expect(renders).toHaveLength(1)
    expect('data' in renders[0]).toBe(false)
  })

  it('keeps at most one in-flight render + one pending-latest', () => {
    const { worker, posted, respond } = fakeWorker()
    const client = new CpuPreviewClient(() => worker)
    client.loadSource({
      sourceId: 's1',
      width: 2,
      height: 2,
      data: new Uint16Array(12),
    })

    for (let i = 0; i < 5; i += 1)
      client.requestRender({ variant: 'processed', graph })
    expect(posted.filter((m) => m.type === 'render')).toHaveLength(1)

    const firstRender = posted.find((m) => m.type === 'render') as Extract<
      CpuPreviewRequest,
      { type: 'render' }
    >
    respond({
      type: 'rendered',
      sourceId: 's1',
      requestId: firstRender.requestId,
      rgba: new Uint8ClampedArray(16),
      width: 2,
      height: 2,
    })
    expect(posted.filter((m) => m.type === 'render')).toHaveLength(2)
  })

  it('commits only the latest frame and ignores stale responses', () => {
    const { worker, posted, respond } = fakeWorker()
    const client = new CpuPreviewClient(() => worker)
    const frames: number[] = []
    client.onFrame((f) => frames.push(f.requestId))
    client.loadSource({
      sourceId: 's1',
      width: 2,
      height: 2,
      data: new Uint16Array(12),
    })
    client.requestRender({ variant: 'processed', graph })
    client.requestRender({ variant: 'processed', graph })

    const renders = posted.filter((m) => m.type === 'render') as Array<
      Extract<CpuPreviewRequest, { type: 'render' }>
    >
    respond({
      type: 'rendered',
      sourceId: 's1',
      requestId: renders[0].requestId,
      rgba: new Uint8ClampedArray(16),
      width: 2,
      height: 2,
    })
    const renders2 = posted.filter((m) => m.type === 'render') as Array<
      Extract<CpuPreviewRequest, { type: 'render' }>
    >
    respond({
      type: 'rendered',
      sourceId: 's1',
      requestId: renders2[1].requestId,
      rgba: new Uint8ClampedArray(16),
      width: 2,
      height: 2,
    })
    respond({
      type: 'rendered',
      sourceId: 's1',
      requestId: renders[0].requestId,
      rgba: new Uint8ClampedArray(16),
      width: 2,
      height: 2,
    })
    expect(frames).toEqual([renders[0].requestId, renders2[1].requestId])
  })
})
