import { createWasmJpegRowSink } from './wasm-row-sink'

describe('createWasmJpegRowSink', () => {
  it('forwards row chunks to the JPEG runtime', async () => {
    const calls: string[] = []
    const sink = createWasmJpegRowSink(() => ({
      createEncoder() {
        return {
          async writeRows() {
            calls.push('rows')
          },
          async finish() {
            calls.push('finish')
            return new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], {
              type: 'image/jpeg',
            })
          },
          abort() {
            calls.push('abort')
          },
        }
      },
      dispose() {
        calls.push('dispose')
      },
    }))

    const session = sink.createSession({
      width: 1,
      height: 1,
      quality: 0.9,
    })

    await session.writeRows(new Uint8Array([255, 255, 255]), 1)
    const blob = await session.close()

    expect(blob.type).toBe('image/jpeg')
    expect(calls).toEqual(['rows', 'finish', 'dispose'])
  })

  it('creates a fresh runtime per session and aborts on encoder failure', async () => {
    const calls: string[] = []
    let runtimeCount = 0
    const sink = createWasmJpegRowSink(() => {
      const runtimeId = ++runtimeCount
      return {
        createEncoder() {
          return {
            async writeRows() {
              calls.push(`rows:${runtimeId}`)
              throw new Error('JPEG_RUNTIME_UNAVAILABLE')
            },
            async finish() {
              calls.push(`finish:${runtimeId}`)
              return new Blob()
            },
            abort() {
              calls.push(`abort:${runtimeId}`)
            },
          }
        },
        dispose() {
          calls.push(`dispose:${runtimeId}`)
        }
      }
    })

    const first = sink.createSession({ width: 1, height: 1, quality: 0.9 })
    const second = sink.createSession({ width: 1, height: 1, quality: 0.9 })

    await expect(first.writeRows(new Uint8Array([0, 0, 0]), 1)).rejects.toThrow(
      'JPEG_RUNTIME_UNAVAILABLE',
    )
    await second.abort()

    expect(runtimeCount).toBe(2)
    expect(calls).toEqual(['rows:1', 'abort:1', 'dispose:1', 'abort:2', 'dispose:2'])
  })

  it('disposes the runtime if encoder creation fails during session construction', () => {
    const calls: string[] = []
    const sink = createWasmJpegRowSink(() => ({
      createEncoder() {
        calls.push('createEncoder')
        throw new Error('JPEG_RUNTIME_UNAVAILABLE')
      },
      dispose() {
        calls.push('dispose')
      },
    }))

    expect(() =>
      sink.createSession({ width: 1, height: 1, quality: 0.9 }),
    ).toThrow('JPEG_RUNTIME_UNAVAILABLE')
    expect(calls).toEqual(['createEncoder', 'dispose'])
  })
})
