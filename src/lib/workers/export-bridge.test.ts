import type { ExportColorGraphDescriptor } from '@lumaforge/luma-color-runtime'
import { describe, expect, it, vi } from 'vitest'

import { ExportBridge } from './export-bridge'

const supportedGraph: ExportColorGraphDescriptor = {
  supported: true,
  outputGamut: 'srgb-rec709',
  outputTransfer: 'srgb',
  lutProfile: null,
  steps: [{ kind: 'input-linear-prophoto' }, { kind: 'output-srgb' }],
}

function createInput() {
  return {
    file: new File([], 'a.dng'),
    graph: supportedGraph,
  }
}

describe('exportBridge', () => {
  it('runs an export through the underlying client', async () => {
    const result = {
      kind: 'blob' as const,
      filename: 'a.jpg',
      blob: new Blob(),
      byteLength: 0,
      mimeType: 'image/jpeg',
    }
    const client = {
      run: vi.fn(async () => result),
      dispose: vi.fn(),
    }
    const bridge = new ExportBridge({ createClient: () => client })
    const signal = new AbortController().signal

    await expect(bridge.runExport(signal, createInput())).resolves.toBe(result)
    expect(client.run).toHaveBeenCalledWith({
      ...createInput(),
      signal,
    })
  })

  it('aborting the signal disposes the underlying client', async () => {
    const client = {
      run: vi.fn(
        (input: { signal?: AbortSignal }) =>
          new Promise<never>((_resolve, reject) => {
            input.signal?.addEventListener(
              'abort',
              () => reject(new DOMException('Aborted', 'AbortError')),
              { once: true },
            )
          }),
      ),
      dispose: vi.fn(),
    }
    const bridge = new ExportBridge({ createClient: () => client })
    const controller = new AbortController()
    const promise = bridge.runExport(controller.signal, createInput())

    await vi.waitFor(() => expect(client.run).toHaveBeenCalledTimes(1))
    controller.abort()

    await expect(promise).rejects.toThrow(/aborted/i)
    expect(client.dispose).toHaveBeenCalledTimes(1)
  })
})
