import { createWasmJpegRowSink } from './wasm-row-sink'

it('forwards row chunks to the JPEG runtime', async () => {
  const calls: string[] = []
  const sink = createWasmJpegRowSink({
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
  })

  const blob = await sink.encode({
    width: 1,
    height: 1,
    quality: 0.9,
    rows: [new Uint8Array([255, 255, 255])],
  })

  expect(blob.type).toBe('image/jpeg')
  expect(calls).toEqual(['rows', 'finish', 'dispose'])
})
